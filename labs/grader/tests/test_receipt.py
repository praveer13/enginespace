"""The receipt: what the builder makes, and what the schema and the rules refuse (ARCHITECTURE section 9.6)."""

from __future__ import annotations

import copy
import datetime as dt
import unittest
from collections.abc import Callable
from typing import Any

from enginespace_grader import receipt as receipts
from enginespace_grader.challenge import parse_challenge
from enginespace_grader.hashing import sha256_hex
from enginespace_grader.identity import GraderIdentity

from . import samples


def sample_receipt() -> dict[str, Any]:
    return samples.sample_bundle()["receipt"]


def mutated(change: Callable[[dict[str, Any]], None]) -> list[str]:
    """The problems of the sample receipt after `change`."""
    receipt = sample_receipt()
    change(receipt)
    return receipts.receipt_problems(receipt)


class Honest(unittest.TestCase):
    def test_the_sample_receipt_has_no_problem(self) -> None:
        self.assertEqual(receipts.receipt_problems(sample_receipt()), [])

    def test_the_optional_parts_may_be_left_out(self) -> None:
        receipt = sample_receipt()
        for key in ("performance", "notes", "ext"):
            del receipt[key]
        for key in ("driver", "engine", "engineConfig"):
            del receipt["environment"][key]
        receipt["environment"]["gpus"] = []
        receipt["environment"]["libs"] = []
        receipt["environment"]["envVars"] = {}
        self.assertEqual(receipts.receipt_problems(receipt), [])

    def test_ext_and_the_claimed_summary_take_any_json(self) -> None:
        receipt = sample_receipt()
        receipt["ext"] = {"anything": [1, 2.5, None, {"nested": "yes"}], "n": 0.1}
        receipt["performance"]["claimed"] = {"p99": 12.5, "list": [1, 2, 3], "text": "free"}
        self.assertEqual(receipts.receipt_problems(receipt), [])

    def test_the_keys_of_a_built_receipt_follow_the_schemas_order(self) -> None:
        self.assertEqual(
            list(sample_receipt()),
            ["schema", "lab", "stage", "challenge", "createdAt", "grader", "environment", "pins", "inputs", "artifacts", "checks", "performance", "provenance", "notes", "ext"],
        )

    def test_the_artifact_entries_are_hashed_over_the_data(self) -> None:
        by_id = {entry["id"]: entry for entry in sample_receipt()["artifacts"]}
        self.assertEqual(by_id["log"]["sha256"], sha256_hex(samples.LOG.encode("utf-8")))
        self.assertEqual(by_id["log"]["bytes"], len(samples.LOG.encode("utf-8")))
        self.assertFalse(by_id["capture"]["inBundle"])
        self.assertEqual(by_id["capture"]["bytes"], 987_654_321)

    def test_the_receipt_is_identified_by_the_hash_of_its_canonical_text(self) -> None:
        receipt = sample_receipt()
        first = receipts.receipt_sha256(receipt)
        self.assertRegex(first, r"^[0-9a-f]{64}$")
        shuffled = dict(reversed(list(receipt.items())))
        self.assertEqual(receipts.receipt_sha256(shuffled), first, "the order of the keys is not part of the identity")
        receipt["notes"] = "changed"
        self.assertNotEqual(receipts.receipt_sha256(receipt), first)


