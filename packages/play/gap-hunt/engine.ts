/**
 * What a level's cases are made of (GAMES.md §6): the traces a level draws, the step of each case, the edges a mark can snap to, the
 * reference (the model's own partition, `packages/sim/trace`) and what arrives already marked.
 *
 * Traces are typed arrays and sit outside the state. The level holds a case's seed, trace and step, and this file makes the rest from them,
 * keeping the last few so that the gate and the probes, which ask for the same cases again and again, do not draw them again.
 */
import { below, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { attributeSteps, huntCase, huntTraces, referenceSplit, spanCount, spanView, stepWindows } from '@es/sim/trace'
import type { EsTrace, HuntAsk as ModelAsk, HuntCase, HuntSplit, Mark } from '@es/sim/trace'
import { CAT_COPY, CAT_KERNEL } from '@es/sim/trace'
import { HUNT_CATEGORY_ORDER } from './types'
import type { CaseRef, HuntLevel, HuntLevelId } from './types'

/** The seed on which `gap` and `attribute` are practice: any other seed is a graded run (the one pinned seed, as Tensor views' `grid`). */
export const HUNT_PRACTICE_SEED = 0

/** Cases a graded run holds: "on 3 new steps" (TR3's design, item 6). A practice run holds one. */
export const GRADED_CASES = 3

/** The most marks a graded `attribute` case may need (TR3's design, item 11): the model's band keeps the reference partition within it [estimated]. */
export const MOST_MARKS = 12

/** Draws of a case's seed before the draw gives up. The band keeps most steps, so one or two are enough; this is far more. */
export const DRAW_ATTEMPTS = 200

/** The ask each level makes of the model: `attribute` asks for the partition and the largest gap's cause. */
const ASK: Readonly<Record<HuntLevelId, ModelAsk>> = { read: 'gap', graphs: 'attribute', gap: 'gap', attribute: 'both' }

const KEPT_TRACES = 64
const traces = new Map<string, EsTrace[]>()

/** The two traces a case's seed draws on `level`. */
export function tracesOf(level: HuntLevelId, seed: Seed): EsTrace[] {
  const key = `${level}/${seed}`
  let got = traces.get(key)
  if (got === undefined) {
    got = huntTraces(seed, level)
    if (traces.size >= KEPT_TRACES) traces.clear()
    traces.set(key, got)
  }
  return got
}

/** The model's case for a level's case reference. */
export function huntCaseOf(id: HuntLevelId, ref: CaseRef): HuntCase {
  return { trace: tracesOf(id, ref.seed)[ref.trace], step: ref.step, ask: ASK[id] }
}

/**
 * The case references of a level: one on a practice seed, three on a graded one, each drawn from a seed of its own with the model's
 * `huntCase`, which keeps to its band. A seed that draws no case in `DRAW_ATTEMPTS` throws, and is not in the band.
 */
export function drawCases(id: HuntLevelId, seed: Seed): CaseRef[] {
  const rng = rngFor(seed, `gap-hunt/${id}/cases`)
  const want = isGraded(id, seed) ? GRADED_CASES : 1
  const out: CaseRef[] = []
  for (let attempt = 0; attempt < DRAW_ATTEMPTS && out.length < want; attempt++) {
    const sub = below(rng, 4294967296)
    try {
      const set = tracesOf(id, sub)
      const c = huntCase(set, sub, id)
      const ref: CaseRef = { seed: sub, trace: set.indexOf(c.trace), step: c.step }
      // `read` needs a launch call and the kernel it started inside the window.
      if (id !== 'read' || readTarget(dataOf(id, ref)) !== null) out.push(ref)
    } catch {
      // This seed has no step in the band: draw another.
    }
  }
  if (out.length < want) throw new RangeError(`no case was drawn for level ${id} on seed ${seed}`)
  return out
}

/** Whether a run of level `id` on `seed` is graded: `gap` and `attribute` are, on every seed but the practice seed. */
export const isGraded = (id: HuntLevelId, seed: Seed): boolean => (id === 'gap' || id === 'attribute') && seed !== HUNT_PRACTICE_SEED

/** Everything the rules know of one case. */
export interface CaseData {
  readonly hunt: HuntCase
  readonly fromNs: number
  readonly toNs: number
  /** The ns a mark can start or end at: the window's two ends and every edge of a span inside it, in order. */
  readonly edges: readonly number[]
  readonly split: HuntSplit
  /** The ns of the window in each category, in `HUNT_CATEGORY_ORDER`. */
  readonly byCategory: readonly number[]
  /** The index of the category with the most ns (the first of those that tie): the answer to the opening guess. */
  readonly largest: number
  /** Kernels the window runs, on any stream: the answer of `graphs`. */
  readonly kernels: number
}

const KEPT_CASES = 256
const cases = new Map<string, CaseData>()

function build(id: HuntLevelId, ref: CaseRef): CaseData {
  const hunt = huntCaseOf(id, ref)
  const t = hunt.trace
  const w = stepWindows(t)[ref.step]
  const a = attributeSteps(t)[ref.step]
  const points = new Set<number>([w.fromNs, w.toNs])
  let kernels = 0
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (v.kind === 'marker') continue
    for (const p of [v.startNs, v.endNs]) if (p > w.fromNs && p < w.toNs) points.add(p)
    if (v.kind === 'gpu-stream' && v.cat === CAT_KERNEL && v.durNs > 0 && v.startNs >= w.fromNs && v.startNs < w.toNs) kernels++
  }
  const byCategory = [a.kernelNs, a.copyOnlyNs, a.cpuGapNs, a.bothIdleNs]
  let largest = 0
  byCategory.forEach((n, i) => {
    if (n > byCategory[largest]) largest = i
  })
  return { hunt, fromNs: w.fromNs, toNs: w.toNs, edges: [...points].sort((x, y) => x - y), split: referenceSplit(hunt), byCategory, largest, kernels }
}

