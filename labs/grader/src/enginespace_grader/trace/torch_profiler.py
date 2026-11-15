"""A torch-profiler Chrome trace (`torch.profiler`, and vLLM's `--profiler-config '{"profiler":"torch",...}'`) as a `Capture`.

What this reader assumes of the file [unverified]: it is written from the format as Kineto writes it and as PyTorch's profiler documentation shows it, and no real vLLM
or SGLang trace was open when it was written (research U2, vllm P1). The owner's first capture (W2-T21) is the check. The assumptions are:

  - the document is `{"traceEvents": [...], "deviceProperties": [...], ...}`, or the bare list of events;
  - a complete event is `{"ph": "X", "cat": ..., "name": ..., "pid": ..., "tid": ..., "ts": <microseconds>, "dur": <microseconds>, "args": {...}}`, and `ts` and `dur`
    may have a fraction. Times are read as decimal text and converted to integer ns without a double in between, so a timestamp of 1.7e15 microseconds keeps its ns;
  - GPU work has the category `kernel`, `gpu_memcpy` or `gpu_memset` (older Kineto: `Kernel`, `Memcpy`, `Memset`), with `pid` the device and `tid` the stream, and a CUDA call
    has `cuda_runtime` or `cuda_driver` (older: `Runtime`, `Driver`); both carry `args.correlation`, the id that ties a launch to the GPU work it started;
  - CPU frames are `cpu_op` (older: `Operator`) and `python_function`, and an annotation is `user_annotation`, whose `ProfilerStep#<n>` ranges are the steps of
    `torch.profiler`'s schedule; on the GPU, `gpu_user_annotation` and `cuda_sync` are ranges and no work;
  - `ph: "M"` metadata, flow events (`ph: "s"`, `"f"`), instants and counters are not spans. The flows are not used: trace@1's flows are made again from the correlation
    ids, which is what they stand for.

The step ranges are the `user_annotation` events whose name matches `--step-name` (default `ProfilerStep#<n>`). vLLM's own profiler wrapper may name its ranges otherwise
[unverified]: the option is how a capture that does is exported.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation
from typing import Any

from ..errors import GraderError
from .assemble import Capture, Event, Options, api_category

__all__ = ["read_capture"]

#: A category, lower-cased, to what the event is.
_CPU_FRAME = {"cpu_op", "operator", "python_function"}
_ANNOTATION = {"user_annotation"}
_API = {"cuda_runtime", "runtime", "cuda_driver", "driver"}
_GPU_WORK = {"kernel": "kernel", "gpu_memcpy": "copy", "memcpy": "copy", "gpu_memset": "memset", "memset": "memset"}
_GPU_NOTE = {"gpu_user_annotation", "cuda_sync"}

#: A timestamp whose size makes its ns a number that Python would spend a long time on [estimated]: 10**18 µs is 3e4 years.
_MAX_ADJUSTED = 18


def _refuse(name: str) -> Any:
    raise GraderError(f"the file is not JSON: it holds {name}")


def _ns(value: Any, what: str) -> Decimal:
    """Microseconds, as the JSON read them, to ns as a Decimal (not yet rounded)."""
    if isinstance(value, bool) or not isinstance(value, (int, Decimal)):
        raise GraderError(f"{what} is not a number")
    try:
        micro = Decimal(value)
    except InvalidOperation as error:
        raise GraderError(f"{what} is not a number") from error
    if not micro.is_finite() or (micro != 0 and micro.adjusted() > _MAX_ADJUSTED):
        raise GraderError(f"{what} is too large to be a time")
    return micro * 1000


def _round(ns: Decimal) -> int:
    return int(ns.to_integral_value(rounding=ROUND_HALF_EVEN))


def _correlation(args: Any) -> int:
    if isinstance(args, Mapping):
        value = args.get("correlation")
        if isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 0x7FFFFFFF:
            return value
    return -1


def _lane(event: Mapping[str, Any]) -> str:
    return f"{event.get('pid')}:{event.get('tid')}"


def read_capture(raw: bytes, options: Options) -> Capture:
    """Reads a profiler's Chrome trace. Raises `GraderError` for a file that is not one, naming what is missing."""
    try:
        document = json.loads(raw, parse_float=Decimal, parse_constant=_refuse)
    except (ValueError, RecursionError) as error:
        raise GraderError(f"the file is not a torch-profiler Chrome trace: it is not JSON ({error})") from error
    if isinstance(document, list):
        records: Any = document
        devices: Any = []
    elif isinstance(document, Mapping) and isinstance(document.get("traceEvents"), list):
        records = document["traceEvents"]
        devices = document.get("deviceProperties", [])
    else:
        raise GraderError('the file is not a torch-profiler Chrome trace: it has no "traceEvents" list')
    try:
        step_name = re.compile(options.step_name)
    except re.error as error:
        raise GraderError(f"--step-name is not a regular expression: {error}") from error

    device_names: dict[int, str] = {}
    for device in devices if isinstance(devices, list) else []:
        if isinstance(device, Mapping) and isinstance(device.get("id"), int) and isinstance(device.get("name"), str):
            device_names[device["id"]] = device["name"]

    events: list[Event] = []
    steps: list[Event] = []
    gpu_lanes: dict[str, str] = {}
    gpu_devices: set[int] = set()
    ignored: dict[str, int] = {}
    unreadable = 0

    for record in records:
        if not isinstance(record, Mapping):
            unreadable += 1
            continue
        phase = record.get("ph")
        cat = record.get("cat")
        if phase != "X" or not isinstance(cat, str):
            ignored[f"ph {phase}"] = ignored.get(f"ph {phase}", 0) + 1
            continue
        name = record.get("name")
        if not isinstance(name, str) or "ts" not in record or "dur" not in record:
            unreadable += 1
            continue
        start_ns = _ns(record["ts"], "a ts")
        end_ns = start_ns + _ns(record["dur"], "a dur")
        start, end = _round(start_ns), _round(end_ns)
        if end < start:
            raise GraderError(f"the event {name!r} at ts {record['ts']} lasts a negative time")
        lane = _lane(record)
        args = record.get("args")
        key = cat.lower()
        if key in _GPU_WORK or key in _GPU_NOTE:
            if lane not in gpu_lanes:
                pid, tid = record.get("pid"), record.get("tid")
                gpu_lanes[lane] = f"GPU {pid} stream {tid}"
                if isinstance(pid, int):
                    gpu_devices.add(pid)
            if key in _GPU_WORK:
                events.append(Event("gpu", lane, start, end, name, _GPU_WORK[key], _correlation(args)))
            else:
                events.append(Event("gpu-note", lane, start, end, name, key))
        elif key in _ANNOTATION:
            event = Event("note", lane, start, end, name, key)
            (steps if step_name.search(name) else events).append(event)
        elif key in _CPU_FRAME:
            events.append(Event("frame", lane, start, end, name, key))
        elif key in _API:
            events.append(Event("api", lane, start, end, name, api_category(name), _correlation(args)))
        else:
            ignored[f"cat {cat}"] = ignored.get(f"cat {cat}", 0) + 1

    capture = Capture(format="torch", events=events, steps=steps, gpu_lanes=gpu_lanes)
    capture.gpu_names = {device_names[d] for d in gpu_devices if d in device_names} or ({next(iter(device_names.values()))} if len(set(device_names.values())) == 1 else set())
    if unreadable:
        capture.notes.append(f"skipped {unreadable:,} events that were not complete events with a name, a ts and a dur")
    if ignored:
        capture.notes.append("ignored " + ", ".join(f"{count:,} of {what}" for what, count in sorted(ignored.items())) + " (not spans of a trace@1)")
    if not any(e.role == "gpu" for e in events):
        raise GraderError("the file holds no kernel or memory copy event on a GPU (category kernel, gpu_memcpy or gpu_memset): it is not a capture with the CUDA activities on")
    return capture
