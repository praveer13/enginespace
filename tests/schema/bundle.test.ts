/*
 * W2-T01's `bundle@1` (ARCHITECTURE §9.6, D-029): a receipt and the raw artifacts it hashes.
 *
 *   - The artifacts of the bundle are those that the receipt lists with `inBundle: true`, no more and no fewer, and the sample's hashes are honest,
 *     which is what the integrity rule (A§8.5 rule 3) will check against it.
 *   - An artifact travels as json, text or base64, each with the rule that decides what is hashed; base64 is standard base64 with its padding.
 *   - The schema never walks a json artifact's data, so a trace of millions of numbers parses once, and a base64 string of many megabytes is
 *     read in a loop, since a regular expression over that much text can run out of the engine's stack.
 *   - Strictness: keys, encodings, a missing data member, a lone surrogate.
 */
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { BASE64_SOURCE, BUNDLE_ENCODINGS, BUNDLE_SCHEMA_TAG, bundleArtifactSchema, bundleSchema, isStrictBase64 } from '@es/schema/bundle'
import { traceSchema } from '@es/schema/trace'
import { canonicalJson } from '../../packages/sim/core/json'
import { sampleBundle, sampleReceipt, sha256 } from './receipt-support'
import { problems, withKey } from './support'

const sample = sampleBundle()

describe('the sample bundle', () => {
  test('is taken, and its tag is the one the architecture writes', () => {
    expect(bundleSchema.safeParse(sample).success).toBe(true)
    expect(BUNDLE_SCHEMA_TAG).toBe('enginespace/bundle@1')
    expect([...BUNDLE_ENCODINGS]).toEqual(['json', 'text', 'base64'])
  })

  test('has artifacts that hash to what the receipt says, over their canonical bytes', () => {
    for (const entry of sample.receipt.artifacts.filter((artifact) => artifact.inBundle)) {
      const held = sample.artifacts[entry.id]
      const bytes = held.encoding === 'json' ? Buffer.from(canonicalJson(held.data), 'utf8') : held.encoding === 'text' ? Buffer.from(held.data, 'utf8') : Buffer.from(held.data, 'base64')
      expect([entry.id, sha256(bytes), bytes.length]).toEqual([entry.id, entry.sha256, entry.bytes])
    }
  })

  test('holds a trace that the trace schema takes, in a json artifact', () => {
    expect(sample.artifacts.trace.encoding).toBe('json')
    expect(traceSchema.safeParse(sample.artifacts.trace.data).success).toBe(true)
  })

  test('lists an artifact that does not travel, by its hash and size only', () => {
    const kept = sample.receipt.artifacts.filter((artifact) => !artifact.inBundle)
    expect(kept.map((artifact) => artifact.id)).toEqual(['capture'])
    expect(Object.keys(sample.artifacts)).toEqual(['trace', 'log'])
  })
})

describe('the artifacts of the bundle are those that the receipt lists as in it', () => {
  test('an artifact with no data is named at the receipt’s entry', () => {
    const bundle = structuredClone(sample)
    delete bundle.artifacts.log
    expect(problems(bundleSchema, bundle)).toEqual(['receipt.artifacts.1.inBundle: custom'])
  })

  test('data for an artifact that the receipt does not list is named at the artifact', () => {
    const bundle = withKey(sample, ['artifacts', 'extra'], { encoding: 'text', data: 'x' })
    expect(problems(bundleSchema, bundle)).toEqual(['artifacts.extra: custom'])
  })

  test('data for an artifact that the receipt lists as kept is refused too', () => {
    const bundle = withKey(sample, ['artifacts', 'capture'], { encoding: 'base64', data: 'AA==' })
    expect(problems(bundleSchema, bundle)).toEqual(['artifacts.capture: custom'])
  })

  test('a bundle with no artifacts is taken when the receipt lists none as in it', () => {
    const receipt = sampleReceipt()
    receipt.artifacts = receipt.artifacts.map((artifact) => ({ ...artifact, inBundle: false }))
    expect(bundleSchema.safeParse({ schema: BUNDLE_SCHEMA_TAG, receipt, artifacts: {} }).success).toBe(true)
  })

  test('an invalid receipt makes an invalid bundle, with its problem at its place', () => {
    const bundle = withKey(sample, ['receipt', 'lab'], 'tr0.other')
    expect(problems(bundleSchema, bundle)).toEqual(['receipt.lab: custom'])
  })
})

