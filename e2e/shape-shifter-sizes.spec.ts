/*
 * Tensor views (`shape-shifter`) at the twelve sizes (e2e/support/sizes.ts), every level played to its result on the built site:
 *
 *   1. With the pointer, as a learner plays the reference's plan: at the start the goal's number and its end are on the screen without
 *      "more"; on a phone as tall as 390 x 844 the cells and the buffer's first row (on `grid`, the tiles) stand whole over the pinned dock
 *      while the guess is asked; every control the plan presses next is whole on the screen, its own at its middle, clear of the "More below"
 *      at a box's foot and at least 44 px, with no scroll of the page but the one a learner makes to reach the dock on a screen under 700 px
 *      tall (a box inside the dock is scrolled as a finger scrolls it); the readout is whole on the screen while the level is played, and no
 *      tensor is drawn too small to read (a numbered cell under 20 px, a grid's cell under 14). Nothing moves under the hand (DC-A): the
 *      readout, the dock where it is pinned or beside the drawing, and the operation bar keep their rectangles across the press that opens a
 *      picker, the commit, each choice and each step, and so does the drawing at a desk; a second press at the spot of the last move,
 *      moments after it, presses nothing the result put there.
 *   2. With the keys alone: the walk of every level (e2e/support/walks.ts) at every size, with every focus stop on the screen and uncovered.
 *   2a. On a phone's pinned dock "More below" stands on the paper: no line of the dock's content shows through it.
 *   3. The parts of the drawing on a phone: the part names' buttons do not overlap, "show its order" takes a press over 44 px, and the
 *      target's order, opened, stands whole over the pinned dock.
 *   4. The grid's first run on a phone: while the first-move strip is held, dimension 1's "one more" is whole and its own.
 *   5. At a desk, the grid's launch panel (the steppers and Launch) is whole in the dock, with nothing to scroll.
 *   6. Under reduced motion no animation or transition runs after any move (DC-G).
 */
import type { Page } from '@playwright/test'
import { buildLevel } from '../packages/play/shape-shifter/levels'
import { GAMES } from '../packages/play/registry'
import type { ShiftLevelId } from '../packages/play/shape-shifter/types'
import type { ShiftOp } from '../packages/sim/tensor'
import { walkOf } from './support/front'
import { expect, open, quiet, test, withSettings } from './support/site'
import { isNarrow, isPinned, painted, rects, seen, sizeName, SIZES, TOUCH, touchRoom, type ScreenSize } from './support/sizes'
import { openLevel as openWalk, WALKS } from './support/walks'

// Each test opens its own page: they spread over the workers and over CI's shards, so the matrix does not hold one worker for its length.
test.describe.configure({ mode: 'parallel' })

const LEVELS = (GAMES.get('shape-shifter')?.levels ?? []).map((level) => level.id as ShiftLevelId)
const PARTS = ['table', 'buffer', 'order', 'target', 'shared', 'slices', 'tensor', 'program', 'block', 'grid-size', 'mask']
const game = (page: Page) => page.locator('section[data-game="shape-shifter"]')
const verdict = (page: Page) => page.locator('[data-result] [data-result-heading]')

/** The smallest cell a tensor's number is drawn in: the number is then at least 9 px (shape-shifter.css). A grid's cell holds no number. */
const READABLE = 20
const CELL_FLOOR = 14

