# TR0 · PyTorch for the Rust-first, and reading Triton

**Status:** curriculum design for the owner's review, 2026-11-03, brought into the redesign on 2026-11-20 (W2b-T26): "Before you write", after §3, is what the module's builders build from, and where it and an older line of this file differ, it wins. Nothing of the module is built yet. **Module id:** `tr0`. **Hours:** about 7 [estimated]: 4 in the browser (B) and 3 on the laptop's CPU (L). **Ships in:** W2 (D-002). **Owns:** nothing shared. Triton's program model belongs to Kernels' KN4, and TR0 recaps it in under an hour (catalog §4). The PyO3 seam belongs to the Data Plane's DP8, and TR0 only reads one example of it.

**Sources.** `PRODUCT.md` (owner-confirmed 2026-11-03); kernelspace `SPECIALIZATIONS.md` §3.5 and §4 (untracked, dated 2026-10-24), cited as "the catalog"; kernelspace at `origin/master` d478f91 (2026-10-30), read with `git show`; [ARCHITECTURE.md](../docs/ARCHITECTURE.md) (A§n), [DECISIONS.md](../docs/DECISIONS.md) (D-nnn, O-n), [GAMES.md](../docs/GAMES.md), [ASSESSMENT.md](../docs/ASSESSMENT.md), [WORLD.md](../docs/WORLD.md); this workflow's research, [upstream-vllm.md](../research/upstream-vllm.md) and [upstream-sglang.md](../research/upstream-sglang.md), cited by row as (vllm E1) or (sglang N6).

