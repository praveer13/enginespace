/*
 * Broken benchmark (`broken-bench`) in a browser, in the instrument frame (REDESIGN §2.6, §3.5; R-T31): the walks that `verify:games` lists
 * for every game and cannot run itself (A§6.2, A§6.8, A§6.9, GAMES.md §2.5), and the acceptance list of R-T31.
 *
 *   1. A keyboard-only walk files a report on every level and reaches its result: the first run's Next through the parts and the switch,
 *      the arrow keys choose the flaw, digits write the p99 and its range, Enter files, and focus moves on (to the next report of the
 *      court, and at the end to the verdict). The court is five reports, filed one after the other.
 *   2. The switch and the report form stand beside the chart, inside the first screen with it at 1440 x 900; the range rule is printed
 *      above the form before anything is filed; at 390 x 844 the claim, the switch, the form and the readout share the screen.
 *   3. The first run is the parts, then a flip of the switch (a view change that files nothing: Undo stays dead), then the form with its
 *      range rule. The p99 moving once latency counts from the due time is named once, as coordinated omission.
 *   4. The game's keys: `T` moves the clock between the send time and the due time, `J` and `K` select a request, `[` and `]` turn the
 *      sheets. The log is a listbox with the arrow keys, Home, End and the page keys.
 *   5. A graded attempt is dealt a fresh seed, drawn on the page when it starts; it hides the p99 at the switch and the undo.
 *   6. The result: the verdict word from the grade, the corrected run drawn in the diagram, and the court's docket.
 *   7. No banned word on any level, at the start and at the result. Reduced motion. Nothing leaves the origin. The same seed and the
 *      same actions give the same state hash in the browser as under Node. axe finds no serious or critical violation.
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
import { TAIL_ROWS } from '../packages/play/broken-bench/desk'
import { COORDINATED_OMISSION } from '../packages/play/broken-bench/copy'
import { FLAW_FACTS } from '../packages/play/broken-bench/flaws'
import { buildLevel } from '../packages/play/broken-bench/levels'
import { benchSession } from '../packages/play/broken-bench/session'
import type { BenchAction, BenchLevelId, CaseSlot, Flaw } from '../packages/play/broken-bench/types'
import { BENCH_FLAWS } from '../packages/sim/bench/broken-types'
import { findBanned } from '../src/copy/banned'
import { clipped } from './support/site'
import { walkOf } from './support/front'
import { benchLevelWalk } from './support/walks'

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
const verdict = (page: Page) => page.locator('[data-result] [data-result-heading]')
const clockSwitch = (page: Page) => page.getByRole('switch', { name: 'Latency from the due time' })
const measured = (page: Page) => page.locator('[data-readout-id="measured"] dd')
const PARTS = ['claim', 'histogram', 'timeline', 'switch', 'form']

/** What a reader would call the focused control: its aria-label, its label, or its text. */
const activeName = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as (HTMLElement & { labels?: NodeListOf<HTMLLabelElement> }) | null
    if (element === null) return ''
    const named = element.getAttribute('aria-label') ?? element.labels?.[0]?.textContent ?? element.textContent ?? element.tagName
    return named.trim().replace(/\s+/g, ' ')
  })

/**
 * Opens a level. `intro: 'met'` (the default) seeds the intro flag with every part, as a learner who has met them has, so the walks that test
 * something else are not in the first run's way; `'fresh'` leaves it empty.
 */
