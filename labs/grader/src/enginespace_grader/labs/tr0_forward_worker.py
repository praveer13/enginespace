"""The process that runs a learner's forward pass for `tr0.forward` (tr0_forward.py starts it): `python tr0_forward_worker.py <job.json>`.

It is a script of its own, not a module of the grader, for three reasons that are the rules of the lab (ASSESSMENT sections 5.7 and 10):
  - The learner's file runs here and nowhere else, so that an import guard can stand in this process without blocking the grader's own reference, which loads
    `transformers.models` in the process that started this one. The guard is a finder at the head of `sys.meta_path`: it refuses every import of
    `transformers.models` and what is under it, by name, and writes the name down so that a learner's `except ImportError` cannot hide it. It is friction, and
    ASSESSMENT section 10 says so: a file can still be read and copied by hand.
  - It imports nothing of the grader. It needs torch and safetensors, which the CPU environment holds, and the standard library.
  - It writes only to the two files the job names: `<out>.json`, which says what happened, and `<out>.pt`, the tensors the learner's code made.

The contract the learner's file keeps (the starter of the lab holds the same words):
  build(config, weights) -> model
      `config` is the model's config.json as a dict, and `weights` maps each name in the checkpoint (`model.layers.0.self_attn.q_proj.weight`) to an fp32 tensor.
      When the config ties the output head to the embedding, `lm_head.weight` is in `weights` too.
  model(ids) -> logits
      `ids` is a (batch, length) int64 tensor, and the logits are (batch, length, vocabulary) in fp32. No cache.
  model.layer(index, hidden) -> hidden        (stage 1)
      One decoder layer over a (batch, length, hidden) tensor, at positions 0 to length - 1.
  model.new_cache() -> cache, and model.step(ids, cache) -> logits        (stage 3)
      `step` takes the new tokens only, appends their keys and values to the cache, and returns the logits of the new positions, (batch, new, vocabulary).
      `cache.length` (a number, or a method) says how many positions the cache holds.
Five modules of the model are hooked for the points of the receipt: `embed_tokens`, `layers.0.self_attn`, `layers.0.mlp`, `norm` and `lm_head`, looked up on the model
(and on `model.model` when the first lookup finds nothing). A model that is not a torch module, or has none of them, records `found: false` for that point.
"""

from __future__ import annotations

import ast
import importlib.abc
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

#: The five named points and the module each one is read from, in the order of the receipt's artifact (packages/schema/bundle.ts, TR0_POINT_NAMES).
POINTS = (
    ("embedding", "embed_tokens"),
    ("attention", "layers.0.self_attn"),
    ("mlp", "layers.0.mlp"),
    ("final-norm", "norm"),
    ("logits", "lm_head"),
)

#: What the import guard refuses.
GUARDED = "transformers.models"

#: Names that a learner may take from the top of `transformers` and that are Hugging Face's own model: they load `transformers.models` when used.
MODEL_NAME_PARTS = ("Auto", "ForCausalLM", "PreTrainedModel", "Qwen3Model", "pipeline")


def is_model_name(name: str) -> bool:
    """Whether a name taken from `transformers` is a model, a model class or a way to make one. A tokenizer and a configuration are not."""
    if "Tokenizer" in name or "Config" in name:
        return False
    return name == "models" or any(part in name for part in MODEL_NAME_PARTS) or (name.endswith("Model") and name != "Model")


