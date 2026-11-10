/*
 * W1b-T02's browser checks for the lesson's prediction box, in Playwright's Chromium, on the built site (the config's `vite preview`):
 *
 *   1. A prediction is committed, and revealed after its game, by keys alone, from the top of the page, at 360 and 1280 px, with focus in view
 *      at every stop: the slip is written, the stub commits, the game block is started and played to its debrief, and the reveal stub, which
 *      was held down until a run of the game ended after the commit, is pulled. The ticket then says what was written beside what the model
 *      read from that run, and the `predict` event is in the ledger with its value, its truth, its outcome and the lesson's revision.
 *   2. A committed prediction cannot change, and nothing of the answer is on the page before the game ends: no model's number in the ticket,
 *      and not even the reading's code asked for (the reveal and the module's reading are lazy parts).
 *   3. A run that ended before the commit is no run to reveal after: the ticket waits for another.
 *   4. A prediction that no run answers prints the honest ticket: the task its reveal waits on, and no slip.
 *   5. axe finds no serious or critical violation on a lesson with its predictions asking, committed and revealed, and waiting, at 360 and
 *      1280 px.
 *
 * The truth that the page prints is compared with the truth that the pure model reads from the same run, taken here from the ledger's `play`
 * event: the log is replayed into a record, and the model is asked (packages/play/predictions). The walks are e2e/support/walks.ts's. Every
 * test is also a network check (e2e/support/site.ts).
 *
 *   npx playwright test e2e/lesson-predict.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { storedRunOf } from '../packages/play'
import { referenceFor } from '../packages/play/predictions/truth'
import { PR_WIDTHS } from './routes'
import { walkOf } from './support/front'
import { ledgerEvents, playEvents, predictEvents, startBlock } from './support/lessons'
import type { StoredPlay } from './support/lessons'
import { expect, open, quiet, test, withSettings } from './support/site'
import { WALKS } from './support/walks'
import type { Walk } from './support/walks'

const ticketOf = (page: Page, id: string): Locator => page.locator(`section[data-block="predict"][data-predict="${id}"]`)
const revealStub = (page: Page, id: string): Locator => ticketOf(page, id).getByRole('button', { name: 'Reveal the answer' })

/** The model's number as the revealed ticket prints it, less the thousands separators that the design's readouts group by ("1,986" for 1986). */
const printedTruth = async (page: Page, id: string): Promise<string> => (await ticketOf(page, id).locator('[data-truth]').innerText()).replace(/,/g, '')

/** The code that a reveal loads: the reveal itself, and a module's readings. A page that has not revealed anything has asked for none of it. */
const READING = /\/assets\/(reveal|tr1|tr2|tr5a)-[\w-]+\.js$/

/** Presses Tab until `target` has focus: the walk reads every stop on the way. */
async function tabToLocator(walk: Walk, target: Locator, limit: number): Promise<void> {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return
    await walk.press('Tab')
  }
  throw new Error(`Tab never reached ${String(target)} in ${limit} presses; it went through ${walk.trail.map((stop) => stop.name).join(' > ')}`)
}

/** The truth that the model reads from the last run of a game block, from the `play` event that the run wrote. */
async function truthFrom(page: Page, id: string, play: StoredPlay): Promise<number | string> {
  const run = storedRunOf(play)
  if (run === null) throw new Error('the play event does not replay')
  const reading = await referenceFor(id)
  if (reading === undefined) throw new Error(`no reading for ${id}`)
  return reading.truth(run)
}

interface Case {
  readonly route: string
  /** The lesson's id: the scope of the event's ref. */
  readonly lesson: string
  /** The prediction, and what the learner writes. */
  readonly id: string
  readonly write: string
  readonly ok: boolean
  /** The game block that answers it, and the walk that plays it. */
  readonly block: { game: string; level: string; mode: 'practice' }
}

