/*
 * The Inspection (`broken-bench`) in a browser: the walks that `verify:games` lists for every game and cannot run itself (A§6.2, A§6.8,
 * A§6.9, GAMES.md §2.5), and W1-T33's first two acceptance checks: "the game can be completed by keyboard" and "runs are graded on fresh
 * seeds".
 *
 *   1. A keyboard-only walk files a ruling on every level and reaches its debrief: Tab to the checklist, the arrow keys choose the flaw,
 *      digits write the p99 and its range, Enter files, and focus moves on (to the next case of the court, and at the end to the way into
 *      the debrief). The court is five cases, filed one after the other.
 *   2. The game's keys: `T` moves the stopwatch between the send and the due time, `J` and `K` select an order, `[` and `]` turn the
 *      sheets, `?` lists the keys and Escape gives focus back. The tape is a listbox with the arrow keys, Home, End and the page keys, and
 *      a tap on an order's slip selects the order.
 *   3. A graded attempt is dealt a fresh seed, drawn on the page when the attempt starts. The spec queues the seeds that the page's
 *      `crypto.getRandomValues` hands out, so that it knows which case it is shown, and checks that the claim on the clipboard is that
 *      seed's, that a second attempt is dealt another seed, and that the practice seed is never the graded one. A graded attempt hides what
 *      a practice one shows (the desk's p99 and the undo) and is still won from the numbers the page prints: the tail, counted down to
 *      the p99's rank.
 *   4. Reduced motion: nothing animates, and the game plays.
 *   5. Nothing leaves the origin (ARCHITECTURE §1, I1).
 *   6. The same seed and the same actions give the same state hash in the browser as under Node (A§5.10).
 *   7. axe finds no serious or critical violation on the game's pages at 360 and 1280 px, and nothing is cut off at the right edge at 320
 *      (WCAG 1.4.10).
 *
 * How it runs. The spec starts the app's own Vite dev server on a free port, so it needs no build and no preview server, and drives
 * `/play/broken-bench` in whichever browser Playwright launches. With ES_E2E_ORIGIN set to the address of a server that is already running
 * (`vite preview` after `npm run build`, or a dev server), it drives that instead, and the determinism check runs only where the server
 * serves the sources. Run it with `npx playwright test e2e/broken-bench.spec.ts`.
 */
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import { applyAction, drawInBand, startRun, stateHash } from '../packages/play'
import { caseOf } from '../packages/play/broken-bench/cases'
import { FLAW_FACTS } from '../packages/play/broken-bench/flaws'
import { orderNo } from '../packages/play/broken-bench/layout'
import { buildLevel } from '../packages/play/broken-bench/levels'
import { benchSession } from '../packages/play/broken-bench/session'
import type { BenchAction, BenchLevelId, CaseSlot, Flaw } from '../packages/play/broken-bench/types'
import { BENCH_FLAWS } from '../packages/sim/bench/broken-types'
import { clipped } from './support/site'

const root = new URL('..', import.meta.url).pathname

let server: ViteDevServer | null = null
let origin = ''
/** Whether the origin is a server that someone else started, which may be a built site. */
const outside = (process.env.ES_E2E_ORIGIN ?? '') !== ''
/** Whether the origin serves the repository's sources (a dev server), which the determinism check imports. */
let sources = false

base.beforeAll(async () => {
  if (outside) {
    origin = (process.env.ES_E2E_ORIGIN ?? '').replace(/\/$/, '')
    const probe = await fetch(`${origin}/packages/play/index.ts`).catch(() => null)
    sources = probe !== null && probe.ok && /javascript|typescript/.test(probe.headers.get('content-type') ?? '')
    return
  }
  server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', strictPort: false } })
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  if (url === undefined) throw new Error('the dev server has no address')
  origin = url.replace(/\/$/, '')
  sources = true
}, 120_000)

base.afterAll(async () => {
  await server?.close()
})

const test = base

const game = (page: Page) => page.locator('section[data-game="broken-bench"]')
const live = (page: Page) => page.locator('[data-live="line"]')
const outcome = (page: Page) => page.locator('[data-live="outcome"]')
const verdict = (page: Page) => page.locator('[data-bench-debrief] h3').first()
const selectedOrder = (page: Page) => page.locator('.es-bench-order')
/** What a reader would call the focused control: its aria-label, its label, or its text. */
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null
    if (element === null) return ''
    const named = element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? element.tagName
    return named.trim().replace(/\s+/g, ' ')
  })

