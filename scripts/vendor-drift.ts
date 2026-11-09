/*
 * vendor-drift: keeps vendor/kernelspace/ honest (ARCHITECTURE section 13, D-031).
 *
 * The vendored set is the manifest in vendor/kernelspace/VENDOR.md. Each row names a file by its path in kernelspace,
 * and the file sits at the same path under vendor/kernelspace/. Nothing there is edited in place: enginespace's changes
 * live in wrappers outside vendor/, and the type shims in vendor/kernelspace/shims/ are the only files, besides
 * VENDOR.md and .gitattributes, that are not copies. VENDOR.md also lists files that are referenced and not copied.
 *
 *   bun scripts/vendor-drift.ts verify [--root <dir>]
 *       Offline. Re-hashes every manifest row, and fails when a file is missing, differs from its recorded SHA-256 or
 *       has an executable bit, when a row has no licence, when a file is present but not listed, when a symlink is
 *       present, when a shim is missing, or when a file is named AGENTS.md or CLAUDE.md (an agent working beside such a
 *       file would be bound by it). Exit 0 when clean, 1 when not.
 *
 *   bun scripts/vendor-drift.ts diff <sha> [--repo <path>] [--root <dir>] [--no-diff]
 *       Compares the vendored and the referenced files with kernelspace at <sha>, which is read through
 *       `git -C <repo> show` and nothing else, and prints a Markdown report: each file's status, the unified diff of
 *       each changed file, and whether each type shim still restates the declarations it copies. Exit 0 when nothing
 *       drifted, 1 when something did. Re-vendoring is a reviewed change, and the report ends with the commands that
 *       apply it.
 *
 * kernelspace's location is not written down anywhere. `diff` takes --repo, then KERNELSPACE_REPO, then the sibling
 * checkout `../kernelspace` of this repository (or of the main checkout, when this is a git worktree).
 * --root runs the tool on another checkout of this repository; the tests use it.
 * Exit codes: 0 clean, 1 drift or a failed check, 2 usage or an environment problem.
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** A problem with how the tool was run or what it was given, as opposed to drift in the vendored files. */
export class UsageError extends Error {}

const MANIFEST = ['<!-- vendor-manifest:begin -->', '<!-- vendor-manifest:end -->'] as const
const REFERENCES = ['<!-- vendor-references:begin -->', '<!-- vendor-references:end -->'] as const
const SHIMS = ['<!-- vendor-shims:begin -->', '<!-- vendor-shims:end -->'] as const

/** A report shows at most this many lines of any one file's diff. */
const MAX_DIFF_LINES = 200

/** A file of kernelspace's, named by its path there. A copied one also sits at that path under vendor/kernelspace/. */
export interface Row {
  path: string
  module: string
  sha256: string
  licence: string
  note: string
}

/** A file that is cited and not copied: its hash is recorded, and `diff` watches it. */
export interface Reference {
  path: string
  sha256: string
  taken: string
}

export interface ShimRow {
  /** The shim, relative to vendor/kernelspace/. */
  shim: string
  /** The kernelspace file whose declarations the shim copies. */
  restates: string
  declarations: string[]
}

