/*
 * W1b-T02's browser checks for the lesson's guesses, as the lesson template places them (R-T10, REDESIGN §2.5), in Playwright's Chromium,
 * on the built site (the config's `vite preview`):
 *
 *   1. A guess is committed, and revealed after its run, by keys alone, from the top of the page, at 360 and 1280 px, with focus in view at
 *      every stop. A guess that the level's own opening guess asks too (same.ts) is asked once, in the instrument's slot, in the lesson's
 *      words; another sits just above the instrument. When a run of the level ends after the commit, each shows what was written beside
 *      what the model read from that run, and the `predict` event is in the ledger with its value, its truth, its outcome and the lesson's
 *      revision.
 *   2. A committed guess cannot change, and nothing of the answer is on the page before the run ends: no model's number, and not even the
 *      reading's code asked for (the reveal and the module's reading are lazy parts).
 *   3. A run that ended before the commit is no run to reveal after: the guess waits for another.
 *   4. A guess that no run answers is revealed at commit (R-T09, D-067): after Commit it shows the learner's value, the answer and its working
 *      at once, and writes one `predict` event with both. No lock and no task id is on it.
 *   5. axe finds no serious or critical violation on a lesson with its guesses asking, committed and revealed, and revealed at commit, at 360
 *      and 1280 px.
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

/** The model's number as the revealed ticket prints it, less the thousands separators that the design's readouts group by ("1,986" for 1986). */
const printedTruth = async (page: Page, id: string): Promise<string> => (await ticketOf(page, id).locator('[data-truth]').innerText()).replace(/,/g, '')

/** The code that a reveal loads: the reveal itself, and a module's readings. A page that has not revealed anything has asked for none of it. */
const READING = /\/assets\/(reveal|tr1|tr2|tr5a|commit-tr[0-9a-z]+)-[\w-]+\.js$/

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
  // The slip has gone, and focus is on the line that locks it in, so the keyboard is not left behind.
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Locked in:')
}

