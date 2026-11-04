/*
 * W0-T22's acceptance checks, in Playwright's Chromium: /settings, /evidence and the motion of /design.
 *
 *   1. Settings persist in `working` and apply live: switching reduced motion on stops a running scene's animation.
 *   2. Reset asks for confirmation and offers an export first.
 *   (3. /design lists exactly the roles in tokens.ts: a Bun test, tests/design/design-page.test.ts.)
 *
 * And what stands behind them. Settings: the record in IndexedDB and the copy in localStorage agree and survive a reload, the
 * record wins where they part, a change made in one tab reaches the scene, the game shell and the document of another, a quality
 * cap lowers a running tier, 3D off puts a live scene back to its 2D twin and 3D on brings it back with the twin kept until the
 * first frame, the game keys are unbound while they are off, and a tab that has gone read-only saves and applies nothing and says
 * so. Evidence: the counts by kind and by module, import with its preview, merge and replace, undo, a refused file, and export
 * (plain and gzip) as a file that goes back in. Design: the bell runs each motion for its role's duration, and none under reduced
 * motion. All three pages: the keyboard reaches and works every control, axe finds no serious or critical violation, and they
 * reflow to 320 px, at the widths the architecture names (A§11.2).
 *
 * How it runs. The spec builds the app once with `VITE_ES_TEST_HOOKS=1`, a test build that exposes each live scene's counts on
 * `window.__esScene`, and answers every request from that build with `context.route`, so no server runs. A request to any other
 * origin fails the test (ARCHITECTURE §1, I1), and so does an error the page throws or logs. Two pages of one browser context are
 * two tabs of one profile: they share localStorage and IndexedDB, and the `storage` event and the ledger's channel reach both.
 * Chromium renders WebGL2 with SwiftShader, so CI needs no GPU, and a frame of the 3D scene takes it most of a second: the checks
 * that count frames wait for the page to rest, and do not ask how fast it draws.
 *
 *   npx playwright test e2e/settings.spec.ts
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed.
 */
import AxeBuilder from '@axe-core/playwright'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { test as base, expect } from '@playwright/test'
import type { Download, Page } from '@playwright/test'
import { build } from 'vite'
import { buildExport, serializeExport } from '../packages/ledger'
import type { LedgerEvent } from '../packages/ledger'
import type { SceneHook } from '../src/scene/test-hook'
import { copy as clone, EXAMPLES } from '../tests/ledger/support'

declare global {
  interface Window {
    __raf?: number
  }
}

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4176'
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

base.use({
  launchOptions: {
    executablePath: process.env.ES_CHROMIUM || undefined,
    // SwiftShader everywhere, GPU or none, so every run renders alike.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-settings-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
})

base.afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true })
})

/** Each test serves the build itself, records what the page asked for, and fails on any error the page throws or logs. */
const test = base.extend<{ requests: string[] }>({
  requests: [
    async ({ context, page }, use) => {
      const errors: string[] = []
      const watch = (tab: Page) => {
        tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
        tab.on('console', (message) => {
          // THREE's own notice that one of its classes is deprecated is not this page's error.
          if (message.type() === 'error') errors.push(`console: ${message.text()}`)
        })
      }
      watch(page)
      context.on('page', watch)
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
    // Every test needs the site served, whether or not it reads the log.
    { auto: true },
  ],
})

// ------------------------------------------------------------------------------------------------ helpers

async function open(page: Page, route: string) {
  await page.goto(`${ORIGIN}${route}`)
  await page.evaluate(() => document.fonts.ready)
}

/** The group of plates with this name, and the plates in it. */
const group = (page: Page, name: string) => page.getByRole('group', { name })
const plate = (page: Page, groupName: string, label: string | RegExp) => group(page, groupName).getByRole('button', { name: label })
const switchNamed = (page: Page, name: string | RegExp) => page.getByRole('switch', { name })

/** What the root element says about motion: the override Settings put there, or null while the system decides. */
const motionAttribute = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-motion'))
const copy = (page: Page) => page.evaluate(() => localStorage.getItem('es:settings'))

/** Every record of the `working` store, by key: the settings' record, read from IndexedDB itself. */
function working(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const all = db.transaction('working', 'readonly').objectStore('working').getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve(Object.fromEntries((all.result as { key: string; value: unknown }[]).map((record) => [record.key, record.value])))
          }
        }
      }),
  )
}

/** The settings keys among the `working` records, so what the engine writes for itself (the export stamp) is not in the way. */
async function settingsRecord(page: Page): Promise<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(await working(page)).filter(([key]) => key.startsWith('settings:')))
}

const stage = (page: Page) => page.locator('[data-stage="specimen"]')
/** The scene kit's own bell, among the design page's many: the one that fires the specimen's next step. */
const bell = (page: Page) => page.locator('.es-kit').getByRole('button', { name: /Ring the bell: fire the next step/ })
const probe = (page: Page) => page.evaluate(() => (window.__esScene as SceneHook | undefined)?.probes.specimen?.info() ?? null)

/** Waits until the specimen is drawn, the Stage says it is settled, and no frame has been drawn for half a second. */
async function settle(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 20_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 20_000 })
  let frames = -1
  await expect
    .poll(
      async () => {
        const now = (await probe(page))?.frames ?? -2
        const still = now === frames
        frames = now
        return still
      },
      { intervals: [500], timeout: 20_000 },
    )
    .toBe(true)
}

/** Counts the animation frames a page asks for, from before anything of the app runs. */
async function countFrames(page: Page) {
  await page.addInitScript(() => {
    window.__raf = 0
    const request = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      window.__raf = (window.__raf ?? 0) + 1
      return request(callback)
    }
  })
}

const frames = (page: Page) => page.evaluate(() => window.__raf ?? 0)

/**
 * Waits until the page has asked for no animation frame for `quietMs`, and says how many it had asked for by then. A frame of the
 * 3D scene takes a software renderer most of a second, and a change of the tokens makes the scene redraw a few times before it
 * rests, so "no frame for half a second" is not yet rest. A loop that is still animating never goes quiet, whatever the window.
 */
async function restsAfter(page: Page, quietMs = 3000): Promise<number> {
  let rest = -1
  await expect
    .poll(
      async () => {
        const before = await frames(page)
        await page.waitForTimeout(quietMs)
        const after = await frames(page)
        rest = after
        return after === before
      },
      { message: 'the page stops asking for animation frames', intervals: [0], timeout: 40_000 },
    )
    .toBe(true)
  return rest
}

// ------------------------------------------------------------------------------------------------ 1. persist, and apply live

