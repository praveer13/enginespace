/*
 * Back of House's graded `map` in a browser (GAMES.md §5; ASSESSMENT §4.3; A§6.2, A§6.8, A§6.9): the walks that need a page, and W1-T19's
 * acceptance checks that need one.
 *
 *   1. A graded run by keyboard alone: start it, write the prediction, lay the whole path with the arrows and Enter, pull the stub once, and
 *      read the debrief: passed, the path against the tape row by row, and the lifecycle trace in the trace viewer. There is no Undo, and the
 *      comma, which undoes in practice, does nothing. The way on is another fresh scenario, which is another seed.
 *   2. A wrong stage ends the run: the stage of the engine's own that belongs to another request is named for what it needs, the level is
 *      over, nothing can be taken back, and the debrief marks the stage where the path parted from the tape with a word and a drawn mark.
 *   3. The path stays a secret until the run is judged: the house is drawn only as far as the route has gone, and the mirror does not say how
 *      long the path is. Once the run is judged the whole house is there.
 *   4. Reduced motion: nothing animates, and the graded run is played to the end.
 *   5. A phone: nothing scrolls sideways before the run, and nothing does in the debrief either, where the table of the check has a region
 *      of its own to scroll in.
 *   6. axe finds nothing serious at 360 and 1280 px, on the graded page at rest and on the debrief with the tape in it.
 *   7. Nothing leaves the origin, the lazy chunk of the viewer included.
 *   8. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10).
 *
 * How it runs. Like e2e/engine-floor.spec.ts, the spec starts the app's own Vite dev server on a free port and drives `/play/engine-floor`.
 * A graded run draws its seed from `crypto.getRandomValues` when it starts, so a test that wants a known scenario hands the page the entropy
 * to draw: the first candidate of `drawInBand` is the entropy itself, and the band accepts it. With ES_E2E_ORIGIN set to the address of
 * `vite preview` it drives the built site instead, and the one test that imports the sources from the dev server is skipped.
 */
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { applyAction, startRun, stateHash } from '../packages/play'
import { buildLevel, scenarioFor } from '../packages/play/engine-floor/levels'
import { floorSession } from '../packages/play/engine-floor/session'
import type { FloorAction } from '../packages/play/engine-floor/types'
import { referencePath } from '../packages/sim/lifecycle'
import type { Scenario } from '../packages/sim/lifecycle'

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

/** The first seed from 0 whose graded scenario is `wanted`'s. A graded run draws its own seed, so this is the entropy to hand the page. */
const entropyFor = (wanted: (sc: Scenario) => boolean): number => {
  const seed = Array.from({ length: 600 }, (_, i) => i).find((candidate) => wanted(scenarioFor(candidate, 'map')))
  if (seed === undefined) throw new Error('no seed draws that scenario')
  return seed
}
/** nano-vllm at two ranks with no prefix hit: a short path (13 stages) in a short tray, and `nano.prefix-hit` is in the tray as a stage of another request. */
const NANO = entropyFor((sc) => sc.engine === 'nano-vllm' && !sc.prefixHit)

const game = (page: Page) => page.locator('section[data-game="engine-floor"]')
const outcome = (page: Page) => page.locator('[data-live="outcome"]')
const line = (page: Page) => page.locator('[data-live="line"]')
const stage = (page: Page, id: string) => page.locator(`[data-floor-tray] [data-stage="${id}"]`)
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement
    return element === null ? '' : (element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName)
  })

/**
 * Opens the graded level in practice, with the page told which entropy to hand the next graded run (or none, for the real thing). The stub
 * answers only for a draw of one uint32, which is what a graded run asks for, and leaves every other request for random bytes alone.
 */
async function open(page: Page, entropy: number | null = null) {
  await page.addInitScript((value) => {
    const real = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      if (value !== null && array instanceof Uint32Array && array.length === 1) {
        array[0] = value
        return array
      }
      return real(array as Uint32Array)
    }) as typeof crypto.getRandomValues
  }, entropy)
  await page.goto(`${origin}/play/engine-floor?level=map`, { waitUntil: 'networkidle' })
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

/** Starts a graded run with the keys alone: Tab to the plate, Enter. Focus comes back to the game. */
async function startGraded(page: Page) {
  await game(page).focus()
  await tabTo(page, /^Start a graded run$/)
  await page.keyboard.press('Enter')
  await expect(game(page).locator('.es-tape').first()).toContainText('graded')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('engine-floor')
}

