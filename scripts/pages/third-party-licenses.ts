/*
 * The third-party licences of the site (the publication audit's finding licensing#6): the build writes `third-party-licenses.txt` at the
 * root of dist/, and verify:bundle checks it.
 *
 * Vite 7.3 minifies with esbuild { legalComments: 'none' }, so the scripts that the site serves carry no licence notice, and the MIT, BSD
 * and Apache-2.0 licences of the packages inside them all ask for theirs to travel with copies of the code. This plugin collects the
 * notices instead. For every module that reaches a script of the build it finds the package that the module belongs to, reads the package's
 * package.json and its LICENSE, LICENCE, COPYING and NOTICE files, and writes the packages, sorted by name, with the full text of each
 * licence. The repository's NOTICE (the vendored kernelspace code, the ported code, the fonts) follows them, so those notices ship too,
 * and after it the texts of LICENSES/, which NOTICE points to (the Apache License 2.0 that the vLLM translations and the Mooncake slice are
 * under): a notice that names a file the site does not serve gives a reader of the site nothing to read. The About page links the file
 * (src/pages/About.tsx).
 *
 *   - A package with none of those files fails the build, and the message names it. A notice is never skipped: a skipped one is a copy that
 *     goes out without its licence. The one way past is a text that the repository keeps for that package at that version, with its source
 *     and its hash (third-party/notices.json): some packages of the app's scripts are published without a licence file, and the file says so
 *     above the text it supplies.
 *   - A package belongs to a module by the last `node_modules/<name>` (or `node_modules/@scope/<name>`) in the module's path, which holds
 *     for a package that sits inside another's node_modules, and for a path that has a `package.json` of its own further down
 *     (`dist/esm/package.json` with only a type in it).
 *   - The packages are those of `moduleIds`, so a package whose modules reached a script and whose code the build then left out as unused
 *     is listed too (react-three-fiber's `its-fine`, `react-use-measure` and `suspend-react` are, in three-vendor: their modules render to
 *     nothing, [measured 2026-11-08] by the `renderedLength` of the chunk's modules). That is on purpose: an extra notice costs some text,
 *     and a missing one costs a licence.
 *   - A worker is bundled by a build of its own that Vite's plugins do not see (vite:worker), so its modules reach the file through the
 *     second plugin of `thirdPartyLicenses`, which vite.config.ts puts in `worker.plugins`.
 *   - A package whose code reaches the site without being a module of a script is named in `alsoShips`: Tailwind, whose base CSS is copied
 *     into the stylesheet, and Rollup, which writes code of its own into the scripts (below).
 *   - Code that the build tool writes into a script comes in two kinds. One arrives as a module that has no file, and so no `node_modules` path:
 *     Vite's preload helper (`\0vite/preload-helper.js`, in the entry script) and the interop helper of the Rollup commonjs plugin that Vite
 *     bundles into its own build (`\0commonjsHelpers.js`, in react-vendor) [measured 2026-11-08 at 6418a20: the only two modules of the build
 *     that are not files]. INJECTED names the package of each, vite, and of the rest of Vite's own, so vite is listed like a package whose
 *     module reached a script. A module of that kind that INJECTED does not name fails the build, with its name: a helper that a new Vite or a
 *     new plugin writes in is a licence that nobody has read.
 *   - The other kind is no module at all. Rollup writes some of it itself when it renders a chunk: the helper that merges namespace objects
 *     (`_mergeNamespaces`, which `HELPER_GENERATORS` writes in rollup/dist/es/shared/node-entry.js) is in react-vendor, and the literal of a
 *     namespace object (`Object.freeze(Object.defineProperty({__proto__:null,...},Symbol.toStringTag,{value:"Module"}))`, which Rollup builds
 *     when a module's namespace is used as a value) is in 7 other scripts [measured 2026-11-09 at b92a73e: of the 154 scripts of dist/assets].
 *     No module of rollup reaches a script [measured 2026-11-09 at b92a73e], so the record's list of the packages in each script has no rollup
 *     in it, and INJECTED has no module to name it for. vite.config.ts names rollup in `alsoShips` instead, which lists it apart from the
 *     scripts and puts its section in the file. The build does not check for the code itself: tests/build.test.ts finds it in a real build.
 *   - A plugin writes the rest of that kind into a script's code after Rollup has put the modules together. Vite's `__vite__mapDeps` is one,
 *     the function that names the files which each lazy import loads with it (`vite:build-import-analysis` writes it in its `generateBundle`
 *     hook), at the top of each script whose lazy imports have files to name [measured 2026-11-09 at 6ae0e50: 16 of the 154 scripts of
 *     dist/assets]. The record (`.vite/third-party.json`, below) and INJECTED see only code that arrives as a module (the `moduleIds` of a
 *     chunk), so the record lists vite for the two scripts that hold a helper module and not for the others, and code of that kind from another
 *     plugin would fail nothing. `__vite__mapDeps` is covered because it is Vite's own code and vite's section carries Vite's licence, and not
 *     because the build checks for it.
 *   - vite's LICENSE.md is 101,182 bytes [measured 2026-11-08, vite 7.3.0], and nearly all of it is the licences of the dependencies that are bundled
 *     into Vite's own build (its dev server, its config loader, its CSS tooling), which runs in Node and, but for the code named above, is not in
 *     the site. So the file gives the two parts of it that apply, Vite's own MIT licence (that of the preload helper and of `__vite__mapDeps`) and
 *     the Rollup plugins' (the commonjs helper's), from third-party/vite.txt, word for word, in place of the whole file. The entry in
 *     third-party/notices.json says which file it stands in for (`replaces`) and that file's SHA-256, and the build fails when the installed
 *     file is another one, and when vite is at another version than the entry's, until the file is read again and the entry is made for it.
 *   - rollup's LICENSE.md is 35,231 bytes [measured 2026-11-09 at b92a73e, rollup 4.67.4], and everything after its first twelve lines is the
 *     licences of the dependencies that Rollup bundles into its published files, which run in Node and are not in the site. So the file gives
 *     those twelve lines, Rollup's own MIT licence (that of its helper and of its namespace literals), from third-party/rollup.txt, word for
 *     word, in place of the whole file, under the same `replaces` entry and the same two failures as vite's.
 *   - Beside Vite's manifest the plugin writes `.vite/third-party.json`: each script of the build with the packages inside it. verify:bundle
 *     reads that (checkShipped below) and fails when the licence file lacks a package, when a script of dist/assets is not in the record (a
 *     worker the plugin never saw), or when NOTICE or a text of LICENSES/ is not in the file. tests/build.test.ts holds the record to the
 *     source maps of a real build, to the one script that holds Vite's preload helper, and to the scripts that hold Rollup's helper and
 *     namespace literals.
 *
 * Vite has a `build.license` option of its own (7.3.0, `licensePlugin` in dist/node/chunks/config.js), and it is not used, for four reasons
 * that were read in that file: it leaves a package with no licence file out of the text without a word; it reads the first LICENSE, LICENCE
 * or COPYING file of a package and no NOTICE, so a dual-licensed package or an Apache one loses a notice; it is not in the list of a worker's
 * plugins; and it cannot append NOTICE or leave a record for the gate to check.
 *
 * Only the build and its gate use this module, and the tests. The text holds no path of this machine: a package is named by its name and
 * version, and a problem by `node_modules/...` from the first node_modules of its path.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** The licence file, at the root of the site. */
