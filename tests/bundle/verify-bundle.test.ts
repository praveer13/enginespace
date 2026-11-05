/*
 * W0-T20's gate, scripts/verify-bundle.ts (ARCHITECTURE §11.1), against its own rules and against the real build.
 *
 *   - The rules run on a miniature manifest with round sizes, so each figure is exact: which chunks make up the entry, the front
 *     page's first-paint closure and its CSS, another route, a scene, post-processing, a worker and a lesson, what each is held to,
 *     and what makes a row fail, warn or wait. A test changes one thing in the miniature and looks at one row.
 *   - The command runs on a build on disk, with real gzip, for its exit status and its usage.
 *   - The real app is built, and the gate must agree with a count of its own: the entry's closure, the front page's closure, and
 *     index.html, which has to load and preload exactly the files that the closure counts. The test does not hold the real build to
 *     the budgets: that is verify:bundle in CI, so a budget that a later task spends does not fail the unit tests of every other task.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { leavesOf } from '../../scripts/pages/plan'
import { BUDGETS, BundleError, budgetOfRoute, checkBundle, closureOf, filesOf, KB, lineOf, main, readInput, routesIn, summaryOf } from '../../scripts/verify-bundle'
import type { Chunk, Document, Input, Manifest, Report, Row, Route, Tree } from '../../scripts/verify-bundle'
import { routes as appRoutes } from '../../src/routes'

const root = path.resolve(import.meta.dirname, '../..')
const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-bundle-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/* ------------------------------------------------------------------------------------------------------------------ */
/* A miniature of the app's manifest                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Spec {
  /** The gzip bytes of the chunk's file. */
  bytes: number
  name?: string
  src?: string
  entry?: boolean
  dynamic?: boolean
  imports?: string[]
  dyn?: string[]
  /** CSS files the chunk names, with their gzip bytes. */
  css?: Record<string, number>
}

/** The file of a manifest key in the miniature: every key has a file of its own, as in a real build. */
const fileOf = (key: string): string => `assets/${key.replace(/[^\w.-]/g, '-')}.js`

/** A manifest and the size of each of its files, from a spec per key. */
function manifestOf(specs: Record<string, Spec>): { manifest: Manifest; sizes: Map<string, number> } {
  const manifest: Record<string, Chunk> = {}
  const sizes = new Map<string, number>()
  for (const [key, spec] of Object.entries(specs)) {
    manifest[key] = {
      file: fileOf(key),
      ...(spec.name === undefined ? {} : { name: spec.name }),
      ...(spec.src === undefined ? {} : { src: spec.src }),
      ...(spec.entry ? { isEntry: true } : {}),
      ...(spec.dynamic ? { isDynamicEntry: true } : {}),
      ...(spec.imports === undefined ? {} : { imports: spec.imports }),
      ...(spec.dyn === undefined ? {} : { dynamicImports: spec.dyn }),
      ...(spec.css === undefined ? {} : { css: Object.keys(spec.css) }),
    }
    sizes.set(fileOf(key), spec.bytes)
    for (const [css, bytes] of Object.entries(spec.css ?? {})) sizes.set(css, bytes)
  }
  return { manifest, sizes }
}

const FRONT = '_Front.js'
const INDEX_JSON = 'src/content/generated/index.json'
const LESSON = 'src/content/generated/lessons/tr2.l0-sample.json'
const MODULE = 'src/content/generated/modules/tr2.json'

/**
 * The app in miniature, with the shapes of the real manifest: the front page's chunk is shared with the scene, so Rollup keys it by
 * file and names it `Front`; the course index is a lazy JSON chunk that the front page's loader awaits; the game page loads its game
 * on demand, and the game loads its scene; the scene reaches the kit's 3D-only chunk, the kit's chunk that the game also uses, and
 * three. Sizes are gzip bytes, round enough to add up in the head.
 */
const APP: Record<string, Spec> = {
  'index.html': {
    bytes: 36_000,
    entry: true,
    name: 'index',
    src: 'index.html',
    imports: ['_react-vendor.js'],
    dyn: [FRONT, 'src/pages/Map.tsx', 'src/pages/Game.tsx'],
    css: { 'assets/index.css': 15_000 },
  },
  '_react-vendor.js': { bytes: 60_000, name: 'react-vendor' },
  [FRONT]: { bytes: 10_000, name: 'Front', dynamic: true, imports: ['_react-vendor.js', 'index.html', '_session.js', '_load.js'], dyn: ['src/games/loop/Scene3D.tsx'] },
  '_session.js': { bytes: 9_000, name: 'session', imports: ['_react-vendor.js'] },
  '_load.js': { bytes: 1_000, name: 'load', imports: ['index.html'], dyn: [INDEX_JSON] },
  [INDEX_JSON]: { bytes: 600, name: 'index', dynamic: true, src: INDEX_JSON },
  [LESSON]: { bytes: 2_000, name: 'tr2.l0-sample', dynamic: true, src: LESSON },
  [MODULE]: { bytes: 700, name: 'tr2', dynamic: true, src: MODULE },
  'src/pages/Map.tsx': { bytes: 500, name: 'Map', dynamic: true, src: 'src/pages/Map.tsx', imports: ['_react-vendor.js'], css: { 'assets/map.css': 2_000 } },
  'src/pages/Game.tsx': { bytes: 800, name: 'Game', dynamic: true, src: 'src/pages/Game.tsx', imports: ['_react-vendor.js', 'index.html'], dyn: ['src/games/loop/Game.tsx'] },
  'src/games/loop/Game.tsx': {
    bytes: 4_000,
    name: 'Game',
    dynamic: true,
    src: 'src/games/loop/Game.tsx',
    imports: ['_session.js', '_stage-runtime.js', 'index.html'],
    dyn: ['src/games/loop/Scene3D.tsx'],
  },
  '_stage-runtime.js': { bytes: 6_000, name: 'stage-runtime', imports: ['_react-vendor.js'] },
  'src/games/loop/Scene3D.tsx': {
    bytes: 2_500,
    name: 'Scene3D',
    dynamic: true,
    src: 'src/games/loop/Scene3D.tsx',
    imports: ['_react-vendor.js', '_TimeAxis.js', '_three-vendor.js', '_stage-runtime.js', FRONT],
    css: { 'assets/scene.css': 500 },
  },
  '_TimeAxis.js': { bytes: 12_000, name: 'TimeAxis', imports: ['_three-vendor.js'], dyn: ['src/scene/postfx/postfx.ts'] },
  '_three-vendor.js': { bytes: 235_000, name: 'three-vendor', imports: ['_react-vendor.js'] },
  'src/scene/postfx/postfx.ts': { bytes: 5_000, name: 'postfx', dynamic: true, src: 'src/scene/postfx/postfx.ts', imports: ['_three-vendor.js', '_TimeAxis.js'] },
}

