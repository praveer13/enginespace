/*
 * The Reach-In (`pool`) in a browser: the walks that `verify:games` lists for every game and cannot run itself (A§6.2, A§6.8, A§6.9,
 * GAMES.md §2.5), and W1-T23's first acceptance check: "the game can be completed by keyboard".
 *
 *   1. A keyboard-only walk plays levels to their debrief, and wins them: the prediction is typed into its field and committed with Enter;
 *      each ask is answered from the keyboard (Tab to the list, the arrow keys along it, Enter or Space on a button; a draft of the dump
 *      changed with Space on the rows and confirmed with the stub), and focus moves on to the list of the next ask on its own.
 *   2. The game's keys: `W` hangs none (or brings no kit in), `D` dumps the pans chosen, `,` takes a move back in practice, `?` lists the
 *      keys and Escape gives focus back.
 *   3. A graded run hides what a practice run shows (the price of a dump, the shared mise a ticket would find, the undo), takes a fresh seed
 *      when it starts, and is still won by the keyboard: the entropy is fixed here, so the seed is the one the house's actions were made for.
 *   4. Reduced motion: nothing animates, and the game plays.
 *   5. Nothing leaves the origin (ARCHITECTURE §1, I1).
 *   6. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10).
 *   7. axe finds no serious or critical violation on the game's pages at 360 and 1280 px, and nothing is cut off at the right edge at 320
 *      (WCAG 1.4.10).
 *   8. The open ask comes into view with each decision: it opens under the drawing, below the first screen, so the page moves just far
 *      enough to show it, and the control that has focus is on the screen, at 1440 and at 390 px.
 *
 * How it runs. The spec starts the app's own Vite dev server on a free port, so it needs no build and no preview server, and drives
 * `/play/pool` in whichever browser Playwright launches. Run it with `npx playwright test e2e/pool.spec.ts`. With ES_E2E_ORIGIN set to
 * the address of `vite preview` (after `npm run build`), it drives the built site instead, under the page's content security policy.
 */
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { applyAction, drawInBand, startRun, stateHash } from '../packages/play'
import { buildLevel } from '../packages/play/pool/levels'
import { poolSession } from '../packages/play/pool/session'
import { houseActions } from '../tests/play/pool-support'
import type { PoolAction } from '../packages/play/pool/types'
import { clipped } from './support/site'

const root = new URL('..', import.meta.url).pathname

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

/** The entropy a graded run draws its seed from, fixed in the page so that the spec knows the seed the house's actions are made for. */
const ENTROPY = 424242

const game = (page: Page) => page.locator('section[data-game="pool"]')
const live = (page: Page) => page.locator('[data-live="line"]')
const outcome = (page: Page) => page.locator('[data-live="outcome"]')
const verdict = (page: Page) => page.locator('[data-pool-debrief] h3').first()
const askKind = (page: Page) => page.locator('[data-pool-controls]').getAttribute('data-ask')
/** The shell's tape naming the level and its mode: under the 3D scene in the stage layout, so not the page's first tape. */
const levelTape = (page: Page) => page.locator('[data-game="pool"] .es-tape', { hasText: / · (practice|graded)$/ }).first()

/** What a reader would call the focused control: its aria-label, its label, or its text. */
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null
    if (element === null) return ''
    const named = element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? element.tagName
    return named.trim().replace(/\s+/g, ' ')
  })

