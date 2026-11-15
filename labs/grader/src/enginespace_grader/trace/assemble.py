"""What the two readers share: from a capture's events to the columns of `trace@1` (ARCHITECTURE section 5.7).

A reader (torch_profiler.py, nsys.py) turns its format into a `Capture`: events with integer nanosecond times on lanes (a lane is one thread, or one GPU stream, as the
format names it), the step ranges it found, and notes. `assemble` then decides what packages/sim/trace reads of it (the header of packages/sim/trace/types.ts lists it):

  1. **The engine's main thread.** The thread that carries the step ranges, or the one named with `--main-thread`, or, when the capture has no step range, the thread that
     makes the most launch calls. Its frames become a `cpu-thread` track, its CUDA calls a `cuda-api` track, and its other annotations a `marker` track (which bounds
     nothing). Every other thread is left out, and the count is reported.
  2. **The step windows.** The step ranges are CPU ranges, and the GPU runs a step's kernels after the CPU has left it, so a CPU range does not contain its kernels
     and T5 would fail every honest capture. The window of a step is its GPU projection, as Nsight Systems draws it: from the first start to the last end of the GPU work
     whose launch call began inside the step's CPU range (the correlation id ties the two). A `step` mark is written at the start of each step's work and one at the end
     of the last step's, so that n steps are n windows that follow each other with no gap. A step with no GPU work has no window, and a step whose work starts no later
     than the one before it is left out (both are reported). A capture with no step range gets no mark, and is kept whole.
  3. **What is kept.** GPU work that starts inside the marks, the main thread's spans that overlap them, and the launch call of any GPU work that is kept, wherever it
     starts. GPU work that started before the first mark or at or after the last is outside the capture and is counted, not kept. Work that starts inside and ends after
     the last mark is kept, so that T5 says so.
  4. **Correlation ids.** A kernel or copy keeps its id when a call on the main thread has it. One whose launch was on another thread, or before the capture began, gets -1,
     and a kernel with no id fails T4 on the site: the trace says that it cannot show a launch before it, which is true.
  5. **Flows.** A launch or copy call to each piece of GPU work with its id (a graph launch to every node of the graph), and the last GPU work that ended inside a
     blocking call to that call (the GPU work it waited for).
  6. **Time.** The origin is the earliest start of anything kept, so that nothing starts before 0.

Every string that comes out of a capture goes through `scrub_text` first (redact.py): a Python frame's name holds a path, and a trace is published, so an absolute path,
a host name or a user name never reaches the table. Nothing is moved, dropped or rounded to make a check pass: whatever a check on the site finds in the capture is in the trace.
"""

from __future__ import annotations

import re
from bisect import bisect_right
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from ..errors import GraderError
from ..redact import Sensitive, scrub_text
from .model import CAT_COPY, CAT_KERNEL, CAT_LAUNCH, CAT_SYNC, INT32_MAX, STEP_MARK, TraceBuilder, TraceFormatError

__all__ = ["DEFAULT_STEP_NAME", "Capture", "Event", "Options", "Report", "assemble", "api_category"]

#: Roles of an event: a frame of the main thread (`frame`), a CUDA call (`api`), an annotation (`note`), GPU work (`gpu`: its cat is `kernel`, `copy` or `memset`), and a
#: range on the GPU that is no work (`gpu-note`: an annotation or a synchronisation).
ROLES = ("frame", "api", "note", "gpu", "gpu-note")


@dataclass(slots=True)
class Event:
    role: str
    lane: str
    start: int
    end: int
    name: str
    cat: str
    corr: int = -1


@dataclass(slots=True)
class Capture:
    """What a reader found, in integer ns from any origin."""

    format: str
    events: list[Event]
    #: The step ranges (role `note`, on a CPU lane), whatever lane they are on.
    steps: list[Event]
    #: A GPU lane's display name, by lane.
    gpu_lanes: dict[str, str]
    gpu_names: set[str] = field(default_factory=set)
    notes: list[str] = field(default_factory=list)


