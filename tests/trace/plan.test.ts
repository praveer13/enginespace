/*
 * W1-T09: what one frame draws (src/trace/plan.ts). The plan merges spans a pixel apart, so a hundred thousand spans zoomed out
 * stay under GAMES.md §6's 5,000 rectangles, a window zoomed in draws each span as it is, and a gap a pixel wide stays a gap.
 */
import { describe, expect, test } from 'bun:test'
import { tapeGeometry, rowY } from '@/trace/geometry'
import { buildIndex } from '@/trace/model'
import { buildPlan, createPlan, inkOf, MERGE_GAP_PX } from '@/trace/plan'
import { fitWindow } from '@/trace/viewport'
import { traceBuilder } from '@es/sim/trace'
import { bigTape, night } from './support'

const geometryOf = (index: ReturnType<typeof buildIndex>, width = 1200) => tapeGeometry(index.lanes.map((lane) => lane.rows), width)

describe('the plan', () => {
  test('draws each span of a window zoomed in on a few, as it is', () => {
    const b = traceBuilder()
    const gpu = b.track('gpu-stream', 'GPU stream 0')
    b.span(gpu, 1_000, 2_000, 'a', 'kernel')
    b.span(gpu, 4_000, 1_000, 'b', 'kernel')
    b.span(gpu, 6_500, 500, 'c', 'copy')
    const index = buildIndex(b.build({ source: 'synthetic', synthetic: true }))
    const g = geometryOf(index)
    const plan = createPlan()
    buildPlan(plan, index, { fromNs: 0, toNs: 8_000 }, g)
    const scale = g.plotW / 8_000
    const y = rowY(g.lanes[0], 0)
    expect(inkOf(plan, y).map(([a, c]) => [Math.round((a - g.plotX) / scale), Math.round((c - g.plotX) / scale)])).toEqual([
      [1_000, 3_000],
      [4_000, 5_000],
      [6_500, 7_000],
    ])
    expect(plan.count[2]).toBe(2) // kernel
    expect(plan.count[3]).toBe(1) // copy
    expect(plan.total).toBe(3)
  })

  test('merges thin spans less than a pixel apart into one run, and keeps a gap of a pixel or more', () => {
    const b = traceBuilder()
    const gpu = b.track('gpu-stream', 'GPU stream 0')
    // The window is 1,000 ns over 1,000 px: 1 ns is 1 px, so each of these is 2 px, which is thinner than a block.
    b.span(gpu, 100, 2, 'a', 'kernel')
    b.span(gpu, 102, 2, 'b', 'kernel') // touches: joins the run
    b.span(gpu, 104, 2, 'c', 'kernel') // touches: joins the run
    b.span(gpu, 300, 2, 'd', 'kernel') // 194 px away: a new run
    const index = buildIndex(b.build({ source: 'synthetic', synthetic: true }))
    const g = tapeGeometry([1], 1000 + 164 + 14, { rail: true })
    const plan = createPlan()
    buildPlan(plan, index, { fromNs: 0, toNs: g.plotW }, g)
    expect(plan.count[2]).toBe(2)
    expect(plan.w[2][0]).toBeCloseTo(6, 4)
    expect(MERGE_GAP_PX).toBeLessThan(1)
  })

  test('keeps spans wide enough to see apart, so the edge between two that touch is drawn', () => {
    const b = traceBuilder()
    const gpu = b.track('gpu-stream', 'GPU stream 0')
    b.span(gpu, 100, 50, 'a', 'kernel')
    b.span(gpu, 150, 50, 'b', 'kernel') // touches a, and each is 50 px: both are blocks
    b.span(gpu, 200, 50, 'c', 'kernel')
    const index = buildIndex(b.build({ source: 'synthetic', synthetic: true }))
    const g = tapeGeometry([1], 1000 + 164 + 14, { rail: true })
    const plan = createPlan()
    buildPlan(plan, index, { fromNs: 0, toNs: g.plotW }, g)
    expect(plan.count[2]).toBe(3)
    expect([0, 1, 2].map((n) => Math.round(plan.w[2][n]))).toEqual([50, 50, 50])
  })

  test('never draws a span thinner than a pixel as nothing', () => {
    const b = traceBuilder()
    const gpu = b.track('gpu-stream', 'GPU stream 0')
    b.span(gpu, 500, 0, 'blip', 'kernel')
    const index = buildIndex(b.build({ source: 'synthetic', synthetic: true }))
    const g = geometryOf(index)
    const plan = createPlan()
    buildPlan(plan, index, { fromNs: 0, toNs: 1_000_000 }, g)
    expect(plan.total).toBe(1)
    expect(plan.w[2][0]).toBeGreaterThanOrEqual(1)
  })

  test('puts each style’s rectangles in its own list, on the lane and row of the span', () => {
    const index = night()
    const g = geometryOf(index)
    const plan = createPlan()
    buildPlan(plan, index, fitWindow(index.steps[2], index.extent), g)
    // frames, launches, kernels, copies and syncs are all on an eager night.
    for (const style of [0, 1, 2, 3, 4]) expect(plan.count[style]).toBeGreaterThan(0)
    expect(plan.count[5]).toBe(0)
    const laneTops = g.lanes.map((lane) => lane.rowsY)
    for (let n = 0; n < plan.count[2]; n++) expect(plan.y[2][n]).toBe(laneTops[2])
  })

  test('stays inside the paper', () => {
    const index = night()
    const g = geometryOf(index)
    const plan = createPlan()
    buildPlan(plan, index, { fromNs: index.extent.fromNs + 5_000_000, toNs: index.extent.fromNs + 9_000_000 }, g)
    for (let style = 0; style < 6; style++) {
      for (let n = 0; n < plan.count[style]; n++) {
        expect(plan.x[style][n]).toBeGreaterThanOrEqual(g.plotX - 0.001)
        expect(plan.x[style][n] + plan.w[style][n]).toBeLessThanOrEqual(g.plotX + g.plotW + 1.001)
      }
    }
  })
})

