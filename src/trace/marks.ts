/*
 * Marks (GAMES.md §6 "Core loop": "Mark spans by snapping from one event edge to another, and assign categories"; ARCHITECTURE §7.2:
 * a `trace-mark` event carries "marks, attribution error").
 *
 * A mark is a stretch of the tape, from one event edge to another, in integer ns, with the category the learner says it is and a few
 * words of their own. The cause is one event the learner names as what held the line. Both are plain data. The viewer keeps them,
 * and exports them in the shape a `trace-mark` event holds: a list of JSON entries beside the attribution error that the task
 * computes against the truth (the viewer never knows the truth, so it takes the error as an argument).
 *
 * The entries:
 *   { kind: 'range', fromNs, toNs, category, label? }    category is one of Gap Hunt's four words, or null when not yet chosen
 *   { kind: 'cause', span }                              the index of the span in the trace's columns
 * The ledger stores them as free JSON within a budget (packages/ledger, LIMITS.marksChars), so this file bounds what it writes: at
 * most `MAX_MARKS` ranges, each label at most `LABEL_MAX` characters.
 */
import type { TraceMarkData } from '@es/ledger'
import type { AttributionCategory } from '@es/sim/trace'
import type { Win } from './model'

/** Gap Hunt's four words for what a stretch of the tape is (GAMES.md §6). */
export type Category = AttributionCategory
export const CATEGORIES: readonly Category[] = ['kernel', 'copy', 'cpu-gap', 'both-idle']

/** What each category is called on screen: the engine's term leads, and the kitchen's words ride beside it (GAMES.md §2.6, The Tape). */
export const CATEGORY_WORDS: Readonly<Record<Category, { term: string; kitchen: string }>> = {
  kernel: { term: 'Kernel', kitchen: 'cooking' },
  copy: { term: 'Copy', kitchen: 'the dumbwaiter, nothing cooking' },
  'cpu-gap': { term: 'CPU gap', kitchen: 'dark while the expo writes' },
  'both-idle': { term: 'Both idle', kitchen: 'everyone waiting' },
}

export const MAX_MARKS = 200
export const LABEL_MAX = 40

export interface Mark {
  /** Numbered from 1 in the order made, and never reused while the tape is open. */
  readonly id: number
  readonly fromNs: number
  readonly toNs: number
  readonly category: Category | null
  readonly label: string
}

export interface Annotations {
  readonly marks: readonly Mark[]
  /** The span named as the cause, or null. */
  readonly cause: number | null
  readonly nextId: number
}

export const NO_ANNOTATIONS: Annotations = Object.freeze({ marks: [], cause: null, nextId: 1 })

/** A label as it is kept: control characters dropped, white space collapsed, trimmed, and cut to `LABEL_MAX` characters. */
export function cleanLabel(text: string): string {
  // eslint-disable-next-line no-control-regex -- the point is to drop them
  const plain = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(plain).slice(0, LABEL_MAX).join('').trimEnd()
}

export type Made = { readonly ok: true; readonly notes: Annotations; readonly mark: Mark } | { readonly ok: false; readonly why: string }

/** Adds a mark from one edge to another, whichever order they come in. A mark of no length is refused, and so is a tape that is full. */
export function addMark(notes: Annotations, aNs: number, bNs: number, category: Category | null, label = ''): Made {
  const fromNs = Math.min(aNs, bNs)
  const toNs = Math.max(aNs, bNs)
  if (!Number.isSafeInteger(fromNs) || !Number.isSafeInteger(toNs)) return { ok: false, why: 'A mark runs between two whole ns.' }
  if (toNs === fromNs) return { ok: false, why: 'A mark of no length holds nothing. Move to another edge.' }
  if (notes.marks.length >= MAX_MARKS) return { ok: false, why: `The tape holds ${MAX_MARKS} marks. Remove one to make another.` }
  const mark: Mark = { id: notes.nextId, fromNs, toNs, category, label: cleanLabel(label) }
  return { ok: true, notes: { ...notes, marks: [...notes.marks, mark], nextId: notes.nextId + 1 }, mark }
}

const replace = (notes: Annotations, id: number, change: (mark: Mark) => Mark): Annotations => ({
  ...notes,
  marks: notes.marks.map((mark) => (mark.id === id ? change(mark) : mark)),
})

export const retag = (notes: Annotations, id: number, category: Category | null): Annotations => replace(notes, id, (mark) => ({ ...mark, category }))
export const relabel = (notes: Annotations, id: number, label: string): Annotations => replace(notes, id, (mark) => ({ ...mark, label: cleanLabel(label) }))
export const removeMark = (notes: Annotations, id: number): Annotations => ({ ...notes, marks: notes.marks.filter((mark) => mark.id !== id) })
export const withCause = (notes: Annotations, span: number | null): Annotations => ({ ...notes, cause: span })

// ---------------------------------------------------------------------------------------------------------------------------
// What the marks add up to

