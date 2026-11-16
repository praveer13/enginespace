"""The pin checks (pins.py, W2-T04): what is installed against course.lock.json and the environment's uv.lock, and the host driver against the CUDA the lock is built for.

The machines are invented (fakes.py, and the recorded `nvidia-smi` output of synthetic/). Two kinds of kit are used: a small one that a test builds in a temporary folder,
and the repository's own (the real course.lock.json and labs/envs), so that a re-lock which breaks the checks fails here.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any, ClassVar
from unittest import mock

from enginespace_grader import cli, fingerprint, pins
from enginespace_grader.errors import GraderError
from enginespace_grader.labs import Lab, Stage

from .fake_nvml import FakeNvml
from .fakes import COMMIT, fake_smi, fake_torch, make_distribution, probes, smi_text

REPO = Path(__file__).resolve().parents[3]


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = cli.main(list(argv))
    return status, out.getvalue(), err.getvalue()


def lock_entry(key: str, **fields: str) -> dict[str, Any]:
    return {"key": key, "kind": "pypi", "name": key, "url": f"https://example.invalid/{key}", "checkedAt": "2026-11-04", "ttlDays": 90, "notes": "synthetic", **fields}


def uv_lock(packages: dict[str, str]) -> str:
    return 'version = 1\nrequires-python = ">=3.11"\n\n' + "".join(f'[[package]]\nname = "{name}"\nversion = "{version}"\nsource = {{ registry = "https://pypi.org/simple" }}\n\n' for name, version in packages.items())


def make_kit(folder: Path, environment: str = "vllm", engine: dict[str, str] | None = None, locked: dict[str, str] | None = None) -> Path:
    (folder / "envs" / environment).mkdir(parents=True)
    pin = engine if engine is not None else {"version": "0.33.0", "commit": COMMIT}
    (folder / pins.LOCK_NAME).write_text(json.dumps({"schema": "enginespace/lock@1", "entries": [lock_entry("vllm", **pin)]}), encoding="utf-8")
    packages = locked if locked is not None else {"torch": "2.14.0", "xgrammar": "0.2.8", "flashinfer-python": "0.7.2.post1", "nvidia-cuda-runtime": "13.0.96"}
    (folder / "envs" / environment / "uv.lock").write_text(uv_lock(packages), encoding="utf-8")
    return folder


class Machine:
    """An invented host: a site folder of fake distributions, a fake torch, and whatever `nvidia-smi` printed."""

    def __init__(self, folder: Path, *, engine: tuple[str, str] | None = ("vllm", "0.33.0"), torch: str = "2.14.0+cu130", libs: dict[str, str] | None = None, smi: str | None = None) -> None:
        site = folder / "site"
        site.mkdir()
        if engine is not None:
            make_distribution(site, engine[0], engine[1], commit=COMMIT if engine[0] == "nano-vllm" else None)
        for name, version in (libs if libs is not None else {"xgrammar": "0.2.8", "flashinfer-python": "0.7.2.post1"}).items():
            make_distribution(site, name, version)
        self.probes = probes(torch=fake_torch(version=torch), smi=fake_smi(smi_text(smi), version=None) if smi else None, search_path=[str(site)])


def fingerprint_of(machine: Machine, environment: str = "vllm") -> dict[str, Any]:
    return fingerprint.collect("local", engine=fingerprint.engine_for(environment), probes=machine.probes)


class Temp(unittest.TestCase):
    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)


class Check(Temp):
    def report(self, machine: Machine, **kit: Any) -> pins.PinReport:
        root = make_kit(self.folder / "kit", **kit)
        return pins.check("vllm", root=root, environment_fingerprint=fingerprint_of(machine))

    def test_a_machine_on_the_pins_is_on_them_and_the_receipt_block_says_so(self) -> None:
        report = self.report(Machine(self.folder, smi="rtx4090.csv"))
        self.assertTrue(report.ok, [f for f in report.findings if not f.ok])
        block = report.as_receipt_pins()
        self.assertEqual((block["onPin"], block["offPin"]), (True, []))
        self.assertRegex(block["lockSha256"], r"^[0-9a-f]{64}$")
        self.assertNotEqual(block["lockSha256"], block["envLockSha256"])

    def test_the_hashes_are_those_of_the_two_files_as_they_are(self) -> None:
        import hashlib

        machine = Machine(self.folder)
        root = make_kit(self.folder / "kit")
        block = pins.check("vllm", root=root, environment_fingerprint=fingerprint_of(machine)).as_receipt_pins()
        self.assertEqual(block["lockSha256"], hashlib.sha256((root / "course.lock.json").read_bytes()).hexdigest())
        self.assertEqual(block["envLockSha256"], hashlib.sha256((root / "envs" / "vllm" / "uv.lock").read_bytes()).hexdigest())

    def test_an_engine_at_another_release_is_off_the_pin_and_named(self) -> None:
        report = self.report(Machine(self.folder, engine=("vllm", "0.32.0")))
        self.assertEqual(report.off_pin, ["vllm"])
        self.assertIn("vllm 0.32.0 is installed and the course pins 0.33.0", report.findings[0].detail)
        self.assertFalse(report.as_receipt_pins()["onPin"])

    def test_the_local_label_of_a_release_is_not_a_difference(self) -> None:
        self.assertEqual(self.report(Machine(self.folder, engine=("vllm", "0.33.0+cu130"), smi="rtx4090.csv")).off_pin, [])

    def test_an_engine_that_is_not_installed_is_off_the_pin(self) -> None:
        report = self.report(Machine(self.folder, engine=None))
        self.assertEqual(report.off_pin, ["vllm"])
        self.assertIn("not installed", report.findings[0].detail)

    def test_a_commit_that_pip_recorded_must_be_the_pinned_one(self) -> None:
        machine = Machine(self.folder)
        site = self.folder / "site"
        # Re-write the engine as a build from git at another commit.
        for entry in site.glob("vllm-*"):
            for child in entry.iterdir():
                child.unlink()
            entry.rmdir()
        make_distribution(site, "vllm", "0.33.0", commit="0" * 40)
        report = pins.check("vllm", root=make_kit(self.folder / "kit"), environment_fingerprint=fingerprint_of(machine))
        self.assertEqual(report.off_pin, ["vllm"])
        self.assertIn("pins commit 4ba787ec9959", report.findings[0].detail)

    def test_a_lock_that_pins_a_commit_alone_needs_the_install_to_record_one(self) -> None:
        machine = Machine(self.folder, engine=("vllm", "0.33.0"))
        report = pins.check("vllm", root=make_kit(self.folder / "kit", engine={"commit": COMMIT}), environment_fingerprint=fingerprint_of(machine))
        self.assertEqual(report.off_pin, ["vllm"])
        self.assertIn("records no commit", report.findings[0].detail)

    def test_torch_and_a_key_library_off_the_environments_lock_are_named(self) -> None:
        report = self.report(Machine(self.folder, torch="2.13.0+cu130", libs={"xgrammar": "0.2.7", "flashinfer-python": "0.7.2.post1"}))
        self.assertEqual(report.off_pin, ["torch", "xgrammar"])

    def test_a_library_the_lock_holds_and_the_machine_lacks_is_off_the_pin(self) -> None:
        report = self.report(Machine(self.folder, libs={"xgrammar": "0.2.8"}))
        self.assertEqual(report.off_pin, ["flashinfer-python"])

    def test_a_library_the_lock_does_not_hold_is_not_compared(self) -> None:
        report = self.report(Machine(self.folder, libs={"xgrammar": "0.2.8", "flashinfer-python": "0.7.2.post1", "transformers": "9.9.9"}, smi="rtx4090.csv"))
        self.assertTrue(report.ok)

    def test_the_off_pin_names_are_ones_the_receipts_schema_accepts(self) -> None:
        report = self.report(Machine(self.folder, engine=("vllm", "0.32.0"), torch="2.13.0", libs={}))
        self.assertEqual(report.off_pin, ["vllm", "torch", "flashinfer-python", "xgrammar"])
        for name in report.off_pin:
            self.assertRegex(name, r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
            self.assertLessEqual(len(name), 64)

    def test_an_environment_without_a_lock_in_the_kit_stops_the_check(self) -> None:
        root = make_kit(self.folder / "kit")
        with self.assertRaises(GraderError) as caught:
            pins.check("sglang", root=root, environment_fingerprint={})
        self.assertIn("envs/sglang/uv.lock", str(caught.exception))

    def test_an_environment_that_is_not_one_is_refused(self) -> None:
        with self.assertRaises(GraderError):
            pins.check("tensorrt", root=make_kit(self.folder / "kit"), environment_fingerprint={})

    def test_a_course_lock_that_is_not_one_is_refused_with_a_message(self) -> None:
        with self.assertRaises(GraderError):
            pins.read_course_lock("[1, 2]")
        with self.assertRaises(GraderError):
            pins.read_course_lock("not json")

    def test_a_uv_lock_that_is_not_one_is_refused_with_a_message(self) -> None:
        with self.assertRaises(GraderError):
            pins.read_env_lock("this = is not toml [")
        with self.assertRaises(GraderError):
            pins.read_env_lock("version = 1\n")


class Driver(Temp):
    """The host driver against the CUDA generation of the environment's lock, in recorded `nvidia-smi` output."""

    def finding(self, smi: str, **kit: Any) -> pins.Finding:
        machine = Machine(self.folder, smi=smi)
        report = pins.check("vllm", root=make_kit(self.folder / "kit", **kit), environment_fingerprint=fingerprint_of(machine))
        (found,) = [f for f in report.findings if f.name == "driver"]
        return found

    def test_r580_meets_the_need_of_a_cuda_13_environment(self) -> None:
        found = self.finding("rtx4090.csv")
        self.assertTrue(found.ok, found.detail)
        self.assertIn("meets the R580 that CUDA 13 needs", found.detail)

    def test_r570_does_not_and_the_message_names_the_gate_and_the_fallback_pin(self) -> None:
        found = self.finding("a100-r570-mig.csv")
        self.assertFalse(found.ok)
        self.assertIn("R570 (570.158.01)", found.detail)
        self.assertIn("need R580 or newer", found.detail)
        self.assertIn("v0.32.0", found.detail)

    def test_a_driver_that_is_too_old_is_not_an_off_pin_package(self) -> None:
        machine = Machine(self.folder, smi="a100-r570-mig.csv")
        report = pins.check("vllm", root=make_kit(self.folder / "kit"), environment_fingerprint=fingerprint_of(machine))
        self.assertFalse(report.ok)
        self.assertEqual(report.off_pin, [])
        self.assertTrue(report.as_receipt_pins()["onPin"])

    def test_no_driver_to_read_is_a_failed_check_and_not_a_pass(self) -> None:
        machine = Machine(self.folder)
        report = pins.check("vllm", root=make_kit(self.folder / "kit"), environment_fingerprint=fingerprint_of(machine))
        (found,) = [f for f in report.findings if f.name == "driver"]
        self.assertFalse(found.ok)
        self.assertIn("could not be read", found.detail)

    def test_a_cuda_generation_the_table_lacks_is_said_and_not_guessed(self) -> None:
        found = self.finding("a100-r570-mig.csv", locked={"torch": "2.14.0", "xgrammar": "0.2.8", "flashinfer-python": "0.7.2.post1", "nvidia-cuda-runtime": "12.9.79"})
        self.assertTrue(found.ok)
        self.assertIn("knows no driver minimum", found.detail)

    def test_the_cpu_environment_needs_no_driver(self) -> None:
        root = make_kit(self.folder / "kit", environment="cpu", locked={"torch": "2.14.0+cpu", "transformers": "5.19.0"})
        machine = Machine(self.folder, engine=None, torch="2.14.0+cpu", libs={"transformers": "5.19.0"})
        report = pins.check("cpu", root=root, environment_fingerprint=fingerprint_of(machine, "cpu"))
        self.assertTrue(report.ok, report.findings)
        self.assertEqual([f.name for f in report.findings], ["torch", "transformers"])

    def test_the_minimum_for_cuda_13_is_580(self) -> None:
        self.assertEqual(pins.MIN_DRIVER_FOR_CUDA[13], 580)


