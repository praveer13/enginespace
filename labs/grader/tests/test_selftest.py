"""`enginespace selftest` (ARCHITECTURE section 9.4): the checks that need nothing but the installation, and the suite beside the package."""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

from enginespace_grader import cli, fingerprint, rng, selftest
from enginespace_grader.errors import GraderError

from .fake_nvml import FORBIDDEN, FakeNvml
from .fakes import RTX_4090_TORCH, fake_torch, probes


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = cli.main(["selftest", *argv])
    return status, out.getvalue(), err.getvalue()


class Builtin(unittest.TestCase):
    def test_every_builtin_check_passes_and_says_what_it_showed(self) -> None:
        names = [name for name, _ in selftest.builtin_checks()]
        self.assertEqual(names, ["generator", "challenge", "canonical", "schemas", "round trip"])
        for name, check in selftest.builtin_checks():
            with self.subTest(check=name):
                self.assertGreater(len(check()), 20)

    def test_the_command_passes_and_prints_a_line_for_each_check(self) -> None:
        status, out, err = run("--no-suite")
        self.assertEqual((status, err), (0, ""))
        self.assertEqual(out.count("  ok    "), 5)
        self.assertIn("selftest passed", out)
        self.assertIn("source sha256", out)
        self.assertNotIn("FAIL", out)

    def test_the_checks_can_fail_a_broken_generator_is_found(self) -> None:
        with mock.patch.object(selftest, "hash32", lambda text: 0):
            status, out, _ = run("--no-suite")
        self.assertEqual(status, 1)
        self.assertIn("FAIL  generator", out)
        self.assertIn("selftest FAILED: 1 problem", out)
        self.assertIn("hash32 of the empty text", out)

    def test_the_round_trip_is_found_broken_when_a_tampered_hash_is_let_through(self) -> None:
        from enginespace_grader import verify

        honest = verify.Verification("x")
        with mock.patch.object(selftest, "verify_file", lambda path: honest):
            status, out, _ = run("--no-suite")
        self.assertEqual(status, 1)
        self.assertIn("FAIL  round trip", out)
        self.assertIn("was not refused by naming the artifact", out)

    def test_the_synthetic_lab_is_declared_well_and_no_course_lab_has_its_id(self) -> None:
        self.assertEqual(selftest.SelfTestLab.problems(), [])
        self.assertEqual(selftest.SelfTestLab.id, "tr0.selftest")


class GpuSmoke(unittest.TestCase):
    """`selftest --gpu` on invented machines (fakes.py, fake_nvml.py): no GPU is asked."""

    def machine(self, **options: object) -> mock._patch:  # type: ignore[type-arg]
        return mock.patch.object(fingerprint, "default_probes", return_value=probes(**options))  # type: ignore[arg-type]

    def test_with_no_cuda_it_exits_non_zero_and_says_why_in_one_line(self) -> None:
        with self.machine():
            status, out, err = run("--gpu")
        self.assertEqual((status, out), (3, ""))
        self.assertEqual(err.count("\n"), 1, err)
        self.assertIn("selftest --gpu found no CUDA GPU on this machine", err)
        self.assertIn("nvidia-smi is not available", err)
        with self.machine(), self.assertRaises(GraderError):
            selftest.main(["--gpu"])

    def test_a_machine_with_nvml_and_torch_passes_and_says_that_no_lab_ran(self) -> None:
        nvml = FakeNvml()
        with self.machine(nvml=nvml, torch=fake_torch(devices=[RTX_4090_TORCH])), mock.patch.object(selftest, "_cuda_matmul", lambda torch: 0):
            status, out, err = run("--gpu", "--no-suite")
        self.assertEqual((status, err), (0, ""))
        self.assertIn("  ok    1 GPU seen: NVIDIA GeForce RTX 4090 (24 GiB, capability 8.9)", out)
        self.assertIn("  ok    driver 580.82.07, which supports CUDA 13.0", out)
        self.assertIn("  ok    torch 2.14.0+cu130 built for CUDA 13.0 sees 1 device", out)
        self.assertIn("equals the CPU's in every entry", out)
        self.assertIn("this ran no lab", out)
        self.assertIn("selftest passed", out)
        self.assertEqual(out.count("  ok    "), 4 + 5)
        self.assertFalse(set(nvml.calls) & set(FORBIDDEN), "the smoke asks NVML for no UUID, serial number or bus address")
        for personal in ("GPU-5a1c9e30", "1320423009876", "00000000:01:00.0"):
            self.assertNotIn(personal, out)

    def test_a_torch_without_cuda_fails_the_torch_check_and_the_product(self) -> None:
        with self.machine(nvml=FakeNvml(), torch=fake_torch(cuda=None)):
            status, out, _ = run("--gpu", "--no-suite")
        self.assertEqual(status, 1)
        self.assertIn("FAIL  torch: AssertionError: torch 2.14.0+cu130 is a build without CUDA", out)
        self.assertIn("selftest FAILED", out)
        self.assertIn("FAIL  product: AssertionError: torch has no CUDA device to run the product on", out)

    def test_torch_that_does_not_see_the_gpu_fails_with_the_likely_causes(self) -> None:
        with self.machine(nvml=FakeNvml(), torch=fake_torch(devices=[], available=False)):
            status, out, _ = run("--gpu", "--no-suite")
        self.assertEqual(status, 1)
        self.assertIn("does not see the GPU: a driver older than the build's CUDA needs, or a container started without the GPU", out)

    def test_a_product_that_differs_from_the_cpus_fails(self) -> None:
        with self.machine(nvml=FakeNvml(), torch=fake_torch(devices=[RTX_4090_TORCH])), mock.patch.object(selftest, "_cuda_matmul", lambda torch: 3):
            status, out, _ = run("--gpu", "--no-suite")
        self.assertEqual(status, 1)
        self.assertIn("FAIL  product: AssertionError: a 64 by 64 fp32 product on the GPU differs from the CPU's in 3 entries", out)

    def test_a_driver_that_names_no_cuda_version_fails_the_driver_check(self) -> None:
        with self.machine(nvml=FakeNvml(cuda_version=None), torch=fake_torch(devices=[RTX_4090_TORCH])), mock.patch.object(selftest, "_cuda_matmul", lambda torch: 0):
            status, out, _ = run("--gpu", "--no-suite")
        self.assertEqual(status, 1)
        self.assertIn("FAIL  driver: AssertionError: driver 580.82.07 did not report the CUDA version it supports", out)

    def test_without_the_flag_the_gpu_is_not_asked_about(self) -> None:
        with self.machine():
            status, out, _ = run("--no-suite")
        self.assertEqual(status, 0)
        self.assertNotIn("GPU", out)
        self.assertNotIn("this ran no lab", out)


