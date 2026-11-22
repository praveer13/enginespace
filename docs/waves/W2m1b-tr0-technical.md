# TR0 technical check (W2b-T34)

The TR0 pages checked here are the five lessons, the module page, the `tensor` card, the item families and their rule tables, the copy of Tensor views and the lab page. The check went claim by claim and number by number. It changed nothing else.

The check was made on 2026-11-21 on the wave-2m1b tip `5ca7e589`, from a fresh context, without the report of the cold-reader check.

## Verdict

- **Claims of `content/claims/tr0.yaml`: 117 rows.** 109 are verified. 8 could not be read: the vLLM interpreter-run claims, whose quotes are verified but whose run was not repeated (see below). None is wrong. For 5 claims `scripts/claims/requote.ts` reported "moved". Each of those quotes lies inside its anchor, and the script is what is wrong (Follow-up F1).
- **Tagged numbers of the five lessons: every one has a row below.** Each was recomputed in real PyTorch 2.14.0 and Triton 3.8.0 (the locked CPU environment), checked against `tests/content/tr0-demos.ts`, or both. All are verified.
- **Wrong rows: 3.** Each names its file and line.

| # | File and line | What it says | What is so | Evidence |
|---|---|---|---|---|
| W1 | `content/modules/tr0/lessons/l3-nn-module-as-a-struct.md:94` | "That is why the layer makes a copy at the end of the attention and not a view." The paragraph credits the copy to the layer's own `reshape(...).contiguous()`. Lesson 3 line 70, lesson 2 line 44 and claim `transformers.qwen3.attn-contiguous` say the same. | In transformers 5.19.0 the copy is made inside the attention function. `eager_attention_forward` ends with `attn_output.transpose(1, 2).contiguous()` (`modeling_qwen3.py` L197), and the SDPA path does the same (`transformers/integrations/sdpa_attention.py` L180). So the tensor that reaches `modeling_qwen3.py` L270 is already contiguous in `(batch, tokens, heads, head size)`. There the `reshape` is a view and `contiguous()` returns the tensor itself. The sentence before it, that a `view` of the table's transposed `(1, 16, 6, 128)` tensor to `(1, 6, 2048)` is refused, is true in torch. But the tensor the code turns back is a fresh attention output, transposed, not that one. | In the locked CPU environment a 1-layer random-weight `Qwen3ForCausalLM` (transformers 5.19.0, torch 2.14.0+cpu) ran with `attn_implementation` eager, then sdpa. The input of `o_proj` had the same `data_ptr` as the attention function's output, shape `(1, 6, 4, 16)`, strides `(384, 64, 16, 1)`, contiguous [measured 2026-11-21, `5ca7e589`]. |
| W2 | `content/modules/tr0/lessons/l3-nn-module-as-a-struct.md:31` | "The lab's loader checks it for you, because it refuses a name that has no field to go into." | The lab has no loader that refuses a name. `load_weights` in `labs/grader/src/enginespace_grader/labs/tr0_forward_worker.py` reads the safetensors into a dict and adds `lm_head.weight` when the config ties it. It then calls the learner's `build(config, weights)`. Nothing in the grader or the starter calls `load_state_dict` or checks names (a grep for `strict`, `load_state_dict`, `missing_keys` and `unexpected` finds nothing). The refusal comes from `load_state_dict(strict=True)` if the learner's own `build` uses it, as `labs/gpu/tr0-forward/LAB.md` section 5 advises. | Reading the files at `5ca7e589`. |
| W3 | `content/cards/tensor.md:40` | "Nothing for the grid yet. ... No Triton run, interpreted or compiled, has been compared with them." | A Triton interpreter run has now been compared with the grid's counts for two launches. `scripts/triton-interp/course_kernel.py` asserts what each kernel wrote. `tests/content/tr0-demos.ts` (`courseKernelLines`) prints its two summary lines from `gridCoverage`, and lesson 4 lines 125-130 show the run ending on "the grid model's own numbers" (claim `triton.course-kernel.ran`). The line was true before that run and is stale now. | `course_kernel.py` was run again here (row 72 of the claims table). Its output matched the model's numbers. |

Notes for the fix task. None of these is wrong; each sharpens a page:

- N1. Lesson 3 line 86 says the query "takes the path the pinned code gives it": viewed, then transposed. In the pinned code `q_norm` runs between the `view` and the `transpose` (`modeling_qwen3.py` L244). The norm writes a new tensor with the same shape and strides, so every number of the table holds. The sentence leaves out one step. Fixing W1 and N1 together keeps lessons 2 and 3 consistent.
- N2. Lesson 4 line 132 and lesson 5 line 58 say Model Runner V2 is the runner vLLM uses by default. No claim of `content/claims/tr0.yaml` states it. The fact is right: `VllmConfig.use_v2_model_runner` at v0.33.0 (`vllm/config/vllm.py` L730-L766, read here) returns True when nothing else applies. But it falls back to V1 when Triton is missing or the configuration uses an unsupported feature, and a set `VLLM_USE_V2_MODEL_RUNNER` decides. The claim `vllm.mrv2.env-decides` in `content/claims/tr2.yaml` states this. TR0 could cite it.
- N3. Lesson 5 line 58 says "vLLM's own Dockerfile and its tests use Python 3.12". The source says the tests in CI "(except `mypy`)". This is close enough, and the claim text keeps the exception.

## How it was checked

