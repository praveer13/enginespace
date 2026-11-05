// CUDA graphs as data (ARCHITECTURE §5.3; WORLD §2.5; GAMES.md §3, "Simulation API"; D-041): the five modes and how a requested one is
// downgraded, the capture sizes vLLM chooses, the adapter cases it captures, and the two dispatchers that decide, for each step,
// whether it replays a graph and which one. Nothing here runs a step. `run.ts` asks a dispatcher once per step.
//
// The two dispatchers are ports of vLLM v0.33.0's, line for line where the logic is non-trivial, because the point of the `keys`
// level (W1-T13) is that the learner reasons about the real rules:
//   - `dispatchV2` is MRV2's `CudaGraphManager.dispatch` (vllm/v1/worker/gpu/cudagraph_utils.py), the default runner's, whose key
//     is the seven-field `BatchExecutionDescriptor` (claims vllm.cudagraph.mrv2-key, vllm.cudagraph.mrv2-dispatch);
//   - `dispatchV1` is MRV1's `CudagraphDispatcher.dispatch` (vllm/v1/cudagraph_dispatcher.py), the legacy runner's, whose key is the
//     five-field `BatchDescriptor` with `has_lora` (claims vllm.cudagraph.mrv1-key, vllm.cudagraph.mrv1-dispatch).
// The design doc's four-field tuple is stale at the pin and models neither (claim vllm.cudagraph.design-doc-key).
//
// What is left out of the ports, because no configuration of the model reaches it: dual-batch overlap (a microbatch count other
// than 1), varlen decode graphs (adaptive verification), dynamic speculative decoding (several decode query lengths), the
// `valid_modes` and `invalid_modes` arguments (encoder-decoder models), and data-parallel padding. tests/sim/graphs.test.ts checks both
// dispatchers against a second, dictionary-shaped port of the same code, and scripts/tables/vllm-dispatch.py checks them against the
// code itself, on a table of cases (GAMES.md §3, "Invariants the tests check"; the Q-10 run).
//
// Every integer here is exact, and nothing draws a number: a dispatch is a pure function of its arguments.

import type { CudaGraphMode, GraphModeId, StepLoopConfig } from './types'

// ---------------------------------------------------------------------------------------------------------------------------
// The five modes

/** The two routines of a mode: what decode batches run as, what the others run as, and whether the mode has two routines or one. */
export interface GraphRoutines {
  readonly decode: CudaGraphMode
  readonly mixed: CudaGraphMode
  /** `separate_routine()`: FULL_DECODE_ONLY and FULL_AND_PIECEWISE are pairs, and the rest are one mode. */
  readonly separate: boolean
}

/**
 * `CUDAGraphMode.decode_mode()` and `mixed_mode()` for each mode (claims vllm.cudagraph.modes, vllm.cudagraph.mode-routines). FULL_DECODE_ONLY
 * is (FULL, NONE): a full graph for decode batches and nothing for the rest. FULL_AND_PIECEWISE, the default at the pin, is (FULL,
 * PIECEWISE) (claim vllm.cudagraph.default-mode). A single mode is both of its own routines.
 */
export const GRAPH_MODES: Readonly<Record<GraphModeId, GraphRoutines>> = Object.freeze({
  NONE: Object.freeze({ decode: 'NONE', mixed: 'NONE', separate: false }),
  PIECEWISE: Object.freeze({ decode: 'PIECEWISE', mixed: 'PIECEWISE', separate: false }),
  FULL: Object.freeze({ decode: 'FULL', mixed: 'FULL', separate: false }),
  FULL_DECODE_ONLY: Object.freeze({ decode: 'FULL', mixed: 'NONE', separate: true }),
  FULL_AND_PIECEWISE: Object.freeze({ decode: 'FULL', mixed: 'PIECEWISE', separate: true }),
} as const)

/** `CUDAGraphMode.has_mode(mode)`: whether a mode, a pair included, has `member` among its routines. */
export function modeHas(mode: GraphModeId, member: CudaGraphMode): boolean {
  const routines = GRAPH_MODES[mode]
  return routines.separate ? routines.decode === member || routines.mixed === member : mode === member
}

/** The four graph support levels of an attention backend, from most to least (claim vllm.cudagraph.backend-support-levels). */
export type BackendSupport = 'ALWAYS' | 'UNIFORM_BATCH' | 'UNIFORM_SINGLE_TOKEN_DECODE' | 'NEVER'

/** `AttentionCGSupport`'s values, which the downgrade rules compare. */
export const BACKEND_SUPPORT_LEVEL: Readonly<Record<BackendSupport, number>> = Object.freeze({
  ALWAYS: 3,
  UNIFORM_BATCH: 2,
  UNIFORM_SINGLE_TOKEN_DECODE: 1,
  NEVER: 0,
})

/** What `resolveGraphMode` made of a request: the mode that will run, and a sentence for each change made on the way. */
export interface ModeResolution {
  readonly requested: GraphModeId
  readonly mode: GraphModeId
  readonly changes: readonly string[]
}

/**
 * The mode that runs when `requested` meets an attention backend of level `support`: vLLM "downgrades" a mode to the closest one
 * the backend supports (claim vllm.cudagraph.mode-downgrade), in the order of `CompilationConfig.resolve_cudagraph_mode_and_sizes`:
 *   1. a mode with full graphs for mixed batches needs support ALWAYS. Below it the mode becomes FULL_AND_PIECEWISE if attention is split
 *      out of the compiled graph (the default), else FULL_DECODE_ONLY (claim vllm.cudagraph.downgrade-mixed);
 *   2. a mode with full graphs for decode, on a backend that supports none (NEVER), becomes PIECEWISE if attention is compiled
 *      piecewise, else NONE (claim vllm.cudagraph.downgrade-decode);
 *   3. with a decode query length above 1 (speculation) a full decode graph needs UNIFORM_BATCH or better, and below it the mode becomes
 *      PIECEWISE if attention is split out, else NONE (claim vllm.cudagraph.downgrade-spec-decode).
 * Where vLLM raises, so does this, with a RangeError: a mode with full graphs on a backend with no graphs at all, after step 1 or step 3.
 */
