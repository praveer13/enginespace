/**
 * What the tests of the six TR2 families of W1b-T04 share: the claims they hold a family's facts to (read the way TR6's tests read
 * them), and `commonSuite`, the checks that every family owes the framework whatever its world is. A family's own file then holds what
 * is its own: the rule against the sim and the claims, the keys re-derived from what the ticket prints, the reasons and the diagnoses.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import {
  bandAcceptance,
  bandedSeeds,
  BAND_FLOOR,
  drawInBand,
  familiesForKc,
  familyById,
  FAMILIES,
  fixedSeeds,
  LEVELS,
  measureBlind,
  offeredAt,
  startAttempt,
} from '@es/play/items'
import type { Gen, Item, ItemTag, Level, Response, Rich } from '@es/play/items'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf } from './items-support.ts'
import { KC_IDS } from './items-tr6-support.ts'

export { claim, KC_IDS, printed, root, words } from './items-tr6-support.ts'
export { keyOf } from './items-support.ts'

/**
 * A response that is wrong: another option, or a number far from the key (the gate's own distance: three times it, and a thousand more),
 * since a fixed distance falls inside the 2% tolerance of a key of a few hundred thousand.
 */
export const wrongOf = (item: Item): Response =>
  item.answer.kind === 'choice'
    ? { kind: 'choice', pick: (item.answer.options.find((option) => option.id !== (item.answer.kind === 'choice' ? item.answer.correct : '')) ?? item.answer.options[0]).id }
    : { kind: 'numeric', value: item.answer.truth + Math.abs(item.answer.truth) * 3 + 1000 }

// Measuring a family on a thousand banded seeds at each level takes a second or two, and several on a loaded host.
setDefaultTimeout(60_000)

/** Every sentence a learner reads on an item: the stem, the worked part, the solution and the reasons of the options. */
export function sentences(gen: Gen, item: Item): Rich[] {
  const out: Rich[] = [item.stem, ...item.worked.map((step) => step.text), ...gen.solution(item).map((step) => step.text)]
  if (item.answer.kind === 'choice') for (const option of item.answer.options) out.push(option.text, option.why)
  return out
}

/** The numbers a ticket prints in its givens, by label. */
export function givenNumbers(item: Item): Record<string, number> {
  return Object.fromEntries(item.givens.flatMap((given) => (given.value.t === 'num' ? [[given.label, given.value.value]] : [])))
}

