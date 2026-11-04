/*
 * W0-T03's acceptance check 2: a fixture page that imports three statically fails verify:boundaries, and the clean tree
 * passes. scripts/verify-boundaries.ts runs here as its own process over the miniature repos of
 * tests/fixtures/lint/boundaries, the way CI runs it over the real one. Then it runs in process over small trees that each
 * test builds, one for every way of importing that matters to the static path to three and to the fences of ARCHITECTURE §2.3.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RULES, SIM_VENDORED, checkBoundaries } from '../../scripts/verify-boundaries'
import { PACKAGES } from '../../vite.config'

const root = path.resolve(import.meta.dirname, '../..')
const fixtures = path.join(root, 'tests/fixtures/lint/boundaries')

/** Runs the gate as CI does, in its own process. */
function gate(...args: string[]) {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/verify-boundaries.ts'), ...args], { cwd: root, encoding: 'utf8' })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

/** The files named at the start of each line of the gate's complaints. */
const reportedFiles = (stderr: string) => [...new Set([...stderr.matchAll(/^(\S+?):\d+:\d+ /gm)].map((match) => match[1]))].sort()

describe('verify:boundaries, run as a process', () => {
  test('passes on the clean tree, and says how much it checked', () => {
    const run = gate()
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    const [, checked, reachable] = /(\d+) file\(s\) checked against §2\.3, (\d+) reachable/.exec(run.stdout) ?? []
    expect(Number(checked)).toBeGreaterThanOrEqual(20) // every file under src/ and packages/
    expect(Number(reachable)).toBeGreaterThanOrEqual(3) // main.tsx, routes.tsx, App.tsx and the 404 page
  })

  test('fails on a fixture page that imports three statically, and prints the path from the entry', () => {
    const run = gate('--root', path.join(fixtures, 'static-three'))
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/^src\/pages\/Page\.tsx:1:\d+ 'three' is reachable from src\/main\.tsx without a dynamic import: src\/main\.tsx -> src\/pages\/Page\.tsx -> three$/m)
    expect(run.stderr).toMatch(/^src\/pages\/Page\.tsx:1:\d+ 'three': only src\/scene and each game's Scene3D\.tsx may import three/m)
  })

  test("fails on a scene that the entry reaches statically, though a scene may import three: the walk, not the fence", () => {
    const run = gate('--root', path.join(fixtures, 'static-path'))
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('src/main.tsx -> src/scene/Stage.tsx -> three')
    expect(reportedFiles(run.stderr)).toEqual(['src/scene/Stage.tsx'])
    expect(run.stderr.match(/^src\/\S+ /gm)).toHaveLength(1) // one violation: the fence let the scene import three
  })

  test('passes when the scene sits behind a dynamic import, as React.lazy writes it', () => {
    const run = gate('--root', path.join(fixtures, 'lazy-ok'))
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('0 violations')
  })

  test('reports each file that breaks a fence, however it names its import, and no file that keeps within them', () => {
    const run = gate('--root', path.join(fixtures, 'fences'))
    expect(run.status).toBe(1)
    expect(reportedFiles(run.stderr)).toEqual([
      'packages/ledger/imports-sim.ts',
      'packages/play/imports-schema-value.ts',
      'packages/schema/imports-ledger.ts',
      'packages/sim/imports-impure-vendor.ts',
      'packages/sim/imports-npm.ts',
      'packages/sim/imports-play.ts',
      'packages/sim/imports-src.ts',
      'packages/verify/imports-app-by-alias.ts',
      'packages/verify/imports-play.ts',
      'src/reads-content.ts',
    ])
  })

  test('gives each complaint the file, line and column of the import, and the reason', () => {
    const { stderr } = gate('--root', path.join(fixtures, 'fences'))
    expect(stderr).toContain("packages/play/imports-schema-value.ts:2:24 '../schema/index': packages/play imports only the types in packages/schema, so use `import type` (§2.3)")
    expect(stderr).toContain("packages/sim/imports-src.ts:2:21 '../../src/App': no package imports src/** (§2.3)")
  })
})

describe('the packages', () => {
  test('are the five of D-014, each with an index.ts, and each has a fence in the gate', () => {
    expect([...PACKAGES].sort()).toEqual(['ledger', 'play', 'schema', 'sim', 'verify'])
    expect(Object.keys(RULES).sort()).toEqual(PACKAGES.map((name) => `packages/${name}`).sort())
    for (const name of PACKAGES) expect([name, existsSync(path.join(root, 'packages', name, 'index.ts'))]).toEqual([name, true])
  })

  test('break no fence in the real tree, and the walk from the entry reaches the route table and nothing 3D', () => {
    const report = checkBoundaries(root)
    expect(report.violations).toEqual([])
    expect(report.reachable[0]).toBe('src/main.tsx')
    expect(report.reachable).toContain('src/routes.tsx')
    expect(report.reachable.filter((file) => file.startsWith('src/scene/') || file.endsWith('/Scene3D.tsx'))).toEqual([])
  })
})

// ---- in-process checks over small trees

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-boundaries-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let built = 0

/** Writes a tree of files, given as repo-relative paths to text, and returns its root. */
function tree(files: Record<string, string>): string {
  const dir = path.join(scratch, String(built++))
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    writeFileSync(path.join(dir, rel), text)
  }
  return dir
}

