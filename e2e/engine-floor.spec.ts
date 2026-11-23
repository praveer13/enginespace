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
import { controlNamed } from './support/tab-target'

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
  // The control is waited for before the first key: a walk that starts before it is in the page goes past where it will be.
  await controlNamed(page, name)
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

/*
 * A lay by the mouse leaves the page where it stands (the fourth final check's finding, and what the first fix left open). A stage laid
 * takes its row out of the list, and the page with it: where the page stood within a row of its foot, the browser pulled it up to the new
 * foot and the list slid down under the pointer, so that the tile above the one laid came under it. And a click that laid the first stage
 * under the pinned filters brought the next one 200 px clear of the screen's top. Each place a learner clicks from is laid twenty times.
 */
type Where = 'middle' | 'under the filters' | 'at the foot'

/** The pinned filters' foot and the top of what stands pinned at the screen's foot (Run the path, the readout), in the viewport. */
const pinnedBand = (page: Page) =>
  page.evaluate(() => {
    const filters = document.querySelector('[data-floor-stages] .es-floor-filters')?.getBoundingClientRect()
    const actions = document.querySelector('[data-floor-path]')?.getBoundingClientRect()
    return { top: filters?.bottom ?? 0, bottom: Math.min(actions?.top ?? window.innerHeight, window.innerHeight) }
  })

/** Waits until the page's scroll has stood still for ten frames, so that a scroll a lay started is over before the page is read. */
const settled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let last = window.scrollY
        let still = 0
        const tick = () => {
          still = window.scrollY === last ? still + 1 : 0
          last = window.scrollY
          if (still >= 10) resolve(last)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )

/**
 * Brings a stage's tile to where a learner clicks it from: the screen's middle, 6 px under the filters' foot, or the page's foot. The list
 * is a box of its own under the filters, so "under the filters" is the top of what the box shows: the box, not the page, is scrolled there.
 */
async function place(page: Page, id: string, where: Where) {
  const tile = stage(page, id)
  if (where === 'middle') await tile.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  else if (where === 'at the foot') {
    // The list keeps each laid row's room, so after many lays at the foot its last tile can stand above the screen: the learner scrolls up to it.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await tile.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
  }
  else
    for (let i = 0; i < 2; i++) {
      const { top } = await pinnedBand(page)
      await tile.evaluate((element, at) => {
        const list = element.closest('ul')
        const by = element.getBoundingClientRect().top - at
        if (list !== null && getComputedStyle(list).overflowY !== 'visible') {
          list.scrollBy(0, by)
          element.scrollIntoView({ block: 'nearest' })
        } else window.scrollBy(0, by)
      }, top + 6)
    }
  await settled(page)
}

/** Lays one stage with the mouse from `where`; the tile must be clear of every pinned part. Returns the page's scroll before and after the press. */
async function pointerLay(page: Page, id: string, where: Where) {
  await place(page, id, where)
  const tile = stage(page, id)
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
  return { before, after: await settled(page) }
}

/** The stages laid from each place: the level's own path, or at the page's foot the list's last tile, which is the one there under the pointer. */
async function nextAt(page: Page, where: Where, index: number) {
  if (where !== 'at the foot') return reference('abort')[index]
  return page.locator('[data-floor-tray] [data-stage]').last().getAttribute('data-stage')
}

test.describe('a pointer lay', () => {
  for (const [width, height] of [[1440, 900], [1280, 800]] as const) {
    test.describe(`at ${width} x ${height}`, () => {
      test.use({ viewport: { width, height } })

      for (const where of ['middle', 'under the filters', 'at the foot'] as const) {
        test(`twenty lays by the mouse, the tile ${where === 'middle' ? 'at the screen’s middle' : where === 'at the foot' ? 'at the page’s foot' : '6 px under the pinned filters'}, leave the page where it was`, async ({ page }) => {
          await open(page, 'abort')
          await commit(page, 2)
          const moves: string[] = []
          for (let index = 0; index < 20; index++) {
            const id = await nextAt(page, where, index)
            if (id === null || id === undefined) throw new Error(`no stage to lay at lay ${index + 1}`)
            const { before, after } = await pointerLay(page, id, where)
            if (before !== after) moves.push(`lay ${index + 1} (${id}): ${before} to ${after}`)
          }
          expect(moves).toEqual([])
          await expect(rows(page)).toHaveCount(20)
        })
      }

      test('twenty lays by the keys: each next tile takes focus in view, clear of the pinned filters and of Run the path', async ({ page }) => {
        await open(page, 'abort')
        await commit(page, 2)
        const covered: string[] = []
        for (const [index, id] of reference('abort').slice(0, 20).entries()) {
          // Every other lay starts from the page's foot, where the list keeps the laid row's room.
          if (index % 2 === 1) await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
          await lay(page, [id])
          await settled(page)
          const band = await pinnedBand(page)
          const seen = await page.evaluate(({ top, bottom }) => {
            const element = document.activeElement
            if (!(element instanceof HTMLElement) || element.dataset.stage === undefined) return 'focus is not on a tile'
            const box = element.getBoundingClientRect()
            if (box.top < top - 0.5 || box.bottom > bottom + 0.5) return `${element.dataset.stage} at ${Math.round(box.top)} to ${Math.round(box.bottom)}`
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            return hit !== null && element.contains(hit) ? '' : `${element.dataset.stage} is covered`
          }, band)
          if (seen !== '') covered.push(`lay ${index + 1}: ${seen}`)
        }
        expect(covered).toEqual([])
      })
    })
  }
})

