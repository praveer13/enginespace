/*
 * The keyboard walks of W1's games (W1-T36; ARCHITECTURE §11.2: "every game's level completable by keyboard alone; focus always visible
 * and never obscured"). A walk plays one level, on its pinned practice seed, from the level's own page to its debrief, with the keys
 * alone: Tab to a control, the arrows along a list, digits into a field, Enter or Space to press. The pointer is never used, and the 3D
 * scene is off so that nothing moves under the walk (the scene is the same game: A§6.9 gives it a DOM mirror and these keys).
 *
 * What a walk knows about a level comes from the pure session (packages/play/<game>), as the house plays it: the numbers to type, the
 * stages to lay, the plates to draw. Every key that moves focus goes through `walk` (e2e/support/front.ts), which reads where focus
 * landed, so that the end of the walk can say which stop a keyboard user could not see: no ring, covered by something else, or off the
 * screen (WCAG 2.4.7 and 2.4.11).
 *
 * e2e/walks.spec.ts runs these, one test for each level of e2e/levels.ts' `WALKED`. The walks follow the ones that each game's
 * own spec plays (e2e/pool.spec.ts, e2e/verifier.spec.ts, e2e/engine-floor.spec.ts, e2e/broken-bench.spec.ts, e2e/loop-full.spec.ts),
 * which keep their dev-server setup and their finer checks; these run in the pull-request subset against the built site.
 */
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { GAMES } from '../../packages/play/registry'
import { caseOf } from '../../packages/play/broken-bench/cases'
import { FLAW_FACTS } from '../../packages/play/broken-bench/flaws'
import { buildLevel as benchLevel } from '../../packages/play/broken-bench/levels'
import type { CaseSlot, Flaw } from '../../packages/play/broken-bench/types'
import { floorGhost } from '../../packages/play/engine-floor/session'
import { buildLevel as floorLevel } from '../../packages/play/engine-floor/levels'
import { buildFullLevel, MODES } from '../../packages/play/loop/full/levels'
import type { FullLevelId } from '../../packages/play/loop/full/types'
import { buildLevel as poolLevel } from '../../packages/play/pool/levels'
import type { PoolAction, PoolLevelId } from '../../packages/play/pool/types'
import { buildLevel as verifierLevel } from '../../packages/play/verifier/levels'
import { excessPlates, keptPlates, sweepOfLevel, tokensOf } from '../../packages/play/verifier/state'
import { MUTANT_IDS } from '../../packages/play/verifier/types'
import { BENCH_FLAWS } from '../../packages/sim/bench/broken-types'
import { houseActions } from '../../tests/play/pool-support'
import type { WALKED } from '../levels'
import { walkOf } from './front'
import type { Focus } from './front'
import { open, withSettings } from './site'

/** The walk of a level: it plays `level` of the game whose page is open, and returns when the debrief is on screen. */
export type Walker = (page: Page, walk: Walk) => Promise<void>

/** A walk's record of where focus went, from e2e/support/front.ts. */
export type Walk = ReturnType<typeof walkOf>


const gameOf = (page: Page, id: string) => page.locator(`section[data-game="${id}"]`)
/** Where a walk looks: the whole page, or the one game of it that the walk plays (a lesson can hold two runs of one game). */
type Scope = Pick<Page, 'locator'>
const liveLine = (scope: Scope) => scope.locator('[data-live="line"]')
const outcome = (scope: Scope) => scope.locator('[data-live="outcome"]')

/** The level's registry record: its pinned practice seed. */
function practiceSeed(game: string, level: string): number {
  const entry = GAMES.get(game)?.levels.find((candidate) => candidate.id === level)
  if (entry === undefined) throw new Error(`the registry has no level ${game}/${level}`)
  return entry.practiceSeed
}

/**
 * Opens a game's page on a level with the 3D scene off, and waits for the game. A walk starts at the top of the document with focus on
 * nothing, as a visitor's does.
 */
export async function openLevel(page: Page, game: string, level: string): Promise<void> {
  await withSettings(page.context(), { view3d: false })
  await open(page, `/play/${game}?level=${level}`)
  await expect(gameOf(page, game)).toBeVisible()
}

/** What a reader would call the focused control: its aria-label, its label, or its text. */
const activeName = (page: Page): Promise<string> => page.evaluate(() => {
  const element = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null
  if (element === null) return ''
  const named = element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? element.tagName
  return named.trim().replace(/\s+/g, ' ')
})

/** Which control of the game has focus now, by its data attribute (`data-game` for the game itself, `data-stage` for a card of the tray). */
const focusedAttribute = (page: Page, attribute: string): Promise<string | null | undefined> => page.evaluate((name) => document.activeElement?.getAttribute(name), attribute)

/** Presses Tab until the focused control is named like `name` (the label of a field counts), and fails with the path it took after `limit` presses. */
async function tabTo(walk: Walk, name: RegExp, limit = 60): Promise<Focus> {
  return walk.tabTo(name, limit)
}

