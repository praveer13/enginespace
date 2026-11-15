/*
 * W1-T04's acceptance checks, in Playwright's Chromium, on the item block of TR2's third lesson (/m/tr2/l3-async-scheduling-closes-the-bubble,
 * the exit check: family tr2.bubble-width at level 2, three items an attempt; W1-T15 moved it here from the sample lesson):
 *
 *   2. Two graded attempts draw different seeds. The block reads fresh entropy when the learner starts an attempt, so the three seeds
 *      of one attempt and the three of the next are six seeds, and each is on its ticket (data-seed, and the foot line).
 *   (1. verify:items and 3. the Markdown export hold no key: tests/items/verify-items.test.ts.)
 *
 * And what stands behind them: the page holds no key before a ticket is checked; a checked answer is graded against the key of its
 * seed and written to the ledger as an `item` event with its provenance, the confidence tapped, the seed and the answer, and that
 * event grades again to the same verdict; the keyboard completes every ticket; reduced motion has the reveal there at once; and axe
 * finds no serious or critical violation in any state, at a phone's width and a laptop's.
 *
 * How it runs. Through the config's `baseURL` (`vite preview` over a fresh build), under e2e/support/site.ts's watch: a request that
 * leaves the origin, a policy refusal and a page error all fail a test. The ledger loads when an attempt starts, and the policy refuses
 * nothing then either: the schemas are built jitless, so zod does not probe `new Function('')` (packages/schema/zod.ts, D-059). Where a
 * test wants fixed seeds it answers `crypto.getRandomValues` from a queue, which is what a page's own entropy is, and every other test
 * draws its own.
 *
 *   npx playwright test e2e/items.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { regradeItem, plain } from '../packages/play/items'
import { bubbleWidth } from '../packages/play/items/families/tr2/bubble-width'
import type { Item } from '../packages/play/items'
import { clipped, expect, open, quiet, test } from './support/site'
import type { Watch } from './support/site'

const ROUTE = '/m/tr2/l3-async-scheduling-closes-the-bubble'
/** Seeds that make, at level 2 and in this order, async-off, async-on and close-it (found with the family's own band and variant draw). */
const SEEDS = [1, 2, 4]

declare global {
  interface Window {
    __queue?: number[]
  }
}

/** The page's entropy is answered from `window.__queue` when it holds enough, and is the browser's own otherwise. */
test.beforeEach(async ({ context }) => {
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
})

/**
 * The browser reports a refusal of the policy in a task of its own, and the page's binding carries it to the test a moment later, so one
 * could arrive after the ticket is on screen. Each test ends by waiting that moment and finding none.
 */
test.afterEach(async ({ page, watch }) => {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200))).catch(() => undefined)
  await expectNoRefusal(watch)
})

const block = (page: Page): Locator => page.locator('section[data-block="item"]')
const stub = (page: Page, name: RegExp | string): Locator => block(page).getByRole('button', { name })

interface Ticket {
  seed: number
  level: number
  variant: string
  kind: string
  phase: string
  item: Item
}

/** What the ticket on the page says it is, and the item that its seed makes. */
async function ticket(page: Page): Promise<Ticket> {
  const attributes = await block(page).evaluate((element) => ({
    seed: element.getAttribute('data-seed'),
    level: element.getAttribute('data-level'),
    variant: element.getAttribute('data-variant'),
    kind: element.getAttribute('data-kind'),
    phase: element.getAttribute('data-phase'),
  }))
  const seed = Number(attributes.seed)
  const level = Number(attributes.level)
  const item = bubbleWidth.make(seed, level as 0 | 1 | 2 | 3, attributes.variant ?? '')
  return { seed, level, variant: attributes.variant ?? '', kind: attributes.kind ?? '', phase: attributes.phase ?? '', item }
}

/** Pulls the first stub: an attempt starts, with the entropy the page reads then. A refusal by the policy is the ledger's, which loads now. */
async function start(page: Page, watch: Watch, queue?: number[]): Promise<void> {
  if (queue !== undefined) await page.evaluate((seeds) => void (window.__queue = seeds), queue)
  await stub(page, 'Start items').click()
  await expect(block(page)).toHaveAttribute('data-phase', 'asking')
  await expectNoRefusal(watch)
}

