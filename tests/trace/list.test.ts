/*
 * W2b-T101: the trace as a list, its pure part (src/trace/list.ts). The stretches cut a step where the GPU or the main thread changes what it
 * does, and no further; every stretch lies inside one stretch of the true partition, so a learner who names each stretch's category right
 * has every ns right; a pick is the session's actions (`mark`, `unmark`, `cause`), and a run of stretches with one category is one mark.
 */
import { describe, expect, test } from 'bun:test'
import { attribute, stepWindows } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { busyIndex } from '@es/sim/trace/busy'
import { gradeMarks } from '@/trace/grade'
import {
  applyListAction,
  applyListActions,
  causeActions,
  causeSpans,
  NAMES_SHOWN,
  pickActions,
  sides,
  stretchCategories,
  stretches,
  stretchesOf,
} from '@/trace/list'
import type { ListAction, Stretch } from '@/trace/list'
import { addMark, NO_ANNOTATIONS, unaccountedNs } from '@/trace/marks'
import type { Annotations, Category } from '@/trace/marks'
import { buildIndex, spanStart } from '@/trace/model'
import type { Win } from '@/trace/model'
import { specimenTrace } from '@/trace/specimen'
import { randomTrace } from './support'

const trace = specimenTrace(7)
const index = buildIndex(trace)
const step = stepWindows(trace)[5]
const rows = stretchesOf(trace, step)

/** The category the partition gives each instant, read by brute force from the trace's columns: no code of src/trace or of the sweep. */
function categoryAt(t: EsTrace, ns: number): { gpu: 'kernel' | 'copy' | 'idle'; cpu: boolean } {
  const kind = new Map(t.tracks.map((track) => [track.id, track.kind]))
  let kernel = false
  let copy = false
  let cpu = false
  for (let i = 0; i < t.spans.track.length; i++) {
    const s = t.spans.startNs[i]
    const e = s + t.spans.durNs[i]
    if (!(t.spans.durNs[i] > 0) || ns < s || ns >= e) continue
    const k = kind.get(t.spans.track[i])
    const cat = t.strings[t.spans.cat[i]]
    if (k === 'gpu-stream' && cat === 'kernel') kernel = true
    else if (k === 'gpu-stream' && cat === 'copy') copy = true
    else if (k === 'cpu-thread' || k === 'cuda-api') cpu = true
  }
  return { gpu: kernel ? 'kernel' : copy ? 'copy' : 'idle', cpu }
}

const truthOf = (row: Stretch): Category => (row.gpu === 'kernel' ? 'kernel' : row.gpu === 'copy' ? 'copy' : row.cpu ? 'cpu-gap' : 'both-idle')

/** Picks each stretch's true category in the order given, applying the actions as a host does. */
function pickAll(list: readonly Stretch[], order: readonly number[], start: Annotations = NO_ANNOTATIONS): Annotations {
  let notes = start
  for (const at of order) {
    const next = applyListActions(notes, pickActions(list, notes.marks, at, truthOf(list[at])))
    if (next === null) throw new Error(`the pick of stretch ${at} did not apply`)
    notes = next
  }
  return notes
}

const marked = (notes: Annotations, fromNs: number, toNs: number, category: Category | null): Annotations => {
  const made = addMark(notes, fromNs, toNs, category)
  if (!made.ok) throw new Error(made.why)
  return made.notes
}

// Random tapes (two GPU streams, overlapping calls, spans of no length) and the specimen's steps, over a few seeds.
const CASES: { name: string; trace: EsTrace; win: Win }[] = [
  ...Array.from({ length: 40 }, (_, i) => ({
    name: `random ${i + 1}`,
    trace: randomTrace(i + 1, 60),
    win: { fromNs: 0, toNs: 470 },
  })),
  ...[1, 2, 3].flatMap((seed) => {
    const t = specimenTrace(seed)
    return stepWindows(t).map((win, at) => ({
      name: `specimen ${seed} step ${at + 1}`,
      trace: t,
      win,
    }))
  }),
]

