/*
 * W2-T01's `trace@1` schema (ARCHITECTURE §5.7, §9.6, D-030) against the reader that the site runs on a trace, `traceFromJson` of
 * packages/sim/trace/codec.ts. They are two statements of one format, one for the grader's JSON Schema and one for the browser's hand-written
 * reader, so a field changed in one and not the other is what these tests are for:
 *
 *   - the schema takes every trace the model writes, over 200 seeds [estimated], and so does the reader;
 *   - each way a document can be wrong, one at a time, is refused by both: an unknown or missing key at every level, a wrong type, a bound, a
 *     column of another length, an index outside its table, a duplicate, a negative zero;
 *   - the places where the schema is stricter than the reader are listed, and held: the text of `meta`;
 *   - the export says what JSON Schema can say of it.
 */
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { FLOW_KINDS, TRACE_SCHEMA_TAG, TRACE_SOURCES, TRACK_KINDS, traceSchema } from '@es/schema/trace'
import { TRACE_SCHEMA, traceFromJson, traceFromRun, traceToJson } from '../../packages/sim/trace'
import { seeds } from '../seeds'
import { runOf } from '../sim/trace-support'
import { sampleTrace } from './receipt-support'
import { between, problems, read } from './support'

const SEEDS = seeds(1)

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- each mutation below reaches into the document at any depth and sets what the format refuses

const clone = <T>(value: T): T => structuredClone(value)
const textOf = (doc: unknown): string => JSON.stringify(doc)

/** Whether each reader takes the document. */
function verdicts(doc: unknown): { schema: boolean; reader: boolean } {
  let reader = true
  try {
    traceFromJson(doc)
  } catch {
    reader = false
  }
  return { schema: traceSchema.safeParse(doc).success, reader }
}

describe('the tag, the vocabulary and the shape', () => {
  test('are the reader’s own', () => {
    expect(TRACE_SCHEMA_TAG).toBe(TRACE_SCHEMA)
    expect(Object.keys(traceSchema.shape)).toEqual(['schema', 'meta', 'strings', 'tracks', 'spans', 'flows', 'marks'])
    expect(Object.keys(traceSchema.shape.spans.shape)).toEqual(['track', 'startNs', 'durNs', 'name', 'cat', 'corr'])
    expect(Object.keys(traceToJson(sampleTrace() as never))).toEqual(Object.keys(traceSchema.shape))
    expect([...TRACE_SOURCES]).toEqual(['synthetic', 'owner', 'learner'])
    expect([...TRACK_KINDS]).toEqual(['cpu-thread', 'cuda-api', 'gpu-stream', 'marker'])
    expect([...FLOW_KINDS]).toEqual(['launch', 'sync', 'copy'])
  })

  test('A§5.7 shows the same interface: its fields, its kinds and its sources', () => {
    const shape = between(read('docs/ARCHITECTURE.md'), 'export interface EsTrace {', 'export function traceFromRun')
    const unions = (text: string): string[][] => [...text.matchAll(/((?:'[a-z-]+'(?: \| )?)+)/g)].map((found) => [...found[1].matchAll(/'([a-z-]+)'/g)].map((one) => one[1]))
    // The doc writes the source, the track kinds and the flow kinds as unions of strings, in that order.
    expect(unions(shape).map((union) => union.join('|'))).toEqual([[...TRACE_SOURCES].join('|'), [...TRACK_KINDS].join('|'), [...FLOW_KINDS].join('|')])
    expect(shape).toContain(`schema: '${TRACE_SCHEMA_TAG}'`)
    const meta = /meta: \{([^}]*)\}/.exec(shape)?.[1] ?? ''
    const fields = [...meta.matchAll(/\b([A-Za-z0-9]+)(\?)?:/g)].map((found) => ({ name: found[1], optional: found[2] === '?' }))
    expect(fields.filter((field) => field.optional).map((field) => field.name)).toEqual(['engine', 'version', 'gpu', 'capturedAt', 'sha256'])
    expect(fields.map((field) => field.name).sort()).toEqual(Object.keys(traceSchema.shape.meta.shape).sort())
    for (const key of ['schema', 'meta', 'strings', 'tracks', 'spans', 'flows', 'marks']) expect(shape).toContain(`  ${key}: `)
  })
})

describe('a trace that the model writes', () => {
  test('is taken by the schema and by the reader, over 200 seeds [estimated]', () => {
    for (const seed of SEEDS) {
      const { run } = runOf(seed)
      const doc = JSON.parse(textOf(traceToJson(traceFromRun(run, seed))))
      expect([seed, verdicts(doc)]).toEqual([seed, { schema: true, reader: true }])
    }
  })

  test('is taken by the schema as the reader writes it, with the typed arrays turned into lists', () => {
    const { run } = runOf(3)
    const json = traceToJson(traceFromRun(run, 3))
    expect(traceSchema.safeParse(JSON.parse(textOf(json))).success).toBe(true)
  })

  test('the smallest trace, with nothing in it, is taken by both', () => {
    const empty = { schema: TRACE_SCHEMA, meta: { source: 'learner', synthetic: false }, strings: [], tracks: [], spans: { track: [], startNs: [], durNs: [], name: [], cat: [], corr: [] }, flows: [], marks: [] }
    expect(verdicts(empty)).toEqual({ schema: true, reader: true })
  })
})

