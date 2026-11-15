"""`enginespace grade <lab>.<stage> --challenge <token>` (ARCHITECTURE section 9.4, ASSESSMENT section 5.2): the flow that ends in a receipt bundle.

    1. Decode the token. It must be a token (its checksum, date and parts), for the stage that was asked for.
    2. Find the lab, and its stage.
    3. Run the stage on the seeds that the token derives (the lab's `run`), in a scratch folder that is removed afterwards.
    4. Check that the stage reported the checks it declares.
    5. Build the receipt: the challenge, the grader's identity, the fingerprint, the pins, the inputs, the artifacts (hashed over their canonical bytes), the
       checks and the learner's provenance.
    6. Look for what the machine knows about itself in the free text a lab supplied (check details, notes, input names, `ext`, the text and JSON artifacts), and stop
       when there is any. Check the bundle as the site will (schema, the rules JSON Schema cannot say, integrity), and write it, gzipped, to
       `<out>/<lab>-<stage>-<utc>.es.json.gz`. A bundle that the site would refuse is not written.

The grader sends nothing anywhere: the learner moves the file to the browser by hand. A receipt is written when the stage ran, whether its checks passed
or not, because the site shows a failed check with its reason, and the learner learns from that.
"""

from __future__ import annotations

import datetime as dt
import os
import sys
import tempfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .bundle import Artifact, BundleStats, build_bundle, write_bundle
from .challenge import TOKEN_LIFETIME_DAYS, age_in_days, check_challenge
from .engine_config import read_engine_config
from .errors import GraderError
from .identity import identity
from .labs import Lab, StageContext
from .receipt import build_receipt, enum_values, make_check, receipt_problems, utc_instant
from .redact import Sensitive, find_leaks

__all__ = ["GradeOutcome", "leaks_in", "local_pins", "receipt_path", "resolve_provenance", "run_stage"]


def resolve_provenance(assisted: str | None, agent: str | None, environ: Mapping[str, str] | None = None) -> tuple[dict[str, Any], list[str]]:
    """The receipt's provenance block, and a note for anything that was not declared.

    Provenance is self-reported, the honour-system rule that statespace's `check` follows (bench/statespace/check/runner.py at 7b6938c): `--assisted
    none|explain|code` and `--agent yes|no`, or the variables ENGINESPACE_ASSISTED and ENGINESPACE_AGENT. When nothing is declared the receipt records the
    most help, `assisted: code` and `agent: true`, because a declaration that is unsure should declare more help and not less. The guard is on unless the agent
    kit's own switch is off (`ES_SOLO=0`, labs/agent-kit/hooks/es-guard.sh). `assisted: code` or `agent: true` makes the site score the receipt as
    `assisted` and not `gpu-verified` (ASSESSMENT section 3.2), and it is never a penalty: it changes a weight.
    """
    env = os.environ if environ is None else environ
    levels = enum_values("provenance", "assisted")
    said_assisted = assisted or (env.get("ENGINESPACE_ASSISTED") or "").strip().lower() or None
    said_agent = agent or (env.get("ENGINESPACE_AGENT") or "").strip().lower() or None
    if said_assisted is not None and said_assisted not in levels:
        raise GraderError(f"assisted is {', '.join(levels[:-1])} or {levels[-1]}, not {said_assisted!r}")
    if said_agent is not None and said_agent not in ("yes", "no"):
        raise GraderError(f"agent is yes or no, not {said_agent!r}")
    notes: list[str] = []
    undeclared = [name for name, value in (("assisted", said_assisted), ("agent", said_agent)) if value is None]
    if undeclared:
        notes.append(
            f"provenance: {' and '.join(undeclared)} not declared, so the receipt records the most help (assisted: code, agent: true); "
            f"declare it with --assisted {'|'.join(levels)} and --agent yes|no, or ENGINESPACE_ASSISTED and ENGINESPACE_AGENT"
        )
    guard = "off" if (env.get("ES_SOLO") or "").strip() == "0" else "on"
    return {"assisted": said_assisted or "code", "agent": (said_agent or "yes") == "yes", "guard": guard}, notes