export function resolveGraphMode(
  requested: GraphModeId,
  options: { readonly support: BackendSupport; readonly decodeQueryLen?: number; readonly attentionPiecewise?: boolean },
): ModeResolution {
  const { support } = options
  const queryLen = options.decodeQueryLen ?? 1
  const piecewise = options.attentionPiecewise ?? true
  const changes: string[] = []
  let mode = requested
  if (GRAPH_MODES[mode].mixed === 'FULL' && support !== 'ALWAYS') {
    if (support === 'NEVER') throw new RangeError(`${requested} is not supported with a backend of support level NEVER; try PIECEWISE`)
    mode = piecewise ? 'FULL_AND_PIECEWISE' : 'FULL_DECODE_ONLY'
    changes.push(`${requested} needs support ALWAYS and the backend gives ${support}, so the mode becomes ${mode}`)
  }
  if (GRAPH_MODES[mode].decode === 'FULL' && support === 'NEVER') {
    const before = mode
    mode = piecewise ? 'PIECEWISE' : 'NONE'
    changes.push(`${before} captures full decode graphs and the backend supports none, so the mode becomes ${mode}`)
  }
  if (GRAPH_MODES[mode].decode === 'FULL' && queryLen > 1 && BACKEND_SUPPORT_LEVEL[support] < BACKEND_SUPPORT_LEVEL.UNIFORM_BATCH) {
    const before = mode
    mode = piecewise ? 'PIECEWISE' : 'NONE'
    changes.push(`${before} captures full decode graphs, speculation makes decode batches ${queryLen} tokens a request, and support ${support} is below UNIFORM_BATCH, so the mode becomes ${mode}`)
  }
  if (modeHas(mode, 'FULL') && support === 'NEVER') {
    throw new RangeError(`${mode} is not supported with a backend of support level NEVER; try PIECEWISE`)
  }
  return { requested, mode, changes }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Capture sizes

function atLeast(x: unknown, least: number, what: string): void {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < least) throw new RangeError(`${what} must be an integer of at least ${least}, got ${String(x)}`)
}

/** `round_up(x, multiple)`. */
const roundUp = (x: number, multiple: number): number => Math.floor((x + multiple - 1) / multiple) * multiple

/** The sizes lo, lo + step, ... below `end`, as Python's `range(lo, end, step)`. */
function range(lo: number, end: number, step: number): number[] {
  const out: number[] = []
  for (let n = lo; n < end; n += step) out.push(n)
  return out
}

/** Ascending and without repeats, as `sorted(set(sizes))`. */
const sortedSet = (sizes: readonly number[]): number[] => [...new Set(sizes)].sort((a, b) => a - b)

/** The ceiling of the default capture sizes: 512 tokens, or 1,024 on data-centre Blackwell (claims vllm.cudagraph.max-capture-size, vllm.cudagraph.max-capture-size-blackwell). */
export const CAPTURE_CEILING = 512
export const CAPTURE_CEILING_BLACKWELL = 1024

/**
 * The capture sizes vLLM chooses for a configuration that does not list them (`VllmConfig._set_cudagraph_sizes`, outside the
 * interactivity mode and without dynamic speculation):
 *   - the largest size starts at min(2 · max_num_seqs · decode query length, the ceiling) (claim vllm.cudagraph.default-max-formula), and is cut to
 *     `max_num_batched_tokens` (claim vllm.cudagraph.sizes-budget-clamp);
 *   - the list is 1, 2 and 4, then 8 to 248 in steps of 8, then 256 up to the largest in steps of 16 (claim vllm.cudagraph.capture-sizes);
 *   - `max_num_batched_tokens` joins it when it fits within the largest size (claim vllm.cudagraph.default-sizes-budget);
 *   - so do the sizes of full decode batches: `max_num_seqs` alone for plain decoding when it fits (claim vllm.cudagraph.default-sizes-seqs),
 *     and for speculation `n · (1 + k)` for the request counts n of the same grid, up to the ceiling.
 * `sizes`, when given, is a list the user wrote: it is deduplicated, cut to `max_num_batched_tokens` and sorted, and nothing else is
 * added to it.
 */
export function vllmCaptureSizes(options: {
  readonly maxNumSeqs: number
  readonly maxBatchedTokens: number
  readonly decodeQueryLen?: number
  readonly blackwell?: boolean
  readonly sizes?: readonly number[]
}): number[] {
  const { maxNumSeqs, maxBatchedTokens } = options
  const queryLen = options.decodeQueryLen ?? 1
  atLeast(maxNumSeqs, 1, 'maxNumSeqs')
  atLeast(maxBatchedTokens, 1, 'maxBatchedTokens')
  atLeast(queryLen, 1, 'decodeQueryLen')
  if (options.sizes !== undefined) {
    options.sizes.forEach((size, i) => atLeast(size, 1, `sizes[${i}]`))
    return sortedSet(options.sizes.filter((size) => size <= maxBatchedTokens))
  }
  const ceiling = options.blackwell === true ? CAPTURE_CEILING_BLACKWELL : CAPTURE_CEILING
  let largest = Math.min(maxNumSeqs * queryLen * 2, ceiling)
  let decodeSizes: number[] = []
  if (queryLen > 1) {
    const maxReqs = Math.min(maxNumSeqs, ceiling)
    const counts = sortedSet([...[1, 2, 4].filter((n) => n <= maxReqs), ...range(8, Math.min(maxReqs + 1, 256), 8), ...range(256, maxReqs + 1, 16), maxReqs])
    decodeSizes = sortedSet(counts.map((n) => n * queryLen).filter((size) => size <= largest))
  } else if (maxNumSeqs <= largest) {
    decodeSizes = [maxNumSeqs]
  }
  largest = Math.min(maxBatchedTokens, largest)
  const sizes = [1, 2, 4].filter((n) => n <= largest)
  if (largest >= 8) sizes.push(...range(8, Math.min(largest + 1, 256), 8))
  if (largest >= 256) sizes.push(...range(256, largest + 1, 16))
  if (maxBatchedTokens <= largest && !sizes.includes(maxBatchedTokens)) sizes.push(maxBatchedTokens)
  sizes.push(...decodeSizes.filter((size) => size <= maxBatchedTokens))
  return sortedSet(sizes)
}

