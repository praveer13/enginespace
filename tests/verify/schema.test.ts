/*
 * W2-T07, rule 2 of ARCHITECTURE §8.5: the schema. The text inside the file must be a `bundle@1` with a `receipt@1` in it, strictly: an unknown
 * top-level field is refused, `ext` is ignored, and the rules that JSON Schema cannot say are the schema's refinements. A problem names its
 * place in the way the grader names it (`/receipt/pins/onPin`), and there are only a few of them.
 *
 * The schemas themselves are W2-T01's and have tests of their own (tests/schema/). What is held here is the rule: what it refuses, what it says,
 * and the one thing it adds, that the receipt has a canonical form, because its identity is the SHA-256 of that text.
 */
import { describe, expect, test } from 'bun:test'
import { PROBLEMS_SHOWN, PROBLEM_CHARS, parseBundle, pointer } from '@es/verify'
import { canonicalJson } from '../../packages/sim/core/json'
import { changed, sampleBundle } from './support'

const text = (value: unknown): string => JSON.stringify(value)
const failed = (source: string): readonly string[] => {
  const found = parseBundle(source)
  if (found.ok) throw new Error('the text was taken')
  return found.problems
}

describe('a bundle that the schema takes', () => {
  test('is the sample, and comes back with the receipt\'s canonical text, which is its identity', () => {
    const sample = sampleBundle()
    const found = parseBundle(text(sample))
    expect(found.ok).toBe(true)
    if (found.ok) {
      expect(found.bundle).toEqual(sample)
      expect(found.canonicalReceipt).toBe(canonicalJson(sample.receipt))
    }
  })

  test('does not mind the order of keys: the canonical text is the same', () => {
    const sample = sampleBundle()
    const reversed = JSON.parse(text(sample), (_key, value: unknown) =>
      value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value,
    ) as unknown
    const found = parseBundle(text(reversed))
    expect(found.ok && found.canonicalReceipt === canonicalJson(sample.receipt)).toBe(true)
  })

  test('ignores `ext`, which takes any key, and the claimed summary of a performance run', () => {
    const bundle = changed((b) => {
      b.receipt.ext = { anything: { at: ['all'] }, number: 1.5 }
      if (b.receipt.performance !== undefined) b.receipt.performance.claimed = { whatever: 'the grader said', nested: { deep: [1, 2, 3] } }
    })
    expect(parseBundle(text(bundle)).ok).toBe(true)
  })
})

