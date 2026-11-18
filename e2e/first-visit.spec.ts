/*
 * R-T47, REDESIGN section 5.1: the scripted first-visit walk. One learner with an empty ledger, from landing on `/` to the second lesson's
 * door and back through the course, at 1440 x 900 and at 390 x 844, by the pointer and again by the keyboard: four walks, one script. The
 * checkpoints CP1 to CP17 are the brief's table, row by row, and each is a `test.step` named by its number, so a failure says which one.
 *
 *   CP1 landing        CP2 the parts        CP3 first move       CP4 first step       CP5 into the course
 *   CP6 lesson, first  CP7 game, cold       CP8 guess and run    CP9 told back        CP10 read
 *   CP11 test          CP12 keep            CP13 course          CP14 agreement       CP15 return
 *   CP16 out of order  CP17 a guess with no run
 *
 * The walk plays TR1 lesson 1 as a first-time learner would, in its own order (the run, then Read, then the Test), through the real
 * controls. The Test is passed by answering the questions the page asks, each one right: the answer of a ticket is the family's own, made from
 * the seed, level and variant that the ticket prints. `nextStep` is never copied: e2e/support/screens.ts runs it over the events that this
 * browser's ledger holds, and every Continue on every page is held to that answer.
 *
 * The 3D pass is off (the learner's own switch), so that nothing moves under a measurement: the diagram is the same screen (REDESIGN 2.9).
 * CP17 is held over all 27 lessons, not only TR2 lesson 7: no lock, no disabled commit and no task id is anywhere on a lesson.
 */
import type { Locator, Page } from '@playwright/test'
import { OPENERS } from '../tests/content/openers-table'
import { front } from './support/front'
import { ledgerEvents, predictEvents, playEvents } from './support/lessons'
import { answerSet, handsOf, queueEntropy } from './support/moves'
import type { Hands, How } from './support/moves'
import { amberFills, buildLogIds, copyProblems, taskIds, FIRST_VISIT, LESSONS, wayControls, wayOn, wayOnProblems } from './support/screens'
import { clipped, expect, open, quiet, test, withSettings } from './support/site'
import { floorWithHands } from './support/walks'

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const
const HOWS: readonly How[] = ['pointer', 'keyboard']

const TR1_L1 = '/m/tr1/l1-five-mechanisms'
const TR2_L3 = '/m/tr2/l3-async-scheduling-closes-the-bubble'
const TR2_L7 = '/m/tr2/l7-the-same-loop-elsewhere'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the checkpoints read                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The header's Continue: its link and its words. */
async function header(page: Page): Promise<{ href: string; label: string }> {
  const link = page.locator('a.es-header__next').first()
  return { href: (await link.getAttribute('href')) ?? '', label: ((await link.locator('.es-header__next-label').textContent()) ?? '').trim() }
}

/** The amber fills that are on screen now, not the page's whole length. */
async function amberInView(page: Page): Promise<string[]> {
  const { top, bottom } = await page.evaluate(() => ({ top: window.scrollY, bottom: window.scrollY + window.innerHeight }))
  return (await amberFills(page)).filter((fill) => fill.bottom > top && fill.top < bottom).map((fill) => fill.name)
}

/** Every page of the walk is held to the same few things: a header Continue that is `nextStep`'s, the engine's words, no sideways scroll. */
async function sound(page: Page, where: string): Promise<void> {
  const step = await wayOn(page)
  expect(await wayOnProblems(page, step), `${where}: the way on`).toEqual([])
  expect(await copyProblems(page), `${where}: banned words and build-log ids`).toEqual([])
  const edge = await clipped(page)
  expect(edge.scrolls, `${where}: sideways scroll`).toBeLessThanOrEqual(0)
}

const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length

/**
 * A disabled primary control that gives no reason, a lock, or an empty box: the page is dead there (REDESIGN 5.4, "nothing dead"). A primary
 * control is the amber button and the ink one that commits (Commit, Step, Run); a request chip with no slot free is a choice that is not on offer,
 * and says so by its dashed edge.
 */
