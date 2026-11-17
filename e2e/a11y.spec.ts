/*
 * W0-T21, acceptance 1: axe finds no serious or critical violation on the eight routes of the pull-request subset, at 360 and at 1280
 * px (ARCHITECTURE §10.1 and §11.2; e2e/routes.ts lists them, and verify:routes holds the list to the route table). W1-T36 adds what W1
 * built to the same audits: its sixteen pages (a module and its richest lesson for each of TR1, TR5a, TR6 and TR8, the Play index, the four
 * other games, the two labs of the forge, and Today) and the pages of the full service's levels (`W1_ROUTES`, `W1_LEVEL_PAGES`). W2-T06 adds the
 * receipts page (`W2_ROUTES`), whose states with a ledger in them e2e/receipts.spec.ts audits as well.
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
import { NIGHTLY_WIDTHS, PR_ROUTES, PR_WIDTHS, W1_LEVEL_PAGES, W1_ROUTES, W2_ROUTES } from './routes'
import { walkOf } from './support/front'
import { stuck } from './support/screens'
import { clipped, documentRoutes, expect, NIGHTLY, open, quiet, SCENE_IN_RUN, settled3d, test, withSettings } from './support/site'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
/** W0-T09: "headings form a valid outline". */
const HEADING_RULES = ['heading-order', 'page-has-heading-one', 'empty-heading']
/**
 * W1b-T09: a game's page has regions of its own (the game, its stage, its controls), and a reader that lists the landmarks cannot tell
 * two of one name apart. Axe says so as a moderate finding, which does not fail, and W1's run printed one on /play/pool (the game and
 * its cabinet were both The Reach-In) that nobody read. On a game's page it fails, whatever its impact.
 */
const LANDMARK_RULES = ['landmark-unique']

const ROUTES = [...(NIGHTLY ? documentRoutes() : [...PR_ROUTES, ...W1_ROUTES, ...W2_ROUTES]), ...W1_LEVEL_PAGES]
/** R-T48: the redesigned surfaces are held to 320, 360 and 1280 px on every pull request (WCAG 1.4.10 names 320), not at night alone. */
const WIDTHS = NIGHTLY_WIDTHS
/**
 * The routes that are audited with their 3D pass drawn as well. A software renderer draws a frame in most of a second, so a pull
 * request audits the front page, which is the one a visitor meets first, and the pages of the games that W1 built and that have a scene
 * (their text over the canvas is a different DOM from the 2D pass's), and the nightly sweep audits them all.
 */
const AUDITED_IN_3D = (route: string) => SCENE_IN_RUN(route) && (NIGHTLY || route === '/' || W1_ROUTES.includes(route))

/**
 * The step loop's time track has no 3D on a phone's width until it has a layout a phone can read (build B's finish review), on the front
 * page and on its own page: at those widths there is no 3D pass to audit, and its 2D pass is audited above. At a desk's width it is.
 */
const NO_3D_ON_A_PHONE = (route: string, width: number) => width < 768 && (route === '/' || route.startsWith('/play/loop'))

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
async function audit(page: Page, label: string, route: string): Promise<void> {
  const results = await analyze(page)
  const rules = results.passes.length + results.violations.length
  // A page that axe could not read (a blank document, a frame it never entered) passes everything: it must have been looked at.
  expect(rules, `${label}: the rules that axe ran`).toBeGreaterThan(20)
  const blocking = results.violations.filter((violation) => IMPACTS.has(violation.impact ?? ''))
  expect(blocking.map(summary), `${label}: serious or critical violations`).toEqual([])
  expect(results.violations.filter((violation) => HEADING_RULES.includes(violation.id)).map(summary), `${label}: the heading outline`).toEqual([])
  if (route.startsWith('/play/') || /^\/m\/[^/]+\/l/.test(route)) {
    expect(results.violations.filter((violation) => LANDMARK_RULES.includes(violation.id)).map(summary), `${label}: the landmarks of a game's page`).toEqual([])
  }
  const rest = results.violations.map((violation) => `${violation.id} [${violation.impact}] on ${violation.nodes.length} node${violation.nodes.length === 1 ? '' : 's'}`)
  console.log(`axe ${label}: ${rules} rules, ${rest.length === 0 ? 'no violation' : rest.join(', ')}`)
  for (const finding of rest) test.info().annotations.push({ type: 'axe (does not fail)', description: `${label}: ${finding}` })
}

