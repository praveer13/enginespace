/*
 * W2-T07, rule 3 of ARCHITECTURE §8.5: integrity. The SHA-256 of every artifact's canonical bytes, and their count, must equal the receipt's
 * entry, and a problem names the artifact. A tampered hash fails (the task's second check).
 *
 *   - The sample is honest: both artifacts that travel hash to what the receipt lists, and the one that stays with the learner is not looked at.
 *   - A hash that was changed, data that was edited, a size that was changed: each is a problem that names the artifact and gives both digests.
 *   - Each encoding is hashed over its canonical bytes: JSON as its canonical text, text as UTF-8 with its line endings as they are, base64 as the
 *     bytes it decodes to. The grader's port computes the same bytes, and the vectors of schemas/vectors/sha256.json hold a case of each.
 *   - Integrity is not authenticity: a bundle whose receipt was re-signed after an edit passes this rule, and A§8.5 rule 8 is what catches it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bundleArtifactSchema, bundleSchema } from '@es/schema/bundle'
import type { BundleArtifact } from '@es/schema/bundle'
import { canonicalBytes, checkIntegrity, decodeBase64, PROBLEMS_SHOWN, sha256Hex, toHex } from '@es/verify'
import { root } from '../ci/support'
import { changed, resigned, sampleBundle, sha256 } from './support'

const entryOf = (bundle: ReturnType<typeof sampleBundle>, id: string) => {
  const entry = bundle.receipt.artifacts.find((artifact) => artifact.id === id)
  if (entry === undefined) throw new Error(`no artifact ${id}`)
  return entry
}

describe('the honest sample', () => {
  test('passes: the artifacts that travel are hashed, and the one that stays with the learner is counted and not looked at', async () => {
    expect(await checkIntegrity(sampleBundle())).toEqual({ problems: [], hashed: 2, kept: 1 })
  })
})

describe('a tampered hash', () => {
  test('is a problem that names the artifact and gives the digest of its data beside the one the receipt lists', async () => {
    const bundle = changed((b) => {
      entryOf(b, 'log').sha256 = '0'.repeat(64)
    })
    const real = sha256(Buffer.from((sampleBundle().artifacts.log as { data: string }).data, 'utf8'))
    const found = await checkIntegrity(bundle)
    expect(found.problems).toEqual([`Artifact "log": its data in the bundle hashes to ${real}, and the receipt lists ${'0'.repeat(64)}.`])
  })

  test('in the trace names the trace, and leaves the log alone', async () => {
    const bundle = changed((b) => {
      entryOf(b, 'trace').sha256 = 'f'.repeat(64)
    })
    const found = await checkIntegrity(bundle)
    expect(found.problems).toHaveLength(1)
    expect(found.problems[0]).toContain('Artifact "trace"')
  })

  test('is seen through the schema\'s eyes as a well-formed bundle: only the hash can say it is wrong', () => {
    const bundle = changed((b) => {
      entryOf(b, 'log').sha256 = '0'.repeat(64)
    })
    expect(bundleSchema.safeParse(bundle).success).toBe(true)
  })
})

describe('an artifact that was edited after the run', () => {
  test('is a problem of its hash and of its size: the receipt lists what the data was', async () => {
    const bundle = changed((b) => {
      b.artifacts.log = { encoding: 'text', data: `${(b.artifacts.log as { data: string }).data}one more line\n` }
    })
    const found = await checkIntegrity(bundle)
    expect(found.problems).toHaveLength(2)
    expect(found.problems[0]).toMatch(/^Artifact "log": its data in the bundle hashes to [0-9a-f]{64}, and the receipt lists [0-9a-f]{64}\.$/)
    expect(found.problems[1]).toBe(`Artifact "log": its data in the bundle is 35 bytes, and the receipt lists 21.`)
  })

  test('with only its size changed in the receipt is a problem of the size alone', async () => {
    const bundle = changed((b) => {
      entryOf(b, 'log').bytes += 1
    })
    expect((await checkIntegrity(bundle)).problems).toEqual(['Artifact "log": its data in the bundle is 21 bytes, and the receipt lists 22.'])
  })

  test('is a problem when one edit to the trace changes one number', async () => {
    const bundle = changed((b) => {
      const trace = b.artifacts.trace.data as { spans: { durNs: number[] } }
      trace.spans.durNs[0] -= 1
    })
    const found = await checkIntegrity(bundle)
    expect(found.problems).toHaveLength(1)
    expect(found.problems[0]).toContain('Artifact "trace": its data in the bundle hashes to')
  })

  test('passes again once the receipt is re-signed, which is why recomputation exists (rule 8)', async () => {
    const bundle = resigned(
      changed((b) => {
        const trace = b.artifacts.trace.data as { spans: { durNs: number[] } }
        trace.spans.durNs[0] -= 1
      }),
    )
    expect(await checkIntegrity(bundle)).toEqual({ problems: [], hashed: 2, kept: 1 })
  })
})

describe('an artifact in each encoding', () => {
  /** The sample with a binary artifact added in base64, honest. */
  const withBinary = (bytes: Uint8Array) =>
    resigned(
      changed((b) => {
        b.receipt.artifacts.push({ id: 'blob', kind: 'outputs', format: 'binary', sha256: '', bytes: 0, inBundle: true })
        b.artifacts.blob = { encoding: 'base64', data: Buffer.from(bytes).toString('base64') }
      }),
    )

  test('base64 is hashed as the bytes it decodes to', async () => {
    const bytes = Uint8Array.from({ length: 1000 }, (_, at) => (at * 7 + 3) & 0xff)
    expect(await checkIntegrity(withBinary(bytes))).toEqual({ problems: [], hashed: 3, kept: 1 })
  })

  test('base64 whose bytes were changed is a problem of the artifact', async () => {
    const bundle = withBinary(Uint8Array.of(1, 2, 3, 4, 5))
    bundle.artifacts.blob = { encoding: 'base64', data: Buffer.from(Uint8Array.of(1, 2, 3, 4, 6)).toString('base64') }
    expect((await checkIntegrity(bundle)).problems).toEqual([expect.stringContaining('Artifact "blob": its data in the bundle hashes to')])
  })

  test('text keeps its line endings as they are: a Windows line ending is part of the bytes', async () => {
    const bundle = resigned(
      changed((b) => {
        b.artifacts.log = { encoding: 'text', data: 'a\r\nb\r\n' }
      }),
    )
    expect(entryOf(bundle, 'log')).toMatchObject({ bytes: 6, sha256: sha256('a\r\nb\r\n') })
    expect((await checkIntegrity(bundle)).problems).toEqual([])
    bundle.artifacts.log = { encoding: 'text', data: 'a\nb\n' }
    expect((await checkIntegrity(bundle)).problems).toHaveLength(2)
  })

  test('text is hashed as UTF-8: an accented letter is two bytes, a character outside the plane is four', async () => {
    const bundle = resigned(
      changed((b) => {
        b.artifacts.log = { encoding: 'text', data: 'café \u{1f600}' }
      }),
    )
    expect(entryOf(bundle, 'log').bytes).toBe(10)
    expect((await checkIntegrity(bundle)).problems).toEqual([])
  })

  test('JSON is hashed as its canonical text: the same value with its keys in another order is the same artifact', async () => {
    const bundle = changed((b) => {
      const trace = b.artifacts.trace.data as Record<string, unknown>
      b.artifacts.trace = { encoding: 'json', data: Object.fromEntries(Object.entries(trace).reverse()) }
    })
    expect(await checkIntegrity(bundle)).toEqual({ problems: [], hashed: 2, kept: 1 })
  })

  test('JSON that has no canonical form is a problem of the artifact, with the place in it: a whole number beyond 2^53', async () => {
    const bundle = changed((b) => {
      b.artifacts.trace = { encoding: 'json', data: { n: 2 ** 60 } }
    })
    const found = await checkIntegrity(bundle)
    expect(found.problems).toEqual([expect.stringMatching(/^Artifact "trace": its data has no canonical bytes to hash \(\$\.n: the integer .* is beyond 2\^53\)\.$/)])
  })
})