def scan_source(text: str) -> list[str]:
    """What in a learner's source delegates to Hugging Face's models, as sentences with a line number; an empty list when nothing does.

    A source that is not Python is a finding too: a check over nothing is not a pass. The scan reads the syntax tree: an `import transformers.models...`, a
    `from transformers.models... import`, a `from transformers import <a model>`, an attribute `transformers.<a model>`, and a string that names `transformers.models`
    (which `importlib.import_module` and `__import__` take).
    """
    try:
        tree = ast.parse(text)
    except SyntaxError as error:
        return [f"line {error.lineno or 1}: the file is not Python ({error.msg}), so the guard could not read it"]
    found: list[str] = []
    aliases: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for name in node.names:
                if name.name == GUARDED or name.name.startswith(GUARDED + "."):
                    found.append(f"line {node.lineno}: imports {name.name}")
                elif name.name == "transformers":
                    aliases.add(name.asname or "transformers")
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            if node.level == 0 and (module == GUARDED or module.startswith(GUARDED + ".")):
                found.append(f"line {node.lineno}: imports from {module}")
            elif node.level == 0 and module == "transformers":
                for name in node.names:
                    if is_model_name(name.name):
                        found.append(f"line {node.lineno}: imports {name.name} from transformers, which is Hugging Face's own model code")
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and (node.value == GUARDED or node.value.startswith(GUARDED + ".")):
            found.append(f"line {node.lineno}: names {node.value} in a string, which an import by name would load")
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id in aliases and is_model_name(node.attr):
            found.append(f"line {node.lineno}: uses transformers.{node.attr}, which is Hugging Face's own model code")
    return sorted(set(found), key=lambda line: (int(line.split(":")[0].split()[1]), line))


class GuardViolation(ImportError):
    """Raised inside the learner's code by an import of `transformers.models`."""


class Guard(importlib.abc.MetaPathFinder):
    """Refuses `transformers.models` and what is under it, and keeps the names that were asked for."""

    def __init__(self) -> None:
        self.refused: list[str] = []

    def find_spec(self, fullname: str, path: Any = None, target: Any = None) -> None:
        if fullname == GUARDED or fullname.startswith(GUARDED + "."):
            if fullname not in self.refused:
                self.refused.append(fullname)
            raise GuardViolation(f"the import guard of tr0.forward refuses {fullname}: write the forward pass yourself")
        return None


def clip(text: str, limit: int = 300) -> str:
    one_line = " ".join(text.split())
    return one_line if len(one_line) <= limit else one_line[: limit - 3] + "..."


def module_at(model: Any, path: str) -> Any:
    """The submodule of `model` at a dotted path, looked for on the model and then on `model.model`, or None."""
    get = getattr(model, "get_submodule", None)
    if get is None:
        return None
    for prefix in ("", "model."):
        try:
            return get(prefix + path)
        except (AttributeError, KeyError, TypeError):
            continue
    return None


class Recorder:
    """Forward hooks on the five modules. `mode` is `first` (keep the first call's tensor) or `last` (keep the latest)."""

    def __init__(self, model: Any, mode: str) -> None:
        self.mode = mode
        self.seen: dict[str, dict[str, Any]] = {}
        self.handles: list[Any] = []
        self.missing: list[str] = []
        for name, path in POINTS:
            module = module_at(model, path)
            if module is None or not hasattr(module, "register_forward_hook"):
                self.missing.append(name)
                continue
            self.handles.append(module.register_forward_hook(self._hook(name)))

    def _hook(self, name: str) -> Any:
        def hook(module: Any, args: Any, output: Any) -> None:
            if self.mode == "first" and name in self.seen:
                return
            tensor = output
            if isinstance(output, (tuple, list)):
                tensor = next((item for item in output if hasattr(item, "stride") and hasattr(item, "dtype")), None)
            if tensor is None or not hasattr(tensor, "stride"):
                return
            self.seen[name] = {
                "name": name,
                "found": True,
                "shape": [int(size) for size in tensor.shape],
                "strides": [int(step) for step in tensor.stride()],
                "dtype": str(tensor.dtype).removeprefix("torch."),
            }

        return hook

    def stop(self) -> None:
        for handle in self.handles:
            handle.remove()
        self.handles = []

    def points(self) -> list[dict[str, Any]]:
        return [self.seen.get(name, {"name": name, "found": False}) for name, _ in POINTS]


def load_weights(model_dir: Path, config: dict[str, Any]) -> dict[str, Any]:
    import torch
    from safetensors.torch import load_file

    weights = {name: tensor.to(torch.float32) for name, tensor in load_file(str(model_dir / "model.safetensors")).items()}
    if config.get("tie_word_embeddings") and "lm_head.weight" not in weights:
        weights["lm_head.weight"] = weights["model.embed_tokens.weight"]
    return weights