async function open(page: Page, level: string) {
  await page.goto(`${origin}/play/pool?level=${level}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
}

/** Presses Tab until the focused control is named like `name`, and fails after `limit` presses. */
async function tabTo(page: Page, name: RegExp, limit = 60) {
  const seen: string[] = []
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const now = await activeName(page)
    if (name.test(now)) return
    seen.push(now)
  }
  throw new Error(`Tab never reached a control named ${name}; it went through ${seen.join(' > ')}`)
}

/**
 * Waits for the open ask to be of this kind, and puts the keyboard in its list: focus follows a new ask on its own, and a page that has
 * just opened does not take focus, so a keyboard Tabs from the top of the page to the list.
 */
async function awaitAsk(page: Page, kind: string) {
  await expect.poll(() => askKind(page), { message: `the open ask is ${kind}` }).toBe(kind)
  const inList = () => page.evaluate((k) => document.activeElement?.closest(`[data-ask-list="${k}"]`) != null, kind)
  for (let i = 0; i < 90 && !(await inList()); i++) {
    // Focus may be about to follow the ask; give the page a moment before moving it by hand.
    if (i < 2) await page.waitForTimeout(50)
    if (await inList()) break
    await page.keyboard.press('Tab')
  }
  expect(await inList(), `focus is in the ${kind} list`).toBe(true)
}

/** The buttons of the open ask's list that can be acted on, in order, with their names. */
const listOf = (page: Page, kind: string) =>
  page.evaluate((k) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-ask-list="${k}"] button[data-roving]:not(:disabled)`))
    return buttons.map((button) => ({ name: (button.getAttribute('aria-label') ?? button.textContent ?? '').trim().replace(/\s+/g, ' '), focused: button === document.activeElement, pressed: button.getAttribute('aria-pressed') === 'true' }))
  }, kind)

/** Moves focus along the list with the arrow keys until it is on the button at `index`. */
async function arrowTo(page: Page, kind: string, index: number) {
  const items = await listOf(page, kind)
  let at = items.findIndex((item) => item.focused)
  if (at < 0) throw new Error(`focus is not on the ${kind} list`)
  for (; at < index; at++) await page.keyboard.press('ArrowDown')
  for (; at > index; at--) await page.keyboard.press('ArrowUp')
}

const ticketNo = (id: number) => String(id + 1).padStart(2, '0')

/**
 * Answers the open ask the way a keyboard does, with the house's action. `hang` says how a hanging of none is made (the key `W`, or the
 * plate), and `dump` how a dump is confirmed (the key `D`, or Tab to the stub and Enter).
 */
async function take(page: Page, action: PoolAction, how: { none: 'key' | 'plate'; dump: 'key' | 'stub' } = { none: 'plate', dump: 'stub' }) {
  switch (action.t) {
    case 'commit':
      break
    case 'admit': {
      await awaitAsk(page, 'admit')
      if (action.req === null) {
        if (how.none === 'key') await page.keyboard.press('KeyW')
        else {
          await tabTo(page, /^Hang none$/, 6)
          await page.keyboard.press('Enter')
        }
        break
      }
      const items = await listOf(page, 'admit')
      const index = items.findIndex((item) => item.name.startsWith(`Hang ticket No. ${ticketNo(action.req as number)},`))
      expect(index, `ticket ${action.req} is on the list`).toBeGreaterThanOrEqual(0)
      await arrowTo(page, 'admit', index)
      await page.keyboard.press('Enter')
      break
    }
    case 'evict': {
      await awaitAsk(page, 'evict')
      const rows = await listOf(page, 'evict')
      const named = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-ask-list="evict"] button[data-roving]')).map((button) => Number(/pan (\d+)/.exec(button.textContent ?? '')?.[1])))
      const want = new Set(action.pages.map((page) => page + 1))
      // Space on a row toggles the pan; the rows are in the rotation's order, and the first `need` are chosen to begin with.
      for (const [index, row] of rows.entries()) {
        if (row.pressed !== want.has(named[index])) {
          await arrowTo(page, 'evict', index)
          await page.keyboard.press('Space')
        }
      }
      await expect(page.locator('[data-ask-list="evict"] [aria-pressed="true"]')).toHaveCount(action.pages.length)
      if (how.dump === 'key') await page.keyboard.press('KeyD')
      else {
        await tabTo(page, /^Dump the \d+ pans?$/, 8)
        await page.keyboard.press('Enter')
      }
      break
    }
    case 'preempt': {
      await awaitAsk(page, 'preempt')
      const items = await listOf(page, 'preempt')
      const index = items.findIndex((item) => item.name.startsWith(`Pull ticket No. ${ticketNo(action.req)},`))
      expect(index, `ticket ${action.req} is on the line`).toBeGreaterThanOrEqual(0)
      await arrowTo(page, 'preempt', index)
      await page.keyboard.press('Enter')
      break
    }
    case 'prefetch': {
      await awaitAsk(page, 'prefetch')
      if (action.adapter === null) {
        if (how.none === 'key') await page.keyboard.press('KeyW')
        else {
          await tabTo(page, /^Bring none yet$/, 6)
          await page.keyboard.press('Enter')
        }
        break
      }
      const items = await listOf(page, 'prefetch')
      const index = items.findIndex((item) => item.name.startsWith(`Bring kit ${(action.adapter as number) + 1} in,`))
      expect(index, `kit ${action.adapter} is on offer`).toBeGreaterThanOrEqual(0)
      await arrowTo(page, 'prefetch', index)
      await page.keyboard.press('Enter')
      break
    }
  }
}

