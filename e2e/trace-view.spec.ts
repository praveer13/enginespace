/*
 * W1-T09's acceptance checks for the trace viewer, in Playwright's Chromium, on the Trace Room's specimen tape:
 *
 *   1. Panning 100k spans holds at least 30 fps on the dev host. The frame rate is measured here and printed.
 *   2. Every action works from the keyboard.
 *   3. axe is clean.
 *
 * And what the other two stand on: the tape draws nothing while nothing changes (so reduced motion has no frame to cut), the page
 * does not scroll sideways on a phone, and a mark leaves the viewer in the shape of a `trace-mark` event's data.
 *
 * How it runs. The spec builds the app once with `VITE_ES_TEST_HOOKS=1`, a test build: it exposes `window.__esTrace`, which counts the
 * frames the canvas draws and what each cost, and which takes the viewer's commands (src/trace/test-hook.ts), and it lets the
 * specimen's address carry `?spans=<n>` for a tape of that many spans (src/trace/SpecimenPage.tsx). Every request is answered from
 * that build by `context.route`, so no server runs, and a request to any other origin fails the test (ARCHITECTURE §1, I1).
 *
 *   npx playwright test e2e/trace-view.spec.ts --workers=2
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { build } from 'vite'
import { attribute, stepWindows } from '@es/sim/trace'
import { TRACE_KEYS } from '../src/trace/keys'
import { stretchesOf } from '../src/trace/list'
import type { Category } from '../src/trace/marks'
import { specimenTrace } from '../src/trace/specimen'
import type { TraceProbe } from '../src/trace/test-hook'
import { bannedOn } from './support/copy-scan'
import { KEPT_LESSON, KEPT_TRACE, serveKeptLesson } from './support/kept-blocks'
import { ledgerEvents } from './support/lessons'

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4177'
const SPECIMEN = '/trace-room/synthetic-7'
const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
}

let dist = ''

// No `--use-angle=swiftshader` here, unlike the specs of the 3D scenes: the tape is a 2D canvas, and with that flag Chromium rasterises it
// through a software GL stack. [measured 2026-11-04 on W1-T09 over wave-1 5ffa2f9, in Chrome for Testing 153.0.8010.12 (the headless
// shell), at a load average of 8.5 on 20 cores: 90 frames of a pan over 100,000 spans took 6.70 s with the flag (13.6 fps) and 1.57 s
// without it (57.5 fps), and the canvas's own JavaScript cost 0.5 ms at p95 in both.] Font hinting stays off so that glyphs do not
// differ from one machine to the next.
base.use({
  launchOptions: { executablePath: process.env.ES_CHROMIUM || undefined, args: ['--font-render-hinting=none'] },
  viewport: { width: 1280, height: 900 },
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-trace-view-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
})

base.afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true })
})

/** Each test serves the build itself, and fails on a request that leaves the origin and on any error the page throws or logs. */
const test = base.extend<{ requests: string[] }>({
  requests: [
    async ({ context, page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`)
      })
      const requests: string[] = []
      const strays: string[] = []
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url())
        if (url.origin !== ORIGIN) {
          strays.push(url.href)
          return route.abort()
        }
        requests.push(url.pathname)
        let file = path.join(dist, decodeURIComponent(url.pathname))
        if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html')
        return route.fulfill({ body: readFileSync(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' })
      })
      await use(requests)
      expect(strays, 'requests that left the origin').toEqual([])
      expect(errors, 'errors on the page').toEqual([])
    },
    { auto: true },
  ],
})

// ---------------------------------------------------------------------------------------------------------------------------
// Helpers

const viewer = (page: Page) => page.locator('[data-trace-view]')
const probe = <T,>(page: Page, read: (p: TraceProbe) => T): Promise<T> => page.evaluate(`(${read.toString()})(window.__esTrace)`) as Promise<T>

async function open(page: Page, address = SPECIMEN): Promise<void> {
  await page.goto(`${ORIGIN}${address}`)
  // Below the narrow breakpoint the specimen opens as a list (W2b-T101): these tests are the lanes', so they ask for the lanes.
  await lanesOnPhone(page)
  await viewer(page).waitFor({ state: 'attached', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => (window.__esTrace?.draws() ?? 0) > 0, null, { timeout: 30_000 })
}

/** On a phone, a trace opens as a list with a switch to the lanes: this presses the switch. At a desk there is no switch, and nothing is pressed. */
async function lanesOnPhone(page: Page): Promise<void> {
  const narrow = await page.evaluate(() => window.matchMedia('(max-width: 47.999rem)').matches)
  if (narrow) await page.locator('[data-trace-mode="lanes"]').click({ timeout: 30_000 })
}

const windowOf = (page: Page) => probe(page, (p) => p.window())
/** The window's length in ns. */
const spanOf = async (page: Page) => {
  const win = await windowOf(page)
  return win.toNs - win.fromNs
}
const cursorRow = (page: Page) => viewer(page).locator('tr[data-cursor-row]')
const cursorName = async (page: Page) => (await cursorRow(page).locator('button[data-row-button]').innerText()).replace(/, cursor on its (start|end)$/, '').trim()
const stepText = async (page: Page) => (await page.locator('[data-trace-window]').innerText()).replace(/\s+/g, ' ')
const exported = async (page: Page): Promise<unknown[]> => JSON.parse((await page.locator('[data-trace-json]').textContent()) ?? '[]') as unknown[]
const activeCommand = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-command') ?? null)
const press = (page: Page, key: string) => page.keyboard.press(key)

/** Tabs from the top of the document until focus is on the viewer's plate `command`. Nothing else is used to get there. */
async function tabTo(page: Page, command: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await press(page, 'Tab')
    if ((await activeCommand(page)) === command) return
  }
  throw new Error(`Tab never reached the "${command}" plate`)
}

async function settled(page: Page, ms = 400): Promise<void> {
  let before = -1
  await expect
    .poll(
      async () => {
        const now = await probe(page, (p) => p.draws())
        const still = now === before
        before = now
        return still
      },
      { intervals: [ms], timeout: 15_000 },
    )
    .toBe(true)
}

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Every action works from the keyboard

test.describe('the keyboard (accept 2)', () => {
  test('every plate is a key, and every key but the label field and the help are a plate', async ({ page }) => {
    await open(page)
    const plates = await viewer(page).locator('[data-trace-bar] [data-command]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-command') ?? ''))
    // `remove-back` is Backspace's way of pressing Remove, and the label field is where `label` goes.
    const keys = TRACE_KEYS.map((key) => key.id).filter((id) => id !== 'remove-back' && id !== 'label')
    expect([...plates].sort()).toEqual([...keys].sort())
    await expect(viewer(page).locator('[data-command="label"]')).toHaveCount(0) // there is no mark yet to write on
  })

  test('Tab reaches the plates, and the keys alone move the paper, walk the edges, make, tag, label and remove a mark, and name the cause', async ({ page }) => {
    await open(page)
    await tabTo(page, 'zoom-out')
    expect(await activeCommand(page)).toBe('zoom-out')

    // The window: zoom, pan, fit, and the bells.
    const length = await spanOf(page)
    await press(page, 'Equal')
    await expect.poll(() => spanOf(page)).toBeCloseTo(length / 2, -1)
    await press(page, 'Minus')
    await expect.poll(() => spanOf(page)).toBeCloseTo(length, -1)
    const from = (await windowOf(page)).fromNs
    await press(page, 'ArrowRight')
    await expect.poll(async () => (await windowOf(page)).fromNs - from).toBeCloseTo(length * 0.25, -1)
    await press(page, 'ArrowLeft')
    await expect.poll(async () => (await windowOf(page)).fromNs).toBe(from)
    await press(page, 'KeyA')
    await expect.poll(() => spanOf(page)).toBeGreaterThan(length * 2)
    await press(page, 'KeyF')
    await expect.poll(() => spanOf(page)).toBeLessThan(length * 2)
    const step = /Step (\d+) of (\d+)/.exec(await stepText(page))
    expect(step).not.toBeNull()
    await press(page, 'Shift+Period')
    await expect.poll(async () => Number(/Step (\d+)/.exec(await stepText(page))?.[1])).toBe(Number(step?.[1]) + 1)
    await press(page, 'Shift+Comma')
    await expect.poll(async () => Number(/Step (\d+)/.exec(await stepText(page))?.[1])).toBe(Number(step?.[1]))

    // The cursor: K and J walk the edges of a lane, and focus goes with the cursor to its row in the table.
    const here = await cursorName(page)
    const edge = await cursorRow(page).locator('button[data-row-button]').innerText()
    await press(page, 'KeyK')
    await expect.poll(async () => (await cursorRow(page).locator('button[data-row-button]').innerText()) !== edge).toBe(true)
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-row-button'))).toBe(true)
    await press(page, 'KeyJ')
    await expect.poll(() => cursorRow(page).locator('button[data-row-button]').innerText()).toBe(edge)
    expect(await cursorName(page)).toBe(here)
    await expect(viewer(page).locator('[data-live="line"]')).toContainText(/(Start|End) of /)

    // The table: the arrows move the cursor, Page Down goes to the next lane, Home and End to the ends.
    const lane = () => page.evaluate(() => document.activeElement?.getAttribute('data-lane') ?? '')
    const first = await lane()
    await press(page, 'PageDown')
    await expect.poll(lane).not.toBe(first)
    const second = await lane()
    await press(page, 'ArrowDown')
    await expect.poll(async () => await cursorName(page)).not.toBe('')
    await press(page, 'PageDown')
    await expect.poll(lane).not.toBe(second)
    await press(page, 'End')
    await expect(cursorRow(page).locator('button[data-row-button]')).toBeFocused()
    await press(page, 'Home')
    await expect.poll(lane).toBe(first)

    // Marking: M, a category, K, M. The kernel on the line, from its start to its end, tagged copy by a key.
    await press(page, 'PageDown')
    await press(page, 'PageDown')
    await press(page, 'KeyM')
    await expect(viewer(page).locator('[data-command="mark"]')).toContainText('Finish mark')
    await press(page, 'Digit1')
    await press(page, 'KeyK')
    await press(page, 'KeyM')
    await expect(viewer(page).locator('[data-command="mark"]')).toContainText(/^Mark$/)
    await expect(viewer(page).locator('[data-trace-marks] tbody tr')).toHaveCount(1)
    await expect(viewer(page).locator('[data-trace-marks] tbody tr').first()).toContainText('Kernel')
    await press(page, 'Digit2')
    await expect(viewer(page).locator('[data-trace-marks] tbody tr').first()).toContainText('Copy')
    await expect(viewer(page).locator('[data-live="line"]')).toContainText('Mark 1 is Copy')

    // A label, written in the field that L opens, and left with Enter.
    await press(page, 'KeyL')
    await expect(page.getByLabel('Label')).toBeFocused()
    await page.keyboard.type('hot line')
    await press(page, 'Enter')
    await expect(viewer(page)).toBeFocused()
    await expect(viewer(page).locator('[data-trace-marks] tbody tr').first()).toContainText('Mark 1: hot line')

    // The cause, and a second mark that is taken away again.
    await press(page, 'KeyX')
    await expect(viewer(page).locator('[data-cause]')).toBeVisible()
    await press(page, 'KeyM')
    // Two kernels that touch have one ns for the end of the first and the start of the next, so K twice is a whole kernel on.
    await press(page, 'KeyK')
    await press(page, 'KeyM')
    await expect(viewer(page).locator('[data-live="line"]')).toContainText('no length')
    await expect(viewer(page).locator('[data-command="mark"]')).toContainText('Finish mark')
    await press(page, 'KeyK')
    await press(page, 'KeyM')
    await expect(viewer(page).locator('[data-trace-marks] tbody tr')).toHaveCount(2)
    await press(page, 'Delete')
    await expect(viewer(page).locator('[data-trace-marks] tbody tr')).toHaveCount(1)

    // What leaves: the ranges in time order, and the cause, as the data of a trace-mark event.
    const marks = (await exported(page)) as { kind: string; category?: string; label?: string; fromNs?: number; toNs?: number; span?: number }[]
    expect(marks[0]).toMatchObject({ kind: 'range', category: 'copy', label: 'hot line' })
    expect((marks[0].toNs ?? 0) > (marks[0].fromNs ?? 0)).toBe(true)
    expect(marks.at(-1)).toMatchObject({ kind: 'cause' })
    expect(Number.isInteger(marks.at(-1)?.span)).toBe(true)

    // Escape lets go of a mark that is being made, and the help is one key away and gives focus back.
    await press(page, 'KeyM')
    await expect(viewer(page).locator('[data-command="mark"]')).toContainText('Finish mark')
    await press(page, 'Escape')
    await expect(viewer(page).locator('[data-command="mark"]')).toContainText(/^Mark$/)
    await press(page, 'Shift+Slash')
    await expect(page.getByRole('dialog', { name: 'Keyboard' })).toBeVisible()
    await press(page, 'Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // Focus is given back after the dialog has gone, on the next turn of the event loop.
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-trace-view]') !== null)).toBe(true)
  })

  test('the plates do what the keys do: a pointer reaches the same commands', async ({ page }) => {
    await open(page)
    const length = await spanOf(page)
    await viewer(page).locator('[data-command="zoom-in"]').click()
    await expect.poll(() => spanOf(page)).toBeCloseTo(length / 2, -1)
    await viewer(page).locator('[data-command="mark"]').click()
    await expect(viewer(page).locator('[data-command="mark"]')).toContainText('Finish mark')
    await viewer(page).locator('[data-command="category-kernel"]').click()
    await viewer(page).locator('[data-command="edge-next"]').click()
    await viewer(page).locator('[data-command="mark"]').click()
    await expect(viewer(page).locator('[data-trace-marks] tbody tr')).toHaveCount(1)
  })

  test('a click on the paper picks the span under it and the table follows, and a click where the line is dark picks nothing', async ({ page }) => {
    await open(page)
    const before = await cursorName(page)
    const tape = page.locator('[data-trace-tape]')
    const box = await tape.boundingBox()
    if (box === null) throw new Error('no tape')
    // The line's lane is the lowest of three. The window opens on a decode step, where the line is dark for the first of every
    // three tenths and more of it: a click there picks no span, and one over the forward at the right picks a kernel.
    const row = box.y + box.height - 40
    await page.mouse.click(box.x + box.width * 0.45, row)
    await page.waitForTimeout(300)
    expect(await cursorName(page)).toBe(before)
    await page.mouse.click(box.x + box.width * 0.85, row)
    await expect.poll(() => cursorName(page)).not.toBe(before)
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-row-button'))).toBe(true)
  })

  test('a drag across the paper pans it, and the wheel with Ctrl zooms about the pointer', async ({ page }) => {
    await open(page)
    const tape = page.locator('[data-trace-tape]')
    const box = await tape.boundingBox()
    if (box === null) throw new Error('no tape')
    const from = (await windowOf(page)).fromNs
    const length = await spanOf(page)
    // The paper's left edge is after the gutter: press on the paper, drag left, so the tape feeds on.
    const y = box.y + 20
    await page.mouse.move(box.x + box.width * 0.7, y)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, y, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await windowOf(page)).fromNs).toBeGreaterThan(from)
    expect(await spanOf(page)).toBe(length)
    await page.keyboard.down('Control')
    await page.mouse.move(box.x + box.width * 0.6, y)
    await page.mouse.wheel(0, -120)
    await page.keyboard.up('Control')
    await expect.poll(() => spanOf(page)).toBeLessThan(length)
  })

  test('the learner’s Game keys setting turns the keys off', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('es:settings', JSON.stringify({ 'settings:3d': true, 'settings:tier-cap': 3, 'settings:reduced-motion': 'system', 'settings:game-keys': false }))
    })
    await open(page)
    await tabTo(page, 'zoom-out')
    const length = await spanOf(page)
    await press(page, 'Equal')
    await page.waitForTimeout(300)
    expect(await spanOf(page)).toBe(length)
    await viewer(page).locator('[data-command="zoom-in"]').click()
    await expect.poll(() => spanOf(page)).toBeLessThan(length)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 3. axe is clean

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

async function audit(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(results.passes.length + results.violations.length, `${label}: the rules that axe ran`).toBeGreaterThan(20)
  const found = results.violations.map((violation) => `${violation.id} [${violation.impact}] ${violation.help}: ${violation.nodes.slice(0, 4).map((node) => node.target.join(' ')).join(' ; ')}`)
  console.log(`axe ${label}: ${results.passes.length + results.violations.length} rules, ${found.length === 0 ? 'no violation' : found.join(' | ')}`)
  expect(found, `${label}: violations of any impact`).toEqual([])
}

for (const width of [360, 1280]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    test(`axe finds no violation on the tape, with marks, a label and a cause on it (accept 3)`, async ({ page }) => {
      await open(page)
      await audit(page, `the tape at ${width} px, fresh`)
      // Marks on the tape, so that the rail, the marks ticket and the label field are on the page.
      await viewer(page).locator('[data-command="mark"]').click()
      await viewer(page).locator('[data-command="category-kernel"]').click()
      await viewer(page).locator('[data-command="edge-next"]').click()
      await viewer(page).locator('[data-command="mark"]').click()
      await viewer(page).locator('[data-command="cause"]').click()
      await page.getByLabel('Label').fill('the cause')
      await settled(page)
      await audit(page, `the tape at ${width} px, with a mark`)
      // The span table with every lane's spans listed, and the help dialog.
      await viewer(page).getByRole('button', { name: /^List \d+ spans of/ }).first().click()
      await audit(page, `the tape at ${width} px, with a lane listed in full`)
      await viewer(page).locator('[data-command="help"]').click()
      await expect(page.getByRole('dialog', { name: 'Keyboard' })).toBeVisible()
      await audit(page, `the keys dialog at ${width} px`)
    })

    test('the page never scrolls sideways, and the canvas fits its box', async ({ page }) => {
      await open(page)
      const facts = await page.evaluate(() => {
        const tape = document.querySelector('[data-trace-tape]') as HTMLElement
        const canvas = tape.querySelector('canvas') as HTMLCanvasElement
        return { scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, tape: tape.clientWidth, canvas: canvas.clientWidth }
      })
      expect(facts.scroll).toBeLessThanOrEqual(0)
      expect(facts.canvas).toBe(facts.tape)
    })
  })
}

// ---------------------------------------------------------------------------------------------------------------------------
// Nothing moves unless the learner moves it

test.describe('motion', () => {
  test('the canvas draws nothing while nothing changes, whatever the motion setting says', async ({ page }) => {
    await open(page)
    await settled(page)
    const frames = await probe(page, (p) => p.draws())
    await page.waitForTimeout(1_500)
    expect(await probe(page, (p) => p.draws()), 'frames drawn in 1.5 s of rest').toBe(frames)
    await tabTo(page, 'zoom-out')
    await press(page, 'ArrowRight')
    await settled(page)
    expect(await probe(page, (p) => p.draws())).toBeGreaterThan(frames)
  })

  test.describe('under reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('a zoom, a pan and a fit cut to their place at once, and nothing is drawn after the first settled frame', async ({ page }) => {
      await open(page)
      await settled(page)
      const length = await spanOf(page)
      await viewer(page).locator('[data-command="zoom-in"]').click()
      // At once: the very next frame has the new window, with no tween on the way.
      await expect.poll(() => spanOf(page), { timeout: 2_000 }).toBeCloseTo(length / 2, -1)
      await settled(page, 800)
      const frames = await probe(page, (p) => p.draws())
      await page.waitForTimeout(1_200)
      expect(await probe(page, (p) => p.draws())).toBe(frames)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 1. Panning 100k spans

/** What panning a tape for a while came to: how often the canvas drew, how long between frames, and what each cost it. */
interface PanRun {
  window: string
  spans: number
  /** Commands sent, one a frame, and frames the canvas drew. */
  sent: number
  drawn: number
  seconds: number
  /** Frames drawn a second over the run, and the rate of its median frame. */
  fps: number
  fpsMedian: number
  /** The time between one drawn frame and the next, in ms. */
  gapP50: number
  gapP95: number
  gapMax: number
  /** What the canvas spent on a frame, in ms: the plan and the paint, as the viewer times them. */
  drawP50: number
  drawP95: number
  drawMax: number
  rects: number
  visited: number
}

/**
 * Pans a tape for `frames` animation frames, through the same reducer the keys use, one command a frame as a held key or a drag sends
 * them, and reads when the canvas drew. The frame rate is the number of frames it drew over the time it took, and the median frame is the
 * gap between the middle two, so a stall of the page or of the host is a long gap and is counted once.
 *   - `keys`: a real ArrowRight held down, which is a repeating keydown on the plate that has focus, each frame;
 *   - `drag`: the window moves on by `percent` of its length a frame, as a drag does;
 *   - `zigzag`: it moves by that and then back, for a window that has no room to go on (the whole tape).
 * Thirty frames come first and are not counted, so that the first frame's one-off work (the pattern tiles, the JIT) is not the rate.
 */
async function pan(page: Page, window: string, frames: number, mode: 'keys' | 'drag' | 'zigzag', percent = 1): Promise<PanRun> {
  // The page has had its last command's work done, the table that trails the tape included: a run starts from rest.
  await settled(page, 500)
  return page.evaluate(
    async ({ window: label, frames: n, mode: how, percent: share }) => {
      const p = window.__esTrace as TraceProbe
      const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
      const win = p.window()
      const step = Math.max(1, Math.round(((win.toNs - win.fromNs) * share) / 100))
      const target = document.querySelector('[data-command="zoom-out"]') as HTMLElement
      target.focus()
      const send = (i: number) => {
        if (how === 'keys') target.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true }))
        else p.dispatch({ t: 'panBy', ns: how === 'zigzag' && i % 2 === 1 ? -step : step })
      }
      // A held key or a drag sends its event between frames and not inside one, so the page is given a turn of the event loop after the
      // command (the update is rendered, and the canvas asks for its frame) before the wait for the next frame begins.
      const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
      for (let i = 0; i < 30; i++) {
        send(i)
        await turn()
        await nextFrame()
      }
      await nextFrame()
      await nextFrame()
      p.reset()
      for (let i = 0; i < n; i++) {
        send(i)
        await turn()
        await nextFrame()
      }
      // The last command's frame is owed one more.
      await nextFrame()
      await nextFrame()
      const stamps = p.stamps()
      const costs = p.costs()
      const gaps = stamps.slice(1).map((stamp, i) => stamp - stamps[i])
      const seconds = (stamps[stamps.length - 1] - stamps[0]) / 1000
      const at = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] ?? 0
      return {
        window: label,
        spans: p.spans(),
        sent: n,
        drawn: stamps.length,
        seconds,
        fps: (stamps.length - 1) / seconds,
        fpsMedian: 1000 / at(gaps, 0.5),
        gapP50: at(gaps, 0.5),
        gapP95: at(gaps, 0.95),
        gapMax: Math.max(...gaps),
        drawP50: at(costs, 0.5),
        drawP95: at(costs, 0.95),
        drawMax: Math.max(...costs),
        rects: p.rects(),
        visited: p.visited(),
      }
    },
    { window, frames, mode, percent },
  )
}

/** Zooms the tape until its window is no longer than `ns`, from the whole tape. */
async function zoomTo(page: Page, ns: number): Promise<void> {
  await page.evaluate(() => (window.__esTrace as TraceProbe).dispatch({ t: 'fit', what: 'all' }))
  for (let i = 0; i < 40 && (await spanOf(page)) > ns; i++) {
    await page.evaluate(() => (window.__esTrace as TraceProbe).dispatch({ t: 'zoom', dir: 1 }))
    await page.waitForTimeout(30)
  }
}

// What accept 1 came to [measured 2026-11-04 on W1-T09 over wave-1 5ffa2f9: this test alone, one worker, Chrome for Testing 153.0.8010.12
// (the headless shell), Playwright 1.63.0, the specimen `synthetic-3` with 100,048 spans, a load average of 9.1 on 20 cores]. The browser
// paces animation frames at 60 a second, so 60 fps is the most a run can show; the test holds the median frame to 30.
//
//   window                     in view   rects    fps   median frame   gap p95 / max      canvas draw p50 / p95
//   about a step (2.5 ms)           55      37   60.0   59.9 fps       17.4 / 18.9 ms     0.20 / 0.40 ms
//   about 600 ms                13,534   1,305   60.0   59.9 fps       17.7 / 20.6 ms     0.80 / 0.90 ms
//   about 1.8 s                 27,146   2,611   56.9   59.9 fps       27.9 / 32.8 ms     1.20 / 1.40 ms
//   the whole tape             100,048       6   59.0   59.9 fps       18.2 / 31.4 ms     2.10 / 2.40 ms
//
// Each run prints its own line, so a reader of the log can see the rate on their host.
test.describe('panning a tape of 100,000 spans (accept 1)', () => {
  test('holds at least 30 fps, in a window of a step, of thousands of spans, and with every span in view', async ({ page }) => {
    test.setTimeout(180_000)
    await open(page, '/trace-room/synthetic-3?spans=100000')
    expect(await probe(page, (p) => p.spans())).toBeGreaterThanOrEqual(100_000)
    const runs: PanRun[] = []

    // A window of about a step: some fifty spans, panned by key presses that repeat, the way a held arrow does.
    await zoomTo(page, 2_500_000)
    runs.push(await pan(page, 'about a step (2.5 ms), ArrowRight held', 240, 'keys'))
    // Thousands of spans in view, moved on half a hundredth of the window a frame, as a drag does.
    await zoomTo(page, 600_000_000)
    runs.push(await pan(page, 'about 600 ms, dragged', 240, 'drag', 0.5))
    await zoomTo(page, 1_800_000_000)
    runs.push(await pan(page, 'about 1.8 s, dragged', 240, 'drag', 0.5))
    // The worst case: the whole tape is in the window, and every one of its 100,000 spans is looked at every frame.
    await page.evaluate(() => (window.__esTrace as TraceProbe).dispatch({ t: 'fit', what: 'all' }))
    await page.waitForTimeout(300)
    runs.push(await pan(page, 'the whole tape, dragged to and fro', 240, 'zigzag', 0.5))

    for (const run of runs) {
      console.log(
        `pan ${run.window}: ${run.spans} spans, ${run.visited} in view, ${run.rects} rects; ${run.drawn} frames drawn for ${run.sent} sent, in ${run.seconds.toFixed(2)} s = ${run.fps.toFixed(1)} fps ` +
          `(median gap ${run.gapP50.toFixed(1)} ms = ${run.fpsMedian.toFixed(1)} fps, p95 ${run.gapP95.toFixed(1)} ms, max ${run.gapMax.toFixed(1)} ms); ` +
          `canvas draw p50 ${run.drawP50.toFixed(2)} ms, p95 ${run.drawP95.toFixed(2)} ms, max ${run.drawMax.toFixed(2)} ms; load average ${os.loadavg()[0].toFixed(1)} on ${os.cpus().length} cores`,
      )
      test.info().annotations.push({
        type: 'pan',
        description: `${run.window}: ${run.fps.toFixed(1)} fps (median gap ${run.fpsMedian.toFixed(1)} fps), draw p95 ${run.drawP95.toFixed(2)} ms, ${run.visited} spans in view, ${run.rects} rects`,
      })
    }
    for (const run of runs) {
      // The rate is the dev host's to meet, and the median frame is its measure: a shared host stalls a page for a frame or two, and
      // the mean of a run counts every stall. A runner draws a canvas on two shared cores with no GPU, and a gate on it would measure the
      // runner. What a frame holds, and what it costs the canvas, is the same anywhere, and is asserted everywhere.
      if (process.env.CI === undefined) expect(run.fpsMedian, `${run.window}: frames per second of the median frame while panning`).toBeGreaterThanOrEqual(30)
      expect(run.drawn, `${run.window}: frames drawn for the ${run.sent} commands sent`).toBeGreaterThan(run.sent * 0.5)
      expect(run.drawP95, `${run.window}: ms the canvas spends on a frame (p95)`).toBeLessThan(33)
      expect(run.rects, `${run.window}: rectangles in a frame (GAMES.md §6: at most 5,000)`).toBeLessThan(5_000)
    }
    expect(runs[3].visited).toBeGreaterThanOrEqual(100_000)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// What leaves the viewer

test.describe('the paper (DESIGN.md, "The One Lamp Rule")', () => {
  /** The box of the canvas pixels that are within a few levels of `color`, in CSS px of the tape, or null when there are none. */
  const inkBox = (page: Page, role: string) =>
    page.evaluate((variable) => {
      const canvas = document.querySelector('[data-trace-tape] canvas') as HTMLCanvasElement
      const wanted = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
      const probe = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
      probe.fillStyle = wanted
      probe.fillRect(0, 0, 1, 1)
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
      const data = (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height)
      const scale = canvas.width / canvas.clientWidth
      let x0 = Infinity
      let x1 = -1
      let y0 = Infinity
      let y1 = -1
      let n = 0
      for (let y = 0; y < data.height; y++) {
        for (let x = 0; x < data.width; x++) {
          const at = (y * data.width + x) * 4
          if (Math.abs(data.data[at] - r) < 6 && Math.abs(data.data[at + 1] - g) < 6 && Math.abs(data.data[at + 2] - b) < 6 && data.data[at + 3] > 250) {
            n++
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
      }
      return n === 0 ? null : { n, x0: x0 / scale, x1: x1 / scale, y0: y0 / scale, y1: y1 / scale }
    }, role)

  test('the lamp’s filament is drawn round the cursor, and moves with it', async ({ page }) => {
    await open(page)
    await settled(page)
    const before = await inkBox(page, '--es-marker-edge')
    expect(before, 'filament pixels on the paper').not.toBeNull()
    expect(before?.n ?? 0).toBeGreaterThan(40)
    await tabTo(page, 'zoom-out')
    for (let i = 0; i < 6; i++) await press(page, 'KeyK')
    await settled(page)
    const after = await inkBox(page, '--es-marker-edge')
    expect(after).not.toBeNull()
    expect(Math.abs((after?.x0 ?? 0) - (before?.x0 ?? 0)), 'the filament moved along the paper').toBeGreaterThan(5)
  })

  test('draws every kind of span with its colour and its glyph, and the cursor in amber with its edge (R-T27)', async ({ page }) => {
    await open(page)
    await settled(page)
    const marker = await inkBox(page, '--es-marker')
    expect(marker, 'amber pixels on the paper').not.toBeNull()
    for (const role of ['--es-cat-blue', '--es-cat-green', '--es-cat-brown']) {
      expect(await inkBox(page, role), `${role} on the paper`).not.toBeNull()
    }
    await expect(viewer(page).locator('ul.es-trace__legend li')).toHaveCount(6)
  })

  for (const width of [360, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 800 } })

      test('every number on the ruler is whole on the paper, and so is the tape that names a cause, at either end', async ({ page }) => {
        await open(page)
        const inside = () =>
          page.evaluate(() => {
            const plot = document.querySelector('.es-trace__plot') as HTMLElement
            const box = plot.getBoundingClientRect()
            const stray = [...plot.querySelectorAll('.es-trace__tick, .es-trace__cause > *')].filter((node) => {
              const r = node.getBoundingClientRect()
              return r.left < box.left - 0.5 || r.right > box.right + 0.5
            })
            return { ticks: plot.querySelectorAll('.es-trace__tick').length, causes: plot.querySelectorAll('.es-trace__cause').length, stray: stray.map((node) => node.textContent) }
          })
        let seen = await inside()
        expect(seen.ticks).toBeGreaterThan(1)
        expect(seen.stray).toEqual([])
        // The cause, named at the first span of the window and at the last one on the line.
        await tabTo(page, 'zoom-out')
        await press(page, 'KeyX')
        await expect(viewer(page).locator('[data-cause]')).toBeVisible()
        seen = await inside()
        expect(seen.causes).toBe(1)
        expect(seen.stray).toEqual([])
        await viewer(page).locator('[data-trace-mirror] button[data-row-button]').last().click()
        await press(page, 'KeyX')
        seen = await inside()
        expect(seen.stray).toEqual([])
        for (const key of ['KeyA', 'Equal', 'ArrowRight', 'KeyF']) {
          await press(page, key)
          expect((await inside()).stray).toEqual([])
        }
      })
    })
  }
})

test.describe('the specimen page', () => {
  test('shows the marks as a trace-mark event’s data, and writes nothing to the ledger', async ({ page, requests }) => {
    await open(page)
    expect(await exported(page)).toEqual([])
    await viewer(page).locator('[data-command="mark"]').click()
    await viewer(page).locator('[data-command="category-cpu-gap"]').click()
    await viewer(page).locator('[data-command="edge-next"]').click()
    await viewer(page).locator('[data-command="mark"]').click()
    // The viewer hands its notes to the page in an effect, so the export is written a render after the click: wait for it.
    await expect.poll(async () => (await exported(page)).length).toBe(1)
    const marks = (await exported(page)) as { kind: string; category: string }[]
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({ kind: 'range', category: 'cpu-gap' })
    await expect(page.locator('[data-trace-export] code').first()).toContainText('trace:synthetic-7/read')
    expect(await page.evaluate(() => indexedDB.databases().then((dbs) => dbs.map((db) => db.name)))).toEqual([])
    expect(requests.filter((request) => request.includes('/api'))).toEqual([])
  })

  test('says what the tape is, in the head, the printer and the table: synthetic, and every figure carries it', async ({ page }) => {
    await open(page)
    await expect(viewer(page).getByText('A synthetic trace', { exact: false }).first()).toBeVisible()
    await expect(viewer(page).locator('.es-readout__tag[data-tag="synthetic"]').first()).toBeVisible()
    await expect(viewer(page).locator('[data-trace-mirror] thead')).toContainText('ns, synthetic')
  })

  test('is titled and headed Traces, labels its shortcut list Keyboard, and reads in the engine’s words (R-T27)', async ({ page }) => {
    await open(page)
    await expect(page).toHaveTitle(/^Traces/)
    await expect(page.getByRole('heading', { level: 1, name: 'Traces' })).toBeVisible()
    // The cursor, a mark and a cause on the page, so that every label is there to read.
    await viewer(page).locator('[data-command="mark"]').click()
    await viewer(page).locator('[data-command="category-cpu-gap"]').click()
    await viewer(page).locator('[data-command="edge-next"]').click()
    await viewer(page).locator('[data-command="mark"]').click()
    await press(page, 'KeyX')
    await expect(viewer(page).locator('.es-trace__now')).toHaveText('now')
    expect(await bannedOn(page), 'banned words on the page').toEqual([])
    await viewer(page).getByRole('button', { name: 'Keyboard' }).click()
    await expect(page.getByRole('dialog', { name: 'Keyboard' })).toBeVisible()
    expect(await bannedOn(page), 'banned words with the keyboard sheet open').toEqual([])
  })

  test('a trace id that is not a specimen shows the stub it always did', async ({ page }) => {
    await page.goto(`${ORIGIN}/trace-room/sample`)
    await expect(page.getByRole('heading', { level: 1, name: 'Traces' })).toBeVisible()
    await expect(page.getByText('Trace id: sample')).toBeVisible()
    await expect(page.locator('[data-trace-view]')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 5. A lesson's trace block (W2-T42)

test.describe("a lesson's trace block", () => {
  const trace = (page: Page) => page.locator('[data-block="trace"]')
  const checkButton = (page: Page) => page.getByRole('button', { name: 'Check my marks' })

  /** Presses Tab from the page's top until focus is on `target`: nothing but the keyboard is used to get there. */
  async function tabToButton(page: Page, name: string): Promise<void> {
    for (let i = 0; i < 200; i++) {
      await press(page, 'Tab')
      if (await page.evaluate((label) => document.activeElement?.textContent?.trim() === label, name)) return
    }
    throw new Error(`Tab never reached "${name}"`)
  }

  test('loads the viewer when the learner opens it, by keys, and a check of the marks writes one trace-mark event with the lesson’s rev', async ({ page, requests }) => {
    await serveKeptLesson(page, dist)
    await page.goto(`${ORIGIN}${KEPT_LESSON.route}`)
    await expect(trace(page).locator('.es-run__title')).toHaveText('Mark the tape')
    // Nothing of the viewer or of the model that makes the tape comes with the lesson.
    await expect(page.locator('[data-trace-view]')).toHaveCount(0)
    expect(requests.filter((request) => /TraceTape|TraceView/.test(request))).toEqual([])

    await tabToButton(page, 'Open the trace')
    await press(page, 'Enter')
    await expect(trace(page).locator('[data-trace-view]')).toBeVisible({ timeout: 30_000 })
    expect(requests.some((request) => /TraceTape/.test(request))).toBe(true)
    // The learner asked for the tape, so the keys are on it already.
    await expect(trace(page).locator('[data-trace-view]')).toBeFocused()
    await expect(checkButton(page)).toBeDisabled()

    // M, a category, K, M: one mark, a kernel, from an edge to the next on the lane the cursor is on.
    await press(page, 'KeyM')
    await press(page, 'Digit1')
    await press(page, 'KeyK')
    await press(page, 'KeyM')
    await expect(trace(page).locator('[data-trace-marks] tbody tr')).toHaveCount(1)
    await expect(checkButton(page)).toBeEnabled()
    expect(await ledgerEvents(page).then((events) => (events as { kind: string }[]).filter((event) => event.kind === 'trace-mark'))).toEqual([])

    await checkButton(page).focus()
    await press(page, 'Enter')
    // The button keeps focus while the check is written, and after it.
    await expect(checkButton(page)).toBeFocused()
    const result = trace(page).locator('[data-trace-result]')
    await expect(result).toContainText('Saved to your record.')
    await expect(result).toContainText(/Your marks name the right category for \d+% of the time you marked\./)

    const written = ((await ledgerEvents(page)) as { kind: string; ref: string; rev?: string; seed?: number; ok: boolean; score: number; provenance: string; data: { marks: { kind: string; category?: string }[]; error: number } }[]).filter((event) => event.kind === 'trace-mark')
    expect(written).toHaveLength(1)
    const lessonRev = await page.locator('.es-lesson').getAttribute('data-rev')
    expect(written[0]).toMatchObject({ ref: `trace:${KEPT_TRACE.id}/${KEPT_TRACE.task}`, rev: lessonRev, seed: KEPT_TRACE.seed, provenance: 'practice' })
    expect(written[0].data.marks).toHaveLength(1)
    expect(written[0].data.marks[0]).toMatchObject({ kind: 'range', category: 'kernel' })
    expect(Number.isFinite(written[0].data.error) && written[0].data.error >= 0).toBe(true)
    expect(written[0].score).toBeGreaterThanOrEqual(0)
    expect(written[0].score).toBeLessThanOrEqual(1)
    // A mark moved after the check takes the verdict away: it is no longer what was checked.
    await trace(page).locator('[data-command="category-copy"]').click()
    await expect(result).toHaveText('')
    await expect(result).toHaveAttribute('data-trace-result', 'none')
  })

  test('"In vLLM today" ends the run it follows and cites its claims as numbered marks that open their source, and the Build row is in Keep', async ({ page }) => {
    await serveKeptLesson(page, dist)
    await page.goto(`${ORIGIN}${KEPT_LESSON.route}`)
    const note = page.locator('.es-inprod')
    await expect(note).toBeVisible()
    await expect(note.locator('.es-note__title')).toHaveText('In vLLM today')
    const marks = note.locator('a.es-pop__trigger[data-claim]')
    await expect(marks).toHaveCount(3)
    // The marks are numbered in the order the lesson first cites them, and the same numbers stand in Sources.
    const numbers = await marks.locator('.es-claimmark__n').allInnerTexts()
    expect(numbers.every((n) => /^\d+$/.test(n))).toBe(true)
    await marks.first().focus()
    await press(page, 'Enter')
    const sheet = page.getByRole('dialog', { name: `Source ${numbers[0]}` })
    await expect(sheet).toContainText('Prefix caching is on by default')
    await press(page, 'Escape')
    await expect(sheet).toHaveCount(0)
    for (const n of numbers) await expect(page.locator(`#source-${n}`)).toBeVisible()
    const keep = page.locator('#keep')
    await expect(keep.locator('.es-build')).toContainText('This lesson prepares stages s1, s2.')
    await expect(keep.getByRole('link', { name: 'Open the lab' })).toHaveAttribute('href', '/labs/hybrid-kv')
  })

  for (const width of [390, 1280]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 844 } })

      test('axe finds no violation on the lesson with the trace open and marked, and the page does not scroll sideways', async ({ page }) => {
        await serveKeptLesson(page, dist)
        await page.goto(`${ORIGIN}${KEPT_LESSON.route}`)
        await trace(page).getByRole('button', { name: 'Open the trace' }).click()
        await lanesOnPhone(page)
        await expect(trace(page).locator('[data-trace-view]')).toBeVisible({ timeout: 30_000 })
        await trace(page).locator('[data-command="mark"]').click()
        await trace(page).locator('[data-command="category-kernel"]').click()
        await trace(page).locator('[data-command="edge-next"]').click()
        await trace(page).locator('[data-command="mark"]').click()
        await checkButton(page).click()
        await expect(trace(page).locator('[data-trace-result]')).toContainText('Saved to your record.')
        await audit(page, `the lesson's trace block at ${width} px`)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      })
    })
  }

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' })

    test('nothing on the block moves', async ({ page }) => {
      await serveKeptLesson(page, dist)
      await page.goto(`${ORIGIN}${KEPT_LESSON.route}`)
      await trace(page).getByRole('button', { name: 'Open the trace' }).click()
      await expect(trace(page).locator('[data-trace-view]')).toBeVisible({ timeout: 30_000 })
      const moving = await trace(page).evaluate((root) => root.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)
      expect(moving).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// 6. The list, on a phone (W2b-T101)
//
// Below the narrow breakpoint a trace is a list: the step's stretches, each with four category radios, and the step's frames and calls for
// the cause (src/trace/ListMode.tsx). A whole step is marked by touch and by keys, on the specimen and in a lesson's trace block, and the
// marks are the same marks the lanes make. The defect classes it is held to: DC-A (nothing moves), DC-B (in view, 44 px targets), DC-C
// (keys), DC-G (reduced motion).

const LIST_TRACE = specimenTrace(7)
const LIST_STEP = stepWindows(LIST_TRACE)[5]
const LIST_ROWS = stretchesOf(LIST_TRACE, LIST_STEP)
/** The category each stretch truly is, from the model that made the tape: what a learner who reads each row right picks. */
const LIST_TRUTH: Category[] = LIST_ROWS.map((row) => (row.gpu === 'kernel' ? 'kernel' : row.gpu === 'copy' ? 'copy' : row.cpu ? 'cpu-gap' : 'both-idle'))
const LIST_SEGMENTS = attribute(LIST_TRACE, LIST_STEP).segments.map((segment) => ({
  kind: 'range',
  fromNs: segment.fromNs,
  toNs: segment.toNs,
  category: segment.category,
}))
const DIGIT: Record<Category, string> = {
  kernel: 'Digit1',
  copy: 'Digit2',
  'cpu-gap': 'Digit3',
  'both-idle': 'Digit4',
}

const list = (page: Page) => page.locator('[data-trace-list]')
const plate = (page: Page, row: number, category: Category) => list(page).locator(`tr[data-stretch="${row}"] input[value="${category}"]`)
const causeRadio = (page: Page, name: string) => list(page).locator('[data-cause-span]').filter({ hasText: name }).first().locator('input')

/**
 * The lesson's own first paint: its game arrives in a chunk and the game's intro strip in a second one, so the strip can land after this
 * spec has opened the trace block, and the page below it grows by the strip's height while the browser's scroll anchoring holds the
 * reader's place. This spec measures the trace list's DC-A, not the game's; so it waits for the frame and, when the frame has planned an
 * intro, for the strip, before it reads anything. The strip's late arrival moving the page is the WAIT-rule item the exit check
 * (W2b-T120) holds, and it is not fixed here.
 */
async function lessonFirstPaint(page: Page): Promise<void> {
  const frame = page.locator('[data-game]').first()
  await frame.waitFor({ state: 'attached', timeout: 30_000 })
  if ((await frame.getAttribute('data-intro')) !== null) await frame.locator('.es-intro').waitFor({ state: 'attached', timeout: 30_000 })
}

/** The specimen, or the lesson with its trace block opened by a tap, as a list. */
async function openList(page: Page, where: 'viewer' | 'lesson'): Promise<void> {
  if (where === 'viewer') {
    await page.goto(`${ORIGIN}${SPECIMEN}`)
  } else {
    await serveKeptLesson(page, dist)
    await page.goto(`${ORIGIN}${KEPT_LESSON.route}`)
    await page.locator('[data-block="trace"]').getByRole('button', { name: 'Open the trace' }).click()
    await lessonFirstPaint(page)
  }
  await list(page).waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('[data-trace-view]')).toHaveCount(0)
  await expect(list(page).locator('tr[data-stretch]')).toHaveCount(LIST_ROWS.length)
}

/** DC-B: the focused control is wholly in the viewport and topmost at its centre. */
async function focusInView(page: Page, after: string): Promise<void> {
  const seen = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (el === null || el === document.body) return { ok: false, why: 'nothing has focus' }
    const r = el.getBoundingClientRect()
    const inside = r.top >= -0.5 && r.left >= -0.5 && r.bottom <= window.innerHeight + 0.5 && r.right <= window.innerWidth + 0.5
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const topmost = top !== null && (top === el || el.contains(top))
    return {
      ok: inside && topmost,
      why: `${el.outerHTML.slice(0, 90)} at ${Math.round(r.top)}..${Math.round(r.bottom)} of ${window.innerHeight}, inside ${inside}, topmost ${topmost} (${top?.className ?? 'nothing'})`,
    }
  })
  expect(seen.ok, `after ${after}: ${seen.why}`).toBe(true)
}

