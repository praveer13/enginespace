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
import { GAMES } from '../packages/play/registry'
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
