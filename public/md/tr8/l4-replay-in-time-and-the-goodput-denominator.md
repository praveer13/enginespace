# Replay a trace in time, not just in shape, and name your goodput's denominator

_Benchmark like you mean it · lesson `tr8.l4` · review · about 40 minutes [estimated]_

Builds on kernelspace: `ks:T7.L1`, `ks:t7.goodput`, `ks:t7.goodput-curve`.

Knowledge components: `tr8.time-shaped-replay`, `tr8.goodput-denominator`, `tr8.littles-law`.

Two quiet ways a number gets redefined, and one check that any log can run on itself. A replay can keep a trace's shape and drop its time. A goodput can divide by a denominator that nobody names. And Little's law says whether a log's own numbers agree with one another. Commit to one piece of arithmetic first.

> **Predict `tr8.l4.p1`.** A run offers 1,000 requests [estimated] over an arrival window of 60 s [estimated]. Of them, 600 [estimated] meet both objectives. The queue drains after the window, and the last reply comes 100 s [estimated] after the first request was generated. A tool divides the requests that met both objectives by the duration of the whole run. What goodput does it report, in requests a second?
>
> The learner commits to a number in `requests/s`, graded within a relative tolerance of `0.02` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

## Shape or time

A trace is a list of requests, and each row says two things: what the request is, which is its prompt length and its output length, and when it arrived. The lengths set what a request costs. The times set how many are in the system at once. A replay that keeps the lengths and loses the times keeps the costs and loses the load. That is a trace's shape without its time, and it is the flaw the court calls a replay that ignores timestamps.

The tools differ in what they keep. vLLM's `burstgpt` dataset samples rows of the CSV at random and reads only two token counts from each, by column position. It does not read the timestamp. **two token counts by column position** [measured] The arrivals then come from `--request-rate` and `--burstiness`, because a trace's own timing is used only with `--self-timed`, which is off except for the `timed_trace` dataset. **False except for timed_trace** [measured] Keeping a trace's times therefore takes a flag and a loader that reads them, and vLLM's `burstgpt` loader does not. SGLang can schedule by a trace's timestamps for one dataset only. **only for the mooncake dataset** [measured] For that dataset it replays in time, each request due at its timestamp scaled by a slowdown factor, and says that it is ignoring the rate flag. **the timestamps in the Mooncake trace file** [measured] **ignoring --request-rate** [measured] Neither tool replays BurstGPT in time as it ships, then. kernelspace's burstgpt-replay field lab ran into the same wall and says so: its run asks about a saturated throughput ceiling and not about arrival bursts. **lengths only, no timestamps** [measured] The course's lab brings a client of its own.

BurstGPT is a real trace of LLM requests, released with its paper under a licence that asks for attribution, and its README asks that research which uses the trace cites the paper. **CC BY 4.0** [measured] **cite the KDD '25 paper** [measured] Its Timestamp column is the time the request was submitted, which is exactly the time a replay needs for the request's due time. **request submission time** [measured] Some of its files add an Elapsed time, which is not the time to first token, so a column that looks like a latency is not the quantity this module times. **not the same as TTFT** [measured] And a failed request is marked by a response of zero tokens, so a replayer has to decide what to do with those rows. **Response tokens of 0** [measured]

The reason to keep the times is that queues form in bursts. The file's busiest minute holds **1095 requests** [measured], and an average minute of its busiest hour holds **555.08 requests per minute** [derived], a ratio of about **1.97 x** [derived]. The two fall in different parts of the file, so this sets two peaks side by side. It shows the point all the same: a replay at an hour's mean rate has no such minute in it.

Here is the effect in the course's own world, on a synthetic rush. The trace runs 70 s [estimated] at 40% [estimated] of what the server can finish, then 8 s [estimated] at 160% [estimated], then 70 s [estimated] at 40% [estimated]. It holds 1,159 requests [measured], so 11 lie beyond its p99 [derived]. The two runs send the same requests to the same server. One replays the trace in time, and the other sends the requests at the trace's mean rate, which is 45% [measured] of the server's capacity, as `--request-rate` would. Measured by the course's sim on 2026-11-04 at `fd168df`, with the seed `7`.

| Replay | p50, ms [measured] | p90, ms [measured] | p99, ms [measured] |
|---|---|---|---|
| in time, at the trace's own pace | 63 | 1,883 | 3,814 |
| at the trace's mean rate | 59 | 92 | 127 |

The medians agree to within 7% [derived], and the p99 differs by a factor of 30 [derived]. A report that replayed at the mean rate would have called the server comfortable, and the rush would have found otherwise. The median could not tell the two apart, which is why a replay is checked on its tail.

## The part that needs a GPU

