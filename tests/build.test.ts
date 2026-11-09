/*
 * W0-T01's acceptance check 4, and the chunking it stands for: the build writes dist/.vite/manifest.json, and three
 * appears only in a `three-vendor` chunk that the entry never imports (D-023, ARCHITECTURE §6.10).
 *
 * Three real `vite build`s run here, with the repo's own vite.config.ts, into temporary directories:
 *   - the app, as `npm run build` builds it;
 *   - the app again, as a preview or a fork builds it when it is served under a subpath, /enginespace/ (the deploy builds at the
 *     root of the custom domain, D-058, as the first build does);
 *   - tests/fixtures/chunks, a miniature of the app with the one thing the app does not have yet: a lazy scene that
 *     imports three and R3F. It is what proves the manualChunks rule works before the first scene exists.
 * Each build writes source maps, and the maps say which package's code sits in which chunk. They are also the oracle for the third-party
 * licences (scripts/pages/third-party-licenses.ts): the file that the build writes must name every package that the maps put in a chunk.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { routesIn } from '../scripts/verify-bundle'

const root = path.resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-build-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

interface ManifestEntry {
  file: string
  name?: string
  /** The source file of the chunk's entry module, when the chunk has one. */
  src?: string
  isEntry?: boolean
  isDynamicEntry?: boolean
  imports?: string[]
}

interface Build {
  outDir: string
  log: string
  /** dist/.vite/manifest.json: a key (a source path, or `_name.js` for a shared chunk) to its chunk. */
  manifest: Record<string, ManifestEntry>
  /** Chunk file (`assets/x.js`) to the source modules inside it, as `node_modules/<package>/...` paths. */
  sources: Map<string, string[]>
}

/**
 * "../../x/node_modules/three/build/three.core.js" becomes "node_modules/three/build/three.core.js". The path is cut at the first
 * `node_modules/`, so a package's own copy of a dependency keeps its place: "node_modules/a/node_modules/b/index.mjs" is a different file
 * from "node_modules/b/index.mjs", as it is when two versions of `b` are installed (Radix's dialog nests its own react-slot, for example).
 */
function fromNodeModules(source: string): string {
  const at = source.indexOf('node_modules/')
  return at < 0 ? source : source.slice(at)
}

