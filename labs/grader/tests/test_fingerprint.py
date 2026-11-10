"""The environment fingerprint (ARCHITECTURE section 9.5), from recorded `nvidia-smi` output and a fake NVML, a fake torch and a folder of fake installed distributions.

Everything here is SYNTHETIC (synthetic/README.md and fake_nvml.py): hand-written with invented values, so that no machine, and no person, is in the repository.
No test asks the machine it runs on: every source is a `Probes` field.
"""

from __future__ import annotations

import dataclasses
import importlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

from enginespace_grader import fingerprint
from enginespace_grader.errors import GraderError
from enginespace_grader.fingerprint import Fingerprint, gather
from enginespace_grader.receipt import enum_values, receipt_problems
from enginespace_grader.schemas import load_schema

from . import samples
from .fake_nvml import FAILS, FORBIDDEN, H100_SXM, MIB, NOT_SUPPORTED, RTX_4090, FakeNvml, NVMLError, NVMLError_LibraryNotFound
from .fakes import COMMIT, H100_TORCH, RTX_4090_TORCH, fake_smi, fake_torch, make_distribution, probes, sha256_hex, smi_text

RTX_4090_FROM_NVML: dict[str, Any] = {
    "name": "NVIDIA GeForce RTX 4090",
    "memoryBytes": 24564 * MIB,
    "computeCapability": "8.9",
    "maxSmClockMhz": 3105,
    "maxMemClockMhz": 10501,
    "powerLimitMw": 450_000,
    "pcieGen": 4,
    "pcieWidth": 16,
    "mig": "unsupported",
    "ecc": "unsupported",
    "virtualization": "none",
}
RTX_4090_FROM_SMI: dict[str, Any] = {key: value for key, value in RTX_4090_FROM_NVML.items() if key != "virtualization"}

#: What a query must never name (NVML and nvidia-smi both): a UUID, a serial number, a bus address.
FORBIDDEN_COLUMNS = {"uuid", "gpu_uuid", "serial", "gpu_serial", "pci.bus_id", "gpu_bus_id", "pci.bus", "pci.domain", "pci.device", "pci.device_id", "pci.sub_device_id"}


def assert_a_receipt_takes(case: unittest.TestCase, environment: dict[str, Any]) -> None:
    """The environment goes into a receipt that the site's schema and rules accept."""
    receipt = samples.sample_bundle()["receipt"]
    receipt["environment"] = environment
    case.assertEqual(receipt_problems(receipt), [])


