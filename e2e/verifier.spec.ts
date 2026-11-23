/*
 * The rejection sampler (`verifier`) in a browser, in the instrument frame (R-T30; REDESIGN §2.6, §2.9): the walks that `verify:games` lists
 * for every game and cannot run itself (A§6.2, A§6.8, A§6.9, GAMES.md §2.5), and W1-T28's first acceptance check: "the game can be
 * completed by keyboard".
 *
 *   1. A keyboard-only walk plays every level to its result, and wins it: Tab reaches the level's own control, digits and the arrow keys
 *      set a weight or a prediction, Enter commits or submits, and focus moves on to the control that begins the next decision (and, at the
 *      end, to the result's verdict).
 *   2. The game's keys: `D` and `.` draw rounds, `,` takes a move back in practice, Enter submits a weight, `?` lists the keys and Escape
 *      gives focus back. A tap on a token's column in the diagram focuses that token's weight.
 *   3. A graded run hides what a practice run shows (the decomposition, the live meter, the presets, the draws and the undo), and is still
 *      won by the keyboard from the numbers it does print.
 *   4. The diagram: 2D is the default and 3D one switch away; the bars carry the four labels, each with its colour and glyph, and the six
 *      tokens are numbered 0 to 5; the words draft and target are on screen on every level.
 *   5. The first run: on `overlap` and on `chain`, the parts list names what the level draws, then a look at one token's bars, then the level's
 *      own ask, which cannot be skipped and says why; the move pointed at is one that gives no answer away. The draws of 10, 100 and 1,000
 *      settle on the overlap, and the moment is named once.
 *   6. P5: at 1440 x 900 and 390 x 844 the bars, the current control and the readout share the viewport.
 *   7. Reduced motion: nothing animates, and the game plays.
 *   8. Nothing leaves the origin (ARCHITECTURE §1, I1), and no banned word is on the page (src/copy/banned.ts).
 *   9. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10), draws included.
 *  10. axe finds no serious or critical violation on the game's pages at 360 and 1280 px, and nothing is cut off at the right edge at 320
 *      (WCAG 1.4.10).
 *  11. Prove mode (W2b-T42, ASSESSMENT §7.2): the panel takes the attestation by keyboard before any game is drawn, the run's seed is drawn
 *      as it starts, the readouts are hidden until the result, a pass is recorded as proved and closes the window for 24 hours, and a
 *      failed attempt is played again at once on fresh numbers at practice weight. Sections 8 and 10 read the panel and the run too.
 *
 * Every walk but section 5's opens the page as a learner who has met every part (the intro flag holds them all), so that its own first run
 * does not stand in the way; section 5 opens it as a learner who has met none.
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
import { VERIFIER_PARTS, partsOf } from '../packages/play/verifier/copy'
import { MUTANT_IDS } from '../packages/play/verifier/types'
import type { VerifierAction } from '../packages/play/verifier/types'
import { findBanned } from '../src/copy/banned'
import { SLOT_MARKS } from '../src/design/code'
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
const verdict = (page: Page) => page.locator('[data-result] [data-result-heading]')
/** What a reader would call the focused control: its aria-label, its label, or its text. */
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null
    if (element === null) return ''
    const named = element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? element.tagName
    return named.trim().replace(/\s+/g, ' ')
  })

/** Every part of the game, as the intro flag keeps them once shown: a learner who has met them all. */
const MET = JSON.stringify({ verifier: VERIFIER_PARTS.map((part) => part.id) })

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

/** Types the weights into the six weight fields with the keyboard alone: digits, and the right arrow to the next token. */
async function typeRecipe(page: Page, recipe: readonly number[]) {
  await tabTo(page, /^Resample weight for token 0$/)
  for (const [token, weight] of recipe.entries()) {
    await page.keyboard.type(String(weight))
    if (token < recipe.length - 1) await page.keyboard.press('ArrowRight')
  }
}

/** Reads the target's p and the draft's q off the table, as a reader of the page does, for a graded run whose seed is the page's. */
async function readPlates(page: Page): Promise<{ p: number[]; q: number[] }> {
  await page.locator('[data-state-table] summary').click()
  const rows = page.locator('[data-mirror] table').first().locator('tbody tr')
  const p: number[] = []
  const q: number[] = []
  for (let i = 0; i < (await rows.count()); i++) {
    p.push(Number((await rows.nth(i).locator('td[data-label="p"]').innerText()).trim()))
    q.push(Number((await rows.nth(i).locator('td[data-label="q"]').innerText()).trim()))
  }
  return { p, q }
}

