/*
 * W2-T05's schema: `enginespace/references@1`, the manifest of the large files that `enginespace fetch` downloads (ARCHITECTURE §9.7, D-030).
 *
 *   - The cases of tests/fixtures/references/cases.json get the verdict the file gives, and the problems are where the file says. The grader's own
 *     suite reads the same file (labs/grader/tests/test_fetch.py), so the zod schema and the JSON Schema that is exported from it cannot take
 *     different manifests without one of the two suites failing.
 *   - Every object closes its keys, the limits hold at the edge, and an entry is never one that a receipt's `inputs` would refuse.
 *   - §9.7 lists the fields of an entry, and the schema has those and no others.
 *   - labs/references/manifest.json, the manifest the kit ships, is one, and names nothing but https.
 */
import { describe, expect, test } from 'bun:test'
import { INPUT_KINDS, inputSchema } from '@es/schema/receipt'
import { REFERENCE_PATH_MAX, REFERENCE_URL_MAX, REFERENCES_LIMITS, REFERENCES_SCHEMA_TAG, isReferenceDate, referenceSchema, referencesSchema } from '@es/schema/references'
import { between, fieldsOf, objectPaths, problems, read, where, withKey } from './support'

interface Case {
  id: string
  valid: boolean
  where?: string[] | null
  manifest?: unknown
  entries?: Record<string, unknown>[]
}

const file = JSON.parse(read('tests/fixtures/references/cases.json')) as { spec: string; base: Record<string, unknown>; cases: Case[] }
const { base } = file

/** The base entry with the keys of `over` set over it, and the keys that `$remove` names taken out. */
function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  const { $remove, ...set } = over as { $remove?: string[] }
  const made: Record<string, unknown> = { ...base, ...set }
  for (const key of $remove ?? []) delete made[key]
  return made
}

const manifest = (...entries: Record<string, unknown>[]) => ({ schema: REFERENCES_SCHEMA_TAG, entries })

/** The document of a case: its own, or its entries over the base entry. */
function documentOf(one: Case): unknown {
  return one.manifest !== undefined ? one.manifest : manifest(...(one.entries ?? []).map((over) => entry(over)))
}

/** A JSON Pointer to a place in a document, with `/` for the document itself, as the grader writes it. */
const pointer = (path: PropertyKey[]): string => (path.length === 0 ? '/' : `/${path.map(String).join('/')}`)

/** The places where a document has problems, as pointers, each once and in order. */
function places(value: unknown): string[] {
  const result = referencesSchema.safeParse(value)
  return result.success ? [] : [...new Set(result.error.issues.map((issue) => pointer(issue.path)))].sort()
}

describe('the cases that the grader reads too', () => {
  test('are the spec this test reads, with unique ids, and a base entry that is itself good', () => {
    expect(file.spec).toBe('enginespace/references-cases@1')
    const ids = file.cases.map((one) => one.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(places(manifest(entry()))).toEqual([])
  })

  for (const one of file.cases) {
    test(`${one.valid ? 'takes' : 'refuses'} ${one.id.replaceAll('-', ' ')}`, () => {
      const found = places(documentOf(one))
      expect(found.length === 0).toBe(one.valid)
      if (!one.valid && one.where !== null && one.where !== undefined) expect(found).toEqual([...one.where].sort())
    })
  }

  test('refuse something at every field of an entry, and are many, so the table cannot lose a field or a case', () => {
    const refused = file.cases.filter((one) => !one.valid).flatMap((one) => one.where ?? [])
    for (const key of Object.keys(referenceSchema.shape)) {
      const covered = refused.some((place) => place.startsWith('/entries/') && place.split('/')[3] === key) || file.cases.some((one) => (one.entries ?? []).some((over) => ((over as { $remove?: string[] }).$remove ?? []).includes(key)))
      expect([key, covered]).toEqual([key, true])
    }
    expect(file.cases.filter((one) => one.valid).length).toBeGreaterThanOrEqual(22)
    expect(file.cases.filter((one) => !one.valid).length).toBeGreaterThanOrEqual(75)
  })

  test('are about a base that is a plain example: the hash of the word example, and a host that cannot exist', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('example'))
    expect(base.sha256).toBe(Buffer.from(digest).toString('hex'))
    expect(base.bytes).toBe('example'.length)
    expect(String(base.url)).toContain('example.invalid')
  })
})

