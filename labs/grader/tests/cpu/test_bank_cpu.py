"""The generator of the owner's argmax bank (W2-T17), run on a small random-weight Qwen3 in the CPU environment (labs.yml's cpu job).

No bank is published by any of this: the bank here is made in a temporary folder from a model that nobody downloaded and is deleted with it. What it says about Qwen3-0.6B is nothing.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from support import CpuCase, random_model

from enginespace_grader.canonical import parse_json
from enginespace_grader.labs.tr0_forward import BANK_FORMAT, POOL_LENGTH, POOL_PROMPTS, argmax_bank, bank_bytes, pool_position


class Bank(CpuCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.folder = tempfile.TemporaryDirectory(prefix="enginespace-model-")
        cls.addClassCleanup(cls.folder.cleanup)
        try:
            cls.source = random_model(Path(cls.folder.name))
        except ImportError:
            cls.source = None  # setUp says why, in each test

    def bank(self, margin: float):  # type: ignore[no-untyped-def]
        assert self.source is not None
        return argmax_bank(self.source, margin)

    def test_two_runs_give_the_same_bytes(self) -> None:
        self.assertEqual(bank_bytes(self.bank(0.5)), bank_bytes(self.bank(0.5)))

    def test_the_bank_holds_the_references_argmax_at_the_positions_that_pass_the_margin(self) -> None:
        import torch
        from transformers import AutoModelForCausalLM

        from enginespace_grader.labs.tr0_forward import pool_prompts

        bank = self.bank(0.5)
        self.assertEqual(bank["schema"], BANK_FORMAT)
        self.assertEqual(bank["stage"], "tr0.forward.s2")
        positions, ids = bank["positions"], bank["ids"]
        self.assertEqual(len(positions), len(ids))
        self.assertEqual(positions, sorted(set(positions)))
        self.assertTrue(0 < len(positions) < POOL_PROMPTS * POOL_LENGTH, "the margin should keep some positions and drop some")
        model = AutoModelForCausalLM.from_pretrained(self.folder.name, dtype=torch.float32).eval()
        with torch.no_grad():
            logits = model(torch.tensor(pool_prompts(512), dtype=torch.long)).logits
        for at, token in zip(positions, ids):
            row = logits[at // POOL_LENGTH, at % POOL_LENGTH]
            top = row.topk(2)
            self.assertEqual(int(top.indices[0]), token)
            self.assertGreaterEqual(float(top.values[0] - top.values[1]), 0.5)
        kept = set(positions)
        for prompt in range(POOL_PROMPTS):
            for place in range(POOL_LENGTH):
                at = pool_position(prompt, place)
                top = logits[prompt, place].topk(2).values
                if at not in kept:
                    self.assertLess(float(top[0] - top[1]), 0.5)

    def test_a_larger_margin_keeps_fewer_positions_and_a_subset(self) -> None:
        loose, tight = self.bank(0.25), self.bank(2.0)
        self.assertLess(len(tight["positions"]), len(loose["positions"]))
        self.assertTrue(set(tight["positions"]) <= set(loose["positions"]))

    def test_the_document_reads_back_as_canonical_json_and_names_what_made_it(self) -> None:
        bank = self.bank(0.5)
        data = bank_bytes(bank)
        self.assertTrue(data.endswith(b"\n"))
        self.assertEqual(parse_json(data.decode("utf-8")), json.loads(json.dumps(bank)))
        self.assertEqual([entry["name"] for entry in bank["model"]], ["random Qwen3 config.json", "random Qwen3 model.safetensors"])
        self.assertEqual(set(bank["builds"]), {"torch", "transformers"})
        self.assertNotIn(self.folder.name.encode("utf-8"), data)

    def test_a_margin_that_is_not_positive_is_refused(self) -> None:
        with self.assertRaises(ValueError):
            self.bank(0.0)


if __name__ == "__main__":
    unittest.main()
