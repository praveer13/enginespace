/*
 * R-T47, REDESIGN section 5.4 "Delight, what a script can hold": the keep-list of the moments the diagnosis lists as felt, and how soon the
 * first one comes.
 *
 *   1. The benchmark's p99 moves from 90.1 ms to 5,073.6 ms when the clock is switched to the due time, and the moment is named.
 *   2. The sampler's draws of 10, 100 and 1,000 settle on 19/32, and the moment is named once.
 *   3. The pool's eviction shows each option's cost, and when it lands the readout's numbers change at once, each with its delta.
 *   4. The step loop's idle boxes close when async scheduling goes on, and the first bubble is named.
 *   5. A debrief puts the learner's run against the reference.
 *
 *   Time to the first payoff: from landing on `/`, the first named moment appears within six actions; in each game's scripted first run its
 *   first named moment appears before the run ends. "Nothing dead": no disabled primary control without a reason, no lock and no empty box
 *   on any screen of these runs.
 *
 * Each moment is reached by a learner's own moves on the built site, the 2D pass, with the learner's guess and the parts skipped where the
 * moment is not about them (Skip intro is a control of the first run, and the first-visit walk plays the intro through).
 */
import type { Locator, Page } from '@playwright/test'
import { handsOf } from './support/moves'
import { copyProblems } from './support/screens'
import { expect, open, quiet, test, withSettings } from './support/site'
import { floorWithHands, poolNightWith } from './support/walks'
import { walkOf } from './support/front'

test.use({ viewport: { width: 1440, height: 900 } })

const MOMENT = '[data-moment]:not([data-moment=""])'

/** Skips the first run's strip where it shows: the moment under test is not about the parts. */
async function skipIntro(page: Page): Promise<void> {
  const skip = page.locator('[data-intro-skip]').first()
  if ((await skip.count()) > 0 && (await skip.isVisible())) await skip.click()
}

/** Opens a game's level on the 2D pass. */
async function openGame(page: Page, context: import('@playwright/test').BrowserContext, game: string, level: string): Promise<void> {
  await withSettings(context, { view3d: false })
  await open(page, `/play/${game}?level=${level}`)
  await quiet(page)
  await skipIntro(page)
}

/** A moment is on the page, says something in the engine's words, and the run is not over. */
async function named(page: Page, scope: Locator, pattern: RegExp): Promise<string> {
  const moment = scope.locator(MOMENT).first()
  await expect(moment).toBeVisible()
  const text = ((await moment.textContent()) ?? '').trim()
  expect(text).toMatch(pattern)
  expect(await copyProblems(page), 'the moment is said in the engine\'s words').toEqual([])
  await expect(page.locator('[data-result]')).toHaveCount(0)
  return text
}