async function endWithTheDebrief(page: Page, title = 'Well stocked.') {
  // Focus has moved on its own to the way into the debrief, which is one key away.
  await expect.poll(() => activeName(page)).toBe('See the debrief')
  await page.keyboard.press('Enter')
  await expect(verdict(page)).toHaveText(title)
}

/** Types the prediction the level asks for into its field and commits it, with the keyboard alone. */
async function predict(page: Page, answer: number) {
  await tabTo(page, /^Your answer$/)
  await page.keyboard.type(String(answer))
  await tabTo(page, /^Commit$/, 3)
  await page.keyboard.press('Enter')
  await expect(live(page)).not.toHaveText('')
}

test.describe('a keyboard-only walk wins levels', () => {
  test('`one-group`: the prediction typed and committed, every ticket hung from the list with the arrows and Enter, the pans dumped with the stub, and the debrief', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'one-group')
    const level = buildLevel('one-group', 2)
    await predict(page, level.predict.answer)
    const actions = houseActions(level)
    for (const action of actions) await take(page, action)
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await endWithTheDebrief(page)
    await expect(page.getByText('Your prediction:')).toBeVisible()
    await expect(page.getByText('You had it.')).toBeVisible()
    await expect(page.getByText('Your night against the house', { exact: false })).toBeVisible()
  })

  test('`evict`: the dump is drafted with Space on the rows, and confirmed with the key D; a hanging of none is the key W', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'evict')
    const level = buildLevel('evict', 10)
    const actions = houseActions(level)
    for (const action of actions) await take(page, action, { none: 'key', dump: 'key' })
    await endWithTheDebrief(page)
  })

  test('`adapters`: a kit is brought in from its list, or none yet with W, and the night is won', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'adapters')
    const level = buildLevel('adapters', 0)
    const actions = houseActions(level)
    expect(actions.some((action) => action.t === 'prefetch' && action.adapter !== null)).toBe(true)
    for (const action of actions) await take(page, action, { none: 'key', dump: 'stub' })
    await endWithTheDebrief(page)
    await expect(page.getByText('The same night, with the kits on a shelf')).toBeVisible()
  })

  test('a night that is not won is told so, with the decision that mattered: the engine\'s dumps on `evict`', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'evict')
    // Hang the first ticket offered, and take the rotation\'s next pans as they are chosen: what an engine does.
    for (let guard = 0; guard < 80; guard++) {
      if ((await page.getByRole('button', { name: 'See the debrief' }).count()) > 0) break
      const kind = await askKind(page)
      if (kind === 'evict') {
        await tabTo(page, /^Dump the \d+ pans?$/, 8)
        await page.keyboard.press('Enter')
      } else if (kind === 'admit') {
        await awaitAsk(page, 'admit')
        const items = await listOf(page, 'admit')
        // The last ticket offered: newer than the rest, and not the one the cache holds the most of.
        await arrowTo(page, 'admit', items.length - 1)
        await page.keyboard.press('Enter')
      }
    }
    await expect.poll(() => activeName(page)).toBe('See the debrief')
    await page.keyboard.press('Enter')
    await expect(verdict(page)).toHaveText('Stock it again.')
    await expect(page.getByText('The decision that mattered:')).toBeVisible()
  })

  test('the last level\'s debrief offers the course map, and Next keeps focus in the game', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'one-group')
    const level = buildLevel('one-group', 2)
    for (const action of houseActions(level)) await take(page, action, { none: 'key', dump: 'key' })
    await endWithTheDebrief(page)
    await page.getByRole('button', { name: 'Next level' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('pool')
    await expect(levelTape(page)).toContainText('Two kinds of station · practice')
  })
})

