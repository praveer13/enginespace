/*
 * The third-party licences of the site (scripts/pages/third-party-licenses.ts; the publication audit's finding licensing#6).
 *
 *   - The collect-and-render step, on a small fixture in a temporary folder: two packages with a notice (one LICENSE, one LICENCE.md with
 *     a NOTICE beside it) and one without, which must fail with its name. Then the order, the licence labels, the file names that count,
 *     the text that the repository keeps for a package that ships none, NOTICE and the texts of LICENSES/ after the packages, and the rule
 *     that no path of this machine is written.
 *   - The plugin's hooks, driven by hand, and then a real `vite build` of a miniature project with a lazy chunk and a worker, the way
 *     the app's own build has them: the worker's package is in the file only because of the second plugin, and the gate says so when the
 *     build leaves the second plugin out.
 *   - The gate (checkShipped) on a build that is right, and on each way it can be wrong.
 *   - third-party/notices.json against the lockfile and the installed packages, and the About page's link.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { Plugin } from 'vite'
import {
  checkShipped,
  collect,
  idOf,
  LICENCES_FILE,
  LicenceError,
  loadSupplied,
  loadTexts,
  NOTICE_FILE,
  packageRootOf,
  packagesIn,
  parseRecord,
  RECORD_FILE,
  recordOf,
  render,
  SUPPLIED_FILE,
  thirdPartyLicenses,
} from '../../scripts/pages/third-party-licenses'
import type { Collection, Dependency, RepositoryText, Shipped } from '../../scripts/pages/third-party-licenses'
import { Component as About } from '../../src/pages/About'
import { read, root } from '../ci/support'

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-licences-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/* ------------------------------------------------------------------------------------------------------------------ */
/* A fixture project on disk                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Pkg {
  name: string
  version?: string
  /** package.json's `license`; left out of the file when undefined. */
  license?: unknown
  /** Other package.json fields. */
  manifest?: Record<string, unknown>
  /** The files of the folder besides package.json and index.js, by name. */
  files?: Record<string, string>
}

