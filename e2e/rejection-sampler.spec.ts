/*
 * W1-T27, in a real browser: the rejection-sampler lab's page (/labs/rejection-sampler) with the real worker, the real WebAssembly and the
 * builds that Rust made (tests/fixtures/forge/rejection-sampler, which verify:labs keeps in step with labs/forge/rejection-sampler).
 * e2e/forge.spec.ts drives the page's states with the toy lab; this spec shows that the second lab runs in Chromium as it does in Bun, which
 * means the budget of a check: the enumerations send tens of thousands of commands and the chi-square 40,000 rounds, and each check has
 * 2 s [estimated].
 *
 *   1. The page names the lab and lists its five checks.
 *   2. A solved module passes all five on fresh seeds, each well inside its budget, and the run is written with the file's SHA-256 and a
 *      seed for each check. A reference build says "rejection-sampler@reference: no credit".
 *   3. A wrong module fails the checks it is named for, with the words that name the plate, the coin or the dish. The chi-square names the
 *      dish furthest from its share.
 *   4. An unfinished module traps in every check; another lab's module is refused by name.
 *   5. After a red run the page has no serious axe violation at 360 and 1280 px, and does not scroll sideways at 320.
 *
 *   npx playwright test e2e/rejection-sampler.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { clipped, expect, open, quiet, test, type Watch } from './support/site'

const FIXTURES = path.resolve(import.meta.dirname, '../tests/fixtures/forge')
const fixture = (name: string, lab = 'rejection-sampler') => path.join(FIXTURES, lab, `${name}.wasm`)
const sha256 = (name: string) => createHash('sha256').update(readFileSync(fixture(name))).digest('hex')

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const ZODS_PROBE = 'script-src eval @/labs/rejection-sampler'
const IDS = ['accept', 'residual', 'pick', 'round', 'exact']

test.afterEach(({ watch }: { watch: Watch }) => {
  // The ledger makes zod probe `new Function('')` once, and the page's policy refuses it (e2e/support/site.ts): the known refusal, for this page.
  const rest = watch.refused.filter((what) => what !== ZODS_PROBE)
  watch.refused.splice(0, watch.refused.length, ...rest)
})

const rows = (page: Page) => page.locator('.es-forge-check')
const statusOf = async (page: Page): Promise<string[]> => (await rows(page).locator('.es-forge-check__result').allInnerTexts()).map((word) => word.trim().toLowerCase())
const finished = (page: Page) => expect(rows(page).and(page.locator('[data-state="result"]'))).toHaveCount(5, { timeout: 45_000 })
const drop = (page: Page, name: string, lab = 'rejection-sampler') => page.locator('input[type="file"]').setInputFiles(fixture(name, lab))
const wrote = (page: Page) => expect(page.locator('.es-forge-recorded')).toContainText(/Written to your ledger|Not recorded/, { timeout: 15_000 })

interface Stored {
  kind: string
  ref: string
  ok: boolean
  score: number
  provenance: string
  data: { wasmSha256: string; seeds: number[]; checks: { id: string; status: string; seed?: number }[] }
}

const ledger = (page: Page): Promise<Stored[]> =>
  page.evaluate(
    () =>
      new Promise<Stored[]>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('events')) {
            db.close()
            resolve([])
            return
          }
          const all = db.transaction('events', 'readonly').objectStore('events').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve(all.result as Stored[])
          }
        }
      }),
  )

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  expect(
    blocking.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`),
    `${label}: serious or critical violations`,
  ).toEqual([])
}

test.describe('the page', () => {
  test('names the lab in the kitchen\'s words and the engine\'s, and lists the five checks that have not run', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Keep or Re-plate')
    await expect(page.locator('.es-page__lead')).toContainText("speculative decoding's exact verifier")
    await expect(page.locator('.es-forge-drop')).toContainText('rejection_sampler.wasm')
    await expect(rows(page)).toHaveCount(5)
    expect(await statusOf(page)).toEqual(['not run', 'not run', 'not run', 'not run', 'not run'])
    await expect(rows(page).first()).toContainText('keeping a plate keeps exactly min(p, q) of the coins')
    await expect(rows(page).last()).toContainText("what goes out is the chef's tasting: chi-square on two seeds")
  })
})

test.describe('a solved module', () => {
  test('passes all five checks on fresh seeds, and is written with the SHA-256 of the file and a seed for each check', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    const started = Date.now()
    await drop(page, 'solved')
    await finished(page)
    const spent = Date.now() - started
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    // Five checks inside 2 s each; the whole run is a few seconds on a quiet machine, and the bound is a backstop for a loaded one [estimated].
    expect(spent, 'the run, from the drop to the last check').toBeLessThan(30_000)
    await expect(page.locator('.es-forge-hash__digits')).toHaveText(sha256('solved'))
    await expect(page.locator('.es-printer')).toContainText('seed · exact')
    await expect(page.locator('.es-forge-check[data-lamp]')).toHaveCount(0)
    await wrote(page)
    await expect(page.locator('.es-forge-recorded')).toContainText('Written to your ledger on this device')

    const events = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ ref: 'lab:rejection-sampler', ok: true, score: 1, provenance: 'unseen' })
    expect(events[0].data.wasmSha256).toBe(sha256('solved'))
    expect(events[0].data.seeds).toHaveLength(5)
    expect(events[0].data.checks.map((check) => `${check.id} ${check.status}`)).toEqual(IDS.map((id) => `${id} pass`))
  })

  test('the chi-square is the check that takes the time, and it ends inside its 2 s on this machine', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await drop(page, 'solved')
    await expect(page.locator('.es-forge-check[data-state="running"]').filter({ hasText: 'chi-square' })).toBeVisible({ timeout: 30_000 })
    await finished(page)
    await expect(page.locator('.es-forge-check[data-status="timeout"]')).toHaveCount(0)
    await expect(rows(page).last().locator('.es-forge-check__msg')).toContainText('degrees of freedom over 20000 rounds on each of 2 seeds')
  })
})

test.describe('a reference build', () => {
  test('passes, says rejection-sampler@reference: no credit, and writes nothing', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await drop(page, 'reference')
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    await expect(page.getByText('rejection-sampler@reference: no credit').first()).toBeVisible()
    await quiet(page)
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toEqual([])
  })
})

test.describe('a wrong module', () => {
  test('a rule that keeps a coin too many fails accept and pick, names the coin and the dish, and passes the rest it can', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await drop(page, 'boundary-inclusive')
    await finished(page)
    const statuses = await statusOf(page)
    expect(statuses.slice(0, 3)).toEqual(['fail', 'pass', 'fail'])
    const lamp = page.locator('.es-forge-check[data-lamp]')
    await expect(lamp).toHaveCount(1)
    await expect(lamp).toContainText('accept(3, 5, u) kept 4 of the 5 coins')
    await expect(lamp).toContainText('The first coin where it parts from u < p is u = 3, which it kept.')
    await expect(rows(page).nth(2)).toContainText('over the draws 0..5, pick(3,0,2, draw) picked token 0 4 times, and its weight is 3')
    await wrote(page)
    const events = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ ok: false, provenance: 'unseen' })
  })

  test('a re-plate from p fails round and the chi-square, which names the dish furthest from its share', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await drop(page, 'resample-from-p')
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'fail', 'fail'])
    await expect(rows(page).nth(3)).toContainText('the first plate is sent back for sure')
    await expect(rows(page).nth(4)).toContainText('over 20000 rounds the first token that goes out should follow p, and it does not: chi-square')
    await expect(rows(page).nth(4)).toContainText('The dish furthest from its share is token')
    await expect(rows(page).nth(4)).toContainText('Catches:')
  })

  test('can be told on the same seeds again: the same failure, and no new record', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await drop(page, 'fly-lossy')
    await finished(page)
    await wrote(page)
    const message = await rows(page).nth(3).locator('.es-forge-check__msg').innerText()
    await page.getByRole('button', { name: 'Tell these seeds again' }).click()
    await expect(rows(page).last()).toContainText('told again', { timeout: 45_000 })
    expect(await rows(page).nth(3).locator('.es-forge-check__msg').innerText()).toBe(message)
    await expect(page.locator('.es-forge-recorded')).toContainText('Not recorded: these are seeds you have seen already')
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toHaveLength(1)
  })
})

test.describe('limits', () => {
  test('an unfinished module traps in every check, with the words of its todo!() and the file and line', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await drop(page, 'template')
    await finished(page)
    expect(await statusOf(page)).toEqual(['trap', 'trap', 'trap', 'trap', 'trap'])
    await expect(rows(page).first()).toContainText('not implemented yet: keep a plate')
    await expect(rows(page).first()).toContainText('rejection-sampler/src/verify.rs')
  })

  test('another lab\'s module is refused by name', async ({ page }) => {
    await open(page, '/labs/rejection-sampler')
    await page.locator('input[type="file"]').setInputFiles(fixture('solved', 'toy'))
    await expect(page.getByRole('heading', { name: 'Not graded' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.es-ticket__void')).toContainText(/is the "toy" lab's, and this page grades "rejection-sampler"/)
    expect(await statusOf(page)).toEqual(['not run', 'not run', 'not run', 'not run', 'not run'])
  })
})

test.describe('after a red run', () => {
  for (const width of [360, 1280]) {
    test(`at ${width} px: axe finds no serious or critical violation`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/labs/rejection-sampler')
      await drop(page, 'boundary-inclusive')
      await finished(page)
      await wrote(page)
      await quiet(page)
      await audit(page, `/labs/rejection-sampler at ${width} px, after a red run`)
    })
  }

  test('reflows to 320 px with no sideways scroll, with the long messages of the checks on the page', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await open(page, '/labs/rejection-sampler')
    await drop(page, 'resample-from-p')
    await finished(page)
    await quiet(page)
    expect(await clipped(page, 'main')).toEqual({ scrolls: 0, text: [] })
  })
})
