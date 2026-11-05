/*
 * verify:bundle (ARCHITECTURE §6.10, §10.2, §11.1; W0-T20). The budget gate: it walks the manifest of the build and holds each
 * closure to its gzip budget in §11.1, and prints every figure with its gate and its target.
 *
 *   bun scripts/verify-bundle.ts [--dist <dir>] [--root <dir>]
 *
 * Run it after `npm run build` (it is a `build` gate: ci.yml runs it behind the build). `--dist` reads another build than
 * <root>/dist, and `--root` another tree than this checkout: tests/bundle gives it fixtures.
 *
 * How a size is measured.
 *   - A size is gzip bytes, one file at a time (a server compresses each file by itself), by node:zlib's gzipSync at its default
 *     level, which is the call kernelspace's gate makes. Bun runs the gate (the registry starts it with Bun, which CI pins), and
 *     Bun's zlib is not Node's: it comes out about 1% larger than the figures that Vite's build log prints, which Node compresses
 *     [measured 2026-11-04 at 0a5ccf2: the entry chunk is 37,316 B under Bun 1.3.14 and 36,910 B under Node, and three-vendor is
 *     238,603 B and 235,580 B]. A gate that over-reports a little is the safe side, and the figure is the same on every machine that
 *     has the pinned Bun.
 *   - A KB is 1,000 bytes, as in Vite's log and in the kernelspace figures that §11.1's budgets derive from. Every row prints its
 *     bytes beside the KB.
 *   - A closure is a chunk and everything it imports statically, over the manifest's `imports`. A dynamic import is not followed:
 *     it is a lazy chunk with a row of its own, or it loads on demand.
 *
 * The rows (each is [estimated] until W0-T24 froze it in DECISIONS, D-023). A gate fails the run above it. A target only warns.
 *   entry          the entry chunk and what it imports statically, JavaScript only: its own     gate 110, target 100
 *                  file and react-vendor (React, ReactDOM and the stores), which every page loads before its own code. A§11.1 derived
 *                  the figure from kernelspace's entry, a single file that carried React, so the row counts that closure and not the
 *                  entry's own file (D-023, the W1 carry-over).
 *   front page     the JavaScript of the entry, the front page's chunk and the course index,    gate 152 (D-054), target 130
 *                  with their static imports (A§6.10: "the entry, the `front` route, The Loop's 2D view, the step-loop core and
 *                  the content index"). The index is a lazy chunk, but the page's loader awaits it before it paints.
 *   CSS            the stylesheets of that same closure (what the document links).              gate 30, target 20
 *                  A§11.1 gives CSS its own row, so the closure row above counts JavaScript only.
 *   other routes   for every other lazy page of the route table, its chunk and the entry with    gate 200
 *                  their static imports, JavaScript and CSS together, which is kernelspace's `/boot` and `/today` figure and the
 *                  way D-051 recorded the closures. A game's page counts its game's chunk too: that is what a learner downloads to
 *                  play. A scene, the lesson and module JSON are lazy and have rows of their own.
 *   three-vendor   the chunk's own file.                                                        gate 245
 *   scene-<id>     a scene's own chunk, the CSS it names, and the chunks it reaches that only    gate 40 each
 *                  3D code reaches: not the entry, not a page or a game, not `three-vendor` and not `postfx`.
 *   scene-kit      scene kit v1's props (src/scene/props), the chunk every 3D game that dresses  gate 40
 *                  its kitchen shares over three-vendor (vite.config.ts). Its own row measures it alone; a scene's row that
 *                  reaches it counts it too.
 *   postfx         the chunk's own file.                                                        gate 25
 *   workers        `receipt.worker` and `forge.worker`: Vite lists no worker in the manifest,   gate 60 and 40
 *                  so the gate finds the bundle by name in dist/assets.
 *   lesson JSON    each lesson's chunk, which is the JSON as a module (and each module's, A§4.6). gate 40 each
 * A row waits for what it measures. A worker or post-processing whose source is not in the tree yet is skipped, and so is
 * three-vendor in a build with no 3D. A worker, a scene, a game or post-processing whose source is in the tree and has no chunk
 * fails, because its budget cannot be measured. The gate also prints, without a verdict: the document, the fonts it preloads, the
 * course index (A§4.6: 6 KB) and the size of the site against Pages' cap.
 *
 * Exit status: 0 when no row fails, 1 when one does (or the build cannot be read), 2 for a usage error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

export const ROOT = path.resolve(import.meta.dirname, '..')

/** 1 KB, as Vite prints it and as the kernelspace figures behind §11.1 count it. */
export const KB = 1000

