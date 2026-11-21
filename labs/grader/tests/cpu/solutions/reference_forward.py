"""A plain PyTorch forward pass of Qwen3, written to the contract of tr0_forward_worker.py: what an honest learner's file does.

It is the lab's reference solution, and it lives with the tests (labs/grader/tests/cpu/), never in the kit: the kit's member list holds no solution. It reads the weights
by their checkpoint names, builds the modules the five points are hooked on (`embed_tokens`, `layers.N.self_attn`, `layers.N.mlp`, `norm`, `lm_head`), and keeps a KV cache.
`rms_norm_eps` is read from the config; the mutant (mutant_forward.py) is this file with another epsilon.
"""

from __future__ import annotations

import math
from typing import Any

import torch
from torch import nn


class RMSNorm(nn.Module):
    def __init__(self, size: int, eps: float) -> None:
        super().__init__()
        self.weight = nn.Parameter(torch.ones(size))
        self.eps = eps

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        variance = x.pow(2).mean(-1, keepdim=True)
        return self.weight * (x * torch.rsqrt(variance + self.eps))


def rotate_half(x: torch.Tensor) -> torch.Tensor:
    half = x.shape[-1] // 2
    return torch.cat((-x[..., half:], x[..., :half]), dim=-1)


class Cache:
    """The keys and values of every layer so far, and how many positions they cover."""

    def __init__(self, layers: int) -> None:
        self.keys: list[torch.Tensor | None] = [None] * layers
        self.values: list[torch.Tensor | None] = [None] * layers
        self.length = 0


class Attention(nn.Module):
    def __init__(self, config: dict[str, Any], eps: float, index: int) -> None:
        super().__init__()
        self.index = index
        self.heads = config["num_attention_heads"]
        self.kv_heads = config["num_key_value_heads"]
        self.head_dim = config.get("head_dim") or config["hidden_size"] // self.heads
        hidden = config["hidden_size"]
        self.q_proj = nn.Linear(hidden, self.heads * self.head_dim, bias=False)
        self.k_proj = nn.Linear(hidden, self.kv_heads * self.head_dim, bias=False)
        self.v_proj = nn.Linear(hidden, self.kv_heads * self.head_dim, bias=False)
        self.o_proj = nn.Linear(self.heads * self.head_dim, hidden, bias=False)
        self.q_norm = RMSNorm(self.head_dim, eps)
        self.k_norm = RMSNorm(self.head_dim, eps)
        theta = config.get("rope_theta") or config["rope_parameters"]["rope_theta"]
        self.inv_freq = 1.0 / (float(theta) ** (torch.arange(0, self.head_dim, 2, dtype=torch.float32) / self.head_dim))

    def forward(self, x: torch.Tensor, start: int = 0, cache: Cache | None = None) -> torch.Tensor:
        batch, length, _ = x.shape
        q = self.q_norm(self.q_proj(x).view(batch, length, self.heads, self.head_dim)).transpose(1, 2)
        k = self.k_norm(self.k_proj(x).view(batch, length, self.kv_heads, self.head_dim)).transpose(1, 2)
        v = self.v_proj(x).view(batch, length, self.kv_heads, self.head_dim).transpose(1, 2)
        positions = torch.arange(start, start + length, dtype=torch.float32)
        angles = torch.outer(positions, self.inv_freq)
        angles = torch.cat((angles, angles), dim=-1)
        cos, sin = angles.cos(), angles.sin()
        q = q * cos + rotate_half(q) * sin
        k = k * cos + rotate_half(k) * sin
        if cache is not None:
            before = cache.keys[self.index]
            if before is not None:
                k = torch.cat((before, k), dim=2)
                v = torch.cat((cache.values[self.index], v), dim=2)  # type: ignore[arg-type]
            cache.keys[self.index], cache.values[self.index] = k, v
        group = self.heads // self.kv_heads
        k = k.repeat_interleave(group, dim=1)
        v = v.repeat_interleave(group, dim=1)
        scores = (q @ k.transpose(-1, -2)) / math.sqrt(self.head_dim)
        total = k.shape[2]
        allowed = torch.arange(total).view(1, total) <= (torch.arange(length).view(length, 1) + total - length)
        scores = scores.masked_fill(~allowed, float("-inf"))
        mixed = torch.softmax(scores, dim=-1) @ v
        return self.o_proj(mixed.transpose(1, 2).reshape(batch, length, self.heads * self.head_dim))


class MLP(nn.Module):
    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__()
        hidden, inner = config["hidden_size"], config["intermediate_size"]
        self.gate_proj = nn.Linear(hidden, inner, bias=False)
        self.up_proj = nn.Linear(hidden, inner, bias=False)
        self.down_proj = nn.Linear(inner, hidden, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.down_proj(nn.functional.silu(self.gate_proj(x)) * self.up_proj(x))


class Layer(nn.Module):
    def __init__(self, config: dict[str, Any], eps: float, index: int) -> None:
        super().__init__()
        self.input_layernorm = RMSNorm(config["hidden_size"], eps)
        self.self_attn = Attention(config, eps, index)
        self.post_attention_layernorm = RMSNorm(config["hidden_size"], eps)
        self.mlp = MLP(config)

    def forward(self, x: torch.Tensor, start: int = 0, cache: Cache | None = None) -> torch.Tensor:
        x = x + self.self_attn(self.input_layernorm(x), start, cache)
        return x + self.mlp(self.post_attention_layernorm(x))


class Model(nn.Module):
    def __init__(self, config: dict[str, Any], eps: float) -> None:
        super().__init__()
        self.embed_tokens = nn.Embedding(config["vocab_size"], config["hidden_size"])
        self.layers = nn.ModuleList([Layer(config, eps, index) for index in range(config["num_hidden_layers"])])
        self.norm = RMSNorm(config["hidden_size"], eps)
        self.lm_head = nn.Linear(config["hidden_size"], config["vocab_size"], bias=False)

    def layer(self, index: int, hidden: torch.Tensor) -> torch.Tensor:
        return self.layers[index](hidden)

    def run(self, ids: torch.Tensor, start: int, cache: Cache | None) -> torch.Tensor:
        x = self.embed_tokens(ids)
        for layer in self.layers:
            x = layer(x, start, cache)
        return self.lm_head(self.norm(x))

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        return self.run(ids, 0, None)

    def new_cache(self) -> Cache:
        return Cache(len(self.layers))

    def step(self, ids: torch.Tensor, cache: Cache) -> torch.Tensor:
        logits = self.run(ids, cache.length, cache)
        cache.length += ids.shape[1]
        return logits


def build(config: dict[str, Any], weights: dict[str, torch.Tensor], eps: float | None = None) -> Model:
    model = Model(config, config["rms_norm_eps"] if eps is None else eps)
    state = {name.removeprefix("model."): tensor for name, tensor in weights.items() if name != "lm_head.weight"}
    state["lm_head.weight"] = weights["lm_head.weight"]
    model.load_state_dict(state, strict=True)
    return model.eval()
