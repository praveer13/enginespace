/**
 * What the lanes, the list and the DOM mirror all draw (GAMES.md §6): the state, read into the window, the edges a mark snaps to, the marks, the
 * cause and the counters.
 *
 * The view is a function of the state alone and never changes it. It holds nothing of the reference: the unaccounted counter is the window's ns
 * that no mark covers, which says nothing of what the right category is, and no readout holds the answer to the opening guess. The words
 * are `copy.ts`'s; the readouts here are its lines made from the figures.
 */
import type { Category } from '@es/sim/trace'
import { causeLine, marksLine, overlapLine, stepLine, unaccountedLine } from './copy'
import { caseOf, overlapsOf, unaccountedOf } from './engine'
import type { HuntLevelId, HuntState } from './types'

export interface MarkView {
  readonly fromNs: number
  readonly toNs: number
  readonly category: Category
  /** A mark the case starts with: it cannot be taken back. */
  readonly locked: boolean
}

export interface HuntView {
  readonly level: HuntLevelId
  readonly graded: boolean
  /** The case in play, from 0, and how many there are. */
  readonly at: number
  readonly of: number
  readonly phase: 'commit' | 'mark' | 'over'
  readonly window: { readonly fromNs: number; readonly toNs: number; readonly ns: number }
  /** The ns a mark can start or end at, in order. */
  readonly edges: readonly number[]
  readonly marks: readonly MarkView[]
  readonly cause: number | null
  readonly guess: number | null
  /** The window's ns that no mark covers. */
  readonly unaccountedNs: number
  readonly overlap: boolean
  /** Whether a submit is legal now. */
  readonly canSubmit: boolean
  /** For each case, whether it passed, or null while it is not over. */
  readonly passed: readonly (boolean | null)[]
  /** The counters, in the words of copy.ts; `unaccounted` is null on a level that does not count it. */
  readonly lines: { readonly step: string; readonly marks: string; readonly unaccounted: string | null; readonly cause: string; readonly overlap: string | null }
}

export function huntView(s: HuntState): HuntView {
  const { level } = s
  const run = s.runs[s.at]
  const c = caseOf(level, s.at)
  const mine = run.marks.length - run.locked
  const unaccountedNs = unaccountedOf(c.fromNs, c.toNs, run.marks)
  const overlap = overlapsOf(run.marks)
  const guessed = level.id === 'read' || run.guess !== null
  const canSubmit =
    !s.done && run.result === null && guessed && level.id !== 'graphs' && run.cause !== null && (level.id === 'attribute' ? unaccountedNs === 0 : mine > 0)
  return {
    level: level.id,
    graded: level.graded,
    at: s.at,
    of: level.cases.length,
    phase: s.done ? 'over' : guessed ? 'mark' : 'commit',
    window: { fromNs: c.fromNs, toNs: c.toNs, ns: c.toNs - c.fromNs },
    edges: c.edges,
    marks: run.marks.map((m, i) => ({ fromNs: m.fromNs, toNs: m.toNs, category: m.category, locked: i < run.locked })),
    cause: run.cause,
    guess: run.guess,
    unaccountedNs,
    overlap,
    canSubmit,
    passed: s.runs.map((r) => (r.result === null ? null : r.result.passed)),
    lines: {
      step: stepLine(s.at, level.cases.length),
      marks: marksLine(mine),
      unaccounted: level.id === 'attribute' ? unaccountedLine(unaccountedNs) : null,
      cause: causeLine(run.cause !== null),
      overlap: overlap ? overlapLine : null,
    },
  }
}