/** The budgets of ARCHITECTURE §11.1 in KB of gzip, every one [estimated] (D-023). `target` only warns. */
export const BUDGETS = {
  entry: { gate: 110, target: 100 },
  front: { gate: 152, target: 130 },
  css: { gate: 30, target: 20 },
  route: { gate: 200 },
  threeVendor: { gate: 245 },
  scene: { gate: 40 },
  postfx: { gate: 25 },
  /** A§11.1: `receipt.worker` 60 KB, `forge.worker` 40 KB. */
  workers: { 'receipt.worker': 60, 'forge.worker': 40 },
  /** A§11.1 and A§4.6: a lesson's JSON, and a module's. */
  page: { gate: 40 },
  /** A§4.6: the course index. verify:content holds it to its cap when it compiles; here it is reported. */
  index: { target: 6 },
  /** The site on Pages is capped at 1 GB (A§11.1, games-3d research, checked 2026-10-03). */
  siteBytes: 1_000_000_000,
} as const

/** `/play/:game` is the page `Game`, which loads the game of its id on demand. */
const GAME_PAGE = 'Game'
/** The course index, a lazy chunk that the front page's loader awaits before it paints (A§6.10, scripts/pages/front-shell.ts). */
const COURSE_INDEX = 'src/content/generated/index.json'
const LESSONS = 'src/content/generated/lessons/'
const MODULES = 'src/content/generated/modules/'
/** `src/games/<id>/Scene3D.tsx` is a game's scene, and `src/scene/<Name>Scene3D.tsx` is one of the scene kit's own (the specimen). */
const SCENE_SOURCE = /^src\/(?:games\/([^/]+)\/|scene\/(\w*))Scene3D\.tsx$/

/* ------------------------------------------------------------------------------------------------------------------ */
/* What the gate reads                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One chunk of dist/.vite/manifest.json. */
export interface Chunk {
  file: string
  name?: string
  /** The source of the chunk's entry module: a lazy page, a scene. A chunk that Rollup shares between others has none. */
  src?: string
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: readonly string[]
  dynamicImports?: readonly string[]
  css?: readonly string[]
}
export type Manifest = Readonly<Record<string, Chunk>>

/** A lazy route of the route table: `/m/:module` is the page `Module`. */
export interface Route {
  pattern: string
  page: string
}

/** What the working tree has, so a chunk that is missing can be told from one that is not built yet. */
export interface Tree {
  /** The ids of `src/games/<id>/Game.tsx`. */
  games: readonly string[]
  /** The sources of every scene: `src/games/loop/Scene3D.tsx`. */
  scenes: readonly string[]
  /** The workers that have a source in `src/workers/`: `receipt.worker`. */
  workers: readonly string[]
  /** Whether the scene kit has post-processing (`src/scene/postfx/`). */
  postfx: boolean
  /** Whether the scene kit has its props (`src/scene/props/`, scene kit v1). */
  sceneKit?: boolean
}

/** index.html, the document of the front page. */
export interface Document {
  /** Its own gzip bytes. */
  gzip: number
  /** The files of dist/ that it loads or preloads at first paint: the module script, the preloaded modules and the stylesheets. */
  loads: readonly string[]
  /** The fonts it preloads, with their bytes as served (woff2 is already compressed). */
  fonts: readonly { file: string; bytes: number }[]
}

export interface Input {
  manifest: Manifest
  /** The gzip bytes of one file of dist/, named from dist/: `assets/index-x.js`. */
  gzip(file: string): number
  routes: readonly Route[]
  tree: Tree
  document: Document | null
  /** The file names in dist/assets, which is where a worker bundle is found. */
  assets: readonly string[]
  /** Everything under dist/, which Pages would publish. */
  site: { files: number; bytes: number }
}

