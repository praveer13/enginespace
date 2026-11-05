/*
 * W1-T14: `tr2.padding-waste`. The tests re-derive each key from the numbers that the ticket prints, hold the family's rule to the step
 * loop (the size it pads a step to, and the padded tokens it counts over a night), find the best list of a choice by looking at every
 * list, and hold the family to the framework's own rules: deterministic, in band, graded, explained, and not passed by a habit.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  bandAcceptance,
  bandedSeeds,
  BAND_FLOOR,
  drawInBand,
  FAMILIES,
  familiesForKc,
  familyById,
  fixedSeeds,
  LEVELS,
  measureBlind,
  offeredAt,
  plain,
} from '@es/play/items'
import type { Item, Level } from '@es/play/items'
import { paddingModel, paddingWaste } from '@es/play/items/families/tr2/padding-waste'
import { runStepLoop } from '@es/sim/steploop'
import type { StepLoopConfig } from '@es/sim/steploop'
import { genWorkload } from '@es/sim/workload'
import { HOST_PRESETS } from '@es/sim/host'
import { SMALL_CARD } from '@es/sim/steploop'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'

// Measuring a family on a thousand banded seeds at each level takes a second or two, and several on a loaded host.
setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(300, 0x9ad)

const numbers = (text: string, separator: string): number[] => text.split(separator).map(Number)
const param = (item: Item, name: string): string => String(item.params[name])

/** The seeds whose own variant is `variant` at `level` and that the band accepts: the ones a draw would serve. */
const served = (variant: string, level: Level): number[] => SEEDS.filter((seed) => paddingWaste.make(seed, level).variant === variant && paddingWaste.band(seed, level))

/** Every list of `molds` sizes from `pool`, ascending: the brute force that the choice's key is held to. */
function everyList(pool: readonly number[], molds: number): number[][] {
  const out: number[][] = []
  const walk = (from: number, chosen: number[]): void => {
    if (chosen.length === molds) out.push(chosen)
    else for (let i = from; i < pool.length; i += 1) walk(i + 1, [...chosen, pool[i]])
  }
  walk(0, [])
  return out
}

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr2.padding-waste')).toBe(paddingWaste)
    expect(FAMILIES).toContain(paddingWaste)
    expect(familiesForKc('tr2.capture-padding')).toEqual([paddingWaste])
    const graph = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))
    for (const kc of paddingWaste.kcs) expect(ids.has(kc)).toBe(true)
    expect(offeredAt(paddingWaste, 0).map((variant) => variant.id)).toEqual(['padded-size', 'night-waste'])
    expect(offeredAt(paddingWaste, 2).map((variant) => variant.id)).toEqual(['padded-size', 'night-waste', 'choose-sizes'])
    expect(offeredAt(paddingWaste, 3).map((variant) => variant.id)).toEqual(['padded-size', 'night-waste', 'choose-sizes'])
  })
})

