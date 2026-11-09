/*
 * CUDA graphs as data (packages/sim/steploop/graphs.ts; W1-T12; ARCHITECTURE §5.3; WORLD §2.5; D-041): the five modes and how a
 * requested one is downgraded, vLLM's capture sizes, the adapter cases, and the two dispatchers.
 *
 * The dispatchers are checked three ways, because a port of someone else's code is only right if something else says so:
 *   1. by hand. The worked cases below were read off the Python (vllm/v1/worker/gpu/cudagraph_utils.py and vllm/v1/cudagraph_dispatcher.py at
 *      v0.33.0), one rule at a time, and each comment gives the arithmetic;
 *   2. against tests/sim/graphs-oracle.ts, a dictionary-shaped transcription of the same Python that shares no code with the model, on the 6,400
 *      cases of each dispatcher that scripts/tables/dispatch-cases.ts draws (the cases that vLLM itself is to answer, Q-10);
 *   3. by properties that GAMES.md §3 states: a padded size is at least the size and equal to it exactly when it was captured, nothing above
 *      the largest size replays, and the v0 rule of the model is MRV2's FULL mode.
 * The check against vLLM's own answers is tests/sim/dispatch-tables.test.ts, and it waits for the owner's run.
 */
import { describe, expect, test } from 'bun:test'
import { buildCases, graphConfigFor, sizesForV1 } from '../../scripts/tables/dispatch-cases'
import { below, between, pick, rngFor } from '../../packages/sim/core'
import {
  BACKEND_SUPPORT_LEVEL,
  CAPTURE_CEILING,
  GRAPH_MODES,
  batchShape,
  capturedGraphs,
  capturedLoraCounts,
  captureDescriptorsV2,
  captureKeysV1,
  defaultCaptureSizes,
  dispatchV1,
  dispatchV2,
  dispatcherFor,
  loraCaptureCases,
  makeGraphConfig,
  modeHas,
  mrv1RoundedSizes,
  paddedSize,
  resolveGraphMode,
  resolveGraphs,
  vllmCaptureSizes,
} from '../../packages/sim/steploop'
import type { BackendSupport, GraphModeId } from '../../packages/sim/steploop'
import { MODE_NAME, MODE_NUMBER, OracleDispatcherV1, OracleManagerV2, rowV1, rowV2 } from './graphs-oracle'

const ALL_MODES: GraphModeId[] = ['NONE', 'PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE']
const SUPPORTS: BackendSupport[] = ['ALWAYS', 'UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE', 'NEVER']

// ---------------------------------------------------------------------------------------------------------------------------
describe('the five modes (claims vllm.cudagraph.modes, vllm.cudagraph.mode-routines)', () => {
  test('are the pairs vLLM defines: a single mode is its own decode and mixed routine, and the two dual modes pair FULL with NONE or PIECEWISE', () => {
    expect(GRAPH_MODES.NONE).toEqual({ decode: 'NONE', mixed: 'NONE', separate: false })
    expect(GRAPH_MODES.PIECEWISE).toEqual({ decode: 'PIECEWISE', mixed: 'PIECEWISE', separate: false })
    expect(GRAPH_MODES.FULL).toEqual({ decode: 'FULL', mixed: 'FULL', separate: false })
    expect(GRAPH_MODES.FULL_DECODE_ONLY).toEqual({ decode: 'FULL', mixed: 'NONE', separate: true })
    expect(GRAPH_MODES.FULL_AND_PIECEWISE).toEqual({ decode: 'FULL', mixed: 'PIECEWISE', separate: true })
    expect(Object.keys(GRAPH_MODES)).toEqual(ALL_MODES)
  })

  test('answer has_mode as CUDAGraphMode.has_mode does: a pair has its two members, a single mode only itself', () => {
    expect(modeHas('FULL_AND_PIECEWISE', 'FULL')).toBe(true)
    expect(modeHas('FULL_AND_PIECEWISE', 'PIECEWISE')).toBe(true)
    expect(modeHas('FULL_DECODE_ONLY', 'PIECEWISE')).toBe(false)
    expect(modeHas('FULL_DECODE_ONLY', 'NONE')).toBe(true)
    expect(modeHas('FULL', 'FULL')).toBe(true)
    expect(modeHas('FULL', 'PIECEWISE')).toBe(false)
    expect(modeHas('PIECEWISE', 'FULL')).toBe(false)
  })

  test('are frozen data: the table and its rows cannot be edited by a caller', () => {
    expect(Object.isFrozen(GRAPH_MODES)).toBe(true)
    for (const mode of ALL_MODES) expect(Object.isFrozen(GRAPH_MODES[mode])).toBe(true)
  })
})

