/*
 * W1b-T08, in a real browser: each forge lab's page hands over its crate, and the `hybrid-kv` page shows the slot readout of TR5a §5. The
 * pieces are held without a browser in tests/forge/crate.test.ts, slot-night.test.ts and readout-view.test.ts; this spec fetches what the page
 * links and drives the page as a learner does.
 *
 *   1. Every file of public/labs/manifest.json is linked from its lab's page, under its own name, and the bytes behind the link are the
 *      size and the SHA-256 that the manifest, and the page beside the link, give: fetched, and downloaded by a click.
 *   2. The page gives the hash as a line to copy. The plate copies it, or selects it where the browser will not copy, and the line, run in
 *      a shell over the zip that the click downloaded, prints OK.
 *   3. The chooser stays where it was, in a phone's first screen, and the crate stands under it; the page reflows to 320 px and axe finds
 *      nothing serious at 360 and 1280 px, before a file and after a run with the readout on it.
 *   4. The readout of the `hybrid-kv` page plays the night on a module that has passed the adapter stage, prints the sim's figures, holds
 *      the page while it plays, and is never written to the ledger. A module that has not passed the stage gets no night.
 *
 *   npx playwright test e2e/lab-kits.spec.ts
 */
import AxeBuilder from '@axe-core/playwright'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { slotNight } from '../packages/sim/forge/slot-night'
import { clipped, expect, open, quiet, test } from './support/site'

const root = path.resolve(import.meta.dirname, '..')
const FIXTURES = path.join(root, 'tests/fixtures/forge/hybrid-kv')

interface ManifestFile {
  name: string
  kind: string
  lab?: string
  bytes: number
  sha256: string
}
const manifest = JSON.parse(readFileSync(path.join(root, 'public/labs/manifest.json'), 'utf8')) as { files: ManifestFile[] }
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const hasSha256sum = spawnSync('sh', ['-c', 'command -v sha256sum']).status === 0

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

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

