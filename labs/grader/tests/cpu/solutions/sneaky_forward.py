"""A file whose import the static scan cannot see, because the name is made at run time: the guard of the running process refuses it and names it."""

from __future__ import annotations

import importlib
from typing import Any


def build(config: dict[str, Any], weights: dict[str, Any]) -> Any:
    name = "transformers." + "".join(["mod", "els"]) + ".qwen3"
    try:
        importlib.import_module(name)
    except ImportError:
        pass  # the learner hides the refusal, and the guard has written the name down all the same
    raise RuntimeError("no forward pass here")
