/*
 * W1-T10, in a real browser: the forge lab's page (/labs/toy) with the real worker, the real WebAssembly and the builds that Rust made
 * (tests/fixtures/forge/toy, which verify:labs keeps in step with labs/forge/toy). Bun tests the pieces (the host, the runner, the
 * oracle, the view); this spec drives the whole: a learner drops a file and reads what the site made of it.
 *
 *   1. The page before a file, and after: axe finds no serious or critical violation at 360 and 1280 px, and nothing reflows past 320.
 *   2. A solved module passes five checks on fresh seeds, and the run is written to the ledger with the file's SHA-256 and the seeds.
 *   3. A reference build passes, says "toy@reference: no credit", and writes nothing.
 *   4. A wrong module fails the checks it is named for, puts the lamp on the first, is written as a red run, and its seeds can be told
 *      again without a new record.
 *   5. An infinite loop is stopped at the 2 s limit of its check, the page stays alive, and the next check runs.
 *   6. An unfinished module traps with "not implemented yet"; a file that is not a lab module is refused with its reason.
 *   7. A drop works as a choice does, and the keyboard reaches the file chooser.
 *
 * The page loads the ledger, and the policy refuses nothing on it: the schemas are built jitless (packages/schema/zod.ts, D-059), so zod
 * does not probe `new Function('')`, and a refusal fails the spec (e2e/support/site.ts).
 *
 *   npx playwright test e2e/forge.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { buildLabModule } from '../tests/forge/wasm'
import { clipped, expect, open, quiet, test } from './support/site'

const FIXTURES = path.resolve(import.meta.dirname, '../tests/fixtures/forge/toy')
const fixture = (name: string) => path.join(FIXTURES, `${name}.wasm`)
const sha256 = (name: string) => createHash('sha256').update(readFileSync(fixture(name))).digest('hex')

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const rows = (page: Page) => page.locator('.es-forge-check')
const statusOf = async (page: Page): Promise<string[]> => (await rows(page).locator('.es-forge-check__result').allInnerTexts()).map((word) => word.trim().toLowerCase())
const finished = (page: Page) => expect(rows(page).and(page.locator('[data-state="result"]'))).toHaveCount(5, { timeout: 30_000 })
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

/** The events in the learner's IndexedDB: what the ledger holds, read as the page's own store reads it. */
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
  expect(results.violations.filter((violation) => ['heading-order', 'page-has-heading-one', 'empty-heading'].includes(violation.id)).map((v) => v.id), `${label}: the heading outline`).toEqual([])
}

test.describe('the page before a file', () => {
  test('names the lab, puts the lamp on the slip, and lists five checks that have not run', async ({ page }) => {
    await open(page, '/labs/toy')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Rotation')
    await expect(page.getByRole('heading', { name: 'Drop a .wasm' })).toBeVisible()
    await expect(rows(page)).toHaveCount(5)
    expect(await statusOf(page)).toEqual(['not run', 'not run', 'not run', 'not run', 'not run'])
    await expect(page.locator('[data-lamp]')).toHaveCount(1)
    await expect(page.locator('.es-ticket[data-lamp]')).toContainText('Module slip')
    await expect(page.locator('.es-printer')).toContainText('Nothing printed yet')
  })

  for (const width of [360, 1280]) {
    test(`at ${width} px: axe finds no serious or critical violation, before a file and after a red run`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/labs/toy')
      await quiet(page)
      await audit(page, `/labs/toy at ${width} px, before a file`)
      await drop(page, 'fifo')
      await finished(page)
      await wrote(page)
      await quiet(page)
      await audit(page, `/labs/toy at ${width} px, after a red run`)
    })
  }

  test('reflows to 320 px with no sideways scroll, before a file and after a red run', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await open(page, '/labs/toy')
    await quiet(page)
    expect(await clipped(page, 'main')).toEqual({ scrolls: 0, text: [] })
    await drop(page, 'fifo')
    await finished(page)
    await quiet(page)
    expect(await clipped(page, 'main')).toEqual({ scrolls: 0, text: [] })
  })
})