test.describe('a guess is committed, played for, and revealed, by keys alone (acceptance 1)', () => {
  for (const width of PR_WIDTHS) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 800 } })

      test(`${NANO.route}: tr1.l1.p2 sits above the run and tr1.l1.p1 is asked in the run's own slot, once; both are revealed when the run ends, and the second is wrong on purpose and says so`, async ({ page, context, watch }) => {
        test.setTimeout(300_000)
        await withSettings(context, { view3d: false })
        await open(page, NANO.route)
        await quiet(page)
        const walk = walkOf(page)
        const first = ticketOf(page, NANO.id)
        const second = ticketOf(page, 'tr1.l1.p2')
        // The paired guess is not asked where it was written: the level's slot asks it.
        await expect(first).toHaveCount(0)
        await expect(second).toHaveAttribute('data-phase', 'asking')
        // A slip that is not an answer is asked about again, and nothing is committed.
        await second.getByRole('button', { name: 'Commit answer' }).click()
        await expect(second).toContainText('Write a number, in stages, and then commit.')
        await expect(second).toHaveAttribute('data-phase', 'asking')
        await commitByKeys(page, walk, { ...NANO, id: 'tr1.l1.p2', write: '1', ok: false })
        await expect(second.locator('[data-truth]')).toHaveCount(0)
        await expect(second.getByLabel('Your number')).toHaveCount(0)
        expect(watch.requests.filter((path) => READING.test(path)), 'the reading is not asked for before the run has been played').toEqual([])

        // The run: by keys, from where focus is to the run's control, then the level, whose slot asks the lesson's own question.
        await tabToLocator(walk, page.getByRole('button', { name: /^Play: / }), 400)
        await page.keyboard.press('Enter')
        await expect(page.locator('section[data-game="engine-floor"]')).toBeVisible({ timeout: 60_000 })
        // A first meeting with the game names its parts before the slot asks (R-T29, P4): Next walks them, then the slot holds the lesson's words.
        const floor = page.locator('section[data-game="engine-floor"]')
        await floor.locator('[data-prediction]').first().waitFor({ state: 'attached' })
        for (let guard = 0; guard < 40 && (await floor.locator('[data-prediction][data-waiting]').count()) > 0; guard++) {
          if ((await floor.locator('[data-intro-next]').count()) > 0) await floor.locator('[data-intro-next]').click()
          else await page.waitForTimeout(100)
        }
        await expect(floor.locator('[data-prediction]')).toContainText("In nano-vllm's offline LLM.generate on one GPU")
        await WALKS['engine-floor'].nano(page, walk)

        // A run ended after the commits: both reveal on their own, beside the run.
        await expect(first).toHaveAttribute('data-phase', 'revealed', { timeout: 30_000 })
        await expect(second).toHaveAttribute('data-phase', 'revealed')
        const [play] = await playEvents(page)
        const truth = await truthFrom(page, NANO.id, play)
        expect(truth).toBe(0)
        await expect(first).toContainText('Exactly right.')
        await expect(first.locator('[data-truth]')).toContainText(String(truth))
        await expect(first.locator('dl')).toContainText('you wrote')
        await expect(first.locator('dl')).toContainText('0 boundaries')
        await expect(first).toContainText('Read from your run of Request path')
        await expect(second).toContainText('Not the exact value.')
        await expect(second.locator('[data-truth]')).toContainText('3')
        expect(watch.requests.some((path) => READING.test(path)), 'the reading is asked for when the run ends').toBe(true)
        expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])

        // The events are in the ledger: the value, the truth read from the run, the outcome and the lesson's revision. A guess earns nothing.
        const rev = await page.locator('.es-lesson').getAttribute('data-rev')
        await expect.poll(async () => (await predictEvents(page)).map((event) => event.ref).sort()).toEqual(['predict:tr1.l1#tr1.l1.p1', 'predict:tr1.l1#tr1.l1.p2'])
        const events = await predictEvents(page)
        const one = events.find((event) => event.ref === 'predict:tr1.l1#tr1.l1.p1')
        const two = events.find((event) => event.ref === 'predict:tr1.l1#tr1.l1.p2')
        expect(one).toMatchObject({ ok: true, score: 1, provenance: 'practice', seed: play.seed, rev, data: { value: 0, truth: 0, unit: 'boundaries' } })
        expect(two).toMatchObject({ ok: false, score: 0, provenance: 'practice', rev, data: { value: 1, truth: 3, unit: 'stages' } })
        // The game's own event is there as well: the play and the guesses are three events.
        expect((await ledgerEvents(page)).length).toBe(3)

        // A committed guess does not change: no slip is left, and no Commit.
        await expect(second.getByLabel('Your number')).toHaveCount(0)
        await expect(page.locator('section[data-block="predict"]').getByRole('button', { name: 'Commit answer' })).toHaveCount(0)

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

  for (const c of [MRV2, GRAPHS]) {
    test(`${c.route}: ${c.id} written as "${c.write}", revealed after ${c.block.game}/${c.block.level}`, async ({ page, context }) => {
      test.setTimeout(300_000)
      await withSettings(context, { view3d: false })
      await open(page, c.route)
      await quiet(page)
      const walk = walkOf(page)
      await commitByKeys(page, walk, c)
      await startBlock(page, c.block)
      await WALKS[c.block.game][c.block.level](page, walk)
      await expect(ticketOf(page, c.id)).toHaveAttribute('data-phase', 'revealed', { timeout: 30_000 })
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

test.describe("the reference lesson's guess is the level's opening guess, asked once in its slot (acceptance 1)", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test(`${TWO_KINDS.route}: the first level opens with the page, the second follows it, and its slot asks the lesson's question; the reveal reads the run`, async ({ page, context }) => {
    test.setTimeout(300_000)
    await withSettings(context, { view3d: false })
    await open(page, TWO_KINDS.route)
    const walk = walkOf(page)
    const one = { game: 'pool', level: 'one-group', mode: 'practice' } as const
    await startBlock(page, one)
    const inGame = () => page.evaluate(() => document.activeElement?.closest('[data-game]') != null)
    for (let presses = 0; presses < 400 && !(await inGame()); presses++) await walk.press('Tab')
    await WALKS.pool['one-group'](page, walk)
    // Nothing was asked of the lesson's guess yet: it waits for the second level's slot.
    await expect(ticketOf(page, TWO_KINDS.id)).toHaveCount(0)
    await startBlock(page, TWO_KINDS.block)
    await expect(page.locator('[data-play="pool/one-group"]')).toHaveAttribute('data-phase', 'folded')
    await page.locator('[data-game="pool"] :is(.es-intro, [data-pool-predict])').first().waitFor()
    await WALKS.pool['two-kinds'](page, walk)
    const ticket = ticketOf(page, TWO_KINDS.id)
    await expect(ticket).toHaveAttribute('data-phase', 'revealed', { timeout: 30_000 })
    const plays = (await playEvents(page)).filter((event) => event.ref === 'play:pool/two-kinds')
    const truth = await truthFrom(page, TWO_KINDS.id, plays[plays.length - 1])
    await expect.poll(() => printedTruth(page, TWO_KINDS.id)).toContain(String(truth))
    const [event] = await predictEvents(page)
    expect(event).toMatchObject({ ref: `predict:${TWO_KINDS.lesson}#${TWO_KINDS.id}`, provenance: 'practice' })
    expect(event.data.truth).toBe(truth)
    const value = Number(event.data.value)
    expect(event.ok).toBe(Math.abs(value - Number(truth)) <= 0.05 * Math.abs(Number(truth)))
  })
})

test.describe('a run that ended before the commit is no run to reveal after (acceptance 2)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test(`${MRV2.route}: the level is played first and the guess committed after: the reveal waits, and a second commit is not offered`, async ({ page, context }) => {
    test.setTimeout(300_000)
    await withSettings(context, { view3d: false })
    await open(page, MRV2.route)
    await quiet(page)
    const walk = walkOf(page)
    await startBlock(page, MRV2.block)
    await WALKS.loop.mrv2(page, walk)
    await expect.poll(async () => (await playEvents(page)).length).toBe(1)
    // The guess is written after the answer has been seen: it is committed, and the reveal does not open for that run.
    const ticket = ticketOf(page, MRV2.id)
    await ticket.getByLabel('Your number').fill('300')
    await ticket.getByRole('button', { name: 'Commit answer' }).click()
    await expect(ticket).toHaveAttribute('data-phase', 'committed')
    await expect(ticket).toContainText('The run answers it when it ends.')
    await quiet(page)
    await expect(ticket).toHaveAttribute('data-phase', 'committed')
    await expect(ticket.getByRole('button', { name: 'Commit answer' })).toHaveCount(0)
    expect(await predictEvents(page)).toEqual([])
  })
})

