"""SHA-256, and the bytes that an artifact is hashed over (ARCHITECTURE section 8.5 rule 3, section 9.6 and section 9.8).

A bundle carries each artifact in one of three encodings (packages/schema/bundle.ts), and the receipt lists the SHA-256 of the artifact's
canonical bytes:
  - `json`: any JSON value, hashed as the UTF-8 bytes of its canonical JSON (canonical.py). A trace travels this way, as `trace@1` in columns.
  - `text`: a string, hashed as its UTF-8 bytes with its line endings as they are. A log or a patch travels this way. A lone surrogate has no
    UTF-8 form and is refused, where JavaScript's `TextEncoder` would write U+FFFD in its place.
  - `base64`: a string of standard base64 with its padding, no line break and no other character, hashed as the bytes it decodes to. Python's
    `base64.b64decode` skips a character outside the alphabet unless it is asked to validate, so the form is checked here first.
`schemas/vectors/sha256.json` holds a case of each, and tests/test_hashing.py runs every one of them.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
from typing import Any, Literal

from .canonical import canonical_bytes

__all__ = ["ENCODINGS", "Encoding", "artifact_bytes", "artifact_sha256", "has_lone_surrogate", "is_strict_base64", "sha256_hex"]

Encoding = Literal["json", "text", "base64"]

#: How an artifact's data is written in a bundle (packages/schema/bundle.ts, BUNDLE_ENCODINGS).
ENCODINGS: tuple[Encoding, ...] = ("json", "text", "base64")

_BASE64_ALPHABET = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def sha256_hex(data: bytes) -> str:
    """The SHA-256 of `data` as 64 lower-case hex digits."""
    return hashlib.sha256(data).hexdigest()


def has_lone_surrogate(text: str) -> bool:
    """Whether `text` holds a surrogate code point that is not half of a pair, which has no UTF-8 form.

    A Python string holds code points, so a surrogate pair that arrived as two escapes in JSON text has already been joined into one
    character by the parser, and any surrogate that is still in the string is alone.
    """
    try:
        text.encode("utf-8")
    except UnicodeEncodeError:
        return True
    return False


def is_strict_base64(text: str) -> bool:
    """Whether `text` is standard base64 with its padding: a multiple of 4 characters of A-Z, a-z, 0-9, + and /, then at most two `=`, and nothing else."""
    if len(text) % 4 != 0:
        return False
    try:
        raw = text.encode("ascii")
    except UnicodeEncodeError:
        return False
    pad = 2 if raw.endswith(b"==") else 1 if raw.endswith(b"=") else 0
    # Deleting every character of the alphabet leaves nothing exactly when the body is made of them.
    return raw[: len(raw) - pad].translate(None, _BASE64_ALPHABET) == b""


def artifact_bytes(encoding: str, data: Any) -> bytes:
    """The canonical bytes of an artifact written as `data` in `encoding`, or a `ValueError` when it has none."""
    if encoding == "json":
        return canonical_bytes(data)
    if encoding not in ("text", "base64"):
        raise ValueError(f"an artifact is written as json, text or base64, not {encoding!r}")
    if not isinstance(data, str):
        raise ValueError(f"a {encoding} artifact holds a string, got {type(data).__name__}")
    if encoding == "text":
        if has_lone_surrogate(data):
            raise ValueError("a lone surrogate has no UTF-8 form")
        return data.encode("utf-8")
    if not is_strict_base64(data):
        raise ValueError("not standard base64 with its padding")
    try:
        return base64.b64decode(data.encode("ascii"))
    except binascii.Error as error:  # pragma: no cover - the form was checked above
        raise ValueError(f"not standard base64: {error}") from None


def artifact_sha256(encoding: str, data: Any) -> str:
    """The SHA-256 of an artifact's canonical bytes: the hash that the receipt lists for it."""
    return sha256_hex(artifact_bytes(encoding, data))
