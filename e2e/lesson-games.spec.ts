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
import { benchSession } from '../packages/play/broken-bench/session'
import { PR_WIDTHS } from './routes'
import { walkOf } from './support/front'
import { embedOf, lessonGames, playEvents, startBlock, ticketOf, type LessonGame, type StoredPlay } from './support/lessons'
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
  test('are the 40 that the tracker counts, in 26 of the 27 lessons', () => {
    expect(BLOCKS.length).toBe(40)
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
        // From the top of the page to the block's stub, a stop at a time, as a keyboard user goes.
        await tabToLocator(walk, ticketOf(page, block).getByRole('button', { name: 'Start level' }), 400)
        await page.keyboard.press('Enter')
        const game = embedOf(page, block)
        await expect(game).toBeVisible({ timeout: 60_000 })
        // The stub has gone with the ticket's wait, and focus is on the game, so its keys work at once.
        await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game') ?? null)).toBe(block.game)
        await WALKS[block.game][block.level](page, walk)
        expect(walk.trail.length, 'stops that the walk read').toBeGreaterThan(5)
        expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
        // The run is in the ledger: a practice run of the block's level, from the lesson (its revision on it).
        const rev = await page.locator('article.es-doc').getAttribute('data-rev')
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
    const lessonRev = await page.locator('article.es-doc').getAttribute('data-rev')

    // On the game's own page: the same level, a graded attempt started from its docket, the same entropy and the same filing.
    await open(page, '/play/broken-bench?level=due')
    await page.evaluate((entropy) => {
      window.__queue = [entropy]
    }, ENTROPY)
    await page.getByRole('button', { name: 'Graded attempt, fresh seed' }).click()
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
    const route = '/m/tr2/l3-async-scheduling-closes-the-bubble'
    await open(page, route)
    await quiet(page)
    const game = /\/assets\/(GameEmbed|Game|GameShell|registry|Scene3D|three-vendor|useEvidence|record)-[\w-]+\.(js|css)$/
    expect(watch.requests.filter((path) => game.test(path))).toEqual([])
    await startBlock(page, { game: 'loop', level: 'first-4-par', mode: 'practice' })
    await expect(page.locator('.es-stage[data-stage-phase="live"]')).toHaveCount(1, { timeout: 90_000 })
    const asked = watch.requests.filter((path) => game.test(path)).map((path) => /\/assets\/([A-Za-z0-9]+)-/.exec(path)?.[1])
    for (const chunk of ['GameEmbed', 'registry', 'Game', 'Scene3D', 'three']) expect(asked, chunk).toContain(chunk)
  })
})
