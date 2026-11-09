# Warm-up, sample size, and an interval on p99

_Benchmark like you mean it · lesson `tr8.l2` · review · about 85 minutes [estimated]_

Builds on kernelspace: `ks:T7.L2`, `ks:t7.benchmark-hygiene`, `ks:t7.tail-percentiles`.

Knowledge components: `tr8.warmup-rule`, `tr8.min-n-tail`, `tr8.bootstrap-p99`.

The first lesson fixed where the clock starts. This lesson fixes which requests the clock counts, and how far to trust the number it gives. Three decisions are in it: how much of the start of a run to leave out, how many requests a percentile needs, and how wide an interval to put around it. The course makes all three before the run, because a benchmark that makes them after it has seen its latencies has chosen its own answer.

## A cold engine is not the engine

kernelspace T7.L2 states the rule: warm up, then measure a steady-state window. **warm up, then measure a steady-state window** [measured] Its reason is that an engine carries state that a fresh one lacks, which that lesson lists as prefix caches that are cold, graphs that are uncaptured and kernels that are uncompiled. The first requests of a run pay for that state. Their latencies are real, and they are not the system's. A report that counts them is timing the cold start.

The tools know this, and they do something small about it. vllm bench serve sends no warm-up requests unless it is asked to. **0 requests** [measured] When it is asked, it sends copies of one request, the first of the dataset, and keeps none of their outputs. **copies of one request** [measured] SGLang's bench_serving sends a single warm-up request by default, a copy of the first request with its output length capped. **1 requests** [measured] **32 tokens** [measured]

One request, repeated, warms what one request touches: one prompt length, one output length, and the kernels and caches on that path. It does not warm the other lengths of the real traffic, and it says nothing about whether the engine has settled. A window and a check say that.

## The rule: a window, declared first

The course states the warm-up before the run, as a window of requests counted by due time: the first W, with W = max(100, 2 × `max_num_seqs`) [estimated] (ASSESSMENT B8). The `max_num_seqs` setting is the number of sequences the engine runs at once, so a busier engine gets a longer window. Requests in the window stay in the log and are reported apart, and the statistics leave them out. The window is counted in requests by due time, so it means the same requests however slow the server turns out to be. The Inspection's server runs 64 sequences [estimated], so its W is 128 requests [derived].

After the run, one check decides whether the window was long enough. The median time to first token of the first tenth of the measured requests must be at most 1.25 times [estimated] the median of the rest. If it is not, the run fails as still warming.

Both halves are deliberate. The window is fixed first, so that nobody can pick a cut that flatters the number. The check is the only thing allowed to say the window was too short, and what it says is to run again, never to cut more.

Here is the rule on a synthetic server that starts cold. For its first 12 s [estimated] it takes three times [estimated] as long to serve a step as it will later. The run sends 1,600 requests [estimated] at half of what the server can finish. A second server takes 20 s [estimated] to warm. Each p99 is the time to first token from the due time, measured by the course's sim on 2026-11-04 at `fd168df`, with the seed `5`.

| First requests left out [estimated] | 12 s warm-up: p99, ms [measured] | Settled? | 20 s warm-up: p99, ms [measured] | Settled? |
|---|---|---|---|---|
| 0 | 1,416 | no | 3,987 | no |
| 20 | 1,416 | no | 3,987 | no |
| 128, the rule's window | 139 | yes | 3,604 | no |
| 400 | 146 | yes | 141 | yes |

Read the first column down. Leaving out nothing, or 20 requests [estimated], changes nothing: the slowest hundredth of the run is deep in the cold stretch, and 20 requests do not reach it. The rule's 128 removes it, and 139 ms [measured] is what the engine does once it is warm. Leaving out 400 costs 272 requests of data [derived] for a p99 that moves by 5% [derived], so the extra cut buys nothing.

The second server shows what the check is for. Its warm-up outlasts the rule's window, so the p99 after 128 requests is 3,604 ms [measured], which is not the warm engine's number, and the run is flagged as still warming. Leaving out 400 from the same log would give 141 ms [measured], and the temptation is real. But a cut chosen after the log has been seen is the move the rule exists to stop. The honest response is to declare the longer window and run again.

> **The test you re-ran until it passed.** Re-running a flaky test until it goes green, and then reporting the green run, is choosing your sample after you have seen the result. A warm-up cut chosen after you have looked at the latencies is the same move. The data got a vote on which data counts.
>
> Where it breaks: A re-run draws new data, and a cut only throws data away, so a cut feels harmless. It is not. A cut chosen by looking at the result is chosen to improve it, and the number it produces carries that choice.