describe('strictness', () => {
  test('an unknown key in the bundle or in an artifact is refused', () => {
    expect(problems(bundleSchema, withKey(sample, ['extra'], 1))).toEqual(['(root): unrecognized_keys[extra]'])
    expect(problems(bundleSchema, withKey(sample, ['artifacts', 'log', 'extra'], 1))).toEqual(['artifacts.log: unrecognized_keys[extra]'])
  })

  test('a wrong tag, a missing receipt and an unknown encoding are refused', () => {
    expect(bundleSchema.safeParse(withKey(sample, ['schema'], 'enginespace/bundle@2')).success).toBe(false)
    expect(bundleSchema.safeParse(withKey(sample, ['receipt'], undefined)).success).toBe(false)
    expect(bundleSchema.safeParse(withKey(sample, ['artifacts', 'log', 'encoding'], 'hex')).success).toBe(false)
    expect(bundleSchema.safeParse(withKey(sample, ['artifacts', 'log'], { data: 'x' })).success).toBe(false)
  })

  test('a json artifact needs its data to be there, and null is data', () => {
    const artifact = (value: object) => bundleArtifactSchema.safeParse(value).success
    expect([artifact({ encoding: 'json' }), artifact({ encoding: 'json', data: null }), artifact({ encoding: 'json', data: [] }), artifact({ encoding: 'json', data: { a: [1, { b: 2 }] } })]).toEqual([false, true, true, true])
  })

  test('a text artifact holds a string without a lone surrogate, which has no UTF-8 form', () => {
    const artifact = (data: unknown) => bundleArtifactSchema.safeParse({ encoding: 'text', data }).success
    expect([artifact(''), artifact('café 日本語 \u{1F600}'), artifact('a\ud800b'), artifact('\udc00'), artifact(5), artifact(null)]).toEqual([true, true, false, false, false, false])
  })

  test('an artifact’s id is a name of lower-case words, so a key like __proto__ is no artifact', () => {
    expect(bundleSchema.safeParse(withKey(sample, ['artifacts', 'Log'], { encoding: 'text', data: '' })).success).toBe(false)
    const hostile = JSON.parse('{"schema":"enginespace/bundle@1","receipt":null,"artifacts":{"__proto__":{"encoding":"text","data":"x"}}}') as unknown
    expect(bundleSchema.safeParse(hostile).success).toBe(false)
    // zod skips a __proto__ key of a record where JSON Schema refuses it. The key never reaches the parsed bundle, and no receipt can list an artifact with that id.
    const parsed = z.record(z.string(), z.number()).parse(JSON.parse('{"__proto__": 1, "a": 2}'))
    expect(Object.keys(parsed)).toEqual(['a'])
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
  })
})

describe('base64', () => {
  const GOOD = ['', 'AA==', 'AAE=', 'AAEC', 'AAECAw==', '+/8=', 'QUJD', 'QUJDRA==', 'QUJDREU=']
  const BAD = ['AAE', 'AA=', 'A===', 'AA==AA==', 'AAEC\n', 'AA EC', '-_8=', 'AA!=', 'AAAAA', 'A', '=', '====', ' AAAA', 'AAAA ', 'AAA=\n', 'AA\u0000A', 'ＡＡＡＡ']

  test('the loop and the pattern of the export agree on every string, good and bad', () => {
    const pattern = new RegExp(BASE64_SOURCE)
    for (const text of [...GOOD, ...BAD]) expect([text, isStrictBase64(text)]).toEqual([text, pattern.test(text)])
    for (const text of GOOD) expect([text, isStrictBase64(text)]).toEqual([text, true])
    for (const text of BAD) expect([text, isStrictBase64(text)]).toEqual([text, false])
  })

  test('the loop and the pattern agree on 2,000 seeded strings [estimated] drawn from the alphabet, the padding and a few strays', () => {
    const pattern = new RegExp(BASE64_SOURCE)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=-_ \n'
    let seed = 12345
    const next = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed
    }
    for (let i = 0; i < 2000; i += 1) {
      const length = next() % 14
      let text = ''
      for (let j = 0; j < length; j += 1) text += alphabet[next() % alphabet.length]
      expect([text, isStrictBase64(text)]).toEqual([text, pattern.test(text)])
    }
  })

  test('takes a string of 40 million characters in a loop, where a regular expression may not', () => {
    const big = 'AAAA'.repeat(10_000_000)
    expect(isStrictBase64(big)).toBe(true)
    expect(bundleArtifactSchema.safeParse({ encoding: 'base64', data: `${big}AA==` }).success).toBe(true)
    expect(bundleArtifactSchema.safeParse({ encoding: 'base64', data: `${big}AA=` }).success).toBe(false)
  })

  test('is refused by the artifact schema when it is not standard base64', () => {
    for (const data of BAD) expect([data, bundleArtifactSchema.safeParse({ encoding: 'base64', data }).success]).toEqual([data, false])
    for (const data of GOOD) expect([data, bundleArtifactSchema.safeParse({ encoding: 'base64', data }).success]).toEqual([data, true])
  })
})
