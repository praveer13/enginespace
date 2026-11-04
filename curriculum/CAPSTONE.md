# Capstone · Reproduce a commit pair's delta, attribute it, explain it, and price it

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `capstone`. **Hours:** about 12 [estimated]: about 2 in the browser (B) and about 10 on GPUs (F). **Ships in:** W3 (D-002), after the owner chooses the commit pairs (O-6, W3-T01). **Owns:** nothing shared. Like every capstone in the catalog, it prices itself with kernelspace's T7.L2 and T7.L4 (catalog §2).

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm M6) and (sglang G3). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Take a change to vLLM with a known effect, reproduce the effect on your own GPU with the same seeds on both sides, show where in the step it comes from, explain it in roofline terms, and say what it is worth in goodput and in dollars per million tokens. Every outcome of the course meets here. |
| **The catalog's wording** | "Reproduce one of three pinned commit pairs with a known delta, attribute it with profiles, explain it in roofline terms, and show goodput at SLO before and after, measured by TR8's rules. Your speedup is F." |
| **Artifacts** | Paired runs under one challenge, and a structured explanation checked against the evidence (F); the capstone page, which re-verifies both sides and attributes the owner's pinned traces of the same pair (B). |
| **Game slot** | None of its own. It uses Gap Hunt (TR3) and Broken Bench's rules of evidence (TR8) as instruments (GAMES.md §12). |
| **Prerequisites** | TR2, TR3 and TR8 in practice; T7.L2 and T7.L4 from kernelspace. The pair chosen may lean on TR1, TR4, TR5b or TR6. |
| **GPU** | About 6-8 h on a 4090-class GPU and 0-4 h on an H100, depending on the pair [estimated]. |

## 1. What the learner does

1. **Choose a pair** from the owner's three. A pair is two pinned vLLM versions or two pinned settings with a known direction of effect, recorded in `course.lock.json` with dates and the expected direction (W3-T01). The research's candidates, cheap to reproduce because each side is a PyPI wheel or a flag (vllm capstone notes):

   | Candidate | Sides | Known from | Upstream's magnitude |
   |---|---|---|---|
   | Async scheduling | v0.13.0 against v0.14.0, or one version with and without `--no-async-scheduling` | async scheduling became the default in v0.14.0 (vllm M6) | "throughput by 3-15%", none at batch size 1, TPOT lower and TTFT slightly higher [unverified, contributor-reported; sglang W2] |
   | The model runner | MRV1 against MRV2 through `VLLM_USE_V2_MODEL_RUNNER=0\|1` at one version, or v0.28.0 against v0.29.0 | MRV2 became the default in v0.29.0 (vllm M1) | +56.2% throughput on Qwen3-0.6B on one GB200 [unverified, vendor-reported; vllm M5], which a 4090 is not expected to reproduce |
   | The KV-offload layout | v0.11.x against v0.12.0 | v0.12.0's layout gives physical blocks of about 0.5-2 MB copied by DMA (vllm K5) | TTFT ×2-×22 and throughput up to ×9 on an H100 [unverified, vendor-reported; vllm K5] |

   Whether a flag pair at one version counts as a "commit pair" is the owner's call (PLAN.md Q-4).
2. **Predict before running.** The sign and size of the delta in goodput at SLO and in TPOT, and which term of the step moves: host work, a memory-bound forward, a compute-bound forward, or a transfer. The prediction uses TR2's model and the S5-style card with the hardware atlas's numbers for your GPU, and is committed in the browser when the challenge is issued.
3. **Run both sides under one challenge.** Same seeds, same workload, same server settings apart from the pair's change: an open-loop replay by TR8's rules for latency and goodput, and a profile capture by TR3's rules for attribution, on each side.
4. **Attribute.** Partition each side's steps (GPU-busy as kernel and copy, CPU-gap, both-idle, with overlap beside) and name the category that moved, with an interval.
5. **Explain in roofline terms.** For each side's decode steps: the bound (memory or compute) on the card, the floor from bytes over bandwidth, and the share of the step above the floor; then which of these the pair's change moved, and why that matches the attribution.
6. **Price it.** Dollars per million tokens on each side at the measured goodput, using the GPU's hourly price as a dated claim (kernelspace T7.L4's arithmetic), and the goodput-at-SLO delta with its interval.