test.describe('where things are', () => {
  test('on a phone the file chooser is in the first screen, and after a run the tape sits between the slip and the checks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, '/labs/toy')
    const choose = await page.getByRole('button', { name: 'Choose a file' }).boundingBox()
    expect(choose, 'the chooser is drawn').not.toBeNull()
    expect(choose!.y + choose!.height, 'the chooser ends inside the first screen').toBeLessThanOrEqual(844)
    // Before a file the tape has nothing to say, and on a phone it is left out.
    await expect(page.locator('.es-printer')).toBeHidden()

    await drop(page, 'solved')
    await finished(page)
    const slip = await page.locator('.es-forge-slip').boundingBox()
    const tape = await page.locator('.es-forge-tape').boundingBox()
    const checks = await page.locator('.es-forge-run').boundingBox()
    expect(slip!.y).toBeLessThan(tape!.y)
    expect(tape!.y).toBeLessThan(checks!.y)
    expect(tape!.y + tape!.height).toBeLessThanOrEqual(checks!.y)
  })

  test('on a laptop the tape stands beside the slip and the checks, and stays in view as the checks scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/labs/toy')
    await drop(page, 'fifo')
    await finished(page)
    const slip = await page.locator('.es-forge-slip').boundingBox()
    const tape = await page.locator('.es-forge-tape').boundingBox()
    const checks = await page.locator('.es-forge-run').boundingBox()
    expect(tape!.x, 'beside the slip').toBeGreaterThanOrEqual(slip!.x + slip!.width)
    expect(tape!.x, 'beside the checks').toBeGreaterThanOrEqual(checks!.x + checks!.width)
    await page.evaluate(() => window.scrollTo(0, 700))
    const held = await page.locator('.es-forge-tape').boundingBox()
    expect(held!.y, 'held in place under the board').toBeGreaterThanOrEqual(0)
    expect(held!.y).toBeLessThan(120)
  })

  test('the filament while a file is over the slip hugs the slip\'s paper', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/labs/toy')
    const zone = await page.locator('.es-forge-drop').boundingBox()
    const paper = await page.locator('.es-forge-drop .es-ticket').boundingBox()
    expect(zone!.width).toBeCloseTo(paper!.width, 0)
  })
})

test.describe('a solved module', () => {
  test('passes all five checks on fresh seeds, names the file by its SHA-256, and is written to the ledger with the seeds', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'solved')
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])

    // The file, by its hash: on the slip, in full, and on the tape.
    await expect(page.locator('.es-forge-hash__digits')).toHaveText(sha256('solved'))
    await expect(page.locator('.es-printer')).toContainText(`${sha256('solved').slice(0, 12)}…`)
    await expect(page.locator('.es-printer')).toContainText('seed · churn')
    await expect(page.locator('.es-forge-check').last()).toContainText('drawn when the run began')

    // Nothing is red, so the lamp is not on a check; the slip has lost it.
    await expect(page.locator('.es-forge-check[data-lamp]')).toHaveCount(0)
    await wrote(page)
    await expect(page.locator('.es-forge-recorded')).toContainText('Written to your ledger on this device')

    const events = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ ref: 'lab:toy', ok: true, score: 1, provenance: 'unseen' })
    expect(events[0].data.wasmSha256).toBe(sha256('solved'))
    expect(events[0].data.seeds).toHaveLength(1)
    expect(events[0].data.checks.map((check) => `${check.id} ${check.status}`)).toEqual(['fill pass', 'hits pass', 'dump pass', 'recency pass', 'churn pass'])
    expect(events[0].data.checks[4].seed).toBe(events[0].data.seeds[0])
  })

  test('is graded on another seed when the run is pulled again, and each run is its own record', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'solved')
    await finished(page)
    await wrote(page)
    const first = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(first).toHaveLength(1)

    await page.getByRole('button', { name: 'Run on new seeds' }).click()
    await expect.poll(async () => (await ledger(page)).filter((event) => event.kind === 'lab-check').length, { timeout: 30_000 }).toBe(2)
    const events = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(new Set(events.map((event) => event.data.seeds[0])).size).toBe(2)
    expect(events.every((event) => event.data.wasmSha256 === sha256('solved'))).toBe(true)
  })
})

