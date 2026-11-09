/*
 * The third-party licences of the site (scripts/pages/third-party-licenses.ts; the publication audit's finding licensing#6).
 *
 *   - The collect-and-render step, on a small fixture in a temporary folder: two packages with a notice (one LICENSE, one LICENCE.md with
 *     a NOTICE beside it) and one without, which must fail with its name. Then the order, the licence labels, the file names that count,
 *     the text that the repository keeps for a package that ships none, NOTICE and the texts of LICENSES/ after the packages, and the rule
 *     that no path of this machine is written.
 *   - The modules that the build tool writes into a script (Vite's preload helper, the commonjs interop helper): they belong to vite, one
 *     that INJECTED does not name fails the build, and the text that the repository keeps for part of vite's licence file stands in for the
 *     file, for that file and that version alone. A text of that kind stands in for rollup's file too, and rollup is named by hand
 *     (`alsoShips`), because the code that Rollup writes into the scripts is no module of them.
 *   - The plugin's hooks, driven by hand, and then a real `vite build` of a miniature project with a lazy chunk and a worker, the way
 *     the app's own build has them: the worker's package is in the file only because of the second plugin, and the gate says so when the
 *     build leaves the second plugin out.
 *   - The gate (checkShipped) on a build that is right, and on each way it can be wrong.
 *   - third-party/notices.json against the lockfile and the installed packages, and the About page's link.
 *   - What the file, the plugin's header, the entries, the README, NOTICE and vite.config.ts say of the build tools' own code in the scripts
 *     (Vite's `__vite__mapDeps`, Rollup's namespace helper and literals); tests/build.test.ts holds those words to a real build.
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
  INJECTED,
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
/* Code that the build tool writes in, and a text that stands in for part of a licence file                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** vite's licence file in miniature: Vite's own licence, and then the licences that are bundled into Vite's own build. */
const VITE_OWN = 'Vite core license, fixture text\n\nMIT License, Copyright (c) Vite Authors\n'
const VITE_FILE = `${VITE_OWN}\n# Licenses of bundled dependencies\n\nBundled dependencies, fixture text\n\n## some-dependency\nLicense: ISC\n`
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

describe('the modules that the build tool writes into a script', () => {
  /** A project with a package of its own and a vite whose licence file has both parts. `tools` is the node_modules folder the plugin finds vite in. */
  function toolProject(): { ids: Record<string, string>; tools: string } {
    const project = fresh()
    const ids = install(project, [
      { name: 'pkg-a', version: '1.2.3', license: 'MIT', files: { LICENSE: MIT('A Authors') } },
      { name: 'vite', version: '7.3.0', license: 'MIT', files: { 'LICENSE.md': VITE_FILE } },
    ])
    return { ids, tools: path.join(project, 'node_modules') }
  }

  test("are the virtual modules of Vite 7.3.0, all of them vite's, as its own source names them: the preload helper and the commonjs interop helper reach this site, the rest are named so that a build that has one lists vite", () => {
    expect(INJECTED).toEqual({
      'commonjsHelpers.js': 'vite',
      'vite/dynamic-import-helper.js': 'vite',
      'vite/modulepreload-polyfill.js': 'vite',
      'vite/preload-helper.js': 'vite',
      'vite/wasm-helper.js': 'vite',
    })
    // A name with a typo would never match a module: each is in the source of the Vite that builds the site (the polyfill's id is made of two strings there).
    const source = read('node_modules/vite/dist/node/chunks/config.js')
    for (const name of Object.keys(INJECTED)) {
      const spelled = name === 'vite/modulepreload-polyfill.js' ? 'vite/modulepreload-polyfill"' : `${name}"`
      expect([name, source.includes(spelled)]).toEqual([name, true])
    }
  })

  test('list vite for each script that holds one, with the packages of that script, and in the record of those scripts alone', () => {
    const { ids, tools } = toolProject()
    const collection = collect(
      modulesOf({ 'assets/index-x.js': ['\0vite/preload-helper.js', ids['pkg-a']], 'assets/react-vendor-y.js': ['\0commonjsHelpers.js'], 'assets/plain-z.js': ['/p/src/x.ts'] }),
      [],
      new Map(),
      tools,
    )
    expect(collection.dependencies.map(idOf)).toEqual(['pkg-a@1.2.3', 'vite@7.3.0'])
    expect(collection.chunks).toEqual({ 'assets/index-x.js': ['pkg-a@1.2.3', 'vite@7.3.0'], 'assets/plain-z.js': [], 'assets/react-vendor-y.js': ['vite@7.3.0'] })
  })

  test("ship vite's licence file as the package has it when the repository keeps no text for part of it", () => {
    const { tools } = toolProject()
    const text = render(collect(modulesOf({ 'assets/x.js': ['\0vite/preload-helper.js'] }), [], new Map(), tools).dependencies, 'N')
    expect(text).toContain('\nvite@7.3.0\nLicence: MIT\n')
    expect(text).toContain(VITE_OWN.trimEnd())
    expect(text).toContain('Bundled dependencies, fixture text')
  })

  test('fail the build when INJECTED names no package for one, with its name, once for the whole build', () => {
    const { tools } = toolProject()
    const attempt = () => collect(modulesOf({ 'assets/a.js': ['\0virtual:mystery.js', '\0other/helper.js'], 'assets/b.js': ['\0virtual:mystery.js'] }), [], new Map(), tools)
    expect(attempt).toThrow(LicenceError)
    let problems: readonly string[] = []
    try {
      attempt()
    } catch (error) {
      problems = (error as LicenceError).problems
    }
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('other/helper.js, virtual:mystery.js are modules that the build tool writes into a script and that INJECTED names no package for')
    expect(problems[0]).toContain("name the package in INJECTED (scripts/pages/third-party-licenses.ts), so that the licence ships with the code")
  })

  test('do not take for one a file that a plugin wrapped, nor a file of the project that it wrapped', () => {
    const { ids, tools } = toolProject()
    const wrapped = `\0${ids['pkg-a']}?commonjs-module`
    const collection = collect(modulesOf({ 'assets/x.js': [wrapped, '\0/p/src/own.ts?commonjs-proxy', '\0C:\\p\\src\\own.ts?commonjs-proxy'] }), [], new Map(), tools)
    expect(collection.chunks).toEqual({ 'assets/x.js': ['pkg-a@1.2.3'] })
  })

  test('need to be told where the build tool is installed, which is a mistake of the caller and not of a licence', () => {
    expect(() => collect(modulesOf({ 'assets/x.js': ['\0vite/preload-helper.js'] }))).toThrow('not the node_modules folder that the build tool (vite) is installed in')
  })
})

