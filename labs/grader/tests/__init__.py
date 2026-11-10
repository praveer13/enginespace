"""The grader's tests, which use the standard library's unittest and so need no framework (ARCHITECTURE section 9.1).

Run them from the root of the repository:

    uv run --project labs/grader python -m unittest

or one file, with its dotted name from there:

    uv run --project labs/grader python -m unittest labs.grader.tests.test_rng -v

They run on the CPU, and a test that needs a GPU skips itself without CUDA. They read the cross-language vectors that scripts/export-schemas.ts writes to
schemas/vectors, which the repository's checkout has and an installed wheel does not (tests/support.py says where they are looked for).
"""
