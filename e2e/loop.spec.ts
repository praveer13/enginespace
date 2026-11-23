/*
 * Service (`loop`) in a browser: the walks that `verify:games` lists for every game and cannot run itself (A§6.2, A§6.8, A§6.9, GAMES.md §2.5).
 *
 *   1. A keyboard-only walk plays all four levels to their debriefs: the tickets are reached by Tab, hung with Enter, focus follows to
 *      the next request and then to Step, `.` steps, `O` flips async scheduling, Space toggles Auto, `,` undoes, `?` opens the keys
 *      and Escape gives focus back, and "Next" moves on with focus kept in the game.
 *   2. Reduced motion: nothing animates, Auto is off until it is asked for, and the game still plays.
 *   3. Nothing leaves the origin (ARCHITECTURE §1, I1).
 *   4. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10: the nightly job runs this in
 *      every browser the config lists, and the hash it compares is `stateHash`).
 *   5. The picture is the pure lane layout (R-T17): the timing diagram in the page draws the slabs, the idle boxes and the rows that
 *      packages/play/loop/lanes.ts lays out for the same run, and at 1440 x 900 and 390 x 844 the diagram's now, the current control and
 *      the readout share the viewport, the track scrolling inside its box on a phone with now kept in view.
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
import { initState, step } from '../packages/play/loop/engine'
import { FRAME_DESK, FRAME_PHONE, fitGeometry, laneLayout } from '../packages/play/loop/lanes'
import { buildLevel } from '../packages/play/loop/levels'
import { loopSession, loopView } from '../packages/play/loop/session'
import type { LoopAction } from '../packages/play/loop/types'
import { bannedOn } from './support/copy-scan'
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

/** Step, once it can run: the amber primary button, or (where the intro rings it) the ink one. */
const bell = (page: Page) => page.locator('[data-loop-step] button:not(:disabled)')
/** The result in the dock, once the run is over. */
const result = (page: Page) => page.locator('[data-result] [data-loop-debrief]')
const enabledTickets = (page: Page) => page.locator('.es-lanes__chips button:not([disabled])')
const stepCount = (page: Page) => page.locator('[data-loop-readout] [data-readout-id="step"] dd')
const RESULT = 'The run is over. The result is in the dock.'
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

/**
 * Ends the first run's intro as a keyboard learner does: Skip intro, and Enter. A first visit opens the level with its intro, and on a phone
 * the dock holds the intro alone while it names the parts, so the level's own controls come up once it ends. The frame says an intro is due
 * (`data-intro` on the game) before its strip arrives with its chunk and the ledger's answer: this waits for the strip, or for the frame to
 * say that no intro is due (a level whose parts were all met), so no walk acts on a dock that is about to change under it.
 */
async function endIntro(page: Page) {
  const skip = page.locator('.es-intro [data-intro-skip]')
  await expect.poll(async () => (await skip.count()) > 0 || (await game(page).getAttribute('data-intro')) === null, { timeout: BOOT }).toBe(true)
  if ((await skip.count()) === 0) return
  await skip.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.es-intro')).toHaveCount(0)
}

/** Presses Tab until the focused control is named like `name`, and fails after `limit` presses. */
async function tabTo(page: Page, name: RegExp, limit = 30) {
  // The control is waited for before the first key: a walk that starts before it is in the page goes past where it will be.
  await controlNamed(page, name)
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    if (name.test(await activeName(page))) return
  }
  throw new Error(`Tab never reached a control named ${name}`)
}