/**
 * What MRV1 does to a list of capture sizes when its mode captures full decode graphs and the decode query length is above 1: each
 * size is rounded up to a multiple of the length, the ones above the largest size are dropped, and the largest left is the new
 * maximum (claim vllm.cudagraph.mrv1-sizes-multiple, `adjust_cudagraph_sizes_for_spec_decode`). MRV2 does none of this. Throws where vLLM does.
 */
export function mrv1RoundedSizes(sizes: readonly number[], queryLen: number): number[] {
  atLeast(queryLen, 1, 'queryLen')
  if (sizes.length === 0 || queryLen <= 1) return [...sizes]
  const largest = Math.max(...sizes)
  let rounded = sortedSet(sizes.map((size) => roundUp(size, queryLen)).filter((size) => size <= largest))
  if (rounded.length === 0 && queryLen <= largest) rounded = [queryLen]
  if (rounded.length === 0) {
    throw new RangeError(`no valid capture size after rounding to a multiple of ${queryLen}: adjust the speculative tokens or the largest capture size (${largest})`)
  }
  return rounded
}

/**
 * What `resolve_cudagraph_mode_and_sizes` makes of a request, mode and sizes together: the mode `resolveGraphMode` gives, and, for MRV1
 * with full decode graphs and a decode query length above 1, the capture sizes rounded to multiples of the length (claim
 * vllm.cudagraph.mrv1-sizes-multiple). MRV2 keeps the sizes as they are.
 */
