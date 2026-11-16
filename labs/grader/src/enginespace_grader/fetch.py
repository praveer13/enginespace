"""`enginespace fetch <lab>` (ARCHITECTURE sections 9.4 and 9.7): download the large files that a lab pins, and keep only the bytes that hash to the pin.

The files are listed in the references manifest, `labs/references/manifest.json` (`enginespace/references@1`, packages/schema/references.ts): for each file its
name, kind, labs, cache path, URL, SHA-256, size, licence and the day those were checked. `fetch tr0.forward` downloads the entries that list the lab into the
cache, and the receipt records the same name, kind, revision, hash and size as one of its `inputs`, so a run on another model, dataset or prompt set shows.

The SHA-256 is the only trust. A file is in the cache because its bytes hashed to the manifest's pin, and a download that does not hash to it is not kept:
  - A download is written to a hidden file beside its destination, `.<name>.<first 16 digits of the pin>.part`, and moved to its place only when it matches (an
    atomic rename, which stays on one file system even when a learner has linked a folder of the cache to another disk), so the cache holds whole, checked
    files or nothing at that path. No manifest path can start with a dot, so no entry can be that file.
  - A hash mismatch stops the command, deletes the partial file and says so (`FetchMismatch`, exit status 1). So does a server that sends more bytes than the
    manifest pins, or whose file is shorter than the part already kept: nothing is kept that could be a wrong file. A server that announces another size, or
    answers a resume with another part of the file, also stops the command with `FetchMismatch` before a byte is written, and leaves a partial file as it was,
    because it is the answer that is wrong (a captive portal's page, say) and not what had arrived.
  - A download that stops (a dropped connection, a timeout, Ctrl-C) keeps its partial file. The next run sends `Range: bytes=<n>-` and goes on from the byte
    where it stopped. A server that ignores the range sends the whole file, and the download starts again. The hash of the whole file is checked either way,
    so a stale or damaged partial file ends in a mismatch and is deleted, and the run after that starts clean.
  - A file already in the cache is hashed again each time, so a file that was changed since is downloaded again, and a lab that asks for a file with
    `cached_file` never reads one that was altered.

What goes over the network, and what never does (ARCHITECTURE section 9.7, ASSESSMENT section 5.1):
  - A GET for each file, with the User-Agent `enginespace-grader/<version>` (`user_agent`) and the headers HTTP needs (Host, Accept-Encoding, Range). No
    cookie, no credential and no token: `HF_TOKEN` is never read. A learner's name, host or e-mail is in no header and no URL, because the URLs are the
    manifest's and the headers are these.
  - https only. The one exception is http to this machine itself (127.0.0.1, localhost or [::1]), which the tests use to serve a file from a folder and
    which no committed manifest uses. A redirect from https must stay on https, and a redirect to anything but http or https is refused.
  - Proxies named in the environment are used for the internet and never for loopback.

The cache is a folder of the learner's own: `--cache`, else ENGINESPACE_CACHE, else `enginespace/references` under XDG_CACHE_HOME, else under ~/.cache. It sits
outside the kit, so a new kit does not make a learner download a model again.

Exit status (cli.py): 0 every file is in the cache and matches; 1 a download did not match its pin; 2 a usage error; 3 it could not run (no manifest, a lab the
manifest does not list, no room on the disk, the server unreachable or refusing, a download that stopped: run it again to resume).
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from . import GRADER_NAME, __version__
from .canonical import parse_json
from .challenge import is_calendar_day
from .errors import GraderError
from .labs import is_stage_id, lab_of_stage_id
from .receipt import make_input
from .schemas import schema_problems

__all__ = [
    "FetchMismatch",
    "Fetched",
    "Manifest",
    "Reference",
    "cached_file",
    "default_cache",
    "fetch_lab",
    "fetch_reference",
    "find_manifest",
    "format_size",
    "shown",
    "load_manifest",
    "main",
    "manifest_problems",
    "parse_manifest",
    "partial_path",
    "url_problem",
    "user_agent",
]

#: The `schema` of every manifest (packages/schema/references.ts).
REFERENCES_SCHEMA_TAG = "enginespace/references@1"

#: Where the manifest is, relative to a folder: the kit's, then a checkout of the repository's.
MANIFEST_LOCATIONS = ("references/manifest.json", "labs/references/manifest.json")

#: A manifest bigger than this is not one [estimated]: the most that the schema allows, 256 entries, comes to far less.
MAX_MANIFEST_BYTES = 4 << 20

#: Bytes read or written at a time [estimated]: large enough that gigabytes are not millions of calls, small enough to stop soon after a refusal.
CHUNK = 1 << 20

#: Seconds that a connection may be silent before the download counts as stalled [estimated]. The clock restarts with every byte, so a slow link is not cut.
TIMEOUT = 30.0

#: Seconds between two progress lines [estimated].
PROGRESS_SECONDS = 10.0

#: The hosts that http may name: this machine, and nothing else (the same three as the schema's pattern).
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

_CONTENT_RANGE = re.compile(r"bytes ([0-9]+)-([0-9]+)/([0-9]+|\*)")


class FetchMismatch(GraderError):
    """A server's answer that is not the file the manifest pins. What the answer put in a partial file has been deleted, and nothing of it was kept."""


