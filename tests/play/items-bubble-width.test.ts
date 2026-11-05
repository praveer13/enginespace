/*
 * W1-T04: `tr2.bubble-width`, the reference family. The tests re-derive each key from the numbers that the ticket prints, so that
 * the key is held to the model and not to the code that wrote it, check the model against the front page's claims, and hold the
 * family to the framework's own rules: deterministic, in band, graded, explained, and not passed by a habit.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import {
  bandAcceptance,
  bandedSeeds,
  BAND_FLOOR,
  drawInBand,
  FAMILIES,
  familiesForKc,
  familyById,
  fixedSeeds,
  isLevel,
  LEVELS,
  measureBlind,
  offeredAt,
  plain,
  startAttempt,
} from '@es/play/items'
import type { Item, Level, Response } from '@es/play/items'
import { bubbleWidth, bubbleModel } from '@es/play/items/families/tr2/bubble-width'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'

// Measuring a family on a thousand banded seeds at each level takes a second or two, and several on a loaded host.
setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(300, 0xb0b)

/** The numbers printed on a ticket, by label. */
const printed = (item: Item): Record<string, number> =>
  Object.fromEntries(item.givens.flatMap((given) => (given.value.t === 'num' ? [[given.label.split(' ')[0], given.value.value]] : [])))

const numbersOf = (item: Item, unit: 'µs' | 'ms'): { plan: number; read: number; forward: number } => {
  const scale = unit === 'ms' ? 1000 : 1
  const shown = printed(item)
  return { plan: Math.round(shown.plan * scale), read: Math.round(shown.read * scale), forward: Math.round(shown.forward * scale) }
}

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr2.bubble-width')).toBe(bubbleWidth)
    expect(FAMILIES).toContain(bubbleWidth)
    expect(familiesForKc('tr2.bubble')).toEqual([bubbleWidth])
    expect(familiesForKc('tr2.nothing')).toEqual([])
    const graph = readFileSync(path.join(root, 'content/kc/graph.yaml'), 'utf8')
    const ids = new Set([...graph.matchAll(/^- id: (\S+)/gm)].map((match) => match[1]))
    for (const kc of bubbleWidth.kcs) expect(ids.has(kc)).toBe(true)
    for (const variant of bubbleWidth.variants) for (const kc of variant.kcs) expect(bubbleWidth.kcs).toContain(kc)
    expect(offeredAt(bubbleWidth, 0).map((variant) => variant.id)).toEqual(['async-off', 'async-on'])
    expect(offeredAt(bubbleWidth, 2).map((variant) => variant.id)).toEqual(['async-off', 'async-on', 'close-it'])
  })

  test('its model is the front page\'s: a step is the plan, the forward and the read in turn, or the longer of the forward and the CPU\'s work', () => {
    const claims = load(readFileSync(path.join(root, 'content/claims/loop.yaml'), 'utf8')) as { id: string; value: number }[]
    const value = (id: string): number => claims.find((claim) => claim.id === id)?.value ?? Number.NaN
    const [plan, read, forward] = [value('loop.world.plan-ticks'), value('loop.world.read-ticks'), value('loop.world.forward-ticks')]
    expect(bubbleModel.stepOff(plan, read, forward)).toBe(value('loop.world.step-ticks-serial'))
    expect(bubbleModel.stepOn(plan, read, forward)).toBe(value('loop.world.step-ticks-overlap'))
    // The line is busy for the forward only, so the gap is the rest of the step: all the expo's work in turn, none of it with overlap.
    expect(bubbleModel.gapOff(plan, read, forward)).toBe(plan + read)
    expect(bubbleModel.gapOn(plan, read, forward)).toBe(0)
    // And where the CPU's work is the longer, the part that does not fit stays.
    expect(bubbleModel.gapOn(3, 2, 4)).toBe(1)
    expect(bubbleModel.gapOn(1, 1, 4)).toBe(0)
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(bubbleWidth, level)) {
        const item = bubbleWidth.make(seed, level, variant.id)
        expect(bubbleWidth.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(bubbleWidth, item, { seed, level, variant: variant.id })).toEqual([])
        expect(bubbleWidth.grade(item, keyOf(item)).ok).toBe(true)
        expect(bubbleWidth.grade(item, wrongOf(item)).ok).toBe(false)
        expect(JSON.stringify(item)).toBe(JSON.stringify(bubbleWidth.make(seed, level, variant.id)))
      }
    }
  })

  test('without a variant named, the seed chooses one the level offers, and the same one each time', () => {
    for (const level of LEVELS) {
      const offered = new Set(offeredAt(bubbleWidth, level).map((variant) => variant.id))
      const seen = new Set(SEEDS.map((seed) => bubbleWidth.make(seed, level).variant))
      expect(seen).toEqual(offered)
    }
  })

  test('is in the world of a synthetic engine: every number the ticket prints is tagged, and no digit is in a sentence', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of LEVELS) {
        const item = bubbleWidth.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...bubbleWidth.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
      }
    }
  })
})

