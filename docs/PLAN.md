# enginespace: the master plan

**Status:** the course design, proposed for the owner's review. **Date:** 2026-11-03. Nothing is built yet: the site and the games are being built in waves W0-W3.

**What this file is for.** It explains the course's shape, how its parts work together, what it costs a learner, how it is built and kept current, and what is still undecided. The detail lives in the companion documents.

| Document | Holds |
|---|---|
| [PRODUCT.md](../PRODUCT.md) | the product record the owner confirmed on 2026-11-03 |
| [curriculum/](../curriculum/) | one file per module, TR0-TR8 and the capstone: what it teaches, what it builds on, its loop, artifacts, game slot, pins, claims, hours and TTLs |
| [ASSESSMENT.md](ASSESSMENT.md) | the grading model: provenance, pass bars, receipts, consistency checks, Prove-it, cheating, what is never graded |
| [WORLD.md](WORLD.md) | the Trace Room: the seeded engine world, the trace corpus, calibration, the notional-machine cards, determinism |
| [GAMES.md](GAMES.md) | every game's design (written in parallel; this plan names games by the slot they fill) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | the site, the simulation package, the game framework, the grader and its formats, CI and budgets |
| [DECISIONS.md](DECISIONS.md) | decisions D-001 onward, owner questions O-1 to O-11, and course-design questions Q-1 to Q-12 |
| [TRACKER.md](TRACKER.md) | the 120 build tasks of waves W0-W3 |
| [research/](../research/) | the dated upstream research of 2026-11-03 on vLLM, SGLang and the ecosystem |

**Sources.** `PRODUCT.md`; the owner's decisions of 2026-11-03 (D-001 to D-006); kernelspace's `SPECIALIZATIONS.md` (untracked, 2026-10-24), §2, §3.5, §4 and §7, cited as "the catalog"; kernelspace at `origin/master` d478f91 (2026-10-30), read with `git show`, including `PLAN-100X.md`; statespace at 7b6938c (2026-10-27), `docs/PLAN.md` and `docs/ASSESSMENT.md`, as a structural precedent; [upstream-vllm.md](../research/upstream-vllm.md) and [upstream-sglang.md](../research/upstream-sglang.md), cited by row as (vllm R4) or (sglang C1). Where the research changes a catalog claim, this plan follows the research and says so.

**Tags.** [measured] was read from the named source, on 2026-11-03 unless dated. [derived] is arithmetic on tagged inputs. [estimated] is a judgment or design target; every hour, cost estimate and threshold is one. [unverified] is not checked against a primary source. Identifiers, version strings, counts of named things and list numbers carry no tag. A table whose numbers share one tag says so in its caption.

---

## In plain words

- **What it is.** enginespace is the Engine Internals specialisation of kernelspace: a zero-server, browser-first course that goes one layer down from kernelspace's serving tracks, from the serving system into the engine itself, in vLLM and SGLang.
- **Who it is for.** A backend engineer who has finished kernelspace's serving track (T5 is a hard prerequisite), Rust-first, studying alone on a laptop, with a local or rented GPU for the hands-on half.
- **The promise.** Trace one request through vLLM and SGLang; attribute every microsecond of a token's latency; benchmark the engine honestly; and land one upstream contribution backed by evidence.
- **How it teaches.** You play the engine before you read it. You are the scheduler, the KV allocator, the profiler and the verifier, in a seeded world where each game's rule is the concept itself. Then you prove the same skill on the real vLLM and SGLang, on a GPU, with a local grader whose receipts your browser re-checks.
- **The currency is evidence.** Credit comes from fresh seeds in the browser, from references on your own machine, and from traces and benchmark logs that must agree with themselves and with physics. Clicks earn nothing, and no number is taken on trust.
- **Size and cost.** About 91 hours [estimated] over modules TR0-TR8, with TR5 in two parts, and a capstone. About 35 hours on a rented RTX 4090 and 6-8 hours on an H100 [estimated], roughly $24-54 at RunPod's prices of 2026-11-03 [derived]; $0 on your own GPU.
- **Status.** Design. The site and the games are being built, the browser-only modules first.

## 1. The course on one screen

| | |
|---|---|
| **Promise** | Trace a request through vLLM and SGLang, attribute every µs of a TPOT, benchmark the engine honestly, and land one evidence-backed upstream artifact. |
| **Learner** | A kernelspace graduate; Rust-first; T5.L1-T5.L10 required. |
| **Modules** | TR0 PyTorch and Triton for the Rust-first · TR1 Read the engines · TR2 The step loop · TR3 Profile a real engine · TR4 Attention backends as a consumer · TR5a Hybrid KV and adapter pages · TR5b Offload, the connector and events · TR6 Speculation and structure · TR7 Contribute honestly · TR8 Benchmark like you mean it · Capstone |
| **Hours** | about 91 [estimated]: about 53.5 in the browser (B), 3 on the laptop's CPU (L), 34.5 on a GPU (F) [derived from §4's table] |
| **Loop** | every module runs Predict → Play → Build → Prove → Keep (catalog §7; kernelspace PLAN-100X §5) |
| **World** | the Trace Room: a seeded step-loop simulator beside owner-captured, SHA-256-pinned engine traces |
| **Games** | nine games, one for every module except TR7 (the capstone reuses Gap Hunt), six of them 3D and three of those flagships; each game's rule is the concept it teaches (D-005) |
| **Grading** | fresh-seed checks in the browser; host-driven property tests on your Rust; a local grader whose receipts the browser verifies from raw data, with no server (D-001, D-010) |
| **Pins** | vLLM v0.33.0 and SGLang v0.5.23, re-pinned each quarter; nano-vllm, Mini-SGLang and "Inside vLLM" pinned as reading targets (D-011, D-035) |
| **Cost** | about $24-54 of GPU rental for the whole course [derived], or $0 on your own GPU |
| **Build** | W0 scaffold and the front-page game; W1 the no-GPU modules (TR1, TR2, TR5a, TR6, TR8); W2 the GPU modules and the grader; W3 the capstone and launch (D-002) |