/** The scenario that the order on the page says the request is. */
const scenarioOnPage = (page: Page): Promise<Scenario> =>
  page.locator('[data-floor-order]').evaluate((order) => ({
    engine: order.getAttribute('data-engine') as Scenario['engine'],
    streaming: order.getAttribute('data-streaming') === 'true',
    tp: Number(order.getAttribute('data-tp')) as 1 | 2,
    abort: order.getAttribute('data-abort') === 'true',
    prefixHit: order.getAttribute('data-prefix-hit') === 'true',
    n: Number(order.getAttribute('data-n')) as 1 | 2,
  }))

/** Moves the tray's focus to the card of a stage with the arrow keys: down or up as many cards as lie between. */
async function arrowTo(page: Page, id: string) {
  const here = await page.evaluate((target) => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-floor-tray] [data-stage]')]
    return { from: cards.indexOf(document.activeElement as HTMLElement), to: cards.findIndex((card) => card.dataset.stage === target) }
  }, id)
  if (here.to < 0) throw new Error(`the tray has no card for ${id}`)
  if (here.from < 0) throw new Error('focus is not on a card of the tray')
  const key = here.to > here.from ? 'ArrowDown' : 'ArrowUp'
  for (let i = 0; i < Math.abs(here.to - here.from); i++) await page.keyboard.press(key)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stage'))).toBe(id)
}

/** The prediction by keyboard: Tab to the plate, Enter to pick it, Tab to the stub and Enter to commit. Focus lands on the first card. */
async function commit(page: Page, n: number) {
  await tabTo(page, new RegExp(`^${n} ${n === 1 ? 'boundary' : 'boundaries'}$`))
  await page.keyboard.press('Enter')
  await tabTo(page, /^Commit the prediction$/)
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stage') !== null)).toBe(true)
}

/** Lays stages with the keys alone: arrows to the card, Enter to lay it. */
async function lay(page: Page, ids: readonly string[]) {
  for (const id of ids) {
    await arrowTo(page, id)
    await page.keyboard.press('Enter')
    await expect(stage(page, id)).toHaveCount(0)
  }
}

const pathOf = (sc: Scenario): string[] => referencePath(sc).map((s) => s.id)

/** The floors the drawing has: one tape for each, in the group that draws them. */
const floorsDrawn = (page: Page) => page.locator('[data-floor-view] svg [data-part="floors"] text').count()

