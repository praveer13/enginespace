"""`enginespace receipt verify`: the browser's first three rules, run locally (ARCHITECTURE section 9.4). Acceptance 3 of W2-T02: a tampered artifact hash is rejected, and the message names the artifact."""

from __future__ import annotations

import contextlib
import gzip
import io
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from enginespace_grader import cli, verify

from . import samples


def run(*argv: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        status = cli.main(["receipt", "verify", *argv])
    return status, out.getvalue(), err.getvalue()


class Verifying(unittest.TestCase):
    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)
        self.honest = samples.graded(self.folder)

    def forged(self, name: str, change: Any) -> Path:
        with gzip.open(self.honest, "rb") as packed:
            document = json.loads(packed.read())
        change(document)
        return samples.write_gz(self.folder / name, document)

    def test_an_honest_bundle_is_verified_and_the_report_says_which_rules_ran(self) -> None:
        status, out, err = run(str(self.honest))
        self.assertEqual((status, err), (0, ""))
        for fragment in ("rule 1  caps", "rule 2  schema", "token", "rule 3  integrity", "tr3.profile.s2", "2 artifacts hashed", "1 stays with the learner", "receipt id", "verified: rules 1 to 3 pass"):
            self.assertIn(fragment, out)
        self.assertNotIn("FAIL", out)
        self.assertIn("a receipt is not signed", out, "the report does not claim more than three rules prove")

    def test_a_tampered_artifact_hash_is_rejected_and_the_message_names_the_artifact(self) -> None:
        def tamper(document: dict[str, Any]) -> None:
            document["receipt"]["artifacts"][1]["sha256"] = "0" * 64

        status, out, err = run(str(self.forged("tampered.es.json.gz", tamper)))
        self.assertEqual(status, 1)
        self.assertIn('rule 3  integrity FAIL  artifact "log"', out)
        self.assertIn("0" * 64, out)
        self.assertIn("NOT VERIFIED: 1 problem", out)
        self.assertNotIn("verified: rules 1 to 3 pass", out)

    def test_each_tampered_hash_names_its_own_artifact(self) -> None:
        for position, name in ((0, "trace"), (1, "log")):
            def tamper(document: dict[str, Any], position: int = position) -> None:
                document["receipt"]["artifacts"][position]["sha256"] = "a" * 64

            _, out, _ = run(str(self.forged(f"t{position}.es.json.gz", tamper)))
            self.assertIn(f'artifact "{name}"', out)
            other = "log" if name == "trace" else "trace"
            self.assertNotIn(f'artifact "{other}"', out)

    def test_changed_data_with_the_old_hash_is_rejected_by_name_too(self) -> None:
        def edit(document: dict[str, Any]) -> None:
            document["artifacts"]["log"]["data"] += "an extra line\n"

        status, out, _ = run(str(self.forged("edited.es.json.gz", edit)))
        self.assertEqual(status, 1)
        self.assertIn('artifact "log"', out)

    def test_a_forger_who_changes_the_data_and_its_hash_passes_these_three_rules_and_says_so(self) -> None:
        # Rules 1 to 3 cannot see this: the file is consistent. The site's recomputation (rules 7 to 9) is what catches an edited number (ARCHITECTURE section 8.6).
        from enginespace_grader.hashing import sha256_hex

        def resign(document: dict[str, Any]) -> None:
            document["artifacts"]["log"]["data"] += "an extra line\n"
            new = document["artifacts"]["log"]["data"].encode("utf-8")
            document["receipt"]["artifacts"][1].update(sha256=sha256_hex(new), bytes=len(new))

        status, out, _ = run(str(self.forged("resigned.es.json.gz", resign)))
        self.assertEqual(status, 0)
        self.assertIn("(rules 4 to 10)", out)

    def test_a_file_that_breaks_rule_1_or_2_stops_there_and_says_what_was_not_checked(self) -> None:
        bad = self.folder / "not-gzip.es.json.gz"
        bad.write_bytes(b"{}")
        status, out, _ = run(str(bad))
        self.assertEqual(status, 1)
        self.assertIn("rule 1  caps", out)
        self.assertIn("not a gzip file", out)
        self.assertIn("not checked", out)

        status, out, _ = run(str(samples.write_gz(self.folder / "empty.es.json.gz", {})))
        self.assertEqual(status, 1)
        self.assertIn("rule 2  schema", out)
        self.assertIn("FAIL", out)
        self.assertIn("rule 3  integrity", out)
        self.assertIn("not checked", out)

    def test_a_schema_failure_lists_the_places(self) -> None:
        def leak(document: dict[str, Any]) -> None:
            document["receipt"]["environment"]["host"]["hostname"] = "example-host"

        status, out, _ = run(str(self.forged("leak.es.json.gz", leak)))
        self.assertEqual(status, 1)
        self.assertIn("/receipt/environment/host", out)
        self.assertIn("hostname", out)

    def test_a_bad_token_is_a_schema_failure_with_the_checksum_named(self) -> None:
        def mistype(document: dict[str, Any]) -> None:
            token = document["receipt"]["challenge"]["token"]
            document["receipt"]["challenge"]["token"] = token[:-1] + ("0" if token[-1] != "0" else "1")

        status, out, _ = run(str(self.forged("typo.es.json.gz", mistype)))
        self.assertEqual(status, 1)
        self.assertIn("checksum", out)

    def test_the_clocks_are_noted_and_not_failed(self) -> None:
        def late(document: dict[str, Any]) -> None:
            document["receipt"]["createdAt"] = "2026-12-25T00:00:00Z"

        status, out, _ = run(str(self.forged("late.es.json.gz", late)))
        self.assertEqual(status, 0)
        self.assertIn("note", out)
        self.assertIn("expired", out)

        def early(document: dict[str, Any]) -> None:
            document["receipt"]["createdAt"] = "2026-11-01T00:00:00Z"

        status, out, _ = run(str(self.forged("early.es.json.gz", early)))
        self.assertEqual(status, 0)
        self.assertIn("before the token was issued", out)

    def test_the_status_is_2_for_a_file_that_cannot_be_read(self) -> None:
        status, out, err = run(str(self.folder / "missing.es.json.gz"))
        self.assertEqual(status, 2)
        self.assertIn("missing.es.json.gz", err)
        status, _, _ = run(str(self.honest), str(self.folder / "missing.es.json.gz"))
        self.assertEqual(status, 2)

    def test_several_files_are_reported_one_after_another_and_one_failure_fails_the_run(self) -> None:
        def tamper(document: dict[str, Any]) -> None:
            document["receipt"]["artifacts"][0]["sha256"] = "1" * 64

        bad = self.forged("bad.es.json.gz", tamper)
        status, out, _ = run(str(self.honest), str(bad))
        self.assertEqual(status, 1)
        self.assertEqual(out.count("verified: rules 1 to 3 pass"), 1)
        self.assertEqual(out.count("NOT VERIFIED"), 1)

    def test_json_output_has_the_findings_and_the_facts(self) -> None:
        status, out, _ = run("--json", str(self.honest))
        self.assertEqual(status, 0)
        (report,) = json.loads(out)
        self.assertTrue(report["verified"])
        self.assertEqual([finding["rule"] for finding in report["findings"]], ["caps", "schema", "token", "integrity"])
        self.assertEqual(report["facts"]["stage"], "tr3.profile.s2")
        self.assertEqual(report["facts"]["artifacts"], {"inBundle": 2, "kept": 1})
        self.assertRegex(report["facts"]["receiptSha256"], r"^[0-9a-f]{64}$")

    def test_verification_is_the_same_whichever_way_it_is_asked(self) -> None:
        direct = verify.verify_file(self.honest)
        self.assertTrue(direct.ok)
        self.assertEqual(direct.facts["lab"], "tr3.profile")
        self.assertEqual(verify.render(direct), run(str(self.honest))[1])


if __name__ == "__main__":
    unittest.main()
