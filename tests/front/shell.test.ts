/*
 * The front page's static shell (ARCHITECTURE §6.11; TRACKER W0-T18): the app rendered once at `/` and written into index.html's root
 * by the build (scripts/pages/front-shell.ts, src/front/shell.ts).
 *
 *   - Rendered here on the server renderer, it holds the heading, the promise and the poster, the poster in both orientations and
 *     byte for byte the posters that scripts/posters.ts writes (the 2D view's first frame), the printer with the menu link, the order
 *     ticket's stub, the deck's waiting tickets, the mirror, the four outcomes and the next ticket.
 *   - A real build writes it into dist/index.html, inside the root and nowhere else, with the course's menu printed from the compiled
 *     index, preloads for the page's chunks, the policy still first, and no inline script.
 * e2e/front.spec.ts opens the built page with scripts off (accept 1).
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CSP_META } from '../../scripts/pages/csp'
import { inspect, policyProblems } from '../../scripts/pages/document'
import { isFrontPage, preloadsFor, SHELL_MARK } from '../../scripts/pages/front-shell'
import { renderPosters } from '../../scripts/posters'
import { DECK, HERO, NEXT, ORDER, TAPE } from '../../src/front/copy'
import { POSTER_LEVEL, POSTER_SEED } from '../../src/front/poster'
import { renderFrontShell } from '../../src/front/shell'
import { LOOP } from '../../packages/play/loop/entry'
import { root, viteBuild } from '../pages/support'

/** Every <svg> of a piece of markup, whole. */
const svgsIn = (markup: string): string[] => [...markup.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((match) => match[0])
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')

describe('the shell, rendered', () => {
  let shell = ''
  beforeAll(async () => {
    shell = await renderFrontShell('/')
  })

  test('opens on the run\'s first level, on its practice seed: the poster\'s level and seed', () => {
    expect([LOOP.levels[0].id, LOOP.levels[0].practiceSeed]).toEqual([POSTER_LEVEL, POSTER_SEED])
  })

  test('holds the heading, the promise and the order ticket\'s stub, with the menu link on the printer', () => {
    const h1s = [...shell.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((match) => textOf(match[1]).trim())
    expect(h1s).toEqual([HERO.headline])
    for (const line of HERO.promise) expect(textOf(shell)).toContain(line)
    expect(shell).toMatch(/<button[^>]*class="es-stub__pull"[^>]*>[\s\S]*?Start service/)
    const printer = /<div class="es-front-printer">([\s\S]*?)<\/div>/.exec(shell)?.[1] ?? ''
    expect(printer).toContain('href="/map"')
    expect(textOf(printer)).toContain('Open the menu')
  })

  test("draws the printer as a housing with volume, from the first paint: its cover, its top receding and its side in shade (the finish review, round 2)", () => {
    const printer = /<div class="es-front-printer">([\s\S]*?)<\/div>/.exec(shell)?.[1] ?? ''
    const parts = [...printer.matchAll(/class="es-front-printer__([a-z]+)"/g)].map((match) => match[1])
    expect(parts).toEqual(expect.arrayContaining(['body', 'lid', 'side', 'face', 'window', 'button', 'mouth']))
    expect(printer).toMatch(/class="es-menu-link es-front-printer__menu"/)
    expect(printer).toMatch(/<span class="es-front-printer__body" aria-hidden="true">/)
    // front.css cuts the top and the side from the printer's own box by its depth, and lights each face apart: a box, not a panel.
    const css = readFileSync(path.join(root, 'src/front/front.css'), 'utf8')
    const rule = (name: string) => new RegExp(`\\.es-front-printer__${name} \\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    expect(rule('lid')).toMatch(/clip-path: polygon\(0 100%, calc\(100% - var\(--printer-dx\)\) 100%, 100% 0, var\(--printer-dx\) 0\)/)
    expect(rule('side')).toMatch(/clip-path: polygon\(0 var\(--printer-dy\), 100% 0, 100% calc\(100% - var\(--printer-dy\)\), 0 100%\)/)
    for (const face of ['lid', 'side', 'face']) expect(rule(face)).toMatch(/background:\s+linear-gradient/)
    expect(rule('face')).toMatch(/inset: var\(--printer-dy\) var\(--printer-dx\) 0 0/)
  })

  test('prints no row above the heading: the order ticket opens on its headline', () => {
    const ticket = shell.slice(shell.indexOf('class="es-ticket es-front-ticket"'), shell.indexOf('</h1>'))
    expect(ticket).not.toContain('es-ticket__head')
  })

  test('prints the printer\'s tape from the first paint: the fire\'s number, the ticks per step, the stations and the next fire, stamped synthetic', () => {
    const tape = shell.slice(shell.indexOf('class="es-front-tape"'), shell.indexOf('data-loop-controls'))
    expect(tape).toContain(`aria-label="${TAPE.name.replaceAll("'", '&#x27;')}"`)
    expect(textOf(tape)).toContain(TAPE.stamp)
    for (const line of ['fire', 'ticks', 'busy', 'dark']) expect(tape).toContain(`data-line="${line}"`)
    expect(textOf(tape)).toContain(TAPE.next)
    expect(tape).toContain('data-tag="synthetic"')
  })

  test('inlines the poster in both orientations, byte for byte the posters of scripts/posters.ts, in the pass\'s box', () => {
    const box = shell.slice(shell.indexOf('class="es-front-pass__stage"'), shell.indexOf('class="es-front-deck"'))
    const posters = renderPosters()
    expect(svgsIn(box)).toEqual(posters.map((poster) => poster.svg.trimEnd()))
    expect(box).toContain('data-front-poster=""')
    expect(box).toContain('data-orientation="landscape"')
    expect(box).toContain('data-orientation="portrait"')
  })

  test('holds the printer\'s strip with the first three of the six waiting tickets, says the rest are inside, and has the bell beside it', () => {
    const expo = shell.slice(shell.indexOf('class="es-front-expo"'), shell.indexOf('class="es-front-pass__stage"'))
    expect([...expo.matchAll(/aria-label="Hang ticket No\. \d+ on the rail"/g)].map((match) => match[0])).toEqual(
      ['01', '02', '03'].map((no) => `aria-label="Hang ticket No. ${no} on the rail"`),
    )
    expect(expo).toContain('data-waiting="6"')
    expect(textOf(expo)).toContain(DECK.more)
    expect(expo).toContain('Ring the bell')
  })

  test('holds the deck with the level\'s prompt and its switches, and says why the game needs scripts', () => {
    const deck = shell.slice(shell.indexOf('class="es-front-deck"'))
    expect(deck).toContain('data-loop-prompt')
    expect(deck).toContain('aria-keyshortcuts="Space"')
    expect(deck).toContain(`<noscript><p class="es-front-deck__noscript">${DECK.noScript}</p></noscript>`)
  })

  test('holds the night\'s mirror, the four outcomes and the next ticket, which starts TR1', () => {
    expect(shell).toContain('class="es-front-night"')
    expect(shell).toContain('<table')
    for (const dish of ORDER.dishes) expect(textOf(shell)).toContain(dish.outcome.replaceAll('’', '’'))
    expect(shell).toMatch(new RegExp(`<a[^>]*href="/m/tr1"[^>]*>[\\s\\S]*?${NEXT.start}`))
  })

  test('the board leads the page, and the order ticket is the first thing in the main landmark', () => {
    expect(shell.indexOf('<nav aria-label="Primary"')).toBeLessThan(shell.indexOf('<main'))
    const main = shell.slice(shell.indexOf('<main'))
    expect(main.indexOf('es-front-printer')).toBeLessThan(main.indexOf('es-front-pass__stage'))
    expect(main.indexOf('<h1')).toBeLessThan(main.indexOf('es-front-deck'))
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

  test('preloads the chunk that holds the page, what it imports and the course index, and not what the entry loads', () => {
    const chunk = (fileName: string, moduleIds: string[], imports: string[], isEntry = false) => ({ type: 'chunk' as const, fileName, moduleIds, imports, isEntry })
    const bundle = {
      a: chunk('assets/index-1.js', ['/repo/src/main.tsx'], ['assets/react-vendor-1.js'], true),
      b: chunk('assets/react-vendor-1.js', ['/repo/node_modules/react/index.js'], []),
      c: chunk('assets/Front-1.js', ['/repo/src/pages/Front.tsx', '/repo/src/front/FrontPage.tsx'], ['assets/react-vendor-1.js', 'assets/session-1.js']),
      d: chunk('assets/session-1.js', ['/repo/packages/play/loop/session.ts'], []),
      e: chunk('assets/index-2.js', ['/repo/src/content/generated/index.json'], []),
      f: chunk('assets/Map-1.js', ['/repo/src/pages/Map.tsx'], []),
    }
    const links = preloadsFor({ bundle: bundle as never }, '/repo', '/enginespace/')
    expect(links).toBe(
      ['assets/Front-1.js', 'assets/index-2.js', 'assets/session-1.js'].map((file) => `<link rel="modulepreload" crossorigin href="/enginespace/${file}">`).join(''),
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
    expect(inside).toContain('Fire the next step.')
    expect(svgsIn(inside).filter((svg) => svg.includes('aria-label="Fill the rail.'))).toEqual(renderPosters().map((poster) => poster.svg.trimEnd()))
  })

  test('keeps the policy first and runs no inline script', async () => {
    const info = await inspect(html)
    expect(policyProblems(info)).toEqual([])
    expect(html.indexOf(CSP_META)).toBeGreaterThan(-1)
  })

  test('prints the menu from the compiled course index: every module, with the total', () => {
    const index = JSON.parse(readFileSync(path.join(root, 'src/content/generated/index.json'), 'utf8')) as { modules: { id: string; route: string }[] }
    const menu = html.slice(html.indexOf('class="es-front-menu"'), html.indexOf('class="es-front-next"'))
    expect(index.modules.length).toBeGreaterThan(5)
    for (const module of index.modules) expect(menu).toContain(`href="${module.route}"`)
    expect(menu).toContain('data-tag="derived"')
  })

  test('preloads the page\'s own chunk and the course index from inside the root', () => {
    const inside = html.slice(html.indexOf('<div id="root">'))
    const preloads = [...inside.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g)].map((match) => match[1])
    expect(preloads.some((href) => /\/assets\/Front-[\w-]+\.js$/.test(href))).toBe(true)
    const manifest = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8')) as Record<string, { file: string }>
    expect(preloads).toContain(`/${manifest['src/content/generated/index.json'].file}`)
  })
})
