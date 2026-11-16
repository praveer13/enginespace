/*
 * KV page pool (`pool`) in a browser, in the instrument frame (REDESIGN §2.6): the walks that `verify:games` lists for every game and cannot
 * run itself (A§6.2, A§6.8, A§6.9, GAMES.md §2.5), and R-T07's acceptance checks.
 *
 *   1. A keyboard-only walk plays levels to their result: the guess is typed into its field and committed; each decision is answered from
 *      the keyboard (Tab to the list, the arrow keys along it, Enter or Space on a button; an eviction changed with Space on the rows and
 *      confirmed with its button), and focus moves on to the list of the next decision on its own, and to the verdict at the end.
 *   2. The game's keys: `W` admits none (or loads no adapter), `D` evicts the pages chosen, `,` takes a move back in practice, `?` opens the
 *      Keyboard list and Escape gives focus back.
 *   3. A graded run hides what a practice run shows (the cost of each eviction, the prefix a request would reuse, the undo), says so in the
 *      dock, takes a fresh seed when it starts, and is still won by the keyboard.
 *   4. The frame: its parts in the order of REDESIGN §2.6, the level menu one control, the goal line's four parts on every level, the
 *      diagram as the default view with 3D one switch away, the table in the DOM whether its disclosure is open or not, and no banned word
 *      in text, aria labels or the live region's lines.
 *   5. P5: at 1440 x 900 and 390 x 844 the diagram, the current control and the readout are inside the viewport at the start, at an eviction
 *      decision and at the result; under 700 px of height the dock is not pinned.
 *   6. Reduced motion: nothing animates, and the game plays. Nothing leaves the origin (I1). The same seed and the same actions give the
 *      same state hash in the browser as under Node (A§5.10). axe finds no serious or critical violation at 360 and 1280 px, and nothing is
 *      cut off at the right edge at 320 (WCAG 1.4.10).
 *   7. R-T08's first run and feedback: the parts named before any guess, the look, the guess, the first move pointed at, all in under a
 *      minute; not modal (Skip intro, Escape, nothing disabled, focus free); the intro flag per level and How to play's replay; the intro
 *      as a chunk of its own; a named moment once, the delta for a second, and at the result the reference drawn hollow and your best.
 *
 * Every walk but section 7's opens the page as a learner who has met every part (the intro flag holds them all), so that its own first
 * run does not stand in the way; section 7 opens it as a learner who has met none.
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
import { POOL_COPY, POOL_PARTS, partsOf } from '../packages/play/pool/copy'
import { buildLevel } from '../packages/play/pool/levels'
import { poolGhost, poolSession } from '../packages/play/pool/session'
import { POOL_LEVEL_IDS } from '../packages/play/pool/types'
import type { PoolAction } from '../packages/play/pool/types'
import { findBanned } from '../src/copy/banned'
import { houseActions } from '../tests/play/pool-support'
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

/** The entropy a graded run draws its seed from, fixed in the page so that the spec knows the seed the reference's actions are made for. */
const ENTROPY = 424242

const game = (page: Page) => page.locator('section[data-game="pool"]')
const live = (page: Page) => page.locator('[data-live="line"]')
const outcome = (page: Page) => page.locator('[data-live="outcome"]')
const verdict = (page: Page) => page.locator('[data-result] [data-result-heading]')
const askKind = (page: Page) => page.locator('[data-pool-controls]').getAttribute('data-ask')

/** What a reader would call the focused control: its aria-label, its label, or its text. */
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null
    if (element === null) return ''
    const named = element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? element.tagName
    return named.trim().replace(/\s+/g, ' ')
  })

/** Every part of the game, as the intro flag keeps them once shown: a learner who has met them all. */
const MET = JSON.stringify({ pool: POOL_PARTS.map((part) => part.id) })

