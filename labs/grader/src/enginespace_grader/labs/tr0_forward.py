"""`tr0.forward`: the learner's own forward pass of Qwen3-0.6B, on the CPU, graded against Hugging Face's `transformers` in fp32 on the same CPU
(ASSESSMENT sections 5.7 and 5.9, curriculum/TR0-pytorch-for-rust.md section 5).

Three stages, each a function of one learner file (`forward.py`; the contract is the docstring of tr0_forward_worker.py):

  tr0.forward.s1   One layer. The learner's decoder layer 0, over the embeddings of two seeded prompts, against what transformers' layer 0 makes of the same
                   embeddings. Practice only: the bound is 1e-4 [estimated] and the site requires nothing of this stage.
  tr0.forward.s2   The whole forward pass. The logits of eight fixed prompts against transformers' logits, at most 1e-3 apart at every element (`logits-fp32`), with the
                   import guard (`import-guard`). The learner's argmax token ids at every position travel in the receipt (`enginespace/argmax@1`), so that the browser
                   can compare them with the owner's bank (W2-T17) at the positions where the reference is sure. The shape, strides and dtype of five tensors of the
                   learner's own forward pass travel with them (`enginespace/tr0-points@1`).
  tr0.forward.s3   The cache. A prefix of eight seeded tokens, then sixteen decode steps through the learner's KV cache [estimated]: each step's logits against a
                   full recompute of the same prefix by transformers and by the learner's own uncached forward, at most 1e-3 apart (`cache-logits`), and the
                   cache holding exactly as many positions as the prefix after every step (`cache-lengths`). The five points of the last step travel too.

Why stage 2 uses a fixed set of prompts and not the challenge's seed: the owner's bank (W2-T17) records the reference's argmax ids at positions where its margin is
large, once, and the browser compares the receipt's ids with the bank at those positions, so every receipt has to cover the same positions. The prompts are token ids
that a hash of their place gives (`pool_prompts`), so no seed is chosen here; the challenge's seed still decides the prompts of stages 1 and 3. A position of the pool
is `prompt * POOL_LENGTH + place`. The prompts are not text: they are [synthetic] ids, and a lab that wants sentences adds a tokenizer to what the bank's generator reads.

The learner's file runs in a process of its own, with an import guard (tr0_forward_worker.py), and the file is also read once before it runs: a source that
imports `transformers.models` is not run at all. The reference runs here, in the grader's process, with the same torch build and the same threads, so that no
tolerance is spent on a difference of hardware. No bound is changed by this module's findings: the margin of the honest solution under 1e-3 is measured by the weights
job of labs.yml and goes to the owner (D-075, proposed).

Nothing here writes a path into a receipt: the learner's file and the model's folder are named in no check, note or artifact, and an exception of the learner's
code reaches a check as its class and its message after `redact.scrub_text`.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar

from .. import fetch
from ..bundle import Artifact
from ..canonical import canonical_bytes
from ..checks import allclose_check, max_abs_difference
from ..errors import GraderError
from ..hashing import sha256_hex
from ..receipt import make_check, make_input
from ..redact import scrub_text
from ..rng import below
from . import Lab, Stage, StageContext, StageResult
from .tr0_forward_worker import POINTS, scan_source

__all__ = [
    "CACHE_BOUND",
    "CHECK_LABELS",
    "DECODE_STEPS",
    "LAB",
    "LAYER_BOUND",
    "LOGIT_BOUND",
    "POINT_NAMES",
    "POOL_LENGTH",
    "POOL_PROMPTS",
    "PREFIX_LENGTH",
    "ModelSource",
    "Tr0Forward",
    "pool_position",
    "pool_prompts",
]

#: The bounds on the largest absolute difference, in fp32 on one CPU. 1e-3 is the catalog's bar and stays [estimated] until the weights job has measured the honest
#: solution's margin under it (curriculum/TR0 section 11, item 3); no task changes it. 1e-4 for one layer is [estimated] too, and only a practice stage reads it.
LOGIT_BOUND = 1e-3
CACHE_BOUND = 1e-3
LAYER_BOUND = 1e-4

#: Stage 2's fixed prompts: how many, and how many token ids each [estimated].
POOL_PROMPTS = 8
POOL_LENGTH = 24
#: Stage 3's prefix, and how many decode steps follow it [estimated].
PREFIX_LENGTH = 8
DECODE_STEPS = 16
#: Stage 1's prompts and their length [estimated].
LAYER_PROMPTS = 2
LAYER_LENGTH = 16

#: How long the learner's forward pass may run before the grader stops waiting [estimated]. A forward pass over 192 tokens on a laptop takes seconds.
WORKER_SECONDS = 3600

#: The five points, by name, in the order of the artifact.
POINT_NAMES = tuple(name for name, _ in POINTS)

POINTS_FORMAT = "enginespace/tr0-points@1"
ARGMAX_FORMAT = "enginespace/argmax@1"

#: What each check says it checks, in the course's own words: the page of the lab shows these (src/labs/specimen.ts reads the same sentences).
CHECK_LABELS: dict[str, str] = {
    "layer0-hidden": "The first layer's hidden states agree with the `transformers` reference in fp32",
    "logits-fp32": "The logits agree with the `transformers` reference in fp32",
    "import-guard": "Your forward pass does not import `transformers.models`",
    "cache-logits": "Decoding with the cache gives the logits of recomputing the whole sequence",
    "cache-lengths": "At every step the cache holds exactly as many positions as the prefix",
}


def pool_prompts(vocab_size: int) -> list[list[int]]:
    """Stage 2's eight prompts: token ids that a hash of their place gives, the same on every machine and for every challenge."""
    if vocab_size < 2:
        raise ValueError("a vocabulary has at least two tokens")
    rows: list[list[int]] = []
    for prompt in range(POOL_PROMPTS):
        row = []
        for place in range(POOL_LENGTH):
            digest = hashlib.sha256(f"tr0.forward/pool/{prompt}/{place}".encode("ascii")).digest()
            row.append(int.from_bytes(digest[:8], "big") % vocab_size)
        rows.append(row)
    return rows


