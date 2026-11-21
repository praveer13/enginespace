"""The reference solution with a cache that miscounts: it says it holds one position more than the prefix. The logits are right and the length is not, so only `cache-lengths` fails."""

from __future__ import annotations

from typing import Any

from reference_forward import Model, build as build_reference


class Counted:
    """A cache that reports one more position than it holds."""

    def __init__(self, inner: Any) -> None:
        self.inner = inner

    @property
    def length(self) -> int:
        return int(self.inner.length) + 1


class Miscounting(Model):
    def new_cache(self) -> Counted:  # type: ignore[override]
        return Counted(super().new_cache())

    def step(self, ids: Any, cache: Any) -> Any:
        return super().step(ids, cache.inner)


def build(config: dict[str, Any], weights: dict[str, Any]) -> Any:
    honest = build_reference(config, weights)
    model = Miscounting(config, config["rms_norm_eps"])
    model.load_state_dict(honest.state_dict())
    return model.eval()