/** Plays a level to the end with the keys alone: Enter on a request's chip admits it, and Enter on Step runs a step. */
async function playToTheEnd(page: Page) {
  for (let turn = 0; turn < 300; turn++) {
    // The run is over once the frame says so; its result arrives in the dock with its own chunk.
    if ((await game(page).getAttribute('data-phase')) === 'result') {
      await expect(result(page)).toBeVisible({ timeout: BOOT })
      return
    }
    const tickets = enabledTickets(page)
    if ((await tickets.count()) > 0) {
      await tickets.first().focus()
      await page.keyboard.press('Enter')
    } else if ((await bell(page).count()) > 0) {
      await bell(page).first().focus()
      await page.keyboard.press('Enter')
    } else {
      // Between a step and the frame's word that the run is over: wait for the page to catch up.
      await expect.poll(async () => (await game(page).getAttribute('data-phase')) === 'result' || (await bell(page).count()) > 0).toBe(true)
    }
  }
  throw new Error('the level did not end in 300 turns')
}

test.describe('a keyboard-only walk', () => {
  test('reaches the requests by Tab, admits them with Enter, and focus follows to the next request and then to Step', async ({ page }) => {
    await open(page, 'first-1-fill')
    await endIntro(page)
    await tabTo(page, /^Admit request R1 into a batch slot$/)
    for (const next of ['R2', 'R3', 'R4']) {
      await page.keyboard.press('Enter')
      await expect.poll(() => activeName(page)).toBe(`Admit request ${next} into a batch slot`)
    }
    await page.keyboard.press('Enter')
    await expect.poll(() => activeName(page)).toBe('Step')
    // The batch is full, so the waiting requests are disabled.
    await expect(page.locator('.es-lanes__chips button')).toHaveCount(2)
    await expect(enabledTickets(page)).toHaveCount(0)
    await page.keyboard.press('Enter')
    // The run is over: the outcome region says so, and the result takes the dock.
    await expect(outcome(page)).toHaveText(RESULT)
    // The level's end is in the goal line.
    await expect(page.locator('.es-frame__goal')).toContainText('the level is over')
  })

  test('the keys of the game: `.` steps, `,` undoes, `O` flips async scheduling, Space toggles Auto, and `?` shows them all', async ({ page }) => {
    await open(page, 'first-3-gap')
    await game(page).focus()
    // Async scheduling is a switch that the key flips, and the live region says so.
    await page.keyboard.press('KeyO')
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('[data-live="line"]')).toContainText('Async scheduling on')
    await game(page).focus()
    await page.keyboard.press('Period')
    await expect(page.locator('[data-live="line"]')).toContainText('Step 3 ran')
    // The comma takes the move back: two steps ran before the level opened, and the run is as it was.
    await page.keyboard.press('Comma')
    await expect(stepCount(page)).toHaveText('2')
    // Space starts Auto from the game, and a second Space stops it.
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false')
    // `?` lists every key, the common ones and the loop's own, and Escape gives focus back to the game, so its keys work again at once.
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog')
    await expect(keys).toBeVisible()
    // At the phone's width the 3D view is not offered, so the list has no view or camera key.
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', '?', 'O'])
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
    // Auto ran one step, and the level (one step) is over, so it had nothing more to do.
    await expect(outcome(page)).toHaveText(RESULT)
  })

  test('plays all four levels to their results, and Next keeps focus in the game', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'first-1-fill')
    const titles = ['Refill a slot', 'Close a bubble', 'Both levers']
    for (const [index, title] of ['Fill the batch', ...titles].entries()) {
      await expect(page.locator('[data-game="loop"] .es-level')).toContainText(`Level ${index + 1} of 9 · ${title} · practice`)
      await endIntro(page)
      if (index >= 2) await page.getByRole('switch').focus().then(() => page.keyboard.press('Space'))
      await playToTheEnd(page)
      await expect(result(page)).toBeVisible()
      await expect(page.locator('[data-loop-debrief]').getByRole('heading').first()).toHaveText(/^(PASSED|NOT YET)\.$/i)
      if (index < 3) {
        await page.getByRole('button', { name: `Next: ${titles[index]}` }).focus()
        await page.keyboard.press('Enter')
        await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('loop')
      }
    }
    // The last result is the end card: the reference run against the clock, the same requests served three ways, and the way on.
    await expect(page.getByText('The same requests, served three ways')).toBeVisible()
    await expect(page.getByText('The real engine', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open the course' })).toHaveAttribute('href', '/map')
  })
})

