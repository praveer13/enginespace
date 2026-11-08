# CUDA graphs: capture, replay, padding, and five modes

_The step loop · lesson `tr2.l5` · review · about 45 minutes [estimated]_

Builds on kernelspace: `ks:T5.L7`, `ks:T4.L3`, `ks:T0.L6`.

Knowledge components: `tr2.graph-replay`, `tr2.capture-padding`, `tr2.graph-modes`.

The third lesson left nine fires on the small card with a dark stretch that overlap could not close. All nine admitted a ticket, and seven launched kernel by kernel, because no graph had been captured for their size. Their launch took longer than the forward it launched. This lesson is about that launch: what a CUDA graph is, why replaying one is cheap, why it works only for the shapes that were captured, what the padding that fixes the shapes costs, and the five modes in which vLLM captures. kernelspace T4.L3 told you that decode is bandwidth-bound, so that a step costs the GPU about the same whether it carries one request or many. That makes the cost on the CPU side matter more, and a launch is the biggest of it.

## The comb

A forward pass is not one operation. It is a sequence of kernels, and an eager engine launches each of them from Python, one call at a time. The course's model gives a layer 12 kernels [estimated] and a launch 6 µs [estimated] of the CPU's time, which are round figures, and the small model has 28 layers [estimated]. A step then makes 336 calls [derived] and spends 2,016 µs [derived] of CPU time launching them. The GPU's own work for a step of 12 rows on that card is 1,225 µs [measured], from the `async` level's practice night, read on 2026-11-08 at `b5fb81a`, so the launching is longer than the computing. In the game that sequence is drawn as a comb, a tooth for each layer, and the expo calls each dish one by one. The model draws the whole launch before the forward starts. A real eager launch lets the GPU begin on the first kernels while the CPU is still launching the rest, so on a step with a long forward the model overstates what launching costs, and its card lists this among what it ignores.

A CUDA graph removes the comb. The GPU work is recorded once, as a graph of kernels with their arguments, and replayed later with much lower launch overhead. **record once, replay** [measured] TensorRT-LLM's overview says it as a count: a sequence of CUDA operations captured as one graph can be launched with one API call. **one API call** [measured] vLLM's compile guide gives the purpose in a line: it applies CUDA graphs to reduce CPU overheads. **to reduce CPU overheads** [measured] And its note on CUDA graphs for the vision encoder says when the overhead hurts most: the overhead is more significant when the batch or the image is small, and the cure is to capture the forward pass at several sizes when the model is initialized and replay the right graph at run time. **more significant when the batch is small** [measured]