- **Quotes at GitHub pins.** `bun scripts/claims/requote.ts content/claims/tr0.yaml` (generic User-Agent, no token) gave: covered 117 of 117, 59 verified, 5 moved, 0 missing, 0 unreadable, 53 skipped, 0 not reached (exit 1). Separately, each anchored file was fetched as raw text at its pin and every anchored quote was located by line with a separate reader. All 64 anchored quotes lie inside their anchors. The 5 "moved" rows are the transformers file. That file holds 96 characters outside the Basic Multilingual Plane (the emoji banner of lines 1-6), and `locate()` in `requote.ts` moves its line numbers on by one place for each of them (F1).
- **Quotes on pages and JSON (the 53 claims the script skips).** Each PyTorch 2.14 page, each PyPI JSON (torch 2.14.0, triton 3.8.0, transformers 5.19.0), the hub's two JSON listings and `config.json` at revision `c1899de2` was fetched once. Each quote was found in the raw text or in the text with HTML tags removed, and each `config.json` anchor line was read.
- **Derived numbers** were recomputed by hand and in Python. **Synthetic numbers** were checked against `tests/content/tr0-demos.ts`: `bun test` of `tests/content/tr0-module.test.ts` and `tests/sim/tensor-torch.test.ts` under CI's environment gave 85 pass, 0 fail. The same numbers were then recomputed in torch 2.14.0+cpu.
- **Configuration values** were read on the lines of `config.json` at `c1899de2` (all 13 match).
- **Commands** were checked against the kit `public/labs/enginespace-gpu-kit-0.1.0.zip`: its members, `enginespace --help`, `enginespace grade --help` and `enginespace fetch --help` from the locked CPU environment, `labs/gpu/tr0-forward/lab.toml`, the grader's `tr0_forward.py` and `tr0_forward_worker.py`, and lesson 4's interpreter snippet, run as printed.
- **Item families**: `bun test` of `tests/play/items-{find-the-sync,grid-cover,strides-of,view-or-copy}.test.ts` gave 96 pass, 0 fail. Each row of `sync-rules.ts` was read against its claims.
- The commits a lesson prints (`c83faee`, `0dc2dcc`, `7037bd7`, `ee64e9ec`) exist and are ancestors of the tip.

## Claims of `content/claims/tr0.yaml`

