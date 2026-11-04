# enginespace: evidence and assessment

**Status:** the grading model, proposed for the owner's review. **Date:** 2026-11-03. Nothing here is built.

**What this file owns.** What earns credit and how much: the provenance weights, every pass bar, the checks each lab stage requires, the consistency rules for performance evidence, the threat model, Prove-it, and what is never graded. Three neighbours own the rest:
- [ARCHITECTURE.md](ARCHITECTURE.md) (A§n) owns the formats and mechanics: `receipt@1`, `bundle@1`, `trace@1`, the challenge codec, the grader's commands, the verification pipeline's code and the ledger's stores. Where this file names a field, the schema in A§9.6 is the source.
- [GAMES.md](GAMES.md) designs the games and proposes their pass bars; §4.3 below adopts them, with the differences listed.
- [WORLD.md](WORLD.md) owns the models that compute every key and every recomputation.
Decisions are D-nnn and owner questions O-n in [DECISIONS.md](DECISIONS.md); course-design questions are Q-n in [PLAN.md](PLAN.md) §14. The module files are in [curriculum/](../curriculum/).

**Sources.** `PRODUCT.md` (owner-confirmed 2026-11-03); D-001 and D-010 (2026-11-03); kernelspace `SPECIALIZATIONS.md` §7 (untracked, 2026-10-24); kernelspace at `origin/master` d478f91: `PLAN-100X.md` §5.1 (V1-V6), §5.6 (H4), §5.7 (K1, K2) and §10, `src/lib/learner/provenance.ts`, `src/lib/forge/prove2.ts`, `src/lib/world/fleet-ex/{broken-bench,knee,push-luck}.ts`; statespace at 7b6938c: `docs/ASSESSMENT.md` and `docs/PLAN.md` §7 (receipts never trust an exit code); this workflow's research ([upstream-vllm.md](../research/upstream-vllm.md), [upstream-sglang.md](../research/upstream-sglang.md)), cited by row.

**Tags.** [measured], [derived], [estimated] and [unverified], as in A§0. Every pass bar, tolerance, sample size and seed count here is a design parameter and carries [estimated] once per table or rule; measured values replace them as named tasks record them. Identifiers and counts of named things carry no tag.

---

## 0. The system on one screen

```
                          WHAT THE LEARNER DOES                 WHO CHECKS              WHAT IT CAN EARN
 B  browser      item · game level · trace marks          the site's pure models     unseen / proved
                 on a seed drawn when the attempt starts    (packages/sim, play)       (weight 1.0)
 B  forge        a Rust .wasm built on the laptop          the site drives it with    unseen / proved
                                                           seeded ops, oracle outside
 L  local CPU    TR0's forward pass                        local grader → receipt     gpu-verified (1.0)
 F  GPU          labs on the learner's own or rented GPU   → browser re-checks and    or assisted (0.3)
                                                           recomputes from raw data   or gpu-unverified (0)
```

Eight rules carry the design:
1. **Checks a typed number cannot fake.** Fresh seeds in the browser, an oracle outside the learner's code, references on the learner's machine, and performance evidence that must agree with itself and with physics (D-001, D-010).
2. **Count, don't time.** No browser timing is graded (catalog §7). GPU timings are graded for consistency only, never for speed.
3. **Unseen, not secret.** A graded seed is drawn at grade time and is not hidden from the learner; the key is computed then and stored nowhere (kernelspace S3).
4. **The real engine is the judge.** The browser world teaches; a GPU receipt confirms (D-012).
5. **Weights apply at read time** and are never stored, so a weight change rewrites no history (kernelspace's `provenance.ts`).
6. **Nothing locks.** Prerequisites advise; a learner can always practise (A§1, I9).
7. **Agents are allowed; credit needs the learner.** Provenance flags are self-reported, and each module's Prove step is taken with the agent closed (§7).
8. **Honest about limits.** A zero-server design cannot stop a determined forger, and the course issues no credential to third parties (§12).

## 1. Principles and their grounds

| Principle | Ground |
|---|---|
| Credit comes only from deterministic checks; no LLM-graded credit, no grading server, no graded browser timing | D-010; PLAN-100X §10 ("Runtime LLM-generated items; LLM-graded XP, rings or credentials": LLM raters agree only at α 0.52-0.65 before deliberation, as cited there [unverified here]) |
| GPU work is graded | D-001 retires the catalog's "field evidence at weight 0" for this course |
| A receipt never trusts an exit code, a `pass` flag or a summary field alone | statespace's receipts rule; A§1, I6 |
| Clicks earn nothing | PRODUCT.md; PLAN-100X V5 (`m` stops paying) |
| Item options are keyed by id, shuffled, and each carries a "why"; a test-wiseness lint bounds blind strategies | PLAN-100X V1 |
| Help past a point is credited as assisted until an unseen pass | PLAN-100X H3, V6 |
| Prove-it is the defence against agents doing the work | PLAN-100X H4, V6 (cited there: Bastani 2025 and Shen & Tamkin 2026 for the harm of substitution) |

## 2. Lanes, and what each can credit

| Lane | Where the work runs | What is checked | Event kinds | Provenance on a pass |
|---|---|---|---|---|
| **B**, browser | the tab | items, graded game levels, trace marks, predictions | `item`, `play`, `trace-mark`, `predict` | `unseen`, or `proved` in Prove mode |
| **B**, forge | Rust on the laptop, built to wasm, graded in the tab | host-driven property tests on fresh seeds (A§8.3) | `lab-check`, `prove` | `unseen`; `proved` for Prove-it v2 |
| **L**, local | the laptop's CPU (TR0's forward) | the local grader against references, then the browser | `challenge`, `receipt` | `gpu-verified` (the name covers L too; §14, item 1) |
| **F**, GPU | the learner's own or a rented GPU | the local grader against references, then the browser | `challenge`, `receipt` | `gpu-verified` |

A learner with no GPU can reach every module's browser-complete state (§9).

## 3. Evidence events and provenance

### 3.1 Event kinds

The envelope and kinds are A§7.2's: `predict`, `item`, `play`, `lab-check`, `prove`, `trace-mark`, `challenge`, `receipt`, `review` and `ack`. Reading, opening and watching write nothing (A§1, I2). The front page writes nothing at all (D-038).

