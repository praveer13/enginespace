/*
 * W0-T16 acceptance check 1 and the levels' bands (GAMES.md §3.1, §3.2, D-043): requests placed into a tray of 4 slots [estimated] by
 * hand, refill, and an overlap switch, with the counters for useful tokens, ghost tokens, GPU-busy ticks and the clock against par.
 * On the practice seed neither refill alone nor overlap alone reaches par, and the `first-4-par` band's acceptance is measured here
 * and printed by `verify:games`, at least 20% of candidates [estimated floor, GAMES.md §2.1].
 *
 * Fairness is the other thing tested: a band makes each seed a fair question when the naive strategy visibly loses and the reference
 * passes. A visitor cannot see how long a table will stay, so the order they tap tickets in must not matter (engine.ts, `hang`), and
 * the tests below hold the pass mark between the best partial strategy and any play that uses both tools.
 *
 * Numbers measured while writing this file [measured 2026-11-04, on the working tree of W0-T16 above wave-0 at 4b473fc, Bun 1.3.14]:
 *   first-4-par: 159 of the first 400 seeds in band (39.8%); seed 1 is the first; par is 98 ticks, refill alone 141, overlap alone 162,
 *   firing the rail as a set 255, and the house has 12 binned plates;
 *   first-1-fill, first-2-slot and first-3-gap: 114 of 400 (28.5%), seed 1 the first;
 *   over the first 150 in-band seeds of first-4-par, with the tickets tapped in a seeded order: both tools score 1 on all of them,
 *   refill alone at most 0.714, overlap alone at most 0.854, neither at most 0.561.
 */
import { describe, expect, test } from 'bun:test'
import { applyAction, drawInBand, finishRun, levelOf, regrade, startRun, stateHash } from '@es/play'
import { LOOP } from '@es/play/loop/entry'
import { askOf, countersOf, hang, initState, levelDone, measured, setOverlap, step } from '@es/play/loop/engine'
import { LEVEL_IDS, PASS_SCORE, SLOTS, buildLevel, inParBand, levelTitle, services, simNight, frontPageWorkload } from '@es/play/loop/levels'
import { loopDebrief, loopGhost, loopGrade, loopInBand, loopLevel, loopSession, loopView } from '@es/play/loop/session'
import type { LoopLevelId, LoopState } from '@es/play/loop/types'
import { visitorNight } from './loop-support'

const CANDIDATES = 400
const inBandSeeds = (id: LoopLevelId, from = 0, count = CANDIDATES) => Array.from({ length: count }, (_, i) => from + i).filter((seed) => loopInBand(id, seed))

describe('the levels and their pinned practice seeds', () => {
  test('the registry lists the four front-page levels, with the titles and the practice seeds the session pins', () => {
    expect(LOOP.levels.map((level) => level.id)).toEqual([...LEVEL_IDS])
    for (const entry of LOOP.levels) {
      expect(entry.title, entry.id).toBe(levelTitle(entry.id as LoopLevelId))
      expect(entry.graded, entry.id).toBe(false)
    }
  })

  test('each practice seed is the first seed from 0 that the level\'s band accepts (GAMES.md §2.1)', () => {
    for (const entry of LOOP.levels) {
      const first = inBandSeeds(entry.id as LoopLevelId, 0, 64)[0]
      expect([entry.id, entry.practiceSeed]).toEqual([entry.id, first])
    }
  })

  test('a level that Service does not have is refused, and so is a seed that is not an unsigned 32-bit integer', () => {
    expect(() => loopLevel('async', 1)).toThrow('Service has no level "async"')
    expect(() => loopInBand('close', 1)).toThrow('Service has no level "close"')
    expect(() => loopLevel('first-1-fill', -1)).toThrow('a seed is an unsigned 32-bit integer')
    expect(() => loopLevel('constructor', 1)).toThrow('Service has no level')
  })

  test('the rail has 4 clips [estimated], and the burst has 12 tickets against 6 in the beats before it (D-043)', () => {
    expect(SLOTS).toBe(4)
    expect(buildLevel('first-1-fill', 1).outputs).toHaveLength(6)
    expect(buildLevel('first-3-gap', 1).outputs).toHaveLength(6)
    expect(buildLevel('first-4-par', 1).outputs).toHaveLength(12)
    expect(buildLevel('first-4-par', 1).slots).toBe(4)
  })
})

