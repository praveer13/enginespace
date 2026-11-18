/*
 * The front page's static shell (ARCHITECTURE §6.11; REDESIGN §3.1): the app rendered once at `/` and written into index.html's root by the
 * build (scripts/pages/front-shell.ts, src/front/shell.ts).
 *
 *   - Rendered here on the server renderer, it holds the heading and the left column with no procedure in it, and the instrument live
 *     from the first paint: the step loop's first demo level, its timing diagram at both geometries (a desk's and a phone's, the stylesheet
 *     shows one), the five ink callouts, one amber ring on R1 and the now line and no amber fill, the goal line, the readout and the dock;
 *     and below the fold the four outcomes, how credit works, the path and the way in.
 *   - A real build writes it into dist/index.html, inside the root and nowhere else, with the path printed from the compiled index,
 *     preloads for the page's chunks, the policy still first, and no inline script.
 * e2e/front.spec.ts opens the built page with scripts off.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CSP_META } from '../../scripts/pages/csp'
import { inspect, policyProblems } from '../../scripts/pages/document'
import { isFrontPage, preloadsFor, SHELL_MARK } from '../../scripts/pages/front-shell'
import { findBanned } from '../../src/copy/banned'
import { COACH_PARTS, CREDIT, FRAME, HERO, OUTCOMES } from '../../src/front/copy'
import { POSTER_LEVEL, POSTER_SEED } from '../../src/front/poster'
import { renderFrontShell } from '../../src/front/shell'
import { LOOP } from '../../packages/play/loop/entry'
import { LOOP_COPY } from '../../packages/play/loop/copy'
import { root, viteBuild } from '../pages/support'

const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')

/** The markup of one element of a class, from its opening tag to the end of the shell's next sibling of `until`. */
const between = (markup: string, from: string, until: string): string => markup.slice(markup.indexOf(from), markup.indexOf(until, markup.indexOf(from)))

