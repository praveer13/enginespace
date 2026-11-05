/*
 * The Tasting (`verifier`) in a browser: the walks that `verify:games` lists for every game and cannot run itself (A§6.2, A§6.8, A§6.9,
 * GAMES.md §2.5), and W1-T28's first acceptance check: "the game can be completed by keyboard".
 *
 *   1. A keyboard-only walk plays every level to its debrief, and wins it: Tab reaches the level's own control, digits and the arrow keys
 *      set a weight or a prediction, Enter commits or submits, and focus moves on to the control that begins the next decision (and, at the
 *      end, to the way into the debrief).
 *   2. The game's keys: `D` and `.` draw rounds, `,` takes a move back in practice, Enter submits from a weight field, `?` lists the keys and
 *      Escape gives focus back. A tap on a dish's column in the drawing focuses that dish's weight.
 *   3. A graded run hides what a practice run shows (the decomposition, the live meter, the presets, the draws and the undo), and is still
 *      won by the keyboard from the numbers it does print.
 *   4. Reduced motion: nothing animates, and the game plays.
 *   5. Nothing leaves the origin (ARCHITECTURE §1, I1).
 *   6. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10), draws included.
 *   7. axe finds no serious or critical violation on the game's pages at 360 and 1280 px, and nothing is cut off at the right edge at 320
 *      (WCAG 1.4.10).
 *
 * How it runs. The spec starts the app's own Vite dev server on a free port, so it needs no build and no preview server, and drives
 * `/play/verifier` in whichever browser Playwright launches. Run it with `npx playwright test e2e/verifier.spec.ts`. With ES_E2E_ORIGIN
 * set to the address of `vite preview` (after `npm run build`), it drives the built site instead, under the page's content security policy.
 */
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { applyAction, startRun, stateHash } from '../packages/play'
import { buildLevel } from '../packages/play/verifier/levels'
import { verifierSession } from '../packages/play/verifier/session'
import { excessPlates, keptPlates, sweepOfLevel, tokensOf } from '../packages/play/verifier/state'
import { MUTANT_IDS } from '../packages/play/verifier/types'
import type { VerifierAction } from '../packages/play/verifier/types'
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

const game = (page: Page) => page.locator('section[data-game="verifier"]')
const live = (page: Page) => page.locator('[data-live="line"]')
const outcome = (page: Page) => page.locator('[data-live="outcome"]')
const verdict = (page: Page) => page.locator('[data-verifier-debrief] h3').first()
/** What a reader would call the focused control: its aria-label, its label, or its text. */
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null
    if (element === null) return ''
    const named = element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? element.tagName
    return named.trim().replace(/\s+/g, ' ')
  })

