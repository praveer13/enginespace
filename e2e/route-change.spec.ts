/*
 * What a client-side navigation owes the reader that a page load gives for free (WCAG 2.4.3 Focus Order and 4.1.3 Status Messages; the
 * W0 exit review's follow-up, src/App.tsx): when the path changes, focus goes to the main landmark, the new page's title is said in a
 * polite live region, and the scroll goes to the top, or back to where the learner left a page that Back returns to.
 *
 *   - The first load is left alone: the page takes no focus and says nothing, because a load announces itself.
 *   - A link of the board, by mouse or by keyboard, moves focus to <main id="main"> (the skip link's own target), which has no ring of its
 *     own, and the live region says the title that the route table names.
 *   - Back does the same for the page it returns to, and puts the scroll where the learner left it. A new page opens at the top.
 *   - A change that is not a new page, a search or a fragment alone, moves nothing and says nothing.
 *   - The region is outside the landmark and out of sight (`sr-only`), and a page that has put focus inside the landmark keeps it.
 *
 * It runs against the built site, through the config's `baseURL`, in the nightly sweep with the other specs of the `features` project.
 * Every wait after a navigation is for the page's state and has `ARRIVE` to get there: the Settings page holds the main thread for
 * seconds while it asks the browser what it can draw, and with other work on the machine that is longer than Playwright's 10 s
 * (e2e/settings.spec.ts has the measurement). Each returns as soon as the state is there.
 */
import type { Page } from '@playwright/test'
import { expect, open, quiet, test, withSettings } from './support/site'

/** How long a navigation has to arrive on a machine that other work shares. */
const ARRIVE = { timeout: 45_000 }

/** The live region that says where a navigation went. */
const said = (page: Page) => page.locator('[data-live="route"]')
const main = (page: Page) => page.locator('main#main')
const board = (page: Page, label: 'Primary' | 'Footer', link: string) => page.getByRole('navigation', { name: label }).getByRole('link', { name: link, exact: true })
const scrolled = (page: Page) => page.evaluate(() => Math.round(window.scrollY))
const focused = (page: Page) => page.evaluate(() => document.activeElement?.tagName ?? 'none')
/** Waits until the live region has said `title`: the navigation has arrived, and what the page does on arrival has been done. */
const arrives = (page: Page, title: string) => expect(said(page)).toHaveText(`${title} · enginespace`, ARRIVE)

test.beforeEach(async ({ context }) => {
  // The 2D pass and nothing moving: the pages under test are plain pages.
  await withSettings(context, { view3d: false })
})

test.describe('the first load', () => {
  test('takes no focus and says nothing: the load announces itself, and the region is made, empty, ahead of the first page', async ({ page }) => {
    await open(page, '/map')
    await quiet(page)
    expect(await focused(page)).toBe('BODY')
    await expect(said(page)).toBeAttached(ARRIVE)
    await expect(said(page)).toBeEmpty()
  })
})

test.describe('a link of the board', () => {
  test('moves focus to the main landmark and says the page it went to, with a mouse', async ({ page }) => {
    await open(page, '/map')
    await board(page, 'Primary', 'Today').click()
    await arrives(page, 'Today')
    await expect(page).toHaveURL(/\/today$/)
    await expect(main(page)).toBeFocused()
    await expect(page).toHaveTitle('Today · enginespace')
  })

  test('does the same for a link of the footer, by keyboard, and Tab goes on from the top of the new page', async ({ page }) => {
    await open(page, '/map')
    await board(page, 'Footer', 'Settings').focus()
    await page.keyboard.press('Enter')
    await arrives(page, 'Settings')
    await expect(page).toHaveURL(/\/settings$/)
    await expect(main(page)).toBeFocused()
    // The board is behind the reader, and the page's own controls are ahead: the first Tab lands in the landmark.
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement) ?? false)).toBe(true)
  })

  test('says each page it goes to, one after the other, as separate announcements', async ({ page }) => {
    await open(page, '/map')
    await board(page, 'Primary', 'Today').click()
    await arrives(page, 'Today')
    const first = await said(page).locator('p').elementHandle()
    await board(page, 'Primary', 'Evidence').click()
    await arrives(page, 'Evidence')
    // The paragraph is a new element, which is what a reader announces; the same element with new text may not be.
    expect(await first?.evaluate((element) => element.isConnected)).toBe(false)
    await expect(said(page).locator('p')).toHaveCount(1)
  })

  test('keeps the live region out of the landmark and out of sight, where it is not read with the page', async ({ page }) => {
    await open(page, '/map')
    await board(page, 'Primary', 'Today').click()
    await arrives(page, 'Today')
    const region = await said(page).evaluate((element) => ({ role: element.getAttribute('role'), inMain: element.closest('main') !== null, width: element.getBoundingClientRect().width }))
    expect([region.role, region.inMain]).toEqual(['status', false])
    expect(region.width, 'the region is a pixel wide, as the sr-only utility makes it').toBeLessThanOrEqual(1)
  })

  test('leaves focus where it is when that is already inside the landmark, as a page that places its own focus would have it', async ({ page }) => {
    await open(page, '/map')
    // A button that the test adds to the landmark and focuses: React does not know it, so it stays when the page is replaced. The link
    // is followed by the page's own script, because a click would move focus to the link first.
    await page.evaluate(() => {
      const probe = document.createElement('button')
      probe.id = 'focus-probe'
      probe.textContent = 'A control that a page placed focus on'
      document.querySelector('main')?.append(probe)
      probe.focus()
    })
    await expect(page.locator('#focus-probe')).toBeFocused()
    await page.evaluate(() => document.querySelector<HTMLElement>('footer a[href$="/about"]')?.click())
    await arrives(page, 'About')
    await expect(page.locator('#focus-probe')).toBeFocused()
    await expect(main(page)).not.toBeFocused()
  })
})

