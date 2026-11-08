/*
 * W1-T22, in a real browser: the `hybrid-kv` lab's page (/labs/hybrid-kv) with the real worker, the real WebAssembly and the builds that
 * Rust made (tests/fixtures/forge/hybrid-kv, which verify:labs keeps in step with labs/forge/hybrid-kv). e2e/forge.spec.ts drives the
 * toy lab through the whole of the page; this spec asks what only this lab asks of it.
 *
 *   1. Six checks, not five, and a gauntlet that sends about 13,000 commands to the module inside its 2 s: in V8's WebAssembly, in a worker,
 *      with the page alive.
 *   2. A solved module passes all six on fresh seeds, and the run is written to the ledger with the file's SHA-256 and six seeds.
 *   3. A wrong module's message names its script, its operation and its check, and the long message reflows at 320 px.
 *   4. An unfinished module traps in every check with the words of its todo!().
 *
 *   npx playwright test e2e/forge-hybrid-kv.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { clipped, expect, open, quiet, test } from './support/site'

const FIXTURES = path.resolve(import.meta.dirname, '../tests/fixtures/forge/hybrid-kv')
const fixture = (name: string) => path.join(FIXTURES, `${name}.wasm`)
const sha256 = (name: string) => createHash('sha256').update(readFileSync(fixture(name))).digest('hex')

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const rows = (page: Page) => page.locator('.es-forge-check')
const statusOf = async (page: Page): Promise<string[]> => (await rows(page).locator('.es-forge-check__result').allInnerTexts()).map((word) => word.trim().toLowerCase())
const finished = (page: Page) => expect(rows(page).and(page.locator('[data-state="result"]'))).toHaveCount(6, { timeout: 60_000 })
const drop = (page: Page, name: string) => page.locator('input[type="file"]').setInputFiles(fixture(name))
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

test.describe('the page before a file', () => {
  test('names the lab and lists the six checks of the lab, one for each stage, that have not run', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Reach-In Manager')
    await expect(rows(page)).toHaveCount(6)
    expect(await statusOf(page)).toEqual(Array(6).fill('not run'))
    await expect(rows(page).first()).toContainText('one group: pages, prefix hashes and shared blocks')
    await expect(rows(page).last()).toContainText('seeded churn: the invariants after every operation')
    await expect(page.locator('[data-lamp]')).toHaveCount(1)
  })
})

test.describe('a solved module', () => {
  test('passes all six checks on fresh seeds in the browser, and is written to the ledger with its SHA-256 and six seeds', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'solved')
    await finished(page)
    expect(await statusOf(page)).toEqual(Array(6).fill('pass'))
    await expect(page.locator('.es-forge-hash__digits')).toHaveText(sha256('solved'))
    await expect(page.locator('.es-forge-check[data-lamp]')).toHaveCount(0)
    await expect(rows(page).last()).toContainText(/\d+ operations on 11 pools/)
    await wrote(page)

    const events = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ ref: 'lab:hybrid-kv', ok: true, score: 1, provenance: 'unseen' })
    expect(events[0].data.wasmSha256).toBe(sha256('solved'))
    expect(events[0].data.seeds).toHaveLength(6)
    expect(events[0].data.checks.map((check) => `${check.id} ${check.status}`)).toEqual([
      'one_group pass',
      'sliding pass',
      'state pass',
      'hit_all_groups pass',
      'adapter_pages pass',
      'gauntlet pass',
    ])
  })

  test('a reference build passes, says hybrid-kv@reference: no credit, and writes nothing', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'reference')
    await finished(page)
    expect(await statusOf(page)).toEqual(Array(6).fill('pass'))
    await expect(page.getByText('hybrid-kv@reference: no credit').first()).toBeVisible()
    await quiet(page)
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toEqual([])
  })
})

test.describe('a wrong module', () => {
  test('free-forward fails the checks it is named for, and the lamp is on the first with the script, the operation and the check', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'free-forward')
    await finished(page)
    // bestiary.json names one_group, sliding, hit_all_groups and gauntlet: the scripts decide those. A seeded stream decides the others.
    const statuses = await statusOf(page)
    expect([0, 1, 3, 5].map((i) => statuses[i])).toEqual(['fail', 'fail', 'fail', 'fail'])
    const lamp = page.locator('.es-forge-check[data-lamp]')
    await expect(lamp).toHaveCount(1)
    await expect(lamp).toContainText('the one-group script, operation 13 of 23: admit 6 (37 tokens): events: admit published BlockRemoved')
    await expect(lamp).toContainText('Catches:')
    await wrote(page)
    const events = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(events[0]).toMatchObject({ ok: false, score: 0, provenance: 'unseen' })
  })

  test('window-off-by-one passes the stages that have no window and fails the sliding check and the gauntlet', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'window-off-by-one')
    await finished(page)
    const statuses = await statusOf(page)
    // bestiary.json names sliding and gauntlet to fail, and one_group, state and adapter_pages to pass; hit_all_groups is decided by a stream.
    expect([0, 1, 2, 4, 5].map((i) => statuses[i])).toEqual(['pass', 'fail', 'pass', 'pass', 'fail'])
  })

  for (const width of [320, 360, 1280]) {
    test(`at ${width} px the long messages of a red run reflow and axe finds nothing serious`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/labs/hybrid-kv')
      await quiet(page)
      await drop(page, 'leaky-free')
      await finished(page)
      await quiet(page)
      expect(await clipped(page, 'main')).toEqual({ scrolls: 0, text: [] })
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
      const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      expect(blocking.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' ; ')}`)).toEqual([])
    })
  }
})

test.describe('an unfinished module', () => {
  test('traps in every check, with the words of its todo!() and the file and line', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'template')
    await finished(page)
    expect(await statusOf(page)).toEqual(Array(6).fill('trap'))
    await expect(rows(page).first()).toContainText('not implemented yet: build the manager')
    await expect(rows(page).first()).toContainText('hybrid-kv/src/manager.rs')
  })
})
