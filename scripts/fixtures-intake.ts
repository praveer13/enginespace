/*
 * fixtures-intake (W2-T12): takes one of the owner's bundles from a GPU run into tests/fixtures/receipts/.
 *
 *   bun scripts/fixtures-intake.ts <bundle.es.json.gz> [--forbid <word>]... [--name <file>] [--dated YYYY-MM-DD] [--dir <folder>] [--dry]
 *
* It does four things and nothing else, in this order:
 *   1. reads the file as JSON inside gzip;
 *   2. sweeps every string in it (keys and values, and the bytes of each base64 artifact) for what a receipt never holds (ARCHITECTURE section 9.5): a host
 *      name, a user name, an absolute path, a UUID, an IP or MAC address. The names that this computer knows about itself are looked for as they are in
 *      redact.py of the grader, and `--forbid` adds the ones it cannot know: the host name and the user of the machine that made the bundle (the runbook says how
 *      to read them there). A finding stops the intake, and the message says where it was found and never prints the text itself. Then the bundle's schema is applied,
 *      and a file that is not a bundle, or that says it is synthetic, is refused;
 *   3. copies the file, byte for byte, into the folder under its fixture name;
 *   4. appends the entry (file, SHA-256 of the file's bytes, date, stage, GPU name) to manifest.json.
 *
 * A fixture is never edited, so the intake never overwrites a file and never lists one SHA-256 twice. It does not run the browser's rules on the bundle: that is
 * tests/verify/fixtures.test.ts, which runs on the folder once the entry is in.
 *
 * Exit status: 0 when the bundle was taken in (or, with --dry, would be), 1 when it was refused, 2 for a usage error.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { bundleSchema } from '../packages/schema/bundle'

export const FIXTURES_DIR = path.join(import.meta.dirname, '..', 'tests', 'fixtures', 'receipts')

const SCHEMA = 'enginespace/receipt-fixtures@1'

/** Shorter literals are only recognised as a whole value, never inside other text: a user called `ann` is not worth refusing "channel" for (redact.py's rule). */
const MIN_LITERAL_CHARS = 4

/** Names of accounts and hosts that identify nobody: a container's user, a cloud image. Taken from redact.py. */
const COMMON_NAMES = new Set(['root', 'runner', 'user', 'ubuntu', 'localhost', 'docker', 'default', 'nobody', 'admin', 'ec2-user', 'colab', 'vscode', 'jovyan'])

const UUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/
const PATH_UNIX = /(?<![\w.:/-])\/(?:home|Users|root|tmp|var|opt|etc|usr|mnt|media|data|workspace|workspaces|srv|run|proc|sys|dev|nix|runpod-volume|app|scratch)\/[^\s"'<>]+/
const PATH_WINDOWS = /(?<![\w])[A-Za-z]:\\[^\s"'<>]+/
const PATH_HOME = /(?<![\w])~\/[^\s"'<>]+/
const IPV4 = /(?<![\w.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\w.])/
const MAC = /(?<![0-9A-Fa-f:])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:])/
/** A name with a domain that only a machine on a network has. */
const HOST_NAME = /(?<![\w.-])[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)*\.(?:local|lan|internal|localdomain|home|corp|compute\.amazonaws\.com|compute\.internal)(?![\w-])/i

const SHAPES: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'a UUID', pattern: UUID },
  { kind: 'an absolute path', pattern: PATH_UNIX },
  { kind: 'an absolute path', pattern: PATH_WINDOWS },
  { kind: 'a path under a home folder', pattern: PATH_HOME },
  { kind: 'an IP address', pattern: IPV4 },
  { kind: 'a MAC address', pattern: MAC },
  { kind: 'a host name', pattern: HOST_NAME },
]

export interface Finding {
  /** Where: a JSON Pointer into the bundle, with `(decoded)` after the pointer of a base64 artifact. */
  readonly at: string
  /** What: `a host name`, `a user name`, `an absolute path` and so on. Never the text itself. */
  readonly kind: string
}

