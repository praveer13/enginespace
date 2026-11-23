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
    // A double click as a hand makes it: two presses 400 ms apart, whatever the page has drawn in between.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
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

test.describe('the first move pressed again', () => {
  test.use({ hasTouch: true })

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 412, height: 915 },
    { width: 360, height: 800 },
    { width: 360, height: 640 },
  ]) {
    test(`at ${viewport.width} x ${viewport.height} the ringed BLOCK "one more" stays where it was pressed, and four presses at that spot count four`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openLevel(page, 'grid', 'fresh')
      const intro = game(page).locator('.es-intro').first()
      for (let guard = 0; guard < 12 && ['parts', 'look'].includes((await intro.getAttribute('data-intro')) ?? ''); guard++) await page.locator('[data-intro-next]').click()
      await guess(page, 80)
      // The press after Commit comes once a press at Commit's spot is no longer taken for Commit's second (hand.ts, SAME_TIME).
      await page.waitForTimeout(1000)
      const more = page.getByRole('button', { name: 'BLOCK along dimension 0: one more' })
      await expect(page.locator('.es-marker__ring [data-step="more"]')).toHaveCount(1)
      const box = await more.boundingBox()
      if (box === null) throw new Error('"one more" is not drawn')
      const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      // The ringed control is whole, its own at its middle, and over the readout, as the first run hands it to the learner.
      const own = await more.evaluate((button, [x, y]) => button.contains(document.elementFromPoint(x, y)), [at.x, at.y] as const)
      expect(own, `the ringed "one more" is its own at ${JSON.stringify(at)}`).toBe(true)
      for (let press = 0; press < 4; press++) {
        await page.touchscreen.tap(at.x, at.y)
        await page.waitForTimeout(450)
        const now = await more.boundingBox()
        expect([press, Math.round(now?.x ?? -1), Math.round(now?.y ?? -1)]).toEqual([press, Math.round(box.x), Math.round(box.y)])
      }
      await expect(page.locator('[data-stepper="BLOCK along dimension 0"] output')).toHaveText('5')
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

test.describe('a key pressed twice', () => {
  for (const gap of [80, 250]) {
    test(`Enter twice on \`view\`, ${gap} ms apart, opens its picker and applies nothing`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openLevel(page, 'fewest')
      await page.getByRole('button', { name: 'Skip the guess' }).click()
      await page.locator('[data-shift-bar] [data-op="view"]').focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(gap)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
      await expect(page.locator('[data-shift-picker="view"]')).toBeVisible()
      await expect(page.locator('.es-shift-dock__where')).toHaveText('Target 1 of 3 · operation 1')
      await expect(game(page).locator('[data-moment]')).toHaveCount(0)
      // The choice in focus is pressed by the next key, once the picker has stood a moment.
      await page.locator('[data-shift-picker][data-settled]').waitFor()
      await page.keyboard.press('Enter')
      await expect(page.locator('.es-shift-dock__where')).not.toHaveText('Target 1 of 3 · operation 1')
    })
  }
})

test.describe('a key held down, and Enter twice on the grid\'s guess', () => {
  test('Enter held on `view` well past the picker\'s settle opens its picker and applies nothing; the next press applies the choice', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openLevel(page, 'fewest')
    await page.getByRole('button', { name: 'Skip the guess' }).click()
    await page.locator('[data-shift-bar] [data-op="view"]').focus()
    // Held for about 1.2 s: the key's first press, then its repeats every 33 ms after half a second, as a system's key repeat sends them.
    await page.keyboard.down('Enter')
    await page.waitForTimeout(500)
    for (let repeat = 0; repeat < 20; repeat++) {
      await page.keyboard.down('Enter')
      await page.waitForTimeout(33)
    }
    await page.keyboard.up('Enter')
    await page.waitForTimeout(300)
    await expect(page.locator('[data-shift-picker="view"]')).toBeVisible()
    await expect(page.locator('.es-shift-dock__where')).toHaveText('Target 1 of 3 · operation 1')
    await expect(game(page).locator('[data-moment]')).toHaveCount(0)
    await page.locator('[data-shift-picker][data-settled]').waitFor()
    await page.keyboard.press('Enter')
    await expect(page.locator('.es-shift-dock__where')).not.toHaveText('Target 1 of 3 · operation 1')
  })

  for (const gap of [80, 600]) {
    test(`Enter twice on the grid's guess, ${gap} ms apart, commits it and presses no stepper`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await openLevel(page, 'grid')
      const field = page.getByRole('textbox', { name: 'Your guess' })
      await field.fill('20')
      await field.press('Enter')
      await page.waitForTimeout(gap)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
      await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
      await expect(page.locator('[data-stepper="BLOCK along dimension 0"] output')).toHaveText('1')
      // Focus is on the first stepper's group, which presses nothing, and Tab goes on to its "one more".
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stepper'))).toBe('BLOCK along dimension 0')
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'BLOCK along dimension 0: one more' })).toBeFocused()
    })
  }
})