describe('a file that is not a bundle', () => {
  test('is not JSON: the problem says so, and quotes little of the text it stopped at', () => {
    const [problem, ...rest] = failed('{"schema": "enginespace/bundle@1", oops')
    expect(rest).toEqual([])
    expect(problem).toMatch(/^The text inside is not JSON: /)
    expect(problem.length).toBeLessThan(200)
    expect(failed('')[0]).toMatch(/^The text inside is not JSON/)
  })

  test('is JSON of another shape: a number, a list, null', () => {
    for (const source of ['42', '[]', 'null', '"enginespace/bundle@1"']) expect(failed(source)).toEqual([expect.stringMatching(/^\(the file\): /)])
  })

  test('has another format\'s tag: the site reads the formats it knows', () => {
    const [problem] = failed(text({ ...sampleBundle(), schema: 'enginespace/bundle@2' }))
    expect(problem).toMatch(/^\/schema: /)
  })

  test('has a field the schema does not name, at the top and anywhere below: unknown top-level fields are rejected', () => {
    const top = failed(text({ ...sampleBundle(), verdict: 'gpu-verified' }))
    expect(top).toEqual([expect.stringMatching(/^\(the file\): .*verdict/)])
    const inner = changed((b) => {
      Object.assign(b.receipt, { hostname: 'example-host' })
    })
    expect(failed(text(inner))).toEqual(['/receipt: Unrecognized key: "hostname"'])
  })

  test('has a receipt that breaks one of the rules JSON Schema cannot say, and the problem names the place', () => {
    const wrongLab = changed((b) => {
      b.receipt.lab = 'tr8.replay'
    })
    expect(failed(text(wrongLab))).toEqual(['/receipt/lab: must be the lab of the stage, tr3.profile'])
    const wrongPin = changed((b) => {
      b.receipt.pins.onPin = false
    })
    expect(failed(text(wrongPin))).toEqual(['/receipt/pins/onPin: must be true exactly when offPin is empty'])
    const twice = changed((b) => {
      b.receipt.checks.push({ ...b.receipt.checks[0] })
    })
    expect(failed(text(twice))).toEqual(['/receipt/checks/3/id: check "agreement" is listed twice'])
  })

  test('has an artifact whose data is not in the bundle, or data the receipt does not list', () => {
    const missing = changed((b) => {
      delete b.artifacts.log
    })
    expect(failed(text(missing))).toEqual([expect.stringMatching(/^\/receipt\/artifacts\/1\/inBundle: /)])
    const extra = changed((b) => {
      b.artifacts.extra = { encoding: 'text', data: 'x' }
    })
    expect(failed(text(extra))).toEqual([expect.stringMatching(/^\/artifacts\/extra: /)])
  })

  test('has a field of the wrong kind, a malformed hash, or a token that is not a token', () => {
    const hash = changed((b) => {
      b.receipt.grader.sourceSha256 = 'abc'
    })
    expect(failed(text(hash))).toEqual([expect.stringMatching(/^\/receipt\/grader\/sourceSha256: /)])
    const token = changed((b) => {
      b.receipt.challenge.token = 'es1:tr3.profile.s2:0badc0de:ABCDEFGHJKLMNPQR:20261104:00000000'
    })
    expect(failed(text(token))[0]).toMatch(/^\/receipt\/challenge\/token: /)
  })

  test('says only the first few problems, and counts the rest', () => {
    const many = changed((b) => {
      b.receipt.checks = Array.from({ length: 20 }, (_, at) => ({ id: 'dup', kind: 'property' as const, pass: true, detail: String(at) }))
    })
    const problems = failed(text(many))
    expect(problems).toHaveLength(PROBLEMS_SHOWN + 1)
    expect(problems.at(-1)).toMatch(/^And \d+ more problems?\.$/)
  })

  test('cuts a name from the file before it quotes it, so that one hostile key cannot fill the page', () => {
    const long = 'k'.repeat(5000)
    const hostile = changed((b) => {
      Object.assign(b.artifacts, { [long]: { encoding: 'text', data: 'x' } })
    })
    const [problem] = failed(text(hostile))
    expect(problem.length).toBeLessThanOrEqual(PROBLEM_CHARS)
    expect(problem).not.toContain(long)
    expect(pointer(['artifacts', long, 'data']).length).toBeLessThan(80)
  })
})

describe('a receipt that has no canonical form', () => {
  test('cannot be identified, and the problem names where: a number beyond 2^53 in `ext`, which the schema leaves open', () => {
    const source = text(sampleBundle()).replace('"ext":{"example":true}', '"ext":{"big":12345678901234567890}')
    expect(source).toContain('12345678901234567890')
    const [problem] = failed(source)
    expect(problem).toMatch(/^\/receipt: the receipt has no canonical form, so it cannot be identified: .*ext\.big/)
  })

  test('is also the claimed summary with such a number in it', () => {
    const source = text(sampleBundle()).replace('"claimed":{"steps":2', '"claimed":{"steps":9007199254740993')
    expect(source).toContain('9007199254740993')
    expect(failed(source)[0]).toMatch(/no canonical form/)
  })

  test('is a receipt nested deeper than the stack: it says so, in a sentence, and does not throw', () => {
    let deep = ''
    for (let i = 0; i < 20_000; i += 1) deep += '['
    for (let i = 0; i < 20_000; i += 1) deep += ']'
    const source = text(sampleBundle()).replace('"ext":{"example":true}', `"ext":{"deep":${deep}}`)
    const [problem] = failed(source)
    expect(problem).toMatch(/^\/receipt: the receipt has no canonical form/)
  })
})
