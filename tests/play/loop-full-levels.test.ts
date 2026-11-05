/*
 * W1-T13 acceptance check 2: on 50 seeds, each level's naive configuration fails its bar and the intended one passes (TRACKER W1-T13;
 * GAMES.md §3.2). The full service's levels and stages on the seeds their bands accept, measured and printed: the share each band accepts,
 * the answers the answer-first stages draw, and what a constant answer scores against them (GAMES.md §2.1, the D39 rule).
 *
 * The naive configuration of a level is every stage's naive levers: async scheduling off, no routine drilled, vLLM's own sizes cut to the
 * rack, no graph at all for the modes, the legacy runner, and the allergy card written after the fire. The intended one is the house's.
 */
import { describe, expect, test } from 'bun:test'
import { buildFullLevel, defaultLevers, FULL_LEVEL_IDS, inFullBand, MODES, stageInBand } from '@es/play/loop/full/levels'
import { graphBytes, nightOf, resolvedMode, servingMode } from '@es/play/loop/full/night'
import { FULL_SERVICE } from '@es/play/loop/entry'
import { nightMeetsBar } from '@es/play/loop/full/session'
import type { FullLevelId, Levers, StageWorld } from '@es/play/loop/full/types'
import { seeds } from '../seeds'

const SEEDS = seeds(0)
/** The acceptance check's count of seeds: the first 50 in band [estimated, TRACKER W1-T13]. */
const CHECKED = 50

const inBand = (id: FullLevelId): number[] => SEEDS.filter((seed) => inFullBand(id, seed))
const served = (stage: StageWorld, levers: Levers): boolean => {
  const night = nightOf(stage, levers)
  return night !== null && nightMeetsBar(stage, night)
}
/** A level's pinned practice seed: the registry's. */
const practiceSeed = (id: FullLevelId): number => FULL_SERVICE.find((level) => level.id === id)?.practiceSeed ?? Number.NaN
const pct = (part: number, whole: number) => `${((100 * part) / whole).toFixed(1)}%`

describe('the bands (GAMES.md §2.1)', () => {
  test.each(FULL_LEVEL_IDS.map((id) => [id]))('%s accepts at least the 20%% floor of the seeds, and its practice seed', (id) => {
    const accepted = inBand(id)
    console.log(`${id}: ${accepted.length} of ${SEEDS.length} seeds in band (${pct(accepted.length, SEEDS.length)})`)
    expect(accepted.length / SEEDS.length).toBeGreaterThanOrEqual(0.2)
    expect(accepted.length).toBeGreaterThanOrEqual(CHECKED)
    expect(inFullBand(id, practiceSeed(id))).toBe(true)
  })
})

describe(`acceptance check 2: on ${CHECKED} in-band seeds a level's naive configuration fails its bar and the intended one passes`, () => {
  test.each(FULL_LEVEL_IDS.map((id) => [id]))('%s', (id) => {
    for (const seed of inBand(id).slice(0, CHECKED)) {
      const level = buildFullLevel(id, seed)
      const naive = level.stages.map((stage) => served(stage, stage.naive))
      const intended = level.stages.map((stage) => served(stage, stage.house))
      expect([id, seed, intended]).toEqual([id, seed, level.stages.map(() => true)])
      // The level's naive configuration fails: some stage misses its bar, and every stage whose band requires it misses it.
      expect([id, seed, naive.every(Boolean)]).toEqual([id, seed, false])
      level.stages.forEach((stage, i) => {
        if (stage.naiveFails) expect([id, seed, stage.id, naive[i]]).toEqual([id, seed, stage.id, false])
      })
    }
  })

  test('the stages open on the naive configuration, but for the modes, which opens on the engine\'s default and drills no routine as its naive', () => {
    for (const id of FULL_LEVEL_IDS) {
      for (const stage of buildFullLevel(id, 0).stages) {
        if (stage.id === 'modes') {
          expect(stage.start.graphMode).toBe('FULL_AND_PIECEWISE')
          expect(stage.naive.graphMode).toBe('NONE')
        } else expect([stage.id, stage.start]).toEqual([stage.id, stage.naive])
      }
    }
  })

  test('the house serves with the pinned engine\'s defaults but for the stage\'s own lever', () => {
    const d = defaultLevers(12, 2048)
    const [comb, sizes, modes] = buildFullLevel('graphs', 0).stages
    expect(comb.house).toEqual(d)
    expect({ ...sizes.house, captureSizes: d.captureSizes }).toEqual(d)
    expect(sizes.house.captureSizes.length).toBeLessThanOrEqual(3)
    expect(MODES).toContain(modes.house.graphMode)
    const [small] = buildFullLevel('mrv2', 0).stages
    expect(small.house.runner).toBe('mrv2')
    expect(small.naive.runner).toBe('v1')
  })
})