test.describe('the ring on a level of the operation bar, and on a phone\'s steppers', () => {
  test.use({ hasTouch: true })

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`at ${viewport.width} x ${viewport.height} on \`views\` the bar's buttons keep their own 44 px beside the ring, and the strip goes with the first move`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openLevel(page, 'views', 'fresh')
      const intro = game(page).locator('.es-intro').first()
      for (let guard = 0; guard < 12 && ['parts', 'look'].includes((await intro.getAttribute('data-intro')) ?? ''); guard++) await page.locator('[data-intro-next]').click()
      await page.getByRole('button', { name: 'Skip the guess' }).click()
      await expect(page.locator('.es-marker__ring [data-op="transpose"]')).toBeVisible()
      const heights = () => page.locator('[data-shift-bar] button').evaluateAll((all) => all.map((button) => Math.round(button.getBoundingClientRect().height)))
      expect(await heights()).toEqual([44, 44, 44, 44])
      await page.locator('[data-shift-bar] [data-op="transpose"]').tap()
      await page.locator('[data-shift-picker] [data-choice="0 and 1"]').tap()
      await expect(game(page).locator('.es-intro')).toHaveCount(0)
      expect(await heights()).toEqual([44, 44, 44, 44])
    })
  }

  test('at 390 x 844 on `grid` dimension 1\'s "one more" is whole in the dock while the ring is on its neighbour and while its room is held', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openLevel(page, 'grid', 'fresh')
    const intro = game(page).locator('.es-intro').first()
    for (let guard = 0; guard < 12 && ['parts', 'look'].includes((await intro.getAttribute('data-intro')) ?? ''); guard++) await page.locator('[data-intro-next]').click()
    await guess(page, 80)
    const whole = () =>
      page.getByRole('button', { name: 'BLOCK along dimension 1: one more' }).evaluate((button) => {
        const r = button.getBoundingClientRect()
        const own = [r.left + 2, r.left + r.width / 2, r.right - 2].every((x) => button.contains(document.elementFromPoint(x, r.top + r.height / 2)))
        return { own, right: Math.round(r.right), width: window.innerWidth }
      })
    await expect(page.locator('.es-marker__ring [data-step="more"]')).toHaveCount(1)
    expect((await whole()).own, `while the ring is on: ${JSON.stringify(await whole())}`).toBe(true)
    await page.waitForTimeout(1000)
    await tapAt(page, '.es-marker__ring [data-step="more"]')
    await expect(page.locator('[data-stepper="BLOCK along dimension 0"] output')).toHaveText('2')
    await expect(game(page).locator('.es-intro')).toHaveCount(1)
    expect((await whole()).own, `while the room is held: ${JSON.stringify(await whole())}`).toBe(true)
  })
})