/** Opens a level on its practice seed, the 3D view off. `met` seeds the intro flag with every part; `fresh` leaves it empty. */
async function openLevel(page: Page, level: string, intro: 'met' | 'fresh' = 'met') {
  await withSettings(page.context(), { view3d: false })
  if (intro === 'met') await page.addInitScript((parts) => localStorage.setItem('es:intro', JSON.stringify({ 'shape-shifter': parts })), PARTS)
  await open(page, `/play/shape-shifter?level=${level}`)
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

/**
 * The part of a control that a box scrolling round it hides: under the box's edges, or under the "More below" its foot shows while there is
 * more below (shape-shifter.css, frame.css), which lets presses through and so is not found at the control's middle. Empty when none.
 */
async function hidden(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).first().evaluate((element) => {
    const r = element.getBoundingClientRect()
    const found: string[] = []
    for (let box = element.parentElement; box !== null && box !== document.body; box = box.parentElement) {
      if (!/auto|scroll|hidden|clip/.test(getComputedStyle(box).overflowY) || box.scrollHeight <= box.clientHeight + 1) continue
      const b = box.getBoundingClientRect()
      const bands = [box, box.firstElementChild].filter((holder): holder is Element => holder !== null).map((holder) => getComputedStyle(holder, '::after'))
      const band = bands.find((style) => style.content.includes('More below') && style.visibility === 'visible' && style.display !== 'none')
      const foot = b.bottom - (band === undefined ? 0 : parseFloat(band.height))
      if (r.top < b.top - 0.5 || r.bottom > foot + 0.5) found.push(`${box.className.split(' ')[0]}: ${Math.round(r.top)}-${Math.round(r.bottom)} in ${Math.round(b.top)}-${Math.round(foot)}`)
    }
    return found
  })
}

/** The control is whole on the screen, its own at its middle, clear of any box's foot, and at least 44 px each way. */
async function inHand(page: Page, selector: string, what: string) {
  const target = page.locator(selector).first()
  expect([what, 'hidden by a box round it', await hidden(page, selector)]).toEqual([what, 'hidden by a box round it', []])
  const now = await seen(target)
  expect([what, 'whole on the screen', now.whole, now.box, now.screen]).toEqual([what, 'whole on the screen', true, now.box, now.screen])
  expect([what, 'its own at its middle', now.own, now.box]).toEqual([what, 'its own at its middle', true, now.box])
  expect([what, 'at least 44 px', now.box[2] >= TOUCH && now.box[3] >= TOUCH, now.box]).toEqual([what, 'at least 44 px', true, now.box])
  return now
}