describe('a text that stands in for part of a licence file ("replaces" in third-party/notices.json)', () => {
  /** vite 7.3.0 with the licence file above, and an index that keeps Vite's own part of it for that version, pinned to the file. */
  function excerptProject(options: { version?: string; file?: string | null; sha?: string; entry?: Record<string, unknown> } = {}): { dir: string; module: string } {
    const { version = '7.3.0', file = VITE_FILE, sha = sha256(VITE_FILE), entry = {} } = options
    const dir = fresh()
    const ids = install(dir, [{ name: 'vite', version, license: 'MIT', files: file === null ? {} : { 'LICENSE.md': file } }])
    mkdirSync(path.join(dir, 'third-party'))
    writeFileSync(path.join(dir, 'third-party/vite.txt'), VITE_OWN)
    writeFileSync(
      path.join(dir, SUPPLIED_FILE),
      JSON.stringify({
        notices: [{ file: 'vite.txt', licence: 'MIT', source: 'https://example.invalid/vite/LICENSE.md', basis: 'Cut from the first lines of the file.', replaces: { file: 'LICENSE.md', sha256: sha }, packages: ['vite@7.3.0'], ...entry }],
      }),
    )
    return { dir, module: ids.vite }
  }

  test("is shipped in place of the file, whose other licences are left out, under a lead that says which file it stands in for and where the text is kept", () => {
    const { dir, module } = excerptProject()
    const supplied = loadSupplied(dir)
    expect(supplied.get('vite@7.3.0')?.replaces).toEqual({ file: 'LICENSE.md', sha256: sha256(VITE_FILE) })
    const [dependency] = collect(modulesOf({ 'assets/x.js': [module] }), [], supplied).dependencies
    expect(dependency.notices).toEqual([{ file: 'vite.txt', text: VITE_OWN.trimEnd() }])
    const text = render([dependency], 'N')
    expect(text).toContain(`${'='.repeat(76)}\nvite@7.3.0\nLicence: MIT\n${'='.repeat(76)}\n\n`)
    expect(text).toContain(
      `This package ships its licence in LICENSE.md (SHA-256 ${sha256(VITE_FILE)}), which carries more than the code of the package that is in this site. enginespace gives the parts of the file that apply, word for word, as kept in third-party/vite.txt.\nSource: https://example.invalid/vite/LICENSE.md\nCut from the first lines of the file.\n\n${VITE_OWN.trimEnd()}`,
    )
    expect(text).not.toContain('Bundled dependencies, fixture text')
  })

  test('is used with the file it was cut from and no other: a file that differs fails the build, with the package, the file and both hashes', () => {
    const changed = `${VITE_FILE}A line that a later build of the same version added.\n`
    const { dir, module } = excerptProject({ file: changed, sha: sha256(VITE_FILE) })
    const attempt = () => collect(modulesOf({ 'assets/x.js': [module] }), [], loadSupplied(dir))
    expect(attempt).toThrow(LicenceError)
    expect(attempt).toThrow("vite@7.3.0 (node_modules/vite) ships a LICENSE.md that is not the file which third-party/notices.json's text for it was cut from")
    expect(attempt).toThrow(`SHA-256 ${sha256(changed)}, and the entry has ${sha256(VITE_FILE)}`)
  })

  test('fails the build when the package ships no such file, and says so', () => {
    const { dir, module } = excerptProject({ file: null })
    expect(() => collect(modulesOf({ 'assets/x.js': [module] }), [], loadSupplied(dir))).toThrow(`there is none, and the entry has ${sha256(VITE_FILE)}`)
  })

  test('is kept for one version: another version of the package fails the build until the text is made for it, though its own file is there', () => {
    const { dir, module } = excerptProject({ version: '7.4.0' })
    const attempt = () => collect(modulesOf({ 'assets/x.js': [module] }), [], loadSupplied(dir))
    expect(attempt).toThrow(LicenceError)
    expect(attempt).toThrow('vite@7.4.0 (node_modules/vite)')
    expect(attempt).toThrow('keeps only the parts that apply, and keeps them for another version')
    expect(attempt).toThrow('with the SHA-256 of the file they are cut from ("replaces")')
  })

  test('is read strictly: "replaces" is a bare file name and 64 hex digits, and a note is a sentence', () => {
    const { dir } = excerptProject()
    const index = path.join(dir, SUPPLIED_FILE)
    const rewrite = (entry: Record<string, unknown>) =>
      writeFileSync(index, JSON.stringify({ notices: [{ file: 'vite.txt', licence: 'MIT', source: 's', basis: 'b', packages: ['vite@7.3.0'], ...entry }] }))
    const shape = 'has a "replaces" that is not { "file": "LICENSE.md", "sha256": "<64 hex digits>" }'
    const bad = [{ file: '../LICENSE.md', sha256: sha256(VITE_FILE) }, { file: 'sub/LICENSE.md', sha256: sha256(VITE_FILE) }, { file: 'LICENSE.md', sha256: 'abc' }, { file: 'LICENSE.md' }, 'LICENSE.md', null]
    const outcomes = bad.map((replaces) => {
      rewrite({ replaces })
      try {
        loadSupplied(dir)
        return 'accepted'
      } catch (error) {
        return (error as Error).message.includes(shape) ? 'rejected' : (error as Error).message
      }
    })
    expect(outcomes).toEqual(bad.map(() => 'rejected'))
    rewrite({ replaces: { file: 'LICENSE.md', sha256: sha256(VITE_FILE) }, note: '' })
    expect(() => loadSupplied(dir)).toThrow('has no "note" string')
    rewrite({ replaces: { file: 'LICENSE.md', sha256: sha256(VITE_FILE) }, note: 'A sentence.' })
    expect(loadSupplied(dir).get('vite@7.3.0')?.note).toBe('A sentence.')
  })

  test("prints a note above the text and below the basis, for a text that stands in for a file and for one that supplies a file", () => {
    const note = 'This package also embeds code of another project, under the same licence.'
    const { dir, module } = excerptProject({ entry: { note } })
    const text = render(collect(modulesOf({ 'assets/x.js': [module] }), [], loadSupplied(dir)).dependencies, 'N')
    expect(text).toContain(`Cut from the first lines of the file.\n${note}\n\n${VITE_OWN.trimEnd()}`)

    // A package that ships no file, with a note: the same place, and no note on a section that has none.
    const bare = fresh()
    const ids = install(bare, [{ name: 'bare', version: '1.0.0', license: 'MIT' }, { name: 'plain', version: '1.0.0', license: 'MIT', files: { LICENSE: MIT('Plain') } }])
    mkdirSync(path.join(bare, 'third-party'))
    writeFileSync(path.join(bare, 'third-party/bare.txt'), 'MIT License\n\nCopyright (c) Bare Authors\n')
    writeFileSync(path.join(bare, SUPPLIED_FILE), JSON.stringify({ notices: [{ file: 'bare.txt', licence: 'MIT', source: 'https://example.invalid/bare/LICENSE', basis: 'Read from the repository.', note, packages: ['bare@1.0.0'] }] }))
    const rendered = render(collect(modulesOf({ 'assets/x.js': [ids.bare, ids.plain] }), [], loadSupplied(bare)).dependencies, 'N')
    expect(rendered).toContain(`Source: https://example.invalid/bare/LICENSE\nRead from the repository.\n${note}\n\nMIT License\n\nCopyright (c) Bare Authors`)
    expect(rendered.split(note)).toHaveLength(2)
  })

  test('is shipped for a package that is named by hand and that no script holds a module of (rollup is), and the record lists it apart from the scripts, which the gate finds in the file', () => {
    const { dir } = excerptProject()
    writeFileSync(path.join(dir, 'NOTICE'), NOTICE_TEXT)
    const { plugin } = thirdPartyLicenses(dir, { alsoShips: ['vite'] })
    const [text, record] = generate(plugin, { 'assets/x.js': ['/p/src/main.ts'] })
    expect(text.source).toContain(`${'='.repeat(76)}\nvite@7.3.0\nLicence: MIT\n${'='.repeat(76)}\n\n`)
    expect(text.source).toContain(VITE_OWN.trimEnd())
    expect(text.source).not.toContain('Bundled dependencies, fixture text')
    expect(JSON.parse(record.source)).toEqual({ chunks: { 'assets/x.js': [] }, alsoShips: ['vite@7.3.0'] })
    expect(checkShipped({ text: text.source, record: record.source, notice: NOTICE_TEXT, texts: [], scripts: ['assets/x.js'] })).toEqual({ problems: [], packages: ['vite@7.3.0'] })
  })

  test('fails the build for a package named by hand at another version than the text was cut for, and for a licence file that is not the one it was cut from', () => {
    const bumped = excerptProject({ version: '7.4.0' })
    writeFileSync(path.join(bumped.dir, 'NOTICE'), NOTICE_TEXT)
    expect(() => generate(thirdPartyLicenses(bumped.dir, { alsoShips: ['vite'] }).plugin, { 'assets/x.js': [] })).toThrow('keeps only the parts that apply, and keeps them for another version')
    const edited = excerptProject({ file: `${VITE_FILE}A line that a later build of the same version added.\n`, sha: sha256(VITE_FILE) })
    writeFileSync(path.join(edited.dir, 'NOTICE'), NOTICE_TEXT)
    expect(() => generate(thirdPartyLicenses(edited.dir, { alsoShips: ['vite'] }).plugin, { 'assets/x.js': [] })).toThrow("ships a LICENSE.md that is not the file which third-party/notices.json's text for it was cut from")
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

  test("finds the build tool in the project's node_modules: vite is listed, with the text for it, for a script that holds its preload helper", () => {
    const { project, ids } = threePackages()
    install(project, [{ name: 'vite', version: '7.3.0', license: 'MIT', files: { 'LICENSE.md': VITE_FILE } }])
    const { plugin } = thirdPartyLicenses(project)
    const [text, record] = generate(plugin, { 'assets/index-x.js': [ids['pkg-a'], '\0vite/preload-helper.js'], 'assets/lazy-y.js': [ids['pkg-b']] })
    expect(text.source).toContain('\nvite@7.3.0\nLicence: MIT\n')
    expect(JSON.parse(record.source)).toEqual({ chunks: { 'assets/index-x.js': ['pkg-a@1.2.3', 'vite@7.3.0'], 'assets/lazy-y.js': ['pkg-b@2.0.0'] }, alsoShips: [] })
  })

  test('fails the build for a module that the build tool writes in and nobody has named, and for a vite that is not installed', () => {
    const { project, ids } = threePackages()
    const { plugin } = thirdPartyLicenses(project)
    expect(() => generate(plugin, { 'assets/x.js': [ids['pkg-a'], '\0virtual:mystery.js'] })).toThrow('virtual:mystery.js is a module that the build tool writes into a script and that INJECTED names no package for')
    // vite is named for the preload helper, and the project has none installed: the build says which package it could not read.
    expect(() => generate(plugin, { 'assets/x.js': ['\0vite/preload-helper.js'] })).toThrow('node_modules/vite has no package.json that can be read')
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
    // The build tool, which writes its preload helper into the entry for the lazy import below: the file names it, and so must this folder have it.
    { name: 'vite', version: '7.3.0', license: 'MIT', files: { 'LICENSE.md': VITE_FILE } },
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

  test("names vite for the preload helper that the build writes into the script that makes the lazy import, which is not a file of any package, and records it for that script alone", () => {
    expect((shipped?.text ?? '').split('\n')).toContain('vite@7.3.0')
    const chunks = (parseRecord(shipped?.record ?? '') as { chunks: Record<string, string[]> }).chunks
    const holders = Object.keys(chunks).filter((file) => chunks[file].includes('vite@7.3.0'))
    expect(holders).toHaveLength(1)
    // The script that holds the helper is the one that holds its message, and no other script does.
    const withHelper = Object.keys(chunks).filter((file) => readFileSync(path.join(built.dist, file), 'utf8').includes('Unable to preload CSS'))
    expect(withHelper).toEqual(holders)
  })

  test('passes the gate', () => {
    expect(checkShipped(shipped as Shipped)).toEqual({ problems: [], packages: ['@scope/pkg-c@3.1.0', 'pkg-a@1.2.3', 'pkg-b@2.0.0', 'vite@7.3.0'] })
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
  /** Set for a text that stands in for part of the licence file that the package ships. */
  replaces?: { file: string; sha256: string }
  note?: string
}

/**
 * The entries that stand in for part of a licence file, which are the licence files of the build tools: the day each was read, and the lines of
 * the file that the text keeps, in order. The text is those lines word for word, with the rule that the file puts between its entries between
 * the parts (vite's has two). Vite's was read on 2026-11-08, and Rollup's on 2026-11-09, at the build of the SHA that its basis names.
 */
const CUTS: Readonly<Record<string, { readonly measured: string; readonly cuts: readonly (readonly [number, number])[] }>> = {
  'vite@7.3.0': { measured: '2026-11-08', cuts: [[1, 24], [130, 167]] },
  'rollup@4.67.4': { measured: '2026-11-09', cuts: [[1, 12]] },
}

describe('third-party/notices.json', () => {
  const index = JSON.parse(read(SUPPLIED_FILE)) as { schema: string; fetched: string; userAgent: string; notices: Notice[] }
  const lock = JSON.parse(read('package-lock.json')) as { packages: Record<string, { version: string; resolved?: string; dev?: boolean }> }
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
    const whole = index.notices.filter((notice) => notice.replaces === undefined)
    expect(whole.length).toBeGreaterThan(0)
    for (const notice of whole) {
      expect([notice.file, notice.source]).toEqual([notice.file, expect.stringMatching(/^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}\/LICENSE$/)])
      expect([notice.file, notice.basis]).toEqual([notice.file, expect.stringContaining('[measured 2026-11-08]')])
      expect(notice.basis).toContain(notice.source.split('/')[5])
    }
  })

  test('names where a text that stands in for part of a licence file was read: that file of that release of the package, from the tarball the lockfile pins, with the tag of what was measured', () => {
    const stands = index.notices.filter((notice) => notice.replaces !== undefined)
    // The build tools whose licence files carry far more than the code of theirs that is in the site: Vite and Rollup, and no other package.
    expect(stands.flatMap((notice) => notice.packages).sort()).toEqual(Object.keys(CUTS).sort())
    for (const notice of stands) {
      for (const id of notice.packages) {
        const [name, version] = split(id)
        const resolved = lock.packages[`node_modules/${name}`]?.resolved
        expect([id, resolved]).toEqual([id, `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`])
        expect([id, notice.source]).toEqual([id, expect.stringContaining(`the file ${notice.replaces?.file} of the npm package ${name} ${version} (${resolved}`)])
        expect([id, notice.basis]).toEqual([id, expect.stringMatching(new RegExp(`^\\[measured ${CUTS[id].measured} at [0-9a-f]{7}\\]`))])
      }
      // Every measurement in the basis carries its date and the SHA of the build it was made at, a count of scripts included. A count changes
      // with every build, so no test holds its value: only that it is tagged.
      const tags = notice.basis.match(/\[measured [^\]]*\]/g) ?? []
      expect(tags.length).toBeGreaterThan(1)
      for (const tag of tags) expect([tag, /^\[measured 20\d\d-\d\d-\d\d at [0-9a-f]{7}\]$/.test(tag)]).toEqual([tag, true])
    }
  })

  test('lists only packages at the version that package-lock.json has, so that a bump or a removal shows here and not as a stale text', () => {
    expect(listed.length).toBeGreaterThan(0)
    for (const { id } of listed) {
      const [name, version] = split(id)
      expect([id, lock.packages[`node_modules/${name}`]?.version]).toEqual([id, version])
    }
  })

  test('lists only packages that ship no notice file, since a text for one that ships its own is never used, but for the ones whose text stands in for the file they ship', () => {
    const bare = listed.filter(({ notice }) => notice.replaces === undefined)
    expect(bare.length).toBeGreaterThan(0)
    for (const { id } of bare) {
      const [name] = split(id)
      const files = readdirSync(path.join(root, 'node_modules', name)).filter((file) => /^(?:licen[cs]e|copying|notice)(?:[-_.].*)?$/i.test(file) && !/\.(?:[cm]?[jt]sx?|json|map)$/i.test(file))
      expect([id, files]).toEqual([id, []])
    }
  })

  test('keeps for a package that ships a licence file the parts of it that apply: the file is the one pinned, and the text is lines of it, word for word, in order, and a small part of it', () => {
    const stands = listed.filter(({ notice }) => notice.replaces !== undefined)
    expect(stands.map(({ id }) => id).sort()).toEqual(Object.keys(CUTS).sort())
    for (const { id, notice } of stands) {
      const [name] = split(id)
      const replaced = notice.replaces as { file: string; sha256: string }
      const whole = readFileSync(path.join(root, 'node_modules', name, replaced.file))
      expect([id, createHash('sha256').update(whole).digest('hex')]).toEqual([id, replaced.sha256])
      const lines = whole.toString('utf8').split('\n')
      const kept = readFileSync(path.join(root, 'third-party', notice.file), 'utf8')
      // The parts are cut at the rule that the file itself puts between its entries, and each is a run of the file's own lines. Vite's text has two:
      // Vite's own licence (lines 1 to 24) and the Rollup plugins' entry (lines 130 to 167). Rollup's has one, Rollup's own licence (lines 1 to 12).
      // The numbers are the ones that the entry's basis and source give.
      const { cuts } = CUTS[id]
      const parts = kept.split('\n---------------------------------------\n').map((part) => part.trim())
      expect([id, parts.length]).toEqual([id, cuts.length])
      cuts.forEach(([from, to], at) => expect([id, from, to, lines.slice(from - 1, to).join('\n')]).toEqual([id, from, to, parts[at]]))
      expect(notice.basis).toContain(`(lines 1 to ${cuts[0][1]})`)
      expect(notice.source).toContain(cuts.map(([from, to]) => `lines ${from} to ${to}`).join(' and '))
      // What is left out is the licences of what the tool bundles into its own build, which is nearly all of the file.
      expect(kept).not.toContain('Licenses of bundled dependencies')
      expect(kept.length).toBeLessThan(whole.length / 10)
    }
  })

  test("says of @react-three/fiber that it embeds react-reconciler under Meta's MIT notice, which react's licence file carries too, and no other entry has a note", () => {
    const entry = index.notices.find((notice) => notice.packages.includes('@react-three/fiber@9.6.1'))
    expect(entry?.note).toContain('react-reconciler')
    expect(entry?.note).toContain('react@19.2.3')
    expect(entry?.note).toContain('[measured 2026-11-08 in the installed package]')
    expect(index.notices.filter((notice) => notice.note !== undefined)).toEqual([entry])
    // The embedded copy is in the file that the note names, under that banner, and no licence file comes with it ...
    const embedded = readFileSync(path.join(root, 'node_modules/@react-three/fiber', entry?.note?.match(/\b(dist\/events-[0-9a-f]+\.esm\.js)\b/)?.[1] ?? 'no-such-file'), 'utf8')
    expect(embedded).toContain('react-reconciler.production.js')
    expect(embedded).toMatch(/Copyright \(c\) Meta Platforms, Inc\. and affiliates\.[\s*]*This source code is licensed under the MIT license/)
    // ... react's licence file has the same copyright line, and the lockfile has react at the version that the note names.
    expect(read('node_modules/react/LICENSE')).toContain('Copyright (c) Meta Platforms, Inc. and affiliates')
    expect(lock.packages['node_modules/react']?.version).toBe('19.2.3')
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
/* What is said of Vite's own code in the scripts                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/*
 * Vite writes more of its own code into the scripts than the two helper modules that INJECTED names: `__vite__mapDeps`, the function that
 * lists the files which each lazy import loads with it, is at the top of every script whose lazy imports have files to list. It is no
 * module, so neither the record nor INJECTED sees it, and a sentence that said "two helpers" and "none of its code" was false. Each place
 * that speaks of Vite's code in the scripts is held here to the wording that is true. No test holds a count of scripts, which changes with
 * every build: tests/build.test.ts checks the function against a real build, and the basis tags the count it gives.
 */
describe("what is said of Vite's own code in the scripts", () => {
  /** A block comment's text on one line: the line breaks, and the ` * ` that starts each line, taken out. */
  const comment = (text: string): string => text.replace(/\n[ \t]*(?:\*[ \t]?)?/g, ' ').replace(/\s+/g, ' ').trim()
  const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
  const source = read('scripts/pages/third-party-licenses.ts')
  const viteEntry = (JSON.parse(read(SUPPLIED_FILE)) as { notices: Notice[] }).notices.find((notice) => notice.packages.includes('vite@7.3.0'))

  test('is a function that Vite writes: the build-import-analysis plugin of the Vite that builds the site has `__vite__mapDeps` in its source', () => {
    const vite = read('node_modules/vite/dist/node/chunks/config.js')
    expect(vite).toContain('name: "vite:build-import-analysis"')
    expect(vite).toContain('const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=')
  })

  test("the basis of the vite entry names the dependency-map function beside the preload helper and the interop helper, and says that the record sees only code that arrives as a module", () => {
    expect(viteEntry).toBeDefined()
    const basis = oneLine(viteEntry?.basis ?? '')
    for (const part of [
      'the dependency-map function (__vite__mapDeps), which Vite writes into each script whose lazy imports have other files to load with them',
      'its preload helper, in the entry script',
      'the interop helper of @rollup/plugin-commonjs, in react-vendor',
      'The dependency-map function is not a module',
      'see only code that arrives as a module',
      'this section covers all three',
    ]) {
      expect([part, basis.includes(part)]).toEqual([part, true])
    }
    // The sentences that were false: two helpers are not all of the code of Vite's that the scripts hold.
    for (const gone of ['apart from two helpers', 'none of its code', 'The two are the only modules']) expect([gone, basis.includes(gone)]).toEqual([gone, false])
  })

  test("the file's own header names it among the code of Vite's that the scripts hold, and says whose licence covers it", () => {
    const text = render([], 'N')
    const header = oneLine(text.slice(0, text.indexOf('='.repeat(76))))
    for (const part of [
      'its own preload helper, its own dependency-map function (__vite__mapDeps), which it writes into each script whose lazy imports have other files to load with them,',
      'and the interop helper of a Rollup plugin that it bundles',
      "Vite's section gives Vite's own licence, which is the licence of the first two, and that plugin's",
    ]) {
      expect([part, header.includes(part)]).toEqual([part, true])
    }
    expect(header).not.toContain('the helpers that the build tool writes into the scripts')
  })

  test("the plugin's header says the same, and that the record and INJECTED, which see only modules, do not catch the function or code like it", () => {
    const header = comment(source.slice(0, source.indexOf("import { createHash }")))
    for (const part of [
      '`__vite__mapDeps` is one, the function that names the files which each lazy import loads with it',
      'The record (`.vite/third-party.json`, below) and INJECTED see only code that arrives as a module',
      'code of that kind from another plugin would fail nothing',
      "Vite's own MIT licence (that of the preload helper and of `__vite__mapDeps`)",
    ]) {
      expect([part, header.includes(part)]).toEqual([part, true])
    }
    expect(header).not.toContain('but for the two helpers above')
    // INJECTED's own comment says that its table holds modules only.
    const injected = comment(source.slice(source.indexOf('The code that the build tool writes into a script itself'), source.indexOf('export const INJECTED')))
    expect(injected).toContain("The table holds modules only: code that a plugin writes into a script after the modules are put together (Vite's `__vite__mapDeps`) is no module")
  })

  test("README's paragraph on the gate says it, and that the record lists Vite for the scripts of the helper modules and not for each script that holds the function", () => {
    const readme = oneLine(read('README.md'))
    for (const part of [
      'the `__vite__mapDeps` function that it writes into each script whose lazy imports have other files to load with them',
      'The record that the gate reads sees only code that arrives as a module',
      'not for each script that holds `__vite__mapDeps`',
    ]) {
      expect([part, readme.includes(part)]).toEqual([part, true])
    }
    expect(readme).not.toContain('for the helpers that the build writes into the scripts')
  })

  test('no place that speaks of Vite\'s code in the scripts still counts it as two helpers, or says that none of it is there', () => {
    for (const file of ['README.md', 'NOTICE', 'vite.config.ts', 'scripts/pages/third-party-licenses.ts', 'third-party/notices.json']) {
      const text = oneLine(read(file).replace(/\n[ \t]*(?:\*|\/\/)[ \t]?/g, ' '))
      for (const gone of [/\btwo helpers\b/, /none of its code is in the scripts/]) expect([file, gone.source, gone.test(text)]).toEqual([file, gone.source, false])
    }
  })
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* What is said of Rollup's own code in the scripts                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/*
 * Rollup writes code into the scripts itself when it renders a chunk: the helper that merges namespace objects (`_mergeNamespaces`, in
 * react-vendor) and the literals of namespace objects (in other scripts). No module of rollup reaches a script, so the record could not list
 * it, and a file that said "every npm package that has code in the scripts" had no section for it. vite.config.ts now names rollup in
 * `alsoShips`, and the lines of its LICENSE.md that apply stand in for the file (third-party/notices.json). Each place that speaks of the
 * build tool's code in the scripts is held here to the wording that is true. No test holds a count of scripts, which changes with every build:
 * tests/build.test.ts finds the helper and the literals in a real build, and the basis tags the count it gives.
 */
describe("what is said of Rollup's own code in the scripts", () => {
  /** A block comment's text on one line: the line breaks, and the ` * ` that starts each line, taken out. */
  const comment = (text: string): string => text.replace(/\n[ \t]*(?:\*[ \t]?)?/g, ' ').replace(/\s+/g, ' ').trim()
  const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
  const source = read('scripts/pages/third-party-licenses.ts')
  const rollupEntry = (JSON.parse(read(SUPPLIED_FILE)) as { notices: Notice[] }).notices.find((notice) => notice.packages.includes('rollup@4.67.4'))

  test('is code that Rollup writes: the Rollup that builds the site has the helper and the namespace literal in its source, and Vite builds with that copy', () => {
    const rollup = read('node_modules/rollup/dist/es/shared/node-entry.js')
    expect(rollup).toContain("const MERGE_NAMESPACES_VARIABLE = '_mergeNamespaces';")
    expect(rollup).toContain('const HELPER_GENERATORS = {')
    expect(rollup).toContain('[MERGE_NAMESPACES_VARIABLE](t, snippets, liveBindings, freeze, symbols) {')
    // A namespace object is written with no prototype, the toStringTag of a module, and a freeze.
    expect(rollup).toContain('members.unshift([null, `__proto__:${_}null`]);')
    expect(rollup).toContain('Symbol.toStringTag,${_}${getToStringTagValue(getObject)}')
    expect(rollup).toContain('/*#__PURE__*/Object.freeze(${output})')
    // vite has no copy of rollup of its own, so the package that the build names is the one that bundles the site.
    expect(existsSync(path.join(root, 'node_modules/vite/node_modules/rollup'))).toBe(false)
    const dependencies = (JSON.parse(read('node_modules/vite/package.json')) as { dependencies: Record<string, string> }).dependencies
    expect(dependencies.rollup).toBeDefined()
  })

  test('the basis of the rollup entry names the helper and the literals and where they are, and says that no module of Rollup reaches a script, so the record cannot list it', () => {
    expect(rollupEntry).toBeDefined()
    const basis = oneLine(rollupEntry?.basis ?? '')
    for (const part of [
      'LICENSE.md of rollup 4.67.4 is 35,231 bytes',
      "It opens with Rollup's own MIT licence (lines 1 to 12)",
      'no module of it reaches a script',
      'the helper that merges namespace objects (_mergeNamespaces, which HELPER_GENERATORS writes in dist/es/shared/node-entry.js of the package), in react-vendor',
      'the literal of a namespace object',
      "Rollup's own licence (lines 1 to 12) is the licence of both",
      'cannot list rollup for any script',
      'vite.config.ts names rollup by hand (alsoShips)',
    ]) {
      expect([part, basis.includes(part)]).toEqual([part, true])
    }
    // The count of scripts that hold the literal is given, and tagged with its day and its build.
    expect(basis).toMatch(/it is in \d+ other scripts of the \d+ in dist\/assets \[measured 20\d\d-\d\d-\d\d at [0-9a-f]{7}\]/)
    // The basis of the vite entry sends a reader who looks for Rollup's own code to the section of rollup, so that the two sections divide it.
    const vite = oneLine((JSON.parse(read(SUPPLIED_FILE)) as { notices: Notice[] }).notices.find((notice) => notice.packages.includes('vite@7.3.0'))?.basis ?? '')
    expect(vite).toContain("The code that Rollup itself writes into the scripts is not the vite package's, and the section of rollup covers it.")
  })

  test("the file's own header names Rollup beside Vite, with the helper and the literals, and says that its section gives Rollup's own licence", () => {
    const text = render([], 'N')
    const header = oneLine(text.slice(0, text.indexOf('='.repeat(76))))
    for (const part of [
      "and that plugin's. Rollup is listed for the code that it writes into the scripts itself: its helper that merges namespace objects (_mergeNamespaces, in react-vendor)",
      'and the literals of the namespace objects that it builds for modules, in other scripts.',
      "Rollup's section gives Rollup's own licence.",
      'Neither section gives the licences of the other dependencies that the tool bundles into its own build, which run in Node and are not in this site.',
    ]) {
      expect([part, header.includes(part)]).toEqual([part, true])
    }
  })

  test("the plugin's header says the same, and that rollup is named in alsoShips because no module of it reaches a script", () => {
    const header = comment(source.slice(0, source.indexOf('import { createHash }')))
    for (const part of [
      'A package whose code reaches the site without being a module of a script is named in `alsoShips`: Tailwind, whose base CSS is copied into the stylesheet, and Rollup, which writes code of its own into the scripts',
      'Rollup writes some of it itself when it renders a chunk: the helper that merges namespace objects (`_mergeNamespaces`, which `HELPER_GENERATORS` writes in rollup/dist/es/shared/node-entry.js) is in react-vendor',
      'the literal of a namespace object',
      'No module of rollup reaches a script',
      'vite.config.ts names rollup in `alsoShips` instead, which lists it apart from the scripts and puts its section in the file',
      "Rollup's own MIT licence (that of its helper and of its namespace literals)",
    ]) {
      expect([part, header.includes(part)]).toEqual([part, true])
    }
  })

  test('vite.config.ts names rollup in alsoShips beside tailwindcss, and its comment says what Rollup writes and that Vite needs no entry', () => {
    const config = read('vite.config.ts')
    expect(config).toContain("thirdPartyLicenses(root, { alsoShips: ['rollup', 'tailwindcss'] })")
    const note = comment(config.slice(config.indexOf('The licences of the npm packages inside the scripts'), config.indexOf('const licences')))
    for (const part of [
      'Two packages are named here though no script holds a module of them',
      'Rollup writes code of its own into the scripts when it renders a chunk, the helper that merges namespace objects (in react-vendor) and the literals of namespace objects (in other scripts)',
      'Vite itself needs no entry here',
      'its preload helper, and the interop helper of a Rollup plugin that it bundles',
      'its `__vite__mapDeps` function, is no module at all',
    ]) {
      expect([part, note.includes(part)]).toEqual([part, true])
    }
  })

  test("README's paragraph on the gate and NOTICE's opening name Rollup beside Vite, with the code that each writes into the scripts", () => {
    const readme = oneLine(read('README.md'))
    for (const part of [
      "Rollup is another, for the code that it writes into the scripts itself (the helper that merges namespace objects, in `react-vendor`, and the literals of the namespace objects that it builds for modules, in other scripts), and its section gives Rollup's own licence.",
      'Neither section gives the licences of the other dependencies that the tool bundles into its own build.',
      'it lists Rollup for no script: `vite.config.ts` names Rollup in `alsoShips`, which puts its section in the file.',
      'and the parts of the licence files of Vite and Rollup that apply',
    ]) {
      expect([part, readme.includes(part)]).toEqual([part, true])
    }
    const notice = read('NOTICE')
    const opening = oneLine(notice.slice(0, notice.indexOf('='.repeat(76))))
    for (const part of [
      'Vite and Rollup are two of the packages too, for the code that the build writes into the scripts:',
      "Vite's preload helper, its __vite__mapDeps function and the interop helper of a Rollup plugin that it bundles, and Rollup's helper that merges namespace objects (in react-vendor) and its namespace-object literals.",
      "the parts of Vite's and Rollup's licence files that apply, and not the licences of the dependencies that each bundles into its own build.",
    ]) {
      expect([part, opening.includes(part)]).toEqual([part, true])
    }
  })

  test("no place that speaks of the build's code in the scripts calls it the helpers of one tool, as if Vite's were all of it", () => {
    for (const file of ['README.md', 'NOTICE', 'vite.config.ts', 'scripts/pages/third-party-licenses.ts', 'third-party/notices.json']) {
      const text = oneLine(read(file).replace(/\n[ \t]*(?:\*|\/\/)[ \t]?/g, ' '))
      for (const gone of [/the helpers that the build writes into the scripts/, /helpers that the build tool writes into the scripts/]) expect([file, gone.source, gone.test(text)]).toEqual([file, gone.source, false])
    }
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

    test('links the file at the site\'s root as a link of the site itself: the same tab, no external mark, and not the router\'s link (which answers the address with its not-found page)', () => {
      const link = /<a ([^>]*)>(.*?)<\/a>/s.exec(html)
      const attributes = link?.[1] ?? ''
      expect(/href="([^"]+)"/.exec(attributes)?.[1]).toBe('/third-party-licenses.txt')
      // The text of the link and nothing else in it: no drawn mark, and no words about a new tab.
      expect(link?.[2]).toBe('third-party-licenses.txt')
      expect(attributes).not.toMatch(/target=|rel=|data-discover/)
      expect(html).not.toContain('opens in a new tab')
      expect(html).not.toContain('es-link__external')
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

    test('builds the folder it names from the base the site is served at, as it does the address of the link, and not as /fonts/ typed in the text', () => {
      const source = read('src/pages/About.tsx')
      expect(source).toContain("`${import.meta.env.BASE_URL ?? '/'}fonts/`")
      expect(source).not.toContain('<code>/fonts/</code>')
      // At the root, where the tests run and the deploy serves the site, the text is the same as it was.
      expect(html).toContain('<code>/fonts/</code>')
    })
  })
})