/*
 * The stage list's neighbours stay put whatever level is laid from: a lay that takes the last stage of a process takes its filter chip,
 * and the pinned bar once got a row shorter, so that the tile after the laid one came 40 px away from where the pointer was. And on a phone
 * the list is its own scroll box, which must keep its place under the pointer.
 */
test.describe('a pointer lay on levels whose chips vanish', () => {
  for (const [width, height] of [[1440, 900], [1280, 800]] as const) {
    for (const level of ['sglang', 'nano-tp'] as const) {
      test(`at ${width} x ${height}, on ${level}, the tile after the laid one takes its place`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await open(page, level)
        await commit(page, 2)
        const moves: string[] = []
        for (let index = 0; index < 20; index++) {
          const picked = await page.evaluate(() => {
            const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-floor-tray] [data-stage]'))
            if (tiles.length < 2) return null
            const at = Math.min(Math.floor(tiles.length / 2), tiles.length - 2)
            tiles[at].scrollIntoView({ block: 'center' })
            return { id: tiles[at].dataset.stage ?? '', next: tiles[at + 1].dataset.stage ?? '' }
          })
          if (picked === null) break
          await settled(page)
          const { id, next } = picked
          const top = async (what: string) => stage(page, what).evaluate((element) => element.getBoundingClientRect().top)
          const at = await top(id)
          const scroll = await page.evaluate(() => window.scrollY)
          const bar = () => page.evaluate(() => { const e = document.querySelector<HTMLElement>('[data-floor-stages] .es-floor-filters'); return `${e?.getBoundingClientRect().height}/${e?.style.minHeight}` })
          const barBefore = await bar()
          const box = await stage(page, id).boundingBox()
          if (box === null) throw new Error(`the tile of ${id} has no box`)
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
          await expect(stage(page, id)).toHaveCount(0)
          await settled(page)
          const now = await top(next)
          const scrolled = await page.evaluate(() => window.scrollY)
          if (Math.abs(now - at) > 1 || scrolled !== scroll) moves.push(`lay ${index + 1} (${id}): next tile ${Math.round(now - at)} px, scroll ${scroll} to ${scrolled}, filters ${barBefore} to ${await bar()}`)
        }
        expect(moves).toEqual([])
      })
    }
  }

  test('at 390 x 844 the list, its own scroll box, keeps its place under the pointer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, 'abort')
    await commit(page, 2)
    const moves: string[] = []
    for (let index = 0; index < 20; index++) {
      const id = reference('abort')[index]
      const list = page.locator('[data-floor-tray]')
      await stage(page, id).evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await settled(page)
      const before = await list.evaluate((element) => element.scrollTop)
      const box = await stage(page, id).boundingBox()
      if (box === null) throw new Error(`the tile of ${id} has no box`)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await expect(stage(page, id)).toHaveCount(0)
      await settled(page)
      // A list that has become too short to stand where it did can only stand at its new foot: that is the one move allowed.
      const { after, foot } = await list.evaluate((element) => ({ after: element.scrollTop, foot: element.scrollHeight - element.clientHeight }))
      if (Math.min(before, foot) !== after) moves.push(`lay ${index + 1} (${id}): list scrollTop ${before} to ${after} (foot ${foot})`)
    }
    expect(moves).toEqual([])
  })
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

test.describe('after the first run\'s commit', () => {
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
    [390, 844],
  ] as const) {
    for (const level of ['nano', 'mini', 'vllm', 'map']) {
      test(`at ${width} x ${height}, "${level}": focus is on the stage the intro points at, in the list's box and uncovered, and Enter lays it`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await open(page, level, { intro: 'fresh' })
        const intro = page.locator('.es-intro')
        for (let guard = 0; guard < 12 && (await intro.getAttribute('data-intro')) !== 'ask'; guard++) await page.locator('[data-intro-next]').click()
        await page.getByRole('button', { name: '0 boundaries' }).click()
        await page.getByRole('button', { name: 'Commit the prediction' }).click()
        await expect(intro).toHaveAttribute('data-intro', 'point')
        // A level whose intro points at no stage has no ring: focus then stands on the list's first stage.
        const ring = page.locator('.es-floor-ring [data-stage]')
        const ringed = (await ring.count()) > 0 ? await ring.getAttribute('data-stage') : await page.locator('[data-floor-tray] [data-stage]').first().getAttribute('data-stage')
        await page.waitForTimeout(2_500)
        const seen = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          const list = document.querySelector('[data-floor-tray]')
          if (el === null || list === null) return null
          const box = el.getBoundingClientRect()
          const within = list.getBoundingClientRect()
          const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          return {
            stage: el.getAttribute('data-stage'),
            inList: box.top >= within.top - 1 && box.bottom <= within.bottom + 1,
            inView: box.top >= 0 && box.bottom <= window.innerHeight,
            uncovered: top !== null && el.contains(top),
          }
        })
        expect(seen).toEqual({ stage: ringed, inList: true, inView: true, uncovered: true })
        await page.keyboard.press('Enter')
        await expect(page.locator(`[data-floor-tray] [data-stage="${ringed}"]`)).toHaveCount(0)
        await expect(rows(page)).toHaveCount(1)
      })
    }
  }
})

