/*
 * D-058, the custom domain: the site is served at the root of https://enginespace.naigap.com, so the deploy builds and prepares it
 * with VITE_BASE unset (the default base, `/`), and public/CNAME holds the domain.
 *
 * The deploy's own run on a real build: `vite build` and then prepare-pages, both with no VITE_BASE (tests/ci/workflows.test.ts holds
 * deploy.yml to setting none), and then a server that answers as GitHub Pages does. tests/pages/site.test.ts runs the same under a
 * subpath, /enginespace/, which a preview or a fork on a project site uses.
 *
 *   1. dist/CNAME is public/CNAME, and that is the one line `enginespace.naigap.com`.
 *   2. Every document of the prepared site loads its scripts, stylesheets and preloads from the root, and links its front page as `/`.
 *   3. Every address of the plan answers 200 with its own document, with or without the closing slash, and any other address falls
 *      back to 404.html.
 *   4. Nothing in the build needs the site's origin as a string: the meta CSP names no host, and the code spells the origin nowhere
 *      or once, as one `SITE_ORIGIN` constant.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { CSP } from '../../scripts/pages/csp'
import { planPages } from '../../scripts/pages/plan'
import { loadSources } from '../../scripts/pages/sources'
import { main } from '../../scripts/prepare-pages'
import { routes } from '../../src/routes'
import { read } from '../ci/support'
import { htmlFilesUnder, readFile, root, servePages, titleOf, viteBuild } from './support'

const DOMAIN = 'enginespace.naigap.com'

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-domain-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const dist = path.join(scratch, 'dist')
const plan = planPages(routes, loadSources())

let status = -1
let output: string[] = []

beforeAll(async () => {
  // VITE_BASE is unset for both, as in deploy.yml: the `env` of main() is what prepare-pages reads it from.
  viteBuild(dist, undefined)
  const lines: string[] = []
  const log = spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')))
  try {
    status = await main(['--dist', dist], {})
  } finally {
    log.mockRestore()
  }
  output = lines
}, 180_000)

describe('public/CNAME', () => {
  test('holds the one line of the custom domain, as kernelspace\'s does', () => {
    expect(read('public/CNAME')).toBe(`${DOMAIN}\n`)
  })

  test('is published at the root of dist/, byte for byte', () => {
    expect(readFile(dist, 'CNAME')).toBe(read('public/CNAME'))
  })
})

describe('prepare-pages on a build with VITE_BASE unset', () => {
  test('succeeds for the base /, and plans no problem on the real route table and sources', () => {
    expect(plan.problems).toEqual([])
    expect(status).toBe(0)
    expect(output[0]).toMatch(/ for the base \/, and checked the policy and the title of all \d+ \.html files$/)
  })

  test('every document loads its scripts, stylesheets and preloads from the root, and links the front page as /', () => {
    const files = htmlFilesUnder(dist)
    expect(files.length).toBeGreaterThan(20)
    for (const file of files) {
      const html = readFile(dist, file)
      const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((url) => !url.startsWith('data:'))
      expect(urls.length).toBeGreaterThanOrEqual(2) // at least the entry script and the stylesheet
      // The built chunks, and the faces that index.html preloads from public/fonts (W0-T18).
      expect([file, urls.filter((url) => !url.startsWith('/assets/') && !url.startsWith('/fonts/'))]).toEqual([file, []])
    }
    expect(readFile(dist, 'about/index.html')).toContain('<a href="/">Go to the front page</a>')
  })
})

describe('served as GitHub Pages serves a custom domain', () => {
  let origin = ''
  let stop = () => {}
  beforeAll(() => {
    ;({ origin, stop } = servePages(dist, '/'))
  })
  afterAll(() => stop())

  test('every address of the plan answers 200 with its own document, with or without the closing slash', async () => {
    const addressed = plan.pages.flatMap((page) => (page.url === null ? [] : [{ page, url: page.url }]))
    expect(addressed.length).toBeGreaterThan(20)
    const frontTitle = await titleOf(readFile(dist, 'index.html'))
    for (const { page, url } of addressed) {
      for (const suffix of url === '/' ? [''] : ['', '/']) {
        const response = await fetch(`${origin}${url}${suffix}`)
        expect([url + suffix, response.status]).toEqual([url + suffix, 200])
        expect([url + suffix, await titleOf(await response.text())]).toEqual([url + suffix, page.keep ? frontTitle : page.title])
      }
    }
  })

  test('a folder without its slash is redirected to the one with it, at the root', async () => {
    const response = await fetch(`${origin}/m/tr2`, { redirect: 'manual' })
    expect([response.status, response.headers.get('location')]).toEqual([301, '/m/tr2/'])
  })

  test('an address that no document answers gets the fallback, with the status 404, and the app boots from it', async () => {
    const wanted = new Set(plan.pages.flatMap((page) => (page.url === null ? [] : [page.url])))
    for (const url of ['/m/tr9', '/m/tr2/l9-nope', '/play/not-a-game', '/labs/nothing', '/trace-room/learner-capture', '/nope']) {
      expect(wanted.has(url)).toBe(false)
      const response = await fetch(`${origin}${url}`)
      const html = await response.text()
      expect([url, response.status]).toEqual([url, 404])
      expect(await titleOf(html)).toBe('Page not found · enginespace')
      expect(html).toContain('src="/assets/')
    }
  })

  test('serves CNAME as a file, as it serves any other', async () => {
    const response = await fetch(`${origin}/CNAME`)
    expect([response.status, await response.text()]).toEqual([200, `${DOMAIN}\n`])
  })
})

describe('nothing in the build needs the origin as a string (D-058)', () => {
  test("the meta CSP names no host: 'self' is whichever origin serves the page", () => {
    expect(CSP).not.toMatch(/https?:|\.com|\.io/)
  })

  /** The files of the code that builds or ships the site, from the root: where an absolute URL of it could be written. */
  function codeFiles(): string[] {
    const inFolders = ['src', 'packages', 'scripts', 'e2e'].flatMap((folder) =>
      (readdirSync(path.join(root, folder), { recursive: true }) as string[]).map((file) => `${folder}/${file.split(path.sep).join('/')}`),
    )
    return [...inFolders, 'index.html', 'vite.config.ts', 'playwright.config.ts']
      .filter((file) => /\.(?:tsx?|m?js|html|css|json)$/.test(file) && !file.startsWith('src/content/generated/'))
      .filter((file) => statSync(path.join(root, file)).isFile())
  }

  test('the code spells it nowhere, or once, as one SITE_ORIGIN constant', () => {
    const files = codeFiles()
    expect(files.length).toBeGreaterThan(100)
    // A comment may name the domain; a line of code that holds it is a spelling.
    const comment = /^\s*(?:\/\/|\/\*|\*|<!--|#)/
    const spelled = files.flatMap((file) =>
      read(file)
        .split('\n')
        .flatMap((line, index) => (line.includes(DOMAIN) && !comment.test(line) ? [{ at: `${file}:${index + 1}`, line: line.trim() }] : [])),
    )
    // The first thing that needs the site's absolute URL (a canonical link, an Open Graph tag, a sitemap) adds the constant, beside
    // KERNELSPACE_ORIGIN in src/content/render/model.ts or in a better home, and reads it from there (D-058).
    const definition = `export const SITE_ORIGIN = 'https://${DOMAIN}'`
    expect(spelled.filter(({ line }) => line !== definition).map(({ at }) => at)).toEqual([])
    expect(spelled.length).toBeLessThanOrEqual(1)
  })
})
