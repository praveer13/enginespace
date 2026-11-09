---
id: tr2.l6
module: tr2
title: "Dispatch keys: which graph replays this step"
minutes: 78                       # [estimated]; the compiler recomputes reading minutes and warns past 20 %
kcs: [tr2.dispatch-keys, tr2.graph-modes, tr2.graph-memory]
builds_on: [ks:T5.L7, ks:T5.L4]
status: review                    # draft | review | live
lanes: [B]
games: [loop]
---

The fifth lesson left the engine with a rack of graphs, captured at start-up for some shapes. Each step now has to be matched with one of them, or with none, and the match is a lookup on a description of the batch: the dispatch key. This lesson reads the key in both of vLLM's runners, shows why the mode you ask for is not always the mode that runs, and then counts what the graphs cost, because every graph is memory that the KV cache does not get. It ends with the module's graded level, `close`.

## A key for each runner

MRV2, the default runner, dispatches on a frozen dataclass, `BatchExecutionDescriptor`, with seven fields. {{claim:vllm.cudagraph.mrv2-key}}

| Field | What it says of the batch |
|---|---|
| `cg_mode` | which routine runs: `FULL`, `PIECEWISE` or `NONE` |
| `num_tokens` | the token count of the batch, padded to a captured size |
| `num_reqs` | the number of requests, or null for a piecewise graph |
| `uniform_token_count` | the query length that every request shares, or null |
| `max_query_len` | a bound on the longest query, or null |
| `num_active_loras` | the adapter case: how many distinct adapters the batch uses, rounded up to a captured case |
| `num_ubatches` | the microbatch count |

At capture time MRV2 builds a list of candidate descriptors for every token count and every captured adapter case. For each mode it takes the descriptors with the smallest captured token count at or above the batch's, the `FULL` ones before the `PIECEWISE` ones, and dispatch returns the first candidate that fits the batch. {{claim:vllm.cudagraph.mrv2-candidates}} {{claim:vllm.cudagraph.mrv2-dispatch}} In a mode with full decode graphs it captures a `FULL` decode descriptor for each capture size, rounded up to a multiple of the decode query length, and skips the sizes that would need more requests than the rail allows. {{claim:vllm.cudagraph.mrv2-decode-descs}} For the mixed routine it captures one descriptor for each capture size, and a piecewise descriptor has no request count. {{claim:vllm.cudagraph.mrv2-mixed-descs}}

"Fits" has six conditions: the uniform token count unset or equal to the batch's, the query-length bound unset or large enough, the request count unset or large enough, a token count at least the batch's, and the adapter case and the microbatch count equal to the batch's. {{claim:vllm.cudagraph.mrv2-compatible}} A batch is a uniform decode when every request has the same query length, and the runner reports that length only when no request is still prefilling, except that a prefill chunk of one new token counts as a decode. {{claim:vllm.cudagraph.mrv2-uniform-count}} While a request is prefilling, the runner passes the query-length bound as null, so a descriptor that bounds it cannot match. {{claim:vllm.cudagraph.mrv2-prefill-query-len}}

MRV1, the legacy runner, keys on a `BatchDescriptor` with five fields, and `has_lora` is one of them. {{claim:vllm.cudagraph.mrv1-key}} Its dispatcher looks for a `FULL` key with the exact request count, then for a `PIECEWISE` key with the request count relaxed, and otherwise runs eagerly. {{claim:vllm.cudagraph.mrv1-dispatch}} The published design document shows a key of four fields, which matches neither runner, so the document is stale on the key and the code at the pin is the reference. {{claim:vllm.cudagraph.design-doc-key}} SGLang has no descriptor at all: it pads a decode batch to a bucket of batch sizes, and the next lesson sets its lists beside vLLM's.

Commit to a number before you read on. The rule is in the text above.

:::predict
id: tr2.l6.p1
prompt: "A rail of 12 requests [estimated] has vLLM's default sizes for it, which are 1, 2, 4, 8, 12, 16 and 24 [derived], and the mode is FULL_AND_PIECEWISE, with no adapters. How many graphs does MRV2 capture at start-up?"
answer: { kind: numeric, unit: graphs, rel_tol: 0 }
reveal: after-game
kcs: [tr2.dispatch-keys]
:::