describe('the bands accept enough seeds', () => {
  test('first-4-par: at least 20% of the first 400 candidates [estimated floor], measured and printed here as verify:games prints it', () => {
    const accepted = inBandSeeds('first-4-par').length
    console.log(`first-4-par band: ${accepted} of ${CANDIDATES} candidates in band (${((accepted / CANDIDATES) * 100).toFixed(1)}%, floor 20%)`)
    expect(accepted / CANDIDATES).toBeGreaterThanOrEqual(0.2)
    expect(accepted).toBe(159)
  })

  test('the three beats before it: the same, on the shortest of the first four tables asking for 2 or 3 courses', () => {
    for (const id of ['first-1-fill', 'first-2-slot', 'first-3-gap'] as const) {
      const accepted = inBandSeeds(id).length
      expect([id, accepted / CANDIDATES >= 0.2]).toEqual([id, true])
      expect([id, accepted]).toEqual([id, 114])
    }
  })

  test('a seed is in band exactly when the sim\'s four services stand as GAMES.md §3.1 says', () => {
    for (let seed = 0; seed < CANDIDATES; seed++) {
      const s = services(seed)
      const par = s.par.summary.clockUs
      const by = [s.firedAsSet.summary.clockUs * 4 >= s.refillAlone.summary.clockUs * 5, s.refillAlone.summary.clockUs * 5 >= par * 7, s.overlapAlone.summary.clockUs * 20 >= par * 23, s.par.summary.ghostTokens >= 3]
      expect([seed, inParBand(s)]).toEqual([seed, by.every(Boolean)])
      expect([seed, loopInBand('first-4-par', seed)]).toEqual([seed, by.every(Boolean)])
    }
  })
})

describe('on the practice seed neither refill alone nor overlap alone reaches par', () => {
  const level = buildLevel('first-4-par', 1)
  const ghost = loopGhost(level)

  test('par is the reference\'s clock, and the sim gives the same four numbers: 255, 141, 162 and 98 ticks [estimated: synthetic]', () => {
    expect(level.par).toBe(98)
    expect(countersOf(ghost).clockUs).toBe(98)
    const s = services(1)
    expect([s.firedAsSet, s.refillAlone, s.overlapAlone, s.par].map((run) => run.summary.clockUs)).toEqual([255, 141, 162, 98])
    expect(s.par.summary.ghostTokens).toBe(12)
  })

  test('played by hand, each strategy lands exactly on the sim\'s number: neither tool is 255, refill alone 141, overlap alone 162, both 98', () => {
    const by = (refill: boolean, overlap: boolean) => countersOf(visitorNight(level, { refill, overlap })).clockUs
    expect([by(false, false), by(true, false), by(false, true), by(true, true)]).toEqual([255, 141, 162, 98])
    for (const [refill, overlap, batching, async] of [
      [false, false, 'static', false],
      [true, false, 'continuous', false],
      [false, true, 'static', true],
      [true, true, 'continuous', true],
    ] as const) {
      expect(countersOf(visitorNight(level, { refill, overlap })).clockUs).toBe(simNight(frontPageWorkload(1), batching, async).summary.clockUs)
    }
  })

  test('so neither tool alone passes, and both do, whichever order the tickets are tapped in', () => {
    const grade = (refill: boolean, overlap: boolean, order?: number) => loopGrade(visitorNight(level, { refill, overlap, order }), ghost)
    expect(grade(true, false).ok).toBe(false)
    expect(grade(false, true).ok).toBe(false)
    expect(grade(false, false).ok).toBe(false)
    expect(grade(true, false).score).toBeLessThan(PASS_SCORE)
    expect(grade(false, true).score).toBeLessThan(PASS_SCORE)
    for (const order of [1, 2, 3, 4, 5, 6, 7, 8]) expect(grade(true, true, order)).toEqual({ score: 1, ok: true })
  })

  test('the counters are the ones GAMES.md §3 names, in synthetic ticks: useful and ghost tokens, GPU-busy ticks, the clock against par', () => {
    const view = loopView(initState(level))
    expect(view.synthetic).toBe(true)
    expect(view.par).toBe(98)
    expect(Object.keys(view.counters).sort()).toEqual(
      ['bubbleUs', 'bubbles', 'clockUs', 'eagerSteps', 'emptyClipSteps', 'ghostTokens', 'gpuBusyUs', 'launches', 'paddedTokens', 'usefulTokens'].sort(),
    )
    const done = loopView(ghost)
    expect([done.counters.usefulTokens, done.counters.ghostTokens, done.counters.gpuBusyUs, done.counters.clockUs]).toEqual([65, 12, 95, 98])
  })
})