test.describe('a graded run by keyboard alone', () => {
  test('starts on a fresh scenario with no undo, lays the whole path with the arrows, runs it once, and reads the debrief: passed, the path against the tape, and the tape in the viewer', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, NANO)
    // In practice the level has an Undo plate and offers a graded run. A graded run has no plate and no undo.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
    await startGraded(page)
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await expect(page.locator('[data-floor-mode]')).toHaveAttribute('data-floor-mode', 'graded')
    await expect(page.getByText('A graded run: a fresh scenario, no undo and one run.')).toBeVisible()
    const sc = await scenarioOnPage(page)
    expect(sc).toEqual(scenarioFor(NANO, 'map'))
    const ids = pathOf(sc)

    // The tray waits behind the prediction. Once it is written it holds the engine's whole vocabulary, and the path says that it goes once.
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(0)
    await commit(page, 0)
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(buildLevel('map', NANO).tray.length)
    await expect(page.locator('[data-floor-once]')).toContainText('One run.')
    await lay(page, ids)
    await expect(page.locator('[data-floor-path] li[data-state]')).toHaveCount(ids.length)

    // The comma undoes in practice. Here it does nothing.
    await game(page).focus()
    await page.keyboard.press('Comma')
    await expect(page.locator('[data-floor-path] li[data-state]')).toHaveCount(ids.length)

    await tabTo(page, /^Run the path$/)
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await expect(line(page)).toContainText('The ticket is home')
    await expect(page.getByText('The ticket is home. The stages left in the tray are not on this request’s path.')).toBeVisible()
    await page.getByRole('button', { name: 'See the debrief' }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 3, name: 'Every hand-off held.' })).toBeVisible()
    await expect(page.locator('[data-floor-graded]')).toHaveAttribute('data-floor-graded', 'passed')
    await expect(page.locator('[data-floor-graded]')).toContainText('Passed.')
    // The path against the tape: a row for each laid stage, all the tape's, with the ns of the synthetic trace.
    const table = page.locator('[data-floor-tape-table] tbody tr')
    await expect(table).toHaveCount(ids.length)
    await expect(page.locator('[data-floor-tape-table] [data-row-state="matched"]')).toHaveCount(ids.length)
    await expect(page.locator('[data-floor-tape]')).toHaveAttribute('data-whole', 'true')
    // The tape is in the viewer: a lazy chunk, so it arrives after the debrief. It says what it is, and it has no marks ticket.
    const viewer = page.locator('section[data-trace-view]')
    await expect(viewer).toBeVisible({ timeout: 30_000 })
    await expect(viewer).toContainText('A synthetic tape: the lifecycle model’s path for this request')
    await expect(viewer).toHaveAttribute('data-readonly', 'true')
    await expect(viewer.locator('[data-trace-marks]')).toHaveCount(0)
    await expect(viewer.locator('canvas')).toHaveCount(1)
    // Its table lists the stage spans by the stages' own names.
    await expect(viewer.locator('table').first()).toContainText(ids[0])

    // The way on is another fresh scenario: a new graded run, not yet predicted, with focus kept in the game.
    await page.getByRole('button', { name: 'Another fresh scenario' }).first().focus()
    await page.keyboard.press('Enter')
    await expect(game(page).locator('.es-tape').first()).toContainText('graded')
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('engine-floor')
  })

  test('two graded runs in a row are two scenarios: the seed is drawn when each starts, and the whole path of whatever it draws is laid and passed', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page)
    await startGraded(page)
    const first = await page.locator('[data-floor-order]').getAttribute('data-engine')
    const trayOf = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-floor-tray] [data-stage]')].map((card) => card.dataset.stage).join())
    await commit(page, 2)
    const firstTray = await trayOf()
    const sc = await scenarioOnPage(page)
    expect(sc.engine).toBe(first)
    const ids = pathOf(sc)
    await lay(page, ids)
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.locator('[data-floor-graded]')).toHaveAttribute('data-floor-graded', 'passed')
    await expect(page.locator('[data-floor-tape-table] tbody tr')).toHaveCount(ids.length)
    // Another: its tray is another draw.
    await page.getByRole('button', { name: 'Another fresh scenario' }).first().click()
    await commit(page, 2)
    expect(await trayOf()).not.toBe(firstTray)
  })
})

test.describe('a wrong stage ends the run', () => {
  test('a stage of the engine\'s own that belongs to another request is named for what it needs; nothing can be taken back; the debrief marks where the path parted from the tape', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, NANO)
    await startGraded(page)
    const sc = await scenarioOnPage(page)
    const ids = pathOf(sc)
    expect(sc.prefixHit).toBe(false)
    await commit(page, 0)
    // The stage that finds a prefix hit is in the tray, and this request has none.
    await expect(stage(page, 'nano.prefix-hit')).toHaveCount(1)
    await lay(page, [ids[0], ids[1], 'nano.prefix-hit'])
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await expect(line(page)).toContainText('The ticket stopped at stage 3, after 2 stages that held.')
    await expect(line(page)).toContainText('The level is over.')
    const stop = page.locator('[data-floor-stop]')
    await expect(stop).toBeVisible()
    await expect(stop).toHaveAttribute('data-stop', 'path')
    await expect(stop).toContainText('only for a request with a prefix hit. This request has no prefix hit.')
    // The run is the one run: nothing on the page takes the path back, and the keys that did nothing now do nothing.
    await expect(page.getByRole('button', { name: /Take the path back/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Comma')
    await expect(page.locator('[data-floor-path] li[data-state]')).toHaveCount(3)
    await expect(page.getByText('The run is over, and the tray is closed.')).toBeVisible()

    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.getByRole('heading', { level: 3, name: 'A hand-off broke.' })).toBeVisible()
    await expect(page.locator('[data-floor-graded]')).toHaveAttribute('data-floor-graded', 'missed')
    await expect(page.locator('[data-floor-graded]')).toContainText('Not passed.')
    await expect(page.locator('[data-floor-tape]')).toHaveAttribute('data-whole', 'false')
    await expect(page.locator('[data-floor-tape-table] [data-row-state="matched"]')).toHaveCount(2)
    const parted = page.locator('[data-floor-tape-table] tbody tr:has([data-row-state="differs"])')
    await expect(parted).toHaveCount(1)
    // The row says it in words as well as with the drawn mark, and says what the tape has there.
    await expect(parted).toContainText('not the tape’s stage')
    await expect(parted.locator('svg[data-icon="strike"]')).toHaveCount(1)
    await expect(parted).toContainText('Scheduler.schedule')
    await expect(page.locator('[data-floor-first-wrong]')).toContainText('What nano-vllm does there')
  })

  test('a path that held and stopped short is over too, and the debrief says the tape goes on', async ({ page }) => {
    await open(page, NANO)
    await startGraded(page)
    const ids = pathOf(await scenarioOnPage(page))
    await commit(page, 0)
    await lay(page, ids.slice(0, 5))
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await expect(line(page)).toContainText('Every stage held, and the path ends before the request is back where it began. The level is over.')
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.getByRole('heading', { level: 3, name: 'The path stopped short.' })).toBeVisible()
    await expect(page.locator('[data-floor-tape-verdict]')).toContainText('the tape goes on')
    await expect(page.locator('[data-floor-tape-table] [data-row-state="matched"]')).toHaveCount(5)
  })
})

