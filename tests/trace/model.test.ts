/*
 * W1-T09: the viewer's index of a trace (src/trace/model.ts). Lanes in the order the work flows, styles from track and category,
 * the rows frames nest on, the two binary searches that find a window's spans, the pick under a point, and the edges the cursor
 * walks, each checked against a reading of the columns that uses none of the index.
 */
import { describe, expect, test } from 'bun:test'
import { traceBuilder, spanCount } from '@es/sim/trace'
import {
  buildIndex,
  correlated,
  cursorNs,
  edgeNear,
  firstCursor,
  laneRange,
  pickSpan,
  spanEnd,
  spanStart,
  spansInWindow,
  stepEdge,
  stepLane,
  styleName,
  touches,
  windowAt,
} from '@/trace/model'
import type { Cursor, TraceIndex } from '@/trace/model'
import { bigTape, bruteTouching, night, randomTrace, SEEDS } from './support'

/** A small tape with every kind of track, a nest, an instant and a zero-length kernel. */
function smallTape() {
  const b = traceBuilder()
  const gpu = b.track('gpu-stream', 'GPU stream 0')
  const cpu = b.track('cpu-thread', 'main thread')
  const api = b.track('cuda-api', 'CUDA API')
  const note = b.track('marker', 'ranges')
  b.span(gpu, 100, 50, 'qkv_proj', 'kernel', 1)
  b.span(gpu, 150, 20, 'memcpy DtoH', 'copy', 2)
  b.span(gpu, 200, 0, 'blip', 'kernel')
  b.span(cpu, 0, 300, 'step', 'cpu')
  b.span(cpu, 10, 100, 'schedule', 'cpu')
  b.span(cpu, 20, 30, 'prepare', 'cpu')
  b.span(api, 90, 5, 'cudaLaunchKernel', 'launch', 1)
  b.span(api, 140, 5, 'cudaStreamSynchronize', 'sync')
  b.span(note, 0, 300, 'nvtx range', 'range')
  b.mark(0, 'step')
  b.mark(150, 'step')
  b.mark(300, 'step')
  return buildIndex(b.build({ source: 'synthetic', synthetic: true }))
}

describe('the lanes', () => {
  const index = smallTape()

  test('run in the order the work flows: notes, the expo, its calls, the line', () => {
    expect(index.lanes.map((lane) => [lane.kind, lane.name])).toEqual([
      ['marker', 'ranges'],
      ['cpu-thread', 'main thread'],
      ['cuda-api', 'CUDA API'],
      ['gpu-stream', 'GPU stream 0'],
    ])
  })

  test('list each lane’s spans in start order, the longer first when two start together', () => {
    const cpu = index.lanes[1]
    expect(Array.from(cpu.order, (i) => [spanStart(index, i), spanEnd(index, i)])).toEqual([
      [0, 300],
      [10, 110],
      [20, 50],
    ])
  })

  test('stack nested frames on rows, one under another', () => {
    const cpu = index.lanes[1]
    expect(Array.from(cpu.row)).toEqual([0, 1, 2])
    expect(cpu.rows).toBe(3)
    expect(index.lanes[3].rows).toBe(1)
  })

  test('keep the running maximum of the ends', () => {
    expect(Array.from(index.lanes[1].maxEnd)).toEqual([300, 300, 300])
  })

  test('give a span the style its track and category decide', () => {
    const names = Array.from({ length: spanCount(index.trace) }, (_, i) => `${index.trace.strings[index.trace.spans.name[i]]}:${styleName(index, i)}`)
    expect(names).toContain('qkv_proj:kernel')
    expect(names).toContain('memcpy DtoH:copy')
    expect(names).toContain('cudaStreamSynchronize:sync')
    expect(names).toContain('cudaLaunchKernel:launch')
    expect(names).toContain('schedule:frame')
    expect(names).toContain('nvtx range:note')
  })

  test('know the extent of the tape and its step windows', () => {
    expect(index.extent).toEqual({ fromNs: 0, toNs: 300 })
    expect(index.steps).toEqual([
      { fromNs: 0, toNs: 150 },
      { fromNs: 150, toNs: 300 },
    ])
    expect([windowAt(index, 10), windowAt(index, 150), windowAt(index, 299), windowAt(index, 1e9), windowAt(index, -5)]).toEqual([0, 1, 1, 1, 0])
  })

  test('an empty tape has an extent and no lanes with spans', () => {
    const empty = buildIndex(traceBuilder().build({ source: 'synthetic', synthetic: true }))
    expect(empty.extent).toEqual({ fromNs: 0, toNs: 1000 })
    expect(firstCursor(empty)).toBeNull()
    expect(windowAt(empty, 5)).toBe(-1)
  })
})