export const LICENCES_FILE = 'third-party-licenses.txt'
/** Which packages each script of the build holds, beside Vite's manifest. */
export const RECORD_FILE = '.vite/third-party.json'
/** The file of the repository that follows the packages in the licence file. */
export const NOTICE_FILE = 'NOTICE'
/** The folder of licence texts that NOTICE points to (REUSE's layout: `LICENSES/Apache-2.0.txt`), which follow NOTICE. */
export const LICENSES_DIR = 'LICENSES'
/** The texts that the repository keeps for packages that ship none, and what each is. */
export const SUPPLIED_FILE = 'third-party/notices.json'

const RULE = '='.repeat(76)

/** One or more packages have no notice to ship, or a file that says where to find one cannot be read. */
export class LicenceError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(problems.length === 1 ? `third-party licences: ${problems[0]}` : `third-party licences: ${problems.length} problems\n${problems.map((problem) => `  ${problem}`).join('\n')}`)
    this.name = 'LicenceError'
    this.problems = problems
  }
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

/* ------------------------------------------------------------------------------------------------------------------ */
/* The texts that the repository keeps                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A licence text that the repository keeps for a package: one entry of third-party/notices.json. It is the text of a package whose release
 * ships none, or, with `replaces`, the parts of a licence file that apply, for a package whose file carries much more than that.
 */
export interface Supplied {
  /** The text's file under third-party/. */
  readonly file: string
  /** The licence it is, as a label (`MIT`). */
  readonly licence: string
  /** Where the text was read, and the date and the hash and the doubts about it, in the entry's own words. */
  readonly source: string
  readonly basis: string
  readonly text: string
  /**
   * Set when the package does ship a licence file and this text stands in for it: that file's name, and its SHA-256 in the release that the text
   * was cut from. The text is used with that file alone, and with no other version of the package.
   */
  readonly replaces?: { readonly file: string; readonly sha256: string }
  /** A sentence about the package that goes above its text in the licence file. */
  readonly note?: string
}

/** The text of a notice file with its line ends as `\n`, no byte-order mark, no blank line before or after. */
function textOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^(?:[ \t]*\n)+/, '')
    .trimEnd()
}