/*
 * The tests are declared a route at a time, and not a width at a time. ci.yml runs the smoke project in four shards, and Playwright cuts
 * the list of its tests, file after file in the order they are declared, into four runs of equal length, so the order is the plan of the
 * shards. A page at 1280 px costs a runner several times what it does at 360 px (a mean of 41.6 s over seven audits at 1280 px, and 12.3 s
 * over ten at 360 px [measured 2026-11-04 at c80dfad, in the first e2e-smoke run of PR #1 on a GitHub-hosted runner]), so a list in
 * width order gave one shard every audit at 1280 px and another every one at 360 px. The describe blocks repeat for the same reason, and
 * their titles stay `at <width> px`.
 */
for (const route of ROUTES) {
  for (const width of WIDTHS) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height: 800 } })

      test(`${route}: axe finds no serious or critical violation, and the headings are an outline`, async ({ page, context }) => {
        await withSettings(context, { view3d: false })
        await open(page, route)
        await quiet(page)
        await audit(page, `${route} at ${width} px`, route)
      })

      // The 3D pass is audited at the pull-request pair of widths; 320 adds only the 2D pass and the reflow check.
      if (AUDITED_IN_3D(route) && !NO_3D_ON_A_PHONE(route, width) && (NIGHTLY || PR_WIDTHS.includes(width))) {
        test(`${route}, with its 3D pass drawn: axe finds no serious or critical violation`, async ({ page }) => {
          test.setTimeout(120_000)
          await open(page, route)
          // The design page's specimen is a scene that keeps moving to show its motion, so it is audited live and not at rest.
          await settled3d(page, { rested: route !== '/design' })
          await audit(page, `${route} (3D) at ${width} px`, route)
        })
      }

      // Reflow is a phone's problem: at 1280 px there is nothing to cut off.
      if (width <= 360) {
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
    })
  }
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

  test('a box wider than the phone, with text in it, is found by the reflow check, and one inside a scrolling region or a pixel is not', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 })
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>Fixture</title></head><body style="margin:0;overflow-x:hidden"><main><p style="width:500px;margin:0">Text in a box that is wider than the phone.</p>' +
        '<div style="overflow-x:auto"><p style="width:500px;margin:0">Text in a region that scrolls.</p></div>' +
        // A live region for a reader (`sr-only`): a pixel that clips a line as long as the turn's announcement.
        '<div aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;white-space:nowrap"><span>Text in a live region that no one sees, and that is far wider than the phone.</span></div></main></body></html>',
    )
    const found = await clipped(page)
    expect(found.text).toHaveLength(1)
    expect(found.text[0]).toContain('Text in a box')
  })
})

/*
 * R-T48: the sweep of the redesigned surfaces, WCAG 2.2 AA, past what axe can see. Axe runs above at 320, 360 and 1280 px on every
 * route the wave touched; the rest of the wave's own checks are where they were written (the short-viewport rule and reflow in
 * e2e/screens.spec.ts, the walk of every level of every game in e2e/walks.spec.ts, the lesson's sticky strip and foot bar in
 * e2e/lesson-games.spec.ts, Review in e2e/today.spec.ts, reduced motion at rest in e2e/reduced-motion.spec.ts). What is held here:
 *   - a full Tab walk of a lesson of each opener, at a phone's width and a desk's: a ring at every stop, and nothing, the sticky strip
 *     and the foot bar included, covers a focused control (2.4.7, 2.4.11);
 *   - a claim's mark is a link, a tagged number is not a tab stop, and no popover opens on focus alone; Escape closes one and hands focus back;
 *   - the focus ring is ink and is drawn against paper (the halo) wherever it lands: on the ground, on paper and on the amber button, never amber;
 *   - targets are at least 24 px (2.5.8) and the primary actions at least 44 px;
 *   - forced colours: every control keeps an edge or a ring, and the ring is the system's;
 *   - more contrast: axe finds no serious or critical violation under `prefers-contrast: more`.
 */
const OPENERS = [
  { opener: 'A', route: '/m/tr5a/l1-why-one-model-needs-several-kv-caches' },
  { opener: 'B', route: '/m/tr1/l1-five-mechanisms' },
  { opener: 'C', route: '/m/tr2/l7-the-same-loop-elsewhere' },
]

