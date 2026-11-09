/*
 * W0-T02's acceptance check 3, for physics: kernelspace's golden step vectors reproduce through the vendored S5 card
 * (vendor/kernelspace/src/lib/world/physics/card.ts, unchanged), field for field and bit for bit.
 *
 * The fixture holds the card's output for 50 inputs, written once by kernelspace from `stepCard` itself. That alone only
 * proves the card has not moved, so two further checks stand apart from it: the card's two worked examples, whose
 * arithmetic is redone here by hand from their inputs, and a second implementation of the formula in a different grouping,
 * which agrees with every vector to 1e-12.
 */
import { describe, expect, test } from 'bun:test'
import { NAPKIN, napkinSpec, stepCard } from '../../vendor/kernelspace/src/lib/world/physics/card'
import type { CardSpec, ChipShape, ModelShape, StepCard, StepLoad } from '../../vendor/kernelspace/src/lib/world/physics/types'
import fixture from '../../vendor/kernelspace/tests/fixtures/physics/step-vectors.json'

interface Vector {
  name: string
  spec: string
  tp: number
  load: StepLoad
  card: StepCard
}

const specs = fixture.specs as Record<string, CardSpec>
const vectors = fixture.vectors as Vector[]
const named = (prefix: string) => {
  const found = vectors.find((v) => v.name.startsWith(prefix))
  if (!found) throw new Error(`no vector named "${prefix}..."`)
  return found
}