async function open(page: Page, level: string, { intro = 'met' }: { intro?: 'met' | 'fresh' } = {}) {
  if (intro === 'met') await page.addInitScript((parts) => localStorage.setItem('es:intro', JSON.stringify({ 'broken-bench': parts })), PARTS)
  await page.goto(`${origin}/play/broken-bench?level=${level}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
}

/** Reopens on the same page, with the flag as it now stands. */
async function reopen(page: Page, level: string) {
  await page.goto(`${origin}/play/broken-bench?level=${level}`, { waitUntil: 'networkidle' })
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

/** What a learner who has done the reference's own arithmetic files: the true flaw, the recomputed p99 and the reference's interval. */
function rightAnswer(slot: CaseSlot): Answer {
  const { c, truth } = caseOf(slot)
  return { flaw: c.flaw, p99Us: truth.correction.p99Us, loUs: truth.interval.loUs, hiUs: truth.interval.hiUs }
}

/** Milliseconds as a person types them. */
const ms = (us: number): string => String(us / 1000)

/** Names a flaw with the keyboard alone: Tab to the list, then the arrow keys, which move and choose. */
async function nameFlaw(page: Page, flaw: Flaw) {
  await tabTo(page, new RegExp(`^${FLAW_FACTS[BENCH_FLAWS[0]].term}`))
  const at = BENCH_FLAWS.indexOf(flaw)
  if (at === 0) await page.keyboard.press('Space')
  for (let press = 0; press < at; press++) await page.keyboard.press('ArrowDown')
  await expect.poll(() => activeName(page)).toContain(FLAW_FACTS[flaw].term)
  await expect(page.locator(`input[type="radio"][value="${flaw}"]`)).toBeChecked()
}

/** Writes the p99 and the range into the three fields with the keyboard, and files the report with Enter from the last of them. */
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
async function fileReport(page: Page, a: Answer) {
  await nameFlaw(page, a.flaw)
  await writeAndFile(page, { p99: ms(a.p99Us), lo: ms(a.loUs), hi: ms(a.hiUs) })
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

/** The claim, in milliseconds: the report's p99, which is the case's own. */
const claimMs = async (page: Page) => Number((await page.locator('[data-bench-claim]').innerText()).replace(/[^\d.]/g, ''))

/** Whether a box is inside the viewport, to the pixel. */
const inView = (box: { x: number; y: number; width: number; height: number } | null, viewport: { width: number; height: number }) =>
  box !== null && box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= viewport.width + 0.5 && box.y + box.height <= viewport.height + 0.5

test.describe('a keyboard-only walk files a report on every level', () => {
  for (const level of ['due', 'warm', 'sure'] as const) {
    test(`\`${level}\`: the first run's Next, the arrow keys to name the flaw, digits, Enter to file, and the result`, async ({ page }) => {
      const slot = buildLevel(level, 0).slots[0]
      await open(page, level, { intro: 'fresh' })
      await benchLevelWalk(level, 0)(page, walkOf(page))
      await expect(page.locator('[data-ruling-body] [data-line="flaw"]')).toContainText(`You named ${FLAW_FACTS[slot.flaw].phrase}`)
      await expect(page.getByText('The rule, and the arithmetic')).toBeVisible()
    })
  }

  test('`court`: five reports, each filed from the keyboard, with focus on the next report each time, and the docket at the end', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'court')
    await benchLevelWalk('court', 0)(page, walkOf(page))
    await expect(page.locator('[data-ruling]')).toHaveCount(5)
    await expect(page.getByRole('button', { name: /^Show \d$/ })).toHaveCount(5)
  })

  test('a report with the wrong flaw is Not yet, the result says which part was wrong, and the way on is still the keyboard\'s', async ({ page }) => {
    const slot = buildLevel('due', 0).slots[0]
    const right = rightAnswer(slot)
    await open(page, 'due')
    await fileReport(page, { flaw: 'warm-cache', p99Us: right.p99Us * 3, loUs: right.p99Us * 2, hiUs: right.p99Us * 4 })
    await expect(outcome(page)).toHaveText('The run is over. The result is in the dock.')
    await expect(verdict(page)).toHaveText('Not yet')
    await expect(page.locator('[data-ruling-body] [data-ok="false"]').first()).toBeVisible()
    await expect(page.locator('[data-result]')).toContainText('You named a warm cache')
    await expect(page.locator('[data-result]')).not.toContainText('Passed')
    await tabTo(page, /^(Next level: .*|Run again)$/, 12)
  })

  test('the report is not filed until a flaw is named and a p99 with a range that holds it is written, and Enter in a field does nothing before that', async ({ page }) => {
    await open(page, 'due')
    const file = page.getByRole('button', { name: 'File the report' })
    await expect(file).toBeDisabled()
    await expect(page.locator('[data-bench-form]')).toContainText('To file it: name a flaw, and write a p99 and a range that holds it.')
    await page.getByLabel('Your p99 (ms)').fill('100')
    await page.getByLabel('Your p99 (ms)').press('Enter')
    await expect(page.locator('[data-ruling-body]')).toHaveCount(0)
    await page.getByLabel('Range from (ms)').fill('200')
    await page.getByLabel('to (ms)').fill('300')
    await expect(page.locator('[data-bench-form] [role="alert"]')).toContainText('range must hold the p99')
    await expect(file).toBeDisabled()
  })
})