> **Play.** The game `broken-bench`, level `warm`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## How many requests does a p99 need

A percentile by nearest rank is the ceil(p × n)-th smallest of n values. For the p99 that is the `ceil(0.99 × n)`-th, and the requests beyond it are all the rest. Commit to a count, and then play The Inspection's `sure` level before you read the table.

> **Predict `tr8.l2.p1`.** A run of 250 requests [estimated] reports a p99 by nearest rank. How many of its requests lie beyond that p99?
>
> The learner commits to a number in `requests`, graded within a relative tolerance of `0` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

> **Play.** The game `broken-bench`, level `sure`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

| Requests, n [estimated] | The p99 is the nth smallest [derived] | Requests beyond it [derived] |
|---|---|---|
| 100 | 99th | 1 |
| 250 | 248th | 2 |
| 1,000 | 990th | 10 |
| 5,000 | 4,950th | 50 |

So the p99 of 100 requests is the second largest value, and the largest is all that lies beyond it [derived]. The p99 of 250 requests [estimated] is the third largest, with two beyond it [derived]. kernelspace T7.L2 puts it bluntly. **a p99 needs samples** [measured] The course asks for at least 1,000 measured requests [estimated], so that at least 10 lie beyond the p99 [derived] (ASSESSMENT B7).

Neither tool enforces anything like it. vllm bench serve computes each percentile over however many requests completed, ten or ten thousand. **np.percentile** [measured] Its own guide opens with an example of ten prompts that prints a P99 line, which for ten values can only sit between the two largest. **79.49 ms** [measured] In that output the mean, the median and the p99 are consecutive lines, so a reader who skims for the latency can take the wrong one. **mean, median, p99** [measured] The court names that mistake a mean reported as a tail.

## An interval on the p99

A p99 from n requests is one draw. It depends on which requests the run happened to hold, and a second run would give another. A bootstrap interval says how far another draw might land. The course's recipe is the percentile bootstrap (A§5.6): resample the n latencies with replacement, take the p99 of the resample by nearest rank, repeat 1,000 times [estimated], and read the 2.5th and the 97.5th percentiles of those p99s as a 95% interval [estimated]. The resampler is seeded, so the same log always gives the same interval.

The width of the interval says how many requests you needed. Here the latencies come from the course's exponential table, with a mean of 100 ms [estimated], and the table gives the median, over seeds, of the width of the 95% interval on the p99. Measured by the course's sim on 2026-11-04 at `fd168df`.

| Requests, n [estimated] | Seeds [estimated] | Median width of the interval, ms [measured] |
|---|---|---|
| 250 | 40 | 197 |
| 1,000 | 40 | 110 |
| 4,000 | 20 | 57 |

Four times the requests roughly halves the interval [derived]: the ratios of the widths are 197 ÷ 110 = 1.8 and 110 ÷ 57 = 1.9 [derived]. That is the square-root law, and it is the price of precision: to halve the interval, quadruple the run. Read the width before you read the number. A p99 of 900 ms [estimated] with an interval from 600 to 1,500 ms [estimated] cannot tell an engine that is really at 700 ms from one that is really at 1,300 ms.

One more honest fact about the method. The textbook percentile bootstrap is a little short in the far tail. Its nominal 95% interval [estimated] on a p99 covers the true p99 92.6% of the time at 1,000 requests and 94.6% at 5,000 [measured]. These are exact coverages for any continuous distribution, averaged over 100 resampler seeds at 1,000 requests and over 20 at 5,000 [estimated], from the course's sim on 2026-11-04 at `fd168df`. So the floor of 1,000 requests [estimated] is a floor and not a comfort, and an interval from fewer requests should be read as wider than it looks.

> **An interval covers noise, not mistakes.** A bootstrap interval says how far one run's own sampling noise could move the p99. It does not cover a server restarted between two runs, a GPU that throttled, or a flaw in the setup. Report the interval with the setup it belongs to, and compare two runs only when their setups are the same.

> **Card.** The notional-machine card `trace-room-bench`.

## What to carry

- Declare the warm-up window before the run, check afterwards that the run had settled, and rerun with a longer window if it had not.
- Count the requests beyond a percentile before you trust it. A p99 needs ten of them at the least.
- Put an interval on the number and read its width first. Quadruple the run to halve the interval.

