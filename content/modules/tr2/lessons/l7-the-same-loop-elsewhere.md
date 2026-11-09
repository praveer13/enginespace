---
id: tr2.l7
module: tr2
title: The same loop in SGLang, Mini-SGLang and TRT-LLM
minutes: 21                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.bubble, tr2.async-overlap, tr2.capture-padding]
builds_on: [ks:T5.L7, ks:T0.L6]
status: review                    # draft | review | live
lanes: [B]
---

vLLM is the engine this module reads closely, and it is not the only one. Three more have met the same two problems, a GPU that waits while the CPU writes the next step and a launch that costs more than a small forward, and each gave the same two answers: write the next call while the last one runs, and replay a recorded launch. What differs is the default, the key and the list of sizes, and those are what you meet first when you change engines.

The four engines come with three kinds of evidence. vLLM and SGLang are pins of the course, read in their source at `v0.33.0` and `v0.5.23`. Mini-SGLang is read at one commit, `9a91cfa`. TensorRT-LLM is no pin: it is read in one overview document at the commit `b96ba43` of its tag `v1.4.0rc2`, and what this lesson says of it is what that page says.

## Overlap in four engines

| Engine | What it overlaps | On by default, and the switch |
|---|---|---|
| vLLM | The next batch is planned on placeholders while this one runs, with two batches in flight. | yes, since `v0.14.0`; `--no-async-scheduling` |
| SGLang | The CPU work on one batch's results, while the next batch computes. | yes; `--disable-overlap-schedule` |
| Mini-SGLang | Overlap scheduling. | yes; `MINISGL_DISABLE_OVERLAP_SCHEDULING` in the environment |
| TensorRT-LLM | The launch of step `n+1`, before the CPU has finished the results of step `n`. | yes, with one extra decoding step; no switch in the overview |

Each row is read from its engine, claim by claim. vLLM made async scheduling its default in {{claim:vllm.async-scheduling.since}}, and the third lesson read the rest. SGLang's overlap scheduler is on by default, {{claim:sglang.overlap.default}}, and its event loop does this: {{claim:sglang.overlap.loop}} Mini-SGLang's is on by default too. {{claim:mini-sglang.overlap-default}} TensorRT-LLM's overview describes its overlap scheduler in one sentence, {{claim:trtllm.overlap.strategy}}, and says that it comes with {{claim:trtllm.overlap.extra-step}}.

Read the SGLang row as the vLLM row under another name. The engine is always one batch behind, and the CPU work on one batch's results runs while the GPU computes the next. That work is the `read` of the third lesson, and the third lesson has SGLang's switch between two prefills. {{claim:sglang.overlap.consecutive-prefill}} The arithmetic of the bubble is the third lesson's for any engine that overlaps this way: with the next call written during the fire, the GPU idles for the CPU's work less the forward, and for nothing when the forward is the longer [derived]. The shape has a price that follows from it [derived]. An engine that is one batch behind learns of a stop one batch late, and the next batch is already on its way. TensorRT-LLM names its price in its overview, one extra decoding step in the pipeline, and calls the throughput gain a significant trade-off. Whether that step is the ghost token of a request that stopped is a question for its code, and the course has not read the code [unverified].

:::card
kind: isomorphism
title: One interface, several drivers
body: JDBC is one interface with a driver for each database. The call is the same, and the dialect behind it is not. The loop is the interface, each engine has its own implementation of overlap and of replay, and the same words stand for different details.
breaks: A JDBC driver implements one specification. These engines share a problem and no specification, so a setting with the same name in two engines is not the same setting, and a number from one engine is not a number for another.
:::

## The lists of sizes

Replay needs a size, and every engine keeps a list. vLLM's default starts 1, 2 and 4 and then goes by 8 [measured]. {{claim:vllm.cudagraph.capture-sizes}} SGLang's decode list starts 1, 2, 4, 8 and 12, then goes by 8 to 256, by 16 to 496 and by 32 above that [measured], and a batch is padded up to the next size in it. {{claim:sglang.cudagraph.decode-buckets}} Mini-SGLang's is 1, 2 and 4, and then every multiple of 8 up to its largest [measured]. {{claim:mini-sglang.graph.sizes}} The two lists that matter most are the first two, and they differ in one place near the bottom: SGLang has a size at 12 [measured] and vLLM has none. TensorRT-LLM pads to the nearest larger size for which a graph exists, and its overview gives no list. {{claim:trtllm.cudagraph.padding}}

Commit to a number. The sizes are the ones just above.

:::predict
id: tr2.l7.p1
prompt: "Near the bottom, vLLM's default list has 8, 16 and 24, and SGLang's has 8, 12, 16 and 24 [derived]. A decode batch of 10 rows [estimated] is padded up to the next size in each list. How many fewer rows does SGLang waste than vLLM?"
answer: { kind: numeric, unit: rows, rel_tol: 0 }
reveal: after-game
kcs: [tr2.capture-padding]
:::

