"""An Nsight Systems SQLite export (`nsys export --type sqlite`, or `nsys profile --export=sqlite`) as a `Capture`.

The table and column names below are [unverified]: they are written from the schema as Nsight Systems documents it and as its exports are usually read, and no `nsys`
and no export of one was on the machine that wrote this (no GPU, no profiler). The pinned version is 2026.5.1 (proposed, ARCHITECTURE's table of pins; the download page offered
2026.6.1 on 2026-11-04), and the owner's first capture (W2-T21) is what checks the names against it. Until then the reader is defensive: it looks for what it needs,
and a table or a column that is missing stops the export with a message that names it and the version the export says it came from, so a rename shows up as a clear
failure and never as an empty trace.

What it reads:

  CUPTI_ACTIVITY_KIND_KERNEL     start, end, deviceId, streamId, correlationId, and the name as `demangledName` (else `shortName`), an id into StringIds
  CUPTI_ACTIVITY_KIND_MEMCPY     start, end, deviceId, streamId, correlationId
  CUPTI_ACTIVITY_KIND_MEMSET     the same (optional)
  CUPTI_ACTIVITY_KIND_RUNTIME    start, end, globalTid, correlationId, nameId: the CUDA runtime calls
  NVTX_EVENTS                    start, end, globalTid, and text (else textId): the ranges; a range with no end is a mark and is no span (optional)
  StringIds                      id, value
  TARGET_INFO_GPU                id, name: the GPU's name by device (optional)
  META_DATA_EXPORT               name, value: the export's version, if it keeps one (optional; only the version is read)

A capture taken with `--cuda-graph-trace=node` has each node of a graph as a kernel with the correlation id of the `cudaGraphLaunch` call (vllm P1), and that is how a graph
replay shows its kernels. A runtime call's name carries the API version (`cudaLaunchKernel_v7000`) and sometimes a `_ptsz` or `_ptds` suffix: the suffix is dropped, so a
call has the name that the torch profiler gives it and the site's T8 finds `cudaGraphLaunch`. All times are ns, as the export has them.

What an export does not have is the engine's Python frames or the CPU's other work: the main thread is busy in a trace made from it only while a CUDA call runs, so
CPU-gap time is the lower bound that the CUDA calls show. A capture with NVTX ranges has them as annotations, which bound nothing. The report says so.
"""

from __future__ import annotations

import re
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from ..errors import GraderError
from .assemble import Capture, Event, Options, api_category

__all__ = ["read_capture"]

KERNEL, MEMCPY, MEMSET, RUNTIME, NVTX, STRINGS, GPUS, META = (
    "CUPTI_ACTIVITY_KIND_KERNEL",
    "CUPTI_ACTIVITY_KIND_MEMCPY",
    "CUPTI_ACTIVITY_KIND_MEMSET",
    "CUPTI_ACTIVITY_KIND_RUNTIME",
    "NVTX_EVENTS",
    "StringIds",
    "TARGET_INFO_GPU",
    "META_DATA_EXPORT",
)

#: The API version and the thread-model suffix of a runtime call's name. A mark in NVTX_EVENTS has no end, so the end decides what a range is.
_SUFFIX = re.compile(r"(?:_v\d+)?(?:_ptsz|_ptds)?$")
_VERSION_KEYS = ("EXPORT_SCHEMA_VERSION", "NSYS_VERSION", "NSIGHT_SYSTEMS_VERSION", "VERSION")

#: How many rows of a table are read at once.
_BATCH = 50_000


def _tables(db: sqlite3.Connection) -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall():
        found[name] = {row[1] for row in db.execute(f'PRAGMA table_info("{name}")')}
    return found


def _version(db: sqlite3.Connection, tables: dict[str, set[str]]) -> str:
    if META not in tables or not {"name", "value"} <= tables[META]:
        return "no version in the export"
    rows = {str(name): str(value) for name, value in db.execute(f'SELECT name, value FROM "{META}"')}
    for key in _VERSION_KEYS:
        if key in rows:
            return f"{key} {rows[key]}"
    return "no version in the export"


def _need(tables: dict[str, set[str]], table: str, columns: tuple[str, ...], version: str) -> None:
    if table not in tables:
        raise GraderError(f"the export has no table {table} ({version}); the tables it has include {', '.join(sorted(tables)[:10]) or 'none'}. The reader is written for the names that Nsight Systems documents [unverified against the pin], so a rename in a new version shows up here")
    missing = [column for column in columns if column not in tables[table]]
    if missing:
        raise GraderError(f"the table {table} has no column {', '.join(missing)} ({version}); it has {', '.join(sorted(tables[table]))}")


def _rows(db: sqlite3.Connection, sql: str) -> Any:
    cursor = db.execute(sql)
    while True:
        batch = cursor.fetchmany(_BATCH)
        if not batch:
            return
        yield from batch