/** The build cannot be read (a dangling import, no entry): the gate reports it and fails. */
export class BundleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleError'
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Walking the manifest                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The manifest keys of everything `roots` imports statically, themselves included, in visit order. */
export function closureOf(manifest: Manifest, roots: readonly string[]): string[] {
  const seen = new Set<string>()
  const visit = (key: string, from: string | null) => {
    if (seen.has(key)) return
    const chunk = manifest[key]
    if (chunk === undefined) throw new BundleError(`the manifest has no chunk ${key}${from === null ? '' : `, which ${from} imports`}`)
    seen.add(key)
    for (const imported of chunk.imports ?? []) visit(imported, key)
  }
  for (const root of roots) visit(root, null)
  return [...seen]
}

/** The files of some chunks, each once, JavaScript apart from CSS, in the order of the chunks. */
export function filesOf(manifest: Manifest, keys: readonly string[]): { js: string[]; css: string[] } {
  const js = new Set<string>()
  const css = new Set<string>()
  for (const key of keys) {
    js.add(manifest[key].file)
    for (const file of manifest[key].css ?? []) css.add(file)
  }
  return { js: [...js], css: [...css] }
}

/** The entry of the build: `index.html` when it is one, or the one chunk that the manifest marks as an entry. */
function entryKeyOf(manifest: Manifest): string {
  if (manifest['index.html']?.isEntry === true) return 'index.html'
  const entries = Object.keys(manifest).filter((key) => manifest[key].isEntry === true)
  if (entries.length !== 1) throw new BundleError(`the manifest has ${entries.length} entry chunks, and the gate measures one: is this the app's build?`)
  return entries[0]
}

/**
 * The chunk of a lazy page. It is keyed by its source, unless another chunk shares code with it: Rollup then keeps the shared code in
 * the page's chunk and keys it by file, with no source, so the page is found by its name among what the entry imports lazily.
 */
function pageKeyOf(manifest: Manifest, entry: string, page: string): string | null {
  const direct = `src/pages/${page}.tsx`
  if (manifest[direct] !== undefined) return direct
  const hoisted = (manifest[entry].dynamicImports ?? []).filter((key) => manifest[key]?.name === page)
  return new Set(hoisted).size === 1 ? hoisted[0] : null
}

/** The lazy routes in `src/routes.tsx`: `{ path: 'map', lazy: () => import('./pages/Map') }`, and the index route for `/`. */
export function routesIn(source: string): Route[] {
  const routes = [...source.matchAll(/\{\s*(?:index:\s*true|path:\s*'([^']*)')\s*,\s*lazy:\s*\(\)\s*=>\s*import\('\.\/pages\/(\w+)'\)/g)].map((match) => ({
    pattern: match[1] === undefined ? '/' : `/${match[1]}`,
    page: match[2],
  }))
  const lazy = [...source.matchAll(/\blazy:/g)].length
  if (routes.length === 0 || routes.length !== lazy) {
    throw new BundleError(
      `src/routes.tsx has ${lazy} lazy routes and the gate reads ${routes.length}: it reads \`{ path: '…', lazy: () => import('./pages/Name') }\`, so a lazy route in another shape is a page with no budget. Make the route fit, or teach routesIn the new shape`,
    )
  }
  return routes
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The report                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Status = 'ok' | 'warn' | 'FAIL' | 'info' | 'skip'

export interface Row {
  /** `entry`, `front`, `css`, `route:/map`, `three-vendor`, `scene:loop`, `postfx`, `worker:forge.worker`, `lesson:tr2.l0-sample` … */
  id: string
  status: Status
  label: string
  /** The measured gzip bytes, or null for a row that measures nothing. */
  bytes: number | null
  /** KB; the run fails above it. */
  gate: number | null
  /** KB; the row warns above it. */
  target: number | null
  /** What was measured, or why nothing was. */
  detail: string
  /** The files that add up to `bytes`, largest first. Printed for the front page and for a row that fails. */
  parts: readonly { file: string; bytes: number }[]
}

