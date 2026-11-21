"""The TR0 lab's module, as far as it can be tested without torch (the grader's own environment has none): the import guard's scan, the ids and labels of the checks, the
receipt that a recorded run makes, the artifact of the five points, and the check that compares two arrays.

The runs themselves, on a small random-weight model, are labs/grader/tests/cpu/ (labs.yml's cpu job, and the CPU environment here). A test there fails when torch is missing, and
`CpuTestsNeedTorch` below holds it to that.
"""

from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from enginespace_grader import labs
from enginespace_grader.bundle import Artifact, bundle_problems, build_bundle
from enginespace_grader.challenge import format_challenge
from enginespace_grader.checks import allclose_check, max_abs_difference
from enginespace_grader.errors import GraderError
from enginespace_grader.grade import run_stage
from enginespace_grader.labs import Lab, Stage, StageContext, StageResult
from enginespace_grader.labs import tr0_forward, tr0_forward_worker
from enginespace_grader.labs.tr0_forward import CHECK_LABELS, LAB, POINT_NAMES, POOL_LENGTH, POOL_PROMPTS, pool_position, pool_prompts, solution_file
from enginespace_grader.labs.tr0_forward_worker import scan_source
from enginespace_grader.schemas import SCHEMA_NAMES, schema_problems

from .samples import NOW, PROVENANCE, sample_environment, sample_pins

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = Path(__file__).resolve().parent / "synthetic" / "tr0-forward"


def fixture(number: int) -> dict[str, Any]:
    document: dict[str, Any] = json.loads((FIXTURES / f"stage{number}.json").read_text(encoding="utf-8"))
    return document


class RecordedLab(Lab):
    """A lab that hands back what the reference solution made on the random model, so that the receipt can be built here without torch."""

    id = "tr0.forward"
    title = "recorded"
    environment = "cpu"
    stages = tr0_forward.Tr0Forward.stages

    def run(self, context: StageContext) -> StageResult:
        recorded = fixture(int(context.stage.id[-1]))
        artifacts = [Artifact.from_json(a["id"], a["kind"], a["format"], a["data"]) for a in recorded["artifacts"]]
        return StageResult(inputs=recorded["inputs"], artifacts=artifacts, checks=recorded["checks"], notes=recorded["notes"])


def banned_words() -> list[str]:
    """The kitchen words that no learner reads, from src/copy/banned.ts."""
    text = (ROOT / "src/copy/banned.ts").read_text(encoding="utf-8")
    block = re.search(r"BANNED_WORDS: readonly string\[\] = \[(.*?)\n\]", text, re.S)
    assert block is not None
    return re.findall(r"'([^']+)'", block.group(1))


def stages_ts_row(stage: str) -> dict[str, list[str]]:
    """The lists that packages/verify/stages.ts gives a stage."""
    text = (ROOT / "packages/verify/stages.ts").read_text(encoding="utf-8")
    line = re.search(rf"stage\('{re.escape(stage)}', \{{(.*?)\}}\)", text)
    assert line is not None
    return {key: re.findall(r"'([^']+)'", body) for key, body in re.findall(r"(\w+): \[(.*?)\]", line.group(1))}