test.describe('the tape', () => {
  test('if the viewer\'s chunk does not load, the debrief still reads, says so, and keeps the table of the check', async ({ page }) => {
    test.setTimeout(120_000)
    // The viewer is a lazy chunk. In the dev server its module is src/trace/TraceView.tsx, and in a build it is a file of its own.
    await page.route(/\/(?:src\/trace\/TraceView\.tsx|assets\/TraceView-[^/]*\.js)(?:\?.*)?$/, (route) => route.abort())
    // In a build, the first chunk that fails to load reloads the page once, to pick up a new deploy (src/main.tsx), and the reload would
    // take the run with it. This is the chunk that is still missing after that one reload, which the flag of the handler stands for.
    await page.addInitScript(() => sessionStorage.setItem('es:preload-reloaded', String(Date.now())))
    await open(page, NANO)
    await startGraded(page)
    const ids = pathOf(await scenarioOnPage(page))
    await commit(page, 0)
    await lay(page, ids)
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.locator('[data-floor-tape-missing]')).toContainText('The tape could not be loaded.')
    await expect(page.locator('[data-floor-tape-table] tbody tr')).toHaveCount(ids.length)
    await expect(page.getByRole('heading', { level: 3, name: 'Every hand-off held.' })).toBeVisible()
    await expect(page.locator('section[data-trace-view]')).toHaveCount(0)
  })
})

test.describe('the path stays a secret until the run is judged', () => {
  // The floors' names are tapes in the group that draws the floors in landscape; a phone's portrait drawing names them upright in the lanes.
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the house is drawn only as far as the route has gone, and the mirror does not say how long the path is; the whole house is there once the run is judged', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, NANO)
    await startGraded(page)
    const ids = pathOf(await scenarioOnPage(page))
    await commit(page, 0)
    // Only the floor the request begins on.
    expect(await floorsDrawn(page)).toBe(1)
    await expect(page.locator('[data-mirror-summary]')).not.toContainText("in the engine's path")
    await lay(page, ids.slice(0, 3))
    expect(await floorsDrawn(page)).toBe(1)
    // The route reaches the worker's floor and then the line: the drawing grows with it.
    const toWorker = ids.indexOf('nano.broadcast') + 1
    await lay(page, ids.slice(3, toWorker))
    expect(await floorsDrawn(page)).toBe(2)
    await lay(page, ids.slice(toWorker))
    await expect(page.locator('[data-mirror-summary]')).toContainText(`${ids.length} stages laid.`)
    await expect(page.locator('[data-mirror-summary]')).not.toContainText("in the engine's path")
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    expect(await floorsDrawn(page)).toBe(3)
    await expect(page.locator('[data-mirror-summary]')).toContainText(`of the ${ids.length} in the engine's path`)
  })

  test('the practice run of the level keeps it too: a pinned scenario, with undo, and no house ahead of the route', async ({ page }) => {
    await open(page)
    await commit(page, 0)
    expect(await floorsDrawn(page)).toBe(1)
    await expect(page.locator('[data-mirror-summary]')).not.toContainText("in the engine's path")
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, and a graded run is played to the end: the debrief is read and the tape is drawn', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, NANO)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await startGraded(page)
    const ids = pathOf(await scenarioOnPage(page))
    await commit(page, 0)
    await lay(page, ids)
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.locator('section[data-trace-view]')).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
  })
})

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('scrolls nowhere sideways, before the run and in the debrief with the tape in it', async ({ page }) => {
    test.setTimeout(120_000)
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    await open(page, NANO)
    await startGraded(page)
    expect(await fits()).toBe(true)
    const ids = pathOf(await scenarioOnPage(page))
    await commit(page, 0)
    await lay(page, ids)
    expect(await fits()).toBe(true)
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.locator('section[data-trace-view]')).toBeVisible({ timeout: 30_000 })
    expect(await fits()).toBe(true)
    // The table of the check scrolls in a region of its own, which a keyboard can reach.
    await expect(page.locator('[data-floor-tape] [role="region"]').first()).toHaveAttribute('tabindex', '0')
  })
})