test.describe('the first run (REDESIGN §2.6)', () => {
  test('level 1: the parts first, then the reference run\'s first move with the ring on R1\'s chip, which is a real move', async ({ page }) => {
    await open(page, 'first-1-fill')
    await expect(page.locator('.es-intro[data-intro="parts"]')).toBeVisible()
    await expect(page.locator('.es-intro .es-parts li')).toHaveText([/Waiting queue/, /Batch slots/, /CPU lane/, /GPU lane/, /Step/])
    // No guess on this level: the parts, then the move.
    for (let i = 0; i < 5 && (await page.locator('.es-intro[data-intro="parts"]').count()) > 0; i++) await page.locator('[data-intro-next]').click()
    await expect(page.locator('.es-intro[data-intro="move"]')).toBeVisible()
    await expect(page.locator('.es-lanes__ring [data-req="0"]')).toBeVisible()
    await page.locator('.es-lanes__ring [data-req="0"]').click()
    await expect(page.locator('.es-intro')).toHaveCount(0)
    await expect(page.locator('[data-lane-label="slot-0"] [data-req="0"]')).toHaveText('R1')
  })

  test('level 3: a guess in the view only, whose reveal is the run\'s own numbers; nothing is dispatched for it', async ({ page }) => {
    await open(page, 'first-3-gap')
    await expect(page.locator('[data-loop-opening]')).toHaveText('This run starts at step 3, with 8 tokens already out.')
    // The parts first: on a phone the dock walks them one at a time, and the guess comes up under the strip once they are named.
    await expect(page.locator('.es-intro[data-intro="parts"]')).toBeVisible({ timeout: BOOT })
    for (let i = 0; i < 6 && (await page.locator('.es-intro[data-intro="parts"]').count()) > 0; i++) await page.locator('[data-intro-next]').click()
    const guess = page.locator('[data-loop-guess]')
    await expect(guess).toContainText('Of the next 7 ticks, for how many is the GPU busy?')
    await guess.getByRole('textbox').fill('5')
    await guess.getByRole('button', { name: 'Check my guess' }).click()
    await expect(guess).toContainText('You said 5. The GPU is busy for 4 of the 7 ticks')
    // The guess is no move: Undo has nothing to take back.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, Auto is off until asked for, and the game plays and pauses at a decision', async ({ page }) => {
    await open(page, 'first-4-par')
    await endIntro(page)
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
    // The new step's forward draws across its rows as a CSS animation: under reduced motion it has none, so nothing is running.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-lanes__slab[data-new]') as Element).animationName)).toBe('none')
    // Auto was not on by itself: one step ran, by the one press.
    await expect(stepCount(page)).toHaveText('1')
    await page.getByRole('button', { name: 'Auto' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-live="line"]')).toContainText('A slot is free and a request waits.', { timeout: 15_000 })
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
    await endIntro(page)
    await playToTheEnd(page)
    await expect(result(page)).toBeVisible()
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism and the diagram', () => {
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

  test('the diagram is the pure lane layout: the page draws the slabs, the idle boxes, the dimensions and the rows lanes.ts lays out', async ({ page }) => {
    await open(page, 'first-3-gap')
    await endIntro(page)
    await bell(page).click()
    await expect(page.locator('[data-live="line"]')).toContainText('Step 3 ran')
    const view = loopView(step(initState(buildLevel('first-3-gap', 1))))
    const drawn = await page.locator('[data-loop-view]').evaluate((figure) => ({
      size: figure.getAttribute('data-size'),
      room: figure.clientWidth,
      slabs: [...figure.querySelectorAll('[data-slab]')].map((slab) => slab.getAttribute('data-slab')),
      idle: [...figure.querySelectorAll('[data-lane-idle]')].map((box) => box.getAttribute('data-lane-idle')),
      dims: [...figure.querySelectorAll('[data-lane-dim]')].map((dim) => dim.getAttribute('data-lane-dim')),
      rows: [...figure.querySelectorAll('[data-lane-labels] [data-lane-label]')].map((row) => row.getAttribute('data-lane-label')),
    }))
    const base = drawn.size === 'phone' ? FRAME_PHONE : FRAME_DESK
    const pad = drawn.size === 'phone' ? 8 : 12
    const layout = laneLayout(view, fitGeometry(base, drawn.room - pad * 2))
    expect(drawn.slabs).toEqual(layout.slabs.map((slab) => slab.id))
    expect(drawn.idle).toEqual(layout.idle.map((box) => box.id))
    expect(drawn.dims).toEqual(layout.dims.map((dim) => dim.id))
    expect(drawn.rows).toEqual(layout.rows.map((row) => row.id))
  })
})

/*
 * P5 (REDESIGN §2.1, §3.5): at 1440 x 900 and 390 x 844 the diagram's current region (now), the current control and the readout are in the
 * viewport together without page scroll, at the start of a level and at its result. On a phone the track scrolls sideways inside its box
 * and keeps now in view.
 */
test.describe('action, state and result share one screen', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} x ${height}: now, the current control and the readout are in view, at the start and at the result`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await open(page, 'first-1-fill')
      const inView = (selector: string) =>
        page.locator(selector).first().evaluate((element) => {
          const r = element.getBoundingClientRect()
          return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1
        })
      expect(await page.evaluate(() => scrollY)).toBe(0)
      // The diagram is drawn at a default width for one frame, then at the box's measured width, with now scrolled into view: the check is
      // of the settled picture, which is there once the page has measured its box.
      await expect.poll(() => inView('[data-lane-now] .es-marker__word'), { timeout: BOOT }).toBe(true)
      await expect.poll(() => inView('.es-lanes__chips button'), { timeout: BOOT }).toBe(true)
      await expect.poll(() => inView('[data-loop-readout]'), { timeout: BOOT }).toBe(true)
      // A level of many steps: the track keeps now in its box as the run goes on.
      await open(page, 'first-4-par')
      // The game's frame is in the page before its diagram and its tickets are: the run starts when the first ticket is there to press.
      await expect(enabledTickets(page).first()).toBeVisible({ timeout: BOOT })
      for (let turn = 0; turn < 10; turn++) {
        while ((await enabledTickets(page).count()) > 0) await enabledTickets(page).first().click()
        if ((await bell(page).count()) > 0) await bell(page).click()
      }
      const track = await page.locator('[data-lanes-track]').evaluate((box) => {
        const now = box.querySelector('[data-lane-now] .es-marker__word')!.getBoundingClientRect()
        const edge = box.getBoundingClientRect()
        return { scrolls: box.scrollWidth > box.clientWidth + 1, left: box.scrollLeft, inBox: now.left >= edge.left && now.right <= edge.right + 1 }
      })
      expect(track.inBox).toBe(true)
      if (width < 480) expect(track.scrolls && track.left > 0).toBe(true)
      expect(await inView('[data-lane-now] .es-marker__word')).toBe(true)
      expect(await inView('[data-loop-step]')).toBe(true)
      expect(await inView('[data-loop-readout]')).toBe(true)
    })
  }
})

/*
 * R-T14: the four demo levels read in the engine's words (REDESIGN §2.7). The copy guard over what the page shows, at the start, while a
 * level is played to its end, and at its debrief: its text, its labels and the lines its live regions say.
 */
test.describe('the demo levels say nothing in the kitchen\'s words', () => {
  for (const level of ['first-1-fill', 'first-2-slot', 'first-3-gap', 'first-4-par']) {
    test(`${level}: no banned word or phrase in its text, its labels or its live region, at the start and at the result`, async ({ page }) => {
      test.setTimeout(120_000)
      await open(page, level)
      expect(await bannedOn(page), 'at the start').toEqual([])
      await endIntro(page)
      await playToTheEnd(page)
      await expect(result(page)).toBeVisible()
      expect(await bannedOn(page), 'at the result').toEqual([])
    })
  }
})
