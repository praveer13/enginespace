"""The lab plug-in interface (ARCHITECTURE section 9.2): how a lab is declared, registered and found."""

from __future__ import annotations

import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from typing import ClassVar

from enginespace_grader import labs
from enginespace_grader.errors import GraderError
from enginespace_grader.labs import Lab, Stage, StageContext, StageResult

from .samples import SampleLab


class Declared(unittest.TestCase):
    def test_the_sample_lab_is_declared_well(self) -> None:
        self.assertEqual(SampleLab.problems(), [])

    def test_a_declaration_that_cannot_be_run_lists_what_is_wrong(self) -> None:
        class NoId(Lab):
            id: ClassVar[str] = "Not A Lab"
            title: ClassVar[str] = "x"
            environment: ClassVar[str] = "cpu"
            stages: ClassVar[dict[str, Stage]] = {}

            def run(self, context: StageContext) -> StageResult:
                return StageResult()

        self.assertEqual(len(NoId.problems()), 1)
        self.assertIn("not a lab id such as tr8.replay", NoId.problems()[0])

        class Muddled(Lab):
            id: ClassVar[str] = "tr8.replay"
            title: ClassVar[str] = "x"
            environment: ClassVar[str] = ""
            stages: ClassVar[dict[str, Stage]] = {
                "tr8.replay.s1": Stage("tr8.replay.s2", "filed under another id"),
                "tr8.replay.s3": Stage("tr8.replay.s3", "twice", checks=("a", "a")),
                "tr9.replay.s1": Stage("tr9.replay.s1", "another module"),
            }

            def run(self, context: StageContext) -> StageResult:
                return StageResult()

        problems = Muddled.problems()
        self.assertTrue(any("filed as 'tr8.replay.s1'" in problem for problem in problems), problems)
        self.assertTrue(any("lists a check twice" in problem for problem in problems), problems)
        self.assertTrue(any("tr9.replay.s1" in problem for problem in problems), problems)
        self.assertTrue(any("engine environment" in problem for problem in problems), problems)

    def test_a_lab_with_no_stage_is_not_runnable(self) -> None:
        class Empty(Lab):
            id: ClassVar[str] = "tr8.replay"
            title: ClassVar[str] = "x"
            environment: ClassVar[str] = "vllm"
            stages: ClassVar[dict[str, Stage]] = {}

            def run(self, context: StageContext) -> StageResult:
                return StageResult()

        self.assertEqual(Empty.problems(), ["it declares no stage"])

    def test_a_lab_must_implement_run(self) -> None:
        class Unfinished(Lab):
            id: ClassVar[str] = "tr8.replay"
            title: ClassVar[str] = "x"
            environment: ClassVar[str] = "vllm"
            stages: ClassVar[dict[str, Stage]] = {}

        with self.assertRaises(TypeError):
            Unfinished()  # type: ignore[abstract]


class Registered(unittest.TestCase):
    def tearDown(self) -> None:
        labs.unregister("tr3.profile")

    def test_a_registered_lab_is_found_by_its_id_and_not_twice(self) -> None:
        lab = SampleLab()
        labs.register(lab)
        self.assertIs(labs.load_lab("tr3.profile"), lab)
        self.assertEqual(labs.registered_labs(), ["tr3.profile"])
        with self.assertRaises(ValueError):
            labs.register(SampleLab())
        labs.unregister("tr3.profile")
        self.assertEqual(labs.registered_labs(), [])
        labs.unregister("tr3.profile")  # taking away what is not there is not an error

    def test_a_lab_declared_wrongly_is_not_registered(self) -> None:
        class Bad(SampleLab):
            id: ClassVar[str] = "nonsense"

        with self.assertRaises(ValueError):
            labs.register(Bad())
        self.assertEqual(labs.registered_labs(), [])