/**
 * The texts of `third-party/notices.json` under `root`, by `name@version`; none when the file is not there. It throws a `LicenceError` for an
 * entry it cannot use: a text that is missing, a field that is not a string, a package listed twice.
 */
export function loadSupplied(root: string): Map<string, Supplied> {
  const supplied = new Map<string, Supplied>()
  const index = path.join(root, SUPPLIED_FILE)
  if (!existsSync(index)) return supplied
  let notices: unknown
  try {
    notices = (JSON.parse(readFileSync(index, 'utf8')) as { notices?: unknown }).notices
  } catch {
    throw new LicenceError([`${SUPPLIED_FILE} is not JSON`])
  }
  if (!Array.isArray(notices)) throw new LicenceError([`${SUPPLIED_FILE} has no "notices" array`])
  const problems: string[] = []
  notices.forEach((entry: unknown, at) => {
    const fields = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>
    const where = `${SUPPLIED_FILE}, notice ${at + 1}`
    const text = (key: string): string => {
      const value = fields[key]
      if (typeof value === 'string' && value !== '') return value
      problems.push(`${where} has no "${key}" string`)
      return ''
    }
    const [file, licence, source, basis] = [text('file'), text('licence'), text('source'), text('basis')]
    const note = fields.note === undefined ? undefined : text('note')
    let replaces: Supplied['replaces']
    if (fields.replaces !== undefined) {
      const stands = (typeof fields.replaces === 'object' && fields.replaces !== null ? fields.replaces : {}) as Record<string, unknown>
      // A bare file name of the package's folder, so that the file is read from the package and from nowhere else.
      if (typeof stands.file === 'string' && /^[^/\\]+$/.test(stands.file) && typeof stands.sha256 === 'string' && /^[0-9a-f]{64}$/.test(stands.sha256)) {
        replaces = { file: stands.file, sha256: stands.sha256 }
      } else problems.push(`${where} has a "replaces" that is not { "file": "LICENSE.md", "sha256": "<64 hex digits>" }`)
    }
    const packages = Array.isArray(fields.packages) && fields.packages.every((id) => typeof id === 'string' && id.includes('@')) ? (fields.packages as string[]) : null
    if (packages === null || packages.length === 0) problems.push(`${where} has no "packages" array of name@version strings`)
    if (file === '' || packages === null) return
    const target = path.join(root, path.dirname(SUPPLIED_FILE), file)
    if (path.dirname(path.relative(root, target)) !== path.dirname(SUPPLIED_FILE) || !existsSync(target)) {
      problems.push(`${where} names ${file}, which is not a file in ${path.dirname(SUPPLIED_FILE)}/`)
      return
    }
    for (const id of packages) {
      if (supplied.has(id)) problems.push(`${SUPPLIED_FILE} lists ${id} twice`)
      else supplied.set(id, { file, licence, source, basis, text: textOf(target), ...(replaces === undefined ? {} : { replaces }), ...(note === undefined || note === '' ? {} : { note }) })
    }
  })
  if (problems.length > 0) throw new LicenceError(problems)
  return supplied
}

/** A text of the repository's LICENSES/ folder: its path from the root of the project, and the text as the file has it. */
export interface RepositoryText {
  readonly file: string
  readonly text: string
}