/*
 * The filter field leaves the page where it stands (the fourth final check's note: at 1280 x 620 a click in the field moved the page by 11 px
 * on mini and 39 px on map). The field once stood in a bar pinned over a list read with the page, and the page's foot carried the bar away
 * on a short screen. The list is now a box of its own under a field that is never pinned: a click, a letter and Backspace leave the page,
 * the field, the list's top edge and Run the path where they stood.
 */
test.describe('the filter field', () => {
  for (const [width, height] of [[1280, 620], [1366, 768], [1440, 900], [1280, 800], [1920, 1080], [1024, 768]] as const) {
    for (const level of ['mini', 'map']) {
      test(`a click in the field, a letter and Backspace leave the page where it stood: ${level} at ${width} x ${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await open(page, level)
        await commit(page, 2)
        await lay(page, reference(level).slice(0, 1))
        const field = page.locator('[data-floor-filter]')
        await field.evaluate((element) => element.scrollIntoView({ block: 'center' }))
        const stood = await settled(page)
        const parts = () =>
          page.evaluate(() =>
            ['[data-floor-filter]', 'ul[data-floor-tray]', '[data-floor-path]'].map((selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().top ?? NaN)),
          )
        const where = await parts()
        const box = await field.boundingBox()
        if (box === null) throw new Error('the filter field has no box')
        expect(box.y, 'the field is in the screen before the click').toBeGreaterThanOrEqual(0)
        expect(box.y + box.height, 'the field is in the screen before the click').toBeLessThanOrEqual(height)
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await expect(field).toBeFocused()
        expect(await settled(page), 'a click in the field').toBe(stood)
        await page.keyboard.press('s')
        await settled(page)
        await page.keyboard.press('Backspace')
        expect(await settled(page), 'a letter typed and Backspace').toBe(stood)
        expect(await parts(), 'the field, the list\'s top edge and Run the path').toEqual(where)
      })
    }
  }
})

test.describe('the filter controls by keyboard on a short desk', () => {
  test('no focused chip or field is covered by the dock at 1280 x 620 on the map', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 })
    await open(page, 'map')
    await commit(page, 2)
    await lay(page, reference('map').slice(0, 1))
    await page.locator('[data-floor-tray] [data-stage]').first().focus()
    const covered: string[] = []
    for (let step = 0; step < 140; step += 1) {
      await page.keyboard.press(step < 70 ? 'Tab' : 'Shift+Tab')
      await settled(page)
      const bad = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (el === null || el.closest('.es-floor-filters') === null) return ''
        const at = el.getBoundingClientRect()
        // The control's whole box and its 3 px focus ring must be clear: test the top and the foot edge, not only the centre.
        const covers = [at.top + 1, at.bottom - 1, at.bottom + 3].some((y) => {
          const hit = document.elementFromPoint(at.left + at.width / 2, y)
          return hit !== null && !(hit === el || el.contains(hit)) && hit.closest('.es-floor-actions') !== null
        })
        return covers ? `${el.textContent ?? ''} at ${Math.round(at.top)}` : ''
      })
      if (bad !== '') covered.push(bad)
    }
    expect(covered.join('; '), 'a focused filter control under the dock').toBe('')
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

/*
 * What the last check of the wave found by playing (five faults, each measured at the sizes and levels below).
 *   1. At a desk, stage after stage laid from the page's foot left the band between the pinned filters and Run the path empty, with a score
 *      of stages left above it: the list kept every laid row's room, and nothing gave it back while the page stood at its foot.
 *   2. On a phone the list is its own box: a stage laid with the box at its foot shortened the box, the box was pulled up to its new foot,
 *      and the tile above the one laid came under the finger.
 *   3. On a short desk the filters flow, and a tile whose top stood at the screen's top edge was laid: the browser kept the tile above in
 *      place by moving the page 48 px, and that tile came under the pointer.
 *   4. On a phone the chips share a row with the field and scroll sideways in it: a chip took focus out of sight or under the field.
 *   5. On a phone a stopped run's note is taller than the dock's room, and was brought into view by its foot: its head was cut.
 */

/** The tiles whole in the band between the pinned filters and Run the path, top to bottom. */
const inBand = (page: Page) =>
  page.evaluate(() => {
    const filters = document.querySelector('[data-floor-stages] .es-floor-filters')?.getBoundingClientRect()
    const actions = document.querySelector('[data-floor-path]')?.getBoundingClientRect()
    const top = filters?.bottom ?? 0
    const bottom = Math.min(actions?.top ?? window.innerHeight, window.innerHeight)
    return [...document.querySelectorAll<HTMLElement>('[data-floor-tray] [data-stage]')]
      .map((tile) => ({ id: tile.dataset.stage ?? '', box: tile.getBoundingClientRect() }))
      .filter(({ box }) => box.top >= top - 0.5 && box.bottom <= bottom + 0.5)
      .map(({ id, box }) => ({ id, x: box.left + box.width / 2, y: box.top + box.height / 2 }))
  })

/** Waits until the page, the list's box and the dock's box have stood still for ten frames: a snap or a scroll a press started is over. */
const boxStill = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const read = () => [window.scrollY, document.querySelector('[data-floor-tray]')?.scrollTop ?? 0, document.querySelector('.es-frame__dock-main')?.scrollTop ?? 0].join()
        let last = read()
        let still = 0
        const tick = () => {
          const now = read()
          still = now === last ? still + 1 : 0
          last = now
          if (still >= 10) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )

/** The stage whose tile stands under a point, or what does if no tile does. */
const under = (page: Page, x: number, y: number) =>
  page.evaluate(([px, py]) => {
    const hit = document.elementFromPoint(px, py)
    const tile = hit?.closest<HTMLElement>('[data-stage]')
    return tile?.dataset.stage ?? (hit === null ? 'nothing' : `${hit.tagName.toLowerCase()}.${hit.className}`)
  }, [x, y] as const)

test.describe('the final check of wave 1a', () => {
  for (const [width, height, level] of [[1280, 800, 'abort'], [1440, 900, 'map'], [1366, 768, 'nano']] as const) {
    test(`at ${width} x ${height} on ${level}, lays from the page's foot leave tiles in view between the filters and Run the path, or say the stages are above`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, level)
      await commit(page, 2)
      const faults: string[] = []
      const left = () => page.locator('[data-floor-tray] [data-stage]').count()
      /** Lays the lowest tile in the band with the mouse, and checks that nothing came under the pointer. Returns false when the band is empty. */
      const layLowest = async (label: string) => {
        const shown = await inBand(page)
        const lowest = shown.at(-1)
        if (lowest === undefined) return false
        await page.mouse.move(lowest.x, lowest.y, { steps: 4 })
        await page.mouse.down()
        await page.mouse.up()
        await expect(stage(page, lowest.id)).toHaveCount(0)
        await settled(page)
        const above = shown.at(-2)?.id
        if (above !== undefined && (await under(page, lowest.x, lowest.y)) === above) faults.push(`${label}: the tile above (${above}) came under the pointer`)
        return true
      }
      // The finding's steps: wheel to the page's foot over the list, and lay the lowest tile in view, again and again.
      for (let index = 0; index < 6; index++) {
        const band = await pinnedBand(page)
        await page.mouse.move(width * 0.75, (band.top + band.bottom) / 2, { steps: 4 })
        await page.mouse.wheel(0, 4000)
        await settled(page)
        const shown = (await inBand(page)).length
        if (shown < Math.min(3, await left())) faults.push(`before lay ${index + 1}: ${shown} tiles in view, ${await left()} stages left`)
        await layLowest(`lay ${index + 1}`)
      }
      expect(faults, 'the wheel to the page\'s foot, then a lay').toEqual([])
      // Without the wheel, the band empties tile by tile under a still page, and then says the stages are above it.
      let emptied = false
      for (let index = 0; index < 10 && !emptied; index++) emptied = !(await layLowest(`still lay ${index + 1}`))
      expect(emptied, 'the band emptied').toBe(true)
      const cue = await page.evaluate(() => {
        const list = document.querySelector('ul[data-floor-tray]')
        return list === null ? '' : getComputedStyle(list, '::after').content
      })
      expect(cue, 'the list says the stages are above').toContain('More above')
      // One notch of the wheel up brings the stages back into the band.
      await page.mouse.wheel(0, -100)
      await settled(page)
      const back = (await inBand(page)).length
      if (back < Math.min(3, await left())) faults.push(`after one notch up: ${back} tiles in view, ${await left()} stages left`)
      expect(faults).toEqual([])
    })
  }

  for (const [width, height] of [[390, 844], [360, 800]] as const) {
    test(`at ${width} x ${height}, a tile laid with the list's box at its foot leaves the box where it stood`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, 'abort')
      await commit(page, 2)
      const moves: string[] = []
      const list = page.locator('ul[data-floor-tray]')
      /** The lowest tile whole in the box, the tile above it, and the box's scroll. */
      const lowest = () =>
        list.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const whole = [...element.querySelectorAll<HTMLElement>('[data-stage]')].filter((tile) => {
            const at = tile.getBoundingClientRect()
            return at.top >= box.top - 1 && at.bottom <= box.bottom + 1
          })
          const tile = whole.at(-1)
          if (tile === undefined) return null
          const at = tile.getBoundingClientRect()
          return { id: tile.dataset.stage ?? '', above: whole.at(-2)?.dataset.stage ?? null, x: at.left + at.width / 2, y: at.top + at.height / 2, top: element.scrollTop }
        })
      await list.evaluate((element) => element.scrollTo(0, element.scrollHeight))
      for (let index = 0; index < 10; index++) {
        await boxStill(page)
        let picked = await lowest()
        // The box has kept the room of the rows laid from its foot, and says the stages are above: the learner scrolls it up to them.
        for (let swipe = 0; picked === null && swipe < 6; swipe++) {
          const box = await list.boundingBox()
          if (box === null) throw new Error('the list has no box')
          await expect(list).toHaveAttribute('data-kept', '')
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.wheel(0, -60)
          await boxStill(page)
          picked = await lowest()
        }
        if (picked === null) throw new Error(`no tile in the box before lay ${index + 1}`)
        await page.mouse.click(picked.x, picked.y)
        await expect(stage(page, picked.id)).toHaveCount(0)
        await boxStill(page)
        const top = await list.evaluate((element) => element.scrollTop)
        const now = await under(page, picked.x, picked.y)
        if (top !== picked.top || (picked.above !== null && now === picked.above)) moves.push(`lay ${index + 1} (${picked.id}): scrollTop ${picked.top} to ${top}, ${now} under the finger`)
      }
      expect(moves).toEqual([])
      await expect(rows(page)).toHaveCount(10)
    })
  }

  test('at 1280 x 620, a tile laid with its top at the screen\'s top edge leaves the page where it stood', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 })
    await open(page, 'nano')
    await commit(page, 0)
    const moves: string[] = []
    for (const offset of [-30, -20, -10, 0, 2]) {
      const tiles = page.locator('[data-floor-tray] [data-stage]')
      const count = await tiles.count()
      if (count < 3) break
      const target = tiles.nth(Math.floor(count / 2))
      const id = await target.getAttribute('data-stage')
      // The edge that cuts the tile: the screen's top where the list is read with the page, the top of the list's box where it is a box of its own.
      const edge = () =>
        target.evaluate((element) => {
          const list = element.closest('ul')
          return list !== null && getComputedStyle(list).overflowY !== 'visible' ? list.getBoundingClientRect().top + list.clientTop : 0
        })
      for (let i = 0; i < 2; i++)
        await target.evaluate((element, at) => {
          const list = element.closest('ul')
          const by = element.getBoundingClientRect().top - at
          if (list !== null && getComputedStyle(list).overflowY !== 'visible') list.scrollBy(0, by)
          else window.scrollBy(0, by)
        }, (await edge()) + offset)
      const before = await settled(page)
      const top = await edge()
      const kept = await page.locator('ul[data-floor-tray]').evaluate((list) => list.scrollTop)
      const box = await target.evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect)
      const x = box.left + box.width / 2
      const y = Math.max(box.top, top) + (box.bottom - Math.max(box.top, top)) / 2
      expect(await under(page, x, y), `the tile at ${offset} px is under the pointer`).toBe(id)
      await page.mouse.click(x, y)
      await expect(stage(page, id ?? '')).toHaveCount(0)
      const after = await settled(page)
      await boxStill(page)
      const scrolled = await page.locator('ul[data-floor-tray]').evaluate((list) => list.scrollTop)
      if (after !== before || scrolled !== kept) moves.push(`${id} at ${offset} px: the page ${before} to ${after}, the list ${kept} to ${scrolled}, ${await under(page, x, y)} under the pointer`)
    }
    expect(moves).toEqual([])
  })

  for (const level of ['nano', 'vllm', 'map']) {
    test(`at 390 x 844 on ${level}, each filter chip that takes focus stands in view, clear of the field`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await open(page, level)
      await commit(page, 2)
      await lay(page, reference(level).slice(0, 3))
      const hidden: string[] = []
      const check = async (how: string) => {
        const bad = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (el === null || el.closest('.es-floor-chips') === null) return ''
          const at = el.getBoundingClientRect()
          const row = (el.closest('.es-floor-chips') as HTMLElement).getBoundingClientRect()
          const inRow = at.left >= row.left - 0.5 && at.right <= row.right + 0.5 && at.left >= 0 && at.right <= window.innerWidth
          const points = [at.left + 2, at.left + at.width / 2, at.right - 2].map((x) => document.elementFromPoint(x, at.top + at.height / 2))
          const clear = points.every((hit) => hit !== null && (hit === el || el.contains(hit)))
          return inRow && clear ? '' : `${el.textContent ?? ''} at ${Math.round(at.left)} to ${Math.round(at.right)}`
        })
        if (bad !== '') hidden.push(`${how}: ${bad}`)
      }
      for (let step = 0; step < 30; step++) {
        await page.keyboard.press('Shift+Tab')
        await check('Shift+Tab')
        if (await page.evaluate(() => document.activeElement?.hasAttribute('data-floor-filter') === true)) break
      }
      await expect(page.locator('[data-floor-filter]')).toBeFocused()
      for (let step = 0; step < 30; step++) {
        await page.keyboard.press('Tab')
        if (await page.evaluate(() => document.activeElement?.closest('.es-floor-chips') === null)) break
        await check('Tab')
      }
      expect(hidden).toEqual([])
    })
  }

  for (const [width, height, level] of [[390, 844, 'vllm'], [360, 800, 'nano'], [390, 844, 'nano'], [360, 800, 'vllm']] as const) {
    test(`at ${width} x ${height} on ${level}, a stopped run's note comes into view by its head`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, level)
      await commit(page, 2)
      const path = reference(level)
      await lay(page, [path[0], level === 'vllm' ? 'vllm.h2d' : path[2]])
      await page.getByRole('button', { name: 'Run the path' }).click()
      const stop = page.locator('[data-floor-stop]')
      await expect(stop).toBeVisible()
      await boxStill(page)
      const head = await stop.locator('.es-floor-stop__head').evaluate((element) => {
        const at = element.getBoundingClientRect()
        const hit = document.elementFromPoint(at.left + 30, at.top + 3)
        return { top: Math.round(at.top), inHead: hit !== null && element.contains(hit), what: hit === null ? 'nothing' : `${hit.tagName.toLowerCase()}.${hit.className}` }
      })
      expect(head.inHead, `the head's first line at ${head.top} px: ${head.what} stands there`).toBe(true)
    })
  }
})

