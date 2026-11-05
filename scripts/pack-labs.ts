/*
 * pack-labs (W1-T11; ARCHITECTURE §9.2, §9.3, §13): packs each forge lab as a zip in public/labs/, with a manifest of SHA-256 hashes.
 *
 *   bun scripts/pack-labs.ts [--out <dir>]    write the zips and manifest.json (default: public/labs)
 *   bun scripts/pack-labs.ts --check          write nothing; fail when the committed files are not what the sources pack to
 *
 * A zip is what a learner downloads from the lab's page: one folder, `enginespace-<lab>/`, that is a Cargo workspace.
 *
 *   Cargo.toml, Cargo.lock       generated: the workspace of the kit and this one crate, and the lockfile of those two
 *   rust-toolchain.toml          the compiler the checks were written against (labs/forge)
 *   <crate>/                     the lab: Cargo.toml, src/ (the harness lib.rs, DO NOT EDIT, and the one TODO(you) file) and tests/
 *   kit/                         kslab, byte for byte as labs/forge/kit holds it
 *   README.md                    the learner's, from labs/forge/README.template.md and the lab's entry in src/forge/labs.ts
 *   AGENTS.md, CLAUDE.md,        the agent kit (labs/agent-kit, kernelspace's renamed and extended, D-031): tutoring rules, and a
 *   .claude/                     guard that keeps an agent out of the TODO(you) file and out of the harness
 *   NOTICE                       kernelspace's MIT notice, for kit/ and the agent kit
 *
 * What never ships: the crate's reference/ and bestiary/ (the solution and the wrong modules), target/, and any build output. A crate
 * folder with an entry that is neither shipped nor withheld stops the packer, so a new kind of file is a decision and not an accident.
 *
 * The zips are committed (the site serves them as static files, and the repository is private), so they are reproducible: the same
 * sources give the same bytes on every machine (scripts/labs/zip.ts says how), and `--check` is the test that a source changed
 * without a repack. manifest.json lists each zip's SHA-256 and size and, for review (a zip is a binary blob in a diff), every member's.
 * It is the one manifest of public/labs: an entry of a kind this script does not write is kept as it is, so W2-T10's GPU kit and
 * grader wheel can join it.
 *
 * Exit status: 0 when done (or, with --check, when fresh), 1 when a lab cannot be packed or --check found a difference, 2 for a usage error.
 */

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FORGE_LABS } from '../src/forge/labs'
import { CHECK_BUDGET_MS } from '../src/forge/protocol'
import { readZip, writeZip } from './labs/zip'
import { parsePin } from './labs/toolchain'
import { readVendorMd } from './vendor-drift'

/* ------------------------------------------------------------------------------------------------------------------ */
/* What a lab is, to the packer                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A lab as the packer reads it from the registry (src/forge/labs.ts): its entry there satisfies this. */
export interface PackLab {
  id: string
  /** The lab's name on its page. */
  title: string
  /** The engine's word for the lab's subject. */
  engineTerm: string
  /** What the lab is, in two sentences. */
  lead: string
  /** The crate's folder under labs/forge. */
  crate: string
  /** The file that building it writes. */
  wasm: string
  checks: readonly { id: string; label: string; stage: number; seeded: boolean; catches: string }[]
}

/** One file of a zip, by its path inside the lab's folder. */
export interface Member {
  path: string
  data: Uint8Array
  mode: number
}

export interface LabArchive {
  lab: string
  /** `enginespace-toy.zip` */
  name: string
  /** The folder that holds every member: `enginespace-toy`. */
  root: string
  members: Member[]
  zip: Uint8Array
  /** The file the learner writes, and the harness, by their paths inside the folder: the two files the guard protects. */
  todoFile: string
  harnessFile: string
}

export const ZIP_PREFIX = 'enginespace-'
export const MANIFEST_NAME = 'manifest.json'
export const MANIFEST_SCHEMA = 'enginespace/labs-manifest@1'
export const OUT_DIR = 'public/labs'
export const zipName = (lab: string) => `${ZIP_PREFIX}${lab}.zip`

export const REPO_ROOT = path.resolve(import.meta.dirname, '..')

