// `steploop` (ARCHITECTURE §5.2, §5.3): the engine's step loop in integer µs. CPU and GPU lanes, async scheduling, CUDA-graph
// capture sizes and padding, the dependency check, bubbles, and TTFT and TPOT per request. This is v0, the TR2 spike (W0-T13,
// D-040): W1-T12 adds the other graph modes and dispatch keys, the mask, speculation and adapters.
//
// `events` (where each phase falls and how it is recorded) and `metrics` (bubbles, latencies, the summary) are the loop's parts,
// and stay out of this barrel: a model that needs them imports them by path.
export * from './types'
export * from './cards'
export { defaultCaptureSizes, paddedSize, runStepLoop } from './run'