test.describe('Back and Forward', () => {
  test('focus the main landmark again and say the page they return to', async ({ page }) => {
    await open(page, '/map')
    await board(page, 'Primary', 'Today').click()
    await arrives(page, 'Today')
    await page.goBack()
    await arrives(page, 'Course map')
    await expect(page).toHaveURL(/\/map$/)
    await expect(main(page)).toBeFocused()
    await page.goForward()
    await arrives(page, 'Today')
    await expect(main(page)).toBeFocused()
  })
})

test.describe('the scroll', () => {
  /** Opens /settings, which is taller than the window, and scrolls it. */
  async function scrollSettings(page: Page, offset: number) {
    await open(page, '/settings')
    await quiet(page)
    const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(room, 'the page is taller than the window, or there is nothing to scroll').toBeGreaterThan(offset + 60)
    await page.evaluate((y) => window.scrollTo(0, y), offset)
    await expect.poll(() => scrolled(page), ARRIVE).toBe(offset)
  }
  /** A click of the page's own script, so that Playwright does not scroll the link into view first and move the offset. */
  const follow = (page: Page, href: string) => page.evaluate((to) => document.querySelector<HTMLElement>(`footer a[href$="${to}"]`)?.click(), href)

  test('opens a new page at the top, even when it is as tall as the page that was left', async ({ page }) => {
    await scrollSettings(page, 640)
    await follow(page, '/design')
    await arrives(page, 'Design system')
    // The design page is tall, so its offset would stay at 640 if nothing set it.
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), { ...ARRIVE, message: 'the next page is tall' }).toBeGreaterThan(1500)
    await expect.poll(() => scrolled(page), { ...ARRIVE, message: 'a new page opens at the top' }).toBe(0)
  })

  test('puts a page back where the learner left it on Back, even from a page too short to hold the offset', async ({ page }) => {
    await scrollSettings(page, 640)
    // Chromium puts the offset back by itself once the long page is on screen again [measured 2026-11-04: this test passed there with the
    // page's own restoration taken out]. Another engine may do it earlier, while the short page is still there, and lose the offset
    // [unverified: this spec runs in Chromium only]. So the browser's own restoration is off here, and the page's alone is tested.
    await page.evaluate(() => {
      history.scrollRestoration = 'manual'
    })
    await follow(page, '/about')
    await arrives(page, 'About')
    await expect.poll(() => scrolled(page), ARRIVE).toBe(0)
    await page.goBack()
    await arrives(page, 'Settings')
    await expect.poll(() => scrolled(page), { ...ARRIVE, message: 'Back restores the offset' }).toBe(640)
    await expect(main(page)).toBeFocused()
    // Forward and Back again: the offset is kept for as long as the history is.
    await page.goForward()
    await arrives(page, 'About')
    await page.goBack()
    await expect.poll(() => scrolled(page), ARRIVE).toBe(640)
  })

  test('takes a link with a fragment to the element it names', async ({ page }) => {
    await open(page, '/map')
    await board(page, 'Primary', 'Today').click()
    await arrives(page, 'Today')
    // A location the router takes in the way it takes any, with a fragment that is an id of the page: the heading of the last panel.
    await page.evaluate(() => {
      history.pushState({}, '', '/settings#set-data')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    await arrives(page, 'Settings')
    await expect(page.locator('#set-data')).toBeAttached(ARRIVE)
    await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('set-data')?.getBoundingClientRect().top ?? -1)), ARRIVE).toBeLessThanOrEqual(5)
  })
})

test.describe('a change that is not a new page', () => {
  test('moves no focus, says nothing and keeps the scroll: a search, or a fragment, alone', async ({ page }) => {
    await open(page, '/settings')
    await quiet(page)
    await board(page, 'Footer', 'About').focus()
    await page.evaluate(() => window.scrollTo(0, 300))
    await expect.poll(() => scrolled(page), ARRIVE).toBe(300)
    await page.evaluate(() => {
      history.pushState({}, '', '/settings?x=1#set-motion')
      dispatchEvent(new PopStateEvent('popstate'))
    })
    // The router has taken the new location when the window has its search.
    await expect.poll(() => page.evaluate(() => location.search)).toBe('?x=1')
    await quiet(page)
    await expect(said(page)).toBeEmpty()
    await expect(board(page, 'Footer', 'About')).toBeFocused()
    expect(await scrolled(page)).toBe(300)
  })
})