/*
 * The layout that makes the final check's faults impossible (wave 1b): the stage list is a box of its own, the field and the chips over it
 * keep their height, the actions stand at the dock's foot, and at a desk the drawing and the dock fill one screen. Each test below failed on
 * the layout before it, where the list was read with the page under a pinned bar.
 *   6. A chip row that went was held as a hole, and the first letter typed dropped the bar and the list 128 px.
 *   7. A letter typed with the list at its foot moved the field, the list and Run the path, up to 300 px after a clear.
 *   8. On a phone the pinned dock moved 12 to 26 px as the drawing grew and as the readout's changes came and went.
 *   9. On a phone Run the path stood half under the dock's "More below".
 *  10. On a phone Remove last jumped 244 px after a stopped run, when the stop's note left the dock.
 *  11. During the first run's guess at 1280 x 800, Commit lay below the dock's fold.
 *  12. The last lay of a list moved the page 31 px.
 *  Rough: at 360 and 320 px a chip that took focus was cut by the field or the screen's edge; at 360 px the readout's words ran together.
 */

/** Where the parts that must not move stand: the page's scroll, the field, the chips, the list's top edge and Run the path. */
const standing = (page: Page) =>
  page.evaluate(() => {
    const top = (selector: string) => Math.round(document.querySelector(selector)?.getBoundingClientRect().top ?? NaN)
    return { page: window.scrollY, field: top('[data-floor-filter]'), chips: top('.es-floor-chips'), list: top('ul[data-floor-tray]'), run: top('[data-floor-path] .es-primary-button__pull') }
  })