export interface Report {
  rows: Row[]
  failed: number
}

const kb = (bytes: number): string => `${(bytes / KB).toFixed(1)} KB`
const grouped = (bytes: number): string => bytes.toLocaleString('en-US')
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

export function checkBundle(input: Input): Report {
  const { manifest, tree } = input
  const rows: Row[] = []
  const entry = entryKeyOf(manifest)
  const sizeOf = (files: readonly string[]) => files.map((file) => ({ file, bytes: input.gzip(file) })).sort((a, b) => b.bytes - a.bytes)
  const sum = (parts: readonly { bytes: number }[]) => parts.reduce((total, part) => total + part.bytes, 0)

  /** A row for a size held to a gate and a target. */
  const measured = (id: string, label: string, parts: readonly { file: string; bytes: number }[], limits: { gate?: number; target?: number }, detail: string): Row => {
    const bytes = sum(parts)
    const gate = limits.gate ?? null
    const target = limits.target ?? null
    const status: Status = gate !== null && bytes > gate * KB ? 'FAIL' : target !== null && bytes > target * KB ? 'warn' : gate === null && target === null ? 'info' : 'ok'
    const row: Row = { id, status, label, bytes, gate, target, detail, parts }
    rows.push(row)
    return row
  }
  const note = (id: string, status: 'FAIL' | 'info' | 'skip' | 'warn', label: string, detail: string): void => {
    rows.push({ id, status, label, bytes: null, gate: null, target: null, detail, parts: [] })
  }

  /* The entry: its own file and what it imports statically (react-vendor), which every page loads before its own code. */
  const entryKeys = closureOf(manifest, [entry])
  const entryImports = entryKeys.filter((key) => key !== entry).map((key) => manifest[key].name ?? key)
  measured(
    'entry',
    'entry closure',
    sizeOf(filesOf(manifest, entryKeys).js),
    BUDGETS.entry,
    `${manifest[entry].file}${entryImports.length === 0 ? '' : ` with the chunks it imports statically (${entryImports.join(', ')})`}`,
  )

  /* The pages of the route table. */
  const pageKeys = new Map<string, string>()
  for (const { page } of input.routes) {
    if (pageKeys.has(page)) continue
    const key = pageKeyOf(manifest, entry, page)
    if (key === null) note(`page:${page}`, 'FAIL', `page ${page}`, `the manifest has no chunk for src/pages/${page}.tsx: is the route still lazy (\`lazy: () => import('./pages/${page}')\`)?`)
    else pageKeys.set(page, key)
  }

  /* The games, each with the chunk the games registry loads for it. */
  const gameKeys = new Map<string, string>()
  for (const id of tree.games) {
    const source = `src/games/${id}/Game.tsx`
    const key = manifest[source] !== undefined ? source : Object.keys(manifest).find((candidate) => manifest[candidate].src === source)
    if (key === undefined) note(`game:${id}`, 'FAIL', `game ${id}`, `${source} is in the tree and has no chunk in the manifest, so ${id}'s figure would leave its game out`)
    else gameKeys.set(id, key)
  }

  /* The front page: the JavaScript of what it needs to paint, and the CSS the document links. */
  const frontRoute = input.routes.find((route) => route.pattern === '/')
  const frontKey = frontRoute === undefined ? undefined : pageKeys.get(frontRoute.page)
  let frontFiles: { js: string[]; css: string[] } | null = null
  if (frontRoute === undefined) note('front', 'FAIL', 'front page', "the route table has no lazy route for '/'")
  else if (frontKey !== undefined) {
    const roots = [entry, frontKey, ...(manifest[COURSE_INDEX] === undefined ? [] : [COURSE_INDEX])]
    const keys = closureOf(manifest, roots)
    frontFiles = filesOf(manifest, keys)
    const js = sizeOf(frontFiles.js)
    measured('front', 'front page first-paint JS', js, BUDGETS.front, `${plural(keys.length, 'chunk')}: the entry, the ${frontRoute.page} page and the course index, with their static imports`)
    measured('css', 'front page CSS', sizeOf(frontFiles.css), BUDGETS.css, plural(frontFiles.css.length, 'stylesheet'))
    measured('front-total', 'front page JS + CSS', sizeOf([...frontFiles.js, ...frontFiles.css]), {}, 'the two rows above together: what the first paint downloads besides the document and the fonts')
  }

  /* Every other page of the route table. */
  const patterns = new Map<string, string[]>()
  for (const { pattern, page } of input.routes) if (page !== frontRoute?.page) patterns.set(page, [...(patterns.get(page) ?? []), pattern])
  for (const [page, routes] of patterns) {
    const key = pageKeys.get(page)
    if (key === undefined) continue
    // `/play/:game` loads its game on demand, and the game is most of the page: each game gets its own row.
    const variants = page === GAME_PAGE && gameKeys.size > 0 ? [...gameKeys].map(([id, game]) => ({ id: `/play/${id}`, label: `/play/${id}`, extra: [game] })) : [{ id: routes[0], label: routes.join(', '), extra: [] }]
    for (const { id, label, extra } of variants) {
      const files = filesOf(manifest, closureOf(manifest, [entry, key, ...extra]))
      const parts = sizeOf([...files.js, ...files.css])
      measured(`route:${id}`, `route ${label}`, parts, BUDGETS.route, `${page} page${extra.length > 0 ? ' and its game' : ''}, JavaScript ${kb(sum(parts.filter((part) => files.js.includes(part.file))))} and CSS ${kb(sum(parts.filter((part) => files.css.includes(part.file))))}`)
    }
  }

  /* What only 3D reaches: the entry, the pages and the games are the site that loads without it. */
  const threeKey = Object.keys(manifest).find((key) => manifest[key].name === 'three-vendor')
  const postfxKey = Object.keys(manifest).find((key) => manifest[key].name === 'postfx')
  const flat = new Set(closureOf(manifest, [entry, ...pageKeys.values(), ...gameKeys.values()]))

  /* Scenes. */
  const scenes = Object.keys(manifest)
    .map((key) => ({ key, source: manifest[key].src ?? key }))
    .filter(({ key, source }) => manifest[key].isDynamicEntry === true && SCENE_SOURCE.test(source))
  for (const { key, source } of scenes) {
    const match = SCENE_SOURCE.exec(source)
    const id = match?.[1] ?? (match?.[2] ?? '').toLowerCase()
    const own = [key]
    const shared = closureOf(manifest, [key]).filter((candidate) => candidate !== key && !flat.has(candidate) && candidate !== threeKey && candidate !== postfxKey)
    const files = filesOf(manifest, [...own, ...shared])
    const parts = sizeOf([...files.js, ...files.css])
    const sharedNames = shared.map((candidate) => manifest[candidate].name ?? candidate)
    measured(
      `scene:${id}`,
      `scene-${id}`,
      parts,
      BUDGETS.scene,
      `${manifest[key].file}${shared.length > 0 ? ` with the chunks only 3D reaches (${sharedNames.join(', ')})` : ''}${files.css.length > 0 ? ' and its CSS' : ''}`,
    )
  }
  const found = new Set(scenes.map(({ source }) => source))
  for (const source of tree.scenes.filter((candidate) => !found.has(candidate))) {
    note(`scene:${source}`, 'FAIL', source, 'is in the tree and is not a lazy chunk of its own in the manifest, so its budget cannot be measured: is it imported lazily, and is it a Scene3D.tsx?')
  }

  /* Scene kit v1's props: one chunk every dressed scene shares, measured alone. */
  const kitKey = Object.keys(manifest).find((key) => manifest[key].name === 'scene-kit')
  if (kitKey !== undefined) {
    const files = filesOf(manifest, [kitKey])
    measured('scene-kit', 'scene-kit (the props)', sizeOf([...files.js, ...files.css]), BUDGETS.scene, `${manifest[kitKey].file}: src/scene/props, which every scene that reaches it counts again`)
  } else if (tree.sceneKit === true) note('scene-kit', 'FAIL', 'scene-kit', 'src/scene/props is in the tree and the manifest has no scene-kit chunk, so its budget cannot be measured (vite.config.ts manualChunks)')

  /* three-vendor and postfx. */
  if (threeKey !== undefined) measured('three-vendor', 'three-vendor', sizeOf([manifest[threeKey].file]), BUDGETS.threeVendor, `three and react-three-fiber, ${manifest[threeKey].file}`)
  else if (scenes.length > 0) note('three-vendor', 'FAIL', 'three-vendor', 'the build has 3D scenes and no three-vendor chunk: three has been bundled into something else (vite.config.ts manualChunks)')
  else note('three-vendor', 'skip', 'three-vendor', 'no 3D in this build')
  if (postfxKey !== undefined) {
    const files = filesOf(manifest, [postfxKey])
    measured('postfx', 'postfx', sizeOf([...files.js, ...files.css]), BUDGETS.postfx, manifest[postfxKey].file)
  } else if (tree.postfx) note('postfx', 'FAIL', 'postfx', 'src/scene/postfx is in the tree and the manifest has no postfx chunk, so its budget cannot be measured')
  else note('postfx', 'skip', 'postfx', 'src/scene/postfx does not exist yet')

  /* Workers. Vite does not list them in the manifest: each is dist/assets/<name>-<hash>.js. */
  for (const [name, gate] of Object.entries(BUDGETS.workers)) {
    const files = input.assets.filter((asset) => new RegExp(`^${name.replace('.', '\\.')}-[\\w-]+\\.js$`).test(asset))
    if (files.length === 1) measured(`worker:${name}`, name, sizeOf([`assets/${files[0]}`]), { gate }, `assets/${files[0]}`)
    else if (files.length > 1) note(`worker:${name}`, 'FAIL', name, `dist/assets has ${files.length} bundles for it (${files.join(', ')}), and the gate measures one`)
    else if (tree.workers.includes(name)) note(`worker:${name}`, 'FAIL', name, `src/workers/${name}.ts is in the tree and dist/assets has no ${name}-<hash>.js, so its budget cannot be measured`)
    else note(`worker:${name}`, 'skip', name, `src/workers/${name}.ts does not exist yet`)
  }

  /* The compiled content: a lesson's JSON and a module's are lazy chunks, 40 KB each. */
  const content = Object.keys(manifest).filter((key) => key.startsWith(LESSONS) || key.startsWith(MODULES))
  for (const key of content) {
    const lesson = key.startsWith(LESSONS)
    const id = key.slice((lesson ? LESSONS : MODULES).length).replace(/\.json$/, '')
    measured(`${lesson ? 'lesson' : 'module'}:${id}`, `${lesson ? 'lesson' : 'module'} JSON ${id}`, sizeOf([manifest[key].file]), BUDGETS.page, manifest[key].file)
  }
  if (content.length === 0) note('lesson', 'skip', 'lesson JSON', 'the build has no compiled lesson')
  if (manifest[COURSE_INDEX] !== undefined) {
    measured('index', 'course index', sizeOf([manifest[COURSE_INDEX].file]), BUDGETS.index, `${manifest[COURSE_INDEX].file}, which the front page's loader awaits (counted in its closure)`)
  }

  /* What the first paint also downloads. */
  const document = input.document
  if (document !== null) {
    note('document', 'info', 'document index.html', `${kb(document.gzip)} (${grouped(document.gzip)} B) gzip`)
    const fonts = document.fonts.reduce((total, font) => total + font.bytes, 0)
    note('fonts', 'info', 'fonts preloaded', `${plural(document.fonts.length, 'face')}, ${kb(fonts)} (${grouped(fonts)} B) as served`)
    if (frontFiles !== null) {
      const closure = new Set([...frontFiles.js, ...frontFiles.css])
      const loads = new Set(document.loads)
      const late = [...closure].filter((file) => !loads.has(file))
      const stray = [...loads].filter((file) => !closure.has(file))
      if (late.length > 0) note('document-late', 'warn', 'document preloads', `the first-paint closure has files that index.html neither loads nor preloads, so they wait for the chunk that imports them: ${late.join(', ')}`)
      if (stray.length > 0) note('document-stray', 'warn', 'document preloads', `index.html loads files outside the first-paint closure: ${stray.join(', ')}`)
    }
  }
  const site = input.site
  const over = site.bytes > BUDGETS.siteBytes
  note('site', over ? 'FAIL' : 'info', 'site size', `${(site.bytes / 1_000_000).toFixed(2)} MB raw (${grouped(site.bytes)} B) in ${plural(site.files, 'file')} under dist/; Pages publishes at most 1 GB${over ? ' and this is over' : ''}`)

  return { rows, failed: rows.filter((row) => row.status === 'FAIL').length }
}

