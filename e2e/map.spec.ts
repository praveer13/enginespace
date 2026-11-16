/*
 * W1-T06's acceptance checks in a browser, as R-T21 redrew them: Course (`/map`), the module page's loop and progress, and the Play index (`/play`).
 *
 *   2. There is no sideways scroll at 320 px (WCAG 1.4.10), on the map, a module's page and the Play index, and nothing is cut off.
 *   3. Every published module links to its module from its title, with the mouse and with the keyboard.
 *   (1. No status is stored: tests/progress/read-only.test.ts. Here the same line is held in a browser: what the page shows of the
 *    learner comes back from the ledger after a reload, and goes when the ledger does.)
 *
 * And what the checks cannot see from the markup: Course is one column in the order of the course with its first lesson inside 700 px,
 * the Play index is a board of lines and not a grid of cards, the pictures are drawn, and axe finds no serious or critical violation at 320, 360 and 1280 px on the three pages, with the learner's evidence on them as well.
 *
 *   npx playwright test e2e/map.spec.ts
 *
 * The specs reach the site through the config's `baseURL` (a fresh build under `vite preview`), as the smoke subset's do.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Result } from 'axe-core'
import { buildExport, serializeExport } from '../packages/ledger'
import type { LedgerEvent } from '../packages/ledger'
import { clipped, expect, open, quiet, test, withSettings } from './support/site'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const IMPACTS = new Set(['serious', 'critical'])
const summary = (violation: Result) => `${violation.id} [${violation.impact}] ${violation.help}: ${violation.nodes.slice(0, 4).map((node) => node.target.join(' ')).join(' ; ')}`

/** The modules of the course in order, as the index lists them (content/course.yaml). */
const MODULES = ['tr0', 'tr1', 'tr2', 'tr3', 'tr4', 'tr5a', 'tr5b', 'tr6', 'tr7', 'tr8', 'capstone']
const WIDTHS = [320, 360, 1280] as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* A learner's evidence, put in through the Evidence page's own import                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const AT = '2026-10-01T09:30:00.000Z'
const LATER = '2026-11-03T09:30:00.000Z'

/** A review of one KC, the way Today will write it: right or wrong, on a fresh seed. */
function review(id: string, kc: string, { ok = true, at = AT }: { ok?: boolean; at?: string } = {}): LedgerEvent {
  return { id, v: 1, kind: 'review', ref: `review:${kc}`, at, tz: 0, day: at.slice(0, 10), dev: 'dev-e2e-0001', score: ok ? 1 : 0, ok, provenance: 'unseen', data: { grade: ok ? 3 : 1 } }
}

/** TR2's second KC practised and not earned, its fifth earned, and its seventh earned and kept a month later. */
const EVIDENCE: LedgerEvent[] = [
  review('e2e-1', 'tr2.one-budget', { ok: false }),
  review('e2e-2', 'tr2.async-overlap'),
  review('e2e-3', 'tr2.graph-replay'),
  review('e2e-4', 'tr2.graph-replay', { at: LATER }),
]

/** An answer to an item, the way a lesson's item block and Today write it (src/items/event.ts): right or wrong, on a fresh seed. */
function answer(id: string, ref: string, { ok = true, at = AT }: { ok?: boolean; at?: string } = {}): LedgerEvent {
  const data = { answer: { level: 2, response: { kind: 'numeric', value: 4 } } }
  return { id, v: 1, kind: 'item', ref, at, tz: 0, day: at.slice(0, 10), dev: 'dev-e2e-0001', score: ok ? 1 : 0, ok, provenance: 'unseen', seed: 4242, data }
}

/** A green run of a forge lab, the way its page writes it (src/forge/record.ts): one event for the run, with each check's result. */
function labRun(id: string, lab: string, checks: readonly string[], { at = AT }: { at?: string } = {}): LedgerEvent {
  const data = { wasmSha256: 'ab'.repeat(32), seeds: checks.map((_, index) => index + 1), checks: checks.map((check, index) => ({ id: check, status: 'pass' as const, seed: index + 1 })) }
  return { id, v: 1, kind: 'lab-check', ref: `lab:${lab}`, at, tz: 0, day: at.slice(0, 10), dev: 'dev-e2e-0001', score: 1, ok: true, provenance: 'unseen', data }
}

const exportText = (events: LedgerEvent[]) => serializeExport(buildExport({ ledger: { events, receipts: [] }, device: 'dev-e2e-0001', exportedAt: LATER }))

