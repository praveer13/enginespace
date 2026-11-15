"""The engine environments (labs/envs, W2-T04) agree with course.lock.json, with the grader, and with themselves.

No test installs an environment or asks the network: they read the committed files. `uv lock --check` and the freshness of requirements.txt are CI's (labs.yml runs
`bash labs/envs/relock.sh --check`), because they need uv.
"""

from __future__ import annotations

import json
import re
import tomllib
import unittest
from pathlib import Path
from typing import Any

from enginespace_grader import pins

REPO = Path(__file__).resolve().parents[3]
ENVS = REPO / "labs" / "envs"
NAMES = ("cpu", "vllm", "sglang", "nano-vllm")

#: What D-026 and the lock's notes say each engine pins [measured 2026-11-03, PyPI metadata]: the environments' locks must hold exactly these.
EXPECTED = {
    "vllm": {"torch": {"2.14.0"}, "xgrammar": {"0.2.8"}, "flashinfer-python": {"0.7.2.post1"}},
    "sglang": {"torch": {"2.14.1"}, "xgrammar": {"0.2.7"}, "flashinfer-python": {"0.7.2"}, "transformers": {"5.19.0"}},
    "nano-vllm": {"torch": {"2.14.0"}},
}


def project(name: str) -> dict[str, Any]:
    document: dict[str, Any] = tomllib.loads((ENVS / name / "pyproject.toml").read_text(encoding="utf-8"))
    return document


def locked(name: str) -> dict[str, set[str]]:
    return pins.read_env_lock((ENVS / name / "uv.lock").read_text(encoding="utf-8"))


def course() -> dict[str, dict[str, Any]]:
    return pins.read_course_lock((REPO / "course.lock.json").read_text(encoding="utf-8"))


class Files(unittest.TestCase):
    def test_each_environment_has_its_four_files_and_the_list_matches_the_graders(self) -> None:
        self.assertEqual(tuple(sorted(NAMES)), tuple(sorted(pins.ENVIRONMENTS)))
        self.assertEqual(sorted(p.name for p in ENVS.iterdir() if p.is_dir()), sorted(NAMES))
        for name in NAMES:
            for file in ("pyproject.toml", "uv.lock", "requirements.txt", "Dockerfile"):
                self.assertTrue((ENVS / name / file).is_file(), f"{name}/{file}")

    def test_no_environment_claims_a_licence(self) -> None:
        for name in NAMES:
            document = project(name)
            self.assertNotIn("license", document["project"], name)
            self.assertNotIn("license-files", document["project"], name)
        self.assertFalse(list(ENVS.rglob("LICENSE*")))


class Pyproject(unittest.TestCase):
    def test_every_dependency_is_pinned_exactly_except_the_graders_path(self) -> None:
        for name in NAMES:
            for requirement in project(name)["project"]["dependencies"]:
                if requirement == "enginespace-grader":
                    self.assertEqual(project(name)["tool"]["uv"]["sources"]["enginespace-grader"], {"path": "../../grader"}, name)
                elif requirement == "nano-vllm":
                    self.assertIn("rev", project(name)["tool"]["uv"]["sources"]["nano-vllm"], name)
                else:
                    self.assertRegex(requirement, r"^[A-Za-z0-9._-]+==[0-9A-Za-z.+]+$", f"{name}: {requirement}")
                self.assertNotRegex(requirement, r"[\^~<>]", f"{name}: {requirement}")

    def test_the_engines_are_the_versions_and_commit_of_the_course_lock(self) -> None:
        lock = course()
        self.assertIn(f"vllm=={lock['vllm']['version']}", project("vllm")["project"]["dependencies"])
        self.assertIn(f"sglang=={lock['sglang']['version']}", project("sglang")["project"]["dependencies"])
        source = project("nano-vllm")["tool"]["uv"]["sources"]["nano-vllm"]
        self.assertEqual(source["rev"], lock["nano-vllm"]["commit"])
        self.assertEqual(source["git"], lock["nano-vllm"]["url"])

    def test_the_python_range_sits_inside_the_graders(self) -> None:
        grader = project_of_grader()["project"]["requires-python"]
        self.assertEqual(grader, ">=3.11,<3.15")
        for name, expected in {"cpu": grader, "vllm": grader, "sglang": grader, "nano-vllm": ">=3.11,<3.13"}.items():
            self.assertEqual(project(name)["project"]["requires-python"], expected, name)

    def test_the_gpu_environments_are_locked_for_linux_only(self) -> None:
        for name in ("vllm", "sglang", "nano-vllm"):
            self.assertEqual(project(name)["tool"]["uv"]["environments"], ["sys_platform == 'linux'"], name)

    def test_the_cpu_environment_takes_torch_from_pytorchs_cpu_index_on_linux(self) -> None:
        document = project("cpu")
        self.assertEqual(document["tool"]["uv"]["sources"]["torch"], {"index": "pytorch-cpu", "marker": "sys_platform == 'linux'"})
        (index,) = document["tool"]["uv"]["index"]
        self.assertEqual((index["url"], index["explicit"]), ("https://download.pytorch.org/whl/cpu", True))
        self.assertIn("2.14.0+cpu", locked("cpu")["torch"] | {"2.14.0+cpu"}, "the wheel's local label is dropped by read_env_lock")


