/**
 * Trace attribution's session (`gap-hunt`): the pure rules of the game, in the shape every game follows (GAMES.md §2.5, §6).
 *
 * The session owns the marks, as its actions (`mark`, `unmark`, `cause`, `submit`, `commit`): the viewer receives them as props and emits the
 * same actions, and a graded run is replayed from the log. A mark runs from one event edge of the step to another, with a category;
 * `checkHunt` of `packages/sim/trace` compares the set of marks with the reference in integer ns. The reference ("the ghost") plays the same
 * level in lockstep and is read only by the debrief and the grade. A state holds no display string: copy.ts says every line.
 */
import type { Seed } from '@es/sim/core'
import { spanView } from '@es/sim/trace'
import type { Mark } from '@es/sim/trace'
import type { Session } from '../types'
import { inLevelBand } from './bands'
import { debriefOf } from './debrief'
import { caseOf, presetMarks, readTarget, unaccountedOf } from './engine'
import { buildLevel } from './levels'
import { gradeOf, judge, scoreOf } from './score'
import { HUNT_CATEGORY_ORDER } from './types'
import type { CaseRun, HuntAction, HuntAsk, HuntLevel, HuntScore, HuntState } from './types'
import { huntView } from './view'
import type { HuntView } from './view'

/** The most marks a case holds, those it starts with included: the ledger's budget for a `trace-mark` event (`src/trace/marks.ts`). */
export const MARKS_MAX = 200

export const huntLevel = (id: string, seed: Seed): HuntLevel => buildLevel(id, seed)

function startRun(level: HuntLevel, i: number): CaseRun {
  const marks = presetMarks(level, i)
  return { guess: null, marks, locked: marks.length, cause: null, turns: 0, result: null }
}

export function huntInit(level: HuntLevel): HuntState {
  return { level, at: 0, runs: level.cases.map((_, i) => startRun(level, i)), history: [], done: false }
}

/** What the next action is for, or null when the run is over. `read` has no guess; every other level opens on one. */
export function huntAsk(s: HuntState): HuntAsk | null {
  if (s.done) return null
  return s.level.id !== 'read' && s.runs[s.at].guess === null ? { kind: 'commit', case: s.at } : { kind: 'mark', case: s.at }
}

/** The state with run `i` replaced, `at` on the first case not yet over, and `done` when every one is. */
function settle(s: HuntState, i: number, run: CaseRun, action: HuntAction): HuntState {
  const runs = s.runs.map((r, k) => (k === i ? run : r))
  const open = runs.findIndex((r) => r.result === null)
  return { level: s.level, at: open === -1 ? runs.length - 1 : open, runs, history: [...s.history, action], done: open === -1 }
}

/** A span of the engine's main thread that overlaps the step: what a cause can be. */
function isMainThreadSpan(s: HuntState, event: number): boolean {
  const c = caseOf(s.level, s.at)
  const v = spanView(c.hunt.trace, event)
  return (v.kind === 'cpu-thread' || v.kind === 'cuda-api') && v.startNs < c.toNs && v.endNs > c.fromNs
}

function ready(s: HuntState, run: CaseRun): void {
  if (s.level.id !== 'read' && run.guess === null) throw new RangeError('the opening guess comes first')
  if (s.level.id === 'graphs') throw new RangeError('this level ends on the count: nothing is marked')
}

