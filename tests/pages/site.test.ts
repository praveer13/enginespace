/*
 * W0-T19's acceptance checks 1 and 2 on a real build: `vite build` of this repository under the Pages base, then prepare-pages
 * on its dist/, then the files read back with an HTML parser that nothing in scripts/ uses (tests/pages/support.ts).
 *
 *   1. With VITE_BASE=/enginespace/, every route-table entry gets an index.html with a distinct <title>. A route with parameters
 *      gets one for each thing that fills them, so an entry whose source holds nothing yet (no game is registered, no trace
 *      exists) has none, and its addresses fall back to 404.html.
 *   2. The CSP <meta> is the first element after <meta charset> in every document, and holds no 'unsafe-eval'.
 *
 * Then a server that answers as GitHub Pages does shows what the files are for: HTTP 200 on every address of the plan.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CSP } from '../../scripts/pages/csp'
import { leavesOf, planPages } from '../../scripts/pages/plan'
import type { Page } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { main } from '../../scripts/prepare-pages'
import { routes } from '../../src/routes'
import { headOf, htmlFilesUnder, readFile, servePages, titleOf, viteBuild } from './support'

const BASE = '/enginespace/'
const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-site-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const dist = path.join(scratch, 'dist')
const sources = loadSources()
const plan = planPages(routes, sources)
/** How many things fill each parameterised route's parameters in this checkout: the documents it should have. */
const instances: Record<string, number> = {
  '/m/:module': sources.index.modules.length,
  '/m/:module/:lesson': sources.index.modules.reduce((sum, module) => sum + module.lessons.length, 0),
  '/play/:game': sources.games.length,
  '/labs/:lab': sources.labs.length,
  '/trace-room/:trace': sources.traces.length,
}

let template = ''
let status = -1
let output: string[] = []

beforeAll(async () => {
  viteBuild(dist, BASE)
  template = readFile(dist, 'index.html')
  const lines: string[] = []
  const log = spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')))
  try {
    status = await main(['--dist', dist], { VITE_BASE: BASE })
  } finally {
    log.mockRestore()
  }
  output = lines
}, 180_000)

describe('prepare-pages on a build under /enginespace/', () => {
  test('succeeds, and reports how many documents each route has', () => {
    expect(status).toBe(0)
    expect(output[0]).toContain('for the base /enginespace/')
    expect(output.some((line) => /\/m\/:module +\d+/.test(line))).toBe(true)
  })

  test('leaves index.html as the build wrote it', () => {
    expect(readFile(dist, 'index.html')).toBe(template)
  })

  test('plans no problem on the real route table and sources', () => {
    expect(plan.problems).toEqual([])
  })
})