test.describe('Prove mode', () => {
  test('a Prove run keeps the seed it drew until its end: no Restart level or New numbers while it is on, and at its result they start a run recorded as practice', async ({ page }) => {
    test.setTimeout(120_000)
    await openLevel(page, 'fewest')
    await page.locator('[data-prove-entry]').click()
    await page.getByLabel('My coding agent and any AI chat are closed.').check()
    await page.getByRole('button', { name: 'Start the Prove run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    const foot = page.locator('.es-frame__foot')
    await expect(foot.getByRole('button', { name: 'Restart level' })).toHaveCount(0)
    await expect(foot.getByRole('button', { name: 'New numbers' })).toHaveCount(0)
    const seed = Number(await game(page).getAttribute('data-seed'))
    for (const task of buildLevel('fewest', seed).tasks) {
      if (await page.locator('[data-shift-predict]').isVisible()) await page.getByRole('button', { name: 'Skip the guess' }).click()
      for (const op of 'ghost' in task ? task.ghost : []) await tap(page, { t: 'op', op })
    }
    await expect(verdict(page)).toHaveText('Passed')
    await expect(page.locator('[data-prove-after]')).toHaveAttribute('data-prove-after', 'proved')
    await foot.getByRole('button', { name: 'New numbers' }).click()
    await expect(page.locator('[data-prove-foot]')).toContainText('Recorded as practice')
    expect(Number(await game(page).getAttribute('data-seed'))).not.toBe(seed)
  })

  test('a Prove run left before its end counts as a miss: a reload finds the attempt that counts spent, and the next run is practice', async ({ page }) => {
    test.setTimeout(120_000)
    await openLevel(page, 'fewest')
    await page.locator('[data-prove-entry]').click()
    await expect(page.locator('[data-prove-panel]')).toHaveAttribute('data-stake', 'counts')
    await page.getByLabel('My coding agent and any AI chat are closed.').check()
    await page.getByRole('button', { name: 'Start the Prove run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(page.locator('[data-prove-foot]')).toContainText('This attempt counts.')
    if (await page.locator('[data-shift-predict]').isVisible()) await page.getByRole('button', { name: 'Skip the guess' }).click()
    await page.locator('[data-shift-bar] [data-op="transpose"]').click()
    await page.locator('[data-shift-picker] button[data-choice]').first().click()
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.locator('[data-prove-panel]')).toHaveAttribute('data-stake', 'practice')
    await expect(page.locator('[data-prove-stake]')).toContainText('Your last attempt that counted was left before its end, so it counts as a miss.')
    await page.getByLabel('My coding agent and any AI chat are closed.').check()
    await page.getByRole('button', { name: 'Start the Prove run' }).click()
    await expect(page.locator('[data-prove-foot]')).toContainText('Recorded as practice')
  })

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

test.describe('a 1-D target is one row', () => {
  for (const width of [1440, 1280, 390, 320]) {
    test(`at ${width} px \`views\`' target of 24 elements stands on one row, scrolls inside its box when it must, and the page does not scroll sideways`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openLevel(page, 'views')
      // A phone keeps the target's numbers behind its toggle.
      const toggle = page.locator('[data-shift-target-toggle]')
      if (await toggle.isVisible()) await toggle.click()
      const cells = page.locator('[data-shift-target-elements] [data-goal-element]')
      await expect(cells).toHaveCount(24)
      const seen = await cells.evaluateAll((all) => {
        const tops = new Set(all.map((cell) => Math.round(cell.getBoundingClientRect().top)))
        const box = all[0]?.closest<HTMLElement>('[data-one-row]')
        return { rows: tops.size, grouped: box !== null && box !== undefined, own: box === null || box === undefined ? 0 : box.scrollWidth - box.clientWidth, page: document.documentElement.scrollWidth - document.documentElement.clientWidth }
      })
      expect(seen.grouped, 'the one row has a box of its own').toBe(true)
      expect(seen.rows, 'the elements stand on this many lines').toBe(1)
      expect(seen.page, 'the page scrolls sideways by').toBeLessThanOrEqual(0)
      // 24 boxes of 24 px (578 px) do not fit the target's box (280 px at a desk's dock, 272 to 342 px on a phone): the row scrolls inside it.
      expect(seen.own, 'the row scrolls inside its box by').toBeGreaterThan(0)
      await cells.last().evaluate((cell) => cell.scrollIntoView({ block: 'nearest', inline: 'end' }))
      expect(await page.evaluate(() => window.scrollX)).toBe(0)
    })
  }
})