const ROUTES: Route[] = [
  { pattern: '/', page: 'Front' },
  { pattern: '/map', page: 'Map' },
  { pattern: '/play/:game', page: 'Game' },
]

const TREE: Tree = { games: ['loop'], scenes: ['src/games/loop/Scene3D.tsx'], workers: [], postfx: true }

interface Variation {
  /** Specs to add or replace; a key set to null is removed. */
  specs?: Record<string, Spec | null>
  routes?: Route[]
  tree?: Partial<Tree>
  assets?: string[]
  /** Files that dist holds besides the manifest's, with their gzip bytes. */
  extra?: Record<string, number>
  document?: Document | null
  site?: { files: number; bytes: number }
}

/** The document that loads and preloads exactly the front page's first-paint closure of a manifest. */
function documentFor(manifest: Manifest): Document {
  const files = filesOf(manifest, closureOf(manifest, ['index.html', FRONT, INDEX_JSON]))
  return {
    gzip: 8_000,
    loads: [...files.js, ...files.css],
    fonts: [
      { file: 'fonts/a.woff2', bytes: 14_000 },
      { file: 'fonts/b.woff2', bytes: 4_000 },
    ],
  }
}

/** The miniature, changed as asked, as the gate's input. */
function inputOf(variation: Variation = {}): Input {
  const specs: Record<string, Spec> = { ...APP }
  for (const [key, spec] of Object.entries(variation.specs ?? {})) {
    if (spec === null) delete specs[key]
    else specs[key] = spec
  }
  const { manifest, sizes } = manifestOf(specs)
  for (const [file, bytes] of Object.entries(variation.extra ?? {})) sizes.set(file, bytes)
  return {
    manifest,
    gzip: (file) => {
      const bytes = sizes.get(file)
      if (bytes === undefined) throw new Error(`the fixture has no size for ${file}`)
      return bytes
    },
    routes: variation.routes ?? ROUTES,
    tree: { ...TREE, ...variation.tree },
    document: variation.document === undefined ? documentFor(manifest) : variation.document,
    assets: variation.assets ?? Object.values(manifest).map((chunk) => chunk.file.replace('assets/', '')),
    site: variation.site ?? { files: 20, bytes: 2_000_000 },
  }
}

const run = (variation?: Variation): Report => checkBundle(inputOf(variation))
const rowOf = (report: Report, id: string): Row => {
  const row = report.rows.find((candidate) => candidate.id === id)
  if (row === undefined) throw new Error(`no row ${id} among ${report.rows.map((candidate) => candidate.id).join(', ')}`)
  return row
}
const statusOf = (report: Report, id: string): string => rowOf(report, id).status
const filesIn = (row: Row): string[] => row.parts.map((part) => part.file).sort()
/** The spec of a key of the miniature with its size changed. */
const sized = (key: string, bytes: number): Record<string, Spec> => ({ [key]: { ...APP[key], bytes } })

