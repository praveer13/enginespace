/*
 * The twelve screen sizes a game is played at (the plan's DC-B, "in view"): two laptops, a short laptop window, a tablet held long, four
 * tall phones, two short phones, a phone turned on its side and a laptop at 200% zoom (640 x 400). Each game's `e2e/<game>-sizes.spec.ts`
 * plays every level at every size: after every move, Tab and Enter the control of the current decision, the ringed first move and the
 * focused control are wholly on the screen and topmost at their middle.
 *
 * And what a size spec asks of a box, in the page: whole on the screen, its own at its middle, and a touch target's room.
 */
import type { Locator, Page } from '@playwright/test'

export interface ScreenSize {
  readonly width: number
  readonly height: number
}

export const SIZES: readonly ScreenSize[] = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 620 },
  { width: 1024, height: 768 },
  { width: 412, height: 915 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 800 },
  { width: 360, height: 640 },
  { width: 320, height: 640 },
  { width: 844, height: 390 },
  { width: 640, height: 400 },
]

/** A size's name in a test's title: "390 x 844". */
export const sizeName = (size: ScreenSize): string => `${size.width} x ${size.height}`

/** The narrow layout: the dock under the drawing (frame.css, under 64rem). */
export const isNarrow = (size: ScreenSize): boolean => size.width < 1024

/** The narrow layout whose dock is pinned to the screen's foot (frame.css: under 64rem and at least 700 px tall). */
export const isPinned = (size: ScreenSize): boolean => size.width < 1024 && size.height >= 700

/** The smallest touch target, in CSS pixels (WCAG 2.5.5, the course's rule). */
export const TOUCH = 44

/** Where a box stands and whether the learner sees it: whole on the screen, and its own at its middle (nothing pinned or drawn over it). */
export interface Seen {
  readonly whole: boolean
  readonly own: boolean
  readonly box: readonly [number, number, number, number]
  readonly screen: readonly [number, number]
}

/** Whether a box is whole on the screen and topmost at its middle, as the learner sees it now. */
export async function seen(target: Locator): Promise<Seen> {
  return target.evaluate((element) => {
    const r = element.getBoundingClientRect()
    const whole = r.width > 0 && r.height > 0 && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5
    const at = whole ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
    const own = at !== null && (element.contains(at) || at.contains(element))
    return { whole, own, box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] as const, screen: [window.innerWidth, window.innerHeight] as const }
  })
}

/**
 * Whether a control takes a press over a square of TOUCH px round its middle: the four corners of that square land on it (its own box, or
 * the room a hit area lends it), and on nothing else.
 */
export async function touchRoom(target: Locator): Promise<{ readonly room: boolean; readonly misses: readonly string[] }> {
  return target.evaluate((element, side) => {
    const r = element.getBoundingClientRect()
    const [x, y, half] = [r.left + r.width / 2, r.top + r.height / 2, side / 2 - 0.5]
    const misses: string[] = []
    for (const [dx, dy] of [
      [-half, -half],
      [half, -half],
      [-half, half],
      [half, half],
    ]) {
      const at = document.elementFromPoint(x + dx, y + dy)
      if (at === null || !(element.contains(at) || at.contains(element))) misses.push(`${Math.round(x + dx)},${Math.round(y + dy)}: ${at === null ? 'nothing' : `${at.tagName.toLowerCase()}.${String(at.className).split(' ')[0]}`}`)
    }
    return { room: misses.length === 0, misses }
  }, TOUCH)
}

/** The rectangles of several boxes, rounded to the half pixel, by name: a box that is not drawn is null. */
export async function rects(page: Page, selectors: Readonly<Record<string, string>>): Promise<Record<string, readonly number[] | null>> {
  return page.evaluate((all) => {
    const half = (value: number) => Math.round(value * 2) / 2
    return Object.fromEntries(
      Object.entries(all).map(([name, selector]) => {
        const element = document.querySelector(selector)
        if (element === null) return [name, null]
        const r = element.getBoundingClientRect()
        return [name, [half(r.left), half(r.top), half(r.width), half(r.height)]]
      }),
    )
  }, selectors)
}

/** Two frames, so what a press changed has been laid out and painted. */
export const painted = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
