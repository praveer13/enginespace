"""`trace@1` in Python (trace/model.py): the builder orders as packages/sim/trace/builder.ts does, the text is canonical, and what JSON Schema cannot say is checked.

The cross-language half is `tests/trace/export-fixtures.test.ts`, which builds the same tiny trace with the site's builder and holds it to the bytes that this builder writes
(`tiny.trace.json`).
"""

from __future__ import annotations

import copy
import hashlib
import unittest
from pathlib import Path
from typing import Any

from enginespace_grader.errors import GraderError
from enginespace_grader.trace.model import TraceBuilder, TraceFormatError, decode_trace, encode_trace, trace_problems

FIXTURES = Path(__file__).resolve().parent / "synthetic" / "trace"
META = {"source": "synthetic", "synthetic": True, "engine": "example-engine"}


def tiny() -> dict[str, Any]:
    """The trace of `tiny.trace.json`. tests/trace/export-fixtures.test.ts builds the same with `traceBuilder`, and the two must write the same bytes."""
    out = TraceBuilder()
    cpu = out.track("cpu-thread", "main é日")
    api = out.track("cuda-api", "CUDA API")
    gpu = out.track("gpu-stream", "stream 7")
    out.span(gpu, 50, 30, "kérnel", "kernel", 1)
    out.span(cpu, 10, 5, "inner", "cpu_op")
    launch = out.span(api, 10, 3, "cudaLaunchKernel", "launch", 1)
    out.span(cpu, 10, 40, "frame", "cpu_op")
    out.span(gpu, 80, 0, "instant", "kernel", -1)
    out.flow(launch, 0, "launch")
    out.mark(80, "step")
    out.mark(10, "step")
    out.mark(10, "nvtx")
    return out.build(META)


class Builder(unittest.TestCase):
    def test_spans_are_listed_by_start_then_track_then_the_longer_first_then_as_added(self) -> None:
        document = tiny()
        spans, strings = document["spans"], document["strings"]
        listed = [(spans["startNs"][i], spans["track"][i], -spans["durNs"][i]) for i in range(len(spans["track"]))]
        self.assertEqual(listed, sorted(listed))
        # Three spans start at 10: the cpu frame (track 0, 40 ns) before its nested span (track 0, 5 ns) before the launch call (track 1).
        self.assertEqual([strings[spans["name"][i]] for i in range(4)], ["frame", "inner", "cudaLaunchKernel", "kérnel"])

    def test_a_flow_follows_its_spans_to_their_places(self) -> None:
        document = tiny()
        self.assertEqual(document["flows"], [{"from": 2, "to": 3, "kind": "launch"}])

    def test_marks_are_by_time_and_then_as_added_and_strings_are_numbered_in_order_of_first_use(self) -> None:
        document = tiny()
        self.assertEqual([m["tNs"] for m in document["marks"]], [10, 10, 80])
        self.assertEqual([document["strings"][m["name"]] for m in document["marks"]], ["step", "nvtx", "step"])
        self.assertEqual(document["strings"][:3], ["main é日", "CUDA API", "stream 7"])

    def test_values_that_a_trace_cannot_hold_are_refused_when_they_go_in(self) -> None:
        out = TraceBuilder()
        track = out.track("gpu-stream", "s")
        for args in ((track, -1, 1, "a", "kernel"), (track, 0, -1, "a", "kernel"), (track, 2**53 - 1, 1, "a", "kernel"), (track, 0, 1, "a", "kernel", -2), (track + 1, 0, 1, "a", "kernel")):
            with self.assertRaises(TraceFormatError):
                out.span(*args)
        with self.assertRaises(TraceFormatError):
            out.mark(-1, "step")
        out.span(track, 0, 1, "a", "kernel")
        out.flow(0, 5, "launch")
        with self.assertRaises(TraceFormatError):
            out.build(META)

    def test_a_meta_field_that_is_none_is_left_out(self) -> None:
        out = TraceBuilder()
        document = out.build({"source": "learner", "synthetic": False, "gpu": None})
        self.assertEqual(document["meta"], {"source": "learner", "synthetic": False})

    def test_the_tiny_trace_is_the_text_that_the_site_builds_too(self) -> None:
        text = (FIXTURES / "tiny.trace.json").read_text(encoding="utf-8")
        self.assertEqual(encode_trace(tiny()), text)
        self.assertEqual(encode_trace(decode_trace(text)), text)


class Checks(unittest.TestCase):
    def bad(self, edit: Any) -> list[str]:
        document = copy.deepcopy(tiny())
        edit(document)
        return trace_problems(document)

    def test_a_good_trace_has_no_problem(self) -> None:
        self.assertEqual(trace_problems(tiny()), [])

    def test_what_the_schema_says_is_held(self) -> None:
        self.assertTrue(self.bad(lambda d: d.update(extra=1)))
        self.assertTrue(self.bad(lambda d: d["meta"].update(source="vendor")))
        self.assertTrue(self.bad(lambda d: d["spans"].update(corr=[-2] * 5)))

    def test_what_the_schema_cannot_say_is_checked(self) -> None:
        cases = {
            "synthetic must follow source": lambda d: d["meta"].update(synthetic=False),
            "a column of another length": lambda d: d["spans"]["corr"].pop(),
            "a track id used twice": lambda d: d["tracks"][1].update(id=0),
            "a span on a track that is not one": lambda d: d["spans"]["track"].__setitem__(0, 9),
            "a name outside the table": lambda d: d["spans"]["name"].__setitem__(0, 999),
            "a cat outside the table": lambda d: d["spans"]["cat"].__setitem__(0, 999),
            "a track name outside the table": lambda d: d["tracks"][0].update(name=999),
            "a flow to a span that is not one": lambda d: d["flows"][0].update(to=99),
            "a mark name outside the table": lambda d: d["marks"][0].update(name=999),
            "a span that ends beyond 2**53": lambda d: (d["spans"]["startNs"].__setitem__(0, 2**53 - 1), d["spans"]["durNs"].__setitem__(0, 5)),
        }
        for what, edit in cases.items():
            with self.subTest(what):
                self.assertTrue(self.bad(edit), what)

    def test_encode_refuses_what_check_refuses_and_says_why(self) -> None:
        document = tiny()
        document["meta"]["synthetic"] = False
        with self.assertRaisesRegex(TraceFormatError, "synthetic"):
            encode_trace(document)
        self.assertIsInstance(TraceFormatError("x"), GraderError)

    def test_decode_is_strict(self) -> None:
        for text in ("not json", "[]", '{"schema": "enginespace/trace@1"}', "NaN"):
            with self.subTest(text), self.assertRaises(TraceFormatError):
                decode_trace(text)

    def test_the_goldens_read_and_write_back_to_their_own_bytes(self) -> None:
        for name in ("torch-profiler-steps.trace.json", "nsys-export-steps.trace.json"):
            with self.subTest(name):
                text = (FIXTURES / name).read_text(encoding="utf-8")
                self.assertEqual(encode_trace(decode_trace(text)), text)
                self.assertRegex(hashlib.sha256(text.encode()).hexdigest(), r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
