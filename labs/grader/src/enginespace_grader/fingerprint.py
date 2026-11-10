"""The environment fingerprint (ARCHITECTURE section 9.5): what a receipt records about the machine.

This is the part of it that the standard library can read, which is all that W2-T02 needs to write a receipt on a CPU: the host, the Python version and
the torch version if torch is installed. W2-T03 builds the rest in this file, per section 9.5: the GPUs through NVML (`nvidia-ml-py`) or `nvidia-smi`,
the driver, torch's CUDA and cuDNN, the engine and its `RECORD` hash, the effective engine configuration, the key libraries, the allowlisted environment
variables, and the redaction of anything personal. `collect` keeps its name and its result's shape, so `doctor` and `grade` need no change when it grows.

Never collected, here or later (section 9.5): the host name, the user name, an IP or MAC address, a GPU's UUID or serial number, an absolute path, a
token or a key, or the whole environment. Every field below is a fact about the kind of machine, never about whose it is.
"""

from __future__ import annotations

import os
import platform
from importlib.metadata import PackageNotFoundError, version
from typing import Any

__all__ = ["NO_TORCH", "collect"]

#: A receipt must name a torch version. A run on an install without torch names version 0, which no pin matches.
NO_TORCH = "0"


def _in_container() -> bool:
    """Whether the process runs in a container that leaves the usual marks: Docker's `/.dockerenv`, or a container runtime named in the first process's cgroups."""
    if os.path.exists("/.dockerenv"):
        return True
    try:
        with open("/proc/1/cgroup", encoding="utf-8") as cgroups:
            text = cgroups.read()
        return any(word in text for word in ("docker", "kubepods", "containerd", "podman"))
    except OSError:
        return False


def _torch_version() -> str:
    try:
        return version("torch")
    except PackageNotFoundError:
        return NO_TORCH


def collect(host_kind: str = "local") -> dict[str, Any]:
    """The receipt's `environment`, as far as this build reads it. `host_kind` is what the learner says about where the run happens (`local`, `runpod`, `modal`, `lambda` or `other`)."""
    host: dict[str, Any] = {"kind": host_kind}
    for key, text in (("os", platform.system()), ("kernel", platform.release()), ("arch", platform.machine())):
        if text:
            host[key] = text
    cores = os.cpu_count()
    if cores:
        host["cores"] = cores
    host["container"] = _in_container()
    return {
        "host": host,
        "gpus": [],
        "python": platform.python_version(),
        "torch": {"version": _torch_version()},
        "libs": [],
        "envVars": {},
    }
