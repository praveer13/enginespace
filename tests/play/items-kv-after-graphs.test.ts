/*
 * W1b-T04: `tr2.kv-after-graphs`. The tests re-derive each key from the numbers that the ticket prints, hold the family's rule to the step
 * loop's memory model (`kvBudget` and `kvTokens`) and to the lesson's own table, hold its facts to the claims they rest on, and hold the
 * family to the framework's own rules (the checks of `commonSuite`).
 */
import { describe, expect, test } from 'bun:test'
import { fixedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { DEFAULT_PERMILLE, kvAfterGraphs, kvModel } from '@es/play/items/families/tr2/kv-after-graphs'
import { kvBudget, kvTokens } from '@es/sim/steploop'
import { kvAfterGraphs as lessonTable } from '../content/tr2-demos.ts'
import { SMALL_CARD } from '../../packages/sim/steploop'
import { claim, commonSuite } from './items-tr2-support.ts'

commonSuite(kvAfterGraphs, 0x6b7a)

const SEEDS = fixedSeeds(300, 0x6b7)

/** What a ticket prints, in bytes. The units are the ticket's own: GB and GB, or GiB and MiB and KiB at level 3. */
function ticket(item: Item): { card: number; permille: number; nonKv: number; graphs: number; perToken: number; binary: boolean } {
  const by = new Map(item.givens.map((given) => [given.label, given.value]))
  const number = (label: string) => {
    const part = by.get(label)
    if (part === undefined || part.t !== 'num') throw new Error(`the ticket has no number "${label}"`)
    return part
  }
  const card = number('card memory')
  const binary = card.unit === 'GiB'
  const utilization = by.get('gpu_memory_utilization')
  const permille = utilization?.t === 'num' ? Math.round(utilization.value * 1000) : DEFAULT_PERMILLE
  const nonKv = number('weights and activations')
  const graphs = number("the graphs' estimate")
  const token = number('KV cache for one token')
  return {
    binary,
    card: Math.round(card.value * (binary ? 2 ** 30 : 1e9)),
    permille,
    nonKv: Math.round(nonKv.value * (binary ? 2 ** 20 : 1e9)),
    graphs: Math.round(graphs.value * (binary ? 2 ** 20 : 1e9)),
    perToken: Math.round(token.value * (binary ? 1024 : 1)),
  }
}

const numericKey = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

describe('the rule rests on the claims', () => {
  test('the default share of the card is the claim\'s, and the graphs come off before the cache is sized', () => {
    expect(DEFAULT_PERMILLE).toBe(Number(claim('vllm.cache.gpu-memory-utilization-default').value) * 1000)
    expect(claim('vllm.cudagraph.memory-subtracted').text).toContain('requested memory minus the profiled non-KV memory minus the CUDA-graph estimate')
    expect(claim('vllm.cudagraph.memory-estimate-default').text).toContain('The graph estimate is applied by default')
    expect(claim('vllm.cudagraph.memory-before-kv').text).toContain('before the real KV cache is allocated')
    expect(claim('vllm.cudagraph.memory-profiling-since').value).toBe('v0.29.0')
  })
})

describe('the model, held to the step loop\'s memory model and to the lesson\'s table', () => {
  test('the keys are the sim\'s: kvBudget and kvTokens on the numbers the ticket prints', () => {
    let checked = 0
    for (const seed of SEEDS.slice(0, 120)) {
      for (const level of [0, 2, 3] as const) {
        for (const variant of offeredAt(kvAfterGraphs, level)) {
          const item = kvAfterGraphs.make(seed, level, variant.id)
          const t = ticket(item)
          const plan = { hbmBytes: t.card, utilizationPermille: t.permille, weightBytes: t.nonKv, workspaceBytes: 0, graphBytes: t.graphs }
          const withGraphs = kvBudget(plan)
          const without = kvBudget({ ...plan, applyGraphEstimate: false })
          expect(withGraphs.fits).toBe(true)
          const tokens = kvTokens(withGraphs, t.perToken)
          const promised = kvTokens(without, t.perToken)
          const expected = variant.id === 'kv-tokens' ? tokens : variant.id === 'graphs-cost' ? promised - tokens : Math.round((1000 * t.graphs) / (withGraphs.requestedBytes - t.nonKv)) / 10
          expect([variant.id, level, numericKey(item)]).toEqual([variant.id, level, expected])
          checked += 1
        }
      }
    }
    expect(checked).toBe(120 * 3 * 3 - 120)
  })

  test('on the lesson\'s card the model gives the lesson\'s table: the cache with the graphs ignored, the cache with them, and what they cost', () => {
    const table = lessonTable()
    const perToken = SMALL_CARD.spec.model.kvBytesPerToken
    expect(kvModel.requested(SMALL_CARD.spec.chip.hbmBytes, DEFAULT_PERMILLE)).toBe(table.requestedBytes)
    expect(kvModel.tokens(kvModel.cache(table.requestedBytes, table.nonKvBytes, table.graphBytes), perToken)).toBe(table.kvTokensWith)
    expect(kvModel.tokens(table.requestedBytes - table.nonKvBytes, perToken)).toBe(table.kvTokensWithout)
    expect(kvModel.cost(table.requestedBytes, table.nonKvBytes, table.graphBytes, perToken)).toBe(table.kvTokensWithout - table.kvTokensWith)
    // The lesson says 8,395 tokens, or 5.1% of the cache the plan promises.
    expect(table.kvTokensWithout - table.kvTokensWith).toBe(8395)
    expect(kvModel.tenths(table.graphBytes, table.requestedBytes - table.nonKvBytes)).toBe(51)
  })

  test('the lesson\'s second prediction: 0.96 GB of graphs at 114,688 bytes a token cost 8,370 whole tokens (the prediction\'s reference is 8,370.5, within its 3%)', () => {
    expect(kvModel.tokens(960_000_000, 114_688)).toBe(8370)
    expect(960_000_000 / 114_688).toBeCloseTo(8370.5, 0)
  })
})

describe('the scenes', () => {
  test('levels 0 to 2 quote the card in GB and print the share, and level 3 quotes it in GiB, MiB and KiB and leaves the share at its default', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = kvAfterGraphs.make(seed, level)
        const t = ticket(item)
        expect(t.binary).toBe(level === 3)
        const units = Object.fromEntries(item.givens.map((given) => [given.label, given.value.t === 'num' ? given.value.unit : given.value.t === 'text' ? given.value.text : '']))
        if (level === 3) {
          expect(units).toEqual({ 'card memory': 'GiB', gpu_memory_utilization: 'left at its default', 'weights and activations': 'MiB', "the graphs' estimate": 'MiB', 'KV cache for one token': 'KiB' })
          expect(t.permille).toBe(DEFAULT_PERMILLE)
        } else {
          expect(units).toEqual({ 'card memory': 'GB', gpu_memory_utilization: undefined, 'weights and activations': 'GB', "the graphs' estimate": 'GB', 'KV cache for one token': 'bytes' })
          expect([900, 920, 950]).toContain(t.permille)
        }
      }
    }
  })

  test('the graphs are 4 to 12% of the cache that a plan without them promises, and a quarter of the requested memory is left for the cache', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = kvAfterGraphs.make(seed, level)
        if (!kvAfterGraphs.band(seed, level)) continue
        const t = ticket(item)
        const requested = kvModel.requested(t.card, t.permille)
        const promised = requested - t.nonKv
        expect(t.graphs * 25).toBeGreaterThanOrEqual(promised)
        expect(t.graphs * 8).toBeLessThanOrEqual(promised * 1.05 + 1)
        expect((requested - t.nonKv - t.graphs) * 4).toBeGreaterThanOrEqual(requested)
      }
    }
  })

  test('the three variants ask three different numbers on one scene, and none of them is another\'s answer', () => {
    // The same purpose and level draws the same scene for each variant only when the stream is the same, so compare on the keys alone.
    for (const seed of SEEDS.slice(0, 80)) {
      const keys = (['kv-tokens', 'graphs-cost', 'share'] as const).map((variant) => numericKey(kvAfterGraphs.make(seed, 2, variant)))
      expect(new Set(keys).size).toBe(3)
    }
  })
})