/** A press where the control stands now, as a hand makes it: the page is not scrolled to it first. Returns the spot. */
async function press(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not drawn`)
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.click(at.x, at.y)
  return at
}

/**
 * A control lower (or higher) in a box that scrolls inside the dock than the box shows is scrolled into the middle of the box's room over
 * its "More below", as a finger scrolls that box (a picker, the steppers, the dock): the page stays where it is.
 */
async function scrollInItsBox(page: Page, selector: string) {
  const { still, moved } = await page.locator(selector).first().evaluate((element) => {
    const before = window.scrollY
    let scrolled = false
    const dock = element.closest('[data-dock]')
    for (let box = element.parentElement; box !== null && dock !== null && dock.contains(box); box = box.parentElement) {
      if (!/auto|scroll/.test(getComputedStyle(box).overflowY) || box.scrollHeight <= box.clientHeight + 1) continue
      const band = [box, box.firstElementChild].filter((holder): holder is Element => holder !== null).map((holder) => getComputedStyle(holder, '::after')).find((style) => style.content.includes('More below'))
      const [c, b] = [element.getBoundingClientRect(), box.getBoundingClientRect()]
      const foot = b.bottom - (band === undefined ? 0 : parseFloat(band.height))
      if (c.top >= b.top && c.bottom <= foot) continue
      box.scrollTop += (c.top + c.bottom) / 2 - (b.top + foot) / 2
      scrolled = true
    }
    return { still: window.scrollY === before, moved: scrolled }
  })
  expect(still, 'a box in the dock scrolls in itself, and the page stays').toBe(true)
  // A finger that scrolled a box lifts and lands again: a press at the spot of the last one, sooner than that, is taken for a stray (hand.ts).
  if (moved) await page.waitForTimeout(850)
}

/**
 * On a screen under 700 px tall, which cannot hold the frame, the learner scrolls once, to the dock's foot; nothing else scrolls the page in
 * these tests. On a taller screen the page is not scrolled.
 */
async function reachDock(page: Page, size: ScreenSize) {
  if (!isNarrow(size) && size.height >= 700) return
  await page.locator('[data-dock]').evaluate((dock) => {
    const r = dock.getBoundingClientRect()
    if (r.bottom > window.innerHeight) window.scrollBy({ top: Math.min(r.bottom - window.innerHeight, r.top) })
  })
  await painted(page)
}

/** The goal's number and its end on the screen, at the page's top, with "more" not opened. */
async function goalShown(page: Page) {
  for (const part of ['target', 'ends']) {
    const shown = await game(page)
      .locator(`.es-goal [data-part="${part}"]`)
      .evaluate((element) => {
        const lines = [...element.getClientRects()].filter((line) => line.width > 0)
        const opened = element.closest('.es-frame__goal-box')?.hasAttribute('data-open') ?? false
        return !opened && lines.length > 0 && lines.every((line) => line.top >= 0 && line.bottom <= window.innerHeight && line.left >= 0 && line.right <= window.innerWidth)
      })
    expect([`the goal's ${part === 'target' ? 'number' : 'end'} on the screen without "more"`, shown]).toEqual([`the goal's ${part === 'target' ? 'number' : 'end'} on the screen without "more"`, true])
  }
}

/** The parts of the drawing the guess reads, whole over the pinned dock: the cells and the buffer's first row, or on `grid` the tiles. */
async function drawingOverDock(page: Page, level: string) {
  const parts = level === 'grid' ? { tiles: '[data-shift-grid] .es-shift__cells' } : { cells: '[data-shift-cells] .es-shift__cells', 'the buffer\'s first row': '[data-shift-buffer="now"] .es-shift__buffer-row' }
  for (const [name, selector] of Object.entries(parts)) {
    const over = await page.locator(selector).first().evaluate((element) => {
      const r = element.getBoundingClientRect()
      const dock = document.querySelector('[data-dock]')?.getBoundingClientRect().top ?? window.innerHeight
      return { whole: r.height > 0 && r.top >= 0 && r.bottom <= dock + 0.5, box: [Math.round(r.top), Math.round(r.bottom)], dock: Math.round(dock) }
    })
    expect([name, 'whole over the dock', over.whole, over]).toEqual([name, 'whole over the dock', true, over])
  }
}

/** The readout whole on the screen while the level is played. */
async function readoutShown(page: Page, after: string) {
  const now = await seen(page.locator('[data-readout]'))
  expect([`the readout, after ${after}`, now.whole, now.box, now.screen]).toEqual([`the readout, after ${after}`, true, now.box, now.screen])
}

/** No tensor is drawn too small to read: a numbered cell is at least READABLE px, and a grid's cell, which holds no number, CELL_FLOOR. */
async function readable(page: Page, after: string) {
  const sizes = await game(page)
    .locator('.es-shift__cells')
    .evaluateAll((all) => all.map((cells) => ({ grid: cells.closest('[data-shift-grid]') !== null, size: parseFloat((cells as HTMLElement).style.getPropertyValue('--es-cell')) })))
  const small = sizes.filter(({ grid, size }) => size < (grid ? CELL_FLOOR : READABLE))
  expect([`cells after ${after} drawn too small`, small]).toEqual([`cells after ${after} drawn too small`, []])
}

/** The focused control, after a press that moved focus, whole on the screen and its own. */
async function focusSeen(page: Page, after: string) {
  const focus = await page.evaluate(() => {
    const active = document.activeElement
    if (active === null || active === document.body || !active.closest('[data-game]') || !active.matches('button, input, [data-result-heading], h3, [role="group"]')) return null
    const r = active.getBoundingClientRect()
    const whole = r.top >= -0.5 && r.left >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 12))
    return { whole, own: at !== null && (active.contains(at) || at.contains(active)), name: (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().slice(0, 40), box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
  })
  if (focus === null) return
  expect([`focus after ${after}`, focus.name, focus.whole && focus.own, focus.box]).toEqual([`focus after ${after}`, focus.name, true, focus.box])
}

/**
 * The boxes that may not move under the hand: the readout, the dock where it is pinned or stands beside the drawing, and at a desk the
 * drawing too. On a phone the drawing grows in the page, and under 700 px the dock follows it and takes its decision's height (the readout
 * at its head stays).
 */
const still = (size: ScreenSize, drawing: boolean): Record<string, string> => ({
  readout: '[data-readout]',
  ...(isPinned(size) || !isNarrow(size) ? { dock: '[data-dock]' } : {}),
  ...(drawing || !isNarrow(size) ? { drawing: '[data-frame-diagram]' } : {}),
})

/** A press that may not move the boxes `which` names: their rectangles before it and after it are the same. */
async function pressStill(page: Page, selector: string, which: Record<string, string>, settle: () => Promise<void>, what = selector) {
  const before = await rects(page, which)
  const at = await press(page, selector)
  await settle()
  await painted(page)
  const after = await rects(page, which)
  // A move of less than a pixel is the page's rounding, not a move under the hand.
  for (const name of Object.keys(which)) {
    const [was, now] = [before[name], after[name]]
    if (was === null || now === null) continue
    const moved = was.some((value, at) => Math.abs(value - (now[at] ?? value)) >= 1)
    expect([name, `stays where it was across ${what}`, moved ? now : was]).toEqual([name, `stays where it was across ${what}`, was])
  }
  return at
}

/** A second press at the spot of the last move, moments after it, presses nothing the result put there: the result stays as it came. */
async function secondPressIgnored(page: Page, at: { x: number; y: number }, level: string, words: string) {
  await page.waitForTimeout(350)
  const url = page.url()
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(450)
  await expect(verdict(page)).toHaveText(words)
  await expect(game(page)).toHaveAttribute('data-level', level)
  expect(page.url()).toBe(url)
}

/** No animation or transition runs (DC-G), read straight after a move. */
async function nothingRuns(page: Page, after: string) {
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.playState === 'running' && (animation.effect as KeyframeEffect | null)?.target instanceof Element && ((animation.effect as KeyframeEffect).target as Element).closest('[data-game]') !== null)
      .map((animation) => `${((animation.effect as KeyframeEffect).target as Element).className} ${(animation as CSSAnimation).animationName ?? (animation as CSSTransition).transitionProperty ?? ''}`),
  )
  expect([`running after ${after}`, running]).toEqual([`running after ${after}`, []])
}

interface Play {
  readonly size: ScreenSize
  readonly level: ShiftLevelId
  /** Under reduced motion: nothing runs after any move. */
  readonly calm?: boolean
}

/** Plays the level's reference plan with the pointer, checking at every move what the file's head lists. */
async function playByPointer(page: Page, { size, level, calm = false }: Play) {
  const seed = Number(await game(page).getAttribute('data-seed'))
  const built = buildLevel(level, seed)
  await goalShown(page)
  // On a laptop's short window the readout is on the first screen, before any scroll.
  if (!isNarrow(size)) await readoutShown(page, 'the page opened')
  // The guess's card leaves the drawing it asks about uncovered on a phone as tall as 390 x 844 (a shorter one shows it with a scroll).
  if (isPinned(size) && size.height >= 844) await drawingOverDock(page, level)
  await reachDock(page, size)
  let last = { x: 0, y: 0 }
  const after = async (what: string) => {
    if (calm) await nothingRuns(page, what)
    if (await game(page).getAttribute('data-phase') === 'result') return
    await readoutShown(page, what)
    await readable(page, what)
    await focusSeen(page, what)
  }
  for (const [index, task] of built.tasks.entries()) {
    const target = `target ${index + 1}`
    await page.locator('[data-shift-predict]').waitFor()
    await inHand(page, '[data-shift-predict] input', `${target}: the guess's field`)
    await press(page, '[data-shift-predict] input')
    await page.keyboard.type('0')
    await inHand(page, '[data-shift-predict] button[type="submit"]', `${target}: Commit`)
    // The press after Commit comes once a press at Commit's spot is no longer taken for Commit's second (hand.ts).
    await pressStill(page, '[data-shift-predict] button[type="submit"]', still(size, true), () => expect(page.locator('[data-shift-predict]')).toHaveCount(0), `${target}: Commit`)
    await after(`${target}: Commit`)
    await page.waitForTimeout(600)
    if (built.kind === 'layout') {
      const ghost = (task as { ghost: readonly ShiftOp[] }).ghost
      for (const op of ghost) {
        const bar = `[data-shift-bar] [data-op="${op.op}"]`
        await inHand(page, bar, `${target}: ${op.op}`)
        const which = { ...still(size, op.op !== 'contiguous'), bar: '[data-shift-bar]' }
        const final = op === ghost[ghost.length - 1] && index === built.tasks.length - 1
        if (op.op === 'contiguous') {
          // The move that ends the level puts the result in the dock, which is read with the page on a phone: only the bar is held to.
          last = await pressStill(page, bar, final ? {} : which, async () => undefined, `${target}: contiguous()`)
          await after(`${target}: contiguous()`)
          continue
        }
        await pressStill(page, bar, which, () => page.locator('[data-shift-picker][data-settled]').waitFor(), `${target}: ${op.op}`)
        await after(`${target}: ${op.op}'s picker`)
        const choice = `[data-shift-picker] [data-choice="${face(op)}"]`
        await scrollInItsBox(page, choice)
        await inHand(page, choice, `${target}: ${op.op} ${face(op)}`)
        last = await pressStill(page, choice, final ? {} : { ...still(size, false), bar: '[data-shift-bar]' }, () => expect(page.locator('[data-shift-picker]')).toHaveCount(0), `${target}: ${op.op} ${face(op)}`)
        await after(`${target}: ${op.op} ${face(op)}`)
      }
    } else {
      for (const [dim, value] of (task as { block: readonly number[] }).block.entries()) {
        const more = `[data-stepper="BLOCK along dimension ${dim}"] button[aria-label="BLOCK along dimension ${dim}: one more"]`
        for (let v = 1; v < value; v++) {
          await scrollInItsBox(page, more)
          await inHand(page, more, `BLOCK ${dim}'s "one more", at ${v}`)
          await pressStill(page, more, { ...still(size, false), more }, async () => undefined, `BLOCK ${dim} to ${v + 1}`)
          await after(`BLOCK ${dim} to ${v + 1}`)
        }
      }
      await scrollInItsBox(page, '[data-shift-launch-button]')
      await inHand(page, '[data-shift-launch-button]', 'Launch')
      last = await press(page, '[data-shift-launch-button]')
    }
  }
  const words = built.graded ? 'Passed' : 'Finished (practice)'
  await expect(verdict(page)).toHaveText(words)
  await secondPressIgnored(page, last, level, words)
}