/** Loading the ledger refuses nothing (see the note at the head of this file): the watch's list is empty when the attempt has started. */
async function expectNoRefusal(watch: Watch): Promise<void> {
  expect(watch.refused, 'what the policy refused when the ledger loaded').toEqual([])
}

const field = (page: Page): Locator => block(page).locator('input.es-field__input')

/** Writes the answer that is right for the ticket, or the one that is wrong, and says how sure; it does not check the ticket. */
async function fill(page: Page, which: 'right' | 'wrong', sure?: string): Promise<Ticket> {
  const current = await ticket(page)
  const spec = current.item.answer
  if (spec.kind === 'numeric') {
    await field(page).fill(String(which === 'right' ? spec.truth : spec.truth + 300))
  } else {
    const option = spec.options.find((candidate) => (which === 'right') === (candidate.id === spec.correct)) ?? spec.options[0]
    await block(page).getByRole('radio', { name: plain(option.text) }).check()
  }
  if (sure !== undefined) await stub(page, sure).click()
  return current
}

async function check(page: Page): Promise<void> {
  await stub(page, /Check the ticket/).click()
  await expect(block(page)).toHaveAttribute('data-phase', 'revealed')
  await quiet(page, 300)
}

interface StoredItem {
  id: string
  kind: string
  ref: string
  ok: boolean
  score: number
  provenance: string
  seed?: number
  conf?: string
  rev?: string
  data: { answer: unknown }
}

/** Every `item` event in the ledger's IndexedDB, oldest first. */
async function ledger(page: Page): Promise<StoredItem[]> {
  const rows = await page.evaluate(
    () =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const all = db.transaction('events').objectStore('events').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve(all.result)
          }
        }
      }),
  )
  return (rows as (StoredItem & { at: string })[]).filter((row) => row.kind === 'item').sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

/** Waits until the ledger holds `count` item events: an answer is written when it is checked, a moment after the reveal. */
async function ledgerHolds(page: Page, count: number): Promise<StoredItem[]> {
  await expect.poll(async () => (await ledger(page)).length, { message: 'item events in the ledger' }).toBe(count)
  return ledger(page)
}