const describeAll = (files: Record<string, string>, entries?: string[]) =>
  checkBoundaries(tree(files), entries).violations.map((v) => `${v.file}:${v.line} ${v.message}`)

describe('the static path from the entry to three', () => {
  /** The violations when `scene` is the text of a scene file that src/main.tsx imports, statically. */
  const reachedFromMain = (scene: string, extra: Record<string, string> = {}) =>
    describeAll({ 'src/main.tsx': "import './scene/x'\n", 'src/scene/x.ts': scene, ...extra })

  test.each([
    ['a named import', "import { Scene } from 'three'\nexport const x = Scene"],
    ['a default import', "import THREE from 'three'\nexport const x = THREE"],
    ['a namespace import', "import * as THREE from 'three'\nexport const x = THREE"],
    ['a side-effect import', "import 'three'"],
    ['a re-export of everything', "export * from 'three'"],
    ['a re-export of a name', "export { Scene } from 'three'"],
    ['an inline type specifier, which verbatimModuleSyntax keeps as `import {} from`', "import { type Scene } from 'three'\nexport const x = 1"],
    ['react-three-fiber', "import { Canvas } from '@react-three/fiber'\nexport const x = Canvas"],
    ['a three addon', "import { OrbitControls } from 'three/addons/controls/OrbitControls.js'\nexport const x = OrbitControls"],
    ['a three examples path', "import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'\nexport const x = GLTFLoader"],
    ['require', "const three = require('three')\nexport const x = three"],
  ])('fails on %s', (_name, scene) => {
    const found = reachedFromMain(scene)
    expect(found.filter((line) => line.includes('is reachable from src/main.tsx without a dynamic import'))).toHaveLength(1)
  })

  test.each([
    ['a dynamic import', "export const load = () => import('three')"],
    ['a type-only import, which TypeScript erases', "import type { Scene } from 'three'\nexport type X = Scene"],
    ['a type-only re-export', "export type { Scene } from 'three'"],
    ['an import() type', "export type X = import('three').Scene"],
    ['a package that merely starts with three', "import { computeBoundsTree } from 'three-mesh-bvh'\nexport const x = computeBoundsTree"],
    ['a lazy import.meta.glob', "export const scenes = import.meta.glob('./*.ts')"],
    ['an explicitly lazy import.meta.glob', "export const scenes = import.meta.glob('./*.ts', { eager: false })"],
    ['a worker, which is its own bundle', "import Worker from './x.worker?worker'\nexport const x = Worker"],
  ])('passes on %s', (_name, scene) => {
    expect(reachedFromMain(scene, { 'src/scene/x.worker.ts': "import 'three'" })).toEqual([])
  })

  test('prints the whole path when three is several imports away, and survives import cycles', () => {
    const found = describeAll({
      'src/main.tsx': "import { a } from './a'\nexport { a }",
      'src/a.ts': "import { b } from './b'\nexport const a = b",
      'src/b.ts': "import { c } from '@/c'\nimport { a } from './a'\nexport const b = [c, a]",
      'src/c.ts': "import { d } from './deep/d.js'\nexport const c = d",
      'src/deep/d.ts': "import { Scene } from 'three'\nexport const d = Scene",
    })
    expect(found.filter((line) => line.startsWith('src/deep/d.ts:1 '))).toEqual([
      "src/deep/d.ts:1 'three': only src/scene and each game's Scene3D.tsx may import three or @react-three/fiber, and only behind a React.lazy boundary (§2.3)",
      "src/deep/d.ts:1 'three' is reachable from src/main.tsx without a dynamic import: src/main.tsx -> src/a.ts -> src/b.ts -> src/c.ts -> src/deep/d.ts -> three",
    ])
  })

  test('starts from each entry it is given, and reports an entry that does not exist', () => {
    const files = { 'src/main.tsx': 'export {}', 'src/other.ts': "import 'three'" }
    expect(describeAll(files, ['src/main.tsx'])).toEqual([expect.stringContaining('only src/scene')]) // the fence still sees other.ts
    expect(describeAll(files, ['src/main.tsx', 'src/other.ts']).filter((line) => line.includes('is reachable from src/other.ts'))).toHaveLength(1)
    expect(describeAll(files, ['src/gone.tsx'])).toContainEqual('src/gone.tsx:1 the entry src/gone.tsx does not exist, so no static path can be checked')
  })

  test('fails on an eager import.meta.glob, which it cannot follow', () => {
    const found = reachedFromMain("export const scenes = import.meta.glob('./*.ts', { eager: true })")
    expect(found).toEqual([expect.stringContaining('an eager import.meta.glob makes every match a static import')])
  })

  test('follows `@es/<package>` aliases into the packages', () => {
    const found = describeAll({
      'src/main.tsx': "import { x } from '@es/schema'\nexport { x }",
      'packages/schema/index.ts': "import 'three'\nexport const x = 1",
    })
    expect(found.some((line) => line.includes('src/main.tsx -> packages/schema/index.ts -> three'))).toBe(true)
  })
})

