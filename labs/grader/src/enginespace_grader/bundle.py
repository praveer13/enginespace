"""The bundle (ARCHITECTURE section 9.6, D-029): one receipt and the raw artifacts it hashes, as one gzipped JSON file, `.es.json.gz`.

    {"schema": "enginespace/bundle@1", "receipt": {...}, "artifacts": {"<id>": {"encoding": "json" | "text" | "base64", "data": ...}}}

Python's `gzip` writes the file and the browser's `DecompressionStream('gzip')` reads it, so no archive library is needed on either side. The
artifacts of the bundle are those that the receipt lists with `inBundle: true`, no more and no fewer. A capture too large for the caps is listed by its
hash and size with `inBundle: false`, and the learner keeps the file.

An artifact's hash is over its canonical bytes (hashing.py): the UTF-8 of its canonical JSON for `json`, of its text for `text`, and the decoded bytes
for `base64`. The receipt lists each artifact's SHA-256 and byte count, so the site can tell an artifact that was edited after the run.

Writing is deterministic: the same bundle gives the same bytes (no file name or time in the gzip header, the members in the receipt's order), and the
file appears whole or not at all.
"""

from __future__ import annotations

import base64
import gzip
import json
import os
import stat
import tempfile
import zlib
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .canonical import parse_json
from .errors import GraderError
from .hashing import ENCODINGS, artifact_bytes, has_lone_surrogate, is_strict_base64, sha256_hex
from .receipt import receipt_rule_problems, receipt_sha256
from .schemas import schema_problems

__all__ = [
    "BUNDLE_SCHEMA_TAG",
    "MAX_COMPRESSED_BYTES",
    "MAX_DECOMPRESSED_BYTES",
    "Artifact",
    "BundleRead",
    "BundleReadError",
    "BundleStats",
    "bundle_problems",
    "build_bundle",
    "gunzip_capped",
    "integrity_problems",
    "read_bundle",
    "write_bundle",
]

#: The `schema` of every bundle.
BUNDLE_SCHEMA_TAG = "enginespace/bundle@1"

#: ARCHITECTURE section 8.5 rule 1 [estimated]: the largest bundle the site reads, as the file and as the bytes inside it.
MAX_COMPRESSED_BYTES = 32 * 1024 * 1024
MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024


class BundleReadError(GraderError):
    """A file that is not a bundle the site would read. `rule` is the rule of ARCHITECTURE section 8.5 that it breaks: 1 for the caps and the gzip, 2 for the JSON."""

    def __init__(self, rule: int, message: str) -> None:
        super().__init__(message)
        self.rule = rule


@dataclass(frozen=True)
class Artifact:
    """One artifact of a stage, as a lab hands it over: its data, or only its hash and size when the data stays with the learner."""

    id: str
    kind: str
    format: str
    encoding: str | None = None
    data: Any = None
    sha256: str | None = None
    size: int | None = None
    in_bundle: bool = True

    @classmethod
    def from_json(cls, artifact_id: str, kind: str, format: str, data: Any) -> Artifact:
        """A JSON value, hashed as its canonical text. A trace travels this way."""
        return cls(artifact_id, kind, format, "json", data)

    @classmethod
    def from_text(cls, artifact_id: str, kind: str, format: str, data: str) -> Artifact:
        """Text, hashed as its UTF-8 bytes with its line endings as they are. A log or a patch travels this way."""
        return cls(artifact_id, kind, format, "text", data)

    @classmethod
    def from_bytes(cls, artifact_id: str, kind: str, format: str, data: bytes) -> Artifact:
        """Bytes, carried as standard base64 and hashed as the bytes."""
        return cls(artifact_id, kind, format, "base64", base64.b64encode(data).decode("ascii"))

    @classmethod
    def kept(cls, artifact_id: str, kind: str, format: str, sha256: str, size: int) -> Artifact:
        """A capture that is too large to travel: listed by its hash and size, and kept by the learner."""
        return cls(artifact_id, kind, format, None, None, sha256, size, in_bundle=False)

    def canonical(self) -> bytes | None:
        """The bytes the artifact is hashed over, or None for one that is kept."""
        if not self.in_bundle:
            return None
        if self.encoding not in ENCODINGS:
            raise ValueError(f"artifact {self.id!r}: an artifact that travels is written as json, text or base64, not {self.encoding!r}")
        try:
            return artifact_bytes(self.encoding, self.data)
        except ValueError as error:
            raise ValueError(f"artifact {self.id!r}: {error}") from None

    def entry(self) -> dict[str, Any]:
        """The artifact's line in the receipt's `artifacts`: its hash and byte count, computed from the data so that they cannot disagree with it."""
        content = self.canonical()
        if content is None:
            if self.sha256 is None or self.size is None:
                raise ValueError(f"artifact {self.id!r} stays with the learner, so it needs its sha256 and size")
            return {"id": self.id, "kind": self.kind, "format": self.format, "sha256": self.sha256, "bytes": self.size, "inBundle": False}
        return {"id": self.id, "kind": self.kind, "format": self.format, "sha256": sha256_hex(content), "bytes": len(content), "inBundle": True}


