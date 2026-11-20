"""`enginespace fetch` (ARCHITECTURE sections 9.4 and 9.7, W2-T05): the references manifest, and the downloads it pins.

Every download comes from a file server on 127.0.0.1 (fileserver.py), and no test reaches the internet. The acceptance checks of the task:
  1. A hash mismatch aborts and deletes the partial file (`Mismatch`).
  2. The User-Agent is `enginespace-grader/<version>`, and nothing else in a request names a person (`Privacy`).
And the rest of what the command promises: it resumes, it keeps nothing it cannot vouch for, it reads the same manifests as the site's schema (`Manifests`), and it
fails with a message and a status that say what to do (`Command`).
"""

from __future__ import annotations

import contextlib
import functools
import io
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from unittest import mock

from enginespace_grader import GRADER_NAME, __version__, cli, fetch, schemas
from enginespace_grader.errors import GraderError
from enginespace_grader.hashing import sha256_hex
from enginespace_grader.receipt import receipt_problems

from . import samples
from .fileserver import FileServer
from .support import vectors_dir

REPOSITORY = vectors_dir().parents[1]
CASES = REPOSITORY / "tests" / "fixtures" / "references" / "cases.json"
COMMITTED_MANIFEST = REPOSITORY / "labs" / "references" / "manifest.json"


