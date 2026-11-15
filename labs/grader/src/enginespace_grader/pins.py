"""The pin checks (ARCHITECTURE section 8.5 rule 6, section 9.2, section 9.4; D-026, D-035; W2-T04).

Two files say what the course runs on, and both ship in the kit beside the grader:

- `course.lock.json` pins the engines (a release, a commit, or both). Its SHA-256 is the receipt's `pins.lockSha256`.
- `envs/<environment>/uv.lock` pins every package of the engine's environment: torch, the key libraries and the CUDA runtime. Its SHA-256 is `pins.envLockSha256`.

`check` compares what is installed (the fingerprint's own reading of this machine) with those two files, and the host driver with what the environment's CUDA needs.
`local_pins` turns the comparison into the receipt's `pins` block, and `enginespace doctor` prints it. A machine that cannot be compared (no lock found, no engine
installed) is never called on the pins: `grade` stops, and `doctor` says what is missing.

What it can and cannot know:

- The installed version of a package is what its metadata says (pip's record), not what its files hold. Re-hashing the files against RECORD is not done here;
  `environment.engine.recordSha256` records the hash of RECORD, and a reviewer can compare.
- A build of vLLM or SGLang from PyPI has no commit that the machine can read, so its release is the evidence, as in the browser's rule 6 (packages/verify/pins.ts).
  nano-vllm is installed from a git commit, and pip records it (PEP 610).
- The driver's minimum for a CUDA generation is the course's own claim (D-035, vllm R4: R580 or newer for CUDA 13), not read from NVIDIA's table by this code.
  The CUDA generation of an environment is read from its lock: the major version of the locked `nvidia-cuda-runtime`.

Only the standard library is used (tomllib, json, hashlib), so doctor still starts without `jsonschema`.
"""

from __future__ import annotations

import json
import os
import re
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import fingerprint
from .errors import GraderError
from .hashing import sha256_hex
from .labs import Lab

__all__ = [
    "ENVIRONMENTS",
    "LOCK_NAME",
    "MIN_DRIVER_FOR_CUDA",
    "Finding",
    "PinReport",
    "check",
    "cuda_major",
    "find_kit_root",
    "local_pins",
    "read_course_lock",
    "read_env_lock",
]

#: The engine environments (labs/envs), and the name of the course lockfile.
ENVIRONMENTS = ("cpu", "vllm", "sglang", "nano-vllm")
LOCK_NAME = "course.lock.json"

#: The oldest host driver (its major number) that a CUDA generation's wheels need. The course claims it for CUDA 13 (D-035, ARCHITECTURE section 9.4, vllm R4),
#: and a generation not in the table is one that this code knows nothing about: the check says so and does not guess. If the owner pins v0.32.0 (CUDA 12.9),
#: the minimum for 12.9 comes from a claim with a source, and this table gains it in the same change.
MIN_DRIVER_FOR_CUDA: Mapping[int, int] = {13: 580}

#: Where the locks sit relative to the folder that holds course.lock.json: a kit has `envs/` beside it, the repository has it under `labs/`.
_ENV_FOLDERS = ("envs", "labs/envs")

#: The packages whose version tells which CUDA generation an environment's wheels are built for (the locked CUDA runtime, then the toolkit meta-package).
_CUDA_PACKAGES = ("nvidia-cuda-runtime", "cuda-toolkit")

_NAME = re.compile(r"[-_.]+")


def _normal(name: str) -> str:
    return _NAME.sub("-", name).lower()


def _release(version: str) -> str:
    """A version without its local label: `2.14.0+cpu` is release `2.14.0` (PEP 440)."""
    return version.split("+", 1)[0]


@dataclass(frozen=True)
class Finding:
    """One comparison: what was looked at, whether it holds, and a sentence for the person at the keyboard (no path, no name)."""

    name: str
    ok: bool
    detail: str
    #: Whether a failure of this finding makes the run off the pins (the receipt's `offPin`). A driver that is too old is not a pin.
    pin: bool = True


@dataclass(frozen=True)
class PinReport:
    environment: str
    lock_sha256: str
    env_lock_sha256: str
    findings: tuple[Finding, ...]

    @property
    def off_pin(self) -> list[str]:
        return [finding.name for finding in self.findings if finding.pin and not finding.ok]

    @property
    def ok(self) -> bool:
        return all(finding.ok for finding in self.findings)

    def as_receipt_pins(self) -> dict[str, Any]:
        off = self.off_pin
        return {"lockSha256": self.lock_sha256, "envLockSha256": self.env_lock_sha256, "onPin": not off, "offPin": off}


