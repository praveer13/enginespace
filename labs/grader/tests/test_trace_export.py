"""`enginespace trace export` (W2-T19): a torch-profiler Chrome trace and an Nsight Systems SQLite export into `trace@1`.

The inputs are synthetic and written by hand with invented values (tests/synthetic/trace/README.md): no GPU and no profiler ran. The goldens are what the exporter wrote
from them, and these tests hold the exporter to those bytes; `tests/trace/export-fixtures.test.ts` reads the same goldens with the site's own code and runs `traceChecks`.
"""

from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import re
import sqlite3
import stat
import tempfile
import unittest
from pathlib import Path
from typing import Any

from enginespace_grader import cli
from enginespace_grader.canonical import canonical_json
from enginespace_grader.errors import GraderError
from enginespace_grader.trace import nsys, torch_profiler
from enginespace_grader.trace.assemble import Options
from enginespace_grader.trace.model import decode_trace, encode_trace

FIXTURES = Path(__file__).resolve().parent / "synthetic" / "trace"
TORCH = FIXTURES / "torch-profiler-steps.json"
NSYS_SQL = FIXTURES / "nsys-export-steps.sql"
META = ["--source", "synthetic", "--engine", "example-engine", "--engine-version", "0.0.0", "--captured-at", "2026-01-01T00:00:00Z"]
NSYS_STEPS = ["--step-name", r"^engine_step \d+$"]

#: Built from pieces, so that this file does not hold what the publication sweep looks for (tests/docs/publication.test.ts).
HOME = "/ho" + "me/learner-" + "dev"


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = cli.main(["trace", "export", *argv])
    return status, out.getvalue(), err.getvalue()


class Workspace(unittest.TestCase):
    def setUp(self) -> None:
        self._scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self._scratch.cleanup)
        self.dir = Path(self._scratch.name)

    def nsys_db(self, name: str = "export.sqlite", script: str | None = None) -> Path:
        path = self.dir / name
        db = sqlite3.connect(path)
        db.executescript(NSYS_SQL.read_text(encoding="utf-8") if script is None else script)
        db.commit()
        db.close()
        return path

    def export(self, source: Path, *flags: str) -> tuple[dict[str, Any], str, str]:
        out = self.dir / "out.trace.json"
        status, stdout, stderr = run(str(source), "--out", str(out), *flags)
        self.assertEqual(status, 0, stderr)
        return decode_trace(out.read_text(encoding="utf-8")), stdout, stderr

    def torch_file(self, events: list[dict[str, Any]], extra: dict[str, Any] | None = None) -> Path:
        path = self.dir / "capture.json"
        path.write_text(json.dumps({"traceEvents": events, **(extra or {})}), encoding="utf-8")
        return path


def x(cat: str, name: str, ts: str, dur: str, pid: int = 1, tid: int = 1, **args: Any) -> str:
    """A complete event as text, so that ts and dur keep their digits."""
    return re.sub(r'"@([^"]*)"', r"\1", json.dumps({"ph": "X", "cat": cat, "name": name, "pid": pid, "tid": tid, "ts": "@" + ts, "dur": "@" + dur, "args": args}))


def capture_text(events: list[str]) -> str:
    return '{"traceEvents": [' + ", ".join(events) + "]}"


