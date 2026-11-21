/*
 * Tensor views (`shape-shifter`) in a browser, in the instrument frame (GAMES.md §4, REDESIGN §2.6, §3.5; W2-T14), on the built site:
 *
 *   1. The first screen, at 1440 x 900 and 390 x 844 and at 1366 x 768, 1280 x 620, 360 x 800 and 320 x 640: at the start (the first run's
 *      Next in hand), with a decision open (an operation's picker), and at the result, the diagram's current region, the control in hand
 *      and the readout are whole on the screen and uncovered, the goal's number and its end are in view, and one amber fill at most.
 *   2. Nothing moves under the hand: the operation bar stays where it was when its picker opens, when a choice applies, and when a named
 *      moment is said; the picker and the moment come under it. Every pinned region states its scroll-margin.
 *   3. The first run names the parts before it asks for a guess, then rings the reference's first move.
 *   3a. Nothing comes under the hand: a second press at the spot of the last move, moments after it, never presses the result's Next level,
 *      Run again or New numbers; on a phone Commit stands whole beside the field, the part the first run names is whole over the pinned dock,
 *      and the buffer or the tiles stand whole over the dock while the level is played.
 *   4. `fewest` starts in Prove mode from its page: a passed Prove run, played on the seed drawn when it starts, is recorded as proved, and
 *      the ledger then reads the level as proved.
 *   5. The keys alone play `views` to its debrief; axe finds no serious or critical violation in play, with a picker open, and at the result;
 *      under reduced motion nothing moves and the game plays to its verdict.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { buildLevel } from '../packages/play/shape-shifter/levels'
import { ghostActions } from '../packages/play/shape-shifter/session'
import type { ShiftAction } from '../packages/play/shape-shifter/types'
import type { ShiftOp } from '../packages/sim/tensor'
import { walkOf } from './support/front'
import { amberFills } from './support/screens'
import { expect, open, quiet, test, withSettings } from './support/site'
import { shiftWalkWith } from './support/walks'

const PARTS = ['table', 'buffer', 'order', 'target', 'shared', 'slices', 'tensor', 'program', 'block', 'grid-size', 'mask']
const game = (page: Page) => page.locator('section[data-game="shape-shifter"]')
const verdict = (page: Page) => page.locator('[data-result] [data-result-heading]')

/** Opens a level. `met` seeds the intro flag with every part, as a learner who has met them has; `fresh` leaves it empty. */
async function openLevel(page: Page, level: string, intro: 'met' | 'fresh' = 'met', mode = '') {
  await withSettings(page.context(), { view3d: false })
  if (intro === 'met') await page.addInitScript((parts) => localStorage.setItem('es:intro', JSON.stringify({ 'shape-shifter': parts })), PARTS)
  await open(page, `/play/shape-shifter?level=${level}${mode}`)
  await expect(game(page)).toBeVisible()
  await quiet(page)
}

/** What a picker's choice says for an operation (src/games/shape-shifter/Controls.tsx). */
function face(op: ShiftOp): string {
  if (op.op === 'view' || op.op === 'reshape' || op.op === 'expand') return `[${op.shape.join(', ')}]`
  if (op.op === 'permute') return `(${op.order.join(', ')})`
  if (op.op === 'transpose') return `${op.a} and ${op.b}`
  return ''
}

/** Plays one action with the pointer, as a learner who taps. */
async function tap(page: Page, action: ShiftAction) {
  if (action.t === 'op') {
    await page.locator(`[data-shift-bar] [data-op="${action.op.op}"]`).click()
    if (action.op.op !== 'contiguous') await page.locator(`[data-shift-picker] [data-choice="${face(action.op)}"]`).click()
  } else if (action.t === 'block') {
    for (let v = 1; v < action.value; v++) await page.getByRole('button', { name: `BLOCK along dimension ${action.dim}: one more` }).click()
  } else if (action.t === 'launch') await page.getByRole('button', { name: 'Launch', exact: true }).click()
}

/** Commits the open guess with the pointer. */
async function guess(page: Page, value: number) {
  await page.getByRole('textbox', { name: 'Your guess' }).fill(String(value))
  await page.getByRole('button', { name: 'Commit' }).click()
  await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
}

/**
 * Each named part whole on the screen and its middle its own (nothing pinned over it); the goal's number and end in view; one amber fill.
 * Under 700 px of height nothing is pinned and the frame does not fit one screen (REDESIGN §3.5): there each part is brought into view the
 * way a learner scrolls to it, one at a time, and must then be whole and uncovered, and the goal is read at the top of the page.
 */