## 2. Outcomes

PRODUCT.md's four outcomes, each with the modules and artifacts that evidence it. An outcome is met when every artifact listed is credited (ASSESSMENT §9).

| # | Outcome | Modules | Evidence |
|---|---|---|---|
| 1 | Trace a request from the API server to the model runner, naming every queue, copy and sync. | TR1 (TR0 helps) | the lifecycle map graded span by span (B); a nano-vllm fork whose spans follow your own map (F) |
| 2 | Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it. | TR2, TR3, TR6's mask lane, the capstone | the step loop toggled until the bubbles close (B); attribution of pinned and synthetic traces (B); a profile of vLLM with graphs and async scheduling toggled, and your attribution re-checked (F) |
| 3 | Implement a hybrid KV manager with adapter pages, the engine side of the KV connector and event contracts, and an exact rejection sampler. | TR5a, TR5b, TR6 | `hybrid-kv`, `kv-publisher` and `rejection-sampler`, each graded by host-driven property tests on fresh seeds (B); a toy connector in vLLM that passes upstream's tests and round-trips KV byte for byte (F) |
| 4 | Benchmark open loop with confidence intervals, and land one upstream artifact under the project's AI-disclosure rules. | TR8, TR7 | the broken-benchmark corpus (B); a timestamp-faithful BurstGPT replay re-checked from raw rows (F); a reproduction with an issue draft generated from its receipt (F). Filing upstream is the learner's own act, and upstream's response is never graded. |

## 3. Prerequisites, as kernelspace ids

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03. Nothing locks: prerequisites advise and the map shows them (A§1, I9).

**Required.** T5.L1-T5.L10, the whole serving track (PRODUCT.md): T5.L1 "Transformer Internals for Systems Engineers", T5.L2 "Tokenization & BPE", T5.L3 "Inference vs Training; Prefill vs Decode", T5.L4 "KV Cache Math", T5.L5 "PagedAttention Deep Dive", T5.L6 "Prefix Caching: The Free Lunch", T5.L7 "Continuous Batching", T5.L8 "Speculative Decoding & Chunked Prefill", T5.L9 "Distributed & Disaggregated Serving", T5.L10 "The Production Stack: vLLM, SGLang, TRT-LLM, Dynamo".

**Recommended, by module.**

| Module | kernelspace lessons | Labs, plays, exercises, field labs, pages |
|---|---|---|
| TR0 | T0.L3, T0.L4, T4.L4, T4.L6 | the `tiling-cube` play; Boot; Capstone Zero; the real-engine panel |
| TR1 | T0.L6, T2.L1, T2.L5, T3.L6 | the `scheduler` play; labs 02, 03, 04, 06 and 07, with the twins of 06 and 07 |
| TR2 | T0.L6, T2.L4, T4.L3, T7.L3 | the `scheduler` play; lab 06 and its twin; Boot; the S5 card |
| TR3 | T0.L6, T4.L2, T4.L3 | the `decode-kv` field lab; Boot |
| TR4 | T4.L3, T4.L6, T6.L5 | the `tiling-cube` play; lab 02; the Attention Zoo |
| TR5a | T1.L3, T1.L4, T2.L3, T6.L9 | lab 01; lab 02 with its optional `adapter_unified_paging` check; lab 07 and its twin; the `block-placement` play; the Attention Zoo |
| TR5b | T2.L3, T6.L3, T6.L10 | labs 02, 04 and 07; the `pd-split` and `timing-oracle` exercises |
| TR6 | T6.L6, T6.L8 | lab 08; the `push-luck` exercise |
| TR7 | T7.L1, T7.L2 | PLAN-100X §5.8's "OSS lower rungs" |
| TR8 | T7.L1, T7.L2, T7.L3 | the `knee` and `broken-bench` exercises; the `burstgpt-replay` field lab; the vendored BurstGPT and Kimi slices |
| Capstone | T4.L3, T7.L2, T7.L4 | the S5 card |

The labs are 01 `rust-allocator`, 02 `kv-block-manager`, 03 `bpe-tokenizer`, 04 `mpmc-queue`, 06 `batching-scheduler`, 07 `radix-cache` and 08 `xgrammar-lite`. Rust Zero (R.L1-R.L10) is assumed for the forge labs, which are Rust.