def load_solution(path: Path) -> Any:
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location("learner_forward", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("the file cannot be loaded as a Python module")
    module = importlib.util.module_from_spec(spec)
    sys.modules["learner_forward"] = module
    spec.loader.exec_module(module)
    if not callable(getattr(module, "build", None)):
        raise RuntimeError("the file defines no build(config, weights)")
    return module


def cache_length(cache: Any) -> int:
    """How many positions a cache says it holds: `cache.length`, called when it is a method, else `len(cache)`; -1 when it says nothing."""
    length = getattr(cache, "length", None)
    if callable(length):
        length = length()
    if length is None:
        try:
            length = len(cache)
        except TypeError:
            return -1
    try:
        return int(length)
    except (TypeError, ValueError):
        return -1


def run_stage(job: dict[str, Any], model: Any, weights: dict[str, Any], out: dict[str, Any]) -> dict[str, Any]:
    import torch

    stage = job["stage"]
    extra: dict[str, Any] = {}
    if stage == "tr0.forward.s1":
        ids = torch.tensor(job["prompts"], dtype=torch.long)
        hidden = weights["model.embed_tokens.weight"][ids]
        out["layer0"] = model.layer(0, hidden).detach().to(torch.float32).contiguous()
    elif stage == "tr0.forward.s2":
        ids = torch.tensor(job["prompts"], dtype=torch.long)
        recorder = Recorder(model, "first")
        logits = model(ids)
        recorder.stop()
        out["logits"] = logits.detach().to(torch.float32).contiguous()
        extra.update(call="prompt", points=recorder.points())
    elif stage == "tr0.forward.s3":
        prefix, feed = job["prefix"], job["feed"]
        cache = model.new_cache()
        recorder = Recorder(model, "last")
        steps: list[Any] = []
        lengths: list[int] = []
        expected: list[int] = []
        step_ids = torch.tensor([prefix], dtype=torch.long)
        for k in range(len(feed) + 1):
            logits = model.step(step_ids, cache)
            steps.append(logits[:, -1].detach().to(torch.float32).reshape(-1))
            lengths.append(cache_length(cache))
            expected.append(len(prefix) + k)
            if k < len(feed):
                step_ids = torch.tensor([[feed[k]]], dtype=torch.long)
        recorder.stop()
        own: list[Any] = []
        for k in range(len(feed) + 1):
            whole = torch.tensor([prefix + feed[:k]], dtype=torch.long)
            own.append(model(whole)[:, -1].detach().to(torch.float32).reshape(-1))
        out["cached"] = torch.stack(steps)
        out["own"] = torch.stack(own)
        extra.update(call="decode-step", points=recorder.points(), lengths=lengths, expected=expected)
    else:
        raise RuntimeError(f"{stage} is not a stage of tr0.forward")
    return extra


def main(job_path: str) -> int:
    with open(job_path, encoding="utf-8") as handle:
        job = json.load(handle)
    result: dict[str, Any] = {"status": "ok"}
    tensors: dict[str, Any] = {}
    guard = Guard()
    sys.meta_path.insert(0, guard)
    try:
        import torch

        torch.set_grad_enabled(False)
        model_dir = Path(job["model_dir"])
        with open(model_dir / "config.json", encoding="utf-8") as handle:
            config = json.load(handle)
        weights = load_weights(model_dir, config)
        module = load_solution(Path(job["solution"]))
        model = module.build(config, weights)
        result.update(run_stage(job, model, weights, tensors))
    except BaseException as error:  # the learner's code may raise anything, and the grader still writes what happened
        if isinstance(error, KeyboardInterrupt):
            raise
        result = {"status": "error", "type": type(error).__name__, "message": clip(str(error))}
    if guard.refused:
        result = {"status": "import-guard", "refused": guard.refused}
        tensors = {}
    with open(job["out"] + ".json", "w", encoding="utf-8") as handle:
        json.dump(result, handle)
    if tensors:
        import torch

        torch.save(tensors, job["out"] + ".pt")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