test.describe('settings persist in `working` (accept 1)', () => {
  test('a change is kept in the record and in the copy, shown by the control, and survives a reload', async ({ page }) => {
    await open(page, '/settings')
    expect(await settingsRecord(page)).toEqual({})
    expect(await copy(page)).toBeNull()
    await expect(plate(page, 'Reduced motion', 'Follow my system')).toHaveAttribute('aria-pressed', 'true')

    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await expect(plate(page, 'Reduced motion', 'Reduce motion')).toHaveAttribute('aria-pressed', 'true')
    await expect(plate(page, 'Reduced motion', 'Follow my system')).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:reduced-motion': 'reduce' })
    expect(JSON.parse((await copy(page)) ?? 'null')).toMatchObject({ 'settings:reduced-motion': 'reduce' })
    expect(await motionAttribute(page)).toBe('reduce')

    await plate(page, 'Quality cap', /Tier 2/).click()
    await switchNamed(page, 'Draw the games in 3D').click()
    await switchNamed(page, 'Game keys').click()
    await expect.poll(() => settingsRecord(page)).toEqual({
      'settings:reduced-motion': 'reduce',
      'settings:3d': false,
      'settings:tier-cap': 2,
      'settings:game-keys': false,
    })

    await page.reload()
    await page.evaluate(() => document.fonts.ready)
    await expect(plate(page, 'Reduced motion', 'Reduce motion')).toHaveAttribute('aria-pressed', 'true')
    await expect(switchNamed(page, 'Draw the games in 3D')).toHaveAttribute('aria-checked', 'false')
    await expect(plate(page, 'Quality cap', /Tier 2/)).toHaveAttribute('aria-pressed', 'true')
    await expect(switchNamed(page, 'Game keys')).toHaveAttribute('aria-checked', 'false')
    expect(await motionAttribute(page)).toBe('reduce')
  })

  test('choosing the defaults again leaves a record that says so, and no copy', async ({ page }) => {
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Keep motion').click()
    await expect.poll(() => motionAttribute(page)).toBe('full')
    await plate(page, 'Reduced motion', 'Follow my system').click()
    await expect.poll(() => motionAttribute(page)).toBeNull()
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:reduced-motion': 'system' })
    expect(await copy(page)).toBeNull()
  })

  test('the document carries the override from the first render on every page, with no ledger opened by the front page', async ({ page }) => {
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await expect.poll(() => motionAttribute(page)).toBe('reduce')
    await open(page, '/map')
    expect(await motionAttribute(page)).toBe('reduce')
    // A page that never opens the ledger still honours the choice, through the copy.
    await open(page, '/')
    expect(await motionAttribute(page)).toBe('reduce')
  })

  test('the record is the truth: with the copy gone, the Settings page reads `working` and writes the copy again', async ({ page }) => {
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await switchNamed(page, 'Game keys').click()
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:reduced-motion': 'reduce', 'settings:game-keys': false })
    await page.evaluate(() => localStorage.removeItem('es:settings'))
    await page.reload()
    await expect(plate(page, 'Reduced motion', 'Reduce motion')).toHaveAttribute('aria-pressed', 'true')
    await expect(switchNamed(page, 'Game keys')).toHaveAttribute('aria-checked', 'false')
    expect(await motionAttribute(page)).toBe('reduce')
    expect(JSON.parse((await copy(page)) ?? 'null')).toMatchObject({ 'settings:reduced-motion': 'reduce', 'settings:game-keys': false })
  })

  test('and where the record has nothing, the copy is dropped and the defaults return', async ({ page }) => {
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:reduced-motion': 'reduce' })
    // The browser's own clearing of the database, with the copy left behind.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('enginespace')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('working', 'readwrite')
            tx.objectStore('working').clear()
            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => reject(tx.error)
          }
        }),
    )
    await page.reload()
    await expect(plate(page, 'Reduced motion', 'Follow my system')).toHaveAttribute('aria-pressed', 'true')
    expect(await motionAttribute(page)).toBeNull()
    expect(await copy(page)).toBeNull()
  })
})

