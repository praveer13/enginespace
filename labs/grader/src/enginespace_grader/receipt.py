"""The receipt (ARCHITECTURE section 9.6): built from a stage's results, and checked as the site checks it.

`enginespace/receipt@1` is defined once, by the zod schema in packages/schema/receipt.ts, and exported to JSON Schema (D-030). This module builds a
receipt in that shape and validates one against the packaged export. JSON Schema cannot say a few things, and the zod schema's `superRefine` says
them, so `receipt_rule_problems` says them again:
  - `lab` is the stage's lab, the challenge's token names this stage, and the token is a good one whose parts the challenge object repeats;
  - the ids of the artifacts differ, and so do the names of the inputs, the ids of the checks, the names of the libraries and the `offPin` entries;
  - `pins.onPin` is true exactly when `pins.offPin` is empty;
  - `createdAt` is a moment that exists;
  - the receipt has a canonical form, which is the text its hash is taken over: no number beyond 2**53 or without a JSON form, and no lone surrogate.
The verdict is not in the receipt. The site computes it at read time from the receipt and the raw artifacts (A§8.5 rule 10).
"""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Mapping, Sequence
from typing import Any

from .canonical import CanonicalError, canonical_bytes
from .challenge import Challenge, challenge_object_problems, is_calendar_day, parse_challenge
from .hashing import sha256_hex
from .identity import GraderIdentity
from .schemas import load_schema, pointer, schema_problems

__all__ = [
    "RECEIPT_SCHEMA_TAG",
    "build_receipt",
    "enum_values",
    "lab_of_stage",
    "make_check",
    "make_input",
    "receipt_problems",
    "receipt_rule_problems",
    "receipt_sha256",
    "utc_instant",
]

#: The `schema` of every receipt.
RECEIPT_SCHEMA_TAG = "enginespace/receipt@1"

_INSTANT = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,9})?Z")


def lab_of_stage(stage: str) -> str:
    """The lab a stage belongs to: `tr8.replay.s2` is a stage of `tr8.replay`."""
    return stage[: stage.rindex(".")]


