/*
 * W1b-T01's acceptance checks for the lessons' game blocks, in Playwright's Chromium, on the built site (the config's `vite preview`):
 *
 *   1. Each of the 40 game blocks of the lessons starts its level in the lesson, in its mode: the game opens under the ticket at the
 *      block's level, and a graded block on a seed of its own, drawn when it starts. A keyboard walk per game plays a lesson's block to
 *      its debrief by keys alone, from the top of the page, at 360 and 1280 px, with focus in view at every stop, and the run is written
 *      to the ledger as a `play` event.
 *   3. A graded block writes the same `play` event as the game's own page does for the same run: the same entropy and the same keys on
 *      both, and the two events compared, the lesson's carrying the lesson's revision besides (src/games/kit/record.ts).
 *   5. axe finds no serious or critical violation on a lesson with its embeds open, at 360 and 1280 px.
 *   And the lesson's first paint holds none of a game: no game, no scene and no three are asked for until the learner starts a level.
 *   (2, one live 3D canvas, is e2e/lesson-games-scene.spec.ts, which reads the scenes' counts through the test build's hook. 4 is
 *   verify:bundle's, and 6 is tests/content/pending.test.ts.)
 *
 * The walks are e2e/support/walks.ts's, which play the same levels on the games' own pages, run here inside the lesson with the 3D scene
 * off, so that nothing moves under them. Every test is also a network check (e2e/support/site.ts): a request off the origin, a refusal of
 * the page's policy or an error on the page fails it.
 *
 *   npx playwright test e2e/lesson-games.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator } from '@playwright/test'
import { GAMES, drawInBand, levelOf } from '../packages/play'
import { POOL_PARTS } from '../packages/play/pool/copy'
import { benchSession } from '../packages/play/broken-bench/session'
import { PR_WIDTHS } from './routes'
import { walkOf } from './support/front'
import { embedOf, lessonGames, openerOfRoute, playEvents, startBlock, ticketOf, type LessonGame, type StoredPlay } from './support/lessons'
import { expect, open, quiet, test, withSettings } from './support/site'
import { benchLevelWalk, WALKS, type Walk } from './support/walks'

declare global {
  interface Window {
    __queue?: number[]
  }
}

const BLOCKS = lessonGames()
const lessonsOf = (blocks: readonly LessonGame[]) => [...new Set(blocks.map((block) => block.route))]

/** A level's title, as the game's tape prints it beside the mode. */
function titleOf(block: LessonGame): string {
  const game = GAMES.get(block.game)
  const level = game === undefined ? undefined : levelOf(game, block.level)
  if (level === undefined) throw new Error(`the registry has no level ${block.game}/${block.level}`)
  return level.title
}

/** Presses Tab until `target` has focus: the walk reads every stop on the way. */
async function tabToLocator(walk: Walk, target: Locator, limit: number): Promise<void> {
  for (let presses = 0; presses < limit; presses++) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return
    await walk.press('Tab')
  }
  throw new Error(`Tab never reached ${String(target)} in ${limit} presses; it went through ${walk.trail.map((stop) => stop.name).join(' > ')}`)
}

test.describe('the blocks', () => {
  test('are the 42 that the course holds, in 26 of the 27 lessons', () => {
    expect(BLOCKS.length).toBe(42)
    expect(lessonsOf(BLOCKS).length).toBe(26)
  })
})

