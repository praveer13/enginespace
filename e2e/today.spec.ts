/*
 * W1-T05's acceptance checks, in Playwright's Chromium, on /today:
 *
 *   3. The page passes axe and a keyboard walk at 360 px. Axe runs in every state of the page, at a phone's width and a laptop's: the
 *      empty one, the prep list, a ticket being prepped (a number to write, a line to tick, an answer that is not one), the same checked
 *      right and checked wrong, the close of a prep, a rest, a welcome-back and a review ahead. The walk is Tab, Enter, Space and the arrow
 *      keys from the top of the document to the end of a prep, with a focus ring at every stop and nothing covering it.
 *   (1. The FSRS reference vectors pass through the wrapper, and 2. a scripted 30-day ledger produces the expected due list: tests/today/.)
 *
 * And what stands behind them. The list is read from the ledger and names the ideas that are due, in an order, and never says how much
 * is overdue. A started prep is held by the page, and its tickets are fresh draws: a second prep draws other seeds than the first, and
 * none the learner met. Checking a ticket is final and writes one `review:<kc>` event with the FSRS grade, the seed, the tap and the
 * item's fingerprint, and no key. The ticket prints the day the idea comes back, which is the model's. A prep that is stopped half way
 * is resumed by reading the ledger again: the list holds what is left. Reduced motion has the reveal there at once.
 *
 * How it runs. Through the config's `baseURL` (`vite preview` over a fresh build), under e2e/support/site.ts's watch. The ledger is
 * seeded the way a learner's own work would have written it: `item` events of the sample family, on days before today, put into the
 * IndexedDB the app creates (the page is opened once first, so that the app makes its database). Where a test wants a ticket of a kind
 * it answers `crypto.getRandomValues` from a queue, which is what the page's own entropy is, and every other test draws its own.
 *
 *   npx playwright test e2e/today.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import type { LedgerEvent } from '../packages/ledger'
import { FAMILIES, familyById, plain } from '../packages/play/items'
import type { Gen, Item } from '../packages/play/items'
import { bubbleWidth } from '../packages/play/items/families/tr2/bubble-width'
import { stepOrder } from '../packages/play/items/families/tr2/step-order'
import { deriveCards } from '../src/items/today/cards'
import { addDays, formatDay } from '../src/items/today/days'
import { drawForKc } from '../src/items/today/draw'
import { appKcsOfRef } from '../src/items/today/kcs'
import { returnDay } from '../src/items/today/plan'
import { composeSession } from '../src/items/today/session'
import { TestLedger } from '../tests/today/support'
import { walkOf } from './support/front'
import { clipped, expect, open, quiet, test, withSettings } from './support/site'

const ROUTE = '/today'
const BUBBLE = 'tr2.bubble'
const OVERLAP = 'tr2.async-overlap'

declare global {
  interface Window {
    __queue?: number[]
  }
}

/** The page's entropy is answered from `window.__queue` when it holds enough, and is the browser's own otherwise. */
test.beforeEach(async ({ context }) => {
  await withSettings(context, { view3d: false })
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

/* ------------------------------------------------------------------------------------------------------------------ */
/* The ledger                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The browser runs in UTC (playwright.config.ts), so its local day is the UTC day. */
const dayOffset = (days: number): string => addDays(new Date().toISOString().slice(0, 10), days)

/** What a learner's own work writes: the sample family's two variants, each right and thought right, on the days given (before today). */
function earned(daysAgo: { bubble?: number; overlap?: number }): LedgerEvent[] {
  const ledger = new TestLedger()
  if (daysAgo.bubble !== undefined) ledger.item(dayOffset(-daysAgo.bubble), 'async-off', { conf: 'think' })
  if (daysAgo.overlap !== undefined) ledger.item(dayOffset(-daysAgo.overlap), 'async-on', { conf: 'think' })
  return ledger.events
}

/** Puts events into the app's own IndexedDB, which the page made when it first opened the ledger. */
async function put(page: Page, events: readonly LedgerEvent[]): Promise<void> {
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('events', 'readwrite')
          for (const row of rows) tx.objectStore('events').put(row)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    events,
  )
}

/** Opens /today on a ledger that holds `events`: the app is opened once to make its database, the events go in, and the page is loaded again. */
async function visit(page: Page, events: readonly LedgerEvent[], route = ROUTE): Promise<void> {
  await open(page, route)
  if (events.length > 0) {
    await put(page, events)
    await page.reload()
    await page.waitForFunction(() => document.querySelector('[data-page="today"] .es-prep:not([data-phase="loading"])') !== null)
  }
  await quiet(page, 300)
}

interface Stored {
  id: string
  kind: string
  ref: string
  ok: boolean
  score: number
  provenance: string
  seed?: number
  conf?: string
  rev?: string
  at: string
  data: { grade?: number }
}

/** Every event of a kind in the app's IndexedDB, oldest first. */
async function ledger(page: Page, kind = 'review'): Promise<Stored[]> {
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
  return (rows as Stored[]).filter((row) => row.kind === kind).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

async function ledgerHolds(page: Page, count: number): Promise<Stored[]> {
  await expect.poll(async () => (await ledger(page)).length, { message: 'review events in the ledger' }).toBe(count)
  return ledger(page)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The page                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const root = (page: Page): Locator => page.locator('[data-page="today"]')
const phase = (page: Page, name: string): Locator => page.locator(`.es-prep[data-phase="${name}"]`)
const block = (page: Page): Locator => page.locator('section[data-block="item"]')
const stub = (page: Page, name: RegExp | string): Locator => page.locator('main').getByRole('button', { name })
const start = (page: Page): Locator => stub(page, 'Start the prep')
const field = (page: Page): Locator => block(page).locator('input.es-field__input')

interface Ticket {
  kc: string
  seed: number
  level: number
  variant: string
  kind: string
  item: Item
}

/**
 * The family that made a ticket: the ticket prints the idea and the variant, and one family has a variant of that name for the idea. Two
 * families assess the bubble (bubble-width and step-order) and they take turns by the reviews the card has had, so the page decides which.
 */
function familyOf(kc: string, variant: string): Gen {
  const found = FAMILIES.filter((family) => family.variants.some((candidate) => candidate.id === variant && candidate.kcs.includes(kc)))
  if (found.length !== 1) throw new Error(`${found.length} families have a variant ${variant} for ${kc}`)
  return found[0]
}

/** What the ticket on the page says it is, and the item that its seed makes. */
async function ticket(page: Page): Promise<Ticket> {
  const a = await block(page).evaluate((element) => ({
    kc: element.getAttribute('data-kc'),
    seed: element.getAttribute('data-seed'),
    level: element.getAttribute('data-level'),
    variant: element.getAttribute('data-variant'),
    kind: element.getAttribute('data-kind'),
  }))
  const seed = Number(a.seed)
  const level = Number(a.level)
  const kc = a.kc ?? ''
  const variant = a.variant ?? ''
  return { kc, seed, level, variant, kind: a.kind ?? '', item: familyOf(kc, variant).make(seed, level as 0 | 1 | 2 | 3, variant) }
}

/** Writes the answer that is right for the ticket, or one that is wrong, and says how sure; it does not check the ticket. */
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

/**
 * The entropy that makes the first ticket of `kc` the kind asked for (found with the same draw the page makes, by the family that the prep
 * names for the idea on a ledger that holds `events`, and on a ledger that has met no seed).
 */
function entropyFor(events: readonly LedgerEvent[], kc: string, kind: 'numeric' | 'choice'): number {
  const today = dayOffset(0)
  const line = composeSession(deriveCards(events, appKcsOfRef, today), today).lines.find((candidate) => candidate.kc === kc)
  const gen = line === undefined ? undefined : familyById(line.family)
  if (line === undefined || gen === undefined) throw new Error(`the prep has no line for ${kc}`)
  for (let entropy = 1; entropy < 1000; entropy += 1) if (drawForKc(gen, kc, line.level, entropy).item.answer.kind === kind) return entropy
  throw new Error(`no entropy makes a ${kind} ticket for ${kc}`)
}

/** The order in which a prep serves these events' ideas today. */
function order(events: readonly LedgerEvent[]): string[] {
  const today = dayOffset(0)
  return composeSession(deriveCards(events, appKcsOfRef, today), today).lines.map((line) => line.kc)
}

const queue = (page: Page, entropy: number[]) => page.evaluate((values) => void (window.__queue = values), entropy)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The list, and a prep                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('the prep list', () => {
  test('names the ideas that are due, each with its title and its id on tape, and says about how long it takes; it never says what is overdue', async ({ page }) => {
    await visit(page, earned({ bubble: 6, overlap: 5 }))
    await expect(phase(page, 'list')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Prep list' })).toBeVisible()
    const lines = page.locator('.es-prep__list .es-prep__line')
    await expect(lines).toHaveCount(2)
    for (const kc of [BUBBLE, OVERLAP]) await expect(page.locator('.es-prep__list .es-prep__kc', { hasText: kc })).toBeVisible()
    // Each line names the family that will serve it. Two families assess the bubble and take turns by the reviews the card has had (one so far,
    // so the second); the overlap has one.
    await expect(lines.filter({ hasText: BUBBLE })).toContainText(stepOrder.title)
    await expect(lines.filter({ hasText: OVERLAP })).toContainText(bubbleWidth.title)
    await expect(page.locator('.es-prep__list .es-ticket__foot')).toContainText('about')
    await expect(page.locator('.es-prep__list .es-ticket__foot')).toContainText('2')
    await expect(page.locator('.es-prep__list .es-ticket__foot')).toContainText('estimated')
    await expect(page.locator('.es-prep__list .es-ticket__foot')).toContainText('nothing is timed')
    await expect(start(page)).toBeVisible()
    // The lamp falls on the list, the place the next decision acts on.
    await expect(page.locator('.es-prep__list')).toHaveAttribute('data-lamp', 'true')
    const text = (await root(page).innerText()).toLowerCase()
    for (const word of ['overdue', 'behind', 'backlog', 'late', 'missed out', 'streak']) expect(text, word).not.toContain(word)
    // No ticket has been drawn, so no seed is on the page.
    await expect(block(page)).toHaveCount(0)
    await expect(page.locator('[data-seed]')).toHaveCount(0)
  })

  test('has nothing to prep before anything is earned, and says what earns something', async ({ page }) => {
    await visit(page, [])
    await expect(phase(page, 'empty')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing to prep yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start with TR2' })).toHaveAttribute('href', '/m/tr2')
    await expect(page.getByRole('link', { name: 'Open the course map' })).toHaveAttribute('href', '/map')
    await expect(start(page)).toHaveCount(0)
  })

  test('is a rest when what is earned is not due: it names the next prep, and offers a review ahead', async ({ page }) => {
    const events = earned({ bubble: 0, overlap: 0 })
    await visit(page, events)
    await expect(phase(page, 'rest')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing is due today' })).toBeVisible()
    // Two Good first reviews are due in two days.
    await expect(page.locator('.es-prep__next')).toHaveText(`Your next prep is ${formatDay(dayOffset(2))}.`)
    await expect(stub(page, 'Review ahead')).toBeVisible()
  })

  test('is a welcome-back after a week of no graded work, and says so, kindly, with no number in it', async ({ page }) => {
    await visit(page, earned({ bubble: 20, overlap: 20 }))
    await expect(page.locator('.es-prep__list')).toHaveAttribute('data-mode', 'welcome-back')
    const note = page.locator('.es-prep__note')
    await expect(note).toContainText('Welcome back.')
    expect(await note.innerText()).not.toMatch(/\d/)
    await expect(page.locator('.es-prep__list .es-prep__line')).toHaveCount(2)
  })
})

test.describe('a prep', () => {
  test('works through the list one ticket at a time, writes a review for each, and closes with a tally and a next prep', async ({ page }) => {
    test.setTimeout(120_000)
    const events = earned({ bubble: 6, overlap: 5 })
    const [first, second] = order(events)
    await visit(page, events)
    await queue(page, [entropyFor(events, first, 'numeric'), entropyFor(events, second, 'choice')])
    await start(page).click()

    // Ticket 1: a number to write. The ticket is under the lamp, holds a seed on its foot line, and the list has folded to a strip on a phone.
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await expect(block(page)).toHaveAttribute('data-lamp', 'true')
    await expect(block(page)).toHaveAttribute('data-kc', first)
    await expect(block(page).locator('h3.es-item__count')).toBeFocused()
    await expect(block(page).locator('h3.es-item__count')).toContainText('Item 1 of 2')
    const one = await ticket(page)
    await expect(block(page).locator('.es-ticket__foot')).toContainText(`seed ${one.seed.toString(16).toUpperCase().padStart(8, '0')}`)
    await expect(block(page).locator('.es-ticket__foot')).toContainText('unseen')
    await fill(page, 'right', 'sure')
    await check(page)
    await expect(block(page).getByRole('heading', { name: 'Right.' })).toBeFocused()

    // The ticket prints the day the idea comes back: the model's, for a Good first review followed by an Easy one.
    const today = dayOffset(0)
    const card = deriveCards(events, appKcsOfRef, today).cards.get(first)
    await expect(block(page).locator('.es-prep__back')).toContainText(formatDay(returnDay(card, today, 4)))
    await stub(page, /Next ticket/).click()

    // Ticket 2: a line to tick, and a wrong answer, said with a guess.
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await expect(block(page)).toHaveAttribute('data-kc', second)
    await expect(block(page).locator('h3.es-item__count')).toContainText('Item 2 of 2')
    await expect(block(page).locator('h3.es-item__count')).toBeFocused()
    const two = await fill(page, 'wrong', 'guess')
    expect(two.kind).toBe('choice')
    await check(page)
    await expect(block(page).getByRole('heading', { name: 'Not this one.' })).toBeFocused()
    await stub(page, /Finish the prep/).click()

    // The close: the tally, what became of each idea, the printer's counts, and when the list is pinned up again.
    await expect(phase(page, 'done')).toBeVisible()
    await expect(page.getByRole('heading', { name: '1 of 2 right' })).toBeFocused()
    const done = page.locator('.es-prep__ticket[data-state="done"]')
    await expect(done.locator('.es-prep__line')).toHaveCount(2)
    await expect(done.locator('.es-prep__line[data-line="done"][data-ok="true"]')).toHaveCount(1)
    await expect(done.locator('.es-prep__line[data-line="done"][data-ok="false"]')).toHaveCount(1)
    await expect(done.locator('.es-prep__return')).toHaveCount(2)
    await expect(page.getByRole('figure', { name: 'The prep, printed' })).toContainText('tickets')
    await expect(page.locator('.es-prep__next')).toContainText('Your next prep is')
    await expect(stub(page, 'Review ahead')).toBeVisible()

    // The ledger holds one review for each ticket, with the model's grade, the seed that was drawn, the tap, and no key.
    const reviews = await ledgerHolds(page, 2)
    expect(reviews.map((event) => [event.ref, event.ok, event.provenance, event.data.grade, event.conf])).toEqual([
      [`review:${first}`, true, 'unseen', 4, 'sure'],
      [`review:${second}`, false, 'unseen', 1, 'guess'],
    ])
    expect(reviews[0].seed).toBe(one.seed)
    expect(reviews[1].seed).toBe(two.seed)
    expect(reviews[0].rev).toBe(one.item.rev)
    for (const event of reviews) {
      const text = JSON.stringify(event)
      expect(text).not.toContain('truth')
      expect(text).not.toContain('"why"')
      expect(Object.keys(event.data)).toEqual(['grade'])
    }
  })

  test('draws fresh seeds for every ticket: a review ahead after a prep asks the same ideas on other numbers, none the learner met', async ({ page }) => {
    test.setTimeout(120_000)
    await visit(page, earned({ bubble: 6, overlap: 5 }))
    const seeds: number[] = []
    const prep = async (): Promise<void> => {
      for (let at = 0; at < 2; at += 1) {
        await expect(block(page)).toHaveAttribute('data-phase', 'asking')
        const current = await fill(page, 'right')
        seeds.push(current.seed)
        await check(page)
        await stub(page, at === 0 ? /Next ticket/ : /Finish the prep/).click()
      }
      await expect(phase(page, 'done')).toBeVisible()
    }
    await start(page).click()
    await prep()
    await stub(page, 'Review ahead').click()
    await expect(page.locator('.es-prep__list')).toHaveAttribute('data-mode', 'ahead')
    await prep()
    expect(new Set(seeds).size, `four tickets, four seeds: ${seeds.join(', ')}`).toBe(4)
    expect((await ledgerHolds(page, 4)).map((event) => event.seed).sort()).toEqual([...seeds].sort())
  })

  test('is resumed by reading the ledger again: after one ticket is checked, a reload holds only what is left', async ({ page }) => {
    test.setTimeout(120_000)
    const events = earned({ bubble: 6, overlap: 5 })
    const [first, second] = order(events)
    await visit(page, events)
    await start(page).click()
    await expect(block(page)).toHaveAttribute('data-kc', first)
    await fill(page, 'right')
    await check(page)
    await ledgerHolds(page, 1)
    await page.reload()
    await expect(phase(page, 'list')).toBeVisible()
    const lines = page.locator('.es-prep__list .es-prep__line')
    await expect(lines).toHaveCount(1)
    await expect(lines.first()).toContainText(second)
  })

  test('a number is asked for when a word is written, and a line when none is ticked, and nothing is written to the ledger by a refusal', async ({ page }) => {
    const events = earned({ bubble: 6, overlap: 5 })
    const [first] = order(events)
    await visit(page, events)
    await queue(page, [entropyFor(events, first, 'numeric')])
    await start(page).click()
    await expect(block(page)).toHaveAttribute('data-kind', 'numeric')
    await field(page).fill('plenty')
    await stub(page, /Check the ticket/).click()
    await expect(block(page).locator('.es-field__error')).toContainText('Write a number')
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    expect(await ledger(page)).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Keyboard, motion and axe                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('the keyboard, at 360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('completes a prep from the top of the page with Tab, Enter, Space and the arrow keys, a focus ring at every stop and nothing covering it', async ({ page }) => {
    test.setTimeout(120_000)
    const events = earned({ bubble: 6, overlap: 5 })
    const [first, second] = order(events)
    await visit(page, events)
    await queue(page, [entropyFor(events, first, 'numeric'), entropyFor(events, second, 'choice')])
    const walk = walkOf(page)

    // The way in: the skip link first, and it works. Then Tab reaches the stub that starts the prep, and Enter pulls it.
    expect((await walk.press('Tab')).name).toBe('Skip to main content')
    expect((await walk.press('Enter')).tag).toBe('main')
    await walk.tabTo('Start the prep', 12)
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await expect(block(page).locator('h3.es-item__count')).toBeFocused()

    // Ticket 1, a number: the slip is next, Enter checks it, and the verdict takes focus.
    const one = await ticket(page)
    if (one.item.answer.kind !== 'numeric') throw new Error('a numeric item')
    await walk.press('Tab')
    await expect(field(page)).toBeFocused()
    // A field draws its ring on its slip, which holds focus (`:focus-within`), and the walk reads the focused control and what is inside it.
    await expect(field(page).locator('xpath=ancestor::span[contains(@class, "es-field__slip")]')).toHaveCSS('outline-style', 'solid')
    await expect(field(page).locator('xpath=ancestor::span[contains(@class, "es-field__slip")]')).toHaveCSS('outline-width', '2px')
    await page.keyboard.type(String(one.item.answer.truth))
    await tabToButton(page, walk, 'sure')
    await page.keyboard.press('Space')
    await expect(stub(page, 'sure')).toHaveAttribute('aria-pressed', 'true')
    await tabToButton(page, walk, /Check the ticket/)
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'revealed')
    await expect(block(page).getByRole('heading', { name: 'Right.' })).toBeFocused()
    await tabToButton(page, walk, /Next ticket/)
    await page.keyboard.press('Enter')

    // Ticket 2, a choice: the radios are one group and the arrow keys move through it.
    await expect(block(page)).toHaveAttribute('data-phase', 'asking')
    await expect(block(page).locator('h3.es-item__count')).toBeFocused()
    const two = await ticket(page)
    if (two.item.answer.kind !== 'choice') throw new Error('a choice item')
    const wanted = two.item.answer.options.find((option) => two.item.answer.kind === 'choice' && option.id === two.item.answer.correct)
    if (wanted === undefined) throw new Error('a key')
    const radio = block(page).getByRole('radio', { name: plain(wanted.text) })
    await walk.press('Tab')
    for (let presses = 0; presses < 5 && !(await radio.isChecked()); presses += 1) await walk.press('ArrowDown')
    await expect(radio).toBeChecked()
    await tabToButton(page, walk, /Check the ticket/)
    await page.keyboard.press('Enter')
    await expect(block(page)).toHaveAttribute('data-phase', 'revealed')
    await tabToButton(page, walk, /Finish the prep/)
    await page.keyboard.press('Enter')

    // The close: its headline takes focus, and the way on is one Tab away.
    await expect(page.getByRole('heading', { name: '2 of 2 right' })).toBeFocused()
    await walk.tabTo('Review ahead', 12)
    await ledgerHolds(page, 2)
    // The slip's ring was read above, so the field's own stop is left out of the walk's count.
    expect(
      walk.problems().filter((problem) => problem !== ' (input) draws no focus ring'),
      'a focus stop that a keyboard user cannot see',
    ).toEqual([])
  })
})

/** Presses Tab until a button named like `name` has focus, keeping every stop in the walk. */
async function tabToButton(page: Page, walk: ReturnType<typeof walkOf>, name: string | RegExp): Promise<void> {
  const matches = (focus: string) => (typeof name === 'string' ? focus === name : name.test(focus))
  for (let presses = 0; presses < 40; presses += 1) {
    const focus = await walk.press('Tab')
    if (matches(focus.name)) return
  }
  throw new Error(`Tab never reached "${String(name)}" in 40 presses`)
}

test.describe('motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('under reduced motion the reveal is there at once: it has no feed', async ({ page }) => {
    await visit(page, earned({ bubble: 6, overlap: 5 }))
    await start(page).click()
    await fill(page, 'right')
    await stub(page, /Check the ticket/).click()
    const reveal = block(page).locator('.es-item__reveal')
    await expect(reveal).toBeVisible()
    const motion = await reveal.evaluate((element) => ({
      name: getComputedStyle(element).animationName,
      clip: getComputedStyle(element).clipPath,
      running: document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === 'es-item-feed').length,
    }))
    expect(motion).toEqual({ name: 'none', clip: 'none', running: 0 })
  })
})

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

for (const width of [360, 1280]) {
  test.describe(`axe and reflow at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    /** Axe over the whole page: a serious or critical finding fails, and so does any in the heading rules. */
    async function audit(page: Page, label: string): Promise<void> {
      await quiet(page, 300)
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
      const rules = results.passes.length + results.violations.length
      expect(rules, `${label}: the rules that axe ran`).toBeGreaterThan(20)
      const summary = results.violations.map((violation) => `${violation.id} [${violation.impact}]: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`)
      expect(summary.filter((line) => /\[(serious|critical)\]/.test(line)), `${label}: serious or critical`).toEqual([])
      expect(results.violations.filter((violation) => ['heading-order', 'empty-heading', 'page-has-heading-one'].includes(violation.id)).map((violation) => violation.id), `${label}: headings`).toEqual([])
      console.log(`axe ${label} at ${width} px: ${rules} rules, ${summary.length === 0 ? 'no violation' : summary.join(' | ')}`)
      if (width <= 360) {
        const found = await clipped(page)
        expect(found.scrolls, `${label}: pixels the page scrolls sideways`).toBeLessThanOrEqual(0)
        expect(found.text, `${label}: text past the right edge`).toEqual([])
      }
    }

    test('finds no serious or critical violation in any state of the page, the headings stay an outline, and nothing scrolls sideways at a phone\'s width', async ({ page }) => {
      test.setTimeout(240_000)
      // The empty page, and the rest, each on a ledger of its own.
      await visit(page, [])
      await audit(page, 'nothing earned yet')
      await visit(page, earned({ bubble: 0, overlap: 0 }))
      await audit(page, 'a rest')
      await visit(page, earned({ bubble: 20, overlap: 20 }))
      await audit(page, 'a welcome-back list')

      // The list, and a prep through every state of its ticket.
      const events = earned({ bubble: 6, overlap: 5 })
      const [first, second] = order(events)
      await visit(page, events)
      await queue(page, [entropyFor(events, first, 'numeric'), entropyFor(events, second, 'choice')])
      await audit(page, 'the prep list')
      await start(page).click()
      await expect(block(page)).toHaveAttribute('data-phase', 'asking')
      await audit(page, 'asking, a number')
      await stub(page, /Check the ticket/).click()
      await audit(page, 'asking, a word where a number belongs')
      await fill(page, 'wrong', 'sure')
      await check(page)
      await audit(page, 'checked, wrong, a number')
      await stub(page, /Next ticket/).click()
      await expect(block(page)).toHaveAttribute('data-phase', 'asking')
      await audit(page, 'asking, a choice')
      await stub(page, /Check the ticket/).click()
      await audit(page, 'asking, a choice with no tick')
      await fill(page, 'right', 'think')
      await check(page)
      await audit(page, 'checked, right, a choice')
      await stub(page, /Finish the prep/).click()
      await expect(phase(page, 'done')).toBeVisible()
      await audit(page, 'the close of a prep')
      await stub(page, 'Review ahead').click()
      await expect(block(page)).toHaveAttribute('data-phase', 'asking')
      await audit(page, 'a review ahead')
    })
  })
}