export function resolveGraphs(options: {
  readonly requested: GraphModeId
  readonly support: BackendSupport
  readonly runner: 'mrv2' | 'v1'
  readonly captureSizes: readonly number[]
  readonly decodeQueryLen?: number
  readonly attentionPiecewise?: boolean
}): { readonly mode: GraphModeId; readonly captureSizes: readonly number[]; readonly changes: readonly string[] } {
  const queryLen = options.decodeQueryLen ?? 1
  const { mode, changes } = resolveGraphMode(options.requested, { support: options.support, decodeQueryLen: queryLen, attentionPiecewise: options.attentionPiecewise })
  const rounded = options.runner === 'v1' && GRAPH_MODES[mode].decode === 'FULL' && queryLen > 1
  return { mode, captureSizes: rounded ? mrv1RoundedSizes(options.captureSizes, queryLen) : [...options.captureSizes], changes }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The configuration a dispatcher reads

/** The adapter settings that decide which graphs exist (claims vllm.cudagraph.lora-specialize, vllm.cudagraph.lora-count-specialize). */
export interface LoraGraphs {
  /** `max_loras`: the most distinct adapters one batch may use (claim vllm.lora.max-loras-default). */
  readonly maxLoras: number
  /** `cudagraph_specialize_lora`: capture graphs with and without active adapters. Default true at the pin. */
  readonly specializeLora: boolean
  /** `specialize_active_lora`: capture a graph for each count of active adapters, in powers of 2. Default false. */
  readonly specializeActiveLora: boolean
}

/** What both dispatchers read of the engine's configuration. Treat it as immutable: a dispatcher caches its tables per object. */
export interface GraphConfig {
  readonly mode: GraphModeId
  /** Ascending and distinct, as the config leaves them. */
  readonly captureSizes: readonly number[]
  /** `max_num_seqs`. */
  readonly maxNumSeqs: number
  /** The query length of a decode row: 1, or 1 + the speculative tokens (claim vllm.cudagraph.mrv1-query-len). */
  readonly decodeQueryLen: number
  /** `max_cudagraph_capture_size`: the largest capture size, which vLLM sets from the list (claim vllm.cudagraph.max-capture-size). 0 with no sizes. */
  readonly maxCaptureSize: number
  /** Null when the engine serves no adapter. */
  readonly lora: LoraGraphs | null
}

/** A `GraphConfig` from the parts, validated and frozen. The largest capture size is the last of `captureSizes`. */
export function makeGraphConfig(options: {
  readonly mode: GraphModeId
  readonly captureSizes: readonly number[]
  readonly maxNumSeqs: number
  readonly decodeQueryLen?: number
  readonly lora?: { readonly maxLoras: number; readonly specializeLora?: boolean; readonly specializeActiveLora?: boolean } | null
}): GraphConfig {
  const { mode, captureSizes, maxNumSeqs } = options
  if (!(mode in GRAPH_MODES)) throw new RangeError(`graphs.mode is one of ${Object.keys(GRAPH_MODES).join(', ')}, got ${String(mode)}`)
  atLeast(maxNumSeqs, 1, 'maxNumSeqs')
  const decodeQueryLen = options.decodeQueryLen ?? 1
  atLeast(decodeQueryLen, 1, 'decodeQueryLen')
  captureSizes.forEach((size, i) => {
    atLeast(size, 1, `graphs.captureSizes[${i}]`)
    if (i > 0 && size <= captureSizes[i - 1]) throw new RangeError(`graphs.captureSizes must be ascending and distinct, but ${size} follows ${captureSizes[i - 1]}`)
  })
  let lora: LoraGraphs | null = null
  if (options.lora !== undefined && options.lora !== null) {
    atLeast(options.lora.maxLoras, 1, 'lora.maxLoras')
    lora = Object.freeze({ maxLoras: options.lora.maxLoras, specializeLora: options.lora.specializeLora ?? true, specializeActiveLora: options.lora.specializeActiveLora ?? false })
  }
  return Object.freeze({
    mode,
    captureSizes: Object.freeze([...captureSizes]),
    maxNumSeqs,
    decodeQueryLen,
    maxCaptureSize: captureSizes.length > 0 ? captureSizes[captureSizes.length - 1] : 0,
    lora,
  })
}

/** The dispatcher's configuration for a step-loop configuration: its graph settings, its running cap, its speculation and its adapters. */
export function graphConfigOf(cfg: Pick<StepLoopConfig, 'graphs' | 'maxNumSeqs' | 'spec' | 'lora'>): GraphConfig {
  const { graphs } = cfg
  return makeGraphConfig({
    mode: graphs.mode,
    captureSizes: graphs.captureSizes,
    maxNumSeqs: cfg.maxNumSeqs,
    decodeQueryLen: 1 + (cfg.spec?.k ?? 0),
    lora: cfg.lora === undefined ? null : { maxLoras: cfg.lora.maxLoras, specializeLora: graphs.specializeLora, specializeActiveLora: graphs.specializeActiveLora },
  })
}

/** Whether the settings of `graphs` are used by a runner at all. */
export const hasGraphs = (g: GraphConfig): boolean => g.mode !== 'NONE' && g.captureSizes.length > 0

// ---------------------------------------------------------------------------------------------------------------------------
// Adapter cases

/**
 * `get_captured_lora_counts(max_loras, specialize)` (claim vllm.cudagraph.lora-counts): just `max_loras + 1` unless `specialize_active_lora`
 * is on, and then the powers of 2 up to `max_loras` as well. The extra case is the dummy run's, which counts one adapter more than a
 * batch can hold (claim vllm.cudagraph.mrv2-active-loras).
 */
export function capturedLoraCounts(maxLoras: number, specializeActive: boolean): number[] {
  atLeast(maxLoras, 1, 'maxLoras')
  if (!specializeActive) return [maxLoras + 1]
  const out: number[] = []
  for (let n = 1; n <= maxLoras + 1; n++) if ((n & (n - 1)) === 0 || n === maxLoras + 1) out.push(n)
  return out
}

/**
 * The adapter cases a runner captures graphs for: the numbers of active adapters a graph is specialised to, and 0 for a graph
 * with none (GAMES.md §3 sketches this as `loraCaptureCases`). The runners differ when `cudagraph_specialize_lora` is off:
 *   - MRV2 captures 0 and `max_loras + 1` (claim vllm.cudagraph.mrv2-lora-cases);
 *   - MRV1 captures `max_loras + 1` alone, and no graph for a batch without adapters (claim vllm.cudagraph.mrv1-lora-cases).
 * With it on, both capture 0 and `capturedLoraCounts`. Without adapters, both capture 0.
 */
export function loraCaptureCases(g: GraphConfig, runner: 'mrv2' | 'v1' = 'mrv2'): number[] {
  if (g.lora === null) return [0]
  if (g.lora.specializeLora) return [0, ...capturedLoraCounts(g.lora.maxLoras, g.lora.specializeActiveLora)]
  return runner === 'mrv2' ? [0, g.lora.maxLoras + 1] : [g.lora.maxLoras + 1]
}

// ---------------------------------------------------------------------------------------------------------------------------
// MRV2: the default runner's dispatcher

/**
 * MRV2's `BatchExecutionDescriptor` (claim vllm.cudagraph.mrv2-key), the key of a graph and what a dispatch returns. `numReqs` is null when the
 * graph needs no request padding (a piecewise one), `uniformTokenCount` is null when the graph takes any mix of query lengths, and
 * `maxQueryLen` bounds the query length (null here: only varlen decode graphs set it). `numUbatches` is 1: dual-batch overlap is not modelled.
 */
export interface ExecDescriptor {
  readonly cgMode: CudaGraphMode
  readonly numTokens: number
  readonly numReqs: number | null
  readonly uniformTokenCount: number | null
  readonly maxQueryLen: number | null
  readonly numActiveLoras: number
  readonly numUbatches: number
}

/** The captured descriptors of one mode and one adapter case, grouped by token count, in ascending order of it. */
interface Group {
  readonly tokens: number
  readonly descs: readonly ExecDescriptor[]
}

interface PlanV2 {
  /** Per adapter case, the groups of FULL and of PIECEWISE descriptors. */
  readonly groups: ReadonlyMap<number, { readonly FULL: readonly Group[]; readonly PIECEWISE: readonly Group[] }>
  /** `_lora_dispatch_map` as an array: index n holds the captured case for n active adapters, for n up to the largest captured case. */
  readonly loraMap: readonly number[]
  readonly maxLoraCase: number
  /** Every captured descriptor, by ascending token count, then adapter case, then FULL before PIECEWISE. */
  readonly captured: readonly ExecDescriptor[]
}

const sameDesc = (a: ExecDescriptor, b: ExecDescriptor): boolean =>
  a.cgMode === b.cgMode &&
  a.numTokens === b.numTokens &&
  a.numReqs === b.numReqs &&
  a.uniformTokenCount === b.uniformTokenCount &&
  a.maxQueryLen === b.maxQueryLen &&
  a.numActiveLoras === b.numActiveLoras &&
  a.numUbatches === b.numUbatches

const plansV2 = new WeakMap<GraphConfig, PlanV2>()

/**
 * `CudaGraphManager.__init__` and `_init_candidates` (claims vllm.cudagraph.mrv2-candidates, vllm.cudagraph.mrv2-decode-descs, vllm.cudagraph.mrv2-mixed-descs): for each
 * capture size and adapter case, a FULL decode descriptor if the mode has a decode routine of its own, and a mixed descriptor if it has
 * a mixed routine; then, for each mode and adapter case, the descriptors grouped by token count, so that a batch of n tokens
 * finds the group with the smallest token count at or above n.
 */
function planV2(g: GraphConfig): PlanV2 {
  const cached = plansV2.get(g)
  if (cached !== undefined) return cached
  const routines = GRAPH_MODES[g.mode]
  const cases = loraCaptureCases(g, 'mrv2')
  const byMode: Record<'FULL' | 'PIECEWISE', ExecDescriptor[]> = { FULL: [], PIECEWISE: [] }
  if (hasGraphs(g)) {
    const sizes = [...g.captureSizes].sort((a, b) => a - b)
    const maxDecodeTokens = g.maxNumSeqs * g.decodeQueryLen
    for (const numTokens of sizes) {
      for (const numActiveLoras of cases) {
        if (routines.separate && routines.decode !== 'NONE') {
          const rounded = roundUp(numTokens, g.decodeQueryLen)
          const reqs = rounded / g.decodeQueryLen
          if (!(rounded > maxDecodeTokens || rounded > g.maxCaptureSize || reqs > g.maxNumSeqs)) {
            const desc: ExecDescriptor = { cgMode: routines.decode, numTokens: rounded, numReqs: reqs, uniformTokenCount: g.decodeQueryLen, maxQueryLen: null, numActiveLoras, numUbatches: 1 }
            const list = byMode[routines.decode as 'FULL' | 'PIECEWISE']
            if (!list.some((seen) => sameDesc(seen, desc))) list.push(desc)
          }
        }
        if (routines.mixed !== 'NONE') {
          const numReqs = routines.mixed === 'FULL' ? Math.min(numTokens, g.maxNumSeqs) : null
          byMode[routines.mixed as 'FULL' | 'PIECEWISE'].push({ cgMode: routines.mixed, numTokens, numReqs, uniformTokenCount: null, maxQueryLen: null, numActiveLoras, numUbatches: 1 })
        }
      }
    }
  }
  // `descs.sort(key=num_tokens, reverse=True)` is stable, and `reversed` of it is ascending with equal token counts in reverse order.
  const ascending = (list: ExecDescriptor[]): ExecDescriptor[] => [...list].sort((a, b) => b.numTokens - a.numTokens).reverse()
  const groups = new Map<number, { FULL: Group[]; PIECEWISE: Group[] }>()
  const captured: ExecDescriptor[] = []
  for (const numActiveLoras of cases) groups.set(numActiveLoras, { FULL: [], PIECEWISE: [] })
  for (const mode of ['FULL', 'PIECEWISE'] as const) {
    const modeDescs = ascending(byMode[mode])
    for (const numActiveLoras of cases) {
      const target = groups.get(numActiveLoras)![mode]
      for (const desc of modeDescs) {
        if (desc.numActiveLoras !== numActiveLoras) continue
        const last = target[target.length - 1]
        if (last !== undefined && last.tokens === desc.numTokens) (last.descs as ExecDescriptor[]).push(desc)
        else target.push({ tokens: desc.numTokens, descs: [desc] })
      }
    }
    captured.push(...modeDescs)
  }
  // `_build_lora_dispatch_map`: every possible count, up to the largest captured case, to the smallest captured case at or above it.
  const withLora = cases.filter((c) => c > 0).sort((a, b) => a - b)
  const loraMap: number[] = [0]
  if (withLora.length > 0) {
    let at = 0
    for (let n = 1; n <= withLora[withLora.length - 1]; n++) {
      while (withLora[at] < n) at++
      loraMap[n] = withLora[at]
    }
  }
  const plan: PlanV2 = {
    groups,
    loraMap,
    maxLoraCase: withLora.length > 0 ? withLora[withLora.length - 1] : 0,
    captured: captured.sort((a, b) => a.numTokens - b.numTokens || a.numActiveLoras - b.numActiveLoras || (a.cgMode === b.cgMode ? 0 : a.cgMode === 'FULL' ? -1 : 1)),
  }
  plansV2.set(g, plan)
  return plan
}

/** `_is_compatible` (claim vllm.cudagraph.mrv2-compatible): whether a captured descriptor serves a batch. */
function compatible(desc: ExecDescriptor, numReqs: number, numTokens: number, uniformTokenCount: number | null, activeLoras: number, maxQueryLen: number | null, numUbatches: number): boolean {
  return (
    (desc.uniformTokenCount === null || desc.uniformTokenCount === uniformTokenCount) &&
    (desc.maxQueryLen === null || (maxQueryLen !== null && desc.maxQueryLen >= maxQueryLen)) &&
    (desc.numReqs === null || desc.numReqs >= numReqs) &&
    desc.numTokens >= numTokens &&
    desc.numActiveLoras === activeLoras &&
    desc.numUbatches === numUbatches
  )
}

/** The group with the smallest token count at or above `numTokens`, or undefined. */
function groupAtOrAbove(groups: readonly Group[], numTokens: number): Group | undefined {
  let lo = 0
  let hi = groups.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (groups[mid].tokens < numTokens) lo = mid + 1
    else hi = mid
  }
  return lo < groups.length ? groups[lo] : undefined
}