async function wholeOnScreen(page: Page, parts: Record<string, string>, goal = true) {
  const short = await page.evaluate(() => window.innerHeight < 700)
  for (const [name, selector] of Object.entries(parts)) {
    if (short) await page.locator(selector).first().evaluate((element) => element.scrollIntoView({ block: 'center' }))
    const seen = await page.locator(selector).first().evaluate((element) => {
      const r = element.getBoundingClientRect()
      const inView = r.width > 0 && r.top >= -0.5 && r.left >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12))
      return { inView, own: at !== null && (element.contains(at) || at.contains(element)), box: [Math.round(r.top), Math.round(r.bottom), window.innerHeight] }
    })
    expect([name, 'whole on the screen', seen.inView, seen.box]).toEqual([name, 'whole on the screen', true, seen.box])
    expect([name, 'not covered', seen.own]).toEqual([name, 'not covered', true])
  }
  if (short && goal) await game(page).locator('.es-goal').evaluate((element) => element.scrollIntoView({ block: 'center' }))
  for (const part of goal ? ['target', 'ends'] : []) {
    const shown = await game(page)
      .locator(`.es-goal [data-part="${part}"]`)
      .evaluate((element) => {
        const r = element.getClientRects()[0]
        if (r === undefined) return false
        // Its first line is on the screen and nothing outside the goal line lies over it ("more", which runs on after it, takes a ring of room).
        const at = document.elementFromPoint(r.left + Math.min(4, r.width / 2), r.top + r.height / 2)
        return r.top >= 0 && r.bottom <= window.innerHeight && at !== null && at.closest('.es-frame__goal-box') !== null
      })
    expect([`the goal's ${part === 'target' ? 'number' : 'end'} in view`, shown]).toEqual([`the goal's ${part === 'target' ? 'number' : 'end'} in view`, true])
  }
  const y = await page.evaluate(() => window.scrollY)
  const h = await page.evaluate(() => window.innerHeight)
  const fills = (await amberFills(page)).filter((fill) => fill.bottom > y && fill.top < y + h)
  expect(fills.length, `amber fills in view: ${fills.map((fill) => fill.name).join(', ')}`).toBeLessThanOrEqual(1)
}

/** Brings the dock's foot into view the way a learner scrolls to it, where the screen is too short to hold the frame whole. */
async function reachDock(page: Page) {
  await page.locator('[data-dock]').evaluate((dock) => {
    const r = dock.getBoundingClientRect()
    if (r.bottom > window.innerHeight) window.scrollBy({ top: Math.min(r.bottom - window.innerHeight, r.top - 8) })
  })
}

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 1280, height: 620 },
  { width: 360, height: 800 },
  { width: 320, height: 640 },
]