class Builder(unittest.TestCase):
    def test_a_receipt_is_made_from_its_parts(self) -> None:
        token = parse_challenge(samples.TOKEN)
        assert token is not None
        built = receipts.build_receipt(
            challenge=token,
            created_at="2026-11-05T12:30:00Z",
            grader=GraderIdentity("enginespace-grader", "0.1.0", "0" * 64),
            environment=samples.sample_environment(),
            pins=samples.sample_pins(),
            inputs=[],
            artifacts=[],
            checks=[receipts.make_check("c", "property", True)],
            provenance=samples.PROVENANCE,
        )
        self.assertEqual(receipts.receipt_problems(built), [])
        self.assertEqual((built["lab"], built["stage"]), ("tr3.profile", "tr3.profile.s2"))
        self.assertNotIn("performance", built)
        self.assertNotIn("notes", built)

    def test_the_entries_leave_out_what_was_not_given(self) -> None:
        self.assertEqual(receipts.make_check("a", "property", True), {"id": "a", "kind": "property", "pass": True, "detail": ""})
        full = receipts.make_check("a", "correctness", False, value=0.5, bound=1, tolerance=2, n=3, detail="why", ref_sha256="a" * 64)
        self.assertEqual(list(full), ["id", "kind", "pass", "value", "bound", "tolerance", "n", "detail", "refSha256"])
        self.assertEqual(receipts.make_input("m", "model", "b" * 64, 5), {"name": "m", "kind": "model", "sha256": "b" * 64, "bytes": 5})
        self.assertEqual(receipts.make_input("m", "model", "b" * 64, 5, revision="r")["revision"], "r")

    def test_the_moment_is_utc_to_the_second_with_a_z(self) -> None:
        self.assertEqual(receipts.utc_instant(dt.datetime(2026, 11, 9, 12, 30, 5, 999999, tzinfo=dt.timezone.utc)), "2026-11-09T12:30:05Z")
        east = dt.timezone(dt.timedelta(hours=9))
        self.assertEqual(receipts.utc_instant(dt.datetime(2026, 11, 9, 9, 0, 0, tzinfo=east)), "2026-11-09T00:00:00Z")
        with self.assertRaises(ValueError):
            receipts.utc_instant(dt.datetime(2026, 11, 9, 9, 0, 0))

    def test_the_enumerations_are_read_from_the_schema_and_not_copied(self) -> None:
        self.assertEqual(receipts.enum_values("provenance", "assisted"), ("none", "explain", "code"))
        self.assertEqual(receipts.enum_values("provenance", "guard"), ("on", "off"))
        self.assertEqual(receipts.enum_values("environment", "host", "kind"), ("local", "runpod", "modal", "lambda", "other"))

    def test_the_lab_of_a_stage(self) -> None:
        self.assertEqual(receipts.lab_of_stage("tr8.replay.s2"), "tr8.replay")
        self.assertEqual(receipts.lab_of_stage("tr1.nano-vllm.s10"), "tr1.nano-vllm")


def has(problems: list[str], fragment: str) -> bool:
    return any(fragment in problem for problem in problems)