/** The names this computer knows about itself, and the words that the caller names, in the order they are looked for. */
export function literalsOf(forbid: readonly string[], machine: { host?: string; user?: string; home?: string } = defaultMachine()): { kind: string; value: string }[] {
  const out: { kind: string; value: string }[] = []
  const add = (kind: string, value: string | undefined): void => {
    const text = value?.trim()
    if (text !== undefined && text.length > 0 && !COMMON_NAMES.has(text.toLowerCase())) out.push({ kind, value: text })
  }
  add('a host name', machine.host)
  add('a host name', machine.host?.split('.')[0])
  add('a user name', machine.user)
  add('a path under a home folder', machine.home && machine.home.length > 1 ? machine.home : undefined)
  for (const word of forbid) add('a name that --forbid lists', word)
  return out
}

function defaultMachine(): { host?: string; user?: string; home?: string } {
  let user: string | undefined
  try {
    user = os.userInfo().username
  } catch {
    user = process.env.USER
  }
  return { host: os.hostname(), user, home: os.homedir() }
}

/** Whether `needle` is in `text`: anywhere when it is long enough, and as a whole value only when it is short. */
function holds(text: string, needle: string): boolean {
  const lowered = text.toLowerCase()
  const word = needle.toLowerCase()
  if (word.length >= MIN_LITERAL_CHARS) return lowered.includes(word)
  return lowered === word
}

/** What one piece of text holds that a receipt must not, as kinds. */
export function sweepText(text: string, literals: readonly { kind: string; value: string }[]): string[] {
  const kinds: string[] = []
  for (const { kind, value } of literals) if (holds(text, value) && !kinds.includes(kind)) kinds.push(kind)
  for (const { kind, pattern } of SHAPES) if (pattern.test(text) && !kinds.includes(kind)) kinds.push(kind)
  return kinds
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function walk(value: unknown, at: string, visit: (text: string, at: string) => void): void {
  if (typeof value === 'string') visit(value, at)
  else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${at}/${i}`, visit))
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      visit(key, `${at}/${key}`)
      walk(item, `${at}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, visit)
    }
  }
}

/** Every finding in a parsed bundle: its strings, its keys, and what each base64 artifact decodes to (read as Latin-1, so that any byte is a character). */
export function sweepBundle(document: unknown, literals: readonly { kind: string; value: string }[]): Finding[] {
  const found: Finding[] = []
  const note = (text: string, at: string): void => {
    for (const kind of sweepText(text, literals)) found.push({ at, kind })
  }
  walk(document, '', note)
  const artifacts = (document as { artifacts?: Record<string, { encoding?: string; data?: unknown }> }).artifacts
  for (const [id, artifact] of Object.entries(artifacts ?? {})) {
    if (artifact.encoding === 'base64' && typeof artifact.data === 'string' && BASE64.test(artifact.data)) {
      note(Buffer.from(artifact.data, 'base64').toString('latin1'), `/artifacts/${id}/data (decoded)`)
    }
  }
  return found
}

export interface ManifestEntry {
  file: string
  sha256: string
  dated: string
  stage: string
  gpu: string
}

interface Manifest {
  schema: string
  fixtures: ManifestEntry[]
}

export class Refused extends Error {}

function readManifestFile(dir: string): Manifest {
  const file = path.join(dir, 'manifest.json')
  if (!existsSync(file)) return { schema: SCHEMA, fixtures: [] }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Manifest>
  if (parsed.schema !== SCHEMA || !Array.isArray(parsed.fixtures)) throw new Refused(`${file} is not a receipt-fixtures manifest`)
  return parsed as Manifest
}

/** `tr8.replay.s2` and `NVIDIA GeForce RTX 4090` give `tr8-replay-s2-rtx-4090.es.json.gz`. */
export function fixtureName(stage: string, gpu: string): string {
  const words = gpu
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '' && word !== 'nvidia' && word !== 'geforce')
  return `${stage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${words.join('-')}.es.json.gz`
}

export interface Options {
  readonly forbid?: readonly string[]
  readonly name?: string
  readonly dated?: string
  readonly dir?: string
  readonly dry?: boolean
  /** The names of the computer running the intake. Tests give invented ones. */
  readonly machine?: { host?: string; user?: string; home?: string }
}

export interface Taken {
  readonly entry: ManifestEntry
  readonly written: boolean
}