/** The rectangles of every control and readout of the block on the screen, by a stable name. */
async function rects(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {}
    const host = document.querySelector('[data-trace-list]')?.parentElement ?? document.body
    host
      .querySelectorAll<HTMLElement>(
        '[data-trace-modes] button, [data-trace-list] input, [data-trace-list] button, [data-list-tally], [data-list-step-at], [data-trace-check], .es-trace-run__hint',
      )
      .forEach((el, at) => {
        const r = el.getBoundingClientRect()
        out[`${at} ${el.tagName} ${el.getAttribute('value') ?? el.getAttribute('data-list-step') ?? el.getAttribute('data-trace-mode') ?? el.className}`] = [
          r.left,
          r.top,
          r.width,
          r.height,
        ]
          .map((v) => v.toFixed(1))
          .join(',')
      })
    return out
  })
}

/** DC-A: a tap on `target` in plain view, mid-screen, with the rectangles on the screen read just before and just after it. Nothing scrolls in between. */
async function tapStill(page: Page, target: Locator, what: string): Promise<void> {
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const before = await rects(page)
  const scroll = await page.evaluate(() => window.scrollY)
  await target.tap()
  await expect(target).toBeChecked()
  expect(await page.evaluate(() => window.scrollY), `the page scrolled on ${what}`).toBe(scroll)
  expect(await rects(page), `after ${what}`).toEqual(before)
}

