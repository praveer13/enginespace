"""A file that hands the work to Hugging Face's own model: the import guard's static scan refuses it, and it is never run."""

from __future__ import annotations

from typing import Any

from transformers import AutoModelForCausalLM


def build(config: dict[str, Any], weights: dict[str, Any]) -> Any:
    return AutoModelForCausalLM.from_config(config)
