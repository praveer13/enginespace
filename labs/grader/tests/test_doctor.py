"""`enginespace doctor` (ARCHITECTURE section 9.4, 9.9): it prints exactly the fields that a receipt would record, and `grade` records those.

The machine is invented (fakes.py, fake_nvml.py and the synthetic files): the tests replace `fingerprint.default_probes`, the one place that `grade` and `doctor` take their
sources from, so that both of them see the same fake machine.
"""

from __future__ import annotations

import contextlib
import gzip
import io
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any, ClassVar
from unittest import mock

from enginespace_grader import cli, fingerprint, grade, labs
from enginespace_grader.bundle import Artifact
from enginespace_grader.challenge import format_challenge
from enginespace_grader.labs import Lab, Stage, StageContext, StageResult
from enginespace_grader.receipt import make_check

from . import samples
from .fake_nvml import FakeNvml
from .fakes import COMMIT, SYNTHETIC, fake_torch, make_distribution, probes


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = cli.main(list(argv))
    return status, out.getvalue(), err.getvalue()


class EngineLab(Lab):
    """A lab that runs vLLM and allowlists two variables."""

    id: ClassVar[str] = "tr3.profile"
    title: ClassVar[str] = "A synthetic engine lab"
    environment: ClassVar[str] = "vllm"
    env_allowlist: ClassVar[tuple[str, ...]] = ("VLLM_LOGGING_LEVEL", "VLLM_CACHE_ROOT")
    stages: ClassVar[dict[str, Stage]] = {"tr3.profile.s2": Stage("tr3.profile.s2", "Profile", checks=("probe",))}

    def run(self, context: StageContext) -> StageResult:
        return StageResult(
            artifacts=[Artifact.from_text("log", "log", "text/plain", "scrubbed\n")],
            checks=[make_check("probe", "property", True, detail="")],
            notes="Synthetic: made by labs/grader/tests/test_doctor.py. No machine ran it.",
        )


