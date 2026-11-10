/*
 * W2-T07, rule 1 of ARCHITECTURE §8.5: the caps. A bundle is at most 32 MB as a file and 256 MB inside it [estimated], the second counted while
 * the file is decompressed with `DecompressionStream('gzip')`, so that a zip bomb stops at the cap and ends in a message.
 *
 *   - An oversized file is refused by its size, before any of it is read. The fixture is generated here and never committed.
 *   - A zip bomb is generated here too. A deflate stream holds at most about 1,030 bytes of output for each byte it takes, so a bomb of the real
 *     cap is about 260 KB [measured 2026-11-09 with Bun 1.3.14's zlib: 300 MB of zeros gzip to 305,799 bytes], made in memory in a moment; a bomb
 *     of a few KB is a bomb of a smaller cap, which the same function takes as a parameter.
 *   - What is not a gzip stream, is cut short, or has junk after it is refused with a message that says so; text that is not UTF-8 or starts with a
 *     byte order mark is refused as the grader's reader refuses it.
 *   - The caps are the grader's: the writer (labs/grader/src/enginespace_grader/bundle.py) and this reader hold one pair of numbers.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { CAPS, MAX_COMPRESSED_BYTES, MAX_DECOMPRESSED_BYTES, readBundle } from '@es/verify'
import { read, root } from '../ci/support'

const blob = (bytes: Uint8Array): Blob => new Blob([new Uint8Array(bytes)])
const gz = (text: string | Uint8Array): Blob => blob(gzipSync(typeof text === 'string' ? Buffer.from(text, 'utf8') : text))
const MIB = 1024 * 1024

describe('the caps', () => {
  test('are 32 MB and 256 MB, in mebibytes as the grader writes them, and the grader holds the same two', () => {
    expect(MAX_COMPRESSED_BYTES).toBe(32 * MIB)
    expect(MAX_DECOMPRESSED_BYTES).toBe(256 * MIB)
    expect(CAPS).toEqual({ compressedBytes: 32 * MIB, decompressedBytes: 256 * MIB })
    const python = read('labs/grader/src/enginespace_grader/bundle.py')
    expect(python).toContain('MAX_COMPRESSED_BYTES = 32 * 1024 * 1024')
    expect(python).toContain('MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024')
  })

  test('are ARCHITECTURE §8.5 rule 1\'s, which calls them estimates', () => {
    expect(read('docs/ARCHITECTURE.md')).toMatch(/Compressed ≤ 32 MB and decompressed ≤ 256 MB \[estimated\]/)
  })
})

describe('a file within the caps', () => {
  test('is read: its text, and the two sizes that the rule counted', async () => {
    const file = gz('{"a":1}')
    expect(await readBundle(file)).toEqual({ ok: true, text: '{"a":1}', sizes: { compressedBytes: file.size, decompressedBytes: 7 } })
  })

  test('is read when it is the Python grader\'s own file', async () => {
    const bytes = readFileSync(path.join(root, 'tests/fixtures/grader/sample.es.json.gz'))
    const found = await readBundle(blob(bytes))
    expect(found.ok).toBe(true)
    if (found.ok) expect(found.text.startsWith('{"schema":"enginespace/bundle@1","receipt":{')).toBe(true)
  })

  test('is read whole when it is a stream of many chunks, with an accented letter that a chunk may split', async () => {
    const text = JSON.stringify({ log: 'café \u{1f600} '.repeat(200_000) })
    const found = await readBundle(gz(text))
    expect(found.ok && found.text === text).toBe(true)
  })
})

describe('an oversized file', () => {
  test('is refused by its size before any of it is read, with the size and the cap in the message', async () => {
    // 32 MiB and one byte of zeros: never compressed, never read. The size is the file's metadata.
    const found = await readBundle(blob(new Uint8Array(MAX_COMPRESSED_BYTES + 1)))
    expect(found).toEqual({
      ok: false,
      rule: 1,
      message: 'The file is 33,554,433 bytes, and the site reads at most 33,554,432 compressed (the cap of rule 1).',
      sizes: { compressedBytes: MAX_COMPRESSED_BYTES + 1 },
    })
  })

  test('is refused at a smaller cap too, and a file of exactly the cap is not oversized', async () => {
    const caps = { compressedBytes: 100, decompressedBytes: MIB }
    const small = gz('{"a":1}')
    expect(small.size).toBeLessThan(100)
    expect((await readBundle(small, caps)).ok).toBe(true)
    const big = blob(new Uint8Array(101))
    expect(await readBundle(big, caps)).toMatchObject({ ok: false, rule: 1 })
    // A file of exactly the cap: it is not gzip, and that is what it is told, not that it is too big.
    expect(await readBundle(blob(new Uint8Array(100)), caps)).toMatchObject({ ok: false, rule: 1, message: expect.stringContaining('not a gzip file') })
  })
})

describe('a zip bomb', () => {
  test('of the real cap is generated here, is a few hundred KB, and stops at the cap in a moment, with a message', async () => {
    const bomb = gzipSync(Buffer.alloc(MAX_DECOMPRESSED_BYTES + 32 * MIB))
    expect(bomb.length).toBeLessThan(400_000)
    const started = performance.now()
    const found = await readBundle(blob(bomb))
    expect(found).toEqual({
      ok: false,
      rule: 1,
      message: 'It holds more than the 268,435,456 bytes that the site reads once decompressed (the cap of rule 1), so it stopped there.',
      sizes: { compressedBytes: bomb.length, decompressedBytes: MAX_DECOMPRESSED_BYTES },
    })
    // It did not inflate what came after the cap: reading 256 MB of zeros took about 0.2 s here, and 300 MB would take longer.
    expect(performance.now() - started).toBeLessThan(10_000)
  })

  test('of a smaller cap is a few KB, for the same reason', async () => {
    const caps = { compressedBytes: MIB, decompressedBytes: MIB }
    const bomb = gzipSync(Buffer.alloc(8 * MIB))
    expect(bomb.length).toBeLessThan(10_000)
    expect(await readBundle(blob(bomb), caps)).toMatchObject({ ok: false, rule: 1, message: expect.stringContaining('1,048,576 bytes that the site reads once decompressed') })
  })

  test('is told apart by what is inside, and not by the ratio: a file of exactly the cap inside is read', async () => {
    const caps = { compressedBytes: MIB, decompressedBytes: 4096 }
    expect((await readBundle(gz(' '.repeat(4096)), caps)).ok).toBe(true)
    expect((await readBundle(gz(' '.repeat(4097)), caps)).ok).toBe(false)
  })
})

describe('a file that is not a bundle the browser can read', () => {
  const NOT_GZIP = 'It is not a gzip file: a bundle is a .es.json.gz file, as `enginespace grade` writes it.'

  test('plain text, an empty file and a one-byte file are not gzip, and are told so', async () => {
    expect(await readBundle(blob(Buffer.from('{"schema":"enginespace/bundle@1"}')))).toMatchObject({ ok: false, rule: 1, message: NOT_GZIP })
    expect(await readBundle(blob(new Uint8Array(0)))).toMatchObject({ ok: false, rule: 1, message: NOT_GZIP })
    expect(await readBundle(blob(Uint8Array.of(0x1f)))).toMatchObject({ ok: false, rule: 1, message: NOT_GZIP })
  })

  test('a gzip stream that is cut short is damaged, and says so', async () => {
    const whole = gzipSync(Buffer.from(JSON.stringify({ log: 'x'.repeat(10_000) })))
    for (const cut of [whole.length - 1, whole.length - 8, Math.floor(whole.length / 2), 12]) {
      expect(await readBundle(blob(whole.subarray(0, cut)))).toMatchObject({ ok: false, rule: 1, message: 'The gzip data is damaged or cut short, so it cannot be read.' })
    }
  })

  test('a gzip stream with junk after its end is damaged', async () => {
    const whole = gzipSync(Buffer.from('{"a":1}'))
    expect(await readBundle(blob(Buffer.concat([whole, Buffer.from('junk after the end')])))).toMatchObject({ ok: false, rule: 1, message: expect.stringContaining('damaged') })
  })

  test('gzip with bytes flipped inside is damaged', async () => {
    const whole = Buffer.from(gzipSync(Buffer.from(JSON.stringify({ log: 'abc'.repeat(5000) }))))
    whole[whole.length - 12] ^= 0xff
    expect(await readBundle(blob(whole))).toMatchObject({ ok: false, rule: 1, message: expect.stringContaining('damaged') })
  })

  test('text that is not UTF-8 is rule 2\'s, not rule 1\'s, as the grader\'s reader counts it', async () => {
    expect(await readBundle(gz(Uint8Array.of(0x7b, 0xff, 0x7d)))).toMatchObject({ ok: false, rule: 2, message: 'The text inside is not UTF-8.' })
    // Half of a multi-byte character at the end of the text.
    expect(await readBundle(gz(Uint8Array.of(0x7b, 0xc3)))).toMatchObject({ ok: false, rule: 2, message: 'The text inside is not UTF-8.' })
  })

  test('text with a byte order mark is rule 2\'s: JSON does not allow one, and the browser would have dropped it without a word', async () => {
    expect(await readBundle(gz(Uint8Array.of(0xef, 0xbb, 0xbf, 0x7b, 0x7d)))).toMatchObject({
      ok: false,
      rule: 2,
      message: 'The text inside starts with a byte order mark, which JSON does not allow.',
    })
  })

  test('never throws: whatever the file is, the answer is a result', async () => {
    for (const bytes of [new Uint8Array(0), Uint8Array.of(0x1f, 0x8b), Uint8Array.of(0x1f, 0x8b, 0x08, 0x00), new Uint8Array(4096).fill(0x1f)]) {
      const found = await readBundle(blob(bytes))
      expect(found.ok).toBe(false)
    }
  })
})