/** Opens a level, as a learner who has met every part (the default) or as one who has met none (`fresh`). */
async function open(page: Page, level: string, { intro = 'met' }: { intro?: 'met' | 'fresh' } = {}) {
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
 * Waits for the open decision to be of this kind, and puts the keyboard in its list: focus follows a new decision on its own, and a page
 * that has just opened does not take focus, so a keyboard Tabs from the top of the page to the list.
 */
async function awaitAsk(page: Page, kind: string) {
  await expect.poll(() => askKind(page), { message: `the open decision is ${kind}` }).toBe(kind)
  const inList = () => page.evaluate((k) => document.activeElement?.closest(`[data-ask-list="${k}"]`) != null, kind)
  for (let i = 0; i < 90 && !(await inList()); i++) {
    if (i < 2) await page.waitForTimeout(50)
    if (await inList()) break
    await page.keyboard.press('Tab')
  }
  expect(await inList(), `focus is in the ${kind} list`).toBe(true)
}

/** The buttons of the open decision's list that can be acted on, in order, with their names. */
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

/**
 * Answers the open decision the way a keyboard does, with the reference's action. `none` says how "none" is chosen (the key `W`, or its
 * button), and `evict` how an eviction is confirmed (the key `D`, or Tab to its button and Enter).
 */
async function take(page: Page, action: PoolAction, how: { none: 'key' | 'button'; evict: 'key' | 'button' } = { none: 'button', evict: 'button' }) {
  switch (action.t) {
    case 'commit':
      break
    case 'admit': {
      await awaitAsk(page, 'admit')
      if (action.req === null) {
        if (how.none === 'key') await page.keyboard.press('KeyW')
        else {
          await tabTo(page, /^Admit none this step$/, 12)
          await page.keyboard.press('Enter')
        }
        break
      }
      const items = await listOf(page, 'admit')
      const index = items.findIndex((item) => item.name.startsWith(`Admit request ${(action.req as number) + 1},`))
      expect(index, `request ${action.req} is on the list`).toBeGreaterThanOrEqual(0)
      await arrowTo(page, 'admit', index)
      await page.keyboard.press('Enter')
      break
    }
    case 'evict': {
      await awaitAsk(page, 'evict')
      const rows = await listOf(page, 'evict')
      const named = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-ask-list="evict"] button[data-roving]')).map((button) => Number(/page (\d+)/.exec(button.textContent ?? '')?.[1])))
      const want = new Set(action.pages.map((id) => id + 1))
      // Space on a row toggles the page; the rows are in the free queue's order, and the first `need` are chosen to begin with.
      for (const [index, row] of rows.entries()) {
        if (row.pressed !== want.has(named[index])) {
          await arrowTo(page, 'evict', index)
          await page.keyboard.press('Space')
        }
      }
      await expect(page.locator('[data-ask-list="evict"] [aria-pressed="true"]')).toHaveCount(action.pages.length)
      if (how.evict === 'key') await page.keyboard.press('KeyD')
      else {
        await tabTo(page, /^Evict \d+ pages?$/, 8)
        await page.keyboard.press('Enter')
      }
      break
    }
    case 'preempt': {
      await awaitAsk(page, 'preempt')
      const items = await listOf(page, 'preempt')
      const index = items.findIndex((item) => item.name.startsWith(`Preempt request ${action.req + 1},`))
      expect(index, `request ${action.req} is running`).toBeGreaterThanOrEqual(0)
      await arrowTo(page, 'preempt', index)
      await page.keyboard.press('Enter')
      break
    }
    case 'prefetch': {
      await awaitAsk(page, 'prefetch')
      if (action.adapter === null) {
        if (how.none === 'key') await page.keyboard.press('KeyW')
        else {
          await tabTo(page, /^Load none yet$/, 12)
          await page.keyboard.press('Enter')
        }
        break
      }
      const items = await listOf(page, 'prefetch')
      const index = items.findIndex((item) => item.name.startsWith(`Load adapter ${(action.adapter as number) + 1},`))
      expect(index, `adapter ${action.adapter} is on offer`).toBeGreaterThanOrEqual(0)
      await arrowTo(page, 'prefetch', index)
      await page.keyboard.press('Enter')
      break
    }
  }
}

/** The run is over: the result is in the dock, and focus is on its verdict. */
async function atTheResult(page: Page, word: string) {
  await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
  await expect(verdict(page)).toHaveText(word)
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-result-heading') ?? false)).toBe(true)
}

/** Types the guess the level asks for into its field and commits it, with the keyboard alone. */
async function guess(page: Page, answer: number) {
  await tabTo(page, /^Your guess$/)
  await page.keyboard.type(String(answer))
  await tabTo(page, /^Commit$/, 3)
  await page.keyboard.press('Enter')
  await expect(live(page)).toContainText('Guess committed.')
}

test.describe('a keyboard-only walk wins levels', () => {
  test('`one-group`: the guess typed and committed, every request admitted from the list with the arrows and Enter, the evictions confirmed with their button, and the result', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'one-group')
    const level = buildLevel('one-group', 2)
    await guess(page, level.predict.answer)
    for (const action of houseActions(level)) await take(page, action)
    await atTheResult(page, 'Finished (practice)')
    // The guess's pin and the answer's pin on one number line, the cost against the reference, and the counts.
    await expect(page.locator('[data-result] .es-numline')).toContainText('your guess')
    await expect(page.locator('[data-pool-versus]')).toContainText('the same as the reference')
    await expect(page.getByText('Your run against the reference', { exact: false })).toBeAttached()
  })

  test('`evict`: the eviction is changed with Space on the rows and confirmed with the key D; admitting none is the key W', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'evict')
    for (const action of houseActions(buildLevel('evict', 10))) await take(page, action, { none: 'key', evict: 'key' })
    await atTheResult(page, 'Passed')
  })

  test('`adapters`: an adapter is loaded from its list, or none yet with W, and the run passes', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'adapters')
    const actions = houseActions(buildLevel('adapters', 0))
    expect(actions.some((action) => action.t === 'prefetch' && action.adapter !== null)).toBe(true)
    for (const action of actions) await take(page, action, { none: 'key', evict: 'button' })
    await atTheResult(page, 'Passed')
    await expect(page.getByText('The same run, with the adapters in fixed slots')).toBeAttached()
  })

  test("a run that is not won is told so, with the decision that mattered: the engine's evictions on `evict`", async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'evict')
    for (let guard = 0; guard < 80; guard++) {
      if ((await page.locator('[data-result]').count()) > 0) break
      const kind = await askKind(page)
      if (kind === 'evict') {
        await awaitAsk(page, 'evict')
        await page.keyboard.press('KeyD')
      } else if (kind === 'admit') {
        await awaitAsk(page, 'admit')
        const items = await listOf(page, 'admit')
        // The last request offered: newer than the rest, and not the one whose prefix the pool holds the most of.
        await arrowTo(page, 'admit', items.length - 1)
        await page.keyboard.press('Enter')
      }
    }
    await atTheResult(page, 'Not yet')
    await expect(page.getByText('The decision that mattered:')).toBeVisible()
  })

  test('the next level is the primary control at the result, and choosing it keeps focus in the game', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'one-group')
    for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action, { none: 'key', evict: 'key' })
    await atTheResult(page, 'Finished (practice)')
    await page.getByRole('button', { name: 'Next level: Full attention and a sliding window' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('pool')
    await expect(game(page)).toHaveAttribute('data-level', 'two-kinds')
    await expect(page.getByLabel('Level', { exact: true })).toHaveValue('two-kinds')
  })
})

