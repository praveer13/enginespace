/*
 * scripts/prepare-pages.ts on a small build that the test writes itself (ARCHITECTURE §3.2, W0-T19): what it writes, what it
 * leaves alone, and what it refuses. tests/pages/site.test.ts runs it on a real `vite build`.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CSP_META } from '../../scripts/pages/csp'
import { MARK } from '../../scripts/pages/document'
import { planPages } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import type { Page } from '../../scripts/pages/plan'
import { main, normalizeBase, PrepareError, preparePages } from '../../scripts/prepare-pages'
import { routes } from '../../src/routes'
import { fakeSources, headOf, htmlFilesUnder, readFile, templateHtml, titleOf } from './support'

const BASE = '/enginespace/'
const plan = planPages(routes, fakeSources)
const written = plan.pages.filter((page) => !page.keep)

let dist = ''
beforeEach(() => {
  dist = mkdtempSync(path.join(tmpdir(), 'enginespace-prepare-'))
})
afterEach(() => rmSync(dist, { recursive: true, force: true }))

/** Puts a build in `dist`: the template, an asset, and whatever else the test wants there. */
function build(template: string = templateHtml(BASE), more: Record<string, string> = {}): string {
  mkdirSync(path.join(dist, 'assets'), { recursive: true })
  writeFileSync(path.join(dist, 'index.html'), template)
  writeFileSync(path.join(dist, 'assets/index-abc123.js'), 'export {}')
  for (const [file, text] of Object.entries(more)) {
    mkdirSync(path.dirname(path.join(dist, file)), { recursive: true })
    writeFileSync(path.join(dist, file), text)
  }
  return template
}

async function problemsOf(run: Promise<unknown>): Promise<readonly string[]> {
  try {
    await run
  } catch (error) {
    if (error instanceof PrepareError) return error.problems
    throw error
  }
  throw new Error('prepare-pages did not fail')
}

describe('normalizeBase', () => {
  test('reads the base as vite.config.ts does: unset and empty are /, and a slash is added where it is missing', () => {
    expect([undefined, '', '/', '/enginespace/', '/enginespace', '/a/b'].map(normalizeBase)).toEqual(['/', '/', '/', '/enginespace/', '/enginespace/', '/a/b/'])
  })

  test('refuses a base that a deep link could not find its assets under', () => {
    for (const bad of ['./', '../x/', 'https://cdn.example/x/', '/a/../b/', '/a b/', '//host/']) {
      expect(() => normalizeBase(bad)).toThrow(PrepareError)
    }
  })
})