def utc_instant(when: dt.datetime | None = None) -> str:
    """A moment as the receipt writes it: UTC, to the second, with a `Z` and never an offset, so that two receipts of one moment read alike."""
    moment = when if when is not None else dt.datetime.now(dt.timezone.utc)
    if moment.tzinfo is None:
        raise ValueError("a receipt's time is in UTC: give the moment a time zone")
    return moment.astimezone(dt.timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def enum_values(*path: str) -> tuple[str, ...]:
    """The values that the receipt schema allows at a place, such as `enum_values('provenance', 'assisted')`: the one list, so no copy of it can drift."""
    node: Any = load_schema("receipt")
    for key in path:
        node = node["properties"][key]
    return tuple(node["enum"])


def make_check(
    check_id: str,
    kind: str,
    passed: bool,
    *,
    value: float | None = None,
    bound: float | None = None,
    tolerance: float | None = None,
    n: int | None = None,
    detail: str = "",
    ref_sha256: str | None = None,
) -> dict[str, Any]:
    """One entry of the receipt's `checks`: the grader's result. The site re-checks every one it can and shows the rest as attested by this grader."""
    entry: dict[str, Any] = {"id": check_id, "kind": kind, "pass": passed}
    for key, field in (("value", value), ("bound", bound), ("tolerance", tolerance), ("n", n)):
        if field is not None:
            entry[key] = field
    entry["detail"] = detail
    if ref_sha256 is not None:
        entry["refSha256"] = ref_sha256
    return entry


def make_input(name: str, kind: str, sha256: str, size: int, *, revision: str | None = None) -> dict[str, Any]:
    """One entry of the receipt's `inputs`: a model, a dataset, a prompt set or a reference, by its hash and size."""
    entry: dict[str, Any] = {"name": name, "kind": kind}
    if revision is not None:
        entry["revision"] = revision
    entry["sha256"] = sha256
    entry["bytes"] = size
    return entry


def build_receipt(
    *,
    challenge: Challenge,
    created_at: str,
    grader: GraderIdentity,
    environment: Mapping[str, Any],
    pins: Mapping[str, Any],
    inputs: Sequence[Mapping[str, Any]],
    artifacts: Sequence[Mapping[str, Any]],
    checks: Sequence[Mapping[str, Any]],
    provenance: Mapping[str, Any],
    performance: Mapping[str, Any] | None = None,
    notes: str | None = None,
    ext: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """A receipt@1 from its parts, with its keys in the order of the schema. The caller validates it (`receipt_problems`) before it is written."""
    receipt: dict[str, Any] = {
        "schema": RECEIPT_SCHEMA_TAG,
        "lab": challenge.lab,
        "stage": challenge.stage,
        "challenge": challenge.as_object(),
        "createdAt": created_at,
        "grader": grader.as_object(),
        "environment": dict(environment),
        "pins": dict(pins),
        "inputs": [dict(entry) for entry in inputs],
        "artifacts": [dict(entry) for entry in artifacts],
        "checks": [dict(entry) for entry in checks],
    }
    if performance is not None:
        receipt["performance"] = dict(performance)
    receipt["provenance"] = dict(provenance)
    if notes is not None:
        receipt["notes"] = notes
    if ext is not None:
        receipt["ext"] = dict(ext)
    return receipt


def _repeats(entries: Any, key: str) -> list[tuple[str, int]]:
    """The names in a list of objects that repeat, each once, with the place of its second copy."""
    seen: set[str] = set()
    found: list[tuple[str, int]] = []
    for index, entry in enumerate(entries):
        name = entry[key] if isinstance(entry, Mapping) and isinstance(entry.get(key), str) else None
        if name is None:
            continue
        if name in seen:
            found.append((name, index))
        seen.add(name)
    return found


def receipt_rule_problems(receipt: Mapping[str, Any]) -> list[str]:
    """What the zod schema checks beyond JSON Schema, for a receipt whose shape the schema has already accepted."""
    problems: list[str] = []

    def add(place: str, message: str) -> None:
        problems.append(f"{place}: {message}")

    stage, lab = receipt["stage"], receipt["lab"]
    if lab_of_stage(stage) != lab:
        add("/lab", f"must be the lab of the stage, {lab_of_stage(stage)}")
    for message in challenge_object_problems(receipt["challenge"]):
        add("/challenge", message)
    token = parse_challenge(receipt["challenge"]["token"])
    if token is not None and token.stage != stage:
        add("/challenge/token", f"names stage {token.stage}, and the receipt is of {stage}")
    created = _INSTANT.fullmatch(receipt["createdAt"])
    if created is None or not (
        is_calendar_day(int(receipt["createdAt"][:4]), int(receipt["createdAt"][5:7]), int(receipt["createdAt"][8:10]))
        and int(created[1]) <= 23
        and int(created[2]) <= 59
        and int(created[3]) <= 59
    ):
        add("/createdAt", "must be a moment that exists")
    for name, index in _repeats(receipt["artifacts"], "id"):
        add(f"/artifacts/{index}/id", f'artifact "{name}" is listed twice')
    for name, index in _repeats(receipt["inputs"], "name"):
        add(f"/inputs/{index}/name", f'input "{name}" is listed twice')
    for name, index in _repeats(receipt["checks"], "id"):
        add(f"/checks/{index}/id", f'check "{name}" is listed twice')
    for name, index in _repeats(receipt["environment"]["libs"], "name"):
        add(f"/environment/libs/{index}/name", f'library "{name}" is listed twice')
    off_pin = receipt["pins"]["offPin"]
    seen: set[str] = set()
    for index, name in enumerate(off_pin):
        if name in seen:
            add(f"/pins/offPin/{index}", f'"{name}" is listed twice')
        seen.add(name)
    if receipt["pins"]["onPin"] != (len(off_pin) == 0):
        add("/pins/onPin", "must be true exactly when offPin is empty")
    # The receipt's hash is of its canonical text, so a receipt with none cannot be identified: a number beyond 2**53 or without a JSON form
    # anywhere in it (a check's value, the `claimed` summary, `ext`), and a string or key with a lone surrogate.
    try:
        canonical_bytes(receipt)
    except CanonicalError as error:
        add(pointer(error.parts), error.reason)
    return problems


def receipt_problems(receipt: Any) -> list[str]:
    """Everything that is wrong with `receipt` as a receipt@1: what the schema says, and then, if the shape is right, what only the rules say."""
    problems = schema_problems("receipt", receipt)
    if problems:
        return problems
    return receipt_rule_problems(receipt)


def receipt_sha256(receipt: Mapping[str, Any]) -> str:
    """The identity of a receipt: the SHA-256 of its canonical JSON, which is the `/receipts#<sha256>` fragment and the ledger's `receiptSha256` (ASSESSMENT section 5.5)."""
    return sha256_hex(canonical_bytes(receipt))