def user_agent() -> str:
    """The User-Agent of every request: `enginespace-grader/<version>` (ARCHITECTURE section 9.7). It names the program and its version, and no person."""
    return f"{GRADER_NAME}/{__version__}"


def format_size(count: int) -> str:
    """A number of bytes for a person: `684 B`, `1.5 MB`, `14.0 GB` (decimal units, as download pages count)."""
    size = float(count)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1000:
            return f"{int(size)} B" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1000
    return f"{size:.1f} TB"


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# The manifest
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Reference:
    """One file of the manifest."""

    name: str
    kind: str
    labs: tuple[str, ...]
    path: str
    url: str
    sha256: str
    size: int
    licence: str
    date: str
    revision: str | None = None
    notes: str | None = None

    @classmethod
    def from_object(cls, entry: Mapping[str, Any]) -> Reference:
        """An entry of a manifest that `manifest_problems` has accepted."""
        return cls(
            name=entry["name"],
            kind=entry["kind"],
            labs=tuple(entry["labs"]),
            path=entry["path"],
            url=entry["url"],
            sha256=entry["sha256"],
            size=int(entry["bytes"]),
            licence=entry["licence"],
            date=entry["date"],
            revision=entry.get("revision"),
            notes=entry.get("notes"),
        )

    def as_input(self) -> dict[str, Any]:
        """The entry of the receipt's `inputs` for this file: the same name, kind, revision, hash and size as the manifest pins."""
        return make_input(self.name, self.kind, self.sha256, self.size, revision=self.revision)


@dataclass(frozen=True)
class Manifest:
    """The entries of a manifest, in its order, and the file they were read from."""

    entries: tuple[Reference, ...]
    source: Path | None = None

    def labs(self) -> list[str]:
        """Every lab that some entry lists, sorted."""
        return sorted({lab for entry in self.entries for lab in entry.labs})

    def for_lab(self, lab: str) -> list[Reference]:
        """The entries that list `lab`, in the manifest's order."""
        return [entry for entry in self.entries if lab in entry.labs]


def manifest_rule_problems(document: Mapping[str, Any]) -> list[str]:
    """What the zod schema checks beyond JSON Schema, for a manifest whose shape the schema has already accepted (packages/schema/references.ts).

    The names differ, and so do the labs of an entry; the paths differ, ignoring case; no path is a folder that another path is inside; a date is a day that exists.
    """
    problems: list[str] = []
    names: set[str] = set()
    paths: dict[str, str] = {}
    entries = document["entries"]
    for index, entry in enumerate(entries):
        if entry["name"] in names:
            problems.append(f'/entries/{index}/name: name "{entry["name"]}" is listed twice')
        names.add(entry["name"])
        seen: set[str] = set()
        for place, lab in enumerate(entry["labs"]):
            if lab in seen:
                problems.append(f'/entries/{index}/labs/{place}: repeats "{lab}"')
            seen.add(lab)
        key = entry["path"].lower()
        if key in paths:
            problems.append(f'/entries/{index}/path: path "{entry["path"]}" is listed twice (paths that differ only in case count as the same)')
        paths[key] = entry["path"]
        day = entry["date"]
        if not is_calendar_day(int(day[:4]), int(day[5:7]), int(day[8:])):
            problems.append(f"/entries/{index}/date: must be a day that exists")
    for index, entry in enumerate(entries):
        parts = entry["path"].lower().split("/")
        for end in range(1, len(parts)):
            folder = "/".join(parts[:end])
            if folder in paths:
                problems.append(f'/entries/{index}/path: path "{entry["path"]}" is inside "{paths[folder]}", which is a file')
    return problems


