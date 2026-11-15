"""`enginespace/trace@1` in Python: the builder that writes the columns, the checks that JSON Schema cannot make, and the canonical text.

The reader on the site is packages/sim/trace (codec.ts and builder.ts), and this is its twin for the exporter. The two have to agree on every byte of a trace's
canonical text (ARCHITECTURE section 9.8), because the trace's hash is the SHA-256 of it and the browser recomputes the hash that the grader wrote. So:

  - the builder lists spans as builder.ts's `build` does: by start time, then by the order in which the tracks were added, then the longer first (a frame before
    the frames nested in it that start with it), then in the order the spans were added; marks by time; strings in the order they are first used;
  - the text is `canonical_json` (canonical.py) of the JSON form of the trace, which is the object that `traceToJson` returns;
  - what the schema cannot say (the six columns have one length, a span's track is a track, every name and cat is in the string table, a flow joins two spans, a
    span ends below 2**53, `meta.synthetic` is true exactly when `meta.source` is "synthetic") is checked by `trace_problems`, as packages/schema/trace.ts does.

tests/test_trace_model.py runs both on the same documents, and tests/trace/export-fixtures.test.ts reads the exporter's output with the site's own `decodeTrace`.
"""

from __future__ import annotations

import json
from typing import Any

from ..canonical import MAX_SAFE_INTEGER, canonical_json, parse_json
from ..errors import GraderError
from ..schemas import schema_problems

__all__ = [
    "CAT_COPY",
    "CAT_KERNEL",
    "CAT_LAUNCH",
    "CAT_SYNC",
    "STEP_MARK",
    "TRACE_SCHEMA",
    "TraceBuilder",
    "TraceFormatError",
    "decode_trace",
    "encode_trace",
    "trace_problems",
]

#: The `schema` of every trace (packages/schema/trace.ts, TRACE_SCHEMA_TAG).
TRACE_SCHEMA = "enginespace/trace@1"

#: The mark that bounds a step (packages/sim/trace/types.ts, STEP_MARK): n marks of this name are n - 1 step windows.
STEP_MARK = "step"

#: The categories that packages/sim/trace reads (types.ts). Any other category is carried and ignored.
CAT_KERNEL = "kernel"
CAT_COPY = "copy"
CAT_LAUNCH = "launch"
CAT_SYNC = "sync"

#: The largest id or index of a column: an int32 (packages/schema/trace.ts).
INT32_MAX = 0x7FFFFFFF

#: How many problems are listed before the rest are only counted [estimated]: the site's reader stops at the same number.
PROBLEM_LIMIT = 20


class TraceFormatError(GraderError):
    """A document is not a `trace@1`, or an exporter was about to write one that is not."""


class TraceBuilder:
    """Interns strings, checks every value as it goes in, and turns the rows into the columns of `trace@1` (builder.ts's `traceBuilder`)."""

    def __init__(self) -> None:
        self._strings: list[str] = []
        self._interned: dict[str, int] = {}
        self._tracks: list[dict[str, Any]] = []
        self._rows: list[tuple[int, int, int, int, int, int]] = []
        self._flows: list[tuple[int, int, str]] = []
        self._marks: list[tuple[int, int]] = []

    def string(self, text: str) -> int:
        known = self._interned.get(text)
        if known is not None:
            return known
        self._strings.append(text)
        self._interned[text] = len(self._strings) - 1
        return len(self._strings) - 1

    def track(self, kind: str, name: str) -> int:
        """Adds a track and returns its id, from 0 in the order added."""
        self._tracks.append({"id": len(self._tracks), "kind": kind, "name": self.string(name)})
        return len(self._tracks) - 1

    def span(self, track: int, start_ns: int, dur_ns: int, name: str, cat: str, corr: int = -1) -> int:
        """Adds a span and returns its handle, which `flow` takes. `build` renumbers the handles into the finished trace's span indices."""
        if not 0 <= track < len(self._tracks):
            raise TraceFormatError(f"a span's track must be one added with track(), got {track}")
        for what, value in (("start", start_ns), ("duration", dur_ns), ("end", start_ns + dur_ns)):
            if not 0 <= value <= MAX_SAFE_INTEGER:
                raise TraceFormatError(f"a span's {what} must be a non-negative integer below 2**53, got {value}")
        if not -1 <= corr <= INT32_MAX:
            raise TraceFormatError(f"a correlation id is -1 or an integer below 2**31, got {corr}")
        self._rows.append((track, start_ns, dur_ns, self.string(name), self.string(cat), corr))
        return len(self._rows) - 1

    def flow(self, source: int, target: int, kind: str) -> None:
        self._flows.append((source, target, kind))

    def mark(self, t_ns: int, name: str) -> None:
        if not 0 <= t_ns <= MAX_SAFE_INTEGER:
            raise TraceFormatError(f"a mark's time must be a non-negative integer below 2**53, got {t_ns}")
        self._marks.append((t_ns, self.string(name)))

    def build(self, meta: dict[str, Any]) -> dict[str, Any]:
        """The finished trace as its JSON form. Meta fields whose value is None are left out."""
        count = len(self._rows)
        for source, target, _ in self._flows:
            for end in (source, target):
                if not 0 <= end < count:
                    raise TraceFormatError(f"a flow joins spans that were added, got {end} of {count}")
        rows = self._rows
        order = sorted(range(count), key=lambda handle: (rows[handle][1], rows[handle][0], -rows[handle][2], handle))
        rank = [0] * count
        for place, handle in enumerate(order):
            rank[handle] = place
        columns: dict[str, list[int]] = {key: [rows[handle][i] for handle in order] for i, key in enumerate(("track", "startNs", "durNs", "name", "cat", "corr"))}
        marks = sorted(range(len(self._marks)), key=lambda i: (self._marks[i][0], i))
        return {
            "schema": TRACE_SCHEMA,
            "meta": {key: value for key, value in meta.items() if value is not None},
            "strings": list(self._strings),
            "tracks": [dict(track) for track in self._tracks],
            "spans": columns,
            "flows": [{"from": rank[source], "to": rank[target], "kind": kind} for source, target, kind in self._flows],
            "marks": [{"tNs": self._marks[i][0], "name": self._marks[i][1]} for i in marks],
        }


