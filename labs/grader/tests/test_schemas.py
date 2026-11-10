"""The packaged JSON Schemas (D-030): the copies that the grader validates with are the site's, and they are used as the site uses them."""

from __future__ import annotations

import re
import unittest

from enginespace_grader import schemas
from enginespace_grader.challenge import check_challenge

from .support import load_vectors, vectors_dir


class Packaged(unittest.TestCase):
    def test_the_four_schemas_load_and_are_valid_draft_2020_12(self) -> None:
        self.assertEqual(schemas.SCHEMA_NAMES, ("receipt", "bundle", "challenge", "trace"))
        for name in schemas.SCHEMA_NAMES:
            document = schemas.load_schema(name)
            self.assertEqual(document["$schema"], "https://json-schema.org/draft/2020-12/schema")
            self.assertIs(schemas.validator(name), schemas.validator(name), "a validator is made once")

    def test_the_copies_are_the_repositorys_schemas_byte_for_byte(self) -> None:
        folder = vectors_dir().parent
        for name in schemas.SCHEMA_NAMES:
            source = folder / f"{name}.schema.json"
            self.assertTrue(source.is_file(), f"{source.name} is beside the vectors")
            self.assertEqual(schemas.schema_bytes(name), source.read_bytes(), f"{name}.schema.json: run `bun scripts/export-schemas.ts` (verify:schema checks this too)")

    def test_a_schema_that_does_not_exist_is_a_value_error(self) -> None:
        for name in ("nope", "", "../receipt", "receipt.schema"):
            with self.assertRaises(ValueError):
                schemas.schema_bytes(name)

    def test_the_schemas_close_their_objects_so_that_a_key_nobody_named_is_refused(self) -> None:
        def walk(node: object, place: str = "$") -> list[str]:
            if isinstance(node, dict):
                found = [place] if node.get("type") == "object" and "properties" in node and node.get("additionalProperties") is not False else []
                return found + [problem for key, value in node.items() for problem in walk(value, f"{place}.{key}")]
            if isinstance(node, list):
                return [problem for index, value in enumerate(node) for problem in walk(value, f"{place}[{index}]")]
            return []

        for name in schemas.SCHEMA_NAMES:
            self.assertEqual(walk(schemas.load_schema(name)), [], name)

    def test_the_tokens_pattern_in_the_schema_is_the_codec_of_the_grader(self) -> None:
        """The two spellings of the token's shape, the exported JSON Schema and challenge.py, take and refuse the same texts of schemas/vectors/challenge.json."""
        pattern = re.compile(schemas.load_schema("challenge")["properties"]["token"]["pattern"])
        for vector in load_vectors("challenge")["vectors"]:
            if vector["fn"] == "token":
                self.assertIsNotNone(pattern.search(vector["token"]), vector["id"])
            elif vector["fn"] == "refused":
                shaped = pattern.search(vector["token"]) is not None
                self.assertEqual(shaped, check_challenge(vector["token"]).problem != "shape", f"{vector['id']}: the pattern and the codec disagree about the shape")


class Problems(unittest.TestCase):
    def test_a_problem_is_a_pointer_and_a_message(self) -> None:
        problems = schemas.schema_problems("challenge", {"token": "x", "seed": -1, "nonce": "y", "issuedOn": "z"})
        self.assertEqual([problem.split(":")[0] for problem in problems], ["/issuedOn", "/nonce", "/seed", "/token"])

    def test_the_pointer_escapes_slashes_and_tildes(self) -> None:
        self.assertEqual(schemas.pointer(["a/b", "c~d", 3]), "/a~1b/c~0d/3")
        self.assertEqual(schemas.pointer([]), "/")

    def test_a_message_that_quotes_a_hostile_value_is_cut_short(self) -> None:
        problems = schemas.schema_problems("challenge", {"token": "x" * 100_000, "seed": 1, "nonce": "A" * 16, "issuedOn": "20260101"})
        self.assertEqual(len(problems), 1)
        self.assertLessEqual(len(problems[0]), len("/token: ") + schemas.MESSAGE_LIMIT)

    def test_the_list_is_bounded(self) -> None:
        trace = {"schema": "enginespace/trace@1", "meta": {"source": "synthetic", "synthetic": True}, "strings": [], "tracks": [], "spans": {}, "flows": [{"from": -1, "to": -1, "kind": "x"}] * 200, "marks": []}
        self.assertEqual(len(schemas.schema_problems("trace", trace)), 20)
        self.assertEqual(len(schemas.schema_problems("trace", trace, limit=5)), 5)


if __name__ == "__main__":
    unittest.main()
