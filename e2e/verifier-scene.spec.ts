/*
 * The rejection sampler's 3D skylines (R-T42), in Playwright's Chromium, through `/play/verifier`:
 *
 *   1. Scene budgets as before: at most 100 draw calls on every level, played with its draws, read from the scene's own `renderer.info`
 *      (A§11.1), at T1 and at T2. (The chunk's 40 KB gz is a build check: verify:bundle gates it, and the task's result records it.)
 *   2. The output's ring settles onto p as rounds are drawn, in one move: a hundred rounds drawn at once move the scene once, and it settles.
 *   3. Reduced motion shows each batch's end: a draw cuts to it, and then no animation frame is asked for.
 *   And the rest of the scene contract: `V` swaps 2D and 3D and keeps the run, `C` and the buttons reach every shot, the capture is not
 *   blank, the parts stand in their colours, all text is DOM, and every label stands whole inside the box in every shot. Wave R's finish
 *   review offers the 3D view on the chain only, the level whose rows give depth something to carry; a level of one draft position has
 *   no 3D switch, so the recipe level's pick in the scene has no scene to be made in.
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
import { verifierInit, verifierReduce, verifierSession } from '../packages/play/verifier/session'
import { excessPlates, keptPlates, sweepOfLevel, thousandths, tokensOf } from '../packages/play/verifier/state'
import type { VerifierAction, VerifierLevelId } from '../packages/play/verifier/types'
import { skylineOf } from '../src/games/verifier/scene-layout'
import { PX } from '../src/scene/flat-track'
import type { FrameStats } from '../src/scene/stage-runtime'
import type { SceneHook } from '../src/scene/test-hook'
import { bannedOn } from './support/copy-scan'
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

/** A level's view after some actions, on its practice seed: the layout the scene draws, in the test's own terms. */
const buildView = (id: VerifierLevelId, ...actions: VerifierAction[]) => verifierSession.view(actions.reduce(verifierReduce, verifierInit(buildLevel(id, id === 'chain' ? 1 : 0))))
/** A box's top, in px. */
const topOf = (box: { y0?: number; height: number }): number => (box.y0 ?? 0) + box.height

const stage = (page: Page) => page.locator('[data-stage="verifier"]')
const game = (page: Page) => page.locator('section[data-game="verifier"]')
const probe = (page: Page) => page.evaluate(() => window.__esScene?.probes.verifier?.info() ?? null)
const camera = (page: Page) => page.getByRole('group', { name: 'Camera on the sampler' })
const weight = (page: Page, dish: number) => page.locator(`[data-vf-dish="${dish}"]`)

async function open(page: Page, level: string, tier: number, to3d = true) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('es:intro', JSON.stringify({ verifier: ['draft', 'target', 'token', 'accepted', 'residual', 'alpha', 'round', 'output', 'position', 'bonus', 'gamma'] }))
    } catch {
      // No storage: the intro shows.
    }
  })
  await page.goto(`${ORIGIN}/play/verifier?level=${level}&es-tier=${tier}`)
  await page.evaluate(() => document.fonts.ready)
  await expect(game(page)).toBeVisible()
  if (!to3d) return
  // The diagram is the default view (R-T30, REDESIGN §2.9): 3D is one switch away, on the chain, the level whose rows give depth something.
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(game(page)).toHaveAttribute('data-view', '3d')
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
    await page.getByLabel(level === 'overlap' ? 'Accepted, in sixty-fourths' : 'Tokens per round').fill(answer)
    await page.keyboard.press('Enter')
    await draw(page, 5)
  } else if (level === 'exact' || level === 'greedy-ngram') {
    const built = buildLevel(level, 0)
    if (built.id === 'greedy-ngram') {
      const favourite = built.p[0].indexOf(Math.max(...built.p[0]))
      await page.getByRole('button', { name: built.draft === favourite ? 'Accepted' : 'Rejected', exact: true }).click()
    }
    const recipe = built.id === 'greedy-ngram' ? built.p[0].map((w, x) => (x === built.draft ? 0 : w)) : excessPlates(built)
    for (const [dish, value] of recipe.entries()) if (value > 0) await weight(page, dish).fill(String(value))
    await draw(page, 5)
  } else if (level === 'mutants') {
    await page.getByRole('button', { name: /^Sample/ }).first().click()
  } else if (level === 'gamma') {
    const built = buildLevel('gamma', 0)
    for (let k = 0; k < sweepOfLevel(built).best; k++) await page.getByRole('button', { name: 'Propose one more token' }).click()
  }
}