| # | claim | tag | anchor | how checked | status | note |
|---|---|---|---|---|---|---|
| 1 | `torch.view.shares-data` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 2 | `torch.view.needs-compatible-strides` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 3 | `torch.view.otherwise-copy` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 4 | `torch.view.prefer-reshape` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 5 | `torch.reshape.view-if-compatible` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 6 | `torch.views.reshape-unspecified` | measured | - | fetched page or JSON | verified | Checked from the fetched page, not by the script. The quote is in the page text once the HTML tags are removed (the apostrophes are U+2019 in both). |
| 7 | `torch.contiguous.returns-self` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 8 | `torch.views.contiguous-copies` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 9 | `torch.expand.stride-zero` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 10 | `torch.expand.one-address` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 11 | `torch.stride.definition` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 12 | `torch.views.no-data-moves` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 13 | `torch.views.can-be-noncontiguous` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 14 | `torch.views.view-ops` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 15 | `torch.views.basic-indexing` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 16 | `torch.cuda.async-by-default` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 17 | `torch.cuda.enqueued` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 18 | `torch.cuda.item-synchronizes` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 19 | `torch.tolist.moves-to-cpu` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 20 | `torch.cpu.copies` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 21 | `torch.to.copies` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 22 | `torch.cuda.synchronize-waits` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 23 | `torch.cuda.non-blocking` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 24 | `torch.cuda.timing-needs-sync` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 25 | `torch.cuda.sync-debug-warns` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 26 | `torch.cuda.sync-debug-partial` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 27 | `torch.cuda.print-waits` | unverified | - | fetched page or JSON | verified | The quote is in the page. The claim stays `unverified`, as it says. No page read states that printing waits. |
| 28 | `torch.release.triton-pin` | measured | - | fetched page or JSON | verified | From `requires_dist`: `triton~=3.8.0; platform_system == "Linux" and python_version < "3.15"`. |
| 29 | `torch.release.upload` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 30 | `triton.release.upload` | measured | - | fetched page or JSON | verified | The date is right. The quoted time is when one file was uploaded. The earliest file of 3.8.0 went up at 2026-08-28T15:55:34Z, the same day. |
| 31 | `triton.release.python-range` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 32 | `transformers.release.upload` | measured | - | fetched page or JSON | verified | The quote is on the page, and the text says what the page says. |
| 33 | `python.vllm.default-3-12` | measured | L78 | requote.ts and read | verified | L78 also says "compatible with Python versions 3.11 to 3.14". |
| 34 | `triton.program-id` | measured | L1945-L1950 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 35 | `triton.program-id-axes` | measured | L1949 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 36 | `triton.num-programs` | measured | L1966 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 37 | `triton.arange-power-of-two` | measured | L1992 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 38 | `triton.arange-range-check` | measured | L583-L594 | requote.ts and read | verified | L592-L593: `range = end - start` must satisfy `range & (range - 1) == 0`. |
| 39 | `triton.arange-constexpr` | measured | L585 | requote.ts and read | verified | L584-L585: the check is `isinstance(start, int)` and `isinstance(end, int)`, which a constexpr satisfies once it is unwrapped. |
| 40 | `triton.constexpr` | measured | L212 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 41 | `triton.cdiv-device` | measured | L34-L43 | requote.ts and read | verified | L43: `return (x + (div - 1)) // div`. |
| 42 | `triton.cdiv-host` | measured | L69-L70 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 43 | `triton.load-mask` | measured | L2506 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 44 | `triton.load-other` | measured | L2509 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 45 | `triton.store-mask` | measured | L2588 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 46 | `triton.interpret-knob` | measured | L471 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 47 | `triton.interpret-swaps-jit` | measured | L984-L985 | requote.ts and read | verified | L984-L985: `if knobs.runtime.interpret:` returns `InterpretedFunction`. |
| 48 | `triton.launch-syntax` | measured | L370 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 49 | `triton.interpret-one-program-at-a-time` | measured | L1409-L1413 | requote.ts and read | verified | L1409-L1413: three nested loops, `set_grid_idx`, then `self.fn(**args)`. |
| 50 | `triton.interpret-on-cpu` | measured | L1352 | requote.ts and read | verified | L1352 copies the arguments to the host. `_restore_args_dev` (from L1360) copies them back after the grid (L1420-L1421). |
| 51 | `vllm.mrv2.gumbel-lines` | measured | L417 | requote.ts and read | verified | The file has 417 lines. It holds two kernels and the murmur3 hash helpers (from L79). |
| 52 | `vllm.mrv2.buffer-utils-lines` | measured | L357 | requote.ts and read | verified | The file has 357 lines. It has one kernel, plus the helper `_load_ptr`. |
| 53 | `vllm.mrv2.block-table-lines` | measured | L414 | requote.ts and read | verified | The file has 414 lines and two kernels (L275, L334). |
| 54 | `vllm.mrv2.input-batch-lines` | measured | L759 | requote.ts and read | verified | The file has 759 lines. |
| 55 | `vllm.mrv2.rejection-sampler-lines` | measured | L1411 | requote.ts and read | verified | The file has 1,411 lines. |
| 56 | `vllm.mrv2.temperature-grid` | measured | L53-L55 | requote.ts and read | verified | `BLOCK_SIZE = 8192` at L53, the grid `(num_tokens, num_blocks)` at L55. |
| 57 | `vllm.mrv2.temperature-mask` | measured | L38-L39 | requote.ts and read | verified | L38-L39: `block = block_idx * BLOCK_SIZE + tl.arange(0, BLOCK_SIZE)`, `mask = block < vocab_size`. |
| 58 | `vllm.mrv2.staged-write-tensor` | measured | L135 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 59 | `vllm.mrv2.apply-write-mask` | measured | L328-L348 | requote.ts and read | verified | `tl.program_id(0)` is the write (L328), and `tl.program_id(1) * BLOCK_SIZE` is the block of its content (L347). |
| 60 | `vllm.mrv2.block-table-grid` | measured | L290-L291 | requote.ts and read | verified | L290-L291: group on axis 0, batch row on axis 1. |
| 61 | `vllm.mrv2.input-batch-kernels` | measured | L280-L741 | requote.ts and read | verified | The seven `@triton.jit` kernels start at L280, 357, 415, 517, 566, 690 and 722. |
| 62 | `vllm.mrv2.rejection-kernels` | measured | L209-L1085 | requote.ts and read | verified | The six kernels start at L209, 322, 403, 503, 804 and 1019, and `rejection_sample` launches them at L1196, 1232, 1265, 1306, 1360 and 1397. The other `@triton.jit` functions are helpers. |
| 63 | `vllm.mrv2.interpreter-run` | measured | L127 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 64 | `vllm.mrv2.interp.temperature` | measured | L22 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 65 | `vllm.mrv2.interp.gumbel-sample` | measured | L282 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 66 | `vllm.mrv2.interp.apply-write` | measured | L317 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 67 | `vllm.mrv2.interp.gather-block-tables` | measured | L275 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 68 | `vllm.mrv2.interp.slot-mappings` | measured | L334 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 69 | `vllm.mrv2.interp.prepare-prefill` | measured | L280 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 70 | `vllm.mrv2.interp.pos-seq-lens` | measured | L357 | requote.ts and read | could not be read | The quote is inside its anchor. The run itself is the log of `scripts/triton-interp/run.py` in the cpu job of `labs.yml`. That job was not repeated here: the script runs functions it extracts from fetched vLLM files, and this check runs no fetched code. The CI log was not readable from here. |
| 71 | `vllm.mrv2.interp.not-run` | unverified | L209 | requote.ts and read | verified | The anchor holds the quote. The 11 named kernels are the 5 of `input_batch.py` (L415-L722) and the 6 of `rejection_sampler_utils.py`. Tag `unverified`, as the claim says. |
| 72 | `triton.course-kernel.ran` | measured | - | run again | verified | Run again here on 2026-11-21, in the locked CPU environment (torch 2.14.0+cpu, Triton 3.8.0, TRITON_INTERPRET=1) at wave-2m1b 5ca7e589 [measured]: `scripts/triton-interp/course_kernel.py` printed the last program's offsets `[ 8  9 10 11]` and mask `[ True  True False False]`, then `1-D: n=10 BLOCK=4 programs=3 lanes=12 masked=2` and `2-D: shape=(5, 6) strides=(1, 5) BLOCK=(2, 4) grid=(3, 2) masked=18`, and both asserts held. |
| 73 | `minisgl.qwen3.lines` | measured | L83 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 74 | `minisgl.qwen3.attention-imported` | measured | L12 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 75 | `minisgl.qwen3.layer-order` | measured | L37-L40 | requote.ts and read | verified | Quote at L39. That the residual add is part of the norm was read in `python/minisgl/layers/norm.py` at the same commit, `RMSNormFused.forward` L32-L38 (`fused_add_rmsnorm`). |
| 76 | `minisgl.qwen3.nvtx-layer` | measured | L33 | requote.ts and read | verified | L33. `utils.py` puts `@nvtx_annotate("MLP")` at L44 and `@nvtx_annotate("MHA")` at L118, so the attention and the MLP have their own ranges. |
| 77 | `minisgl.attn.merged-qkv` | measured | L89 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 78 | `minisgl.attn.qkv-width` | measured | L85 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 79 | `minisgl.attn.qkv-one-matmul` | measured | L32 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 80 | `minisgl.attn.forward` | measured | L120-L123 | requote.ts and read | verified | L120-L123. `AttentionLayer` gets `rotary_config`, `q_norm` and `k_norm` at L103-L111. |
| 81 | `minisgl.mlp.gate-up-merged` | measured | L27 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 82 | `transformers.qwen3.decoder-order` | measured | L296-L315 | requote.ts and read | verified | Quote at L312; L296-L315 run residual, norm, attention, add, then the same for the MLP. |
| 83 | `transformers.qwen3.rmsnorm` | measured | L59-L63 | requote.ts, then read | verified | Read by hand: the quote is line 62, inside L59-L63. The script said "moved" (L63-L66) because of its line-mapping defect (see Follow-ups). |
| 84 | `transformers.qwen3.qk-norm` | measured | L229-L230 | requote.ts and read | verified | L229-L230: both norms are built over `head_dim`. |
| 85 | `transformers.qwen3.attn-projections` | measured | L217-L227 | requote.ts and read | verified | L217-L228: q_proj, k_proj, v_proj and o_proj, with the widths the text gives. |
| 86 | `transformers.qwen3.attn-views` | measured | L244-L246 | requote.ts and read | verified | Quote at L244. The `q_norm` and `k_norm` run between the `view` and the `transpose` (L244-L245), so the query and key paths are view, norm, transpose. The norm makes a new tensor with the same strides. |
| 87 | `transformers.qwen3.attn-contiguous` | measured | L270 | requote.ts, then read | verified | Read by hand: the quote is line 270. The script said "moved" (L271-L275), its defect. The text is the code. But the `contiguous()` on that line copies nothing in the pinned code: see wrong row W1. |
| 88 | `transformers.qwen3.attn-scaling` | measured | L213 | requote.ts, then read | verified | Read by hand: the quote is line 213. The script said "moved" (L215-L217), its defect. |
| 89 | `transformers.qwen3.mlp` | measured | L75-L81 | requote.ts, then read | verified | Read by hand: the quote is line 81, inside L75-L81, and the three projections have `bias=False` (L75-L77). The script said "moved" (L85-L86), its defect. |
| 90 | `transformers.qwen3.rotate-half` | measured | L134-L136 | requote.ts, then read | verified | Read by hand: the quote is line 136, inside L134-L136. The script said "moved" (L140), its defect. |
| 91 | `transformers.qwen3.embedding` | measured | L344-L348 | requote.ts and read | verified | L344-L348: the embedding, the layers, then the final norm. |
| 92 | `sglang.pyo3.module` | measured | L4029-L4031 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 93 | `sglang.pyo3.registers` | measured | L4005-L4024 | requote.ts and read | verified | L4005-L4027. The function also registers `RustBigramUnifiedTreeCoreBinding`, `TlruFloatConfigBinding` and the function `get_hash_str`. The text does not list them, which does not make it wrong. |
| 94 | `sglang.pyo3.tch` | measured | L13 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 95 | `sglang.pyo3.tensor-bridge` | measured | L120-L122 | requote.ts and read | verified | The quote is inside the anchor, and the text says what the quoted lines say. |
| 96 | `sglang.pyo3.panic-to-error` | measured | L27-L42 | requote.ts and read | verified | L27-L43. The doc comment at L29 says "A poisoned core stays unusable." |
| 97 | `sglang.pyo3.match-prefix` | measured | L1033-L1049 | requote.ts and read | verified | L1034-L1050. |
| 98 | `qwen3.config.layers` | measured | L18 | fetched, line read | verified | The value matches the line the anchor names. |
| 99 | `qwen3.config.heads` | measured | L17 | fetched, line read | verified | The value matches the line the anchor names. |
| 100 | `qwen3.config.kv-heads` | measured | L19 | fetched, line read | verified | The value matches the line the anchor names. |
| 101 | `qwen3.config.head-dim` | measured | L9 | fetched, line read | verified | The value matches the line the anchor names. |
| 102 | `qwen3.config.hidden-size` | measured | L11 | fetched, line read | verified | The value matches the line the anchor names. |
| 103 | `qwen3.config.intermediate-size` | measured | L13 | fetched, line read | verified | The value matches the line the anchor names. |
| 104 | `qwen3.config.vocab-size` | measured | L29 | fetched, line read | verified | The value matches the line the anchor names. |
| 105 | `qwen3.config.max-positions` | measured | L14 | fetched, line read | verified | The value matches the line the anchor names. |
| 106 | `qwen3.config.rope-theta` | measured | L22 | fetched, line read | verified | The value matches the line the anchor names. |
| 107 | `qwen3.config.rms-eps` | measured | L20 | fetched, line read | verified | The value matches the line the anchor names. |
| 108 | `qwen3.config.tied-embeddings` | measured | L24 | fetched, line read | verified | The value matches the line the anchor names. |
| 109 | `qwen3.config.activation` | measured | L10 | fetched, line read | verified | The value matches the line the anchor names. |
| 110 | `qwen3.config.stored-dtype` | measured | L25 | fetched, line read | verified | The value matches the line the anchor names. |
| 111 | `qwen3.config.q-proj-rows` | derived | - | recomputed | verified | 16 * 128 = 2048, from the four config claims, which were verified. |
| 112 | `qwen3.config.kv-proj-rows` | derived | - | recomputed | verified | 8 * 128 = 1024, from the four config claims, which were verified. |
| 113 | `qwen3.config.qkv-merged-rows` | derived | - | recomputed | verified | (16 + 2 * 8) * 128 = 4096, from the four config claims, which were verified. |
| 114 | `qwen3.config.query-group` | derived | - | recomputed | verified | 16 / 8 = 2, from the four config claims, which were verified. |
| 115 | `qwen3.revision.licence` | measured | - | fetched page or JSON | verified | `cardData.license` is apache-2.0. The API `sha` is still c1899de2 on 2026-11-21. |
| 116 | `qwen3.weights.bytes` | unverified | - | fetched page or JSON | verified | The hub listing gives 1503300328 for `model.safetensors`. The claim stays `unverified`: no weight file was fetched. |
| 117 | `qwen3.weights.sha256` | unverified | - | fetched page or JSON | verified | The hub listing gives this `lfs.sha256` for `model.safetensors`. The claim stays `unverified`. |