describe('the fences of ARCHITECTURE §2.3', () => {
  test('let only src/scene and a game\'s Scene3D.tsx import three, even lazily or for types', () => {
    const bad = (rel: string, source: string) => describeAll({ 'src/main.tsx': 'export {}', [rel]: source })
    for (const rel of ['src/pages/Game.tsx', 'src/games/loop/Game.tsx', 'src/design/scene-tokens.ts', 'src/games/loop/scene/Extra.tsx']) {
      expect([rel, bad(rel, "export const load = () => import('three')").length]).toEqual([rel, 1])
      expect([rel, bad(rel, "import type { Color } from 'three'\nexport type X = Color").length]).toEqual([rel, 1])
    }
    for (const rel of ['src/scene/Stage.tsx', 'src/scene/postfx/Bloom.tsx', 'src/games/loop/Scene3D.tsx', 'src/games/pool/Scene3D.tsx']) {
      expect([rel, bad(rel, "import type { Color } from 'three'\nexport type X = Color")]).toEqual([rel, []])
    }
    expect(bad('packages/verify/a.ts', "import type { Color } from 'three'\nexport type X = Color")).toHaveLength(1)
  })

  // ESLint's pattern fences (tests/lint/eslint-rules.test.ts) are held to the same table, with aliases. Here it is held to
  // relative paths, which no pattern can judge.
  for (const importer of PACKAGES) {
    const rule = RULES[`packages/${importer}`]
    for (const target of PACKAGES.filter((name) => name !== importer)) {
      const mayImportValues = rule.imports.includes(`packages/${target}`)
      const mayImportTypes = mayImportValues || rule.typesFrom.includes(`packages/${target}`)
      test(`packages/${importer} ${mayImportValues ? 'may' : mayImportTypes ? 'may import only the types of' : 'may not import'} packages/${target}`, () => {
        const files = { 'src/main.tsx': 'export {}', [`packages/${target}/index.ts`]: 'export const value = 1\nexport type Shape = number' }
        const imports = (statement: string) => describeAll({ ...files, [`packages/${importer}/core/x.ts`]: `${statement}\nexport const y = 1` })
        expect(imports(`import { value } from '../../${target}/index'`)).toHaveLength(mayImportValues ? 0 : 1)
        expect(imports(`import { value } from '@es/${target}'`)).toHaveLength(mayImportValues ? 0 : 1)
        expect(imports(`import type { Shape } from '../../${target}/index'`)).toHaveLength(mayImportTypes ? 0 : 1)
        expect(imports(`export type { Shape } from '../../${target}/index'`)).toHaveLength(mayImportTypes ? 0 : 1)
      })
    }
  }

  test('let a package import itself, by any path', () => {
    for (const name of PACKAGES) {
      const found = describeAll({
        'src/main.tsx': 'export {}',
        [`packages/${name}/index.ts`]: 'export const value = 1',
        [`packages/${name}/core/x.ts`]: `import { value } from '../index'\nimport { value as again } from '@es/${name}'\nexport const y = [value, again]`,
      })
      expect([name, found]).toEqual([name, []])
    }
  })

  test('let packages/sim import the vendored rng and S5 card, and nothing else that is vendored', () => {
    for (const vendored of SIM_VENDORED) {
      for (const suffix of ['', '.ts']) {
        const found = describeAll({
          'src/main.tsx': 'export {}',
          [`${vendored}.ts`]: 'export const value = 1',
          'packages/sim/core/x.ts': `import { value } from '../../../${vendored}${suffix}'\nexport const y = value`,
        })
        expect([vendored + suffix, found]).toEqual([vendored + suffix, []])
      }
    }
    const found = describeAll({
      'src/main.tsx': 'export {}',
      'vendor/kernelspace/src/lib/forge/run.ts': 'export const run = 1',
      'packages/sim/core/x.ts': "import { run } from '../../../vendor/kernelspace/src/lib/forge/run'\nexport const y = run",
    })
    expect(found).toEqual([expect.stringContaining('reaches vendor')])
  })

  test('let packages/sim and packages/play import no npm package, and the other packages import what they need', () => {
    const importing = (name: string, specifier: string) =>
      describeAll({ 'src/main.tsx': 'export {}', [`packages/${name}/x.ts`]: `import * as lib from '${specifier}'\nexport const y = lib` })
    for (const name of ['sim', 'play']) {
      for (const specifier of ['react', 'clsx', 'zod', 'node:fs', 'node:crypto']) expect([name, specifier, importing(name, specifier).length]).toEqual([name, specifier, 1])
    }
    for (const name of ['ledger', 'schema', 'verify']) expect([name, importing(name, 'zod')]).toEqual([name, []])
  })

  test('let a package read a data file from outside itself, as A§13 has packages/sim read public/traces, but never content/', () => {
    const importing = (specifier: string, name = 'sim') =>
      describeAll({ 'src/main.tsx': 'export {}', [`packages/${name}/workload/x.ts`]: `import data from '${specifier}'\nexport const y = data` })
    expect(importing('../../../public/traces/burstgpt-v2-busiest-hour.json')).toEqual([])
    expect(importing('../../../content/claims/sample.yaml')).toEqual([expect.stringContaining('nothing imports content/')])
    expect(importing('../../../content/modules/tr2/module.md?raw', 'schema')).toEqual([expect.stringContaining('nothing imports content/')])
    const fromSrc = describeAll({ 'src/main.tsx': 'export {}', 'src/x.ts': "import md from '../content/modules/tr2/module.md?raw'\nexport const y = md" })
    expect(fromSrc).toEqual([expect.stringContaining('nothing imports content/')])
    // src/content is the renderer for the compiled content: a different folder with a similar name.
    expect(describeAll({ 'src/main.tsx': "import './content/render'", 'src/content/render.ts': 'export const y = 1' })).toEqual([])
  })

  test('let src import any package, by alias or by path, and let a package import its own folder through `@es`', () => {
    const found = describeAll({
      'src/main.tsx': "import { a } from '@es/sim'\nimport { b } from '../packages/play/index'\nexport const c = [a, b]",
      'packages/sim/index.ts': 'export const a = 1',
      'packages/play/index.ts': 'export const b = 2',
    })
    expect(found).toEqual([])
  })

  test('report an import it cannot resolve, a package outside the five, and nothing in declaration files or generated output', () => {
    expect(describeAll({ 'src/main.tsx': "import './gone'" })).toEqual(["src/main.tsx:1 cannot resolve './gone', so its imports cannot be checked"])
    expect(describeAll({ 'src/main.tsx': 'export {}', 'packages/extra/index.ts': 'export {}' })).toEqual([
      expect.stringContaining('packages/extra is not one of the five packages'),
    ])
    const quiet = describeAll({
      'src/main.tsx': 'export {}',
      'src/types/three.d.ts': "import { Scene } from 'three'\nexport type X = Scene",
      'src/content/generated/index.ts': "import 'three'",
    })
    expect(quiet).toEqual([])
  })
})