def manifest_problems(document: Any) -> list[str]:
    """Everything that is wrong with `document` as a references manifest: what the schema says, and then, if the shape is right, what only the rules say."""
    problems = schema_problems("references", document)
    if problems:
        return problems
    return manifest_rule_problems(document)


def parse_manifest(document: Any, source: Path | None = None) -> Manifest:
    """A parsed manifest, or a `GraderError` that lists what is wrong with it."""
    problems = manifest_problems(document)
    if problems:
        raise GraderError(f"{source if source is not None else 'the manifest'} is not a references manifest ({REFERENCES_SCHEMA_TAG}):\n  " + "\n  ".join(problems))
    return Manifest(tuple(Reference.from_object(entry) for entry in document["entries"]), source)


def load_manifest(path: Path) -> Manifest:
    """Reads and checks the manifest at `path`. The file is read under a cap, as strictly as the browser would read it, and checked before anything is downloaded."""
    path = Path(path)
    try:
        with open(path, "rb") as handle:
            data = handle.read(MAX_MANIFEST_BYTES + 1)
    except FileNotFoundError:
        raise GraderError(f"there is no manifest at {shown(path)}. Run the command from the kit's folder (or from the repository), or name the file with --manifest") from None
    except OSError as error:
        raise GraderError(f"cannot read the manifest {shown(path)}: {error.strerror or error}") from None
    if len(data) > MAX_MANIFEST_BYTES:
        raise GraderError(f"{shown(path)} is larger than {format_size(MAX_MANIFEST_BYTES)}, which no references manifest is")
    try:
        document = parse_json(data.decode("utf-8"))
    except UnicodeDecodeError:
        raise GraderError(f"{shown(path)} is not UTF-8 text, so it is not a references manifest") from None
    except ValueError as error:
        raise GraderError(f"{shown(path)} is not JSON: {error}") from None
    except RecursionError:
        raise GraderError(f"{shown(path)} is nested too deeply to read") from None
    return parse_manifest(document, path)


def find_manifest(start: Path | None = None) -> Path:
    """The manifest nearest to a folder, looking in it and in each folder above it: `references/manifest.json` (the kit) or `labs/references/manifest.json` (the repository)."""
    here = (Path.cwd() if start is None else Path(start)).resolve()
    for folder in (here, *here.parents):
        for location in MANIFEST_LOCATIONS:
            candidate = folder / location
            if candidate.is_file():
                return candidate
    raise GraderError(
        f"no references manifest was found in {here} or above it (looked for {' and '.join(MANIFEST_LOCATIONS)}). "
        "Run the command from the kit's folder, or from the repository, or name the file with --manifest"
    )


def shown(path: Path | str) -> str:
    """A path as a message prints it: under the home folder it starts with `~`, so that a line the learner pastes into a question or a log does not carry their user name."""
    where = Path(path)
    try:
        inside = where.relative_to(Path.home())
    except (ValueError, RuntimeError):  # not under the home folder, or no home folder to be under
        return str(where)
    return "~" if str(inside) == "." else f"~/{inside}"


def default_cache(environ: Mapping[str, str] | None = None) -> Path:
    """Where downloads go when the learner names no folder: ENGINESPACE_CACHE, else `enginespace/references` in the user's cache folder."""
    env = os.environ if environ is None else environ
    named = (env.get("ENGINESPACE_CACHE") or "").strip()
    if named:
        return Path(named).expanduser()
    base = (env.get("XDG_CACHE_HOME") or "").strip()
    if not base:
        try:
            base = str(Path.home() / ".cache")
        except RuntimeError:
            raise GraderError("cannot tell where to keep downloads: this account has no home folder. Name one with --cache, or set ENGINESPACE_CACHE") from None
    return Path(base) / "enginespace" / "references"


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# The network
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


