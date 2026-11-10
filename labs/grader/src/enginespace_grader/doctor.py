"""`enginespace doctor` (ARCHITECTURE section 9.4, 9.9): prints the fields that a receipt would record about this machine, before any `grade` run writes them.

What it prints is what `grade` records: both call `fingerprint.gather` with the same arguments, so the learner sees the receipt's `environment` first, and sees that
it holds no host name, no user name, no address, no GPU UUID or serial number, no path and no token (redact.py). Where something could not be read, a note says so.
With `--lab` it reads what `grade` would read for that lab: the engine that the lab runs and the variables on its allowlist.

An engine lab's receipt also records the effective engine configuration, which only a run can show (engine_config.py). `--engine-log` and `--engine-config` give doctor the
log and the configuration dump of an earlier run, and it prints what the grader would read from them and what it could not find.

The shape of the command, which prints the block of a receipt that describes the machine, is statespace's `doctor` (bench/statespace/doctor.py at 7b6938c). Its code is not used,
and the tests (not the command) check the block against the receipt's schema, since the command does not load `jsonschema`.

doctor is still a stub in the part that checks. The pin checks against `course.lock.json`, CUDA visibility, the disk, the model cache and the host driver against the
pin's requirement (R580 or newer for vLLM 0.33.0's CUDA 13 wheels) arrive with W2-T04, and until then it checks nothing and exits 0.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from . import fingerprint
from .engine_config import EngineRun, read_engine_config
from .errors import GraderError
from .identity import identity

__all__ = ["main"]

STUB_NOTE = (
    "doctor is a stub in this build: it prints the fingerprint (W2-T03) and checks nothing yet. The checks of the pins, the driver, CUDA, the disk and the model cache "
    "arrive with W2-T04."
)

#: The largest log that doctor reads [estimated]; a vLLM log of a long run is megabytes, and this is far above that.
MAX_LOG_BYTES = 64 * 1024 * 1024


def _read(path: str, what: str) -> str:
    try:
        file = Path(path)
        if file.stat().st_size > MAX_LOG_BYTES:
            raise GraderError(f"the {what} is larger than {MAX_LOG_BYTES // (1024 * 1024)} MiB, which is more than doctor reads")
        return file.read_text(encoding="utf-8", errors="replace")
    except OSError as error:
        raise GraderError(f"cannot read the {what}: {error.strerror or type(error).__name__}") from None


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="enginespace doctor", description="Print the fields that a receipt would record about this machine.")
    parser.add_argument("--json", action="store_true", help="print the fields as JSON")
    parser.add_argument("--host-kind", default="local", choices=fingerprint.HOST_KINDS, help="where the run happens, as a receipt records it (self-declared)")
    parser.add_argument("--lab", metavar="LAB", help="a lab id such as tr3.profile: print what a receipt for that lab would record (its engine and its allowlist of variables)")
    parser.add_argument("--engine-log", metavar="FILE", help="the log of an engine run: print the effective engine configuration that the grader would read from it")
    parser.add_argument("--engine-config", metavar="FILE", help="the configuration dump of that run (the JSON of /server_info?config_format=json, or of the VllmConfig)")
    args = parser.parse_args(list(argv) if argv is not None else None)

    engine: str | None = None
    allow: Sequence[str] = ()
    if args.lab:
        from .labs import load_lab

        lab = load_lab(args.lab)
        engine, allow = fingerprint.engine_for(lab.environment), lab.env_allowlist
    found = fingerprint.gather(args.host_kind, engine=engine, env_allow=allow)
    environment: dict[str, Any] = dict(found.environment)
    notes = list(found.notes)

    if args.engine_log or args.engine_config:
        log = _read(args.engine_log, "engine log") if args.engine_log else ""
        dump = _read(args.engine_config, "configuration dump") if args.engine_config else None
        reading = read_engine_config(EngineRun(log=log, config_dump=dump), engine or "vllm")
        if reading.config is not None:
            environment["engineConfig"] = reading.config
        notes.append(("engineConfig: " if reading.ok else "engineConfig is not complete: ") + reading.detail())

    grader = identity().as_object()
    if args.json:
        sys.stdout.write(json.dumps({"stub": True, "grader": grader, "environment": environment, "notes": notes}, indent=2, ensure_ascii=False) + "\n")
        return 0
    sys.stdout.write(f"{STUB_NOTE}\n\ngrader {grader['name']} {grader['version']}, source sha256 {grader['sourceSha256']}\n\n")
    sys.stdout.write("environment (exactly what a receipt records in `environment`; nothing is sent anywhere, and a receipt is a file you move yourself):\n")
    sys.stdout.write(json.dumps(environment, indent=2, ensure_ascii=False) + "\n")
    if notes:
        sys.stdout.write("\nnotes:\n" + "".join(f"  - {note}\n" for note in notes))
    if "engineConfig" not in environment and engine is not None:
        sys.stdout.write(
            "\nengineConfig is read from the engine's own log after a run (runner, graph mode, async scheduling, attention backend, max_num_batched_tokens, max_num_seqs). "
            "Pass --engine-log, and --engine-config for the dump, to see what the grader would read from an earlier run.\n"
        )
    return 0
