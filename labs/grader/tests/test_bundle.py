"""The bundle: written deterministically, read under the caps of rule 1, and checked by rules 2 and 3 (ARCHITECTURE section 8.5 and section 9.6, D-029)."""

from __future__ import annotations

import base64
import copy
import gzip
import json
import tempfile
import unittest
import zlib
from collections.abc import Callable
from pathlib import Path
from typing import Any
from unittest import mock

from enginespace_grader import bundle as bundles
from enginespace_grader.errors import GraderError
from enginespace_grader.hashing import sha256_hex

from . import samples
from .support import vectors_dir

#: The cases that packages/verify/shape.ts is given too (tests/verify/shape.test.ts), at the root of the repository.
SHAPE_CASES = vectors_dir().parents[1] / "tests" / "fixtures" / "grader" / "shape-cases.json"


class Folder(unittest.TestCase):
    """A test with a scratch folder."""

    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)


class Writing(Folder):
    def test_a_bundle_is_read_back_as_it_was_written(self) -> None:
        document = samples.sample_bundle()
        stats = bundles.write_bundle(self.folder / "a.es.json.gz", document)
        read = bundles.read_bundle(self.folder / "a.es.json.gz")
        self.assertEqual(read.document, document)
        self.assertEqual((read.compressed_bytes, read.decompressed_bytes), (stats.compressed_bytes, stats.decompressed_bytes))
        self.assertEqual(bundles.bundle_problems(read.document), [])
        self.assertEqual(bundles.integrity_problems(read.document), [])

    def test_the_same_bundle_gives_the_same_bytes_and_the_header_names_nothing(self) -> None:
        document = samples.sample_bundle()
        bundles.write_bundle(self.folder / "one.es.json.gz", document)
        bundles.write_bundle(self.folder / "two.es.json.gz", copy.deepcopy(document))
        first, second = ((self.folder / name).read_bytes() for name in ("one.es.json.gz", "two.es.json.gz"))
        self.assertEqual(first, second)
        # ID1 ID2, deflate, no flags (so no file name), a modification time of 0, and a compression level byte for the best compression.
        self.assertEqual(first[:9], b"\x1f\x8b\x08\x00\x00\x00\x00\x00\x02")
        self.assertNotIn(b"one.es", first[:40])

    def test_the_stats_name_the_receipt_by_its_hash(self) -> None:
        document = samples.sample_bundle()
        stats = bundles.write_bundle(self.folder / "a.es.json.gz", document)
        from enginespace_grader.receipt import receipt_sha256

        self.assertEqual(stats.receipt_sha256, receipt_sha256(document["receipt"]))

    def test_the_file_appears_whole_and_nothing_is_left_beside_it(self) -> None:
        bundles.write_bundle(self.folder / "deep" / "er" / "a.es.json.gz", samples.sample_bundle())
        self.assertEqual(sorted(path.name for path in (self.folder / "deep" / "er").iterdir()), ["a.es.json.gz"])

    def test_a_bundle_the_site_would_refuse_is_not_written_and_the_message_lists_why(self) -> None:
        document = samples.sample_bundle()
        document["receipt"]["artifacts"][1]["sha256"] = "0" * 64
        target = self.folder / "bad.es.json.gz"
        with self.assertRaises(GraderError) as caught:
            bundles.write_bundle(target, document)
        self.assertIn('artifact "log"', str(caught.exception))
        self.assertFalse(target.exists())
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_a_folder_that_cannot_be_written_is_a_message_and_not_a_traceback(self) -> None:
        (self.folder / "a-file").write_text("not a folder", encoding="utf-8")
        with self.assertRaises(GraderError) as caught:
            bundles.write_bundle(self.folder / "a-file" / "x.es.json.gz", samples.sample_bundle())
        self.assertIn("cannot write the bundle", str(caught.exception))
        self.assertIn("--out", str(caught.exception))

    def test_a_file_that_is_there_is_replaced_whole(self) -> None:
        target = self.folder / "a.es.json.gz"
        target.write_bytes(b"old")
        bundles.write_bundle(target, samples.sample_bundle())
        self.assertEqual(target.read_bytes()[:2], b"\x1f\x8b")

    def test_a_bundle_over_the_caps_is_not_written(self) -> None:
        document = samples.sample_bundle()
        with mock.patch.object(bundles, "MAX_DECOMPRESSED_BYTES", 100), self.assertRaises(GraderError) as caught:
            bundles.write_bundle(self.folder / "big.es.json.gz", document)
        self.assertIn("inBundle false", str(caught.exception))
        self.assertEqual(list(self.folder.iterdir()), [])
        with mock.patch.object(bundles, "MAX_COMPRESSED_BYTES", 100), self.assertRaises(GraderError):
            bundles.write_bundle(self.folder / "big.es.json.gz", document)

    def test_text_that_is_not_ascii_travels_as_utf_8_and_is_hashed_as_it_is(self) -> None:
        document = samples.sample_bundle()
        bundles.write_bundle(self.folder / "a.es.json.gz", document)
        text = gzip.decompress((self.folder / "a.es.json.gz").read_bytes()).decode("utf-8")
        self.assertIn(chr(0xE9), text, "ensure_ascii is off: the file holds the character and not an escape")
        self.assertNotIn("\\u00e9", text)
        self.assertEqual(json.loads(text)["artifacts"]["log"]["data"], samples.LOG)


