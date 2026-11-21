/*
 * W2b-T30: a graded lab's page (src/labs/GradedLabView.tsx) in a real browser, on the specimen that a test build draws at /labs/tr0.forward
 * (src/labs/specimen.ts). A production build has no lab of lane L or F published yet and draws the stub there, so the spec builds the app
 * once with `VITE_ES_TEST_HOOKS=1`, as e2e/trace-view.spec.ts does, and answers every request from that build with `context.route`. A
 * request to any other origin fails the test (ARCHITECTURE §1, I1), and so does an error the page throws or logs.
 *
 *   1. axe finds nothing serious or critical at 320, 360 and 1280 px, with the disclosures shut and open.
 *   2. REDESIGN 5.2's checks for a screen: no sideways scroll and no text past the edge at 320, 360 and 390; nothing sticky at 844 x 390
 *      and at 320 x 256; at most one amber fill in any viewport; no banned word and no build-log id.
 *   3. The kit's two files are linked under their own names with the size and SHA-256 of public/labs/manifest.json, and the bytes behind
 *      each link are those.
 *   4. Every command copies by mouse and by keyboard, and where the browser refuses, the line is selected instead.
 *   5. The list of stages stands beside the steps on a laptop and stays in view as they scroll; it covers no focused control, and on a phone
 *      it is not drawn, since each stage's state is in the step that runs it.
 *   6. Under reduced motion nothing on the page has a transition or an animation that runs.
 *
 *   npx playwright test e2e/lab-page.spec.ts --workers=2
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import { SPECIMENS } from '../src/labs/specimen'
import { amberByScroll, copyProblems, stuck } from './support/screens'
import { clipped } from './support/site'

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4178'
const ROUTE = '/labs/tr0.forward'
const LAB = SPECIMENS['tr0.forward']
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
  '.whl': 'application/zip',
}
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

interface ManifestFile {
  name: string
  kind: string
  bytes: number
  sha256: string
}
const manifest = JSON.parse(readFileSync(path.join(root, 'public/labs/manifest.json'), 'utf8')) as { files: ManifestFile[] }
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

let dist = ''

base.use({
  launchOptions: { executablePath: process.env.ES_CHROMIUM || undefined, args: ['--font-render-hinting=none'] },
  viewport: { width: 1280, height: 800 },
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
})

base.beforeAll(async () => {
  base.setTimeout(300_000)
  dist = mkdtempSync(path.join(tmpdir(), 'es-lab-page-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
})

base.afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true })
})

/** Each test serves the build itself, and fails on a request that leaves the origin and on any error the page throws or logs. */
const test = base.extend<{ served: void }>({
  served: [
    async ({ context, page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`)
      })
      const strays: string[] = []
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin !== ORIGIN) {
          strays.push(url.href)
          return route.abort()
        }
        let file = path.join(dist, decodeURIComponent(url.pathname))
        if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html')
        return route.fulfill({ body: readFileSync(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' })
      })
      await use()
      expect(strays, 'requests that left the origin').toEqual([])
      expect(errors, 'errors on the page').toEqual([])
    },
    { auto: true },
  ],
})

async function open(page: Page): Promise<void> {
  await page.goto(`${ORIGIN}${ROUTE}`)
  await page.locator('[data-page="graded-lab"]').waitFor({ timeout: 30_000 })
  // The kit's sizes and hashes arrive with the list of files.
  await expect(page.locator('[data-kit-sha256]')).toHaveCount(LAB.kit.length)
  await page.evaluate(() => document.fonts.ready)
}

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

test.describe('the graded lab page', () => {
  for (const width of [320, 360, 1280]) {
    test(`axe finds nothing serious at ${width} px, with the disclosures shut and open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await open(page)
      await audit(page, `${width} px`)
      for (const summary of await page.getByText('Check the download', { exact: true }).all()) await summary.click()
      await audit(page, `${width} px, open`)
    })
  }

  test("holds REDESIGN 5.2's checks for a screen", async ({ page }) => {
    const found: string[] = []
    const note = (check: string, problems: readonly string[]) => void found.push(...problems.map((problem) => `${check}: ${problem}`))
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page)
    note('copy at 1440', await copyProblems(page))
    note('amber at 1440', await amberByScroll(page))
    await page.setViewportSize({ width: 390, height: 844 })
    note('copy at 390', await copyProblems(page))
    note('amber at 390', await amberByScroll(page))
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 800 })
      const edge = await clipped(page)
      note(`sideways scroll at ${width}`, edge.scrolls > 0 ? [`the page is ${edge.scrolls} px wider than the viewport`] : [])
      note(`text past the edge at ${width}`, edge.text)
    }
    for (const size of [
      { width: 844, height: 390 },
      { width: 320, height: 256 },
    ]) {
      await page.setViewportSize(size)
      note(`sticky at ${size.width} x ${size.height}`, await stuck(page))
    }
    expect(found).toEqual([])
  })

  test("links the kit's files under their own names, with the manifest's size and SHA-256, and the bytes behind each link are those", async ({ page }) => {
    await open(page)
    for (const ref of LAB.kit) {
      const file = manifest.files.find((entry) => entry.kind === ref.kind)!
      const block = page.locator(`[data-kit-file="${file.name}"]`)
      const link = block.getByRole('link', { name: file.name, exact: true })
      await expect(link).toHaveAttribute('href', `/labs/${file.name}`)
      await expect(block.locator('data.es-readout__value')).toHaveAttribute('value', String(file.bytes))
      await expect(block.locator('[data-kit-sha256]')).toHaveText(file.sha256)
      // Fetched by the page, so the request is answered from the build as the link's would be.
      const fetched = await page.evaluate(async (href) => {
        const response = await fetch(href)
        const bytes = new Uint8Array(await response.arrayBuffer())
        return { status: response.status, bytes: [...bytes] }
      }, `/labs/${file.name}`)
      expect(fetched.status).toBe(200)
      expect(fetched.bytes.length).toBe(file.bytes)
      expect(sha256(Uint8Array.from(fetched.bytes))).toBe(file.sha256)
    }
  })

  test('copies each command by mouse and by keyboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open(page)
    const commands = [...LAB.inputs, ...LAB.stages.map((stage) => stage.run)]
    const buttons = page.locator('.es-glab-steps button.es-glab-cmd__copy:visible')
    await expect(buttons).toHaveCount(commands.length)
    for (const [at, command] of commands.entries()) {
      const button = buttons.nth(at)
      await button.click()
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(command.line)
      await page.evaluate(() => navigator.clipboard.writeText(''))
      await button.focus()
      await page.keyboard.press('Enter')
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(command.line)
      // The line under the button says so, for a reader and for the eye.
      await expect(page.locator('.es-glab-steps .es-glab-cmd:visible').nth(at).locator('.es-glab-cmd__said')).toHaveText('Copied.')
    }
  })

  test('selects the line when the browser will not copy it', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('refused')) }, configurable: true })
    })
    await page.locator('.es-glab-steps button.es-glab-cmd__copy:visible').first().click()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(LAB.inputs[0].line)
    await expect(page.locator('.es-glab-cmd__said').filter({ hasText: 'The browser would not copy' })).toHaveCount(1)
  })

  test('holds the list of stages beside the steps on a laptop, covering no focused control, and leaves it out on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await open(page)
    const aside = page.locator('aside.es-glab-stages')
    await expect(aside).toBeVisible()
    for (const stage of LAB.stages) await expect(aside.locator(`a[href="/receipts?stage=${stage.id}"]`)).toHaveCount(1)
    // Tab through the page: no focused control lies under the list, and the list is still in view at the foot of the steps.
    const covered: string[] = []
    for (let presses = 0; presses < 60; presses++) {
      await page.keyboard.press('Tab')
      const hit = await page.evaluate(() => {
        const active = document.activeElement
        if (active === null || active === document.body || active.closest('aside.es-glab-stages') !== null) return null
        const box = active.getBoundingClientRect()
        const list = document.querySelector('aside.es-glab-stages')!.getBoundingClientRect()
        const overlaps = box.right > list.left && box.left < list.right && box.bottom > list.top && box.top < list.bottom
        return overlaps ? (active.textContent ?? '').trim().slice(0, 40) : null
      })
      if (hit !== null) covered.push(hit)
    }
    expect(covered).toEqual([])
    await page.locator('[data-step-id="prove"]').scrollIntoViewIfNeeded()
    const box = await aside.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeLessThan(800)

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(aside).toBeHidden()
    // Each stage's state is in the step that runs it.
    await expect(page.locator('[data-step-id="run"] .es-glab-state')).toHaveCount(LAB.stages.length)
  })

  test('runs no transition or animation under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page)
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('[data-page="graded-lab"] *')].flatMap((element) => {
        const style = getComputedStyle(element)
        const durations = [...style.transitionDuration.split(','), ...style.animationDuration.split(',')].map((value) => Number.parseFloat(value))
        return durations.some((value) => value > 0.01) ? [`${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]}`] : []
      }),
    )
    expect([...new Set(moving)]).toEqual([])
  })
})
