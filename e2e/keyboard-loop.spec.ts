/*
 * W0-T21, acceptance 2: a keyboard-only walk wins the front-page level (ARCHITECTURE §11.2: "every game's level completable by
 * keyboard alone; focus always visible and never obscured").
 *
 * The front page opens on the step loop's first demo level, "Fill the batch", in the instrument beside the heading (src/front/Instrument.tsx,
 * REDESIGN §3.1). It is won by admitting a request into every batch slot before the first step, and the result says "Passed." when the
 * run reached the reference run's mark. The walk starts at the top of the document, with no pointer:
 *
 *   1. Tab's first stop is the skip link, and Enter on it moves focus to `main`.
 *   2. Tab reaches the first waiting request, R1, which the intro's ring is on, and Enter admits it: focus follows to R2.
 *   3. Enter on R2, R3 and R4 admits them, and focus goes on to Step, now the amber control. Enter on it runs the step.
 *   4. The level is over ("The level is over. The result is in the dock.", read out), focus is on the result, and Tab reaches the next
 *      demo level, the one amber control there.
 *   Every stop of the walk draws a focus ring, and none is covered by something else (WCAG 2.4.7, 2.4.11).
 * Then the same level with the game's own keys (`1` admits the request at that place in the queue, `.` steps), and all four levels in a
 * row by the reference run's strategy, each won. Nothing here uses the pointer, and 3D is off, so that nothing moves under the walk.
 *
 * The widths are 360 and 1280 px: the instrument is laid out differently on a phone (REDESIGN §3.1).
 */
import { PR_WIDTHS } from './routes'
import { front, playToTheDebrief, walkOf } from './support/front'
import { clipped, expect, open, test, withSettings } from './support/site'

const LEVEL_IS_DONE = 'The level is over. The result is in the dock.'

for (const width of PR_WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test.beforeEach(async ({ context, page }) => {
      await withSettings(context, { view3d: false })
      await open(page, '/')
    })

    test('Tab and Enter alone win "Fill the batch", with focus in view at every step', async ({ page }) => {
      const walk = walkOf(page)

      // The way in: the skip link first, and it works.
      expect((await walk.press('Tab')).name).toBe('Skip to main content')
      expect((await walk.press('Enter')).tag).toBe('main')
      await expect(page).toHaveURL(/#main$/)

      // To the first waiting request, and the first move: the intro hands over, and focus follows to the next request in the queue.
      await walk.tabTo('Admit request R1 into a batch slot', 16)
      expect((await walk.press('Enter')).name).toBe('Admit request R2 into a batch slot')
      await expect(front.game(page)).not.toHaveAttribute('data-intro')

      // Four slots: Enter admits a request, and focus follows to the next one, and then to Step.
      for (const next of ['R3', 'R4']) expect((await walk.press('Enter')).name).toBe(`Admit request ${next} into a batch slot`)
      expect((await walk.press('Enter')).name).toBe('Step')

      // The step runs, and the level is over. Focus goes to the result, and the page says so to a reader.
      const after = await walk.press('Enter')
      expect(after.tag).toBe('div')
      await expect(front.outcome(page)).toHaveText(LEVEL_IS_DONE)
      await expect(front.verdict(page)).toHaveText('Passed.')
      await expect(page.locator('[data-moment]')).toContainText('That is batching.')

      // The result reads at this width: no word of it is cut off (WCAG 1.4.10), and its way on is the next Tab.
      const found = await clipped(page, '[data-result]')
      expect(found.text, 'the result, past the right edge').toEqual([])
      await walk.tabTo(/^Next demo level: Refill a slot$/, 3)

      expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
    })

    test('the game\'s own keys win it too: 1 admits the first waiting request, and . steps', async ({ page }) => {
      await front.game(page).focus()
      // Six requests wait and four slots are free: each press takes the first of those that still wait, so two are left at the end.
      for (const left of [5, 4, 3, 2]) {
        await page.keyboard.press('Digit1')
        await expect(front.game(page).locator('[data-waiting]')).toHaveAttribute('data-waiting', String(left))
      }
      await page.keyboard.press('Period')
      await expect(front.outcome(page)).toHaveText(LEVEL_IS_DONE)
      await expect(front.verdict(page)).toHaveText('Passed.')
    })

    test('Escape ends the intro, and the coach strip then says what to do; nothing was admitted', async ({ page }) => {
      await expect(front.game(page)).toHaveAttribute('data-intro', 'parts')
      await front.game(page).focus()
      await page.keyboard.press('Escape')
      await expect(front.game(page)).not.toHaveAttribute('data-intro')
      await expect(page.locator('[data-coach-told]')).toBeVisible()
      await expect(front.game(page).locator('[data-waiting]')).toHaveAttribute('data-waiting', '6')
    })

    test('all four levels are won in a row by the reference run\'s own strategy, and the last result starts the course', async ({ page }) => {
      test.setTimeout(120_000)
      const titles = ['Fill the batch', 'Refill a slot', 'Close a bubble', 'Both levers']
      for (const [index, title] of titles.entries()) {
        await expect(front.level(page)).toContainText(title)
        await playToTheDebrief(page)
        await expect(front.verdict(page), `${title} is won`).toHaveText('Passed.')
        if (index < titles.length - 1) {
          await page.getByRole('button', { name: `Next demo level: ${titles[index + 1]}` }).focus()
          await page.keyboard.press('Enter')
          // The next level opens with focus in the instrument.
          await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('section.es-front-service')))).toBe(true)
        }
      }
      await expect(page.getByText('You just ran the step loop by hand.')).toBeVisible()
      await expect(front.result(page).getByRole('link', { name: 'Start the course: TR1 lesson 1, Five mechanisms (35 min, browser only)' })).toHaveAttribute('href', '/m/tr1/l1-five-mechanisms')
    })
  })
}
