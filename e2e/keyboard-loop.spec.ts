/*
 * W0-T21, acceptance 2: a keyboard-only walk wins the front-page level (ARCHITECTURE §11.2: "every game's level completable by
 * keyboard alone; focus always visible and never obscured").
 *
 * The front page opens on "First service", Service's own run in the page's frame (src/front/FrontPage.tsx, GAMES.md §2.6). Its first
 * level, "Fill the rail", is won by hanging a ticket on every clip before the bell is rung, and the debrief says "Well fired." when
 * the run reached the house's mark. The walk starts at the top of the document, with no pointer:
 *
 *   1. Tab's first stop is the skip link, and Enter on it moves focus to `main`.
 *   2. Tab reaches "Start service", and Enter starts it: the order ticket prints its tape and focus goes to the first waiting ticket.
 *   3. Enter on a ticket hangs it, and focus follows to the next ticket, and then to the bell. Enter on the bell rings it.
 *   4. The level is over ("The fire is in. The debrief is ready.", read out), Tab reaches "See the debrief", and the verdict is
 *      "Well fired."
 *   Every stop of the walk draws a focus ring, and none is covered by something else (WCAG 2.4.7, 2.4.11).
 * Then the same level with the game's own keys (`1` hangs the ticket at that place in the line, `.` rings), the Keys dialog (`?`),
 * and all four levels in a row by the house's strategy, each won. Nothing here uses the pointer, and the 3D pass is off, so that nothing
 * moves under the walk (the 3D pass is the same game: A§6.9 gives it a DOM mirror and these keys).
 *
 * The widths are 360 and 1280 px: the game is laid out differently on a phone (GAMES.md §2.3, "portrait framing").
 */
import { PR_WIDTHS } from './routes'
import { front, playToTheDebrief, walkOf } from './support/front'
import { clipped, expect, open, test, withSettings } from './support/site'

const FIRE_IS_IN = 'The fire is in. The debrief is ready.'

for (const width of PR_WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test.beforeEach(async ({ context, page }) => {
      await withSettings(context, { view3d: false })
      await open(page, '/')
    })

    test('Tab and Enter alone win "Fill the rail", with focus in view at every step', async ({ page }) => {
      const walk = walkOf(page)

      // The way in: the skip link first, and it works.
      expect((await walk.press('Tab')).name).toBe('Skip to main content')
      expect((await walk.press('Enter')).tag).toBe('main')
      await expect(page).toHaveURL(/#main$/)

      // To the stub of the order ticket, and the start of service.
      await walk.tabTo('Start service', 6)
      const first = await walk.press('Enter')
      expect(first.name).toBe('Hang ticket No. 01 on the rail')
      await expect(front.game(page)).toHaveAttribute('data-started', '')
      await expect(page.getByRole('group', { name: "The printer's tape, in synthetic ticks" })).toBeVisible()

      // Four clips: Enter hangs a ticket, and focus follows to the next one, and then to the bell.
      for (const next of ['No. 02', 'No. 03', 'No. 04']) expect((await walk.press('Enter')).name).toBe(`Hang ticket ${next} on the rail`)
      expect((await walk.press('Enter')).name).toBe('Ring the bell: fire the next step')
      await expect(page.getByText('Every clip is hung: ring the bell.')).toBeVisible()

      // The bell fires, and the level is over. Focus stays in the game, and the page says so to a reader.
      const after = await walk.press('Enter')
      expect(after.tag).toBe('section')
      await expect(front.outcome(page)).toHaveText(FIRE_IS_IN)

      // The debrief is one Tab away from the order ticket's stub, and Enter on the stub takes focus there.
      await walk.tabTo('See the debrief', 4)
      expect((await walk.press('Enter')).name).toBe('Debrief')
      await expect(front.verdict(page)).toHaveText('Well fired.')
      await expect(page.getByText('Every clip was hung before the bell')).toBeVisible()

      // The debrief reads at this width: no word of it is cut off (WCAG 1.4.10), and its way on is reachable by Tab.
      const found = await clipped(page, '.es-front-night__debrief')
      expect(found.text, 'the debrief, past the right edge').toEqual([])
      await walk.tabTo(/^Next: A clip empties$/, 6)

      expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
    })

    test('the game\'s own keys win it too: 1 hangs the first waiting ticket, and . rings the bell', async ({ page }) => {
      await front.start(page).focus()
      await page.keyboard.press('Enter')
      await expect(front.game(page)).toHaveAttribute('data-started', '')
      // Six tickets wait and four clips are free: each press takes the first of those that still wait, so two are left at the end.
      // The printer's strip shows the first three of them, and says how many wait in all.
      for (const left of [5, 4, 3, 2]) {
        await page.keyboard.press('Digit1')
        await expect(page.locator('[data-waiting]')).toHaveAttribute('data-waiting', String(left))
        await expect(page.locator('[data-loop-controls] ul li')).toHaveCount(Math.min(left, 3))
      }
      await page.keyboard.press('Period')
      await expect(front.outcome(page)).toHaveText(FIRE_IS_IN)
      await expect(front.verdict(page)).toHaveText('Well fired.')
    })

    test('? lists the keys, the digits among them, and Escape gives focus back to the button that opened it', async ({ page }) => {
      const walk = walkOf(page)
      await walk.tabTo('Keys', 14)
      await page.keyboard.press('Enter')
      const keys = page.getByRole('dialog')
      await expect(keys).toBeVisible()
      await expect(keys.locator('kbd')).toContainText(['Space', '.', ',', 'V', '?', 'O', '1 to 9'])
      await page.keyboard.press('Escape')
      await expect(keys).toBeHidden()
      expect((await walk.see()).name).toBe('Keys')
      // The same list opens with its own key from inside the game.
      await front.game(page).focus()
      await page.keyboard.press('Shift+Slash')
      await expect(keys).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(keys).toBeHidden()
      expect(walk.problems()).toEqual([])
    })

    test('all four levels are won in a row by the house\'s own strategy, and the last debrief points on to the course map', async ({ page }) => {
      test.setTimeout(120_000)
      await front.start(page).focus()
      await page.keyboard.press('Enter')
      const titles = ['Fill the rail', 'A clip empties', 'Mind the gap', 'Your turn']
      for (const [index, title] of titles.entries()) {
        await expect(front.level(page)).toContainText(title)
        await playToTheDebrief(page)
        await expect(front.verdict(page), `${title} is won`).toHaveText('Well fired.')
        if (index < titles.length - 1) {
          await page.getByRole('button', { name: `Next: ${titles[index + 1]}` }).focus()
          await page.keyboard.press('Enter')
          // The next level opens with focus in the game, on its first waiting ticket (or its bell).
          await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('section.es-front-service')))).toBe(true)
        }
      }
      await expect(page.getByText('The same night, served three ways')).toBeVisible()
      await expect(page.getByText('The real engine', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open the course map' })).toHaveAttribute('href', '/map')
    })
  })
}
