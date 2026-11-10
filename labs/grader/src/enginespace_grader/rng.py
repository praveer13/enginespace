"""The site's seeded generator, ported (ARCHITECTURE section 5.1 and section 9.8).

A stage derives every seeded input from its challenge token with the generators that the site uses, so that the grader and the browser agree
on the prompts, the arrival schedule, the op streams and the draft lengths without either sending the other a byte. The TypeScript side is
packages/sim/core/rng.ts over kernelspace's `splitmix32u` and `hash32` (vendor/kernelspace/src/lib/rng.ts), and `schemas/vectors/rng.json` and
`subseed.json` hold what it does as vectors. tests/test_rng.py and tests/test_subseed.py run every one of them.

What the port has to get right, and the vectors check:
  - JavaScript wraps its arithmetic to 32 bits with `| 0` and `Math.imul`, and Python's integers do not wrap, so every step below is taken
    modulo 2**32.
  - How many draws of the stream a call takes, not only what it returns. `below(n)` redraws when a draw falls in the biased tail, and past
    2**32 an attempt takes two draws. A port that takes a different number of draws gives the right answer once and the wrong one at the next call.
  - A number that JavaScript would quietly round, or alias, is refused here: a seed outside 0 to 2**32 - 1, a bound that is not a whole number
    below 2**53, a salt that is not ASCII. Python raises `ValueError`, and `TypeError` for a value of the wrong type, where TypeScript raises
    `RangeError`.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import TypeGuard, TypeVar

__all__ = [
    "MASK32",
    "TWO_32",
    "TWO_53",
    "Rng",
    "assert_seed",
    "below",
    "between",
    "chance",
    "hash32",
    "pick",
    "rng_for",
    "shuffle",
    "splitmix32",
    "splitmix32u",
    "weighted",
]

T = TypeVar("T")

#: A stream of unsigned 32-bit integers: one call, one draw.
Rng = Callable[[], int]

MASK32 = 0xFFFF_FFFF
TWO_32 = 1 << 32
TWO_53 = 1 << 53
#: JavaScript's Number.MAX_SAFE_INTEGER, the largest whole number that the site can hold exactly.
MAX_SAFE = TWO_53 - 1


def _whole(value: object) -> TypeGuard[int]:
    """Whether `value` is a Python int, which is not a bool and not a float that happens to be whole."""
    return type(value) is int


def assert_seed(seed: object) -> int:
    """`seed` as an int, or an error unless it is an unsigned 32-bit integer: a larger or negative one would alias a smaller seed."""
    if not _whole(seed):
        raise TypeError(f"a seed is an unsigned 32-bit integer, got {seed!r}")
    if seed < 0 or seed >= TWO_32:
        raise ValueError(f"a seed is an unsigned 32-bit integer, got {seed}")
    return seed


def splitmix32u(seed: int) -> Rng:
    """kernelspace's splitmix32 as raw unsigned 32-bit draws: the stream of `seed`.

    Before each draw the state moves on by 0x9e3779b9; the draw is that state put through two multiplications and three xor-shifts.
    """
    state = assert_seed(seed)

    def draw() -> int:
        nonlocal state
        state = (state + 0x9E3779B9) & MASK32
        t = state ^ (state >> 16)
        t = (t * 0x21F0AAAD) & MASK32
        t ^= t >> 15
        t = (t * 0x735A2D97) & MASK32
        t ^= t >> 15
        return t

    return draw


def splitmix32(seed: int) -> Callable[[], float]:
    """kernelspace's float stream: each value is a draw of `splitmix32u` divided by 2**32, which is exact in a double, so it is in [0, 1).

    The grader's own draws are whole numbers (`below` and the functions built on it), because a float scaled to a range is biased for most ranges
    (ARCHITECTURE section 5.1). This is here because schemas/vectors/rng.json names the stream, and a port should show that it agrees.
    """
    draw = splitmix32u(seed)
    return lambda: draw() / TWO_32


def hash32(text: str) -> int:
    """FNV-1a over the UTF-16 code units of `text`, 32 bits: kernelspace's `hash32`.

    For ASCII text, which every token and every salt is, that is the ordinary byte-wise FNV-1a. The contract covers ASCII only
    (schemas/vectors/subseed.json), and for anything else this reads the code units as JavaScript's `charCodeAt` does, so the two agree
    there as well.
    """
    if not isinstance(text, str):
        raise TypeError(f"hash32 takes text, got {text!r}")
    h = 0x811C9DC5
    units = text.encode("utf-16-le", "surrogatepass")
    for i in range(0, len(units), 2):
        h ^= units[i] | (units[i + 1] << 8)
        h = (h * 0x01000193) & MASK32
    return h


def rng_for(seed: int, salt: str) -> Rng:
    """The sub-stream of `seed` named `salt`: `splitmix32u(seed xor hash32(salt))`.

    Give each purpose its own salt, such as `workload/arrivals`, so that adding a draw to one purpose never moves the draws of another.
    A salt is ASCII, because only there is the hash over code units the hash over bytes that any language computes.
    """
    seed = assert_seed(seed)
    if not isinstance(salt, str):
        raise TypeError(f"a salt is text, got {salt!r}")
    if any(ord(char) > 0x7F for char in salt):
        raise ValueError(f"a salt is ASCII, got {salt!r}")
    return splitmix32u(seed ^ hash32(salt))


def below(rng: Rng, n: int) -> int:
    """An integer in [0, n) without bias, for 1 <= n <= 2**53 - 1.

    For n up to 2**32 it draws one value x and returns x mod n, drawing again while x is at or above 2**32 - (2**32 mod n), the largest
    multiple of n that fits. For larger n each attempt takes two draws: the top 21 bits of the first, times 2**32, plus the second draw, as
    one 53-bit number, thrown back the same way against 2**53. Every call takes at least one draw.
    """
    if not _whole(n):
        raise TypeError(f"below(n) needs a whole number, got {n!r}")
    if n < 1 or n > MAX_SAFE:
        raise ValueError(f"below(n) needs an integer from 1 to 2**53 - 1, got {n}")
    if n <= TWO_32:
        limit = TWO_32 - (TWO_32 % n)
        while True:
            x = rng()
            if x < limit:
                return x % n
    limit = TWO_53 - (TWO_53 % n)
    while True:
        high = rng() >> 11
        low = rng()
        x = high * TWO_32 + low
        if x < limit:
            return x % n


def between(rng: Rng, lo: int, hi: int) -> int:
    """An integer in [lo, hi], both ends included: `lo + below(hi - lo + 1)`."""
    if not _whole(lo) or not _whole(hi):
        raise TypeError(f"between(lo, hi) needs whole numbers, got {lo!r} and {hi!r}")
    if abs(lo) > MAX_SAFE or abs(hi) > MAX_SAFE or lo > hi:
        raise ValueError(f"between(lo, hi) needs integers below 2**53 with lo <= hi, got {lo} and {hi}")
    return lo + below(rng, hi - lo + 1)


def chance(rng: Rng, permille: int) -> bool:
    """True with probability permille / 1000. It draws `below(1000)` whatever the share is, so a share of 0 or 1000 leaves later draws where they were."""
    if not _whole(permille):
        raise TypeError(f"a share is a whole number of permille, got {permille!r}")
    if permille < 0 or permille > 1000:
        raise ValueError(f"a share is an integer from 0 to 1000 permille, got {permille}")
    return below(rng, 1000) < permille


def pick(rng: Rng, items: Sequence[T]) -> T:
    """One item of a non-empty list, uniformly: `items[below(len(items))]`."""
    if len(items) == 0:
        raise ValueError("pick from an empty list")
    return items[below(rng, len(items))]


def weighted(rng: Rng, weights: Sequence[int]) -> int:
    """An index with probability weights[i] / sum(weights), for whole non-negative weights with a positive total.

    Draw r = below(total), then walk the weights and take the first index whose running total passes r. A weight of 0 is never chosen.
    """
    total = 0
    for weight in weights:
        if not _whole(weight):
            raise TypeError(f"a weight is a whole number, got {weight!r}")
        if weight < 0:
            raise ValueError(f"a weight is a non-negative integer, got {weight}")
        total += weight
        if total > MAX_SAFE:
            raise ValueError("the weights add up beyond 2**53")
    if total == 0:
        raise ValueError("the weights add up to 0, so nothing can be chosen")
    r = below(rng, total)
    for index, weight in enumerate(weights):
        if r < weight:
            return index
        r -= weight
    raise AssertionError("unreachable: r < total")


def shuffle(rng: Rng, items: Sequence[T]) -> list[T]:
    """A shuffled copy (Fisher-Yates): for i from n - 1 down to 1, swap item i with item `below(i + 1)`."""
    out = list(items)
    for i in range(len(out) - 1, 0, -1):
        j = below(rng, i + 1)
        out[i], out[j] = out[j], out[i]
    return out
