"""The invented machines of the fingerprint's tests: where their recorded output is, and the `Probes` that hand it to the code instead of asking a machine.

Everything the fingerprint reads comes through `fingerprint.Probes`, so a test builds a machine out of the files of `synthetic/` (hand-written `nvidia-smi` output and
vLLM logs, labelled SYNTHETIC in its README), a fake NVML (fake_nvml.py), a fake torch and a folder of fake installed distributions. No test asks the machine it runs on.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from enginespace_grader.fingerprint import SMI_COLUMNS, SMI_MINIMAL_COLUMNS, Probes

SYNTHETIC = Path(__file__).resolve().parent / "synthetic"

#: A good record for every distribution that `make_distribution` writes: a Python file and the dist-info files, as pip lists them.
COMMIT = "4ba787ec9959e566d3b587a796dff07673324da5"


def smi_text(name: str) -> str:
    return (SYNTHETIC / "nvidia-smi" / name).read_text(encoding="utf-8")


def vllm_text(name: str) -> str:
    return (SYNTHETIC / "vllm" / name).read_text(encoding="utf-8")


def vllm_json(name: str) -> dict[str, Any]:
    document: dict[str, Any] = json.loads(vllm_text(name))
    return document


def fake_smi(
    rows: str | None = None,
    *,
    minimal: str | None = None,
    version: str | None = None,
    banner: str | None = None,
    calls: list[list[str]] | None = None,
) -> Callable[[Sequence[str]], str | None]:
    """An `nvidia-smi` that answers the three kinds of call the fingerprint makes with the text it is given, and records the arguments of every call.

    `rows` answers the full query, `minimal` the small one that is tried when the full one fails (an older driver refuses a column it does not know), `version` is
    `--version` and `banner` is the table that a call with no arguments prints. A kind with no text answers as a failed command does: None.
    """

    def run(args: Sequence[str]) -> str | None:
        if calls is not None:
            calls.append(list(args))
        if args and args[0].startswith("--query-gpu="):
            columns = args[0].split("=", 1)[1].split(",")
            return rows if tuple(columns) == SMI_COLUMNS else minimal if tuple(columns) == SMI_MINIMAL_COLUMNS else None
        if list(args) == ["--version"]:
            return version
        return banner if not args else None

    return run


def fake_torch(
    version: str = "2.14.0+cu130",
    cuda: str | None = "13.0",
    cudnn: int | None = 91002,
    devices: Sequence[Mapping[str, Any]] = (),
    available: bool | None = None,
) -> Any:
    """What the fingerprint reads of the `torch` module: the version, `version.cuda`, `backends.cudnn.version()` and the properties of the CUDA devices."""
    properties = [SimpleNamespace(**device) for device in devices]
    return SimpleNamespace(
        __version__=version,
        version=SimpleNamespace(cuda=cuda),
        backends=SimpleNamespace(cudnn=SimpleNamespace(version=lambda: cudnn)),
        cuda=SimpleNamespace(
            is_available=lambda: bool(properties) if available is None else available,
            device_count=lambda: len(properties),
            get_device_properties=lambda index: properties[index],
        ),
    )


RTX_4090_TORCH = {"name": "NVIDIA GeForce RTX 4090", "total_memory": 24 * 1024**3 - 1, "major": 8, "minor": 9, "multi_processor_count": 128}
H100_TORCH = {"name": "NVIDIA H100 80GB HBM3", "total_memory": 80 * 1024**3 - 1, "major": 9, "minor": 0, "multi_processor_count": 132}


def make_distribution(
    root: Path,
    name: str,
    version: str,
    *,
    commit: str | None = None,
    record: bytes | None = None,
    with_record: bool = True,
) -> bytes:
    """Writes a fake installed distribution into `root`, as pip leaves one (`<name>-<version>.dist-info/` with METADATA, RECORD and, for a build from git, the
    `direct_url.json` of PEP 610). Returns the bytes of its RECORD, which the fingerprint hashes."""
    info = root / f"{name.replace('-', '_')}-{version}.dist-info"
    info.mkdir(parents=True)
    (info / "METADATA").write_text(f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n", encoding="utf-8")
    body = record if record is not None else f"{name.replace('-', '_')}/__init__.py,sha256=AAAA,12\r\n{info.name}/METADATA,,\r\n{info.name}/RECORD,,\r\n".encode()
    if with_record:
        (info / "RECORD").write_bytes(body)
    if commit is not None:
        (info / "direct_url.json").write_text(
            json.dumps({"url": "https://example.invalid/engine", "vcs_info": {"vcs": "git", "commit_id": commit, "requested_revision": "v0.33.0"}}), encoding="utf-8"
        )
    return body


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def probes(
    *,
    nvml: Any | None = None,
    smi: Callable[[Sequence[str]], str | None] | None = None,
    torch: Any | None = None,
    environ: Mapping[str, str] | None = None,
    search_path: Sequence[str] | None = (),
    files: Mapping[str, str] | None = None,
    commands: Mapping[tuple[str, ...], str] | None = None,
) -> Probes:
    """A machine that answers only what it is given: no NVML, no `nvidia-smi`, no torch, no files, no installed distributions and an empty environment, until a
    test adds one."""
    known_files = dict(files or {})
    known_commands = dict(commands or {})
    return Probes(
        nvml=lambda: nvml,
        smi=smi if smi is not None else (lambda args: None),
        torch=lambda: torch,
        run=lambda argv: known_commands.get(tuple(argv)),
        read_text=lambda path: known_files.get(path),
        environ=dict(environ or {}),
        search_path=list(search_path) if search_path is not None else None,
    )