class RecordedSmi(unittest.TestCase):
    """The CSV fallback, on output that is hand-written in nvidia-smi's formats."""

    def read(self, rows: str | None, **answers: str | None) -> Fingerprint:
        return gather("local", probes=probes(smi=fake_smi(rows, **answers)))

    def test_a_geforce_card_on_a_r580_driver(self) -> None:
        found = self.read(smi_text("rtx4090.csv"), version=smi_text("version-r580.txt"))
        self.assertEqual(found.environment["gpus"], [RTX_4090_FROM_SMI])
        self.assertEqual(found.environment["driver"], {"version": "580.82.07", "cudaVersion": "13.0"})

    def test_a_data_centre_card_with_mig_disabled_and_ecc_enabled(self) -> None:
        (gpu,) = self.read(smi_text("h100-sxm.csv")).environment["gpus"]
        self.assertEqual(gpu["name"], "NVIDIA H100 80GB HBM3")
        self.assertEqual((gpu["memoryBytes"], gpu["computeCapability"], gpu["pcieGen"]), (81559 * MIB, "9.0", 5))
        self.assertEqual((gpu["mig"], gpu["ecc"]), ("disabled", "enabled"))
        self.assertEqual((gpu["maxSmClockMhz"], gpu["maxMemClockMhz"], gpu["powerLimitMw"]), (1980, 2619, 700_000))

    def test_a_r570_driver_and_the_cuda_version_from_the_table_when_the_version_flag_is_unknown(self) -> None:
        found = self.read(smi_text("a100-r570-mig.csv"), banner=smi_text("banner-r570.txt"))
        self.assertEqual(found.environment["driver"], {"version": "570.158.01", "cudaVersion": "12.8"})
        self.assertEqual(found.environment["gpus"][0]["mig"], "enabled")

    def test_two_cards_are_two_entries(self) -> None:
        gpus = self.read(smi_text("two-l4.csv")).environment["gpus"]
        self.assertEqual([gpu["name"] for gpu in gpus], ["NVIDIA L4", "NVIDIA L4"])
        self.assertEqual(gpus[0], gpus[1])

    def test_an_older_driver_that_refuses_a_column_is_asked_the_small_question(self) -> None:
        calls: list[list[str]] = []
        found = gather("local", probes=probes(smi=fake_smi(None, minimal=smi_text("old-driver-minimal.csv"), calls=calls)))
        self.assertEqual(found.environment["gpus"], [{"name": "NVIDIA GeForce RTX 4090", "memoryBytes": 24564 * MIB}])
        self.assertEqual(found.environment["driver"], {"version": "535.183.01"}, "no CUDA version when neither --version nor the table gives one")
        self.assertEqual([call[0].count(",") for call in calls if call and call[0].startswith("--query-gpu=")], [10, 2])

    def test_units_that_were_left_in_and_a_not_supported_mode_are_read(self) -> None:
        (gpu,) = self.read(smi_text("with-units.csv")).environment["gpus"]
        self.assertEqual({key: gpu[key] for key in RTX_4090_FROM_SMI if key != "ecc"}, {key: value for key, value in RTX_4090_FROM_SMI.items() if key != "ecc"})
        self.assertEqual(gpu["ecc"], "unsupported")

    def test_a_mode_it_cannot_read_is_left_out_and_not_guessed(self) -> None:
        row = "NVIDIA L4, 23034, 8.9, 580.82.07, 2040, 6251, 72.00, 4, 16, [Insufficient Permissions], [Unknown Error]\n"
        (gpu,) = self.read(row).environment["gpus"]
        self.assertNotIn("mig", gpu)
        self.assertNotIn("ecc", gpu)

    def test_the_query_names_no_uuid_no_serial_number_and_no_bus_address(self) -> None:
        calls: list[list[str]] = []
        gather("local", probes=probes(smi=fake_smi(smi_text("rtx4090.csv"), version=smi_text("version-r580.txt"), calls=calls)))
        queried = [column for call in calls if call and call[0].startswith("--query-gpu=") for column in call[0].split("=", 1)[1].split(",")]
        self.assertEqual(queried, list(fingerprint.SMI_COLUMNS))
        self.assertEqual(FORBIDDEN_COLUMNS & set(queried), set())
        flags = {argument for call in calls for argument in call}
        self.assertEqual(flags & {"-L", "--list-gpus", "-q", "--query", "-x", "--xml-format"}, set(), "the list and the full query print UUIDs")

    def test_extra_columns_after_the_ones_asked_for_are_never_read(self) -> None:
        row = smi_text("rtx4090.csv").rstrip("\n") + ", GPU-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0, 1320423009876\n"
        found = self.read(row)
        self.assertNotIn("0f1e2d3c", json.dumps(found.environment))
        self.assertNotIn("1320423009876", json.dumps(found.environment))
        self.assertEqual(found.environment["gpus"], [RTX_4090_FROM_SMI])

    def test_a_line_that_is_not_a_row_costs_that_gpu_and_a_note(self) -> None:
        found = self.read("garbage\n\n" + smi_text("rtx4090.csv"))
        self.assertEqual(found.environment["gpus"], [RTX_4090_FROM_SMI])
        self.assertTrue(any("could not be read" in note for note in found.notes), found.notes)

    def test_no_nvidia_smi_is_no_gpu_and_a_note_and_not_an_error(self) -> None:
        found = self.read(None)
        self.assertEqual(found.environment["gpus"], [])
        self.assertNotIn("driver", found.environment)
        self.assertTrue(any("nvidia-smi is not available" in note for note in found.notes))
        self.assertTrue(any("no NVIDIA GPU was found" in note for note in found.notes))

    def test_more_cards_than_a_receipt_lists_are_cut_with_a_note(self) -> None:
        found = self.read(smi_text("rtx4090.csv") * 20)
        self.assertEqual(len(found.environment["gpus"]), fingerprint.MAX_GPUS)
        self.assertTrue(any("20 GPUs" in note for note in found.notes), found.notes)

    def test_what_it_reads_goes_into_a_receipt(self) -> None:
        for rows in ("rtx4090.csv", "h100-sxm.csv", "a100-r570-mig.csv", "two-l4.csv", "old-driver-minimal.csv", "with-units.csv"):
            assert_a_receipt_takes(self, self.read(smi_text(rows), banner=smi_text("banner-r570.txt")).environment)


