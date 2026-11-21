"""A file whose forward pass raises: the stage fails its checks and says what the error was, with no path in it."""

from __future__ import annotations

from typing import Any


def build(config: dict[str, Any], weights: dict[str, Any]) -> Any:
    raise ValueError("the weight model.layers.0.self_attn.q_proj.weight has the shape [2048, 1024] and I wanted [1024, 2048]")