/** Applies one action. Throws on an illegal one: a mark that is not between two edges of the step, a cause that is not a call of the main thread, a second guess, a submit that is not ready. */
export function huntReduce(s: HuntState, a: HuntAction): HuntState {
  if (s.done) throw new RangeError('the run is over')
  const i = s.at
  const run = s.runs[i]
  const { level } = s
  const c = caseOf(level, i)
  const next = (patch: Partial<CaseRun>): HuntState => settle(s, i, { ...run, ...patch, turns: run.turns + 1 }, a)
  switch (a.t) {
    case 'commit': {
      if (level.id === 'read') throw new RangeError('this level has no opening guess')
      if (run.guess !== null || run.turns !== 0) throw new RangeError('the opening guess comes once, before the first move of a case')
      if (!Number.isInteger(a.prediction) || a.prediction < 0) throw new RangeError('a guess is a whole number of at least 0')
      if (level.id !== 'graphs') {
        if (a.prediction >= HUNT_CATEGORY_ORDER.length) throw new RangeError(`a guess names one of the ${HUNT_CATEGORY_ORDER.length} categories`)
        return next({ guess: a.prediction })
      }
      // `graphs` ends on the count.
      const done: CaseRun = { ...run, guess: a.prediction, turns: 1 }
      return settle(s, i, { ...done, result: judge(level, i, done) }, a)
    }
    case 'mark': {
      ready(s, run)
      if (!HUNT_CATEGORY_ORDER.includes(a.category)) throw new RangeError(`"${String(a.category)}" is not a category`)
      if (!Number.isSafeInteger(a.from) || !Number.isSafeInteger(a.to) || a.from >= a.to) throw new RangeError('a mark runs from one edge to a later one')
      if (!c.edges.includes(a.from) || !c.edges.includes(a.to)) throw new RangeError('a mark starts and ends at an edge of an event in the step')
      if (run.marks.length >= MARKS_MAX) throw new RangeError(`a case holds at most ${MARKS_MAX} marks`)
      const mark: Mark = { fromNs: a.from, toNs: a.to, category: a.category }
      return next({ marks: [...run.marks, mark] })
    }
    case 'unmark':
      ready(s, run)
      if (!Number.isInteger(a.index) || a.index < run.locked || a.index >= run.marks.length) throw new RangeError('there is no mark of yours at that place')
      return next({ marks: run.marks.filter((_, k) => k !== a.index) })
    case 'cause':
      ready(s, run)
      if (a.event !== null && (!Number.isInteger(a.event) || !isMainThreadSpan(s, a.event))) throw new RangeError('a cause is a span of the main thread that runs in the step')
      return next({ cause: a.event })
    case 'submit': {
      ready(s, run)
      const mine = run.marks.length - run.locked
      if (run.cause === null) throw new RangeError('name the cause first')
      if (level.id === 'read' && mine === 0) throw new RangeError('mark the kernel first')
      if (level.id === 'gap' && mine === 0) throw new RangeError('mark the gap first')
      if (level.id === 'attribute' && unaccountedOf(c.fromNs, c.toNs, run.marks) !== 0) throw new RangeError('every ns of the step goes in a category before a submit')
      const done: CaseRun = { ...run, turns: run.turns + 1 }
      return settle(s, i, { ...done, result: judge(level, i, done) }, a)
    }
  }
}

/** The actions of the reference on a level, in order: the guess, the marks it makes beyond those it starts with, the cause, a submit. */
export function ghostActions(level: HuntLevel): HuntAction[] {
  return level.cases.flatMap((_, i): HuntAction[] => {
    const c = caseOf(level, i)
    if (level.id === 'graphs') return [{ t: 'commit', prediction: c.kernels }]
    if (level.id === 'read') {
      const target = readTarget(c)
      if (target === null) throw new RangeError('the window has no launch call and kernel to read')
      const v = spanView(c.hunt.trace, target.kernel)
      return [
        { t: 'cause', event: target.launch },
        { t: 'mark', from: v.startNs, to: v.endNs, category: 'kernel' },
        { t: 'submit' },
      ]
    }
    const preset = presetMarks(level, i)
    const gap = c.split.largestGap
    const within = gap === null ? c.split.marks : c.split.marks.filter((m) => level.id !== 'gap' || (m.fromNs >= gap.fromNs && m.toNs <= gap.toNs))
    const rest = within.filter((m) => !preset.some((p) => p.fromNs === m.fromNs && p.toNs === m.toNs && p.category === m.category))
    return [
      { t: 'commit', prediction: c.largest },
      ...rest.map((m): HuntAction => ({ t: 'mark', from: m.fromNs, to: m.toNs, category: m.category })),
      { t: 'cause', event: gap === null || gap.cause < 0 ? null : gap.cause },
      { t: 'submit' },
    ]
  })
}

/** The reference run to the end, from the level's start. */
export function huntGhost(level: HuntLevel): HuntState {
  return ghostActions(level).reduce(huntReduce, huntInit(level))
}

export const huntSession: Session<HuntLevel, HuntState, HuntAction, HuntView, HuntScore, HuntAsk> = {
  level: huntLevel,
  inBand: inLevelBand,
  init: huntInit,
  ask: huntAsk,
  reduce: huntReduce,
  view: huntView,
  done: (s) => s.done,
  score: scoreOf,
  ghost: huntGhost,
  grade: (mine) => gradeOf(mine),
  debrief: debriefOf,
}
