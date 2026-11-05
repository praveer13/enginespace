/*
 * Two ports of vLLM v0.33.0's CUDA-graph dispatchers (vllm/v1/worker/gpu/cudagraph_utils.py and vllm/v1/cudagraph_dispatcher.py),
 * written to be read beside the Python and to share nothing with packages/sim/steploop/graphs.ts: where the model keeps sorted groups and
 * binary-searches them, this builds `_candidates` as vLLM does, one list for every (token count, adapter case) pair, and where the model
 * keeps one table per mode, this keeps the sets of keys as vLLM does, by value.
 *
 * What this is. It is the build agent's reading of the pinned source (content/claims/vllm/steploop.yaml), run in TypeScript. It is NOT an
 * output of vLLM: the golden tables of W1-T12's check 4 are, and they come from scripts/tables/vllm-dispatch.py (Q-10). Until the owner
 * commits them, this port is the second statement of the rules that the model is held to, and tests/sim/dispatch-tables.test.ts uses it
 * as the stand-in for vLLM's code when it exercises the table checker. A discrepancy between this file and the real tables is a mistake of
 * the reading, and the real tables win.
 *
 * The names of the Python are kept (snake_case turned into camelCase), and so is the order of every loop.
 */
import type { CudaGraphMode, GraphModeId } from '../../packages/sim/steploop'

// CUDAGraphMode's values: NONE = 0, PIECEWISE = 1, FULL = 2, FULL_DECODE_ONLY = (FULL, NONE), FULL_AND_PIECEWISE = (FULL, PIECEWISE).
const NONE = 0
const PIECEWISE = 1
const FULL = 2
type Value = number | readonly [number, number]
const VALUE: Record<GraphModeId, Value> = { NONE, PIECEWISE, FULL, FULL_DECODE_ONLY: [FULL, NONE], FULL_AND_PIECEWISE: [FULL, PIECEWISE] }
const NAME: Record<number, CudaGraphMode> = { 0: 'NONE', 1: 'PIECEWISE', 2: 'FULL' }

const separateRoutine = (mode: GraphModeId): boolean => Array.isArray(VALUE[mode])
const pair = (mode: GraphModeId): readonly [number, number] => VALUE[mode] as readonly [number, number]
const decodeMode = (mode: GraphModeId): number => (separateRoutine(mode) ? pair(mode)[0] : (VALUE[mode] as number))
const mixedMode = (mode: GraphModeId): number => (separateRoutine(mode) ? pair(mode)[1] : (VALUE[mode] as number))
const hasMode = (mode: GraphModeId, member: number): boolean => (separateRoutine(mode) ? pair(mode).includes(member) : VALUE[mode] === member)

/** The inputs of both dispatchers, as the config leaves them. */
export interface OracleConfig {
  readonly mode: GraphModeId
  readonly captureSizes: readonly number[]
  readonly maxNumSeqs: number
  readonly decodeQueryLen: number
  readonly lora: null | { readonly maxLoras: number; readonly specializeLora: boolean; readonly specializeActiveLora: boolean }
}

/** `get_captured_lora_counts` (vllm/lora/utils.py). */
function getCapturedLoraCounts(maxLoras: number, specialize: boolean): number[] {
  if (!specialize) return [maxLoras + 1]
  const out: number[] = []
  for (let n = 1; n < maxLoras + 2; n++) if ((n & (n - 1)) === 0 || n === maxLoras + 1) out.push(n)
  return out
}

const roundUp = (x: number, m: number): number => Math.floor((x + m - 1) / m) * m

// ---------------------------------------------------------------------------------------------------------------------------
// MRV2

export interface OracleDesc {
  cgMode: number
  numTokens: number
  numReqs: number | null
  uniformTokenCount: number | null
  maxQueryLen: number | null
  numActiveLoras: number
  numUbatches: number
}

const descKey = (d: OracleDesc): string => JSON.stringify([d.cgMode, d.numTokens, d.numReqs, d.uniformTokenCount, d.maxQueryLen, d.numActiveLoras, d.numUbatches])

/** `get_lora_capture_cases` (vllm/v1/worker/gpu/lora_utils.py). */
function getLoraCaptureCases(lora: OracleConfig['lora']): number[] {
  if (lora === null) return [0]
  if (lora.specializeLora) {
    const captured = getCapturedLoraCounts(lora.maxLoras, lora.specializeActiveLora)
    return [0, ...captured.filter((c) => c > 0)]
  }
  return [0, lora.maxLoras + 1]
}