describe('the keys', () => {
  test('with async scheduling off, the gap is all of the CPU\'s work, and the forward is not in it', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2] as const) {
        const item = bubbleWidth.make(seed, level, 'async-off')
        const { plan, read, forward } = numbersOf(item, 'µs')
        expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'µs', truth: plan + read })
        expect(item.answer.kind === 'numeric' && item.answer.truth).toBe(bubbleModel.gapOff(plan, read, forward))
      }
    }
  })

  test('with it on, the gap is the CPU\'s work less the forward, and is never nothing in these items', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2] as const) {
        const item = bubbleWidth.make(seed, level, 'async-on')
        const { plan, read, forward } = numbersOf(item, 'µs')
        const truth = item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN
        expect(truth).toBe(bubbleModel.gapOn(plan, read, forward))
        expect(truth).toBeGreaterThan(0)
        // At least an eighth of the CPU's work stays exposed: the band's rule.
        expect(truth * 8).toBeGreaterThanOrEqual(plan + read)
      }
    }
  })

  test('at level 3 the numeric variants run the other way round', () => {
    for (const seed of SEEDS) {
      const off = bubbleWidth.make(seed, 3, 'async-off')
      const step = printed(off).one
      const forwardOff = printed(off).forward
      expect(off.answer).toMatchObject({ kind: 'numeric', label: 'GPU idle per step', truth: step - forwardOff })
      const on = bubbleWidth.make(seed, 3, 'async-on')
      expect(on.answer).toMatchObject({ kind: 'numeric', label: 'CPU work per step', truth: printed(on).forward + printed(on).idle })
    }
  })

  test.each([2, 3] as const)('close-it at level %p: the key is the change that closes the gap, by async scheduling and by which lane is longer', (level) => {
    const keys = new Map<string, number>()
    for (const seed of SEEDS) {
      const item = bubbleWidth.make(seed, level, 'close-it')
      expect(item.answer.kind).toBe('choice')
      if (item.answer.kind !== 'choice') continue
      const asyncOn = item.givens.find((given) => given.label === 'async scheduling')?.value
      const { plan, read, forward } = numbersOf(item, level === 3 ? 'ms' : 'µs')
      const cpuLonger = plan + read > forward
      const expected = asyncOn?.t === 'text' && asyncOn.text === 'on' ? (cpuLonger ? 'cut' : 'none') : cpuLonger ? 'both' : 'on'
      expect(item.answer.correct).toBe(expected)
      keys.set(expected, (keys.get(expected) ?? 0) + 1)
      expect(item.answer.options.map((option) => option.id).sort()).toEqual(['both', 'cut', 'none', 'on'])
    }
    // Answer first: each of the four is the key on about a quarter of the seeds (300 of them: at least a sixth, at most a third).
    for (const id of ['both', 'cut', 'none', 'on']) {
      expect(keys.get(id) ?? 0).toBeGreaterThan(SEEDS.length / 6)
      expect(keys.get(id) ?? 0).toBeLessThan(SEEDS.length / 3)
    }
  })

  test('close-it prints its times in milliseconds at level 3, and its reasons and solution use the same', () => {
    const item = bubbleWidth.make(SEEDS[0], 3, 'close-it')
    expect(item.givens.filter((given) => given.value.t === 'num').every((given) => given.value.t === 'num' && given.value.unit === 'ms')).toBe(true)
    const words = bubbleWidth.solution(item).map((step) => plain(step.text)).join(' ')
    expect(words).toContain('ms')
    expect(words).not.toContain('µs')
    const level2 = bubbleWidth.make(SEEDS[0], 2, 'close-it')
    expect(bubbleWidth.solution(level2).map((step) => plain(step.text)).join(' ')).toContain('µs')
  })
})