test.describe('the keys of the game', () => {
  test('`,` takes the last move back, `?` lists the keys with W and D among them, and Escape gives focus back', async ({ page }) => {
    await open(page, 'one-group')
    await game(page).focus()
    await awaitAsk(page, 'admit')
    await tabTo(page, /^Hang none$/, 6)
    await page.keyboard.press('Enter')
    await expect(live(page)).not.toHaveText('')
    await game(page).focus()
    await page.keyboard.press('Comma')
    await expect(live(page)).toContainText('Undid the last move.')
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog')
    await expect(keys).toBeVisible()
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', 'C', 'V', '?', 'W', 'D'])
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('pool')
  })

  test('W hangs none and does nothing while pans are asked for; D dumps the pans chosen and does nothing while a ticket is asked for', async ({ page }) => {
    await open(page, 'evict')
    const level = buildLevel('evict', 10)
    const actions = houseActions(level)
    const firstEvict = actions.findIndex((action) => action.t === 'evict')
    for (const action of actions.slice(0, firstEvict)) await take(page, action)
    await awaitAsk(page, 'evict')
    await page.keyboard.press('KeyW')
    expect(await askKind(page)).toBe('evict')
    await game(page).focus()
    await page.keyboard.press('KeyD')
    await expect.poll(() => askKind(page)).not.toBe('evict')
    await awaitAsk(page, 'admit')
    const turns = await page.evaluate(() => document.querySelectorAll('[data-ask-list="admit"] button[data-roving]').length)
    expect(turns).toBeGreaterThan(0)
    await game(page).focus()
    await page.keyboard.press('KeyD')
    expect(await askKind(page)).toBe('admit')
    await page.keyboard.press('KeyW')
    await expect(live(page)).not.toHaveText('')
  })

  test('the arrows move along a list with one tab stop, Home and End go to its ends, and Tab leaves it', async ({ page }) => {
    await open(page, 'evict')
    await awaitAsk(page, 'admit')
    const stops = await page.evaluate(() => document.querySelectorAll('[data-ask-list="admit"] button[tabindex="0"]').length)
    expect(stops).toBe(1)
    const items = await listOf(page, 'admit')
    expect(items.length).toBeGreaterThan(1)
    await page.keyboard.press('End')
    expect((await listOf(page, 'admit')).findIndex((item) => item.focused)).toBe(items.length - 1)
    await page.keyboard.press('Home')
    expect((await listOf(page, 'admit')).findIndex((item) => item.focused)).toBe(0)
    await page.keyboard.press('ArrowDown')
    expect((await listOf(page, 'admit')).findIndex((item) => item.focused)).toBe(1)
    await page.keyboard.press('Tab')
    expect(await activeName(page)).toBe('Hang none')
  })

  test('a row of the dump is a toggle: Space chooses it or lets it go, and the stub is not ready until exactly as many pans are chosen as the ticket needs', async ({ page }) => {
    await open(page, 'evict')
    const actions = houseActions(buildLevel('evict', 10))
    const firstEvict = actions.findIndex((action) => action.t === 'evict')
    for (const action of actions.slice(0, firstEvict)) await take(page, action)
    await awaitAsk(page, 'evict')
    const chosen = () => page.locator('[data-ask-list="evict"] [aria-pressed="true"]').count()
    const need = await chosen()
    expect(need).toBeGreaterThan(0)
    const stub = page.getByRole('button', { name: /^Dump the \d+ pans?$/ })
    await expect(stub).toBeEnabled()
    await page.keyboard.press('Space')
    expect(await chosen()).toBe(need - 1)
    await expect(stub).toBeDisabled()
    await expect(page.getByRole('status').filter({ hasText: 'Chosen' })).toContainText(`Chosen ${need - 1} of ${need}`)
    await page.keyboard.press('Space')
    expect(await chosen()).toBe(need)
    await expect(stub).toBeEnabled()
  })
})

