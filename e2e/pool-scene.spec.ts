/*
 * W1-T24's acceptance checks for the Reach-In's 3D scene, in Playwright's Chromium, through `/play/pool`:
 *
 *   1. At most 100 draw calls over a whole night, read from the scene's own `renderer.info` (A§11.1), at T1 and at T2: the house's nights
 *      on `adapters`, where kits land and are strung, and on `same-size`, the most stations and so the most twine at once.
 *   2. Under reduced motion the threads update per op without layout jumps: each decision redraws the night at once, in a frame or two
 *      and not an animation, the scene's box does not move, and then no animation frame is asked for.
 *   And the rest of the scene's contract (A§6.8): `V` swaps 2D and 3D and keeps the night; `C` and the plates reach every preset, and One
 *   station draws only the station its buttons pick; the capture is not blank at 1440 and at 390 px; every number is DOM, the scene
 *   carries no word and no number of its own, and what the fan shows is said on the page.
 *   (The scene's chunk at most 40 KB gz is a build check, verify:bundle's gate; tests/play/pool-scene.test.ts holds the layout, the
 *   presets' framing and the text, and tests/design/literals.test.ts the colours.)
 *
 * How it runs, as e2e/loop-scene.spec.ts does: one test build with `VITE_ES_TEST_HOOKS=1` (it exposes `window.__esScene` and honours
 * `?es-tier=<0-3>`), served by `context.route` so no server runs, with any request off the origin failing the test. Chromium renders
 * WebGL2 with SwiftShader, so CI needs no GPU.
 *
 *   npx playwright test e2e/pool-scene.spec.ts
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import { house } from '../packages/play/pool/policy'
import { poolSession } from '../packages/play/pool/session'
import type { PoolAction, PoolLevelId } from '../packages/play/pool/types'
import { nightOf, reachInOf } from '../src/games/pool/scene-layout'
import type { FrameStats } from '../src/scene/stage-runtime'
import type { SceneHook } from '../src/scene/test-hook'
import { playThrough, practiceOf } from '../tests/play/pool-support'
import { pixelStats } from './support/pixels'

declare global {
  interface Window {
    __raf?: number
  }
}

const root = path.resolve(import.meta.dirname, '..')
const ORIGIN = 'http://localhost:4177'
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
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  },
  viewport: { width: 1440, height: 900 },
})

base.beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), 'es-pool-scene-'))
  process.env.VITE_ES_TEST_HOOKS = '1'
  await build({ root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'error', build: { outDir: dist, emptyOutDir: true } })
})

base.afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true })
})

/** Each test serves the build itself and fails on any error the page throws or logs, and on any request off the origin. */
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

const stage = (page: Page) => page.locator('[data-stage="pool"]')
const game = (page: Page) => page.locator('section[data-game="pool"]')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes.pool?.info() ?? null)
const askKind = (page: Page) => page.locator('[data-pool-controls]').getAttribute('data-ask')
const camera = (page: Page) => page.getByRole('group', { name: 'Camera on the reach-in' })
const CAMERAS = ['Front of the reach-in', 'One station', 'From above']

/** The house's night on a level's practice seed, as the page plays it: every state, and the actions between them. */
const nightOfHouse = (id: PoolLevelId) => playThrough(practiceOf(id), house)
const ticketNo = (id: number) => String(id + 1).padStart(2, '0')

