/*
 * In production's lines (GAMES.md §3, "Compose and In production"; D-041): for each level, the pinned engines' settings behind its levers,
 * what the claims say of each and no more, and the claims that hold the source's own words. Production.tsx and the keys' card print them.
 */
import type { FullLevelId } from '@es/play/loop/full/types'

export interface Line {
  readonly setting: string
  readonly says: string
  readonly claims: readonly string[]
}

const ASYNC: readonly Line[] = [
  { setting: 'vllm serve … (async scheduling on)', says: 'vLLM turns async scheduling on by default, unless an option conflicts with it, and has since v0.14.0.', claims: ['vllm.async-scheduling.default', 'vllm.async-scheduling.since'] },
  { setting: 'vllm serve … --no-async-scheduling', says: 'The setting is a tri-state: unset, it resolves to on; false turns the feature off.', claims: ['vllm.async-scheduling.tri-state'] },
  { setting: 'python -m sglang.launch_server … --disable-overlap-schedule', says: "SGLang's overlap scheduler is on by default; the flag turns it off.", claims: ['sglang.overlap.default'] },
]

const GRAPHS: readonly Line[] = [
  { setting: 'compilation_config.cudagraph_mode', says: 'Five modes, and the default optimization level captures FULL_AND_PIECEWISE; a mode the attention backend cannot run is downgraded to the closest it can.', claims: ['vllm.cudagraph.modes', 'vllm.cudagraph.default-mode', 'vllm.cudagraph.mode-downgrade'] },
  { setting: 'compilation_config.cudagraph_capture_sizes', says: 'Unset, vLLM captures 1, 2 and 4, then steps of 8, then steps of 16, up to a largest size capped by default; a batch replays the graph of its padded size.', claims: ['vllm.cudagraph.capture-sizes', 'vllm.cudagraph.max-capture-size', 'vllm.cudagraph.padding'] },
  { setting: "SGLang's decode graphs", says: 'Keyed by padded batch size from a bucket list, up to a largest batch set by the card: 48 on a 24 GB card below tensor-parallel size 4.', claims: ['sglang.cudagraph.decode-buckets', 'sglang.cudagraph.decode-max-bs.small'] },
]

const MRV2: readonly Line[] = [
  { setting: 'VLLM_USE_V2_MODEL_RUNNER', says: 'MRV2 is the default runner unless the variable is 0, Triton is missing, or a feature it does not support is set.', claims: ['vllm.mrv2.default-rule', 'vllm.mrv2.default-since'] },
  { setting: 'MRV2 input preparation', says: 'MRV2 prepares the step\'s inputs with Triton kernels on the GPU.', claims: ['vllm.mrv2.gpu-input-prep'] },
  { setting: 'The V1 runner', says: 'MRV1 is deprecated and still ships.', claims: ['vllm.mrv1.deprecated', 'vllm.mrv1.still-ships'] },
]

const MASK: readonly Line[] = [
  { setting: "vLLM's engine core step", says: 'The bitmask is built after the forward is launched without blocking, so it is computed while the GPU runs.', claims: ['vllm.mask.overlap'] },
  { setting: 'Under async scheduling', says: 'A step whose structured requests still wait for the previous step\'s tokens defers its sampling.', claims: ['vllm.mask.deferred-sampling'] },
  { setting: "SGLang's structured outputs", says: 'SGLang delays sampling, and hides grammar work under speculative verification through a grammar barrier.', claims: ['sglang.mask.delayed-sampling', 'sglang.mask.grammar-barrier'] },
]

const KEYS: readonly Line[] = [
  { setting: "MRV2's BatchExecutionDescriptor", says: "The default runner keys a CUDA graph by seven fields, among them the count of active adapters.", claims: ['vllm.cudagraph.mrv2-key', 'vllm.cudagraph.mrv2-dispatch'] },
  { setting: "MRV1's BatchDescriptor", says: 'The legacy runner keys a graph by five fields, has_lora among them.', claims: ['vllm.cudagraph.mrv1-key', 'vllm.cudagraph.mrv1-dispatch'] },
  { setting: 'cudagraph_specialize_lora', says: 'On by default: graphs are captured with and without active adapters.', claims: ['vllm.cudagraph.lora-specialize'] },
  { setting: "SGLang's buckets", says: 'SGLang keys its decode graphs by padded batch size from bucket lists.', claims: ['sglang.cudagraph.decode-buckets'] },
]

/** `close` plays every lever of TR2's practice levels at once, so it shows their settings: the overlap, the graphs and their memory, and the runner with its input preparation. */
export const PRODUCTION: Readonly<Record<FullLevelId | 'keys', readonly Line[]>> = {
  async: ASYNC,
  graphs: GRAPHS,
  mrv2: MRV2,
  close: [...ASYNC, ...GRAPHS, ...MRV2],
  mask: MASK,
  keys: KEYS,
}


