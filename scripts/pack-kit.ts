/*
 * pack-kit (W2-T10; ARCHITECTURE §9.2, §9.3): packs the grader wheel and the GPU kit into public/labs/, adds both to the manifest that
 * scripts/pack-labs.ts keeps there, and writes the list of published grader builds that the receipt worker compares a receipt with.
 *
 *   bun scripts/pack-kit.ts [--out <dir>]    write the wheel, the kit zip, manifest.json and src/receipts/graders.ts
 *   bun scripts/pack-kit.ts --check          write nothing; fail when the committed files are not what the sources pack to
 *
 * Two files come out, and both are reproducible: the same sources give the same bytes on every machine, so anyone can recompute the hash that
 * the manifest lists (the zip writer of scripts/labs/zip.ts says why a stored archive is).
 *
 *   enginespace_grader-<version>-py3-none-any.whl   the grader's import package and its dist-info, written here and not by `uv build`, so that
 *                                                   the bytes depend on this script and the sources and on no tool's version
 *   enginespace-gpu-kit-<version>.zip               one folder, `enginespace-gpu-kit/`:
 *       README.md                from labs/kit/README.template.md
 *       course.lock.json         the engine pins, which `enginespace doctor` reads from the kit's root
 *       grader/                  pyproject.toml, uv.lock, README.md and src/: the project that every environment names as `../../grader`
 *       envs/                    each environment's pyproject.toml, uv.lock, requirements.txt and Dockerfile, and envs/README.md
 *       references/              manifest.json and README.md (the references manifest, `enginespace fetch`)
 *       gpu/, runners/           the lab kits and the rented-GPU runners, when labs/gpu and labs/runners exist (W2-T11 and the module labs)
 *
 * The manifest lists the wheel with its `version` and `sourceSha256`, which is the hash over the files of the import package that `enginespace
 * version` prints and a receipt records (labs/grader/src/enginespace_grader/identity.py). The wheel's entry is written to
 * src/receipts/graders.ts too (PUBLISHED_GRADERS), from the same computation, so that the list the site compiles in and the wheel it serves cannot
 * part. tests/grader/pack-kit.test.ts and labs/grader/tests/test_published.py hold the two together, the second against identity.py itself.
 *
 * A grader version is published once it is on the list. Packing the same version again, from changed sources, replaces its entry: until the owner
 * publishes the course there is no receipt in the world that this would orphan. After that, a change to the grader's package needs a new
 * `version` in labs/grader/pyproject.toml, and the entry of the old one stays.
 *
 * Exit status: 0 when done (or, with --check, when fresh), 1 when something cannot be packed or --check found a difference, 2 for a usage error.
 */

import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fill, MANIFEST_NAME, manifestText, readManifest, REPO_ROOT, type ManifestFile } from './pack-labs'
import { readZip, writeZip, type ZipEntry } from './labs/zip'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Names and small helpers                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export const WHEEL_KIND = 'grader-wheel'
export const KIT_KIND = 'gpu-kit'
export const KIT_ROOT = 'enginespace-gpu-kit'
export const OUT_DIR = 'public/labs'
export const GRADERS_FILE = 'src/receipts/graders.ts'

const GRADER = 'labs/grader'
const PACKAGE = 'enginespace_grader'
const FILE_MODE = 0o644
const SCRIPT_MODE = 0o755
/** A member of the kit that must never be one: the solution, the wrong modules, build output and version control. */
const PRIVATE = /(^|\/)(reference|bestiary|target|_solutions|\.git|\.venv|__pycache__|node_modules)(\/|$)|\.(wasm|rlib|rmeta|pyc|pyo)$/

export const kitName = (version: string) => `${KIT_ROOT}-${version}.zip`
export const wheelName = (version: string) => `${PACKAGE}-${version}-py3-none-any.whl`

const bytesOf = (value: string) => new TextEncoder().encode(value)
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

export interface Member {
  path: string
  data: Uint8Array
  mode: number
}