async function open(page: Page, level: string) {
  await page.goto(`${origin}/play/broken-bench?level=${level}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
}

/** Presses Tab until the focused control is named like `name`, and fails after `limit` presses. */
async function tabTo(page: Page, name: RegExp, limit = 60) {
  const seen: string[] = []
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab')
    const now = await activeName(page)
    if (name.test(now)) return
    seen.push(now)
  }
  throw new Error(`Tab never reached a control named ${name}; it went through ${seen.join(' > ')}`)
}

interface Answer {
  flaw: Flaw
  p99Us: number
  loUs: number
  hiUs: number
}

/** What a learner who has done the court's own arithmetic files: the true flaw, the recomputed p99 and the court's interval. */
function rightAnswer(slot: CaseSlot): Answer {
  const { c, truth } = caseOf(slot)
  return { flaw: c.flaw, p99Us: truth.correction.p99Us, loUs: truth.interval.loUs, hiUs: truth.interval.hiUs }
}

/** Milliseconds as a person types them. */
const ms = (us: number): string => String(us / 1000)

/** Names a flaw with the keyboard alone: Tab to the checklist, then the arrow keys, which move and choose. */
async function nameFlaw(page: Page, flaw: Flaw) {
  await tabTo(page, new RegExp(`^${FLAW_FACTS[BENCH_FLAWS[0]].term}`))
  const at = BENCH_FLAWS.indexOf(flaw)
  if (at === 0) await page.keyboard.press('Space')
  for (let press = 0; press < at; press++) await page.keyboard.press('ArrowDown')
  await expect.poll(() => activeName(page)).toContain(FLAW_FACTS[flaw].term)
  await expect(page.locator(`input[type="radio"][value="${flaw}"]`)).toBeChecked()
}

/** Writes the p99 and the range into the three fields with the keyboard, and files the ruling with Enter from the last of them. */
async function writeAndFile(page: Page, written: { p99: string; lo: string; hi: string }) {
  await tabTo(page, /^Your p99 \(ms\)$/, 4)
  await page.keyboard.type(written.p99)
  await page.keyboard.press('Tab')
  expect(await activeName(page)).toBe('Range from (ms)')
  await page.keyboard.type(written.lo)
  await page.keyboard.press('Tab')
  expect(await activeName(page)).toBe('to (ms)')
  await page.keyboard.type(written.hi)
  await page.keyboard.press('Enter')
}

/** A whole filing, by the keyboard alone. */
async function fileRuling(page: Page, a: Answer) {
  await nameFlaw(page, a.flaw)
  await writeAndFile(page, { p99: ms(a.p99Us), lo: ms(a.loUs), hi: ms(a.hiUs) })
}

async function endWithTheDebrief(page: Page, title: string) {
  // Focus has moved on its own to the way into the debrief, which is one key away.
  await expect.poll(() => activeName(page)).toBe('See the debrief')
  await page.keyboard.press('Enter')
  await expect(verdict(page)).toHaveText(title)
}

/** The seeds that the page's next graded attempts will draw: only a draw of one 32-bit number is answered, and any other use of the generator is left alone. */
async function queueSeeds(page: Page, seeds: readonly number[]) {
  await page.evaluate((queued) => {
    const w = window as unknown as { __benchSeeds?: number[] }
    w.__benchSeeds = [...(w.__benchSeeds ?? []), ...queued]
  }, seeds)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __benchSeeds?: number[] }
    const original = crypto.getRandomValues.bind(crypto)
    crypto.getRandomValues = ((array: ArrayBufferView) => {
      const next = w.__benchSeeds?.[0]
      if (array instanceof Uint32Array && array.length === 1 && next !== undefined) {
        w.__benchSeeds?.shift()
        array[0] = next
        return array
      }
      return original(array as Uint8Array)
    }) as typeof crypto.getRandomValues
  })
})

/** The claim on the clipboard, in milliseconds: the report's p99, which is the case's own. */
const claimMs = async (page: Page) => Number(await page.locator('[data-bench-board] [data-bench-clip] data').first().getAttribute('value'))

test.describe('a keyboard-only walk files a ruling on every level', () => {
  for (const level of ['due', 'warm', 'sure'] as const) {
    test(`\`${level}\`: Tab to the checklist, the arrow keys to name the flaw, digits, Enter to file, and the debrief`, async ({ page }) => {
      const slot = buildLevel(level, 0).slots[0]
      await open(page, level)
      await fileRuling(page, rightAnswer(slot))
      await expect(live(page)).toContainText('The last ruling is filed.')
      await expect(outcome(page)).toHaveText('The run is over. The debrief is ready.')
      await endWithTheDebrief(page, 'The ruling stands.')
      await expect(page.locator('[data-ruling] [data-line="flaw"]')).toContainText(`You named ${FLAW_FACTS[slot.flaw].phrase}`)
      await expect(page.getByText('The rule, and the arithmetic')).toBeVisible()
    })
  }

  test('`court`: five cases, each filed from the keyboard, with focus on the next case each time, and the docket at the end', async ({ page }) => {
    const slots = buildLevel('court', 0).slots
    await open(page, 'court')
    for (const [at, slot] of slots.entries()) {
      if (at > 0) await expect.poll(() => activeName(page)).toBe(`The court, case ${at + 1} of 5`)
      await fileRuling(page, rightAnswer(slot))
      if (at < slots.length - 1) await expect(live(page)).toContainText(`Case ${at + 1} of 5 filed.`)
    }
    await expect(live(page)).toContainText('The last ruling is filed.')
    await endWithTheDebrief(page, 'The court is satisfied.')
    await expect(page.getByRole('region', { name: 'The docket' })).toBeVisible()
    await expect(page.locator('[data-ruling]')).toHaveCount(5)
  })

  test('a ruling with the wrong flaw falls, the debrief says which part was wrong, and the way on is still the keyboard\'s', async ({ page }) => {
    const slot = buildLevel('due', 0).slots[0]
    const right = rightAnswer(slot)
    await open(page, 'due')
    await fileRuling(page, { ...right, flaw: BENCH_FLAWS[(BENCH_FLAWS.indexOf(right.flaw) + 5) % BENCH_FLAWS.length] })
    await endWithTheDebrief(page, 'The ruling falls.')
    await expect(page.locator('[data-ruling] [data-line="flaw"] [data-ok="false"]')).toHaveCount(1)
    await expect(page.locator('[data-ruling] [data-line="number"] [data-ok="true"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Next: The warm-up cut' }).focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('broken-bench')
    await expect(page.locator('[data-game="broken-bench"] .es-tape').first()).toContainText('The warm-up cut · practice')
  })

  test('the ruling is not filed until a flaw is named and a p99 with a range that holds it is written, and Enter in a field does nothing before that', async ({ page }) => {
    await open(page, 'due')
    const file = page.getByRole('button', { name: 'File the ruling' })
    await expect(file).toBeDisabled()
    await expect(page.getByText('To file it: name a flaw, and write a p99 and a range that holds it.')).toBeVisible()
    // A range that does not hold the p99 is said so, in the field it is wrong in, and Enter files nothing.
    await page.getByLabel('Your p99 (ms)').fill('100')
    await page.getByLabel('Range from (ms)').fill('200')
    await page.getByLabel('to (ms)').fill('300')
    await expect(page.getByText('the range must hold the p99 itself')).toBeVisible()
    await page.getByLabel('to (ms)').press('Enter')
    await expect(outcome(page)).toHaveText('')
    await page.locator('label[data-flaw="none"]').click()
    await expect(file).toBeDisabled()
    await expect(page.getByText('To file it: write a p99 and a range that holds it.')).toBeVisible()
    await page.getByLabel('Range from (ms)').fill('50')
    await expect(page.getByText('the range must hold the p99 itself')).toHaveCount(0)
    await expect(file).toBeEnabled()
    await expect(page.getByText('To file it:')).toHaveCount(0)
  })
})