test.describe('a reference build', () => {
  test('passes, says toy@reference: no credit, and writes nothing', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'reference')
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    await expect(page.getByText('toy@reference: no credit').first()).toBeVisible()
    await expect(page.locator('.es-printer')).toContainText('toy@reference')
    await expect(page.locator('.es-printer')).toContainText('no credit')
    // The slip is the voided ticket: the sentence is printed on it.
    await expect(page.locator('.es-forge-drop .es-ticket__void')).toContainText('toy@reference: no credit')
    await expect(page.getByRole('button', { name: 'Run on new seeds' })).toBeVisible()
    await quiet(page)
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toEqual([])
  })
})

test.describe('a wrong module', () => {
  test('fails the checks it is named for, puts the lamp on the first, and is written as a red run', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'fifo')
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'fail', 'pass', 'fail', 'fail'])

    const lamp = page.locator('.es-forge-check[data-lamp]')
    await expect(lamp).toHaveCount(1)
    await expect(lamp).toContainText('a held key is a hit and goes to the back')
    await expect(lamp).toContainText('order should answer "2,3,1", and the module answered "1,2,3"')
    await expect(lamp).toContainText('Catches:')
    await wrote(page)

    const events = (await ledger(page)).filter((event) => event.kind === 'lab-check')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ ok: false, score: 0.4, provenance: 'unseen' })
    expect(events[0].data.checks.map((check) => check.status)).toEqual(['pass', 'fail', 'pass', 'fail', 'fail'])
  })

  test('can be told on the same seeds again: the same failure, the same seed, and no new record', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'fifo')
    await finished(page)
    await wrote(page)
    const seed = (await page.locator('.es-forge-check').last().locator('.es-forge-seed').first().innerText()).trim()
    const message = await page.locator('.es-forge-check').last().locator('.es-forge-check__msg').innerText()

    await page.getByRole('button', { name: 'Tell these seeds again' }).click()
    await expect(page.locator('.es-forge-check').last()).toContainText('told again', { timeout: 30_000 })
    expect((await page.locator('.es-forge-check').last().locator('.es-forge-seed').first().innerText()).trim()).toBe(seed)
    expect(await page.locator('.es-forge-check').last().locator('.es-forge-check__msg').innerText()).toBe(message)
    await expect(page.locator('.es-forge-recorded')).toContainText('Not recorded: these are seeds you have seen already')
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toHaveLength(1)
  })
})

test.describe('limits', () => {
  test('an infinite loop is stopped at the limit of its check, the page stays alive, and the next check runs', async ({ page }) => {
    await open(page, '/labs/toy')
    const started = Date.now()
    await drop(page, 'spin')
    // While the module spins in its worker, the page still answers: the text of the running check is on the page.
    await expect(page.locator('.es-forge-check[data-state="running"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.es-forge-check[data-status="timeout"]')).toHaveCount(3, { timeout: 30_000 })
    await finished(page)
    const spent = Date.now() - started
    expect(await statusOf(page)).toEqual(['pass', 'timeout', 'pass', 'timeout', 'timeout'])
    // Three checks stopped at 2 s each, and the rest of the run in between.
    expect(spent).toBeGreaterThanOrEqual(6000)
    await expect(page.locator('.es-forge-check[data-status="timeout"]').first()).toContainText('was still running after 2 s')
    await expect(page.locator('.es-forge-check[data-lamp]')).toContainText('a held key is a hit and goes to the back')
  })

  test('a learner who leaves in the middle of a run writes nothing: the run is abandoned, and its worker with it', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'spin')
    await expect(page.locator('.es-forge-check[data-state="running"]')).toBeVisible({ timeout: 15_000 })
    // By the router, as a learner goes: the page unmounts while the module is in its worker.
    await page.getByRole('link', { name: 'Map' }).click()
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('The Rotation')
    // The run would have ended by now, and recorded itself, if nothing had stopped it.
    await page.waitForTimeout(7000)
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toEqual([])
  })

  test('an unfinished module traps in every check, with the words of its todo!() and the file and line', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'template')
    await finished(page)
    expect(await statusOf(page)).toEqual(['trap', 'trap', 'trap', 'trap', 'trap'])
    await expect(rows(page).first()).toContainText('not implemented yet: build the rotation')
    await expect(rows(page).first()).toContainText('toy/src/rotation.rs')
  })
})

