/*
 * What the tests of W0-T19 share: a stand-in for the document Vite builds, a small set of fake sources, a real `vite build`,
 * and an oracle for what a document's head holds. The oracle is HTMLRewriter used directly, and nothing in scripts/pages/ is
 * used to read a document back, so a mistake in scripts/pages/document.ts cannot hide behind itself.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ContentIndex } from '../../packages/schema/compiled'
import { insertCsp } from '../../scripts/pages/csp'
import type { Sources } from '../../scripts/pages/plan'
import { root } from '../ci/support'

export { root }

export interface HeadElement {
  tag: string
  attrs: Record<string, string>
}

/** The elements directly inside <head>, in document order, as an HTML5 parser sees them. */
export async function headOf(html: string): Promise<HeadElement[]> {
  const found: HeadElement[] = []
  await new HTMLRewriter()
    .on('head > *', {
      element(el) {
        found.push({ tag: el.tagName, attrs: Object.fromEntries([...el.attributes]) })
      },
    })
    .transform(new Response(html))
    .text()
  return found
}

/** The five references that scripts/pages/document.ts writes, undone. */
export const unescape = (text: string): string =>
  text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&')

/** The text of the document's <title>. */
export async function titleOf(html: string): Promise<string> {
  let title = ''
  await new HTMLRewriter()
    .on('title', {
      text(chunk) {
        title += chunk.text
      },
    })
    .transform(new Response(html))
    .text()
  return unescape(title)
}

/** The .html files under `dir`, as paths relative to it with slashes, sorted. */
export function htmlFilesUnder(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file.endsWith('.html'))
    .sort()
}

export const readFile = (dir: string, file: string): string => readFileSync(path.join(dir, file), 'utf8')

interface TemplateOptions {
  title?: string
  description?: string
  /** What sits inside <div id="root">: the front page's static shell. */
  inside?: string
  /** Put the policy in, as the build does. */
  policy?: boolean
}

/**
 * A document like the one `vite build` writes from index.html, with entry assets under `base`: the charset first, then the
 * viewport, the title, the description, and a module script, a preload and a stylesheet at the end of the head.
 */
export function templateHtml(base = '/', { title = 'enginespace', description = 'The front page of the course.', inside = '<main><h1>Front page</h1></main>', policy = true }: TemplateOptions = {}): string {
  const plain = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <script type="module" crossorigin src="${base}assets/index-abc123.js"></script>
    <link rel="modulepreload" crossorigin href="${base}assets/react-vendor-abc123.js">
    <link rel="stylesheet" crossorigin href="${base}assets/index-abc123.css">
  </head>
  <body>
    <div id="root">${inside}</div>
  </body>
</html>
`
  return policy ? insertCsp(plain) : plain
}

/** Fake sources: a planned module and a written one with a lesson, two games, two labs and a trace. */
export const fakeSources: Sources = {
  index: {
    totalHours: 15,
    modules: [
      { id: 'tr1', title: 'Read the engines', route: '/m/tr1', status: 'planned', hours: 5, hours_by_lane: { B: 5 }, lessons: [] },
      {
        id: 'tr2',
        title: "The step loop & its bubbles",
        route: '/m/tr2',
        status: 'draft',
        hours: 10,
        hours_by_lane: { B: 10 },
        lessons: [{ id: 'tr2.l1', slug: 'l1-first', title: 'The first "lesson"', route: '/m/tr2/l1-first', minutes: 10, status: 'draft' }],
      },
    ],
  } satisfies ContentIndex,
  games: [
    { id: 'loop', title: 'Service', subtitle: 'the step loop', has3d: true },
    { id: 'gap-hunt', title: 'The Tape', subtitle: 'trace attribution', has3d: false },
  ],
  labs: ['hybrid-kv', 'tr8.replay'],
  traces: ['synthetic-1'],
}

/**
 * A real `vite build` of the repository with this base into `outDir`, as `npm run build` does after tsc. A base of `undefined` leaves
 * VITE_BASE unset, as the deploy does (D-058), whatever the environment of the test run holds. It throws with the log when the build fails.
 */
export function viteBuild(outDir: string, base: string | undefined): void {
  const vite = path.join(root, 'node_modules/vite/bin/vite.js')
  const env: Record<string, string | undefined> = { ...process.env, VITE_BASE: base }
  if (base === undefined) delete env.VITE_BASE
  const run = spawnSync('node', [vite, 'build', '--outDir', outDir, '--emptyOutDir'], { cwd: root, encoding: 'utf8', env })
  if (run.status !== 0) throw new Error(`vite build exited with ${run.status}:\n${run.stdout}${run.stderr}`)
}

export interface ServeOptions {
  /** The port to listen on. Default 0: any free one, which `origin` then names. */
  port?: number
  /** The interface to listen on, and the host `origin` names. Default: every interface, named `localhost`. */
  hostname?: string
}

/**
 * A static server that answers as GitHub Pages does for a site under `base`: `/` on a custom domain (D-058), or the repository's path
 * on a project site. A file is served as it is, a folder with an index.html answers at its address with a trailing slash and redirects
 * from the one without (with a 301, and the query kept: `/play/loop?level=async` goes to `/play/loop/?level=async`), and anything else
 * gets 404.html with the status 404. There are no rewrites, which is the whole reason for prepare-pages.
 *
 * Playwright runs against it in place of `vite preview` when ES_E2E_PAGES is set (playwright.config.ts, e2e/support/serve-pages.ts), because
 * `vite preview` answers every address with one document and never redirects, and a spec that holds on it can still fail on the host
 * (the network spec did, on the live run of 2026-11-09).
 */
export function servePages(dist: string, base: string, { port = 0, hostname }: ServeOptions = {}): { origin: string; stop: () => void } {
  const isFile = (file: string) => existsSync(file) && statSync(file).isFile()
  const server = Bun.serve({
    port,
    ...(hostname === undefined ? {} : { hostname }),
    fetch(request) {
      const { pathname, search } = new URL(request.url)
      const missing = () => new Response(Bun.file(path.join(dist, '404.html')), { status: 404, headers: { 'content-type': 'text/html' } })
      if (!pathname.startsWith(base)) return missing()
      const target = path.resolve(dist, decodeURIComponent(pathname.slice(base.length)))
      if (target !== dist && !target.startsWith(`${dist}${path.sep}`)) return missing()
      if (isFile(target)) return new Response(Bun.file(target))
      const index = path.join(target, 'index.html')
      if (existsSync(target) && statSync(target).isDirectory() && isFile(index)) {
        if (!pathname.endsWith('/')) return new Response(null, { status: 301, headers: { location: `${pathname}/${search}` } })
        return new Response(Bun.file(index), { headers: { 'content-type': 'text/html' } })
      }
      return missing()
    },
  })
  return { origin: `http://${hostname ?? 'localhost'}:${server.port}`, stop: () => void server.stop(true) }
}
