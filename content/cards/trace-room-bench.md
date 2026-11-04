---
id: trace-room-bench
kind: notional-machine
title: The benchmark client and its numbers
world: bench
status: draft
---

The notional machine behind The Inspection (`broken-bench`) and TR8: `packages/sim/bench`, built by W1-T31. It sends a seeded stream of requests to a server model, logs what a benchmark client logs, and summarizes the log as a harness would and as the course does. The server is the step-loop model run coarse. The flaws it can show are the real tools' flaws, and the tools are `vllm bench serve` at vLLM v0.33.0 and `bench_serving` at SGLang v0.5.23. The real engine is authoritative: when it disagrees with this card, the card is wrong.

## Models

1. **Arrival processes.** An open loop sends on a schedule whatever the server does: Poisson arrivals through a committed table of exponential quantiles, a recorded slice replayed in time, or a burst, which is every request due at one moment. A closed loop has clients that each wait for a reply, think, and send again (A§5.6). `vllm bench serve` bursts by default, and so does SGLang's `bench_serving`: each sends every request at time zero unless it is given a rate. With a rate, vLLM's tool draws Poisson or gamma gaps, and it rescales them so that the run lasts as long as the rate says, so the arrivals it makes are not exactly Poisson. {{claim:vllm.bench.request-rate-default}} {{claim:sglang.bench.request-rate-default}} {{claim:vllm.bench.arrivals}} {{claim:vllm.bench.arrival-rescale}}
2. **Intended and actual send times.** Every request keeps the time the harness meant to send it and the time it did, and the log keeps both. The course measures latency from the due time. A harness that starts its timer at the send leaves out the wait of every request that went out late, and the summary reports both numbers so that the gap shows (A§5.6, ASSESSMENT §6.2).
3. **Coordinated omission** happens by construction in a closed loop. A client waits for a reply before it sends again, so a server that stalls holds its clients back, and the requests that fell due meanwhile go out late (A§5.6). In both tools a concurrency cap is a semaphore around each request, so with it set the run is a capped closed loop, and the real rate can fall below the requested one. vLLM's tool records the wait at the semaphore apart, as `client_queue_time`, and its own guide still calls an infinite rate with a cap its most common pattern for production benchmarking. {{claim:vllm.bench.max-concurrency-closed-loop}} {{claim:sglang.bench.max-concurrency-semaphore}} {{claim:vllm.bench.client-queue-time}} {{claim:vllm.bench.max-concurrency-recommended}}
4. **The client's own cost.** One client thread sends everything, and each send costs it a stated time, so a client asked to send faster than it can falls behind its schedule whatever the server does (A§5.6, WORLD §5). A run is checked for adherence: the sends that are late by more than a tolerance, and by more than a hard limit, are counted (ASSESSMENT §6.2).
5. **Warm-up.** Requests due before the harness's declared warm-up ends stay in the log and are left out of the measured statistics, which are reported apart. A server that starts cold is what makes the declared window matter (ASSESSMENT §6.2). vLLM's tool sends no warm-up requests unless it is asked to, where SGLang's sends one. A second run against the same server can reuse prompts that the first left in the prefix cache, which saves the prefill of a prompt's full blocks, and a block is a fixed number of tokens. {{claim:vllm.bench.num-warmups-default}} {{claim:sglang.bench.warmup-default}} {{claim:vllm.bench.prefix-cache-reuse}} {{claim:vllm.cache.block-size-default}}
6. **Percentiles** use the nearest rank on sorted integers, and the summary counts the observations beyond the 99th percentile, because a run with too few of them has too few samples for that percentile (A§5.6, ASSESSMENT §6.2). vLLM's tool reports one percentile by default. {{claim:vllm.bench.metric-percentiles-default}}
7. **The interval on a p99** is a percentile bootstrap of 1,000 resamples at a 95% level [estimated], drawn from a seed, so the same log always gives the same interval (A§5.6).
8. **Time per output token** is a request's latency less its time to first token, over its output length less one. {{claim:vllm.bench.tpot-definition}}
9. **Goodput at an SLO** counts the measured requests that meet both their TTFT and their TPOT objectives, per second. The denominator matters under overload. The course divides by the arrival window and shows the other number beside it, labelled. SGLang divides by the time from the start of the run to the last completion, the drain tail included (ASSESSMENT §6.2). {{claim:sglang.bench.goodput}} {{claim:sglang.bench.goodput-duration}}
10. **Little's law** gives a residual for a stable run: the mean number of requests in flight against the throughput times the mean latency (A§5.6). {{claim:bench.littles-law}}
11. **The server** is the step-loop model run coarse. Its host card is at zero, so a step costs what the GPU card says and nothing more, and what stays is what decides a queue: the scheduler's rules, the token budget, the cap on running requests, chunked prefill, and a finished request that rides one more step. Async scheduling is on, up to two steps are in flight, and step times come from the S5 card (A§5.6, WORLD §5). A stall freezes the engine's main thread for a window, and a cold start slows the steps that begin before a given moment. Both are stand-ins [estimated].
12. **The broken-benchmark corpus** of W1-T32 is built on this model: ten flaws and a control (A§5.6, GAMES.md §11). Four have an instance in the tools above: a request rate of infinity, a capped closed loop, no warm-up, and a prefix cache that carries over between runs.

## Ignores

- **Network latency and its variance.** Tokens reach the client at the moment the engine reads them back, with no network, HTTP or detokenization in between.
- **Client CPU contention,** except as the stated cost of a send. A client that is slow because it is busy is a flaw of the corpus, and it is drawn on purpose.
- **The step loop's own detail.** The coarse server has no CPU cost per step, so it has no bubbles, which are TR2's business. It has no KV capacity limit or preemption, no graph padding or dispatch keys, no mask, speculation or adapters, no engine-core sleep when nothing can run, and no frontend. The step-loop card's list of what it ignores applies.

## Calibrated against

- **The step-loop model.** Over 200 seeds [estimated], the coarse server and the step loop with a host card of zeros give every request the same first-token and last-token time, so TR8's knee and TR2's bubbles come from one model, and a change to the step loop shows as a failing test.
- **The S5 card,** inside its box, through the step-loop card. Nothing in the client model has been compared with a benchmark run on a real engine yet.
- **The stall and the cold start:** nothing. They are stand-ins, and their sizes are a judgment [estimated].
- **The tools' source:** each flaw is grounded in the claims above, read at v0.33.0 and v0.5.23 on 2026-11-04.
