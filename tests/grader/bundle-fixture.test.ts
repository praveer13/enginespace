/*
 * W2-T02: the bundle that the Python grader's own code wrote (tests/fixtures/grader/sample.es.json.gz, made by labs/grader/tests/fixture.py), read with
 * the browser's primitives, as ARCHITECTURE §8.5 rules 1 to 3 read it: `DecompressionStream('gzip')`, the zod schemas of packages/schema,
 * `canonicalJson` and `crypto`. The Python suite requires the file to be what the grader writes now (labs/grader/tests/test_fixture.py), so the two
 * suites together show that what the grader writes is what the site reads, with neither language needing the other at test time.
 *
 * The file is synthetic: no machine ran it, its machine is invented, and the grader it names is not a published build.
 *
 * This is not the receipt worker. W2-T07 builds `receipt.worker` and `packages/verify` with the caps and the other rules; what is here is the
 * reading of one file by the primitives the worker will use, and the agreement of the two languages on the receipt's identity hash.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bundleSchema } from '@es/schema/bundle'
import type { Bundle } from '@es/schema/bundle'
import { challengeSchema } from '@es/schema/challenge'
import { receiptSchema } from '@es/schema/receipt'
import { canonicalJson } from '../../packages/sim/core/json'
import { root } from '../ci/support'

const FOLDER = 'tests/fixtures/grader'
const sha256 = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex')

/** The text inside a gzip file, read as the worker will read it. */
async function gunzip(compressed: Uint8Array): Promise<string> {
  // A copy, because a Blob part is a view of an ArrayBuffer, and a Node Buffer may be a view of a shared one.
  const stream = new Blob([new Uint8Array(compressed)]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new TextDecoder('utf-8', { fatal: true }).decode(await new Response(stream).arrayBuffer())
}

/** The bytes an artifact is hashed over (A§9.8): the UTF-8 of its canonical JSON, of its text, or what its base64 decodes to. */
function canonicalBytes(artifact: Bundle['artifacts'][string]): Uint8Array {
  if (artifact.encoding === 'json') return Buffer.from(canonicalJson(artifact.data), 'utf8')
  if (artifact.encoding === 'text') return Buffer.from(artifact.data, 'utf8')
  return Buffer.from(artifact.data, 'base64')
}

/** Rule 3: the artifacts whose canonical bytes do not hash to the receipt's entry, or whose size differs, by name. */
function integrityProblems(bundle: Bundle): string[] {
  const problems: string[] = []
  for (const entry of bundle.receipt.artifacts) {
    if (!entry.inBundle) continue
    const bytes = canonicalBytes(bundle.artifacts[entry.id])
    if (sha256(bytes) !== entry.sha256) problems.push(`artifact "${entry.id}": its data hashes to ${sha256(bytes)}, and the receipt lists ${entry.sha256}`)
    if (bytes.length !== entry.bytes) problems.push(`artifact "${entry.id}": its data is ${bytes.length} bytes, and the receipt lists ${entry.bytes}`)
  }
  return problems
}

const compressed = readFileSync(path.join(root, FOLDER, 'sample.es.json.gz'))
const expected = JSON.parse(readFileSync(path.join(root, FOLDER, 'sample.expected.json'), 'utf8')) as {
  receiptSha256: string
  artifactsInBundle: string[]
  artifactsKept: string[]
}
const text = await gunzip(compressed)
const document: unknown = JSON.parse(text)

describe('the bundle that the Python grader wrote', () => {
  test('is one gzip member that the native DecompressionStream reads, as UTF-8 JSON, and is small', () => {
    expect([...compressed.subarray(0, 4)]).toEqual([0x1f, 0x8b, 0x08, 0x00])
    expect(compressed.length).toBeLessThan(10_000)
    expect(text.length).toBeGreaterThan(compressed.length)
    expect(text.startsWith('{"schema":"enginespace/bundle@1","receipt":{')).toBe(true)
  })

  test('passes rule 2: the strict bundle schema and the receipt schema of packages/schema, and the challenge as the receipt records it', () => {
    const parsed = bundleSchema.safeParse(document)
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join('/')}: ${issue.message}`)).toEqual([])
    expect(receiptSchema.safeParse((document as Bundle).receipt).success).toBe(true)
    expect(challengeSchema.safeParse((document as Bundle).receipt.challenge).success).toBe(true)
  })

  test('passes rule 3: every artifact that travels hashes, over its canonical bytes, to the receipt\'s entry, in each of the encodings it uses', () => {
    const bundle = bundleSchema.parse(document)
    expect(integrityProblems(bundle)).toEqual([])
    expect(Object.keys(bundle.artifacts)).toEqual(expected.artifactsInBundle)
    expect(bundle.receipt.artifacts.filter((entry) => !entry.inBundle).map((entry) => entry.id)).toEqual(expected.artifactsKept)
    // The two that travel are a trace (JSON, in columns) and a log (text with a Windows line ending and an accented letter): the forms that differ most between the languages.
    expect(Object.values(bundle.artifacts).map((artifact) => artifact.encoding)).toEqual(['json', 'text'])
    expect(canonicalBytes(bundle.artifacts.log).includes(0x0d)).toBe(true)
  })

  test('has the receipt identity that the Python grader computed: the SHA-256 of the receipt\'s canonical JSON, the same in both languages', () => {
    const bundle = bundleSchema.parse(document)
    expect(sha256(canonicalJson(bundle.receipt))).toBe(expected.receiptSha256)
  })

  test('has a canonical text that does not depend on the order of the keys in the file: the receipt with every object\'s keys reversed is the same text', () => {
    const bundle = bundleSchema.parse(document)
    const reversed = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reversed)
        : value !== null && typeof value === 'object'
          ? Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reversed(inner)]))
          : value
    const flipped = reversed(bundle.receipt)
    expect(JSON.stringify(flipped)).not.toBe(JSON.stringify(bundle.receipt))
    expect(canonicalJson(flipped)).toBe(canonicalJson(bundle.receipt))
  })

  test('is rejected by rule 3 when one artifact\'s hash is changed, and the message names the artifact', () => {
    const bundle = bundleSchema.parse(document)
    const tampered = structuredClone(bundle)
    const entry = tampered.receipt.artifacts.find((artifact) => artifact.id === 'log')
    if (entry === undefined) throw new Error('the fixture has no log artifact')
    entry.sha256 = '0'.repeat(64)
    expect(integrityProblems(tampered)).toEqual([expect.stringContaining('artifact "log"')])
    expect(integrityProblems(tampered)[0]).toContain(sha256(canonicalBytes(bundle.artifacts.log)))
    // The schema cannot see it: the file is well formed, and only the hash is wrong.
    expect(bundleSchema.safeParse(tampered).success).toBe(true)
  })

  test('is rejected by rule 3 when one artifact\'s data is changed and its hash is not', () => {
    const bundle = bundleSchema.parse(document)
    const edited = structuredClone(bundle)
    edited.artifacts.log = { encoding: 'text', data: `${(bundle.artifacts.log as { data: string }).data}one more line\n` }
    expect(integrityProblems(edited)).toEqual([expect.stringContaining('artifact "log"'), expect.stringContaining('artifact "log"')])
  })

  test('is synthetic, names no published build, and holds no local path, address or name of a person or a session', () => {
    const bundle = bundleSchema.parse(document)
    expect(bundle.receipt.notes).toContain('Synthetic')
    expect(bundle.receipt.grader).toEqual({ name: 'enginespace-grader', version: '0.0.0', sourceSha256: sha256('enginespace-grader test fixture: not a published build') })
    expect(bundle.receipt.environment.host.os).toBe('Example Linux 1.0')
    // Built from pieces, so that this file does not hold them either. The public repository's sweep cannot read inside a gzip file, so this does.
    for (const needle of [['/ho', 'me/'], ['/Us', 'ers/'], ['/tm', 'p/'], ['cla', 'ude'], ['C:', '\\\\']].map((pieces) => pieces.join(''))) {
      expect([needle, text.includes(needle)]).toEqual([needle, false])
    }
    expect(text).not.toMatch(/[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/)
  })
})