const FORGE = 'labs/forge'
const AGENT_KIT = 'labs/agent-kit'
const FILE_MODE = 0o644
const SCRIPT_MODE = 0o755
const GUARD = '.claude/hooks/es-guard.sh'

/** A crate folder's entries that go into the zip. `tests` may be absent. */
const SHIPPED = ['Cargo.toml', 'src', 'tests']
/** The entries that are the repository's and never the learner's: the solution, the wrong modules, and the build output. */
const WITHHELD = ['reference', 'bestiary', 'target']
/** A member of a zip that must never be one, whatever put it there. */
const PRIVATE = /(^|\/)(reference|bestiary|target|_solutions|\.git)(\/|$)|\.(wasm|rlib|rmeta)$/

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const bytes = (value: string) => new TextEncoder().encode(value)
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const basename = (file: string) => file.slice(file.lastIndexOf('/') + 1)
const byPath = <T extends { path: string }>(a: T, b: T) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

/** `template` with each `{{KEY}}` replaced. A placeholder that `values` does not fill is an error: it would reach a learner as it is. */
export function fill(template: string, values: Readonly<Record<string, string>>, what: string): string {
  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key: string) => values[key] ?? placeholder)
  const left = /\{\{[A-Z_]+\}\}/.exec(out)
  if (left !== null) throw new Error(`${what}: the placeholder ${left[0]} is not filled`)
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pieces of a zip                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Every regular file under `dir`, as paths relative to it with `/` separators, in order. A symlink or another kind of entry is an error. */
function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = path.join(dir, name)
      const stat = lstatSync(full)
      if (stat.isDirectory()) return filesUnder(full, `${prefix}${name}/`)
      if (!stat.isFile()) throw new Error(`${full} is not a regular file: a zip carries files, and a link could point out of the folder`)
      return [`${prefix}${name}`]
    })
}

/** The lab crate's files, by their paths in the zip (`toy/Cargo.toml`, `toy/src/lib.rs`, ...). */
function crateMembers(lab: PackLab, root: string): Member[] {
  const dir = path.join(root, FORGE, lab.crate)
  if (!existsSync(dir)) throw new Error(`${lab.id}: ${FORGE}/${lab.crate} does not exist`)
  for (const entry of readdirSync(dir)) {
    if (!SHIPPED.includes(entry) && !WITHHELD.includes(entry)) {
      throw new Error(`${lab.id}: ${FORGE}/${lab.crate}/${entry} is neither shipped nor withheld: say which in SHIPPED or WITHHELD in scripts/pack-labs.ts`)
    }
  }
  const relative = ['Cargo.toml']
  for (const folder of ['src', 'tests']) {
    if (existsSync(path.join(dir, folder))) relative.push(...filesUnder(path.join(dir, folder)).map((file) => `${folder}/${file}`))
  }
  return relative.map((file) => ({ path: `${lab.crate}/${file}`, data: readFileSync(path.join(dir, file)), mode: FILE_MODE }))
}

/** The workspace manifest of one zip: the kit and the crate, with the release profile of labs/forge, so that a build comes out the same. */
export function workspaceManifest(forgeManifest: string, members: readonly string[], title: string): string {
  const resolver = /^resolver\s*=\s*"([^"]+)"/m.exec(forgeManifest)?.[1]
  const lines = forgeManifest.split('\n')
  const start = lines.findIndex((line) => /^\[profile\.release\]\s*$/.test(line))
  if (resolver === undefined || start < 0) throw new Error(`${FORGE}/Cargo.toml needs a [workspace] resolver and a [profile.release] table: the zips take both`)
  const end = lines.findIndex((line, i) => i > start && line.startsWith('['))
  const profile = lines.slice(start + 1, end < 0 ? undefined : end).filter((line) => line.trim() !== '' && !line.trim().startsWith('#'))
  return [
    `# ${title}: a Cargo workspace of the kit (kslab) and the crate you edit.`,
    '[workspace]',
    `members = [${members.map((member) => `"${member}"`).join(', ')}]`,
    `resolver = "${resolver}"`,
    '',
    "# A release build is what you drop on the lab's page. These settings keep it small and make two builds of one source the same bytes.",
    '[profile.release]',
    ...profile,
    '',
  ].join('\n')
}