test.describe('the first screen', () => {
  for (const viewport of VIEWPORTS) {
    test(`at ${viewport.width} x ${viewport.height} the diagram's current region, the control in hand and the readout are whole and uncovered at the start, with a picker open and at the result`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      // The start: a first visit, the intro's Next is the control in hand.
      await openLevel(page, 'views', 'fresh')
      await expect(page.locator('[data-intro-next]')).toBeVisible()
      await reachDock(page)
      await wholeOnScreen(page, { next: '[data-intro-next]', diagram: '[data-shift-table]', readout: '[data-shift-readout] [data-readout-id="copies"]' })
      await page.locator('[data-intro-skip]').click()

      // A decision open: the guess, then `transpose`'s picker under the bar.
      await guess(page, 24)
      await reachDock(page)
      const bar = page.locator('[data-shift-bar] [data-op="transpose"]')
      const before = await bar.boundingBox()
      await bar.click()
      await expect(page.locator('[data-shift-picker]')).toBeVisible()
      expect(await bar.boundingBox(), 'the bar stays where the hand is when its picker opens').toEqual(before)
      await wholeOnScreen(page, { choice: '[data-shift-picker] [data-choice="0 and 1"]', diagram: '[data-shift-cells] .es-shift__cells', readout: '[data-shift-readout] [data-readout-id="moved"]' })
      // (A short screen was scrolled to each part above: the bar is measured again where the page now stands.)
      await page.locator('[data-shift-picker] [data-choice="0 and 1"]').scrollIntoViewIfNeeded()
      const held = await bar.boundingBox()
      await page.locator('[data-shift-picker] [data-choice="0 and 1"]').click()
      await expect(game(page).locator('[data-moment="view-free"]')).toBeVisible()
      expect(await bar.boundingBox(), 'the bar stays where the hand is when the choice applies and a moment is said').toEqual(held)
      const moment = await game(page).locator('[data-moment="view-free"]').boundingBox()
      expect(moment !== null && held !== null && moment.y >= held.y + held.height, 'the moment is said under the bar').toBe(true)

      // The result.
      for (const action of ghostActions(buildLevel('views', 30)).slice(1)) await tap(page, action)
      await expect(verdict(page)).toHaveText('Finished (practice)')
      await expect.poll(() => page.getByRole('button', { name: /^Next level/ }).evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true)
      // The task's two sizes hold the goal's number and end in view at the result too; on the other screens the result is read with the page.
      const named = (viewport.width === 1440 && viewport.height === 900) || (viewport.width === 390 && viewport.height === 844)
      await wholeOnScreen(page, { verdict: '[data-result] [data-result-heading]', next: '[data-result] .es-debrief__actions button', readout: '[data-shift-readout] [data-readout-id="copies"]' }, named)
    })
  }

  test('every pinned region states its scroll-margin: the dock\'s controls keep clear of a phone\'s pinned dock and readout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openLevel(page, 'views')
    const margins = await page.locator('[data-shift-controls] button, [data-shift-controls] input').evaluateAll((all) => all.map((element) => getComputedStyle(element).scrollMarginBottom))
    expect(margins.length).toBeGreaterThan(0)
    for (const margin of margins) expect(parseFloat(margin)).toBeGreaterThan(0)
    // The dock pinned at a phone's foot is the one pinned region, and it keeps one height while the run is played.
    const dock = page.locator('[data-dock]')
    expect(await dock.evaluate((element) => getComputedStyle(element).position)).toBe('sticky')
    const tall = (await dock.boundingBox())?.height
    await guess(page, 24)
    await page.locator('[data-shift-bar] [data-op="view"]').click()
    expect((await dock.boundingBox())?.height).toBe(tall)
  })
})

/**
 * A tap at a control's middle where it stands now, as a finger lands: the page is not scrolled to it first. A picker's choice is scrolled
 * into view inside the picker, as a finger scrolls the picker's own box, and the dock and the page stay where they are.
 */
