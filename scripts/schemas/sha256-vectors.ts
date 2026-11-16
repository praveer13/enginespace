/*
 * schemas/vectors/sha256.json (ARCHITECTURE §8.5 rule 3, §9.8): SHA-256 of bytes, and of a bundle's artifacts.
 *
 * The first half is the hash itself, over the messages of FIPS 180-4's examples and over lengths at the edges of its padding (a message of
 * 55 bytes fits one block and one of 56 needs two), so a port that hashes by hand finds its mistake. The second half is the bytes an
 * artifact is hashed over, which depend on how the bundle writes it (bundle.ts): the UTF-8 of a JSON value's canonical text, the UTF-8 of
 * a text as it is, or the bytes a base64 string decodes to.
 */
import { createHash } from 'node:crypto'
import { isStrictBase64 } from '../../packages/schema/bundle.ts'
import { hasLoneSurrogate } from '../../packages/schema/common.ts'
import { canonicalJson } from '../../packages/sim/core/json.ts'
import type { Vector, VectorFile } from './format.ts'

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex')
const utf8 = (text: string): Buffer => Buffer.from(text, 'utf8')

/** The bytes of a message that is a text, as the FIPS 180-4 examples write it. */
const ascii = (text: string): Buffer => Buffer.from(text, 'latin1')

/** A message's vector: its bytes in hex, or the byte it repeats, and its SHA-256. */
function message(id: string, bytes: Uint8Array, note?: string, repeat?: { byteHex: string; times: number }): Vector {
  const form = repeat === undefined ? { hex: hex(bytes) } : { repeat }
  return { id: `sha256-${id}`, ...(note === undefined ? {} : { note }), fn: 'sha256', ...form, bytes: bytes.length, sha256: digest(bytes) }
}

function bytesVectors(): Vector[] {
  const out: Vector[] = []
  const examples: [string, string, string][] = [
    ['empty', '', 'the empty message'],
    ['abc', 'abc', 'the one-block example of FIPS 180-4'],
    ['nist-448-bits', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', 'the two-block example of FIPS 180-4: 56 bytes, which need a second block for the length'],
    [
      'nist-896-bits',
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'the 112-byte example of the same standard, in two blocks',
    ],
  ]
  for (const [id, text, note] of examples) out.push(message(id, ascii(text), note))
  // Lengths at the edges of the padding: 55 bytes fit a block with the padding, 56 do not; 64 are a block of data; the same again at 119 to 129.
  for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129]) {
    out.push(message(`${length}-bytes-of-a`, Buffer.alloc(length, 0x61), undefined, { byteHex: '61', times: length }))
  }
  out.push(message('million-a', Buffer.alloc(1_000_000, 0x61), 'the long example of FIPS 180-4: one million `a`', { byteHex: '61', times: 1_000_000 }))
  out.push(message('one-zero-byte', Buffer.alloc(1)))
  out.push(message('64-zero-bytes', Buffer.alloc(64), undefined, { byteHex: '00', times: 64 }))
  const every = Uint8Array.from({ length: 256 }, (_, i) => i)
  out.push({ id: 'sha256-every-byte-ascending', note: 'bytes 0x00 to 0xff', fn: 'sha256', hex: hex(every), bytes: 256, sha256: digest(every) })
  out.push({ id: 'sha256-every-byte-descending', fn: 'sha256', hex: hex(every.toReversed()), bytes: 256, sha256: digest(every.toReversed()) })
  const texts: [string, string, string?][] = [
    ['e-acute', 'é', 'two bytes: c3 a9'],
    ['e-then-accent', 'é', 'the same letter decomposed: three bytes, and a different hash. Text is not normalised'],
    ['cjk', '日本語'],
    ['emoji', '\u{1F600}', 'four bytes: f0 9f 98 80'],
    ['crlf', 'a\r\nb', 'line endings are bytes like any other'],
    ['lf', 'a\nb', 'the same lines with a line feed, which hashes differently'],
    ['byte-order-mark', '﻿abc', 'a byte order mark is three bytes: ef bb bf'],
  ]
  for (const [id, text, note] of texts) out.push(message(`utf8-${id}`, utf8(text), note))
  return out
}

/** The bytes that an artifact is hashed over, or an error. This is the rule that bundle.ts states. */
function artifactBytes(encoding: 'json' | 'text' | 'base64', data: unknown): Buffer {
  if (encoding === 'json') return utf8(canonicalJson(data))
  if (typeof data !== 'string') throw new TypeError('a text or base64 artifact holds a string')
  if (encoding === 'text') {
    if (hasLoneSurrogate(data)) throw new RangeError('a lone surrogate has no UTF-8 form')
    return utf8(data)
  }
  if (!isStrictBase64(data)) throw new RangeError('not standard base64 with its padding')
  return Buffer.from(data, 'base64')
}

function artifact(id: string, encoding: 'json' | 'text' | 'base64', data: unknown, note?: string): Vector {
  const base = { id: `artifact-${id}`, ...(note === undefined ? {} : { note }), fn: 'artifact', encoding, data }
  let bytes: Buffer
  try {
    bytes = artifactBytes(encoding, data)
  } catch (error) {
    if (!(error instanceof RangeError || error instanceof TypeError)) throw error
    return { ...base, error: true }
  }
  return { ...base, ...(bytes.length <= 96 ? { bytesHex: hex(bytes) } : {}), bytes: bytes.length, sha256: digest(bytes) }
}