The "how checked" column says what was done. "requote.ts and read" means the script verified the quote and the file was read again by line. "requote.ts, then read" means the script said "moved" and reading the file by hand showed the quote inside its anchor. Every claim cited with `{{claim:...}}` renders its `value`, and each value was compared with the source as well.

## Tagged numbers of the five lessons

"torch" means the number was recomputed in torch 2.14.0+cpu, in the locked CPU environment of `labs/envs/cpu`, on 2026-11-21. "demos" means `tests/content/tr0-demos.ts` and the module test that holds the lesson to it (85 pass).

### Lesson 1, `content/modules/tr0/lessons/l1-pytorch-in-rust-terms.md`

| Line | Number | Tag | Checked | Status |
|---|---|---|---|---|
| 25, 45, 53 | prediction p1, the copy moves 24 elements | [synthetic] | demos (`PREDICTIONS['tr0.l1.p1']` = 24); torch: `reshape(24)` of the transposed `(4, 6)` is a new buffer of 24 | verified |
| 43 | start `(4, 6)`, strides `(6, 1)`, contiguous, 0 moved | [synthetic] | demos (`viewsRun`); torch | verified |
| 44 | `transpose(0, 1)`: `(6, 4)`, `(1, 6)`, not contiguous, 0 moved | [synthetic] | demos; torch | verified |
| 45 | `reshape([24])`: `(24,)`, `(1,)`, contiguous, 24 moved | [synthetic] | demos; torch (`view(24)` refused, `reshape` copies) | verified |
| 47 | addresses `6 * i + 1 * j` and `1 * i + 6 * j` | untagged | the strides above | verified |
| 49, 51 | the walk 0, 6, 12, 18, then 1 | [synthetic] | demos (`transposedWalk`); torch: the first five elements of the transposed `arange(24).view(4, 6)` are 0, 6, 12, 18, 1 | verified |
| 81-82 | `address(...)` gives 15 and 20 | untagged | 2*6+3 = 15; 2*1+3*6 = 20 | verified |
| 87 | `(2, 3, 4)` has strides `(12, 4, 1)`; `permute(2, 0, 1)` gives `(1, 12, 4)` | untagged | torch | verified |
| 93-99 | prediction p2, `x[:, ::2]` on `(3, 5)` has `stride(1)` 2 | untagged answer | demos (`tr0.l1.p2`); torch gives 2 | verified |
| 99, 105 | `x[1:, :]`: offset 6, `(3, 6)`, `(6, 1)` | untagged | torch (`storage_offset()` 6) | verified |
| 106 | `x[:, ::2]`: offset 0, `(4, 3)`, `(6, 2)` | untagged | torch | verified |
| 107 | `x.transpose(0, 1)`: `(6, 4)`, `(1, 6)` | untagged | torch | verified |
| 108 | `.contiguous()` of it: `(6, 4)`, `(4, 1)`, every element moved | untagged | torch | verified |
| 120 | `expand` gives strides `(0, 1)`; `contiguous()` writes 24 elements | [synthetic] | demos (`strideZeroRun`); torch: `(4, 6)` strides `(0, 1)`, then `(6, 1)` | verified |
| 133 | float32 is 4 bytes; a stride of 6 steps 24 bytes | [derived] | torch `element_size()` 4; 6*4 = 24 | verified |

