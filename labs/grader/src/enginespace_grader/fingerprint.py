"""The environment fingerprint (ARCHITECTURE section 9.5): what a receipt records about the machine, and nothing about whose it is.

`gather` builds the receipt's `environment` from facts of a known shape, each read from the place that knows it:

  GPUs      NVML through `nvidia-ml-py` (the module `pynvml`) when it imports and starts, else the CSV of `nvidia-smi --query-gpu`; the SM count, which neither gives,
            and the last resort when both are missing, come from torch. A GPU's name is what NVML reports, which is the truth: a rented "H100" may be an H200
            (ASSESSMENT section 5.6), and the floors and tolerances follow the name.
  driver    the driver version and the CUDA version it supports (NVML, or `nvidia-smi`). The R580 gate of D-035 reads the first.
  torch     its version, `torch.version.cuda` and cuDNN, from the installed distribution and, if it imports, from the module.
  engine    the distribution's name and version, the commit if pip recorded one (PEP 610), and the SHA-256 of its `RECORD`. Re-hashing the installed files
            against `RECORD` is the pin check's work (pins.py, W2-T04).
  libs      flashinfer, xgrammar, triton and transformers, by distribution, when installed.
  host      the operating system, the kernel release, the architecture, the CPU model, the cores, the RAM, and whether the process is in a container.
  envVars   only the `VLLM_*` and `SGLANG_*` variables on the lab's allowlist (`Lab.env_allowlist`), each scrubbed (redact.py).

The effective engine configuration of an engine lab (`engineConfig`) is not here: it comes from the engine's own log after a run (engine_config.py).

What it never collects (section 9.5): the host name, the user name, an IP or MAC address, a GPU's UUID or serial number, an absolute path, a token or a key, the full
environment. That is held in three places (redact.py explains): the code never asks for them (not NVML's `nvmlDeviceGetUUID`, `nvmlDeviceGetSerial` or
`nvmlDeviceGetPciInfo`, and not `uuid`, `serial` or `pci.bus_id` of `nvidia-smi`); the text it does take from the machine is scrubbed; and the finished fingerprint is
checked once more, where a field that still holds something personal is dropped, or stops the grader if the receipt needs it.

Every source is a parameter (`Probes`), so that the tests give it recorded `nvidia-smi` output and a fake NVML and no machine is asked. A source that is missing,
broken or silent costs the fingerprint a field and a note, never a crash; `doctor` prints the notes, and `grade` prints them before the run. The numbers here are
design parameters [estimated].
"""

from __future__ import annotations

import csv
import hashlib
import importlib
import importlib.metadata as metadata
import io
import json
import os
import platform
import re
import shutil
import subprocess
import warnings
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import redact
from .errors import GraderError

__all__ = ["ENGINES", "HOST_KINDS", "KEY_LIBRARIES", "NO_TORCH", "Fingerprint", "Probes", "collect", "default_probes", "engine_for", "gather"]

#: A receipt must name a torch version. A run on an install without torch names version 0, which no pin matches.
NO_TORCH = "0"

#: What a learner may say about where the run happens (packages/schema/receipt.ts, `HOST_KINDS`); tests/test_fingerprint.py compares it with the packaged schema.
HOST_KINDS = ("local", "runpod", "modal", "lambda", "other")

#: The engines that a lab can name as its environment (labs/__init__.py, `Lab.environment`), by the distribution that the engine installs.
ENGINES = ("vllm", "sglang", "nano-vllm")

#: The libraries that the fingerprint lists when they are installed (ARCHITECTURE section 9.5), by distribution name.
KEY_LIBRARIES = ("flashinfer-python", "xgrammar", "triton", "transformers")

#: How many entries a list holds at most (packages/schema/receipt.ts, `RECEIPT_LIMITS`).
MAX_GPUS, MAX_ENV_VARS = 16, 64

#: How long a command that the fingerprint runs may take [estimated]; `nvidia-smi` on a loaded host can take seconds.
COMMAND_TIMEOUT_S = 30

