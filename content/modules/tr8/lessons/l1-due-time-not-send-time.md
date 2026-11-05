---
id: tr8.l1
module: tr8
title: "Due time, not send time: open loop, closed loop and coordinated omission"
minutes: 50                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr8.latency-from-due, tr8.open-vs-closed, tr8.client-queue]
builds_on: [ks:T7.L2, ks:t7.benchmark-hygiene]
status: review                    # draft | review | live
lanes: [B]
games: [broken-bench]
---

{{ks:T7.L2}} gave a benchmark four rules: the traffic is the benchmark, warm up, give a percentile its samples, and compare stacks on identical everything. All four lean on something they never say, which is when the timer starts. A latency is the difference of two clocks, and a harness chooses both. This lesson is about the clock that starts, and about three ways a harness starts it late without telling you: a client that waits for the server, a stall that the client waits through, and a cap that holds a request back before its timer has begun.

## Two clocks per request

Every request in a benchmark has two times. Its **due** time is when the schedule meant to send it. Its **sent** time is when the client did. If the client keeps up, the two are equal. If it does not, because it was blocked on a reply or on a free slot, the request goes out late, and that wait is real: a user who was due at one moment and served at another waited for both.

A harness that starts its stopwatch at the send reports only the second wait. The course times every request from its due time (ASSESSMENT B5) and keeps the sent time beside it, so that the gap shows. Latency from the due time is the sum of the two waits:

```text
from due  =  (sent - due)  +  (first token - sent)
              the slip         what a stopwatch started at the send times
```

In The Inspection every report brings its log, and the log keeps both times for each order. The `due` level hands you one report whose stopwatch started at the send. Its desk has a switch that starts the stopwatch at the due time instead (`T`). Your job is to say what is wrong with the number the report quotes, and what number it should have quoted. Commit to one prediction first.

:::predict
id: tr8.l1.p1
prompt: "A client sends 200 requests, one due every 500 ms [estimated], and waits for each reply before it sends the next. The server answers each in 100 ms [estimated], except that it freezes for 2 s [estimated] as the third request is sent, so that reply arrives 2,100 ms [estimated] after its send. A stopwatch started at each send reports a p99 latency for the whole run. What does it report?"
answer: { kind: numeric, unit: ms, rel_tol: 0.1 }
reveal: after-game
kcs: [tr8.latency-from-due, tr8.open-vs-closed]
:::

:::game
id: broken-bench
level: due
mode: practice
:::

## What the stopwatch saw

Here is the log of the prediction, for its first eight requests. The client sends a request when it is due or when its last reply has come, whichever is later.

| Request | Due, ms [estimated] | Sent, ms [derived] | Reply, ms [derived] | Timed from the send, ms [derived] | Timed from the due time, ms [derived] |
|---|---|---|---|---|---|
| #1 | 0 | 0 | 100 | 100 | 100 |
| #2 | 500 | 500 | 600 | 100 | 100 |
| #3 | 1,000 | 1,000 | 3,100 | 2,100 | 2,100 |
| #4 | 1,500 | 3,100 | 3,200 | 100 | 1,700 |
| #5 | 2,000 | 3,200 | 3,300 | 100 | 1,300 |
| #6 | 2,500 | 3,300 | 3,400 | 100 | 900 |
| #7 | 3,000 | 3,400 | 3,500 | 100 | 500 |
| #8 | 3,500 | 3,500 | 3,600 | 100 | 100 |

:::figure
src: figures/tr8/l1-slip.svg
alt: Two timelines of the same eight requests, when each was due and when each was sent, with four of them sent in a bunch at the end
description: The top timeline marks when each of eight requests was due, evenly spaced. The bottom one marks when the client sent each and how long each took. The third request takes most of the width, because the server froze while it was answered and the client was blocked on it. The four requests that fell due meanwhile are sent one after another when it ends, and a dashed line joins each of them to its due tick.
origin: authored
:::

