/*
 * What W1-T13 added to the step loop for TR2's levels: the small-model napkin card (WORLD §2.11; GAMES.md §3.2), and a run that names the
 * requests of each step's rows when it is asked to (`rows`), so a view can hang each ticket on its clip. Neither changes a run that asks
 * for nothing new: tests/sim/steploop-v1.test.ts and the v0 goldens hold the loop as it was.
 */
import { describe, expect, test } from 'bun:test'
import { HOST_PRESETS } from '../../packages/sim/host'
import { NAPKIN, stepCard, stepLoad } from '../../packages/sim/physics'
import { gpuCost, gpuLayers, runStepLoop, s5Card, SMALL_CARD, vllmCaptureSizes } from '../../packages/sim/steploop'
import type { StepLoopConfig } from '../../packages/sim/steploop'
import { genWorkload } from '../../packages/sim/workload'
import { seeds } from '../seeds'

const SEEDS = seeds(0)

const decodes = (rows: number, context: number) => stepLoad(Array.from({ length: rows }, () => ({ kind: 'decode' as const, context })))

describe('the small-model napkin card', () => {
  test('is S5 at the datasheet bound on a small model of its own: synthetic and estimated, with shapes that derive from each other', () => {
    expect([SMALL_CARD.kind, SMALL_CARD.tag, SMALL_CARD.synthetic, SMALL_CARD.tp]).toEqual(['napkin', 'estimated', true, 1])
    expect(SMALL_CARD.spec.params).toEqual(NAPKIN)
    const model = SMALL_CARD.spec.model
    // 16-bit weights, and a 16-bit K and V for every layer of width 1,024.
    expect(model.weightBytes).toBe(model.params * 2)
    expect(model.kvBytesPerToken).toBe(2 * model.layers * model.hidden * 2)
    expect(gpuLayers(SMALL_CARD)).toBe(28)
  })

  test('prices the line by S5\'s card and leaves every host phase to the host card: a decode of 16 rows over 256 tokens costs 1,670 µs', () => {
    const load = decodes(16, 256)
    const cost = gpuCost(SMALL_CARD, { prefillSeqs: 0, ...load })
    expect(cost).toEqual({ gpuUs: stepCard(SMALL_CARD.spec, 1, load).us, hostSeqUs: null })
    expect(cost.gpuUs).toBe(1670)
    // The 70B card keeps its host term: a number, which replaces the host card's per-sequence phases (D-044).
    expect(gpuCost(s5Card('h100-vllm-0-10-2-fp8', 4), { prefillSeqs: 0, ...load }).hostSeqUs).toBeGreaterThan(0)
  })

  test('a step of the small model is short enough that the host\'s work is a large share of it, which is the regime TR2\'s levels need', () => {
    const host = HOST_PRESETS.mrv2.card
    const eager = host.launchPerKernelUs * host.kernelsPerLayer * gpuLayers(SMALL_CARD)
    // Calling every kernel of a fire costs the expo more than the fire costs the line.
    expect(eager).toBe(2016)
    expect(eager).toBeGreaterThan(gpuCost(SMALL_CARD, { prefillSeqs: 0, ...decodes(12, 256) }).gpuUs)
  })
})

describe('a run asked for its rows', () => {
  const config = (slots: number): StepLoopConfig => ({
    maxNumSeqs: slots,
    maxBatchedTokens: 2048,
    chunkedPrefill: true,
    asyncScheduling: true,
    inputIds: 'device',
    graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: vllmCaptureSizes({ maxNumSeqs: slots, maxBatchedTokens: 2048 }) },
    runner: 'mrv2',
  })
  const spec = { requests: 24, arrivals: { kind: 'burst' as const }, lengths: { kind: 'dists' as const, prompt: { kind: 'uniform' as const, lo: 8, hi: 32 }, output: { kind: 'uniform' as const, lo: 12, hi: 28 } } }

  test(`names each step's requests, one per row, and changes nothing else about the run, over ${SEEDS.length} seeds`, () => {
    for (const seed of SEEDS) {
      const workload = genWorkload(seed, spec)
      const plain = runStepLoop(workload, config(12), HOST_PRESETS.mrv2.card, SMALL_CARD, { horizonUs: 1_000_000_000 })
      const named = runStepLoop(workload, config(12), HOST_PRESETS.mrv2.card, SMALL_CARD, { horizonUs: 1_000_000_000, rows: true })
      expect(plain.steps.every((step) => step.reqs === undefined)).toBe(true)
      expect({ ...named, steps: named.steps.map((step) => Object.fromEntries(Object.entries(step).filter(([field]) => field !== 'reqs'))) }).toEqual(plain)
      for (const step of named.steps) {
        expect(step.reqs?.length).toBe(step.seqs)
        expect(new Set(step.reqs).size).toBe(step.seqs)
      }
      // Every request rides from its first step to its last without a gap, and a request with a ghost token rides one step past its last token.
      for (const req of named.reqs) {
        const rode = named.steps.flatMap((step, i) => (step.reqs?.includes(req.id) ? [i] : []))
        expect(rode.length).toBe(rode[rode.length - 1] - rode[0] + 1)
        expect(rode.length).toBe(req.tokens + req.ghostTokens)
      }
    }
  })
})