**The other specialisations.** TR modules recap topics another course owns in under an hour, and carry a minimal version where the owner course has not shipped (catalog §4): grammar-engine internals (DP4) in TR6; abort inside the engine (DP5) in TR1; Triton's program model (KN4) in TR0; the connector contract and event schema (WR3) in TR5b, as `kv-events@1` until The Wire ships (D-034).

## 4. Structure: modules, hours and lanes

Hours are [estimated]; the catalog's per-module totals are kept, and each module file breaks them down. B is work in the browser, including forge labs written in Rust on the laptop and graded in the tab; L is work on the laptop's CPU graded by the local grader; F is GPU work graded by the local grader.

| Module | Title | B | L | F | Total | Game slot (working name) | Graded artifacts | Wave |
|---|---|---|---|---|---|---|---|---|
| [TR0](../curriculum/TR0-pytorch-for-rust.md) | PyTorch for the Rust-first, and reading Triton | 4 | 3 | — | 7 | tensor layout (Shape Shifter, 3D) | Shape Shifter levels and items (B); Qwen3-0.6B forward matching Hugging Face to 1e-3 (L) | W2 |
| [TR1](../curriculum/TR1-read-the-engines.md) | Read the engines | 7.5 | — | 2.5 | 10 | request lifecycle (The Engine Floor, 3D) | lifecycle map by span checks (B); a nano-vllm fork (F) | W1 · F in W2 |
| [TR2](../curriculum/TR2-the-step-loop.md) | The step loop | 10 | — | — | 10 | step loop (The Loop, 3D flagship; the front page) | toggled until the bubbles close (B) | W0 · W1 |
| [TR3](../curriculum/TR3-profile-a-real-engine.md) | Profile a real engine | 5 | — | 7 | 12 | trace attribution (Gap Hunt, 2D) | attribution of pinned and synthetic traces (B); a profile and report on vLLM (F) | W2 |
| [TR4](../curriculum/TR4-backends-as-a-consumer.md) | Attention backends as a consumer | 2.5 | — | 4.5 | 7 | backend selection (Dispatch, 2D) | predict-then-reveal reads (B); backend sweeps (F) | W2 |
| [TR5a](../curriculum/TR5a-hybrid-kv-and-adapter-pages.md) | Hybrid KV groups, and adapter pages in one pool | 6 | — | — | 6 | KV pool (The Pool, 3D flagship) | `hybrid-kv` (B) | W1 |
| [TR5b](../curriculum/TR5b-offload-connector-events.md) | Offload, the connector's engine side, and the event publisher | 5 | — | 3 | 8 | KV tiers (The Switchyard, 3D) | `kv-publisher` (B); a toy connector (F) | W2 |
| [TR6](../curriculum/TR6-speculation-and-structure.md) | Speculation and structure | 6 | — | 2 | 8 | verifier (The Verifier, 3D flagship); the step loop's mask lane | `rejection-sampler`; the mask-overlap timeline (B); a proposer (F) | W1 · F in W2 |
| [TR7](../curriculum/TR7-contribute-honestly.md) | Contribute honestly | 2 | — | 4 | 6 | none | process items (B); a reproduction and its issue draft (F) | W2 |
| [TR8](../curriculum/TR8-benchmark-like-you-mean-it.md) | Benchmark like you mean it | 3.5 | — | 1.5 | 5 | benchmark court (Broken Bench, 2D) | the broken-benchmark corpus (B); a BurstGPT replay (F) | W1 · F in W2 |
| [Capstone](../curriculum/CAPSTONE.md) | Reproduce a commit pair's delta, attribute it, explain it, price it | 2 | — | 10 | 12 | none of its own (uses Gap Hunt) | paired runs and an explanation (F); the capstone page (B) | W3 |
| **Total** | | **53.5** | **3** | **34.5** | **91** | | | |

**The browser share.** By this table about 59% of the hours run in the browser [derived: 53.5 ÷ 91], against the catalog's ~35% [estimated, 2026-10-24]. The difference is counting: this plan counts lesson reading and the Rust forge labs as browser work. The GPU hours agree with the catalog's (§10).

**Paths.** Nothing locks; the map suggests three:
- **The standard path:** TR0 → TR1 → TR2 → TR3 → TR4 → TR5a → TR5b → TR6 → TR8 → TR7 → capstone. TR8 comes before TR7's lab, because the reproduction is measured by TR8's rules.
- **The browser-first path,** for a learner without a GPU yet: the browser parts of TR1, TR2, TR5a, TR6 and TR8, about 33 hours [derived: 7.5 + 10 + 6 + 6 + 3.5], which are also what W1 ships. The GPU halves follow when a GPU is at hand.
- **The returning-reader path:** a kernelspace graduate who already runs vLLM can start at TR2 or TR3 and use each module's Predict blocks as a placement check; a formal 15-minute placement [estimated, the catalog §4's figure] is a W3 stretch.

## 5. The learning loop, module by module

