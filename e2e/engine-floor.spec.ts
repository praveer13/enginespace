/*
 * Back of House (`engine-floor`) in a browser: the walks that `verify:games` lists for every game and cannot run itself (A§6.2, A§6.8,
 * A§6.9, GAMES.md §2.5), and W1-T17's acceptance checks that need a page.
 *
 *   1. A keyboard-only walk completes a level: the prediction is picked and committed with Tab and Enter, the tray is walked with the arrows
 *      and a stage is laid with Enter, focus follows to the next tile, and the run is sent with Tab and Enter. Then the debrief by keyboard.
 *   2. The game's own keys: `R` runs, Backspace takes the last stage off, `,` undoes, and `?` lists them all.
 *   3. A wrong answer is explained from the stage's source: the rule or the departure, the engine's own stage in that place and the
 *      stage that was laid, each with its file, symbol and line at the pinned commit, and a link to it.
 *   4. Reduced motion: nothing animates, and the game still plays.
 *   5. A phone: the drawing runs down the page, nothing scrolls sideways, and axe finds nothing serious at 360 and 1280 px.
 *   6. Nothing leaves the origin (ARCHITECTURE §1, I1).
 *   7. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10: the nightly job runs this in every
 *      browser the config lists, and the hash it compares is `stateHash`).
 *
 * How it runs. The spec starts the app's own Vite dev server on a free port, so it needs no build and no preview server, and drives
 * `/play/engine-floor` in whichever browser Playwright launches. Run it with `npx playwright test e2e/engine-floor.spec.ts`. With
 * ES_E2E_ORIGIN set to the address of `vite preview` (after `npm run build`) it drives the built site instead, under the meta CSP of
 * ARCHITECTURE §12, and the one test that imports the sources from the dev server is skipped.
 */
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { applyAction, startRun, stateHash } from '../packages/play'
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
const line = (page: Page) => page.locator('[data-live="line"]')
const stage = (page: Page, id: string) => page.locator(`[data-floor-tray] [data-stage="${id}"]`)
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement
    return element === null ? '' : (element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName)
  })