## Exit check

This lesson tests three skills: fixing the warm-up by the rule and checking it (`tr8.warmup-rule`), counting what lies beyond a percentile (`tr8.min-n-tail`), and reading the width of a bootstrap interval (`tr8.bootstrap-p99`). The graded `warm` and `sure` levels draw a fresh report each time. Each asks you to name the flaw, or to say that the inspection is fair, and to write down the p99 that stands with the range you stand behind. The bar for each is all of it right on three fresh seeds [estimated] (ASSESSMENT §4.3).

> **Play.** The game `broken-bench`, level `warm`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

> **Play.** The game `broken-bench`, level `sure`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## Claims cited

- `bench.kernelspace.samples-rule`: kernelspace's T7.L2 teaches that percentiles need samples: a p99 computed from 20 requests is astrology, and each step of a sweep should hold hundreds of requests. Value a p99 needs samples [measured], checked 2026-11-04 (source: kernelspace T7.L2, Benchmarking Methodology, rule 3 (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/public/lessons-md/t7.l2.md#L20>, read 2026-11-04).
- `bench.kernelspace.warm-up-rule`: kernelspace's T7.L2 teaches that a benchmark that includes the first minutes measures the cold start and not the system: warm until the first-token p50 stabilizes, then measure a steady-state window and report it. Value warm up, then measure a steady-state window [measured], checked 2026-11-04 (source: kernelspace T7.L2, Benchmarking Methodology, rule 2 (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/public/lessons-md/t7.l2.md#L16>, read 2026-11-04).
- `sglang.bench.warmup-default`: bench_serving sends 1 warm-up request by default, and --flush-cache, which flushes the server's cache before the run, is opt-in. Value 1 requests [measured], checked 2026-11-04 (source: SGLang v0.5.23, benchmark/serving.py, --warmup-requests <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/benchmark/serving.py#L2697-L2712>, read 2026-11-04).
- `sglang.bench.warmup-is-request-zero`: In bench_serving the warm-up requests are copies of the first request of the dataset, with the output length capped at 32 tokens, and they run at the same concurrency as the measured run, so --warmup-requests does not become a burst of its own. Value 32 tokens [measured], checked 2026-11-04 (source: SGLang v0.5.23, python/sglang/benchmark/serving.py, benchmark (the warm-up) <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/benchmark/serving.py#L1466-L1501>, read 2026-11-04).
- `vllm.bench.guide-mean-median-p99`: In vLLM's benchmarking guide the sample output lists the time to first token on three consecutive lines, as a mean (71.54 ms), a median (73.88 ms) and a 99th percentile (79.49 ms), in that order. Value mean, median, p99 [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/benchmarking/cli.md, the first example's output <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/benchmarking/cli.md#L118-L120>, read 2026-11-04).
- `vllm.bench.guide-ten-prompts`: The first example in vLLM's benchmarking guide runs ten prompts (`--num-prompts 10`), and its sample output, which begins `Successful requests: 10`, prints a `P99 TTFT (ms)` line of 79.49. Value 79.49 ms [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/benchmarking/cli.md, the first example and its output <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/benchmarking/cli.md#L103-L121>, read 2026-11-04).
- `vllm.bench.num-warmups-default`: --num-warmups defaults to 0 at v0.33.0, so a run counts its first, cold requests unless the user asks for warm-ups. Value 0 requests [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/benchmarks/serve.py, --num-warmups <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/benchmarks/serve.py#L1781-L1785>, read 2026-11-04).
- `vllm.bench.percentile-numpy`: In calculate_metrics, vllm bench serve takes each time-to-first-token percentile by passing the list of values straight to NumPy's np.percentile, with no check on how many there are. A run of ten requests reports a p99 just as a run of ten thousand does. Value np.percentile [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/benchmarks/serve.py, calculate_metrics (the TTFT percentiles) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/benchmarks/serve.py#L786-L788>, read 2026-11-04).
- `vllm.bench.warmup-is-request-zero`: In vllm bench serve the warm-up requests are all one and the same, test_input, which is built from the first request of the dataset. They are sent together before the main run, under the concurrency cap when there is one, and none of their outputs is kept. Value copies of one request [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/benchmarks/serve.py, benchmark (the test run and the warm-up) <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/benchmarks/serve.py#L875-L945>, read 2026-11-04).