#: The columns of the one `nvidia-smi` query, and the smaller query to fall back on when an old driver does not know one of them. Neither asks for a UUID,
#: a serial number or a bus address. NVIDIA's page for nvidia-smi (docs.nvidia.com/deploy/nvidia-smi, read 2026-11-09) says that `--query-gpu=` takes a comma-separated
#: list of properties and `--format=csv,noheader,nounits`, and sends the reader to `--help-query-gpu` for the names, which it does not list: the names here are
#: [unverified] against that help, and the small query is what a driver that refuses one of them gets. The row format (a `, ` between cells, `[N/A]` and
#: `[Not Supported]` for a value the GPU cannot give) is [unverified] too: the synthetic files of tests/synthetic/nvidia-smi are written from it.
SMI_COLUMNS = (
    "name",
    "memory.total",
    "compute_cap",
    "driver_version",
    "clocks.max.sm",
    "clocks.max.memory",
    "power.limit",
    "pcie.link.gen.max",
    "pcie.link.width.max",
    "mig.mode.current",
    "ecc.mode.current",
)
SMI_MINIMAL_COLUMNS = ("name", "memory.total", "driver_version")

#: The keys of a GPU entry in the schema's order (packages/schema/receipt.ts, `gpuSchema`).
GPU_KEYS = ("name", "memoryBytes", "computeCapability", "smCount", "maxSmClockMhz", "maxMemClockMhz", "powerLimitMw", "pcieGen", "pcieWidth", "mig", "ecc", "virtualization")
#: Fields whose value is one of a fixed set of words, so that the last look need not suspect them.
ENUM_KEYS = ("kind", "mig", "ecc", "virtualization")

_VERSION = re.compile(r"[0-9][0-9A-Za-z.+_\-]{0,63}")
_ENV_NAME = re.compile(r"(?:VLLM|SGLANG)_[A-Z0-9_]{1,64}")
_COMPUTE_CAPABILITY = re.compile(r"[0-9]{1,2}\.[0-9]{1,2}")
_CUDA_VERSION = re.compile(r"CUDA (?:UMD )?Version\s*:?\s*([0-9]+\.[0-9]+)")
_COMMIT = re.compile(r"[0-9a-f]{40}")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_NUMBER = re.compile(r"\s*([0-9]+(?:\.[0-9]+)?)")
_MIB = 1024 * 1024
#: NVML's virtualization modes, folded into the schema's four: a host of vGPUs is `vgpu` like a guest (packages/schema/receipt.ts, `VIRTUALIZATION_MODES`).
_VIRTUALIZATION = {0: "none", 1: "passthrough", 2: "vgpu", 3: "vgpu"}


# --- The sources ----------------------------------------------------------------------------------------------------------------------------------------


def import_nvml() -> Any | None:
    """The `pynvml` module of `nvidia-ml-py`, or None if it is not installed."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")  # the package named pynvml, if it is the one installed, warns that nvidia-ml-py replaces it
            return importlib.import_module("pynvml")
    except ImportError:
        return None


def run_command(argv: Sequence[str], timeout: float = COMMAND_TIMEOUT_S) -> str | None:
    """The standard output of a command that ran and succeeded, and None for one that could not start, took too long or failed. Its input is empty.

    The pattern is statespace's (bench/statespace/doctor.py at 7b6938c, `run`): a command with a timeout that cannot fail the caller. Nothing was copied.
    """
    try:
        done = subprocess.run(list(argv), capture_output=True, text=True, errors="replace", timeout=timeout, stdin=subprocess.DEVNULL, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout if done.returncode == 0 else None


def run_smi(args: Sequence[str]) -> str | None:
    """The output of `nvidia-smi` with these arguments, or None when it is not on PATH or fails."""
    found = shutil.which("nvidia-smi")
    return run_command([found, *args]) if found else None


def import_torch() -> Any | None:
    """The `torch` module if the distribution is installed (None if not). An install that cannot be imported raises, and the caller says so."""
    try:
        metadata.version("torch")
    except metadata.PackageNotFoundError:
        return None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return importlib.import_module("torch")


def read_text_file(path: str) -> str | None:
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


@dataclass(frozen=True)
class Probes:
    """Where the fingerprint looks. The defaults ask the machine; a test gives each one a fake."""

    #: The NVML module (`pynvml`'s interface), or None if there is none.
    nvml: Callable[[], Any | None] = import_nvml
    #: Runs `nvidia-smi` with the arguments and returns its standard output, or None.
    smi: Callable[[Sequence[str]], str | None] = run_smi
    #: The `torch` module, None if it is not installed; it raises if it is installed and cannot be imported.
    torch: Callable[[], Any | None] = import_torch
    #: Runs any other command (macOS's `sysctl`) and returns its standard output, or None.
    run: Callable[[Sequence[str]], str | None] = run_command
    #: The text of a file (`/proc/cpuinfo`, `/etc/os-release`), or None.
    read_text: Callable[[str], str | None] = read_text_file
    #: The environment to read the allowlist from. None is this process's.
    environ: Mapping[str, str] | None = None
    #: Where to look for installed distributions. None is `sys.path`.
    search_path: Sequence[str] | None = None


def default_probes() -> Probes:
    """The probes of a real run. `collect` takes these when it is given none, and a test replaces this function to give `grade` and `doctor` a fake machine."""
    return Probes()


@dataclass(frozen=True)
class Fingerprint:
    """The receipt's `environment`, and what could not be read (sentences for the person at the keyboard; none holds a path or a name)."""

    environment: dict[str, Any]
    notes: tuple[str, ...]


