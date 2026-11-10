/*
 * export-schemas: writes everything under schemas/ from the code that is its source (D-030, ARCHITECTURE §9.6 and §9.8).
 *
 *   schemas/<name>.schema.json   the zod schemas of packages/schema that the grader validates against, as JSON Schema 2020-12:
 *                                receipt@1, bundle@1, the challenge and trace@1 (W2-T01)
 *   labs/grader/src/enginespace_grader/schemas/<name>.schema.json
 *                                the same four files, byte for byte, inside the grader's package (W2-T02). The grader is installed by itself, as a
 *                                wheel or from the kit, with no schemas/ folder beside it, so it carries the copy that it validates with. Nobody
 *                                edits a copy: this script writes it, and `verify:schema` fails on one that differs.
 *   schemas/vectors/<name>.json  the cross-language vectors that the grader's tests read: rng, subseed, challenge, canonical, sha256
 *
 *   bun scripts/export-schemas.ts [--root <dir>]            write both
 *   bun scripts/export-schemas.ts --check [--root <dir>]    exit 1, naming each file, when a committed file is not what the code writes
 *
 * `verify:schema` and `verify:vectors` are the two halves of --check (scripts/verify-schema.ts and scripts/verify-vectors.ts). The export
 * is deterministic: the same schemas give the same bytes, with the keys in the order zod writes them, two spaces of indent and a final
 * newline, so a diff of schemas/ is a diff of the schemas.
 *
 * Two changes are made to what `z.toJSONSchema` writes, and both are for the reader in Python:
 *   - A pattern that ends in `$` ends in `(?![\s\S])` instead. Python's `re` lets `$` match before a final newline, and `jsonschema`
 *     searches with it, so `^[0-9a-f]{64}$` would take a hash with a line feed after it. ECMAScript's `$` does not, and `(?![\s\S])` is
 *     "no character follows" in both. For ECMAScript the two patterns mean the same, and tests/schema/export-schemas.test.ts holds that.
 *   - A `$comment` says that the file is written by this script from packages/schema.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ZodType } from 'zod'
import { bundleSchema } from '../packages/schema/bundle.ts'
import { challengeSchema } from '../packages/schema/challenge.ts'
import { receiptSchema } from '../packages/schema/receipt.ts'
import { traceSchema } from '../packages/schema/trace.ts'
import { z } from '../packages/schema/zod.ts'
import { numberProblems } from './schemas/format.ts'
import { renderVectors } from './schemas/vectors.ts'
import type { Rendered } from './schemas/vectors.ts'

export type { Rendered }

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..')

export interface SchemaExport {
  /** Repository-relative path of the JSON Schema. */
  readonly file: string
  readonly schema: ZodType
  /** The packages/schema file that is its source, for the `$comment`. */
  readonly source: string
}

/** The schemas that the grader validates against, in the order A§9.6 names them. Adding a schema is adding a row. */
export const SCHEMA_EXPORTS: readonly SchemaExport[] = [
  { file: 'schemas/receipt.schema.json', schema: receiptSchema, source: 'packages/schema/receipt.ts' },
  { file: 'schemas/bundle.schema.json', schema: bundleSchema, source: 'packages/schema/bundle.ts' },
  { file: 'schemas/challenge.schema.json', schema: challengeSchema, source: 'packages/schema/challenge.ts' },
  { file: 'schemas/trace.schema.json', schema: traceSchema, source: 'packages/schema/trace.ts' },
]

/** Where the grader's package keeps its copy of each schema: the folder of its package data (labs/grader/pyproject.toml, W2-T02). */
export const GRADER_SCHEMAS_DIR = 'labs/grader/src/enginespace_grader/schemas'

/** "No character follows", which Python and ECMAScript read the same way. */
export const END_OF_TEXT = '(?![\\s\\S])'

/** Every `pattern` of the document with its closing `$` replaced by the end-of-text test, in place. */
function anchorPatterns(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) anchorPatterns(item)
  } else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>
    for (const [key, value] of Object.entries(record)) {
      if (key === 'pattern' && typeof value === 'string' && value.endsWith('$') && !value.endsWith('\\$')) record[key] = value.slice(0, -1) + END_OF_TEXT
      else anchorPatterns(value)
    }
  }
}