## The table of cases

Here are five batches on that rail, dispatched by the course's port of each runner's dispatcher. The rail allows two adapters at most [estimated]. Read on 2026-11-08 at `b5fb81a`.

| The batch [estimated] | MRV2's pick [measured] | MRV1's pick [measured] |
|---|---|---|
| 12 decode rows | `FULL`, 12 tokens | `FULL`, 12 tokens |
| 9 decode rows | `FULL`, 12 tokens | `FULL`, 12 tokens |
| 8 decode rows and a prompt chunk of 12 tokens | `PIECEWISE`, 24 tokens | `PIECEWISE`, 24 tokens |
| 12 decode rows, 2 adapters | `FULL`, 12 tokens, adapter case 3 | `FULL`, 12 tokens, adapter case 3 |
| 11 decode rows and a prompt chunk of 20 tokens | `NONE`, 31 tokens | `NONE`, 31 tokens |

Read the rows with the rules. Nine decode rows are uniform, and the smallest captured size at or above 9 is 12, so the batch replays the `FULL` graph of 12 [derived]. A batch with a prompt chunk is not uniform, so the `FULL` decode descriptors cannot match, and the piecewise graph for the smallest size at or above its 20 tokens does, which is 24 [derived]. A batch of 31 tokens is above the largest size, 24, so nothing matches and it runs eagerly: the comb again [derived]. And two adapters become the adapter case 3 [derived], because the only captured cases are no adapter and the cap plus one. {{claim:vllm.cudagraph.mrv2-lora-cases}} {{claim:vllm.cudagraph.mrv2-lora-clamp}}

The two runners agree on all five rows. They differ in the keys they hold, and so in what each can tell apart, which is why the grader's fingerprint of a GPU run names the runner that ran (ARCHITECTURE §9.5). The table is the port's, and the port is the course's. It has been held to a second port of the same Python, written separately, on 6,400 [measured] drawn cases for each runner, and the two agree. The table of the pinned code's own answers is the owner's to run on a CPU, and it has not been committed (Q-10). Until it is, read the table as the model's [measured] and the engine's own answers as [unverified].

:::card
kind: isomorphism
title: A cache key
body: A cache is looked up by a key, a hit returns the stored object, and a miss goes the slow way to the origin. The descriptor is the key, a graph is the stored object, and NONE is the miss, so the step is launched kernel by kernel.
breaks: A cache fills on a miss, and a graph does not. All the graphs are captured at start-up, so a shape that was not captured stays a miss for as long as the server runs, and the cure is the list of sizes and not the traffic.
:::

## The mode you ask for and the mode that runs

An attention backend declares how much it can replay. There are four levels, from `ALWAYS`, which supports mixed prefill and decode batches, through `UNIFORM_BATCH`, for batches whose requests share one query length, and `UNIFORM_SINGLE_TOKEN_DECODE`, for decodes of one token, down to `NEVER`. {{claim:vllm.cudagraph.backend-support-levels}} The design document lists the backends it knows, and the level it gives each.

| Backend | The level in the design document |
|---|---|
| FlashAttention v3 | {{claim:vllm.cudagraph.backend-fa3}} |
| Triton attention | {{claim:vllm.cudagraph.backend-triton}} |
| FlashAttention v2 | {{claim:vllm.cudagraph.backend-fa2}}, though its comment says it is really `ALWAYS` and that the listing is a workaround so that it falls back to `FULL_AND_PIECEWISE` |
| FlashInfer | {{claim:vllm.cudagraph.backend-flashinfer}}, or `UNIFORM_BATCH` when it uses TRTLLM attention on Blackwell |
| Mamba attention | {{claim:vllm.cudagraph.backend-mamba}} |
| Any backend not listed | {{claim:vllm.cudagraph.backend-unlisted}} |

