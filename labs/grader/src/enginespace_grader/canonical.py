"""Canonical JSON (ARCHITECTURE section 9.8): one text for one value, so that a hash of it means the same on the grader and in the browser.

A receipt's hash, an artifact's hash and a trace's hash are each the SHA-256 of a canonical text, so the grader has to write the very bytes
that the site does. The TypeScript side is `canonicalJson` in packages/sim/core/json.ts, and `schemas/vectors/canonical.json` holds what it
writes, and what it refuses, as vectors. tests/test_canonical.py runs every one of them.

The form is RFC 8785 for the values that this project writes:
  - no white space;
  - the members of an object sorted by the UTF-16 code units of the key. Python's `sorted()` on text sorts by code point, which differs for
    a character outside the Basic Multilingual Plane next to one at the top of the plane, so this sorts by the key's UTF-16 bytes;
  - strings as `JSON.stringify` writes them: `\\"`, `\\\\`, `\\b`, `\\f`, `\\n`, `\\r` and `\\t`, `\\u00xx` in lower-case hex for the other control
    characters, and every other character, DEL and the line separators included, as itself in UTF-8;
  - a number as ECMAScript's `Number.prototype.toString` writes it. A whole number is an integer, with no fraction and no exponent, and
    -0 is 0. Any other number is the shortest digits that read back as the same double, written without an exponent from 0.000001 up and
    as `1e-7` below. Python's `repr` and `json.dumps` write `1e-07` and `1.0`, so neither is used for a number.

It is strict where `json.dumps` is forgiving, because a difference that nobody sees is a hash that differs on another machine. It refuses
  - NaN and the infinities;
  - a whole number of 2**53 or more in size, whether Python holds it as an int (exact) or as a float. JavaScript rounds such a number
    and Python keeps it, so the two would hash different texts (ARCHITECTURE section 5.1: every value stays below 2**53);
  - a string or a key with a lone surrogate, which has no UTF-8 form;
  - a dict key that is not text, and any value that JSON has no word for (bytes, a set, a Decimal).
The walk uses a stack of its own, so a deeply nested document is a long text and never a RecursionError.
"""

from __future__ import annotations

import json
import json.encoder
import math
from collections.abc import Iterator
from typing import Any

__all__ = ["CanonicalError", "MAX_SAFE_INTEGER", "canonical_bytes", "canonical_json", "format_float", "parse_json"]

#: JavaScript's Number.MAX_SAFE_INTEGER: a whole number beyond it has no canonical form.
MAX_SAFE_INTEGER = (1 << 53) - 1

_encode_string = json.encoder.encode_basestring


class CanonicalError(ValueError):
    """A value has no canonical form. `path` says where, as `$.a[3].b`, and `parts` is the same place as a list of keys and indexes."""

    def __init__(self, path: str, message: str, parts: tuple[str | int, ...] = ()) -> None:
        super().__init__(f"{path}: {message}")
        self.path = path
        self.reason = message
        self.parts = parts


def parse_json(text: str) -> Any:
    """Parse a JSON text as strictly as the browser's parser does.

    Python's `json.loads` takes `NaN`, `Infinity` and `-Infinity`, which JSON does not have and `JSON.parse` refuses. Everything else it
    reads as JavaScript does: a repeated key keeps its last value, a number with an exponent is a float, and a whole number of any size is
    an exact int (so it is refused later, by `canonical_json`, where JavaScript would have rounded it first).
    """

    def refuse(name: str) -> Any:
        raise ValueError(f"{name} is not JSON")

    return json.loads(text, parse_constant=refuse)


def format_float(x: float) -> str:
    """A finite double as ECMAScript's `Number.prototype.toString` writes it (ECMA-262 section 6.1.6.1.20).

    With the shortest digits s (k of them) and the exponent n such that the number is 0.s x 10**n:
      k <= n <= 21     the digits, then n - k zeros
      0 < n <= 21      the first n digits, a point, then the rest
      -6 < n <= 0      "0.", then -n zeros, then the digits
      otherwise        one digit, a point and the rest if there are more, then "e", a sign and n - 1
    """
    if x != x or x in (math.inf, -math.inf):
        raise ValueError(f"{x} has no JSON form")
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    # repr() of a float gives the shortest digits that read back as the same double, in Python's layout: 1e-07, 1.5, 1e+16, 123456789.123.
    text = repr(abs(x))
    mantissa, _, exponent = text.partition("e")
    whole, _, fraction = mantissa.partition(".")
    all_digits = whole + fraction
    significant = all_digits.lstrip("0")
    leading_zeros = len(all_digits) - len(significant)
    digits = significant.rstrip("0")
    k = len(digits)
    n = len(whole) + (int(exponent) if exponent else 0) - leading_zeros
    if k <= n <= 21:
        body = digits + "0" * (n - k)
    elif 0 < n <= 21:
        body = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        body = "0." + "0" * -n + digits
    else:
        shift = n - 1
        tail = f"e{'+' if shift >= 0 else '-'}{abs(shift)}"
        body = digits[0] + ("." + digits[1:] if k > 1 else "") + tail
    return sign + body