describe('the model, held to the step loop', () => {
  const config = (mode: 'FULL' | 'FULL_AND_PIECEWISE', sizes: readonly number[], runner: boolean): StepLoopConfig => ({
    maxNumSeqs: 64,
    maxBatchedTokens: 4096,
    chunkedPrefill: true,
    asyncScheduling: false,
    inputIds: 'device',
    graphs: { mode, captureSizes: sizes },
    ...(runner ? { runner: 'mrv2' as const } : {}),
  })

  test('a step is padded to the smallest captured size that holds it, and counts the difference as padded tokens, in v0 and in v1', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = paddingWaste.make(seed, 2, 'night-waste')
      const sizes = numbers(param(item, 'sizes'), ',')
      const workload = genWorkload(seed, { requests: 16, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 1, hi: 40 }, output: { kind: 'uniform', lo: 3, hi: 30 } } })
      for (const [mode, runner] of [['FULL', false], ['FULL', true], ['FULL_AND_PIECEWISE', true]] as const) {
        const run = runStepLoop(workload, config(mode, sizes, runner), HOST_PRESETS.mrv2.card, SMALL_CARD, { horizonUs: 1_000_000_000 })
        for (const step of run.steps) {
          const padded = paddingModel.padded(sizes, step.tokens)
          // A step that no size holds is launched one by one, and pads nothing. A step that a graph holds is padded up to its size.
          // (FULL_AND_PIECEWISE has a full graph for a decode batch only up to the running cap, and the piecewise one for the rest.)
          expect(step.paddedTokens).toBe(step.graph === 'hit' ? (padded ?? step.tokens) : step.tokens)
          if (step.graph === 'hit') expect(padded).not.toBeNull()
          if (padded === null) expect(step.graph).not.toBe('hit')
        }
        // The summary counts the same padding: the night's waste is the sum of the steps' padded tokens less their tokens.
        const steps = run.steps.map((step) => step.tokens)
        const night = paddingModel.night(sizes, steps)
        expect(run.summary.paddedTokens).toBe(night.waste)
        expect(run.steps.filter((step) => step.graph !== 'hit').length).toBe(night.uncaptured)
      }
    }
  })

  test('the waste of a step is its padded size less its tokens, and nothing is wasted above the largest size', () => {
    expect(paddingModel.waste([4, 9, 16], 5)).toBe(4)
    expect(paddingModel.waste([4, 9, 16], 9)).toBe(0)
    expect(paddingModel.waste([4, 9, 16], 17)).toBeNull()
    expect(paddingModel.night([4, 9, 16], [5, 9, 17, 3])).toEqual({ waste: 5, uncaptured: 1 })
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(paddingWaste, level)) {
        const item = paddingWaste.make(seed, level, variant.id)
        expect(paddingWaste.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(paddingWaste, item, { seed, level, variant: variant.id })).toEqual([])
        expect(paddingWaste.grade(item, keyOf(item)).ok).toBe(true)
        expect(paddingWaste.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('without a variant named, the seed chooses one the level offers, and the same one each time', () => {
    for (const level of LEVELS) {
      const offered = new Set(offeredAt(paddingWaste, level).map((variant) => variant.id))
      expect(new Set(SEEDS.map((seed) => paddingWaste.make(seed, level).variant))).toEqual(offered)
    }
  })

  test('is in the world of a synthetic engine: every scene number the ticket prints is tagged, and no digit is in a sentence', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of LEVELS) {
        const item = paddingWaste.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...paddingWaste.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
      }
    }
  })
})

describe('padded-size', () => {
  test.each(LEVELS)('at level %p the key is the smallest listed size that holds the step, which no size holds exactly', (level) => {
    for (const seed of served('padded-size', level)) {
      const item = paddingWaste.make(seed, level, 'padded-size')
      const sizes = numbers(param(item, 'sizes'), ',')
      const tokens = Number(param(item, 'tokens'))
      const expected = sizes.find((size) => size >= tokens)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'tokens', truth: expected })
      expect(sizes).not.toContain(tokens)
      // The band keeps the rules of thumb out: neither the next power of two nor the next multiple of eight is the key.
      expect(expected).not.toBe(2 ** Math.ceil(Math.log2(tokens)))
      expect(expected).not.toBe(Math.ceil(tokens / 8) * 8)
    }
  })

  test('at level 3 the step is given as its decode rows and its prompt chunk, which add up to its tokens', () => {
    for (const seed of served('padded-size', 3)) {
      const item = paddingWaste.make(seed, 3, 'padded-size')
      const shown = Object.fromEntries(item.givens.flatMap((given) => (given.value.t === 'num' ? [[given.label, given.value.value]] : [])))
      expect(shown['decode rows'] + shown['prompt chunk']).toBe(Number(param(item, 'tokens')))
      expect(shown['decode rows']).toBeGreaterThanOrEqual(1)
      expect(shown['prompt chunk']).toBeGreaterThanOrEqual(2)
    }
  })

  test('a wrong number that a rule recognises is named, in words that say what was done', () => {
    const seen = new Set<string>()
    for (const seed of served('padded-size', 2)) {
      const item = paddingWaste.make(seed, 2, 'padded-size')
      const sizes = numbers(param(item, 'sizes'), ',')
      const tokens = Number(param(item, 'tokens'))
      const padded = sizes.find((size) => size >= tokens) ?? tokens
      const lower = [...sizes].reverse().find((size) => size < tokens)
      const diagnose = (value: number): string | undefined => {
        const graded = paddingWaste.grade(item, { kind: 'numeric', value })
        return graded.ok ? 'right' : graded.diagnosis?.id
      }
      expect(diagnose(padded)).toBe('right')
      expect(diagnose(tokens)).toBe('tr2.padding-waste.no-padding')
      expect(diagnose(padded - tokens)).toBe('tr2.padding-waste.waste-for-size')
      if (lower !== undefined && lower !== padded - tokens) expect(diagnose(lower)).toBe('tr2.padding-waste.rounds-down')
      seen.add(String(diagnose(tokens)))
    }
    expect(seen.size).toBe(1)
  })
})

