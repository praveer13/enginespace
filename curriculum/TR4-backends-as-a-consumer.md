# TR4 · Attention backends as a consumer: FlashAttention 2, 3 and 4, FlashInfer and FlashMLA

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr4`. **Hours:** about 7 [estimated]: 2.5 in the browser (B) and 4.5 on GPUs (F), of which about 2 are on an H100. **Ships in:** W2 (D-002). **Owns:** nothing shared. Kernels owns Triton's program model and the attention kernels themselves (KN4-KN9, catalog §4); TR4 reads them as the engine does, from the calling side.

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm E2) and (sglang A3). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Predict which attention backend an engine will pick on a given GPU and model, what CUDA-graph mode it will then actually run, and how each backend compares on your GPU, measured honestly. |
| **Artifacts** | Predict-then-reveal reads of backend selection, graded on fresh feature cards (B); backend sweeps on your GPU, correctness against an fp32 reference plus timings with intervals and floors (F). |
| **Game slot** | The backend-selection game: working name **Dispatch**, `dispatch`, 2D and small (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard); T4.L6 and T5.L5 most directly; TR0's Triton reading and TR2's graph modes help. |
| **GPU** | About 2.5 h on a 4090-class GPU and about 2 h on an H100 [estimated]. A 4090 (SM89) exercises FlashAttention 2, FlashInfer and Triton paths; FlashAttention 3 needs Hopper (vllm TR4 notes; sglang A3). |

## 1. What it teaches

1. **The backend contract.** An attention backend receives more than Q, K and V: per-step metadata, block tables over a paged KV cache, a page size, the prefill and decode split, and its own statement of which CUDA-graph shapes it supports. The engine builds that metadata; the kernel consumes it. TR4 reads both sides at the pin.
2. **Who gets picked.** vLLM's backend tables are generated from a registry, and automatic selection takes the first compatible backend in priority order. The FlashAttention version defaults to FA4 on SM100 and newer, FA3 on SM90 and FA2 otherwise. `--attention-backend` and `--attention-config.backend` are mutually exclusive (vllm E2). SGLang's MHA default is `fa3` on Hopper, `trtllm_mha` on Blackwell unless speculation runs with top-k above 1, and `flashinfer` or else `triton` elsewhere; its `--attention-backend` accepts 25 names [measured], deprecated aliases among them (sglang A4).
3. **The mode you ask for is not always the mode you get.** Each backend declares its CUDA-graph support: FlashAttention 2 `UNIFORM_BATCH` (through a documented workaround), FA3 and Triton `ALWAYS`, FlashInfer `UNIFORM_SINGLE_TOKEN_DECODE` (`UNIFORM_BATCH` with TRT-LLM kernels on Blackwell), FlashMLA `UNIFORM_BATCH`, CUTLASS MLA, AITER MLA and Mamba `UNIFORM_SINGLE_TOKEN_DECODE`, and anything unlisted `NEVER`. A requested mode is downgraded to the closest supported one, so the learner checks the log (vllm G7, linking TR2).
4. **Three FlashAttentions.** FA2 runs on Ampere, Ada and Hopper (v2.8.3.post2, 2026-10-14). FA3 is Hopper-only and still beta. FA4, written in CuTe DSL, is a weekly beta (4.0.0b37 on 2026-10-28); its README says Hopper and Blackwell, while its interface accepts compute capability 8.x-12.x, so a 4090 run is [unverified] (sglang A3).
5. **FlashInfer is a library of serving kernels,** not only attention: paged and ragged KV attention, MLA, cascade and POD attention, FP8, FP4 and BF16 GEMMs, fused MoE, sorting-free top-k and top-p sampling, and all-reduce, for SM 7.5-12.1 [measured from its README]. vLLM uses it for its FLASHINFER backend, its sampler (`VLLM_USE_FLASHINFER_SAMPLER`, default True), FP8 block-scale GEMM and all-reduce; SGLang for attention and sampling backends, MoE runners and FP8 and FP4 GEMM runners (sglang A2).
6. **Hardware lists move.** FlashMLA's 2026.09.30 release removed Hopper and the older DeepSeek models upstream; NVIDIA support now needs SM100 or SM103 and CUDA 13.1 or newer [measured from its README, 2026-11-03]. Both engines kept Hopper in forks: SGLang's `sgl-flash-mla` 1.0.0 with a frozen `csrc_legacy/`, and vLLM's `vllm-project/FlashMLA` with legacy SM90 sources. An H100 learner reads the forks, not upstream's `main` (sglang A5, A6). The catalog gives FlashMLA's hardware list a 60-day TTL [estimated], and this is why.
7. **A sweep is an experiment.** Correctness first, against an fp32 reference on the same GPU; then timings over repeats after warm-up, with intervals; then floors, because no attention call can beat the bytes it must read. A ranking holds only where the intervals separate.

**Knowledge components** (proposed; W2-T27 writes them):

| KC | Requires |
|---|---|
| `tr4.backend-contract` | `ks:t5.block-tables`, `ks:t4.flashattention-blocking` |
| `tr4.selection-order` | `tr4.backend-contract` |
| `tr4.graph-support-level` | `tr2.graph-modes`, `tr4.selection-order` |
| `tr4.fa-generations` | `ks:t4.flashattention-blocking` |
| `tr4.flashinfer-roles` | `tr4.backend-contract` |
| `tr4.hardware-lists-move` | `tr4.fa-generations` |
| `tr4.sweep-method` | `tr3.step-floor` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR4 takes from it |
|---|---|---|
| Lesson, play | T4.L6 "Matmul, Tiling & FlashAttention as Cache Blocking" (`t4.l6`); the Tiling Cube play (`tiling-cube`) | FlashAttention as cache blocking (`t4.flashattention-blocking`), so TR4 can treat a backend as a known algorithm with a hardware-specific implementation. |
| Lesson | T4.L3 "The Roofline Model" (`t4.l3`) | Floors and the ridge point, for the sweep's physics check. |
| Lesson | T5.L4 "KV Cache Math" (`t5.l4`), with the Attention Zoo in `sim-kv` | GQA, MLA, sliding windows and the other variants (`t5.attention-variants`), which decide what a backend must support. |
| Lesson, lab | T5.L5 "PagedAttention Deep Dive" (`t5.l5`); lab 02 `kv-block-manager` | The paged KV layout and block tables a backend reads. |
| Lesson | T6.L5 "FP4 and Blackwell: The New Rooflines" (`t6.l5`) | Why the Blackwell rows of the backend tables differ. |
| Lesson | T5.L10 "The Production Stack" (`t5.l10`) | The engines as consumers of the same kernel libraries; TRT-LLM is now a fourth consumer and a PyTorch engine (sglang A7). |

**Within enginespace.** TR0 (reading Triton), TR2 (graph modes and support levels), TR3 (floors and honest timing).

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Lane |
|---|---|---|---|
| `tr4.l1` | The backend contract: what the engine hands a kernel | 35 | B |
| `tr4.l2` | Who gets picked: vLLM's priority order and SGLang's defaults, GPU by GPU | 30 | B |
| `tr4.l3` | FlashAttention 2, 3 and 4: one algorithm across three generations | 25 | B |
| `tr4.l4` | FlashInfer as a library of serving kernels | 20 | B |
| `tr4.l5` | FlashMLA, and the forks that keep Hopper | 15 | B |
| — | Dispatch: practice, then graded | 25 | B |
| — | Lab `tr4.sweep`, stages s1-s3 on a 4090-class GPU | 150 | F |
| — | Lab `tr4.sweep`, stage s4 on an H100 | 120 | F |

**The table `tr4.l2` builds** (each engine's default on three GPU classes, [measured] by the research from the pinned docs on 2026-11-03; sglang A4, vllm E2):

| GPU | Compute capability | vLLM v0.33.0 default | SGLang v0.5.23 default |
|---|---|---|---|
| RTX 4090 | SM89 | FlashAttention 2 | `flashinfer` |
| H100 | SM90 | FlashAttention 3 | `fa3` |
| B200 | SM100 | FlashAttention 4 | `trtllm_mha` |

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | Before every Dispatch card and before the lab: "Which backend does the engine pick here, what is its fallback, and what graph mode will run?" The lab's predictions are committed in the browser when its challenge is issued. | `predict` |
| **Play** | Dispatch: read a seeded feature card (GPU, model attention type, head size, KV dtype, speculation, sliding window) and the pinned rule table, and pick (§6). | `play` |
| **Build** | Sweep the backends your GPU supports at the pin: inventory, correctness, timings; then FA3 on an H100 (§5). | `receipt` |
| **Prove** | With the agent closed: Dispatch on fresh cards; and "defend your sweep": seeded questions only your receipt's raw timings answer, such as "drop your three slowest repeats of shape 4: does your ranking change?" (ASSESSMENT §7). | `play` and `prove`, `proved` |
| **Keep** | Today draws `tr4.which-backend`, `tr4.graph-downgrade`, `tr4.attn-floor` and `tr4.fork-or-upstream`. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `play:dispatch/pick` (the catalog's "predict-then-reveal reads"; levels `one-feature`, `two-features` and `fallback` are practice) | B | The pick and its fallback for a fresh feature card | `packages/sim/backends`: the pinned version's selection as an ordered rule table from claims (A§5.8) | Pick and fallback right on 3 of 3 fresh cards |
| Item families (§4, Keep) | B | Answers on fresh seeds | Keys from `backends` and the atlas | Exit ticket |
| `receipt:tr4.sweep.s1` (inventory, first win) | F | Starting the pinned vLLM with defaults, and with each `--attention-backend` the registry lists for your GPU | Grader: the selected backend and the effective CUDA-graph mode, parsed from the engine's log; teacher-forced agreement of each run's outputs with the owner's references | Every run starts and agrees; your committed predictions are scored for calibration only |
| `receipt:tr4.sweep.s2` (correctness) | F | The kit's harness calls each supported backend's prefill and decode attention on paged KV, with shapes drawn from the challenge (batch, context lengths, heads and GQA ratio, head size, page size) | Grader: against an fp32 SDPA reference computed on the same GPU, with per-dtype tolerances that W2-T26 sets and records [estimated] | Every backend within tolerance on every shape |
| `receipt:tr4.sweep.s3` (timings) | F | Raw per-repeat CUDA-event timings per backend and shape, at least 30 repeats after at least 5 warm-up calls [estimated] | Browser: recomputes medians and seeded bootstrap intervals from the raw repeats; floors (no call faster than the K and V bytes it reads plus Q and O, over the fingerprinted GPU's datasheet bandwidth); your ranking stands only where intervals separate, and otherwise must be stated as a tie | Every check passes |
| `receipt:tr4.sweep.s4` (Hopper) | F | s2 and s3 on an H100, adding FlashAttention 3, and FlashMLA through an engine fork for an MLA shape | As s2 and s3 | As s2 and s3. Optional for module completion (Q-1 in [PLAN.md](../docs/PLAN.md)); it earns its own KC, `tr4.fa-generations`, at full weight. |

**Why a harness and not the whole engine for s2 and s3.** An engine-level timing mixes the backend with the scheduler, graphs and host work, which TR3 measures. A backend sweep isolates the call the engine makes, and the s1 inventory ties it back to the engine.

## 6. Game slot

**The backend-selection game.** Working name **Dispatch**, id `dispatch`, 2D and small (GAMES.md §7; GAMES.md open question 7 asks whether it stays a game or becomes plain items).

- **The rule is the concept.** The engine takes the first backend in its order whose support covers the model and the GPU; then the graph mode is downgraded to what that backend supports.
- **Graded.** The `pick` level (GAMES.md's working id): a fresh feature card per round; pass on 3 of 3.
- **2D only.** The rule is a table walk, so a third axis would add nothing.

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM | v0.33.0; `docs/design/attention_backends.md` and `docs/design/cuda_graphs.md` at the tag; docs under `docs.vllm.ai/en/v0.33.0/` | vllm E2, G7 |
| SGLang | v0.5.23; `docs/docs/advanced_features/attention_backend.mdx` at the tag | sglang A4 |
| FlashInfer | 0.7.2.post1 in env `vllm`; 0.7.2 in env `sglang` | what the engines ship; a v0.7.3 tag appeared on 2026-11-04 UTC and is not on PyPI yet (sglang A1) |
| FlashAttention 2 | v2.8.3.post2 | sglang A3 |
| FlashAttention 3 and 4 | the builds the pinned engines install; FA4 at one exact beta if used | weekly FA4 betas make "latest" meaningless (sglang A3); W2-T26 records the installed builds [unverified until then] |
| FlashMLA | vLLM's fork `vllm-project/FlashMLA` at the commit v0.33.0's `cmake/external_projects/flashmla.cmake` names (prefix `e2afa5fd8c22`); SGLang's `sgl-flash-mla` 1.0.0; upstream's last Hopper-capable commit `ba89a3466e9470ad08ab39738d4e7bb66989e1e7` (2026-09-15) | sglang A5, A6 |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| vLLM selects the first compatible backend in registry order; FA4 on SM100+, FA3 on SM90, FA2 otherwise | [measured] | vllm E2 | 2026-11-01 | 14 days |
| Per-backend CUDA-graph support levels, and the downgrade rule | [measured] | vllm G7 | 2026-11-01 | 14 days |
| SGLang's MHA defaults by hardware, and its 25 backend names | [measured] | sglang A4 | 2026-11-02 | 14 days |
| FlashInfer's components and the engines' uses of them | [measured] | sglang A2 | 2026-11-03 | 21 days |
| FA2 on Ampere, Ada and Hopper; FA3 Hopper-only beta; FA4 a weekly beta, its 4090 support [unverified] | [measured] / [unverified] | sglang A3 | 2026-10-28 | 7 days for FA4 |
| FlashMLA dropped Hopper upstream on 2026-09-30; the engines keep it in forks | [measured] | sglang A5, A6 | 2026-09-30; 2026-10-22 | 60 days |
| TRT-LLM is a PyTorch engine and vendors a FlashInfer CuTe DSL kernel | [measured] | sglang A7, TR4 notes | 2026-03-12 | 90 days |

## 9. Hours

| Activity | B | F (4090) | F (H100) |
|---|---|---|---|
| Lessons `tr4.l1`-`tr4.l5` | 2.1 | — | — |
| Dispatch | 0.4 | — | — |
| `tr4.sweep` s1-s3 | — | 2.5 | — |
| `tr4.sweep` s4 | — | — | 2.0 |
| **Total** | **about 2.5** | **about 2.5** | **about 2** |

All [estimated]. The catalog's figure is 7 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| FlashMLA's hardware list | 60 days (catalog) | its README and release notes |
| FA4's beta | 7 days | PyPI `flash-attn-4` |
| FlashInfer's version | 21 days | PyPI and the engines' requirement files |
| vLLM's backend order and graph support levels | 14 days | the generated tables in `attention_backends.md` and `cuda_graphs.md` at the new tag |
| SGLang's defaults and names | 14 days | `attention_backend.mdx` and `arg_groups/choices.py` |
| The `backends` rule table | pin | it is data from claims, so a re-pin edits data, not code (A§5.8) |

## 11. Open items

1. **FA4 on a 4090** is [unverified] (sglang A3). If it runs, s2 and s3 add it on the 4090; if not, the lesson says why the interface accepts SM89 while the README does not list it.
2. **Which FlashAttention builds vLLM's wheel bundles** is [unverified]; W2-T26 reads them from the installed environment and records them as claims.
3. **Whether s4 is required.** Making an H100 stage required ties module completion to renting one. PLAN.md's Q-1 proposes it stays optional for completion and earns its own KC.
4. **Tolerances.** W2-T26 measures the honest backends' worst errors against fp32 on the reference GPUs before the bars ship.