describe('many problems', () => {
  test('are cut to the first few, with a count of the rest', async () => {
    const bundle = changed((b) => {
      b.receipt.artifacts = []
      for (let at = 0; at < 20; at += 1) {
        b.receipt.artifacts.push({ id: `part-${at}`, kind: 'log', format: 'text', sha256: '0'.repeat(64), bytes: 1, inBundle: true })
        b.artifacts[`part-${at}`] = { encoding: 'text', data: 'x' }
      }
      delete b.artifacts.trace
      delete b.artifacts.log
    })
    const found = await checkIntegrity(bundle)
    expect(found.problems).toHaveLength(PROBLEMS_SHOWN + 1)
    expect(found.problems.at(-1)).toBe('And 14 more problems.')
    expect(found.hashed).toBe(20)
  })
})

describe('the primitives', () => {
  test('SHA-256 is the browser\'s, in lower-case hex, and base64 decodes in every padding', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    for (const length of [0, 1, 2, 3, 4, 5, 6, 7, 100, 4093]) {
      const bytes = Uint8Array.from({ length }, (_, at) => (at * 31 + 7) & 0xff)
      expect(toHex(decodeBase64(Buffer.from(bytes).toString('base64')))).toBe(toHex(bytes))
    }
  })

  test('the vectors of schemas/vectors/sha256.json hash as the file says: the SHA-256 of bytes, and the canonical bytes of an artifact in each encoding', async () => {
    interface Vector {
      id: string
      fn: 'sha256' | 'artifact'
      hex?: string
      repeat?: { byteHex: string; times: number }
      sha256?: string
      encoding?: 'json' | 'text' | 'base64'
      data?: unknown
      bytes?: number
      error?: boolean
    }
    const { vectors } = JSON.parse(readFileSync(path.join(root, 'schemas/vectors/sha256.json'), 'utf8')) as { vectors: Vector[] }
    let hashes = 0
    let artifacts = 0
    let refused = 0
    for (const vector of vectors) {
      if (vector.fn === 'sha256') {
        const bytes = vector.repeat === undefined ? Buffer.from(vector.hex ?? '', 'hex') : Buffer.alloc(vector.repeat.times, Buffer.from(vector.repeat.byteHex, 'hex'))
        expect([vector.id, await sha256Hex(new Uint8Array(bytes))]).toEqual([vector.id, vector.sha256])
        hashes += 1
        continue
      }
      const artifact = { encoding: vector.encoding, data: vector.data } as BundleArtifact
      if (vector.error === true) {
        // An artifact with no canonical bytes is stopped by the schema (a base64 string that is not standard base64, a lone surrogate in text) or
        // by the bytes themselves (JSON that has no canonical form), at rule 2 or at rule 3.
        let stopped = !bundleArtifactSchema.safeParse(artifact).success
        if (!stopped) {
          try {
            canonicalBytes(artifact)
          } catch {
            stopped = true
          }
        }
        expect([vector.id, stopped]).toEqual([vector.id, true])
        refused += 1
        continue
      }
      expect(bundleArtifactSchema.safeParse(artifact).success, vector.id).toBe(true)
      const bytes = canonicalBytes(artifact)
      expect([vector.id, bytes.byteLength, await sha256Hex(bytes)]).toEqual([vector.id, vector.bytes, vector.sha256])
      artifacts += 1
    }
    // The file's own counts, so that a vector that the loop skipped by its shape would show.
    expect([hashes, artifacts + refused]).toEqual([29, 32])
    expect(refused).toBeGreaterThanOrEqual(10)
  })
})