describe('a tape of 100,000 spans', () => {
  const { index } = bigTape()
  const g = geometryOf(index, 1440)

  test('zoomed all the way out stays under 5,000 rectangles (GAMES.md §6)', () => {
    const plan = createPlan()
    buildPlan(plan, index, index.extent, g)
    expect(plan.visited).toBeGreaterThanOrEqual(100_000)
    expect(plan.total).toBeLessThan(5_000)
    expect(plan.total).toBeGreaterThan(0)
  })

  test('zoomed in on a step, keeps one rectangle for each span or fewer', () => {
    const plan = createPlan()
    const step = index.steps[300]
    buildPlan(plan, index, fitWindow(step, index.extent), g)
    expect(plan.visited).toBeLessThan(400)
    expect(plan.total).toBeLessThanOrEqual(plan.visited)
  })

  test('plans every window of a pan in a few ms on average [measured by this run, printed]', () => {
    const plan = createPlan()
    const length = 5_000_000
    const frames = 120
    const t0 = performance.now()
    for (let f = 0; f < frames; f++) {
      const fromNs = index.extent.fromNs + f * 400_000
      buildPlan(plan, index, { fromNs, toNs: fromNs + length }, g)
    }
    const each = (performance.now() - t0) / frames
    console.log(`plan: ${each.toFixed(3)} ms per frame over ${frames} frames of ${length} ns on ${index.trace.spans.track.length} spans`)
    expect(each).toBeLessThan(20)
  })

  test('the whole tape in one window plans in under 50 ms', () => {
    const plan = createPlan()
    const t0 = performance.now()
    for (let i = 0; i < 5; i++) buildPlan(plan, index, index.extent, g)
    const each = (performance.now() - t0) / 5
    console.log(`plan: ${each.toFixed(2)} ms per frame with every one of ${index.trace.spans.track.length} spans in the window`)
    expect(each).toBeLessThan(50)
  })

  test('runs out of room by stretching the last rectangle and not by dropping ink', () => {
    const plan = createPlan(8)
    buildPlan(plan, index, { fromNs: index.extent.fromNs, toNs: index.extent.fromNs + 20_000_000 }, g)
    for (let style = 0; style < 6; style++) expect(plan.count[style]).toBeLessThanOrEqual(8)
  })
})
