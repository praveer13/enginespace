/**
 * The toy game of W0-T14's tests: "Counting House", whose level `pile` asks for exactly a target by adding 1, 2 or 3 at a time.
 * It is small enough to reason about and real enough to exercise every part of the framework: a pure session with a band, a
 * reference, a grade and a debrief; a registry entry; and the files `verify:games` expects, held in memory.
 *
 * The rules: the seed draws a target from 1 to 9. The learner adds 1, 2 or 3 until the total reaches it. The reference adds 3
 * until the last move, which takes what is left, so it needs ceil(target / 3) moves. A run that overshoots scores 0, and
 * otherwise the score is min(1, reference moves ÷ my moves) (GAMES.md §2.1). A level is in band when the target is at least 4,
 * so the naive "add 1 every time" loses visibly.
 */
import { below, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import type { Debrief, GameAction, GameEntry, Grade, Session } from '@es/play'

export interface ToyLevel {
  readonly id: string
  readonly seed: Seed
  readonly target: number
}
export interface ToyState {
  readonly target: number
  readonly total: number
  /** What each move added, in order. */
  readonly taken: readonly number[]
}
export interface ToyAction extends GameAction {
  readonly t: 'add'
  readonly n: number
}
export interface ToyView {
  readonly target: number
  readonly total: number
  readonly left: number
  readonly taken: readonly number[]
}
export interface ToyScore {
  readonly moves: number
  readonly overshoot: number
}
export interface ToyAsk {
  readonly choices: readonly number[]
}

const targetOf = (seed: Seed): number => 1 + below(rngFor(seed, 'toy/target'), 9)

export const toySession: Session<ToyLevel, ToyState, ToyAction, ToyView, ToyScore, ToyAsk> = {
  level(id, seed) {
    if (id !== 'pile') throw new RangeError(`the toy has no level "${id}"`)
    return { id, seed, target: targetOf(seed) }
  },
  inBand: (id, seed) => id === 'pile' && targetOf(seed) >= 4,
  init: (level) => ({ target: level.target, total: 0, taken: [] }),
  ask: (state) => (state.total >= state.target ? null : { choices: [1, 2, 3] }),
  reduce(state, action) {
    if (state.total >= state.target) throw new RangeError('the pile is already full')
    if (action.t !== 'add' || ![1, 2, 3].includes(action.n)) throw new RangeError('add 1, 2 or 3')
    return { target: state.target, total: state.total + action.n, taken: [...state.taken, action.n] }
  },
  view: (state) => ({ target: state.target, total: state.total, left: Math.max(state.target - state.total, 0), taken: state.taken }),
  done: (state) => state.total >= state.target,
  score: (state) => ({ moves: state.taken.length, overshoot: Math.max(state.total - state.target, 0) }),
  ghost(level) {
    let state: ToyState = { target: level.target, total: 0, taken: [] }
    while (state.total < state.target) {
      const n = Math.min(3, state.target - state.total)
      state = { target: state.target, total: state.total + n, taken: [...state.taken, n] }
    }
    return state
  },
  grade(mine, ghost): Grade {
    const score = mine.total > mine.target ? 0 : Math.min(1, ghost.taken.length / mine.taken.length)
    return { score, ok: score >= 0.95 }
  },
  debrief(mine, ghost): Debrief {
    const first = mine.taken.findIndex((n, index) => n < (ghost.taken[index] ?? 3))
    const sentence =
      mine.total > mine.target
        ? 'You went past the mark.'
        : mine.taken.length === ghost.taken.length
          ? 'You matched the reference.'
          : `You took ${mine.taken.length} moves where the reference took ${ghost.taken.length}.`
    return { sentence, names: first >= 0 ? { turn: first } : null }
  },
}

/** The first seed from 0 that the band accepts: the pinned practice seed (GAMES.md §2.1). */
export const PRACTICE_SEED: Seed = (() => {
  for (let seed = 0; ; seed++) if (toySession.inBand('pile', seed)) return seed
})()

/** The registry's record of the toy, whole. Tests take parts away from it. */
export const TOY: GameEntry = {
  id: 'toy',
  modules: ['tr2'],
  title: 'Counting House',
  subtitle: 'adding up to a mark',
  has3d: false,
  kcs: ['tr2.toy-add'],
  keys: [{ id: 'add-three', code: 'KeyA', label: 'A', description: 'Add three' }],
  levels: [{ id: 'pile', title: 'The pile', graded: true, practiceSeed: PRACTICE_SEED }],
  card: 'toy-world',
  claims: ['toy.counting.rule'],
  session: async () => toySession,
}

/** The toy with a 3D scene, for the shell's view switch. */
export const TOY_3D: GameEntry = { ...TOY, id: 'toy-3d', has3d: true }

/** `Game.tsx` as a game writes it: it renders each part, and loads the 3D scene only through `import()`. */
export const GAME_TSX = `import { lazy } from 'react'
import { GameShell } from '@/games/kit/GameShell'
import { Controls } from './Controls'
import { Debrief } from './Debrief'
import { Mirror } from './Mirror'
import { View2D } from './View2D'
const Scene3D = lazy(() => import('./Scene3D'))

export default function Game() {
  return (
    <GameShell
      view2d={(run) => <View2D run={run} />}
      scene3d={(run) => <Scene3D run={run} />}
      controls={(run) => <Controls run={run} />}
      mirror={(run) => <Mirror run={run} />}
      debrief={(run, outcome) => <Debrief run={run} outcome={outcome} />}
    />
  )
}
`

const part = (name: string) => `export function ${name}() {\n  return null\n}\n`

/** The toy's files in the layout A§6.3 gives a game: the files `verify:games` looks for, as a path-to-text map. */
export function toyFiles(extra: Record<string, string> = {}): Map<string, string> {
  return new Map<string, string>([
    ['src/games/toy/Game.tsx', GAME_TSX],
    ['src/games/toy/View2D.tsx', part('View2D')],
    ['src/games/toy/Mirror.tsx', part('Mirror')],
    ['src/games/toy/Controls.tsx', part('Controls')],
    ['src/games/toy/Debrief.tsx', part('Debrief')],
    ['content/cards/toy-world.md', '# Counting House\n'],
    ...Object.entries(extra),
  ])
}

/** The files of `files` as the gate reads them. */
export const memoryFiles = (files: ReadonlyMap<string, string>) => ({
  exists: (file: string) => files.has(file),
  read: (file: string) => {
    const text = files.get(file)
    if (text === undefined) throw new Error(`no file ${file}`)
    return text
  },
})