async function open(page: Page, level: string, tier: number) {
  await page.goto(`${ORIGIN}/play/pool?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
  await expect(game(page)).toHaveAttribute('data-view', '3d')
}

/** Waits until the scene is drawn, the Stage says it is settled, and no frame has been drawn for half a second. */
async function settle(page: Page) {
  // The scene draws nothing while it is out of view, so it is kept on the screen.
  await stage(page).scrollIntoViewIfNeeded()
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 30_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  let frames = -1
  await expect
    .poll(
      async () => {
        const now = (await probe(page))?.frames ?? -2
        const still = now === frames
        frames = now
        return still
      },
      { intervals: [500], timeout: 30_000 },
    )
    .toBe(true)
}

async function frame(page: Page): Promise<FrameStats> {
  return page.evaluate(() => (window.__esScene as SceneHook).probes.pool.frame())
}

/** Takes the house's action with the page's own controls, as a visitor's clicks do. */
async function act(page: Page, action: PoolAction) {
  if (action.t === 'commit') return
  await expect.poll(() => askKind(page), { message: `the open ask is ${action.t}` }).toBe(action.t)
  const button = (name: string | RegExp) => page.getByRole('button', { name }).first()
  switch (action.t) {
    case 'admit':
      await (action.req === null ? button('Hang none') : button(new RegExp(`^Hang ticket No\\. ${ticketNo(action.req)},`))).click()
      return
    case 'preempt':
      await button(new RegExp(`^Pull ticket No\\. ${ticketNo(action.req)},`)).click()
      return
    case 'prefetch':
      await (action.adapter === null ? button('Bring none yet') : button(new RegExp(`^Bring kit ${action.adapter + 1} in,`))).click()
      return
    case 'evict': {
      // The rows are toggles in the rotation's order, the first ones the ticket needs chosen to begin with.
      const rows = page.locator('[data-ask-list="evict"] button[data-roving]')
      const want = new Set(action.pages.map((pan) => pan + 1))
      for (let i = 0; i < (await rows.count()); i++) {
        const row = rows.nth(i)
        const pan = Number(/pan (\d+)/.exec((await row.textContent()) ?? '')?.[1])
        if (((await row.getAttribute('aria-pressed')) === 'true') !== want.has(pan)) await row.click()
      }
      await button(/^Dump the \d+ pans?$/).click()
    }
  }
}

/** A coarse grid of the canvas's pixels, read back from the test build's kept frame. */
function sampleCanvas(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-stage="pool"] canvas')
    if (!canvas) return []
    const copy = document.createElement('canvas')
    copy.width = canvas.width
    copy.height = canvas.height
    const context = copy.getContext('2d')
    if (!context) return []
    context.drawImage(canvas, 0, 0)
    const { data, width, height } = context.getImageData(0, 0, copy.width, copy.height)
    const out: number[] = []
    for (let y = 2; y < height; y += Math.max(1, Math.floor(height / 48))) {
      for (let x = 2; x < width; x += Math.max(1, Math.floor(width / 72))) {
        const i = (y * width + x) * 4
        out.push(data[i], data[i + 1], data[i + 2])
      }
    }
    return out
  })
}

/** Where the scene's box is on the page, not on the screen: a scroll does not move it, a layout change does. */
const placeOf = (page: Page) =>
  stage(page).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return [box.left + scrollX, box.top + scrollY, box.width, box.height].map((v) => Math.round(v * 10) / 10)
  })

test.describe('the draw-call budget over a whole night (A§11.1)', () => {
  for (const level of ['adapters', 'same-size'] as const) {
    for (const tier of [1, 2]) {
      test(`the house's night on ${level} draws in at most 100 calls, at T${tier}`, async ({ page }) => {
        test.setTimeout(420_000)
        const { actions } = nightOfHouse(level)
        await open(page, level, tier)
        await settle(page)
        let most: FrameStats = await frame(page)
        for (const action of actions) {
          await act(page, action)
          await settle(page)
          const stats = await frame(page)
          if (stats.sceneCalls > most.sceneCalls) most = stats
        }
        await expect(page.getByRole('button', { name: 'See the debrief' })).toHaveCount(1)
        expect(most.sceneCalls).toBeLessThanOrEqual(100)
        expect(most.calls).toBeLessThanOrEqual(100)
        console.log(`${level} T${tier}: at most ${most.sceneCalls} scene draw calls (${most.calls} in the frame, passes ${most.passes.join(' + ')}), ${most.instances} instances, ${most.triangles} triangles, ${most.shadows ?? 0} shadow maps, dpr ${most.dpr}`)
      })
    }
  }
})

