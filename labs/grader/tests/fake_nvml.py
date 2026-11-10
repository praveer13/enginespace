"""A fake of the NVML binding that `nvidia-ml-py` installs as the module `pynvml`, written by hand with invented values (SYNTHETIC: no GPU was asked).

The fingerprint reads NVML through this interface (fingerprint.read_nvml), so the tests give it this object where the real module would be. It answers the calls
that the fingerprint makes, with the types and the errors of the real binding (checked against nvidia-ml-py 13.615.71, `pynvml.py`): names come back as `str`,
memory as a struct with `total`, the MIG and ECC modes as `[current, pending]`, and a GPU that cannot answer raises `NVMLError` with the code `NVML_ERROR_NOT_SUPPORTED`.

It also answers the calls that a receipt must never make: `nvmlDeviceGetUUID`, `nvmlDeviceGetSerial`, `nvmlDeviceGetPciInfo` and `nvmlDeviceGetBoardPartNumber` return
invented personal values, and every call is recorded in `.calls`, so that a test can require that none of those was made, and that the values did not reach the output
even so.

The file is self-contained (standard library only), because the privacy test writes this very file as `pynvml.py` into a folder on a subprocess's PYTHONPATH. As that
module it builds a `FakeNvml` from the JSON in the environment variable FAKE_NVML_JSON, and appends the name of each call to the file named by FAKE_NVML_CALLS.
"""

from __future__ import annotations

import json
import os
from types import SimpleNamespace
from typing import Any

NVML_SUCCESS = 0
NVML_ERROR_UNINITIALIZED = 1
NVML_ERROR_NOT_SUPPORTED = 3
NVML_ERROR_DRIVER_NOT_LOADED = 9
NVML_ERROR_LIBRARY_NOT_FOUND = 12
NVML_CLOCK_GRAPHICS, NVML_CLOCK_SM, NVML_CLOCK_MEM = 0, 1, 2
NVML_FEATURE_DISABLED, NVML_FEATURE_ENABLED = 0, 1
NVML_DEVICE_MIG_DISABLE, NVML_DEVICE_MIG_ENABLE = 0, 1

#: In a GPU's description: the GPU cannot answer this query (it raises `NVMLError_NotSupported`), or fails it some other way.
NOT_SUPPORTED = "not-supported"
FAILS = "fails"

MIB = 1024 * 1024


class NVMLError(Exception):
    """The error of the real binding: `.value` is the NVML return code."""

    def __init__(self, value: int) -> None:
        super().__init__(f"NVML error {value}")
        self.value = value


class NVMLError_NotSupported(NVMLError):
    def __init__(self) -> None:
        super().__init__(NVML_ERROR_NOT_SUPPORTED)


class NVMLError_LibraryNotFound(NVMLError):
    def __init__(self) -> None:
        super().__init__(NVML_ERROR_LIBRARY_NOT_FOUND)


#: A GeForce card: no MIG and no ECC to ask about. The UUID, the serial number and the bus address are invented, and a receipt must hold none of them.
RTX_4090: dict[str, Any] = {
    "name": "NVIDIA GeForce RTX 4090",
    "total": 24564 * MIB,
    "capability": [8, 9],
    "max_sm_clock": 3105,
    "max_mem_clock": 10501,
    "power_mw": 450_000,
    "pcie_gen": 4,
    "pcie_width": 16,
    "mig": NOT_SUPPORTED,
    "ecc": NOT_SUPPORTED,
    "virtualization": 0,
    "uuid": "GPU-5a1c9e30-7b2d-4f68-9c41-e0d3a8b7f215",
    "serial": "1320423009876",
    "bus_id": "00000000:01:00.0",
}

