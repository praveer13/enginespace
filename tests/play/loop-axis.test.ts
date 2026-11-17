/*
 * The timing diagram's axis numbers (src/games/loop/axis.ts): no number shows cut by the track's edges. Second-look finding: the debrief at
 * 390 x 844 read "0" for tick 20, where the window opened just before tick 20.
 */
import { describe, expect, test } from 'bun:test'
import { tickAnchor, wholeAxisLeft } from '@/games/loop/axis'

describe('the axis numbers', () => {
  test('a number is centred on its tick, set from or up to it at the edges, and left out where an edge would cut it', () => {
    expect(tickAnchor(100, '20', 0, 400)).toBe('middle')
    expect(tickAnchor(2, '0', 0, 400)).toBe('start')
    expect(tickAnchor(398, '28', 0, 400)).toBe('end')
    // 6 px in from the left: past the edge's start rule, too close for a centred "20".
    expect(tickAnchor(6, '20', 0, 400)).toBeNull()
    expect(tickAnchor(394, '36', 0, 400)).toBeNull()
  })

  test('a window that would open through a number opens just before it instead, by less than a number', () => {
    const ticks = [20, 22, 24].map((t, i) => ({ x: 10 + i * 32, text: String(t) }))
    // The window would open at 7 px: "20" at 10 px would straddle the edge.
    const left = wholeAxisLeft(7, ticks)
    expect(left).toBeLessThan(7)
    expect(7 - left).toBeLessThan(16)
    expect(10 - left).toBeGreaterThanOrEqual(7)
    // Between two numbers, the window stays where it was put.
    expect(wholeAxisLeft(25, ticks)).toBe(25)
  })
})
