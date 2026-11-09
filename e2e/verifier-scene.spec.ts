/*
 * W1-T29's acceptance checks for The Tasting's 3D scene, in Playwright's Chromium, through `/play/verifier`:
 *
 *   1. Scene budgets as in W1-T18: at most 100 draw calls on every level, played with its draws, read from the scene's own
 *      `renderer.info` (A§11.1), at T1 and at T2. (The chunk's 40 KB gz is a build check: verify:bundle gates it, and the task's result
 *      records the measured size.)
 *   2. The observed skyline updates in batches, not per draw: a hundred rounds drawn at once move the scene once, and it settles.
 *   3. Reduced motion shows each batch's final histogram: a draw cuts to its end, and then no animation frame is asked for.
 *   And the rest of the scene contract: `V` swaps 2D and 3D and keeps the run, `C` and the buttons reach every shot, the capture is not
 *   blank, all text is DOM, every name stands whole inside the box in every shot, a dish's tape picked on the pass hands focus to its
 *   weight, and each heat lamp's pool lies on the steel under it, on the course being tasted.
 *
 * How it runs, as e2e/loop-scene.spec.ts does: one test build with `VITE_ES_TEST_HOOKS=1` (it exposes `window.__esScene` and honours
 * `?es-tier=<0-3>`), served by `context.route` so no server runs, with any request off the origin failing the test. Chromium renders
 * WebGL2 with SwiftShader, so CI needs no GPU. The scene draws no frame while it is scrolled away, so every wait scrolls it into view.
 *
 *   npx playwright test e2e/verifier-scene.spec.ts --workers=2
 *
 * `ES_CHROMIUM=<path to chrome>` runs it with another Chromium build than the one Playwright installed.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { build } from 'vite'
import { buildLevel } from '../packages/play/verifier/levels'
import { excessPlates, keptPlates, sweepOfLevel, thousandths, tokensOf } from '../packages/play/verifier/state'
import { columnX, FRONT, planOf, TOP } from '../src/games/verifier/scene-plan'
import type { FrameStats } from '../src/scene/stage-runtime'
import type { SceneHook } from '../src/scene/test-hook'
import { pixelStats } from './support/pixels'

declare global {
  interface Window {
    __raf?: number
    __cycles?: number
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
  dist = mkdtempSync(path.join(tmpdir(), 'es-verifier-scene-'))
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

const stage = (page: Page) => page.locator('[data-stage="verifier"]')
const game = (page: Page) => page.locator('section[data-game="verifier"]')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes.verifier?.info() ?? null)
const camera = (page: Page) => page.getByRole('group', { name: 'Camera on the pass' })
const weight = (page: Page, dish: number) => page.locator(`[data-vf-dish="${dish}"]`)

async function open(page: Page, level: string, tier: number) {
  await page.goto(`${ORIGIN}/play/verifier?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
}

/** Scrolls the scene into view, waits until it is drawn and settled, and until no frame has been drawn for half a second. */
async function settle(page: Page) {
  await stage(page).scrollIntoViewIfNeeded()
  await expect(stage(page)).toHaveAttribute('data-stage-phase', 'live', { timeout: 60_000 })
  await expect(stage(page)).toHaveAttribute('data-settled', 'true', { timeout: 60_000 })
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
  return page.evaluate(() => (window.__esScene as SceneHook).probes.verifier.frame())
}

/** Puts focus in the game without scrolling, so its keys work and the scene stays in view. */
const focusGame = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('section[data-game="verifier"]')?.focus({ preventScroll: true }))

/** Draws rounds from the keyboard (`D`, twenty a press), so the scene stays in view. */
async function draw(page: Page, presses = 1) {
  await focusGame(page)
  for (let i = 0; i < presses; i++) await page.keyboard.press('KeyD')
}

/** The level's own play on its practice seed, up to the point where rounds can be drawn and seen: what each level's budget is read on. */
async function play(page: Page, level: string) {
  if (level === 'overlap' || level === 'chain') {
    const answer = level === 'overlap' ? String(keptPlates(buildLevel('overlap', 0))) : (thousandths(tokensOf(buildLevel('chain', 1))) / 1000).toFixed(3)
    await page.getByLabel(level === 'overlap' ? 'Plates kept' : 'Courses per round').fill(answer)
    await page.keyboard.press('Enter')
    await draw(page, 5)
  } else if (level === 'exact' || level === 'greedy-ngram') {
    const built = buildLevel(level, 0)
    if (built.id === 'greedy-ngram') {
      const favourite = built.p[0].indexOf(Math.max(...built.p[0]))
      await page.getByRole('button', { name: built.draft === favourite ? 'Kept' : 'Sent back', exact: true }).click()
    }
    const recipe = built.id === 'greedy-ngram' ? built.p[0].map((w, x) => (x === built.draft ? 0 : w)) : excessPlates(built)
    for (const [dish, value] of recipe.entries()) if (value > 0) await weight(page, dish).fill(String(value))
    await draw(page, 5)
  } else if (level === 'mutants') {
    await page.getByRole('button', { name: /^Taste/ }).first().click()
  } else if (level === 'gamma') {
    const built = buildLevel('gamma', 0)
    for (let k = 0; k < sweepOfLevel(built).best; k++) await page.getByRole('button', { name: 'Plate one course further ahead' }).click()
  }
}

