"""The command of TRACKER's W2-T02 and of labs.yml, `uv run --project labs/grader python -m unittest`, finds this suite.

uv runs the command in the folder it is started from, which is the root of the repository, and unittest searches only folders that are packages. Without
the `__init__.py` of labs/, labs/grader/ and labs/grader/tests/, the command would find no test and, on Python 3.11, pass (it exits 5 from 3.12 on). tests/grader/package.test.ts
holds the three files in place from the TypeScript side, where no Python is needed.
"""

from __future__ import annotations

import subprocess
import sys
import unittest

from .support import vectors_dir


class Discovery(unittest.TestCase):
    def test_the_bare_command_from_the_root_of_the_repository_finds_the_tests(self) -> None:
        root = vectors_dir().parents[1]
        code = (
            "import unittest\n"
            "suite = unittest.defaultTestLoader.discover('.')\n"
            "ids = [test.id() for group in suite for inner in group for test in (inner if hasattr(inner, '__iter__') else [inner])]\n"
            "print(len(ids)); print('\\n'.join(sorted({i.rsplit('.', 2)[0] for i in ids})))\n"
        )
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=root, check=False)
        self.assertEqual(done.returncode, 0, done.stderr)
        count, *modules = done.stdout.splitlines()
        self.assertGreater(int(count), 150)
        for name in ("rng", "subseed", "challenge", "canonical", "hashing", "receipt", "bundle", "verify", "grade", "cli", "identity", "schemas", "selftest", "labs", "fetch"):
            self.assertIn(f"labs.grader.tests.test_{name}", modules)


if __name__ == "__main__":
    unittest.main()
