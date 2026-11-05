---
id: tr8
title: Benchmark like you mean it
status: review
hours: 5                          # [estimated]; docs/PLAN.md §4
hours_by_lane: { B: 3.5, F: 1.5 } # [estimated]
outcomes:
  - Time every request from when it was due, and say what a benchmark that times it from the send leaves out
  - Declare a warm-up by a rule fixed before the run, and put a bootstrap interval on a p99 that has enough requests beyond it
  - Read the defaults of vllm bench serve and sglang.bench_serving, and name the flags that change them
  - Say whether a replay keeps a trace's timing, and name the denominator of a goodput
artifacts:
  - id: broken-bench
    lane: B
    title: "A seeded corpus of broken benchmarks, extending kernelspace's broken-bench"
  - id: tr8.replay
    lane: F
    title: A timestamp-faithful BurstGPT replay against the pinned vLLM, re-checked from raw records
worlds: [trace-room-bench]       # the notional-machine cards it uses, as content/cards/<id>.md
prereqs: [ks:T7.L1, ks:T7.L2]
pins: [vllm, sglang]
lanes: [B, F]
games: [broken-bench]
labs: [tr8.replay]
---

A number from a benchmark is a claim about a system, and it is only as good as the way it was timed. This module is about the timing. It takes the broken-bench and knee exercises that {{ks:T7.L2}} sends you to, and adds what they leave out: a latency counts from the moment its request was due, a warm-up is cut by a rule fixed before the run, a percentile needs requests beyond it and an interval around it, and a replay keeps the trace's times. It is the first half of the course's fourth outcome. The second half, landing an upstream artifact under the project's own rules, is TR7, and TR7 follows the rules set here.

## The browser part

The browser part is four lessons and a game, and none of it needs a GPU.

1. Due time, not send time: open loop, closed loop and coordinated omission.
2. Warm-up, sample size, and an interval on p99.
3. The tools' defaults, flag by flag: vllm bench serve and sglang.bench_serving.
4. Replay a trace in time, not just in shape, and name your goodput's denominator.

The game is The Inspection (`broken-bench`). It has four levels, `due`, `warm`, `sure` and `court`. In each, a seeded report went wrong in one way, and you name the flaw and write down the p99 it should have had, with the range you stand behind. Every log in it is synthetic, drawn by the course's simulator and labelled as such. The real tools and the real engine are the judge. Each lesson ends in a check on fresh numbers, so recognizing last time's answer earns nothing.

## The part that needs a GPU

The GPU part is a lab, `tr8.replay`: a timestamp-faithful replay of a BurstGPT window against the pinned vLLM, open loop, whose receipt your browser re-checks from the raw rows. It arrives with the grader (W2, D-039). Until then the Build card below shows what the lab will ask and does not run it. The plan for its three stages is a smoke replay of about 60 s [estimated] that is practice, the graded replay of a seeded window with at least 1,000 measured requests [estimated], and an optional run of vLLM's own tool on the same window, which the lab labels length-shaped and not time-shaped.

Credit follows the same line. The module is browser-complete when its exit tickets and the four levels of The Inspection are credited. It is complete when the replay's second stage is credited as well, and a Prove-it run with the agent closed is on record (ASSESSMENT §9).

:::lab
id: tr8.replay
lane: F
stages: [s1, s2, s3]
:::

:::card
kind: notional-machine
id: trace-room-bench
:::