test.describe('each block starts its level in the lesson (acceptance 1)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const route of lessonsOf(BLOCKS)) {
    test(`${route}: every game block opens its game at its level and in its mode`, async ({ page, context }) => {
      test.setTimeout(240_000)
      await withSettings(context, { view3d: false })
      await open(page, route)
      for (const block of BLOCKS.filter((candidate) => candidate.route === route)) {
        const game = await startBlock(page, block)
        await expect(game).toHaveAttribute('data-game', block.game)
        await expect(game).toHaveAttribute('data-level', block.level)
        await expect(game).toHaveAttribute('data-mode', block.mode)
        // The game's tape names the level and the mode, as on the game's own page.
        await expect(game).toContainText(`${titleOf(block)} · ${block.mode}`)
        // A graded block's run is on a seed of its own, drawn when the level started; a practice block's on the level's pinned seed.
        const practiceSeed = levelOf(GAMES.get(block.game)!, block.level)!.practiceSeed
        const seed = Number(await game.getAttribute('data-seed'))
        if (block.mode === 'graded') expect(seed, `${block.game}/${block.level} graded`).not.toBe(practiceSeed)
        else expect(seed, `${block.game}/${block.level} practice`).toBe(practiceSeed)
      }
    })
  }
})

/** The block of each game that a keyboard walks, in a lesson that holds it: each game's first level, as walks.spec.ts walks on the page. */
const WALKED: readonly LessonGame[] = [
  { route: '/m/tr2/l3-async-scheduling-closes-the-bubble', game: 'loop', level: 'async', mode: 'practice' },
  { route: '/m/tr6/l2-the-rejection-sampler-exactly', game: 'verifier', level: 'overlap', mode: 'practice' },
  { route: '/m/tr1/l1-five-mechanisms', game: 'engine-floor', level: 'nano', mode: 'practice' },
  { route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches', game: 'pool', level: 'one-group', mode: 'practice' },
  { route: '/m/tr8/l1-due-time-not-send-time', game: 'broken-bench', level: 'due', mode: 'practice' },
]

for (const width of PR_WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    for (const block of WALKED) {
      test(`${block.route}: the keys alone start ${block.game}'s "${block.level}" in the lesson and play it to its debrief, with focus in view at every stop, and the run is written`, async ({ page, context }) => {
        test.setTimeout(300_000)
        expect(BLOCKS).toContainEqual(block)
        await withSettings(context, { view3d: false })
        await open(page, block.route)
        const walk = walkOf(page)
        // From the top of the page to the block's control, a stop at a time, as a keyboard user goes. A lesson's opening run is on the page
        // when it loads, and takes no focus: the keyboard reaches the game by Tab.
        const game = embedOf(page, block)
        if ((await ticketOf(page, block).getAttribute('data-phase')) === 'open') {
          await expect(game).toBeVisible({ timeout: 60_000 })
          const inGame = () => page.evaluate((id) => document.activeElement?.closest('[data-game]')?.getAttribute('data-game') === id, block.game)
          for (let presses = 0; presses < 400 && !(await inGame()); presses++) await walk.press('Tab')
          expect(await inGame(), 'Tab reaches the opening run').toBe(true)
        } else {
          await tabToLocator(walk, ticketOf(page, block).getByRole('button', { name: /^(Play|Next level)/ }), 400)
          await page.keyboard.press('Enter')
          await expect(game).toBeVisible({ timeout: 60_000 })
          // The control has gone with the run's wait, and focus is on the game, so its keys work at once.
          await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game') ?? null)).toBe(block.game)
        }
        await WALKS[block.game][block.level](page, walk)
        expect(walk.trail.length, 'stops that the walk read').toBeGreaterThan(5)
        expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
        // The run is in the ledger: a practice run of the block's level, from the lesson (its revision on it).
        const rev = await page.locator('.es-lesson').getAttribute('data-rev')
        await expect.poll(async () => (await playEvents(page)).map((event) => [event.ref, event.provenance, event.rev])).toEqual([[`play:${block.game}/${block.level}`, 'practice', rev]])
      })
    }
  })
}

