/*
 * Request path (`engine-floor`) in a browser (REDESIGN §3.5, §3.6, R-T29): the swimlane as the play surface, the dock and its stage list, the
 * first run, and the walks that `verify:games` lists for every game and cannot run itself (A§6.2, A§6.8, A§6.9, GAMES.md §2.5).
 *
 *   1. A keyboard-only walk completes a level: the prediction is picked and committed with Tab and Enter, the stage list is walked with the
 *      arrows and a stage is laid with Enter, focus follows to the next tile, and the run is sent with Tab and Enter. Then the result.
 *   2. The game's own keys: `R` runs, Backspace takes the last stage off, `,` undoes, and `?` lists them all.
 *   3. The swimlane: a column per process, a row per laid stage with its arrow's mark and word, fourteen rows in view at 1440 x 900, a
 *      longer path scrolled to keep "now" in view, and every row's popover with its mechanism, process and source.
 *   4. The first run of REDESIGN §3.5: parts, a look that dispatches nothing, the prediction with no skip and a line that says why, then the
 *      first stage of the reference path pointed at.
 *   5. The stage list filters by process and by typed text, by keyboard; at 390 x 844 three tiles, the run control and the readout are in
 *      the viewport with the current row.
 *   6. A stopped run marks its row, says the rule in the engine's terms, and names the mechanism laid there.
 *   7. Reduced motion, the words, axe at 360 and 1280 px, the origin, and the state hash against Node's.
 *
 * How it runs. The spec starts the app's own Vite dev server on a free port, so it needs no build. With ES_E2E_ORIGIN set to the address of
 * `vite preview` (after `npm run build`) it drives the built site instead, and the one test that imports the sources is skipped.
 */
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { findBanned } from '../src/copy/banned'
import { withSettings } from './support/site'
import { applyAction, startRun, stateHash } from '../packages/play'
import { FLOOR_PARTS } from '../packages/play/engine-floor/copy'
import { buildLevel } from '../packages/play/engine-floor/levels'
import { floorSession } from '../packages/play/engine-floor/session'
import type { FloorAction } from '../packages/play/engine-floor/types'

const root = path.resolve(import.meta.dirname, '..')

let server: ViteDevServer | null = null
let origin = ''
const built = (process.env.ES_E2E_ORIGIN ?? '') !== ''

base.beforeAll(async () => {
  if (built) {
    origin = (process.env.ES_E2E_ORIGIN ?? '').replace(/\/$/, '')
    return
  }
  server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', strictPort: false } })
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) throw new Error('the dev server has no address')
  origin = url.replace(/\/$/, '')
}, 120_000)

base.afterAll(async () => {
  await server?.close()
})

const test = base

const game = (page: Page) => page.locator('section[data-game="engine-floor"]')
const outcome = (page: Page) => page.locator('[data-live="outcome"]')
const line = (page: Page) => game(page).locator('[data-live="line"]').last()
const stage = (page: Page, id: string) => page.locator(`[data-floor-tray] [data-stage="${id}"]`)
const rows = (page: Page) => page.locator('[data-floor-lanes] [data-lane-row]')
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement
    return element === null ? '' : (element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName)
  })

/** The intro flag with every part of the game met: a learner who has seen the first run. */
const MET = JSON.stringify({ 'engine-floor': FLOOR_PARTS.map((part) => part.id) })