/* ------------------------------------------------------------------------------------------------------------------ */
/* Walking the manifest                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('closureOf and filesOf', () => {
  const { manifest } = manifestOf(APP)

  test('follow static imports, once each, and never a dynamic import', () => {
    const keys = closureOf(manifest, [FRONT])
    expect(keys).toEqual([FRONT, '_react-vendor.js', 'index.html', '_session.js', '_load.js'])
    // The scene is a dynamic import of the front page, and the course index of its loader.
    expect(keys).not.toContain('src/games/loop/Scene3D.tsx')
    expect(keys).not.toContain(INDEX_JSON)
  })

  test('start from every root, and count a chunk that two roots share once', () => {
    expect(closureOf(manifest, ['_session.js', '_stage-runtime.js'])).toEqual(['_session.js', '_react-vendor.js', '_stage-runtime.js'])
  })

  test('end on a cycle of static imports', () => {
    const { manifest: cyclic } = manifestOf({ a: { bytes: 1, imports: ['b'] }, b: { bytes: 1, imports: ['a'] } })
    expect(closureOf(cyclic, ['a'])).toEqual(['a', 'b'])
  })

  test('throw a BundleError that names the chunk and its importer when an import is not in the manifest', () => {
    const { manifest: broken } = manifestOf({ a: { bytes: 1, imports: ['gone.js'] } })
    expect(() => closureOf(broken, ['a'])).toThrow(BundleError)
    expect(() => closureOf(broken, ['a'])).toThrow('the manifest has no chunk gone.js, which a imports')
    expect(() => closureOf(broken, ['gone.js'])).toThrow('the manifest has no chunk gone.js')
  })

  test('filesOf names each file once, JavaScript apart from CSS', () => {
    const { manifest: shared } = manifestOf({
      a: { bytes: 1, css: { 'assets/x.css': 1, 'assets/y.css': 1 } },
      b: { bytes: 1, css: { 'assets/x.css': 1 } },
    })
    expect(filesOf(shared, ['a', 'b'])).toEqual({ js: [fileOf('a'), fileOf('b')], css: ['assets/x.css', 'assets/y.css'] })
  })
})

describe('routesIn', () => {
  test('reads the lazy routes of a table, the index route as /', () => {
    const source = `
      { index: true, lazy: () => import('./pages/Front'), handle: { title: SITE } },
      { path: 'm/:module', lazy: () => import('./pages/Module'), handle: titled('Module') },
      { path: '*', Component: NotFound },`
    expect(routesIn(source)).toEqual([
      { pattern: '/', page: 'Front' },
      { pattern: '/m/:module', page: 'Module' },
    ])
  })

  test('reads src/routes.tsx as the route table has it: every lazy route, in the table\'s order, with its pattern', () => {
    const lazy = leavesOf(appRoutes).filter((leaf) => leaf.route.lazy !== undefined)
    const read = routesIn(readFileSync(path.join(root, 'src/routes.tsx'), 'utf8'))
    expect(read.length).toBeGreaterThan(10)
    expect(read.map((route) => route.pattern)).toEqual(lazy.map((leaf) => leaf.pattern))
  })

  test('refuses a lazy route in another shape, which would be a page with no budget', () => {
    const odd = `{ path: 'a', lazy: () => import('./pages/A') }, { path: 'b', lazy: async () => (await import('./pages/B')) }`
    expect(() => routesIn(odd)).toThrow(BundleError)
    expect(() => routesIn(odd)).toThrow('2 lazy routes and the gate reads 1')
    expect(() => routesIn('nothing lazy here')).toThrow('0 lazy routes and the gate reads 0')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The rows                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the miniature', () => {
  const report = run()

  test('passes, and has a row for each budget of ARCHITECTURE §11.1 that the app has, in this order', () => {
    expect(report.failed).toBe(0)
    expect(report.rows.map((row) => row.id)).toEqual([
      'entry',
      'front',
      'css',
      'front-total',
      'route:/map',
      'route:/play/loop',
      'scene:loop',
      'three-vendor',
      'postfx',
      'worker:receipt.worker',
      'worker:forge.worker',
      'lesson:tr2.l0-sample',
      'module:tr2',
      'index',
      'document',
      'fonts',
      'site',
    ])
  })

  test('holds the entry and what it imports statically to a gate of 110 KB and a target of 100 KB: 96,000 B', () => {
    // index.html 36,000 + react 60,000. Front, the pages and the course index are lazy, and so they are not in it.
    const row = rowOf(report, 'entry')
    expect([row.status, row.bytes, row.gate, row.target]).toEqual(['ok', 96_000, 110, 100])
    expect(filesIn(row)).toEqual([fileOf('index.html'), fileOf('_react-vendor.js')].sort())
    expect(row.detail).toBe(`${fileOf('index.html')} with the chunks it imports statically (react-vendor)`)
    expect([BUDGETS.entry.gate, BUDGETS.entry.target]).toEqual([110, 100])
  })

  test('counts for the front page the JavaScript of the entry, the page and the course index, with their static imports', () => {
    // index.html 36,000 + react 60,000 + Front 10,000 + session 9,000 + load 1,000 + the course index 600.
    const row = rowOf(report, 'front')
    expect(row.bytes).toBe(116_600)
    expect([row.gate, row.target]).toEqual([154, 130])
    expect(filesIn(row)).toEqual(['index.html', '_react-vendor.js', FRONT, '_session.js', '_load.js', INDEX_JSON].map(fileOf).sort())
  })

  test('gives the front page CSS its own row, and leaves it out of the closure row', () => {
    expect(rowOf(report, 'css').bytes).toBe(15_000)
    expect([rowOf(report, 'css').gate, rowOf(report, 'css').target]).toEqual([30, 20])
    const total = rowOf(report, 'front-total')
    expect([total.bytes, total.status]).toEqual([116_600 + 15_000, 'info'])
  })

  test('counts for any other route the JavaScript and CSS of its page and the entry with their static imports', () => {
    // index.html 36,000 + react 60,000 + Map 500, and the CSS of the entry 15,000 and of the page 2,000.
    const row = rowOf(report, 'route:/map')
    expect([row.bytes, row.gate]).toEqual([36_000 + 60_000 + 500 + 15_000 + 2_000, 201])
  })

  test("counts for a game's route the game's chunk as well, and not its scene", () => {
    // entry 36,000 + react 60,000 + the Game page 800 + the game 4,000 + session 9,000 + stage runtime 6,000, and the entry's CSS 15,000.
    const row = rowOf(report, 'route:/play/loop')
    expect(row.label).toBe('route /play/loop')
    expect(row.bytes).toBe(36_000 + 60_000 + 800 + 4_000 + 9_000 + 6_000 + 15_000)
    expect(filesIn(row)).not.toContain(fileOf('src/games/loop/Scene3D.tsx'))
  })

  test("counts for a scene its chunk, its CSS and the chunks that only 3D reaches, not three, the site's chunks or post-processing", () => {
    // Scene3D 2,500 + its CSS 500 + TimeAxis 12,000. React, the Front chunk and the stage runtime are the site's, and three-vendor has its own row.
    const row = rowOf(report, 'scene:loop')
    expect(row.bytes).toBe(15_000)
    expect([row.label, row.gate, row.target]).toEqual(['scene-loop', 40, null])
    expect(filesIn(row)).toEqual([fileOf('src/games/loop/Scene3D.tsx'), 'assets/scene.css', fileOf('_TimeAxis.js')].sort())
    expect(row.detail).toContain('TimeAxis')
  })

  test('holds three-vendor, post-processing, a lesson and a module to the budgets of §11.1 and §4.6', () => {
    expect([rowOf(report, 'three-vendor').bytes, rowOf(report, 'three-vendor').gate]).toEqual([235_000, 245])
    expect([rowOf(report, 'postfx').bytes, rowOf(report, 'postfx').gate]).toEqual([5_000, 25])
    expect([rowOf(report, 'lesson:tr2.l0-sample').bytes, rowOf(report, 'lesson:tr2.l0-sample').gate]).toEqual([2_000, 40])
    expect([rowOf(report, 'module:tr2').bytes, rowOf(report, 'module:tr2').gate]).toEqual([700, 40])
  })

  test('skips a worker that has no source yet, and reports the document, the fonts and the site without a verdict', () => {
    expect(statusOf(report, 'worker:receipt.worker')).toBe('skip')
    expect(statusOf(report, 'worker:forge.worker')).toBe('skip')
    expect(rowOf(report, 'document').detail).toContain('8,000 B')
    expect(rowOf(report, 'fonts').detail).toContain('2 faces')
    expect(rowOf(report, 'fonts').detail).toContain('18,000 B')
    expect(statusOf(report, 'site')).toBe('info')
    expect(statusOf(report, 'index')).toBe('ok')
  })

  test('summarises: the budgets gated, the rows over a target, the rows skipped', () => {
    expect(summaryOf(report)).toBe('verify:bundle passed: 10 budgets gated, 0 over a target, 2 skipped')
  })
})

describe('a gate and a target', () => {
  test('the entry is ok up to its target, warns above it, and fails one byte above its gate', () => {
    // The entry's closure is its own file and react-vendor's 60,000 B, so the file is what is left of the figure.
    const entryAt = (closure: number) => statusOf(run({ specs: sized('index.html', closure - 60_000) }), 'entry')
    expect(entryAt(100 * KB)).toBe('ok')
    expect(entryAt(100 * KB + 1)).toBe('warn')
    expect(entryAt(110 * KB)).toBe('warn')
    expect(entryAt(110 * KB + 1)).toBe('FAIL')
  })

  test('the entry row counts what the entry imports, so a vendor chunk that grows fails it while the entry file stays small', () => {
    // This is the case the row was moved for: React and ReactDOM sit in react-vendor, and the entry's own file is 36,000 B.
    const grown = run({ specs: sized('_react-vendor.js', 75 * KB) })
    expect([rowOf(grown, 'entry').status, rowOf(grown, 'entry').bytes]).toEqual(['FAIL', 36_000 + 75 * KB])
    expect(rowOf(grown, 'entry').bytes).toBeGreaterThan(110 * KB)
    // A row that fails lists its files, largest first, so the cause is on the screen.
    expect(rowOf(grown, 'entry').parts.map((part) => part.file)).toEqual([fileOf('_react-vendor.js'), fileOf('index.html')])
    // The same 36,000 B file alone would have passed every limit.
    expect(statusOf(run({ specs: { '_react-vendor.js': { ...APP['_react-vendor.js'], bytes: 1 } } }), 'entry')).toBe('ok')
  })

  test('the entry row follows static imports only: a lazy chunk, however large, is not in it', () => {
    const lazy = run({ specs: sized(FRONT, 500 * KB) })
    expect(rowOf(lazy, 'entry').bytes).toBe(96_000)
    expect(statusOf(lazy, 'entry')).toBe('ok')
    // And a chunk the entry imports statically joins it, whatever it is called.
    const imported = run({ specs: { index: { bytes: 20_000, name: 'chart' }, 'index.html': { ...APP['index.html'], imports: ['_react-vendor.js', 'index'] } } })
    expect(rowOf(imported, 'entry').bytes).toBe(116_000)
    expect(rowOf(imported, 'entry').detail).toContain('(react-vendor, chart)')
  })

  test('an entry that imports nothing is its own file alone', () => {
    const alone = run({ specs: { 'index.html': { ...APP['index.html'], imports: [] } } })
    expect(rowOf(alone, 'entry').bytes).toBe(36_000)
    expect(rowOf(alone, 'entry').detail).toBe(fileOf('index.html'))
  })

  test('a run fails when any row fails, and not for a row that only warns', () => {
    // The entry grows with every closure it is part of, so a larger entry also fails the front page: count only that it fails.
    expect(run({ specs: sized('index.html', 110 * KB + 1) }).failed).toBeGreaterThanOrEqual(1)
    expect(run({ specs: sized('_three-vendor.js', 245 * KB + 1) }).failed).toBe(1)
    const warning = run({ specs: sized('_three-vendor.js', 245 * KB) })
    expect(warning.failed).toBe(0)
  })

  test('the front page is held to 154 KB of JavaScript (D-055), 37,400 B above its 116,600 B', () => {
    const grown = (extra: number) => statusOf(run({ specs: sized(FRONT, 10_000 + extra) }), 'front')
    expect(grown(13_400)).toBe('ok') // 130,000 B is the target itself
    expect(grown(13_401)).toBe('warn')
    expect(grown(37_400)).toBe('warn') // 154,000 B is the gate itself
    expect(grown(37_401)).toBe('FAIL')
  })

  test('the front page CSS has a gate of its own: 40 KB of it fails the CSS row and not the closure row', () => {
    const css = run({ specs: { 'index.html': { ...APP['index.html'], css: { 'assets/index.css': 40_000 } } } })
    expect(statusOf(css, 'css')).toBe('FAIL')
    expect(statusOf(css, 'front')).toBe('ok')
  })

  test('another route counts its CSS: 201 KB of JavaScript and CSS together is the gate (D-057)', () => {
    // Map is 113,500 B in the miniature, 500 of them its own chunk.
    const map = (bytes: number) => statusOf(run({ specs: sized('src/pages/Map.tsx', bytes) }), 'route:/map')
    expect(map(201 * KB - 113_000)).toBe('ok')
    expect(map(201 * KB - 113_000 + 1)).toBe('FAIL')
  })

  test('the pages that carry the item bank have a gate of their own, 210 KB (D-056), and every other route keeps 201 KB (D-057)', () => {
    const withPage = (pattern: string, page: string, bytes: number) => ({
      specs: {
        'index.html': { ...APP['index.html'], dyn: [...(APP['index.html'].dyn ?? []), `src/pages/${page}.tsx`] },
        [`src/pages/${page}.tsx`]: { bytes, name: page, dynamic: true, src: `src/pages/${page}.tsx`, imports: ['_react-vendor.js'] },
      },
      routes: [...ROUTES, { pattern, page }],
    })
    // The entry (36,000 B), react-vendor (60,000 B) and the entry's CSS (15,000 B) are 111,000 B before the page's own file.
    for (const [pattern, page] of [
      ['/today', 'Today'],
      ['/m/:module', 'Module'],
    ] as const) {
      const status = (bytes: number) => statusOf(run(withPage(pattern, page, bytes)), `route:${pattern}`)
      expect([pattern, status(210 * KB - 111_000)]).toEqual([pattern, 'ok'])
      expect([pattern, status(210 * KB - 111_000 + 1)]).toEqual([pattern, 'FAIL'])
      expect(rowOf(run(withPage(pattern, page, 1_000)), `route:${pattern}`).gate).toBe(210)
    }
    // Another page, and the lesson page that carries the registry too, keep the generic gate.
    expect(rowOf(run(withPage('/m/:module/:lesson', 'Lesson', 1_000)), 'route:/m/:module/:lesson').gate).toBe(201)
    expect(rowOf(run(), 'route:/map').gate).toBe(201)
    expect([budgetOfRoute(['/today']).gate, budgetOfRoute(['/m/:module']).gate, budgetOfRoute(['/m/:module/:lesson']).gate, budgetOfRoute(['/map']).gate]).toEqual([210, 210, 201, 201])
  })

  test('a scene fails above 40 KB, and a chunk that only 3D reaches counts against every scene that reaches it, not against post-processing', () => {
    // The scene is 3,000 B without TimeAxis.
    const timeAxis = (bytes: number) => run({ specs: sized('_TimeAxis.js', bytes) })
    expect(statusOf(timeAxis(40 * KB - 3_000), 'scene:loop')).toBe('ok')
    expect(statusOf(timeAxis(40 * KB - 3_000 + 1), 'scene:loop')).toBe('FAIL')
    expect(statusOf(timeAxis(40 * KB - 3_000 + 1), 'postfx')).toBe('ok')
  })

  test('three-vendor fails above 245 KB, and post-processing above 25 KB', () => {
    expect(statusOf(run({ specs: sized('_three-vendor.js', 245 * KB) }), 'three-vendor')).toBe('ok')
    expect(statusOf(run({ specs: sized('_three-vendor.js', 245 * KB + 1) }), 'three-vendor')).toBe('FAIL')
    expect(statusOf(run({ specs: sized('src/scene/postfx/postfx.ts', 25 * KB) }), 'postfx')).toBe('ok')
    expect(statusOf(run({ specs: sized('src/scene/postfx/postfx.ts', 25 * KB + 1) }), 'postfx')).toBe('FAIL')
  })

  test('a lesson fails above 40 KB, and so does a module', () => {
    expect(statusOf(run({ specs: sized(LESSON, 40 * KB) }), `lesson:tr2.l0-sample`)).toBe('ok')
    expect(statusOf(run({ specs: sized(LESSON, 40 * KB + 1) }), 'lesson:tr2.l0-sample')).toBe('FAIL')
    expect(statusOf(run({ specs: sized(MODULE, 40 * KB + 1) }), 'module:tr2')).toBe('FAIL')
  })

  test('the course index only warns above 6 KB: verify:content holds it to its cap', () => {
    const index = run({ specs: sized(INDEX_JSON, 6 * KB + 1) })
    expect(statusOf(index, 'index')).toBe('warn')
    expect(statusOf(run({ specs: sized(INDEX_JSON, 6 * KB) }), 'index')).toBe('ok')
    // It is part of the front page's closure, and the closure row counts it.
    expect(rowOf(index, 'front').bytes).toBe(116_600 - 600 + 6 * KB + 1)
    expect(index.failed).toBe(0)
  })

  test('a site over the 1 GB of Pages fails', () => {
    expect(statusOf(run({ site: { files: 9, bytes: 1_000_000_000 } }), 'site')).toBe('info')
    expect(statusOf(run({ site: { files: 9, bytes: 1_000_000_001 } }), 'site')).toBe('FAIL')
  })
})

describe('what a row waits for, and what fails it', () => {
  test('a page that is no longer lazy fails, naming the page', () => {
    const report = run({ specs: { 'src/pages/Map.tsx': null } })
    expect(statusOf(report, 'page:Map')).toBe('FAIL')
    expect(rowOf(report, 'page:Map').detail).toContain('src/pages/Map.tsx')
    expect(report.rows.some((row) => row.id === 'route:/map')).toBe(false)
  })

  test("finds a page that Rollup keyed by file: the entry's lazy import with the page's name", () => {
    const hoisted = run({
      specs: {
        'src/pages/Map.tsx': null,
        '_Map.js': { bytes: 500, name: 'Map', dynamic: true, imports: ['_react-vendor.js'], css: { 'assets/map.css': 2_000 } },
        'index.html': { ...APP['index.html'], dyn: [FRONT, '_Map.js', 'src/pages/Game.tsx'] },
      },
    })
    expect(rowOf(hoisted, 'route:/map').bytes).toBe(36_000 + 60_000 + 500 + 15_000 + 2_000)
  })

  test('two lazy imports of the entry with the page\'s name make it ambiguous, so it fails', () => {
    const twice = run({
      specs: {
        'src/pages/Map.tsx': null,
        '_Map-a.js': { bytes: 1, name: 'Map', dynamic: true },
        '_Map-b.js': { bytes: 1, name: 'Map', dynamic: true },
        'index.html': { ...APP['index.html'], dyn: [FRONT, '_Map-a.js', '_Map-b.js', 'src/pages/Game.tsx'] },
      },
    })
    expect(statusOf(twice, 'page:Map')).toBe('FAIL')
  })

  test('a route table without a lazy route for / fails the front page row', () => {
    const report = run({ routes: [{ pattern: '/map', page: 'Map' }] })
    expect(statusOf(report, 'front')).toBe('FAIL')
    expect(report.rows.some((row) => row.id === 'css')).toBe(false)
  })

  test('a game in the tree without a chunk fails, and the game page is measured alone', () => {
    const report = run({
      specs: { 'src/games/loop/Game.tsx': null, 'src/pages/Game.tsx': { ...APP['src/pages/Game.tsx'], dyn: [] }, 'src/games/loop/Scene3D.tsx': null },
      tree: { scenes: [] },
    })
    expect(statusOf(report, 'game:loop')).toBe('FAIL')
    expect(rowOf(report, 'game:loop').detail).toContain('src/games/loop/Game.tsx')
    expect(rowOf(report, 'route:/play/:game').bytes).toBe(36_000 + 60_000 + 800 + 15_000)
  })

  test('a game whose chunk Rollup keyed by file is found by its source', () => {
    const report = run({
      specs: {
        'src/games/loop/Game.tsx': null,
        '_Game-loop.js': { bytes: 4_000, name: 'Game', dynamic: true, src: 'src/games/loop/Game.tsx', imports: ['_session.js', '_stage-runtime.js', 'index.html'] },
      },
    })
    expect(rowOf(report, 'route:/play/loop').bytes).toBe(36_000 + 60_000 + 800 + 4_000 + 9_000 + 6_000 + 15_000)
  })

  test('a scene in the tree that is not a chunk of its own fails: its budget cannot be measured', () => {
    const report = run({ tree: { scenes: ['src/games/loop/Scene3D.tsx', 'src/games/pool/Scene3D.tsx'] } })
    expect(statusOf(report, 'scene:src/games/pool/Scene3D.tsx')).toBe('FAIL')
    expect(report.failed).toBe(1)
  })

  test('a scene of the scene kit is a scene too, its id is the name before Scene3D, and a shared kit chunk counts for each scene', () => {
    const report = run({
      specs: {
        'src/scene/SpecimenScene3D.tsx': { bytes: 1_000, name: 'SpecimenScene3D', dynamic: true, src: 'src/scene/SpecimenScene3D.tsx', imports: ['_TimeAxis.js', '_three-vendor.js'] },
      },
      tree: { scenes: ['src/games/loop/Scene3D.tsx', 'src/scene/SpecimenScene3D.tsx'] },
    })
    expect(rowOf(report, 'scene:specimen').label).toBe('scene-specimen')
    expect(rowOf(report, 'scene:specimen').bytes).toBe(13_000)
    expect(rowOf(report, 'scene:loop').bytes).toBe(15_000)
  })

  test('a chunk that a page also reaches is the site\'s, not the scene\'s', () => {
    // Make the Map page import TimeAxis: it is then loaded by a page without 3D, and the scene is only its own chunk and CSS.
    const report = run({ specs: { 'src/pages/Map.tsx': { ...APP['src/pages/Map.tsx'], imports: ['_react-vendor.js', '_TimeAxis.js'] } } })
    expect(rowOf(report, 'scene:loop').bytes).toBe(3_000)
  })

  test('3D scenes without a three-vendor chunk fail: three has been bundled into something else', () => {
    const inlined = run({
      specs: {
        '_three-vendor.js': null,
        '_TimeAxis.js': { ...APP['_TimeAxis.js'], imports: [], dyn: [] },
        'src/games/loop/Scene3D.tsx': { ...APP['src/games/loop/Scene3D.tsx'], imports: ['_react-vendor.js', '_TimeAxis.js'] },
        'src/scene/postfx/postfx.ts': null,
      },
    })
    expect(statusOf(inlined, 'three-vendor')).toBe('FAIL')
  })

  test('a build without 3D skips the rows for three-vendor and post-processing', () => {
    const flat = run({
      specs: {
        '_three-vendor.js': null,
        '_TimeAxis.js': null,
        'src/games/loop/Scene3D.tsx': null,
        'src/scene/postfx/postfx.ts': null,
        'src/games/loop/Game.tsx': { ...APP['src/games/loop/Game.tsx'], dyn: [] },
        [FRONT]: { ...APP[FRONT], dyn: [] },
      },
      tree: { scenes: [], postfx: false },
    })
    expect(statusOf(flat, 'three-vendor')).toBe('skip')
    expect(statusOf(flat, 'postfx')).toBe('skip')
    expect(flat.failed).toBe(0)
  })

  test("scene kit v1's props are measured alone in a scene-kit row, held to a scene's 40 KB, and counted again in every scene that reaches them", () => {
    const withKit = (bytes: number) =>
      run({
        specs: {
          '_scene-kit.js': { bytes, name: 'scene-kit', imports: ['_three-vendor.js', '_react-vendor.js'] },
          'src/games/loop/Scene3D.tsx': { ...APP['src/games/loop/Scene3D.tsx'], imports: [...(APP['src/games/loop/Scene3D.tsx'].imports ?? []), '_scene-kit.js'] },
        },
        tree: { sceneKit: true },
      })
    const fits = withKit(20 * KB)
    expect(statusOf(fits, 'scene-kit')).toBe('ok')
    expect(rowOf(fits, 'scene-kit').bytes).toBe(20 * KB)
    expect(rowOf(fits, 'scene:loop').bytes).toBe((rowOf(run(), 'scene:loop').bytes ?? 0) + 20 * KB)
    expect(statusOf(withKit(40 * KB + 1), 'scene-kit')).toBe('FAIL')
    // The props in the tree with no chunk of their own cannot be measured.
    expect(statusOf(run({ tree: { sceneKit: true } }), 'scene-kit')).toBe('FAIL')
    // A tree without them has no row.
    expect(run().rows.some((row) => row.id === 'scene-kit')).toBe(false)
  })

  test('post-processing in the tree without a chunk fails', () => {
    const report = run({ specs: { 'src/scene/postfx/postfx.ts': null, '_TimeAxis.js': { ...APP['_TimeAxis.js'], dyn: [] } } })
    expect(statusOf(report, 'postfx')).toBe('FAIL')
  })

  test('a worker is found by name in dist/assets, and held to its own gate: 60 KB and 40 KB', () => {
    const worker = (bytes: number, name = 'receipt.worker') => run({ tree: { workers: [name] }, assets: [`${name}-Cx9a1_Zk.js`], extra: { [`assets/${name}-Cx9a1_Zk.js`]: bytes } })
    expect(statusOf(worker(60 * KB), 'worker:receipt.worker')).toBe('ok')
    expect(statusOf(worker(60 * KB + 1), 'worker:receipt.worker')).toBe('FAIL')
    expect(statusOf(worker(40 * KB, 'forge.worker'), 'worker:forge.worker')).toBe('ok')
    expect(statusOf(worker(40 * KB + 1, 'forge.worker'), 'worker:forge.worker')).toBe('FAIL')
    expect(rowOf(worker(1_000), 'worker:receipt.worker').bytes).toBe(1_000)
  })

  test('a worker with a source and no bundle fails, and two bundles are ambiguous', () => {
    expect(statusOf(run({ tree: { workers: ['forge.worker'] } }), 'worker:forge.worker')).toBe('FAIL')
    const two = run({ assets: ['forge.worker-aaaa.js', 'forge.worker-bbbb.js'], extra: { 'assets/forge.worker-aaaa.js': 1, 'assets/forge.worker-bbbb.js': 1 } })
    expect(statusOf(two, 'worker:forge.worker')).toBe('FAIL')
    // A source map is not a bundle, and receipt.worker's name does not make forge.worker's.
    expect(statusOf(run({ assets: ['forge.worker-aaaa.js.map', 'receipt.worker-aaaa.js'], extra: { 'assets/receipt.worker-aaaa.js': 1 } }), 'worker:forge.worker')).toBe('skip')
  })

  test('a build without compiled content skips the lesson row', () => {
    const report = run({ specs: { [LESSON]: null, [MODULE]: null } })
    expect(statusOf(report, 'lesson')).toBe('skip')
  })

  test('a manifest whose entry is not the one chunk marked as an entry cannot be measured', () => {
    expect(() => checkBundle(inputOf({ specs: { 'index.html': { ...APP['index.html'], entry: false } } }))).toThrow('0 entry chunks')
    expect(() => checkBundle(inputOf({ specs: { 'index.html': { ...APP['index.html'], entry: false }, a: { bytes: 1, entry: true }, b: { bytes: 1, entry: true } } }))).toThrow('2 entry chunks')
    // index.html wins when it is an entry, as it is in every build of this app.
    expect(() => checkBundle(inputOf({ specs: { other: { bytes: 1, entry: true } } }))).not.toThrow()
  })

  test('a manifest with a dangling import cannot be measured', () => {
    expect(() => checkBundle(inputOf({ specs: { '_session.js': { ...APP['_session.js'], imports: ['_gone.js'] } } }))).toThrow(BundleError)
  })
})

describe('the document', () => {
  test('warns when the front page needs a file that index.html neither loads nor preloads', () => {
    const base = inputOf()
    const without = documentFor(base.manifest).loads.filter((file) => file !== fileOf('_session.js'))
    const late = checkBundle({ ...base, document: { ...documentFor(base.manifest), loads: without } })
    expect(statusOf(late, 'document-late')).toBe('warn')
    expect(rowOf(late, 'document-late').detail).toContain(fileOf('_session.js'))
    expect(late.failed).toBe(0)
  })

  test('warns when index.html loads a file outside the first-paint closure', () => {
    const base = inputOf()
    const stray = checkBundle({ ...base, document: { ...documentFor(base.manifest), loads: [...documentFor(base.manifest).loads, fileOf('_three-vendor.js')] } })
    expect(statusOf(stray, 'document-stray')).toBe('warn')
    expect(rowOf(stray, 'document-stray').detail).toContain(fileOf('_three-vendor.js'))
  })

  test('says nothing about a document that agrees with the closure, and nothing at all when there is no document', () => {
    expect(run().rows.some((row) => row.id.startsWith('document-'))).toBe(false)
    expect(run({ document: null }).rows.some((row) => row.id === 'document' || row.id === 'fonts')).toBe(false)
  })
})

describe('the lines', () => {
  const report = run()

  test('say the verdict, the figure in KB and in bytes, how far it sits from its gate and its target, and what it measured', () => {
    const line = lineOf(rowOf(report, 'entry'), 12)
    expect(line.startsWith('ok   entry closure')).toBe(true)
    expect(line).toContain('96.0 KB')
    expect(line).toContain('96,000 B')
    expect(line).toContain('[gate 110 KB, 14,000 B under; target 100 KB, 4,000 B under]')
    expect(line).toContain(fileOf('index.html'))
  })

  test('say how far over a gate a figure is, and a skipped row says why', () => {
    const over = run({ specs: sized('_three-vendor.js', 246 * KB) })
    expect(lineOf(rowOf(over, 'three-vendor'), 12)).toContain('[gate 245 KB, 1,000 B over]')
    expect(lineOf(rowOf(report, 'worker:forge.worker'), 12)).toBe('skip forge.worker  src/workers/forge.worker.ts does not exist yet')
  })

  test('the summary of a failing run counts the problems', () => {
    const over = run({ specs: sized('_three-vendor.js', 246 * KB) })
    expect(summaryOf(over)).toBe('verify:bundle failed: 1 problem (10 budgets gated, 0 over a target, 2 skipped)')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command, on a build on disk                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Bytes that gzip cannot shrink, from a fixed seed, so a file's gzip size is about its size. */