test.describe('the first screen', () => {
  test('at 1440 x 900 the switch, the chart, the report form and the readout are inside the viewport together, and the range rule is above the fields', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'due')
    const viewport = { width: 1440, height: 900 }
    const boxes = {
      switch: await clockSwitch(page).boundingBox(),
      chart: await page.locator('.es-bench-sheet svg').boundingBox(),
      claim: await page.locator('[data-bench-claim]').boundingBox(),
      rule: await page.locator('[data-bench-rule]').boundingBox(),
      p99: await page.getByLabel('Your p99 (ms)').boundingBox(),
      file: await page.getByRole('button', { name: 'File the report' }).boundingBox(),
      readout: await page.locator('[data-bench-readout]').boundingBox(),
    }
    for (const [name, box] of Object.entries(boxes)) expect([name, inView(box, viewport)]).toEqual([name, true])
    // The chart and the form stand side by side: the switch is over the chart, the form beside it, one row.
    expect(boxes.chart && boxes.p99 && boxes.chart.x + boxes.chart.width <= boxes.p99.x + 1).toBe(true)
    expect(boxes.switch && boxes.chart && boxes.switch.y < boxes.chart.y).toBe(true)
    // The rule is printed above the fields, before the learner files.
    expect(boxes.rule && boxes.p99 && boxes.rule.y + boxes.rule.height <= boxes.p99.y).toBe(true)
    await expect(page.locator('[data-bench-rule]')).toContainText('within 15%')
    await expect(page.locator('[data-bench-rule]')).toContainText('at most 2 times as wide as its bootstrap interval')
    const page2 = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 200)
    expect(page2).toBe(true)
  })

  test('at 390 x 844 the claim, the switch, the form\'s fields and the readout share the screen with the diagram\'s box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, 'due')
    const viewport = { width: 390, height: 844 }
    const view = await page.locator('.es-frame__view').boundingBox()
    const dock = await page.locator('[data-dock]').boundingBox()
    expect(inView(view, viewport)).toBe(true)
    expect(inView(dock, viewport)).toBe(true)
    expect(inView(await page.locator('[data-bench-claim]').boundingBox(), viewport)).toBe(true)
    expect(inView(await clockSwitch(page).boundingBox(), viewport)).toBe(true)
    expect(inView(await page.locator('[data-bench-readout]').boundingBox(), viewport)).toBe(true)
    // The diagram's box ends where the pinned dock starts, so nothing of it hides under the dock.
    expect(view && dock && view.y + view.height <= dock.y + 1).toBe(true)
    await expect(page.locator('[data-bench-rule]')).toBeVisible()
  })

  test('each level shows its title, its goal line and, played graded, its pass rule before the run', async ({ page }) => {
    for (const level of ['due', 'warm', 'sure', 'court'] as const) {
      await open(page, level)
      await expect(page.locator('.es-frame__level, .es-level__face').first()).toContainText(level === 'court' ? 'Five reports' : level === 'due' ? 'From due time' : level === 'warm' ? 'Warm-up cut' : 'p99 interval')
      await expect(page.locator('.es-goal')).toContainText(/Ends when you (file|have filed)/)
      await expect(page.locator('.es-goal')).toContainText('graded attempt passes when')
      await queueSeeds(page, [123_456 + level.length])
      await page.getByRole('button', { name: 'Start a graded attempt' }).click()
      await expect(page.locator('.es-goal')).toContainText('Passes when')
      await expect(page.locator('.es-goal')).toContainText('within 15%')
    }
  })
})

