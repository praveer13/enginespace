"""Who graded: the version, and the hash over the package's files (ARCHITECTURE section 9.6, ASSESSMENT section 5.5)."""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import tomllib
import unittest
from pathlib import Path

from enginespace_grader import GRADER_NAME, __version__, identity

from .support import vectors_dir


def independent(files: dict[str, bytes]) -> str:
    """The hash as ASSESSMENT section 5.5 words it, written out beside the module that computes it: path, length and bytes, in the order of the path's UTF-8."""
    digest = hashlib.sha256()
    for path in sorted(files, key=lambda name: name.encode("utf-8")):
        digest.update(path.encode("utf-8") + b"\x00" + str(len(files[path])).encode("ascii") + b"\x00" + files[path])
    return digest.hexdigest()


class Folder(unittest.TestCase):
    def setUp(self) -> None:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        self.root = Path(holder.name) / "enginespace_grader"
        self.root.mkdir()

    def write(self, files: dict[str, bytes]) -> None:
        for name, data in files.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)


class SourceHash(Folder):
    def test_a_known_answer_for_a_tree_of_two_files(self) -> None:
        """The value the packer (W2-T10) has to reproduce when it hashes the source of a wheel."""
        self.write({"a.py": b"x = 1\n", "sub/b.json": b"{}\n"})
        self.assertEqual(identity.source_sha256(self.root), "50069fac86bd12150588ceda87cdd5a5b277a568fa976176ff001f839b3ff73d")

    def test_it_is_the_hash_that_the_assessment_describes_over_a_tree_of_awkward_names(self) -> None:
        files = {"b.py": b"b", "a/z.py": b"z", "A.py": b"A", "a.py": b"", "caf" + chr(0xE9) + ".py": b"e", "deep/er/est/f.txt": b"\x00\xff\r\n", "a b.py": b"space"}
        self.write(files)
        self.assertEqual(identity.source_sha256(self.root), independent(files))
        self.assertEqual([name for name, _ in identity.package_files(self.root)], sorted(files, key=lambda name: name.encode("utf-8")))

    def test_the_path_is_part_of_the_hash_and_so_is_the_length(self) -> None:
        self.write({"a.py": b"one", "b.py": b"two"})
        before = identity.source_sha256(self.root)
        (self.root / "a.py").rename(self.root / "c.py")
        self.assertNotEqual(identity.source_sha256(self.root), before, "a renamed file is another package")
        (self.root / "c.py").rename(self.root / "a.py")
        self.assertEqual(identity.source_sha256(self.root), before)
        (self.root / "a.py").write_bytes(b"two")
        (self.root / "b.py").write_bytes(b"one")
        self.assertNotEqual(identity.source_sha256(self.root), before, "the contents swapped between two files")

    def test_the_end_of_one_file_cannot_run_into_the_next_path(self) -> None:
        self.write({"a": b"1\x00b\x001"})
        first = identity.source_sha256(self.root)
        (self.root / "a").unlink()
        self.write({"a": b"1", "b": b"1"})
        self.assertNotEqual(identity.source_sha256(self.root), first)

    def test_one_byte_anywhere_changes_it(self) -> None:
        self.write({"a.py": b"x = 1\n", "pkg/b.py": b"y = 2\n"})
        before = identity.source_sha256(self.root)
        (self.root / "pkg" / "b.py").write_bytes(b"y = 3\n")
        self.assertNotEqual(identity.source_sha256(self.root), before)

    def test_what_python_and_the_system_leave_beside_the_code_is_not_part_of_it(self) -> None:
        self.write({"a.py": b"x = 1\n", "pkg/b.py": b"y = 2\n"})
        before = identity.source_sha256(self.root)
        self.write({"__pycache__/a.cpython-313.pyc": b"\x00", "pkg/__pycache__/b.cpython-313.pyc": b"\x00", "old.pyc": b"\x00", "old.pyo": b"\x00", ".DS_Store": b"\x00", ".hidden/x.py": b"1", "pkg/.swp": b"1"})
        try:
            os.symlink(self.root / "a.py", self.root / "link.py")
        except OSError:  # a system that does not let this user make links: the rest of the test stands
            pass
        self.assertEqual(identity.source_sha256(self.root), before)

    def test_an_installed_copy_gives_the_hash_of_the_source_it_came_from(self) -> None:
        installed = self.root.parent / "site-packages" / "enginespace_grader"
        shutil.copytree(identity.PACKAGE_DIR, installed)
        # An import writes bytecode beside the code; a wheel's install does as well.
        (installed / "__pycache__").mkdir(exist_ok=True)
        (installed / "__pycache__" / "cli.cpython-313.pyc").write_bytes(b"\x00bytecode")
        self.assertEqual(identity.source_sha256(installed), identity.source_sha256())

    def test_the_package_hashed_is_the_one_that_carries_the_schemas(self) -> None:
        names = [name for name, _ in identity.package_files()]
        for expected in ("__init__.py", "cli.py", "rng.py", "schemas/receipt.schema.json", "schemas/bundle.schema.json", "labs/__init__.py"):
            self.assertIn(expected, names)
        self.assertFalse([name for name in names if "__pycache__" in name or name.endswith(".pyc")])
        self.assertFalse([name for name in names if name.startswith("tests/")], "the tests are not part of the package")


class Identity(unittest.TestCase):
    def test_the_identity_is_the_receipts_grader_object(self) -> None:
        found = identity.identity()
        self.assertEqual(found.as_object(), {"name": "enginespace-grader", "version": __version__, "sourceSha256": identity.source_sha256()})
        self.assertEqual(found.name, GRADER_NAME)
        self.assertIs(identity.identity(), found, "the hash is taken once")

    def test_the_version_is_the_one_in_pyproject_toml(self) -> None:
        pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
        project = tomllib.loads(pyproject.read_text(encoding="utf-8"))["project"]
        self.assertEqual(project["name"], GRADER_NAME)
        self.assertEqual(project["version"], __version__)
        self.assertRegex(__version__, r"^[0-9][0-9A-Za-z.+_-]{0,63}$", "a version the receipt schema takes")

    def test_a_checkout_of_the_repository_has_the_vectors_the_tests_need(self) -> None:
        self.assertTrue((vectors_dir() / "rng.json").is_file())


if __name__ == "__main__":
    unittest.main()