def build_bundle(receipt: Mapping[str, Any], artifacts: Sequence[Artifact]) -> dict[str, Any]:
    """A bundle@1 of a receipt and the artifacts that it lists as travelling, in the receipt's order."""
    by_id = {artifact.id: artifact for artifact in artifacts}
    travelling: dict[str, Any] = {}
    for listed in receipt["artifacts"]:
        if not listed["inBundle"]:
            continue
        artifact = by_id.get(listed["id"])
        if artifact is None:
            raise ValueError(f"the receipt lists artifact {listed['id']!r} as in the bundle, and the stage made none")
        travelling[artifact.id] = {"encoding": artifact.encoding, "data": artifact.data}
    return {"schema": BUNDLE_SCHEMA_TAG, "receipt": dict(receipt), "artifacts": travelling}


def _name(text: object) -> str:
    """An artifact's name as a message quotes it: cut short, because it came out of a file that someone else wrote."""
    shown = str(text)
    return shown if len(shown) <= 64 else shown[:61] + "..."


# What stands in for an artifact's data while the schema reads the rest of the bundle. A text or base64 artifact can run to megabytes, and the
# data of one is checked by a loop of its own (hashing.py), which is how the site checks it too, so the schema's pattern need not run over it.
_STAND_IN: dict[str, Any] = {"json": None, "text": "", "base64": ""}


def bundle_problems(bundle: Any) -> list[str]:
    """Everything that is wrong with `bundle` as a bundle@1, beyond what rule 3 hashes: the schema, the rules JSON Schema cannot say, and the artifacts' own forms."""
    problems: list[str] = []
    view: Any = bundle
    artifacts: Mapping[str, Any] | None = None
    if isinstance(bundle, Mapping) and isinstance(bundle.get("artifacts"), Mapping):
        artifacts = bundle["artifacts"]
        stood_in: dict[str, Any] = {}
        for name, entry in artifacts.items():
            if isinstance(entry, Mapping) and set(entry) == {"encoding", "data"} and entry["encoding"] in ENCODINGS:
                if entry["encoding"] != "json" and not isinstance(entry["data"], str):
                    problems.append(f"/artifacts/{_name(name)}/data: a {entry['encoding']} artifact holds a string")
                stood_in[name] = {"encoding": entry["encoding"], "data": _STAND_IN[entry["encoding"]]}
                continue
            stood_in[name] = {"encoding": "json", "data": None}
            if not isinstance(entry, Mapping):
                problems.append(f"/artifacts/{_name(name)}: must be an object with an encoding and its data")
            elif set(entry) != {"encoding", "data"}:
                problems.append(f"/artifacts/{_name(name)}: must have exactly the keys encoding and data, and has {_name(', '.join(sorted(map(str, entry))) or 'none')}")
            else:
                problems.append(f"/artifacts/{_name(name)}/encoding: must be one of {', '.join(ENCODINGS)}")
        view = {**bundle, "artifacts": stood_in}
    problems += schema_problems("bundle", view)
    if problems or not isinstance(bundle, Mapping) or artifacts is None:
        return problems
    problems += receipt_rule_problems(bundle["receipt"])
    listed = {entry["id"] for entry in bundle["receipt"]["artifacts"] if entry["inBundle"]}
    for position, entry in enumerate(bundle["receipt"]["artifacts"]):
        if entry["inBundle"] and entry["id"] not in artifacts:
            problems.append(f'/receipt/artifacts/{position}/inBundle: artifact "{_name(entry["id"])}" is listed as in the bundle, and the bundle has no data for it')
    for name in artifacts:
        if name not in listed:
            problems.append(f'/artifacts/{_name(name)}: the bundle holds data for "{_name(name)}", which the receipt does not list as in the bundle')
    for name, entry in artifacts.items():
        # The forms that the bundle schema's refinements check. A JSON artifact has none: whether it has a canonical text is found when it is hashed (rule 3).
        if entry["encoding"] == "base64" and not is_strict_base64(entry["data"]):
            problems.append(f"/artifacts/{_name(name)}/data: must be standard base64 with its padding")
        elif entry["encoding"] == "text" and has_lone_surrogate(entry["data"]):
            problems.append(f"/artifacts/{_name(name)}/data: must not hold a lone surrogate, which has no UTF-8 form")
    return problems