def _integer(value: Any, what: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise GraderError(f"{what} is {value!r}, not an integer")
    return value


def read_capture(path: Path, options: Options) -> Capture:
    """Reads an export. The database is opened read-only, and nothing in it is run."""
    try:
        step_name = re.compile(options.step_name)
    except re.error as error:
        raise GraderError(f"--step-name is not a regular expression: {error}") from error
    try:
        db = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    except sqlite3.Error as error:
        raise GraderError(f"the file cannot be opened as a SQLite database: {error}") from error
    with closing(db):
        try:
            db.execute("PRAGMA query_only = ON")
            tables = _tables(db)
        except sqlite3.DatabaseError as error:
            raise GraderError(f"the file is not a SQLite database: {error}") from error
        version = _version(db, tables)
        _need(tables, STRINGS, ("id", "value"), version)
        _need(tables, KERNEL, ("start", "end", "deviceId", "streamId", "correlationId"), version)
        _need(tables, MEMCPY, ("start", "end", "deviceId", "streamId", "correlationId"), version)
        _need(tables, RUNTIME, ("start", "end", "globalTid", "correlationId", "nameId"), version)
        kernel_name = "demangledName" if "demangledName" in tables[KERNEL] else "shortName"
        _need(tables, KERNEL, (kernel_name,), version)
        names = {int(i): str(v) for i, v in _rows(db, f'SELECT id, value FROM "{STRINGS}"') if isinstance(i, int)}

        def label(identifier: Any, what: str) -> str:
            found = names.get(identifier) if isinstance(identifier, int) else None
            if found is None:
                raise GraderError(f"{what} names the string {identifier!r}, which StringIds does not have")
            return found

        events: list[Event] = []
        steps: list[Event] = []
        gpu_lanes: dict[str, str] = {}
        devices: set[int] = set()

        def gpu_lane(device: Any, stream: Any) -> str:
            d, s = _integer(device, "a deviceId"), _integer(stream, "a streamId")
            lane = f"{d}:{s}"
            if lane not in gpu_lanes:
                gpu_lanes[lane] = f"GPU {d} stream {s}"
                devices.add(d)
            return lane

        def span(start: Any, end: Any) -> tuple[int, int]:
            a, b = _integer(start, "a start"), _integer(end, "an end")
            if b < a:
                raise GraderError(f"a row ends at {b} ns, before it starts at {a} ns")
            return a, b

        def correlation(value: Any) -> int:
            return value if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 0x7FFFFFFF else -1

        for start, end, device, stream, corr, name in _rows(db, f'SELECT "start", "end", deviceId, streamId, correlationId, "{kernel_name}" FROM "{KERNEL}"'):
            a, b = span(start, end)
            events.append(Event("gpu", gpu_lane(device, stream), a, b, label(name, "a kernel"), "kernel", correlation(corr)))
        for start, end, device, stream, corr in _rows(db, f'SELECT "start", "end", deviceId, streamId, correlationId FROM "{MEMCPY}"'):
            a, b = span(start, end)
            events.append(Event("gpu", gpu_lane(device, stream), a, b, "memcpy", "copy", correlation(corr)))
        if MEMSET in tables and {"start", "end", "deviceId", "streamId", "correlationId"} <= tables[MEMSET]:
            for start, end, device, stream, corr in _rows(db, f'SELECT "start", "end", deviceId, streamId, correlationId FROM "{MEMSET}"'):
                a, b = span(start, end)
                events.append(Event("gpu", gpu_lane(device, stream), a, b, "memset", "memset", correlation(corr)))
        for start, end, tid, corr, name_id in _rows(db, f'SELECT "start", "end", globalTid, correlationId, nameId FROM "{RUNTIME}"'):
            a, b = span(start, end)
            call = _SUFFIX.sub("", label(name_id, "a CUDA call"))
            events.append(Event("api", str(_integer(tid, "a globalTid")), a, b, call, api_category(call), correlation(corr)))

        text_column = "text" if NVTX in tables and "text" in tables[NVTX] else None
        if NVTX in tables and {"start", "end", "globalTid"} <= tables[NVTX] and (text_column or "textId" in tables[NVTX]):
            column = text_column or "textId"
            for start, end, tid, text in _rows(db, f'SELECT "start", "end", globalTid, "{column}" FROM "{NVTX}" WHERE "end" IS NOT NULL'):
                if text_column is None:
                    text = names.get(text) if isinstance(text, int) else None
                if not isinstance(text, str):
                    continue
                a, b = span(start, end)
                event = Event("note", str(_integer(tid, "a globalTid")), a, b, text, "nvtx")
                (steps if step_name.search(text) else events).append(event)

        gpu_names: set[str] = set()
        if GPUS in tables and {"id", "name"} <= tables[GPUS]:
            gpu_names = {str(n) for i, n in _rows(db, f'SELECT id, name FROM "{GPUS}"') if i in devices and isinstance(n, str)}

    capture = Capture(format="nsys-sqlite", events=events, steps=steps, gpu_lanes=gpu_lanes, gpu_names=gpu_names)
    capture.notes.append(f"read an Nsight Systems export ({version}); its table names are unverified against the pin")
    capture.notes.append("an Nsight Systems export has no Python frames: the main thread is busy only while a CUDA call runs, so CPU-gap time is a lower bound")
    if not any(e.role == "gpu" for e in events):
        raise GraderError("the export holds no kernel or memory copy: it is not a capture with the CUDA trace on")
    return capture