test.describe('the first run', () => {
  test('is the parts, then a flip of the switch that files nothing, then the report form with its range rule', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'due', { intro: 'fresh' })
    const strip = page.locator('[data-game="broken-bench"] .es-intro')
    await expect(strip).toHaveAttribute('data-intro', 'parts')
    await expect(strip.getByRole('listitem')).toHaveCount(5)
    for (const name of ['Claim', 'Histogram', 'Timeline', 'Latency switch', 'Report form']) await expect(strip).toContainText(name)
    // The form is held back until the parts and the switch have been met (name, then ask).
    await expect(page.locator('[data-bench-form]')).toHaveCount(0)
    await strip.getByRole('button', { name: 'Next' }).click()
    await expect(strip).toHaveAttribute('data-intro', 'look')
    await expect(strip).toContainText('Flip the Latency from switch')
    await expect(strip).toContainText('files nothing')
    await expect(page.locator('[data-bench-form]')).toHaveCount(0)
    // Flip it: the p99 moves, nothing is in the action log (Undo stays disabled), and the form is still held back.
    const before = await measured(page).innerText()
    await clockSwitch(page).click()
    await expect(measured(page)).not.toHaveText(before)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
    await strip.getByRole('button', { name: 'Next' }).click()
    await expect(strip).toHaveAttribute('data-intro', 'ask')
    await expect(page.locator('[data-bench-form]')).toBeVisible()
    await expect(page.locator('[data-bench-rule]')).toBeVisible()
    await expect(strip).toContainText('Nothing is filed until you file it')
    // Naming a flaw is a real move: it ends the intro, and it is kept.
    await page.locator('label[data-flaw="none"]').click()
    await expect(strip).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
    const flag = await page.evaluate(() => JSON.parse(localStorage.getItem('es:intro') ?? '{}'))
    expect(flag['broken-bench']).toEqual(PARTS)
  })

  test('the scripted first run, from the parts to a filed report, takes under a minute', async ({ page }) => {
    const started = Date.now()
    const slot = buildLevel('due', 0).slots[0]
    await open(page, 'due', { intro: 'fresh' })
    await benchLevelWalk('due', 0)(page, walkOf(page))
    expect(Date.now() - started).toBeLessThan(60_000)
    expect(slot.flaw).toBe('coordinated-omission')
  })

  test('Skip intro and Escape end it at any step, and a learner who met every part gets none', async ({ page }) => {
    await open(page, 'due', { intro: 'fresh' })
    await page.getByRole('button', { name: 'Skip intro' }).click()
    await expect(page.locator('.es-intro')).toHaveCount(0)
    await expect(page.locator('[data-bench-form]')).toBeVisible()
    await reopen(page, 'due')
    await expect(page.locator('.es-intro')).toHaveCount(0)
  })

  test('names coordinated omission once, when the p99 moves because latency counts from the due time', async ({ page }) => {
    await open(page, 'due')
    const moment = page.locator('[data-moment="coordinated-omission"]')
    await expect(moment).toHaveCount(0)
    const before = await measured(page).innerText()
    await clockSwitch(page).click()
    await expect(moment).toBeVisible()
    await expect(moment).toContainText('Coordinated omission')
    await expect(moment).toContainText(`${before} ms`)
    expect(findBanned(await moment.innerText())).toEqual([])
    // The p99 on the chart and in the readout is the moved one, with its delta for a moment.
    await expect(page.locator('[data-readout-id="measured"] .es-delta')).toBeVisible()
    await clockSwitch(page).click()
    await expect(moment).toHaveCount(0)
    await clockSwitch(page).click()
    await expect(moment).toHaveCount(0)
    expect(COORDINATED_OMISSION.line('1', '2')).toContain('Coordinated omission')
  })
})

