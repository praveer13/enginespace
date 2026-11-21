"""The JSON Schemas that the grader validates a receipt and a bundle with (ARCHITECTURE section 9.6, D-030).

The zod schemas of packages/schema are the one source. `scripts/export-schemas.ts` writes them to schemas/*.schema.json as JSON Schema 2020-12,
and writes the same bytes into this package's `schemas/` folder, because the grader is installed by itself (as a wheel, or from the kit's `grader/`
folder) and has no `schemas/` folder of the repository beside it. `verify:schema` fails when a copy differs from what the zod schemas export, so
the grader and the site read one definition of a receipt.

The validator is `jsonschema`, the grader's one dependency. It is imported when the first schema is used, so `--version` and `doctor` start fast.
JSON Schema cannot say a few things (receipt.py lists them), and the code that needs them checks them beside the schema.
"""

from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from itertools import islice
from typing import Any

__all__ = ["SCHEMA_NAMES", "load_schema", "schema_problems", "validator"]

#: The schemas of packages/schema that the grader reads, by the name of the file before `.schema.json`: the four of the receipt family (ARCHITECTURE
#: section 9.6), the references manifest that `enginespace fetch` reads (section 9.7, W2-T05), and the artifact of the five points that `tr0.forward` records (W2b-T48).
SCHEMA_NAMES = ("receipt", "bundle", "challenge", "trace", "references", "tr0-points")

#: A message is cut at this length: it may quote a value out of a file that someone else wrote.
MESSAGE_LIMIT = 300


def schema_bytes(name: str) -> bytes:
    """The bytes of a packaged schema file."""
    if name not in SCHEMA_NAMES:
        raise ValueError(f"there is no schema called {name!r}; they are {', '.join(SCHEMA_NAMES)}")
    return (resources.files("enginespace_grader") / "schemas" / f"{name}.schema.json").read_bytes()


@lru_cache(maxsize=None)
def load_schema(name: str) -> dict[str, Any]:
    """A packaged schema, parsed."""
    document: dict[str, Any] = json.loads(schema_bytes(name))
    return document


@lru_cache(maxsize=None)
def validator(name: str) -> Any:
    """A Draft 2020-12 validator for a packaged schema. The schema is checked against its metaschema once, when the validator is made."""
    from jsonschema import Draft202012Validator

    schema = load_schema(name)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def pointer(path: Any) -> str:
    """A JSON Pointer to a place in a document: `/environment/gpus/0/name`, and `/` for the document itself."""
    return "".join("/" + str(part).replace("~", "~0").replace("/", "~1") for part in path) or "/"


def _clip(text: str) -> str:
    return text if len(text) <= MESSAGE_LIMIT else text[: MESSAGE_LIMIT - 3] + "..."


def schema_problems(name: str, instance: Any, limit: int = 20) -> list[str]:
    """What is wrong with `instance` under the schema `name`, as `<pointer>: <message>` lines in a fixed order, at most `limit` of them.

    A file may be hostile, so the walk stops after a few times `limit` problems, only `limit` are returned, and each message is cut short.
    """
    found = sorted((pointer(error.absolute_path), _clip(error.message)) for error in islice(validator(name).iter_errors(instance), limit * 4))
    return [f"{place}: {message}" for place, message in found[:limit]]
