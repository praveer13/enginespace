/*
 * Service (`loop`) in a browser: the walks that `verify:games` lists for every game and cannot run itself (A§6.2, A§6.8, A§6.9, GAMES.md §2.5).
 *
 *   1. A keyboard-only walk plays all four levels to their debriefs: the tickets are reached by Tab, hung with Enter, focus follows to
 *      the next ticket and then to the bell, `.` rings the bell, `O` flips overlap, Space toggles Auto, `,` undoes, `?` opens the keys
 *      and Escape gives focus back, and "Next" moves on with focus kept in the game.
 *   2. Reduced motion: nothing animates, Auto is off until it is asked for, and the game still plays.
 *   3. Nothing leaves the origin (ARCHITECTURE §1, I1).
 *   4. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10: the nightly job runs this in
 *      every browser the config lists, and the hash it compares is `stateHash`).
 *   5. The picture is the pure drawing: the 2D view's first frame, in the page, is the SVG that packages/play/loop/layout.ts draws
 *      through Service's own shot, the same code that scripts/posters.ts writes the front page's posters with.
 *
 * How it runs. The spec starts the app's own Vite dev server on a free port, so it needs no build and no preview server, and drives
 * `/play/loop` in whichever browser Playwright launches. Run it with `npx playwright test e2e/loop.spec.ts`.
 *
 * Under the policy. The dev server leaves out the meta CSP of ARCHITECTURE §12, which every built document carries. With ES_E2E_ORIGIN
 * set to the address of `vite preview` (after `npm run build`), the spec drives the built site instead, and the origin test also fails
 * on any message of the browser that a policy refused something. The one test that imports the sources from the dev server is skipped.
 */
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { applyAction, startRun, stateHash } from '../packages/play'
import { frameSvg, layoutFrame, PASS_LENS } from '../packages/play/loop/layout'
import { loopInit, loopLevel, loopSession, loopView } from '../packages/play/loop/session'
import { svgMarkup } from '../packages/play/loop/svg'
import type { LoopAction } from '../packages/play/loop/types'

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
  // A dev server transforms the module graph of a page on the first request for it, and on a machine that other work shares that takes
  // longer than any one wait of a test should have to cover. So the graph is transformed here, where there are two minutes to do it.
  await Promise.all(['/src/main.tsx', '/src/pages/Game.tsx', '/src/games/loop/Game.tsx'].map((entry) => server?.warmupRequest(entry)))
}, 120_000)

base.afterAll(async () => {
  await server?.close()
})

const test = base

/**
 * How long a page may take to be ready on a machine that other work shares. The dev server serves a page's modules as it is asked for
 * them, and the page asks the browser what it can draw before the main thread is free again (src/scene/tiers.ts opens a WebGL context),
 * which a software renderer takes seconds to answer when the machine is busy [measured 2026-11-04 at c80dfad on the Settings page, which
 * asks the same: 5 to 8.5 s on a host at a load average of 12 to 20]. With ten workers on twenty threads (a load average of 65, W0-report
 * §2) the 10 s that Playwright gives an assertion were not always enough for the game to appear (W0-report §4.3). A wait that comes after
 * a load is for the page's state, and it is given this long to arrive: it returns the moment the state is there, and a page that is
 * really broken still fails, a little later.
 */
const BOOT = 45_000

const bell = (page: Page) => page.getByRole('button', { name: /Ring the bell/ })
const debriefButton = (page: Page) => page.getByRole('button', { name: 'See the debrief' })
const enabledTickets = (page: Page) => page.locator('[data-loop-controls] ul button:not([disabled])')
const game = (page: Page) => page.locator('section[data-game="loop"]')
const outcome = (page: Page) => page.locator('[data-live="outcome"]')
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement
    return element === null ? '' : (element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName)
  })

/**
 * Opens a level and waits for the page's state, not for the network to be quiet (a quiet network is a time, half a second of it, and a
 * dev server under load has longer pauses than that between one module and the next): the game is drawn, and the faces are in.
 */
async function open(page: Page, level: string) {
  await page.goto(`${origin}/play/loop?level=${level}`, { waitUntil: 'domcontentloaded' })
  await expect(game(page)).toBeVisible({ timeout: BOOT })
  await page.evaluate(() => document.fonts.ready)
}

/** Presses Tab until the focused control is named like `name`, and fails after `limit` presses. */
async function tabTo(page: Page, name: RegExp, limit = 30) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    if (name.test(await activeName(page))) return
  }
  throw new Error(`Tab never reached a control named ${name}`)
}

