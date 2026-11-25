/*
 * The trace as a list, for a phone (GAMES.md §6 "Controls"; TR3's design, item 10): the pure part of `ListMode.tsx`.
 *
 * A step's window is cut into stretches. A stretch runs between two consecutive edges at which the GPU turns busy or idle, its work
 * changes between kernel and copy-only, or the main thread turns busy or idle: the edges of the three unions that attribution is made
 * of (packages/sim/trace/busy.ts), and only those. Two stretches next to each other may belong to one category (a kernel runs while the
 * main thread goes quiet), so a stretch is no answer: the learner reads what runs on each side and says which category it is.
 *
 * A category picked for a stretch becomes a mark, and a run of stretches with one category becomes one mark, so the list writes what
 * the lanes write: ranges between event edges, each with a category, and a cause. The list says what it does as actions, the session's
 * own (`mark` from one ns to another with a category, `unmark` by its place in the marks, `cause`), and a host applies them; the list
 * never holds the marks itself. Nothing here touches the DOM, so the tests walk it under Bun.
 */
import { busyIndex } from '@es/sim/trace/busy'
import type { Busy, BusyIndex } from '@es/sim/trace/busy'
import type { EsTrace } from '@es/sim/trace'
import { addMark, withCause } from './marks'
import type { Annotations, Category, Mark } from './marks'
import { spanName, spansInWindow, styleNumber } from './model'
import type { TraceIndex, Win } from './model'

/** What the GPU does over a stretch: a kernel runs (with or without a copy), a copy runs alone, or nothing runs. */
export type GpuWork = 'kernel' | 'copy' | 'idle'

export interface Stretch {
  readonly fromNs: number
  readonly toNs: number
  readonly gpu: GpuWork
  /** Whether the main thread (a frame or a CUDA call) is busy over it. */
  readonly cpu: boolean
}

/** The intervals of `busy` that overlap [fromNs, toNs), cut to it. */
function within(busy: Busy, fromNs: number, toNs: number): [number, number][] {
  const out: [number, number][] = []
  let lo = 0
  let hi = busy.end.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (busy.end[mid] <= fromNs) lo = mid + 1
    else hi = mid
  }
  for (let i = lo; i < busy.start.length && busy.start[i] < toNs; i++) out.push([Math.max(busy.start[i], fromNs), Math.min(busy.end[i], toNs)])
  return out
}

const covers = (parts: readonly [number, number][], t: number): boolean => parts.some(([a, b]) => a <= t && t < b)

/** The stretches of a window, in time order. They follow each other from `win.fromNs` to `win.toNs`, so their lengths add up to it. */
export function stretches(busy: BusyIndex, win: Win): Stretch[] {
  if (!(win.toNs > win.fromNs)) return []
  const kernel = within(busy.kernel, win.fromNs, win.toNs)
  const copy = within(busy.copy, win.fromNs, win.toNs)
  const cpu = within(busy.cpu, win.fromNs, win.toNs)
  const cuts = new Set<number>([win.fromNs, win.toNs])
  for (const [a, b] of [...kernel, ...copy, ...cpu]) {
    cuts.add(a)
    cuts.add(b)
  }
  const edges = [...cuts].sort((a, b) => a - b)
  const out: Stretch[] = []
  for (let i = 0; i + 1 < edges.length; i++) {
    const at = edges[i]
    const gpu: GpuWork = covers(kernel, at) ? 'kernel' : covers(copy, at) ? 'copy' : 'idle'
    const busyCpu = covers(cpu, at)
    const last = out[out.length - 1]
    if (last !== undefined && last.gpu === gpu && last.cpu === busyCpu) out[out.length - 1] = { ...last, toNs: edges[i + 1] }
    else out.push({ fromNs: at, toNs: edges[i + 1], gpu, cpu: busyCpu })
  }
  return out
}

/** The stretches of a trace's window, from the trace itself. */
export const stretchesOf = (trace: EsTrace, win: Win): Stretch[] => stretches(busyIndex(trace), win)

// ---------------------------------------------------------------------------------------------------------------------------
// What runs over a stretch, in the engine's words

const KERNEL = styleNumber('kernel')
const COPY = styleNumber('copy')

/** At most this many names are given for one side of a stretch; the rest are counted. */
export const NAMES_SHOWN = 2

export interface Side {
  /** The names, without repeats, innermost first on the main thread. */
  readonly names: readonly string[]
  /** How many more there are. */
  readonly more: number
}

/**
 * The spans that run over a stretch, on the GPU (kernels for a kernel stretch, copies for a copy-only one) and on the main thread
 * (the innermost frame or call: a frame under a call is the call's caller, and the call is what is happening).
 */
export function sides(index: TraceIndex, stretch: Stretch): { gpu: Side; cpu: Side } {
  const win = { fromNs: stretch.fromNs, toNs: stretch.toNs }
  const gpu: string[] = []
  const cpu: { name: string; depth: number; lane: number }[] = []
  for (const found of spansInWindow(index, win, Number.MAX_SAFE_INTEGER)) {
    const kind = found.lane.kind
    for (const span of found.spans) {
      if (!(index.trace.spans.durNs[span] > 0)) continue
      const style = index.style[span]
      if (kind === 'gpu-stream') {
        if ((stretch.gpu === 'kernel' && style === KERNEL) || (stretch.gpu === 'copy' && style === COPY)) gpu.push(spanName(index, span))
      } else if (kind === 'cpu-thread' || kind === 'cuda-api') {
        cpu.push({
          name: spanName(index, span),
          depth: found.lane.row[index.spanPos[span]],
          lane: found.lane.index,
        })
      }
    }
  }
  // A call is inside the frame that made it, so the calls' lane comes first; within a lane, the deepest frame.
  cpu.sort((a, b) => b.lane - a.lane || b.depth - a.depth)
  const side = (names: readonly string[]): Side => {
    const unique = [...new Set(names)]
    return {
      names: unique.slice(0, NAMES_SHOWN),
      more: Math.max(0, unique.length - NAMES_SHOWN),
    }
  }
  const innermost = cpu.length === 0 ? [] : cpu.filter((entry) => entry.lane === cpu[0].lane && entry.depth === cpu[0].depth).map((entry) => entry.name)
  return {
    gpu: side(stretch.gpu === 'idle' ? [] : gpu),
    cpu: side(stretch.cpu ? innermost : []),
  }
}

