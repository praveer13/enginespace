/*
 * W1b-T05: the four TR5a families as the rest of the site meets them: where the registry puts them, that a stored answer of each variant grades
 * again from its seed, that Today can print a ticket for every KC they assess, and that the exit tickets of the lessons that name them can always
 * be passed (ASSESSMENT §4.2: at least two right, and one of them numeric). tests/items/catalog.test.ts holds their faces and loaders to the registry.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { fixedSeeds, FAMILIES, familiesForKc, itemRef, LEVELS, offeredAt, regradeItem, startAttempt } from '@es/play/items'
import type { Gen, Level, Response } from '@es/play/items'
import { blocksHeld } from '@es/play/items/families/tr5a/blocks-held'
import { hitLength } from '@es/play/items/families/tr5a/hit-length'
import { pagesForAdapter } from '@es/play/items/families/tr5a/pages-for-adapter'
import { slotsVsPages } from '@es/play/items/families/tr5a/slots-vs-pages'
import { drawForKc, familiesAt, levelFor } from '../../src/items/today/draw'
import { firstMemory } from '../../src/items/today/fsrs'
import { TRANSFER_STABILITY_DAYS } from '../../src/items/today/limits'
import { keyOf, wrongOf } from './items-support.ts'
import { KC_IDS } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const TR5A: readonly Gen[] = [blocksHeld, hitLength, pagesForAdapter, slotsVsPages]

describe('the registry', () => {
  test('holds the four after TR2\'s families and before TR6\'s, in the order of the files', () => {
    const ids = FAMILIES.map((gen) => gen.id)
    const mine = ids.filter((id) => id.startsWith('tr5a.'))
    expect(mine).toEqual(['tr5a.blocks-held', 'tr5a.hit-length', 'tr5a.pages-for-adapter', 'tr5a.slots-vs-pages'])
    const first = ids.indexOf(mine[0])
    expect(ids.slice(first, first + 4)).toEqual(mine)
    for (const id of ids) {
      if (id.startsWith('tr2.') || id.startsWith('tr1.')) expect(ids.indexOf(id)).toBeLessThan(first)
      if (id.startsWith('tr6.') || id.startsWith('tr8.')) expect(ids.indexOf(id)).toBeGreaterThan(first + 3)
    }
  })

  test('assess the TR5a KCs that the lessons name, every one of them a KC of the graph, and between them seven of the eight', () => {
    const assessed = new Set(TR5A.flatMap((gen) => gen.kcs))
    for (const kc of assessed) expect(KC_IDS.has(kc)).toBe(true)
    expect([...assessed].sort()).toEqual([
      'tr5a.adapter-pages',
      'tr5a.hit-intersection',
      'tr5a.kv-groups',
      'tr5a.page-size-unification',
      'tr5a.sliding-free',
      'tr5a.slots-vs-pages',
      'tr5a.state-pages',
    ])
    // The eighth, `tr5a.all-or-nothing`, is the lab's and the game's: no item of these families is about it.
    expect(familiesForKc('tr5a.all-or-nothing')).toEqual([])
    expect(familiesForKc('tr5a.slots-vs-pages')).toEqual([slotsVsPages])
  })
})

describe('a stored answer', () => {
  test.each(LEVELS)('of every variant at level %p grades again from its seed to the verdict recorded, and a changed question reads as stale', (level) => {
    for (const gen of TR5A) {
      for (const variant of offeredAt(gen, level)) {
        for (const seed of fixedSeeds(20, 0x5a0 + level)) {
          const item = gen.make(seed, level, variant.id)
          const ref = itemRef(gen.id, variant.id)
          for (const response of [keyOf(item), wrongOf(item)] as Response[]) {
            const again = regradeItem({ ref, seed, rev: item.rev, answer: { level, response } })
            expect(again).toMatchObject({ valid: true, ok: gen.grade(item, response).ok, stale: false })
          }
          // An event written when the question was another one is stale, and loses nothing.
          expect(regradeItem({ ref, seed, rev: '00000000', answer: { level, response: keyOf(item) } })).toMatchObject({ valid: true, ok: true, stale: true })
        }
      }
    }
  })
})

describe('Today', () => {
  const KCS = [...new Set(TR5A.flatMap((gen) => gen.kcs))]

  test('can print a ticket for every KC the families assess, on its own for a young memory and on a changed surface for a sturdy one', () => {
    for (const kc of KCS) {
      for (const stability of [1, TRANSFER_STABILITY_DAYS + 5]) {
        const card = { kc, memory: { ...firstMemory(3), stability } }
        const level = levelFor(card)
        expect([kc, stability, level !== null]).toEqual([kc, stability, true])
        if (level === null) continue
        expect(familiesAt(kc, level).length).toBeGreaterThan(0)
      }
    }
  })

  test('draws an item of a variant that assesses the KC, at the level that was asked, in band', () => {
    for (const gen of TR5A) {
      for (const kc of gen.kcs) {
        for (const level of LEVELS) {
          if (!offeredAt(gen, level).some((variant) => variant.kcs.includes(kc))) continue
          for (const entropy of fixedSeeds(40, 0x70da + level)) {
            const drawn = drawForKc(gen, kc, level, entropy)
            expect([gen.id, kc, level, drawn.item.kcs.includes(kc)]).toEqual([gen.id, kc, level, true])
            expect(drawn.item.level).toBe(level)
            expect(gen.band(drawn.item.seed, level)).toBe(true)
          }
        }
      }
    }
  })

  test('serves the KC of the second lesson, which no variant asks at level 2, on the surface of level 3 for a young memory too', () => {
    const card = { kc: 'tr5a.page-size-unification', memory: { ...firstMemory(3), stability: 1 } }
    expect(familiesAt(card.kc, 2)).toEqual([])
    expect(levelFor(card)).toBe(3)
  })
})

describe("the lessons' exit tickets", () => {
  /** The blocks that TR5a's lessons print (content/modules/tr5a/lessons): family, level and the tickets in an attempt. */
  const BLOCKS: readonly { gen: Gen; level: Level; count: number }[] = [
    { gen: blocksHeld, level: 2, count: 3 },
    { gen: blocksHeld, level: 3, count: 3 },
    { gen: hitLength, level: 2, count: 3 },
    { gen: pagesForAdapter, level: 2, count: 2 },
    { gen: slotsVsPages, level: 2, count: 1 },
  ]

  test('every ticket of the first three lessons and the first two of the fourth are numbers to be written, so that one numeric item is always among them', () => {
    for (const { gen, level } of BLOCKS.slice(0, 4)) {
      for (const seed of fixedSeeds(120, 0xe17)) {
        const item = gen.make(seed, level)
        expect([gen.id, level, item.variant, item.answer.kind]).toEqual([gen.id, level, item.variant, 'numeric'])
      }
    }
  })

  test('an attempt at each block draws the tickets it asks for, all different, and in band', () => {
    for (const { gen, level, count } of BLOCKS) {
      for (let at = 0; at < 20; at += 1) {
        const attempt = startAttempt(gen, level, fixedSeeds(count, 0xa77 + at))
        expect(attempt.served).toHaveLength(count)
        expect(new Set(attempt.served.map((served) => served.seed)).size).toBe(count)
        for (const served of attempt.served) expect(gen.band(served.seed, level)).toBe(true)
      }
    }
  })
})
