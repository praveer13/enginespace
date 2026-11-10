"""`enginespace selftest [--gpu]` (ARCHITECTURE section 9.4): the grader's own tests.

Two kinds run. The built-in checks need nothing but this installation: known answers of the cross-language contract (the seeded generator, the challenge
token, canonical JSON, SHA-256), the packaged schemas, and a whole stage graded on a synthetic lab in a scratch folder, written, verified, and then
refused when one artifact's hash is changed. Then, where the grader's `tests/` folder sits beside the package (a checkout of the repository, or the kit),
its unittest suite runs too. A wheel carries the package only, so there the built-in checks are what runs, and the command says so.

`--gpu` is the GPU smoke that the owner runs at each re-pin (W2-T12). No GPU lab exists yet, so it stops with a message instead of passing: a smoke that
checked nothing and said "passed" would be worse than none.

The synthetic lab is `tr0.selftest`. No lab of the course has that id, so no token that the site issues names it, and a bundle it writes is a file in a
scratch folder that is removed when the command ends.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import importlib.util
import json
import sys
import tempfile
import unittest
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any, ClassVar

from . import fingerprint
from .bundle import Artifact
from .canonical import canonical_json
from .challenge import format_challenge, parse_challenge
from .errors import GraderError
from .grade import run_stage
from .hashing import sha256_hex
from .identity import identity
from .labs import Lab, Stage, StageContext, StageResult
from .receipt import make_check, make_input
from .rng import hash32, rng_for, splitmix32u
from .schemas import SCHEMA_NAMES, validator
from .verify import verify_file

__all__ = ["SelfTestLab", "builtin_checks", "main"]


class SelfTestLab(Lab):
    """A lab that exists to be graded: one stage, with an artifact of each encoding and one kept by the learner. Everything in it is synthetic."""

    id: ClassVar[str] = "tr0.selftest"
    title: ClassVar[str] = "The grader's self-test"
    environment: ClassVar[str] = "cpu"
    stages: ClassVar[dict[str, Stage]] = {"tr0.selftest.s1": Stage("tr0.selftest.s1", "A synthetic stage", checks=("seeds", "arithmetic"))}

    def run(self, context: StageContext) -> StageResult:
        draw = context.rng("selftest/draws")
        draws = [draw() for _ in range(4)]
        # Windows line endings, an accented letter and a CJK character: bytes that a canonical form must keep exactly.
        log = "selftest log\r\nline two " + chr(0xE9) + chr(0x65E5) + "\n"
        return StageResult(
            inputs=[make_input("selftest prompts", "prompts", sha256_hex(b"selftest prompts"), 16)],
            artifacts=[
                Artifact.from_json("draws", "outputs", "json", {"seed": context.seed, "draws": draws, "scale": 1e-7, "half": 0.5}),
                Artifact.from_text("log", "log", "text/plain", log),
                Artifact.from_bytes("blob", "report", "binary", bytes(range(256))),
                Artifact.kept("capture", "report", "binary", sha256_hex(b"a capture that stays with the learner"), 987_654_321),
            ],
            checks=[
                make_check("seeds", "property", True, value=float(draws[0]), n=len(draws), detail="the first draws of the token's stream"),
                make_check("arithmetic", "correctness", True, value=0.00032, bound=0.001, tolerance=0.001, n=128, detail="a synthetic check, with a float"),
            ],
            performance={"kind": "bench", "claimed": {"requests": 4}},
            notes="Synthetic: made by enginespace selftest. No lab ran.",
        )


def _expect(actual: object, expected: object, what: str) -> None:
    if actual != expected:
        raise AssertionError(f"{what}: got {actual!r}, expected {expected!r}")


def _check_generator() -> str:
    # Values from schemas/vectors: rng.json (splitmix32u at seed 0) and subseed.json (hash32 of the empty text, rngFor at seed 0 with an empty salt).
    draw = splitmix32u(0)
    _expect([draw() for _ in range(4)], [1684164658, 3653269916, 2939563536, 2141751570], "splitmix32u at seed 0")
    _expect(hash32(""), 0x811C9DC5, "hash32 of the empty text")
    _expect(hash32("a"), 0xE40C292C, "hash32 of a")
    _expect(rng_for(0, "")(), 3900923005, "the first draw of rngFor at seed 0 with no salt")
    return "the seeded generator gives the draws of the site's (splitmix32u, hash32, rngFor)"


def _check_challenge() -> str:
    token = "es1:tr0.forward.s1:00000000:AAAAAAAAAAAAAAAA:20260101:43352549"
    parts = parse_challenge(token)
    if parts is None:
        raise AssertionError("a token of schemas/vectors/challenge.json was refused")
    _expect((parts.stage, parts.seed, parts.issued_on, parts.checksum), ("tr0.forward.s1", 0, "20260101", "43352549"), "the parts of the token")
    _expect(parse_challenge(token[:-1] + "0"), None, "a token with a wrong checksum")
    _expect(format_challenge("tr0.forward.s1", 0, "AAAAAAAAAAAAAAAA", "20260101"), token, "the token made from its parts")
    return "the challenge codec reads and writes the site's tokens"


def _check_canonical() -> str:
    # The artifact vector "artifact-json-object" of schemas/vectors/sha256.json, and the number forms that Python's own would get wrong.
    value = {"b": 1, "a": [1, 2, {"d": None, "c": 0.5}]}
    _expect(canonical_json(value), '{"a":[1,2,{"c":0.5,"d":null}],"b":1}', "the canonical text of a small object")
    _expect(sha256_hex(canonical_json(value).encode("utf-8")), "9693b60fa489e3718aeaf2b0bdbc3104af2625dbf9ad15294c3926ba73edef0d", "its hash")
    _expect(canonical_json([1e-7, 0.000001, 100.0, -0.0]), "[1e-7,0.000001,100,0]", "number forms")
    _expect(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 of abc")
    return "canonical JSON and SHA-256 give the bytes and hashes of the site's"


def _check_schemas() -> str:
    for name in SCHEMA_NAMES:
        validator(name)
    return f"the {len(SCHEMA_NAMES)} packaged JSON Schemas load and are valid Draft 2020-12"


def _check_round_trip() -> str:
    with tempfile.TemporaryDirectory(prefix="enginespace-selftest-") as scratch:
        folder = Path(scratch)
        token = format_challenge("tr0.selftest.s1", 0x5E1F7E57, "SELFTESTSELFTEST", "20260101")
        pins = {"lockSha256": sha256_hex(b"selftest course lock"), "envLockSha256": sha256_hex(b"selftest environment lock"), "onPin": True, "offPin": []}
        outcome = run_stage(
            SelfTestLab(),
            "tr0.selftest.s1",
            token,
            out_dir=folder,
            environment=fingerprint.collect("other"),
            pins=pins,
            provenance={"assisted": "none", "agent": False, "guard": "on"},
            now=lambda: dt.datetime(2026, 1, 2, tzinfo=dt.timezone.utc),
            log=lambda message: None,
        )
        _expect(outcome.passed, True, "the checks of the synthetic stage")
        honest = verify_file(outcome.path)
        if not honest.ok:
            raise AssertionError("a bundle the grader just wrote was refused:\n" + "\n".join(f"  {f.rule}: {f.message}" for f in honest.failures()))
        # Change the hash that the receipt lists for the log, as someone typing a number would, and write the file again.
        with gzip.open(outcome.path, "rb") as packed:
            bundle: dict[str, Any] = json.loads(packed.read())
        for entry in bundle["receipt"]["artifacts"]:
            if entry["id"] == "log":
                entry["sha256"] = "0" * 64
        forged = folder / "forged.es.json.gz"
        forged.write_bytes(gzip.compress(json.dumps(bundle).encode("utf-8"), mtime=0))
        refused = verify_file(forged)
        if refused.ok or not any('artifact "log"' in finding.message for finding in refused.failures()):
            raise AssertionError("a bundle with a changed artifact hash was not refused by naming the artifact")
    return "a stage was graded, written and verified in a scratch folder, and a changed artifact hash was refused by name"


def builtin_checks() -> list[tuple[str, Callable[[], str]]]:
    """The checks that need nothing but this installation, by name."""
    return [
        ("generator", _check_generator),
        ("challenge", _check_challenge),
        ("canonical", _check_canonical),
        ("schemas", _check_schemas),
        ("round trip", _check_round_trip),
    ]


def _find_suite() -> Path | None:
    """The grader's tests folder, if it sits beside the package: `labs/grader/tests` of a checkout, or `grader/tests` of the kit."""
    candidate = Path(__file__).resolve().parents[2] / "tests"
    return candidate if (candidate / "__init__.py").is_file() and (Path(__file__).resolve().parents[2] / "pyproject.toml").is_file() else None


