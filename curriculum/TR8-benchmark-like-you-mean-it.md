# TR8 · Benchmark like you mean it: open loop, coordinated omission, warm-up, and intervals on p99

**Status:** curriculum design for the owner's review, 2026-11-03. Nothing here is built. **Module id:** `tr8`. **Hours:** about 5 [estimated]: about 3.5 in the browser (B) and about 1.5 on a GPU (F). **Ships in:** W1 for the browser parts and W2 for the replay lab (D-002, D-039). **Owns:** benchmark methodology (catalog §4). Fleet Ops' FL7 cites it for detection time, and every capstone in the catalog measures by its rules.

**Sources and tags** as in [TR0](TR0-pytorch-for-rust.md). Research rows are cited as (vllm B2) and (sglang T5). Every hour, threshold and tolerance is [estimated]. A table whose numbers share one tag says so in its caption.

---

## 0. At a glance

| | |
|---|---|
| **Promise** | Produce a latency and goodput number another engineer can trust: open loop, latency counted from when each request was due, warm-up excluded by a rule fixed in advance, enough samples for the percentile, an interval on it, and a replay that keeps the trace's timing. This is the first half of outcome 4. |
| **Artifacts** | A seeded broken-benchmark corpus that extends kernelspace's broken-bench (B); a timestamp-faithful BurstGPT replay against the pinned vLLM, re-checked from raw records (F). |
| **Game slot** | The benchmark-court game: working name **Broken Bench**, `broken-bench`, 2D, with an optional 3D opener (§6). |
| **Prerequisites** | T5.L1-T5.L10 (hard); T7.L1 and T7.L2 strongly advised (the knee and broken-bench exercises). |
| **GPU** | About 1.5 h on a 4090-class GPU [estimated]. |

## 1. What it teaches

1. **Latency counts from the due time.** An open-loop client sends each request at its scheduled time whatever the server does. A closed-loop client waits for a reply before sending again, so when the server stalls it stops sending, and the requests it never sent never record their wait: coordinated omission. The fix is to keep every request's intended send time beside its actual send time and to measure from the intended one (kernelspace's broken-bench covers the closed loop; TR8 adds the due-time arithmetic).
2. **The client is part of the system.** `vllm bench serve --max-concurrency N` caps in-flight requests with a semaphore, which is a closed loop in disguise; vLLM reports the time spent waiting for that semaphore as `client_queue_time` and `e2el_including_client_queue`, while TTFT, TPOT and end-to-end latency start at the actual send (vllm B2, sglang T7). SGLang's `bench_serving` starts its timer inside the request function, after the semaphore, so client queueing is invisible in its latencies, and its own help text says the achieved rate "may be lower" (sglang T5). A Rust client finished 2,500 requests on a mock server in 13.2 s where the Python client took 106.8 s [unverified, vendor-reported; sglang T8]: the client can be the bottleneck.
3. **Defaults that bite.** `vllm bench serve` defaults to `--request-rate inf` (every request at time 0), `--num-warmups 0`, and the 99th percentile only; with a finite rate it draws gamma inter-arrivals whose shape `--burstiness` sets (1.0 is Poisson) and rescales them so the last offset equals N ÷ rate [measured at v0.33.0] (vllm B1, B2). Its docs call `--request-rate=inf --max-concurrency=N` "the most commonly used configuration" (vllm B2). Running it twice against one server can reuse prompts left in the prefix cache and inflate throughput (vllm B3). SGLang's `bench_serving` draws Poisson gaps, defaults to seed 42, warms up by repeating request 0, flushes the cache only with `--flush-cache`, and ignores EOS unless told not to (sglang T5).
4. **Warm-up is named engine state, cut by a rule fixed in advance.** Graph capture, compilation and cache fill make the first requests slow. The course's rule declares the warm-up window before the run and checks afterwards that the run was no longer warming (ASSESSMENT §6.2), so the cut is never chosen after seeing the data.
5. **A percentile needs samples beyond it, and an interval.** A p99 from 100 requests rests on one request; with 1,000 there are 10 beyond it [derived: (1 − 0.99) × 1,000]. Neither engine's tool computes a confidence interval: vLLM's Python tool reports percentiles, its Rust client a mean, deviation and coefficient of variation over runs (vllm B4). TR8 adds a seeded percentile bootstrap on p99, the course's own addition.
6. **Name your goodput's denominator.** Goodput at SLO counts requests that met every objective. kernelspace's knee divides by the fixed arrival window; SGLang's new `--goodput` (v0.5.23) divides by the whole run including the drain tail (sglang T6). The two differ under overload, so a goodput number must say which it is.
7. **Little's law as a sanity check.** Mean concurrency equals throughput times mean latency on a stable window; a log that breaks it is wrong somewhere.
8. **Replay in time, not just in shape.** vLLM's `--dataset-name burstgpt` keeps GPT-4 rows with a response, samples rows at random, reads token counts by column position and ignores timestamps, so the trace's bursts are not replayed, and BurstGPT v2.0's 8-column `BurstGPT_3.csv` would be misread [derived from code and headers, not executed; sglang D2, D3]. kernelspace's `burstgpt-replay` field lab already notes the lengths-only replay. SGLang's trace timestamps work only for its Mooncake dataset (sglang D3). TR8's replay keeps the timestamps.

