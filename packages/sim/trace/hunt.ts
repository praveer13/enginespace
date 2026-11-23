// Gap Hunt's model (GAMES.md §6): a case is a step of a trace and an ask, the reference split is the true partition of the step
// with its largest gap and that gap's cause, and `checkHunt` compares a learner's marks with it in integer ns. It reads no clock.
//
// The band (§6): in a case the largest gap is at least 1.5 times the second largest, one main-thread span covers at least 60% of
// the largest gap's lead-in, the window's non-kernel ns are at least 10% of it (so marking it all "kernel" stays under the bar), and
// the reference partition has at most 12 segments (the most marks a case may need). A case is drawn only from steps in the band.
// Besides: in at least half the cases a main-thread span longer than the cause lies under GPU-busy time, so "the widest span"
// fails; `huntCase` draws such a case three times in four whenever the traces have one.

import { below, rngFor } from '../core/rng'
import type { Seed } from '../core/types'
import { attributeSteps, stepWindows } from './attribute'
import { spanCount, spanView } from './codec'
import { findCause } from './hunt-gap'
import { HUNT_CAUSES, huntTrace } from './hunt-gen'
import type { HuntCause } from './hunt-gen'
import type { Attribution, AttributionCategory, EsTrace } from './types'

export type Category = AttributionCategory
export const HUNT_CATEGORIES: readonly Category[] = Object.freeze(['kernel', 'copy', 'cpu-gap', 'both-idle'])

/** A stretch of a window a learner has put in a category: from and to are ns, and a mark is `from` up to but not including `to`. */
export interface Mark {
  readonly fromNs: number
  readonly toNs: number
  readonly category: Category
}

/**
 * What a case asks: `gap` is the place of the largest gap (its two edges) and its cause, `attribute` the whole partition of the
 * step, `both` the partition and the cause.
 */
export type HuntAsk = 'gap' | 'attribute' | 'both'

export interface HuntCase {
  readonly trace: EsTrace
  /** The index of the step window, from 0. */
  readonly step: number
  readonly ask: HuntAsk
}

export interface HuntSplit {
  /** The reference partition: marks that follow each other from the window's start to its end, with no gap and no overlap. */
  readonly marks: Mark[]
  /** The main thread's busy time inside GPU-busy: hidden CPU work, beside the partition and in none of its parts. */
  readonly overlapNs: number
  /** The largest idle stretch of the GPU, and the span that caused it (an event id, −1 when none can be read), or null when the GPU never idles. */
  readonly largestGap: { fromNs: number; toNs: number; cause: number } | null
}

export interface HuntCheck {
  /** The ns of the scored stretch (the window, or the largest gap for an ask of `gap`) that no mark covers. */
  readonly unaccountedNs: number
  /** The ns of it that are in the reference's category and in no other. */
  readonly rightNs: number
  readonly windowNs: number
  readonly causeOk: boolean
  /** In plain words, what is wrong with the marks as a set; empty when nothing is. */
  readonly problems: string[]
}

/** The levels' asks. `pinned` and `yours` are not built (GAMES.md §6). */
const LEVEL_ASK: Readonly<Record<string, HuntAsk>> = Object.freeze({ read: 'gap', gap: 'gap', graphs: 'attribute', attribute: 'attribute' })

function attributionOf(c: HuntCase): Attribution {
  const windows = stepWindows(c.trace)
  if (!Number.isInteger(c.step) || c.step < 0 || c.step >= windows.length) throw new RangeError(`step ${c.step} is not one of the trace's ${windows.length} steps`)
  return attributeSteps(c.trace)[c.step]
}

function largestOf(a: Attribution): { fromNs: number; toNs: number } | null {
  let best: { fromNs: number; toNs: number } | null = null
  for (const g of a.gaps) if (best === null || g.toNs - g.fromNs > best.toNs - best.fromNs) best = g
  return best
}

/** The reference of a case: the partition of its step, the hidden CPU work, and the largest gap with its cause. */
export function referenceSplit(c: HuntCase): HuntSplit {
  return splitOf(c.trace, attributionOf(c))
}