describe('the answer-first stages (GAMES.md §2.1, the D39 rule)', () => {
  test('modes: each of the four modes that use graphs is the answer on about a quarter of the in-band seeds, and no one mode asked for always passes on half of them', () => {
    const answers = new Map<string, number>()
    const passes = new Map<string, number>()
    let total = 0
    for (const seed of SEEDS) {
      const stage = buildFullLevel('graphs', seed).stages[2]
      if (!stageInBand(stage)) continue
      total += 1
      answers.set(stage.house.graphMode, (answers.get(stage.house.graphMode) ?? 0) + 1)
      for (const mode of MODES) if (served(stage, { ...stage.house, graphMode: mode })) passes.set(mode, (passes.get(mode) ?? 0) + 1)
    }
    console.log(`modes: answers over ${total} in-band seeds: ${[...answers].map(([mode, n]) => `${mode} ${pct(n, total)}`).join(', ')}`)
    console.log(`modes: a constant request passes on: ${MODES.map((mode) => `${mode} ${pct(passes.get(mode) ?? 0, total)}`).join(', ')}`)
    expect([...answers.keys()].sort()).toEqual(['FULL', 'FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE'])
    for (const n of answers.values()) expect(n / total).toBeGreaterThanOrEqual(0.15)
    // About 1/k of the seeds for k = 4 answers, but FULL asked for on a backend that replays only uniform batches runs as FULL_AND_PIECEWISE,
    // so asking for FULL always passes on both of those answers' seeds: still under half of them.
    for (const mode of MODES) expect((passes.get(mode) ?? 0) / total).toBeLessThan(0.5)
    expect(passes.get('NONE') ?? 0).toBe(0)
  })

  test('modes: FULL asked for runs as FULL only where the backend replays any batch, and serves only where the reach-in has room for its routines', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const stage = buildFullLevel('graphs', seed).stages[2]
      const asked = resolvedMode(stage.support, { graphMode: 'FULL' })
      expect(asked.mode).toBe(stage.support === 'ALWAYS' ? 'FULL' : stage.support === 'NEVER' ? null : 'FULL_AND_PIECEWISE')
      const serving = servingMode(stage, { ...stage.house, graphMode: 'FULL' })
      const room = asked.mode !== null && graphBytes(stage, stage.house, asked.mode) <= (stage.graphBudget ?? Infinity)
      expect(serving.mode).toBe(room ? asked.mode : null)
      expect(stage.prediction.kind === 'choice' && stage.prediction.options[stage.answer]).toBe(serving.mode ?? 'None serves: refused, or no room')
    }
  })

  test('mask: the card fits inside the fire on about half the in-band seeds and outlasts it on the rest', () => {
    let late = 0
    let total = 0
    for (const seed of SEEDS) {
      const stage = buildFullLevel('mask', seed).stages[0]
      if (!stageInBand(stage)) continue
      total += 1
      late += stage.answer
    }
    console.log(`mask: the card outlasts the fire on ${pct(late, total)} of ${total} in-band seeds`)
    expect(late / total).toBeGreaterThan(0.35)
    expect(late / total).toBeLessThan(0.65)
  })
})

describe('the worlds', () => {
  test('a stage is a function of its seed', () => {
    for (const id of FULL_LEVEL_IDS) expect(JSON.stringify(buildFullLevel(id, 7))).toBe(JSON.stringify(buildFullLevel(id, 7)))
  })

  test('the cards: 70B on H100 at the large tier\'s budget, the small model at the small tier\'s, on a rail of 12 clips', () => {
    const [big, small] = buildFullLevel('async', 0).stages
    expect([big.card, big.budget, big.slots, big.requests]).toEqual(['70b', 8192, 12, 24])
    expect([small.card, small.budget, small.slots]).toEqual(['small', 2048, 12])
  })

  test('a level that the full service does not have is refused', () => {
    expect(() => buildFullLevel('keys', 0)).toThrow('the full service has no level "keys"')
    expect(() => buildFullLevel('no-such-level', 0)).toThrow('the full service has no level "no-such-level"')
  })
})
