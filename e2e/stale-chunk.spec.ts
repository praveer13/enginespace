/*
 * The `vite:preloadError` handler of src/main.tsx (ARCHITECTURE §3.2; W0-T01 checked it once by hand, and this is that check).
 *
 * A deploy replaces the hashed chunks under an open tab, so a lazy route import can fail ("Failed to fetch dynamically imported
 * module"), and Vite reports it as `vite:preloadError` before it rethrows. The handler reloads once, to pick up the new index.html,
 * and a sessionStorage flag stops a chunk that is still missing after the reload from making a loop. Here a route's chunk is refused
 * by the network, as a deploy leaves it, and the walks are the ones that the handler's comment gives:
 *
 *   1. A page whose own chunk is missing reloads once, and the reloaded page, which cannot load the chunk either, shows the route's
 *      error boundary (src/App.tsx) with its Reload button. It does not reload again, and the flag says why. When the chunk is back,
 *      Reload brings the page.
 *   2. A link to a page whose chunk is missing reloads the page the learner is on, once, and the second try shows the error page.
 *   3. While the flag stands the one reload is spent: the error page comes at once.
 *   4. The flag is cleared once a page has stayed up for 30 s [estimated, kernelspace's figure], so a later deploy gets its own reload.
 *      A fake clock moves those 30 s.
 *   5. Storage that cannot be written is no loop guard, so the handler leaves recovery to the error boundary and reloads nothing.
 *
 * It runs against the built site, through the config's `baseURL`, in the nightly sweep with the other specs of the `features` project.
 */
import type { Page } from '@playwright/test'
import { expect, open, test, withSettings } from './support/site'

/** How long a load has to arrive on a machine that other work shares (e2e/settings.spec.ts has the measurement). */
const ARRIVE = { timeout: 45_000 }
const FLAG = 'es:preload-reloaded'
/** The Settings page's chunk, which the built site loads from assets/Settings-<hash>.js when the route is opened. */
const CHUNK = '**/assets/Settings-*.js'

test.beforeEach(async ({ context }) => {
  await withSettings(context, { view3d: false })
})

/** How many times the browser has loaded a document, and the flag as the page holds it. */
function watchLoads(page: Page): { loads: () => number } {
  let loads = 0
  page.on('request', (request) => {
    if (request.resourceType() === 'document') loads += 1
  })
  return { loads: () => loads }
}
const flag = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), FLAG)
const footerLink = (page: Page, name: string) => page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name, exact: true })
const failed = (page: Page) => page.getByRole('heading', { level: 1, name: 'Something went wrong' })

/**
 * The page stays quiet about the chunk that the network refuses: the failed request is the thing under test. Anything else the page logs
 * as an error still fails the spec (the `watch` fixture), so what is let through is the browser's own report of that one request.
 */
async function refuseChunk(page: Page) {
  await page.route(CHUNK, (route) => route.abort('failed'))
}

test.describe('a chunk that a deploy left behind', () => {
  test('reloads a page that cannot load its own chunk once, and then shows the error page with its Reload button, without a loop', async ({ page, watch }) => {
    const { loads } = watchLoads(page)
    await refuseChunk(page)
    await page.goto('/settings')

    // The first load set the flag and reloaded, and the second, which cannot load the chunk either, has the error boundary's page.
    await expect(failed(page)).toBeVisible(ARRIVE)
    expect(await flag(page), 'the flag that stops a second reload').not.toBeNull()
    expect(loads(), 'the page and its one reload').toBe(2)
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()

    // No further reload comes: the page has been up for a while by now, and the count has not moved.
    await expect.poll(() => page.evaluate(() => performance.now()), { message: 'the error page stays up' }).toBeGreaterThan(1500)
    expect(loads()).toBe(2)

    // The deploy's files are back, and Reload brings the page.
    await page.unroute(CHUNK)
    await page.getByRole('button', { name: 'Reload' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible(ARRIVE)
    expect(loads(), 'Reload is a load of its own').toBe(3)

    // The refusal is the browser's own report of a failed request, and the handler's reload makes the page leave in the middle of it.
    watch.clear()
  })

  test('reloads the page the learner is on when a link leads to a missing chunk, and shows the error page on the second try', async ({ page, watch }) => {
    const { loads } = watchLoads(page)
    await open(page, '/map')
    expect(await flag(page)).toBeNull()
    await refuseChunk(page)

    // The router stays where it was until the page it was asked for has loaded, so the reload is of the page the learner is on.
    await footerLink(page, 'Settings').click()
    await expect.poll(loads, { message: 'the handler reloads' }).toBe(2)
    await expect(page.getByRole('heading', { level: 1, name: 'Course map' })).toBeVisible(ARRIVE)
    expect(await flag(page)).not.toBeNull()

    await footerLink(page, 'Settings').click()
    await expect(failed(page)).toBeVisible(ARRIVE)
    expect(loads(), 'the one reload is spent').toBe(2)
    watch.clear()
  })

  test('does not reload while the flag stands: the one reload is spent, and the error page comes at once', async ({ page, watch }) => {
    const { loads } = watchLoads(page)
    await open(page, '/map')
    await page.evaluate((key) => sessionStorage.setItem(key, String(Date.now())), FLAG)
    await refuseChunk(page)
    await footerLink(page, 'Settings').click()
    await expect(failed(page)).toBeVisible(ARRIVE)
    expect(loads(), 'no reload at all').toBe(1)
    expect(await flag(page)).not.toBeNull()
    watch.clear()
  })

  test('clears its flag once the page has stayed up for 30 s, so that a later deploy gets a reload of its own', async ({ page }) => {
    // The clock is installed before the page, so the timer that main.tsx sets at start is the fake one.
    await page.clock.install()
    await open(page, '/map')
    await page.evaluate((key) => sessionStorage.setItem(key, String(Date.now())), FLAG)
    await page.clock.fastForward(29_000)
    expect(await flag(page), 'still set at 29 s').not.toBeNull()
    await page.clock.fastForward(2_000)
    expect(await flag(page), 'cleared by 31 s').toBeNull()
  })

  test('reloads nothing where storage cannot be written, since there is then no loop guard', async ({ page, watch }) => {
    const { loads } = watchLoads(page)
    await open(page, '/map')
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
    await refuseChunk(page)
    await footerLink(page, 'Settings').click()
    await expect(failed(page)).toBeVisible(ARRIVE)
    expect(loads(), 'the error page is the recovery').toBe(1)
    watch.clear()
  })
})