describe('the shell, rendered', () => {
  let shell = ''
  beforeAll(async () => {
    shell = await renderFrontShell('/')
  })

  test("opens on the first demo level, on its practice seed: the posters' level and seed", () => {
    expect([LOOP.levels[0].id, LOOP.levels[0].practiceSeed]).toEqual([POSTER_LEVEL, POSTER_SEED])
    expect(shell).toContain(`data-level="${POSTER_LEVEL}"`)
  })

  test('holds the heading, the paragraph, the live line and the link past the demo, and no procedure', () => {
    const h1s = [...shell.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((match) => textOf(match[1]).trim())
    expect(h1s).toEqual([HERO.headline])
    const left = between(shell, 'class="es-front-intro"', 'class="es-front-service"')
    for (const line of [HERO.lede, HERO.live, HERO.short]) expect(textOf(left)).toContain(line.replaceAll('’', '’'))
    expect(left).not.toMatch(/<ol\b/)
    expect(left).toMatch(/<a [^>]*href="\/map"[^>]*>Skip the demo and see the course<\/a>/)
  })

  test('draws the instrument live from the first paint: the title strip, the goal line, the diagram at both geometries, the readout and the dock', () => {
    const inst = between(shell, 'class="es-front-service"', 'class="es-front-below"')
    expect(inst).toMatch(/<h2[^>]*>Step loop<\/h2>/)
    expect(textOf(inst)).toContain('You are the scheduler.')
    expect(textOf(inst)).toContain(`${FRAME.demo} 1 ${FRAME.of} 4 · : ${LOOP_COPY['first-1-fill'].title}`)
    expect(inst).toContain('data-fit="wide"')
    expect(inst).toContain('data-fit="narrow"')
    expect(inst).toContain('data-size="desk"')
    expect(inst).toContain('data-size="phone"')
    // The queue's chips are buttons from the first paint: six at a desk, four and a count on a phone.
    expect([...between(inst, 'data-fit="wide"', 'data-fit="narrow"').matchAll(/aria-label="Admit request (R\d) into a batch slot"/g)].map((match) => match[1])).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6'])
    expect(inst).toContain('data-loop-readout=""')
    expect(inst).toContain('Step: fill a slot first')
    expect(inst).toContain('aria-keyshortcuts="Space"')
    expect(inst).toContain(`<noscript><p class="es-front-noscript">${FRAME.noScript}</p></noscript>`)
    expect(inst).toContain('<table')
  })

  test('at first paint: one amber ring, on R1, and the now line; no amber fill; and five ink callouts, numbered as the coach strip lists them', () => {
    const inst = between(shell, 'class="es-front-service"', 'class="es-front-below"')
    for (const fit of ['wide', 'narrow']) {
      const drawing = fit === 'wide' ? between(inst, 'data-fit="wide"', 'data-fit="narrow"') : between(inst, 'data-fit="narrow"', 'data-loop-readout')
      const rings = [...drawing.matchAll(/data-kind="ring"/g)]
      expect(rings, fit).toHaveLength(1)
      expect(drawing).toMatch(/data-kind="ring"><span class="es-marker__ring"><button[^>]*data-req="0"/)
      expect([...drawing.matchAll(/data-kind="cursor"/g)], fit).toHaveLength(1)
      expect([...drawing.matchAll(/data-callout="(\d)"/g)].map((match) => match[1]).sort(), fit).toEqual(['1', '2', '3', '4'])
    }
    expect(inst).toContain('data-callout="5"')
    // No amber fill: Step waits as an outline until a slot holds a request, and no other primary control is in the instrument.
    expect(inst).not.toContain('es-primary-button')
    const coach = between(inst, 'data-coach-list=""', '</ol>')
    expect([...coach.matchAll(/<li data-part="([a-z]+)">/g)].map((match) => match[1])).toEqual(COACH_PARTS.map((part) => part.id))
    expect(textOf(inst)).toContain('Put R1 in a slot.')
  })

  test('the plot is not empty at first paint: the reference run, the number to beat, is drawn as outlines at both geometries', () => {
    const inst = between(shell, 'class="es-front-service"', 'class="es-front-below"')
    for (const fit of ['wide', 'narrow']) {
      const drawing = fit === 'wide' ? between(inst, 'data-fit="wide"', 'data-fit="narrow"') : between(inst, 'data-fit="narrow"', 'data-loop-readout')
      expect([...drawing.matchAll(/data-ref-slab="slot-\d\/0"/g)], fit).toHaveLength(4)
      expect(drawing, fit).toContain('class="es-lanes__ref-text"')
    }
  })

  test('a desk reads what the course takes as read from kernelspace, after the lede', () => {
    const left = between(shell, 'class="es-front-intro"', 'class="es-front-service"')
    expect(textOf(left)).toContain(HERO.assumes)
  })

  test("the goal line of demo level 1 does not say how many tokens a step produces", () => {
    const goal = between(shell, 'class="es-front-goal"', 'class="es-front-diagram"')
    expect(textOf(goal)).toContain('Goal:')
    expect(textOf(goal)).not.toMatch(/\b\d+\s+tokens?\b|\bfour tokens?\b|\bone token\b/i)
  })

  test('says nothing in the kitchen\'s words and no build-log id: no banned word or phrase in its text or its labels (R-T14)', () => {
    const readable = [
      ...shell
        .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
        .replace(/<[^>]+>/g, '\n')
        .split('\n')
        .map((line) => line.replaceAll('&#x27;', "'").replaceAll('&amp;', '&').trim())
        .filter((line) => line !== ''),
      ...[...shell.matchAll(/ (?:aria-label|alt|title)="([^"]*)"/g)].map((match) => match[1].replaceAll('&#x27;', "'").replaceAll('&amp;', '&')),
    ]
    expect(readable.length).toBeGreaterThan(30)
    expect(readable.flatMap((text) => findBanned(text).map((found) => `${found.match} in "${text.slice(0, 80)}"`))).toEqual([])
    expect(readable.filter((text) => /\b(?:W\d+b?-T\d+|R-T\d+|D-\d{3}|Q-\d+|O-\d+)\b/.test(text))).toEqual([])
  })

  test('holds, below the fold, the four outcomes, how credit works, the path with the first module marked, and the way in', () => {
    const below = shell.slice(shell.indexOf('class="es-front-below"'))
    for (const row of OUTCOMES.list) expect(textOf(below)).toContain(row.outcome)
    for (const line of CREDIT.lines) expect(textOf(below)).toContain(line)
    // The test renderer has no compiled index (menu.ts): the path says so and points at Course. A real build prints it (below).
    expect(textOf(below)).toContain('The path did not load.')
  })

  test('the banner leads the page, and the heading comes before the instrument in the main landmark', () => {
    expect(shell.indexOf('<nav aria-label="Primary"')).toBeLessThan(shell.indexOf('<main'))
    const main = shell.slice(shell.indexOf('<main'))
    expect(main.indexOf('<h1')).toBeLessThan(main.indexOf('es-front-service'))
  })

  test('under the Pages base, every link carries the base', async () => {
    const based = await renderFrontShell('/enginespace/')
    const hrefs = [...based.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs.length).toBeGreaterThan(10)
    expect(hrefs.filter((href) => !href.startsWith('/enginespace/') && !href.startsWith('#'))).toEqual([])
  })
})

describe('the build step', () => {
  test('knows the front page\'s address under each base, and nothing else', () => {
    expect(isFrontPage('/', '/')).toBe(true)
    expect(isFrontPage('/index.html', '/')).toBe(true)
    expect(isFrontPage('/?es-tier=2', '/')).toBe(true)
    expect(isFrontPage('/enginespace/', '/enginespace/')).toBe(true)
    expect(isFrontPage('/enginespace', '/enginespace/')).toBe(true)
    expect(isFrontPage('/map', '/')).toBe(false)
    expect(isFrontPage('/enginespace/play/loop', '/enginespace/')).toBe(false)
  })

  test('preloads the chunk that holds the page, what it imports and the course index, and links their stylesheets, and not what the entry loads', () => {
    const chunk = (fileName: string, moduleIds: string[], imports: string[], isEntry = false, css: string[] = []) => ({ type: 'chunk' as const, fileName, moduleIds, imports, isEntry, viteMetadata: { importedCss: new Set(css) } })
    const bundle = {
      a: chunk('assets/index-1.js', ['/repo/src/main.tsx'], ['assets/react-vendor-1.js'], true, ['assets/index-1.css']),
      b: chunk('assets/react-vendor-1.js', ['/repo/node_modules/react/index.js'], []),
      c: chunk('assets/Front-1.js', ['/repo/src/pages/Front.tsx', '/repo/src/front/FrontPage.tsx'], ['assets/react-vendor-1.js', 'assets/session-1.js', 'assets/View2D-1.js']),
      d: chunk('assets/session-1.js', ['/repo/packages/play/loop/session.ts'], []),
      e: chunk('assets/index-2.js', ['/repo/src/content/generated/index.json'], []),
      f: chunk('assets/Map-1.js', ['/repo/src/pages/Map.tsx'], [], false, ['assets/Map-1.css']),
      g: chunk('assets/View2D-1.js', ['/repo/src/games/loop/View2D.tsx'], [], false, ['assets/View2D-1.css', 'assets/index-1.css']),
    }
    const links = preloadsFor({ bundle: bundle as never }, '/repo', '/enginespace/')
    expect(links).toBe(
      [
        ...['assets/Front-1.js', 'assets/View2D-1.js', 'assets/index-2.js', 'assets/session-1.js'].map((file) => `<link rel="modulepreload" crossorigin href="/enginespace/${file}">`),
        '<link rel="stylesheet" crossorigin href="/enginespace/assets/View2D-1.css">',
      ].join(''),
    )
    expect(preloadsFor({ bundle: undefined }, '/repo', '/')).toBe('')
  })
})

describe('a real build', () => {
  const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-front-'))
  const dist = path.join(scratch, 'dist')
  let html = ''
  beforeAll(() => {
    viteBuild(dist, '/')
    html = readFileSync(path.join(dist, 'index.html'), 'utf8')
  }, 180_000)
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  test('writes the shell into the root of index.html, and leaves no marker and no text outside the root', async () => {
    expect(html).not.toContain(SHELL_MARK)
    const info = await inspect(html)
    expect(info.roots).toBe(1)
    expect(info.outside).toBe('')
    const inside = html.slice(html.indexOf('<div id="root">'), html.indexOf('<script type="module"', html.indexOf('<div id="root">')))
    expect(inside).toContain(HERO.headline)
    expect(inside).toContain('class="es-front-service"')
  })

  test('names the first lesson, its minutes and what it needs in the way into the course, from the compiled index', () => {
    const index = JSON.parse(readFileSync(path.join(root, 'src/content/generated/index.json'), 'utf8')) as {
      modules: { id: string; lessons: { route: string; title: string; minutes: number; needs?: string[] }[] }[]
    }
    const module = index.modules.find((candidate) => candidate.lessons.length > 0)
    const lesson = module?.lessons[0]
    if (module === undefined || lesson === undefined) throw new Error('the index has no lesson')
    const name = `TR${module.id.slice(2)} lesson 1`
    const below = html.slice(html.indexOf('class="es-front-below__start"'))
    const start = new RegExp(`<a [^>]*href="${lesson.route}"[^>]*>([\\s\\S]*?)</a>`).exec(below)
    expect(textOf(start?.[1] ?? '').trim()).toBe(`Start the course: ${name}, ${lesson.title.split(':')[0]} (${lesson.minutes} min, browser only)`)
    const phone = html.slice(html.indexOf('class="es-front-phone-start"'))
    expect(phone).toMatch(new RegExp(`<a [^>]*href="${lesson.route}"[^>]*>Start the course: ${name} \\(${lesson.minutes} min, browser only\\)</a>`))
  })

  test('keeps the policy first and runs no inline script', async () => {
    const info = await inspect(html)
    expect(policyProblems(info)).toEqual([])
    expect(html.indexOf(CSP_META)).toBeGreaterThan(-1)
  })

  test('prints the course\'s hours by lane under the paragraph, from the compiled index', () => {
    const left = html.slice(html.indexOf('class="es-front-intro"'), html.indexOf('class="es-front-service"'))
    expect(left).toContain('data-course-hours=""')
    expect(textOf(left)).toMatch(/TR0 to the capstone · \d+ hours, estimated: [\d.]+ browser, [\d.]+ laptop, [\d.]+ GPU/)
  })

  test('prints the path from the compiled course index: every module, the published ones as links, the first marked, with the total', () => {
    const index = JSON.parse(readFileSync(path.join(root, 'src/content/generated/index.json'), 'utf8')) as { modules: { id: string; route: string; lessons: unknown[] }[] }
    const path_ = html.slice(html.indexOf('class="es-front-path"'), html.indexOf('class="es-front-below__start"'))
    expect(index.modules.length).toBeGreaterThan(5)
    for (const module of index.modules) {
      expect(path_).toContain(`data-module="${module.id}"`)
      if (module.lessons.length > 0) expect(path_).toContain(`href="${module.route}"`)
      else expect(path_).not.toContain(`href="${module.route}"`)
    }
    expect(path_).toMatch(/data-module="tr1" data-start="true"[\s\S]*?Start here/)
    expect(textOf(path_)).toContain('Not published yet')
    expect(path_).toContain('data-tag="derived"')
  })

  test('preloads the page\'s own chunk and the course index from inside the root', () => {
    const inside = html.slice(html.indexOf('<div id="root">'))
    const preloads = [...inside.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g)].map((match) => match[1])
    expect(preloads.some((href) => /\/assets\/Front-[\w-]+\.js$/.test(href))).toBe(true)
    const manifest = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8')) as Record<string, { file: string }>
    expect(preloads).toContain(`/${manifest['src/content/generated/index.json'].file}`)
  })
})