/** The JSON Schema of a zod schema as the grader reads it. The document is an authored input, so a default or a transform shows as it is written. */
export function exportSchema({ schema, source }: Pick<SchemaExport, 'schema' | 'source'>): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' }) as Record<string, unknown> & { $schema: string }
  anchorPatterns(rest)
  return { $schema, $comment: `Written by scripts/export-schemas.ts from ${source}. Do not edit it: change the zod schema and run \`bun scripts/export-schemas.ts\`.`, ...rest }
}

/** The bytes of every JSON Schema file, as the code writes them now. */
export function renderSchemas(): Rendered[] {
  return SCHEMA_EXPORTS.map((entry) => ({ file: entry.file, text: `${JSON.stringify(exportSchema(entry), null, 2)}\n` }))
}

/** The grader's copies: the bytes of `renderSchemas()` under the grader's package, one file for each schema. */
export function renderGraderCopies(): Rendered[] {
  return renderSchemas().map(({ file, text }) => ({ file: `${GRADER_SCHEMAS_DIR}/${path.basename(file)}`, text }))
}

/**
 * Why a regular expression would not mean the same in ECMAScript and in Python's `re`, or null when it does: a named group or a lookbehind
 * (Python spells the first differently and takes only some of the second), `\p{…}`, a backreference, `\d`, `\w`, `\s` and `\b`, whose sets
 * differ (Python's `\d` takes every Unicode digit), and a `.`, which skips different line terminators. A class written out takes none of these.
 */
export function patternProblem(source: string): string | null {
  // The end-of-text test is the one place that `\s` is fine: with `\S` in one class it is every character, in both languages.
  const pattern = source.replaceAll(END_OF_TEXT, '')
  let inClass = false
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '\\') {
      const next = pattern[i + 1] ?? ''
      if (/[dDwWsSbBpPkK0-9]/.test(next)) return `\\${next} does not mean the same in Python`
      i += 1
    } else if (inClass) {
      if (char === ']') inClass = false
    } else if (char === '[') inClass = true
    else if (char === '.') return 'a bare . skips different line terminators in Python'
    else if (char === '(' && pattern[i + 1] === '?') {
      const kind = pattern.slice(i + 2, i + 4)
      if (kind.startsWith('<') || kind.startsWith('P')) return `(?${kind[0]} is a named group or a lookbehind, which Python does not read as ECMAScript does`
    }
  }
  return null
}

/** Every problem that would keep the grader from reading an exported schema as the site does: a pattern that differs between the two languages, and an object that leaves its keys open. */
export function portabilityProblems(file: string, node: unknown, where = '$'): string[] {
  if (Array.isArray(node)) return node.flatMap((item, i) => portabilityProblems(file, item, `${where}[${i}]`))
  if (node === null || typeof node !== 'object') return []
  const record = node as Record<string, unknown>
  const problems: string[] = []
  if (typeof record.pattern === 'string') {
    const why = patternProblem(record.pattern)
    if (why !== null) problems.push(`${file} ${where}: the pattern ${JSON.stringify(record.pattern)}: ${why}`)
    if (/(?<!\\)\$/.test(record.pattern)) problems.push(`${file} ${where}: the pattern ${JSON.stringify(record.pattern)} has a bare $, which Python also matches before a final newline`)
  }
  if (record.type === 'object' && record.properties !== undefined && record.additionalProperties !== false) {
    problems.push(`${file} ${where}: an object with properties that does not close its keys (additionalProperties: false)`)
  }
  for (const [key, value] of Object.entries(record)) problems.push(...portabilityProblems(file, value, `${where}.${key}`))
  return problems
}

/** The portability problems of the schemas as the code writes them now. */
export function exportProblems(): string[] {
  return renderSchemas().flatMap(({ file, text }) => portabilityProblems(file, JSON.parse(text)))
}

/** The line where two texts first differ, from 1, and what each has there. */
function firstDifference(committed: string, expected: string): string {
  const a = committed.split('\n')
  const b = expected.split('\n')
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      const clip = (line: string | undefined): string => (line === undefined ? '(the end of the file)' : line.length > 100 ? `${line.slice(0, 97)}...` : line)
      return `line ${i + 1}: the file has ${JSON.stringify(clip(a[i]))}, and the code writes ${JSON.stringify(clip(b[i]))}`
    }
  }
  return 'no line differs'
}

