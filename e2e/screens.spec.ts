/*
 * R-T47, REDESIGN section 5.2 "Every route": the checks that every screen of the site holds, run over every route of e2e/routes.ts with an
 * empty ledger, which is how a visitor meets it first.
 *
 *   - The header's Continue is `nextStep`'s answer, and so is every control that says Continue or Start the course (e2e/support/screens.ts).
 *   - At most one amber fill in a viewport, at 1440 x 900 and at 390 x 844.
 *   - No banned word or phrase in the text, the alt text and the aria labels, and no build-log id.
 *   - No sideways scroll at 320, 360 and 390 px, and no text cut off at the edge.
 *   - At 844 x 390 (a phone on its side) and at 320 x 256 (a laptop at 400% zoom) nothing is sticky or fixed.
 *
 * A route that fails says which check and what it found: the finding is the product's, and the fix is the product's. No check is skipped.
 */
import { loopPartsOf } from '../packages/play/loop/parts'
import { PR_ROUTES, W1_LEVEL_PAGES, W1_ROUTES, W2_ROUTES } from './routes'
import { amberByScroll, copyProblems, FIRST_VISIT, LESSONS, stuck, wayOnProblems } from './support/screens'
import { clipped, expect, open, quiet, test, withSettings } from './support/site'

/**
 * The design system's own page: a specimen sheet that no page links to. It prints the system's token names (`--es-lamp`, `--es-tape`) and each
 * component in every state, amber buttons included, so the checks that read what a learner reads (the way on, the copy, the one amber fill)
 * are about the course's screens and not about it. Its layout is held like any other: no sideways scroll, nothing sticky when short.
 */
const SPECIMEN = '/design'

/** The routes of e2e/routes.ts, and every lesson and module the course has built (the lessons table of the compiled map): all 27 lessons, not a sample. */
const ROUTES = [...new Set([...PR_ROUTES, ...W1_ROUTES, ...W2_ROUTES, ...W1_LEVEL_PAGES, ...LESSONS.map((lesson) => lesson.route), ...LESSONS.map((lesson) => `/m/${lesson.module}`)])]

/** The widths of the reflow check (WCAG 1.4.10 names 320), at a height that a phone has. */
const REFLOW = [320, 360, 390]
/** Where nothing may be sticky: a phone on its side, and a desk at 400% zoom. */
const SHORT = [
  { width: 844, height: 390 },
  { width: 320, height: 256 },
]

test.describe('every route holds the checks of REDESIGN 5.2', () => {
  for (const route of ROUTES) {
    test(`${route}`, async ({ page, context }) => {
      test.setTimeout(180_000)
      // The 2D pass, and nothing moving under a measurement: the 3D scene is the same screen, and its labels are not text of the page.
      await withSettings(context, { view3d: false })
      const found: string[] = []
      const note = (check: string, problems: readonly string[]) => void found.push(...problems.map((problem) => `${check}: ${problem}`))

      await page.setViewportSize({ width: 1440, height: 900 })
      await open(page, route)
      await quiet(page)
      if (route !== SPECIMEN) {
        note('the way on at 1440', await wayOnProblems(page, FIRST_VISIT))
        note('copy at 1440', await copyProblems(page))
        note('amber at 1440', await amberByScroll(page))
      }

      await page.setViewportSize({ width: 390, height: 844 })
      await quiet(page, 300)
      if (route !== SPECIMEN) {
        note('the way on at 390', await wayOnProblems(page, FIRST_VISIT))
        note('copy at 390', await copyProblems(page))
        note('amber at 390', await amberByScroll(page))
      }

      for (const width of REFLOW) {
        await page.setViewportSize({ width, height: 800 })
        await quiet(page, 300)
        const edge = await clipped(page)
        note(`sideways scroll at ${width}`, edge.scrolls > 0 ? [`the page is ${edge.scrolls} px wider than the viewport`] : [])
        note(`text past the edge at ${width}`, edge.text)
      }

      for (const { width, height } of SHORT) {
        await page.setViewportSize({ width, height })
        await quiet(page, 300)
        note(`sticky at ${width} x ${height}`, await stuck(page))
      }

      expect(found, `${route}: what the checks of section 5.2 found`).toEqual([])
    })
  }
})

/*
 * REDESIGN 5.2, the length and position of each kind of screen: the front page, the Course, a module, and a lesson of each opener. (A game's
 * screen is held in e2e/walks.spec.ts, at the start and at the result.) The lessons are the ones the openers table names: TR5a lesson 1 opens
 * with its run (A), TR1 lesson 1 with its primer and then its run (B), TR2 lesson 7 with reading (C), and TR2 lesson 1 is the long one.
 */
const SCREEN_SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

