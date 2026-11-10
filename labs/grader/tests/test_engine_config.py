"""The effective engine configuration (ARCHITECTURE section 9.5, ASSESSMENT section 5.6), read from a log and a configuration dump of vLLM v0.33.0.

Every log and dump here is SYNTHETIC (synthetic/README.md): written by hand from the format strings of the pinned source. No engine ran. W2-T12's recordings of the
owner's runs are what these are replaced by, and the same tests then run on them.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from enginespace_grader import engine_config
from enginespace_grader.bundle import Artifact
from enginespace_grader.challenge import format_challenge
from enginespace_grader.engine_config import FIELDS, EngineRun, read_engine_config
from enginespace_grader.grade import run_stage
from enginespace_grader.labs import Lab, Stage, StageContext, StageResult
from enginespace_grader.receipt import make_check
from enginespace_grader.verify import verify_file

from . import samples
from .fakes import SYNTHETIC, vllm_json, vllm_text

LOG = vllm_text("mrv2-default.txt")
DUMP_4090 = vllm_json("server-info-rtx4090.json")
DUMP_H100 = vllm_json("server-info-h100.json")


def read(log: str = "", dump: Any = None, environ: dict[str, str] | None = None, engine: str = "vllm") -> engine_config.EngineConfigReading:
    return read_engine_config(EngineRun(log=log, config_dump=dump, environ=environ), engine)


class Fixtures(unittest.TestCase):
    def test_every_log_says_that_it_is_synthetic_and_the_readme_names_every_fixture(self) -> None:
        readme = (SYNTHETIC / "README.md").read_text(encoding="utf-8")
        for folder in ("nvidia-smi", "vllm"):
            for path in sorted((SYNTHETIC / folder).iterdir()):
                self.assertIn(f"`{path.name}`", readme, f"{path.name} is not in synthetic/README.md")
                if path.suffix == ".txt" and folder == "vllm":
                    self.assertTrue(path.read_text(encoding="utf-8").startswith("# SYNTHETIC:"), path.name)
        self.assertIn("_synthetic", DUMP_4090)

    def test_no_fixture_holds_a_home_folder_or_a_token(self) -> None:
        needles = ["/ho" + "me/", "/Us" + "ers/", "hf" + "_", "Bearer"]
        for path in SYNTHETIC.rglob("*"):
            if path.is_file():
                text = path.read_text(encoding="utf-8")
                for needle in needles:
                    self.assertNotIn(needle, text, path.name)


#: For each claim of content/claims/vllm/logs.yaml that quotes a log statement: a line as the engine prints it, and what the reader finds in it.
RENDERED: dict[str, tuple[str, str, Any]] = {
    "vllm.log.runner-mrv2": ("INFO 11-09 12:00:09 [gpu_worker.py:513] Using V2 Model Runner", "runner", "MRV2"),
    "vllm.log.runner-fallback-warning": (
        "WARNING 11-09 12:00:07 [vllm.py:761] Model Runner V2 does not yet support speculative method 'suffix', parallel drafting for EAGLE speculative decoding; using the V1 model runner instead.",
        "runner",
        "MRV1",
    ),
    "vllm.log.runner-triton-warning": ("WARNING 11-09 12:00:07 [vllm.py:754] Model Runner V2 requires Triton; using the V1 model runner instead.", "runner", "MRV1"),
    "vllm.log.config-line": (vllm_text("mrv2-default.txt").splitlines()[3], "graphMode", "FULL_AND_PIECEWISE"),
    "vllm.log.graph-downgrade-warnings": (
        "WARNING 11-09 [compilation.py:1414] CUDAGraphMode.FULL is not supported with X backend (support: AttentionCGSupport.UNIFORM_BATCH); setting cudagraph_mode=FULL_AND_PIECEWISE",
        "graphMode",
        "FULL_AND_PIECEWISE",
    ),
    "vllm.log.graph-override-warning": (
        "WARNING 11-09 [compilation.py:1474] Cudagraph mode FULL_AND_PIECEWISE requires piecewise capture, but the loaded model provides neither a compiled submodule nor breakable CUDA graphs. Overriding to FULL_DECODE_ONLY.",
        "graphMode",
        "FULL_DECODE_ONLY",
    ),
    "vllm.log.enforce-eager-warning": (
        "WARNING 11-09 12:00:06 [vllm.py:1779] Enforce eager set, disabling torch.compile, CUDAGraphs, and JIT kernel warmup. This is equivalent to setting -cc.mode=none",
        "graphMode",
        "NONE",
    ),
    "vllm.log.attention-backend-auto": ("INFO 11-09 [cuda.py:509] Using FLASH_ATTN attention backend out of potential backends: ['FLASH_ATTN', 'TRITON_ATTN'].", "attentionBackend", "FLASH_ATTN"),
    "vllm.log.attention-backend-named": ("INFO 11-09 [cuda.py:448] Using AttentionBackendEnum.FLASHINFER backend.", "attentionBackend", "FLASHINFER"),
    "vllm.log.chunked-prefill-budget": ("INFO 11-09 [scheduler.py:311] Chunked prefill is enabled with max_num_batched_tokens=4096.", "maxNumBatchedTokens", 4096),
    "vllm.log.batch-defaults-debug": ("DEBUG 11-09 [arg_utils.py:3227] Defaulting max_num_batched_tokens to 4096 for OPENAI_API_SERVER usage context.", "maxNumBatchedTokens", 4096),
    "vllm.log.non-default-args": ("INFO 11-09 [startup.py:96] non-default args: {'model': 'm', 'max_num_seqs': 32}", "maxNumSeqs", 32),
    "vllm.log.async-scheduling-off-warnings": (
        "WARNING 11-09 [vllm.py:1713] Async scheduling is disabled because the V1 model runner does not support it with pipeline parallelism.",
        "asyncScheduling",
        False,
    ),
}


def claims_text() -> str:
    from .support import vectors_dir

    return (vectors_dir().parents[1] / "content" / "claims" / "vllm" / "logs.yaml").read_text(encoding="utf-8")


class Claims(unittest.TestCase):
    """The reader, the fixtures and the claims that quote the source say the same thing: a re-pin that moves a line moves all three, and one of these fails."""

    def quote_of(self, text: str, claim: str) -> str:
        block = text.split(f"- id: {claim}\n", 1)[1].split("\n- id: ", 1)[0]
        quoted = next(line for line in block.splitlines() if line.startswith("    quote: "))[len("    quote: ") :]
        return quoted[1:-1].replace("''", "'")

    def test_every_claim_the_reader_stands_on_is_in_the_file_and_its_quote_is_what_the_engine_prints(self) -> None:
        text = claims_text()
        for claim, (line, field, expected) in RENDERED.items():
            self.assertIn(f"- id: {claim}\n", text, claim)
            quote = self.quote_of(text, claim)
            literal = quote.split('"')[1] if '"' in quote else ""
            if literal:
                head = literal.split("%")[0].rstrip()
                self.assertIn(head, line, f"{claim}: the claim quotes {literal!r}, and the line the reader is tested on does not hold its start")
            reading = read(line + "\n")
            self.assertEqual(reading.found.get(field), expected, claim)

    def test_every_claim_of_the_file_has_its_shape_and_the_pin(self) -> None:
        text = claims_text()
        ids = [line.split(": ", 1)[1] for line in text.splitlines() if line.startswith("- id: ")]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ids), 20)
        self.assertEqual(text.count("  pin: vllm\n"), len(ids))
        self.assertEqual(text.count("    accessed: 2026-11-09\n"), len(ids))
        self.assertEqual(text.count("  tag: measured\n"), len(ids))
        for claim in RENDERED:
            self.assertIn(claim, ids)
        self.assertIn("4ba787ec9959e566d3b587a796dff07673324da5", text)

    def test_the_module_docstring_names_the_files_and_lines_of_the_pin(self) -> None:
        doc = engine_config.__doc__ or ""
        for needle in (
            "vllm/v1/worker/gpu_worker.py:513",
            "vllm/config/vllm.py:761",
            "vllm/v1/engine/core.py:140",
            "vllm/platforms/cuda.py:509",
            "vllm/platforms/cuda.py:448",
            "vllm/config/scheduler.py:311",
            "vllm/engine/arg_utils.py:3227",
            "vllm/config/compilation.py:1474",
            "content/claims/vllm/logs.yaml",
        ):
            self.assertIn(needle, doc)


class Default(unittest.TestCase):
    def test_the_log_and_the_dump_of_a_default_server_give_all_six(self) -> None:
        reading = read(LOG, DUMP_4090)
        self.assertTrue(reading.ok)
        self.assertEqual(
            reading.config,
            {"runner": "MRV2", "graphMode": "FULL_AND_PIECEWISE", "asyncScheduling": True, "attentionBackend": "FLASH_ATTN", "maxNumBatchedTokens": 2048, "maxNumSeqs": 256},
        )
        self.assertEqual(list(reading.config or {}), list(FIELDS), "in the order of the schema")
        self.assertEqual(reading.missing, ())
        self.assertEqual(reading.notes, ())
        self.assertEqual(reading.evidence["runner"], "log: Using V2 Model Runner")
        self.assertIn("the dump", reading.evidence["asyncScheduling"])

    def test_at_info_the_log_alone_cannot_say_whether_async_scheduling_is_on_or_the_limit_on_sequences(self) -> None:
        reading = read(LOG)
        self.assertFalse(reading.ok)
        self.assertIsNone(reading.config)
        self.assertEqual(reading.missing, ("asyncScheduling", "maxNumSeqs"))
        self.assertEqual(reading.found, {"runner": "MRV2", "graphMode": "FULL_AND_PIECEWISE", "attentionBackend": "FLASH_ATTN", "maxNumBatchedTokens": 2048})
        self.assertIn("not found: asyncScheduling, maxNumSeqs", reading.detail())

    def test_the_same_command_on_another_gpu_has_other_limits_and_the_dump_shows_it(self) -> None:
        h100 = read(LOG.replace("max_num_batched_tokens=2048", "max_num_batched_tokens=8192"), DUMP_H100)
        self.assertEqual((h100.found["maxNumBatchedTokens"], h100.found["maxNumSeqs"]), (8192, 1024))
        self.assertEqual((read(LOG, DUMP_4090).found["maxNumBatchedTokens"], read(LOG, DUMP_4090).found["maxNumSeqs"]), (2048, 256))

    def test_a_dump_and_a_log_from_different_runs_disagree_and_the_field_is_missing(self) -> None:
        reading = read(LOG, DUMP_H100)  # the log's 2048 against the dump's 8192
        self.assertIn("maxNumBatchedTokens", reading.missing)
        self.assertNotIn("maxNumBatchedTokens", reading.found)
        self.assertTrue(any("maxNumBatchedTokens" in note and "disagree" in note for note in reading.notes), reading.notes)
        self.assertIsNone(reading.config)

    def test_every_form_of_the_dump_is_read(self) -> None:
        inner = DUMP_4090["vllm_config"]
        for dump in (DUMP_4090, inner, json.dumps(DUMP_4090), json.dumps(inner)):
            self.assertEqual(read(LOG, dump).config, read(LOG, DUMP_4090).config)
            self.assertTrue(read(LOG, dump).ok)

    def test_the_dump_in_text_form_is_the_config_line_and_gives_the_graph_mode_only(self) -> None:
        text = LOG.splitlines()[3].split("with config: ", 1)[1]
        reading = read("", {"vllm_config": text})
        self.assertEqual(reading.found, {"graphMode": "FULL_AND_PIECEWISE"})
        self.assertEqual(read("", text).found, {"graphMode": "FULL_AND_PIECEWISE"}, "plain text is read as text")

    def test_detail_is_one_line_of_plain_text_within_the_limit_and_holds_no_path(self) -> None:
        detail = read(LOG, DUMP_4090).detail()
        self.assertNotIn("\n", detail)
        self.assertNotIn("/", detail)
        self.assertLessEqual(len(detail), engine_config.DETAIL_LIMIT)

    def test_a_detail_that_is_too_long_is_cut_with_dots(self) -> None:
        notes = tuple("a note " * 40 for _ in range(10))
        cut = engine_config.EngineConfigReading(None, {}, FIELDS, {}, notes).detail()
        self.assertEqual(len(cut), engine_config.DETAIL_LIMIT)
        self.assertTrue(cut.endswith("..."))


class Runner(unittest.TestCase):
    def test_a_fallback_warning_is_mrv1_and_no_dump_is_needed_when_the_log_says_the_rest(self) -> None:
        reading = read(vllm_text("mrv1-custom-proposer.txt"))
        self.assertEqual(
            reading.config,
            {"runner": "MRV1", "graphMode": "FULL_AND_PIECEWISE", "asyncScheduling": False, "attentionBackend": "FLASH_ATTN", "maxNumBatchedTokens": 2048, "maxNumSeqs": 256},
        )
        self.assertEqual(reading.evidence["runner"], "log: the Model Runner V2 fallback warning")
        self.assertIn("warning", reading.evidence["asyncScheduling"])

    def test_both_fallback_warnings_are_mrv1(self) -> None:
        for line in (
            "WARNING 11-09 [vllm.py:754] Model Runner V2 requires Triton; using the V1 model runner instead.",
            "WARNING 11-09 [vllm.py:761] Model Runner V2 does not yet support pipeline parallelism with external_launcher, parallel drafting for EAGLE speculative decoding; using the V1 model runner instead.",
        ):
            self.assertEqual(read(line).found["runner"], "MRV1")

    def test_the_later_line_wins_and_a_note_says_the_log_names_both(self) -> None:
        both = LOG + "WARNING 11-09 [vllm.py:754] Model Runner V2 requires Triton; using the V1 model runner instead.\n"
        reading = read(both)
        self.assertEqual(reading.found["runner"], "MRV1")
        self.assertTrue(any("both runners" in note for note in reading.notes))

    def test_an_explicit_zero_is_mrv1_without_a_word_in_the_log_and_one_is_no_evidence_at_all(self) -> None:
        quiet = "\n".join(line for line in LOG.splitlines() if "V2 Model Runner" not in line)
        self.assertEqual(read(quiet, environ={"VLLM_USE_V2_MODEL_RUNNER": "0"}).found["runner"], "MRV1")
        self.assertIn("env: VLLM_USE_V2_MODEL_RUNNER=0", read(quiet, environ={"VLLM_USE_V2_MODEL_RUNNER": "0"}).evidence["runner"])
        self.assertNotIn("runner", read(quiet, environ={"VLLM_USE_V2_MODEL_RUNNER": "1"}).found)
        self.assertNotIn("runner", read(quiet, environ={}).found)
        self.assertNotIn("runner", read(quiet).found)

    def test_the_log_outranks_the_environment(self) -> None:
        self.assertEqual(read(LOG, environ={"VLLM_USE_V2_MODEL_RUNNER": "0"}).found["runner"], "MRV2", "watermarking can override the variable, and the log says so")

    def test_a_variable_that_vllm_would_refuse_says_nothing(self) -> None:
        reading = read("", environ={"VLLM_USE_V2_MODEL_RUNNER": "false"})
        self.assertNotIn("runner", reading.found)
        self.assertTrue(any("not an integer" in note for note in reading.notes))


class GraphMode(unittest.TestCase):
    def test_two_downgrades_in_a_row_end_at_the_last(self) -> None:
        asked_for_full = {"compilation_config": {"cudagraph_mode": 2}}  # the dump of the run whose log this is: the user asked for FULL
        reading = read(vllm_text("downgrade.txt"), asked_for_full)
        self.assertEqual(reading.found["graphMode"], "PIECEWISE")
        self.assertIn("downgrade", reading.evidence["graphMode"])
        self.assertIn("began in FULL", reading.evidence["graphMode"])
        self.assertEqual(read(vllm_text("downgrade.txt")).found["graphMode"], "PIECEWISE", "the config line says the same as the dump")
        self.assertEqual(reading.found["attentionBackend"], "FLASHINFER", "the backend the user named")
        self.assertEqual(reading.evidence["attentionBackend"], "log: the backend the user named")

    def test_the_mode_the_engine_began_in_is_the_mode_when_nothing_downgrades_it(self) -> None:
        reading = read(LOG)
        self.assertEqual(reading.found["graphMode"], "FULL_AND_PIECEWISE")
        self.assertIn("no downgrade", reading.evidence["graphMode"])

    def test_a_downgrade_is_enough_without_the_config_line_or_the_dump(self) -> None:
        only = "\n".join(line for line in vllm_text("downgrade.txt").splitlines() if "Initializing" not in line)
        self.assertEqual(read(only).found["graphMode"], "PIECEWISE")

    def test_every_downgrade_message_of_the_pinned_source_is_read(self) -> None:
        # The six messages of vllm/config/compilation.py (:1414-1464), as `msg` ends with its choice, and the override of :1474.
        stems = (
            ("CUDAGraphMode.FULL is not supported with FlashInferBackend backend (support: AttentionCGSupport.UNIFORM_BATCH)", "FULL_AND_PIECEWISE", ""),
            ("CUDAGraphMode.FULL is not supported with FlashInferBackend backend (support: AttentionCGSupport.UNIFORM_BATCH)", "FULL_DECODE_ONLY", ""),
            ("CUDAGraphMode.FULL_DECODE_ONLY is not supported with X backend (support: AttentionCGSupport.NEVER)", "PIECEWISE", " because attention is compiled piecewise"),
            ("CUDAGraphMode.FULL_DECODE_ONLY is not supported with X backend (support: AttentionCGSupport.NEVER)", "NONE", " because attention is not compiled piecewise"),
            ("CUDAGraphMode.FULL_AND_PIECEWISE is not supported with spec-decode for attention backend X (support: AttentionCGSupport.NEVER)", "PIECEWISE", ""),
            ("CUDAGraphMode.FULL_AND_PIECEWISE is not supported with spec-decode for attention backend X (support: AttentionCGSupport.NEVER)", "NONE", ""),
        )
        for stem, mode, tail in stems:
            self.assertEqual(read(f"WARNING 11-09 [compilation.py:1] {stem}; setting cudagraph_mode={mode}{tail}").found["graphMode"], mode, stem)
        override = "WARNING 11-09 [compilation.py:1474] Cudagraph mode FULL_AND_PIECEWISE requires piecewise capture, but the loaded model provides neither a compiled submodule nor breakable CUDA graphs. Overriding to FULL_DECODE_ONLY."
        self.assertEqual(read(override).found["graphMode"], "FULL_DECODE_ONLY")

    def test_enforce_eager_is_none_with_or_without_the_config_line(self) -> None:
        log = vllm_text("enforce-eager.txt")
        self.assertEqual(read(log).found["graphMode"], "NONE")
        self.assertIn("config line", read(log).evidence["graphMode"])
        without = "\n".join(line for line in log.splitlines() if "Initializing" not in line)
        self.assertEqual(read(without).found["graphMode"], "NONE")
        self.assertTrue(read(without).evidence["graphMode"].startswith("log: enforce eager"), read(without).evidence["graphMode"])

    def test_a_config_line_that_does_not_list_the_mode_is_not_a_reason_to_lose_what_enforce_eager_says(self) -> None:
        log = vllm_text("enforce-eager.txt")
        silent = "\n".join(line.replace("'cudagraph_mode': <CUDAGraphMode.NONE: 0>, ", "") for line in log.splitlines())
        self.assertNotIn("cudagraph_mode", silent.split("Initializing", 1)[1])
        self.assertEqual(read(silent).found["graphMode"], "NONE")

    def test_enforce_eager_against_a_dump_that_says_otherwise_is_a_disagreement(self) -> None:
        reading = read(vllm_text("enforce-eager.txt"), {"compilation_config": {"cudagraph_mode": "FULL"}})
        self.assertNotIn("graphMode", reading.found)
        self.assertTrue(any("graphMode" in note and "disagree" in note for note in reading.notes), reading.notes)

    def test_a_downgrade_before_the_config_line_is_not_a_downgrade_of_that_engine(self) -> None:
        early = "WARNING [compilation.py:1] CUDAGraphMode.FULL is not supported with X backend (support: Y); setting cudagraph_mode=PIECEWISE\n" + LOG
        self.assertEqual(read(early).found["graphMode"], "FULL_AND_PIECEWISE")

    def test_the_dump_and_the_config_line_that_disagree_leave_the_mode_missing_until_a_downgrade_decides(self) -> None:
        other = {"vllm_config": {"compilation_config": {"cudagraph_mode": "PIECEWISE"}}}
        reading = read(LOG, other)
        self.assertNotIn("graphMode", reading.found)
        self.assertTrue(any("graphMode" in note and "disagree" in note for note in reading.notes))
        self.assertEqual(read(vllm_text("downgrade.txt"), other).found["graphMode"], "PIECEWISE", "the last downgrade names the mode that ran")

    def test_a_dump_gives_a_mode_by_name_by_number_or_by_pair(self) -> None:
        for value, mode in (("FULL_AND_PIECEWISE", "FULL_AND_PIECEWISE"), ("CUDAGraphMode.FULL", "FULL"), ("none", "NONE"), (0, "NONE"), (1, "PIECEWISE"), (2, "FULL"), ([2, 0], "FULL_DECODE_ONLY"), ((2, 1), "FULL_AND_PIECEWISE")):
            self.assertEqual(read("", {"compilation_config": {"cudagraph_mode": value}}).found.get("graphMode"), mode, value)
        for value in ("MAYBE", 3, True, [1, 2], None, {}):
            self.assertNotIn("graphMode", read("", {"compilation_config": {"cudagraph_mode": value}}).found, value)


class AsyncAndLimits(unittest.TestCase):
    def test_the_dump_says_whether_async_scheduling_is_on(self) -> None:
        for value in (True, False):
            dump = {"scheduler_config": {"async_scheduling": value}}
            self.assertEqual(read("", dump).found["asyncScheduling"], value)
        self.assertNotIn("asyncScheduling", read("", {"scheduler_config": {"async_scheduling": None}}).found, "a dump from before the config resolved it")
        self.assertNotIn("asyncScheduling", read("", {"scheduler_config": {"async_scheduling": 1}}).found, "a number is not a switch")

    def test_the_log_says_when_it_is_off_and_when_the_user_named_it(self) -> None:
        self.assertIs(read("INFO 11-09 [startup.py:96] non-default args: {'model': 'm', 'async_scheduling': False}").found["asyncScheduling"], False)
        self.assertIs(read("INFO 11-09 [startup.py:96] non-default args: {'model': 'm', 'async_scheduling': True}").found["asyncScheduling"], True)
        for warning in (
            "Async scheduling will be disabled because it is not supported with the `uni` distributed executor backend. ",
            "Async scheduling is disabled for ROCm DeepEP high-throughput DBO because that combination can corrupt DP+EP generation accuracy.",
            "Async scheduling is disabled because the V1 model runner does not support it with pipeline parallelism.",
            "Disabling asynchronous scheduling by default for pooling model.",
        ):
            self.assertIs(read(f"WARNING [vllm.py:1] {warning}").found["asyncScheduling"], False, warning)

    def test_the_dump_and_a_log_that_disagree_leave_it_missing(self) -> None:
        reading = read("Async scheduling is disabled because the V1 model runner does not support it with pipeline parallelism.", {"scheduler_config": {"async_scheduling": True}})
        self.assertNotIn("asyncScheduling", reading.found)
        self.assertTrue(any("disagree" in note for note in reading.notes))

    def test_a_limit_the_user_typed_counts_when_nothing_else_says(self) -> None:
        reading = read("INFO [startup.py:96] non-default args: {'model': 'm', 'max_num_seqs': 64, 'max_num_batched_tokens': 4096}")
        self.assertEqual((reading.found["maxNumSeqs"], reading.found["maxNumBatchedTokens"]), (64, 4096))
        self.assertEqual(reading.evidence["maxNumSeqs"], "non-default args in the log")

    def test_the_debug_default_lines_are_read_and_a_later_engine_wins(self) -> None:
        log = "DEBUG [arg_utils.py:3237] Defaulting max_num_seqs to 256 for LLM_CLASS usage context.\nDEBUG [arg_utils.py:3237] Defaulting max_num_seqs to 64 for LLM_CLASS usage context.\n"
        self.assertEqual(read(log).found["maxNumSeqs"], 64)

    def test_a_number_that_is_not_a_positive_integer_is_no_limit(self) -> None:
        for bad in (0, -1, 2.5, "8192", True, None):
            self.assertNotIn("maxNumSeqs", read("", {"scheduler_config": {"max_num_seqs": bad}}).found, bad)


class Backend(unittest.TestCase):
    def test_the_automatic_pick_and_the_named_one(self) -> None:
        auto = "INFO [cuda.py:509] Using TRITON_ATTN attention backend out of potential backends: ['TRITON_ATTN', 'FLEX_ATTENTION']."
        self.assertEqual(read(auto).found["attentionBackend"], "TRITON_ATTN")
        self.assertEqual(read("INFO [cuda.py:448] Using AttentionBackendEnum.FLASHINFER backend.").found["attentionBackend"], "FLASHINFER")
        self.assertEqual(read("INFO [cuda.py:448] Using FLASH_ATTN backend.").found["attentionBackend"], "FLASH_ATTN")

    def test_lines_that_only_look_like_it_are_not_the_pick(self) -> None:
        for line in (
            "INFO [selector.py:1] Using FlashInfer KDA prefill backend.",
            "INFO [xpu.py:192] Using Triton backend.",
            "INFO [selector.py:106] Using TRITON MLA prefill backend.",
            "INFO [ssu_dispatch.py:635] Using TRITON Mamba SSU backend.",
            "INFO [interface.py:430] Using default backend AttentionBackendEnum.TORCH_SDPA for vit attention",
        ):
            self.assertNotIn("attentionBackend", read(line).found, line)

    def test_the_first_pick_is_taken_and_a_second_one_is_noted(self) -> None:
        log = (
            "INFO [cuda.py:509] Using FLASH_ATTN attention backend out of potential backends: ['FLASH_ATTN'].\n"
            "INFO [cuda.py:509] Using TRITON_ATTN attention backend out of potential backends: ['TRITON_ATTN'].\n"
        )
        reading = read(log)
        self.assertEqual(reading.found["attentionBackend"], "FLASH_ATTN")
        self.assertTrue(any("more than one attention backend" in note for note in reading.notes))

    def test_a_backend_the_user_named_in_the_dump_counts_when_the_log_is_silent(self) -> None:
        for value, name in (("FLASHINFER", "FLASHINFER"), ("AttentionBackendEnum.FLASH_ATTN", "FLASH_ATTN"), ("flash_attn", None), ("auto", None), (None, None), (3, None)):
            self.assertEqual(read("", {"attention_config": {"backend": value}}).found.get("attentionBackend"), name, value)

    def test_the_log_outranks_the_dump(self) -> None:
        reading = read(LOG, {"attention_config": {"backend": "FLASHINFER"}})
        self.assertEqual(reading.found["attentionBackend"], "FLASH_ATTN")


class Essentials(unittest.TestCase):
    """What a lab keeps of a dump: the values the reading uses, and the same reading from them."""

    def test_the_essentials_are_the_values_the_reading_uses_and_nothing_else(self) -> None:
        self.assertEqual(
            engine_config.dump_essentials(DUMP_4090),
            {"scheduler_config": {"max_num_batched_tokens": 2048, "max_num_seqs": 256, "async_scheduling": True}, "compilation_config": {"cudagraph_mode": "FULL_AND_PIECEWISE"}},
        )
        text = json.dumps(engine_config.dump_essentials(DUMP_4090))
        for left_out in ("Qwen", "cache_dir", "/root", "system_env", "OS", "nvidia_gpu_models", "VLLM_CACHE_ROOT"):
            self.assertNotIn(left_out, text)

    def test_the_reading_from_the_essentials_is_the_reading_from_the_dump(self) -> None:
        for dump in (DUMP_4090, DUMP_H100, json.dumps(DUMP_4090), DUMP_4090["vllm_config"]):
            for log in (LOG, vllm_text("downgrade.txt"), ""):
                kept = engine_config.dump_essentials(dump)
                self.assertEqual(read(log, kept).found, read(log, dump).found)

    def test_a_backend_the_user_named_is_kept_and_anything_odd_is_not(self) -> None:
        dump = {"attention_config": {"backend": "AttentionBackendEnum.FLASHINFER"}, "scheduler_config": {"max_num_seqs": True, "async_scheduling": 1, "max_num_batched_tokens": "8192"}}
        self.assertEqual(engine_config.dump_essentials(dump), {"attention_config": {"backend": "FLASHINFER"}})
        self.assertEqual(engine_config.dump_essentials(None), {})
        self.assertEqual(engine_config.dump_essentials(42), {})
        self.assertEqual(engine_config.dump_essentials("{not json"), {})


class Robust(unittest.TestCase):
    def test_colour_codes_carriage_returns_and_a_prefix_of_the_users_own_do_not_matter(self) -> None:
        coloured = "".join("\x1b[33mWARN\x1b[0m " + line + "\r\n" if "WARNING" in line else "PREFIX> " + line + "\r\n" for line in LOG.splitlines())
        self.assertEqual(read(coloured, DUMP_4090).config, read(LOG, DUMP_4090).config)

    def test_nothing_in_the_log_is_nothing_found_and_it_is_not_an_error(self) -> None:
        for log in ("", "\n\n", "just some text", "\x00\x01\x02" * 100, "é" * 1000):
            reading = read(log)
            self.assertIsNone(reading.config)
            self.assertEqual(reading.found, {})
            self.assertEqual(reading.missing, FIELDS)

    def test_a_long_line_is_read_in_good_time(self) -> None:
        junk = "x" * 2_000_000
        reading = read(f"INFO [core.py:140] Initializing a V1 LLM engine (v0.33.0) with config: {junk}\n{LOG}")
        self.assertEqual(reading.found["runner"], "MRV2")

    def test_a_dump_that_is_not_a_dump_is_noted_and_not_fatal(self) -> None:
        for dump in (42, ["a"], "{not json", b"bytes"):
            reading = read(LOG, dump)
            self.assertEqual(reading.found["runner"], "MRV2")
        self.assertTrue(any("not JSON" in note for note in read(LOG, "{not json").notes))
        self.assertTrue(any("neither a mapping" in note for note in read(LOG, 42).notes))

    def test_only_vllm_is_read(self) -> None:
        reading = read(LOG, DUMP_4090, engine="sglang")
        self.assertIsNone(reading.config)
        self.assertEqual(reading.missing, FIELDS)
        self.assertIn("vLLM only", reading.notes[0])
        self.assertIn("sglang", reading.notes[0])

    def test_the_values_are_of_the_shapes_the_receipt_holds(self) -> None:
        config = read(LOG, DUMP_4090).config or {}
        self.assertIsInstance(config["runner"], str)
        self.assertIsInstance(config["asyncScheduling"], bool)
        self.assertEqual({type(config[name]) for name in ("maxNumBatchedTokens", "maxNumSeqs")}, {int})


class Sample(Lab):
    """An engine lab that hands over what it is given."""

    id = "tr3.profile"
    title = "A synthetic engine lab"
    environment = "vllm"
    stages = {"tr3.profile.s2": Stage("tr3.profile.s2", "Profile", checks=("agreement",))}

    def __init__(self, run: EngineRun | None, environment: str = "vllm") -> None:
        self.engine_run = run
        self.environment = environment  # type: ignore[misc]

    def run(self, context: StageContext) -> StageResult:
        return StageResult(
            inputs=[],
            artifacts=[Artifact.from_text("log", "log", "text/plain", "engine log, scrubbed\n")],
            checks=[make_check("agreement", "correctness", True, detail="")],
            notes="Synthetic: made by labs/grader/tests/test_engine_config.py. No machine ran it.",
            engine_run=self.engine_run,
        )


class Graded(unittest.TestCase):
    """What `run_stage` does with a run: the configuration goes in the receipt, and one check says whether all six were found."""

    def grade(self, run: EngineRun | None, environment: str = "vllm") -> tuple[dict[str, Any], Path]:
        holder = tempfile.TemporaryDirectory(prefix="enginespace-test-")
        self.addCleanup(holder.cleanup)
        outcome = run_stage(
            Sample(run, environment),
            "tr3.profile.s2",
            format_challenge("tr3.profile.s2", 0x0BADC0DE, "ABCDEFGHJKLMNPQR", "20261104"),
            out_dir=Path(holder.name),
            environment={key: value for key, value in samples.sample_environment().items() if key != "engineConfig"},
            pins=samples.sample_pins(),
            provenance=samples.PROVENANCE,
            now=lambda: samples.NOW,
            log=lambda message: None,
        )
        return outcome.receipt, outcome.path

    def test_a_complete_reading_is_in_the_receipt_and_the_check_passes(self) -> None:
        receipt, path = self.grade(EngineRun(log=LOG, config_dump=DUMP_4090))
        self.assertEqual(receipt["environment"]["engineConfig"], read(LOG, DUMP_4090).config)
        check = next(entry for entry in receipt["checks"] if entry["id"] == "engine-config")
        self.assertEqual((check["kind"], check["pass"]), ("environment", True))
        self.assertIn("MRV2 (log: Using V2 Model Runner)", check["detail"])
        self.assertTrue(verify_file(path).ok, "the site's first three rules take it")

    def test_an_incomplete_reading_costs_the_field_and_the_check_and_not_the_run(self) -> None:
        receipt, path = self.grade(EngineRun(log=LOG))
        self.assertNotIn("engineConfig", receipt["environment"])
        check = next(entry for entry in receipt["checks"] if entry["id"] == "engine-config")
        self.assertFalse(check["pass"])
        self.assertIn("not found: asyncScheduling, maxNumSeqs", check["detail"])
        self.assertTrue(path.exists())
        self.assertTrue(verify_file(path).ok)

    def test_a_lab_that_hands_over_no_run_has_no_such_check(self) -> None:
        receipt, _ = self.grade(None)
        self.assertNotIn("engineConfig", receipt["environment"])
        self.assertEqual([entry["id"] for entry in receipt["checks"]], ["agreement"])

    def test_an_engine_that_is_not_read_fails_the_check_with_the_reason(self) -> None:
        receipt, _ = self.grade(EngineRun(log=LOG, config_dump=DUMP_4090), environment="sglang")
        check = next(entry for entry in receipt["checks"] if entry["id"] == "engine-config")
        self.assertFalse(check["pass"])
        self.assertIn("vLLM only", check["detail"])


if __name__ == "__main__":
    unittest.main()