describe('a document that is wrong in one way', () => {
  const base = JSON.parse(textOf(sampleTrace())) as Json
  const spanCount = (base.spans.track as number[]).length

  const mutations: [string, (doc: Json) => void][] = [
    ['an unknown key at the top', (d) => (d.extra = 1)],
    ['an unknown key in meta', (d) => (d.meta.extra = 1)],
    ['an unknown key in a track', (d) => (d.tracks[0].extra = 1)],
    ['an unknown span column', (d) => (d.spans.extra = [])],
    ['an unknown key in a flow', (d) => (d.flows[0].extra = 1)],
    ['an unknown key in a mark', (d) => (d.marks[0].extra = 1)],
    ...['schema', 'meta', 'strings', 'tracks', 'spans', 'flows', 'marks'].map((key): [string, (doc: Json) => void] => [`${key} left out`, (d) => delete d[key]]),
    ...['source', 'synthetic'].map((key): [string, (doc: Json) => void] => [`meta.${key} left out`, (d) => delete d.meta[key]]),
    ...['track', 'startNs', 'durNs', 'name', 'cat', 'corr'].map((key): [string, (doc: Json) => void] => [`spans.${key} left out`, (d) => delete d.spans[key]]),
    ['a different schema tag', (d) => (d.schema = 'enginespace/trace@2')],
    ['a source that is not one', (d) => (d.meta.source = 'robot')],
    ['synthetic for a source that is not synthetic', (d) => ((d.meta.source = 'owner'), (d.meta.synthetic = true))],
    ['not synthetic for a synthetic source', (d) => (d.meta.synthetic = false)],
    ['synthetic as a string', (d) => (d.meta.synthetic = 'true')],
    ['a capture hash in upper case', (d) => (d.meta.sha256 = 'A'.repeat(64))],
    ['a capture hash of 63 digits', (d) => (d.meta.sha256 = 'a'.repeat(63))],
    ['an engine that is a number', (d) => (d.meta.engine = 5)],
    ['a track kind that is not one', (d) => (d.tracks[0].kind = 'disk')],
    ['two tracks with one id', (d) => (d.tracks[1].id = d.tracks[0].id)],
    ['a negative track id', (d) => (d.tracks[0].id = -1)],
    ['a track id beyond 2^31 - 1', (d) => (d.tracks[0].id = 2 ** 31)],
    ['a track name outside the strings', (d) => (d.tracks[0].name = d.strings.length)],
    ['a track name that is a string', (d) => (d.tracks[0].name = 'main')],
    ...['track', 'startNs', 'durNs', 'name', 'cat', 'corr'].flatMap((key): [string, (doc: Json) => void][] => [
      [`a short ${key} column`, (d) => d.spans[key].pop()],
      [`a long ${key} column`, (d) => d.spans[key].push(d.spans[key][0])],
    ]),
    ['a span on a track that is not there', (d) => (d.spans.track[0] = 99)],
    ['a span name outside the strings', (d) => (d.spans.name[0] = d.strings.length)],
    ['a span category outside the strings', (d) => (d.spans.cat[0] = d.strings.length)],
    ['a correlation id below -1', (d) => (d.spans.corr[0] = -2)],
    ['a correlation id beyond 2^31 - 1', (d) => (d.spans.corr[0] = 2 ** 31)],
    ['a start that has a fraction', (d) => (d.spans.startNs[0] = 1.5)],
    ['a start that is a string', (d) => (d.spans.startNs[0] = '5')],
    ['a start that is null', (d) => (d.spans.startNs[0] = null)],
    ['a start beyond 2^53', (d) => (d.spans.startNs[0] = Number.MAX_SAFE_INTEGER + 2)],
    ['a duration beyond 2^53', (d) => (d.spans.durNs[0] = Number.MAX_SAFE_INTEGER + 2)],
    ['a span that ends beyond 2^53', (d) => ((d.spans.startNs[0] = Number.MAX_SAFE_INTEGER), (d.spans.durNs[0] = 1))],
    ['a start of -0', (d) => (d.spans.startNs[0] = -0)],
    ['a duration of -0', (d) => (d.spans.durNs[0] = -0)],
    ['a mark of -0', (d) => (d.marks[0].tNs = -0)],
    ['a flow from a span that is not there', (d) => (d.flows[0].from = spanCount)],
    ['a flow to a span that is not there', (d) => (d.flows[0].to = spanCount + 3)],
    ['a flow kind that is not one', (d) => (d.flows[0].kind = 'jump')],
    ['a flow from a negative span', (d) => (d.flows[0].from = -1)],
    ['a mark time with a fraction', (d) => (d.marks[0].tNs = 0.5)],
    ['a mark name outside the strings', (d) => (d.marks[0].name = d.strings.length)],
    ['a string table entry that is a number', (d) => (d.strings[0] = 3)],
    ['a lone surrogate in the string table', (d) => (d.strings[0] = 'a\ud800b')],
    ['a lone surrogate in meta', (d) => (d.meta.gpu = '\udc00')],
    ['strings that is not a list', (d) => (d.strings = 'a')],
    ['spans that is a list', (d) => (d.spans = [])],
    ['a mark that is a number', (d) => (d.marks[0] = 5)],
    ['null', (d) => Object.keys(d).forEach((key) => delete d[key])],
  ]

  test('starts from a document that both take', () => {
    expect(verdicts(base)).toEqual({ schema: true, reader: true })
  })

  for (const [name, mutate] of mutations) {
    test(`${name}: both refuse it`, () => {
      const doc = clone(base)
      mutate(doc)
      expect([name, verdicts(doc)]).toEqual([name, { schema: false, reader: false }])
    })
  }

  test('a document that is not an object, or is null, is refused by both', () => {
    for (const doc of [null, 5, 'trace', [], true]) expect([doc, verdicts(doc)]).toEqual([doc, { schema: false, reader: false }])
  })

  test('the schema names the place: a column of another length is reported at that column, and a missing index at its row', () => {
    const doc = clone(base)
    doc.spans.durNs.pop()
    doc.spans.name[0] = doc.strings.length
    expect(problems(traceSchema, doc)).toEqual(['spans.durNs: custom', 'spans.name.0: custom'])
  })

  test('stops listing after 20 problems [estimated], as the reader does, so a hostile trace costs no more to refuse than to read', () => {
    const doc = clone(base)
    doc.spans.track = Array.from({ length: 5000 }, () => 99)
    for (const key of ['startNs', 'durNs', 'name', 'cat', 'corr']) doc.spans[key] = Array.from({ length: 5000 }, () => 0)
    const found = traceSchema.safeParse(doc)
    expect(found.success).toBe(false)
    expect(found.success ? 0 : found.error.issues.length).toBeLessThanOrEqual(21)
  })
})

