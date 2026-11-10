"""The lab plug-in interface (ARCHITECTURE section 9.2): one module for each lab, under this package.

A lab is the code that runs one lab's stages on the learner's machine: `tr0_forward` for `tr0.forward`, `tr8_replay` for `tr8.replay`, and so on (the
name is the lab id with its dots and hyphens made underscores, `module_for_lab`). The module defines a subclass of `Lab` and exports an instance of it as
`LAB`. `enginespace grade tr8.replay.s2 --challenge <token>` finds the lab by that name, and hands its `run` a `StageContext`: the decoded challenge,
the stage, a scratch folder and the generators that derive every seeded input from the token. The lab runs the stage and returns a `StageResult`: the
inputs it used, the artifacts it made, the checks it ran and what it measured. The grader does the rest: it fingerprints the machine, builds the receipt,
checks it as the site will, and writes the bundle (grade.py).

What a lab must not do:
  - It must not choose a seed of its own. Every seeded input comes from `context.rng(salt)`, with a salt for each purpose (workload/arrivals,
    workload/prompt, and so on), so that the browser can derive the same inputs from the same token (ARCHITECTURE section 9.8).
  - It must not write a path, a host name, a user name or a secret into a check, a note or an artifact. A receipt is a file the learner moves by hand,
    and the grader never collects those (section 9.5).
  - It must not turn a learner's mistake into an exception that stops the grading. The learner's code failing a check is a check with `pass: false` and a
    detail that says why; the receipt then says it, and the site shows it. An exception is for the grader's own faults, and for things the learner can
    fix before a run is worth starting (a model that is not downloaded), which are a `GraderError` with a message that says what to do.

Everything a lab hands over is plain JSON: dict, list, str, int, float, bool and None, with text for keys. The canonical form that the hashes are taken over
refuses any other type by name, a numpy or torch scalar among them, so convert one with `float()` or `int()` before it goes in a check, a `claimed` summary or
an artifact; and a whole number must stay below 2**53.

`StageResult.checks` are the grader's own results (`make_check` in receipt.py): the site re-checks every one it can, and shows the rest as attested by
this grader (ASSESSMENT section 5.8). `Stage.checks` lists the ids that the stage must report; a stage that does not report one of them is a fault in the
lab, and the grader stops with a message instead of writing a receipt that the site would score as having skipped it.

The modules of the nine labs arrive with their tasks (W2-T16 for `tr0_forward`, W2-T19 and W2-T23 for `tr3_profile`, and so on). Until then a test, or a
lab under development, registers its lab with `register`.
"""

from __future__ import annotations

import importlib
import re
from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, ClassVar

from ..bundle import Artifact
from ..challenge import Challenge
from ..errors import GraderError
from ..rng import Rng

__all__ = ["Lab", "Stage", "StageContext", "StageResult", "is_stage_id", "lab_of_stage_id", "load_lab", "module_for_lab", "register", "registered_labs", "unregister"]

#: A lab id as a receipt names it: a module, a dot, and lower-case words joined by single hyphens (packages/schema/refs.ts, RECEIPT_LAB).
_LAB_ID = re.compile(r"(?:tr[0-8][ab]?|capstone)\.[a-z0-9]+(?:-[a-z0-9]+)*")
_STAGE_ID = re.compile(r"(?:tr[0-8][ab]?|capstone)\.[a-z0-9]+(?:-[a-z0-9]+)*\.s[0-9]+")


@dataclass(frozen=True)
class Stage:
    """One stage of a lab, such as `tr8.replay.s2`. ASSESSMENT section 5.9 names which of its checks the site requires."""

    id: str
    title: str
    #: The ids of the checks that the stage reports, every one of them whether it passes or fails.
    checks: tuple[str, ...] = ()


@dataclass(frozen=True)
class StageContext:
    """What the grader hands a stage."""

    challenge: Challenge
    stage: Stage
    #: A scratch folder for this run, which the grader removes afterwards. Put nothing in it that the learner needs to keep.
    workdir: Path
    #: Where progress goes, for the person watching. It is never part of the receipt.
    log: Callable[[str], None] = field(default=lambda message: None)

    def rng(self, salt: str) -> Rng:
        """The stream for one purpose of the stage, derived from the token as the site derives it (`rng_for(seed, salt)`)."""
        return self.challenge.rng(salt)

    @property
    def seed(self) -> int:
        return self.challenge.seed


@dataclass
class StageResult:
    """What a stage made."""

    #: Entries of the receipt's `inputs` (`make_input`): the model, the dataset, the prompts and the references the run used, by hash and size.
    inputs: list[dict[str, Any]] = field(default_factory=list[dict[str, Any]])
    #: The artifacts, in the order the receipt lists them. Those with `in_bundle` true travel in the bundle.
    artifacts: list[Artifact] = field(default_factory=list[Artifact])
    #: Entries of the receipt's `checks` (`make_check`).
    checks: list[dict[str, Any]] = field(default_factory=list[dict[str, Any]])
    #: What the run says it measured: `{"kind": "bench" | "trace" | "sweep" | "pair", "claimed": {...}}`. The site recomputes it from the artifacts.
    performance: dict[str, Any] | None = None
    #: Plain text for the learner, at most 2,000 characters. It is shown as text and never graded.
    notes: str | None = None
    #: Anything else. The site ignores it, and it is part of the receipt's hash.
    ext: dict[str, Any] | None = None


