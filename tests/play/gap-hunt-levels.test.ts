/*
 * W2b-T100: the levels of Trace attribution, held to the trace model (`packages/sim/trace`).
 *
 *   - Every level is built on every seed, in chunks of 100: a practice run has one case and a graded one three, each from a step in the model's
 *     band, and the reference, played through the session's own reducer, passes it. The share of seeds the band keeps is measured and printed
 *     against GAMES.md §2.1's floor of 20%.
 *   - The reference's moves for a graded case are measured on 200 seeds: its marks stay at or under TR3's design bound of 12 (item 11).
 *   - Each graded level's best blind strategy is at or under the gate's bound, and three habits (always the first gap, always the same cause,
 *     the widest-looking span) are each measured on 50 fresh seeds, case by case and as a run of three.
 *   - A learner who reads the place of the largest gap and guesses its cause by habit is measured too and printed: it is no blind strategy (the
 *     place is the scene), and the design (item 7) names why the cause is asked beside the place.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { BLIND_BOUND, bandedSeeds } from '@es/play/blind'
import { ATTRIBUTE_SEEDS, CAUSE_HABITS, FIRST_SEED, GAP_SEEDS, habitCause, HUNT_BLIND } from '@es/play/gap-hunt/blind'
import { caseOf, MOST_MARKS } from '@es/play/gap-hunt/engine'
import { ghostActions, huntInit, huntReduce } from '@es/play/gap-hunt/session'
import { GAP_HUNT } from '@es/play/gap-hunt/entry'
import { checkBlind } from '../../scripts/verify-games'
import { attributeSteps, decoyUnderBusy } from '@es/sim/trace'
import type { HuntAction } from '@es/play/gap-hunt/types'
import { SEED_COUNT, seeds } from '../seeds'
import { LEVELS, S } from './gap-hunt-support'

setDefaultTimeout(120_000)

const SEEDS = seeds(1)

/*
 * The seeded properties below run as one test for each CHUNK of the seeds, not one test over all of them (the nightly run's 10,000 seeds are one
 * test over every seed otherwise). The timeout is the one every test has (above), and a test asserts that the chunks that ran are exactly SEEDS.
 */
const CHUNK = 100
const CHUNKS: readonly (readonly number[])[] = Array.from({ length: Math.ceil(SEEDS.length / CHUNK) }, (_, i) => SEEDS.slice(i * CHUNK, (i + 1) * CHUNK))
const rangeOf = (chunk: readonly number[]): string => `seeds ${chunk[0]} to ${chunk[chunk.length - 1]}`

test('the chunks of seeds are SEEDS, in order, each seed once', () => {
  expect(CHUNKS.flat()).toEqual(SEEDS)
  expect(CHUNKS.every((chunk) => chunk.length > 0 && chunk.length <= CHUNK)).toBe(true)
})

describe('every level is built on every seed, and its reference passes it through the session', () => {
  for (const id of LEVELS) {
    for (const chunk of CHUNKS) {
      test(`${id}: ${rangeOf(chunk)} are in band; the reference passes, a case is a graded run's three steps or a practice run's one`, () => {
        for (const seed of chunk) {
          expect([id, seed, S.inBand(id, seed)]).toEqual([id, seed, true])
          const level = S.level(id, seed)
          const want = (id === 'gap' || id === 'attribute') && seed !== 0 ? 3 : 1
          expect([id, seed, level.cases.length, level.needed]).toEqual([id, seed, want, want])
          const ghost = S.ghost(level)
          expect(S.done(ghost)).toBe(true)
          expect([id, seed, S.grade(ghost, ghost)]).toEqual([id, seed, { score: 1, ok: true }])
        }
      })
    }
  }

  test('the band keeps every seed that the gate reads: the share is far over the floor of 20%', () => {
    const first = Array.from({ length: 400 }, (_, i) => i)
    for (const id of LEVELS) {
      const kept = first.filter((seed) => S.inBand(id, seed)).length
      console.log(`${id}: ${kept} of the first ${first.length} seeds are in band (${((100 * kept) / first.length).toFixed(1)}%), against the floor of 20%`)
      expect(kept / first.length).toBeGreaterThanOrEqual(0.2)
    }
  })

  test('the same seed draws the same level, and a graded run draws three different steps', () => {
    for (const seed of [1000, 1001, 1002]) {
      expect(S.level('attribute', seed)).toEqual(S.level('attribute', seed))
      const keys = S.level('attribute', seed).cases.map((c) => `${c.seed}/${c.trace}/${c.step}`)
      expect(new Set(keys).size).toBe(3)
    }
  })
})