describe('every object rejects a key that nobody named', () => {
  test('the file and an entry', () => {
    const good = manifest(entry({ revision: 'main', notes: 'x' }))
    expect(problems(referencesSchema, good)).toEqual([])
    for (const path of objectPaths(good)) {
      expect(problems(referencesSchema, withKey(good, [...path, 'zzz'], true))).toEqual([`${where(path)}: unrecognized_keys[zzz]`])
    }
  })
})

describe('the limits', () => {
  const longest = (length: number, prefix = ''): string => prefix + 'a'.repeat(length - prefix.length)
  const numbered = (count: number) => Array.from({ length: count }, (_, i) => entry({ name: `file ${i}`, path: `f${i}.bin` }))
  const labs = (count: number) => Array.from({ length: count }, (_, i) => `tr0.lab-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`)

  test('hold a manifest of REFERENCES_LIMITS.entries entries and refuse one more, at the list', () => {
    expect(REFERENCES_LIMITS).toEqual({ entries: 256, labs: 16 })
    expect(places(manifest(...numbered(REFERENCES_LIMITS.entries)))).toEqual([])
    expect(places(manifest(...numbered(REFERENCES_LIMITS.entries + 1)))).toEqual(['/entries'])
  })

  test('hold the labs of an entry up to REFERENCES_LIMITS.labs and refuse one more', () => {
    expect(places(manifest(entry({ labs: labs(REFERENCES_LIMITS.labs) })))).toEqual([])
    expect(places(manifest(entry({ labs: labs(REFERENCES_LIMITS.labs + 1) })))).toEqual(['/entries/0/labs'])
  })

  const edges: [string, string, number][] = [
    ['name', 'name', 128],
    ['licence', 'licence', 128],
    ['revision', 'revision', 64],
    ['notes', 'notes', 1000],
  ]
  for (const [label, key, max] of edges) {
    test(`hold a ${label} of ${max} characters and refuse ${max + 1}`, () => {
      expect(places(manifest(entry({ [key]: 'n'.repeat(max) })))).toEqual([])
      expect(places(manifest(entry({ [key]: 'n'.repeat(max + 1) })))).toEqual([`/entries/0/${key}`])
    })
  }

  test('count a name in characters and not in UTF-16 units, as JSON Schema does: 128 emoji are 128 characters', () => {
    expect(places(manifest(entry({ name: '😀'.repeat(128) })))).toEqual([])
    expect(places(manifest(entry({ name: '😀'.repeat(129) })))).toEqual(['/entries/0/name'])
  })

  test(`hold a path of REFERENCE_PATH_MAX (${REFERENCE_PATH_MAX}) characters and a URL of REFERENCE_URL_MAX (${REFERENCE_URL_MAX})`, () => {
    expect(places(manifest(entry({ path: longest(REFERENCE_PATH_MAX) })))).toEqual([])
    expect(places(manifest(entry({ path: longest(REFERENCE_PATH_MAX + 1) })))).toEqual(['/entries/0/path'])
    expect(places(manifest(entry({ url: longest(REFERENCE_URL_MAX, 'https://example.invalid/') })))).toEqual([])
    expect(places(manifest(entry({ url: longest(REFERENCE_URL_MAX + 1, 'https://example.invalid/') })))).toEqual(['/entries/0/url'])
  })
})