**Knowledge components** (proposed; W3-T04 writes them):

| KC | Requires |
|---|---|
| `cap.paired-runs` | `tr8.open-vs-closed`, `tr3.capture-window` |
| `cap.delta-interval` | `tr8.bootstrap-p99` |
| `cap.attribute-delta` | `tr3.partition`, `tr3.gap-cause` |
| `cap.roofline-explain` | `tr3.step-floor`, `ks:t4.ridge-point` |
| `cap.price-it` | `ks:t7.cost-per-mtok` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What the capstone takes from it |
|---|---|---|
| Lesson | T7.L2 "Benchmarking Methodology: Measure Like You Mean It" (`t7.l2`) | The report, and the knee as capacity. |
| Lesson | T7.L4 "Unit Economics: $/Mtok, tok/MW, and the 545% Margin Day" (`t7.l4`) | Dollars per million tokens (`t7.cost-per-mtok`). |
| Lesson | T4.L3 "The Roofline Model" (`t4.l3`) | The bound and the ridge point (`t4.ridge-point`). |
| Model | kernelspace's S5 card, vendored (A§13) | The card's form for the roofline explanation, with the atlas's numbers for the learner's GPU; S5's own fitted rows apply only inside their box (WORLD §4). |

**Within enginespace.** TR2 (the model behind the prediction), TR3 (capture and attribution), TR8 (open loop, warm-up, intervals, goodput's denominator), and whichever module the pair touches.

## 3. Work plan

Minutes are [estimated].

| Part | Minutes | Lane |
|---|---|---|
| Choose the pair; read its upstream change and the owner's notes | 30 | B |
| Commit the prediction | 15 | B |
| Set up both sides' environments (older versions need their own locked environment, W3-T02) | 90 | F |
| Paired replays, both sides | 180 | F |
| Paired profile captures, both sides | 120 | F |
| Attribute your traces | 90 | F |
| Explain and price, as the structured form | 60 | F |
| Re-runs where a check fails | 60 | F |
| The capstone page: verify, Gap Hunt on the owner's pinned traces of the pair, the roofline form | 75 | B |

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | The delta's sign and size, and the term that moves (§1, step 2). | `predict`, scored against the recomputed result |
| **Play** | Gap Hunt on the owner's pinned traces of the same pair, captured on the reference GPUs (W2-T21 extended by W3-T01). | `trace-mark`, `play` |
| **Build** | The paired runs and the structured explanation (§5). | `receipt` |
| **Prove** | With the agent closed: seeded questions only your two receipts answer, such as "remove the warm-up window's last 50 requests from side B: does your interval still exclude zero?" (ASSESSMENT §7). | `prove`, `proved` |
| **Keep** | Today draws `cap.which-term-moved` and `cap.price-at-goodput` on fresh seeds. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `receipt:capstone.pair.s1` (the paired runs) | F | Both sides under one challenge: per side, the replay's raw rows, the profile's `trace@1`, the fingerprint and the effective engine configuration | Grader: each side's pins (the pair's own versions, from `course.lock.json`), teacher-forced agreement of each side's outputs, and that both sides ran the challenge's seeds. Browser: every TR8 and TR3 consistency check on each side (ASSESSMENT §6); that the two sides differ only in the pair's change, by diffing their recorded configurations; the delta in goodput at SLO and in TPOT, each with a seeded bootstrap interval, recomputed from raw rows. | Every required check passes. A pair run on different seeds fails binding (W3-T02's acceptance). |
| `receipt:capstone.pair.s2` (the explanation) | F | A structured form: the category that moved with its recomputed delta and interval; each side's decode bound, floor and share above the floor; the mechanism claimed; dollars per million tokens per side | Browser: every number in the form must equal the recomputed one; the mechanism must be consistent with the evidence (a claim that the CPU gap shrank requires the CPU-gap category's interval to exclude zero in that direction; a claim of a memory-bound step requires the card's memory term to dominate at the measured batch); floors apply; the price uses the dated hourly price claim | Every check passes. A null result with a consistent explanation passes; a large delta with an explanation the evidence contradicts fails. |
| The capstone page (B) | B | Gap Hunt's `attribute` on the owner's pinned pair traces; the roofline form against the card with atlas numbers | As TR3's B artifacts; a roofline answer below the floor is refused with the bound shown (W3-T03) | 3 fresh cases; the form consistent |