const exportedMarks = async (page: Page) =>
  (await exported(page)) as {
    kind: string
    fromNs?: number
    toNs?: number
    category?: string
    span?: number
  }[]

/** A whole step marked by keys alone: Tab to each stretch, a digit for its category, Tab on, the arrows in the cause list, and the check. */
async function walkByKeys(page: Page, where: 'viewer' | 'lesson'): Promise<void> {
  await openList(page, where)
  // From the top of the page, by Tab alone, to the first stretch's radios.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let i = 0; i < 200 && (await page.evaluate(() => document.activeElement?.getAttribute('data-row'))) !== '0'; i++) await press(page, 'Tab')
  await focusInView(page, 'Tab to the first stretch')
  for (const [row, category] of LIST_TRUTH.entries()) {
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-row'))).toBe(String(row))
    await press(page, DIGIT[category])
    await expect(plate(page, row, category)).toBeChecked()
    await expect(plate(page, row, category)).toBeFocused()
    await focusInView(page, `${DIGIT[category]} on stretch ${row + 1}`)
    await press(page, 'Tab')
    await focusInView(page, `Tab from stretch ${row + 1}`)
  }
  // Tab has left the last stretch for the cause list, on its checked radio, "No cause named"; the arrows move down it and pick.
  await expect(list(page).locator('[data-list-cause] input').first()).toBeFocused()
  await press(page, 'ArrowDown')
  await focusInView(page, 'ArrowDown in the cause list')
  await press(page, 'ArrowDown')
  await focusInView(page, 'ArrowDown in the cause list')
  await expect(list(page).locator('[data-cause-span] input').nth(1)).toBeChecked()
  await expect(list(page).locator('[data-list-tally]')).toContainText('Unaccounted: 0 ns of the step.')
  if (where === 'viewer') {
    await expect.poll(async () => (await exportedMarks(page)).length).toBe(LIST_SEGMENTS.length + 1)
    expect((await exportedMarks(page)).slice(0, -1)).toEqual(LIST_SEGMENTS)
  } else {
    for (let i = 0; i < 80 && !(await page.getByRole('button', { name: 'Check my marks' }).evaluate((el) => el === document.activeElement)); i++) {
      await press(page, 'Tab')
      await focusInView(page, 'Tab towards the check')
    }
    await press(page, 'Enter')
    const result = page.locator('[data-trace-result]')
    await expect(result).toContainText('Saved to your record.')
    // DC-C: after the check, focus is on the verdict it wrote, in view.
    await expect(result).toBeFocused()
    await focusInView(page, 'Enter on the check')
    const written = ((await ledgerEvents(page)) as { kind: string; score: number }[]).filter((event) => event.kind === 'trace-mark')
    expect(written).toHaveLength(1)
    expect(written[0].score).toBe(1)
  }
}