type Rgb = [number, number, number]
function rgbOf(css: string): Rgb {
  const match = /^rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(css) ?? /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(css)
  if (match === null) throw new Error(`a colour that the sweep cannot read: ${css}`)
  const scale = css.startsWith('color(') ? 255 : 1
  return [Number(match[1]) * scale, Number(match[2]) * scale, Number(match[3]) * scale]
}
function luminance([r, g, b]: Rgb): number {
  const lin = (value: number) => ((value /= 255) <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** The focused control's ring and what it is drawn against, as the page computes them. */
function ringOf(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement
    if (active === null || active === document.body) return null
    const style = getComputedStyle(active)
    const clear = (value: string) => value === 'rgba(0, 0, 0, 0)' || value === 'transparent'
    const ground = (element: Element | null): string => {
      for (let node = element; node !== null; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor
        if (!clear(color)) return color
      }
      return 'rgb(255, 255, 255)'
    }
    // The halo is the box-shadow's first colour when it spreads at least the ring's width and offset.
    const halo = /^(rgba?\([^)]*\)|color\([^)]*\))\s+0px 0px 0px (\d+)px/.exec(style.boxShadow)
    const lamp = getComputedStyle(document.documentElement).getPropertyValue('--es-lamp').trim()
    const probe = document.createElement('span')
    probe.style.color = lamp
    document.body.append(probe)
    const amber = getComputedStyle(probe).color
    probe.remove()
    // The control's own fill: itself, or a child that paints it (the primary button's pull).
    const fills = [active, ...active.querySelectorAll('*')].map((node) => getComputedStyle(node).backgroundColor)
    return {
      name: (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50),
      outline: style.outlineColor,
      width: Number.parseFloat(style.outlineWidth),
      styled: style.outlineStyle,
      offset: Number.parseFloat(style.outlineOffset),
      halo: halo === null ? null : { color: halo[1] as string, spread: Number(halo[2]) },
      ground: ground(active.parentElement),
      amber,
      onAmber: fills.includes(amber),
      field: active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement,
    }
  })
}

test.describe('R-T48: a lesson of each opener, Tab from the top to the end', () => {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    for (const { opener, route } of OPENERS) {
      test(`opener ${opener} (${route}) at ${width} x ${height}: a ring at every stop, and none is covered or off screen`, async ({ page, context }) => {
        test.setTimeout(240_000)
        await withSettings(context, { view3d: false })
        await page.setViewportSize({ width, height })
        await open(page, route)
        await quiet(page)
        // The bars are there to be walked under: below 64rem a lesson has its strip and its foot bar, and at a desk its rail and its dock.
        const bars = await stuck(page)
        expect(bars.length, 'something is sticky on this screen, so that "never covered" is a claim that can fail').toBeGreaterThan(0)
        const walk = walkOf(page)
        let stops = 0
        for (; stops < 600; stops++) {
          const stop = await walk.press('Tab')
          if (stop.tag === 'body') break
        }
        expect(stops, 'Tab reached the end of the document, and did not loop in a trap').toBeLessThan(600)
        expect(walk.trail.length, 'the stops of the lesson').toBeGreaterThan(8)
        expect(walk.problems(), 'a focus stop that a keyboard user cannot see').toEqual([])
      })
    }
  }
})