Here is what each engine pads a decode batch to with its defaults, from the course's lists. Read on 2026-11-08 at `b5fb81a`. A cell that says eager is a batch with no graph: the step is launched kernel by kernel.

| Rows in the batch [estimated] | vLLM [derived] | SGLang on a `24 GB` card [derived] | SGLang on an `80 GB` card [derived] | Mini-SGLang [derived] |
|---|---|---|---|---|
| 9 | 16 | 12 | 12 | 16 |
| 12 | 16 | 12 | 12 | 16 |
| 13 | 16 | 16 | 16 | 16 |
| 49 | 56 | eager | 56 | 56 |
| 161 | 168 | eager | 168 | eager |
| 256 | 256 | eager | 256 | eager |

:::figure
src: figures/tr2/l7-buckets.svg
alt: Rows wasted by a decode batch of up to twenty-four rows under vLLM's list of sizes and under SGLang's, drawn to one scale
description: Two rows of bars, one bar for each batch size from one to twenty-four rows, as tall as the rows the batch is padded by. The top row is vLLM's default list of sizes and the bottom row is SGLang's decode buckets. They differ only for the batches of nine to twelve rows, which vLLM pads to sixteen and SGLang to twelve, because SGLang has a bucket at twelve and vLLM has none.
origin: generated
:::

The vLLM column is the fifth lesson's table again. The two SGLang columns save four rows [derived] on each batch of 9 to 12 rows [derived], and nothing anywhere else. The cells that say eager are the other difference, and the bigger one.

## Where the list stops

A list stops at a cap, and a batch above the cap runs eagerly. vLLM's cap is 512 tokens by default, or 1,024 on data-center Blackwell [measured], and its list also holds `max_num_seqs` when that fits under the cap. {{claim:vllm.cudagraph.max-capture-size}} {{claim:vllm.cudagraph.max-capture-size-blackwell}} {{claim:vllm.cudagraph.default-sizes-seqs}} On a `24 GB` card `max_num_seqs` is {{claim:vllm.batch-defaults.small.seqs}}, which is under the cap, so every decode batch has a graph [derived]. On an H100 it is {{claim:vllm.batch-defaults.large.seqs}}, which is over it, so a decode batch of more than 512 rows runs eagerly [derived].

SGLang's cap depends on the card. On a card of 20 GiB to under 35 GiB [measured], which its source lists as the A10, the 4090 and the 5090, the decode graphs stop at a batch of {{claim:sglang.cudagraph.decode-max-bs.small}} below tensor-parallel size 4, and on a card of 60 GiB to under 90 GiB, which it lists as the H100 and the A100, at {{claim:sglang.cudagraph.decode-max-bs.large}}. A decode batch above 48 on a `24 GB` card should therefore run eagerly [derived], and the course has not run it. A comment in the source, written for the `RTX 5090` with `32 GB`, says that the previous cap forced eager decode at a batch of 32 or more and collapsed throughput at high concurrency against vLLM [measured]. {{claim:sglang.cudagraph.decode-max-bs.rtx5090-comment}} Its prefill graphs are keyed by the padded token count and stop at {{claim:sglang.cudagraph.prefill-max-default}} by default. {{claim:sglang.cudagraph.prefill-buckets}}

Mini-SGLang's cap is {{claim:mini-sglang.graph.max-default}} when more than `80 GiB` of GPU memory are free and 160 [measured] otherwise, and it replays a graph only for a decode batch that is no larger than the largest size. {{claim:mini-sglang.graph.decode-only}} TensorRT-LLM's overview gives no cap.

Put the same card under two engines and the batches that have a graph are not the same batches. A cap you never set is a cap you are inheriting. SGLang's post on its graphs makes the same point about prefill: the largest captured shape matters more than how many shapes are captured, because a prefill above the ceiling runs eagerly and keeps the activation peak, while the graphs below it still take their memory. {{claim:sglang.cudagraph.blog-ceiling}}

## Per phase, and a footnote on breaking

SGLang names its choice differently. It configures graphs for each phase, decode and prefill, and each phase uses one backend of three, `full`, `breakable` or `disabled`. {{claim:sglang.cudagraph.backends}} Decode is `full` by default, and prefill is `breakable` on CUDA. {{claim:sglang.cudagraph.decode-default}} {{claim:sglang.cudagraph.prefill-default}} A `tc_piecewise` backend for prefill was removed in `v0.5.22`, and asking for it now raises an error. {{claim:sglang.cudagraph.tc-piecewise-removed}} vLLM has a breakable capture of its own behind an environment variable that is off by default, and it is not a sixth mode. {{claim:vllm.cudagraph.breakable-off}} Breakable graphs are a footnote of this course because its model does not capture them. They matter to a reader of SGLang's prefill, and nothing in the games depends on them.

## The switches side by side