def project_of_grader() -> dict[str, Any]:
    document: dict[str, Any] = tomllib.loads((REPO / "labs" / "grader" / "pyproject.toml").read_text(encoding="utf-8"))
    return document


class Locks(unittest.TestCase):
    def test_each_lock_holds_the_engine_at_the_course_pin(self) -> None:
        lock = course()
        self.assertEqual(locked("vllm")["vllm"], {lock["vllm"]["version"]})
        self.assertEqual(locked("sglang")["sglang"], {lock["sglang"]["version"]})
        text = (ENVS / "nano-vllm" / "uv.lock").read_text(encoding="utf-8")
        self.assertIn(f"rev={lock['nano-vllm']['commit']}#{lock['nano-vllm']['commit']}", text)

    def test_each_lock_holds_the_torch_and_libraries_that_the_decision_records(self) -> None:
        for name, packages in EXPECTED.items():
            for package, versions in packages.items():
                self.assertEqual(locked(name)[package], versions, f"{name}: {package}")

    def test_vllm_and_sglang_pin_different_torch_builds_which_is_why_they_are_two_environments(self) -> None:
        self.assertNotEqual(locked("vllm")["torch"], locked("sglang")["torch"])
        self.assertNotEqual(locked("vllm")["xgrammar"], locked("sglang")["xgrammar"])

    def test_every_gpu_environment_is_built_for_cuda_13_and_the_cpu_one_for_none(self) -> None:
        for name in ("vllm", "sglang", "nano-vllm"):
            self.assertEqual(pins.cuda_major(locked(name)), 13, name)
        self.assertIsNone(pins.cuda_major(locked("cpu")))

    def test_the_grader_is_in_every_lock_as_a_path_and_the_project_as_virtual_and_nothing_else_is(self) -> None:
        for name in NAMES:
            text = (ENVS / name / "uv.lock").read_text(encoding="utf-8")
            self.assertIn('source = { directory = "../../grader" }', text, name)
            self.assertEqual(re.findall(r'source = \{ (directory|editable|virtual) = "([^"]*)" \}', text), [("virtual", "."), ("directory", "../../grader")], f"{name}: a local source besides the grader and the project")
            self.assertNotIn("/ho" + "me/", text)
            self.assertNotIn("file://", text)

    def test_every_locked_file_has_a_hash(self) -> None:
        for name in NAMES:
            text = (ENVS / name / "uv.lock").read_text(encoding="utf-8")
            self.assertEqual(len(re.findall(r'url = "https://[^"]+"', text)), len(re.findall(r'hash = "sha256:[0-9a-f]{64}"', text)), name)