test.describe('R-T48: claim marks, tagged numbers and popovers', () => {
  const route = '/m/tr1/l2-nano-vllm-in-one-sitting'
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ context, page }) => {
    await withSettings(context, { view3d: false })
    await open(page, route)
    await quiet(page)
  })

  test('every claim mark is a link to its entry in Sources, and a tagged number is not a tab stop', async ({ page }) => {
    const marks = page.locator('.es-lesson .es-claimmark > a.es-pop__trigger')
    expect(await marks.count(), 'the lesson has claim marks').toBeGreaterThan(5)
    const hrefs = await marks.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    expect(hrefs.filter((href) => !/^#.+/.test(href)), 'a mark that is not a link to an entry').toEqual([])
    const stops = await page.evaluate(
      () =>
        [...document.querySelectorAll('.es-readout__tag, .es-tag')].filter(
          (tag) => tag.matches('a, button, [tabindex]:not([tabindex="-1"])') || tag.querySelector('a, button, [tabindex]:not([tabindex="-1"])') !== null,
        ).length,
    )
    expect(stops, 'a tag that Tab stops on').toBe(0)
  })

  test('no popover opens on focus alone; Enter opens one and Escape closes it and hands focus back to the mark', async ({ page }) => {
    const mark = page.locator('.es-lesson .es-claimmark > a.es-pop__trigger').first()
    await mark.focus()
    await expect(mark).toBeFocused()
    await expect(mark).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.es-lesson [role="dialog"]')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(mark).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.es-lesson [role="dialog"]')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(page.locator('.es-lesson [role="dialog"]')).toHaveCount(0)
    await expect(mark).toBeFocused()
  })

  test("a game's Parts popover opens on Enter and not on focus, and Escape hands focus back", async ({ page }) => {
    await open(page, '/play/pool')
    await quiet(page)
    const parts = page.getByRole('button', { name: /^Parts\b/ }).first()
    await parts.focus()
    await expect(parts).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Enter')
    await expect(parts).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(parts).toHaveAttribute('aria-expanded', 'false')
    await expect(parts).toBeFocused()
  })
})

const SURFACES = ['/', '/map', '/m/tr2', ...OPENERS.map((entry) => entry.route), '/play', '/play/pool', '/play/loop', '/play/engine-floor', '/today', '/settings', '/receipts']

test.describe('R-T48: the focus ring', () => {
  for (const route of SURFACES) {
    test(`${route}: ink against paper at each of the first thirty stops, never amber`, async ({ page, context }) => {
      test.setTimeout(120_000)
      await withSettings(context, { view3d: false })
      await page.setViewportSize({ width: 1280, height: 800 })
      await open(page, route)
      await quiet(page)
      const found: string[] = []
      let judged = 0
      for (let stop = 0; stop < 30; stop++) {
        await page.keyboard.press('Tab')
        const ring = await ringOf(page)
        if (ring === null) break
        // A field draws its ring on its slip, and a control may draw it on a child: the walks read those; here the control's own is judged.
        if (ring.field || ring.styled === 'none' || ring.width < 2) continue
        judged++
        const outline = rgbOf(ring.outline)
        const amber = rgbOf(ring.amber)
        if (Math.max(...outline) - Math.min(...outline) > 60 && outline[0] > outline[2]) found.push(`${ring.name}: the ring ${ring.outline} is a warm colour`)
        if (ratio(outline, amber) < 3 && ring.onAmber) found.push(`${ring.name}: the ring meets the amber fill at ${ratio(outline, amber).toFixed(2)}:1`)
        const against = ring.halo !== null && ring.halo.spread >= ring.width + ring.offset ? rgbOf(ring.halo.color) : rgbOf(ring.ground)
        const vs = ratio(outline, against)
        if (vs < 3) found.push(`${ring.name}: ring ${ring.outline} on ${ring.halo === null ? ring.ground : ring.halo.color} is ${vs.toFixed(2)}:1`)
      }
      expect(judged, 'stops whose ring was judged').toBeGreaterThan(0)
      expect(found, 'rings that do not read').toEqual([])
    })
  }
})

/** Interactive elements that are drawn, with the box that a pointer can hit. */
function targets(page: Page) {
  return page.evaluate(() => {
    const picks = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"]'
    const found: { name: string; width: number; height: number; left: number; top: number; primary: boolean; inline: boolean }[] = []
    for (const element of document.querySelectorAll(picks)) {
      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (element.closest('[hidden], [inert], [aria-hidden="true"], details:not([open]) > :not(summary)') !== null) continue
      if ((element as HTMLButtonElement).disabled === true) continue
      let box = element.getBoundingClientRect()
      // A box clipped to a pixel is a control for a reader (a visually hidden input under its label): its label is the target.
      const label = (element as HTMLInputElement).labels?.[0] ?? element.closest('label')
      if (box.width <= 1 || box.height <= 1) {
        if (label === null || label === undefined) continue
        box = label.getBoundingClientRect()
      }
      if (box.width === 0 || box.height === 0) continue
      if (box.right < 0 || box.left > window.innerWidth) continue
      const parent = element.parentElement
      const inline =
        element.tagName === 'A' &&
        style.display === 'inline' &&
        parent !== null &&
        [...parent.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0)
      const primary = element.matches('.es-primary-button__pull, [data-emphasis="primary"], .es-primary-button') || element.querySelector('.es-primary-button__pull') !== null
      found.push({
        name: `${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className !== '' ? `.${element.className.split(' ')[0]}` : ''} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`,
        width: Math.round(box.width),
        height: Math.round(box.height),
        left: box.left,
        top: box.top + window.scrollY,
        primary,
        inline,
      })
    }
    return found
  })
}