Every module runs kernelspace's loop (PLAN-100X §5; catalog §7). **Predict:** commit a number with a confidence before the reveal. **Play:** play the mechanism by hand in the seeded world, debriefed against a hidden reference. **Build:** make it real, in Rust graded in the tab or on the real engine graded by the local grader. **Prove:** defend it on fresh seeds with your agent closed. **Keep:** retrieve it later in Today, regenerated on fresh seeds.

| Module | Predict | Play | Build | Prove (agent closed) | Keep (Today families) |
|---|---|---|---|---|---|
| TR0 | elements a `contiguous()` moves; which layer a wrong epsilon breaks | Shape Shifter | `tr0.forward` (L) | `fewest`; defend your forward | strides, view or copy, find the sync, grid cover |
| TR1 | process boundaries a sampled token crosses | The Engine Floor | the nano-vllm fork (F) | `map` | which mechanism, where it runs, request state, what moved |
| TR2 | TPOT with async on; padding under the default captures | The Loop | Compose: your configuration as engine flags | `close` | bubble width, graph hit, padding waste, dispatch key, default budget, KV after graphs, preemption victim |
| TR3 | the largest contributor; TPOT with graphs or async off | Gap Hunt | `tr3.profile` (F) | `attribute`; defend your trace | which category, gap cause, floor, flat curve, capture window |
| TR4 | the backend picked, its fallback, the mode that runs | Dispatch | `tr4.sweep` (F) | Dispatch's `pick`; defend your sweep | which backend, graph downgrade, attention floor, fork or upstream |
| TR5a | blocks a request holds; pages free after an adapter loads | The Pool | `hybrid-kv` (forge) | Prove-it v2 on your module; `manager` | blocks held, hit length, pages per adapter, slots against pages |
| TR5b | load or recompute; the next event a consumer needs | The Switchyard | `kv-publisher` (forge); a toy connector (F) | Prove-it v2; `yard`; defend your connector | load or recompute, which invariant, next event, replay from |
| TR6 | acceptance probability; tokens per round; whether the mask fits | The Verifier; The Loop's mask lane | `rejection-sampler` (forge); a proposer (F) | Prove-it v2; `exact`; defend your proposer | acceptance, residual, tokens per round, best draft length, mask fits, which runner |
| TR7 | whether your interval will contain the published number | practice items on seeded PR descriptions (no game, GAMES.md §12) | `tr7.reproduce` and its issue draft (F) | a seeded PR description to fix | PR checklist, RFC threshold, which rulebook, what to expect |
| TR8 | the corrected p99 and its interval | Broken Bench | `tr8.replay` (F) | `court`; defend your replay | minimum n, interval width, corrected p99, goodput denominator, Little's law, which flag |
| Capstone | the delta's sign and size; the term that moves | Gap Hunt on the pair's traces | `capstone.pair` (F) | defend your pair | which term moved, price at goodput |

**Today** is the home for Keep: 10-12 minutes [estimated], phone-first, on kernelspace's vendored FSRS, with every item regenerated on a fresh seed and change cards when a pin moves (D-037; ASSESSMENT §8).

## 6. Grading, summarised