describe('stretches', () => {
  test('follow each other from the window’s start to its end, so their lengths add up to the window, in whole ns', () => {
    for (const c of CASES) {
      const list = stretchesOf(c.trace, c.win)
      expect(list[0].fromNs, c.name).toBe(c.win.fromNs)
      expect(list[list.length - 1].toNs, c.name).toBe(c.win.toNs)
      for (let i = 0; i < list.length; i++) {
        expect(list[i].toNs > list[i].fromNs, c.name).toBe(true)
        expect(Number.isSafeInteger(list[i].fromNs) && Number.isSafeInteger(list[i].toNs), c.name).toBe(true)
        if (i > 0) expect(list[i].fromNs, c.name).toBe(list[i - 1].toNs)
      }
    }
  })

  test('say what the GPU and the main thread do, as the trace’s own columns say at every edge, and two neighbours never say the same', () => {
    for (const c of CASES.slice(0, 40)) {
      const list = stretchesOf(c.trace, c.win)
      list.forEach((row, i) => {
        // Every ns of a random tape's window is read: the state is the same all through a stretch.
        for (let ns = row.fromNs; ns < row.toNs; ns++)
          expect(categoryAt(c.trace, ns), `${c.name} at ${ns}`).toEqual({
            gpu: row.gpu,
            cpu: row.cpu,
          })
        if (i > 0) expect(list[i - 1].gpu === row.gpu && list[i - 1].cpu === row.cpu, c.name).toBe(false)
      })
    }
  })

  test('each lies inside one stretch of the true partition, of the category its two sides give', () => {
    for (const c of CASES) {
      const truth = attribute(c.trace, c.win)
      for (const row of stretchesOf(c.trace, c.win)) {
        const inside = truth.segments.filter((segment) => segment.fromNs <= row.fromNs && segment.toNs >= row.toNs)
        expect(inside, `${c.name} [${row.fromNs}, ${row.toNs})`).toHaveLength(1)
        expect(inside[0].category).toBe(truthOf(row))
      }
    }
  })

  test('are not the answer: where a kernel runs on while the main thread stops, one category is two stretches', () => {
    const split = CASES.filter((c) => stretchesOf(c.trace, c.win).length > attribute(c.trace, c.win).segments.length)
    expect(split.length).toBeGreaterThan(0)
  })

  test('an empty window has none, and the specimen’s opening step has a few', () => {
    expect(stretches(busyIndex(trace), { fromNs: 5, toNs: 5 })).toEqual([])
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.length).toBeLessThanOrEqual(24)
  })
})

describe('what runs over a stretch', () => {
  test('names the GPU’s spans of that kind and the main thread’s innermost, at most a few of each with the rest counted', () => {
    for (const row of rows) {
      const { gpu, cpu } = sides(index, row)
      expect(gpu.names.length === 0).toBe(row.gpu === 'idle')
      expect(cpu.names.length === 0).toBe(!row.cpu)
      expect(gpu.names.length).toBeLessThanOrEqual(NAMES_SHOWN)
      expect(cpu.names.length).toBeLessThanOrEqual(NAMES_SHOWN)
      expect(new Set(gpu.names).size).toBe(gpu.names.length)
    }
    const kernel = rows.find((row) => row.gpu === 'kernel')
    expect(kernel).toBeDefined()
    expect(sides(index, kernel as Stretch).gpu.more).toBeGreaterThan(0)
  })
})

describe('the cause list', () => {
  test('holds the window’s frames and CUDA calls, and only those, in time order', () => {
    const spans = causeSpans(index, step)
    expect(spans.length).toBeGreaterThan(0)
    for (const span of spans) expect(['cpu-thread', 'cuda-api']).toContain(index.lanes[index.spanLane[span]].kind)
    for (let i = 1; i < spans.length; i++) expect(spanStart(index, spans[i])).toBeGreaterThanOrEqual(spanStart(index, spans[i - 1]))
    expect(spans.some((span) => index.trace.strings[index.trace.spans.name[span]] === 'cudaStreamSynchronize')).toBe(true)
  })

  test('naming a cause is one `cause` action, and naming it again asks nothing', () => {
    const span = causeSpans(index, step)[0]
    expect(causeActions(NO_ANNOTATIONS, span)).toEqual([{ t: 'cause', event: span }])
    const named = applyListActions(NO_ANNOTATIONS, causeActions(NO_ANNOTATIONS, span)) as Annotations
    expect(named.cause).toBe(span)
    expect(causeActions(named, span)).toEqual([])
    expect(applyListActions(named, causeActions(named, null))?.cause).toBeNull()
  })
})