# --- Small helpers --------------------------------------------------------------------------------------------------------------------------------------


def engine_for(environment: str) -> str | None:
    """The engine that a lab's environment (`cpu`, `vllm`, `sglang`, `nano-vllm`) runs, or None for the CPU lab."""
    return environment if environment in ENGINES else None


def _plain(value: Any, limit: int) -> str | None:
    """One line of plain text of at most `limit` characters, with runs of white space made one space; None if nothing is left."""
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str):
        return None
    text = " ".join(_CONTROL.sub(" ", value).split())
    return text[:limit] if text else None


def _int(value: Any, low: int = 1, high: int = 2**53 - 1) -> int | None:
    """`value` as an integer in [low, high], and None for anything else (a bool and a fraction included)."""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return value if isinstance(value, int) and not isinstance(value, bool) and low <= value <= high else None


def _version(value: Any) -> str | None:
    text = _plain(value, 64)
    return text if text is not None and _VERSION.fullmatch(text) else None


def _try(call: Callable[[], Any]) -> Any | None:
    """What a query gives, or None when it raises: a driver that does not know a query, a GPU that cannot answer it, a binding that lacks the function."""
    try:
        return call()
    except Exception:  # noqa: BLE001 - any failure of one optional query costs that field and nothing else
        return None


def _distribution(name: str, search_path: Sequence[str] | None) -> metadata.Distribution | None:
    wanted = re.sub(r"[-_.]+", "-", name).lower()
    if search_path is None:
        try:
            return metadata.distribution(name)
        except metadata.PackageNotFoundError:
            return None
    for found in metadata.distributions(path=list(search_path)):
        title = found.metadata["Name"] if found.metadata is not None else None
        if title and re.sub(r"[-_.]+", "-", title).lower() == wanted:
            return found
    return None


def _ordered(gpu: Mapping[str, Any]) -> dict[str, Any]:
    return {key: gpu[key] for key in GPU_KEYS if key in gpu}


# --- GPUs through NVML ----------------------------------------------------------------------------------------------------------------------------------


def _mode(nvml: Any, query: Callable[[], Any], enabled: int) -> str | None:
    """`enabled`, `disabled` or `unsupported` for a mode such as MIG or ECC; None if the GPU could not say."""
    try:
        current = query()[0]
    except Exception as error:  # noqa: BLE001 - NVMLError_NotSupported is how a GPU says it has no such mode
        return "unsupported" if getattr(error, "value", None) == getattr(nvml, "NVML_ERROR_NOT_SUPPORTED", 3) else None
    return "enabled" if current == enabled else "disabled"