test.describe('the draw-call budget on every level (A§11.1)', () => {
  for (const tier of [1, 2]) {
    test(`every level, played with its draws, draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(600_000)
      let most: FrameStats | null = null
      for (const level of ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants', 'gamma']) {
        await open(page, level, tier)
        await settle(page)
        await play(page, level)
        await settle(page)
        const stats = await frame(page)
        console.log(`T${tier} ${level}: ${stats.sceneCalls} scene draw calls (${stats.calls} in the frame, passes ${stats.passes.join(' + ')}), ${stats.instances} instances, ${stats.triangles} triangles`)
        expect(stats.sceneCalls).toBeLessThanOrEqual(100)
        expect(stats.calls).toBeLessThanOrEqual(100)
        if (most === null || stats.sceneCalls > most.sceneCalls) most = stats
      }
      if (most === null) throw new Error('no frame was drawn')
      console.log(`T${tier}: at most ${most.sceneCalls} scene draw calls (${most.calls} in the frame), ${most.instances} instances, ${most.triangles} triangles`)
    })
  }
})

test.describe('batches (W1-T29, accept 2): the observed skyline moves once for a batch, not once a round', () => {
  test('a hundred rounds drawn at once move the scene once, and it settles', async ({ page }) => {
    await open(page, 'overlap', 1)
    await settle(page)
    await page.getByLabel('Plates kept').fill(String(keptPlates(buildLevel('overlap', 0))))
    await page.keyboard.press('Enter')
    await settle(page)
    // Every time the scene starts to move, the Stage takes its "settled" mark away: count those.
    await page.evaluate(() => {
      window.__cycles = 0
      const box = document.querySelector('[data-stage="verifier"]')
      if (!box) return
      new MutationObserver(() => {
        if (!box.hasAttribute('data-settled')) window.__cycles = (window.__cycles ?? 0) + 1
      }).observe(box, { attributes: true, attributeFilter: ['data-settled'] })
    })
    const before = (await probe(page))?.frames ?? 0
    await page.locator('[data-vf-draws] button', { hasText: 'Draw 100' }).click()
    await settle(page)
    expect(await page.evaluate(() => window.__cycles)).toBe(1)
    const frames = ((await probe(page))?.frames ?? 0) - before
    console.log(`a draw of 100 rounds: one move of ${frames} frames`)
    // One drop and one settle, a second or so at T1's 30 frames a second [estimated], however many rounds the batch drew.
    expect(frames).toBeLessThanOrEqual(60)
  })
})

test.describe('reduced motion (A§6.9; W1-T29, accept 3): a batch cuts to its final histogram', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a draw redraws the tasting in place in a frame or two, and then no animation frame is asked for', async ({ page, context }) => {
    await context.addInitScript(() => {
      window.__raf = 0
      const request = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        window.__raf = (window.__raf ?? 0) + 1
        return request(callback)
      }
    })
    await open(page, 'chain', 1)
    await settle(page)
    await page.getByLabel('Courses per round').fill('2.4')
    await page.keyboard.press('Enter')
    await settle(page)
    const before = (await probe(page))?.frames ?? 0
    await draw(page)
    await settle(page)
    const frames = ((await probe(page))?.frames ?? 0) - before
    expect(frames).toBeLessThanOrEqual(3)
    const after = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(2000)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBe(after)
    expect((await probe(page))?.p95, 'the governor never sampled an animation').toBeNull()
  })
})

test.describe('the views and the camera (A§6.8)', () => {
  test('`V` swaps 2D and 3D and keeps the run: the recipe and the rounds drawn', async ({ page }) => {
    await open(page, 'exact', 2)
    await settle(page)
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await weight(page, 0).fill('7')
    await draw(page)
    await settle(page)
    const rounds = () => page.locator('.es-vf-under__count').first().textContent()
    const before = { recipe: await weight(page, 0).inputValue(), rounds: await rounds() }
    expect(before.recipe).toBe('7')
    await focusGame(page)
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.locator('[data-surface="2d"] [data-verifier-view] .es-vf-drawing > svg')).toBeVisible()
    await expect(stage(page)).toHaveCount(0)
    expect({ recipe: await weight(page, 0).inputValue(), rounds: await rounds() }).toEqual(before)
    await focusGame(page)
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await settle(page)
    expect({ recipe: await weight(page, 0).inputValue(), rounds: await rounds() }).toEqual(before)
  })

  test('`C` cycles every shot and each button reaches its own', async ({ page }) => {
    await open(page, 'chain', 2)
    await settle(page)
    const names = ['Over the run', 'One course', 'Walk with the chef']
    const pressed = () => camera(page).locator('button[aria-pressed="true"]').textContent()
    expect(await pressed()).toBe(names[0])
    for (const name of [...names.slice(1), names[0]]) {
      await focusGame(page)
      await page.keyboard.press('KeyC')
      await expect.poll(pressed).toBe(name)
      await expect(page.locator('[data-live="line"]')).toContainText(`Camera: ${name}.`)
      await settle(page)
    }
    for (const name of names) {
      await camera(page).getByRole('button', { name }).click()
      await expect(camera(page).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
      await settle(page)
    }
  })
})

test.describe('labels (W1\'s finish review, round 2): every name stands whole inside the box, in every shot', () => {
  test('over the run, one course and walking with the chef, no tape or tag on the pass is cut by the box\'s edge', async ({ page }) => {
    await open(page, 'chain', 2)
    await settle(page)
    await page.getByLabel('Courses per round').fill('2.4')
    await page.keyboard.press('Enter')
    await draw(page)
    await settle(page)
    for (const name of ['Over the run', 'One course', 'Walk with the chef']) {
      await camera(page).getByRole('button', { name }).click()
      await settle(page)
      await frame(page)
      const cut = await page.evaluate(() => {
        const box = document.querySelector('[data-stage="verifier"] canvas')?.getBoundingClientRect()
        if (!box) return ['no canvas']
        return [...document.querySelectorAll<HTMLElement>('[data-stage="verifier"] .es-vf-label')]
          .filter((label) => getComputedStyle(label).visibility !== 'hidden')
          .filter((label) => {
            const r = label.getBoundingClientRect()
            return r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5
          })
          .map((label) => label.textContent ?? '')
      })
      expect(cut, `${name}: names cut by the box's edge`).toEqual([])
    }
  })
})