test.describe('the open ask is brought into view', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} px, every decision of the first twelve opens the next ask on the screen, with focus in it`, async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize({ width, height })
      await open(page, 'evict')
      const actions = houseActions(buildLevel('evict', 10))
      for (const action of actions.slice(0, 12)) {
        await take(page, action)
        await expect.poll(() => askKind(page)).not.toBeNull()
        // Focus follows the ask on its own, and the page moves just far enough to show it: the lamp's ticket is on the screen, whole when it
        // fits, and from its top when it is taller than the screen (a phone's list of pans), and the control that has focus is in view.
        await expect
          .poll(() =>
            page.evaluate(() => {
              const card = document.querySelector('[data-ask-card]')?.getBoundingClientRect()
              const focus = document.activeElement?.getBoundingClientRect()
              if (card === undefined || focus === undefined) return 'no card or no focus'
              if (document.activeElement?.closest('[data-ask-card]') === null) return 'focus is not in the ask'
              if (focus.top < -2 || focus.bottom > innerHeight + 2) return `focus is off the screen (${Math.round(focus.top)} to ${Math.round(focus.bottom)} of ${innerHeight})`
              const fits = card.height <= innerHeight
              if (card.top < -2 || (fits && card.bottom > innerHeight + 2)) return `the ask is cut off (${Math.round(card.top)} to ${Math.round(card.bottom)} of ${innerHeight})`
              return 'on the screen'
            }),
          )
          .toBe('on the screen')
      }
    })
  }
})

test.describe('a graded run', () => {
  // The levels fold on a phone; at this width they are open, and the mode is one click away.
  test.use({ viewport: { width: 1280, height: 900 } })

  /** Fixes the entropy a graded run draws its seed from, so that the spec knows the seed: the house's actions are made for it. */
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((entropy) => {
      const real = crypto.getRandomValues.bind(crypto)
      crypto.getRandomValues = ((array: ArrayBufferView) => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = entropy
          return array
        }
        return real(array)
      }) as typeof crypto.getRandomValues
    }, ENTROPY)
  })

  test('hides the price of a dump, the shared mise a ticket would find and the undo, and says so', async ({ page }) => {
    await open(page, 'evict')
    await page.getByRole('button', { name: 'Graded', exact: true }).click()
    await expect(levelTape(page)).toContainText('Dump the right pans · graded')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await awaitAsk(page, 'admit')
    await expect(game(page)).not.toContainText('shared mise 0')
    await expect(page.locator('[data-ask-list="admit"]')).not.toContainText('to take')
    await expect(page.getByText('A fresh seed, no undo, and no price printed for a dump.')).toBeVisible()
  })

  test('is won by the keyboard from the seed the entropy gives, with no price on any list, and the debrief passes it', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'evict')
    await page.getByRole('button', { name: 'Graded', exact: true }).click()
    const seed = drawInBand(poolSession, 'evict', ENTROPY)
    const level = buildLevel('evict', seed)
    let sawEvict = false
    for (const action of houseActions(level)) {
      if (action.t === 'evict') {
        await awaitAsk(page, 'evict')
        sawEvict = true
        await expect(page.locator('[data-ask-list="evict"]')).not.toContainText('loses')
        await expect(page.locator('[data-ask-list="evict"]')).not.toContainText('nobody waits on it')
      }
      await take(page, action)
    }
    expect(sawEvict).toBe(true)
    await endWithTheDebrief(page)
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  })

  test('takes the learner back to a fresh seed with "New numbers", and the run it starts is a run of the same level', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'one-group')
    for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action, { none: 'key', dump: 'key' })
    await endWithTheDebrief(page)
    await page.getByRole('button', { name: 'New numbers' }).click()
    await expect(levelTape(page)).toContainText('One station · practice')
    await awaitAsk(page, 'admit')
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, the printer feeds without a motion, and the game plays to a verdict', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'one-group')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const actions = houseActions(buildLevel('one-group', 2))
    for (const action of actions.slice(0, 6)) await take(page, action)
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-printer__feed') as Element).animationDuration)).toBe('0.001s')
    for (const action of actions.slice(6)) await take(page, action)
    await endWithTheDebrief(page)
  })
})

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played to its debrief', async ({ page }) => {
    test.setTimeout(180_000)
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
    await open(page, 'one-group')
    for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action)
    await endWithTheDebrief(page)
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism', () => {
  test('the same seed and the same actions give the same state hash in the browser as under Node', async ({ page }) => {
    test.skip(built, 'the page imports the sources, which only the dev server serves')
    const level = buildLevel('evict', 10)
    const actions = houseActions(level)
    let run = startRun(poolSession, { game: 'pool', level: 'evict', seed: 10 })
    for (const action of actions) run = applyAction(poolSession, run, action)
    const expected = stateHash(run.state)
    await open(page, 'one-group')
    // The page imports the same modules from the dev server and runs the same actions. The script is a string, so that nothing in
    // Playwright's transform of this file touches the imports.
    const inBrowser = await page.evaluate(`(async () => {
      const play = await import('/packages/play/index.ts')
      const { poolSession } = await import('/packages/play/pool/session.ts')
      let run = play.startRun(poolSession, { game: 'pool', level: 'evict', seed: 10 })
      for (const action of ${JSON.stringify(actions)}) run = play.applyAction(poolSession, run, action)
      return play.stateHash(run.state)
    })()`)
    expect(inBrowser).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{8}$/)
    expect(expected).toBe('427f825e')
  })
})

test.describe('accessibility', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
  const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']
  const LEVELS = ['one-group', 'two-kinds', 'evict', 'same-size', 'state', 'adapters', 'manager']

  /** The audit: serious and critical findings fail, and so do the heading rules, whatever their impact. */
  async function audit(page: Page, label: string) {
    // A button that has just changed its look is part-way through a transition of its colours, and axe measures the contrast of that.
    await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)))
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
    const summary = (v: (typeof results.violations)[number]) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.slice(0, 3).map((node) => `${node.target.join(' ')} (${node.any[0]?.message ?? node.failureSummary ?? ''}) ${node.html.slice(0, 160)}`).join(' ; ')}`
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map(summary), `${label}: serious or critical violations`).toEqual([])
    expect(results.violations.filter((v) => HEADING_RULES.includes(v.id)).map(summary), `${label}: the heading outline`).toEqual([])
  }

  for (const width of [360, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('every level\'s page, a dump being drafted, a kit being asked for and a debrief, pass axe', async ({ page }) => {
        test.setTimeout(240_000)
        for (const level of LEVELS) {
          await open(page, level)
          await audit(page, `${level} at ${width} px`)
        }
        await open(page, 'evict')
        const evict = houseActions(buildLevel('evict', 10))
        const firstEvict = evict.findIndex((action) => action.t === 'evict')
        for (const action of evict.slice(0, firstEvict)) await take(page, action)
        await awaitAsk(page, 'evict')
        await audit(page, `evict, a dump being drafted, at ${width} px`)
        await open(page, 'adapters')
        const kits = houseActions(buildLevel('adapters', 0))
        const firstKit = kits.findIndex((action) => action.t === 'prefetch')
        for (const action of kits.slice(0, firstKit)) await take(page, action)
        await awaitAsk(page, 'prefetch')
        await audit(page, `adapters, a kit being asked for, at ${width} px`)
        await open(page, 'one-group')
        for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action)
        await endWithTheDebrief(page)
        await audit(page, `one-group debrief at ${width} px`)
      })
    })
  }

  test.describe('at 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('no word is cut off at the right edge and the page needs no sideways scroll, on any level (WCAG 1.4.10)', async ({ page }) => {
      test.setTimeout(180_000)
      for (const level of LEVELS) {
        await open(page, level)
        const found = await clipped(page, '[data-game="pool"]')
        expect(found.text, `${level}: words past the right edge`).toEqual([])
        expect(found.scrolls, `${level}: sideways scroll`).toBeLessThanOrEqual(0)
      }
      await open(page, 'evict')
      const evict = houseActions(buildLevel('evict', 10))
      for (const action of evict.slice(0, evict.findIndex((a) => a.t === 'evict'))) await take(page, action)
      await awaitAsk(page, 'evict')
      const found = await clipped(page, '[data-game="pool"]')
      expect(found.text, 'a dump being drafted: words past the right edge').toEqual([])
      expect(found.scrolls, 'a dump being drafted: sideways scroll').toBeLessThanOrEqual(0)
    })
  })
})
