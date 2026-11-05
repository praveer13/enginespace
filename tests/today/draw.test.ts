/*
 * W1-T05: the ticket that is printed for an idea (src/items/today/draw.ts): an item of a family that assesses the idea, on a seed that
 * the entropy decides and the learner has not met, and what counts as met. "Items regenerated on fresh seeds" (D-037; ASSESSMENT §8).
 */
import { describe, expect, test } from 'bun:test'
import { fixedSeeds, MAX_DRAWS, seenKey } from '@es/play/items'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { drawForKc, seenKeys } from '../../src/items/today/draw'
import { TestLedger } from './support'
import { toySum } from '../play/items-support.ts'

const BUBBLE = 'tr2.bubble'
const OVERLAP = 'tr2.async-overlap'
const ENTROPY = fixedSeeds(300)

describe('drawing an item for an idea', () => {
  test('is an item of a variant that assesses the idea, in band, and the same item the family makes from that seed', () => {
    for (const [kc, variants] of [
      [BUBBLE, ['async-off', 'close-it']],
      [OVERLAP, ['async-on', 'close-it']],
    ] as const) {
      const seen = new Set<string>()
      for (const entropy of ENTROPY) {
        const drawn = drawForKc(bubbleWidth, kc, 2, entropy)
        expect(variants).toContain(drawn.item.variant)
        expect(drawn.item.kcs).toContain(kc)
        expect(drawn.item.level).toBe(2)
        expect(bubbleWidth.band(drawn.item.seed, 2)).toBe(true)
        expect(drawn.item).toEqual(bubbleWidth.make(drawn.item.seed, 2))
        expect(drawn.tries).toBeGreaterThanOrEqual(1)
        seen.add(drawn.item.variant)
      }
      // Both variants come up: the KC is not tied to one kind of question.
      expect([...seen].sort()).toEqual([...variants].sort())
    }
  })

  test('is a function of the entropy: the same entropy gives the same item, and different entropy gives different seeds', () => {
    const a = drawForKc(bubbleWidth, BUBBLE, 2, 12345)
    expect(drawForKc(bubbleWidth, BUBBLE, 2, 12345)).toEqual(a)
    const seeds = new Set(ENTROPY.map((entropy) => drawForKc(bubbleWidth, BUBBLE, 2, entropy).item.seed))
    expect(seeds.size).toBeGreaterThan(290)
  })

  test('a seed the learner has met is refused, and the next candidate of the stream is kept instead', () => {
    const first = drawForKc(bubbleWidth, BUBBLE, 2, 777)
    const met = new Set([seenKey('tr2.bubble-width', first.item.variant, first.item.seed)])
    const again = drawForKc(bubbleWidth, BUBBLE, 2, 777, met)
    expect(again.item.seed).not.toBe(first.item.seed)
    expect(again.tries).toBeGreaterThan(first.tries)
    expect(again.item.kcs).toContain(BUBBLE)
  })

  test('gives up with a RangeError when no candidate serves: a KC no variant of the family assesses', () => {
    expect(() => drawForKc(bubbleWidth, 'tr2.graph-replay', 2, 1)).toThrow(RangeError)
    expect(MAX_DRAWS).toBe(256)
  })

  test('draws from any family that the framework builds, a choice family included', () => {
    const drawn = drawForKc(toySum, OVERLAP, 2, 99)
    expect(drawn.item.variant).toBe('larger')
    expect(drawn.item.answer.kind).toBe('choice')
  })
})

describe('what the learner has met', () => {
  test('an item event names its family and variant, so only that one is met', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off', { seed: 555 })
    ledger.item('2026-11-01', 'async-on', {})
    const met = seenKeys(ledger.events, [bubbleWidth])
    expect(met).toEqual(new Set([seenKey('tr2.bubble-width', 'async-off', 555)]))
  })

  test('a review event names only the idea, so its seed is met by every variant that assesses it, and by no other', () => {
    const ledger = new TestLedger()
    ledger.review('2026-11-01', BUBBLE, 3, { seed: 4242 })
    const met = seenKeys(ledger.events, [bubbleWidth, toySum])
    expect(met).toEqual(
      new Set([seenKey('tr2.bubble-width', 'async-off', 4242), seenKey('tr2.bubble-width', 'close-it', 4242), seenKey('tr2.toy-sum', 'sum', 4242)]),
    )
  })

  test('events that carry no seed, and other kinds, meet nothing', () => {
    const ledger = new TestLedger()
    ledger.item('2026-11-01', 'async-off')
    ledger.review('2026-11-01', BUBBLE, 3)
    ledger.play('2026-11-01', 'loop', 'close')
    expect(seenKeys(ledger.events).size).toBe(0)
  })

  test('a drawn ticket skips the seeds of the ledger: nothing the learner answered before comes back', () => {
    const ledger = new TestLedger()
    const earlier = drawForKc(bubbleWidth, BUBBLE, 2, 31337)
    ledger.review('2026-11-01', BUBBLE, 3, { seed: earlier.item.seed })
    const again = drawForKc(bubbleWidth, BUBBLE, 2, 31337, seenKeys(ledger.events, [bubbleWidth]))
    expect(again.item.seed).not.toBe(earlier.item.seed)
  })
})