/** `_is_compatible`. */
function isCompatible(desc: OracleDesc, numReqs: number, numTokens: number, uniformTokenCount: number | null, numActiveLoras: number, maxQueryLen: number | null, numUbatches: number): boolean {
  return (
    (desc.uniformTokenCount === null || desc.uniformTokenCount === uniformTokenCount) &&
    (desc.maxQueryLen === null || (maxQueryLen !== null && desc.maxQueryLen >= maxQueryLen)) &&
    (desc.numReqs === null || desc.numReqs >= numReqs) &&
    desc.numTokens >= numTokens &&
    desc.numActiveLoras === numActiveLoras &&
    desc.numUbatches === numUbatches
  )
}

/** `CudaGraphManager` for one config, with `_graphs_captured` set, as the dispatch needs it. */
export class OracleManagerV2 {
  readonly candidates = new Map<string, OracleDesc[]>()
  readonly loraCaptureCases: number[]
  readonly loraDispatchMap: Map<number, number>
  readonly maxLoraCase: number
  private readonly cfg: OracleConfig
  private readonly maxCaptureSize: number

  constructor(cfg: OracleConfig) {
    this.cfg = cfg
    this.loraCaptureCases = getLoraCaptureCases(cfg.lora)
    this.maxCaptureSize = cfg.captureSizes.length > 0 ? Math.max(...cfg.captureSizes) : 0
    ;[this.loraDispatchMap, this.maxLoraCase] = this.buildLoraDispatchMap()
    this.initCandidates()
  }

  private buildLoraDispatchMap(): [Map<number, number>, number] {
    const capturedWithLora = this.loraCaptureCases.filter((c) => c > 0).sort((a, b) => a - b)
    if (capturedWithLora.length === 0) return [new Map(), 0]
    const dispatchMap = new Map<number, number>()
    let caseIdx = 0
    for (let n = 1; n < capturedWithLora[capturedWithLora.length - 1] + 1; n++) {
      while (capturedWithLora[caseIdx] < n) caseIdx++
      dispatchMap.set(n, capturedWithLora[caseIdx])
    }
    return [dispatchMap, capturedWithLora[capturedWithLora.length - 1]]
  }

  private resolveEffectiveLoras(numActiveLoras: number): number {
    if (numActiveLoras <= 0 || this.loraDispatchMap.size === 0) return numActiveLoras
    return this.loraDispatchMap.get(numActiveLoras) ?? this.maxLoraCase
  }

  private initCandidates(): void {
    const { mode, maxNumSeqs, decodeQueryLen } = this.cfg
    if (!(mode !== 'NONE' && this.cfg.captureSizes.length > 0)) return
    const captureSizes = [...this.cfg.captureSizes].sort((a, b) => a - b)
    const maxDecodeTokens = maxNumSeqs * decodeQueryLen
    const decodeM = decodeMode(mode)
    const mixedM = mixedMode(mode)
    const separateDecodeRoutine = separateRoutine(mode)
    const descsByMode = new Map<number, OracleDesc[]>()
    const listOf = (m: number): OracleDesc[] => {
      let list = descsByMode.get(m)
      if (list === undefined) descsByMode.set(m, (list = []))
      return list
    }
    for (const numTokens of captureSizes) {
      for (const numActiveLoras of this.loraCaptureCases) {
        if (separateDecodeRoutine && decodeM !== NONE) {
          // In vLLM this loop runs over decode_query_lens, one length here, and its `continue` ends it and not the step above it.
          for (const queryLen of [decodeQueryLen]) {
            const roundedNumTokens = roundUp(numTokens, queryLen)
            const roundedNumReqs = Math.floor(roundedNumTokens / queryLen)
            if (roundedNumTokens > maxDecodeTokens || roundedNumTokens > this.maxCaptureSize || roundedNumReqs > maxNumSeqs) continue
            const desc: OracleDesc = { cgMode: decodeM, numTokens: roundedNumTokens, numReqs: roundedNumReqs, uniformTokenCount: queryLen, maxQueryLen: null, numActiveLoras, numUbatches: 1 }
            if (!listOf(decodeM).some((seen) => descKey(seen) === descKey(desc))) listOf(decodeM).push(desc)
          }
        }
        // `if mixed_mode and (...)` is a separate `if`, not an `elif`, so a step of the loop can add a decode and a mixed descriptor.
        if (mixedM !== NONE) {
          let numReqs: number | null = null
          if (mixedM === FULL) numReqs = Math.min(numTokens, maxNumSeqs)
          listOf(mixedM).push({ cgMode: mixedM, numTokens, numReqs, uniformTokenCount: null, maxQueryLen: null, numActiveLoras, numUbatches: 1 })
        }
      }
    }
    for (const descs of descsByMode.values()) descs.sort((a, b) => b.numTokens - a.numTokens)
    for (const m of [FULL, PIECEWISE]) {
      const modeDescs = [...(descsByMode.get(m) ?? [])].reverse()
      for (const numActiveLoras of this.loraCaptureCases) {
        const loraDescs = modeDescs.filter((d) => d.numActiveLoras === numActiveLoras)
        let currentRangeStart = 0
        // itertools.groupby: runs of equal consecutive token counts.
        for (let at = 0; at < loraDescs.length; ) {
          const numTokens = loraDescs[at].numTokens
          const matching: OracleDesc[] = []
          while (at < loraDescs.length && loraDescs[at].numTokens === numTokens) matching.push(loraDescs[at++])
          for (let i = currentRangeStart; i < numTokens + 1; i++) {
            const key = `${i},${numActiveLoras}`
            const list = this.candidates.get(key)
            if (list === undefined) this.candidates.set(key, [...matching])
            else list.push(...matching)
          }
          currentRangeStart = numTokens + 1
        }
      }
    }
  }

