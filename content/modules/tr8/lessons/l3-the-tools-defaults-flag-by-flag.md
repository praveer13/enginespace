---
id: tr8.l3
module: tr8
title: "The tools' defaults, flag by flag: vllm bench serve and sglang.bench_serving"
minutes: 30                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr8.tool-defaults, tr8.client-queue]
builds_on: [ks:T7.L2, ks:t7.benchmark-hygiene]
status: review                    # draft | review | live
lanes: [B]
games: [broken-bench]
---

A benchmark tool is a harness, and a harness is a pile of defaults. Each default is a decision that someone made for you: how fast to send, how many requests to allow at once, whether to warm up, which percentiles to print. Run a tool with no flags and you have run a benchmark designed by its author's habits. This lesson reads two tools flag by flag, at the versions the course pins: vllm bench serve at v0.33.0 and sglang.bench_serving at v0.5.23. Every fact in it is a claim with a source line, because a default belongs to a version. It needs no GPU, because the behaviour is in the source.

Start with one piece of arithmetic, and commit to it before you read on.

:::predict
id: tr8.l3.p1
prompt: You run vllm bench serve with a request rate of 10 a second [estimated] and a cap of 8 requests in flight [estimated], against a server that answers each request in 1.2 s [estimated], whatever the load. In steady state, at what rate in requests a second does the run send?
answer: { kind: numeric, unit: requests/s, rel_tol: 0.05 }
reveal: after-game
kcs: [tr8.client-queue, tr8.tool-defaults]
:::

Then play the court on its practice seed before you read on, so that you meet each ruling first. The debrief cites each flaw's real-world instance, and the In production card lists the flags that would have made a number admissible. The rest of the lesson reads those flags one by one.

:::game
id: broken-bench
level: court
mode: practice
:::

## Rate: infinity is a burst

Both tools default the request rate to infinity, and with it every request is due at time zero. {{claim:vllm.bench.request-rate-default}} {{claim:sglang.bench.request-rate-default}} That is a burst and not a rate: the queue it builds is what the p99 then measures. With a finite rate, vLLM draws the gaps from a gamma distribution whose default `--burstiness` makes them exponential, which is a Poisson process, and it rescales the draws so that the last arrival falls where the rate says. That steadies the throughput across seeds, and it means the arrivals are not exactly Poisson. {{claim:vllm.bench.arrivals}} {{claim:vllm.bench.arrival-rescale}}

## Cap: a closed loop with a schedule on top

vLLM's `--max-concurrency` is unset by default, so nothing caps the requests in flight. {{claim:vllm.bench.max-concurrency-default}} Set it, and in both tools it is a semaphore around each request: the run becomes a capped closed loop, and its real rate can fall below the one you asked for. {{claim:vllm.bench.max-concurrency-closed-loop}} {{claim:sglang.bench.max-concurrency-semaphore}}

That is the prediction's arithmetic, for `--request-rate 10 --max-concurrency 8`. With 8 permits [estimated] held for 1.2 s [estimated] each, the run can send 8 ÷ 1.2 = 6.7 requests a second [derived], whatever the rate flag says, and the wait for a permit grows for as long as 10 requests a second [estimated] keep falling due. The same law, concurrency equals rate times latency, checks whole logs in the fourth lesson.

The two tools disagree about whether you will ever see that wait. SGLang's timer starts inside its request function, after the semaphore, so the wait is in no latency it reports. {{claim:sglang.bench.timer-inside-request}} vLLM's timer starts inside its request function too, so its TTFT counts from the send. {{claim:vllm.bench.timer-inside-request}} What vLLM adds is a term for the wait: `client_queue_time`, and with a finite rate `e2el_including_client_queue`, a schedule-relative end-to-end latency. {{claim:vllm.bench.client-queue-time}} {{claim:vllm.bench.e2el-including-client-queue}} The guide tells you to add `client_queue_time` to `--percentile-metrics` to see it, and the default list does not name it. {{claim:vllm.bench.client-queue-in-percentile-metrics}} {{claim:vllm.bench.percentile-metrics-default}}

The guide also calls an infinite rate with a cap the most commonly used configuration for production benchmarking. {{claim:vllm.bench.max-concurrency-recommended}} It is the right instrument for a capacity number, a throughput at a fixed concurrency. It is the wrong one for a latency promise, which {{ks:T7.L2}} says wants Poisson arrivals. {{claim:bench.kernelspace.traffic-rule}}

:::card
kind: isomorphism
title: The gateway's connection limit
body: A cap on concurrency in a load test stands for the connection limit of a load balancer or an API gateway in front of a service. Users beyond the limit wait outside it, and the service behind it never sees more than the limit at once.
breaks: A gateway holds users back in front of the service, and their wait is real and is felt. A load-test client's cap holds its own requests back before its own timer has started, so in some tools the wait is in no number the run reports.
:::

## Warm-up: a copy of the first request