test.describe('settings apply live (accept 1)', () => {
  test('switching reduced motion on stops a running scene`s animation, in another tab of the browser', async ({ page, context }) => {
    await countFrames(page)
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await settle(page)
    // Slow the bell right down, so the slide the bell starts is still running when the setting changes: the scene reads the
    // role's value each time it starts a move, and a move that is running keeps the duration it began with.
    await page.evaluate(() => document.documentElement.style.setProperty('--es-dur-bell', '60000ms'))
    await bell(page).click()
    await expect(stage(page)).not.toHaveAttribute('data-settled', 'true')
    // A software renderer draws a few frames a second, so the check is that frames keep coming, not how many.
    const running = await frames(page)
    await expect.poll(() => frames(page), { message: 'the slide asks for frames while it runs', timeout: 15_000 }).toBeGreaterThan(running + 2)
    expect(await motionAttribute(page)).toBeNull()

    // The learner turns reduced motion on, in Settings, in another tab.
    const settings = await context.newPage()
    await open(settings, '/settings')
    await plate(settings, 'Reduced motion', 'Reduce motion').click()
    await expect(plate(settings, 'Reduced motion', 'Reduce motion')).toHaveAttribute('aria-pressed', 'true')

    // The scene hears it: the document carries the override, the slide ends where it was going, and the frames stop.
    await expect.poll(() => motionAttribute(page), { timeout: 10_000 }).toBe('reduce')
    await settle(page)
    const rest = await restsAfter(page)
    await page.waitForTimeout(2000)
    expect(await frames(page), 'no animation frame is requested once the scene has settled').toBe(rest)
    expect((await probe(page))?.p95, 'the governor sees no animation').toBeNull()
    await settings.close()
  })

  test('and a bell rung under reduced motion draws in place: a few frames, no animation, then nothing', async ({ page }) => {
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await expect.poll(() => motionAttribute(page)).toBe('reduce')
    await countFrames(page)
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await settle(page)
    const settled = await restsAfter(page)
    await page.waitForTimeout(2000)
    expect(await frames(page)).toBe(settled)
    await bell(page).click()
    await settle(page)
    const after = await restsAfter(page)
    expect(after, 'the bell drew in place').toBeGreaterThan(settled)
    await page.waitForTimeout(2000)
    expect(await frames(page)).toBe(after)
    expect((await probe(page))?.p95, 'the governor never sampled an animation').toBeNull()
  })

  test('turning reduced motion off again, with the system asking for it, brings the motion back', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await settle(page)
    await expect(page.locator('[data-motion-status]')).toHaveAttribute('data-motion-status', 'reduced')
    const settings = await context.newPage()
    await settings.emulateMedia({ reducedMotion: 'reduce' })
    await open(settings, '/settings')
    await plate(settings, 'Reduced motion', 'Keep motion').click()
    await expect.poll(() => motionAttribute(page)).toBe('full')
    await expect(page.locator('[data-motion-status]')).toHaveAttribute('data-motion-status', 'full')
    await expect(page.locator('[data-motion-status]')).toContainText('you chose it in Settings')
    await settings.close()
  })

  test('a quality cap lowers the tier the running scene draws at', async ({ page, context }) => {
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await settle(page)
    await expect(stage(page)).toHaveAttribute('data-tier', /[23]/)
    const before = (await probe(page))?.passes
    expect(before).toEqual(['scene', 'bloom', 'final'])

    const settings = await context.newPage()
    await open(settings, '/settings')
    await plate(settings, 'Quality cap', /Tier 1/).click()
    await expect(stage(page)).toHaveAttribute('data-tier', '1', { timeout: 10_000 })
    await settle(page)
    // T1 draws without post-processing: the bloom pass is gone from the frame.
    await expect.poll(async () => (await probe(page))?.passes, { timeout: 10_000 }).toEqual(['scene'])
    await settings.close()
  })

  test('3D off puts a live scene back to its 2D twin and says why, and 3D on brings the scene back', async ({ page, context }) => {
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await settle(page)
    await expect(stage(page).locator('canvas')).toHaveCount(1)

    const settings = await context.newPage()
    await open(settings, '/settings')
    await switchNamed(settings, 'Draw the games in 3D').click()
    await expect(switchNamed(settings, 'Draw the games in 3D')).toHaveAttribute('aria-checked', 'false')
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'twin', { timeout: 10_000 })
    await expect(stage(page).locator('canvas')).toHaveCount(0)
    await expect(stage(page).locator('.es-stage__twin svg.es-twin')).toBeVisible()
    await expect(stage(page).locator('[data-note="unavailable"]')).toContainText('3D is off in Settings')
    // The cap cannot be chosen while 3D is off, and the tape says what the pass does now.
    await expect(group(settings, 'Quality cap').getByRole('button').first()).toBeDisabled()
    await expect(settings.getByRole('figure', { name: 'What these settings do now' })).toContainText('3D is off in Settings')

    await switchNamed(settings, 'Draw the games in 3D').click()
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 20_000 })
    await expect(stage(page).locator('canvas')).toHaveCount(1)
    await expect(stage(page).locator('[data-note="unavailable"]')).toHaveCount(0)
    await settings.close()
  })

  test('the box is never blank while the scene comes back: the 2D twin stays until the new scene has drawn a frame', async ({ page, context }) => {
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await settle(page)
    const settings = await context.newPage()
    await open(settings, '/settings')
    await switchNamed(settings, 'Draw the games in 3D').click()
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'twin', { timeout: 10_000 })
    // Watch every state the Stage passes through on the way back. Whenever the twin is gone, the new scene must have drawn: it has
    // registered its counts (`info()` is null until its first frame), and its canvas is there.
    await page.evaluate(() => {
      const box = document.querySelector('[data-stage="specimen"]')
      const seen: { phase: string | null; twin: boolean; drawn: boolean }[] = []
      const look = () =>
        seen.push({
          phase: box?.getAttribute('data-stage-phase') ?? null,
          twin: box?.querySelector('.es-stage__twin') != null,
          drawn: (window.__esScene as { probes: Record<string, { info(): unknown }> } | undefined)?.probes.specimen?.info() != null,
        })
      ;(window as unknown as { __phases: typeof seen }).__phases = seen
      new MutationObserver(look).observe(box as Node, { attributes: true, childList: true, subtree: true })
    })
    await switchNamed(settings, 'Draw the games in 3D').click()
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 20_000 })
    await expect(stage(page).locator('.es-stage__twin')).toHaveCount(0, { timeout: 10_000 })
    const seen = await page.evaluate(() => (window as unknown as { __phases: { phase: string | null; twin: boolean; drawn: boolean }[] }).__phases)
    expect(seen.length).toBeGreaterThan(0)
    const blank = seen.filter((entry) => !entry.twin && !entry.drawn)
    expect(blank, `the box was blank: ${JSON.stringify(seen)}`).toEqual([])
    await settings.close()
  })
})

test.describe('settings decide before anything is fetched', () => {
  test('with 3D off, a page that would draw a scene requests none of the 3D chunks, and a cap of tier 1 never requests the post-processing chunk', async ({ page, requests }) => {
    await open(page, '/settings')
    await switchNamed(page, 'Draw the games in 3D').click()
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:3d': false })
    expect(JSON.parse((await copy(page)) ?? 'null')).toMatchObject({ 'settings:3d': false })
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await expect(stage(page)).toHaveAttribute('data-stage-phase', 'twin')
    await expect(stage(page)).toHaveAttribute('data-tier', '0')
    await expect(stage(page).locator('[data-note="unavailable"]')).toContainText('3D is off in Settings')
    await page.waitForTimeout(1500)
    expect(requests.filter((request) => /three-vendor|SpecimenScene3D|postfx/.test(request))).toEqual([])

    // Back on, with the cap at tier 1: the scene loads, and bloom, which belongs to tier 2 and up, never does.
    await open(page, '/settings')
    await switchNamed(page, 'Draw the games in 3D').click()
    await expect(switchNamed(page, 'Draw the games in 3D')).toHaveAttribute('aria-checked', 'true')
    await plate(page, 'Quality cap', /Tier 1/).click()
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:3d': true, 'settings:tier-cap': 1 })
    await open(page, '/design')
    await page.locator('#scene-kit').scrollIntoViewIfNeeded()
    await settle(page)
    await expect(stage(page)).toHaveAttribute('data-tier', '1')
    expect(requests.some((request) => /SpecimenScene3D/.test(request))).toBe(true)
    expect(requests.filter((request) => /postfx/.test(request))).toEqual([])
    expect((await probe(page))?.passes).toEqual(['scene'])
  })
})

