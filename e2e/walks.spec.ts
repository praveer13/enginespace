/*
 * W1-T36: a keyboard-only walk plays W1's games to their debriefs (ARCHITECTURE §11.2: "every game's level completable by keyboard alone;
 * focus always visible and never obscured"). W0-T21's keyboard-loop.spec.ts does it for the front page's game; this does it for the games
 * that W1 built, on each game's own page, at 360 and 1280 px (the game is laid out differently on a phone: GAMES.md §2.3).
 *
 *   - A pull request walks one level of each game, the first and the cheapest (e2e/levels.ts, `SMOKE_LEVELS`): Service's `async`, the
 *     Tasting's `overlap`, Back of House's `nano`, the Reach-In's `one-group` and the Inspection's `due`.
 *   - The nightly sweep (ES_E2E_NIGHTLY=1) walks every level of the registry that the front page does not play: `WALKED`. The four levels
 *     of First service are walked by keyboard-loop.spec.ts on the front page, at the same widths.
 *   - The registry is the list: a level that has no walk fails the first test here and tests/ci/e2e-coverage.test.ts, so a game or a
 *     level that a later task adds cannot go unwalked.
 *   - A walk does not stop at the debrief: every stop that moved focus was read (e2e/support/front.ts), and none may lack a focus ring, lie
 *     under something else, or be off the screen (WCAG 2.4.7 and 2.4.11).
 *
 * Each walk is the one that the game's own spec plays (e2e/support/walks.ts says which), run here against the built site with the
 * 3D scene off, so that nothing moves under it. Every walk is also a network check: support/site.ts fails a test whose page asks for
 * anything outside the origin, has its policy refuse something, or throws.
 */
import { BENCH_COPY } from '../packages/play/broken-bench/copy'
import { FLOOR_COPY } from '../packages/play/engine-floor/copy'
import { FULL_COPY } from '../packages/play/loop/full/copy'
import { POOL_COPY } from '../packages/play/pool/copy'
import { GAMES } from '../packages/play/registry'
import { VERIFIER_COPY } from '../packages/play/verifier/copy'
import { FRONT_LEVELS, SMOKE_LEVELS, WALKED } from './levels'
import { PR_WIDTHS } from './routes'
import { walkOf } from './support/front'
import { expect, NIGHTLY, test } from './support/site'
import { openLevel, WALKS } from './support/walks'

const walked: Readonly<Record<string, readonly string[]>> = WALKED
const smoke: Readonly<Record<string, string>> = SMOKE_LEVELS

test.describe('the registry', () => {
  test('lists no level that no keyboard walk plays: each is walked here, or on the front page', () => {
    const front = new Set<string>(FRONT_LEVELS)
    const missing: string[] = []
    for (const game of GAMES.games) {
      for (const level of game.levels) {
        if (game.id === 'loop' && front.has(level.id)) continue
        if (!(walked[game.id] ?? []).includes(level.id)) missing.push(`${game.id}/${level.id} has no walk in e2e/levels.ts`)
        else if (WALKS[game.id]?.[level.id] === undefined) missing.push(`${game.id}/${level.id} is listed in e2e/levels.ts, and e2e/support/walks.ts has no walker for it`)
      }
    }
    expect(missing).toEqual([])
    // And the other way: nothing is walked that the registry does not have, and a pull request walks a level that is walked.
    const known = new Set(GAMES.games.flatMap((game) => game.levels.map((level) => `${game.id}/${level.id}`)))
    expect(Object.entries(walked).flatMap(([id, levels]) => levels.map((level) => `${id}/${level}`)).filter((key) => !known.has(key))).toEqual([])
    expect(Object.entries(smoke).filter(([id, level]) => !(walked[id] ?? []).includes(level))).toEqual([])
  })
})

for (const width of PR_WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    for (const game of GAMES.games) {
      for (const level of walked[game.id] ?? []) {
        if (!NIGHTLY && smoke[game.id] !== level) continue
        const entry = game.levels.find((candidate) => candidate.id === level)
        test(`${game.title} (${game.id}), "${entry?.title ?? level}" (${level}): the keys alone play it to its debrief, with focus in view at every stop`, async ({ page }) => {
          // The longest walk, the Reach-In's `same-size`, took 57 s here [measured 2026-11-08 at df76ca9, 2 workers, at 360 px] and a runner
          // takes several times as long per test, so a walk has minutes and not seconds.
          test.setTimeout(NIGHTLY ? 600_000 : 300_000)
          const walk = walkOf(page)
          await openLevel(page, game.id, level)
          await WALKS[game.id][level](page, walk)
          expect(walk.trail.length, 'stops that the walk read').toBeGreaterThan(5)
          expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
        })
      }
    }
  })
}

test.describe('the check can fail', () => {
  test('a control with no ring, one under another box and one off the screen are found, and a field whose slip draws the ring is not', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Fixture</title><style>' +
        'button, input { outline: none } ' +
        '#ringed:focus, #under:focus, #away:focus { outline: 2px solid blue } ' +
        '.slip:focus-within { outline: 2px solid blue } ' +
        '#under { position: absolute; left: 0; top: 200px; width: 200px; height: 60px } ' +
        '#cover { position: absolute; left: 0; top: 200px; width: 200px; height: 60px; z-index: 2 } ' +
        '#away { position: absolute; left: -500px; top: 0 } ' +
        '</style></head><body><main><h1>Fixture</h1>' +
        '<button id="ringed">Ringed</button> <button id="bare">Bare</button> <button id="under">Under</button><div id="cover"></div> <button id="away">Away</button>' +
        '<span class="slip"><input id="slipped" aria-label="Slipped"></span> <input id="loose" aria-label="Loose">' +
        '</main></body></html>',
    )
    const walk = walkOf(page)
    for (const id of ['ringed', 'bare', 'under', 'away', 'slipped', 'loose']) {
      await page.locator(`#${id}`).focus()
      await walk.see()
    }
    expect(walk.problems()).toEqual([
      'Bare (button) draws no focus ring',
      'Under (button) is covered by something else',
      'Away (button) is off screen',
      'Loose (input) draws no focus ring',
    ])
  })
})