class Artifacts(unittest.TestCase):
    def test_the_entry_is_computed_from_the_data(self) -> None:
        entry = bundles.Artifact.from_text("log", "log", "text/plain", "a\r\nb").entry()
        self.assertEqual(entry, {"id": "log", "kind": "log", "format": "text/plain", "sha256": sha256_hex(b"a\r\nb"), "bytes": 4, "inBundle": True})

    def test_bytes_travel_as_base64_and_are_hashed_as_the_bytes(self) -> None:
        raw = bytes(range(256))
        artifact = bundles.Artifact.from_bytes("blob", "report", "binary", raw)
        self.assertEqual(artifact.encoding, "base64")
        self.assertEqual(base64.b64decode(artifact.data), raw)
        self.assertEqual(artifact.entry()["sha256"], sha256_hex(raw))
        self.assertEqual(artifact.entry()["bytes"], 256)

    def test_a_json_value_is_hashed_as_its_canonical_text(self) -> None:
        entry = bundles.Artifact.from_json("t", "trace", "json", {"b": 1, "a": 0.5}).entry()
        self.assertEqual(entry["sha256"], sha256_hex(b'{"a":0.5,"b":1}'))

    def test_one_that_stays_with_the_learner_is_listed_by_its_hash_and_size(self) -> None:
        kept = bundles.Artifact.kept("capture", "report", "binary", "a" * 64, 123)
        self.assertEqual(kept.entry(), {"id": "capture", "kind": "report", "format": "binary", "sha256": "a" * 64, "bytes": 123, "inBundle": False})
        with self.assertRaises(ValueError):
            bundles.Artifact("capture", "report", "binary", in_bundle=False).entry()

    def test_an_artifact_that_cannot_be_hashed_is_refused_by_name(self) -> None:
        for artifact in (
            bundles.Artifact.from_json("big", "outputs", "json", {"n": 2**60}),
            bundles.Artifact.from_text("odd", "log", "text", "lone " + chr(0xD800)),
            bundles.Artifact("worse", "log", "text", "yaml", "x"),
            bundles.Artifact("none", "log", "text", None, "x"),
        ):
            with self.assertRaises(ValueError) as caught:
                artifact.entry()
            self.assertIn(repr(artifact.id), str(caught.exception))

    def test_a_bundle_is_built_from_the_artifacts_the_receipt_lists_as_travelling(self) -> None:
        document = samples.sample_bundle()
        built = bundles.build_bundle(document["receipt"], [bundles.Artifact.from_json("trace", "trace", "enginespace/trace@1", samples.TRACE), bundles.Artifact.from_text("log", "log", "text/plain", samples.LOG)])
        self.assertEqual(built, document)
        with self.assertRaises(ValueError) as caught:
            bundles.build_bundle(document["receipt"], [])
        self.assertIn("'trace'", str(caught.exception))