A model with several kinds of attention takes the minimum of its backends' levels, and vLLM downgrades the mode to the best fit. {{claim:vllm.cudagraph.hybrid-minimum}} The rules are three. A mode with full graphs for mixed batches needs `ALWAYS`, and on a backend below it the mode becomes `FULL_AND_PIECEWISE` if attention is split out of the compiled graph, and `FULL_DECODE_ONLY` if it is not. A backend with no graph support at all raises an error there. {{claim:vllm.cudagraph.downgrade-mixed}} A mode with full decode graphs on a backend that supports none becomes `PIECEWISE`, or `NONE`. {{claim:vllm.cudagraph.downgrade-decode}} And with speculative decoding, whose decode batches carry the drafts, a full decode graph needs `UNIFORM_BATCH`. {{claim:vllm.cudagraph.downgrade-spec-decode}} The design document's own summary is the rule to keep: vLLM downgrades a requested mode to the closest one that the backend supports. {{claim:vllm.cudagraph.mode-downgrade}}

Here is what runs when each mode meets each level, from the course's port of the rules, with plain decode and with attention split out of the compiled graph, which is how the port runs. Read on 2026-11-08 at `b5fb81a`.

| You ask for | `ALWAYS` [measured] | `UNIFORM_BATCH` [measured] | `UNIFORM_SINGLE_TOKEN_DECODE` [measured] | `NEVER` [measured] |
|---|---|---|---|---|
| `NONE` | `NONE` | `NONE` | `NONE` | `NONE` |
| `PIECEWISE` | `PIECEWISE` | `PIECEWISE` | `PIECEWISE` | `PIECEWISE` |
| `FULL` | `FULL` | `FULL_AND_PIECEWISE` | `FULL_AND_PIECEWISE` | the engine refuses |
| `FULL_DECODE_ONLY` | `FULL_DECODE_ONLY` | `FULL_DECODE_ONLY` | `FULL_DECODE_ONLY` | `PIECEWISE` |
| `FULL_AND_PIECEWISE` | `FULL_AND_PIECEWISE` | `FULL_AND_PIECEWISE` | `FULL_AND_PIECEWISE` | `PIECEWISE` |

The cell that matters is the third row. You ask for `FULL`, the setting that sounds like the most, and on a FlashInfer setup you get `FULL_AND_PIECEWISE`, which is not the same configuration and has different memory. The engine does not stop you, and the log says what ran. Read the mode in the log before you read a result.

Play the `graphs` level's third stage, `modes`, on the level you met in the last lesson. Press `]` twice. The stage draws a backend's support level and a room for the routines, and it asks you to choose the mode that serves the night fastest. Its prediction asks what runs when `FULL` is asked for.

:::game
id: loop
level: graphs
mode: practice
:::

## Adapters and the key

An adapter is part of the key. With `cudagraph_specialize_lora` on, which is the default, vLLM captures graphs with and without active adapters, at the cost of a longer start and slightly more memory. {{claim:vllm.cudagraph.lora-specialize}} A second switch, `specialize_active_lora`, is off by default, and when it is on, vLLM captures a graph for each count of active adapters, in powers of two up to `max_loras`. {{claim:vllm.cudagraph.lora-count-specialize}} By default the one adapter graph is therefore the one for the cap plus one. {{claim:vllm.cudagraph.lora-counts}} The count that a batch dispatches on is the number of distinct adapters among its requests, in both runners. {{claim:vllm.cudagraph.mrv2-active-loras}} {{claim:vllm.cudagraph.mrv1-active-loras}}

On the rail above, a cap of 2 adapters [estimated] doubles the graphs, from 12 [measured] to 24 [measured] in `FULL_AND_PIECEWISE`, because every size is captured twice, once for no adapter and once for the adapter case. The model prices each graph alone, so it doubles their memory too. The guide says only slightly more memory, and the course has no capture to say how much more.

TR5a is where adapters live: vLLM keeps them in a fixed number of GPU slots, and a batch that needs more distinct adapters than there are slots waits. {{claim:vllm.lora.slot-count}} {{claim:vllm.lora.admission-cap}} Here the same cap decides how many graphs the engine takes memory for.

The level that plays this section's rule is `keys`, "which adapter counts to capture within a memory budget". It is not open yet: it waits for the table of the pinned dispatchers' own answers, which the owner has to produce (Q-10). Until it opens, the table of cases above is your practice.

## What the graphs take from the KV cache

