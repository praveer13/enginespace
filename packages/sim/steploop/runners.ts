// The runner presets (ARCHITECTURE §5.3; WORLD §2.10; D-041): the two model runners of vLLM v0.33.0 as data, the host card each one
// is priced with, the key it dispatches CUDA graphs on, and the speculative methods that take it off the default or keep async
// scheduling from running on it.
//
// MRV2 is the default runner since v0.29.0 (claim vllm.mrv2.default-since), so `mrv2` is the default preset. MRV1 is deprecated but still ships and is
// what the engine falls back to (claims vllm.mrv1.deprecated, vllm.mrv1.still-ships), so `v1` is the legacy preset. What each
// preset changes in a run is, in order of weight: the host card (`../host`), the dispatcher (`./graphs`) and, for speculative
// methods, which runner takes the configuration and whether async scheduling stays on.

import { hostPreset } from '../host'
import type { HostPreset, RunnerPresetId } from '../host/types'
import type { SpecMethodId } from './types'

export interface RunnerPreset {
  readonly id: RunnerPresetId
  /** What a picker calls it. */
  readonly label: string
  /** The key the runner dispatches graphs on (claims vllm.cudagraph.mrv2-key, vllm.cudagraph.mrv1-key). */
  readonly key: { readonly type: string; readonly fields: readonly string[] }
  /** The host card of the runner, with its [estimated] tag and the line that every screen showing its µs prints. */
  readonly host: HostPreset
  /**
   * Batches in flight with async scheduling at one pipeline stage (claims vllm.step.max-concurrent-batches.mrv1, vllm.step.max-concurrent-batches.mrv2): MRV1
   * keeps 2, and MRV2 keeps `pp_size + 1`, which is 2.
   */
  readonly maxInFlight: number
  /** Speculative methods that async scheduling works with on this runner, or null for any (claim vllm.async-scheduling.mrv1-limits). */
  readonly asyncMethods: readonly SpecMethodId[] | null
  /** Speculative methods that MRV2 does not take, so that the engine uses MRV1 instead (claims vllm.mrv2.fallback-reasons, vllm.spec.custom-class-mrv1). */
  readonly unsupportedMethods: readonly SpecMethodId[]
}

/**
 * MRV1 runs async scheduling only with EAGLE, n-gram on the GPU, a draft model, DSpark and DFlash (claim vllm.async-scheduling.mrv1-limits).
 * The EAGLE family is the methods the config lists as `EagleModelTypes`: eagle, eagle3 and the model-specific MTP names, which the model
 * calls `mtp` (claim vllm.spec.methods).
 */
const MRV1_ASYNC_METHODS: readonly SpecMethodId[] = Object.freeze(['eagle', 'eagle3', 'mtp', 'ngram_gpu', 'draft_model', 'dspark', 'dflash'] as const)

/** The two speculative methods that MRV2 does not take at the pin (claim vllm.spec.custom-class-mrv1). */
const MRV2_UNSUPPORTED_METHODS: readonly SpecMethodId[] = Object.freeze(['suffix', 'custom_class'] as const)

const MRV2_KEY = Object.freeze({
  type: 'BatchExecutionDescriptor',
  fields: Object.freeze(['cg_mode', 'num_tokens', 'num_reqs', 'uniform_token_count', 'max_query_len', 'num_active_loras', 'num_ubatches']),
})
const MRV1_KEY = Object.freeze({ type: 'BatchDescriptor', fields: Object.freeze(['num_tokens', 'num_reqs', 'uniform', 'has_lora', 'num_active_loras']) })

// The calls below are marked pure so that a bundle which imports the package for something else (the front page does, for its tick card)
// drops the presets with the host cards they pull in; verify:bundle's front-page gate has 126 B of room.
export const RUNNER_PRESETS: Readonly<Record<RunnerPresetId, RunnerPreset>> = Object.freeze({
  mrv2: Object.freeze({
    id: 'mrv2',
    label: 'MRV2 (vLLM default since v0.29.0)',
    key: MRV2_KEY,
    host: /* @__PURE__ */ hostPreset('mrv2'),
    maxInFlight: 2,
    asyncMethods: null,
    unsupportedMethods: MRV2_UNSUPPORTED_METHODS,
  }),
  v1: Object.freeze({
    id: 'v1',
    label: 'V1 (legacy runner)',
    key: MRV1_KEY,
    host: /* @__PURE__ */ hostPreset('v1'),
    maxInFlight: 2,
    asyncMethods: MRV1_ASYNC_METHODS,
    unsupportedMethods: Object.freeze([]),
  }),
} as const)

/** The runner of a fresh engine at the pin (claim vllm.mrv2.default-rule). */
export const DEFAULT_RUNNER: RunnerPresetId = 'mrv2'

export function runnerPreset(id: RunnerPresetId): RunnerPreset {
  return RUNNER_PRESETS[id]
}

/**
 * The runner an engine ends up on when `requested` meets a speculative method: MRV2 hands a method it does not take back to MRV1
 * (claim vllm.mrv2.default-rule), and MRV1 takes everything.
 */
export function resolveRunner(requested: RunnerPresetId, method?: SpecMethodId): RunnerPresetId {
  return requested === 'mrv2' && method !== undefined && RUNNER_PRESETS.mrv2.unsupportedMethods.includes(method) ? 'v1' : requested
}

/** Whether async scheduling runs on `runner` with `method` (or with no speculation): MRV1 refuses some methods, and an explicit request for it raises (claim vllm.async-scheduling.mrv1-limits). */
export function asyncSupported(runner: RunnerPresetId, method?: SpecMethodId): boolean {
  const allowed = RUNNER_PRESETS[runner].asyncMethods
  return allowed === null || method === undefined || allowed.includes(method)
}