/** Plays a level to the end with the keys alone: Enter on a ticket hangs it, and Enter on the bell rings it. */
async function playToTheEnd(page: Page) {
  for (let turn = 0; turn < 300; turn++) {
    if ((await debriefButton(page).count()) > 0) return
    const tickets = enabledTickets(page)
    if ((await tickets.count()) > 0) {
      await tickets.first().focus()
      await page.keyboard.press('Enter')
    } else {
      await bell(page).focus()
      await page.keyboard.press('Enter')
    }
  }
  throw new Error('the level did not end in 300 turns')
}

test.describe('a keyboard-only walk', () => {
  test('reaches the tickets by Tab, hangs them with Enter, and focus follows to the next ticket and then to the bell', async ({ page }) => {
    await open(page, 'first-1-fill')
    await tabTo(page, /^Hang ticket No\. 01 on the rail$/)
    for (const next of ['02', '03', '04']) {
      await page.keyboard.press('Enter')
      await expect.poll(() => activeName(page)).toBe(`Hang ticket No. ${next} on the rail`)
    }
    await page.keyboard.press('Enter')
    await expect.poll(() => activeName(page)).toBe('Ring the bell: fire the next step')
    // The rail is full, so the waiting tickets are disabled and the page says why.
    await expect(page.getByText('Every clip is hung: ring the bell.')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await expect(page.locator('[data-live="line"]')).toContainText('Fire 1 rung: 4 plates.')
  })

  test('the keys of the game: `.` rings, `,` undoes, `O` flips overlap, Space toggles Auto, and `?` shows them all', async ({ page }) => {
    await open(page, 'first-3-gap')
    await game(page).focus()
    // Overlap is a switch that the key flips, and the live region says so.
    await page.keyboard.press('KeyO')
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-live="line"]')).toContainText('Overlap on')
    await page.keyboard.press('Period')
    await expect(page.locator('[data-live="line"]')).toContainText('Fire 3 rung')
    // The comma takes the move back: the bell has been rung once, and the run is as it was.
    await page.keyboard.press('Comma')
    await expect(page.locator('[data-live="line"]')).toContainText('Undid the last move.')
    await expect(page.locator('[data-loop-controls] .es-bell__count .es-readout__value')).toHaveText('0002')
    // Space starts Auto from the game, and a second Space stops it.
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false')
    // `?` lists every key, the common ones and Service's own, and Escape gives focus back to where the learner pressed it: the
    // game, so its keys work again at once (KeysDialog; the Keys button gets focus back when it opened the list).
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog')
    await expect(keys).toBeVisible()
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', 'C', 'V', '?', 'O'])
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('loop')
  })

  test('a native key wins: Space on the focused Auto button presses the button, once', async ({ page }) => {
    await open(page, 'first-1-fill')
    for (let i = 0; i < 2; i++) {
      await enabledTickets(page).first().focus()
      await page.keyboard.press('Enter')
    }
    await page.getByRole('button', { name: 'Auto' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false')
    // Auto ran one fire, and the level (one fire) is over, so it had nothing more to do.
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
  })

  test('plays all four levels to their debriefs, and Next keeps focus in the game', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'first-1-fill')
    const titles = ['A clip empties', 'Mind the gap', 'Your turn']
    for (const [index, title] of ['Fill the rail', ...titles].entries()) {
      // The shell's tape naming the level and its mode: the 3D scene's tapes are the design system's too, so it is found by its words.
      await expect(page.locator('[data-game="loop"] .es-tape', { hasText: / · (practice|graded)$/ }).first()).toContainText(`${title} · practice`)
      if (index >= 2) await page.getByRole('switch').focus().then(() => page.keyboard.press('Space'))
      await playToTheEnd(page)
      await debriefButton(page).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { level: 3 }).first()).toHaveText(/^(WELL FIRED|FIRE IT AGAIN)\.$/i)
      if (index < 3) {
        await page.getByRole('button', { name: `Next: ${titles[index]}` }).focus()
        await page.keyboard.press('Enter')
        await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('loop')
      }
    }
    // The last debrief is the end card: par against the clock, the night served three ways, and the way on.
    await expect(page.getByText('The same night, served three ways')).toBeVisible()
    await expect(page.getByText('The real engine', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the course map' })).toHaveAttribute('href', '/map')
    await expect(page.getByRole('button', { name: 'New numbers' })).toBeVisible()
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, Auto is off until asked for, and the game plays and pauses at a decision', async ({ page }) => {
    await open(page, 'first-4-par')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false')
    for (let i = 0; i < 4; i++) {
      await enabledTickets(page).first().focus()
      await page.keyboard.press('Enter')
    }
    await game(page).focus()
    await page.keyboard.press('KeyO')
    await bell(page).focus()
    await page.keyboard.press('Enter')
    // The bell's strike and the printer's feed are CSS animations: under reduced motion they are 1 ms long, so none is still running.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-bell__body') as Element).animationDuration)).toBe('0.001s')
    // Auto was not on by itself: the clock has moved once, by the one ring.
    await expect(page.locator('[data-loop-controls] .es-bell__count .es-readout__value')).toHaveText('0001')
    await page.getByRole('button', { name: 'Auto' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-live="line"]')).toContainText('A clip is open and a ticket waits.', { timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played', async ({ page }) => {
    const away: string[] = []
    const refused: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) away.push(url)
    })
    // The browser says in its console that a policy refused a script, a style, a font or a request.
    page.on('console', (message) => {
      if (/content security policy|refused to/i.test(message.text())) refused.push(message.text())
    })
    await open(page, 'first-2-slot')
    await playToTheEnd(page)
    await debriefButton(page).click()
    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible()
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism and the poster', () => {
  const actions: LoopAction[] = [
    { t: 'admit', req: 0 },
    { t: 'admit', req: 1 },
    { t: 'admit', req: 2 },
    { t: 'admit', req: 3 },
    { t: 'lever', name: 'async', value: true },
    { t: 'run', until: 'step' },
    { t: 'run', until: 'step' },
    { t: 'run', until: 'decision' },
    { t: 'admit', req: 4 },
    { t: 'run', until: 'step' },
  ]

  test('the same seed and the same actions give the same state hash in the browser as under Node', async ({ page }) => {
    test.skip(built, 'the page imports the sources, which only the dev server serves')
    let run = startRun(loopSession, { game: 'loop', level: 'first-4-par', seed: 1 })
    for (const action of actions) run = applyAction(loopSession, run, action)
    const expected = stateHash(run.state)
    await open(page, 'first-1-fill')
    // The page imports the same modules from the dev server and runs the same actions. The script is a string, so that nothing in
    // Playwright's transform of this file touches the imports.
    const inBrowser = await page.evaluate(`(async () => {
      const play = await import('/packages/play/index.ts')
      const { loopSession } = await import('/packages/play/loop/session.ts')
      let run = play.startRun(loopSession, { game: 'loop', level: 'first-4-par', seed: 1 })
      for (const action of ${JSON.stringify(actions)}) run = play.applyAction(loopSession, run, action)
      return play.stateHash(run.state)
    })()`)
    expect(inBrowser).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{8}$/)
  })

  test('the 2D view\'s first frame is the pure drawing: the page\'s drawing is the SVG that layout.ts draws through Service\'s shot', async ({ page }) => {
    await open(page, 'first-1-fill')
    // Below 480 px the view draws the portrait shot, and above it the landscape one (GAMES.md §2.3).
    const orientation = (page.viewportSize()?.width ?? 1280) < 480 ? 'portrait' : 'landscape'
    await expect(page.locator('[data-loop-view]')).toHaveAttribute('data-orientation', orientation)
    const drawn = await page.locator('[data-loop-view] svg').evaluate((element) => ({
      label: element.getAttribute('aria-label'),
      marks: element.querySelectorAll('rect, circle, ellipse, line, path, polygon, text').length,
      parts: [...element.querySelectorAll('g[data-part]')].map((g) => g.getAttribute('data-part')),
      fit: element.getAttribute('preserveAspectRatio'),
    }))
    // In landscape the drawing covers its box, as the scene does; on a phone it is fitted to the box's width, so the whole pass is in view.
    expect(drawn.fit).toBe(orientation === 'landscape' ? 'xMidYMid slice' : null)
    const phone = orientation === 'portrait'
    const markup = svgMarkup(frameSvg(layoutFrame(loopView(loopInit(loopLevel('first-1-fill', 1))), { orientation, shot: 'loop', ...(phone ? { lens: PASS_LENS } : {}) }), { cover: !phone }))
    expect(markup).toContain(`aria-label="${drawn.label?.replace(/'/g, '&#x27;')}"`)
    expect(markup.match(/<(rect|circle|ellipse|line|path|polygon|text)[ >]/g)).toHaveLength(drawn.marks)
    expect([...markup.matchAll(/<g data-part="([a-z-]+)">/g)].map((match) => match[1])).toEqual(drawn.parts as string[])
  })
})
