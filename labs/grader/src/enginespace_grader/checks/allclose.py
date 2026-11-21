"""Is one array of numbers within a bound of another, at every element: the check that TR0's stages make against Hugging Face's fp32 output.

The finding is the largest absolute difference, and not a mean or a relative one: a wrong epsilon moves a few elements a lot, and a mean hides them. An element that is
not a number (NaN) in either array fails the check at once, because `abs(nan - x) <= bound` is false and a maximum that skips it would pass the very run that broke.
Two arrays of different shapes are not close: the check fails and says both shapes.

The arrays are whatever has the interface of a torch tensor (`.shape`, `.detach()`, `.double()`, `.reshape(-1)`, `.isnan()`, `.any()`, `.abs()`, `.max()` and
`.item()`), or nested lists of numbers. The second needs no torch, which is how the tests of this module run in the grader's own environment.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from ..receipt import make_check

__all__ = ["Difference", "allclose_check", "max_abs_difference"]


@dataclass(frozen=True)
class Difference:
    """What comparing two arrays found."""

    #: The largest absolute difference, or None when the arrays could not be compared (different shapes, or a NaN).
    worst: float | None
    #: How many elements were compared.
    count: int
    #: Why they could not be compared, or an empty string.
    problem: str = ""


def _shape_of(value: Any) -> tuple[int, ...]:
    shape = getattr(value, "shape", None)
    if shape is not None:
        return tuple(int(size) for size in shape)
    if isinstance(value, (int, float)):
        return ()
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        if len(value) == 0:
            return (0,)
        inner = {_shape_of(item) for item in value}
        if len(inner) != 1:
            raise ValueError("a nested list whose rows differ in length")
        return (len(value), *inner.pop())
    raise ValueError(f"{type(value).__name__} is not an array of numbers")


def _flat(value: Any) -> list[float]:
    if isinstance(value, (int, float)):
        return [float(value)]
    return [number for item in value for number in _flat(item)]


def max_abs_difference(actual: Any, expected: Any) -> Difference:
    """The largest `abs(actual - expected)` over the elements, as a `Difference`."""
    try:
        shapes = (_shape_of(actual), _shape_of(expected))
    except ValueError as error:
        return Difference(None, 0, str(error))
    if shapes[0] != shapes[1]:
        return Difference(None, 0, f"the shapes differ: {list(shapes[0])} against the reference's {list(shapes[1])}")
    count = math.prod(shapes[0])
    if count == 0:
        return Difference(None, 0, "there is nothing to compare: the arrays are empty")
    if hasattr(actual, "detach") and hasattr(expected, "detach"):
        gap = (actual.detach().double() - expected.detach().double()).reshape(-1)
        if bool(gap.isnan().any().item()) or bool(actual.detach().double().reshape(-1).isinf().any().item()):
            return Difference(None, count, "the output holds a NaN or an infinite number")
        return Difference(float(gap.abs().max().item()), count)
    left, right = _flat(actual), _flat(expected)
    if any(math.isnan(number) or math.isinf(number) for number in left):
        return Difference(None, count, "the output holds a NaN or an infinite number")
    return Difference(max(abs(a - b) for a, b in zip(left, right)), count)


def allclose_check(check_id: str, actual: Any, expected: Any, bound: float, *, what: str) -> dict[str, Any]:
    """The receipt's check that `actual` is within `bound` of `expected` at every element, with the worst difference as its `value`.

    `what` names the thing compared, as a sentence's subject: "the logits". The detail says the worst difference, the bound and how many elements were compared, or why they
    could not be. The check's kind is `correctness`, which the site shows as attested by this grader.
    """
    found = max_abs_difference(actual, expected)
    if found.worst is None:
        return make_check(check_id, "correctness", False, bound=bound, n=found.count, detail=f"{what}: {found.problem}")
    passed = found.worst <= bound
    verdict = "within" if passed else "beyond"
    return make_check(
        check_id,
        "correctness",
        passed,
        value=found.worst,
        bound=bound,
        n=found.count,
        detail=f"{what}: the largest absolute difference is {found.worst:.3e}, {verdict} the bound {bound:.0e}, over {found.count} elements",
    )