function noise(size: number, seed: number): Buffer {
  const bytes = Buffer.alloc(size)
  let state = seed
  for (let i = 0; i < size; i++) {
    state = (state * 1664525 + 1013904223) >>> 0
    bytes[i] = state >>> 24
  }
  return bytes
}

/** A tree and a build on disk: a route table with two lazy pages, a manifest, an index.html under a base path, and one font. */
function treeOnDisk(entryBytes: number, frontBytes = 200): { dir: string; dist: string } {
  const dir = mkdtempSync(path.join(scratch, 'tree-'))
  const dist = path.join(dir, 'dist')
  for (const folder of ['src', 'dist/assets', 'dist/.vite', 'dist/fonts']) mkdirSync(path.join(dir, folder), { recursive: true })
  writeFileSync(path.join(dir, 'src/routes.tsx'), "export const routes = [{ index: true, lazy: () => import('./pages/Front') }, { path: 'map', lazy: () => import('./pages/Map') }]\n")
  const manifest = {
    'index.html': { file: 'assets/index.js', isEntry: true, name: 'index', src: 'index.html', dynamicImports: ['_Front.js', 'src/pages/Map.tsx'], css: ['assets/index.css'] },
    '_Front.js': { file: 'assets/Front.js', name: 'Front', isDynamicEntry: true, imports: ['index.html'] },
    'src/pages/Map.tsx': { file: 'assets/Map.js', name: 'Map', src: 'src/pages/Map.tsx', isDynamicEntry: true, imports: ['index.html'] },
  }
  writeFileSync(path.join(dist, '.vite/manifest.json'), JSON.stringify(manifest))
  writeFileSync(path.join(dist, 'assets/index.js'), noise(entryBytes, 1))
  writeFileSync(path.join(dist, 'assets/Front.js'), noise(frontBytes, 2))
  writeFileSync(path.join(dist, 'assets/Map.js'), noise(200, 3))
  writeFileSync(path.join(dist, 'assets/index.css'), noise(300, 4))
  writeFileSync(path.join(dist, 'fonts/a.woff2'), noise(100, 5))
  writeFileSync(
    path.join(dist, 'index.html'),
    '<!doctype html><html><head><link rel="preload" href="/enginespace/fonts/a.woff2" as="font" crossorigin>' +
      '<script type="module" crossorigin src="/enginespace/assets/index.js"></script>' +
      '<link rel="modulepreload" crossorigin href="/enginespace/assets/Front.js">' +
      '<link rel="stylesheet" crossorigin href="/enginespace/assets/index.css"></head><body></body></html>',
  )
  return { dir, dist }
}