### 3.2 Provenance and weights

This table answers A§7.3's "the weights are ASSESSMENT.md's call" and O-10's default. The weights are kernelspace's (`provenance.ts`: 1.0 for full credit, 0.3 for partial, 0 otherwise) [measured at d478f91], carried over as a design choice [estimated].

| Provenance | Weight | Stamped when |
|---|---|---|
| `unseen` | 1.0 | a graded browser attempt on a seed drawn at grade time, passed, with no hint past rung R2 and no context packet used for it |
| `proved` | 1.0 | a Prove attempt (§7), passed, with the learner's attestation that their agent was closed |
| `gpu-verified` | 1.0 | a receipt whose required checks all pass, each either re-checked in the browser or attested by a grader build the site published, with every pin on, and whose self-declared provenance is `assisted: none` or `assisted: explain` with `agent: false` |
| `practice` | 0.3 | a pass on a practice seed, a seed already seen, or an authored item seen before |
| `assisted` | 0.3 | help past rung R2, a context packet, a "bottom-out" walkthrough, or a receipt that would be `gpu-verified` but self-declares `assisted: code` or `agent: true`. It stays 0.3 until an `unseen`, `proved` or `gpu-verified` event on the same KCs passes unassisted (PLAN-100X H3). |
| `gpu-unverified` | 0 | a receipt with any required check failing, an unknown grader build, an off-pin environment, or a broken binding; shown with its reasons, never credited |
| `self-reported` | 0 | anything typed without a check: an issue's URL, a price paid, a note |

**O-10, answered by default.** Grader-attested correctness counts at full weight when every browser-runnable check also passes, as DECISIONS.md proposes. The receipt's detail page marks each check "re-checked here" or "attested by grader x.y.z" so the learner sees which is which (§5.8).

### 3.3 Derived states

All are computed at read time from events and content; nothing is stored (kernelspace's rule, A§7).

| State | Definition |
|---|---|
| KC **practised** | any event mapped to the KC, at any weight |
| KC **earned** | at least one weight-1.0 event mapped to it |
| KC **kept** | a correct `review` or graded item on a fresh seed at least 30 days after it was earned, unassisted |
| **VRK₃₀** (the north star) | the number of KCs answered correctly, unassisted, on unseen seeds, at least 30 days after first learning, counted on the learner's device (kernelspace PLAN-100X §1; statespace's PLAN §3.2) |
| Module **browser-complete** | every B artifact of the module credited (§9) |
| Module **complete** | every required artifact credited, including its L or F stages, and at least one `proved` event for the module |

## 4. Browser checks on seeds drawn at grade time

### 4.1 Seeds, bands and blind strategies