/** `_resolve_effective_loras` (claim vllm.cudagraph.mrv2-lora-clamp): the captured adapter case that serves `activeLoras`. */
function effectiveLorasV2(plan: PlanV2, activeLoras: number): number {
  if (activeLoras <= 0 || plan.maxLoraCase === 0) return activeLoras
  return activeLoras <= plan.maxLoraCase ? plan.loraMap[activeLoras] : plan.maxLoraCase
}

/**
 * MRV2's `CudaGraphManager.dispatch` (claims vllm.cudagraph.mrv2-dispatch, vllm.cudagraph.mrv2-candidates): the first captured descriptor that fits a batch of
 * `numReqs` requests and `numTokens` tokens, FULL ones before PIECEWISE ones, or a descriptor whose mode is NONE.
 *   - `uniformTokenCount`: the query length every request shares if the batch is a uniform decode, else null (claim vllm.cudagraph.mrv2-uniform-count);
 *   - `activeLoras`: the batch's distinct active adapters (claim vllm.cudagraph.mrv2-active-loras), rounded up to a captured case and clamped (claim vllm.cudagraph.mrv2-lora-clamp);
 *   - `maxQueryLen`: the longest query, or null when a request is still prefilling (claim vllm.cudagraph.mrv2-prefill-query-len).
 */