describe('preparePages', () => {
  test('writes the documents of the plan, and leaves index.html as the build wrote it', async () => {
    const template = build()
    const done = await preparePages({ dist, base: BASE, pages: plan.pages })
    expect(done.written.sort()).toEqual(written.map((page) => page.file).sort())
    expect(readFile(dist, 'index.html')).toBe(template)
    expect(htmlFilesUnder(dist)).toEqual(plan.pages.map((page) => page.file).sort())
    expect(done.checked).toBe(plan.pages.length)
  })

  test('gives each document the policy as the first element after its charset, and a title of its own', async () => {
    build()
    await preparePages({ dist, base: BASE, pages: plan.pages })
    const titles: string[] = []
    for (const file of htmlFilesUnder(dist)) {
      const html = readFile(dist, file)
      const head = await headOf(html)
      expect([file, head[0].attrs.charset]).toEqual([file, 'UTF-8'])
      expect([file, head[1].attrs['http-equiv']]).toEqual([file, 'Content-Security-Policy'])
      expect([file, html]).not.toEqual([file, expect.stringContaining("'unsafe-eval'")])
      titles.push(await titleOf(html))
    }
    expect(new Set(titles).size).toBe(titles.length)
    expect(await titleOf(readFile(dist, 'm/tr2/l1-first/index.html'))).toBe('The first "lesson" · enginespace')
  })

  test('writes the shell of each page into its root, with the way home under the base', async () => {
    build()
    await preparePages({ dist, base: BASE, pages: plan.pages })
    const html = readFile(dist, 'labs/tr8.replay/index.html')
    expect(html).toContain('<div id="root"><main><h1>Lab tr8.replay</h1>')
    expect(html).toContain(`<a href="${BASE}">Go to the front page</a>`)
    expect(html).not.toContain('Front page</h1>')
    expect(readFile(dist, '404.html')).toContain('<h1>Page not found</h1>')
  })

  test("preloads in each document the chunks of its own route, from the route table beside the entry, as the front page's does (D-059)", async () => {
    const table = { '/m/:module': ['assets/Module-x.js', 'assets/kit-k.js'], '/play/:game': ['assets/Game-g.js', 'assets/kit-k.js'], '/play/loop': ['assets/Game-s.js'] }
    build(undefined, { 'assets/index-abc123.routes.json': JSON.stringify(table) })
    await preparePages({ dist, base: BASE, pages: plan.pages })
    const preloads = (file: string) => [...readFile(dist, file).matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g)].map((match) => match[1])
    const vendor = `${BASE}assets/react-vendor-abc123.js`
    expect(preloads('m/tr2/index.html')).toEqual([vendor, `${BASE}assets/Module-x.js`, `${BASE}assets/kit-k.js`])
    expect(preloads('play/loop/index.html')).toEqual([vendor, `${BASE}assets/Game-g.js`, `${BASE}assets/kit-k.js`, `${BASE}assets/Game-s.js`])
    // Inside the root, beside the shell: the app takes the root over once its route has loaded, as it does on the front page.
    expect(readFile(dist, 'm/tr2/index.html')).toMatch(/<div id="root"><main>.*<\/main><link rel="modulepreload"/s)
    // A page whose route has nothing of its own in the table, and the fallback, which stands for every other address, preload nothing more.
    expect(preloads('about/index.html')).toEqual([vendor])
    expect(preloads('404.html')).toEqual([vendor])
  })

  test('preloads nothing more in a build that has no route table', async () => {
    build()
    await preparePages({ dist, base: BASE, pages: plan.pages })
    expect(readFile(dist, 'm/tr2/index.html').match(/rel="modulepreload"/g)).toHaveLength(1)
  })

  test('keeps every asset at the path the build gave it, in every document', async () => {
    build()
    await preparePages({ dist, base: BASE, pages: plan.pages })
    for (const file of htmlFilesUnder(dist)) {
      expect([file, readFile(dist, file)]).toEqual([file, expect.stringContaining(`src="${BASE}assets/index-abc123.js"`)])
    }
  })

  test('can run twice: it replaces its own files, and the second run changes nothing', async () => {
    build()
    await preparePages({ dist, base: BASE, pages: plan.pages })
    const first = new Map(htmlFilesUnder(dist).map((file) => [file, readFile(dist, file)]))
    await preparePages({ dist, base: BASE, pages: plan.pages })
    expect(new Map(htmlFilesUnder(dist).map((file) => [file, readFile(dist, file)]))).toEqual(first)
  })

  test('refuses to overwrite a file that it did not write, and writes nothing at all then', async () => {
    build(undefined, { 'map/index.html': `<!doctype html>${CSP_META}<title>A page of public/</title>` })
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('map/index.html is already in dist/ and prepare-pages did not write it')
    expect(readFile(dist, 'map/index.html')).toContain('A page of public/')
    expect(htmlFilesUnder(dist)).toEqual(['index.html', 'map/index.html'])
  })

  test('refuses a document whose file would leave dist/', async () => {
    build()
    const escape: Page = { keep: false, pattern: '/x', url: '/x', file: '../outside/index.html', title: 'X · enginespace', heading: 'X', description: 'x' }
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: [escape] }))
    expect(problems).toEqual(['../outside/index.html would leave dist/'])
    expect(existsSync(path.join(dist, '../outside'))).toBe(false)
  })

  test('refuses a build made under another base than the one it is told', async () => {
    build(templateHtml('/'))
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems).toEqual(['index.html: the build used the base "/" and VITE_BASE says "/enginespace/": build and prepare under the same VITE_BASE'])
    expect(htmlFilesUnder(dist)).toEqual(['index.html'])
  })

  test('refuses a template without the policy, and says that the build adds it', async () => {
    build(templateHtml(BASE, { policy: false }))
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems[0]).toContain('index.html: it has no Content-Security-Policy <meta>')
    expect(problems[0]).toContain('scripts/pages/csp.ts')
  })

  test('refuses a template with text outside its root, which every page would show', async () => {
    build(templateHtml(BASE).replace('<body>', '<body>\n    <h1>Fire the next step.</h1>'))
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('text outside <div id="root"> ("Fire the next step.")')
  })

  test('refuses a template with an inline script, which the policy would block, but not one that only holds data', async () => {
    build(templateHtml(BASE).replace('</body>', '<script>boot()</script></body>'))
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('index.html: it has 1 inline script')
    build(templateHtml(BASE).replace('</body>', '<script type="application/json">{"a":1}</script></body>'))
    await preparePages({ dist, base: BASE, pages: plan.pages })
  })

  test('refuses a template with no root or no title', async () => {
    build(templateHtml(BASE).replace('<div id="root">', '<div id="app">'))
    expect((await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages })))[0]).toContain('0 <div id="root"> elements')
    build(templateHtml(BASE).replace('<title>enginespace</title>', ''))
    expect(await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))).toContain('index.html: it has no <title>')
  })

  test('says when there is no build to prepare', async () => {
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems[0]).toContain('index.html does not exist: build first, with VITE_BASE=/enginespace/ npm run build')
  })

  test('holds every .html file of dist/ to the policy, a file of public/ included', async () => {
    build(undefined, { 'legacy.html': '<!doctype html><html><head><meta charset="UTF-8"><title>Old</title></head><body></body></html>' })
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems).toEqual(['legacy.html: it has no Content-Security-Policy <meta>'])
  })

  test('holds a file of public/ to the rule on inline scripts too', async () => {
    build(undefined, { 'legacy.html': templateHtml(BASE).replace('</body>', '<script>boot()</script></body>') })
    expect(await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))).toEqual(['legacy.html: it has 1 inline script, which the policy blocks (script-src \'self\' has no \'unsafe-inline\'): put the code in a module file'])
  })

  test('fails on a document that an earlier run wrote and the plan no longer lists, which a rebuild would have cleared', async () => {
    build()
    await preparePages({ dist, base: BASE, pages: plan.pages })
    const fewer = plan.pages.filter((page) => page.url !== '/labs/hybrid-kv')
    expect(await problemsOf(preparePages({ dist, base: BASE, pages: fewer }))).toEqual([
      'labs/hybrid-kv/index.html: an earlier run wrote it and the plan no longer lists it: build again, so that dist/ starts empty',
    ])
  })

  test('fails when two planned documents end up with one title', async () => {
    build()
    const twins: Page[] = [
      { keep: false, pattern: '/a', url: '/a', file: 'a/index.html', title: 'Same · enginespace', heading: 'A', description: 'a' },
      { keep: false, pattern: '/b', url: '/b', file: 'b/index.html', title: 'Same · enginespace', heading: 'B', description: 'b' },
    ]
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: twins }))
    expect(problems).toEqual(['a/index.html and b/index.html share the title "Same · enginespace"'])
  })

  test('fails when a file blocks the folder of a document', async () => {
    build(undefined, { map: 'a file where the folder of /map should be' })
    const problems = await problemsOf(preparePages({ dist, base: BASE, pages: plan.pages }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('map/index.html could not be written')
  })

  test('puts the mark on what it writes and nowhere else', async () => {
    build()
    await preparePages({ dist, base: BASE, pages: plan.pages })
    for (const file of htmlFilesUnder(dist)) expect([file, readFile(dist, file).includes(MARK)]).toEqual([file, file !== 'index.html'])
  })
})

