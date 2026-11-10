"""What the grader's tests share: where the cross-language vectors are, and how a vector file is run."""

from __future__ import annotations

import json
import os
import unittest
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

#: A port refuses a bad value by raising one of these, where TypeScript raises RangeError or TypeError (schemas/vectors, "error": true).
REFUSAL = (ValueError, TypeError)


def vectors_dir() -> Path:
    """The folder with the vector files: ENGINESPACE_VECTORS if it is set, otherwise schemas/vectors of the nearest folder above this one that has it.

    A checkout of the repository has it, and so does a kit that ships it beside the grader. A test that cannot find it fails, and never skips,
    because a skipped vector test would let a moved folder pass the job that exists to run it.
    """
    named = os.environ.get("ENGINESPACE_VECTORS")
    if named:
        return Path(named)
    here = Path(__file__).resolve()
    for folder in here.parents:
        candidate = folder / "schemas" / "vectors"
        if (candidate / "rng.json").is_file():
            return candidate
    raise AssertionError(
        "schemas/vectors was not found above " + str(here.parent) + ": run the tests from a checkout of the repository, or set ENGINESPACE_VECTORS to the folder"
    )


def _refuse_constant(name: str) -> Any:
    raise ValueError(f"{name} is not JSON")


def load_vectors(name: str) -> dict[str, Any]:
    """A vector file, parsed. Its `spec` must be the one that the name promises."""
    path = vectors_dir() / f"{name}.json"
    document: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"), parse_constant=_refuse_constant)
    if document["spec"] != f"enginespace/vectors-{name}@1":
        raise AssertionError(f"{path.name} is {document['spec']}, and the test reads enginespace/vectors-{name}@1")
    if not document["vectors"]:
        raise AssertionError(f"{path.name} holds no vector")
    return document


Handler = Callable[[unittest.TestCase, Mapping[str, Any]], None]


def run_vectors(case: unittest.TestCase, name: str, handlers: Mapping[str, Handler]) -> int:
    """Runs every vector of a file through the handler of its `fn`, each as a subtest named by its id, and returns how many it ran.

    A vector whose `fn` has no handler fails, so that a case added to the file is a case that the port has to answer. So does a handler that
    no vector uses, which would be a check that cannot run.
    """
    document = load_vectors(name)
    used: set[str] = set()
    ran = 0
    for vector in document["vectors"]:
        fn = vector["fn"]
        handler = handlers.get(fn)
        if handler is None:
            case.fail(f"{name}.json: the vector {vector['id']} has fn {fn!r}, which no handler of this test runs")
        used.add(fn)
        with case.subTest(vector=vector["id"]):
            handler(case, vector)
        ran += 1
    case.assertEqual(ran, len(document["vectors"]))
    case.assertEqual(sorted(set(handlers) - used), [], f"{name}.json: a handler that no vector uses")
    return ran