class Doctor(unittest.TestCase):
    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)
        (self.folder / "site").mkdir()
        make_distribution(self.folder / "site", "vllm", "0.33.0", commit=COMMIT)
        self.machine = probes(
            nvml=FakeNvml(),
            torch=fake_torch(),
            environ={"VLLM_LOGGING_LEVEL": "DEBUG", "VLLM_CACHE_ROOT": "/opt/example/cache", "VLLM_NOT_ALLOWED": "1"},
            search_path=[str(self.folder / "site")],
        )
        patch = mock.patch.object(fingerprint, "default_probes", return_value=self.machine)
        patch.start()
        self.addCleanup(patch.stop)

    def report(self, *flags: str) -> dict[str, Any]:
        status, out, err = run("doctor", "--json", *flags)
        self.assertEqual((status, err), (0, ""))
        report: dict[str, Any] = json.loads(out)
        return report

    def test_it_says_that_it_is_still_a_stub_for_the_checks_and_prints_the_fingerprint(self) -> None:
        status, out, _ = run("doctor")
        self.assertEqual(status, 0)
        self.assertIn("doctor is a stub in this build", out)
        self.assertIn("checks nothing yet", out)
        self.assertIn("W2-T04", out)
        self.assertIn("exactly what a receipt records in `environment`", out)
        self.assertIn('"name": "NVIDIA GeForce RTX 4090"', out)

    def test_the_json_is_the_environment_that_collect_gives_for_the_same_arguments(self) -> None:
        report = self.report("--host-kind", "modal")
        self.assertTrue(report["stub"])
        self.assertEqual(report["environment"], fingerprint.collect("modal"))
        self.assertEqual(report["environment"]["host"]["kind"], "modal")
        self.assertEqual(report["grader"]["name"], "enginespace-grader")

    def test_a_host_kind_the_receipt_does_not_know_is_a_usage_error(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
            cli.main(["doctor", "--host-kind", "aws"])
        self.assertEqual(caught.exception.code, 2)

    def test_without_a_lab_it_reads_no_variable_and_no_engine(self) -> None:
        environment = self.report()["environment"]
        self.assertEqual(environment["envVars"], {})
        self.assertNotIn("engine", environment)

    def test_with_a_lab_it_reads_what_grade_reads_for_that_lab(self) -> None:
        labs.register(EngineLab())
        self.addCleanup(labs.unregister, "tr3.profile")
        environment = self.report("--lab", "tr3.profile")["environment"]
        self.assertEqual(environment["engine"]["name"], "vllm")
        self.assertEqual(environment["engine"]["commit"], COMMIT)
        self.assertEqual(environment["envVars"], {"VLLM_LOGGING_LEVEL": "DEBUG", "VLLM_CACHE_ROOT": "<redacted>"})

    def test_a_lab_this_installation_does_not_have_is_status_3(self) -> None:
        status, out, err = run("doctor", "--lab", "tr8.nothing")
        self.assertEqual((status, out), (3, ""))
        self.assertIn("has no lab tr8.nothing", err)

    def test_what_doctor_prints_for_a_lab_is_what_grade_records_for_it(self) -> None:
        lab = EngineLab()
        labs.register(lab)
        self.addCleanup(labs.unregister, "tr3.profile")
        printed = self.report("--lab", "tr3.profile")["environment"]
        out_dir = self.folder / "receipts"
        token = format_challenge("tr3.profile.s2", 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104")
        with mock.patch.object(grade, "local_pins", lambda lab: samples.sample_pins()):
            status, _, err = run("grade", "tr3.profile.s2", "--challenge", token, "--out", str(out_dir), "--assisted", "none", "--agent", "no", "--host-kind", "local")
        self.assertEqual(status, 0, err)
        (path,) = out_dir.iterdir()
        with gzip.open(path, "rb") as packed:
            recorded = json.loads(packed.read())["receipt"]["environment"]
        self.assertEqual(recorded, printed)

    def test_grade_says_what_it_could_not_read_before_the_run(self) -> None:
        self.machine = probes()  # a machine with nothing on it
        with mock.patch.object(fingerprint, "default_probes", return_value=self.machine):
            labs.register(EngineLab())
            self.addCleanup(labs.unregister, "tr3.profile")
            token = format_challenge("tr3.profile.s2", 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104")
            with mock.patch.object(grade, "local_pins", lambda lab: samples.sample_pins()):
                status, _, err = run("grade", "tr3.profile.s2", "--challenge", token, "--out", str(self.folder / "r"), "--assisted", "none", "--agent", "no")
        self.assertEqual(status, 0, err)
        self.assertIn("note: vllm is not installed in this environment", err)
        self.assertIn("note: no NVIDIA GPU was found", err)


class EngineLog(unittest.TestCase):
    """`--engine-log` and `--engine-config`: what the grader would read from an earlier run."""

    log = str(SYNTHETIC / "vllm" / "mrv2-default.txt")
    dump = str(SYNTHETIC / "vllm" / "server-info-rtx4090.json")

    def setUp(self) -> None:
        patch = mock.patch.object(fingerprint, "default_probes", return_value=probes())
        patch.start()
        self.addCleanup(patch.stop)

    def test_the_log_and_the_dump_give_the_configuration_a_receipt_would_record(self) -> None:
        status, out, _ = run("doctor", "--json", "--engine-log", self.log, "--engine-config", self.dump)
        self.assertEqual(status, 0)
        report = json.loads(out)
        self.assertEqual(
            report["environment"]["engineConfig"],
            {"runner": "MRV2", "graphMode": "FULL_AND_PIECEWISE", "asyncScheduling": True, "attentionBackend": "FLASH_ATTN", "maxNumBatchedTokens": 2048, "maxNumSeqs": 256},
        )
        self.assertTrue(any(note.startswith("engineConfig: runner MRV2") for note in report["notes"]), report["notes"])

    def test_the_log_alone_says_what_is_missing_and_gives_no_configuration(self) -> None:
        report = json.loads(run("doctor", "--json", "--engine-log", self.log)[1])
        self.assertNotIn("engineConfig", report["environment"])
        self.assertTrue(any("engineConfig is not complete" in note and "not found: asyncScheduling, maxNumSeqs" in note for note in report["notes"]), report["notes"])

    def test_in_text_the_same_notes_follow_the_fields(self) -> None:
        status, out, _ = run("doctor", "--engine-log", self.log)
        self.assertEqual(status, 0)
        self.assertIn("\nnotes:\n", out)
        self.assertIn("  - engineConfig is not complete", out)

    def test_a_lab_that_runs_an_engine_is_told_where_the_configuration_comes_from(self) -> None:
        labs.register(EngineLab())
        self.addCleanup(labs.unregister, "tr3.profile")
        out = run("doctor", "--lab", "tr3.profile")[1]
        self.assertIn("engineConfig is read from the engine's own log after a run", out)
        self.assertNotIn("engineConfig is read from", run("doctor")[1])

    def test_a_file_that_cannot_be_read_is_status_3_with_a_message(self) -> None:
        status, out, err = run("doctor", "--engine-log", str(SYNTHETIC / "missing.log"))
        self.assertEqual((status, out), (3, ""))
        self.assertIn("cannot read the engine log", err)

    def test_a_log_larger_than_doctor_reads_is_refused(self) -> None:
        with tempfile.TemporaryDirectory() as folder, mock.patch("enginespace_grader.doctor.MAX_LOG_BYTES", 10):
            path = Path(folder) / "big.log"
            path.write_text("x" * 100, encoding="utf-8")
            status, _, err = run("doctor", "--engine-log", str(path))
        self.assertEqual(status, 3)
        self.assertIn("more than doctor reads", err)

    def test_an_engine_that_is_not_read_says_so_in_a_note(self) -> None:
        class Sglang(EngineLab):
            environment: ClassVar[str] = "sglang"

        labs.register(Sglang())
        self.addCleanup(labs.unregister, "tr3.profile")
        report = json.loads(run("doctor", "--json", "--lab", "tr3.profile", "--engine-log", self.log)[1])
        self.assertNotIn("engineConfig", report["environment"])
        self.assertTrue(any("vLLM only" in note for note in report["notes"]), report["notes"])


class Imports(unittest.TestCase):
    def test_doctor_with_a_lab_and_a_log_does_not_load_jsonschema(self) -> None:
        import subprocess
        import sys

        code = (
            "import sys; from enginespace_grader import cli;"
            f" cli.main(['doctor', '--json', '--engine-log', {str(SYNTHETIC / 'vllm' / 'mrv2-default.txt')!r}]);"
            " print('jsonschema' in sys.modules)"
        )
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.strip().splitlines()[-1], "False")


if __name__ == "__main__":
    unittest.main()