def _nvml_gpu(nvml: Any, handle: Any) -> dict[str, Any] | None:
    name = _plain(_try(lambda: nvml.nvmlDeviceGetName(handle)), 128)
    memory = _int(_try(lambda: nvml.nvmlDeviceGetMemoryInfo(handle).total))
    if name is None or memory is None:
        return None
    gpu: dict[str, Any] = {"name": name, "memoryBytes": memory}
    capability = _try(lambda: nvml.nvmlDeviceGetCudaComputeCapability(handle))
    if isinstance(capability, (tuple, list)) and len(capability) == 2:
        text = f"{capability[0]}.{capability[1]}"
        if _COMPUTE_CAPABILITY.fullmatch(text):
            gpu["computeCapability"] = text
    clocks = (("maxSmClockMhz", getattr(nvml, "NVML_CLOCK_SM", 1)), ("maxMemClockMhz", getattr(nvml, "NVML_CLOCK_MEM", 2)))
    for key, clock in clocks:
        value = _int(_try(lambda clock=clock: nvml.nvmlDeviceGetMaxClockInfo(handle, clock)))
        if value is not None:
            gpu[key] = value
    for key, query, high in (
        ("powerLimitMw", lambda: nvml.nvmlDeviceGetPowerManagementLimit(handle), 2**53 - 1),
        ("pcieGen", lambda: nvml.nvmlDeviceGetMaxPcieLinkGeneration(handle), 9),
        ("pcieWidth", lambda: nvml.nvmlDeviceGetMaxPcieLinkWidth(handle), 32),
    ):
        value = _int(_try(query), high=high)
        if value is not None:
            gpu[key] = value
    for key, query, enabled in (
        ("mig", lambda: nvml.nvmlDeviceGetMigMode(handle), getattr(nvml, "NVML_DEVICE_MIG_ENABLE", 1)),
        ("ecc", lambda: nvml.nvmlDeviceGetEccMode(handle), getattr(nvml, "NVML_FEATURE_ENABLED", 1)),
    ):
        state = _mode(nvml, query, enabled)
        if state is not None:
            gpu[key] = state
    virtualization = _try(lambda: nvml.nvmlDeviceGetVirtualizationMode(handle))
    gpu["virtualization"] = _VIRTUALIZATION.get(virtualization, "unknown") if virtualization is not None else "unknown"
    return _ordered(gpu)


def _cuda_text(number: Any) -> str | None:
    """NVML's CUDA driver version (`13000`) as `13.0`."""
    value = _int(number)
    return f"{value // 1000}.{(value % 1000) // 10}" if value is not None else None


def read_nvml(nvml: Any, notes: list[str]) -> tuple[list[dict[str, Any]], dict[str, str] | None]:
    """(the GPUs, the driver) that NVML reports. It asks for no UUID, no serial number and no bus address."""
    try:
        nvml.nvmlInit()
    except Exception as error:  # noqa: BLE001 - no library, no driver, no permission: NVML cannot be used, and the next source is asked
        notes.append(f"NVML did not start ({type(error).__name__})")
        return [], None
    try:
        version = _version(_try(lambda: nvml.nvmlSystemGetDriverVersion()))
        driver = {"version": version} if version else None
        cuda = _cuda_text(_try(lambda: nvml.nvmlSystemGetCudaDriverVersion()))
        if driver is not None and cuda is not None:
            driver["cudaVersion"] = cuda
        count = _int(_try(lambda: nvml.nvmlDeviceGetCount()), low=0) or 0
        gpus: list[dict[str, Any]] = []
        for index in range(min(count, MAX_GPUS)):
            handle = _try(lambda index=index: nvml.nvmlDeviceGetHandleByIndex(index))
            gpu = _nvml_gpu(nvml, handle) if handle is not None else None
            if gpu is None:
                notes.append(f"NVML could not name GPU {index} or tell its memory, so it is not listed")
            else:
                gpus.append(gpu)
        if count > MAX_GPUS:
            notes.append(f"the machine has {count} GPUs, and a receipt lists {MAX_GPUS}")
        return gpus, driver
    finally:
        _try(lambda: nvml.nvmlShutdown())


# --- GPUs through nvidia-smi ----------------------------------------------------------------------------------------------------------------------------


def _smi_number(cell: str) -> float | None:
    found = _NUMBER.match(cell)
    return float(found.group(1)) if found else None


def _smi_mode(cell: str) -> str | None:
    word = cell.strip().lower()
    if word in ("enabled", "disabled"):
        return word
    return "unsupported" if word in ("[n/a]", "n/a", "[not supported]", "not supported") else None