test.describe('the keys of the game', () => {
  test('`T` moves the stopwatch between the send and the due time, and the tail follows it', async ({ page }) => {
    const slot = buildLevel('due', 0).slots[0]
    const { scene } = caseOf(slot)
    await open(page, 'due')
    const timer = page.getByRole('switch', { name: /Time each order from when it was due/ })
    expect(scene.claim.timerStartsAt).toBe('send')
    await expect(timer).not.toBeChecked()
    await expect(page.locator('[data-mirror-summary]')).toContainText('timed from the send')
    await game(page).focus()
    await page.keyboard.press('KeyT')
    await expect(live(page)).toContainText('Stopwatch starts at the due time.')
    await expect(timer).toBeChecked()
    await expect(page.locator('[data-mirror-summary]')).toContainText('timed from the due time')
    await page.keyboard.press('KeyT')
    await expect(live(page)).toContainText('Stopwatch starts at the send.')
    await expect(timer).not.toBeChecked()
  })

  test('`J` and `K` select the next and the previous order, and the ticket under the sheet reads its four times', async ({ page }) => {
    const { scene } = caseOf(buildLevel('due', 0).slots[0])
    await open(page, 'due')
    await expect(selectedOrder(page)).toContainText('Select an order')
    await game(page).focus()
    await page.keyboard.press('KeyJ')
    await expect(selectedOrder(page)).toContainText(`Order ${orderNo(scene.harnessCut)}`)
    await page.keyboard.press('KeyJ')
    await expect(selectedOrder(page)).toContainText(`Order ${orderNo(scene.harnessCut + 1)}`)
    await page.keyboard.press('KeyK')
    await expect(selectedOrder(page)).toContainText(`Order ${orderNo(scene.harnessCut)}`)
    for (const term of ['Due', 'Sent', 'First token', 'Done']) await expect(selectedOrder(page).getByText(term, { exact: true })).toBeVisible()
  })

  test('`]` and `[` turn the sheets, which all draw the order that is selected', async ({ page }) => {
    await open(page, 'due')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'histogram')
    await game(page).focus()
    await page.keyboard.press('BracketRight')
    await expect(live(page)).toContainText('Rows sheet.')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'rows')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('BracketRight')
    await expect(live(page)).toContainText('Timeline sheet.')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'timeline')
    await page.keyboard.press('BracketRight')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'histogram')
    await page.keyboard.press('BracketLeft')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'timeline')
    // The sheets are buttons as well, for a pointer and for a screen reader.
    await page.getByRole('button', { name: 'Rows', exact: true }).click()
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'rows')
    await expect(page.getByRole('button', { name: 'Rows', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('`?` lists the keys, with the game\'s own after the common ones, and Escape gives focus back', async ({ page }) => {
    await open(page, 'due')
    await game(page).focus()
    await page.keyboard.press('Shift+Slash')
    const keys = page.getByRole('dialog')
    await expect(keys).toBeVisible()
    await expect(keys.locator('kbd')).toHaveText(['Space', '.', ',', '[', ']', 'C', 'V', '?', 'T', 'J', 'K'])
    await page.keyboard.press('Escape')
    await expect(keys).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-game'))).toBe('broken-bench')
  })

  test('the tape is a listbox: the arrow keys, Page Up and Down, Home and End move the selected order, and a tap on a line selects it', async ({ page }) => {
    const { scene } = caseOf(buildLevel('due', 0).slots[0])
    const last = scene.rows.length - 1
    await open(page, 'due')
    await page.getByRole('button', { name: 'Rows', exact: true }).click()
    const tape = page.getByRole('listbox')
    const chosen = () => page.locator('[role="option"][aria-selected="true"]')
    await tape.locator('[role="option"]').first().focus()
    await page.keyboard.press('Home')
    await expect(chosen()).toHaveAttribute('data-order', String(scene.harnessCut))
    await page.keyboard.press('ArrowDown')
    await expect(chosen()).toHaveAttribute('data-order', String(scene.harnessCut + 1))
    await page.keyboard.press('PageDown')
    await expect(chosen()).toHaveAttribute('data-order', String(scene.harnessCut + 11))
    await page.keyboard.press('PageUp')
    await page.keyboard.press('ArrowUp')
    await expect(chosen()).toHaveAttribute('data-order', String(scene.harnessCut))
    await page.keyboard.press('End')
    await expect(chosen()).toHaveAttribute('data-order', String(last))
    // Focus follows the selection, so that a screen reader reads the order it rests on.
    expect(await activeName(page)).toContain(`Order ${orderNo(last)}`)
    await page.locator(`[role="option"][data-order="${last - 3}"]`).click()
    await expect(chosen()).toHaveAttribute('data-order', String(last - 3))
    await expect(selectedOrder(page)).toContainText(`Order ${orderNo(last - 3)}`)
  })

  test('a tap on an order\'s slip on the timeline selects it, and the sheet follows it', async ({ page }) => {
    const { scene } = caseOf(buildLevel('due', 0).slots[0])
    await open(page, 'due')
    await game(page).focus()
    await page.keyboard.press('KeyJ')
    await page.getByRole('button', { name: 'Timeline', exact: true }).click()
    const target = scene.harnessCut + 3
    await page.locator(`rect[data-row="${target}"]`).click()
    await expect(selectedOrder(page)).toContainText(`Order ${orderNo(target)}`)
    // The slips are a picture and the tape is how a keyboard reads: both draw the same order.
    await page.getByRole('button', { name: 'Rows', exact: true }).click()
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveAttribute('data-order', String(target))
  })

  test('setting the cut to the course\'s rule reads the p99 that the court recomputes, off the summary of the tail', async ({ page }) => {
    // The warm-up level: a harness that counted its warm-up. The desk's cut is the lesson, and the reading is the court's number.
    const slot = buildLevel('warm', 0).slots[0]
    const { scene, truth } = caseOf(slot)
    expect(slot.flaw).toBe('warm-up-counted')
    await open(page, 'warm')
    expect(await claimMs(page)).toBeCloseTo(scene.claim.valueUs / 1000, 6)
    const read = async () => Number(/at ([\d,]+\.\d) ms\./.exec(await page.locator('[data-mirror-summary]').innerText())?.[1]?.replace(/,/g, ''))
    expect(Math.abs((await read()) - scene.claim.valueUs / 1000)).toBeLessThanOrEqual(0.05 + 1e-9)
    await page.getByLabel('Leave out the first').fill(String(Math.max(100, 2 * scene.server.maxNumSeqs)))
    await expect.poll(async () => Math.abs((await read()) - truth.correction.p99Us / 1000) <= 0.05 + 1e-9).toBe(true)
    await expect(page.locator('[data-mirror-summary]')).toContainText(`the first ${Math.max(100, 2 * scene.server.maxNumSeqs)} left out`)
  })
})

test.describe('a graded attempt', () => {
  test('is dealt the seed that the page draws when it starts, hides the desk\'s p99 and the undo, and the practice seed is never the graded one', async ({ page }) => {
    const practice = caseOf(buildLevel('due', 0).slots[0]).scene.claim.valueUs / 1000
    const seed = drawInBand(benchSession, 'due', 2_718_281_828)
    const dealt = buildLevel('due', seed).slots[0]
    const claim = caseOf(dealt).scene.claim.valueUs / 1000
    expect(claim).not.toBe(practice)
    await open(page, 'due')
    expect(await claimMs(page)).toBeCloseTo(practice, 6)
    await expect(page.getByText('At the desk')).toBeVisible()
    await expect(page.locator('[data-mirror] .es-tape', { hasText: 'p99' })).toHaveCount(1)
    await queueSeeds(page, [2_718_281_828])
    await page.getByRole('button', { name: 'Graded attempt, fresh seed' }).click()
    await expect(page.locator('[data-game="broken-bench"] .es-tape').first()).toContainText('From the due time · graded')
    expect(await claimMs(page)).toBeCloseTo(claim, 6)
    await expect(page.getByText('At the desk')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await expect(page.locator('[data-mirror-summary]')).toContainText("Count down from the slowest to the order at the p99's rank.")
    await expect(page.locator('[data-mirror-summary]')).not.toContainText('beyond it')
    await expect(page.locator('[data-mirror] .es-tape', { hasText: 'p99' })).toHaveCount(0)
  })

  test('is dealt another seed each time it is started, from the docket and from the debrief\'s "New numbers"', async ({ page }) => {
    const seeds = [123_456_789, 987_654_321, 55_555_555]
    const claims = seeds.map((seed) => caseOf(buildLevel('due', drawInBand(benchSession, 'due', seed)).slots[0]).scene.claim.valueUs / 1000)
    expect(new Set(claims).size).toBe(3)
    await open(page, 'due')
    await queueSeeds(page, seeds)
    await page.getByRole('button', { name: 'Graded attempt, fresh seed' }).click()
    expect(await claimMs(page)).toBeCloseTo(claims[0], 6)
    const first = buildLevel('due', drawInBand(benchSession, 'due', seeds[0])).slots[0]
    await fileRuling(page, rightAnswer(first))
    await endWithTheDebrief(page, 'The ruling stands.')
    await page.getByRole('button', { name: 'New numbers' }).click()
    await expect(page.locator('[data-bench-board]')).toBeVisible()
    expect(await claimMs(page)).toBeCloseTo(claims[1], 6)
    await page.getByRole('button', { name: 'Practice', exact: true }).click()
    await page.getByRole('button', { name: 'Graded attempt, fresh seed' }).click()
    expect(await claimMs(page)).toBeCloseTo(claims[2], 6)
  })

  test('is won from the numbers the page prints: the stopwatch at the due time, the tail counted down to the p99\'s rank, and a range around it', async ({ page }) => {
    // The seed is odd, so the level deals a client queue that the timer hid, which the log shows as a wait before the send.
    const seed = drawInBand(benchSession, 'due', 4_000_000_001)
    const dealt = buildLevel('due', seed).slots[0]
    await open(page, 'due')
    await queueSeeds(page, [4_000_000_001])
    await page.getByRole('button', { name: 'Graded attempt, fresh seed' }).click()
    expect(await claimMs(page)).toBeCloseTo(caseOf(dealt).scene.claim.valueUs / 1000, 6)
    await game(page).focus()
    await page.keyboard.press('KeyT')
    await expect(live(page)).toContainText('Stopwatch starts at the due time.')
    // How many orders the desk measured, and so which place from the slowest is the p99: ⌈0.99 n⌉ from the fastest.
    const summary = await page.locator('[data-mirror-summary]').innerText()
    const measured = Number(/Desk: ([\d,]+) orders measured/.exec(summary)?.[1]?.replace(/,/g, ''))
    expect(measured).toBeGreaterThanOrEqual(1000)
    const rank = measured - Math.ceil(0.99 * measured) + 1
    const row = page.locator('[data-mirror] tbody tr').filter({ has: page.locator('th button', { hasText: new RegExp(`^${rank}$`) }) })
    await expect(row).toHaveCount(1)
    const printed = Number((await row.locator('td[data-label="To first token"]').innerText()).replace(/[^\d.]/g, ''))
    expect(printed).toBeGreaterThan(0)
    // The tail prints a tenth of a millisecond: a range of a hundredth either side holds the court's number.
    const lo = (Math.floor(printed * 0.99 * 10) / 10).toFixed(1)
    const hi = (Math.ceil(printed * 1.01 * 10) / 10).toFixed(1)
    await nameFlaw(page, dealt.flaw)
    await writeAndFile(page, { p99: String(printed), lo, hi })
    await endWithTheDebrief(page, 'The ruling stands.')
    await expect(page.locator('[data-ruling] [data-line="number"] [data-ok="true"]')).toHaveCount(1)
    await expect(page.locator('[data-ruling] [data-line="range"] [data-ok="true"]')).toHaveCount(1)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, and the game plays to a verdict', async ({ page }) => {
    await open(page, 'sure')
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await game(page).focus()
    await page.keyboard.press('BracketRight')
    await page.keyboard.press('KeyJ')
    await page.keyboard.press('KeyT')
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0)
    await fileRuling(page, rightAnswer(buildLevel('sure', 0).slots[0]))
    await endWithTheDebrief(page, 'The ruling stands.')
  })
})

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played to its debrief and the stage after it is opened', async ({ page }) => {
    const away: string[] = []
    const refused: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) away.push(url)
    })
    // The browser says in its console that a policy refused a script, a style, a font or a request.
    page.on('console', (message) => {
      if (/content security policy|refused to/i.test(message.text())) refused.push(message.text())
    })
    await open(page, 'warm')
    await fileRuling(page, rightAnswer(buildLevel('warm', 0).slots[0]))
    await endWithTheDebrief(page, 'The ruling stands.')
    await page.getByRole('button', { name: 'In production' }).click()
    await expect(page.getByText('The flags that would have made it admissible')).toBeVisible()
    expect(away).toEqual([])
    expect(refused).toEqual([])
  })
})