/** Cargo.lock for the packages in `keep`, as cargo wrote them. The forge crates depend on each other by path and on nothing fetched (A§14). */
export function trimLock(lock: string, keep: readonly string[]): string {
  const [preamble, ...packages] = lock.trimEnd().split(/\n\n(?=\[\[package\]\])/)
  const nameOf = (block: string) => /^name = "([^"]+)"$/m.exec(block)?.[1]
  const kept = packages.filter((block) => keep.includes(nameOf(block) ?? ''))
  const missing = keep.filter((name) => !kept.some((block) => nameOf(block) === name))
  if (missing.length > 0) throw new Error(`${FORGE}/Cargo.lock has no package ${missing.join(', ')}: run cargo in labs/forge and commit the lockfile`)
  for (const block of kept) {
    if (/^source = /m.test(block)) throw new Error(`${FORGE}/Cargo.lock: ${nameOf(block)} comes from a registry, and a lab zip builds offline from path dependencies`)
    const dependencies = /^dependencies = \[([^\]]*)\]/m.exec(block)?.[1] ?? ''
    for (const [, entry] of dependencies.matchAll(/"([^"]+)"/g)) {
      // An entry is a package's name, followed by its version when two packages share the name.
      const name = (entry as string).split(' ')[0] as string
      if (!keep.includes(name)) throw new Error(`${FORGE}/Cargo.lock: ${nameOf(block)} depends on ${name}, which is not in the zip`)
    }
  }
  return `${[preamble, ...kept].join('\n\n')}\n`
}

/** The check list of AGENTS.md: the site's ids, labels and stages, in grading order. */
const checkList = (lab: PackLab) => lab.checks.map((check) => `- \`${check.id}\`: ${check.label} (stage ${check.stage}${check.seeded ? ', seeded' : ''})`).join('\n')

/** The check table of README.md. */
function checkTable(lab: PackLab): string {
  const cell = (value: string) => value.replaceAll('|', '\\|')
  return [
    '| Check | Stage | Seeded | What it catches |',
    '|---|---|---|---|',
    ...lab.checks.map((check) => `| \`${check.id}\` | ${check.stage} | ${check.seeded ? 'yes, new inputs on every run' : 'no'} | ${cell(check.catches)} |`),
  ].join('\n')
}

/** Fills every string of a parsed JSON template, so that JSON escaping is never ours to get wrong. */
function fillJson(value: unknown, values: Readonly<Record<string, string>>): unknown {
  if (typeof value === 'string') return fill(value, values, 'settings.template.json')
  if (Array.isArray(value)) return value.map((item) => fillJson(item, values))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillJson(item, values)]))
  return value
}