def with_change(change: Callable[[dict[str, Any]], None]) -> list[str]:
    document = samples.sample_bundle()
    change(document)
    return bundles.bundle_problems(document)


class Rule2(unittest.TestCase):
    def refused(self, change: Callable[[dict[str, Any]], None], *fragments: str) -> None:
        problems = with_change(change)
        self.assertNotEqual(problems, [], "the change was not refused")
        for fragment in fragments:
            self.assertTrue(any(fragment in problem for problem in problems), f"{fragment!r} is not in {problems}")

    def test_the_sample_bundle_has_no_problem(self) -> None:
        self.assertEqual(with_change(lambda document: None), [])

    def test_an_unknown_top_level_field_is_refused_and_ext_is_ignored(self) -> None:
        self.refused(lambda d: d.update(hostname="example-host"), "hostname")
        self.refused(lambda d: d.update(schema="enginespace/bundle@2"), "/schema")
        self.refused(lambda d: d.pop("receipt"), "receipt")
        self.refused(lambda d: d.pop("artifacts"), "artifacts")
        self.assertEqual(with_change(lambda d: d["receipt"]["ext"].update(anything={"at": ["all"]})), [])

    def test_what_is_not_a_bundle_is_a_problem_and_not_an_exception(self) -> None:
        for value in (None, [], "text", 3, {}):
            self.assertNotEqual(bundles.bundle_problems(value), [])

    def test_the_artifacts_are_exactly_those_the_receipt_lists_as_travelling(self) -> None:
        self.refused(lambda d: d["artifacts"].pop("log"), 'artifact "log" is listed as in the bundle, and the bundle has no data for it')
        self.refused(lambda d: d["artifacts"].update(extra={"encoding": "text", "data": "x"}), 'the bundle holds data for "extra"')
        self.refused(lambda d: d["artifacts"].update(capture={"encoding": "text", "data": "x"}), 'the bundle holds data for "capture"')

    def test_an_artifact_has_an_encoding_and_data_and_nothing_else(self) -> None:
        self.refused(lambda d: d["artifacts"].update(log={"encoding": "text"}), "/artifacts/log", "encoding and data")
        self.refused(lambda d: d["artifacts"].update(log={"encoding": "text", "data": "x", "name": "log.txt"}), "/artifacts/log")
        self.refused(lambda d: d["artifacts"].update(log={"encoding": "yaml", "data": "x"}), "/artifacts/log/encoding", "json, text, base64")
        self.refused(lambda d: d["artifacts"].update(log="a string"), "/artifacts/log")
        self.refused(lambda d: d["artifacts"].update(log=None), "/artifacts/log")

    def test_an_artifact_id_is_lower_case_words(self) -> None:
        for bad in ("Log", "__proto__", "a b", "", "x" * 65, "a..b"):
            def rename(d: dict[str, Any], bad: str = bad) -> None:
                d["artifacts"][bad] = d["artifacts"].pop("log")
                d["receipt"]["artifacts"][1]["id"] = bad

            self.refused(rename, "artifacts")

    def test_a_name_out_of_a_hostile_file_is_quoted_short(self) -> None:
        def long_names(document: dict[str, Any]) -> None:
            document["artifacts"]["x" * 100_000] = {"encoding": "text", "data": "x"}
            document["artifacts"]["y" * 100_000] = {"encoding": "yaml", "data": "x"}
            document["artifacts"]["z" * 100_000] = "not an object"

        problems = with_change(long_names)
        self.assertGreaterEqual(len(problems), 3)
        self.assertTrue(all(len(problem) < 1000 for problem in problems), [len(problem) for problem in problems])

        def listed_long(document: dict[str, Any]) -> None:
            name = "w" * 100_000
            document["receipt"]["artifacts"][1]["id"] = "log"
            document["artifacts"][name.lower()] = {"encoding": "text", "data": "x"}

        self.assertTrue(all(len(problem) < 1000 for problem in with_change(listed_long)))

    def test_the_data_of_each_encoding_has_its_form(self) -> None:
        self.refused(lambda d: d["artifacts"].update(log={"encoding": "base64", "data": "AAE"}), "/artifacts/log/data", "base64")
        self.refused(lambda d: d["artifacts"].update(log={"encoding": "base64", "data": "AAEC\n"}), "base64")
        self.refused(lambda d: d["artifacts"].update(log={"encoding": "text", "data": "a" + chr(0xD800)}), "/artifacts/log/data", "lone surrogate")
        self.refused(lambda d: d["artifacts"].update(log={"encoding": "text", "data": 3}), "/artifacts/log")
        self.assertEqual(with_change(lambda d: d["artifacts"].update(log={"encoding": "base64", "data": "AAEC"})), [], "the hash is rule 3's, not this rule's")

    def test_a_large_artifact_is_read_without_a_pattern_over_it(self) -> None:
        document = samples.sample_bundle()
        document["artifacts"]["log"] = {"encoding": "base64", "data": "AAAA" * 3_000_000}
        self.assertEqual(bundles.bundle_problems(document), [])


