/*
 * The arithmetic behind e2e/perf.spec.ts's three numbers (e2e/support/vitals.ts): LCP, CLS and INP as web.dev defines them, checked on
 * made-up entries. The page only records, so these tests are what keeps the numbers the spec prints honest.
 */
import { describe, expect, test } from 'bun:test'
import {
  collect,
  cumulativeLayoutShift,
  interactionsOf,
  interactionToNextPaint,
  largestContentfulPaint,
  median,
  phasesOf,
} from '../../e2e/support/vitals'
import type { EventTiming, LargestPaint, LayoutShift } from '../../e2e/support/vitals'

const shift = (startTime: number, value: number, hadRecentInput = false): LayoutShift => ({ startTime, value, hadRecentInput })
const event = (interactionId: number, duration: number, name = 'click', startTime = interactionId * 100): EventTiming => ({
  name,
  startTime,
  duration,
  processingStart: startTime,
  processingEnd: startTime,
  interactionId,
  target: 'button',
})
const paint = (startTime: number, size: number, element = 'h1'): LargestPaint => ({ startTime, size, element })

describe('largest contentful paint', () => {
  test('is the last candidate: each is larger than the one before it', () => {
    expect(largestContentfulPaint([paint(800, 100), paint(1200, 400), paint(1500, 900, 'canvas')])?.element).toBe('canvas')
    expect(largestContentfulPaint([paint(1500, 900), paint(800, 100)])?.startTime).toBe(1500)
  })

  test('is null when nothing was painted', () => {
    expect(largestContentfulPaint([])).toBeNull()
  })
})

describe('cumulative layout shift', () => {
  test('is 0 for a page that never shifted', () => {
    expect(cumulativeLayoutShift([])).toBe(0)
  })

  test('sums the shifts of a window: each less than a second after the one before, and the window at most 5 s long', () => {
    expect(cumulativeLayoutShift([shift(1000, 0.02), shift(1900, 0.03), shift(2800, 0.01)])).toBeCloseTo(0.06, 10)
    // 1 s of gap or more starts a new window.
    expect(cumulativeLayoutShift([shift(1000, 0.02), shift(2000, 0.03)])).toBe(0.03)
    // A window ends at 5 s however close the shifts are: 0, 0.9, ..., 5.4 s is two windows.
    const steady = [0, 900, 1800, 2700, 3600, 4500, 5400].map((at) => shift(at, 0.01))
    expect(cumulativeLayoutShift(steady)).toBeCloseTo(0.06, 10)
  })

  test('is the largest window, not the sum of them', () => {
    expect(cumulativeLayoutShift([shift(100, 0.05), shift(3000, 0.04), shift(3500, 0.03), shift(9000, 0.06)])).toBeCloseTo(0.07, 10)
  })

  test('leaves out a shift that followed an input, and reads shifts in the order of their time', () => {
    expect(cumulativeLayoutShift([shift(100, 0.5, true), shift(200, 0.01)])).toBe(0.01)
    expect(cumulativeLayoutShift([shift(1800, 0.03), shift(1000, 0.02), shift(900, 0.01)])).toBeCloseTo(0.06, 10)
  })
})

describe('interaction to next paint', () => {
  test('groups the events of an interaction by its id and takes the longest of them', () => {
    const events = [event(1, 40, 'pointerdown'), event(1, 120, 'click'), event(1, 56, 'pointerup'), event(2, 80, 'keydown')]
    expect(interactionsOf(events).map((interaction) => [interaction.id, interaction.latency])).toEqual([
      [1, 120],
      [2, 80],
    ])
    const inp = interactionToNextPaint(events, 2)
    expect(inp.ms).toBe(120)
    expect(inp.worst?.event.name).toBe('click')
    expect(inp.interactions).toBe(2)
  })

  test('is the longest interaction below 50 interactions', () => {
    const events = Array.from({ length: 20 }, (_, i) => event(i + 1, 16 + i * 8))
    expect(interactionToNextPaint(events, 49).ms).toBe(16 + 19 * 8)
  })

  test('leaves out the longest interaction at 50, the two longest at 100, and so on', () => {
    const events = Array.from({ length: 12 }, (_, i) => event(i + 1, 100 + i * 8))
    expect(interactionToNextPaint(events, 50).ms).toBe(100 + 10 * 8)
    expect(interactionToNextPaint(events, 100).ms).toBe(100 + 9 * 8)
    expect(interactionToNextPaint(events, 149).ms).toBe(100 + 9 * 8)
    // The list of candidates is the ten longest, so it never reaches further down.
    expect(interactionToNextPaint(events, 5000).ms).toBe(100 + 2 * 8)
  })

  test('counts the interactions the browser did not list, which were too short to be the longest', () => {
    const events = [event(1, 200), event(2, 160)]
    expect(interactionToNextPaint(events, 60).ms).toBe(160)
    expect(interactionToNextPaint(events, 60).interactions).toBe(60)
    expect(interactionToNextPaint(events, 0).interactions).toBe(2)
  })

  test('ignores an event that belongs to no interaction, and is null when none lasted 16 ms', () => {
    expect(interactionToNextPaint([event(0, 900, 'mousemove'), event(-1, 900)], 0)).toEqual({ ms: null, interactions: 0, worst: null })
    expect(interactionToNextPaint([], 12).ms).toBeNull()
    expect(interactionToNextPaint([], 12).interactions).toBe(12)
  })
})

describe('the phases of an event', () => {
  test('split its duration into the wait for the main thread, the handlers and the wait for the frame', () => {
    const slow: EventTiming = { name: 'click', startTime: 1000, duration: 200, processingStart: 1030, processingEnd: 1050, interactionId: 1, target: 'button' }
    expect(phasesOf(slow)).toEqual({ inputDelay: 30, processing: 20, presentation: 150 })
    const { inputDelay, processing, presentation } = phasesOf(slow)
    expect(inputDelay + processing + presentation).toBe(slow.duration)
  })

  test('never go below zero, whatever rounding the browser did', () => {
    const odd: EventTiming = { name: 'click', startTime: 1000, duration: 8, processingStart: 999, processingEnd: 1012, interactionId: 1, target: 'button' }
    expect(phasesOf(odd)).toEqual({ inputDelay: 0, processing: 13, presentation: 0 })
  })
})

describe('median', () => {
  test('is the middle value, and the mean of the two in the middle for an even count', () => {
    expect(median([1700, 1590, 1600])).toBe(1600)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([7])).toBe(7)
    expect(() => median([])).toThrow()
  })
})

describe('the collector that runs in the page', () => {
  test('stands alone: its source text names nothing from this module, because Playwright sends only that text to the browser', () => {
    const source = collect.toString()
    for (const name of ['cumulativeLayoutShift', 'interactionToNextPaint', 'largestContentfulPaint', 'interactionsOf', 'median']) expect(source).not.toContain(name)
    // The runtime that transpiles the source decides its quotes.
    for (const type of ['largest-contentful-paint', 'layout-shift', 'event']) expect(source).toMatch(new RegExp(`["']${type}["']`))
  })
})