def integrity_problems(bundle: Mapping[str, Any]) -> list[str]:
    """Rule 3 of ARCHITECTURE section 8.5: the SHA-256 and the byte count of every artifact in the bundle must equal the receipt's entry. A problem names the artifact."""
    problems: list[str] = []
    for entry in bundle["receipt"]["artifacts"]:
        if not entry["inBundle"]:
            continue
        found = bundle["artifacts"][entry["id"]]
        try:
            content = artifact_bytes(found["encoding"], found["data"])
        except ValueError as error:
            problems.append(f'artifact "{entry["id"]}": its data has no canonical bytes to hash ({error})')
            continue
        digest = sha256_hex(content)
        if digest != entry["sha256"]:
            problems.append(f'artifact "{entry["id"]}": its data in the bundle hashes to {digest}, and the receipt lists {entry["sha256"]}')
        if len(content) != entry["bytes"]:
            problems.append(f'artifact "{entry["id"]}": its data in the bundle is {len(content)} bytes, and the receipt lists {entry["bytes"]}')
    return problems


@dataclass(frozen=True)
class BundleStats:
    path: Path
    compressed_bytes: int
    decompressed_bytes: int
    receipt_sha256: str


def _chunks(bundle: Mapping[str, Any]) -> Iterator[bytes]:
    """The bundle's JSON text in pieces: the envelope, the receipt, and then each artifact on its own, so that no more than one artifact is ever written twice in memory."""
    dump = json.dumps
    yield b'{"schema":' + dump(bundle["schema"], ensure_ascii=False).encode("utf-8")
    yield b',"receipt":' + dump(bundle["receipt"], ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    yield b',"artifacts":{'
    first = True
    for name, entry in bundle["artifacts"].items():
        head = (b"" if first else b",") + dump(name, ensure_ascii=False).encode("utf-8") + b':{"encoding":' + dump(entry["encoding"]).encode("utf-8") + b',"data":'
        first = False
        yield head + dump(entry["data"], ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8") + b"}"
    yield b"}}"


def write_bundle(path: Path, bundle: Mapping[str, Any]) -> BundleStats:
    """Checks the bundle, and then writes it gzipped to `path`, atomically. It raises a `GraderError` that lists what is wrong with a bundle that the site would refuse."""
    problems = bundle_problems(bundle)
    if not problems:
        problems = integrity_problems(bundle)
    if problems:
        raise GraderError("the bundle would not pass the site's checks, and was not written:\n  " + "\n  ".join(problems))
    path = Path(path)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        handle, partial_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".partial")
    except OSError as error:
        raise GraderError(f"cannot write the bundle to {path.parent}: {error.strerror or error}. Choose another folder with --out") from None
    plain = 0

    def too_big(written: int | None) -> GraderError:
        size = f"more than {MAX_DECOMPRESSED_BYTES:,} bytes inside" if written is None else f"{written:,} bytes compressed and {plain:,} bytes inside"
        return GraderError(
            f"the bundle is {size}, and the site reads at most {MAX_COMPRESSED_BYTES:,} compressed and {MAX_DECOMPRESSED_BYTES:,} inside: "
            "list the largest artifact with inBundle false, by its hash and size, and keep the file"
        )

    try:
        with os.fdopen(handle, "wb") as raw:
            # An empty file name and a modification time of 0, so that the header names neither the machine's folders nor the moment.
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as packed:
                for piece in _chunks(bundle):
                    packed.write(piece)
                    plain += len(piece)
                    if plain > MAX_DECOMPRESSED_BYTES:
                        raise too_big(None)  # stop here: there is no use in compressing the rest of a file that the site will not read
        written = os.stat(partial_name).st_size
        if written > MAX_COMPRESSED_BYTES:
            raise too_big(written)
        os.chmod(partial_name, 0o644)
        os.replace(partial_name, path)
    except BaseException:
        if os.path.exists(partial_name):
            os.unlink(partial_name)
        raise
    return BundleStats(path, written, plain, receipt_sha256(bundle["receipt"]))