**Tags.** [measured] was read from the named source, on 2026-11-03 unless dated. [derived] is arithmetic on tagged inputs. [estimated] is a judgment or a design target; every hour, minute, threshold and tolerance here is one. [unverified] is not checked against a primary source and is never load-bearing. Identifiers, version strings inside a pin, counts of named things and list numbers carry no tag. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Read the PyTorch and Triton that vLLM and SGLang are written in, well enough to follow a forward pass and a kernel launch, and prove it by writing a Qwen3-0.6B forward that matches Hugging Face to 1e-3. |
| **Why it exists** | The learner is Rust-first (D-008). Every later module reads Python engine code, and the catalog calls TR0 "the gap-filler". It teaches what reading the engines needs and nothing more. |
| **Artifacts** | Tensor views' graded levels (`shape-shifter`) and four item families (B); the `tr0.forward` lab, graded by the local grader on CPU (L). |
| **Game slot** | **Tensor views** (`shape-shifter`), 2D: "A view relabels the buffer. A copy moves every element." Role line: "You plan the reshape." (§6; GAMES.md §4). |
| **Prerequisites** | T5.L1 (hard, through the T5 prerequisite); T0.L3 and T0.L4 recommended; Capstone Zero recommended. |
| **Place in the course** | An advised primer. The course starts at TR1 lesson 1, TR0 helps before TR1, and nothing locks (the owner's answer to N8, D-070). |
| **Lane cost** | $0. The lab runs on the laptop's CPU. |

## 1. What it teaches

By the end of TR0 the learner can:

1. **Read a tensor as metadata over a buffer.** A tensor is storage plus shape, strides, an offset, a dtype and a device. The learner predicts the strides of a slice, a transpose, a `permute` and an `expand`, and says which operations are views and which copy.
2. **Find the hidden syncs.** `.item()`, `.tolist()`, `.cpu()` and printing a CUDA tensor all wait for the GPU. TR1 and TR3 depend on spotting these in engine code, because each one is a sync on the critical path.
3. **Read an `nn.Module` as a struct.** Parameters are fields, `forward` is a method, and `state_dict` keys are field paths. The learner maps a checkpoint's tensor names onto the code that consumes them.
4. **Read the Qwen3 decoder line by line.** Embedding, RMSNorm, grouped-query attention with rotary embeddings, the gated MLP, the residual stream and the final norm and projection. Every value comes from the pinned revision's `config.json`, never from memory (W2b-T27 records the proposed revision in `course.lock.json`).
5. **Write a forward pass that matches the reference,** first without a cache and then with one. The cached path's next-token logits equal a full recompute, which is the KV cache's contract from T5.L4 and Capstone Zero, now in PyTorch.
6. **Read a Triton kernel.** A grid of programs, `tl.program_id`, a `BLOCK` that is a compile-time constant, `tl.arange`, pointer arithmetic from strides, and masked `tl.load` and `tl.store` at the edges. The learner can say which elements each program touches.
7. **Step through a kernel on CPU** with `TRITON_INTERPRET=1`, where that works at the pin (§11).

**Knowledge components** (W2b-T26 wrote them into `content/kc/graph.yaml` on 2026-11-20, each with the task that adds its first graded reference; "Before you write", item 14, says what earns each):

| KC | Requires | First graded reference (its task) | Also graded by |
|---|---|---|---|
| `tr0.tensor-metadata` | `ks:t0.stride-traversal`, `ks:t0.data-layout` | item family tr0.strides-of (W2b-T29) | Tensor views, `fewest` (W2-T14) |
| `tr0.view-vs-copy` | `tr0.tensor-metadata` | item family tr0.view-or-copy (W2b-T29) | Tensor views, `fewest` (W2-T14) |
| `tr0.broadcast-stride-zero` | `tr0.view-vs-copy` | item family tr0.strides-of, its expand variant (W2b-T29) | none |
| `tr0.hidden-syncs` | `tr0.tensor-metadata` | item family tr0.find-the-sync (W2b-T29) | none |
| `tr0.module-as-struct` | — | lab stage `tr0.forward.s2` (W2-T16) | none |
| `tr0.decoder-forward` | `ks:t5.forward-pass-costs`, `ks:t5.gqa-kv-heads`, `tr0.module-as-struct` | lab stage `tr0.forward.s2` (W2-T16) | none |
| `tr0.kv-cache-contract` | `ks:t5.why-kv-cache`, `tr0.decoder-forward` | lab stage `tr0.forward.s3` (W2-T16) | none |
| `tr0.triton-program-model` | `ks:t4.compute-grid`, `tr0.tensor-metadata` | item family tr0.grid-cover (W2b-T29) | Tensor views, `grid` (W2-T14) |
| `tr0.triton-masks` | `tr0.triton-program-model` | item family tr0.grid-cover (W2b-T29) | Tensor views, `grid` (W2-T14) |

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
| `tr0.l1` | PyTorch in Rust terms: storage, shape, strides, dtype, device | 45 | B | opener B; Tensor views `views`, then `stride-zero`; 2 guesses; Exit check of 3 questions |
| `tr0.l2` | Views, copies, and the syncs you cannot see | 35 | B | opener A; `three-d`; 2 guesses; Exit check: `fewest` graded and 3 questions |
| `tr0.l3` | `nn.Module` as a struct: Qwen3's forward in the pinned transformers | 45 | B | opener C; 1 guess; the lab's Build row; Exit check of 3 questions |
| `tr0.l4` | Reading Triton: grids, programs, `BLOCK` and masks (the KN4 recap) | 50 | B, plus about 20 min of L for the interpreter | opener B; `grid`; 2 guesses; the interpreter walk-through; Exit check: `grid` graded and 3 questions |
| `tr0.l5` | Engine-style model code: Mini-SGLang's 83-line Qwen3, and vLLM's MRV2 Triton files | 30 | B | opener C; 1 guess; Exit check of 3 questions |
| — | Tensor views: the graded levels on fresh seeds | 40 | B | `fewest` (in lesson 2's Exit check), `grid` (in lesson 4's) |
| — | Lab `tr0.forward`, stages s1-s3 | 175 | L | receipts |

**tr0.l5's reading set.** The line counts are [measured]: the research read them at v0.33.0 and `9a91cfa` on 2026-11-03.
- Mini-SGLang `python/minisgl/models/qwen3.py`, 83 lines, with `models/utils.py` and `layers/`. Its layers carry `@nvtx_annotate`, which TR3 uses as a first NVTX example (sglang TR0 notes, M2).
- vLLM's Model Runner V2 Triton files, the default runner's own kernels and each a lesson-sized read (vllm TR0 notes): `sample/gumbel.py` (417 lines), `buffer_utils.py` (357; `StagedWriteTensor` at L135), `block_table.py` (414), `input_batch.py` (759) and `spec_decode/rejection_sampler_utils.py` (1,411). The research gives these paths relative to the MRV2 package; rows S2 and G4 place that package at `vllm/v1/worker/gpu/`. W2b-T27 confirms each path at the pin before a lesson links it.
- One PyO3 example, for the Rust-first reader: SGLang's `rust/sglang-radix-tree/src/python_bindings.rs` at v0.5.23 (sglang TR0 notes). DP8 owns the seam; TR0 shows that a Rust crate sits on SGLang's default hot path (sglang X1, X2).

## Before you write (added 2026-11-20)

For the authors of the module's build: W2b-T27 (the sources), W2b-T28 (the game's session), W2-T14 (its 2D view in the frame), W2b-T29 (the item families), W2-T16 and W2b-T30 (the lab and its page), W2b-T32, W2b-T51, W2b-T52 and W2-T18 (the module page and the five lessons), and W2b-T50 ("Defend your receipt"). Each item is a decision with its reason. GAMES.md §4 holds the game's design in full, and the items below point into it rather than copy it; where an older line of this file says otherwise, these items win.