async function open(page: Page, level: string, { intro = 'met' }: { intro?: 'met' | 'fresh' } = {}) {
  await withSettings(page.context(), { view3d: false })
  if (intro === 'met')
    await page.addInitScript((flag) => {
      try {
        localStorage.setItem('es:intro', flag)
      } catch {
        // No storage: the intro shows, and the walk Tabs past it.
      }
    }, MET)
  else
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('es:intro')
      } catch {
        // No storage: nothing was kept.
      }
    })
  await page.goto(`${origin}/play/engine-floor?level=${level}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
}

/** Presses Tab until the focused control is named like `name`, and fails after `limit` presses. */
async function tabTo(page: Page, name: RegExp, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    if (name.test(await activeName(page))) return
  }
  throw new Error(`Tab never reached a control named ${name}`)
}

/** Moves the list's focus to the tile of a stage with the arrow keys: down or up as many tiles as lie between. */
async function arrowTo(page: Page, id: string) {
  const here = await page.evaluate((target) => {
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-floor-tray] [data-stage]')]
    return { from: tiles.indexOf(document.activeElement as HTMLElement), to: tiles.findIndex((tile) => tile.dataset.stage === target) }
  }, id)
  if (here.to < 0) throw new Error(`the stage list has no tile for ${id}`)
  if (here.from < 0) throw new Error('focus is not on a tile of the stage list')
  const key = here.to > here.from ? 'ArrowDown' : 'ArrowUp'
  for (let i = 0; i < Math.abs(here.to - here.from); i++) await page.keyboard.press(key)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stage'))).toBe(id)
}

/** The prediction by keyboard: Tab to the number, Enter to pick it, Tab to Commit and Enter. Focus lands on the first tile. */
async function commit(page: Page, n: number) {
  await tabTo(page, new RegExp(`^${n} ${n === 1 ? 'boundary' : 'boundaries'}$`))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: `${n} ${n === 1 ? 'boundary' : 'boundaries'}` })).toHaveAttribute('aria-pressed', 'true')
  await tabTo(page, /^Commit the prediction$/)
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stage') !== null)).toBe(true)
}

/** Lays stages with the keys alone: arrows to the tile, Enter to lay it. */
async function lay(page: Page, ids: readonly string[]) {
  for (const id of ids) {
    await arrowTo(page, id)
    await page.keyboard.press('Enter')
    await expect(stage(page, id)).toHaveCount(0)
  }
}

const reference = (level: string) => buildLevel(level, 0).reference

/** Whether an element's box lies inside the viewport. */
const inViewport = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.height > 0 && box.top >= 0 && box.bottom <= window.innerHeight + 1 && box.left >= 0 && box.right <= window.innerWidth + 1
    })

test.describe('a keyboard-only walk', () => {
  test('completes "nano-vllm": predict, lay every stage with the arrows and Enter, run, and read the result', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'nano')
    // The stage list waits behind the prediction and shows no tile until it is in, and the swimlane draws no column: either would answer it.
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(0)
    await expect(page.getByText('The stage list opens when the prediction is in.')).toBeVisible()
    await expect(page.locator('[data-floor-lanes]')).toHaveAttribute('data-columns', '0')
    await expect(page.locator('[data-floor-no-skip]')).toContainText('No skip here')
    await commit(page, 0)
    await expect(page.locator('[data-floor-lanes]')).toHaveAttribute('data-columns', '2')
    const path = reference('nano')
    await lay(page, path)
    await expect(rows(page)).toHaveCount(path.length)
    await expect(line(page)).toContainText(`Laid stage ${path.length}`)
    await tabTo(page, /^Run the path$/)
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
    await expect(page.getByRole('heading', { level: 3, name: 'Finished (practice)' })).toBeFocused()
    await expect(page.locator('[data-floor-houses]')).toContainText("Two engines' paths, side by side")
    await expect(page.locator('[data-floor-prediction-result]')).toContainText('Your prediction was right.')
    await page.getByRole('button', { name: 'Next level: nano-vllm on two GPUs' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('engine-floor')
    await expect(game(page)).toHaveAttribute('data-level', 'nano-tp')
  })

  test('the keys of the game: R runs, Backspace takes the last stage off, comma undoes, and ? shows them all', async ({ page }) => {
    await open(page, 'nano')
    const path = reference('nano')
    await commit(page, 0)
    await lay(page, path.slice(0, 3))
    await game(page).focus()
    await page.keyboard.press('Backspace')
    await expect(line(page)).toContainText('The path is back to 2 stages')
    await expect(stage(page, path[2])).toHaveCount(1)
    await page.keyboard.press('KeyR')
    await expect(line(page)).toContainText('2 stages held')
    await expect(page.locator('[data-floor-lanes] [data-lane-row][data-state="ran"]')).toHaveCount(2)
    await page.keyboard.press('Comma')
    await expect(page.locator('[data-floor-lanes] [data-lane-row][data-state="ran"]')).toHaveCount(0)
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog')
    await expect(keys).toBeVisible()
    await expect(keys).toContainText('Run the laid path')
    await expect(keys).toContainText('Take the last stage off the path')
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
  })
})

/** Lays one stage with the mouse: its tile is brought to the middle of the screen first and must not be covered; returns the page's scroll before and after the press. */
async function pointerLay(page: Page, id: string) {
  const tile = stage(page, id)
  await tile.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const clear = await tile.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return hit !== null && element.contains(hit)
  })
  expect(clear, `the tile of ${id} is covered before the press`).toBe(true)
  const before = await page.evaluate(() => window.scrollY)
  const box = await tile.boundingBox()
  if (box === null) throw new Error(`the tile of ${id} has no box`)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(stage(page, id)).toHaveCount(0)
  // Any animated scroll that a lay could start is given its time before the page's position is read.
  await page.waitForTimeout(300)
  return { before, after: await page.evaluate(() => window.scrollY) }
}

test.describe('a pointer lay', () => {
  for (const [width, height] of [[1440, 900], [1280, 800]] as const) {
    test.describe(`at ${width} x ${height}`, () => {
      test.use({ viewport: { width, height } })

      test('twenty lays by the mouse leave the page where it was', async ({ page }) => {
        test.setTimeout(180_000)
        await open(page, 'abort')
        await commit(page, 2)
        const path = reference('abort').slice(0, 20)
        expect(path).toHaveLength(20)
        const moves: string[] = []
        for (const [index, id] of path.entries()) {
          const { before, after } = await pointerLay(page, id)
          if (before !== after) moves.push(`lay ${index + 1} (${id}): ${before} to ${after}`)
        }
        expect(moves).toEqual([])
      })
    })
  }
})

test.describe('the swimlane on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('every hop reads its mechanism word, a hop inside one column in its slot at the arrow\'s left, clear of the row numbers', async ({ page }) => {
    await open(page, 'nano')
    await commit(page, 0)
    const path = reference('nano')
    await lay(page, path)
    await expect(rows(page)).toHaveCount(path.length)
    const tags = await page.locator('[data-floor-lanes] [data-lane-row]').evaluateAll((all) =>
      all.map((row) => {
        const word = row.querySelector<HTMLElement>('.es-lanes__tag-word')
        const box = word?.getBoundingClientRect()
        const no = row.querySelector('.es-lanes__no')?.getBoundingClientRect()
        return {
          word: word?.textContent ?? '',
          shown: word !== null && getComputedStyle(word).display !== 'none' && (box?.width ?? 0) > 8,
          clear: box === undefined || no === undefined || box.left >= no.right,
        }
      }),
    )
    expect(tags.filter((tag) => !tag.shown || !tag.clear)).toEqual([])
    expect(tags.map((tag) => tag.word)).toEqual(expect.arrayContaining(['call', 'queue', 'copy', 'launch', 'sync']))
  })
})

test.describe('the swimlane', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a column per process, a row per laid stage with its arrow labelled by mark and word, and fourteen rows in view without scrolling', async ({ page }) => {
    await open(page, 'vllm')
    await commit(page, 2)
    const path = reference('vllm')
    await lay(page, path.slice(0, 14))
    const heads = await page.locator('[data-lane-head] [data-process]').evaluateAll((columns) => columns.map((column) => (column as HTMLElement).dataset.process))
    expect(heads).toEqual(['client', 'api-server', 'engine-core', 'gpu'])
    await expect(rows(page)).toHaveCount(14)
    // Each arrow carries its mechanism's mark and word; none is told apart by colour alone.
    const tags = await page
      .locator('[data-floor-lanes] .es-lanes__tag')
      .evaluateAll((all) => all.map((tag) => ({ word: tag.textContent?.trim() ?? '', glyph: tag.querySelector('[data-handoff]')?.getAttribute('data-handoff') ?? null })))
    expect(tags.every((tag) => tag.word.length > 1 && tag.glyph !== null)).toBe(true)
    expect(tags.slice(0, 5).map((tag) => tag.word)).toEqual(['IPC', 'call', 'call', 'IPC', 'queue'])
    // Fourteen rows fit: the box does not scroll, and every row is inside it.
    const box = await page.locator('[data-lanes-scroll]').evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight, bottom: element.getBoundingClientRect().bottom }))
    expect(box.scroll).toBeLessThanOrEqual(box.client + 1)
    const last = await rows(page)
      .last()
      .evaluate((row) => row.getBoundingClientRect().bottom)
    expect(last).toBeLessThanOrEqual(box.bottom + 1)
    // The dock's list, its run control and the readout are on the same screen.
    expect(await inViewport(page, '[data-floor-tray] [data-stage]')).toBe(true)
    expect(await inViewport(page, '[data-floor-path] .es-primary-button__pull')).toBe(true)
    expect(await inViewport(page, '[data-floor-readout]')).toBe(true)
  })

  test('a longer path scrolls inside the box and keeps "now" in view', async ({ page }) => {
    await open(page, 'abort')
    await commit(page, 2)
    await lay(page, reference('abort').slice(0, 24))
    const scroller = page.locator('[data-lanes-scroll]')
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const now = await page.locator('[data-lane-now]').evaluate((mark) => mark.getBoundingClientRect().toJSON() as DOMRect)
    const box = await scroller.evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect)
    expect(now.top).toBeGreaterThanOrEqual(box.top)
    expect(now.bottom).toBeLessThanOrEqual(box.bottom)
  })

  test('a row opens its popover on activation: its mechanism, its process and its source once a run has judged it', async ({ page }) => {
    await open(page, 'vllm')
    await commit(page, 2)
    await lay(page, reference('vllm').slice(0, 5))
    const name = page.locator('[data-lane-row="3"] .es-lanes__name')
    await name.focus()
    await page.keyboard.press('Enter')
    const sheet = page.getByRole('dialog', { name: /Stage 4/ })
    await expect(sheet).toContainText('IPC · socket')
    await expect(sheet).toContainText('api-server · handler-task')
    await expect(sheet).toContainText('engine-core · input-thread')
    await expect(sheet.locator('[data-source="later"]')).toContainText('Its source shows once a run has judged it')
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(name).toBeFocused()
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await name.click()
    await expect(page.getByRole('dialog', { name: /Stage 4/ }).getByRole('link')).toHaveAttribute('href', /^https:\/\/github\.com\/vllm-project\/vllm\/blob\//)
  })
})

test.describe('the first run', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("parts, a look that dispatches nothing, the prediction with no skip, then the reference path's first stage pointed at", async ({ page }) => {
    const started = Date.now()
    await open(page, 'nano', { intro: 'fresh' })
    const intro = page.locator('.es-intro')
    await expect(intro).toHaveAttribute('data-intro', 'parts')
    await expect(intro.locator('.es-parts__name')).toHaveText(['The request', 'Processes', 'Stage list', 'A hop', 'Boundaries crossed'])
    await page.locator('[data-intro-next]').click()
    await expect(intro).toHaveAttribute('data-intro', 'look')
    await page.locator('[data-intro-look]').click()
    const look = page.getByRole('dialog', { name: /Stage: LLMEngine.add_request/ })
    await expect(look).toContainText('compute · call')
    await expect(look).toContainText('main · main')
    // The look is a look: nothing is laid, and the prediction is still to be made.
    await expect(rows(page)).toHaveCount(0)
    await expect(page.locator('[data-floor-lanes]')).toHaveAttribute('data-columns', '0')
    await page.keyboard.press('Escape')
    await page.locator('[data-intro-next]').click()
    await expect(intro).toHaveAttribute('data-intro', 'ask')
    await expect(intro).toContainText('cannot be skipped')
    await expect(page.getByRole('button', { name: /Skip the guess/ })).toHaveCount(0)
    await expect(page.locator('[data-floor-no-skip]')).toContainText('No skip here')
    await page.getByRole('button', { name: '0 boundaries' }).click()
    await page.getByRole('button', { name: 'Commit the prediction' }).click()
    await expect(intro).toHaveAttribute('data-intro', 'point')
    const ring = page.locator('.es-floor-ring [data-stage]')
    await expect(ring).toHaveAttribute('data-stage', 'nano.tokenize')
    await ring.click()
    await expect(intro).toHaveCount(0)
    await expect(rows(page)).toHaveCount(1)
    expect(Date.now() - started).toBeLessThan(60_000)
  })
})

test.describe('the stage list', () => {
  test('filters by process and by typed text, by keyboard', async ({ page }) => {
    await open(page, 'vllm')
    await commit(page, 2)
    const all = await page.locator('[data-floor-tray] [data-stage]').count()
    await tabTo(page, /^GPU/)
    await page.keyboard.press('Enter')
    const gpu = await page.locator('[data-floor-tray] [data-stage]').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label') ?? ''))
    expect(gpu.length).toBeGreaterThan(0)
    expect(gpu.length).toBeLessThan(all)
    expect(gpu.every((label) => /From GPU of /.test(label))).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(all)
    await page.locator('[data-floor-filter]').focus()
    await page.keyboard.type('queue')
    const queues = await page.locator('[data-floor-tray] [data-stage]').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label') ?? ''))
    expect(queues.length).toBeGreaterThan(0)
    expect(queues.every((label) => /queue/i.test(label))).toBe(true)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stage') !== null)).toBe(true)
    await page.locator('[data-floor-filter]').fill('no stage has these words')
    await expect(page.getByText('No stage matches.')).toBeVisible()
    await page.getByRole('button', { name: 'Show every stage' }).click()
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(all)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('three tiles, the run control and the readout are in the viewport with the current row', async ({ page }) => {
      await open(page, 'vllm')
      await commit(page, 2)
      await lay(page, reference('vllm').slice(0, 9))
      // At least three tiles are whole inside the list's box, and the box is inside the viewport.
      const shown = await page.locator('ul[data-floor-tray]').evaluate((list) => {
        const box = list.getBoundingClientRect()
        const whole = [...list.querySelectorAll('[data-stage]')].filter((tile) => {
          const at = tile.getBoundingClientRect()
          return at.top >= box.top - 1 && at.bottom <= box.bottom + 1
        })
        return { whole: whole.length, top: box.top, bottom: box.bottom }
      })
      expect(shown.whole).toBeGreaterThanOrEqual(3)
      expect(shown.top).toBeGreaterThanOrEqual(0)
      expect(shown.bottom).toBeLessThanOrEqual(844)
      expect(await inViewport(page, '[data-floor-path] .es-primary-button__pull')).toBe(true)
      expect(await inViewport(page, '[data-floor-readout]')).toBe(true)
      // The current row: its node and the start of its name, inside the viewport and inside the swimlane's box.
      const row = await page.locator('[data-lane-row="8"] .es-lanes__name').evaluate((name) => {
        const at = name.getBoundingClientRect()
        const box = (name.closest('[data-lanes-scroll]') as HTMLElement).getBoundingClientRect()
        return { top: at.top >= box.top && at.bottom <= box.bottom && at.bottom <= window.innerHeight, left: at.left >= box.left - 12 && at.left + 48 <= Math.min(box.right, window.innerWidth) }
      })
      expect(row).toEqual({ top: true, left: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    })
  })
})

test.describe('a stopped run', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("marks the row, says the rule in the engine's terms, and names the mechanism laid there", async ({ page }) => {
    await open(page, 'vllm')
    const path = reference('vllm')
    await commit(page, 2)
    await lay(page, [path[0], 'vllm.h2d'])
    await game(page).focus()
    await page.keyboard.press('KeyR')
    const row = page.locator('[data-floor-lanes] [data-lane-row="1"]')
    await expect(row).toHaveAttribute('data-state', 'struck')
    await expect(row).toContainText('stopped')
    const stop = page.locator('[data-floor-stop]')
    await expect(stop).toHaveAttribute('data-stop', 'process')
    await expect(stop).toContainText('A change of process needs IPC (ZMQ) or shared memory.')
    await expect(stop.locator('[data-floor-wrong-mechanism]')).toContainText('copy · host to device')
    await page.getByRole('button', { name: 'Take the path back to stage 2' }).click()
    await expect(rows(page)).toHaveCount(1)
    await expect(stop).toHaveCount(0)
  })

  test("a stage that is legal and not the engine's next cites the pinned source of the engine's own", async ({ page }) => {
    await open(page, 'nano')
    const path = reference('nano')
    await commit(page, 0)
    await lay(page, [path[0], path[2]])
    await game(page).focus()
    await page.keyboard.press('KeyR')
    const stop = page.locator('[data-floor-stop]')
    await expect(stop).toHaveAttribute('data-stop', 'path')
    await expect(stop).toContainText('not the stage this engine makes next')
    await stop.getByText('The two stages and their sources').click()
    await expect(stop.locator('[data-cite]').first()).toContainText('nanovllm/engine/scheduler.py')
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, and the game plays: a level is completed and its result read', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'nano')
    await commit(page, 0)
    await lay(page, reference('nano'))
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
  })
})

test.describe('the words', () => {
  test('no banned word on the page, at rest, stopped and at the result', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'abort')
    const scan = async (label: string) => {
      const text = await game(page).evaluate((element) => {
        const parts = [element.textContent ?? '']
        for (const node of element.querySelectorAll('[aria-label], [title], [alt]')) parts.push(node.getAttribute('aria-label') ?? '', node.getAttribute('title') ?? '', node.getAttribute('alt') ?? '')
        return parts.join(' \n ')
      })
      expect(findBanned(text).map((found) => found.rule), label).toEqual([])
    }
    await scan('at rest')
    await commit(page, 2)
    const path = reference('abort')
    await lay(page, [path[0], 'vllm.h2d'])
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await scan('stopped')
    await page.getByRole('button', { name: 'Take the path back to stage 2' }).click()
    await lay(page, path.slice(1))
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
    await scan('the result')
  })
})

for (const width of [360, 1280]) {
  test.describe(`axe at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('finds no serious or critical violation, at rest, with a stage stopped and its popover open, and at the result', async ({ page }) => {
      test.setTimeout(120_000)
      await open(page, 'nano')
      const audit = async (label: string) => {
        // A sheet that has just opened is fading in: axe reads the colours of what is on screen, so it waits for the end of every animation (R-T48: flaked once in three runs).
        await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))))
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
        expect(results.passes.length + results.violations.length, `${label}: the rules axe ran`).toBeGreaterThan(20)
        const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(blocking.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}`), label).toEqual([])
      }
      await audit('before the prediction')
      await commit(page, 0)
      const path = reference('nano')
      await lay(page, [path[0], path[2]])
      await game(page).focus()
      await page.keyboard.press('KeyR')
      await expect(page.locator('[data-floor-stop]')).toBeVisible()
      await page.locator('[data-lane-row="0"] .es-lanes__name').click()
      await audit('with a stage stopped and a popover open')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Take the path back to stage 2' }).click()
      await lay(page, path.slice(1))
      await game(page).focus()
      await page.keyboard.press('KeyR')
      await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
      await audit('at the result')
    })
  })
}

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played', async ({ page }) => {
    const away: string[] = []
    const refused: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) away.push(url)
    })
    page.on('console', (message) => {
      if (/content security policy|refused to/i.test(message.text())) refused.push(message.text())
    })
    await open(page, 'nano')
    await commit(page, 0)
    await lay(page, reference('nano'))
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(page.getByRole('heading', { level: 3, name: 'Finished (practice)' })).toBeVisible()
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism', () => {
  const actions = (level: string): FloorAction[] => {
    const ids = buildLevel(level, 0).reference
    return [{ t: 'commit', prediction: 3 }, ...ids.slice(0, 5).map((id): FloorAction => ({ t: 'lay', stage: id })), { t: 'run' }, { t: 'move', from: 1, by: 1 }, { t: 'unlay', to: 2 }, { t: 'lay', stage: ids[1] }, { t: 'run' }]
  }

  test('the same seed and the same actions give the same state hash in the browser as under Node', async ({ page }) => {
    test.skip(built, 'the page imports the sources, which only the dev server serves')
    let run = startRun(floorSession, { game: 'engine-floor', level: 'vllm', seed: 0 })
    for (const action of actions('vllm')) run = applyAction(floorSession, run, action)
    const expected = stateHash(run.state)
    await open(page, 'nano')
    const inBrowser = await page.evaluate(`(async () => {
      const play = await import('/packages/play/index.ts')
      const { floorSession } = await import('/packages/play/engine-floor/session.ts')
      let run = play.startRun(floorSession, { game: 'engine-floor', level: 'vllm', seed: 0 })
      for (const action of ${JSON.stringify(actions('vllm'))}) run = play.applyAction(floorSession, run, action)
      return play.stateHash(run.state)
    })()`)
    expect(inBrowser).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{8}$/)
  })
})