test.describe('the keys of the game', () => {
  test('`T` moves the clock between the send time and the due time, and the tail follows it', async ({ page }) => {
    await open(page, 'due')
    await game(page).focus()
    const before = await measured(page).innerText()
    await page.keyboard.press('KeyT')
    await expect(live(page)).toContainText('Latency counts from the due time.')
    await expect(clockSwitch(page)).toBeChecked()
    await expect(measured(page)).not.toHaveText(before)
    await page.keyboard.press('KeyT')
    await expect(live(page)).toContainText('Latency counts from the send time.')
    await expect(measured(page)).toHaveText(before)
  })

  test('`J` and `K` select the next and the previous request, and the line under the chart reads its four times', async ({ page }) => {
    await open(page, 'due')
    await game(page).focus()
    await page.keyboard.press('KeyJ')
    await expect(page.locator('.es-bench-request')).toContainText('Request 0129')
    await page.keyboard.press('KeyJ')
    await expect(page.locator('.es-bench-request')).toContainText('Request 0130')
    await page.keyboard.press('KeyK')
    await expect(page.locator('.es-bench-request')).toContainText('Request 0129')
    for (const label of ['due', 'sent', 'first token', 'done']) await expect(page.locator('.es-bench-request')).toContainText(label)
  })

  test('`]` and `[` turn the sheets, which all draw the request that is selected', async ({ page }) => {
    await open(page, 'due')
    await game(page).focus()
    await page.keyboard.press('KeyJ')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'histogram')
    await page.keyboard.press('BracketRight')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'rows')
    await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1)
    await page.keyboard.press('BracketRight')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'timeline')
    await expect(page.locator('[data-row="128"]').first()).toBeAttached()
    await page.keyboard.press('BracketLeft')
    await expect(page.locator('[data-bench-board]')).toHaveAttribute('data-tab', 'rows')
  })

  test('the log is a listbox: the arrow keys, Page Up and Down, Home and End move the selected request, and a tap on a line selects it', async ({ page }) => {
    await open(page, 'due')
    await page.getByRole('button', { name: 'Log', exact: true }).click()
    const log = page.getByRole('listbox')
    await expect(log).toBeVisible()
    await log.getByRole('option').nth(3).click()
    const selected = page.locator('[role="option"][aria-selected="true"]')
    await expect(selected).toHaveCount(1)
    const first = Number(await selected.getAttribute('data-order'))
    await page.keyboard.press('ArrowDown')
    await expect(selected).toHaveAttribute('data-order', String(first + 1))
    await page.keyboard.press('PageDown')
    await expect(selected).toHaveAttribute('data-order', String(first + 11))
    await page.keyboard.press('Home')
    await expect(selected).toHaveAttribute('data-order', '128')
    await page.keyboard.press('End')
    await expect(selected).toHaveAttribute('data-order', '1127')
  })

  test('`?` lists the keys, with the game\'s own after the common ones, and Escape gives focus back', async ({ page }) => {
    await open(page, 'due')
    await game(page).focus()
    await page.keyboard.press('Shift+Slash')
    const dialog = page.getByRole('dialog', { name: 'Keyboard' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Time each request from its send, or from when it was due')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('setting the cut to the course\'s rule and the switch to the due time reads the p99 the reference recomputes, off the readout', async ({ page }) => {
    await open(page, 'warm')
    const slot = buildLevel('warm', 0).slots[0]
    const truth = caseOf(slot).truth.correction
    await clockSwitch(page).check()
    const cut = page.getByLabel('Leave out the first')
    await cut.fill('128')
    expect(truth.p99Us).toBeGreaterThan(0)
    await expect(page.locator('[data-readout-id="requests"] dd')).not.toHaveText('')
  })
})

test.describe('a graded attempt', () => {
  test('is dealt the seed that the page draws when it starts, hides the p99 at the switch and the undo, and the practice seed is never the graded one', async ({ page }) => {
    await open(page, 'due')
    const practiceSeed = buildLevel('due', 0).seed
    await expect(game(page)).toHaveAttribute('data-seed', String(practiceSeed))
    await expect(measured(page)).toBeVisible()
    const seed = drawInBand(benchSession, 'due', 777_000_111)
    await queueSeeds(page, [777_000_111])
    await page.getByRole('button', { name: 'Start a graded attempt' }).click()
    await expect(game(page)).toHaveAttribute('data-mode', 'graded')
    await expect(game(page)).toHaveAttribute('data-seed', String(seed))
    expect(seed).not.toBe(practiceSeed)
    expect(await claimMs(page)).toBeCloseTo(caseOf(buildLevel('due', seed).slots[0]).scene.claim.valueUs / 1000, 1)
    await expect(measured(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await expect(page.locator('[data-moment]')).toHaveCount(0)
    await clockSwitch(page).click()
    await expect(page.locator('[data-moment]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Back to practice' })).toBeVisible()
  })

  test('is dealt another seed each time it is started, and "New numbers" draws one too', async ({ page }) => {
    await open(page, 'due')
    await queueSeeds(page, [11_111, 22_222, 33_333])
    await page.getByRole('button', { name: 'Start a graded attempt' }).click()
    const one = await game(page).getAttribute('data-seed')
    await page.getByRole('button', { name: 'New numbers' }).click()
    const two = await game(page).getAttribute('data-seed')
    expect(two).not.toBe(one)
    expect(two).toBe(String(drawInBand(benchSession, 'due', 22_222)))
  })

  test('is won from the numbers the page prints: the switch on the due time, the tail counted down to the p99\'s rank, and a range around it', async ({ page }) => {
    const seed = drawInBand(benchSession, 'due', 4_000_000_001)
    const dealt = buildLevel('due', seed).slots[0]
    await open(page, 'due')
    await queueSeeds(page, [4_000_000_001])
    await page.getByRole('button', { name: 'Start a graded attempt' }).click()
    expect(await claimMs(page)).toBeCloseTo(caseOf(dealt).scene.claim.valueUs / 1000, 1)
    await game(page).focus()
    await page.keyboard.press('KeyT')
    await expect(live(page)).toContainText('Latency counts from the due time.')
    await page.locator('details[data-state-table] > summary').click()
    const summary = await page.locator('[data-mirror-summary]').innerText()
    const count = Number(/Measured: ([\d,]+) requests/.exec(summary)?.[1]?.replace(/,/g, ''))
    expect(count).toBeGreaterThanOrEqual(1000)
    const rank = count - Math.ceil(0.99 * count) + 1
    const row = page.locator('[data-mirror] tbody tr').filter({ has: page.locator('th button', { hasText: new RegExp(`^${rank}$`) }) })
    await expect(row).toHaveCount(1)
    const printed = Number((await row.locator('td[data-label="To first token"]').innerText()).replace(/[^\d.]/g, ''))
    expect(printed).toBeGreaterThan(0)
    const lo = (Math.floor(printed * 0.99 * 10) / 10).toFixed(1)
    const hi = (Math.ceil(printed * 1.01 * 10) / 10).toFixed(1)
    await nameFlaw(page, dealt.flaw)
    await writeAndFile(page, { p99: String(printed), lo, hi })
    await expect(verdict(page)).toHaveText('Passed')
    await expect(page.locator('[data-ruling-body] [data-line="number"] [data-ok="true"]')).toHaveCount(1)
    await expect(page.locator('[data-ruling-body] [data-line="range"] [data-ok="true"]')).toHaveCount(1)
  })
})

test.describe('the result', () => {
  test('the verdict word is the grade\'s, the corrected run is drawn in the diagram beside it, and the court\'s docket draws each report in turn', async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    const slots = buildLevel('court', 0).slots
    await open(page, 'court')
    for (const [at, slot] of slots.entries()) {
      // Four of the five stand; the fifth names no flaw, so it does not.
      const right = rightAnswer(slot)
      await fileReport(page, at === 4 ? { ...right, flaw: right.flaw === 'none' ? 'warm-cache' : 'none' } : right)
      if (at < 4) await expect.poll(() => activeName(page)).toBe(`Report form: report ${at + 2} of 5`)
    }
    await expect(verdict(page)).toHaveText('Passed')
    await expect(page.locator('[data-result]')).toContainText('Enough reports stood to pass, though one did not.')
    await expect(page.locator('[data-score]')).toHaveAttribute('data-stood', '4')
    await expect(page.locator('[data-exhibits]')).toBeVisible()
    await expect(page.locator('[data-exhibits] svg').first()).toBeVisible()
    await expect(page.locator('[data-exhibits]')).toHaveAttribute('data-case', '1')
    await page.getByRole('button', { name: 'Show 3' }).click()
    await expect(page.locator('[data-exhibits]')).toHaveAttribute('data-case', '3')
    await expect(page.locator('[data-ruling-body="3"]')).toBeVisible()
    // The diagram, the dock and the readout stay in the first screen at the result.
    const viewport = { width: 1440, height: 900 }
    expect(inView(await page.locator('[data-exhibits]').boundingBox(), viewport)).toBe(true)
    await expect(page.locator('[data-dock]')).toBeVisible()
  })

  test('on a phone the verdict and the ways on come first in the pinned dock', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const right = rightAnswer(buildLevel('due', 0).slots[0])
    await open(page, 'due')
    await fileReport(page, right)
    await expect(verdict(page)).toHaveText('Passed')
    const box = await verdict(page).boundingBox()
    expect(inView(box, { width: 390, height: 844 })).toBe(true)
    expect(inView(await page.getByRole('button', { name: /^Next level/ }).boundingBox(), { width: 390, height: 844 })).toBe(true)
  })
})