/** Runs `main` and collects what it prints. */
function command(argv: string[]): { status: number; lines: string[] } {
  const lines: string[] = []
  const status = main(argv, (line) => lines.push(line))
  return { status, lines }
}

describe('the command', () => {
  test('prints a line for each row and the verdict, and exits 0 on a build within its budgets', () => {
    const { dir } = treeOnDisk(5_000)
    const { status, lines } = command(['--root', dir])
    expect(status).toBe(0)
    expect(lines[0]).toContain('gzip by node:zlib')
    expect(lines.some((line) => line.startsWith('ok   entry closure'))).toBe(true)
    expect(lines.some((line) => line.startsWith('ok   route /map'))).toBe(true)
    expect(lines.some((line) => line.startsWith('skip receipt.worker'))).toBe(true)
    expect(lines.at(-1)).toMatch(/^verify:bundle passed: \d+ budgets gated, 0 over a target, \d+ skipped$/)
  })

  test('measures with gzip, one file at a time, and reads index.html\'s files from under a base path', () => {
    const { dir } = treeOnDisk(5_000)
    const { lines } = command(['--root', dir])
    const bytes = gzipSync(readFileSync(path.join(dir, 'dist/assets/index.js'))).length
    expect(bytes).toBeGreaterThan(5_000)
    expect(lines.find((line) => line.startsWith('ok   entry closure'))).toContain(`${bytes.toLocaleString('en-US')} B`)
    // The document's first-paint files, under /enginespace/, are the closure's, so there is nothing to warn about.
    expect(lines.some((line) => line.includes('document preloads'))).toBe(false)
    expect(lines.find((line) => line.startsWith('info fonts preloaded'))).toContain('1 face, 0.1 KB (100 B)')
  })

  test('exits 1 and says by how much when a gate is passed', () => {
    const { dir } = treeOnDisk(120_000)
    const { status, lines } = command(['--root', dir])
    expect(status).toBe(1)
    const line = lines.find((candidate) => candidate.startsWith('FAIL entry closure')) ?? ''
    expect(line).toMatch(/\[gate 110 KB, [\d,]+ B over; target 100 KB, [\d,]+ B over\]/)
    expect(lines.at(-1)).toMatch(/^verify:bundle failed: \d+ problems?/)
  })

  test('lists the files of a row that fails, largest first, so the cause is on the screen', () => {
    // The entry alone is under its gate, and the front page's closure (the entry and the page) is over its own.
    const { dir } = treeOnDisk(100_000, 54_000)
    const { lines } = command(['--root', dir])
    const at = lines.findIndex((candidate) => candidate.startsWith('FAIL front page first-paint JS'))
    expect(at).toBeGreaterThan(0)
    expect(lines.slice(at + 1, at + 3).map((line) => /^\s+([\d.]+) KB {2}(assets\/\S+)$/.exec(line)?.slice(1))).toEqual([
      [(gzipSync(readFileSync(path.join(dir, 'dist/assets/index.js'))).length / 1000).toFixed(1), 'assets/index.js'],
      [(gzipSync(readFileSync(path.join(dir, 'dist/assets/Front.js'))).length / 1000).toFixed(1), 'assets/Front.js'],
    ])
  })

  test('reads another build with --dist', () => {
    const { dir, dist } = treeOnDisk(5_000)
    expect(command(['--root', dir, '--dist', dist]).status).toBe(0)
    expect(command(['--root', dir, '--dist', path.join(dir, 'nowhere')]).status).toBe(1)
  })

  test('exits 1 with a message that says to build first when there is no build', () => {
    const { dir } = treeOnDisk(5_000)
    rmSync(path.join(dir, 'dist'), { recursive: true })
    const { status, lines } = command(['--root', dir])
    expect(status).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('run `npm run build` first')
  })

  test('exits 1 when the manifest names a file that is not in dist', () => {
    const { dir, dist } = treeOnDisk(5_000)
    rmSync(path.join(dist, 'assets/Map.js'))
    const { status, lines } = command(['--root', dir])
    expect(status).toBe(1)
    expect(lines.at(-1)).toContain('Map.js')
  })

  test('exits 1 when there is no route table to read the pages from', () => {
    const { dir } = treeOnDisk(5_000)
    rmSync(path.join(dir, 'src/routes.tsx'))
    expect(command(['--root', dir]).status).toBe(1)
  })

  test('exits 2 and prints the usage for an argument it does not know', () => {
    for (const argv of [['--nope'], ['--dist'], ['dist'], ['--root', 'x', '--dist']]) {
      const { status, lines } = command(argv)
      expect(status).toBe(2)
      expect(lines).toEqual(['usage: bun scripts/verify-bundle.ts [--dist <dir>] [--root <dir>]'])
    }
  })

  test('runs as a process, which is how the registry starts it, and its exit status is the verdict', () => {
    const { dir } = treeOnDisk(5_000)
    const start = () => spawnSync(process.execPath, [path.join(root, 'scripts/verify-bundle.ts'), '--root', dir], { cwd: dir, encoding: 'utf8' })
    const ok = start()
    expect(ok.status).toBe(0)
    expect(ok.stdout).toContain('verify:bundle passed')
    writeFileSync(path.join(dir, 'dist/assets/index.js'), noise(120_000, 9))
    const failed = start()
    expect(failed.status).toBe(1)
    expect(failed.stdout).toContain('FAIL entry closure')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The real build                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the real build', () => {
  let dist = ''
  let manifest: Manifest = {}
  let report: Report
  let lines: string[] = []
  let status = 0

  beforeAll(() => {
    dist = path.join(scratch, 'app')
    const vite = path.join(root, 'node_modules/vite/bin/vite.js')
    const build = spawnSync('node', [vite, 'build', '--outDir', dist, '--emptyOutDir'], { cwd: root, encoding: 'utf8', env: { ...process.env, VITE_BASE: '/' } })
    if (build.status !== 0) throw new Error(`vite build exited with ${build.status}:\n${build.stdout}${build.stderr}`)
    manifest = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8')) as Manifest
    report = checkBundle(readInput(root, dist))
    ;({ status, lines } = command(['--dist', dist]))
  }, 120_000)

  const gzipOf = (file: string): number => gzipSync(readFileSync(path.join(dist, file))).length

  test("measures the entry as the gzip size of the files it reaches by static imports, react-vendor among them", () => {
    const seen = new Set<string>()
    const visit = (key: string) => {
      if (seen.has(key)) return
      seen.add(key)
      for (const imported of manifest[key].imports ?? []) visit(imported)
    }
    visit('index.html')
    const files = [...new Set([...seen].map((key) => manifest[key].file))]
    expect(files.length).toBeGreaterThanOrEqual(2)
    expect(files.some((file) => /\/react-vendor-/.test(file))).toBe(true)
    expect(rowOf(report, 'entry').bytes).toBe(files.reduce((total, file) => total + gzipOf(file), 0))
    // It is more than the entry's own file, which is what the row used to measure.
    expect(rowOf(report, 'entry').bytes).toBeGreaterThan(gzipOf(manifest['index.html'].file))
    expect(filesIn(rowOf(report, 'entry'))).toEqual([...files].sort())
  })

  test('has a row for every budget of ARCHITECTURE §11.1 that the app already has, and none for a page or a game that went missing', () => {
    const ids = report.rows.map((row) => row.id)
    for (const id of ['entry', 'front', 'css', 'three-vendor', 'scene:loop', 'postfx', 'lesson:tr2.l0-sample']) expect(ids).toContain(id)
    expect(statusOf(report, 'three-vendor')).not.toBe('skip')
    // A row for each lazy page but the front page's (the Trace Room is two routes and one page), the game page's for each game.
    const pages = new Set(routesIn(readFileSync(path.join(root, 'src/routes.tsx'), 'utf8')).filter((route) => route.pattern !== '/').map((route) => route.page))
    expect(ids.filter((id) => id.startsWith('route:')).length).toBeGreaterThanOrEqual(pages.size)
    expect(report.rows.filter((row) => row.id.startsWith('page:') || row.id.startsWith('game:'))).toEqual([])
  })

  test("counts the front page's closure as the files of the chunks it reaches by static imports, the course index among them", () => {
    const front = Object.keys(manifest).find((key) => manifest[key].name === 'Front' && manifest[key].isDynamicEntry === true) as string
    const seen = new Set<string>()
    const visit = (key: string) => {
      if (seen.has(key)) return
      seen.add(key)
      for (const imported of manifest[key].imports ?? []) visit(imported)
    }
    for (const start of ['index.html', front, INDEX_JSON]) visit(start)
    const js = [...new Set([...seen].map((key) => manifest[key].file))]
    expect(rowOf(report, 'front').bytes).toBe(js.reduce((total, file) => total + gzipOf(file), 0))
    const css = [...new Set([...seen].flatMap((key) => manifest[key].css ?? []))]
    expect(rowOf(report, 'css').bytes).toBe(css.reduce((total, file) => total + gzipOf(file), 0))
    // The 3D never loads with the first paint.
    expect(js.join()).not.toContain('three-vendor')
  })

  test("agrees with index.html on what the first paint loads: the closure is the document's script, preloads and stylesheet", () => {
    expect(report.rows.filter((row) => row.id.startsWith('document-'))).toEqual([])
    expect(readFileSync(path.join(dist, 'index.html'), 'utf8')).toContain('rel="modulepreload"')
  })

  test('puts three in three-vendor alone, and keeps three, the scenes and post-processing out of every route', () => {
    const vendor = Object.keys(manifest).find((key) => manifest[key].name === 'three-vendor') as string
    expect(rowOf(report, 'three-vendor').parts.map((part) => part.file)).toEqual([manifest[vendor].file])
    for (const row of report.rows.filter((candidate) => candidate.id.startsWith('route:'))) {
      expect(filesIn(row).join(), row.id).not.toMatch(/three-vendor|Scene3D|postfx/)
    }
  })

  test('prints one line per row and ends with its verdict, and exits 1 exactly when a row fails', () => {
    const verdict = lines.at(-1) ?? ''
    expect(lines.filter((line) => /^(ok|warn|FAIL|info|skip) /.test(line)).length).toBe(report.rows.length)
    expect(status).toBe(report.failed > 0 ? 1 : 0)
    expect(verdict.startsWith(report.failed > 0 ? 'verify:bundle failed' : 'verify:bundle passed')).toBe(true)
  })
})