/** Presses Tab until `target` has focus. */
async function tabToLocator(walk: Walk, target: Locator, limit = 120): Promise<void> {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return
    await walk.press('Tab')
  }
  throw new Error(`Tab never reached ${String(target)} in ${limit} presses; it went through ${walk.trail.map((stop) => stop.name).join(' > ')}`)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rejection sampler (`verifier`)                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The run is over: the instrument frame puts the result in the dock and focus on its verdict, which the grade gives. */
async function samplerResult(page: Page, walk: Walk, word: 'Passed' | 'Finished (practice)'): Promise<void> {
  await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
  await expect(page.locator('[data-result] [data-result-heading]')).toHaveText(word)
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-result-heading') ?? false)).toBe(true)
  await walk.see()
}

/**
 * A learner who has not met the parts gets the first run (R-T30): its Next, with the keys, walks the parts and the look, and the ask's step
 * puts focus in the level's first field. The game's block finds it the same way inside a lesson.
 */
async function throughFirstRun(page: Page, walk: Walk): Promise<void> {
  const step = () => page.locator('[data-game="verifier"] .es-intro').first().getAttribute('data-intro', { timeout: 2_000 }).catch(() => null)
  await page.locator('[data-game="verifier"] :is(.es-intro, [data-verifier-controls])').first().waitFor()
  for (let at = await step(), guard = 0; (at === 'parts' || at === 'look') && guard < 12; at = await step(), guard++) {
    const focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-intro-next') ?? false)
    if (!focused) await tabTo(walk, /^(Next|Next part)$/, 60)
    await page.keyboard.press('Enter')
  }
}

/** Puts focus on the control named `name`: where the first run left it, or by Tab. */
async function reach(page: Page, walk: Walk, name: RegExp, limit = 60): Promise<void> {
  if (name.test(await activeName(page))) return
  await tabTo(walk, name, limit)
}

/** Types the weights into the six fields with the keys alone: digits, and the right arrow to the next token. */
async function typeWeights(page: Page, walk: Walk, weights: readonly number[]): Promise<void> {
  await reach(page, walk, /^Resample weight for token 0$/)
  for (const [token, weight] of weights.entries()) {
    await page.keyboard.type(String(weight))
    if (token < weights.length - 1) await walk.press('ArrowRight')
  }
}

const sampler = (level: string) => verifierLevel(level, practiceSeed('verifier', level))