test.describe('the keys of the game', () => {
  test('`,` takes the last move back, `?` opens the Keyboard list with W and D among them, and Escape gives focus back', async ({ page }) => {
    await open(page, 'one-group')
    await game(page).focus()
    await awaitAsk(page, 'admit')
    await tabTo(page, /^Admit none this step$/, 12)
    await page.keyboard.press('Enter')
    await expect(live(page)).not.toHaveText('')
    await game(page).focus()
    await page.keyboard.press('Comma')
    await expect(live(page)).toContainText('Undid the last move.')
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog', { name: 'Keyboard' })
    await expect(keys).toBeVisible()
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', 'C', 'V', '?', 'W', 'D'])
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('pool')
  })

  test('W admits none and does nothing while pages are asked for; D evicts the pages chosen and does nothing while a request is asked for', async ({ page }) => {
    await open(page, 'evict')
    const actions = houseActions(buildLevel('evict', 10))
    const firstEvict = actions.findIndex((action) => action.t === 'evict')
    for (const action of actions.slice(0, firstEvict)) await take(page, action)
    await awaitAsk(page, 'evict')
    await page.keyboard.press('KeyW')
    expect(await askKind(page)).toBe('evict')
    await game(page).focus()
    await page.keyboard.press('KeyD')
    await expect.poll(() => askKind(page)).not.toBe('evict')
    await awaitAsk(page, 'admit')
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
    expect(await activeName(page)).toBe('Admit none this step')
  })

  test('a row of an eviction is a toggle, and the eviction is not ready until exactly as many pages are chosen as the decision needs', async ({ page }) => {
    await open(page, 'evict')
    const actions = houseActions(buildLevel('evict', 10))
    for (const action of actions.slice(0, actions.findIndex((a) => a.t === 'evict'))) await take(page, action)
    await awaitAsk(page, 'evict')
    const chosen = () => page.locator('[data-ask-list="evict"] [aria-pressed="true"]').count()
    const need = await chosen()
    expect(need).toBeGreaterThan(0)
    const go = page.getByRole('button', { name: /^Evict \d+ pages?$/ })
    await expect(go).toBeEnabled()
    await page.keyboard.press('Space')
    expect(await chosen()).toBe(need - 1)
    await expect(go).toBeDisabled()
    await expect(page.getByRole('status').filter({ hasText: 'Chosen' })).toContainText(`Chosen ${need - 1} of ${need}`)
    await page.keyboard.press('Space')
    expect(await chosen()).toBe(need)
    await expect(go).toBeEnabled()
  })
})