**Knowledge components** (proposed; W1-T03 writes them):

| KC | Requires |
|---|---|
| `tr8.latency-from-due` | `ks:t7.benchmark-hygiene` |
| `tr8.open-vs-closed` | `tr8.latency-from-due` |
| `tr8.client-queue` | `tr8.open-vs-closed` |
| `tr8.warmup-rule` | `ks:t7.benchmark-hygiene` |
| `tr8.min-n-tail` | `ks:t7.tail-percentiles` |
| `tr8.bootstrap-p99` | `tr8.min-n-tail` |
| `tr8.goodput-denominator` | `ks:t7.goodput`, `ks:t7.goodput-curve` |
| `tr8.littles-law` | — |
| `tr8.time-shaped-replay` | `tr8.open-vs-closed` |
| `tr8.tool-defaults` | `tr8.client-queue`, `tr8.warmup-rule` |

## 2. What it builds on

All ids were checked at kernelspace `origin/master` d478f91 on 2026-11-03.

| kernelspace | Id | What TR8 takes from it |
|---|---|---|
| Lesson, exercises | T7.L2 "Benchmarking Methodology: Measure Like You Mean It" (`t7.l2`), with the `knee` and `broken-bench` Fleet exercises | Warm-up and steady state, "p99 computed from 20 requests is astrology", Poisson for open-loop truth and closed loop for saturation curves, the knee as capacity (`t7.benchmark-hygiene`, `t7.goodput-curve`). `broken-bench`'s four flaws (closed loop, capped output, warm cache, counted warm-up) and its answer-first draw are the corpus TR8 extends. |
| Lesson | T7.L1 "The Objective Function: Goodput, SLOs, and Honest Metrics" (`t7.l1`) | Goodput and SLOs (`t7.goodput`, `t7.slo-error-budget`, `t7.tail-percentiles`). |
| Lesson | T7.L3 "The Pareto Frontier: tok/s/GPU vs tok/s/user" (`t7.l3`) | What a benchmark point sits on. |
| Field lab | `burstgpt-replay`, after T5.L7 | vLLM's benchmark CLI on BurstGPT's request shapes, with its own note that the CLI replays lengths, never timestamps. It was `field` evidence at weight 0; TR8's replay is graded (D-001). |
| Traces | `public/traces/burstgpt-v2-busiest-hour.json` (480 rows) and `burstgpt-v2-busiest-minute.json` (40 rows), from BurstGPT v2.0 `BurstGPT_without_fails_1.csv`, CC BY 4.0, source asset SHA-256 `a4d068a7113ec0290e74063a1b3447dc6001a30e4298eb313581b71006dda1f4`; `kimi-conversation.json` (Mooncake, Apache-2.0) | Vendored unchanged as workload slices (A§13). |
| Lesson, play | T5.L7 "Continuous Batching" (`t5.l7`) with the `scheduler` play, which replays BurstGPT's busiest minute | The learner has met this traffic before. |

**Within enginespace.** TR2's loop is the server in TR8's model (A§5.6). TR6's speedup claim and TR7's reproduction follow TR8's rules, and so does the capstone.

## 3. Lessons

Minutes are [estimated].

| Id | Title | Minutes | Lane |
|---|---|---|---|
| `tr8.l1` | Due time, not send time: open loop, closed loop and coordinated omission | 40 | B |
| `tr8.l2` | Warm-up, sample size, and an interval on p99 | 35 | B |
| `tr8.l3` | The tools' defaults, flag by flag: `vllm bench serve` and `sglang.bench_serving` | 30 | B |
| `tr8.l4` | Replay a trace in time, not just in shape; name your goodput's denominator | 25 | B |
| — | Broken Bench: practice, then the graded court | 80 | B |
| — | Lab `tr8.replay`, stages s1-s3 | 90 | F |

## 4. The loop