function splitOf(t: EsTrace, a: Attribution): HuntSplit {
  const gap = largestOf(a)
  const cause = gap === null ? null : findCause(t, gap)
  return {
    marks: a.segments.map((s) => ({ fromNs: s.fromNs, toNs: s.toNs, category: s.category })),
    overlapNs: a.overlapNs,
    largestGap: gap === null ? null : { fromNs: gap.fromNs, toNs: gap.toNs, cause: cause?.event ?? -1 },
  }
}

/** Whether the step of attribution `a` is in the band (above). */
function inBand(t: EsTrace, a: Attribution): boolean {
  const lengths = a.gaps.map((g) => g.toNs - g.fromNs).sort((x, y) => y - x)
  if (lengths.length === 0) return false
  const second = lengths.length > 1 ? lengths[1] : 0
  if (2 * lengths[0] < 3 * second) return false
  if (10 * (a.windowNs - a.kernelNs) < a.windowNs) return false
  if (a.segments.length > 12) return false
  const gap = largestOf(a)
  const cause = gap === null ? null : findCause(t, gap)
  return cause !== null && 10 * cause.coverNs >= 6 * (cause.leadInToNs - cause.leadInFromNs)
}

/** Whether a main-thread span longer than the cause lies mostly under GPU-busy time, inside the case's window. */
export function decoyUnderBusy(c: HuntCase): boolean {
  const a = attributionOf(c)
  const ref = splitOf(c.trace, a)
  if (ref.largestGap === null || ref.largestGap.cause < 0) return false
  const causeDur = spanView(c.trace, ref.largestGap.cause).durNs
  const busy = a.segments.filter((s) => s.category === 'kernel' || s.category === 'copy')
  for (let i = 0; i < spanCount(c.trace); i++) {
    const v = spanView(c.trace, i)
    if ((v.kind !== 'cpu-thread' && v.kind !== 'cuda-api') || v.durNs <= causeDur) continue
    const from = Math.max(v.startNs, a.fromNs)
    const to = Math.min(v.endNs, a.toNs)
    if (to <= from) continue
    let under = 0
    for (const s of busy) under += Math.max(0, Math.min(to, s.toNs) - Math.max(from, s.fromNs))
    if (2 * under >= v.durNs) return true
  }
  return false
}

/**
 * The traces a level draws its case from: two traces of four steps, one cause drawn for each step, with a second GPU stream
 * in about half of them. The `graphs` level draws node-level traces of graph replays. A case is drawn from them by `huntCase`.
 */
export function huntTraces(seed: Seed, level: string): EsTrace[] {
  if (LEVEL_ASK[level] === undefined) throw new RangeError(`no level ${JSON.stringify(level)}: Gap Hunt builds ${Object.keys(LEVEL_ASK).join(', ')}`)
  const rng = rngFor(seed, `hunt/traces/${level}`)
  return [0, 1].map(() => {
    const traceSeed = below(rng, 4294967296)
    const causes = Array.from({ length: 4 }, () => HUNT_CAUSES[below(rng, HUNT_CAUSES.length)])
    return huntTrace(traceSeed, { causes, node: level === 'graphs', twoStreams: below(rng, 2) === 0 })
  })
}

/**
 * A case of `level` from `traces`, drawn by `seed` among the steps that are in the band. Three times in four it is one that has a
 * main-thread span longer than its cause under GPU-busy time, when there is one. Throws when no step is in the band.
 */
export function huntCase(traces: readonly EsTrace[], seed: Seed, level: string): HuntCase {
  const ask = LEVEL_ASK[level]
  if (ask === undefined) throw new RangeError(`no level ${JSON.stringify(level)}: Gap Hunt builds ${Object.keys(LEVEL_ASK).join(', ')}`)
  const all: HuntCase[] = []
  const decoys: HuntCase[] = []
  for (const trace of traces) {
    attributeSteps(trace).forEach((a, step) => {
      if (!inBand(trace, a)) return
      const c: HuntCase = { trace, step, ask }
      all.push(c)
      if (decoyUnderBusy(c)) decoys.push(c)
    })
  }
  if (all.length === 0) throw new RangeError('no step of these traces is in the band')
  const rng = rngFor(seed, `hunt/case/${level}`)
  const pool = decoys.length > 0 && below(rng, 4) !== 0 ? decoys : all
  return pool[below(rng, pool.length)]
}

// ---------------------------------------------------------------------------------------------------------------------------
// Checking marks

const IDLE: ReadonlySet<Category> = new Set<Category>(['cpu-gap', 'both-idle'])