/** The levels with one draft position: depth would carry nothing there, so the 3D view is not offered (wave R's finish review). */
const ONE_POSITION = ['overlap', 'exact', 'greedy-ngram', 'mutants', 'gamma'] as const

test.describe('3D only where depth carries something', () => {
  test('a level of one draft position offers no 3D switch, and the chain does', async ({ page }) => {
    test.setTimeout(120_000)
    for (const level of ONE_POSITION) {
      await open(page, level, 2, false)
      await expect(game(page).getByRole('button', { name: '3D', exact: true }), `${level}: no 3D switch`).toHaveCount(0)
      await expect(game(page)).toHaveAttribute('data-view', '2d')
    }
    await open(page, 'chain', 2)
    await settle(page)
  })
})

test.describe('the draw-call budget on every level that has a scene (A§11.1)', () => {
  for (const tier of [1, 2]) {
    test(`the chain, played with its draws, draws in at most 100 calls, at T${tier}`, async ({ page }) => {
      test.setTimeout(600_000)
      let most: FrameStats | null = null
      for (const level of ['chain']) {
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

test.describe('batches: the output skyline settles once for a batch, not once a round', () => {
  test('a hundred rounds drawn at once move the scene once, and it settles', async ({ page }) => {
    await open(page, 'chain', 1)
    await settle(page)
    await page.getByLabel('Tokens per round').fill('2.4')
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
    // One settling of 640 ms, a second or so at T1's 30 frames a second [estimated], however many rounds the batch drew.
    expect(frames).toBeLessThanOrEqual(60)
  })
})

test.describe('reduced motion (A§6.9): a batch cuts to its end', () => {
  test.use({ reducedMotion: 'reduce' })

  test('a draw redraws the skylines in place in a frame or two, and then no animation frame is asked for', async ({ page, context }) => {
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
    await page.getByLabel('Tokens per round').fill('2.4')
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
  test('`V` swaps 2D and 3D and keeps the run: the prediction and the rounds drawn', async ({ page }) => {
    await open(page, 'chain', 2)
    await settle(page)
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await page.getByLabel('Tokens per round').fill('2.4')
    await page.keyboard.press('Enter')
    await draw(page)
    await settle(page)
    const rounds = () => page.locator('[data-readout-id="rounds"] dd').first().textContent()
    const committed = () => page.locator('[data-verifier-controls]').getAttribute('data-ask')
    const before = { recipe: await committed(), rounds: await rounds() }
    expect(before.recipe).toBe('finish')
    await focusGame(page)
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '2d')
    await expect(page.locator('[data-surface="2d"] [data-verifier-view] .es-vf__bar').first()).toBeVisible()
    await expect(stage(page)).toHaveCount(0)
    expect({ recipe: await committed(), rounds: await rounds() }).toEqual(before)
    await focusGame(page)
    await page.keyboard.press('KeyV')
    await expect(game(page)).toHaveAttribute('data-view', '3d')
    await settle(page)
    expect({ recipe: await committed(), rounds: await rounds() }).toEqual(before)
  })

  test('`C` cycles every shot and each button reaches its own', async ({ page }) => {
    await open(page, 'chain', 2)
    await settle(page)
    const names = ['Over the run', 'One draft position', 'From the side']
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

test.describe('labels: every one stands whole inside the box, in every shot', () => {
  test('over the run, one draft position and following the target, no tape or tag on the pass is cut by the box\'s edge', async ({ page }) => {
    await open(page, 'chain', 2)
    await settle(page)
    await page.getByLabel('Tokens per round').fill('2.4')
    await page.keyboard.press('Enter')
    await draw(page)
    await settle(page)
    for (const name of ['Over the run', 'One draft position', 'From the side']) {
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
      expect(cut, `${name}: labels cut by the box's edge`).toEqual([])
    }
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

test.describe('the parts (REDESIGN §3.5): the draft is yellow and the target blue, as the legend says', () => {
  test('before the decomposition prints, a q bar\'s top is the draft\'s yellow and a p bar\'s the target\'s blue', async ({ page }) => {
    await open(page, 'chain', 2)
    await settle(page)
    await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
    await frame(page)
    const view = buildView('chain')
    const { model } = skylineOf(view, { scaffold: true, outcome: true })
    const tops = (prefix: string) => model.boxes.filter((box) => box.id.startsWith(prefix)).sort((a, b) => b.height - a.height)[0]
    const q = tops('r0/q')
    const p = tops('r0/p')
    for (const [bar, name] of [[q, 'q'], [p, 'p']] as const) {
      const colour = await colourAt(page, [((bar.x0 + bar.x1) / 2) / PX, topOf(bar) / PX, ((bar.z0 + bar.z1) / 2) / PX])
      console.log(`a ${name} bar's top: ${colour.map(Math.round).join(',')}`)
      // Yellow has far more red than blue in it, blue far more blue than red.
      expect(name === 'q' ? colour[0] - colour[2] : colour[2] - colour[0], `the ${name} bar's colour`).toBeGreaterThan(60)
    }
  })
})

test.describe('the picture (A§10.1; GAMES.md §2.6 rule 7)', () => {
  test('the 3D capture is not blank: its pixels vary, and it is kept as an artifact', async ({ page }, info) => {
    await open(page, 'chain', 2)
    await settle(page)
    await page.getByLabel('Tokens per round').fill('2.4')
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

  test('all text is DOM: the tokens\' numbers and the bars\' counts are page text over the canvas', async ({ page }) => {
    await open(page, 'chain', 2)
    await settle(page)
    const labels = stage(page).locator('.es-labels')
    // A token's number stands under its pair of bars; the legend says the columns are tokens 0 to 5.
    for (const token of ['0', '1', '2', '3', '4', '5']) await expect(labels.locator('.es-vf-label--tick', { hasText: new RegExp(`^${token}$`) })).toHaveCount(1)
    // Each bar's count over it: the draft's q and the target's p, out of 64.
    const level = buildLevel('chain', 1)
    const counts = (await labels.locator('.es-vf-label--slab').allTextContents()).map(Number).sort((a, b) => a - b)
    expect(counts).toEqual([...level.p.flat(), ...level.q.flat()].filter((n) => n > 0).sort((a, b) => a - b))
    // Every label is at the size ramp's smallest step at least.
    for (const size of await labels.locator('.es-vf-label').evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)))) expect(size).toBeGreaterThanOrEqual(11)
    await expect(stage(page).locator('.es-stage__scene')).toHaveAttribute('aria-hidden', 'true')
    expect(await stage(page).locator('canvas').evaluate((canvas) => canvas.textContent)).toBe('')
  })
})

// The copy guard over the 3D view (REDESIGN 2.7): the route sweep reads every page with 3D off, so the words that only 3D shows are read here, at a desk.
test.describe('the words of the 3D view (R-T14)', () => {
  test('no banned word or phrase on the verifier with 3D on, before a move', async ({ page }) => {
    test.setTimeout(120_000)
    await open(page, 'chain', 1)
    await page.waitForTimeout(500)
    expect(await bannedOn(page), 'banned words on the page in 3D').toEqual([])
  })
})
