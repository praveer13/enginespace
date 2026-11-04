/*
 * W0-T01's acceptance check 4, and the chunking it stands for: the build writes dist/.vite/manifest.json, and three
 * appears only in a `three-vendor` chunk that the entry never imports (D-023, ARCHITECTURE §6.10).
 *
 * Three real `vite build`s run here, with the repo's own vite.config.ts, into temporary directories:
 *   - the app, as `npm run build` builds it;
 *   - the app again, as the GitHub Pages deploy builds it, under /enginespace/;
 *   - tests/fixtures/chunks, a miniature of the app with the one thing the app does not have yet: a lazy scene that
 *     imports three and R3F. It is what proves the manualChunks rule works before the first scene exists.
 * Each build writes source maps, and the maps say which package's code sits in which chunk.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-build-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

interface ManifestEntry {
  file: string
  name?: string
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

/** "../../x/node_modules/three/build/three.core.js" becomes "node_modules/three/build/three.core.js". */
function fromNodeModules(source: string): string {
  const at = source.lastIndexOf('node_modules/')
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

  test('makes every page but the 404 page its own lazy chunk', () => {
    const pages = readdirSync(path.join(root, 'src/pages'))
      .filter((file) => file.endsWith('.tsx') && file !== 'NotFound.tsx')
      .map((file) => `src/pages/${file}`)
    const lazy = Object.entries(app.manifest)
      .filter(([, chunk]) => chunk.isDynamicEntry)
      .map(([key]) => key)
    // The compiled content is lazy too, but it is not a page: the next test holds it to account.
    expect(lazy.filter((key) => !key.startsWith(CONTENT)).sort()).toEqual(pages.sort())
  })

  test('makes the course index, and each module and lesson, a lazy chunk of its own that the entry never loads (ARCHITECTURE §4.6)', () => {
    // The build compiled content/ into src/content/generated/ before it bundled anything, so the folder is what the chunks must match.
    const compiled = (folder: string): string[] =>
      readdirSync(path.join(root, CONTENT, folder))
        .filter((file) => file.endsWith('.json'))
        .map((file) => `${CONTENT}${folder}${file}`)
    const expected = [`${CONTENT}index.json`, ...compiled('modules/'), ...compiled('lessons/')]
    const content = Object.entries(app.manifest).filter(([key]) => key.startsWith(CONTENT))
    expect(content.map(([key]) => key).sort()).toEqual(expected.sort())
    expect(content.length).toBeGreaterThanOrEqual(3) // the index, and the sample module and lesson
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

  test('puts React in react-vendor, which the entry imports', () => {
    const [vendorKey, vendor] = chunkNamed(app, 'react-vendor') ?? []
    expect(vendor).toBeDefined()
    expect(app.manifest[entryKeyOf(app)].imports).toContain(vendorKey)
    expect(chunksHolding(app, 'node_modules/react/', 'node_modules/react-dom/')).toEqual([vendor.file])
  })
})

describe('the app built for GitHub Pages, with VITE_BASE=/enginespace/', () => {
  test('loads every script, stylesheet and preload from under /enginespace/', () => {
    const pages = build('pages', [], { VITE_BASE: '/enginespace/' })
    const html = readFileSync(path.join(pages.outDir, 'index.html'), 'utf8')
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((url) => !url.startsWith('data:'))
    expect(urls.length).toBeGreaterThanOrEqual(2) // at least the entry script and the stylesheet
    expect(urls.filter((url) => !url.startsWith('/enginespace/assets/'))).toEqual([])
    // The router's basename comes from the same base, so the links agree with the files.
    const entry = readFileSync(path.join(pages.outDir, pages.manifest['index.html'].file), 'utf8')
    expect(entry).toContain('"/enginespace/"')
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