class Goldens(Workspace):
    def test_the_torch_fixture_exports_to_its_golden_bytes(self) -> None:
        out = self.dir / "t.trace.json"
        status, _, _ = run(str(TORCH), "--format", "torch", "--out", str(out), *META)
        self.assertEqual(status, 0)
        self.assertEqual(out.read_bytes(), (FIXTURES / "torch-profiler-steps.trace.json").read_bytes())

    def test_the_nsys_fixture_exports_to_its_golden_apart_from_the_hash_of_the_database(self) -> None:
        db = self.nsys_db()
        document, _, _ = self.export(db, "--format", "nsys-sqlite", *META, *NSYS_STEPS)
        golden = decode_trace((FIXTURES / "nsys-export-steps.trace.json").read_text(encoding="utf-8"))
        # A SQLite file's bytes depend on the library that wrote it, so the golden's hash is of the file that made it and this test holds the hash to the file it has.
        self.assertEqual(document["meta"].pop("sha256"), hashlib.sha256(db.read_bytes()).hexdigest())
        golden["meta"].pop("sha256")
        self.assertEqual(document, golden)

    def test_the_hash_in_meta_is_the_capture_s_and_not_the_trace_s(self) -> None:
        document = decode_trace((FIXTURES / "torch-profiler-steps.trace.json").read_text(encoding="utf-8"))
        self.assertEqual(document["meta"]["sha256"], hashlib.sha256(TORCH.read_bytes()).hexdigest())

    def test_an_export_is_the_same_bytes_every_time(self) -> None:
        first, second = self.dir / "a.json", self.dir / "b.json"
        for out in (first, second):
            run(str(TORCH), "--format", "torch", "--out", str(out), *META)
        self.assertEqual(first.read_bytes(), second.read_bytes())

    def test_the_summary_names_the_hash_of_the_text_it_wrote(self) -> None:
        out = self.dir / "t.json"
        _, stdout, _ = run(str(TORCH), "--format", "torch", "--out", str(out), *META)
        self.assertIn(hashlib.sha256(out.read_bytes()).hexdigest(), stdout)
        self.assertIn("3 step windows", stdout)

    def test_a_graph_replay_is_one_launch_for_its_nodes_in_both_formats(self) -> None:
        for name in ("torch-profiler-steps.trace.json", "nsys-export-steps.trace.json"):
            document = decode_trace((FIXTURES / name).read_text(encoding="utf-8"))
            strings, spans = document["strings"], document["spans"]
            with self.subTest(name):
                launches = [i for i in range(len(spans["track"])) if strings[spans["name"][i]] == "cudaGraphLaunch"]
                self.assertEqual(len(launches), 1)
                nodes = [i for i in range(len(spans["track"])) if spans["corr"][i] == spans["corr"][launches[0]] and strings[spans["cat"][i]] == "kernel"]
                self.assertEqual(len(nodes), 3)
                self.assertEqual(sorted(f["to"] for f in document["flows"] if f["from"] == launches[0]), nodes)

    def test_the_synthetic_label_follows_the_source(self) -> None:
        document, _, _ = self.export(TORCH, "--format", "torch", "--source", "learner")
        self.assertEqual((document["meta"]["source"], document["meta"]["synthetic"]), ("learner", False))
        document, _, _ = self.export(TORCH, "--format", "torch", "--source", "owner")
        self.assertEqual((document["meta"]["source"], document["meta"]["synthetic"]), ("owner", False))


class Times(Workspace):
    def test_a_timestamp_beyond_a_double_s_resolution_keeps_its_ns(self) -> None:
        # 1.7e15 microseconds with a fraction of .375: a double has a step of .25 there, so it cannot hold it, and the exporter does not use one.
        ts = "1731000000000000.375"
        self.assertNotEqual(float(ts) * 1000, 1731000000000000375.0)
        events = [
            x("cuda_runtime", "cudaLaunchKernel", "1731000000000000.125", "1.000", correlation=7),
            x("kernel", "k", ts, "0.125", pid=0, tid=7, correlation=7),
            x("kernel", "k2", "1731000000000000.500", "0.250", pid=0, tid=7, correlation=7),
            x("user_annotation", "ProfilerStep#1", "1731000000000000.000", "2.000"),
        ]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        document, _, _ = self.export(path, "--format", "torch")
        spans = document["spans"]
        kernels = [i for i in range(len(spans["track"])) if document["strings"][spans["cat"][i]] == "kernel"]
        # The earliest start kept is the step range's, at ...000.000, which is the origin: the kernels are at .375 and .500 µs after it, to the ns.
        self.assertEqual([spans["startNs"][i] for i in kernels], [375, 500])
        self.assertEqual(spans["durNs"][kernels[0]], 125)

    def test_two_spans_that_touch_still_touch_after_the_conversion(self) -> None:
        events = [
            x("cuda_runtime", "cudaLaunchKernel", "10.000", "1.000", correlation=1),
            x("cuda_runtime", "cudaLaunchKernel", "11.000", "1.000", correlation=2),
            x("kernel", "a", "100.0004", "0.3333", pid=0, tid=7, correlation=1),
            x("kernel", "b", "100.3337", "0.5000", pid=0, tid=7, correlation=2),
            x("user_annotation", "ProfilerStep#1", "5.000", "200.000"),
        ]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        document, _, _ = self.export(path, "--format", "torch")
        spans = document["spans"]
        kernels = [i for i in range(len(spans["track"])) if document["strings"][spans["cat"][i]] == "kernel"]
        a, b = kernels
        self.assertEqual(spans["startNs"][a] + spans["durNs"][a], spans["startNs"][b])

    def test_a_time_that_is_not_a_time_is_refused(self) -> None:
        for ts in ('"later"', "1e400", "true"):
            with self.subTest(ts):
                body = '{"traceEvents": [{"ph": "X", "cat": "kernel", "name": "k", "pid": 0, "tid": 7, "ts": %s, "dur": 1.0}]}' % ts
                with self.assertRaises(GraderError):
                    torch_profiler.read_capture(body.encode(), Options())

    def test_a_negative_duration_is_refused(self) -> None:
        body = capture_text([x("kernel", "k", "10.0", "-1.0", pid=0, tid=7, correlation=1)])
        with self.assertRaisesRegex(GraderError, "negative"):
            torch_profiler.read_capture(body.encode(), Options())