describe('why', () => {
  test('every option of a choice says why, and a lure names the misconception it encodes', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = bubbleWidth.make(seed, 2, 'close-it')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(30)
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toMatch(/^tr2\.bubble-width\.[a-z-]+$/)
      }
      // The reasons of a scene carry its numbers as tagged parts, at least where an option is about the numbers.
      expect(item.answer.options.some((option) => option.why.some((part) => part.t === 'num' && part.tag !== 'synthetic' ? part.tag === 'derived' : part.t === 'num'))).toBe(true)
    }
  })

  test('the solution of a numeric item ends in the key, and walks from the rule to it', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = bubbleWidth.make(seed, level, 'async-on')
        const steps = bubbleWidth.solution(item)
        expect(steps.length).toBeGreaterThanOrEqual(2)
        const last = steps[steps.length - 1].result
        expect(last?.value).toBe(item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)
        expect(last?.tag).toBe('derived')
      }
    }
  })

  test('level 0 shows a whole solution with other numbers, level 1 only the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const variant of ['async-off', 'async-on']) {
        const zero = bubbleWidth.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(3)
        // Other numbers: the example's answer is not this item's.
        const example = zero.worked[zero.worked.length - 1].result?.value
        expect(example).not.toBe(zero.answer.kind === 'numeric' ? zero.answer.truth : -1)
        const one = bubbleWidth.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(one.worked[0].text.every((part) => part.t === 'text')).toBe(true)
        expect(bubbleWidth.make(seed, 2, variant).worked).toEqual([])
      }
    }
  })
})