/** The `.json` files directly in `dir` (relative to `root`), as repository-relative paths. */
function jsonFilesIn(root: string, dir: string): string[] {
  const full = path.join(root, dir)
  return existsSync(full) ? readdirSync(full).filter((name) => name.endsWith('.json')).sort().map((name) => `${dir}/${name}`) : []
}

/**
 * What is wrong with the committed files of one kind: a file missing, a file that differs from what the code writes now (with the first
 * line that differs), and a `.json` file in the folder that nothing writes.
 */
export function drift(root: string, rendered: readonly Rendered[], dir: string, kind: string): string[] {
  const problems: string[] = []
  for (const { file, text } of rendered) {
    const full = path.join(root, file)
    if (!existsSync(full)) problems.push(`${file} is missing: it is ${kind}, and \`bun scripts/export-schemas.ts\` writes it`)
    else {
      const committed = readFileSync(full, 'utf8')
      if (committed !== text) problems.push(`${file} is not what the code writes (${firstDifference(committed, text)})`)
    }
  }
  const owned = new Set(rendered.map(({ file }) => file))
  for (const file of jsonFilesIn(root, dir)) {
    if (!owned.has(file) && !(dir === 'schemas' && file.startsWith('schemas/vectors/'))) problems.push(`${file} is not ${kind} that anything writes: add its source to scripts/export-schemas.ts, or delete the file`)
  }
  return problems
}

/** Drift of schemas/*.schema.json from the zod schemas. */
export function schemaDrift(root: string = DEFAULT_ROOT): string[] {
  return drift(root, renderSchemas(), 'schemas', 'a JSON Schema of packages/schema')
}

/** Drift of the grader's copies from the schemas: a copy that is missing, one that differs, and a `.json` file in the folder that nothing writes. */
export function graderCopyDrift(root: string = DEFAULT_ROOT): string[] {
  return drift(root, renderGraderCopies(), GRADER_SCHEMAS_DIR, "a copy of a JSON Schema that the grader's package carries")
}

/** Drift of schemas/vectors/*.json from the builders, and the number forms the files hold. */
export function vectorDrift(root: string = DEFAULT_ROOT): string[] {
  const rendered = renderVectors()
  const problems = drift(root, rendered, 'schemas/vectors', 'a vector file')
  for (const { file, text } of rendered) {
    for (const problem of numberProblems(text)) problems.push(`${file}:${problem}`)
  }
  return problems
}

/** Writes every file under `root`, creating the folders. It refuses to write a vector file with a number the two languages might read differently. */
export function writeAll(root: string = DEFAULT_ROOT): string[] {
  const vectors = renderVectors()
  const refused = vectors.flatMap(({ file, text }) => numberProblems(text).map((problem) => `${file}:${problem}`))
  if (refused.length > 0) throw new Error(`export-schemas: a vector file holds a number that JavaScript and Python might read differently:\n  ${refused.join('\n  ')}`)
  const written: string[] = []
  for (const { file, text } of [...renderSchemas(), ...renderGraderCopies(), ...vectors]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), text)
    written.push(file)
  }
  return written
}

const USAGE = 'usage: bun scripts/export-schemas.ts [--check] [--root <dir>]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[]): number {
  let check = false
  let root = DEFAULT_ROOT
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--check') check = true
    else if (argv[i] === '--root' && argv[i + 1] !== undefined) root = path.resolve(argv[++i])
    else {
      console.error(`export-schemas: unknown argument "${argv[i]}"\n${USAGE}`)
      return 2
    }
  }
  if (check) {
    const problems = [...schemaDrift(root), ...graderCopyDrift(root), ...exportProblems(), ...vectorDrift(root)]
    for (const problem of problems) console.error(`export-schemas: ${problem}`)
    if (problems.length > 0) {
      console.error(`export-schemas: ${problems.length} problem(s). If the change is intended, run \`bun scripts/export-schemas.ts\` and review the diff of schemas/ (D-030).`)
      return 1
    }
    console.log(`export-schemas: ${SCHEMA_EXPORTS.length} schema(s), their copies in the grader, and ${renderVectors().length} vector file(s) are what the code writes`)
    return 0
  }
  const written = writeAll(root)
  console.log(`export-schemas: wrote ${written.join(', ')}`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