test.describe('the frame', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("its parts stand in the order of REDESIGN §2.6, the level menu is one control, and the Keyboard list is labelled Keyboard", async ({ page }) => {
    await open(page, 'one-group')
    const order = await page.evaluate(() => {
      const frame = document.querySelector('section[data-game="pool"]')
      const parts = ['.es-frame__strip', '.es-frame__goal-box', '[data-frame-diagram]', '.es-frame__legend', '[data-dock]', '.es-titleblock', '[data-state-table]']
      return parts.map((selector) => {
        const node = frame?.querySelector(selector)
        if (node === null || node === undefined) return Number.NaN
        return [...(frame?.querySelectorAll('*') ?? [])].indexOf(node)
      })
    })
    expect(order.every((at) => !Number.isNaN(at))).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // The strip: the title and its role line, one level menu, the view switch, Parts, How to play and Keyboard.
    const strip = page.locator('.es-frame__strip')
    await expect(strip.getByRole('heading', { name: 'KV page pool' })).toBeVisible()
    await expect(strip).toContainText('You are the KV allocator.')
    await expect(strip.getByRole('combobox')).toHaveCount(1)
    await expect(strip.getByRole('combobox')).toHaveValue('one-group')
    await expect(strip.locator('option').first()).toHaveText('Level 1 of 7 · One KV group · practice')
    await expect(strip.locator('ol, ul').filter({ has: page.locator('button') })).toHaveCount(0)
    for (const name of ['Diagram', '3D', 'Parts', 'How to play', 'Keyboard']) await expect(strip.getByRole('button', { name, exact: true })).toBeVisible()
    await strip.getByRole('button', { name: 'Keyboard' }).click()
    await expect(page.getByRole('dialog', { name: 'Keyboard' })).toBeVisible()
    await page.keyboard.press('Escape')
    // Parts opens the parts list, by the engine's names.
    await strip.getByRole('button', { name: 'Parts' }).click()
    await expect(page.getByRole('list', { name: 'Parts of the KV page pool' })).toContainText('Free queue')
  })

  test("every level's goal line shows the aim, what the learner controls, the number to beat or the pass rule, and when the level ends", async ({ page }) => {
    test.setTimeout(120_000)
    for (const id of POOL_LEVEL_IDS) {
      await open(page, id)
      const goal = page.locator('.es-goal')
      const copy = POOL_COPY[id].goal
      await expect(goal.locator('[data-part="aim"]')).toHaveText(copy.aim)
      await expect(goal.locator('[data-part="control"]')).toHaveText(copy.controls)
      await expect(goal.locator('[data-part="target"]')).toHaveText(copy.beat)
      await expect(goal.locator('[data-part="ends"]')).toHaveText(/^Ends /)
      if (POOL_COPY[id].passRule !== undefined) expect(copy.beat).toBe(POOL_COPY[id].passRule)
      await expect(goal).toBeInViewport()
    }
  })

  test('the diagram is the default view, and 3D is one switch away', async ({ page }) => {
    await open(page, 'one-group')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.getByRole('button', { name: 'Diagram', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('[data-surface="2d"] [data-pool-view]')).toBeVisible()
    const three = page.getByRole('button', { name: '3D', exact: true })
    await expect(three).toHaveAttribute('aria-pressed', 'false')
    if (await three.isEnabled()) {
      await three.click()
      await expect(game(page)).toHaveAttribute('data-view', '3d')
      await expect(page.locator('[data-stage="pool"]')).toBeAttached()
    }
  })

  test('the table is in the DOM whether its disclosure is open or closed', async ({ page }) => {
    await open(page, 'one-group')
    const table = page.locator('[data-state-table]')
    await expect(table).not.toHaveAttribute('open', '')
    await expect(table.locator('table')).toHaveCount(2)
    await expect(table.locator('table').first()).toBeHidden()
    await table.locator('summary').click()
    await expect(table.locator('table').first()).toBeVisible()
    await expect(table.locator('table')).toHaveCount(2)
  })

  test('an eviction is announced in the dock; in practice each option shows its cost, and a graded run says it does not', async ({ page }) => {
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
    await open(page, 'evict')
    const practice = houseActions(buildLevel('evict', 10))
    for (const action of practice.slice(0, practice.findIndex((a) => a.t === 'evict'))) await take(page, action)
    await awaitAsk(page, 'evict')
    await expect(page.locator('[data-ask-card] h3')).toHaveText('New decision: the pool is full')
    await expect(live(page)).toContainText('New decision: the pool is full.')
    await expect(page.locator('[data-pool-costs]')).toHaveAttribute('data-pool-costs', 'shown')
    const rows = page.locator('[data-ask-list="evict"] button[data-roving]')
    expect(await rows.count()).toBeGreaterThan(0)
    for (const text of await rows.allTextContents()) expect(text).toMatch(/costs? (nothing now|\d+ tokens?)/)

    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    const graded = houseActions(buildLevel('evict', drawInBand(poolSession, 'evict', ENTROPY)))
    for (const action of graded.slice(0, graded.findIndex((a) => a.t === 'evict'))) await take(page, action)
    await awaitAsk(page, 'evict')
    await expect(page.locator('[data-pool-costs]')).toHaveText('A graded run shows no costs: read them off the diagram.')
    await expect(page.locator('[data-ask-list="evict"]')).not.toContainText('cost')
  })
})

/** The words a learner meets on the page: its text, its aria labels, its titles and its alt text. */
const pageWords = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector('section[data-game="pool"]')
    if (frame === null) return ''
    const labels = [...frame.querySelectorAll('[aria-label],[title],[alt]')].flatMap((node) => ['aria-label', 'title', 'alt'].map((name) => node.getAttribute(name) ?? ''))
    const text = [...frame.querySelectorAll('*')].filter((node) => node.closest('code') === null).map((node) => [...node.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join(' '))
    return [...text, ...labels, document.title].join('\n')
  })