class Rule3(unittest.TestCase):
    def test_the_sample_bundle_is_intact(self) -> None:
        self.assertEqual(bundles.integrity_problems(samples.sample_bundle()), [])

    def test_a_changed_hash_names_the_artifact_and_both_hashes(self) -> None:
        document = samples.sample_bundle()
        real = document["receipt"]["artifacts"][1]["sha256"]
        document["receipt"]["artifacts"][1]["sha256"] = "0" * 64
        problems = bundles.integrity_problems(document)
        self.assertEqual(len(problems), 1)
        self.assertIn('artifact "log"', problems[0])
        self.assertIn(real, problems[0])
        self.assertIn("0" * 64, problems[0])

    def test_changed_data_is_caught_in_each_encoding(self) -> None:
        for name, other in (("log", {"encoding": "text", "data": samples.LOG + " "}), ("trace", {"encoding": "json", "data": {**samples.TRACE, "marks": []}}), ("log", {"encoding": "base64", "data": "AAEC"})):
            document = samples.sample_bundle()
            document["artifacts"][name] = other
            problems = bundles.integrity_problems(document)
            self.assertTrue(any(f'artifact "{name}"' in problem for problem in problems), (name, problems))

    def test_one_byte_of_a_trace_is_enough(self) -> None:
        document = samples.sample_bundle()
        document["artifacts"]["trace"]["data"]["spans"]["durNs"][0] += 1
        self.assertTrue(any('artifact "trace"' in problem for problem in bundles.integrity_problems(document)))

    def test_a_wrong_byte_count_names_the_artifact(self) -> None:
        document = samples.sample_bundle()
        document["receipt"]["artifacts"][1]["bytes"] += 1
        problems = bundles.integrity_problems(document)
        self.assertEqual(len(problems), 1)
        self.assertIn('artifact "log"', problems[0])
        self.assertIn("bytes", problems[0])

    def test_data_with_no_canonical_bytes_is_a_problem_that_names_the_artifact(self) -> None:
        document = samples.sample_bundle()
        document["artifacts"]["trace"]["data"] = {"too": 2**60}
        problems = bundles.integrity_problems(document)
        self.assertEqual(len(problems), 1)
        self.assertIn('artifact "trace"', problems[0])
        self.assertIn("canonical", problems[0])

    def test_a_kept_artifact_is_not_hashed(self) -> None:
        document = samples.sample_bundle()
        document["receipt"]["artifacts"][2]["sha256"] = "f" * 64
        self.assertEqual(bundles.integrity_problems(document), [])


def gz(payload: bytes) -> bytes:
    return gzip.compress(payload, mtime=0)