/** The files of `LICENSES/` under `root`, by name, as `LICENSES/<name>` with their text; none when the project has no such folder. */
export function loadTexts(root: string): RepositoryText[] {
  const folder = path.join(root, LICENSES_DIR)
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((name) => statSync(path.join(folder, name)).isFile())
    .sort(compare)
    .map((name) => ({ file: `${LICENSES_DIR}/${name}`, text: textOf(path.join(folder, name)) }))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Collecting                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A package that the site is built from, with the notices it ships. */
export interface Dependency {
  readonly name: string
  readonly version: string
  /** package.json's `license` as written (an SPDX expression), or null when it names none. The text decides, and this is a label. */
  readonly identifier: string | null
  /** The package's LICENSE, LICENCE, COPYING and NOTICE files, by name: the text of each. For a package that ships none, the one text kept for it. */
  readonly notices: readonly { readonly file: string; readonly text: string }[]
  /** Set when the package ships no notice file and the repository's own text stands in for it. */
  readonly supplied?: Supplied
}

/** A package's name and version as a heading: the unit that the file lists and the record names. */
export const idOf = (dependency: Pick<Dependency, 'name' | 'version'>): string => `${dependency.name}@${dependency.version}`

const NODE_MODULES = '/node_modules/'

/** A module id as a plain path: without Rollup's virtual prefix (`\0`), a query or a fragment (`?commonjs-module`), and with `/` for `\`. */
const plainPath = (moduleId: string): string => moduleId.replace(/^\0/, '').replace(/[?#].*$/, '').replaceAll('\\', '/')

/**
 * The folder of the package that a module belongs to: up to the last `node_modules/<name>` or `node_modules/@scope/<name>` of its path. It
 * is null for a module outside node_modules (our own, which are the project's and not a package's; and the build tool's virtual ones, which
 * INJECTED gives to their package) and for a path that ends at the package's folder.
 */
export function packageRootOf(moduleId: string): string | null {
  const id = plainPath(moduleId)
  const at = id.lastIndexOf(NODE_MODULES)
  if (at < 0) return null
  const parts = id.slice(at + NODE_MODULES.length).split('/')
  const length = parts[0].startsWith('@') ? 2 : 1
  if (parts.length <= length || parts.slice(0, length).some((part) => part === '')) return null
  return id.slice(0, at + NODE_MODULES.length) + parts.slice(0, length).join('/')
}

/**
 * The code that the build tool writes into a script itself, by the name of its module (without Rollup's `\0` prefix), and the package that the
 * code is from. Such a module has no file, so no `node_modules` path leads to its package. These are the virtual modules that the source of
 * Vite 7.3.0 names [read in node_modules/vite/dist/node/chunks/config.js]:
 *   - `vite/preload-helper.js` is Vite's preload helper, which wraps each dynamic import() to load its CSS and chunks first (in the entry script);
 *   - `commonjsHelpers.js` is the interop helpers of @rollup/plugin-commonjs, a Rollup plugin that Vite bundles into its own build (in react-vendor);
 *   - `vite/modulepreload-polyfill.js` (which vite.config.ts turns off), `vite/dynamic-import-helper.js` (the runtime of an import() with a
 *     variable in its path, from @rollup/plugin-dynamic-import-vars) and `vite/wasm-helper.js` (the loader of `.wasm?init`) are not in this
 *     site's scripts [measured 2026-11-08 at 6418a20]. They are named so that a build that does have one lists vite, as for the first two.
 * All come with the vite package, as far as the site can tell: it ships them, and the part of its licence file that is kept covers them, the
 * Rollup plugins' notice included. A virtual module that is not here fails the build (collect), and the way out is to find whose code it is and
 * to name the package here. The table holds modules only: code that a plugin writes into a script after the modules are put together (Vite's
 * `__vite__mapDeps`) is no module, and nor is the code that Rollup writes itself when it renders a chunk (its namespace helper and literals), so
 * no name here can catch either (see the header of this file).
 */
export const INJECTED: Readonly<Record<string, string>> = {
  'commonjsHelpers.js': 'vite',
  'vite/dynamic-import-helper.js': 'vite',
  'vite/modulepreload-polyfill.js': 'vite',
  'vite/preload-helper.js': 'vite',
  'vite/wasm-helper.js': 'vite',
}

/**
 * The name of a module that is not a file: Rollup's `\0` prefix and the query taken off. It is null for a module that is a file, with the
 * prefix or without (`\0/p/node_modules/d/index.js?commonjs-module` is a file that a plugin wrapped).
 */
function virtualName(moduleId: string): string | null {
  if (!moduleId.startsWith('\0')) return null
  const name = plainPath(moduleId)
  return name.startsWith('/') || /^[A-Za-z]:\//.test(name) ? null : name
}

/** A package's folder as a problem names it: from the first node_modules of its path, so that no folder of this machine is printed. */
function labelOf(root: string): string {
  const id = plainPath(root)
  const at = id.indexOf(NODE_MODULES)
  return at < 0 ? path.posix.basename(id) : id.slice(at + 1)
}

/** `node_modules/@scope/name`, `node_modules/name` or the last such pair of a path, read as a name. */
function nameFromPath(root: string): string {
  const parts = labelOf(root).split('/')
  const last = parts.at(-1) ?? ''
  const before = parts.at(-2) ?? ''
  return before.startsWith('@') ? `${before}/${last}` : last
}

/** LICENSE, LICENCE, COPYING and NOTICE, with an extension (`.md`, `.txt`) or a suffix (`-MIT`), and not a script or a data file with such a name. */
const NOTICE_FILES = /^(?:licen[cs]e|copying|notice)(?:[-_.].*)?$/i
const NOT_A_NOTICE = /\.(?:[cm]?[jt]sx?|json|map)$/i

/** The licence a package.json names: `license` as a string or as `{ type }`, or the old `licenses` array joined with OR. */
function identifierOf(manifest: Record<string, unknown>): string | null {
  const one = (value: unknown): string | null => {
    const text = typeof value === 'string' ? value : typeof value === 'object' && value !== null ? (value as { type?: unknown }).type : undefined
    return typeof text === 'string' && text.trim() !== '' ? text.trim() : null
  }
  const single = one(manifest.license)
  if (single !== null) return single
  const several = Array.isArray(manifest.licenses) ? manifest.licenses.map(one).filter((text): text is string => text !== null) : []
  return several.length > 0 ? several.join(' OR ') : null
}

/**
 * Why a package cannot be shipped:
 *   - its package.json cannot be read;
 *   - it has no notice and the repository keeps none for it;
 *   - the repository keeps the parts of its licence file that apply, and keeps them for another version (`excerpt`);
 *   - the installed licence file is not the one that the repository's text was cut from (`changed`).
 */
type Unshippable =
  | { readonly kind: 'manifest'; readonly label: string }
  | { readonly kind: 'notice'; readonly id: string; readonly label: string }
  | { readonly kind: 'excerpt'; readonly id: string; readonly label: string }
  | { readonly kind: 'changed'; readonly id: string; readonly label: string; readonly file: string; readonly expected: string; readonly actual: string | null }

/** The SHA-256 of a file's bytes, or null when the folder has no such file. */
function sha256Of(file: string): string | null {
  return existsSync(file) && statSync(file).isFile() ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
}

/**
 * The package in the folder `root`, or what stops it from being shipped. `excerpted` holds the names of the packages whose licence file the
 * repository replaces with the parts that apply: such a package is shipped from the text kept for its exact version and no other.
 */
function readPackage(root: string, supplied: ReadonlyMap<string, Supplied>, excerpted: ReadonlySet<string>): Dependency | Unshippable {
  const label = labelOf(root)
  let manifest: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    manifest = parsed as Record<string, unknown>
  } catch {
    return { kind: 'manifest', label }
  }
  const name = typeof manifest.name === 'string' && manifest.name !== '' ? manifest.name : nameFromPath(root)
  const version = typeof manifest.version === 'string' && manifest.version !== '' ? manifest.version : 'unknown'
  const identifier = identifierOf(manifest)
  const id = `${name}@${version}`
  const kept = supplied.get(id)
  if (kept?.replaces !== undefined) {
    // The text was cut from one file of one release: with any other file it may not be the licence of the code that is here.
    const actual = sha256Of(path.join(root, kept.replaces.file))
    if (actual !== kept.replaces.sha256) return { kind: 'changed', id, label, file: kept.replaces.file, expected: kept.replaces.sha256, actual }
    return { name, version, identifier, notices: [{ file: kept.file, text: kept.text }], supplied: kept }
  }
  if (excerpted.has(name)) return { kind: 'excerpt', id, label }
  const files = readdirSync(root)
    .filter((entry) => NOTICE_FILES.test(entry) && !NOT_A_NOTICE.test(entry) && statSync(path.join(root, entry)).isFile())
    .sort(compare)
  if (files.length > 0) return { name, version, identifier, notices: files.map((file) => ({ file, text: textOf(path.join(root, file)) })) }
  if (kept === undefined) return { kind: 'notice', id, label }
  return { name, version, identifier, notices: [{ file: kept.file, text: kept.text }], supplied: kept }
}

/** What the plugin gathers: the packages, and for each script the packages inside it. */
export interface Collection {
  /** Every package of the site, by name and then version. */
  readonly dependencies: readonly Dependency[]
  /** For each script, by file (`assets/index-x.js`), the `name@version` of the packages that hold a module in it. */
  readonly chunks: Readonly<Record<string, readonly string[]>>
  /** The `name@version` of the packages named by hand, whose files or whose code reach the site without being a module of a script. */
  readonly alsoShips: readonly string[]
}

/**
 * The packages of some scripts. `modules` maps a script's file to the ids of its modules, `alsoShip` lists the folders of packages that
 * reach the site otherwise, and `supplied` holds the texts that the repository keeps for packages. `toolsDir` is the node_modules folder that
 * the build tool is installed in, where the packages of INJECTED's modules are. It reads every package it meets, and throws a `LicenceError`
 * that names all the packages it cannot ship, and every module that the build tool wrote in and that no package is named for.
 */
export function collect(
  modules: ReadonlyMap<string, readonly string[]>,
  alsoShip: readonly string[] = [],
  supplied: ReadonlyMap<string, Supplied> = new Map(),
  toolsDir?: string,
): Collection {
  // The names of the packages whose licence file the repository replaces: a version of one that has no text of its own fails the build.
  const excerpted = new Set([...supplied].filter(([, kept]) => kept.replaces !== undefined).map(([id]) => id.slice(0, id.lastIndexOf('@'))))
  const byRoot = new Map<string, Dependency | Unshippable>()
  const read = (root: string): Dependency | null => {
    if (!byRoot.has(root)) byRoot.set(root, readPackage(root, supplied, excerpted))
    const found = byRoot.get(root)
    return found !== undefined && 'name' in found ? found : null
  }

  const unnamed = new Set<string>()
  const chunks: Record<string, string[]> = {}
  for (const [file, ids] of [...modules].sort(([a], [b]) => compare(a, b))) {
    const roots = new Set<string>()
    for (const id of ids) {
      const root = packageRootOf(id)
      if (root !== null) {
        roots.add(root)
        continue
      }
      const virtual = virtualName(id)
      if (virtual === null) continue
      const tool = INJECTED[virtual]
      if (tool === undefined) unnamed.add(virtual)
      else if (toolsDir === undefined) throw new Error(`collect was given the module ${virtual}, which the build tool wrote in, and not the node_modules folder that the build tool (${tool}) is installed in`)
      else roots.add(path.join(toolsDir, tool))
    }
    chunks[file] = [...new Set([...roots].flatMap((root) => read(root) ?? []).map(idOf))].sort(compare)
  }
  const extra = alsoShip.flatMap((root) => read(root) ?? []).map(idOf).sort(compare)

  const stuck = [...byRoot.values()].filter((found): found is Unshippable => 'kind' in found)
  const problems: string[] = []
  const noNotice = [...new Set(stuck.flatMap((found) => (found.kind === 'notice' ? [`${found.id} (${found.label})`] : [])))].sort(compare)
  if (noNotice.length > 0) {
    problems.push(
      `${plural(noNotice.length, 'package')} in the site ${noNotice.length === 1 ? 'ships' : 'ship'} no LICENSE, LICENCE, COPYING or NOTICE file, and ${SUPPLIED_FILE} keeps no text for ${noNotice.length === 1 ? 'it' : 'them'} at that version: ${noNotice.join(', ')}. ` +
        `A copy without its notice is an unlicensed copy: read the licence file in the package's repository, keep it under third-party/ with its source and its SHA-256, and list the package in ${SUPPLIED_FILE}, or replace the package`,
    )
  }
  const noExcerpt = [...new Set(stuck.flatMap((found) => (found.kind === 'excerpt' ? [`${found.id} (${found.label})`] : [])))].sort(compare)
  if (noExcerpt.length > 0) {
    problems.push(
      `${plural(noExcerpt.length, 'package')} in the site ship${noExcerpt.length === 1 ? 's' : ''} a licence file of which ${SUPPLIED_FILE} keeps only the parts that apply, and keeps them for another version: ${noExcerpt.join(', ')}. ` +
        `Read the licence file of this version, keep the parts that apply under third-party/ with their source, and list them for this version with the SHA-256 of the file they are cut from ("replaces")`,
    )
  }
  const changed = stuck.flatMap((found) => (found.kind === 'changed' ? [found] : []))
  for (const found of changed) {
    problems.push(
      `${found.id} (${found.label}) ships a ${found.file} that is not the file which ${SUPPLIED_FILE}'s text for it was cut from (${found.actual === null ? 'there is none' : `SHA-256 ${found.actual}`}, and the entry has ${found.expected}): ` +
        'read the file again, keep the parts that apply, and list the new hash',
    )
  }
  const noManifest = [...new Set(stuck.flatMap((found) => (found.kind === 'manifest' ? [found.label] : [])))].sort(compare)
  if (noManifest.length > 0) problems.push(`${noManifest.join(', ')} ${noManifest.length === 1 ? 'has' : 'have'} no package.json that can be read, so the name and version of the package are not known`)
  if (unnamed.size > 0) {
    const names = [...unnamed].sort(compare)
    problems.push(
      `${names.join(', ')} ${names.length === 1 ? 'is a module' : 'are modules'} that the build tool writes into a script and that INJECTED names no package for. ` +
        "Find whose code it is, read that package's licence, and name the package in INJECTED (scripts/pages/third-party-licenses.ts), so that the licence ships with the code",
    )
  }
  if (problems.length > 0) throw new LicenceError(problems)

  // Two folders can hold one version of a package (a copy nested in another package's node_modules): it is listed once.
  const unique = new Map<string, Dependency>()
  for (const found of byRoot.values()) if ('name' in found && !unique.has(idOf(found))) unique.set(idOf(found), found)
  const dependencies = [...unique.values()].sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version))
  return { dependencies, chunks, alsoShips: extra }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Rendering                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One package's section: its heading as a line of its own, its licence, and the text of each notice file. */
function sectionOf(dependency: Dependency): string {
  const several = dependency.notices.length > 1
  const body = dependency.notices.map(({ file, text }) => (several ? `--- ${file} ---\n\n${text}` : text))
  const { supplied } = dependency
  const kept = supplied === undefined ? '' : `${path.posix.dirname(SUPPLIED_FILE)}/${supplied.file}`
  const lead =
    supplied === undefined
      ? []
      : [
          supplied.replaces === undefined
            ? `This package ships no licence file. enginespace keeps the text below for it, in ${kept}.`
            : `This package ships its licence in ${supplied.replaces.file} (SHA-256 ${supplied.replaces.sha256}), which carries more than the code of the package that is in this site. enginespace gives the parts of the file that apply, word for word, as kept in ${kept}.`,
          `Source: ${supplied.source}`,
          supplied.basis,
          ...(supplied.note === undefined ? [] : [supplied.note]),
          '',
        ]
  const licence = dependency.identifier ?? supplied?.licence ?? 'not named in its package.json (the text below is its licence)'
  return [RULE, idOf(dependency), `Licence: ${licence}`, RULE, '', ...lead, body.join('\n\n')].join('\n')
}

/**
 * The text of `third-party-licenses.txt`: what the file is, each package in the order given with the full text of its notices, the
 * repository's NOTICE after them, and the texts of LICENSES/ that NOTICE points to after that. It has no date and no path, so a build
 * writes the same file again and again.
 */
export function render(dependencies: readonly Dependency[], notice: string, texts: readonly RepositoryText[] = []): string {
  const header = [
    'enginespace: third-party licences',
    '',
    'This file carries the licence of every npm package that has code in the scripts or the stylesheet of this site, as each package ships',
    `it: the ${plural(dependencies.length, 'package')} below, sorted by name and each headed by its name and version, then the repository's NOTICE, which carries the`,
    'notices for the code that enginespace vendors from kernelspace, the code it ports and the fonts it hosts, and then the licence texts that',
    'NOTICE points to. A package is listed when a module of it reached a script of the build, even if the build then left its code out as',
    'unused. Vite is listed for the code that its build tool writes into the scripts: its own preload helper, its own dependency-map function',
    '(__vite__mapDeps), which it writes into each script whose lazy imports have other files to load with them, and the interop helper of a',
    "Rollup plugin that it bundles. Vite's section gives Vite's own licence, which is the licence of the first two, and that plugin's. Rollup is",
    'listed for the code that it writes into the scripts itself: its helper that merges namespace objects (_mergeNamespaces, in react-vendor) and',
    "the literals of the namespace objects that it builds for modules, in other scripts. Rollup's section gives Rollup's own licence. Neither section",
    'gives the licences of the other dependencies that the tool bundles into its own build, which run in Node and are not in this site. The build',
    'writes this file, and fails when a package in it has no licence file.',
  ].join('\n')
  const closing = [RULE, NOTICE_FILE, RULE, '', notice.replace(/\r\n?/g, '\n').trimEnd()].join('\n')
  const appended = texts.map(({ file, text }) => [RULE, file, RULE, '', text].join('\n'))
  return `${[header, ...dependencies.map(sectionOf), closing, ...appended].join('\n\n')}\n`
}

/** The record that sits beside the manifest: each script of the build and the packages inside it, for verify:bundle. */
export interface LicenceRecord {
  readonly chunks: Readonly<Record<string, readonly string[]>>
  readonly alsoShips: readonly string[]
}

export const recordOf = ({ chunks, alsoShips }: Collection): LicenceRecord => ({ chunks, alsoShips })

/* ------------------------------------------------------------------------------------------------------------------ */
/* The plugin                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface LicenceOptions {
  /** Packages by name, whose files are copied into the site, or whose code the build writes into a script, without being a module of one. */
  readonly alsoShips?: readonly string[]
}