#: The step ranges of `torch.profiler`'s schedule.
DEFAULT_STEP_NAME = r"^ProfilerStep#\d+$"


@dataclass(frozen=True, slots=True)
class Options:
    """What the person gives besides the file. A field left None is left out of `meta`."""

    source: str = "learner"
    engine: str | None = None
    version: str | None = None
    gpu: str | None = None
    captured_at: str | None = None
    main_thread: str | None = None
    raw_sha256: str | None = None
    #: The step ranges are the ones whose name matches this.
    step_name: str = DEFAULT_STEP_NAME


@dataclass(slots=True)
class Report:
    """What the export did, for the person to read."""

    main_lane: str | None = None
    windows: int = 0
    spans: int = 0
    tracks: int = 0
    flows: int = 0
    marks: int = 0
    kept_gpu: int = 0
    notes: list[str] = field(default_factory=list)


_LAUNCH = re.compile(r"^(?:cuda|cu)(?:Graph)?Launch", re.IGNORECASE)
_MEMCPY = re.compile(r"^(?:cuda|cu)Memcpy", re.IGNORECASE)
_MEMSET = re.compile(r"^(?:cuda|cu)Memset", re.IGNORECASE)


def api_category(name: str) -> str:
    """The category of a CUDA call, as packages/sim/trace names them: `launch` (a kernel or a graph), `copy`, `sync` (it blocks until work is done), `memset`, or `api`."""
    if _LAUNCH.match(name):
        return CAT_LAUNCH
    if _MEMCPY.match(name):
        return CAT_COPY
    if "synchronize" in name.lower():
        return CAT_SYNC
    if _MEMSET.match(name):
        return "memset"
    return "api"


def _natural(text: str) -> tuple[Any, ...]:
    return tuple(int(part) if part.isdigit() else part for part in re.split(r"(\d+)", text))


def _plural(n: int, one: str, many: str | None = None) -> str:
    return f"{n:,} {one if n == 1 else (many or one + 's')}"


def _choose_main_lane(capture: Capture, wanted: str | None) -> str:
    on_lanes = {event.lane for event in capture.events if event.role in ("frame", "api", "note")} | {event.lane for event in capture.steps}
    if wanted is not None:
        if wanted not in on_lanes:
            candidates = ", ".join(sorted(on_lanes, key=_natural)[:8])
            raise GraderError(f"--main-thread {wanted!r} is not a thread of this capture (its threads include {candidates})")
        return wanted
    if capture.steps:
        return sorted(Counter(event.lane for event in capture.steps).items(), key=lambda item: (-item[1], _natural(item[0])))[0][0]
    launches = Counter(event.lane for event in capture.events if event.role == "api" and event.cat == CAT_LAUNCH)
    if not launches:
        raise GraderError("the capture has no step range and no kernel launch call on any thread, so no thread can be called the engine's main thread: pass --main-thread, or check that the capture holds CUDA calls")
    return sorted(launches.items(), key=lambda item: (-item[1], _natural(item[0])))[0][0]


def _scrubber() -> Any:
    sensitive = Sensitive.from_machine()
    cache: dict[str, str] = {}

    def scrub(text: str) -> str:
        found = cache.get(text)
        if found is None:
            found = cache[text] = scrub_text(text, sensitive=sensitive)[0]
        return found

    return scrub