test.describe('a guess whose run is further down says which run answers it (acceptance 2)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('/m/tr5a/l4: the first guess is asked in the practice `adapters` run’s slot, and the second waits for the graded level, which it names', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots')
    await expect(ticketOf(page, 'tr5a.l4.p1')).toHaveCount(0)
    await ticketOf(page, 'tr5a.l4.p2').getByLabel('Your number').fill('87.5')
    await ticketOf(page, 'tr5a.l4.p2').getByRole('button', { name: 'Commit answer' }).click()
    await expect(ticketOf(page, 'tr5a.l4.p2')).toHaveAttribute('data-phase', 'committed')
    await expect(ticketOf(page, 'tr5a.l4.p2')).toContainText('The graded level in the Test answers it, in its graded run.')
    expect(await predictEvents(page)).toEqual([])
  })
})

test.describe('a prediction that no run answers is revealed at commit (acceptance 4)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('/m/tr8/l1-due-time-not-send-time: a live Commit, no lock and no task id, and the answer with its working the moment it is committed, by keys', async ({ page, context, watch }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/m/tr8/l1-due-time-not-send-time')
    await quiet(page)
    const ticket = ticketOf(page, 'tr8.l1.p1')
    await expect(ticket).toHaveAttribute('data-phase', 'asking')
    await expect(ticket).not.toContainText('waits on')
    await expect(ticket).not.toContainText(/W\d-T\d\d/)
    await expect(ticket.getByRole('button', { name: 'Commit answer' })).toBeEnabled()
    // Nothing of the answer, and none of the model's part, before the commit.
    await expect(ticket.locator('[data-truth]')).toHaveCount(0)
    expect(watch.requests.filter((path) => READING.test(path))).toEqual([])
    // A slip that is not an answer is asked about again.
    await ticket.getByRole('button', { name: 'Commit answer' }).click()
    await expect(ticket).toContainText('Write a number, in ms, and then commit.')
    await expect(ticket).toHaveAttribute('data-phase', 'asking')
    const walk = walkOf(page)
    await tabToLocator(walk, ticket.getByLabel('Your number'), 400)
    await page.keyboard.type('100 ms')
    await page.keyboard.press('Enter')
    await expect(ticket).toHaveAttribute('data-phase', 'revealed')
    await expect.poll(() => page.evaluate(() => document.activeElement?.className ?? '')).toContain('es-guess__verdict')
    await expect(ticket).toContainText('Within the tolerance.')
    await expect(ticket.locator('dl')).toContainText('you wrote')
    await expect(ticket.locator('[data-truth]')).toContainText('100')
    await expect(ticket.locator('.es-guess__working li').first()).toBeVisible()
    await expect(ticket.locator('[data-truth]')).toContainText('derived')
    await expect(ticket.getByRole('button', { name: 'Commit answer' })).toHaveCount(0)
    expect(watch.requests.some((path) => READING.test(path)), "the model's part is asked for when the answer is committed").toBe(true)
    // One event, with the value and the truth, and no seed: no run was read.
    await expect.poll(async () => (await predictEvents(page)).length).toBe(1)
    const [event] = await predictEvents(page)
    expect(event).toMatchObject({ ref: 'predict:tr8.l1#tr8.l1.p1', ok: true, score: 1, provenance: 'practice', data: { value: 100, truth: 100, unit: 'ms' } })
    expect(event.seed).toBeUndefined()
    expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
  })

  test('/m/tr6/l4-proposers: a choice is committed and revealed at once, with the claims it is read from', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/m/tr6/l4-proposers')
    const ticket = ticketOf(page, 'tr6.l4.p1')
    await ticket.getByLabel('MRV1, with async scheduling off').check()
    await ticket.getByRole('button', { name: 'Sure' }).click()
    await ticket.getByRole('button', { name: 'Commit answer' }).click()
    await expect(ticket).toHaveAttribute('data-phase', 'revealed')
    await expect(ticket).toContainText('Right.')
    await expect(ticket.locator('.es-guess__source').first()).toContainText('vLLM v0.33.0')
    await expect(ticket.locator('.es-guess__working-head')).toContainText('measured')
    const [event] = await predictEvents(page)
    expect(event).toMatchObject({ ref: 'predict:tr6.l4#tr6.l4.p1', ok: true, conf: 'sure', data: { value: 'mrv1-off', truth: 'mrv1-off' } })
  })
})

