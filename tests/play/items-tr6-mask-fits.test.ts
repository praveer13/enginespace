/*
 * W1-T30: `tr6.mask-fits`, TR6's graded task for the grammar mask (docs/TRACKER.md, "TR6 content and the mask-overlap timeline"; ASSESSMENT
 * §4.3, "the predicted bubble within ±10% of the model's"). The tests re-derive each key from the numbers that the ticket prints, and then
 * hold the family to the step-loop model itself: every key is the gap that `runStepLoop` measures in its steady state on the same numbers,
 * with and without the mask, so the task grades what Service's `mask` level shows and not a formula of its own.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, isLevel, LEVELS, offeredAt } from '@es/play/items'
import type { Item, Level, Response } from '@es/play/items'
import { heaviestCount, heaviestWeight, maskFits, maskModel, outcomeOf } from '@es/play/items/families/tr6/mask-fits'
import type { Mode, Scene } from '@es/play/items/families/tr6/mask-fits'
import { maskFillUs, runStepLoop, TICK_CARD } from '../../packages/sim/steploop'
import { genWorkload } from '../../packages/sim/workload'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { KC_IDS, printed, words } from './items-tr6-support.ts'

setDefaultTimeout(120_000)

const SEEDS = fixedSeeds(120, 0x6a5c)

/** The scene a ticket prints: its numbers and its words. */
function sceneOf(item: Item): Scene {
  const n = printed(item)
  const w = words(item)
  const mode: Mode = w['async scheduling'] === 'on' ? 'async' : w['the fill runs'] === 'after the forward' ? 'serial' : 'overlap'
  const requests = n['structured requests in the step']
  const drafts = n['draft tokens per request']
  const rowUs = n['grammar weight per row']
  const rows = requests * (1 + drafts)
  return { mode, plan: n['plan (CPU, before the forward)'], read: n['read (CPU, after the forward)'], forward: n['forward (GPU)'], requests, drafts, rowUs, rows, fill: rows * rowUs }
}

const median = (xs: number[]): number => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]

/**
 * The gap that the step loop measures in its steady state on a scene: the front page's tick card with its phases set to the scene's, one
 * structured request for each request of the scene (all decoding, in lockstep), and `k` drafts that are never accepted, so that every
 * step carries `1 + k` rows for each request and the forward is the scene's. `structured` false is the same step with no grammar.
 */
function measuredGap(scene: Scene, structured: boolean): number {
  const card = { ...TICK_CARD, scheduleBaseUs: scene.plan, syncUs: scene.read, forwardUs: scene.forward, admitUs: 0, maskPerSeqUs: scene.rowUs }
  const workload = genWorkload(5, {
    requests: scene.requests,
    arrivals: { kind: 'burst' },
    lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 1, hi: 1 }, output: { kind: 'uniform', lo: 30, hi: 30 } },
    ...(structured ? { structuredPermille: 1000 } : {}),
  })
  const run = runStepLoop(
    workload,
    {
      maxNumSeqs: scene.requests,
      maxBatchedTokens: 1_000_000,
      chunkedPrefill: true,
      asyncScheduling: scene.mode === 'async',
      inputIds: 'device',
      graphs: { mode: 'NONE', captureSizes: [] },
      ...(structured ? { structured: { overlap: scene.mode !== 'serial' } } : {}),
      ...(scene.drafts > 0 ? { runner: 'mrv2' as const, spec: { k: scene.drafts, alphaPermille: 0, draftCostPermille: 0 } } : {}),
    },
    card,
    card,
    { horizonUs: 1_000_000_000 },
  )
  return median(run.steps.slice(6, 20).map((step) => step.bubbleUs))
}

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr6.mask-fits')).toBe(maskFits)
    expect(FAMILIES).toContain(maskFits)
    expect(familiesForKc('tr6.mask-overlap')).toContain(maskFits)
    for (const kc of maskFits.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const variant of maskFits.variants) for (const kc of variant.kcs) expect(maskFits.kcs).toContain(kc)
    expect(offeredAt(maskFits, 0).map((variant) => variant.id)).toEqual(['gap'])
    expect(offeredAt(maskFits, 1).map((variant) => variant.id)).toEqual(['gap', 'fits'])
    expect(offeredAt(maskFits, 2).map((variant) => variant.id)).toEqual(['gap', 'fits', 'heaviest'])
    expect(LEVELS.every(isLevel)).toBe(true)
  })

  test('its rows and its fill are the step loop\'s: one row for each position that may be sampled, filled serially', () => {
    for (const requests of [4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64]) {
      for (let drafts = 0; drafts <= 4; drafts += 1) {
        for (const rowUs of [10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 80, 100, 120, 150, 200]) {
          expect(maskModel.fill(maskModel.rows(requests, drafts), rowUs)).toBe(maskFillUs(requests, rowUs, drafts))
        }
      }
    }
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of offeredAt(maskFits, level)) {
        const item = maskFits.make(seed, level, variant.id)
        expect(maskFits.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(maskFits, item, { seed, level, variant: variant.id })).toEqual([])
        expect(maskFits.grade(item, keyOf(item)).ok).toBe(true)
        expect(maskFits.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints every number tagged, with no digit in a sentence', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const level of LEVELS) {
        const item = maskFits.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...maskFits.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
      }
    }
  })
})