The Build step of this module is a lab, `tr8.replay`, and it needs one. It replays a window of BurstGPT in time against the pinned vLLM, open loop, with the trace's own times and a seeded speed factor, and it produces a receipt whose raw rows your browser re-checks with everything in these lessons: the percentiles, the interval, both goodputs, the arrival adherence and Little's law. It arrives with the grader (W2, D-039). Until then the module page shows it as a Build card and does not run it, and nothing in this lesson pretends otherwise. What you can do now is the part that makes its receipt believable, on logs the simulator draws.

## Goodput and its denominator

Goodput counts the requests that met every objective, per second. kernelspace T7.L1 introduced it as the one number a serving business optimizes. The count is the part everyone agrees on. The per-second is where tools differ, because they divide by different clocks.

vLLM divides by the benchmark duration, which runs from just before the first request is generated to just after the last has returned. **good_completed / dur_s** [measured] SGLang divides by the time from the first send to the last completion. **good requests / benchmark duration** [measured] Both put the drain tail in the denominator, the time a backed-up queue takes to empty after the last arrival. kernelspace's knee does not. It divides by its arrival window and counts the requests that met the SLO wherever they finish. **SLO-met requests ÷ the arrival window** [measured] The reason is in the exercise's own comment. **a longer window would not do** [measured]

The course reports the window's goodput and shows the other beside it, labelled (ASSESSMENT B9). The table runs one server at four loads for 60 s [estimated] of Poisson arrivals each, with a time-to-first-token objective of 500 ms [estimated] and a time-per-output-token objective of 50 ms [estimated]. Measured by the course's sim on 2026-11-04 at `fd168df`, with the seed `11`.

| Load, times capacity [estimated] | Offered [measured] | Met both [measured] | Over the arrival window, requests/s [measured] | Over the whole run, requests/s [measured] | The whole run, s [measured] |
|---|---|---|---|---|---|
| 0.5 | 483 | 483 | 8.05 | 7.75 | 62.3 |
| 1 | 971 | 835 | 13.92 | 13.42 | 62.2 |
| 2 | 1,972 | 64 | 1.07 | 0.54 | 117.6 |
| 3 | 3,005 | 25 | 0.42 | 0.14 | 178.0 |

At light load the two agree to within 4% [derived]. Under overload they part. At twice the capacity the whole-run figure is half the window's, and at three times it is a third, because the denominator has grown by the drain tail. The ratio of the two goodputs is the ratio of the run's length to the window's [derived]. Both fall off a cliff past capacity, which is the knee. Neither denominator is wrong. The window's asks how much good work the server did for each second of load offered. The whole run's asks the same of each second the run took, cleanup included. A goodput that does not say which cannot be compared with another.

## Little's law: the log checks itself

Little's law says that the long-term average number of requests in a stationary system equals their arrival rate times the average time each spends in it. **L = lambda * W** [measured] For a benchmark that reads: mean concurrency equals throughput times mean latency, on a window where the system is steady. At 8 requests a second [estimated] and a mean latency of 2 s [estimated], 16 requests are in flight on average [derived]. If the log's own count of requests in flight comes to 40 [estimated] on average, something is wrong with it: a timestamp, a dropped row, or a window in which the queue was growing.

The same four runs, read through the law, over their arrival windows and counting a request from its send.

| Load, times capacity [estimated] | In flight, L [measured] | Throughput times mean latency [measured] | Residual [measured] |
|---|---|---|---|
| 0.5 | 16.7 | 16.4 | 1.8% |
| 1 | 57.0 | 55.1 | 3.4% |
| 2 | 511.5 | 265.3 | 48% |
| 3 | 1,013.4 | 345.3 | 66% |

The run at half the capacity is steady, and the two sides agree to within 2% [measured]. The course allows 5% [estimated] (ASSESSMENT B10). At capacity the residual starts to show, and beyond it the run is not stationary, because the queue is still growing when the window ends, so the sides part. A failed check does not say which of the log or the run is at fault. It says that one of them is, and that the number should not be published yet. The third lesson's prediction was this law at work: eight permits held for 1.2 s each is 6.7 sends a second [derived], so a cap is Little's law written as a flag.

> **The access log you replayed.** You have replayed an access log through a load tool at a steady rate, and the only thing that mattered about the log was its timestamps, which the tool ignored. A model server's trace is the same kind of file, with two columns that matter, when the request came and how long a request it was.
>
> Where it breaks: Web requests are often close to one another in cost, so a steady replay of their rate is a fair stand-in. Model requests are not. A prompt length and an output length set the cost, and a burst of long ones queues in a way that the same requests spread evenly never do. A replay that keeps the lengths and loses the times keeps the cost and loses the load.

> **A number without its denominator.** A goodput in requests a second says nothing until it says what it was divided by. Print the denominator beside every goodput, and refuse to compare two that divide by different clocks.