test.describe('the copy', () => {
  test('no banned word or phrase on /play/pool in text, aria labels or the live region, from the start of a level to its result', async ({ page }) => {
    test.setTimeout(240_000)
    const said: string[] = []
    for (const id of POOL_LEVEL_IDS) {
      await open(page, id)
      expect([id, findBanned(await pageWords(page))]).toEqual([id, []])
    }
    await open(page, 'adapters')
    const actions = houseActions(buildLevel('adapters', 0))
    for (const action of actions) {
      await take(page, action, { none: 'key', evict: 'key' })
      said.push((await live(page).textContent()) ?? '')
      if (action.t === 'evict' || action.t === 'prefetch') expect(findBanned(await pageWords(page))).toEqual([])
    }
    await atTheResult(page, 'Passed')
    await page.locator('[data-state-table] summary').click()
    expect(findBanned(await pageWords(page))).toEqual([])
    expect(findBanned(said.join('\n'))).toEqual([])
    await expect(page.getByText('Say it first')).toHaveCount(0)
  })
})

/** Whether the diagram, the current control and the readout are each inside the viewport. */
const inView = (page: Page, control: string) =>
  page.evaluate((selector) => {
    const box = (node: Element | null) => node?.getBoundingClientRect()
    const within = (rect: DOMRect | undefined) => rect !== undefined && rect.top >= -1 && rect.left >= -1 && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1 && rect.height > 0
    const diagram = box(document.querySelector('[data-frame-diagram]'))
    const current = box(document.querySelector(selector))
    const readout = box(document.querySelector('[data-readout]'))
    return { diagram: within(diagram), control: within(current), readout: within(readout), scrolled: scrollY }
  }, control)

test.describe('P5: the diagram, the current control and the readout share one screen', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} x ${height}: at the start, at an eviction and at the result`, async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize({ width, height })
      await open(page, 'one-group')
      const all = { diagram: true, control: true, readout: true, scrolled: 0 }
      // The start: the guess's field is the move in hand.
      expect(await inView(page, '[data-pool-predict] input')).toEqual(all)
      await page.getByRole('button', { name: 'Skip the guess' }).click()
      const actions = houseActions(buildLevel('one-group', 2))
      const firstEvict = actions.findIndex((a) => a.t === 'evict')
      for (const action of actions.slice(0, firstEvict)) await take(page, action)
      await awaitAsk(page, 'evict')
      await page.evaluate(() => scrollTo(0, 0))
      expect(await inView(page, '[data-ask-list="evict"] button[tabindex="0"]')).toEqual(all)
      for (const action of actions.slice(firstEvict)) await take(page, action, { none: 'key', evict: 'key' })
      await atTheResult(page, 'Finished (practice)')
      await page.evaluate(() => scrollTo(0, 0))
      expect(await inView(page, '[data-result] button')).toEqual(all)
    })
  }

  test('under 700 px of height the dock is not pinned, and follows the diagram', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 })
    await open(page, 'one-group')
    expect(await page.locator('[data-dock]').evaluate((dock) => getComputedStyle(dock).position)).toBe('static')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.locator('[data-dock]').evaluate((dock) => getComputedStyle(dock).position)).toBe('sticky')
  })
})

test.describe('the open decision is brought into view', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} px, every decision of the first twelve opens the next one with focus in it, on the screen`, async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize({ width, height })
      await open(page, 'evict')
      for (const action of houseActions(buildLevel('evict', 10)).slice(0, 12)) {
        await take(page, action)
        await expect.poll(() => askKind(page)).not.toBeNull()
        await expect
          .poll(() =>
            page.evaluate(() => {
              const focus = document.activeElement?.getBoundingClientRect()
              if (focus === undefined) return 'no focus'
              if (document.activeElement?.closest('[data-ask-card]') === null) return 'focus is not in the decision'
              if (focus.top < -2 || focus.bottom > innerHeight + 2) return `focus is off the screen (${Math.round(focus.top)} to ${Math.round(focus.bottom)} of ${innerHeight})`
              return 'on the screen'
            }),
          )
          .toBe('on the screen')
      }
    })
  }
})