def pool_position(prompt: int, place: int) -> int:
    """The index that the argmax artifact, and the owner's bank, give to token `place` of prompt `prompt`."""
    return prompt * POOL_LENGTH + place


@dataclass(frozen=True)
class ModelSource:
    """The reference model's folder (`config.json` and `model.safetensors`), and the receipt's `inputs` entries for the files it holds."""

    folder: Path
    inputs: tuple[dict[str, Any], ...]


def pinned_model() -> ModelSource:
    """The pinned model in the cache that `enginespace fetch tr0.forward` fills, every file hashed again. A file that is not there is a `GraderError` that says to fetch."""
    manifest = fetch.load_manifest(fetch.find_manifest())
    references = manifest.for_lab("tr0.forward")
    if not references:
        raise GraderError("the references manifest lists no file for tr0.forward")
    paths = {reference.path.rsplit("/", 1)[-1]: fetch.cached_file(reference) for reference in references}
    for needed in ("config.json", "model.safetensors"):
        if needed not in paths:
            raise GraderError(f"the references manifest lists no {needed} for tr0.forward")
    return ModelSource(paths["config.json"].parent, tuple(reference.as_input() for reference in references))


#: Where the learner's file is looked for, after the variable ENGINESPACE_SOLUTION: the kit's folder of the lab, from the kit's root.
SOLUTION_PLACES = ("tr0-forward/forward.py", "gpu/tr0-forward/forward.py")