/** The run is over: focus is on the verdict, which reads as the grade says. */
async function atTheResult(page: Page, word: 'Passed' | 'Not yet' | 'Finished (practice)') {
  await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
  await expect(verdict(page)).toHaveText(word)
  await expect.poll(() => activeName(page)).toBe(word)
}

test.describe('a keyboard-only walk wins every level', () => {
  test('`overlap`: Tab to the field, digits, Enter to commit, draw with Enter, Finish, and the result', async ({ page }) => {
    await open(page, 'overlap')
    await tabTo(page, /^Accepted, in sixty-fourths$/)
    await page.keyboard.type(String(keptPlates(buildLevel('overlap', 0))))
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Committed: 38 of 64 accepted.')
    // Focus moves to the first batch of rounds, which is the next thing to do.
    await expect.poll(() => activeName(page)).toBe('Draw 10')
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Drew 10 rounds')
    await tabTo(page, /^Draw 100$/, 3)
    await tabTo(page, /^Draw 1,000$/, 3)
    await tabTo(page, /^Finish$/, 3)
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Finished (practice)')
  })

  test('`exact`: the weights, token by token with the arrow keys, are the residual, and Enter submits', async ({ page }) => {
    await open(page, 'exact')
    const residual = excessPlates(buildLevel('exact', 0))
    await typeRecipe(page, residual)
    await expect(live(page)).toContainText('The output is p exactly.')
    await expect(page.locator('.es-busy[data-state="lit"]')).toBeVisible()
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Passed')
    await expect(page.getByText("Your weights against the reference's")).toBeVisible()
  })

  test('`exact`: weights that are not the residual are refused the pass, and the result names the token furthest out', async ({ page }) => {
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start from p' }).focus()
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Distance from p 133/1024.')
    await page.getByRole('button', { name: 'Submit the weights' }).focus()
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Not yet')
    await expect(page.locator('[data-vf-furthest]')).toContainText('token 0')
  })

  test('`chain`: a number to the thousandth, within 1% of the exact tokens per round', async ({ page }) => {
    await open(page, 'chain')
    const truth = tokensOf(buildLevel('chain', 1))
    await tabTo(page, /^Tokens per round$/)
    await page.keyboard.type((Number(truth.num) / Number(truth.den)).toFixed(3))
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Prediction committed.')
    await expect.poll(() => activeName(page)).toBe('Draw 10')
    await tabTo(page, /^Finish$/, 4)
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Passed')
    await expect(page.getByText('78561/32768').first()).toBeVisible()
  })

  test('`greedy-ngram`: the temperature-0 question with Enter, and then the weights are p with the drafted token taken out', async ({ page }) => {
    await open(page, 'greedy-ngram')
    const level = buildLevel('greedy-ngram', 0)
    if (level.id !== 'greedy-ngram') throw new Error('not the copier level')
    const favourite = level.p[0].indexOf(Math.max(...level.p[0]))
    await tabTo(page, level.draft === favourite ? /^Accepted$/ : /^Rejected$/)
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText(level.draft === favourite ? 'You said it is accepted.' : 'You said it is rejected.')
    // Focus moved to the first weight, so the weights are typed from where it is.
    await expect.poll(() => activeName(page)).toBe('Resample weight for token 0')
    const recipe = level.p[0].map((w, x) => (x === level.draft ? 0 : w))
    for (const [token, weight] of recipe.entries()) {
      await page.keyboard.type(String(weight))
      if (token < recipe.length - 1) await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Finished (practice)')
  })

  test('`mutants`: both instruments from the keyboard, each card named with the arrow keys on its list, and the five names submitted', async ({ page }) => {
    await open(page, 'mutants')
    const level = buildLevel('mutants', 0)
    if (level.id !== 'mutants') throw new Error('not the mutants level')
    await tabTo(page, /^Sample 20,000$/)
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Card 1 sampled:')
    await tabTo(page, /^Check every draw$/, 3)
    await page.keyboard.press('Enter')
    await expect(live(page)).toContainText('Card 1:')
    for (const [card, bug] of level.cards.entries()) {
      await tabTo(page, new RegExp(`^Name the bug of card ${card + 1}$`), 8)
      for (let press = 0; press <= MUTANT_IDS.indexOf(bug); press++) await page.keyboard.press('ArrowDown')
    }
    await expect(page.getByRole('button', { name: 'Submit the five names' })).toBeEnabled()
    await tabTo(page, /^Submit the five names$/, 3)
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Finished (practice)')
  })

  test('`gamma`: the up arrow steps the draft length, a digit sets it, and Enter submits it', async ({ page }) => {
    await open(page, 'gamma')
    const best = sweepOfLevel(buildLevel('gamma', 0)).best
    await tabTo(page, /^Draft length, tokens proposed$/)
    await page.keyboard.press('ArrowUp')
    await expect(live(page)).toContainText('Drafting 1 token a round.')
    await page.keyboard.type(String(best))
    await expect(live(page)).toContainText(`Drafting ${best} tokens a round.`)
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Passed')
    await expect(page.getByText('Every draft length, in tokens per round')).toBeVisible()
  })

  test('Next level keeps focus in the game, and the level menu names the level it opened', async ({ page }) => {
    await open(page, 'overlap')
    await tabTo(page, /^Accepted, in sixty-fourths$/)
    await page.keyboard.type('38')
    await page.keyboard.press('Enter')
    await tabTo(page, /^Finish$/, 5)
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Finished (practice)')
    await page.getByRole('button', { name: 'Next level: Resample from the residual' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('verifier')
    await expect(game(page).locator('.es-level__face')).toContainText('Resample from the residual')
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
    // The recipe level has one draft position and no 3D view, so its list has no view or camera key.
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', '?', 'D', 'Enter'])
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('verifier')
  })

  test('Enter from the game itself submits weights that are whole, and does nothing while they are empty', async ({ page }) => {
    await open(page, 'exact')
    await game(page).focus()
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('')
    await page.getByRole('button', { name: 'Start from q' }).click()
    await game(page).focus()
    await page.keyboard.press('Enter')
    await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
  })

  test('the arrow keys, plus and minus, and Page Up and Down move a weight, and a tap on a token\'s column hands focus to its weight', async ({ page }) => {
    // The buttons beside each field are for a thumb on a desk-sized screen; on a phone the fields are typed or tapped on their columns.
    await page.setViewportSize({ width: 1280, height: 900 })
    await open(page, 'exact')
    await tabTo(page, /^Resample weight for token 0$/)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByLabel('Resample weight for token 0', { exact: true })).toHaveValue('2')
    await page.keyboard.press('Equal')
    await expect(page.getByLabel('Resample weight for token 0', { exact: true })).toHaveValue('3')
    await page.keyboard.press('Minus')
    await page.keyboard.press('PageUp')
    await expect(page.getByLabel('Resample weight for token 0', { exact: true })).toHaveValue('10')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('PageDown')
    await expect(page.getByLabel('Resample weight for token 0', { exact: true })).toHaveValue('0')
    await page.keyboard.press('ArrowRight')
    expect(await activeName(page)).toBe('Resample weight for token 1')
    // The tap targets are the diagram's (the 3D scene's own pick is its token's tape, e2e/verifier-scene.spec.ts): the diagram is the default.
    await page.locator('[data-vf-token="2"][data-tap]').click()
    expect(await activeName(page)).toBe('Resample weight for token 2')
    // A button with a thumb on it adds one, and never goes below none.
    await page.getByRole('button', { name: 'Add one to token 3' }).click()
    await expect(page.getByLabel('Resample weight for token 3', { exact: true })).toHaveValue('1')
    await expect(page.getByRole('button', { name: 'Take one from token 0' })).toBeDisabled()
  })
})

test.describe('a graded run', () => {
  test('hides the decomposition, the live meter, the presets, the draws and the undo, and is won from the numbers it prints', async ({ page }) => {
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(game(page).locator('.es-level__face')).toContainText('Resample from the residual')
    await expect(game(page)).toContainText('graded')
    for (const hidden of ['Undo', 'Start from p', 'Start from q', 'Draw 10']) await expect(page.getByRole('button', { name: hidden })).toHaveCount(0)
    await expect(game(page)).not.toContainText('accepted min(p, q)')
    await expect(page.locator('[data-vf-readout]')).not.toContainText('distance from p')
    await expect(page.locator('td[data-label="min(p, q)"]')).toHaveCount(0)
    await expect(game(page)).toContainText('Graded: fresh numbers, no undo, no live distance, one submission.')
    const { p, q } = await readPlates(page)
    expect(p.reduce((a, b) => a + b, 0)).toBe(64)
    expect(q.reduce((a, b) => a + b, 0)).toBe(64)
    // The learner works the residual out of p and q, and no more: the page printed neither the overlap nor the excess.
    await typeRecipe(page, p.map((px, x) => Math.max(0, px - q[x])))
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Passed')
  })

  test('a graded run is refused its pass on weights that are close, and the run cannot be taken back', async ({ page }) => {
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    const { p, q } = await readPlates(page)
    const residual = p.map((px, x) => Math.max(0, px - q[x]))
    const heavy = residual.indexOf(Math.max(...residual))
    await typeRecipe(page, residual.map((w, x) => (x === heavy ? w + 1 : w)))
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Not yet')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  })
})

/** Opens `exact` in Prove mode (W2b-T42, ASSESSMENT §7.2), as a learner who has met every part, and waits for the ledger's answer. */
async function openProve(page: Page) {
  await page.addInitScript((flag) => {
    try {
      localStorage.setItem('es:intro', flag)
    } catch {
      // No storage: the intro shows, and the walk Tabs past it.
    }
  }, MET)
  await page.goto(`${origin}/play/verifier?mode=prove`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('[data-prove-panel]')).toBeVisible()
  await expect(page.locator('[data-prove-panel]')).not.toHaveAttribute('data-stake', 'reading')
}

/** Ticks the attestation and starts the Prove run, by keyboard alone: Tab to the box, Space, Tab to Start, Enter. */
async function startProve(page: Page) {
  await expect(game(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start the Prove run' })).toBeDisabled()
  await tabTo(page, /^My coding agent and any AI chat are closed\.$/)
  await page.keyboard.press('Space')
  await tabTo(page, /^Start the Prove run$/, 3)
  await page.keyboard.press('Enter')
  await expect(game(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.matches('section[data-game]') ?? false)).toBe(true)
}

const seedOf = async (page: Page) => Number(await game(page).getAttribute('data-seed'))

/** Ends a Prove run on whatever a weight of one on token 0 makes of it, and waits for the note on what the attempt was worth. */
async function submitAnyWeights(page: Page) {
  await page.getByLabel('Resample weight for token 0', { exact: true }).fill('1')
  await page.getByRole('button', { name: 'Submit the weights' }).click()
  await expect(page.locator('[data-prove-after]')).toBeVisible()
}

test.describe('Prove mode (ASSESSMENT §7.2)', () => {
  test('by keyboard: the attestation, a graded run on fresh numbers with the readouts hidden, a pass recorded as proved, and the window closed', async ({ page }) => {
    await openProve(page)
    await expect(page.locator('[data-prove-stake]')).toHaveText('This attempt counts, pass or miss. A pass is recorded as proved; a miss uses up the day.')
    await startProve(page)
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(game(page)).toHaveAttribute('data-level', 'exact')
    await expect(game(page).locator('[data-level-words]')).toHaveText('Resample from the residual · Prove run')
    // The readouts are hidden until the result; the drawing and the table are not.
    await expect(page.locator('[data-readout-hidden]')).toHaveText('Readouts are hidden until your answer is in.')
    await expect(page.locator('[data-vf-readout]')).toHaveCount(0)
    await expect(page.locator('[data-prove-foot]')).toContainText('This attempt counts.')
    await expect(page.getByRole('button', { name: 'Start a graded run' })).toHaveCount(0)
    const { p, q } = await readPlates(page)
    await typeRecipe(page, p.map((px, x) => Math.max(0, px - q[x])))
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Passed')
    await expect(page.locator('[data-prove-after]')).toHaveAttribute('data-prove-after', 'proved')
    await expect(page.locator('[data-prove-after]')).toContainText('Proved, with your agent closed.')
    await expect(page.locator('[data-vf-readout]')).toBeVisible()
    // The ledger holds the attempt: a Prove run now counts as practice until 24 hours have passed.
    await openProve(page)
    await expect(page.locator('[data-prove-panel]')).toHaveAttribute('data-stake', 'practice')
    await expect(page.locator('[data-prove-stake]')).toContainText('You have proved this level. The next attempt that counts opens at ')
  })

  test('a Prove run keeps the seed it drew until its end: neither Restart level nor New numbers is offered while it is on', async ({ page }) => {
    await openProve(page)
    await startProve(page)
    const first = await seedOf(page)
    const foot = page.locator('.es-frame__foot')
    await expect(foot.getByRole('button', { name: 'Restart level' })).toHaveCount(0)
    await expect(foot.getByRole('button', { name: 'New numbers' })).toHaveCount(0)
    await expect(page.locator('[data-prove-foot]')).toContainText('This attempt counts.')
    expect(await seedOf(page)).toBe(first)
  })

  test('the seed is drawn when the Prove run starts, and a failed attempt is played again at once on fresh numbers, recorded as practice', async ({ page }) => {
    await openProve(page)
    await startProve(page)
    const first = await seedOf(page)
    const plates = await readPlates(page)
    const residual = plates.p.map((px, x) => Math.max(0, px - plates.q[x]))
    const heavy = residual.indexOf(Math.max(...residual))
    await typeRecipe(page, residual.map((w, x) => (x === heavy ? w + 1 : w)))
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Not yet')
    await expect(page.locator('[data-prove-after]')).toHaveAttribute('data-prove-after', 'missed')
    await page.getByRole('button', { name: 'Run again' }).click()
    await expect(page.locator('[data-prove-foot]')).toContainText('Recorded as practice; the next attempt that counts opens at ')
    expect(await seedOf(page)).not.toBe(first)
    const { p, q } = await readPlates(page)
    await typeRecipe(page, p.map((px, x) => Math.max(0, px - q[x])))
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Passed')
    await expect(page.locator('[data-prove-after]')).toHaveAttribute('data-prove-after', 'practice')
    // Another visit's Prove run draws its own seed as it starts, too.
    await openProve(page)
    await expect(page.locator('[data-prove-stake]')).toContainText('Your last attempt that counted did not pass.')
    await startProve(page)
    expect(await seedOf(page)).not.toBe(first)
  })

  test('the way in from the practice page, and Leave Prove mode back to it', async ({ page }) => {
    await open(page, 'exact')
    await page.locator('[data-prove-entry]').click()
    await expect(page).toHaveURL(/\/play\/verifier\?level=exact&mode=prove$/)
    await expect(page.locator('[data-prove-panel]')).toBeVisible()
    await page.getByLabel('My coding agent and any AI chat are closed.').check()
    await page.getByRole('button', { name: 'Start the Prove run' }).click()
    await page.getByRole('link', { name: 'Leave Prove mode' }).click()
    await expect(page).toHaveURL(/\/play\/verifier\?level=exact$/)
    await expect(game(page)).toHaveAttribute('data-mode', 'practice')
    await expect(page.locator('[data-vf-readout]')).toBeVisible()
  })
})

/** The words a learner meets on the page: its text, its aria labels, its titles and its alt text. */
const pageWords = (page: Page) =>
  page.evaluate(() => {
    const frame = document.querySelector('section[data-game="verifier"]')
    if (frame === null) return ''
    const labels = [...frame.querySelectorAll('[aria-label],[title],[alt]')].flatMap((node) => ['aria-label', 'title', 'alt'].map((name) => node.getAttribute(name) ?? ''))
    const text = [...frame.querySelectorAll('*')].filter((node) => node.closest('code') === null).map((node) => [...node.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join(' '))
    return [...text, ...labels, document.title].join('\n')
  })

test.describe('the diagram', () => {
  test('2D is the default view; 3D is one switch away on the chain, and not offered where one draft position leaves depth empty', async ({ page }) => {
    await open(page, 'overlap')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.locator('[data-surface="2d"] [data-verifier-view]')).toBeVisible()
    await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveCount(0)
    // On a phone's width the chain draws in 2D too; at a desk's its rows are one switch away.
    await open(page, 'chain')
    await expect(page.getByRole('button', { name: '3D', exact: true })).toHaveCount(0)
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.getByRole('button', { name: '3D', exact: true })).toBeVisible()
  })

  test('the bars carry the four labels, each with its colour and glyph, and the tokens are numbered 0 to 5', async ({ page }) => {
    await open(page, 'overlap')
    await expect(page.locator('[data-vf-token] .es-vf__name')).toHaveText(['token 0', 'token 1', 'token 2', 'token 3', 'token 4', 'token 5'])
    // Before the prediction the bars are whole: the draft and the target, and nothing the prediction would give away.
    await expect(page.locator('[data-vf-legend] .es-legend__entry')).toHaveText(['draft q', 'target p'])
    await tabTo(page, /^Accepted, in sixty-fourths$/)
    await page.keyboard.type('38')
    await page.keyboard.press('Enter')
    const entries = page.locator('[data-vf-legend] .es-legend__entry')
    await expect(entries).toHaveText(['draft q', 'target p', 'accepted min(p, q)', 'residual (p − q)⁺'])
    await expect(entries.locator('[data-glyph]')).toHaveCount(4)
    expect(await entries.locator('[data-glyph]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-glyph')))).toEqual([SLOT_MARKS.yellow.glyph, SLOT_MARKS.blue.glyph, SLOT_MARKS.green.glyph, SLOT_MARKS.red.glyph])
    // The bars are cut into the accepted part and the residual, each in its own colour.
    // On this pair token 3 has an accepted part and a residual, and token 1 a draft excess; the others are too small to see.
    for (const [token, part] of [['3', 'accepted'], ['3', 'residual'], ['1', 'draft']]) await expect(page.locator(`.es-vf__token[data-vf-token="${token}"] .es-vf__seg[data-part="${part}"]`).first()).toBeVisible()
    await expect(game(page)).toContainText('α = 38 of 64 = 19/32')
  })

  test('the words draft and target are on screen on every level, in practice and graded', async ({ page }) => {
    test.setTimeout(120_000)
    for (const level of ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma']) {
      await open(page, level)
      const legend = page.locator('[data-vf-legend]')
      await expect(legend, `${level}: the legend`).toContainText(/draft/i)
      await expect(legend, `${level}: the legend`).toContainText(/target/i)
    }
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start a graded run' }).click()
    await expect(page.locator('[data-vf-legend]')).toContainText(/draft q/)
    await expect(page.locator('[data-vf-legend]')).toContainText(/target p/)
  })
})

test.describe('the first run', () => {
  /** The parts the coach lists, and the level's own: the list names what the level draws. */
  async function walkTo(page: Page, level: 'overlap' | 'chain', field: string) {
    await open(page, level, { intro: 'fresh' })
    const coach = page.locator('section.es-intro')
    await expect(coach).toHaveAttribute('data-intro', 'parts')
    const listed = await coach.locator('ol.es-parts > li').allInnerTexts()
    const drawn = partsOf(level).map((part) => part.name)
    expect(listed.length).toBeGreaterThan(2)
    expect(listed.length).toBeLessThanOrEqual(5)
    for (const text of listed) expect(drawn.some((name) => text.includes(name))).toBe(true)
    // The level's own ask waits, and the dock says so: under the strip at a desk, and on a phone, whose pinned dock is the walk's alone while
    // it names the parts, from the look on.
    const held = page.locator('[data-vf-held]')
    await expect(held).toBeAttached()
    if ((page.viewportSize()?.width ?? 0) >= 1024) await expect(held).toBeVisible()
    await expect(page.getByLabel(field)).toHaveCount(0)
    // The look: one token's bars, and what is not on them is the answer.
    await page.getByRole('button', { name: /^Next/ }).click()
    for (let step = 0; step < 6 && (await coach.getAttribute('data-intro')) === 'parts'; step++) await page.getByRole('button', { name: /^Next/ }).click()
    await expect(coach).toHaveAttribute('data-intro', 'look')
    await expect(held).toBeVisible()
    await expect(page.getByLabel(field)).toHaveCount(0)
    await page.getByRole('button', { name: 'Token 0', exact: true }).click()
    await expect(page.getByRole('dialog').or(page.locator('.es-pop[data-open]')).first()).toContainText(/the target gives it \d+ of 64, and the draft \d+ of 64/)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Next/ }).click()
    // The ask: no skip, and the dock says why.
    await expect(coach).toHaveAttribute('data-intro', 'ask')
    await expect(coach).toContainText('cannot be skipped')
    await expect(page.getByLabel(field)).toBeVisible()
    await expect(page.locator('[data-vf-noskip]')).toContainText('No skip here')
    await expect(page.getByRole('button', { name: /skip the guess/i })).toHaveCount(0)
    return coach
  }

  test('on `overlap`: the parts, a look at one token, the prediction with no skip, then Draw 10 in the ring', async ({ page }) => {
    const coach = await walkTo(page, 'overlap', 'Accepted, in sixty-fourths')
    await page.getByLabel('Accepted, in sixty-fourths').fill('38')
    await page.keyboard.press('Enter')
    await expect(coach).toHaveAttribute('data-intro', 'point')
    await expect(coach).toContainText('Draw 10 rounds')
    await expect(coach).toContainText('a first move that gives no answer away')
    await expect(page.locator('.es-vf-dock__ring')).toHaveCount(1)
    await expect(page.locator('.es-vf-dock__ring').getByRole('button', { name: 'Draw 10' })).toBeVisible()
  })

  test('on `chain`: the same walk, with the level\'s own ask in tokens per round', async ({ page }) => {
    const coach = await walkTo(page, 'chain', 'Tokens per round')
    await page.getByLabel('Tokens per round').fill('2.4')
    await page.keyboard.press('Enter')
    await expect(coach).toHaveAttribute('data-intro', 'point')
    await expect(page.locator('.es-vf-dock__ring').getByRole('button', { name: 'Draw 10' })).toBeVisible()
  })

  test('Skip intro ends it, and the level\'s ask is in the dock at once', async ({ page }) => {
    await open(page, 'overlap', { intro: 'fresh' })
    await page.getByRole('button', { name: 'Skip intro' }).click()
    await expect(page.locator('section.es-intro')).toHaveCount(0)
    await expect(page.getByLabel('Accepted, in sixty-fourths')).toBeVisible()
  })
})

test.describe('the first digit of a weight does not move the dock', () => {
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ] as const) {
    test(`at ${width} x ${height}: the intro ends under the learner's hand, and the field stays where it was`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      await open(page, 'greedy-ngram', { intro: 'fresh' })
      const coach = page.locator('section.es-intro')
      for (let step = 0; step < 6 && (await page.getByRole('button', { name: 'Accepted', exact: true }).count()) === 0; step++)
        await page.getByRole('button', { name: /^Next/ }).click()
      await page.getByRole('button', { name: 'Accepted', exact: true }).click()
      await tabTo(page, /^Resample weight for token 0$/)
      await expect(coach).toHaveCount(1)
      const top = () => page.getByLabel('Resample weight for token 0').evaluate((field) => field.getBoundingClientRect().top)
      const before = await top()
      await page.keyboard.type('1')
      // The intro is over: its strip stands blank in its place while focus is in the field, and the field has not moved.
      await expect(coach).toBeHidden()
      await expect(coach).toHaveCount(1)
      expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1)
      await page.keyboard.type('2')
      expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(1)
      // Focus moving on gives the strip's place back.
      await page.getByRole('button', { name: 'Restart level' }).focus()
      await expect(coach).toHaveCount(0)
    })
  }
})