describe('the pass mark is fair across the band', () => {
  /** The first 150 in-band seeds [estimated: A§5.10 asks 200 on a PR; 150 keeps this file under a second]. */
  const seeds = inBandSeeds('first-4-par', 0, 700).slice(0, 150)

  const scores = (refill: boolean, overlap: boolean, ordered: boolean) =>
    seeds.map((seed) => {
      const level = buildLevel('first-4-par', seed)
      return loopGrade(visitorNight(level, { refill, overlap, order: ordered ? seed + 7 : undefined }), loopGhost(level)).score
    })

  test('both tools score 1 on every seed, in a seeded order of tickets, so doing everything right is never a matter of luck', () => {
    expect(seeds).toHaveLength(150)
    expect(Math.min(...scores(true, true, true))).toBe(1)
  })

  test('every play short of both tools scores under the pass mark, with room to spare: the naive strategy visibly loses', () => {
    const refillOnly = Math.max(...scores(true, false, true))
    const overlapOnly = Math.max(...scores(false, true, true))
    const neither = Math.max(...scores(false, false, true))
    console.log(`best partial strategies over ${seeds.length} in-band seeds: refill alone ${refillOnly.toFixed(3)}, overlap alone ${overlapOnly.toFixed(3)}, neither ${neither.toFixed(3)} (pass mark ${PASS_SCORE})`)
    expect(refillOnly).toBeLessThan(PASS_SCORE)
    expect(overlapOnly).toBeLessThan(PASS_SCORE)
    expect(neither).toBeLessThan(PASS_SCORE)
    // The band's own bound: overlap alone takes at least 1.15 times par, so it scores at most 1 / 1.15.
    expect(overlapOnly).toBeLessThanOrEqual(1 / 1.15 + 1e-9)
    expect(refillOnly).toBeLessThanOrEqual(1 / 1.4 + 1e-9)
  })
})

describe('the beats of First service, on the practice seed', () => {
  const play = (level: LoopLevelId, actions: (s: LoopState) => LoopState) => actions(initState(buildLevel(level, 1)))
  const fill = (s: LoopState, count: number) => {
    let state = s
    for (let i = 0; i < count; i++) state = hang(state, state.waiting[0])
    return state
  }

  test('beat 1: hang the tickets, ring the bell, and one fire ends the level; four hung is the reference, fewer scores less', () => {
    const level = buildLevel('first-1-fill', 1)
    const ghost = loopGhost(level)
    expect(countersOf(ghost).usefulTokens).toBe(4)
    for (const hung of [4, 3, 1]) {
      const s = step(fill(initState(level), hung))
      expect(levelDone(s), `hung ${hung}`).toBe(true)
      expect(loopGrade(s, ghost).score, `hung ${hung}`).toBe(hung / 4)
      expect(loopGrade(s, ghost).ok, `hung ${hung}`).toBe(hung === 4)
      expect(countersOf(s).emptyClipSteps).toBe(4 - hung)
    }
    expect(() => step(initState(level))).toThrow('nothing is hung')
  })

  test('beat 2: the loop runs until a ticket ends, its clip opens and the loop waits; refilling is the reference, ringing past it scores less', () => {
    const level = buildLevel('first-2-slot', 1)
    const ghost = loopGhost(level)
    let s = initState(level)
    expect(askOf(s)).toBeNull()
    s = step(s)
    expect(askOf(s)).toBeNull()
    s = step(s)
    // Two tickets asked for 3 courses and have ended: two clips are open and two tickets wait.
    expect(askOf(s)).toEqual({ free: [1, 2], waiting: [4, 5] })
    expect(levelDone(s)).toBe(false)
    const refilled = step(fill(s, 2))
    expect(levelDone(refilled)).toBe(true)
    expect(loopGrade(refilled, ghost)).toEqual({ score: 1, ok: true })
    // Ringing the bell past the open clips leaves two empty places in the fire: half of the house's, and the debrief names the refill.
    const left = step(fill(s, 0))
    expect(levelDone(left)).toBe(true)
    expect(loopGrade(left, ghost)).toEqual({ score: 0.5, ok: false })
    expect(loopDebrief(left, ghost).names).toEqual({ lever: 'batching' })
    // Hanging one of the two tickets scores three places of four, which is still short.
    const half = step(fill(s, 1))
    expect(loopGrade(half, ghost)).toEqual({ score: 0.75, ok: false })
    expect(loopDebrief(refilled, ghost).names).toBeNull()
  })

  test('beat 3: dark stretches of 3 ticks beside every fire; overlap closes them, and at the next end a plate is binned and the level ends', () => {
    const level = buildLevel('first-3-gap', 1)
    const ghost = loopGhost(level)
    const s0 = initState(level)
    expect(measured(s0).steps.map((fire) => fire.bubbleUs)).toEqual([0, 3])
    expect(loopView(s0).overlapAvailable).toBe(true)
    let s = setOverlap(s0, true)
    const seen: number[] = []
    while (!levelDone(s)) {
      s = step(s)
      seen.push(countersOf(s).ghostTokens)
    }
    // A binned plate appears at the third ring after the switch, and it is the first thing that ends the level.
    expect(seen).toEqual([0, 0, 2])
    // Dark stretches: 3 ticks before the second fire as before, 3 more while the pipeline fills, and then none: the line lights end to end.
    expect(measured(s).steps.map((fire) => fire.bubbleUs)).toEqual([0, 3, 3, 0, 0])
    expect(loopGrade(s, ghost)).toEqual({ score: 1, ok: true })
    expect(loopDebrief(s, ghost).names).toBeNull()
    // Never turning it on: the level runs to the last ticket instead, and names the lever.
    let late = s0
    while (!levelDone(late)) {
      for (let a = askOf(late); a !== null; a = askOf(late)) late = hang(late, a.waiting[0])
      late = step(late)
    }
    expect(countersOf(late).ghostTokens).toBe(0)
    expect(loopGrade(late, ghost).ok).toBe(false)
    expect(loopGrade(late, ghost).score).toBeLessThan(PASS_SCORE)
    expect(loopDebrief(late, ghost).names).toEqual({ lever: 'async' })
  })

  test('beat 4: serving every ticket ends the level; the debrief names the lever the run left on the table', () => {
    const level = buildLevel('first-4-par', 1)
    const ghost = loopGhost(level)
    const only = (refill: boolean, overlap: boolean) => loopDebrief(visitorNight(level, { refill, overlap }), ghost)
    expect(only(true, true).names).toBeNull()
    // Without overlap the stations sat dark: the lever is overlap. Without refilling, with overlap on, clips sat empty: the lever is the refill.
    expect(only(true, false).names).toEqual({ lever: 'async' })
    expect(only(false, true).names).toEqual({ lever: 'batching' })
    expect(only(true, true).sentence).toContain('par')
  })

  test('the debrief\'s sentences carry no digit, so no number goes untagged: the counters beside them are Readouts', () => {
    const sentences: string[] = []
    for (const id of LEVEL_IDS) {
      const level = buildLevel(id, 1)
      const ghost = loopGhost(level)
      const mine = [ghost, initState(level)].flatMap((s) => {
        let state = s
        while (!levelDone(state)) {
          if (hungCountOf(state) === 0) state = fill(state, 1)
          state = step(state)
        }
        return [state]
      })
      for (const state of mine) sentences.push(loopDebrief(state, ghost).sentence)
    }
    expect(sentences.length).toBeGreaterThan(4)
    for (const sentence of sentences) expect(sentence).not.toMatch(/\d/)
    for (const id of LEVEL_IDS) expect(`${buildLevel(id, 1).title} ${buildLevel(id, 1).prompt}`).not.toMatch(/\d/)
  })

  test('play(...) helpers are inert: a level\'s first state does not move when another is built', () => {
    expect(stateHash(play('first-3-gap', (s) => s))).toBe(stateHash(initState(buildLevel('first-3-gap', 1))))
  })
})

