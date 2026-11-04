/*
 * Kernelspace's KC ids at the vendored pin (ARCHITECTURE §4.5, §13; W1-T03): the vocabulary of the `ks:` edges in
 * content/kc/graph.yaml.
 *
 * A KC of this course may require a KC of kernelspace, written `ks:t5.kv-capacity`. Whether that id exists is a fact about another
 * repository, so this one carries a snapshot, content/kc/kernelspace.json: the ids that kernelspace's KC graph holds at the commit
 * that vendor/kernelspace/VENDOR.md pins. `verify:kc` reads the snapshot and needs no checkout of kernelspace. This tool makes the
 * snapshot and checks it.
 *
 *   bun scripts/kc/kernelspace.ts print [--repo <path>] [--commit <sha>] [--root <dir>]
 *       Prints the snapshot for a commit (default: the pin) as the committed file spells it.
 *   bun scripts/kc/kernelspace.ts check [--repo <path>] [--root <dir>]
 *       Fails when the committed snapshot is not the pin's: it says which ids differ. Needs a checkout of kernelspace.
 *
 * To re-pin, vendor first (VENDOR.md, then `bun scripts/vendor-drift.ts diff <sha>`), and then
 * `bun scripts/kc/kernelspace.ts print > content/kc/kernelspace.json`. `verify:kc` fails while the two commits differ.
 *
 * kernelspace is read through `git -C <repo> show <commit>:<file>` and nothing else, which writes nothing there (AGENTS.md, "Sibling
 * repos are read-only"). Its location is found as vendor-drift finds it: --repo, KERNELSPACE_REPO, the sibling checkout.
 *
 * The ids are read from kernelspace's source as syntax, with the TypeScript parser, and no line of it is run. kernelspace writes a KC
 * as an object with an `id`, a `can` and `requires`, in `src/data/kc/{r,t0,...,t7}.ts`, and its `id` is either a string or a name from
 * the `KC` table of `src/data/kc/ids.ts`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Expression, Node, SourceFile } from 'typescript'
import { z } from 'zod'
import { findKernelspace, readVendorMd, UsageError } from '../vendor-drift.ts'

export const SNAPSHOT_FILE = 'content/kc/kernelspace.json'

/** Where kernelspace keeps its KCs, one file for the contract names and one for each track. */
export const KS_KC_DIR = 'src/data/kc'
export const KS_TRACKS = ['r', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'] as const

const SOURCE = `${KS_KC_DIR}/{ids,${KS_TRACKS.join(',')}}.ts, read with git show`

/** kernelspace's KC id pattern (`src/lib/kc/types.ts`): the track, a dot, and words joined by hyphens. */
const KS_ID = /^(?:r|t[0-7])\.[a-z0-9]+(?:-[a-z0-9]+)*$/

/* ------------------------------------------------------------------------------------------------------------------ */
/* The snapshot                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export const snapshotSchema = z
  .strictObject({
    /** The kernelspace commit the ids were read at: the one VENDOR.md pins. */
    commit: z.string().regex(/^[0-9a-f]{40}$/, 'must be a full 40-digit lowercase commit SHA'),
    source: z.string(),
    /** Kernelspace's own spelling, without `ks:`. Sorted, so that a re-pin shows as a clean diff. */
    ids: z.array(z.string().regex(KS_ID, 'must be a kernelspace KC id such as t5.kv-capacity')),
  })
  .superRefine((snapshot, ctx) => {
    snapshot.ids.forEach((id, index) => {
      const before = snapshot.ids[index - 1]
      if (before !== undefined && before >= id) {
        ctx.addIssue({ code: 'custom', message: before === id ? `"${id}" is listed twice` : `"${id}" is out of order: the ids are sorted`, path: ['ids', index] })
      }
    })
  })

export type Snapshot = z.infer<typeof snapshotSchema>

/** The committed file's exact text for a commit and its ids: two-space JSON, one id to a line, and a final newline. */
export const renderSnapshot = (commit: string, ids: readonly string[]): string =>
  `${JSON.stringify({ commit, source: SOURCE, ids: [...ids].sort() } satisfies Snapshot, null, 2)}\n`

/** The snapshot in a file's text, or why it is not one. */
export function parseSnapshot(text: string): { snapshot: Snapshot; problems?: undefined } | { snapshot?: undefined; problems: string[] } {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { problems: [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`] }
  }
  const parsed = snapshotSchema.safeParse(value)
  if (parsed.success) return { snapshot: parsed.data }
  return { problems: parsed.error.issues.map((issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the ids out of kernelspace's source                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The text of a kernelspace file at the commit, or null when the commit has no such file. */
export type Reader = (file: string) => string | null

/** Reads files of a kernelspace checkout at a commit, through `git show` only. */
export function gitReader(repo: string, commit: string): Reader {
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new UsageError(`"${commit}" is not a commit SHA`)
  return (file) => {
    const run = spawnSync('git', ['-C', repo, 'show', `${commit}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 })
    return run.status === 0 ? run.stdout : null
  }
}