function artifactVectors(): Vector[] {
  const many = 'line of a log\n'.repeat(500)
  const every = Buffer.from(Uint8Array.from({ length: 256 }, (_, i) => i))
  const out: Vector[] = [
    artifact('json-object', 'json', { b: 1, a: [1, 2, { d: null, c: 0.5 }] }, 'hashed as the UTF-8 bytes of the canonical text {"a":[1,2,{"c":0.5,"d":null}],"b":1}'),
    artifact('json-empty-array', 'json', []),
    artifact('json-empty-object', 'json', {}),
    artifact('json-null', 'json', null, 'null is a value'),
    artifact('json-string', 'json', 'café', 'a string is hashed as a JSON string with its quotes: "café"'),
    artifact('json-float', 'json', 0.1),
    artifact('json-keys-by-utf16', 'json', { '\u{1F600}': 1, '～': 2, '': 3 }, 'keys sorted by UTF-16 code unit, as in canonical.json'),
    artifact('json-lone-surrogate', 'json', '\ud800', 'a lone surrogate has no canonical form'),
    artifact('text-empty', 'text', ''),
    artifact('text-log', 'text', 'tokens/s: 123\n', 'the string as it is, in UTF-8, with its final line feed'),
    artifact('text-crlf', 'text', 'a\r\nb\r\n', 'line endings are kept, not turned into line feeds'),
    artifact('text-unicode', 'text', 'café 日本語 \u{1F600}'),
    artifact('text-decomposed', 'text', 'café', 'the same word decomposed hashes differently'),
    artifact('text-nul', 'text', 'a\u0000b', 'a NUL is a byte'),
    artifact('text-long', 'text', many, 'a log of 7000 bytes; the hash alone'),
    artifact('text-lone-surrogate', 'text', 'a\ud800b', 'a lone surrogate has no UTF-8 form, and Python refuses to encode it where JavaScript\'s TextEncoder would write U+FFFD'),
    artifact('base64-empty', 'base64', ''),
    artifact('base64-one-byte', 'base64', 'AA==', 'padded with two ='),
    artifact('base64-two-bytes', 'base64', 'AAE=', 'padded with one ='),
    artifact('base64-three-bytes', 'base64', 'AAEC', 'no padding when the length is a multiple of 3'),
    artifact('base64-four-bytes', 'base64', 'AAECAw=='),
    artifact('base64-plus-and-slash', 'base64', '+/8=', 'the standard alphabet has + and /: bytes fb ff'),
    artifact('base64-every-byte', 'base64', every.toString('base64'), 'the 256 byte values'),
    artifact('base64-unpadded', 'base64', 'AAE', 'padding is required'),
    artifact('base64-wrong-padding', 'base64', 'AA=', 'one = where two are needed'),
    artifact('base64-too-much-padding', 'base64', 'A===', 'at most two ='),
    artifact('base64-padding-in-the-middle', 'base64', 'AA==AA==', 'padding only at the end'),
    artifact('base64-newline', 'base64', 'AAEC\n', 'no line break, not even a last one: Python\'s b64decode would skip it without validate=True'),
    artifact('base64-space', 'base64', 'AA EC', 'no space'),
    artifact('base64-url-safe', 'base64', '-_8=', 'the URL-safe alphabet is not standard base64'),
    artifact('base64-not-in-the-alphabet', 'base64', 'AA!=', 'a character outside the alphabet'),
    artifact('base64-length-five', 'base64', 'AAAAA', 'the length is a multiple of 4'),
  ]
  // Every expected refusal is the one the case's note says, and no accepted vector lost its hash by accident.
  for (const vector of out) {
    const refused = /lone-surrogate|unpadded|wrong-padding|too-much|in-the-middle|newline|space|url-safe|not-in-the|length-five/.test(vector.id)
    if (refused !== (vector.error === true)) throw new Error(`sha256 vector ${vector.id}: the code ${vector.error === true ? 'refuses' : 'takes'} it, and the case says otherwise`)
  }
  return out
}

export function sha256File(): VectorFile {
  return {
    spec: 'enginespace/vectors-sha256@1',
    description:
      'SHA-256 of bytes (FIPS 180-4), and the bytes that a bundle artifact is hashed over (ARCHITECTURE section 8.5 rule 3, 9.6 and 9.8, packages/schema/bundle.ts).',
    reading: [
      'A "sha256" vector gives a message and its SHA-256 as 64 lower-case hex digits. The message is "hex", the bytes in hex, or "repeat": the byte "byteHex" written "times" times. "bytes" is its length.',
      'An "artifact" vector gives an artifact as a bundle writes it: "encoding" is json, text or base64, and "data" is the value. The artifact is hashed over its canonical bytes: for json, the UTF-8 bytes of the canonical JSON text of the value (canonical.json); for text, the UTF-8 bytes of the string as it is, with every line ending kept and no normalisation; for base64, the bytes that the string decodes to. "bytes" is their number, "bytesHex" is them in hex where they are short, and "sha256" is their hash.',
      'A base64 string is standard base64 with its padding, whose length is a multiple of 4: the characters A to Z, a to z, 0 to 9, + and /, then up to two = at the end, and nothing else, no line break among it. A port checks the form itself and does not leave it to a lenient decoder: Python\'s base64.b64decode skips a character outside the alphabet unless it is asked to validate. A text artifact with a lone surrogate, and a json artifact that has no canonical form, are refused: "error": true.',
      'In an "artifact" vector "data" is read by the reader\'s own JSON parser. The values here are strings, null, whole numbers and the fraction 0.1, which both languages read alike.',
    ],
    source: 'scripts/schemas/sha256-vectors.ts; bun scripts/export-schemas.ts writes it',
    oracle: 'node:crypto (OpenSSL) for the hash, canonicalJson of packages/sim/core/json.ts for a json artifact, and the digests of FIPS 180-4\'s examples, which tests/schema/vectors.test.ts also holds to their published values',
    vectors: [...bytesVectors(), ...artifactVectors()],
  }
}
