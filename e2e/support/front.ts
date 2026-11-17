/*
 * The front page's game, the step loop's four demo levels, played with the keyboard alone, and the record of where focus went (A§11.2:
 * "every game's level completable by keyboard alone; focus always visible and never obscured"). e2e/keyboard-loop.spec.ts walks it, and
 * e2e/network.spec.ts walks it again to see that nothing leaves the origin while a visitor plays.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/** Where focus is, and whether a keyboard user can see it. */
export interface Focus {
  /** The control's name as a reader says it: its `aria-label`, or its text. */
  name: string
  tag: string
  /** The control, something inside it, or the slip round it (a field's) draws an outline: how this site shows focus (`:focus-visible { outline }`). */
  ring: boolean
  /** The middle of the part of its box that is on screen is covered by something that is not part of it. */
  covered: boolean
  /** None of its box is on screen. */
  offscreen: boolean
}

/** The element that has focus, read in the page. */
export function focusOf(page: Page): Promise<Focus> {
  return page.evaluate(() => {
    const active = document.activeElement
    if (active === null || active === document.body) return { name: '(nothing: the page itself)', tag: 'body', ring: false, covered: false, offscreen: false }
    const outlined = (element: Element) => {
      const style = getComputedStyle(element)
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
    }
    // A ticket's ring is on its paper, a child of the button, so the button's own style is not the whole answer. A field's is on its slip,
    // the parent of the input (`:focus-within`, src/design/components.css), so for a field the three nearest ancestors are asked too.
    const ringAbove = (element: Element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false
      let parent = element.parentElement
      for (let step = 0; step < 3 && parent !== null; step++, parent = parent.parentElement) if (outlined(parent)) return true
      return false
    }
    const ring = outlined(active) || [...active.querySelectorAll('*')].some(outlined) || ringAbove(active)
    const box = active.getBoundingClientRect()
    const left = Math.max(box.left, 0)
    const top = Math.max(box.top, 0)
    const right = Math.min(box.right, window.innerWidth)
    const bottom = Math.min(box.bottom, window.innerHeight)
    const offscreen = right <= left || bottom <= top
    // A link that wraps has one box per line: it is covered when no line of it shows its own middle (R-T48: a claim's mark sits between lines).
    const lines = [...active.getClientRects()].filter((line) => line.width > 0 && line.height > 0 && line.right > 0 && line.bottom > 0 && line.left < window.innerWidth && line.top < window.innerHeight)
    const middles = lines.length > 1 ? lines : [{ left, top, right, bottom }]
    const covered =
      !offscreen &&
      middles.every((line) => {
        const hit = document.elementFromPoint((Math.max(line.left, 0) + Math.min(line.right, window.innerWidth)) / 2, (Math.max(line.top, 0) + Math.min(line.bottom, window.innerHeight)) / 2)
        return hit !== null && !active.contains(hit) && !hit.contains(active)
      })
    // `textContent`, not `innerText`: the site prints its labels in capitals with CSS, and the name is the words, as a reader says them.
    // A field is named by its label.
    const label = active.getAttribute('aria-label') ?? (active as HTMLInputElement).labels?.[0]?.textContent ?? active.textContent ?? ''
    return { name: label.trim().replace(/\s+/g, ' ').slice(0, 80), tag: active.tagName.toLowerCase(), ring, covered, offscreen }
  })
}

