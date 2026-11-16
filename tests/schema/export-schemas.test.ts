/*
 * W2-T01's export (D-030, ARCHITECTURE §9.6) and its first gate, verify:schema.
 *
 *   Accept 1: the export is deterministic, and a drift fails.
 *     - Two exports in one process, and two in processes of their own, write the same bytes, and they are the bytes that are committed.
 *     - A schema file that differs by one byte, one that is missing and one that nothing writes each fail verify:schema, naming the file.
 *   And, from W2-T02, the grader's copies: the grader is installed alone, so its package carries a copy of each schema (the copy it validates
 *   with), the export writes it, and verify:schema fails on a copy that is missing, that differs, or that nothing writes.
 *   And what the export promises the grader:
 *     - every pattern that Python's `re` reads differently from ECMAScript is found, and the ones exported are not those;
 *     - the end-of-text test that replaces `$` means the same as `$` in ECMAScript on every string, and refuses a final newline in both;
 *     - an object closes its keys, the document is an authored input, and the file says where it comes from.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import {
  END_OF_TEXT,
  GRADER_SCHEMAS_DIR,
  SCHEMA_EXPORTS,
  exportProblems,
  exportSchema,
  graderCopyDrift,
  patternProblem,
  portabilityProblems,
  renderGraderCopies,
  renderSchemas,
  schemaDrift,
} from '../../scripts/export-schemas'
import { main as verifySchema } from '../../scripts/verify-schema'
import { bundleSchema } from '@es/schema/bundle'
import { challengeSchema } from '@es/schema/challenge'
import { receiptSchema } from '@es/schema/receipt'
import { referencesSchema } from '@es/schema/references'
import { traceSchema } from '@es/schema/trace'
import { read, root } from './support'

const scratch: string[] = []
function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'es-schemas-'))
  scratch.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

/** The files of a folder as `name → text`, sorted by name. */
function filesOf(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of (readdirSync(dir, { recursive: true }) as string[]).map((name) => name.split(path.sep).join('/')).sort()) {
    if (/\.json$/.test(entry)) out[entry] = readFileSync(path.join(dir, entry), 'utf8')
  }
  return out
}

/** Runs a script of the repository in its own process. */
function run(script: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8' })
  return { status: result.status, out: result.stdout, err: result.stderr }
}

/** A copy of the committed schemas/ in a folder of its own, with the grader's copies of them where the grader keeps them. */
function copyOfSchemas(): string {
  const dir = tempRoot()
  cpSync(path.join(root, 'schemas'), path.join(dir, 'schemas'), { recursive: true })
  cpSync(path.join(root, GRADER_SCHEMAS_DIR), path.join(dir, GRADER_SCHEMAS_DIR), { recursive: true })
  return dir
}