describe('night-waste', () => {
  test.each(LEVELS)('at level %p the key is the padded tokens of the night: each step\'s size less its tokens, added up', (level) => {
    for (const seed of served('night-waste', level)) {
      const item = paddingWaste.make(seed, level, 'night-waste')
      const sizes = numbers(param(item, 'sizes'), ',')
      const steps = numbers(param(item, 'steps'), ',')
      expect(steps).toHaveLength(6)
      let waste = 0
      for (const tokens of steps) {
        const size = sizes.find((candidate) => candidate >= tokens)
        expect(size).toBeDefined()
        waste += (size ?? tokens) - tokens
      }
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'tokens', truth: waste })
      expect(waste).toBeGreaterThanOrEqual(8)
    }
  })

  test('at level 3 the night is a tally of fires and sizes, and the solution says how many fires it holds', () => {
    for (const seed of served('night-waste', 3).slice(0, 40)) {
      const item = paddingWaste.make(seed, 3, 'night-waste')
      const tally = item.givens.find((given) => given.label === 'the night, fires × tokens')?.value
      expect(tally?.t).toBe('code')
      const pairs = (tally?.t === 'code' ? tally.code : '').split(', ').map((pair) => pair.split(' × ').map(Number))
      expect(pairs.reduce((sum, [fires]) => sum + fires, 0)).toBe(6)
      expect(pairs.flatMap(([fires, tokens]) => Array.from({ length: fires }, () => tokens)).sort((a, b) => a - b)).toEqual(numbers(param(item, 'steps'), ',').sort((a, b) => a - b))
    }
  })

  test('a wrong number that a rule recognises is named', () => {
    for (const seed of served('night-waste', 2).slice(0, 40)) {
      const item = paddingWaste.make(seed, 2, 'night-waste')
      const sizes = numbers(param(item, 'sizes'), ',')
      const steps = numbers(param(item, 'steps'), ',')
      const padded = steps.map((tokens) => sizes.find((size) => size >= tokens) ?? tokens)
      const total = padded.reduce((sum, size) => sum + size, 0)
      const diagnose = (value: number): string | undefined => {
        const graded = paddingWaste.grade(item, { kind: 'numeric', value })
        return graded.ok ? 'right' : graded.diagnosis?.id
      }
      expect(diagnose(total)).toBe('tr2.padding-waste.padded-total')
      expect(diagnose(0)).toBe('tr2.padding-waste.no-waste')
    }
  })
})

