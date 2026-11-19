/*
 * R-T05: wave R's components on /design, in a browser. What a key, a click and a press outside do, which the server render of
 * tests/design cannot show:
 *   - a popover opens on activation (a click, Enter or Space) and never on focus alone, and closes on Escape and on a press outside,
 *     handing focus back to its trigger;
 *   - a stamp opens the tag legend, four lines, one per provenance word;
 *   - the section rail's strip opens and closes by keyboard, and the level menu is one control that the arrow keys move;
 *   - every new interactive target is at least 44 px on its short side, and its focus ring is 3 px of text-1 at a 2 px offset with a
 *     paper halo;
 *   - axe finds no serious or critical violation in the new specimens, at a phone's width and at a desktop's.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, open, test } from './support/site'

const PARTS = '[data-parts]'
const specimen = (page: Page, title: string) => page.locator(`section.es-spec__component[aria-label="${title}"]`)
const live = (page: Page, title: string, index = 0) => specimen(page, title).locator('.es-spec__state').nth(index)

async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement
    return element ? `${element.tagName.toLowerCase()}.${element.className}` : 'none'
  })
}

test.describe('the popover', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/design')
  })

  const trigger = (page: Page): Locator => live(page, 'Popover').locator('.es-pop__trigger')
  const dialog = (page: Page): Locator => live(page, 'Popover').getByRole('dialog')

  test('does not open on focus, opens on Enter, and Escape closes it and hands focus back', async ({ page }) => {
    await trigger(page).focus()
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
    // Focus can go into the sheet, and Escape from there still hands it back.
    await page.keyboard.press('Tab')
    expect(await focused(page)).toContain('es-pop__close')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
  })

  test('opens on Space and on a click, and a press outside closes it and hands focus back', async ({ page }) => {
    await trigger(page).focus()
    await page.keyboard.press('Space')
    await expect(dialog(page)).toBeVisible()
    await page.mouse.click(1400, 450)
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()

    await trigger(page).click()
    await expect(dialog(page)).toBeVisible()
    await page.locator('h1').click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
  })

  test('a hover opens nothing, and Close closes it and hands focus back', async ({ page }) => {
    await trigger(page).hover()
    await expect(dialog(page)).toHaveCount(0)
    await trigger(page).click()
    await dialog(page).getByRole('button', { name: 'Close' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(trigger(page)).toBeFocused()
  })

  test('a press on another control closes it and leaves focus on that control', async ({ page }) => {
    await trigger(page).click()
    const other = live(page, 'Popover', 2).locator('.es-pop__trigger')
    await other.click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(other).toBeFocused()
  })
})

test('a stamp is a button that opens the tag legend: four lines, one per provenance word', async ({ page }) => {
  await open(page, '/design')
  const stamp = live(page, 'Stamp').getByRole('button', { name: /^synthetic/ })
  await stamp.click()
  const legend = live(page, 'Stamp').getByRole('dialog', { name: 'How numbers are tagged' })
  await expect(legend).toBeVisible()
  await expect(legend.locator('.es-taglegend__line dt')).toHaveText(['measured', 'derived', 'estimated', 'synthetic'])
  await page.keyboard.press('Escape')
  await expect(stamp).toBeFocused()
})

test('the section rail is a nav of an ordered list with one current step, and its strip opens and closes by keyboard', async ({ page }) => {
  await open(page, '/design')
  const rail = specimen(page, 'Section list').getByRole('navigation', { name: 'This lesson', exact: true })
  await expect(rail.locator('> ol')).toHaveCount(1)
  await expect(rail.locator('[aria-current="step"]')).toHaveCount(1)
  await expect(rail.locator('[aria-current="step"]')).toContainText('now')

  const strip = specimen(page, 'Section list').getByRole('navigation', { name: 'This lesson, as a strip' })
  const toggle = strip.getByRole('button')
  await toggle.focus()
  await expect(strip.locator('ol').first()).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(strip.locator('ol').first()).toBeVisible()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
})

test('the level menu is one control that the keyboard moves, and its face follows', async ({ page }) => {
  await open(page, '/design')
  const menu = live(page, 'Level menu')
  await expect(menu.locator('select')).toHaveCount(1)
  await expect(menu.locator('button')).toHaveCount(0)
  const select = menu.getByRole('combobox', { name: 'Level' })
  await select.focus()
  await page.keyboard.press('ArrowDown')
  await expect(select).toHaveValue('two-kinds')
  await expect(menu.locator('.es-level__face')).toContainText('Level 2 of 6')
  await expect(menu.locator('.es-level__face')).toContainText('Two kinds of KV cache')
})

for (const width of [390, 1440]) {
  test(`at ${width} px every new target is 44 px or more on its short side, and focus is the ink ring on a paper halo`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 })
    await open(page, '/design')
    const parts = page.locator(PARTS)
    const small = await parts.evaluate((root) =>
      [...root.querySelectorAll<HTMLElement>('button, a[href], select')]
        .filter((element) => element.offsetParent !== null)
        .map((element) => ({ name: `${element.className} ${element.textContent?.trim().slice(0, 24)}`, box: element.getBoundingClientRect() }))
        .filter(({ box }) => Math.min(box.width, box.height) < 44)
        .map(({ name, box }) => `${name}: ${Math.round(box.width)}x${Math.round(box.height)}`),
    )
    expect(small).toEqual([])

    const rings = await parts.evaluate((root) => {
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--es-text-1').trim()
      const probe = document.createElement('span')
      probe.style.color = ink
      document.body.append(probe)
      const inkRgb = getComputedStyle(probe).color
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--es-paper').trim()
      const paperRgb = getComputedStyle(probe).color
      probe.remove()
      const forced = [...root.querySelectorAll<HTMLElement>('[data-force="focus"]')].filter((element) => element.matches('button, a, select'))
      return {
        count: forced.length,
        wrong: forced
          .map((element) => ({ element, style: getComputedStyle(element) }))
          .filter(
            ({ style }) =>
              style.outlineWidth !== '3px' || style.outlineStyle !== 'solid' || style.outlineColor !== inkRgb || style.outlineOffset !== '2px' || !style.boxShadow.includes(paperRgb),
          )
          .map(({ element, style }) => `${element.className}: ${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor} @${style.outlineOffset} / ${style.boxShadow}`),
      }
    })
    // Six: the callout, the parts list, the popover, the stamp, the section list and the level menu. The pan of the old kitchen is gone (REDESIGN 2.8, the table of removed components).
    expect(rings.count).toBeGreaterThanOrEqual(6)
    expect(rings.wrong).toEqual([])

    // A real keyboard focus draws the same ring.
    await live(page, 'Popover').locator('.es-pop__trigger').focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const ring = await live(page, 'Popover').locator('.es-pop__trigger').evaluate((element) => {
      const style = getComputedStyle(element)
      return `${style.outlineWidth} ${style.outlineStyle} @${style.outlineOffset}`
    })
    expect(ring).toBe('3px solid @2px')

    const audit = await new AxeBuilder({ page }).include(PARTS).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
    const failing = audit.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    expect(failing.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' ; ')}`)).toEqual([])
  })
}

test('under reduced motion a delta stays, and with motion it fades after a second', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, '/design')
  const state = live(page, 'Delta')
  await state.getByRole('button', { name: 'Admit request' }).click()
  const delta = state.locator('.es-delta')
  await expect(delta).toHaveText('+4 pages')
  expect(await delta.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await state.getByRole('button', { name: 'Admit request' }).click()
  await expect.poll(() => delta.evaluate((element) => Number(getComputedStyle(element).opacity)), { timeout: 5_000 }).toBe(0)
})