/** One attempt, answered right or wrong as `plan` says, through to the tally. Returns the seeds that were served. */
async function play(page: Page, plan: ('right' | 'wrong')[]): Promise<number[]> {
  const seeds: number[] = []
  for (const [index, which] of plan.entries()) {
    const current = await fill(page, which)
    seeds.push(current.seed)
    await check(page)
    await stub(page, index === plan.length - 1 ? /Tally the tickets/ : /Next ticket/).click()
    if (index < plan.length - 1) await expect(block(page)).toHaveAttribute('data-phase', 'asking')
  }
  await expect(block(page)).toHaveAttribute('data-phase', 'done')
  return seeds
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Accept 2                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('accept 2', () => {
  test('two graded attempts draw different seeds, and each seed is on its ticket', async ({ page, watch }) => {
    await open(page, ROUTE)
    // The first ticket is waiting, and no seed has been drawn: entropy is read when the learner starts.
    await expect(block(page)).toHaveAttribute('data-phase', 'idle')
    await expect(block(page)).not.toHaveAttribute('data-seed', /.*/)

    await start(page, watch)
    const first = await ticket(page)
    await expect(block(page).locator('.es-ticket__foot')).toContainText(`seed ${first.seed.toString(16).toUpperCase().padStart(8, '0')}`)
    await expect(block(page).locator('.es-ticket__foot')).toContainText('unseen')
    const attemptOne = await play(page, ['right', 'wrong', 'right'])

    await expect(block(page).getByRole('heading', { name: '2 of 3 right' })).toBeVisible()
    await stub(page, 'New numbers').click()
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    const attemptTwo = await play(page, ['right', 'right', 'right'])

    expect(attemptOne).toHaveLength(3)
    expect(attemptTwo).toHaveLength(3)
    // Six seeds, all different: not one of the second attempt's was in the first.
    expect(new Set([...attemptOne, ...attemptTwo]).size).toBe(6)
    for (const seed of [...attemptOne, ...attemptTwo]) expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true)

    // The ledger holds all six, on the seeds the tickets showed.
    const events = await ledgerHolds(page, 6)
    expect(events.map((event) => event.seed)).toEqual([...attemptOne, ...attemptTwo])
    expect(new Set(events.map((event) => event.provenance))).toEqual(new Set(['unseen']))
  })

  test('a reload starts nothing, keeps what was answered, and the next attempt is on seeds of its own', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch)
    const before = await play(page, ['right', 'wrong', 'right'])
    await ledgerHolds(page, 3)
    await page.reload()
    await open(page, ROUTE)
    await expect(block(page)).toHaveAttribute('data-phase', 'idle')
    expect((await ledgerHolds(page, 3)).map((event) => event.seed)).toEqual(before)
    await start(page, watch)
    const after = (await ticket(page)).seed
    expect(before).not.toContain(after)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The ticket, the reveal and the ledger                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a ticket', () => {
  test('holds no key and no solution before it is checked, and a wrong answer gets the key, a diagnosis and the why', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch, SEEDS)
    const first = await ticket(page)
    expect(first.variant).toBe('async-off')
    const asking = await block(page).evaluate((element) => ({ html: element.outerHTML, text: element.textContent ?? '' }))
    for (const step of bubbleWidth.solution(first.item)) {
      for (const sentence of plain(step.text.filter((part) => part.t === 'text')).split(/(?<=\.)\s/).filter((text) => text.length > 30)) expect(asking.text).not.toContain(sentence)
    }
    expect(asking.html).not.toContain('data-ok')
    expect(asking.html).not.toContain('truth')
    expect(asking.html).not.toContain('es-item__reveal')
    await expect(field(page)).toBeEnabled()

    await fill(page, 'wrong', 'sure')
    await check(page)
    const reveal = block(page).locator('.es-item__reveal')
    await expect(reveal).toHaveAttribute('data-ok', 'false')
    await expect(reveal.getByRole('heading', { name: 'Not this one.' })).toBeFocused()
    if (first.item.answer.kind !== 'numeric') throw new Error('a numeric item')
    await expect(reveal).toContainText('you wrote')
    await expect(reveal).toContainText('the key')
    await expect(reveal).toContainText('you said')
    await expect(reveal.locator('.es-item__said')).toHaveText('sure')
    await expect(reveal.locator('.es-item__keys')).toContainText(first.item.answer.truth.toLocaleString('en-US'))
    // The solution is printed, step by step, and the controls that took the answer are gone from the ticket.
    await expect(reveal.locator('.es-item__steps li')).toHaveCount(3)
    await expect(field(page)).toHaveCount(0)
    await expect(block(page).locator('.es-item__plates')).toHaveCount(0)
    await expect(block(page)).toHaveAttribute('data-ok', 'false')
  })

  test('an answer is written to the ledger as an item event, with its provenance, its confidence, its seed and its answer, and no key', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch, SEEDS)
    // Item 1, numeric, wrong, sure. Item 2, numeric, right, no tap. Item 3, a choice, right, a guess.
    const one = await fill(page, 'wrong', 'sure')
    await check(page)
    await stub(page, /Next ticket/).click()
    const two = await fill(page, 'right')
    await check(page)
    await stub(page, /Next ticket/).click()
    const three = await fill(page, 'right', 'guess')
    await check(page)

    const events = await ledgerHolds(page, 3)
    expect(events.map((event) => [event.ref, event.ok, event.score, event.provenance, event.seed, event.conf])).toEqual([
      [`item:gen/tr2.bubble-width/${one.variant}`, false, 0, 'unseen', one.seed, 'sure'],
      [`item:gen/tr2.bubble-width/${two.variant}`, true, 1, 'unseen', two.seed, undefined],
      [`item:gen/tr2.bubble-width/${three.variant}`, true, 1, 'unseen', three.seed, 'guess'],
    ])
    expect(events.map((event) => event.rev)).toEqual([one.item.rev, two.item.rev, three.item.rev])
    const text = JSON.stringify(events)
    for (const forbidden of ['"truth"', 'solution', '"why"', 'duration']) expect(text).not.toContain(forbidden)
    // The stored answer is the level and the response, and grading it again from the seed gives the verdict that was recorded.
    for (const event of events) {
      const again = regradeItem({ ref: event.ref, seed: event.seed, rev: event.rev, answer: event.data.answer })
      expect(again).toMatchObject({ valid: true, ok: event.ok, score: event.score, stale: false })
    }
    expect(events[0].data.answer).toEqual({ level: 2, response: { kind: 'numeric', value: (one.item.answer.kind === 'numeric' ? one.item.answer.truth : 0) + 300 } })
  })

  test('the confidence tap is optional and never gates: an answer checks without it, and a tap can be taken back', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch, SEEDS)
    await fill(page, 'right')
    const plates = block(page).locator('.es-item__plates button')
    await expect(plates).toHaveCount(3)
    for (const plate of await plates.all()) await expect(plate).toHaveAttribute('aria-pressed', 'false')
    await stub(page, 'think so').click()
    await expect(stub(page, 'think so')).toHaveAttribute('aria-pressed', 'true')
    await stub(page, 'think so').click()
    await expect(stub(page, 'think so')).toHaveAttribute('aria-pressed', 'false')
    await check(page)
    await expect(block(page).locator('.es-item__reveal')).toHaveAttribute('data-ok', 'true')
    const [event] = await ledgerHolds(page, 1)
    expect(event.conf).toBeUndefined()
  })

  test('an empty slip, and a word, are asked for again and graded nothing; a choice needs a tick', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch, SEEDS)
    await stub(page, /Check the ticket/).click()
    await expect(block(page).getByRole('alert')).toContainText('Write a number, in µs, and then check the ticket.')
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await field(page).fill('about two thousand')
    await stub(page, /Check the ticket/).click()
    await expect(block(page).getByRole('alert')).toContainText('Write a number')
    await expect(field(page)).toHaveAttribute('aria-invalid', 'true')
    await field(page).fill('1,000')
    await expect(block(page).getByRole('alert')).toHaveCount(0)
    expect(await ledger(page).catch(() => [])).toEqual([])
    // Item 3 is a choice.
    await fill(page, 'right')
    await check(page)
    await stub(page, /Next ticket/).click()
    await fill(page, 'right')
    await check(page)
    await stub(page, /Next ticket/).click()
    await expect(block(page).locator('fieldset.es-item__choice')).toBeVisible()
    await stub(page, /Check the ticket/).click()
    await expect(block(page).getByRole('alert')).toContainText('Tick one line')
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
  })

  test('a wrong choice is explained option by option, and the right one is marked', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch, SEEDS)
    for (let item = 0; item < 2; item += 1) {
      await fill(page, 'right')
      await check(page)
      await stub(page, /Next ticket/).click()
    }
    const current = await fill(page, 'wrong', 'guess')
    await check(page)
    if (current.item.answer.kind !== 'choice') throw new Error('a choice item')
    const options = block(page).locator('.es-item__option')
    await expect(options).toHaveCount(4)
    for (const option of current.item.answer.options) {
      const row = options.filter({ hasText: plain(option.text) })
      await expect(row.locator('.es-item__why')).toBeVisible()
      if (option.id === current.item.answer.correct) await expect(row).toHaveAttribute('data-key', 'true')
    }
    await expect(block(page).locator('.es-item__option[data-yours="true"] .es-item__mark')).toContainText('Your pick.')
    await expect(block(page).locator('.es-item__option[data-key="true"] .es-item__mark')).toContainText('Right.')
    await stub(page, /Tally the tickets/).click()
    await expect(block(page).getByRole('heading', { name: '2 of 3 right' })).toBeVisible()
    await expect(block(page).locator('.es-item__lines li')).toHaveText([/1.*right/s, /2.*right/s, /3.*missed/s])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Keyboard, motion and axe                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Presses Tab until `target` has focus: proof that a keyboard reaches it, in a bounded number of keys. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < 40; presses += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error('the keyboard never reached the control')
}

