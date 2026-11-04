/*
 * The front page's game, "First service", played with the keyboard alone, and the record of where focus went (A§11.2: "every game's
 * level completable by keyboard alone; focus always visible and never obscured"). e2e/keyboard-loop.spec.ts walks it, and
 * e2e/network.spec.ts walks it again to see that nothing leaves the origin while a visitor plays.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/** Where focus is, and whether a keyboard user can see it. */
export interface Focus {
  /** The control's name as a reader says it: its `aria-label`, or its text. */
  name: string
  tag: string
  /** The control, or something inside it, draws an outline: how this site shows focus (`:focus-visible { outline }`). */
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
    // A ticket's ring is on its paper, a child of the button, so the button's own style is not the whole answer.
    const ring = outlined(active) || [...active.querySelectorAll('*')].some(outlined)
    const box = active.getBoundingClientRect()
    const left = Math.max(box.left, 0)
    const top = Math.max(box.top, 0)
    const right = Math.min(box.right, window.innerWidth)
    const bottom = Math.min(box.bottom, window.innerHeight)
    const offscreen = right <= left || bottom <= top
    const hit = offscreen ? null : document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
    const covered = hit !== null && !active.contains(hit) && !hit.contains(active)
    // `textContent`, not `innerText`: the site prints its labels in capitals with CSS, and the name is the words, as a reader says them.
    const label = active.getAttribute('aria-label') ?? active.textContent ?? ''
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
  start: (page: Page) => page.getByRole('button', { name: 'Start service' }),
  bell: (page: Page) => page.getByRole('button', { name: /Ring the bell/ }),
  /** The tickets that can be hung now: the waiting ones, while the rail has a free clip. */
  tickets: (page: Page) => page.locator('[data-loop-controls] ul button:not([disabled])'),
  debriefStub: (page: Page) => page.getByRole('button', { name: 'See the debrief' }),
  /** The debrief's headline: "Well fired." when the run reached the house's mark, "Fire it again." when it did not. */
  verdict: (page: Page) => page.locator('[data-loop-debrief] h3').first(),
  level: (page: Page) => page.locator('.es-front-deck__level'),
  outcome: (page: Page) => page.locator('[data-live="outcome"]'),
}

/**
 * Plays the level that is open to its end with keys: Enter on a waiting ticket hangs it, and Enter on the bell rings it. This is the
 * house's own strategy: hang a ticket whenever a clip is free, ring otherwise, and write the next call during the fire on a level
 * that has the switch (`O`). Each level of the front page is won by it, and the walk says so, so a level that stopped being winnable
 * by the plain strategy shows here.
 */
export async function playToTheDebrief(page: Page): Promise<void> {
  const game = front.game(page)
  const overlap = page.getByRole('switch')
  if ((await overlap.count()) > 0 && (await overlap.getAttribute('aria-checked')) !== 'true') {
    await game.focus()
    await page.keyboard.press('KeyO')
    await expect(overlap).toHaveAttribute('aria-checked', 'true')
  }
  for (let turn = 0; turn < 400; turn++) {
    if ((await front.debriefStub(page).count()) > 0) return
    const tickets = front.tickets(page)
    if ((await tickets.count()) > 0) await enter(tickets.first(), page)
    else await enter(front.bell(page), page)
  }
  throw new Error('the level did not end in 400 turns')
}

/** Focus on the control, and Enter. The page's own code does the rest, as it does for a keyboard user who has tabbed there. */
async function enter(control: Locator, page: Page): Promise<void> {
  await control.focus()
  await page.keyboard.press('Enter')
}