**What is never graded here:** the size of your speedup, whether you matched upstream's magnitude, and how fast your GPU is. Credit rewards evidence that holds together.

## 6. Game slot

None of its own. Gap Hunt (TR3) attributes the pair's traces, and Broken Bench's rules of evidence (TR8) govern the replay; The Loop's cost cards give the roofline context (GAMES.md §12).

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| The three pairs | chosen by the owner (O-6), recorded in `course.lock.json` with dates and expected directions | none chosen yet |
| Each side's environment | a locked uv environment per version, under `labs/envs/` (W3-T02) | older vLLM versions ship other CUDA and torch builds; whether they run on an R580+ driver host is [unverified until W3-T02 tests it] |
| The owner's pair traces | captured on the reference 4090 and H100, SHA-256-pinned and dated (W3-T01, extending W2-T21) | none yet |
| Hardware atlas | `content/claims/hardware/*.yaml` (W2-T09) | datasheet bandwidth and peak per precision |
| Prices | RunPod, Lambda and Modal pages read on the run's date, 90-day TTL | the receipt records the price the learner paid as a self-reported note, and the course's claim is the dated public price |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| Async scheduling became the default in v0.14.0 (2026-01-20) | [measured] | vllm M6 | 2026-01-20 | static |
| MRV2 became the default for all models in v0.29.0 (2026-09-09) | [measured] | vllm M1 | 2026-09-09 | static |
| The KV-offload connector arrived in v0.11.0, and v0.12.0 changed its layout | [measured] from the post | vllm K5 | 2026-01-08 | static |
| Upstream magnitudes for the three candidates | [unverified] | sglang W2; vllm M5, K5 | 2025-07 to 2026-03 | shown with their hardware, never as targets |
| A pair that touches CUDA graphs must state the GPU-dependent defaults it ran under | [measured] defaults | vllm M9; sglang G3 | 2026-11-01 | pin |

## 9. Hours

| Part | B | F |
|---|---|---|
| Choosing and predicting | 0.75 | — |
| Environments, runs, captures | — | 6.5 |
| Attribution, explanation, pricing, re-runs | — | 3.5 |
| The capstone page | 1.25 | — |
| **Total** | **about 2** | **about 10** |

All [estimated]. The catalog's figure is 12 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| A pair's environments | each re-pin, and whenever an old wheel stops installing | W3-T02's environment build in `labs.yml` (CPU-only lock check) and the owner's GPU smoke |
| The pairs themselves | yearly, or when a pair's older side can no longer be installed [estimated] | the owner's review at each re-pin |
| Prices | 90 days | the claims' TTLs |

## 11. Open items

1. **The three pairs** are O-6, and nothing ships until the owner picks them and reproduces each once on the reference GPUs.
2. **Flag pairs.** Two of the research's candidates are cleanest as one version with a flag flipped. PLAN.md's Q-4 asks whether that counts as a pinned commit pair.
3. **Old versions on new drivers.** A pair whose older side ships CUDA 12 builds must be shown to run on the R580+ hosts the course's pin needs (vllm R4); W3-T02 tests it.
4. **SGLang pairs.** The research suggests any SGLang pair be built against v0.5.23 or later (sglang capstone notes); edition 1's pairs are vLLM only unless the owner adds one.