/** The data of the case `ref` of level `id`. */
export function dataOf(id: HuntLevelId, ref: CaseRef): CaseData {
  const key = `${id}/${ref.seed}/${ref.trace}/${ref.step}`
  let got = cases.get(key)
  if (got === undefined) {
    got = build(id, ref)
    if (cases.size >= KEPT_CASES) cases.clear()
    cases.set(key, got)
  }
  return got
}

/** The data of case `i` of a level. */
export const caseOf = (level: HuntLevel, i: number): CaseData => dataOf(level.id, level.cases[i])

/** The trace of case `i`, for the view to draw. */
export const traceOfCase = (level: HuntLevel, i: number): EsTrace => caseOf(level, i).hunt.trace

/**
 * The marks a case starts with, which a learner cannot take back (TR3's design, item 6): on `gap` the GPU-busy spans (kernel and copy-only),
 * on practice `attribute` the kernel spans, and on every other level, and graded `attribute`, none.
 */
export function presetMarks(level: HuntLevel, i: number): Mark[] {
  const marks = caseOf(level, i).split.marks
  if (level.id === 'gap') return marks.filter((m) => m.category === 'kernel' || m.category === 'copy')
  if (level.id === 'attribute' && !level.graded) return marks.filter((m) => m.category === 'kernel')
  return []
}

/** The kernel that `read` asks for: the first kernel of the window that a launch call started, and that call. Null when the window has none. */
export function readTarget(c: CaseData): { readonly kernel: number; readonly launch: number } | null {
  const t = c.hunt.trace
  for (let i = 0; i < spanCount(t); i++) {
    const v = spanView(t, i)
    if (v.kind !== 'gpu-stream' || v.cat !== CAT_KERNEL || v.durNs <= 0 || v.corr < 0 || v.startNs < c.fromNs || v.startNs >= c.toNs) continue
    for (let j = 0; j < spanCount(t); j++) {
      const w = spanView(t, j)
      if (w.kind === 'cuda-api' && w.corr === v.corr && (w.cat === 'launch' || w.cat === CAT_COPY)) return { kernel: i, launch: j }
    }
  }
  return null
}

/** The ns of the window that no mark covers: marks are clipped to the window and joined, so an overlap is counted once. */
export function unaccountedOf(fromNs: number, toNs: number, marks: readonly Mark[]): number {
  const spans = marks
    .map((m) => [Math.max(m.fromNs, fromNs), Math.min(m.toNs, toNs)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let covered = 0
  let edge = fromNs
  for (const [a, b] of spans) {
    const start = Math.max(a, edge)
    if (b > start) {
      covered += b - start
      edge = b
    }
  }
  return toNs - fromNs - covered
}

/** Whether two marks of different categories cover one ns. */
export function overlapsOf(marks: readonly Mark[]): boolean {
  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) {
      if (marks[i].category !== marks[j].category && marks[i].fromNs < marks[j].toNs && marks[j].fromNs < marks[i].toNs) return true
    }
  }
  return false
}

export const categoryIndex = (c: string): number => HUNT_CATEGORY_ORDER.indexOf(c as (typeof HUNT_CATEGORY_ORDER)[number])
