/*
 * W1b-T12: `verify:games` measures ASSESSMENT §4.1's blind-strategy bound for every graded level, and reads the full service's views.
 *
 * Each game's own tests have held its graded levels to the bound since W1 (tests/play/loop-close.test.ts, pool-levels.test.ts,
 * verifier-levels.test.ts, engine-floor-map.test.ts and broken-bench-levels.test.ts), and the gate did not (W1 report §8.2). The gate
 * is `checkBlind`, over the probes in `packages/play/<game>/blind.ts`, and these tests hold it to what the task asks:
 *
 *   - the bound is ASSESSMENT's, and a graded level with no probe, or a probe with no graded level, is a finding;
 *   - the gate prints each graded level's best blind strategy against the bound, and fails a level over it, at the bound's edge too;
 *   - a mutation makes a level guessable, in each of the five games, and the gate fails it: a world that the seed no longer changes, a
 *     bar that every run meets, a court of five fair inspections;
 *   - the full service's shell is read, for the views it must render, as `Game.tsx`'s are.
 *
 * The probes' full-size rates are in the output of `bun scripts/verify-games.ts`, which the last tests of tests/play/games-gate.test.ts run.
 * The mutations read a small sample of a session that has been made easy on purpose, so they are quick.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import path from 'node:path'
import { GAMES, stateHash } from '@es/play'
import type { AnySession, GameEntry } from '@es/play'
import { BLIND_BOUND, bandedSeeds, typed } from '@es/play/blind'
import type { BlindProbe, BlindProbes, BlindRow } from '@es/play/blind'
import { BLIND_POLICIES, nightUnder } from '@es/play/pool/blind'
import { BLIND_BOUND as ITEMS_BLIND_BOUND } from '@es/play/items/blind'
import { advance, applyAction, freeze, freshWork, peek } from '@es/play/pool/engine'
import { poolSession } from '@es/play/pool/session'
import type { PoolAction, PoolLevel, PoolState } from '@es/play/pool/types'
import { BLIND_PROBES, MIN_BLIND_SAMPLE, checkBlind, checkFiles, checkGames, checkShell, filesAt, lazyShells, measureAside, measuredBy, readGameSource } from '../../scripts/verify-games'
import { between, read } from '../ci/support'
import { GAME_TSX, TOY, memoryFiles, toyFiles, toySession } from './support'
import type { ToyAction, ToyLevel, ToyState } from './support'

// A mutation plays a few hundred seeds of a real game's session, which is seconds, and several on a loaded host.
setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')

/* ------------------------------------------------------------------------------------------------------------------ */
/* The toy                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

type ToySession = ReturnType<typeof typed<ToyLevel, ToyState, ToyAction>>

/** A toy probe: each strategy adds the same number every time until the pile is full, and the session's grade says whether it passed. */
function toyProbe(adds: readonly number[], seeds = 120): BlindProbe {
  return (session) => {
    const play: ToySession = typed<ToyLevel, ToyState, ToyAction>(session)
    const banded = bandedSeeds(session, 'pile', seeds)
    return adds.map((n): BlindRow => {
      let passed = 0
      for (const seed of banded) {
        const level = play.level('pile', seed)
        let state = play.init(level)
        while (!play.done(state)) state = play.reduce(state, { t: 'add', n })
        if (play.grade(state, play.ghost(level)).ok) passed += 1
      }
      return { strategy: `add-${n}`, describe: `always add ${n}`, rate: passed / banded.length, of: banded.length }
    })
  }
}

/** The toy session with its pile's target fixed at six, whatever the seed: the level a constant answer wins. */
const sixes: AnySession = { ...toySession, level: (id, seed) => ({ ...toySession.level(id, seed), target: 6 }) } as AnySession

/** A probe that says what it is told. */
const saying = (rows: readonly BlindRow[]): BlindProbe => () => [...rows]
const row = (rate: number, of = 100, strategy = 'always'): BlindRow => ({ strategy, describe: `says ${strategy}`, rate, of })