test.describe('the first digit of a weight on a phone', () => {
  test('at 390 x 844: the intro ends with the digit, and the page carries on', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, 'greedy-ngram', { intro: 'fresh' })
    const coach = page.locator('section.es-intro')
    for (let step = 0; step < 14 && (await page.getByRole('button', { name: 'Accepted', exact: true }).count()) === 0; step++)
      await page.getByRole('button', { name: /^Next/ }).click()
    await page.getByRole('button', { name: 'Accepted', exact: true }).click()
    await tabTo(page, /^Resample weight for token 0$/)
    await expect(coach).toHaveCount(1)
    await page.keyboard.type('1')
    await expect(coach).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'This page stopped' })).toHaveCount(0)
    await expect(page.getByLabel('Resample weight for token 0')).toHaveValue('1')
    await expect(page.getByLabel('Resample weight for token 0')).toBeFocused()
  })
})

test.describe('the draws settle on the overlap', () => {
  test('draws of 10, 100 and 1,000 settle on the overlap, and the moment is named once', async ({ page }) => {
    await open(page, 'overlap')
    await tabTo(page, /^Accepted, in sixty-fourths$/)
    await page.keyboard.type('38')
    await page.keyboard.press('Enter')
    const moment = page.locator('[data-live="moment"]')
    for (const batch of ['Draw 10', 'Draw 100']) {
      await page.getByRole('button', { name: batch, exact: true }).click()
      await expect(moment).toHaveText('')
    }
    await page.getByRole('button', { name: 'Draw 1,000', exact: true }).click()
    await expect(moment).toContainText('The accepted share settles on the overlap: that is the acceptance rate α.')
    await expect(moment).toContainText('19/32')
    await expect(page.locator('[data-moment="draws-settle"]')).toBeVisible()
    await expect(page.locator('[data-readout-id="rounds"] dd')).toContainText('1,110')
    // The accepted share is near the overlap, 19/32, which is 0.594.
    const share = Number(((await page.locator('[data-readout-id="share"] dd').textContent()) ?? '').trim())
    expect(Math.abs(share - 19 / 32)).toBeLessThan(0.05)
    // Said once: the next draws name nothing.
    await page.getByRole('button', { name: 'Draw 1,000', exact: true }).click()
    await expect(moment).toHaveText('')
    await expect(page.locator('[data-moment]')).toHaveCount(0)
  })
})

