"""The reference solution with the wrong RMSNorm epsilon: the bestiary's case that stage 2 must fail (W2-T16's second accept line).

The checkpoint's config says 1e-06. This file builds the model with 1e-03 [estimated: a plausible wrong value, picked by trying a few on the small test model], as a learner who
copied another model's constant would. Nothing else differs from reference_forward.py.
"""

from __future__ import annotations

from typing import Any

from reference_forward import build as build_reference

WRONG_EPS = 1e-3


def build(config: dict[str, Any], weights: dict[str, Any]) -> Any:
    return build_reference(config, weights, eps=WRONG_EPS)