class Steps(Workspace):
    def base(self) -> list[str]:
        return [
            x("user_annotation", "ProfilerStep#1", "100.0", "50.0"),
            x("user_annotation", "ProfilerStep#2", "200.0", "50.0"),
            x("cuda_runtime", "cudaLaunchKernel", "110.0", "2.0", correlation=1),
            x("cuda_runtime", "cudaLaunchKernel", "210.0", "2.0", correlation=2),
            x("kernel", "a", "300.0", "20.0", pid=0, tid=7, correlation=1),
            x("kernel", "b", "400.0", "30.0", pid=0, tid=7, correlation=2),
        ]

    def test_the_gpu_runs_after_the_cpu_left_the_step_and_the_window_is_where_the_gpu_ran(self) -> None:
        path = self.dir / "c.json"
        path.write_text(capture_text(self.base()), encoding="utf-8")
        document, _, _ = self.export(path, "--format", "torch")
        # The CPU ranges are 100-150 and 200-250, and the kernels run at 300-320 and 400-430: the windows are the GPU's, from 300 to 400 and from 400 to 430.
        self.assertEqual([m["tNs"] for m in document["marks"]], [190_000, 290_000, 320_000])

    def test_a_capture_with_no_step_range_has_no_mark_and_is_kept_whole(self) -> None:
        events = [e for e in self.base() if "ProfilerStep" not in e]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        document, _, stderr = self.export(path, "--format", "torch")
        self.assertEqual(document["marks"], [])
        self.assertEqual(sum(1 for c in document["spans"]["cat"] if document["strings"][c] == "kernel"), 2)
        self.assertIn("no step range", stderr)

    def test_a_step_name_that_the_capture_uses_is_given_with_step_name(self) -> None:
        events = [e.replace("ProfilerStep#", "decode ") for e in self.base()]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        document, _, _ = self.export(path, "--format", "torch", "--step-name", r"^decode \d+$")
        self.assertEqual(len(document["marks"]), 3)

    def test_a_step_with_no_gpu_work_has_no_window_and_is_said_so(self) -> None:
        events = self.base() + [x("user_annotation", "ProfilerStep#3", "300.0", "50.0")]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        document, _, stderr = self.export(path, "--format", "torch")
        self.assertEqual(len(document["marks"]), 3)
        self.assertIn("ProfilerStep#3", stderr)

    def test_the_main_thread_is_the_one_that_carries_the_steps_or_the_one_named(self) -> None:
        events = self.base() + [x("cuda_runtime", "cudaLaunchKernel", "120.0", "2.0", tid=2, correlation=3), x("kernel", "c", "305.0", "5.0", pid=0, tid=9, correlation=3)]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        document, _, stderr = self.export(path, "--format", "torch")
        self.assertIn("main thread is 1:1", stderr)
        self.assertIn("other thread", stderr)
        # The kernel that thread launched is in the trace, without a launch before it.
        spans = document["spans"]
        unlinked = [i for i in range(len(spans["track"])) if document["strings"][spans["name"][i]] == "c"]
        self.assertEqual([spans["corr"][i] for i in unlinked], [-1])
        out = self.dir / "named.json"
        status, _, err = run(str(path), "--format", "torch", "--main-thread", "9:9", "--out", str(out))
        self.assertEqual(status, 3)
        self.assertIn("not a thread of this capture", err)

    def test_without_steps_the_main_thread_is_the_one_that_launches_most(self) -> None:
        events = [e for e in self.base() if "ProfilerStep" not in e] + [x("cuda_runtime", "cudaLaunchKernel", "120.0", "2.0", tid=2, correlation=3)]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        _, _, stderr = self.export(path, "--format", "torch")
        self.assertIn("main thread is 1:1", stderr)


