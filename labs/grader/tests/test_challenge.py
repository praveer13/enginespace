"""The challenge token against schemas/vectors/challenge.json, and the clock (ARCHITECTURE section 8.4, D-027)."""

from __future__ import annotations

import datetime as dt
import unittest
from collections.abc import Mapping
from typing import Any

from enginespace_grader import challenge as codec
from enginespace_grader import rng

from .support import run_vectors


def accepted(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    checked = codec.check_challenge(vector["token"])
    case.assertTrue(checked.ok, checked.message)
    parts = checked.challenge
    assert parts is not None
    case.assertEqual(parts.stage, vector["stage"])
    case.assertEqual(parts.seed, vector["seed"])
    case.assertEqual(f"{parts.seed:08x}", vector["seedHex"])
    case.assertEqual(parts.nonce, vector["nonce"])
    case.assertEqual(parts.issued_on, vector["issuedOn"])
    case.assertEqual(parts.body, vector["body"])
    case.assertEqual(parts.checksum, vector["checksum"])
    case.assertEqual(codec.challenge_checksum(vector["body"]), vector["checksum"])
    case.assertEqual(codec.parse_challenge(vector["token"]), parts)
    # The seed ties the token to the stream of rng.json.
    draw = parts.rng("")  # a sub-stream with the empty salt is the seed xor the hash of nothing, so it is not the plain stream
    plain = rng.splitmix32u(parts.seed)
    case.assertEqual([plain() for _ in vector["firstDraws"]], vector["firstDraws"])
    case.assertNotEqual(draw(), 0)
    # The token is made again from its parts.
    case.assertEqual(codec.format_challenge(parts.stage, parts.seed, parts.nonce, parts.issued_on), vector["token"])


def refused(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    checked = codec.check_challenge(vector["token"])
    case.assertFalse(checked.ok, f"the codec takes {vector['token']!r}")
    case.assertIn(checked.problem, ("shape", "date", "checksum"))
    case.assertNotEqual(checked.message, "")
    case.assertIsNone(codec.parse_challenge(vector["token"]))


def challenge_object(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    problems = codec.challenge_object_problems(vector["value"])
    case.assertEqual(problems == [], vector["valid"], problems)


class ChallengeVectors(unittest.TestCase):
    def test_every_vector_of_challenge_json_matches(self) -> None:
        ran = run_vectors(self, "challenge", {"token": accepted, "refused": refused, "object": challenge_object})
        self.assertGreaterEqual(ran, 50)


class Reading(unittest.TestCase):
    TOKEN = "es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:16eee4ae"

    def test_the_problem_is_the_first_thing_wrong_in_the_order_shape_date_checksum(self) -> None:
        self.assertEqual(codec.check_challenge("nonsense").problem, "shape")
        bad_date = "es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261301"
        body_checked = codec.check_challenge(f"{bad_date}:{codec.challenge_checksum(bad_date)}")
        self.assertEqual(body_checked.problem, "date")
        self.assertEqual(codec.check_challenge(self.TOKEN[:-1] + "f").problem, "checksum")
        self.assertTrue(codec.check_challenge(self.TOKEN).ok)

    def test_a_token_that_is_not_text_is_a_shape_error(self) -> None:
        for value in (None, 7, b"es1:", ["es1"]):
            self.assertEqual(codec.check_challenge(value).problem, "shape")  # type: ignore[arg-type]

    def test_the_parts_name_their_lab_and_make_the_receipts_object(self) -> None:
        parts = codec.parse_challenge(self.TOKEN)
        assert parts is not None
        self.assertEqual(parts.lab, "tr8.replay")
        self.assertEqual(parts.as_object(), {"token": self.TOKEN, "seed": 0x0BADC0DE, "nonce": "ABCDEFGHJKLMNPQR", "issuedOn": "20261104"})
        self.assertEqual(codec.challenge_object_problems(parts.as_object()), [])
        self.assertEqual(parts.issued_date, dt.date(2026, 11, 4))

    def test_the_streams_of_one_token_are_independent_and_repeatable(self) -> None:
        parts = codec.parse_challenge(self.TOKEN)
        assert parts is not None
        arrivals, prompts = parts.rng("workload/arrivals"), parts.rng("workload/prompt")
        first = [arrivals() for _ in range(4)]
        self.assertNotEqual(first, [prompts() for _ in range(4)])
        again = parts.rng("workload/arrivals")
        self.assertEqual([again() for _ in range(4)], first)

    def test_format_challenge_lists_everything_that_is_wrong(self) -> None:
        with self.assertRaises(ValueError) as caught:
            codec.format_challenge("tr9.x.s1", 2**32, "abc", "20260231")
        message = str(caught.exception)
        for fragment in ("stage", "seed", "nonce", "issue date"):
            self.assertIn(fragment, message)

    def test_calendar_days(self) -> None:
        self.assertTrue(codec.is_calendar_day(2024, 2, 29))
        self.assertFalse(codec.is_calendar_day(2023, 2, 29))
        self.assertFalse(codec.is_calendar_day(2100, 2, 29))
        self.assertTrue(codec.is_calendar_day(2000, 2, 29))
        self.assertFalse(codec.is_calendar_day(0, 1, 1))
        self.assertTrue(codec.is_calendar_day(9999, 12, 31))
        self.assertFalse(codec.is_calendar_day(10000, 1, 1))
        self.assertFalse(codec.is_issue_date("2026-11-04"))
        self.assertFalse(codec.is_issue_date("20261104\n"))


class ChallengeObject(unittest.TestCase):
    """The receipt's `challenge` object beyond the vectors: what JSON gives Python that JavaScript's numbers never did."""

    def good(self) -> dict[str, object]:
        parts = codec.parse_challenge(Reading.TOKEN)
        assert parts is not None
        return dict(parts.as_object())

    def test_a_seed_written_as_a_whole_float_is_the_seed_as_it_is_in_javascript(self) -> None:
        # `195936478.0` is the number 195936478 for JSON Schema, for zod and for the site. A port that refused it would refuse a file the site takes.
        value = self.good()
        value["seed"] = float(0x0BADC0DE)
        self.assertEqual(codec.challenge_object_problems(value), [])

    def test_what_is_not_an_unsigned_32_bit_integer_is_not_a_seed(self) -> None:
        for seed in (True, False, 1.5, float("nan"), float("inf"), -1, -0.5, 2**32, float(2**32), "195936478", None, [1]):
            value = self.good()
            value["seed"] = seed
            self.assertTrue(any("unsigned 32-bit integer" in problem for problem in codec.challenge_object_problems(value)), seed)

    def test_the_object_names_what_is_wrong_with_each_part(self) -> None:
        value = self.good()
        value["nonce"] = "abc"
        self.assertTrue(any("16 characters of A to Z and 2 to 7" in problem for problem in codec.challenge_object_problems(value)))
        value = self.good()
        value["issuedOn"] = "2026-11-04"
        self.assertTrue(any("YYYYMMDD" in problem for problem in codec.challenge_object_problems(value)))
        for not_an_object in (None, [], "es1:x", 3):
            self.assertEqual(codec.challenge_object_problems(not_an_object), ["the challenge must be an object"])


class Expiry(unittest.TestCase):
    def test_the_age_counts_days_from_the_issue_date(self) -> None:
        parts = codec.parse_challenge(Reading.TOKEN)
        assert parts is not None
        self.assertEqual(codec.age_in_days(parts, dt.date(2026, 11, 4)), 0)
        self.assertEqual(codec.age_in_days(parts, dt.date(2026, 11, 18)), codec.TOKEN_LIFETIME_DAYS)
        self.assertEqual(codec.age_in_days(parts, dt.date(2026, 11, 3)), -1)

    def test_the_lifetime_is_the_14_days_of_the_architecture(self) -> None:
        self.assertEqual(codec.TOKEN_LIFETIME_DAYS, 14)


if __name__ == "__main__":
    unittest.main()