test.describe('R-T48: target sizes', () => {
  for (const [width, height] of [
    [1280, 800],
    [360, 800],
  ] as const) {
    for (const route of SURFACES) {
      test(`${route} at ${width} px: targets are 24 px or more, and a primary action is 44 px or more`, async ({ page, context }) => {
        await withSettings(context, { view3d: false })
        await page.setViewportSize({ width, height })
        await open(page, route)
        await quiet(page)
        const all = await targets(page)
        expect(all.length, 'controls found').toBeGreaterThan(0)
        // WCAG 2.5.8: a target under 24 px passes when a 24 px square centred on it meets no other target, and no other small target's square.
        const small = all.filter((target) => !target.inline && (target.width < 24 || target.height < 24))
        const square = (target: (typeof all)[number]) => ({ x: target.left + target.width / 2 - 12, y: target.top + target.height / 2 - 12 })
        const meets = (a: { x: number; y: number }, w: number, h: number, x: number, y: number) => a.x < x + w && a.x + 24 > x && a.y < y + h && a.y + 24 > y
        const crowded = small.filter((target) => {
          const box = square(target)
          return all.some((other) => other !== target && !other.inline && (meets(box, other.width, other.height, other.left, other.top) || (small.includes(other) && meets(box, 24, 24, square(other).x, square(other).y))))
        })
        expect(crowded.map((target) => `${target.name} ${target.width} x ${target.height}`), 'targets under 24 px with another target within 24 px').toEqual([])
        expect(all.filter((target) => target.primary && target.height < 44).map((target) => `${target.name} ${target.width} x ${target.height}`), 'primary actions under 44 px').toEqual([])
      })
    }
  }
})

test.describe('R-T48: forced colours', () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  for (const route of ['/', '/map', '/m/tr2', OPENERS[1]!.route, '/play/pool', '/play/loop', '/today', '/settings']) {
    test(`${route}: every control keeps an edge or a ring of the system's colours, and the focus ring is the system's`, async ({ page, context }) => {
      await withSettings(context, { view3d: false })
      await page.emulateMedia({ forcedColors: 'active' })
      await open(page, route)
      await quiet(page)
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)
      const bare = await page.evaluate(() => {
        const picks = 'button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"]'
        const edged = (node: Element | null) => {
          if (!node) return false
          const style = getComputedStyle(node)
          return ['Top', 'Right', 'Bottom', 'Left'].some((side) => {
            const s = style as unknown as Record<string, string>
            return Number.parseFloat(s[`border${side}Width`] ?? '0') > 0 && s[`border${side}Style`] !== 'none'
          })
        }
        const out: string[] = []
        for (const element of document.querySelectorAll(picks)) {
          const style = getComputedStyle(element)
          const box = element.getBoundingClientRect()
          if (style.visibility === 'hidden' || style.display === 'none' || box.width <= 1 || box.height <= 1) continue
          if (element.closest('[hidden], [inert], [aria-hidden="true"], details:not([open]) > :not(summary)') !== null) continue
          // A control may be edged by itself, a child, or the slip or label round it (a field's slip, a switch's track).
          if (style.textDecorationLine.includes('underline') || edged(element) || edged(element.parentElement) || edged(element.parentElement?.parentElement ?? null) || edged(element.closest('label')) || [...element.querySelectorAll('*')].some(edged)) continue
          out.push(`${element.tagName.toLowerCase()}${typeof element.className === 'string' && element.className !== '' ? `.${element.className.split(' ')[0]}` : ''} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`)
        }
        return [...new Set(out)].slice(0, 12)
      })
      expect(bare, 'controls with no edge and no underline in forced colours').toEqual([])
      const first = page.locator('main a[href], main button:not([disabled])').first()
      await first.focus()
      const ring = await first.evaluate((element) => {
        const style = getComputedStyle(element)
        return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth), shadow: style.boxShadow }
      })
      expect(ring.style).toBe('solid')
      expect(ring.width).toBeGreaterThanOrEqual(2)
      expect(ring.shadow, 'no halo of a colour the system did not choose').toBe('none')
    })
  }
})