**What the owner answered, and what is still proposed.** The owner answered three questions on 2026-11-19 (docs/waves/W2m1a-report.md §11): N8, TR0 is an advised primer and the course starts at TR1 lesson 1 (D-070); N5, a lesson's Test passes when every question is right, and every Test holds three questions with at least one numeric (D-071); N4, option B, the locked CPU environment with Triton 3.8.0 may be installed on the build machine and no model weights (D-072). Two choices here are the build's and wait for the owner: the role line (N1, D-073) and the cut of the 3D scene (N3, D-074).

1. **The game's name and role line.** Title **Tensor views**, subtitle "A view relabels the buffer. A copy moves every element." (D-063). Role line **"You plan the reshape."** *Why:* REDESIGN §7 and the tracker's W2-T14 give it, and both are later than the roster's first line, "You lay out a tensor."; and the learner's act in every level is a plan, which operations in which order and where the one copy goes. The roster and GAMES.md §2.6 now carry it. (Proposed, D-073.)

2. **The 2D diagram, exactly:** GAMES.md §4.1. In short: the shape and stride table (a row per dimension, then offset and contiguous) beside the tensor's cells, with the buffer strip under the cells in rows of 16; each element carries its number, the address it had in the start's buffer; the stride order is one line through the cells in address order, straight between row-major neighbours and an arc for any other step; a view moves the numbers among the cells and leaves the strip still; a copy draws the old strip dashed and lays a new one under it with every element written. *Why:* the buffer is the one thing a view does not move, so a still strip beside a changing table is the subtitle drawn; and a contiguous tensor's line reads row by row, so "contiguous" is something the learner sees, not a flag.

3. **The levels, each with at most five parts, its goal line with its number, its named moment, its first move and its pass-rule sentence.** Full text in GAMES.md §4.3, with what each level leaves the learner able to do and how it makes the wrong idea fail where it can be seen. The numbers are the course's model's [synthetic], printed on 2026-11-20 at `066f8d4`, and each is read from its level.

   | Level | Parts | The goal's number | Named moment | First move | Pass-rule sentence |
   |---|---|---|---|---|---|
   | `views` (practice) | Shape and strides; Buffer; Stride order; Target | "The reference does it with 1 copy." | `view-free`: "The buffer did not move. `transpose` is a view: the strides went from (6, 1) to (1, 6)." | `transpose(0, 1)` | "Passes in practice when your copies equal the reference's: 1." |
   | `stride-zero` (practice) | Shape and strides; Buffer; Stride order; Stride 0; Target | "The reference does it with 1 copy." | `stride-zero`: "Stride 0: the 4 rows read the same 6 elements. Writing to one row would change them all." | `expand([4, 6])` | "Passes in practice when your copies equal the reference's: 1." |
   | `three-d` (practice) | Shape and strides; Buffer; Stride order; Target; Slices | "The reference does it with 1 copy." | `view-free` on the first move; `wrong-order` if the learner reshapes straight to the target | `reshape([4, 2, 4])` | "Passes in practice when your copies equal the reference's: 1." |
   | `fewest` (graded) | Shape and strides; Buffer; Stride order; Target; Slices | the ghost's copies on each target | the first of `view-free`, `view-refused`, `copy` | the ghost's first operation | "Passes when, on each of 3 new targets, your copies equal the reference's and no `view` was refused." |
   | `grid` (practice, then graded) | Tensor; Program; BLOCK; Grid; Mask | "The reference leaves 80 lanes masked." | `masked`: "Program (0, 0) runs 64 lanes and 16 are masked: their offsets are past the edge, so the mask is false there." | BLOCK along dimension 0 set to 16 | "Passes when every element is covered exactly once and your masked lanes equal the reference's, on each of 3 new tensors." |

   *Why these five:* they are the five of the 2026-11-03 design, kept so that no id, ref or seed moves; each now teaches one idea and makes the wrong one fail on the screen (GAMES.md §4.3). `grid` caps the programs at 6 [estimated]; the cap is arbitrary, and without one a BLOCK of 1 masks nothing.

4. **The keep-list's moment: `view-free` on `views`.** *Why:* the scripted first run meets it on its first move, which is the delight bar's "inside the first run" at its earliest, and it is the subtitle made visible: the strides swap and the strip does not move. W2-T14 adds the entry (GAMES.md §4.6 gives the steps).

5. **The Prove level is `fewest`.** *Why:* it is ASSESSMENT §7.2's choice and the module's concept on fresh targets. It offers `view`, `transpose`, `permute` and `contiguous()` and no `reshape`, `slice` or `expand`: every copy is a `contiguous()` the learner places, and a `view` the strides cannot express fails its target. Each run holds a target that needs a copy before a `view` (so "views are free, copy at the end" fails it) and one that needs no copy from a start that is not contiguous (so every "copy to be safe" habit fails it), and the band keeps each target out of the reach of those habits (GAMES.md §4.4). That rule, and not the naive path's extra copy, is what makes the level test `tr0.view-vs-copy`: with `reshape` offered, the shortest route made the ghost's copies on 78 of 80 targets of the first band, whatever the learner knew [synthetic]. No level offers `slice`, so no graded move rests on an operation the learner has not practised; a sliced start carries it. It starts in Prove mode (W2b-T42), with the readouts hidden until the result. `grid` stays graded and is not a Prove level, since Q-5's default asks for one `proved` event per module.

