/*
 * W0-T07's acceptance check 1, for claims (ARCHITECTURE §4.4, D-012): the schema rejects unknown keys and takes a claim as
 * §4.4 shapes it. The tests read §4.4 itself, so a key added to the document and not to the schema fails here.
 *
 * One departure from §4.4 is tested as a decision: `source` may be left out of a derived claim and of a synthetic one.
 */
import { describe, expect, test } from 'bun:test'
import { load } from 'js-yaml'
import { CLAIM_TAGS, claimDerivationSchema, claimSchema, claimSourceSchema, claimsFileSchema } from '@es/schema/claims'
import { between, fieldsOf, fixture, keyRoles, objectPaths, problems, read, where, withKey, yaml } from './support'
import type { Path } from './support'

const architecture = read('docs/ARCHITECTURE.md')
const section = between(architecture, '### 4.4 Claims, pins and tags', '**`course.lock.json`**')

const claims = yaml(fixture('claims.yaml')) as Record<string, unknown>[]
const [measured, numeric, derived, synthetic] = claims
/** A claim with every optional key a measured claim may carry. */
const full: Record<string, unknown> = { ...measured, unit: 'flag', synthetic: false }

describe("ARCHITECTURE §4.4's claim", () => {
  const shape = /`(\{id, value[^`]*\})`/.exec(section)?.[1]
  if (shape === undefined) throw new Error('§4.4 no longer shows the claim’s shape')
  const fields = fieldsOf(shape)

  test('the schema has the keys §4.4 lists, and no others', () => {
    // `derived` is on a derived claim, which has none of the measured claim's source.
    expect(fields.map((field) => field.name).sort()).toEqual([...Object.keys(full), 'derived'].sort())
    expect(Object.keys(derived)).toContain('derived')
  })

  test('the keys §4.4 marks optional are optional', () => {
    const optional = fields.filter((field) => field.optional).map((field) => field.name)
    expect(optional.sort()).toEqual(['derived', 'pin', 'synthetic', 'unit'])
    // A measured claim cannot carry `derived`, so that key shows up in the derived claim's roles below.
    expect(keyRoles(claimSchema, full).optional).toEqual(['pin', 'synthetic', 'unit'])
  })

  test('source has the four keys §4.4 lists', () => {
    const detail = fields.find((field) => field.name === 'source')?.detail
    if (detail === undefined) throw new Error('§4.4 gives the claim no source')
    expect(fieldsOf(detail).map((field) => field.name)).toEqual(['url', 'title', 'quote', 'accessed'])
    expect(keyRoles(claimSourceSchema, full.source as object)).toEqual({ required: ['accessed', 'quote', 'title', 'url'], optional: [] })
  })

  test('a derived claim carries formula and inputs', () => {
    expect(section).toContain('`{formula, inputs: [claim ids]}`')
    expect(keyRoles(claimDerivationSchema, derived.derived as object)).toEqual({ required: ['formula', 'inputs'], optional: [] })
  })

  test('the tag is one of the four', () => {
    expect(section).toContain('`tag` is one of `measured`, `derived`, `estimated` or `unverified`')
    expect([...CLAIM_TAGS]).toEqual(['measured', 'derived', 'estimated', 'unverified'])
  })
})

describe('the fixture file', () => {
  test('is a list of valid claims, one of each kind that the architecture names', () => {
    expect(claimsFileSchema.parse(claims)).toEqual(claims as never)
    expect(claims.map((claim) => claim.id)).toEqual([
      'example.engine.async-default',
      'example.engine.step-count',
      'example.engine.double-step-count',
      'example.world.practice-requests',
    ])
    expect(claims.map((claim) => claim.tag)).toEqual(['measured', 'measured', 'derived', 'estimated'])
  })

  test('keeps its dates as strings, which is what the loader’s core schema is for', () => {
    expect(measured.verifiedAt).toBe('2026-11-03')
    expect((measured.source as Record<string, unknown>).accessed).toBe('2026-11-03')
    // js-yaml's default schema would hand over a Date, and the schema refuses one.
    const withDefaultSchema = load('d: 2026-11-03') as { d: unknown }
    expect(withDefaultSchema.d).toBeInstanceOf(Date)
    expect(problems(claimSchema, { ...measured, verifiedAt: withDefaultSchema.d })).toEqual(['verifiedAt: invalid_type'])
  })
})

describe('every claim rejects an unknown key, in every object', () => {
  for (const [name, claim] of [
    ['a measured claim', full],
    ['a claim with a number', numeric],
    ['a derived claim', derived],
    ['a synthetic claim', synthetic],
  ] as const) {
    test(name, () => {
      expect(problems(claimSchema, claim)).toEqual([])
      for (const path of objectPaths(claim)) {
        expect(problems(claimSchema, withKey(claim, [...path, 'zzz'], true))).toEqual([`${where(path)}: unrecognized_keys[zzz]`])
      }
    })
  }

  test('the nested objects are among those checked', () => {
    expect(objectPaths(derived).map(where)).toEqual(['(root)', 'derived'])
    expect(objectPaths(measured).map(where)).toEqual(['(root)', 'source'])
  })
})

describe('which keys are required', () => {
  test('a measured claim needs its id, value, text, tag, source, dates and TTL', () => {
    expect(keyRoles(claimSchema, full).required).toEqual(['id', 'source', 'tag', 'text', 'ttlDays', 'value', 'verifiedAt'])
  })

  test('a derived claim needs its recipe, and no source', () => {
    expect(keyRoles(claimSchema, derived)).toEqual({ required: ['derived', 'id', 'tag', 'text', 'ttlDays', 'value', 'verifiedAt'], optional: ['unit'] })
  })

  test('a synthetic claim needs no source, for as long as it is marked synthetic', () => {
    expect(problems(claimSchema, synthetic)).toEqual([])
    expect(Object.keys(synthetic)).not.toContain('source')
    expect(problems(claimSchema, withKey(synthetic, ['synthetic'], undefined))).toEqual(['source: custom'])
  })

  test('every tag but derived needs the source it was read from, unless the claim is synthetic', () => {
    for (const tag of ['measured', 'estimated', 'unverified']) {
      expect(problems(claimSchema, withKey({ ...measured, tag }, ['source'], undefined))).toEqual(['source: custom'])
    }
    expect(problems(claimSchema, withKey({ ...measured, synthetic: true }, ['source'], undefined))).toEqual([])
    expect(problems(claimSchema, withKey({ ...measured, synthetic: false }, ['source'], undefined))).toEqual(['source: custom'])
  })

  test('the message names the tag', () => {
    const result = claimSchema.safeParse(withKey(measured, ['source'], undefined))
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual(['a measured claim needs the source it was read from'])
  })
})

describe('values', () => {
  const cases: [string, Path, unknown, string[]][] = [
    ['an id in capitals', ['id'], 'Example.Upper', ['id: invalid_format']],
    ['an id of one word', ['id'], 'example', ['id: invalid_format']],
    ['a value that is true', ['value'], true, ['value: invalid_union']],
    ['a value that is null', ['value'], null, ['value: invalid_union']],
    ['a value that is a list', ['value'], [1], ['value: invalid_union']],
    ['a blank value', ['value'], ' ', ['value: invalid_format']],
    ['a value that is infinity', ['value'], Infinity, ['value: invalid_union']],
    ['a blank unit', ['unit'], '', ['unit: invalid_format']],
    ['a blank sentence', ['text'], '', ['text: invalid_format']],
    ['a tag that is not one of the four', ['tag'], 'guessed', ['tag: invalid_value']],
    ['a verification date that does not exist', ['verifiedAt'], '2026-02-30', ['verifiedAt: invalid_format']],
    ['a verification date with a time', ['verifiedAt'], '2026-11-03T00:00:00Z', ['verifiedAt: invalid_format']],
    ['a verification date in the wrong order', ['verifiedAt'], '03-11-2026', ['verifiedAt: invalid_format']],
    ['a TTL of 0', ['ttlDays'], 0, ['ttlDays: too_small']],
    ['a TTL with a fraction', ['ttlDays'], 90.5, ['ttlDays: invalid_type']],
    ['a TTL as text', ['ttlDays'], '90', ['ttlDays: invalid_type']],
    ['a pin in capitals', ['pin'], 'Vllm', ['pin: invalid_format']],
    ['a synthetic flag that is text', ['synthetic'], 'yes', ['synthetic: invalid_type']],
    ['a source that is not http', ['source', 'url'], 'http://example.com/x', ['source.url: invalid_format']],
    ['a source that is a script', ['source', 'url'], 'javascript:alert(1)', ['source.url: invalid_format']],
    ['a source that is a file', ['source', 'url'], 'file:///etc/passwd', ['source.url: invalid_format']],
    ['a source that is no URL', ['source', 'url'], 'example.com/x', ['source.url: invalid_format']],
    ['a source with no title', ['source', 'title'], undefined, ['source.title: invalid_type']],
    ['a source with a blank quote', ['source', 'quote'], '  ', ['source.quote: invalid_format']],
    ['a source read on a day that does not exist', ['source', 'accessed'], '2026-13-01', ['source.accessed: invalid_format']],
  ]
  for (const [name, path, to, expected] of cases) {
    test(`refuses ${name}`, () => expect(problems(claimSchema, withKey(full, path, to))).toEqual(expected))
  }

  test('takes a number or a word as the value', () => {
    for (const value of [0, -3.5, 2100, 'on', 'v0.33.0']) expect(problems(claimSchema, { ...full, value })).toEqual([])
  })

  test('takes a leap day, and refuses a day that is not', () => {
    expect(problems(claimSchema, { ...full, verifiedAt: '2028-02-29' })).toEqual([])
    expect(problems(claimSchema, { ...full, verifiedAt: '2026-02-29' })).toEqual(['verifiedAt: invalid_format'])
  })

  test('a YAML infinity is not a value', () => {
    const loaded = yaml('value: .inf') as { value: number }
    expect(loaded.value).toBe(Infinity)
    expect(problems(claimSchema, { ...full, value: loaded.value })).toEqual(['value: invalid_union'])
  })
})

describe('derived claims', () => {
  const cases: [string, Path, unknown, string[]][] = [
    ['no recipe', ['derived'], undefined, ['derived: custom']],
    ['a blank formula', ['derived', 'formula'], ' ', ['derived.formula: invalid_format']],
    ['no inputs', ['derived', 'inputs'], [], ['derived.inputs: too_small']],
    ['an input named twice', ['derived', 'inputs'], ['example.a', 'example.a'], ['derived.inputs.1: custom']],
    ['an input that is not a claim id', ['derived', 'inputs'], ['Example'], ['derived.inputs.0: invalid_format']],
    ['itself as an input', ['derived', 'inputs'], ['example.engine.double-step-count'], ['derived.inputs: custom']],
  ]
  for (const [name, path, to, expected] of cases) {
    test(`refuses ${name}`, () => expect(problems(claimSchema, withKey(derived, path, to))).toEqual(expected))
  }

  test('refuses a recipe on a claim that is not derived', () => {
    for (const tag of ['measured', 'estimated', 'unverified']) {
      expect(problems(claimSchema, { ...measured, tag, derived: derived.derived })).toEqual(['derived: custom'])
    }
  })

  test('the message names the tag', () => {
    const result = claimSchema.safeParse({ ...measured, derived: derived.derived })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual(['only a derived claim carries derived, and this one is measured'])
  })

  test('takes a source on a derived claim, for the formula’s own reference', () => {
    expect(problems(claimSchema, { ...derived, source: measured.source })).toEqual([])
  })
})

describe('a claims file', () => {
  test('refuses an id defined twice, at the second place', () => {
    expect(problems(claimsFileSchema, [measured, numeric, measured])).toEqual(['2.id: custom'])
  })

  test('takes no claims, and refuses what is not a list', () => {
    expect(problems(claimsFileSchema, [])).toEqual([])
    expect(problems(claimsFileSchema, { claims: [] })).toEqual(['(root): invalid_type'])
    expect(problems(claimsFileSchema, null)).toEqual(['(root): invalid_type'])
  })
})

describe('the invalid fixture', () => {
  test('claims-bad.yaml: one mistake in each claim, and each is named', () => {
    const bad = yaml(fixture('invalid/claims-bad.yaml'))
    expect(problems(claimsFileSchema, bad)).toEqual([
      '0.source: custom',
      '1.derived: custom',
      '2.derived: custom',
      '3.source.url: invalid_format',
      '4.verifiedAt: invalid_format',
      '5.ttlDays: too_small',
      '6.id: invalid_format',
      '7.tag: invalid_value',
      '8: unrecognized_keys[confidence]',
    ])
  })
})