class Lab(ABC):
    """The interface of a lab. Subclass it in a module of this package and export an instance as `LAB`."""

    #: `tr8.replay`.
    id: ClassVar[str]
    #: What the lab is called on the site.
    title: ClassVar[str]
    #: The engine environment it needs, `cpu`, `vllm`, `sglang` or `nano-vllm` (labs/envs, W2-T04), which the pin check reads.
    environment: ClassVar[str]
    #: Its stages by id.
    stages: ClassVar[Mapping[str, Stage]]

    @abstractmethod
    def run(self, context: StageContext) -> StageResult:
        """Runs `context.stage` and returns what it made."""

    @classmethod
    def problems(cls) -> list[str]:
        """What is wrong with the declaration of this lab, as sentences: empty when it can be run."""
        problems: list[str] = []
        lab_id = getattr(cls, "id", None)
        if not isinstance(lab_id, str) or _LAB_ID.fullmatch(lab_id) is None:
            problems.append(f"its id {lab_id!r} is not a lab id such as tr8.replay")
            return problems
        stages: Mapping[str, Stage] = getattr(cls, "stages", {})
        if not stages:
            problems.append("it declares no stage")
        for key, stage in stages.items():
            if key != stage.id:
                problems.append(f"the stage filed as {key!r} says its id is {stage.id!r}")
            if _STAGE_ID.fullmatch(stage.id) is None or not stage.id.startswith(f"{lab_id}.s"):
                problems.append(f"{stage.id!r} is not a stage id of {lab_id}, such as {lab_id}.s1")
            if len(set(stage.checks)) != len(stage.checks):
                problems.append(f"{stage.id} lists a check twice")
        if not getattr(cls, "environment", None):
            problems.append("it does not say which engine environment it needs")
        return problems


_registry: dict[str, Lab] = {}


def is_stage_id(text: str) -> bool:
    """Whether `text` is a stage id such as `tr8.replay.s2`."""
    return _STAGE_ID.fullmatch(text) is not None


def lab_of_stage_id(stage_id: str) -> str:
    """The lab of a stage id: `tr8.replay` for `tr8.replay.s2`. Anything that is not a stage id is a `GraderError` that says what one looks like."""
    if not is_stage_id(stage_id):
        raise GraderError(f"{stage_id!r} is not a stage id such as tr8.replay.s2")
    return stage_id[: stage_id.rindex(".")]


def module_for_lab(lab_id: str) -> str:
    """The name of the module that holds a lab: `tr8.replay` is `tr8_replay`, and `tr1.nano-vllm` is `tr1_nano_vllm`."""
    if _LAB_ID.fullmatch(lab_id) is None:
        raise GraderError(f"{lab_id!r} is not a lab id such as tr8.replay")
    return lab_id.replace(".", "_").replace("-", "_")


def register(lab: Lab) -> None:
    """Makes a lab available by its id without a module of its own: a test, or a lab under development. A lab that is registered twice is a mistake."""
    problems = type(lab).problems()
    if problems:
        raise ValueError(f"{type(lab).__name__}: " + "; ".join(problems))
    if lab.id in _registry:
        raise ValueError(f"the lab {lab.id} is registered twice")
    _registry[lab.id] = lab


def unregister(lab_id: str) -> None:
    """Takes a registered lab away again."""
    _registry.pop(lab_id, None)


def registered_labs() -> list[str]:
    """The ids of the labs that were registered, sorted."""
    return sorted(_registry)


def load_lab(lab_id: str) -> Lab:
    """The lab with this id: a registered one, or the `LAB` of its module in this package. A lab this installation does not have is a `GraderError`."""
    registered = _registry.get(lab_id)
    if registered is not None:
        return registered
    name = module_for_lab(lab_id)
    try:
        module = importlib.import_module(f"{__name__}.{name}")
    except ModuleNotFoundError as error:
        if error.name != f"{__name__}.{name}":
            raise GraderError(f"the lab {lab_id} needs {error.name!r}, which is not installed in this environment: use the environment the lab's kit names") from error
        raise GraderError(f"this installation of the grader has no lab {lab_id}") from None
    lab = getattr(module, "LAB", None)
    if not isinstance(lab, Lab):
        raise GraderError(f"{module.__name__} does not export a LAB that is a Lab")
    problems = type(lab).problems()
    if problems or lab.id != lab_id:
        raise GraderError(f"the lab in {module.__name__} is declared wrongly: " + "; ".join(problems or [f"it says its id is {lab.id!r}"]))
    return lab
