/*
 * R-T04: every level and stage of the five built games says what it is for, in the engine's words (REDESIGN §2.6 and §2.7, D-063).
 *
 *   - Each level, and each stage of the step loop's full levels, has a title and a goal line in three parts (the aim, what the learner
 *     controls, the number to beat or the pass rule) and an end condition. Its prediction's question and unit are in engine terms, and the
 *     pool's unit is the page.
 *   - Each graded level has a pass-rule sentence, and this file reads the bar from the level (or the session's grade, where the bar lives
 *     there) and finds the same number in the sentence; a practice level has none. A graded level's goal line states the same rule.
 *   - The titles are REDESIGN §2.7's defaults, word for word, except where a rewording against the level's rule is listed below.
 */
import { describe, expect, test } from 'bun:test'
import { GAMES } from '@es/play'
import type { GoalLine } from '@es/play'
import { BENCH_COPY } from '@es/play/broken-bench/copy'
import { INTERVAL_WIDTH_FACTOR, NUMBER_TOLERANCE_PERMILLE } from '@es/play/broken-bench/judge'
import { buildLevel as benchLevel, casesOf } from '@es/play/broken-bench/levels'
import { FLOOR_COPY } from '@es/play/engine-floor/copy'
import { buildLevel as floorLevel, MAP_LEVEL } from '@es/play/engine-floor/levels'
import { LOOP_COPY } from '@es/play/loop/copy'
import { BAR_PERMILLE } from '@es/play/loop/full/close'
import { FULL_COPY } from '@es/play/loop/full/copy'
import { buildFullLevel } from '@es/play/loop/full/levels'
import { POOL_COPY } from '@es/play/pool/copy'
import { buildLevel as poolLevel, GRADED as POOL_GRADED } from '@es/play/pool/levels'
import { VERIFIER_COPY } from '@es/play/verifier/copy'
import { buildLevel as verifierLevel } from '@es/play/verifier/levels'
import { verifierGrade } from '@es/play/verifier/session'
import { recipeTv, sweepOfLevel, tokensOf } from '@es/play/verifier/state'
import { GAMMA_MAX } from '@es/play/verifier/types'
import { findBanned } from '@/copy/banned'
import { read } from '../ci/support'
import { houseRun, stateAfter } from '../play/verifier-support'

interface LevelWords {
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  readonly passRule?: string
}

const COPIES: Readonly<Record<string, Readonly<Record<string, LevelWords>>>> = {
  loop: { ...LOOP_COPY, ...FULL_COPY },
  pool: POOL_COPY,
  verifier: VERIFIER_COPY,
  'engine-floor': FLOOR_COPY,
  'broken-bench': BENCH_COPY,
}

/** A goal line's three parts and its end: each a sentence, the end beginning "Ends". */
function expectGoal(where: string, goal: GoalLine): void {
  for (const part of ['aim', 'controls', 'beat', 'ends'] as const) {
    expect([where, part, goal[part].length > 10, /^[A-Z]/.test(goal[part]), goal[part].endsWith('.')]).toEqual([where, part, true, true, true])
  }
  expect([where, goal.controls.startsWith('You ')]).toEqual([where, true])
  expect([where, /^Ends /.test(goal.ends)]).toEqual([where, true])
  expect([where, /number to beat|Passes /.test(goal.beat)]).toEqual([where, true])
  expect([where, findBanned(Object.values(goal).join(' '))]).toEqual([where, []])
}

/**
 * The level titles that differ from REDESIGN §2.7's defaults, which the brief lets this task reword. Each is a shorter engine name for the
 * same rule, because the default ran past a 360 px screen where the old shell sets a title on one line: in the demo's "Next:" stub
 * (e2e/keyboard-loop.spec.ts), and in Broken benchmark's one row of levels beside its stages (e2e/broken-bench.spec.ts). The goal line and
 * the prompt carry the term the default named.
 */
const REWORDED: Readonly<Record<string, { readonly from: string; readonly title: string }>> = {
  'first-2-slot': { from: 'Refill a freed slot (continuous batching)', title: 'Refill a slot' },
  'first-3-gap': { from: 'The GPU waits: overlap the CPU work (async scheduling)', title: 'Close a bubble' },
  'first-4-par': { from: 'Both levers, against the reference', title: 'Both levers' },
  due: { from: 'Coordinated omission', title: 'From due time' },
  warm: { from: 'Where to cut the warm-up', title: 'Warm-up cut' },
  sure: { from: 'An interval on p99', title: 'p99 interval' },
  court: { from: 'Five mixed reports', title: 'Five reports' },
}