/** Runs `vite build` under Node, as `npm run build` does, and reads back what it wrote. */
function build(label: string, args: string[], env: Record<string, string> = {}): Build {
  const outDir = path.join(scratch, label)
  const vite = path.join(root, 'node_modules/vite/bin/vite.js')
  const run = spawnSync('node', [vite, 'build', ...args, '--outDir', outDir, '--emptyOutDir', '--sourcemap'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, VITE_BASE: '/', ...env },
  })
  const log = `${run.stdout}${run.stderr}`
  if (run.status !== 0) throw new Error(`vite build (${label}) exited with ${run.status}:\n${log}`)

  const manifestPath = path.join(outDir, '.vite/manifest.json')
  if (!existsSync(manifestPath)) throw new Error(`vite build (${label}) wrote no ${manifestPath}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Build['manifest']

  const sources = new Map<string, string[]>()
  for (const name of readdirSync(path.join(outDir, 'assets')).filter((file) => file.endsWith('.js'))) {
    const map = JSON.parse(readFileSync(path.join(outDir, 'assets', `${name}.map`), 'utf8')) as { sources: string[] }
    sources.set(`assets/${name}`, map.sources.map(fromNodeModules))
  }
  return { outDir, log, manifest, sources }
}

const chunkNamed = (b: Build, name: string) => Object.entries(b.manifest).find(([, chunk]) => chunk.name === name)
const entryKeyOf = (b: Build) => Object.entries(b.manifest).find(([, chunk]) => chunk.isEntry)?.[0] ?? ''

/** The manifest keys a page loads before anything else does: the key itself and its static imports, transitively. */
function staticClosure(b: Build, key: string, seen = new Set<string>()): Set<string> {
  if (seen.has(key)) return seen
  seen.add(key)
  for (const imported of b.manifest[key]?.imports ?? []) staticClosure(b, imported, seen)
  return seen
}

/** The chunk files that hold any module under one of the given `node_modules/<package>/` prefixes. */
const chunksHolding = (b: Build, ...prefixes: string[]) =>
  [...b.sources].filter(([, paths]) => paths.some((p) => prefixes.some((prefix) => p.startsWith(prefix)))).map(([file]) => file)

/** Where the content compiler writes the course index and each module and lesson (ARCHITECTURE §4.6). */
const CONTENT = 'src/content/generated/'

const THREE_CORE = 'node_modules/three/build/'
const R3F = 'node_modules/@react-three/fiber/'
const THREE_ADDONS = 'node_modules/three/examples/jsm/'

/** What must hold for any build of this app, now and once scenes exist. */
function expectThreeIsolated(b: Build) {
  expect(b.log).not.toContain('Circular')

  // three's core and R3F sit in three-vendor and nowhere else.
  const threeVendor = chunkNamed(b, 'three-vendor')?.[1].file
  expect(chunksHolding(b, THREE_CORE, R3F).filter((file) => file !== threeVendor)).toEqual([])

  // The entry never loads any of it: not directly, and not through anything it imports statically.
  const loadedFirst = [...staticClosure(b, entryKeyOf(b))].map((key) => b.manifest[key].file)
  expect(loadedFirst).not.toContain(threeVendor ?? 'no three-vendor chunk')
  expect(chunksHolding(b, THREE_CORE, R3F, THREE_ADDONS).filter((file) => loadedFirst.includes(file))).toEqual([])

  // No package's code is bundled twice.
  const holders = new Map<string, Set<string>>()
  for (const [file, paths] of b.sources) {
    for (const p of paths.filter((path) => path.startsWith('node_modules/'))) holders.set(p, (holders.get(p) ?? new Set()).add(file))
  }
  expect([...holders].filter(([, files]) => files.size > 1).map(([p]) => p)).toEqual([])
}

describe('the app build', () => {
  let app: Build
  beforeAll(() => {
    app = build('app', [])
  }, 120_000)

  test('writes dist/.vite/manifest.json, which verify:bundle reads', () => {
    expect(app.manifest['index.html']?.isEntry).toBe(true)
    expect(app.manifest['index.html']?.file).toMatch(/^assets\/index-.*\.js$/)
  })

  test('keeps three in three-vendor, if it is in the build at all, and out of the entry', () => {
    expectThreeIsolated(app)
  })

  test('makes every page but the 404 page its own lazy chunk, and lazy nothing but pages and the games they load', () => {
    const pages = readdirSync(path.join(root, 'src/pages'))
      .filter((file) => file.endsWith('.tsx') && file !== 'NotFound.tsx')
      .map((file) => `src/pages/${file}`)
    const loadedFirst = staticClosure(app, entryKeyOf(app))
    for (const page of pages) {
      // A page's chunk is keyed by its source path, unless a lazy chunk that the page loads shares code with it: then Rollup keeps that
      // code in the page's chunk and the key becomes the chunk's file. So the page is found by the module it holds.
      const holder = [...app.sources].find(([, paths]) => paths.some((source) => source.endsWith(`/${page}`)))?.[0]
      expect(holder, page).toBeDefined()
      const [key, chunk] = Object.entries(app.manifest).find(([, candidate]) => candidate.file === holder) ?? []
      expect(chunk?.isDynamicEntry, page).toBe(true)
      expect(loadedFirst.has(key ?? ''), page).toBe(false)
    }
    // A lazy chunk with a source path is a page, or a part of a game that a page loads on demand: its component (src/games/<id>/Game.tsx)
    // and the parts that component loads in turn (its debrief, and later its 3D scene), which stay in src/games/<id>/; or a part of
    // the scene kit that a scene loads on demand (src/scene/postfx, W0-T15), or one of three's addons (OrbitControls); or a forge lab's
    // page (src/forge/ForgeLabPage.tsx), which the Lab page loads on demand with its host and its oracle, so that the labs that have no
    // forge never carry them (W1-T10); or the attempt of an item block (src/items/Attempt.tsx, W1-T04), which a lesson loads when the
    // learner starts one, and which brings the ledger; or the trace viewer (src/trace/TraceView.tsx, W1-T19), which the debrief of Back of
    // House's graded map loads when the run has been judged, so that a learner who never gets there has not downloaded an instrument; or
    // the rules of a route change (src/route-change.ts), which the root route loads after its first render so that the front page's
    // first-paint closure does not carry them (D-023); or a game's whole session (packages/play/<id>/game.ts), which its registry entry
    // loads for the replay grader when the game plays two sets of rules, as Service does since W1-T13 (the first service's and the full
    // service's), so that a page that plays one of them never carries the other; or an item family's code
    // (packages/play/items/families/<module>/<family>.ts), which Today and an item block load when they draw one of its items, so that a
    // page carries no family it does not draw from (D-059).
    // The compiled content is lazy too, but it is not a page: the next test holds it to account.
    const named = Object.entries(app.manifest)
      .filter(([key, chunk]) => chunk.isDynamicEntry && chunk.src !== undefined && !key.startsWith(CONTENT))
      .map(([key]) => key)
    const onDemand =
      /^(packages\/play\/[^/]+\/game\.ts|packages\/play\/items\/families\/(?:tr[0-8][ab]?|capstone)\/[a-z0-9-]+\.ts|src\/games\/[^/]+\/[A-Za-z0-9]+\.tsx|src\/scene\/[\w/-]+\.tsx?|src\/forge\/ForgeLabPage\.tsx|src\/items\/Attempt\.tsx|src\/trace\/TraceView\.tsx|src\/route-change\.ts|node_modules\/three\/examples\/jsm\/[\w/-]+\.js)$/
    expect(named.filter((key) => !pages.includes(key) && !onDemand.test(key))).toEqual([])
  })

  test('makes the course index, the course map, and each module, lesson and card, a lazy chunk of its own that the entry never loads (ARCHITECTURE §4.6)', () => {
    // The build compiled content/ into src/content/generated/ before it bundled anything, so the folder is what the chunks must match.
    const compiled = (folder: string): string[] =>
      readdirSync(path.join(root, CONTENT, folder))
        .filter((file) => file.endsWith('.json'))
        .map((file) => `${CONTENT}${folder}${file}`)
    const expected = [`${CONTENT}index.json`, `${CONTENT}map.json`, ...compiled('modules/'), ...compiled('lessons/'), ...compiled('cards/')]
    const content = Object.entries(app.manifest).filter(([key]) => key.startsWith(CONTENT))
    expect(content.map(([key]) => key).sort()).toEqual(expected.sort())
    expect(content.length).toBeGreaterThanOrEqual(5) // the index, the map, the sample module and lesson, and a card
    const loadedFirst = new Set([...staticClosure(app, entryKeyOf(app))].map((key) => app.manifest[key].file))
    for (const [, chunk] of content) {
      expect(chunk.isDynamicEntry).toBe(true)
      expect(loadedFirst.has(chunk.file)).toBe(false)
    }
  })

  test('ships none of Tailwind\'s typography, which would bring its own greys into the first-paint CSS', () => {
    // The word "prose" is a block type of the content, so it is all over src/content, and Tailwind makes a class of every word
    // it finds: tailwind.config.ts blocklists it. `.es-prose`, the design system's own class, is not Tailwind's.
    const assets = path.join(app.outDir, 'assets')
    const css = readdirSync(assets)
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(path.join(assets, file), 'utf8'))
      .join('\n')
    expect(css.length).toBeGreaterThan(0)
    expect(css).not.toContain('--tw-prose')
    expect(css).not.toMatch(/\.prose[\s{,:.[>)]/)
    expect(css).toContain('.es-prose')
  })

  test("keeps the scene kit's 3D out of every page's first chunk: the scene and postfx load on demand (W0-T15)", () => {
    const [postfxKey, postfx] = chunkNamed(app, 'postfx') ?? []
    const [designKey] = chunkNamed(app, 'Design') ?? []
    const [sceneKey, scene] = chunkNamed(app, 'SpecimenScene3D') ?? []
    expect(postfx?.isDynamicEntry).toBe(true)
    expect(scene?.isDynamicEntry).toBe(true)
    const designFirst = staticClosure(app, designKey ?? 'no Design chunk')
    expect(designFirst.has(postfxKey ?? 'no postfx chunk')).toBe(false)
    expect(designFirst.has(sceneKey ?? 'no scene chunk')).toBe(false)
    const [vendorKey] = chunkNamed(app, 'three-vendor') ?? []
    expect(designFirst.has(vendorKey ?? 'no three-vendor chunk')).toBe(false)
    // three's post-processing addons live in the postfx chunk and nowhere else.
    expect(chunksHolding(app, 'node_modules/three/examples/jsm/postprocessing/')).toEqual([postfx?.file])
  })

  test("keeps scene kit v1's props in a scene-kit chunk that no page loads first, with the three addons they use (vite.config.ts)", () => {
    const [kitKey, kit] = chunkNamed(app, 'scene-kit') ?? []
    expect(kit).toBeDefined()
    // Only the props are in it: not three, not React, not the kit's core.
    const sources = app.sources.get(kit?.file ?? '') ?? []
    expect(sources.filter((source) => !source.includes('src/scene/props/') && !source.startsWith(THREE_ADDONS))).toEqual([])
    // Their addon (BufferGeometryUtils) rides with them, and no page's first chunk loads them.
    expect(chunksHolding(app, `${THREE_ADDONS}utils/`)).toEqual([kit?.file])
    for (const page of readdirSync(path.join(root, 'src/pages')).filter((file) => file.endsWith('.tsx'))) {
      const [key] = Object.entries(app.manifest).find(([, chunk]) => chunk.name === page.replace('.tsx', '') && chunk.isDynamicEntry) ?? []
      if (key) expect(staticClosure(app, key).has(kitKey ?? 'no scene-kit chunk'), page).toBe(false)
    }
    expect(staticClosure(app, entryKeyOf(app)).has(kitKey ?? 'no scene-kit chunk')).toBe(false)
  })

  test("lists no chunk of the pages in the entry, and puts the route table beside it, with each route's chunks (D-059, A§6.10)", () => {
    const entry = app.manifest[entryKeyOf(app)].file
    // The names Vite gives the lazy imports of a chunk to preload, in the table at its top (`__vite__mapDeps`).
    const preloadNames = (file: string): string[] => {
      const match = /__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]]*\])/.exec(readFileSync(path.join(app.outDir, file), 'utf8'))
      return match === null ? [] : (JSON.parse(match[1]) as string[])
    }
    // The pages' stylesheets stay, because a page must have its CSS before it renders; no page's chunk is named.
    expect(preloadNames(entry).filter((name) => !name.endsWith('.css'))).toEqual([])
    const table = JSON.parse(readFileSync(path.join(app.outDir, entry.replace(/\.js$/, '.routes.json')), 'utf8')) as Record<string, string[]>
    const lazyRoutes = routesIn(readFileSync(path.join(root, 'src/routes.tsx'), 'utf8'))
    expect(lazyRoutes.filter((route) => table[route.pattern] === undefined).map((route) => route.pattern)).toEqual([])
    for (const files of Object.values(table)) for (const file of files) expect(existsSync(path.join(app.outDir, file)), file).toBe(true)
    // A game's own chunks are under its address, for the game page's document and a link to it.
    const service = Object.values(app.manifest).find((chunk) => chunk.src === 'src/games/loop/Game.tsx')?.file
    expect(table['/play/loop']).toContain(service ?? 'no chunk for src/games/loop/Game.tsx')
  })

  test('lists no chunk in a lazy import that its importer has already loaded (D-059)', () => {
    const keyOfFile = new Map(Object.entries(app.manifest).map(([key, chunk]) => [chunk.file, key]))
    let checked = 0
    for (const file of readdirSync(path.join(app.outDir, 'assets')).filter((name) => name.endsWith('.js')).map((name) => `assets/${name}`)) {
      const match = /__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=(\[[^\]]*\])/.exec(readFileSync(path.join(app.outDir, file), 'utf8'))
      const key = keyOfFile.get(file)
      if (match === null || key === undefined) continue
      const loaded = new Set([...staticClosure(app, key)].map((closureKey) => app.manifest[closureKey].file))
      expect([file, (JSON.parse(match[1]) as string[]).filter((name) => loaded.has(name))]).toEqual([file, []])
      checked += 1
    }
    expect(checked).toBeGreaterThan(3)
  })

  describe('the third-party licences (licensing#6, scripts/pages/third-party-licenses.ts)', () => {
    const textOf = (file: string): string => readFileSync(path.join(app.outDir, file), 'utf8')
    const scriptsOf = (): string[] =>
      readdirSync(path.join(app.outDir, 'assets'))
        .filter((file) => file.endsWith('.js'))
        .map((file) => `assets/${file}`)
        .sort()

    /** The package a file of node_modules belongs to, found by the nearest package.json that names one: not the way the plugin finds it. */
    function packageOf(source: string): string {
      for (let dir = path.dirname(path.join(root, source)); dir.startsWith(root); dir = path.dirname(dir)) {
        const manifest = path.join(dir, 'package.json')
        if (!existsSync(manifest)) continue
        const { name, version } = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; version?: string }
        if (typeof name === 'string' && name !== '') return `${name}@${version ?? 'unknown'}`
      }
      throw new Error(`${source} is in no package`)
    }

    test('names every package whose code the source maps put in a chunk, with its licence text, and carries NOTICE and the texts of LICENSES/ after them', () => {
      const inChunks = new Set<string>()
      for (const sources of app.sources.values()) for (const source of sources.filter((candidate) => candidate.startsWith('node_modules/'))) inChunks.add(packageOf(source))
      // React, three, R3F, Radix, zustand, zod and what they bring: dozens of packages, so a collector that found a few would not pass.
      expect(inChunks.size).toBeGreaterThan(30)
      for (const expected of ['react@', 'react-dom@', 'three@', '@react-three/fiber@', 'zustand@', 'zod@', 'react-router@', 'clsx@']) {
        expect([...inChunks].some((id) => id.startsWith(expected)), expected).toBe(true)
      }
      const text = textOf('third-party-licenses.txt')
      const headings = new Set(text.split('\n'))
      expect([...inChunks].filter((id) => !headings.has(id)).sort()).toEqual([])
      const notice = readFileSync(path.join(root, 'NOTICE'), 'utf8').trimEnd()
      expect(text).toContain(notice)
      // The texts that NOTICE points to follow it, so that the site gives a reader what the notice names (the Apache License 2.0).
      const texts = readdirSync(path.join(root, 'LICENSES')).sort()
      expect(texts).toContain('Apache-2.0.txt')
      let from = text.indexOf(notice)
      for (const file of texts) {
        const at = text.indexOf(readFileSync(path.join(root, 'LICENSES', file), 'utf8').trimEnd(), from)
        expect([file, at > from]).toEqual([file, true])
        from = at
      }
    })

    test('has the licence text under each heading: no section is a heading alone', () => {
      const lines = textOf('third-party-licenses.txt').split('\n')
      const rule = '='.repeat(76)
      const sections = lines.flatMap((line, at) => (line === rule && lines[at + 3] === rule ? [at] : []))
      // Each package is headed by a rule, its name and version, its licence, and a rule; the NOTICE has its own heading and rule.
      expect(sections.length).toBeGreaterThan(30)
      for (const at of sections) {
        const next = sections.find((candidate) => candidate > at) ?? lines.length
        const body = lines.slice(at + 4, next).join('\n').trim()
        expect([lines[at + 1], body.length > 200]).toEqual([lines[at + 1], true])
      }
    })

    test('records every script of the build, the forge worker\'s among them, and the packages of Tailwind\'s base CSS by hand', () => {
      const record = JSON.parse(textOf('.vite/third-party.json')) as { chunks: Record<string, string[]>; alsoShips: string[] }
      expect(Object.keys(record.chunks).sort()).toEqual(scriptsOf())
      expect(scriptsOf().some((file) => /^assets\/forge\.worker-/.test(file))).toBe(true)
      // Tailwind's base layer is in the stylesheet, so its licence ships though no script holds a module of it.
      const css = readdirSync(path.join(app.outDir, 'assets'))
        .filter((file) => file.endsWith('.css'))
        .map((file) => textOf(`assets/${file}`))
        .join('\n')
      expect(css).toContain('--tw-border-spacing-x')
      expect(record.alsoShips.map((id) => id.replace(/@[^@]+$/, ''))).toEqual(['tailwindcss'])
      expect(textOf('third-party-licenses.txt')).toContain(`\n${record.alsoShips[0]}\n`)
    })

    /** The text under a package's heading in the licence file, up to the heading of the next package or of NOTICE. */
    function sectionOf(id: string): string {
      const lines = textOf('third-party-licenses.txt').split('\n')
      const rule = '='.repeat(76)
      const at = lines.indexOf(id)
      expect([id, at > 0]).toEqual([id, true])
      const next = lines.findIndex((line, index) => index > at + 2 && line === rule && lines[index + 3] === rule)
      return lines.slice(at + 3, next < 0 ? lines.length : next).join('\n')
    }
    const viteId = (): string => {
      const { version } = JSON.parse(readFileSync(path.join(root, 'node_modules/vite/package.json'), 'utf8')) as { version: string }
      return `vite@${version}`
    }

    test('names vite, for the helpers that the build tool writes into the scripts, and records it for the two scripts that hold them: the entry, with the preload helper, and react-vendor, with the commonjs interop helper', () => {
      const record = JSON.parse(textOf('.vite/third-party.json')) as { chunks: Record<string, string[]> }
      const holders = Object.keys(record.chunks).filter((file) => record.chunks[file].includes(viteId()))
      // The source maps cannot show these: a virtual module has no source. The preload helper has a message of its own, and sits in one script.
      const withHelper = scriptsOf().filter((file) => textOf(file).includes('Unable to preload CSS for'))
      expect(withHelper).toEqual([app.manifest[entryKeyOf(app)].file])
      expect(holders.sort()).toEqual([app.manifest[entryKeyOf(app)].file, chunkNamed(app, 'react-vendor')?.[1].file ?? 'no react-vendor chunk'].sort())
    })

    test("gives vite's own licence and the Rollup plugins' and not the licences of the dependencies that Vite bundles into its own build, which are most of its licence file", () => {
      const section = sectionOf(viteId())
      expect(section).toContain('# Vite core license')
      expect(section).toContain('Copyright (c) 2019-present, VoidZero Inc. and Vite contributors')
      expect(section).toContain('Copyright (c) 2019 RollupJS Plugin Contributors')
      for (const left of ['# Licenses of bundled dependencies', '@jridgewell/gen-mapping', 'chokidar', 'postcss-selector-parser', 'License: ISC']) expect([left, section.includes(left)]).toEqual([left, false])
      const whole = readFileSync(path.join(root, 'node_modules/vite/LICENSE.md'), 'utf8')
      expect(section.length).toBeLessThan(whole.length / 10)
    })

    test("says in the section of @react-three/fiber that it embeds react-reconciler under the notice that react's section carries", () => {
      const section = sectionOf('@react-three/fiber@9.6.1')
      expect(section).toContain('This package also embeds react-reconciler, which is Meta Platforms, Inc. and affiliates\' code under the MIT licence')
      expect(sectionOf('react@19.2.3')).toContain('Copyright (c) Meta Platforms, Inc. and affiliates')
    })
  })

  test('puts React in react-vendor, which the entry imports', () => {
    const [vendorKey, vendor] = chunkNamed(app, 'react-vendor') ?? []
    expect(vendor).toBeDefined()
    expect(app.manifest[entryKeyOf(app)].imports).toContain(vendorKey)
    expect(chunksHolding(app, 'node_modules/react/', 'node_modules/react-dom/')).toEqual([vendor.file])
  })
})

describe('the app built under a subpath, with VITE_BASE=/enginespace/, as a preview or a fork on a project site is', () => {
  test('loads every script, stylesheet and preload from under /enginespace/', () => {
    const pages = build('pages', [], { VITE_BASE: '/enginespace/' })
    const html = readFileSync(path.join(pages.outDir, 'index.html'), 'utf8')
    const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((url) => !url.startsWith('data:'))
    expect(urls.length).toBeGreaterThanOrEqual(2) // at least the entry script and the stylesheet
    // The built chunks, and the faces the front page preloads from public/fonts (W0-T18).
    expect(urls.filter((url) => !url.startsWith('/enginespace/assets/') && !url.startsWith('/enginespace/fonts/'))).toEqual([])
    // The front page's static shell links every page under the base too, or to an anchor of its own (W0-T18).
    const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1])
    expect(links.length).toBeGreaterThan(5)
    expect(links.filter((url) => !url.startsWith('/enginespace/') && !url.startsWith('#'))).toEqual([])
    // The router's basename comes from the same base, so the links agree with the files.
    const entry = readFileSync(path.join(pages.outDir, pages.manifest['index.html'].file), 'utf8')
    expect(entry).toContain('"/enginespace/"')
    // The About page links the licence file under the base too, and the build wrote the file at the root of its folder. Its text names the
    // folder of the typefaces' licences under the base as well, and not as /fonts/ whatever the base is.
    const about = Object.values(pages.manifest).find((chunk) => chunk.src === 'src/pages/About.tsx')?.file ?? 'no chunk for src/pages/About.tsx'
    const aboutText = readFileSync(path.join(pages.outDir, about), 'utf8')
    expect(aboutText).toContain('/enginespace/third-party-licenses.txt')
    expect(aboutText).toContain('/enginespace/fonts/')
    expect(existsSync(path.join(pages.outDir, 'third-party-licenses.txt'))).toBe(true)
    expect(existsSync(path.join(pages.outDir, 'fonts'))).toBe(true)
  }, 120_000)
})

describe('a build with a lazy scene that imports three, R3F and a three addon', () => {
  let fixture: Build
  beforeAll(() => {
    fixture = build('chunks', ['tests/fixtures/chunks', '--config', path.join(root, 'vite.config.ts')])
  }, 120_000)

  test('writes the manifest, with the scene as a lazy chunk', () => {
    expect(fixture.manifest['scene.ts']?.isDynamicEntry).toBe(true)
  })

  test('puts three and R3F in three-vendor, which the scene imports and the entry never does', () => {
    expectThreeIsolated(fixture)
    const [vendorKey, vendor] = chunkNamed(fixture, 'three-vendor') ?? []
    expect(vendor).toBeDefined()
    expect(chunksHolding(fixture, THREE_CORE)).toEqual([vendor.file])
    expect(chunksHolding(fixture, R3F)).toEqual([vendor.file])
    expect(fixture.manifest['scene.ts'].imports).toContain(vendorKey)
  })

  test('leaves a three addon in the chunk that uses it', () => {
    expect(chunksHolding(fixture, THREE_ADDONS)).toEqual([fixture.manifest['scene.ts'].file])
  })

  test('puts what the entry and R3F share in react-vendor, not in three-vendor', () => {
    const [, vendor] = chunkNamed(fixture, 'react-vendor') ?? []
    expect(vendor).toBeDefined()
    for (const name of ['react', 'react-dom', 'scheduler', 'zustand', 'use-sync-external-store']) {
      expect(chunksHolding(fixture, `node_modules/${name}/`)).toEqual([vendor.file])
    }
  })
})