def blob(size: int, seed: int = 1) -> bytes:
    """Synthetic bytes: a different stream for each seed, and none that a file of the course holds. A download that goes on from the wrong place does not hash right."""
    return bytes((i * 31 + i // 251 * 7 + seed) % 256 for i in range(size))


def entry(url: str, body: bytes, path: str = "tr0/blob.bin", **over: Any) -> dict[str, Any]:
    """An entry of the manifest for `body`, served at `url`. Synthetic: it names no file that exists."""
    made: dict[str, Any] = {
        "name": "Synthetic blob",
        "kind": "reference",
        "labs": ["tr0.forward"],
        "path": path,
        "url": url,
        "sha256": sha256_hex(body),
        "bytes": len(body),
        "licence": "synthetic",
        "date": "2026-11-09",
    }
    made.update(over)
    return made


def reference(url: str, body: bytes, path: str = "tr0/blob.bin", **over: Any) -> fetch.Reference:
    return fetch.Reference.from_object(entry(url, body, path, **over))


def manifest_of(*entries: dict[str, Any]) -> dict[str, Any]:
    return {"schema": "enginespace/references@1", "entries": list(entries)}


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = cli.main(list(argv))
    return status, out.getvalue(), err.getvalue()


class Folder(unittest.TestCase):
    """A scratch folder with a cache in it, and a server that serves files (started by the first test that asks for it)."""

    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)
        self.cache = self.folder / "cache"
        self.log: list[str] = []

    @functools.cached_property
    def server(self) -> FileServer:
        return self.enterContext(FileServer())

    def files_in_cache(self) -> list[str]:
        return sorted(path.relative_to(self.cache).as_posix() for path in self.cache.rglob("*") if path.is_file()) if self.cache.exists() else []

    def fetch(self, ref: fetch.Reference) -> fetch.Fetched:
        return fetch.fetch_reference(ref, self.cache, say=self.log.append)

    def write_manifest(self, *entries: dict[str, Any], name: str = "manifest.json") -> Path:
        path = self.folder / name
        path.write_text(json.dumps(manifest_of(*entries)), encoding="utf-8")
        return path


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# The manifest
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


def cases() -> dict[str, Any]:
    document: dict[str, Any] = json.loads(CASES.read_text(encoding="utf-8"))
    assert document["spec"] == "enginespace/references-cases@1"
    return document


def document_of(case: dict[str, Any], base: dict[str, Any]) -> Any:
    """The manifest a case describes: its own, or its entries, each the base entry with the case's keys set over it."""
    if "manifest" in case:
        return case["manifest"]
    made: list[dict[str, Any]] = []
    for over in case["entries"]:
        over = dict(over)
        removed = over.pop("$remove", [])
        one = {**base, **over}
        for key in removed:
            del one[key]
        made.append(one)
    return manifest_of(*made)


class Manifests(Folder):
    def test_the_cases_that_typescript_judges_too_get_the_same_verdict_here(self) -> None:
        """tests/fixtures/references/cases.json: the JSON Schema that zod exports, and the rules after it, judge each manifest as the zod schema does, at the same places."""
        document = cases()
        self.assertGreaterEqual(len(document["cases"]), 90)
        for case in document["cases"]:
            with self.subTest(case=case["id"]):
                problems = fetch.manifest_problems(document_of(case, document["base"]))
                self.assertEqual(problems == [], case["valid"], problems)
                if not case["valid"] and case.get("where") is not None:
                    self.assertEqual(sorted({problem.split(":", 1)[0] for problem in problems}), sorted(case["where"]), problems)

    def test_the_limits_hold_at_their_edges(self) -> None:
        base = cases()["base"]

        def many(count: int) -> dict[str, Any]:
            return manifest_of(*({**base, "name": f"file {i}", "path": f"f{i}.bin"} for i in range(count)))

        def labs(count: int) -> list[str]:
            return [f"tr0.lab-{chr(97 + i % 26)}{chr(97 + i // 26)}" for i in range(count)]

        self.assertEqual(fetch.manifest_problems(many(256)), [])
        self.assertEqual([problem.split(":")[0] for problem in fetch.manifest_problems(many(257))], ["/entries"])
        self.assertEqual(fetch.manifest_problems(manifest_of({**base, "labs": labs(16)})), [])
        self.assertEqual([problem.split(":")[0] for problem in fetch.manifest_problems(manifest_of({**base, "labs": labs(17)}))], ["/entries/0/labs"])
        for key, edge in (("name", 128), ("licence", 128), ("revision", 64), ("notes", 1000)):
            with self.subTest(key=key):
                self.assertEqual(fetch.manifest_problems(manifest_of({**base, key: "n" * edge})), [])
                self.assertEqual([problem.split(":")[0] for problem in fetch.manifest_problems(manifest_of({**base, key: "n" * (edge + 1)}))], [f"/entries/0/{key}"])
        self.assertEqual(fetch.manifest_problems(manifest_of({**base, "name": "\N{GRINNING FACE}" * 128})), [], "128 emoji are 128 characters, as JSON Schema counts them")
        self.assertEqual(len(fetch.manifest_problems(manifest_of({**base, "name": "\N{GRINNING FACE}" * 129}))), 1)
        self.assertEqual(fetch.manifest_problems(manifest_of({**base, "path": "a" * 200})), [])
        self.assertEqual(len(fetch.manifest_problems(manifest_of({**base, "path": "a" * 201}))), 1)
        self.assertEqual(fetch.manifest_problems(manifest_of({**base, "url": "https://example.invalid/" + "a" * (2048 - 24)})), [])
        self.assertEqual(len(fetch.manifest_problems(manifest_of({**base, "url": "https://example.invalid/" + "a" * (2049 - 24)}))), 1)

    def test_the_schema_the_grader_reads_is_the_one_it_ships(self) -> None:
        self.assertIn("references", schemas.SCHEMA_NAMES)
        document = schemas.load_schema("references")
        self.assertEqual(document["title"], fetch.REFERENCES_SCHEMA_TAG)
        self.assertEqual(document["properties"]["schema"]["const"], fetch.REFERENCES_SCHEMA_TAG)
        self.assertEqual(schemas.schema_bytes("references"), (REPOSITORY / "schemas" / "references.schema.json").read_bytes())

    def test_the_manifest_the_kit_ships_is_one_and_downloads_from_https_only(self) -> None:
        manifest = fetch.load_manifest(COMMITTED_MANIFEST)
        self.assertEqual(manifest.source, COMMITTED_MANIFEST)
        for ref in manifest.entries:
            self.assertEqual(fetch.url_problem(ref.url), None, ref.name)
            self.assertTrue(ref.url.startswith("https://"), f"{ref.name}: a committed entry is never a loopback URL")

    def test_a_manifest_is_read_into_entries_that_know_their_labs(self) -> None:
        body = b"hello"
        path = self.write_manifest(
            entry("https://example.invalid/a", body, "a.bin", name="A", labs=["tr0.forward", "tr8.replay"]),
            entry("https://example.invalid/b", body, "b.bin", name="B", labs=["tr8.replay"], revision="main", notes="n"),
        )
        manifest = fetch.load_manifest(path)
        self.assertEqual([ref.name for ref in manifest.entries], ["A", "B"])
        self.assertEqual(manifest.labs(), ["tr0.forward", "tr8.replay"])
        self.assertEqual([ref.name for ref in manifest.for_lab("tr8.replay")], ["A", "B"])
        self.assertEqual([ref.name for ref in manifest.for_lab("tr0.forward")], ["A"])
        self.assertEqual(manifest.for_lab("tr9.nothing"), [])
        self.assertEqual((manifest.entries[1].revision, manifest.entries[1].notes, manifest.entries[0].revision), ("main", "n", None))

    def test_an_entry_is_the_input_a_receipt_records(self) -> None:
        """The receipt's `inputs` entry for a fetched file is the manifest's: same name, kind, revision, hash and size, and a receipt that holds it passes the schema."""
        ref = reference("https://example.invalid/a", b"hello", revision="abc123")
        self.assertEqual(ref.as_input(), {"name": "Synthetic blob", "kind": "reference", "revision": "abc123", "sha256": sha256_hex(b"hello"), "bytes": 5})
        self.assertNotIn("revision", reference("https://example.invalid/a", b"hello").as_input())
        receipt = samples.sample_bundle()["receipt"]
        receipt["inputs"] = [ref.as_input()]
        self.assertEqual(receipt_problems(receipt), [])

    def test_a_size_that_json_wrote_as_a_float_is_a_whole_number_here(self) -> None:
        self.assertIsInstance(fetch.Reference.from_object({**entry("https://example.invalid/a", b"x"), "bytes": 1.0}).size, int)

    def test_a_manifest_that_cannot_be_read_is_a_message_that_says_what_to_do(self) -> None:
        missing = self.folder / "nope.json"
        with self.assertRaises(GraderError) as raised:
            fetch.load_manifest(missing)
        self.assertIn("--manifest", str(raised.exception))
        cases_of_bad_files: list[tuple[bytes, str]] = [
            (b"{", "is not JSON"),
            (b'{"schema": NaN}', "NaN is not JSON"),
            (b"\xff\xfe", "not UTF-8"),
            (b"[" * 100_000, "nested too deeply"),
            (b"[]", "is not a references manifest"),
            (json.dumps(manifest_of({"name": "x"})).encode(), "is not a references manifest"),
        ]
        for data, expected in cases_of_bad_files:
            with self.subTest(expected=expected):
                path = self.folder / "bad.json"
                path.write_bytes(data)
                with self.assertRaises(GraderError) as raised:
                    fetch.load_manifest(path)
                self.assertIn(expected, str(raised.exception))
        path = self.folder / "big.json"
        path.write_bytes(b" " * 200)
        with mock.patch.object(fetch, "MAX_MANIFEST_BYTES", 100), self.assertRaises(GraderError) as raised:
            fetch.load_manifest(path)
        self.assertIn("larger than", str(raised.exception))

    def test_a_problem_of_the_manifest_names_the_file_and_the_place(self) -> None:
        path = self.write_manifest(entry("https://example.invalid/a", b"x", path="../escape"))
        with self.assertRaises(GraderError) as raised:
            fetch.load_manifest(path)
        message = str(raised.exception)
        self.assertIn(str(path), message)
        self.assertIn("/entries/0/path", message)

    def test_the_manifest_is_found_in_the_folder_or_above_it_in_the_kit_or_the_repository(self) -> None:
        def write(folder: Path, location: str) -> Path:
            path = folder / location
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(manifest_of()), encoding="utf-8")
            return path.resolve()

        kit = self.folder / "kit"
        (kit / "gpu" / "tr0-forward").mkdir(parents=True)
        kit_manifest = write(kit, "references/manifest.json")
        self.assertEqual(fetch.find_manifest(kit / "gpu" / "tr0-forward"), kit_manifest)
        checkout = self.folder / "checkout"
        (checkout / "labs" / "grader").mkdir(parents=True)
        repository_manifest = write(checkout, "labs/references/manifest.json")
        self.assertEqual(fetch.find_manifest(checkout / "labs" / "grader"), repository_manifest)
        # In one folder the kit's place comes first, and a nearer folder beats a farther one.
        both = self.folder / "both"
        (both / "inner").mkdir(parents=True)
        write(both, "labs/references/manifest.json")
        kits_place = write(both, "references/manifest.json")
        self.assertEqual(fetch.find_manifest(both), kits_place)
        self.assertEqual(fetch.find_manifest(both / "inner"), kits_place)
        nearer = write(both / "inner", "labs/references/manifest.json")
        self.assertEqual(fetch.find_manifest(both / "inner"), nearer)

    def test_no_manifest_anywhere_is_a_message_that_says_where_it_looked(self) -> None:
        empty = self.folder / "empty"
        empty.mkdir()
        # The places it looks are named here as places that no machine has, so that a manifest somewhere above the temporary folder cannot be found by this test.
        with mock.patch.object(fetch, "MANIFEST_LOCATIONS", ("enginespace-test-nowhere/a.json", "enginespace-test-nowhere/b.json")), self.assertRaises(GraderError) as raised:
            fetch.find_manifest(empty)
        self.assertIn("looked for enginespace-test-nowhere/a.json and enginespace-test-nowhere/b.json", str(raised.exception))
        self.assertIn("--manifest", str(raised.exception))
        self.assertEqual(fetch.MANIFEST_LOCATIONS, ("references/manifest.json", "labs/references/manifest.json"))

    def test_the_cache_is_the_learners_own_folder_and_the_environment_chooses_it(self) -> None:
        self.assertEqual(fetch.default_cache({"ENGINESPACE_CACHE": "/some/where", "XDG_CACHE_HOME": "/xdg"}), Path("/some/where"))
        self.assertEqual(fetch.default_cache({"XDG_CACHE_HOME": "/xdg"}), Path("/xdg/enginespace/references"))
        # The home folder is invented, so that the test is the same on every machine, whether it has one or not.
        with mock.patch.object(Path, "home", return_value=Path("/invented-house")):
            self.assertEqual(fetch.default_cache({"ENGINESPACE_CACHE": "  ", "XDG_CACHE_HOME": ""}), Path("/invented-house/.cache/enginespace/references"))
            self.assertEqual(fetch.default_cache({}), Path("/invented-house/.cache/enginespace/references"))
        with mock.patch.object(Path, "home", side_effect=RuntimeError("no home")), self.assertRaises(GraderError) as raised:
            fetch.default_cache({})
        self.assertIn("ENGINESPACE_CACHE", str(raised.exception))

    def test_sizes_are_written_for_a_person(self) -> None:
        for count, text in ((0, "0 B"), (684, "684 B"), (1500, "1.5 KB"), (999_999, "1000.0 KB"), (1_000_000, "1.0 MB"), (14_000_000_000, "14.0 GB"), (2_500_000_000_000, "2.5 TB")):
            self.assertEqual(fetch.format_size(count), text)


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# One download
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