/** Whether the bars, the current control and the readout are each inside the viewport. */
const inView = (page: Page, control: string) =>
  page.evaluate((selector) => {
    const box = (node: Element | null) => node?.getBoundingClientRect()
    const within = (rect: DOMRect | undefined) => rect !== undefined && rect.top >= -1 && rect.left >= -1 && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1 && rect.height > 0
    const bars = box(document.querySelector('[data-frame-diagram] [data-verifier-view]'))
    const current = box(document.querySelector(selector))
    const readout = box(document.querySelector('[data-readout]'))
    return { bars: within(bars), control: within(current), readout: within(readout) }
  }, control)

test.describe('P5: the bars, the current control and the readout share one screen', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} x ${height}: at the start, once the prediction is in, on the weights and at the result`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height })
      const all = { bars: true, control: true, readout: true }
      await open(page, 'overlap')
      expect(await inView(page, '[data-verifier-controls] input')).toEqual(all)
      await page.getByLabel('Accepted, in sixty-fourths').fill('38')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('button', { name: 'Draw 10', exact: true })).toBeVisible()
      expect(await inView(page, '[data-vf-draws] button')).toEqual(all)
      await open(page, 'exact')
      expect(await inView(page, '[data-vf-recipe] input')).toEqual(all)
      await page.getByRole('button', { name: 'Start from q' }).click()
      await page.getByRole('button', { name: 'Submit the weights' }).click()
      await expect(verdict(page)).toBeVisible()
      await page.evaluate(() => scrollTo(0, 0))
      expect(await inView(page, '[data-result] button')).toEqual(all)
    })
  }

  test('under 700 px of height the dock is not pinned, and follows the diagram', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 })
    await open(page, 'overlap')
    expect(await page.locator('[data-dock]').evaluate((dock) => getComputedStyle(dock).position)).toBe('static')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.locator('[data-dock]').evaluate((dock) => getComputedStyle(dock).position)).toBe('sticky')
  })
})

test.describe('the copy', () => {
  test('no banned word or phrase on /play/verifier in text, aria labels or the live region, from the start of a level to its result', async ({ page }) => {
    test.setTimeout(180_000)
    const said: string[] = []
    for (const level of ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma']) {
      await open(page, level)
      expect([level, findBanned(await pageWords(page))]).toEqual([level, []])
    }
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start from p' }).click()
    said.push((await live(page).textContent()) ?? '')
    await page.getByRole('button', { name: 'Draw 100', exact: true }).click()
    said.push((await live(page).textContent()) ?? '')
    await page.locator('[data-state-table] summary').click()
    expect(findBanned(await pageWords(page))).toEqual([])
    await page.getByRole('button', { name: 'Submit the weights' }).click()
    await expect(verdict(page)).toBeVisible()
    expect(findBanned(await pageWords(page))).toEqual([])
    await open(page, 'overlap', { intro: 'fresh' })
    expect(findBanned(await pageWords(page))).toEqual([])
    await openProve(page)
    expect(findBanned(await page.locator('[data-prove-panel]').innerText())).toEqual([])
    await page.getByLabel('My coding agent and any AI chat are closed.').check()
    await page.getByRole('button', { name: 'Start the Prove run' }).click()
    await expect(game(page)).toBeVisible()
    expect(findBanned(await pageWords(page))).toEqual([])
    await submitAnyWeights(page)
    expect(findBanned(await pageWords(page))).toEqual([])
    expect(findBanned(said.join('\n'))).toEqual([])
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, the bars settle at once, and the game plays to a verdict', async ({ page }) => {
    await open(page, 'exact')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await page.getByRole('button', { name: 'Start from p' }).click()
    await page.getByRole('button', { name: 'Draw 100', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    // The bars and the output ring settle at once.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-vf__seg') as Element).transitionDuration)).toBe('0s')
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-vf__out') as Element).transitionDuration)).toBe('0s')
    await typeRecipe(page, excessPlates(buildLevel('exact', 0)))
    await page.keyboard.press('Enter')
    await atTheResult(page, 'Passed')
  })
})

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played to its result', async ({ page }) => {
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
    await page.getByRole('button', { name: /^Sample/ }).first().click()
    await page.getByRole('button', { name: 'Start a graded run' }).count()
    await open(page, 'exact')
    await page.getByRole('button', { name: 'Start from q' }).click()
    await page.getByRole('button', { name: 'Submit the weights' }).click()
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
    expect(expected).toBe('dde213ae')
  })
})

test.describe('accessibility', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
  const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']

  /** The audit: serious and critical findings fail, and so do the heading rules, whatever their impact. */
  async function audit(page: Page, label: string) {
    // The stage buttons trade their colours over a short transition when the stage changes, and axe reads the colours as they stand
    // at that moment: the audit waits for every transition to end, so that it judges the page at rest and not half-way between two stages.
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation instanceof CSSTransition).map((transition) => transition.finished.catch(() => undefined))))
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
        await page.getByRole('button', { name: /^Sample/ }).first().click()
        await page.getByRole('button', { name: 'Check every draw' }).first().click()
        await audit(page, `mutants, sampled, at ${width} px`)
        await open(page, 'exact')
        await page.getByRole('button', { name: 'Start from q' }).click()
        await page.getByRole('button', { name: 'Submit the weights' }).click()
        await expect(verdict(page)).toBeVisible()
        await audit(page, `exact result at ${width} px`)
        await open(page, 'overlap', { intro: 'fresh' })
        await audit(page, `overlap, first run, at ${width} px`)
        await openProve(page)
        await audit(page, `the Prove panel at ${width} px`)
        await page.getByLabel('My coding agent and any AI chat are closed.').check()
        await audit(page, `the Prove panel, attested, at ${width} px`)
        await page.getByRole('button', { name: 'Start the Prove run' }).click()
        await expect(game(page)).toBeVisible()
        await audit(page, `exact, Prove run, at ${width} px`)
        await submitAnyWeights(page)
        await audit(page, `exact, Prove result, at ${width} px`)
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
      await page.getByRole('button', { name: 'Submit the weights' }).click()
      await expect(verdict(page)).toBeVisible()
      const debrief = await clipped(page, '[data-verifier-debrief]')
      expect(debrief.text, 'the result, past the right edge').toEqual([])
    })
  })
})
