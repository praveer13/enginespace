"""The reference solution with the final norm under another name: the model is right, and the point `final-norm` cannot be found."""

from __future__ import annotations

from typing import Any

from reference_forward import Model, build as build_reference


class Renamed(Model):
    def __init__(self, config: dict[str, Any], eps: float) -> None:
        super().__init__(config, eps)
        self.last_norm = self.norm
        del self.norm

    def run(self, ids: Any, start: int, cache: Any) -> Any:
        x = self.embed_tokens(ids)
        for layer in self.layers:
            x = layer(x, start, cache)
        return self.lm_head(self.last_norm(x))


def build(config: dict[str, Any], weights: dict[str, Any]) -> Any:
    honest = build_reference(config, weights)
    model = Renamed(config, config["rms_norm_eps"])
    model.load_state_dict({name.replace("norm.", "last_norm.") if name.startswith("norm.") else name: tensor for name, tensor in honest.state_dict().items()})
    return model.eval()
