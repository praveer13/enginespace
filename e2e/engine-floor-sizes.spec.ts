/*
 * Request path (`engine-floor`) at the twelve screen sizes (e2e/support/sizes.ts), on a practice level and on the graded one, played to
 * its result with the pointer on the built site. At every size, after every move:
 *
 *   1. The control of the decision in hand is whole on the screen and its own at its middle, and at least 44 px: the six numbers and
 *      Commit, the tile to lay, Run the path and Remove last (Take the path back too, after a stop). On a screen under 700 px tall the
 *      page may be scrolled to the dock once, as a learner does; a box inside the dock is scrolled as a finger scrolls it.
 *   2. The first run: the card that points at the first move does not cover the drawing's legend, and the ringed tile is in hand.
 *   3. The toolbar under the one-screen body (Undo, Restart level, New numbers) is not cut by the screen's foot: it is whole on the screen
 *      or wholly under it, at a desk's height.
 *   4. The drawing's "now" label is whole: no box round it hides a letter of it.
 *   5. The readout's stamp, focused in the debrief, has its ring inside the screen.
 *   6. After a stop, Run the path and Remove last are on the screen (a phone as short as 320 x 640 too), and Remove last takes the stage off.
 *
 * The spec drives the built site: ES_E2E_ORIGIN is the address of `vite preview`.
 */
import type { Page } from '@playwright/test'
import { FLOOR_PARTS } from '../packages/play/engine-floor/copy'
import { buildLevel } from '../packages/play/engine-floor/levels'
import { floorGhost } from '../packages/play/engine-floor/session'
import { expect, open, quiet, test, withSettings } from './support/site'
import { isNarrow, painted, seen, sizeName, SIZES, TOUCH, touchRoom, type ScreenSize } from './support/sizes'

test.describe.configure({ mode: 'parallel' })

const LEVELS = [
  { id: 'nano-tp', graded: false },
  { id: 'map', graded: true },
] as const
type Level = (typeof LEVELS)[number]

/** The seed that the graded run draws: the page is told to draw it, so the test knows the level's path (DC-D keeps it out of the page). */
const ENTROPY = 3
const MET = JSON.stringify({ 'engine-floor': FLOOR_PARTS.map((part) => part.id) })

const game = (page: Page) => page.locator('section[data-game="engine-floor"]')

async function openLevel(page: Page, level: Level, intro: 'met' | 'fresh' = 'met') {
  // A control that is not on the page fails the test where it is looked for, in seconds, and does not wait for the test's own limit.
  page.setDefaultTimeout(15_000)
  await withSettings(page.context(), { view3d: false })
  await page.addInitScript(
    ([flag, entropy, met]) => {
      try {
        if (met) localStorage.setItem('es:intro', flag)
        else localStorage.removeItem('es:intro')
      } catch {
        // No storage: the intro shows.
      }
      const real = crypto.getRandomValues.bind(crypto)
      crypto.getRandomValues = ((array: ArrayBufferView) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = entropy
          return array
        }
        return real(array as Uint32Array)
      }) as typeof crypto.getRandomValues
    },
    [MET, ENTROPY, intro === 'met'] as const,
  )
  await open(page, `/play/engine-floor?level=${level.id}`)
  await expect(game(page)).toBeVisible()
  await quiet(page)
  if (level.graded && (await game(page).getAttribute('data-mode')) !== 'graded') {
    await page.getByRole('button', { name: 'Start a graded run' }).evaluate((button) => (button as HTMLButtonElement).click())
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await quiet(page)
  }
}

/** A learner on a screen under 700 px tall scrolls the page to what they are about to press; a taller one does not need to. */
const mayScroll = (size: ScreenSize) => size.height < 700

/** The page's room above and under the control that scrolling it into view as a learner does leaves. */
async function reach(page: Page, selector: string) {
  await page.locator(selector).first().evaluate((element) => {
    const r = element.getBoundingClientRect()
    if (r.top < 0 || r.bottom > window.innerHeight) element.scrollIntoView({ block: 'nearest' })
  })
  await painted(page)
}

/** A tile or a control inside the stage list's box, scrolled in its box as a finger scrolls it. */
async function inItsBox(page: Page, selector: string) {
  await page.locator(selector).first().evaluate((element) => {
    const box = element.closest<HTMLElement>('.es-floor-tiles')
    if (box === null) return
    const [c, b] = [element.getBoundingClientRect(), box.getBoundingClientRect()]
    if (c.top < b.top || c.bottom > b.bottom) box.scrollTop += (c.top + c.bottom) / 2 - (b.top + b.bottom) / 2
  })
  await painted(page)
}

/** The control is whole on the screen, its own at its middle, and takes a press of TOUCH px (its own box or the hit area it lends). */
async function inHand(page: Page, selector: string, what: string, size: ScreenSize) {
  if (mayScroll(size)) await reach(page, selector)
  const target = page.locator(selector).first()
  const now = await seen(target)
  expect([what, 'whole on the screen', now.whole, now.box, now.screen]).toEqual([what, 'whole on the screen', true, now.box, now.screen])
  expect([what, 'its own at its middle', now.own, now.box]).toEqual([what, 'its own at its middle', true, now.box])
  const room = now.box[2] >= TOUCH && now.box[3] >= TOUCH ? { room: true, misses: [] } : await touchRoom(target)
  expect([what, 'at least 44 px', room]).toEqual([what, 'at least 44 px', { room: true, misses: [] }])
}