describe('the downgrade of a requested mode (claims vllm.cudagraph.downgrade-mixed, downgrade-decode, downgrade-spec-decode)', () => {
  const resolved = (requested: GraphModeId, support: BackendSupport, decodeQueryLen = 1, attentionPiecewise = true) => {
    try {
      return resolveGraphMode(requested, { support, decodeQueryLen, attentionPiecewise }).mode
    } catch {
      return 'error'
    }
  }

  test('FULL needs a backend that supports every batch: below that it becomes FULL_AND_PIECEWISE when attention is split out, else FULL_DECODE_ONLY, and with no support at all it is an error', () => {
    expect(resolved('FULL', 'ALWAYS')).toBe('FULL')
    expect(resolved('FULL', 'UNIFORM_BATCH')).toBe('FULL_AND_PIECEWISE')
    expect(resolved('FULL', 'UNIFORM_BATCH', 1, false)).toBe('FULL_DECODE_ONLY')
    expect(resolved('FULL', 'UNIFORM_SINGLE_TOKEN_DECODE')).toBe('FULL_AND_PIECEWISE')
    expect(resolved('FULL', 'NEVER')).toBe('error')
  })

  test('a full decode graph on a backend with no graph support becomes PIECEWISE when attention is compiled piecewise, else NONE', () => {
    expect(resolved('FULL_AND_PIECEWISE', 'NEVER')).toBe('PIECEWISE')
    expect(resolved('FULL_AND_PIECEWISE', 'NEVER', 1, false)).toBe('NONE')
    expect(resolved('FULL_DECODE_ONLY', 'NEVER')).toBe('PIECEWISE')
    expect(resolved('FULL_DECODE_ONLY', 'NEVER', 1, false)).toBe('NONE')
  })

  test('with a decode query length above 1 a full decode graph needs UNIFORM_BATCH or better, else PIECEWISE or NONE', () => {
    for (const mode of ['FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY'] as const) {
      expect(resolved(mode, 'ALWAYS', 3)).toBe(mode)
      expect(resolved(mode, 'UNIFORM_BATCH', 3)).toBe(mode)
      expect(resolved(mode, 'UNIFORM_SINGLE_TOKEN_DECODE', 3)).toBe('PIECEWISE')
      expect(resolved(mode, 'UNIFORM_SINGLE_TOKEN_DECODE', 3, false)).toBe('NONE')
      // The same support is enough for single-token decodes.
      expect(resolved(mode, 'UNIFORM_SINGLE_TOKEN_DECODE', 1)).toBe(mode)
    }
    // FULL on UNIFORM_SINGLE_TOKEN_DECODE first becomes FULL_AND_PIECEWISE, and then the speculative rule takes it to PIECEWISE.
    expect(resolved('FULL', 'UNIFORM_SINGLE_TOKEN_DECODE', 3)).toBe('PIECEWISE')
  })

  test('PIECEWISE and NONE are never changed, whatever the backend says', () => {
    for (const support of SUPPORTS) for (const q of [1, 3]) for (const attn of [true, false]) {
      expect(resolved('PIECEWISE', support, q, attn)).toBe('PIECEWISE')
      expect(resolved('NONE', support, q, attn)).toBe('NONE')
    }
  })

  test('says what it changed, in a sentence for each change, and nothing when it changed nothing', () => {
    expect(resolveGraphMode('FULL', { support: 'ALWAYS' }).changes).toEqual([])
    const r = resolveGraphMode('FULL', { support: 'UNIFORM_SINGLE_TOKEN_DECODE', decodeQueryLen: 3 })
    expect(r.changes).toHaveLength(2)
    expect(r.changes[0]).toContain('FULL_AND_PIECEWISE')
    expect(r.changes[1]).toContain('PIECEWISE')
  })

  test('uses the support levels of AttentionCGSupport', () => {
    expect(BACKEND_SUPPORT_LEVEL).toEqual({ ALWAYS: 3, UNIFORM_BATCH: 2, UNIFORM_SINGLE_TOKEN_DECODE: 1, NEVER: 0 })
  })

  test('resolveGraphs rounds MRV1\'s capture sizes to the decode query length once the mode has full decode graphs, and leaves MRV2\'s alone', () => {
    const sizes = [1, 2, 4, 8, 16]
    const v1 = resolveGraphs({ requested: 'FULL_AND_PIECEWISE', support: 'ALWAYS', runner: 'v1', captureSizes: sizes, decodeQueryLen: 3 })
    expect(v1.mode).toBe('FULL_AND_PIECEWISE')
    // round_up to a multiple of 3: 3, 3, 6, 9, 18; the 18 is above the largest size, 16, and goes. So the sizes are 3, 6, 9.
    expect(v1.captureSizes).toEqual([3, 6, 9])
    expect(resolveGraphs({ requested: 'FULL_AND_PIECEWISE', support: 'ALWAYS', runner: 'mrv2', captureSizes: sizes, decodeQueryLen: 3 }).captureSizes).toEqual(sizes)
    // PIECEWISE has no full decode graph, and NONE no graph: nothing is rounded.
    expect(resolveGraphs({ requested: 'PIECEWISE', support: 'ALWAYS', runner: 'v1', captureSizes: sizes, decodeQueryLen: 3 }).captureSizes).toEqual(sizes)
    expect(resolveGraphs({ requested: 'NONE', support: 'ALWAYS', runner: 'v1', captureSizes: sizes, decodeQueryLen: 3 }).captureSizes).toEqual(sizes)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('the capture sizes vLLM chooses (claims vllm.cudagraph.capture-sizes, default-max-formula, sizes-budget-clamp, default-sizes-budget, default-sizes-seqs)', () => {
  test('defaultCaptureSizes(512) has 51 sizes [derived]: 3, then 31 steps of 8, then 17 steps of 16', () => {
    const sizes = defaultCaptureSizes(512)
    expect(sizes).toHaveLength(51)
    expect(sizes.slice(0, 5)).toEqual([1, 2, 4, 8, 16])
    expect(sizes.slice(-3)).toEqual([480, 496, 512])
    expect(sizes.filter((n) => n < 8)).toHaveLength(3)
    expect(sizes.filter((n) => n >= 8 && n < 256)).toHaveLength(31)
    expect(sizes.filter((n) => n >= 256)).toHaveLength(17)
  })

  test('on the 4090\'s defaults (256 sequences, 2,048 tokens) and the H100\'s (1,024 and 8,192) the list is vLLM\'s 51 sizes up to 512', () => {
    expect(vllmCaptureSizes({ maxNumSeqs: 256, maxBatchedTokens: 2048 })).toEqual(defaultCaptureSizes(512))
    expect(vllmCaptureSizes({ maxNumSeqs: 1024, maxBatchedTokens: 8192 })).toEqual(defaultCaptureSizes(512))
    expect(CAPTURE_CEILING).toBe(512)
  })

  test('stops at twice the sequences when that is under the ceiling: 64 sequences, as S5\'s harness ran, capture up to 128, and 64 is on the list', () => {
    const sizes = vllmCaptureSizes({ maxNumSeqs: 64, maxBatchedTokens: 8192 })
    expect(sizes).toEqual(defaultCaptureSizes(128))
    expect(sizes[sizes.length - 1]).toBe(128)
    expect(sizes).toContain(64)
  })

  test('adds max_num_seqs when it is off the stride and fits (100 sequences), and does not when it is above the ceiling', () => {
    // largest = min(2 · 100, 512) = 200: 1, 2, 4, 8 to 192 in steps of 8 (the 200 is on the stride too). 100 is off it and is added.
    const sizes = vllmCaptureSizes({ maxNumSeqs: 100, maxBatchedTokens: 8192 })
    expect(sizes).toContain(100)
    expect(sizes[sizes.length - 1]).toBe(200)
    expect(vllmCaptureSizes({ maxNumSeqs: 1024, maxBatchedTokens: 8192 })).not.toContain(1024)
  })

  test('cuts the list at max_num_batched_tokens, and adds the budget itself when it fits within the largest size and is off the stride', () => {
    // 300 tokens of budget: the largest size is min(512, 300) = 300. 8 to 248, then 256 to 300 in steps of 16 (256, 272, 288), and 300 itself.
    const sizes = vllmCaptureSizes({ maxNumSeqs: 256, maxBatchedTokens: 300 })
    expect(sizes[sizes.length - 1]).toBe(300)
    expect(sizes.slice(-5)).toEqual([248, 256, 272, 288, 300])
    // 16 tokens: 1, 2, 4, 8, 16, and the 16 is the budget.
    expect(vllmCaptureSizes({ maxNumSeqs: 256, maxBatchedTokens: 16 })).toEqual([1, 2, 4, 8, 16])
  })

  test('has the datacentre-Blackwell ceiling of 1,024 when asked, and reaches it only with enough sequences and budget', () => {
    expect(vllmCaptureSizes({ maxNumSeqs: 1024, maxBatchedTokens: 8192, blackwell: true }).slice(-3)).toEqual([992, 1008, 1024])
    expect(vllmCaptureSizes({ maxNumSeqs: 256, maxBatchedTokens: 2048, blackwell: true })).toEqual(defaultCaptureSizes(512))
  })

  test('with speculation adds the sizes of full decode batches, n · (1 + k) for the request counts of the same grid', () => {
    // q = 3, 256 sequences: largest = min(256 · 3 · 2, 512) = 512. The request-count grid is 1, 2, 4, 8 to 248, then 256, and the decode sizes
    // are 3n up to 512: they include 3, 6, 12, 24 (n = 1, 2, 4, 8) and 765 is above the ceiling, so n = 256 is not.
    const sizes = vllmCaptureSizes({ maxNumSeqs: 256, maxBatchedTokens: 2048, decodeQueryLen: 3 })
    for (const n of [3, 6, 12, 24, 48]) expect(sizes).toContain(n)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(512)
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
    expect(new Set(sizes).size).toBe(sizes.length)
  })

  test('a list the user writes is deduplicated, cut to the budget and sorted, and nothing is added to it', () => {
    expect(vllmCaptureSizes({ maxNumSeqs: 256, maxBatchedTokens: 100, sizes: [64, 8, 8, 128, 32] })).toEqual([8, 32, 64])
  })

  test('refuses what vLLM could not start with', () => {
    expect(() => vllmCaptureSizes({ maxNumSeqs: 0, maxBatchedTokens: 8 })).toThrow(/maxNumSeqs must be an integer of at least 1/)
    expect(() => vllmCaptureSizes({ maxNumSeqs: 8, maxBatchedTokens: 8, decodeQueryLen: 0 })).toThrow(/decodeQueryLen/)
    expect(() => vllmCaptureSizes({ maxNumSeqs: 8, maxBatchedTokens: 8, sizes: [1, 0] })).toThrow(/sizes\[1\]/)
  })

  test('MRV1 rounds the sizes up to multiples of the decode query length, drops the ones above the largest, and keeps the largest left', () => {
    expect(mrv1RoundedSizes([1, 2, 4, 8], 3)).toEqual([3, 6])
    expect(mrv1RoundedSizes([1, 2, 4, 8, 16], 3)).toEqual([3, 6, 9])
    // Nothing to round at 1.
    expect(mrv1RoundedSizes([1, 2, 4], 1)).toEqual([1, 2, 4])
    // One size, below the length: the length itself is taken if it fits within the largest size.
    expect(mrv1RoundedSizes([2, 4], 4)).toEqual([4])
    // When even one multiple is above the largest size, vLLM refuses to start.
    expect(() => mrv1RoundedSizes([1, 2], 4)).toThrow(/no valid capture size/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('the adapter cases (claims vllm.cudagraph.lora-counts, mrv2-lora-cases, mrv1-lora-cases)', () => {
  test('capturedLoraCounts is max_loras + 1 alone by default, and with specialize_active_lora the powers of 2 up to max_loras and max_loras + 1', () => {
    expect(capturedLoraCounts(4, false)).toEqual([5])
    expect(capturedLoraCounts(4, true)).toEqual([1, 2, 4, 5])
    expect(capturedLoraCounts(1, true)).toEqual([1, 2])
    expect(capturedLoraCounts(3, true)).toEqual([1, 2, 4])
    expect(capturedLoraCounts(8, true)).toEqual([1, 2, 4, 8, 9])
    expect(capturedLoraCounts(7, true)).toEqual([1, 2, 4, 8])
  })

  const cfg = (lora: { maxLoras: number; specializeLora?: boolean; specializeActiveLora?: boolean } | null) =>
    makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4], maxNumSeqs: 4, lora })

  test('without LoRA the only case is 0', () => {
    expect(loraCaptureCases(cfg(null), 'mrv2')).toEqual([0])
    expect(loraCaptureCases(cfg(null), 'v1')).toEqual([0])
  })

  test('with cudagraph_specialize_lora on, the default, both runners capture 0 and the counts', () => {
    expect(loraCaptureCases(cfg({ maxLoras: 4 }), 'mrv2')).toEqual([0, 5])
    expect(loraCaptureCases(cfg({ maxLoras: 4 }), 'v1')).toEqual([0, 5])
    expect(loraCaptureCases(cfg({ maxLoras: 4, specializeActiveLora: true }), 'mrv2')).toEqual([0, 1, 2, 4, 5])
    expect(loraCaptureCases(cfg({ maxLoras: 4, specializeActiveLora: true }), 'v1')).toEqual([0, 1, 2, 4, 5])
  })

  test('with it off MRV2 still captures the no-adapter graph and MRV1 does not: MRV1 captures max_loras + 1 alone', () => {
    expect(loraCaptureCases(cfg({ maxLoras: 4, specializeLora: false }), 'mrv2')).toEqual([0, 5])
    expect(loraCaptureCases(cfg({ maxLoras: 4, specializeLora: false }), 'v1')).toEqual([5])
    // specialize_active_lora has no effect when cudagraph_specialize_lora is off.
    expect(loraCaptureCases(cfg({ maxLoras: 4, specializeLora: false, specializeActiveLora: true }), 'mrv2')).toEqual([0, 5])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('MRV2\'s dispatcher, by hand (claims vllm.cudagraph.mrv2-key, mrv2-dispatch, mrv2-candidates, mrv2-decode-descs, mrv2-mixed-descs, mrv2-compatible)', () => {
  // FULL_AND_PIECEWISE, sizes 1, 2, 4, 8 and 16, at most 8 sequences, plain decoding. The candidates, from `_init_candidates`:
  //   FULL decode descriptors at 1, 2, 4 and 8 tokens (1, 2, 4, 8 requests, uniform count 1); the 16 is above max_num_seqs · 1 = 8 and is skipped;
  //   PIECEWISE mixed descriptors at 1, 2, 4, 8 and 16 tokens, with no request count.
  const g = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4, 8, 16], maxNumSeqs: 8 })
  const full = (numTokens: number, numReqs: number) => ({ cgMode: 'FULL', numTokens, numReqs, uniformTokenCount: 1, maxQueryLen: null, numActiveLoras: 0, numUbatches: 1 })
  const piecewise = (numTokens: number) => ({ cgMode: 'PIECEWISE', numTokens, numReqs: null, uniformTokenCount: null, maxQueryLen: null, numActiveLoras: 0, numUbatches: 1 })

  test('lists the descriptors it captured: four FULL ones for decode and five PIECEWISE ones for the rest', () => {
    expect(captureDescriptorsV2(g)).toEqual([full(1, 1), piecewise(1), full(2, 2), piecewise(2), full(4, 4), piecewise(4), full(8, 8), piecewise(8), piecewise(16)])
    expect(capturedGraphs(g, 'mrv2').map((x) => [x.mode, x.numTokens])).toEqual([['FULL', 1], ['PIECEWISE', 1], ['FULL', 2], ['PIECEWISE', 2], ['FULL', 4], ['PIECEWISE', 4], ['FULL', 8], ['PIECEWISE', 8], ['PIECEWISE', 16]])
  })

  test('a uniform decode of 3 requests pads to the 4-token FULL graph', () => {
    expect(dispatchV2(g, 3, 3, 1, 0, 1)).toEqual(full(4, 4))
    expect(dispatchV2(g, 8, 8, 1, 0, 1)).toEqual(full(8, 8))
    expect(dispatchV2(g, 1, 1, 1, 0, 1)).toEqual(full(1, 1))
  })

  test('a batch with a prefill cannot use a FULL decode graph (its uniform token count is unset), and takes the PIECEWISE graph of the same size', () => {
    expect(dispatchV2(g, 3, 3, null, 0, null)).toEqual(piecewise(4))
    expect(dispatchV2(g, 2, 10, null, 0, null)).toEqual(piecewise(16))
  })

  test('a decode batch above the largest FULL graph falls to the PIECEWISE graph, the next candidate in the list', () => {
    expect(dispatchV2(g, 9, 9, 1, 0, 1)).toEqual(piecewise(16))
  })

  test('above the largest capture size nothing replays: the descriptor is NONE, with the batch\'s own shape', () => {
    expect(dispatchV2(g, 17, 17, 1, 0, 1)).toEqual({ cgMode: 'NONE', numTokens: 17, numReqs: 17, uniformTokenCount: null, maxQueryLen: null, numActiveLoras: 0, numUbatches: 1 })
    expect(dispatchV2(g, 2, 0, null, 0, null).cgMode).toBe('NONE')
  })

  test('a uniform count that is not the graph\'s is no match: decodes of 2 tokens a request do not fit the 1-token FULL graphs', () => {
    // 4 requests of 2 tokens: 8 tokens, uniform 2. The FULL group at 8 tokens has uniform count 1, and the PIECEWISE one fits.
    expect(dispatchV2(g, 4, 8, 2, 0, 2)).toEqual(piecewise(8))
  })

  test('FULL_DECODE_ONLY has no mixed graph: a batch with a prefill runs eagerly', () => {
    const only = makeGraphConfig({ mode: 'FULL_DECODE_ONLY', captureSizes: [1, 2, 4, 8, 16], maxNumSeqs: 8 })
    expect(dispatchV2(only, 3, 3, 1, 0, 1)).toEqual(full(4, 4))
    expect(dispatchV2(only, 3, 3, null, 0, null).cgMode).toBe('NONE')
    expect(captureDescriptorsV2(only).every((d) => d.cgMode === 'FULL')).toBe(true)
    expect(captureDescriptorsV2(only)).toHaveLength(4)
  })

  test('FULL alone is one routine for every batch: the graph of a size takes decodes and prefills alike, with min(tokens, max_num_seqs) requests', () => {
    const one = makeGraphConfig({ mode: 'FULL', captureSizes: [1, 2, 4, 8, 16], maxNumSeqs: 8 })
    const mixed = (numTokens: number) => ({ cgMode: 'FULL', numTokens, numReqs: Math.min(numTokens, 8), uniformTokenCount: null, maxQueryLen: null, numActiveLoras: 0, numUbatches: 1 })
    expect(dispatchV2(one, 3, 3, 1, 0, 1)).toEqual(mixed(4))
    expect(dispatchV2(one, 3, 3, null, 0, null)).toEqual(mixed(4))
    expect(dispatchV2(one, 2, 16, null, 0, null)).toEqual(mixed(16))
    // 9 requests do not fit the 8-request graph of size 16 only if the batch has more requests than the graph: 16 tokens carry at most 8 here.
    expect(dispatchV2(one, 9, 16, null, 0, null).cgMode).toBe('NONE')
  })

  test('PIECEWISE alone has no request count and no uniform count, so any batch of a size fits', () => {
    const pw = makeGraphConfig({ mode: 'PIECEWISE', captureSizes: [4, 8], maxNumSeqs: 8 })
    expect(dispatchV2(pw, 4, 4, 1, 0, 1)).toEqual(piecewise(4))
    expect(dispatchV2(pw, 7, 7, null, 0, null)).toEqual(piecewise(8))
    expect(dispatchV2(pw, 1, 1, 1, 0, 1)).toEqual(piecewise(4))
    expect(dispatchV2(pw, 9, 9, null, 0, null).cgMode).toBe('NONE')
  })

  test('no descriptor bounds the query length, because only varlen decode graphs (adaptive verification) do and the model has none, so max_query_len never changes an answer', () => {
    for (const mode of ['PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE'] as const) {
      const cfg = makeGraphConfig({ mode, captureSizes: [1, 2, 4, 8], maxNumSeqs: 8 })
      expect(captureDescriptorsV2(cfg).every((d) => d.maxQueryLen === null)).toBe(true)
      for (const [reqs, tokens, uniform] of [[3, 3, 1], [2, 7, null], [8, 8, 1]] as const) {
        const expected = dispatchV2(cfg, reqs, tokens, uniform, 0, null)
        for (const bound of [1, 2, 9]) expect(dispatchV2(cfg, reqs, tokens, uniform, 0, bound)).toEqual(expected)
      }
    }
  })

  test('speculation: decode sizes round up to a multiple of the query length, and a rounded size above the largest capture size is skipped', () => {
    // q = 3, sizes 1, 2, 4, 8, at most 8 sequences (max_decode_tokens 24, largest size 8). Rounded: 1 and 2 to 3, 4 to 6, 8 to 9. The 9 is above 8.
    // So the FULL descriptors are 3 tokens (1 request) and 6 tokens (2 requests), each with uniform count 3.
    const spec = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4, 8], maxNumSeqs: 8, decodeQueryLen: 3 })
    const fullDecode = captureDescriptorsV2(spec).filter((d) => d.cgMode === 'FULL')
    expect(fullDecode.map((d) => [d.numTokens, d.numReqs, d.uniformTokenCount])).toEqual([[3, 1, 3], [6, 2, 3]])
    // 2 requests of 3 tokens: 6 tokens, uniform 3 -> the 6-token FULL graph. 3 requests: 9 tokens, above every FULL graph and the largest size.
    expect(dispatchV2(spec, 2, 6, 3, 0, 3)).toMatchObject({ cgMode: 'FULL', numTokens: 6, numReqs: 2, uniformTokenCount: 3 })
    expect(dispatchV2(spec, 3, 9, 3, 0, 3).cgMode).toBe('NONE')
    // 1 request of 3 tokens: the 3-token FULL graph. A plain decode of 3 requests (3 tokens, uniform 1) does not fit it, and takes PIECEWISE.
    expect(dispatchV2(spec, 1, 3, 3, 0, 3)).toMatchObject({ cgMode: 'FULL', numTokens: 3 })
    expect(dispatchV2(spec, 3, 3, 1, 0, 1)).toMatchObject({ cgMode: 'PIECEWISE', numTokens: 4 })
  })

  test('is the same on every call, and the descriptors it returns are the captured ones', () => {
    expect(dispatchV2(g, 3, 3, 1, 0, 1)).toBe(dispatchV2(g, 3, 3, 1, 0, 1))
    expect(captureDescriptorsV2(g)).toContain(dispatchV2(g, 3, 3, 1, 0, 1))
  })

  test('graphs off, or no sizes, capture nothing', () => {
    expect(captureDescriptorsV2(makeGraphConfig({ mode: 'NONE', captureSizes: [1, 2], maxNumSeqs: 4 }))).toEqual([])
    expect(captureDescriptorsV2(makeGraphConfig({ mode: 'FULL', captureSizes: [], maxNumSeqs: 4 }))).toEqual([])
    expect(dispatchV2(makeGraphConfig({ mode: 'NONE', captureSizes: [1, 2], maxNumSeqs: 4 }), 1, 1, 1, 0, 1).cgMode).toBe('NONE')
  })
})

describe('MRV2\'s adapter cases, by hand (claims vllm.cudagraph.mrv2-lora-clamp, mrv2-active-loras)', () => {
  const base = { mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4], maxNumSeqs: 4 } as const
  const adapters = (g: ReturnType<typeof makeGraphConfig>, n: number) => dispatchV2(g, 2, 2, 1, n, 1).numActiveLoras

  test('by default the one captured count is max_loras + 1, so a batch with any adapter dispatches to that graph, and one without to the graph of none', () => {
    const g = makeGraphConfig({ ...base, lora: { maxLoras: 2 } })
    expect(adapters(g, 0)).toBe(0)
    expect(adapters(g, 1)).toBe(3)
    expect(adapters(g, 2)).toBe(3)
    // More adapters than any batch can hold is clamped to the largest case and still replays.
    expect(adapters(g, 9)).toBe(3)
    expect(dispatchV2(g, 2, 2, 1, 9, 1).cgMode).toBe('FULL')
  })

  test('with specialize_active_lora the count rounds up to the smallest captured count that holds it, and above the largest it is clamped', () => {
    const g = makeGraphConfig({ ...base, lora: { maxLoras: 4, specializeActiveLora: true } })
    // Cases 0, 1, 2, 4 and 5.
    expect([0, 1, 2, 3, 4, 5, 6, 9].map((n) => adapters(g, n))).toEqual([0, 1, 2, 4, 4, 5, 5, 5])
  })

  test('a count with no LoRA config has no graph: the descriptor is NONE and keeps the count', () => {
    const g = makeGraphConfig({ ...base })
    expect(dispatchV2(g, 2, 2, 1, 2, 1)).toMatchObject({ cgMode: 'NONE', numActiveLoras: 2 })
  })

  test('the adapter cases multiply the graphs: three captured counts triple the FULL and PIECEWISE descriptors', () => {
    const none = captureDescriptorsV2(makeGraphConfig({ ...base })).length
    const one = captureDescriptorsV2(makeGraphConfig({ ...base, lora: { maxLoras: 2 } })).length
    const three = captureDescriptorsV2(makeGraphConfig({ ...base, lora: { maxLoras: 2, specializeActiveLora: true } })).length
    expect([none, one, three]).toEqual([none, 2 * none, 4 * none])
  })

  test('with cudagraph_specialize_lora off, MRV2 still has the no-adapter graphs', () => {
    const g = makeGraphConfig({ ...base, lora: { maxLoras: 2, specializeLora: false } })
    expect(dispatchV2(g, 2, 2, 1, 0, 1)).toMatchObject({ cgMode: 'FULL', numActiveLoras: 0 })
    expect(dispatchV2(g, 2, 2, 1, 1, 1)).toMatchObject({ cgMode: 'FULL', numActiveLoras: 3 })
  })
})

describe('MRV1\'s dispatcher, by hand (claims vllm.cudagraph.mrv1-key, mrv1-dispatch, mrv1-padding-map, mrv1-keys-mixed, mrv1-keys-decode, mrv1-uniform-reqs)', () => {
  // The same configuration as MRV2's above. The padding map sends 3 to 4, 5 to 8 and 9 to 16. The keys, from `initialize_cudagraph_keys`:
  //   PIECEWISE: (1, None), (2, None), (4, None), (8, None) and (16, None), relaxed;
  //   FULL, for uniform decode at the sizes from 1 up to 1 · 8: (1, 1), (2, 2), (4, 4) and (8, 8), uniform.
  const g = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4, 8, 16], maxNumSeqs: 8 })
  const key = (numTokens: number, numReqs: number | null, uniform: boolean, hasLora = false, numActiveLoras = 0) => ({ numTokens, numReqs, uniform, hasLora, numActiveLoras })

  test('lists its keys: four FULL ones and five PIECEWISE ones', () => {
    expect(captureKeysV1(g).map((k) => [k.mode, k.desc.numTokens, k.desc.numReqs, k.desc.uniform])).toEqual([
      ['FULL', 1, 1, true],
      ['FULL', 2, 2, true],
      ['FULL', 4, 4, true],
      ['FULL', 8, 8, true],
      ['PIECEWISE', 1, null, false],
      ['PIECEWISE', 2, null, false],
      ['PIECEWISE', 4, null, false],
      ['PIECEWISE', 8, null, false],
      ['PIECEWISE', 16, null, false],
    ])
  })

  test('a uniform decode of 3 tokens pads to 4 and replays the FULL key; the same tokens as a mixed batch replay the relaxed PIECEWISE key', () => {
    expect(dispatchV1(g, 3, true, false, 0)).toEqual({ mode: 'FULL', desc: key(4, 4, true), padded: 4 })
    expect(dispatchV1(g, 3, false, false, 0)).toEqual({ mode: 'PIECEWISE', desc: key(4, null, false), padded: 4 })
  })

  test('a uniform decode above the largest FULL key falls to PIECEWISE, and above the largest size to NONE with the batch\'s own token count', () => {
    expect(dispatchV1(g, 10, true, false, 0)).toEqual({ mode: 'PIECEWISE', desc: key(16, null, false), padded: 16 })
    expect(dispatchV1(g, 17, true, false, 0)).toEqual({ mode: 'NONE', desc: key(17, null, false), padded: 17 })
  })

  test('FULL alone has a mixed FULL key for every size, with the exact request count, and a uniform flag of false', () => {
    const one = makeGraphConfig({ mode: 'FULL', captureSizes: [1, 2, 4, 8, 16], maxNumSeqs: 8 })
    expect(dispatchV1(one, 3, true, false, 0)).toEqual({ mode: 'FULL', desc: key(4, 4, false), padded: 4 })
    expect(dispatchV1(one, 12, false, false, 0)).toEqual({ mode: 'FULL', desc: key(16, 8, false), padded: 16 })
  })

  test('PIECEWISE alone relaxes every key: no request count and no uniform flag', () => {
    const pw = makeGraphConfig({ mode: 'PIECEWISE', captureSizes: [4, 8], maxNumSeqs: 8 })
    expect(dispatchV1(pw, 5, true, false, 0)).toEqual({ mode: 'PIECEWISE', desc: key(8, null, false), padded: 8 })
    expect(dispatchV1(pw, 1, false, false, 0)).toEqual({ mode: 'PIECEWISE', desc: key(4, null, false), padded: 4 })
  })

  test('FULL_DECODE_ONLY has keys for uniform decode only, so any other batch is NONE', () => {
    const only = makeGraphConfig({ mode: 'FULL_DECODE_ONLY', captureSizes: [1, 2, 4, 8, 16], maxNumSeqs: 8 })
    expect(dispatchV1(only, 3, true, false, 0).mode).toBe('FULL')
    expect(dispatchV1(only, 3, false, false, 0).mode).toBe('NONE')
    expect(captureKeysV1(only).every((k) => k.mode === 'FULL')).toBe(true)
  })

  test('a uniform decode needs its padded size to be a multiple of the query length, or vLLM\'s assertion fails (here a RangeError)', () => {
    // q = 3 with sizes that are not multiples: MRV1 rounds them before it captures, and a caller that does not trips the assertion.
    const bad = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: [3, 4, 6], maxNumSeqs: 8, decodeQueryLen: 3 })
    expect(() => dispatchV1(bad, 4, true, false, 0)).toThrow(/multiple of the decode query length/)
    const good = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: [3, 6], maxNumSeqs: 8, decodeQueryLen: 3 })
    expect(dispatchV1(good, 4, true, false, 0)).toEqual({ mode: 'FULL', desc: key(6, 2, true), padded: 6 })
    expect(dispatchV1(good, 3, true, false, 0)).toEqual({ mode: 'FULL', desc: key(3, 1, true), padded: 3 })
  })

  test('graphs off, or no sizes: every batch is NONE', () => {
    expect(dispatchV1(makeGraphConfig({ mode: 'NONE', captureSizes: [1, 2], maxNumSeqs: 4 }), 1, true, false, 0).mode).toBe('NONE')
    expect(dispatchV1(makeGraphConfig({ mode: 'FULL', captureSizes: [], maxNumSeqs: 4 }), 1, true, false, 0).mode).toBe('NONE')
  })
})

