/*
 * W1-T30: `tr6.verify-shape`, the exit item of TR6's first lesson. The tests re-derive each key from the numbers that the ticket prints,
 * and hold the `uniform` variant to the step-loop model's own dispatcher: for every scene the graph that the family says serves the step is
 * the graph that MRV2's `dispatchV2` picks for the same batch, under the mode that `resolveGraphMode` leaves of FULL_AND_PIECEWISE on the
 * ticket's backend.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt } from '@es/play/items'
import type { Item, Response } from '@es/play/items'
import { serveOf, shapeTokens, verifyShape } from '@es/play/items/families/tr6/verify-shape'
import type { Serve, Shape, Support } from '@es/play/items/families/tr6/verify-shape'
import { batchShape, dispatchV2, makeGraphConfig, resolveGraphMode } from '../../packages/sim/steploop'
import type { BackendSupport, BatchRow } from '../../packages/sim/steploop'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { KC_IDS, printed, words } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(300, 0x5a9e)

/** The shape a `uniform` ticket prints. */
function shapeOf(item: Item): Shape {
  const n = printed(item)
  const w = words(item)
  const support: Support = w['the backend replays full graphs for'] === 'batches of equal-length rows' ? 'batch' : 'single'
  return {
    drafts: n['draft tokens per request'],
    decodes: n['requests in decode'],
    prefill: n['prefill chunk in the batch'] ?? 0,
    support,
    largest: n['largest captured size'],
  }
}

/** What the sim's dispatcher says serves the batch: FULL_AND_PIECEWISE resolved on the backend, captured at multiples of eight up to the largest size. */
function dispatched(s: Shape): Serve {
  const support: BackendSupport = s.support === 'batch' ? 'UNIFORM_BATCH' : 'UNIFORM_SINGLE_TOKEN_DECODE'
  const resolved = resolveGraphMode('FULL_AND_PIECEWISE', { support, decodeQueryLen: 1 + s.drafts })
  const sizes = Array.from({ length: s.largest / 8 }, (_, i) => 8 * (i + 1))
  const g = makeGraphConfig({ mode: resolved.mode, captureSizes: sizes, maxNumSeqs: 256, decodeQueryLen: 1 + s.drafts })
  const rows: BatchRow[] = Array.from({ length: s.decodes }, () => ({ chunk: 1 + s.drafts, prefill: false, done: 64 }))
  if (s.prefill > 0) rows.push({ chunk: s.prefill, prefill: true, done: 0 })
  const shape = batchShape(rows, 1 + s.drafts)
  const d = dispatchV2(g, shape.numReqs, shape.numTokens, shape.uniformTokenCount, 0, shape.maxQueryLen)
  if (d.cgMode === 'NONE') return 'eager'
  if (d.cgMode === 'FULL') return 'full'
  return s.support === 'single' ? 'backend' : 'mixed'
}

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr6.verify-shape')).toBe(verifyShape)
    expect(FAMILIES).toContain(verifyShape)
    expect(familiesForKc('tr6.verify-shape')).toEqual([verifyShape])
    for (const kc of verifyShape.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(verifyShape, 0).map((variant) => variant.id)).toEqual(['positions', 'tokens-out'])
    expect(offeredAt(verifyShape, 2).map((variant) => variant.id)).toEqual(['positions', 'tokens-out', 'uniform'])
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 100)) {
      for (const variant of offeredAt(verifyShape, level)) {
        const item = verifyShape.make(seed, level, variant.id)
        expect(verifyShape.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(verifyShape, item, { seed, level, variant: variant.id })).toEqual([])
        expect(verifyShape.grade(item, keyOf(item)).ok).toBe(true)
        expect(verifyShape.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints every number tagged, with no digit in a sentence', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const level of LEVELS) {
        const item = verifyShape.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...verifyShape.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
      }
    }
  })
})