/** Takes the bundle at `source` in. Throws `Refused`, with the reason as one sentence per line, when it must not go in. */
export function intake(source: string, options: Options = {}): Taken {
  const dir = options.dir ?? FIXTURES_DIR
  const bytes = readFileSync(source)
  let text: string
  try {
    text = gunzipSync(bytes).toString('utf8')
  } catch {
    throw new Refused('the file is not gzip: a bundle is what `enginespace grade` wrote, a .es.json.gz')
  }
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Refused('the file is gzip and its text is not JSON')
  }
  const findings = sweepBundle(document, literalsOf(options.forbid ?? [], options.machine))
  if (findings.length > 0) {
    const shown = findings.slice(0, 10).map((finding) => `  ${finding.kind} at ${finding.at || '/'}`)
    const more = findings.length > shown.length ? [`  and ${findings.length - shown.length} more`] : []
    throw new Refused(['the bundle holds what a receipt never holds, so it is not taken in:', ...shown, ...more].join('\n'))
  }

  const parsed = bundleSchema.safeParse(document)
  if (!parsed.success) throw new Refused(`the file is not a bundle of enginespace/bundle@1: ${parsed.error.issues[0]?.message ?? 'schema'} at /${parsed.error.issues[0]?.path.join('/') ?? ''}`)
  const { receipt } = parsed.data
  if (/^\s*synthetic\b/i.test(receipt.notes ?? '')) throw new Refused('the bundle says it is synthetic, and a synthetic bundle never goes under tests/fixtures/receipts/')

  const gpu = receipt.environment.gpus[0]?.name
  if (gpu === undefined) throw new Refused('the bundle lists no GPU: a fixture is a receipt from a GPU run')
  const dated = options.dated ?? receipt.createdAt.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dated)) throw new Refused('the date is not YYYY-MM-DD')
  const file = options.name ?? fixtureName(receipt.stage, gpu)
  if (!/^[a-z0-9][a-z0-9._-]*\.es\.json\.gz$/.test(file)) throw new Refused(`"${file}" is not a bundle's file name (lower-case letters, digits, dots, dashes and underscores, ending .es.json.gz)`)
  const entry: ManifestEntry = { file, sha256: createHash('sha256').update(bytes).digest('hex'), dated, stage: receipt.stage, gpu }

  const manifest = readManifestFile(dir)
  const same = manifest.fixtures.find((other) => other.sha256 === entry.sha256)
  if (same) throw new Refused(`this exact file is already a fixture (${same.file})`)
  if (manifest.fixtures.some((other) => other.file === file) || existsSync(path.join(dir, file))) {
    throw new Refused(`${file} exists, and a fixture is never edited: a bundle that changed is another fixture, so give it another name with --name`)
  }
  if (options.dry) return { entry, written: false }
  copyFileSync(source, path.join(dir, file))
  manifest.fixtures.push(entry)
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return { entry, written: true }
}

const USAGE = 'usage: bun scripts/fixtures-intake.ts <bundle.es.json.gz> [--forbid <word>]... [--name <file>] [--dated YYYY-MM-DD] [--dir <folder>] [--dry]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[], print: (line: string) => void = console.log, fail: (line: string) => void = console.error): number {
  const forbid: string[] = []
  const options: { name?: string; dated?: string; dir?: string; dry?: boolean } = {}
  const files: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i] as string
    const value = (): string | undefined => argv[++i]
    if (argument === '--dry') options.dry = true
    else if (argument === '--forbid') {
      const word = value()
      if (word === undefined) return usage(fail)
      forbid.push(word)
    } else if (argument === '--name' || argument === '--dated' || argument === '--dir') {
      const given = value()
      if (given === undefined) return usage(fail)
      options[argument.slice(2) as 'name' | 'dated' | 'dir'] = given
    } else if (argument.startsWith('--')) return usage(fail, `unknown argument "${argument}"`)
    else files.push(argument)
  }
  if (files.length !== 1) return usage(fail)
  try {
    const { entry, written } = intake(files[0] as string, { ...options, forbid })
    print(`${written ? 'took in' : 'would take in'} ${entry.file}: stage ${entry.stage}, ${entry.gpu}, dated ${entry.dated}, sha256 ${entry.sha256}`)
    if (written) print('next: bun test tests/verify/fixtures.test.ts, which runs the browser\'s rules on it, then commit the file and the manifest')
    return 0
  } catch (e) {
    if (e instanceof Refused) {
      fail(`fixtures-intake: ${e.message}`)
      return 1
    }
    fail(`fixtures-intake: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

function usage(fail: (line: string) => void, why?: string): number {
  fail(why ? `fixtures-intake: ${why}\n${USAGE}` : USAGE)
  return 2
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