class Download(Folder):
    def test_a_file_is_downloaded_hashed_and_put_in_its_place(self) -> None:
        body = blob(5000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        done = self.fetch(ref)
        self.assertEqual((done.status, done.received, done.path), ("fetched", 5000, self.cache / "tr0" / "blob.bin"))
        self.assertEqual(done.path.read_bytes(), body)
        self.assertEqual(self.files_in_cache(), ["tr0/blob.bin"], "no partial file is left behind")
        self.assertEqual(len(self.server.requests_for("/blob.bin")), 1)
        self.assertTrue(any("downloading tr0/blob.bin (5.0 KB)" in line for line in self.log))

    def test_a_file_that_is_already_there_is_not_downloaded_again(self) -> None:
        body = blob(2000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        self.fetch(ref)
        again = self.fetch(ref)
        self.assertEqual((again.status, again.received), ("present", 0))
        self.assertEqual(len(self.server.requests_for("/blob.bin")), 1)

    def test_a_file_that_was_changed_is_downloaded_again_and_replaced(self) -> None:
        body = blob(2000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        done = self.fetch(ref)
        done.path.write_bytes(blob(2000, seed=9))
        again = self.fetch(ref)
        self.assertEqual((again.status, again.received), ("fetched", 2000))
        self.assertEqual(done.path.read_bytes(), body)
        self.assertTrue(any("is not the file the manifest pins" in line for line in self.log))
        done.path.write_bytes(body + b"x")
        self.assertEqual(self.fetch(ref).status, "fetched", "a file of another size is not the file either")

    def test_the_file_of_the_cache_is_read_by_a_lab_only_after_the_same_check(self) -> None:
        body = blob(1500)
        ref = reference(self.server.serve("/blob.bin", body), body)
        with self.assertRaises(GraderError) as raised:
            fetch.cached_file(ref, self.cache)
        self.assertIn("enginespace fetch tr0.forward", str(raised.exception))
        done = self.fetch(ref)
        self.assertEqual(fetch.cached_file(ref, self.cache), done.path)
        done.path.write_bytes(blob(1500, seed=3))
        with self.assertRaises(GraderError):
            fetch.cached_file(ref, self.cache)

    def test_an_empty_file_is_made_from_its_pin_without_a_request(self) -> None:
        ref = reference(self.server.serve("/empty", b""), b"")
        done = self.fetch(ref)
        self.assertEqual((done.status, done.received, done.path.read_bytes()), ("fetched", 0, b""))
        self.assertEqual(self.server.seen, [])

    def test_a_file_is_written_in_the_folder_its_path_names_however_deep(self) -> None:
        body = blob(300)
        ref = reference(self.server.serve("/blob.bin", body), body, path="tr0/qwen3-0.6b/sub/config.json")
        self.assertEqual(self.fetch(ref).path, self.cache / "tr0" / "qwen3-0.6b" / "sub" / "config.json")

    def test_progress_is_reported_while_a_big_file_arrives(self) -> None:
        body = blob(6000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        with mock.patch.object(fetch, "CHUNK", 1000), mock.patch.object(fetch, "PROGRESS_SECONDS", 0.0):
            self.fetch(ref)
        lines = [line for line in self.log if line.startswith("  tr0/blob.bin:")]
        self.assertEqual(len(lines), 6)
        self.assertEqual(lines[0], "  tr0/blob.bin: 1.0 KB of 6.0 KB (16%)")
        self.assertEqual(lines[-1], "  tr0/blob.bin: 6.0 KB of 6.0 KB (100%)")


class Mismatch(Folder):
    """Acceptance 1 of W2-T05: a hash mismatch aborts and deletes the partial file."""

    def test_a_hash_mismatch_aborts_and_deletes_the_partial_file(self) -> None:
        pinned, served = blob(3000), blob(3000, seed=2)
        ref = reference(self.server.serve("/blob.bin", served), pinned)
        with self.assertRaises(fetch.FetchMismatch) as raised:
            self.fetch(ref)
        message = str(raised.exception)
        self.assertIn(sha256_hex(pinned), message)
        self.assertIn(sha256_hex(served), message)
        self.assertIn("was deleted", message)
        self.assertEqual(self.files_in_cache(), [], "neither the partial file nor the file is kept")
        self.assertFalse((self.cache / ref.path).exists())
        self.assertEqual(len(self.server.requests_for("/blob.bin")), 1, "it did not try again")

    def test_a_mismatch_leaves_a_file_that_was_already_in_the_cache_as_it_was(self) -> None:
        """A file in the cache that is not the pinned one is replaced only by a download that matches. When the download does not, it is neither replaced nor mistaken for the pinned file, and no partial file is left."""
        pinned = blob(3000)
        ref = reference(self.server.serve("/blob.bin", blob(3000, seed=2)), pinned)
        (self.cache / "tr0").mkdir(parents=True)
        (self.cache / "tr0" / "blob.bin").write_bytes(b"old")
        with self.assertRaises(fetch.FetchMismatch):
            self.fetch(ref)
        self.assertEqual(self.files_in_cache(), ["tr0/blob.bin"])
        self.assertEqual((self.cache / "tr0" / "blob.bin").read_bytes(), b"old")
        with self.assertRaises(GraderError):
            fetch.cached_file(ref, self.cache)

    def test_a_resumed_download_that_does_not_match_deletes_the_partial_file_too(self) -> None:
        body = blob(3000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(blob(1000, seed=5))  # not the first 1000 bytes of the file
        with self.assertRaises(fetch.FetchMismatch):
            self.fetch(ref)
        self.assertEqual(self.files_in_cache(), [])
        self.assertEqual(self.server.requests_for("/blob.bin")[0].headers["range"], "bytes=1000-")
        # The run after it starts clean and succeeds.
        self.assertEqual(self.fetch(ref).status, "fetched")

    def test_a_server_that_sends_more_than_the_pin_is_stopped_and_nothing_is_kept(self) -> None:
        pinned = blob(1000)
        ref = reference(self.server.serve("/blob.bin", blob(5000), announce=-1), pinned)
        with mock.patch.object(fetch, "CHUNK", 256), self.assertRaises(fetch.FetchMismatch) as raised:
            self.fetch(ref)
        self.assertIn("more than the 1,000 bytes", str(raised.exception))
        self.assertEqual(self.files_in_cache(), [])

    def test_a_size_that_the_server_announces_is_checked_before_a_byte_is_stored(self) -> None:
        ref = reference(self.server.serve("/blob.bin", blob(5000)), blob(3000))
        with self.assertRaises(fetch.FetchMismatch) as raised:
            self.fetch(ref)
        self.assertIn("5,000 bytes, where the manifest pins 3,000", str(raised.exception))
        self.assertIn("Nothing was downloaded", str(raised.exception))
        self.assertEqual(self.files_in_cache(), [])

    def test_a_wrong_answer_does_not_cost_the_learner_the_part_that_is_already_there(self) -> None:
        """A captive portal's page, or a server whose file has changed, is a wrong answer and not wrong bytes: the part that an earlier run kept is left as it was."""
        body = blob(3000)
        for route in (
            {"body": blob(5000)},  # announces another size
            {"body": body, "content_range": "bytes 0-2999/3000"},  # sends another part than was asked for
            {"body": body, "content_range": "bytes 1000-2999/9999"},  # says the file is another size
            {"body": body, "content_range": "nonsense"},  # does not say which part it sends
        ):
            with self.subTest(route=sorted(route)):
                ref = reference(self.server.serve("/blob.bin", **route), body)  # type: ignore[arg-type]
                partial = fetch.partial_path(self.cache / ref.path, ref)
                partial.parent.mkdir(parents=True, exist_ok=True)
                partial.write_bytes(body[:1000])
                with self.assertRaises(fetch.FetchMismatch) as raised:
                    self.fetch(ref)
                self.assertIn("left as it was", str(raised.exception))
                self.assertEqual(partial.read_bytes(), body[:1000])
                self.assertFalse((self.cache / ref.path).exists())

    def test_a_resume_that_answers_with_other_bytes_than_asked_for_says_which(self) -> None:
        body = blob(3000)
        ref = reference(self.server.serve("/blob.bin", body, content_range="bytes 0-2999/3000"), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:1000])
        with self.assertRaises(fetch.FetchMismatch) as raised:
            self.fetch(ref)
        self.assertIn("from 0 on", str(raised.exception))

    def test_a_resume_answered_without_a_content_range_says_so(self) -> None:
        body = blob(3000)
        ref = reference(self.server.serve("/blob.bin", body, content_range="nonsense"), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:1000])
        with self.assertRaises(fetch.FetchMismatch) as raised:
            self.fetch(ref)
        self.assertIn("without saying which bytes", str(raised.exception))

    def test_a_server_whose_file_is_shorter_than_the_partial_one_is_refused_and_the_partial_file_deleted(self) -> None:
        body = blob(3000)
        ref = reference(self.server.serve("/blob.bin", body[:500]), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:1000])
        with self.assertRaises(fetch.FetchMismatch) as raised:
            self.fetch(ref)
        self.assertIn("416", str(raised.exception))
        self.assertEqual(self.files_in_cache(), [])


class Resume(Folder):
    def test_a_download_that_stops_is_kept_and_the_next_run_goes_on_from_there(self) -> None:
        body = blob(4000)
        ref = reference(self.server.serve("/blob.bin", body, cut_after=1500), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        with mock.patch.object(fetch, "CHUNK", 512), self.assertRaises(GraderError) as stopped:
            self.fetch(ref)
        self.assertNotIsInstance(stopped.exception, fetch.FetchMismatch, "a download that stops is not a download that is wrong")
        self.assertIn("stopped after 1.5 KB of 4.0 KB", str(stopped.exception))
        self.assertIn("run the command again", str(stopped.exception))
        self.assertEqual(partial.read_bytes(), body[:1500], "what arrived is kept")
        self.assertFalse((self.cache / ref.path).exists())

        self.server.serve("/blob.bin", body)  # the server is well again
        done = self.fetch(ref)
        self.assertEqual((done.status, done.received), ("resumed", 2500))
        self.assertEqual((self.cache / ref.path).read_bytes(), body)
        self.assertFalse(partial.exists())
        self.assertEqual([request.headers.get("range") for request in self.server.requests_for("/blob.bin")], [None, "bytes=1500-"])
        self.assertTrue(any("resuming tr0/blob.bin from 1.5 KB of 4.0 KB" in line for line in self.log))

    def test_a_download_that_stops_again_goes_on_from_where_it_got_to(self) -> None:
        body = blob(6000)
        ref = reference(self.server.serve("/blob.bin", body, cut_after=2000), body)
        for expected in (2000, 4000):
            with mock.patch.object(fetch, "CHUNK", 512), self.assertRaises(GraderError):
                self.fetch(ref)
            self.assertEqual(fetch.partial_path(self.cache / ref.path, ref).stat().st_size, expected)
        self.server.serve("/blob.bin", body)
        self.assertEqual(self.fetch(ref).received, 2000)
        self.assertEqual((self.cache / ref.path).read_bytes(), body)

    def test_a_server_that_sends_less_than_it_announced_is_a_download_that_stopped(self) -> None:
        body = blob(3000)
        ref = reference(self.server.serve("/blob.bin", body, cut_after=1000, announce=3000), body)
        with self.assertRaises(GraderError) as stopped:
            self.fetch(ref)
        self.assertIn("stopped after 1.0 KB of 3.0 KB", str(stopped.exception))
        self.assertEqual(fetch.partial_path(self.cache / ref.path, ref).stat().st_size, 1000)

    def test_a_server_that_ignores_the_range_makes_the_download_start_again(self) -> None:
        body = blob(3000)
        ref = reference(self.server.serve("/blob.bin", body, ranges=False), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:1000])
        done = self.fetch(ref)
        self.assertEqual((done.status, done.received), ("fetched", 3000))
        self.assertEqual((self.cache / ref.path).read_bytes(), body)
        self.assertEqual(self.server.requests_for("/blob.bin")[0].headers["range"], "bytes=1000-")
        self.assertTrue(any("starts again" in line or "start again" in line for line in self.log), self.log)

    def test_a_partial_file_that_is_all_of_it_needs_no_request_only_its_hash(self) -> None:
        body = blob(2000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body)
        done = self.fetch(ref)
        self.assertEqual((done.status, done.received), ("resumed", 0))
        self.assertEqual((self.cache / ref.path).read_bytes(), body)
        self.assertEqual(self.server.seen, [])

    def test_a_partial_file_that_is_longer_than_the_file_is_dropped_and_the_download_starts_over(self) -> None:
        body = blob(1000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(blob(5000))
        done = self.fetch(ref)
        self.assertEqual((done.status, done.received), ("fetched", 1000))
        self.assertIsNone(self.server.requests_for("/blob.bin")[0].headers.get("range"))

    def test_a_partial_file_is_not_taken_for_the_file_of_another_pin(self) -> None:
        """The partial file is named for the first digits of the hash it must reach, so a path that was pinned again does not pick up what the old pin left."""
        old, new = blob(1000, seed=1), blob(1000, seed=2)
        before = reference("https://example.invalid/a", old, path="tr0/a.bin")
        after = reference("https://example.invalid/a", new, path="tr0/a.bin")
        self.assertNotEqual(fetch.partial_path(self.cache / before.path, before), fetch.partial_path(self.cache / after.path, after))

    def test_the_partial_file_is_hidden_beside_the_file_and_no_manifest_path_can_be_it(self) -> None:
        ref = reference("https://example.invalid/x", b"x", path="tr0/qwen3-0.6b/model.safetensors")
        partial = fetch.partial_path(self.cache / ref.path, ref)
        self.assertEqual(partial.parent, self.cache / "tr0" / "qwen3-0.6b")
        self.assertRegex(partial.name, r"^\.model\.safetensors\.[0-9a-f]{16}\.part$")
        self.assertNotEqual(fetch.manifest_problems(manifest_of(entry("https://example.invalid/x", b"x", path=partial.name))), [], "a path may not start with a dot")


class Network(Folder):
    def test_a_redirect_is_followed_and_the_resume_goes_with_it(self) -> None:
        body = blob(3000)
        self.server.serve("/final", body)
        url = self.server.serve("/start", redirect=self.server.base + "/final")
        ref = reference(url, body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:1200])
        done = self.fetch(ref)
        self.assertEqual((done.status, done.received), ("resumed", 1800))
        self.assertEqual((self.cache / ref.path).read_bytes(), body)
        for request in (*self.server.requests_for("/start"), *self.server.requests_for("/final")):
            self.assertEqual(request.headers["user-agent"], f"enginespace-grader/{__version__}")
            self.assertEqual(request.headers["range"], "bytes=1200-")

    def test_a_redirect_is_refused_when_it_leaves_https_or_leaves_http_altogether(self) -> None:
        handler = fetch._Redirects()
        secure = urllib.request.Request("https://example.invalid/a")
        for target, why in (("http://example.invalid/b", "over https"), ("http://127.0.0.1:1/b", "it leaves https"), ("ftp://example.invalid/b", "over https"), ("file:///etc/passwd", "over https")):
            with self.subTest(target=target), self.assertRaises(urllib.error.HTTPError) as raised:
                handler.redirect_request(secure, None, 302, "Found", {}, target)
            raised.exception.close()  # an HTTPError is a response, and an open one is a resource warning at exit
            self.assertIn(why, str(raised.exception.reason))
        again = handler.redirect_request(secure, None, 302, "Found", {}, "https://other.invalid/b")
        self.assertEqual(again.full_url, "https://other.invalid/b")
        local = urllib.request.Request("http://127.0.0.1:1/a", headers={"Range": "bytes=5-"})
        for target in ("http://127.0.0.1:2/b", "https://other.invalid/b"):
            kept = handler.redirect_request(local, None, 302, "Found", {}, target)
            self.assertEqual(kept.get_header("Range"), "bytes=5-", "the headers go with the redirect")
        with self.assertRaises(urllib.error.HTTPError) as refused:
            handler.redirect_request(local, None, 302, "Found", {}, "http://example.invalid/b")
        refused.exception.close()

    def test_a_redirect_to_plain_http_is_a_message_when_it_happens(self) -> None:
        url = self.server.serve("/start", redirect="http://example.invalid/elsewhere")
        ref = reference(url, b"x")
        # The server is on loopback, which may redirect anywhere that url_problem allows, and not to a plain http host.
        with self.assertRaises(GraderError) as raised:
            self.fetch(ref)
        self.assertIn("refuses", str(raised.exception))
        self.assertEqual(self.files_in_cache(), [])

    def test_an_error_status_is_a_message_with_the_status_and_keeps_a_partial_file(self) -> None:
        body = blob(2000)
        ref = reference(self.server.base + "/missing.bin", body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:500])
        with self.assertRaises(GraderError) as raised:
            self.fetch(ref)
        self.assertNotIsInstance(raised.exception, fetch.FetchMismatch)
        self.assertIn("404", str(raised.exception))
        self.assertIn("the manifest is out of date", str(raised.exception))
        self.assertEqual(partial.read_bytes(), body[:500], "a server that is down for a moment does not cost the learner what already arrived")

    def test_each_kind_of_status_says_what_to_do(self) -> None:
        for status, expected in ((404, "out of date"), (410, "out of date"), (401, "login"), (403, "login"), (429, "run the command again later"), (503, "run the command again later"), (400, "Check the URL")):
            with self.subTest(status=status):
                self.assertIn(expected, fetch._what_to_do(status))

    def test_a_status_the_grader_cannot_read_is_a_message(self) -> None:
        ref = reference(self.server.serve("/blob.bin", b"x", status=204), b"x")
        with self.assertRaises(GraderError) as raised:
            self.fetch(ref)
        self.assertIn("204", str(raised.exception))

    def test_a_server_that_is_not_there_is_a_message_that_says_to_run_it_again(self) -> None:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = probe.getsockname()[1]
        ref = reference(f"http://127.0.0.1:{port}/blob.bin", b"x")
        with self.assertRaises(GraderError) as raised:
            self.fetch(ref)
        self.assertIn("could not reach", str(raised.exception))
        self.assertIn("run the command again", str(raised.exception))
        self.assertEqual(self.files_in_cache(), [])

    def test_proxies_of_the_environment_are_not_used_for_loopback(self) -> None:
        body = blob(1000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        dead = "http://127.0.0.1:9"
        with mock.patch.dict(os.environ, {"http_proxy": dead, "HTTP_PROXY": dead, "https_proxy": dead, "HTTPS_PROXY": dead, "all_proxy": dead, "ALL_PROXY": dead, "no_proxy": "", "NO_PROXY": ""}):
            self.assertEqual(self.fetch(ref).status, "fetched")

    def test_a_url_that_is_not_https_is_refused_before_anything_is_sent(self) -> None:
        with mock.patch.object(fetch, "open_url", side_effect=AssertionError("a request was made")):
            for url in ("http://example.invalid/x", "ftp://example.invalid/x", "file:///etc/passwd", "https:///x", "https://user:pw@example.invalid/x", "https://user@example.invalid/x"):
                with self.subTest(url=url), self.assertRaises(GraderError) as raised:
                    self.fetch(reference(url, b"x"))
                self.assertIn("will not download", str(raised.exception))
        self.assertEqual(self.files_in_cache(), [])

    def test_the_urls_that_are_allowed(self) -> None:
        for url in ("https://example.invalid/x", "https://huggingface.co/Qwen/Qwen3-0.6B/resolve/abc/model.safetensors?download=true", "http://127.0.0.1:8080/x", "http://localhost/x", "http://[::1]:9/x"):
            self.assertIsNone(fetch.url_problem(url), url)
        for url in ("http://example.invalid/x", "http://127.0.0.1.example.invalid/x", "http://127.0.0.1@example.invalid/x", "http://[::2]/x", "ftp://example.invalid/x", "file:///x", "https:///x", "https://u@h.invalid/x", "https://u:p@h.invalid/x", "http://[::1/x", ""):
            self.assertIsNotNone(fetch.url_problem(url), url)


class Privacy(Folder):
    """Acceptance 2 of W2-T05: the User-Agent is `enginespace-grader/<version>`, and nothing in a request names a person."""

    def test_the_user_agent_is_the_graders_name_and_version(self) -> None:
        body = blob(1000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        self.fetch(ref)
        (request,) = self.server.requests_for("/blob.bin")
        agent = request.headers["user-agent"]
        self.assertEqual(agent, f"{GRADER_NAME}/{__version__}")
        self.assertEqual(agent, fetch.user_agent())
        self.assertRegex(agent, r"^enginespace-grader/[0-9A-Za-z.+_-]+$")
        self.assertEqual([name.lower() for name in request.names].count("user-agent"), 1, "one User-Agent, and not urllib's own beside it")

    def test_the_user_agent_is_the_graders_whatever_the_version_looks_like(self) -> None:
        with mock.patch.object(fetch, "__version__", "0+unknown"):
            self.assertEqual(fetch.user_agent(), "enginespace-grader/0+unknown")

    def test_a_request_carries_the_headers_http_needs_and_no_other(self) -> None:
        body = blob(1000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:100])
        with mock.patch.dict(os.environ, {"HF_TOKEN": "hf_not_a_real_token_just_a_test", "HUGGING_FACE_HUB_TOKEN": "hf_not_a_real_token_just_a_test", "USER": "someone", "HOSTNAME": "somewhere"}):
            self.fetch(ref)
        (request,) = self.server.requests_for("/blob.bin")
        self.assertLessEqual({name.lower() for name in request.names}, {"host", "user-agent", "accept-encoding", "range", "connection"})
        self.assertNotIn("authorization", request.headers)
        self.assertNotIn("cookie", request.headers)
        self.assertNotIn("referer", request.headers)
        everything = json.dumps([request.path, request.headers])
        for secret in ("hf_not_a_real_token_just_a_test", "someone", "somewhere"):
            self.assertNotIn(secret, everything)
        self.assertEqual(request.headers["accept-encoding"], "identity")

    def test_the_user_agent_goes_with_a_redirect(self) -> None:
        body = blob(500)
        self.server.serve("/final", body)
        url = self.server.serve("/start", redirect="/final")
        self.fetch(reference(url, body))
        self.assertEqual({request.headers["user-agent"] for request in self.server.seen}, {f"enginespace-grader/{__version__}"})
        self.assertEqual(len(self.server.seen), 2)


class Safety(Folder):
    def test_a_path_that_leaves_the_cache_is_refused_and_nothing_is_written(self) -> None:
        body = blob(100)
        url = self.server.serve("/blob.bin", body)
        for path in ("../evil.bin", "tr0/../../evil.bin", "/abs/evil.bin", "tr0//evil.bin", "tr0\\evil.bin", "C:/evil.bin", "./evil.bin", "tr0/", ""):
            with self.subTest(path=path), self.assertRaises(GraderError) as raised:
                self.fetch(reference(url, body, path=path))
            self.assertIn("would leave the cache folder", str(raised.exception))
        self.assertEqual(self.server.seen, [])
        self.assertFalse((self.folder / "evil.bin").exists())
        self.assertEqual(sorted(path.name for path in self.folder.iterdir() if path.is_file()), [])

    def test_no_room_on_the_disk_is_a_message_before_the_download_and_not_a_full_disk_after_it(self) -> None:
        body = blob(5000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        with mock.patch.object(fetch.shutil, "disk_usage", return_value=mock.Mock(free=1234)), self.assertRaises(GraderError) as raised:
            self.fetch(ref)
        self.assertIn("needs 5.0 KB more room", str(raised.exception))
        self.assertIn("1.2 KB free", str(raised.exception))
        self.assertIn("--cache", str(raised.exception))
        self.assertEqual(self.server.seen, [])

    def test_the_room_a_resume_needs_is_what_is_left_to_download(self) -> None:
        body = blob(5000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        partial = fetch.partial_path(self.cache / ref.path, ref)
        partial.parent.mkdir(parents=True)
        partial.write_bytes(body[:4000])
        with mock.patch.object(fetch.shutil, "disk_usage", return_value=mock.Mock(free=1000)):
            self.assertEqual(self.fetch(ref).received, 1000)

    def test_a_folder_of_the_cache_may_be_a_link_to_another_disk(self) -> None:
        """The check is of the path's words, not of where the file system leads, and the partial file is beside its destination, so a rename never crosses a disk."""
        elsewhere = self.folder / "elsewhere"
        elsewhere.mkdir()
        self.cache.mkdir()
        try:
            os.symlink(elsewhere, self.cache / "tr0", target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("this system does not let the tests make a symbolic link")
        body = blob(1000)
        ref = reference(self.server.serve("/blob.bin", body), body)
        self.fetch(ref)
        self.assertEqual((elsewhere / "blob.bin").read_bytes(), body)

    def test_a_cache_that_cannot_be_used_is_a_message(self) -> None:
        blocker = self.folder / "file"
        blocker.write_text("not a folder", encoding="utf-8")
        body = blob(10)
        with self.assertRaises(GraderError) as raised:
            fetch.fetch_reference(reference(self.server.serve("/blob.bin", body), body), blocker, say=self.log.append)
        self.assertIn("--cache", str(raised.exception))


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# The command
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


class Command(Folder):
    def lab_manifest(self) -> tuple[Path, dict[str, bytes]]:
        one, two, other = blob(3000, 1), blob(1200, 2), blob(800, 3)
        path = self.write_manifest(
            entry(self.server.serve("/one.bin", one), one, "tr0/qwen/one.bin", name="One", licence="Apache-2.0"),
            entry(self.server.serve("/two.bin", two), two, "tr0/qwen/two.json", name="Two", kind="prompts"),
            entry(self.server.serve("/other.bin", other), other, "tr8/other.bin", name="Other", labs=["tr8.replay"]),
        )
        return path, {"one": one, "two": two, "other": other}

    def test_the_command_is_in_the_table_and_loads_only_when_it_runs(self) -> None:
        self.assertIn("fetch", cli.COMMANDS)
        status, out, _ = run("--help")
        self.assertEqual(status, 0)
        self.assertIn("fetch", out)
        code = "import sys; import enginespace_grader.cli; print('enginespace_grader.fetch' in sys.modules)"
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
        self.assertEqual(done.stdout.strip(), "False")

    def test_help_says_what_the_command_does_and_how_it_ends(self) -> None:
        with contextlib.redirect_stdout(io.StringIO()) as out, self.assertRaises(SystemExit) as caught:
            fetch.main(["--help"])
        self.assertEqual(caught.exception.code, 0)
        text = re.sub(r"\s+", " ", out.getvalue())
        for needle in ("<lab>", "--manifest", "--cache", "ENGINESPACE_CACHE", "SHA-256", "resumes where it stopped", "Exit status"):
            self.assertIn(needle, text)

    def test_the_files_of_a_lab_are_fetched_and_a_second_run_finds_them_there(self) -> None:
        manifest, bodies = self.lab_manifest()
        status, out, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual(status, 0, err)
        self.assertEqual(self.files_in_cache(), ["tr0/qwen/one.bin", "tr0/qwen/two.json"], "the lab's two files, and not the other lab's")
        self.assertEqual((self.cache / "tr0/qwen/one.bin").read_bytes(), bodies["one"])
        lines = out.splitlines()
        self.assertEqual(lines[0], "  fetched  tr0/qwen/one.bin  3.0 KB  Apache-2.0")
        self.assertEqual(lines[1], "  fetched  tr0/qwen/two.json  1.2 KB  synthetic")
        self.assertIn("tr0.forward: 2 files in the cache, each hashed to the SHA-256 that the manifest pins (2 downloaded, 4.2 KB received)", lines[2])
        self.assertIn("tr0.forward: 2 files, into ", err)
        self.assertEqual(len(self.server.requests_for("/other.bin")), 0)

        status, out, _ = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual(status, 0)
        self.assertEqual(out.count("(already in the cache)"), 2)
        self.assertIn("(0 downloaded, 0 B received)", out)
        self.assertEqual(len(self.server.requests_for("/one.bin")), 1)

    def test_a_download_that_stopped_is_resumed_by_the_command(self) -> None:
        body = blob(4000)
        manifest = self.write_manifest(entry(self.server.serve("/one.bin", body, cut_after=1000), body))
        with mock.patch.object(fetch, "CHUNK", 256):
            status, out, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual((status, out), (3, ""))
        self.assertIn("enginespace: the download of tr0/blob.bin stopped after 1.0 KB of 4.0 KB", err)
        self.server.serve("/one.bin", body)
        status, out, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual(status, 0, err)
        self.assertIn("  resumed  tr0/blob.bin  4.0 KB  synthetic", out)
        self.assertIn("(1 downloaded, 3.0 KB received)", out)

    def test_a_hash_mismatch_is_status_1_and_nothing_is_kept(self) -> None:
        pinned = blob(2000)
        manifest = self.write_manifest(entry(self.server.serve("/one.bin", blob(2000, seed=7)), pinned))
        status, out, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual(status, 1)
        self.assertNotIn("fetched", out)
        self.assertIn(f"enginespace: the SHA-256 of tr0/blob.bin is {sha256_hex(blob(2000, seed=7))}, and the manifest pins {sha256_hex(pinned)}", err)
        self.assertIn("was deleted and nothing was kept", err)
        self.assertEqual(self.files_in_cache(), [])

    def test_it_stops_at_the_first_file_that_fails_and_keeps_those_before_it(self) -> None:
        good, bad = blob(1000, 1), blob(1000, 2)
        manifest = self.write_manifest(
            entry(self.server.serve("/good.bin", good), good, "tr0/good.bin", name="Good"),
            entry(self.server.serve("/bad.bin", blob(1000, 9)), bad, "tr0/bad.bin", name="Bad"),
            entry(self.server.serve("/after.bin", good), good, "tr0/after.bin", name="After"),
        )
        status, out, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual(status, 1)
        self.assertEqual(self.files_in_cache(), ["tr0/good.bin"])
        self.assertIn("  fetched  tr0/good.bin", out)
        self.assertEqual(self.server.requests_for("/after.bin"), [], "the command stopped; it did not go on to the next file")

    def test_a_lab_the_manifest_does_not_list_is_status_3_and_names_those_it_does(self) -> None:
        manifest, _ = self.lab_manifest()
        for lab in ("tr0.forwad", "tr9.nothing", "../x"):
            with self.subTest(lab=lab):
                status, out, err = run("fetch", lab, "--manifest", str(manifest), "--cache", str(self.cache))
                self.assertEqual((status, out), (3, ""))
                self.assertIn(f"lists no file for {lab!r}", err)
                self.assertIn("It lists files for: tr0.forward, tr8.replay", err)
        self.assertEqual(self.server.seen, [])

    def test_an_empty_manifest_says_that_a_labs_files_join_it_when_the_lab_is_built(self) -> None:
        manifest = self.write_manifest()
        status, _, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual(status, 3)
        self.assertIn("lists no file at all yet", err)

    def test_a_stage_is_answered_with_its_lab(self) -> None:
        manifest, _ = self.lab_manifest()
        status, _, err = run("fetch", "tr0.forward.s2", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual(status, 3)
        self.assertIn("is a stage, and fetch takes a lab: run `enginespace fetch tr0.forward`", err)

    def test_the_manifest_is_checked_whole_before_anything_is_downloaded(self) -> None:
        body = blob(500)
        manifest = self.write_manifest(
            entry(self.server.serve("/ok.bin", body), body, "tr0/ok.bin", name="Fine"),
            entry(self.server.serve("/evil.bin", body), body, "../evil.bin", name="Evil"),
        )
        status, out, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(self.cache))
        self.assertEqual((status, out), (3, ""))
        self.assertIn("/entries/1/path", err)
        self.assertEqual(self.server.seen, [], "the good entry was not fetched either")

    def test_a_path_under_the_home_folder_is_printed_from_the_tilde_and_never_with_the_user_name(self) -> None:
        home = self.folder / "home" / "learner"
        home.mkdir(parents=True)
        with mock.patch.dict(os.environ, {"HOME": str(home), "USERPROFILE": str(home)}):
            self.assertEqual(fetch.shown(home / ".cache" / "enginespace" / "references"), "~/.cache/enginespace/references")
            self.assertEqual(fetch.shown(home), "~")
            self.assertEqual(fetch.shown(self.folder / "elsewhere"), str(self.folder / "elsewhere"))
            manifest, _ = self.lab_manifest()
            status, _, err = run("fetch", "tr0.forward", "--manifest", str(manifest), "--cache", str(home / ".cache" / "enginespace" / "references"))
            self.assertEqual(status, 0, err)
            self.assertIn("tr0.forward: 2 files, into ~/.cache/enginespace/references", err)
            status, _, err = run("fetch", "tr9.nothing", "--manifest", str(home / "nope.json"), "--cache", str(self.cache))
            self.assertEqual(status, 3)
            self.assertIn("there is no manifest at ~/nope.json", err)
            self.assertNotIn(str(home), err)

    def test_a_home_folder_that_is_a_link_is_printed_from_the_tilde_in_either_spelling(self) -> None:
        real = self.folder / "disk" / "learner"
        real.mkdir(parents=True)
        link = self.folder / "home"
        link.symlink_to(real, target_is_directory=True)
        with mock.patch.dict(os.environ, {"HOME": str(link), "USERPROFILE": str(link)}):
            self.assertEqual(fetch.shown(link / ".cache" / "enginespace" / "references"), "~/.cache/enginespace/references")
            self.assertEqual(fetch.shown(real / ".cache" / "enginespace" / "references"), "~/.cache/enginespace/references")
            self.assertEqual(fetch.shown(real), "~")
            self.assertEqual(fetch.shown(self.folder / "elsewhere"), str(self.folder / "elsewhere"))
            self.assertNotIn(str(real), fetch.shown(real / "notes.json"))

    def test_a_manifest_that_is_not_there_is_status_3(self) -> None:
        status, out, err = run("fetch", "tr0.forward", "--manifest", str(self.folder / "nope.json"), "--cache", str(self.cache))
        self.assertEqual((status, out), (3, ""))
        self.assertIn("there is no manifest at", err)

    def test_without_a_flag_the_manifest_is_found_from_the_folder_and_the_cache_comes_from_the_environment(self) -> None:
        body = blob(700)
        kit = self.folder / "kit"
        (kit / "references").mkdir(parents=True)
        (kit / "references" / "manifest.json").write_text(json.dumps(manifest_of(entry(self.server.serve("/one.bin", body), body))), encoding="utf-8")
        elsewhere = self.folder / "elsewhere"
        env = {key: value for key, value in os.environ.items() if not key.startswith("ENGINESPACE_")}
        env["ENGINESPACE_CACHE"] = str(elsewhere)
        with mock.patch.dict(os.environ, env, clear=True), contextlib.chdir(kit):
            status, out, err = run("fetch", "tr0.forward")
        self.assertEqual(status, 0, err)
        self.assertEqual((elsewhere / "tr0" / "blob.bin").read_bytes(), body)

    def test_usage_errors_are_status_2(self) -> None:
        for argv in (["fetch"], ["fetch", "tr0.forward", "--cache"], ["fetch", "tr0.forward", "--nope"], ["fetch", "a", "b"]):
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                cli.main(argv)
            self.assertEqual(caught.exception.code, 2, argv)

    def test_it_runs_as_the_installed_command_and_as_a_module(self) -> None:
        body = blob(900)
        manifest = self.write_manifest(entry(self.server.serve("/one.bin", body), body))
        env = {key: value for key, value in os.environ.items() if key not in ("PYTHONPATH",)}
        env["ENGINESPACE_CACHE"] = str(self.cache)
        done = subprocess.run(
            [sys.executable, "-m", "enginespace_grader", "fetch", "tr0.forward", "--manifest", str(manifest)],
            capture_output=True,
            text=True,
            check=False,
            cwd=self.folder,
            env=env,
        )
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("fetched  tr0/blob.bin", done.stdout)
        self.assertEqual(self.server.requests_for("/one.bin")[0].headers["user-agent"], f"enginespace-grader/{__version__}")


if __name__ == "__main__":
    unittest.main()