test.describe('a graded run', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  /** Fixes the entropy a graded run draws its seed from, so that the spec knows the seed: the reference's actions are made for it. */
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

  test('hides the cost of an eviction, the prefix a request would reuse and the undo, and says so', async ({ page }) => {
    await open(page, 'evict')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(page.getByLabel('Level', { exact: true }).locator('option:checked')).toHaveText('Level 3 of 7 · Choose what to evict · graded')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await awaitAsk(page, 'admit')
    await expect(page.locator('[data-ask-list="admit"]')).not.toContainText('prefix hit')
    await expect(page.locator('[data-ask-list="admit"]')).not.toContainText('new page')
    await expect(page.getByText('Graded: a fresh seed, no undo, and no costs shown.')).toBeVisible()
  })

  test('is won by the keyboard from the seed the entropy gives, with no cost on any list, and the result passes it', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'evict')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    const level = buildLevel('evict', drawInBand(poolSession, 'evict', ENTROPY))
    let sawEvict = false
    for (const action of houseActions(level)) {
      if (action.t === 'evict') {
        await awaitAsk(page, 'evict')
        sawEvict = true
        await expect(page.locator('[data-ask-list="evict"]')).not.toContainText('cost')
      }
      await take(page, action)
    }
    expect(sawEvict).toBe(true)
    await atTheResult(page, 'Passed')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  })

  test('"New numbers" at the result starts a run of the same level on a fresh seed', async ({ page }) => {
    test.setTimeout(240_000)
    await open(page, 'one-group')
    for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action, { none: 'key', evict: 'key' })
    await atTheResult(page, 'Finished (practice)')
    await page.locator('[data-result]').getByRole('button', { name: 'New numbers' }).click()
    await expect(game(page)).toHaveAttribute('data-level', 'one-group')
    await expect(game(page)).toHaveAttribute('data-seed', String(drawInBand(poolSession, 'one-group', ENTROPY)))
    await awaitAsk(page, 'admit')
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, and the game plays to a verdict', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'one-group')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const actions = houseActions(buildLevel('one-group', 2))
    for (const action of actions.slice(0, 6)) await take(page, action)
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    expect(await page.locator('.es-pool__cell').first().evaluate((cell) => getComputedStyle(cell).transitionDuration)).toMatch(/^0s/)
    for (const action of actions.slice(6)) await take(page, action)
    await atTheResult(page, 'Finished (practice)')
  })
})

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played to its result', async ({ page }) => {
    test.setTimeout(180_000)
    const away: string[] = []
    const refused: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) away.push(url)
    })
    page.on('console', (message) => {
      if (/content security policy|refused to/i.test(message.text())) refused.push(message.text())
    })
    await open(page, 'one-group')
    for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action)
    await atTheResult(page, 'Finished (practice)')
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
    const inBrowser = await page.evaluate(`(async () => {
      const play = await import('/packages/play/index.ts')
      const { poolSession } = await import('/packages/play/pool/session.ts')
      let run = play.startRun(poolSession, { game: 'pool', level: 'evict', seed: 10 })
      for (const action of ${JSON.stringify(actions)}) run = play.applyAction(poolSession, run, action)
      return play.stateHash(run.state)
    })()`)
    expect(inBrowser).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{8}$/)
    expect(expected).toBe('06b88fb1')
  })
})

test.describe('accessibility', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
  const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']

  /** The audit: serious and critical findings fail, and so do the heading rules and `landmark-unique`, whatever their impact. */
  async function audit(page: Page, label: string) {
    await page.evaluate(() => Promise.allSettled(document.getAnimations().map((animation) => animation.finished)))
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
    const summary = (v: (typeof results.violations)[number]) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.slice(0, 3).map((node) => `${node.target.join(' ')} (${node.any[0]?.message ?? node.failureSummary ?? ''}) ${node.html.slice(0, 160)}`).join(' ; ')}`
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map(summary), `${label}: serious or critical violations`).toEqual([])
    expect(results.violations.filter((v) => HEADING_RULES.includes(v.id)).map(summary), `${label}: the heading outline`).toEqual([])
    expect(results.violations.filter((v) => v.id === 'landmark-unique').map(summary), `${label}: the landmarks`).toEqual([])
  }

  for (const width of [360, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test("every level's page, an eviction being chosen, an adapter being asked for, the open table and a result, pass axe", async ({ page }) => {
        test.setTimeout(240_000)
        for (const level of POOL_LEVEL_IDS) {
          await open(page, level)
          await audit(page, `${level} at ${width} px`)
        }
        const fresh = await page.context().newPage()
        await open(fresh, 'one-group', { intro: 'fresh' })
        await expect(fresh.locator('.es-intro')).toBeVisible()
        await audit(fresh, `the first run's parts at ${width} px`)
        if (width >= 1024) {
          await fresh.locator('[data-intro-next]').click()
          await fresh.locator('[data-intro-look]').click()
          await audit(fresh, `the first run's look at ${width} px`)
        }
        await fresh.close()
        await open(page, 'evict')
        const evict = houseActions(buildLevel('evict', 10))
        for (const action of evict.slice(0, evict.findIndex((a) => a.t === 'evict'))) await take(page, action)
        await awaitAsk(page, 'evict')
        await audit(page, `evict, an eviction being chosen, at ${width} px`)
        await open(page, 'adapters')
        const kits = houseActions(buildLevel('adapters', 0))
        for (const action of kits.slice(0, kits.findIndex((a) => a.t === 'prefetch'))) await take(page, action)
        await awaitAsk(page, 'prefetch')
        await page.locator('[data-state-table] summary').click()
        await audit(page, `adapters, an adapter being asked for, the table open, at ${width} px`)
        await open(page, 'one-group')
        await guess(page, buildLevel('one-group', 2).predict.answer)
        for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action)
        await atTheResult(page, 'Finished (practice)')
        await audit(page, `one-group result at ${width} px`)
      })
    })
  }

  test.describe('at 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('no word is cut off at the right edge and the page needs no sideways scroll, on any level (WCAG 1.4.10)', async ({ page }) => {
      test.setTimeout(180_000)
      for (const level of POOL_LEVEL_IDS) {
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
      expect(found.text, 'an eviction being chosen: words past the right edge').toEqual([])
      expect(found.scrolls, 'an eviction being chosen: sideways scroll').toBeLessThanOrEqual(0)
    })
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* 7. The first run and the feedback kit (R-T08)                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const coach = (page: Page) => page.locator('.es-intro')
const predictBox = (page: Page) => page.locator('[data-pool-predict]')

