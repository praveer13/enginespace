"""The committed synthetic bundle is what the grader writes now (see fixture.py)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from enginespace_grader import verify
from enginespace_grader.receipt import receipt_problems, receipt_sha256

from . import fixture

HOW = "regenerate it with `uv run --project labs/grader python -m labs.grader.tests.fixture` if the change is meant"


class Fixture(unittest.TestCase):
    def test_the_committed_bundle_is_the_one_the_grader_writes_now(self) -> None:
        document, _ = fixture.read_committed()
        self.assertEqual(document, fixture.build(), f"tests/fixtures/grader/sample.es.json.gz is not what the grader writes now: {HOW}")

    def test_the_committed_expectations_are_the_ones_it_has_now(self) -> None:
        document, sidecar = fixture.read_committed()
        self.assertEqual(sidecar, fixture.expected(document), f"tests/fixtures/grader/sample.expected.json is stale: {HOW}")
        self.assertEqual(sidecar["receiptSha256"], receipt_sha256(document["receipt"]))

    def test_a_fresh_file_is_the_same_bundle_in_a_folder_of_its_own(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            bundle_path, sidecar_path = fixture.write(Path(scratch))
            self.assertTrue(verify.verify_file(bundle_path).ok)
            self.assertEqual(sidecar_path.read_text(encoding="utf-8"), (fixture.fixture_dir() / "sample.expected.json").read_text(encoding="utf-8"))

    def test_the_committed_file_passes_rules_1_to_3_here(self) -> None:
        result = verify.verify_file(fixture.fixture_dir() / "sample.es.json.gz")
        self.assertTrue(result.ok, [failure.message for failure in result.failures()])
        document, _ = fixture.read_committed()
        self.assertEqual(receipt_problems(document["receipt"]), [])

    def test_it_is_labelled_synthetic_and_names_no_published_build(self) -> None:
        document, _ = fixture.read_committed()
        receipt = document["receipt"]
        self.assertIn("Synthetic", receipt["notes"])
        self.assertEqual(receipt["grader"], fixture.IDENTITY.as_object())
        self.assertEqual(receipt["grader"]["version"], "0.0.0")


if __name__ == "__main__":
    unittest.main()
