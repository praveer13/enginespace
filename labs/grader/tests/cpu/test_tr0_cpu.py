"""The TR0 lab's stages, run on a small random-weight Qwen3 in the CPU environment (labs.yml's cpu job).

The reference solution passes stages 1 to 3, a wrong RMSNorm epsilon fails stage 2, and the cache's length equals the prefix's at every step. The model is built here from the
pinned `transformers` and never downloaded. What these runs say about Qwen3-0.6B itself is nothing: its margin under 1e-3 is measured by the weights job (D-075).
"""

from __future__ import annotations

import gzip
import json
import sys
import tempfile
import unittest
from pathlib import Path

from support import CpuCase, SOLUTIONS, check_of, grade_stage, points_of, random_model

from enginespace_grader.labs.tr0_forward import DECODE_STEPS, LOGIT_BOUND, POINT_NAMES, POOL_LENGTH, POOL_PROMPTS, PREFIX_LENGTH, Tr0Forward
from enginespace_grader.schemas import schema_problems

REFERENCE = SOLUTIONS / "reference_forward.py"
#: The file the kit hands a learner (labs/gpu/tr0-forward/starter/forward.py): every piece of it still to write.
STARTER = Path(__file__).resolve().parents[2].parent / "gpu" / "tr0-forward" / "starter" / "forward.py"
MUTANT = SOLUTIONS / "mutant_forward.py"