for (const size of SIZES) {
  test.describe(`at ${sizeName(size)}`, () => {
    for (const level of LEVELS) {
      test(`\`${level}\` played with the pointer: the aim and the drawing in view, each control whole and its own, nothing moves under the hand`, async ({ page }) => {
        test.setTimeout(240_000)
        await page.setViewportSize(size)
        await openLevel(page, level)
        await playByPointer(page, { size, level })
      })

      test(`\`${level}\` walked with the keys: every focus stop on the screen and uncovered`, async ({ page }) => {
        test.setTimeout(240_000)
        await page.setViewportSize(size)
        const walk = walkOf(page)
        await openWalk(page, 'shape-shifter', level)
        await WALKS['shape-shifter'][level](page, walk)
        expect(walk.trail.length, 'stops the walk read').toBeGreaterThan(5)
        expect(walk.problems(), 'a focus stop a keyboard user cannot see').toEqual([])
      })
    }
  })
}

test.describe('the parts of the drawing on a phone', () => {
  for (const size of SIZES.filter((candidate) => candidate.width < 768)) {
    test(`at ${sizeName(size)} the part names do not overlap, "show its order" takes a 44 px press, and the order opened stands whole over the dock`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(size)
      for (const level of LEVELS) {
        await openLevel(page, level)
        await page.locator('[data-shift-predict]').waitFor()
        const overlaps = await game(page)
          .locator('[data-frame-diagram] button[data-part]')
          .evaluateAll((all) => {
            const boxes = all.map((element) => ({ name: element.textContent?.trim() ?? '', r: element.getBoundingClientRect() }))
            const found: string[] = []
            for (let i = 0; i < boxes.length; i++)
              for (let j = i + 1; j < boxes.length; j++) {
                const [a, b] = [boxes[i].r, boxes[j].r]
                if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) found.push(`${boxes[i].name} over ${boxes[j].name}`)
              }
            return found
          })
        expect([level, 'part buttons that overlap', overlaps]).toEqual([level, 'part buttons that overlap', []])
        if (level === 'grid') continue
        const toggle = page.locator('[data-shift-target-toggle]')
        expect([level, 'show its order', await touchRoom(toggle)]).toEqual([level, 'show its order', { room: true, misses: [] }])
        await press(page, '[data-shift-target-toggle]')
        await expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await painted(page)
        const order = await page.locator('[data-shift-target-elements]').evaluate((element) => {
          const r = element.getBoundingClientRect()
          const pinned = getComputedStyle(document.querySelector('[data-dock]') as Element).position === 'sticky'
          const foot = pinned ? (document.querySelector('[data-dock]')?.getBoundingClientRect().top ?? window.innerHeight) : window.innerHeight
          return { whole: r.height > 0 && r.top >= 0 && r.bottom <= foot + 0.5, box: [Math.round(r.top), Math.round(r.bottom)], foot: Math.round(foot) }
        })
        expect([level, 'the order, opened, over the dock', order.whole, order]).toEqual([level, 'the order, opened, over the dock', true, order])
      }
    })
  }
})

