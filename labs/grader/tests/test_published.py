"""The published grader builds (W2-T10): what the site serves and lists is the grader that identity.py describes.

`scripts/pack-kit.ts` writes the wheel and the kit into public/labs/ and each wheel's `sourceSha256` into the manifest and into src/receipts/graders.ts.
The packer computes that hash in TypeScript. These tests compute it again, here, with identity.py, from the files of the wheel as a learner's pip would
unpack them, and compare it with the manifest, with the list and with the source tree. They read committed files and ask nothing of the network.
"""

from __future__ import annotations

import json
import re
import tempfile
import unittest
import zipfile
from hashlib import sha256
from pathlib import Path

from enginespace_grader import __version__, identity

REPO = Path(__file__).resolve().parents[3]
LABS = REPO / "public" / "labs"
GRADERS_TS = REPO / "src" / "receipts" / "graders.ts"


def manifest() -> list[dict[str, object]]:
    body = json.loads((LABS / "manifest.json").read_text(encoding="utf-8"))
    assert isinstance(body["files"], list)
    return body["files"]


def wheels() -> list[dict[str, object]]:
    return [entry for entry in manifest() if entry.get("kind") == "grader-wheel"]


def published_list() -> list[tuple[str, str]]:
    source = GRADERS_TS.read_text(encoding="utf-8")
    return re.findall(r"\{\s*version:\s*'([^']*)',\s*sourceSha256:\s*'([0-9a-f]{64})'\s*\}", source)


class PublishedGraders(unittest.TestCase):
    def test_the_list_and_the_manifest_name_the_same_builds(self) -> None:
        self.assertTrue(wheels(), "no grader wheel is published")
        self.assertEqual(sorted((str(w["version"]), str(w["sourceSha256"])) for w in wheels()), sorted(published_list()))

    def test_each_wheel_is_the_file_the_manifest_describes(self) -> None:
        for entry in wheels():
            data = (LABS / str(entry["name"])).read_bytes()
            self.assertEqual(sha256(data).hexdigest(), entry["sha256"])
            self.assertEqual(len(data), entry["bytes"])

    def test_identity_py_gives_each_wheels_package_the_published_hash(self) -> None:
        """The check that the two languages agree: the package, unpacked from the wheel, hashes to the number that the site lists."""
        for entry in wheels():
            with tempfile.TemporaryDirectory(prefix="enginespace-wheel-") as folder, zipfile.ZipFile(LABS / str(entry["name"])) as wheel:
                wheel.extractall(folder)
                self.assertEqual(identity.source_sha256(Path(folder) / "enginespace_grader"), entry["sourceSha256"])
                self.assertEqual(identity.source_sha256(Path(folder) / "enginespace_grader"), dict(published_list())[str(entry["version"])])

    def test_the_source_tree_of_this_version_is_the_published_build(self) -> None:
        """A change to the grader's package without `bun scripts/pack-kit.ts` (or a new version) leaves the list pointing at a build that is not this one."""
        listed = dict(published_list())
        self.assertIn(__version__, listed, "this version of the grader is not on the list that the site publishes")
        self.assertEqual(identity.source_sha256(), listed[__version__])

    def test_every_record_of_a_wheel_matches_its_files(self) -> None:
        for entry in wheels():
            with zipfile.ZipFile(LABS / str(entry["name"])) as wheel:
                record = [name for name in wheel.namelist() if name.endswith(".dist-info/RECORD")]
                self.assertEqual(len(record), 1)
                lines = wheel.read(record[0]).decode("utf-8").splitlines()
                self.assertEqual(len(lines), len(wheel.namelist()))
                self.assertIsNone(wheel.testzip())


if __name__ == "__main__":
    unittest.main()