/** A press where the control stands now: the page is not scrolled to it first. */
async function press(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not drawn`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/** The toolbar under the one-screen body is not cut by the screen's foot: whole on the screen, or wholly under it. */
async function toolbarNotCut(page: Page, after: string) {
  const cut = await page.locator('.es-frame__foot-actions button').evaluateAll((all) =>
    all
      .map((element) => ({ r: element.getBoundingClientRect(), name: element.textContent ?? '' }))
      .filter(({ r }) => r.top < window.innerHeight && r.bottom > window.innerHeight)
      .map(({ r, name }) => `${name}: ${Math.round(r.top)} to ${Math.round(r.bottom)} of ${window.innerHeight}`),
  )
  expect([`the toolbar, after ${after}, cut by the screen's foot`, cut]).toEqual([`the toolbar, after ${after}, cut by the screen's foot`, []])
}

/** The box that hides part of an element: the nearest ancestor that clips it, or null. */
const clippedBy = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => {
    const r = element.getBoundingClientRect()
    for (let box = element.parentElement; box !== null && box !== document.body; box = box.parentElement) {
      if (!/auto|scroll|hidden|clip/.test(getComputedStyle(box).overflowX + getComputedStyle(box).overflowY)) continue
      const b = box.getBoundingClientRect()
      if (r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) return `${box.className.split(' ')[0]}: ${Math.round(r.left)}-${Math.round(r.right)} in ${Math.round(b.left)}-${Math.round(b.right)}`
    }
    return null
  })

/** The drawing's "now" label is whole once there is a path. */
async function nowWhole(page: Page, after: string) {
  if ((await page.locator('[data-lane-now]').count()) === 0) return
  const hidden = await clippedBy(page, '[data-lane-now]')
  expect([`the "now" label, after ${after}, cut by`, hidden]).toEqual([`the "now" label, after ${after}, cut by`, null])
}

const trayId = (page: Page, id: string) => `[data-floor-tray] [data-stage="${id}"]`

/** The practice or graded level's reference path, from the seed the page draws it on. */
async function pathOf(page: Page, level: Level): Promise<{ ids: readonly string[]; prediction: number; first: string }> {
  const seed = level.graded ? ENTROPY : Number(await game(page).getAttribute('data-seed'))
  const built = buildLevel(level.id, seed)
  const prediction = floorGhost(built).prediction ?? 0
  // A stage that departs from the path when it is laid second: not its first stage, and not the stage the engine lays next. A distractor
  // from another engine (one that is on no path) departs too, but a small level may hold none, so any stage out of place does.
  const [one, next] = built.reference
  const wrong =
    built.tray.find((id) => id !== one && id !== next && !built.reference.includes(id)) ??
    built.tray.find((id) => id !== one && id !== next) ??
    built.tray.find((id) => id !== one)
  if (wrong === undefined) throw new Error(`${level.id} on seed ${seed} has no stage to depart with`)
  return { ids: built.reference, prediction, first: wrong }
}

/** The ask and its Commit are in hand; the pick is made and committed. */
async function commitAsk(page: Page, size: ScreenSize, prediction: number) {
  const choice = `[data-prediction] button[aria-label^="${prediction} "]`
  await page.locator('[data-prediction] [role="group"] button').first().waitFor()
  await inHand(page, choice, 'the number', size)
  await press(page, choice)
  await expect(page.locator(choice)).toHaveAttribute('aria-pressed', 'true')
  const commit = '.es-floor-predict__commit button'
  await inHand(page, commit, 'Commit', size)
  await press(page, commit)
  await expect(page.locator('[data-prediction]').first()).toHaveAttribute('data-prediction', /.*/)
  await expect(page.locator('.es-floor-predict__commit')).toHaveCount(0)
  await painted(page)
}

/** Lays one stage with a press and checks what is in hand before and after. */
async function layOne(page: Page, size: ScreenSize, id: string, count: number) {
  const tile = trayId(page, id)
  await inItsBox(page, tile)
  await inHand(page, tile, `the tile ${id}`, size)
  await press(page, tile)
  await expect(page.locator(tile)).toHaveCount(0)
  await painted(page)
  const held = (await page.locator('[data-floor-lanes] [data-lane-row]').count()) === count
  expect(held, `${count} rows drawn`).toBe(true)
  await inHand(page, '[data-floor-path] .es-button[data-variant="primary"], [data-floor-path] button:first-child', `Run the path after ${count} stages`, size)
  await nowWhole(page, `${count} stages`)
  if (!isNarrow(size) && size.height >= 700) await toolbarNotCut(page, `${count} stages`)
}

for (const size of SIZES) {
  test.describe(`at ${sizeName(size)}`, () => {
    for (const level of LEVELS) {
      test(`${level.id}: the ask, every tile, Run the path and the result in hand, the toolbar uncut, "now" whole, the stamp's ring on the screen`, async ({ page }) => {
        test.setTimeout(240_000)
        await page.setViewportSize(size)
        await openLevel(page, level)
        const { ids, prediction } = await pathOf(page, level)
        await commitAsk(page, size, prediction)
        if (!isNarrow(size) && size.height >= 700) await toolbarNotCut(page, 'Commit')
        for (const [index, id] of ids.entries()) await layOne(page, size, id, index + 1)
        await press(page, '[data-floor-path] button:first-child')
        await expect(page.locator('[data-result] [data-result-heading]')).toBeVisible()
        await painted(page)
        const heading = await seen(page.locator('[data-result] [data-result-heading]'))
        expect(['the verdict stays on the screen', heading.whole, heading.box]).toEqual(['the verdict stays on the screen', true, heading.box])
        // The readout's stamp, reached by the keys: its ring (2 px of outline and its offset) is inside the screen.
        const stamp = '[data-readout] .es-stamp button, [data-readout] button[data-word]'
        for (let i = 0; i < 40; i++) {
          if (await page.evaluate(() => document.activeElement?.closest('[data-readout]') !== null && document.activeElement?.closest('[data-readout]') !== undefined)) break
          await page.keyboard.press('Tab')
        }
        const ring = await page.evaluate(() => {
          const active = document.activeElement
          if (active === null || active.closest('[data-readout]') === null) return null
          const r = active.getBoundingClientRect()
          const style = getComputedStyle(active)
          const reach = parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset))
          const readout = document.querySelector('[data-readout]')?.getBoundingClientRect()
          return { top: r.top - reach, bottom: r.bottom + reach, screen: window.innerHeight, readout: readout === undefined ? null : [Math.round(readout.top), Math.round(readout.bottom)], scrollY: Math.round(window.scrollY), page: document.documentElement.scrollHeight }
        })
        expect(ring, `Tab reaches the readout's stamp (${stamp})`).not.toBeNull()
        if (ring !== null) expect(['the stamp\'s ring inside the screen', ring.top >= -0.5 && ring.bottom <= ring.screen + 0.5, ring]).toEqual(['the stamp\'s ring inside the screen', true, ring])
      })
    }

    test('nano-tp: after a stop, Run the path and Remove last are in hand, and Remove last takes the stage off', async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(size)
      await openLevel(page, LEVELS[0])
      const { ids, prediction, first } = await pathOf(page, LEVELS[0])
      await commitAsk(page, size, prediction)
      // The engine's first stage, then a stage of another engine, which starts nowhere this path has reached: the run stops at the second.
      await layOne(page, size, ids[0], 1)
      await layOne(page, size, first, 2)
      await press(page, '[data-floor-path] button:first-child')
      if (process.env.T86_SHOT) await page.screenshot({ path: `${process.env.T86_SHOT}/stop-${size.width}x${size.height}.png` })
      await expect(page.locator('[data-floor-stop]')).toBeVisible()
      await painted(page)
      await page.waitForTimeout(400)
      await inHand(page, '[data-floor-path] .es-floor-actions__row button:first-child', 'Run the path after a stop', size)
      // The row's last control, by its own key: `button:last-child` names both, since each button is last in its own wrapper.
      const removeLast = '[data-floor-path] .es-floor-actions__row button[aria-keyshortcuts="Backspace"]'
      await inHand(page, removeLast, 'Remove last after a stop', size)
      const before = await page.locator('[data-floor-lanes] [data-lane-row]').count()
      await page.locator(removeLast).click()
      await expect.poll(() => page.locator('[data-floor-lanes] [data-lane-row]').count()).toBe(before - 1)
    })

    test('nano-tp: the first run points at the first move without covering the legend, and the ringed tile is in hand', async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize(size)
      await openLevel(page, LEVELS[0], 'fresh')
      const step = () => page.locator('.es-intro').first().getAttribute('data-intro', { timeout: 2_000 }).catch(() => null)
      for (let at = await step(), guard = 0; (at === 'parts' || at === 'look') && guard < 14; at = await step(), guard++) {
        await page.locator('[data-intro-next]').first().evaluate((button) => (button as HTMLButtonElement).click())
        await painted(page)
      }
      const { prediction } = await pathOf(page, LEVELS[0])
      await commitAsk(page, size, prediction)
      await expect(page.locator('.es-floor-ring').first()).toBeVisible()
      await painted(page)
      await inItsBox(page, '.es-floor-ring button')
      await inHand(page, '.es-floor-ring button', 'the ringed first move', size)
      // The card that says which stage is the first move stands clear of the legend.
      const over = await page.evaluate(() => {
        const card = document.querySelector('.es-intro')
        const legend = document.querySelector('[data-floor-legend]')
        if (card === null || legend === null) return null
        const [a, b] = [card.getBoundingClientRect(), legend.getBoundingClientRect()]
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
        return overlap ? { card: [Math.round(a.top), Math.round(a.bottom)], legend: [Math.round(b.top), Math.round(b.bottom)] } : null
      })
      expect(['the first-move card over the legend', over]).toEqual(['the first-move card over the legend', null])
    })
  })
}