def _run_suite(folder: Path) -> tuple[int, int]:
    """Runs the unittest suite in `folder` under a package name of its own, so that no other package called `tests` can be mistaken for it. Returns (tests run, problems)."""
    alias = "enginespace_grader_tests"
    spec = importlib.util.spec_from_file_location(alias, folder / "__init__.py", submodule_search_locations=[str(folder)])
    if spec is None or spec.loader is None:
        raise GraderError(f"cannot load the tests in {folder}")
    package = importlib.util.module_from_spec(spec)
    sys.modules[alias] = package
    try:
        spec.loader.exec_module(package)
        suite = unittest.TestSuite()
        for path in sorted(folder.glob("test_*.py")):
            suite.addTests(unittest.defaultTestLoader.loadTestsFromName(f"{alias}.{path.stem}"))
        result = unittest.TextTestRunner(stream=sys.stderr, verbosity=0).run(suite)
    finally:
        for name in [name for name in sys.modules if name == alias or name.startswith(alias + ".")]:
            del sys.modules[name]
    return result.testsRun, len(result.failures) + len(result.errors)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="enginespace selftest", description="Run the grader's own checks, and its tests where they are installed.")
    parser.add_argument("--gpu", action="store_true", help="add the GPU smoke that the owner runs at each re-pin (not built yet)")
    parser.add_argument("--no-suite", action="store_true", help="run the built-in checks only, and not the unittest suite beside the package")
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.gpu:
        raise GraderError("the GPU smoke is not built yet: no GPU lab exists to run (W2-T12 runs it on the owner's GPUs once one does). Run `enginespace selftest` for the checks that exist")
    grader = identity()
    sys.stdout.write(f"{grader.name} {grader.version}, source sha256 {grader.source_sha256}\n")
    failed = 0
    for name, check in builtin_checks():
        try:
            sys.stdout.write(f"  ok    {check()}\n")
        except Exception as error:  # noqa: BLE001 - a check that breaks is a failed check, whatever broke it
            failed += 1
            sys.stdout.write(f"  FAIL  {name}: {type(error).__name__}: {error}\n")
    suite = None if args.no_suite else _find_suite()
    if suite is not None:
        run, problems = _run_suite(suite)
        failed += problems
        sys.stdout.write(f"  {'ok  ' if problems == 0 else 'FAIL'}  the grader's tests: {run} run, {problems} failed\n")
    elif not args.no_suite:
        sys.stdout.write("  note  the grader's tests are not installed beside the package (a wheel carries the package only), so only the built-in checks ran\n")
    sys.stdout.write("selftest passed\n" if failed == 0 else f"selftest FAILED: {failed} problem{'' if failed == 1 else 's'}\n")
    return 0 if failed == 0 else 1