### Lesson 2, `content/modules/tr0/lessons/l2-views-copies-and-hidden-syncs.md`

| Line | Number | Tag | Checked | Status |
|---|---|---|---|---|
| 17 | the projection output is `(4, 8)` | [synthetic] | demos (`threeDRun`, practice seed 26 of `three-d`) | verified |
| 35 | start `(4, 8)`, `(8, 1)`, 0 | [synthetic] | demos; torch | verified |
| 36 | `reshape([4, 2, 4])`: `(4, 2, 4)`, `(8, 4, 1)`, 0 | [synthetic] | demos; torch (same `data_ptr`) | verified |
| 37 | `permute(1, 0, 2)`: `(2, 4, 4)`, `(4, 8, 1)`, 0 | [synthetic] | demos; torch | verified |
| 38 | `contiguous()`: `(2, 4, 4)`, `(16, 4, 1)`, 32 | [synthetic] | demos; torch | verified |
| 40 | two neighbouring tokens of one head are 8 apart (p1) | [synthetic] | demos (`tr0.l2.p1` = 8); torch stride(1) of the permuted tensor is 8 | verified |
| 42 | 32 elements move; each head is a run of 16 | [synthetic] | demos; torch | verified |
| 71 | prediction p2, three of the four lines wait | untagged answer | demos (`tr0.l2.p2` = 3, from `sync-rules.ts`); each row's claims verified | verified |
| 103 | the loop waits 25 times | [derived] | 24 passes of `.item()` + 1 `.tolist()` = 25; `block(h)` and `.sum()` enqueue | verified |
| 107 | printing a GPU tensor | [unverified] | claim `torch.cuda.print-waits` stays unverified, as the line says | verified |
| 44 | the reshape and `contiguous()` after the attention | claim | see W1: the code says this, but the copy happens one call earlier, inside the attention function | verified, see W1 |