def trace_problems(document: Any) -> list[str]:
    """What is wrong with a trace document, as `<pointer>: <message>` lines; empty when it is a well-formed `trace@1`.

    The schema first, and then what it cannot say (the head of this file). A trace's physics is not judged here: a span that starts before 0 is well formed, and
    `traceChecks` on the site is what fails it.
    """
    problems = schema_problems("trace", document, PROBLEM_LIMIT)
    if problems:
        return problems
    found: list[str] = []

    def bad(message: str) -> None:
        if len(found) < PROBLEM_LIMIT:
            found.append(message)

    meta, strings, tracks, spans = document["meta"], document["strings"], document["tracks"], document["spans"]
    if meta["synthetic"] != (meta["source"] == "synthetic"):
        bad('/meta/synthetic: must be true exactly when meta.source is "synthetic"')
    count = len(spans["track"])
    for key in ("startNs", "durNs", "name", "cat", "corr"):
        if len(spans[key]) != count:
            bad(f"/spans/{key}: has {len(spans[key])} rows, where spans.track has {count}")
    ids: set[int] = set()
    for i, track in enumerate(tracks):
        if track["id"] in ids:
            bad(f"/tracks/{i}/id: track id {track['id']} is used twice")
        ids.add(track["id"])
        if track["name"] >= len(strings):
            bad(f"/tracks/{i}/name: is not an index into strings")
    if found:
        return found
    for i in range(count):
        if spans["track"][i] not in ids:
            bad(f"/spans/track/{i}: {spans['track'][i]} is not the id of a track")
        for key in ("name", "cat"):
            if spans[key][i] >= len(strings):
                bad(f"/spans/{key}/{i}: is not an index into strings")
        if not -MAX_SAFE_INTEGER <= spans["startNs"][i] + spans["durNs"][i] <= MAX_SAFE_INTEGER:
            bad(f"/spans/startNs/{i}: the span ends beyond 2**53")
        if len(found) >= PROBLEM_LIMIT:
            break
    for i, flow in enumerate(document["flows"]):
        for end in ("from", "to"):
            if flow[end] >= count:
                bad(f"/flows/{i}/{end}: is not a span of the trace")
    for i, mark in enumerate(document["marks"]):
        if mark["name"] >= len(strings):
            bad(f"/marks/{i}/name: is not an index into strings")
    return found


def encode_trace(document: dict[str, Any]) -> str:
    """The canonical text of a trace: the one string whose SHA-256 is the trace's hash. It refuses a document that `trace_problems` rejects."""
    problems = trace_problems(document)
    if problems:
        raise TraceFormatError(f"trace@1: cannot encode: {problems[0]}" + (f" (and {len(problems) - 1} more)" if len(problems) > 1 else ""))
    return canonical_json(document)


def decode_trace(text: str) -> dict[str, Any]:
    """Reads a trace's text strictly: it is JSON, and a well-formed `trace@1`. Returns the document, which `encode_trace` writes back to the same text."""
    try:
        document = parse_json(text)
    except (ValueError, json.JSONDecodeError) as error:
        raise TraceFormatError(f"trace@1: the text is not JSON: {error}") from error
    problems = trace_problems(document)
    if problems:
        raise TraceFormatError(f"trace@1: {problems[0]}" + (f" (and {len(problems) - 1} more)" if len(problems) > 1 else ""))
    assert isinstance(document, dict)
    return document