  dispatch(numReqs: number, numTokens: number, uniformTokenCount: number | null, numActiveLoras: number, maxQueryLen: number | null = null, numUbatches = 1): OracleDesc {
    const effectiveLoras = this.resolveEffectiveLoras(numActiveLoras)
    const key = `${numTokens},${effectiveLoras}`
    if (numTokens > 0 && this.candidates.has(key)) {
      for (const desc of this.candidates.get(key)!) {
        if (isCompatible(desc, numReqs, numTokens, uniformTokenCount, effectiveLoras, maxQueryLen, numUbatches)) return desc
      }
    }
    return { cgMode: NONE, numTokens, numReqs, uniformTokenCount: null, maxQueryLen: null, numActiveLoras: effectiveLoras, numUbatches }
  }
}

/** The result of an MRV2 dispatch as the table writes it: [mode, tokens, reqs, uniform, max query, adapters, microbatches]. */
export type RowV2 = readonly [number, number, number | null, number | null, number | null, number, number]
export const rowV2 = (d: OracleDesc): RowV2 => [d.cgMode, d.numTokens, d.numReqs, d.uniformTokenCount, d.maxQueryLen, d.numActiveLoras, d.numUbatches]

// ---------------------------------------------------------------------------------------------------------------------------
// MRV1

export interface OracleKey {
  numTokens: number
  numReqs: number | null
  uniform: boolean
  hasLora: boolean
  numActiveLoras: number
}

const keyString = (k: OracleKey): string => JSON.stringify([k.numTokens, k.numReqs, k.uniform, k.hasLora, k.numActiveLoras])

/** `CudagraphDispatcher` for one config, with its keys initialised as the runner does. */
export class OracleDispatcherV1 {
  private readonly cudagraphKeys: Record<number, Map<string, OracleKey>> = { [PIECEWISE]: new Map(), [FULL]: new Map() }
  private readonly cfg: OracleConfig
  private readonly maxSize: number
  private bsToPaddedGraphSize: number[] = []
  private capturedLoraCounts: number[] = []
  private readonly specializeLoraCount: boolean
  private keysInitialized = false

  constructor(cfg: OracleConfig) {
    this.cfg = cfg
    this.maxSize = cfg.captureSizes.length > 0 ? cfg.captureSizes[cfg.captureSizes.length - 1] : 0
    this.specializeLoraCount = cfg.lora !== null ? cfg.lora.specializeActiveLora : false
    this.initializeCudagraphKeys()
  }

  private computeBsToPaddedGraphSize(): void {
    const sizes = this.cfg.captureSizes
    this.bsToPaddedGraphSize = new Array<number>(this.maxSize + 1).fill(0)
    const ends = [...sizes, this.maxSize + 1]
    const starts = [0, ...sizes]
    for (let i = 0; i < Math.min(ends.length, starts.length); i++) {
      for (let bs = starts[i]; bs < ends[i]; bs++) {
        if (bs === starts[i]) this.bsToPaddedGraphSize[bs] = starts[i]
        else this.bsToPaddedGraphSize[bs] = ends[i]
      }
    }
  }

  private getLoraCases(): number[] {
    const { lora } = this.cfg
    if (lora === null) return [0]
    if (lora.specializeLora) return [0, ...getCapturedLoraCounts(lora.maxLoras, this.specializeLoraCount)]
    return [lora.maxLoras + 1]
  }