class FakeNvmlSource(unittest.TestCase):
    def read(self, nvml: FakeNvml, **sources: Any) -> Fingerprint:
        return gather("local", probes=probes(nvml=nvml, **sources))

    def test_a_geforce_card(self) -> None:
        found = self.read(FakeNvml())
        self.assertEqual(found.environment["gpus"], [RTX_4090_FROM_NVML])
        self.assertEqual(found.environment["driver"], {"version": "580.82.07", "cudaVersion": "13.0"})

    def test_a_data_centre_card_and_a_driver_that_comes_back_as_bytes_from_an_older_binding(self) -> None:
        found = self.read(FakeNvml(gpus=[H100_SXM], driver=b"580.82.07"))
        (gpu,) = found.environment["gpus"]
        self.assertEqual((gpu["name"], gpu["mig"], gpu["ecc"], gpu["virtualization"]), ("NVIDIA H100 80GB HBM3", "disabled", "enabled", "none"))
        self.assertEqual(found.environment["driver"]["version"], "580.82.07")

    def test_a_mode_that_is_enabled(self) -> None:
        mig_on = dict(H100_SXM, mig=[1, 1], ecc=[0, 1])
        (gpu,) = self.read(FakeNvml(gpus=[mig_on])).environment["gpus"]
        self.assertEqual((gpu["mig"], gpu["ecc"]), ("enabled", "disabled"))

    def test_it_asks_for_no_uuid_no_serial_number_no_bus_address_and_shuts_down(self) -> None:
        nvml = FakeNvml(gpus=[RTX_4090, H100_SXM])
        found = self.read(nvml)
        self.assertEqual(len(found.environment["gpus"]), 2)
        self.assertEqual(set(nvml.calls) & set(FORBIDDEN), set())
        self.assertEqual(nvml.calls[0], "nvmlInit")
        self.assertEqual(nvml.calls[-1], "nvmlShutdown")
        text = json.dumps(found.environment)
        for gpu in (RTX_4090, H100_SXM):
            for key in ("uuid", "serial", "bus_id"):
                self.assertNotIn(gpu[key], text)

    def test_nvml_that_will_not_start_falls_back_to_nvidia_smi_and_says_why(self) -> None:
        nvml = FakeNvml(init_error=NVMLError_LibraryNotFound())
        found = self.read(nvml, smi=fake_smi(smi_text("rtx4090.csv")))
        self.assertEqual(found.environment["gpus"], [RTX_4090_FROM_SMI])
        self.assertIn("NVML did not start (NVMLError_LibraryNotFound)", found.notes)

    def test_nvml_is_asked_first_and_nvidia_smi_not_at_all_when_it_answers(self) -> None:
        calls: list[list[str]] = []
        found = self.read(FakeNvml(), smi=fake_smi(smi_text("h100-sxm.csv"), calls=calls))
        self.assertEqual(found.environment["gpus"][0]["name"], "NVIDIA GeForce RTX 4090")
        self.assertEqual(calls, [])

    def test_a_query_that_a_gpu_cannot_answer_costs_that_field_and_nothing_else(self) -> None:
        shy = dict(RTX_4090, pcie_gen=FAILS, max_sm_clock=NOT_SUPPORTED, power_mw=FAILS, mig=FAILS, virtualization=FAILS, capability=NOT_SUPPORTED)
        (gpu,) = self.read(FakeNvml(gpus=[shy])).environment["gpus"]
        for key in ("pcieGen", "maxSmClockMhz", "powerLimitMw", "mig", "computeCapability"):
            self.assertNotIn(key, gpu)
        self.assertEqual((gpu["name"], gpu["pcieWidth"], gpu["ecc"], gpu["virtualization"]), ("NVIDIA GeForce RTX 4090", 16, "unsupported", "unknown"))

    def test_the_virtualization_modes_of_nvml_fold_into_four(self) -> None:
        for number, word in ((0, "none"), (1, "passthrough"), (2, "vgpu"), (3, "vgpu"), (4, "unknown"), (99, "unknown")):
            (gpu,) = self.read(FakeNvml(gpus=[dict(RTX_4090, virtualization=number)])).environment["gpus"]
            self.assertEqual(gpu["virtualization"], word, number)

    def test_a_gpu_that_gives_no_name_or_no_memory_is_not_listed_and_a_note_says_so(self) -> None:
        found = self.read(FakeNvml(gpus=[dict(RTX_4090, total=FAILS), RTX_4090]))
        self.assertEqual(len(found.environment["gpus"]), 1)
        self.assertTrue(any("GPU 0" in note and "not listed" in note for note in found.notes), found.notes)

    def test_more_cards_than_a_receipt_lists_are_cut(self) -> None:
        found = self.read(FakeNvml(gpus=[RTX_4090] * 20))
        self.assertEqual(len(found.environment["gpus"]), 16)
        self.assertTrue(any("20 GPUs" in note for note in found.notes))

    def test_a_driver_version_that_is_not_a_version_is_left_out(self) -> None:
        self.assertNotIn("driver", self.read(FakeNvml(driver="not a version!")).environment)
        self.assertNotIn("driver", self.read(FakeNvml(driver=None)).environment)
        self.assertEqual(self.read(FakeNvml(cuda_version=None)).environment["driver"], {"version": "580.82.07"})

    def test_what_it_reads_goes_into_a_receipt(self) -> None:
        for gpus in ([RTX_4090], [H100_SXM], [RTX_4090, H100_SXM], [dict(RTX_4090, mig=FAILS, capability=FAILS)]):
            assert_a_receipt_takes(self, self.read(FakeNvml(gpus=gpus)).environment)

    def test_the_fake_raises_the_error_of_the_real_binding(self) -> None:
        # The real pynvml raises NVMLError subclasses with a `.value` (nvidia-ml-py 13.615.71, pynvml.py:1037), and the fingerprint reads that code.
        error = NVMLError(3)
        self.assertEqual(error.value, 3)
        fake = FakeNvml(gpus=[dict(RTX_4090, mig=NOT_SUPPORTED)])
        with self.assertRaises(NVMLError) as uninitialised:
            fake.nvmlDeviceGetMigMode(0)
        self.assertEqual(uninitialised.exception.value, 1, "NVML_ERROR_UNINITIALIZED, as the real binding raises before nvmlInit")
        fake.nvmlInit()
        with self.assertRaises(NVMLError) as unsupported:
            fake.nvmlDeviceGetMigMode(0)
        self.assertEqual(unsupported.exception.value, 3)