/** The spans the cause may be: the window's main-thread frames and CUDA calls (blocking calls among them), in time order. */
export function causeSpans(index: TraceIndex, win: Win): number[] {
  const spans: number[] = []
  for (const found of spansInWindow(index, win, Number.MAX_SAFE_INTEGER)) {
    if (found.lane.kind === 'cpu-thread' || found.lane.kind === 'cuda-api') spans.push(...found.spans)
  }
  const { startNs, durNs } = index.trace.spans
  return spans.sort((a, b) => startNs[a] - startNs[b] || durNs[b] - durNs[a] || a - b)
}

// ---------------------------------------------------------------------------------------------------------------------------
// From the marks to the stretches, and back

/** The category each stretch reads as: that of the latest mark that covers the whole of it, or null when none does. */
export function stretchCategories(rows: readonly Stretch[], marks: readonly Mark[]): (Category | null)[] {
  return rows.map((row) => {
    let found: Mark | null = null
    for (const mark of marks) if (mark.fromNs <= row.fromNs && mark.toNs >= row.toNs && (found === null || mark.id > found.id)) found = mark
    return found?.category ?? null
  })
}

/** What the list asks of the marks: the session's own actions (GAMES.md §6, "Simulation API"). */
export type ListAction =
  | {
      readonly t: 'mark'
      readonly from: number
      readonly to: number
      readonly category: Category
    }
  | { readonly t: 'unmark'; readonly index: number }
  | { readonly t: 'cause'; readonly event: number | null }

/**
 * The actions that give the stretch `row` the category `category`. Every mark that overlaps the stretch is taken back; the parts of it
 * outside the stretch are marked again with their own category, unless that is `category`, in which case the new mark takes them in.
 * A mark of `category` that ends where the stretch starts, or starts where it ends, is taken in too, so that a run of stretches with
 * one category is one mark. A stretch that reads as `category` already asks nothing.
 *
 * The `unmark`s come first, from the last place to the first, so that each place still names the mark it named; then the marks, in
 * time order. A label on a mark that is taken back is not carried over: a label is written at a desk, on the lanes.
 */
export function pickActions(rows: readonly Stretch[], marks: readonly Mark[], row: number, category: Category): ListAction[] {
  const target = rows[row]
  if (target === undefined) return []
  if (stretchCategories([target], marks)[0] === category) return []
  const taken: number[] = []
  let fromNs = target.fromNs
  let toNs = target.toNs
  const rest: { from: number; to: number; category: Category }[] = []
  marks.forEach((mark, at) => {
    const overlaps = mark.fromNs < target.toNs && mark.toNs > target.fromNs
    const joins = mark.category === category && (mark.toNs === target.fromNs || mark.fromNs === target.toNs)
    if (!overlaps && !joins) return
    taken.push(at)
    if (mark.category === category) {
      fromNs = Math.min(fromNs, mark.fromNs)
      toNs = Math.max(toNs, mark.toNs)
      return
    }
    if (mark.category === null) return
    if (mark.fromNs < target.fromNs)
      rest.push({
        from: mark.fromNs,
        to: target.fromNs,
        category: mark.category,
      })
    if (mark.toNs > target.toNs) rest.push({ from: target.toNs, to: mark.toNs, category: mark.category })
  })
  const made = [...rest, { from: fromNs, to: toNs, category }].sort((a, b) => a.from - b.from)
  return [...taken.sort((a, b) => b - a).map((index): ListAction => ({ t: 'unmark', index })), ...made.map((m): ListAction => ({ t: 'mark', ...m }))]
}

/** The actions that name `span` as the cause, or no cause with null. Naming the cause already named asks nothing. */
export const causeActions = (notes: Annotations, span: number | null): ListAction[] => (notes.cause === span ? [] : [{ t: 'cause', event: span }])

/** One action applied to the marks, or null when it cannot apply (a place with no mark, a mark refused because the tape is full). */
export function applyListAction(notes: Annotations, action: ListAction): Annotations | null {
  switch (action.t) {
    case 'mark': {
      const made = addMark(notes, action.from, action.to, action.category)
      return made.ok ? made.notes : null
    }
    case 'unmark':
      if (!Number.isSafeInteger(action.index) || action.index < 0 || action.index >= notes.marks.length) return null
      return {
        ...notes,
        marks: notes.marks.filter((_, at) => at !== action.index),
      }
    case 'cause':
      return withCause(notes, action.event)
  }
}

/** The actions applied in order, all or none: null when any of them cannot apply, so a pick is never half made. */
export function applyListActions(notes: Annotations, actions: readonly ListAction[]): Annotations | null {
  let next: Annotations | null = notes
  for (const action of actions) {
    next = applyListAction(next, action)
    if (next === null) return null
  }
  return next
}
