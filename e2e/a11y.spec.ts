/*
 * W0-T21, acceptance 1: axe finds no serious or critical violation on the eight routes of the pull-request subset, at 360 and at 1280
 * px (ARCHITECTURE §10.1 and §11.2; e2e/routes.ts lists them, and verify:routes holds the list to the route table).
 *
 * What a run is.
 *   - Axe checks WCAG 2.0, 2.1 and 2.2 at levels A and AA, and its best-practice rules besides (`wcag2a`, `wcag2aa`, `wcag21a`,
 *     `wcag21aa`, `wcag22aa`, `best-practice`). A serious or critical violation fails. The heading rules fail whatever their impact,
 *     because W0-T09's third check is "headings form a valid outline (axe, W0-T21)". Every other finding is printed and kept in the
 *     report, and does not fail.
 *   - Each route is audited with the learner's "3D off" (the 2D pass and nothing moving). The front page is audited again with the 3D
 *     pass live and resting, because the DOM differs: the 3D scene's labels are text over the canvas. The nightly sweep does that for
 *     every route that draws one.
 *   - Reflow (WCAG 1.4.10), which axe does not test: at a phone's width no text is cut off at the right edge, and the page needs no
 *     sideways scroll. A table in a focusable region may scroll; nothing else may.
 *   - A check that cannot fail proves nothing, so the audit is also run on a page with a nameless button, and it must find it.
 *
 * Under ES_E2E_NIGHTLY=1 the routes are every document that prepare-pages writes, and the widths are 320, 360 and 1280 (A§11.2).
 */
import AxeBuilder from '@axe-core/playwright'
import type { AxeResults, Result } from 'axe-core'
import type { Page } from '@playwright/test'
import { NIGHTLY_WIDTHS, PR_ROUTES, PR_WIDTHS } from './routes'
import { clipped, documentRoutes, expect, HAS_3D, NIGHTLY, open, quiet, settled3d, test, withSettings } from './support/site'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
/** W0-T09: "headings form a valid outline". */
const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']

const ROUTES = NIGHTLY ? documentRoutes() : PR_ROUTES
const WIDTHS = NIGHTLY ? NIGHTLY_WIDTHS : PR_WIDTHS
/**
 * The routes that are audited with their 3D pass drawn as well. A software renderer draws a frame in most of a second, so a pull
 * request audits the front page, which is the one a visitor meets first, and the nightly sweep audits them all.
 */
const AUDITED_IN_3D = (route: string) => HAS_3D(route) && (NIGHTLY || route === '/')

/**
 * Defects that this spec found and that no task has fixed yet, keyed by `<route> at <width>`. A test that is listed here is expected to
 * fail, and Playwright fails it when it passes: whoever fixes the page deletes the entry, which is how a known defect leaves the list.
 */
const KNOWN_CLIPPED: Record<string, string> = {}

const IMPACTS = new Set(['serious', 'critical'])
const summary = (violation: Result) => `${violation.id} [${violation.impact}] ${violation.help}: ${violation.nodes.slice(0, 4).map((node) => node.target.join(' ')).join(' ; ')}`

function analyze(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).withTags(TAGS).analyze()
}

/** The audit: what fails, and what is only said. */
async function audit(page: Page, label: string): Promise<void> {
  const results = await analyze(page)
  const rules = results.passes.length + results.violations.length
  // A page that axe could not read (a blank document, a frame it never entered) passes everything: it must have been looked at.
  expect(rules, `${label}: the rules that axe ran`).toBeGreaterThan(20)
  const blocking = results.violations.filter((violation) => IMPACTS.has(violation.impact ?? ''))
  expect(blocking.map(summary), `${label}: serious or critical violations`).toEqual([])
  expect(results.violations.filter((violation) => HEADING_RULES.includes(violation.id)).map(summary), `${label}: the heading outline`).toEqual([])
  const rest = results.violations.map((violation) => `${violation.id} [${violation.impact}] on ${violation.nodes.length} node${violation.nodes.length === 1 ? '' : 's'}`)
  console.log(`axe ${label}: ${rules} rules, ${rest.length === 0 ? 'no violation' : rest.join(', ')}`)
  for (const finding of rest) test.info().annotations.push({ type: 'axe (does not fail)', description: `${label}: ${finding}` })
}

for (const width of WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: 800 } })

    for (const route of ROUTES) {
      test(`${route}: axe finds no serious or critical violation, and the headings are an outline`, async ({ page, context }) => {
        await withSettings(context, { view3d: false })
        await open(page, route)
        await quiet(page)
        await audit(page, `${route} at ${width} px`)
      })
    }

    for (const route of ROUTES.filter(AUDITED_IN_3D)) {
      test(`${route}, with its 3D pass drawn: axe finds no serious or critical violation`, async ({ page }) => {
        test.setTimeout(120_000)
        await open(page, route)
        // The design page's specimen is a scene that keeps moving to show its motion, so it is audited live and not at rest.
        await settled3d(page, { rested: route !== '/design' })
        await audit(page, `${route} (3D) at ${width} px`)
      })
    }

    // Reflow is a phone's problem: at 1280 px there is nothing to cut off.
    if (width <= 360) {
      for (const route of ROUTES) {
        test(`${route}: no text is cut off at the right edge, and the page does not scroll sideways`, async ({ page, context }) => {
          const known = KNOWN_CLIPPED[`${route} at ${width}`]
          test.fail(known !== undefined, known)
          await withSettings(context, { view3d: false })
          await open(page, route)
          await quiet(page)
          const found = await clipped(page)
          expect(found.scrolls, 'pixels the page scrolls sideways').toBeLessThanOrEqual(0)
          expect(found.text, 'text past the right edge, and out of every box that scrolls').toEqual([])
        })
      }
    }
  })
}

test.describe('the audit can fail', () => {
  test('a page with a button that has no name is critical, and the audit finds it', async ({ page }) => {
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>A button without a name</h1><button type="button"></button></main></body></html>',
    )
    const results = await analyze(page)
    expect(results.violations.filter((violation) => IMPACTS.has(violation.impact ?? '')).map((violation) => violation.id)).toContain('button-name')
  })

  test('a page that jumps from a title to a third-level heading breaks the outline, and the heading rule finds it', async ({ page }) => {
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Title</h1><h3>Skipped a level</h3></main></body></html>',
    )
    const results = await analyze(page)
    expect(results.violations.filter((violation) => HEADING_RULES.includes(violation.id)).map((violation) => violation.id)).toContain('heading-order')
  })

  test('a box wider than the phone, with text in it, is found by the reflow check, and one inside a scrolling region is not', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Fixture</title></head><body style="margin:0;overflow-x:hidden"><main><p style="width:500px;margin:0">Text in a box that is wider than the phone.</p>' +
        '<div style="overflow-x:auto"><p style="width:500px;margin:0">Text in a region that scrolls.</p></div></main></body></html>',
    )
    const found = await clipped(page)
    expect(found.text).toHaveLength(1)
    expect(found.text[0]).toContain('Text in a box')
  })
})