class Found(unittest.TestCase):
    def test_the_module_of_a_lab_is_its_id_with_underscores(self) -> None:
        for lab_id, module in (("tr0.forward", "tr0_forward"), ("tr8.replay", "tr8_replay"), ("tr1.nano-vllm", "tr1_nano_vllm"), ("tr5b.connector", "tr5b_connector"), ("capstone.pair", "capstone_pair")):
            self.assertEqual(labs.module_for_lab(lab_id), module)
        for bad in ("", "tr9.x", "tr8", "tr8.", "TR8.replay", "tr8.replay.s1", "../etc.passwd", "tr8.re..play"):
            with self.assertRaises(GraderError):
                labs.module_for_lab(bad)

    def test_a_stage_id_names_its_lab(self) -> None:
        self.assertTrue(labs.is_stage_id("tr8.replay.s2"))
        self.assertTrue(labs.is_stage_id("tr1.nano-vllm.s10"))
        for bad in ("tr8.replay", "tr8.replay.s", "tr8.replay.s2\n", "tr9.replay.s2", "tr8..s2", ""):
            self.assertFalse(labs.is_stage_id(bad), bad)
        self.assertEqual(labs.lab_of_stage_id("tr1.nano-vllm.s10"), "tr1.nano-vllm")
        with self.assertRaises(GraderError):
            labs.lab_of_stage_id("tr8.replay")

    def test_a_lab_this_install_does_not_have_is_a_message(self) -> None:
        with self.assertRaises(GraderError) as caught:
            labs.load_lab("tr8.replay")
        self.assertIn("no lab tr8.replay", str(caught.exception))

    def test_a_lab_id_that_would_climb_out_of_the_package_is_refused_before_anything_is_imported(self) -> None:
        with self.assertRaises(GraderError):
            labs.load_lab("../../os.path")

    def test_a_module_of_the_package_is_loaded_for_its_lab(self) -> None:
        folder = Path(next(iter(labs.__path__)))
        written: list[Path] = []
        try:
            for name, body in (
                ("tr7_example.py", "from .. import labs\nfrom enginespace_grader.labs import Lab, Stage, StageResult\n\nclass L(Lab):\n    id = 'tr7.example'\n    title = 't'\n    environment = 'cpu'\n    stages = {'tr7.example.s1': Stage('tr7.example.s1', 's')}\n    def run(self, context):\n        return StageResult()\n\nLAB = L()\n"),
                ("tr7_nolab.py", "X = 1\n"),
                ("tr7_wrongid.py", "from enginespace_grader.labs import Lab, Stage, StageResult\n\nclass L(Lab):\n    id = 'tr7.other'\n    title = 't'\n    environment = 'cpu'\n    stages = {'tr7.other.s1': Stage('tr7.other.s1', 's')}\n    def run(self, context):\n        return StageResult()\n\nLAB = L()\n"),
                ("tr7_needs.py", "import a_module_that_is_not_installed\n"),
            ):
                path = folder / name
                path.write_text(textwrap.dedent(body), encoding="utf-8")
                written.append(path)
            self.assertEqual(labs.load_lab("tr7.example").id, "tr7.example")
            with self.assertRaises(GraderError) as caught:
                labs.load_lab("tr7.nolab")
            self.assertIn("does not export a LAB", str(caught.exception))
            with self.assertRaises(GraderError) as caught:
                labs.load_lab("tr7.wrongid")
            self.assertIn("'tr7.other'", str(caught.exception))
            with self.assertRaises(GraderError) as caught:
                labs.load_lab("tr7.needs")
            self.assertIn("a_module_that_is_not_installed", str(caught.exception))
            self.assertIn("not installed", str(caught.exception))
        finally:
            for path in written:
                path.unlink(missing_ok=True)
            for name in [name for name in sys.modules if name.startswith("enginespace_grader.labs.tr7_")]:
                del sys.modules[name]


class Context(unittest.TestCase):
    def test_a_context_hands_out_the_streams_of_the_token(self) -> None:
        from enginespace_grader.challenge import parse_challenge
        from enginespace_grader.rng import rng_for

        from . import samples

        token = parse_challenge(samples.TOKEN)
        assert token is not None
        with tempfile.TemporaryDirectory() as scratch:
            context = StageContext(challenge=token, stage=SampleLab.stages["tr3.profile.s2"], workdir=Path(scratch))
            draw, direct = context.rng("workload/arrivals"), rng_for(0x0BADC0DE, "workload/arrivals")
            self.assertEqual([draw() for _ in range(5)], [direct() for _ in range(5)])
            self.assertEqual(context.seed, 0x0BADC0DE)
            context.log("progress goes nowhere by default")


if __name__ == "__main__":
    unittest.main()