/**
 * The plugin for the build of the app's own scripts, and the one for the build of each worker. The second only watches: it hands the
 * scripts of a worker, and their modules, to the first, which writes the file once the app's own scripts are known.
 */
export function thirdPartyLicenses(root: string, { alsoShips = [] }: LicenceOptions = {}): { plugin: Plugin; workerPlugin: Plugin } {
  const inWorkers = new Map<string, readonly string[]>()

  const plugin: Plugin = {
    name: 'enginespace:third-party-licenses',
    apply: 'build',
    // After Vite's CSS step, which takes the chunks that hold only CSS out of the bundle: the record is of the scripts that the site serves.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const modules = new Map(inWorkers)
      for (const output of Object.values(bundle)) if (output.type === 'chunk') modules.set(output.fileName, output.moduleIds)
      let notice: string
      try {
        notice = readFileSync(path.join(root, NOTICE_FILE), 'utf8')
      } catch {
        this.error(`third-party licences: ${NOTICE_FILE} is missing from the root of the project; the file carries it, because the vendored and ported code ships in the scripts`)
      }
      let collection: Collection
      try {
        collection = collect(
          modules,
          alsoShips.map((name) => path.join(root, 'node_modules', name)),
          loadSupplied(root),
          path.join(root, 'node_modules'),
        )
      } catch (error) {
        if (error instanceof LicenceError) this.error(error.message)
        throw error
      }
      this.emitFile({ type: 'asset', fileName: LICENCES_FILE, source: render(collection.dependencies, notice, loadTexts(root)) })
      this.emitFile({ type: 'asset', fileName: RECORD_FILE, source: `${JSON.stringify(recordOf(collection), null, 2)}\n` })
    },
  }

  const workerPlugin: Plugin = {
    name: 'enginespace:third-party-licenses:worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) if (output.type === 'chunk') inWorkers.set(output.fileName, output.moduleIds)
    },
  }

  return { plugin, workerPlugin }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The gate                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What verify:bundle reads of a build and of the tree it was built from. */
