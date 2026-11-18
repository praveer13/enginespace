/*
 * W0-T21, acceptance 4 and 5: screenshots of the front page, and the software renderer that draws them (ARCHITECTURE §10.1,
 * "Screenshots").
 *
 *   - The 2D diagram of `/` at 360 and 1280 px is compared with a baseline, within a small tolerance. A baseline is a PNG in
 *     e2e/screenshots.spec.ts-snapshots/ rendered by Linux Chromium with the site's own faces, so the comparison is made on Linux only
 *     (A§10.1: "using self-hosted fonts on a fixed runner image"). The page is in the state a first visit leaves it in: the learner's
 *     "3D off", reduced motion, every entrance finished, the fonts in. The tolerance is the share of pixels that may differ. When a runner
 *     draws the page a little differently, the failure's artifact (uploaded by ci.yml) holds the actual image beside the expected one
 *     and their diff: copy the actual over the baseline, or make new baselines with `npx playwright test --project=smoke screenshots
 *     --update-snapshots` on a machine that draws as the runner does.
 *   - The 3D view is never compared: SwiftShader's output is not a reference. It is captured as an artifact (attached to the report, and
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

/**
 * How long a 2D screenshot assertion may take to capture the page: 30 s [estimated], in place of the config's 10 s for every `expect`.
 * The tolerance above is what the comparison allows; this is only the wait. On a 4-core runner, the 2D pass after a fire at 1280 px ran
 * out of the 10 s before a single capture was taken, in both attempts of two runs, while the 3D pass's test drew beside it on SwiftShader
 * [measured 2026-11-09, PR #2's CI: the fonts were in, then the timeout]. The same test passed in the run before, in 30.5 s.
 * The wait was not what it lacked: the capture waited on a browser that SwiftShader kept busy with the page, and with the 3D pass beside it.
 * The smoke project composes its pages on the CPU now (playwright.config.ts, W1b-T13), and the same test took 1.8 s on four cores of a
 * laptop at a load average of 20 to 40, where it took 13.1 s without that [measured 2026-11-09 at 54d880f], so the 30 s is a backstop
 * and not what the capture needs.
 */
const CAPTURE_TIMEOUT = 30_000

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

test.describe('the front page on its diagram', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const width of PR_WIDTHS) {
    test(`at ${width} px matches its baseline within ${TOLERANCE * 100}%`, async ({ page, context }) => {
      test.skip(process.platform !== 'linux', 'the baselines are Linux Chromium renderings')
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/')
      await quiet(page)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`front-${width}.png`, { maxDiffPixelRatio: TOLERANCE, timeout: CAPTURE_TIMEOUT })
    })
  }
})

test.describe('the front page after its first step (W0 finding F1)', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const width of PR_WIDTHS) {
    test(`at ${width} px, two requests admitted and one step run, matches its baseline within ${TOLERANCE * 100}%`, async ({ page, context }) => {
      test.skip(process.platform !== 'linux', 'the baselines are Linux Chromium renderings')
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/')
      // The queue moves up as a request is admitted, so its first chip is always the next in line.
      for (const no of ['R1', 'R2']) await page.getByRole('button', { name: `Admit request ${no} into a batch slot` }).click()
      await page.locator('[data-front-step]').getByRole('button', { name: 'Step', exact: true }).click()
      // The step drawn: a forward on the two live slots, and the two empty slots the GPU paid for.
      await expect(page.locator('.es-lanes__slab[data-use="token"]')).toHaveCount(2)
      await expect(page.locator('.es-lanes__slab[data-use="empty"]')).toHaveCount(2)
      await page.evaluate(() => window.scrollTo(0, 0))
      await quiet(page)
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`front-fired-${width}.png`, { maxDiffPixelRatio: TOLERANCE, timeout: CAPTURE_TIMEOUT })
    })
  }
})