describe('the fixture', () => {
  test('holds 50 vectors with distinct names, each over a declared spec', () => {
    expect(vectors).toHaveLength(50)
    expect(new Set(vectors.map((v) => v.name)).size).toBe(50)
    for (const v of vectors) expect(Object.keys(specs)).toContain(v.spec)
  })

  test('covers tensor parallelism 1 to 8, decode, prefill and mixed steps, and a bound on each side', () => {
    expect([...new Set(vectors.map((v) => v.tp))].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    const kind = ({ seqs, tokens }: StepLoad) => (tokens === seqs ? 'decode' : seqs > 1 ? 'mixed' : 'prefill')
    expect([...new Set(vectors.map((v) => kind(v.load)))].sort()).toEqual(['decode', 'mixed', 'prefill'])
    expect([...new Set(vectors.map((v) => v.card.bound))].sort()).toEqual(['flop', 'mem'])
  })
})

describe('stepCard reproduces the golden vectors', () => {
  test('every field of every vector is identical (toStrictEqual, so no field is added or dropped)', () => {
    for (const v of vectors) expect({ name: v.name, card: stepCard(specs[v.spec], v.tp, v.load) }).toStrictEqual({ name: v.name, card: v.card })
  })

  test('`us` is one Math.round of stepS in microseconds, stepS sums its terms, and the bound follows the larger of memory and compute', () => {
    for (const { card } of vectors) {
      expect(Number.isInteger(card.us)).toBe(true)
      expect(card.us).toBe(Math.round(card.stepS * 1e6))
      expect(card.stepS).toBe(card.fixedS + card.linkS + Math.max(card.memS, card.flopS))
      expect(card.bound).toBe(card.memS >= card.flopS ? 'mem' : 'flop')
    }
  })

  test('is a pure function of its arguments: the same call twice gives the same bits', () => {
    for (const v of vectors) expect(stepCard(specs[v.spec], v.tp, v.load)).toStrictEqual(stepCard(specs[v.spec], v.tp, v.load))
  })
})

describe('the vectors are an independent check, not only a snapshot', () => {
  test('a re-grouped second implementation agrees with every vector to 1e-12', () => {
    for (const v of vectors) {
      const { chip, model, params } = specs[v.spec]
      const bytes = (model.weightBytes + model.kvBytesPerToken * v.load.kvTokens) / v.tp
      const flops = (2 * model.params * v.load.tokens + 4 * model.layers * model.hidden * v.load.attnPairs) / v.tp
      const link = v.tp > 1 && params.linkGBs !== null ? (4 * model.layers * v.load.tokens * model.hidden * 2 * (v.tp - 1)) / v.tp / (params.linkGBs * 1e9) : 0
      const fixed = (model.layers * params.layerUs + v.load.seqs * params.seqUs) * 1e-6
      const step = fixed + link + Math.max(bytes / chip.bwBps / params.etaMem, flops / chip.peakFlops / params.etaFlop)
      expect(Math.abs(v.card.stepS - step) / step).toBeLessThan(1e-12)
    }
  })

  test('example A (H100 FP8, TP 4, four users at about 1k in and 1k out) works out by hand to 12,049 us', () => {
    const v = named('example A')
    const { chip, model } = specs[v.spec]
    // Four users, prompt and output lengths uniform on [floor(0.8 * 1024), 1024]: context 921.5 + 921.5 / 2 = 1382.25 each.
    expect(v.load).toEqual({ seqs: 4, tokens: 4, kvTokens: 5529, attnPairs: 5529 })
    expect(v.tp).toBe(4)
    expect(v.card.memBytes).toBe((70.55e9 + 163_840 * 5529) / 4)
    expect(v.card.memBytes).toBe(17_863_967_840)
    expect(v.card.flops).toBe((2 * 70.55e9 * 4 + 4 * 80 * 8192 * 5529) / 4)
    expect(v.card.linkBytes).toBe((2 * 80 * 4 * 8192 * 2 * 2 * 3) / 4)
    expect(v.card.fixedS * 1e6).toBeCloseTo(80 * 68.8 + 4 * 69, 9)
    expect(v.card.memS).toBe(17_863_967_840 / (0.86 * chip.bwBps))
    expect(v.card.bound).toBe('mem')
    expect(model.layers).toBe(80)
    expect(v.card.us).toBe(12_049)
  })

  test('example B (B200 FP8, TP 1, an 8k prompt with three decodes) works out by hand to 566,681 us, compute-bound', () => {
    const v = named('example B')
    const { chip, model } = specs[v.spec]
    // One 7,373-token prompt plus three decodes at 7,834: K = 7373 + 3 * 7834, and A is the prompt's triangle plus the decodes' context.
    expect(v.load).toEqual({ seqs: 4, tokens: 7376, kvTokens: 7373 + 3 * 7834, attnPairs: (7373 * 7374) / 2 + 3 * 7834 })
    expect(v.tp).toBe(1)
    expect(v.card.flops).toBe(2 * 70.55e9 * 7376 + 4 * 80 * 8192 * v.load.attnPairs)
    expect(v.card.memBytes).toBe(70.55e9 + 163_840 * v.load.kvTokens)
    expect(v.card.linkBytes).toBe(0)
    expect(v.card.flopS).toBe(v.card.flops / (0.44 * chip.peakFlops))
    expect(model.hidden).toBe(8192)
    expect(v.card.bound).toBe('flop')
    expect(v.card.us).toBe(566_681)
  })
})

describe('the napkin card', () => {
  const chip: ChipShape = { bwBps: 3.35e12, peakFlops: 1.979e15, hbmBytes: 80e9 }
  const model: ModelShape = { params: 70.55e9, layers: 80, hidden: 8192, kvBytesPerToken: 163_840, weightBytes: 70.55e9 }

  test('NAPKIN is the datasheet bound: efficiency 1, no fixed terms and no link term', () => {
    expect(NAPKIN).toStrictEqual({ etaMem: 1, etaFlop: 1, layerUs: 0, seqUs: 0, linkGBs: null })
    expect(napkinSpec(chip, model)).toStrictEqual({ chip, model, params: NAPKIN })
  })

  test('with one token and no KV it is the weights divided by the bandwidth', () => {
    const card = stepCard(napkinSpec(chip, model), 1, { seqs: 1, tokens: 1, kvTokens: 0, attnPairs: 0 })
    expect(card.memS).toBe(70.55e9 / 3.35e12)
    expect(card.stepS).toBe(card.memS)
    expect(card.bound).toBe('mem')
  })

  test('a tie between memory and compute is called memory-bound, and one more token flips it', () => {
    const toy: CardSpec = { chip: { bwBps: 2, peakFlops: 2, hbmBytes: 16 }, model: { params: 1, layers: 1, hidden: 1, kvBytesPerToken: 0, weightBytes: 2 }, params: NAPKIN }
    const one: StepLoad = { seqs: 1, tokens: 1, kvTokens: 0, attnPairs: 0 }
    const tie = stepCard(toy, 1, one)
    expect([tie.memS, tie.flopS, tie.bound]).toEqual([1, 1, 'mem'])
    expect(stepCard(toy, 1, { ...one, tokens: 2 }).bound).toBe('flop')
  })
})