test.describe('a graded block writes the same play event as the game\'s own page (acceptance 3)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  /** The entropy both pages draw from: the same seed in both, from `drawInBand`, as a graded run draws it. */
  const ENTROPY = 0x5eed_1b01
  const seed = drawInBand(benchSession, 'due', ENTROPY)

  test.beforeEach(async ({ context }) => {
    // The page's entropy is answered from `window.__queue` when it holds enough, and is the browser's own otherwise (as e2e/items.spec.ts).
    await context.addInitScript(() => {
      window.__queue = []
      const real = crypto.getRandomValues.bind(crypto)
      crypto.getRandomValues = ((array: ArrayBufferView) => {
        const queue = window.__queue ?? []
        if (array instanceof Uint32Array && queue.length >= array.length) {
          for (let at = 0; at < array.length; at += 1) array[at] = queue.shift() ?? 0
          return array
        }
        return real(array as Uint32Array)
      }) as typeof crypto.getRandomValues
    })
    await withSettings(context, { view3d: false })
  })

  /** The event without what stamping adds (its id, its time and its device) and without the lesson's revision. */
  const comparable = ({ id, at, tz, day, dev, rev, ...rest }: StoredPlay) => {
    void [id, at, tz, day, dev, rev]
    return rest
  }

  test("The Inspection's graded `due`: the lesson's block and /play/broken-bench, on one seed with one filing, write one event", async ({ page }) => {
    test.setTimeout(240_000)
    const walk = walkOf(page)
    // In the lesson: the graded block draws its seed when the level starts.
    const block: LessonGame = { route: '/m/tr8/l1-due-time-not-send-time', game: 'broken-bench', level: 'due', mode: 'graded' }
    expect(BLOCKS).toContainEqual(block)
    await open(page, block.route)
    await page.evaluate((entropy) => {
      window.__queue = [entropy]
    }, ENTROPY)
    const game = await startBlock(page, block)
    await expect(game).toHaveAttribute('data-seed', String(seed))
    await benchLevelWalk('due', seed)(page, walk)
    await expect.poll(async () => (await playEvents(page)).length).toBe(1)
    const [lesson] = await playEvents(page)
    const lessonRev = await page.locator('.es-lesson').getAttribute('data-rev')

    // On the game's own page: the same level, a graded attempt started from its docket, the same entropy and the same filing.
    await open(page, '/play/broken-bench?level=due')
    await page.evaluate((entropy) => {
      window.__queue = [entropy]
    }, ENTROPY)
    await page.getByRole('button', { name: 'Start a graded attempt' }).click()
    await expect(page.locator('section[data-game="broken-bench"]')).toHaveAttribute('data-seed', String(seed))
    await benchLevelWalk('due', seed)(page, walkOf(page))
    await expect.poll(async () => (await playEvents(page)).length).toBe(2)
    const [, own] = await playEvents(page)

    expect(lesson.ref).toBe('play:broken-bench/due')
    expect([lesson.provenance, lesson.seed, lesson.ok]).toEqual(['unseen', seed, true])
    expect(comparable(lesson)).toEqual(comparable(own))
    // What differs is what the lesson adds: its content revision (A§4.2), which a game's page has none of.
    expect(lesson.rev).toBe(lessonRev ?? '')
    expect(own.rev).toBeUndefined()
  })
})