/** How far a figure sits from a limit: "410 B under" or "19,590 B over". */
const marginOf = (bytes: number, limit: number): string => `${grouped(Math.abs(bytes - limit * KB))} B ${bytes <= limit * KB ? 'under' : 'over'}`

/** One row as a line: the verdict, the budget, the figure, how it stands against its gate and its target, and what it measured. */
export function lineOf(row: Row, width: number): string {
  const figure = row.bytes === null ? '' : `${kb(row.bytes).padStart(9)} (${grouped(row.bytes).padStart(7)} B)`
  const limits =
    row.bytes === null
      ? []
      : [row.gate === null ? '' : `gate ${row.gate} KB, ${marginOf(row.bytes, row.gate)}`, row.target === null ? '' : `target ${row.target} KB, ${marginOf(row.bytes, row.target)}`].filter((part) => part !== '')
  return [`${row.status.padEnd(4)} ${row.label.padEnd(width)}`, figure, limits.length === 0 ? '' : `[${limits.join('; ')}]`, row.detail].filter((part) => part !== '').join('  ')
}

/** The breakdown of a closure, for the rows whose sum is worth reading: the front page, and anything that fails. */
function breakdown(row: Row): string[] {
  if (row.parts.length < 2 || (row.id !== 'front' && row.status !== 'FAIL')) return []
  return row.parts.map((part) => `       ${kb(part.bytes).padStart(9)}  ${part.file}`)
}

