/*
 * The three numbers of the lab profile (ARCHITECTURE §11.1: LCP, INP and CLS), measured as web.dev defines them.
 *
 * The page only records: `collect` runs in every document before its own scripts (Playwright's addInitScript) and keeps the raw
 * entries of the three observers. The arithmetic runs here, in Node, on those entries, so tests/bundle/vitals.test.ts can check it
 * on made-up entries and a spec cannot drift from the definition without a test saying so. Nothing here depends on Playwright.
 *
 *   LCP  the render time of the last largest-contentful-paint entry. The browser stops reporting candidates at the first input.
 *   CLS  the largest session window of layout shifts that had no recent input: a window runs until a gap of 1 s between shifts, or
 *        5 s in all (web.dev, "Cumulative Layout Shift").
 *   INP  the longest interaction, but one is ignored for every 50 interactions (web.dev, "Interaction to Next Paint"). An
 *        interaction is the events that share an `interactionId`, and its latency is the longest of their durations.
 */

export interface LargestPaint {
  /** The render time in ms from the navigation's start. */
  startTime: number
  /** The painted area, in CSS px². */
  size: number
  /** The element, as `h1.es-ticket__title`. */
  element: string
}

export interface LayoutShift {
  startTime: number
  value: number
  hadRecentInput: boolean
}

export interface EventTiming {
  name: string
  startTime: number
  /** From the input to the next paint, in ms, rounded by the browser to 8 ms. */
  duration: number
  /** When the event's handlers began and ended, which split the duration into the wait for the main thread, the handlers, and the wait for the frame. */
  processingStart: number
  processingEnd: number
  interactionId: number
  /** The element, as `button[aria-label="Ring the bell"]`. */
  target: string
}

/** What the page recorded. */
export interface Raw {
  lcp: LargestPaint[]
  shifts: LayoutShift[]
  /** Events that belong to an interaction and last 16 ms or more: the shorter ones cannot be the longest. */
  events: EventTiming[]
  /** `performance.interactionCount`: every interaction of the page, the short ones too. */
  interactionCount: number
}

declare global {
  interface Window {
    /** Set by `collect`: what the page has recorded so far. */
    __vitals?: () => Raw
  }
}

/**
 * Runs in the page, before its scripts. It must stand alone: Playwright sends its source text to the browser, so it names nothing
 * from this module. Each observer is `buffered`, so an entry from before the observer started is still seen.
 */
export function collect(): void {
  const raw = { lcp: [] as unknown[], shifts: [] as unknown[], events: [] as unknown[] }
  const describe = (node: unknown): string => {
    if (!(node instanceof Element)) return ''
    const first = node.classList.item(0)
    const label = node.getAttribute('aria-label')
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${first ? `.${first}` : ''}${label ? `[aria-label="${label.slice(0, 40)}"]` : ''}`
  }
  const watch = (type: string, extra: object, each: (entry: PerformanceEntry & Record<string, unknown>) => void): void => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach((entry) => each(entry as PerformanceEntry & Record<string, unknown>))).observe({ type, buffered: true, ...extra })
    } catch {
      // The browser does not know this entry type: that number stays empty.
    }
  }
  watch('largest-contentful-paint', {}, (entry) => raw.lcp.push({ startTime: entry.startTime, size: entry.size, element: describe(entry.element) }))
  watch('layout-shift', {}, (entry) => raw.shifts.push({ startTime: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput }))
  watch('event', { durationThreshold: 16 }, (entry) => {
    if (typeof entry.interactionId === 'number' && entry.interactionId > 0) {
      raw.events.push({
        name: entry.name,
        startTime: entry.startTime,
        duration: entry.duration,
        processingStart: entry.processingStart,
        processingEnd: entry.processingEnd,
        interactionId: entry.interactionId,
        target: describe(entry.target),
      })
    }
  })
  window.__vitals = () => ({ ...raw, interactionCount: Number((performance as Performance & { interactionCount?: number }).interactionCount ?? 0) }) as Raw
}

/** The last largest paint: the one that stood when the page was settled, or null when nothing was painted. */
export function largestContentfulPaint(entries: readonly LargestPaint[]): LargestPaint | null {
  return entries.length === 0 ? null : entries.reduce((latest, entry) => (entry.startTime >= latest.startTime ? entry : latest))
}

/** Cumulative layout shift: the largest session window, over the shifts that had no recent input. */
export function cumulativeLayoutShift(shifts: readonly LayoutShift[]): number {
  let largest = 0
  let window = 0
  let first = 0
  let last = 0
  for (const shift of [...shifts].sort((a, b) => a.startTime - b.startTime)) {
    if (shift.hadRecentInput) continue
    if (window !== 0 && shift.startTime - last < 1000 && shift.startTime - first < 5000) {
      window += shift.value
    } else {
      window = shift.value
      first = shift.startTime
    }
    last = shift.startTime
    largest = Math.max(largest, window)
  }
  return largest
}

export interface Interaction {
  id: number
  /** The longest duration among the interaction's events. */
  latency: number
  /** The event that took that long. */
  event: EventTiming
}

export interface Inp {
  /** The interaction to next paint, in ms, or null when no interaction lasted as long as the API reports. */
  ms: number | null
  /** How many interactions the page had. */
  interactions: number
  /** The interaction that sets the number. */
  worst: Interaction | null
}

/** The interactions of a list of events, the longest first. */
export function interactionsOf(events: readonly EventTiming[]): Interaction[] {
  const byId = new Map<number, Interaction>()
  for (const event of events) {
    if (event.interactionId <= 0) continue
    const known = byId.get(event.interactionId)
    if (known === undefined || event.duration > known.latency) byId.set(event.interactionId, { id: event.interactionId, latency: event.duration, event })
  }
  return [...byId.values()].sort((a, b) => b.latency - a.latency || a.id - b.id)
}

/**
 * Interaction to next paint: the longest of the page's interactions, less one for every 50 interactions it had. The browser reports
 * only events of 16 ms and more, so `interactionCount` (all of them) says how many to leave out, as web.dev's own library does.
 */
export function interactionToNextPaint(events: readonly EventTiming[], interactionCount: number): Inp {
  const longest = interactionsOf(events).slice(0, 10)
  const interactions = Math.max(interactionCount, interactionsOf(events).length)
  if (longest.length === 0) return { ms: null, interactions, worst: null }
  const chosen = longest[Math.min(longest.length - 1, Math.floor(interactions / 50))]
  return { ms: chosen.latency, interactions, worst: chosen }
}

/** Where the time of an event went: waiting for the main thread, running the handlers, and waiting for the frame that shows the result. */
export function phasesOf(event: EventTiming): { inputDelay: number; processing: number; presentation: number } {
  return {
    inputDelay: Math.max(0, event.processingStart - event.startTime),
    processing: Math.max(0, event.processingEnd - event.processingStart),
    presentation: Math.max(0, event.startTime + event.duration - event.processingEnd),
  }
}

/** The middle value, or the mean of the two in the middle. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('the median of nothing')
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