async function tapAt(page: Page, selector: string) {
  if (selector.startsWith('[data-shift-picker]')) {
    const still = await page.locator(selector).first().evaluate((choice) => {
      const picker = choice.closest<HTMLElement>('[data-shift-picker]')
      const main = choice.closest<HTMLElement>('[data-dock-main]')
      const before = [window.scrollY, main?.scrollTop]
      if (picker !== null) {
        const [c, p] = [choice.getBoundingClientRect(), picker.getBoundingClientRect()]
        if (c.bottom > p.bottom) picker.scrollTop += c.bottom - p.bottom
      }
      return JSON.stringify(before) === JSON.stringify([window.scrollY, main?.scrollTop])
    })
    expect(still, 'the picker scrolls in itself').toBe(true)
  }
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not drawn`)
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** A box whole on the screen and over the dock pinned at a phone's foot, as the learner sees it: once the frame has been painted. */
async function overTheDock(page: Page, selector: string) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  return page.locator(selector).first().evaluate((element) => {
    const r = element.getBoundingClientRect()
    const dock = document.querySelector('[data-dock]')?.getBoundingClientRect().top ?? window.innerHeight
    return { whole: r.height > 0 && r.top >= 0 && r.bottom <= Math.min(window.innerHeight, dock) + 0.5, box: [Math.round(r.top), Math.round(r.bottom)], dock: Math.round(dock), y: Math.round(window.scrollY) }
  })
}

test.describe('nothing comes under the hand', () => {
  test.use({ hasTouch: true })

  test('a second click on Launch, moments after the first, does not press the result that came up under it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openLevel(page, 'grid')
    const seed = await game(page).getAttribute('data-seed')
    await guess(page, 80)
    for (const action of ghostActions(buildLevel('grid', 0)).filter((action) => action.t !== 'launch')) await tap(page, action)
    const launch = page.getByRole('button', { name: 'Launch', exact: true })
    const box = await launch.boundingBox()
    if (box === null) throw new Error('Launch is not drawn')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(verdict(page)).toHaveText('Finished (practice)')
    await page.waitForTimeout(400)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(400)
    await expect(verdict(page)).toHaveText('Finished (practice)')
    await expect(game(page)).toHaveAttribute('data-seed', seed ?? '')
  })

  for (const [level, plan] of [
    ['stride-zero', [['expand', '[4, 6]']]],
    ['three-d', [['reshape', '[4, 2, 4]'], ['permute', '(1, 0, 2)']]],
  ] as const) {
    test(`at 390 x 844 a double tap on \`contiguous()\` ends \`${level}\` and keeps its result`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await openLevel(page, level)
      await page.getByRole('textbox', { name: 'Your guess' }).fill('0')
      await tapAt(page, '[data-shift-predict] button[type="submit"]')
      await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
      for (const [op, choice] of plan) {
        await tapAt(page, `[data-shift-bar] [data-op="${op}"]`)
        await tapAt(page, `[data-shift-picker] [data-choice="${choice}"]`)
      }
      const at = await tapAt(page, '[data-shift-bar] [data-op="contiguous"]')
      await page.waitForTimeout(300)
      await page.touchscreen.tap(at.x, at.y)
      await page.waitForTimeout(400)
      await expect(verdict(page)).toHaveText('Finished (practice)')
      await expect(game(page)).toHaveAttribute('data-level', level)
    })
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    test(`at ${viewport.width} x ${viewport.height} Commit stands whole beside the field, and a tap on it commits`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openLevel(page, 'views')
      await page.getByRole('textbox', { name: 'Your guess' }).fill('24')
      const own = await page.locator('[data-shift-predict] button[type="submit"]').evaluate((button) => {
        const r = button.getBoundingClientRect()
        return button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) && r.bottom <= window.innerHeight
      })
      expect(own, 'Commit is its own at its middle').toBe(true)
      await tapAt(page, '[data-shift-predict] button[type="submit"]')
      await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
    })

    test(`at ${viewport.width} x ${viewport.height} the part the first run names is whole over the pinned dock, and so are the buffer and the tiles in play`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(viewport)
      await openLevel(page, 'views', 'fresh')
      const intro = game(page).locator('.es-intro').first()
      await expect(intro).toHaveAttribute('data-intro-walk', '0')
      await page.locator('[data-intro-next]').click()
      await expect(intro).toHaveAttribute('data-intro-walk', '1')
      const named = await overTheDock(page, '[data-shift-buffer-box]')
      expect(named.whole, `the buffer the intro names: ${JSON.stringify(named)}`).toBe(true)

      for (const [level, value, op, choice] of [
        ['views', '24', 'transpose', '0 and 1'],
        ['stride-zero', '0', 'expand', '[4, 6]'],
        ['three-d', '8', 'reshape', '[4, 2, 4]'],
        ['fewest', '0', 'transpose', '0 and 1'],
      ] as const) {
        await openLevel(page, level)
        await page.getByRole('textbox', { name: 'Your guess' }).fill(value)
        await tapAt(page, '[data-shift-predict] button[type="submit"]')
        await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
        await tapAt(page, `[data-shift-bar] [data-op="${op}"]`)
        if (choice !== '') await tapAt(page, `[data-shift-picker] [data-choice="${choice}"]`)
        await expect(game(page).locator('[data-moment]').first()).toBeVisible()
        const buffer = await overTheDock(page, '[data-shift-buffer="now"]')
        expect(buffer.whole, `${level}, the buffer: ${JSON.stringify(buffer)}`).toBe(true)
        const cells = await overTheDock(page, '[data-shift-cells] .es-shift__cells')
        expect(cells.whole, `${level}, the cells: ${JSON.stringify(cells)}`).toBe(true)
      }

      await openLevel(page, 'grid')
      await page.getByRole('textbox', { name: 'Your guess' }).fill('80')
      await tapAt(page, '[data-shift-predict] button[type="submit"]')
      await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
      await tapAt(page, '[data-shift-launch-button]')
      await expect(game(page).locator('[data-moment]').first()).toBeVisible()
      const tiles = await overTheDock(page, '[data-shift-grid] .es-shift__cells')
      expect(tiles.whole, `grid, the tiles: ${JSON.stringify(tiles)}`).toBe(true)
    })
  }
})