test.describe('a file that is not a lab module', () => {
  const refuse = async (page: Page, file: { name: string; mimeType: string; buffer: Buffer }, reason: RegExp) => {
    await page.locator('input[type="file"]').setInputFiles(file)
    await expect(page.getByRole('heading', { name: 'Not graded' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.es-ticket__void')).toContainText(reason)
    await expect(page.getByRole('button', { name: 'Choose another file' })).toBeVisible()
    expect(await statusOf(page)).toEqual(['not run', 'not run', 'not run', 'not run', 'not run'])
    await quiet(page)
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toEqual([])
  }

  test('a text file is refused before any worker sees it', async ({ page }) => {
    await open(page, '/labs/toy')
    await refuse(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fn main() {}') }, /does not begin with \\0asm/)
  })

  test('another lab\'s module is refused by name, with its hash', async ({ page }) => {
    await open(page, '/labs/toy')
    await refuse(page, { name: 'other.wasm', mimeType: 'application/wasm', buffer: Buffer.from(buildLabModule({ lab: 'hybrid-kv' })) }, /is the "hybrid-kv" lab's, and this page grades "toy"/)
    await expect(page.locator('.es-forge-hash__digits')).toHaveText(/^[0-9a-f]{64}$/)
  })

  test('a module with an import is refused by the import\'s name', async ({ page }) => {
    await open(page, '/labs/toy')
    await refuse(page, { name: 'bindgen.wasm', mimeType: 'application/wasm', buffer: Buffer.from(buildLabModule({ imports: true })) }, /imports env\.host_call/)
  })

  test('a refusal does not stop the next file from being graded', async ({ page }) => {
    await open(page, '/labs/toy')
    await refuse(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') }, /does not begin with/)
    await drop(page, 'solved')
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
  })
})

test.describe('how a file arrives', () => {
  test('a file dropped on the slip is graded as a chosen one is, and the slip shows the filament while it is over it', async ({ page }) => {
    await open(page, '/labs/toy')
    const zone = page.locator('.es-forge-drop')
    const dataTransfer = await page.evaluateHandle((bytes) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array(bytes)], 'toy.wasm', { type: 'application/wasm' }))
      return transfer
    }, [...readFileSync(fixture('solved'))])
    await zone.dispatchEvent('dragover', { dataTransfer })
    await expect(zone).toHaveAttribute('data-over', 'true')
    await zone.dispatchEvent('dragleave', { dataTransfer })
    await expect(zone).not.toHaveAttribute('data-over')
    await zone.dispatchEvent('drop', { dataTransfer })
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    await expect(page.locator('.es-forge-file__name')).toHaveText('toy.wasm')
  })

  test('the keyboard reaches the file chooser: Tab to Choose a file, Enter opens it', async ({ page }) => {
    await open(page, '/labs/toy')
    const choose = page.getByRole('button', { name: 'Choose a file' })
    await choose.focus()
    await expect(choose).toBeFocused()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    const picked = await chooser
    await picked.setFiles(fixture('solved'))
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
  })

  test('a second file replaces the first: the same name, rebuilt, is graded again', async ({ page }) => {
    await open(page, '/labs/toy')
    await drop(page, 'fifo')
    await finished(page)
    expect(await statusOf(page)).toEqual(['pass', 'fail', 'pass', 'fail', 'fail'])
    await drop(page, 'solved')
    await expect.poll(() => statusOf(page), { timeout: 30_000 }).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    await expect(page.locator('.es-forge-hash__digits')).toHaveText(sha256('solved'))
  })
})