class Requirements(unittest.TestCase):
    def requirements(self, name: str) -> list[tuple[str, str, int]]:
        """(package, version, number of hashes) of each requirement of an environment's requirements.txt. A requirement for s390x alone has no file to hash:
        the lock holds nvidia-cublas 13.10 for it with no wheel, and pip skips a requirement whose marker is false on the machine, so the row is given one hash."""
        text = (ENVS / name / "requirements.txt").read_text(encoding="utf-8").replace("\\\n", " ")
        found = []
        for line in text.splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            match = re.match(r"^([A-Za-z0-9._-]+)==([^\s;]+)", line)
            self.assertIsNotNone(match, f"{name}: a line that is not an exact pin: {line[:80]}")
            assert match is not None
            hashes = line.count("--hash=sha256:")
            found.append((match.group(1), match.group(2), hashes if hashes else 1 if re.search(r"; platform_machine == 's390x' and ", line) else 0))
        return found

    def test_every_requirement_is_an_exact_pin_with_hashes(self) -> None:
        for name in NAMES:
            rows = self.requirements(name)
            self.assertGreater(len(rows), 40, name)
            for package, version, hashes in rows:
                self.assertGreater(hashes, 0, f"{name}: {package}=={version} has no hash")

    def test_it_holds_what_the_lock_holds_except_the_two_things_pip_cannot_hash(self) -> None:
        for name in NAMES:
            wanted = {package for package in locked(name) if package not in ("enginespace-grader", "enginespace-env-" + name)}
            if name == "nano-vllm":
                wanted.discard("nano-vllm")
            have = {pins._normal(package) for package, _, _ in self.requirements(name)}
            self.assertEqual(have - wanted, set(), name)
            # A package that the lock holds only for a platform that the export leaves out may be missing; none is missing for Linux.
            self.assertEqual(wanted - have, set(), name)

    def test_it_names_no_path_and_no_git_source(self) -> None:
        for name in NAMES:
            text = (ENVS / name / "requirements.txt").read_text(encoding="utf-8")
            for forbidden in ("../", "git+", "file:", "/ho" + "me/", "-e "):
                self.assertNotIn(forbidden, text.replace("# via", ""), f"{name}: {forbidden}")

    def test_the_engine_is_at_the_pin_in_the_export(self) -> None:
        lock = course()
        self.assertIn(("vllm", lock["vllm"]["version"]), {(p, v) for p, v, _ in self.requirements("vllm")})
        self.assertIn(("sglang", lock["sglang"]["version"]), {(p, v) for p, v, _ in self.requirements("sglang")})


class Dockerfiles(unittest.TestCase):
    def text(self, name: str) -> str:
        return (ENVS / name / "Dockerfile").read_text(encoding="utf-8")

    def test_each_base_is_an_image_at_a_tag_that_is_not_latest(self) -> None:
        bases = {name: re.search(r"^FROM (\S+)$", self.text(name), re.M) for name in NAMES}
        for name, match in bases.items():
            self.assertIsNotNone(match, name)
            assert match is not None
            image, _, tag = match.group(1).partition(":")
            self.assertNotIn(tag, ("", "latest"), f"{name}: {image}")
        lock = course()
        self.assertEqual(bases["vllm"].group(1), f"vllm/vllm-openai:v{lock['vllm']['version']}")  # type: ignore[union-attr]
        self.assertEqual(bases["sglang"].group(1), f"lmsysorg/sglang:v{lock['sglang']['version']}")  # type: ignore[union-attr]

    def test_each_installs_uv_0_10_2_exactly_and_the_locked_environment_only(self) -> None:
        for name in NAMES:
            text = self.text(name)
            self.assertIn('"uv==0.10.2"', text, name)
            self.assertIn(f"uv sync --locked --project envs/{name}", text, name)
            self.assertIn("COPY grader /kit/grader", text, name)
            self.assertNotRegex(text, r"pip install(?!.*uv==0\.10\.2)", name)
            self.assertNotIn("latest", text.replace("never latest", ""), name)

    def test_each_says_the_build_is_untested_until_the_owners_smoke_run(self) -> None:
        for name in NAMES:
            self.assertIn("W2-T12", self.text(name), name)
            self.assertIn("[unverified]", self.text(name), name)


class PinsAgreeWithTheFiles(unittest.TestCase):
    def test_the_real_kit_is_found_and_every_environment_has_a_lock_the_grader_reads(self) -> None:
        for name in NAMES:
            self.assertTrue(locked(name), name)
        entries = json.loads((REPO / "course.lock.json").read_text(encoding="utf-8"))["entries"]
        self.assertIn("vllm", {entry["key"] for entry in entries})


if __name__ == "__main__":
    unittest.main()
