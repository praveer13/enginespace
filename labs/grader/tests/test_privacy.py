"""What a receipt never holds (ARCHITECTURE section 9.5, 9.9): the host name, the user name, the GPU's UUID and serial number, an absolute path and `HF_TOKEN`.

The values are seeded into the environment of a *subprocess*, never of the test runner (the runner's own environment is not touched). The subprocess runs the
grader as a learner would: `enginespace doctor`, and the flow of `grade` on an engine lab (a script, privacy_probe.py), with a fake NVML on its PYTHONPATH and a fake
`nvidia-smi` first on its PATH, both of which answer with invented machines and would hand over a UUID and a serial number to anyone who asked. Then the test looks for
every seeded value in everything the subprocess printed, in the receipt's environment, the notes, the scrubbed log and the text of the bundle it wrote.

The test checks itself first: the seeds are in the subprocess's environment, they are not in the runner's, and the search finds a seeded value in an output that holds one.
All of it is SYNTHETIC: no real name, UUID, serial number or token is here, and the token is put together at run time so that no file holds one.
"""

from __future__ import annotations

import json
import os
import platform
import socket
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from enginespace_grader import redact
from enginespace_grader.engine_config import EngineRun, read_engine_config

from . import fake_nvml
from .fake_nvml import FORBIDDEN, RTX_4090
from .fakes import SYNTHETIC, vllm_text

HERE = Path(__file__).resolve().parent

#: The values that are seeded. The home folder and the token are put together here so that no file of the repository holds a home folder or the shape of a token.
USER = "learnerq8x2"
HOST = "gpu-box-7f3a9c"
HOME = "/ho" + "me/" + USER
TOKEN = "hf" + "_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7"
SEEDS: dict[str, str] = {
    "hostname": HOST,
    "user name": USER,
    "home folder": HOME,
    "GPU UUID": RTX_4090["uuid"],
    "GPU serial number": RTX_4090["serial"],
    "PCI bus address": RTX_4090["bus_id"],
    "absolute path": HOME + "/projects/secret-kit",
    "HF_TOKEN": TOKEN,
    "an IP address": "10.20.30.40",
}


def seeded_environment(folder: Path, *, with_nvml: bool, no_version: bool = False) -> dict[str, str]:
    """The environment of the subprocess: nothing of the runner's, the seeds, and the two fakes."""
    environment = {
        "PATH": str(folder / "bin"),
        "HOME": HOME,
        "USER": USER,
        "LOGNAME": USER,
        "USERNAME": USER,
        "HOSTNAME": HOST,
        "HOST": HOST,
        "PWD": SEEDS["absolute path"],
        "HF_TOKEN": TOKEN,
        "HUGGING_FACE_HUB_TOKEN": TOKEN,
        "HF_HOME": HOME + "/.cache/huggingface",
        "TMPDIR": HOME + "/tmp",
        "NVIDIA_VISIBLE_DEVICES": RTX_4090["uuid"],
        "CUDA_VISIBLE_DEVICES": RTX_4090["uuid"],
        "GPU_SERIAL_NUMBER": RTX_4090["serial"],
        "VLLM_LOGGING_LEVEL": "INFO",
        "VLLM_USE_V2_MODEL_RUNNER": "1",
        "VLLM_CACHE_ROOT": HOME + "/.cache/vllm",
        "VLLM_HOST_IP": SEEDS["an IP address"],
        "VLLM_API_KEY": TOKEN,
        "PYTHONDONTWRITEBYTECODE": "1",
        "FAKE_SMI_PYTHON": sys.executable,
        "FAKE_SMI_SCRIPT": str(HERE / "fake_smi.py"),
        "FAKE_SMI_DIR": str(SYNTHETIC / "nvidia-smi"),
        "FAKE_SMI_LOG": str(folder / "smi-calls.txt"),
    }
    if no_version:
        environment["FAKE_SMI_NO_VERSION"] = "1"
    if with_nvml:
        environment["PYTHONPATH"] = str(folder / "site")
        environment["FAKE_NVML_JSON"] = json.dumps({"gpus": [RTX_4090]})
        environment["FAKE_NVML_CALLS"] = str(folder / "nvml-calls.txt")
    return environment