test.describe('picks (A§6.8, GAMES.md §10 "Controls"): a dish picked in the scene hands focus to its weight', () => {
  test('picking the fish\'s tape on the pass\'s edge focuses the fish\'s weight', async ({ page }) => {
    await open(page, 'exact', 2)
    await settle(page)
    const plan = planOf('rows', 1)
    const at = await page.evaluate((point) => (window.__esScene as SceneHook).probes.verifier.project(point), [columnX(plan, 2), TOP - 0.03, FRONT + 0.017] as [number, number, number])
    if (!at) throw new Error('the tape is behind the camera')
    const box = await stage(page).locator('canvas').boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.click(box.x + at.x, box.y + at.y)
    await expect(weight(page, 2)).toBeFocused()
  })
})

/** The canvas's colour at a scene point, read back from the test build's kept frame: the mean of a few pixels round it. */
async function colourAt(page: Page, point: [number, number, number]): Promise<[number, number, number]> {
  const at = await page.evaluate((p) => (window.__esScene as SceneHook).probes.verifier.project(p), point)
  if (!at) throw new Error('the point is behind the camera')
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-stage="verifier"] canvas')
    if (!canvas) throw new Error('no canvas')
    const copy = document.createElement('canvas')
    copy.width = canvas.width
    copy.height = canvas.height
    const context = copy.getContext('2d')
    if (!context) throw new Error('no 2D canvas')
    context.drawImage(canvas, 0, 0)
    const scale = canvas.width / canvas.getBoundingClientRect().width
    const { data } = context.getImageData(Math.round(x * scale) - 2, Math.round(y * scale) - 2, 5, 5)
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c]
    return sum.map((v) => v / (data.length / 4)) as [number, number, number]
  }, at)
}