class Locate(Temp):
    def test_the_kit_is_found_from_the_working_directory_up(self) -> None:
        root = make_kit(self.folder / "kit")
        deep = root / "a" / "b"
        deep.mkdir(parents=True)
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ENGINESPACE_KIT", None)
            self.assertEqual(pins.find_kit_root(deep), root)

    def test_a_variable_names_the_kit_and_a_folder_without_the_lock_is_none(self) -> None:
        root = make_kit(self.folder / "kit")
        with mock.patch.dict(os.environ, {"ENGINESPACE_KIT": str(root)}):
            self.assertEqual(pins.find_kit_root(), root)
        with mock.patch.dict(os.environ, {"ENGINESPACE_KIT": str(self.folder)}):
            self.assertIsNone(pins.find_kit_root())

    def test_the_repository_layout_is_found_too(self) -> None:
        self.assertEqual(pins.find_kit_root(REPO), REPO)
        self.assertTrue((REPO / "labs" / "envs" / "vllm" / "uv.lock").is_file())


class EngineLab(Lab):
    id: ClassVar[str] = "tr3.profile"
    title: ClassVar[str] = "A synthetic engine lab"
    environment: ClassVar[str] = "vllm"
    env_allowlist: ClassVar[tuple[str, ...]] = ()
    stages: ClassVar[dict[str, Stage]] = {"tr3.profile.s2": Stage("tr3.profile.s2", "Profile", checks=("probe",))}

    def run(self, context: Any) -> Any:  # pragma: no cover - never run: only the pin check is under test
        raise NotImplementedError