const SAMPLER: Record<(typeof WALKED)['verifier'][number], Walker> = {
  overlap: async (page, walk) => {
    await throughFirstRun(page, walk)
    await reach(page, walk, /^Accepted, in sixty-fourths$/)
    await page.keyboard.type(String(keptPlates(sampler('overlap'))))
    await page.keyboard.press('Enter')
    await expect(liveLine(page)).toContainText(/^Committed: \d+ of 64 accepted\./)
    // Focus moves to the first batch of rounds, which is the next thing to do.
    await expect.poll(() => activeName(page)).toBe('Draw 10')
    await walk.see()
    await page.keyboard.press('Enter')
    await expect(liveLine(page)).toContainText('Drew 10 rounds')
    await tabTo(walk, /^Draw 100$/, 3)
    await tabTo(walk, /^Draw 1,000$/, 3)
    await tabTo(walk, /^Finish$/, 3)
    await page.keyboard.press('Enter')
    await samplerResult(page, walk, 'Finished (practice)')
  },
  exact: async (page, walk) => {
    await throughFirstRun(page, walk)
    await typeWeights(page, walk, excessPlates(sampler('exact')))
    await expect(liveLine(page)).toContainText('The output is p exactly.')
    await page.keyboard.press('Enter')
    await samplerResult(page, walk, 'Passed')
    await expect(page.getByText("Your weights against the reference's")).toBeVisible()
  },
  chain: async (page, walk) => {
    const truth = tokensOf(sampler('chain'))
    await throughFirstRun(page, walk)
    await reach(page, walk, /^Tokens per round$/)
    await page.keyboard.type((Number(truth.num) / Number(truth.den)).toFixed(3))
    await page.keyboard.press('Enter')
    await expect(liveLine(page)).toContainText('Prediction committed.')
    await expect.poll(() => activeName(page)).toBe('Draw 10')
    await tabTo(walk, /^Finish$/, 4)
    await page.keyboard.press('Enter')
    await samplerResult(page, walk, 'Passed')
  },
  'greedy-ngram': async (page, walk) => {
    const level = sampler('greedy-ngram')
    if (level.id !== 'greedy-ngram') throw new Error('not the n-gram level')
    const favourite = level.p[0].indexOf(Math.max(...level.p[0]))
    await throughFirstRun(page, walk)
    await reach(page, walk, level.draft === favourite ? /^Accepted$/ : /^Rejected$/)
    await page.keyboard.press('Enter')
    await expect(liveLine(page)).toContainText(level.draft === favourite ? 'You said it is accepted.' : 'You said it is rejected.')
    // Focus moved to the first weight, so the weights are typed from where it is.
    await expect.poll(() => activeName(page)).toBe('Resample weight for token 0')
    for (const [token, weight] of level.p[0].map((w, x) => (x === level.draft ? 0 : w)).entries()) {
      await page.keyboard.type(String(weight))
      if (token < level.p[0].length - 1) await walk.press('ArrowRight')
    }
    await page.keyboard.press('Enter')
    await samplerResult(page, walk, 'Finished (practice)')
  },
  mutants: async (page, walk) => {
    const level = sampler('mutants')
    if (level.id !== 'mutants') throw new Error('not the mutants level')
    await throughFirstRun(page, walk)
    // The first run's ask step leaves focus on the first field of the level, which is card 1's bug name: Shift+Tab goes back over
    // "Check every draw" to card 1's "Sample 20,000", where a forward Tab would go on to card 2's.
    await expect.poll(() => activeName(page)).toBe('Name the bug of card 1')
    for (let back = 0; back < 3 && !/^Sample 20,000$/.test(await activeName(page)); back++) await walk.press('Shift+Tab')
    await expect.poll(() => activeName(page)).toBe('Sample 20,000')
    await page.keyboard.press('Enter')
    await expect(liveLine(page)).toContainText('Card 1 sampled:')
    await tabTo(walk, /^Check every draw$/, 3)
    await page.keyboard.press('Enter')
    await expect(liveLine(page)).toContainText('Card 1:')
    for (const [card, bug] of level.cards.entries()) {
      await tabTo(walk, new RegExp(`^Name the bug of card ${card + 1}$`), 8)
      for (let press = 0; press <= MUTANT_IDS.indexOf(bug); press++) await walk.press('ArrowDown')
    }
    await expect(page.getByRole('button', { name: 'Submit the five names' })).toBeEnabled()
    await tabTo(walk, /^Submit the five names$/, 3)
    await page.keyboard.press('Enter')
    await samplerResult(page, walk, 'Finished (practice)')
  },
  gamma: async (page, walk) => {
    const best = sweepOfLevel(sampler('gamma')).best
    await throughFirstRun(page, walk)
    await reach(page, walk, /^Draft length, tokens proposed$/)
    await walk.press('ArrowUp')
    await expect(liveLine(page)).toContainText('Drafting 1 token a round.')
    await page.keyboard.type(String(best))
    await expect(liveLine(page)).toContainText(`Drafting ${best} tokens a round.`)
    await page.keyboard.press('Enter')
    await samplerResult(page, walk, 'Passed')
    await expect(page.getByText('Every draft length, in tokens per round')).toBeVisible()
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Request path (`engine-floor`)                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const stageCard = (page: Page, id: string) => page.locator(`[data-floor-tray] [data-stage="${id}"]`)

/** Moves the tray's focus to the card of a stage with the arrow keys: down or up as many cards as lie between. */
async function arrowToStage(page: Page, walk: Walk, id: string): Promise<void> {
  const here = await page.evaluate((target) => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-floor-tray] [data-stage]')]
    return { from: cards.indexOf(document.activeElement as HTMLElement), to: cards.findIndex((card) => card.dataset.stage === target) }
  }, id)
  if (here.to < 0) throw new Error(`the tray has no card for ${id}`)
  if (here.from < 0) throw new Error('focus is not on a card of the tray')
  const key = here.to > here.from ? 'ArrowDown' : 'ArrowUp'
  for (let i = 0; i < Math.abs(here.to - here.from); i++) await walk.press(key)
  await expect.poll(() => focusedAttribute(page, 'data-stage')).toBe(id)
}

/** The prediction by keys: Tab to the number, Enter to pick it, Tab to Commit and Enter to commit. Focus lands on the first tile. */
async function commitBoundaries(page: Page, walk: Walk, n: number): Promise<void> {
  await tabTo(walk, new RegExp(`^${n} ${n === 1 ? 'boundary' : 'boundaries'}$`))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: `${n} ${n === 1 ? 'boundary' : 'boundaries'}` })).toHaveAttribute('aria-pressed', 'true')
  await tabTo(walk, /^Commit the prediction$/)
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-stage') !== null)).toBe(true)
  await walk.see()
}