test.describe('reduced motion (A§6.9; W1-T24 accept 2): the threads update per op without layout jumps', () => {
  test.use({ reducedMotion: 'reduce' })

  test('each decision redraws the twine at once, the box stays where it is, and then no animation frame is asked for', async ({ page, context }) => {
    test.setTimeout(240_000)
    await context.addInitScript(() => {
      window.__raf = 0
      const request = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        window.__raf = (window.__raf ?? 0) + 1
        return request(callback)
      }
    })
    const { states, actions } = nightOfHouse('two-kinds')
    // The focus's twine and its fan, as the scene's layout draws them after each decision: the moment changes when either does.
    const moments = states.map((state) => {
      const view = poolSession.view(state)
      return nightOf(view, reachInOf(view.pans.length, view.cap), { station: null, chosen: [] }).moment
    })
    await open(page, 'two-kinds', 2)
    await settle(page)
    const place = await placeOf(page)
    let before = await sampleCanvas(page)
    let redrawn = 0
    let most = 0
    for (const [i, action] of actions.slice(0, 10).entries()) {
      const frames = (await probe(page))?.frames ?? 0
      await act(page, action)
      await settle(page)
      const drawn = ((await probe(page))?.frames ?? 0) - frames
      most = Math.max(most, drawn)
      // A cut: the night is drawn again in a frame or two, where the twine's growth would take a second of frames.
      expect(drawn, `frames for decision ${i + 1}`).toBeGreaterThan(0)
      expect(drawn, `frames for decision ${i + 1}`).toBeLessThanOrEqual(6)
      expect(await placeOf(page), `the scene's box after decision ${i + 1}`).toEqual(place)
      const after = await sampleCanvas(page)
      if (moments[i + 1] !== moments[i]) {
        expect(after, `the twine after decision ${i + 1}`).not.toEqual(before)
        redrawn++
      }
      before = after
    }
    expect(redrawn, 'decisions that moved the twine').toBeGreaterThan(1)
    const asked = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(asked)
    expect((await probe(page))?.p95, 'the governor never sampled an animation').toBeNull()
    console.log(`reduced motion: ${redrawn} of 10 decisions moved the twine, at most ${most} frames for one decision, the box at ${JSON.stringify(place)}`)
  })
})

test.describe('the views and the camera (A§6.8)', () => {
  test('`V` swaps 2D and 3D and keeps the night', async ({ page }) => {
    test.setTimeout(180_000)
    const { states, actions } = nightOfHouse('evict')
    await open(page, 'evict', 2)
    await settle(page)
    for (const action of actions.slice(0, 4)) await act(page, action)
    await settle(page)
    const ask = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-pool-controls] [data-ask-list] button')).map((button) => button.textContent?.trim().replace(/\s+/g, ' ')))
    const kept = { kind: await askKind(page), list: await ask() }
    expect(kept.list.length).toBeGreaterThan(0)
    const drawn = (await frame(page)).instances

    await game(page).focus()
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.locator('[data-surface="2d"] [data-pool-view]')).toBeVisible()
    await expect(stage(page)).toHaveCount(0)
    expect({ kind: await askKind(page), list: await ask() }).toEqual(kept)

    await game(page).focus()
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await settle(page)
    expect({ kind: await askKind(page), list: await ask() }).toEqual(kept)
    // The scene draws the same night: every pan, its mise, the tickets on the line and on the pass, as many as before the swap.
    const view = poolSession.view(states[4])
    expect(view.waiting.length + view.running.length).toBeGreaterThan(0)
    expect((await frame(page)).instances).toBe(drawn)
  })

  test('`C` cycles every preset and each plate reaches its own; One station draws only the station picked', async ({ page }) => {
    test.setTimeout(180_000)
    const { actions } = nightOfHouse('two-kinds')
    await open(page, 'two-kinds', 2)
    await settle(page)
    for (const action of actions.slice(0, 6)) await act(page, action)
    await settle(page)
    const pressed = () => camera(page).locator('button[aria-pressed="true"]').textContent()
    expect(await pressed()).toBe(CAMERAS[0])
    const whole = (await frame(page)).sceneCalls
    for (const name of [...CAMERAS.slice(1), CAMERAS[0]]) {
      await game(page).focus()
      await page.keyboard.press('KeyC')
      await expect.poll(pressed).toBe(name)
      await expect(page.locator('[data-live="line"]')).toContainText(`Camera: ${name}.`)
      await settle(page)
    }
    for (const name of CAMERAS) {
      await camera(page).getByRole('button', { name }).click()
      await expect(camera(page).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
      await settle(page)
    }
    // One station: the page's buttons pick the station, and the scene draws its twine alone: one string where every station's are three.
    await camera(page).getByRole('button', { name: 'One station' }).click()
    const stations = page.getByRole('group', { name: 'The station shown' }).getByRole('button')
    await expect(stations).toHaveCount(3)
    await expect(stations.first()).toHaveAttribute('aria-pressed', 'true')
    await settle(page)
    const one = (await frame(page)).sceneCalls
    await stations.nth(1).click()
    await expect(stations.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await settle(page)
    const other = (await frame(page)).sceneCalls
    expect(one).toBeLessThan(whole)
    expect(other).toBeLessThan(whole)
    console.log(`draw calls: ${whole} with every station's twine, ${one} and ${other} with one station's`)
  })
})

