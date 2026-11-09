/*
 * W1-T09: the window the tape shows (src/trace/viewport.ts, geometry.ts): zoom and pan in whole ns, kept on the paper, and a ruler
 * whose holes are round numbers.
 */
import { describe, expect, test } from 'bun:test'
import { rowAt, rowY, tapeGeometry, timeToX, xToTime, STACKED_BELOW } from '@/trace/geometry'
import { clampWindow, fitWindow, marginNs, MIN_WINDOW_NS, maxWindowNs, panWindow, revealNs, ruler, rulerLabel, zoomWindow } from '@/trace/viewport'

const extent = { fromNs: 0, toNs: 1_000_000 }
const whole = (n: number) => Number.isInteger(n)

describe('the window', () => {
  test('zooming in halves it about the anchor and the anchor keeps its place on the paper', () => {
    const win = { fromNs: 200_000, toNs: 600_000 }
    const zoomed = zoomWindow(win, 0.5, 300_000, extent)
    expect(zoomed.toNs - zoomed.fromNs).toBe(200_000)
    // 300,000 was a quarter of the way across; it still is.
    expect((300_000 - zoomed.fromNs) / 200_000).toBeCloseTo(0.25, 6)
  })

  test('zooming out doubles it, up to the whole tape and its margins and no further', () => {
    let win = { fromNs: 400_000, toNs: 500_000 }
    for (let i = 0; i < 12; i++) win = zoomWindow(win, 2, 450_000, extent)
    expect(win.toNs - win.fromNs).toBe(maxWindowNs(extent))
    expect(win.fromNs).toBe(extent.fromNs - marginNs(extent))
  })

  test('zooming in stops at the shortest window', () => {
    let win = { fromNs: 400_000, toNs: 500_000 }
    for (let i = 0; i < 20; i++) win = zoomWindow(win, 0.5, 450_000, extent)
    expect(win.toNs - win.fromNs).toBe(MIN_WINDOW_NS)
  })

  test('panning moves it by the amount and stops at the paper’s end', () => {
    const win = { fromNs: 100_000, toNs: 200_000 }
    expect(panWindow(win, 25_000, extent)).toEqual({ fromNs: 125_000, toNs: 225_000 })
    const left = panWindow(win, -1e9, extent)
    expect(left.fromNs).toBe(extent.fromNs - marginNs(extent))
    expect(left.toNs - left.fromNs).toBe(100_000)
    const right = panWindow(win, 1e9, extent)
    expect(right.toNs).toBe(extent.toNs + marginNs(extent))
  })

  test('every result is a whole number of ns, and at least the shortest window', () => {
    let win = { fromNs: 123_457, toNs: 987_001 }
    for (let i = 0; i < 40; i++) {
      win = i % 3 === 0 ? zoomWindow(win, 0.5, win.fromNs + 7, extent) : i % 3 === 1 ? panWindow(win, 33_333.3, extent) : zoomWindow(win, 2, win.toNs - 5, extent)
      expect([win.fromNs, win.toNs].every(whole)).toBe(true)
      expect(win.toNs - win.fromNs).toBeGreaterThanOrEqual(MIN_WINDOW_NS)
    }
  })

  test('fitting a step leaves a margin of a twentieth of it each side', () => {
    const fitted = fitWindow({ fromNs: 100_000, toNs: 200_000 }, extent)
    expect(fitted).toEqual({ fromNs: 96_000, toNs: 204_000 })
  })

  test('a window that is off the paper is brought back', () => {
    const win = clampWindow({ fromNs: 5_000_000, toNs: 5_100_000 }, extent)
    expect(win.toNs).toBe(extent.toNs + marginNs(extent))
  })

  test('revealing moves the window the least that shows a time with room to spare', () => {
    const win = { fromNs: 100_000, toNs: 200_000 }
    expect(revealNs(win, 150_000, extent)).toBe(win)
    expect(revealNs(win, 250_000, extent)).toEqual({ fromNs: 160_000, toNs: 260_000 })
    expect(revealNs(win, 50_000, extent)).toEqual({ fromNs: 40_000, toNs: 140_000 })
  })
})