class RefusedByTheSchema(unittest.TestCase):
    """Each change breaks one thing, and the problem names the place and the thing."""

    def refused(self, change: Callable[[dict[str, Any]], None], *fragments: str) -> None:
        problems = mutated(change)
        self.assertNotEqual(problems, [], "the change was not refused")
        for fragment in fragments:
            self.assertTrue(has(problems, fragment), f"{fragment!r} is not in {problems}")

    def test_a_key_the_schema_does_not_name_is_refused_at_every_level(self) -> None:
        self.refused(lambda r: r.update(hostname="example-host"), "hostname")
        self.refused(lambda r: r["environment"]["host"].update(hostname="example-host"), "/environment/host", "hostname")
        self.refused(lambda r: r["environment"]["host"].update(user="learner"), "user")
        self.refused(lambda r: r["environment"]["gpus"][0].update(uuid="GPU-00000000-0000-0000-0000-000000000000"), "/environment/gpus/0", "uuid")
        self.refused(lambda r: r["environment"]["gpus"][0].update(serial="0000000000000"), "serial")
        self.refused(lambda r: r["environment"].update(ip="192.0.2.1"), "ip")
        self.refused(lambda r: r["provenance"].update(note="x"), "/provenance")
        self.refused(lambda r: r["checks"][0].update(extra=1), "/checks/0")
        self.refused(lambda r: r["challenge"].update(extra=1), "/challenge")

    def test_a_missing_field_is_named(self) -> None:
        for key in ("schema", "lab", "stage", "challenge", "createdAt", "grader", "environment", "pins", "inputs", "artifacts", "checks", "provenance"):
            self.refused(lambda r, key=key: r.pop(key), key)

    def test_an_environment_variable_outside_the_allowlist_is_refused(self) -> None:
        self.refused(lambda r: r["environment"]["envVars"].update(HF_TOKEN="hf_example"), "HF_TOKEN")
        self.refused(lambda r: r["environment"]["envVars"].update(PATH="/usr/bin"), "PATH")
        self.refused(lambda r: r["environment"]["envVars"].update(vllm_lower="x"), "vllm_lower")
        receipt = sample_receipt()
        receipt["environment"]["envVars"] = {"SGLANG_EXAMPLE": "1", "VLLM_EXAMPLE": "2"}
        self.assertEqual(receipts.receipt_problems(receipt), [])

    def test_the_wrong_shape_of_a_hash_is_refused(self) -> None:
        for bad in ("A" * 64, "a" * 63, "a" * 65, "g" * 64, "a" * 64 + "\n", ""):
            self.refused(lambda r, bad=bad: r["artifacts"][0].update(sha256=bad), "/artifacts/0/sha256")

    def test_a_wrong_kind_a_wrong_number_and_a_wrong_type_are_refused(self) -> None:
        self.refused(lambda r: r["environment"]["host"].update(kind="laptop"), "/environment/host/kind")
        self.refused(lambda r: r["artifacts"][0].update(kind="movie"), "/artifacts/0/kind")
        self.refused(lambda r: r["checks"][0].update(kind="vibes"), "/checks/0/kind")
        self.refused(lambda r: r["provenance"].update(assisted="a lot"), "/provenance/assisted")
        self.refused(lambda r: r["provenance"].update(agent="no"), "/provenance/agent")
        self.refused(lambda r: r["artifacts"][0].update(bytes=-1), "/artifacts/0/bytes")
        self.refused(lambda r: r["artifacts"][0].update(bytes=1.5), "/artifacts/0/bytes")
        self.refused(lambda r: r["artifacts"][0].update(bytes=True), "/artifacts/0/bytes")
        self.refused(lambda r: r["environment"]["host"].update(cores=0), "/environment/host/cores")
        self.refused(lambda r: r["environment"]["gpus"][0].update(memoryBytes=0), "memoryBytes")
        self.refused(lambda r: r["environment"]["gpus"][0].update(computeCapability="8"), "computeCapability")
        self.refused(lambda r: r["checks"][0].update(n=-1), "/checks/0/n")
        self.refused(lambda r: r["checks"][0].update(**{"pass": "yes"}), "/checks/0/pass")
        self.refused(lambda r: r["environment"].update(python="three"), "/environment/python")
        self.refused(lambda r: r["grader"].update(name="another-grader"), "/grader/name")
        self.refused(lambda r: r.update(schema="enginespace/receipt@2"), "/schema")

    def test_text_that_is_not_plain_is_refused(self) -> None:
        self.refused(lambda r: r.update(notes="x" * 2001), "/notes")
        self.refused(lambda r: r["environment"]["host"].update(os="Linux\nwith a line break"), "/environment/host/os")
        self.refused(lambda r: r["environment"]["host"].update(os=""), "/environment/host/os")
        self.refused(lambda r: r["environment"]["host"].update(os="x" * 129), "/environment/host/os")
        self.refused(lambda r: r["checks"][0].update(detail="x" * 1001), "/checks/0/detail")
        self.refused(lambda r: r.update(notes="a" + chr(0) + "b"), "/notes")
        receipt = sample_receipt()
        receipt["notes"] = "tabs\tand\nlines are fine in notes\r\n"
        self.assertEqual(receipts.receipt_problems(receipt), [])

    def test_an_instant_with_an_offset_or_without_a_z_is_refused(self) -> None:
        for bad in ("2026-11-05T12:30:00+01:00", "2026-11-05T12:30:00", "2026-11-05 12:30:00Z", "2026-11-05T12:30Z", "2026-11-05T12:30:00Z\n"):
            self.refused(lambda r, bad=bad: r.update(createdAt=bad), "/createdAt")
        receipt = sample_receipt()
        receipt["createdAt"] = "2026-11-05T12:30:00.123456789Z"
        self.assertEqual(receipts.receipt_problems(receipt), [])

    def test_the_number_of_entries_is_bounded(self) -> None:
        self.refused(lambda r: r["environment"].update(gpus=[r["environment"]["gpus"][0]] * 17), "/environment/gpus")
        self.refused(lambda r: r["environment"].update(envVars={f"VLLM_V{i}": "x" for i in range(65)}), "/environment/envVars")

    def test_a_problem_list_is_short_and_in_a_fixed_order(self) -> None:
        receipt = sample_receipt()
        receipt["artifacts"] = [dict(receipt["artifacts"][0], sha256="bad", id=f"a{i}") for i in range(60)]
        first = receipts.receipt_problems(receipt)
        self.assertLessEqual(len(first), 20)
        self.assertEqual(first, receipts.receipt_problems(receipt))
        self.assertEqual(first, sorted(first))