test.describe('the length and position of each screen (REDESIGN 5.2)', () => {
  for (const size of SCREEN_SIZES) {
    test.describe(`at ${size.width} x ${size.height}`, () => {
      test.use({ viewport: size })

      test.beforeEach(async ({ context }) => {
        await withSettings(context, { view3d: false })
      })

      test('the Course: the first link to a lesson is within 700 px, and at a desk the open module\'s lesson list starts there too', async ({ page }) => {
        await open(page, '/map')
        await quiet(page)
        const first = await page.locator('main a[href^="/m/"][href*="/l"]').first().evaluate((link) => link.getBoundingClientRect().top + window.scrollY)
        expect(first, 'where the first link to a lesson starts').toBeLessThan(700)
        if (size.width >= 1000) {
          const row = await page.locator('li.es-course__row[data-open="true"] li.es-course__lesson a').first().evaluate((link) => link.getBoundingClientRect().top + window.scrollY)
          expect(row, 'where the first lesson row of the open module starts').toBeLessThan(700)
        }
        // A module that is not published says so and is not a link: its own row's heading holds none.
        await expect(page.locator('li.es-course__row', { hasText: 'Not published yet' }).first().locator('h3 a')).toHaveCount(0)
      })

      test('a module: the lesson list starts within 700 px', async ({ page }) => {
        await open(page, '/m/tr2')
        const top = await page.locator('#lessons').evaluate((node) => node.getBoundingClientRect().top + window.scrollY)
        expect(top, 'where the lesson list starts').toBeLessThan(700)
      })

      test('opener A, TR5a lesson 1: the first control is in the first viewport at a desk', async ({ page }) => {
        await open(page, '/m/tr5a/l1-why-one-model-needs-several-kv-caches')
        await quiet(page)
        const top = await page.locator('#run :is(button, input, a[href]):not([disabled])').first().evaluate((control) => control.getBoundingClientRect().top + window.scrollY)
        if (size.width >= 1000) expect(top, 'the first control of the run').toBeLessThan(size.height)
        const instrument = await page.locator('#run [data-block="game"]').first().evaluate((node) => node.getBoundingClientRect().top + window.scrollY)
        expect(instrument, 'the instrument').toBeLessThan(size.height * 2)
      })

      test('opener B, TR1 lesson 1: the instrument\'s top edge is in the first viewport at a desk, and within two screens on a phone', async ({ page }) => {
        await open(page, '/m/tr1/l1-five-mechanisms')
        await quiet(page)
        const top = await page.locator('#run [data-block="game"]').first().evaluate((node) => node.getBoundingClientRect().top + window.scrollY)
        expect(top, 'the instrument\'s top edge').toBeLessThan(size.width >= 1000 ? size.height : size.height * 2)
      })

      test('opener C, TR2 lesson 7: something to do comes within 450 words', async ({ page }) => {
        await open(page, '/m/tr2/l7-the-same-loop-elsewhere')
        await quiet(page)
        const words = await page.evaluate(() => {
          const flow = document.querySelector('.es-lesson__read-flow') ?? document.querySelector('#read')
          if (flow === null) return -1
          const first = flow.querySelector('[data-block="predict"], [data-block="item"], [data-block="game"], .es-c-block')
          const range = document.createRange()
          range.setStart(flow, 0)
          if (first === null) range.setEnd(flow, flow.childNodes.length)
          else range.setEndBefore(first)
          return range.toString().trim().split(/\s+/).filter(Boolean).length
        })
        expect(words, 'words of reading before the first thing to do').toBeGreaterThan(0)
        expect(words, 'words of reading before the first thing to do').toBeLessThanOrEqual(450)
      })
    })
  }

  test.describe('at 1440 x 900', () => {
    test.use({ viewport: { width: 1440, height: 900 } })

    test('the front page is at most 2,000 px long', async ({ page, context }) => {
      await withSettings(context, { view3d: false })
      await open(page, '/')
      await quiet(page)
      expect(await page.evaluate(() => document.documentElement.scrollHeight), 'the length of the front page').toBeLessThanOrEqual(2000)
    })

    // The length of the lesson is the page's own. A first meeting with the step loop opens its first-run strip in the dock, which is a transient
    // part of the instrument (and 600 px taller than the dock it becomes), so the page is measured as it stands once the parts have been met.
    test('TR2 lesson 1 is at most 12,000 px long', async ({ page, context }) => {
      await withSettings(context, { view3d: false })
      const met = JSON.stringify({ loop: loopPartsOf('first-3-gap').map((part) => part.id) })
      await context.addInitScript((flag) => window.localStorage.setItem('es:intro', flag), met)
      await open(page, '/m/tr2/l1-one-step-five-calls')
      await quiet(page)
      expect(await page.evaluate(() => document.documentElement.scrollHeight), 'the length of TR2 lesson 1').toBeLessThanOrEqual(12_000)
    })
  })
})