describe('the ruler', () => {
  test('numbers a tick about every 96 px, at a round step, with minor ticks between', () => {
    const r = ruler({ fromNs: 0, toNs: 1_000_000 }, 960)
    expect(r.majorNs).toBe(100_000)
    expect(r.minorNs).toBe(20_000)
    expect(r.ticks.filter((t) => t.major).length).toBe(11)
    expect(r.ticks.length).toBe(51)
  })

  test('uses quarters for a 2 step, so the minor tick is a round number as well', () => {
    const r = ruler({ fromNs: 0, toNs: 200_000 }, 960)
    expect(r.majorNs).toBe(20_000)
    expect(r.minorNs).toBe(5_000)
  })

  test('holds its tick count down on a window of any size', () => {
    for (const length of [300, 4_000, 17_642_000, 5_000_000_000]) {
      expect(ruler({ fromNs: 12_345, toNs: 12_345 + length }, 1200).ticks.length).toBeLessThan(120)
    }
  })

  test('prints one unit across the ruler, the largest the window reaches, with the digits the step needs', () => {
    const at15ms = ruler({ fromNs: 15_000_000, toNs: 17_000_000 }, 960)
    expect(at15ms.format).toEqual({ divisor: 1_000_000, unit: 'ms', decimals: 1 })
    expect(rulerLabel(15_500_000, at15ms.format)).toBe('15.5 ms')
    expect(rulerLabel(16_000_000, at15ms.format)).toBe('16.0 ms')
    const small = ruler({ fromNs: 15_800_000, toNs: 15_840_000 }, 960)
    expect(small.format.unit).toBe('ms')
    expect(rulerLabel(15_805_000, small.format)).toBe('15.805 ms')
  })

  test('drops to µs and then to ns when the step is too fine for ms', () => {
    const fine = ruler({ fromNs: 15_800_000, toNs: 15_800_600 }, 960)
    expect(fine.format.unit).toBe('µs')
    expect(rulerLabel(15_800_200, fine.format)).toBe('15,800.2 µs')
    const finest = ruler({ fromNs: 15_800_000, toNs: 15_800_300 }, 960)
    expect(finest.format.unit).toBe('µs')
    expect(ruler({ fromNs: 100, toNs: 900 }, 960).format.unit).toBe('ns')
  })

  test('groups thousands and signs a time before zero', () => {
    const format = { divisor: 1_000, unit: 'µs', decimals: 0 } as const
    expect(rulerLabel(1_234_000, format)).toBe('1,234 µs')
    expect(rulerLabel(-2_000, format)).toBe('−2 µs')
  })
})

describe('where things sit on the paper', () => {
  test('wide, the lane names stand in a gutter and the paper starts after it', () => {
    const g = tapeGeometry([1, 2, 1], 1200)
    expect(g.stacked).toBe(false)
    expect(g.plotX).toBe(g.gutter)
    expect(g.gutter).toBeGreaterThan(100)
    expect(g.lanes[1].rows).toBe(2)
    expect(g.lanes[1].h).toBeGreaterThan(g.lanes[0].h)
    expect(g.lanes[1].y).toBe(g.lanes[0].y + g.lanes[0].h)
    expect(g.height).toBe(g.foot.y + g.foot.h)
  })

  test('narrow, the gutter is gone and each lane has a strip above it for its name', () => {
    const g = tapeGeometry([1, 1, 1], STACKED_BELOW - 1)
    expect(g.stacked).toBe(true)
    expect(g.gutter).toBe(0)
    expect(g.lanes.every((lane) => lane.labelH > 0)).toBe(true)
    expect(g.plotW).toBeGreaterThan(300)
  })

  test('has no rail for marks when marking is off', () => {
    expect(tapeGeometry([1], 1000, { rail: false }).rail.h).toBe(0)
    expect(tapeGeometry([1], 1000, { rail: true }).rail.h).toBeGreaterThan(0)
  })

  test('time and x convert both ways', () => {
    const g = tapeGeometry([1], 1000)
    const win = { fromNs: 1_000, toNs: 9_000 }
    expect(timeToX(g, win, 1_000)).toBe(g.plotX)
    expect(timeToX(g, win, 9_000)).toBe(g.plotX + g.plotW)
    expect(xToTime(g, win, timeToX(g, win, 4_321))).toBeCloseTo(4_321, 6)
  })

  test('a y finds its lane and row, and the padding finds none', () => {
    const g = tapeGeometry([1, 3], 1000)
    const second = g.lanes[1]
    expect(rowAt(g, rowY(second, 2) + 3)).toEqual({ lane: 1, row: 2 })
    expect(rowAt(g, rowY(g.lanes[0], 0) + 1)).toEqual({ lane: 0, row: 0 })
    expect(rowAt(g, 2)).toBeNull()
  })
})