test.describe('"More below"', () => {
  for (const size of SIZES.filter(isPinned)) {
    test(`at ${sizeName(size)} stands on the paper at the dock's foot: nothing under it shows through, on every level's guess`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(size)
      for (const level of LEVELS) {
        await openLevel(page, level)
        await page.locator('[data-shift-predict]').waitFor()
        await painted(page)
        const main = await page.locator('[data-dock-main]').boundingBox()
        if (main === null) throw new Error('the dock is not drawn')
        const shown = await page.locator('[data-dock-main]').evaluate((box) => getComputedStyle(box, '::after').visibility === 'visible' && box.scrollHeight > box.clientHeight + 1)
        expect([level, 'the dock says "More below"', shown]).toEqual([level, 'the dock says "More below"', true])
        // The line of the words, at the dock's foot (the lines over it fade out into the paper): drawn the same with the dock's content there
        // and with it hidden.
        const clip = { x: main.x, y: main.y + main.height - 16, width: main.width, height: 15 }
        const over = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })
        const style = await page.addStyleTag({ content: '[data-dock-main] > * { visibility: hidden !important; }' })
        const bare = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' })
        await style.evaluate((node) => node.remove())
        expect([level, 'the content shows through "More below"', !over.equals(bare)]).toEqual([level, 'the content shows through "More below"', false])
      }
    })
  }
})