test.describe('the 3D view of the front page', () => {
  for (const width of PR_WIDTHS) {
    test(`at ${width} px is drawn, not blank, and its capture is kept as an artifact (on a phone's width: withheld)`, async ({ page, context }, info) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/')
      if (width < 768) {
        // A phone is offered no 3D until the time track has a layout a phone can read (build B's finish review): no switch, no stage.
        await quiet(page)
        await expect(page.locator('section.es-front-service').getByRole('button', { name: '3D', exact: true })).toHaveCount(0)
        await expect(page.locator('section.es-front-service [data-stage]')).toHaveCount(0)
        return
      }
      await settled3d(page)
      const stage = page.locator('section.es-front-service [data-stage]')
      const canvas = stage.locator('canvas')
      await expect(canvas).toBeVisible()
      // The scene with something in it: two requests admitted and one step run, so the time track holds the step drawn and not only its
      // empty rows. A device of four cores or fewer starts at tier 1 (no MSAA; src/scene/tiers.ts), where the empty track alone is flat
      // enough to draw 40 colours and no more; the bar below is unchanged and is met by the scene a learner sees after the first step.
      for (const no of ['R1', 'R2']) await page.getByRole('button', { name: `Admit request ${no} into a batch slot` }).click()
      await page.locator('[data-front-step]').getByRole('button', { name: 'Step', exact: true }).click()
      await settled3d(page)

      // The artifact: the time track as the learner sees it, with its labels over it.
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

/*
 * R-T47: the screens of the redesign (REDESIGN 5.2, "baselines exist for"), each at 1440 x 900 and at 390 x 844: the front page on a first
 * visit and as a learner who has been here returns to it, TR5a lesson 1, TR1 lesson 1, KV page pool, Request path and Course. What is
 * compared is the first screen, with the learner's "3D off" and reduced motion, every entrance finished and the faces in, at the same tolerance
 * as the baselines above. A baseline that is blessed anew is blessed for an intended change and is listed in the task's report.
 */
const SCREENS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

/** What `es:next` and `es:intro` hold for a learner who has been here: the way on points into TR5a lesson 1, and the front page's parts were met. */
const RETURNING = {
  next: JSON.stringify({ href: '/m/tr5a/l1-why-one-model-needs-several-kv-caches', label: 'Continue: TR5a lesson 1, the run', word: 'Continue' }),
  intro: JSON.stringify({ loop: ['waiting', 'slot', 'cpu', 'gpu', 'step', 'now'] }),
}

const REDESIGNED: { name: string; route: string; returning?: boolean }[] = [
  { name: 'front-first-visit', route: '/' },
  { name: 'front-returning', route: '/', returning: true },
  { name: 'tr5a-lesson-1', route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches' },
  { name: 'tr1-lesson-1', route: '/m/tr1/l1-five-mechanisms' },
  { name: 'kv-page-pool', route: '/play/pool' },
  { name: 'request-path', route: '/play/engine-floor' },
  { name: 'course', route: '/map' },
]

test.describe('the screens of the redesign', () => {
  test.use({ reducedMotion: 'reduce' })

  for (const screen of REDESIGNED) {
    for (const size of SCREENS) {
      test(`${screen.name} at ${size.width} x ${size.height} matches its baseline within ${TOLERANCE * 100}%`, async ({ page, context }) => {
        test.skip(process.platform !== 'linux', 'the baselines are Linux Chromium renderings')
        await withSettings(context, { view3d: false })
        if (screen.returning === true) {
          await context.addInitScript(([next, intro]) => {
            window.localStorage.setItem('es:next', next)
            window.localStorage.setItem('es:intro', intro)
          }, [RETURNING.next, RETURNING.intro] as const)
        }
        await page.setViewportSize(size)
        await open(page, screen.route)
        await quiet(page)
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => window.scrollTo(0, 0))
        await expect(page).toHaveScreenshot(`${screen.name}-${size.width}.png`, { maxDiffPixelRatio: TOLERANCE, timeout: CAPTURE_TIMEOUT })
      })
    }
  }
})
