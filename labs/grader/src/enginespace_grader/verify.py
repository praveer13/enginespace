"""`enginespace receipt verify <file>`: the browser's first three rules, run locally (ARCHITECTURE section 9.4 and section 8.5).

    1. Caps.       The file is at most 32 MB compressed and 256 MB once decompressed, counted while it is decompressed, so a zip bomb stops with a message.
    2. Schema.     bundle@1 and receipt@1, strictly: an unknown top-level field is refused, and `ext` is ignored. The challenge token is a good token.
    3. Integrity.  The SHA-256 of every artifact's canonical bytes, and its byte count, equal the receipt's entry. A failure names the artifact.

The rest of the rules need what a file cannot show about itself. Binding (rule 4) needs the ledger of the browser that issued the token; the grader's
identity (rule 5) needs the list of builds that the site published; the pins, the re-checks, the recomputation and the physics floors (rules 6 to 9)
and the verdict (rule 10) are the site's (`packages/verify`). A receipt that passes these three can still be refused there, and it is not signed: it
records what was reported, and the site checks that it follows from the raw records (ARCHITECTURE section 8.6).

The report follows the pattern of statespace's `receipt verify` (bench/statespace/receipt.py at 7b6938c): a list of findings, a line for each rule, and an
exit status of 0 when nothing failed, 1 when something did, and 2 for a file that cannot be read.
"""

from __future__ import annotations

import datetime as dt
import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .bundle import MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES, BundleReadError, bundle_problems, integrity_problems, read_bundle
from .challenge import TOKEN_LIFETIME_DAYS, parse_challenge
from .receipt import receipt_sha256

__all__ = ["Finding", "Verification", "render", "verify_document", "verify_file"]


@dataclass(frozen=True)
class Finding:
    """One line of the report. `rule` is the rule's name (`caps`, `schema`, `token`, `integrity`), and `level` is ok, fail or note."""

    rule: str
    level: str
    message: str


@dataclass
class Verification:
    """What `receipt verify` found in a file. The file is verified when no finding is a failure."""

    source: str
    findings: list[Finding] = field(default_factory=list[Finding])
    facts: dict[str, Any] = field(default_factory=dict[str, Any])

    @property
    def ok(self) -> bool:
        return not any(finding.level == "fail" for finding in self.findings)

    def add(self, rule: str, level: str, message: str) -> None:
        self.findings.append(Finding(rule, level, message))

    def failures(self) -> list[Finding]:
        return [finding for finding in self.findings if finding.level == "fail"]

    def as_json(self) -> dict[str, Any]:
        return {
            "file": self.source,
            "verified": self.ok,
            "facts": self.facts,
            "findings": [{"rule": f.rule, "level": f.level, "message": f.message} for f in self.findings],
        }


RULES = {"caps": "rule 1  caps", "schema": "rule 2  schema", "token": "token", "integrity": "rule 3  integrity"}


def verify_document(document: Any, result: Verification) -> None:
    """Rules 2 and 3 on a parsed bundle, and the token. Rule 1 has already been applied to the file it came from."""
    problems = bundle_problems(document)
    if problems:
        for problem in problems:
            result.add("schema", "fail", problem)
        result.add("integrity", "note", "not checked: the bundle is not a bundle@1 (rule 2), so its artifacts cannot be listed")
        return
    receipt = document["receipt"]
    result.add("schema", "ok", "bundle@1 and receipt@1: every field is the schema's, and no other")
    result.facts.update({"lab": receipt["lab"], "stage": receipt["stage"], "receiptSha256": receipt_sha256(receipt), "grader": receipt["grader"]})

    token = parse_challenge(receipt["challenge"]["token"])
    if token is not None:
        result.add("token", "ok", f"{token.stage}, seed {token.seed:#010x}, issued {token.issued_on}; its checksum, date and parts agree")
        days = (dt.date.fromisoformat(receipt["createdAt"][:10]) - token.issued_date).days
        if days < 0:
            result.add("token", "note", f"the receipt is dated {receipt['createdAt']}, before the token was issued on {token.issued_on}: one of the two clocks is wrong")
        elif days > TOKEN_LIFETIME_DAYS:
            result.add(
                "token",
                "note",
                f"the receipt is dated {days} days after the token was issued on {token.issued_on}; a token lasts {TOKEN_LIFETIME_DAYS} days [estimated], and the site refuses an expired one",
            )

    problems = integrity_problems(document)
    for problem in problems:
        result.add("integrity", "fail", problem)
    travelling = sum(1 for entry in receipt["artifacts"] if entry["inBundle"])
    kept = len(receipt["artifacts"]) - travelling
    result.facts["artifacts"] = {"inBundle": travelling, "kept": kept}
    if not problems:
        suffix = f"; {kept} {'stays' if kept == 1 else 'stay'} with the learner, listed by hash and size only" if kept else ""
        result.add("integrity", "ok", f"{travelling} artifact{'' if travelling == 1 else 's'} hashed over canonical bytes, and each equals the receipt's entry{suffix}")


def verify_file(path: Path) -> Verification:
    """Reads one file and applies rules 1 to 3. Raises `OSError` for a file that cannot be read at all."""
    path = Path(path)
    result = Verification(str(path))
    try:
        read = read_bundle(path)
    except BundleReadError as error:
        result.add("caps" if error.rule == 1 else "schema", "fail", str(error))
        if error.rule == 1:
            result.add("schema", "note", "not checked: the file was not read")
        result.add("integrity", "note", "not checked: the file was not read")
        return result
    result.facts["compressedBytes"] = read.compressed_bytes
    result.facts["decompressedBytes"] = read.decompressed_bytes
    result.add(
        "caps",
        "ok",
        f"{read.compressed_bytes:,} bytes compressed (at most {MAX_COMPRESSED_BYTES:,}), {read.decompressed_bytes:,} bytes inside (at most {MAX_DECOMPRESSED_BYTES:,}) [estimated caps]",
    )
    verify_document(read.document, result)
    return result


def render(result: Verification) -> str:
    """The report for one file: a line for each finding, then the verdict."""
    lines = [result.source]
    for finding in result.findings:
        label = RULES[finding.rule]
        mark = {"ok": "ok  ", "fail": "FAIL", "note": "note"}[finding.level]
        lines.append(f"  {label:<17} {mark}  {finding.message}")
    if "receiptSha256" in result.facts:
        lines.append(f"  receipt id        {result.facts['receiptSha256']}")
    failures = result.failures()
    if failures:
        lines.append(f"NOT VERIFIED: {len(failures)} problem{'' if len(failures) == 1 else 's'}. The site would refuse this file: each FAIL line names the rule that it breaks.")
    else:
        lines.append(
            "verified: rules 1 to 3 pass. The site also checks the challenge against its ledger, the grader's identity, the pins and every number from the raw records (rules 4 to 10); "
            "a receipt is not signed, and records what was reported."
        )
    return "\n".join(lines) + "\n"


def main(files: Sequence[str], as_json: bool = False) -> int:
    """Verifies each file and prints the reports. 0 when every file verified, 1 when one did not, 2 when one could not be read."""
    import sys

    results: list[Verification] = []
    status = 0
    for name in files:
        try:
            results.append(verify_file(Path(name)))
        except OSError as error:
            sys.stderr.write(f"enginespace receipt verify: {name}: {error.strerror or error}\n")
            status = 2
    if as_json:
        sys.stdout.write(json.dumps([result.as_json() for result in results], indent=2, ensure_ascii=False) + "\n")
    else:
        sys.stdout.write("".join(render(result) for result in results))
    if status == 2:
        return 2
    return 0 if all(result.ok for result in results) else 1