describe('the gap variant: the graded task', () => {
  test('its key is the formula of the mode on the printed numbers', () => {
    for (const level of [0, 1, 2] as const) {
      for (const seed of SEEDS) {
        const item = maskFits.make(seed, level, 'gap')
        const scene = sceneOf(item)
        expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'µs', truth: maskModel.gap(scene.mode, scene.plan, scene.read, scene.forward, scene.fill) })
        expect(item.answer.kind === 'numeric' && item.answer.truth).toBeGreaterThan(0)
      }
    }
  })

  test('is the gap that the step loop measures on the same numbers, in each of the three modes', () => {
    const seen = new Set<Mode>()
    for (const level of [0, 1, 2] as const) {
      for (const seed of SEEDS.slice(0, 50)) {
        const item = maskFits.make(seed, level, 'gap')
        const scene = sceneOf(item)
        seen.add(scene.mode)
        expect([scene.mode, scene.fill, measuredGap(scene, true)]).toEqual([scene.mode, scene.fill, item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN])
      }
    }
    expect([...seen].sort()).toEqual(['async', 'overlap', 'serial'])
  })

  test('is within ASSESSMENT\'s ±10% when right and not when the mask is left out, and names the usual mistakes', () => {
    let named = 0
    for (const seed of SEEDS) {
      const item = maskFits.make(seed, 2, 'gap')
      if (item.answer.kind !== 'numeric') throw new Error('gap is numeric')
      const truth = item.answer.truth
      const answer = (value: number): Response => ({ kind: 'numeric', value })
      expect(maskFits.grade(item, answer(Math.round(truth * 1.09))).ok).toBe(true)
      expect(maskFits.grade(item, answer(Math.round(truth * 0.91))).ok).toBe(true)
      expect(maskFits.grade(item, answer(Math.round(truth * 1.2))).ok).toBe(false)
      const scene = sceneOf(item)
      const free = maskModel.free(scene.mode, scene.plan, scene.read, scene.forward)
      const grade = maskFits.grade(item, answer(free))
      expect(grade.ok).toBe(false)
      if (grade.diagnosis !== undefined) named += 1
    }
    // The family names what leaving the mask out comes to in a good share of its scenes (the other mistakes are tested below).
    expect(named).toBeGreaterThan(SEEDS.length / 3)
  })

  test('keeps its lures clear of the key, so the ±10% bar tells the understanding from the mistake', () => {
    for (const seed of SEEDS) {
      const item = maskFits.make(seed, 2, 'gap')
      if (item.answer.kind !== 'numeric') throw new Error('gap is numeric')
      const scene = sceneOf(item)
      const truth = item.answer.truth
      const { mode, plan, read, forward, fill } = scene
      const cpu = plan + read
      const lures = mode === 'overlap' ? [fill, Math.max(0, fill - forward), cpu + fill, cpu] : mode === 'serial' ? [cpu + Math.max(0, fill - forward), fill, cpu] : [cpu + Math.max(0, fill - forward), cpu + fill, Math.max(0, cpu - forward)]
      for (const lure of lures) expect(Math.abs(lure - truth)).toBeGreaterThanOrEqual(0.15 * truth)
    }
  })

  test('at level 3 reads the weight of a row back from the gap', () => {
    for (const seed of SEEDS) {
      const item = maskFits.make(seed, 3, 'gap')
      const scene = sceneOf({ ...item, givens: [...item.givens, { label: 'grammar weight per row', value: { t: 'num', value: 0, tag: 'synthetic' } }] } as Item)
      const n = printed(item)
      const gap = n['idle between two forwards']
      const { mode, plan, read, forward } = scene
      const fill = mode === 'serial' ? gap - plan - read : gap - plan - read + forward
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'µs', truth: fill / (scene.requests * (1 + scene.drafts)) })
      // Where the forward hid the whole fill the gap would not say how heavy it was: the band turns those scenes away.
      if (mode === 'overlap') expect(fill).toBeGreaterThan(forward)
    }
  })
})