describe("the reference's moves on a graded case stay under the design's bound", () => {
  test(`on 200 seeds a graded case needs at most ${MOST_MARKS} marks of the reference's own, and the session's moves are counted`, () => {
    let most = 0
    let total = 0
    let cases = 0
    let moves = 0
    for (let seed = 1; seed <= 200; seed++) {
      for (const id of ['gap', 'attribute'] as const) {
        const level = S.level(id, seed)
        const actions = ghostActions(level)
        let at = 0
        const perCase: number[] = level.cases.map(() => 0)
        for (const a of actions) {
          if (a.t === 'mark') perCase[at]++
          if (a.t === 'submit') at++
        }
        for (const n of perCase) {
          expect(n).toBeLessThanOrEqual(MOST_MARKS)
          if (id === 'attribute') {
            most = Math.max(most, n)
            total += n
            cases++
          }
        }
        if (id === 'attribute') moves += actions.length
      }
    }
    console.log(`reference marks per graded attribute case over 200 seeds [synthetic, ${cases} cases]: most ${most}, mean ${(total / cases).toFixed(2)}; actions per graded run (3 cases): mean ${(moves / 200).toFixed(1)}`)
    expect(most).toBeLessThanOrEqual(MOST_MARKS)
  })

  test('the reference of `gap` marks only the gap, and the GPU-busy time arrives marked', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const level = S.level('gap', seed)
      level.cases.forEach((_, i) => {
        const start = huntInit(level).runs[i]
        expect(start.marks.every((m) => m.category === 'kernel' || m.category === 'copy')).toBe(true)
        expect(start.locked).toBe(start.marks.length)
      })
    }
  })

  test('graded and Prove `attribute` arrive with nothing marked, and practice `attribute` with the kernel spans', () => {
    for (const seed of [1000, 1001, 1002]) expect(huntInit(S.level('attribute', seed)).runs.every((r) => r.marks.length === 0)).toBe(true)
    const practice = huntInit(S.level('attribute', 0)).runs[0]
    expect(practice.marks.length).toBeGreaterThan(0)
    expect(practice.marks.every((m) => m.category === 'kernel')).toBe(true)
  })
})

describe("the band's own rules hold on the cases a graded level draws", () => {
  test('the largest gap is at least 1.5 times the second, the window is at least 10% non-kernel, and in at least half of graded cases a longer span lies under GPU-busy time', () => {
    let decoys = 0
    let cases = 0
    for (let seed = 1; seed <= 200; seed++) {
      const level = S.level('attribute', seed)
      level.cases.forEach((_, i) => {
        const c = caseOf(level, i)
        const a = attributeSteps(c.hunt.trace)[c.hunt.step]
        const lengths = a.gaps.map((g) => g.toNs - g.fromNs).sort((x, y) => y - x)
        expect(2 * lengths[0]).toBeGreaterThanOrEqual(3 * (lengths[1] ?? 0))
        expect(10 * (a.windowNs - a.kernelNs)).toBeGreaterThanOrEqual(a.windowNs)
        cases++
        if (decoyUnderBusy(c.hunt)) decoys++
      })
    }
    console.log(`graded attribute cases with a longer main-thread span under GPU-busy time: ${decoys} of ${cases} (${((100 * decoys) / cases).toFixed(1)}%)`)
    expect(decoys * 2).toBeGreaterThanOrEqual(cases)
  })
})

