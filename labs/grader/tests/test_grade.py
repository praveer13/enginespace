"""`enginespace grade`: the flow from a token to a bundle (ARCHITECTURE section 9.4, ASSESSMENT section 5.2)."""

from __future__ import annotations

import datetime as dt
import gzip
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest import mock

from enginespace_grader import bundle as bundles
from enginespace_grader import grade
from enginespace_grader.challenge import format_challenge
from enginespace_grader.errors import GraderError
from enginespace_grader.rng import rng_for

from . import samples
from .samples import NOW, PROVENANCE, SampleLab, sample_environment, sample_pins


class Grading(unittest.TestCase):
    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.folder = Path(holder.name)
        self.messages: list[str] = []

    def stage(self, lab: SampleLab | None = None, stage: str = "tr3.profile.s2", token: str | None = None, now: dt.datetime = NOW, **more: Any) -> grade.GradeOutcome:
        arguments: dict[str, Any] = {"out_dir": self.folder, "environment": sample_environment(), "pins": sample_pins(), "provenance": PROVENANCE, "now": lambda: now, "log": self.messages.append}
        arguments.update(more)
        return grade.run_stage(lab or SampleLab(), stage, token if token is not None else format_challenge(stage, 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104"), **arguments)

    def test_a_stage_is_graded_and_its_bundle_written_where_the_architecture_says(self) -> None:
        outcome = self.stage()
        self.assertEqual(outcome.path, self.folder / "tr3.profile-s2-20261105T123000Z.es.json.gz")
        self.assertTrue(outcome.passed)
        read = bundles.read_bundle(outcome.path)
        self.assertEqual(bundles.bundle_problems(read.document), [])
        self.assertEqual(bundles.integrity_problems(read.document), [])
        self.assertEqual(read.document["receipt"], outcome.receipt)

    def test_the_receipt_records_the_challenge_the_grader_and_the_provenance(self) -> None:
        receipt = self.stage().receipt
        self.assertEqual(receipt["challenge"], {"token": samples.TOKEN, "seed": 0x0BADC0DE, "nonce": "ABCDEFGHJKLMNPQR", "issuedOn": "20261104"})
        self.assertEqual((receipt["lab"], receipt["stage"], receipt["createdAt"]), ("tr3.profile", "tr3.profile.s2", "2026-11-05T12:30:00Z"))
        self.assertEqual(receipt["grader"]["name"], "enginespace-grader")
        self.assertRegex(receipt["grader"]["sourceSha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(receipt["provenance"], PROVENANCE)
        self.assertEqual(receipt["environment"], sample_environment())
        self.assertEqual(receipt["pins"], sample_pins())
        self.assertIn("Synthetic", receipt["notes"])

    def test_the_stage_gets_the_streams_that_the_token_derives(self) -> None:
        lab = SampleLab()
        self.stage(lab)
        ((stage, seed, drawn),) = lab.seen
        self.assertEqual((stage, seed), ("tr3.profile.s2", 0x0BADC0DE))
        expected = rng_for(0x0BADC0DE, "workload/prompt")
        self.assertEqual(drawn, [expected() for _ in range(3)])

    def test_the_same_token_and_clock_give_the_same_bytes(self) -> None:
        first = self.stage().path.read_bytes()
        other = Path(tempfile.mkdtemp(prefix="enginespace-test-"))
        self.addCleanup(lambda: [path.unlink() for path in other.iterdir()] and other.rmdir())
        second = self.stage(out_dir=other).path.read_bytes()
        self.assertEqual(first, second)

    def test_a_name_that_is_taken_gets_a_number(self) -> None:
        first = self.stage().path
        second = self.stage().path
        third = self.stage().path
        self.assertEqual([path.name for path in (first, second, third)], ["tr3.profile-s2-20261105T123000Z.es.json.gz", "tr3.profile-s2-20261105T123000Z-2.es.json.gz", "tr3.profile-s2-20261105T123000Z-3.es.json.gz"])

    def test_a_failed_check_still_writes_the_receipt_so_the_site_can_show_why(self) -> None:
        outcome = self.stage(SampleLab(fail=True))
        self.assertFalse(outcome.passed)
        self.assertEqual([check["id"] for check in outcome.failed_checks], ["agreement"])
        self.assertTrue(outcome.path.exists())

    def test_a_stage_must_report_every_check_it_declares(self) -> None:
        with self.assertRaises(GraderError) as caught:
            self.stage(SampleLab(forget="runner"))
        self.assertIn("did not report the check runner", str(caught.exception))
        self.assertIn("a fault in the lab", str(caught.exception))
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_a_token_that_is_not_a_token_is_refused_with_what_to_do(self) -> None:
        for token in ("", "hello", samples.TOKEN[:-1], samples.TOKEN + "x"):
            with self.assertRaises(GraderError) as caught:
                self.stage(token=token)
            self.assertIn("not a challenge token", str(caught.exception))
            self.assertIn("Copy it again", str(caught.exception))

    def test_a_token_pasted_with_a_newline_is_trimmed_by_the_caller_of_the_codec(self) -> None:
        self.assertTrue(self.stage(token=samples.TOKEN + "\n").path.exists())

    def test_a_token_for_another_stage_is_refused_by_name(self) -> None:
        other = format_challenge("tr3.profile.s3", 1, "ABCDEFGHJKLMNPQR", "20261104")
        with self.assertRaises(GraderError) as caught:
            self.stage(token=other)
        message = str(caught.exception)
        self.assertIn("the token is for stage tr3.profile.s3", message)
        self.assertIn("you asked to grade tr3.profile.s2", message)

    def test_a_stage_the_lab_does_not_have_is_refused_with_the_stages_it_has(self) -> None:
        with self.assertRaises(GraderError) as caught:
            self.stage(stage="tr3.profile.s9")
        self.assertIn("tr3.profile.s2, tr3.profile.s3", str(caught.exception))

    def test_a_token_of_another_lab_is_refused(self) -> None:
        with self.assertRaises(GraderError) as caught:
            self.stage(stage="tr8.replay.s1")
        self.assertIn("a stage of tr8.replay", str(caught.exception))

    def test_an_expired_token_warns_and_still_grades(self) -> None:
        later = NOW + dt.timedelta(days=11)  # 12 days after the issue date
        self.stage(now=later)
        self.assertFalse(any("warning" in message for message in self.messages))
        self.messages.clear()
        much_later = NOW + dt.timedelta(days=40)
        outcome = self.stage(now=much_later)
        warning = [message for message in self.messages if message.startswith("warning")]
        self.assertEqual(len(warning), 1)
        self.assertIn("41 days ago", warning[0])
        self.assertIn("14 days [estimated]", warning[0])
        self.assertTrue(outcome.path.exists(), "the browser decides about expiry, and the grader does not stop a run for it")

    def test_a_token_from_the_future_warns_about_the_clock(self) -> None:
        self.stage(now=dt.datetime(2026, 11, 1, tzinfo=dt.timezone.utc))
        self.assertTrue(any("in the future" in message for message in self.messages))

    def test_a_stage_that_makes_an_unhashable_artifact_is_a_message_naming_it(self) -> None:
        class Bad(SampleLab):
            def run(self, context: Any) -> Any:
                result = super().run(context)
                result.artifacts.append(bundles.Artifact.from_json("big", "outputs", "json", {"n": 2**60}))
                return result

        with self.assertRaises(GraderError) as caught:
            self.stage(Bad())
        self.assertIn("'big'", str(caught.exception))

    def test_a_receipt_the_site_would_refuse_is_not_written(self) -> None:
        with self.assertRaises(GraderError) as caught:
            self.stage(pins={"lockSha256": "x", "envLockSha256": "y", "onPin": True, "offPin": []})
        self.assertIn("/pins/lockSha256", str(caught.exception))
        self.assertEqual(list(self.folder.iterdir()), [])
        with self.assertRaises(GraderError):
            self.stage(environment={**sample_environment(), "hostname": "example-host"})
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_the_scratch_folder_is_gone_afterwards(self) -> None:
        seen: list[Path] = []

        class Spy(SampleLab):
            def run(self, context: Any) -> Any:
                seen.append(context.workdir)
                self.assertion = context.workdir.is_dir()
                return super().run(context)

        lab = Spy()
        self.stage(lab)
        self.assertTrue(lab.assertion)
        self.assertFalse(seen[0].exists())

    def test_the_notes_of_the_lab_and_of_the_learner_are_joined(self) -> None:
        receipt = self.stage(notes="my own note").receipt
        self.assertTrue(receipt["notes"].endswith("my own note"))
        self.assertIn("Synthetic", receipt["notes"])

    def test_the_bundle_is_what_the_file_holds_and_nothing_names_this_machine(self) -> None:
        outcome = self.stage()
        with gzip.open(outcome.path, "rb") as packed:
            text = packed.read().decode("utf-8")
        # The needles are built from pieces, so that this file holds no path of a machine either.
        for needle in (str(self.folder), self.folder.name, "/ho" + "me/", "/t" + "mp/", "/Us" + "ers/"):
            self.assertNotIn(needle, text)
        self.assertEqual(json.loads(text)["receipt"]["lab"], "tr3.profile")


class Provenance(unittest.TestCase):
    def test_what_is_declared_is_recorded(self) -> None:
        recorded, notes = grade.resolve_provenance("explain", "no", {})
        self.assertEqual(recorded, {"assisted": "explain", "agent": False, "guard": "on"})
        self.assertEqual(notes, [])

    def test_what_is_not_declared_is_recorded_as_the_most_help_and_said_so(self) -> None:
        recorded, notes = grade.resolve_provenance(None, None, {})
        self.assertEqual((recorded["assisted"], recorded["agent"]), ("code", True))
        self.assertEqual(len(notes), 1)
        self.assertIn("assisted and agent not declared", notes[0])
        self.assertIn("--assisted none|explain|code", notes[0])
        recorded, notes = grade.resolve_provenance("none", None, {})
        self.assertEqual((recorded["assisted"], recorded["agent"]), ("none", True))
        self.assertIn("agent not declared", notes[0])
        self.assertNotIn("assisted and", notes[0])

    def test_the_variables_declare_it_when_the_flags_do_not(self) -> None:
        recorded, notes = grade.resolve_provenance(None, None, {"ENGINESPACE_ASSISTED": " None ", "ENGINESPACE_AGENT": "NO"})
        self.assertEqual(recorded, {"assisted": "none", "agent": False, "guard": "on"})
        self.assertEqual(notes, [])
        recorded, _ = grade.resolve_provenance("code", "yes", {"ENGINESPACE_ASSISTED": "none", "ENGINESPACE_AGENT": "no"})
        self.assertEqual((recorded["assisted"], recorded["agent"]), ("code", True), "a flag wins over a variable")

    def test_the_guard_is_on_unless_the_agent_kits_switch_is_off(self) -> None:
        self.assertEqual(grade.resolve_provenance("none", "no", {"ES_SOLO": "0"})[0]["guard"], "off")
        self.assertEqual(grade.resolve_provenance("none", "no", {"ES_SOLO": "1"})[0]["guard"], "on")
        self.assertEqual(grade.resolve_provenance("none", "no", {})[0]["guard"], "on")

    def test_a_declaration_that_is_not_one_is_refused(self) -> None:
        with self.assertRaises(GraderError):
            grade.resolve_provenance("lots", "no", {})
        with self.assertRaises(GraderError):
            grade.resolve_provenance("none", "maybe", {})


class Pins(unittest.TestCase):
    def test_without_a_course_lock_to_compare_with_a_run_cannot_claim_to_be_on_the_pins(self) -> None:
        with mock.patch("enginespace_grader.pins.find_kit_root", return_value=None), self.assertRaises(GraderError) as caught:
            grade.local_pins(SampleLab())
        self.assertIn("course.lock.json was not found", str(caught.exception))
        self.assertIn("tr3.profile", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