describe('the fits variant', () => {
  test('is drawn answer first: each of the three outcomes is the key on about a third of the seeds', () => {
    const counts: Record<string, number> = { none: 0, part: 0, all: 0 }
    for (const seed of fixedSeeds(600, 0xfa57)) {
      const item = maskFits.make(seed, 2, 'fits')
      if (item.answer.kind !== 'choice') throw new Error('fits is a choice')
      counts[item.answer.correct] += 1
    }
    for (const outcome of ['none', 'part', 'all']) expect(counts[outcome]).toBeGreaterThan(150)
  })

  test('says what the step loop shows: the share of the fill that the mask adds to the gap, with the mask and without it', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = maskFits.make(seed, 2, 'fits')
      if (item.answer.kind !== 'choice') throw new Error('fits is a choice')
      const scene = sceneOf(item)
      const added = measuredGap(scene, true) - measuredGap(scene, false)
      expect(outcomeOf(scene)).toBe(item.answer.correct)
      const expected = added <= 0 ? 'none' : added >= scene.fill ? 'all' : 'part'
      expect([scene.mode, scene.fill, added, expected]).toEqual([scene.mode, scene.fill, added, item.answer.correct])
    }
  })

  test('has a why on every option, and names the misconception of a wrong one', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const item = maskFits.make(seed, 2, 'fits')
      if (item.answer.kind !== 'choice') throw new Error('fits is a choice')
      expect(item.answer.options).toHaveLength(3)
      for (const option of item.answer.options) {
        expect(option.why.length).toBeGreaterThan(0)
        if (option.id !== item.answer.correct) expect(option.miss?.startsWith('tr6.mask-fits.')).toBe(true)
      }
    }
  })
})

describe('the heaviest variant', () => {
  test('finds the heaviest weight and the largest count, and one more adds idle time in the step loop', () => {
    let checked = 0
    for (const seed of SEEDS) {
      const item = maskFits.make(seed, 2, 'heaviest')
      if (item.answer.kind !== 'numeric') throw new Error('heaviest is numeric')
      const scene = sceneOf(item)
      const weight = heaviestWeight(scene)
      if (weight === null) continue
      expect(item.answer.truth).toBe(weight)
      const free = maskModel.free(scene.mode, scene.plan, scene.read, scene.forward)
      expect(measuredGap({ ...scene, rowUs: weight, fill: scene.rows * weight }, true)).toBe(free)
      expect(measuredGap({ ...scene, rowUs: weight + 1, fill: scene.rows * (weight + 1) }, true)).toBeGreaterThan(free)
      checked += 1
    }
    expect(checked).toBeGreaterThan(SEEDS.length * 0.8)
  })

  test('at level 3 counts the requests a step can hold, and one more adds idle time', () => {
    let checked = 0
    for (const seed of SEEDS) {
      const item = maskFits.make(seed, 3, 'heaviest')
      if (item.answer.kind !== 'numeric') throw new Error('heaviest is numeric')
      const scene = sceneOf({ ...item, givens: [...item.givens, { label: 'structured requests in the step', value: { t: 'num', value: 1, tag: 'synthetic' } }] } as Item)
      const count = heaviestCount(scene)
      if (count === null) continue
      expect(item.answer.truth).toBe(count)
      const at = (requests: number): Scene => ({ ...scene, requests, rows: requests * (1 + scene.drafts), fill: requests * (1 + scene.drafts) * scene.rowUs })
      const free = maskModel.free(scene.mode, scene.plan, scene.read, scene.forward)
      expect(measuredGap(at(count), true)).toBe(free)
      expect(measuredGap(at(count + 1), true)).toBeGreaterThan(free)
      checked += 1
    }
    expect(checked).toBeGreaterThan(SEEDS.length * 0.8)
  })
})

describe('the band', () => {
  test('accepts nearly every seed at every level, because the scene is drawn until it is a fair question', () => {
    for (const level of LEVELS) {
      let accepted = 0
      for (const seed of SEEDS) if (maskFits.band(seed, level as Level)) accepted += 1
      expect(accepted).toBeGreaterThan(SEEDS.length * 0.9)
    }
  })
})
