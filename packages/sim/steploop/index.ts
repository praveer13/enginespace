// `steploop` (ARCHITECTURE §5.2, §5.3): the engine's step loop in integer µs. CPU and GPU lanes, async scheduling, CUDA graphs (the five
// modes, the capture sizes, and both runners' dispatchers), the structured-output mask, the speculative step, adapters, the dependency
// check, bubbles, and TTFT and TPOT per request. v0 was the TR2 spike (W0-T13, D-040) and v1 is W1-T12. Every v1 feature is off unless
// the configuration turns it on, and a v0 configuration runs as it did.
//
// `events` (where each phase falls and how it is recorded) and `metrics` (bubbles, latencies, the summary) are the loop's parts,
// and stay out of this barrel: a model that needs them imports them by path. So does the v0 loop, `./run`'s `runStepLoop`: the front
// page imports it by path, because its first paint has no room for v1 (see ./run), and the barrel's `runStepLoop` is v1.
export * from './types'
export * from './cards'
export * from './s5'
export * from './graphs'
export * from './runners'
export * from './engine-defaults'
export * from './memory'
export { MASK_PARALLEL_THRESHOLD, MASK_POOL_THREADS, MASK_TASK_REQUESTS, maskFillUs } from './mask'
export { acceptedDrafts, expectedTokensPerRoundMilli } from './spec'
export { DISPATCH_TABLES } from './dispatch-tables'
export { defaultCaptureSizes, paddedSize } from './run'
export { PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER, runStepLoop } from './run-v1'