A graph holds memory. The engine may use a share of the card's memory, which is set by default at {{claim:vllm.cache.gpu-memory-utilization-default}}, and the weights, the activations, the graphs and the KV cache all come out of that share. MRV2 gained its own estimate of what the graphs will take in v0.29.0. {{claim:vllm.cudagraph.memory-profiling-since}} It makes the estimate while the engine is still profiling, before the real KV cache is allocated, {{claim:vllm.cudagraph.memory-before-kv}} and the memory the cache may take is the requested memory minus the profiled non-KV memory minus that estimate. {{claim:vllm.cudagraph.memory-subtracted}} The estimate is applied by default. {{claim:vllm.cudagraph.memory-estimate-default}} The profile captures only the largest `FULL` graphs, records what each took, and extrapolates the difference to the rest, so the estimate is a sum over the graphs and every graph you capture costs something. {{claim:vllm.cudagraph.memory-profile-extrapolates}}

The course's model prices a graph at 8 MiB plus 16 KiB for each token of its size [estimated], which are round figures: no capture has been measured on a card. On the rail of 12 [estimated], in each mode, with the sizes above, the model gives these. Read on 2026-11-08 at `b5fb81a`.

| The mode | Graphs captured [measured] | Memory, MiB [estimated] |
|---|---|---|
| `NONE` | 0 | 0.0 |
| `PIECEWISE` | 7 | 57.0 |
| `FULL` | 7 | 57.0 |
| `FULL_DECODE_ONLY` | 5 | 40.4 |
| `FULL_AND_PIECEWISE` | 12 | 97.5 |

The last row is the answer to the first prediction, and the pair of modes has the most graphs because it captures both routines. The same mode with vLLM's own 51 sizes on a server with 256 sequences captures 86 graphs [measured], which the model prices at 918 MiB [estimated].

Commit to a number again, and then work it.

:::predict
id: tr2.l6.p2
prompt: "A card of 24 GB [estimated] has 0.92 [measured] of its memory requested, as vLLM does by default. The weights and the activations take 3.2 GB [estimated]. The graphs' estimate is 0.96 GB [estimated]. One token of KV cache takes 114,688 bytes [estimated]. How many tokens of KV cache do the graphs cost?"
answer: { kind: numeric, unit: tokens, rel_tol: 0.03 }
reveal: after-game
kcs: [tr2.graph-memory]
:::

Here is the arithmetic in the model, on the small model's card: 22.08 GB requested [derived], 3.2 GB of weights and activations [estimated], and the 918 MiB [estimated] of the 51-size list in two routines. Read on 2026-11-08 at `b5fb81a`.

| The KV cache | Bytes, GB [derived] | Tokens of KV cache [derived] |
|---|---|---|
| With the graphs ignored | 18.9 | 164,620 |
| With the graphs taken off first | 17.9 | 156,225 |

:::figure
src: figures/tr2/l6-memory.svg
alt: How the memory of a card is divided, with the graphs ignored and with their estimate taken off before the KV cache is sized
description: Two bars, each the whole card. In both, the weights and the activations come first, and the last part of the card is not requested, drawn dashed. In the first bar the rest is the KV cache. In the second the graphs' estimate is a box of its own before the cache, which is correspondingly smaller.
origin: generated
:::

The graphs cost 8,395 tokens of KV cache [derived], or 5.1% [derived] of it. A capacity plan that takes the card, subtracts the weights and divides by the bytes per token, as the arithmetic of {{ks:T5.L4}} does, leaves out the graphs along with the activations and the share that is not requested. The graphs are the part that grows with the settings you choose, and that is the correction `tr2.graph-memory` is about.

## Everything on is not the answer

The module's graded level puts the whole lesson on one night. `close` draws a night from the seed: a burst of tickets, a rail, a token budget, a cost card, a host card, an attention backend with its support level, and a room for the routines. You choose the configuration from the cards before any run: whether the next call is written during the fire, where its ids come from, the runner, the graph mode and the sizes to drill. Then the night is served once. The house is found by the model. Of a small menu of configurations, it is the cheapest in graph memory whose night is within 1% [estimated] of the best, and the room is exactly what the house's graphs take, so a configuration whose graphs take more does not start.