for (const width of [360, 1280]) {
  test.describe(`axe at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('finds no serious or critical violation on the graded page at rest, and on the debrief with the tape in it', async ({ page }) => {
      test.setTimeout(180_000)
      await open(page, NANO)
      await startGraded(page)
      const audit = async (label: string) => {
        // axe reads the colours of the frame it is called in, so a transition that is still running is read at its first frame. When the
        // debrief opens, the plate of the Play stage goes from ink to quiet over a moment, and its label was read on the ink for as long as
        // the viewer's first paint kept the page from drawing. WCAG judges a page at rest: wait until nothing finite is still moving.
        await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity))
        // axe reads the colour under an element where it is painted, so an element scrolled out of the window is read against whatever is
        // in its place on the screen (here the foot of the page). The audit reads the page from its top, as a reader opens it.
        await page.evaluate(() => window.scrollTo(0, 0))
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
        expect(results.passes.length + results.violations.length, `${label}: the rules axe ran`).toBeGreaterThan(20)
        const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        // A finding names its nodes and what axe measured on the first of them (colours, ratio), so that a contrast failure can be read.
        const said = (v: (typeof blocking)[number]) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')} ${JSON.stringify(v.nodes[0]?.any[0]?.data ?? null)}`
        expect(blocking.map(said), label).toEqual([])
      }
      await audit('a graded run before the prediction')
      const ids = pathOf(await scenarioOnPage(page))
      await commit(page, 0)
      await lay(page, ids.slice(0, 4))
      await audit('a graded run with a path half laid')
      await lay(page, ids.slice(4))
      await game(page).focus()
      await page.keyboard.press('KeyR')
      await page.getByRole('button', { name: 'See the debrief' }).click()
      await expect(page.locator('section[data-trace-view]')).toBeVisible({ timeout: 30_000 })
      await audit('the debrief of a graded run, with the tape')
    })
  })
}

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a graded run is played, and the lazy viewer comes from the site', async ({ page }) => {
    test.setTimeout(120_000)
    const away: string[] = []
    const refused: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) away.push(url)
    })
    page.on('console', (message) => {
      if (/content security policy|refused to/i.test(message.text())) refused.push(message.text())
    })
    await open(page, NANO)
    await startGraded(page)
    const ids = pathOf(await scenarioOnPage(page))
    await commit(page, 0)
    await lay(page, ids)
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.locator('section[data-trace-view]')).toBeVisible({ timeout: 30_000 })
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism', () => {
  const actions = (seed: number): FloorAction[] => {
    const level = buildLevel('map', seed)
    return [{ t: 'commit', prediction: 3 }, ...level.reference.map((id): FloorAction => ({ t: 'lay', stage: id })), { t: 'run' }]
  }

  test('the same seed and the same actions give the same state hash in the browser as under Node', async ({ page }) => {
    test.skip(built, 'the page imports the sources, which only the dev server serves')
    const seed = 12345
    let run = startRun(floorSession, { game: 'engine-floor', level: 'map', seed })
    for (const action of actions(seed)) run = applyAction(floorSession, run, action)
    const expected = stateHash(run.state)
    await open(page)
    // The page imports the same modules from the dev server and runs the same actions. The script is a string, so that nothing in
    // Playwright's transform of this file touches the imports.
    const inBrowser = await page.evaluate(`(async () => {
      const play = await import('/packages/play/index.ts')
      const { floorSession } = await import('/packages/play/engine-floor/session.ts')
      let run = play.startRun(floorSession, { game: 'engine-floor', level: 'map', seed: ${seed} })
      for (const action of ${JSON.stringify(actions(seed))}) run = play.applyAction(floorSession, run, action)
      return play.stateHash(run.state)
    })()`)
    expect(inBrowser).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{8}$/)
  })
})