class Rule1(Folder):
    def read(self, data: bytes, **caps: int) -> bundles.BundleRead:
        path = self.folder / "f.es.json.gz"
        path.write_bytes(data)
        return bundles.read_bundle(path, **caps)

    def refused(self, data: bytes, rule: int, fragment: str, **caps: int) -> None:
        with self.assertRaises(bundles.BundleReadError) as caught:
            self.read(data, **caps)
        self.assertEqual(caught.exception.rule, rule)
        self.assertIn(fragment, str(caught.exception))

    def test_the_caps_are_the_architectures(self) -> None:
        self.assertEqual((bundles.MAX_COMPRESSED_BYTES, bundles.MAX_DECOMPRESSED_BYTES), (32 * 1024 * 1024, 256 * 1024 * 1024))

    def test_a_zip_bomb_stops_at_the_cap_and_the_message_says_so(self) -> None:
        bomb = gz(b"[" + b"0," * 5_000_000 + b"0]")  # 10 MB of text inside a few kilobytes
        self.assertLess(len(bomb), 100_000)
        self.refused(bomb, 1, "more than the 1,000,000 bytes", max_decompressed=1_000_000)
        # The same bytes are fine under a cap that is large enough.
        self.assertEqual(len(self.read(bomb, max_decompressed=20_000_000).document), 5_000_001)

    def test_it_stops_decompressing_where_the_cap_is_and_does_not_hold_the_whole_stream(self) -> None:
        zeros = zlib.compressobj(wbits=31)
        stream = b"".join(zeros.compress(bytes(1 << 20)) for _ in range(300)) + zeros.flush()  # 300 MB of zeros in about 300 KB
        with self.assertRaises(bundles.BundleReadError) as caught:
            bundles.gunzip_capped(stream, 50 * (1 << 20))
        self.assertIn("52,428,800", str(caught.exception))

    def test_a_file_over_the_compressed_cap_is_refused_before_it_is_read(self) -> None:
        self.refused(gz(b"{}") * 40, 1, "at most 10 compressed", max_compressed=10)

    def test_a_file_that_is_not_gzip_is_refused_with_a_hint(self) -> None:
        self.refused(b'{"schema": "enginespace/bundle@1"}', 1, "not a gzip file")
        self.refused(b"", 1, "not a gzip file")
        self.refused(b"\x1f", 1, "not a gzip file")

    def test_a_gzip_stream_must_be_whole_and_single(self) -> None:
        whole = gz(b"{}")
        self.refused(whole[:-5], 1, "cut short")
        self.refused(whole[:12], 1, "cut short")
        self.refused(whole + b"junk", 1, "after the end of the gzip stream")
        self.refused(whole + whole, 1, "after the end of the gzip stream")
        broken = bytearray(whole)
        broken[-6] ^= 0xFF
        self.refused(bytes(broken), 1, "the gzip data is damaged")

    def test_a_folder_or_a_device_is_not_a_bundle(self) -> None:
        with self.assertRaises(bundles.BundleReadError) as caught:
            bundles.read_bundle(self.folder)
        self.assertEqual(caught.exception.rule, 1)
        self.assertIn("not a file", str(caught.exception))
        if Path("/dev/zero").exists():
            with self.assertRaises(bundles.BundleReadError):
                bundles.read_bundle(Path("/dev/zero"))
        with self.assertRaises(FileNotFoundError):
            bundles.read_bundle(self.folder / "missing.es.json.gz")

    def test_the_text_inside_must_be_utf_8_without_a_mark_and_json_without_nan(self) -> None:
        self.refused(gz(b'{"a":"\xff"}'), 2, "not UTF-8")
        self.refused(gz(b"\xef\xbb\xbf{}"), 2, "byte order mark")
        self.refused(gz(b'{"a": NaN}'), 2, "NaN is not JSON")
        self.refused(gz(b'{"a": Infinity}'), 2, "not JSON")
        self.refused(gz(b'{"a": 1,}'), 2, "not JSON")
        self.refused(gz(b""), 2, "not JSON")
        self.refused(gz(b"{} {}"), 2, "not JSON")

    def test_json_nested_beyond_what_can_be_read_is_a_message_and_not_a_crash(self) -> None:
        # The shape bound (class Shape below) stops it first; the parser's own RecursionError is only the second line of defence.
        self.refused(gz(b"[" * 200_000 + b"]" * 200_000), 2, "nests more than 64 levels deep")

    def test_a_good_file_reports_its_sizes(self) -> None:
        payload = b'{"a": [1, 2, 3]}'
        read = self.read(gz(payload))
        self.assertEqual(read.document, {"a": [1, 2, 3]})
        self.assertEqual(read.decompressed_bytes, len(payload))
        self.assertEqual(read.compressed_bytes, len(gz(payload)))


