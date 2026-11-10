"""Canonical JSON against schemas/vectors/canonical.json, and the walk's own edges (ARCHITECTURE section 9.8)."""

from __future__ import annotations

import json
import math
import struct
import unittest
from collections.abc import Mapping
from typing import Any

from enginespace_grader import canonical, hashing

from .support import REFUSAL, run_vectors

# Characters that a source file is better off not holding as themselves.
DEL = chr(0x7F)
LINE_SEPARATOR = chr(0x2028)
PARAGRAPH_SEPARATOR = chr(0x2029)
EMOJI = chr(0x1F600)
FULLWIDTH_TILDE = chr(0xFF5E)
PRIVATE_USE = chr(0xE000)


def text_vector(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    if vector.get("error"):
        # Any refusal counts: the parser's (NaN, a trailing comma, an overflow) or the canonical form's (a number past 2**53, a lone surrogate).
        with case.assertRaises((ValueError, RecursionError)):
            canonical.canonical_json(canonical.parse_json(vector["input"]))
        return
    parsed = canonical.parse_json(vector["input"])
    if "bits" in vector:
        # The input is a bare number: both parsers have to read it as the same double before it is written.
        case.assertEqual(struct.pack(">d", float(parsed)).hex(), vector["bits"])
    text = canonical.canonical_json(parsed)
    case.assertEqual(text, vector["canonical"])
    encoded = text.encode("utf-8")
    case.assertEqual(len(encoded), vector["utf8Bytes"])
    case.assertEqual(hashing.sha256_hex(encoded), vector["sha256"])
    case.assertEqual(canonical.canonical_bytes(parsed), encoded)


class CanonicalVectors(unittest.TestCase):
    def test_every_vector_of_canonical_json_matches(self) -> None:
        ran = run_vectors(self, "canonical", {"canonical": text_vector})
        self.assertGreaterEqual(ran, 150)


class Numbers(unittest.TestCase):
    """The number formatter against what ECMAScript prints, case by case. The vectors hold most of them; these are the ones that name the rule."""

    def test_where_the_exponent_starts(self) -> None:
        cases = {
            0.000001: "0.000001",
            0.0000001: "1e-7",
            1.5e-7: "1.5e-7",
            1.234e-10: "1.234e-10",
            5e-324: "5e-324",
            0.00001234: "0.00001234",
            1e15: "1000000000000000",
            123456789.123: "123456789.123",
            4503599627370495.5: "4503599627370495.5",
            -1.5: "-1.5",
            -1e-7: "-1e-7",
            0.30000000000000004: "0.30000000000000004",
            1.0000000000000002: "1.0000000000000002",
            -0.0: "0",
            0.0: "0",
            1.0: "1",
            100.0: "100",
            2.5e1: "25",
        }
        for value, text in cases.items():
            with self.subTest(value=repr(value)):
                self.assertEqual(canonical.canonical_json(value), text)

    def test_format_float_is_the_javascript_form_of_the_numbers_it_is_given(self) -> None:
        # A fraction never comes out with a trailing zero, an exponent of two digits or a leading plus.
        for exponent in range(-330, 16):
            for mantissa in (1.0, 1.5, 2.2250738585072014, 9.999999999999998, 4.9):
                value = mantissa * 10.0**exponent
                if not math.isfinite(value) or value == 0 or value.is_integer():
                    continue
                text = canonical.format_float(value)
                self.assertEqual(float(text), value, text)
                self.assertNotIn("e+", text)
                self.assertNotIn("e0", text)
                self.assertNotIn("e-0", text)
                self.assertFalse(text.endswith(".") or ("." in text and "e" not in text and text.endswith("0")), text)

    def test_the_formatter_on_its_own_follows_ecmascript_past_2_to_the_53_too(self) -> None:
        """canonical_json never gets here (a whole number that large has no canonical form), but the formatter is public and is held to the rule."""
        self.assertEqual(canonical.format_float(1e20), "100000000000000000000")
        self.assertEqual(canonical.format_float(1.5e20), "150000000000000000000")
        self.assertEqual(canonical.format_float(1e21), "1e+21")
        self.assertEqual(canonical.format_float(-1.25e22), "-1.25e+22")
        self.assertEqual(canonical.format_float(0.0), "0")
        self.assertEqual(canonical.format_float(-0.0), "0")
        for value in (math.nan, math.inf, -math.inf):
            with self.assertRaises(ValueError):
                canonical.format_float(value)

    def test_a_whole_number_past_2_to_the_53_is_refused_as_an_int_and_as_a_float(self) -> None:
        for value in (2**53, -(2**53), 2**53 + 1, 10**30, 1e16, -1e16, 1e300, float(2**53)):
            with self.assertRaises(canonical.CanonicalError, msg=repr(value)):
                canonical.canonical_json(value)
        for value in (2**53 - 1, -(2**53 - 1), float(2**53 - 1)):
            self.assertEqual(canonical.canonical_json(value), str(int(value)))

    def test_a_number_that_is_not_finite_is_refused(self) -> None:
        for value in (math.nan, math.inf, -math.inf):
            with self.assertRaises(canonical.CanonicalError):
                canonical.canonical_json(value)
            with self.assertRaises(canonical.CanonicalError):
                canonical.canonical_json([1, 2, value])

    def test_a_bool_is_not_a_number(self) -> None:
        self.assertEqual(canonical.canonical_json([True, False, 1, 0]), "[true,false,1,0]")


class Strings(unittest.TestCase):
    def test_the_escapes_are_those_of_json_stringify(self) -> None:
        self.assertEqual(canonical.canonical_json('"\\/\b\f\n\r\t'), '"\\"\\\\/\\b\\f\\n\\r\\t"')
        self.assertEqual(canonical.canonical_json("\u0000\u0001\u001f\u000b"), '"\\u0000\\u0001\\u001f\\u000b"')
        # DEL and the line separators are written as themselves.
        self.assertEqual(canonical.canonical_json(DEL + LINE_SEPARATOR + PARAGRAPH_SEPARATOR), '"' + DEL + LINE_SEPARATOR + PARAGRAPH_SEPARATOR + '"')

    def test_it_agrees_with_json_dumps_on_every_string_without_a_lone_surrogate(self) -> None:
        corpus = [chr(code) for code in range(0x300)] + [LINE_SEPARATOR, EMOJI, "a" + chr(0) + "b", "caf" + chr(0xE9), chr(0xFEFF), chr(0x202E)]
        for text in corpus:
            self.assertEqual(canonical.canonical_json(text), json.dumps(text, ensure_ascii=False))

    def test_a_lone_surrogate_is_refused_in_a_value_and_in_a_key(self) -> None:
        for value in ("\ud800", "\udc00", "a\ud83d", ["x", "\ude00\ud83d"], {"\ud800": 1}):
            with self.assertRaises(canonical.CanonicalError):
                canonical.canonical_json(value)

    def test_a_pair_that_arrived_as_two_escapes_is_one_character(self) -> None:
        self.assertEqual(canonical.canonical_json(canonical.parse_json('"\\ud83d\\ude00"')), '"\U0001f600"')


class Containers(unittest.TestCase):
    def test_keys_sort_by_utf_16_code_unit_and_not_by_code_point(self) -> None:
        # U+1F600 is the pair d83d de00, which sorts before U+E000 and U+FF5E; by code point it would sort after them.
        value = {EMOJI: 1, FULLWIDTH_TILDE: 2, PRIVATE_USE: 3}
        self.assertEqual(canonical.canonical_json(value), '{"' + EMOJI + '":1,"' + PRIVATE_USE + '":3,"' + FULLWIDTH_TILDE + '":2}')
        self.assertEqual(sorted(value), [PRIVATE_USE, FULLWIDTH_TILDE, EMOJI], "Python sorts by code point, which is why the walk does not")

    def test_keys_are_sorted_at_every_depth_and_arrays_keep_their_order(self) -> None:
        value = {"z": {"b": 1, "a": 2}, "y": [{"d": 1, "c": 2}, 3, 1, 2]}
        self.assertEqual(canonical.canonical_json(value), '{"y":[{"c":2,"d":1},3,1,2],"z":{"a":2,"b":1}}')

    def test_a_key_that_is_not_text_is_refused(self) -> None:
        for value in ({1: "a"}, {None: 1}, {("a",): 1}):
            with self.assertRaises(canonical.CanonicalError):
                canonical.canonical_json(value)

    def test_a_value_that_json_has_no_word_for_is_refused(self) -> None:
        for value in (b"bytes", {1, 2}, object(), complex(1, 2), {"a": {"b": [1, {2}]}}):
            with self.assertRaises(canonical.CanonicalError):
                canonical.canonical_json(value)

    def test_a_refusal_names_the_place(self) -> None:
        with self.assertRaises(canonical.CanonicalError) as caught:
            canonical.canonical_json({"a": [1, {"b": [2, 2**60]}]})
        self.assertEqual(caught.exception.path, "$.a[1].b[1]")
        with self.assertRaises(canonical.CanonicalError) as caught:
            canonical.canonical_json({"a": [1, 2, 3 * 2**60, 5]})
        self.assertEqual(caught.exception.path, "$.a[2]", "the fast path for a list of ints names the element as well")
        with self.assertRaises(canonical.CanonicalError) as caught:
            canonical.canonical_json({"outer": {"k": 1, "bad key": {"x": "\ud800"}}})
        self.assertEqual(caught.exception.path, "$.outer.bad key.x")

    def test_a_list_of_ints_and_a_list_with_one_float_are_written_alike(self) -> None:
        self.assertEqual(canonical.canonical_json([1, 2, 3]), "[1,2,3]")
        self.assertEqual(canonical.canonical_json([1, 2.5, 3]), "[1,2.5,3]")
        self.assertEqual(canonical.canonical_json((1, 2, 3)), "[1,2,3]")
        self.assertEqual(canonical.canonical_json([[], {}, [[]]]), "[[],{},[[]]]")

    def test_a_deeply_nested_document_is_written_and_never_a_recursion_error(self) -> None:
        depth = 5000
        value: Any = None
        for _ in range(depth):
            value = [value]
        text = canonical.canonical_json(value)
        self.assertEqual(text, "[" * depth + "null" + "]" * depth)
        deep_object: Any = 0
        for _ in range(depth):
            deep_object = {"k": deep_object}
        self.assertEqual(canonical.canonical_json(deep_object), '{"k":' * depth + "0" + "}" * depth)

    def test_the_same_value_gives_the_same_text_whatever_order_it_was_built_in(self) -> None:
        a = {"x": 1, "y": [1, 2, {"p": 1, "q": 2}]}
        b = {"y": [1, 2, {"q": 2, "p": 1}], "x": 1}
        self.assertEqual(canonical.canonical_json(a), canonical.canonical_json(b))

    def test_a_large_trace_in_columns_is_written_and_its_columns_are_in_order(self) -> None:
        columns = {"startNs": list(range(0, 2_000_000, 1)), "durNs": [7] * 2_000_000}
        text = canonical.canonical_json(columns)
        self.assertTrue(text.startswith('{"durNs":[7,7,7'))
        self.assertTrue(text.endswith("1999999]}"))

    def test_parse_json_refuses_what_javascript_refuses(self) -> None:
        for text in ("NaN", "Infinity", "-Infinity", "[NaN]", "{'a':1}", "01", "[1,]", ""):
            with self.assertRaises(REFUSAL):
                canonical.parse_json(text)
        self.assertEqual(canonical.parse_json('{"a":1,"a":2}'), {"a": 2}, "a repeated key keeps its last value, as it does in JavaScript")


if __name__ == "__main__":
    unittest.main()
