# TR6 · Speculation and structure: the exact rejection sampler, proposers, and the grammar mask's overlap

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr6`. **Hours:** about 8 [estimated]: about 6 in the browser (B) and about 2 on a GPU (F). **Ships in:** W1 for the browser parts and W2 for the proposer lab (D-002, D-039). **Owns:** in-engine speculation (catalog §4). On-Device's SH5 recaps it for draft cost at batch 1. Grammar-engine internals belong to the Data Plane's DP4, and TR6 recaps them in under an hour; Kernels' KN9 owns the kernel that applies the mask.

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm S3) and (sglang O4). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Implement a rejection sampler whose output is exactly the target model's distribution, test that claim properly, write a proposer for the real engine, and show where the grammar mask's CPU work hides under the GPU's. This is the third part of outcome 3, and the mask is part of outcome 2. |
| **Artifacts** | The chi-square exactness lab on your Rust sampler; the mask-overlap timeline (both B); a proposer in the pinned vLLM (F). |
| **Game slots** | The verifier game: working name **The Verifier**, `verifier`, 3D flagship; and the step-loop game's mask lane (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard), T5.L8 above all; T6.L6, T6.L8 and lab 08 strongly advised; TR2 for the mask lane. |
| **GPU** | About 2 h on a 4090-class GPU [estimated]. |

## 1. What it teaches

1. **Where speculation lives in the step.** A proposer drafts k tokens; one target forward verifies k + 1 positions; accepted drafts plus one bonus token come out. In vLLM the verify step's uniform decodes are padded to 1 + `num_spec_tokens` so full CUDA graphs stay eligible (vllm M8, linking TR2).
2. **The rejection sampler, exactly.** Accept a drafted token x with probability min(1, p(x) ÷ q(x)); on rejection, sample from the residual (p − q)⁺, normalised; on full acceptance, sample the bonus from p. The output is then distributed exactly as p (Leviathan, Kalman and Matias, arXiv 2211.17192; Chen et al., arXiv 2302.01318). vLLM's `standard` method "strictly follows" the first paper and applies top-k and top-p to the target's logits first. Greedy decoding accepts exactly when x is p's arg max. An n-gram draft carries no draft probabilities, so q is one-hot: accept with p(x), and recover from p with x removed (vllm S3; GAMES.md §10).
3. **Lossless and lossy methods.** vLLM's `rejection_sample_method` is `standard` (default), `synthetic`, `block` or `fly`. `block` is block verification (Sun et al., arXiv 2403.10444); `fly` is "intentionally lossy" and "does not preserve the target distribution" (vllm S2, S3). SGLang exposes token-wise rejection sampling and block verification as flags (sglang P1).
4. **Testing exactness, with power stated.** Upstream's own check is a chi-squared test with threshold df + 10√(2·df), about ten sigma, which "effectively disallows false positives" and merges bins whose expected count is under 5 (vllm S3). That test rarely fails an honest sampler, and it also has little power against a small bias [estimated, vllm S3 course impact]. TR6's lab states its own significance level and power: two fresh seeds of 20,000 draws at α = 1e-4 each, so an exact sampler fails falsely with probability about 2 × 10⁻⁴ [derived], and every known-wrong sampler must be caught at least 99% of the time at that sample size, measured nightly (A§8.3; W1-T26). A real bug sharpens the point: SGLang PR #35798 (opened 2026-08-21, shipped in v0.5.21) fixed a sampler that drew coins from [0, 1) and compared `coin <= cumulative_probability` (sglang P3).
5. **How long a draft should be.** A round emits on average 1 + α + α² + … + α^γ = (1 − α^(γ+1)) ÷ (1 − α) tokens, and costs one target step plus γ draft steps, so a longer draft pays only while α^(γ+1) outweighs the draft's cost (kernelspace's `push-luck` model). TR6 deepens it with per-position acceptance that decays.
6. **Proposers at the pin.** vLLM v0.33.0's methods: `ngram`, `ngram_gpu`, `suffix`, `draft_model`, `eagle`, `eagle3`, a family of MTP names, `dflash`, `dspark`, `extract_hidden_states` and `custom_class`. Medusa and the MLP speculator were removed in v0.33.0 (vllm S1). A custom proposer is `method="custom_class"` with `speculative_config.model` set to a module path and a `propose()` method; at v0.33.0 that path, like `suffix`, falls back to the deprecated MRV1 runner, and on `main` a per-method registry is replacing the list, so this is the course's highest-churn extension point (vllm S4, M2). SGLang's built-ins are EAGLE, EAGLE3, NEXTN, STANDALONE, NGRAM, DFLASH, DSPARK and UNO, with MTP running through the EAGLE workers and EAGLE-3 recommended (sglang P1).
7. **The grammar mask's four phases.** At v0.33.0: **compile**, asynchronous, while the request waits in `WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR`; **fill**, on the CPU, after `execute_model(non_block=True)` has launched the forward, so it overlaps the GPU (serially up to 128 structured requests, then 16-row tasks on at most 8 threads when no speculative tokens are present [measured at v0.33.0]); **apply**, inside sampling; and **deferral** under async scheduling, where sampling waits until the previous step's tokens are processed (vllm O2). Backends are `xgrammar`, `guidance`, `outlines` and `lm-format-enforcer`, the last deprecated for removal in v0.35.0, with `auto` choosing per request (vllm O1).
8. **SGLang's answer key for the mask.** For EAGLE, STANDALONE and the DFlash family, the grammar state machine advances inside `verify()` behind a "grammar barrier"; the non-speculative path delays sampling because it depends on the previous batch; NGRAM falls back to a synchronous path (sglang O3, O4).

**Knowledge components** (proposed; W1-T03 writes them):

| KC | Requires |
|---|---|
| `tr6.verify-shape` | `ks:t5.speculative-decoding`, `tr2.capture-padding` |
| `tr6.exact-acceptance` | `ks:t5.speculative-decoding` |
| `tr6.residual-recovery` | `tr6.exact-acceptance` |
| `tr6.exactness-testing` | `tr6.residual-recovery` |
| `tr6.acceptance-length` | `ks:t6.spec-acceptance` |
| `tr6.proposer-families` | `ks:t6.self-drafting` |
| `tr6.mask-phases` | `ks:t6.grammar-masks` |
| `tr6.mask-overlap` | `tr6.mask-phases`, `tr2.async-overlap` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR6 takes from it |
|---|---|---|
| Lesson | T5.L8 "Speculative Decoding & Chunked Prefill" (`t5.l8`), with "Count the tokens of a speculative round" | The idea and the round's accounting (`t5.speculative-decoding`). |
| Lesson, exercise | T6.L6 "Speculative Decoding in Production: MTP, EAGLE, and the Acceptance Economy" (`t6.l6`), with the `push-luck` Fleet exercise | Acceptance economics (`t6.spec-acceptance`) and self-drafting (`t6.self-drafting`); the exercise's speedup formula, which The Verifier's `gamma` level deepens. |
| Lesson, lab | T6.L8 "Agents, Structured Output, and Cache Locality" (`t6.l8`); lab 08 `xgrammar-lite` ("The Token Mask Is the Grammar") | The token mask as the grammar (`t6.grammar-masks`): the learner has built the mask, and TR6 asks where its CPU time goes in the step. |
| Lesson | T5.L1 "Transformer Internals for Systems Engineers" (`t5.l1`) | The sampling step at the end of the forward, which TR6's verify step replaces. |

PLAN-100X's gated lab 09, a suffix drafter not planned before 2028-01, would seed TR6's proposer if it ships (catalog §3.5).

**Within enginespace.** TR0 (reading the MRV2 rejection sampler's Triton utilities), TR2 (the verify shape, async scheduling, the step's mask call) and TR8 (the speedup is a benchmark claim and follows TR8's rules).

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Lane |
|---|---|---|---|
| `tr6.l1` | Where speculation lives in the step: draft, verify, the bonus token, the padded shape | 35 | B |
| `tr6.l2` | The rejection sampler, exactly | 50 | B |
| `tr6.l3` | Testing exactness: chi-square, power, and a real bug | 40 | B |
| `tr6.l4` | Proposers: n-gram, suffix, draft model, EAGLE-3 and MTP, and what moved at v0.33.0 | 35 | B |
| `tr6.l5` | The grammar mask's four phases, and its overlap with the forward (DP4's minimal recap inside) | 40 | B |
| — | The Verifier: practice, then graded levels | 60 | B |
| — | Forge lab `rejection-sampler` | 75 | B |
| — | The mask-overlap timeline: The Loop's `mask` level | 30 | B |
| — | Lab `tr6.proposer`, stages s1-s3 | 120 | F |

**Reading at the pin.** MRV1's `vllm/v1/sample/rejection_sampler.py` (1,197 lines) and MRV2's `vllm/v1/worker/gpu/spec_decode/rejection_sampler.py` (479) with `rejection_sampler_utils.py` (1,411, Triton) [measured, vllm S2]; `vllm/config/speculative.py`; `vllm/v1/spec_decode/custom_class_proposer.py`; `vllm/v1/structured_output/__init__.py`; `vllm/v1/core/sched/async_scheduler.py` (vllm O2). SGLang v0.5.23's `speculative/spec_info.py` and the scheduler's grammar paths (sglang O3, O4).

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | "Given p and q for this token, what is the acceptance probability?" "How many tokens per round at these per-position acceptances?" "Does this step's mask fill fit under the forward?" | `predict` |
| **Play** | The Verifier: sculpt or choose an acceptance and recovery rule until the output distribution equals p, then price a draft length (§6). The Loop's mask lane: place the mask's CPU work and see whether it bubbles. | `play` |
| **Build** | The `rejection-sampler` forge lab in Rust (B); then a proposer in the pinned vLLM (F). | `lab-check`, `receipt` |
| **Prove** | With the agent closed: Prove-it v2 on `rejection-sampler` (predict your sampler's accept or reject decisions and its recovered token for a seeded template); The Verifier's `exact` on fresh pairs; "defend your proposer": seeded questions only your receipt's per-step counts answer (ASSESSMENT §7). | `prove` and `play`, `proved` |
| **Keep** | Today draws `tr6.accept-prob`, `tr6.residual`, `tr6.tokens-per-round`, `tr6.best-gamma`, `tr6.mask-fits` and `tr6.which-runner`. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `lab:rejection-sampler` (the catalog's "chi-square exactness lab") | B | Your `.wasm` verify step: accept or reject, then residual recovery | The site drives your module with seeded p, q and drafts (integer weights totalling 2^16, A§5.5) and runs a chi-square goodness-of-fit test of your outputs against p on two fresh seeds of 20,000 draws, at α = 1e-4 each, with the critical values from a generated table (A§5.1). | Neither seed rejects. The bestiary (accept whenever p > q; accept with p/q but resample from p; resample from q; an off-by-one residual; the boundary-inclusive comparison of SGLang PR #35798; a FLy-style lossy rule) must each fail. |
| `play:verifier/exact`, `/chain`, `/gamma` | B | Your rule on fresh pairs; your tokens-per-round prediction; your draft length | The session computes the output distribution exactly in rationals, so `exact` cannot flake (GAMES.md §10, §13) | `exact`: total-variation distance 0 on 3 fresh pairs; `chain`: within ±1% on 3; `gamma`: the best draft length on 3 |
| `play:loop/mask` (the catalog's "mask-overlap timeline") | B | Your prediction of the bubble the mask leaves, on a seeded mix of structured requests | The step-loop model with the mask lane (WORLD §2.8) | Within ±10% of the model's bubble µs on 3 fresh seeds |
| `receipt:tr6.proposer.s1` (first win) | F | vLLM's built-in `ngram` against a plain run on the challenge's prompts | Grader: tie-aware greedy identity between the speculative and plain runs on the same machine (ASSESSMENT §5.7); acceptance statistics from per-step counts | Identity holds; counts consistent |
| `receipt:tr6.proposer.s2` (your proposer) | F | Your n-gram or suffix proposer through `custom_class` | Grader: as s1; the runner that actually ran is recorded (MRV1 at v0.33.0, vllm S4). Browser: recomputes acceptance from raw per-step counts (accepted ≤ proposed at every step; tokens out = accepted + bonus per round) | Every required check passes |
| `receipt:tr6.proposer.s3` (the speedup claim) | F | Paired plain and speculative runs on the challenge's workload | Browser: recomputes the TPOT ratio with a seeded bootstrap interval from raw records, and refuses a ratio computed across different runners or async settings (below) | The claim follows from the records; credit does not depend on the speedup's size |

The module counts as complete when the forge lab, The Verifier's graded levels, `mask`, the exit tickets, s2 and s3 are credited, and a `proved` event exists (ASSESSMENT §9).

**Compare like with like.** At v0.33.0 a `custom_class` proposer runs on MRV1, and on MRV1 async scheduling turns itself off for speculative methods outside EAGLE, n-gram-GPU, draft model, DSpark and DFlash (vllm M6, S4). A plain baseline on the default MRV2 with async scheduling on would fold two other changes into the "speedup". So s3's plain run uses the same runner and async setting as the speculative run, and the receipt records both.

**The extra check for the forge lab, as W1-T27 decided it.** The lab's interface passes the uniform draw u in, as an integer in [0, q(x)), so the host enumerates every u for the accept step and requires that exactly min(p(x), q(x)) of them accept. That makes the accept step's check exact, with no false fails. The walk over the weights gets the same look (each dish is picked by exactly its weight of the draws), and so do rounds in which no coin matters (a plate that p rules out is sent back for sure). The whole round stays under chi-square, which is the only check that can fail an exact sampler.

## 6. Game slots

**The verifier game.** Working name **The Verifier**, id `verifier`, 3D flagship with a 2D path and a DOM mirror (GAMES.md §10).
- **The rule is the concept.** Accept a draft with probability min(1, p/q) and recover from (p − q)⁺, and the output is p exactly. An exact residual is the only way to reach zero total variation.
- **Levels the module uses** (GAMES.md's working ids): `overlap`, `greedy-ngram` and `mutants` for practice; `exact`, `chain` and `gamma` graded.
- **Scene, in objects only.** Depth carries the draft chain; each row holds the draft distribution q, the target p and their overlap min(p, q) as bar skylines, with the residual as a separate volume; drafted tokens ride a rail into depth, and accepted ones drop into an observed skyline that converges batch by batch. Cameras: establish down the chain; compare q and p side by side.

**The step-loop game's mask lane.** The Loop (`loop`), level `mask` (GAMES.md §3.2): a CPU lane for the bitmask fill beside the GPU's forward, with compile waits and async deferral; the learner predicts whether the fill fits under the forward or leaves a bubble, and by how much.

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM | v0.33.0 (`4ba787ec…324da5`) | the samplers, speculative config, `custom_class`, structured output |
| vLLM docs | `docs.vllm.ai/en/v0.33.0/features/speculative_decoding/` and its `fly.md` | versioned (vllm R5) |
| SGLang | v0.5.23 (`297e54fd…6f90`) | speculative algorithms, flags, grammar overlap |
| xgrammar | 0.2.8 in env `vllm`; 0.2.7 in env `sglang` | the engines' pins, not PyPI's newest (A§4.4; sglang P4) |
| Papers | arXiv 2211.17192 (Leviathan, Kalman and Matias, 2022-11-30 v1); arXiv 2302.01318 (Chen et al., 2023-02-02); arXiv 2403.10444 (Sun et al., block verification) | static |
| A small proposer target model | Qwen3-0.6B at TR0's pinned revision, unless W2-T35 finds the n-gram path needs a longer-context model | shared with TR0 and TR3 |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| vLLM v0.33.0's speculative methods; Medusa and the MLP speculator removed | [measured] | vllm S1 | 2026-11-01 | 14 days |
| The samplers' locations and sizes, and the four `rejection_sample_method` values | [measured] | vllm S2 | 2026-11-01 | pin |
| `standard` strictly follows arXiv 2211.17192; `fly` is intentionally lossy; upstream's test is chi-squared at about ten sigma with merged bins | [measured] | vllm S3 | 2026-11-01 | pin |
| `custom_class` and `suffix` fall back to MRV1 at v0.33.0; a per-method registry replaces the list on `main` | [measured] | vllm S4 | 2026-11-03 (`main`) | 14 days |
| Async scheduling is auto-off on MRV1 for speculative methods outside the named list | [measured] | vllm M6 | 2026-11-01 | pin |
| Structured-output backends; `lm-format-enforcer` removal planned for v0.35.0 | [measured] | vllm O1 | 2026-11-01 | 14 days |
| The mask's compile, fill, apply and deferral phases, with the 128-request and 16-row thresholds | [measured] | vllm O2 | 2026-11-01 | pin |
| SGLang's speculative algorithms and verifier flags | [measured] | sglang P1 | 2026-11-02 | 14 days |
| SGLang's docs table: 158.34, 244.10 and 373.25 tok/s for baseline, EAGLE-2 and EAGLE-3 on one H100 | [unverified], vendor-reported | sglang P2 | undated | sanity reference only |
| SGLang PR #35798's boundary bug | [measured] (title and diff summary; the page was truncated) | sglang P3 | 2026-08-21 | static |
| SGLang's grammar barrier, delayed sampling and NGRAM fallback | [measured] | sglang O3, O4 | 2026-11-02 | 14 days |

## 9. Hours

| Activity | B | F |
|---|---|---|
| Lessons `tr6.l1`-`tr6.l5` | 3.3 | — |
| The Verifier | 1.0 | — |
| `rejection-sampler` | 1.25 | — |
| `mask` | 0.5 | — |
| `tr6.proposer` s1 (0.5), s2 (0.75), s3 (0.75) | — | 2.0 |
| **Total** | **about 6** | **about 2** |

All [estimated]. The catalog's figure is 8 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| The `custom_class` extension point and the MRV1 fallback | 14 days, the highest churn in the course | `custom_class_proposer.py`, the MRV2 fallback list and the `speculator_config.py` registry at the new tag; the per-pin shim in `labs/gpu/tr6-proposer/starter/` |
| The method list | 14 days | the `SpeculativeMethod` literal (vllm §6) |
| The samplers and their methods | pin | the `RejectionSampleMethod` literal (vllm §6) |
| Structured-output backends and thresholds | 14 days | the `StructuredOutputsBackend` literal and `fill_bitmask_parallel_threshold` (vllm §6) |
| SGLang's algorithms and grammar overlap | 14 days | `spec_info.py` at the new tag |
| xgrammar pins | 30 days | the engines' requirement files |

## 11. Open items

1. **The proposer's model on a 4090.** An 8B target with an EAGLE-3 draft on a 24 GB card was not checked (sglang TR6 notes); the lab therefore uses an n-gram or suffix proposer with a small target. A learner-chosen EAGLE-3 run is optional reading.
2. **Tie-aware identity** replaces strict token identity for speculative against plain outputs, because different batch shapes can flip near-ties honestly. ASSESSMENT §5.7 defines it; proposed decision D-046 adopts it, and ARCHITECTURE §8.5 and §9.6 and TRACKER W2-T35 now follow it.
3. **The exhaustive accept-step check** in §5 is a proposal for W1-T27.
4. **When the registry lands** (vllm S4), the proposer's starter moves off MRV1, and §5's like-with-like rule is re-checked.