export interface VendorMd {
  pin: string
  rows: Row[]
  references: Reference[]
  shims: ShimRow[]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* VENDOR.md                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const vendorDir = (root: string) => path.join(root, 'vendor', 'kernelspace')
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const unTick = (cell: string) => cell.trim().replace(/^`+|`+$/g, '')
const isPlainPath = (rel: string) => rel !== '' && path.posix.normalize(rel) === rel && !rel.startsWith('/') && !rel.startsWith('../')

/** The text between a pair of markers. A missing marker is an error, not an empty table. */
function between(text: string, [begin, end]: readonly [string, string]): string {
  const from = text.indexOf(begin)
  const to = text.indexOf(end)
  if (from < 0 || to < from) throw new UsageError(`VENDOR.md has no ${begin} ... ${end} block`)
  return text.slice(from + begin.length, to)
}

/** A markdown table as one record per row, keyed by its header cells. */
function records(table: string): Record<string, string>[] {
  const lines = table.split('\n').filter((line) => line.startsWith('|'))
  const cells = (line: string) =>
    line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
  const header = cells(lines[0] ?? '')
  return lines.slice(2).map((line) => Object.fromEntries(cells(line).map((cell, i) => [header[i] ?? `column ${i}`, cell])))
}

export function readVendorMd(root: string): VendorMd {
  const file = path.join(vendorDir(root), 'VENDOR.md')
  if (!existsSync(file)) throw new UsageError('vendor/kernelspace/VENDOR.md does not exist')
  const text = readFileSync(file, 'utf8')
  const pin = /^\|\s*Pinned commit\s*\|\s*`([0-9a-f]{40})`\s*\|/m.exec(text)?.[1]
  if (!pin) throw new UsageError('VENDOR.md has no "| Pinned commit | `<40 hex digits>` |" row')
  return {
    pin,
    rows: records(between(text, MANIFEST)).map((r) => ({
      path: unTick(r['Path'] ?? ''),
      module: r['Module'] ?? '',
      sha256: unTick(r['SHA-256'] ?? ''),
      licence: r['Licence'] ?? '',
      note: r['Note'] ?? '',
    })),
    references: records(between(text, REFERENCES)).map((r) => ({ path: unTick(r['Path'] ?? ''), sha256: unTick(r['SHA-256'] ?? ''), taken: r['Taken from it'] ?? '' })),
    shims: records(between(text, SHIMS)).map((r) => ({
      shim: unTick(r['Shim'] ?? ''),
      restates: unTick(r['Restates'] ?? ''),
      declarations: (r['Declarations'] ?? '').split(',').map(unTick).filter(Boolean),
    })),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* verify                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Every file under `dir`, as a posix path relative to it. Symlinks are listed and never followed. */
function walk(dir: string, base = dir, out: { rel: string; symlink: boolean }[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(base, full).split(path.sep).join('/')
    if (entry.isSymbolicLink()) out.push({ rel, symlink: true })
    else if (entry.isDirectory()) walk(full, base, out)
    else out.push({ rel, symlink: false })
  }
  return out
}

/** The files in vendor/kernelspace/ that are not copies of kernelspace's: the manifest's own page, and the shims. */
const isOwn = (rel: string) => rel === 'VENDOR.md' || rel === '.gitattributes' || rel.startsWith('shims/')

export function verify(root: string): { problems: string[]; files: number; pin: string } {
  const vm = readVendorMd(root)
  const dir = vendorDir(root)
  const problems: string[] = []
  const listed = new Set<string>()
  for (const row of vm.rows) {
    if (listed.has(row.path)) problems.push(`${row.path}: listed twice`)
    listed.add(row.path)
    if (!isPlainPath(row.path)) {
      problems.push(`${row.path}: not a plain relative path`)
      continue
    }
    if (!/^[0-9a-f]{64}$/.test(row.sha256)) problems.push(`${row.path}: VENDOR.md records no SHA-256`)
    if (row.licence === '') problems.push(`${row.path}: VENDOR.md records no licence`)
    const file = path.join(dir, row.path)
    const stat = lstatSync(file, { throwIfNoEntry: false })
    if (stat === undefined) {
      problems.push(`${row.path}: listed but missing`)
      continue
    }
    if (!stat.isFile()) {
      if (!stat.isSymbolicLink()) problems.push(`${row.path}: listed as a file and is not one`) // a symlink is reported below, with the others
      continue
    }
    const actual = sha256(readFileSync(file))
    if (actual !== row.sha256) problems.push(`${row.path}: SHA-256 is ${actual} and VENDOR.md records ${row.sha256} (vendored files are never edited in place)`)
    if ((stat.mode & 0o111) !== 0) problems.push(`${row.path}: has an executable bit, and every file in the set is mode 644 upstream`)
  }
  for (const ref of vm.references) {
    if (!/^[0-9a-f]{64}$/.test(ref.sha256) || !isPlainPath(ref.path)) problems.push(`${ref.path}: a reference needs a plain relative path and a SHA-256`)
    if (listed.has(ref.path)) problems.push(`${ref.path}: both copied and referenced`)
  }
  for (const shim of vm.shims) {
    if (!isPlainPath(shim.shim) || !shim.shim.startsWith('shims/') || !existsSync(path.join(dir, shim.shim))) problems.push(`${shim.shim}: a shim row needs a file under shims/`)
    if (!isPlainPath(shim.restates) || shim.declarations.length === 0) problems.push(`${shim.shim}: a shim row needs the kernelspace file and the declarations it restates`)
  }
  for (const { rel, symlink } of walk(dir)) {
    if (symlink) problems.push(`${rel}: a symlink, and the set holds plain files only`)
    else if (!isOwn(rel) && !listed.has(rel)) problems.push(`${rel}: present but not listed in VENDOR.md`)
    const name = rel.split('/').pop()
    if (name === 'AGENTS.md' || name === 'CLAUDE.md') problems.push(`${rel}: a file named ${name} would bind the agents that work beside it`)
  }
  return { problems, files: vm.rows.length, pin: vm.pin }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading kernelspace                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The only git subcommand this tool runs inside kernelspace: nothing here can write to it (ARCHITECTURE section 13). */
function show(repo: string, args: string[]): Buffer | null {
  const run = spawnSync('git', ['-C', repo, 'show', ...args], { maxBuffer: 1 << 28 })
  return run.status === 0 ? run.stdout : null
}

/** An explicit location must exist. Without one, the first of these that does: KERNELSPACE_REPO, a sibling checkout. */
export function findKernelspace(root: string, explicit?: string): string | null {
  const given = explicit ?? process.env['KERNELSPACE_REPO']
  if (given) return existsSync(given) ? path.resolve(given) : null
  const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' })
  const main = common.status === 0 ? path.dirname(common.stdout.trim()) : root
  return [root, main].map((checkout) => path.resolve(checkout, '..', 'kernelspace')).find((candidate) => existsSync(candidate)) ?? null
}

/** The source text of each named top-level type or interface, without its doc comment. */
async function declarations(file: string, source: string, names: readonly string[]): Promise<Map<string, string>> {
  const { default: ts } = await import('typescript')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const found = new Map<string, string>()
  for (const node of sourceFile.statements) {
    if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && names.includes(node.name.text)) found.set(node.name.text, node.getText(sourceFile))
  }
  return found
}

/** A unified diff of two byte strings, from git's own differ, on temporary copies (not inside kernelspace). */
function unifiedDiff(rel: string, before: Uint8Array, after: Uint8Array): string[] {
  const scratch = mkdtempSync(path.join(tmpdir(), 'vendor-drift-'))
  try {
    for (const [side, bytes] of [['a', before], ['b', after]] as const) {
      mkdirSync(path.dirname(path.join(scratch, side, rel)), { recursive: true })
      writeFileSync(path.join(scratch, side, rel), bytes)
    }
    const run = spawnSync('git', ['diff', '--no-index', '--no-prefix', '--no-color', '--no-ext-diff', '--no-textconv', '--unified=3', `a/${rel}`, `b/${rel}`], { cwd: scratch, encoding: 'utf8', maxBuffer: 1 << 28 })
    const patch = run.stdout.trimEnd().split('\n')
    const shown = patch.slice(0, MAX_DIFF_LINES).map((line) => (line.length > 400 ? `${line.slice(0, 400)} ... (line cut)` : line))
    return patch.length > MAX_DIFF_LINES ? [...shown, `... ${patch.length - MAX_DIFF_LINES} more lines`] : shown
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* diff                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export async function diff(root: string, repo: string, ref: string, options: { diff?: boolean } = {}): Promise<{ report: string; drifted: boolean }> {
  if (!/^[0-9a-f]{7,40}$/.test(ref)) throw new UsageError(`"${ref}" is not a commit SHA (7 to 40 lowercase hex digits)`)
  const vm = readVendorMd(root)
  const paths = [...vm.rows.map((r) => r.path), ...vm.references.map((r) => r.path), ...vm.shims.flatMap((s) => [s.shim, s.restates])]
  const unsafe = paths.find((rel) => !isPlainPath(rel))
  if (unsafe !== undefined) throw new UsageError(`VENDOR.md names "${unsafe}", which is not a plain relative path`)
  const head = show(repo, ['-s', '--format=%H%n%cI', `${ref}^{commit}`])
  if (head === null) throw new UsageError(`${repo} has no commit ${ref}`)
  const [sha = '', date = ''] = head.toString('utf8').trim().split('\n')

  const dir = vendorDir(root)
  const entries = [
    ...vm.rows.map((row) => ({ path: row.path, recorded: row.sha256, copied: true, note: '' })),
    ...vm.references.map((reference) => ({ path: reference.path, recorded: reference.sha256, copied: false, note: reference.taken })),
  ]
  const changed: { path: string; recorded: string; copied: boolean; note: string; upstream: Buffer }[] = []
  const missing: typeof entries = []
  for (const entry of entries) {
    const upstream = show(repo, [`${sha}:${entry.path}`])
    if (upstream === null) missing.push(entry)
    else if (sha256(upstream) !== entry.recorded) changed.push({ ...entry, upstream })
  }

  const count = (copied: boolean) => `${changed.filter((e) => e.copied === copied).length} changed, ${missing.filter((e) => e.copied === copied).length} missing`
  const lines = [`# Vendor drift: ${vm.pin.slice(0, 12)} to ${sha.slice(0, 12)}`, '', `Pinned commit ${vm.pin}; compared with ${sha} (committed ${date}).`, '']
  lines.push('| Files | Result |', '|---|---|', `| copied (${vm.rows.length}) | ${count(true)} |`, `| referenced (${vm.references.length}) | ${count(false)} |`, '')
  for (const entry of changed) {
    lines.push(`## changed${entry.copied ? '' : ' (referenced, not copied)'}: \`${entry.path}\``, '', `Recorded \`${entry.recorded}\`, upstream \`${sha256(entry.upstream)}\`.`, '')
    if (!entry.copied) lines.push(`Taken from it: ${entry.note}. Extract it again.`, '')
    // A copied file's "before" is the vendored file. A referenced one is not here, so its "before" is the pinned commit's.
    const before = entry.copied ? (existsSync(path.join(dir, entry.path)) ? readFileSync(path.join(dir, entry.path)) : Buffer.alloc(0)) : show(repo, [`${vm.pin}:${entry.path}`])
    if (options.diff !== false && before !== null) lines.push('```diff', ...unifiedDiff(entry.path, before, entry.upstream), '```', '')
  }
  for (const entry of missing) lines.push(`## missing: \`${entry.path}\``, '', 'The file is not in the new tree (deleted, or moved). Edit its row in VENDOR.md before updating.', '')

  const stale: string[] = []
  const shimLines = ['| Shim | Declaration | Upstream at the new commit |', '|---|---|---|']
  for (const shim of vm.shims) {
    const source = show(repo, [`${sha}:${shim.restates}`])
    const ours = await declarations(shim.shim, existsSync(path.join(dir, shim.shim)) ? readFileSync(path.join(dir, shim.shim), 'utf8') : '', shim.declarations)
    const theirs = source === null ? new Map<string, string>() : await declarations(shim.restates, source.toString('utf8'), shim.declarations)
    for (const name of shim.declarations) {
      const status = source === null ? 'file missing' : !theirs.has(name) ? 'declaration missing' : theirs.get(name) === ours.get(name) ? 'same' : 'differs'
      if (status !== 'same') stale.push(`${shim.shim}: ${name}`)
      shimLines.push(`| \`${shim.shim}\` | \`${name}\` | ${status} |`)
    }
  }
  lines.push('## Type shims', '', ...(vm.shims.length === 0 ? ['None.'] : shimLines), '')
  if (stale.length > 0) lines.push(`Review and update: ${stale.join('; ')}.`, '')

  const copied = changed.filter((entry) => entry.copied)
  if (copied.length > 0) {
    lines.push('## To apply', '', 'Re-vendoring is a reviewed change. Copy the changed files, then set the pinned commit, its date and each hash in VENDOR.md in the same commit, and run `bun test tests/vendor`:', '', '```sh')
    for (const entry of copied) lines.push(`git -C <kernelspace> show ${sha}:${entry.path} > vendor/kernelspace/${entry.path}`)
    lines.push('```', '', '| Path | New SHA-256 |', '|---|---|', ...copied.map((entry) => `| \`${entry.path}\` | \`${sha256(entry.upstream)}\` |`), '')
  }
  return { report: lines.join('\n'), drifted: changed.length + missing.length + stale.length > 0 }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command line                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const USAGE = 'usage: bun scripts/vendor-drift.ts verify [--root <dir>]\n       bun scripts/vendor-drift.ts diff <sha> [--repo <path>] [--root <dir>] [--no-diff]'

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  const flags = { repo: undefined as string | undefined, root: path.resolve(HERE, '..'), diff: true }
  const positional: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string
    const value = () => {
      const next = rest[++i]
      if (next === undefined) throw new UsageError(`${arg} needs a value`)
      return next
    }
    if (arg === '--repo') flags.repo = value()
    else if (arg === '--root') flags.root = path.resolve(value())
    else if (arg === '--no-diff') flags.diff = false
    else if (arg.startsWith('--')) throw new UsageError(`unknown argument ${arg}`)
    else positional.push(arg)
  }
  if (command === 'verify' && positional.length === 0) {
    const { problems, files, pin } = verify(flags.root)
    if (problems.length > 0) {
      console.log(`vendor-drift: FAIL (${problems.length})`)
      for (const problem of problems) console.log(`  ${problem}`)
      return 1
    }
    console.log(`vendor-drift: ok (${files} files match VENDOR.md at ${pin.slice(0, 12)})`)
    return 0
  }
  if (command === 'diff' && positional.length === 1) {
    const repo = findKernelspace(flags.root, flags.repo)
    const asked = flags.repo ?? process.env['KERNELSPACE_REPO']
    if (repo === null) throw new UsageError(asked ? `${asked} does not exist` : 'no kernelspace checkout found: pass --repo <path> or set KERNELSPACE_REPO')
    const { report, drifted } = await diff(flags.root, repo, positional[0] as string, { diff: flags.diff })
    console.log(report)
    return drifted ? 1 : 0
  }
  throw new UsageError(USAGE)
}

// import.meta.main, not a comparison of URLs: a checkout reached through a symlink must never turn this gate into a no-op.
if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      if (!(error instanceof UsageError)) throw error
      console.error(`vendor-drift: ${error.message}`)
      process.exitCode = 2
    },
  )
}
