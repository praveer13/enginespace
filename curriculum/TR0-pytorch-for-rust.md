# TR0 · PyTorch for the Rust-first, and reading Triton

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr0`. **Hours:** about 7 [estimated]: 4 in the browser (B) and 3 on the laptop's CPU (L). **Ships in:** W2 (D-002). **Owns:** nothing shared. Triton's program model belongs to Kernels' KN4, and TR0 recaps it in under an hour (catalog §4). The PyO3 seam belongs to the Data Plane's DP8, and TR0 only reads one example of it.

**Sources.** `PRODUCT.md` (owner-confirmed 2026-11-03); kernelspace `SPECIALIZATIONS.md` §3.5 and §4 (untracked, dated 2026-10-24), cited as "the catalog"; kernelspace at `origin/master` d478f91 (2026-10-30), read with `git show`; [ARCHITECTURE.md](../docs/ARCHITECTURE.md) (A§n), [DECISIONS.md](../docs/DECISIONS.md) (D-nnn, O-n), [GAMES.md](../docs/GAMES.md), [ASSESSMENT.md](../docs/ASSESSMENT.md), [WORLD.md](../docs/WORLD.md); this workflow's research, [upstream-vllm.md](../research/upstream-vllm.md) and [upstream-sglang.md](../research/upstream-sglang.md), cited by row as (vllm E1) or (sglang N6).

**Tags.** [measured] was read from the named source, on 2026-11-03 unless dated. [derived] is arithmetic on tagged inputs. [estimated] is a judgment or a design target; every hour, minute, threshold and tolerance here is one. [unverified] is not checked against a primary source and is never load-bearing. Identifiers, version strings inside a pin, counts of named things and list numbers carry no tag. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Read the PyTorch and Triton that vLLM and SGLang are written in, well enough to follow a forward pass and a kernel launch, and prove it by writing a Qwen3-0.6B forward that matches Hugging Face to 1e-3. |
| **Why it exists** | The learner is Rust-first (D-008). Every later module reads Python engine code, and the catalog calls TR0 "the gap-filler". It teaches what reading the engines needs and nothing more. |
| **Artifacts** | `shape-shifter` graded levels and four item families (B); the `tr0.forward` lab, graded by the local grader on CPU (L). |
| **Game slot** | The tensor-layout game: working name **Shape Shifter**, `shape-shifter`, 3D (§6). |
| **Prerequisites** | T5.L1 (hard, through the T5 prerequisite); T0.L3 and T0.L4 recommended; Capstone Zero recommended. |
| **Lane cost** | $0. The lab runs on the laptop's CPU. |

## 1. What it teaches

By the end of TR0 the learner can:

1. **Read a tensor as metadata over a buffer.** A tensor is storage plus shape, strides, an offset, a dtype and a device. The learner predicts the strides of a slice, a transpose, a `permute` and an `expand`, and says which operations are views and which copy.
2. **Find the hidden syncs.** `.item()`, `.tolist()`, `.cpu()` and printing a CUDA tensor all wait for the GPU. TR1 and TR3 depend on spotting these in engine code, because each one is a sync on the critical path.
3. **Read an `nn.Module` as a struct.** Parameters are fields, `forward` is a method, and `state_dict` keys are field paths. The learner maps a checkpoint's tensor names onto the code that consumes them.
4. **Read the Qwen3 decoder line by line.** Embedding, RMSNorm, grouped-query attention with rotary embeddings, the gated MLP, the residual stream and the final norm and projection. Every value comes from the pinned revision's `config.json`, never from memory (W2-T16 pins it).
5. **Write a forward pass that matches the reference,** first without a cache and then with one. The cached path's next-token logits equal a full recompute, which is the KV cache's contract from T5.L4 and Capstone Zero, now in PyTorch.
6. **Read a Triton kernel.** A grid of programs, `tl.program_id`, a `BLOCK` that is a compile-time constant, `tl.arange`, pointer arithmetic from strides, and masked `tl.load` and `tl.store` at the edges. The learner can say which elements each program touches.
7. **Step through a kernel on CPU** with `TRITON_INTERPRET=1`, where that works at the pin (§11).

**Knowledge components** (proposed ids; W2-T18 writes them into `content/kc/graph.yaml`):

| KC | Requires |
|---|---|
| `tr0.tensor-metadata` | `ks:t0.stride-traversal`, `ks:t0.data-layout` |
| `tr0.view-vs-copy` | `tr0.tensor-metadata` |
| `tr0.broadcast-stride-zero` | `tr0.view-vs-copy` |
| `tr0.hidden-syncs` | `tr0.tensor-metadata` |
| `tr0.module-as-struct` | — |
| `tr0.decoder-forward` | `ks:t5.forward-pass-costs`, `ks:t5.gqa-kv-heads`, `tr0.module-as-struct` |
| `tr0.kv-cache-contract` | `ks:t5.why-kv-cache`, `tr0.decoder-forward` |
| `tr0.triton-program-model` | `ks:t4.compute-grid`, `tr0.tensor-metadata` |
| `tr0.triton-masks` | `tr0.triton-program-model` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id or route | What TR0 takes from it |
|---|---|---|
| Lesson | T0.L3 "Benchmark: Row- vs Column-Major Traversal" (`t0.l3`) | Stride traversal (KC `t0.stride-traversal`). A stride is the step in memory per index step, which TR0 generalises to N dimensions. |
| Lesson | T0.L4 "AoS vs SoA, False Sharing & Cache Lines" (`t0.l4`) | Data layout (`t0.data-layout`). `[tokens, heads, head_dim]` against `[heads, tokens, head_dim]` is the same choice. |
| Lesson | T4.L4 "Occupancy & Coalesced Memory Access" (`t4.l4`) | Why a kernel wants contiguous inner dimensions (`t4.coalescing`), which is why engines call `contiguous()` where they do. |
| Lesson | T4.L6 "Matmul, Tiling & FlashAttention as Cache Blocking" (`t4.l6`), with the Tiling Cube play (`tiling-cube`) | The grid of programs and the tile, before Triton's spelling of them (`t4.compute-grid`, `t4.tiling-intensity`). |
| Lesson | T5.L1 "Transformer Internals for Systems Engineers" (`t5.l1`), with its `sim-engine` "Forward pass under the microscope" | The forward pass as data movement (`t5.forward-pass-costs`). TR0 reads the same pass in code. |
| Lesson | T5.L2 "Tokenization & BPE" (`t5.l2`), lab 03 `bpe-tokenizer` ("The Front Door") | The token ids the forward consumes. |
| Lesson | T5.L4 "KV Cache Math" (`t5.l4`), with the Attention Zoo in its `sim-kv` | GQA's KV heads (`t5.gqa-kv-heads`) and why a cache exists (`t5.why-kv-cache`). |
| Page | Boot (`/boot`) | Decode is bandwidth-bound arithmetic. TR0's forward is the code behind Boot's step. |
| Page | Capstone Zero (`/capstone`): tokenize, embed, forward, decode, KV cache, continuous batching, measure | The same steps in TypeScript on a toy model. TR0 repeats the forward and cache steps in PyTorch on a real model. |
| Page | The real-engine panel on `/fleet` (Qwen3-0.6B at q4 in ONNX, in the tab) | The same model family the learner has already run in the browser. |

**Within enginespace.** TR0 feeds TR1 (reading the engines), TR3 (spotting syncs in traces), TR4 (Triton and backends) and TR6 (the MRV2 rejection sampler's Triton utilities). Nothing locks: TR1 can come first, and the map says TR0 helps (A§1, I9).

## 3. Lessons

Minutes are [estimated]; the content compiler re-measures reading time (A§4.2).

| Id | Title | Minutes | Lane | Blocks |
|---|---|---|---|---|
| `tr0.l1` | PyTorch in Rust terms: storage, shape, strides, dtype, device | 45 | B | 2 predictions, `shape-shifter` levels `views` and `stride-zero`, exit items |
| `tr0.l2` | Views, copies, and the syncs you cannot see | 35 | B | prediction, `three-d` level, a "find the sync" item set |
| `tr0.l3` | `nn.Module` as a struct: Qwen3's forward in the pinned transformers | 45 | B | a code-to-shape item set; the lab's Build card |
| `tr0.l4` | Reading Triton: grids, programs, `BLOCK` and masks (the KN4 recap) | 50 | B, plus about 20 min of L for the interpreter | `grid` level; an optional interpreter walk-through |
| `tr0.l5` | Engine-style model code: Mini-SGLang's 83-line Qwen3, and vLLM's MRV2 Triton files | 30 | B | a reading card; exit items |
| — | Shape Shifter: graded levels | 40 | B | `fewest`, `grid` on fresh seeds |
| — | Lab `tr0.forward`, stages s1-s3 | 175 | L | receipts |

**tr0.l5's reading set** (line counts [measured by the research at v0.33.0 and 9a91cfa, 2026-11-03]):
- Mini-SGLang `python/minisgl/models/qwen3.py`, 83 lines, with `models/utils.py` and `layers/`. Its layers carry `@nvtx_annotate`, which TR3 uses as a first NVTX example (sglang TR0 notes, M2).
- vLLM's Model Runner V2 Triton files, the default runner's own kernels and each a lesson-sized read (vllm TR0 notes): `sample/gumbel.py` (417 lines), `buffer_utils.py` (357; `StagedWriteTensor` at L135), `block_table.py` (414), `input_batch.py` (759) and `spec_decode/rejection_sampler_utils.py` (1,411). The research gives these paths relative to the MRV2 package; rows S2 and G4 place that package at `vllm/v1/worker/gpu/`. W2-T18 confirms each path at the pin before a lesson links it.
- One PyO3 example, for the Rust-first reader: SGLang's `rust/sglang-radix-tree/src/python_bindings.rs` at v0.5.23 (sglang TR0 notes). DP8 owns the seam; TR0 shows that a Rust crate sits on SGLang's default hot path (sglang X1, X2).

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | Before each `shape-shifter` level: "How many elements will this `contiguous()` move?" Before the lab: "Which layer's output will differ most from the reference if your RMSNorm epsilon is wrong?" | `predict` events, graded at reveal |
| **Play** | Shape Shifter: reach a target layout with the fewest copies, then tile it with a grid that covers every element once (§6). | `play` events on practice seeds |
| **Build** | The `tr0.forward` lab: Qwen3-0.6B's forward in plain PyTorch on CPU, without and then with a KV cache, graded by the local grader against Hugging Face transformers in fp32 on the same CPU. | `receipt` events (§5) |
| **Prove** | With the agent closed: `shape-shifter`'s `fewest` level in Prove mode on fresh seeds, and "defend your forward": predict the shapes and strides your own forward produced at five named points, which the grader recorded in the receipt through forward hooks, before the browser shows them (ASSESSMENT §7.2). | `play` and `prove` events, provenance `proved` |
| **Keep** | Today draws `tr0.strides-of`, `tr0.view-or-copy`, `tr0.find-the-sync` and `tr0.grid-cover` on fresh seeds. | `review` events |

## 5. Artifacts and how each is graded

Pass bars are ASSESSMENT.md's (§4.3, §5.7). This table restates them for TR0.

| Artifact | Lane | What the learner submits | How it is graded | Pass |
|---|---|---|---|---|
| `play:shape-shifter/fewest` | B | A sequence of tensor operations from a seeded start to a seeded target | Replayed through the pure session at grade time against the fewest-copies ghost (A§6.3) | Copies made equal the ghost's on 3 fresh seeds |
| `play:shape-shifter/grid` | B | `BLOCK` sizes and a grid for a seeded tensor | The `tensor` model counts each element's coverage | Every element covered exactly once, with the least masked waste, on 3 fresh seeds |
| Item families `tr0.strides-of`, `tr0.view-or-copy`, `tr0.find-the-sync`, `tr0.grid-cover` | B | Answers on seeds drawn at grade time | Keys computed at grade time by `packages/sim/tensor` | Exit ticket: 3 items, at least 2 right, at least 1 of them numeric (kernelspace V5's shape) |
| `receipt:tr0.forward.s1` (one layer, first win) | L | The output of decoder layer 0 for the challenge's prompts | The grader compares it with transformers' `output_hidden_states[1]` in fp32 on the same CPU | Max absolute difference ≤ 1e-4 [estimated]; practice, not required |
| `receipt:tr0.forward.s2` (full forward) | L | Logits at every position of the challenge's prompts | The grader compares them with transformers in fp32 on the same CPU; the browser re-checks argmax ids at margin-qualified positions against the owner's pinned bank (W2-T17, A§8.5 rule 7) | Max absolute logit difference ≤ 1e-3 (the catalog's bar), and every banked argmax equal |
| `receipt:tr0.forward.s3` (with a KV cache) | L | 16 [estimated] decode steps through your cache | Each step's logits are compared with a full recompute of the same prefix by your own uncached forward and by the reference | Max absolute difference ≤ 1e-3 at every step; cache length equals the prefix length after every step |

**Rules the grader adds for this lab** (ASSESSMENT §5.7, §10):
- **No delegation.** The forward runs in a subprocess with an import guard. Importing `transformers.models` or calling the reference model from the learner's module fails the stage with the import named. This is friction, not DRM, and ASSESSMENT §10 says so.
- **Same machine.** The reference runs on the same CPU, in the same process tree, with the same torch build, so a tolerance is not spent on hardware differences.
- **Pins.** torch, transformers and the model revision must match `course.lock.json` (A§8.5 rule 6). An off-pin run is shown with its versions and earns no credit.

**Why fp32 on CPU.** The catalog's bar is 1e-3. fp32 on one CPU leaves differences from operation order alone, which the honest solution must stay under, and W2-T16 measures that margin on the reference solution before the bar ships [estimated until measured]. A wrong RMSNorm epsilon is the bestiary case that must fail (W2-T16 acceptance).

## 6. Game slot

**The tensor-layout game.** Working name **Shape Shifter**, id `shape-shifter`, 3D with a 2D path and a DOM mirror. GAMES.md §4 designs it; this file names the slot and what the module needs from it.

- **The rule is the concept.** A tensor is a buffer plus shape and strides. Views move nothing and a copy moves everything, so the fewest-copies path is reachable only by knowing which operations are views.
- **Levels the module uses** (GAMES.md's working ids): `views`, `stride-zero` and `three-d` for practice; `fewest` and `grid` graded.
- **Scene, in objects only.** The tensor is a block of cells above a strip that is its buffer. A thread runs through the cells in stride order and re-weaves on a view; cells travel down to a new strip on a copy. Program instances are tiles laid over the block, and masked lanes hang off its edge. Cameras: establish on the block and strip; focus on one program tile.
- **2D path.** A shape-and-stride table beside the buffer strip, with the same actions.

## 7. Pinned resources

Pins live in `course.lock.json` (A§4.4). Versions are [measured] from the engines' metadata on 2026-11-03.

| Resource | Pin | Why this pin | Re-check |
|---|---|---|---|
| Python | 3.12 | vLLM supports 3.11-3.14 and defaults to 3.12; SGLang needs ≥ 3.11; nano-vllm needs < 3.13 (vllm E1, T3; sglang R4) | quarterly |
| PyTorch (CPU, env `cpu`) | 2.14.0, proposed (A§14) | vLLM v0.33.0 pins 2.14.0 and SGLang v0.5.23 pins 2.14.1 (vllm E1; sglang R4). PyTorch's "stable" docs already show 2.15 (sglang N6), so lessons link the 2.14 docs, not "stable". | with the engines |
| transformers | 5.19.0 | SGLang's pin, and inside vLLM's range `>=5.16.1,<5.21.0` (sglang R4; A§4.4) | with the engines |
| Qwen3-0.6B | Hugging Face revision pinned by W2-T16 | The model of vLLM's MRV2 post and RFC #40846, so the learner's TR0-TR3 numbers sit beside upstream's (vllm TR0 notes) | pin |
| Triton | 3.8.0 | vLLM v0.33.0's stack (vllm E1) | with the engines |
| vLLM MRV2 Triton files | tag v0.33.0, commit `4ba787ec9959e566d3b587a796dff07673324da5` | the default runner since v0.29.0 (vllm M1) | at each re-pin |
| Mini-SGLang | `9a91cfafe754aa85daee49998176275667eb58f2` (2026-05-17) | no tags; quiet for 170 days on 2026-11-03 [derived] (sglang M1) | 90 days |
| SGLang PyO3 example | v0.5.23, sha `297e54fd105e974cdf401e5b4d20253a22c16f90` | the course's SGLang pin (sglang R1) | at each re-pin |

## 8. Dated claims

Each becomes a claim in `content/claims/` with a source, a quote, an accessed date and a TTL (A§4.4).

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| vLLM v0.33.0 ships PyTorch 2.14.0 and Triton 3.8.0; Python 3.11-3.14, default 3.12 | [measured] | vllm E1: release notes and `docs/contributing/README.md` at v0.33.0 | 2026-11-01 | pin |
| SGLang v0.5.23 pins torch 2.14.1 and transformers 5.19.0, and needs Python ≥ 3.11 | [measured] | sglang R4: `python/pyproject.toml` at v0.5.23 | 2026-11-02 | pin |
| PyTorch's "stable" docs redirect to 2.15 | [measured] | sglang N6 | 2026-11-03 | 90 days |
| `TRITON_INTERPRET` is a real Triton knob, but vLLM mentions it only in three comment lines of `awq_triton.py`; no vLLM kernel was run under it | [unverified] for vLLM kernels | vllm E3 | 2026-11-03 | until W2-T18 tests each kernel |
| Mini-SGLang's `models/qwen3.py` is 83 lines; the package is 8,090 physical Python lines, not the README's "about 5,000" | [measured] | sglang M2 | 2026-05-17 (commit) | 90 days |
| MRV2's Triton files and their line counts (§3) | [measured] | vllm TR0 notes | 2026-11-01 | pin |
| SGLang's radix-tree core is a Rust crate behind PyO3 and is the default, with fallbacks to Python | [measured] | sglang X1, X2 | 2026-09-29 (merge) | 14 days |

## 9. Hours

| Activity | B | L |
|---|---|---|
| Lessons `tr0.l1`-`tr0.l5` | 3.4 | 0.3 (interpreter walk-through) |
| Shape Shifter, practice and graded | 0.7 | — |
| `tr0.forward` s1-s3 | — | 2.9 |
| **Total** | **about 4** | **about 3** |

All [estimated]. The catalog's figure is 7 h, kept.

## 10. What goes stale, and when

| Item | Moves when | TTL | Detector |
|---|---|---|---|
| torch and transformers versions | an engine pin moves | with the engines (quarterly) | `verify:pins`; the upstream watcher (W3-T06) |
| The model revision | never inside a pin; re-chosen at a re-pin | pin | the bank's SHA-256 in the references manifest |
| MRV2 file paths and line counts | every vLLM minor, about every 14 days (vllm R2) | 14 days, re-read at each re-pin | `ls` and `wc -l` at the new tag, as in vllm §6 |
| `TRITON_INTERPRET` behaviour on the chosen kernels | each Triton minor | re-test at each re-pin | W2-T18's interpreter test |
| PyTorch docs links | each PyTorch minor | 90 days | link-rot report (nightly) |
| Mini-SGLang | if the repo moves again | 90 days | its `commits/main.atom` |

## 11. Open items

1. **Triton on the learner's laptop.** Triton ships Linux wheels; whether a 3.8.0 wheel installs on macOS or Windows for interpreter use is [unverified]. If it does not, the interpreter walk-through runs in the course's Linux container or on the rented box, and stays optional. W2-T18 checks.
2. **Which kernels run under the interpreter.** vllm E3: nobody has run an MRV2 kernel under `TRITON_INTERPRET=1`. A kernel enters `tr0.l4` only after W2-T18 runs it on Triton 3.8.0.
3. **The tolerance margins.** W2-T16 measures the honest solution's worst logit difference and the epsilon mutant's, and ASSESSMENT's bars move if the measured margin is thin.
4. **A Hugging Face download without a token.** Qwen3-0.6B is expected to download anonymously [unverified]; the grader's `fetch` sends a generic User-Agent and no token (A§9.7).