/** Puts events in the ledger through the Evidence page: choose a file, merge it, and wait for the page to say it is in. */
async function putIn(page: Page, events: LedgerEvent[]): Promise<void> {
  await open(page, '/evidence')
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exportText(events)) })
  const preview = page.getByRole('region', { name: 'Import preview' })
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: 'Import and merge' }).click()
  await expect(preview).toBeHidden()
  await expect(page.getByRole('figure', { name: 'The import, printed' })).toBeVisible()
}

/** Waits until a page has read the ledger: the pages say "Reading your ledger" until they have. */
async function readTheLedger(page: Page): Promise<void> {
  await expect(page.getByText(/reading your ledger/i)).toHaveCount(0)
  await quiet(page)
}

const row = (page: Page, module: string) => page.locator(`li.es-course__row[data-module="${module}"]`)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Accept 2: no sideways scroll at 320 px                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

for (const width of WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    for (const route of ['/map', '/m/tr2', '/m/tr0', '/play']) {
      test(`${route}: the page does not scroll sideways, and no text is cut off at the right edge`, async ({ page, context }) => {
        await withSettings(context, { view3d: false })
        await open(page, route)
        await quiet(page)
        const found = await clipped(page)
        expect(found.scrolls, 'pixels the page scrolls sideways').toBeLessThanOrEqual(0)
        expect(found.text, 'text past the right edge, and out of every box that scrolls').toEqual([])
      })

      test(`${route}: axe finds no serious or critical violation, and the headings are an outline`, async ({ page, context }) => {
        await withSettings(context, { view3d: false })
        await open(page, route)
        await quiet(page)
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
        expect(results.passes.length + results.violations.length, 'the rules that axe ran').toBeGreaterThan(20)
        expect(results.violations.filter((violation) => IMPACTS.has(violation.impact ?? '')).map(summary)).toEqual([])
        expect(results.violations.filter((violation) => ['heading-order', 'page-has-heading-one', 'empty-heading'].includes(violation.id)).map(summary)).toEqual([])
      })
    }

    test('/map and /m/tr2, with the learner\'s evidence on them: still no sideways scroll, and axe finds nothing serious', async ({ page, context }) => {
      await withSettings(context, { view3d: false })
      await putIn(page, EVIDENCE)
      for (const route of ['/map', '/m/tr2']) {
        await open(page, route)
        await readTheLedger(page)
        const found = await clipped(page)
        expect([route, found.scrolls <= 0, found.text]).toEqual([route, true, []])
        const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
        expect(results.violations.filter((violation) => IMPACTS.has(violation.impact ?? '')).map(summary), route).toEqual([])
      }
    })
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Accept 3: every node links to its module                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('Course', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('lists every module in one column, in the order of the course, and a published module opens from its title', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/map')
    await readTheLedger(page)
    await expect(page.locator('li.es-course__row')).toHaveCount(MODULES.length)
    expect(await page.locator('li.es-course__row').evaluateAll((items) => items.map((item) => item.getAttribute('data-module')))).toEqual(MODULES)
    // One column: every row is as wide as the one before, and each stands below the last.
    const boxes = await page.locator('li.es-course__row').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).map((box) => ({ left: box.left, width: box.width, top: box.top })))
    for (let at = 1; at < boxes.length; at += 1) {
      expect(boxes[at].top).toBeGreaterThan(boxes[at - 1].top)
      expect(Math.abs(boxes[at].left - boxes[0].left)).toBeLessThan(1)
      expect(Math.abs(boxes[at].width - boxes[0].width)).toBeLessThan(1)
    }
    await row(page, 'tr2').getByRole('link', { name: /The step loop/ }).click()
    await expect(page).toHaveURL(/\/m\/tr2$/)
    await expect(page.getByRole('heading', { level: 1, name: 'The step loop' })).toBeVisible()
  })

  test('a module that is not published says so and is not a link', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/map')
    await readTheLedger(page)
    for (const module of ['tr0', 'tr3', 'capstone']) {
      const planned = row(page, module)
      await expect(planned).toContainText('Not published yet')
      await expect(planned.locator('h3 a')).toHaveCount(0)
    }
  })

  test('opens with the way on: the sentence, the one amber Continue, and Continue is the header\'s link; the first lesson is within 700 px', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/map')
    await readTheLedger(page)
    await expect(page.locator('.es-course__sentence')).toContainText('You have not started. Next:')
    const way = page.locator('.es-course__way a.es-board__next')
    await expect(way).toHaveCount(1)
    await expect(way).toHaveAttribute('data-emphasis', 'primary')
    await expect(page.getByText('Nothing is locked. Prerequisites advise.')).toBeVisible()
    await expect(page.getByText(/^Skills: tried is/)).toBeVisible()
    await expect(page.getByText(/^A lesson is not started/)).toBeVisible()
    // The module the way on points into is open, and its next lesson carries the marker.
    const open1 = page.locator('li.es-course__row[data-open="true"]')
    await expect(open1).toHaveCount(1)
    const lessons = open1.locator('li.es-course__lesson')
    expect(await lessons.count()).toBeGreaterThan(0)
    await expect(lessons.first()).toHaveAttribute('data-at', 'now')
    await expect(page.locator('[data-at="now"]')).toHaveCount(2)
    const top = await lessons.first().locator('a').evaluate((link) => link.getBoundingClientRect().top)
    expect(top, 'the first lesson link starts within 700 px of the top').toBeLessThan(700)
  })

  test('the way on and the page agree: the amber button\'s link is the way on\'s, and Tab reaches every lesson of the open module', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/map')
    await readTheLedger(page)
    const href = await page.locator('.es-course__way a.es-board__next').getAttribute('href')
    expect(href).toMatch(/^\/m\/[a-z0-9]+\/l1-/)
    const links = page.locator('li.es-course__row[data-open="true"] a.es-course__lesson-link')
    const first = links.first()
    await first.focus()
    await expect(first).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/m\/[a-z0-9]+\/l1-/)
  })

  test('says in words what a module needs and where the learner stands, from the ledger, and the same after a reload; reset takes it away', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await putIn(page, EVIDENCE)
    await open(page, '/map')
    await readTheLedger(page)
    await expect(row(page, 'tr2')).toContainText('10 h, browser only')
    await expect(row(page, 'tr1')).toContainText('7.5 h in the browser, then 2.5 h on a GPU')
    await expect(row(page, 'tr2').locator('.es-course__standing')).toContainText('2 of 11 skills passed')
    // Another module is untouched.
    await expect(row(page, 'tr1').locator('.es-course__standing')).toContainText('0 of 8 skills passed')

    await page.reload()
    await readTheLedger(page)
    await expect(row(page, 'tr2').locator('.es-course__standing')).toContainText('2 of 11 skills passed')

    // Taking the events away takes the progress away: nothing else held it.
    await open(page, '/settings')
    await page.getByRole('button', { name: 'Reset this device' }).click()
    const dialog = page.getByRole('dialog', { name: 'Erase this device?' })
    await dialog.getByRole('button', { name: 'Erase everything' }).click()
    await expect(dialog).toBeHidden()
    await open(page, '/map')
    await readTheLedger(page)
    await expect(row(page, 'tr2').locator('.es-course__standing')).toContainText('0 of 11 skills passed')
  })
})