/** The checks that every family owes the framework. `seeds` is how many fixed seeds each is made on. */
export function commonSuite(gen: Gen, seedSalt: number, options: { seeds?: number; givenTags?: readonly ItemTag[] } = {}): void {
  const { seeds = 160, givenTags = ['synthetic'] } = options
  const SEEDS = fixedSeeds(seeds, seedSalt)

  describe(`${gen.id}: the family`, () => {
    test('is registered, loads, and names KCs of the graph that its variants assess', () => {
      expect(familyById(gen.id)).toBe(gen)
      expect(FAMILIES).toContain(gen)
      for (const kc of gen.kcs) {
        expect(KC_IDS.has(kc), `${kc} is a KC of content/kc/graph.yaml`).toBe(true)
        expect(familiesForKc(kc)).toContain(gen)
      }
      for (const variant of gen.variants) for (const kc of variant.kcs) expect(gen.kcs).toContain(kc)
      for (const level of LEVELS) expect(offeredAt(gen, level).length, `a variant at level ${level}`).toBeGreaterThan(0)
    })
  })

  describe(`${gen.id}: every item`, () => {
    test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
      for (const seed of SEEDS) {
        for (const variant of offeredAt(gen, level)) {
          const item = gen.make(seed, level, variant.id)
          expect(gen.make(seed, level, variant.id)).toEqual(item)
          expect(JSON.stringify(item)).toBe(JSON.stringify(gen.make(seed, level, variant.id)))
          expect(itemProblems(gen, item, { seed, level, variant: variant.id })).toEqual([])
          expect(gen.grade(item, keyOf(item)).ok).toBe(true)
          expect(gen.grade(item, wrongOf(item)).ok).toBe(false)
          const steps = gen.solution(item)
          expect(steps.length).toBeGreaterThan(0)
          expect(JSON.stringify(gen.solution(item))).toBe(JSON.stringify(steps))
        }
      }
    })

    test('without a variant named, the seed chooses one the level offers, and the same one each time', () => {
      for (const level of LEVELS) {
        const offered = new Set(offeredAt(gen, level).map((variant) => variant.id))
        const seen = new Set(SEEDS.map((seed) => gen.make(seed, level).variant))
        expect(seen).toEqual(offered)
        for (const seed of SEEDS.slice(0, 20)) expect(gen.make(seed, level).variant).toBe(gen.make(seed, level).variant)
      }
    })

    test('prints no number that lacks a tag: no digit in a sentence, and every number of a given is tagged as the family says', () => {
      for (const seed of SEEDS.slice(0, 80)) {
        for (const level of LEVELS) {
          const item = gen.make(seed, level)
          for (const parts of sentences(gen, item)) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
          for (const given of item.givens) if (given.value.t === 'num') expect(givenTags).toContain(given.value.tag)
          for (const given of item.givens) if (given.value.t === 'text') expect(untaggedNumbers(given.value.text)).toEqual([])
        }
      }
    })

    test('level 0 shows a whole solution with other numbers, level 1 the words of the first step and no result, and the other levels nothing', () => {
      for (const seed of SEEDS.slice(0, 80)) {
        for (const level of LEVELS) {
          for (const variant of offeredAt(gen, level)) {
            const item = gen.make(seed, level, variant.id)
            if (level === 0) {
              expect(item.worked.length, `${variant.id} at level 0`).toBeGreaterThanOrEqual(1)
              // Another scene: the worked answer is not this item's.
              if (item.answer.kind === 'numeric') {
                const last = [...item.worked].reverse().find((step) => step.result !== undefined)?.result
                expect(last?.value).not.toBe(item.answer.truth)
              }
            } else if (level === 1) {
              expect(item.worked, `${variant.id} at level 1`).toHaveLength(1)
              expect(item.worked[0].result).toBeUndefined()
            } else expect(item.worked).toEqual([])
          }
        }
      }
    })
  })

  describe(`${gen.id}: the draws`, () => {
    test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
      expect(bandAcceptance(gen, level).rate).toBeGreaterThan(BAND_FLOOR)
      for (const entropy of fixedSeeds(60, 4)) {
        const { seed } = drawInBand(gen, level, entropy)
        expect(gen.band(seed, level)).toBe(true)
      }
    })

    test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
      for (const level of LEVELS) {
        const report = measureBlind(gen, level, bandedSeeds(gen, level, 1000))
        expect(report.over).toEqual([])
        for (const row of report.best) {
          if (row.kind === 'numeric') expect(row.rate).toBeLessThanOrEqual(0.15)
          else expect(row.rate).toBeLessThanOrEqual(row.bound)
        }
      }
    })

    test('an attempt at it is a fresh draw: another entropy, other seeds, other numbers', () => {
      for (const level of [2, 3] as const satisfies readonly Level[]) {
        const one = startAttempt(gen, level, fixedSeeds(3, 11))
        const two = startAttempt(gen, level, fixedSeeds(3, 12))
        expect(one.served.map((served) => served.seed)).not.toEqual(two.served.map((served) => served.seed))
        expect(one.served.map((served) => served.item.rev)).not.toEqual(two.served.map((served) => served.item.rev))
      }
    })
  })

  describe(`${gen.id}: a response of the wrong kind or an answer nobody could mean`, () => {
    test('is wrong, and never throws', () => {
      for (const level of LEVELS) {
        for (const variant of offeredAt(gen, level)) {
          const item = gen.make(SEEDS[2], level, variant.id)
          const responses: Response[] =
            item.answer.kind === 'numeric'
              ? [{ kind: 'choice', pick: 'zzz' }, { kind: 'numeric', value: Number.NaN }, { kind: 'numeric', value: Number.POSITIVE_INFINITY }, { kind: 'numeric', value: -5 }]
              : [{ kind: 'numeric', value: 1 }, { kind: 'choice', pick: '' }, { kind: 'choice', pick: 'zzz' }, { kind: 'numeric', value: Number.NaN }]
          for (const response of responses) expect(gen.grade(item, response).ok).toBe(false)
        }
      }
    })
  })
}