def found_in(text: str, extra: dict[str, str] | None = None) -> list[str]:
    """The names of the seeded values (and of the runner's own host and user) that `text` holds."""
    needles = dict(SEEDS)
    needles.update(extra or {})
    return sorted(name for name, value in needles.items() if value and value in text)


def real_names() -> dict[str, str]:
    """The test machine's own host name and user name, which no output may hold either (a name of fewer than four characters or of a generic account is left out:
    it is not worth hiding, and it would be found inside ordinary words)."""
    names = {"this machine's host name": socket.gethostname(), "this machine's node name": platform.node()}
    try:
        import getpass

        names["this machine's user name"] = getpass.getuser()
    except (KeyError, OSError, ImportError):
        pass
    return {label: value for label, value in names.items() if len(value) >= redact.MIN_LITERAL_CHARS and value.lower() not in redact.GENERIC_NAMES}


@unittest.skipIf(sys.platform == "win32", "the fake nvidia-smi is a shell script; the fingerprint's own code is tested without it in test_fingerprint.py")
class Seeded(unittest.TestCase):
    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-privacy-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)
        (self.folder / "bin").mkdir()
        (self.folder / "site").mkdir()
        wrapper = self.folder / "bin" / "nvidia-smi"
        wrapper.write_text('#!/bin/sh\nexec "$FAKE_SMI_PYTHON" "$FAKE_SMI_SCRIPT" "$@"\n', encoding="utf-8")
        wrapper.chmod(wrapper.stat().st_mode | stat.S_IXUSR)
        (self.folder / "site" / "pynvml.py").write_text((HERE / "fake_nvml.py").read_text(encoding="utf-8"), encoding="utf-8")
        # An engine log with the machine's own words in it, as a real run's has: the host name leads every line of NCCL's, and a path leads the loader's.
        self.raw_log = vllm_text("mrv2-default.txt") + "".join(
            line + "\n"
            for line in (
                f"{HOST}:4242:4242 [0] NCCL INFO Bootstrap: Using eth0:{SEEDS['an IP address']}<0>",
                f"(EngineCore pid=1002) INFO 11-09 12:00:02 [loader.py:51] Loading weights from {HOME}/.cache/huggingface/hub/models--Qwen--Qwen3-0.6B for {USER}",
                f"(EngineCore pid=1002) INFO 11-09 12:00:03 [cuda.py:60] Visible devices: {RTX_4090['uuid']} at {RTX_4090['bus_id']}, serial {RTX_4090['serial']}",
                f"(APIServer pid=1001) INFO 11-09 12:00:04 [api.py:7] token {TOKEN} read from {SEEDS['absolute path']}",
            )
        )
        (self.folder / "engine.log").write_text(self.raw_log, encoding="utf-8")
        (self.folder / "dump.json").write_text((SYNTHETIC / "vllm" / "server-info-rtx4090.json").read_text(encoding="utf-8"), encoding="utf-8")

    def run_python(self, *argv: str, with_nvml: bool = True, no_version: bool = False) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, *argv],
            capture_output=True,
            text=True,
            check=False,
            env=seeded_environment(self.folder, with_nvml=with_nvml, no_version=no_version),
            cwd=self.folder,  # not the repository: nothing of the checkout is the learner's
        )

    def doctor(self, *flags: str, **options: Any) -> subprocess.CompletedProcess[str]:
        return self.run_python("-m", "enginespace_grader", "doctor", *flags, **options)

    def probe(self, **options: Any) -> dict[str, Any]:
        done = self.run_python(str(HERE / "privacy_probe.py"), str(self.folder / "engine.log"), str(self.folder / "dump.json"), **options)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertEqual(found_in(done.stderr, real_names()), [], "nothing on the error stream either")
        result: dict[str, Any] = json.loads(done.stdout)
        return result

    # --- the test checks itself first ---

    def test_the_seeds_are_in_the_environment_of_the_subprocess_and_not_in_the_runners(self) -> None:
        done = self.run_python("-c", "import json, os; print(json.dumps(dict(os.environ)))")
        child = json.loads(done.stdout)
        for name in ("HF_TOKEN", "HOSTNAME", "USER", "HOME", "NVIDIA_VISIBLE_DEVICES", "GPU_SERIAL_NUMBER", "VLLM_CACHE_ROOT", "VLLM_API_KEY"):
            self.assertIn(name, child)
        self.assertEqual(child["HF_TOKEN"], TOKEN)
        for name, value in SEEDS.items():
            self.assertNotIn(value, "\n".join(os.environ.values()), f"{name} must be seeded into the subprocess only")

    def test_the_search_finds_a_value_that_is_there(self) -> None:
        leaky = self.run_python("-c", "import os; print(os.environ['HF_TOKEN'], os.environ['HOSTNAME'], os.environ['NVIDIA_VISIBLE_DEVICES'])")
        self.assertEqual(found_in(leaky.stdout), ["GPU UUID", "HF_TOKEN", "hostname"])
        self.assertEqual(found_in("a clean line"), [])

    def test_the_fakes_would_hand_over_a_uuid_and_a_serial_number_if_asked(self) -> None:
        asked = self.run_python("-c", "import pynvml; pynvml.nvmlInit(); h = pynvml.nvmlDeviceGetHandleByIndex(0); print(pynvml.nvmlDeviceGetUUID(h), pynvml.nvmlDeviceGetSerial(h))")
        self.assertEqual(found_in(asked.stdout), ["GPU UUID", "GPU serial number"])
        self.assertEqual((self.folder / "nvml-calls.txt").read_text(encoding="utf-8").split()[-2:], ["nvmlDeviceGetUUID", "nvmlDeviceGetSerial"], "the fake records what it was asked")

    # --- doctor ---

    def test_doctor_prints_none_of_them(self) -> None:
        for flags in ((), ("--json",)):
            done = self.doctor(*flags)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertEqual(found_in(done.stdout + done.stderr, real_names()), [], flags)
            self.assertIn("NVIDIA GeForce RTX 4090", done.stdout, "it did read the fake NVML")

    def test_doctor_prints_the_fields_a_receipt_records_and_nothing_else_of_the_environment(self) -> None:
        report = json.loads(self.doctor("--json").stdout)
        self.assertEqual(sorted(report), ["environment", "grader", "notes", "stub"])
        environment = report["environment"]
        self.assertEqual(environment["envVars"], {}, "no lab, no allowlist, no variable")
        self.assertLessEqual(set(environment), {"host", "gpus", "driver", "python", "torch", "libs", "envVars"})
        self.assertEqual(environment["gpus"][0]["name"], "NVIDIA GeForce RTX 4090")
        for key in ("uuid", "serial", "bus_id"):
            self.assertNotIn(RTX_4090[key], json.dumps(report))

    # --- the sources are asked for facts and never for the personal values ---

    def test_nvml_is_never_asked_for_a_uuid_a_serial_number_or_a_bus_address(self) -> None:
        self.assertEqual(self.doctor("--json").returncode, 0)
        calls = (self.folder / "nvml-calls.txt").read_text(encoding="utf-8").split()
        self.assertGreater(len(calls), 5)
        self.assertEqual(set(calls) & set(FORBIDDEN), set())
        self.assertEqual(calls[0], "nvmlInit")
        self.assertEqual(calls[-1], "nvmlShutdown")
        self.assertFalse((self.folder / "smi-calls.txt").exists(), "NVML answered, so nvidia-smi was not run")

    def test_nvidia_smi_is_never_asked_for_a_uuid_a_serial_number_or_a_bus_address(self) -> None:
        for no_version in (False, True):
            (self.folder / "smi-calls.txt").unlink(missing_ok=True)
            done = self.doctor("--json", with_nvml=False, no_version=no_version)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertEqual(found_in(done.stdout + done.stderr, real_names()), [])
            self.assertEqual(json.loads(done.stdout)["environment"]["gpus"][0]["name"], "NVIDIA GeForce RTX 4090", "it read the CSV")
            calls = (self.folder / "smi-calls.txt").read_text(encoding="utf-8").splitlines()
            columns = {column for call in calls if call.startswith("--query-gpu=") for column in call.split()[0].split("=", 1)[1].split(",")}
            self.assertGreater(len(columns), 5)
            self.assertEqual(columns & {"uuid", "gpu_uuid", "serial", "gpu_serial", "pci.bus_id", "gpu_bus_id", "pci.bus", "pci.domain"}, set())
            self.assertEqual({argument for call in calls for argument in call.split()} & {"-L", "--list-gpus", "-q", "--query", "-x"}, set())
            if no_version:
                self.assertEqual(json.loads(done.stdout)["environment"]["driver"]["cudaVersion"], "12.8", "from the table, which holds a bus address that must not come along")
                self.assertNotIn("00000000:00:04.0", done.stdout)

    # --- the flow of `grade` ---

    def test_a_graded_stage_of_an_engine_lab_holds_none_of_them_anywhere(self) -> None:
        result = self.probe()
        everything = json.dumps(result)
        self.assertEqual(found_in(everything, real_names()), [])
        for part in ("environment", "notes", "cleaned_log", "bundle"):
            self.assertEqual(found_in(json.dumps(result[part]), real_names()), [], part)

    def test_the_allowlisted_variables_are_recorded_without_their_personal_values(self) -> None:
        environment = self.probe()["environment"]
        self.assertEqual(environment["envVars"], {"VLLM_LOGGING_LEVEL": "INFO", "VLLM_USE_V2_MODEL_RUNNER": "1", "VLLM_CACHE_ROOT": "<redacted>", "VLLM_HOST_IP": "<redacted>"})
        self.assertNotIn("VLLM_API_KEY", environment["envVars"], "a name that says key is never recorded, even on the allowlist")
        self.assertNotIn("HF_TOKEN", json.dumps(environment))

    def test_the_notes_say_what_was_left_out_and_name_no_value(self) -> None:
        notes = self.probe()["notes"]
        self.assertIn("VLLM_API_KEY is on the lab's allowlist and its name says it holds a secret, so it is never recorded", notes)
        self.assertIn("vllm is not installed in this environment", notes)

    def test_the_scrubbed_log_keeps_every_line_that_the_reading_needs(self) -> None:
        result = self.probe()
        cleaned = result["cleaned_log"]
        self.assertNotEqual(cleaned, self.raw_log)
        self.assertEqual(found_in(cleaned, real_names()), [])
        dump = json.loads((self.folder / "dump.json").read_text(encoding="utf-8"))
        before, after = read_engine_config(EngineRun(self.raw_log, dump)), read_engine_config(EngineRun(cleaned, dump))
        self.assertTrue(before.ok)
        self.assertEqual((before.config, before.evidence), (after.config, after.evidence))

    def test_the_receipt_of_the_engine_lab_records_the_configuration_and_nothing_personal_with_it(self) -> None:
        bundle = json.loads(self.probe()["bundle"])
        receipt = bundle["receipt"]
        self.assertEqual(receipt["environment"]["engineConfig"]["runner"], "MRV2")
        self.assertEqual(bundle["artifacts"]["engine-log"]["encoding"], "text")
        self.assertEqual(found_in(bundle["artifacts"]["engine-log"]["data"], real_names()), [])


class InProcess(unittest.TestCase):
    """The same promise at the unit level, without a subprocess: the seeds are in a `Probes` environment, and a fake NVML is asked."""

    def test_nothing_seeded_reaches_the_fingerprint(self) -> None:
        from enginespace_grader import fingerprint

        from .fakes import probes

        nvml = fake_nvml.FakeNvml(gpus=[RTX_4090])
        environ = {"HOSTNAME": HOST, "USER": USER, "HOME": HOME, "HF_TOKEN": TOKEN, "NVIDIA_VISIBLE_DEVICES": RTX_4090["uuid"], "VLLM_CACHE_ROOT": HOME + "/.cache", "VLLM_X": "1"}
        found = fingerprint.gather("local", env_allow=["VLLM_CACHE_ROOT", "VLLM_X"], probes=probes(nvml=nvml, environ=environ))
        text = json.dumps([found.environment, found.notes])
        self.assertEqual(found_in(text, real_names()), [])
        self.assertEqual(found.environment["envVars"], {"VLLM_CACHE_ROOT": "<redacted>", "VLLM_X": "1"})
        self.assertEqual(set(nvml.calls) & set(FORBIDDEN), set())


if __name__ == "__main__":
    unittest.main()