let counter = 0
const fresh = (): string => {
  const dir = path.join(scratch, `project-${(counter += 1)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Writes the packages into `<project>/node_modules`, and returns the id of the module that stands for each, as Rollup would give it. */
function install(project: string, packages: readonly Pkg[]): Record<string, string> {
  const ids: Record<string, string> = {}
  for (const { name, version = '1.0.0', license, manifest = {}, files = {} } of packages) {
    const dir = path.join(project, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version, ...(license === undefined ? {} : { license }), main: 'index.js', type: 'module', ...manifest }))
    writeFileSync(path.join(dir, 'index.js'), `export default ${JSON.stringify(name)}\n`)
    for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text)
    ids[name] = path.join(dir, 'index.js')
  }
  return ids
}

const MIT = (holder: string) => `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this fixture.\n`
const NOTICE_TEXT = 'enginespace: third-party notices\n\nThe fixture NOTICE: kernelspace, ts-fsrs and the fonts.\n'

/** Two packages with a notice and one without, and a module in each. */
function threePackages(): { project: string; ids: Record<string, string> } {
  const project = fresh()
  writeFileSync(path.join(project, 'NOTICE'), NOTICE_TEXT)
  const ids = install(project, [
    // CRLF line ends and a byte-order mark, as a package from another platform can ship them.
    { name: 'pkg-a', version: '1.2.3', license: 'MIT', files: { LICENSE: `\uFEFF${MIT('A Authors').replaceAll('\n', '\r\n')}` } },
    { name: 'pkg-b', version: '2.0.0', license: { type: 'Apache-2.0' }, files: { 'LICENCE.md': 'Apache License\nVersion 2.0, fixture text\n', NOTICE: 'pkg-b\nCopyright B Authors\n' } },
    { name: 'pkg-none', version: '0.1.0', license: 'MIT', files: { 'README.md': 'no licence file here\n' } },
  ])
  return { project, ids }
}

const modulesOf = (entries: Record<string, readonly string[]>): Map<string, readonly string[]> => new Map(Object.entries(entries))

/* ------------------------------------------------------------------------------------------------------------------ */
/* Which package a module belongs to                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('packageRootOf', () => {
  test('is the folder of the package, scoped or not, whatever file of it the module is', () => {
    expect(packageRootOf('/p/node_modules/react/index.js')).toBe('/p/node_modules/react')
    expect(packageRootOf('/p/node_modules/react-dom/cjs/react-dom.production.js')).toBe('/p/node_modules/react-dom')
    expect(packageRootOf('/p/node_modules/@radix-ui/react-id/dist/index.mjs')).toBe('/p/node_modules/@radix-ui/react-id')
  })

  test('is the innermost package when one sits in another one\'s node_modules', () => {
    expect(packageRootOf('/p/node_modules/a/node_modules/b/lib/x.js')).toBe('/p/node_modules/a/node_modules/b')
    expect(packageRootOf('/p/node_modules/a/node_modules/@s/b/x.js')).toBe('/p/node_modules/a/node_modules/@s/b')
  })

  test('is not fooled by a package.json further down: the folder under node_modules is the package', () => {
    expect(packageRootOf('/p/node_modules/c/dist/esm/index.js')).toBe('/p/node_modules/c')
  })

  test('sees through the prefix, the query and the fragment that Rollup and Vite add, and through Windows separators', () => {
    expect(packageRootOf('\0/p/node_modules/d/index.js?commonjs-module')).toBe('/p/node_modules/d')
    expect(packageRootOf('/p/node_modules/e/x.js?v=1#top')).toBe('/p/node_modules/e')
    expect(packageRootOf('C:\\p\\node_modules\\f\\index.js')).toBe('C:/p/node_modules/f')
  })

  test('is null for our own modules, the vendored ones, Vite\'s virtual ones, and a path that ends at a folder', () => {
    for (const id of ['/p/src/main.tsx', '/p/vendor/kernelspace/src/lib/rng.ts', '\0commonjsHelpers.js', '\0vite/preload-helper.js', '/p/node_modules/g', '/p/node_modules/@scope', '/p/node_modules/@scope/pkg']) {
      expect([id, packageRootOf(id)]).toEqual([id, null])
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Collect and render                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('collect and render', () => {
  test('lists each package with its name and version, its licence and the full text of its notice, sorted by name, and ends with NOTICE', () => {
    const { project, ids } = threePackages()
    const collection = collect(modulesOf({ 'assets/index-x.js': [ids['pkg-b'], ids['pkg-a'], path.join(project, 'src/main.ts')] }))
    expect(collection.dependencies.map(idOf)).toEqual(['pkg-a@1.2.3', 'pkg-b@2.0.0'])
    const text = render(collection.dependencies, read2(project, 'NOTICE'))
    const lines = text.split('\n')
    // A heading is a line of its own, with the licence on the next, between two rules.
    const at = lines.indexOf('pkg-a@1.2.3')
    expect(lines.slice(at - 1, at + 3)).toEqual(['='.repeat(76), 'pkg-a@1.2.3', 'Licence: MIT', '='.repeat(76)])
    expect(lines[lines.indexOf('pkg-b@2.0.0') + 1]).toBe('Licence: Apache-2.0')
    // The text is the file's, with `\n` for line ends, no byte-order mark and no blank line around it.
    expect(text).toContain('MIT License\n\nCopyright (c) A Authors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this fixture.\n')
    expect(text).not.toContain('\r')
    expect(text).not.toContain('\uFEFF')
    expect(text.indexOf('pkg-a@1.2.3')).toBeLessThan(text.indexOf('pkg-b@2.0.0'))
    expect(text.endsWith(`NOTICE\n${'='.repeat(76)}\n\n${NOTICE_TEXT}`)).toBe(true)
  })

  test('puts every notice file of a package in, each under its name: LICENCE.md and NOTICE', () => {
    const { ids } = threePackages()
    const text = render(collect(modulesOf({ 'assets/x.js': [ids['pkg-b']] })).dependencies, 'N')
    expect(text).toContain('--- LICENCE.md ---\n\nApache License\nVersion 2.0, fixture text\n\n--- NOTICE ---\n\npkg-b\nCopyright B Authors\n')
  })

  test('puts NOTICE after the packages, and after NOTICE the texts of LICENSES/ that it points to, each under its path', () => {
    const { project, ids } = threePackages()
    mkdirSync(path.join(project, 'LICENSES/sub'), { recursive: true })
    writeFileSync(path.join(project, 'LICENSES/MIT.txt'), 'MIT text\r\n')
    writeFileSync(path.join(project, 'LICENSES/Apache-2.0.txt'), '\n\n  Apache text, indented\n\n')
    writeFileSync(path.join(project, 'LICENSES/sub/Other.txt'), 'in a folder of a folder')
    const texts = loadTexts(project)
    expect(texts).toEqual([
      { file: 'LICENSES/Apache-2.0.txt', text: '  Apache text, indented' },
      { file: 'LICENSES/MIT.txt', text: 'MIT text' },
    ])
    const text = render(collect(modulesOf({ 'assets/x.js': [ids['pkg-a']] })).dependencies, NOTICE_TEXT, texts)
    const rule = '='.repeat(76)
    expect(text.endsWith(`${rule}\nNOTICE\n${rule}\n\n${NOTICE_TEXT.trimEnd()}\n\n${rule}\nLICENSES/Apache-2.0.txt\n${rule}\n\n  Apache text, indented\n\n${rule}\nLICENSES/MIT.txt\n${rule}\n\nMIT text\n`)).toBe(true)
    expect(text.indexOf('pkg-a@1.2.3')).toBeLessThan(text.indexOf('\nNOTICE\n'))
  })

  test('has no texts to put in for a project with no LICENSES/ folder', () => {
    expect(loadTexts(fresh())).toEqual([])
  })

  test('fails the build for a package with no notice, naming it and where it is, and writes nothing', () => {
    const { project, ids } = threePackages()
    const attempt = () => collect(modulesOf({ 'assets/x.js': [ids['pkg-a'], ids['pkg-b'], ids['pkg-none']] }))
    expect(attempt).toThrow(LicenceError)
    expect(attempt).toThrow('pkg-none@0.1.0 (node_modules/pkg-none)')
    let message = ''
    try {
      attempt()
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('no LICENSE, LICENCE, COPYING or NOTICE file')
    expect(message).toContain(SUPPLIED_FILE)
    // The message says where the package sits from its node_modules on, and never where the project is on this machine.
    expect(message).not.toContain(project)
    expect(message).not.toContain(scratch)
  })

  test('names every package that has none, once, in one sentence', () => {
    const project = fresh()
    const ids = install(project, [{ name: 'x-one' }, { name: '@scope/x-two', version: '3.0.0' }, { name: 'x-ok', files: { LICENSE: MIT('X') } }])
    let problems: readonly string[] = []
    try {
      collect(modulesOf({ 'assets/a.js': [ids['x-one'], ids['@scope/x-two']], 'assets/b.js': [ids['x-one'], ids['x-ok']] }))
    } catch (error) {
      problems = (error as LicenceError).problems
    }
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('2 packages in the site ship no LICENSE')
    expect(problems[0]).toContain('@scope/x-two@3.0.0 (node_modules/@scope/x-two), x-one@1.0.0 (node_modules/x-one)')
    expect(problems[0]).not.toContain('x-ok')
  })

  test('fails for a package whose package.json cannot be read, naming its folder', () => {
    const project = fresh()
    mkdirSync(path.join(project, 'node_modules/broken'), { recursive: true })
    writeFileSync(path.join(project, 'node_modules/broken/package.json'), '{ not json')
    writeFileSync(path.join(project, 'node_modules/broken/LICENSE'), MIT('Broken'))
    expect(() => collect(modulesOf({ 'assets/x.js': [path.join(project, 'node_modules/broken/index.js')] }))).toThrow('node_modules/broken has no package.json that can be read')
  })

  test('lists a package once, whichever chunk holds it and however many folders hold its version, and a second version beside it', () => {
    const project = fresh()
    const ids = install(project, [{ name: 'dup', version: '1.0.0', files: { LICENSE: MIT('Dup') } }])
    const nested = install(path.join(project, 'node_modules/host'), [{ name: 'dup', version: '1.0.0', files: { LICENSE: MIT('Dup') } }])
    const newer = install(path.join(project, 'node_modules/other'), [{ name: 'dup', version: '1.10.0', files: { LICENSE: MIT('Dup') } }])
    const collection = collect(modulesOf({ 'assets/a.js': [ids.dup], 'assets/b.js': [ids.dup, nested.dup], 'assets/c.js': [newer.dup] }))
    expect(collection.dependencies.map(idOf)).toEqual(['dup@1.0.0', 'dup@1.10.0'])
    expect(collection.chunks).toEqual({ 'assets/a.js': ['dup@1.0.0'], 'assets/b.js': ['dup@1.0.0'], 'assets/c.js': ['dup@1.10.0'] })
  })

  test('sorts by name as a code-point comparison does: scopes first, and the same on every machine', () => {
    const project = fresh()
    const ids = install(
      project,
      ['zeta', 'alpha', '@scope/mid', 'Beta'].map((name) => ({ name, files: { LICENSE: MIT(name) } })),
    )
    const names = collect(modulesOf({ 'assets/x.js': Object.values(ids) })).dependencies.map((dependency) => dependency.name)
    expect(names).toEqual(['@scope/mid', 'Beta', 'alpha', 'zeta'])
  })

  test('reads the licence label from `license` as a string, as `{ type }`, from the old `licenses` array, and says so when there is none', () => {
    const project = fresh()
    const files = { LICENSE: MIT('L') }
    const ids = install(project, [
      { name: 'lic-string', license: 'ISC', files },
      { name: 'lic-object', license: { type: 'BSD-3-Clause' }, files },
      { name: 'lic-array', manifest: { licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }, files },
      { name: 'lic-none', files },
    ])
    const text = render(collect(modulesOf({ 'assets/x.js': Object.values(ids) })).dependencies, 'N')
    const licenceOf = (id: string) => text.split('\n')[text.split('\n').indexOf(id) + 1]
    expect(licenceOf('lic-string@1.0.0')).toBe('Licence: ISC')
    expect(licenceOf('lic-object@1.0.0')).toBe('Licence: BSD-3-Clause')
    expect(licenceOf('lic-array@1.0.0')).toBe('Licence: MIT OR Apache-2.0')
    expect(licenceOf('lic-none@1.0.0')).toBe('Licence: not named in its package.json (the text below is its licence)')
  })

  test('takes LICENSE, LICENCE, COPYING and NOTICE with an extension or a suffix, and not a script, a data file or a folder with such a name', () => {
    const project = fresh()
    const ids = install(project, [
      { name: 'names', files: { 'LICENSE-MIT': 'mit', 'license.txt': 'txt', COPYING: 'copying', 'Licence.markdown': 'md', 'LICENSE.js': 'script', 'license-checker.json': '{}', 'NOTICES.txt': 'plural' } },
    ])
    mkdirSync(path.join(project, 'node_modules/names/LICENSES'))
    const [dependency] = collect(modulesOf({ 'assets/x.js': [ids.names] })).dependencies
    expect(dependency.notices.map((notice) => notice.file)).toEqual(['COPYING', 'LICENSE-MIT', 'Licence.markdown', 'license.txt'])
  })

  test('writes the same file every time, with no path of this machine in it', () => {
    const { project, ids } = threePackages()
    const once = (): string => render(collect(modulesOf({ 'assets/x.js': [ids['pkg-a'], ids['pkg-b']] })).dependencies, NOTICE_TEXT)
    expect(once()).toBe(once())
    expect(once()).not.toContain(project)
    expect(once()).not.toContain(tmpdir())
  })

  test('records for each script the packages inside it, and the packages named by hand', () => {
    const project = fresh()
    const ids = install(project, [
      { name: 'in-a', files: { LICENSE: MIT('A') } },
      { name: 'in-b', files: { LICENSE: MIT('B') } },
      { name: 'by-hand', version: '9.9.9', files: { LICENSE: MIT('H') } },
    ])
    const collection = collect(modulesOf({ 'assets/b.js': [ids['in-b'], ids['in-a']], 'assets/a.js': [ids['in-a']], 'assets/none.js': ['/p/src/x.ts'] }), [path.join(project, 'node_modules/by-hand')])
    expect(recordOf(collection)).toEqual({ chunks: { 'assets/a.js': ['in-a@1.0.0'], 'assets/b.js': ['in-a@1.0.0', 'in-b@1.0.0'], 'assets/none.js': [] }, alsoShips: ['by-hand@9.9.9'] })
    expect(collection.dependencies.map(idOf)).toEqual(['by-hand@9.9.9', 'in-a@1.0.0', 'in-b@1.0.0'])
    expect(packagesIn(recordOf(collection))).toEqual(['by-hand@9.9.9', 'in-a@1.0.0', 'in-b@1.0.0'])
  })
})

/** The text of a file of a fixture project. */
function read2(project: string, file: string): string {
  return readFileSync(path.join(project, file), 'utf8')
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The text that the repository keeps for a package that ships none                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the texts that the repository keeps (third-party/notices.json)', () => {
  /** A project with a package that ships no notice and an index that supplies one for it at a version. */
  function project(version: string, notice: Record<string, unknown> = {}): { dir: string; module: string } {
    const dir = fresh()
    const ids = install(dir, [{ name: 'bare', version, license: 'MIT' }])
    mkdirSync(path.join(dir, 'third-party'))
    writeFileSync(path.join(dir, 'third-party/bare.txt'), 'MIT License\n\nCopyright (c) Bare Authors\n')
    writeFileSync(
      path.join(dir, SUPPLIED_FILE),
      JSON.stringify({ notices: [{ file: 'bare.txt', licence: 'MIT', source: 'https://example.invalid/bare/LICENSE', basis: 'Read from the repository, and checked against nothing else.', packages: ['bare@1.0.0'], ...notice }] }),
    )
    return { dir, module: ids.bare }
  }

  test('stands in for a package that ships none, at the version listed, and says above the text where it came from', () => {
    const { dir, module } = project('1.0.0')
    const supplied = loadSupplied(dir)
    expect([...supplied.keys()]).toEqual(['bare@1.0.0'])
    const text = render(collect(modulesOf({ 'assets/x.js': [module] }), [], supplied).dependencies, 'N')
    expect(text).toContain(
      [
        'bare@1.0.0',
        'Licence: MIT',
        '='.repeat(76),
        '',
        'This package ships no licence file. enginespace keeps the text below for it, in third-party/bare.txt.',
        'Source: https://example.invalid/bare/LICENSE',
        'Read from the repository, and checked against nothing else.',
        '',
        'MIT License',
        '',
        'Copyright (c) Bare Authors',
      ].join('\n'),
    )
  })

  test('is not used for another version of the package: a bump fails the build until the licence is read again', () => {
    const { dir, module } = project('1.0.1')
    expect(() => collect(modulesOf({ 'assets/x.js': [module] }), [], loadSupplied(dir))).toThrow('bare@1.0.1 (node_modules/bare)')
  })

  test('gives way to the package\'s own file, which is the one that ships', () => {
    const { dir, module } = project('1.0.0')
    writeFileSync(path.join(dir, 'node_modules/bare/LICENSE'), 'The package\'s own licence\n')
    const [dependency] = collect(modulesOf({ 'assets/x.js': [module] }), [], loadSupplied(dir)).dependencies
    expect(dependency.supplied).toBeUndefined()
    expect(dependency.notices).toEqual([{ file: 'LICENSE', text: 'The package\'s own licence' }])
  })

  test('is empty when the project has no index, and an index that cannot be used fails with a sentence', () => {
    expect(loadSupplied(fresh()).size).toBe(0)
    const { dir } = project('1.0.0')
    const index = path.join(dir, SUPPLIED_FILE)
    const rewrite = (value: unknown) => writeFileSync(index, typeof value === 'string' ? value : JSON.stringify(value))
    rewrite('{ nope')
    expect(() => loadSupplied(dir)).toThrow(`${SUPPLIED_FILE} is not JSON`)
    rewrite({})
    expect(() => loadSupplied(dir)).toThrow('has no "notices" array')
    rewrite({ notices: [{ file: 'missing.txt', licence: 'MIT', source: 's', basis: 'b', packages: ['bare@1.0.0'] }] })
    expect(() => loadSupplied(dir)).toThrow('names missing.txt, which is not a file in third-party/')
    rewrite({ notices: [{ file: '../NOTICE', licence: 'MIT', source: 's', basis: 'b', packages: ['bare@1.0.0'] }] })
    expect(() => loadSupplied(dir)).toThrow('names ../NOTICE, which is not a file in third-party/')
    rewrite({ notices: [{ file: 'bare.txt', licence: 'MIT', source: 's', packages: ['bare@1.0.0'] }] })
    expect(() => loadSupplied(dir)).toThrow('has no "basis" string')
    rewrite({ notices: [{ file: 'bare.txt', licence: 'MIT', source: 's', basis: 'b', packages: [] }] })
    expect(() => loadSupplied(dir)).toThrow('has no "packages" array of name@version strings')
    const entry = { file: 'bare.txt', licence: 'MIT', source: 's', basis: 'b', packages: ['bare@1.0.0'] }
    rewrite({ notices: [entry, entry] })
    expect(() => loadSupplied(dir)).toThrow('lists bare@1.0.0 twice')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The plugin's hooks                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Emitted {
  type: string
  fileName: string
  source: string
}

type Hook = (this: unknown, options: unknown, bundle: Record<string, unknown>) => void

/** Runs a plugin's generateBundle on a bundle of the given chunks, the way Rollup calls it. `error` throws, as `this.error` does. */
function generate(plugin: Plugin, chunks: Record<string, readonly string[]>): Emitted[] {
  const emitted: Emitted[] = []
  const context = {
    emitFile: (file: Emitted) => void emitted.push(file),
    error: (message: string): never => {
      throw new Error(message)
    },
  }
  const bundle: Record<string, unknown> = {}
  for (const [fileName, moduleIds] of Object.entries(chunks)) bundle[fileName] = { type: 'chunk', fileName, moduleIds }
  bundle['assets/style.css'] = { type: 'asset', fileName: 'assets/style.css' }
  ;(plugin.generateBundle as unknown as Hook).call(context, {}, bundle)
  return emitted
}

describe('the plugin', () => {
  test('emits the licence file at the root and the record beside the manifest, from the chunks of the bundle and not its assets', () => {
    const { project, ids } = threePackages()
    const { plugin } = thirdPartyLicenses(project)
    const emitted = generate(plugin, { 'assets/index-x.js': [ids['pkg-a']], 'assets/lazy-y.js': [ids['pkg-b']] })
    expect(emitted.map((file) => [file.type, file.fileName])).toEqual([
      ['asset', LICENCES_FILE],
      ['asset', RECORD_FILE],
    ])
    expect(emitted[0].source).toContain('\npkg-a@1.2.3\n')
    expect(emitted[0].source).toContain('\npkg-b@2.0.0\n')
    expect(emitted[0].source.endsWith(NOTICE_TEXT)).toBe(true)
    expect(JSON.parse(emitted[1].source)).toEqual({ chunks: { 'assets/index-x.js': ['pkg-a@1.2.3'], 'assets/lazy-y.js': ['pkg-b@2.0.0'] }, alsoShips: [] })
  })

  test('puts the texts of LICENSES/ in, after NOTICE', () => {
    const { project, ids } = threePackages()
    mkdirSync(path.join(project, 'LICENSES'))
    writeFileSync(path.join(project, 'LICENSES/Apache-2.0.txt'), 'Apache fixture text\n')
    const { plugin } = thirdPartyLicenses(project)
    const [text] = generate(plugin, { 'assets/x.js': [ids['pkg-a']] })
    expect(text.source.indexOf('\nNOTICE\n')).toBeLessThan(text.source.indexOf('\nLICENSES/Apache-2.0.txt\n'))
    expect(text.source.endsWith('LICENSES/Apache-2.0.txt\n' + '='.repeat(76) + '\n\nApache fixture text\n')).toBe(true)
  })

  test('adds the scripts of a worker, which the second plugin saw, and the packages inside them', () => {
    const { project, ids } = threePackages()
    const { plugin, workerPlugin } = thirdPartyLicenses(project)
    generate(workerPlugin, { 'assets/w.worker-z.js': [ids['pkg-b']] })
    const [text, record] = generate(plugin, { 'assets/index-x.js': [ids['pkg-a']] })
    expect(text.source).toContain('\npkg-b@2.0.0\n')
    expect(JSON.parse(record.source).chunks).toEqual({ 'assets/index-x.js': ['pkg-a@1.2.3'], 'assets/w.worker-z.js': ['pkg-b@2.0.0'] })
  })

  test('names the packages named by hand even when no script holds a module of them', () => {
    const { project, ids } = threePackages()
    const { plugin } = thirdPartyLicenses(project, { alsoShips: ['pkg-b'] })
    const [text, record] = generate(plugin, { 'assets/index-x.js': [ids['pkg-a']] })
    expect(text.source).toContain('\npkg-b@2.0.0\n')
    expect(JSON.parse(record.source)).toEqual({ chunks: { 'assets/index-x.js': ['pkg-a@1.2.3'] }, alsoShips: ['pkg-b@2.0.0'] })
  })

  test('fails the build with the package\'s name, and with a sentence for a project that has no NOTICE', () => {
    const { project, ids } = threePackages()
    const { plugin } = thirdPartyLicenses(project)
    expect(() => generate(plugin, { 'assets/x.js': [ids['pkg-none']] })).toThrow('pkg-none@0.1.0')
    rmSync(path.join(project, 'NOTICE'))
    expect(() => generate(plugin, { 'assets/x.js': [ids['pkg-a']] })).toThrow('NOTICE is missing from the root of the project')
  })

  test('is a plugin of the build alone, and the second one is too', () => {
    const { plugin, workerPlugin } = thirdPartyLicenses(fresh())
    expect([plugin.apply, workerPlugin.apply]).toEqual(['build', 'build'])
    expect(plugin.enforce).toBe('post')
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* A real build of a miniature project                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

const PLUGIN_MODULE = path.join(root, 'scripts/pages/third-party-licenses.ts')

/**
 * A project with a package in the entry, one in a lazy chunk, one in a worker (a module worker, as src/forge/worker-pool.ts has it) and
 * one that nothing imports. `withWorkerPlugin` is false for the build that leaves the second plugin out.
 */
function miniature(withWorkerPlugin: boolean, extra: readonly Pkg[] = []): string {
  const project = fresh()
  writeFileSync(path.join(project, 'NOTICE'), NOTICE_TEXT)
  mkdirSync(path.join(project, 'LICENSES'))
  writeFileSync(path.join(project, 'LICENSES/Apache-2.0.txt'), 'Apache License, fixture text\n')
  install(project, [
    { name: 'pkg-a', version: '1.2.3', license: 'MIT', files: { LICENSE: MIT('A Authors') } },
    { name: 'pkg-b', version: '2.0.0', license: 'Apache-2.0', files: { 'LICENCE.md': 'Apache License, fixture text\n' } },
    { name: '@scope/pkg-c', version: '3.1.0', license: 'ISC', files: { 'LICENSE.txt': 'ISC License, fixture text\n' } },
    { name: 'pkg-unused', version: '4.0.0', license: 'MIT', files: { LICENSE: MIT('Unused') } },
    ...extra,
  ])
  writeFileSync(path.join(project, 'index.html'), '<!doctype html>\n<html><head><meta charset="UTF-8" /></head><body><script type="module" src="/main.ts"></script></body></html>\n')
  writeFileSync(path.join(project, 'main.ts'), "import a from 'pkg-a'\nconst lazy = () => import('./lazy.ts')\nconst worker = new Worker(new URL('./w.worker.ts', import.meta.url), { type: 'module' })\nconsole.log(a, lazy, worker)\n")
  writeFileSync(path.join(project, 'lazy.ts'), "import b from 'pkg-b'\nexport default b\n")
  writeFileSync(path.join(project, 'w.worker.ts'), "import c from '@scope/pkg-c'\nself.postMessage(c)\n")
  writeFileSync(
    path.join(project, 'vite.config.mjs'),
    `import { thirdPartyLicenses } from ${JSON.stringify(PLUGIN_MODULE)}\n` +
      'const licences = thirdPartyLicenses(process.cwd())\n' +
      `export default { plugins: [licences.plugin], ${withWorkerPlugin ? 'worker: { plugins: () => [licences.workerPlugin] }, ' : ''}build: { manifest: true } }\n`,
  )
  return project
}

/** `vite build` of a project with the repository's Vite, and what it wrote. */
function build(project: string): { status: number | null; log: string; dist: string } {
  const run = spawnSync('node', [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.config.mjs'], { cwd: project, encoding: 'utf8' })
  return { status: run.status, log: `${run.stdout}${run.stderr}`, dist: path.join(project, 'dist') }
}

/** What verify:bundle reads of a built project. */
function shippedBy(project: string, dist: string): Shipped {
  const textOf = (file: string): string | null => (existsSync(file) ? readFileSync(file, 'utf8') : null)
  return {
    text: textOf(path.join(dist, LICENCES_FILE)),
    record: textOf(path.join(dist, RECORD_FILE)),
    notice: textOf(path.join(project, NOTICE_FILE)),
    texts: loadTexts(project),
    scripts: readdirSync(path.join(dist, 'assets'))
      .filter((file) => file.endsWith('.js'))
      .map((file) => `assets/${file}`),
  }
}

describe('a real build of a miniature project', () => {
  let project = ''
  let built: ReturnType<typeof build>
  let shipped: Shipped | null = null
  beforeAll(() => {
    project = miniature(true)
    built = build(project)
    shipped = built.status === 0 ? shippedBy(project, built.dist) : null
  }, 120_000)

  test('succeeds, and writes the licence file at the root of dist/ and the record beside the manifest', () => {
    expect(built.log).toContain('built in')
    expect(built.status).toBe(0)
    expect(existsSync(path.join(built.dist, LICENCES_FILE))).toBe(true)
    expect(existsSync(path.join(built.dist, RECORD_FILE))).toBe(true)
    expect(existsSync(path.join(built.dist, '.vite/manifest.json'))).toBe(true)
  })

  test('names the package of the entry, of the lazy chunk and of the worker, and not the one that nothing imports', () => {
    const lines = new Set((shipped?.text ?? '').split('\n'))
    expect(['pkg-a@1.2.3', 'pkg-b@2.0.0', '@scope/pkg-c@3.1.0'].filter((id) => !lines.has(id))).toEqual([])
    expect(lines.has('pkg-unused@4.0.0')).toBe(false)
    expect(shipped?.text).toContain('ISC License, fixture text')
    // NOTICE and the text of LICENSES/ follow the packages, in that order.
    expect(shipped?.text).toContain('\nNOTICE\n')
    expect((shipped?.text ?? '').indexOf('\nNOTICE\n')).toBeLessThan((shipped?.text ?? '').indexOf('\nLICENSES/Apache-2.0.txt\n'))
    expect(shipped?.text).toContain('Apache License, fixture text')
  })

  test('records the worker\'s script with its package, among the scripts of the build', () => {
    const record = parseRecord(shipped?.record ?? '')
    expect(typeof record).toBe('object')
    const chunks = (record as { chunks: Record<string, string[]> }).chunks
    const worker = Object.keys(chunks).filter((file) => /^assets\/w\.worker-/.test(file))
    expect(worker).toHaveLength(1)
    expect(chunks[worker[0]]).toEqual(['@scope/pkg-c@3.1.0'])
    expect(Object.keys(chunks).sort()).toEqual((shipped?.scripts ?? []).slice().sort())
  })

  test('passes the gate', () => {
    expect(checkShipped(shipped as Shipped)).toEqual({ problems: [], packages: ['@scope/pkg-c@3.1.0', 'pkg-a@1.2.3', 'pkg-b@2.0.0'] })
  })

  test('fails the gate for the same project built without the second plugin: the worker\'s script is one the first never saw', () => {
    const bare = miniature(false)
    const second = build(bare)
    expect(second.status).toBe(0)
    const view = shippedBy(bare, second.dist)
    // The file builds without the worker's package, which is the gap the second plugin closes ...
    expect(view.text).not.toContain('\n@scope/pkg-c@3.1.0\n')
    // ... and the gate sees the worker's script in dist/assets and not in the record.
    const { problems } = checkShipped(view)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^dist\/assets\/w\.worker-[\w-]+\.js is a script of the build that the licence plugin never saw/)
  }, 60_000)

  test('fails the build for a package that ships no notice, naming it, and writes no licence file', () => {
    const bad = miniature(true, [{ name: 'pkg-bare', version: '5.0.0', license: 'MIT' }])
    writeFileSync(path.join(bad, 'lazy.ts'), "import b from 'pkg-b'\nimport bare from 'pkg-bare'\nexport default [b, bare]\n")
    const failed = build(bad)
    expect(failed.status).not.toBe(0)
    expect(failed.log).toContain('pkg-bare@5.0.0 (node_modules/pkg-bare)')
    expect(failed.log).toContain('no LICENSE, LICENCE, COPYING or NOTICE file')
    expect(existsSync(path.join(failed.dist, LICENCES_FILE))).toBe(false)
  }, 60_000)
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The gate                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('checkShipped', () => {
  const NOTICE = 'enginespace: third-party notices\n\nThe fixture NOTICE.\n'
  const TEXTS: RepositoryText[] = [{ file: 'LICENSES/Apache-2.0.txt', text: 'Apache License fixture text' }]
  const dependency = (name: string, version: string): Dependency => ({ name, version, identifier: 'MIT', notices: [{ file: 'LICENSE', text: 'MIT fixture' }] })
  const collection: Collection = {
    dependencies: [dependency('a', '1.0.0'), dependency('b', '2.0.0'), dependency('tailwindcss', '3.4.19')],
    chunks: { 'assets/index-x.js': ['a@1.0.0'], 'assets/lazy-y.js': ['b@2.0.0'], 'assets/w.worker-z.js': [], 'assets/plain-p.js': [] },
    alsoShips: ['tailwindcss@3.4.19'],
  }
  const right = (): Shipped => ({
    text: render(collection.dependencies, NOTICE, TEXTS),
    record: JSON.stringify(recordOf(collection)),
    notice: NOTICE,
    texts: TEXTS,
    scripts: Object.keys(collection.chunks),
  })

  test('passes a build whose file names every package of the record and ends with NOTICE, and returns the packages', () => {
    expect(checkShipped(right())).toEqual({ problems: [], packages: ['a@1.0.0', 'b@2.0.0', 'tailwindcss@3.4.19'] })
  })

  test('fails a build with no licence file, and one with no record', () => {
    expect(checkShipped({ ...right(), text: null }).problems).toEqual([expect.stringContaining('dist/third-party-licenses.txt does not exist')])
    expect(checkShipped({ ...right(), record: null }).problems).toEqual([expect.stringContaining('dist/.vite/third-party.json does not exist')])
  })

  test('fails a record that is not the plugin\'s', () => {
    for (const record of ['not json', '[]', '{}', '{"chunks":[],"alsoShips":[]}', '{"chunks":{"assets/x.js":[1]},"alsoShips":[]}', '{"chunks":{},"alsoShips":"tailwindcss"}']) {
      expect([record, checkShipped({ ...right(), record }).problems.length]).toEqual([record, 1])
    }
  })

  test('fails a package of the record that the file has no section for, naming it, and does not count its mention in another section', () => {
    const text = right().text?.replace('\nb@2.0.0\n', '\nsee b@2.0.0 elsewhere\n') ?? ''
    expect(checkShipped({ ...right(), text }).problems).toEqual(['dist/third-party-licenses.txt has no section for b@2.0.0, which the build\'s scripts hold'])
    const named = right().text?.replace('\ntailwindcss@3.4.19\n', '\n') ?? ''
    expect(checkShipped({ ...right(), text: named }).problems).toEqual([expect.stringContaining('no section for tailwindcss@3.4.19')])
  })

  test('fails a script of dist/assets that the record does not hold: a worker the plugin never saw', () => {
    const { problems } = checkShipped({ ...right(), scripts: [...right().scripts, 'assets/receipt.worker-q.js'] })
    expect(problems).toEqual([expect.stringMatching(/^dist\/assets\/receipt\.worker-q\.js is a script of the build that the licence plugin never saw \(a worker bundle, if it is one: vite\.config\.ts puts the plugin in worker\.plugins\)/)])
    const two = checkShipped({ ...right(), scripts: [...right().scripts, 'assets/a.js', 'assets/b.js'] }).problems
    expect(two).toEqual([expect.stringContaining('dist/assets/a.js, dist/assets/b.js are scripts of the build')])
  })

  test('fails a file that does not carry NOTICE as the tree has it, and a tree with no NOTICE', () => {
    expect(checkShipped({ ...right(), notice: `${NOTICE}A line that was added later.\n` }).problems).toEqual([expect.stringContaining('does not carry NOTICE word for word')])
    expect(checkShipped({ ...right(), notice: null }).problems).toEqual(['NOTICE is missing from the tree, and the file must carry it'])
  })

  test('fails a file that lacks a text of LICENSES/ that NOTICE points to, naming the text', () => {
    const more: RepositoryText[] = [...TEXTS, { file: 'LICENSES/MIT.txt', text: 'MIT fixture text that the build did not carry' }]
    expect(checkShipped({ ...right(), texts: more }).problems).toEqual([
      'dist/third-party-licenses.txt does not carry LICENSES/MIT.txt word for word: NOTICE points to a text that the site does not serve',
    ])
    // A text that the tree has changed since the build is as good as one that is missing.
    expect(checkShipped({ ...right(), texts: [{ file: 'LICENSES/Apache-2.0.txt', text: 'Apache License fixture text, edited' }] }).problems).toHaveLength(1)
  })

  test('takes the CRLF of a file that was written on another platform for its LF', () => {
    const view = right()
    const crlf = TEXTS.map(({ file, text }) => ({ file, text: text.replaceAll('\n', '\r\n') }))
    expect(checkShipped({ ...view, text: view.text?.replaceAll('\n', '\r\n') ?? '', notice: NOTICE.replaceAll('\n', '\r\n'), texts: crlf })).toEqual({ problems: [], packages: ['a@1.0.0', 'b@2.0.0', 'tailwindcss@3.4.19'] })
  })

  test('fails a record that names no package: a collector that found nothing is not a build with nothing to license', () => {
    const empty = JSON.stringify({ chunks: { 'assets/index-x.js': [] }, alsoShips: [] })
    expect(checkShipped({ ...right(), record: empty, scripts: ['assets/index-x.js'] }).problems).toEqual([expect.stringContaining('names no package')])
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* The repository's own texts                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Notice {
  file: string
  licence: string
  sha256: string
  source: string
  basis: string
  packages: string[]
}

describe('third-party/notices.json', () => {
  const index = JSON.parse(read(SUPPLIED_FILE)) as { schema: string; fetched: string; userAgent: string; notices: Notice[] }
  const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { version: string; dev?: boolean }> }
  const listed = index.notices.flatMap((notice) => notice.packages.map((id) => ({ id, notice })))
  const split = (id: string): [string, string] => [id.slice(0, id.lastIndexOf('@')), id.slice(id.lastIndexOf('@') + 1)]

  test('is dated, and says which User-Agent the texts were fetched with: the generic one, with no name in it', () => {
    expect(index.schema).toBe('enginespace/third-party-notices@1')
    expect(index.fetched).toBe('2026-11-08')
    expect(index.userAgent).toBe('Mozilla/5.0 (X11; Linux x86_64)')
    expect(index.notices.length).toBeGreaterThan(0)
  })

  test('keeps each text unchanged: its SHA-256 is the one listed, and each file of the folder is listed', () => {
    for (const notice of index.notices) {
      expect([notice.file, createHash('sha256').update(readFileSync(path.join(root, 'third-party', notice.file))).digest('hex')]).toEqual([notice.file, notice.sha256])
    }
    const files = readdirSync(path.join(root, 'third-party')).filter((file) => file.endsWith('.txt'))
    expect(files.sort()).toEqual(index.notices.map((notice) => notice.file).sort())
  })

  test('names where each text was read: a file of a repository at a full commit, and says how far the text is known to hold', () => {
    for (const notice of index.notices) {
      expect([notice.file, notice.source]).toEqual([notice.file, expect.stringMatching(/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}\/LICENSE$/)])
      expect([notice.file, notice.basis]).toEqual([notice.file, expect.stringContaining('[measured 2026-11-08]')])
      expect(notice.basis).toContain(notice.source.split('/')[5])
    }
  })

  test('lists only packages at the version that package-lock.json has, so that a bump or a removal shows here and not as a stale text', () => {
    expect(listed.length).toBeGreaterThan(0)
    for (const { id } of listed) {
      const [name, version] = split(id)
      expect([id, lock.packages[`node_modules/${name}`]?.version]).toEqual([id, version])
    }
  })

  test('lists only packages that ship no notice file, since a text for one that ships its own is never used', () => {
    for (const { id } of listed) {
      const [name] = split(id)
      const files = readdirSync(path.join(root, 'node_modules', name)).filter((file) => /^(?:licen[cs]e|copying|notice)(?:[-_.].*)?$/i.test(file) && !/\.(?:[cm]?[jt]sx?|json|map)$/i.test(file))
      expect([id, files]).toEqual([id, []])
    }
  })

  test('gives the licence that the package\'s own package.json names, and lists each package once', () => {
    for (const { id, notice } of listed) {
      const [name] = split(id)
      const manifest = JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')) as { license?: string }
      expect([id, manifest.license]).toEqual([id, notice.licence])
    }
    expect(new Set(listed.map(({ id }) => id)).size).toBe(listed.length)
  })

  test('loads as the plugin reads it, one text per package', () => {
    const supplied = loadSupplied(root)
    expect([...supplied.keys()].sort()).toEqual(listed.map(({ id }) => id).sort())
    for (const { id, notice } of listed) expect(supplied.get(id)?.text).toBe(readFileSync(path.join(root, 'third-party', notice.file), 'utf8').replace(/\n+$/, ''))
  })

  test('leaves the bytes alone: no line-ending conversion in third-party/', () => {
    expect(read('third-party/.gitattributes')).toMatch(/^\* -text$/m)
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* Where the file is named                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the file, named where a reader looks', () => {
  test('NOTICE names it in its opening, before the first section, with the texts of LICENSES/ that it carries', () => {
    const notice = read('NOTICE')
    const opening = notice.slice(0, notice.indexOf('='.repeat(76))).replace(/\s+/g, ' ')
    expect(opening).toContain('third-party-licenses.txt')
    expect(opening).toContain('the texts of LICENSES/ that this one points to')
  })

  test('README names it, in the gate\'s line and in the table of the repository', () => {
    const readme = read('README.md')
    expect(readme).toContain('dist/third-party-licenses.txt names every npm package the scripts hold')
    expect(readme).toContain('scripts/pages/third-party-licenses.ts')
    expect(readme).toContain('(third-party/notices.json)')
  })

  describe('the About page', () => {
    const html = renderToString(createElement(About))

    test('links the file at the site\'s root, and says it is a link to another document', () => {
      const link = /<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s.exec(html)
      expect(link?.[1]).toBe('/third-party-licenses.txt')
      expect(link?.[2]).toContain('third-party-licenses.txt')
      expect(html).toContain('opens in a new tab')
    })

    test('names the font licences that sit in /fonts/, as fonts.json and NOTICE have them, each a file that the site serves', () => {
      const faces = (JSON.parse(read('public/fonts/fonts.json')) as { faces: { licence: { id: string; file: string } }[] }).faces
      // Five faces are under the OFL and one under the Apache License: the line names those two licences and no other.
      const names: Record<string, string> = { 'OFL-1.1': 'SIL Open Font License 1.1', 'Apache-2.0': 'Apache License 2.0' }
      expect([...new Set(faces.map((face) => face.licence.id))].sort()).toEqual(Object.keys(names).sort())
      const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
      for (const name of Object.values(names)) expect(text).toContain(name)
      expect(html).toContain('<code>/fonts/</code>')
      const served = readdirSync(path.join(root, 'public/fonts'))
      expect(faces.filter((face) => !served.includes(face.licence.file))).toEqual([])
    })

    test('uses the design system\'s link, and no colour or face of its own', () => {
      expect(html).toContain('class="es-link"')
      expect(read('src/pages/About.tsx')).not.toMatch(/#[0-9a-f]{3,8}\b|font-family|rgb\(|hsl\(/i)
    })
  })
})
