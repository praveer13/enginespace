---
id: tr2.l5
module: tr2
title: "CUDA graphs: capture, replay, padding, and five modes"
minutes: 45                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.graph-replay, tr2.capture-padding, tr2.graph-modes]
builds_on: [ks:T5.L7, ks:T4.L3, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

The third lesson left nine fires on the small card with a dark stretch that overlap could not close. All nine admitted a ticket, and seven launched kernel by kernel, because no graph had been captured for their size. Their launch took longer than the forward it launched. This lesson is about that launch: what a CUDA graph is, why replaying one is cheap, why it works only for the shapes that were captured, what the padding that fixes the shapes costs, and the five modes in which vLLM captures. {{ks:T4.L3}} told you that decode is bandwidth-bound, so that a step costs the GPU about the same whether it carries one request or many. That makes the cost on the CPU side matter more, and a launch is the biggest of it.

## The comb

A forward pass is not one operation. It is a sequence of kernels, and an eager engine launches each of them from Python, one call at a time. The course's model gives a layer 12 kernels [estimated] and a launch 6 µs [estimated] of the CPU's time, which are round figures, and the small model has 28 layers [estimated]. A step then makes 336 calls [derived] and spends 2,016 µs [derived] of CPU time launching them. The GPU's own work for a step of 12 rows on that card is 1,225 µs [measured], from the `async` level's practice night, read on 2026-11-08 at `b5fb81a`, so the launching is longer than the computing. In the game that sequence is drawn as a comb, a tooth for each layer, and the expo calls each dish one by one. The model draws the whole launch before the forward starts. A real eager launch lets the GPU begin on the first kernels while the CPU is still launching the rest, so on a step with a long forward the model overstates what launching costs, and its card lists this among what it ignores.

A CUDA graph removes the comb. The GPU work is recorded once, as a graph of kernels with their arguments, and replayed later with much lower launch overhead. {{claim:sglang.cudagraph.blog-definition}} TensorRT-LLM's overview says it as a count: a sequence of CUDA operations captured as one graph can be launched with one API call. {{claim:trtllm.cudagraph.one-call}} vLLM's compile guide gives the purpose in a line: it applies CUDA graphs to reduce CPU overheads. {{claim:vllm.cudagraph.purpose}} And its note on CUDA graphs for the vision encoder says when the overhead hurts most: the overhead is more significant when the batch or the image is small, and the cure is to capture the forward pass at several sizes when the model is initialized and replay the right graph at run time. {{claim:vllm.cudagraph.encoder-overhead}}

:::figure
src: figures/tr2/l5-comb.svg
alt: The CPU's launch work for one step, launched kernel by kernel, in pieces and as one graph, to one time scale
description: Three rows on one time scale. The first has a tooth for each of the twenty-eight layers, each the twelve launches of that layer, three hundred and thirty-six calls in all. The second is twenty-nine short boxes for the replays of the pieces, with a thin launch between them for each layer's attention. The third is one box, a single replay, so short that it is barely a mark beside the others.
origin: generated
:::

There is a test for whether a forward is launch-bound, and it needs no profiler. Time the forward at several sizes of work. If the curve is flat across a wide range of sizes, the time is the launches and not the compute. SGLang's post on its graphs makes the point about prefill on gpt-oss-120b: every curve is flat across a range of prompt lengths, which it calls the signature of launch overhead rather than compute. {{claim:sglang.cudagraph.blog-flat-curve}}

Commit to a number before you play.

:::predict
id: tr2.l5.p1
prompt: "A step of the small model launches 12 kernels [estimated] for each of its 28 layers [estimated], one by one, and each launch costs the CPU 6 µs [estimated]. A replay of a graph for the same step costs 30 µs [estimated] to launch. How many µs of CPU launch time does the replay save?"
answer: { kind: numeric, unit: us, rel_tol: 0.02 }
reveal: after-game
kcs: [tr2.graph-replay]
:::

## Why a graph holds for some shapes only

A captured graph is a recording. Its kernels were launched with particular arguments, on tensors at particular addresses and of particular shapes, and a replay launches the same ones. It cannot be handed a bigger batch or a tensor somewhere else. Two things follow, and a small engine shows both in a few lines.

Mini-SGLang's graph runner is a file of 171 lines [measured] at the commit 9a91cfa, and it is the whole idea in a file you can read in ten minutes: [`engine/graph.py`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py). Its pieces are the lesson.

- **Static buffers.** The runner allocates one set of buffers at the largest captured batch, for the input ids, the output locations, the positions and the logits, and every graph reads and writes them. {{claim:mini-sglang.graph.static-buffers}} Fresh data goes into the same addresses.
- **A list of sizes.** It captures at 1, 2 and 4, then at every multiple of 8 up to its largest batch [measured]. {{claim:mini-sglang.graph.sizes}} The largest batch defaults to 256 when more than `80 GiB` of GPU memory are free, and to 160 otherwise [measured]. {{claim:mini-sglang.graph.max-default}}
- **One memory pool.** It captures from the largest size down, and each graph after the first reuses the first one's memory pool, which keeps down the memory that the graphs take. {{claim:mini-sglang.graph.shared-pool}}
- **A padded batch.** A decode batch is padded to the first captured size that holds it, with dummy requests in the extra rows. {{claim:mini-sglang.graph.pad}}
- **A replay.** It copies the batch into the static buffers, takes the graph captured for the padded size, lets the attention backend prepare, replays, and returns the first rows of the logits, one for each real request. {{claim:mini-sglang.graph.replay}}
- **A condition.** A graph serves a decode batch no larger than the largest size, and anything else runs eagerly. {{claim:mini-sglang.graph.decode-only}}

Copy in, replay, slice out. vLLM's version has more machinery around the same six, and the rest of the module reads it as such.

:::card
kind: isomorphism
title: A prepared statement
body: A database parses and plans a prepared statement once and runs it many times with new parameters, so the planning is not paid again. A captured graph is a prepared sequence of kernels, and the static buffers are its parameters. You change what is in them, and the sequence stays.
breaks: A prepared statement accepts a parameter of any value, and a graph accepts a tensor of one shape only. Where a database replans for a new shape, an engine pads to the shape it has, or does not use the graph.
:::

## The ladder, and what padding wastes

vLLM captures a list of sizes, and it is not up to you unless you set it. With the list unset, the sizes are 1, 2 and 4, then 8 to 248 in steps of 8, then 256 up to the maximum in steps of 16 [measured]. {{claim:vllm.cudagraph.capture-sizes}} The maximum starts at the smaller of twice the product of `max_num_seqs` and the decode query length, and a ceiling of 512 tokens, or 1,024 on data-center Blackwell [measured], {{claim:vllm.cudagraph.default-max-formula}} {{claim:vllm.cudagraph.max-capture-size}} {{claim:vllm.cudagraph.max-capture-size-blackwell}} and is cut to the token budget. {{claim:vllm.cudagraph.sizes-budget-clamp}} Without speculation `max_num_seqs` is added to the list when it fits, so that a full decode batch is captured exactly. {{claim:vllm.cudagraph.default-sizes-seqs}} On a server with the defaults of a `24 GB` card the list has 51 sizes [derived], up to 512.

A batch replays the graph of the smallest captured size that holds it, and the extra rows are computed and wasted. {{claim:vllm.cudagraph.padding}} Here is what that costs, from the course's rule for it, for decode batches of various sizes.

| Rows in the batch [estimated] | The size it is padded to [derived] | Rows wasted [derived] |
|---|---|---|
| 1 | 1 | 0 |
| 3 | 4 | 1 |
| 5 | 8 | 3 |
| 9 | 16 | 7 |
| 10 | 16 | 6 |
| 17 | 24 | 7 |
| 33 | 40 | 7 |
| 100 | 104 | 4 |
| 250 | 256 | 6 |
| 257 | 272 | 15 |

:::figure
src: figures/tr2/l5-padding.svg
alt: Rows wasted by decode batches of one to forty rows under vLLM's default capture sizes, a sawtooth
description: A bar for each batch size from one to forty rows, as tall as the rows that the batch is padded by. The bar is nothing at each captured size, one, two, four, eight, sixteen, twenty-four, thirty-two and forty, and grows by a row for each row the batch has over the last captured size, until the next size is reached. The tallest bars sit just above a size, as at nine rows and seventeen.
origin: generated
:::

The wasted rows are at most 7 [derived] below 256, because the sizes step by 8, and at most 15 [derived] above it, because they step by 16. The share is another matter. Seven rows wasted on a batch of 9 is 78% [derived] more rows than the batch has, and on a batch of 33 it is 21% [derived]. Padding hurts small batches in proportion, which are the batches where the launch overhead was a large share to begin with.

The cost of a padded row is not the same everywhere. SGLang's post says a padded token is real work, an actual row in the captured batch that passes through the dense projections in the same matrix multiplications, and that an empty request slot is much cheaper. {{claim:sglang.cudagraph.blog-padded-tokens}} TensorRT-LLM calls the computing of wasted tokens a minor overhead, and pads to the nearest larger size. {{claim:trtllm.cudagraph.padding}} It also says padding has shown up to a 22% [unverified] gain in end-to-end throughput on certain models and hardware, a figure that has not been checked here. {{claim:trtllm.cudagraph.padding-gain}} SGLang has a switch that goes the other way, and runs a batch without a graph when it would need padding. {{claim:sglang.cudagraph.disable-padding}} Padding is a trade the engine makes for you, and the engine's settings let you take the other side of it.

:::item
family: tr2.padding-waste
level: 1
count: 2
:::

## Five modes

vLLM does not capture a forward pass one way. Its `CUDAGraphMode` has five members. Three are single modes, `NONE`, `PIECEWISE` and `FULL`, and two are pairs, one mode for decode batches and one for the rest. {{claim:vllm.cudagraph.modes}} {{claim:vllm.cudagraph.mode-routines}} A **uniform decode** batch is one in which every request has the same query length, which is one token for plain decode and one plus the number of draft tokens for speculative decoding, and a batch with a prefill chunk in it is not uniform.

| Mode | What it captures | What the design document says of it |
|---|---|---|
| `NONE` | Nothing: every step is launched kernel by kernel. | Good for debugging. {{claim:vllm.cudagraph.none-debugging}} |
| `PIECEWISE` | Graphs for the stretches between the operations that cannot be captured, attention among them, which stay eager. {{claim:vllm.cudagraph.piecewise-attention-outside}} | The most flexible. Pooling models stay on it. {{claim:vllm.cudagraph.pooling-piecewise}} |
| `FULL` | Full graphs for non-uniform batches. A uniform decode batch reuses the graph of the batch of the same size. {{claim:vllm.cudagraph.full-reuses-nonuniform}} | Can be good for small models or workloads with small prompts. |
| `FULL_DECODE_ONLY` | A full graph for uniform decode batches, and nothing for the rest. | Suits the decode instances of a prefill and decode setup, and saves the memory that piecewise graphs need. {{claim:vllm.cudagraph.full-decode-only-use}} |
| `FULL_AND_PIECEWISE` | Full graphs for uniform decode batches, and piecewise graphs for the rest. | The default. Generally the most performant, and it requires the most memory and takes the longest to capture. {{claim:vllm.cudagraph.full-and-piecewise-cost}} |

A graph with N operations that cannot be captured splits into N+1 partitions, and a piecewise replay is a run of N+1 graph launches with the N operations launched one by one between them. {{claim:vllm.cudagraph.piecewise-partitions}} For the small model's 28 layers that is 57 calls [measured], where an eager launch makes 336 and a full graph makes 1 [measured]. The model counts it as 29 replays and 28 attention launches [measured], which is the second row of the figure above. The flag takes the mode's name: `--compilation-config` with a JSON object whose `cudagraph_mode` is one of the five. {{claim:vllm.cudagraph.mode-flag}} The `-O` levels set it for you, and the default `-O2` gives `FULL_AND_PIECEWISE`. {{claim:vllm.cudagraph.default-mode}}

Which mode runs is not always the mode you asked for. That is the sixth lesson's, with the memory that every mode takes.

## Play the comb and the rack

Open the `graphs` level, "Drilled routines". It has three stages and `[` and `]` move between them. Play the first, `comb`, then the second, `sizes`, and leave the third to the next lesson. In the comb stage you serve the same night with no routine drilled and then with the default mode, and the tape counts the calls of a fire. In the sizes stage the rack holds only a few molds, the sizes the line has time to drill, and you pick them for a night of decode fires drawn from a histogram.

:::game
id: loop
level: graphs
mode: practice
:::

Here are the two stages on their practice seed, `0`, read on 2026-11-08 at `b5fb81a`. The comb stage is the small model's night, served with no graph and then with the default mode.

| The comb stage's night | No graph [measured] | The default mode [measured] |
|---|---|---|
| Calls to launch one steady fire | 336 | 1 |
| Clock, µs | 140,123 | 79,375 |
| Median time per output token, µs | 2,750 | 1,493 |
| The GPU's idle time while the CPU worked, µs | 72,734 | 11,982 |

The default mode removes 83.5% [derived] of the dark stretches, 45.7% [derived] of the median token and 43.4% [derived] of the night. The 11,982 µs [measured] that remain are the nine fires of the third lesson. The sizes stage is a different world: a night of 40 decode fires [estimated], drawn from a histogram whose batches are 7 to 11 rows [measured], with room for three molds [estimated].

| The sizes stage | The molds [measured] | Capture cost, µs [measured] |
|---|---|---|
| vLLM's own list cut to three | 1, 2, 4 | 79,440 |
| The best three | 8, 9, 11 | 406 |

The capture cost is the padded rows' time plus the time of the fires that no mold holds, which are launched one by one. Cutting the default list to its first three molds holds none of the 40 fires, because every batch is above 4 rows [measured], so each is a comb. The best three are close to the sizes the night has: they pad a batch of 7 up to 8 and a batch of 10 up to 11 [measured], and hold the rest exactly. The default list is good for a server that does not know its traffic. It is a bad one for a rack that is too small to hold it, and the best three are found by looking at every list of three.

:::item
family: tr2.graph-hit
level: 1
count: 1
:::

:::card
kind: warning
title: A replay removes the launches and not the kernels
body: A graph takes the CPU's launch work off the step. It does not make a kernel inside it shorter, so a step can have no CPU gap at all and still be no shorter than the sum of its kernels. If a profile with graphs on shows no gaps and the step is still slow, the time is in the kernels, and TR3 is where you read them.
:::

:::card
kind: notional-machine
id: trace-room-steploop
:::

## What the GPU will check

The prediction this lesson makes about a real engine is tested in TR3's lab: its stage `s2` captures the same workload with the default `-O2` and with `-O0`, and the prediction you commit in the browser before it is scored against the receipt. That lab arrives with the grader, in W2 (D-039). Until then the comb and the ladder are the model's, with host figures that are [estimated].

## What to carry

- A replay launches a recorded sequence of kernels with one call, so it takes the launch work off the CPU. It does not shorten the kernels.
- It holds only for the shapes that were captured, so an engine copies data into static buffers and pads a batch up to the next captured size. The padding is computed and wasted, and it hurts a small batch in proportion.
- vLLM has five modes, three single and two pairs, and the default captures full graphs for uniform decode and piecewise graphs for the rest.

## Exit check

This lesson tests three skills: saying what one graph replay saves over launching the same kernels one by one, and why it holds only for the shapes that were captured (`tr2.graph-replay`), working out the size a batch is padded to and what the padding wastes (`tr2.capture-padding`), and naming the modes an engine offers (`tr2.graph-modes`). The exit ticket is three items on fresh seeds, one on what a step launches, and two on the size a step is padded to or on the lists of sizes that waste the least. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The skill with the modes is earned again by the graded `close` level at the end of the sixth lesson.

:::item
family: tr2.graph-hit
level: 2
count: 1
:::

:::item
family: tr2.padding-waste
level: 2
count: 2
:::