### Lesson 3, `content/modules/tr0/lessons/l3-nn-module-as-a-struct.md`

| Line | Number | Tag | Checked | Status |
|---|---|---|---|---|
| 31 | how `nn.Module` builds names | [unverified] | the tag stands; the next sentence is W2 | wrong, see W2 |
| 37-45 | the nine config values (1024, 28, 16, 8, 128, 40960, 3072, 151936, 1e-06) | claims | each claim's line of `config.json` at `c1899de2` | verified |
| 47 | each key and value head serves 2 query heads | claim (derived) | 16 / 8 = 2 | verified |
| 51 | prompt: 1024, 16, 8, 128 | [measured] | the config lines 11, 17, 19, 9 | verified |
| 51 | p1 answer 2048 | untagged answer | demos (`tr0.l3.p1` = 16 * 128) | verified |
| 64 | 2048 rows for the query, 1024 for each of the other two | claims (derived) | 16*128, 8*128; `modeling_qwen3.py` L217-L225 | verified |
| 64 | `o_proj` maps back to the hidden size | [derived] | L226-L228: `nn.Linear(num_attention_heads * head_dim, hidden_size)` | verified |
| 66 | rotary base 1000000 | claim | config L22; transformers reads it as `config.rope_parameters["rope_theta"]` (L113) | verified |
| 74 | a prompt of 6 tokens | [estimated] | an arbitrary choice, and the line says so | verified |
| 76 | embedding `(1, 6, 1024)`, strides `(6144, 1024, 1)` | [derived] (line 82) | torch | verified |
| 77-79 | attention, MLP and norm leave with the same shape and strides | [derived] | each module returns `(batch, tokens, hidden)`; in the random-weight run `o_proj` gave `(1, 6, 64)` strides `(384, 64, 1)`, contiguous | verified |
| 80 | head `(1, 6, 151936)`, strides `(911616, 151936, 1)` | [derived] | 6 * 151936 = 911616; torch | verified |
| 90 | start `(1, 6, 2048)`, `(12288, 2048, 1)`, 0 | [synthetic] | demos (`queryRun`); torch | verified |
| 91 | `view([1, 6, 16, 128])`: `(12288, 2048, 128, 1)`, 0 | [synthetic] | demos; torch | verified |
| 92 | `transpose(1, 2)`: `(1, 16, 6, 128)`, `(12288, 128, 2048, 1)`, 0 | [synthetic] | demos; torch | verified |
| 94 | strides 128 and 2048; a `view` back to `(1, 6, 2048)` is refused | [synthetic] | torch refuses the `view` of that tensor | verified; the sentence after it is W1 |
| 94 | "That is why the layer makes a copy at the end of the attention" | untagged | see W1 | wrong, see W1 |
| 86 | the query's path is view, then transpose | untagged | see N1 (`q_norm` sits between them) | verified, see N1 |

### Lesson 4, `content/modules/tr0/lessons/l4-reading-triton.md`

| Line | Number | Tag | Checked | Status |
|---|---|---|---|---|
| 25 | p1: the reference leaves 80 lanes masked | untagged answer | demos (`gridTask([12, 20], 6).least` = 80). Enumerated by hand: no power-of-two BLOCK with at most six programs masks fewer (`(16, 4)` gives 80; `(8, 8)`, `(4, 16)`, `(16, 8)`, `(2, 32)` and `(4, 32)` give 144) | verified |
| 43-47 | the reference: BLOCK `(16, 4)`, grid `(1, 5)`, 5 programs, 320 lanes, 80 masked | [synthetic] | demos (`gridLaunches`); 5*64 = 320, 320-240 = 80 | verified |
| 43-47 | one program: `(16, 32)`, `(1, 1)`, 1, 512, 272 | [synthetic] | demos; 512-240 = 272 | verified |
| 43-47 | square tiles: `(8, 8)`, `(2, 3)`, 6, 384, 144 | [synthetic] | demos; 384-240 = 144 | verified |
| 49 | 20 divides by 4; 3 * 5 = 15 programs; 16 of 64 lanes masked per program | [synthetic] | 4 masked rows * 4 = 16 | verified |
| 68 | with BLOCK 4, program 2 owns 8, 9, 10, 11 | untagged | the interpreter run printed `[ 8  9 10 11]` | verified |
| 81 | p2: BLOCK 128 over 1000 leaves 24 masked | untagged answer | demos; `triton.cdiv(1000, 128)` = 8 in Triton 3.8.0; 1024-1000 = 24 | verified |
| 109 | a `(6, 5)` buffer read as `(5, 6)` through strides `(1, 5)`; grid `(3, 2)`; 18 of 48 masked | [derived] | torch `arange(1, 31).view(6, 5).t()` has strides `(1, 5)`; 3*2*8 = 48, 48-30 = 18; the run printed `masked=18` | verified |
| 111 | neighbouring lanes of a row read 5 apart | [derived] | `stride_n` = 5 | verified |
| 125-130 | the course's run: last program offsets and mask; the two summary lines | claim | run again here, the output identical (claims table row 72) | verified |
| 146 | about 20 minutes to step the kernel | [estimated] | an estimate, as the tag says | verified |
| 146 | a 3.8.0 wheel off Linux | [unverified] | the tag stands; torch requires Triton only on Linux (`requires_dist`) | verified |
| 148-167 | the snippet and its printed output | untagged | run as printed with `tl.device_print("offs", offs)` added: it printed `(0, 0, 0)  offs:  [0 1 2 3]`, `(1, 0, 0)  offs:  [4 5 6 7]`, `(2, 0, 0)  offs:  [ 8  9 10 11]`, byte for byte as the lesson shows; `y` came out `x * 2` | verified |