/** kernelspace's notice, for the two things in a zip that are kernelspace's. */
function notice(root: string, lab: PackLab): string {
  const licence = readFileSync(path.join(root, 'vendor/kernelspace/LICENSE'), 'utf8').trimEnd()
  return [
    `enginespace forge lab ${lab.id}: third-party notices`,
    '',
    'kit/ is kslab, and AGENTS.md, CLAUDE.md and .claude/ are adapted from the agent kit of kernelspace, the course',
    "that enginespace specializes. Both are kernelspace's code, copied from its commit",
    `${readVendorMd(root).pin}, and they are used under the MIT License below.`,
    '',
    'The terms for the other files of this lab are not stated here yet.',
    '',
    licence,
    '',
  ].join('\n')
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* One zip                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Packs one lab. It throws, naming the lab, when the crate is not shaped as the packer needs it. */
export function buildArchive(lab: PackLab, root: string = REPO_ROOT): LabArchive {
  if (!/^[a-z][a-z0-9-]*$/.test(lab.id)) throw new Error(`${lab.id}: a lab id is lowercase words joined by dashes`)
  if (!/^[a-z][a-z0-9-]*$/.test(lab.crate)) throw new Error(`${lab.id}: the crate "${lab.crate}" is a folder of labs/forge, named by lowercase words joined by dashes`)
  if (!/^[a-z][a-z0-9_]*\.wasm$/.test(lab.wasm)) throw new Error(`${lab.id}: the module "${lab.wasm}" is the crate's name with underscores, and .wasm`)
  const forge = (file: string) => readFileSync(path.join(root, FORGE, file))
  const kit = (file: string) => readFileSync(path.join(root, AGENT_KIT, file), 'utf8')
  const members: Member[] = []
  const add = (file: string, data: Uint8Array | string, mode = FILE_MODE) => members.push({ path: file, data: typeof data === 'string' ? bytes(data) : data, mode })

  // The crate, and the two files in it that matter: the harness and the learner's.
  const crate = crateMembers(lab, root)
  members.push(...crate)
  const harnessFile = `${lab.crate}/src/lib.rs`
  const harness = crate.find((member) => member.path === harnessFile)
  if (harness === undefined) throw new Error(`${lab.id}: ${FORGE}/${harnessFile} is missing: a lab's harness is its src/lib.rs`)
  if (!text(harness.data).includes('DO NOT EDIT')) throw new Error(`${lab.id}: ${harnessFile} is not marked DO NOT EDIT, and the guard would protect a file that says anything may be changed`)
  const marked = crate.filter((member) => member.path.startsWith(`${lab.crate}/src/`) && member.path.endsWith('.rs') && /^\/\/! TODO\(you\)/m.test(text(member.data)))
  if (marked.length !== 1) throw new Error(`${lab.id}: the learner's file is the one src/ file that opens with "//! TODO(you)", and there are ${marked.length}`)
  const todoFile = (marked[0] as Member).path
  if (todoFile === harnessFile) throw new Error(`${lab.id}: ${harnessFile} is both the harness and the learner's file`)
  // The guard matches a file by its name (kernelspace's design, so that no spelling of a path gets round it), so the two cannot share one.
  if (basename(todoFile) === basename(harnessFile)) throw new Error(`${lab.id}: the learner's file ${todoFile} and the harness ${harnessFile} share the name ${basename(harnessFile)}, and the guard tells files apart by name`)

  // The workspace.
  add('Cargo.toml', workspaceManifest(forge('Cargo.toml').toString(), ['kit', lab.crate], lab.title))
  add('Cargo.lock', trimLock(forge('Cargo.lock').toString(), ['kslab', lab.crate]))
  add('rust-toolchain.toml', forge('rust-toolchain.toml'))
  add('.gitignore', forge('.gitignore'))
  add('kit/Cargo.toml', forge('kit/Cargo.toml'))
  add('kit/src/lib.rs', forge('kit/src/lib.rs'))

  // The agent kit.
  const values = {
    LAB_ID: lab.id,
    LAB_TITLE: lab.title,
    LEAD: lab.lead,
    ENGINE_TERM: lab.engineTerm,
    CRATE_DIR: lab.crate,
    TODO_FILE: todoFile,
    TODO_BASENAME: basename(todoFile),
    HARNESS_FILE: harnessFile,
    HARNESS_BASENAME: basename(harnessFile),
    ARTIFACT_NAME: lab.wasm,
    CHECK_COUNT: String(lab.checks.length),
    CHECKS: checkList(lab),
    CHECK_TABLE: checkTable(lab),
    CHECK_BUDGET: String(CHECK_BUDGET_MS / 1000),
    TOOLCHAIN: parsePin(forge('rust-toolchain.toml').toString()).channel,
  }
  add('.claude/settings.json', `${JSON.stringify(fillJson(JSON.parse(kit('settings.template.json')), values), null, 2)}\n`)
  add(GUARD, kit('hooks/es-guard.sh'), SCRIPT_MODE)
  add('.claude/output-styles/enginespace-socratic.md', kit('output-styles/enginespace-socratic.md'))
  add('AGENTS.md', fill(kit('AGENTS.template.md'), values, 'AGENTS.template.md'))
  add('CLAUDE.md', '@AGENTS.md\n')

  // What the learner reads.
  add('README.md', fill(forge('README.template.md').toString(), values, 'README.template.md'))
  add('NOTICE', notice(root, lab))

  members.sort(byPath)
  const stray = members.filter((member) => PRIVATE.test(member.path))
  if (stray.length > 0) throw new Error(`${lab.id}: ${stray.map((member) => member.path).join(', ')} must not ship (the solution, the bestiary and build output stay in the repository)`)

  const folder = `${ZIP_PREFIX}${lab.id}`
  const zip = writeZip(members.map((member) => ({ name: `${folder}/${member.path}`, data: member.data, mode: member.mode })))
  return { lab: lab.id, name: zipName(lab.id), root: folder, members, zip, todoFile, harnessFile }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The manifest                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface ManifestFile {
  /** The file's name in public/labs. */
  name: string
  /** What wrote it: `forge-lab` is this script's. Another task's kinds (W2-T10's) are kept as they are. */
  kind: string
  lab?: string
  bytes: number
  sha256: string
  /** The folder every member sits in. */
  root?: string
  /** For review: each file of the zip, by its path in the folder. */
  members?: { path: string; bytes: number; sha256: string }[]
}

export interface Manifest {
  schema: typeof MANIFEST_SCHEMA
  files: ManifestFile[]
}

const OWN_KIND = 'forge-lab'

export function manifestFile(archive: LabArchive): ManifestFile {
  return {
    name: archive.name,
    kind: OWN_KIND,
    lab: archive.lab,
    bytes: archive.zip.length,
    sha256: sha256(archive.zip),
    root: archive.root,
    members: archive.members.map((member) => ({ path: member.path, bytes: member.data.length, sha256: sha256(member.data) })),
  }
}

/**
 * The text of manifest.json: `kept` (entries of other kinds) and the fresh entries, by name. A member is one line, so that a change to a
 * zip shows in a diff of this file as the lines of the members that changed.
 */
export function manifestText(own: readonly ManifestFile[], kept: readonly ManifestFile[] = []): string {
  const files = [...kept, ...own].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const json = JSON.stringify({ schema: MANIFEST_SCHEMA, files } satisfies Manifest, null, 2)
  return `${json.replace(/\{\s+("path": "[^"]*"),\s+("bytes": \d+),\s+("sha256": "[0-9a-f]{64}")\s+\}/g, '{ $1, $2, $3 }')}\n`
}

/** The manifest in `dir`, or null when there is none. */
export function readManifest(dir: string): Manifest | null {
  const file = path.join(dir, MANIFEST_NAME)
  if (!existsSync(file)) return null
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Manifest>
  if (parsed.schema !== MANIFEST_SCHEMA || !Array.isArray(parsed.files)) throw new Error(`${file} is not an ${MANIFEST_SCHEMA} manifest`)
  return parsed as Manifest
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Packing, and checking what is packed                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Options {
  root?: string
  out?: string
  labs?: readonly PackLab[]
}

const labsOf = (options: Options): PackLab[] => [...(options.labs ?? Object.values(FORGE_LABS))].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** Packs every lab and audits what it made by reading it back. Nothing is written. */
export function buildAll(options: Options = {}): LabArchive[] {
  const root = options.root ?? REPO_ROOT
  return labsOf(options).map((lab) => {
    const archive = buildArchive(lab, root)
    const entries = readZip(archive.zip)
    const expected = archive.members.map((member) => `${archive.root}/${member.path}`)
    if (entries.map((entry) => entry.name).join('\n') !== expected.join('\n')) throw new Error(`${lab.id}: the zip does not list the members it was given`)
    entries.forEach((entry, i) => {
      const member = archive.members[i] as Member
      if (sha256(entry.data) !== sha256(member.data) || entry.mode !== member.mode) throw new Error(`${lab.id}: ${member.path} comes back from the zip changed`)
    })
    return archive
  })
}

/** Writes the zips and the manifest into `out`, and removes a zip that an earlier run wrote for a lab that is gone. */
export function packLabs(options: Options = {}): LabArchive[] {
  const out = path.resolve(options.out ?? path.join(options.root ?? REPO_ROOT, OUT_DIR))
  const archives = buildAll(options)
  const before = readManifest(out)
  const kept = (before?.files ?? []).filter((file) => file.kind !== OWN_KIND)
  const stale = (before?.files ?? []).filter((file) => file.kind === OWN_KIND && !archives.some((archive) => archive.name === file.name))
  mkdirSync(out, { recursive: true })
  for (const file of stale) rmSync(path.join(out, file.name), { force: true })
  for (const archive of archives) writeFileSync(path.join(out, archive.name), archive.zip)
  writeFileSync(path.join(out, MANIFEST_NAME), manifestText(archives.map(manifestFile), kept))
  return archives
}

/**
 * What is wrong with `out`, as sentences that say what to do. It reads what the sources pack to, and compares: each zip byte for byte,
 * each entry of the manifest, and then the manifest against the files (every entry's SHA-256 and size, and every zip being listed).
 */
export function checkLabs(options: Options = {}): string[] {
  const out = path.resolve(options.out ?? path.join(options.root ?? REPO_ROOT, OUT_DIR))
  const repack = `run \`bun scripts/pack-labs.ts\` and commit ${path.relative(options.root ?? REPO_ROOT, out) || '.'}`
  const problems: string[] = []
  const archives = buildAll(options)
  let manifest: Manifest | null = null
  try {
    manifest = readManifest(out)
    if (manifest === null) problems.push(`${MANIFEST_NAME} is missing: ${repack}`)
  } catch (e) {
    problems.push(`${e instanceof Error ? e.message : String(e)}: ${repack}`)
  }

  for (const archive of archives) {
    const file = path.join(out, archive.name)
    if (!existsSync(file)) problems.push(`${archive.name} is missing: ${repack}`)
    else if (sha256(readFileSync(file)) !== sha256(archive.zip)) problems.push(`${archive.name} is stale: a source of ${archive.lab} changed (or the agent kit did), so ${repack}`)
    const listed = manifest?.files.find((entry) => entry.name === archive.name)
    if (manifest !== null && JSON.stringify(listed) !== JSON.stringify(manifestFile(archive))) problems.push(`${MANIFEST_NAME} has ${listed === undefined ? 'no entry' : 'a stale entry'} for ${archive.name}: ${repack}`)
  }
  for (const entry of manifest?.files ?? []) {
    if (entry.kind === OWN_KIND && !archives.some((archive) => archive.name === entry.name)) problems.push(`${MANIFEST_NAME} lists ${entry.name}, which no lab packs any more: ${repack}`)
    const file = path.join(out, entry.name)
    if (!existsSync(file)) problems.push(`${MANIFEST_NAME} lists ${entry.name}, which is not there`)
    else {
      const actual = readFileSync(file)
      if (sha256(actual) !== entry.sha256 || actual.length !== entry.bytes) problems.push(`${entry.name} is not the file that ${MANIFEST_NAME} describes (its SHA-256 or size differs)`)
    }
  }
  if (existsSync(out)) {
    for (const name of readdirSync(out).sort()) {
      if (name.endsWith('.zip') && !manifest?.files.some((entry) => entry.name === name)) problems.push(`${name} is not listed in ${MANIFEST_NAME}: every file of ${path.basename(out)}/ is`)
    }
  }
  return problems
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command line                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const USAGE = 'usage: bun scripts/pack-labs.ts [--out <dir>] [--check]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[], print: (line: string) => void = console.log, fail: (line: string) => void = console.error): number {
  let out: string | undefined
  let check = false
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i] as string
    if (argument === '--check') check = true
    else if (argument === '--out' && argv[i + 1] !== undefined) out = argv[++i]
    else if (argument.startsWith('--out=')) out = argument.slice('--out='.length)
    else {
      fail(`pack-labs: unknown argument "${argument}"\n${USAGE}`)
      return 2
    }
  }
  try {
    if (check) {
      const problems = checkLabs(out === undefined ? {} : { out })
      for (const problem of problems) fail(`pack-labs: ${problem}`)
      if (problems.length > 0) return 1
      print(`pack-labs: ${out ?? OUT_DIR} is what the sources pack to (${Object.keys(FORGE_LABS).length} lab(s))`)
      return 0
    }
    for (const archive of packLabs(out === undefined ? {} : { out })) {
      print(`packed ${archive.name}: ${archive.members.length} files, ${archive.zip.length} bytes, sha256 ${sha256(archive.zip)}`)
    }
    return 0
  } catch (e) {
    fail(`pack-labs: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