test.describe('the keyboard', () => {
  test('completes every ticket of an attempt, and asks for new numbers, with no pointer', async ({ page, watch }) => {
    await open(page, ROUTE)
    await page.evaluate((seeds) => void (window.__queue = seeds), SEEDS)
    // The walk starts at the lesson's "Exit check" heading, which is what a reader who jumps to it by its anchor has focused. A lesson's
    // claims each put a source link in the tab order before the block, so from the top of this page the block's first button is 95 presses
    // away at 360 px [measured 2026-11-08 at b5fb81a with this task's tree], where the sample lesson's was within 40; from the heading it is
    // one. The page's own keyboard walk is W1-T36's.
    await page.locator('#exit-check').waitFor()
    await page.evaluate(() => {
      const heading = document.getElementById('exit-check')
      if (heading === null) throw new Error('the lesson has no "Exit check" heading')
      heading.tabIndex = -1
      heading.focus()
    })
    await tabTo(page, stub(page, 'Start items'))
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await expectNoRefusal(watch)
    await expect(block(page).locator('h3.es-item__count')).toBeFocused()

    // Item 1, numeric: the slip is the next thing in the tab order, and Enter checks it.
    const one = await ticket(page)
    if (one.item.answer.kind !== 'numeric') throw new Error('a numeric item')
    await page.keyboard.press('Tab')
    await expect(field(page)).toBeFocused()
    await page.keyboard.type(String(one.item.answer.truth))
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'revealed')
    await expect(block(page).getByRole('heading', { name: 'Right.' })).toBeFocused()
    await tabTo(page, stub(page, /Next ticket/))
    await page.keyboard.press('Enter')

    // Item 2, numeric again, with a confidence tap by keyboard.
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await expect(block(page).locator('h3.es-item__count')).toBeFocused()
    const two = await ticket(page)
    if (two.item.answer.kind !== 'numeric') throw new Error('a numeric item')
    await page.keyboard.press('Tab')
    await page.keyboard.type(String(two.item.answer.truth))
    await tabTo(page, stub(page, 'sure'))
    await page.keyboard.press('Enter')
    await expect(stub(page, 'sure')).toHaveAttribute('aria-pressed', 'true')
    await tabTo(page, stub(page, /Check the ticket/))
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'revealed')
    await tabTo(page, stub(page, /Next ticket/))
    await page.keyboard.press('Enter')

    // Item 3, a choice: the radios are one group, and the arrow keys move through it.
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    const three = await ticket(page)
    if (three.item.answer.kind !== 'choice') throw new Error('a choice item')
    const wanted = three.item.answer.options.find((option) => three.item.answer.kind === 'choice' && option.id === three.item.answer.correct)
    if (wanted === undefined) throw new Error('a key')
    const radio = block(page).getByRole('radio', { name: plain(wanted.text) })
    await tabTo(page, block(page).getByRole('radio').first())
    for (let presses = 0; presses < 5 && !(await radio.isChecked()); presses += 1) await page.keyboard.press('ArrowDown')
    await expect(radio).toBeChecked()
    await tabTo(page, stub(page, /Check the ticket/))
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'revealed')
    await tabTo(page, stub(page, /Tally the tickets/))
    await page.keyboard.press('Enter')
    await expect(block(page).getByRole('heading', { name: '3 of 3 right' })).toBeFocused()
    await tabTo(page, stub(page, 'New numbers'))
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await ledgerHolds(page, 3)
  })
})

