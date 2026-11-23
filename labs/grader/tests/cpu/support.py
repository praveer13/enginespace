"""What the tests of the TR0 lab need to run in the CPU environment: a small model with random weights, built from the pinned `transformers`, and a way to grade a stage.

No weights are downloaded: `random_model` makes a Qwen3 with two layers, writes its `config.json` and `model.safetensors` to a folder, and returns it as the lab's
`ModelSource`. The weights are random and are scaled up (`SCALE`) so that the activations are large enough for a wrong epsilon to show; the margin of the real model is
measured by the weights job of labs.yml, and nothing here says anything about it.

The tests need torch and transformers. Where they are missing, every test fails with a message that says so, whatever the machine is: a test of the lab that did not run
is not a pass, and a job that lost its environment must be red (the plan's rule that a test never passes by being left out). The grader's own unittest (which has no torch) never finds this folder: it is
not a package, so `python -m unittest` from the root of the repository does not walk into it, and labs.yml's cpu job names it.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

try:
    import torch
    import transformers

    MISSING: str | None = None
except ImportError as error:  # the environment of the lab is not installed
    torch = None  # type: ignore[assignment]
    transformers = None  # type: ignore[assignment]
    MISSING = f"{error.name or 'torch'} cannot be imported here ({error}); run these tests in the CPU environment, labs/envs/cpu"

from enginespace_grader.challenge import check_challenge, format_challenge
from enginespace_grader.hashing import sha256_hex
from enginespace_grader.labs import Stage, StageContext, StageResult
from enginespace_grader.labs.tr0_forward import ModelSource, Tr0Forward
from enginespace_grader.receipt import make_input

HERE = Path(__file__).resolve().parent
SOLUTIONS = HERE / "solutions"

#: How many times the random weights are scaled after the usual small initialisation.
SCALE = 8.0

NONCE = "ABCDEFGHJKLMNPQR"


class CpuCase(unittest.TestCase):
    """A test case that fails, and never passes by being left out, when the CPU environment is not installed."""

    def setUp(self) -> None:
        if MISSING is not None:
            self.fail(MISSING)


def random_model(folder: Path, layers: int = 2, seed: int = 20261120, scale: float = SCALE) -> ModelSource:
    """A Qwen3 with random weights in `folder`, as `transformers` writes one, and the lab's reading of it."""
    assert torch is not None and transformers is not None
    from transformers import Qwen3Config, Qwen3ForCausalLM

    config = Qwen3Config(
        vocab_size=512,
        hidden_size=64,
        intermediate_size=128,
        num_hidden_layers=layers,
        num_attention_heads=4,
        num_key_value_heads=2,
        head_dim=16,
        max_position_embeddings=256,
        rms_norm_eps=1e-6,
        tie_word_embeddings=True,
    )
    torch.manual_seed(seed)
    model = Qwen3ForCausalLM(config)
    with torch.no_grad():
        for name, parameter in model.named_parameters():
            if "norm" in name:
                parameter.copy_(1.0 + 0.1 * torch.randn_like(parameter))
            else:
                parameter.mul_(scale)
    model.save_pretrained(str(folder))
    inputs = []
    for name in ("config.json", "model.safetensors"):
        data = (folder / name).read_bytes()
        inputs.append(make_input(f"random Qwen3 {name}", "model", sha256_hex(data), len(data)))
    return ModelSource(folder, tuple(inputs))


def context_for(stage_id: str, workdir: Path, seed: int = 0x2B1D5EED, log: list[str] | None = None) -> StageContext:
    """The context the grader hands a stage: a token for it, and a folder to work in."""
    token = format_challenge(stage_id, seed, NONCE, "20261120")
    challenge = check_challenge(token).challenge
    assert challenge is not None
    lab = Tr0Forward
    stage: Stage = lab.stages[stage_id]
    sink = log if log is not None else []
    return StageContext(challenge=challenge, stage=stage, workdir=workdir, log=sink.append)


def grade_stage(source: ModelSource, solution: Path, stage_id: str, seed: int = 0x2B1D5EED) -> StageResult:
    """Runs one stage of the lab on a model and a learner's file, in a scratch folder."""
    with tempfile.TemporaryDirectory(prefix="enginespace-tr0-") as scratch:
        return Tr0Forward(source=source, solution=solution).run(context_for(stage_id, Path(scratch), seed))


def check_of(result: StageResult, check_id: str) -> dict[str, Any]:
    found = [check for check in result.checks if check["id"] == check_id]
    assert len(found) == 1, f"{check_id} is not among {[check['id'] for check in result.checks]}"
    return found[0]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def moment() -> dt.datetime:
    return dt.datetime(2026, 11, 20, 12, 0, 0, tzinfo=dt.timezone.utc)


def points_of(result: StageResult) -> dict[str, Any]:
    artifact = next(artifact for artifact in result.artifacts if artifact.id == "points")
    return json.loads(json.dumps(artifact.data))
