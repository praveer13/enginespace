/*
 * W0-T21, acceptance 4 and 5: screenshots of the front page, and the software renderer that draws them (ARCHITECTURE §10.1,
 * "Screenshots").
 *
 *   - The 2D pass of `/` at 360 and 1280 px is compared with a baseline, within a small tolerance. A baseline is a PNG in
 *     e2e/screenshots.spec.ts-snapshots/ rendered by Linux Chromium with the site's own faces, so the comparison is made on Linux only
 *     (A§10.1: "using self-hosted fonts on a fixed runner image"). The page is in the state a first visit leaves it in: the learner's
 *     "3D off", reduced motion, every entrance finished, the fonts in. The tolerance is the share of pixels that may differ. When a runner
 *     draws the page a little differently, the failure's artifact (uploaded by ci.yml) holds the actual image beside the expected one
 *     and their diff: copy the actual over the baseline, or make new baselines with `npx playwright test --project=smoke screenshots
 *     --update-snapshots` on a machine that draws as the runner does.
 *   - The 3D pass is never compared: SwiftShader's output is not a reference. It is captured as an artifact (attached to the report, and
 *     uploaded by the workflow), and checked to be drawn and not blank by sampling the canvas's pixels (e2e/support/pixels.ts).
 *   - The renderer: the config gives Chromium `--use-angle=swiftshader` (playwright.config.ts says what was measured of it). This asks
 *     the Chromium that runs for what the specs rely on, and prints its build and renderer, so a runner's first log shows them.
 *
 * A check that cannot fail proves nothing, so the pixel check is also run on a blank page, and must say it is blank.
 */
import { PR_WIDTHS } from './routes'
import { looksDrawn, pixelStats } from './support/pixels'
import { expect, open, quiet, settled3d, test, withSettings } from './support/site'

/**
 * The share of the pixels of a baseline that may differ: 1% [estimated], about six times as much as two browser modes differed by under
 * the config's flags (0.16% of the pixels at 360 px and 0.09% at 1280 px [measured 2026-11-04 at bac1d04], the edges of letters). It is the one
 * number to change if a runner draws the page a little differently.
 */
const TOLERANCE = 0.01

test.describe('the software renderer', () => {
  test('draws WebGL2 with the config\'s flags, and the page is told that it can: the build and renderer are printed', async ({ page, browser }) => {
    await page.goto('about:blank')
    const answers = await page.evaluate(() => {
      const ask = (attributes: WebGLContextAttributes) => {
        const gl = document.createElement('canvas').getContext('webgl2', attributes)
        if (gl === null) return null
        const info = gl.getExtension('WEBGL_debug_renderer_info')
        return { renderer: String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)), version: String(gl.getParameter(gl.VERSION)) }
      }
      // The second answer is what src/scene/tiers.ts reads as "not software": null there keeps the pass in 2D.
      return { plain: ask({}), strict: ask({ failIfMajorPerformanceCaveat: true }) }
    })
    console.log(`Chromium ${browser.version()} draws WebGL2 as ${answers.strict?.renderer ?? answers.plain?.renderer ?? 'nothing'} (${answers.strict?.version ?? 'no strict context'})`)
    test.info().annotations.push({ type: 'chromium', description: `${browser.version()}: ${answers.strict?.renderer ?? 'no WebGL2 without a performance caveat'}` })
    expect(answers.plain, 'a WebGL2 context').not.toBeNull()
    expect(answers.strict, 'a WebGL2 context without a major performance caveat: the flags of playwright.config.ts keep the page from reading SwiftShader as software').not.toBeNull()
    expect(answers.strict?.renderer, 'the renderer, which the flag pins to the software one on every machine').toMatch(/SwiftShader/i)
  })
})

test.describe('the 2D pass of the front page', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const width of PR_WIDTHS) {
    test(`at ${width} px matches its baseline within ${TOLERANCE * 100}%`, async ({ page, context }) => {
      test.skip(process.platform !== 'linux', 'the baselines are Linux Chromium renderings')
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/')
      await quiet(page)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`front-${width}.png`, { maxDiffPixelRatio: TOLERANCE })
    })
  }
})

test.describe('the 3D pass of the front page', () => {
  for (const width of PR_WIDTHS) {
    test(`at ${width} px is drawn, not blank, and its capture is kept as an artifact`, async ({ page, context }, info) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/')
      await settled3d(page)
      const stage = page.locator('[data-stage="front"]')
      const canvas = stage.locator('canvas')
      await expect(canvas).toBeVisible()

      // The artifact: the pass as the learner sees it, with its labels over it.
      await info.attach(`front-3d-${width}.png`, { body: await stage.screenshot(), contentType: 'image/png' })

      // The check: the canvas's own pixels, with the labels (page text over the canvas) out of the way.
      await page.addStyleTag({ content: '.es-labels { visibility: hidden !important; }' })
      const stats = await pixelStats(context, await canvas.screenshot())
      console.log(`3D capture at ${width} px, ${stats.width}x${stats.height}: ${stats.colours} colours in ${stats.samples} samples, luma spread ${stats.spread.toFixed(1)}`)
      expect(looksDrawn(stats), `the canvas is drawn: ${stats.colours} colours, spread ${stats.spread.toFixed(1)}`).toBe(true)
    })
  }

  test('a blank page is found blank by the pixel check, and a drawn page is not', async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.goto('about:blank')
    expect(looksDrawn(await pixelStats(context, await page.screenshot()))).toBe(false)
    await withSettings(context, { view3d: false })
    await open(page, '/')
    await quiet(page)
    expect(looksDrawn(await pixelStats(context, await page.screenshot()))).toBe(true)
  })
})