class Declared(unittest.TestCase):
    def test_the_lab_is_declared_well_and_found_by_its_id(self) -> None:
        self.assertEqual(LAB.problems(), [])
        self.assertIs(labs.load_lab("tr0.forward"), LAB)
        self.assertEqual(sorted(LAB.stages), ["tr0.forward.s1", "tr0.forward.s2", "tr0.forward.s3"])
        self.assertEqual(LAB.environment, "cpu")

    def test_the_module_imports_without_torch(self) -> None:
        code = "import sys; sys.modules['torch'] = None; sys.modules['transformers'] = None; import enginespace_grader.labs.tr0_forward as m; print(m.LAB.id)"
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=False)
        self.assertEqual((done.returncode, done.stdout.strip()), (0, "tr0.forward"), done.stderr)

    def test_the_checks_each_stage_reports_are_the_ones_the_site_requires(self) -> None:
        s1, s2, s3 = (stages_ts_row(f"tr0.forward.s{n}") for n in (1, 2, 3))
        self.assertEqual(list(LAB.stages["tr0.forward.s1"].checks), s1["optional"])
        self.assertEqual(list(LAB.stages["tr0.forward.s2"].checks), s2["attested"])
        self.assertEqual(list(LAB.stages["tr0.forward.s3"].checks), s3["attested"])
        # The browser re-checks the argmax ids, so the grader reports no check of that name: it hands over the ids.
        self.assertEqual(s2["rechecked"], ["argmax-bank"])
        self.assertTrue(all("argmax" not in check for stage in LAB.stages.values() for check in stage.checks))

    def test_every_check_has_a_label_and_a_label_has_a_check(self) -> None:
        reported = {check for stage in LAB.stages.values() for check in stage.checks}
        self.assertEqual(set(CHECK_LABELS), reported)

    def test_no_check_id_or_label_carries_a_banned_word(self) -> None:
        words = banned_words()
        self.assertGreater(len(words), 20)
        for text in [*CHECK_LABELS, *CHECK_LABELS.values(), *(stage.title for stage in LAB.stages.values()), LAB.title]:
            for word in words:
                self.assertIsNone(re.search(rf"(?<![A-Za-z]){re.escape(word)}(?![A-Za-z])", text, re.I), f"{word!r} in {text!r}")

    def test_the_labels_are_the_ones_the_lab_page_shows(self) -> None:
        page = (ROOT / "src/labs/specimen.ts").read_text(encoding="utf-8")
        for check_id, label in CHECK_LABELS.items():
            self.assertIn(label, page, check_id)

    def test_the_five_points_are_the_ones_the_schema_names(self) -> None:
        text = (ROOT / "packages/schema/bundle.ts").read_text(encoding="utf-8")
        names = re.search(r"TR0_POINT_NAMES = \[(.*?)\] as const", text, re.S)
        assert names is not None
        self.assertEqual(re.findall(r"'([^']+)'", names.group(1)), list(POINT_NAMES))
        self.assertEqual(len(POINT_NAMES), 5)