![The CPU's launch work for one step, launched kernel by kernel, in pieces and as one graph, to one time scale](../../figures/tr2/l5-comb.svg)

_Three rows on one time scale. The first has a tooth for each of the twenty-eight layers, each the twelve launches of that layer, three hundred and thirty-six calls in all. The second is twenty-nine short boxes for the replays of the pieces, with a thin launch between them for each layer's attention. The third is one box, a single replay, so short that it is barely a mark beside the others._

There is a test for whether a forward is launch-bound, and it needs no profiler. Time the forward at several sizes of work. If the curve is flat across a wide range of sizes, the time is the launches and not the compute. SGLang's post on its graphs makes the point about prefill on gpt-oss-120b: every curve is flat across a range of prompt lengths, which it calls the signature of launch overhead rather than compute. **a flat curve is launch-bound** [measured]

Commit to a number before you play.

> **Predict `tr2.l5.p1`.** A step of the small model launches 12 kernels [estimated] for each of its 28 layers [estimated], one by one, and each launch costs the CPU 6 µs [estimated]. A replay of a graph for the same step costs 30 µs [estimated] to launch. How many µs of CPU launch time does the replay save?
>
> The learner commits to a number in `us`, graded within a relative tolerance of `0.02` [estimated] before the reveal. Ask them to commit to an answer and say why before you discuss it.

## Why a graph holds for some shapes only

A captured graph is a recording. Its kernels were launched with particular arguments, on tensors at particular addresses and of particular shapes, and a replay launches the same ones. It cannot be handed a bigger batch or a tensor somewhere else. Two things follow, and a small engine shows both in a few lines.

Mini-SGLang's graph runner is a file of 171 lines [measured] at the commit 9a91cfa, and it is the whole idea in a file you can read in ten minutes: [`engine/graph.py`](https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py). Its pieces are the lesson.

- **Static buffers.** The runner allocates one set of buffers at the largest captured batch, for the input ids, the output locations, the positions and the logits, and every graph reads and writes them. **one set of static buffers** [measured] Fresh data goes into the same addresses.
- **A list of sizes.** It captures at 1, 2 and 4, then at every multiple of 8 up to its largest batch [measured]. **1, 2, 4, then 8 up in steps of 8** [measured] The largest batch defaults to 256 when more than `80 GiB` of GPU memory are free, and to 160 otherwise [measured]. **256 requests** [measured]
- **One memory pool.** It captures from the largest size down, and each graph after the first reuses the first one's memory pool, which keeps down the memory that the graphs take. **one memory pool** [measured]
- **A padded batch.** A decode batch is padded to the first captured size that holds it, with dummy requests in the extra rows. **the first captured size that holds the batch** [measured]
- **A replay.** It copies the batch into the static buffers, takes the graph captured for the padded size, lets the attention backend prepare, replays, and returns the first rows of the logits, one for each real request. **copy in, replay, slice out** [measured]
- **A condition.** A graph serves a decode batch no larger than the largest size, and anything else runs eagerly. **decode batches up to the largest size** [measured]

Copy in, replay, slice out. vLLM's version has more machinery around the same six, and the rest of the module reads it as such.

> **A prepared statement.** A database parses and plans a prepared statement once and runs it many times with new parameters, so the planning is not paid again. A captured graph is a prepared sequence of kernels, and the static buffers are its parameters. You change what is in them, and the sequence stays.
>
> Where it breaks: A prepared statement accepts a parameter of any value, and a graph accepts a tensor of one shape only. Where a database replans for a new shape, an engine pads to the shape it has, or does not use the graph.

## The ladder, and what padding wastes

vLLM captures a list of sizes, and it is not up to you unless you set it. With the list unset, the sizes are 1, 2 and 4, then 8 to 248 in steps of 8, then 256 up to the maximum in steps of 16 [measured]. **1, 2, 4, then 8 to 248 by 8, then by 16** [measured] The maximum starts at the smaller of twice the product of `max_num_seqs` and the decode query length, and a ceiling of 512 tokens, or 1,024 on data-center Blackwell [measured], **min(2 * max_num_seqs * query length, ceiling)** [measured] **512 tokens** [measured] **1024 tokens** [measured] and is cut to the token budget. **no larger than max_num_batched_tokens** [measured] Without speculation `max_num_seqs` is added to the list when it fits, so that a full decode batch is captured exactly. **max_num_seqs is appended if it fits** [measured] On a server with the defaults of a `24 GB` card the list has 51 sizes [derived], up to 512.

A batch replays the graph of the smallest captured size that holds it, and the extra rows are computed and wasted. **padded up to a captured size** [measured] Here is what that costs, from the course's rule for it, for decode batches of various sizes.

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

![Rows wasted by decode batches of one to forty rows under vLLM's default capture sizes, a sawtooth](../../figures/tr2/l5-padding.svg)

_A bar for each batch size from one to forty rows, as tall as the rows that the batch is padded by. The bar is nothing at each captured size, one, two, four, eight, sixteen, twenty-four, thirty-two and forty, and grows by a row for each row the batch has over the last captured size, until the next size is reached. The tallest bars sit just above a size, as at nine rows and seventeen._

The wasted rows are at most 7 [derived] below 256, because the sizes step by 8, and at most 15 [derived] above it, because they step by 16. The share is another matter. Seven rows wasted on a batch of 9 is 78% [derived] more rows than the batch has, and on a batch of 33 it is 21% [derived]. Padding hurts small batches in proportion, which are the batches where the launch overhead was a large share to begin with.

The cost of a padded row is not the same everywhere. SGLang's post says a padded token is real work, an actual row in the captured batch that passes through the dense projections in the same matrix multiplications, and that an empty request slot is much cheaper. **padded tokens are real work** [measured] TensorRT-LLM calls the computing of wasted tokens a minor overhead, and pads to the nearest larger size. **padded to the nearest larger size** [measured] It also says padding has shown up to a 22% [unverified] gain in end-to-end throughput on certain models and hardware, a figure that has not been checked here. **22 %** [unverified] SGLang has a switch that goes the other way, and runs a batch without a graph when it would need padding. **disable_cuda_graph_padding** [measured] Padding is a trade the engine makes for you, and the engine's settings let you take the other side of it.

> **Practice.** Items from the generator family `tr2.padding-waste`, level `1`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Five modes

vLLM does not capture a forward pass one way. Its `CUDAGraphMode` has five members. Three are single modes, `NONE`, `PIECEWISE` and `FULL`, and two are pairs, one mode for decode batches and one for the rest. **NONE, PIECEWISE, FULL, FULL_DECODE_ONLY, FULL_AND_PIECEWISE** [measured] **decode mode and mixed mode** [measured] A **uniform decode** batch is one in which every request has the same query length, which is one token for plain decode and one plus the number of draft tokens for speculative decoding, and a batch with a prefill chunk in it is not uniform.

| Mode | What it captures | What the design document says of it |
|---|---|---|
| `NONE` | Nothing: every step is launched kernel by kernel. | Good for debugging. **good for debugging** [measured] |
| `PIECEWISE` | Graphs for the stretches between the operations that cannot be captured, attention among them, which stay eager. **attention stays outside the graph** [measured] | The most flexible. Pooling models stay on it. **PIECEWISE** [measured] |
| `FULL` | Full graphs for non-uniform batches. A uniform decode batch reuses the graph of the batch of the same size. **FULL has one graph per size** [measured] | Can be good for small models or workloads with small prompts. |
| `FULL_DECODE_ONLY` | A full graph for uniform decode batches, and nothing for the rest. | Suits the decode instances of a prefill and decode setup, and saves the memory that piecewise graphs need. **saves the memory of the piecewise graphs** [measured] |
| `FULL_AND_PIECEWISE` | Full graphs for uniform decode batches, and piecewise graphs for the rest. | The default. Generally the most performant, and it requires the most memory and takes the longest to capture. **the most performant, and the most memory** [measured] |

A graph with N operations that cannot be captured splits into N+1 partitions, and a piecewise replay is a run of N+1 graph launches with the N operations launched one by one between them. **N+1 partitions** [measured] For the small model's 28 layers that is 57 calls [measured], where an eager launch makes 336 and a full graph makes 1 [measured]. The model counts it as 29 replays and 28 attention launches [measured], which is the second row of the figure above. The flag takes the mode's name: `--compilation-config` with a JSON object whose `cudagraph_mode` is one of the five. **--compilation-config** [measured] The `-O` levels set it for you, and the default `-O2` gives `FULL_AND_PIECEWISE`. **FULL_AND_PIECEWISE** [measured]

Which mode runs is not always the mode you asked for. That is the sixth lesson's, with the memory that every mode takes.

## Play the comb and the rack

Open the `graphs` level, "Drilled routines". It has three stages and `[` and `]` move between them. Play the first, `comb`, then the second, `sizes`, and leave the third to the next lesson. In the comb stage you serve the same night with no routine drilled and then with the default mode, and the tape counts the calls of a fire. In the sizes stage the rack holds only a few molds, the sizes the line has time to drill, and you pick them for a night of decode fires drawn from a histogram.

> **Play.** The game `loop`, level `graphs`, in `practice` mode. It runs in the lesson. Ask the learner to play it before you discuss it: its reference run stays hidden until the debrief.

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

> **Practice.** Items from the generator family `tr2.graph-hit`, level `1`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **A replay removes the launches and not the kernels.** A graph takes the CPU's launch work off the step. It does not make a kernel inside it shorter, so a step can have no CPU gap at all and still be no shorter than the sum of its kernels. If a profile with graphs on shows no gaps and the step is still slow, the time is in the kernels, and TR3 is where you read them.

> **Card.** The notional-machine card `trace-room-steploop`.

## What the GPU will check

The prediction this lesson makes about a real engine is tested in TR3's lab: its stage `s2` captures the same workload with the default `-O2` and with `-O0`, and the prediction you commit in the browser before it is scored against the receipt. That lab arrives with the grader, in W2 (D-039). Until then the comb and the ladder are the model's, with host figures that are [estimated].

## What to carry

- A replay launches a recorded sequence of kernels with one call, so it takes the launch work off the CPU. It does not shorten the kernels.
- It holds only for the shapes that were captured, so an engine copies data into static buffers and pads a batch up to the next captured size. The padding is computed and wasted, and it hurts a small batch in proportion.
- vLLM has five modes, three single and two pairs, and the default captures full graphs for uniform decode and piecewise graphs for the rest.

## Exit check

This lesson tests three skills: saying what one graph replay saves over launching the same kernels one by one, and why it holds only for the shapes that were captured (`tr2.graph-replay`), working out the size a batch is padded to and what the padding wastes (`tr2.capture-padding`), and naming the modes an engine offers (`tr2.graph-modes`). The exit ticket is three items on fresh seeds, one on what a step launches, and two on the size a step is padded to or on the lists of sizes that waste the least. It is passed with at least two right, one of them numeric (ASSESSMENT §4.2). The skill with the modes is earned again by the graded `close` level at the end of the sixth lesson.

> **Practice.** Items from the generator family `tr2.graph-hit`, level `2`, `1` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

> **Practice.** Items from the generator family `tr2.padding-waste`, level `2`, `2` per attempt, drawn on fresh seeds in the lesson. Ask the learner to answer before you discuss one.

## Claims cited

- `mini-sglang.graph.decode-only`: Mini-SGLang replays a graph only for a decode batch that is no larger than the largest captured size, and every other batch runs eagerly. Value decode batches up to the largest size [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/engine/graph.py, GraphRunner.can_use_cuda_graph <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py#L150>, read 2026-11-05).
- `mini-sglang.graph.max-default`: Mini-SGLang's largest captured batch is 256 when more than 80 GiB of GPU memory are free (its comment says H200), and 160 otherwise, unless --cuda-graph-max-bs sets it. Value 256 requests [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/engine/graph.py, _determine_cuda_graph_bs <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py#L59-L62>, read 2026-11-05).
- `mini-sglang.graph.pad`: Mini-SGLang pads a decode batch to the first captured size that is at least as large, and fills the extra rows with a dummy request. Value the first captured size that holds the batch [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/engine/graph.py, GraphRunner.pad_batch <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py#L160-L166>, read 2026-11-05).
- `mini-sglang.graph.replay`: A Mini-SGLang replay copies the batch into the static buffers, takes the graph captured for the batch's padded size, lets the attention backend prepare for the replay, replays the graph, and returns the first rows of the static logits, one for each real request. Value copy in, replay, slice out [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/engine/graph.py, GraphRunner.replay <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py#L152-L159>, read 2026-11-05).
- `mini-sglang.graph.shared-pool`: Mini-SGLang captures its sizes from the largest down, and every graph after the first reuses the first graph's memory pool, to reduce the memory the graphs take. Value one memory pool [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/engine/graph.py, GraphRunner._capture_graphs <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py#L122-L144>, read 2026-11-05).
- `mini-sglang.graph.sizes`: Mini-SGLang captures its decode graphs at the sizes 1, 2 and 4, then every multiple of 8 up to the largest, which is the shape of vLLM's own list below 256. Value 1, 2, 4, then 8 up in steps of 8 [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/engine/graph.py, _determine_cuda_graph_bs <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py#L67>, read 2026-11-05).
- `mini-sglang.graph.static-buffers`: Mini-SGLang's graph runner allocates one set of static buffers at the largest captured batch size, for the input ids, the output locations, the positions and the logits, and every captured graph reads and writes them. Value one set of static buffers [measured], checked 2026-11-05 (source: Mini-SGLang at 9a91cfa, python/minisgl/engine/graph.py, GraphRunner._capture_graphs <https://github.com/sgl-project/mini-sglang/blob/9a91cfafe754aa85daee49998176275667eb58f2/python/minisgl/engine/graph.py#L120>, read 2026-11-05).
- `sglang.cudagraph.blog-definition`: SGLang's post on CUDA graphs says that repeatedly launching the many GPU operations of an inference step from the CPU can introduce noticeable overhead, and that a CUDA graph reduces it by recording the GPU work once and replaying it with much lower launch overhead. Value record once, replay [measured], checked 2026-11-05 (source: LMSYS blog, Advanced CUDA Graph Techniques in SGLang (2026-08-17), Background <https://lmsys.org/blog/2026-08-17-advanced-cuda-graph/>, read 2026-11-05).
- `sglang.cudagraph.blog-flat-curve`: In its prefill benchmark on gpt-oss-120b, SGLang's post notes that every curve is flat across a 32 times range in prompt length, which it calls the signature of launch overhead rather than compute. Value a flat curve is launch-bound [measured], checked 2026-11-05 (source: LMSYS blog, Advanced CUDA Graph Techniques in SGLang (2026-08-17), Prefill benchmark <https://lmsys.org/blog/2026-08-17-advanced-cuda-graph/>, read 2026-11-05).
- `sglang.cudagraph.blog-padded-tokens`: SGLang's post says that a padded token is real work, an actual row in the captured batch that passes through the dense projections in the same matrix multiplications, and that an empty request slot is much cheaper. Value padded tokens are real work [measured], checked 2026-11-05 (source: LMSYS blog, Advanced CUDA Graph Techniques in SGLang (2026-08-17), What does the padding cost? <https://lmsys.org/blog/2026-08-17-advanced-cuda-graph/>, read 2026-11-05).
- `sglang.cudagraph.disable-padding`: SGLang has a switch, disable_cuda_graph_padding, that runs a batch without a graph whenever the batch would need padding, and still replays a graph for a batch whose size was captured. Value disable_cuda_graph_padding [measured], checked 2026-11-05 (source: SGLang v0.5.23, python/sglang/srt/arg_groups/fields/exec_.py, ExecGraph.disable_cuda_graph_padding <https://github.com/sgl-project/sglang/blob/v0.5.23/python/sglang/srt/arg_groups/fields/exec_.py#L673>, read 2026-11-05).
- `trtllm.cudagraph.one-call`: TensorRT-LLM's architecture overview says that capturing a sequence of CUDA operations as a single graph lets the entire sequence be launched with one API call, which minimizes CPU-GPU synchronization and driver overhead. Value one API call [measured], checked 2026-11-05 (source: TensorRT-LLM at b96ba43 (the tag v1.4.0rc2), docs/source/developer-guide/overview.md, Runtime Optimizations (CUDA Graph) <https://github.com/NVIDIA/TensorRT-LLM/blob/b96ba434e8a05e2ab52d2082bd8d70b1d844739b/docs/source/developer-guide/overview.md#L52>, read 2026-11-05).
- `trtllm.cudagraph.padding`: TensorRT-LLM pads a batch whose size does not match a captured graph to the nearest larger size for which a graph exists, and calls the computing of wasted tokens a minor overhead that is often a better trade-off than falling back to eager mode. Value padded to the nearest larger size [measured], checked 2026-11-05 (source: TensorRT-LLM at b96ba43 (the tag v1.4.0rc2), docs/source/developer-guide/overview.md, Runtime Optimizations (CUDA Graph) <https://github.com/NVIDIA/TensorRT-LLM/blob/b96ba434e8a05e2ab52d2082bd8d70b1d844739b/docs/source/developer-guide/overview.md#L54-L55>, read 2026-11-05).
- `trtllm.cudagraph.padding-gain`: TensorRT-LLM's overview says that CUDA graph padding has shown up to a 22% end-to-end throughput increase on certain models and hardware. The overview gives no setup, and the figure has not been checked here. Value 22 % [unverified], checked 2026-11-05 (source: TensorRT-LLM at b96ba43 (the tag v1.4.0rc2), docs/source/developer-guide/overview.md, Runtime Optimizations (CUDA Graph) <https://github.com/NVIDIA/TensorRT-LLM/blob/b96ba434e8a05e2ab52d2082bd8d70b1d844739b/docs/source/developer-guide/overview.md#L54>, read 2026-11-05).
- `vllm.cudagraph.capture-sizes`: When cudagraph_capture_sizes is unset, vLLM captures the sizes 1, 2 and 4, then 8 to 248 in steps of 8, then 256 up to the maximum in steps of 16. Value 1, 2, 4, then 8 to 248 by 8, then by 16 [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/compilation.py, max_cudagraph_capture_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/compilation.py#L695-L711>, read 2026-11-04).
- `vllm.cudagraph.default-max-formula`: When the largest capture size is unset, vLLM sets it to the smaller of max_num_seqs times the decode query length times 2 and the platform ceiling, which is 512 tokens or 1,024 on data-centre Blackwell. Value min(2 * max_num_seqs * query length, ceiling) [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, VllmConfig._set_cudagraph_sizes <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L2398-L2410>, read 2026-11-04).
- `vllm.cudagraph.default-mode`: The default optimization level at v0.33.0 is -O2, which captures FULL_AND_PIECEWISE graphs, a full graph for uniform decode batches and piecewise graphs for the rest. -O1 gives PIECEWISE graphs and -O0 gives none. Value FULL_AND_PIECEWISE [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/optimization_levels.md <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/optimization_levels.md#L7-L10>, read 2026-11-04).
- `vllm.cudagraph.default-sizes-seqs`: Without speculative decoding the default list also gets max_num_seqs as a size, when that is within the largest capture size, so that a full decode batch is captured exactly. Value max_num_seqs is appended if it fits [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, VllmConfig._set_cudagraph_sizes <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L2548-L2551>, read 2026-11-04).
- `vllm.cudagraph.encoder-overhead`: In the note on its vision encoder's CUDA graphs, vLLM says that the encoder pays CUDA kernel launch overhead on the host side, that the overhead is more significant when the batch or the image is small, and that capturing the forward pass at several token budgets when the model is initialized, and replaying the right graph at run time, removes it. Value more significant when the batch is small [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/cuda_graphs_multimodal.md, Motivation <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs_multimodal.md#L42-L44>, read 2026-11-05).
- `vllm.cudagraph.full-and-piecewise-cost`: The design document calls FULL_AND_PIECEWISE, the default mode, generally the most performant setting, especially for low latency with small models or MoEs, and says it also requires the most memory and takes the longest to capture. Value the most performant, and the most memory [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/cuda_graphs.md, CudagraphModes (FULL_AND_PIECEWISE) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs.md#L46>, read 2026-11-05).
- `vllm.cudagraph.full-decode-only-use`: The design document says FULL_DECODE_ONLY, which captures a full graph for uniform decode and none for prefill or mixed batches, suits the decode instances of a prefill and decode setup, and saves the memory that PIECEWISE graphs need. Value saves the memory of the piecewise graphs [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/cuda_graphs.md, CudagraphModes (FULL_DECODE_ONLY) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs.md#L45>, read 2026-11-05).
- `vllm.cudagraph.full-reuses-nonuniform`: In FULL mode vLLM captures full graphs for non-uniform batches only, and a uniform-decode batch reuses the graph of the non-uniform batch of the same batch size, since the two are compatible. Value FULL has one graph per size [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/cuda_graphs.md, CudagraphModes (FULL) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs.md#L44>, read 2026-11-05).
- `vllm.cudagraph.max-capture-size`: If the maximum capture size is not set, vLLM caps it at 512 tokens by default at v0.33.0, which avoids running out of memory when max_num_seqs is small. Value 512 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/compilation.py, max_cudagraph_capture_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/compilation.py#L706-L710>, read 2026-11-04).
- `vllm.cudagraph.max-capture-size-blackwell`: On data-center Blackwell GPUs the default cap on the capture size is 1,024 tokens instead. Value 1024 tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/compilation.py, max_cudagraph_capture_size <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/compilation.py#L706-L710>, read 2026-11-04).
- `vllm.cudagraph.mode-flag`: The CLI sets the mode as the uppercase name in the compilation config, as --compilation-config with a JSON object whose cudagraph_mode is one of NONE, PIECEWISE, FULL, FULL_DECODE_ONLY and FULL_AND_PIECEWISE. Value --compilation-config [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/cuda_graphs.md, Usage guide <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs.md#L193-L194>, read 2026-11-05).
- `vllm.cudagraph.mode-routines`: A CUDAGraphMode is a single mode or a pair. FULL_DECODE_ONLY is the pair (FULL, NONE) and FULL_AND_PIECEWISE is (FULL, PIECEWISE). decode_mode() returns the first member and mixed_mode() the second, and a single mode is both of its own. Value decode mode and mixed mode [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/compilation.py, CUDAGraphMode.mixed_mode <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/compilation.py#L62-L69>, read 2026-11-04).
- `vllm.cudagraph.modes`: At v0.33.0 CUDAGraphMode has five members. NONE, PIECEWISE and FULL are single modes, and FULL_DECODE_ONLY and FULL_AND_PIECEWISE are dual modes, a pair of one mode for decode batches and one for the rest. Value NONE, PIECEWISE, FULL, FULL_DECODE_ONLY, FULL_AND_PIECEWISE [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/compilation.py, CUDAGraphMode <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/compilation.py#L53-L63>, read 2026-11-04).
- `vllm.cudagraph.none-debugging`: The CUDA-graph design document says that NONE turns CUDA graphs off and is good for debugging. Value good for debugging [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/cuda_graphs.md, CudagraphModes (NONE) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs.md#L42>, read 2026-11-05).
- `vllm.cudagraph.padding`: A batch replays a graph captured for a padded shape. The dispatch key's num_tokens can be the padded token length, so the tokens that the padding adds are computed and wasted. Value padded up to a captured size [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/cuda_graphs.md (BatchDescriptor) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs.md#L91>, read 2026-11-04).
- `vllm.cudagraph.piecewise-attention-outside`: PIECEWISE mode builds piecewise CUDA graphs only. It keeps the operations that cannot be captured, some attention operations among them, outside the graph. Value attention stays outside the graph [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/compilation.py, CompilationConfig.cudagraph_mode <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/compilation.py#L620-L622>, read 2026-11-04).
- `vllm.cudagraph.piecewise-partitions`: A graph with N operations that cannot be captured, attention among them, splits into N+1 partitions, and a piecewise capture wraps each partition in a CUDA graph of its own. A piecewise replay is therefore a run of N+1 graph launches with the N operations launched one by one between them. Value N+1 partitions [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/compilation.py, CompilationConfig.use_inductor_graph_partition <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/compilation.py#L675-L685>, read 2026-11-04).
- `vllm.cudagraph.pooling-piecewise`: The CUDA-graph design document says that the default mode is FULL_AND_PIECEWISE where piecewise compilation is available, and that pooling models stay on PIECEWISE. Value PIECEWISE [measured], checked 2026-11-04 (source: vLLM v0.33.0, docs/design/cuda_graphs.md (Defaults) <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/cuda_graphs.md#L48>, read 2026-11-04).
- `vllm.cudagraph.purpose`: vLLM's compile debugging guide says that vLLM applies CUDA graphs to reduce CPU overheads. Value to reduce CPU overheads [measured], checked 2026-11-05 (source: vLLM v0.33.0, docs/design/debug_vllm_compile.md, what vLLM does to a model <https://github.com/vllm-project/vllm/blob/v0.33.0/docs/design/debug_vllm_compile.md#L29>, read 2026-11-05).
- `vllm.cudagraph.sizes-budget-clamp`: The largest capture size is then cut to max_num_batched_tokens, and a capture size above that budget is dropped from a list the user gave. Value no larger than max_num_batched_tokens [measured], checked 2026-11-04 (source: vLLM v0.33.0, vllm/config/vllm.py, VllmConfig._set_cudagraph_sizes <https://github.com/vllm-project/vllm/blob/v0.33.0/vllm/config/vllm.py#L2551-L2553>, read 2026-11-04).