export interface Shipped {
  /** dist/third-party-licenses.txt, or null when the build has none. */
  readonly text: string | null
  /** dist/.vite/third-party.json as written, or null when the build has none. */
  readonly record: string | null
  /** The repository's NOTICE, or null when the tree has none. */
  readonly notice: string | null
  /** The texts of the tree's LICENSES/ folder, which follow NOTICE in the file. */
  readonly texts: readonly RepositoryText[]
  /** The scripts of the build: the .js files of dist/assets, as `assets/x.js`. */
  readonly scripts: readonly string[]
}

/** The record in `text`, or the sentence that says what is wrong with it. */
export function parseRecord(text: string): LicenceRecord | string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return `${RECORD_FILE} is not JSON`
  }
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')
  const { chunks, alsoShips } = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as { chunks?: unknown; alsoShips?: unknown }
  const shape = typeof chunks === 'object' && chunks !== null && !Array.isArray(chunks) && Object.values(chunks).every(strings) && strings(alsoShips)
  return shape ? { chunks: chunks as Record<string, string[]>, alsoShips } : `${RECORD_FILE} is not the record that the plugin writes: { "chunks": { "assets/x.js": ["name@version"] }, "alsoShips": [] }`
}

/** The packages that a record names, each once, sorted: those inside the scripts, and those named by hand. */
export const packagesIn = (record: LicenceRecord): string[] => [...new Set([...Object.values(record.chunks).flat(), ...record.alsoShips])].sort(compare)