Request #3 is the one the freeze caught, and it took 2,100 ms [derived] either way. Requests #4 to #7 are the ones the stopwatch never saw. Each fell due while the client was still blocked on request #3, so each went out late, by 1,600, 1,200, 800 and 400 ms [derived], and then took 100 ms [derived]. The stopwatch timed the 100 ms [derived]. The four waits add up to 4,000 ms [derived] that no latency in the log contains.

Five of the 200 requests [estimated] were touched by the freeze, and the stopwatch saw one of them. With 200 values the p99 is the 198th smallest, which is the third largest [derived]. Timed from the send, the third largest is 100 ms [derived]. Timed from the due time it is 1,300 ms [derived]. The freeze is in the maximum of both views, 2,100 ms [derived], and nowhere in the p99 of the stopwatch's.

## Open and closed

The toy client was a closed loop: it sent a request only when the last one came back. That is one of two ways to offer load, and Schroeder, Wierman and Harchol-Balter named both. In a closed system new requests are triggered only by completions, and in an open system they arrive independently of completions. {{claim:bench.schroeder.closed-vs-open}} In The Inspection's kitchen an open loop is walk-ins, who arrive when they arrive, and a closed loop is a fixed set of tables, which order again only after their last plate lands.

Production traffic is open. The people calling an API do not know one another, and none of them waits for someone else's reply before asking. A closed-loop generator is a different system, because its load follows the server: the slower the server gets, the less it asks of it. kernelspace's T7.L2 gave each a job. {{claim:bench.kernelspace.traffic-rule}} A closed loop holds concurrency steady, which a saturation curve needs. It is the wrong instrument for a latency claim about traffic that does not slow down when the server does.

| When the server stalls | An open loop | A closed loop |
|---|---|---|
| New requests | keep arriving on schedule | wait, because every client is blocked on its own reply |
| The queue at the server | grows with every arrival | cannot hold more requests than there are clients |
| What the log records | the wait of every request that fell due | the wait of the requests already sent |

A pure closed loop has no due times at all, so there is nothing to correct against. Its log shows no slip, and it cannot show a queue. That is the flaw The Inspection calls a closed loop past capacity.

## Coordinated omission

The slip in the toy log is **coordinated omission**: the client and the server coordinate, without meaning to, to leave the worst waits out of the measurement. wrk2 was built to avoid it, and the fix its author chose is the one the course uses: measure each response from the time its transmission should have occurred under the constant throughput set for the run. {{claim:bench.wrk2.from-should-have}} A harness that cannot send on schedule can also correct its latencies afterwards, if it knows the interval it meant to keep. {{claim:bench.wrk2.hdr-compensation}}

The README's second example shows the size of the effect, in a run with one pause of 1.4 s [measured] on the server. {{claim:bench.wrk2.example-2-run}} Timed from when each request should have been sent, the p99 is {{claim:bench.wrk2.stall-corrected-p99}}. Timed from the send it is {{claim:bench.wrk2.stall-uncorrected-p99}}, a ratio of about {{claim:bench.wrk2.stall-ratio}}. These are the author's figures, and the course has not reproduced them.

The arithmetic behind them is short. A pause of 1.4 s [measured] at 2,000 requests a second [measured] leaves 2,800 requests due [derived]. The run recorded {{claim:bench.wrk2.stall-recorded-count}}, so those are 7.1% [derived] of them, far more than the 1% [derived] that a p99 looks at. The stopwatch never timed those requests. It timed the few that were already in flight when the pause began, and its log shows the pause only at its 99.9th percentile, {{claim:bench.wrk2.stall-uncorrected-p999}}, where a p99 never looks.

## The queue you did not time

There is a third way to hold a request back, and it needs no stall: a cap on how many requests are in flight. Both tools build `--max-concurrency` as a semaphore around each request, so a run that has a schedule and a cap is a closed loop with a schedule on top of it. A request that falls due when the cap is full waits for a permit. {{claim:vllm.bench.max-concurrency-closed-loop}} {{claim:sglang.bench.max-concurrency-semaphore}}