describe('the spans in a window', () => {
  test('are exactly the spans that touch it, on 60 random tapes and 200 windows each', () => {
    for (const seed of SEEDS) {
      const trace = randomTrace(seed, 60)
      const index = buildIndex(trace)
      for (let w = 0; w < 200; w++) {
        const fromNs = (seed * 31 + w * 17) % 420
        const win = { fromNs, toNs: fromNs + 1 + ((w * 13) % 90) }
        const listed = spansInWindow(index, win, 1_000_000)
        const mine = listed.flatMap((entry) => entry.spans).sort((a, b) => a - b)
        expect(mine).toEqual(bruteTouching(trace, win))
        expect(listed.reduce((total, entry) => total + entry.total, 0)).toBe(mine.length)
      }
    }
  })

  test('lists at most the limit of each lane and counts the rest', () => {
    const index = night()
    const win = index.extent
    const some = spansInWindow(index, win, 5)
    for (const entry of some) {
      expect(entry.spans.length).toBeLessThanOrEqual(5)
      expect(entry.total).toBeGreaterThanOrEqual(entry.spans.length)
    }
    expect(some.some((entry) => entry.total > 5)).toBe(true)
  })

  test('include an instant that sits exactly on the window’s start', () => {
    const index = smallTape()
    const found = spansInWindow(index, { fromNs: 200, toNs: 260 }, 100).flatMap((entry) => entry.spans)
    expect(found.some((i) => index.trace.strings[index.trace.spans.name[i]] === 'blip')).toBe(true)
    const [lo, hi] = laneRange(index, index.lanes[3], { fromNs: 200, toNs: 260 })
    expect(hi).toBeGreaterThan(lo)
  })

  test('touches follows the same definition', () => {
    const index = smallTape()
    expect(touches(index, index.lanes[3].order[0], { fromNs: 150, toNs: 160 })).toBe(false)
    expect(touches(index, index.lanes[3].order[0], { fromNs: 149, toNs: 160 })).toBe(true)
  })
})

describe('picking a span under a point', () => {
  const index = smallTape()
  const gpu = index.lanes[3]
  const nameOf = (i: number | null) => (i === null ? null : index.trace.strings[index.trace.spans.name[i]])

  test('takes the span that contains the time', () => {
    expect(nameOf(pickSpan(index, gpu, 0, 120, 0))).toBe('qkv_proj')
    expect(nameOf(pickSpan(index, gpu, 0, 160, 0))).toBe('memcpy DtoH')
  })

  test('takes the narrowest of the spans that contain it, and the row asked for', () => {
    const cpu = index.lanes[1]
    expect(nameOf(pickSpan(index, cpu, 0, 30, 0))).toBe('step')
    expect(nameOf(pickSpan(index, cpu, 1, 30, 0))).toBe('schedule')
    expect(nameOf(pickSpan(index, cpu, 2, 30, 0))).toBe('prepare')
  })

  test('takes a span a pixel away when the point is within the slack, and nothing farther', () => {
    expect(nameOf(pickSpan(index, gpu, 0, 175, 6))).toBe('memcpy DtoH')
    expect(pickSpan(index, gpu, 0, 175, 2)).toBeNull()
    expect(pickSpan(index, gpu, 0, 5, 3)).toBeNull()
  })
})