ASSESSMENT.md has the detail. In brief:
- **Three lanes, one rule.** Credit comes only from deterministic checks: fresh seeds in the browser (B), host-driven property tests on the learner's wasm (B, forge), and receipts from a local grader run on the learner's own CPU or GPU (L, F), which the browser verifies with no server (D-001, D-010).
- **Weights** [estimated, kernelspace's values carried over]: `unseen`, `proved` and `gpu-verified` count 1.0; `practice` and `assisted` 0.3; `gpu-unverified` and `self-reported` 0. Weights apply at read time (ASSESSMENT §3.2).
- **Receipts.** Each GPU or CPU stage is bound to a single-use challenge issued by the learner's browser. The grader checks correctness against references (a same-CPU fp32 match, teacher-forced agreement, tie-aware same-machine identity, upstream unit tests, byte identity) and writes one bundle with every artifact hashed. The browser re-checks what it can, recomputes every performance number from raw rows and traces, and applies physics floors (ASSESSMENT §5, §6).
- **Consistency, not speed.** Traces must partition exactly, launch before their kernels and respect floors; benchmark logs must match the challenge's schedule, keep open-loop adherence, recompute their percentiles and intervals, and satisfy Little's law. No credit depends on how fast a GPU is.
- **Prove-it** is taken with the agent closed: predicting your own forge module's replies, a graded level in Prove mode, or seeded questions only your own receipt can answer (ASSESSMENT §7).
- **Never graded:** browser timing, speed, prose, self-reported numbers, upstream's response, anything an LLM judges (ASSESSMENT §11).
- **The honest limit:** a determined forger with a patched grader can pass; the course issues no credential to third parties (ASSESSMENT §12).

## 7. The world, summarised

WORLD.md has the detail. **The Trace Room** puts two things side by side:
- **A seeded engine world** that follows vLLM v0.33.0's engine core in integer microseconds: one token budget with chunked prefill and recompute preemption; a KV manager with hybrid groups, S-LoRA-style adapter pages and the engines' adapter slots as a baseline; CUDA-graph modes, capture sizes, padding and per-runner dispatch keys (MRV2's 7-field descriptor first, D-041); async scheduling with its dependency check; speculation's step shape; and the grammar mask's four phases. Its GPU step times come from kernelspace's S5 card inside S5's box (Llama-3-70B on H100 and B200) and from a labelled datasheet bound outside it; its host costs are estimates until the owner's traces fit them.
- **A trace corpus:** 6-10 [estimated, the catalog's figure] owner-captured traces of the pinned engines, SHA-256-pinned, dated and annotated (none captured yet, O-5); synthetic traces with exact ground truth, always labelled; and the learner's own traces, which never leave the device.
Every world carries a card saying what it models, what it ignores and what calibrated it, and where the world and a trace disagree, the trace wins (D-012).

## 8. The games

GAMES.md designs every game; this plan names each module's game by the slot it fills. The working names and ids below are GAMES.md's and ARCHITECTURE §6.1's, and TRACKER.md's tasks and ASSESSMENT.md's pass bars use the same level ids.

| Slot | Module | Working name (id) | View | The rule, which is the concept |
|---|---|---|---|---|
| The step-loop game | the front page, TR2, TR6's mask lane | The Loop (`loop`) | 3D flagship, with a 2D path | a step costs the GPU about the same for one request or many, so keep every slot live and never let the GPU wait for the CPU; each step pads to a captured graph or launches eagerly |
| The tensor-layout game | TR0 | Shape Shifter (`shape-shifter`) | 3D | views move nothing and a copy moves everything; reach the target with the fewest copies |
| The request-lifecycle game | TR1 | The Engine Floor (`engine-floor`) | 3D | a request crosses a boundary only through the mechanism that crosses it |
| The trace-attribution game | TR3, the capstone | Gap Hunt (`gap-hunt`) | 2D | every nanosecond of a step belongs to one category, and a gap is an empty launch queue |
| The backend-selection game | TR4 | Dispatch (`dispatch`) | 2D | the engine takes the first backend whose support covers the model and the GPU |
| The KV-pool game | TR5a | The Pool (`pool`) | 3D flagship | one page pool serves every KV group and adapter, and a hit counts only where every group holds it |
| The KV-tiers game | TR5b | The Switchyard (`switchyard`) | 3D | read a block only after its load lands, free it only after its save completes, publish every move |
| The verifier game | TR6 | The Verifier (`verifier`) | 3D flagship | accept with min(1, p/q), recover from (p − q)⁺, and the output is p exactly |
| The benchmark-court game | TR8 | Broken Bench (`broken-bench`) | 2D, with an optional 3D opener | latency counts from the due time, and a percentile is only as good as its sample |

TR7 has no game, because a game would trivialise judgment about people and process (GAMES.md §12). Every 3D game has a 2D path and a DOM mirror, keyboard control and reduced motion, and passes kernelspace's 3D gate as D-019 amends it. The front page opens on The Loop: playable in 2D from the first paint and in 3D within seconds on a capable device (D-004, D-023, O-11). Its run is GAMES.md §3.1's "First loop": the visitor batches requests by hand, refills slots and turns on overlap, and CUDA graphs wait for TR2 (D-043). A front-page run is practice and earns nothing (D-038). The visual identity is chosen separately (D-006), so no file in this design names a colour, a typeface or a visual style.

## 9. The capstone

[CAPSTONE.md](../curriculum/CAPSTONE.md) has the detail. The learner picks one of three vLLM pairs with a known direction of effect, which the owner chooses (O-6). The research's candidates: async scheduling off against on (v0.13.0 against v0.14.0, or a flag at one version), MRV1 against MRV2 (a flag at one version, or v0.28.0 against v0.29.0), and the KV-offload layout change (v0.11.x against v0.12.0). The learner then:
1. predicts the delta and the term that moves;
2. runs both sides under one challenge with the same seeds, replaying open loop by TR8's rules and profiling by TR3's;
3. attributes the delta;
4. explains it in roofline terms;
5. prices both sides in dollars per million tokens at the measured goodput (kernelspace T7.L4).
Credit rewards evidence that holds together, never the size of the delta or a match with upstream's magnitude, which on learner hardware is [unverified] for all three candidates (vllm U5).

## 10. Hardware and cost per learner

| Need | What | Why |
|---|---|---|
| A laptop | any OS with a current browser; Rust 1.96.0 with the `wasm32-unknown-unknown` target; Python 3.12 with uv 0.10.2 | the browser lane, the forge labs (A§10.3) and TR0's CPU lab (A§9.3) |
| A GPU for the F lane | NVIDIA with at least 24 GB, driver R580 or newer for vLLM v0.33.0's CUDA 13 wheels (vllm R4) | an RTX 4090 is the reference; an L4 or L40S works more slowly; an H100 for 6-8 hours |
| Disk on the GPU host | room for the engine images and the pinned models, tens of GB [estimated] | — |

**GPU hours by module** (with the pod up while you work) [estimated]:

| Module | RTX 4090 | H100 |
|---|---|---|
| TR1 | 2.5 | — |
| TR3 | 7 | — |
| TR4 | 2.5 | 2 |
| TR5b | 3 | — |
| TR6 | 2 | — |
| TR7 | 2 | 2 (for an H100 target; otherwise the 4090 time doubles) |
| TR8 | 1.5 | — |
| Capstone | 6-8 | 2-4 (0 if the chosen pair has no H100 side; CAPSTONE §0) |
| Setup and idle time across sessions | about 6-7 | — |
| **Total** | **about 33-35** | **6-8** |

**Cost** at RunPod's prices, read on 2026-11-03 from a page "Updated October 28, 2026" (sglang C1; 90-day TTL): RTX 4090 $0.34-0.89 per hour and H100 PCIe $1.99-2.89 per hour, Community to Secure [measured]. So 35 h × $0.34 + 6 h × $1.99 = $23.84, and 35 h × $0.89 + 8 h × $2.89 = $54.27 [derived; matches the catalog's "$24-54"].

**Other providers,** read the same day [measured]: Lambda's H100 is $3.29 per hour (PCIe) or $4.29 (SXM). Modal offers no 4090 (an L4 is $0.80 per hour, an L40S $1.95, an H100 SXM5 $3.95), bills CPU and memory on top, and may run a `gpu="H100"` request on an H200 unless `"H100!"` is asked for (sglang C3-C5). On the learner's own GPU the rental cost is $0.

**Two gates before any GPU work.**
- **The driver.** v0.33.0's wheels are CUDA 13.0 only and need a host driver of R580 or newer; whether RunPod, Modal and Lambda hosts meet it is [unverified] (vllm R4, U1). `enginespace doctor` checks it. If the owner's capture hosts or the cheapest rentable 4090s fail it, the course pins v0.32.0, the last minor with CUDA 12.9 builds (D-035).
- **The profiler.** nsys's CPU sampling needs `perf_event_paranoid` at most 2 [measured from NVIDIA's installation guide], which a rented container cannot change, and Nsight Compute's counters are unverified on RunPod and Modal (sglang N4, N5). TR3's first stage probes both, and nothing graded depends on them.

## 11. Upkeep and pins

**The pins** (`course.lock.json`, A§4.4; D-035, which the owner confirms through O-4) [measured by the research on 2026-11-03]:

| Key | Pin | Date |
|---|---|---|
| `vllm` | v0.33.0, `4ba787ec9959e566d3b587a796dff07673324da5`; fallback v0.32.0, `5df63a7203cdb9328d824a27b682e77c7b9928be` | GitHub 2026-11-01, PyPI 2026-11-02 |
| `sglang` | v0.5.23, `297e54fd105e974cdf401e5b4d20253a22c16f90` | PyPI 2026-10-30, GitHub 2026-11-02 |
| `inside-vllm` | the post of 2025-09-05, read against `42172ad18fbc22c89d0063184e4570cc84186e16` | 2025-08-09 |
| `nano-vllm` | `bb823b3e06983d71485a8e1f23715ebd87d98ef8` | 2026-04-26 |
| `mini-sglang` | `9a91cfafe754aa85daee49998176275667eb58f2` | 2026-05-17 |
| Engine stacks | vLLM: torch 2.14.0, Triton 3.8.0, FlashInfer 0.7.2.post1, xgrammar 0.2.8; SGLang: torch 2.14.1, transformers 5.19.0, FlashInfer 0.7.2, xgrammar 0.2.7 | with the engines |
| Tools | Nsight Systems 2026.5.1, Nsight Compute 2026.3.1, Perfetto v59.1 (proposed) | read 2026-11-03 (sglang N1, N2); Perfetto released 2026-10-27 |
| Data | BurstGPT v2.0 files, each pinned by SHA-256 (the source asset kernelspace's vendored slices were cut from: `a4d068a7113ec0290e74063a1b3447dc6001a30e4298eb313581b71006dda1f4`, per its `public/traces/README.md`), CC BY 4.0 | 2026-01-23 |
| Models | Qwen3-0.6B at a Hugging Face revision W2-T16 pins; an H100 model W2-T21 pins | — |
| Docs | `docs.vllm.ai/en/v0.33.0/`, never `/en/latest/`, which moves (vllm R5) | 2026-11-01 |

kernelspace's lab twins keep their own pins (vLLM v0.31.0, SGLang v0.5.21), and TR1 and TR2 name the gap where they cite them; the lab 06 twin's scheduler facts still hold at v0.33.0 (vllm M12).

**Why quarterly is a lot.** vLLM ships a minor about every 14 days (median 13.8 days over its last 8 intervals [derived], vllm R2), and so does SGLang (median 14.1 days [derived], sglang R3). A quarterly re-pin therefore skips about 6-7 minors [derived: 92 ÷ 13.8], each of several hundred commits (v0.33.0 had 927 from 389 contributors [measured], vllm R6). The pin never moves mid-quarter, because the reference traces are pinned to it; the first re-pin falls about 2027-02 [estimated].

**The re-pin runbook** (W3-T06), in order:
1. Run the drift detectors at the new tags (vllm §6): a scripted check per fact, such as the five CUDA-graph modes, both descriptors' fields, the connector's method set, the event classes, the speculative methods, the benchmark defaults, MRV2's fallback list and MRV1's presence.
2. Re-check every claim tied to a moved pin, and raise change cards for those that moved (A§4.4).
3. Update the per-pin shims at the moving extension points: the TR5b connector, the TR6 proposer (the highest churn: vllm S4) and the TR3 profiler commands.
4. Capture the owner's new trace set, annotate it, and refit the host card (WORLD §3.7, §4.6).
5. Run the grader's GPU smoke on a 4090 and an H100, and regenerate the receipt fixtures (W2-T12).
6. Re-measure anything with a re-measure rule, such as TR7's PR census.

**Upkeep** is about 14-25 hours a quarter [estimated: drift detectors 1, claims 3-5, shims 2-6, traces and annotation 4-6, refit 1-2, smoke and fixtures 2-3, change cards 1-2], above the catalog's ~10 hours [estimated], which the research calls a floor (vllm R6). The owner's GPU spend per re-pin is about $3-7 [derived in WORLD §3.2].

**TTL classes** [estimated; the 90-day price TTL is kernelspace's PLAN-100X §6.3 rule]. 7 days: FlashAttention 4's betas. 14 days: anything that moves with an engine minor. 21 days: FlashInfer. 30 days: xgrammar and llguidance. 60 days: Nsight, Perfetto, FlashMLA's hardware list. 90 days: prices, quiet repositories, BurstGPT. Pin: frozen until the next re-pin. Static: history. An expired claim never fails CI; the page shows "stale since" and the weekly watcher lists it (A§4.4).

## 12. Build waves

TRACKER.md has the 120 tasks; DECISIONS.md D-036 sets the process: tasks sized S, M or L, each one PR for a Sonnet agent in isolation, an Opus review at each wave's exit, and stacked wave branches the owner merges.

| Wave | Goal | Exit | Tasks |
|---|---|---|---|
| **W0** | Scaffold, the design-system hookup, and the front-page game: The Loop in 2D from the first paint and 3D after LCP | `/` playable; the fast gate in CI; every budget measured; the TR2 spike passed (D-040) | 24 |
| **W1** | **The no-GPU modules first** (D-002): TR1, TR2, TR5a, TR6 and TR8 in the browser, with their games (The Engine Floor, The Loop's levels, The Pool, The Verifier, Broken Bench), the forge labs `hybrid-kv` and `rejection-sampler`, Today and the map | five modules live with their loops; every W1 game passes `verify:games` and keyboard walks; the GPU parts of TR1, TR6 and TR8 announced for W2 (D-039) | 38 |
| **W2** | The GPU modules TR0, TR3, TR4, TR5b and TR7; the local grader, receipts and verification; the owner's traces; the GPU parts of TR1, TR6 and TR8 | the grader installs with uv or pip; a real receipt from the owner's GPU passes and its forgeries fail; every GPU module live | 41 |
| **W3** | The capstone, the visual identity across pages and scenes, performance and accessibility sweeps, the claims audit, launch | the capstone live; every budget passes; a clean claims audit; launch at the chosen domain | 17 |

**Content tasks per module:** TR2 W1-T15, TR1 W1-T20, TR5a W1-T25, TR6 W1-T30, TR8 W1-T34, TR0 W2-T18, TR3 W2-T24, TR4 W2-T27, TR5b W2-T33, TR7 W2-T37, the capstone W3-T04. Each writes its module from the matching file in `curriculum/`.

**Owner tasks that gate content:** confirm the pins (W1-T02, O-4); the GPU smoke and receipt fixtures (W2-T12); TR0's argmax bank (W2-T17); the 6-10 reference traces (W2-T21, O-5); the capstone's pairs (W3-T01, O-6); three screen-reader passes; the launch.

**Review load.** About 160-180 hours of owner review by the catalog's code-QA rates [derived: one world and one capstone harness at 20 h, 11 browser-graded artifacts at 8 h, 8 local or GPU lanes at 4 h, plus a grader harness at about 20 h; the rates themselves are estimates]. TRACKER's S, M and L sizes measure agent effort, not owner review, so they are not converted into review hours; GAMES.md §14 notes that the 3D scenes, each its own L task, may push review past this figure. At kernelspace's 10-hours-a-week cap (O-8's default) that is about 16-18 weeks of review before content time.

## 13. Risks

| Risk | Mitigation |
|---|---|
| **Upstream churn.** Minors every ~14 days; extension points move (the `custom_class` proposer, the connector's registration, profiler flags); MRV1's removal is pending (vllm M4, S4) | one pin per quarter; per-pin shims in each GPU lab's starter; scripted drift detectors; change cards; "read the code at the pin" as a lesson rule |
| **The driver gate fails on rental hosts** (vllm R4, U1) | `doctor` checks first; the v0.32.0 fallback (D-035) |
| **No real traces yet** (PRODUCT.md) | synthetic traces, labelled, carry TR1 and TR3 until W2-T21; the host card stays [estimated] until W2-T22 |
| **The world is calibrated outside the course's hardware.** S5's box is Llama-3-70B on H100 and B200 at vLLM 0.10.2; the GPU lane runs Qwen3-0.6B on a 4090 at v0.33.0 | napkin and estimated labels outside the box; the host-card fit; validation panels that print the world's error (WORLD §4) |
| **Honest receipts fail.** Numerics drift across GPUs, batch shapes flip near ties, and tolerances are still estimates | teacher-forced agreement instead of exact banks; tie-aware identity; tolerances measured on the owner's fixtures before shipping; a false fail never subtracts (ASSESSMENT §4.6, §6.5) |
| **Forged receipts.** A zero-server design cannot stop a determined forger (ASSESSMENT §12) | binding, hashes, recomputation, floors and a forged-receipt bestiary in CI; no credential issued to third parties |
| **Agents do the work** | self-reported provenance; Prove-it on the learner's own artifacts with the agent closed; the agent kit's guard in every lab zip (ASSESSMENT §7, §10) |
| **Harm upstream.** Many learners filing one issue, or "pure agent" PRs | TR7: one target per learner, duplicate checks, generated drafts never auto-filed, and no cohort pointed at one upstream item |
| **Cost and access.** Some learners cannot rent a GPU | every module's browser part completes without one; costs shown as dated claims; L4 and L40S alternatives |
| **3D distracts rather than teaches** (seductive detail; kernelspace games-3d research) | the rule is the concept; 2D is first-class; D-019's gate; the pre-registered 3D-against-2D comparison as a W3 stretch (D-005's revisit) |
| **Review capacity** | waves and task sizes (D-036); the browser-first order; Opus exit reviews |
| **Data licences.** ShareGPT's rights are unresolved; BurstGPT is CC BY 4.0 at the repository level (sglang D1, D4) | never bundle ShareGPT; pin and attribute BurstGPT |
| **Stale upstream docs** mislead readers (vllm G5, K1) | lessons cite code at the pin, label stale docs, and raise a change card when a doc is fixed |
| **Privacy in receipts** | the fingerprint's never-collected list; `doctor` shows every field first; receipts never leave the device unless the learner moves them (ASSESSMENT §5.6) |

## 14. Open decisions

**The owner's open questions** from DECISIONS.md, with their defaults: O-1 the domain; O-2 when the repository goes public (Pages on a private repository needs a paid plan [unverified]); O-3 the licences (default MIT for code and CC BY 4.0 for content, nothing published until decided); O-4 confirm the pins and the driver gate; O-5 the reference traces (WORLD §3.2 proposes ten); O-6 the capstone's pairs; O-7 the 2026-10-24 pick-form gate (default: it does not gate this repository); O-8 review capacity (default 10 hours a week); O-9 the reference devices; O-10 whether grader-attested correctness counts at full weight (ASSESSMENT §3.2 adopts the default: yes, when every browser-runnable check also passes); O-11 the front page's 2D-first reading of D-004.

**New questions from the course design**, now filed in DECISIONS.md as Q-1 to Q-8 beside Q-9 to Q-12. The design review settled Q-2, Q-3 and Q-7 as proposed decisions D-044, D-043 and D-046:

| # | Question | Default until answered | Needed by |
|---|---|---|---|
| Q-1 | Are H100 stages required for module completion (TR4's s4, an H100 target in TR7, an H100 side in the capstone)? | No: they earn their own KCs at full weight, but completion never requires renting an H100 | W2-T26 |
| Q-2 | Where does S5's host term t_seq go: inside the GPU step as S5 fitted it, or on the CPU lane where async scheduling can hide it (GAMES.md §13)? | The CPU lane, labelled an extrapolation and checked against the owner's H100 trace. S5's sweep ran vLLM 0.10.2, before async scheduling became the default in v0.14.0 (vllm M6); whether its harness turned async scheduling on is [unverified]. Proposed as D-044. | W1-T12 |
| Q-3 | The front page's levers: ARCHITECTURE §6.11 (async scheduling, CUDA graphs, a batch cap) or GAMES.md §3.1 (place requests by hand; refill and overlap)? | GAMES.md §3.1's, proposed as D-043; ARCHITECTURE §6.11 and TRACKER W0-T16 now follow it | W0-T16 |
| Q-4 | Does a flag pair at one vLLM version (async scheduling or the runner flipped) count as a "pinned commit pair" for the capstone? | Yes, if the owner agrees: it isolates the change best | W3-T01 |
| Q-5 | Is a `proved` event required for a module to count as complete (ASSESSMENT §9)? | Yes | W1-T06 |
| Q-6 | Are AMD (ROCm), Apple and other GPUs out of scope for edition 1? | Yes: the pins' wheels and the owner's traces are NVIDIA CUDA 13 | W2-T04 |
| Q-7 | Tie-aware identity (ASSESSMENT §5.7) in place of strict token identity for speculative against plain outputs | Tie-aware, proposed as D-046 | W2-T35 |
| Q-8 | If no flash-attn build installs for nano-vllm on torch 2.14 and CUDA 13 (vllm U3), is Mini-SGLang the fork target for TR1? | Yes | W2-T34 |