# --- Finding the files --------------------------------------------------------------------------------------------------------------------------------


def _has_lock(folder: Path) -> bool:
    return (folder / LOCK_NAME).is_file()


def find_kit_root(start: str | os.PathLike[str] | None = None) -> Path | None:
    """The folder that holds course.lock.json: the one named by `ENGINESPACE_KIT` if it is set, else the first of the working directory and its parents, else the
    first of the grader's own location and its parents (a checkout of the repository, where the grader runs from `labs/grader`). None if there is none."""
    explicit = os.environ.get("ENGINESPACE_KIT")
    if explicit:
        folder = Path(explicit)
        return folder if _has_lock(folder) else None
    starts: list[Path] = []
    try:
        starts.append(Path(start) if start is not None else Path.cwd())
    except OSError:
        pass
    starts.append(Path(__file__).resolve().parent)
    for begin in starts:
        for folder in (begin, *begin.parents):
            if _has_lock(folder):
                return folder
    return None


def _env_lock_path(root: Path, environment: str) -> Path | None:
    for folder in _ENV_FOLDERS:
        path = root / folder / environment / "uv.lock"
        if path.is_file():
            return path
    return None


def read_course_lock(text: str) -> dict[str, dict[str, Any]]:
    """The entries of course.lock.json by key. Only what the check reads is looked at; `verify:pins` holds the file to its schema."""
    try:
        document = json.loads(text)
        entries = document["entries"]
        return {entry["key"]: entry for entry in entries}
    except (ValueError, KeyError, TypeError):
        raise GraderError(f"{LOCK_NAME} is not a course lockfile (enginespace/lock@1): it has no list of entries with keys") from None


def read_env_lock(text: str) -> dict[str, set[str]]:
    """An environment's uv.lock as {normalised package name: the releases it locks}. A package that the lock holds twice (one per platform fork) has both."""
    try:
        document = tomllib.loads(text)
        packages = document["package"]
        found: dict[str, set[str]] = {}
        for package in packages:
            if "version" in package:
                found.setdefault(_normal(package["name"]), set()).add(_release(package["version"]))
        return found
    except (tomllib.TOMLDecodeError, KeyError, TypeError):
        raise GraderError("an environment's uv.lock could not be read as a uv lockfile") from None


def cuda_major(locked: Mapping[str, set[str]]) -> int | None:
    """The CUDA generation that an environment's wheels are built for: the major version of its locked CUDA runtime. None for an environment with none (the CPU one)."""
    for name in _CUDA_PACKAGES:
        for version in sorted(locked.get(name, ())):
            head = version.split(".", 1)[0]
            if head.isdigit():
                return int(head)
    return None


# --- The comparison -----------------------------------------------------------------------------------------------------------------------------------


def _engine_findings(engine: str, entry: Mapping[str, Any] | None, installed: Mapping[str, str] | None) -> list[Finding]:
    """The engine against course.lock.json, by the rule of packages/verify/pins.ts: the release when the lock pins one, and the commit when pip recorded one."""
    if entry is None:
        return [Finding(engine, False, f"{LOCK_NAME} has no entry {engine!r}, so its pin is not known")]
    if installed is None:
        return [Finding(engine, False, f"{engine} is not installed in this environment")]
    version, commit = entry.get("version"), entry.get("commit")
    problems: list[str] = []
    if version is not None and _release(installed["version"]) != version:
        problems.append(f"{engine} {installed['version']} is installed and the course pins {version}")
    if commit is not None:
        have = installed.get("commit")
        if have is None:
            if version is None:
                problems.append(f"the course pins {engine} at commit {commit[:12]} and the install records no commit")
        elif have != commit:
            problems.append(f"{engine} is at commit {have[:12]} and the course pins commit {commit[:12]}")
    if problems:
        return [Finding(engine, False, "; ".join(problems))]
    shown = f"{engine} {installed['version']}" + (f" at commit {installed['commit'][:12]}" if "commit" in installed else "")
    return [Finding(engine, True, f"{shown} is the pin")]