async function deadPlaces(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = []
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    for (const element of document.querySelectorAll('.es-primary-button button:disabled, .es-primary-button [aria-disabled="true"], button[data-variant="ink"]:disabled, [data-front-step] button:disabled, [data-front-step] button[aria-disabled="true"]')) {
      if (!visible(element) || element.closest('[hidden], [inert]') !== null) continue
      const name = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ')
      const reason = element.getAttribute('aria-describedby') !== null || element.getAttribute('title') !== null || /:|first|then|until|after|when/.test(name)
      const around = (element.parentElement?.textContent ?? '').replace(name, '').trim().length > 12
      if (!reason && !around) found.push(`a disabled "${name}" with no reason beside it`)
    }
    for (const element of document.querySelectorAll('svg')) {
      const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('data-icon') ?? ''} ${element.getAttribute('class') ?? ''} ${element.querySelector('use')?.getAttribute('href') ?? ''}`
      if (/\block\b|lock-/i.test(label) && visible(element)) found.push(`a lock: ${label.trim().slice(0, 60)}`)
    }
    for (const element of document.querySelectorAll('.es-sheet, .es-well, [data-empty]')) {
      if (visible(element) && (element.textContent ?? '').trim() === '' && element.querySelector('svg, img, canvas, input') === null) found.push(`an empty box: ${String(element.className).split(' ')[0]}`)
    }
    return found
  })
}

/** Plays the front page's open level to its result, by the reference run's own strategy: admit while a slot is free, step otherwise. */
async function playFrontLevel(page: Page, hands: Hands): Promise<void> {
  const game = front.game(page)
  const overlap = game.getByRole('switch')
  const level = (await game.getAttribute('data-level')) ?? ''
  if (level === 'first-3-gap' || level === 'first-4-par') {
    await expect(overlap).toBeVisible()
    if ((await overlap.getAttribute('aria-checked')) !== 'true') await hands.press(overlap)
  }
  for (let turn = 0; turn < 400 && (await front.result(page).count()) === 0; turn++) {
    if ((await front.chips(page).count()) > 0) await hands.press(front.chips(page).first())
    else await hands.press(front.step(page))
  }
  await expect(front.result(page)).toBeVisible()
}

/** Plays a loop demo level that a lesson embeds, in the block `scope`, to its result. */
async function playEmbeddedLoop(scope: Locator, hands: Hands): Promise<void> {
  const skip = scope.locator('[data-intro-skip]')
  if ((await skip.count()) > 0 && (await skip.first().isVisible())) await hands.press(skip.first())
  const overlap = scope.getByRole('switch')
  if ((await overlap.count()) > 0 && (await overlap.first().getAttribute('aria-checked')) !== 'true') await hands.press(overlap.first())
  const chips = scope.locator('.es-lanes__chip:not([disabled])')
  const step = scope.getByRole('button', { name: /^Step/ })
  for (let turn = 0; turn < 400 && (await scope.locator('[data-result]').count()) === 0; turn++) {
    if ((await chips.count()) > 0) await hands.press(chips.first())
    else await hands.press(step.first())
  }
  await expect(scope.locator('[data-result]')).toBeVisible()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The walk                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

for (const size of SIZES) {
  for (const how of HOWS) {
    test.describe(`a first visit at ${size.width} x ${size.height}, by the ${how}`, () => {
      test.use({ viewport: size })

      test('CP1 to CP17', async ({ page, context }) => {
        test.setTimeout(600_000)
        const wide = size.width >= 1000
        await withSettings(context, { view3d: false })
        await queueEntropy(context)
        const hands = handsOf(page, how)

        /* ----- CP1 ----- */
        await test.step('CP1 land on /', async () => {
          await open(page, '/')
          await quiet(page)
          const h1 = page.getByRole('heading', { level: 1 })
          await expect(h1).toBeInViewport({ ratio: 1 })
          await expect(page.getByRole('button', { name: 'Admit request R1 into a batch slot' })).toBeInViewport({ ratio: 1 })
          await expect(front.step(page).or(page.locator('[data-front-step] button').first())).toBeInViewport({ ratio: 1 })
          expect(await copyProblems(page), 'banned words and build-log ids on the landing page').toEqual([])
          await expect(page.locator('.es-marker[data-kind="ring"]:visible')).toHaveCount(1)
          expect(await amberInView(page), 'amber fills in the first viewport').toEqual([])
          expect(await wayOnProblems(page, FIRST_VISIT)).toEqual([])
        })

        /* ----- CP2 ----- */
        await test.step('CP2 the parts', async () => {
          await expect(page.locator('[data-callout]:visible')).toHaveCount(5)
          if (wide) {
            const list = page.locator('[data-coach-list] li')
            await expect(list).toHaveCount(5)
            for (const text of await list.allTextContents()) expect(text, 'a part is named in the engine\'s words, then said').toMatch(/[A-Za-z][^:]+: \S/)
            // The five ink callouts and the five lines are the same five parts.
            const discs = await page.locator('[data-callout]:visible').evaluateAll((all) => all.map((disc) => disc.getAttribute('data-callout')))
            expect(discs.sort()).toEqual(['1', '2', '3', '4', '5'])
          } else {
            await expect(page.locator('[data-coach-line]')).toContainText('1 of 5')
            await expect(page.locator('[data-callout="1"][data-current]')).toBeVisible()
            const toggle = front.game(page).getByRole('button', { name: 'Parts', exact: true })
            await hands.press(toggle)
            const parts = page.getByRole('list', { name: 'Parts of the Step loop' })
            await expect(parts).toBeVisible()
            expect(await parts.getByRole('listitem').count()).toBeGreaterThanOrEqual(5)
            // It is a disclosure: the same control closes it, so the diagram is not left under a list.
            await expect(toggle).toHaveAttribute('aria-expanded', 'true')
            await hands.press(toggle)
            await expect(parts).toBeHidden()
          }
        })

        /* ----- CP3 ----- */
        await test.step('CP3 first move', async () => {
          await hands.press(page.getByRole('button', { name: 'Admit request R1 into a batch slot' }))
          await expect(page.locator('[data-coach-told]')).toContainText('Request R1 admitted into slot 1.')
          const step = front.step(page)
          await expect(step).toHaveClass(/es-primary-button__pull/)
          expect(await amberInView(page), 'the one amber fill is Step').toEqual(['Step'])
        })

        /* ----- CP4 ----- */
        await test.step('CP4 first step', async () => {
          for (let n = 0; n < 3; n++) await hands.press(front.chips(page).first())
          await hands.press(front.step(page))
          await expect(page.locator('[data-loop-readout] [data-readout-id="tokens"]')).toContainText('4')
          await expect(page.getByText(/batching/).first()).toBeVisible()
        })

        /* ----- CP5 ----- */
        const course = await test.step('CP5 into the course', async () => {
          await playFrontLevel(page, hands)
          const result = front.result(page)
          const next = result.getByRole('button', { name: 'Next demo level: Refill a slot' })
          await expect(next).toHaveClass(/es-primary-button__pull/)
          const start = result.getByRole('link', { name: new RegExp(`^Start the course: TR1 lesson 1 \\(${FIRST_VISIT.minutes} min, browser only\\)$`) })
          await expect(start).toBeVisible()
          await expect(start).toHaveAttribute('href', FIRST_VISIT.href)
          await expect(start).toHaveClass(/es-front-out/)
          expect(await deadPlaces(page), 'a dead place at the end of the first level').toEqual([])
          return start
        })

        /* ----- CP6 ----- */
        await test.step('CP6 lesson, first screen', async () => {
          await hands.press(course)
          await expect(page).toHaveURL(new RegExp(`${TR1_L1}$`))
          await page.locator('.es-lesson__title').waitFor()
          await quiet(page)
          const crumbs = page.locator('nav.es-lesson__crumbs')
          await expect(crumbs).toContainText('Course')
          const crumbText = (await crumbs.textContent()) ?? ''
          expect(crumbText, 'the breadcrumb shows titles, not ids').toMatch(/TR1 \S+/)
          expect(crumbText).not.toMatch(/tr1\.l1|l1-five/)
          await expect(page.locator('.es-lesson__primer-title')).toHaveText('Before you run')
          expect(words((await page.locator('.es-lesson__primer').textContent()) ?? ''), 'the primer under "Before you run"').toBeLessThanOrEqual(200)
          const top = await page.locator('#run [data-block="game"]').first().evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
          if (wide) expect(top, 'the instrument\'s top edge is in the first viewport').toBeLessThan(size.height)
          else expect(top, 'the instrument\'s top edge is within two screens').toBeLessThan(size.height * 2)
          await sound(page, 'TR1 lesson 1, first screen')
        })

        /* ----- CP7 ----- */
        const floor = page.locator('section[data-game="engine-floor"]')
        await test.step('CP7 game, cold', async () => {
          await expect(floor).toBeVisible({ timeout: 60_000 })
          await floor.locator('.es-frame__role').scrollIntoViewIfNeeded()
          await expect(floor.locator('.es-frame__role')).toBeVisible()
          await expect(floor.locator('.es-goal')).toBeVisible()
          // The game's own question waits for the parts: the slot is there, and holds back until the intro has been read.
          await floor.locator('[data-prediction]').first().waitFor({ state: 'attached' })
          await expect(floor.locator('[data-prediction][data-waiting]')).toHaveCount(1)
          await expect(floor.locator('.es-intro')).toBeVisible()
        })

        /* ----- CP8 ----- */
        await test.step('CP8 guess and run', async () => {
          // Two prompts, no more, stand before the first move: the lesson's guess above the run, and the level's own in its slot.
          const prompts = page.locator('section[data-block="predict"][data-phase="asking"], [data-prediction]')
          expect(await prompts.count(), 'prompts before the first move').toBeLessThanOrEqual(2)
          const guess = page.locator('section[data-block="predict"][data-predict="tr1.l1.p2"]')
          await hands.write(guess.getByLabel('Your number'), '1')
          await hands.press(guess.getByRole('button', { name: 'Commit answer' }))
          await expect(guess).toHaveAttribute('data-phase', 'committed')
          await floorWithHands(page, 'nano', (target) => hands.press(target))
          const result = floor.locator('[data-result]')
          await expect(result).toBeVisible()
          const first = page.locator('section[data-block="predict"][data-predict="tr1.l1.p1"]')
          await expect(first).toHaveAttribute('data-phase', 'revealed', { timeout: 30_000 })
          // The debrief shows the guess beside the model's answer.
          const debrief = `${(await result.textContent()) ?? ''} ${(await first.textContent()) ?? ''}`
          expect(debrief).toMatch(/you wrote|your guess|Your guess/i)
          expect(debrief).toMatch(/boundar(y|ies)/)
          expect((await playEvents(page)).length, 'the run is in the ledger').toBe(1)
          expect((await predictEvents(page)).length, 'both guesses are in the ledger').toBe(2)
        })

        /* ----- CP9 ----- */
        await test.step('CP9 told back', async () => {
          const rail = wide ? page.locator('.es-srail') : page.locator('.es-lesson__strip')
          if (wide) {
            const run = rail.locator('li.es-srail__section').first()
            await expect(run).toContainText(/you (said|wrote)/i)
            await expect(run).toContainText('0')
          } else {
            // On a phone the rail is a strip, and its list opens from it: the Run entry holds the same answer.
            await hands.press(page.locator('.es-lesson__strip button').first())
            const list = page.locator('.es-srail').first()
            await expect(list.locator('li.es-srail__section').first()).toContainText(/you (said|wrote)/i)
            await page.keyboard.press('Escape')
          }
        })

        /* ----- CP10 ----- */
        await test.step('CP10 read', async () => {
          const part = page.locator('section.es-lesson__part').first()
          await part.scrollIntoViewIfNeeded()
          await expect(part.locator('.es-lesson__part-title')).toBeVisible()
          await expect(part.locator('.es-lesson__meta')).toHaveText(/^Part 1 of \d+/)
          // No notional-machine card in the flow of Read, and no claim box inside a sentence: a claim is a numbered link that opens on request.
          await expect(page.locator('.es-lesson__read-flow [data-block="card"]')).toHaveCount(0)
          expect(await page.locator('.es-lesson__prose p [data-block], .es-lesson__prose p .es-claim-box, .es-lesson__prose p .es-c-claim').count()).toBe(0)
          expect(await deadPlaces(page), 'a dead place in Read').toEqual([])
        })

        /* ----- CP11 ----- */
        const testSet = page.locator('#test section[data-block="item"]')
        await test.step('CP11 test', async () => {
          await testSet.scrollIntoViewIfNeeded()
          await answerSet(page, testSet, hands, 'right')
          await expect(testSet.getByRole('heading', { name: /^3 of 3: passed/ })).toBeVisible()
        })

        /* ----- CP12 ----- */
        await test.step('CP12 keep', async () => {
          await page.locator('#keep').scrollIntoViewIfNeeded()
          const record = page.locator('[data-record] code')
          expect(await record.count(), 'the record lists what was done').toBeGreaterThanOrEqual(3)
          const step = await wayOn(page)
          expect(step.lesson, 'with the Test passed the way on is the next lesson').toBe('tr1.l2')
          const amber = page.locator('#keep .es-next__action[data-emphasis="primary"]')
          await expect(amber).toHaveCount(1)
          await expect(amber).toHaveAttribute('href', step.href)
          await expect(amber).toContainText('lesson 2')
          expect(await header(page)).toEqual({ href: step.href, label: step.label })
        })

        /* ----- CP13 ----- */
        await test.step('CP13 course', async () => {
          await open(page, '/map')
          await quiet(page)
          const step = await wayOn(page)
          // The page opens with a sentence that tells what was just done, in the lesson it was done in.
          await expect(page.locator('main p').filter({ hasText: /^Last time: you / }).first()).toContainText(/passed 3 questions in TR1 lesson 1\./)
          expect(await wayOnProblems(page, step)).toEqual([])
          const way = page.locator('main a.es-header__next[data-emphasis="primary"]').first()
          await expect(way).toHaveAttribute('href', step.href)
          expect(await copyProblems(page)).toEqual([])
        })

        /* ----- CP14 ----- */
        await test.step('CP14 agreement', async () => {
          const step = await wayOn(page)
          const seen: string[] = []
          for (const route of ['/', '/map', '/m/tr1', '/today', '/evidence']) {
            await open(page, route)
            await quiet(page)
            expect(await wayOnProblems(page, step), `${route}: every Continue is nextStep's`).toEqual([])
            const controls = await wayControls(page)
            seen.push(...controls.map((control) => `${route} ${control.href}`))
            expect(new Set(controls.map((control) => control.href)), `${route}: one answer`).toEqual(new Set([step.href]))
            expect(await header(page)).toEqual({ href: step.href, label: step.label })
          }
          expect(seen.length).toBeGreaterThanOrEqual(10)
        })

        /* ----- CP15 ----- */
        await test.step('CP15 return', async () => {
          await open(page, '/')
          await page.reload()
          await open(page, '/')
          await quiet(page)
          const step = await wayOn(page)
          await expect(page.locator('.es-front-back')).toContainText(/Last time|left off|Next/i)
          const back = page.locator('.es-front-back a.es-header__next')
          await expect(back).toHaveAttribute('href', step.href)
          expect(await wayOnProblems(page, step)).toEqual([])
        })

        /* ----- CP16 ----- */
        await test.step('CP16 out of order', async () => {
          await open(page, TR2_L3)
          await quiet(page)
          const opener = page.locator('[data-block="game"][data-play="loop/first-4-par"]')
          await expect(opener).toHaveAttribute('data-phase', 'open', { timeout: 60_000 })
          await playEmbeddedLoop(opener, hands)
          const step = await wayOn(page)
          expect(step.lesson, 'Continue names TR2 lesson 3 after its opener').toBe('tr2.l3')
          await open(page, '/')
          expect(await header(page)).toEqual({ href: step.href, label: step.label })
          expect(step.label).toContain('TR2 lesson 3')
          // Its Test, passed: Continue names lesson 4, and Course says the lessons before are not finished, quietly.
          await open(page, TR2_L3)
          const set = page.locator('#test section[data-block="item"]').first()
          await set.scrollIntoViewIfNeeded()
          await answerSet(page, set, hands, 'right')
          const after = await wayOn(page)
          expect(after.lesson).toBe('tr2.l4')
          expect(after.skipped, 'TR2 lessons 1 and 2 are not done').toBeGreaterThan(0)
          expect(await header(page)).toEqual({ href: after.href, label: after.label })
          await open(page, '/map')
          await quiet(page)
          await expect(page.locator('main')).toContainText(/earlier lessons? not finished/)
          expect(await wayOnProblems(page, after)).toEqual([])
        })

        /* ----- CP17 ----- */
        await test.step('CP17 a guess with no run', async () => {
          await open(page, TR2_L7)
          await quiet(page)
          const guess = page.locator('section[data-block="predict"][data-predict="tr2.l7.p1"]')
          await guess.scrollIntoViewIfNeeded()
          await expect(guess).toHaveAttribute('data-phase', 'asking')
          const commit = guess.getByRole('button', { name: 'Commit answer' })
          await expect(commit).toBeEnabled()
          await hands.write(guess.getByLabel('Your number'), '2')
          await hands.press(commit)
          await expect(guess).toHaveAttribute('data-phase', /committed|revealed/)
          await expect(guess.locator('[data-truth]')).toBeVisible({ timeout: 30_000 })
          expect(((await guess.textContent()) ?? '').length).toBeGreaterThan(80)
          expect(await deadPlaces(page)).toEqual([])
          expect(await buildLogIds(page)).toEqual([])
        })

        expect((await ledgerEvents(page)).length, 'the walk left its evidence').toBeGreaterThan(10)
        if (how === 'keyboard') expect(hands.walk.problems(), 'a focus stop that a keyboard user could not see').toEqual([])
      })
    })
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* CP17, over all 27 lessons                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('CP17 over every lesson: no lock, no disabled commit and no task id', () => {
  for (const lesson of LESSONS) {
    test(`${lesson.id}`, async ({ page, context }) => {
      test.setTimeout(120_000)
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, lesson.route)
      await quiet(page)
      expect(await page.locator('button:disabled, [aria-disabled="true"]').filter({ hasText: /^Commit/i }).count(), 'a disabled commit').toBe(0)
      const dead = (await deadPlaces(page)).filter((place) => !place.startsWith('an empty box'))
      expect(dead, 'a lock, or a disabled control with no reason').toEqual([])
      expect(await taskIds(page), 'a task id').toEqual([])
      expect(OPENERS.some((row) => row.lesson === lesson.id), 'the lesson has a row in the openers table').toBe(true)
    })
  }
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson to lesson, in one visit                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/*
 * The final walks' first trip: a lesson opened from another in the same visit (a client-side navigation, not a load) replaced the whole
 * page with React's "maximum update depth" error, because the level names' hook handed back a new function on every render once they had
 * loaded. A load never failed, so every other spec missed it. This follows the site's own links through three TR1 lessons and on to TR5a
 * lesson 1 and TR2 lesson 1 (the KV page pool and the step loop after Request path), presses each lesson's first Play, and holds that the
 * page never stops and that each gate names its own level.
 */
for (const size of SIZES) {
  test.describe(`lesson to lesson by the site's links at ${size.width} x ${size.height}`, () => {
    test.use({ viewport: size })

    test('three TR1 lessons by their Continue, then TR5a lesson 1 and TR2 lesson 1 through Course: no page stops, and every Play opens its level', async ({ page, context, watch }) => {
      test.setTimeout(240_000)
      await withSettings(context, { view3d: false })
      const stopped = page.getByRole('heading', { level: 1, name: 'This page stopped' })
      // Follows the first link in the page's main landmark whose address matches: a client-side navigation, as a click on it is.
      const go = async (href: RegExp) => {
        await page.locator('main a[href]').first().waitFor()
        const found = await page.locator('main a[href]').evaluateAll((links, source) => {
          const pattern = new RegExp(source)
          return links.map((a) => a.getAttribute('href') ?? '').find((h) => pattern.test(h)) ?? null
        }, href.source)
        expect(found, `a link on the page to ${href.source}`).not.toBeNull()
        await page.locator(`main a[href="${found}"]`).first().click()
        await page.waitForURL(href)
        await quiet(page)
        await expect(stopped).toHaveCount(0)
      }
      // A lesson whose Run opens on the level has no gate to press; elsewhere the first "Play: <level>" opens it.
      const play = async () => {
        const gate = page.getByRole('button', { name: /^Play: / }).first()
        if (!(await gate.isVisible({ timeout: 5_000 }).catch(() => false)) && (await gate.count()) === 0) {
          await expect(page.locator('section[data-game]').first()).toBeAttached({ timeout: 60_000 })
          await expect(stopped).toHaveCount(0)
          return ''
        }
        await gate.scrollIntoViewIfNeeded()
        const label = ((await gate.textContent()) ?? '').trim()
        await gate.click()
        await expect(page.locator('section[data-game]').first()).toBeVisible({ timeout: 60_000 })
        await expect(stopped).toHaveCount(0)
        return label
      }

      await open(page, TR1_L1)
      await play()
      await go(/\/m\/tr1\/l2-/)
      // The gate names the lesson's own level, not the game alone: the level names loaded and did not loop.
      expect(await play()).not.toBe('Play: Request path')
      await go(/\/m\/tr1\/l3-/)
      await play()
      // The lesson's breadcrumb, which a phone shows as a desk does.
      await go(/\/map$/)
      await go(/\/m\/tr5a$/)
      await go(/\/m\/tr5a\/l1-/)
      await play()
      // The lesson's breadcrumb, which a phone shows as a desk does.
      await go(/\/map$/)
      await go(/\/m\/tr2$/)
      await go(/\/m\/tr2\/l1-/)
      await play()
      await expect(page.getByText('The game stopped.')).toHaveCount(0)
      expect(watch.errors.filter((line) => /Maximum update depth|185/.test(line))).toEqual([])
    })
  })
}
