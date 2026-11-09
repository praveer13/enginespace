/*
 * What a lazy import preloads, and the route table beside the entry (ARCHITECTURE §6.10, D-059).
 *
 * Vite gives each dynamic import a list of the chunks that the imported chunk needs, so that the browser fetches them together, and writes
 * the names of all of them into a table at the top of the importing chunk (`__vite__mapDeps`), about 19 B of gzip a name (D-023's W1
 * note). The entry imports every page of the route table lazily, so its table named every chunk of every page, and every page paid for
 * it: each lesson, module and game that added a chunk grew the front page and every route (D-053 to D-057). Two changes end that:
 *   - `resolveDependencies` (below): the entry's lazy imports keep no list of chunks (Vite still adds a page's stylesheets, which it must
 *     load before the page renders), and any other lazy import keeps no chunk that its importer has already loaded;
 *   - the route table: for each pattern of the route table, the chunks its page needs besides the entry's own, and for each game
 *     (`/play/<id>`), the chunks of its component. The build writes it beside the entry as `<entry>.routes.json`, so a table belongs to
 *     the one entry that reads it, and each is read only when it is needed:
 *       - src/route-preload.ts, in the entry, preloads a route's chunks when a link to it is hovered or focused (§6.10);
 *       - prepare-pages gives the document of each route the preloads of its own chunks, as the front page's has (front-shell.ts).
 *
 * The graph is the bundle's, read in `generateBundle`, after Vite has taken the chunks that hold only CSS out of it. Vite writes the
 * preload lists after every plugin of the config has seen the bundle, so the read is complete when `resolveDependencies` is asked.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { routesIn, type Route } from '../verify-bundle.ts'

/** What the table needs of a chunk of the bundle. */
export interface ChunkInfo {
  readonly fileName: string
  readonly imports: readonly string[]
  readonly dynamicImports: readonly string[]
  /** The chunk's entry module, from the project's root (`src/pages/Map.tsx`), or null for a chunk that Rollup shares. */
  readonly facade: string | null
  readonly name: string
  readonly isEntry: boolean
}

/** A route pattern (`/m/:module`) or a game's address (`/play/loop`), to the chunks to preload for it, as paths under the base. */
export type RouteTable = Readonly<Record<string, readonly string[]>>

/** The suffix of the table's file: the entry's own name, with this for `.js`. */
export const TABLE_SUFFIX = '.routes.json'

/** The file of the route table that belongs to the entry `entry` (`assets/index-x.js`). */
export const tableFileOf = (entry: string): string => entry.replace(/\.js$/, TABLE_SUFFIX)

/** A game's component, which the games registry loads on demand: `src/games/<id>/Game.tsx`. */
const GAME = /^src\/games\/([^/]+)\/Game\.tsx$/
/** The course index, which the front page's loader awaits before it paints (A§6.10; verify-bundle.ts and front-shell.ts count it too). */
const COURSE_INDEX = 'src/content/generated/index.json'

/** The chunks that `roots` load with them: themselves and their static imports, transitively, in visit order. */
export function staticClosure(imports: (file: string) => readonly string[], roots: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const imported of imports(file)) visit(imported)
  }
  for (const root of roots) visit(root)
  return seen
}

/** The chunks of `deps` that `host` has not loaded by the time it runs: those outside its static closure. */
export function notLoadedBy(imports: (file: string) => readonly string[], host: string, deps: readonly string[]): string[] {
  const loaded = staticClosure(imports, [host])
  return deps.filter((dep) => !loaded.has(dep))
}

/**
 * The route table of a bundle. A page's chunk is the one whose entry module it is, or, when Rollup moved the page into a chunk that
 * another lazy chunk shares, the chunk of its name that the entry imports lazily (scripts/verify-bundle.ts finds pages the same way). The
 * front page's (`/`) has the course index too, which its loader awaits. A route whose page has no chunk is left out, and so is a page
 * that adds nothing to the entry.
 */
export function routeTableOf(chunks: readonly ChunkInfo[], routes: readonly Route[]): RouteTable {
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const imports = (file: string) => byFile.get(file)?.imports ?? []
  const entry = chunks.find((chunk) => chunk.isEntry)
  if (entry === undefined) return {}
  const loaded = staticClosure(imports, [entry.fileName])
  const beyondEntry = (root: string) => [...staticClosure(imports, [root])].filter((file) => !loaded.has(file)).sort()
  const pageChunk = (page: string): ChunkInfo | undefined =>
    chunks.find((chunk) => chunk.facade === `src/pages/${page}.tsx`) ??
    entry.dynamicImports.map((file) => byFile.get(file)).find((chunk) => chunk !== undefined && chunk.name === page)

  const table: Record<string, readonly string[]> = {}
  const index = chunks.find((chunk) => chunk.facade === COURSE_INDEX)
  for (const { pattern, page } of routes) {
    const chunk = pageChunk(page)
    if (chunk === undefined) continue
    const files = beyondEntry(chunk.fileName)
    if (pattern === '/' && index !== undefined && !files.includes(index.fileName)) files.push(index.fileName)
    if (files.length > 0) table[pattern] = files.sort()
  }
  for (const chunk of chunks) {
    const game = chunk.facade === null ? null : GAME.exec(chunk.facade)
    if (game !== null) table[`/play/${game[1]}`] = beyondEntry(chunk.fileName)
  }
  return table
}

/**
 * The plugin that reads the bundle and writes the route table beside the entry, and the `resolveDependencies` of
 * `build.modulePreload` that goes with it (vite.config.ts).
 */
export function routeTable(root: string): { plugin: Plugin; resolveDependencies: (file: string, deps: string[], context: { hostId: string; hostType: 'html' | 'js' }) => string[] } {
  const graph = new Map<string, readonly string[]>()
  let entryFile: string | null = null
  const imports = (file: string) => graph.get(file) ?? []

  const plugin: Plugin = {
    name: 'enginespace:route-table',
    apply: 'build',
    // After Vite's CSS step, which takes the chunks that hold only CSS out of the bundle, and before the step that writes the preload lists.
    enforce: 'post',
    generateBundle(_options, bundle) {
      graph.clear()
      entryFile = null
      const chunks: ChunkInfo[] = []
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue
        graph.set(output.fileName, output.imports)
        if (output.isEntry) entryFile = output.fileName
        const facade = output.facadeModuleId === null ? null : path.relative(root, output.facadeModuleId).split(path.sep).join('/')
        chunks.push({ fileName: output.fileName, imports: output.imports, dynamicImports: output.dynamicImports, facade, name: output.name, isEntry: output.isEntry })
      }
      // A build of something other than the app (tests/fixtures/chunks) has no route table of its own.
      const routesFile = path.join(root, 'src/routes.tsx')
      if (entryFile === null || !chunks.some((chunk) => chunk.facade?.startsWith('src/pages/'))) return
      const table = routeTableOf(chunks, routesIn(readFileSync(routesFile, 'utf8')))
      this.emitFile({ type: 'asset', fileName: tableFileOf(entryFile), source: `${JSON.stringify(table)}\n` })
    },
  }

  /** The entry's lazy imports keep no chunk, and every other lazy import keeps the chunks that its importer has not loaded. */
  const resolveDependencies = (_file: string, deps: string[], { hostId, hostType }: { hostId: string; hostType: 'html' | 'js' }): string[] => {
    if (hostType !== 'js') return deps
    return hostId === entryFile ? [] : notLoadedBy(imports, hostId, deps)
  }

  return { plugin, resolveDependencies }
}
