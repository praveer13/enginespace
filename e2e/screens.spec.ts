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

/** The routes of e2e/routes.ts, and every lesson and module the course has built (the lessons table of the compiled map): every lesson the course has built (32 at this writing), not a sample. */
const ROUTES = [...new Set([...PR_ROUTES, ...W1_ROUTES, ...W2_ROUTES, ...W1_LEVEL_PAGES, ...LESSONS.map((lesson) => lesson.route), ...LESSONS.map((lesson) => `/m/${lesson.module}`)])]

/** The widths of the reflow check (WCAG 1.4.10 names 320), at a height that a phone has. */
const REFLOW = [320, 360, 390]
/** Where nothing may be sticky: a phone on its side, and a desk at 400% zoom. */
const SHORT = [
  { width: 844, height: 390 },
  { width: 320, height: 256 },
]

/** TR0 end to end (W2b-T33): its module page, each of its lessons, the Tensor views game and the forward pass lab. */
const TR0_ROUTES = [...LESSONS.filter((lesson) => lesson.module === 'tr0').map((lesson) => lesson.route), '/m/tr0', '/play/shape-shifter', '/labs/tr0.forward']

test("TR0's routes are among the routes checked above, all five lessons included", () => {
  expect(LESSONS.filter((lesson) => lesson.module === 'tr0'), 'the TR0 lessons of the compiled map').toHaveLength(5)
  expect(ROUTES, 'TR0 routes in the list of checked routes').toEqual(expect.arrayContaining(TR0_ROUTES))
})

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
      note('the way on at 1440', await wayOnProblems(page, FIRST_VISIT))
      note('copy at 1440', await copyProblems(page))
      note('amber at 1440', await amberByScroll(page))

      await page.setViewportSize({ width: 390, height: 844 })
      await quiet(page, 300)
      note('the way on at 390', await wayOnProblems(page, FIRST_VISIT))
      note('copy at 390', await copyProblems(page))
      note('amber at 390', await amberByScroll(page))

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

    // REDESIGN P4, name then ask: the Request path's first run names its processes and a hop on a worked example, so the example is drawn whole
    // in the diagram's box, in the first viewport, while the parts are named (the finish review saw it cut to one node on a 120 px strip).
    test('the Request path\'s first run draws its worked example: two processes, a hop between them and a call down one column', async ({ page }) => {
      await open(page, '/play/engine-floor?level=nano')
      await quiet(page)
      const example = page.locator('[data-floor-specimen]')
      await expect(example).toBeVisible()
      const boxes = await page.evaluate(() => {
        const rect = (node: Element | null) => {
          const r = node?.getBoundingClientRect()
          return r === undefined ? null : { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }
        }
        return {
          diagram: rect(document.querySelector('[data-game="engine-floor"] .es-frame__diagram')),
          columns: [...document.querySelectorAll('[data-floor-specimen] .es-lanes__spec-col')].map(rect),
          hop: rect(document.querySelector('[data-spec-hop]')),
          down: rect(document.querySelector('[data-spec-down]')),
        }
      })
      expect(boxes.columns, 'the two process columns').toHaveLength(2)
      for (const part of [...boxes.columns, boxes.hop, boxes.down]) {
        expect(part?.height ?? 0, 'a part of the example is drawn').toBeGreaterThan(0)
        expect(part?.bottom ?? Infinity, 'inside the diagram').toBeLessThanOrEqual((boxes.diagram?.bottom ?? 0) + 1)
        expect(part?.bottom ?? Infinity, 'inside the first viewport').toBeLessThanOrEqual(900)
      }
      for (const column of boxes.columns) expect(column?.height ?? 0, 'a process column runs down the box').toBeGreaterThanOrEqual(200)
    })

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

/*
 * A phone gets no 3D on the Step loop: its time track has no layout a phone can read (REDESIGN 2.9: "2D in lessons and on phones"). The
 * five full levels held it back by the same rule as the demo levels, and the 3D setting a desk visit leaves (on, which is the default) must
 * not bring it back. The desk is the control: the same level offers the switch at 1440 px, so that the phone's missing switch is a choice.
 */
test.describe('the Step loop on a phone', () => {
  const LEVELS = ['async', 'graphs', 'mrv2', 'close', 'mask']
  test('a full level offers a 3D switch at a desk and none at 390 or 360 px, with 3D on in the settings', async ({ page, context }) => {
    await withSettings(context, { view3d: true })
    const game = page.locator('section[data-game="loop"]')
    const switch3d = game.getByRole('button', { name: '3D', exact: true })
    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, '/play/loop?level=graphs&es-tier=1')
    await expect(game).toBeVisible()
    await expect(switch3d).toBeEnabled()
    for (const [width, height] of [[390, 844], [360, 800]] as const) {
      for (const level of LEVELS) {
        await page.setViewportSize({ width, height })
        await open(page, `/play/loop?level=${level}&es-tier=1`)
        await expect(game, `${level} at ${width}`).toBeVisible()
        await expect(switch3d, `${level} at ${width}`).toHaveCount(0)
        await expect(game, `${level} at ${width}`).toHaveAttribute('data-view', '2d')
      }
    }
  })
})

/*
 * A control that is off looks off: the outline of every button, dashed, with a label that is lighter and still readable, and the
 * not-allowed cursor. A quiet button ("Undo" with nothing to undo) had no outline, and read as a plain word.
 */
test.describe('a disabled control reads as a control that is off', () => {
  for (const route of ['/', '/play/loop', '/play/verifier?level=greedy-ngram']) {
    test(`${route}`, async ({ page, context }) => {
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width: 1280, height: 800 })
      await open(page, route)
      await quiet(page)
      const off = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLButtonElement>('button:disabled')]
          .filter((button) => button.getBoundingClientRect().width > 0)
          .map((button) => {
            const style = getComputedStyle(button)
            return { name: (button.textContent ?? '').trim(), style: style.borderTopStyle, edge: style.borderTopColor, cursor: style.cursor }
          }),
      )
      expect(off.length).toBeGreaterThan(0)
      for (const control of off) {
        expect(control.style, control.name).toBe('dashed')
        expect(control.edge, control.name).not.toBe('rgba(0, 0, 0, 0)')
        expect(control.cursor, control.name).toBe('not-allowed')
      }
    })
  }
})

/** The /changes lede at 320 px ends on a line of three words or more (balanced, not left with a stub). */
test.describe('the /changes lede', () => {
  test('does not end on a one-word line at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await open(page, '/changes')
    const lines = await page.locator('.es-page__lead').evaluate((lead) => {
      const text = lead.firstChild as Text
      const range = document.createRange()
      const rows: string[] = []
      let row = ''
      let at: number | null = null
      for (let i = 0; i < text.length; i++) {
        range.setStart(text, i)
        range.setEnd(text, i + 1)
        const top = Math.round(range.getBoundingClientRect().top)
        if (at !== null && top !== at) {
          rows.push(row)
          row = ''
        }
        at = top
        row += text.data[i]
      }
      rows.push(row)
      return rows.map((line) => line.trim())
    })
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.at(-1)?.split(/\s+/).length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