class Suite(unittest.TestCase):
    def test_the_suite_beside_the_package_is_found(self) -> None:
        folder = selftest._find_suite()
        assert folder is not None
        self.assertEqual(folder, Path(__file__).resolve().parent)

    def test_a_folder_of_tests_is_run_under_a_name_of_its_own(self) -> None:
        import sys

        with tempfile.TemporaryDirectory() as scratch:
            folder = Path(scratch) / "tests"
            folder.mkdir()
            (folder / "__init__.py").write_text("", encoding="utf-8")
            (folder / "test_a.py").write_text(
                textwrap.dedent(
                    """
                    import unittest
                    from . import helper

                    class A(unittest.TestCase):
                        def test_passes(self):
                            self.assertEqual(helper.ANSWER, 42)

                        def test_fails(self):
                            self.assertEqual(1, 2)
                    """
                ),
                encoding="utf-8",
            )
            (folder / "helper.py").write_text("ANSWER = 42\n", encoding="utf-8")
            with contextlib.redirect_stderr(io.StringIO()):
                run_count, problems = selftest._run_suite(folder)
        self.assertEqual((run_count, problems), (2, 1))
        self.assertFalse([name for name in sys.modules if name.startswith("enginespace_grader_tests")], "the alias does not outlive the run")

    def test_the_real_suite_is_loaded_without_being_run_by_this_test(self) -> None:
        """Running it here would run this test again. It is run by `python -m unittest`, and by `enginespace selftest` where the tests are installed."""
        suites = sorted(path.name for path in selftest._find_suite().glob("test_*.py"))  # type: ignore[union-attr]
        self.assertIn("test_selftest.py", suites)
        self.assertGreaterEqual(len(suites), 12)

    @unittest.skipIf(os.environ.get("ENGINESPACE_SELFTEST_NESTED"), "this is the run that the test below starts, and it does not start another")
    def test_the_installed_command_runs_the_whole_suite_from_any_folder(self) -> None:
        """The alias that the suite is run under has to carry its relative imports: this runs every test of the suite once more, through `enginespace selftest`."""
        with tempfile.TemporaryDirectory() as elsewhere:
            done = subprocess.run(
                [sys.executable, "-m", "enginespace_grader", "selftest"],
                capture_output=True,
                text=True,
                cwd=elsewhere,
                env={**os.environ, "ENGINESPACE_SELFTEST_NESTED": "1"},
                check=False,
            )
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertIn("selftest passed", done.stdout)
        self.assertRegex(done.stdout, r"the grader's tests: [0-9]+ run, 0 failed")

    def test_the_command_says_so_when_the_tests_are_not_installed(self) -> None:
        with mock.patch.object(selftest, "_find_suite", lambda: None):
            status, out, _ = run()
        self.assertEqual(status, 0)
        self.assertIn("a wheel carries the package only", out)

    def test_a_failing_suite_fails_the_command(self) -> None:
        with mock.patch.object(selftest, "_find_suite", lambda: Path("/nonexistent")), mock.patch.object(selftest, "_run_suite", lambda folder: (7, 2)):
            status, out, _ = run()
        self.assertEqual(status, 1)
        self.assertIn("FAIL  the grader's tests: 7 run, 2 failed", out)
        self.assertIn("selftest FAILED: 2 problems", out)


class Generator(unittest.TestCase):
    def test_the_values_the_selftest_embeds_are_the_vectors(self) -> None:
        """The few known answers inside selftest.py are copies of schemas/vectors; this holds them to the files so that they cannot drift."""
        from .support import load_vectors

        stream = next(v for v in load_vectors("rng")["vectors"] if v["id"] == "splitmix32u-seed-0")["draws"][:4]
        self.assertEqual(stream, [1684164658, 3653269916, 2939563536, 2141751570])
        subseed = load_vectors("subseed")["vectors"]
        self.assertEqual(next(v for v in subseed if v["id"] == "hash32-a")["hash"], 0xE40C292C)
        self.assertEqual(next(v for v in subseed if v["id"] == "rngFor-seed-0-salt-empty")["draws"][0], 3900923005)
        self.assertEqual(rng.rng_for(0, "")(), 3900923005)
        artifact = next(v for v in load_vectors("sha256")["vectors"] if v["id"] == "artifact-json-object")
        self.assertEqual(artifact["sha256"], "9693b60fa489e3718aeaf2b0bdbc3104af2625dbf9ad15294c3926ba73edef0d")
        token = next(v for v in load_vectors("challenge")["vectors"] if v["id"] == "valid-seed-0")
        self.assertEqual(token["token"], "es1:tr0.forward.s1:00000000:AAAAAAAAAAAAAAAA:20260101:43352549")


if __name__ == "__main__":
    unittest.main()