test.describe('determinism', () => {
  const slots = buildLevel('court', 0).slots
  const actions: BenchAction[] = [
    { t: 'view', v: 'rows' },
    ...slots.flatMap((slot): BenchAction[] => {
      const a = rightAnswer(slot)
      return [{ t: 'flaw', flaw: a.flaw }, { t: 'predict', p99Us: a.p99Us, loUs: a.loUs, hiUs: a.hiUs }, { t: 'submit' }]
    }),
  ]

  test('the same seed and the same actions give the same state hash in the browser as under Node, a court of five cases included', async ({ page }) => {
    test.skip(!sources, 'the page imports the sources, which only a dev server serves')
    test.setTimeout(180_000)
    let run = startRun(benchSession, { game: 'broken-bench', level: 'court', seed: 0 })
    for (const action of actions) run = applyAction(benchSession, run, action)
    const expected = stateHash(run.state)
    await open(page, 'due')
    // The page imports the same modules from the dev server and runs the same actions. The script is a string, so that nothing in
    // Playwright's transform of this file touches the imports.
    const inBrowser = await page.evaluate(`(async () => {
      const play = await import('/packages/play/index.ts')
      const { benchSession } = await import('/packages/play/broken-bench/session.ts')
      let run = play.startRun(benchSession, { game: 'broken-bench', level: 'court', seed: 0 })
      for (const action of ${JSON.stringify(actions)}) run = play.applyAction(benchSession, run, action)
      return play.stateHash(run.state)
    })()`)
    expect(inBrowser).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{8}$/)
  })
})