/** Tickets on the rail. */
const hungCountOf = (s: LoopState): number => s.tray.filter((req) => req !== null).length

describe('a run on the framework: the log is the record, and an edited score changes nothing', () => {
  test('a recorded run regrades to the same score, and the score stored beside it is only compared', () => {
    let run = startRun(loopSession, { game: 'loop', level: 'first-1-fill', seed: 1 })
    for (const action of [{ t: 'admit', req: 0 }, { t: 'admit', req: 1 }, { t: 'admit', req: 2 }, { t: 'run', until: 'step' }] as const) run = applyAction(loopSession, run, action)
    const finished = finishRun(loopSession, run)
    expect(finished?.grade).toEqual({ score: 0.75, ok: false })
    const graded = regrade(loopSession, { ...run.record, score: 1, ok: true })
    expect(graded.valid && graded.grade).toEqual({ score: 0.75, ok: false })
    expect(graded.valid && graded.storedMatches).toBe(false)
    expect(() => applyAction(loopSession, run, { t: 'run', until: 'step' })).toThrow('the run is over')
  })

  test('New numbers: drawInBand finds an in-band seed for the burst from any entropy, and the level builds on it', () => {
    for (const entropy of [0, 1, 2, 12345, 4294967295, 987654321]) {
      const seed = drawInBand(loopSession, 'first-4-par', entropy)
      expect(loopInBand('first-4-par', seed)).toBe(true)
      expect(buildLevel('first-4-par', seed).par).toBe(services(seed).par.summary.clockUs)
    }
    expect(levelOf(LOOP, 'first-4-par')?.practiceSeed).toBe(1)
  })
})
