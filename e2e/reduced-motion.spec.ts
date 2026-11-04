/*
 * W0-T21: reduced motion (ARCHITECTURE §6.9, §11.2: "no animation frame requested after a scene settles under `reducedMotion: 'reduce'`
 * emulation"; WCAG 2.2.2 and 2.3.3). Everything here runs with the browser asking for reduced motion, and the site's own setting left
 * on "follow my system".
 *
 *   - At rest, a page holds nothing that moves: no element has an animation longer than the 1 ms that src/design/base.css leaves, or one
 *     that repeats, or a transition, and no animation is running.
 *   - A 3D pass draws a first frame, comes to rest, and then asks for no animation frame at all: a counter on `requestAnimationFrame`
 *     reads the same after the scene has rested as it did when it did, for a second and a half.
 *   - The front page's game plays under it: Auto, which rings the bell by itself, is off until it is asked for (WCAG 2.2.2), the keys
 *     play the level to its debrief, and the bell's strike does not run.
 *   - A check that cannot fail proves nothing: the same scan and the same counter are run on a page that animates, and see it.
 *
 * The routes are the pull-request eight (e2e/routes.ts), or every document under ES_E2E_NIGHTLY=1 (A§10.1's nightly list).
 */
import type { Page } from '@playwright/test'
import { PR_ROUTES } from './routes'
import { front, playToTheDebrief } from './support/front'
import { documentRoutes, expect, HAS_3D, NIGHTLY, open, quiet, settled3d, test, withSettings } from './support/site'

test.use({ reducedMotion: 'reduce' })

declare global {
  interface Window {
    __raf?: number
  }
}

const ROUTES = NIGHTLY ? documentRoutes() : PR_ROUTES

/** Puts a counter on `requestAnimationFrame`. Reading the count asks for no frame. */
function installCounter() {
  window.__raf = 0
  const request = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => {
    window.__raf = (window.__raf ?? 0) + 1
    return request(callback)
  }
}
/** The counter, in place from the first script of every page that follows. */
const countFrames = (page: Page) => page.addInitScript(installCounter)

/** Waits until the page has asked for no frame for 750 ms (at most 30 s), and returns how many it asked for in all. */
async function framesAtRest(page: Page): Promise<number> {
  let last = -1
  let since = Date.now()
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const now = await page.evaluate(() => window.__raf ?? 0)
    if (now !== last) {
      last = now
      since = Date.now()
    } else if (Date.now() - since >= 750) return now
    await page.waitForTimeout(150)
  }
  throw new Error(`the page was still asking for frames after 30 s (${last} so far)`)
}

/**
 * What still moves, in words: an animation that runs for more than a millisecond or repeats, and a transition. `base.css` leaves
 * `animation-duration: 1ms` and one iteration and `transition-duration: 0ms` on every element and pseudo-element under the setting.
 */
function movingThings(page: Page): Promise<{ styled: string[]; running: string[] }> {
  return page.evaluate(() => {
    const seconds = (value: string) => value.split(',').map((part) => Number.parseFloat(part) / (part.trim().endsWith('ms') ? 1000 : 1))
    const styled: string[] = []
    for (const element of [document.documentElement, ...document.body.querySelectorAll('*')]) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(element, pseudo)
        const name = `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className !== '' ? `.${element.className.split(' ')[0]}` : ''}${pseudo ?? ''}`
        if (style.animationName !== 'none' && (Math.max(...seconds(style.animationDuration)) > 0.0011 || style.animationIterationCount.split(',').some((count) => count.trim() !== '1'))) {
          styled.push(`${name}: animation ${style.animationName} for ${style.animationDuration}, ${style.animationIterationCount} times`)
        }
        if (Math.max(...seconds(style.transitionDuration)) > 0) styled.push(`${name}: transition for ${style.transitionDuration}`)
      }
    }
    const running = document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .map((animation) => animation.constructor.name + (animation instanceof CSSAnimation ? ` ${animation.animationName}` : ''))
    return { styled: styled.slice(0, 10), running }
  })
}

test.describe('at rest, nothing moves', () => {
  for (const route of ROUTES) {
    test(`${route}: no animation, no transition, nothing running`, async ({ page, context }) => {
      await withSettings(context, { view3d: false })
      await open(page, route)
      await quiet(page)
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'the browser asks for reduced motion').toBe(true)
      const found = await movingThings(page)
      expect(found.styled, 'elements that are styled to move').toEqual([])
      expect(found.running, 'animations that are running').toEqual([])
    })
  }
})

test.describe('a 3D pass asks for no frame once it has settled', () => {
  for (const route of ROUTES.filter(HAS_3D)) {
    test(`${route}: a first frame is drawn, and then none is asked for`, async ({ page }) => {
      test.setTimeout(120_000)
      await countFrames(page)
      await open(page, route)
      // The design page's specimen never says that it has settled (it is a demonstration, not a game), so it is waited for by its frames.
      await settled3d(page, { rested: route !== '/design' })
      const drawn = await framesAtRest(page)
      expect(drawn, 'frames asked for before the pass rested').toBeGreaterThan(0)
      await page.waitForTimeout(1500)
      expect(await page.evaluate(() => window.__raf ?? 0), 'frames asked for in the second and a half after it rested').toBe(drawn)
    })
  }
})

test.describe('the front page\'s game under reduced motion', () => {
  test('Auto is off until it is asked for, the keys play the level, and the bell\'s strike does not run', async ({ page, context }) => {
    await withSettings(context, { view3d: false })
    await open(page, '/')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false')
    await front.start(page).focus()
    await page.keyboard.press('Enter')
    await playToTheDebrief(page)
    await expect(front.verdict(page)).toHaveText('Well fired.')
    // The strike of the bell and the printer's feed are CSS animations, 1 ms long under the setting, so none is still running.
    await expect.poll(async () => (await movingThings(page)).running).toEqual([])
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.es-bell__body') as Element).animationDuration)).toBe('0.001s')
    // Auto never started by itself: the clock moved by the one ring that the level took.
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('the checks can fail', () => {
  test('a page that animates and transitions is found by the scan, and one that asks for frames is counted', async ({ page }) => {
    await page.evaluate(installCounter)
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Fixture</title><style>@keyframes spin { to { opacity: 0.5 } } #a { animation: spin 2s infinite; transition: opacity 1s } </style></head>' +
        '<body><main><h1 id="a">Moving</h1></main><script>(function tick() { requestAnimationFrame(tick) })()</script></body></html>',
    )
    const found = await movingThings(page)
    expect(found.styled.join('\n')).toContain('animation spin')
    expect(found.styled.join('\n')).toContain('transition for 1s')
    expect(found.running.length).toBeGreaterThan(0)
    const before = await page.evaluate(() => window.__raf ?? 0)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => window.__raf ?? 0)).toBeGreaterThan(before)
  })
})