- **The seed.** A graded attempt draws its seed with `crypto.getRandomValues` when it starts (A§8.2). Practice seeds are pinned per level.
- **Bands.** `band(seed)` rejects degenerate draws so each seed is a fair question: the naive strategy loses, the reference passes, and the answer is not a coin flip between neighbours. Each game's band acceptance is measured and printed by its tests, with a floor of 20% of candidates (GAMES.md §2.1, kernelspace's EPLB floor) [estimated floor].
- **Answer first.** Where a learner picks one of a few answers, the draw picks the answer first and then a scene that yields it (kernelspace's D39 rule in `knee.ts` and `broken-bench.ts`).
- **The blind-strategy bound.** For every graded level and item family, the best scene-blind strategy (a constant per label, "always the longest option", "everything on") must pass a single seed at most 15% of the time [estimated], so it passes three fresh seeds in a row at most 0.34% of the time [derived: 0.15³]. `verify:items` and `verify:games` measure it and fail the build above the bound (A§10.2).

### 4.2 Items

- **The contract** is kernelspace's K1: a pure `Gen {kcs, make(seed, level), grade(answer), solution, band}`, with keys computed at grade time and never present in the Markdown export (A§4.6).
- **Shapes:** numeric with a tolerance and a ratio diagnosis ("exactly 2×: you priced FP16"), choice with shuffled id-keyed options and a "why" on each, interval answers scored by log score, and constructed answers checked by a model (a stride tuple, a lifecycle stage list).
- **Tolerances** are per family [estimated]: exact for integers and identifiers, relative 2% for arithmetic on given numbers, and the family's stated band for model predictions.
- **Confidence.** A guess, think-so or sure tap feeds the Mirror's calibration and Today's scheduling, and never gates (kernelspace V2).
- **Exit tickets.** A lesson ends with 3 items on fresh seeds; it is passed with at least 2 right, at least 1 of them numeric or constructed. A miss offers new numbers or "continue anyway", recorded as read, not passed (kernelspace V5).

### 4.3 Graded game levels

- **Replay is the grade.** A run is `{seed, level, actions[], rev}`; grading replays the actions through the pure session at grade time, so an edited score in IndexedDB changes nothing (A§6.3).
- **Graded levels** have no undo, show no live readouts where the level says so, and are never timed (GAMES.md §2.3).
- **Unsafe moves.** The Switchyard lets a learner break the connector contract on purpose. In a graded level a violation is allowed and scores that attempt 0; it is never prevented. This answers GAMES.md open question 5.
- **Phones.** Graded trace attribution by list, on a phone, uses the same nanosecond rule and counts the same. This answers GAMES.md open question 4.

**Pass bars.** Each needs 3 fresh seeds unless stated, and all values are [estimated]. They adopt GAMES.md's proposals except where the last column says otherwise.

| Module | Level (GAMES.md's working id) | Pass | vs GAMES.md |
|---|---|---|---|
| TR0 | `shape-shifter/fewest` | copies made equal the fewest-copies ghost's | same |
| TR0 | `shape-shifter/grid` | every element covered exactly once, with the least masked waste | same |
| TR1 | `engine-floor/map` | the whole path right on its first run, every stage matched to a span in order | same |
| TR2 | `loop/graphs` · `sizes` | capture cost at most 1.05 × the exact optimum | same |
| TR2 | `loop/graphs` · `modes` | the reference's mode | same |
| TR2 | `loop/close` | useful tokens per GPU-ms at least 97% of the reference's, and zero dependency violations | adds the violation rule |
| TR3 | `gap-hunt/gap` | the largest gap and its cause event right | same |
| TR3 | `gap-hunt/attribute`, `gap-hunt/pinned` | at least 95% of the window's ns in the right category, and the cause right; `pinned` draws from at least 3 distinct traces | adds the distinct-traces rule |
| TR4 | `dispatch/pick` | pick and fallback right on 3 of 3 fresh cards | same |
| TR5a | `pool/evict`, `pool/adapters`, `pool/manager` | score at least 0.95 | same |
| TR5b | `switchyard/load-or-recompute`, `/publish`, `/yard` | zero violations and a score of at least 0.95 | same |
| TR6 | `verifier/exact` | total-variation distance exactly 0 (computed in rationals) | same |
| TR6 | `verifier/chain` | the tokens-per-round prediction within ±1% | same |
| TR6 | `verifier/gamma` | the best draft length | same |
| TR6 | `loop/mask` | the predicted bubble within ±10% of the model's | same |
| TR8 | `broken-bench/due`, `/warm`, `/sure` | right on each seed | same |
| TR8 | `broken-bench/court` | at least 4 of 5 cases with the flaw right and a p99 within ±15% whose interval contains the recomputed value and is at most 2 × the bootstrap interval's width; each session has a latency-from-due case and a small-sample case | same |

### 4.4 Trace tasks

- **Synthetic traces** have exact ground truth from the model that generated them (A§5.7).
- **Owner-pinned traces** are graded against the owner's annotations, reviewed before publication (W2-T21), and against the same partition rule, which the browser computes from the trace itself. Where the owner's annotation and the computed partition disagree, the trace is withdrawn from graded draws until fixed.
- **The rule** is GAMES.md §6's partition: within a step window, GPU-busy (kernel or copy-only), CPU-gap and both-idle sum to the window exactly, in integer ns; overlap is reported beside the partition. A gap's cause is read off the launch queue.

### 4.5 Forge labs

- **The oracle is outside the learner's code.** The site drives the module through `ks_invoke` with seeded operation batches (the invoke protocol) and checks every reply against `packages/sim` (A§8.3, D-025). The crate's own `ks_run` checks back `cargo test`, so the terminal and the site agree.
- **A pass** is every required check green on seeds drawn at grade time, in one run, each check in a fresh instance with a 2 s timeout (kernelspace F1) [estimated timeout]. It is stamped `unseen`, with `wasmSha256` and the seeds on the event.
- **References earn nothing.** A `--features reference` build names itself `<lab>@reference` and is refused credit.
- **Bestiaries.** Every lab ships wrong modules that must each fail a named check, and CI fails if one passes (A§5.10, `verify:labs`).

| Lab | Required checks |
|---|---|
| `hybrid-kv` (TR5a) | stages s1-s6 of [TR5a §5](../curriculum/TR5a-hybrid-kv-and-adapter-pages.md): per-group paging and hashing, sliding release, state pages, the N-group hit, adapter pages, and the invariants after every op of the gauntlet |
| `kv-publisher` (TR5b) | stages s1-s6 of [TR5b §5](../curriculum/TR5b-offload-connector-events.md): the reference consumer's view equals the truth after every batch, with ordering, replay, reset, chunk repeats, adapter ids, and drops, duplicates, reorders and a restart |
| `rejection-sampler` (TR6) | chi-square goodness of fit on two fresh seeds of 20,000 draws, α = 1e-4 each, neither rejecting (A§8.3) [estimated parameters]; the bestiary of [TR6 §5](../curriculum/TR6-speculation-and-structure.md) must each fail |

### 4.6 Statistical checks and their error rates

| Check | False-fail rate for an honest learner | Detection | How it is measured |
|---|---|---|---|
| `rejection-sampler`'s chi-square | about 2 × 10⁻⁴ per attempt [derived: 1 − (1 − 10⁻⁴)²] | each bestiary member caught at least 99% of the time at 20,000 draws [estimated target] | 200 seeds per PR, 10,000 nightly (W1-T26) [measured once built] |
| Bootstrap intervals (TR8, recomputation) | a deterministic recomputation, so none | the nominal 95% interval covers within [93%, 97%] over 2,000 seeds [estimated tolerance] | W1-T31 |
| Everything else in the browser | none: the checks are exact | — | golden vectors |

A false fail never subtracts anything: the learner re-runs on fresh seeds at once, and the Mirror shows the attempt as "check failed, retry" rather than as a miss.

### 4.7 Predictions

A `predict` event is scored at reveal: numeric within the prediction's tolerance, an interval by log score, or a choice. Predictions feed the Mirror's calibration and Today's scheduling. They move no completion and no weight-1.0 credit, because a prediction made after seeing a related result cannot be told apart from one made before. A GPU-lane prediction is committed in the browser when the challenge is issued and scored against the receipt's recomputed numbers.

## 5. The local grader and its receipts

### 5.1 What it is

`enginespace-grader` is a Python package with an `enginespace` command (A§9). It runs on the learner's machine: on the laptop's CPU for TR0, and on the learner's own or a rented GPU for every F lab. It checks correctness against references, captures performance evidence, and writes one bundle file. It sends nothing anywhere except pinned downloads, which carry a generic User-Agent and no identity (A§9.7). `enginespace doctor` prints exactly the fields a receipt would record before any `grade` run writes them (A§9.9).

### 5.2 The flow

1. **Issue.** On `/receipts` (or a lab page) the learner picks a lab and stage and gets a challenge token; any predictions the stage asks for are committed in the same moment. The browser records a `challenge` event.
2. **Run.** On their machine: `enginespace grade <lab>.<stage> --challenge <token>`. The grader derives every seeded input from the token with the same generators as the site (A§9.8), runs the stage, checks correctness against references, captures traces and logs, and writes `receipts/<lab>-<stage>-<utc>.es.json.gz`.
3. **Import.** The learner drops the file on `/receipts`. A worker verifies it (§5.8) and the ledger gets a `receipt` event with the verdict's provenance.

### 5.3 The challenge

The token is `es1:<lab>.<stage>:<seed, 8 hex>:<nonce, 16 base32>:<issued YYYYMMDD>:<fnv32, 8 hex>` (A§8.4). Its FNV-1a checksum catches typos and is not security. It is single-use, binds to the issuing device's ledger, and expires after 14 days [estimated]. A copied token works on a rented GPU, which is the point.

### 5.4 The receipt's fields

The schema is A§9.6's `receipt@1`. What each field is for in grading:

| Field | Holds | Used for |
|---|---|---|
| `schema`, `lab`, `stage` | identity | routing to the stage's required checks (§5.9) |
| `challenge` | token, seed, nonce, issue date | binding: the browser re-derives the seeds and matches an unused, unexpired `challenge` event in its own ledger |
| `createdAt` | UTC time | display; expiry |
| `grader` | name, version, `sourceSha256` | identity against the list of grader builds this site published (W2-T10) |
| `environment` | the fingerprint (§5.6) | pins, floors, the GPU class for tolerances, the effective engine configuration |
| `pins` | `lockSha256`, `envLockSha256`, `onPin`, `offPin[]` | the pin check |
| `inputs[]` | model, dataset, prompts and references, each with a revision, SHA-256 and size | that the run used the pinned inputs |
| `artifacts[]` | outputs, traces, benchmark logs, sweeps, event logs, counts, reports, patches and logs, each with a SHA-256, a size and whether it travels in the bundle | integrity, then re-checks and recomputation |
| `checks[]` | the grader's results: id, kind (correctness, property, environment), pass, value, bound, tolerance, n, detail, reference hash | attested checks; the browser re-runs every one it can |
| `performance` | what the run claimed | always recomputed from raw artifacts; never trusted |
| `provenance` | `assisted: none \| explain \| code`, `agent`, `guard` | self-reported; selects `gpu-verified` or `assisted` (§3.2) |
| `notes` | plain text, at most 2,000 characters | shown as text; never graded |
| `ext` | anything else | ignored by verification |

### 5.5 What is hashed

All hashes are SHA-256 unless stated.

| What | Over what bytes | Where it lives | What it defends |
|---|---|---|---|
| Each artifact | its canonical bytes (canonical JSON for JSON artifacts, A§9.8) | `artifacts[].sha256` | editing an artifact after the run |
| The receipt | its canonical JSON | the ledger's `receiptSha256`, the `/receipts#<sha256>` fragment | identity and de-duplication |
| The grader | its package's files, sorted by path, path and bytes together | `grader.sourceSha256`, compared with the site's published list | an unknown grader build (§12 states the limit) |
| The course lockfile and the engine environment's lockfile | the files | `pins.lockSha256`, `pins.envLockSha256` | an off-pin environment |
| The installed engine | the distribution's `RECORD`, plus a re-hash of every installed file against it | `environment.engine` | a locally patched engine; any modified file outside a declared extension point makes the run off-pin |
| Inputs | each file; the prompts as canonical JSON | `inputs[].sha256` | a different model, dataset or prompt set |
| The learner's code | the connector, proposer or fork as a patch artifact | `artifacts[]` (kind `patch`) | describing the artifact; the Evidence Pack shows it |
| KV blocks (TR5b) | each block's bytes at save and at load, through the kit's probe store | a counts artifact | byte identity of the round trip |
| Forge modules | the `.wasm` file | the `lab-check` event's `wasmSha256` | Prove-it v2 asks about the module that was just graded |
| Game runs | the action log | the `play` event's `actionsSha256` | replay grading |
| Owner traces and references | raw and normalised files | the references manifest (A§9.7) | pinned ground truth |

The challenge's FNV-1a checksum is the one non-SHA value, and it guards against typos only.

### 5.6 The environment fingerprint

**Collected** (A§9.5): the GPU's name, memory, compute capability, SM count, maximum clocks, power limit, PCIe generation and width, MIG, ECC and virtualisation modes; the driver and CUDA driver versions; torch, its CUDA and cuDNN; the engine's name, version, commit and `RECORD` hash; flashinfer, xgrammar, triton and transformers versions; Python, OS, kernel, architecture, CPU model, cores and RAM; whether it runs in a container; a self-declared host kind (`local`, `runpod`, `modal`, `lambda`, `other`); and environment variables on the lab's allowlist only.

**Added for engine labs** (this file's requirement on W2-T03), read from the engine's own log and configuration dump: the runner that actually ran (MRV2, or MRV1 after the "Model Runner V2 does not yet support …" warning, vllm M2), the effective CUDA-graph mode after any downgrade (vllm G7), async scheduling on or off (vllm M6), the attention backend selected (vllm E2), and `max_num_batched_tokens` and `max_num_seqs`, which differ by GPU for the same command (vllm M9).

**Never collected:** hostname, user name, IP or MAC addresses, the GPU's UUID or serial, absolute paths, tokens or keys (`HF_TOKEN` never enters a receipt), or the full environment (A§9.5).

**The device name is the truth.** A rented "H100" may be an H200 on Modal unless `"H100!"` was requested (sglang C4); the receipt records what NVML reports, and floors and tolerances follow it.

### 5.7 Correctness checks against references

| Kind | Used by | Rule [estimated parameters] |
|---|---|---|
| **Same-CPU fp32 match** | TR0 | the learner's logits against Hugging Face transformers in fp32 on the same CPU in the same environment: max absolute difference ≤ 1e-3 (the catalog's bar), with an import guard that refuses delegation to `transformers.models` |
| **Teacher-forced agreement** | TR1, TR3, TR4, TR5b, TR7, TR8, capstone | the grader feeds each prompt plus the owner's reference continuation and requires every reference token to be in the learner engine's top 5, and its log-probability within a tolerance set per GPU class and dtype from the owner's fixtures (W2-T12) at 99% or more of positions. Greedy outputs drift across GPUs, kernels and batch shapes, so a free-running exact match against another machine's bank is never required (D-028). |
| **Tie-aware same-machine identity** | TR1 s2 (instrumentation changes nothing), TR6 (speculative against plain) | two runs on the same machine and seeds at temperature 0, compared sequence by sequence. A sequence passes if identical, or if at its first mismatch the first run's top-2 log-probability gap is at most 0.05 nats, a near tie that a different batch shape can flip; any larger gap fails. The stage passes when every sequence passes and at most 5% are tie-diverged. A§8.5 and A§9.6 now use it in place of strict token identity (D-046). |
| **fp32 SDPA reference** | TR4 s2 | each backend's attention output against fp32 scaled dot-product attention on the same GPU, within per-dtype tolerances W2-T26 records |
| **Upstream unit tests at the pin** | TR5b | a fixed subset of `tests/v1/kv_connector/unit/` run against the learner's connector; the test log is an artifact |
| **Byte identity through a probe** | TR5b | every KV block's hash at load equals its hash at save |
| **Engine integrity** | every engine lab | the installed engine's files match its `RECORD`; extension points live outside the engine package |

### 5.8 How the site imports and verifies, with no server

A worker runs A§8.5's ten rules in order and stores the parsed receipt and its report in the learner's IndexedDB; the raw artifacts stay in the learner's file.

1. **Caps:** at most 32 MB compressed and 256 MB decompressed [estimated], counted while `DecompressionStream('gzip')` runs, so a zip bomb aborts.
2. **Schema:** strict zod validation of `bundle@1` and `receipt@1`.
3. **Integrity:** every artifact's SHA-256 recomputed with `crypto.subtle`.
4. **Binding:** an unused, unexpired `challenge` event for this lab and stage in this ledger, and seeds equal to those derived from the token.
5. **Grader identity:** the version and `sourceSha256` on the site's published list.
6. **Pins:** engine and key libraries equal to `course.lock.json`, unless the lab declares a version compatible.
7. **Correctness re-checks the browser can run:** TR0's argmax ids against the pinned bank; TR5b's event stream through `tiers`; TR6's per-sequence identity results and acceptance counts; TR1's span order against the learner's own map; TR4's recorded errors against tolerances.
8. **Recomputation of performance evidence** with `packages/sim/bench` and `packages/sim/trace` (§6).
9. **Physics floors** from the hardware atlas (§6.4).
10. **Verdict:** per check `pass`, `fail` or `attested`, each shown with its bound and a badge, "re-checked here" or "attested by grader x.y.z". The verdict is computed at read time and re-derived when the rules change, so the receipt never stores it (statespace's rule).

### 5.9 Required checks per stage

"R" is re-checked in the browser; "A" is attested by the grader. Stages marked optional earn practice credit only. Every stage also requires rules 1-6 of §5.8.

| Stage | Required checks | Optional |
|---|---|---|
| `tr0.forward.s1` | — (practice) | A: layer-0 hidden states ≤ 1e-4 |
| `tr0.forward.s2` | A: logits ≤ 1e-3 against fp32 transformers, import guard; R: argmax ids at the bank's positions | — |
| `tr0.forward.s3` | A: cached decode logits ≤ 1e-3 against full recompute; cache lengths | — |
| `tr1.fork.s1` | A: teacher-forced agreement | — |
| `tr1.fork.s2` | A: tie-aware identity with s1; teacher-forced agreement. R: span names and order equal the nano-vllm path the learner laid in The Engine Floor's `nano` level, which is the pinned lifecycle data; trace rules T1-T5 | — |
| `tr1.fork.s3` | — | R: the preemption path's spans |
| `tr3.profile.s1` | — (recorded only) | the `ncu` probe, never a gate |
| `tr3.profile.s2`, `.s4` | A: teacher-forced agreement for both runs. R: runner and effective graph mode from the logs; T1-T10; floors P1; cross-checks X1, X4, X5 | — |
| `tr3.profile.s3` | R: partitions recomputed exactly; the learner's categories cover at least 95% of each window's ns correctly; causes right; the finding's numbers equal the recomputed ones | — |
| `tr3.profile.s5` | — | R: T-rules or B-rules as captured |
| `tr4.sweep.s1` | A: each backend run starts and agrees. R: selected backend and effective mode from the logs | — |
| `tr4.sweep.s2` | A: every backend within tolerance on every shape; R: the recorded errors against the tolerances | — |
| `tr4.sweep.s3` | R: medians and bootstrap intervals recomputed from raw repeats; floors P4; the ranking consistent with the intervals | — |
| `tr4.sweep.s4` | — (its own KC at full weight; not required for completion, PLAN Q-1) | as s2 and s3 |
| `tr5b.connector.s1` | A: the upstream subset with `ExampleConnector` | — |
| `tr5b.connector.s2` | A: `SupportsHMA`; the upstream subset against the learner's connector; teacher-forced agreement. R: byte identity from the probe log; loaded-token counts | — |
| `tr5b.connector.s3` | A: failed blocks reported and recomputed; agreement. R: the failure log against the injected failures | — |
| `tr5b.connector.s4` | — | R: event replay through `tiers` |
| `tr6.proposer.s1` | A: tie-aware identity; R: acceptance counts | — |
| `tr6.proposer.s2` | A: tie-aware identity. R: acceptance counts (accepted ≤ proposed at every step; tokens out = accepted + bonus per round); the runner recorded | — |
| `tr6.proposer.s3` | R: both runs pass B1-B14; same runner and async setting on both sides; the TPOT ratio and its interval recomputed | — |
| `tr7.reproduce.s1` | R: the target's B-rules or T-rules; the configuration diff shown; floors. A: teacher-forced agreement where a model is served | — |
| `tr7.reproduce.s2` | R: every required draft field present for the target project and equal to s1's numbers | — |
| `tr8.replay.s1` | — (practice) | R: B1-B3 |
| `tr8.replay.s2` | R: B1-B14 and floors P3. A: teacher-forced agreement on a sample of outputs | — |
| `tr8.replay.s3` | — | R: vLLM's result identities (B11) |
| `capstone.pair.s1` | per side, everything `tr8.replay.s2` and `tr3.profile.s2` require; R: X2 (the sides differ only in the pair's change) and per-side pins | — |
| `capstone.pair.s2` | R: every number in the form equals the recomputed one; the mechanism's consistency rules ([CAPSTONE §5](../curriculum/CAPSTONE.md)); floors; the price claim dated | — |

## 6. Consistency checks for performance evidence

The browser recomputes every summary from raw records and requires agreement within the stated rounding (A§8.5 rule 8). All tolerances are [estimated] until the owner's fixtures (W2-T12) measure honest runs against them.

### 6.1 Traces (`trace@1`)

| Id | Rule |
|---|---|
| T1 | **Schema and size.** The trace validates, fits the caps, and names its engine, version, GPU and capture time; a learner's trace is not marked synthetic. |
| T2 | **Monotonic time.** Every span starts at or after 0 and has a non-negative duration; step marks strictly increase; every span ends inside the trace window. |
| T3 | **One stream, one kernel at a time.** Spans on one GPU-stream track do not overlap. |
| T4 | **Launch before kernel.** Every GPU span with a correlation id has a CUDA-API span with the same id on a CPU thread that starts no later than the kernel; a graph launch precedes its nodes. This also catches a shifted clock domain. |
| T5 | **Containment.** Every kernel lies inside exactly one step window. |
| T6 | **Step count.** The number of step windows equals the stage's declared count (for vLLM, the challenge's `max_iterations`, vllm P1). |
| T7 | **The partition sums.** In every window, GPU-busy + CPU-gap + both-idle equals the window's length exactly, in integer ns, and so must any attribution the learner submits. |
| T8 | **The configuration shows.** With graphs on, decode steps contain graph launches; with graphs off, none. The runner and graph mode in the trace agree with the fingerprint. |
| T9 | **Floors** (§6.4, P1) on every decode step. |
| T10 | **Pairs match.** The two traces of a toggled pair share the workload's hash and seeds. |

### 6.2 Benchmark logs

A log is one row per request: id, due time (the intended send), actual send, first token, last token, prompt tokens, output tokens and status, in integer ns, optionally with per-chunk token counts.

| Id | Rule |
|---|---|
| B1 | **Schedule binding.** The ids, due times and prompt lengths equal those the browser re-derives from the challenge with the shared generators (A§9.8). A run on other seeds fails here. |
| B2 | **Counts.** Completed + failed + aborted equals the scheduled count; no duplicate ids; every summary count equals the row count. |
| B3 | **Per-request order.** Due ≤ sent ≤ first token ≤ last token; a completed request has at least one output token; recorded chunk counts sum to the output tokens. |
| B4 | **Arrival adherence.** In an open-loop run, sent − due is at most 2 ms for at least 99.9% of rows and at most 20 ms for all [estimated]. A run that falls further behind is coordinated omission and fails. |
| B5 | **Latency from the due time.** TTFT and end-to-end latency are measured from the due time; latencies from the actual send may be shown beside them, labelled. |
| B6 | **Percentiles.** p50, p90 and p99 by nearest rank on integer ns equal the claimed values at their stated rounding. |
| B7 | **Intervals.** A percentile bootstrap with 1,000 resamples [estimated] and a seed derived from the challenge reproduces the claimed interval; a p99 claim needs at least 1,000 measured rows, so that at least 10 lie beyond it [derived]. |
| B8 | **Warm-up by rule.** The warm-up window is declared in the challenge before the run: the first W rows by due time, W = max(100, 2 × `max_num_seqs`) [estimated]. Those rows are excluded and reported apart. The run then fails as "still warming" if the median TTFT of the first post-warm-up tenth exceeds 1.25 × the median of the rest [estimated]. |
| B9 | **Goodput, with its denominator named.** Requests meeting both the TTFT and the TPOT objective from the challenge, divided by the arrival window (the course's definition, kernelspace's knee) and, shown beside it and labelled, by the total duration with the drain tail (SGLang's, sglang T6). Both are recomputed. |
| B10 | **Little's law.** On the steady window, the time-averaged number in flight equals throughput × mean latency within 5% [estimated]. |
| B11 | **The tool's own identities,** when `vllm bench serve --save-result --save-detailed` output is included: request throughput = completed ÷ duration; output throughput = output tokens ÷ duration; total throughput = (input + output tokens) ÷ duration (vllm B5). |
| B12 | **TPOT.** TPOT of a request = (last token − first token) ÷ (output tokens − 1), for more than one output token (vllm B5). |
| B13 | **Throughput ceiling** (§6.4, P3). |
| B14 | **No cache carry-over.** The server's start, or a prefix-cache reset, is recorded before the measured window, and the prompts are fresh per challenge, so a previous run's cache cannot inflate this one (vllm B3). |

### 6.3 Across artifacts

| Id | Rule |
|---|---|
| X1 | A trace captured during a replay lies inside the replay's time window, and the decode tokens its steps produce match the output tokens the rows record over the same steps, allowing for the steps cut by the window's edges. |
| X2 | The two sides of a pair share seeds and workload, and their recorded configurations differ only in the declared change. |
| X3 | The prompts in a correctness artifact equal the challenge's prompts. |
| X4 | One GPU name and one driver across every artifact of a receipt, and across both sides of a pair unless the pair is about hardware. |
| X5 | The engine passes the integrity check (§5.7) for every artifact. |

### 6.4 Physics floors

Floors use datasheet numbers from the hardware atlas's sourced claims (W2-T09), which bound what the hardware can do, so an honest run never breaks one. A number that breaks a floor fails with its bound printed (statespace's rule that a bounded check prints its bound).

| Id | Floor |
|---|---|
| P1 | A decode step's GPU-busy time is at least (weight bytes + the KV bytes it reads) ÷ the fingerprinted GPU's datasheet memory bandwidth. Weight bytes come from the pinned model's files; KV bytes from the step's context lengths. |
| P2 | No reported FLOP rate exceeds the datasheet dense peak at that precision. |
| P3 | Output tokens per second stay below the lower of two ceilings: compute (peak ÷ FLOPs per token) and memory (bandwidth ÷ bytes per token), as kernelspace's `burstgpt-replay` field lab computes them. |
| P4 | An attention call takes at least the bytes it must read and write ÷ the datasheet bandwidth. |

### 6.5 Rounding and tolerance policy

- Structural rules (T2-T7, B1-B3) are exact in integers.
- A recomputed summary must equal the claimed one at the claimed rounding.
- Statistical and agreement tolerances are design parameters, measured on the owner's honest fixtures before they ship.
- When an honest receipt fails, the claim or the tolerance is fixed and logged in DECISIONS.md, as D-028's revisit rule says. The learner never loses credit for it.

## 7. Prove-it with the agent closed

### 7.1 What "agent closed" means, and what it cannot mean

A Prove attempt opens a panel that asks the learner to close their coding agent and attest that they have. The site cannot detect an agent, and it does not pretend to: the attestation is recorded, the provenance is self-declared, and the design relies on three things instead (PLAN-100X H4, V6; statespace's honour-system rule):
- **Questions about the learner's own artifact.** An agent would need the learner's code or data and would have to simulate it, which is more friction than recall.
- **Seeds drawn at grade time,** so no answer can be looked up.
- **A 24-hour retry window** after a credited attempt, and one question returning at 30 days [measured: kernelspace's `prove.ts` and `prove2.ts` values at d478f91], so a lucky pass does not settle a KC.

### 7.2 The three kinds

| Kind | Used by | How it works | Stamp |
|---|---|---|---|
| **Prove-it v2 on a forge module** | TR5a `hybrid-kv`, TR5b `kv-publisher`, TR6 `rejection-sampler` | kernelspace's H4 v2: one seeded template of at most 12 `ks_invoke` calls, told in words; the learner predicts what their own module replies; the simulator reads the module's replies to the same calls and compares. `proved` needs the answer right, the module the one just graded on unseen seeds (same SHA-256), and no credited attempt waiting out its 24-hour retry (`src/lib/forge/prove2.ts`). | `prove`, `proved` |
| **A graded level in Prove mode** | every module with a game: `fewest` (TR0), `map` (TR1), `close` (TR2), `attribute` (TR3), `pick` (TR4), `manager` (TR5a), `yard` (TR5b), `exact` (TR6), `court` (TR8); a seeded PR description (TR7) | the module's graded level, started in Prove mode, on fresh seeds, with the live readouts hidden | `play` or `item`, `proved` |
| **"Defend your receipt"** | every L and F lab | after import, the browser asks seeded questions that only the receipt's raw artifacts answer, computed by `packages/sim` from those artifacts: "drop requests 40-60: what is your p99 now?", "which category grows most in your step 3 with graphs off?", "which blocks did your second run load for request 7?" The learner answers before the browser shows the computation. | `prove`, `proved` |

### 7.3 Retries and returns

A failed Prove attempt can be retried at once on fresh seeds at `practice` weight; a credited one opens a 24-hour window before the next credited attempt. One question per module returns in Today 30 days after the first `proved` event (kernelspace H4; `RETURN_AFTER_DAYS` [measured at d478f91]).

## 8. Keep: Today, VRK₃₀ and change cards

- **Today** is a 10-12-minute session [estimated], phone-first, on kernelspace's vendored FSRS (D-037): due KCs first, every item regenerated on a fresh seed, interleaving only inside confusable sets, a welcome-back set after 7 idle days [estimated; kernelspace K2's rule] and never an overdue count (kernelspace K2). Each module's Keep families are listed in its curriculum file.
- **A review** is graded like any item and stamped `unseen` when correct on a fresh seed; it feeds VRK₃₀ when it falls 30 days or more after the KC was earned.
- **Change cards.** When a pin or claim moves, the claims tied to it raise change cards (A§4.4). A card shows the struck line, the new line and its source, and one or two retrieval items; acknowledging it writes an `ack`, and its items are graded as usual. Credit earned against an older `rev` shows "re-check" and is never deducted (kernelspace S1).

## 9. Module completion

| Module | Browser-complete when credited | Complete when also credited |
|---|---|---|
| TR0 | exit tickets; `shape-shifter/fewest` and `/grid` | `tr0.forward.s2`, `.s3`; a `proved` event |
| TR1 | exit tickets; `engine-floor/map` | `tr1.fork.s2`; a `proved` event |
| TR2 | exit tickets; `loop/graphs` (stages `sizes` and `modes`) and `loop/close` | a `proved` event (TR2 has no GPU stage) |
| TR3 | exit tickets; `gap-hunt/attribute`, and `gap-hunt/pinned` once the owner's traces exist | `tr3.profile.s2`, `.s3`, `.s4`; a `proved` event |
| TR4 | exit tickets; `dispatch/pick` | `tr4.sweep.s1`, `.s2`, `.s3`; a `proved` event |
| TR5a | exit tickets; `lab:hybrid-kv`; `pool/evict`, `/adapters`, `/manager` | a `proved` event (TR5a has no GPU stage) |
| TR5b | exit tickets; `lab:kv-publisher`; `switchyard/load-or-recompute`, `/publish`, `/yard` | `tr5b.connector.s2`, `.s3`; a `proved` event |
| TR6 | exit tickets; `lab:rejection-sampler`; `verifier/exact`, `/chain`, `/gamma`; `loop/mask` | `tr6.proposer.s2`, `.s3`; a `proved` event |
| TR7 | exit tickets and the process items | `tr7.reproduce.s1`, `.s2`; a `proved` event |
| TR8 | exit tickets; `broken-bench/due`, `/warm`, `/sure`, `/court` | `tr8.replay.s2`; a `proved` event |
| Capstone | the capstone page's attribution and roofline form | `capstone.pair.s1`, `.s2`; a `proved` event |

The map (`/map`) and module pages show these states, derived at read time (W1-T06). The Evidence Pack (W3-T05) exports credited artifacts, with each receipt's checks and badges, and describes artifacts, not the learner (PLAN-100X §5.8).

## 10. Cheating: what it looks like, and what blunts it

| What it looks like | What blunts it | What is left |
|---|---|---|
| Typing a better number into a receipt (an edited p99) | integrity hashes (rule 3); every summary recomputed from raw rows (B6, B7) | nothing at this level |
| Fabricating raw rows that agree with each other | schedule binding to the challenge (B1), arrival adherence (B4), Little's law (B10), TPOT identities (B12), floors (P1-P4), trace-to-log agreement (X1) | a forger who simulates a whole consistent run can pass (§12) |
| Running closed loop and calling it open loop | arrival adherence (B4) | — |
| Reusing a friend's receipt, or one's own old one | binding to an unused challenge in this device's ledger (rule 4); single use; 14-day expiry | — |
| Running on other seeds, then importing | B1 and rule 4 | — |
| Claiming a faster GPU, or an H200 as an H100 | the fingerprint from NVML; floors and tolerances follow the reported device; no credit depends on speed | — |
| Patching the engine to look faster or to fake outputs | engine integrity against `RECORD` (X5); teacher-forced agreement with the owner's references | — |
| Patching the grader | the grader's source hash against the published list (rule 5) | a patched grader that lies about its own hash cannot be detected without a server (§12) |
| An off-pin engine version | the pin check (rule 6); off-pin runs are shown and earn nothing | — |
| Delegating TR0's forward to Hugging Face | the import guard | friction, not DRM: a determined learner can hide the call |
| Submitting the course's own synthetic trace as a real one | synthetic traces carry `synthetic: true`; real-trace rules T4 and T8 need CUDA API spans, correlation ids and the pinned engine's kernels; X1 ties the trace to a real run's rows | a determined forger can strip the label and fake the rest (§12) |
| Building `--features reference` and submitting it | the module names itself `@reference` and earns nothing | — |
| Editing a game score in IndexedDB | grading replays the action log at grade time | — |
| Editing the ledger to add credited events | — | the ledger is the learner's own record, not a credential; nothing is issued to third parties, and receipts and forge events can be re-verified from their files |
| Harvesting keys from the Markdown export or the page | keys are computed at grade time and never exported (W1-T35) | — |
| Test-wise item strategies ("always the longest option") | shuffled id-keyed options and the item lint (PLAN-100X V1); the blind-strategy bound (§4.1) | — |
| An agent doing the lab | self-reported provenance (`assisted`, 0.3); Prove-it on the learner's own artifact (§7); the agent kit's guard hook in every lab zip | an undisclosed agent plus a learner who passes Prove-it: the learner has then shown they understand the artifact, which is the point |
| Cherry-picking: run ten times, import the best | each challenge is single-use and every issued challenge is listed beside the imported ones; no credit depends on speed or effect size | — |
| Many learners filing the same upstream issue | TR7: one target per learner, duplicate checks, and the course never routes a cohort to one upstream item | — |

## 11. What is never graded

- Browser timing of any kind (`performance.now()` is coarsened; wasm has no PMU; catalog §7).
- The speed of the learner's GPU, the size of a speedup, or whether a reproduction matched upstream's number.
- Self-reported numbers, prices paid, or links (weight 0).
- Prose: reports and explanations are graded only through their structured fields.
- Upstream's response to a filed issue or pull request, including whether it merges.
- Anything an LLM judges; no item is generated by an LLM at runtime (PLAN-100X §10).
- Nsight Compute counters and anything else a rented container may not expose (sglang N5).
- The front page, reading, opening, watching, clicking or time on task.
- Agent use itself: it changes a weight, and it is never penalised.
- Leaderboards: none exist; if one ever does, it is opt-in and re-run by CI (catalog §7).

## 12. What this design cannot prove

From A§8.6, restated as policy. The pipeline proves that the work ran on seeds this device drew, that the artifacts are the ones hashed, that every performance number follows from its raw records and respects physics, and that the correctness checks ran in a grader build the site knows. It does not prove the absence of a determined forger: someone who patches the grader, keeps its version string and fabricates raw records that agree with each other and with physics can produce a receipt that passes. No zero-server design can stop that. The course therefore issues no credential to third parties, says so on `/about`, and makes honest work the easy path and casual forgery a named failure.

## 13. Checking the checks

| What | How | When |
|---|---|---|
| Every forge lab's bestiary fails, and its reference passes | `verify:labs` | every PR touching `labs/` |
| Every game's naive strategy fails and its reference passes on its bands; blind strategies stay under §4.1's bound | `verify:games`, `verify:items` | every PR (sampled), nightly (full) |
| The forged-receipt bestiary fails, check by check: an edited p99, a re-signed hash, a reused token, a replayed old receipt, a closed-loop log, a trace too fast for its GPU, an unknown grader build, an attribution that does not sum, a pair on different seeds | receipt fixtures in CI (A§8.5; W2-T08) | every PR touching `packages/verify` or `labs/grader` |
| Honest receipts from the owner's GPUs pass | W2-T12's fixtures | CI, and at each re-pin |
| The chi-square false-fail rate and detection rates | 10,000 seeds | nightly |
| Bootstrap coverage | 2,000 seeds | nightly |

## 14. Open items for the owner

1. **The name `gpu-verified` covers the L lane too** (TR0 runs on a CPU). A neutral pair such as `receipt-verified` and `receipt-unverified` would read better; A§7.3 owns the names, and the question is filed as Q-9 in DECISIONS.md.
2. **Tie-aware identity** (§5.7) replaces strict token identity for TR6 and adds it to TR1 s2; ARCHITECTURE §8.5 and §9.6 now follow it (D-046). The 0.05-nat gap and the 5% share are [estimated] until W2-T12's fixtures measure honest runs.
3. **Level ids.** This file uses GAMES.md's ids. For The Loop they are `async`, `graphs` (stages `comb`, `sizes` and `modes`), `keys`, `mrv2`, `close` and `mask`, which TRACKER W1-T13 and W1-T14 now name; TR4's graded level is `dispatch/pick`. If the names move again, §4.3's bars follow the levels, not the names.
4. **Warm-up numbers** in B8 and arrival tolerances in B4 are [estimated] until W1-T31 and the owner's fixtures measure honest runs.
5. **Teacher-forced tolerances per GPU class** come from W2-T12's fixtures; until then the receipt shows "tolerance pending" and the check is attested only.
6. **Completion needs a `proved` event.** That makes the Prove step mandatory for "complete" but not for "browser-complete". The owner may prefer Prove to be optional; it changes §9 only.
7. **Predictions move no credit** (§4.7). If the owner wants calibration to count, it would enter through the Mirror, not through weights.