class Refusals(Workspace):
    def refused(self, *argv: str) -> str:
        status, _, stderr = run(*argv)
        self.assertEqual(status, 3, stderr)
        return stderr

    def test_a_file_that_is_not_json_or_not_a_profiler_trace_is_named_as_such(self) -> None:
        for body, why in (("not json", "not JSON"), ('{"hello": 1}', "traceEvents"), ('{"traceEvents": [NaN]}', "not JSON")):
            with self.subTest(body):
                path = self.dir / "c.json"
                path.write_text(body, encoding="utf-8")
                self.assertIn(why, self.refused(str(path), "--format", "torch", "--out", str(self.dir / "o.json")))
                self.assertFalse((self.dir / "o.json").exists())

    def test_a_capture_with_no_gpu_activity_is_not_a_trace(self) -> None:
        path = self.dir / "c.json"
        path.write_text(capture_text([x("cpu_op", "aten::mm", "1.0", "2.0")]), encoding="utf-8")
        self.assertIn("no kernel or memory copy", self.refused(str(path), "--format", "torch", "--out", str(self.dir / "o.json")))

    def test_steps_whose_work_is_not_in_the_capture_are_refused(self) -> None:
        events = [x("user_annotation", "ProfilerStep#1", "100.0", "50.0"), x("kernel", "a", "300.0", "20.0", pid=0, tid=7, correlation=1)]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        self.assertIn("no step window", self.refused(str(path), "--format", "torch", "--out", str(self.dir / "o.json")))

    def test_a_bad_step_pattern_is_refused(self) -> None:
        self.assertIn("regular expression", self.refused(str(TORCH), "--format", "torch", "--step-name", "(", "--out", str(self.dir / "o.json")))

    def test_an_export_that_lacks_a_table_names_it_and_the_version(self) -> None:
        script = NSYS_SQL.read_text(encoding="utf-8").replace("CUPTI_ACTIVITY_KIND_RUNTIME", "CUPTI_ACTIVITY_KIND_RUNTIME_RENAMED")
        db = self.nsys_db("renamed.sqlite", script)
        error = self.refused(str(db), "--format", "nsys-sqlite", "--out", str(self.dir / "o.json"))
        self.assertIn("no table CUPTI_ACTIVITY_KIND_RUNTIME", error)
        self.assertIn("EXPORT_SCHEMA_VERSION synthetic-1", error)

    def test_an_export_that_lacks_a_column_names_it(self) -> None:
        script = NSYS_SQL.read_text(encoding="utf-8").replace("correlationId INTEGER, copyKind", "corr INTEGER, copyKind").replace("INSERT INTO CUPTI_ACTIVITY_KIND_MEMCPY VALUES", "INSERT INTO CUPTI_ACTIVITY_KIND_MEMCPY (start, end, deviceId, contextId, streamId, corr, copyKind, bytes) VALUES")
        db = self.nsys_db("columns.sqlite", script)
        self.assertIn("no column correlationId", self.refused(str(db), "--format", "nsys-sqlite", "--out", str(self.dir / "o.json")))

    def test_a_file_that_is_not_a_database_is_named_as_such(self) -> None:
        path = self.dir / "junk.sqlite"
        path.write_bytes(b"this is not a database" * 100)
        self.assertIn("not a SQLite database", self.refused(str(path), "--format", "nsys-sqlite", "--out", str(self.dir / "o.json")))

    def test_an_export_with_no_gpu_work_is_not_a_trace(self) -> None:
        script = NSYS_SQL.read_text(encoding="utf-8")
        script = "\n".join(line for line in script.splitlines() if not line.startswith("INSERT INTO CUPTI_ACTIVITY_KIND_KERNEL") and not line.startswith("INSERT INTO CUPTI_ACTIVITY_KIND_MEMCPY") and not line.startswith("INSERT INTO CUPTI_ACTIVITY_KIND_MEMSET"))
        db = self.nsys_db("empty.sqlite", script)
        self.assertIn("no kernel or memory copy", self.refused(str(db), "--format", "nsys-sqlite", "--out", str(self.dir / "o.json"), *NSYS_STEPS))

    def test_an_export_is_read_and_never_changed(self) -> None:
        db = self.nsys_db()
        before = db.read_bytes()
        self.export(db, "--format", "nsys-sqlite", *NSYS_STEPS)
        self.assertEqual(db.read_bytes(), before)

    def test_a_string_id_the_export_does_not_have_is_named(self) -> None:
        script = NSYS_SQL.read_text(encoding="utf-8") + "INSERT INTO CUPTI_ACTIVITY_KIND_RUNTIME VALUES (1, 2, 0, 5, 9, 99999);\n"
        db = self.nsys_db("ids.sqlite", script)
        self.assertIn("StringIds does not have", self.refused(str(db), "--format", "nsys-sqlite", "--out", str(self.dir / "o.json"), *NSYS_STEPS))

    def test_reading_a_nsys_export_directly_gives_the_main_thread_and_the_notes(self) -> None:
        capture = nsys.read_capture(self.nsys_db(), Options(step_name=NSYS_STEPS[1]))
        self.assertEqual(len(capture.steps), 3)
        self.assertEqual(capture.gpu_names, {"NVIDIA GeForce RTX 4090"})
        self.assertTrue(any("no Python frames" in note for note in capture.notes))


