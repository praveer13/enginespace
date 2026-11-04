/*
 * The front page's static shell, as a Vite plugin (ARCHITECTURE §6.11; TRACKER W0-T18): the build step that inlines the poster.
 *
 * index.html holds a marker inside `<div id="root">`. This plugin renders the app at `/` once (src/front/shell.ts) and writes the
 * markup in its place, so the first bytes of `/` carry the board, the order ticket with the heading and the promise, the poster in the
 * pass's box (inline SVG, both orientations), the deck, and below the fold the night, the order, the menu and the next ticket. Nothing
 * of it needs a script to show, and the app renders the same page over it (src/main.tsx waits for the route), so the swap moves
 * nothing.
 *
 *   - In a build, it starts a server-side loader of Vite's own (a server in middleware mode, with this project's root, base, mode and
 *     aliases, and no watcher), loads the shell module through it, renders and closes it. It also writes modulepreload links for the
 *     front page's chunk, the chunks that chunk imports and the course index, inside the root, so they load beside the entry rather
 *     than after it. prepare-pages replaces the root of every other route's document, and the preloads with it.
 *   - In the dev server it renders the same shell into the document of `/` through the dev server's own loader, and leaves the root
 *     of every other address empty. A render that fails there is logged, and `/` then renders in the browser alone.
 *
 * A document without the marker is left alone, such as the fixture that tests/build.test.ts builds. tests/front/shell.test.ts checks
 * the shell; e2e/front.spec.ts opens it with scripts off.
 */
import type { IndexHtmlTransformContext, Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { createServer } from 'vite'

/** Where index.html wants the shell. */
export const SHELL_MARK = '<!--es:front-shell-->'
/** The module that renders it, by its path from the project's root. */
export const SHELL_ENTRY = '/src/front/shell.ts'
/**
 * What the first render needs: the chunk that holds the front page (its route module only re-exports it, so Rollup gives that chunk
 * no facade, and it is found by the page's own module), and the course index its loader reads.
 */
const FRONT_PAGE = 'src/front/FrontPage.tsx'
const COURSE_INDEX = 'src/content/generated/index.json'

type RenderShell = (base: string) => Promise<string>

async function renderWith(server: ViteDevServer, base: string): Promise<string> {
  const module = (await server.ssrLoadModule(SHELL_ENTRY)) as { renderFrontShell?: RenderShell }
  if (typeof module.renderFrontShell !== 'function') throw new Error(`${SHELL_ENTRY} exports no renderFrontShell`)
  return module.renderFrontShell(base)
}

/** Whether a dev-server request is for the front page. */
export function isFrontPage(url: string, base: string): boolean {
  const pathname = url.split(/[?#]/)[0]
  return pathname === base || pathname === `${base}index.html` || (base !== '/' && pathname === base.replace(/\/$/, ''))
}

/** Normalizes a module id to a path from the project's root, with slashes. */
const fromRoot = (id: string, root: string): string => id.split('\\').join('/').replace(`${root.split('\\').join('/')}/`, '')

/**
 * The modulepreload links for the front page's first render: the chunk that holds the page, the chunks it imports, and the course index,
 * less what the entry already loads. Empty outside a build.
 */
export function preloadsFor(ctx: Pick<IndexHtmlTransformContext, 'bundle'>, root: string, base: string): string {
  const bundle = ctx.bundle
  if (bundle === undefined) return ''
  const chunks = Object.values(bundle).filter((output) => output.type === 'chunk')
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const closure = (file: string, into: Set<string>): Set<string> => {
    if (into.has(file)) return into
    into.add(file)
    for (const imported of byFile.get(file)?.imports ?? []) closure(imported, into)
    return into
  }
  const loaded = new Set<string>()
  for (const chunk of chunks) if (chunk.isEntry) closure(chunk.fileName, loaded)
  const wanted = new Set<string>()
  for (const chunk of chunks) {
    const modules = chunk.moduleIds.map((id) => fromRoot(id, root))
    if (modules.includes(FRONT_PAGE)) closure(chunk.fileName, wanted)
    if (modules.includes(COURSE_INDEX)) wanted.add(chunk.fileName)
  }
  return [...wanted]
    .filter((file) => !loaded.has(file))
    .sort()
    .map((file) => `<link rel="modulepreload" crossorigin href="${base}${file}">`)
    .join('')
}

export function frontShell(): Plugin {
  let config: ResolvedConfig

  return {
    name: 'enginespace:front-shell',

    configResolved(resolved) {
      config = resolved
    },

    transformIndexHtml: {
      // After Vite's own transforms, so what is written here is final: the shell's links already carry the base.
      order: 'post',
      async handler(html, ctx) {
        if (!html.includes(SHELL_MARK)) return html
        if (ctx.server) {
          if (!isFrontPage(ctx.originalUrl ?? ctx.path, config.base)) return html
          try {
            return html.replace(SHELL_MARK, await renderWith(ctx.server, config.base))
          } catch (error) {
            config.logger.warn(`front-shell: the static shell did not render, so / renders in the browser alone: ${error instanceof Error ? error.message : String(error)}`)
            return html
          }
        }
        const server = await createServer({
          configFile: false,
          root: config.root,
          base: config.base,
          mode: config.mode,
          envDir: config.envDir,
          resolve: { alias: config.resolve.alias },
          logLevel: 'silent',
          appType: 'custom',
          clearScreen: false,
          server: { middlewareMode: true, hmr: false, ws: false, watch: null },
          optimizeDeps: { noDiscovery: true, include: [] },
        })
        try {
          const markup = await renderWith(server, config.base)
          return html.replace(SHELL_MARK, `${markup}${preloadsFor(ctx, config.root, config.base)}`)
        } finally {
          await server.close()
        }
      },
    },
  }
}