def _smi_gpu(columns: Sequence[str], cells: Sequence[str]) -> dict[str, Any] | None:
    row = dict(zip(columns, (cell.strip() for cell in cells), strict=False))
    name = _plain(row.get("name"), 128)
    mib = _smi_number(row.get("memory.total", ""))
    memory = _int(round(mib * _MIB)) if mib is not None else None
    if name is None or memory is None:
        return None
    gpu: dict[str, Any] = {"name": name, "memoryBytes": memory}
    capability = row.get("compute_cap", "")
    if _COMPUTE_CAPABILITY.fullmatch(capability):
        gpu["computeCapability"] = capability
    for key, column, scale, high in (
        ("maxSmClockMhz", "clocks.max.sm", 1, 2**53 - 1),
        ("maxMemClockMhz", "clocks.max.memory", 1, 2**53 - 1),
        ("powerLimitMw", "power.limit", 1000, 2**53 - 1),
        ("pcieGen", "pcie.link.gen.max", 1, 9),
        ("pcieWidth", "pcie.link.width.max", 1, 32),
    ):
        number = _smi_number(row.get(column, ""))
        value = _int(round(number * scale), high=high) if number is not None else None
        if value is not None:
            gpu[key] = value
    for key, column in (("mig", "mig.mode.current"), ("ecc", "ecc.mode.current")):
        state = _smi_mode(row[column]) if column in row else None
        if state is not None:
            gpu[key] = state
    return _ordered(gpu)


def read_smi(probes: Probes, notes: list[str]) -> tuple[list[dict[str, Any]], dict[str, str] | None]:
    """(the GPUs, the driver) from `nvidia-smi --query-gpu`. It names its columns, and none is a UUID, a serial number or a bus address. The query has no column for the
    virtualization mode, so a GPU read this way has none."""
    columns = SMI_COLUMNS
    output = probes.smi([f"--query-gpu={','.join(columns)}", "--format=csv,noheader,nounits"])
    if output is None:  # an older driver refuses a column it does not know, and refuses the whole query
        columns = SMI_MINIMAL_COLUMNS
        output = probes.smi([f"--query-gpu={','.join(columns)}", "--format=csv,noheader,nounits"])
    if output is None:
        notes.append("nvidia-smi is not available or gave no answer")
        return [], None
    gpus: list[dict[str, Any]] = []
    versions: list[str] = []
    for cells in csv.reader(io.StringIO(output), skipinitialspace=True):
        if not cells:
            continue
        gpu = _smi_gpu(columns, cells) if len(cells) >= len(columns) else None
        if gpu is None:
            notes.append("a line of nvidia-smi's answer could not be read, so that GPU is not listed")
            continue
        version = _version(cells[columns.index("driver_version")])
        if version:
            versions.append(version)
        gpus.append(gpu)
    if len(gpus) > MAX_GPUS:
        notes.append(f"the machine has {len(gpus)} GPUs, and a receipt lists {MAX_GPUS}")
    gpus = gpus[:MAX_GPUS]
    if not gpus or not versions:
        return gpus, None
    driver = {"version": versions[0]}
    # The CUDA version is not a query column. `--version` prints it in the drivers that have the flag (the page says since v550), and the table that the command prints
    # with no arguments has it in its first lines; the page renames "CUDA Version" to "CUDA UMD Version" in its newest release, and the pattern takes both.
    for arguments in (["--version"], []):
        text = probes.smi(arguments)
        found = _CUDA_VERSION.search(text) if text else None
        if found:
            driver["cudaVersion"] = found.group(1)
            break
    return gpus, driver


# --- torch ----------------------------------------------------------------------------------------------------------------------------------------------


def _cudnn_text(number: Any) -> str | None:
    """cuDNN's version number as `major.minor.patch`: `91002` is 9.10.2 (cuDNN 9 counts in ten thousands), and `8907` is 8.9.7 (cuDNN 8 counts in thousands)."""
    value = _int(number)
    if value is None:
        return None
    major, rest = divmod(value, 10000) if value >= 90000 else divmod(value, 1000)
    minor, patch = divmod(rest, 100)
    return f"{major}.{minor}.{patch}"


