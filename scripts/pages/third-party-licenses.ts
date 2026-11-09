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
 *   - A package whose files reach the site without being a module of a script (Tailwind's base CSS is copied into the stylesheet) is named
 *     in `alsoShips`.
 *   - Beside Vite's manifest the plugin writes `.vite/third-party.json`: each script of the build with the packages inside it. verify:bundle
 *     reads that (checkShipped below) and fails when the licence file lacks a package, when a script of dist/assets is not in the record (a
 *     worker the plugin never saw), or when NOTICE or a text of LICENSES/ is not in the file. tests/build.test.ts holds the record to the
 *     source maps of a real build.
 *
 * Vite has a `build.license` option of its own (7.3.0, `licensePlugin` in dist/node/chunks/config.js), and it is not used, for four reasons
 * that were read in that file: it leaves a package with no licence file out of the text without a word; it reads the first LICENSE, LICENCE
 * or COPYING file of a package and no NOTICE, so a dual-licensed package or an Apache one loses a notice; it is not in the list of a worker's
 * plugins; and it cannot append NOTICE or leave a record for the gate to check.
 *
 * Only the build and its gate use this module, and the tests. The text holds no path of this machine: a package is named by its name and
 * version, and a problem by `node_modules/...` from the first node_modules of its path.
 */
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

/** A licence text that the repository keeps for a package whose release ships none: one entry of third-party/notices.json. */
export interface Supplied {
  /** The text's file under third-party/. */
  readonly file: string
  /** The licence it is, as a label (`MIT`). */
  readonly licence: string
  /** Where the text was read, and the date and the hash and the doubts about it, in the entry's own words. */
  readonly source: string
  readonly basis: string
  readonly text: string
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
      else supplied.set(id, { file, licence, source, basis, text: textOf(target) })
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
 * is null for a module outside node_modules (our own, and Vite's virtual ones) and for a path that ends at the package's folder.
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

/** Why a package cannot be shipped: its package.json cannot be read, or it has no notice and the repository keeps none for it. */
type Unshippable = { readonly kind: 'manifest'; readonly label: string } | { readonly kind: 'notice'; readonly id: string; readonly label: string }

/** The package in the folder `root`, or what stops it from being shipped. */
function readPackage(root: string, supplied: ReadonlyMap<string, Supplied>): Dependency | Unshippable {
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
  const files = readdirSync(root)
    .filter((entry) => NOTICE_FILES.test(entry) && !NOT_A_NOTICE.test(entry) && statSync(path.join(root, entry)).isFile())
    .sort(compare)
  if (files.length > 0) return { name, version, identifier, notices: files.map((file) => ({ file, text: textOf(path.join(root, file)) })) }
  const kept = supplied.get(`${name}@${version}`)
  if (kept === undefined) return { kind: 'notice', id: `${name}@${version}`, label }
  return { name, version, identifier, notices: [{ file: kept.file, text: kept.text }], supplied: kept }
}

/** What the plugin gathers: the packages, and for each script the packages inside it. */
export interface Collection {
  /** Every package of the site, by name and then version. */
  readonly dependencies: readonly Dependency[]
  /** For each script, by file (`assets/index-x.js`), the `name@version` of the packages that hold a module in it. */
  readonly chunks: Readonly<Record<string, readonly string[]>>
  /** The `name@version` of the packages named by hand, whose files reach the site outside a script. */
  readonly alsoShips: readonly string[]
}

/**
 * The packages of some scripts. `modules` maps a script's file to the ids of its modules, `alsoShip` lists the folders of packages that
 * reach the site otherwise, and `supplied` holds the texts that the repository keeps for packages that ship none. It reads every package it
 * meets, and throws a `LicenceError` that names all the packages it cannot ship.
 */
export function collect(modules: ReadonlyMap<string, readonly string[]>, alsoShip: readonly string[] = [], supplied: ReadonlyMap<string, Supplied> = new Map()): Collection {
  const byRoot = new Map<string, Dependency | Unshippable>()
  const read = (root: string): Dependency | null => {
    if (!byRoot.has(root)) byRoot.set(root, readPackage(root, supplied))
    const found = byRoot.get(root)
    return found !== undefined && 'name' in found ? found : null
  }

  const chunks: Record<string, string[]> = {}
  for (const [file, ids] of [...modules].sort(([a], [b]) => compare(a, b))) {
    const roots = [...new Set(ids.flatMap((id) => packageRootOf(id) ?? []))]
    chunks[file] = [...new Set(roots.flatMap((root) => read(root) ?? []).map(idOf))].sort(compare)
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
  const noManifest = [...new Set(stuck.flatMap((found) => (found.kind === 'manifest' ? [found.label] : [])))].sort(compare)
  if (noManifest.length > 0) problems.push(`${noManifest.join(', ')} ${noManifest.length === 1 ? 'has' : 'have'} no package.json that can be read, so the name and version of the package are not known`)
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
  const lead =
    supplied === undefined
      ? []
      : [`This package ships no licence file. enginespace keeps the text below for it, in ${path.posix.dirname(SUPPLIED_FILE)}/${supplied.file}.`, `Source: ${supplied.source}`, supplied.basis, '']
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
    'This file carries the licence of every npm package that the scripts and the stylesheet of this site are built from, as each package ships',
    `it: the ${plural(dependencies.length, 'package')} below, sorted by name and each headed by its name and version, then the repository's NOTICE, which carries the`,
    'notices for the code that enginespace vendors from kernelspace, the code it ports and the fonts it hosts, and then the licence texts that',
    'NOTICE points to. A package is listed when a module of it reached a script of the build, even if the build then left its code out as',
    'unused. The build writes this file, and fails when a package in it has no licence file.',
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
  /** Packages by name, whose files are copied into the site without being a module of a script. */
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