test.describe('accessibility', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
  const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']
  const LEVELS: readonly BenchLevelId[] = ['due', 'warm', 'sure', 'court']

  /** The audit: serious and critical findings fail, and so do the heading rules, whatever their impact. */
  async function audit(page: Page, label: string) {
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
    const summary = (v: (typeof results.violations)[number]) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map(summary), `${label}: serious or critical violations`).toEqual([])
    expect(results.violations.filter((v) => HEADING_RULES.includes(v.id)).map(summary), `${label}: the heading outline`).toEqual([])
  }

  for (const width of [360, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 900 } })

      test('every level\'s page, each sheet, a graded attempt, a case filed and a debrief, pass axe', async ({ page }) => {
        test.setTimeout(240_000)
        for (const level of LEVELS) {
          await open(page, level)
          await audit(page, `${level} at ${width} px`)
        }
        await open(page, 'due')
        await game(page).focus()
        await page.keyboard.press('KeyJ')
        for (const sheet of ['Rows', 'Timeline', 'Histogram']) {
          await page.getByRole('button', { name: sheet, exact: true }).click()
          await audit(page, `due, ${sheet} sheet, at ${width} px`)
        }
        await page.keyboard.press('KeyT')
        await audit(page, `due, stopwatch at the due time, at ${width} px`)
        await queueSeeds(page, [31_415_926])
        await page.getByRole('button', { name: 'Graded attempt, fresh seed' }).click()
        await audit(page, `due, graded, at ${width} px`)
        await open(page, 'court')
        await fileRuling(page, rightAnswer(buildLevel('court', 0).slots[0]))
        await expect.poll(() => activeName(page)).toBe('The court, case 2 of 5')
        await audit(page, `court, second case, at ${width} px`)
        await open(page, 'sure')
        await fileRuling(page, rightAnswer(buildLevel('sure', 0).slots[0]))
        await endWithTheDebrief(page, 'The ruling stands.')
        await audit(page, `sure, debrief, at ${width} px`)
        await page.getByRole('button', { name: 'In production' }).click()
        await audit(page, `sure, in production, at ${width} px`)
      })
    })
  }

  test.describe('at 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('no word is cut off at the right edge and the page needs no sideways scroll, on any level or sheet (WCAG 1.4.10)', async ({ page }) => {
      test.setTimeout(180_000)
      for (const level of LEVELS) {
        await open(page, level)
        for (const sheet of ['Rows', 'Timeline', 'Histogram']) {
          await page.getByRole('button', { name: sheet, exact: true }).click()
          const found = await clipped(page, '[data-game="broken-bench"]')
          expect(found.text, `${level}, ${sheet}: words past the right edge`).toEqual([])
          expect(found.scrolls, `${level}, ${sheet}: sideways scroll`).toBeLessThanOrEqual(0)
        }
      }
      await open(page, 'court')
      await fileRuling(page, rightAnswer(buildLevel('court', 0).slots[0]))
      const found = await clipped(page, '[data-game="broken-bench"]')
      expect(found.text, 'the court, second case: words past the right edge').toEqual([])
      await open(page, 'due')
      await fileRuling(page, rightAnswer(buildLevel('due', 0).slots[0]))
      await endWithTheDebrief(page, 'The ruling stands.')
      const debrief = await clipped(page, '[data-bench-debrief]')
      expect(debrief.text, 'the debrief, past the right edge').toEqual([])
      expect(debrief.scrolls, 'the debrief, sideways scroll').toBeLessThanOrEqual(0)
    })
  })
})