/**
 * Compares `marks` and `cause` (an event id, or null) with the reference of the case. The scored stretch is the window, or for an
 * ask of `gap` the largest gap. A ns is right when every mark over it is in the reference's category; marks of different
 * categories over one ns are a problem, and that ns is not right. For an ask of `gap` the marks of the two idle categories must
 * join into one stretch from the gap's first ns to its last, with nothing idle beside it. The cause counts when the case asks for it.
 */
export function checkHunt(c: HuntCase, marks: readonly Mark[], cause: number | null): HuntCheck {
  const a = attributionOf(c)
  const ref = splitOf(c.trace, a)
  const gapAsk = c.ask === 'gap' && ref.largestGap !== null
  const scope = gapAsk && ref.largestGap !== null ? { fromNs: ref.largestGap.fromNs, toNs: ref.largestGap.toNs } : { fromNs: a.fromNs, toNs: a.toNs }
  const problems: string[] = []

  const valid: Mark[] = []
  let outside = false
  for (const m of marks) {
    if (!Number.isSafeInteger(m.fromNs) || !Number.isSafeInteger(m.toNs) || m.toNs <= m.fromNs || !HUNT_CATEGORIES.includes(m.category)) {
      problems.push('a mark is not a stretch of time with a category')
      continue
    }
    if (m.fromNs < a.fromNs || m.toNs > a.toNs) outside = true
    const from = Math.max(m.fromNs, a.fromNs)
    const to = Math.min(m.toNs, a.toNs)
    if (to > from) valid.push({ fromNs: from, toNs: to, category: m.category })
  }
  if (outside) problems.push('a mark reaches outside the step')

  const points = new Set<number>([scope.fromNs, scope.toNs])
  for (const m of valid) for (const p of [m.fromNs, m.toNs]) if (p > scope.fromNs && p < scope.toNs) points.add(p)
  for (const s of ref.marks) for (const p of [s.fromNs, s.toNs]) if (p > scope.fromNs && p < scope.toNs) points.add(p)
  const cuts = [...points].sort((x, y) => x - y)
  let unaccountedNs = 0
  let rightNs = 0
  let conflict = false
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i]
    const length = cuts[i + 1] - from
    const truth = ref.marks.find((s) => s.fromNs <= from && from < s.toNs)?.category
    const here = new Set<Category>()
    for (const m of valid) if (m.fromNs <= from && from < m.toNs) here.add(m.category)
    if (here.size === 0) unaccountedNs += length
    else if (here.size > 1) conflict = true
    else if (here.has(truth as Category)) rightNs += length
  }
  if (conflict) problems.push('marks of different categories overlap')

  if (gapAsk && ref.largestGap !== null) {
    const idle = valid.filter((m) => IDLE.has(m.category)).sort((x, y) => x.fromNs - y.fromNs || x.toNs - y.toNs)
    const joined: { fromNs: number; toNs: number }[] = []
    for (const m of idle) {
      const last = joined[joined.length - 1]
      if (last && m.fromNs <= last.toNs) last.toNs = Math.max(last.toNs, m.toNs)
      else joined.push({ fromNs: m.fromNs, toNs: m.toNs })
    }
    if (!joined.some((j) => j.fromNs === ref.largestGap!.fromNs && j.toNs === ref.largestGap!.toNs)) problems.push("the gap's two edges are not both marked")
  }

  const asked = c.ask !== 'attribute'
  const causeOk = !asked || (ref.largestGap === null ? cause === null : cause !== null && ref.largestGap.cause >= 0 && cause === ref.largestGap.cause)
  return { unaccountedNs, rightNs, windowNs: scope.toNs - scope.fromNs, causeOk, problems }
}

/** Whether a check passes: at least 95% of the scored stretch in the right category, nothing wrong with the marks, and the cause when asked. */
export function huntPass(r: HuntCheck): boolean {
  return r.causeOk && r.problems.length === 0 && r.rightNs * 100 >= r.windowNs * 95
}

// ---------------------------------------------------------------------------------------------------------------------------
// The bestiary: answers that look plausible and are wrong

export interface HuntWrong {
  readonly id: string
  /** What the learner who gave it believed. */
  readonly label: string
  readonly marks: Mark[]
  readonly cause: number | null
}