describe('diagnoses', () => {
  const diagnose = (item: Item, value: number): string | undefined => {
    const graded = bubbleWidth.grade(item, { kind: 'numeric', value })
    return graded.ok ? 'right' : graded.diagnosis?.id
  }

  test('a wrong number that a rule recognises is named, in words that say what was done', () => {
    // A scene where every rule has a distinct number to name: the CPU's work 2,000, the forward 700 (off) and 1,200 (on).
    let off: Item | null = null
    let on: Item | null = null
    for (const seed of SEEDS) {
      const candidate = bubbleWidth.make(seed, 2, 'async-off')
      const { plan, read, forward } = numbersOf(candidate, 'µs')
      if (off === null && plan + read - forward > 0 && plan !== read) off = candidate
      const second = bubbleWidth.make(seed, 2, 'async-on')
      if (on === null) on = second
    }
    if (off === null || on === null) throw new Error('scenes')
    const { plan, read, forward } = numbersOf(off, 'µs')
    expect(diagnose(off, plan + read - forward)).toBe('tr2.bubble-width.overlap-applied')
    expect(diagnose(off, plan + read + forward)).toBe('tr2.bubble-width.forward-added')
    expect(diagnose(off, plan)).toBe('tr2.bubble-width.one-phase')
    expect(diagnose(off, read)).toBe('tr2.bubble-width.one-phase')
    expect(diagnose(off, plan + read)).toBe('right')
    const onNumbers = numbersOf(on, 'µs')
    expect(diagnose(on, onNumbers.plan + onNumbers.read)).toBe('tr2.bubble-width.overlap-ignored')
    expect(diagnose(on, 0)).toBe('tr2.bubble-width.all-hidden')
    expect(diagnose(on, onNumbers.forward - (onNumbers.plan + onNumbers.read))).toBe('tr2.bubble-width.wrong-way-round')
    expect(diagnose(on, 12345678)).toBeUndefined()
  })

  test('a diagnosis is a sentence of the learner\'s own numbers, in tagged parts', () => {
    const item = bubbleWidth.make(SEEDS[1], 2, 'async-on')
    const graded = bubbleWidth.grade(item, { kind: 'numeric', value: 0 })
    expect(graded.ok).toBe(false)
    expect(plain(graded.diagnosis?.message ?? [])).toContain('Zero would be right')
    expect(graded.feedback.some((part) => part.t === 'num' && part.tag === 'derived')).toBe(true)
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(bubbleWidth, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(100, 4)) {
      const { seed } = drawInBand(bubbleWidth, level, entropy)
      expect(bubbleWidth.band(seed, level)).toBe(true)
    }
  })

  test('the band refuses what it says it refuses: a phase that dwarfs the other, a forward within a twentieth of the CPU\'s work, a gap under an eighth', () => {
    for (const seed of fixedSeeds(2000, 31)) {
      for (const level of [2, 3] as const) {
        const item = bubbleWidth.make(seed, level)
        const unit = item.variant === 'close-it' && level === 3 ? 'ms' : 'µs'
        if (item.variant === 'async-off' && level === 3) continue
        if (item.variant === 'async-on' && level === 3) continue
        const { plan, read, forward } = numbersOf(item, unit)
        const dwarfed = Math.min(plan, read) * 4 < Math.max(plan, read)
        const cpu = plan + read
        const refused =
          dwarfed ||
          (item.variant === 'async-off' && Math.abs(cpu - forward) * 20 <= cpu) ||
          (item.variant === 'async-on' && (cpu - forward) * 8 < cpu) ||
          (item.variant === 'close-it' && Math.abs(cpu - forward) * 100 < Math.max(cpu, forward) * 15)
        expect(bubbleWidth.band(seed, level)).toBe(!refused)
      }
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(bubbleWidth, level, bandedSeeds(bubbleWidth, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) {
        if (row.kind === 'numeric') expect(row.rate).toBeLessThanOrEqual(0.15)
        else expect(row.rate).toBeLessThanOrEqual(row.bound)
      }
    }
  })

  test('an attempt at it is a fresh draw: another entropy, other seeds, other numbers', () => {
    const one = startAttempt(bubbleWidth, 2, fixedSeeds(3, 11))
    const two = startAttempt(bubbleWidth, 2, fixedSeeds(3, 12))
    expect(one.served.map((served) => served.seed)).not.toEqual(two.served.map((served) => served.seed))
    expect(one.served.map((served) => served.item.rev)).not.toEqual(two.served.map((served) => served.item.rev))
    expect(isLevel(one.level)).toBe(true)
  })
})

describe('a response of the wrong kind or an answer nobody could mean', () => {
  test('is wrong, and never throws', () => {
    const numeric = bubbleWidth.make(SEEDS[2], 2, 'async-off')
    const choice = bubbleWidth.make(SEEDS[2], 2, 'close-it')
    const responses: Response[] = [
      { kind: 'choice', pick: 'on' },
      { kind: 'numeric', value: Number.NaN },
      { kind: 'numeric', value: Number.POSITIVE_INFINITY },
      { kind: 'numeric', value: -5 },
      { kind: 'choice', pick: '' },
    ]
    for (const response of responses) {
      expect(bubbleWidth.grade(numeric, response).ok).toBe(false)
      expect(bubbleWidth.grade(choice, response).ok).toBe(false)
    }
    const levels: Level[] = [0, 1, 2, 3]
    expect(levels.every(isLevel)).toBe(true)
  })
})