describe("each graded level's best blind strategy is at or under the gate's bound", () => {
  test('the gate reads the probes of both graded levels: the best passes at most the bound of single seeds', () => {
    const probes = { 'gap-hunt': HUNT_BLIND }
    const check = checkBlind(GAP_HUNT, S as never, probes['gap-hunt'])
    for (const line of check.lines) console.log(line)
    expect(check.problems).toEqual([])
    expect(check.lines).toHaveLength(2)
  })

  test('each probe reads at least the sample the gate needs, and no strategy passes more than the bound', () => {
    for (const [id, count] of [['gap', GAP_SEEDS], ['attribute', ATTRIBUTE_SEEDS]] as const) {
      const rows = HUNT_BLIND[id](S as never)
      expect(rows.length).toBeGreaterThan(5)
      for (const row of rows) {
        expect(row.of).toBe(count)
        expect([row.strategy, row.rate <= BLIND_BOUND]).toEqual([row.strategy, true])
      }
      const best = rows.reduce((top, row) => (row.rate > top.rate ? row : top))
      console.log(`${id}: ${rows.length} blind strategies, best ${(100 * best.rate).toFixed(1)}% of ${best.of} banded seeds (${best.strategy}); bound ${100 * BLIND_BOUND}%`)
    }
  })

  test('three habits on 50 fresh seeds each: a case at a time and a run of three, all at or under the bound', () => {
    const fresh = bandedSeeds(S, 'gap', 50, 5000)
    expect(fresh).toHaveLength(50)
    const rate = (place: 'first' | 'largest', cause: (typeof CAUSE_HABITS)[number]): { cases: number; runs: number } => {
      let casesPassed = 0
      let runsPassed = 0
      for (const seed of fresh) {
        const level = S.level('gap', seed)
        let state = huntInit(level)
        let ok = true
        level.cases.forEach((_, i) => {
          const c = caseOf(level, i)
          const gaps = attributeSteps(c.hunt.trace)[c.hunt.step].gaps
          const gap = place === 'first' ? gaps[0] : c.split.largestGap ?? gaps[0]
          const event = habitCause(c.hunt.trace, c, gap, cause)
          let passed = false
          try {
            for (const a of [
              { t: 'commit', prediction: 0 },
              { t: 'mark', from: gap.fromNs, to: gap.toNs, category: 'cpu-gap' },
              { t: 'cause', event },
              { t: 'submit' },
            ] as HuntAction[]) {
              state = huntReduce(state, a)
            }
            passed = state.runs[i].result?.passed === true
          } catch {
            passed = false
          }
          if (passed) casesPassed++
          else ok = false
        })
        if (ok) runsPassed++
      }
      return { cases: casesPassed / (fresh.length * 3), runs: runsPassed / fresh.length }
    }
    const named: [string, 'first' | 'largest', (typeof CAUSE_HABITS)[number]][] = [
      ['always the first gap, and the launch call as its cause', 'first', 'launch-call'],
      ['always the same cause: the first blocking call', 'first', 'blocking-call'],
      ['the widest-looking span of the main thread', 'first', 'widest-span'],
    ]
    for (const [name, place, cause] of named) {
      const r = rate(place, cause)
      console.log(`habit, ${name}: passes ${(100 * r.cases).toFixed(1)}% of cases and ${(100 * r.runs).toFixed(1)}% of 3-case runs, on 50 fresh seeds`)
      expect(r.runs).toBeLessThanOrEqual(BLIND_BOUND)
    }
    // Diagnostic, not a bound: the place of the largest gap is read from the scene; a learner who reads it and guesses the cause by habit.
    for (const cause of CAUSE_HABITS) {
      const r = rate('largest', cause)
      console.log(`diagnostic, the largest gap read and the cause by habit (${cause}): ${(100 * r.cases).toFixed(1)}% of cases, ${(100 * r.runs).toFixed(1)}% of 3-case runs`)
    }
  })

  test('the first seed of the blind sample is clear of the band seeds the gate reads, and the sample is banded', () => {
    expect(FIRST_SEED).toBeGreaterThanOrEqual(400)
    expect(bandedSeeds(S, 'gap', 30, FIRST_SEED)).toHaveLength(30)
  })

  test('the properties ran over the seed count of the suite', () => {
    expect(SEED_COUNT).toBeGreaterThanOrEqual(200)
  })
})