class RefusedByTheRules(unittest.TestCase):
    """What JSON Schema cannot say, and the zod schema's superRefine does."""

    def refused(self, change: Callable[[dict[str, Any]], None], *fragments: str) -> None:
        problems = mutated(change)
        self.assertNotEqual(problems, [], "the change was not refused")
        for fragment in fragments:
            self.assertTrue(has(problems, fragment), f"{fragment!r} is not in {problems}")

    def test_the_lab_is_the_labs_of_the_stage(self) -> None:
        self.refused(lambda r: r.update(lab="tr3.other"), "/lab", "must be the lab of the stage, tr3.profile")

    def test_the_token_names_this_stage(self) -> None:
        other = samples.format_challenge("tr3.profile.s3", 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104")
        self.refused(lambda r: r["challenge"].update(token=other), "/challenge/token", "names stage tr3.profile.s3")

    def test_the_token_is_a_good_token_whose_parts_the_object_repeats(self) -> None:
        good = samples.TOKEN
        self.refused(lambda r: r["challenge"].update(token=good[:-1] + ("0" if good[-1] != "0" else "1")), "/challenge", "checksum")
        self.refused(lambda r: r["challenge"].update(seed=1), "/challenge", "seed")
        self.refused(lambda r: r["challenge"].update(nonce="AAAAAAAAAAAAAAAA"), "/challenge", "nonce")
        self.refused(lambda r: r["challenge"].update(issuedOn="20261105"), "/challenge", "issue date")
        self.refused(lambda r: r["challenge"].update(issuedOn="20261301"), "/challenge", "calendar")
        self.refused(lambda r: r["challenge"].update(seed=2**32), "/challenge")

    def test_an_instant_that_does_not_exist_is_refused(self) -> None:
        for bad in ("2026-02-30T12:00:00Z", "2026-13-01T12:00:00Z", "2026-11-05T24:00:00Z", "2026-11-05T12:60:00Z", "2026-11-05T12:00:60Z", "0000-01-01T00:00:00Z"):
            self.refused(lambda r, bad=bad: r.update(createdAt=bad), "/createdAt", "moment that exists")

    def test_a_name_that_is_listed_twice_names_the_second_place(self) -> None:
        self.refused(lambda r: r["artifacts"].append(dict(r["artifacts"][0])), '/artifacts/3/id', 'artifact "trace" is listed twice')
        self.refused(lambda r: r["inputs"].append(dict(r["inputs"][0])), "/inputs/1/name", 'input "prompts" is listed twice')
        self.refused(lambda r: r["checks"].append(dict(r["checks"][0])), "/checks/2/id", 'check "agreement" is listed twice')
        self.refused(lambda r: r["environment"]["libs"].append(dict(r["environment"]["libs"][0])), "/environment/libs/2/name", "is listed twice")
        self.refused(lambda r: r["pins"].update(onPin=False, offPin=["vllm", "vllm"]), "/pins/offPin/1", '"vllm" is listed twice')

    def test_on_pin_is_true_exactly_when_nothing_is_off_pin(self) -> None:
        self.refused(lambda r: r["pins"].update(onPin=True, offPin=["vllm"]), "/pins/onPin", "exactly when offPin is empty")
        self.refused(lambda r: r["pins"].update(onPin=False, offPin=[]), "/pins/onPin")
        receipt = sample_receipt()
        receipt["pins"].update(onPin=False, offPin=["vllm", "torch"])
        self.assertEqual(receipts.receipt_problems(receipt), [])

    def test_a_receipt_with_no_canonical_text_is_refused_wherever_the_cause_is(self) -> None:
        self.refused(lambda r: r["checks"][0].update(value=2**60), "/checks/0/value", "beyond 2**53")
        self.refused(lambda r: r["checks"][0].update(bound=1e300), "/checks/0/bound", "beyond 2**53")
        self.refused(lambda r: r["ext"].update(big=[1, 2, 2**53]), "/ext/big/2", "beyond 2**53")
        self.refused(lambda r: r["performance"]["claimed"].update(rate=float("inf")), "/performance/claimed/rate")
        self.refused(lambda r: r.update(notes="lone surrogate " + chr(0xD800)), "/notes")
        self.refused(lambda r: r["ext"].update({chr(0xDC00): 1}), "/ext", "lone surrogate")
        receipt = sample_receipt()
        receipt["checks"][0]["value"] = 2**53 - 1
        receipt["checks"][1].update(value=0.1, bound=1e-7)
        self.assertEqual(receipts.receipt_problems(receipt), [])

    def test_the_rules_do_not_run_on_a_receipt_of_the_wrong_shape(self) -> None:
        problems = mutated(lambda r: (r.pop("challenge"), r.update(lab="tr3.other")))
        self.assertTrue(has(problems, "challenge"))
        self.assertFalse(has(problems, "must be the lab of the stage"), "the schema's problems come first, and the rules read a receipt of the right shape")

    def test_not_a_mapping_is_a_problem_and_not_an_exception(self) -> None:
        for value in (None, [], "receipt", 3):
            problems = receipts.receipt_problems(copy.deepcopy(value))
            self.assertNotEqual(problems, [])


if __name__ == "__main__":
    unittest.main()