export function dispatchV2(g: GraphConfig, numReqs: number, numTokens: number, uniformTokenCount: number | null, activeLoras: number, maxQueryLen: number | null): ExecDescriptor {
  const plan = planV2(g)
  const effective = effectiveLorasV2(plan, activeLoras)
  if (numTokens > 0) {
    const cases = plan.groups.get(effective)
    if (cases !== undefined) {
      for (const mode of ['FULL', 'PIECEWISE'] as const) {
        const group = groupAtOrAbove(cases[mode], numTokens)
        if (group === undefined) continue
        for (const desc of group.descs) {
          if (compatible(desc, numReqs, numTokens, uniformTokenCount, effective, maxQueryLen, 1)) return desc
        }
      }
    }
  }
  return { cgMode: 'NONE', numTokens, numReqs, uniformTokenCount: null, maxQueryLen: null, numActiveLoras: effective, numUbatches: 1 }
}

/** Every descriptor MRV2 captures for `g`, by ascending token count, then adapter case, then FULL before PIECEWISE. */
export function captureDescriptorsV2(g: GraphConfig): readonly ExecDescriptor[] {
  return planV2(g).captured
}

// ---------------------------------------------------------------------------------------------------------------------------
// MRV1: the legacy runner's dispatcher

/** MRV1's `BatchDescriptor` (claim vllm.cudagraph.mrv1-key): the key of a graph, in which `hasLora` is the legacy key the catalog names (D-041). */
export interface BatchDescriptorV1 {
  readonly numTokens: number
  /** Null for a PIECEWISE key, and for the descriptor of a step that runs eagerly. */
  readonly numReqs: number | null
  readonly uniform: boolean
  readonly hasLora: boolean
  readonly numActiveLoras: number
}

/** What MRV1's dispatch returns: the mode, the key, and the token count the step runs at (`desc.numTokens`; the batch's own when the mode is NONE). */
export interface DispatchV1 {
  readonly mode: CudaGraphMode
  readonly desc: BatchDescriptorV1
  readonly padded: number
}

interface PlanV1 {
  readonly maxSize: number
  /** `_bs_to_padded_graph_size`: index n holds the captured size that serves n tokens. */
  readonly padded: readonly number[]
  readonly full: ReadonlySet<string>
  readonly piecewise: ReadonlySet<string>
  /** `captured_lora_counts`: the positive adapter cases, ascending. */
  readonly capturedCounts: readonly number[]
  /** `specialize_lora_count`. */
  readonly specializeCount: boolean
  readonly fullKeys: readonly BatchDescriptorV1[]
  readonly piecewiseKeys: readonly BatchDescriptorV1[]
}

const keyOfV1 = (d: BatchDescriptorV1): string => `${d.numTokens}:${d.numReqs === null ? 'n' : d.numReqs}:${d.uniform ? 1 : 0}:${d.hasLora ? 1 : 0}:${d.numActiveLoras}`

const plansV1 = new WeakMap<GraphConfig, PlanV1>()

/**
 * `CudagraphDispatcher._create_padded_batch_descriptor` (claims vllm.cudagraph.mrv1-padding-map, vllm.cudagraph.mrv1-uniform-reqs). A uniform decode in a mode with full graphs has
 * `num_reqs` = padded tokens over the query length, and the padded count must be a multiple of the length, or vLLM's assertion fails
 * (it does here too, as a RangeError). Any other batch is not uniform and has `num_reqs` = min(padded tokens, max_num_seqs).
 */
function paddedDescriptorV1(g: GraphConfig, padded: readonly number[], numTokens: number, uniformDecode: boolean, hasLora: boolean, numActiveLoras: number): BatchDescriptorV1 {
  const numTokensPadded = padded[numTokens]
  if (numTokensPadded === undefined) throw new RangeError(`${numTokens} tokens are above the largest capture size, ${g.maxCaptureSize}`)
  if (uniformDecode && modeHas(g.mode, 'FULL')) {
    if (numTokensPadded % g.decodeQueryLen !== 0) throw new RangeError(`the padded size ${numTokensPadded} is not a multiple of the decode query length ${g.decodeQueryLen}`)
    return { numTokens: numTokensPadded, numReqs: Math.min(Math.floor(numTokensPadded / g.decodeQueryLen), g.maxNumSeqs), uniform: true, hasLora, numActiveLoras }
  }
  return { numTokens: numTokensPadded, numReqs: Math.min(numTokensPadded, g.maxNumSeqs), uniform: false, hasLora, numActiveLoras }
}

/**
 * `CudagraphDispatcher.__init__` and `initialize_cudagraph_keys` (claims vllm.cudagraph.mrv1-keys-mixed, vllm.cudagraph.mrv1-keys-decode, vllm.cudagraph.mrv1-lora-cases): the padding table, then one key per
 * capture size and adapter case for the mixed routine (PIECEWISE keys relaxed to `num_reqs` None, uniform false), then, if the mode has full
 * decode graphs of its own, the FULL keys of uniform decode for the sizes from the query length up to the query length times `max_num_seqs`.
 */
