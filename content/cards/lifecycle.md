---
id: lifecycle
kind: notional-machine
title: A request's lifecycle
world: lifecycle
status: draft
---

The notional machine behind Back of House (`engine-floor`) and TR1's span checks: `packages/sim/lifecycle`, which W1-T16 builds. Until it lands, this card is the specification that model is built to and checked against. It draws one request's path through an engine's processes as data, and the order of the stages is the model. The engines are vLLM v0.33.0, SGLang v0.5.23, and the two small engines the course reads, Mini-SGLang at `9a91cfa` and nano-vllm at `bb823b3`. The real engine is authoritative: when it disagrees with this card, the card is wrong.

## Models

1. **A request's path is a list of stages.** Each stage has a location, which is a process, a thread or a device, and a mechanism, which is a queue, IPC, a copy, a sync or compute (A§5.8). The order of the stages is what the model keeps, and the learner's map is checked against it span by span (GAMES.md §5).
2. **vLLM** runs the API server and the engine core as two processes. The engine core runs in a background process with a busy loop of its own, and the API server's client pushes requests to it and pulls outputs from it. Inside the engine core, requests arrive on an input queue and outputs leave on an output queue, and the loop polls the queue and runs one engine step, which the step-loop card describes. {{claim:vllm.request.engine-core-process}} {{claim:vllm.engine-core.queues}} {{claim:vllm.engine-core.busy-loop}}
3. **A vLLM request is always in a state.** The model keeps the names of the pinned version, and not those of the Inside vLLM post, which reads an older commit than the pin. The HTTP entry that the post names has moved too. {{claim:vllm.request.states}} {{claim:inside-vllm.analysis-commit}} {{claim:vllm.http.api-server-shim}}
4. **An abort** reaches the engine core on its own queue, and the step drains that queue after the forward returns and before it updates the scheduler from the output. The request then ends in FINISHED_ABORTED, one of the states above. {{claim:vllm.engine-core.aborts}} {{claim:vllm.engine-core.abort-status}}
5. **SGLang** has three components: the tokenizer manager, which runs in the main process, the scheduler in a subprocess, and the detokenizer manager in another subprocess. They are joined by IPC over ZMQ. The scheduler's loop launches one batch and then processes the result of the batch before it, so the CPU work on a result overlaps the next batch's GPU work. {{claim:sglang.engine.components}} {{claim:sglang.engine.ipc}} {{claim:sglang.overlap.loop}}
6. **Mini-SGLang** is the small answer key: several independent processes, which are the API server, a tokenizer worker, a detokenizer worker and one scheduler worker for each GPU. They use ZeroMQ for control messages and NCCL for the tensors that the GPUs exchange. Its documented request path is a short run of hand-offs from the API server through the tokenizer, the schedulers and the detokenizer, and back. {{claim:mini-sglang.processes}} {{claim:mini-sglang.transport}} {{claim:mini-sglang.request-path}}
7. **nano-vllm** has one scheduler that picks prefill or decode for each step, so a step is all prefill or all decode, and chunked prefill applies only to the first sequence of a prefill step. Its KV blocks are larger than vLLM's. It is the shortest path the others are read against. {{claim:nano-vllm.step-shape}} {{claim:nano-vllm.chunked-prefill-first-only}} {{claim:nano-vllm.block-size}}

## Ignores

- **Durations.** The model keeps the order of the stages and says nothing about how long a stage takes. A synthetic lifecycle trace has to give its spans times, and those times are made up and labelled synthetic (A§5.7, A§5.8).
- **Batching with other requests.** The path is one request's, as if it ran alone.
- **Failure modes other than abort.** An error, a length cap and a stop on repetition are states of a request (the states above), and the model draws none of their paths.
- **The file names of the reading targets.** The stages are graded by their mechanism and their location, because a file name moves between releases, and the HTTP entry that the Inside vLLM post names already has. {{claim:vllm.http.api-server-shim}}

## Calibrated against

- **The pinned source, stage by stage:** W1-T16 will check each stage against its file at its commit, and that is the only calibration the model will have at first.
- **A lifecycle trace of each engine family:** nothing yet. The owner's first captures arrive with W2-T21, and until then every trace the site shows of a lifecycle is synthetic.