describe('every level and stage of the five built games', () => {
  test('has a title (the registry\'s) and a goal line with its three parts and an end', () => {
    for (const game of GAMES.games) {
      const copy = COPIES[game.id]
      for (const level of game.levels) {
        const words = copy[level.id]
        expect([game.id, level.id, words.title]).toEqual([game.id, level.id, level.title])
        expectGoal(`${game.id}/${level.id}`, words.goal)
      }
    }
  })

  test('each stage of the full levels has a title and a goal line too', () => {
    let stages = 0
    for (const [id, level] of Object.entries(FULL_COPY)) {
      const built = buildFullLevel(id, 0)
      for (const world of built.stages) {
        const stage = level.stages[world.id]
        expect([id, world.id, stage === undefined]).toEqual([id, world.id, false])
        if (stage === undefined) continue
        expect(stage.title.length).toBeGreaterThan(3)
        expectGoal(`loop/${id}/${world.id}`, stage.goal)
        stages += 1
      }
    }
    expect(stages).toBe(9)
  })

  test('asks its prediction in engine terms, with an engine unit; the pool counts pages', () => {
    const units = new Set<string>()
    for (const level of Object.values(POOL_COPY)) {
      expect(findBanned(level.predict.ask)).toEqual([])
      units.add(level.predict.unit)
    }
    expect([...units].sort()).toEqual(['KV groups', 'pages'])
    for (const level of Object.values(FULL_COPY)) {
      for (const stage of Object.values(level.stages)) {
        if (stage === undefined) continue
        const p = stage.prediction
        expect(findBanned([p.question, ...('options' in p ? p.options : [p.unit])].join(' '))).toEqual([])
        if ('unit' in p) expect(['µs', 'launches', 'steps', '%']).toContain(p.unit)
      }
    }
  })

  test("takes REDESIGN §2.7's default level titles, and rewords only the ones listed here", () => {
    const rows = read('docs/REDESIGN.md')
      .split('\n')
      .filter((line) => /^\| [^|]*\| `[a-z0-9-]+`( · `[a-z]+`)? \| [^|]+ \| [^|]+ \|$/.test(line))
    const defaults = new Map<string, string>()
    for (const row of rows) {
      const cells = row.split('|').slice(1, -1).map((cell) => cell.trim())
      if (cells[3] === 'unchanged') continue
      const [level, stage] = [...cells[1].matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1])
      defaults.set(stage === undefined ? level : `${level} · ${stage}`, cells[3])
    }
    const titles = new Map<string, string>()
    for (const [game, copy] of Object.entries(COPIES)) for (const [id, words] of Object.entries(copy)) if (game !== 'engine-floor' || defaults.has(id)) titles.set(id, words.title)
    for (const [id, level] of Object.entries(FULL_COPY)) for (const [stage, words] of Object.entries(level.stages)) if (defaults.has(`${id} · ${stage}`)) titles.set(`${id} · ${stage}`, words?.title ?? '')
    for (const [key, title] of defaults) expect([key, titles.get(key)]).toEqual([key, REWORDED[key]?.title ?? title])
    // Each rewording replaces the brief's own default, which the table still holds.
    for (const [key, { from }] of Object.entries(REWORDED)) expect([key, defaults.get(key)]).toEqual([key, from])
  })
})

describe('each graded level states its pass rule, with the bar the level computes', () => {
  test('a pass rule on every graded level and on no practice level, and the goal line states it', () => {
    for (const game of GAMES.games) {
      for (const level of game.levels) {
        const words = COPIES[game.id][level.id]
        expect([game.id, level.id, words.passRule !== undefined]).toEqual([game.id, level.id, level.graded])
        if (words.passRule !== undefined) expect([level.id, words.goal.beat]).toEqual([level.id, words.passRule])
      }
    }
  })

  test("KV page pool: the level's bar", () => {
    for (const id of POOL_GRADED) {
      const bar = poolLevel(id, 0).bar
      expect([id, POOL_COPY[id].passRule?.includes(` ${bar}.`)]).toEqual([id, true])
    }
  })

  test("Step loop's `close`: zero violations and the throughput bar of close.ts", () => {
    expect(FULL_COPY.close.passRule).toContain('zero dependency violations')
    expect(FULL_COPY.close.passRule).toContain(`at least ${BAR_PERMILLE / 10}% of the reference`)
  })

  test("Request path's `map`: the level's one run", () => {
    const attempts = floorLevel(MAP_LEVEL, 0).attempts
    expect(attempts).toBe(1)
    expect(FLOOR_COPY.map.passRule).toContain(`on your ${attempts} run`)
  })

  test("Broken benchmark: the cases a level needs, and the judge's tolerance and width", () => {
    for (const id of ['due', 'warm', 'sure', 'court'] as const) {
      const level = benchLevel(id, 0)
      const rule = BENCH_COPY[id].passRule
      const count = level.needed === casesOf(id) ? `the ${level.needed} case stands` : `at least ${level.needed} of the ${casesOf(id)} reports stand`
      expect([id, rule.includes(count)]).toEqual([id, true])
      expect([id, rule.includes(`within ${NUMBER_TOLERANCE_PERMILLE / 10}%`), rule.includes(`at most ${INTERVAL_WIDTH_FACTOR} times as wide`)]).toEqual([id, true, true])
    }
  })

  test("Rejection sampler: the bars its grade computes, read by playing them", () => {
    // `exact`: the reference's residual is at distance exactly 0, and that is the run that passes.
    const exact = houseRun('exact', 0)
    expect([verifierGrade(exact).ok, recipeTv(exact)?.num]).toEqual([true, 0n])
    expect(VERIFIER_COPY.exact.passRule).toContain('exactly 0')
    // `chain`: the widest relative miss that still passes, over predictions a thousandth apart, rounds to the sentence's per cent.
    const level = verifierLevel('chain', 1)
    const truth = Number(tokensOf(level).num) / Number(tokensOf(level).den)
    let widest = 0
    for (let p = Math.floor(truth * 950); p <= Math.ceil(truth * 1050); p++) {
      if (verifierGrade(stateAfter(level, { t: 'commit', prediction: p }, { t: 'submit' })).ok) widest = Math.max(widest, Math.abs(p / 1000 - truth) / truth)
    }
    expect(VERIFIER_COPY.chain.passRule).toContain(`within ${Math.round(widest * 100)}%`)
    // `gamma`: the best draft length passes and no other does, so the rule names no number but the best.
    const gamma = verifierLevel('gamma', 0)
    const { best } = sweepOfLevel(gamma)
    const passing = Array.from({ length: GAMMA_MAX }, (_, i) => i + 1).filter((k) => verifierGrade(stateAfter(gamma, { t: 'gamma', k }, { t: 'submit' })).ok)
    expect(passing).toEqual([best])
    expect(VERIFIER_COPY.gamma.passRule).toContain('the best speedup')
  })
})