| Engine | Turn overlap off | Control the graphs |
|---|---|---|
| vLLM `v0.33.0` | `--no-async-scheduling` | `-O0`, `-O1` and `-O2`; `--compilation-config` with `cudagraph_mode`, `cudagraph_capture_sizes`, `max_cudagraph_capture_size` and `cudagraph_specialize_lora`; `VLLM_USE_V2_MODEL_RUNNER` for the runner |
| SGLang `v0.5.23` | `--disable-overlap-schedule`, and `SGLANG_DISABLE_CONSECUTIVE_PREFILL_OVERLAP` between two prefills | `--cuda-graph-config` for each phase; `cuda_graph_bs_decode` for the sizes; `disable_cuda_graph_padding`; `disable_decode_cuda_graph`; `debug_cuda_graph`; `enable_profile_cuda_graph` |
| Mini-SGLang `9a91cfa` | `MINISGL_DISABLE_OVERLAP_SCHEDULING` | `--cuda-graph-max-bs`, where zero turns the graphs off |
| TensorRT-LLM `v1.4.0rc2` | none named in the overview | none named: padding is described without a switch |

vLLM's switches are the ones of the fourth to sixth lessons, each with its claim. SGLang's are claims of their own. It sets its graphs for each phase with {{claim:sglang.cudagraph.config-flag}}, and the sizes of the decode graph with {{claim:sglang.cudagraph.decode-sizes-flag}}. A batch that would need padding can run eagerly instead: {{claim:sglang.cudagraph.disable-padding}} The decode graph alone can be turned off, {{claim:sglang.cudagraph.disable-decode}}, a debugging switch sends every operation eagerly through the capture path, {{claim:sglang.cudagraph.debug-flag}}, and another profiles the capture. {{claim:sglang.cudagraph.profile-flag}} Mini-SGLang's graphs are on by default, and its one switch sets the largest batch: {{claim:mini-sglang.cuda-graph-default}} TensorRT-LLM's overview describes padding and names no switch for it. {{claim:trtllm.cudagraph.padding}}

A table of switches is not a table of behaviors. The same table for an engine you meet next year will have other names, and the questions to ask of it are the ones this lesson asked: what does it overlap, what is the key, what is the list, and where does the list stop.

:::card
kind: warning
title: A name is not a behavior
body: Two engines can both have an overlap scheduler, a list of graph sizes and a padding switch, and still not take the same steps. One has a bucket that nobody else has, one stops its graphs at a cap that another leaves out, one counts a batch by its rows and another by its tokens. Before you carry a setting or a number from one engine to another, read both lists and both caps.
:::

## Read it in the source

Three short reads at the pins, each with one question. The answer to each is in this lesson.

1. [`generate_decode_cuda_graph_batch_sizes`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/cuda_graph_hook.py#L500-L532) is SGLang's list. Which of its first five sizes has no counterpart in vLLM's default list?
2. [The block for cards under `35 GiB`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/memory_hook.py#L101-L117) fixes the cap by the card. What is the cap at tensor-parallel size one, and what does the comment above it say about an earlier cap?
3. [`event_loop_overlap`](https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/managers/scheduler.py#L2061-L2120) is the loop. Find the line that processes the last batch's result. Is it the plan or the read of the third lesson?

:::card
kind: notional-machine
id: trace-room-steploop
:::

## What the GPU will check

Nothing in this lesson is run. The course's model follows vLLM's loop. SGLang's lists are data in it, and its scheduler and its overlap are not modelled, so everything above that is about timing is read from source and documents. TR3's lab profiles the pinned vLLM, and the one stage of it that runs another engine is optional: SGLang's decode throughput at four concurrencies around its cap of {{claim:sglang.cudagraph.decode-max-bs.small}} on a `24 GB` card, which settles whether that cap is a cliff. The lab arrives with the grader in W2 (D-039). Until then the claims about the other three engines are read and not measured.

## What to carry

- Every engine overlaps the CPU's work with the GPU's, one batch behind, and every engine replays graphs by size. The words differ and the details are the engine's own.
- The lists differ near the bottom, and the caps differ by the card. The same command is not the same configuration across engines or across cards.
- A claim about an engine is a claim about a version. Name the pin, or the commit, or say that the course has not read it.

## Exit check

This lesson revisits three skills in other engines: saying why the GPU idles between steps when the CPU's work for the next step is not ready (`tr2.bubble`), saying which CPU work an engine overlaps and what it leaves on the critical path (`tr2.async-overlap`), and working out the size a batch is padded to and what the padding wastes (`tr2.capture-padding`). The exit ticket is three items on fresh seeds: one on the idle time between steps with the next call written during the fire, and two on the size a batch is padded to and the rows it wastes. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2).

:::item
family: tr2.bubble-width
level: 2
count: 1
:::

:::item
family: tr2.padding-waste
level: 2
count: 2
:::