/** A walk: every stop is read and kept, so that the test can say at the end which stops a keyboard user could not see. */
export function walkOf(page: Page) {
  const trail: Focus[] = []
  const see = async () => {
    const focus = await focusOf(page)
    trail.push(focus)
    return focus
  }
  const press = async (key: string): Promise<Focus> => {
    await page.keyboard.press(key)
    return see()
  }
  return {
    trail,
    see,
    press,
    /** Presses Tab until the focused control is named like `name`; fails with the path it took when `limit` presses were not enough. */
    async tabTo(name: string | RegExp, limit = 24): Promise<Focus> {
      const matches = (focus: Focus) => (typeof name === 'string' ? focus.name === name : name.test(focus.name))
      for (let presses = 0; presses < limit; presses++) {
        const focus = await press('Tab')
        if (matches(focus)) return focus
      }
      throw new Error(`Tab never reached "${String(name)}" in ${limit} presses; it went through ${trail.map((stop) => stop.name).join(' > ')}`)
    },
    /**
     * The stops that a keyboard user could not see: no outline, or covered, or off screen. Two stops are not controls and are left out:
     * the page itself, and `main`, which the skip link moves focus to and whose own ring the design turns off (base.css), since it is
     * not something to press.
     */
    problems(): string[] {
      return trail.flatMap((stop) => {
        if (stop.tag === 'body' || stop.tag === 'main') return []
        const what = [stop.ring ? '' : 'draws no focus ring', stop.covered ? 'is covered by something else' : '', stop.offscreen ? 'is off screen' : ''].filter(Boolean)
        return what.length === 0 ? [] : [`${stop.name} (${stop.tag}) ${what.join(' and ')}`]
      })
    },
  }
}

/** The front page's pieces, by what a reader calls them. */
export const front = {
  game: (page: Page) => page.locator('section.es-front-service'),
  /** The waiting requests that can be admitted now, while a slot is free: the queue's chips, or in 3D the dock's buttons. */
  chips: (page: Page) => page.locator('section.es-front-service :is(.es-lanes__chips, .es-front-controls__waiting) button:not([disabled])'),
  /** Step: the amber button once a slot holds a request. */
  step: (page: Page) => page.locator('section.es-front-service [data-front-step]').getByRole('button', { name: 'Step', exact: true }),
  /** A level's result in the dock. */
  result: (page: Page) => page.locator('section.es-front-service [data-result]'),
  /** The result's verdict: "Passed." when the run reached the reference run's mark, "Not yet." when it did not. */
  verdict: (page: Page) => page.locator('.es-front-result__verdict'),
  /** The next demo level, the amber control at a result. */
  next: (page: Page) => page.getByRole('button', { name: /^Next demo level: / }),
  level: (page: Page) => page.locator('section.es-front-service [data-level-words]'),
  outcome: (page: Page) => page.locator('section.es-front-service [data-live="outcome"]'),
}

/**
 * Plays the level that is open to its end with keys: Enter on a waiting request admits it, and Enter on Step runs a step. This is the
 * reference run's own strategy: admit a request whenever a slot is free, step otherwise, and on a level that has async scheduling switch it
 * on first (`O`). Each demo level is won by it, and the walk says so, so a level that stopped being winnable by the plain strategy shows here.
 */
export async function playToTheDebrief(page: Page): Promise<void> {
  const game = front.game(page)
  const overlap = game.getByRole('switch')
  // The later levels have the async scheduling switch, which loads with its own chunk: wait for it there.
  const level = (await game.getAttribute('data-level')) ?? ''
  if (level === 'first-3-gap' || level === 'first-4-par') await expect(overlap).toBeVisible()
  if ((await overlap.count()) > 0 && (await overlap.getAttribute('aria-checked')) !== 'true') {
    await game.focus()
    await page.keyboard.press('KeyO')
    await expect(overlap).toHaveAttribute('aria-checked', 'true')
  }
  for (let turn = 0; turn < 400; turn++) {
    if ((await front.result(page).count()) > 0) return
    const chips = front.chips(page)
    if ((await chips.count()) > 0) await enter(chips.first(), page)
    else await enter(front.step(page), page)
  }
  throw new Error('the level did not end in 400 turns')
}

/** Focus on the control, and Enter. The page's own code does the rest, as it does for a keyboard user who has tabbed there. */
async function enter(control: Locator, page: Page): Promise<void> {
  await control.focus()
  await page.keyboard.press('Enter')
}