const NANO: Case = { route: '/m/tr1/l1-five-mechanisms', lesson: 'tr1.l1', id: 'tr1.l1.p1', write: '0', ok: true, block: { game: 'engine-floor', level: 'nano', mode: 'practice' } }
const TWO_KINDS: Case = {
  route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches',
  lesson: 'tr5a.l1',
  id: 'tr5a.l1.p1',
  write: '250 pages',
  ok: true,
  block: { game: 'pool', level: 'two-kinds', mode: 'practice' },
}
const GRAPHS: Case = {
  route: '/m/tr2/l5-cuda-graphs-capture-replay-padding-and-modes',
  lesson: 'tr2.l5',
  id: 'tr2.l5.p1',
  write: '2000 µs',
  ok: true,
  block: { game: 'loop', level: 'graphs', mode: 'practice' },
}
const MRV2: Case = { route: '/m/tr2/l4-the-mrv2-delta', lesson: 'tr2.l4', id: 'tr2.l4.p1', write: '300 µs', ok: true, block: { game: 'loop', level: 'mrv2', mode: 'practice' } }

/** Commits by keys: from the top of the page to the slip, write, Tab to a confidence plate and press it, Enter on the slip. */
async function commitByKeys(page: Page, walk: Walk, c: Case): Promise<void> {
  const slip = ticketOf(page, c.id).getByLabel('Your number')
  await tabToLocator(walk, slip, 400)
  await page.keyboard.type(c.write)
  await page.keyboard.press('Enter')
  await expect(ticketOf(page, c.id)).toHaveAttribute('data-phase', 'committed')
  // The stub that was pulled has gone, and focus is on the ticket's own heading, so the keyboard is not left behind.
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Committed')
}