test.describe('with predictions asking and revealed at commit, axe finds no serious or critical violation (acceptance 5)', () => {
  const IMPACTS = new Set(['serious', 'critical'])
  for (const width of PR_WIDTHS) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 800 } })
      // tr6.l4 holds the one choice prediction, revealed at commit; tr5a.l4 two that a run answers; tr2.l7 the one whose lesson has no game, also revealed at commit.
      for (const route of ['/m/tr6/l4-proposers', '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots', '/m/tr2/l7-the-same-loop-elsewhere']) {
        test(route, async ({ page, context }) => {
          await withSettings(context, { view3d: false })
          await open(page, route)
          await quiet(page)
          expect(await page.locator('section[data-block="predict"]').count()).toBeGreaterThan(0)
          // A prediction that is revealed at commit is committed first, so that axe reads the ticket with its working too.
          const atCommit = page.locator('section[data-block="predict"][data-reveal="at-commit"]').first()
          if ((await atCommit.count()) > 0) {
            if ((await atCommit.getByLabel('Your number').count()) > 0) await atCommit.getByLabel('Your number').fill('1')
            else await atCommit.getByRole('radio').first().check()
            await atCommit.getByRole('button', { name: 'Commit answer' }).click()
            await expect(atCommit).toHaveAttribute('data-phase', 'revealed')
          }
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