describe('positions', () => {
  test('a step presents one position for the token and one for each draft, for every request', () => {
    for (const seed of SEEDS) {
      const item = verifyShape.make(seed, 2, 'positions')
      const n = printed(item)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'tokens', truth: n['running requests in the batch'] * (1 + n['draft tokens per request']) })
    }
  })

  test('at level 3 reads the requests back from the positions', () => {
    for (const seed of SEEDS) {
      const item = verifyShape.make(seed, 3, 'positions')
      const n = printed(item)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'requests', truth: n['positions the step presents'] / (1 + n['draft tokens per request']) })
      expect(Number.isInteger(n['positions the step presents'] / (1 + n['draft tokens per request']))).toBe(true)
    }
  })

  test('names the usual mistakes', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = verifyShape.make(seed, 2, 'positions')
      const n = printed(item)
      const requests = n['running requests in the batch']
      const drafts = n['draft tokens per request']
      for (const [value, id] of [[requests * drafts, 'no-last-position'], [requests + drafts, 'added'], [1 + drafts, 'one-request'], [requests, 'no-drafts']] as const) {
        const grade = verifyShape.grade(item, { kind: 'numeric', value } satisfies Response)
        expect(grade.ok).toBe(false)
        if (grade.diagnosis !== undefined) seen.add(grade.diagnosis.id.replace('tr6.verify-shape.', ''))
        else expect(value).toBeLessThan(0) // never: every one of the four has a name
        expect(grade.diagnosis?.id).toBe(`tr6.verify-shape.${id}`)
      }
    }
    expect([...seen].sort()).toEqual(['added', 'no-drafts', 'no-last-position', 'one-request'])
  })
})

describe('tokens-out', () => {
  test('each request emits what it accepted and one token more, and the step\'s other positions were thrown away', () => {
    for (const seed of SEEDS) {
      const item = verifyShape.make(seed, 2, 'tokens-out')
      const n = printed(item)
      const requests = n['requests in the step']
      const drafts = n['draft tokens per request']
      const accepted = Array.from({ length: requests }, (_, i) => n[`request ${i + 1}, drafts accepted`])
      expect(accepted.every((a) => a >= 0 && a <= drafts)).toBe(true)
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'tokens', truth: accepted.reduce((sum, a) => sum + a + 1, 0) })
      // A round with a full run and a rejection in it, so that both kinds of last token are met.
      expect(accepted.some((a) => a === drafts) && accepted.some((a) => a < drafts)).toBe(true)
      const waste = verifyShape.make(seed, 3, 'tokens-out')
      const m = printed(waste)
      const acceptedWaste = Array.from({ length: m['requests in the step'] }, (_, i) => m[`request ${i + 1}, drafts accepted`])
      expect(waste.answer).toMatchObject({ kind: 'numeric', truth: acceptedWaste.reduce((sum, a) => sum + (m['draft tokens per request'] - a), 0) })
    }
  })
})

describe('uniform', () => {
  test('is drawn answer first: each of the four graphs is the key on about a quarter of the seeds', () => {
    const counts: Record<string, number> = { full: 0, mixed: 0, backend: 0, eager: 0 }
    for (const seed of fixedSeeds(800, 0x7117)) {
      const item = verifyShape.make(seed, 2, 'uniform')
      if (item.answer.kind !== 'choice') throw new Error('uniform is a choice')
      counts[item.answer.correct] += 1
    }
    for (const serve of Object.keys(counts)) expect(counts[serve]).toBeGreaterThan(140)
  })

  test('is the graph that MRV2\'s dispatcher picks for the same batch, under the mode the backend leaves of FULL_AND_PIECEWISE', () => {
    for (const level of [1, 2, 3] as const) {
      for (const seed of SEEDS) {
        const item = verifyShape.make(seed, level, 'uniform')
        if (item.answer.kind !== 'choice') throw new Error('uniform is a choice')
        const shape = shapeOf(item)
        expect([shape, serveOf(shape)]).toEqual([shape, item.answer.correct as Serve])
        expect([shape, dispatched(shape)]).toEqual([shape, item.answer.correct as Serve])
      }
    }
  })

  test('keeps a clear margin from the largest captured size, and a dozen tokens under it where a full graph serves the step', () => {
    for (const seed of SEEDS) {
      const item = verifyShape.make(seed, 2, 'uniform')
      const shape = shapeOf(item)
      expect(Math.abs(shapeTokens(shape) - shape.largest) * 10).toBeGreaterThanOrEqual(shape.largest)
      if (serveOf(shape) === 'full') expect(shapeTokens(shape) + 12).toBeLessThanOrEqual(shape.largest)
    }
  })
})