test.describe('motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('under reduced motion the reveal is there at once: it has no feed', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch, SEEDS)
    await fill(page, 'right')
    await stub(page, /Check the ticket/).click()
    const reveal = block(page).locator('.es-item__reveal')
    await expect(reveal).toBeVisible()
    const motion = await reveal.evaluate((element) => ({
      name: getComputedStyle(element).animationName,
      clip: getComputedStyle(element).clipPath,
      running: document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === 'es-item-feed').length,
    }))
    // No feed at all, on the first frame: nothing of the reveal is clipped, and no animation of it exists.
    expect(motion).toEqual({ name: 'none', clip: 'none', running: 0 })
  })
})

test.describe('with motion, the reveal is fed out in steps', () => {
  test('the feed runs on the printer\'s duration and ends with everything showing', async ({ page, watch }) => {
    await open(page, ROUTE)
    await start(page, watch, SEEDS)
    await fill(page, 'right')
    await stub(page, /Check the ticket/).click()
    const reveal = block(page).locator('.es-item__reveal')
    await expect(reveal).toBeVisible()
    const duration = await reveal.evaluate((element) => getComputedStyle(element).animationDuration)
    expect(duration).toBe('0.42s')
    await quiet(page, 300)
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === 'es-item-feed' && animation.playState === 'running').length)).toBe(0)
    // The feed holds no clip once it has run, so nothing of the reveal is cut off: the ring of the verdict that takes focus keeps its sides.
    expect(await reveal.evaluate((element) => getComputedStyle(element).clipPath)).toBe('none')
  })
})

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