test.describe('with the embeds open, axe finds no serious or critical violation (acceptance 5)', () => {
  const IMPACTS = new Set(['serious', 'critical'])
  for (const width of PR_WIDTHS) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 800 } })
      for (const route of ['/m/tr2/l3-async-scheduling-closes-the-bubble', '/m/tr5a/l4-adapters-as-pages-and-upstreams-slots']) {
        test(`${route}, every game block open`, async ({ page, context }) => {
          test.setTimeout(240_000)
          await withSettings(context, { view3d: false })
          await open(page, route)
          for (const block of BLOCKS.filter((candidate) => candidate.route === route)) await startBlock(page, block)
          await quiet(page)
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
          expect(results.passes.length + results.violations.length, 'the rules that axe ran').toBeGreaterThan(20)
          const blocking = results.violations.filter((violation) => IMPACTS.has(violation.impact ?? ''))
          expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`)).toEqual([])
          // The heading outline holds with the games' headings in it, a level under the lesson's.
          expect(results.violations.filter((violation) => ['heading-order', 'empty-heading', 'page-has-heading-one'].includes(violation.id)).map((violation) => violation.id)).toEqual([])
          const rest = results.violations.map((violation) => `${violation.id} [${violation.impact}] on ${violation.nodes.length}`)
          console.log(`axe ${route} at ${width} px with its games open: ${rest.length === 0 ? 'no violation' : rest.join(', ')}`)
        })
      }
    })
  }
})

test.describe("the lesson's first paint holds none of a game", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('no game, no scene and no three are asked for until a level starts; then the block loads them, 3D included where the device draws it', async ({ page, watch }) => {
    test.setTimeout(180_000)
    // A lesson that opens on a run (opener A or B) starts it with the page, so its game is on the first paint by design (REDESIGN §2.5). One
    // that reads first (opener C) holds its game until the learner starts it. And a level opens on its diagram: the scene waits for the 3D switch.
    const route = '/m/tr2/l2-one-token-budget'
    const block = { game: 'loop', level: 'first-2-slot', mode: 'practice' } as const
    expect(openerOfRoute(route)).toBe('C')
    expect(BLOCKS).toContainEqual({ route, ...block })
    await open(page, route)
    await quiet(page)
    // The lesson reads the ledger after its first paint (its rail and its record), and the level titles from the games' data registry, which
    // shares its chunk's name with the component registry: neither is a game. No game's code, no scene and no three come before a level starts.
    const before = /\/assets\/(GameEmbed|Game|Scene3D|three-vendor|record)-[\w-]+\.(js|css)$/
    expect(watch.requests.filter((path) => before.test(path))).toEqual([])
    const game = /\/assets\/(GameEmbed|Game|registry|Scene3D|three-vendor|useEvidence|record)-[\w-]+\.(js|css)$/
    await startBlock(page, block)
    const askedOf = () => watch.requests.filter((path) => game.test(path)).map((path) => /\/assets\/([A-Za-z0-9]+)-/.exec(path)?.[1])
    for (const chunk of ['GameEmbed', 'registry', 'Game']) expect(askedOf(), chunk).toContain(chunk)
    for (const chunk of ['Scene3D', 'three']) expect(askedOf(), `${chunk} before the 3D switch`).not.toContain(chunk)
    await embedOf(page, block).getByRole('button', { name: '3D', exact: true }).click()
    await expect(page.locator('.es-stage[data-stage-phase="live"]')).toHaveCount(1, { timeout: 90_000 })
    for (const chunk of ['Scene3D', 'three']) expect(askedOf(), chunk).toContain(chunk)
  })
})

/*
 * R-T10: the lesson template (REDESIGN §2.5 and §3.4), on TR5a lesson 1, the reference lesson: opener A, its two opening levels in Run one
 * after the other, the rail that tells the run back, nothing collapsed, the claims as numbered marks, Keep's way on, and the strip and the
 * foot bar on a phone, which never hide the focused control (WCAG 2.4.11) and are not sticky under 600 px of height.
 */
const REFERENCE = '/m/tr5a/l1-why-one-model-needs-several-kv-caches'
const ONE_GROUP = { game: 'pool', level: 'one-group', mode: 'practice' } as const
const TWO_KINDS = { game: 'pool', level: 'two-kinds', mode: 'practice' } as const

test.describe('the lesson template, at 1440 x 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the reference lesson opens on its run: the first control in the first viewport, both levels in Run one after the other, and the rail tells the run back', async ({ page, context }) => {
    test.setTimeout(300_000)
    await withSettings(context, { view3d: false })
    await open(page, REFERENCE)
    await expect(page.locator('.es-lesson')).toHaveAttribute('data-opener', 'A')
    const first = ticketOf(page, ONE_GROUP)
    await expect(first).toHaveAttribute('data-phase', 'open')
    const game = embedOf(page, ONE_GROUP)
    await expect(game).toBeVisible({ timeout: 60_000 })
    const top = await game.locator('button').first().evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
    expect(top, 'the run’s first control is in the first viewport').toBeLessThan(900)
    await expect(page.locator('#run [data-play="pool/one-group"]')).toHaveCount(1)
    await expect(page.locator('#run [data-play="pool/two-kinds"]')).toHaveCount(1)
    const second = ticketOf(page, TWO_KINDS)
    await expect(second).toHaveAttribute('data-phase', 'waiting')
    const next = second.getByRole('button', { name: /^Next level: Full attention and a sliding window/ })
    await expect(next).toHaveAttribute('data-emphasis', 'outline')

    // The rail: a nav with an ordered list, the current entry marked as the step.
    const rail = page.getByRole('navigation', { name: 'This lesson' })
    await expect(rail.locator('[aria-current="step"]')).toHaveCount(1)
    await expect(rail).toContainText('Test · 3 questions')

    const walk = walkOf(page)
    const inGame = () => page.evaluate(() => document.activeElement?.closest('[data-game]') != null)
    for (let presses = 0; presses < 400 && !(await inGame()); presses++) await walk.press('Tab')
    await WALKS.pool['one-group'](page, walk)
    // After the run the rail holds the learner's own answer, read from the ledger.
    await expect(rail).toContainText(/One KV group: (passed in practice|passed|not yet)/, { timeout: 30_000 })
    // The next level is now the way on, in amber, and starting it folds the first.
    await expect(next).toHaveAttribute('data-emphasis', 'primary')
    // The run's own result leads with the lesson's way on, the next level, and never offers to leave the lesson.
    const actions = first.locator('[data-result] .es-debrief__actions')
    await expect(actions.getByRole('button').first()).toHaveText('Next level: Full attention and a sliding window')
    await expect(first.getByRole('link', { name: 'Open the course' })).toHaveCount(0)
    await next.click()
    await expect(first).toHaveAttribute('data-phase', 'folded')
    await expect(second).toHaveAttribute('data-phase', 'open')
    // The lesson's guess is the level's opening guess: it is asked in the level's slot (lesson-predict.spec.ts plays it), never on the page as well.
    await expect(page.locator('section[data-block="predict"][data-predict="tr5a.l1.p1"]')).toHaveCount(0)
  })

  test('nothing is collapsed, every heading has an anchor, no model card is inlined, and a claim is a numbered link that opens its source on activation', async ({ page }) => {
    await open(page, REFERENCE)
    const text = await page.locator('main').textContent()
    expect(text).toContain('then test the last two on seeds drawn when you run them.')
    expect(await page.locator('details:not([open])').count()).toBe(0)
    // The lesson's own headings: a game's frame and the question set's ticket title their own parts.
    const anchorless = await page
      .locator('main :is(h1, h2, h3):not([id])')
      .evaluateAll((nodes) => nodes.filter((node) => node.closest('[data-game], [data-block="item"]') === null).map((node) => node.textContent))
    expect(anchorless).toEqual([])
    await expect(page.locator('[data-kind="notional-machine"]')).toHaveCount(0)
    const mark = page.locator('a.es-pop__trigger[data-claim]').first()
    await expect(mark).toHaveAttribute('href', '#source-1')
    await mark.focus()
    await expect(page.getByRole('dialog', { name: 'Source 1' })).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Source 1' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Source 1' })).toHaveCount(0)
    await expect(mark).toBeFocused()
    // A tagged number is not a tab stop.
    expect(await page.locator('.es-num[tabindex], .es-num a, .es-num button').count()).toBe(0)
    await expect(page.locator('#sources li')).not.toHaveCount(0)
  })

  test('Keep: with the Test not passed, the amber control goes to the questions and the next lesson is an outline', async ({ page }) => {
    await open(page, REFERENCE)
    const keep = page.locator('#keep')
    await expect(keep.locator('.es-next__action[data-emphasis="primary"]')).toHaveAttribute('href', '#exit-check')
    await expect(keep.locator('.es-next__action[data-emphasis="primary"]')).toContainText('Go to the 3 questions')
    await expect(keep.locator('.es-next__action[data-emphasis="outline"]')).toContainText('Next: lesson 2')
    await expect(keep.locator('[data-record]')).toContainText('TR5a lesson 1')
  })

  test('a lesson that opens on reading: the title block’s line opens the model’s full card in a panel, and closing it hands focus back', async ({ page }) => {
    await open(page, '/m/tr2/l5-cuda-graphs-capture-replay-padding-and-modes')
    await expect(page.locator('.es-lesson')).toHaveAttribute('data-opener', 'C')
    const trigger = page.locator('header .es-lesson__model').getByRole('button', { name: 'What this model leaves out' })
    await trigger.click()
    const panel = page.getByRole('dialog', { name: 'What this model leaves out' })
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('What it leaves out')
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})

test.describe('the lesson template on a phone', () => {
  test.describe('at 390 x 844', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('the strip and the foot bar are sticky, and in a keyboard walk the focused control never lies under either', async ({ page, context }) => {
      test.setTimeout(180_000)
      await withSettings(context, { view3d: false })
      await open(page, REFERENCE)
      const strip = page.locator('.es-lesson__strip')
      const foot = page.locator('.es-lesson__foot')
      await expect(strip).toBeVisible()
      // The foot bar carries the way to the next part while the reader is in Read; in Run and Test the run and the questions hold the foot.
      await expect(foot).toHaveCount(0)
      await page.evaluate(() => document.getElementById('what-the-next-token-reads')?.scrollIntoView({ block: 'start' }))
      await expect(foot).toBeVisible()
      await expect(foot).toContainText('Next part: Three tables for one request')
      expect(await strip.evaluate((element) => getComputedStyle(element).position)).toBe('sticky')
      expect(await foot.evaluate((element) => getComputedStyle(element).position)).toBe('sticky')
      await quiet(page)
      const hidden: string[] = []
      for (let press = 0; press < 120; press++) {
        await page.keyboard.press('Tab')
        const box = await page.evaluate(() => {
          const active = document.activeElement
          if (active === null || active === document.body) return null
          const rect = active.getBoundingClientRect()
          const top = document.querySelector('.es-lesson__strip')?.getBoundingClientRect()
          const bottom = document.querySelector('.es-lesson__foot')?.getBoundingClientRect()
          const inside = active.closest('.es-lesson__strip, .es-lesson__foot') !== null
          if (inside || rect.height === 0) return null
          // Entirely hidden: the control's box lies within the bar's band, and the bar is drawn over it (it is stuck to the viewport's edge).
          const underTop = top !== undefined && top.top <= 0 && rect.top >= top.top && rect.bottom <= top.bottom
          const underFoot = bottom !== undefined && bottom.bottom >= window.innerHeight - 1 && rect.top >= bottom.top && rect.bottom <= bottom.bottom
          return underTop || underFoot ? `${active.tagName} ${(active.textContent ?? '').trim().slice(0, 40)}` : null
        })
        if (box !== null) hidden.push(box)
      }
      expect(hidden).toEqual([])
    })
  })

  test.describe('under 600 px of height', () => {
    test.use({ viewport: { width: 390, height: 500 } })

    test('neither the strip nor the foot bar is sticky', async ({ page }) => {
      await open(page, REFERENCE)
      await page.evaluate(() => document.getElementById('what-the-next-token-reads')?.scrollIntoView({ block: 'start' }))
      expect(await page.locator('.es-lesson__strip').evaluate((element) => getComputedStyle(element).position)).not.toBe('sticky')
      expect(await page.locator('.es-lesson__foot').evaluate((element) => getComputedStyle(element).position)).not.toBe('sticky')
    })
  })
})

test.describe('the reference lesson, axe', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} x ${height}, with its first run open, finds no serious or critical violation`, async ({ page, context }) => {
      test.setTimeout(180_000)
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width, height })
      await open(page, REFERENCE)
      await expect(embedOf(page, ONE_GROUP)).toBeVisible({ timeout: 60_000 })
      await quiet(page)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze()
      const blocking = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))
      expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`)).toEqual([])
    })
  }
})

/*
 * R-T11: the lesson's dock and the source popover (REDESIGN §2.5, §2.6, §3.4). From 80rem wide and 44rem tall the learner's run stays
 * beside Read, a second view of the same run: an action taken in the instrument shows in the dock, and the dock's own Undo and Step show in
 * the instrument. Below that there is no dock and each part of Read has "Back to my run". Selecting a part opens its source, by keyboard in
 * the instrument and by pointer in the dock, and Escape hands focus back.
 */
const MET = JSON.stringify({ pool: POOL_PARTS.map((part) => part.id) })

test.describe("the lesson's dock, at 1440 x 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the dock shows the same run as the instrument: an action in either shows in both, the dock is 2D, and it never covers a focused control', async ({ page, context }) => {
    test.setTimeout(180_000)
    await withSettings(context, { view3d: false })
    await context.addInitScript((flag) => {
      try {
        localStorage.setItem('es:intro', flag)
      } catch {
        // No storage: the intro shows, and nothing below depends on it.
      }
    }, MET)
    await open(page, REFERENCE)
    const game = embedOf(page, ONE_GROUP)
    await expect(game).toBeVisible({ timeout: 60_000 })
    const dock = page.locator('aside.es-ldock')
    await expect(dock).toBeAttached({ timeout: 30_000 })
    await expect(dock).toHaveAttribute('data-dock-state', 'live')
    // Before any move the dock shows the level's opening state: every slot of the batch empty.
    await expect(dock).toContainText('One KV group')
    await expect(dock.locator('.es-pooldock__slot[data-req]')).toHaveCount(0)
    // The dock is always 2D: no canvas and no 3D surface in it.
    await expect(dock.locator('canvas, [data-surface="3d"]')).toHaveCount(0)

    // An action in the instrument shows in the dock.
    await game.getByRole('button', { name: 'Skip the guess' }).click()
    await game.locator('[data-ask-list="admit"] button').first().click()
    await expect(game.locator('[data-pool-batch] [data-req]')).toHaveCount(1)
    await expect(dock.locator('.es-pooldock__slot[data-req]')).toHaveCount(1)

    // And the dock's own controls act on the same run: Undo here takes the admit back there, and Step here admits there.
    await page.evaluate(() => document.getElementById('what-the-next-token-reads')?.scrollIntoView({ block: 'start' }))
    await expect(dock).toBeInViewport()
    await dock.getByRole('button', { name: 'Undo' }).click()
    await expect(game.locator('[data-pool-batch] [data-req]')).toHaveCount(0)
    await expect(dock.locator('.es-pooldock__slot[data-req]')).toHaveCount(0)
    const step = dock.getByRole('button', { name: 'Step' })
    await expect(step).toBeEnabled()
    await step.click()
    await expect(game.locator('[data-pool-batch] [data-req]')).toHaveCount(1)
    await expect(dock.locator('.es-pooldock__slot[data-req]')).toHaveCount(1)
    await dock.getByRole('button', { name: 'Reset' }).click()
    await expect(dock.locator('.es-pooldock__slot[data-req]')).toHaveCount(0)

    // Back to my run goes to the instrument.
    await expect(dock.getByRole('link', { name: 'Back to my run' })).toHaveAttribute('href', /^#run-\d+$/)

    // A keyboard walk through Read: no focused control outside the dock lies under it.
    const covered: string[] = []
    await page.locator('#what-the-next-token-reads').focus()
    for (let press = 0; press < 60; press++) {
      await page.keyboard.press('Tab')
      const hit = await page.evaluate(() => {
        const active = document.activeElement
        const dockBox = document.querySelector('aside.es-ldock')
        if (active === null || dockBox === null || dockBox.contains(active) || dockBox.hasAttribute('data-covered')) return null
        const a = active.getBoundingClientRect()
        const d = dockBox.getBoundingClientRect()
        const overlaps = a.right > d.left && a.left < d.right && a.bottom > d.top && a.top < d.bottom && a.width > 0
        return overlaps ? `${active.tagName} ${(active.textContent ?? '').trim().slice(0, 40)}` : null
      })
      if (hit !== null) covered.push(hit)
    }
    expect(covered).toEqual([])
  })

  test('selecting a part opens its source: by keyboard in the instrument, by pointer in the dock, and Escape hands focus back', async ({ page, context }) => {
    test.setTimeout(180_000)
    await withSettings(context, { view3d: false })
    await context.addInitScript((flag) => {
      try {
        localStorage.setItem('es:intro', flag)
      } catch {
        // No storage: the intro shows, and nothing below depends on it.
      }
    }, MET)
    await open(page, REFERENCE)
    const game = embedOf(page, ONE_GROUP)
    await expect(game).toBeVisible({ timeout: 60_000 })

    // The instrument: the pool's name is its popover's trigger, opened by Enter, never by focus alone.
    const trigger = game.locator('[data-pool-grid] .es-pop__trigger[data-part="pool"]')
    await trigger.focus()
    const sheet = page.getByRole('dialog', { name: 'KV page pool' })
    await expect(sheet).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Every KV page on the GPU')
    await expect(sheet).toContainText('BlockPool')
    await expect(sheet).toContainText('measured')
    await expect(sheet.getByRole('link')).toHaveAttribute('href', /^https:\/\/github\.com\/vllm-project\/vllm\/blob\/v0\.33\.0\//)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // The dock: the free queue's name, then a page selected by the pointer.
    await page.evaluate(() => document.getElementById('what-the-next-token-reads')?.scrollIntoView({ block: 'start' }))
    const dock = page.locator('aside.es-ldock')
    await expect(dock).toBeInViewport()
    const queue = dock.locator('.es-pop__trigger[data-part="free-queue"]')
    await queue.click()
    const queueSheet = page.getByRole('dialog', { name: 'Free queue' })
    await expect(queueSheet).toBeVisible()
    await expect(queueSheet.getByRole('link')).toHaveAttribute('href', /block_pool\.py/)
    await page.keyboard.press('Escape')
    await expect(queueSheet).toHaveCount(0)
    await expect(queue).toBeFocused()

    await dock.locator('.es-pool__cell').nth(3).click()
    const pageSheet = page.getByRole('dialog', { name: 'KV page' })
    await expect(pageSheet).toBeVisible()
    await expect(pageSheet).toContainText('Page 4: free.')
    expect(((await pageSheet.textContent()) ?? '').match(/BlockPool/g)?.length).toBe(1)
    await page.keyboard.press('Escape')
    await expect(pageSheet).toHaveCount(0)
  })
})

test.describe('below 80rem wide or 44rem tall there is no dock', () => {
  for (const [width, height] of [
    [1440, 700],
    [1240, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} x ${height}: no dock and no sheet, and each part of Read has Back to my run`, async ({ page, context }) => {
      test.setTimeout(120_000)
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width, height })
      await open(page, REFERENCE)
      await expect(embedOf(page, ONE_GROUP)).toBeVisible({ timeout: 60_000 })
      await expect(page.locator('aside.es-ldock')).toHaveCount(0)
      const parts = page.locator('#read .es-lesson__part')
      const backs = page.locator('#read .es-lesson__part .es-lesson__back a')
      await expect(backs).toHaveCount(await parts.count())
      await expect(backs.first()).toHaveText('Back to my run')
      const href = await backs.first().getAttribute('href')
      expect(href).toMatch(/^#run-\d+$/)
      await expect(page.locator(href ?? '#none')).toHaveCount(1)
    })
  }
})