interface Stored {
  kind: string
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

test.describe('every file in the manifest is linked from its lab page', () => {
  test('the manifest lists forge labs and nothing else, so that a file of another kind must be given its page and its row here', () => {
    expect(manifest.files.map((file) => file.kind)).toEqual(manifest.files.map(() => 'forge-lab'))
    expect(manifest.files.length).toBeGreaterThanOrEqual(3)
  })

  for (const file of manifest.files) {
    test(`${file.name}: linked from /labs/${file.lab} with its size and hash, and the bytes behind the link are the manifest's, fetched and downloaded`, async ({ page }) => {
      await open(page, `/labs/${file.lab}`)
      const link = page.getByRole('link', { name: file.name, exact: true })
      await expect(link).toHaveCount(1)
      await expect(link).toHaveAttribute('href', `/labs/${file.name}`)

      // Beside the link, the size and the SHA-256 of the manifest.
      await expect(page.locator('.es-forge-crate data.es-readout__value')).toHaveAttribute('value', String(file.bytes))
      await expect(page.locator('.es-forge-crate__digits')).toHaveText(file.sha256)

      // The bytes behind the link, fetched.
      const response = await page.request.get(`/labs/${file.name}`)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toMatch(/zip/)
      const body = await response.body()
      expect(body.length).toBe(file.bytes)
      expect(sha256(body)).toBe(file.sha256)

      // And the bytes a click downloads.
      const downloading = page.waitForEvent('download')
      await link.click()
      const download = await downloading
      expect(download.suggestedFilename()).toBe(file.name)
      const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-kit-'))
      try {
        const saved = path.join(dir, file.name)
        await download.saveAs(saved)
        const bytes = readFileSync(saved)
        expect(bytes.length).toBe(file.bytes)
        expect(sha256(bytes)).toBe(file.sha256)

        // The line on the page, run where the zip was saved, says OK.
        const line = await page.locator('[data-check-line]').innerText()
        expect(line).toBe(`echo '${file.sha256}  ${file.name}' | sha256sum -c`)
        if (hasSha256sum) {
          const run = spawnSync('sh', ['-c', line], { cwd: dir, encoding: 'utf8' })
          expect(run.status).toBe(0)
          expect(run.stdout.trim()).toBe(`${file.name}: OK`)
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }
})

test.describe('the line to copy', () => {
  test('the plate copies the line, and where the browser refuses it selects the line for the learner to copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page, '/labs/hybrid-kv')
    const line = await page.locator('[data-check-line]').innerText()
    const copy = page.getByRole('button', { name: 'Copy the line' })
    await copy.click()
    await expect(page.locator('.es-forge-crate [role="status"]')).toHaveText('Copied.')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(line)

    // A browser that will not copy (a page that is not secure, or a refusal): the line is selected, and the page says what to press.
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges()
      navigator.clipboard.writeText = () => Promise.reject(new DOMException('refused', 'NotAllowedError'))
    })
    await copy.click()
    await expect(page.locator('.es-forge-crate [role="status"]')).toHaveText('Selected: press Ctrl+C (Cmd+C on a Mac) to copy it.')
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(line)
  })

  test('the plate is a button that the keyboard reaches', async ({ page }) => {
    await open(page, '/labs/toy')
    const copy = page.getByRole('button', { name: 'Copy the line' })
    await copy.focus()
    await expect(copy).toBeFocused()
  })
})

test.describe('where the crate stands', () => {
  for (const id of ['toy', 'rejection-sampler', 'hybrid-kv']) {
    test(`/labs/${id}: on a phone the crate is under the chooser, and the page reflows to 320 px with no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await open(page, `/labs/${id}`)
      await quiet(page)
      const choose = await page.getByRole('button', { name: 'Choose a file' }).boundingBox()
      const crate = await page.locator('.es-forge-crate').boundingBox()
      expect(choose!.y + choose!.height, 'the chooser is above the crate').toBeLessThanOrEqual(crate!.y)
      if (id === 'toy') expect(choose!.y + choose!.height, 'and the toy lab\'s chooser is still in the first screen').toBeLessThanOrEqual(844)

      await page.setViewportSize({ width: 320, height: 900 })
      await quiet(page)
      expect(await clipped(page, 'main')).toEqual({ scrolls: 0, text: [] })
    })

    for (const width of [360, 1280]) {
      test(`/labs/${id} at ${width} px: axe finds nothing serious before a file`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await open(page, `/labs/${id}`)
        await quiet(page)
        await audit(page, `/labs/${id} at ${width} px`)
      })
    }
  }

  test('on a laptop the crate stands under the slip in the slip\'s column, and the tape beside both', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/labs/hybrid-kv')
    const slip = await page.locator('.es-forge-drop .es-ticket').boundingBox()
    const crate = await page.locator('.es-forge-crate').boundingBox()
    const tape = await page.locator('.es-forge-tape').boundingBox()
    expect(crate!.x).toBeCloseTo(slip!.x, 0)
    expect(crate!.y).toBeGreaterThanOrEqual(slip!.y + slip!.height)
    expect(tape!.x).toBeGreaterThanOrEqual(slip!.x + slip!.width)
    expect(tape!.x).toBeGreaterThanOrEqual(crate!.x + crate!.width)
  })

  test('when the manifest cannot be read, the page still links the zip and says what it cannot print', async ({ page }) => {
    await page.route('**/labs/manifest.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'this is not a manifest' }))
    await open(page, '/labs/toy')
    await expect(page.getByRole('link', { name: 'enginespace-toy.zip', exact: true })).toHaveAttribute('href', '/labs/enginespace-toy.zip')
    await expect(page.locator('.es-forge-crate')).toContainText('could not be read from labs/manifest.json')
    await expect(page.locator('.es-forge-crate__digits')).toHaveCount(0)
    await expect(page.locator('[data-check-line]')).toHaveCount(0)
  })

  test('the crate goes once a module is accepted, and comes back with a refusal', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await expect(page.locator('.es-forge-crate')).toHaveCount(1)
    await page.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not wasm') })
    await expect(page.getByRole('heading', { name: 'Not graded' })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.es-forge-crate')).toHaveCount(1)
    await page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, 'solved.wasm'))
    await expect(page.locator('.es-forge-check[data-state="result"]')).toHaveCount(6, { timeout: 60_000 })
    await expect(page.locator('.es-forge-crate')).toHaveCount(0)
  })
})

test.describe('the slot readout of the hybrid-kv page', () => {
  const night = slotNight()
  const expected = [[night.pool.admitted, night.pool.loads], ...night.slots.map((slots) => [slots.row.admitted, slots.row.loads])]
  const drop = (page: Page, name: string) => page.locator('input[type="file"]').setInputFiles(path.join(FIXTURES, `${name}.wasm`))
  const finished = (page: Page) => expect(page.locator('.es-forge-check[data-state="result"]')).toHaveCount(6, { timeout: 60_000 })
  const rows = (page: Page) =>
    page.locator('.es-forge-readout tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('data.es-readout__value')].map((data) => Number(data.getAttribute('value')))))

  test('before a file it says what it is and when it comes, and has nothing to print', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await expect(page.getByRole('heading', { name: 'Measured against the slots' })).toBeVisible()
    await expect(page.locator('.es-forge-readout')).toContainText('Once check 5 (adapters take pages of the same pool) passes')
    await expect(page.locator('.es-forge-readout table')).toHaveCount(0)
    await expect(page.locator('[data-lamp]')).toHaveCount(1)
  })

  test('a solved module is measured as the pool: the sim\'s figures, for your module and for each count of slots, and nothing of it is recorded', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'solved')
    await finished(page)
    await expect(page.locator('.es-forge-readout')).toHaveAttribute('data-readout', 'ready', { timeout: 30_000 })
    expect(await rows(page)).toEqual(expected)
    await expect(page.locator('.es-forge-readout tbody th')).toContainText(['Your module', 'One slot', 'Two slots'])
    await expect(page.locator('.es-forge-readout tbody th').nth(1)).toContainText("vLLM's default at the pin, outside the pool")
    await expect(page.locator('.es-forge-readout [data-readout-differs]')).toHaveCount(0)
    await expect(page.locator('.es-forge-readout [role="status"]')).toContainText(`of ${night.arrivals} requests, your module admitted ${night.pool.admitted}`)
    // The run is written, once; the night is not.
    await expect(page.locator('.es-forge-recorded')).toContainText('Written to your ledger', { timeout: 15_000 })
    expect((await ledger(page)).filter((event) => event.kind === 'lab-check')).toHaveLength(1)
  })

  test('a module that passes the adapter stage and fails others is measured too, and one that fails the stage gets no night', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'window-off-by-one')
    await finished(page)
    await expect(page.locator('.es-forge-readout')).toHaveAttribute('data-readout', 'ready', { timeout: 30_000 })
    expect(await rows(page)).toEqual(expected)

    await drop(page, 'double-counted')
    await expect(page.locator('.es-forge-readout')).not.toHaveAttribute('data-readout', 'ready', { timeout: 30_000 })
    await finished(page)
    await expect(page.locator('.es-forge-readout')).toContainText('This run did not pass check 5, so there is no night to play yet.')
    await expect(page.locator('.es-forge-readout table')).toHaveCount(0)
  })

  test('a template that traps in every check gets no night', async ({ page }) => {
    await open(page, '/labs/hybrid-kv')
    await drop(page, 'template')
    await finished(page)
    await expect(page.locator('.es-forge-readout')).toContainText('This run did not pass check 5')
  })

  for (const width of [320, 360, 1280]) {
    test(`at ${width} px the readout reflows, and axe finds nothing serious after a run that has it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/labs/hybrid-kv')
      await drop(page, 'solved')
      await finished(page)
      await expect(page.locator('.es-forge-readout')).toHaveAttribute('data-readout', 'ready', { timeout: 30_000 })
      await quiet(page)
      expect(await clipped(page, 'main')).toEqual({ scrolls: 0, text: [] })
      if (width >= 360) await audit(page, `/labs/hybrid-kv at ${width} px, with the readout`)
    })
  }
})