describe('a pick', () => {
  test('of every stretch’s right category, in any order, leaves one mark for each stretch of the true partition, and the check reads them all right', () => {
    for (const c of CASES) {
      const list = stretchesOf(c.trace, c.win)
      const truth = attribute(c.trace, c.win)
      const forward = list.map((_, i) => i)
      const orders = [forward, [...forward].reverse(), forward.filter((i) => i % 2 === 0).concat(forward.filter((i) => i % 2 === 1))]
      for (const order of orders) {
        const notes = pickAll(list, order)
        const marks = [...notes.marks]
          .sort((a, b) => a.fromNs - b.fromNs)
          .map((m) => ({
            fromNs: m.fromNs,
            toNs: m.toNs,
            category: m.category,
          }))
        expect(marks, c.name).toEqual(
          truth.segments.map((s) => ({
            fromNs: s.fromNs,
            toNs: s.toNs,
            category: s.category,
          })),
        )
        expect(unaccountedNs(notes.marks, c.win), c.name).toBe(0)
        expect(stretchCategories(list, notes.marks), c.name).toEqual(list.map(truthOf))
        const grade = gradeMarks(c.trace, notes)
        expect(grade.errorNs, c.name).toBe(0)
        expect(grade.score, c.name).toBe(1)
      }
    }
  })

  test('of the category a stretch reads as already asks nothing', () => {
    const notes = pickAll(rows, [0])
    expect(pickActions(rows, notes.marks, 0, truthOf(rows[0]))).toEqual([])
    expect(pickActions(rows, notes.marks, rows.length, 'kernel')).toEqual([])
  })

  test('on a stretch inside a run of another category cuts the run in three, and picking it back makes the run one mark again', () => {
    const run = rows.map(() => 'kernel' as Category)
    let notes = NO_ANNOTATIONS
    run.forEach((category, at) => {
      notes = applyListActions(notes, pickActions(rows, notes.marks, at, category)) as Annotations
    })
    expect(notes.marks).toHaveLength(1)
    expect(notes.marks[0]).toMatchObject({
      fromNs: step.fromNs,
      toNs: step.toNs,
      category: 'kernel',
    })
    const middle = 1
    const actions = pickActions(rows, notes.marks, middle, 'copy')
    expect(actions[0]).toEqual({ t: 'unmark', index: 0 })
    expect(actions.slice(1).map((a) => (a.t === 'mark' ? a.category : a.t))).toEqual(['kernel', 'copy', 'kernel'])
    notes = applyListActions(notes, actions) as Annotations
    expect(stretchCategories(rows, notes.marks)).toEqual(rows.map((_, at) => (at === middle ? 'copy' : 'kernel')))
    expect(unaccountedNs(notes.marks, step)).toBe(0)
    notes = applyListActions(notes, pickActions(rows, notes.marks, middle, 'kernel')) as Annotations
    expect(notes.marks.map((m) => [m.fromNs, m.toNs, m.category])).toEqual([[step.fromNs, step.toNs, 'kernel']])
  })

  test('takes back a mark made on the lanes that crosses the stretch, and marks again the parts of it outside', () => {
    // A mark from the lanes: from inside the first stretch to inside the third, which no stretch edge bounds.
    const from = rows[0].fromNs + 10
    const to = rows[2].fromNs + 10
    const notes = marked(marked(NO_ANNOTATIONS, step.fromNs - 1_000, step.fromNs - 500, 'both-idle'), from, to, 'cpu-gap')
    const actions = pickActions(rows, notes.marks, 1, 'copy')
    const expected: ListAction[] = [
      { t: 'unmark', index: 1 },
      { t: 'mark', from, to: rows[1].fromNs, category: 'cpu-gap' },
      { t: 'mark', from: rows[1].fromNs, to: rows[1].toNs, category: 'copy' },
      { t: 'mark', from: rows[1].toNs, to, category: 'cpu-gap' },
    ]
    expect(actions).toEqual(expected)
    const after = applyListActions(notes, actions) as Annotations
    // The mark outside the step is untouched.
    expect(after.marks[0]).toMatchObject({
      fromNs: step.fromNs - 1_000,
      toNs: step.fromNs - 500,
      category: 'both-idle',
    })
    expect(after.marks).toHaveLength(4)
  })

  test('takes back marks from the last place to the first, so every place still names the mark it named', () => {
    let notes = NO_ANNOTATIONS
    for (const row of rows) notes = marked(notes, row.fromNs, row.toNs, row === rows[1] ? 'copy' : 'kernel')
    // Stretch 1 joins its two neighbours of the same category: three marks go, and one comes.
    const actions = pickActions(rows, notes.marks, 1, 'kernel')
    const unmarks = actions.filter((a) => a.t === 'unmark').map((a) => (a.t === 'unmark' ? a.index : -1))
    expect(unmarks).toEqual([2, 1, 0])
    const after = applyListActions(notes, actions) as Annotations
    expect(after.marks.filter((m) => m.toNs <= rows[2].toNs)).toHaveLength(1)
    expect(after.marks.find((m) => m.fromNs === step.fromNs)).toMatchObject({
      toNs: rows[2].toNs,
      category: 'kernel',
    })
  })
})

describe('applying actions', () => {
  test('is all or none: an action that cannot apply leaves the marks as they were', () => {
    const notes = marked(NO_ANNOTATIONS, 0, 10, 'kernel')
    expect(applyListAction(notes, { t: 'unmark', index: 1 })).toBeNull()
    expect(applyListAction(notes, { t: 'unmark', index: -1 })).toBeNull()
    expect(applyListAction(notes, { t: 'mark', from: 5, to: 5, category: 'copy' })).toBeNull()
    expect(
      applyListActions(notes, [
        { t: 'unmark', index: 0 },
        { t: 'unmark', index: 0 },
      ]),
    ).toBeNull()
    expect(applyListActions(notes, [])).toBe(notes)
    expect(applyListActions(notes, [{ t: 'unmark', index: 0 }])?.marks).toEqual([])
  })
})
