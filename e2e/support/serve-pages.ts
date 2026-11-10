/*
 * Serves dist/ as GitHub Pages does, for a Playwright run (ES_E2E_PAGES=1, playwright.config.ts):
 *
 *   bun e2e/support/serve-pages.ts <port>
 *
 * `vite preview`, which the specs run against by default, answers every address with the same document and never redirects. Pages
 * answers `/map` with a 301 to `/map/`, and the live run of 2026-11-09 failed a spec that had only ever seen the first. This is the
 * server of tests/pages/support.ts (`servePages`, which the tests of the prepared site run against) on a port that a config can name, over a
 * build that prepare-pages has written the documents of. It listens on the loopback interface only.
 */
import path from 'node:path'
import { servePages } from '../../tests/pages/support'

const port = Number(process.argv[2])
if (!Number.isInteger(port) || port <= 0) {
  console.error('usage: bun e2e/support/serve-pages.ts <port>')
  process.exit(2)
}

const dist = path.resolve(import.meta.dirname, '../../dist')
const { origin } = servePages(dist, '/', { port, hostname: '127.0.0.1' })
console.log(`serving dist/ as GitHub Pages does, at ${origin}/`)