def gunzip_capped(compressed: bytes, limit: int = MAX_DECOMPRESSED_BYTES) -> bytes:
    """The bytes inside one gzip stream, stopping as soon as they pass `limit`: a zip bomb is a message and never a full disk or memory (rule 1).

    The stream must be one member, whole, with nothing after it, as `DecompressionStream('gzip')` reads it.
    """
    inflater = zlib.decompressobj(wbits=16 + zlib.MAX_WBITS)
    out: list[bytes] = []
    total = 0
    pending = compressed
    try:
        while pending:
            # At most one byte more than the room that is left, which is enough to know that the cap is passed.
            piece = inflater.decompress(pending, limit - total + 1)
            total += len(piece)
            if total > limit:
                raise BundleReadError(1, f"it holds more than the {limit:,} bytes that the site reads once decompressed (the cap of rule 1), so it stopped there")
            out.append(piece)
            if inflater.eof:
                break
            pending = inflater.unconsumed_tail
    except zlib.error as error:
        raise BundleReadError(1, f"the gzip data is damaged ({error})") from None
    if not inflater.eof:
        raise BundleReadError(1, "the gzip stream ends before it is complete: the file is cut short")
    if inflater.unused_data:
        raise BundleReadError(1, "there is data after the end of the gzip stream, which the site refuses")
    return b"".join(out)


@dataclass(frozen=True)
class BundleRead:
    """A bundle file read under the caps: the parsed document, and the two sizes that rule 1 counts."""

    document: Any
    compressed_bytes: int
    decompressed_bytes: int


def read_bundle(path: Path, *, max_compressed: int = MAX_COMPRESSED_BYTES, max_decompressed: int = MAX_DECOMPRESSED_BYTES) -> BundleRead:
    """Reads a `.es.json.gz` file under the caps of rule 1 and parses its JSON (rule 2's first step). Raises `BundleReadError`.

    The caps are the site's unless a test asks for smaller ones.
    """
    path = Path(path)
    status = path.stat()
    if not stat.S_ISREG(status.st_mode):
        raise BundleReadError(1, "it is not a file: a bundle is a .es.json.gz file, as `enginespace grade` writes it")
    size = status.st_size
    if size > max_compressed:
        raise BundleReadError(1, f"the file is {size:,} bytes, and the site reads at most {max_compressed:,} compressed (the cap of rule 1)")
    compressed = path.read_bytes()
    if compressed[:2] != b"\x1f\x8b":
        raise BundleReadError(1, "it is not a gzip file: a bundle is a .es.json.gz file, as `enginespace grade` writes it")
    plain = gunzip_capped(compressed, max_decompressed)
    if plain.startswith(b"\xef\xbb\xbf"):
        raise BundleReadError(2, "the text inside starts with a byte order mark, which JSON does not allow")
    try:
        text = plain.decode("utf-8")
    except UnicodeDecodeError as error:
        raise BundleReadError(2, f"the text inside is not UTF-8 (byte {error.start})") from None
    try:
        return BundleRead(parse_json(text), size, len(plain))
    except ValueError as error:
        raise BundleReadError(2, f"the text inside is not JSON: {error}") from None
    except RecursionError:
        raise BundleReadError(2, "the JSON inside is nested too deeply to read") from None