test.describe('a prediction is committed, played for, and revealed, by keys alone (acceptance 1)', () => {
  for (const width of PR_WIDTHS) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 800 } })

      test(`${NANO.route}: tr1.l1.p1 is committed before the game, held down while it is played, and revealed after it; the second prediction is wrong on purpose and says so`, async ({ page, context, watch }) => {
        test.setTimeout(300_000)
        await withSettings(context, { view3d: false })
        await open(page, NANO.route)
        await quiet(page)
        const walk = walkOf(page)
        const first = ticketOf(page, NANO.id)
        await expect(first).toHaveAttribute('data-phase', 'asking')
        // A slip that is not an answer is asked about again, and nothing is committed.
        await first.getByRole('button', { name: 'Commit answer' }).click()
        await expect(first).toContainText('Write a number, in boundaries, and then commit.')
        await expect(first).toHaveAttribute('data-phase', 'asking')

        await commitByKeys(page, walk, NANO)
        // Held down until a run of the game ends: the reveal's stub is there and cannot be pulled, and nothing of the answer is in the ticket.
        await expect(revealStub(page, NANO.id)).toBeDisabled()
        await expect(first.locator('[data-truth]')).toHaveCount(0)
        await expect(first).not.toContainText('derived')
        await expect(first.getByLabel('Your number')).toHaveCount(0)
        expect(watch.requests.filter((path) => READING.test(path)), 'the reading is not asked for before the game has been played').toEqual([])

        // The second prediction of the lesson is committed (wrong: the line holds three stages), by the mouse this time.
        const second = ticketOf(page, 'tr1.l1.p2')
        await second.getByLabel('Your number').fill('1')
        await second.getByRole('button', { name: 'Think so' }).click()
        await second.getByRole('button', { name: 'Commit answer' }).click()
        await expect(second).toHaveAttribute('data-phase', 'committed')

        // The game: from the top of the page to the block's stub, by keys, to its debrief.
        await tabToLocator(walk, page.getByRole('button', { name: 'Start level' }), 400)
        await page.keyboard.press('Enter')
        await expect(page.locator('section[data-game="engine-floor"]')).toBeVisible({ timeout: 60_000 })
        await WALKS['engine-floor'].nano(page, walk)

        // A run ended after the commit: the stub opens.
        await expect(first).toHaveAttribute('data-phase', 'ready')
        await expect(revealStub(page, NANO.id)).toBeEnabled()
        await expect(first).toContainText('The run ended. Pull the stub to reveal the answer.')
        await revealStub(page, NANO.id).focus()
        await walk.see()
        await page.keyboard.press('Enter')
        await expect(first).toHaveAttribute('data-phase', 'revealed')
        await expect.poll(() => page.evaluate(() => document.activeElement?.className ?? '')).toContain('es-item__verdict')

        // What the ticket says is what the model reads from the run that the page played.
        const [play] = await playEvents(page)
        const truth = await truthFrom(page, NANO.id, play)
        expect(truth).toBe(0)
        await expect(first).toContainText('Exactly right.')
        await expect(first.locator('[data-truth]')).toContainText(String(truth))
        await expect(first.locator('dl')).toContainText('you wrote')
        await expect(first.locator('dl')).toContainText('0 boundaries')
        await expect(first).toContainText('Read from your run of Back of House, level nano')
        expect(watch.requests.some((path) => READING.test(path)), 'the reading is asked for when the stub is pulled').toBe(true)

        await revealStub(page, 'tr1.l1.p2').focus()
        await page.keyboard.press('Enter')
        await expect(second).toHaveAttribute('data-phase', 'revealed')
        await expect(second).toContainText('Not the exact value.')
        await expect(second.locator('[data-truth]')).toContainText('3')

        expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])

        // The events are in the ledger: the value, the truth read from the run, the outcome and the lesson's revision. A prediction earns nothing.
        const rev = await page.locator('article.es-doc').getAttribute('data-rev')
        await expect.poll(async () => (await predictEvents(page)).length).toBe(2)
        const [one, two] = await predictEvents(page)
        expect(one).toMatchObject({ ref: 'predict:tr1.l1#tr1.l1.p1', ok: true, score: 1, provenance: 'practice', seed: play.seed, rev, data: { value: 0, truth: 0, unit: 'boundaries' } })
        expect(two).toMatchObject({ ref: 'predict:tr1.l1#tr1.l1.p2', ok: false, score: 0, provenance: 'practice', conf: 'think', rev, data: { value: 1, truth: 3, unit: 'stages' } })
        expect(one.conf).toBeUndefined()
        // The game's own event is there as well: the play and the predictions are three events, and none of them is a key.
        expect((await ledgerEvents(page)).length).toBe(3)

        // A committed prediction does not change: there is no slip left on the ticket, and the stub is gone.
        await expect(first.getByLabel('Your number')).toHaveCount(0)
        await expect(first.getByRole('button', { name: 'Commit answer' })).toHaveCount(0)

        // axe, with a revealed ticket, a revealed one that missed, a game open, and the rest of the lesson's tickets waiting.
        await quiet(page)
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
        expect(results.passes.length + results.violations.length, 'the rules that axe ran').toBeGreaterThan(20)
        const blocking = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
        expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`)).toEqual([])
        expect(results.violations.filter((violation) => ['heading-order', 'empty-heading', 'page-has-heading-one'].includes(violation.id)).map((violation) => violation.id)).toEqual([])
        console.log(`axe ${NANO.route} at ${width} px, revealed: ${results.violations.length === 0 ? 'no violation' : results.violations.map((violation) => `${violation.id} [${violation.impact}] on ${violation.nodes.length}`).join(', ')}`)
      })
    })
  }
})

test.describe('each module that has a reading reveals against the model, in its own unit (acceptance 1)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const c of [TWO_KINDS, MRV2, GRAPHS]) {
    test(`${c.route}: ${c.id} written as "${c.write}", revealed after ${c.block.game}/${c.block.level}`, async ({ page, context }) => {
      test.setTimeout(300_000)
      await withSettings(context, { view3d: false })
      await open(page, c.route)
      await quiet(page)
      const walk = walkOf(page)
      await commitByKeys(page, walk, c)
      await startBlock(page, c.block)
      await WALKS[c.block.game][c.block.level](page, walk)
      await expect(ticketOf(page, c.id)).toHaveAttribute('data-phase', 'ready')
      await revealStub(page, c.id).focus()
      await page.keyboard.press('Enter')
      await expect(ticketOf(page, c.id)).toHaveAttribute('data-phase', 'revealed')
      const plays = (await playEvents(page)).filter((event) => event.ref === `play:${c.block.game}/${c.block.level}`)
      const truth = await truthFrom(page, c.id, plays[plays.length - 1])
      await expect.poll(() => printedTruth(page, c.id)).toContain(String(truth))
      await expect(ticketOf(page, c.id)).toContainText(c.ok ? 'Within the tolerance.' : 'Outside the tolerance.')
      const [event] = await predictEvents(page)
      expect(event).toMatchObject({ ref: `predict:${c.lesson}#${c.id}`, ok: c.ok, provenance: 'practice' })
      expect(event.data.truth).toBe(truth)
    })
  }
})