def local_pins(lab: Lab) -> dict[str, Any]:
    """The receipt's `pins` for this machine: the hashes of the course lock and the environment's lock, and whether the engine and libraries are on them.

    pins.py reads `course.lock.json` and the environment's `uv.lock` and compares the installed distributions with them (W2-T04). Where it cannot find the lock it stops,
    because a receipt that claimed to be on the pins without checking would be a lie.
    """
    from . import pins

    return pins.local_pins(lab)


def receipt_path(out_dir: Path, lab_id: str, stage_id: str, moment: dt.datetime) -> Path:
    """Where a stage's bundle goes: `<out>/<lab>-<stage>-<utc>.es.json.gz`, such as `tr8.replay-s2-20261109T120000Z.es.json.gz`. A name that is taken gets `-2`, `-3` and so on."""
    when = moment.astimezone(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = f"{lab_id}-{stage_id[len(lab_id) + 1 :]}-{when}"
    path = Path(out_dir) / f"{base}.es.json.gz"
    number = 1
    while path.exists():
        number += 1
        path = Path(out_dir) / f"{base}-{number}.es.json.gz"
    return path


@dataclass(frozen=True)
class GradeOutcome:
    """What a graded stage made."""

    path: Path
    receipt: dict[str, Any]
    stats: BundleStats

    @property
    def failed_checks(self) -> list[dict[str, Any]]:
        return [check for check in self.receipt["checks"] if not check["pass"]]

    @property
    def passed(self) -> bool:
        return not self.failed_checks


def leaks_in(receipt: Mapping[str, Any], artifacts: Sequence[Artifact], sensitive: Sensitive | None = None) -> list[str]:
    """Where the free text of a receipt and its artifacts still holds the machine's host name, user name, folder or a secret: JSON Pointers, never the text.

    The fingerprint was looked over when it was made (fingerprint.py), so `environment` is left out here, apart from the engine configuration that was read from a log
    afterwards. What a lab supplies is not fixed in shape: the details of its checks, its notes, the names of its inputs, `ext` and `claimed`, and the data of an artifact
    that is text or JSON. A pointer into an artifact starts with `/artifacts/<id>`, which is a place in the bundle and not of the receipt.
    """
    known = Sensitive.from_machine() if sensitive is None else sensitive
    found = find_leaks({key: value for key, value in receipt.items() if key != "environment"}, known)
    config = (receipt.get("environment") or {}).get("engineConfig")
    if config is not None:
        found += [f"/environment/engineConfig{place}" if place != "/" else "/environment/engineConfig" for place in find_leaks(config, known)]
    for artifact in artifacts:
        if not artifact.in_bundle or artifact.data is None or artifact.encoding not in ("json", "text"):
            continue
        found += [f"/artifacts/{artifact.id}{'' if place == '/' else place}" for place in find_leaks(artifact.data, known)]
    return found


def run_stage(
    lab: Lab,
    stage_id: str,
    token: str,
    *,
    out_dir: Path,
    environment: Mapping[str, Any],
    pins: Mapping[str, Any],
    provenance: Mapping[str, Any],
    notes: str | None = None,
    now: Callable[[], dt.datetime] | None = None,
    log: Callable[[str], None] | None = None,
    sensitive: Sensitive | None = None,
) -> GradeOutcome:
    """Grades one stage of `lab` on the challenge `token`, and writes its bundle under `out_dir`. Raises a `GraderError` for anything the learner can act on."""
    say = log if log is not None else (lambda message: sys.stderr.write(message + "\n"))
    clock = now if now is not None else (lambda: dt.datetime.now(dt.timezone.utc))

    checked = check_challenge(token.strip())
    challenge = checked.challenge
    if challenge is None:
        raise GraderError(f"that is not a challenge token: it {checked.message}. Copy it again from the Receipts page, whole, with nothing around it")
    if challenge.stage != stage_id:
        raise GraderError(f"the token is for stage {challenge.stage}, and you asked to grade {stage_id}. Get a token for {stage_id} on the Receipts page")
    if challenge.lab != lab.id:
        raise GraderError(f"{stage_id} is a stage of {challenge.lab}, and the lab given is {lab.id}")
    stage = lab.stages.get(stage_id)
    if stage is None:
        raise GraderError(f"{lab.id} has no stage {stage_id}; its stages are {', '.join(sorted(lab.stages))}")

    age = age_in_days(challenge, clock().astimezone(dt.timezone.utc).date())
    if age > TOKEN_LIFETIME_DAYS:
        say(
            f"warning: this token was issued {age} days ago, and a token lasts {TOKEN_LIFETIME_DAYS} days [estimated]. "
            "The site will refuse the receipt as expired; get a new token on the Receipts page before you spend a run on this one."
        )
    elif age < 0:
        say(f"warning: this token says it was issued on {challenge.issued_on}, which is in the future by this machine's clock. Check the clock; the site's decides.")

    with tempfile.TemporaryDirectory(prefix="enginespace-") as scratch:
        say(f"grading {stage_id} on seed {challenge.seed:#010x}")
        result = lab.run(StageContext(challenge=challenge, stage=stage, workdir=Path(scratch), log=say))

    reported = {check["id"] for check in result.checks}
    missing = [name for name in stage.checks if name not in reported]
    if missing:
        raise GraderError(f"{lab.id} did not report the check{'s' if len(missing) > 1 else ''} {', '.join(missing)}, which {stage_id} must report. This is a fault in the lab, not in your work")

    # An engine lab hands over its engine's log: the effective configuration is read from it and recorded, and one check says whether all six fields were found.
    # A reading with a field missing is no reason to lose a run, so the receipt is written without `engineConfig` and the check fails with what was not found.
    environment = dict(environment)
    checks = list(result.checks)
    if result.engine_run is not None:
        reading = read_engine_config(result.engine_run, lab.environment)
        if reading.config is not None:
            environment["engineConfig"] = reading.config
        checks.append(make_check("engine-config", "environment", reading.ok, detail=reading.detail()))

    moment = clock().astimezone(dt.timezone.utc)
    all_notes = "\n".join(text for text in (result.notes, notes) if text) or None
    try:
        receipt = build_receipt(
            challenge=challenge,
            created_at=utc_instant(moment),
            grader=identity(),
            environment=environment,
            pins=pins,
            inputs=result.inputs,
            artifacts=[artifact.entry() for artifact in result.artifacts],
            checks=checks,
            provenance=provenance,
            performance=result.performance,
            notes=all_notes,
            ext=result.ext,
        )
    except ValueError as error:
        raise GraderError(f"{lab.id} made an artifact that cannot be hashed: {error}") from None
    problems = receipt_problems(receipt)
    if problems:
        raise GraderError("the receipt would not pass the site's schema, and was not written:\n  " + "\n  ".join(problems))
    leaks = leaks_in(receipt, result.artifacts, sensitive)
    if leaks:
        shown = ", ".join(leaks[:6]) + (f" and {len(leaks) - 6} more" if len(leaks) > 6 else "")
        raise GraderError(
            f"{lab.id} supplied text that holds this machine's host name, user name, a folder of it or a secret, at {shown}, and the bundle was not written: "
            "a receipt never holds one (ARCHITECTURE section 9.5). This is a fault in the lab, not in your work"
        )
    bundle = build_bundle(receipt, result.artifacts)
    path = receipt_path(Path(out_dir), lab.id, stage_id, moment)
    stats = write_bundle(path, bundle)
    return GradeOutcome(path=path, receipt=receipt, stats=stats)