for (const where of ['viewer', 'lesson'] as const) {
  for (const size of [
    { width: 360, height: 640 },
    { width: 320, height: 640 },
  ]) {
    test.describe(`the list on the ${where}, at ${size.width}x${size.height}`, () => {
      test.use({ viewport: size, hasTouch: true, isMobile: true })

      test('a whole step is marked by touch: a tap on each stretch’s category and on a cause, and the marks are the lanes’ marks', async ({ page }) => {
        await openList(page, where)
        await expect(list(page).locator('[data-list-step-at]')).toContainText(`Step 6 of ${stepWindows(LIST_TRACE).length}`)
        for (const [row, category] of LIST_TRUTH.entries()) {
          await plate(page, row, category).tap()
          await expect(plate(page, row, category)).toBeChecked()
        }
        await expect(list(page).locator('[data-list-tally]')).toContainText(`${LIST_ROWS.length} of ${LIST_ROWS.length} stretches have a category.`)
        await expect(list(page).locator('[data-list-tally]')).toContainText('Unaccounted: 0 ns of the step.')
        await causeRadio(page, 'cudaStreamSynchronize').tap()
        await expect(causeRadio(page, 'cudaStreamSynchronize')).toBeChecked()
        if (where === 'viewer') {
          await expect.poll(async () => (await exportedMarks(page)).length).toBe(LIST_SEGMENTS.length + 1)
          const marks = await exportedMarks(page)
          expect(marks.slice(0, -1)).toEqual(LIST_SEGMENTS)
          expect(marks[marks.length - 1].kind).toBe('cause')
        } else {
          const check = page.getByRole('button', { name: 'Check my marks' })
          await check.tap()
          const result = page.locator('[data-trace-result]')
          await expect(result).toContainText('Your marks name the right category for 100% of the time you marked.')
          await expect(result).toContainText('Saved to your record.')
          const written = (
            (await ledgerEvents(page)) as {
              kind: string
              score: number
              ok: boolean
              data: { marks: { kind: string }[]; error: number }
            }[]
          ).filter((event) => event.kind === 'trace-mark')
          expect(written).toHaveLength(1)
          expect(written[0]).toMatchObject({
            score: 1,
            ok: true,
            data: { error: 0 },
          })
          expect(written[0].data.marks).toEqual([...LIST_SEGMENTS, { kind: 'cause', span: expect.any(Number) }])
        }
      })

      test('a whole step is marked by keys: Tab to each stretch, a digit for its category, the arrows for the cause; focus stays in view', async ({ page }) => {
        await walkByKeys(page, where)
      })

      test('every control of the list is at least 44 px each way, the page never scrolls sideways, and axe finds no violation', async ({ page }) => {
        await openList(page, where)
        await plate(page, 0, LIST_TRUTH[0]).tap()
        await causeRadio(page, 'cudaStreamSynchronize').tap()
        const small = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[data-trace-modes] button, [data-trace-list] input, [data-trace-list] button, [data-trace-check]')]
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width < 44 || r.height < 44)
            .map(({ el, r }) => `${el.outerHTML.slice(0, 60)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`),
        )
        expect(small).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
        await audit(page, `the list on the ${where} at ${size.width}x${size.height}`)
      })
    })
  }

  // DC-B: the rest of the defect class's sizes at which a trace is a list (the wider ones show the lanes).
  for (const size of [
    { width: 412, height: 915 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 360, height: 800 },
    { width: 640, height: 400 },
  ]) {
    test.describe(`the list on the ${where}, at ${size.width}x${size.height}`, () => {
      test.use({ viewport: size, hasTouch: true, isMobile: true })

      test('DC-B: marked by keys, the focused control is whole in view and on top after every key', async ({ page }) => {
        await walkByKeys(page, where)
      })
    })
  }

  test.describe(`the list on the ${where}, held to the defect classes`, () => {
    test.use({
      viewport: { width: 360, height: 640 },
      hasTouch: true,
      isMobile: true,
    })

    test('DC-A: nothing moves when a stretch is picked, when a cause is named, when the step changes and when the marks are checked', async ({ page }) => {
      await openList(page, where)
      for (const [row, category] of LIST_TRUTH.entries()) await tapStill(page, plate(page, row, category), `the pick of stretch ${row + 1}`)
      await tapStill(page, plate(page, 0, LIST_TRUTH[0] === 'kernel' ? 'copy' : 'kernel'), 'a second pick of stretch 1')
      await tapStill(page, causeRadio(page, 'cudaStreamSynchronize'), 'a cause')
      await tapStill(page, list(page).locator('[data-list-cause] input').first(), 'no cause')
      if (where === 'lesson') {
        const check = page.getByRole('button', { name: 'Check my marks' })
        await check.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const before = await rects(page)
        await check.tap()
        await expect(page.locator('[data-trace-result]')).toContainText('Saved to your record.')
        expect(await rects(page), 'after the check').toEqual(before)
      }
      // The step buttons and what they say hold still when the step changes under them.
      const next = list(page).locator('[data-list-step="next"]')
      await next.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const steps = async () =>
        page.evaluate(() => [...document.querySelectorAll('[data-list-steps] > *')].map((el) => JSON.stringify(el.getBoundingClientRect())))
      const at = await steps()
      await next.tap()
      await expect(list(page).locator('[data-list-step-at]')).toContainText('Step 7')
      expect(await steps()).toEqual(at)
    })

    test('DC-C: a key held down picks once, Space twice is one pick, and a step button pressed twice at once moves one step', async ({ page }) => {
      await openList(page, where)
      await plate(page, 0, 'kernel').focus()
      await press(page, 'Space')
      await press(page, 'Space')
      await expect(plate(page, 0, 'kernel')).toBeChecked()
      const marked = await list(page).locator('[data-list-tally]').innerText()
      // A held key: the repeats of a digit and of an arrow apply nothing.
      const prevented = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const out: boolean[] = []
        for (const [code, key] of [
          ['Digit2', '2'],
          ['ArrowRight', 'ArrowRight'],
        ]) {
          const event = new KeyboardEvent('keydown', {
            code,
            key,
            repeat: true,
            bubbles: true,
            cancelable: true,
          })
          el.dispatchEvent(event)
          out.push(event.defaultPrevented)
        }
        return out
      })
      expect(prevented).toEqual([true, true])
      await expect(plate(page, 0, 'kernel')).toBeChecked()
      expect(await list(page).locator('[data-list-tally]').innerText()).toBe(marked)
      // Enter twice on Next step, within half a second: one step.
      await list(page).locator('[data-list-step="next"]').focus()
      await press(page, 'Enter')
      await press(page, 'Enter')
      await expect(list(page).locator('[data-list-step-at]')).toContainText('Step 7 of')
      await page.waitForTimeout(600)
      await press(page, 'Enter')
      await expect(list(page).locator('[data-list-step-at]')).toContainText('Step 8 of')
      // At the last step Next stays where it is, with focus on it, and does nothing.
      const last = stepWindows(LIST_TRACE).length
      for (let i = 8; i < last + 2; i++) {
        await page.waitForTimeout(520)
        await press(page, 'Enter')
      }
      await expect(list(page).locator('[data-list-step-at]')).toContainText(`Step ${last} of ${last}`)
      await expect(list(page).locator('[data-list-step="next"]')).toBeFocused()
      await expect(list(page).locator('[data-list-step="next"]')).toHaveAttribute('aria-disabled', 'true')
      if (where === 'lesson') {
        // Back to the step with a mark, and a check pressed twice at once writes one event.
        await list(page).locator('[data-list-step="prev"]').focus()
        await page.getByRole('button', { name: 'Check my marks' }).focus()
        await press(page, 'Enter')
        await press(page, 'Enter')
        await expect(page.locator('[data-trace-result]')).toContainText('Saved to your record.')
        await page.waitForTimeout(300)
        expect(((await ledgerEvents(page)) as { kind: string }[]).filter((event) => event.kind === 'trace-mark')).toHaveLength(1)
      }
    })

    test.describe('under reduced motion', () => {
      test.use({ reducedMotion: 'reduce' })

      test('DC-G: after every pick, cause and step nothing animates and nothing is in transition', async ({ page }) => {
        await openList(page, where)
        const moving = () =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter(
                  (animation) =>
                    animation.playState === 'running' &&
                    (animation.effect as KeyframeEffect | null)?.target?.closest?.('[data-trace-list], [data-trace-modes], .es-trace-run__check') != null,
                ).length,
          )
        for (const [row, category] of LIST_TRUTH.entries()) {
          await plate(page, row, category).tap()
          expect(await moving(), `after stretch ${row + 1}`).toBe(0)
        }
        await causeRadio(page, 'cudaStreamSynchronize').tap()
        expect(await moving(), 'after the cause').toBe(0)
        await list(page).locator('[data-list-step="next"]').tap()
        expect(await moving(), 'after a step').toBe(0)
      })
    })
  })
}

test.describe('the list and the lanes', () => {
  test.use({
    viewport: { width: 360, height: 640 },
    hasTouch: true,
    isMobile: true,
  })

  test('marks made in the list are on the lanes when the switch shows them, and a desk never sees the list', async ({ page }) => {
    await openList(page, 'viewer')
    for (const [row, category] of LIST_TRUTH.entries()) await plate(page, row, category).tap()
    await page.locator('[data-trace-mode="lanes"]').tap()
    await expect(viewer(page)).toBeVisible()
    await expect(viewer(page).locator('[data-trace-marks] tbody tr')).toHaveCount(LIST_SEGMENTS.length)
    await page.locator('[data-trace-mode="list"]').tap()
    await expect(list(page).locator('[data-list-tally]')).toContainText(`${LIST_ROWS.length} of ${LIST_ROWS.length}`)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(viewer(page)).toBeVisible()
    await expect(page.locator('[data-trace-modes]')).toHaveCount(0)
    await expect(list(page)).toHaveCount(0)
  })
})
