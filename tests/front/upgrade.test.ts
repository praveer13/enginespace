/*
 * When the front page's pass turns 3D (src/front/upgrade.ts; ARCHITECTURE §6.10, §6.11): after the largest contentful paint and on
 * idle, at tier 1 or above, never under data saver on its own (the Stage then offers it), and not on a 2G connection until asked. The
 * browser's parts are stood in for, so the waits are checked step by step.
 */
import { describe, expect, test } from 'bun:test'
import type { DeviceTier } from '@/scene/tiers'
import { IDLE_TIMEOUT_MS, readConnection, upgradeOf, whenSettled, type SettleWindow } from '@/front/upgrade'

const device = (tier: 0 | 1 | 2, known = true, saveData = false): DeviceTier => ({
  tier,
  reason: 'default',
  known,
  hints: known ? { webgl2: tier > 0, majorPerformanceCaveat: false, coarsePointer: false, deviceMemory: 8, hardwareConcurrency: 8, maxTextureSize: 16384, saveData } : null,
})
const fast = { saveData: false, effectiveType: '4g' }

describe('what the pass does once the page has settled', () => {
  test('a device that draws 3D loads the scene', () => {
    expect(upgradeOf(device(1), fast)).toBe('load')
    expect(upgradeOf(device(2), { saveData: false, effectiveType: null })).toBe('load')
  })

  test('a device that draws no 3D, or has not said yet, stays 2D', () => {
    expect(upgradeOf(device(0), fast)).toBe('never')
    expect(upgradeOf(device(2, false), fast)).toBe('never')
  })

  test('data saver offers the scene and never loads it on its own, whichever way the browser says so', () => {
    expect(upgradeOf(device(2), { saveData: true, effectiveType: '4g' })).toBe('offer')
    expect(upgradeOf(device(2, true, true), fast)).toBe('offer')
  })

  test('a 2G connection waits for the learner to ask', () => {
    expect(upgradeOf(device(2), { saveData: false, effectiveType: '2g' })).toBe('wait')
    expect(upgradeOf(device(2), { saveData: false, effectiveType: 'slow-2g' })).toBe('wait')
    expect(upgradeOf(device(2), { saveData: false, effectiveType: '3g' })).toBe('load')
  })

  test('the connection is read from the Network Information API, and is a fast one where there is none', () => {
    expect(readConnection(undefined)).toEqual({ saveData: false, effectiveType: null })
    expect(readConnection({ connection: { saveData: true, effectiveType: '2g' } } as unknown as Navigator)).toEqual({ saveData: true, effectiveType: '2g' })
    expect(readConnection({} as Navigator)).toEqual({ saveData: false, effectiveType: null })
  })
})

/** A window to drive by hand: LCP entries, idle callbacks, timers and the load event happen when the test says so. */
function fakeWindow({ lcp = true, idle = true, readyState = 'loading' }: { lcp?: boolean; idle?: boolean; readyState?: string } = {}) {
  const log: string[] = []
  let observer: ((list: { getEntries(): readonly unknown[] }) => void) | null = null
  let disconnected = false
  const idles = new Map<number, () => void>()
  const timers = new Map<number, { run: () => void; ms: number }>()
  const loads = new Set<() => void>()
  let next = 1
  class Observer {
    static supportedEntryTypes = lcp ? ['largest-contentful-paint', 'layout-shift'] : ['layout-shift']
    constructor(callback: (list: { getEntries(): readonly unknown[] }) => void) {
      observer = callback
    }
    observe(options: { type: string; buffered: boolean }) {
      log.push(`observe ${options.type} buffered=${options.buffered}`)
    }
    disconnect() {
      disconnected = true
    }
  }
  const win: SettleWindow = {
    document: { readyState },
    PerformanceObserver: Observer,
    requestIdleCallback: idle
      ? (run, options) => {
          log.push(`idle timeout=${options.timeout}`)
          idles.set(next, run)
          return next++
        }
      : undefined,
    cancelIdleCallback: (handle) => void idles.delete(handle),
    setTimeout: (run, ms) => {
      log.push(`timeout ${ms}`)
      timers.set(next, { run, ms })
      return next++
    },
    clearTimeout: (handle) => void timers.delete(handle),
    addEventListener: (_type, listener) => void loads.add(listener),
    removeEventListener: (_type, listener) => void loads.delete(listener),
  }
  return {
    win,
    log,
    paint: (entries = 1) => observer?.({ getEntries: () => Array.from({ length: entries }, () => ({})) }),
    // A browser runs each idle callback and each timer once.
    idle: () => {
      const due = [...idles.values()]
      idles.clear()
      due.forEach((run) => run())
    },
    time: () => {
      const due = [...timers.values()]
      timers.clear()
      due.forEach((timer) => timer.run())
    },
    load: () => [...loads].forEach((listener) => listener()),
    disconnected: () => disconnected,
  }
}

describe('the page settles after its largest paint, then on idle', () => {
  test('nothing runs before the largest paint; then an idle callback with the timeout of A§6.10 runs it, once', () => {
    const w = fakeWindow()
    let runs = 0
    whenSettled(w.win, () => runs++)
    expect(w.log).toEqual(['observe largest-contentful-paint buffered=true'])
    w.idle()
    w.paint(0)
    expect(runs).toBe(0)
    w.paint()
    expect(w.disconnected()).toBe(true)
    expect(w.log).toContain(`idle timeout=${IDLE_TIMEOUT_MS}`)
    expect(runs).toBe(0)
    w.idle()
    expect(runs).toBe(1)
    w.paint()
    w.idle()
    expect(runs).toBe(1)
    expect(IDLE_TIMEOUT_MS).toBe(1500)
  })

  test('without requestIdleCallback it waits the timeout instead', () => {
    const w = fakeWindow({ idle: false })
    let runs = 0
    whenSettled(w.win, () => runs++)
    w.paint()
    expect(w.log).toContain(`timeout ${IDLE_TIMEOUT_MS}`)
    expect(runs).toBe(0)
    w.time()
    expect(runs).toBe(1)
  })

  test('a browser without the LCP entry type waits for the load event, or goes on at once when the page has loaded', () => {
    const waiting = fakeWindow({ lcp: false })
    let runs = 0
    whenSettled(waiting.win, () => runs++)
    waiting.idle()
    expect(runs).toBe(0)
    waiting.load()
    waiting.idle()
    expect(runs).toBe(1)

    const loaded = fakeWindow({ lcp: false, readyState: 'complete' })
    let more = 0
    whenSettled(loaded.win, () => more++)
    loaded.idle()
    expect(more).toBe(1)
  })

  test('a cancelled wait never runs', () => {
    const w = fakeWindow()
    let runs = 0
    const cancel = whenSettled(w.win, () => runs++)
    w.paint()
    cancel()
    w.idle()
    expect(runs).toBe(0)
  })
})