6. **Bands keep every tensor at 256 elements or fewer:** at most 64 on the four view levels and at most 256 on `grid` (GAMES.md §4.4). *Why:* 256 is `MAX_PLAN_NUMEL`, the largest the ghost's search takes; 64 lets the cells and the strip fit the 390 px diagram together at 20 px a cell; and `grid` draws no strip, so a 16 by 16 tensor fits.

7. **No 3D scene.** The third dimension would carry the tensor's first dimension in depth. Camera by camera (GAMES.md §4.2): the three-quarter view hides the block's inside and the stride order through it, which the 2D draws whole; one slice is one grid of the 2D; before-and-after is the 2D's dashed old strip and its target table; a lifted 2D adds a tilt and costs legibility. None shows what the 2D does not. *So:* W2-T15 is recommended cut, the roster's `has3d` is false, and no 3D switch is offered. The owner decides (N3, D-074, proposed).

8. **The lessons: opener by rule 1, guesses and their reveal kinds, Exit check.** The opener is chosen by one question: can a reader who has finished the earlier lessons finish the level from its parts, its goal line and at most 200 words?

   | Lesson | Opener, and why | Run | Guesses (reveal) | Exit check | Minutes |
   |---|---|---|---|---|---|
   | `tr0.l1` | B: the first meeting with the game; a kernelspace graduate knows strides from T0.L3, and five facts suffice: a tensor is a buffer read through a shape, strides and an offset; a stride is how far in the buffer one step along a dimension moves, counted in elements, not bytes; a contiguous tensor's elements sit in the buffer row by row; a view reads another tensor's buffer through new metadata; a copy writes a new buffer. None says which operation is which. | `views`; `stride-zero` later, in Read | 1. The `views` level's own guess, "How many elements will that copy move?" (after the run; a pair in `same.ts`). 2. In Read: "A contiguous [3, 5] tensor is sliced `x[:, ::2]`. What is the stride of dimension 1?" (at commit, worked from the question's own numbers by the demo function: 2 [derived]) | `tr0.strides-of` level 1, 2 questions (numeric); `tr0.view-or-copy` level 1, 1 question | 45 |
   | `tr0.l2` | A: the game is known, and the level adds one idea that the setup can state in 60 words: "An attention kernel reads each head's keys as one block: [heads, tokens, head size]. The projection gives [tokens, heads · head size]. Lay it out with the fewest copies." | `three-d` | 1. The `three-d` level's own guess (after the run; a pair in `same.ts`). 2. In Read: "How many of these four lines wait for the GPU: `y = x.sum()`, `n = x.sum().item()`, `ids = x.tolist()`, `print(x)`?" (at commit, from W2b-T27's claims on the calls that wait; a line whose claim could not be read leaves the question) | `fewest`, graded; `tr0.find-the-sync`, 2 questions, one numeric; `tr0.view-or-copy` level 2, 1 question | 35 |
   | `tr0.l3` | C: no level fits a reading of a model's code | none; the lab's Build row in Keep | 1. In part 1: "How many rows does layer 0's `q_proj.weight` have?" (at commit, worked from the claims on the pinned `config.json`: attention heads times head size [derived]) | `tr0.strides-of` level 2, 2 questions (numeric); `tr0.view-or-copy` level 2, 1 question | 45 |
   | `tr0.l4` | B: kernelspace's T4.L6 gave the grid and the tile; five facts suffice: a kernel runs as a grid of programs; one program covers BLOCK elements along each dimension; BLOCK is a compile-time constant and a power of two; `cdiv(n, BLOCK)` programs cover n; a lane past the edge is masked. None says which BLOCK wastes least. | `grid` | 1. The `grid` level's own guess (after the run; a pair in `same.ts`). 2. In Read: "A 1-D kernel with BLOCK 128 runs over 1,000 elements. How many lanes are masked?" (at commit, from the question's own numbers: 8 programs, 1,024 lanes, 24 masked [derived]) | `grid`, graded; `tr0.grid-cover`, 3 questions, at least one numeric | 50 |
   | `tr0.l5` | C: a reading of engine code, with no level | none | 1. In part 1: "Mini-SGLang's Qwen3 attention at its pin computes q, k and v with how many matrix multiplies?" (at commit, from W2b-T27's claims on that file and on transformers' Qwen3 layer, which the reveal sets side by side; the claims decide the answer) | `tr0.find-the-sync`, 2 questions, one numeric; `tr0.grid-cover`, 1 question | 30 |

   That is 1 A, 2 B and 2 C; 3 guesses revealed after the run and 5 at commit; 6 game blocks; 205 minutes [estimated], the catalog's figure. *Why at commit for the Read guesses:* each is answered by the question's own numbers or by a claim, so no run is needed (D-067); each level's own guess is answered by the run the learner has just made. At most two prompts come before a run's first move, and none of these lessons has more than one.

   **Each lesson's parts.** Each Read opens on what the reader just ran or, in a lesson with no Run, on what the last lesson left them unable to do (rule 8); a back-reference to kernelspace comes after that. A part stays under 600 words between two things to do (rule 3).
   - **`tr0.l1`.** Before you run (the five facts); Run `views`. Read: "What the transpose did" (the strides, the still buffer; Rust's `&v[a..b]` borrows and `.to_vec()` copies, as "The same idea" card); "Strides by hand" (the address as Python, `offset + i * stride[0] + j * stride[1]`; guess 2); "Broadcasting is a stride of 0" (Run: `stride-zero`); "dtype and device" (the rest of the metadata; `.to()` across devices copies, from a claim). Exit check.
   - **`tr0.l2`.** Setup; Run `three-d`. Read: "Where engines copy" (`contiguous()` before a kernel; `reshape` against `view` in model code; one `tr0.view-or-copy` checkpoint); "The syncs you cannot see" (`.item()`, `.tolist()`, `.cpu()`, printing a GPU tensor, from W2b-T27's claims; guess 2; what this does not buy yet: a sync costs time only while the GPU has work queued, which TR3 measures). Exit check.
   - **`tr0.l3`.** Read: "A module is a struct" (parameters as fields, `forward` as a method, `state_dict` keys as field paths; guess 1 within 450 words); "Qwen3's decoder layer at the pin" (transformers 5.19.0's Qwen3 code, read at its pin; every size from the `config.json` claims); "Shapes through one layer" (a table of the shapes at the five points the grader records; a `tr0.strides-of` checkpoint); "The cache's contract" (each step's logits equal a full recompute; kernelspace T5.L4 after the first sentence; the lab's Build row). Exit check.
   - **`tr0.l4`.** Item 12.
   - **`tr0.l5`.** Read: "The same model, written by an engine" (Mini-SGLang's `qwen3.py` at `9a91cfaf`; guess 1); "Kernels an engine owns" (the five MRV2 Triton files at `4ba787ec`, as one table of path, lines [measured] and what each does, from claims); "A Rust crate on the hot path" (SGLang's PyO3 radix-tree binding at v0.5.23, the one PyO3 example; the Data Plane's DP8 owns the seam). Exit check.

9. **The module page's sentences** (W2b-T32 writes them; the words are proposed, the facts are fixed):
   - N8: "TR0 helps before TR1. Nothing locks: the course starts at TR1 lesson 1, and you can come here first, or come back when the engines' Python reads hard." *Why:* the owner's answer (D-070); the front page's Start keeps naming TR1 lesson 1.
   - Rules 9 and 11: "TR0's five lessons are five separate subjects: a tensor's layout, the calls that wait for the GPU, a model's code, Triton's programs and an engine's own model code. So no lesson carries a table of what changed since the one before, and no one relation runs through them all." *Why:* rule 9's table is for lessons that are successive states of one mechanism, and these are not; rule 11's form is for a module with one relation at its centre, and TR0 has none. The address sum of lesson 1 is lesson 1's and lesson 4's, written as the Python the engines write, not a form.
   - The Prove step in words: "Prove: Tensor views' Fewest copies, in Prove mode, on three new targets with your coding agent closed; and, once your lab receipt is verified, questions that only the shapes and strides your own forward recorded can answer."

10. **The lab's challenge-time prediction is prose, not a `predict` block.** The lab page (W2-T16, on W2b-T30's page) asks it at "issue a challenge": "Before you run stage 2, write down which layer you expect to differ most from the reference if your RMSNorm epsilon were wrong. Nothing records your answer, and the course has not measured it." *Why:* a `predict` block is revealed after a game's run or at commit, and neither can reveal this: the answer is in the learner's own run on their laptop, the receipt records shapes and strides at five points and no per-layer difference, and the course has no measured answer to show. A guess with no reveal is not allowed (REDESIGN §2.5), so it is a question to hold, in the page's prose.

11. **Every lesson's last heading is "Exit check",** and it holds three questions, at least one of them numeric, plus the lesson's graded level where it has one. The page's rule passes the Test when every question is right (D-071). *Why:* the owner's answer to N5; and the built lessons already close on that heading.

12. **Lesson 4 has two shapes; the first is the one to write.** Under option B (D-072) W2b-T49 runs, so the lesson walks through the kernels that ran.
    - **With the walk-through (the main shape).** Before you run (item 8's five facts); Run `grid`. Read: "From the grid to `tl.program_id`" (opens on the run; the course's own kernel of at most 40 lines, `scripts/triton-interp/course_kernel.py`, named as the course's own: `pid = tl.program_id(0)`, `offs = pid * BLOCK + tl.arange(0, BLOCK)`, `mask = offs < n`, the masked `tl.load` and `tl.store`; a `tr0.grid-cover` checkpoint); "Pointers from strides" (a 2-D kernel's pointers, `base + offs_m[:, None] * stride_m + offs_n[None, :] * stride_n`, which is lesson 1's address sum, so a transposed input reaches the kernel as a view if the kernel takes its strides; guess 2); "Stepping a kernel on the CPU" (`TRITON_INTERPRET=1`; the course's run in the `cpu` job, printed with its day and commit: what one program's offsets and mask held; then each MRV2 kernel that W2b-T49's claims show ran, at `4ba787ec` with its lines, and what each program covers; a kernel that failed is named as one that did not run under the interpreter on Triton 3.8.0 and is not shown stepping; "A Triton 3.8.0 wheel off Linux is [unverified]: off Linux, read the course's run printed here."; about 20 minutes on the laptop, optional). Exit check: `grid` graded and three `tr0.grid-cover` questions. 50 minutes.
    - **Without it (only if W2b-T49 stops).** The same Run and first two parts. The third part becomes "Reading a pinned kernel's grid": one MRV2 kernel's `program_id`, `arange` and mask lines read at `4ba787ec`, with nothing stepped, and the sentence "The course has not run a vLLM kernel under the interpreter." The wheel sentence stays. No laptop minutes: 40 minutes, so the module's 195 stay within W2-T18's 10 percent of 205. The removal of the seventh outcome is then W2b-T49's proposed record.

13. **The item families** (W2b-T29). Every key comes from `packages/sim/tensor`, or for `tr0.find-the-sync` from a rule table whose every row is a W2b-T27 claim; each family draws at least one numeric variant, so a Test of three can hold one.

    | Family | KCs | Level 1 | Level 2 | Numeric variant |
    |---|---|---|---|---|
    | `tr0.strides-of` | `tr0.tensor-metadata`; its expand variant also `tr0.broadcast-stride-zero` | a rank-2 or rank-3 tensor after one slice (with a step), transpose, permute or expand: "What is the stride of dimension d?" | the attention reshapes: [tokens, heads · head size] by `view` to [tokens, heads, head size], then `transpose(0, 1)` | every question |
    | `tr0.view-or-copy` | `tr0.view-vs-copy` | a chain of two or three operations on rank 2: "Does the last call make a view, copy, or fail?" | the same on rank 3 | "How many elements does it move?" |
    | `tr0.find-the-sync` | `tr0.hidden-syncs` | four to six lines of PyTorch on GPU tensors: "Which line waits for the GPU?" | the same inside a loop | "How many times per step does this loop wait for the GPU?" |
    | `tr0.grid-cover` | `tr0.triton-program-model`, `tr0.triton-masks` | a 1-D or 2-D shape and a BLOCK: "Which program covers element (i, j)?" | the same with a grid below `cdiv` | "How many programs?" and "How many lanes are masked?" |

14. **The nine KCs and what earns each.** The table in §1 is the graph's, edge for edge, and adds each KC's first graded reference. Six are earned first by W2b-T29's families, which come before W2-T14's graded levels in the wave's order; three by the lab's stages (W2-T16), stage 2 for `tr0.module-as-struct` and `tr0.decoder-forward` (loading the checkpoint into your own module is half of stage 2), stage 3 for `tr0.kv-cache-contract`. Each task removes its own `planned:` lines. W2-T16's stage table (`packages/verify/stage-kcs.ts`) names `tr0.module-as-struct` beside `tr0.decoder-forward` for stage 2. `tr0.tensor-metadata` is a threshold KC: five of the module's KCs lean on it, and TR3's `tr3.gap-cause` through `tr0.hidden-syncs`.

15. **For W2b-T27, what the lessons need read at a pin.** Besides its own list: transformers 5.19.0's Qwen3 model file (the decoder layer's order and the names of its parameters), for lesson 3; in PyTorch 2.14's documents, `Tensor.stride` and `.to()` across devices, for lesson 1 and the game's parts; and in Triton 3.8.0's, `program_id`, `arange` (a power of two), `cdiv`, and `load` and `store` with a mask, for the parts of `grid` (GAMES.md §4.5). A fact that could not be read is [unverified], and no lesson leans on it.

16. **Defaults taken, not the owner's word.** N1 (the role line) and N3 (no 3D) are proposed records; O-14 (the blind bound of a choice item) takes the gate's reading; O-21 (someone else's run, quoted) is [unverified]; Q-5 (a `proved` event for completion) takes its default, yes, which is why item 5 names a Prove level.

**Not to copy from the rest of this file:** the working name "Shape Shifter" and its 3D scene (§6 is rewritten); "exit items" and the old rule of at least 2 of 3 right (item 11); "W2-T18 writes the KCs" (they are written); "W2-T18 checks" the interpreter (it is W2b-T49); a `predict` block before the lab (item 10).

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | Each Tensor views level opens on its own guess, revealed after the run (GAMES.md §4.3), and the lessons add guesses revealed at commit ("Before you write", item 8). Before the lab, the page asks in prose, and records nothing: "Which layer's output will differ most from the reference if your RMSNorm epsilon is wrong?" (item 10). | `predict` events, revealed and never credited (D-067) |
| **Play** | Tensor views: reach a target layout with the fewest copies, then tile a tensor with a grid that covers every element once (§6). | `play` events on practice seeds |
| **Build** | The `tr0.forward` lab: Qwen3-0.6B's forward in plain PyTorch on CPU, without and then with a KV cache, graded by the local grader against Hugging Face transformers in fp32 on the same CPU. | `receipt` events (§5) |
| **Prove** | With the agent closed: Tensor views' `fewest` level in Prove mode on fresh seeds, and "defend your forward": predict the shapes and strides your own forward produced at five named points, which the grader recorded in the receipt through forward hooks, before the browser shows them (ASSESSMENT §7.2). | `play` and `prove` events, provenance `proved` |
| **Keep** | Today draws `tr0.strides-of`, `tr0.view-or-copy`, `tr0.find-the-sync` and `tr0.grid-cover` on fresh seeds. | `review` events |

## 5. Artifacts and how each is graded

Pass bars are ASSESSMENT.md's (§4.3, §5.7). This table restates them for TR0.

| Artifact | Lane | What the learner submits | How it is graded | Pass |
|---|---|---|---|---|
| `play:shape-shifter/fewest` | B | A sequence of tensor operations from a seeded start to a seeded target | Replayed through the pure session at grade time against the fewest-copies ghost (A§6.3) | Copies made equal the ghost's, with no `view` refused, on 3 fresh seeds |
| `play:shape-shifter/grid` | B | `BLOCK` sizes and a grid for a seeded tensor | The `tensor` model counts each element's coverage | Every element covered exactly once, with the least masked waste, on 3 fresh seeds |
| Item families `tr0.strides-of`, `tr0.view-or-copy`, `tr0.find-the-sync`, `tr0.grid-cover` | B | Answers on seeds drawn at grade time | Keys computed at grade time by `packages/sim/tensor` | A lesson's Exit check: 3 questions, every one right, at least 1 of them numeric (the owner's answer to N5, D-071) |
| `receipt:tr0.forward.s1` (one layer, first win) | L | The output of decoder layer 0 for the challenge's prompts | The grader compares it with transformers' `output_hidden_states[1]` in fp32 on the same CPU | Max absolute difference ≤ 1e-4 [estimated]; practice, not required |
| `receipt:tr0.forward.s2` (full forward) | L | Logits at every position of the challenge's prompts | The grader compares them with transformers in fp32 on the same CPU; the browser re-checks argmax ids at margin-qualified positions against the owner's pinned bank (W2-T17, A§8.5 rule 7) | Max absolute logit difference ≤ 1e-3 (the catalog's bar), and every banked argmax equal |
| `receipt:tr0.forward.s3` (with a KV cache) | L | 16 [estimated] decode steps through your cache | Each step's logits are compared with a full recompute of the same prefix by your own uncached forward and by the reference | Max absolute difference ≤ 1e-3 at every step; cache length equals the prefix length after every step |

**Rules the grader adds for this lab** (ASSESSMENT §5.7, §10):
- **No delegation.** The forward runs in a subprocess with an import guard. Importing `transformers.models` or calling the reference model from the learner's module fails the stage with the import named. This is friction, not DRM, and ASSESSMENT §10 says so.
- **Same machine.** The reference runs on the same CPU, in the same process tree, with the same torch build, so a tolerance is not spent on hardware differences.
- **Pins.** torch, transformers and the model revision must match `course.lock.json` (A§8.5 rule 6). An off-pin run is shown with its versions and earns no credit.

**Why fp32 on CPU.** The catalog's bar is 1e-3. fp32 on one CPU leaves differences from operation order alone, which the honest solution must stay under. The bar is [estimated] until W2-T16's weights job measures the reference solution's margin under it. A wrong RMSNorm epsilon is the bestiary case that must fail (W2-T16 acceptance).

## 6. Game slot

**Tensor views** (`shape-shifter`), 2D, with a DOM mirror. GAMES.md §4 designs it (2026-11-20) and §2.6 names its parts; this file names the slot and what the module needs from it.

- **The rule is the concept.** A tensor is a buffer plus shape and strides. Views move nothing and a copy moves everything, so the fewest-copies path is reachable only by knowing which operations are views.
- **Levels the module uses:** `views`, `stride-zero` and `three-d` for practice; `fewest` graded and the Prove level; `grid` practice on its pinned tensor, then graded.
- **The 2D view.** The shape and stride table beside the tensor's cells and its buffer strip; the stride order as one line through the cells; a copy lays a new strip under the old one (GAMES.md §4.1).
- **No 3D scene.** The 2026-11-03 design's block, thread and cameras were weighed camera by camera, and none shows what the 2D does not (GAMES.md §4.2). W2-T15 is recommended cut (D-074, proposed; N3).

## 7. Pinned resources

Pins live in `course.lock.json` (A§4.4). Versions are [measured] from the engines' metadata on 2026-11-03.

| Resource | Pin | Why this pin | Re-check |
|---|---|---|---|
| Python | 3.12 | vLLM supports 3.11-3.14 and defaults to 3.12; SGLang needs ≥ 3.11; nano-vllm needs < 3.13 (vllm E1, T3; sglang R4) | quarterly |
| PyTorch (CPU, env `cpu`) | 2.14.0, proposed (A§14) | vLLM v0.33.0 pins 2.14.0 and SGLang v0.5.23 pins 2.14.1 (vllm E1; sglang R4). PyTorch's "stable" docs already show 2.15 (sglang N6), so lessons link the 2.14 docs, not "stable". | with the engines |
| transformers | 5.19.0 | SGLang's pin, and inside vLLM's range `>=5.16.1,<5.21.0` (sglang R4; A§4.4) | with the engines |
| Qwen3-0.6B | Hugging Face revision proposed by W2b-T27 in `course.lock.json` | The model of vLLM's MRV2 post and RFC #40846, so the learner's TR0-TR3 numbers sit beside upstream's (vllm TR0 notes) | pin |
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
| `TRITON_INTERPRET` is a real Triton knob, but vLLM mentions it only in three comment lines of `awq_triton.py`; no vLLM kernel was run under it | [unverified] | vllm E3 | 2026-11-03 | until W2b-T49 runs each kernel |
| Mini-SGLang's `models/qwen3.py` is 83 lines; the package is 8,090 physical Python lines, not the README's "about 5,000" | [measured] | sglang M2 | 2026-05-17 (commit) | 90 days |
| MRV2's Triton files and their line counts (§3) | [measured] | vllm TR0 notes | 2026-11-01 | pin |
| SGLang's radix-tree core is a Rust crate behind PyO3 and is the default, with fallbacks to Python | [measured] | sglang X1, X2 | 2026-09-29 (merge) | 14 days |

## 9. Hours

| Activity | B | L |
|---|---|---|
| Lessons `tr0.l1`-`tr0.l5` | 3.1 | 0.3 (interpreter walk-through) |
| Tensor views, practice and graded | 0.7 | — |
| `tr0.forward` s1-s3 | — | 2.9 |
| **Total** | **about 4** | **about 3** |

All [estimated]. The catalog's figure is 7 h, kept.

## 10. What goes stale, and when

| Item | Moves when | TTL | Detector |
|---|---|---|---|
| torch and transformers versions | an engine pin moves | with the engines (quarterly) | `verify:pins`; the upstream watcher (W3-T06) |
| The model revision | never inside a pin; re-chosen at a re-pin | pin | the bank's SHA-256 in the references manifest |
| MRV2 file paths and line counts | every vLLM minor, about every 14 days (vllm R2) | 14 days, re-read at each re-pin | `ls` and `wc -l` at the new tag, as in vllm §6 |
| `TRITON_INTERPRET` behaviour on the chosen kernels | each Triton minor | re-test at each re-pin | W2b-T49's interpreter run in the `cpu` job |
| PyTorch docs links | each PyTorch minor | 90 days | link-rot report (nightly) |
| Mini-SGLang | if the repo moves again | 90 days | its `commits/main.atom` |

## 11. Open items

1. **Triton on the learner's laptop.** Triton ships Linux wheels; whether a 3.8.0 wheel installs on macOS or Windows for interpreter use is [unverified], and lesson 4 says so. Off Linux, the learner reads the course's own run, printed in the lesson, and the walk-through stays optional.
2. **Which kernels run under the interpreter.** vllm E3: nobody had run an MRV2 kernel under `TRITON_INTERPRET=1`. Under the owner's answer to N4 (option B, D-072) W2b-T49 installs Triton 3.8.0 in the locked CPU environment and runs each candidate; a kernel enters `tr0.l4` only if that run shows it ran ("Before you write", item 12).
3. **The tolerance margins.** W2-T16 measures the honest solution's worst logit difference and the epsilon mutant's, and a thin margin goes to the owner: no task changes the 1e-3 bar (W2b-T48's proposed record).
4. **A Hugging Face download without a token.** Qwen3-0.6B is expected to download anonymously [unverified]; the grader's `fetch` sends a generic User-Agent and no token (A§9.7).