vLLM warms up with no requests unless asked, and SGLang with one. {{claim:vllm.bench.num-warmups-default}} {{claim:sglang.bench.warmup-default}} What either sends is a copy of the first request of the dataset. {{claim:vllm.bench.warmup-is-request-zero}} {{claim:sglang.bench.warmup-is-request-zero}} If the server keeps a prefix cache, that prompt is in it afterwards. Nothing in either warm-up checks that the engine has settled afterwards. The window and the check of the second lesson do.

## The cache and the seed

A second run against the same server is not a fresh run. vLLM's own guide warns that repeating the benchmark can reuse prompts left in the prefix cache and inflate throughput, and it names the ways out: vary the seed, restart or reset the server, or use `vllm bench sweep serve`, which resets the caches between runs. {{claim:vllm.bench.prefix-cache-reuse}} SGLang flushes its server's cache after the warm-up only when it is told to. {{claim:sglang.bench.flush-cache-after-warmup}} The seeds make the trap easy to fall into: the default is fixed in both tools, so two runs draw the same prompts. {{claim:vllm.bench.seed-default}} {{claim:sglang.bench.seed-default}}

## What the tools print

For each metric it reports, vLLM prints the mean and the median, and then one percentile, the 99th, unless you ask for more percentiles. {{claim:vllm.bench.metric-percentiles-default}} It computes that percentile over however many requests completed, as the second lesson showed, and its guide lists the mean, the median and the p99 on consecutive lines. {{claim:vllm.bench.percentile-numpy}} {{claim:vllm.bench.guide-mean-median-p99}} Both tools take goodput as a list of objectives in milliseconds. {{claim:vllm.bench.goodput-units}} SGLang counts a request only if it meets every one, and it has had the flag only since v0.5.23. {{claim:sglang.bench.goodput}} {{claim:sglang.bench.goodput-since}}

Two settings change what a request is. vLLM sends `max_tokens` equal to the output length of the dataset's sample, and a flag overrides that length for a whole ShareGPT run, so every reply is cut where the harness says. {{claim:vllm.bench.max-tokens-is-output-len}} {{claim:vllm.bench.sharegpt-output-len}} And SGLang sends `ignore_eos` as true unless told otherwise, so every reply runs to its length, which distorts speculation and structured output. {{claim:sglang.bench.ignore-eos-default}}

Last, the client is part of the system. SGLang's own Rust client documents that its Python predecessor, at high request counts, set the throughput it measured. Its figures for one mock server are the authors' own and the course has not reproduced them. {{claim:sglang.bench.rust-client-sets-throughput}} {{claim:sglang.bench.rust-client-2500-requests}}

## The map

Each ruling of the court is a default or a flag that someone left alone. Four of the ten are kernelspace's own broken-bench exercise, a closed loop, a capped output, a warm cache and a counted warm-up. {{claim:bench.kernelspace.broken-bench-flaws}} The Inspection adds six more, and a control with no flaw. This table sets each ruling beside the fix that the court accepts.

| The ruling | The default or flag that commits it | What fixes it |
|---|---|---|
| Closed loop past capacity | an infinite rate with `--max-concurrency` | an open loop: a finite `--request-rate` and no cap |
| Coordinated omission | any client that waits for a reply before it sends | time every request from its due time |
| Client queue hidden | a timer that starts after the semaphore | vLLM's `client_queue_time`, or log the due time yourself |
| Warm-up counted | `--num-warmups 0` in vLLM, one request in SGLang | a window declared before the run, and the check |
| Warm cache | a second run against the same server | a restart or a reset, a new `--seed`, `--flush-cache` |
| Capped output | `max_tokens` set to the sample's output length | let replies run to their natural end |
| Too few samples | a p99 printed from any number of requests | enough requests that ten lie beyond the p99 |
| Mean reported as a tail | a report with the mean beside the p99 | read the line that says p99 |
| Client bottleneck | one client thread at high concurrency | a client that keeps up with its schedule |
| Replay that ignores timestamps | a trace's lengths with a rate flag | a replay that keeps the trace's own times |

## Reading a default yourself

Three sources settle a default, in order of authority: the source at the tag you run, the `--help` of the version you run, and the documentation of that version, never of the latest. The course reads its claims at the pins each quarter, and a claim that has aged past its time to live shows as stale on the page, so a default you have stopped trusting says so.

:::card
kind: warning
title: Defaults move
body: A default belongs to a version. The flags and numbers in this lesson are those of vLLM v0.33.0 and SGLang v0.5.23. Before you trust one on another version, read that version's source or its --help, and cite the version beside the number.
:::

## What to carry

- A default is a decision. Read the ones that set the rate, the cap, the warm-up and the percentiles before you read a result.
- A cap makes a closed loop, and the rate it sends is the cap divided by the latency, whatever the rate flag says.
- Cite the version. A default is a fact about a version.

## Exit check

This lesson tests two skills: reading what a tool's defaults do and naming the flag that changes each (`tr8.tool-defaults`), and finding the wait that a cap puts before the timer (`tr8.client-queue`). The exit ticket is three items on fresh seeds. Each shows a harness and the symptom in its report, and asks which flag or default is at fault. It is passed with at least two right (ASSESSMENT §4.2).

:::item
family: tr8.which-flag
level: 2
count: 3
:::