describe('acceptance 1: every route-table entry gets an index.html with a distinct <title>', () => {
  const leaves = leavesOf(routes)

  test('the route table has the entries of ARCHITECTURE §3.1, and the plan accounts for each of them', () => {
    expect(leaves.length).toBeGreaterThan(10)
    expect(new Set(plan.pages.map((page) => page.pattern))).toEqual(new Set(leaves.filter((leaf) => (instances[leaf.pattern] ?? 1) > 0).map((leaf) => leaf.pattern)))
  })

  for (const leaf of leaves) {
    const expected = instances[leaf.pattern] ?? 1
    test(`${leaf.pattern} has ${expected === 1 ? 'one document' : `${expected} documents`}${expected === 0 ? ' (its source is empty, so its addresses fall back to 404.html)' : ''}, each a file in dist/`, () => {
      const pages = plan.pages.filter((page) => page.pattern === leaf.pattern)
      expect(pages).toHaveLength(expected)
      const files = new Set(htmlFilesUnder(dist))
      for (const page of pages) expect([page.file, files.has(page.file)]).toEqual([page.file, true])
    })
  }

  test('the documents are the plan\'s and no others: every .html file of dist/ is one the plan lists', () => {
    expect(htmlFilesUnder(dist)).toEqual(plan.pages.map((page) => page.file).sort())
  })

  test('every document has a <title> of its own, and it is the one the plan gives', async () => {
    const titles = new Map<string, string>()
    for (const file of htmlFilesUnder(dist)) {
      const title = await titleOf(readFile(dist, file))
      expect([file, title]).not.toEqual([file, ''])
      expect(titles.get(title)).toBeUndefined()
      titles.set(title, file)
    }
    expect(titles.size).toBe(plan.pages.length)
    for (const page of plan.pages.filter((candidate): candidate is Page & { keep: false } => !candidate.keep)) {
      expect([page.file, await titleOf(readFile(dist, page.file))]).toEqual([page.file, page.title])
    }
  })

  test('every module and lesson has the title that its page sets once it has loaded (titled(title)), and the fallback says it is not found', async () => {
    for (const module of sources.index.modules) {
      expect(await titleOf(readFile(dist, `${module.route.slice(1)}/index.html`))).toBe(`${module.title} · enginespace`)
      for (const lesson of module.lessons) expect(await titleOf(readFile(dist, `${lesson.route.slice(1)}/index.html`))).toBe(`${lesson.title} · enginespace`)
    }
    expect(await titleOf(readFile(dist, '404.html'))).toBe('Page not found · enginespace')
  })

  test('every asset of every document is under /enginespace/', async () => {
    for (const file of htmlFilesUnder(dist)) {
      const urls = [...readFile(dist, file).matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((url) => !url.startsWith('data:'))
      expect(urls.length).toBeGreaterThanOrEqual(2)
      // The built chunks, and the faces that index.html preloads from public/fonts (W0-T18).
      expect([file, urls.filter((url) => !url.startsWith(`${BASE}assets/`) && !url.startsWith(`${BASE}fonts/`))]).toEqual([file, []])
    }
  })
})

describe('acceptance 2: the CSP <meta> is the first element after <meta charset> in every document, with no unsafe-eval', () => {
  test('the build has documents to check, among them the front page, a module, a lesson, a lab and the fallback', () => {
    const files = htmlFilesUnder(dist)
    expect(files.length).toBeGreaterThan(20)
    const [module] = sources.index.modules.filter((candidate) => candidate.lessons.length > 0)
    expect(files).toEqual(
      expect.arrayContaining(['index.html', '404.html', 'map/index.html', `${module.route.slice(1)}/index.html`, `${module.lessons[0].route.slice(1)}/index.html`, `labs/${sources.labs[0]}/index.html`]),
    )
  })

  test('in every .html file of dist/', async () => {
    for (const file of htmlFilesUnder(dist)) {
      const head = await headOf(readFile(dist, file))
      expect([file, head[0]?.tag, head[0]?.attrs.charset]).toEqual([file, 'meta', 'UTF-8'])
      expect([file, head[1]?.tag, head[1]?.attrs['http-equiv']]).toEqual([file, 'meta', 'Content-Security-Policy'])
      const policy = head[1].attrs.content
      expect([file, policy.split(/[\s;]+/).includes("'unsafe-eval'")]).toEqual([file, false])
      expect([file, policy]).toEqual([file, CSP])
    }
  })

  test('and no script, stylesheet or preload comes ahead of it', async () => {
    for (const file of htmlFilesUnder(dist)) {
      const head = await headOf(readFile(dist, file))
      const at = head.findIndex((el) => el.attrs['http-equiv'] === 'Content-Security-Policy')
      expect([file, head.slice(0, at).filter((el) => ['script', 'link', 'style', 'base'].includes(el.tag)).length]).toEqual([file, 0])
    }
  })

  test('and the document carries exactly one policy', async () => {
    for (const file of htmlFilesUnder(dist)) {
      expect([file, (await headOf(readFile(dist, file))).filter((el) => el.attrs['http-equiv'] !== undefined).length]).toEqual([file, 1])
    }
  })
})

describe('served as GitHub Pages serves it', () => {
  let origin = ''
  let stop = () => {}
  beforeAll(() => {
    ;({ origin, stop } = servePages(dist, BASE))
  })
  afterAll(() => stop())

  test('every address of the plan answers 200 with its own document, with or without the closing slash', async () => {
    const addressed = plan.pages.flatMap((page) => (page.url === null ? [] : [{ page, url: page.url }]))
    expect(addressed.length).toBeGreaterThan(20)
    const frontTitle = await titleOf(template)
    for (const { page, url } of addressed) {
      for (const suffix of url === '/' ? [''] : ['', '/']) {
        const response = await fetch(`${origin}${BASE}${url.slice(1)}${suffix}`)
        expect([url + suffix, response.status]).toEqual([url + suffix, 200])
        expect([url + suffix, await titleOf(await response.text())]).toEqual([url + suffix, page.keep ? frontTitle : page.title])
      }
    }
  })

  test('a folder without its slash is redirected to the one with it, as Pages does', async () => {
    const response = await fetch(`${origin}${BASE}m/tr2`, { redirect: 'manual' })
    expect([response.status, response.headers.get('location')]).toEqual([301, `${BASE}m/tr2/`])
  })

  test('an address that no document answers gets the fallback, with the status 404, and the app boots from it', async () => {
    const wanted = new Set(plan.pages.flatMap((page) => (page.url === null ? [] : [page.url])))
    for (const url of ['/m/tr9', '/m/tr2/l9-nope', '/play/not-a-game', '/labs/nothing', '/trace-room/learner-capture', '/nope']) {
      expect(wanted.has(url)).toBe(false)
      const response = await fetch(`${origin}${BASE}${url.slice(1)}`)
      const html = await response.text()
      expect([url, response.status]).toEqual([url, 404])
      expect(await titleOf(html)).toBe('Page not found · enginespace')
      expect(html).toContain(`src="${BASE}assets/`)
    }
  })

  test('the static assets are served from under the base', async () => {
    const entry = /<script type="module"[^>]*src="([^"]+)"/.exec(template)?.[1] ?? ''
    expect(entry.startsWith(`${BASE}assets/`)).toBe(true)
    const response = await fetch(`${origin}${entry}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type') ?? '').not.toContain('html')
  })
})
