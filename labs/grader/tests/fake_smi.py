"""A fake `nvidia-smi` for the privacy test, written by hand (SYNTHETIC: no GPU was asked).

The test puts a one-line shell script named `nvidia-smi` first on the PATH of a subprocess, and the script runs this file with the interpreter of the test. This answers the
three kinds of call that the fingerprint makes with the hand-written output of synthetic/nvidia-smi, and appends the arguments of every call to the file named by
FAKE_SMI_LOG, so that the test can read which columns were asked for. FAKE_SMI_NO_VERSION=1 makes `--version` fail, as an older driver's does.
"""

from __future__ import annotations

import os
import sys


def main(argv: list[str]) -> int:
    with open(os.environ["FAKE_SMI_LOG"], "a", encoding="utf-8") as log:
        log.write(" ".join(argv) + "\n")
    folder = os.environ["FAKE_SMI_DIR"]

    def show(name: str) -> int:
        with open(os.path.join(folder, name), encoding="utf-8") as text:
            sys.stdout.write(text.read())
        return 0

    if argv and argv[0].startswith("--query-gpu="):
        return show("rtx4090.csv" if "compute_cap" in argv[0] else "old-driver-minimal.csv")
    if argv == ["--version"] and os.environ.get("FAKE_SMI_NO_VERSION") != "1":
        return show("version-r580.txt")
    if not argv:
        return show("banner-r570.txt")
    sys.stderr.write("fake nvidia-smi: unknown arguments\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
