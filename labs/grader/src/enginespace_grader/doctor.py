"""`enginespace doctor` (ARCHITECTURE section 9.4, 9.9): prints the fields that a receipt would record about this machine, before any `grade` run writes them.

What it prints is what `grade` records: both call `fingerprint.gather` with the same arguments, so the learner sees the receipt's `environment` first, and sees that
it holds no host name, no user name, no address, no GPU UUID or serial number, no path and no token (redact.py). Where something could not be read, a note says so.
With `--lab` it reads what `grade` would read for that lab: the engine that the lab runs and the variables on its allowlist.

An engine lab's receipt also records the effective engine configuration, which only a run can show (engine_config.py). `--engine-log` and `--engine-config` give doctor the
log and the configuration dump of an earlier run, and it prints what the grader would read from them and what it could not find.

The shape of the command, which prints the block of a receipt that describes the machine, is statespace's `doctor` (bench/statespace/doctor.py at 7b6938c). Its code is not used,
and the tests (not the command) check the block against the receipt's schema, since the command does not load `jsonschema`.

With `--lab` or `--env` it also checks the machine against the course's pins (pins.py, W2-T04): the engine against `course.lock.json`, torch and the key libraries
against the environment's `uv.lock`, and the host driver against what the environment's CUDA needs (R580 or newer for vLLM 0.33.0's CUDA 13 wheels). A check that
fails is listed with its reason and doctor exits with status 1. The checks of CUDA visibility, the disk and the model cache are not built yet: doctor says so.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from . import fingerprint, pins
from .engine_config import EngineRun, read_engine_config
from .errors import GraderError
from .identity import identity

__all__ = ["main"]

NOT_CHECKED = "not checked in this build: CUDA visibility, the free disk and the model cache. The pins and the host driver are checked when --lab or --env says which environment."

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
    parser.add_argument("--env", metavar="ENV", choices=pins.ENVIRONMENTS, help=f"check the pins of this environment ({', '.join(pins.ENVIRONMENTS)}); --lab names one by itself")
    parser.add_argument("--engine-log", metavar="FILE", help="the log of an engine run: print the effective engine configuration that the grader would read from it")
    parser.add_argument("--engine-config", metavar="FILE", help="the configuration dump of that run (the JSON of /server_info?config_format=json, or of the VllmConfig)")
    args = parser.parse_args(list(argv) if argv is not None else None)

    engine: str | None = None
    allow: Sequence[str] = ()
    environment_name: str | None = args.env
    if args.lab:
        from .labs import load_lab

        lab = load_lab(args.lab)
        if args.env is not None and args.env != lab.environment:
            raise GraderError(f"{lab.id} runs in the {lab.environment} environment, not {args.env}")
        environment_name = lab.environment
        allow = lab.env_allowlist
    if environment_name is not None:
        engine = fingerprint.engine_for(environment_name)
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

    report: pins.PinReport | None = None
    if environment_name is None:
        notes.append("the pins were not checked: say which environment with --lab or --env")
    else:
        root = pins.find_kit_root()
        if root is None:
            notes.append(f"the pins were not checked: {pins.LOCK_NAME} was not found in the working directory, in its parents or beside the grader (ENGINESPACE_KIT names the kit's folder)")
        else:
            report = pins.check(environment_name, root=root, environment_fingerprint=environment)

    grader = identity().as_object()
    status = 0 if report is None or report.ok else 1
    if args.json:
        checks = None if report is None else {**report.as_receipt_pins(), "environment": report.environment, "ok": report.ok, "findings": [vars(f) for f in report.findings]}
        sys.stdout.write(json.dumps({"grader": grader, "environment": environment, "pins": checks, "notes": notes}, indent=2, ensure_ascii=False) + "\n")
        return status
    sys.stdout.write(f"grader {grader['name']} {grader['version']}, source sha256 {grader['sourceSha256']}\n\n")
    sys.stdout.write("environment (exactly what a receipt records in `environment`; nothing is sent anywhere, and a receipt is a file you move yourself):\n")
    sys.stdout.write(json.dumps(environment, indent=2, ensure_ascii=False) + "\n")
    if report is not None:
        sys.stdout.write(f"\npins, against {pins.LOCK_NAME} (sha256 {report.lock_sha256[:12]}) and the {report.environment} environment's uv.lock (sha256 {report.env_lock_sha256[:12]}):\n")
        for finding in report.findings:
            sys.stdout.write(f"  [{'ok' if finding.ok else 'FAIL'}] {finding.name}: {finding.detail}\n")
        sys.stdout.write("  " + ("on the pins\n" if not report.off_pin else f"OFF THE PINS: {', '.join(report.off_pin)}\n"))
    sys.stdout.write(f"\n{NOT_CHECKED}\n")
    if notes:
        sys.stdout.write("\nnotes:\n" + "".join(f"  - {note}\n" for note in notes))
    if "engineConfig" not in environment and engine is not None:
        sys.stdout.write(
            "\nengineConfig is read from the engine's own log after a run (runner, graph mode, async scheduling, attention backend, max_num_batched_tokens, max_num_seqs). "
            "Pass --engine-log, and --engine-config for the dump, to see what the grader would read from an earlier run.\n"
        )
    return status