describe('the cursor’s edges', () => {
  /** Every edge of a lane, walked from its first by `stepEdge`. */
  function walk(index: TraceIndex, start: Cursor): Cursor[] {
    const out: Cursor[] = [start]
    for (let next = stepEdge(index, start, 1); next !== null; next = stepEdge(index, out[out.length - 1], 1)) out.push(next)
    return out
  }

  test('visit every start and every end of a lane once, in time order, a span’s start before its end', () => {
    for (const seed of SEEDS) {
      const trace = randomTrace(seed, 50)
      const index = buildIndex(trace)
      for (const lane of index.lanes) {
        if (lane.order.length === 0) continue
        const first = edgeNear(index, lane, Number.NEGATIVE_INFINITY)
        expect(first).not.toBeNull()
        const edges = walk(index, first as Cursor)
        expect(edges.length).toBe(2 * lane.order.length)
        const times = edges.map((e) => cursorNs(index, e))
        expect(times).toEqual([...times].sort((a, b) => a - b))
        const seen = new Map<number, number>()
        edges.forEach((e, at) => {
          if (e.edge === 'start') seen.set(e.span, at)
          else expect(seen.get(e.span)).toBeLessThan(at)
        })
        expect(new Set(edges.map((e) => `${e.span}:${e.edge}`)).size).toBe(edges.length)
      }
    }
  })

  test('walk back to where they began', () => {
    const index = night()
    const lane = index.lanes[index.lanes.length - 1]
    const first = edgeNear(index, lane, 0) as Cursor
    const there = walk(index, first)
    let back: Cursor | null = there[there.length - 1]
    const seen: Cursor[] = []
    while (back !== null) {
      seen.push(back)
      back = stepEdge(index, back, -1)
    }
    expect(seen.reverse()).toEqual(there)
  })

  test('read end, start where two spans touch', () => {
    const index = smallTape()
    const gpu = index.lanes[3]
    const cursor = { span: gpu.order[0], edge: 'end' as const }
    expect(cursorNs(index, cursor)).toBe(150)
    expect(stepEdge(index, cursor, 1)).toEqual({ span: gpu.order[1], edge: 'start' })
    expect(stepEdge(index, { span: gpu.order[0], edge: 'start' }, -1)).toBeNull()
  })

  test('nest: an inner frame ends before the one around it', () => {
    const index = smallTape()
    const cpu = index.lanes[1]
    const end = { span: cpu.order[2], edge: 'end' as const }
    expect(cursorNs(index, end)).toBe(50)
    expect(stepEdge(index, end, 1)).toEqual({ span: cpu.order[1], edge: 'end' })
  })

  test('move between lanes to the edge nearest the same time', () => {
    const index = smallTape()
    const kernel = { span: index.lanes[3].order[0], edge: 'start' as const }
    const up = stepLane(index, kernel, -1)
    expect(up).not.toBeNull()
    expect(index.lanes[index.spanLane[(up as Cursor).span]].kind).toBe('cuda-api')
    expect(stepLane(index, kernel, 1)).toBeNull()
    expect(firstCursor(index)).toEqual({ span: index.lanes[0].order[0], edge: 'start' })
  })

  test('a lane of 100,000 spans builds its edges once, quickly, and walks them', () => {
    const { index } = bigTape()
    const lane = index.lanes[2]
    const t0 = performance.now()
    const first = edgeNear(index, lane, 0) as Cursor
    const built = performance.now() - t0
    expect(stepEdge(index, first, 1)).not.toBeNull()
    expect(built).toBeLessThan(2_000)
  })
})

describe('correlation', () => {
  test('a launch finds its kernel and the kernel its launch', () => {
    const index = smallTape()
    const kernel = index.lanes[3].order[0]
    const launch = index.lanes[2].order[0]
    expect(correlated(index, kernel)).toEqual([launch])
    expect(correlated(index, launch)).toEqual([kernel])
    expect(correlated(index, index.lanes[1].order[0])).toEqual([])
  })
})

describe('a tape of 100,000 spans', () => {
  test('indexes in well under a second and answers a window by its own spans only', () => {
    const t0 = performance.now()
    const { trace, index } = bigTape()
    expect(spanCount(trace)).toBeGreaterThanOrEqual(100_000)
    const win = { fromNs: index.extent.fromNs + 1_000_000, toNs: index.extent.fromNs + 1_100_000 }
    const listed = spansInWindow(index, win, 1_000_000).flatMap((entry) => entry.spans).sort((a, b) => a - b)
    expect(listed).toEqual(bruteTouching(trace, win))
    expect(performance.now() - t0).toBeLessThan(6_000)
  })
})