def _library_findings(locked: Mapping[str, set[str]], torch_version: str, libs: list[dict[str, str]]) -> list[Finding]:
    """torch and the key libraries against the environment's lock. A library the lock holds and the machine lacks is off the pin, and one the lock does not hold is not
    compared (the CPU environment holds no flashinfer)."""
    findings: list[Finding] = []
    wanted = locked.get("torch", set())
    if not wanted:
        findings.append(Finding("torch", False, "the environment's lock holds no torch, so its pin is not known"))
    elif torch_version == fingerprint.NO_TORCH:
        findings.append(Finding("torch", False, f"torch is not installed; the lock pins {', '.join(sorted(wanted))}"))
    elif _release(torch_version) in wanted:
        findings.append(Finding("torch", True, f"torch {torch_version} is the pin"))
    else:
        findings.append(Finding("torch", False, f"torch {torch_version} is installed and the lock pins {', '.join(sorted(wanted))}"))
    have = {lib["name"]: lib["version"] for lib in libs}
    for name in fingerprint.KEY_LIBRARIES:
        pinned = locked.get(_normal(name))
        if not pinned:
            continue
        if name not in have:
            findings.append(Finding(_normal(name), False, f"{name} is not installed; the lock pins {', '.join(sorted(pinned))}"))
        elif _release(have[name]) in pinned:
            findings.append(Finding(_normal(name), True, f"{name} {have[name]} is the pin"))
        else:
            findings.append(Finding(_normal(name), False, f"{name} {have[name]} is installed and the lock pins {', '.join(sorted(pinned))}"))
    return findings


def _driver_finding(locked: Mapping[str, set[str]], driver: Mapping[str, str] | None) -> Finding | None:
    """The host driver against what the environment's CUDA needs. None for an environment that needs none (CPU)."""
    generation = cuda_major(locked)
    if generation is None:
        return None
    needed = MIN_DRIVER_FOR_CUDA.get(generation)
    if needed is None:
        return Finding("driver", True, f"the environment is built for CUDA {generation}, and this build knows no driver minimum for it, so the driver is not checked", pin=False)
    if driver is None:
        return Finding("driver", False, f"the host driver could not be read; the environment's CUDA {generation} wheels need R{needed} or newer", pin=False)
    head = driver["version"].split(".", 1)[0]
    if not head.isdigit():
        return Finding("driver", False, f"the host driver version {driver['version']!r} is not one that can be compared with R{needed}", pin=False)
    if int(head) < needed:
        return Finding(
            "driver",
            False,
            f"the host driver is R{head} ({driver['version']}), and the environment's CUDA {generation} wheels need R{needed} or newer "
            "(D-035: on an older driver the course pins v0.32.0, the last minor with CUDA 12.9 builds)",
            pin=False,
        )
    return Finding("driver", True, f"the host driver R{head} ({driver['version']}) meets the R{needed} that CUDA {generation} needs", pin=False)


def check(
    environment: str,
    *,
    root: Path,
    environment_fingerprint: Mapping[str, Any],
) -> PinReport:
    """Compare a machine's fingerprint (`fingerprint.collect` for the lab's engine) with the course lock and the environment's lock under `root`."""
    if environment not in ENVIRONMENTS:
        raise GraderError(f"the environment is one of {', '.join(ENVIRONMENTS)}, not {environment!r}")
    course_text = (root / LOCK_NAME).read_bytes()
    entries = read_course_lock(course_text.decode("utf-8", errors="replace"))
    env_path = _env_lock_path(root, environment)
    if env_path is None:
        raise GraderError(f"the kit has no lock for the {environment} environment (envs/{environment}/uv.lock), so its pins cannot be checked")
    env_bytes = env_path.read_bytes()
    locked = read_env_lock(env_bytes.decode("utf-8", errors="replace"))

    findings: list[Finding] = []
    engine = fingerprint.engine_for(environment)
    if engine is not None:
        findings += _engine_findings(engine, entries.get(engine), environment_fingerprint.get("engine"))
    torch = environment_fingerprint.get("torch", {}).get("version", fingerprint.NO_TORCH)
    findings += _library_findings(locked, torch, list(environment_fingerprint.get("libs", [])))
    driver = _driver_finding(locked, environment_fingerprint.get("driver"))
    if driver is not None:
        findings.append(driver)
    return PinReport(environment, sha256_hex(course_text), sha256_hex(env_bytes), tuple(findings))


def local_pins(lab: Lab, probes: fingerprint.Probes | None = None, root: Path | None = None) -> dict[str, Any]:
    """The receipt's `pins` for this machine and this lab. Without a course lockfile to compare with, it stops: a receipt must not claim the pins unchecked."""
    folder = root if root is not None else find_kit_root()
    if folder is None:
        raise GraderError(
            f"{LOCK_NAME} was not found in the working directory, in its parents or beside the grader, so {lab.id}'s environment cannot be compared with the course's pins. "
            "Run the grader from the kit's folder, or set ENGINESPACE_KIT to it"
        )
    found = fingerprint.gather("local", engine=fingerprint.engine_for(lab.environment), probes=probes)
    return check(lab.environment, root=folder, environment_fingerprint=found.environment).as_receipt_pins()