class LocalPins(Temp):
    def test_the_receipts_pins_for_a_lab_come_from_the_machine_and_the_kit(self) -> None:
        machine = Machine(self.folder, engine=("vllm", "0.32.0"))
        block = pins.local_pins(EngineLab(), probes=machine.probes, root=make_kit(self.folder / "kit"))
        self.assertEqual((block["onPin"], block["offPin"]), (False, ["vllm"]))
        self.assertEqual(sorted(block), ["envLockSha256", "lockSha256", "offPin", "onPin"])

    def test_without_a_kit_it_stops(self) -> None:
        with mock.patch.object(pins, "find_kit_root", return_value=None), self.assertRaises(GraderError) as caught:
            pins.local_pins(EngineLab(), probes=probes())
        self.assertIn("ENGINESPACE_KIT", str(caught.exception))


class RealKit(Temp):
    """The repository's own course.lock.json and environments, with a machine built from the environment's lock: it is on the pins, and one step off is found."""

    def on_pin(self, **changes: str) -> Machine:
        locked = pins.read_env_lock((REPO / "labs/envs/vllm/uv.lock").read_text(encoding="utf-8"))
        lock = pins.read_course_lock((REPO / "course.lock.json").read_text(encoding="utf-8"))
        libs = {name: sorted(locked[name])[0] for name in ("xgrammar", "flashinfer-python", "triton", "transformers") if name in locked}
        torch = changes.pop("torch", sorted(locked["torch"])[0] + "+cu130")
        engine = changes.pop("engine", lock["vllm"]["version"])
        return Machine(self.folder, engine=("vllm", engine), torch=torch, libs=libs, **changes)

    def doctor(self, machine: Machine, *flags: str) -> tuple[int, dict[str, Any], str]:
        with mock.patch.object(fingerprint, "default_probes", return_value=machine.probes), mock.patch.dict(os.environ, {"ENGINESPACE_KIT": str(REPO)}):
            status, out, err = run("doctor", "--json", "--env", "vllm", *flags)
        self.assertEqual(err, "")
        report: dict[str, Any] = json.loads(out)
        return status, report, out

    def test_a_machine_built_from_the_lock_is_on_the_pins_on_a_r580_driver(self) -> None:
        status, report, _ = self.doctor(self.on_pin(smi="rtx4090.csv"))
        self.assertEqual(status, 0, [f for f in report["pins"]["findings"] if not f["ok"]])
        self.assertTrue(report["pins"]["onPin"])

    def test_doctor_flags_an_off_pin_vllm(self) -> None:
        status, report, _ = self.doctor(self.on_pin(engine="0.32.0", smi="rtx4090.csv"))
        self.assertEqual(status, 1)
        self.assertEqual(report["pins"]["offPin"], ["vllm"])
        self.assertFalse(report["pins"]["onPin"])
        (found,) = [f for f in report["pins"]["findings"] if f["name"] == "vllm"]
        self.assertIn("vllm 0.32.0 is installed and the course pins 0.33.0", found["detail"])

    def test_doctor_flags_a_r570_driver_against_the_cuda_13_pin(self) -> None:
        status, report, _ = self.doctor(self.on_pin(smi="a100-r570-mig.csv"))
        self.assertEqual(status, 1)
        (found,) = [f for f in report["pins"]["findings"] if f["name"] == "driver"]
        self.assertFalse(found["ok"])
        self.assertIn("R570", found["detail"])
        self.assertIn("need R580 or newer", found["detail"])
        self.assertEqual(report["pins"]["offPin"], [], "the driver is not a package, so the receipt's pins are not off")

    def test_the_text_output_lists_each_finding_and_says_off_the_pins(self) -> None:
        machine = self.on_pin(engine="0.32.0", smi="a100-r570-mig.csv")
        with mock.patch.object(fingerprint, "default_probes", return_value=machine.probes), mock.patch.dict(os.environ, {"ENGINESPACE_KIT": str(REPO)}):
            status, out, _ = run("doctor", "--env", "vllm")
        self.assertEqual(status, 1)
        self.assertIn("[FAIL] vllm:", out)
        self.assertIn("[FAIL] driver:", out)
        self.assertIn("OFF THE PINS: vllm", out)
        self.assertNotIn(str(REPO), out, "the output holds no absolute path")

    def test_doctor_reads_the_environment_from_the_lab_and_refuses_a_contradiction(self) -> None:
        from enginespace_grader import labs

        labs.register(EngineLab())
        self.addCleanup(labs.unregister, "tr3.profile")
        status, _, err = run("doctor", "--lab", "tr3.profile", "--env", "sglang")
        self.assertEqual(status, 3)
        self.assertIn("runs in the vllm environment, not sglang", err)

    def test_the_nvml_driver_is_read_as_well(self) -> None:
        machine = self.on_pin()
        machine.probes = probes(nvml=FakeNvml(), torch=machine.probes.torch(), search_path=machine.probes.search_path)
        status, report, _ = self.doctor(machine)
        (found,) = [f for f in report["pins"]["findings"] if f["name"] == "driver"]
        self.assertEqual(status, 0 if found["ok"] else 1)
        self.assertIn("host driver", found["detail"])


if __name__ == "__main__":
    unittest.main()