| Step | What the learner does | Evidence |
|---|---|---|
| **Predict** | For every Broken Bench case: the corrected p99 and an interval. Before the replay: "What p99 TTFT will your replay show, and how wide will its interval be?" | `predict` |
| **Play** | Broken Bench: read a published claim, its harness and its raw log; name the flaw; predict the corrected p99 with an interval; the court recomputes from the rows (§6). | `play` |
| **Build** | Replay a BurstGPT window in time against the pinned vLLM with the grader's open-loop client (§5). | `receipt` |
| **Prove** | With the agent closed: the `court` level on fresh cases; and "defend your replay": seeded questions only your receipt's rows answer, such as "drop requests 40-60: what is your p99 now?" (ASSESSMENT §7). | `play` and `prove`, `proved` |
| **Keep** | Today draws `tr8.min-n`, `tr8.ci-width`, `tr8.corrected-p99`, `tr8.goodput-denominator`, `tr8.littles-law` and `tr8.which-flag`. | `review` |

## 5. Artifacts and how each is graded

| Artifact | Lane | What is graded | How | Pass |
|---|---|---|---|---|
| `play:broken-bench/due`, `/warm`, `/sure` | B | Re-timing a log from due times; the warm-up cut by the course's rule; the bootstrap interval and minimum n | `packages/sim/bench` recomputes from the seeded rows (A§5.6) | Right on 3 fresh seeds each |
| `play:broken-bench/court` (the catalog's "seeded broken-benchmark corpus") | B | Five mixed cases per session, drawn answer first | Per case: the flaw, a p99 within ±15% of the recomputed value, and an interval that contains it and is at most twice the bootstrap interval's width (GAMES.md §11) | At least 4 of 5 cases with both the flaw and the number right; each session holds at least one latency-from-due case and one small-sample case |
| Item families (§4, Keep) | B | Answers on fresh seeds | Keys from `bench` | Exit ticket |
| `receipt:tr8.replay.s1` (first win) | F | A 60-second [estimated] seeded smoke replay | Counts, schedule binding and environment (ASSESSMENT §6.2) | Practice; not required |
| `receipt:tr8.replay.s2` (the catalog's "BurstGPT replay") | F | A challenge-seeded window of BurstGPT v2.0, replayed open loop with its timestamps and a seeded speed factor, warm-up declared, at least 1,000 measured requests [estimated], one row per request | Browser: recomputes p50 and p99, the seeded bootstrap interval, goodput under both denominators (labelled), arrival adherence, Little's law and floors from the raw rows, and checks every row's schedule against the challenge (ASSESSMENT §6.2). Grader: pins, fingerprint (including `max_num_batched_tokens` and `max_num_seqs`, which differ by GPU, vllm M9), and teacher-forced agreement on a sample of outputs. | Every required check passes. Credit never depends on how fast your GPU is. |
| `receipt:tr8.replay.s3` (optional) | F | The same window through `vllm bench serve --dataset-name burstgpt --save-result --save-detailed` | Browser: vLLM's own identities (completed ÷ duration, output tokens ÷ duration, TPOT = (latency − TTFT) ÷ (output − 1); vllm B5) and a "length-shaped, not time-shaped" label; a structured comparison with s2 | Practice |

The module counts as complete when the exit tickets, `court`, `due`, `warm`, `sure` and s2 are credited, and a `proved` event exists (ASSESSMENT §9).

**The broken-benchmark corpus.** kernelspace's four flaws, plus the ones its research grounds in the tools themselves (GAMES.md §11's table): closed loop past capacity; coordinated omission; client queue hidden by the timer; warm-up counted; warm cache; capped output; too few samples; a mean reported as a tail; the client as the bottleneck; a "replay" that ignores timestamps; and a control case with no flaw, so rejecting everything fails. Each seed draws the answer first, then the flaw and the scene, so a flaw's label never gives the number away (kernelspace's D39 rule), and a scene-blind constant per flaw label must pass at most 15% of rounds [estimated] (ASSESSMENT §4.1).

**The replay's converter** branches on each CSV's header, because BurstGPT v2.0's files differ: `BurstGPT_1.csv` has six columns and `BurstGPT_3.csv` eight, with a session id and an elapsed time that is not TTFT (sglang D2). Prompt text is synthetic at the recorded token counts, because BurstGPT carries no text; the grader generates it from the challenge's seed.

## 6. Game slot

**The benchmark-court game.** Working name **Broken Bench**, id `broken-bench`, 2D, with an optional 3D opener (GAMES.md §11).

