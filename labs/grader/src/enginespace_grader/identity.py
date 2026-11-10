"""Who graded: the package's name, its version, and the hash over its files (ARCHITECTURE section 9.6, ASSESSMENT section 5.5).

A receipt records `grader.name`, `grader.version` and `grader.sourceSha256`, and the site compares the last two with the list of grader builds that
it published (A§8.5 rule 5, W2-T10). A build it does not know makes the receipt `gpu-unverified`. The hash is how the site tells a grader that was
patched from one that was published, and it holds only against a learner who does not also change the version string and the code that computes the
hash (A§8.6: no zero-server design can stop that).

The hash is over the files of the import package, `enginespace_grader/`, and nothing else. For each file, in the order of the UTF-8 bytes of its path
relative to the package folder (with `/` between the parts, on every system), it takes
    the path, a NUL byte, the file's length in decimal, a NUL byte, and the file's bytes
and the SHA-256 of all of that, one file after another, is `sourceSha256`. Naming the length keeps the end of one file from running into the path
of the next. Not part of the package: a `__pycache__` folder, a `.pyc` or `.pyo` file, a file whose name starts with a dot, and anything that is
not a regular file. The source tree and an installed wheel hold the same package files, so they give the same hash, which is what lets the packer
(W2-T10) compute the hash that the site publishes from the source.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from typing import Any

from . import GRADER_NAME, __version__

__all__ = ["GraderIdentity", "identity", "package_files", "source_sha256"]

PACKAGE_DIR = Path(__file__).resolve().parent


def package_files(root: Path | None = None) -> list[tuple[str, Path]]:
    """The files of the package at `root` (the installed one by default) that the hash covers, as (relative path, file), sorted by that path's UTF-8 bytes."""
    base = PACKAGE_DIR if root is None else Path(root)
    found: list[tuple[str, Path]] = []
    for folder, subfolders, names in os.walk(base):
        subfolders[:] = [name for name in subfolders if name != "__pycache__" and not name.startswith(".")]
        for name in names:
            if name.startswith(".") or name.endswith((".pyc", ".pyo")):
                continue
            path = Path(folder) / name
            if path.is_symlink() or not path.is_file():
                continue
            found.append((path.relative_to(base).as_posix(), path))
    found.sort(key=lambda item: item[0].encode("utf-8"))
    return found


def source_sha256(root: Path | None = None) -> str:
    """The `sourceSha256` of the package at `root`: the SHA-256 over the path, length and bytes of each of its files, as the module's docstring says."""
    digest = sha256()
    for relative, path in package_files(root):
        data = path.read_bytes()
        digest.update(relative.encode("utf-8") + b"\x00" + str(len(data)).encode("ascii") + b"\x00")
        digest.update(data)
    return digest.hexdigest()


@dataclass(frozen=True)
class GraderIdentity:
    name: str
    version: str
    source_sha256: str

    def as_object(self) -> dict[str, Any]:
        """The receipt's `grader` object."""
        return {"name": self.name, "version": self.version, "sourceSha256": self.source_sha256}


@lru_cache(maxsize=1)
def identity() -> GraderIdentity:
    """This installation's identity. The hash is taken once, when it is first asked for."""
    return GraderIdentity(name=GRADER_NAME, version=__version__, source_sha256=source_sha256())