def url_problem(url: str) -> str | None:
    """Why the grader will not download from `url`, or None when it will: https, or http to this machine itself, and no user name or password."""
    try:
        parts = urllib.parse.urlsplit(url)
        host = parts.hostname
    except ValueError:
        return "it is not a URL"
    if parts.username is not None or parts.password is not None:
        return "it carries a user name or a password"
    if parts.scheme == "https":
        return None if host else "it has no host"
    if parts.scheme == "http" and host in LOOPBACK_HOSTS:
        return None
    return "downloads are over https (plain http is allowed only to 127.0.0.1, localhost or [::1])"


def _is_loopback(url: str) -> bool:
    try:
        return urllib.parse.urlsplit(url).hostname in LOOPBACK_HOSTS
    except ValueError:
        return False


class _Redirects(urllib.request.HTTPRedirectHandler):
    """Follows a redirect only to somewhere a download may come from: another host is fine, but not plain http from an https URL, and not a scheme other than http or https."""

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
        problem = url_problem(newurl)
        if problem is None and urllib.parse.urlsplit(req.full_url).scheme == "https" and urllib.parse.urlsplit(newurl).scheme != "https":
            problem = "it leaves https"
        if problem is not None:
            raise urllib.error.HTTPError(req.full_url, code, f"redirected to {newurl}, which the grader refuses: {problem}", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def open_url(url: str, headers: Mapping[str, str], timeout: float = TIMEOUT) -> Any:
    """GET `url` with `headers`. A proxy from the environment is used, except for loopback. Raises what urllib raises."""
    handlers: list[Any] = [_Redirects()]
    if _is_loopback(url):
        handlers.insert(0, urllib.request.ProxyHandler({}))
    opener = urllib.request.build_opener(*handlers)
    return opener.open(urllib.request.Request(url, headers=dict(headers)), timeout=timeout)


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# The cache
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


def _destination(cache: Path, reference: Reference) -> Path:
    """Where an entry's file goes, which is inside the cache however the entry was made. The schema allows no such path; this is the check that does not rely on it.

    The check is of the path's words and not of where the file system leads, so a learner may link a folder of the cache to another disk.
    """
    parts = reference.path.split("/")
    if any(part in ("", ".", "..") or "\\" in part or ":" in part for part in parts):
        raise GraderError(f"the path {reference.path!r} of {reference.name} would leave the cache folder, and the grader will not write there")
    return cache.joinpath(*parts)


def partial_path(destination: Path, reference: Reference) -> Path:
    """The file a download is written to until it is known to match: beside its destination, hidden, and named for the first digits of the hash it must reach."""
    return destination.with_name(f".{destination.name}.{reference.sha256[:16]}.part")


def _hash_file(path: Path, digest: Any) -> int:
    """Feeds a file to a hash, and returns how many bytes it held."""
    count = 0
    with open(path, "rb") as handle:
        while block := handle.read(CHUNK):
            digest.update(block)
            count += len(block)
    return count


def _is_verified(path: Path, reference: Reference) -> bool:
    """Whether the file at `path` is the one the entry pins: a regular file of the pinned size whose bytes hash to the pinned SHA-256."""
    try:
        if not path.is_file() or path.stat().st_size != reference.size:
            return False
        digest = hashlib.sha256()
        _hash_file(path, digest)
    except OSError:
        return False
    return digest.hexdigest() == reference.sha256


def _lab_of(reference: Reference) -> str:
    return reference.labs[0] if reference.labs else "<lab>"


def cached_file(reference: Reference, cache: Path | None = None) -> Path:
    """The file of an entry in the cache, after checking its size and SHA-256 again. This is how a lab reads a fetched input.

    A file that is missing or is not the pinned one is a `GraderError` that names the command to run, because a lab that read it anyway would grade the learner's work
    against something other than the reference that the receipt claims.
    """
    destination = _destination(default_cache() if cache is None else Path(cache), reference)
    if not _is_verified(destination, reference):
        raise GraderError(f"{reference.path} is missing from the cache, or is not the file the manifest pins. Run `enginespace fetch {_lab_of(reference)}` to download it")
    return destination


def _discard(partial: Path) -> None:
    try:
        partial.unlink()
    except FileNotFoundError:
        pass


def _mismatch(reference: Reference, partial: Path, what: str, *, delete: bool = True) -> FetchMismatch:
    """Makes the error for an answer that is not the pinned file, and deletes the partial file unless `delete` is false. The caller raises it.

    `delete` is false when nothing has been written yet and the fault is the answer's, so the part of the file that an earlier run kept is as good as it was.
    """
    if delete:
        _discard(partial)
        effect = f"The partial download of {reference.path} was deleted and nothing was kept"
    else:
        effect = f"Nothing was downloaded, and a part of {reference.path} that an earlier run kept is left as it was"
    return FetchMismatch(
        f"{what}. {effect}. "
        f"The file at {reference.url} may have changed since the manifest was written, or something between you and the server (a proxy, a captive portal) answered in its place. "
        "Run the command again; if it fails the same way, the manifest is out of date"
    )


def _require_room(folder: Path, needed: int, reference: Reference) -> None:
    try:
        free = shutil.disk_usage(folder).free
    except OSError:
        return  # a file system that cannot say how much room it has: the write will tell
    if free < needed:
        raise GraderError(
            f"{reference.path} needs {format_size(needed)} more room, and the disk that holds it has {format_size(free)} free. "
            "Free some space, or keep the cache elsewhere with --cache (or ENGINESPACE_CACHE)"
        )


@dataclass(frozen=True)
class Fetched:
    """What `fetch_reference` did for one entry."""

    reference: Reference
    path: Path
    #: `present` (already in the cache and matching), `fetched` (downloaded whole) or `resumed` (downloaded on from a partial file).
    status: str
    #: Bytes received by this run.
    received: int


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# One download
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


def _what_to_do(status: int) -> str:
    """What a learner can do about an HTTP status that is not a file."""
    if status in (404, 410):
        return "The file is not at that URL any more, so the manifest is out of date: report it"
    if status in (401, 403):
        return "The server will not give the file to a request that carries no login, which the grader never sends: report it, because the manifest should name a public file"
    if status == 429 or status >= 500:
        return "The server is busy or down: run the command again later, and a download resumes where it stopped"
    return "Check the URL, and report it if the manifest has it wrong"


def _request(reference: Reference, partial: Path, offset: int) -> Any:
    """Sends the GET for the bytes from `offset` on, and returns the open response. Anything that is not an answer is a `GraderError`."""
    headers = {"User-Agent": user_agent(), "Accept-Encoding": "identity"}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    where = urllib.parse.urlsplit(reference.url).netloc
    try:
        return open_url(reference.url, headers)
    except urllib.error.HTTPError as error:
        code, reason = error.code, error.reason
        error.close()
        if code == 416 and offset:
            shorter = f"the server answered 416 to a request for the bytes after the first {offset:,} of {reference.path}, so its file is shorter than the partial download"
            raise _mismatch(reference, partial, shorter) from None
        if 300 <= code < 400:
            raise GraderError(f"{where}, asked for {reference.path}: {reason}") from None
        raise GraderError(f"{where} answered {code} {reason} for {reference.path} ({reference.url}). {_what_to_do(code)}") from None
    except (urllib.error.URLError, OSError, http.client.HTTPException) as error:
        raise GraderError(
            f"could not reach {where} for {reference.path}: {getattr(error, 'reason', None) or error}. "
            "Check the connection and run the command again: a download resumes where it stopped"
        ) from None


def _digits(text: str | None) -> int | None:
    """A header's value as a whole number, or None when it is not one."""
    return int(text) if text is not None and re.fullmatch(r"[0-9]+", text.strip()) else None


def _check_answer(response: Any, reference: Reference, partial: Path, offset: int, say: Callable[[str], None]) -> int:
    """Reads the status and headers of the answer. Returns the byte where the body begins: `offset` if the server resumed, and 0 if it sent the whole file."""
    status = response.status
    if status == 206 and offset:
        found = _CONTENT_RANGE.fullmatch((response.headers.get("Content-Range") or "").strip())
        if found is None:
            raise _mismatch(reference, partial, "the server answered a resume without saying which bytes it sent", delete=False)
        start, total = int(found[1]), (None if found[3] == "*" else int(found[3]))
        if start != offset or (total is not None and total != reference.size):
            said = "an unknown size" if total is None else f"{total:,} bytes"
            raise _mismatch(
                reference,
                partial,
                f"the server sent the bytes from {start:,} on, of a file of {said}, where the bytes from {offset:,} on of a file of {reference.size:,} were asked for",
                delete=False,
            )
        return offset
    if status != 200:
        raise GraderError(f"{urllib.parse.urlsplit(reference.url).netloc} answered {status} for {reference.path}, which the grader does not know how to read")
    length = _digits(response.headers.get("Content-Length"))
    if length is not None and length != reference.size:
        raise _mismatch(reference, partial, f"the server says {reference.path} is {length:,} bytes, where the manifest pins {reference.size:,}", delete=False)
    if offset:
        say(f"the server sent {reference.path} whole, whatever range was asked for, so the download starts again")
    return 0


def _copy(response: Any, reference: Reference, partial: Path, start: int, digest: Any, say: Callable[[str], None]) -> int:
    """Writes the body to the partial file from byte `start` on, hashing it as it goes. Returns the bytes received.

    Anything that stops short of the whole file keeps the partial file, for the next run to resume from; more than the whole file deletes it.
    """
    received = 0
    too_long = False
    interrupted: BaseException | None = None
    last_report = time.monotonic()
    with open(partial, "ab" if start else "wb") as out:
        while True:
            failure: BaseException | None = None
            try:
                block = response.read(CHUNK)
            except http.client.IncompleteRead as error:
                block, failure = error.partial, error  # the bytes that arrived before the connection closed are as good as any
            except (OSError, http.client.HTTPException) as error:
                block, failure = b"", error
            if block:
                if start + received + len(block) > reference.size:
                    too_long = True
                    break
                out.write(block)
                digest.update(block)
                received += len(block)
                if time.monotonic() - last_report >= PROGRESS_SECONDS:
                    last_report = time.monotonic()
                    say(f"  {reference.path}: {format_size(start + received)} of {format_size(reference.size)} ({100 * (start + received) // max(reference.size, 1)}%)")
            if failure is not None:
                interrupted = failure
                break
            if not block:
                break
        out.flush()
        os.fsync(out.fileno())
    if too_long:
        raise _mismatch(reference, partial, f"the server sent more than the {reference.size:,} bytes that the manifest pins for {reference.path}")
    if start + received < reference.size:
        why = f": {getattr(interrupted, 'reason', None) or interrupted}" if interrupted is not None else ""
        raise GraderError(
            f"the download of {reference.path} stopped after {format_size(start + received)} of {format_size(reference.size)}{why}. "
            "The part that arrived is kept: run the command again to go on from there"
        )
    return received


def fetch_reference(reference: Reference, cache: Path, *, say: Callable[[str], None] | None = None) -> Fetched:
    """Puts one entry's file in the cache: nothing to do if it is there and matches, otherwise a download that resumes a partial file and is kept only if it matches.

    Raises `FetchMismatch` for bytes that are not the pinned file, and a `GraderError` for anything else that stops it.
    """
    log = say if say is not None else (lambda message: sys.stderr.write(message + "\n"))
    problem = url_problem(reference.url)
    if problem is not None:
        raise GraderError(f"will not download {reference.name} from {reference.url}: {problem}")
    cache = Path(cache)
    destination = _destination(cache, reference)
    partial = partial_path(destination, reference)
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        raise GraderError(f"cannot use {shown(cache)} as the cache: {error.strerror or error}. Name another folder with --cache") from None

    if _is_verified(destination, reference):
        return Fetched(reference, destination, "present", 0)
    if destination.exists():
        log(f"{reference.path} is in the cache and is not the file the manifest pins, so it will be downloaded again")

    try:
        digest = hashlib.sha256()
        offset = 0
        if partial.is_file():
            if partial.stat().st_size > reference.size:
                partial.unlink()  # longer than the whole file can be, so not a part of it
            else:
                offset = _hash_file(partial, digest)
        _require_room(destination.parent, reference.size - offset, reference)
        start, received = offset, 0
        if reference.size == 0 and not partial.exists():
            partial.touch()  # a file with nothing in it is its pin: the hash of no bytes is the same wherever it is fetched from
        # A partial file of exactly the pinned size needs no request: it only needs its hash checked, below.
        if offset < reference.size:
            if offset:
                log(f"resuming {reference.path} from {format_size(offset)} of {format_size(reference.size)}")
            else:
                log(f"downloading {reference.path} ({format_size(reference.size)}) from {urllib.parse.urlsplit(reference.url).netloc}")
            with _request(reference, partial, offset) as response:
                start = _check_answer(response, reference, partial, offset, log)
                if start != offset:
                    digest = hashlib.sha256()
                received = _copy(response, reference, partial, start, digest, log)
        actual = digest.hexdigest()
        if actual != reference.sha256:
            raise _mismatch(reference, partial, f"the SHA-256 of {reference.path} is {actual}, and the manifest pins {reference.sha256}")
        os.replace(partial, destination)
    except OSError as error:
        raise GraderError(f"cannot write {reference.path} in the cache: {error.strerror or error}") from None
    return Fetched(reference, destination, "resumed" if start > 0 else "fetched", received)


# ---------------------------------------------------------------------------------------------------------------------------------------------------------
# The command
# ---------------------------------------------------------------------------------------------------------------------------------------------------------


def fetch_lab(manifest: Manifest, lab: str, cache: Path, *, say: Callable[[str], None], out: Callable[[str], None]) -> list[Fetched]:
    """Puts every file that `lab` pins in the cache, one after the other, and stops at the first that fails. `out` gets a line for each file as it is done."""
    entries = manifest.for_lab(lab)
    if not entries:
        if is_stage_id(lab):
            raise GraderError(f"{lab} is a stage, and fetch takes a lab: run `enginespace fetch {lab_of_stage_id(lab)}`")
        known = manifest.labs()
        where = shown(manifest.source) if manifest.source is not None else "the manifest"
        raise GraderError(
            f"{where} lists no file for {lab!r}"
            + (f". It lists files for: {', '.join(known)}. Check the lab id" if known else ": it lists no file at all yet, because a lab's files are added to it when the lab is built")
        )
    say(f"{lab}: {len(entries)} file{'' if len(entries) == 1 else 's'}, into {shown(cache)}")
    done: list[Fetched] = []
    for entry in entries:
        result = fetch_reference(entry, cache, say=say)
        done.append(result)
        what = {"present": "ok      ", "fetched": "fetched ", "resumed": "resumed "}[result.status]
        note = "  (already in the cache)" if result.status == "present" else ""
        out(f"  {what} {entry.path}  {format_size(entry.size)}  {entry.licence}{note}")
    return done


def _say(message: str) -> None:
    sys.stderr.write(message + "\n")


def _out(message: str) -> None:
    sys.stdout.write(message + "\n")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="enginespace fetch",
        description="Download the files that a lab pins (a model, a dataset slice, a reference bank) into the cache, and keep only the bytes whose SHA-256 is the manifest's. "
        "A download that stopped resumes where it stopped. Exit status: 0 every file is in the cache and matches, 1 a download did not match its pin, 2 a usage error, 3 it could not run.",
    )
    parser.add_argument("lab", metavar="<lab>", help="a lab id such as tr0.forward")
    parser.add_argument("--manifest", metavar="FILE", help="the references manifest (default: references/manifest.json or labs/references/manifest.json, here or in a folder above)")
    parser.add_argument("--cache", metavar="DIR", help="where the files go (default: ENGINESPACE_CACHE, else enginespace/references in your user cache folder)")
    args = parser.parse_args(list(argv) if argv is not None else None)

    manifest = load_manifest(Path(args.manifest) if args.manifest else find_manifest())
    cache = Path(args.cache).expanduser() if args.cache else default_cache()
    try:
        done = fetch_lab(manifest, args.lab, cache, say=_say, out=_out)
    except FetchMismatch as error:
        sys.stderr.write(f"enginespace: {error}\n")
        return 1
    downloaded = sum(1 for item in done if item.status != "present")
    received = sum(item.received for item in done)
    count = f"{len(done)} file{'' if len(done) == 1 else 's'}"
    _out(f"{args.lab}: {count} in the cache, each hashed to the SHA-256 that the manifest pins ({downloaded} downloaded, {format_size(received)} received)")
    return 0