> **Card.** The notional-machine card `trace-room-bench`.

## What to carry

- A replay is a trace's lengths and its times. Keep both, or label the replay as length-shaped.
- Name the denominator of every goodput: the arrival window, or the whole run with its drain tail.
- Run Little's law on a log you did not produce. If it disagrees, find out why before you trust a number from it.

## Exit check

This lesson tests three skills: telling a replay that keeps a trace's times from one that keeps only its shape (`tr8.time-shaped-replay`), naming the denominator of a goodput (`tr8.goodput-denominator`), and checking a log with Little's law (`tr8.littles-law`). The exit ticket is three items on fresh seeds, two on denominators and one on the law, passed with at least two right (ASSESSMENT §4.2). The graded court then puts every skill of the module in front of you at once: five reports, of which four [estimated] must stand with the flaw and the number right (ASSESSMENT §4.3).

> **Practice.** Items from the generator family `tr8.goodput-denominator`, level `2`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Practice.** Items from the generator family `tr8.littles-law`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Play.** The game `broken-bench`, level `court`, in `graded` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

## Claims cited

- `bench.burstgpt.busiest-minute-rows`: In the same file, the busiest aligned 60-second window holds 1,095 requests, which kernelspace's trace slice samples down to 40. Value 1095 requests [measured], checked 2026-11-04 (source: kernelspace public/traces/README.md (at d478f91), the busiest-minute slice <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/public/traces/README.md#L13>, read 2026-11-04).
- `bench.burstgpt.cite-paper`: BurstGPT's README asks that anyone who uses the trace in research reference its paper, BurstGPT: A Real-World Workload Dataset to Optimize LLM Serving Systems (KDD '25). Value cite the KDD '25 paper [measured], checked 2026-11-04 (source: BurstGPT README at its v2.0 tag, Paper <https://github.com/HPMLL/BurstGPT/blob/v2.0/README.md#L62>, read 2026-11-04).
- `bench.burstgpt.elapsed-not-ttft`: In the files that have an Elapsed time column, that time runs from submission to the complete final response, all tokens included, and BurstGPT's README says it is not the same as TTFT. Value not the same as TTFT [measured], checked 2026-11-04 (source: BurstGPT README at its v2.0 tag, Schema <https://github.com/HPMLL/BurstGPT/blob/v2.0/README.md#L43>, read 2026-11-04).
- `bench.burstgpt.failures`: The BurstGPT files that keep failures mark a failed request with a Response tokens value of 0, and the files named without_fails leave those rows out. Value Response tokens of 0 [measured], checked 2026-11-04 (source: BurstGPT README at its v2.0 tag, Data <https://github.com/HPMLL/BurstGPT/blob/v2.0/README.md#L25-L27>, read 2026-11-04).
- `bench.burstgpt.hour-mean-per-minute`: The busiest hour of the file averages about 555 requests a minute, which is its 33,305 requests over 60 minutes. Value 555.08 requests per minute [derived], checked 2026-11-04 (derived as bench.burstgpt.busiest-hour-rows / 60).
- `bench.burstgpt.license`: The BurstGPT repository carries the Creative Commons Attribution 4.0 International licence. Value CC BY 4.0 [measured], checked 2026-11-04 (source: BurstGPT LICENSE at its v2.0 tag <https://github.com/HPMLL/BurstGPT/blob/v2.0/LICENSE#L1>, read 2026-11-04).
- `bench.burstgpt.minute-over-hour-mean`: The file's busiest minute holds about 1.97 times the requests of an average minute of its busiest hour. The two fall in different parts of the file, so this sets two peaks of the file side by side, and not one hour's own peak against its own mean. Value 1.97 x [derived], checked 2026-11-04 (derived as bench.burstgpt.busiest-minute-rows / bench.burstgpt.hour-mean-per-minute).
- `bench.burstgpt.timestamp-column`: BurstGPT's Timestamp column is the request submission time, in seconds from midnight at the start of the first day. It records when each request was submitted, which is the time a replay needs for its due time. Value request submission time [measured], checked 2026-11-04 (source: BurstGPT README at its v2.0 tag, Schema <https://github.com/HPMLL/BurstGPT/blob/v2.0/README.md#L41>, read 2026-11-04).
- `bench.kernelspace.burstgpt-lab-limits`: kernelspace's burstgpt-replay field lab says that vLLM's BurstGPT loader reads only the two token counts of a row, never the timestamps, and that a request rate of infinity sends all the requests at once, so the lab measures a saturated throughput ceiling and not arrival bursts. Value lengths only, no timestamps [measured], checked 2026-11-04 (source: kernelspace src/data/field-labs/burstgpt-replay.ts, the lab's own limits (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/src/data/field-labs/burstgpt-replay.ts#L2-L15>, read 2026-11-04).
- `bench.kernelspace.knee-fixed-window`: kernelspace's knee exercise holds its arrival window at 40 s and cuts the sped-up trace at it, because a trace compressed into a shorter window has a shorter denominator, and its goodput would rise again under overload. Value a longer window would not do [measured], checked 2026-11-04 (source: kernelspace src/lib/world/fleet-ex/knee.ts, the sweep (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/src/lib/world/fleet-ex/knee.ts#L22-L25>, read 2026-11-04).
- `bench.kernelspace.knee-goodput`: kernelspace's knee exercise reports goodput as the requests that met the SLO, wherever they finish, divided by the 40 s of the trace's arrival window, and never as a percentage of the engine's own. Value SLO-met requests ÷ the arrival window [measured], checked 2026-11-04 (source: kernelspace src/lib/world/fleet-ex/knee.ts, the sweep (at d478f91) <https://github.com/praveer13/kernelspace/blob/d478f91a0af590f03fcfd76ee73149fa70b28e51/src/lib/world/fleet-ex/knee.ts#L28-L29>, read 2026-11-04).
- `bench.littles-law`: Little's law says the long-term average number of customers in a stationary system equals their long-term average arrival rate times the average time each spends in the system. For a benchmark, mean concurrency equals throughput times mean latency on a stable run. Value L = lambda * W [measured], checked 2026-11-04 (source: Little's law, Wikipedia (the proof is J. D. C. Little, Operations Research 9(3), 1961) <https://en.wikipedia.org/wiki/Little%27s_law>, read 2026-11-04).
- `sglang.bench.goodput-duration`: SGLang's bench_serving divides the requests that met every SLO by the duration of the whole run, which is measured from the first send to the last completion. Value good requests / benchmark duration [measured], checked 2026-11-04 (source: SGLang v0.5.23, python/sglang/benchmark/goodput.py, calculate_goodput <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/benchmark/goodput.py#L48>, read 2026-11-04).
- `sglang.bench.mooncake-generator`: SGLang's Mooncake request generator yields requests based on the timestamps in the trace file. Each is due at its timestamp, counted from the first row and scaled by a slowdown factor. Value the timestamps in the Mooncake trace file [measured], checked 2026-11-04 (source: SGLang v0.5.23, python/sglang/benchmark/datasets/mooncake.py, get_mooncake_request_over_time <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/benchmark/datasets/mooncake.py#L56-L76>, read 2026-11-04).
- `sglang.bench.mooncake-in-time`: For the mooncake dataset on the sglang backend, bench_serving prints that it is using the time-based Mooncake request scheduler and ignoring --request-rate. Value ignoring --request-rate [measured], checked 2026-11-04 (source: SGLang v0.5.23, python/sglang/benchmark/serving.py, benchmark (the Mooncake request scheduler) <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/benchmark/serving.py#L1554-L1559>, read 2026-11-04).
- `sglang.bench.trace-timestamps-mooncake-only`: SGLang's bench_serving can schedule requests by the timestamps in a trace file, but its own help says the option is only valid for the mooncake dataset. Value only for the mooncake dataset [measured], checked 2026-11-04 (source: SGLang v0.5.23, python/sglang/benchmark/serving.py, --use-trace-timestamps <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/benchmark/serving.py#L2472-L2476>, read 2026-11-04).
- `vllm.bench.burstgpt-lengths-only`: In vLLM v0.33.0 the `burstgpt` dataset samples rows of the CSV at random under a seed, and reads from each row only its two token counts, by column position (`data[i][2]` and `data[i][3]`). The class does not read the Timestamp column. Read from the source and not run. Value two token counts by column position [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/benchmarks/datasets/datasets.py, BurstGPTDataset.sample <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/benchmarks/datasets/datasets.py#L3066-L3067>, read 2026-11-04).
- `vllm.bench.goodput-denominator`: vllm bench serve divides the requests that met every objective by dur_s, the benchmark duration. The duration is taken from just before the first request is generated to just after the last request has returned, so a run that is still draining its queue counts that time in the denominator. Value good_completed / dur_s [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/benchmarks/serve.py, calculate_metrics (request_goodput); the clock is started at line 1048 and read at line 1123 <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/benchmarks/serve.py#L777-L780>, read 2026-11-04).
- `vllm.bench.self-timed-default`: In `vllm bench serve` the trace's own timing is used only with `--self-timed`, which defaults to False except for `--dataset-name=timed_trace`. When it is off, the user's generation rates are used and the timing in the trace is ignored. Value False except for timed_trace [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/benchmarks/serve.py, the --self-timed argument <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/benchmarks/serve.py#L1838-L1845>, read 2026-11-04).
