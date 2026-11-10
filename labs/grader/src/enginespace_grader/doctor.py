"""`enginespace doctor` (ARCHITECTURE section 9.4): a stub in W2-T02.

The command will print the fingerprint (section 9.5) and check the pins against `course.lock.json`, CUDA visibility, the disk and the model cache, and the
host driver against the pin's requirement (R580 or newer for vLLM 0.33.0's CUDA 13 wheels). It will show exactly the fields that a receipt would record, so
that the learner sees them before any `grade` run writes them (section 9.9). W2-T03 builds the fingerprint and W2-T04 the pin checks.

Until then it prints what `grade` records now: the host facts that fingerprint.py reads. It checks nothing, and says so.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from . import fingerprint
from .identity import identity

__all__ = ["main"]

STUB_NOTE = (
    "doctor is a stub in this build (W2-T02): it checks nothing yet. It prints the host facts that a receipt would record. "
    "The GPU, the driver, torch, the engine, the libraries and the pins arrive with W2-T03 and W2-T04."
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="enginespace doctor", description="Print the fields that a receipt would record about this machine.")
    parser.add_argument("--json", action="store_true", help="print the fields as JSON")
    parser.add_argument("--host-kind", default="local", help="where the run happens, as a receipt records it: local, runpod, modal, lambda or other")
    args = parser.parse_args(list(argv) if argv is not None else None)
    environment = fingerprint.collect(args.host_kind)
    grader = identity().as_object()
    if args.json:
        sys.stdout.write(json.dumps({"stub": True, "grader": grader, "environment": environment}, indent=2, ensure_ascii=False) + "\n")
    else:
        sys.stdout.write(f"{STUB_NOTE}\n\ngrader {grader['name']} {grader['version']}, source sha256 {grader['sourceSha256']}\n")
        sys.stdout.write("environment (what a receipt records now):\n" + json.dumps(environment, indent=2, ensure_ascii=False) + "\n")
    return 0