const NAMED: Readonly<Record<string, string>> = { 'cpu-gap': 'the GPU waited on the CPU', 'both-idle': 'nothing was busy' }

/**
 * Wrong answers for a case, each of which `checkHunt` fails: causes a learner might name with the marks right (when the case asks
 * for a cause), and partitions a learner might draw with the cause right. Each is a belief about the step that the trace refutes.
 */
export function huntBestiary(c: HuntCase): HuntWrong[] {
  const t = c.trace
  const ref = referenceSplit(c)
  const right = ref.marks
  const gap = ref.largestGap
  const out: HuntWrong[] = []
  const rightCause = gap === null ? null : gap.cause
  const a = attributionOf(c)

  if (c.ask !== 'attribute' && gap !== null) {
    const cause = findCause(t, gap)
    const wrongCause = (id: string, label: string, event: number | null): void => {
      if (event !== rightCause && !out.some((w) => w.cause === event && w.marks === right)) out.push({ id, label, marks: right, cause: event })
    }
    wrongCause('no-cause', 'the gap has no cause to name', null)
    // The longest main-thread span of the window: the widest-looking one.
    let widest = -1
    let widestNs = 0
    let launchCall = -1
    let before = -1
    for (let i = 0; i < spanCount(t); i++) {
      const v = spanView(t, i)
      if ((v.kind === 'cpu-thread' || v.kind === 'cuda-api') && v.startNs < a.toNs && v.endNs > a.fromNs && v.durNs > widestNs) {
        widest = i
        widestNs = v.durNs
      }
      if (cause !== null && v.kind === 'cuda-api' && v.startNs === cause.leadInToNs && v.durNs > 0) launchCall = i
      if (v.kind === 'gpu-stream' && v.endNs === gap.fromNs) before = i
    }
    if (widest >= 0) wrongCause('widest-span', 'the longest span of the main thread is the cause', widest)
    if (launchCall >= 0) wrongCause('launch-call', 'the call that launched the work is the cause', launchCall)
    if (before >= 0) wrongCause('last-gpu-work', 'the GPU work before the gap is the cause', before)
    if (cause !== null) {
      for (let i = 0; i < spanCount(t); i++) {
        const v = spanView(t, i)
        if ((v.kind === 'cpu-thread' || v.kind === 'cuda-api') && v.startNs < cause.leadInToNs && v.endNs > cause.leadInFromNs) wrongCause(`in-the-lead-in-${i}`, 'another span of the main thread before the launch is the cause', i)
      }
    }
    // A span of the main thread that is busy in another gap of the step: the stall's own work.
    for (const g of a.gaps) {
      if (g.fromNs === gap.fromNs) continue
      for (let i = 0; i < spanCount(t); i++) {
        const v = spanView(t, i)
        if ((v.kind === 'cpu-thread' || v.kind === 'cuda-api') && v.startNs < g.toNs && v.endNs > g.fromNs) wrongCause('other-gap', "a span of another gap's wait is the cause", i)
      }
    }
  }

  if (c.ask === 'gap') {
    if (gap !== null) {
      out.push({ id: 'edge-off-by-one', label: 'the gap starts one ns late', marks: [{ fromNs: gap.fromNs + 1, toNs: gap.toNs, category: 'cpu-gap' }], cause: rightCause })
      out.push({ id: 'whole-step-idle', label: 'the whole step is the gap', marks: [{ fromNs: a.fromNs, toNs: a.toNs, category: 'cpu-gap' }], cause: rightCause })
      out.push({ id: 'gap-is-kernel', label: 'the GPU was busy in the gap', marks: [{ fromNs: gap.fromNs, toNs: gap.toNs, category: 'kernel' }], cause: rightCause })
    }
  } else {
    out.push({ id: 'all-kernel', label: 'the whole step is kernels', marks: [{ fromNs: a.fromNs, toNs: a.toNs, category: 'kernel' }], cause: rightCause })
    out.push({ id: 'gaps-left-blank', label: 'only the GPU-busy time is worth marking', marks: right.filter((m) => !IDLE.has(m.category)), cause: rightCause })
    out.push({
      id: 'waiting-is-nothing-busy',
      label: NAMED['both-idle'],
      marks: right.map((m) => (m.category === 'cpu-gap' ? { ...m, category: 'both-idle' as const } : m)),
      cause: rightCause,
    })
  }
  return out
}

export type { HuntCause }