describe('the bound', () => {
  test('is the 15% of ASSESSMENT §4.1 [estimated], the one that verify:items holds, and it is a number the document says', () => {
    const section = between(read('docs/ASSESSMENT.md'), '### 4.1 Seeds, bands and blind strategies', '### 4.2')
    expect(section).toContain('must pass a single seed at most 15% of the time')
    expect(BLIND_BOUND).toBe(0.15)
    expect(ITEMS_BLIND_BOUND).toBe(BLIND_BOUND)
    // And ASSESSMENT §13 and A§10.2 both give `verify:games` the check.
    expect(section).toContain('`verify:items` and `verify:games` measure it and fail the build above the bound')
  })
})

describe('checkBlind, on the toy game', () => {
  test('prints the best strategy of a graded level against the bound, and has nothing to fail while it is under', () => {
    const checked = checkBlind(TOY, toySession, { pile: toyProbe([1]) })
    expect(checked.problems).toEqual([])
    expect(checked.lines).toHaveLength(1)
    expect(checked.lines[0]).toMatch(/^pile: best blind strategy passes 0\.0% of 120 banded seeds, against the bound of 15\.0% \[estimated\] \(1 tried\): always add 1$/)
  })

  test('fails a level whose best strategy is over it, and names the level, the strategy, the rate and the bound', () => {
    // Adding three every time is the reference's own play on a pile of six or nine, which are two of the six targets the band accepts.
    const checked = checkBlind(TOY, toySession, { pile: toyProbe([1, 3]) })
    expect(checked.problems).toHaveLength(1)
    expect(checked.problems[0]).toMatch(/^level pile: the best scene-blind strategy passes \d+\.\d% of 120 banded seeds, over ASSESSMENT §4\.1's bound of 15\.0% \[estimated\]: always add 3\./)
    expect(checked.lines[0]).toContain('(2 tried): always add 3')
  })

  test('picks the best of the strategies a probe tried, whatever their order', () => {
    for (const rates of [[0.01, 0.14, 0.02], [0.14, 0.02, 0.01], [0.02, 0.01, 0.14]]) {
      const checked = checkBlind(TOY, toySession, { pile: saying(rates.map((rate, at) => row(rate, 100, `s${at}`))) })
      expect(checked.problems).toEqual([])
      expect(checked.lines[0]).toContain('passes 14.0% of 100 banded seeds')
    }
  })

  test('holds at the bound and fails above it: 15% of a thousand seeds passes, and 151 of them does not', () => {
    expect(checkBlind(TOY, toySession, { pile: saying([row(150 / 1000, 1000)]) }).problems).toEqual([])
    expect(checkBlind(TOY, toySession, { pile: saying([row(151 / 1000, 1000)]) }).problems).toEqual([expect.stringContaining('passes 15.1% of 1000 banded seeds, over ASSESSMENT §4.1')])
  })

  test('fails a graded level that has no probe, and says where to add one; a game with no probes at all fails it too', () => {
    for (const probes of [{}, undefined]) {
      expect(checkBlind(TOY, toySession, probes).problems).toEqual([
        'level pile: it is graded and has no blind-strategy probe (ASSESSMENT §4.1): add one to packages/play/toy/blind.ts, and to BLIND_PROBES in scripts/games/blind.ts',
      ])
    }
  })

  test('leaves a level that is not graded alone, and fails a probe for a level that is not graded', () => {
    const practice = { ...TOY, levels: [{ ...TOY.levels[0], graded: false }] }
    expect(checkBlind(practice, toySession, {})).toEqual({ problems: [], lines: [] })
    expect(checkBlind(practice, toySession, { pile: saying([row(0)]) }).problems).toEqual([expect.stringContaining('level pile: it has a blind-strategy probe and is not a graded level')])
    expect(checkBlind(TOY, toySession, { pile: saying([row(0)]), ghost: saying([row(0)]) }).problems).toEqual([expect.stringContaining('level ghost: it has a blind-strategy probe and is not a graded level')])
  })

  test('is a finding, and not a crash, when a probe throws, tries nothing, or reads too few seeds or a rate that is not one', () => {
    const throws: BlindProbe = () => {
      throw new Error('no such night')
    }
    expect(checkBlind(TOY, toySession, { pile: throws }).problems).toEqual(['level pile: its blind-strategy probe threw: no such night'])
    expect(checkBlind(TOY, toySession, { pile: saying([]) }).problems).toEqual(['level pile: its blind-strategy probe tried no strategy'])
    for (const bad of [row(0, MIN_BLIND_SAMPLE - 1), row(Number.NaN), row(-0.1), row(1.5)]) {
      expect(checkBlind(TOY, toySession, { pile: saying([row(0.01, 500), bad]) }).problems).toEqual([expect.stringContaining('level pile: the blind-strategy probe read always on')])
    }
    expect(checkBlind(TOY, toySession, { pile: saying([row(0, MIN_BLIND_SAMPLE)]) }).problems).toEqual([])
  })

  test('is told a band that finds too few seeds to measure: bandedSeeds gives what it found, and the gate says it is too few', () => {
    const narrow = { ...toySession, inBand: (_id: string, seed: number) => seed === 5 || seed === 9 }
    expect(bandedSeeds(narrow, 'pile', 20)).toEqual([5, 9])
    expect(bandedSeeds(toySession, 'pile', 7, 100)).toHaveLength(7)
    expect(bandedSeeds(toySession, 'pile', 7, 100)[0]).toBeGreaterThanOrEqual(100)
    const checked = checkBlind(TOY, narrow, { pile: toyProbe([1], 20) })
    expect(checked.problems).toEqual([expect.stringContaining('at least 30 seeds that the band accepts')])
  })
})

describe('a mutation makes the toy guessable, and the gate fails it', () => {
  test('with the target fixed, always adding three wins every seed, and the gate says so', () => {
    expect(checkBlind(TOY, toySession, { pile: toyProbe([3], 60) }).problems).toHaveLength(1)
    const checked = checkBlind(TOY, sixes, { pile: toyProbe([3], 60) })
    expect(checked.problems).toEqual([expect.stringMatching(/^level pile: the best scene-blind strategy passes 100\.0% of 60 banded seeds, over ASSESSMENT §4\.1's bound of 15\.0%/)])
  })

  test('through checkGames: attributed to the game, printed with the level, and left out when the gate is not given a way to measure', async () => {
    const input = { games: [TOY], componentIds: ['toy'], files: memoryFiles(toyFiles()), world: {} }
    const under = await checkGames({ ...input, blind: measuredBy({ toy: { pile: toyProbe([1], 60) } }) })
    expect(under.findings).toEqual([])
    expect(under.lines.get('toy')?.some((line) => line.startsWith('pile: best blind strategy passes 0.0% of 60 banded seeds'))).toBe(true)

    const over = await checkGames({ ...input, games: [{ ...TOY, session: async () => sixes }], blind: measuredBy({ toy: { pile: toyProbe([3], 60) } }) })
    expect(over.findings.map((finding) => finding.game)).toEqual(['toy'])
    expect(over.findings[0].message).toContain('level pile: the best scene-blind strategy passes 100.0%')

    const none = await checkGames({ ...input, games: [{ ...TOY, session: async () => sixes }] })
    expect(none.findings).toEqual([])
    expect(none.lines.get('toy')?.some((line) => line.includes('blind'))).toBe(false)

    const missing = await checkGames({ ...input, blind: measuredBy({}) })
    expect(missing.findings).toEqual([{ game: 'toy', message: expect.stringContaining('level pile: it is graded and has no blind-strategy probe') }])
  })
})

describe('a game measured in a process of its own, as the command line does', () => {
  test('is a finding for each graded level, and not a pass, when the process ends without a result', async () => {
    // A game that is not registered: the runner says so and ends with status 2.
    const lost = await measureAside({ ...TOY, id: 'ghost-town' })
    expect(lost.lines).toEqual([])
    expect(lost.problems).toEqual([
      expect.stringMatching(/^level pile: the blind-strategy bound was not measured: the process for ghost-town ended with status 2 and no result\. blind-run: no game "ghost-town" is registered$/),
    ])
    // A game with no graded level has nothing to lose.
    const practice = await measureAside({ ...TOY, id: 'ghost-town', levels: [{ ...TOY.levels[0], graded: false }] })
    expect(practice.problems).toEqual([])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The five games                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const gradedOf = (entry: GameEntry): string[] => entry.levels.filter((level) => level.graded).map((level) => level.id)

describe('the probes of the five games', () => {
  test('cover the graded levels of every registered game, and no other level', () => {
    expect(GAMES.games.map((game) => game.id).sort()).toEqual(Object.keys(BLIND_PROBES).sort())
    for (const game of GAMES.games) expect([game.id, Object.keys(BLIND_PROBES[game.id] ?? {}).sort()]).toEqual([game.id, gradedOf(game).sort()])
    // Twelve graded levels: close; exact, chain, gamma; map; due, warm, sure, court; evict, adapters, manager.
    expect(GAMES.games.flatMap(gradedOf)).toHaveLength(12)
  })

  test('are told apart from the practice levels: the gate holds a game to the levels its entry grades', () => {
    for (const game of GAMES.games) {
      const practice = game.levels.filter((level) => !level.graded).map((level) => level.id)
      for (const id of practice) expect([game.id, id, id in (BLIND_PROBES[game.id] ?? {})]).toEqual([game.id, id, false])
    }
  })
})

/** The sessions of the five games, with a level made easy in the way that suits it. */
type Mutation = (session: AnySession) => AnySession

/** The seed no longer draws a world: every seed deals the world of seed 0, so one answer is right every time. */
const frozen: Mutation = (session) => ({ ...session, level: (id) => session.level(id, 0) })

/** The bar is met by any run that is over: a pass is no longer earned. */
const easy: Mutation = (session) => ({ ...session, grade: () => ({ score: 1, ok: true }) })

/** A court that deals only fair inspections: naming no flaw is right every time. */
const fair: Mutation = (session) => ({
  ...session,
  level: (id, seed) => {
    const level = session.level(id, seed) as { slots: readonly object[] }
    return { ...level, slots: level.slots.map((slot) => ({ ...slot, flaw: 'none' })) }
  },
})

describe('a mutation makes a graded level guessable, and the gate fails it', () => {
  // [game, level, the mutation, the seeds read]: the samples are small, because a level made easy on purpose is not close to the bound.
  const cases: readonly [string, string, string, Mutation, number][] = [
    ['loop', 'close', 'every run meets the bar', easy, 40],
    ['verifier', 'exact', 'every seed deals one pair', frozen, 60],
    ['verifier', 'chain', 'every seed deals one run', frozen, 120],
    ['verifier', 'gamma', 'every seed deals one acceptance curve', frozen, 300],
    ['engine-floor', 'map', 'every seed deals one request', frozen, 300],
    ['broken-bench', 'due', 'every seed deals one case', frozen, 60],
    ['broken-bench', 'warm', 'every seed deals one case', frozen, 60],
    ['broken-bench', 'sure', 'every seed deals one case', frozen, 60],
    ['broken-bench', 'court', 'a court of five fair inspections', fair, 60],
    ['pool', 'evict', 'every run meets the bar', easy, 40],
    ['pool', 'adapters', 'every run meets the bar', easy, 40],
    ['pool', 'manager', 'every run meets the bar', easy, 40],
  ]

  for (const [game, level, what, mutation, seeds] of cases) {
    test(`${game}/${level}: ${what}`, async () => {
      const entry = GAMES.get(game)
      expect(entry).toBeDefined()
      const session = await (entry as GameEntry).session()
      const probe = BLIND_PROBES[game][level]
      const reduced: BlindProbes = { [level]: (s) => probe(s, seeds) }

      // The game as built, on the same sample, is nowhere near a guessable level: it is the mutation that the gate sees.
      const built = Math.max(...probe(session, seeds).map((blind) => blind.rate))
      expect(built).toBeLessThan(0.5)

      // The entry with this one level: the gate would otherwise ask for the probes of the game's other graded levels.
      const alone: GameEntry = { ...(entry as GameEntry), levels: (entry as GameEntry).levels.filter((candidate) => candidate.id === level) }
      const mutated = checkBlind(alone, mutation(session), reduced)
      const caught = mutated.problems.filter((problem) => problem.startsWith(`level ${level}: the best scene-blind strategy passes `))
      expect(mutated.problems).toEqual(caught)
      expect(caught).toHaveLength(1)
      expect(caught[0]).toMatch(/over ASSESSMENT §4\.1's bound of 15\.0% \[estimated\]/)
      const rate = Number(/passes (\d+\.\d)%/.exec(caught[0])?.[1])
      expect(rate).toBeGreaterThan(90)
      expect(mutated.lines).toHaveLength(1)
    })
  }
})

describe('the pool probe plays a night by the engine\'s loop, which is the session\'s reducer applied once for each ask', () => {
  const GRADED_POOL = ['evict', 'adapters', 'manager'] as const

  test('ends every strategy in the state that the session reaches by taking the same actions one at a time', () => {
    for (const id of GRADED_POOL) {
      const seed = bandedSeeds(poolSession, id, 1, 1000)[0]
      const level: PoolLevel = poolSession.level(id, seed)
      const ghost = poolSession.ghost(level)
      for (const blind of BLIND_POLICIES) {
        // The session's own loop: ask, answer from what the state shows, reduce.
        let state: PoolState = poolSession.init(level)
        while (!poolSession.done(state)) {
          const ask = poolSession.ask(state)
          if (ask === null) throw new Error('the night is not over, and nothing is asked')
          const action: PoolAction = blind.policy(peek(state), ask)
          state = poolSession.reduce(state, action)
        }
        const bulk = nightUnder(level, blind.policy)
        expect([id, blind.id, poolSession.grade(bulk, ghost)]).toEqual([id, blind.id, poolSession.grade(state, ghost)])
        expect([id, blind.id, bulk.counts]).toEqual([id, blind.id, state.counts])
      }
    }
  })

  test('is thirty-six strategies, each with an id of its own, and a night is the same however it is reached', () => {
    expect(BLIND_POLICIES).toHaveLength(36)
    expect(new Set(BLIND_POLICIES.map((blind) => blind.id)).size).toBe(36)
    const level = poolSession.level('manager', bandedSeeds(poolSession, 'manager', 1, 1000)[0])
    const policy = BLIND_POLICIES[0].policy
    expect(stateHash(nightUnder(level, policy))).toBe(stateHash(nightUnder(level, policy)))
    // And a work played by hand with the engine's own functions is the same night.
    const work = freshWork(level, true)
    advance(work)
    while (!work.done) {
      if (work.ask === null) throw new Error('the night is not over, and nothing is asked')
      applyAction(work, policy(work, work.ask))
      advance(work)
    }
    expect(stateHash(freeze(work))).toBe(stateHash(nightUnder(level, policy)))
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The full service                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('a game\'s own shell, loaded on demand by Game.tsx, is read for its views', () => {
  /** A full service as a game writes it: its own shell, with a view of each kind named for it, in a folder of its own. */
  const SHELL = `import { lazy } from 'react'
import { GameShell } from '@/games/kit/GameShell'
import { FullControls } from './full/FullControls'
import { FullDebrief } from './full/FullDebrief'
import { FullMirror } from './full/FullMirror'
import { FullView2D } from './full/FullView2D'
const Scene3D = lazy(() => import('./Scene3D'))

export default function FullService() {
  return (
    <GameShell
      view2d={(run) => <FullView2D run={run} />}
      scene3d={(run) => <Scene3D run={run} />}
      controls={(run) => <FullControls run={run} />}
      mirror={(run) => <FullMirror run={run} />}
      debrief={(run, outcome) => <FullDebrief run={run} outcome={outcome} />}
    />
  )
}
`
  const GAME_WITH_FULL = GAME_TSX.replace("const Scene3D = lazy(() => import('./Scene3D'))", "const Scene3D = lazy(() => import('./Scene3D'))\nconst FullService = lazy(() => import('./FullService'))") + '\nexport const Full = FullService\n'
  const part = (name: string) => `export function ${name}() {\n  return null\n}\n`
  const folder = 'src/games/toy'
  const SCENE = 'export default function Scene3D() { return null }\n'

  /** The toy with a full service: a shell file and the four views it renders. */
  function withFull(extra: Record<string, string> = {}, drop: string[] = []): Map<string, string> {
    const files = toyFiles({
      [`${folder}/Game.tsx`]: GAME_WITH_FULL,
      [`${folder}/Scene3D.tsx`]: SCENE,
      [`${folder}/FullService.tsx`]: SHELL,
      [`${folder}/full/FullControls.tsx`]: part('FullControls'),
      [`${folder}/full/FullDebrief.tsx`]: part('FullDebrief'),
      [`${folder}/full/FullMirror.tsx`]: part('FullMirror'),
      [`${folder}/full/FullView2D.tsx`]: part('FullView2D'),
      ...extra,
    })
    for (const name of drop) files.delete(name)
    return files
  }
  const toy3d: GameEntry = { ...TOY, has3d: true }
  const problems = (files: Map<string, string>): string[] => checkFiles(toy3d, memoryFiles(files))

  test('reads where each name a file renders is imported from: by default, by name and as a namespace, and never from a type', () => {
    const source = readGameSource(
      'Shell.tsx',
      [
        "import Default from './Default'",
        "import { Named, other as Renamed, type OnlyType } from './named'",
        "import * as Space from './space'",
        "import type { Props } from './props'",
        "import './side-effect.css'",
        'export const x = <Default />',
      ].join('\n'),
    )
    expect(Object.fromEntries(source.importedFrom)).toEqual({ Default: './Default', Named: './named', Renamed: './named', Space: './space' })
    expect(source.staticImports).toEqual(['./Default', './named', './space', './side-effect.css'])
  })

  test('finds the shell that Game.tsx loads, and no part that is not one', () => {
    expect(lazyShells(toy3d, memoryFiles(withFull()))).toEqual([`${folder}/FullService.tsx`])
    // The scene is loaded on demand too, and a scene is not a shell.
    expect(lazyShells(toy3d, memoryFiles(toyFiles({ [`${folder}/Scene3D.tsx`]: SCENE })))).toEqual([])
    expect(lazyShells(TOY, memoryFiles(toyFiles()))).toEqual([])
    expect(lazyShells({ ...TOY, id: 'nowhere' }, memoryFiles(toyFiles()))).toEqual([])
  })

  test('has nothing to say about a full service that renders its four views and its scene', () => {
    expect(problems(withFull())).toEqual([])
    expect(checkShell(toy3d, `${folder}/FullService.tsx`, memoryFiles(withFull()))).toEqual([])
  })

  test('names a view that the shell never renders: the 2D view, the mirror, the controls, the debrief, and the scene', () => {
    const without = (tag: string) => withFull({ [`${folder}/FullService.tsx`]: SHELL.replace(`<${tag} `, '<span ') })
    expect(problems(without('FullView2D'))).toEqual([`${folder}/FullService.tsx never renders a View2D of its own: a component whose name ends in View2D`])
    expect(problems(without('FullMirror'))).toEqual([`${folder}/FullService.tsx never renders a Mirror of its own: a component whose name ends in Mirror`])
    expect(problems(without('FullControls'))).toEqual([`${folder}/FullService.tsx never renders a Controls of its own: a component whose name ends in Controls`])
    expect(problems(without('FullDebrief'))).toEqual([`${folder}/FullService.tsx never renders a Debrief of its own: a component whose name ends in Debrief`])
    expect(problems(withFull({ [`${folder}/FullService.tsx`]: SHELL.replace('<Scene3D ', '<span ') }))).toEqual([`${folder}/FullService.tsx never renders <Scene3D>`])
  })

  test('names a view whose file is gone, a shell with no default export, and a scene imported statically', () => {
    expect(problems(withFull({}, [`${folder}/full/FullMirror.tsx`]))).toEqual([`${folder}/FullService.tsx renders <FullMirror>, and its file is missing: ./full/FullMirror`])
    expect(problems(withFull({ [`${folder}/FullService.tsx`]: SHELL.replace('export default function', 'export function') }))).toEqual([
      `${folder}/FullService.tsx has no default export, which Game.tsx loads with React.lazy`,
    ])
    const eager = SHELL.replace("const Scene3D = lazy(() => import('./Scene3D'))", "import Scene3D from './Scene3D'")
    expect(problems(withFull({ [`${folder}/FullService.tsx`]: eager }))).toEqual([expect.stringContaining('FullService.tsx imports Scene3D statically')])
  })

  test('asks a game without 3D for no scene, and a shell that renders a mirror of another name is read by its ending', () => {
    const flat = SHELL.replace('      scene3d={(run) => <Scene3D run={run} />}\n', '').replace("const Scene3D = lazy(() => import('./Scene3D'))\n", '').replace("import { lazy } from 'react'\n", '')
    expect(checkShell(TOY, `${folder}/FullService.tsx`, memoryFiles(withFull({ [`${folder}/FullService.tsx`]: flat })))).toEqual([])
    const renamed = SHELL.replaceAll('FullMirror', 'LevelMirror')
    const files = withFull({ [`${folder}/FullService.tsx`]: renamed, [`${folder}/full/LevelMirror.tsx`]: part('LevelMirror') })
    expect(problems(files)).toEqual([])
  })

  test('reads Service\'s full service on this checkout: its four views and its scene are there', () => {
    const loop = GAMES.get('loop') as GameEntry
    const files = filesAt(root)
    expect(lazyShells(loop, files)).toEqual(['src/games/loop/FullService.tsx'])
    expect(checkFiles(loop, files)).toEqual([])
    // The other four load a scene and a debrief on demand and have no shell besides Game.tsx's own; whatever they gain is read the same way.
    for (const game of GAMES.games.filter((candidate) => candidate.id !== 'loop')) expect([game.id, checkFiles(game, files)]).toEqual([game.id, []])
  })

  test('fails Service\'s gate when the full service loses its mirror', async () => {
    const loop = GAMES.get('loop') as GameEntry
    const real = filesAt(root)
    const text = real.read('src/games/loop/FullService.tsx').replaceAll('<FullMirror ', '<span ')
    const files = { exists: real.exists, read: (file: string) => (file === 'src/games/loop/FullService.tsx' ? text : real.read(file)) }
    expect(checkFiles(loop, files)).toEqual(['src/games/loop/FullService.tsx never renders a Mirror of its own: a component whose name ends in Mirror'])
    const report = await checkGames({ games: [loop], componentIds: ['loop'], files, world: {} })
    expect(report.findings.map((finding) => finding.message)).toEqual(['src/games/loop/FullService.tsx never renders a Mirror of its own: a component whose name ends in Mirror'])
    expect(report.lines.get('loop')?.some((line) => line.startsWith('its own shell, FullService.tsx, renders View2D FullView2D, Mirror none,'))).toBe(true)
  })
})
