"""The synthetic bundle that the grader and the TypeScript rules are both held to (ARCHITECTURE section 8.5 rules 1 to 3).

`tests/fixtures/grader/sample.es.json.gz` is a bundle that the grader's own code wrote, for the sample lab of samples.py, with an invented machine and a
fixed grader identity (it is not a build of the grader that anyone published). It is synthetic: no machine ran it, and its notes say so.

    * This suite regenerates it in memory and requires the committed file to be that (test_fixture.py), so a change to the receipt, the bundle, the
      canonical form or the hashing that the file does not show is found here.
    * The TypeScript suite reads the committed file with the browser's own primitives (`DecompressionStream`, the zod schemas, `canonicalJson` and
      `crypto`) and requires rules 1 to 3 to pass, and the receipt's identity hash to be the one in `sample.expected.json` (tests/grader/bundle-fixture.test.ts).
Together they show that what the grader writes is what the site reads, with no Python at the TypeScript end and no TypeScript at this one.

Regenerate both files after a change that is meant to alter them, from the root of the repository:

    uv run --project labs/grader python -m labs.grader.tests.fixture
"""

from __future__ import annotations

import gzip
import json
import tempfile
from pathlib import Path
from typing import Any

from enginespace_grader.bundle import build_bundle, write_bundle
from enginespace_grader.challenge import parse_challenge
from enginespace_grader.hashing import sha256_hex
from enginespace_grader.identity import GraderIdentity
from enginespace_grader.labs import StageContext
from enginespace_grader.receipt import build_receipt, receipt_sha256

from . import samples
from .support import vectors_dir

#: Not the identity of a build that anyone published: the hash of a sentence, so that the fixture does not move whenever the package does.
IDENTITY = GraderIdentity("enginespace-grader", "0.0.0", sha256_hex(b"enginespace-grader test fixture: not a published build"))


def fixture_dir() -> Path:
    """tests/fixtures/grader of the repository that holds the vectors."""
    return vectors_dir().parents[1] / "tests" / "fixtures" / "grader"


def build() -> dict[str, Any]:
    """The bundle, as a document: the sample lab's stage, graded on the sample token at a fixed moment."""
    token = parse_challenge(samples.TOKEN)
    assert token is not None
    lab = samples.SampleLab()
    with tempfile.TemporaryDirectory(prefix="enginespace-fixture-") as scratch:
        result = lab.run(StageContext(challenge=token, stage=lab.stages["tr3.profile.s2"], workdir=Path(scratch)))
    receipt = build_receipt(
        challenge=token,
        created_at="2026-11-05T12:30:00Z",
        grader=IDENTITY,
        environment=samples.sample_environment(),
        pins=samples.sample_pins(),
        inputs=result.inputs,
        artifacts=[artifact.entry() for artifact in result.artifacts],
        checks=result.checks,
        provenance=samples.PROVENANCE,
        performance=result.performance,
        notes=result.notes,
        ext=result.ext,
    )
    return build_bundle(receipt, result.artifacts)


def expected(bundle: dict[str, Any]) -> dict[str, Any]:
    """What both languages must find in the file: the receipt's identity hash, and the artifacts that travel."""
    return {
        "receiptSha256": receipt_sha256(bundle["receipt"]),
        "artifactsInBundle": [entry["id"] for entry in bundle["receipt"]["artifacts"] if entry["inBundle"]],
        "artifactsKept": [entry["id"] for entry in bundle["receipt"]["artifacts"] if not entry["inBundle"]],
    }


def write(folder: Path) -> list[Path]:
    """Writes the bundle and its expectations into `folder`."""
    bundle = build()
    folder.mkdir(parents=True, exist_ok=True)
    stats = write_bundle(folder / "sample.es.json.gz", bundle)
    sidecar = folder / "sample.expected.json"
    sidecar.write_text(json.dumps(expected(bundle), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return [stats.path, sidecar]


def read_committed() -> tuple[dict[str, Any], dict[str, Any]]:
    """The committed bundle as a document, and its expectations."""
    folder = fixture_dir()
    with gzip.open(folder / "sample.es.json.gz", "rb") as packed:
        document: dict[str, Any] = json.loads(packed.read())
    sidecar: dict[str, Any] = json.loads((folder / "sample.expected.json").read_text(encoding="utf-8"))
    return document, sidecar


if __name__ == "__main__":
    for written in write(fixture_dir()):
        print(f"wrote {written.relative_to(vectors_dir().parents[1])}")