async function open(page: Page, level: string) {
  await page.goto(`${origin}/play/engine-floor?level=${level}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
}

/** Presses Tab until the focused control is named like `name`, and fails after `limit` presses. */
async function tabTo(page: Page, name: RegExp, limit = 40) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    if (name.test(await activeName(page))) return
  }
  throw new Error(`Tab never reached a control named ${name}`)
}

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
  await expect(page.getByRole('button', { name: `${n} ${n === 1 ? 'boundary' : 'boundaries'}` })).toHaveAttribute('aria-pressed', 'true')
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

const reference = (level: string) => buildLevel(level, 0).reference

test.describe('a keyboard-only walk', () => {
  test('completes "nano-vllm": predict, lay every stage with the arrows and Enter, run, and read the debrief', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'nano')
    // The tray waits behind the prediction, and shows no card until it is written down: their places would answer it.
    await expect(page.locator('[data-floor-tray] [data-stage]')).toHaveCount(0)
    await expect(page.getByText('The tray opens when the prediction is written down.')).toBeVisible()
    await expect(page.locator('[data-floor-prompt]')).toHaveCount(0)
    // nano-vllm is an offline library: the ticket crosses no process boundary on its way back.
    await commit(page, 0)
    await expect(page.locator('[data-prediction]')).toContainText('your prediction')
    await expect(page.locator('[data-floor-prompt]')).toContainText('offline library')
    const path = reference('nano')
    await lay(page, path)
    await expect(page.locator('[data-floor-path] li[data-state]')).toHaveCount(path.length)
    await expect(line(page)).toContainText(`Laid stage ${path.length}`)
    // Tab to the stub and pull it.
    await tabTo(page, /^Run the path$/)
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await expect(line(page)).toContainText('The ticket is home')
    await page.getByRole('button', { name: 'See the debrief' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 3, name: 'Every hand-off held.' })).toBeVisible()
    await expect(page.locator('[data-floor-houses]')).toContainText('Two houses, side by side')
    await expect(page.locator('[data-floor-prediction-result]')).toContainText('It was right')
    // The way on: the next level, with focus kept in the game.
    await expect(page.locator('[data-floor-next]')).toContainText('Next level: nano-vllm on two GPUs')
    await page.getByRole('button', { name: 'Next level' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('engine-floor')
    await expect(page.locator('[data-game="engine-floor"] .es-tape').first()).toContainText('nano-vllm on two GPUs · practice')
  })

  test('the keys of the game: R runs, Backspace takes the last stage off, comma undoes, and ? shows them all', async ({ page }) => {
    await open(page, 'nano')
    const path = reference('nano')
    await commit(page, 0)
    await lay(page, path.slice(0, 3))
    await game(page).focus()
    // Backspace takes the last stage off the path, and the stage goes back to the tray.
    await page.keyboard.press('Backspace')
    await expect(line(page)).toContainText('The path is back to 2 stages')
    await expect(stage(page, path[2])).toHaveCount(1)
    // R runs what is laid: two stages, both of which hold.
    await page.keyboard.press('KeyR')
    await expect(line(page)).toContainText('2 stages held')
    await expect(page.locator('[data-floor-path] li[data-state="ran"]')).toHaveCount(2)
    // The comma takes the run back: the log is replayed without it.
    await page.keyboard.press('Comma')
    await expect(line(page)).toContainText('Undid the last move.')
    await expect(page.locator('[data-floor-path] li[data-state="ran"]')).toHaveCount(0)
    // `?` lists every key, the common ones and the game's own, and Escape gives focus back to the game.
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog')
    await expect(keys).toBeVisible()
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', 'C', 'V', '?', 'R', 'Backspace'])
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('engine-floor')
  })

  test('the prediction is committed once and before anything is laid: a card laid by the key without it does nothing', async ({ page }) => {
    await open(page, 'nano')
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await page.keyboard.press('Backspace')
    await expect(page.locator('[data-floor-path] [data-empty]')).toBeVisible()
    await expect(page.getByText('The tray opens when the prediction is written down.')).toBeVisible()
  })
})

test.describe('a wrong answer is explained from the stage\'s source', () => {
  test('a stage that is legal and not the engine\'s next names where it comes in the path, and the engine\'s own stage with its file', async ({ page }) => {
    await open(page, 'nano')
    const path = reference('nano')
    await commit(page, 0)
    // Skip the scheduler's queue: nano-vllm's `schedule` comes after `waiting`.
    await lay(page, [path[0], path[2]])
    await page.keyboard.press('KeyR')
    const stop = page.locator('[data-floor-stop]')
    await expect(stop).toBeVisible()
    await expect(stop).toHaveAttribute('data-stop', 'path')
    await expect(stop).toContainText('comes later in the path')
    // The engine's own stage in that place, cited to its file at the commit the course pins.
    const own = stop.locator('[data-cite]').first()
    await expect(own).toContainText('What nano-vllm does here')
    await expect(own).toContainText('nanovllm/engine/scheduler.py')
    await expect(own).toContainText('Scheduler.add')
    await expect(own.getByRole('link', { name: /nanovllm\/engine\/scheduler\.py/ })).toHaveAttribute(
      'href',
      /^https:\/\/github\.com\/GeeeekExplorer\/nano-vllm\/blob\/bb823b3e06983d71485a8e1f23715ebd87d98ef8\/nanovllm\/engine\/scheduler\.py#L\d+$/,
    )
    await expect(own).toContainText('self.waiting.append(seq)')
    // The struck stage is marked in the path and in the mirror, with a word and not only a colour.
    await expect(page.locator('[data-floor-path] li[data-state="struck"]')).toHaveCount(1)
    await expect(page.locator('[data-mirror]')).toContainText('stopped the ticket')
    // The way back: the path is taken back to where the ticket stopped, and focus goes to the tray.
    await page.getByRole('button', { name: 'Take the path back to where it stopped' }).click()
    await expect(page.locator('[data-floor-path] li[data-state]')).toHaveCount(1)
    await expect(stop).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stage') !== null)).toBe(true)
  })

  test('a stage that starts where the ticket is not names the rule it breaks', async ({ page }) => {
    await open(page, 'vllm')
    const path = reference('vllm')
    await commit(page, 2)
    // The request is at the API server, and the engine core's `h2d` starts in a process it has not reached: it needs a window first.
    const h2d = path.find((id) => id === 'vllm.h2d')
    expect(h2d).toBeDefined()
    await lay(page, [path[0], 'vllm.h2d'])
    await page.keyboard.press('KeyR')
    const stop = page.locator('[data-floor-stop]')
    await expect(stop).toHaveAttribute('data-stop', 'process')
    await expect(stop).toContainText('A change of process needs IPC (ZMQ) or shared memory.')
    await expect(stop).toContainText('vllm/v1/worker/gpu/model_runner.py')
    await expect(stop.locator('[data-cite]').nth(1)).toContainText('What was laid')
  })
})

test.describe('motion', () => {
  test('a run inks the stops it got through one after another, in the printer\'s steps, and then everything is at rest', async ({ page }) => {
    await open(page, 'nano')
    await commit(page, 0)
    await lay(page, reference('nano').slice(0, 4))
    await game(page).focus()
    await page.keyboard.press('KeyR')
    // Four stops are new: each is a group in the route and a group among the stops, and each is animated in with a delay of its own.
    await expect(page.locator('.es-floor-ink')).toHaveCount(8)
    const delays = await page.locator('.es-floor-ink').evaluateAll((groups) => groups.map((group) => (group as SVGElement).style.animationDelay))
    expect(new Set(delays).size).toBe(4)
    expect(await page.evaluate(() => document.getAnimations().length)).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length), { timeout: 15_000 }).toBe(0)
    // The next run does not ink what was inked before: only the stops it adds.
    await page.locator('[data-floor-tray] [data-stage]').first().focus()
    await lay(page, reference('nano').slice(4, 6))
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(page.locator('.es-floor-ink')).toHaveCount(4)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, and the game plays: a level is completed and its debrief read', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'nano')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await commit(page, 0)
    await lay(page, reference('nano'))
    await game(page).focus()
    await page.keyboard.press('KeyR')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    // Transitions and animations are 1 ms or none at all: none is still running.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-ticket__sheet') as Element).transitionDuration)).toMatch(/^0(?:\.001)?s/)
  })
})

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('draws the house down the page, scrolls nowhere sideways, and reaches the tray and the stub', async ({ page }) => {
    await open(page, 'abort')
    await expect(page.locator('[data-floor-view]')).toHaveAttribute('data-orientation', 'portrait')
    const viewBox = await page.locator('[data-floor-view] svg').evaluate((svg) => svg.getAttribute('viewBox'))
    expect(viewBox).toMatch(/^0 0 360 /)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await commit(page, 2)
    await lay(page, reference('abort').slice(0, 2))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'Run the path' })).toBeVisible()
  })
})

for (const width of [360, 1280]) {
  test.describe(`axe at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('finds no serious or critical violation, at rest and with a stage stopped', async ({ page }) => {
      test.setTimeout(120_000)
      await open(page, 'nano')
      const audit = async (label: string) => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
        expect(results.passes.length + results.violations.length, `${label}: the rules axe ran`).toBeGreaterThan(20)
        const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
        expect(blocking.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' ; ')}`), label).toEqual([])
      }
      await audit('before the prediction')
      await commit(page, 0)
      const path = reference('nano')
      await lay(page, [path[0], path[2]])
      await page.keyboard.press('KeyR')
      await expect(page.locator('[data-floor-stop]')).toBeVisible()
      await audit('with a stage stopped')
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
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(page.getByRole('heading', { level: 3, name: 'Every hand-off held.' })).toBeVisible()
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism', () => {
  const actions = (level: string): FloorAction[] => {
    const path = buildLevel(level, 0).reference
    return [{ t: 'commit', prediction: 3 }, ...path.slice(0, 5).map((id): FloorAction => ({ t: 'lay', stage: id })), { t: 'run' }, { t: 'move', from: 1, by: 1 }, { t: 'unlay', to: 2 }, { t: 'lay', stage: path[1] }, { t: 'run' }]
  }

  test('the same seed and the same actions give the same state hash in the browser as under Node', async ({ page }) => {
    test.skip(built, 'the page imports the sources, which only the dev server serves')
    let run = startRun(floorSession, { game: 'engine-floor', level: 'vllm', seed: 0 })
    for (const action of actions('vllm')) run = applyAction(floorSession, run, action)
    const expected = stateHash(run.state)
    await open(page, 'nano')
    // The page imports the same modules from the dev server and runs the same actions. The script is a string, so that nothing in
    // Playwright's transform of this file touches the imports.
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