test.describe('the keep-list: the moments that are felt', () => {
  test('1. the benchmark: the p99 moves from 90.1 ms to 5,073.6 ms on the switch, and coordinated omission is named', async ({ page, context }) => {
    await openGame(page, context, 'broken-bench', 'due')
    const p99 = page.locator('[data-readout-id="measured"] dd')
    await expect(p99).toContainText('90.1')
    const switchTo = page.getByRole('switch', { name: 'Latency from the due time' })
    await expect(page.locator('[data-moment="coordinated-omission"]')).toHaveCount(0)
    await switchTo.click()
    const text = await named(page, page.locator('section[data-game="broken-bench"]'), /Coordinated omission/)
    expect(text).toContain('90.1')
    await expect(p99).toContainText('5,073.6')
  })

  test('2. the sampler: draws of 10, 100 and 1,000 settle on 19/32, and the moment is named once', async ({ page, context }) => {
    await openGame(page, context, 'verifier', 'overlap')
    await page.getByLabel('Accepted, in sixty-fourths').fill('38')
    await page.keyboard.press('Enter')
    for (const batch of ['Draw 10', 'Draw 100']) {
      await page.getByRole('button', { name: batch, exact: true }).click()
      await expect(page.locator(MOMENT)).toHaveCount(0)
    }
    await page.getByRole('button', { name: 'Draw 1,000', exact: true }).click()
    const text = await named(page, page.locator('section[data-game="verifier"]'), /19\/32/)
    expect(text).toMatch(/acceptance rate/)
    const share = Number(((await page.locator('[data-readout-id="share"] dd').textContent()) ?? '').trim())
    expect(Math.abs(share - 19 / 32)).toBeLessThan(0.05)
    await page.getByRole('button', { name: 'Draw 1,000', exact: true }).click()
    await expect(page.locator(MOMENT)).toHaveCount(0)
  })

  test('3 and 5. the pool: the first admit names its moment, each eviction option shows its cost, the readout changes at once, and the debrief puts the run against the reference', async ({ page, context }) => {
    await openGame(page, context, 'pool', 'evict')
    const walk = walkOf(page)
    let before = 0
    let moment = ''
    const evictions = page.locator('[data-readout-id="evictions"] dd')
    await poolNightWith('evict', {
      after: async (action, _at, there) => {
        if (action.t === 'admit' && action.req !== null && moment === '') moment = await named(there, there.locator('section[data-game="pool"]'), /\S/)
        if (action.t === 'evict') {
          // The numbers moved where the decision landed, and the change sits beside each for a moment.
          await expect(evictions).not.toHaveText(String(before))
          await expect(there.locator('[data-pool-readout] .es-delta').first()).toBeVisible()
        }
      },
      before: async (action, _at, there) => {
        if (action.t !== 'evict') return
        await expect(there.locator('[data-pool-costs]')).toHaveAttribute('data-pool-costs', 'shown')
        const rows = there.locator('[data-ask-list="evict"] button[data-roving]')
        expect(await rows.count(), 'every option is on offer').toBeGreaterThan(0)
        for (const text of await rows.allTextContents()) expect(text, 'each option says what it costs').toMatch(/costs? (nothing now|\d+ tokens?)/)
        before = Number(((await evictions.textContent()) ?? '0').replace(/\D/g, '') || '0')
      },
    })(page, walk)
    expect(moment, 'the first admit named a moment before the run ended').not.toBe('')
    await expect(page.locator('[data-result]')).toContainText(/against the reference/i)
  })

  test('4. the step loop: the idle boxes close when async scheduling goes on, and the first bubble is named', async ({ page, context }) => {
    await openGame(page, context, 'loop', 'first-3-gap')
    const game = page.locator('section[data-game="loop"]')
    const overlap = game.getByRole('switch')
    const idle = game.locator('[data-lane-idle]')
    const play = async (firstRun: boolean): Promise<number> => {
      const said = new Set<string>()
      for (let turn = 0; turn < 400 && (await game.locator('[data-result]').count()) === 0; turn++) {
        const chips = game.locator('.es-lanes__chip:not([disabled])')
        if ((await chips.count()) > 0) await chips.first().click()
        else await game.getByRole('button', { name: /^Step/ }).first().click()
        if ((await game.locator(MOMENT).count()) > 0) said.add(((await game.locator(MOMENT).first().textContent()) ?? '').trim())
      }
      await expect(game.locator('[data-result]')).toBeVisible()
      // The level names what it teaches once, as it is felt: its moments are named, and each in the engine's words.
      if (firstRun) expect([...said].some((line) => /bubble/i.test(line)), `the moments said in this run: ${[...said].join(' | ')}`).toBe(true)
      return idle.count()
    }
    if ((await overlap.getAttribute('aria-checked')) === 'true') await overlap.click()
    const open1 = await play(true)
    expect(open1, 'with async scheduling off the GPU idles between steps').toBeGreaterThan(0)
    await game.getByRole('button', { name: 'Restart level' }).click()
    await expect(game.locator('[data-result]')).toHaveCount(0)
    if ((await overlap.getAttribute('aria-checked')) !== 'true') await overlap.click()
    const closed = await play(false)
    expect(closed, `idle boxes with async scheduling on (${closed}) against off (${open1})`).toBeLessThan(open1)
  })
})

test.describe('time to the first payoff', () => {
  test('from landing on /, the first named moment appears within six actions', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/')
    await quiet(page)
    const moment = page.locator('section.es-front-service [data-moment]')
    let actions = 0
    const act = async (target: Locator) => {
      await target.click()
      actions += 1
    }
    for (let turn = 0; turn < 6 && (await moment.count()) === 0; turn++) {
      const chips = page.locator('section.es-front-service :is(.es-lanes__chips, .es-front-controls__waiting) button:not([disabled])')
      if ((await chips.count()) > 0) await act(chips.first())
      else await act(page.locator('section.es-front-service [data-front-step]').getByRole('button', { name: 'Step', exact: true }))
    }
    await expect(moment.first()).toContainText(/batching/)
    expect(actions, 'actions from landing to the first named moment').toBeLessThanOrEqual(6)
    console.log(`the first named moment on / after ${actions} actions`)
  })

  test('in the request path\'s scripted first run, its first named moment is said as the path runs, in the engine\'s words', async ({ page, context }) => {
    await openGame(page, context, 'engine-floor', 'nano')
    const hands = handsOf(page, 'pointer')
    const game = page.locator('section[data-game="engine-floor"]')
    // The path is laid tile by tile with nothing named: its rules are felt when it runs (REDESIGN 3.5). The run is one action, so its moment
    // arrives in the same render as its result, at the head of the dock, and is said in the status line as well.
    await floorWithHands(page, 'nano', (target) => hands.press(target), {
      intro: false,
      onStage: async () => {
        await expect(game.locator('[data-result]')).toHaveCount(0)
        await expect(game.locator(MOMENT)).toHaveCount(0)
      },
    })
    await expect(game.locator('[data-live="moment"]')).toHaveText(/That hop (crosses a process boundary: it is (IPC|shared memory), not a function call|is a copy: the step’s inputs move from host memory to the GPU)\./)
    // A sighted learner reads it too: it stands at the head of the dock, over the result.
    await expect(game.locator(MOMENT).first()).toBeVisible()
    await expect(game.locator(MOMENT).first()).toContainText(/^That hop /)
    expect(await copyProblems(page)).toEqual([])
  })
})