On its practice seed, `16`, the night is the small model's, on a rail of 8 clips [measured] with a budget of 128 tokens [measured], and the room is 18.125 MiB [measured]. Everything off, which is the legacy runner, the next call written after the fire, the ids written by hand and no graph, loses 76% [measured] of its clock to dark stretches: 243,067 µs [measured] of 319,593 µs [measured]. The house is MRV2 with the next call written during the fire, the ids carried by the GPU, and `FULL` graphs at the sizes 8 and 128 [measured]. Its night takes 74,900 µs [measured] with no dark stretch, and its two graphs take 18.125 MiB [derived], the whole room.

Now turn everything on. vLLM's default sizes for that rail are 1, 2, 4, 8 and 16 [derived], and the engine refuses to start in each of the four modes that use graphs, because their graphs take more than the room [measured]. The default mode at the house's own two sizes is refused too [measured]. With async scheduling on and the ids still written by hand, the night is served and has 55 dependency violations [measured], and the graded level scores a night with one violation at zero.

Play it in practice first. The seed is fixed, so you can compare your configuration with the house's afterwards.

:::game
id: loop
level: close
mode: practice
:::

:::card
kind: warning
title: A mode is a request, and a graph is a purchase
body: The mode you set is what you ask the engine for, and the backend may give you another. And a graph is memory that the KV cache does not get, so a long list of sizes in the widest mode is not free. The cure for a dark stretch is the cheapest set of graphs that closes it, found by looking at the traffic.
:::

:::card
kind: notional-machine
id: trace-room-steploop
:::

## Your configuration as engine flags

Each lever of `close` has a flag, and the game's Compose card prints them where a claim holds the term. Async scheduling off is `--no-async-scheduling`, {{claim:vllm.async-scheduling.since}} the legacy runner is `VLLM_USE_V2_MODEL_RUNNER=0` in the environment, {{claim:vllm.mrv2.env-decides}} the mode is `--compilation-config` with a `cudagraph_mode`, {{claim:vllm.cudagraph.mode-flag}} and the sizes are `cudagraph_capture_sizes`, capped by `max_cudagraph_capture_size`. {{claim:vllm.cudagraph.capture-sizes}} {{claim:vllm.cudagraph.max-capture-size}} The ids carried by the GPU are not a flag: they are how MRV2 prepares inputs. A policy that you compose in the game is a configuration that you could have typed.

## What the GPU will check

The prediction this lesson makes about a real engine is a price: what graphs cost in memory, and what they do to the KV cache's size. The grader's fingerprint of a TR3 run records the graph mode that ran after any downgrade, read from the engine's log, and not the memory the graphs took (ARCHITECTURE §9.5), so the mode you asked for and the mode that ran are both on the record and no lab prices the graphs yet. The lab arrives with the grader in W2 (D-039). Until then, the 8 MiB and the 16 KiB are the model's, and every figure of memory above is [estimated].

## What to carry

- A graph is found by a key. In MRV2 it is a seven-field descriptor, and the first captured descriptor that fits the batch wins, `FULL` before `PIECEWISE`. A miss is `NONE`, which is the comb.
- The mode you ask for is not always the mode that runs: the attention backend's support level downgrades it, and the log says which. Check the mode before you read a result.
- Graphs are taken off the KV cache before it is sized, so every graph costs KV tokens, and "everything on" is not the answer.

## Exit check

This lesson tests three skills: saying which fields of a batch's descriptor choose the graph that replays it, in the pinned runner and in the legacy one, and what runs when none matches (`tr2.dispatch-keys`), saying which mode a workload and a backend need and why the mode requested is not always the mode that runs (`tr2.graph-modes`), and saying why capture takes memory before the KV cache is sized (`tr2.graph-memory`). The exit ticket is three items on fresh seeds. Two give a batch and a configuration and ask which graph replays, and one gives a card and the graphs' estimate and asks for the KV cache that is left. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The graded `close` level then asks for all of it at once, on a fresh seed with the agent closed. It needs, on three fresh seeds, zero dependency violations and useful tokens per GPU-ms at least 97% [estimated] of the house's (ASSESSMENT §4.3).

:::item
family: tr2.dispatch-key
level: 2
count: 2
:::

:::item
family: tr2.kv-after-graphs
level: 2
count: 1
:::

:::game
id: loop
level: close
mode: graded
:::
