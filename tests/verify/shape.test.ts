/*
 * Review fix of W2's grader track: rule 2 looks at the shape of the text before it parses it (packages/verify/shape.ts, ARCHITECTURE §8.5).
 *
 * Rule 1 bounds the bytes of a bundle, and a text inside the caps can still make `JSON.parse` allocate gigabytes: nested a hundred million deep, or a quarter of
 * a gigabyte of `[],`. A dedicated worker that runs out of memory takes the learner's tab with it (e2e/receipts-import.spec.ts shows the tab alive after both).
 * What is held here:
 *   - the bounds, and the scan on the cases that the grader's `ShapeScan` is also given (tests/fixtures/grader/shape-cases.json, read by
 *     labs/grader/tests/test_bundle.py too), so that the two ends count alike;
 *   - the honest bundles are nowhere near the bounds: they nest 6 or 7 deep and hold some hundreds to a few thousand nodes;
 *   - a text that breaks a bound is refused at rule 2 with the bound in the sentence, and is never given to `JSON.parse`, in `parseBundle` and in the whole check
 *     of a file.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { LIMITS } from '@es/ledger'
import { MAX_COMMAS, MAX_DEPTH, MAX_NODES, PROBLEM_CHARS, RECEIPT_CHARS, SHAPE, parseBundle, scanShape, verifyBundle } from '@es/verify'
import type { Outcome } from '@es/verify'
import { root } from '../ci/support'
import { contextFor, sampleBundle } from './support'
import { replayFixture, traceFixture } from './synthetic'

interface Case {
  readonly name: string
  readonly text: string
  readonly limits: { readonly depth: number; readonly nodes: number; readonly commas: number }
  readonly ok: boolean
  readonly deepest?: number
  readonly nodes?: number
  readonly commas?: number
  readonly reason?: string
}
const cases = (JSON.parse(readFileSync(path.join(root, 'tests/fixtures/grader/shape-cases.json'), 'utf8')) as { spec: string; cases: Case[] }).cases

const fileOfText = (text: string): Blob => new Blob([new Uint8Array(gzipSync(Buffer.from(text)))])
const refusedAtRule2 = (outcome: Outcome): string => {
  if (outcome.kind !== 'refused') throw new Error('the file was taken')
  expect(outcome.rules.map((rule) => `${rule.rule}:${rule.status}`)).toEqual(['1:pass', '2:fail', '3:skipped', '4:skipped', '5:skipped', '6:skipped', '7:skipped', '8:skipped', '9:skipped'])
  return outcome.rules[1].problems[0]
}

describe('the bounds', () => {
  test('are 64 levels and 4,194,304 pieces, which the grader holds as well', () => {
    expect(MAX_DEPTH).toBe(64)
    expect(MAX_NODES).toBe(4 * 1024 * 1024)
    expect(MAX_NODES).toBe(4_194_304)
    expect(MAX_COMMAS).toBe(16_777_216)
    expect(SHAPE).toEqual({ depth: 64, nodes: 4_194_304, commas: 16_777_216 })
    expect(RECEIPT_CHARS).toBe(LIMITS.receiptChars)
  })
})

describe('the scan, on the cases that both ends are given', () => {
  test('reads the file of cases the grader reads, and has more than a few', () => {
    expect(cases.length).toBeGreaterThan(20)
    expect(new Set(cases.map((one) => one.name)).size).toBe(cases.length)
  })

  test.each(cases.map((one) => [one.name, one] as const))('%s', (_name, one) => {
    const found = scanShape(one.text, one.limits)
    if (one.ok) expect(found).toEqual({ ok: true, deepest: one.deepest, nodes: one.nodes, commas: one.commas })
    else expect(found).toMatchObject({ ok: false, reason: one.reason })
  })
})

describe('the scan, beyond the cases', () => {
  test('counts a column of a million integers as no node, and counts their commas', () => {
    const column = `[${'1234567,'.repeat(1_000_000)}0]`
    expect(scanShape(column)).toEqual({ ok: true, deepest: 1, nodes: 1, commas: 1_000_000 })
  })

  test('skips a long string whole, and finds its end by the backslashes before the quote and not by the quote alone', () => {
    const long = `"${'x'.repeat(2_000_000)}\\"${'['.repeat(100)}\\\\"`
    expect(scanShape(`[${long},[1]]`)).toEqual({ ok: true, deepest: 2, nodes: 3, commas: 1 })
  })

  test('refuses 65 levels and takes 64, at the real bound', () => {
    expect(scanShape('['.repeat(64) + ']'.repeat(64))).toMatchObject({ ok: true, deepest: 64 })
    expect(scanShape('['.repeat(65) + ']'.repeat(65))).toMatchObject({ ok: false, reason: 'depth' })
  })

  test.each([
    ['empty arrays', '[]'],
    ['empty objects', '{}'],
    ['empty strings', '""'],
    ['arrays of one number', '[0]'],
    ['objects with a member each', '{"a":0}'],
  ])('refuses a list of %s that is longer than the bound, at the real bound, and takes one that is as long as the bound', (_name, unit) => {
    // Each unit is one piece (the empty strings), or two for an object with a member, or one for an array. Count the pieces by scanning with the real bound.
    const pieces = scanShape(`[${unit}]`) as { ok: true; nodes: number }
    const perUnit = pieces.nodes - 1
    const fits = Math.floor((MAX_NODES - 1) / perUnit)
    expect(scanShape(`[${Array(fits).fill(unit).join(',')}]`)).toMatchObject({ ok: true })
    expect(scanShape(`[${Array(fits + 1).fill(unit).join(',')}]`)).toMatchObject({ ok: false, reason: 'nodes' })
  })

  test('refuses an object with more member names than the bound, one name that nothing else shares each', () => {
    let names = ''
    for (let i = 0; i < 500; i += 1) names += `"k${i}":0,`
    expect(scanShape(`{${names}"z":0}`, { depth: 4, nodes: 500, commas: 1000 })).toMatchObject({ ok: false, reason: 'nodes' })
    expect(scanShape(`{${names}"z":0}`, { depth: 4, nodes: 502, commas: 1000 })).toMatchObject({ ok: true, nodes: 502 })
  })

  test('says which bound, with the number, in a sentence that a report can keep', () => {
    const deep = scanShape('['.repeat(65))
    const wide = scanShape('[' + '[],'.repeat(MAX_NODES) + ']')
    if (deep.ok || wide.ok) throw new Error('a bound was not broken')
    expect(deep.message).toBe("The JSON inside nests more than 64 levels deep, and the site parses at most that [estimated]: a bundle nests about 7. It was not parsed, because the parser's memory grows with the depth.")
    expect(wide.message).toBe(
      "The JSON inside holds more than 4,194,304 arrays, objects and strings (member names included), and the site parses at most that many [estimated]. It was not parsed, because the parser's memory grows with their number.",
    )
    expect(Math.max(deep.message.length, wide.message.length)).toBeLessThanOrEqual(PROBLEM_CHARS)
  })
})

describe('an honest bundle', () => {
  const grader = new TextDecoder().decode(gunzipSync(readFileSync(path.join(root, 'tests/fixtures/grader/sample.es.json.gz'))))
  const texts: [string, string][] = [
    ['the sample', JSON.stringify(sampleBundle())],
    ['the synthetic replay, with its log of 1,264 requests', JSON.stringify(replayFixture().bundle)],
    ['the synthetic trace of 13 steps', JSON.stringify(traceFixture().bundle)],
    ['the bundle that the Python grader wrote', grader],
  ]

  test.each(texts)('%s nests 6 or 7 deep and holds a thousandth of the pieces and a hundredth of the commas the bounds allow, or fewer', (_name, text) => {
    const found = scanShape(text)
    if (!found.ok) throw new Error(found.message)
    expect(found.deepest).toBeGreaterThanOrEqual(6)
    expect(found.deepest).toBeLessThanOrEqual(7)
    expect(found.nodes * 1000).toBeLessThanOrEqual(MAX_NODES)
    expect(found.commas * 100).toBeLessThanOrEqual(MAX_COMMAS)
  })

  test.each(texts)('%s is parsed as it was before the scan', (_name, text) => {
    expect(parseBundle(text).ok).toBe(true)
  })
})

describe('the commas of a text (the second review: a file of numbers inside the caps crashed the tab in the canonical form)', () => {
  test.each([['0,'], ['-0,'], ['1,'], ['true,'], ['null,']])('a column of %s past the bound is refused by the scan, and one at the bound is not', (unit) => {
    const column = (count: number): string => `[${unit.repeat(count)}0]`
    expect(scanShape(column(MAX_COMMAS))).toMatchObject({ ok: true, commas: MAX_COMMAS })
    const over = scanShape(column(MAX_COMMAS + 1))
    expect(over).toMatchObject({ ok: false, reason: 'commas' })
    expect(!over.ok && over.message).toMatch(/^The JSON inside holds more than 16,777,216 commas outside its strings/)
    expect(!over.ok && over.message.length).toBeLessThanOrEqual(PROBLEM_CHARS)
  })

  test('are refused in the whole check of a file, in `ext` and in a JSON artifact, before the parser and the canonical form are given the text', async () => {
    const real = JSON.parse
    let asked = 0
    JSON.parse = ((...args: Parameters<typeof JSON.parse>) => {
      asked += 1
      return real(...args)
    }) as typeof JSON.parse
    try {
      const pad = `[${'-0,'.repeat(MAX_COMMAS + 1)}0]`
      const inExt = JSON.stringify(sampleBundle()).replace('"ext":{"example":true}', `"ext":{"pad":${pad}}`)
      expect(inExt).toContain(pad)
      expect(refusedAtRule2(await verifyBundle(fileOfText(inExt), contextFor()))).toMatch(/^The JSON inside holds more than 16,777,216 commas/)
      const inArtifact = JSON.stringify(traceFixture().bundle).replace('"data":{', `"data":{"pad":${pad},`)
      expect(inArtifact).toContain(pad)
      expect(refusedAtRule2(await verifyBundle(fileOfText(inArtifact), contextFor()))).toMatch(/^The JSON inside holds more than 16,777,216 commas/)
      expect(asked).toBe(0)
    } finally {
      JSON.parse = real
    }
  }, 120_000)

  test('a receipt longer than the ledger keeps is refused at rule 2, and one inside it is taken', () => {
    const text = (pad: string): string => JSON.stringify(sampleBundle()).replace('"ext":{"example":true}', `"ext":{"pad":"${pad}"}`)
    const found = parseBundle(text('x'.repeat(RECEIPT_CHARS)))
    expect(found.ok).toBe(false)
    expect(!found.ok && found.problems[0]).toMatch(/^\/receipt: the receipt is longer than 262,144 characters as JSON/)
    expect(parseBundle(text('x'.repeat(RECEIPT_CHARS - 10_000))).ok).toBe(true)
    const numbers = parseBundle(text('y').replace('"pad":"y"', `"pad":[${'0,'.repeat(RECEIPT_CHARS / 2)}0]`))
    expect(numbers.ok).toBe(false)
  })
})

describe('a text that breaks a bound', () => {
  test('is refused by parseBundle before JSON.parse is asked for anything: a parse of it is what runs a worker out of memory', () => {
    const honest = JSON.stringify(sampleBundle())
    const hostile = ['['.repeat(20_000_000), '[' + '{},'.repeat(MAX_NODES) + '{}]']
    const real = JSON.parse
    let asked = 0
    JSON.parse = ((...args: Parameters<typeof JSON.parse>) => {
      asked += 1
      return real(...args)
    }) as typeof JSON.parse
    try {
      for (const text of hostile) {
        const found = parseBundle(text)
        expect(found.ok).toBe(false)
        expect(!found.ok && found.problems).toHaveLength(1)
      }
      expect(asked).toBe(0)
      expect(parseBundle(honest).ok).toBe(true)
      expect(asked).toBe(1)
    } finally {
      JSON.parse = real
    }
  })

  test('is a refusal of rule 2 in the whole check of a file, with the bound in the report, and the later rules say they did not run', async () => {
    const deep = refusedAtRule2(await verifyBundle(fileOfText('['.repeat(1_000_000) + ']'.repeat(1_000_000)), contextFor()))
    expect(deep).toMatch(/^The JSON inside nests more than 64 levels deep, and the site parses at most that \[estimated\]/)
    const arrays = refusedAtRule2(await verifyBundle(fileOfText('[' + '[],'.repeat(MAX_NODES) + '[]]'), contextFor()))
    expect(arrays).toMatch(/^The JSON inside holds more than 4,194,304 arrays, objects and strings/)
    const objects = refusedAtRule2(await verifyBundle(fileOfText('[' + '{},'.repeat(MAX_NODES) + '{}]'), contextFor()))
    expect(objects).toBe(arrays)
    const strings = refusedAtRule2(await verifyBundle(fileOfText('[' + '"",'.repeat(MAX_NODES) + '""]'), contextFor()))
    expect(strings).toBe(arrays)
  }, 60_000)

  test('inside an otherwise honest receipt is refused the same way: a bundle whose `ext` nests 65 levels deep', async () => {
    const nested = (levels: number): string => '['.repeat(levels) + ']'.repeat(levels)
    const text = JSON.stringify(sampleBundle()).replace('"ext":{"example":true}', `"ext":{"deep":${nested(65)}}`)
    expect(text).toContain(nested(65))
    expect(refusedAtRule2(await verifyBundle(fileOfText(text), contextFor()))).toMatch(/^The JSON inside nests more than 64 levels deep/)
  })

  test('is no longer refused when it is as deep as the bound allows: an `ext` that nests to the 64th level, below the receipt\'s own depth', async () => {
    // The `ext` sits 3 levels down (bundle, receipt, ext), so a list nested 61 deep reaches 64.
    const nested = (levels: number): string => '['.repeat(levels) + ']'.repeat(levels)
    const text = JSON.stringify(sampleBundle()).replace('"ext":{"example":true}', `"ext":{"deep":${nested(61)}}`)
    expect(scanShape(text)).toMatchObject({ ok: true, deepest: 64 })
    expect(parseBundle(text).ok).toBe(true)
  })
})
