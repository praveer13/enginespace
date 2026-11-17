import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { KitMoment } from './first-move'

/*
 * The feedback of REDESIGN §2.6 that every game shares, apart from the first run:
 *
 *   - Named moments: the first time a rule is felt in a level it is named once, beside the object. A game gives a table of rules
 *     (`KitMoment`), each a pure function of the view before an action and the view after it; the frame asks the table after every action
 *     and shows the first rule that occurred and has not been named in this level yet.
 *   - The delta: a readout steps to its new value at once, and the change sits beside it for one second (DeltaChip). Only a value that has
 *     itself changed gets one.
 *   - Where a note sits: beside its object, inside the drawing's box, so the words point at the thing they name.
 *
 * Nothing here dispatches, stores or times anything the grade reads: the moments and deltas are what a view shows, and they go with a reload.
 */

/** A named moment as the frame shows it: its line, the object it is said beside, and the action it followed. */
export interface Named {
  /** The first rule named, which places the note. */
  readonly id: string
  /** Every rule named by this action: two rules first felt on one action are named together, each at its first time. */
  readonly ids: readonly string[]
  readonly line: string
  readonly anchor: string | null
  readonly turn: number
}

/** The rules of the table that occurred between two views and have not been named yet, as one note, or null. */
export function momentAt<View>(moments: readonly KitMoment<View>[], seen: ReadonlySet<string>, before: View, after: View, turn: number): Named | null {
  const ids: string[] = []
  const lines: string[] = []
  let anchor: string | null = null
  for (const moment of moments) {
    if (seen.has(moment.id)) continue
    const line = moment.line(before, after)
    if (line === null) continue
    if (ids.length === 0) anchor = moment.anchor?.(before, after) ?? null
    ids.push(moment.id)
    lines.push(line)
  }
  return ids.length === 0 ? null : { id: ids[0], ids, line: lines.join(' '), anchor, turn }
}

/** The values that changed between two readings, by id, as signed differences. A value that did not change has no entry. */
export function deltasOf(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, value] of Object.entries(after)) {
    const was = before[id]
    if (was !== undefined && was !== value) out[id] = value - was
  }
  return out
}

/** How long a delta stays: one second, then the chip's own fade (dur-step). Under reduced motion the chip does not fade, and goes at once. */
export const DELTA_MS = 1000 + 240

/**
 * The deltas of a readout, for one second after each change: by id, the difference and a key that changes with each new delta, so the chip
 * remounts. A restart remounts the run, and its first reading is the base.
 */
export function useDeltas(values: Readonly<Record<string, number>>): Readonly<Record<string, { value: number; key: number }>> {
  const text = JSON.stringify(values)
  const last = useRef(text)
  const counter = useRef(0)
  const [shown, setShown] = useState<Readonly<Record<string, { value: number; key: number }>>>({})
  useEffect(() => {
    if (last.current === text) return
    const changed = deltasOf(JSON.parse(last.current) as Record<string, number>, JSON.parse(text) as Record<string, number>)
    last.current = text
    if (Object.keys(changed).length === 0) return
    counter.current += 1
    const key = counter.current
    setShown(Object.fromEntries(Object.entries(changed).map(([id, value]) => [id, { value, key }])))
    const timer = window.setTimeout(() => setShown((now) => Object.fromEntries(Object.entries(now).filter(([, delta]) => delta.key !== key))), DELTA_MS)
    return () => window.clearTimeout(timer)
  }, [text])
  return shown
}

/** A box inside `host`, in its own coordinates, for an absolutely placed note or disc. */
export interface Box {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}

/** Where `element` is drawn inside `host`, in `host`'s coordinates. */
export function boxIn(host: Element, element: Element): Box {
  const outer = host.getBoundingClientRect()
  const inner = element.getBoundingClientRect()
  return {
    top: inner.top - outer.top,
    left: inner.left - outer.left,
    width: inner.width,
    height: inner.height,
  }
}

/**
 * Keeps a measure of the page fresh: `measure` runs after every render that changes `deps`, when the host resizes, and when anything inside
 * it scrolls (the diagram scrolls in its box on a small screen).
 */
export function useMeasure(host: RefObject<HTMLElement | null>, measure: () => void, deps: readonly unknown[]): void {
  const latest = useRef(measure)
  useLayoutEffect(() => {
    latest.current = measure
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller names what the measure depends on
  useLayoutEffect(() => latest.current(), deps)
  useEffect(() => {
    const element = host.current
    if (element === null) return
    let frame = 0
    const again = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => latest.current())
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(again)
    observer?.observe(element)
    element.addEventListener('scroll', again, true)
    window.addEventListener('scroll', again, { passive: true })
    window.addEventListener('resize', again)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      element.removeEventListener('scroll', again, true)
      window.removeEventListener('scroll', again)
      window.removeEventListener('resize', again)
    }
  }, [host])
}