test.describe('R-T48: more contrast', () => {
  for (const route of ['/', '/map', '/m/tr2', OPENERS[0]!.route, '/play/pool', '/today']) {
    for (const width of [360, 1280]) {
      test(`${route} at ${width} px: no serious or critical violation under prefers-contrast: more`, async ({ page, context }) => {
        await withSettings(context, { view3d: false })
        await page.setViewportSize({ width, height: 800 })
        await page.emulateMedia({ contrast: 'more' })
        await open(page, route)
        await quiet(page)
        expect(await page.evaluate(() => matchMedia('(prefers-contrast: more)').matches)).toBe(true)
        const results = await analyze(page)
        expect(results.violations.filter((violation) => IMPACTS.has(violation.impact ?? '')).map(summary), 'serious or critical violations').toEqual([])
      })
    }
  }
})

/*
 * WCAG 1.4.10 and the short-viewport rule (REDESIGN 2.8): at 844 x 390 (a phone on its side) and at 320 x 256 (a desk at 400% zoom) nothing is
 * sticky or fixed, the page needs no sideways scroll, and no content is lost: every heading that the page has at a desk is on it still.
 */
test.describe('R-T48: the short viewport', () => {
  for (const route of SURFACES) {
    test(`${route}: nothing is sticky, one column with no sideways scroll, and every heading is still there (the desk's dock is a second view of the run, and left out)`, async ({ page, context }) => {
      test.setTimeout(120_000)
      await withSettings(context, { view3d: false })
      const headings = () => page.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3')].filter((h) => getComputedStyle(h).display !== 'none' && getComputedStyle(h).visibility !== 'hidden' && !h.closest('[hidden], [inert], .es-ldock')).map((h) => (h.textContent ?? '').trim().replace(/\s+/g, ' ')))
      await page.setViewportSize({ width: 1280, height: 800 })
      await open(page, route)
      await quiet(page)
      const desk = await headings()
      for (const [width, height] of [
        [844, 390],
        [320, 256],
      ] as const) {
        await page.setViewportSize({ width, height })
        await quiet(page, 300)
        expect(await stuck(page), `sticky or fixed at ${width} x ${height}`).toEqual([])
        const found = await clipped(page)
        expect(found.scrolls, `pixels of sideways scroll at ${width} x ${height}`).toBeLessThanOrEqual(0)
        expect(found.text, `text past the edge at ${width} x ${height}`).toEqual([])
        const here = await headings()
        expect(desk.filter((heading) => !here.includes(heading)), `headings lost at ${width} x ${height}`).toEqual([])
      }
    })
  }
})

/*
 * A popover's sheet is part of the page while it is open, and covers what is under it: axe is run with the Parts popover of each game open,
 * at a phone's width (stage 4's checks left that state unaudited: the sheet over the frame's "goal more" control).
 */
test.describe('R-T48: a game with its Parts popover open', () => {
  for (const route of ['/play/pool', '/play/loop', '/play/engine-floor', '/play/verifier', '/play/broken-bench']) {
    for (const width of [320, 360, 1280]) {
      test(`${route} at ${width} px: axe finds no serious or critical violation, and Escape closes the sheet`, async ({ page, context }) => {
        await withSettings(context, { view3d: false })
        await page.setViewportSize({ width, height: 800 })
        await open(page, route)
        await quiet(page)
        const parts = page.getByRole('button', { name: /^Parts\b/ }).first()
        await parts.scrollIntoViewIfNeeded()
        await parts.focus()
        await page.keyboard.press('Enter')
        await expect(parts).toHaveAttribute('aria-expanded', 'true')
        const results = await analyze(page)
        expect(results.violations.filter((violation) => IMPACTS.has(violation.impact ?? '')).map(summary), 'serious or critical violations').toEqual([])
        await page.keyboard.press('Escape')
        await expect(parts).toHaveAttribute('aria-expanded', 'false')
        await expect(parts).toBeFocused()
      })
    }
  }
})
