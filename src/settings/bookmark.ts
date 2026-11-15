/*
 * The bookmark, `es:here` (D-066, REDESIGN §2.4): the lesson, section and part last in view. A lesson page keeps it, and the pages that
 * open the ledger read it for `nextStep`. It is a place, never progress, and deleting it loses the place only. It lives apart from
 * store.ts, which every page loads at first paint, because only those pages need it.
 *
 *   useBookmark(route)  on a lesson page: keeps the part whose heading has been in view for two seconds, and the part in view when the
 *                       learner acts (a click, a change). It returns the place, so the page's way on follows it at once.
 */
import { useEffect, useState } from 'react'
import { isLine, isObject, isPath, PLACE_KEYS, readJson, writeJson } from './store'

/** The bookmark, as `es:here` holds it. src/progress/next.ts reads it as its `Bookmark`. */
export interface Place {
  readonly route: string
  readonly section?: 'run' | 'read' | 'test' | 'keep'
  readonly part?: string
  readonly title?: string
  readonly at: string
}

/** The bookmark `es:here` holds, or null. */
export function decodePlace(value: unknown): Place | null {
  if (!isObject(value) || !isPath(value.route) || typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) return null
  const section = value.section === 'run' || value.section === 'read' || value.section === 'test' || value.section === 'keep' ? value.section : undefined
  const part = typeof value.part === 'string' && /^[a-z0-9-]{1,120}$/.test(value.part) ? value.part : undefined
  const title = isLine(value.title) ? value.title : undefined
  return { route: value.route, at: value.at, ...(section === undefined ? {} : { section }), ...(part === undefined ? {} : { part }), ...(title === undefined ? {} : { title }) }
}

export const readPlace = (): Place | null => decodePlace(readJson(PLACE_KEYS.here))

/** Keeps the place last in view. Only a lesson page calls it. */
export function keepPlace(place: Place): void {
  const clean = decodePlace(place)
  if (clean !== null) writeJson(PLACE_KEYS.here, clean)
}

/** How long a part's heading stays in view before it is the place: a glance on the way past is not [estimated]. */
export const DWELL_MS = 2000

/**
 * Keeps the place last in view on the lesson at `route`: the `h2` headings with an id inside `root` are its parts. `test` is the id of
 * the heading that opens the lesson's Test, so a place there says so. Before the first heading the place is the Run.
 */
export function useBookmark(route: string, root: HTMLElement | null, test?: string): Place | null {
  const [place, setPlace] = useState<Place | null>(null)
  useEffect(() => {
    if (root === null || typeof IntersectionObserver === 'undefined') return
    const headings = [...root.querySelectorAll<HTMLHeadingElement>('h2[id]')]
    const keep = (heading: HTMLHeadingElement | null) => {
      const at = new Date().toISOString()
      const next: Place =
        heading === null
          ? { route, section: 'run', at }
          : { route, section: heading.id === test ? 'test' : 'read', part: heading.id, title: (heading.textContent ?? '').trim().slice(0, 200), at }
      keepPlace(next)
      setPlace(next)
    }
    // The part in view: the last heading above the upper third of the viewport.
    const current = (): HTMLHeadingElement | null => {
      let found: HTMLHeadingElement | null = null
      for (const heading of headings) if (heading.getBoundingClientRect().top <= window.innerHeight / 3) found = heading
      return found
    }
    const timers = new Map<Element, number>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const known = timers.get(entry.target)
        if (entry.isIntersecting && known === undefined) {
          timers.set(entry.target, window.setTimeout(() => keep(entry.target as HTMLHeadingElement), DWELL_MS))
        } else if (!entry.isIntersecting && known !== undefined) {
          window.clearTimeout(known)
          timers.delete(entry.target)
        }
      }
    })
    for (const heading of headings) observer.observe(heading)
    const act = () => keep(current())
    root.addEventListener('click', act)
    root.addEventListener('change', act)
    return () => {
      observer.disconnect()
      for (const timer of timers.values()) window.clearTimeout(timer)
      root.removeEventListener('click', act)
      root.removeEventListener('change', act)
    }
  }, [route, root, test])
  return place
}