/** The whole level: the first run's intro if it shows, the prediction (the true count), the engine's path laid tile by tile, the run, and the result. */
const floorNight = (id: (typeof WALKED)['engine-floor'][number]): Walker => async (page, walk) => {
  const level = floorLevel(id, practiceSeed('engine-floor', id))
  // A learner who has not met the parts gets the first run (R-T29): Next, with the keys, walks the parts and the look; the prediction follows.
  const step = () => page.locator('[data-game="engine-floor"] .es-intro').first().getAttribute('data-intro', { timeout: 2_000 }).catch(() => null)
  await page.locator('[data-game="engine-floor"] :is(.es-intro, [data-prediction])').first().waitFor()
  for (let at = await step(), guard = 0; (at === 'parts' || at === 'look') && guard < 12; at = await step(), guard++) {
    const focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-intro-next') ?? false)
    if (!focused) await tabTo(walk, /^(Next|Next part)$/, 60)
    await page.keyboard.press('Enter')
  }
  await commitBoundaries(page, walk, floorGhost(level).prediction ?? 0)
  for (const stageId of level.reference) {
    await arrowToStage(page, walk, stageId)
    await page.keyboard.press('Enter')
    await expect(stageCard(page, stageId)).toHaveCount(0)
  }
  await expect(page.locator('[data-game="engine-floor"] [data-floor-lanes] [data-lane-row]')).toHaveCount(level.reference.length)
  await tabTo(walk, /^Run the path$/)
  await page.keyboard.press('Enter')
  // The instrument frame puts the result in the dock and focus on its verdict: the graded map has a pass rule, a practice level a number to beat.
  await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
  const verdict = page.locator('[data-game="engine-floor"] [data-result] [data-result-heading]')
  await expect(verdict).toHaveText(id === 'map' ? 'Passed' : 'Finished (practice)')
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-result-heading') ?? false)).toBe(true)
  await walk.see()
}

/**
 * The same level played with the pointer, as a first-time visitor does (R-T47's first-visit walk, which plays it once by the pointer and
 * once by `floorNight`'s keys): the parts of the first run with Next, the prediction with a click on the count and on Commit, each stage of
 * the path clicked in its tray, and the run. `hands` says how each control is pressed, so the walk is one script for both.
 */
export async function floorWithHands(
  page: Page,
  id: (typeof WALKED)['engine-floor'][number],
  press: (target: Locator) => Promise<void>,
  options: { intro?: boolean; onStage?: (laid: number) => Promise<void> } = {},
): Promise<void> {
  const level = floorLevel(id, practiceSeed('engine-floor', id))
  const game = page.locator('[data-game="engine-floor"]')
  if (options.intro !== false) {
    const step = () => game.locator('.es-intro').first().getAttribute('data-intro', { timeout: 2_000 }).catch(() => null)
    await game.locator(':is(.es-intro, [data-prediction])').first().waitFor()
    for (let at = await step(), guard = 0; (at === 'parts' || at === 'look') && guard < 12; at = await step(), guard++) await press(game.locator('[data-intro-next]').first())
  }
  const n = floorGhost(level).prediction ?? 0
  const count = page.getByRole('button', { name: `${n} ${n === 1 ? 'boundary' : 'boundaries'}` })
  await press(count)
  await expect(count).toHaveAttribute('aria-pressed', 'true')
  await press(page.getByRole('button', { name: 'Commit the prediction' }))
  for (const [at, stageId] of level.reference.entries()) {
    await press(stageCard(page, stageId))
    await expect(stageCard(page, stageId)).toHaveCount(0)
    await options.onStage?.(at + 1)
  }
  await expect(game.locator('[data-floor-lanes] [data-lane-row]')).toHaveCount(level.reference.length)
  await press(page.getByRole('button', { name: 'Run the path' }))
  await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
  await expect(game.locator('[data-result] [data-result-heading]')).toHaveText(id === 'map' ? 'Passed' : 'Finished (practice)')
}

