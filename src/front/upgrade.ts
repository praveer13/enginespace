/*
 * When the front page's pass turns 3D (ARCHITECTURE §6.10 and §6.11, D-023; TRACKER W0-T18).
 *
 * The first paint is the static HTML: the order ticket with the heading, and the poster in the pass's box. The 2D game takes the box
 * over when the entry and the front page's chunk have run. The 3D scene comes last: after the largest contentful paint and on idle
 * (`requestIdleCallback`, or after IDLE_TIMEOUT_MS where there is none), and only
 *   - at tier 1 or above (tiers.ts: WebGL2 in hardware, and the learner has not chosen 2D in Settings);
 *   - without data saver: the Stage then shows its note and loads the scene only when asked (A§6.6);
 *   - on a connection that is not reported as 2G: the scene then waits for the 3D button.
 * Whatever the device, the learner's own choice of view wins: the 3D button asks for the scene at once, and `V` swaps the views.
 *
 * Nothing here imports three. The scene's chunks load when the Stage mounts the scene, which is the prefetch A§6.10 asks for.
 */
import { useSyncExternalStore } from 'react'
import type { DeviceTier } from '@/scene/tiers'

/** How long to wait for idle after the largest paint before the 3D loads anyway, in ms (A§6.10) [estimated]. */
export const IDLE_TIMEOUT_MS = 1500

/** What the connection says about itself (the Network Information API, where the browser has it). */
export interface Connection {
  readonly saveData: boolean
  /** `slow-2g`, `2g`, `3g` or `4g`, or null where the browser does not say. */
  readonly effectiveType: string | null
}

type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }

export function readConnection(nav: NavigatorWithConnection | undefined = typeof navigator === 'undefined' ? undefined : navigator): Connection {
  const connection = nav?.connection
  return { saveData: connection?.saveData === true, effectiveType: typeof connection?.effectiveType === 'string' ? connection.effectiveType : null }
}

/**
 * What the pass does once the page has settled:
 *   load   mount the Stage, which loads the scene and swaps it in;
 *   offer  mount the Stage, which keeps the 2D view and offers the scene behind a button (data saver);
 *   wait   stay 2D until the learner asks for 3D (a 2G connection);
 *   never  stay 2D: the device draws no 3D, or has not said yet.
 */
export type Upgrade = 'load' | 'offer' | 'wait' | 'never'

export function upgradeOf(device: DeviceTier, connection: Connection): Upgrade {
  if (!device.known || device.tier < 1) return 'never'
  if (connection.saveData || device.hints?.saveData === true) return 'offer'
  if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') return 'wait'
  return 'load'
}

/** The window's part this needs, so the tests can stand in for it. */
export interface SettleWindow {
  readonly document: { readonly readyState: string }
  readonly PerformanceObserver?: { new (callback: (list: { getEntries(): readonly unknown[] }) => void): { observe(options: { type: string; buffered: boolean }): void; disconnect(): void }; readonly supportedEntryTypes?: readonly string[] }
  requestIdleCallback?(callback: () => void, options: { timeout: number }): number
  cancelIdleCallback?(handle: number): void
  setTimeout(callback: () => void, ms: number): number
  clearTimeout(handle: number): void
  addEventListener(type: 'load', listener: () => void, options: { once: boolean }): void
  removeEventListener(type: 'load', listener: () => void): void
}

/**
 * Calls `run` once, after the largest contentful paint and then on idle. A browser without the LCP entry type waits for the load event
 * instead. A tab opened in the background paints nothing until it is shown, so LCP, and the 3D with it, waits until then. Returns the
 * function that cancels the wait.
 */
export function whenSettled(win: SettleWindow, run: () => void, idleTimeoutMs: number = IDLE_TIMEOUT_MS): () => void {
  let cancelled = false
  let idleHandle: number | null = null
  let timeoutHandle: number | null = null
  let observer: { disconnect(): void } | null = null

  const idle = () => {
    if (cancelled) return
    const fire = () => {
      if (!cancelled) run()
    }
    if (typeof win.requestIdleCallback === 'function') idleHandle = win.requestIdleCallback(fire, { timeout: idleTimeoutMs })
    else timeoutHandle = win.setTimeout(fire, idleTimeoutMs)
  }

  const onLoad = () => idle()
  const lcp = win.PerformanceObserver?.supportedEntryTypes?.includes('largest-contentful-paint') === true
  if (lcp && win.PerformanceObserver) {
    let seen = false
    const watching = new win.PerformanceObserver((list) => {
      if (seen || list.getEntries().length === 0) return
      seen = true
      watching.disconnect()
      idle()
    })
    observer = watching
    watching.observe({ type: 'largest-contentful-paint', buffered: true })
  } else if (win.document.readyState === 'complete') {
    idle()
  } else {
    win.addEventListener('load', onLoad, { once: true })
  }

  return () => {
    cancelled = true
    observer?.disconnect()
    win.removeEventListener('load', onLoad)
    if (idleHandle !== null) win.cancelIdleCallback?.(idleHandle)
    if (timeoutHandle !== null) win.clearTimeout(timeoutHandle)
  }
}

let settled = false
let waiting = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!settled && !waiting) {
    waiting = true
    whenSettled(window, () => {
      settled = true
      for (const notify of listeners) notify()
    })
  }
  return () => {
    listeners.delete(listener)
  }
}

/** True once the page has had its largest paint and an idle moment: false on the server and in the first renders. */
export function useSettled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => settled,
    () => false,
  )
}