class Guard(unittest.TestCase):
    def test_a_forward_pass_that_imports_nothing_of_transformers_is_clean(self) -> None:
        self.assertEqual(scan_source("import torch\nfrom torch import nn\n\ndef build(config, weights):\n    return nn.Module()\n"), [])

    def test_each_way_to_reach_the_models_is_found_with_its_line(self) -> None:
        cases = {
            "import transformers.models.qwen3.modeling_qwen3 as q": "line 1: imports transformers.models.qwen3.modeling_qwen3",
            "x = 1\nfrom transformers.models.qwen3 import Qwen3Model": "line 2: imports from transformers.models.qwen3",
            "from transformers import AutoModelForCausalLM": "line 1: imports AutoModelForCausalLM from transformers",
            "from transformers import Qwen3ForCausalLM as Q": "line 1: imports Qwen3ForCausalLM from transformers",
            "from transformers import pipeline": "line 1: imports pipeline from transformers",
            "from transformers import models": "line 1: imports models from transformers",
            "import transformers\nm = transformers.AutoModel.from_pretrained('x')": "line 2: uses transformers.AutoModel",
            "import transformers as t\nt.Qwen3Model": "line 2: uses transformers.Qwen3Model",
            "import importlib\nimportlib.import_module('transformers.models.qwen3')": "line 2: names transformers.models.qwen3 in a string",
            "__import__('transformers.models')": "line 1: names transformers.models in a string",
        }
        for source, expected in cases.items():
            found = scan_source(source)
            self.assertTrue(any(line.startswith(expected) for line in found), f"{source!r}: {found}")

    def test_a_tokenizer_a_config_and_the_rest_of_transformers_are_allowed(self) -> None:
        self.assertEqual(scan_source("from transformers import AutoTokenizer, AutoConfig, set_seed\nimport transformers\nprint(transformers.__version__)\nx = transformers.AutoTokenizer"), [])

    def test_a_file_that_is_not_python_is_a_finding_and_not_a_pass(self) -> None:
        found = scan_source("def build(:\n")
        self.assertEqual(len(found), 1)
        self.assertIn("line 1: the file is not Python", found[0])

    def test_a_relative_import_named_models_is_not_the_guarded_package(self) -> None:
        self.assertEqual(scan_source("from .models import Block\nfrom . import transformers"), [])

    def test_the_worker_imports_nothing_of_the_grader(self) -> None:
        tree = ast.parse(Path(tr0_forward_worker.__file__).read_text(encoding="utf-8"))
        roots = {alias.name.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
        roots |= {(node.module or "").split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.level == 0}
        self.assertNotIn("enginespace_grader", roots)
        self.assertEqual(sorted(roots - set(sys.stdlib_module_names)), ["safetensors", "torch"])

    def test_the_guard_refuses_the_models_and_writes_the_name_down_whatever_the_file_catches(self) -> None:
        guard = tr0_forward_worker.Guard()
        self.assertIsNone(guard.find_spec("json"))
        self.assertIsNone(guard.find_spec("transformers"))
        self.assertIsNone(guard.find_spec("transformers.modeling_utils"))
        for name in ("transformers.models", "transformers.models.qwen3.modeling_qwen3"):
            with self.assertRaises(ImportError) as caught:
                guard.find_spec(name)
            self.assertIn(name, str(caught.exception))
        self.assertEqual(guard.refused, ["transformers.models", "transformers.models.qwen3.modeling_qwen3"])


class Compare(unittest.TestCase):
    def test_two_arrays_within_the_bound_pass_and_the_boundary_is_inside(self) -> None:
        check = allclose_check("logits-fp32", [[1.0, 2.0], [3.0, 4.0]], [[1.0, 2.0], [3.0, 4.0 + 1e-3]], 1e-3 + 1e-12, what="the logits")
        self.assertTrue(check["pass"], check)
        self.assertEqual((check["kind"], check["n"], check["bound"]), ("correctness", 4, 1e-3 + 1e-12))
        self.assertAlmostEqual(check["value"], 1e-3, places=12)

    def test_one_element_beyond_the_bound_fails_whatever_the_rest_is(self) -> None:
        check = allclose_check("logits-fp32", [0.0] * 99 + [0.5], [0.0] * 100, 1e-3, what="the logits")
        self.assertFalse(check["pass"])
        self.assertEqual(check["value"], 0.5)
        self.assertIn("beyond the bound 1e-03, over 100 elements", check["detail"])

    def test_a_nan_and_an_infinite_number_fail_and_are_not_passed_over_by_the_maximum(self) -> None:
        for bad in (float("nan"), float("inf")):
            check = allclose_check("logits-fp32", [0.0, bad, 0.0], [0.0, 0.0, 0.0], 1e-3, what="the logits")
            self.assertFalse(check["pass"], bad)
            self.assertNotIn("value", check)
            self.assertIn("NaN or an infinite", check["detail"])

    def test_arrays_of_different_shapes_are_not_close(self) -> None:
        check = allclose_check("logits-fp32", [[0.0, 0.0]], [0.0, 0.0], 1e-3, what="the logits")
        self.assertFalse(check["pass"])
        self.assertIn("the shapes differ: [1, 2] against the reference's [2]", check["detail"])

    def test_an_empty_comparison_is_not_a_pass(self) -> None:
        self.assertFalse(allclose_check("logits-fp32", [], [], 1e-3, what="the logits")["pass"])
        self.assertIsNone(max_abs_difference([], []).worst)

    def test_a_ragged_list_and_a_string_are_refused_by_name(self) -> None:
        self.assertIn("rows differ", max_abs_difference([[1.0], [1.0, 2.0]], [[1.0], [1.0, 2.0]]).problem)
        self.assertIn("str is not an array", max_abs_difference("abc", "abc").problem)


class Prompts(unittest.TestCase):
    def test_the_pool_is_the_same_every_time_and_inside_the_vocabulary(self) -> None:
        first = pool_prompts(151936)
        self.assertEqual(first, pool_prompts(151936))
        self.assertEqual((len(first), {len(row) for row in first}), (POOL_PROMPTS, {POOL_LENGTH}))
        self.assertTrue(all(0 <= token < 151936 for row in first for token in row))
        self.assertGreater(len({token for row in first for token in row}), POOL_PROMPTS * POOL_LENGTH // 2)

    def test_the_pool_of_a_small_vocabulary_stays_inside_it(self) -> None:
        self.assertTrue(all(0 <= token < 512 for row in pool_prompts(512) for token in row))

    def test_a_position_is_the_prompt_times_the_length_and_the_place(self) -> None:
        self.assertEqual([pool_position(0, 0), pool_position(0, 23), pool_position(1, 0), pool_position(7, 23)], [0, 23, 24, 191])

    def test_the_prompts_of_the_pool_do_not_move_with_the_challenge(self) -> None:
        self.assertEqual(pool_prompts(151936)[3][:4], pool_prompts(151936)[3][:4])
        source = Path(tr0_forward.__file__).read_text(encoding="utf-8")
        self.assertNotIn("context.rng", source[source.index("def pool_prompts") : source.index("def pool_position")])


class Receipts(unittest.TestCase):
    def grade(self, number: int) -> Any:
        with tempfile.TemporaryDirectory(prefix="enginespace-test-") as out:
            return run_stage(
                RecordedLab(),
                f"tr0.forward.s{number}",
                format_challenge(f"tr0.forward.s{number}", 0x2B1D5EED, "ABCDEFGHJKLMNPQR", "20261104"),
                out_dir=Path(out),
                environment=sample_environment(),
                pins=sample_pins(),
                provenance=PROVENANCE,
                now=lambda: NOW,
                log=lambda message: None,
            )

    def test_each_stage_of_the_recorded_run_makes_a_receipt_the_schema_accepts(self) -> None:
        for number in (1, 2, 3):
            outcome = self.grade(number)
            self.assertTrue(outcome.passed, outcome.failed_checks)
            self.assertEqual(outcome.receipt["lab"], "tr0.forward")
            reported = [check["id"] for check in outcome.receipt["checks"]]
            self.assertEqual(reported, list(LAB.stages[f"tr0.forward.s{number}"].checks))

    def test_stage_two_carries_the_ids_for_the_browser_and_the_five_points(self) -> None:
        receipt = self.grade(2).receipt
        entries = {entry["id"]: entry for entry in receipt["artifacts"]}
        self.assertEqual({key: (entry["kind"], entry["format"], entry["inBundle"]) for key, entry in entries.items()}, {"argmax": ("outputs", "enginespace/argmax@1", True), "points": ("report", "enginespace/tr0-points@1", True)})

    def test_stage_one_carries_no_artifact_and_stage_three_only_the_points(self) -> None:
        self.assertEqual(self.grade(1).receipt["artifacts"], [])
        self.assertEqual([entry["id"] for entry in self.grade(3).receipt["artifacts"]], ["points"])

    def test_the_argmax_artifact_has_a_position_for_each_token_of_the_pool(self) -> None:
        data = next(a for a in fixture(2)["artifacts"] if a["id"] == "argmax")["data"]
        self.assertEqual(data["positions"], list(range(POOL_PROMPTS * POOL_LENGTH)))
        self.assertEqual(len(data["ids"]), len(data["positions"]))
        self.assertTrue(all(0 <= token < 512 for token in data["ids"]))

    def test_the_recorded_bundle_is_a_bundle_and_holds_no_path(self) -> None:
        outcome = self.grade(2)
        bundle = build_bundle(outcome.receipt, [Artifact.from_json(a["id"], a["kind"], a["format"], a["data"]) for a in fixture(2)["artifacts"]])
        self.assertEqual(bundle_problems(bundle), [])
        text = json.dumps(bundle)
        for needle in ("/ho" + "me/", "/t" + "mp/", "/Us" + "ers/", "forward.py"):
            self.assertNotIn(needle, text)


class PointsArtifact(unittest.TestCase):
    def points(self, number: int) -> dict[str, Any]:
        return next(a for a in fixture(number)["artifacts"] if a["id"] == "points")["data"]

    def test_the_schema_is_one_the_grader_carries(self) -> None:
        self.assertIn("tr0-points", SCHEMA_NAMES)

    def test_the_recorded_points_of_both_stages_are_valid(self) -> None:
        for number in (2, 3):
            self.assertEqual(schema_problems("tr0-points", self.points(number)), [], number)
            self.assertEqual([point["name"] for point in self.points(number)["points"]], list(POINT_NAMES))

    def test_a_point_that_was_not_found_has_no_shape(self) -> None:
        document = self.points(2)
        document["points"][3] = {"name": "final-norm", "found": False}
        self.assertEqual(schema_problems("tr0-points", document), [])
        document["points"][3] = {"name": "final-norm", "found": False, "shape": [1]}
        self.assertNotEqual(schema_problems("tr0-points", document), [])

    def test_what_the_schema_refuses(self) -> None:
        for change in (
            lambda d: d.update(schema="enginespace/tr0-points@2"),
            lambda d: d.update(stage="tr0.forward.s1"),
            lambda d: d.update(call="whole"),
            lambda d: d.update(extra=1),
            lambda d: d["points"].pop(),
            lambda d: d["points"][0].update(dtype="float8"),
            lambda d: d["points"][0].update(shape=[-1, 2]),
            lambda d: d["points"][1].update(name="norm"),
            lambda d: d["points"][2].update(extra=True),
        ):
            document = self.points(2)
            change(document)
            self.assertNotEqual(schema_problems("tr0-points", document), [])


class SolutionFile(unittest.TestCase):
    def test_a_named_file_wins_and_a_missing_one_says_what_to_do(self) -> None:
        with tempfile.TemporaryDirectory(prefix="enginespace-test-") as folder:
            here = Path(folder)
            mine = here / "mine.py"
            mine.write_text("x = 1\n", encoding="utf-8")
            self.assertEqual(solution_file({"ENGINESPACE_SOLUTION": str(mine)}, here), mine)
            with self.assertRaises(GraderError) as caught:
                solution_file({}, here)
            self.assertIn("tr0-forward/forward.py", str(caught.exception))
            self.assertIn("ENGINESPACE_SOLUTION", str(caught.exception))
            self.assertNotIn(folder, str(caught.exception))
            (here / "tr0-forward").mkdir()
            (here / "tr0-forward" / "forward.py").write_text("x = 1\n", encoding="utf-8")
            self.assertEqual(solution_file({}, here), here / "tr0-forward" / "forward.py")
            with self.assertRaises(GraderError):
                solution_file({"ENGINESPACE_SOLUTION": str(here / "nope.py")}, here)


class KitHoldsNoSolution(unittest.TestCase):
    def test_the_published_member_list_holds_the_module_and_no_solution(self) -> None:
        manifest = json.loads((ROOT / "public/labs/manifest.json").read_text(encoding="utf-8"))
        paths = [member["path"] for entry in manifest["files"] for member in entry.get("members", [])]
        self.assertTrue(paths)
        self.assertIn("grader/src/enginespace_grader/labs/tr0_forward.py", paths)
        self.assertIn("grader/src/enginespace_grader/labs/tr0_forward_worker.py", paths)
        for path in paths:
            for word in ("reference_forward", "mutant", "solutions", "cache_bug", "delegating_forward", "sneaky_forward"):
                self.assertNotIn(word, path)

    def test_the_solutions_are_under_the_tests_and_nowhere_in_the_package(self) -> None:
        package = Path(tr0_forward.__file__).parent.parent
        names = {path.name for path in package.rglob("*.py")}
        self.assertFalse({"reference_forward.py", "mutant_forward.py"} & names)
        self.assertTrue((ROOT / "labs/grader/tests/cpu/solutions/reference_forward.py").is_file())


class CpuTestsNeedTorch(unittest.TestCase):
    def run_cpu_tests(self, ci: bool) -> subprocess.CompletedProcess[str]:
        code = (
            "import sys; sys.modules['torch'] = None; sys.modules['transformers'] = None; import unittest; "
            "sys.argv = ['unittest', 'discover', '-s', 'labs/grader/tests/cpu', '-p', 'test_*.py']; unittest.main(module=None)"
        )
        environment = {key: value for key, value in os.environ.items() if key not in ("CI", "GITHUB_ACTIONS")}
        if ci:
            environment["CI"] = "true"
        source = str(ROOT / "labs/grader/src")
        environment["PYTHONPATH"] = source + os.pathsep + environment.get("PYTHONPATH", "")
        return subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=ROOT, env=environment, check=False)

    def test_the_cpu_tests_fail_and_do_not_pass_by_being_left_out_when_torch_is_missing_in_ci(self) -> None:
        done = self.run_cpu_tests(ci=True)
        self.assertNotEqual(done.returncode, 0, done.stderr[-2000:])
        self.assertIn("cannot be imported here", done.stderr)
        self.assertNotIn("OK", done.stderr.splitlines()[-1])
        self.assertNotRegex(done.stderr, "sk" + r"ipped=\d")
        self.assertRegex(done.stderr, r"FAILED \(failures=\d+")

    def test_they_fail_off_ci_too(self) -> None:
        done = self.run_cpu_tests(ci=False)
        self.assertNotEqual(done.returncode, 0)
        self.assertNotRegex(done.stderr, "sk" + r"ipped=\d")

    def test_no_test_of_the_lab_can_be_left_out(self) -> None:
        # The words are written in pieces so that this file does not hold them either.
        left_out = ("sk" + "ip", "xf" + "ail", "fix" + "me", "expected" + "Failure", "Skip" + "Test")
        pattern = re.compile("|".join(rf"\b{word}" for word in left_out), re.I)
        for path in [ROOT / "labs/grader/tests/test_tr0_forward.py", *sorted((ROOT / "labs/grader/tests/cpu").rglob("*.py"))]:
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if "left_out" in line:
                    continue
                self.assertIsNone(pattern.search(line), f"{path.name}:{number}: {line}")


if __name__ == "__main__":
    unittest.main()
