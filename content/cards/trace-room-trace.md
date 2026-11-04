---
id: trace-room-trace
kind: notional-machine
title: The trace and its partition
world: trace
status: draft
---

The notional machine behind The Tape (`gap-hunt`), the Trace Room's viewer and TR1's span checks: `packages/sim/trace`, built by W1-T08. It stores the spans of a run on tracks in integer nanoseconds, splits a step's window into what the GPU did and what the CPU kept it waiting for, and checks that a trace is consistent. A synthetic trace comes from a step-loop run with seeded jitter, and its ground truth is exact. The real engine is authoritative: when it disagrees with this card, the card is wrong.

## Models

1. **`trace@1`** stores spans in columns on tracks, with integer nanosecond timestamps relative to an origin. A track is a CPU thread, a CUDA API lane, a GPU stream or a marker lane. Its canonical text is one set of bytes, so an exporter that writes the same bytes gives the browser the hash that the grader got (A§5.7, A§9.8).
2. **The partition.** A step's window runs from one step mark to the next, and every nanosecond of it belongs to exactly one category: GPU-busy, which is the union of the kernel and copy spans on the GPU streams, split into kernel and copy-only; a CPU gap, where the GPU is idle while the engine's main thread is busy; or both-idle. The three sum to the window, which is the step's TPOT, exactly. Overlap, the main thread's busy time inside the GPU-busy time, is reported beside the partition as hidden CPU work. A span that crosses the window's edge counts for the part inside it (A§5.7, ASSESSMENT §6.1).
3. **Gaps.** Beside the sums, the attribution lists each maximal run of GPU-idle time in the window, split into its CPU-gap and both-idle parts, so that The Tape can ask what the CPU was doing and what it had not yet launched. Naming a gap's cause from the launch queue is The Tape's, and arrives with W2-T20 (GAMES.md §6).
4. **Structural checks.** The columns are consistent, time runs forward, no two kernels or copies overlap on one stream, every kernel has a launch before it on its correlation id, a step mark contains its kernels, and, when floors are given, no step and no named span is shorter than its physics floor (A§5.7, ASSESSMENT §6.1). The rest of that list needs what a trace does not hold, such as the challenge or the learner's own attribution, and `packages/verify` runs it with W2-T08.
5. **Synthetic traces** come from step-loop runs with seeded jitter. The main thread's frames are the run's, with the CUDA API calls inside them, and each forward is a copy in, kernels and a copy out, each with the correlation id of the call that launched it. The step marks fall where the GPU finishes a step. The jitter works only inside what the run treats as one piece, so where the GPU and the main thread start and stop being busy are the run's own, and the ground truth is exact. A trace carries `synthetic: true` and renders a "synthetic" label, and it is never presented as a measurement (A§5.7, WORLD §3.5). By default 24 kernels fold a forward, a kernel may stray 30% from its share, each copy takes 2.5% of its forward, 60% of an eager launch frame falls between its calls, and two touching frames may meet up to 200 ns from where the run put them [estimated].
6. **Formats.** The grader's exporter normalizes a profiler's trace into `trace@1` (A§5.7). The torch profiler writes each rank's trace as gzipped Chrome-format JSON, which the Perfetto UI opens directly, so a pinned trace can be read in a viewer that the learner may know already. {{claim:vllm.profiling.trace-files}} {{claim:trace.perfetto.chrome-json}}

## Ignores

- **Events the profiler did not capture.** A trace holds what its profiler wrote, and the model draws nothing in the gaps of what it missed.
- **Hardware counters.** A span has a start and a length. It has no occupancy, no memory throughput and no clock.
- **Kernels inside a graph that the profiler traced as one launch.** Nsight Systems sees a graph's nodes only when it is started with the node setting, and NVTX ranges inside a captured graph are not in the model. {{claim:vllm.profiling.nsys-graph-trace}}
- **Threads other than the engine's main thread.** The model reads the main thread and the CUDA calls it makes. The frontend and the output thread are left out of an exported trace, and are absent from a synthetic one.
- **What a synthetic trace simplifies.** The model draws a step's whole launch before its forward, so the kernels start after the last launch call, where a real eager launch overlaps its own forward. Kernels run back to back, so there are no gaps between them. A real step has far more kernels than the trace shows, because it folds them to the count the jitter sets. The kernel names are generic and claim nothing about any engine's kernels.

## Calibrated against

- **Exact ground truth on synthetic traces,** which is what the model is held to now. Over 200 seeds [estimated], the attribution of a window recovers what the run says of it, one microsecond at a time, and the three parts add up to the window to the nanosecond (W1-T08).
- **The owner's annotations on pinned traces:** nothing yet. The owner has not captured a trace, so every trace the site shows is synthetic until W2-T21 lands, and the partition is checked there against the owner's reviewed annotations (WORLD §3.4).
- **The jitter:** nothing. Its parameters are a judgment [estimated], and no real trace has been compared with a synthetic one.