test.describe('the first run', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`at ${viewport.width} x ${viewport.height} it names the parts, lets the table be read, asks the guess and rings the first move`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openLevel(page, 'views', 'fresh')
      const intro = game(page).locator('.es-intro').first()
      await expect(intro).toHaveAttribute('data-intro', 'parts')
      await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
      for (let guard = 0; guard < 12 && ['parts', 'look'].includes((await intro.getAttribute('data-intro')) ?? ''); guard++) await page.locator('[data-intro-next]').click()
      await expect(page.locator('[data-shift-predict]')).toBeVisible()
      await guess(page, 24)
      await expect(page.locator('.es-marker__ring [data-op="transpose"]')).toBeVisible()
      await expect(page.locator('.es-marker__ring')).toHaveCount(1)
    })
  }
})

test.describe('Prove mode', () => {
  test('`fewest` starts in Prove mode from its page, a passed run on the seed drawn at its start is recorded as proved, and the ledger reads it so', async ({ page }) => {
    test.setTimeout(120_000)
    await openLevel(page, 'fewest')
    await page.locator('[data-prove-entry]').click()
    await expect(page).toHaveURL(/\/play\/shape-shifter\?level=fewest&mode=prove$/)
    await expect(page.locator('[data-prove-panel]')).not.toHaveAttribute('data-stake', 'reading')
    await page.getByLabel('My coding agent and any AI chat are closed.').check()
    await page.getByRole('button', { name: 'Start the Prove run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(game(page)).toHaveAttribute('data-level', 'fewest')
    await expect(page.locator('[data-readout-hidden]')).toBeVisible()
    await expect(page.locator('[data-shift-readout]')).toHaveCount(0)
    const seed = Number(await game(page).getAttribute('data-seed'))
    expect(seed).not.toBe(0)
    const level = buildLevel('fewest', seed)
    let at = 0
    for (const task of level.tasks) {
      if (await page.locator('[data-shift-predict]').isVisible()) await page.getByRole('button', { name: 'Skip the guess' }).click()
      for (const op of 'ghost' in task ? task.ghost : []) await tap(page, { t: 'op', op })
      at++
    }
    expect(at).toBe(3)
    await expect(verdict(page)).toHaveText('Passed')
    await expect(page.locator('[data-prove-after]')).toHaveAttribute('data-prove-after', 'proved')
    await expect(page.locator('[data-shift-readout]')).toBeVisible()
    await open(page, '/play/shape-shifter?level=fewest&mode=prove')
    await expect(page.locator('[data-prove-panel]')).toHaveAttribute('data-stake', 'practice')
    await expect(page.locator('[data-prove-stake]')).toContainText('You have proved this level.')
  })
})

test.describe('the keys and the checks', () => {
  test('the keys alone play `views` to its debrief, with focus in view at every stop', async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await openLevel(page, 'views', 'fresh')
    const walk = walkOf(page)
    await shiftWalkWith('views')(page, walk)
    expect(walk.problems()).toEqual([])
  })

  test('axe finds no serious or critical violation in play, with a picker open, and at the result', async ({ page }) => {
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await openLevel(page, 'three-d')
      const serious = async () => (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
      expect(await serious()).toEqual([])
      await guess(page, 8)
      await page.locator('[data-shift-bar] [data-op="reshape"]').click()
      await expect(page.locator('[data-shift-picker]')).toBeVisible()
      expect(await serious()).toEqual([])
      // Escape closes the picker and gives focus back to its button.
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-shift-picker]')).toHaveCount(0)
      await expect(page.locator('[data-shift-bar] [data-op="reshape"]')).toBeFocused()
      for (const action of ghostActions(buildLevel('three-d', 26))) await tap(page, action)
      await expect(verdict(page)).toBeVisible()
      await quiet(page)
      expect(await serious()).toEqual([])
    }
  })

  test('under reduced motion nothing moves, and `grid` plays to its verdict', async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openLevel(page, 'grid')
    await guess(page, 80)
    const moving = await page.locator('.es-shift__cell, .es-shift__number, .es-shift-dock__step').evaluateAll((all) => all.filter((element) => parseFloat(getComputedStyle(element).transitionDuration) > 0).length)
    expect(moving).toBe(0)
    for (const action of ghostActions(buildLevel('grid', 0))) await tap(page, action)
    await expect(verdict(page)).toHaveText('Finished (practice)')
    await expect(game(page).locator('[data-moment="masked"]')).toBeVisible()
  })
})
