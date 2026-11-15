/*
 * canonicalJson on a long string (the second review of W2's rest track, finding 1): a string longer than STRING_PIECE is written in pieces, because `JSON.stringify` of a
 * parsed string over 2^27 characters that holds a character outside Latin-1 crashes the pinned Chromium's renderer. The bytes must be the ones `JSON.stringify` writes, for every string.
 */
import { describe, expect, test } from 'bun:test'
import { canonicalJson, STRING_PIECE } from '../../packages/sim/core/json'

const P = STRING_PIECE
const pad = (n: number, c = 'a'): string => c.repeat(n)

const cases: [string, string][] = [
  ['short', 'hello'],
  ['empty', ''],
  ['escapes', '"\\\n\r\t\b\f\u0000\u001f\u007f/'],
  ['non-Latin-1', 'π→日本語'],
  ['exactly a piece', pad(P)],
  ['a piece and one', pad(P + 1)],
  ['two pieces', pad(2 * P, 'π')],
  ['pair across the boundary', pad(P - 1) + '😀' + pad(10)],
  ['pair ending the piece', pad(P - 2) + '😀' + pad(10)],
  ['pair starting the piece', pad(P) + '😀' + pad(10)],
  ['pair at the very end', pad(P + 5) + '😀'],
  ['pairs throughout', '😀'.repeat(P + 3)],
  ['escapes across the boundary', pad(P - 1) + '\n"\\\u0001' + pad(P)],
  ['escapes only', '\n'.repeat(P + 7)],
]

describe('canonicalJson of a long string', () => {
  for (const [name, value] of cases) {
    test(`is JSON.stringify's bytes: ${name}`, () => {
      expect(canonicalJson(value)).toBe(JSON.stringify(value))
      expect(canonicalJson({ [value]: [value] })).toBe(JSON.stringify({ [value]: [value] }))
    })
  }

  test('still refuses a lone surrogate, in a long string, at either end of a piece', () => {
    expect(() => canonicalJson(pad(P) + '\ud83d')).toThrow(/lone surrogate/)
    expect(() => canonicalJson('\ude00' + pad(P))).toThrow(/lone surrogate/)
    expect(() => canonicalJson(pad(P - 1) + '\ud83d' + pad(5))).toThrow(/lone surrogate/)
    expect(() => canonicalJson({ ['\ud83d' + pad(P)]: 1 })).toThrow(/lone surrogate/)
  })

  test('writes 20 MiB of a string with a character outside Latin-1 as one string of the right length', () => {
    const value = 'π' + pad(20 * 1024 * 1024)
    const form = canonicalJson([value])
    expect(form.length).toBe(value.length + 4)
    expect(form.startsWith('["π')).toBe(true)
    expect(form.endsWith('a"]')).toBe(true)
  })
})