/** The tiles whole in the list's box and clear of anything over them, top to bottom. */
const shownInBox = (page: Page) =>
  page.locator('ul[data-floor-tray]').evaluate((list) => {
    const box = list.getBoundingClientRect()
    return [...list.querySelectorAll<HTMLElement>('[data-stage]')]
      .map((tile) => ({ id: tile.dataset.stage ?? '', at: tile.getBoundingClientRect() }))
      .filter(({ at }) => at.top >= Math.max(box.top, 0) - 0.5 && at.bottom <= Math.min(box.bottom, window.innerHeight) + 0.5)
      .filter(({ id, at }) => document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2)?.closest('[data-stage]')?.getAttribute('data-stage') === id)
      .map(({ id, at }) => ({ id, x: at.left + at.width / 2, y: at.top + at.height / 2 }))
  })

test.describe('the stage list in a box of its own', () => {
  for (const [width, height, level] of [[1440, 900, 'sglang'], [1280, 620, 'nano-tp'], [390, 844, 'sglang']] as const) {
    test(`at ${width} x ${height} on ${level}, lays from the box's foot and middle move neither the page nor the field, the chips, the list's edge or Run the path`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, level)
      await commit(page, 2)
      await page.locator('ul[data-floor-tray]').evaluate((list) => list.scrollTo(0, list.scrollHeight))
      await boxStill(page)
      const faults: string[] = []
      for (let index = 0; index < 14; index++) {
        const shown = await shownInBox(page)
        if (shown.length === 0) {
          // The box has kept the room of the rows laid at its foot: the learner wheels it up to the stages above.
          const box = await page.locator('ul[data-floor-tray]').boundingBox()
          if (box === null) throw new Error('the list has no box')
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await page.mouse.wheel(0, -100)
          await boxStill(page)
          continue
        }
        const pick = index % 2 === 0 ? shown.at(-1) : shown[Math.floor((shown.length - 1) / 2)]
        if (pick === undefined) break
        const above = shown[shown.findIndex((tile) => tile.id === pick.id) - 1]?.id
        const before = await standing(page)
        await page.mouse.click(pick.x, pick.y)
        await expect(stage(page, pick.id)).toHaveCount(0)
        await boxStill(page)
        const after = await standing(page)
        if (JSON.stringify(after) !== JSON.stringify(before)) faults.push(`lay ${index + 1} (${pick.id}): ${JSON.stringify(before)} to ${JSON.stringify(after)}`)
        if (above !== undefined && (await under(page, pick.x, pick.y)) === above) faults.push(`lay ${index + 1}: the tile above (${above}) came under the pointer`)
      }
      expect(faults).toEqual([])
    })
  }

  for (const [width, height] of [[1440, 900], [1366, 768], [1280, 620], [390, 844]] as const) {
    test(`at ${width} x ${height}, letters typed in the field, Backspace and a clear move neither the page, the field, the list's edge nor Run the path`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, 'mini')
      await commit(page, 2)
      await lay(page, reference('mini').slice(0, 1))
      // The learner has read the list to its last stage, then goes to the field.
      await page.locator('[data-floor-tray] [data-stage]').last().scrollIntoViewIfNeeded()
      await settled(page)
      const field = page.locator('[data-floor-filter]')
      const box = await field.boundingBox()
      if (box === null) throw new Error('the filter field has no box')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await settled(page)
      const before = await standing(page)
      const moves: string[] = []
      for (const key of ['q', 'u', 'e', 'Backspace', 'Backspace', 'Backspace', 'z', 'z', 'Control+a', 'Backspace']) {
        await page.keyboard.press(key)
        await settled(page)
        const now = await standing(page)
        // The chips may go and come back as the words match fewer stages: the field, the list and Run the path stand still.
        const kept = ({ page: scroll, field: input, list, run }: typeof now) => JSON.stringify({ scroll, input, list, run })
        if (kept(now) !== kept(before)) moves.push(`${key}: ${JSON.stringify(before)} to ${JSON.stringify(now)}`)
      }
      expect(moves).toEqual([])
    })
  }

  test('at 1440 x 900, the last lay of the list leaves the page where it stood', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'nano-tp')
    await commit(page, 2)
    const moves: string[] = []
    for (let index = 0; index < 40; index++) {
      const shown = await shownInBox(page)
      const pick = shown[0]
      if (pick === undefined) break
      const before = await page.evaluate(() => window.scrollY)
      await page.mouse.click(pick.x, pick.y)
      await expect(stage(page, pick.id)).toHaveCount(0)
      const after = await settled(page)
      if (after !== before) moves.push(`lay ${index + 1} (${pick.id}): ${before} to ${after}`)
    }
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(0)
    expect(moves).toEqual([])
  })

  test('at 1280 x 800, the first run\'s guess, its six numbers and Commit stand whole in view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page, 'vllm', { intro: 'fresh' })
    const intro = page.locator('.es-intro')
    for (let guard = 0; guard < 12 && (await intro.getAttribute('data-intro')) !== 'ask'; guard++) await page.locator('[data-intro-next]').click()
    await boxStill(page)
    const hidden = await page.locator('.es-floor-predict').evaluate((section) => {
      const parts = [section.querySelector('h3'), ...section.querySelectorAll('[role="group"] button'), section.querySelector('.es-floor-predict__commit button')]
      return parts.flatMap((part) => {
        if (!(part instanceof HTMLElement)) return ['a part is missing']
        const at = part.getBoundingClientRect()
        const clear = [at.top + 2, at.bottom - 2].every((y) => {
          const hit = document.elementFromPoint(at.left + at.width / 2, y)
          return hit !== null && (hit === part || part.contains(hit))
        })
        return at.top >= 0 && at.bottom <= window.innerHeight && clear ? [] : [`${part.textContent?.trim() ?? ''} at ${Math.round(at.top)} to ${Math.round(at.bottom)}`]
      })
    })
    expect(hidden).toEqual([])
  })

  for (const [width, height, level] of [[390, 844, 'vllm'], [360, 800, 'nano'], [1280, 800, 'vllm']] as const) {
    test(`at ${width} x ${height} on ${level}, Run the path is whole and uncovered, and Remove last stands where it stood after a stopped run`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, level)
      await commit(page, 2)
      const path = reference(level)
      const whole = (selector: string) =>
        page.locator(selector).first().evaluate((element) => {
          const at = element.getBoundingClientRect()
          const points = [[at.left + 3, at.top + 3], [at.right - 3, at.top + 3], [at.left + 3, at.bottom - 3], [at.right - 3, at.bottom - 3]]
          const clear = points.every(([x, y]) => {
            const hit = document.elementFromPoint(x, y)
            return hit !== null && (hit === element || element.contains(hit))
          })
          return at.top >= 0 && at.bottom <= window.innerHeight && clear ? '' : `${Math.round(at.top)} to ${Math.round(at.bottom)}`
        })
      expect(await whole('[data-floor-path] .es-primary-button__pull'), 'Run the path after the commit').toBe('')
      await lay(page, [path[0], level === 'vllm' ? 'vllm.h2d' : path[2]])
      expect(await whole('[data-floor-path] .es-primary-button__pull'), 'Run the path after two lays').toBe('')
      await page.getByRole('button', { name: 'Run the path' }).click()
      await expect(page.locator('[data-floor-stop]')).toBeVisible()
      await boxStill(page)
      const remove = page.getByRole('button', { name: 'Remove last' })
      const before = await remove.boundingBox()
      await remove.click()
      await expect(page.locator('[data-floor-stop]')).toHaveCount(0)
      await boxStill(page)
      const after = await remove.boundingBox()
      expect(after?.y, 'Remove last after the press').toBe(before?.y)
    })
  }

  for (const [width, height] of [[390, 844], [360, 800]] as const) {
    test(`at ${width} x ${height}, the pinned dock stands still as the drawing grows and the readout's changes come and go`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, 'vllm')
      await commit(page, 2)
      const run = page.locator('[data-floor-path] .es-primary-button__pull')
      const at = async () => Math.round(((await run.boundingBox())?.y ?? NaN) * 10) / 10
      const first = await at()
      const moves: string[] = []
      for (const [index, id] of reference('vllm').slice(0, 12).entries()) {
        await lay(page, [id])
        const now = await at()
        // The change beside a count stands for a second and goes.
        await page.waitForTimeout(1_200)
        const later = await at()
        if (now !== first || later !== first) moves.push(`lay ${index + 1}: ${first} to ${now}, then ${later}`)
      }
      expect(moves).toEqual([])
    })
  }

  for (const [width, height] of [[360, 800], [320, 640]] as const) {
    test(`at ${width} x ${height}, every filter chip that takes focus stands whole in view`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, 'map')
      await commit(page, 2)
      await page.locator('[data-floor-filter]').focus()
      const hidden: string[] = []
      for (let step = 0; step < 20; step++) {
        await page.keyboard.press('Tab')
        const bad = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (el === null || el.closest('.es-floor-chips') === null) return null
          const at = el.getBoundingClientRect()
          const clear = [at.left + 2, at.left + at.width / 2, at.right - 2].every((x) => {
            const hit = document.elementFromPoint(x, at.top + at.height / 2)
            return hit !== null && (hit === el || el.contains(hit))
          })
          return at.left >= 0 && at.right <= window.innerWidth && clear ? '' : `${el.textContent ?? ''} at ${Math.round(at.left)} to ${Math.round(at.right)}`
        })
        if (bad === null) break
        if (bad !== '') hidden.push(bad)
      }
      expect(hidden).toEqual([])
    })
  }

  test('at 360 x 800, with a run stopped, no word of the readout runs into the next count', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await open(page, 'vllm')
    await commit(page, 2)
    await lay(page, [reference('vllm')[0], 'vllm.h2d'])
    await page.getByRole('button', { name: 'Run the path' }).click()
    await expect(page.locator('[data-floor-stop]')).toBeVisible()
    const overlaps = await page.locator('[data-floor-readout]').evaluate((strip) => {
      const parts = [...strip.querySelectorAll<HTMLElement>('.es-floor-strip__label, .es-floor-strip__value, .es-floor-strip__stamp')].map((part) => ({
        name: `${part.closest('[data-readout-id]')?.getAttribute('data-readout-id') ?? 'stamp'} ${part.className}`,
        cell: part.closest('[data-readout-id]'),
        at: part.getBoundingClientRect(),
      }))
      const found: string[] = []
      for (const a of parts)
        for (const b of parts)
          if (a !== b && a.cell !== b.cell && a.at.left < b.at.right - 0.5 && b.at.left < a.at.right - 0.5 && a.at.top < b.at.bottom - 0.5 && b.at.top < a.at.bottom - 0.5) found.push(`${a.name} over ${b.name}`)
      return found
    })
    expect(overlaps).toEqual([])
  })
})