describe('the export is deterministic', () => {
  test('two exports in one process are the same bytes, and the committed files are those bytes', () => {
    const first = renderSchemas()
    const second = renderSchemas()
    expect(second).toEqual(first)
    expect(first.map(({ file }) => file)).toEqual([
      'schemas/receipt.schema.json',
      'schemas/bundle.schema.json',
      'schemas/challenge.schema.json',
      'schemas/trace.schema.json',
      'schemas/references.schema.json',
    ])
    for (const { file, text } of first) expect([file, read(file) === text]).toEqual([file, true])
  })

  test('the same two exports from two processes, into two folders, are the same bytes as the committed folder', () => {
    const a = tempRoot()
    const b = tempRoot()
    expect(run('scripts/export-schemas.ts', '--root', a).status).toBe(0)
    expect(run('scripts/export-schemas.ts', '--root', b).status).toBe(0)
    const written = filesOf(path.join(a, 'schemas'))
    expect(filesOf(path.join(b, 'schemas'))).toEqual(written)
    expect(written).toEqual(filesOf(path.join(root, 'schemas')))
    expect(Object.keys(written)).toHaveLength(10)
  })

  test('is two-space JSON with one final newline, the keys in the order zod writes them', () => {
    for (const { text } of renderSchemas()) {
      expect(text.endsWith('}\n')).toBe(true)
      expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`)
    }
  })

  test('is exactly what verify:schema reads: the command line passes on the tree, and the schemas it covers are the four of A§9.6 and the references manifest of A§9.7', () => {
    const { status, out } = run('scripts/verify-schema.ts')
    expect([status, out.trim()]).toEqual([0, "verify:schema passed: 5 JSON Schemas, and the grader's copy of each, are what the zod schemas of packages/schema export"])
    expect(SCHEMA_EXPORTS.map((entry) => entry.schema)).toEqual([receiptSchema, bundleSchema, challengeSchema, traceSchema, referencesSchema])
  })
})

describe('a drift fails verify:schema', () => {
  /** Runs the gate on a tree, and returns its status and what it said. */
  function gate(dir: string) {
    const result = run('scripts/verify-schema.ts', '--root', dir)
    return { status: result.status, said: result.err }
  }

  test('passes on a copy of the committed schemas', () => {
    expect(gate(copyOfSchemas()).status).toBe(0)
  })

  test('a schema file that differs by one character fails, naming the file and the first line that differs', () => {
    const dir = copyOfSchemas()
    const file = path.join(dir, 'schemas/receipt.schema.json')
    const text = readFileSync(file, 'utf8')
    writeFileSync(file, text.replace('"maxItems": 64', '"maxItems": 65'))
    const { status, said } = gate(dir)
    expect(status).toBe(1)
    expect(said).toContain('verify:schema: schemas/receipt.schema.json is not what the code writes (line ')
    expect(said).toContain('maxItems')
    expect(said).toContain('65')
    expect(said).toContain('verify:schema failed: 1 problem(s)')
    expect(said).toContain('bun scripts/export-schemas.ts')
  })

  test('a schema file that is missing fails', () => {
    const dir = copyOfSchemas()
    rmSync(path.join(dir, 'schemas/trace.schema.json'))
    const { status, said } = gate(dir)
    expect([status, said]).toEqual([1, expect.stringContaining('schemas/trace.schema.json is missing')])
  })

  test('a json file at the top of schemas/ that nothing writes fails, and a vector file is not that', () => {
    const dir = copyOfSchemas()
    writeFileSync(path.join(dir, 'schemas/stray.json'), '{}\n')
    const { status, said } = gate(dir)
    expect(status).toBe(1)
    expect(said).toContain('schemas/stray.json is not a JSON Schema of packages/schema that anything writes')
    expect(said).not.toContain('schemas/vectors')
  })

  test('the zod schema changing is a drift too: a schema with one more key does not match the committed file', () => {
    const changed = z.strictObject({ ...receiptSchema.shape, extra: z.string() })
    const entry = SCHEMA_EXPORTS[0]
    expect(JSON.stringify(exportSchema({ schema: changed, source: entry.source }))).not.toBe(JSON.stringify(exportSchema(entry)))
    expect(schemaDrift(copyOfSchemas())).toEqual([])
  })

  test('a folder with no schemas fails once for each file, and once more for each copy of the grader', () => {
    const dir = tempRoot()
    expect(schemaDrift(dir)).toHaveLength(5)
    expect(graderCopyDrift(dir)).toHaveLength(5)
    const { status, said } = gate(dir)
    expect(status).toBe(1)
    expect(said).toContain('verify:schema failed: 10 problem(s)')
  })

  test('a usage error is 2, and --check on the export reports the same drift', () => {
    expect(verifySchema(['--bogus'])).toBe(2)
    const dir = copyOfSchemas()
    const file = path.join(dir, 'schemas/bundle.schema.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace('"title"', '"titel"'))
    const { status, err } = run('scripts/export-schemas.ts', '--check', '--root', dir)
    expect(status).toBe(1)
    expect(err).toContain('schemas/bundle.schema.json is not what the code writes')
    expect(run('scripts/export-schemas.ts', '--nope').status).toBe(2)
  })
})

describe("the grader's copies of the schemas (W2-T02)", () => {
  /** The grader's package carries these, and its `schemas.py` loads them: pyproject.toml ships every file of src/enginespace_grader. */
  const names = ['receipt.schema.json', 'bundle.schema.json', 'challenge.schema.json', 'trace.schema.json', 'references.schema.json']

  function gate(dir: string) {
    const result = run('scripts/verify-schema.ts', '--root', dir)
    return { status: result.status, said: result.err }
  }

  test('are the schemas, byte for byte, in the folder of the grader’s package data, and the committed copies are those bytes', () => {
    expect(GRADER_SCHEMAS_DIR).toBe('labs/grader/src/enginespace_grader/schemas')
    expect(renderGraderCopies().map(({ file }) => file)).toEqual(names.map((name) => `${GRADER_SCHEMAS_DIR}/${name}`))
    const schemas = renderSchemas()
    renderGraderCopies().forEach(({ file, text }, at) => {
      expect([file, text === schemas[at].text]).toEqual([file, true])
      expect([file, read(file) === text, read(file) === read(schemas[at].file)]).toEqual([file, true, true])
    })
    expect(readdirSync(path.join(root, GRADER_SCHEMAS_DIR)).sort()).toEqual([...names].sort())
    expect(graderCopyDrift(root)).toEqual([])
  })

  test('are written by the export into a root of its own, beside the schemas', () => {
    const dir = tempRoot()
    const { status, out } = run('scripts/export-schemas.ts', '--root', dir)
    expect(status).toBe(0)
    expect(out).toContain(GRADER_SCHEMAS_DIR)
    for (const name of names) expect([name, readFileSync(path.join(dir, GRADER_SCHEMAS_DIR, name), 'utf8') === read(`${GRADER_SCHEMAS_DIR}/${name}`)]).toEqual([name, true])
    expect(run('scripts/export-schemas.ts', '--check', '--root', dir).status).toBe(0)
  })

  test('that differ by a character fail verify:schema, naming the copy and the first line that differs', () => {
    const dir = copyOfSchemas()
    const file = path.join(dir, GRADER_SCHEMAS_DIR, 'receipt.schema.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace('"maxItems": 64', '"maxItems": 65'))
    const { status, said } = gate(dir)
    expect(status).toBe(1)
    expect(said).toContain(`verify:schema: ${GRADER_SCHEMAS_DIR}/receipt.schema.json is not what the code writes (line `)
    expect(said).toContain('maxItems')
    expect(said).toContain('verify:schema failed: 1 problem(s)')
    // The schemas themselves are fine, and so are the other copies.
    expect(schemaDrift(dir)).toEqual([])
    expect(graderCopyDrift(dir)).toHaveLength(1)
  })

  test('that are missing fail, and so does a json file in their folder that nothing writes', () => {
    const missing = copyOfSchemas()
    rmSync(path.join(missing, GRADER_SCHEMAS_DIR, 'trace.schema.json'))
    expect(gate(missing).said).toContain(`${GRADER_SCHEMAS_DIR}/trace.schema.json is missing`)
    expect(gate(missing).status).toBe(1)

    const stray = copyOfSchemas()
    writeFileSync(path.join(stray, GRADER_SCHEMAS_DIR, 'old.schema.json'), '{}\n')
    const { status, said } = gate(stray)
    expect(status).toBe(1)
    expect(said).toContain(`${GRADER_SCHEMAS_DIR}/old.schema.json is not a copy of a JSON Schema that the grader's package carries that anything writes`)
  })

  test('are checked by --check as well', () => {
    const dir = copyOfSchemas()
    const file = path.join(dir, GRADER_SCHEMAS_DIR, 'challenge.schema.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace('"title"', '"titel"'))
    const { status, err } = run('scripts/export-schemas.ts', '--check', '--root', dir)
    expect(status).toBe(1)
    expect(err).toContain(`${GRADER_SCHEMAS_DIR}/challenge.schema.json is not what the code writes`)
  })
})

describe('the end of a pattern', () => {
  const exported = renderSchemas().map(({ file, text }) => ({ file, json: JSON.parse(text) as unknown }))

  /** Every pattern in a document with the place it is at. */
  function patternsOf(node: unknown, where = '$'): { where: string; pattern: string }[] {
    if (Array.isArray(node)) return node.flatMap((item, i) => patternsOf(item, `${where}[${i}]`))
    if (node === null || typeof node !== 'object') return []
    const record = node as Record<string, unknown>
    return [...(typeof record.pattern === 'string' ? [{ where, pattern: record.pattern }] : []), ...Object.entries(record).flatMap(([key, value]) => patternsOf(value, `${where}.${key}`))]
  }

  test('no exported pattern ends in a bare $, and each that was anchored ends in "no character follows"', () => {
    const all = exported.flatMap(({ file, json }) => patternsOf(json).map((one) => ({ file, ...one })))
    expect(all.length).toBeGreaterThan(40)
    for (const { file, where, pattern } of all) {
      expect([file, where, /(?<!\\)\$$/.test(pattern)]).toEqual([file, where, false])
      expect([file, where, pattern.endsWith(END_OF_TEXT)]).toEqual([file, where, true])
    }
  })

  test('means what $ means in ECMAScript on every string: the same verdict with the end-of-text test as with $, on a corpus with newlines in it', () => {
    const corpus = ['', 'a', 'tr8.replay', 'tr8.replay\n', '\ntr8.replay', 'ABCDEFGHJKLMNPQR', 'ABCDEFGHJKLMNPQR\n', '0.33.0', '0.33.0\n', 'a'.repeat(64), `${'a'.repeat(64)}\n`, '2026-11-09T12:30:00Z', '2026-11-09T12:30:00Z\n', 'x ', 'x\r', 'x\r\n', 'é']
    for (const { pattern } of exported.flatMap(({ json }) => patternsOf(json))) {
      const anchored = new RegExp(pattern)
      const original = new RegExp(`${pattern.slice(0, -END_OF_TEXT.length)}$`)
      for (const text of corpus) expect([pattern, text, anchored.test(text)]).toEqual([pattern, text, original.test(text)])
    }
  })

  test('refuses a text with a newline after a hash, a version and a token, as Python’s re.search would not do with $', () => {
    const hash = exported[0].json as { properties: { grader: { properties: { sourceSha256: { pattern: string } } } } }
    const pattern = new RegExp(hash.properties.grader.properties.sourceSha256.pattern)
    expect(pattern.test('a'.repeat(64))).toBe(true)
    expect(pattern.test(`${'a'.repeat(64)}\n`)).toBe(false)
  })
})

describe('what Python’s re reads differently', () => {
  test('is found in a pattern: the classes, the dot, the word boundary, the named group, the lookbehind and a bare $', () => {
    for (const [pattern, why] of [
      ['^\\d+(?![\\s\\S])', '\\d'],
      ['^\\w(?![\\s\\S])', '\\w'],
      ['^a\\sb(?![\\s\\S])', '\\s'],
      ['^\\bfoo(?![\\s\\S])', '\\b'],
      ['^a.b(?![\\s\\S])', 'a bare .'],
      ['^(?<name>a)(?![\\s\\S])', 'named group'],
      ['^(?<=a)b(?![\\s\\S])', 'lookbehind'],
      ['^\\p{L}+(?![\\s\\S])', '\\p'],
      ['^(a)\\1(?![\\s\\S])', '\\1'],
      ['^(?P<x>a)(?![\\s\\S])', '(?P'],
    ] as const) {
      expect([pattern, patternProblem(pattern)]).toEqual([pattern, expect.stringContaining(why)])
    }
  })

  test('is not found where it is not there: a class written out, an escaped dot, a dot in a class, an escaped dollar and the end-of-text test', () => {
    for (const pattern of ['^[0-9a-f]{64}(?![\\s\\S])', '^a\\.b(?![\\s\\S])', '^[.]x(?![\\s\\S])', '^a\\$b(?![\\s\\S])', '^(?:tr[0-8][ab]?|capstone)\\.[a-z0-9]+(?![\\s\\S])', '^[^\\u0000-\\u001f]*(?![\\s\\S])', '^(?:a|b)+(?![\\s\\S])']) {
      expect([pattern, patternProblem(pattern)]).toEqual([pattern, null])
    }
  })

  test('is found in a whole document, with the place of it, and a bare $ and an open object are named too', () => {
    const found = portabilityProblems('x.json', { properties: { a: { pattern: '^\\d$' }, b: { type: 'object', properties: { c: {} } } } })
    expect(found).toHaveLength(3)
    expect(found[0]).toContain('$.properties.a')
    expect(found[0]).toContain('\\d')
    expect(found[1]).toContain('has a bare $')
    expect(found[2]).toContain('does not close its keys')
  })

  test('is not in anything that the code exports', () => {
    expect(exportProblems()).toEqual([])
  })
})

describe('what the file says of itself', () => {
  const documents = renderSchemas().map(({ file, text }) => ({ file, json: JSON.parse(text) as Record<string, unknown> }))

  test('is JSON Schema 2020-12, has no $id, and says where it comes from', () => {
    for (const { file, json } of documents) {
      expect([file, json.$schema]).toEqual([file, 'https://json-schema.org/draft/2020-12/schema'])
      expect(json.$id).toBeUndefined()
      expect(json.$comment).toContain('scripts/export-schemas.ts')
      expect(json.$comment).toContain('packages/schema/')
      expect(Object.keys(json).slice(0, 2)).toEqual(['$schema', '$comment'])
    }
  })

  test('is titled with the tag of the format, for the four that have one', () => {
    const titles = Object.fromEntries(documents.map(({ file, json }) => [path.basename(file), json.title]))
    expect(titles).toEqual({
      'receipt.schema.json': 'enginespace/receipt@1',
      'bundle.schema.json': 'enginespace/bundle@1',
      'challenge.schema.json': 'enginespace challenge',
      'trace.schema.json': 'enginespace/trace@1',
      'references.schema.json': 'enginespace/references@1',
    })
  })

  test('is the same document as an authored input and as the parsed output, since none of the five has a default or a transform', () => {
    for (const { schema } of SCHEMA_EXPORTS) {
      expect(z.toJSONSchema(schema, { io: 'output' })).toEqual(z.toJSONSchema(schema, { io: 'input' }))
    }
  })

  test('closes the keys of every object that lists properties, and reaches no $ref beyond its own $defs', () => {
    for (const { file, json } of documents) {
      expect(portabilityProblems(file, json)).toEqual([])
      const refs = JSON.stringify(json).match(/"\$ref":"[^"]*"/g) ?? []
      for (const ref of refs) expect([file, ref.startsWith('"$ref":"#/$defs/')]).toEqual([file, true])
    }
  })

  test('has every key of the zod schema as a property, in the zod schema’s order, and requires those that zod does', () => {
    const receipt = documents[0].json as { properties: Record<string, unknown>; required: string[] }
    expect(Object.keys(receipt.properties)).toEqual(Object.keys(receiptSchema.shape))
    expect(receipt.required).toEqual(Object.keys(receiptSchema.shape).filter((key) => !['performance', 'notes', 'ext'].includes(key)))
  })

  test('is written with LF line endings and no trailing space', () => {
    for (const { file } of documents) {
      expect(existsSync(path.join(root, file))).toBe(true)
      const text = read(file)
      expect(text).not.toContain('\r')
      expect(text.split('\n').filter((line) => /[ \t]$/.test(line))).toEqual([])
    }
  })
})