def assemble(capture: Capture, options: Options) -> tuple[dict[str, Any], Report]:
    """The JSON form of a trace, and the report. Raises `GraderError` when the capture holds nothing that a trace can be made of."""
    report = Report(notes=list(capture.notes))
    note = report.notes.append
    main = _choose_main_lane(capture, options.main_thread)
    report.main_lane = main

    on_main = [event for event in capture.events if event.lane == main]
    work = [event for event in capture.events if event.role == "gpu" and event.cat in (CAT_KERNEL, CAT_COPY)]
    other_threads = {event.lane for event in capture.events if event.role in ("frame", "api") and event.lane != main}
    if other_threads:
        note(f"left out the spans of {_plural(len(other_threads), 'other thread')}, which are not the engine's main thread ({main})")

    # The first launch call on the main thread with each correlation id: where the GPU work is tied to the CPU.
    launched_at: dict[int, int] = {}
    for event in sorted((e for e in on_main if e.role == "api" and e.corr >= 0), key=lambda e: e.start):
        launched_at.setdefault(event.corr, event.start)

    # The step windows: each step's GPU projection.
    ranges = sorted((s for s in capture.steps if s.lane == main), key=lambda s: (s.start, s.end))
    starts = [s.start for s in ranges]
    first_start: list[int | None] = [None] * len(ranges)
    last_end: list[int | None] = [None] * len(ranges)
    for g in work:
        at = launched_at.get(g.corr) if g.corr >= 0 else None
        if at is None:
            continue
        i = bisect_right(starts, at) - 1
        if i < 0 or at >= ranges[i].end:
            continue
        first_start[i] = g.start if first_start[i] is None else min(first_start[i] or 0, g.start)
        last_end[i] = g.end if last_end[i] is None else max(last_end[i] or 0, g.end)
    marks: list[int] = []
    final: int | None = None
    for i, step in enumerate(ranges):
        begin, end = first_start[i], last_end[i]
        if begin is None or end is None:
            note(f"step range {step.name!r} at {step.start} ns holds no launch whose GPU work was captured, so it has no window")
            continue
        if marks and begin <= marks[-1]:
            note(f"step range {step.name!r}: its GPU work starts at {begin} ns, no later than the step before it, so it has no window of its own")
            final = max(final or 0, end)
            continue
        marks.append(begin)
        final = end
    if ranges and not marks:
        raise GraderError("none of the step ranges holds a launch whose GPU work is in the capture, so there is no step window to cut")
    if marks:
        if final is not None and final > marks[-1]:
            marks.append(final)
        else:
            note("the last step's GPU work has no length, so the last window could not be closed and that step was dropped")
            marks.pop()
            if not marks:
                raise GraderError("the step ranges' GPU work has no length, so there is no step window to cut")
        window: tuple[int, int] | None = (marks[0], marks[-1])
        report.windows = len(marks) - 1
    else:
        window = None
        note("the capture has no step range, so the trace has no step mark: it cannot be cut into step windows (see --step-name)")

    # What is kept.
    def inside(e: Event) -> bool:
        return window is None or window[0] <= e.start < window[1]

    def overlaps(e: Event) -> bool:
        return window is None or (e.end > window[0] and e.start < window[1]) or (e.start == e.end and inside(e))

    kept_work = [g for g in work if inside(g)]
    dropped_work = len(work) - len(kept_work)
    if dropped_work:
        note(f"left out {_plural(dropped_work, 'kernel or copy', 'kernels and copies')} that start before the first step mark or at and after the last: they are outside the capture window")
    kept_ids = {id(g) for g in kept_work}
    kept_corr = {g.corr for g in kept_work if g.corr >= 0}
    kept: list[Event] = []
    for event in capture.events:
        if event.role == "gpu":
            if event.cat in (CAT_KERNEL, CAT_COPY):
                if id(event) in kept_ids:
                    kept.append(event)
            elif overlaps(event):
                kept.append(event)
        elif event.role == "gpu-note":
            if overlaps(event):
                kept.append(event)
        elif event.lane == main and (overlaps(event) or (event.role == "api" and event.corr in kept_corr)):
            kept.append(event)
    # The readers keep a step range out of `events`, so each is added once, here.
    kept.extend(step for step in ranges if overlaps(step))
    if not any(e.role == "gpu" and e.cat in (CAT_KERNEL, CAT_COPY) for e in kept):
        raise GraderError("the capture holds no kernel or copy on a GPU stream inside its step marks, so there is no GPU work to make a trace of")

    api_corr = {e.corr for e in kept if e.role == "api" and e.corr >= 0}
    elsewhere = 0
    for g in kept_work:
        if g.corr >= 0 and g.corr not in api_corr:
            elsewhere += 1
    if elsewhere:
        note(f"{_plural(elsewhere, 'kernel or copy')} had a correlation id with no launch call on the main thread (launched from another thread, or before the capture began): its id is -1 in the trace (a copy without one passes T4, and a kernel without one fails it)")

    origin = min([e.start for e in kept] + marks)
    scrub = _scrubber()

    # The columns.
    builder = TraceBuilder()
    tracks: dict[str, int] = {}

    def track_for(kind: str, key: str, name: str) -> int:
        if key not in tracks:
            tracks[key] = builder.track(kind, scrub(name))
        return tracks[key]

    handles: dict[int, int] = {}
    lane_order = sorted(capture.gpu_lanes, key=_natural)
    # Tracks are added in a fixed order, so that two exports of one capture agree: the thread, its CUDA calls, its annotations, then the GPU streams.
    present = {(e.role, e.lane if e.role in ("gpu", "gpu-note") else main) for e in kept}
    if ("frame", main) in present:
        track_for("cpu-thread", "frame", "engine main thread")
    if ("api", main) in present:
        track_for("cuda-api", "api", "CUDA API")
    if ("note", main) in present:
        track_for("marker", "note", "annotations")
    for lane in lane_order:
        if ("gpu", lane) in present or ("gpu-note", lane) in present:
            track_for("gpu-stream", f"gpu:{lane}", capture.gpu_lanes[lane])
    for e in kept:
        if e.role in ("gpu", "gpu-note"):
            key = f"gpu:{e.lane}"
            if key not in tracks:
                raise TraceFormatError(f"GPU work on lane {e.lane!r}, which the capture does not name")
        else:
            key = e.role
        corr = e.corr
        if e.role == "gpu" and e.cat in (CAT_KERNEL, CAT_COPY) and (corr < 0 or corr not in api_corr):
            corr = -1
        if corr > INT32_MAX:
            corr = -1
        handles[id(e)] = builder.span(tracks[key], e.start - origin, e.end - e.start, scrub(e.name), e.cat, corr)

    # The flows: a launch or a copy call to the GPU work with its id, and the work a blocking call waited for to that call.
    first_api: dict[int, Event] = {}
    for e in kept:
        if e.role == "api" and e.corr >= 0:
            known = first_api.get(e.corr)
            if known is None or e.start < known.start:
                first_api[e.corr] = e
    for g in kept_work:
        call = first_api.get(g.corr) if g.corr >= 0 else None
        if call is not None:
            builder.flow(handles[id(call)], handles[id(g)], "copy" if call.cat == CAT_COPY else "launch")
    by_end = sorted(kept_work, key=lambda g: (g.end, g.start))
    ends = [g.end for g in by_end]
    for call in (e for e in kept if e.role == "api" and e.cat == CAT_SYNC):
        i = bisect_right(ends, call.end) - 1
        if i >= 0 and by_end[i].end >= call.start:
            builder.flow(handles[id(by_end[i])], handles[id(call)], "sync")

    for t in marks:
        builder.mark(t - origin, STEP_MARK)

    gpu = options.gpu
    if gpu is None and len(capture.gpu_names) == 1:
        gpu = next(iter(capture.gpu_names))
    meta: dict[str, Any] = {
        "source": options.source,
        "engine": options.engine,
        "version": options.version,
        "gpu": scrub(gpu) if gpu is not None else None,
        "capturedAt": options.captured_at,
        "sha256": options.raw_sha256,
        "synthetic": options.source == "synthetic",
    }
    document = builder.build(meta)
    report.spans = len(document["spans"]["track"])
    report.tracks = len(document["tracks"])
    report.flows = len(document["flows"])
    report.marks = len(document["marks"])
    report.kept_gpu = len(kept_work)
    flags = (("engine", "--engine"), ("version", "--engine-version"), ("gpu", "--gpu"), ("capturedAt", "--captured-at"))
    absent = [flag for key, flag in flags if key not in document["meta"]]
    if absent:
        note(f"meta leaves out what the capture does not say ({', '.join(absent)}): the site's check T1 wants a learner's trace to name its engine, version, GPU and capture time")
    return document, report
