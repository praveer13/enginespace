/*
 * R-T45, "Show on the machine": a figure with a `replay` (TR2 lessons 1 and 3) can load its state into the lesson's dock. From 80rem wide and
 * 44rem tall the figure has the button; pressing it draws the figure's state in the dock, with no Step, Undo or Reset, and "Back to my run" returns
 * the dock to the learner's own run, unchanged. Below 80rem the button is absent and the figure is the static picture. axe finds nothing serious.
 *
 *   npx playwright test e2e/show-on-machine.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import { expect, open, test } from './support/site'

const LESSON = '/m/tr2/l3-async-scheduling-closes-the-bubble'
const SHOT = process.env.ES_SHOTS

test.describe('Show on the machine, at 1440 x 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("loads the figure's state into the dock, and Back to my run returns the learner's run unchanged", async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, LESSON)
    const dock = page.locator('aside.es-ldock')
    await expect(dock).toBeAttached({ timeout: 30_000 })
    // The lesson opens with a run; the learner moves it, and the dock follows.
    await expect(dock).toHaveAttribute('data-dock-state', 'live', { timeout: 60_000 })
    await dock.getByRole('button', { name: 'Step' }).click()
    const mine = await dock.locator('[data-loop-dock]').innerHTML()

    const figure = page.locator('figure.es-lesson__figure').first()
    await figure.scrollIntoViewIfNeeded()
    const show = figure.getByRole('button', { name: 'Show on the machine' })
    await expect(show).toBeVisible()
    await show.click()
    await expect(dock).toHaveAttribute('data-dock-state', 'figure', { timeout: 30_000 })
    await expect(dock.locator('[data-loop-dock]')).toBeVisible()
    await expect(dock.getByRole('heading', { name: 'On the machine' })).toBeVisible()
    await expect(dock.getByRole('button', { name: /^(Step|Undo|Reset)$/ })).toHaveCount(0)
    expect(await dock.locator('[data-loop-dock]').innerHTML()).not.toBe(mine)
    await expect(figure.getByRole('button', { name: 'Back to my run' })).toBeVisible()
    if (SHOT) await page.screenshot({ path: `${SHOT}/wide-figure.png` })
    const accessibility = await new AxeBuilder({ page }).include('aside.es-ldock').analyze()
    expect(accessibility.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])

    // Back, from the dock, returns the learner's own run exactly as it was, and the keyboard to the figure's button.
    await dock.getByRole('button', { name: 'Back to my run' }).click()
    await expect(dock).toHaveAttribute('data-dock-state', 'live')
    expect(await dock.locator('[data-loop-dock]').innerHTML()).toBe(mine)
    await expect(show).toBeFocused()
    if (SHOT) await page.screenshot({ path: `${SHOT}/wide-back.png` })
  })
})

test.describe('Below 80rem', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the figure has no button, and is the static picture', async ({ page }) => {
    await open(page, LESSON)
    const figure = page.locator('figure.es-lesson__figure').first()
    await figure.scrollIntoViewIfNeeded()
    await expect(figure.locator('img')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show on the machine' })).toHaveCount(0)
    await expect(page.locator('aside.es-ldock')).toHaveCount(0)
    if (SHOT) await page.screenshot({ path: `${SHOT}/narrow-figure.png` })
  })
})