def solution_file(environ: Mapping[str, str] | None = None, start: Path | None = None) -> Path:
    """The learner's file: ENGINESPACE_SOLUTION, else the first of `SOLUTION_PLACES` under the current folder. A file that is not there is a `GraderError` that says what to do."""
    env = os.environ if environ is None else environ
    named = (env.get("ENGINESPACE_SOLUTION") or "").strip()
    here = Path.cwd() if start is None else Path(start)
    candidates = [Path(named)] if named else [here / place for place in SOLUTION_PLACES]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise GraderError(
        "tr0.forward grades your forward pass, and its file was not found. Run the command from the kit's folder, where tr0-forward/forward.py is, "
        "or name the file with the variable ENGINESPACE_SOLUTION"
    )


def _clean(text: str) -> str:
    """A line of the learner's own error as a check may hold it: no path, no name of this machine, one line, short."""
    cleaned, _ = scrub_text(text)
    return " ".join(cleaned.split())[:300]


class Tr0Forward(Lab):
    """The three stages of `tr0.forward`. `source` and `solution` are what a test hands in; the installed lab finds both itself."""

    id: ClassVar[str] = "tr0.forward"
    title: ClassVar[str] = "Build the Qwen3-0.6B forward pass on a CPU"
    environment: ClassVar[str] = "cpu"
    stages: ClassVar[Mapping[str, Stage]] = {
        "tr0.forward.s1": Stage("tr0.forward.s1", "One decoder layer", checks=("layer0-hidden",)),
        "tr0.forward.s2": Stage("tr0.forward.s2", "The full forward pass", checks=("logits-fp32", "import-guard")),
        "tr0.forward.s3": Stage("tr0.forward.s3", "Decoding with a KV cache", checks=("cache-logits", "cache-lengths")),
    }

    def __init__(self, source: ModelSource | None = None, solution: Path | None = None) -> None:
        self._source = source
        self._solution = solution

    # -- the pieces ------------------------------------------------------------------------------------------------------------------------

    def _model(self) -> ModelSource:
        return self._source if self._source is not None else pinned_model()

    def _file(self) -> Path:
        return self._solution if self._solution is not None else solution_file()

    @staticmethod
    def _failed(stage: str, why: str, *, guard: str | None = None) -> list[dict[str, Any]]:
        """The stage's checks, every one failed for the same reason: a stage that did not run compares nothing, and a check over nothing is not a pass.

        `guard` is the import guard's own finding. Given, the check `import-guard` says it; None, it passes: the file was read and run and imported nothing it refuses.
        """
        bounds = {"layer0-hidden": LAYER_BOUND, "logits-fp32": LOGIT_BOUND, "cache-logits": CACHE_BOUND, "cache-lengths": 0.0}
        checks: list[dict[str, Any]] = []
        for check_id in Tr0Forward.stages[stage].checks:
            if check_id == "import-guard":
                if guard is None:
                    checks.append(make_check(check_id, "property", True, detail="no import of transformers.models was found in the file or while it ran"))
                else:
                    checks.append(make_check(check_id, "property", False, detail=guard[:1000]))
            else:
                kind = "property" if check_id == "cache-lengths" else "correctness"
                checks.append(make_check(check_id, kind, False, bound=bounds[check_id], detail=why[:1000]))
        return checks

    def run(self, context: StageContext) -> StageResult:
        stage_id = context.stage.id
        source = self._model()
        file = self._file()
        text = file.read_text(encoding="utf-8", errors="replace")
        config = json.loads((source.folder / "config.json").read_text(encoding="utf-8"))
        vocab = int(config["vocab_size"])

        job: dict[str, Any] = {"stage": stage_id, "solution": str(file), "model_dir": str(source.folder)}
        prompts: list[list[int]]
        if stage_id == "tr0.forward.s1":
            rng = context.rng("tr0/layer0")
            prompts = [[below(rng, vocab) for _ in range(LAYER_LENGTH)] for _ in range(LAYER_PROMPTS)]
            job["prompts"] = prompts
        elif stage_id == "tr0.forward.s2":
            prompts = pool_prompts(vocab)
            job["prompts"] = prompts
        else:
            rng = context.rng("tr0/decode")
            prefix = [below(rng, vocab) for _ in range(PREFIX_LENGTH)]
            feed = [below(rng, vocab) for _ in range(DECODE_STEPS)]
            prompts = [prefix + feed]
            job["prefix"], job["feed"] = prefix, feed

        prompt_bytes = canonical_bytes(prompts)
        result = StageResult(inputs=[*source.inputs, make_input(f"tr0.forward {stage_id[-2:]} prompts (synthetic token ids)", "prompts", sha256_hex(prompt_bytes), len(prompt_bytes))])

        findings = scan_source(text)
        if findings:
            shown = "; ".join(findings[:5]) + (f"; and {len(findings) - 5} more" if len(findings) > 5 else "")
            context.log("the import guard refused the file; it was not run")
            result.checks = self._failed(stage_id, f"not compared, because the import guard refused your forward pass ({shown})", guard=f"not run: {shown}")
            return result

        context.log("running the reference (transformers, fp32, this CPU)")
        reference = self._reference(stage_id, source.folder, job)
        context.log("running your forward pass")
        answer, tensors = self._learner(context, job)

        if answer.get("status") == "import-guard":
            names = ", ".join(answer.get("refused", [])[:5])
            found = f"your file imported {names} while it ran"
            result.checks = self._failed(stage_id, f"not compared, because the import guard refused your forward pass ({found})", guard=found)
            return result
        if answer.get("status") != "ok":
            why = f"your forward pass stopped with {answer.get('type', 'an error')}: {_clean(str(answer.get('message', '')))}"
            if answer.get("status") == "silent":
                why = str(answer["message"])
            result.checks = self._failed(stage_id, why)
            return result

        if stage_id == "tr0.forward.s1":
            result.checks = [allclose_check("layer0-hidden", tensors["layer0"], reference["layer0"], LAYER_BOUND, what="layer 0's output")]
        elif stage_id == "tr0.forward.s2":
            result.checks = [
                allclose_check("logits-fp32", tensors["logits"], reference["logits"], LOGIT_BOUND, what="the logits"),
                make_check("import-guard", "property", True, detail="no import of transformers.models was found in the file or while it ran"),
            ]
            result.artifacts.append(self._argmax_artifact(tensors["logits"]))
        else:
            result.checks = self._cache_checks(answer, tensors, reference)
        if stage_id != "tr0.forward.s1":
            result.artifacts.append(Artifact.from_json("points", "report", POINTS_FORMAT, {"schema": POINTS_FORMAT, "stage": stage_id, "call": answer["call"], "points": answer["points"]}))
            missing = [point["name"] for point in answer["points"] if not point["found"]]
            if missing:
                result.notes = f"No tensor was recorded at {', '.join(missing)}: your model has no module there, so the five points of this receipt are not all there to defend."
        return result

    # -- checks ----------------------------------------------------------------------------------------------------------------------------

    def _cache_checks(self, answer: Mapping[str, Any], tensors: Mapping[str, Any], reference: Mapping[str, Any]) -> list[dict[str, Any]]:
        steps = len(tensors["cached"])
        against_reference = max_abs_difference(tensors["cached"], reference["steps"])
        against_own = max_abs_difference(tensors["cached"], tensors["own"])
        problems = [f"{name}: {found.problem}" for name, found in (("against the reference", against_reference), ("against your own uncached forward pass", against_own)) if found.worst is None]
        if problems:
            logits = make_check("cache-logits", "correctness", False, bound=CACHE_BOUND, n=steps, detail="; ".join(problems)[:1000])
        else:
            assert against_reference.worst is not None and against_own.worst is not None
            worst = max(against_reference.worst, against_own.worst)
            logits = make_check(
                "cache-logits",
                "correctness",
                worst <= CACHE_BOUND,
                value=worst,
                bound=CACHE_BOUND,
                n=steps,
                detail=(
                    f"over {steps} steps (the prefix, then each decode step), the largest absolute difference is {against_reference.worst:.3e} against the reference's "
                    f"full recompute and {against_own.worst:.3e} against your own uncached forward pass, with the bound {CACHE_BOUND:.0e}"
                ),
            )
        lengths: list[int] = list(answer["lengths"])
        expected: list[int] = list(answer["expected"])
        wrong = [index for index, (got, want) in enumerate(zip(lengths, expected)) if got != want]
        if wrong:
            first = wrong[0]
            detail = f"after step {first} the cache says it holds {lengths[first]} positions, and the prefix is {expected[first]} long ({len(wrong)} of {steps} steps differ)"
        else:
            detail = f"after each of the {steps} steps the cache holds as many positions as the prefix"
        return [logits, make_check("cache-lengths", "property", not wrong, value=float(len(wrong)), bound=0.0, n=steps, detail=detail)]

    @staticmethod
    def _argmax_artifact(logits: Any) -> Artifact:
        ids = logits.argmax(dim=-1).reshape(-1).tolist()
        positions = [pool_position(prompt, place) for prompt in range(logits.shape[0]) for place in range(logits.shape[1])]
        return Artifact.from_json("argmax", "outputs", ARGMAX_FORMAT, {"schema": ARGMAX_FORMAT, "positions": positions, "ids": [int(token) for token in ids]})

    # -- the two runs ----------------------------------------------------------------------------------------------------------------------

    def _reference(self, stage_id: str, folder: Path, job: Mapping[str, Any]) -> dict[str, Any]:
        """What transformers makes of the same inputs, in fp32 on this CPU."""
        import torch
        from transformers import AutoModelForCausalLM

        model = AutoModelForCausalLM.from_pretrained(str(folder), dtype=torch.float32)
        model.eval()
        with torch.no_grad():
            if stage_id == "tr0.forward.s1":
                ids = torch.tensor(job["prompts"], dtype=torch.long)
                seen: list[Any] = []

                def hook(module: Any, args: Any, output: Any) -> None:
                    seen.append(output[0] if isinstance(output, tuple) else output)

                handle = model.model.layers[0].register_forward_hook(hook)
                model(ids)
                handle.remove()
                return {"layer0": seen[0].detach().to(torch.float32).contiguous()}
            if stage_id == "tr0.forward.s2":
                return {"logits": model(torch.tensor(job["prompts"], dtype=torch.long)).logits.detach().to(torch.float32).contiguous()}
            prefix, feed = job["prefix"], job["feed"]
            rows = [model(torch.tensor([prefix + feed[:k]], dtype=torch.long)).logits[:, -1].detach().to(torch.float32).reshape(-1) for k in range(len(feed) + 1)]
            return {"steps": torch.stack(rows)}

    def _learner(self, context: StageContext, job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        """Runs the learner's file in a process of its own, and returns what it said and the tensors it made."""
        import torch

        out = context.workdir / "learner"
        job = {**job, "out": str(out)}
        job_file = context.workdir / "job.json"
        job_file.write_text(json.dumps(job), encoding="utf-8")
        worker = Path(__file__).with_name("tr0_forward_worker.py")
        try:
            done = subprocess.run([sys.executable, str(worker), str(job_file)], capture_output=True, timeout=WORKER_SECONDS, check=False)
        except subprocess.TimeoutExpired:
            return {"status": "silent", "message": f"your forward pass did not finish in {WORKER_SECONDS} seconds, and the grader stopped it"}, {}
        answer_file = Path(str(out) + ".json")
        if not answer_file.is_file():
            return {"status": "silent", "message": f"the process that runs your forward pass ended with status {done.returncode} and gave no answer"}, {}
        answer = json.loads(answer_file.read_text(encoding="utf-8"))
        tensors_file = Path(str(out) + ".pt")
        tensors = torch.load(str(tensors_file), weights_only=True) if tensors_file.is_file() else {}
        return answer, tensors


LAB = Tr0Forward()