test.describe('the picture (W1-T24)', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`the 3D capture at ${width} px is not blank: its pixels vary, and it is kept as an artifact`, async ({ page }, info) => {
      test.setTimeout(180_000)
      await page.setViewportSize({ width, height })
      const { actions } = nightOfHouse('adapters')
      await open(page, 'adapters', width < 480 ? 1 : 2)
      await settle(page)
      for (const action of actions.slice(0, 6)) await act(page, action)
      await settle(page)
      // The canvas as the page composites it (e2e/support/pixels.ts): a grid of samples, their distinct colours and spread.
      const canvas = stage(page).locator('canvas')
      await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
      const sampled = await pixelStats(page.context(), await canvas.screenshot())
      expect(sampled.colours).toBeGreaterThan(40)
      expect(sampled.spread).toBeGreaterThan(12)
      await page.addStyleTag({ content: '.es-labels { visibility: visible !important; }' })
      const shot = info.outputPath(`pool-3d-${width}.png`)
      await stage(page).screenshot({ path: shot })
      await info.attach(`pool-3d-${width}`, { path: shot, contentType: 'image/png' })
      console.log(`3D capture at ${width} px, ${sampled.width}x${sampled.height}: ${sampled.colours} distinct colours in ${sampled.samples} samples, luma spread ${sampled.spread.toFixed(1)}; kept at ${shot}`)
    })
  }

  test("all text is DOM: the scene carries no word and no number, the tickets' numbers are the page's, and the page says what the fan shows", async ({ page }) => {
    test.setTimeout(120_000)
    const { states, actions } = nightOfHouse('two-kinds')
    await open(page, 'two-kinds', 2)
    await settle(page)
    const labels = stage(page).locator('.es-labels .es-label')
    const first = poolSession.view(states[0])
    // No label rides on the canvas; the tickets that can hang are named on the page, by their numbers, in the open ask's list.
    await expect(labels).toHaveCount(0)
    for (const id of first.waiting) await expect(page.locator('[data-pool-controls] [data-ask-list]')).toContainText(`No. ${first.tickets[id].no}`)
    // Nothing is on the line yet, so there is no fan to speak of.
    await expect(page.locator('[data-pool-fan]')).toHaveCount(0)
    // The ticket hung first is the focus: its head pan fans into the layers of its station, and the page says which and how many.
    await act(page, actions[0])
    await settle(page)
    const view = poolSession.view(states[1])
    const fan = nightOf(view, reachInOf(view.pans.length, view.cap), { station: null, chosen: [] }).fan
    const ticket = view.running[view.running.length - 1]
    const station = view.stations.find((candidate) => candidate.layers === fan?.layers)
    expect(fan).not.toBeNull()
    await expect(page.locator('[data-pool-fan]')).toContainText(`No. ${view.tickets[ticket].no}`)
    await expect(page.locator('[data-pool-fan]')).toContainText(`${station?.id}`)
    await expect(page.locator('[data-pool-fan]')).toContainText(`all ${fan?.layers} of the station's layers`)
    await expect(labels).toHaveCount(0)
    // The canvas carries no text, and is hidden from assistive technology with its box.
    await expect(stage(page).locator('.es-stage__scene')).toHaveAttribute('aria-hidden', 'true')
    expect(await stage(page).locator('canvas').evaluate((canvas) => canvas.textContent)).toBe('')
  })
})
