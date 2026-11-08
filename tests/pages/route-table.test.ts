/*
 * D-059, ARCHITECTURE §6.10: the entry carries no list of the pages' chunks. The build writes the route table beside it
 * (scripts/pages/route-table.ts), a link that is hovered or focused preloads its route's chunks from it (src/route-preload.ts), and each
 * document that prepare-pages writes preloads its own route's (scripts/prepare-pages.ts). tests/build.test.ts holds a real build to it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Rollup } from 'vite'
import { preloadLinks } from '../../scripts/pages/document'
import { notLoadedBy, routeTable, routeTableOf, staticClosure, tableFileOf } from '../../scripts/pages/route-table'
import type { ChunkInfo } from '../../scripts/pages/route-table'
import { routesIn } from '../../scripts/verify-bundle'
import { preloadsOf } from '../../scripts/prepare-pages'
import { routeKeys } from '../../src/route-preload'
import { routes } from '../../src/routes'

/** A chunk of a bundle, as the table reads it. */
const chunk = (fileName: string, more: Partial<ChunkInfo> = {}): ChunkInfo => ({ fileName, imports: [], dynamicImports: [], facade: null, name: fileName.replace(/^assets\/|-\w+\.js$/g, ''), isEntry: false, ...more })

/*
 * The entry imports react-vendor; Map shares `kit` with the Game page, and Game loads Service's component, which imports `kit` and its own
 * `rules`; Lesson was moved by Rollup into a chunk that another lazy chunk shares, so it has no facade and is found by its name.
 */
const CHUNKS: ChunkInfo[] = [
  chunk('assets/index-e.js', { isEntry: true, imports: ['assets/react-vendor-r.js'], dynamicImports: ['assets/Front-f.js', 'assets/Map-m.js', 'assets/Game-g.js', 'assets/Lesson-l.js'] }),
  chunk('assets/react-vendor-r.js'),
  chunk('assets/Front-f.js', { facade: 'src/pages/Front.tsx', imports: ['assets/react-vendor-r.js', 'assets/kit-k.js'] }),
  chunk('assets/Map-m.js', { facade: 'src/pages/Map.tsx', imports: ['assets/kit-k.js', 'assets/index-e.js'] }),
  chunk('assets/Game-g.js', { facade: 'src/pages/Game.tsx', imports: ['assets/kit-k.js'], dynamicImports: ['assets/Game-s.js'] }),
  chunk('assets/Game-s.js', { facade: 'src/games/loop/Game.tsx', imports: ['assets/kit-k.js', 'assets/rules-u.js'] }),
  chunk('assets/Lesson-l.js', { imports: ['assets/react-vendor-r.js'] }),
  chunk('assets/About-a.js', { facade: 'src/pages/About.tsx', imports: ['assets/react-vendor-r.js'] }),
  chunk('assets/kit-k.js'),
  chunk('assets/rules-u.js'),
  chunk('assets/index-i.js', { facade: 'src/content/generated/index.json' }),
]
const ROUTES = [
  { pattern: '/', page: 'Front' },
  { pattern: '/map', page: 'Map' },
  { pattern: '/play/:game', page: 'Game' },
  { pattern: '/m/:module/:lesson', page: 'Lesson' },
  { pattern: '/about', page: 'About' },
  { pattern: '/receipts', page: 'Receipts' },
]
const graph = new Map(CHUNKS.map((info) => [info.fileName, info.imports]))
const importsOf = (file: string) => graph.get(file) ?? []

describe('the route table of a bundle', () => {
  const table = routeTableOf(CHUNKS, ROUTES)

  test("lists for each route the chunks its page needs besides the entry's own, sorted", () => {
    expect(table['/map']).toEqual(['assets/Map-m.js', 'assets/kit-k.js'])
    expect(table['/play/:game']).toEqual(['assets/Game-g.js', 'assets/kit-k.js'])
  })

  test("adds the course index to the front page's, which its loader awaits", () => {
    expect(table['/']).toEqual(['assets/Front-f.js', 'assets/index-i.js', 'assets/kit-k.js'])
  })

  test("lists each game's component under its address, and finds a page that Rollup moved by its name", () => {
    expect(table['/play/loop']).toEqual(['assets/Game-s.js', 'assets/kit-k.js', 'assets/rules-u.js'])
    expect(table['/m/:module/:lesson']).toEqual(['assets/Lesson-l.js'])
  })

  test('leaves out a route whose page has no chunk, and keeps a page that adds only its own', () => {
    expect(Object.keys(table).sort()).toEqual(['/', '/about', '/m/:module/:lesson', '/map', '/play/:game', '/play/loop'])
    expect(table['/about']).toEqual(['assets/About-a.js'])
  })

  test('sits beside the entry, under its name', () => {
    expect(tableFileOf('assets/index-e.js')).toBe('assets/index-e.routes.json')
  })
})