class Torch(unittest.TestCase):
    def test_cudnn_counts_in_ten_thousands_from_nine_and_in_thousands_before(self) -> None:
        for number, text in ((91002, "9.10.2"), (90100, "9.1.0"), (90800, "9.8.0"), (8907, "8.9.7"), (8600, "8.6.0"), (7605, "7.6.5")):
            self.assertEqual(fingerprint._cudnn_text(number), text, number)
        for bad in (None, "x", True, 0, -5):
            self.assertIsNone(fingerprint._cudnn_text(bad), bad)

    def test_the_version_cuda_and_cudnn(self) -> None:
        found = gather("local", probes=probes(torch=fake_torch()))
        self.assertEqual(found.environment["torch"], {"version": "2.14.0+cu130", "cuda": "13.0", "cudnn": "9.10.2"})

    def test_a_cpu_build_has_neither(self) -> None:
        found = gather("local", probes=probes(torch=fake_torch(version="2.14.0+cpu", cuda=None, cudnn=None)))
        self.assertEqual(found.environment["torch"], {"version": "2.14.0+cpu"})

    def test_no_torch_is_version_zero_which_no_pin_matches(self) -> None:
        self.assertEqual(gather("local", probes=probes()).environment["torch"], {"version": fingerprint.NO_TORCH})

    def test_an_install_that_will_not_import_is_noted_and_keeps_the_version_of_the_distribution(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            make_distribution(Path(folder), "torch", "2.14.0+cu130")

            def broken() -> Any:
                raise OSError("libcudnn.so.9: cannot open shared object file")

            found = gather("local", probes=dataclasses.replace(probes(search_path=[folder]), torch=broken))
        self.assertEqual(found.environment["torch"], {"version": "2.14.0+cu130"})
        self.assertIn("torch is installed and could not be imported (OSError)", found.notes)
        self.assertNotIn("libcudnn", json.dumps(found.notes), "the message of the error may hold a path, and only the kind of error is said")

    def test_the_sm_count_comes_from_torch_by_the_gpus_name(self) -> None:
        found = gather("local", probes=probes(nvml=FakeNvml(gpus=[RTX_4090, H100_SXM]), torch=fake_torch(devices=[H100_TORCH, RTX_4090_TORCH])))
        counts = {gpu["name"]: gpu["smCount"] for gpu in found.environment["gpus"]}
        self.assertEqual(counts, {"NVIDIA GeForce RTX 4090": 128, "NVIDIA H100 80GB HBM3": 132}, "torch lists its devices in an order of its own")
        self.assertEqual(list(found.environment["gpus"][0]), [key for key in fingerprint.GPU_KEYS if key in found.environment["gpus"][0]], "the keys stay in the schema's order")

    def test_devices_of_one_name_that_disagree_give_no_count(self) -> None:
        odd = [RTX_4090_TORCH, dict(RTX_4090_TORCH, multi_processor_count=100)]
        (gpu,) = gather("local", probes=probes(nvml=FakeNvml(), torch=fake_torch(devices=odd))).environment["gpus"]
        self.assertNotIn("smCount", gpu)

    def test_the_compute_capability_is_filled_in_where_nvidia_smi_did_not_give_it(self) -> None:
        row = "NVIDIA GeForce RTX 4090, 24564, [N/A], 580.82.07, 3105, 10501, 450.00, 4, 16, [N/A], [N/A]\n"
        (gpu,) = gather("local", probes=probes(smi=fake_smi(row), torch=fake_torch(devices=[RTX_4090_TORCH]))).environment["gpus"]
        self.assertEqual((gpu["computeCapability"], gpu["smCount"]), ("8.9", 128))

    def test_with_neither_nvml_nor_nvidia_smi_torch_alone_lists_the_devices(self) -> None:
        found = gather("local", probes=probes(torch=fake_torch(devices=[RTX_4090_TORCH])))
        self.assertEqual(found.environment["gpus"], [{"name": "NVIDIA GeForce RTX 4090", "memoryBytes": 24 * 1024**3 - 1, "computeCapability": "8.9", "smCount": 128}])
        assert_a_receipt_takes(self, found.environment)

    def test_torch_without_cuda_lists_no_device(self) -> None:
        found = gather("local", probes=probes(torch=fake_torch(devices=[RTX_4090_TORCH], available=False)))
        self.assertEqual(found.environment["gpus"], [])

    def test_the_real_import_asks_only_when_the_distribution_is_there(self) -> None:
        with mock.patch.object(fingerprint.metadata, "version", side_effect=fingerprint.metadata.PackageNotFoundError("torch")):
            with mock.patch.object(importlib, "import_module", side_effect=AssertionError("torch must not be imported")):
                self.assertIsNone(fingerprint.import_torch())


class Engine(unittest.TestCase):
    def test_the_engine_with_its_commit_and_the_hash_of_its_record(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            record = make_distribution(Path(folder), "vllm", "0.33.0", commit=COMMIT)
            found = gather("local", engine="vllm", probes=probes(search_path=[folder]))
        self.assertEqual(found.environment["engine"], {"name": "vllm", "version": "0.33.0", "commit": COMMIT, "recordSha256": sha256_hex(record)})
        self.assertIn(b"\r\n", record, "the hash is over the bytes of the file, line endings included")

    def test_a_wheel_from_an_index_has_no_commit(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            make_distribution(Path(folder), "sglang", "0.5.23")
            engine = gather("local", engine="sglang", probes=probes(search_path=[folder])).environment["engine"]
        self.assertEqual(set(engine), {"name", "version", "recordSha256"})

    def test_the_name_of_the_distribution_is_matched_the_way_pip_matches_it(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            make_distribution(Path(folder), "nano_vllm", "0.2.0")
            engine = gather("local", engine="nano-vllm", probes=probes(search_path=[folder])).environment["engine"]
        self.assertEqual((engine["name"], engine["version"]), ("nano-vllm", "0.2.0"))

    def test_an_engine_that_is_not_installed_is_a_note_and_no_key(self) -> None:
        found = gather("local", engine="vllm", probes=probes())
        self.assertNotIn("engine", found.environment)
        self.assertIn("vllm is not installed in this environment", found.notes)

    def test_a_record_that_is_missing_is_a_note_and_no_hash(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            make_distribution(Path(folder), "vllm", "0.33.0", with_record=False)
            found = gather("local", engine="vllm", probes=probes(search_path=[folder]))
        self.assertNotIn("recordSha256", found.environment["engine"])
        self.assertIn("vllm has no RECORD, so it is not hashed", found.notes)

    def test_a_commit_that_is_not_forty_hex_digits_is_not_recorded(self) -> None:
        for commit in (COMMIT[:7], COMMIT.upper(), "g" * 40, COMMIT + "0"):
            with tempfile.TemporaryDirectory() as folder:
                make_distribution(Path(folder), "vllm", "0.33.0", commit=commit)
                self.assertNotIn("commit", gather("local", engine="vllm", probes=probes(search_path=[folder])).environment["engine"], commit)

    def test_a_version_a_receipt_cannot_hold_is_a_note(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            make_distribution(Path(folder), "vllm", "0.33.0 beta!")
            found = gather("local", engine="vllm", probes=probes(search_path=[folder]))
        self.assertNotIn("engine", found.environment)
        self.assertTrue(any("not one a receipt can hold" in note for note in found.notes))

    def test_an_engine_the_course_does_not_run_is_refused(self) -> None:
        with self.assertRaisesRegex(GraderError, "the engine is one of vllm, sglang, nano-vllm, not 'tensorrt'"):
            gather("local", engine="tensorrt", probes=probes())

    def test_the_engine_of_a_lab_is_its_environment_unless_that_is_the_cpu(self) -> None:
        self.assertEqual([fingerprint.engine_for(name) for name in ("cpu", "vllm", "sglang", "nano-vllm", "")], [None, "vllm", "sglang", "nano-vllm", None])

    def test_the_key_libraries_are_listed_by_distribution_in_a_fixed_order(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            for name, version in (("transformers", "4.57.0"), ("Triton", "3.4.0"), ("flashinfer_python", "0.7.2.post1"), ("numpy", "2.3.0")):
                make_distribution(Path(folder), name, version)
            libs = gather("local", probes=probes(search_path=[folder])).environment["libs"]
        self.assertEqual(libs, [{"name": "flashinfer-python", "version": "0.7.2.post1"}, {"name": "triton", "version": "3.4.0"}, {"name": "transformers", "version": "4.57.0"}])

    def test_no_library_is_an_empty_list(self) -> None:
        self.assertEqual(gather("local", probes=probes()).environment["libs"], [])


class EnvVars(unittest.TestCase):
    def read(self, allow: list[str], environ: dict[str, str]) -> Fingerprint:
        return gather("local", env_allow=allow, probes=probes(environ=environ))

    def test_only_the_allowlisted_variables_that_are_set_are_recorded(self) -> None:
        environ = {"VLLM_LOGGING_LEVEL": "INFO", "VLLM_USE_V2_MODEL_RUNNER": "0", "VLLM_NOT_ALLOWED": "1", "SGLANG_X": "1", "HOME": "/ho" + "me/x"}
        found = self.read(["VLLM_LOGGING_LEVEL", "VLLM_USE_V2_MODEL_RUNNER", "VLLM_UNSET"], environ)
        self.assertEqual(found.environment["envVars"], {"VLLM_LOGGING_LEVEL": "INFO", "VLLM_USE_V2_MODEL_RUNNER": "0"})

    def test_a_value_that_holds_a_path_an_address_or_a_token_is_withheld(self) -> None:
        environ = {"VLLM_CACHE_ROOT": "/ho" + "me/learnerq8/.cache/vllm", "VLLM_HOST_IP": "10.20.30.40", "VLLM_X_URL": "http://example.invalid/x", "VLLM_Y": "hf" + "_" + "A" * 34}
        found = self.read(sorted(environ), environ)
        self.assertEqual(found.environment["envVars"], dict.fromkeys(environ, "<redacted>"))

    def test_a_name_that_says_secret_is_never_recorded_even_on_the_allowlist(self) -> None:
        environ = {"VLLM_API_KEY": "abc12345", "SGLANG_AUTH_TOKEN": "abc12345", "VLLM_DB_PASSWORD": "abc12345"}
        found = self.read(sorted(environ), environ)
        self.assertEqual(found.environment["envVars"], {})
        self.assertEqual(sum("says it holds a secret" in note for note in found.notes), 3)

    def test_a_variable_about_counts_of_tokens_is_not_taken_for_a_secret(self) -> None:
        environ = {"VLLM_SHARED_EXPERTS_STREAM_TOKEN_THRESHOLD": "256", "VLLM_MAX_TOKENS_PER_EXPERT_FP4_MOE": "1024"}
        found = self.read(sorted(environ), environ)
        self.assertEqual(found.environment["envVars"], environ)
        self.assertFalse(any("secret" in note for note in found.notes), found.notes)

    def test_a_name_that_is_not_vllm_or_sglang_is_never_recorded(self) -> None:
        environ = {"HF_TOKEN": "abc12345", "PATH": "/usr/bin", "CUDA_VISIBLE_DEVICES": "0", "vllm_lower": "1", "VLLM_": "1"}
        found = self.read(sorted(environ), environ)
        self.assertEqual(found.environment["envVars"], {})
        self.assertEqual(sum("is not a VLLM_* or SGLANG_* variable" in note for note in found.notes), 5)

    def test_an_allowlist_that_is_too_long_for_a_receipt_is_a_fault_in_the_lab(self) -> None:
        with self.assertRaisesRegex(GraderError, "allows 65 environment variables"):
            self.read([f"VLLM_V{index}" for index in range(65)], {})
        self.assertEqual(self.read([f"VLLM_V{index}" for index in range(64)], {}).environment["envVars"], {})

    def test_the_cap_matches_the_schema(self) -> None:
        self.assertEqual(load_schema("receipt")["properties"]["environment"]["properties"]["envVars"]["maxProperties"], fingerprint.MAX_ENV_VARS)


class Host(unittest.TestCase):
    OS_RELEASE = 'NAME="Ubuntu"\nVERSION="24.04.1 LTS (Noble Numbat)"\nPRETTY_NAME="Ubuntu 24.04.1 LTS"\nID=ubuntu\nVERSION_ID="24.04"\n'
    CPUINFO = "processor\t: 0\nvendor_id\t: GenuineIntel\nmodel name\t: Intel(R) Xeon(R)   Platinum 8480+\ncpu MHz\t\t: 2000.000\n\nprocessor\t: 1\nmodel name\t: Other\n"

    def read(self, system: str = "Linux", **sources: Any) -> dict[str, Any]:
        with mock.patch.object(fingerprint.platform, "system", return_value=system):
            return fingerprint.read_host("local", probes(**sources))

    def test_linux_reads_the_distribution_and_the_cpu_from_their_files(self) -> None:
        host = self.read(files={"/etc/os-release": self.OS_RELEASE, "/proc/cpuinfo": self.CPUINFO})
        self.assertEqual(host["os"], "Ubuntu 24.04.1 LTS")
        self.assertEqual(host["cpu"], "Intel(R) Xeon(R) Platinum 8480+", "runs of white space are one space")
        self.assertEqual(list(host)[:2], ["kind", "os"])

    def test_a_distribution_without_a_pretty_name_is_its_name_and_version_and_without_a_file_is_linux(self) -> None:
        self.assertEqual(self.read(files={"/etc/os-release": 'NAME="Example OS"\nVERSION_ID=1.2\n'})["os"], "Example OS 1.2")
        self.assertEqual(self.read()["os"], "Linux")
        self.assertNotIn("cpu", self.read())

    def test_a_machine_with_a_hardware_line_and_no_model_name_is_named_by_it(self) -> None:
        self.assertEqual(self.read(files={"/proc/cpuinfo": "Hardware\t: Example SoC\nRevision\t: 1\n"})["cpu"], "Example SoC")

    def test_macos_asks_sysctl_for_the_cpu(self) -> None:
        with mock.patch.object(fingerprint.platform, "mac_ver", return_value=("15.1", ("", "", ""), "arm64")):
            host = self.read("Darwin", commands={("sysctl", "-n", "machdep.cpu.brand_string"): "Apple M2 Pro\n"})
        self.assertEqual((host["os"], host["cpu"]), ("macOS 15.1", "Apple M2 Pro"))

    def test_windows_and_anything_else_get_what_the_platform_module_says(self) -> None:
        with mock.patch.object(fingerprint.platform, "release", return_value="11"), mock.patch.object(fingerprint.platform, "processor", return_value="Intel64 Family 6"):
            host = self.read("Windows")
        self.assertEqual((host["os"], host["cpu"]), ("Windows 11", "Intel64 Family 6"))
        self.assertEqual(self.read("FreeBSD")["os"], "FreeBSD")

    def test_the_numbers_are_positive_integers_and_the_kind_is_what_the_learner_said(self) -> None:
        host = fingerprint.read_host("runpod", probes())
        self.assertEqual(host["kind"], "runpod")
        for key in ("cores", "ramBytes"):
            if key in host:
                self.assertIsInstance(host[key], int)
                self.assertGreater(host[key], 0)
        self.assertIsInstance(host["container"], bool)

    def test_ram_is_left_out_where_the_platform_cannot_say(self) -> None:
        with mock.patch.object(fingerprint.os, "sysconf", side_effect=ValueError("no such name")):
            self.assertNotIn("ramBytes", fingerprint.read_host("local", probes()))

    def test_podmans_mark_is_a_container_too(self) -> None:
        with mock.patch.object(fingerprint.os.path, "exists", lambda path: path == "/run/.containerenv"):
            self.assertTrue(fingerprint._in_container())

    def test_the_host_names_nothing_that_identifies_the_machine(self) -> None:
        host = fingerprint.read_host("local", probes())
        self.assertLessEqual(set(host), {"kind", "os", "kernel", "arch", "cpu", "cores", "ramBytes", "container"})


class Whole(unittest.TestCase):
    def machine(self, folder: str) -> fingerprint.Probes:
        return probes(
            nvml=FakeNvml(),
            torch=fake_torch(devices=[RTX_4090_TORCH]),
            environ={"VLLM_LOGGING_LEVEL": "INFO", "VLLM_CACHE_ROOT": "/opt/example/cache"},
            search_path=[folder],
            files={"/etc/os-release": Host.OS_RELEASE, "/proc/cpuinfo": Host.CPUINFO},
        )

    def test_a_gpu_machine_in_full_in_the_order_of_the_schema(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            make_distribution(Path(folder), "vllm", "0.33.0", commit=COMMIT)
            make_distribution(Path(folder), "triton", "3.4.0")
            with mock.patch.object(fingerprint.platform, "system", return_value="Linux"):
                found = gather("runpod", engine="vllm", env_allow=["VLLM_LOGGING_LEVEL", "VLLM_CACHE_ROOT"], probes=self.machine(folder))
        environment = found.environment
        self.assertEqual(list(environment), ["host", "gpus", "driver", "python", "torch", "engine", "libs", "envVars"])
        self.assertEqual(environment["host"]["kind"], "runpod")
        self.assertEqual(environment["gpus"][0]["smCount"], 128)
        self.assertEqual(environment["torch"], {"version": "2.14.0+cu130", "cuda": "13.0", "cudnn": "9.10.2"})
        self.assertEqual(environment["libs"], [{"name": "triton", "version": "3.4.0"}])
        self.assertEqual(environment["envVars"], {"VLLM_LOGGING_LEVEL": "INFO", "VLLM_CACHE_ROOT": "<redacted>"})
        self.assertEqual(found.notes, ())
        assert_a_receipt_takes(self, environment)

    def test_a_cpu_machine_has_no_gpu_no_driver_and_no_engine(self) -> None:
        found = gather("local", probes=probes())
        self.assertEqual(list(found.environment), ["host", "gpus", "python", "torch", "libs", "envVars"])
        self.assertEqual(found.environment["gpus"], [])
        assert_a_receipt_takes(self, found.environment)

    def test_collect_is_gather_without_the_notes_and_takes_the_same_options(self) -> None:
        p = probes(nvml=FakeNvml())
        self.assertEqual(fingerprint.collect("modal", probes=p), gather("modal", probes=p).environment)

    def test_a_test_can_replace_the_probes_that_collect_takes_when_it_is_given_none(self) -> None:
        with mock.patch.object(fingerprint, "default_probes", return_value=probes(nvml=FakeNvml())):
            self.assertEqual(fingerprint.collect("local")["gpus"], [RTX_4090_FROM_NVML])

    def test_a_source_that_raises_costs_its_field_and_not_the_fingerprint(self) -> None:
        def broken() -> Any:
            raise RuntimeError("boom")

        found = gather("local", probes=dataclasses.replace(probes(), nvml=broken))
        self.assertEqual(found.environment["gpus"], [])

    def test_a_host_kind_the_receipt_does_not_know_is_refused(self) -> None:
        with self.assertRaisesRegex(GraderError, "the host kind is one of local, runpod, modal, lambda, other, not 'aws'"):
            gather("aws", probes=probes())

    def test_the_kinds_and_the_limits_are_the_schemas(self) -> None:
        self.assertEqual(fingerprint.HOST_KINDS, enum_values("environment", "host", "kind"))
        environment = load_schema("receipt")["properties"]["environment"]["properties"]
        self.assertEqual(fingerprint.MAX_GPUS, environment["gpus"]["maxItems"])
        self.assertEqual(tuple(environment["gpus"]["items"]["properties"]), fingerprint.GPU_KEYS, "the keys of a GPU, in the schema's order")
        self.assertLessEqual(len(fingerprint.KEY_LIBRARIES), environment["libs"]["maxItems"])
        self.assertEqual(sorted(environment["gpus"]["items"]["properties"]["mig"]["enum"]), ["disabled", "enabled", "unsupported"])
        self.assertEqual(environment["gpus"]["items"]["properties"]["virtualization"]["enum"], ["none", "passthrough", "vgpu", "unknown"])

    def test_the_real_machine_is_fingerprinted_into_something_a_receipt_takes(self) -> None:
        # The one test that asks the machine it runs on, and it asks only for what it is: whatever this is (a laptop, a CI runner, a GPU host) must fit a receipt.
        assert_a_receipt_takes(self, fingerprint.gather("local").environment)


class Commands(unittest.TestCase):
    def test_a_command_gives_its_output_and_a_failing_or_missing_one_gives_none(self) -> None:
        self.assertEqual(fingerprint.run_command([sys.executable, "-c", "print('ok')"]), "ok\n")
        self.assertIsNone(fingerprint.run_command([sys.executable, "-c", "raise SystemExit(3)"]))
        self.assertIsNone(fingerprint.run_command(["/nonexistent/command"]))

    def test_a_command_that_takes_too_long_gives_none(self) -> None:
        self.assertIsNone(fingerprint.run_command([sys.executable, "-c", "import time; time.sleep(30)"], timeout=0.2))

    def test_a_command_gets_no_input(self) -> None:
        done = fingerprint.run_command([sys.executable, "-c", "import sys; print(repr(sys.stdin.read()))"])
        self.assertEqual(done, "''\n")

    def test_nvidia_smi_is_found_on_the_path_or_it_is_not_there(self) -> None:
        with mock.patch.object(fingerprint.shutil, "which", return_value=None):
            self.assertIsNone(fingerprint.run_smi(["--version"]))
        with mock.patch.object(fingerprint.shutil, "which", return_value=sys.executable), mock.patch.object(fingerprint, "run_command", return_value="x") as run:
            self.assertEqual(fingerprint.run_smi(["--version"]), "x")
            run.assert_called_once_with([sys.executable, "--version"])

    def test_nvml_is_the_module_pynvml_or_none(self) -> None:
        with mock.patch.object(importlib, "import_module", side_effect=ImportError):
            self.assertIsNone(fingerprint.import_nvml())
        sentinel = object()
        with mock.patch.object(importlib, "import_module", return_value=sentinel) as imported:
            self.assertIs(fingerprint.import_nvml(), sentinel)
            imported.assert_called_once_with("pynvml")

    def test_a_file_is_its_text_or_none(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "f"
            path.write_bytes(b"caf\xc3\xa9 \xff")
            self.assertEqual(fingerprint.read_text_file(str(path)), "café �")
            self.assertIsNone(fingerprint.read_text_file(str(Path(folder) / "missing")))


class LastLook(unittest.TestCase):
    def test_an_optional_field_that_holds_something_personal_is_left_out_with_a_note(self) -> None:
        cpuinfo = "model name\t: Generic CPU at /opt/example/secret-box\n"
        with mock.patch.object(fingerprint.platform, "system", return_value="Linux"):
            found = gather("local", probes=probes(files={"/proc/cpuinfo": cpuinfo}))
        self.assertNotIn("cpu", found.environment["host"])
        self.assertIn("host.cpu held something that looks personal, so it is left out", found.notes)
        self.assertNotIn("secret-box", json.dumps([found.environment, found.notes]))
        assert_a_receipt_takes(self, found.environment)

    def test_a_field_the_receipt_needs_stops_the_run_and_names_the_field_not_the_value(self) -> None:
        nvml = FakeNvml(gpus=[dict(RTX_4090, name="NVIDIA /opt/example/secret-box")])
        with self.assertRaises(GraderError) as caught:
            gather("local", probes=probes(nvml=nvml))
        self.assertIn("gpus[0].name", str(caught.exception))
        self.assertNotIn("secret-box", str(caught.exception))

    def test_a_host_name_in_a_free_text_field_is_left_out_too(self) -> None:
        with mock.patch.object(fingerprint.platform, "system", return_value="Linux"):
            found = gather("local", probes=probes(environ={"HOSTNAME": "gpu-box-7f3a9c"}, files={"/proc/cpuinfo": "model name\t: Intel Xeon gpu-box-7f3a9c\n"}))
        self.assertNotIn("cpu", found.environment["host"])
        self.assertNotIn("gpu-box-7f3a9c", json.dumps([found.environment, found.notes]))

    def test_the_schema_has_no_field_for_a_host_name_a_user_name_an_address_a_serial_number_or_a_uuid(self) -> None:
        # The strict schema is the door the last look stands behind: a key it does not name is refused (packages/schema/receipt.ts).
        for place, key in (("host", "hostname"), ("host", "user"), ("host", "ip"), ("host", "mac"), ("gpus/0", "uuid"), ("gpus/0", "serial"), ("gpus/0", "busId"), ("torch", "path")):
            receipt = samples.sample_bundle()["receipt"]
            node: Any = receipt["environment"]
            for part in place.split("/"):
                node = node[int(part)] if part.isdigit() else node[part]
            node[key] = "x"
            self.assertNotEqual(receipt_problems(receipt), [], f"{place}/{key}")

    def test_a_user_called_local_does_not_stop_the_host_kind_local(self) -> None:
        found = gather("local", probes=probes(environ={"USER": "local", "LOGNAME": "local"}))
        self.assertEqual(found.environment["host"]["kind"], "local")

    def test_a_note_never_holds_a_path(self) -> None:
        def broken() -> Any:
            raise OSError("/opt/example/secret-box/libcudnn.so.9: cannot open shared object file")

        found = gather("local", probes=dataclasses.replace(probes(), torch=broken))
        self.assertNotIn("secret-box", json.dumps(found.notes))


class DoesNotLoad(unittest.TestCase):
    def test_gathering_the_fingerprint_does_not_load_jsonschema(self) -> None:
        code = "import sys; from enginespace_grader import fingerprint; fingerprint.gather('local'); print(sorted(m for m in ('jsonschema',) if m in sys.modules))"
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.strip().splitlines()[-1], "[]")


if __name__ == "__main__":
    unittest.main()