/** The ns of [fromNs, toNs) that no categorised mark covers: Gap Hunt's "unaccounted ns on the tape" (GAMES.md §2.6), for the window asked about. */
export function unaccountedNs(marks: readonly Mark[], win: Win): number {
  const spans = marks
    .filter((mark) => mark.category !== null)
    .map((mark): [number, number] => [Math.max(mark.fromNs, win.fromNs), Math.min(mark.toNs, win.toNs)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1])
  let covered = 0
  let reach = win.fromNs
  for (const [a, b] of spans) {
    const start = Math.max(a, reach)
    if (b > start) covered += b - start
    if (b > reach) reach = b
  }
  return win.toNs - win.fromNs - covered
}

export interface Overlap {
  readonly a: number
  readonly b: number
  readonly ns: number
}

/** The pairs of marks that cover some of the same ns, by id. A partition has none. */
export function overlaps(marks: readonly Mark[]): Overlap[] {
  const sorted = [...marks].sort((x, y) => x.fromNs - y.fromNs || x.id - y.id)
  const out: Overlap[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].fromNs < sorted[i].toNs; j++) {
      out.push({ a: sorted[i].id, b: sorted[j].id, ns: Math.min(sorted[i].toNs, sorted[j].toNs) - sorted[j].fromNs })
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------
// The trace-mark event's shape

/**
 * One entry of a `trace-mark` event's marks. A range without words is one entry and a range with words is another, and neither has a
 * `label?` that could hold `undefined`, so a list of entries is JSON as the type says it is (`Json` has no `undefined`).
 */
export type MarkEntry =
  | { kind: 'range'; fromNs: number; toNs: number; category: Category | null }
  | { kind: 'range'; fromNs: number; toNs: number; category: Category | null; label: string }
  | { kind: 'cause'; span: number }

/** The marks as entries, ranges in time order and then the cause. A label that is empty is left out, as JSON leaves out `undefined`. */
export function exportMarks(notes: Annotations): MarkEntry[] {
  const ranges = [...notes.marks]
    .sort((a, b) => a.fromNs - b.fromNs || a.toNs - b.toNs || a.id - b.id)
    .map((mark): MarkEntry => (mark.label === '' ? { kind: 'range', fromNs: mark.fromNs, toNs: mark.toNs, category: mark.category } : { kind: 'range', fromNs: mark.fromNs, toNs: mark.toNs, category: mark.category, label: mark.label }))
  return notes.cause === null ? ranges : [...ranges, { kind: 'cause', span: notes.cause }]
}

/**
 * The `data` of a `trace-mark` event (ARCHITECTURE §7.2): the marks, and the attribution error that the task computed against the
 * truth, a number of at least 0. The envelope, the score and the provenance are the writer's, not the viewer's.
 */
export function traceMarkData(notes: Annotations, error: number): TraceMarkData {
  if (!(error >= 0) || !Number.isFinite(error)) throw new RangeError(`the attribution error is a number of at least 0, got ${error}`)
  return { marks: exportMarks(notes), error }
}

const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** The ledger ref of a trace task, `trace:<trace>/<task>` (ARCHITECTURE §4.5). Both parts are lowercase words joined by hyphens. */
export function traceMarkRef(trace: string, task: string): string {
  if (!SLUG.test(trace)) throw new RangeError(`a trace id is lowercase words joined by hyphens, got "${trace}"`)
  if (!SLUG.test(task)) throw new RangeError(`a task id is lowercase words joined by hyphens, got "${task}"`)
  return `trace:${trace}/${task}`
}

const isCategory = (value: unknown): value is Category => typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)

/**
 * The marks that entries describe, or null when any entry is not one of the two shapes above. It is the strict reader of
 * `exportMarks`, so that a stored event can be shown again; ids are given again in order.
 */
export function importMarks(entries: readonly unknown[]): Annotations | null {
  let notes: Annotations = NO_ANNOTATIONS
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null
    const e = entry as Record<string, unknown>
    if (e.kind === 'cause') {
      if (Object.keys(e).length !== 2 || !Number.isSafeInteger(e.span) || (e.span as number) < 0) return null
      notes = withCause(notes, e.span as number)
    } else if (e.kind === 'range') {
      const keys = Object.keys(e).filter((key) => key !== 'label')
      if (keys.length !== 4 || !keys.every((key) => ['kind', 'fromNs', 'toNs', 'category'].includes(key))) return null
      if ('label' in e && typeof e.label !== 'string') return null
      if (typeof e.fromNs !== 'number' || typeof e.toNs !== 'number' || e.toNs <= e.fromNs) return null
      if (e.category !== null && !isCategory(e.category)) return null
      const made = addMark(notes, e.fromNs, e.toNs, e.category, typeof e.label === 'string' ? e.label : '')
      if (!made.ok) return null
      notes = made.notes
    } else {
      return null
    }
  }
  return notes
}
