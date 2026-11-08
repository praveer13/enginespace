# Read the engines

_Module `tr1` · review · about 10 hours [estimated]_

## What you will be able to do

- Trace one request through nano-vllm, Mini-SGLang, vLLM and SGLang at their pins, naming every queue, process boundary, copy and sync on the way
- Say which of five mechanisms joins two stages of a request's path, and which stage waits for the GPU
- Find where a box of an older engine post lives in the pinned code, and say which of the post's statements have gone stale
- Name the states of a vLLM request, and trace an abort from the client to the engine core and on to the freed blocks

Prerequisites (advice, never a lock): `ks:T5.L10`, `ks:T5.L7`, `ks:T0.L6`, `ks:T2.L1`.

The first outcome of the course is to trace one request from the API server to the model runner and back, and to name every queue, copy and sync on the way. This module teaches it by reading. kernelspace T5.L10 drew vLLM and SGLang as boxes and said what each is for. Here you open the boxes. You read two small engines in a sitting each, nano-vllm and Mini-SGLang, then "Inside vLLM", a post that maps vLLM at one commit, and then vLLM and SGLang at the versions the course pins. Everything you read is pinned by commit or by tag, so a line number in a lesson is a line you can open, and so is the source of every claim.

The method is one idea, and the first lesson teaches it. A request is data that is always somewhere, and it moves from one place to the next in one of five ways: a queue between threads, IPC between processes, a copy between the CPU's memory and the GPU's, a sync before anything reads what the GPU is still producing, and compute where the work happens. Once you can say which of the five joins two stages, an engine's request path is a list, and a list can be checked. That is what the module's graded map does, stage by stage, against the spans of a trace.

## The browser part

The browser part is seven lessons and a game, and none of it needs a GPU.

1. Five mechanisms: queue, IPC, copy, sync, compute.
2. nano-vllm in one sitting: the engine, the scheduler, the block manager and the model runner.
3. Mini-SGLang: one request through four processes.
4. "Inside vLLM" at `42172ad`, and what moved by v0.33.0.
5. vLLM at the pin, by symbol: from `create_completion` to `sample_tokens`.
6. SGLang at the pin: the overlap loop, `result_queue`, `FutureMap`, three streams, and the Rust pieces.
7. Abort inside the engine.

The game is Back of House (`engine-floor`). It has seven practice levels, one for each engine and idea: `nano`, `nano-tp`, `mini`, `inside`, `vllm`, `sglang` and `abort`. You lay a request's stages from a tray, and the request moves only past a stage whose mechanism fits the boundary it crosses and that the engine really has. Each lesson plays the level of the engine it reads. The eighth level, `map`, is graded: it draws a fresh scenario of any of the five engines, and you lay its whole path in one run. Every trace in the game is synthetic, written by the course's lifecycle model and labelled as such, and every stage cites its file, its symbol and its line at the commit the engine is pinned to. The real engine is the judge. A lesson ends in a check on fresh draws, so recognizing last time's answer earns nothing.

Cancellation has an owner outside this course, the Data Plane specialization of kernelspace (its fifth module), and that module has not shipped. So lesson seven carries the minimum this module needs: what an engine does when its front end says a client has left.

## The part that needs a GPU

The GPU part is a lab, `tr1.fork`: you fork nano-vllm at the pinned commit and make it emit one span for every stage of the map you laid in Back of House. A grader checks that your fork still computes the same tokens, and your browser checks that the spans you emit are the stages of the nano-vllm path, in the order of the lifecycle data. It arrives with the grader (W2, D-039). Until then the Build card below shows what the lab will ask and does not run it, and no lesson here pretends to.

The plan for its three stages is a first win that runs nano-vllm unmodified under a teacher-forced check and earns practice credit, the instrumented fork, and an optional run with a KV pool small enough to force recompute preemption, which checks the spans of the request that was preempted. The whole lab is about 2.5 hours on a 4090-class GPU [estimated]. It depends on a flash-attn build for the pinned PyTorch and CUDA that nobody has checked yet [unverified], so the lab's own task tests the install before the lab is written, and falls back to Mini-SGLang at its pin if none installs.

Credit follows the same line. The module is browser-complete when its exit tickets and the graded `map` are credited. It is complete when the fork's second stage is credited as well, and a Prove-it run with the agent closed is on record (ASSESSMENT §9).

> **Build.** The lab `tr1.fork` (lane F), stages `s1`, `s2`, `s3`. The lab page grades it.

> **Card.** The notional-machine card `lifecycle`.

## Lessons

- [Five mechanisms: queue, IPC, copy, sync, compute](l1-five-mechanisms.md): lesson `tr1.l1`, about 35 minutes [estimated]
- [nano-vllm in one sitting: the engine, the scheduler, the block manager and the model runner](l2-nano-vllm-in-one-sitting.md): lesson `tr1.l2`, about 45 minutes [estimated]
- [Mini-SGLang: one request through four processes](l3-mini-sglang-four-processes.md): lesson `tr1.l3`, about 40 minutes [estimated]
- ["Inside vLLM" and what moved by v0.33.0](l4-inside-vllm-and-what-moved.md): lesson `tr1.l4`, about 40 minutes [estimated]
- [vLLM at the pin, by symbol: from create_completion to sample_tokens](l5-vllm-at-the-pin-by-symbol.md): lesson `tr1.l5`, about 40 minutes [estimated]
- [SGLang at the pin: the overlap loop, result_queue, FutureMap, three streams and the Rust pieces](l6-sglang-at-the-pin.md): lesson `tr1.l6`, about 40 minutes [estimated]
- [Abort inside the engine: where the news goes and who frees the blocks](l7-abort-inside-the-engine.md): lesson `tr1.l7`, about 60 minutes [estimated]