/** The regular files under `dir` as paths relative to it, with `/` between the parts, sorted by the UTF-8 bytes of the path. A link is an error. */
function filesUnder(dir: string, keep: (relative: string, name: string) => boolean = () => true): string[] {
  const found: string[] = []
  const walk = (relative: string) => {
    for (const name of readdirSync(path.join(dir, relative)).sort()) {
      const next = relative === '' ? name : `${relative}/${name}`
      const stat = lstatSync(path.join(dir, next))
      if (stat.isDirectory()) {
        if (keep(next, name)) walk(next)
      } else if (stat.isFile()) {
        if (keep(next, name)) found.push(next)
      } else throw new Error(`${path.join(dir, next)} is not a regular file: a kit carries files, and a link could point out of the folder`)
    }
  }
  walk('')
  return found.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
}

/** What identity.py leaves out of the package's hash: bytecode and its folder, and anything whose name starts with a dot. */
const inPackage = (_relative: string, name: string) => name !== '__pycache__' && !name.startsWith('.') && !name.endsWith('.pyc') && !name.endsWith('.pyo')

/* ------------------------------------------------------------------------------------------------------------------ */
/* The grader's package, its hash and its metadata                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface PackageFile {
  /** The path inside the import package, `/` between the parts. */
  path: string
  data: Uint8Array
}

/** The files of `labs/grader/src/enginespace_grader` that the hash covers, as identity.py's `package_files` lists them. */
export function packageFiles(root: string = REPO_ROOT): PackageFile[] {
  const base = path.join(root, GRADER, 'src', PACKAGE)
  if (!existsSync(base)) throw new Error(`${GRADER}/src/${PACKAGE} does not exist`)
  return filesUnder(base, inPackage).map((file) => ({ path: file, data: readFileSync(path.join(base, file)) }))
}

/** The `sourceSha256` of the files: identity.py's `source_sha256`, which labs/grader/tests/test_published.py holds this to. */
export function sourceSha256(files: readonly PackageFile[]): string {
  const digest = createHash('sha256')
  const sorted = [...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
  for (const file of sorted) {
    digest.update(bytesOf(file.path))
    digest.update(Uint8Array.of(0))
    digest.update(bytesOf(String(file.data.length)))
    digest.update(Uint8Array.of(0))
    digest.update(file.data)
  }
  return digest.digest('hex')
}

export interface Project {
  name: string
  version: string
  summary: string
  requiresPython: string
  dependencies: string[]
  classifiers: string[]
  scripts: Record<string, string>
}

const stringOf = (toml: string, key: string, table = 'project'): string => {
  const section = new RegExp(`^\\[${table.replace('.', '\\.')}\\]\\s*$([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm').exec(toml)?.[1] ?? ''
  const value = new RegExp(`^${key}\\s*=\\s*"([^"\\n]*)"\\s*(#.*)?$`, 'm').exec(section)?.[1]
  if (value === undefined) throw new Error(`${GRADER}/pyproject.toml: [${table}] has no ${key} as a plain string`)
  return value
}

const listOf = (toml: string, key: string): string[] => {
  const body = new RegExp(`^${key}\\s*=\\s*\\[([^\\]]*)\\]`, 'm').exec(toml)?.[1]
  if (body === undefined) throw new Error(`${GRADER}/pyproject.toml has no ${key} as a list of strings`)
  return [...body.matchAll(/"([^"\n]*)"/g)].map((match) => match[1] as string)
}