test.describe('a run that ended before the commit is no run to reveal after (acceptance 2)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test(`${NANO.route}: the level is played first and the prediction committed after: the reveal stays held down, and a second commit is not offered`, async ({ page, context }) => {
    test.setTimeout(300_000)
    await withSettings(context, { view3d: false })
    await open(page, NANO.route)
    await quiet(page)
    const walk = walkOf(page)
    await startBlock(page, NANO.block)
    await WALKS['engine-floor'].nano(page, walk)
    await expect.poll(async () => (await playEvents(page)).length).toBe(1)
    // The prediction is written after the answer has been seen: it is committed, and the reveal does not open for that run.
    const ticket = ticketOf(page, NANO.id)
    await ticket.getByLabel('Your number').fill('0')
    await ticket.getByRole('button', { name: 'Commit answer' }).click()
    await expect(ticket).toHaveAttribute('data-phase', 'committed')
    await expect(revealStub(page, NANO.id)).toBeDisabled()
    await expect(ticket).toContainText('Play Back of House, level nano, below.')
    await quiet(page)
    await expect(ticket).toHaveAttribute('data-phase', 'committed')
    expect(await predictEvents(page)).toEqual([])
  })
})

test.describe('the block that answers a prediction is the first of its game and level after it (acceptance 2)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('/m/tr5a/l4: the first prediction waits for the practice `adapters` block below it, and the second for the graded one, which the ticket names', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots')
    for (const [id, write] of [['tr5a.l4.p1', '7'], ['tr5a.l4.p2', '87.5']] as const) {
      await ticketOf(page, id).getByLabel('Your number').fill(write)
      await ticketOf(page, id).getByRole('button', { name: 'Commit answer' }).click()
      await expect(ticketOf(page, id)).toHaveAttribute('data-phase', 'committed')
    }
    await expect(ticketOf(page, 'tr5a.l4.p1')).toContainText('Play The Reach-In, level adapters, below.')
    await expect(ticketOf(page, 'tr5a.l4.p2')).toContainText('Play The Reach-In, level adapters (graded), below.')
    expect(await predictEvents(page)).toEqual([])
  })
})

test.describe('a prediction that no run answers prints the honest ticket (acceptance 3)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('/m/tr8/l1-due-time-not-send-time: no slip, the task its reveal waits on, a stub held down, and nothing to commit', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/m/tr8/l1-due-time-not-send-time')
    const ticket = ticketOf(page, 'tr8.l1.p1')
    await expect(ticket).toHaveAttribute('data-phase', 'unbuilt')
    await expect(ticket).toHaveAttribute('data-placeholder', 'W2-T43')
    await expect(ticket).toContainText('Its reveal waits on')
    await expect(ticket).toContainText('W2-T43')
    await expect(ticket.getByRole('button', { name: 'Commit answer' })).toBeDisabled()
    await expect(ticket.getByLabel('Your number')).toHaveCount(0)
    expect(await predictEvents(page)).toEqual([])
  })
})

test.describe('with predictions asking and waiting, axe finds no serious or critical violation (acceptance 5)', () => {
  const IMPACTS = new Set(['serious', 'critical'])
  for (const width of PR_WIDTHS) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 800 } })
      // tr6.l4 holds the one choice prediction, which waits; tr5a.l4 two that a run answers; tr2.l7 the one whose lesson has no game.
      for (const route of ['/m/tr6/l4-proposers', '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots', '/m/tr2/l7-the-same-loop-elsewhere']) {
        test(route, async ({ page, context }) => {
          await withSettings(context, { view3d: false })
          await open(page, route)
          await quiet(page)
          expect(await page.locator('section[data-block="predict"]').count()).toBeGreaterThan(0)
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
          expect(results.passes.length + results.violations.length, 'the rules that axe ran').toBeGreaterThan(20)
          const blocking = results.violations.filter((violation) => IMPACTS.has(violation.impact ?? ''))
          expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`)).toEqual([])
          const rest = results.violations.map((violation) => `${violation.id} [${violation.impact}] on ${violation.nodes.length}`)
          console.log(`axe ${route} at ${width} px: ${rest.length === 0 ? 'no violation' : rest.join(', ')}`)
        })
      }
    })
  }
})
