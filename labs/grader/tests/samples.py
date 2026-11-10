"""A synthetic lab, receipt and bundle for the tests. No machine ran them: every value is invented, and the receipt's notes say so.

The hashes are real, though: each artifact's SHA-256 is of its canonical bytes, so a test of integrity has an honest bundle to start from. The host is
described as nothing in particular (a kind, an invented operating system and an invented processor), as the schema allows no field that could hold a
host name, a user name or an address (ARCHITECTURE section 9.5).
"""

from __future__ import annotations

import copy
import datetime as dt
import gzip
import json
import tempfile
from pathlib import Path
from typing import Any, ClassVar

from enginespace_grader.bundle import Artifact
from enginespace_grader.challenge import format_challenge
from enginespace_grader.grade import run_stage
from enginespace_grader.hashing import sha256_hex
from enginespace_grader.labs import Lab, Stage, StageContext, StageResult
from enginespace_grader.receipt import make_check, make_input

TOKEN = format_challenge("tr3.profile.s2", 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104")
#: A moment a day after the token was issued, in UTC.
NOW = dt.datetime(2026, 11, 5, 12, 30, 0, tzinfo=dt.timezone.utc)


def sample_environment() -> dict[str, Any]:
    """An invented machine: an RTX-class GPU that does not exist, on an operating system that does not exist."""
    return {
        "host": {"kind": "other", "os": "Example Linux 1.0", "kernel": "6.0.0-example", "arch": "x86_64", "cpu": "Example CPU", "cores": 16, "ramBytes": 68719476736, "container": True},
        "gpus": [
            {
                "name": "Example GPU 24GB",
                "memoryBytes": 25769803776,
                "computeCapability": "8.9",
                "smCount": 128,
                "maxSmClockMhz": 2520,
                "maxMemClockMhz": 10501,
                "powerLimitMw": 450000,
                "pcieGen": 4,
                "pcieWidth": 16,
                "mig": "unsupported",
                "ecc": "disabled",
                "virtualization": "none",
            }
        ],
        "driver": {"version": "580.82.07", "cudaVersion": "13.0"},
        "python": "3.12.7",
        "torch": {"version": "2.14.0", "cuda": "13.0", "cudnn": "9.10.2"},
        "engine": {"name": "vllm", "version": "0.33.0", "commit": "4ba787ec9959e566d3b587a796dff07673324da5", "recordSha256": sha256_hex(b"example RECORD")},
        "engineConfig": {"runner": "MRV2", "graphMode": "FULL_AND_PIECEWISE", "asyncScheduling": True, "attentionBackend": "FLASH_ATTN", "maxNumBatchedTokens": 8192, "maxNumSeqs": 256},
        "libs": [{"name": "flashinfer-python", "version": "0.7.2.post1"}, {"name": "triton", "version": "3.4.0"}],
        "envVars": {"VLLM_LOGGING_LEVEL": "INFO"},
    }


def sample_pins() -> dict[str, Any]:
    return {"lockSha256": sha256_hex(b"example course.lock.json"), "envLockSha256": sha256_hex(b"example uv.lock"), "onPin": True, "offPin": []}


PROVENANCE = {"assisted": "none", "agent": False, "guard": "on"}

TRACE = {
    "schema": "enginespace/trace@1",
    "meta": {"source": "synthetic", "synthetic": True},
    "strings": ["step", "kernel"],
    "tracks": [{"id": 0, "kind": "gpu-stream", "name": 1}],
    "spans": {"track": [0, 0], "startNs": [0, 1500], "durNs": [1000, 250], "name": [1, 1], "cat": [1, 1], "corr": [-1, -1]},
    "flows": [],
    "marks": [{"tNs": 0, "name": 0}],
}
LOG = "server started\r\nready: caf" + chr(0xE9) + "\n"


class SampleLab(Lab):
    """A lab of two stages that every test can grade. Its second stage reports a failing check."""

    id: ClassVar[str] = "tr3.profile"
    title: ClassVar[str] = "A synthetic profile lab"
    environment: ClassVar[str] = "vllm"
    stages: ClassVar[dict[str, Stage]] = {
        "tr3.profile.s2": Stage("tr3.profile.s2", "Profile", checks=("agreement", "runner")),
        "tr3.profile.s3": Stage("tr3.profile.s3", "Attribute", checks=("partition",)),
    }

    def __init__(self, fail: bool = False, forget: str | None = None) -> None:
        self.fail = fail
        self.forget = forget
        self.seen: list[tuple[str, int, list[int]]] = []

    def run(self, context: StageContext) -> StageResult:
        draws = context.rng("workload/prompt")
        first = [draws() for _ in range(3)]
        self.seen.append((context.stage.id, context.seed, first))
        checks = [
            make_check("agreement", "correctness", not self.fail, value=0.995 if not self.fail else 0.2, bound=0.99, n=200, detail="teacher-forced agreement over 200 positions"),
            make_check("runner", "environment", True, detail="MRV2 ran"),
        ]
        if context.stage.id == "tr3.profile.s3":
            checks = [make_check("partition", "property", True, tolerance=0, detail="")]
        return StageResult(
            inputs=[make_input("prompts", "prompts", sha256_hex(b"example prompts"), 4096)],
            artifacts=[
                Artifact.from_json("trace", "trace", "enginespace/trace@1", TRACE),
                Artifact.from_text("log", "log", "text/plain", LOG),
                Artifact.kept("capture", "report", "binary", sha256_hex(b"example capture"), 987_654_321),
            ],
            checks=[check for check in checks if check["id"] != self.forget],
            performance={"kind": "trace", "claimed": {"steps": 2, "gpuBusyNs": 1250}},
            notes="Synthetic: made by labs/grader/tests/samples.py. No machine ran it.",
            ext={"example": True},
        )


def graded(directory: Path, lab: SampleLab | None = None, stage: str = "tr3.profile.s2") -> Path:
    """Grades the sample lab into `directory` and returns the path of the bundle."""
    outcome = run_stage(
        lab or SampleLab(),
        stage,
        format_challenge(stage, 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104"),
        out_dir=directory,
        environment=sample_environment(),
        pins=sample_pins(),
        provenance=PROVENANCE,
        now=lambda: NOW,
        log=lambda message: None,
    )
    return outcome.path


def sample_bundle() -> dict[str, Any]:
    """A bundle that passes every check, as a plain dict that a test can change."""
    with tempfile.TemporaryDirectory(prefix="enginespace-test-") as folder:
        with gzip.open(graded(Path(folder)), "rb") as packed:
            document: dict[str, Any] = json.loads(packed.read())
    return copy.deepcopy(document)


def write_gz(path: Path, document: Any) -> Path:
    """Writes a JSON document as a gzip file, as `enginespace grade` would, so that a test can hand `verify` a bundle it has changed."""
    path.write_bytes(gzip.compress(json.dumps(document, ensure_ascii=False).encode("utf-8"), mtime=0))
    return path
