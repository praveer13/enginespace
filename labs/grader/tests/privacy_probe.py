"""Run by test_privacy.py in a subprocess whose environment is full of invented personal values (host name, user name, GPU UUID and serial number, paths, tokens).

It does what `enginespace grade` does with them, as far as a machine without a real lab can: it gathers the fingerprint for a lab that allowlists some variables, scrubs an
engine's log as a lab does before it keeps the log as an artifact, grades a stage of an engine lab on those, and prints what came out as JSON: the environment, the notes,
the scrubbed log and the text of the bundle that was written. The test then looks for the invented values in all of it.
"""

from __future__ import annotations

import datetime as dt
import gzip
import json
import sys
import tempfile
from pathlib import Path

from enginespace_grader import fingerprint, redact
from enginespace_grader.bundle import Artifact
from enginespace_grader.challenge import format_challenge
from enginespace_grader.engine_config import EngineRun
from enginespace_grader.grade import run_stage
from enginespace_grader.hashing import sha256_hex
from enginespace_grader.labs import Lab, Stage, StageContext, StageResult
from enginespace_grader.receipt import make_check

ALLOW = ("VLLM_LOGGING_LEVEL", "VLLM_USE_V2_MODEL_RUNNER", "VLLM_CACHE_ROOT", "VLLM_HOST_IP", "VLLM_API_KEY", "SGLANG_NOT_SET")


def main(log_path: str, dump_path: str) -> None:
    log = Path(log_path).read_text(encoding="utf-8")
    dump = json.loads(Path(dump_path).read_text(encoding="utf-8"))

    class ProbeLab(Lab):
        id = "tr3.profile"
        title = "A lab for the privacy test"
        environment = "vllm"
        env_allowlist = ALLOW
        stages = {"tr3.profile.s2": Stage("tr3.profile.s2", "Probe", checks=("probe",))}

        def run(self, context: StageContext) -> StageResult:
            cleaned = redact.scrub_text(log)[0]
            return StageResult(
                artifacts=[Artifact.from_text("engine-log", "log", "text/plain", cleaned)],
                checks=[make_check("probe", "property", True, detail="")],
                notes="Synthetic: made by labs/grader/tests/privacy_probe.py. No machine ran it.",
                engine_run=EngineRun(log=log, config_dump=dump),
            )

    lab = ProbeLab()
    found = fingerprint.gather("other", engine=fingerprint.engine_for(lab.environment), env_allow=lab.env_allowlist)
    with tempfile.TemporaryDirectory(prefix="enginespace-probe-") as folder:
        outcome = run_stage(
            lab,
            "tr3.profile.s2",
            format_challenge("tr3.profile.s2", 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104"),
            out_dir=Path(folder),
            environment=found.environment,
            pins={"lockSha256": sha256_hex(b"a"), "envLockSha256": sha256_hex(b"b"), "onPin": True, "offPin": []},
            provenance={"assisted": "none", "agent": False, "guard": "on"},
            now=lambda: dt.datetime(2026, 11, 5, 12, 30, 0, tzinfo=dt.timezone.utc),
            log=lambda message: None,
        )
        with gzip.open(outcome.path, "rb") as packed:
            bundle = packed.read().decode("utf-8")
    sys.stdout.write(json.dumps({"environment": found.environment, "notes": list(found.notes), "cleaned_log": redact.scrub_text(log)[0], "bundle": bundle}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