describe('the diagnoses', () => {
  const diagnose = (item: Item, value: number): string | undefined => {
    const graded = kvAfterGraphs.grade(item, { kind: 'numeric', value })
    return graded.ok ? 'right' : graded.diagnosis?.id
  }
  const itemOf = (variant: 'kv-tokens' | 'graphs-cost' | 'share', level: 0 | 1 | 2 | 3 = 2) => kvAfterGraphs.make(SEEDS[3], level, variant)

  test('a plan that leaves the graphs out, a plan that counts the whole card, and the cost taken for the cache are named', () => {
    const item = itemOf('kv-tokens')
    const t = ticket(item)
    const requested = kvModel.requested(t.card, t.permille)
    const promised = kvModel.tokens(requested - t.nonKv, t.perToken)
    const cache = kvModel.tokens(requested - t.nonKv - t.graphs, t.perToken)
    expect(diagnose(item, cache)).toBe('right')
    expect(diagnose(item, promised)).toBe('tr2.kv-after-graphs.graphs-left-out')
    expect(diagnose(item, kvModel.tokens(t.card - t.nonKv - t.graphs, t.perToken))).toBe('tr2.kv-after-graphs.whole-card')
    expect(diagnose(item, promised - cache)).toBe('tr2.kv-after-graphs.cost-as-cache')
    expect(diagnose(item, 123_456_789)).toBeUndefined()
  })

  test('the cache that is left and the cache that is promised, taken for the cost, are named', () => {
    const item = itemOf('graphs-cost')
    const t = ticket(item)
    const requested = kvModel.requested(t.card, t.permille)
    const promised = kvModel.tokens(requested - t.nonKv, t.perToken)
    const cache = kvModel.tokens(requested - t.nonKv - t.graphs, t.perToken)
    expect(diagnose(item, promised - cache)).toBe('right')
    expect(diagnose(item, cache)).toBe('tr2.kv-after-graphs.cache-as-cost')
    expect(diagnose(item, promised)).toBe('tr2.kv-after-graphs.plan-as-cost')
  })

  test('the share taken of all the memory, and of what is left, are named', () => {
    const item = itemOf('share')
    const t = ticket(item)
    const requested = kvModel.requested(t.card, t.permille)
    const right = numericKey(item)
    expect(diagnose(item, right)).toBe('right')
    expect(diagnose(item, Math.round((1000 * t.graphs) / requested) / 10)).toBe('tr2.kv-after-graphs.of-requested')
    expect(diagnose(item, Math.round((1000 * t.graphs) / (requested - t.nonKv - t.graphs)) / 10)).toBe('tr2.kv-after-graphs.of-what-is-left')
  })

  test('an answer within 2% of the key is right, and one that leaves the graphs out is never within it', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const item = kvAfterGraphs.make(seed, 2, 'kv-tokens')
      const key = numericKey(item)
      expect(kvAfterGraphs.grade(item, { kind: 'numeric', value: key * 1.019 }).ok).toBe(true)
      expect(kvAfterGraphs.grade(item, { kind: 'numeric', value: key * 0.981 }).ok).toBe(true)
      expect(kvAfterGraphs.grade(item, { kind: 'numeric', value: key * 1.03 }).ok).toBe(false)
      const t = ticket(item)
      const promised = kvModel.tokens(kvModel.requested(t.card, t.permille) - t.nonKv, t.perToken)
      expect(kvAfterGraphs.grade(item, { kind: 'numeric', value: promised }).ok).toBe(false)
    }
  })
})

describe('the solution', () => {
  test('walks from the share of the card to the key, and says the graphs come off before the cache is sized', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const variant of ['kv-tokens', 'graphs-cost', 'share'] as const) {
        const item = kvAfterGraphs.make(seed, 2, variant)
        const steps = kvAfterGraphs.solution(item)
        expect(steps.length).toBeGreaterThanOrEqual(3)
        expect(plain(steps[0].text)).toContain('vLLM may use only a share of the card')
        expect(plain(steps[1].text)).toContain('the estimate of what the graphs will take, because it is made before the cache is sized')
        expect(steps[steps.length - 1].result?.value).toBe(numericKey(item))
        expect(steps[steps.length - 1].result?.tag).toBe('derived')
      }
    }
  })

  test('at level 3 the default share is read from the pin, and tagged measured', () => {
    const item = kvAfterGraphs.make(SEEDS[0], 3, 'kv-tokens')
    const first = kvAfterGraphs.solution(item)[0]
    expect(first.text.some((part) => part.t === 'num' && part.tag === 'measured' && part.value === 0.92)).toBe(true)
  })
})