def read_torch(probes: Probes, notes: list[str]) -> tuple[dict[str, str], list[dict[str, Any]]]:
    """(the receipt's `torch`, the CUDA devices that torch sees). Importing torch takes seconds, and a torch that is absent or built for the CPU sees no device."""
    module: Any | None = None
    try:
        module = probes.torch()
    except Exception as error:  # noqa: BLE001 - an install that is there and does not import: a missing library, a build for another platform
        notes.append(f"torch is installed and could not be imported ({type(error).__name__})")
    installed = _distribution("torch", probes.search_path) if module is None else None
    version = _version(getattr(module, "__version__", None)) if module is not None else (_version(installed.version) if installed is not None else None)
    info: dict[str, str] = {"version": version or NO_TORCH}
    devices: list[dict[str, Any]] = []
    if module is None:
        return info, devices
    cuda = _version(_try(lambda: module.version.cuda))
    if cuda:
        info["cuda"] = cuda
    cudnn = _cudnn_text(_try(lambda: module.backends.cudnn.version()))
    if cudnn and _VERSION.fullmatch(cudnn):
        info["cudnn"] = cudnn
    count = (_int(_try(lambda: module.cuda.device_count()), low=0) or 0) if _try(lambda: module.cuda.is_available()) else 0
    for index in range(min(count, MAX_GPUS)):
        properties = _try(lambda index=index: module.cuda.get_device_properties(index))
        device = _torch_device(properties) if properties is not None else None
        if device is not None:
            devices.append(device)
    return info, devices


def _torch_device(properties: Any) -> dict[str, Any] | None:
    name = _plain(getattr(properties, "name", None), 128)
    memory = _int(getattr(properties, "total_memory", None))
    if name is None or memory is None:
        return None
    device: dict[str, Any] = {"name": name, "memoryBytes": memory}
    capability = f"{getattr(properties, 'major', '')}.{getattr(properties, 'minor', '')}"
    if _COMPUTE_CAPABILITY.fullmatch(capability):
        device["computeCapability"] = capability
    sms = _int(getattr(properties, "multi_processor_count", None))
    if sms is not None:
        device["smCount"] = sms
    return device


def _with_torch(gpus: list[dict[str, Any]], devices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fills in what NVML and `nvidia-smi` do not give from torch, by the GPU's name (torch counts devices in an order of its own), and only where every device of
    that name agrees. With no GPU from either, the devices of torch are the GPUs."""
    if not gpus:
        return [_ordered(device) for device in devices]
    merged: list[dict[str, Any]] = []
    for gpu in gpus:
        filled = dict(gpu)
        same = [device for device in devices if device["name"] == gpu["name"]]
        for key in ("smCount", "computeCapability"):
            values = {device[key] for device in same if key in device}
            if key not in filled and len(values) == 1:
                filled[key] = values.pop()
        merged.append(_ordered(filled))
    return merged


# --- The engine, the libraries, the variables, the host -------------------------------------------------------------------------------------------------


def read_engine(name: str, probes: Probes, notes: list[str]) -> dict[str, str] | None:
    """The installed engine: its name and version, the commit pip recorded for a build from git (PEP 610), and the SHA-256 of the distribution's `RECORD`."""
    found = _distribution(name, probes.search_path)
    if found is None:
        notes.append(f"{name} is not installed in this environment")
        return None
    version = _version(found.version)
    if version is None:
        notes.append(f"the version of {name} is not one a receipt can hold")
        return None
    engine = {"name": name, "version": version}
    commit = None
    try:
        direct = json.loads(found.read_text("direct_url.json") or "null")
        commit = direct["vcs_info"]["commit_id"] if isinstance(direct, dict) else None
    except (ValueError, KeyError, TypeError, OSError):
        pass
    if isinstance(commit, str) and _COMMIT.fullmatch(commit):
        engine["commit"] = commit
    for entry in found.files or []:
        if entry.name == "RECORD" and entry.parent.name.endswith(".dist-info"):
            try:
                engine["recordSha256"] = hashlib.sha256(Path(str(found.locate_file(entry))).read_bytes()).hexdigest()
            except OSError:
                notes.append(f"the RECORD of {name} could not be read, so it is not hashed")
            break
    else:
        notes.append(f"{name} has no RECORD, so it is not hashed")
    return engine


def read_libs(probes: Probes) -> list[dict[str, str]]:
    libs: list[dict[str, str]] = []
    for name in KEY_LIBRARIES:
        found = _distribution(name, probes.search_path)
        version = _version(found.version) if found is not None else None
        if version:
            libs.append({"name": name, "version": version})
    return libs


def read_env_vars(allow: Iterable[str], environ: Mapping[str, str], sensitive: redact.Sensitive, kit_root: str | None, notes: list[str]) -> dict[str, str]:
    """The allowlisted `VLLM_*` and `SGLANG_*` variables that are set, each with its value scrubbed (`<redacted>` if it held a path, an address, a token, ...).

    A name that is not of that shape, or that says it holds a secret (a KEY, a TOKEN, a PASSWORD), is never recorded, even on the allowlist.
    """
    names = sorted(set(allow))
    if len(names) > MAX_ENV_VARS:
        raise GraderError(f"the lab allows {len(names)} environment variables, and a receipt records at most {MAX_ENV_VARS}. This is a fault in the lab")
    recorded: dict[str, str] = {}
    for name in names:
        if _ENV_NAME.fullmatch(name) is None:
            notes.append(f"{name} is on the lab's allowlist and is not a VLLM_* or SGLANG_* variable, so it is never recorded")
        elif redact.is_secret_name(name):
            notes.append(f"{name} is on the lab's allowlist and its name says it holds a secret, so it is never recorded")
        elif name in environ:
            recorded[name] = redact.scrub_value(environ[name], kit_root=kit_root, sensitive=sensitive)
    return recorded


def _in_container() -> bool:
    """Whether the process runs in a container that leaves the usual marks: Docker's `/.dockerenv`, Podman's `/run/.containerenv`, or a container runtime named in
    the first process's cgroups."""
    if os.path.exists("/.dockerenv") or os.path.exists("/run/.containerenv"):
        return True
    try:
        with open("/proc/1/cgroup", encoding="utf-8") as cgroups:
            text = cgroups.read()
        return any(word in text for word in ("docker", "kubepods", "containerd", "podman"))
    except OSError:
        return False


def _os_release_name(text: str) -> str | None:
    values: dict[str, str] = {}
    for line in text.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key.strip()] = value.strip().strip("\"'")
    return _plain(values.get("PRETTY_NAME") or " ".join(part for part in (values.get("NAME"), values.get("VERSION_ID")) if part), 128)


