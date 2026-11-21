"""The weights job's measurement (labs.yml, job `weights`, started by hand): the reference solution and the wrong-epsilon mutants on the PINNED Qwen3-0.6B.

This is not a test and has no `test_` in its name, so the cpu job's discovery never runs it. It needs the pinned files in the cache that `enginespace fetch tr0.forward`
fills (`pinned_model` hashes each one again and refuses a file that is not the manifest's), and it prints, for each solution and each stage, every check's worst absolute
difference and whether it passed:

  reference           reference_forward.py: the honest solution. It has to pass all three stages, and the margin under the bound is what the owner decides the bound from (D-075).
  epsilon 1e-3        mutant_forward.py: the wrong RMSNorm epsilon of the tracker's second check. Stage 2 has to fail.
  epsilon 1e-5        the commonest wrong value. On the small random model of the cpu job it passes; whether it passes on Qwen3-0.6B is the question the 1e-3 bound's margin answers.

The numbers it prints are what the run measured, and the exit status says only whether the run itself held: the reference passed every stage, and the 1e-3 mutant failed stage 2.
Nothing is changed by its findings: no bound, no pin. They go to the owner.

    PYTHONPATH=labs/grader/src python labs/grader/tests/cpu/weights_margin.py
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from support import SOLUTIONS, grade_stage  # noqa: E402

from enginespace_grader.labs.tr0_forward import CACHE_BOUND, LAYER_BOUND, LOGIT_BOUND, pinned_model  # noqa: E402

STAGES = ("tr0.forward.s1", "tr0.forward.s2", "tr0.forward.s3")
BOUNDS = {"layer0-hidden": LAYER_BOUND, "logits-fp32": LOGIT_BOUND, "cache-logits": CACHE_BOUND}


def epsilon_file(folder: Path, epsilon: float) -> Path:
    """A solution that is the reference with this RMSNorm epsilon, written beside nothing of the repository's."""
    path = folder / f"epsilon_{epsilon:.0e}_forward.py".replace("-", "m")
    path.write_text(
        f"import sys\nsys.path.insert(0, {str(SOLUTIONS)!r})\nfrom reference_forward import build as _build\n\n\ndef build(config, weights):\n    return _build(config, weights, eps={epsilon!r})\n",
        encoding="utf-8",
    )
    return path


def main() -> int:
    source = pinned_model()
    held = True
    rows: list[tuple[str, str, str, float | None, bool]] = []
    with tempfile.TemporaryDirectory(prefix="enginespace-weights-") as scratch:
        runs = (
            ("reference", SOLUTIONS / "reference_forward.py"),
            ("epsilon 1e-3", SOLUTIONS / "mutant_forward.py"),
            ("epsilon 1e-5", epsilon_file(Path(scratch), 1e-5)),
        )
        for name, solution in runs:
            for stage in STAGES:
                result = grade_stage(source, solution, stage)
                for check in result.checks:
                    if check["id"] not in BOUNDS:
                        continue
                    value = check.get("value")
                    rows.append((name, stage, check["id"], value, bool(check["pass"])))
                    shown = "none" if value is None else f"{value:.3e}"
                    print(f"[margin] {name:13} {stage} {check['id']:14} worst difference {shown} against the bound {BOUNDS[check['id']]:.0e}: {'pass' if check['pass'] else 'FAIL'}", flush=True)
    for name, stage, check_id, _value, passed in rows:
        if name == "reference" and not passed:
            print(f"the reference did not pass {check_id} of {stage}: the run is not what the lab expects", file=sys.stderr)
            held = False
        if name == "epsilon 1e-3" and stage == "tr0.forward.s2" and check_id == "logits-fp32" and passed:
            print("the wrong-epsilon solution passed stage 2: the lab does not catch it", file=sys.stderr)
            held = False
    return 0 if held else 1


if __name__ == "__main__":
    sys.exit(main())