test.describe('the words', () => {
  test('no banned word or phrase on any level, at the start and at the result, in text, labels and live lines', async ({ page }) => {
    test.setTimeout(180_000)
    const read = () =>
      page.evaluate(() => {
        const labels = [...document.querySelectorAll('[aria-label], [title], img[alt]')].flatMap((el) => [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt')]).filter(Boolean)
        const root = document.querySelector('section[data-game="broken-bench"]')
        return [root?.textContent ?? '', ...labels].join('\n')
      })
    for (const level of ['due', 'warm', 'sure', 'court'] as const) {
      // The first run is on the first level only: a level the ledger says was played has its parts met.
      const first = level === 'due'
      await open(page, level, { intro: first ? 'fresh' : 'met' })
      if (first) {
        expect(findBanned(await read()), `${level}, the first run`).toEqual([])
        await page.getByRole('button', { name: 'Skip intro' }).click()
      }
      await page.locator('details[data-state-table] > summary').click()
      expect(findBanned(await read()), `${level}, the start`).toEqual([])
      for (const sheet of ['Log', 'Timeline', 'Histogram']) {
        await page.getByRole('button', { name: sheet, exact: true }).click()
        expect(findBanned(await read()), `${level}, the ${sheet}`).toEqual([])
      }
      await clockSwitch(page).click()
      expect(findBanned(await read()), `${level}, the moment`).toEqual([])
      await page.getByRole('button', { name: 'Parts' }).click()
      expect(findBanned(await read()), `${level}, the parts`).toEqual([])
      await page.keyboard.press('Escape')
      for (const [at, slot] of buildLevel(level, 0).slots.entries()) {
        await fileReport(page, rightAnswer(slot))
        if (at < 4 && level === 'court') await expect.poll(() => activeName(page)).toBe(`Report form: report ${at + 2} of 5`)
      }
      await expect(verdict(page)).toBeVisible()
      expect(findBanned(await read()), `${level}, the result`).toEqual([])
    }
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('nothing animates, and the game plays to a verdict', async ({ page }) => {
    await open(page, 'due')
    const slot = buildLevel('due', 0).slots[0]
    await clockSwitch(page).click()
    const motion = await page.evaluate(() => [...document.querySelectorAll('.es-frame *')].filter((el) => getComputedStyle(el).animationName !== 'none' && getComputedStyle(el).animationDuration !== '0s').length)
    expect(motion).toBe(0)
    await fileReport(page, rightAnswer(slot))
    await expect(verdict(page)).toHaveText('Passed')
  })
})

test.describe('the page keeps to its origin', () => {
  test('no request leaves it while a level is played to its result', async ({ page }) => {
    const foreign: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (!url.href.startsWith(origin) && url.protocol.startsWith('http')) foreign.push(url.href)
    })
    await open(page, 'due')
    await fileReport(page, rightAnswer(buildLevel('due', 0).slots[0]))
    await expect(verdict(page)).toBeVisible()
    expect(foreign).toEqual([])
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

  test('the same seed and the same actions give the same state hash in the browser as under Node, a court of five reports included', async ({ page }) => {
    test.skip(!sources, 'the page imports the sources, which only a dev server serves')
    test.setTimeout(180_000)
    let run = startRun(benchSession, { game: 'broken-bench', level: 'court', seed: 0 })
    for (const action of actions) run = applyAction(benchSession, run, action)
    const expected = stateHash(run.state)
    await open(page, 'due')
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

test.describe('the tail gives nothing away', () => {
  test('the table lists as many requests for every setting of the switch and the cut, in a graded attempt too', async ({ page }) => {
    await open(page, 'due')
    await page.locator('details[data-state-table] > summary').click()
    const lines = () => page.locator('[data-mirror] tbody tr').count()
    const start = await lines()
    expect(start).toBe(TAIL_ROWS)
    await clockSwitch(page).click()
    expect(await lines()).toBe(TAIL_ROWS)
    await page.getByLabel('Leave out the first').fill('0')
    expect(await lines()).toBe(TAIL_ROWS)
    await queueSeeds(page, [99_001])
    await page.getByRole('button', { name: 'Start a graded attempt' }).click()
    await page.locator('details[data-state-table]').evaluate((el) => ((el as HTMLDetailsElement).open = true))
    expect(await lines()).toBe(TAIL_ROWS)
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

      test('every level, each sheet, the first run, a graded attempt, a report filed and a result, pass axe', async ({ page, browser }) => {
        test.setTimeout(240_000)
        for (const level of LEVELS) {
          await open(page, level)
          await audit(page, `${level} at ${width} px`)
        }
        await open(page, 'due')
        for (const sheet of ['Log', 'Timeline', 'Histogram']) {
          await page.getByRole('button', { name: sheet, exact: true }).click()
          await audit(page, `due, ${sheet}, at ${width} px`)
        }
        await clockSwitch(page).click()
        await audit(page, `due, the due time, with its moment, at ${width} px`)
        if (width >= 1280) {
          await page.getByRole('button', { name: 'Parts' }).click()
          await audit(page, `due, parts, at ${width} px`)
          await page.keyboard.press('Escape')
        }
        await queueSeeds(page, [31_415_926])
        await page.getByRole('button', { name: 'Start a graded attempt' }).click()
        await audit(page, `due, graded, at ${width} px`)
        // The first run, on a page of its own: the intro flag is empty there.
        const clean = await browser.newContext({ viewport: { width, height: 900 } })
        const fresh = await clean.newPage()
        await fresh.goto(`${origin}/play/broken-bench?level=due`, { waitUntil: 'networkidle' })
        await expect(fresh.locator('.es-intro')).toBeVisible()
        await audit(fresh, `due, the first run, at ${width} px`)
        await clean.close()
        await reopen(page, 'court')
        await fileReport(page, rightAnswer(buildLevel('court', 0).slots[0]))
        await expect.poll(() => activeName(page)).toBe('Report form: report 2 of 5')
        await audit(page, `court, second report, at ${width} px`)
        await reopen(page, 'sure')
        await fileReport(page, rightAnswer(buildLevel('sure', 0).slots[0]))
        await expect(verdict(page)).toHaveText('Passed')
        await audit(page, `sure, result, at ${width} px`)
      })
    })
  }

  test.describe('at 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('nothing is cut off at the right edge and the page needs no sideways scroll, on any level or sheet (WCAG 1.4.10)', async ({ page }) => {
      test.setTimeout(180_000)
      for (const level of LEVELS) {
        await open(page, level)
        for (const sheet of ['Log', 'Timeline', 'Histogram']) {
          await page.getByRole('button', { name: sheet, exact: true }).click()
          const edge = await clipped(page, 'section[data-game="broken-bench"]')
          expect([level, sheet, edge.scrolls, edge.text]).toEqual([level, sheet, 0, []])
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      }
    })
  })
})
