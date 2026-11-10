"""SHA-256 and the bytes an artifact is hashed over, against schemas/vectors/sha256.json (ARCHITECTURE section 8.5 rule 3)."""

from __future__ import annotations

import hashlib
import unittest
from collections.abc import Mapping
from typing import Any

from enginespace_grader import hashing

from .support import REFUSAL, run_vectors


def message(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    if "repeat" in vector:
        data = bytes.fromhex(vector["repeat"]["byteHex"]) * vector["repeat"]["times"]
    else:
        data = bytes.fromhex(vector["hex"])
    case.assertEqual(len(data), vector["bytes"])
    case.assertEqual(hashing.sha256_hex(data), vector["sha256"])
    case.assertEqual(hashlib.sha256(data).hexdigest(), vector["sha256"])


def artifact(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    if vector.get("error"):
        with case.assertRaises(REFUSAL):
            hashing.artifact_bytes(vector["encoding"], vector["data"])
        return
    data = hashing.artifact_bytes(vector["encoding"], vector["data"])
    case.assertEqual(len(data), vector["bytes"])
    if "bytesHex" in vector:
        case.assertEqual(data.hex(), vector["bytesHex"])
    case.assertEqual(hashing.sha256_hex(data), vector["sha256"])
    case.assertEqual(hashing.artifact_sha256(vector["encoding"], vector["data"]), vector["sha256"])


class Sha256Vectors(unittest.TestCase):
    def test_every_vector_of_sha256_json_matches(self) -> None:
        ran = run_vectors(self, "sha256", {"sha256": message, "artifact": artifact})
        self.assertGreaterEqual(ran, 55)


class Base64(unittest.TestCase):
    def test_the_form_is_checked_before_anything_is_decoded(self) -> None:
        good = ["", "AA==", "AAE=", "AAEC", "AAECAw==", "+/8=", "////", "A" * 400]
        bad = ["AAE", "AA=", "A===", "AA==AA==", "AAEC\n", "AA EC", "-_8=", "AA!=", "AAAAA", chr(0xE9) + "AAA", "====", "AA=\n"]
        for text in good:
            self.assertTrue(hashing.is_strict_base64(text), text)
        for text in bad:
            self.assertFalse(hashing.is_strict_base64(text), repr(text))

    def test_a_large_string_is_checked_without_a_regular_expression(self) -> None:
        text = "AAAA" * 5_000_000
        self.assertTrue(hashing.is_strict_base64(text))
        self.assertEqual(len(hashing.artifact_bytes("base64", text)), 15_000_000)
        self.assertFalse(hashing.is_strict_base64(text[:-4] + "AA*A"))


class Artifacts(unittest.TestCase):
    def test_an_encoding_and_data_that_do_not_go_together_are_refused(self) -> None:
        for encoding, data in (("text", 3), ("base64", None), ("text", b"bytes"), ("yaml", "x"), ("TEXT", "x"), ("json", {1: 2})):
            with self.assertRaises(ValueError):
                hashing.artifact_bytes(encoding, data)

    def test_the_encodings_are_the_three_of_the_bundle(self) -> None:
        self.assertEqual(hashing.ENCODINGS, ("json", "text", "base64"))

    def test_text_keeps_every_line_ending_and_does_not_normalise(self) -> None:
        self.assertEqual(hashing.artifact_bytes("text", "a\r\nb\n"), b"a\r\nb\n")
        self.assertNotEqual(hashing.artifact_bytes("text", "caf" + chr(0xE9)), hashing.artifact_bytes("text", "cafe" + chr(0x301)))

    def test_a_lone_surrogate_has_no_utf_8_form(self) -> None:
        self.assertTrue(hashing.has_lone_surrogate("a\ud800b"))
        self.assertFalse(hashing.has_lone_surrogate("a\U0001f600b"))


if __name__ == "__main__":
    unittest.main()