test.describe('the first run\'s card', () => {
  for (const size of SIZES.filter((candidate) => isPinned(candidate) && candidate.height >= 844)) {
    test(`at ${sizeName(size)} leaves the drawing and the buffer's first row uncovered over the dock, on every level`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(size)
      for (const level of LEVELS) {
        await openLevel(page, level, 'fresh')
        await expect(game(page).locator('.es-intro[data-intro="parts"]')).toBeVisible()
        await painted(page)
        await drawingOverDock(page, level)
      }
    })
  }
})

test.describe('the grid\'s first run', () => {
  for (const size of SIZES.filter(isPinned)) {
    test(`at ${sizeName(size)} dimension 1's "one more" is whole and its own while the first-move strip is held`, async ({ page }) => {
      await page.setViewportSize(size)
      await openLevel(page, 'grid', 'fresh')
      const intro = game(page).locator('.es-intro').first()
      for (let guard = 0; guard < 12 && ['parts', 'look'].includes((await intro.getAttribute('data-intro')) ?? ''); guard++) await press(page, '[data-intro-next]')
      await press(page, '[data-shift-predict] input')
      await page.keyboard.type('80')
      await press(page, '[data-shift-predict] button[type="submit"]')
      await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
      await page.waitForTimeout(1000)
      await expect(page.locator('.es-marker__ring [data-step="more"]')).toHaveCount(1)
      await press(page, '[data-stepper="BLOCK along dimension 0"] button[aria-label="BLOCK along dimension 0: one more"]')
      await expect(page.locator('[data-stepper="BLOCK along dimension 0"] output')).toHaveText('2')
      await expect(game(page).locator('.es-intro[data-ended]')).toHaveCount(1)
      await inHand(page, '[data-stepper="BLOCK along dimension 1"] button[aria-label="BLOCK along dimension 1: one more"]', 'dimension 1\'s "one more"')
      await press(page, '[data-stepper="BLOCK along dimension 1"] button[aria-label="BLOCK along dimension 1: one more"]')
      await expect(page.locator('[data-stepper="BLOCK along dimension 1"] output')).toHaveText('2')
    })
  }
})

