"""This folder is a package on purpose, and holds nothing.

`uv run --project labs/grader python -m unittest`, run from the root of the repository (the command of TRACKER's W2-T02 and of labs.yml), takes
`.` as the folder to search for tests, and unittest searches only folders that are packages. Without this file and the two like it (labs/grader
and labs/grader/tests), that command would find no test and prove nothing: it exits 0 on Python 3.11 and 5 from 3.12 on [measured 2026-11-09,
CPython 3.11.14 to 3.14.3]. tests/grader/package.test.ts holds the three in place.
"""
