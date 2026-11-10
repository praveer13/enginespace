/*
 * W1b-T09, acceptance 1: a game's page and a lab's page keep their own `<title>` after the app has mounted (WCAG 2.4.2, Page Titled).
 *
 * The route table names `Game · enginespace` and `Lab · enginespace` for every game and every lab, and src/App.tsx writes the route's
 * title to the tab on each navigation. The document that prepare-pages serves has the page's own (scripts/pages/plan.ts: `Service ·
 * enginespace`, `Lab tr1.fork · enginespace`), so a page that said nothing of its title replaced it with the generic one the moment it
 * mounted, as the live check of 2026-11-09 found on all five games and all twelve labs. A page now sets its own title as it mounts
 * (src/pages/Game.tsx, src/pages/Lab.tsx, through the hook that the module and lesson pages use), and a lab that is not built yet
 * keeps the heading its document has too (`Lab tr1.fork`, which the live check saw become `Lab`).
 *
 * Each page is read in a real browser after it has mounted and again after it has settled, because the route's title is written by the
 * root route's effect and the page's by its own, and a title that is right at the first look and wrong at the second is the same defect.
 * In a run that serves prepared documents (ES_E2E_NIGHTLY=1 or ES_E2E_PAGES=1) the title and the heading are also compared with the
 * document that the build wrote for the address, which is the claim in the finding: the tab does not change when the app takes over.
 * The games and the labs come from the registry and from the lab table, so a game or a lab that is added is covered without being listed.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { GAMES } from '../packages/play/registry'
import { BUILT_LABS, LAB_TASKS, labName, titled } from '../src/content/render/model'
import { expect, open, quiet, test, withSettings } from './support/site'
import type { Watch } from './support/site'

const dist = path.resolve(import.meta.dirname, '../dist')

/** The `<title>` and the first `<h1>` of the document that prepare-pages wrote for an address, or null when the run is not on prepared documents. */
function served(route: string): { title: string; heading: string } | null {
  const file = path.join(dist, route.slice(1), 'index.html')
  if (!existsSync(file)) return null
  const html = readFileSync(file, 'utf8')
  const text = (tag: string) => (new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(html)?.[1] ?? '').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  return { title: text('title'), heading: text('h1') }
}

/**
 * The app has taken the page: the board across the top is the app's, and the static shell of a prepared document has none. A document
 * that prepare-pages wrote already has the page's own title and heading, so without this the checks below could read the shell, which
 * is right, before the app has replaced it and set the title that it means to keep.
 */
const mounted = (page: Page) => expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()

/**
 * An address that no document answers gets 404.html with the status 404 on Pages (and `vite preview` answers it 200), and Chromium logs the
 * failed load of the page itself as an error, which the net of support/site.ts fails a spec for. The page is right to be there: the app boots
 * from the fallback and says that nothing lives at the address. So the one error that a 404 prints is expected, is seen, and is let go;
 * any other stays.
 */
function expectTheMiss(watch: Watch): void {
  const miss = 'console: Failed to load resource: the server responded with a status of 404 (Not Found)'
  expect(watch.errors.filter((error) => error !== miss)).toEqual([])
  watch.errors.length = 0
}

test.beforeEach(async ({ context }) => {
  // The 2D pass: a title does not depend on the scene, and a software renderer needs most of a second for each frame of one.
  await withSettings(context, { view3d: false })
})

test.describe('a game page', () => {
  for (const game of GAMES.games) {
    test(`/play/${game.id} is titled ${JSON.stringify(titled(game.title))} once it has mounted, and stays so`, async ({ page }) => {
      const route = `/play/${game.id}`
      await open(page, route)
      await mounted(page)
      await expect(page).toHaveTitle(titled(game.title))
      await quiet(page)
      await expect(page).toHaveTitle(titled(game.title))
      const document = served(route)
      if (document !== null) expect(document.title, 'the title of the document the build wrote').toBe(titled(game.title))
    })
  }
})

test.describe('a lab page', () => {
  // Every lab of the course: the forge labs that are built, and the labs that wait for an open task.
  for (const lab of [...BUILT_LABS, ...Object.keys(LAB_TASKS)]) {
    test(`/labs/${lab} is titled ${JSON.stringify(titled(labName(lab)))} once it has mounted, and stays so`, async ({ page }) => {
      const route = `/labs/${lab}`
      await open(page, route)
      await mounted(page)
      await expect(page).toHaveTitle(titled(labName(lab)))
      await quiet(page)
      await expect(page).toHaveTitle(titled(labName(lab)))
      const document = served(route)
      if (document !== null) {
        expect(document.title, 'the title of the document the build wrote').toBe(titled(labName(lab)))
        expect(document.heading, 'the heading of the document the build wrote').toBe(labName(lab))
      }
    })
  }

  test('a lab that is not built yet keeps the heading its document has: `Lab tr1.fork`, and not `Lab`', async ({ page }) => {
    await open(page, '/labs/tr1.fork')
    await mounted(page)
    await quiet(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(labName('tr1.fork'))
    await expect(page.locator('main')).toContainText(LAB_TASKS['tr1.fork'])
  })

  test('a lab that the course does not have is titled for what it is', async ({ page, watch }) => {
    await open(page, '/labs/nothing-of-the-kind')
    await mounted(page)
    await expect(page).toHaveTitle(titled('Lab not found'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lab not found')
    expectTheMiss(watch)
  })
})

test.describe('a game that the registry does not have', () => {
  test('is titled for what it is', async ({ page, watch }) => {
    await open(page, '/play/nothing-of-the-kind')
    await mounted(page)
    await expect(page).toHaveTitle(titled('Game not found'))
    expectTheMiss(watch)
  })
})
