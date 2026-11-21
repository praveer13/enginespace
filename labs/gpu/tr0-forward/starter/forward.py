"""Your forward pass of Qwen3-0.6B, in plain PyTorch. This is the one file you edit.

The grader imports this file and calls `build(config, weights)`, then runs the model it gets back. It runs on your CPU, in fp32, and compares
what your model makes with what Hugging Face's `transformers` makes from the same weights. Reading `transformers` source is fine and
encouraged; importing its model classes here is not (the import guard refuses `transformers.models`, and a file that uses them is not graded).

The contract, in full:

  build(config, weights) -> model
      `config` is the checkpoint's config.json as a dict. `weights` maps each tensor name in the checkpoint, such as
      `model.layers.0.self_attn.q_proj.weight`, to an fp32 tensor. When the config ties the output head to the embedding,
      `lm_head.weight` is in `weights` too, and it is the embedding matrix.

  model(ids) -> logits                        stage 2
      `ids` is an int64 tensor of shape (batch, length). The logits are fp32 of shape (batch, length, vocabulary). No cache.

  model.layer(index, hidden) -> hidden        stage 1
      One decoder layer over a (batch, length, hidden size) tensor whose positions are 0 to length - 1.

  model.new_cache() -> cache                  stage 3
  model.step(ids, cache) -> logits
      `step` takes only the new tokens, appends their keys and values to the cache, and returns the logits of the new positions,
      shape (batch, new tokens, vocabulary). `cache.length` is how many positions the cache holds, as a number.

Name your modules as the checkpoint does: `embed_tokens`, `layers` (a list), and inside each layer `self_attn` and `mlp`, then `norm` and
`lm_head`. The grader records the shape and the strides of what comes out of five of them for your receipt, and a model with no module at
one of those names has nothing to record there.

Nothing below is done for you. Each `raise NotImplementedError` is a piece to write. LAB.md walks through the pieces in order.
"""

from __future__ import annotations

from typing import Any

import torch
from torch import nn


class RMSNorm(nn.Module):
    """Scale each vector to unit root-mean-square, then multiply by a learned weight. The epsilon comes from the config."""

    def __init__(self, size: int, eps: float) -> None:
        super().__init__()
        raise NotImplementedError("RMSNorm.__init__: one weight vector of `size`, and the epsilon")

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError("RMSNorm.forward")


class Attention(nn.Module):
    """Grouped-query attention with a norm on each query and key head, rotary position embeddings and a causal mask."""

    def __init__(self, config: dict[str, Any], layer_index: int) -> None:
        super().__init__()
        raise NotImplementedError("Attention.__init__: four projections, two head norms, the rotary frequencies")

    def forward(self, x: torch.Tensor, start: int = 0, cache: Any = None) -> torch.Tensor:
        # `start` is the position of x's first token. Stage 3 passes a cache and a start; stages 1 and 2 pass neither.
        raise NotImplementedError("Attention.forward")


class MLP(nn.Module):
    """The gated feed-forward block: a gate and an up projection, multiplied, then a down projection."""

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__()
        raise NotImplementedError("MLP.__init__")

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError("MLP.forward")


class Layer(nn.Module):
    """One decoder layer: norm, attention, add; norm, MLP, add."""

    def __init__(self, config: dict[str, Any], layer_index: int) -> None:
        super().__init__()
        raise NotImplementedError("Layer.__init__")

    def forward(self, x: torch.Tensor, start: int = 0, cache: Any = None) -> torch.Tensor:
        raise NotImplementedError("Layer.forward")


class Cache:
    """The keys and values of every layer so far."""

    def __init__(self, layers: int) -> None:
        raise NotImplementedError("Cache.__init__: where each layer's keys and values go, and `self.length`")


class Model(nn.Module):
    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__()
        raise NotImplementedError("Model.__init__: embed_tokens, layers, norm, lm_head")

    def layer(self, index: int, hidden: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError("Model.layer (stage 1)")

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError("Model.forward (stage 2)")

    def new_cache(self) -> Cache:
        raise NotImplementedError("Model.new_cache (stage 3)")

    def step(self, ids: torch.Tensor, cache: Cache) -> torch.Tensor:
        raise NotImplementedError("Model.step (stage 3)")


def build(config: dict[str, Any], weights: dict[str, torch.Tensor]) -> Model:
    """Make the model and put the checkpoint's tensors into it, each under its own name."""
    raise NotImplementedError("build: make the Model, then load the weights into it")