test.describe('the grid\'s launch panel at a desk', () => {
  for (const size of SIZES.filter((candidate) => !isNarrow(candidate))) {
    test(`at ${sizeName(size)} the steppers and Launch are whole in the dock, with nothing to scroll`, async ({ page }) => {
      await page.setViewportSize(size)
      await openLevel(page, 'grid')
      await press(page, '[data-shift-predict] input')
      await page.keyboard.type('80')
      await press(page, '[data-shift-predict] button[type="submit"]')
      await expect(page.locator('[data-shift-predict]')).toHaveCount(0)
      await painted(page)
      const panel = await page.evaluate(() => {
        const steppers = document.querySelector<HTMLElement>('[data-shift-steppers] .es-shift-dock__steppers')
        const main = document.querySelector<HTMLElement>('[data-dock-main]')
        return { steppers: steppers === null ? -1 : steppers.scrollHeight - steppers.clientHeight, main: main === null ? -1 : main.scrollHeight - main.clientHeight }
      })
      expect(panel, 'what the steppers and the dock hide under their foot, in px').toEqual({ steppers: 0, main: 0 })
      await inHand(page, '[data-shift-launch-button]', 'Launch')
      for (const button of await page.locator('[data-shift-steppers] button').all()) {
        const now = await seen(button)
        expect([await button.getAttribute('aria-label'), now.whole && now.own, now.box]).toEqual([await button.getAttribute('aria-label'), true, now.box])
      }
    })
  }
})

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })
  for (const size of [SIZES[0], SIZES[5]]) {
    for (const level of LEVELS) {
      test(`at ${sizeName(size)} \`${level}\` runs no animation or transition after any move`, async ({ page }) => {
        test.setTimeout(240_000)
        await page.setViewportSize(size)
        await openLevel(page, level)
        await playByPointer(page, { size, level, calm: true })
      })
    }
  }
})