class Shape(Folder):
    """Rule 2 looks at the shape of the text before it parses it (packages/verify/shape.ts): the caps bound the bytes, and bytes are not what a parser costs."""

    def read(self, data: bytes, **bounds: int) -> bundles.BundleRead:
        path = self.folder / "f.es.json.gz"
        path.write_bytes(data)
        return bundles.read_bundle(path, **bounds)

    def refused(self, data: bytes, fragment: str, **bounds: int) -> None:
        with mock.patch.object(bundles, "parse_json", side_effect=AssertionError("the text was parsed")), self.assertRaises(bundles.BundleReadError) as caught:
            self.read(data, **bounds)
        self.assertEqual(caught.exception.rule, 2)
        self.assertIn(fragment, str(caught.exception))

    def test_the_bounds_are_the_sites(self) -> None:
        self.assertEqual((bundles.MAX_DEPTH, bundles.MAX_NODES), (64, 4 * 1024 * 1024))
        self.assertEqual(bundles.MAX_NODES, 4_194_304)

    def test_the_scan_gives_the_cases_that_the_site_is_given_the_answers_the_site_gets(self) -> None:
        document = json.loads(SHAPE_CASES.read_text(encoding="utf-8"))
        self.assertEqual(document["spec"], "enginespace/shape-cases@1")
        self.assertGreater(len(document["cases"]), 20)
        for case in document["cases"]:
            with self.subTest(case["name"]):
                scan = bundles.ShapeScan(case["limits"]["depth"], case["limits"]["nodes"])
                if case["ok"]:
                    scan.feed(case["text"].encode("utf-8"))
                    self.assertEqual((scan.deepest, scan.nodes), (case["deepest"], case["nodes"]))
                else:
                    with self.assertRaises(bundles.ShapeError) as caught:
                        scan.feed(case["text"].encode("utf-8"))
                    self.assertEqual(caught.exception.reason, case["reason"])

    def test_the_count_carries_from_one_piece_to_the_next_and_a_string_does_not(self) -> None:
        scan = bundles.ShapeScan(3, 100)
        scan.feed(b'{"a":[')
        scan.feed(b'1,{"b":2}')
        self.assertEqual((scan.depth, scan.deepest, scan.nodes), (2, 3, 5))
        with self.assertRaises(bundles.ShapeError):
            scan.feed(b"[[")  # two open already, and a third is the bound; the fourth is past it
        scan = bundles.ShapeScan()
        scan.feed(b'["abc')  # an unterminated string takes the rest of its piece, and no more
        scan.feed(b',"def"]')
        self.assertEqual((scan.depth, scan.nodes), (0, 3))

    def test_the_messages_say_the_bound_and_that_the_text_was_not_parsed(self) -> None:
        with self.assertRaises(bundles.ShapeError) as deep:
            bundles.ShapeScan().feed(b"[" * 65)
        self.assertEqual(
            str(deep.exception),
            "the JSON inside nests more than 64 levels deep, and the site parses at most that [estimated]: a bundle nests about 7. It was not parsed, because the parser's memory grows with the depth",
        )
        with self.assertRaises(bundles.ShapeError) as wide:
            bundles.ShapeScan(64, 10).feed(b"[" + b"[]," * 10 + b"[]]")
        self.assertIn("holds more than 10 arrays, objects and strings (member names included)", str(wide.exception))
        self.assertTrue(str(wide.exception).endswith("because the parser's memory grows with their number"))

    def test_text_nested_beyond_the_bound_is_refused_at_rule_2_and_never_parsed(self) -> None:
        self.refused(gz(b"[" * 200_000 + b"]" * 200_000), "nests more than 64 levels deep")
        self.refused(gz(b"[" * 65 + b"]" * 65), "nests more than 64 levels deep")
        self.assertEqual(self.read(gz(b"[" * 64 + b"]" * 64)).decompressed_bytes, 128)

    def test_text_with_more_pieces_than_the_bound_is_refused_at_rule_2_and_never_parsed(self) -> None:
        # At the real bound once, which is a few seconds of regular expression, and at a small one for each kind of piece.
        self.refused(gz(b"[" + b",".join([b"[]"] * bundles.MAX_NODES) + b"]"), "holds more than 4,194,304 arrays, objects and strings")
        for unit in (b"[]", b"{}", b'""', b'{"k":0}', b'["x"]'):
            with self.subTest(unit=unit):
                self.refused(gz(b"[" + b",".join([unit] * 2000) + b"]"), "holds more than 1,000 arrays, objects and strings", max_nodes=1000)

    def test_a_parse_that_runs_out_of_memory_is_a_message_and_not_a_crash(self) -> None:
        # Numbers are not counted, and a column of them can still be more than a machine has room for as Python objects.
        with mock.patch.object(bundles, "parse_json", side_effect=MemoryError), self.assertRaises(bundles.BundleReadError) as caught:
            self.read(gz(b"[1,2,3]"))
        self.assertEqual(caught.exception.rule, 2)
        self.assertIn("needs more memory than this machine has", str(caught.exception))

    def test_a_bound_given_by_the_caller_is_the_one_held(self) -> None:
        text = json.dumps({"a": [1, 2, {"b": "c"}]}).encode()
        self.assertEqual(self.read(gz(text), max_depth=3, max_nodes=6).document, {"a": [1, 2, {"b": "c"}]})
        self.refused(gz(text), "nests more than 2 levels deep", max_depth=2)
        self.refused(gz(text), "holds more than 5 arrays", max_nodes=5)

    def test_numbers_are_not_counted_so_a_column_of_integers_passes_whatever_its_length(self) -> None:
        column = b"[" + b"1234567," * 2_000_000 + b"0]"
        read = self.read(gz(column), max_nodes=1)
        self.assertEqual(len(read.document), 2_000_001)

    def test_the_bundles_of_the_grader_and_of_the_site_are_far_inside_the_bounds(self) -> None:
        scan = bundles.ShapeScan()
        scan.feed(json.dumps(samples.sample_bundle(), ensure_ascii=False).encode("utf-8"))
        self.assertLessEqual(scan.deepest, 7)
        self.assertLessEqual(scan.nodes * 1000, bundles.MAX_NODES)

    def test_the_writer_refuses_a_bundle_the_site_would_refuse_for_its_shape_and_leaves_nothing_behind(self) -> None:
        document = samples.sample_bundle()
        target = self.folder / "shape.es.json.gz"
        with mock.patch.object(bundles, "MAX_NODES", 50), self.assertRaises(GraderError) as caught:
            bundles.write_bundle(target, document)
        self.assertIn("would not pass the site's checks, and was not written", str(caught.exception))
        self.assertIn("holds more than 50 arrays, objects and strings", str(caught.exception))
        self.assertIn("inBundle false", str(caught.exception))
        with mock.patch.object(bundles, "MAX_DEPTH", 3), self.assertRaises(GraderError) as deep:
            bundles.write_bundle(target, document)
        self.assertIn("nests more than 3 levels deep", str(deep.exception))
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_the_writer_writes_what_the_reader_reads_under_the_same_bounds(self) -> None:
        document = samples.sample_bundle()
        with mock.patch.object(bundles, "MAX_DEPTH", 7), mock.patch.object(bundles, "MAX_NODES", 400):
            bundles.write_bundle(self.folder / "a.es.json.gz", document)
        self.assertEqual(bundles.read_bundle(self.folder / "a.es.json.gz", max_depth=7, max_nodes=400).document, document)


if __name__ == "__main__":
    unittest.main()