const FLOOR: Record<(typeof WALKED)['engine-floor'][number], Walker> = {
  nano: floorNight('nano'),
  'nano-tp': floorNight('nano-tp'),
  mini: floorNight('mini'),
  inside: floorNight('inside'),
  vllm: floorNight('vllm'),
  sglang: floorNight('sglang'),
  abort: floorNight('abort'),
  map: floorNight('map'),
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* KV page pool (`pool`)                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const askKind = (page: Page) => page.locator('[data-pool-controls]').getAttribute('data-ask')

/** The buttons of the open ask's list that can be acted on, in order, with their names. */
const listOf = (page: Page, kind: string) =>
  page.evaluate((k) => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-ask-list="${k}"] button[data-roving]:not(:disabled)`))
    return buttons.map((button) => ({ name: (button.getAttribute('aria-label') ?? button.textContent ?? '').trim().replace(/\s+/g, ' '), focused: button === document.activeElement, pressed: button.getAttribute('aria-pressed') === 'true' }))
  }, kind)

/** Waits until the page has been given `count` frames: what the effects of a commit need to have run, on a machine of any speed. */
const frames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const next = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => next(left - 1)))
        next(n)
      }),
    count,
  )

/** Waits for the open ask to be of this kind, and puts the keyboard in its list: focus follows a new ask on its own, and a page that has just opened does not take focus. */
async function awaitAsk(page: Page, walk: Walk, kind: string): Promise<void> {
  await expect.poll(() => askKind(page), { message: `the open ask is ${kind}` }).toBe(kind)
  const inList = () => page.evaluate((k) => document.activeElement?.closest(`[data-ask-list="${k}"]`) != null, kind)
  // Focus may be about to follow the ask: the game moves it from an effect that runs after the commit that opened the ask, and two frames
  // on that effect has run, however slow the machine is. Wait for the frames, and not for some milliseconds that a busy machine outlasts;
  // if focus is not in the list then, it is not coming, and the walk tabs to it.
  if (!(await inList())) await frames(page, 2)
  for (let i = 0; i < 90 && !(await inList()); i++) await walk.press('Tab')
  expect(await inList(), `focus is in the ${kind} list`).toBe(true)
}

/** Moves focus along the list with the arrow keys until it is on the button at `index`. */
async function arrowToItem(page: Page, walk: Walk, kind: string, index: number): Promise<void> {
  const items = await listOf(page, kind)
  let at = items.findIndex((item) => item.focused)
  if (at < 0) throw new Error(`focus is not on the ${kind} list`)
  for (; at < index; at++) await walk.press('ArrowDown')
  for (; at > index; at--) await walk.press('ArrowUp')
}

/** Answers the open decision the way a keyboard does, with the reference's action: a request by the arrows and Enter, an eviction by Space on the rows and its button. */
async function take(page: Page, walk: Walk, action: PoolAction): Promise<void> {
  switch (action.t) {
    case 'commit':
      break
    case 'admit': {
      await awaitAsk(page, walk, 'admit')
      if (action.req === null) {
        await tabTo(walk, /^Admit none this step$/, 12)
        await page.keyboard.press('Enter')
        break
      }
      const items = await listOf(page, 'admit')
      const index = items.findIndex((item) => item.name.startsWith(`Admit request ${(action.req as number) + 1},`))
      expect(index, `request ${action.req} is on the list`).toBeGreaterThanOrEqual(0)
      await arrowToItem(page, walk, 'admit', index)
      await page.keyboard.press('Enter')
      break
    }
    case 'evict': {
      await awaitAsk(page, walk, 'evict')
      const rows = await listOf(page, 'evict')
      const named = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-ask-list="evict"] button[data-roving]')).map((button) => Number(/page (\d+)/.exec(button.textContent ?? '')?.[1])))
      const want = new Set(action.pages.map((pan) => pan + 1))
      // Space on a row toggles the pan; the rows are in the rotation's order, and the first `need` are chosen to begin with.
      for (const [index, row] of rows.entries()) {
        if (row.pressed !== want.has(named[index])) {
          await arrowToItem(page, walk, 'evict', index)
          await page.keyboard.press('Space')
        }
      }
      await expect(page.locator('[data-ask-list="evict"] [aria-pressed="true"]')).toHaveCount(action.pages.length)
      await tabTo(walk, /^Evict \d+ pages?$/, 8)
      await page.keyboard.press('Enter')
      break
    }
    case 'preempt': {
      await awaitAsk(page, walk, 'preempt')
      const items = await listOf(page, 'preempt')
      const index = items.findIndex((item) => item.name.startsWith(`Preempt request ${action.req + 1},`))
      expect(index, `request ${action.req} is running`).toBeGreaterThanOrEqual(0)
      await arrowToItem(page, walk, 'preempt', index)
      await page.keyboard.press('Enter')
      break
    }
    case 'prefetch': {
      await awaitAsk(page, walk, 'prefetch')
      if (action.adapter === null) {
        await tabTo(walk, /^Load none yet$/, 12)
        await page.keyboard.press('Enter')
        break
      }
      const items = await listOf(page, 'prefetch')
      const index = items.findIndex((item) => item.name.startsWith(`Load adapter ${(action.adapter as number) + 1},`))
      expect(index, `kit ${action.adapter} is on offer`).toBeGreaterThanOrEqual(0)
      await arrowToItem(page, walk, 'prefetch', index)
      await page.keyboard.press('Enter')
      break
    }
  }
}

/** What a spec may do between the reference's actions of a pool level: before and after each (R-T47's keep-list reads the moments on the way). */
export interface PoolHooks {
  readonly before?: (action: PoolAction, at: number, page: Page) => Promise<void>
  readonly after?: (action: PoolAction, at: number, page: Page) => Promise<void>
}

export const poolNightWith = (level: PoolLevelId, hooks: PoolHooks = {}): Walker => async (page, walk) => {
  const built = poolLevel(level, practiceSeed('pool', level))
  // A learner who has not met the parts gets the first run (R-T08): its Next, with the keys, walks the parts and the look, and the ask's
  // step puts focus in the guess's field. The game's own block finds it the same way inside a lesson.
  const step = () => page.locator('[data-game="pool"] .es-intro').first().getAttribute('data-intro', { timeout: 2_000 }).catch(() => null)
  // The first run's strip, or the guess when every part was met: whichever the page settles on.
  await page.locator('[data-game="pool"] :is(.es-intro, [data-pool-predict])').first().waitFor()
  for (let at = await step(), guard = 0; (at === 'parts' || at === 'look') && guard < 12; at = await step(), guard++) {
    const focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-intro-next') ?? false)
    if (!focused) await tabTo(walk, /^(Next|Next part)$/, 60)
    await page.keyboard.press('Enter')
  }
  // The guess is optional, and only the first action: a field and a Commit, written with the keys.
  if (!(await page.evaluate(() => document.activeElement?.closest('[data-pool-predict]') != null))) await tabTo(walk, /^Your guess$/)
  await page.keyboard.type(String(built.predict.answer))
  await tabTo(walk, /^Commit$/, 3)
  await page.keyboard.press('Enter')
  await expect(liveLine(page)).not.toHaveText('')
  for (const [at, action] of houseActions(built).entries()) {
    await hooks.before?.(action, at, page)
    await take(page, walk, action)
    await hooks.after?.(action, at, page)
  }
  // The instrument frame puts the result in the dock and focus on its verdict, which the grade gives: a graded level has a pass rule.
  await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
  const verdict = page.locator('[data-result] [data-result-heading]')
  await expect(verdict).toHaveText(built.graded ? 'Passed' : 'Finished (practice)')
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-result-heading') ?? false)).toBe(true)
  await walk.see()
}

const poolNight = (level: PoolLevelId): Walker => poolNightWith(level)

const POOL: Record<(typeof WALKED)['pool'][number], Walker> = {
  'one-group': poolNight('one-group'),
  'two-kinds': poolNight('two-kinds'),
  evict: poolNight('evict'),
  'same-size': poolNight('same-size'),
  state: poolNight('state'),
  adapters: poolNight('adapters'),
  manager: poolNight('manager'),
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Broken benchmark (`broken-bench`)                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Ruling {
  flaw: Flaw
  p99Us: number
  loUs: number
  hiUs: number
}

/** What a learner who has done the reference's own arithmetic files: the true flaw, the recomputed p99 and the reference's interval. */
function rightRuling(slot: CaseSlot): Ruling {
  const { c, truth } = caseOf(slot)
  return { flaw: c.flaw, p99Us: truth.correction.p99Us, loUs: truth.interval.loUs, hiUs: truth.interval.hiUs }
}

/** Milliseconds as a person types them. */
const ms = (us: number): string => String(us / 1000)

/**
 * A whole filing, by keys: the radios take focus (from the first run's ask step, or Tab), the arrows choose the flaw, digits write the p99
 * and its range, and Enter from the last field files it.
 */
async function fileRuling(page: Page, walk: Walk, ruling: Ruling, scope: Scope = page): Promise<void> {
  const inFlaws = await page.evaluate(() => document.activeElement?.closest('[data-bench-flaws]') != null)
  if (!inFlaws) await tabTo(walk, new RegExp(`^${FLAW_FACTS[BENCH_FLAWS[0]].term}`))
  const at = BENCH_FLAWS.indexOf(ruling.flaw)
  if (at === 0) await page.keyboard.press('Space')
  for (let press = 0; press < at; press++) await walk.press('ArrowDown')
  await expect.poll(() => activeName(page)).toContain(FLAW_FACTS[ruling.flaw].term)
  await expect(scope.locator(`input[type="radio"][value="${ruling.flaw}"]`)).toBeChecked()
  await tabTo(walk, /^Your p99 \(ms\)$/, 4)
  await page.keyboard.type(ms(ruling.p99Us))
  await walk.press('Tab')
  expect(await activeName(page)).toBe('Range from (ms)')
  await page.keyboard.type(ms(ruling.loUs))
  await walk.press('Tab')
  expect(await activeName(page)).toBe('to (ms)')
  await page.keyboard.type(ms(ruling.hiUs))
  await page.keyboard.press('Enter')
}

/** The first run's strip: Next through the parts and the look, with the keys. Whatever the page settles on first (the strip, or the form when every part was met). */
async function passTheIntro(page: Page, walk: Walk): Promise<Locator> {
  // A lesson can hold two runs of this game (its opening run and its graded block): the one the keys are in is the one to pass. On the game's
  // own page there is one.
  const inFocus = page.locator('[data-game="broken-bench"]:focus-within')
  const game = (await inFocus.count()) > 0 ? inFocus.first() : page.locator('[data-game="broken-bench"]').first()
  const step = () => game.locator('.es-intro').first().getAttribute('data-intro', { timeout: 2_000 }).catch(() => null)
  await game.locator(':is(.es-intro, [data-bench-form])').first().waitFor()
  for (let at = await step(), guard = 0; (at === 'parts' || at === 'look') && guard < 12; at = await step(), guard++) {
    const focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-intro-next') ?? false)
    if (!focused) await tabTo(walk, /^(Next|Next part)$/, 60)
    await page.keyboard.press('Enter')
  }
  return game
}

/** Broken benchmark's level filed right, case by case: on its practice seed, or on the seed a graded run drew (e2e/lesson-games.spec.ts). */
export const benchLevelWalk = (level: 'due' | 'warm' | 'sure' | 'court', seed = practiceSeed('broken-bench', level)): Walker => async (page, walk) => {
  const slots = benchLevel(level, seed).slots
  const game = await passTheIntro(page, walk)
  for (const [at, slot] of slots.entries()) {
    if (at > 0) await expect.poll(() => activeName(page)).toBe(`Report form: report ${at + 1} of ${slots.length}`)
    await fileRuling(page, walk, rightRuling(slot), game)
    if (at < slots.length - 1) await expect(liveLine(game)).toContainText(`Report ${at + 1} of ${slots.length} filed.`)
  }
  await expect(liveLine(game)).toContainText('The last report is filed.')
  // The instrument frame puts the result in the dock and focus on its verdict, which the grade gives.
  await expect(outcome(game)).toHaveText('The run is over. The result is in the dock.')
  await expect(game.locator('[data-result] [data-result-heading]')).toHaveText('Passed')
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-result-heading') ?? false)).toBe(true)
  await walk.see()
}

const BENCH: Record<(typeof WALKED)['broken-bench'][number], Walker> = {
  due: benchLevelWalk('due'),
  warm: benchLevelWalk('warm'),
  sure: benchLevelWalk('sure'),
  court: benchLevelWalk('court'),
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Service's full service (`loop`)                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A learner who has not met the parts gets the first run (R-T28): its Next, with the keys, walks the parts and the look to the ask, and the
 * prediction opens. The game's own block finds it the same way inside a lesson. Where every part was met, the prediction is there already.
 */
async function firstRun(page: Page, walk: Walk): Promise<void> {
  await page.locator('[data-game="loop"] :is(.es-intro, [data-full-prediction="open"])').first().waitFor()
  const step = () => page.locator('[data-game="loop"] .es-intro').first().getAttribute('data-intro', { timeout: 2_000 }).catch(() => null)
  for (let at = await step(), guard = 0; (at === 'parts' || at === 'look') && guard < 14; at = await step(), guard++) {
    const focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-intro-next') ?? false)
    if (!focused) await tabTo(walk, /^(Next|Next part)$/, 60)
    await page.keyboard.press('Enter')
  }
}

/** Commits the stage's prediction with the keys: a number typed into its field, or a choice pressed and committed with its button. */
async function call(page: Page, walk: Walk, answer: number): Promise<void> {
  await firstRun(page, walk)
  const field = page.locator('[data-full-prediction="open"] input')
  if ((await field.count()) > 0) {
    await tabToLocator(walk, field)
    await page.keyboard.type(String(answer))
    await page.keyboard.press('Enter')
  } else {
    await tabToLocator(walk, page.locator('[data-full-prediction="open"] [role="radio"]').nth(answer))
    await page.keyboard.press('Enter')
    await tabToLocator(walk, page.getByRole('button', { name: 'Commit prediction' }))
    await page.keyboard.press('Enter')
  }
  await expect(page.locator('[data-full-prediction="called"]')).toBeVisible()
}

/** A key of the game's, pressed with focus inside the game but on no text field. */
async function gameKey(page: Page, walk: Walk, code: string): Promise<void> {
  const active = await page.evaluate(() => document.activeElement?.tagName ?? '')
  if (active === 'INPUT' || active === 'BODY') await tabToLocator(walk, page.locator('[data-full-levers] button, [data-full-levers] [role="switch"], [data-full-step] button').first())
  await page.keyboard.press(code)
}

async function serve(page: Page, walk: Walk): Promise<void> {
  await tabToLocator(walk, page.getByRole('button', { name: 'Run to the end' }))
  await page.keyboard.press('Enter')
}

async function nextStage(page: Page, walk: Walk, id: string): Promise<void> {
  await gameKey(page, walk, 'BracketRight')
  await expect(page.locator(`[data-stage-tab="${id}"][aria-current="step"]`)).toBeVisible()
}

async function fullDebrief(page: Page, walk: Walk, word = 'Finished (practice)'): Promise<void> {
  // The frame puts the result in the dock, and focus on its verdict, when the last stage closes.
  await expect(page.locator('[data-full-debrief]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('[data-full-debrief] [data-result-heading]')).toHaveText(word)
  await walk.see()
}

/** Cycles the graph mode with `G` until the panel asks for `wanted`. (`FULL` is the start of `FULL_DECODE_ONLY`, so the button's word is matched whole.) */
async function graphMode(page: Page, walk: Walk, wanted: string): Promise<void> {
  for (let i = 0; i < MODES.length; i++) {
    const asked = (await page.locator('[data-full-levers] [role="radio"][aria-checked="true"]').textContent()) ?? ''
    if (asked.split(/[ :]/)[0] === wanted) return
    await gameKey(page, walk, 'KeyG')
  }
  throw new Error(`G never reached ${wanted}`)
}

/** The sizes on the capture ladder, in the order the plates stand: what the page offers, whatever the stage's world says. */
const ladderOf = async (page: Page): Promise<number[]> => (await page.locator('[aria-label="Capture sizes"] button').allTextContents()).map((text) => Number(text.trim()))

/** Lifts or presses the plates of the capture ladder from the keys: Tab to the roving plate, the arrows to a size, Enter. */
async function pressSizes(page: Page, walk: Walk, sizes: readonly number[]): Promise<void> {
  const ladder = await ladderOf(page)
  await tabToLocator(walk, page.locator('[aria-label="Capture sizes"] button[tabindex="0"]'))
  let at = ladder.indexOf(Number(await page.evaluate(() => document.activeElement?.textContent)))
  for (const size of sizes) {
    const to = ladder.indexOf(size)
    if (to < 0 || at < 0) throw new Error(`the ladder ${ladder.join(', ')} has no plate for ${size}`)
    for (; at < to; at++) await walk.press('ArrowRight')
    for (; at > to; at--) await walk.press('ArrowLeft')
    await page.keyboard.press('Enter')
  }
}

const full = (id: FullLevelId) => buildFullLevel(id, practiceSeed('loop', id))

const LOOP: Record<(typeof WALKED)['loop'][number], Walker> = {
  async: async (page, walk) => {
    for (const [i, world] of full('async').stages.entries()) {
      if (i > 0) await nextStage(page, walk, world.id)
      await call(page, walk, world.answer)
      await gameKey(page, walk, 'KeyO')
      await expect(page.getByRole('switch', { name: /Async scheduling/ })).toHaveAttribute('aria-checked', 'true')
      await serve(page, walk)
      // The last stage closes the level, and the result takes the dock: its tabs are gone.
      if (i < full('async').stages.length - 1) await expect(page.locator(`[data-stage-tab="${world.id}"] .es-full-stages__done`)).toHaveCount(1)
    }
    await fullDebrief(page, walk)
  },
  graphs: async (page, walk) => {
    const [comb, sizes, modes] = full('graphs').stages
    await call(page, walk, comb.answer)
    await graphMode(page, walk, comb.house.graphMode)
    await serve(page, walk)
    await nextStage(page, walk, 'sizes')
    await call(page, walk, sizes.answer)
    // The ladder: take the naive capture sizes off, then put the reference run's on, walking it with the arrows.
    await pressSizes(page, walk, sizes.start.captureSizes)
    await pressSizes(page, walk, sizes.house.captureSizes)
    for (const size of sizes.house.captureSizes) await expect(page.locator('[aria-label="Capture sizes"] button', { hasText: new RegExp(`^${size}$`) })).toHaveAttribute('aria-pressed', 'true')
    await serve(page, walk)
    await nextStage(page, walk, 'modes')
    await call(page, walk, modes.answer)
    await graphMode(page, walk, modes.house.graphMode)
    await serve(page, walk)
    await fullDebrief(page, walk)
  },
  mrv2: async (page, walk) => {
    const [small, big] = full('mrv2').stages
    await call(page, walk, small.answer)
    await gameKey(page, walk, 'KeyM')
    await expect(page.getByRole('switch', { name: /V2 model runner/ })).toHaveAttribute('aria-checked', 'true')
    await serve(page, walk)
    await nextStage(page, walk, big.id)
    await call(page, walk, big.answer)
    await serve(page, walk)
    await fullDebrief(page, walk)
  },
  close: async (page, walk) => {
    const [world] = full('close').stages
    await call(page, walk, world.answer)
    await gameKey(page, walk, 'KeyO')
    await expect(page.getByRole('switch', { name: /Async scheduling/ })).toHaveAttribute('aria-checked', String(world.house.async))
    await gameKey(page, walk, 'KeyM')
    await expect(page.getByRole('switch', { name: /V2 model runner/ })).toHaveAttribute('aria-checked', String(world.house.runner === 'mrv2'))
    await tabToLocator(walk, page.getByRole('switch', { name: /Input ids filled on the GPU/ }))
    await page.keyboard.press('Space')
    await expect(page.getByRole('switch', { name: /Input ids filled on the GPU/ })).toHaveAttribute('aria-checked', String(world.house.inputIds === 'device'))
    await graphMode(page, walk, world.house.graphMode)
    // The ladder: lift the engine's own sizes that the reference run does not capture, and press the reference run's.
    await pressSizes(page, walk, world.start.captureSizes.filter((size) => !world.house.captureSizes.includes(size)))
    await pressSizes(page, walk, world.house.captureSizes.filter((size) => !world.start.captureSizes.includes(size)))
    // One press runs the whole stage, with no Step and no Auto.
    await tabToLocator(walk, page.getByRole('button', { name: 'Run it', exact: true }))
    await page.keyboard.press('Enter')
    await fullDebrief(page, walk, 'Passed')
    await expect(page.locator('[data-full-verdict-debrief]')).toContainText('The run meets the bar.')
  },
  mask: async (page, walk) => {
    const [mask] = full('mask').stages
    await call(page, walk, mask.answer)
    await gameKey(page, walk, 'KeyO')
    await expect(page.getByRole('switch', { name: /Build the grammar mask during the forward/ })).toHaveAttribute('aria-checked', 'true')
    await serve(page, walk)
    await fullDebrief(page, walk)
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The table                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The walk of each level, by game and level: e2e/levels.ts' `WALKED` has exactly these. */
export const WALKS: { readonly [game: string]: { readonly [level: string]: Walker } } = {
  loop: LOOP,
  verifier: SAMPLER,
  'engine-floor': FLOOR,
  pool: POOL,
  'broken-bench': BENCH,
}