function planV1(g: GraphConfig): PlanV1 {
  const cached = plansV1.get(g)
  if (cached !== undefined) return cached
  const routines = GRAPH_MODES[g.mode]
  const full = new Set<string>()
  const piecewise = new Set<string>()
  const fullKeys: BatchDescriptorV1[] = []
  const piecewiseKeys: BatchDescriptorV1[] = []
  const capturedCounts: number[] = []
  const specializeCount = g.lora !== null && g.lora.specializeActiveLora
  const padded: number[] = []
  if (hasGraphs(g)) {
    const sizes = g.captureSizes
    const maxSize = g.maxCaptureSize
    for (let n = 0; n <= maxSize; n++) padded.push(0)
    const ends = [...sizes, maxSize + 1]
    const starts = [0, ...sizes]
    for (let i = 0; i < ends.length; i++) {
      for (let bs = starts[i]; bs < ends[i]; bs++) padded[bs] = bs === starts[i] ? starts[i] : ends[i]
    }
    const cases = loraCaptureCases(g, 'v1')
    capturedCounts.push(...cases.filter((c) => c !== 0))
    const add = (mode: 'FULL' | 'PIECEWISE', desc: BatchDescriptorV1): void => {
      const set = mode === 'FULL' ? full : piecewise
      const key = keyOfV1(desc)
      if (set.has(key)) return
      set.add(key)
      ;(mode === 'FULL' ? fullKeys : piecewiseKeys).push(desc)
    }
    if (routines.mixed !== 'NONE') {
      for (const bs of sizes) {
        for (const n of cases) {
          let desc = paddedDescriptorV1(g, padded, bs, false, n > 0, n)
          if (routines.mixed === 'PIECEWISE') desc = { ...desc, numReqs: null, uniform: false }
          add(routines.mixed as 'FULL' | 'PIECEWISE', desc)
        }
      }
    }
    if (routines.decode === 'FULL' && routines.separate) {
      const maxDecodeTokens = g.decodeQueryLen * g.maxNumSeqs
      for (const bs of sizes.filter((x) => x <= maxDecodeTokens && x >= g.decodeQueryLen)) {
        for (const n of cases) add('FULL', paddedDescriptorV1(g, padded, bs, true, n > 0, n))
      }
    }
  }
  const plan: PlanV1 = {
    maxSize: hasGraphs(g) ? g.maxCaptureSize : 0,
    padded,
    full,
    piecewise,
    capturedCounts,
    specializeCount,
    fullKeys: fullKeys.sort(compareKeysV1),
    piecewiseKeys: piecewiseKeys.sort(compareKeysV1),
  }
  plansV1.set(g, plan)
  return plan
}

const compareKeysV1 = (a: BatchDescriptorV1, b: BatchDescriptorV1): number =>
  a.numTokens - b.numTokens || a.numActiveLoras - b.numActiveLoras || Number(a.uniform) - Number(b.uniform) || (a.numReqs ?? -1) - (b.numReqs ?? -1)

/**
 * MRV1's `CudagraphDispatcher.dispatch` (claim vllm.cudagraph.mrv1-dispatch): FULL if the padded batch has a FULL key, else PIECEWISE if its relaxed
 * key (`num_reqs` None, uniform false) has a PIECEWISE key, else NONE; and NONE for any batch above the largest capture size.
 *   - `uniformDecode`: the longest query is the decode query length and `numTokens` is that times `numReqs` (claim vllm.cudagraph.mrv1-uniform-decode);
 *   - `hasLora`: any adapter is active in the engine's input batch, and `activeLoras` counts them (claims vllm.cudagraph.mrv1-active-loras,
 *     vllm.cudagraph.mrv1-batch-trim). They are consistent in the runner (`hasLora` is `activeLoras > 0`), and the table cases keep them so;
 *   - a batch with adapters dispatches to the smallest captured count at or above its own if `specialize_active_lora` is on, and to
 *     `max_loras + 1` if it is off (claim vllm.cudagraph.mrv1-lora-effective).
 * A NONE descriptor carries the batch's own token count and nothing else, as vLLM's `BatchDescriptor(num_tokens)` does.
 */
export function dispatchV1(g: GraphConfig, numTokens: number, uniformDecode: boolean, hasLora: boolean, activeLoras: number): DispatchV1 {
  const plan = planV1(g)
  const none: DispatchV1 = { mode: 'NONE', desc: { numTokens, numReqs: null, uniform: false, hasLora: false, numActiveLoras: 0 }, padded: numTokens }
  if (g.mode === 'NONE' || plan.maxSize === 0 || numTokens > plan.maxSize) return none
  let effective = activeLoras
  if (hasLora && activeLoras > 0) {
    if (plan.specializeCount) {
      let lo = 0
      let hi = plan.capturedCounts.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (plan.capturedCounts[mid] < activeLoras) lo = mid + 1
        else hi = mid
      }
      if (lo < plan.capturedCounts.length) effective = plan.capturedCounts[lo]
    } else {
      if (g.lora === null) throw new RangeError('LoRA config must be set when hasLora is true')
      effective = g.lora.maxLoras + 1
    }
  }
  const normalizedUniform = uniformDecode && GRAPH_MODES[g.mode].separate
  const desc = paddedDescriptorV1(g, plan.padded, numTokens, normalizedUniform, hasLora, effective)
  if (plan.full.has(keyOfV1(desc))) return { mode: 'FULL', desc, padded: desc.numTokens }
  const relaxed: BatchDescriptorV1 = { ...desc, numReqs: null, uniform: false }
  if (plan.piecewise.has(keyOfV1(relaxed))) return { mode: 'PIECEWISE', desc: relaxed, padded: relaxed.numTokens }
  return none
}