test.describe('settings reach the game shell', () => {
  test('game keys off unbinds a game`s keys in a game that is open, and on binds them again', async ({ page, context }) => {
    await open(page, '/play/loop?level=first-3-gap')
    const game = page.locator('section[data-game="loop"]')
    const overlap = page.getByRole('switch')
    await expect(overlap).toHaveAttribute('aria-checked', 'false')
    await game.focus()
    await page.keyboard.press('KeyO')
    await expect(overlap).toHaveAttribute('aria-checked', 'true')
    // The switch is still a switch: a pointer puts it back.
    await overlap.click()
    await expect(overlap).toHaveAttribute('aria-checked', 'false')

    const settings = await context.newPage()
    await open(settings, '/settings')
    await switchNamed(settings, 'Game keys').click()
    await expect(switchNamed(settings, 'Game keys')).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => copy(page)).not.toBeNull()
    // The shell has heard it by now (a `storage` event is delivered within a task): the same key does nothing, however often it is pressed.
    await page.waitForTimeout(400)
    await game.focus()
    for (let press = 0; press < 3; press++) await page.keyboard.press('KeyO')
    await expect(overlap).toHaveAttribute('aria-checked', 'false')
    // Its own button still works with the keys off.
    await overlap.click()
    await expect(overlap).toHaveAttribute('aria-checked', 'true')
    await overlap.click()
    await expect(overlap).toHaveAttribute('aria-checked', 'false')

    await switchNamed(settings, 'Game keys').click()
    await expect(switchNamed(settings, 'Game keys')).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(async () => {
        await game.focus()
        await page.keyboard.press('KeyO')
        return overlap.getAttribute('aria-checked')
      })
      .toBe('true')
    await settings.close()
  })

  test('with 3D off, a game opens in its 2D view, says why beside the disabled 3D button, shows no camera buttons and fetches no 3D chunk, and 3D on brings the 3D view back', async ({ page, context, requests }) => {
    await open(page, '/settings')
    await switchNamed(page, 'Draw the games in 3D').click()
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:3d': false })
    await open(page, '/play/loop?level=first-3-gap')
    const game = page.locator('section[data-game="loop"]')
    await expect(game).toHaveAttribute('data-view', '2d')
    const views = page.getByRole('group', { name: 'View', exact: true })
    await expect(views.getByRole('button', { name: '3D view' })).toBeDisabled()
    await expect(views.getByRole('button', { name: '2D view' })).toHaveAttribute('aria-pressed', 'true')
    await expect(views).toContainText('3D is off in Settings')
    await expect(page.getByRole('group', { name: 'Camera on the pass' })).toHaveCount(0)
    // `V` has nowhere to go, and `C` has no camera to move.
    await game.focus()
    await page.keyboard.press('KeyV')
    await page.keyboard.press('KeyC')
    await expect(game).toHaveAttribute('data-view', '2d')
    await page.waitForTimeout(1500)
    expect(requests.filter((request) => /three-vendor|Scene3D|postfx/.test(request))).toEqual([])

    // 3D on, in another tab: the open game goes to its 3D view by itself, as it does on a device that draws it.
    const settings = await context.newPage()
    await open(settings, '/settings')
    await switchNamed(settings, 'Draw the games in 3D').click()
    await expect(switchNamed(settings, 'Draw the games in 3D')).toHaveAttribute('aria-checked', 'true')
    await expect(game).toHaveAttribute('data-view', '3d', { timeout: 20_000 })
    await expect(views.getByRole('button', { name: '3D view' })).toBeEnabled()
    await expect(page.getByRole('group', { name: 'Camera on the pass' })).toBeVisible()
    await settings.close()
  })
})

// ------------------------------------------------------------------------------------------------ /design: motion

test.describe('/design: the bell runs the four motions', () => {
  const MOTIONS = [
    ['press', '0.12s'],
    ['strike', '0.24s'],
    ['feed', '0.42s'],
    ['course', '0.64s'],
  ] as const
  const puck = (page: Page, id: string) => page.locator(`[data-motion-row="${id}"] .es-spec__motion-puck`)
  const runner = (page: Page, id: string) => page.locator(`[data-motion-row="${id}"] .es-spec__motion-track`)
  const ring = (page: Page) => page.locator('.es-spec__motion-deck').getByRole('button', { name: 'Ring the bell' }).click()

  /** How far along its runner a plate has come, from 0 to 1. */
  async function travelled(page: Page, id: string): Promise<number> {
    const [plate, track] = await Promise.all([puck(page, id).boundingBox(), runner(page, id).boundingBox()])
    if (!plate || !track) throw new Error('no runner')
    return (plate.x - track.x) / (track.width - plate.width)
  }

  test('nothing moves until it is rung, and then each plate runs for the duration of its role and rests at the end', async ({ page }) => {
    await open(page, '/design')
    await page.locator('#motion').scrollIntoViewIfNeeded()
    for (const [id] of MOTIONS) expect(await travelled(page, id), `${id} waits at the start`).toBeLessThan(0.1)
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === 'es-spec-motion-run').length)).toBe(0)

    await ring(page)
    for (const [id, seconds] of MOTIONS) {
      const style = await puck(page, id).evaluate((element) => {
        const computed = getComputedStyle(element)
        return { name: computed.animationName, duration: computed.animationDuration, count: computed.animationIterationCount, fill: computed.animationFillMode }
      })
      expect(style, id).toEqual({ name: 'es-spec-motion-run', duration: seconds, count: '1', fill: 'both' })
    }
    // Every plate finishes, and rests at the end of its runner. (The course is most of the way there long before it is done: its easing
    // is fast away and a long rest, so the check waits for the animations themselves.)
    await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === 'es-spec-motion-run').map((animation) => animation.finished)))
    for (const [id] of MOTIONS) expect(await travelled(page, id), `${id} rests at the end`).toBeGreaterThan(0.95)
    await expect(page.getByRole('status').filter({ hasText: 'The four motions ran.' })).toHaveCount(1)
  })

  test('the quick one is done before the slow one has left, so the durations can be told apart by eye', async ({ page }) => {
    await open(page, '/design')
    await page.locator('#motion').scrollIntoViewIfNeeded()
    await ring(page)
    // Pause every running animation half way through the longest, and read how far each got.
    const along = await page.evaluate(async () => {
      const animations = document.getAnimations().filter((animation) => (animation as CSSAnimation).animationName === 'es-spec-motion-run')
      for (const animation of animations) {
        animation.pause()
        animation.currentTime = 300
      }
      await new Promise((resolve) => requestAnimationFrame(resolve))
      return animations.map((animation) => Number(animation.effect?.getComputedTiming().progress ?? 0))
    })
    // At 300 ms: the 120 ms and 240 ms motions are done, the 420 ms feed is part way (in steps), the 640 ms course is not half done.
    expect(along[0]).toBe(1)
    expect(along[1]).toBe(1)
    expect(along[2]).toBeGreaterThan(0.5)
    expect(along[2]).toBeLessThan(1)
    expect(along[3]).toBeLessThan(0.5)
  })

  test('under reduced motion the plates go straight to the end, and the page says motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/design')
    await page.locator('#motion').scrollIntoViewIfNeeded()
    await expect(page.locator('[data-motion-status]')).toHaveAttribute('data-motion-status', 'reduced')
    await expect(page.locator('[data-motion-status]')).toContainText('your system asks for it')
    await ring(page)
    for (const [id] of MOTIONS) {
      expect(await puck(page, id).evaluate((element) => getComputedStyle(element).animationDuration), id).toBe('0.001s')
      await expect.poll(() => travelled(page, id), { timeout: 3000 }).toBeGreaterThan(0.95)
    }
    await expect(page.getByRole('status').filter({ hasText: 'Motion is reduced, so the four motions went straight to their end.' })).toHaveCount(1)
  })

  test('and the learner`s own choice in Settings decides it either way, whatever the system asks', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/design')
    await page.locator('#motion').scrollIntoViewIfNeeded()
    const settings = await context.newPage()
    await open(settings, '/settings')
    await plate(settings, 'Reduced motion', 'Keep motion').click()
    await expect(page.locator('[data-motion-status]')).toHaveAttribute('data-motion-status', 'full', { timeout: 10_000 })
    await ring(page)
    expect(await puck(page, 'course').evaluate((element) => getComputedStyle(element).animationDuration)).toBe('0.64s')
    await settings.close()
  })
})

