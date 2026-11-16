"""`enginespace trace export <input> --format torch|nsys-sqlite` (ARCHITECTURE section 9.4): a capture in, `trace@1` out.

    enginespace trace export rank0.pt.trace.json --format torch --out rank0.trace.json --engine vllm --engine-version 0.33.0 --gpu "NVIDIA GeForce RTX 4090" --captured-at 2026-11-20T10:00:00Z
    enginespace trace export report.sqlite --format nsys-sqlite --source owner ...

The output is the canonical text of the trace (model.py), so its SHA-256 is the hash that the site computes of it, and `meta.sha256` is the SHA-256 of the capture that
it was made from. What the command reads is one file, and what it writes is one file: nothing else is read, and nothing leaves the machine. The names in the capture go
through the scrubber of redact.py before they reach the file, because a Python frame's name holds a path, and a published trace must not.

Exit status: 0 the trace was written; 2 a usage error or an input that cannot be read; 3 the capture cannot be made into a trace (the message says why).
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

from ..errors import GraderError
from .assemble import DEFAULT_STEP_NAME, Options, assemble
from .model import TraceFormatError, encode_trace

__all__ = ["FORMATS", "main"]

FORMATS = ("torch", "nsys-sqlite")

#: The largest capture that the torch reader takes [estimated]: it reads the whole JSON into memory, and a profiler's file for a few steps is tens of MiB.
MAX_TORCH_BYTES = 1024 * 1024 * 1024

EXIT_OK, EXIT_USAGE, EXIT_COULD_NOT_RUN = 0, 2, 3


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="enginespace trace export",
        description="Normalise a profiler capture into trace@1: the columns that the course's trace viewer, attribution and checks read. "
        "Exit status: 0 written, 2 a usage error or an unreadable file, 3 the capture cannot be made into a trace.",
    )
    parser.add_argument("input", metavar="INPUT", help="a torch-profiler Chrome trace (.json), or an Nsight Systems export (.sqlite)")
    parser.add_argument("--format", required=True, choices=FORMATS, help="torch: profiler Chrome JSON; nsys-sqlite: `nsys export --type sqlite`")
    parser.add_argument("--out", metavar="FILE", help="where the trace goes (default: INPUT's name with .trace.json, beside it)")
    parser.add_argument("--source", choices=("learner", "owner", "synthetic"), default="learner", help="who made the capture (default: learner); a synthetic capture is labelled so")
    parser.add_argument("--engine", help="the engine's name, as meta.engine (the capture does not say)")
    parser.add_argument("--engine-version", dest="engine_version", help="the engine's version, as meta.version")
    parser.add_argument("--gpu", help="the GPU's name, as meta.gpu (default: the one the capture names, when it names one)")
    parser.add_argument("--captured-at", dest="captured_at", metavar="UTC", help="when it was captured, as 2026-11-20T10:00:00Z (the capture does not say)")
    parser.add_argument("--step-name", dest="step_name", default=DEFAULT_STEP_NAME, metavar="REGEX", help=r"the annotation ranges that are steps (default: ^ProfilerStep#\d+$)")
    parser.add_argument("--main-thread", dest="main_thread", metavar="ID", help="the engine's main thread, by the id the notes print (default: the thread that carries the step ranges)")
    return parser


def _out_path(args: argparse.Namespace, source: Path) -> Path:
    if args.out:
        return Path(args.out)
    return source.with_name(source.name.rsplit(".", 1)[0] + ".trace.json") if "." in source.name else source.with_name(source.name + ".trace.json")


def main(argv: Sequence[str]) -> int:
    args = _parser().parse_args(list(argv))
    source = Path(args.input)
    if not source.is_file():
        sys.stderr.write(f"enginespace trace export: {source.name}: no such file\n")
        return EXIT_USAGE
    out = _out_path(args, source)
    if out.resolve() == source.resolve():
        sys.stderr.write("enginespace trace export: --out is the input file, and the export would overwrite the capture\n")
        return EXIT_USAGE

    options = Options(
        source=args.source,
        engine=args.engine,
        version=args.engine_version,
        gpu=args.gpu,
        captured_at=args.captured_at,
        main_thread=args.main_thread,
        raw_sha256=_sha256_file(source),
        step_name=args.step_name,
    )
    if args.format == "torch":
        from . import torch_profiler

        if source.stat().st_size > MAX_TORCH_BYTES:
            raise GraderError(f"{source.name} is larger than {MAX_TORCH_BYTES // (1024 * 1024)} MiB, which is more than this reader holds in memory: capture fewer steps")
        capture = torch_profiler.read_capture(source.read_bytes(), options)
    else:
        from . import nsys

        capture = nsys.read_capture(source, options)

    document, report = assemble(capture, options)
    try:
        text = encode_trace(document)
    except TraceFormatError as error:
        raise GraderError(f"the capture does not make a trace@1: {error}") from error
    data = text.encode("utf-8")

    out.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=out.name + ".", suffix=".part", dir=out.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
        # mkstemp makes a file that only its owner can read, and a trace is a file to share: it gets what the user's umask gives any new file.
        umask = os.umask(0)
        os.umask(umask)
        os.chmod(temporary, 0o666 & ~umask)
        os.replace(temporary, out)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise

    from ..fetch import shown  # here and not at the top: a command loads only when it runs

    sys.stdout.write(f"wrote {shown(out)} ({len(data):,} bytes)\n")
    sys.stdout.write(f"  trace sha256 {hashlib.sha256(data).hexdigest()}\n")
    sys.stdout.write(f"  capture sha256 {options.raw_sha256}\n")
    sys.stdout.write(f"  {report.spans:,} spans on {report.tracks} tracks, {report.flows:,} flows, {report.marks} step marks ({report.windows} step windows)\n")
    for line in report.notes:
        sys.stderr.write(f"note: {line}\n")
    if report.main_lane:
        sys.stderr.write(f"note: the main thread is {report.main_lane}\n")
    sys.stderr.write("note: run the site's checks on it: the Trace Room, or `traceChecks` (T2 to T5)\n")
    return EXIT_OK
