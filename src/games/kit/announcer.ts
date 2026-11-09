import { useEffect, useState } from 'react'

/*
 * The announcer (ARCHITECTURE §6.9): one polite live region per game, fed through a queue that coalesces.
 *
 * A turn can say several things at once (a ticket hung, a step fired, a slot left empty), and a screen reader that speaks each
 * in turn talks over the next. So messages are held for a short window and spoken as one, and during auto-play at most one
 * announcement leaves per second. Nothing is dropped silently except a message said twice in the same window, and the mirror
 * carries every number the scene draws, so the line is a summary and never the only place a fact appears.
 *
 * `createAnnouncer` is plain code over injectable timers, so a test drives it with fake ones. `useAnnouncer` is the thin hook.
 */

/** What the live region renders. A new `id` makes the same text read again. */
export interface Announcement {
  readonly id: number
  readonly text: string
}

/** The clock and timers the queue uses. The default is the page's; a test passes its own. */
export interface AnnouncerTimers {
  now(): number
  setTimer(run: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

const pageTimers: AnnouncerTimers = {
  now: () => Date.now(),
  setTimer: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimer: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
}

/** Messages said within this long of the first are spoken as one [estimated]. */
export const ANNOUNCE_WINDOW_MS = 100
/** The least time between two announcements during auto-play (ARCHITECTURE §6.9). */
export const AUTOPLAY_GAP_MS = 1000
/** A coalesced announcement is cut to its latest messages beyond this many characters [estimated]. */
export const ANNOUNCE_MAX_CHARS = 400

export interface AnnouncerOptions {
  readonly windowMs?: number
  readonly autoplayGapMs?: number
  readonly maxChars?: number
  readonly timers?: AnnouncerTimers
}

export interface Announcer {
  /** Queues a message. Empty ones are ignored. */
  say(message: string): void
  /** Auto-play is running: announcements leave at most once per second. */
  setAutoplay(on: boolean): void
  /** Speaks what is queued now. */
  flush(): void
  /** Forgets what is queued and cancels the timer. The announcer stays usable. */
  cancel(): void
}

/** The text of a batch: the messages in order, joined, and cut from the front to fit `maxChars`. */
function joined(messages: readonly string[], maxChars: number): string {
  const kept = [...messages]
  while (kept.length > 1 && kept.join(' ').length > maxChars) kept.shift()
  return kept.join(' ')
}

export function createAnnouncer(onAnnounce: (text: string) => void, options: AnnouncerOptions = {}): Announcer {
  const { windowMs = ANNOUNCE_WINDOW_MS, autoplayGapMs = AUTOPLAY_GAP_MS, maxChars = ANNOUNCE_MAX_CHARS, timers = pageTimers } = options
  let pending: string[] = []
  let timer: unknown = null
  let lastAt = Number.NEGATIVE_INFINITY
  let autoplay = false

  const emit = () => {
    if (timer !== null) timers.clearTimer(timer)
    timer = null
    if (pending.length === 0) return
    const text = joined(pending, maxChars)
    pending = []
    lastAt = timers.now()
    onAnnounce(text)
  }

  return {
    say(message) {
      const text = message.trim()
      if (text === '') return
      if (!pending.includes(text)) pending.push(text)
      if (timer !== null) return
      const wait = Math.max(windowMs, lastAt + (autoplay ? autoplayGapMs : 0) - timers.now())
      timer = timers.setTimer(emit, wait)
    },
    setAutoplay(on) {
      autoplay = on
    },
    flush: emit,
    cancel() {
      if (timer !== null) timers.clearTimer(timer)
      timer = null
      pending = []
    },
  }
}

/**
 * An announcer whose announcements land in state, for `LiveRegion` to render. The options configure the queue once, when the
 * game mounts. It cancels its timer when the game unmounts.
 */
export function useAnnouncer(options?: AnnouncerOptions): { announcement: Announcement | null; announcer: Announcer } {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [announcer] = useState(() => {
    let count = 0
    return createAnnouncer((text) => {
      count += 1
      setAnnouncement({ id: count, text })
    }, options)
  })
  useEffect(() => () => announcer.cancel(), [announcer])
  return { announcement, announcer }
}