/** Every KC id that kernelspace's data files define, sorted, from the text of those files. */
export async function kernelspaceIds(read: Reader): Promise<string[]> {
  const { default: ts } = await import('typescript')
  const parse = (name: string): SourceFile => {
    const file = `${KS_KC_DIR}/${name}.ts`
    const text = read(file)
    if (text === null) throw new Error(`kernelspace has no ${file} at that commit`)
    return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  }

  // ids.ts: `export const KC = { locality: 't0.locality', ... } as const`. The name of a property is what a track file writes.
  const names = new Map<string, string>()
  for (const statement of parse('ids').statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'KC' || declaration.initializer === undefined) continue
      const table = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer
      if (!ts.isObjectLiteralExpression(table)) continue
      for (const property of table.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && ts.isStringLiteralLike(property.initializer)) names.set(property.name.text, property.initializer.text)
      }
    }
  }
  if (names.size === 0) throw new Error(`kernelspace's ${KS_KC_DIR}/ids.ts has no KC table that this tool can read`)

  const ids = new Set<string>()
  for (const track of KS_TRACKS) {
    const source = parse(track)
    const visit = (node: Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const properties = new Map<string, Expression>()
        for (const property of node.properties) {
          if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))) properties.set(property.name.text, property.initializer)
        }
        const id = properties.get('id')
        // A KC is the object that also has a competence statement and prerequisites: no other object in these files does.
        if (id !== undefined && properties.has('can') && properties.has('requires')) {
          const at = `${source.fileName}:${source.getLineAndCharacterOfPosition(id.getStart(source)).line + 1}`
          const value = ts.isStringLiteralLike(id) ? id.text : ts.isPropertyAccessExpression(id) && ts.isIdentifier(id.expression) && id.expression.text === 'KC' ? names.get(id.name.text) : undefined
          if (value === undefined) throw new Error(`${at}: cannot read this KC's id, which is neither a string nor a name of the KC table`)
          if (!KS_ID.test(value)) throw new Error(`${at}: "${value}" is not a kernelspace KC id`)
          ids.add(value)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  if (ids.size === 0) throw new Error('kernelspace has no KC that this tool can read')
  return [...ids].sort()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command line                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const USAGE = 'usage: bun scripts/kc/kernelspace.ts print [--repo <path>] [--commit <sha>] [--root <dir>]\n       bun scripts/kc/kernelspace.ts check [--repo <path>] [--root <dir>]'
const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../..')

export async function main(argv: readonly string[], write: (text: string) => void = (text) => process.stdout.write(text)): Promise<number> {
  const [command, ...rest] = argv
  const flags: { repo?: string; commit?: string; root: string } = { root: DEFAULT_ROOT }
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i] as string
    const value = rest[i + 1]
    if ((flag !== '--repo' && flag !== '--commit' && flag !== '--root') || value === undefined) throw new UsageError(USAGE)
    if (flag === '--root') flags.root = path.resolve(value)
    else flags[flag === '--repo' ? 'repo' : 'commit'] = value
    i += 1
  }
  if (command !== 'print' && command !== 'check') throw new UsageError(USAGE)
  if (command === 'check' && flags.commit !== undefined) throw new UsageError('check reads the commit that VENDOR.md pins, so it takes no --commit')

  const repo = findKernelspace(flags.root, flags.repo)
  if (repo === null) throw new UsageError('no kernelspace checkout found: pass --repo <path> or set KERNELSPACE_REPO')
  const commit = flags.commit ?? readVendorMd(flags.root).pin
  const ids = await kernelspaceIds(gitReader(repo, commit))
  const fresh = renderSnapshot(commit, ids)
  if (command === 'print') {
    write(fresh)
    return 0
  }

  const file = path.join(flags.root, SNAPSHOT_FILE)
  const committed = existsSync(file) ? readFileSync(file, 'utf8') : null
  if (committed === fresh) {
    write(`kernelspace snapshot: ok (${ids.length} ids at ${commit.slice(0, 12)})\n`)
    return 0
  }
  const parsed = committed === null ? undefined : parseSnapshot(committed)
  const had = new Set(parsed?.snapshot?.ids ?? [])
  const lines = [`kernelspace snapshot: ${SNAPSHOT_FILE} is not what kernelspace holds at ${commit.slice(0, 12)}`]
  if (committed === null) lines.push('  the file does not exist')
  else if (parsed?.snapshot === undefined) lines.push(...(parsed?.problems ?? []).map((problem) => `  ${problem}`))
  else {
    if (parsed.snapshot.commit !== commit) lines.push(`  it was read at ${parsed.snapshot.commit.slice(0, 12)}`)
    for (const id of ids.filter((candidate) => !had.has(candidate))) lines.push(`  missing: ${id}`)
    for (const id of [...had].filter((candidate) => !ids.includes(candidate))) lines.push(`  stale: ${id}`)
  }
  lines.push(`  to rewrite it: bun scripts/kc/kernelspace.ts print > ${SNAPSHOT_FILE}`)
  write(`${lines.join('\n')}\n`)
  return 1
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      if (!(error instanceof UsageError) && !(error instanceof Error)) throw error
      console.error(`kernelspace: ${error.message}`)
      process.exitCode = error instanceof UsageError ? 2 : 1
    },
  )
}