for (const width of [360, 1280]) {
  test.describe(`axe at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('finds no serious or critical violation in any state of the block, and the headings stay an outline', async ({ page, watch }) => {
      test.setTimeout(150_000)
      const audit = async (label: string): Promise<void> => {
        await quiet(page, 300)
        const results = await new AxeBuilder({ page }).withTags(TAGS).include('section[data-block="item"]').analyze()
        const rules = results.passes.length + results.violations.length
        expect(rules, `${label}: the rules that axe ran`).toBeGreaterThan(5)
        const summary = results.violations.map((violation) => `${violation.id} [${violation.impact}]: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`)
        expect(summary.filter((line) => /\[(serious|critical)\]/.test(line)), `${label}: serious or critical`).toEqual([])
        expect(results.violations.filter((violation) => ['heading-order', 'empty-heading'].includes(violation.id)).map((violation) => violation.id), `${label}: headings`).toEqual([])
        console.log(`axe ${label} at ${width} px: ${rules} rules, ${summary.length === 0 ? 'no violation' : summary.join(' | ')}`)
      }
      await open(page, ROUTE)
      await audit('idle')
      await start(page, watch, SEEDS)
      await audit('asking, numeric')
      await stub(page, /Check the ticket/).click()
      await audit('asking, a word where a number belongs')
      await fill(page, 'wrong', 'sure')
      await check(page)
      await audit('revealed, wrong, numeric')
      await stub(page, /Next ticket/).click()
      await fill(page, 'right', 'think')
      await check(page)
      await audit('revealed, right, numeric')
      await stub(page, /Next ticket/).click()
      await audit('asking, a choice')
      await stub(page, /Check the ticket/).click()
      await audit('asking, a choice with no tick')
      await fill(page, 'wrong', 'guess')
      await check(page)
      await audit('revealed, wrong, a choice')
      await stub(page, /Tally the tickets/).click()
      await audit('the tally')
    })

    test('reflows: no text is cut off at the right edge, and the page needs no sideways scroll, in every state', async ({ page, watch }) => {
      const reflows = async (label: string): Promise<void> => {
        await quiet(page, 300)
        const cut = await clipped(page, 'section[data-block="item"]')
        expect(cut.scrolls, `${label}: sideways scroll`).toBeLessThanOrEqual(0)
        expect(cut.text, `${label}: text past the edge`).toEqual([])
      }
      await open(page, ROUTE)
      await reflows('idle')
      await start(page, watch, SEEDS)
      await reflows('asking, numeric')
      await fill(page, 'wrong', 'sure')
      await check(page)
      await reflows('revealed, numeric')
      await stub(page, /Next ticket/).click()
      await fill(page, 'right')
      await check(page)
      await stub(page, /Next ticket/).click()
      await reflows('asking, a choice')
      await fill(page, 'wrong', 'guess')
      await check(page)
      await reflows('revealed, a choice')
      await stub(page, /Tally the tickets/).click()
      await reflows('the tally')
    })
  })
}
