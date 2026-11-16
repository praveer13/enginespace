"""The seeded generator against schemas/vectors/rng.json, and the edges of its arguments (ARCHITECTURE section 5.1 and 9.8)."""

from __future__ import annotations

import hashlib
import struct
import unittest
from collections.abc import Callable, Mapping
from typing import Any

from enginespace_grader import rng

from .support import REFUSAL, run_vectors


def counted(seed: int) -> tuple[rng.Rng, Callable[[], int]]:
    """The stream of `seed`, and how many draws have been taken from it."""
    next_draw = rng.splitmix32u(seed)
    taken = 0

    def draw() -> int:
        nonlocal taken
        taken += 1
        return next_draw()

    return draw, lambda: taken


def bits(value: float) -> str:
    """The IEEE-754 bits of a double, as 16 hex digits."""
    return struct.pack(">d", value).hex()


def stream(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    next_draw = rng.splitmix32u(vector["seed"])
    case.assertEqual([next_draw() for _ in vector["draws"]], vector["draws"])


def float_stream(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    next_value = rng.splitmix32(vector["seed"])
    values = [next_value() for _ in vector["values"]]
    case.assertEqual(values, vector["values"])
    case.assertEqual([bits(value) for value in values], vector["bits"])


def digest(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
    next_draw = rng.splitmix32u(vector["seed"])
    hasher = hashlib.sha256()
    for _ in range(vector["count"]):
        hasher.update(next_draw().to_bytes(4, "little"))
    case.assertEqual(hasher.hexdigest(), vector["sha256"])


def calls(function: Callable[..., Any], arguments: Callable[[Mapping[str, Any]], tuple[Any, ...]]) -> Callable[[unittest.TestCase, Mapping[str, Any]], None]:
    """A handler for a function drawn from the stream: `count` calls in a row on one stream, or a refusal."""

    def handle(case: unittest.TestCase, vector: Mapping[str, Any]) -> None:
        draw, used = counted(vector["seed"])
        if vector.get("error"):
            with case.assertRaises(REFUSAL):
                function(draw, *arguments(vector))
            return
        results = [function(draw, *arguments(vector)) for _ in range(vector["count"])]
        case.assertEqual(results, vector["results"])
        case.assertEqual(used(), vector["consumed"], "the number of draws the calls took")

    return handle


class RngVectors(unittest.TestCase):
    def test_every_vector_of_rng_json_matches(self) -> None:
        ran = run_vectors(
            self,
            "rng",
            {
                "splitmix32u": stream,
                "splitmix32": float_stream,
                "splitmix32u-digest": digest,
                "below": calls(rng.below, lambda v: (v["n"],)),
                "between": calls(rng.between, lambda v: (v["lo"], v["hi"])),
                "chance": calls(rng.chance, lambda v: (v["permille"],)),
                "pick": calls(rng.pick, lambda v: (v["items"],)),
                "weighted": calls(rng.weighted, lambda v: (v["weights"],)),
                "shuffle": calls(rng.shuffle, lambda v: (v["items"],)),
            },
        )
        self.assertGreaterEqual(ran, 100)


class Arguments(unittest.TestCase):
    """What the vectors cannot say: the kinds of mistake that Python allows and TypeScript's numbers did not."""

    def test_a_seed_is_a_plain_int_in_range(self) -> None:
        for bad in (-1, 2**32, 2**64):
            with self.assertRaises(ValueError):
                rng.splitmix32u(bad)
        for bad in (1.5, 1.0, True, False, "1", None, b"1"):
            with self.assertRaises(TypeError):
                rng.splitmix32u(bad)  # type: ignore[arg-type]
        self.assertEqual(rng.splitmix32u(0xFFFFFFFF)(), rng.splitmix32u(2**32 - 1)())

    def test_a_bound_is_a_plain_int(self) -> None:
        draw = rng.splitmix32u(1)
        for bad in (True, 2.0, "3", None):
            with self.assertRaises(TypeError):
                rng.below(draw, bad)  # type: ignore[arg-type]
        with self.assertRaises(ValueError):
            rng.below(draw, 0)

    def test_chance_with_a_share_that_is_a_bool_is_refused(self) -> None:
        with self.assertRaises(TypeError):
            rng.chance(rng.splitmix32u(1), True)  # type: ignore[arg-type]

    def test_weights_that_are_not_whole_numbers_are_refused(self) -> None:
        with self.assertRaises(TypeError):
            rng.weighted(rng.splitmix32u(1), [1.0, 2.0])  # type: ignore[list-item]

    def test_the_input_of_shuffle_is_not_changed(self) -> None:
        items = list(range(10))
        shuffled = rng.shuffle(rng.splitmix32u(5), items)
        self.assertEqual(items, list(range(10)))
        self.assertEqual(sorted(shuffled), items)
        self.assertNotEqual(shuffled, items)

    def test_a_draw_is_always_below_2_to_the_32(self) -> None:
        next_draw = rng.splitmix32u(0xDEADBEEF)
        draws = [next_draw() for _ in range(2000)]
        self.assertTrue(all(0 <= draw < 2**32 for draw in draws))
        self.assertTrue(any(draw >= 2**31 for draw in draws))


if __name__ == "__main__":
    unittest.main()