/** The fields of labs/grader/pyproject.toml that a wheel's METADATA needs. The file is read, not parsed: a field in another shape is an error. */
export function readProject(root: string = REPO_ROOT): Project {
  const toml = readFileSync(path.join(root, GRADER, 'pyproject.toml'), 'utf8')
  const scriptsBody = /^\[project\.scripts\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(toml)?.[1] ?? ''
  const scripts = Object.fromEntries([...scriptsBody.matchAll(/^([A-Za-z0-9_.-]+)\s*=\s*"([^"\n]+)"/gm)].map((match) => [match[1] as string, match[2] as string]))
  const project: Project = {
    name: stringOf(toml, 'name'),
    version: stringOf(toml, 'version'),
    summary: stringOf(toml, 'description'),
    requiresPython: stringOf(toml, 'requires-python'),
    dependencies: listOf(toml, 'dependencies'),
    classifiers: listOf(toml, 'classifiers'),
    scripts,
  }
  if (project.name !== 'enginespace-grader') throw new Error(`${GRADER}/pyproject.toml names the project "${project.name}", not enginespace-grader`)
  if (!/^[0-9][0-9A-Za-z.+_-]{0,63}$/.test(project.version)) throw new Error(`${GRADER}/pyproject.toml: the version "${project.version}" is not one that a receipt's schema takes`)
  if (Object.keys(scripts).length === 0) throw new Error(`${GRADER}/pyproject.toml has no [project.scripts]`)
  return project
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The wheel                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Wheel {
  name: string
  version: string
  sourceSha256: string
  members: Member[]
  zip: Uint8Array
}

/** The RECORD line of a file: its path, `sha256=` its digest in URL-safe base64 without padding, and its size. */
const recordLine = (file: string, data: Uint8Array) => `${file},sha256=${createHash('sha256').update(data).digest('base64url')},${data.length}`

/** The wheel (PEP 427) of the grader's import package: pure Python, any platform, with the dist-info that pip and uv read. */
export function buildWheel(root: string = REPO_ROOT): Wheel {
  const project = readProject(root)
  const files = packageFiles(root)
  const readme = readFileSync(path.join(root, GRADER, 'README.md'), 'utf8')
  const dist = `${PACKAGE}-${project.version}.dist-info`
  const metadata = [
    'Metadata-Version: 2.1',
    `Name: ${project.name}`,
    `Version: ${project.version}`,
    `Summary: ${project.summary}`,
    ...project.classifiers.map((classifier) => `Classifier: ${classifier}`),
    `Requires-Python: ${project.requiresPython}`,
    ...project.dependencies.map((dependency) => `Requires-Dist: ${dependency}`),
    'Description-Content-Type: text/markdown',
    '',
    readme,
  ].join('\n')
  const wheel = ['Wheel-Version: 1.0', 'Generator: enginespace pack-kit', 'Root-Is-Purelib: true', 'Tag: py3-none-any', ''].join('\n')
  const entryPoints = ['[console_scripts]', ...Object.entries(project.scripts).map(([name, target]) => `${name} = ${target}`), ''].join('\n')

  const members: Member[] = files.map((file) => ({ path: `${PACKAGE}/${file.path}`, data: file.data, mode: FILE_MODE }))
  const meta: Member[] = [
    { path: `${dist}/METADATA`, data: bytesOf(metadata), mode: FILE_MODE },
    { path: `${dist}/WHEEL`, data: bytesOf(wheel), mode: FILE_MODE },
    { path: `${dist}/entry_points.txt`, data: bytesOf(entryPoints), mode: FILE_MODE },
  ]
  const record = [...members, ...meta].map((member) => recordLine(member.path, member.data))
  record.push(`${dist}/RECORD,,`, '')
  meta.push({ path: `${dist}/RECORD`, data: bytesOf(record.join('\n')), mode: FILE_MODE })
  const all = [...members, ...meta]
  return {
    name: wheelName(project.version),
    version: project.version,
    sourceSha256: sourceSha256(files),
    members: all,
    zip: writeZip(all.map((member) => ({ name: member.path, data: member.data, mode: member.mode }))),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The kit                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Kit {
  name: string
  version: string
  /** The hash over the grader's package inside the kit, which has to be the wheel's. */
  graderSourceSha256: string
  members: Member[]
  zip: Uint8Array
}

/** The files of a folder of `labs/` that ship whole (gpu/, runners/): every regular file, with the private kinds refused and not left out. */
function wholeFolder(root: string, folder: string): Member[] {
  const base = path.join(root, 'labs', folder)
  if (!existsSync(base)) return []
  return filesUnder(base).map((file) => ({
    path: `${folder}/${file}`,
    data: readFileSync(path.join(base, file)),
    mode: file.endsWith('.sh') ? SCRIPT_MODE : FILE_MODE,
  }))
}

/** The kit's zip, from the sources under `root`. It throws, saying what, when something that must not ship would. */
export function buildKit(root: string = REPO_ROOT): Kit {
  const project = readProject(root)
  const members: Member[] = []
  const add = (file: string, data: Uint8Array | string, mode = FILE_MODE) => members.push({ path: file, data: typeof data === 'string' ? bytesOf(data) : data, mode })
  const labs = (file: string) => readFileSync(path.join(root, 'labs', file))

  // The grader: the project, and the package that the wheel carries, byte for byte.
  const graderRoot = path.join(root, GRADER)
  for (const file of ['pyproject.toml', 'uv.lock', 'README.md']) add(`grader/${file}`, readFileSync(path.join(graderRoot, file)))
  const source = path.join(graderRoot, 'src')
  for (const file of filesUnder(source, inPackage)) add(`grader/src/${file}`, readFileSync(path.join(source, file)))
  const graderSourceSha256 = sourceSha256(packageFiles(root))

  // The environments: every folder of labs/envs that is a project.
  const envsRoot = path.join(root, 'labs/envs')
  const envs = readdirSync(envsRoot).filter((name) => existsSync(path.join(envsRoot, name, 'pyproject.toml'))).sort()
  if (envs.length === 0) throw new Error('labs/envs holds no environment')
  add('envs/README.md', labs('envs/README.md'))
  for (const env of envs) {
    for (const file of ['pyproject.toml', 'uv.lock', 'requirements.txt', 'Dockerfile']) {
      if (!existsSync(path.join(envsRoot, env, file))) throw new Error(`labs/envs/${env}/${file} is missing: an environment ships all four`)
      add(`envs/${env}/${file}`, labs(`envs/${env}/${file}`))
    }
  }

  add('references/manifest.json', labs('references/manifest.json'))
  add('references/README.md', labs('references/README.md'))
  add('course.lock.json', readFileSync(path.join(root, 'course.lock.json')))
  members.push(...wholeFolder(root, 'gpu'), ...wholeFolder(root, 'runners'))

  const optional = [
    members.some((member) => member.path.startsWith('gpu/')) ? '| `gpu/` | one folder for each GPU lab: its `LAB.md`, its `lab.toml` and its starter code |' : '',
    members.some((member) => member.path.startsWith('runners/')) ? '| `runners/` | the copy-and-paste sessions for rented GPUs |' : '',
  ].filter((row) => row !== '')
  add(
    'README.md',
    fill(
      readFileSync(path.join(root, 'labs/kit/README.template.md'), 'utf8'),
      { VERSION: project.version, SOURCE_HASH: graderSourceSha256, OPTIONAL_ROWS: optional.join('\n') },
      'labs/kit/README.template.md',
    ).replace(/\n\n\n+/g, '\n\n'),
  )

  members.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
  const stray = members.filter((member) => PRIVATE.test(member.path))
  if (stray.length > 0) throw new Error(`${stray.map((member) => member.path).join(', ')} must not ship (the solution, the bestiary and build output stay in the repository)`)
  const entries: ZipEntry[] = members.map((member) => ({ name: `${KIT_ROOT}/${member.path}`, data: member.data, mode: member.mode }))
  return { name: kitName(project.version), version: project.version, graderSourceSha256, members, zip: writeZip(entries) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The manifest entries and the list of published graders                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const memberList = (members: readonly Member[]) => members.map((member) => ({ path: member.path, bytes: member.data.length, sha256: sha256(member.data) }))

export function wheelEntry(wheel: Wheel): ManifestFile {
  return { name: wheel.name, kind: WHEEL_KIND, version: wheel.version, sourceSha256: wheel.sourceSha256, bytes: wheel.zip.length, sha256: sha256(wheel.zip), members: memberList(wheel.members) }
}

export function kitEntry(kit: Kit): ManifestFile {
  return { name: kit.name, kind: KIT_KIND, version: kit.version, graderSourceSha256: kit.graderSourceSha256, bytes: kit.zip.length, sha256: sha256(kit.zip), root: KIT_ROOT, members: memberList(kit.members) }
}

export interface PublishedEntry {
  version: string
  sourceSha256: string
}

const LIST_START = 'export const PUBLISHED_GRADERS: readonly PublishedGrader[] = '

/** The list in the text of src/receipts/graders.ts. It throws when the file no longer has the one line it is read by. */
export function parsePublished(source: string): PublishedEntry[] {
  const start = source.indexOf(LIST_START)
  if (start < 0) throw new Error(`${GRADERS_FILE} no longer has "${LIST_START.trim()}"`)
  const body = source.slice(start + LIST_START.length)
  const entries = [...body.matchAll(/\{\s*version:\s*'([^']*)',\s*sourceSha256:\s*'([^']*)'\s*\}/g)].map((match) => ({ version: match[1] as string, sourceSha256: match[2] as string }))
  const opens = (body.match(/\{/g) ?? []).length
  if (opens !== entries.length) throw new Error(`${GRADERS_FILE}: an entry of the list is not \`{ version: '...', sourceSha256: '...' }\``)
  return entries
}

/** `source` with its list replaced by `entries`. */
export function renderPublished(source: string, entries: readonly PublishedEntry[]): string {
  const start = source.indexOf(LIST_START)
  if (start < 0) throw new Error(`${GRADERS_FILE} no longer has "${LIST_START.trim()}"`)
  const lines = entries.map((entry) => `  { version: '${entry.version}', sourceSha256: '${entry.sourceSha256}' },`)
  return `${source.slice(0, start)}${LIST_START}${entries.length === 0 ? '[]' : `[\n${lines.join('\n')}\n]`}\n`
}

/** The list with `current` in it: the entry of that version replaced where it is, or added after the others. */
export function withPublished(list: readonly PublishedEntry[], current: PublishedEntry): PublishedEntry[] {
  return list.some((entry) => entry.version === current.version) ? list.map((entry) => (entry.version === current.version ? current : entry)) : [...list, current]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Packing, and checking what is packed                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Options {
  root?: string
  out?: string
  /** The file that holds PUBLISHED_GRADERS. Only the default output writes it; a run into another folder leaves it alone, unless this says where. */
  gradersFile?: string
}

interface Resolved {
  root: string
  out: string
  gradersFile: string | undefined
}

function resolve(options: Options): Resolved {
  const root = options.root ?? REPO_ROOT
  const gradersFile = options.gradersFile ?? (options.out === undefined ? path.join(root, GRADERS_FILE) : undefined)
  return { root, out: path.resolve(options.out ?? path.join(root, OUT_DIR)), gradersFile }
}

export interface Packed {
  wheel: Wheel
  kit: Kit
}

/** Builds both files and reads them back: the wheel's RECORD against its members, and the kit's zip against its list. Nothing is written. */
export function buildAll(root: string = REPO_ROOT): Packed {
  const wheel = buildWheel(root)
  const kit = buildKit(root)
  if (wheel.version !== kit.version || wheel.sourceSha256 !== kit.graderSourceSha256) throw new Error('the wheel and the kit hold different graders')
  for (const [what, members, zip] of [['the wheel', wheel.members, wheel.zip] as const, ['the kit', kit.members.map((member) => ({ ...member, path: `${KIT_ROOT}/${member.path}` })), kit.zip] as const]) {
    const entries = readZip(zip)
    if (entries.map((entry) => entry.name).join('\n') !== members.map((member) => member.path).join('\n')) throw new Error(`${what} does not list the members it was given`)
    entries.forEach((entry, i) => {
      const member = members[i] as Member
      if (sha256(entry.data) !== sha256(member.data) || entry.mode !== member.mode) throw new Error(`${what}: ${member.path} comes back from the zip changed`)
    })
  }
  return { wheel, kit }
}

const current = (wheel: Wheel): PublishedEntry => ({ version: wheel.version, sourceSha256: wheel.sourceSha256 })

/** Writes the wheel, the kit, the manifest and the list. Entries of other kinds and of other versions are kept. */
export function packKit(options: Options = {}): Packed {
  const { root, out, gradersFile } = resolve(options)
  const packed = buildAll(root)
  const before = readManifest(out)
  const ours = new Set([packed.wheel.name, packed.kit.name])
  const kept = (before?.files ?? []).filter((file) => !ours.has(file.name))
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, packed.wheel.name), packed.wheel.zip)
  writeFileSync(path.join(out, packed.kit.name), packed.kit.zip)
  const entries = [wheelEntry(packed.wheel), kitEntry(packed.kit)]
  // manifestText sorts by name, and keeps the forge labs' entries it is given as kept ones; their kind is not this script's to rewrite.
  writeFileSync(path.join(out, MANIFEST_NAME), manifestText(entries, kept))
  if (gradersFile !== undefined) {
    const source = readFileSync(gradersFile, 'utf8')
    writeFileSync(gradersFile, renderPublished(source, withPublished(parsePublished(source), current(packed.wheel))))
  }
  return packed
}

/** What is wrong with `out` (and the list), as sentences that say what to do. */
export function checkKit(options: Options = {}): string[] {
  const { root, out, gradersFile } = resolve(options)
  const repack = `run \`bun scripts/pack-kit.ts\` and commit ${path.relative(root, out) || '.'}`
  const problems: string[] = []
  const packed = buildAll(root)
  let manifest = null
  try {
    manifest = readManifest(out)
    if (manifest === null) problems.push(`${MANIFEST_NAME} is missing: ${repack}`)
  } catch (e) {
    problems.push(`${e instanceof Error ? e.message : String(e)}: ${repack}`)
  }
  for (const [file, entry] of [
    [packed.wheel, wheelEntry(packed.wheel)],
    [packed.kit, kitEntry(packed.kit)],
  ] as const) {
    const onDisk = path.join(out, file.name)
    if (!existsSync(onDisk)) problems.push(`${file.name} is missing: ${repack}`)
    else if (sha256(readFileSync(onDisk)) !== sha256(file.zip)) problems.push(`${file.name} is stale: a source of the ${entry.kind === WHEEL_KIND ? 'grader' : 'kit'} changed, so ${repack}`)
    if (manifest !== null) {
      const listed = manifest.files.find((candidate) => candidate.name === file.name)
      if (JSON.stringify(listed) !== JSON.stringify(entry)) problems.push(`${MANIFEST_NAME} has ${listed === undefined ? 'no entry' : 'a stale entry'} for ${file.name}: ${repack}`)
    }
  }
  if (gradersFile !== undefined) {
    const listed = parsePublished(readFileSync(gradersFile, 'utf8')).find((entry) => entry.version === packed.wheel.version)
    if (listed === undefined) problems.push(`${GRADERS_FILE} does not list grader ${packed.wheel.version}: ${repack}`)
    else if (listed.sourceSha256 !== packed.wheel.sourceSha256) problems.push(`${GRADERS_FILE} lists ${listed.sourceSha256} for grader ${packed.wheel.version}, and its sources hash to ${packed.wheel.sourceSha256}: ${repack}, or raise the version in ${GRADER}/pyproject.toml`)
  }
  return problems
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command line                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const USAGE = 'usage: bun scripts/pack-kit.ts [--out <dir>] [--check]'

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
      fail(`pack-kit: unknown argument "${argument}"\n${USAGE}`)
      return 2
    }
  }
  const options: Options = out === undefined ? {} : { out }
  try {
    if (check) {
      const problems = checkKit(options)
      for (const problem of problems) fail(`pack-kit: ${problem}`)
      if (problems.length > 0) return 1
      print(`pack-kit: ${out ?? OUT_DIR} is what the sources pack to`)
      return 0
    }
    const { wheel, kit } = packKit(options)
    print(`packed ${wheel.name}: ${wheel.members.length} files, ${wheel.zip.length} bytes, sha256 ${sha256(wheel.zip)}, source sha256 ${wheel.sourceSha256}`)
    print(`packed ${kit.name}: ${kit.members.length} files, ${kit.zip.length} bytes, sha256 ${sha256(kit.zip)}`)
    return 0
  } catch (e) {
    fail(`pack-kit: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