#: A data-centre card: MIG disabled, ECC enabled.
H100_SXM: dict[str, Any] = {
    "name": "NVIDIA H100 80GB HBM3",
    "total": 81559 * MIB,
    "capability": [9, 0],
    "max_sm_clock": 1980,
    "max_mem_clock": 2619,
    "power_mw": 700_000,
    "pcie_gen": 5,
    "pcie_width": 16,
    "mig": [NVML_DEVICE_MIG_DISABLE, NVML_DEVICE_MIG_DISABLE],
    "ecc": [NVML_FEATURE_ENABLED, NVML_FEATURE_ENABLED],
    "virtualization": 0,
    "uuid": "GPU-c3d2e1f0-9a8b-4c7d-8e6f-0123456789ab",
    "serial": "1650722010123",
    "bus_id": "00000000:8B:00.0",
}

#: The names of the calls that this fake answers, which the module version exports at the top level.
API = (
    "nvmlInit",
    "nvmlShutdown",
    "nvmlSystemGetDriverVersion",
    "nvmlSystemGetCudaDriverVersion",
    "nvmlDeviceGetCount",
    "nvmlDeviceGetHandleByIndex",
    "nvmlDeviceGetName",
    "nvmlDeviceGetMemoryInfo",
    "nvmlDeviceGetCudaComputeCapability",
    "nvmlDeviceGetMaxClockInfo",
    "nvmlDeviceGetPowerManagementLimit",
    "nvmlDeviceGetMaxPcieLinkGeneration",
    "nvmlDeviceGetMaxPcieLinkWidth",
    "nvmlDeviceGetMigMode",
    "nvmlDeviceGetEccMode",
    "nvmlDeviceGetVirtualizationMode",
    "nvmlDeviceGetUUID",
    "nvmlDeviceGetSerial",
    "nvmlDeviceGetPciInfo",
    "nvmlDeviceGetBoardPartNumber",
)
#: What a receipt must never ask NVML for (ARCHITECTURE section 9.5).
FORBIDDEN = ("nvmlDeviceGetUUID", "nvmlDeviceGetSerial", "nvmlDeviceGetPciInfo", "nvmlDeviceGetBoardPartNumber")