class _Refusal(Exception):
    """Why a scalar has no canonical form. The walk adds where it was."""


def _number(value: int | float) -> str:
    if type(value) is int:
        if value > MAX_SAFE_INTEGER or value < -MAX_SAFE_INTEGER:
            raise _Refusal(f"the integer {value} is beyond 2**53")
        return str(value)
    if not math.isfinite(value):
        raise _Refusal(f"{value} has no JSON form")
    if value.is_integer():
        if abs(value) > MAX_SAFE_INTEGER:
            raise _Refusal(f"the integer {format(value, '.0f')} is beyond 2**53")
        return str(int(value))
    return format_float(value)


def _text(value: str) -> str:
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise _Refusal("a lone surrogate has no UTF-8 form") from None
    return _encode_string(value)


def _utf16_key(key: str) -> bytes:
    # Big-endian code units compare, byte by byte, as the units themselves do, and a shorter prefix sorts first, as `<` on strings does.
    return key.encode("utf-16-be", "surrogatepass")


class _Frame:
    """A container being written: where it has got to, so that an error can name the place and the walk can come back to it."""

    __slots__ = ("close", "first", "items", "part")

    def __init__(self, close: str, items: Iterator[tuple[str | int, Any]]) -> None:
        self.close = close
        self.items = items
        self.first = True
        self.part: str | int = ""


def _where(stack: list[_Frame]) -> str:
    return "$" + "".join((f".{frame.part}" if frame.close == "}" else f"[{frame.part}]") for frame in stack)


def _parts(stack: list[_Frame]) -> tuple[str | int, ...]:
    return tuple(frame.part for frame in stack)


def _array_members(items: Any) -> Iterator[tuple[str | int, Any]]:
    yield from enumerate(items)


def _object_members(container: dict[str, Any], keys: list[str]) -> Iterator[tuple[str | int, Any]]:
    for key in keys:
        yield key, container[key]


def canonical_json(value: Any) -> str:
    """The canonical JSON text of `value`. Hash its UTF-8 bytes (`canonical_bytes`)."""
    out: list[str] = []
    emit = out.append
    stack: list[_Frame] = []
    current = value
    try:
        while True:
            # Write `current`: a scalar in one piece, a container as its opening and a frame to walk it by.
            kind = type(current)
            if current is None:
                emit("null")
            elif current is True:
                emit("true")
            elif current is False:
                emit("false")
            elif kind is str:
                emit(_text(current))
            elif kind is int or kind is float:
                emit(_number(current))
            elif kind is list or kind is tuple:
                if not current:
                    emit("[]")
                elif kind is list and set(map(type, current)) == {int}:
                    # The common big case, the columns of a trace: write the numbers without a frame for each.
                    if max(current) > MAX_SAFE_INTEGER or min(current) < -MAX_SAFE_INTEGER:
                        for index, number in enumerate(current):
                            try:
                                _number(number)
                            except _Refusal as refusal:
                                raise CanonicalError(f"{_where(stack)}[{index}]", str(refusal), (*_parts(stack), index)) from None
                    emit("[" + ",".join(map(str, current)) + "]")
                else:
                    emit("[")
                    stack.append(_Frame("]", _array_members(current)))
            elif kind is dict:
                if not current:
                    emit("{}")
                else:
                    for key in current:
                        if type(key) is not str:
                            raise _Refusal(f"the key {key!r} is not text")
                    keys = list(current)
                    ordered = sorted(keys) if "".join(keys).isascii() else sorted(keys, key=_utf16_key)
                    emit("{")
                    stack.append(_Frame("}", _object_members(current, ordered)))
            else:
                raise _Refusal(f"a {kind.__name__} has no JSON form")

            # Find the next value to write: the next member of the innermost open container, closing the ones that are used up.
            while stack:
                frame = stack[-1]
                member = next(frame.items, None)
                if member is None:
                    stack.pop()
                    emit(frame.close)
                    continue
                frame.part, current = member
                if frame.close == "}":
                    emit(("" if frame.first else ",") + _text(str(frame.part)) + ":")
                elif not frame.first:
                    emit(",")
                frame.first = False
                break
            else:
                return "".join(out)
    except _Refusal as refusal:
        raise CanonicalError(_where(stack), str(refusal), _parts(stack)) from None


def canonical_bytes(value: Any) -> bytes:
    """The UTF-8 bytes of the canonical text of `value`: what a hash is taken over."""
    return canonical_json(value).encode("utf-8")