/**
 * What is wrong with the licences that a build ships, as sentences; empty when it is right, with the packages it names. The file must
 * exist and so must the record; the file must list every package that the record names, as a heading line of its own; every script of
 * dist/assets must be in the record, so that a worker the plugin never saw is a problem rather than a gap; and the file must carry NOTICE and
 * each text of LICENSES/ word for word. A record that names no package is a problem too: the app cannot be built without React in it, so a
 * collector that found nothing has failed.
 */
export function checkShipped({ text, record, notice, texts, scripts }: Shipped): { problems: string[]; packages: string[] } {
  if (text === null) {
    return {
      problems: [`dist/${LICENCES_FILE} does not exist: the build writes it (scripts/pages/third-party-licenses.ts, vite.config.ts), and without it the site ships the code of its npm packages with no licence notice`],
      packages: [],
    }
  }
  if (record === null) {
    return { problems: [`dist/${RECORD_FILE} does not exist: the plugin writes it beside the manifest, and without it the gate cannot tell which packages the scripts hold`], packages: [] }
  }
  const parsed = parseRecord(record)
  if (typeof parsed === 'string') return { problems: [`dist/${parsed}`], packages: [] }

  const problems: string[] = []
  const packages = packagesIn(parsed)
  if (packages.length === 0) problems.push(`dist/${RECORD_FILE} names no package: the collector found none in a build that bundles React`)
  const headings = new Set(text.replace(/\r\n?/g, '\n').split('\n'))
  const missing = packages.filter((id) => !headings.has(id))
  if (missing.length > 0) problems.push(`dist/${LICENCES_FILE} has no section for ${missing.join(', ')}, which the build's scripts hold`)
  const unseen = scripts.filter((script) => !Object.hasOwn(parsed.chunks, script))
  if (unseen.length > 0) {
    problems.push(
      `dist/${unseen.join(', dist/')} ${unseen.length === 1 ? 'is a script' : 'are scripts'} of the build that the licence plugin never saw (a worker bundle, if it is one: vite.config.ts puts the plugin in worker.plugins), so the packages inside could be unlicensed`,
    )
  }
  const body = text.replace(/\r\n?/g, '\n')
  if (notice === null) problems.push(`${NOTICE_FILE} is missing from the tree, and the file must carry it`)
  else if (!body.includes(notice.replace(/\r\n?/g, '\n').trimEnd())) {
    problems.push(`dist/${LICENCES_FILE} does not carry ${NOTICE_FILE} word for word: the vendored and ported code ships without its notices`)
  }
  for (const { file, text: licence } of texts) {
    if (!body.includes(licence.replace(/\r\n?/g, '\n').trimEnd())) problems.push(`dist/${LICENCES_FILE} does not carry ${file} word for word: ${NOTICE_FILE} points to a text that the site does not serve`)
  }
  return { problems, packages }
}