/** Every key MRV1 captures for `g`: the FULL keys, then the PIECEWISE keys, each by ascending token count and then adapter count. */
export function captureKeysV1(g: GraphConfig): readonly { readonly mode: 'FULL' | 'PIECEWISE'; readonly desc: BatchDescriptorV1 }[] {
  const plan = planV1(g)
  return [...plan.fullKeys.map((desc) => ({ mode: 'FULL' as const, desc })), ...plan.piecewiseKeys.map((desc) => ({ mode: 'PIECEWISE' as const, desc }))]
}

// ---------------------------------------------------------------------------------------------------------------------------
// What is captured

/** One CUDA graph a runner captures: the mode it replays as, the token count it was captured at, and the adapter case it serves. */
export interface CapturedGraph {
  readonly mode: 'FULL' | 'PIECEWISE'
  readonly numTokens: number
  readonly numActiveLoras: number
}

/**
 * Every graph `runner` captures for `g`, by ascending token count, then adapter case, then FULL before PIECEWISE: MRV2's descriptors
 * (`captureDescriptorsV2`) or MRV1's keys (`captureKeysV1`). Each is one graph in memory (claim vllm.cudagraph.memory-profile-extrapolates), so the
 * list is what the graph memory of ./memory adds up over.
 */
export function capturedGraphs(g: GraphConfig, runner: 'mrv2' | 'v1'): readonly CapturedGraph[] {
  const list: CapturedGraph[] =
    runner === 'mrv2'
      ? captureDescriptorsV2(g).map((d) => ({ mode: d.cgMode as 'FULL' | 'PIECEWISE', numTokens: d.numTokens, numActiveLoras: d.numActiveLoras }))
      : captureKeysV1(g).map((k) => ({ mode: k.mode, numTokens: k.desc.numTokens, numActiveLoras: k.desc.numActiveLoras }))
  const rank = (m: 'FULL' | 'PIECEWISE'): number => (m === 'FULL' ? 0 : 1)
  return list.sort((a, b) => a.numTokens - b.numTokens || a.numActiveLoras - b.numActiveLoras || rank(a.mode) - rank(b.mode))
}

// ---------------------------------------------------------------------------------------------------------------------------
// What a step looks like to a dispatcher

/** A step's rows as far as the dispatchers care: how long each query is, and whether it is still a prompt. The loop's own rows have these fields. */
export interface BatchRow {
  /** Tokens the row computes this step: a prefill chunk's length, or 1 + the drafts of a decode. */
  readonly chunk: number
  /** Whether the request had not finished its prompt when the step began. */
  readonly prefill: boolean
  /** Prompt tokens computed before this step: a chunk of one new token over existing context runs as a decode (claim vllm.cudagraph.mrv2-uniform-count). */
  readonly done: number
}

/** The arguments of the two dispatchers for one step. */
export interface BatchShape {
  readonly numReqs: number
  readonly numTokens: number
  /** MRV2's `uniform_token_count`: the shared query length of a uniform decode, else null. */
  readonly uniformTokenCount: number | null
  /** MRV2's `max_query_len`: the longest query, null when a row is still prefilling. */
  readonly maxQueryLen: number | null
  /** MRV1's `uniform_decode`. */
  readonly uniformDecodeV1: boolean
}

/**
 * How each runner reads a step's rows (claims vllm.cudagraph.mrv2-uniform-count, vllm.cudagraph.mrv2-prefill-query-len, vllm.cudagraph.mrv1-uniform-decode):
 *   - MRV2: the batch is a uniform decode, with `uniform_token_count` the longest query, if no row is prefilling (or every prefilling
 *     row has one new token over existing context) and the tokens are the longest query times the rows; `max_query_len` is the longest
 *     query, or null if any row is prefilling, whatever its length;
 *   - MRV1: the batch is a uniform decode if the longest query is the decode query length and the tokens are that times the rows.
 */
export function batchShape(rows: readonly BatchRow[], decodeQueryLen: number): BatchShape {
  let numTokens = 0
  let longest = 0
  let anyPrefilling = false
  let allDecodeLike = true
  for (const row of rows) {
    numTokens += row.chunk
    if (row.chunk > longest) longest = row.chunk
    if (row.prefill) {
      anyPrefilling = true
      if (!(row.chunk === 1 && row.done > 0)) allDecodeLike = false
    }
  }
  const numReqs = rows.length
  const uniformShape = numReqs > 0 && numTokens === longest * numReqs
  return {
    numReqs,
    numTokens,
    uniformTokenCount: allDecodeLike && uniformShape ? longest : null,
    maxQueryLen: anyPrefilling ? null : longest,
    uniformDecodeV1: longest === decodeQueryLen && uniformShape,
  }
}

/** What a dispatcher decided for one step: the mode it runs as, the token count it runs at, and the key that matched. */
export interface StepGraph {
  readonly mode: CudaGraphMode
  readonly padded: number
}

/** A runner's dispatcher, bound to one configuration: the tables are built once, and `dispatch` answers a step. */
export interface Dispatcher {
  dispatch(shape: BatchShape, activeLoras: number): StepGraph
}

/** The dispatcher of `runner` for `g`. `activeLoras` is the batch's distinct adapters; MRV1's `hasLora` is that above 0. */
export function dispatcherFor(runner: 'mrv2' | 'v1', g: GraphConfig): Dispatcher {
  if (runner === 'mrv2') {
    return {
      dispatch(shape, activeLoras) {
        const d = dispatchV2(g, shape.numReqs, shape.numTokens, shape.uniformTokenCount, activeLoras, shape.maxQueryLen)
        return { mode: d.cgMode, padded: d.cgMode === 'NONE' ? shape.numTokens : d.numTokens }
      },
    }
  }
  return {
    dispatch(shape, activeLoras) {
      const d = dispatchV1(g, shape.numTokens, shape.uniformDecodeV1, activeLoras > 0, activeLoras)
      return { mode: d.mode, padded: d.mode === 'NONE' ? shape.numTokens : d.padded }
    },
  }
}
