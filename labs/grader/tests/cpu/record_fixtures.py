"""Records what the reference solution makes of each stage on the small random-weight model, as the fixtures that the grader's own tests (no torch) replay.

    PYTHONPATH=labs/grader/src <the CPU environment's python> labs/grader/tests/cpu/record_fixtures.py

writes labs/grader/tests/synthetic/tr0-forward/stage{1,2,3}.json. They are synthetic: a two-layer Qwen3 with random weights that this folder's support.py makes, run by no learner.
test_tr0_cpu.py's last test holds the shapes and the verdicts of the committed files to what the reference gives now (the argmax ids are left out of that comparison: two builds
of torch may break a near tie differently, and the ids of a random model say nothing).
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from support import SOLUTIONS, grade_stage, random_model

OUT = Path(__file__).resolve().parents[1] / "synthetic" / "tr0-forward"


def recorded(stage: str) -> dict[str, object]:
    with tempfile.TemporaryDirectory(prefix="enginespace-model-") as folder:
        source = random_model(Path(folder))
        result = grade_stage(source, SOLUTIONS / "reference_forward.py", stage)
    return {
        "note": "Synthetic: the reference solution on a two-layer Qwen3 with random weights, recorded by labs/grader/tests/cpu/record_fixtures.py. No learner and no pinned model made it.",
        "stage": stage,
        "inputs": result.inputs,
        "checks": result.checks,
        "artifacts": [{"id": a.id, "kind": a.kind, "format": a.format, "encoding": a.encoding, "data": a.data} for a in result.artifacts],
        "notes": result.notes,
    }


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for number in (1, 2, 3):
        stage = f"tr0.forward.s{number}"
        (OUT / f"stage{number}.json").write_text(json.dumps(recorded(stage), indent=1) + "\n", encoding="utf-8")
        sys.stderr.write(f"wrote stage{number}.json\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