describe('the command line', () => {
  /** Runs `main` with its output held back, and returns the status and the lines. */
  async function run(argv: string[], env: Record<string, string | undefined>) {
    const lines: string[] = []
    const log = spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')))
    const error = spyOn(console, 'error').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')))
    try {
      return { status: await main(argv, env), lines }
    } finally {
      log.mockRestore()
      error.mockRestore()
    }
  }

  test('prepares the real route table and sources, under the base that VITE_BASE names', async () => {
    build()
    const { status, lines } = await run(['--dist', dist], { VITE_BASE: BASE })
    expect(status).toBe(0)
    expect(lines[0]).toMatch(/^prepare-pages: wrote \d+ documents under .* for the base \/enginespace\/, and checked the policy and the title of all \d+ \.html files$/)
    const sources = loadSources()
    expect(lines.some((line) => new RegExp(`^ {2}/labs/:lab +${sources.labs.length}\\b`).test(line))).toBe(true)
    for (const module of sources.index.modules) {
      expect(existsSync(path.join(dist, `${module.route.slice(1)}/index.html`))).toBe(true)
      for (const lesson of module.lessons) expect(existsSync(path.join(dist, `${lesson.route.slice(1)}/index.html`))).toBe(true)
    }
    expect(existsSync(path.join(dist, '404.html'))).toBe(true)
  })

  test('takes the base from VITE_BASE, and / when it is unset', async () => {
    build(templateHtml('/'))
    expect((await run(['--dist', dist], {})).status).toBe(0)
    expect(readFileSync(path.join(dist, 'about/index.html'), 'utf8')).toContain('<a href="/">Go to the front page</a>')
  })

  test('exits 1 and says every problem when the build is under another base', async () => {
    build(templateHtml('/'))
    const { status, lines } = await run(['--dist', dist], { VITE_BASE: BASE })
    expect(status).toBe(1)
    expect(lines).toEqual([
      'prepare-pages: index.html: the build used the base "/" and VITE_BASE says "/enginespace/": build and prepare under the same VITE_BASE',
      'prepare-pages failed: 1 problem',
    ])
  })

  test('exits 1 for a VITE_BASE it cannot use, and 2 for an argument it does not know', async () => {
    build()
    expect((await run(['--dist', dist], { VITE_BASE: './' })).status).toBe(1)
    for (const argv of [['--nope'], ['--dist'], ['dist'], ['--dist', dist, '--root', dist], ['--root', dist]]) {
      const { status, lines } = await run(argv, { VITE_BASE: BASE })
      expect([argv, status]).toEqual([argv, 2])
      expect(lines.join('\n')).toContain('usage: VITE_BASE=/enginespace/ bun scripts/prepare-pages.ts')
    }
  })
})