test.describe('`gamma`: a run of stacks, the kept plates at the bottom whether a stack is plated or waits upside down', () => {
  test('past the pick, a stack turned over still has the overlap\'s plates at the counter and the draft\'s above them', async ({ page }) => {
    await open(page, 'gamma', 2)
    await settle(page)
    for (let k = 0; k < 3; k++) await page.getByRole('button', { name: 'Plate one course further ahead' }).click()
    await settle(page)
    await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
    await frame(page)
    const plan = planOf('gamma', 1)
    const level = buildLevel('gamma', 0)
    if (level.id !== 'gamma') throw new Error('gamma')
    // Position 2 is plated and upright; position 6 waits upside down. Each is sampled a hand over the counter and near its top, where its
    // kept plates (the overlap's green) and its sent-back ones (the draft's yellow) stand. A plate's part is its edge band, between the
    // glaze of its lip and its rim, so the sample is a pale tint: the yellow's has far more red than blue in it, the green's about as much.
    for (const position of [1, 5]) {
      const kept = Math.round((level.alphas[position] * 64) / 1000)
      expect(kept).toBeGreaterThan(20)
      expect(kept).toBeLessThan(50)
      const low = await colourAt(page, [columnX(plan, position), TOP + 0.06, 0.061])
      const high = await colourAt(page, [columnX(plan, position), TOP + 0.66, 0.061])
      console.log(`position ${position + 1}: low ${low.map(Math.round).join(',')}, high ${high.map(Math.round).join(',')}`)
      const warmth = ([red, , blue]: [number, number, number]) => red - blue
      expect(warmth(high) - warmth(low), `position ${position + 1}: the draft's yellow stands over the overlap's green`).toBeGreaterThan(40)
    }
  })
})

test.describe('the lamps\' light (W1b\'s finish review, round 1): one pool on the course being tasted, under the lamp that lights it', () => {
  test('over one course, the steel under a lamp, in front of its plates, is warmer than the steel between two lamps', async ({ page }) => {
    await open(page, 'overlap', 2)
    await settle(page)
    await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
    await frame(page)
    // Open steel 12 cm in front of the course: under the left lamp and the middle one, each between two dishes' pairs, and between two
    // lamps, in the next gap between pairs, where no pool reaches. The right lamp's pool holds the bell.
    const warmth = ([red, , blue]: [number, number, number]) => red - blue
    for (const [lamp, between] of [
      [-0.8, -0.4],
      [0, 0.4],
    ] as const) {
      const under = await colourAt(page, [lamp, TOP, 0.12])
      const off = await colourAt(page, [between, TOP, 0.12])
      console.log(`the lamp over x ${lamp}: under it ${under.map(Math.round).join(',')}, between lamps ${off.map(Math.round).join(',')}`)
      expect(warmth(under) - warmth(off), `the pool under the lamp over x ${lamp}`).toBeGreaterThan(12)
    }
  })
})

test.describe('the picture (A§10.1; GAMES.md §2.6 rule 7)', () => {
  test('the 3D capture is not blank: its pixels vary, and it is kept as an artifact', async ({ page }, info) => {
    await open(page, 'chain', 2)
    await settle(page)
    await page.getByLabel('Courses per round').fill('2.4')
    await page.keyboard.press('Enter')
    await draw(page, 5)
    await settle(page)
    const canvas = stage(page).locator('canvas')
    await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
    const sampled = await pixelStats(page.context(), await canvas.screenshot())
    expect(sampled.colours).toBeGreaterThan(40)
    expect(sampled.spread).toBeGreaterThan(12)
    await page.addStyleTag({ content: '.es-labels { visibility: visible !important; }' })
    const shot = info.outputPath('verifier-3d.png')
    await stage(page).screenshot({ path: shot })
    await info.attach('verifier-3d', { path: shot, contentType: 'image/png' })
    console.log(`3D capture ${sampled.width}x${sampled.height}: ${sampled.colours} distinct colours in ${sampled.samples} samples, luma spread ${sampled.spread.toFixed(1)}; kept at ${shot}`)
  })

  test('all text is DOM: the dishes\' names on their tape and the stacks\' counts are page text over the canvas', async ({ page }) => {
    await open(page, 'overlap', 2)
    await settle(page)
    const labels = stage(page).locator('.es-labels')
    for (const dish of ['soup', 'salad', 'fish', 'steak', 'pasta', 'tart']) await expect(labels.locator('.es-vf-label--tape', { hasText: dish })).toHaveCount(1)
    // One paper tag a dish, hung under its tape: the commis's plates, then the chef's.
    const level = buildLevel('overlap', 0)
    const counts = await labels.locator('.es-vf-label--count').allTextContents()
    expect(counts).toEqual(level.p[0].map((p, d) => `${level.q[0][d]} · ${p}`))
    // Every name is marker on masking tape, at the size ramp's smallest step at least.
    for (const size of await labels.locator('.es-vf-label.es-tape').evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)))) expect(size).toBeGreaterThanOrEqual(11)
    await expect(stage(page).locator('.es-stage__scene')).toHaveAttribute('aria-hidden', 'true')
    expect(await stage(page).locator('canvas').evaluate((canvas) => canvas.textContent)).toBe('')
  })
})