/*
 * R-T22: a module page's first screen and its keyboard walk (REDESIGN section 3.3). On TR1 and TR2 the lessons start inside the first
 * 700 px at a desk, the amber button is the first thing the keys reach after the header, and the Reference opens and closes by key with its
 * words in the document while it is closed.
 */
for (const [width, height, within] of [
  [1440, 900, 700],
  [390, 844, 700],
] as const) {
  test.describe(`a module page at ${width} px`, () => {
    test.use({ viewport: { width, height } })

    for (const module of ['tr1', 'tr2']) {
      test(`/m/${module}: the lessons start within ${within} px, and the keys walk the button, a lesson and the Reference`, async ({ page }) => {
        await page.goto(`/m/${module}`)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.locator('.es-module__lesson').first()).toBeVisible()
        const top = await page.locator('#lessons').evaluate((node) => node.getBoundingClientRect().top + window.scrollY)
        expect(top, 'where the lesson list starts').toBeLessThan(within)

        const walk = walkOf(page)
        const way = page.locator('.es-module__way a.es-header__next')
        await way.focus()
        await walk.see()
        await expect(way).toHaveAttribute('data-emphasis', 'primary')
        await expect(way).not.toContainText('Continue')
        await page.keyboard.press('Tab')
        await walk.see()
        await expect(page.locator('.es-module__lesson-link').first()).toBeFocused()

        const first = page.locator('.es-module__part').first()
        await expect(first).not.toHaveAttribute('open', '')
        await expect(first.locator('.es-module__prose')).toHaveCount(1)
        await first.locator('summary').focus()
        await walk.see()
        await page.keyboard.press('Enter')
        await expect(first).toHaveAttribute('open', '')
        await page.keyboard.press('Enter')
        await expect(first).not.toHaveAttribute('open', '')
        expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
      })
    }
  })
}

/*
 * R-T47, REDESIGN 5.2 "Game": at 1440 x 900 and at 390 x 844 the diagram, the control that is current and the readout are inside the viewport
 * at the start and at the result, the level menu is one control, and every graded level shows its pass rule before the run. The start is the
 * first run's strip (the control that is current is its Next); the result is the debrief the walk reaches, with its verdict focused.
 */
for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test.describe(`a game's screen at ${width} x ${height}`, () => {
    test.use({ viewport: { width, height } })

    for (const game of GAMES.games) {
      const level = smoke[game.id]
      if (level === undefined) continue
      test(`${game.title} (${game.id}), "${level}": the diagram, the current control and the readout are in view at the start and at the result, and the level menu is one control`, async ({ page }) => {
        test.setTimeout(300_000)
        const walk = walkOf(page)
        await openLevel(page, game.id, level)
        const frame = page.locator(`section[data-game="${game.id}"]`)
        const here = (what: string, locator: ReturnType<typeof frame.locator>) => expect(locator.first(), what).toBeInViewport()
        await here('the diagram at the start', frame.locator('.es-frame__view'))
        await here('the control that is current at the start', frame.locator('[data-intro-next], [data-dock] :is(button, input, [role="radio"]):not([disabled])'))
        await here('the readout at the start', frame.locator('[data-readout]'))
        expect(await page.locator('.es-level__select').count(), 'the level menu is one control').toBe(1)

        await WALKS[game.id][level](page, walk)
        await here('the result', frame.locator('[data-result]'))
        await here('the verdict, which has focus', frame.locator('[data-result] [data-result-heading]'))
        await here('the readout at the result', frame.locator('[data-readout]'))
      })
    }
  })
}

/** Every level that has a pass rule, with its words: the games' copy tables are the list, so a level that gains a rule is held to showing it. */
const RULES: { game: string; level: string; rule: string }[] = [
  ...Object.entries(FLOOR_COPY).flatMap(([level, copy]) => (copy.passRule === undefined ? [] : [{ game: 'engine-floor', level, rule: copy.passRule }])),
  ...Object.entries(POOL_COPY).flatMap(([level, copy]) => (copy.passRule === undefined ? [] : [{ game: 'pool', level, rule: copy.passRule }])),
  ...Object.entries(VERIFIER_COPY).flatMap(([level, copy]) => (copy.passRule === undefined ? [] : [{ game: 'verifier', level, rule: copy.passRule }])),
  ...Object.entries(FULL_COPY).flatMap(([level, copy]) => (copy.passRule === undefined ? [] : [{ game: 'loop', level, rule: copy.passRule }])),
  // The Inspection opens a level in practice, and its goal line says what a graded attempt passes on (`practiceBeat`); the graded goal says it as the rule.
  ...Object.entries(BENCH_COPY).map(([level, copy]) => ({ game: 'broken-bench', level, rule: copy.practiceBeat })),
]

test.describe('every level with a pass rule shows it before the run', () => {
  test('the list of levels with a rule is not empty', () => {
    expect(RULES.length).toBeGreaterThan(10)
  })

  for (const { game, level, rule } of RULES) {
    test(`${game}/${level}: "${rule.slice(0, 48)}..." is on the page before the first move`, async ({ page }) => {
      await openLevel(page, game, level)
      await expect(page.locator(`section[data-game="${game}"]`)).toContainText(rule.slice(0, 60).replace(/\s+/g, ' '))
    })
  }
})