describe('what a lazy import preloads', () => {
  test('a chunk the importer has loaded, itself or through another, is not listed again', () => {
    expect([...staticClosure(importsOf, ['assets/Game-g.js'])]).toEqual(['assets/Game-g.js', 'assets/kit-k.js'])
    expect(notLoadedBy(importsOf, 'assets/Game-g.js', ['assets/Game-s.js', 'assets/kit-k.js', 'assets/rules-u.js'])).toEqual(['assets/Game-s.js', 'assets/rules-u.js'])
  })

  test("the entry's lazy imports list no chunk; another's lists what its importer lacks; the document's lists are Vite's", () => {
    const root = path.resolve(import.meta.dirname, '../..')
    const { plugin, resolveDependencies } = routeTable(root)
    const emitted: { fileName?: string; source?: unknown }[] = []
    const bundle = Object.fromEntries(
      CHUNKS.map((info) => [
        info.fileName,
        { type: 'chunk', fileName: info.fileName, imports: info.imports, dynamicImports: info.dynamicImports, facadeModuleId: info.facade === null ? null : path.join(root, info.facade), name: info.name, isEntry: info.isEntry },
      ]),
    ) as unknown as Rollup.OutputBundle
    const context = { emitFile: (file: { fileName?: string; source?: unknown }) => emitted.push(file) } as unknown as Rollup.PluginContext
    ;(plugin.generateBundle as (this: Rollup.PluginContext, options: unknown, bundle: Rollup.OutputBundle) => void).call(context, {}, bundle)
    // The table goes beside the entry, for the app's own route table (src/routes.tsx).
    expect(emitted.map((file) => file.fileName)).toEqual(['assets/index-e.routes.json'])
    expect(JSON.parse(String(emitted[0].source))).toEqual(routeTableOf(CHUNKS, routesIn(readFileSync(path.join(root, 'src/routes.tsx'), 'utf8'))))
    expect(resolveDependencies('assets/Map-m.js', ['assets/Map-m.js', 'assets/kit-k.js'], { hostId: 'assets/index-e.js', hostType: 'js' })).toEqual([])
    expect(resolveDependencies('assets/Game-s.js', ['assets/Game-s.js', 'assets/kit-k.js', 'assets/rules-u.js'], { hostId: 'assets/Game-g.js', hostType: 'js' })).toEqual(['assets/Game-s.js', 'assets/rules-u.js'])
    expect(resolveDependencies('assets/Front-f.js', ['assets/kit-k.js'], { hostId: 'index.html', hostType: 'html' })).toEqual(['assets/kit-k.js'])
  })

  test('a build with no pages, a fixture of the chunking, gets no table', () => {
    const { plugin } = routeTable(path.resolve(import.meta.dirname, '../..'))
    const emitted: unknown[] = []
    const bundle = { 'assets/main-e.js': { type: 'chunk', fileName: 'assets/main-e.js', imports: [], dynamicImports: [], facadeModuleId: '/elsewhere/main.ts', name: 'main', isEntry: true } } as unknown as Rollup.OutputBundle
    const context = { emitFile: (file: unknown) => emitted.push(file) } as unknown as Rollup.PluginContext
    ;(plugin.generateBundle as (this: Rollup.PluginContext, options: unknown, bundle: Rollup.OutputBundle) => void).call(context, {}, bundle)
    expect(emitted).toEqual([])
  })
})

describe('a document preloads its own route', () => {
  const table = { '/m/:module': ['assets/Module-x.js', 'assets/kit-k.js'], '/play/:game': ['assets/Game-g.js', 'assets/kit-k.js'], '/play/loop': ['assets/Game-s.js', 'assets/kit-k.js'] }

  test("its pattern's chunks, and those its own address adds, each once", () => {
    expect(preloadsOf(table, { pattern: '/m/:module', url: '/m/tr2' })).toEqual(['assets/Module-x.js', 'assets/kit-k.js'])
    expect(preloadsOf(table, { pattern: '/play/:game', url: '/play/loop' })).toEqual(['assets/Game-g.js', 'assets/kit-k.js', 'assets/Game-s.js'])
    expect(preloadsOf(table, { pattern: '*', url: null })).toEqual([])
  })

  test('as the front page does, with a modulepreload link under the base for each', () => {
    expect(preloadLinks(['assets/Game-g.js'], '/enginespace/')).toBe('<link rel="modulepreload" crossorigin href="/enginespace/assets/Game-g.js">')
  })
})

describe('the keys a link is found under', () => {
  test("its route's pattern and its own address, under the site's base", () => {
    expect(routeKeys(routes, '/m/tr2')).toEqual(['/m/:module', '/m/tr2'])
    expect(routeKeys(routes, '/play/loop')).toEqual(['/play/:game', '/play/loop'])
    expect(routeKeys(routes, '/')).toEqual(['/', '/'])
    expect(routeKeys(routes, '/enginespace/m/tr2/l0-sample', '/enginespace/')).toEqual(['/m/:module/:lesson', '/m/tr2/l0-sample'])
  })

  test('none for an address outside the base', () => {
    expect(routeKeys(routes, '/elsewhere/map', '/enginespace/')).toEqual([])
  })
})