describe('where the schema is stricter than the reader', () => {
  const base = JSON.parse(textOf(sampleTrace())) as Json

  const stricter: [string, (doc: Json) => void][] = [
    ['a capture time that is not a UTC date-time', (d) => (d.meta.capturedAt = 'yesterday')],
    ['a capture time with an offset', (d) => (d.meta.capturedAt = '2026-11-09T12:00:00+01:00')],
    ['a capture time on a day that does not exist', (d) => (d.meta.capturedAt = '2026-02-30T12:00:00Z')],
    ['an engine of more than 128 characters', (d) => (d.meta.engine = 'e'.repeat(129))],
    ['a version with a line break', (d) => (d.meta.version = '1.0\n2')],
    ['an empty GPU name', (d) => (d.meta.gpu = '')],
  ]

  for (const [name, mutate] of stricter) {
    test(`${name}: the schema refuses it and the reader reads it`, () => {
      const doc = clone(base)
      mutate(doc)
      expect([name, verdicts(doc)]).toEqual([name, { schema: false, reader: true }])
    })
  }

  test('a capture time in UTC, with or without a fraction, is taken by both', () => {
    for (const at of ['2026-11-09T12:00:00Z', '2026-11-09T12:00:00.123Z', '2024-02-29T23:59:59.999999999Z']) {
      const doc = clone(base)
      doc.meta.capturedAt = at
      expect([at, verdicts(doc)]).toEqual([at, { schema: true, reader: true }])
    }
  })
})

describe('the JSON Schema of the trace', () => {
  const json = z.toJSONSchema(traceSchema, { io: 'input' }) as Json

  test('closes the keys of every object, and bounds the columns the way the reader does', () => {
    expect(json.additionalProperties).toBe(false)
    expect(json.required).toEqual(['schema', 'meta', 'strings', 'tracks', 'spans', 'flows', 'marks'])
    expect(json.properties.spans.required).toEqual(['track', 'startNs', 'durNs', 'name', 'cat', 'corr'])
    expect(json.properties.spans.properties.corr.items).toMatchObject({ type: 'integer', minimum: -1, maximum: 2 ** 31 - 1 })
    expect(json.properties.spans.properties.track.items).toMatchObject({ type: 'integer', minimum: 0, maximum: 2 ** 31 - 1 })
    expect(json.properties.spans.properties.startNs.items).toMatchObject({ type: 'integer', minimum: -(2 ** 53) + 1, maximum: 2 ** 53 - 1 })
    expect(json.properties.meta.required).toEqual(['source', 'synthetic'])
    expect(json.properties.schema.const).toBe(TRACE_SCHEMA)
  })

  test('says in its description what it leaves to the site', () => {
    expect(json.description).toContain('one length')
    expect(json.description).toContain('index into strings')
    expect(json.title).toBe('enginespace/trace@1')
  })
})