  private createPaddedBatchDescriptor(numTokens: number, uniformDecode: boolean, hasLora: boolean, numActiveLoras = 0): OracleKey {
    const { maxNumSeqs, decodeQueryLen, mode } = this.cfg
    const numTokensPadded = this.bsToPaddedGraphSize[numTokens]
    let numReqs: number
    if (uniformDecode && hasMode(mode, FULL)) {
      numReqs = Math.min(Math.floor(numTokensPadded / decodeQueryLen), maxNumSeqs)
      if (numTokensPadded % decodeQueryLen !== 0) throw new Error('AssertionError')
    } else {
      uniformDecode = false
      numReqs = Math.min(numTokensPadded, maxNumSeqs)
    }
    return { numTokens: numTokensPadded, numReqs, uniform: uniformDecode, hasLora, numActiveLoras }
  }

  private addCudagraphKey(runtimeMode: number, key: OracleKey): void {
    this.cudagraphKeys[runtimeMode].set(keyString(key), key)
  }

  private initializeCudagraphKeys(): void {
    const { mode, maxNumSeqs, decodeQueryLen } = this.cfg
    if (mode === 'NONE' || this.cfg.captureSizes.length === 0) {
      this.keysInitialized = true
      return
    }
    this.computeBsToPaddedGraphSize()
    const loraCases = this.getLoraCases()
    this.capturedLoraCounts = loraCases.filter((c) => c !== 0)
    if (mixedMode(mode) !== NONE) {
      for (const bs of this.cfg.captureSizes) {
        for (const numActiveLoras of loraCases) {
          let batchDesc = this.createPaddedBatchDescriptor(bs, false, numActiveLoras > 0, numActiveLoras)
          if (mixedMode(mode) === PIECEWISE) batchDesc = { ...batchDesc, numReqs: null, uniform: false }
          this.addCudagraphKey(mixedMode(mode), batchDesc)
        }
      }
    }
    if (decodeMode(mode) === FULL && separateRoutine(mode)) {
      const maxNumTokens = decodeQueryLen * maxNumSeqs
      const sizesForDecode = this.cfg.captureSizes.filter((x) => x <= maxNumTokens && x >= decodeQueryLen)
      for (const bs of sizesForDecode) {
        for (const numActiveLoras of loraCases) this.addCudagraphKey(FULL, this.createPaddedBatchDescriptor(bs, true, numActiveLoras > 0, numActiveLoras))
      }
    }
    this.keysInitialized = true
  }

  dispatch(numTokens: number, uniformDecode = false, hasLora = false, numActiveLoras = 0): { mode: number; key: OracleKey } {
    const none = { mode: NONE, key: { numTokens, numReqs: null, uniform: false, hasLora: false, numActiveLoras: 0 } }
    if (!this.keysInitialized || this.cfg.mode === 'NONE' || this.maxSize === 0 || numTokens > this.maxSize) return none
    let effectiveNumActiveLoras = numActiveLoras
    if (hasLora && numActiveLoras > 0) {
      if (this.specializeLoraCount) {
        // bisect.bisect_left
        let idx = 0
        while (idx < this.capturedLoraCounts.length && this.capturedLoraCounts[idx] < numActiveLoras) idx++
        if (idx < this.capturedLoraCounts.length) effectiveNumActiveLoras = this.capturedLoraCounts[idx]
      } else {
        effectiveNumActiveLoras = this.cfg.lora!.maxLoras + 1
      }
    }
    const normalizedUniform = uniformDecode && separateRoutine(this.cfg.mode)
    const batchDesc = this.createPaddedBatchDescriptor(numTokens, normalizedUniform, hasLora, effectiveNumActiveLoras)
    if (this.cudagraphKeys[FULL].has(keyString(batchDesc))) return { mode: FULL, key: batchDesc }
    const relaxed = { ...batchDesc, numReqs: null, uniform: false }
    if (this.cudagraphKeys[PIECEWISE].has(keyString(relaxed))) return { mode: PIECEWISE, key: relaxed }
    return none
  }
}

/** The result of an MRV1 dispatch as the table writes it: [mode, tokens, reqs, uniform, has_lora, adapters]. */
export type RowV1 = readonly [number, number, number | null, 0 | 1, 0 | 1, number]
export const rowV1 = (r: { mode: number; key: OracleKey }): RowV1 => [r.mode, r.key.numTokens, r.key.numReqs, r.key.uniform ? 1 : 0, r.key.hasLora ? 1 : 0, r.key.numActiveLoras]

export const MODE_NUMBER: Readonly<Record<CudaGraphMode, number>> = { NONE, PIECEWISE, FULL }
export const MODE_NAME = NAME