### Lesson 5, `content/modules/tr0/lessons/l5-engine-style-model-code.md`

| Line | Number | Tag | Checked | Status |
|---|---|---|---|---|
| 16 | `models/qwen3.py` is 83 lines | claim | the fetched file has 83 lines | verified |
| 24 | p1: one matmul | untagged answer | demos (`mergedProjection().multiplies` = 1); `LinearQKVMerged` is one `F.linear` (`linear.py` L32, L71-L88) | verified |
| 32 | 4096 rows = 2048 + 1024 + 1024 | claim, [derived] | (16 + 2*8) * 128 = 4096 | verified |
| 38 | 2048, 1024 and 1024; 4096 | [derived] | as above | verified |
| 60-64 | 417, 357, 414, 759 and 1,411 lines; `StagedWriteTensor` at line 135 | [measured] | the files fetched at `4ba787ec` have exactly those counts; line 135 holds `class StagedWriteTensor:` | verified |
| 68 | 18 kernels: 2, 1, 2, 7 and 6 | [derived] | kernels by name in each file (claims table rows 51-53, 61-62) | verified |
| 72 | 19 blocks of 8192 for a vocabulary of 151936 | [derived] | `triton.cdiv(151936, 8192)` = 19 in Triton 3.8.0; demos `temperatureLaunch` | verified |
| 72 | 155648 lanes, 3712 masked | [derived] | 19*8192 = 155648; 155648-151936 = 3712 | verified |
| 72 | 4480 of 8192 lanes of the last block hold an entry | [derived] | 151936 - 18*8192 = 4480 | verified |
| 88 | what `py.detach` does | [unverified] | the tag stands | verified |
| 90 | view or copy across the seam | [unverified] | the tag stands | verified |
| 58 | MRV2 is vLLM's default runner | untagged | see N2 | verified, see N2 |

## The module page, the card, the items, the game copy and the lab page