// ------------------------------------------------------------------------------------------------ the ledger's files

/** One valid event of every kind, as the ledger's own tests hold them: four in tr2, two in tr8, and four that name no module. */
const everyKind = (): LedgerEvent[] => (Object.values(EXAMPLES) as LedgerEvent[]).map((event) => clone(event))
const AT = '2026-11-03T09:30:00.000Z'

/** An export file as the browser's own Export writes it, made here with the ledger's own code. */
function exportText(events: LedgerEvent[], device = 'dev-e2e-0001'): string {
  return serializeExport(buildExport({ ledger: { events, receipts: [] }, device, exportedAt: AT }))
}

const asFile = (text: string, name = 'backup.json') => ({ name, mimeType: 'application/json', buffer: Buffer.from(text) })

const fileInput = (page: Page) => page.locator('input[type="file"]').first()
const importPreview = (page: Page) => page.getByRole('region', { name: 'Import preview' })

/** Chooses a file in the Import panel, and waits for the preview to say what it would do. */
async function choose(page: Page, text: string, name = 'backup.json') {
  await fileInput(page).setInputFiles(asFile(text, name))
  await expect(importPreview(page)).toBeVisible()
}

/** Imports events by merge: choose, read the preview, and merge. */
async function importEvents(page: Page, events: LedgerEvent[]) {
  await choose(page, exportText(events))
  await importPreview(page).getByRole('button', { name: 'Import and merge' }).click()
  await expect(importPreview(page)).toBeHidden()
  await expect(page.getByRole('figure', { name: 'The import, printed' })).toBeVisible()
}

/** The number a table row prints through the readout, or 0 where it prints a dash. */
async function counted(row: ReturnType<Page['locator']>): Promise<number> {
  const data = row.locator('data')
  return (await data.count()) === 0 ? 0 : Number(await data.first().getAttribute('value'))
}

const kindRow = (page: Page, kind: string) => page.locator(`table[data-table="kind"] tr[data-kind="${kind}"]`)
const moduleRow = (page: Page, module: string) => page.locator(`table[data-table="module"] tr[data-module="${module}"]`)
const tapeLine = (page: Page, tape: string, label: string) => page.getByRole('figure', { name: tape }).locator('.es-printer__line', { has: page.getByText(label, { exact: true }) })

/** Rows of one store of IndexedDB, as the browser holds them. */
function stored(page: Page, store: 'events' | 'receipts' | 'working' | 'checkpoints'): Promise<{ id?: string; key?: string }[]> {
  return page.evaluate(
    (name) =>
      new Promise<{ id?: string; key?: string }[]>((resolve, reject) => {
        const request = indexedDB.open('enginespace')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const all = db.transaction(name, 'readonly').objectStore(name).getAll()
          all.onerror = () => reject(all.error)
          all.onsuccess = () => {
            db.close()
            resolve(all.result as { id?: string; key?: string }[])
          }
        }
      }),
    store,
  )
}

const idsStored = async (page: Page) => (await stored(page, 'events')).map((row) => row.id).sort()

async function downloaded(download: Download): Promise<{ name: string; text: string; raw: Buffer }> {
  const file = await download.path()
  const raw = readFileSync(file)
  const text = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8')
  return { name: download.suggestedFilename(), text, raw }
}