Where the timer starts decides whether that wait is ever seen. SGLang's request function takes its start time as it begins, after the semaphore, so the wait for a permit is in no latency it reports. {{claim:sglang.bench.timer-inside-request}} vLLM records the wait apart, as `client_queue_time`, and starts the request's own clock at the send. {{claim:vllm.bench.client-queue-time}} The third lesson reads both flag by flag. Here is what a cap does in the course's own world.

Every row uses the same server and the same offered traffic, and the freeze rows add a freeze of 3 s [estimated] in the middle of the run. The open loop sends 1,500 requests [estimated] at half of what the server can finish, which is 8.6 requests a second [measured]. The other harness has the same schedule and a cap of 24 requests in flight [estimated]. Measured by the course's sim on 2026-11-04 at `fd168df`, with the seed `7`.

| Harness | The run | Timer starts at | p99 time to first token, ms [measured] |
|---|---|---|---|
| Open loop | no freeze | the send, which is the due time | 136 |
| Open loop | freeze | the send, which is the due time | 2,187 |
| Capped | no freeze | the send | 124 |
| Capped | no freeze | the due time | 920 |
| Capped | freeze | the send | 140 |
| Capped | freeze | the due time | 2,599 |

The capped harness's own stopwatch reported 140 ms [measured] for a run in which the users who fell due during the freeze waited seconds. Timed from the due time it agrees with the open loop, within a fifth [derived]. Even without a freeze, the cap hides a queue: Poisson arrivals come in clumps, a clump that takes the number in flight past the cap waits for permits, and the stopwatch starts only when a permit is granted. That is 124 ms from the send against 920 ms from the due time [measured].

You can read the slip off a log, if the log keeps both times: subtract due from sent for every row. An open loop that keeps up has a slip of about zero. The course's rule for a receipt allows at most 2 ms [estimated] for 99.9% [estimated] of the rows and at most 20 ms [estimated] for all of them (ASSESSMENT B4), and a run that falls further behind is coordinated omission. In the table's runs the open loop sent no request late. The capped harness sent 345 of its 1,500 requests [measured] more than 2 ms [estimated] late in the calm run, and 497 [measured] in the freeze run, so it fails the rule in both. A log with no due column cannot be checked at all, and that is the first thing to say about it.

:::card
kind: isomorphism
title: The thread pool you wrote
body: A closed-loop load test is the harness most of us wrote first, a fixed pool of worker threads that each loop on call, record, call. It behaves like a bounded queue in front of a pool, where the producers stop adding work when every worker is busy.
breaks: A pool's queue pushes back on its producers, so they slow down. A model server's callers cannot see the engine's state, and a stalled engine keeps being asked, so the load a closed loop stops offering is the load production would have kept sending.
:::

:::card
kind: warning
title: A cap is not a rate
body: With a cap on requests in flight, the rate a run achieves can be lower than the rate it was asked for. Report the achieved rate beside the requested one. If they differ, the cap and not the server set the load, and a latency timed from the send does not say how long the users waited.
:::

:::card
kind: notional-machine
id: trace-room-bench
:::

## What to carry

- Keep two times for every request, the due time and the send, and report latency from the first.
- A closed loop answers a capacity question. A latency claim about production traffic needs an open loop.
- A stopwatch that starts after a queue has not timed the queue. Ask of every harness where its timer starts.

## Exit check

This lesson tests three skills: timing a log from its due times (`tr8.latency-from-due`), telling an open loop from a closed one by what each shows under a stall (`tr8.open-vs-closed`), and finding the wait before the send (`tr8.client-queue`). The graded `due` level draws a fresh report each time. It asks for the flaw, the corrected p99 and the range you stand behind, and the bar is all three right on three fresh seeds [estimated] (ASSESSMENT §4.3).

:::game
id: broken-bench
level: due
mode: graded
:::