def _cpuinfo_model(text: str) -> str | None:
    for wanted in ("model name", "hardware"):
        for line in text.splitlines():
            key, separator, value = line.partition(":")
            if separator and key.strip().lower() == wanted and value.strip():
                return _plain(value, 128)
    return None


def read_host(kind: str, probes: Probes) -> dict[str, Any]:
    """The machine as a kind of machine: the operating system, the kernel release, the architecture, the CPU model, the cores, the RAM, and the container mark."""
    host: dict[str, Any] = {"kind": kind}
    system = platform.system()
    name: str | None = None
    cpu: str | None = None
    if system == "Linux":
        name = _os_release_name(probes.read_text("/etc/os-release") or "") or "Linux"
        cpu = _cpuinfo_model(probes.read_text("/proc/cpuinfo") or "")
    elif system == "Darwin":
        release = platform.mac_ver()[0]
        name = f"macOS {release}" if release else "macOS"
        cpu = _plain(probes.run(["sysctl", "-n", "machdep.cpu.brand_string"]), 128)
    elif system == "Windows":
        name = _plain(f"Windows {platform.release()}", 128)
        cpu = _plain(platform.processor(), 128)
    else:
        name = _plain(system, 128)
    for key, value in (("os", name), ("kernel", _plain(platform.release(), 128)), ("arch", _plain(platform.machine(), 32)), ("cpu", cpu)):
        if value:
            host[key] = value
    cores = _int(os.cpu_count())
    if cores:
        host["cores"] = cores
    try:
        ram = _int(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"))
    except (ValueError, OSError, AttributeError):  # not a platform with POSIX's sysconf names
        ram = None
    if ram:
        host["ramBytes"] = ram
    host["container"] = _in_container()
    return host


# --- Putting it together --------------------------------------------------------------------------------------------------------------------------------


#: What the receipt cannot do without (packages/schema/receipt.ts): the last look stops the run when one of these holds something personal, and drops any other field.
_REQUIRED_KEYS = frozenset({"name", "memoryBytes", "version", "kind"})
_REQUIRED_TOP = frozenset({"host", "gpus", "python", "torch", "libs", "envVars"})


def _dotted(pointer: str) -> str:
    """A JSON Pointer as a name for a note: `/gpus/0/name` is `gpus[0].name`. A pointer in a note would read as a path, and the scrubber would take it for one."""
    name = ""
    for part in pointer.split("/")[1:]:
        name += f"[{part}]" if part.isdigit() else ("." if name else "") + part
    return name or "the fingerprint"


def _drop(document: dict[str, Any], pointer: str) -> bool:
    """Removes the optional field at a JSON Pointer from `document`; False if the receipt needs that field."""
    parts = [part.replace("~1", "/").replace("~0", "~") for part in pointer.split("/")[1:]]
    if not parts or parts[-1] in _REQUIRED_KEYS or (len(parts) == 1 and parts[0] in _REQUIRED_TOP):
        return False
    node: Any = document
    for part in parts[:-1]:
        node = node[int(part)] if isinstance(node, list) else node[part]
    if isinstance(node, list):
        return False
    node.pop(parts[-1], None)
    return True


def gather(
    host_kind: str = "local",
    *,
    engine: str | None = None,
    env_allow: Iterable[str] = (),
    kit_root: str | os.PathLike[str] | None = None,
    probes: Probes | None = None,
) -> Fingerprint:
    """The receipt's `environment` for this machine, and the notes about what could not be read.

    `host_kind` is what the learner says about where the run happens. `engine` is the engine that the lab runs (`vllm`, `sglang` or `nano-vllm`; None for the CPU
    lab), and `env_allow` the lab's allowlist of `VLLM_*` and `SGLANG_*` variables. `kit_root` is the folder of the kit, which a path in a note is made relative to.
    """
    if host_kind not in HOST_KINDS:
        raise GraderError(f"the host kind is one of {', '.join(HOST_KINDS)}, not {host_kind!r}")
    if engine is not None and engine not in ENGINES:
        raise GraderError(f"the engine is one of {', '.join(ENGINES)}, not {engine!r}")
    source = default_probes() if probes is None else probes
    environ = os.environ if source.environ is None else source.environ
    try:
        root = os.fspath(kit_root) if kit_root is not None else os.getcwd()
    except OSError:
        root = None
    sensitive = redact.Sensitive.from_machine(environ)
    notes: list[str] = []

    gpus: list[dict[str, Any]] = []
    driver: dict[str, str] | None = None
    nvml = _try(source.nvml)
    if nvml is None:
        notes.append("nvidia-ml-py is not installed, so NVML was not used")
    else:
        gpus, driver = read_nvml(nvml, notes)
    if not gpus:
        gpus, driver = read_smi(source, notes)
    torch_info, devices = read_torch(source, notes)
    gpus = _with_torch(gpus, devices)
    if not gpus:
        notes.append("no NVIDIA GPU was found, so the receipt lists none (right for a CPU lab)")

    environment: dict[str, Any] = {"host": read_host(host_kind, source), "gpus": gpus}
    if driver is not None:
        environment["driver"] = driver
    environment["python"] = platform.python_version()
    environment["torch"] = torch_info
    if engine is not None:
        installed = read_engine(engine, source, notes)
        if installed is not None:
            environment["engine"] = installed
    environment["libs"] = read_libs(source)
    environment["envVars"] = read_env_vars(env_allow, environ, sensitive, root, notes)

    # The last look: nothing personal is left in what is about to be recorded. An optional field that holds something is dropped; a required one stops the run.
    for pointer in redact.find_leaks(environment, sensitive, ips=False, skip=ENUM_KEYS):
        if not _drop(environment, pointer):
            raise GraderError(f"the fingerprint's {_dotted(pointer)} holds something that looks personal, and a receipt needs it, so nothing was written. Report this as a fault in the grader")
        notes.append(f"{_dotted(pointer)} held something that looks personal, so it is left out")
    return Fingerprint(environment, tuple(redact.scrub_text(note, kit_root=root, sensitive=sensitive)[0] for note in notes))


def collect(host_kind: str = "local", **options: Any) -> dict[str, Any]:
    """The receipt's `environment` (`gather` without the notes). The keywords are `gather`'s."""
    return gather(host_kind, **options).environment