describe('MRV1\'s adapter cases, by hand (claims vllm.cudagraph.mrv1-lora-cases, mrv1-lora-effective), and where the runners differ', () => {
  const base = { mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4], maxNumSeqs: 4 } as const
  const v1 = (g: ReturnType<typeof makeGraphConfig>, loras: number) => dispatchV1(g, 2, true, loras > 0, loras)

  test('by default a batch with any adapter dispatches to the max_loras + 1 graph, and one without to the graph of none', () => {
    const g = makeGraphConfig({ ...base, lora: { maxLoras: 2 } })
    expect(v1(g, 0).desc).toMatchObject({ numTokens: 2, hasLora: false, numActiveLoras: 0 })
    expect(v1(g, 1).desc).toMatchObject({ numTokens: 2, hasLora: true, numActiveLoras: 3 })
    expect(v1(g, 2).desc).toMatchObject({ hasLora: true, numActiveLoras: 3 })
    expect(v1(g, 1).mode).toBe('FULL')
  })

  test('with specialize_active_lora the count rounds up to a captured one, and above the largest it keeps its own and finds no graph', () => {
    const g = makeGraphConfig({ ...base, lora: { maxLoras: 4, specializeActiveLora: true } })
    expect([1, 2, 3, 4, 5].map((n) => v1(g, n).desc.numActiveLoras)).toEqual([1, 2, 4, 4, 5])
    // MRV2 would clamp 6 to 5 and replay; MRV1 leaves it at 6, which no key has.
    expect(v1(g, 6)).toMatchObject({ mode: 'NONE', padded: 2 })
    expect(dispatchV2(g, 2, 2, 1, 6, 1)).toMatchObject({ cgMode: 'FULL', numActiveLoras: 5 })
  })

  test('with cudagraph_specialize_lora off MRV1 has only the max_loras + 1 graph, so a batch with no adapter finds none and runs eagerly, where MRV2 replays its no-adapter graph', () => {
    const g = makeGraphConfig({ ...base, lora: { maxLoras: 2, specializeLora: false } })
    expect(v1(g, 0).mode).toBe('NONE')
    expect(v1(g, 1).mode).toBe('FULL')
    expect(dispatchV2(g, 2, 2, 1, 0, 1).cgMode).toBe('FULL')
  })

  test('has_lora without a LoRA config is vLLM\'s assertion', () => {
    expect(() => dispatchV1(makeGraphConfig({ ...base }), 2, true, true, 1)).toThrow(/LoRA config must be set/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('what a step looks like to the dispatchers (claims vllm.cudagraph.mrv2-uniform-count, mrv2-prefill-query-len, mrv1-uniform-decode)', () => {
  const decode = { chunk: 1, prefill: false, done: 0 }
  const chunk = (n: number, done = 0) => ({ chunk: n, prefill: true, done })

  test('a pure decode batch is a uniform decode of length 1, and has the query length bound of 1', () => {
    expect(batchShape([decode, decode, decode], 1)).toEqual({ numReqs: 3, numTokens: 3, uniformTokenCount: 1, maxQueryLen: 1, uniformDecodeV1: true })
  })

  test('a batch with a prefill chunk has no uniform count and no query bound for MRV2, whatever its shape', () => {
    expect(batchShape([decode, chunk(5)], 1)).toEqual({ numReqs: 2, numTokens: 6, uniformTokenCount: null, maxQueryLen: null, uniformDecodeV1: false })
    // Two prefill chunks of the same length are uniform in shape and are still not a decode.
    const twoChunks = batchShape([chunk(4), chunk(4)], 1)
    expect(twoChunks.uniformTokenCount).toBeNull()
    expect(twoChunks.maxQueryLen).toBeNull()
  })

  test('a prefill chunk of one new token over existing context runs as a decode for the uniform count, but still takes the query bound away', () => {
    const shape = batchShape([decode, chunk(1, 6)], 1)
    expect(shape.uniformTokenCount).toBe(1)
    expect(shape.maxQueryLen).toBeNull()
    // The first token of a prompt has no context, and is a prefill.
    expect(batchShape([decode, chunk(1, 0)], 1).uniformTokenCount).toBeNull()
  })

  test('MRV1 calls a batch a uniform decode when its longest query is the decode query length and the shape is uniform, with or without a prefill', () => {
    expect(batchShape([chunk(1, 6), chunk(1, 2)], 1).uniformDecodeV1).toBe(true)
    expect(batchShape([chunk(1, 0), decode], 1).uniformDecodeV1).toBe(true)
    expect(batchShape([decode, decode], 3).uniformDecodeV1).toBe(false)
    expect(batchShape([{ ...decode, chunk: 3 }, { ...decode, chunk: 3 }], 3)).toMatchObject({ uniformDecodeV1: true, uniformTokenCount: 3, maxQueryLen: 3 })
  })

  test('a batch of rows of unequal length is not uniform, and an empty one is not either', () => {
    const shape = batchShape([{ ...decode, chunk: 3 }, decode], 3)
    expect(shape).toMatchObject({ uniformTokenCount: null, uniformDecodeV1: false, maxQueryLen: 3 })
    expect(batchShape([], 1)).toMatchObject({ numReqs: 0, numTokens: 0, uniformTokenCount: null })
  })

  test('dispatcherFor gives MRV2\'s and MRV1\'s answers in the one shape the loop reads: a mode and the token count the step runs at', () => {
    const g = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4, 8, 16], maxNumSeqs: 8 })
    const shape = batchShape([decode, decode, decode], 1)
    expect(dispatcherFor('mrv2', g).dispatch(shape, 0)).toEqual({ mode: 'FULL', padded: 4 })
    expect(dispatcherFor('v1', g).dispatch(shape, 0)).toEqual({ mode: 'FULL', padded: 4 })
    const big = batchShape(Array.from({ length: 20 }, () => decode), 1)
    expect(dispatcherFor('mrv2', g).dispatch(big, 0)).toEqual({ mode: 'NONE', padded: 20 })
    expect(dispatcherFor('v1', g).dispatch(big, 0)).toEqual({ mode: 'NONE', padded: 20 })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('the dispatchers against a second port of the Python, on the drawn cases (check 4, GAMES.md §3 "Invariants the tests check")', () => {
  const cases = buildCases()

  test('MRV2: the model and the dictionary-shaped port agree on every one of at least 5,000 cases', () => {
    expect(cases.v2.cases.length).toBeGreaterThanOrEqual(5000)
    const managers = cases.v2.configs.map((c) => new OracleManagerV2({ mode: c.mode, captureSizes: c.sizes, maxNumSeqs: c.maxNumSeqs, decodeQueryLen: c.decodeQueryLen, lora: c.lora }))
    const graphs = cases.v2.configs.map((c) => graphConfigFor(c, 'mrv2'))
    const wrong: string[] = []
    for (const [i, [cfg, reqs, tokens, uniform, loras, maxQuery]] of cases.v2.cases.entries()) {
      const mine = dispatchV2(graphs[cfg], reqs, tokens, uniform, loras, maxQuery)
      const theirs = rowV2(managers[cfg].dispatch(reqs, tokens, uniform, loras, maxQuery))
      const row = [MODE_NUMBER[mine.cgMode], mine.numTokens, mine.numReqs, mine.uniformTokenCount, mine.maxQueryLen, mine.numActiveLoras, mine.numUbatches]
      if (JSON.stringify(row) !== JSON.stringify(theirs)) wrong.push(`case ${i} ${JSON.stringify(cases.v2.cases[i])}: model ${JSON.stringify(row)}, port ${JSON.stringify(theirs)}`)
    }
    expect(wrong.slice(0, 5)).toEqual([])
  })

  test('MRV1: the model and the dictionary-shaped port agree on every one of at least 5,000 cases', () => {
    expect(cases.v1.cases.length).toBeGreaterThanOrEqual(5000)
    const dispatchers = cases.v1.configs.map((c) => new OracleDispatcherV1({ mode: c.mode, captureSizes: sizesForV1(c), maxNumSeqs: c.maxNumSeqs, decodeQueryLen: c.decodeQueryLen, lora: c.lora }))
    const graphs = cases.v1.configs.map((c) => graphConfigFor(c, 'v1'))
    const wrong: string[] = []
    for (const [i, [cfg, tokens, uniformDecode, hasLora, loras]] of cases.v1.cases.entries()) {
      const mine = dispatchV1(graphs[cfg], tokens, uniformDecode === 1, hasLora === 1, loras)
      const theirs = rowV1(dispatchers[cfg].dispatch(tokens, uniformDecode === 1, hasLora === 1, loras))
      const row = [MODE_NUMBER[mine.mode], mine.desc.numTokens, mine.desc.numReqs, mine.desc.uniform ? 1 : 0, mine.desc.hasLora ? 1 : 0, mine.desc.numActiveLoras]
      if (JSON.stringify(row) !== JSON.stringify(theirs)) wrong.push(`case ${i} ${JSON.stringify(cases.v1.cases[i])}: model ${JSON.stringify(row)}, port ${JSON.stringify(theirs)}`)
    }
    expect(wrong.slice(0, 5)).toEqual([])
  })

  test('the cases reach every outcome of both dispatchers, in every mode, so that agreeing on them says something', () => {
    const outcomes = (modes: readonly GraphModeId[], results: readonly (readonly unknown[])[], configOf: (i: number) => GraphModeId) => {
      const seen = new Set<string>()
      results.forEach((row, i) => seen.add(`${configOf(i)}:${MODE_NAME[row[0] as number]}`))
      return modes.flatMap((mode) => (['NONE', 'PIECEWISE', 'FULL'] as const).filter((m) => seen.has(`${mode}:${m}`)).map((m) => `${mode}:${m}`))
    }
    const graphsV2 = cases.v2.configs.map((c) => graphConfigFor(c, 'mrv2'))
    const rowsV2 = cases.v2.cases.map(([cfg, reqs, tokens, uniform, loras, maxQuery]) => [MODE_NUMBER[dispatchV2(graphsV2[cfg], reqs, tokens, uniform, loras, maxQuery).cgMode]])
    const reachedV2 = outcomes(ALL_MODES, rowsV2, (i) => cases.v2.configs[cases.v2.cases[i][0]].mode)
    // Each mode reaches the outcomes it can: NONE only NONE, PIECEWISE modes PIECEWISE or NONE, FULL ones FULL or NONE, and the pairs all three.
    expect(reachedV2).toContain('NONE:NONE')
    expect(reachedV2).toContain('PIECEWISE:PIECEWISE')
    expect(reachedV2).toContain('FULL:FULL')
    expect(reachedV2).toContain('FULL_DECODE_ONLY:FULL')
    expect(reachedV2).toContain('FULL_DECODE_ONLY:NONE')
    expect(reachedV2).toContain('FULL_AND_PIECEWISE:FULL')
    expect(reachedV2).toContain('FULL_AND_PIECEWISE:PIECEWISE')
    expect(reachedV2).toContain('FULL_AND_PIECEWISE:NONE')
    expect(reachedV2).not.toContain('PIECEWISE:FULL')
    expect(reachedV2).not.toContain('FULL_DECODE_ONLY:PIECEWISE')
    const graphsV1 = cases.v1.configs.map((c) => graphConfigFor(c, 'v1'))
    const rowsV1 = cases.v1.cases.map(([cfg, tokens, uniformDecode, hasLora, loras]) => [MODE_NUMBER[dispatchV1(graphsV1[cfg], tokens, uniformDecode === 1, hasLora === 1, loras).mode]])
    const reachedV1 = outcomes(ALL_MODES, rowsV1, (i) => cases.v1.configs[cases.v1.cases[i][0]].mode)
    for (const outcome of ['FULL:FULL', 'PIECEWISE:PIECEWISE', 'FULL_DECODE_ONLY:FULL', 'FULL_DECODE_ONLY:NONE', 'FULL_AND_PIECEWISE:FULL', 'FULL_AND_PIECEWISE:PIECEWISE', 'FULL_AND_PIECEWISE:NONE']) {
      expect(reachedV1).toContain(outcome)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('properties of the dispatchers (GAMES.md §3, "Invariants the tests check")', () => {
  /** A random configuration, and the sizes it captures. */
  function randomConfig(seed: number) {
    const rng = rngFor(seed, 'test/graphs/properties')
    const sizes = Array.from(new Set(Array.from({ length: between(rng, 2, 10) }, () => between(rng, 1, 120)))).sort((a, b) => a - b)
    const mode = pick(rng, ['PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE'] as const)
    return { rng, sizes, mode, maxNumSeqs: between(rng, 1, 64) }
  }

  test('MRV2 in FULL mode is v0\'s rule: the padded size of n tokens is the smallest captured size at or above n, and null above the largest means NONE', () => {
    for (let seed = 0; seed < 60; seed++) {
      const { rng, sizes, maxNumSeqs } = randomConfig(seed)
      const g = makeGraphConfig({ mode: 'FULL', captureSizes: sizes, maxNumSeqs })
      for (let n = 1; n <= sizes[sizes.length - 1] + 3; n++) {
        const reqs = between(rng, 1, Math.min(n, maxNumSeqs))
        const d = dispatchV2(g, reqs, n, below(rng, 2) === 0 ? 1 : null, 0, null)
        const padded = paddedSize(sizes, n)
        if (padded === null) expect(d.cgMode).toBe('NONE')
        else expect([d.cgMode, d.numTokens]).toEqual(['FULL', padded])
        // The same rule on MRV1.
        const m = dispatchV1(g, n, false, false, 0)
        if (padded === null) expect(m.mode).toBe('NONE')
        else expect([m.mode, m.padded]).toEqual(['FULL', padded])
      }
    }
  })

  test('a replay is at least as big as the batch and is never above the largest captured size; a NONE step runs at its own size', () => {
    for (let seed = 100; seed < 160; seed++) {
      const { rng, sizes, mode, maxNumSeqs } = randomConfig(seed)
      const g = makeGraphConfig({ mode, captureSizes: sizes, maxNumSeqs })
      for (let i = 0; i < 50; i++) {
        const n = between(rng, 1, sizes[sizes.length - 1] + 20)
        const reqs = between(rng, 1, Math.min(n, maxNumSeqs))
        const uniform = below(rng, 2) === 0
        const v2 = dispatchV2(g, reqs, n, uniform ? 1 : null, 0, uniform ? 1 : null)
        const v1 = dispatchV1(g, n, uniform, false, 0)
        for (const [mode2, padded] of [[v2.cgMode, v2.numTokens], [v1.mode, v1.padded]] as const) {
          if (mode2 === 'NONE') expect(padded).toBe(n)
          else {
            expect(padded).toBeGreaterThanOrEqual(n)
            expect(padded).toBeLessThanOrEqual(sizes[sizes.length - 1])
          }
        }
        if (n > sizes[sizes.length - 1]) {
          expect(v2.cgMode).toBe('NONE')
          expect(v1.mode).toBe('NONE')
        }
      }
    }
  })

  test('MRV1: FULL needs a FULL key and PIECEWISE uses the relaxed key, with no request count and not uniform', () => {
    for (let seed = 200; seed < 240; seed++) {
      const { rng, sizes, mode, maxNumSeqs } = randomConfig(seed)
      const g = makeGraphConfig({ mode, captureSizes: sizes, maxNumSeqs })
      const keys = captureKeysV1(g)
      for (let i = 0; i < 40; i++) {
        const n = between(rng, 1, sizes[sizes.length - 1])
        const uniform = below(rng, 2) === 0
        const d = dispatchV1(g, n, uniform, false, 0)
        if (d.mode === 'PIECEWISE') {
          expect(d.desc.numReqs).toBeNull()
          expect(d.desc.uniform).toBe(false)
        }
        if (d.mode === 'FULL') expect(d.desc.numReqs).not.toBeNull()
        if (d.mode !== 'NONE') expect(keys.some((k) => k.mode === d.mode && JSON.stringify(k.desc) === JSON.stringify(d.desc))).toBe(true)
      }
    }
  })

  test('a captured size replays at exactly its own size, in every mode that has a graph for the batch', () => {
    for (let seed = 300; seed < 330; seed++) {
      const { sizes, maxNumSeqs } = randomConfig(seed)
      const g = makeGraphConfig({ mode: 'PIECEWISE', captureSizes: sizes, maxNumSeqs })
      for (const size of sizes) {
        expect(dispatchV2(g, 1, size, null, 0, null)).toMatchObject({ cgMode: 'PIECEWISE', numTokens: size })
        expect(dispatchV1(g, size, false, false, 0)).toMatchObject({ mode: 'PIECEWISE', padded: size })
      }
    }
  })

  test('a config with a bad list is refused: sizes ascending and distinct, positive integers, and at least one sequence', () => {
    expect(() => makeGraphConfig({ mode: 'FULL', captureSizes: [4, 2], maxNumSeqs: 4 })).toThrow(/ascending and distinct/)
    expect(() => makeGraphConfig({ mode: 'FULL', captureSizes: [2, 2], maxNumSeqs: 4 })).toThrow(/ascending and distinct/)
    expect(() => makeGraphConfig({ mode: 'FULL', captureSizes: [0, 2], maxNumSeqs: 4 })).toThrow(/at least 1/)
    expect(() => makeGraphConfig({ mode: 'FULL', captureSizes: [1], maxNumSeqs: 0 })).toThrow(/maxNumSeqs/)
    expect(() => makeGraphConfig({ mode: 'WHOLE' as never, captureSizes: [1], maxNumSeqs: 1 })).toThrow(/graphs\.mode is one of/)
    expect(() => makeGraphConfig({ mode: 'FULL', captureSizes: [1], maxNumSeqs: 1, lora: { maxLoras: 0 } })).toThrow(/maxLoras/)
  })
})