class Grading(CpuCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.folder = tempfile.TemporaryDirectory(prefix="enginespace-model-")
        cls.addClassCleanup(cls.folder.cleanup)
        try:
            cls.source = random_model(Path(cls.folder.name))
        except ImportError:
            cls.source = None  # setUp says why, in each test

    def grade(self, solution: Path, stage: str):  # type: ignore[no-untyped-def]
        assert self.source is not None
        return grade_stage(self.source, solution, stage)

    def test_the_reference_passes_stage_one(self) -> None:
        result = self.grade(REFERENCE, "tr0.forward.s1")
        check = check_of(result, "layer0-hidden")
        self.assertTrue(check["pass"], check["detail"])
        self.assertEqual(check["n"], 2 * 16 * 64)

    def test_the_reference_passes_stage_two(self) -> None:
        result = self.grade(REFERENCE, "tr0.forward.s2")
        self.assertEqual([check["id"] for check in result.checks], ["logits-fp32", "import-guard"])
        for check in result.checks:
            self.assertTrue(check["pass"], check["detail"])
        logits = check_of(result, "logits-fp32")
        self.assertEqual(logits["bound"], LOGIT_BOUND)
        self.assertEqual(logits["n"], POOL_PROMPTS * POOL_LENGTH * 512)
        sys.stderr.write(f"\n[margin] reference, stage 2, random model: worst logit difference {logits['value']:.3e} against the bound {LOGIT_BOUND:.0e}\n")

    def test_the_reference_passes_stage_three_and_the_cache_length_equals_the_prefix_at_every_step(self) -> None:
        result = self.grade(REFERENCE, "tr0.forward.s3")
        self.assertEqual([check["id"] for check in result.checks], ["cache-logits", "cache-lengths"])
        for check in result.checks:
            self.assertTrue(check["pass"], check["detail"])
        lengths = check_of(result, "cache-lengths")
        self.assertEqual(lengths["n"], DECODE_STEPS + 1)
        self.assertEqual(lengths["value"], 0.0)
        self.assertIn(f"after each of the {DECODE_STEPS + 1} steps", lengths["detail"])
        sys.stderr.write(f"\n[margin] reference, stage 3, random model: {check_of(result, 'cache-logits')['detail']}\n")

    def test_a_wrong_epsilon_fails_stage_two_and_nothing_else_about_it_changes(self) -> None:
        result = self.grade(MUTANT, "tr0.forward.s2")
        logits = check_of(result, "logits-fp32")
        self.assertFalse(logits["pass"], logits["detail"])
        self.assertGreater(logits["value"], LOGIT_BOUND)
        self.assertTrue(check_of(result, "import-guard")["pass"])
        sys.stderr.write(f"\n[margin] mutant (epsilon 1e-3), stage 2, random model: worst logit difference {logits['value']:.3e}\n")

    def test_a_wrong_epsilon_fails_the_cached_logits_against_the_reference_and_not_against_itself(self) -> None:
        result = self.grade(MUTANT, "tr0.forward.s3")
        self.assertFalse(check_of(result, "cache-logits")["pass"])
        self.assertIn("against your own uncached forward pass", check_of(result, "cache-logits")["detail"])
        self.assertTrue(check_of(result, "cache-lengths")["pass"])

    def test_a_cache_that_miscounts_fails_only_the_lengths(self) -> None:
        result = self.grade(SOLUTIONS / "cache_bug_forward.py", "tr0.forward.s3")
        self.assertTrue(check_of(result, "cache-logits")["pass"], check_of(result, "cache-logits")["detail"])
        lengths = check_of(result, "cache-lengths")
        self.assertFalse(lengths["pass"])
        self.assertEqual(lengths["value"], float(DECODE_STEPS + 1))
        self.assertIn(f"holds {PREFIX_LENGTH + 1} positions, and the prefix is {PREFIX_LENGTH} long", lengths["detail"])

    def test_the_same_token_grades_the_same_twice(self) -> None:
        first = self.grade(REFERENCE, "tr0.forward.s2")
        second = self.grade(REFERENCE, "tr0.forward.s2")
        self.assertEqual(first.inputs, second.inputs)
        self.assertEqual(points_of(first), points_of(second))
        argmax = [artifact for artifact in first.artifacts if artifact.id == "argmax"][0]
        self.assertEqual(argmax.data["positions"], list(range(POOL_PROMPTS * POOL_LENGTH)))
        self.assertEqual(len(argmax.data["ids"]), POOL_PROMPTS * POOL_LENGTH)
        self.assertEqual(argmax.data["ids"], [artifact for artifact in second.artifacts if artifact.id == "argmax"][0].data["ids"])
        self.assertEqual([artifact.id for artifact in first.artifacts], ["argmax", "points"])

    def test_the_five_points_of_stage_two_are_the_learners_own_tensors(self) -> None:
        points = points_of(self.grade(REFERENCE, "tr0.forward.s2"))
        self.assertEqual(schema_problems("tr0-points", points), [])
        self.assertEqual(points["call"], "prompt")
        self.assertEqual([point["name"] for point in points["points"]], list(POINT_NAMES))
        shapes = {point["name"]: (point["shape"], point["strides"], point["dtype"]) for point in points["points"]}
        hidden = ([POOL_PROMPTS, POOL_LENGTH, 64], [POOL_LENGTH * 64, 64, 1], "float32")
        for name in ("embedding", "attention", "mlp", "final-norm"):
            self.assertEqual(shapes[name], hidden, name)
        self.assertEqual(shapes["logits"], ([POOL_PROMPTS, POOL_LENGTH, 512], [POOL_LENGTH * 512, 512, 1], "float32"))

    def test_the_five_points_of_stage_three_are_the_last_decode_step(self) -> None:
        points = points_of(self.grade(REFERENCE, "tr0.forward.s3"))
        self.assertEqual(schema_problems("tr0-points", points), [])
        self.assertEqual(points["call"], "decode-step")
        self.assertTrue(all(point["found"] for point in points["points"]))
        for point in points["points"]:
            self.assertEqual(point["shape"][:2], [1, 1], point["name"])
            self.assertEqual(point["strides"][-1], 1, point["name"])

    def test_a_point_with_no_module_is_recorded_as_not_found_and_the_note_says_so(self) -> None:
        result = self.grade(SOLUTIONS / "unhooked_forward.py", "tr0.forward.s2")
        self.assertTrue(check_of(result, "logits-fp32")["pass"], check_of(result, "logits-fp32")["detail"])
        points = points_of(result)
        self.assertEqual(schema_problems("tr0-points", points), [])
        self.assertEqual([point["found"] for point in points["points"]], [True, True, True, False, True])
        self.assertIn("final-norm", result.notes or "")

    def test_a_file_that_imports_the_models_is_refused_and_never_run(self) -> None:
        result = self.grade(SOLUTIONS / "delegating_forward.py", "tr0.forward.s2")
        guard = check_of(result, "import-guard")
        self.assertFalse(guard["pass"])
        self.assertIn("AutoModelForCausalLM", guard["detail"])
        self.assertFalse(check_of(result, "logits-fp32")["pass"])
        self.assertIn("not compared", check_of(result, "logits-fp32")["detail"])
        self.assertEqual(result.artifacts, [])

    def test_a_file_that_imports_the_models_by_a_name_made_at_run_time_is_refused_by_the_running_guard(self) -> None:
        result = self.grade(SOLUTIONS / "sneaky_forward.py", "tr0.forward.s2")
        guard = check_of(result, "import-guard")
        self.assertFalse(guard["pass"])
        self.assertIn("transformers.models", guard["detail"])
        self.assertFalse(check_of(result, "logits-fp32")["pass"])

    def test_a_forward_pass_that_raises_is_a_failed_check_with_its_error_and_no_path(self) -> None:
        result = self.grade(SOLUTIONS / "raising_forward.py", "tr0.forward.s2")
        logits = check_of(result, "logits-fp32")
        self.assertFalse(logits["pass"])
        self.assertIn("ValueError", logits["detail"])
        self.assertIn("[2048, 1024]", logits["detail"])
        self.assertTrue(check_of(result, "import-guard")["pass"])
        for text in (check["detail"] for check in result.checks):
            self.assertNotIn(str(SOLUTIONS), text)
            self.assertNotIn("raising_forward", text)

    def test_the_starter_of_the_kit_is_graded_and_fails_every_stage_by_naming_the_piece_to_write(self) -> None:
        self.assertTrue(STARTER.is_file(), "the kit's starter is missing")
        for stage in ("tr0.forward.s1", "tr0.forward.s2", "tr0.forward.s3"):
            result = self.grade(STARTER, stage)
            graded = [check for check in result.checks if check["id"] != "import-guard"]
            self.assertTrue(graded and all(check["pass"] is False for check in graded), stage)
            self.assertIn("NotImplementedError", graded[0]["detail"], stage)
            self.assertIn("build", graded[0]["detail"], stage)
        self.assertTrue(check_of(self.grade(STARTER, "tr0.forward.s2"), "import-guard")["pass"], "an unfinished file imports nothing it should not")
        self.assertFalse((STARTER.parent / "__pycache__").exists(), "the grader writes no bytecode beside the learner's file: the kit's starter is packed from this folder")

    def test_the_other_stages_fail_the_same_way_when_the_forward_pass_raises(self) -> None:
        for stage in ("tr0.forward.s1", "tr0.forward.s3"):
            result = self.grade(SOLUTIONS / "raising_forward.py", stage)
            self.assertTrue(result.checks and all(not check["pass"] for check in result.checks), stage)


class Receipt(CpuCase):
    def test_a_graded_stage_writes_a_bundle_the_site_would_read(self) -> None:
        from labs.grader.tests.samples import NOW, PROVENANCE, sample_environment, sample_pins

        from enginespace_grader.bundle import bundle_problems
        from enginespace_grader.challenge import format_challenge
        from enginespace_grader.grade import run_stage
        from support import NONCE

        with tempfile.TemporaryDirectory(prefix="enginespace-model-") as folder, tempfile.TemporaryDirectory(prefix="enginespace-out-") as out:
            source = random_model(Path(folder))
            outcome = run_stage(
                Tr0Forward(source=source, solution=REFERENCE),
                "tr0.forward.s2",
                format_challenge("tr0.forward.s2", 0x2B1D5EED, NONCE, "20261120"),
                out_dir=Path(out),
                environment=sample_environment(),
                pins=sample_pins(),
                provenance=PROVENANCE,
                now=lambda: NOW,
                log=lambda message: None,
            )
            self.assertTrue(outcome.passed, outcome.failed_checks)
            with gzip.open(outcome.path, "rb") as packed:
                text = packed.read().decode("utf-8")
            bundle = json.loads(text)
            self.assertEqual(bundle_problems(bundle), [])
            self.assertEqual(sorted(bundle["artifacts"]), ["argmax", "points"])
            self.assertEqual(bundle["artifacts"]["argmax"]["data"]["schema"], "enginespace/argmax@1")
            self.assertNotIn(folder, text)
            self.assertNotIn(str(SOLUTIONS), text)
            entries = {entry["id"]: entry for entry in bundle["receipt"]["artifacts"]}
            self.assertEqual((entries["argmax"]["kind"], entries["points"]["kind"]), ("outputs", "report"))
            self.assertEqual([entry["kind"] for entry in bundle["receipt"]["inputs"]], ["model", "model", "prompts"])


class Recorded(CpuCase):
    def test_the_committed_fixtures_say_what_the_reference_does_now(self) -> None:
        """The fixtures that the grader's own tests replay (no torch there) are the verdicts, shapes and prompts that the reference gives today, apart from the numbers."""
        fixtures = Path(__file__).resolve().parents[1] / "synthetic" / "tr0-forward"
        with tempfile.TemporaryDirectory(prefix="enginespace-model-") as folder:
            source = random_model(Path(folder))
            for number in (1, 2, 3):
                stage = f"tr0.forward.s{number}"
                recorded = json.loads((fixtures / f"stage{number}.json").read_text(encoding="utf-8"))
                now = grade_stage(source, REFERENCE, stage)
                self.assertEqual([(c["id"], c["kind"], c["pass"], c.get("bound"), c.get("n")) for c in recorded["checks"]], [(c["id"], c["kind"], c["pass"], c.get("bound"), c.get("n")) for c in now.checks], stage)
                self.assertEqual([(a["id"], a["kind"], a["format"]) for a in recorded["artifacts"]], [(a.id, a.kind, a.format) for a in now.artifacts], stage)
                self.assertEqual(recorded["inputs"][-1], now.inputs[-1], stage)
                if number > 1:
                    self.assertEqual(next(a["data"] for a in recorded["artifacts"] if a["id"] == "points"), points_of(now), stage)


if __name__ == "__main__":
    unittest.main()