class Privacy(Workspace):
    def test_a_path_a_user_a_host_and_a_token_in_a_name_do_not_reach_the_trace(self) -> None:
        frame = f'{HOME}/venv/lib/python3.13/site-packages/vllm/worker.py(321): execute_model {"hf_" + "a" * 30} 10.1.2.3'
        events = [
            x("user_annotation", "ProfilerStep#1", "100.0", "50.0"),
            x("python_function", frame, "301.0", "10.0"),
            x("cuda_runtime", "cudaLaunchKernel", "110.0", "2.0", correlation=1),
            x("kernel", f"void k<{HOME}/x>", "300.0", "20.0", pid=0, tid=7, correlation=1),
        ]
        path = self.dir / "c.json"
        path.write_text(capture_text(events), encoding="utf-8")
        document, _, _ = self.export(path, "--format", "torch", "--gpu", f"GPU in {HOME}")
        text = canonical_json(document)
        for needle in (HOME, "learner-" + "dev", "hf_" + "a" * 30, "10.1.2.3"):
            self.assertNotIn(needle, text)
        self.assertIn("execute_model", text)
        self.assertEqual(encode_trace(document), text)

    def test_the_fixtures_and_their_goldens_hold_no_machine_s_name(self) -> None:
        for path in FIXTURES.iterdir():
            text = path.read_text(encoding="utf-8")
            for needle in ("/ho" + "me/", "/tm" + "p/", "/Us" + "ers/"):
                self.assertNotIn(needle, text, path.name)


class Command(Workspace):
    def test_the_command_is_in_the_table_and_its_help_says_both_formats(self) -> None:
        self.assertIn("trace", cli.COMMANDS)
        out = io.StringIO()
        with contextlib.redirect_stdout(out), self.assertRaises(SystemExit) as stopped:
            cli.main(["trace", "export", "--help"])
        self.assertEqual(stopped.exception.code, 0)
        self.assertIn("nsys-sqlite", out.getvalue())
        self.assertIn("torch", out.getvalue())

    def test_trace_with_no_subcommand_is_a_usage_error_and_help_is_not(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(["trace"]), 2)
            self.assertEqual(cli.main(["trace", "import"]), 2)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(["trace", "--help"]), 0)

    def test_a_missing_input_and_an_output_that_is_the_input_are_usage_errors(self) -> None:
        self.assertEqual(run(str(self.dir / "nothing.json"), "--format", "torch")[0], 2)
        copy = self.dir / "c.json"
        copy.write_bytes(TORCH.read_bytes())
        status, _, stderr = run(str(copy), "--format", "torch", "--out", str(copy))
        self.assertEqual(status, 2)
        self.assertIn("overwrite", stderr)
        self.assertEqual(copy.read_bytes(), TORCH.read_bytes())

    def test_the_default_output_is_beside_the_input_and_has_the_usual_permissions(self) -> None:
        copy = self.dir / "rank0.pt.trace.json"
        copy.write_bytes(TORCH.read_bytes())
        status, _, _ = run(str(copy), "--format", "torch", *META)
        self.assertEqual(status, 0)
        out = self.dir / "rank0.pt.trace.trace.json"
        self.assertTrue(out.is_file())
        umask = os.umask(0)
        os.umask(umask)
        self.assertEqual(stat.S_IMODE(out.stat().st_mode), 0o666 & ~umask)
        self.assertEqual([p.name for p in self.dir.iterdir() if p.name.endswith(".part")], [])

    def test_the_format_is_required_and_is_one_of_two(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()):
            for argv in ([str(TORCH)], [str(TORCH), "--format", "chrome"]):
                with self.subTest(argv), self.assertRaises(SystemExit) as stopped:
                    run(*argv)
                self.assertEqual(stopped.exception.code, 2)

    def test_a_trace_that_leaves_out_what_t1_wants_says_so(self) -> None:
        _, _, stderr = self.export(TORCH, "--format", "torch")
        self.assertIn("meta leaves out", stderr)
        for flag in ("--engine,", "--engine-version", "--captured-at"):
            self.assertIn(flag, stderr)
        _, _, stderr = self.export(TORCH, "--format", "torch", *META)
        self.assertNotIn("meta leaves out", stderr)


if __name__ == "__main__":
    unittest.main()