/*
 * The check of the box layout (W2b-T59): Commit the prediction brings the frame whole into view at a desk, so a stage's tile can stand where
 * Commit stood. A double click on Commit, or a second click there before the pointer moves, laid that stage. A double click on a tile laid
 * the next tile too, which slides into the laid one's place. With every stage laid, the empty list said a filter hid stages.
 */

/** How many stages the list still holds. */
const inList = (page: Page) => page.locator('[data-floor-tray] [data-stage]').count()

/** Picks one boundary and returns the centre of Commit the prediction, in view. */
async function aimAtCommit(page: Page) {
  await page.getByRole('button', { name: '1 boundary', exact: true }).click()
  const button = page.getByRole('button', { name: 'Commit the prediction' })
  await button.scrollIntoViewIfNeeded()
  const box = await button.boundingBox()
  if (box === null) throw new Error('Commit the prediction has no box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.describe('a press the learner did not aim at a stage', () => {
  for (const [width, height, level] of [[1440, 900, 'vllm'], [1366, 768, 'map'], [1280, 800, 'nano'], [360, 800, 'vllm']] as const) {
    test(`at ${width} x ${height} on ${level}, a double click on Commit the prediction commits it and lays no stage`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, level)
      const at = await aimAtCommit(page)
      await page.mouse.dblclick(at.x, at.y)
      await expect(page.locator('[data-floor-tray] [data-stage]').first()).toBeVisible()
      await boxStill(page)
      const tiles = await inList(page)
      expect(tiles, 'every stage is still in the list').toBe(buildLevel(level, 0).tray.length)
      await expect(rows(page)).toHaveCount(0)
    })
  }

  for (const gap of [0, 150, 300]) {
    test(`at 1440 x 900, two clicks ${gap} ms apart on Commit's point, with the pointer still, lay no stage`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, 'vllm')
      const at = await aimAtCommit(page)
      await page.mouse.click(at.x, at.y)
      await page.waitForTimeout(gap)
      await page.mouse.click(at.x, at.y)
      await expect(page.locator('[data-floor-tray] [data-stage]').first()).toBeVisible()
      await boxStill(page)
      await expect(rows(page)).toHaveCount(0)
    })
  }

  test('at 1440 x 900, after the commit, a stage under the pointer lays once the pointer has moved to it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'vllm')
    const at = await aimAtCommit(page)
    await page.mouse.click(at.x, at.y)
    await expect(page.locator('[data-floor-tray] [data-stage]').first()).toBeVisible()
    await boxStill(page)
    const [first] = await shownInBox(page)
    if (first === undefined) throw new Error('no tile in view after the commit')
    await page.mouse.move(first.x, first.y, { steps: 4 })
    await page.mouse.click(first.x, first.y)
    await expect(stage(page, first.id)).toHaveCount(0)
    await expect(rows(page)).toHaveCount(1)
  })

  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    test(`at ${width} x ${height}, a double click on a tile lays that stage and not the one that takes its place`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, 'vllm')
      await commit(page, 2)
      await boxStill(page)
      const shown = await shownInBox(page)
      const pick = shown[0]
      if (pick === undefined) throw new Error('no tile in view')
      await page.mouse.move(pick.x, pick.y, { steps: 4 })
      await page.mouse.dblclick(pick.x, pick.y)
      await expect(stage(page, pick.id)).toHaveCount(0)
      await boxStill(page)
      await expect(rows(page)).toHaveCount(1)
    })
  }

  test('at 1440 x 900, with every stage laid, the empty list says so and offers no filter to clear', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'nano-tp')
    await commit(page, 2)
    for (let index = 0; index < 40 && (await inList(page)) > 0; index++) {
      await page.locator('[data-floor-tray] [data-stage]').first().focus()
      await page.keyboard.press('Enter')
    }
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(0)
    await expect(page.getByText('Every stage is laid.')).toBeVisible()
    await expect(page.getByText('No stage matches.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Show every stage' })).toHaveCount(0)
  })
})