| File and line | What | Checked | Status |
|---|---|---|---|
| `content/modules/tr0/module.md:50` | three practice levels and two graded ones, "three new targets", fresh tensors | `packages/play/shape-shifter/entry.ts` L24-L28 and `levels.ts` (fewest draws three targets, grid three tensors) | verified |
| `content/modules/tr0/module.md:56` | the bar, 0.001 [estimated] | `LOGIT_BOUND = 1e-3` and `CACHE_BOUND = 1e-3` in `labs/grader/src/enginespace_grader/labs/tr0_forward.py`, commented as [estimated] | verified |
| `content/modules/tr0/module.md:60-62` | the stages and their checks | `labs/gpu/tr0-forward/lab.toml`: s1 optional with `layer0-hidden`; s2 `logits-fp32`, `import-guard`, `argmax-bank`; s3 `cache-logits`, `cache-lengths` | verified |
| `content/modules/tr0/module.md:64` | the revision, licence, stored dtype, size and hash | claims verified (claims table rows 110, 115-117) | verified |
| `content/cards/tensor.md:13-22` | the cited claims | claims table | verified |
| `content/cards/tensor.md:30` | "PyTorch has no negative strides either" | untagged. Torch's `as_strided` refuses a negative stride; this is general knowledge, read in no pinned page | verified |
| `content/cards/tensor.md:40` | "No Triton run ... has been compared with them" | see W3 | wrong, see W3 |
| `packages/play/items/families/tr0/sync-rules.ts:25-102` | eleven rows, five that wait and six that queue | each row's claims verified. The `why` of each row says what its claims say: `to-cpu` from `torch.to.copies` and `torch.cuda.non-blocking`, `tolist` from `torch.tolist.moves-to-cpu` and `torch.cpu.copies` | verified |
| `packages/play/items/families/tr0/view-or-copy.ts:7-10, 201-275` | the view, copy and error rules and their explanations | claims `torch.view.needs-compatible-strides`, `torch.view.otherwise-copy`, `torch.reshape.view-if-compatible` and `torch.views.contiguous-copies` verified. `contiguous` is asked only of a tensor that needs it (L115-L116), so the "is not contiguous" sentence holds. 96 item tests pass | verified |
| `packages/play/items/families/tr0/strides-of.ts:8` | expand gives stride 0 | claim `torch.expand.stride-zero` verified | verified |
| `packages/play/items/families/tr0/grid-cover.ts:7-8, 161-167` | program = place / BLOCK, lane = place mod BLOCK, the mask rule, BLOCK a power of two | claims `triton.program-id`, `triton.cdiv-device`, `triton.load-mask`, `triton.store-mask` and `triton.arange-range-check` verified | verified |
| `packages/play/shape-shifter/copy.ts:171` | strides count elements, not bytes | torch strides are in elements (lesson 1's run) | verified |
| `packages/play/shape-shifter/copy.ts:74, 194, 254` | stride 0 repeats a row, and writing one row changes them all | claims `torch.expand.stride-zero` and `torch.expand.one-address` | verified |
| `packages/play/shape-shifter/copy.ts:204, 220, 261, 265` | program id, `cdiv(n, BLOCK)` programs, masked lanes, BLOCK a power of two because of `tl.arange` | Triton claims as above | verified |
| `labs/gpu/tr0-forward/LAB.md:9, 16-17` | the kit folder `enginespace-gpu-kit/` and `envs/cpu` | the kit zip holds `enginespace-gpu-kit/envs/cpu/{pyproject.toml,uv.lock,requirements.txt,Dockerfile}`. `enginespace fetch <lab>` exists | verified |
| `labs/gpu/tr0-forward/LAB.md:20` | fetch keeps a file only on its SHA-256, prints the cache folder, resumes | `enginespace fetch --help`; `fetch.py` L660 prints "`<lab>`: N files, into `<cache>`" | verified |
| `labs/gpu/tr0-forward/LAB.md:24, 26` | the starter path, the contract, the five module names | the kit holds `gpu/tr0-forward/starter/forward.py`, whose docstring has `build`, `model(ids)`, `layer`, `new_cache` and `step`. The worker hooks `embed_tokens`, `layers.0.self_attn`, `layers.0.mlp`, `norm` and `lm_head` | verified |
| `labs/gpu/tr0-forward/LAB.md:33, 36` | where to read the reference, and the classes named | the module exists in the environment, and every named class or function is in `modeling_qwen3.py` | verified |
| `labs/gpu/tr0-forward/LAB.md:38` | the rotary base's key depends on the version | 5.19.0 reads `config.rope_parameters["rope_theta"]` (L113). A config saved with `rope_theta` loads into `rope_parameters` | verified |
| `labs/gpu/tr0-forward/LAB.md:42` | stage 1 feeds layer 0 the embeddings of two prompts | `LAYER_PROMPTS = 2` (`tr0_forward.py` L88) | verified |
| `labs/gpu/tr0-forward/LAB.md:54, 68, 98` | `enginespace grade tr0.forward.sN --challenge <token>` | `enginespace grade --help`: `<lab>.<stage>`, `--challenge TOKEN` | verified |
| `labs/gpu/tr0-forward/LAB.md:57` | `--assisted none|explain|code`, `--agent yes|no`, undeclared records the most help | `grade --help`: "undeclared records the most", "undeclared records yes" | verified |
| `labs/gpu/tr0-forward/LAB.md:63` | a tied head puts `lm_head.weight` in `weights` | `tr0_forward_worker.py` `load_weights` L179-L180 | verified |
| `labs/gpu/tr0-forward/LAB.md:76-80` | `AutoModelForCausalLM.from_pretrained(folder, dtype=torch.float32)` on `<cache>/tr0/qwen3-0.6b` | the manifest paths are `tr0/qwen3-0.6b/...`. A random-weight Qwen3 saved to a folder loaded with that call as float32 under transformers 5.19.0 | verified |
| `labs/gpu/tr0-forward/LAB.md:95` | stage 3 compares against a recompute by the reference and by the learner's uncached pass | `tr0_forward.py` L12-L13 | verified |
| `labs/gpu/tr0-forward/LAB.md:105` | each grade writes under `receipts/` | `grade --help`: `--out DIR` (default: receipts) | verified |

## Follow-ups

- F1. **`scripts/claims/requote.ts` puts a quote on the wrong lines in a file with characters outside the Basic Multilingual Plane.** `locate()` walks the text by code point (`for (const ch of text)`) and appends each character to `squashed` with one entry in `lineOf`. But `squashed.indexOf` counts UTF-16 units, and a character outside the BMP is two of them, so every such character before a match moves the match's line one character later. `src/transformers/models/qwen3/modeling_qwen3.py` at v5.19.0 has 96 such characters in its banner, and the script reports 5 verified quotes as "moved" (exit 1). One fix: push the line twice for a surrogate pair, or iterate by UTF-16 index. Add a test with an emoji line above the quote. The script is outside this task's files, so it was not changed.
- F2. The wrong rows W1 to W3, and notes N1 and N2, go to the fix task (W2b-T36).
- F3. The eight interpreter-run claims rest on the cpu job of `labs.yml` (its log of 2026-11-21 at `ee64e9ec`). This check could not repeat that run: the script runs code it extracts from fetched vLLM files. A reviewer with the CI log can turn those eight rows to verified.

## What was looked at

- Every source URL of `content/claims/tr0.yaml` (37 files and pages), fetched once with a generic User-Agent, no token and no cookie. Also, at their pins: `python/minisgl/layers/norm.py` (Mini-SGLang `9a91cfaf`), `vllm/envs.py` (vLLM `4ba787ec`) and `vllm/config/vllm.py` (vLLM v0.33.0). No request carried a name, an email or a token. Nothing fetched was run or committed.
- The locked CPU environment of `labs/envs/cpu` (torch 2.14.0+cpu, transformers 5.19.0, Triton 3.8.0), built outside the repository from uv's cache, offline, and removed after. It ran only the course's own scripts (`scripts/triton-interp/course_kernel.py`), lesson 4's snippet, and three small scripts of this check that build random-weight models. No weights were downloaded.
- Owner questions: none of this task's choices rests on an unanswered one. The CPU environment is the one the owner's answer to N4 (option B) allows.