async function open(page: Page, level: string) {
  await page.goto(`${origin}/play/verifier?level=${level}`, { waitUntil: 'networkidle' })
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

/** Types a recipe into the six weight fields with the keyboard alone: digits, and the right arrow to the next dish. */
async function typeRecipe(page: Page, recipe: readonly number[]) {
  await tabTo(page, /^Recipe weight for soup$/)
  for (const [token, weight] of recipe.entries()) {
    await page.keyboard.type(String(weight))
    if (token < recipe.length - 1) await page.keyboard.press('ArrowRight')
  }
}

/** Reads the chef's tasting and the commis's plates off the mirror, as a reader of the page does, for a graded run whose seed is the page's. */
async function readPlates(page: Page): Promise<{ p: number[]; q: number[] }> {
  const rows = page.locator('[data-mirror] table').first().locator('tbody tr')
  const p: number[] = []
  const q: number[] = []
  for (let i = 0; i < (await rows.count()); i++) {
    p.push(Number((await rows.nth(i).locator('td[data-label="p"]').innerText()).trim()))
    q.push(Number((await rows.nth(i).locator('td[data-label="q"]').innerText()).trim()))
  }
  return { p, q }
}

async function endWithTheDebrief(page: Page) {
  // Focus has moved on its own to the way into the debrief, which is one key away.
  await expect.poll(() => activeName(page)).toBe('See the debrief')
  await page.keyboard.press('Enter')
  await expect(verdict(page)).toHaveText('Well tasted.')
}

test.describe('a keyboard-only walk wins every level', () => {
  test('`overlap`: Tab to the field, digits, Enter to commit, draw with Enter, Finish, and the debrief', async ({ page }) => {
    await open(page, 'overlap')
    await tabTo(page, /^Plates kept$/)
    await page.keyboard.type(String(keptPlates(buildLevel('overlap', 0))))
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Committed: 38 plates kept.')
    // Focus moves to the first batch of rounds, which is the next thing to do.
    await expect.poll(() => activeName(page)).toBe('Draw 10')
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Drew 10 rounds')
    await tabTo(page, /^Draw 100$/, 3)
    await tabTo(page, /^Draw 1,000$/, 3)
    await tabTo(page, /^Finish$/, 3)
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await endWithTheDebrief(page)
  })

  test('`exact`: the weights, dish by dish with the arrow keys, are the residual, and Enter submits', async ({ page }) => {
    await open(page, 'exact')
    const residual = excessPlates(buildLevel('exact', 0))
    await typeRecipe(page, residual)
    await expect(live(page)).toContainText("What goes out is the chef's tasting exactly.")
    await expect(page.locator('.es-station[data-state="lit"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
    await endWithTheDebrief(page)
    await expect(page.getByText('Your recipe against the house')).toBeVisible()
  })

  test('`exact`: a recipe that is not the residual is refused the pass, and the debrief names the dish furthest out', async ({ page }) => {
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start from p' }).focus()
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Distance from her tasting 133/1024.')
    await page.getByRole('button', { name: 'Submit the recipe' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => activeName(page)).toBe('See the debrief')
    await page.keyboard.press('Enter')
    await expect(verdict(page)).toHaveText('Taste it again.')
    await expect(page.getByText('The dish furthest out is the soup.')).toBeVisible()
  })

  test('`chain`: a number to the thousandth, within 1% of the exact courses per round', async ({ page }) => {
    await open(page, 'chain')
    const truth = tokensOf(buildLevel('chain', 1))
    await tabTo(page, /^Courses per round$/)
    await page.keyboard.type((Number(truth.num) / Number(truth.den)).toFixed(3))
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Prediction committed.')
    await expect.poll(() => activeName(page)).toBe('Draw 10')
    await tabTo(page, /^Finish$/, 4)
    await page.keyboard.press('Enter')
    await endWithTheDebrief(page)
    await expect(page.getByText('78561/32768')).toBeVisible()
  })

  test('`greedy-ngram`: the temperature-0 question with Enter, and then the recipe is p with the copied dish taken out', async ({ page }) => {
    await open(page, 'greedy-ngram')
    const level = buildLevel('greedy-ngram', 0)
    if (level.id !== 'greedy-ngram') throw new Error('not the copier level')
    const favourite = level.p[0].indexOf(Math.max(...level.p[0]))
    await tabTo(page, level.draft === favourite ? /^Kept$/ : /^Sent back$/)
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText(level.draft === favourite ? 'You called it kept.' : 'You called it sent back.')
    // Focus moved to the first weight, so the recipe is typed from where it is.
    await expect.poll(() => activeName(page)).toBe('Recipe weight for soup')
    const recipe = level.p[0].map((w, x) => (x === level.draft ? 0 : w))
    for (const [token, weight] of recipe.entries()) {
      await page.keyboard.type(String(weight))
      if (token < recipe.length - 1) await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('Enter')
    await endWithTheDebrief(page)
  })

  test('`mutants`: both instruments from the keyboard, each card named with the arrow keys on its list, and the five names submitted', async ({ page }) => {
    await open(page, 'mutants')
    const level = buildLevel('mutants', 0)
    if (level.id !== 'mutants') throw new Error('not the mutants level')
    await tabTo(page, /^Taste 20,000$/)
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Card 1 tasted:')
    await tabTo(page, /^Check every coin$/, 3)
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Card 1:')
    for (const [card, bug] of level.cards.entries()) {
      await tabTo(page, new RegExp(`^Name the bug of card ${card + 1}$`), 8)
      for (let press = 0; press <= MUTANT_IDS.indexOf(bug); press++) await page.keyboard.press('ArrowDown')
    }
    await expect(page.getByRole('button', { name: 'Submit the five names' })).toBeEnabled()
    await tabTo(page, /^Submit the five names$/, 3)
    await page.keyboard.press('Enter')
    await endWithTheDebrief(page)
  })

  test('`gamma`: the up arrow steps the draft length, a digit sets it, and Enter serves it', async ({ page }) => {
    await open(page, 'gamma')
    const best = sweepOfLevel(buildLevel('gamma', 0)).best
    await tabTo(page, /^Draft length, plates ahead$/)
    await page.keyboard.press('ArrowUp')
    await expect(live(page)).toContainText('Plating 1 course ahead.')
    await page.keyboard.type(String(best))
    await expect(live(page)).toContainText(`Plating ${best} courses ahead.`)
    await page.keyboard.press('Enter')
    await endWithTheDebrief(page)
    await expect(page.getByText('Every draft length, in courses per tasting')).toBeVisible()
  })

  test('the last level\'s debrief offers the course map, and Next keeps focus in the game', async ({ page }) => {
    await open(page, 'overlap')
    await tabTo(page, /^Plates kept$/)
    await page.keyboard.type('38')
    await page.keyboard.press('Enter')
    await tabTo(page, /^Finish$/, 5)
    await page.keyboard.press('Enter')
    await endWithTheDebrief(page)
    await page.getByRole('button', { name: 'Next: Make it exact' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('verifier')
    await expect(page.locator('[data-game="verifier"] .es-tape').first()).toContainText('Make it exact · practice')
  })
})

test.describe('the keys of the game', () => {
  test('`D` and `.` draw rounds, `,` takes the last move back, and `?` lists the keys, with Escape giving focus back', async ({ page }) => {
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start from p' }).click()
    await game(page).focus()
    await page.keyboard.press('KeyD')
    await expect(live(page)).toContainText('Drew 20 rounds')
    await page.keyboard.press('Period')
    await expect(live(page)).toContainText('Drew 1 round:')
    await page.keyboard.press('Comma')
    await expect(live(page)).toContainText('Undid the last move.')
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog')
    await expect(keys).toBeVisible()
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', 'C', 'V', '?', 'D', 'Enter'])
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('verifier')
  })

  test('Enter from the game itself submits a recipe that is whole, and does nothing while it is empty', async ({ page }) => {
    await open(page, 'exact')
    await game(page).focus()
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('')
    await page.getByRole('button', { name: 'Start from q' }).click()
    await game(page).focus()
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
  })

  test('the arrow keys, plus and minus, and Page Up and Down move a weight, and a tap on a dish\'s column hands focus to its weight', async ({ page }) => {
    await open(page, 'exact')
    await tabTo(page, /^Recipe weight for soup$/)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByLabel('Recipe weight for soup', { exact: true })).toHaveValue('2')
    await page.keyboard.press('Equal')
    await expect(page.getByLabel('Recipe weight for soup', { exact: true })).toHaveValue('3')
    await page.keyboard.press('Minus')
    await page.keyboard.press('PageUp')
    await expect(page.getByLabel('Recipe weight for soup', { exact: true })).toHaveValue('10')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('PageDown')
    await expect(page.getByLabel('Recipe weight for soup', { exact: true })).toHaveValue('0')
    await page.keyboard.press('ArrowRight')
    expect(await activeName(page)).toBe('Recipe weight for salad')
    // The tap targets are the 2D drawing's (the 3D scene's own pick is its dish's tape, e2e/verifier-scene.spec.ts): on a device that draws
    // 3D the page opens on the scene, so the drawing is asked for first.
    if ((await page.locator('section[data-game="verifier"]').getAttribute('data-view')) === '3d') await page.getByRole('button', { name: '2D view' }).click()
    await page.locator('[data-tap="2"]').click()
    expect(await activeName(page)).toBe('Recipe weight for fish')
    // A plate with a thumb on it adds one, and never goes below none.
    await page.getByRole('button', { name: 'Add one to steak' }).click()
    await expect(page.getByLabel('Recipe weight for steak', { exact: true })).toHaveValue('1')
    await expect(page.getByRole('button', { name: 'Take one from soup' })).toBeDisabled()
  })
})

test.describe('a graded run', () => {
  test('hides the decomposition, the live meter, the presets, the draws and the undo, and is won from the numbers it prints', async ({ page }) => {
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(page.locator('[data-game="verifier"] .es-tape').first()).toContainText('Make it exact · graded')
    for (const hidden of ['Undo', 'Start from p', 'Start from q', 'Draw 10']) await expect(page.getByRole('button', { name: hidden })).toHaveCount(0)
    await expect(game(page)).not.toContainText('agreed')
    await expect(game(page)).not.toContainText('Distance from')
    await expect(page.locator('td[data-label="min(p, q)"]')).toHaveCount(0)
    await expect(game(page)).toContainText('A graded run: fresh numbers, no undo, no live meter, one submission.')
    const { p, q } = await readPlates(page)
    expect(p.reduce((a, b) => a + b, 0)).toBe(64)
    expect(q.reduce((a, b) => a + b, 0)).toBe(64)
    // The learner works the residual out of p and q, and no more: the page printed neither the overlap nor the excess.
    await typeRecipe(page, p.map((px, x) => Math.max(0, px - q[x])))
    await page.keyboard.press('Enter')
    await endWithTheDebrief(page)
  })

  test('a graded run is refused its pass on a recipe that is close, and the run cannot be taken back', async ({ page }) => {
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    const { p, q } = await readPlates(page)
    const residual = p.map((px, x) => Math.max(0, px - q[x]))
    const heavy = residual.indexOf(Math.max(...residual))
    await typeRecipe(page, residual.map((w, x) => (x === heavy ? w + 1 : w)))
    await page.keyboard.press('Enter')
    await expect.poll(() => activeName(page)).toBe('See the debrief')
    await page.keyboard.press('Enter')
    await expect(verdict(page)).toHaveText('Taste it again.')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, the printer feeds without a motion, and the game plays to a verdict', async ({ page }) => {
    await open(page, 'exact')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await page.getByRole('button', { name: 'Start from p' }).click()
    await page.getByRole('button', { name: 'Draw 100', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-printer__feed') as Element).animationDuration)).toBe('0.001s')
    await typeRecipe(page, excessPlates(buildLevel('exact', 0)))
    await page.keyboard.press('Enter')
    await endWithTheDebrief(page)
  })
})

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played to its debrief', async ({ page }) => {
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
    await open(page, 'mutants')
    await page.getByRole('button', { name: /^Taste/ }).first().click()
    await page.getByRole('button', { name: 'Start a graded run' }).count()
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start from q' }).click()
    await page.getByRole('button', { name: 'Submit the recipe' }).click()
    await page.getByRole('button', { name: 'See the debrief' }).click()
    await expect(verdict(page)).toBeVisible()
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism', () => {
  const actions: VerifierAction[] = [
    { t: 'sculpt', token: 0, delta: 7 },
    { t: 'sculpt', token: 2, delta: 6 },
    { t: 'sculpt', token: 5, delta: 2 },
    { t: 'draw', n: 1000 },
    { t: 'submit' },
  ]

  test('the same seed and the same actions give the same state hash in the browser as under Node, a thousand rounds drawn included', async ({ page }) => {
    test.skip(built, 'the page imports the sources, which only the dev server serves')
    let run = startRun(verifierSession, { game: 'verifier', level: 'exact', seed: 0 })
    for (const action of actions) run = applyAction(verifierSession, run, action)
    const expected = stateHash(run.state)
    await open(page, 'overlap')
    // The page imports the same modules from the dev server and runs the same actions. The script is a string, so that nothing in
    // Playwright's transform of this file touches the imports.
    const inBrowser = await page.evaluate(`(async () => {
      const play = await import('/packages/play/index.ts')
      const { verifierSession } = await import('/packages/play/verifier/session.ts')
      let run = play.startRun(verifierSession, { game: 'verifier', level: 'exact', seed: 0 })
      for (const action of ${JSON.stringify(actions)}) run = play.applyAction(verifierSession, run, action)
      return play.stateHash(run.state)
    })()`)
    expect(inBrowser).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{8}$/)
    expect(expected).toBe('b93c6fba')
  })
})

test.describe('accessibility', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
  const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']

  /** The audit: serious and critical findings fail, and so do the heading rules, whatever their impact. */
  async function audit(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
    const summary = (v: (typeof results.violations)[number]) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map(summary), `${label}: serious or critical violations`).toEqual([])
    expect(results.violations.filter((v) => HEADING_RULES.includes(v.id)).map(summary), `${label}: the heading outline`).toEqual([])
  }

  for (const width of [360, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('every level\'s page, in practice and graded, and a debrief, pass axe', async ({ page }) => {
        test.setTimeout(180_000)
        for (const level of ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma']) {
          await open(page, level)
          await audit(page, `${level} at ${width} px`)
        }
        await open(page, 'exact')
        await page.getByRole('button', { name: 'Start from p' }).click()
        await page.getByRole('button', { name: 'Draw 100', exact: true }).click()
        await audit(page, `exact, drawn, at ${width} px`)
        await page.getByRole('button', { name: 'Start a graded run' }).click()
        await audit(page, `exact, graded, at ${width} px`)
        await open(page, 'mutants')
        await page.getByRole('button', { name: /^Taste/ }).first().click()
        await page.getByRole('button', { name: 'Check every coin' }).first().click()
        await audit(page, `mutants, tasted, at ${width} px`)
        await open(page, 'exact')
        await page.getByRole('button', { name: 'Start from q' }).click()
        await page.getByRole('button', { name: 'Submit the recipe' }).click()
        await page.getByRole('button', { name: 'See the debrief' }).click()
        await expect(verdict(page)).toBeVisible()
        await audit(page, `exact debrief at ${width} px`)
      })
    })
  }

  test.describe('at 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('no word is cut off at the right edge and the page needs no sideways scroll, on any level (WCAG 1.4.10)', async ({ page }) => {
      test.setTimeout(120_000)
      for (const level of ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma']) {
        await open(page, level)
        const found = await clipped(page, '[data-game="verifier"]')
        expect(found.text, `${level}: words past the right edge`).toEqual([])
        expect(found.scrolls, `${level}: sideways scroll`).toBeLessThanOrEqual(0)
      }
      await open(page, 'exact')
      await page.getByRole('button', { name: 'Start from q' }).click()
      await page.getByRole('button', { name: 'Submit the recipe' }).click()
      await page.getByRole('button', { name: 'See the debrief' }).click()
      const debrief = await clipped(page, '[data-verifier-debrief]')
      expect(debrief.text, 'the debrief, past the right edge').toEqual([])
    })
  })
})