test.describe('the first run', () => {
  test('names the parts before any guess, then the look, the guess and the first move, in under a minute; nothing is modal', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    const level = buildLevel('one-group', 2)
    const first = poolGhost(level).history[0] as Extract<PoolAction, { t: 'admit' }>
    // From the page's first node on, what the dock shows is noted: the parts list, the guess, or neither.
    await page.addInitScript(() => {
      const seen: string[] = []
      ;(window as unknown as { esOrder: string[] }).esOrder = seen
      const note = () => {
        const now = document.querySelector('[data-pool-predict]') !== null ? 'guess' : document.querySelector('.es-intro ol') !== null ? 'parts' : 'none'
        if (now !== seen[seen.length - 1]) seen.push(now)
      }
      new MutationObserver(note).observe(document, { subtree: true, childList: true })
    })
    const started = Date.now()
    await page.goto(`${origin}/play/pool?level=one-group`)
    await expect(coach(page)).toHaveAttribute('data-intro', 'parts')
    // 1. What you are looking at: an ordered list in the dock, numbered as the discs on the drawing, which are decoration.
    const list = coach(page).locator('ol')
    await expect(list.locator('li')).toHaveCount(5)
    await expect(list.locator('li').first()).toContainText('KV page pool')
    await expect(page.locator('[data-intro-callouts]')).toHaveAttribute('aria-hidden', 'true')
    await expect.poll(() => page.locator('[data-intro-callouts] .es-callout').count()).toBeGreaterThanOrEqual(3)
    await expect(predictBox(page)).toHaveCount(0)
    // Not modal: the decision under it is live, nothing is disabled, and Tab leaves the dock.
    expect(await page.locator('[data-ask-list="admit"] button:not(:disabled)').count()).toBeGreaterThan(0)
    await page.locator('[data-intro-next]').focus()
    let left = false
    for (let i = 0; i < 40 && !left; i++) {
      await page.keyboard.press('Tab')
      left = await page.evaluate(() => document.activeElement?.closest('[data-dock]') == null)
    }
    expect(left, 'Tab leaves the dock: focus is not trapped').toBe(true)
    // 2. Look: request 1's popover holds its tokens and its prefix, and not its page count, which the guess asks for.
    await page.locator('[data-intro-next]').click()
    await expect(coach(page)).toHaveAttribute('data-intro', 'look')
    await expect(predictBox(page)).toHaveCount(0)
    await page.locator('[data-intro-look]').click()
    const sheet = page.locator('.es-intro__look .es-pop__panel')
    await expect(sheet).toContainText(/\d+ tokens, conversation A, (no cached prefix|a cached prefix of \d+ tokens?)\./)
    await expect(sheet).not.toContainText('page')
    // Before the guess, a waiting request's row shows its tokens and its prefix, and not its page count.
    await expect(page.locator('[data-ask-list="admit"] li').first()).toContainText('prefix hit')
    await expect(page.locator('[data-ask-list="admit"]')).not.toContainText('new page')
    await page.keyboard.press('Escape')
    await expect(coach(page)).toHaveAttribute('data-intro', 'look')
    // 3. The level's own guess, its field in hand; then the first move, the reference run's first action, carries the ring.
    await page.locator('[data-intro-next]').click()
    await expect(coach(page)).toHaveAttribute('data-intro', 'ask')
    await expect(predictBox(page)).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-pool-predict]') != null)).toBe(true)
    await page.keyboard.type(String(level.predict.answer))
    await page.getByRole('button', { name: 'Commit', exact: true }).click()
    await expect(coach(page)).toHaveAttribute('data-intro', 'point')
    const ringed = page.locator('.es-dock__ring button')
    await expect(ringed).toHaveCount(1)
    await expect(ringed).toHaveAttribute('aria-label', new RegExp(`^Admit request ${(first.req ?? 0) + 1},`))
    await ringed.click()
    await expect(coach(page)).toHaveCount(0)
    const elapsed = Date.now() - started
    expect(elapsed, 'the scripted first run, in ms').toBeLessThan(60_000)
    // No prediction was shown before the parts list had been on screen.
    const order = await page.evaluate(() => (window as unknown as { esOrder: string[] }).esOrder)
    expect(order.indexOf('parts'), order.join(' > ')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('parts'), order.join(' > ')).toBeLessThan(order.indexOf('guess'))
    // The parts it showed are kept, per game.
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('es:intro'))) ?? '{}')).toEqual({ pool: ['pool', 'page', 'waiting', 'batch', 'cost'] })
    // The first rule felt is named once, beside the request; the cost's delta stands beside it for a second, and only there.
    await expect(page.locator('[data-moment="pages-held"]')).toBeVisible()
    await expect(page.locator('[data-live="moment"]')).toContainText(`Request ${(first.req ?? 0) + 1} took`)
    await expect(page.locator('[data-readout-id="recomputed"] .es-strip__delta')).toBeVisible()
    await expect(page.locator('[data-readout-id="evictions"] .es-strip__delta')).toHaveCount(0)
    await expect(page.locator('.es-strip__delta')).toHaveCount(0, { timeout: 3_000 })
  })

  test('Skip intro and Escape end it at any step, and the flag keeps the parts it showed; on a phone Next walks the parts one at a time', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, 'one-group', { intro: 'fresh' })
    await expect(coach(page).locator('ol li:visible')).toHaveCount(1)
    await page.locator('[data-intro-next]').click()
    await expect(coach(page).locator('ol li:visible')).toContainText('A page')
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(coach(page)).toHaveAttribute('data-intro', 'parts')
    await page.locator('[data-intro-skip]').click()
    await expect(coach(page)).toHaveCount(0)
    await expect(predictBox(page)).toBeVisible()
    await page.evaluate(() => localStorage.removeItem('es:intro'))
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-intro-next]').click()
    await expect(coach(page)).toHaveAttribute('data-intro', 'look')
    await page.keyboard.press('Escape')
    await expect(coach(page)).toHaveCount(0)
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('es:intro'))) ?? '{}').pool).toHaveLength(5)
  })

  test('a level whose parts were all met opens none; one new part is the only one called out; How to play replays the whole', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const all = partsOf('two-kinds').map((part) => part.id)
    await page.goto(`${origin}/play/pool?level=two-kinds`, { waitUntil: 'networkidle' })
    await page.evaluate((flag) => localStorage.setItem('es:intro', flag), JSON.stringify({ pool: all.filter((id) => id !== 'sliding') }))
    await page.reload({ waitUntil: 'networkidle' })
    await expect(coach(page).locator('ol li')).toHaveCount(1)
    await expect(coach(page).locator('ol li')).toContainText('Sliding window')
    await page.locator('[data-intro-skip]').click()
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    await expect(coach(page)).toHaveCount(0)
    await expect(predictBox(page)).toBeVisible()
    await page.getByRole('button', { name: 'How to play' }).click()
    await page.locator('[data-intro-replay]').click()
    await expect(coach(page).locator('ol li')).toHaveCount(all.length)
  })

  test('the intro is a chunk of its own, loaded only when it shows', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (request) => {
      if (/\/Intro(\.tsx|-[\w-]+\.js)/.test(request.url())) asked.push(request.url())
    })
    await open(page, 'one-group')
    await page.waitForTimeout(300)
    expect(asked, 'with every part met').toEqual([])
    await page.evaluate(() => localStorage.removeItem('es:intro'))
    const fresh = await page.context().newPage()
    fresh.on('request', (request) => {
      if (/\/Intro(\.tsx|-[\w-]+\.js)/.test(request.url())) asked.push(request.url())
    })
    await fresh.goto(`${origin}/play/pool?level=one-group`, { waitUntil: 'networkidle' })
    await expect(fresh.locator('.es-intro')).toBeVisible()
    expect(asked.length).toBeGreaterThan(0)
  })

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} x ${height} the intro's Next, the diagram and the readout share the first screen`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await open(page, 'one-group', { intro: 'fresh' })
      await expect(coach(page)).toBeVisible()
      expect(await inView(page, '[data-intro-next]')).toEqual({ diagram: true, control: true, readout: true, scrolled: 0 })
    })
  }

  test('a level the ledger says was played has its parts met, and the result draws the reference hollow, with Run again’s difference and your best', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, 'one-group')
    await page.getByRole('button', { name: 'Skip the guess' }).click()
    for (const action of houseActions(buildLevel('one-group', 2))) await take(page, action, { none: 'key', evict: 'key' })
    await atTheResult(page, 'Finished (practice)')
    await expect(page.locator('[data-result] [data-versus] [data-run="reference"]').first()).toBeAttached()
    await expect(page.locator('[data-run-again]')).toContainText("Run again: you matched the reference's cost")
    await expect(page.locator('[data-run-again]')).toContainText('Your best on this level: 1.00')
    // The flag is lost, and the ledger still says the level was played: its parts are met, so no intro opens.
    await page.evaluate(() => localStorage.removeItem('es:intro'))
    await page.goto(`${origin}/play/pool?level=one-group`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await expect(coach(page)).toHaveCount(0)
    await expect(predictBox(page)).toBeVisible()
  })

  test.describe('under reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })
    test('nothing pulses or animates in the intro, the moments or the deltas', async ({ page }) => {
      await open(page, 'one-group', { intro: 'fresh' })
      await expect(coach(page)).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
      await page.locator('[data-intro-skip]').click()
      await page.getByRole('button', { name: 'Skip the guess' }).click()
      await page.locator('[data-ask-list="admit"] button:not(:disabled)').first().click()
      await expect(page.locator('[data-moment]')).toBeVisible()
      expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    })
  })
})