export function summaryOf(report: Report): string {
  const count = (status: Status) => report.rows.filter((row) => row.status === status).length
  const gated = report.rows.filter((row) => row.gate !== null).length
  const tail = `${plural(gated, 'budget')} gated, ${count('warn')} over a target, ${count('skip')} skipped`
  return report.failed > 0 ? `verify:bundle failed: ${plural(report.failed, 'problem')} (${tail})` : `verify:bundle passed: ${tail}`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the tree and the build                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const list = (directory: string): string[] => (existsSync(directory) ? readdirSync(directory) : [])

/** What the tree under `root` has. */
export function readTree(root: string): Tree {
  const folders = list(path.join(root, 'src/games')).filter((name) => statSync(path.join(root, 'src/games', name)).isDirectory())
  const has = (file: string) => existsSync(path.join(root, file))
  return {
    games: folders.filter((id) => has(`src/games/${id}/Game.tsx`)),
    scenes: [
      ...folders.filter((id) => has(`src/games/${id}/Scene3D.tsx`)).map((id) => `src/games/${id}/Scene3D.tsx`),
      ...list(path.join(root, 'src/scene'))
        .filter((file) => /Scene3D\.tsx$/.test(file))
        .map((file) => `src/scene/${file}`),
    ],
    workers: Object.keys(BUDGETS.workers).filter((name) => has(`src/workers/${name}.ts`)),
    postfx: has('src/scene/postfx'),
    sceneKit: has('src/scene/props'),
  }
}

/** index.html's first-paint files, read the way a browser reads them: the module script, the modulepreloads and the stylesheets. */
function documentIn(html: string, gzip: number, sizeOfPublic: (file: string) => number): Document {
  const tags = [...html.matchAll(/<(?:script|link)\b[^>]*>/g)].map((match) => match[0])
  const attribute = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
  const loads: string[] = []
  const fonts: { file: string; bytes: number }[] = []
  for (const tag of tags) {
    const url = attribute(tag, tag.startsWith('<script') ? 'src' : 'href')
    if (url === undefined) continue
    const rel = attribute(tag, 'rel')
    // The base path (/enginespace/) is whatever precedes the folder.
    const asset = /(assets\/[^"'?#]+)/.exec(url)?.[1]
    if (asset !== undefined && (tag.startsWith('<script') || rel === 'modulepreload' || rel === 'stylesheet')) loads.push(asset)
    const font = /(fonts\/[^"'?#]+)/.exec(url)?.[1]
    if (font !== undefined && rel === 'preload') fonts.push({ file: font, bytes: sizeOfPublic(font) })
  }
  return { gzip, loads, fonts }
}

/** The size of a file of dist/ as served, or a BundleError when index.html names a file that the build does not have. */
function fileBytes(dist: string, file: string): number {
  const full = path.join(dist, file)
  if (!existsSync(full)) throw new BundleError(`index.html preloads ${file} and ${full} does not exist`)
  return statSync(full).size
}

/** Every file under a folder, with its size. */
function walk(directory: string): { files: number; bytes: number } {
  let files = 0
  let bytes = 0
  for (const name of list(directory)) {
    const full = path.join(directory, name)
    const stats = statSync(full)
    if (stats.isDirectory()) {
      const inside = walk(full)
      files += inside.files
      bytes += inside.bytes
    } else {
      files += 1
      bytes += stats.size
    }
  }
  return { files, bytes }
}

/** The input of the gate for the build in `dist`, read from the tree at `root`. It throws a BundleError when there is no build. */
export function readInput(root: string, dist: string): Input {
  const manifestPath = path.join(dist, '.vite/manifest.json')
  if (!existsSync(manifestPath)) throw new BundleError(`${manifestPath} does not exist: run \`npm run build\` first (vite.config.ts sets build.manifest)`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  const cache = new Map<string, number>()
  const gzip = (file: string): number => {
    let bytes = cache.get(file)
    if (bytes === undefined) {
      const full = path.join(dist, file)
      if (!existsSync(full)) throw new BundleError(`the manifest names ${file} and ${full} does not exist`)
      bytes = gzipSync(readFileSync(full)).length
      cache.set(file, bytes)
    }
    return bytes
  }
  const htmlPath = path.join(dist, 'index.html')
  const routesPath = path.join(root, 'src/routes.tsx')
  if (!existsSync(routesPath)) throw new BundleError(`${routesPath} does not exist: the gate reads the route table from it`)
  return {
    manifest,
    gzip,
    routes: routesIn(readFileSync(routesPath, 'utf8')),
    tree: readTree(root),
    document: existsSync(htmlPath) ? documentIn(readFileSync(htmlPath, 'utf8'), gzip('index.html'), (file) => fileBytes(dist, file)) : null,
    assets: list(path.join(dist, 'assets')),
    site: walk(dist),
  }
}

const USAGE = 'usage: bun scripts/verify-bundle.ts [--dist <dir>] [--root <dir>]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[], print: (line: string) => void = console.log): number {
  let root = ROOT
  let dist: string | null = null
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1]
    if (value === undefined || (argv[i] !== '--dist' && argv[i] !== '--root')) {
      print(USAGE)
      return 2
    }
    if (argv[i] === '--dist') dist = path.resolve(value)
    else root = path.resolve(value)
  }
  const directory = dist ?? path.join(root, 'dist')
  let report: Report
  try {
    report = checkBundle(readInput(root, directory))
  } catch (error) {
    if (!(error instanceof BundleError)) throw error
    print(`verify:bundle failed: ${error.message}`)
    return 1
  }
  const relative = path.relative(process.cwd(), directory)
  print(`verify:bundle: ${relative === '' ? '.' : relative.startsWith('..') ? directory : relative}, gzip by node:zlib's default level under Bun ${process.versions.bun ?? 'not running'}, 1 KB = 1,000 B`)
  const width = Math.max(...report.rows.map((row) => row.label.length))
  for (const row of report.rows) {
    print(lineOf(row, width))
    for (const line of breakdown(row)) print(line)
  }
  print(summaryOf(report))
  return report.failed > 0 ? 1 : 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