describe('choose-sizes', () => {
  test.each([2, 3] as const)('at level %p the key holds every step and wastes the fewest tokens of every list of that many sizes: found by looking at them all', (level) => {
    const CANDIDATES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24]
    const seeds = served('choose-sizes', level)
    expect(seeds.length).toBeGreaterThan(40)
    for (const seed of seeds.slice(0, 60)) {
      const item = paddingWaste.make(seed, level, 'choose-sizes')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const molds = Number(param(item, 'molds'))
      const steps = numbers(param(item, 'steps'), ',')
      const lists = param(item, 'lists').split(';').map((list) => numbers(list, '.'))
      expect(lists).toHaveLength(4)
      expect(new Set(lists.map((list) => list.join())).size).toBe(4)
      for (const list of lists) expect(list).toHaveLength(molds)
      // The best list of all, by brute force: every list that holds every step, least wasteful first.
      const holding = everyList(CANDIDATES, molds)
        .map((list) => ({ list, ...paddingModel.night(list, steps) }))
        .filter((entry) => entry.uncaptured === 0)
        .sort((a, b) => a.waste - b.waste)
      const key = Number(param(item, 'key'))
      expect(item.answer.options.map((option) => option.id)).toEqual(['a', 'b', 'c', 'd'])
      expect(item.answer.correct).toBe(['a', 'b', 'c', 'd'][key])
      expect(lists[key]).toEqual(holding[0].list)
      // Of the other three, one leaves a step uncaptured and two hold them all and waste more.
      const others = lists.filter((_, at) => at !== key).map((list) => paddingModel.night(list, steps))
      expect(others.filter((entry) => entry.uncaptured > 0)).toHaveLength(1)
      for (const entry of others.filter((candidate) => candidate.uncaptured === 0)) expect(entry.waste).toBeGreaterThanOrEqual(holding[0].waste + 2)
      // The tempting one wastes no more than the key on the steps it does hold.
      expect(others.find((entry) => entry.uncaptured > 0)?.waste).toBeLessThanOrEqual(holding[0].waste)
    }
  })

  test('the options print their lists at one width, so that their length says nothing of the answer; every option says why, and a lure names its misconception', () => {
    for (const seed of served('choose-sizes', 2).slice(0, 80)) {
      const item = paddingWaste.make(seed, 2, 'choose-sizes')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(new Set(item.answer.options.map((option) => plain(option.text).length)).size).toBe(1)
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(30)
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toMatch(/^tr2\.padding-waste\.(leaves-a-step-uncaptured|wastes-more)$/)
      }
      expect(item.answer.options.filter((option) => option.miss === 'tr2.padding-waste.leaves-a-step-uncaptured')).toHaveLength(1)
      expect(item.answer.options.filter((option) => option.miss === 'tr2.padding-waste.wastes-more')).toHaveLength(2)
    }
  })

  test('is drawn so that the key is anywhere: each place holds it on about a quarter of the draws', () => {
    const places = [0, 0, 0, 0]
    const seeds = served('choose-sizes', 2)
    for (const seed of seeds) {
      const item = paddingWaste.make(seed, 2, 'choose-sizes')
      places[Number(param(item, 'key'))] += 1
    }
    for (const count of places) {
      expect(count).toBeGreaterThan(seeds.length / 8)
      expect(count).toBeLessThan((seeds.length * 3) / 8)
    }
  })

  test('the solution names the list that holds every step and wastes the fewest, and the steps count each list\'s padding', () => {
    for (const seed of served('choose-sizes', 2).slice(0, 40)) {
      const item = paddingWaste.make(seed, 2, 'choose-sizes')
      const steps = paddingWaste.solution(item)
      expect(steps).toHaveLength(3)
      expect(plain(steps[2].text)).toContain(`is ${['a', 'b', 'c', 'd'][Number(param(item, 'key'))]}, at`)
    }
  })
})

describe('the worked examples', () => {
  test('level 0 shows a whole solution with other numbers, level 1 only the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const variant of ['padded-size', 'night-waste']) {
        const zero = paddingWaste.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(2)
        const example = zero.worked[zero.worked.length - 1].result?.value
        expect(example).not.toBe(zero.answer.kind === 'numeric' ? zero.answer.truth : -1)
        const one = paddingWaste.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(paddingWaste.make(seed, 2, variant).worked).toEqual([])
      }
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(paddingWaste, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(100, 4)) {
      const { seed } = drawInBand(paddingWaste, level, entropy)
      expect(paddingWaste.band(seed, level)).toBe(true)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(paddingWaste, level, bandedSeeds(paddingWaste, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) {
        if (row.kind === 'numeric') expect(row.rate).toBeLessThanOrEqual(0.15)
        else expect(row.rate).toBeLessThanOrEqual(row.bound)
      }
    }
  })
})

describe('a response of the wrong kind or an answer nobody could mean', () => {
  test('is wrong, and never throws', () => {
    const numeric = paddingWaste.make(SEEDS[2], 2, 'padded-size')
    const choice = paddingWaste.make(SEEDS[2], 2, 'choose-sizes')
    const responses = [
      { kind: 'choice' as const, pick: 'z' },
      { kind: 'numeric' as const, value: Number.NaN },
      { kind: 'numeric' as const, value: Number.POSITIVE_INFINITY },
      { kind: 'numeric' as const, value: -5 },
      { kind: 'choice' as const, pick: '' },
    ]
    for (const response of responses) {
      expect(paddingWaste.grade(numeric, response).ok).toBe(false)
      expect(paddingWaste.grade(choice, response).ok).toBe(false)
    }
  })
})
