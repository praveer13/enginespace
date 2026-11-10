"""hash32 and the sub-streams of rng_for against schemas/vectors/subseed.json (ARCHITECTURE section 5.1 and 9.8)."""

from __future__ import annotations

import unittest
from collections.abc import Mapping
from typing import Any

from enginespace_grader import rng

from .support import REFUSAL, run_vectors


def hash_of(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    case.assertEqual(rng.hash32(vector["text"]), vector["hash"])
    case.assertEqual(f"{rng.hash32(vector['text']):08x}", vector["hex"])


def sub_stream(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    if vector.get("error"):
        with case.assertRaises(REFUSAL):
            rng.rng_for(vector["seed"], vector["salt"])
        return
    case.assertEqual(rng.hash32(vector["salt"]), vector["hash"])
    case.assertEqual((vector["seed"] ^ vector["hash"]) & rng.MASK32, vector["mixed"])
    draw = rng.rng_for(vector["seed"], vector["salt"])
    case.assertEqual([draw() for _ in vector["draws"]], vector["draws"])
    # The sub-stream is the stream of the mixed seed, which is how the vectors tie this file to rng.json.
    direct = rng.splitmix32u(vector["mixed"])
    case.assertEqual([direct() for _ in vector["draws"]], vector["draws"])


class SubseedVectors(unittest.TestCase):
    def test_every_vector_of_subseed_json_matches(self) -> None:
        ran = run_vectors(self, "subseed", {"hash32": hash_of, "rngFor": sub_stream})
        self.assertGreaterEqual(ran, 40)


class Hash32(unittest.TestCase):
    def test_it_is_the_byte_wise_fnv_1a_for_ascii(self) -> None:
        def fnv(data: bytes) -> int:
            h = 0x811C9DC5
            for byte in data:
                h = ((h ^ byte) * 0x01000193) % 2**32
            return h

        for text in ("", "a", "foobar", "workload/arrivals", "es1:tr8.replay.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104"):
            self.assertEqual(rng.hash32(text), fnv(text.encode("ascii")))

    def test_outside_ascii_it_hashes_utf_16_code_units_as_javascript_does(self) -> None:
        # U+00E9 is one code unit, 0xe9, where its UTF-8 form is the two bytes c3 a9; an emoji is the pair d83d de00.
        self.assertEqual(rng.hash32(chr(0xE9)), ((0x811C9DC5 ^ 0xE9) * 0x01000193) % 2**32)
        pair = ((0x811C9DC5 ^ 0xD83D) * 0x01000193) % 2**32
        self.assertEqual(rng.hash32("\U0001f600"), ((pair ^ 0xDE00) * 0x01000193) % 2**32)
        # A lone surrogate is a code unit like another.
        self.assertEqual(rng.hash32("\ud800"), ((0x811C9DC5 ^ 0xD800) * 0x01000193) % 2**32)

    def test_a_salt_that_is_not_text_is_refused(self) -> None:
        with self.assertRaises(TypeError):
            rng.rng_for(1, b"salt")  # type: ignore[arg-type]
        with self.assertRaises(TypeError):
            rng.hash32(b"salt")  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