- **The rule is the concept.** The court's rules of evidence are the methodology: latency counts from the due time; a percentile needs samples beyond it; a warm-up window is excluded and reported apart; a rate the harness never achieved is not the rate.
- **Levels the module uses** (GAMES.md's working ids): `due`, `warm` and `sure` from practice to graded; `court` graded.
- **The view.** Row tables, per-client timelines with due and sent ticks, and a latency histogram with the percentile marker; everything is a list on phones.
- **The optional opener, `rain-and-relay`** (a W3 stretch): two arenas along one time axis. Open loop: requests fall as drops at their due times, and during a stall they pile up at the closed gate, so queue height is the honest latency. Closed loop: one runner lane per client in depth; during the stall every runner freezes, and the requests never sent appear as ghost outlines at their due times.

## 7. Pinned resources

| Resource | Pin | Notes |
|---|---|---|
| vLLM | v0.33.0; `vllm/benchmarks/serve.py`, `docs/benchmarking/cli.md` and `docs/benchmarking/sweeps.md` at the tag | vllm B1-B5 |
| SGLang | v0.5.23; `python/sglang/benchmark/serving.py`, `benchmark/goodput.py` | sglang T4-T6 |
| BurstGPT | release v2.0 (2026-01-23) at `github.com/HPMLL/BurstGPT`, each CSV pinned by SHA-256 when the lab is built (W2-T36); CC BY 4.0 repository licence; paper DOI 10.1145/3711896.3737413 | not the stale Hugging Face mirror (sglang D1) |
| kernelspace slices | as in §2, vendored unchanged | A§13 |
| ShareGPT | never bundled or redistributed; downloaded by the learner's own tool if used | its redistribution rights are unresolved (sglang D4) |

## 8. Dated claims

| Claim | Tag | Source | Upstream date | TTL |
|---|---|---|---|---|
| `vllm bench serve` defaults: rate inf, gamma arrivals with `--burstiness`, no concurrency cap, 0 warm-ups, p99 only, seed 0 | [measured] | vllm B1 | 2026-11-01 | 14 days |
| `--max-concurrency` is a semaphore; client queueing is reported separately; arrival offsets are rescaled | [measured] | vllm B2 | 2026-11-01 | 14 days |
| Repeated runs can reuse the prefix cache and inflate throughput; `vllm bench sweep serve` resets caches | [measured] | vllm B3 | 2026-11-01 | 14 days |
| No upstream confidence intervals; the Rust client reports mean, deviation and CV | [measured] | vllm B4 | 2026-11-01 | 14 days |
| The result JSON's fields and formulas | [measured] | vllm B5 | 2026-11-01 | pin |
| `bench_serving`'s Poisson gaps, timer after the semaphore, warm-up on request 0, flush off by default, seed 42, EOS ignored | [derived] from source, not executed | sglang T5 | 2026-11-02 | 14 days |
| SGLang's `--goodput` divides by total duration; kernelspace's knee by the arrival window | [measured] | sglang T6 | 2026-11-02 | 14 days |
| A Rust client ran 8× faster than the Python client on a mock server | [unverified], vendor-reported | sglang T8 | 2026-11-02 | static |
| BurstGPT v2.0's files, schemas, licence and DOI | [measured] | sglang D1, D2 | 2026-01-23 | 90 days |
| vLLM's BurstGPT loader ignores timestamps and reads columns by position | [derived] from code, not executed | sglang D3 | 2026-11-01 | 14 days |
| ShareGPT's licence is uploader-declared and its provenance unaddressed | [unverified] | sglang D4 | 2023-04-12 | 90 days |

## 9. Hours

| Activity | B | F |
|---|---|---|
| Lessons `tr8.l1`-`tr8.l4` | 2.2 | — |
| Broken Bench | 1.3 | — |
| `tr8.replay` s1 (0.25), s2 (1.0), s3 (0.25, optional) | — | 1.5 |
| **Total** | **about 3.5** | **about 1.5** |

All [estimated]. The catalog's figure is 5 h, kept.

## 10. What goes stale, and when

| Item | TTL | Detector |
|---|---|---|
| Both tools' defaults and module paths (SGLang moved its benchmark modules in v0.5.21, sglang T4) | 14 days | the defaults in `serve.py` (vllm §6) and `serving.py` |
| SGLang's goodput definition | 14 days | `benchmark/goodput.py` |
| BurstGPT's release | 90 days | its `releases.atom`; the pinned SHA-256s |
| vLLM's BurstGPT loader | 14 days | `vllm/benchmarks/datasets/datasets.py` |
| The course's statistics rules (bootstrap, minimum n, warm-up) | owned here; change only by a DECISIONS record | — |

## 11. Open items

1. **The warm-up rule's numbers** (the declared window and the "still warming" threshold) are [estimated] in ASSESSMENT §6.2 until W1-T31 measures how often an honest steady run trips them.
2. **GPU time for a full busiest-hour replay.** One hour of traffic at a seeded speed factor needs less than one hour of GPU time only when the factor is above 1; the lab draws its window and speed so that s2 fits about an hour [estimated].
3. **SGLang as a second server.** A learner may replay against SGLang v0.5.23 for practice; graded s2 targets vLLM, the course's primary pin.