class FakeNvml:
    NVMLError = NVMLError
    NVMLError_NotSupported = NVMLError_NotSupported
    NVML_ERROR_NOT_SUPPORTED = NVML_ERROR_NOT_SUPPORTED
    NVML_CLOCK_SM = NVML_CLOCK_SM
    NVML_CLOCK_MEM = NVML_CLOCK_MEM
    NVML_FEATURE_ENABLED = NVML_FEATURE_ENABLED
    NVML_DEVICE_MIG_ENABLE = NVML_DEVICE_MIG_ENABLE

    def __init__(
        self,
        gpus: list[dict[str, Any]] | None = None,
        driver: str | bytes | None = "580.82.07",
        cuda_version: int | None = 13000,
        init_error: Exception | None = None,
        calls_path: str | None = None,
    ) -> None:
        self.gpus = [dict(gpu) for gpu in (gpus if gpus is not None else [RTX_4090])]
        self.driver = driver
        self.cuda_version = cuda_version
        self.init_error = init_error
        self.calls: list[str] = []
        self.calls_path = calls_path
        self.running = False

    # --- the bookkeeping ---
    def _call(self, name: str) -> None:
        self.calls.append(name)
        if self.calls_path:
            with open(self.calls_path, "a", encoding="utf-8") as record:
                record.write(name + "\n")

    def _gpu(self, handle: int, name: str) -> dict[str, Any]:
        self._call(name)
        if not self.running:
            raise NVMLError(NVML_ERROR_UNINITIALIZED)
        return self.gpus[handle]

    def _answer(self, gpu: dict[str, Any], key: str) -> Any:
        value = gpu[key]
        if value == NOT_SUPPORTED:
            raise NVMLError_NotSupported()
        if value == FAILS:
            raise NVMLError(999)
        return value

    # --- the calls the fingerprint makes ---
    def nvmlInit(self) -> None:
        self._call("nvmlInit")
        if self.init_error is not None:
            raise self.init_error
        self.running = True

    def nvmlShutdown(self) -> None:
        self._call("nvmlShutdown")
        self.running = False

    def nvmlSystemGetDriverVersion(self) -> str | bytes:
        self._call("nvmlSystemGetDriverVersion")
        if self.driver is None:
            raise NVMLError(999)
        return self.driver

    def nvmlSystemGetCudaDriverVersion(self) -> int:
        self._call("nvmlSystemGetCudaDriverVersion")
        if self.cuda_version is None:
            raise NVMLError_NotSupported()
        return self.cuda_version

    def nvmlDeviceGetCount(self) -> int:
        self._call("nvmlDeviceGetCount")
        return len(self.gpus)

    def nvmlDeviceGetHandleByIndex(self, index: int) -> int:
        self._call("nvmlDeviceGetHandleByIndex")
        if not 0 <= index < len(self.gpus):
            raise NVMLError(2)
        return index

    def nvmlDeviceGetName(self, handle: int) -> str:
        return str(self._answer(self._gpu(handle, "nvmlDeviceGetName"), "name"))

    def nvmlDeviceGetMemoryInfo(self, handle: int) -> SimpleNamespace:
        total = self._answer(self._gpu(handle, "nvmlDeviceGetMemoryInfo"), "total")
        return SimpleNamespace(total=total, free=total - 4 * MIB, used=4 * MIB)

    def nvmlDeviceGetCudaComputeCapability(self, handle: int) -> tuple[int, int]:
        major, minor = self._answer(self._gpu(handle, "nvmlDeviceGetCudaComputeCapability"), "capability")
        return (major, minor)

    def nvmlDeviceGetMaxClockInfo(self, handle: int, clock: int) -> int:
        gpu = self._gpu(handle, "nvmlDeviceGetMaxClockInfo")
        return int(self._answer(gpu, "max_sm_clock" if clock == NVML_CLOCK_SM else "max_mem_clock"))

    def nvmlDeviceGetPowerManagementLimit(self, handle: int) -> int:
        return int(self._answer(self._gpu(handle, "nvmlDeviceGetPowerManagementLimit"), "power_mw"))

    def nvmlDeviceGetMaxPcieLinkGeneration(self, handle: int) -> int:
        return int(self._answer(self._gpu(handle, "nvmlDeviceGetMaxPcieLinkGeneration"), "pcie_gen"))

    def nvmlDeviceGetMaxPcieLinkWidth(self, handle: int) -> int:
        return int(self._answer(self._gpu(handle, "nvmlDeviceGetMaxPcieLinkWidth"), "pcie_width"))

    def nvmlDeviceGetMigMode(self, handle: int) -> list[int]:
        return list(self._answer(self._gpu(handle, "nvmlDeviceGetMigMode"), "mig"))

    def nvmlDeviceGetEccMode(self, handle: int) -> list[int]:
        return list(self._answer(self._gpu(handle, "nvmlDeviceGetEccMode"), "ecc"))

    def nvmlDeviceGetVirtualizationMode(self, handle: int) -> int:
        return int(self._answer(self._gpu(handle, "nvmlDeviceGetVirtualizationMode"), "virtualization"))

    # --- the calls a receipt must never make: they answer, and a test requires that nobody asked ---
    def nvmlDeviceGetUUID(self, handle: int) -> str:
        return str(self._gpu(handle, "nvmlDeviceGetUUID")["uuid"])

    def nvmlDeviceGetSerial(self, handle: int) -> str:
        return str(self._gpu(handle, "nvmlDeviceGetSerial")["serial"])

    def nvmlDeviceGetPciInfo(self, handle: int) -> SimpleNamespace:
        return SimpleNamespace(busId=self._gpu(handle, "nvmlDeviceGetPciInfo")["bus_id"])

    def nvmlDeviceGetBoardPartNumber(self, handle: int) -> str:
        self._gpu(handle, "nvmlDeviceGetBoardPartNumber")
        return "900-1G136-0000-000"


# --- As the module `pynvml`: the privacy test writes this file under that name, and the environment says what machine it is ---
if __name__ != "__main__" and os.environ.get("FAKE_NVML_JSON") is not None:
    _settings = json.loads(os.environ["FAKE_NVML_JSON"])
    _fake = FakeNvml(gpus=_settings.get("gpus"), calls_path=os.environ.get("FAKE_NVML_CALLS"))
    for _name in API:
        globals()[_name] = getattr(_fake, _name)