describe('an entry and the receipt', () => {
  test('use the same kinds of input: the manifest takes the four kinds that a receipt lists, and no other', () => {
    expect([...referenceSchema.shape.kind.options]).toEqual([...INPUT_KINDS])
  })

  test('a good entry names its file as a receipt does: its name, kind, revision, hash and size are an `inputs` entry that the receipt schema takes', () => {
    const good = file.cases.filter((one) => one.valid).flatMap((one) => (documentOf(one) as { entries: Record<string, unknown>[] }).entries)
    expect(good.length).toBeGreaterThan(20)
    for (const one of good) {
      const input = Object.fromEntries(['name', 'kind', 'revision', 'sha256', 'bytes'].filter((key) => key in one).map((key) => [key, one[key]]))
      expect([one.name, problems(inputSchema, input)]).toEqual([one.name, []])
    }
  })
})

describe('a date', () => {
  test('is a day of the calendar written YYYY-MM-DD', () => {
    for (const day of ['2026-11-09', '2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) expect([day, isReferenceDate(day)]).toEqual([day, true])
    for (const day of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-10', '2026-01-00', '0000-01-01', '2026-1-1', '2026-11-09 ', '']) expect([day, isReferenceDate(day)]).toEqual([day, false])
  })
})

describe("ARCHITECTURE §9.7's entry", () => {
  const section = between(read('docs/ARCHITECTURE.md'), '### 9.7 References and downloads', '### 9.8')
  const shape = /`(\{name, kind[^`]*\})`/.exec(section)?.[1]
  if (shape === undefined) throw new Error('§9.7 no longer shows the entry’s shape')
  const fields = fieldsOf(shape)

  test('has the fields that the schema has, in its order, and marks the optional ones', () => {
    expect(fields.map((field) => field.name)).toEqual(Object.keys(referenceSchema.shape))
    expect(fields.filter((field) => field.optional).map((field) => field.name)).toEqual(['revision', 'notes'])
  })

  test('names the schema it is written in, and the file that holds the manifest', () => {
    expect(section).toContain(REFERENCES_SCHEMA_TAG)
    expect(section).toContain('labs/references/manifest.json')
    expect(section).toContain('packages/schema/references.ts')
  })

  test('is exported to the grader as the schema, with the keys of the entry in the order of the shape', () => {
    const exported = JSON.parse(read('schemas/references.schema.json')) as { title: string; properties: { entries: { items: { properties: Record<string, unknown>; required: string[] } } } }
    expect(exported.title).toBe(REFERENCES_SCHEMA_TAG)
    expect(Object.keys(exported.properties.entries.items.properties)).toEqual(Object.keys(referenceSchema.shape))
    expect(exported.properties.entries.items.required).toEqual(Object.keys(referenceSchema.shape).filter((key) => key !== 'revision' && key !== 'notes'))
    expect(read('labs/grader/src/enginespace_grader/schemas/references.schema.json')).toBe(read('schemas/references.schema.json'))
  })
})

describe('the manifest that the kit ships', () => {
  const text = read('labs/references/manifest.json')
  const committed = JSON.parse(text) as { schema: string; entries: Record<string, unknown>[] }

  test('is a references manifest', () => {
    expect(problems(referencesSchema, committed)).toEqual([])
    expect(committed.schema).toBe(REFERENCES_SCHEMA_TAG)
    expect(text.endsWith('\n')).toBe(true)
    expect(text).not.toContain('\r')
  })

  test('downloads from https and from nowhere on this machine: the loopback form is for the tests, and a committed URL is never one', () => {
    for (const one of committed.entries) expect([one.name, String(one.url).startsWith('https://')]).toEqual([one.name, true])
  })

  test('states a licence, a day that exists and at least one lab for each file it lists', () => {
    for (const one of committed.entries) {
      expect(String(one.licence).trim().length).toBeGreaterThan(0)
      expect(isReferenceDate(String(one.date))).toBe(true)
      expect((one.labs as string[]).length).toBeGreaterThan(0)
    }
  })
})
