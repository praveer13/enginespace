/*
 * W1b-T09, acceptance 2: the network spec passes against `vite preview` and against a server that redirects directory paths as GitHub Pages
 * does. That server is `servePages` (tests/pages/support.ts), which the tests of the prepared site run against, and which a Playwright run
 * serves dist/ with when ES_E2E_PAGES is set (playwright.config.ts, e2e/support/serve-pages.ts). These tests hold what the run leans on:
 *
 *   - a folder with a document answers `/map` with a 301 to `/map/`, keeping the query (the live site's own answer to `/play/loop?level=async`
 *     [measured 2026-11-09 by the live check]), and answers `/map/` with the document;
 *   - a file is served as it is, a folder without a document and an address that nothing answers get 404.html with a 404;
 *   - it listens on the port and the interface it is given, and nothing outside the build is served;
 *   - the config starts it only when asked, and `vite preview` stays what every other run is served by.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { read } from '../ci/support'
import { servePages } from './support'

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-serve-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const dist = path.join(scratch, 'dist')
const put = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(dist, file)), { recursive: true })
  writeFileSync(path.join(dist, file), text)
}
put('index.html', '<title>front</title>')
put('404.html', '<title>not found</title>')
put('map/index.html', '<title>map</title>')
put('play/loop/index.html', '<title>loop</title>')
put('assets/app.js', 'export {}')
put('labs/manifest.json', '{}')
// A file outside the build, which the address `/../secret.txt` must not reach.
writeFileSync(path.join(scratch, 'secret.txt'), 'outside')

let origin = ''
let stop = () => {}
beforeAll(() => {
  ;({ origin, stop } = servePages(dist, '/', { hostname: '127.0.0.1' }))
})
afterAll(() => stop())

const get = (address: string) => fetch(`${origin}${address}`, { redirect: 'manual' })

describe('a server that answers as GitHub Pages does', () => {
  test('redirects a folder that holds a document to its address with a slash, with a 301, and keeps the query', async () => {
    for (const [address, location] of [
      ['/map', '/map/'],
      ['/play/loop', '/play/loop/'],
      ['/play/loop?level=async', '/play/loop/?level=async'],
      ['/map?a=1&b=2', '/map/?a=1&b=2'],
    ]) {
      const response = await get(address)
      expect([address, response.status, response.headers.get('location')]).toEqual([address, 301, location])
    }
  })

  test('answers the address with the slash with the folder\'s document, and the root with the front page', async () => {
    for (const [address, title] of [
      ['/map/', 'map'],
      ['/play/loop/', 'loop'],
      ['/', 'front'],
    ]) {
      const response = await get(address)
      expect([address, response.status]).toEqual([address, 200])
      expect([address, await response.text()]).toEqual([address, `<title>${title}</title>`])
    }
  })

  test('serves a file as it is, with no redirect', async () => {
    const response = await get('/assets/app.js')
    expect([response.status, await response.text()]).toEqual([200, 'export {}'])
  })

  test('answers a folder with no document, and an address that nothing answers, with 404.html and the status 404', async () => {
    for (const address of ['/labs/', '/labs', '/nope', '/nope/', '/play/loop/extra']) {
      const response = await get(address)
      expect([address, response.status, await response.text()]).toEqual([address, 404, '<title>not found</title>'])
    }
  })

  test('serves nothing from outside the build', async () => {
    for (const address of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/../../secret.txt']) {
      const response = await fetch(`${origin}${address}`, { redirect: 'manual' })
      expect([address, await response.text()].join(' ')).not.toContain('outside')
    }
  })

  test('listens on the port it is given, on the interface it is given, and says so', async () => {
    // A port that was free a moment ago: any free one is asked for, read, and let go.
    const probe = servePages(dist, '/', { hostname: '127.0.0.1' })
    const port = Number(new URL(probe.origin).port)
    probe.stop()
    const other = servePages(dist, '/', { port, hostname: '127.0.0.1' })
    try {
      expect(other.origin).toBe(`http://127.0.0.1:${port}`)
      expect(await (await fetch(`${other.origin}/map/`)).text()).toBe('<title>map</title>')
    } finally {
      other.stop()
    }
    expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })
})

describe('the Playwright config', () => {
  const config = read('playwright.config.ts')

  test('serves the build as Pages does only when ES_E2E_PAGES is set, after prepare-pages has written the documents, and `vite preview` otherwise', () => {
    expect(config).toContain("process.env.ES_E2E_PAGES === '1'")
    expect(config).toContain('NIGHTLY || PAGES ?')
    expect(config).toContain('bun e2e/support/serve-pages.ts ${PORT}')
    expect(config).toContain('npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort')
    expect(read('e2e/support/serve-pages.ts')).toContain("servePages(dist, '/', { port, hostname: '127.0.0.1' })")
  })

  test('the network spec reads the path the page is at, and not the one a server happens to leave it on', () => {
    const spec = read('e2e/network.spec.ts')
    expect(spec).toContain('location.pathname')
    expect(spec).toContain('@${here}')
    expect(spec).not.toContain('@\\/map$')
  })
})