test.describe('Course on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the way on comes first with its button the full width, and the lesson links are tall enough to press', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/map')
    await readTheLedger(page)
    const way = page.locator('.es-course__way')
    const button = page.locator('.es-course__way a.es-board__next')
    const [wayBox, buttonBox] = await Promise.all([way.boundingBox(), button.boundingBox()])
    expect(wayBox && buttonBox && buttonBox.width > wayBox.width - 40, 'the button spans the sheet').toBe(true)
    const links = page.locator('li.es-course__row[data-open="true"] a.es-course__lesson-link')
    expect(await links.count()).toBeGreaterThan(0)
    const box = await links.first().boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Items and lab checks count toward progress (W1b-T07)                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('progress from items and lab checks', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  // The first variant of Bubble width assesses `tr2.bubble` alone, and hybrid-kv's checks assess five KCs of TR5a (tests/map/progress-sources.test.ts
  // holds the same expectations at the model). The production build reads them from the families' faces and from check-kcs.ts, and from
  // neither the families nor the oracles.
  const EVIDENCE_OF_ITEMS_AND_LABS: LedgerEvent[] = [
    answer('e2e-item-1', 'item:gen/tr2.bubble-width/async-off'),
    answer('e2e-item-2', 'item:gen/tr2.graph-hit/hit-or-miss', { ok: false }),
    labRun('e2e-lab-1', 'hybrid-kv', ['one_group', 'sliding', 'state', 'hit_all_groups', 'adapter_pages', 'gauntlet']),
  ]

  test('the map and the module pages show what an item and a green lab run earned, and what a wrong answer practised', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await putIn(page, EVIDENCE_OF_ITEMS_AND_LABS)
    await open(page, '/map')
    await readTheLedger(page)
    await expect(row(page, 'tr2').locator('.es-course__standing')).toContainText('1 of 11 skills passed')
    await expect(row(page, 'tr5a').locator('.es-course__standing')).toContainText('5 of 8 skills passed')
    // A module that neither touched is as it was.
    await expect(row(page, 'tr1').locator('.es-course__standing')).toContainText('0 of 8 skills passed')

    await open(page, '/m/tr2')
    await readTheLedger(page)
    const tr2Kcs = page.locator('[data-block="kcs"]')
    await expect(tr2Kcs.locator('[data-kc="tr2.bubble"]')).toHaveAttribute('data-state', 'earned')
    await expect(tr2Kcs.locator('[data-kc="tr2.async-overlap"]')).toHaveAttribute('data-state', 'none')
    await expect(tr2Kcs.locator('[data-kc="tr2.graph-replay"]')).toHaveAttribute('data-state', 'practised')

    await open(page, '/m/tr5a')
    await readTheLedger(page)
    const tr5aKcs = page.locator('[data-block="kcs"]')
    await expect(tr5aKcs.locator('[data-kc="tr5a.state-pages"]')).toHaveAttribute('data-state', 'earned')
    await expect(tr5aKcs.locator('[data-kc="tr5a.adapter-pages"]')).toHaveAttribute('data-state', 'earned')
    await expect(tr5aKcs.locator('[data-kc="tr5a.kv-groups"]')).toHaveAttribute('data-state', 'none')
    // The lab run is the Build step of its module's loop (the third of the five).
    await expect(page.locator('[data-block="loop"] .es-steps__item').nth(2)).toContainText('1 passed of 1 tried')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* A module's page: the loop and the progress                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('a module page', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('runs the loop in five steps and lists the knowledge components with their states', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await putIn(page, EVIDENCE)
    await open(page, '/m/tr2')
    await readTheLedger(page)
    const loop = page.locator('[data-block="loop"]')
    await expect(loop.locator('.es-steps__name')).toHaveText(['Predict', 'Play', 'Build', 'Prove', 'Keep'])
    await expect(loop.locator('.es-steps__item').nth(4)).toContainText('3 passed of 4 tried')
    await expect(loop.getByRole('link', { name: 'Step loop' })).toHaveAttribute('href', '/play/loop')
    const kcs = page.locator('[data-block="kcs"]')
    await expect(kcs.locator('[data-kc="tr2.one-budget"]')).toHaveAttribute('data-state', 'practised')
    await expect(kcs.locator('[data-kc="tr2.async-overlap"]')).toHaveAttribute('data-state', 'earned')
    await expect(kcs.locator('[data-kc="tr2.graph-replay"]')).toHaveAttribute('data-state', 'kept')
    await expect(kcs.locator('[data-kc="tr2.step-calls"]')).toHaveAttribute('data-state', 'none')
    await expect(page.getByRole('figure', { name: 'About this module' })).toContainText('passed')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The Play index                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('the Play index', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is a board of lines, one under the next, and not a grid of cards', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/play')
    const lines = await page.locator('li.es-line').evaluateAll((items) => items.map((item) => ({ game: item.getAttribute('data-game'), ...(({ left, right, top, bottom }) => ({ left, right, top, bottom }))(item.getBoundingClientRect()) })))
    expect(lines.length).toBe(9)
    for (let at = 1; at < lines.length; at += 1) {
      // Each line stands under the one before it, as wide as the board, and does not overlap it.
      expect(lines[at].top, `${lines[at].game} starts below ${lines[at - 1].game}`).toBeGreaterThanOrEqual(lines[at - 1].bottom - 1)
      expect(Math.abs(lines[at].left - lines[0].left)).toBeLessThan(2)
      expect(Math.abs(lines[at].right - lines[0].right)).toBeLessThan(2)
    }
    const board = await page.locator('.es-specials__board').boundingBox()
    expect(lines[0].right - lines[0].left).toBeGreaterThan((board?.width ?? 0) * 0.8)
  })

  test('shows each game\'s name over its subtitle, with its module and its view, and Service\'s poster is drawn in its well', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/play')
    const service = page.locator('li.es-line[data-game="loop"]')
    const name = await service.locator('.es-line__title').boundingBox()
    const subtitle = await service.locator('.es-line__subtitle').boundingBox()
    expect(name && subtitle && subtitle.y >= name.y + name.height - 1).toBe(true)
    await expect(service.locator('.es-line__title')).toHaveText('Step loop')
    await expect(service.locator('.es-line__subtitle')).toHaveText('Keep every slot live, and never make the GPU wait for the CPU.')
    await expect(service.locator('.es-line__facts')).toContainText('TR2')
    await expect(service.locator('.es-line__facts')).toContainText('3D')
    await expect(service.locator('.es-poster')).toHaveAttribute('data-state', 'drawn')
    const poster = await service.locator('.es-poster svg').boundingBox()
    expect(poster?.width ?? 0).toBeGreaterThan(200)
    expect(poster?.height ?? 0).toBeGreaterThan(80)
    // The drawing has marks, so it is a picture and not an empty box.
    expect(await service.locator('.es-poster svg rect, .es-poster svg path, .es-poster svg line').count()).toBeGreaterThan(20)
    // It has a name for a reader that cannot see it.
    await expect(service.locator('.es-poster svg')).toHaveAttribute('role', 'img')
    expect(((await service.locator('.es-poster svg').getAttribute('aria-label')) ?? '').length).toBeGreaterThan(10)
  })

  test('the poster is a file that comes after the page, and its well keeps its shape while it comes', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/posters/loop-first-frame-landscape.svg', async (route) => {
      await held
      await route.continue()
    })
    await open(page, '/play')
    const line = page.locator('li.es-line[data-game="loop"]')
    const poster = line.locator('.es-poster')
    await expect(poster).toHaveAttribute('data-state', 'reading')
    const before = { line: await line.boundingBox(), poster: await poster.boundingBox() }
    expect(before.poster?.height ?? 0).toBeGreaterThan(80)
    release()
    await expect(poster).toHaveAttribute('data-state', 'drawn')
    const after = { line: await line.boundingBox(), poster: await poster.boundingBox() }
    // Nothing on the board moved when the picture came.
    expect(Math.abs((after.poster?.width ?? 0) - (before.poster?.width ?? 0))).toBeLessThan(1)
    expect(Math.abs((after.poster?.height ?? 0) - (before.poster?.height ?? 0))).toBeLessThan(1.5)
    expect(Math.abs((after.line?.height ?? 0) - (before.line?.height ?? 0))).toBeLessThan(1.5)
    expect(Math.abs((after.line?.y ?? 0) - (before.line?.y ?? 0))).toBeLessThan(1.5)
  })

  test('a poster that does not come leaves a well that says so, and the game can still be played', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    // A static host that has no such file answers with the page's own document, and not with a poster (the unit tests also cover a 404 and a refused fetch).
    await page.route('**/posters/loop-first-frame-landscape.svg', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' }))
    await open(page, '/play')
    const line = page.locator('li.es-line[data-game="loop"]')
    await expect(line.locator('.es-poster')).toHaveAttribute('data-state', 'missing')
    await expect(line.locator('.es-poster')).toContainText('No picture yet')
    await expect(line.locator('.es-poster svg')).toHaveCount(0)
    await line.locator('a.es-stub__pull').click()
    await expect(page).toHaveURL(/\/play\/loop$/)
  })

  test('links Service to /play/loop, and a game that is not built is arriving and has no link', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/play')
    const arriving = page.locator('li.es-line[data-status="arriving"]')
    expect(await arriving.count()).toBeGreaterThanOrEqual(4)
    await expect(arriving.locator('a[href^="/play/"]')).toHaveCount(0)
    await expect(page.locator('li.es-line[data-game="shape-shifter"]')).toContainText('Not published yet')
    const links = await page.locator('a[href^="/play/"]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))
    expect(links).toContain('/play/loop')
    // Every link on the page is to a game that opens: none is a page that says "Game not found".
    for (const href of links) {
      await page.goto(href as string)
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Game not found')
    }
    await open(page, '/play')
    await page.locator('li.es-line[data-game="loop"] a.es-stub__pull').click()
    await expect(page).toHaveURL(/\/play\/loop$/)
  })

  test('is reached by the keyboard: the Play stub takes focus and Enter opens the game', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/play')
    const stub = page.locator('li.es-line[data-game="loop"] a.es-stub__pull')
    await stub.focus()
    await expect(stub).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/play\/loop$/)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reduced motion                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

test.describe('under reduced motion', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  for (const route of ['/map', '/m/tr2', '/play']) {
    test(`${route}: nothing is moving once the page has drawn`, async ({ page, context }) => {
      await withSettings(context, { view3d: false })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await open(page, route)
      await quiet(page)
      const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)
      expect(running).toBe(0)
    })
  }
})