test.describe('/evidence: counts by kind and module, with export and import', () => {
  test('an empty ledger is a blank ticket with the way to the menu, and the means to import', async ({ page }) => {
    await open(page, '/evidence')
    await expect(page.getByRole('heading', { level: 1, name: 'Evidence' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing in the ledger yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Open the menu/ })).toHaveAttribute('href', '/map')
    await expect(page.locator('table')).toHaveCount(0)
    await expect(tapeLine(page, 'Where your evidence is kept', 'kept in')).toContainText('IndexedDB')
    await expect(tapeLine(page, 'Where your evidence is kept', 'last export')).toContainText('never')
    await expect(page.getByRole('button', { name: 'Export evidence' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Choose a file' })).toBeVisible()
  })

  test('an import is previewed, merged, counted by kind and by module, and undone', async ({ page }) => {
    await open(page, '/evidence')
    const events = everyKind()
    await choose(page, exportText(events))
    // The preview says what the file holds and what merging it would do, and nothing is written yet.
    const preview = importPreview(page)
    await expect(preview).toContainText('events in the file')
    await expect(preview.locator('.es-ticket-line', { hasText: 'events in the file' }).locator('data')).toHaveAttribute('value', '10')
    await expect(preview.locator('.es-ticket-line', { hasText: 'new here' }).locator('data')).toHaveAttribute('value', '10')
    await expect(preview.getByRole('button', { name: 'Merge', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await idsStored(page)).toEqual([])

    await preview.getByRole('button', { name: 'Import and merge' }).click()
    await expect(page.getByRole('figure', { name: 'The import, printed' })).toContainText('merge')
    await expect(page.getByRole('heading', { level: 2, name: 'By kind' })).toBeVisible()
    expect(await idsStored(page)).toEqual(events.map((event) => event.id).sort())

    // By kind: one of each, ten in all; the two that carry no result are marked.
    for (const kind of ['predict', 'item', 'play', 'lab-check', 'prove', 'trace-mark', 'challenge', 'receipt', 'review', 'ack']) expect(await counted(kindRow(page, kind)), kind).toBe(1)
    await expect(page.locator('table[data-table="kind"] tfoot')).toContainText('All events')
    expect(await counted(page.locator('table[data-table="kind"] tfoot tr'))).toBe(10)
    await expect(kindRow(page, 'challenge')).toContainText('not graded')
    await expect(kindRow(page, 'ack')).toContainText('not graded')
    await expect(kindRow(page, 'play')).not.toContainText('not graded')
    // By module: the prediction, the item, the game run and the review are tr2's, the challenge and the receipt tr8's.
    expect(await counted(moduleRow(page, 'tr2'))).toBe(4)
    expect(await counted(moduleRow(page, 'tr8'))).toBe(2)
    expect(await counted(moduleRow(page, 'none'))).toBe(4)
    expect(await counted(moduleRow(page, 'tr0'))).toBe(0)
    await expect(moduleRow(page, 'tr2')).toContainText('The step loop')
    await expect(moduleRow(page, 'tr2').getByRole('link', { name: 'tr2' })).toHaveAttribute('href', '/m/tr2')
    expect(await counted(page.locator('table[data-table="module"] tfoot tr'))).toBe(10)
    // The tape agrees with the tables.
    await expect(tapeLine(page, 'Where your evidence is kept', 'events').locator('data')).toHaveAttribute('value', '10')

    // The import can be taken back.
    await expect(page.getByText(/Last import: a merge on/)).toBeVisible()
    await page.getByRole('button', { name: 'Undo the last import' }).click()
    await expect(page.getByText('The import was undone.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing in the ledger yet' })).toBeVisible()
    expect(await idsStored(page)).toEqual([])
    await expect(page.getByRole('button', { name: 'Undo the last import' })).toHaveCount(0)
  })

  test('a count changes in a second tab within a second of the import', async ({ page, context }) => {
    await open(page, '/evidence')
    const other = await context.newPage()
    await open(other, '/evidence')
    await expect(other.getByRole('heading', { level: 2, name: 'Nothing in the ledger yet' })).toBeVisible()
    await importEvents(page, everyKind())
    await expect(other.getByRole('heading', { level: 2, name: 'By kind' })).toBeVisible({ timeout: 1000 })
    expect(await counted(kindRow(other, 'play'))).toBe(1)
    await other.close()
  })

  test('export writes one file of the ledger, and a second import of it changes nothing', async ({ page }) => {
    await open(page, '/evidence')
    const events = everyKind()
    await importEvents(page, events)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export evidence' }).click()])
    const file = await downloaded(download)
    expect(file.name).toMatch(/^enginespace-export-\d{4}-\d{2}-\d{2}\.json$/)
    const written = JSON.parse(file.text) as { schema: string; schemaVersion: number; events: LedgerEvent[]; receipts: unknown[] }
    expect(written.schema).toBe('enginespace/export@1')
    // Byte for byte the events that went in: export is the canonical form, and the same ledger gives the same bytes.
    expect(written.events).toEqual((JSON.parse(exportText(events)) as { events: LedgerEvent[] }).events)
    // The tape prints what was saved, and the last export is dated.
    await expect(page.getByRole('figure', { name: 'The export, printed' })).toContainText(file.name)
    await expect(page.getByRole('figure', { name: 'The export, printed' }).locator('.es-printer__line', { hasText: 'events' }).locator('data')).toHaveAttribute('value', '10')
    await expect(tapeLine(page, 'Where your evidence is kept', 'last export')).not.toContainText('never')

    // The file goes back in: everything in it is here already, so nothing changes and nothing is kept to undo.
    await page.getByRole('button', { name: 'Undo the last import' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing in the ledger yet' })).toBeVisible()
    await choose(page, file.text, file.name)
    await importPreview(page).getByRole('button', { name: 'Import and merge' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'By kind' })).toBeVisible()
    expect(await idsStored(page)).toEqual(events.map((event) => event.id).sort())
    await choose(page, file.text, file.name)
    await expect(importPreview(page).locator('.es-ticket-line', { hasText: 'new here' }).locator('data')).toHaveAttribute('value', '0')
    await importPreview(page).getByRole('button', { name: 'Import and merge' }).click()
    await expect(page.getByText(/Nothing changed: everything in .* was here already\./)).toBeVisible()
  })

  test('a compressed export is a gzip file, and import reads it by its bytes', async ({ page }) => {
    await open(page, '/evidence')
    const events = everyKind()
    await importEvents(page, events)
    await page.getByRole('switch', { name: 'Compress the file' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export evidence' }).click()])
    const file = await downloaded(download)
    expect(file.name).toMatch(/\.json\.gz$/)
    expect(file.raw[0]).toBe(0x1f)
    expect(file.raw[1]).toBe(0x8b)
    expect((JSON.parse(file.text) as { events: unknown[] }).events).toHaveLength(10)
    await expect(page.getByRole('figure', { name: 'The export, printed' })).toContainText('size, gzip')

    await page.getByRole('button', { name: 'Undo the last import' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing in the ledger yet' })).toBeVisible()
    await fileInput(page).setInputFiles({ name: 'renamed.txt', mimeType: 'application/octet-stream', buffer: file.raw })
    await expect(importPreview(page)).toBeVisible()
    await expect(importPreview(page)).toContainText('renamed.txt')
    await expect(importPreview(page).locator('.es-ticket-line', { hasText: 'new here' }).locator('data')).toHaveAttribute('value', '10')
  })

  test('replace says what it would remove, and an undo puts it all back', async ({ page }) => {
    await open(page, '/evidence')
    const mine = everyKind()
    await importEvents(page, mine)
    const theirs = [{ ...clone(EXAMPLES.item), id: 'theirs-1' }, { ...clone(EXAMPLES.play), id: 'theirs-2' }] as LedgerEvent[]
    await choose(page, exportText(theirs, 'dev-e2e-0002'), 'theirs.json')
    await importPreview(page).getByRole('button', { name: 'Replace', exact: true }).click()
    await expect(importPreview(page).getByRole('button', { name: 'Replace', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(importPreview(page).locator('.es-ticket-line', { hasText: 'not in the file: removed' }).locator('data')).toHaveAttribute('value', '10')
    await expect(importPreview(page).getByRole('button', { name: 'Import and replace' })).toBeVisible()
    // Nothing is written until the stub is pulled.
    expect(await idsStored(page)).toEqual(mine.map((event) => event.id).sort())

    await importPreview(page).getByRole('button', { name: 'Import and replace' }).click()
    await expect(page.getByRole('figure', { name: 'The import, printed' })).toContainText('replace')
    expect(await idsStored(page)).toEqual(['theirs-1', 'theirs-2'])
    expect(await counted(kindRow(page, 'item'))).toBe(1)
    await expect(page.getByText(/Last import: a replace on/)).toBeVisible()

    await page.getByRole('button', { name: 'Undo the last import' }).click()
    await expect(page.getByText('The import was undone.')).toBeVisible()
    expect(await idsStored(page)).toEqual(mine.map((event) => event.id).sort())
  })

  test('cancelling a preview writes nothing', async ({ page }) => {
    await open(page, '/evidence')
    await choose(page, exportText(everyKind()))
    await importPreview(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(importPreview(page)).toBeHidden()
    expect(await idsStored(page)).toEqual([])
    await expect(page.getByRole('heading', { level: 2, name: 'Nothing in the ledger yet' })).toBeVisible()
  })

  test('a clash, where one id says two things, is counted in the preview', async ({ page }) => {
    await open(page, '/evidence')
    await importEvents(page, [{ ...clone(EXAMPLES.item), id: 'same-id' }] as LedgerEvent[])
    await choose(page, exportText([{ ...clone(EXAMPLES.item), id: 'same-id', ref: 'item:gen/tr2.bubble-width/other' }] as LedgerEvent[]), 'clash.json')
    await expect(importPreview(page).locator('.es-ticket-line', { hasText: 'clash: same id' }).locator('data')).toHaveAttribute('value', '1')
  })

  test.describe('a file that is not ours is refused whole', () => {
    for (const [what, text, reason] of [
      ['text that is not JSON', 'this is not json', "this file isn't valid JSON"],
      ['JSON that is not an export', '{"hello":1}', "this file isn't an enginespace export"],
    ] as const) {
      test(what, async ({ page }) => {
        await open(page, '/evidence')
        await fileInput(page).setInputFiles(asFile(text, 'bad.json'))
        const refused = page.getByRole('region', { name: /Import refused|Nothing was changed/ })
        await expect(page.getByRole('heading', { name: 'Nothing was changed' })).toBeVisible()
        await expect(page.getByRole('alert').filter({ hasText: reason })).toBeVisible()
        await expect(importPreview(page)).toHaveCount(0)
        expect(await idsStored(page)).toEqual([])
        void refused
      })
    }

    test('one damaged record refuses the file, and says where', async ({ page }) => {
      await open(page, '/evidence')
      const parsed = JSON.parse(exportText(everyKind())) as { events: Record<string, unknown>[] }
      parsed.events[2].score = 9
      await fileInput(page).setInputFiles(asFile(JSON.stringify(parsed), 'edited.json'))
      await expect(page.getByRole('alert').filter({ hasText: 'events[2]' })).toBeVisible()
      expect(await idsStored(page)).toEqual([])
    })
  })
})

// ------------------------------------------------------------------------------------------------ 2. reset

test.describe('reset asks first, and offers an export (accept 2)', () => {
  test('the question names what would go, offers an export before anything is erased, and keeps everything on Cancel and on Escape', async ({ page }) => {
    await open(page, '/evidence')
    await importEvents(page, everyKind())
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await plate(page, 'Quality cap', /Tier 2/).click()
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:reduced-motion': 'reduce', 'settings:tier-cap': 2 })

    const reset = page.getByRole('button', { name: 'Reset this device' })
    await reset.click()
    const dialog = page.getByRole('dialog', { name: 'Erase this device?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('There is no copy anywhere else, and it cannot be undone.')
    await expect(dialog.locator('.es-ticket-line', { hasText: 'graded results' }).locator('data')).toHaveAttribute('value', '10')
    await expect(dialog).toContainText('settings, back to their defaults')
    // The export is offered before the erasing, and holds the focus when the question opens.
    await expect(dialog.getByRole('button', { name: 'Export a copy first' })).toBeFocused()
    const buttons = await dialog.getByRole('button').allInnerTexts()
    expect(buttons.map((text) => text.trim().toLowerCase())).toEqual(['export a copy first', 'keep everything', 'erase everything'])
    // Nothing has been erased by asking.
    expect(await idsStored(page)).toHaveLength(10)

    // Cancel: nothing is erased, and focus goes back to the button that asked.
    await dialog.getByRole('button', { name: 'Keep everything' }).click()
    await expect(dialog).toBeHidden()
    await expect(reset).toBeFocused()
    expect(await idsStored(page)).toHaveLength(10)

    // Escape does the same.
    await reset.click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(reset).toBeFocused()
    expect(await idsStored(page)).toHaveLength(10)
    expect(await settingsRecord(page)).toEqual({ 'settings:reduced-motion': 'reduce', 'settings:tier-cap': 2 })
    expect(await motionAttribute(page)).toBe('reduce')
  })

  test('the export it offers is a real file of the ledger, and erasing then clears the evidence, the undo points and the settings', async ({ page }) => {
    await open(page, '/evidence')
    const events = everyKind()
    await importEvents(page, events)
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await switchNamed(page, 'Game keys').click()
    await expect.poll(() => motionAttribute(page)).toBe('reduce')
    expect(await stored(page, 'checkpoints')).toHaveLength(1)

    await page.getByRole('button', { name: 'Reset this device' }).click()
    const dialog = page.getByRole('dialog', { name: 'Erase this device?' })
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export a copy first' }).click()])
    const file = await downloaded(download)
    expect((JSON.parse(file.text) as { events: unknown[] }).events).toHaveLength(10)
    await expect(dialog).toContainText(`Saved ${file.name}`)
    // Working records are device settings, and are never in the file.
    expect(file.text).not.toContain('settings:')

    await dialog.getByRole('button', { name: 'Erase everything' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('This device is erased. The settings are back to their defaults.')).toBeVisible()
    // The evidence, the receipts, the undo points and the settings are gone, from the browser's own stores.
    expect(await stored(page, 'events')).toEqual([])
    expect(await stored(page, 'checkpoints')).toEqual([])
    expect(await settingsRecord(page)).toEqual({})
    expect(await copy(page)).toBeNull()
    // And the page is at its defaults, live.
    await expect(plate(page, 'Reduced motion', 'Follow my system')).toHaveAttribute('aria-pressed', 'true')
    await expect(switchNamed(page, 'Game keys')).toHaveAttribute('aria-checked', 'true')
    expect(await motionAttribute(page)).toBeNull()
    await expect(tapeLine(page, 'Where your evidence is kept', 'events').locator('data')).toHaveCount(1)
    await expect(tapeLine(page, 'Where your evidence is kept', 'events').locator('data')).toHaveAttribute('value', '0')

    // The file brings it all back.
    await open(page, '/evidence')
    await choose(page, file.text, file.name)
    await importPreview(page).getByRole('button', { name: 'Import and merge' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'By kind' })).toBeVisible()
    expect(await idsStored(page)).toEqual(events.map((event) => event.id).sort())
  })

  test('another tab hears the reset: its settings go back to the defaults', async ({ page, context }) => {
    await open(page, '/settings')
    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await expect.poll(() => motionAttribute(page)).toBe('reduce')
    const other = await context.newPage()
    await open(other, '/map')
    expect(await motionAttribute(other)).toBe('reduce')
    await page.getByRole('button', { name: 'Reset this device' }).click()
    await page.getByRole('dialog', { name: 'Erase this device?' }).getByRole('button', { name: 'Erase everything' }).click()
    await expect.poll(() => motionAttribute(other)).toBeNull()
    await other.close()
  })
})

// ------------------------------------------------------------------------------------------------ a failure the learner must see

test.describe('a tab that has gone read-only (A§7.4)', () => {
  test('saves no setting and applies none, and says so at the control', async ({ page }) => {
    await open(page, '/settings')
    await expect(plate(page, 'Reduced motion', 'Follow my system')).toHaveAttribute('aria-pressed', 'true')
    // A newer build of the site owns this browser's data: its schema version is ahead of this build's.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('enginespace')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            const tx = db.transaction('meta', 'readwrite')
            tx.objectStore('meta').put({ key: 'schemaVersion', value: 2 })
            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onerror = () => reject(tx.error)
          }
        }),
    )
    await page.reload()
    await expect(page.getByRole('alert').filter({ hasText: 'Reload to update' })).toBeVisible()

    await plate(page, 'Reduced motion', 'Reduce motion').click()
    await expect(page.getByRole('alert').filter({ hasText: /Not saved:/ })).toBeVisible()
    // The choice is applied nowhere: not on the control, not on the document, and not in the copy that the front page reads.
    await expect(plate(page, 'Reduced motion', 'Follow my system')).toHaveAttribute('aria-pressed', 'true')
    await expect(plate(page, 'Reduced motion', 'Reduce motion')).toHaveAttribute('aria-pressed', 'false')
    expect(await motionAttribute(page)).toBeNull()
    expect(await copy(page)).toBeNull()
    // The same goes for a switch.
    await switchNamed(page, 'Game keys').click()
    await expect(switchNamed(page, 'Game keys')).toHaveAttribute('aria-checked', 'true')
    expect(await copy(page)).toBeNull()
    // And an export says why it made no file.
    await page.getByRole('button', { name: 'Export evidence' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /Not exported:/ })).toBeVisible()
  })
})

// ------------------------------------------------------------------------------------------------ the pages, as a keyboard and a screen reader meet them

test.describe('the keyboard', () => {
  test('every control of /settings is reached by Tab and works with Enter and Space', async ({ page }) => {
    await open(page, '/settings')
    const reached: string[] = []
    for (let press = 0; press < 40; press++) {
      await page.keyboard.press('Tab')
      const name = await page.evaluate(() => {
        const element = document.activeElement
        if (element === null || element === document.body) return ''
        const role = element.getAttribute('role') ?? element.tagName.toLowerCase()
        const label = element.getAttribute('aria-label') ?? (element.textContent ?? '').trim().slice(0, 40)
        return `${role}: ${label}`
      })
      reached.push(name)
    }
    const names = reached.join('\n')
    for (const control of ['switch', 'Tier 1 · light', 'Follow my system', 'Reduce motion', 'Keep motion', 'Export evidence', 'Choose a file', 'Reset this device']) expect(names).toContain(control)

    // Enter on a plate presses it, and Space on a switch flips it.
    await plate(page, 'Reduced motion', 'Keep motion').focus()
    await page.keyboard.press('Enter')
    await expect(plate(page, 'Reduced motion', 'Keep motion')).toHaveAttribute('aria-pressed', 'true')
    await switchNamed(page, 'Game keys').focus()
    await page.keyboard.press('Space')
    await expect(switchNamed(page, 'Game keys')).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => settingsRecord(page)).toEqual({ 'settings:reduced-motion': 'full', 'settings:game-keys': false })
  })

  test('the question of the reset holds focus inside it, and gives it back', async ({ page }) => {
    await open(page, '/settings')
    await page.getByRole('button', { name: 'Reset this device' }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Erase this device?' })
    await expect(dialog).toBeVisible()
    for (let press = 0; press < 8; press++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Reset this device' })).toBeFocused()
  })
})

// ------------------------------------------------------------------------------------------------ A§11.2: axe and reflow

const WIDTHS = [360, 1280] as const

/** axe-core/playwright is typed against playwright-core's own Page, which a newer @playwright/test has outgrown by two members. */
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]['page']

async function violations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.impact} ${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)
}

test.describe('axe finds no serious or critical violation (A§11.2)', () => {
  for (const width of WIDTHS) {
    test(`/settings at ${width} px, and with the question of the reset open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/settings')
      await expect(page.getByRole('figure', { name: 'What these settings do now' })).toContainText('3D')
      expect(await violations(page)).toEqual([])
      await page.getByRole('button', { name: 'Reset this device' }).click()
      await expect(page.getByRole('dialog', { name: 'Erase this device?' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test(`/evidence at ${width} px, empty and with a ledger and a preview`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/evidence')
      await expect(page.getByRole('heading', { level: 2, name: 'Nothing in the ledger yet' })).toBeVisible()
      expect(await violations(page)).toEqual([])
      await importEvents(page, everyKind())
      await expect(moduleRow(page, 'tr2')).toContainText('The step loop')
      expect(await violations(page)).toEqual([])
      await choose(page, exportText([{ ...clone(EXAMPLES.item), id: 'other' }] as LedgerEvent[]), 'other.json')
      expect(await violations(page)).toEqual([])
      await fileInput(page).setInputFiles(asFile('nonsense', 'bad.json'))
      await expect(page.getByRole('heading', { name: 'Nothing was changed' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test(`/design at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/design')
      await page.locator('#motion').scrollIntoViewIfNeeded()
      await page.locator('.es-spec__motion-deck').getByRole('button', { name: 'Ring the bell' }).click()
      expect(await violations(page)).toEqual([])
    })
  }
})

test.describe('the pages reflow to 320 px with no sideways scroll (WCAG 1.4.10)', () => {
  for (const route of ['/settings', '/evidence', '/design']) {
    test(route, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 })
      await open(page, route)
      if (route === '/evidence') await importEvents(page, everyKind())
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client)
      // Nothing a learner presses is narrower than 24 px (WCAG 2.5.8).
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main button, main [role="switch"], main a')]
          .filter((element) => {
            const box = element.getBoundingClientRect()
            return box.width > 0 && box.height > 0 && (box.width < 24 || box.height < 24) && getComputedStyle(element).display !== 'inline'
          })
          .map((element) => `${element.tagName.toLowerCase()} ${element.textContent?.trim().slice(0, 30) ?? ''}`),
      )
      expect(small).toEqual([])
    })
  }
})
