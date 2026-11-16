/**
 * SHA-256, and the bytes that an artifact is hashed over (ARCHITECTURE §8.5 rule 3, §9.6 and §9.8).
 *
 * The browser's own `crypto.subtle` does the hashing, so no library is added (A§14). It exists only on a secure page (https, and localhost),
 * which a worker inherits from the page that made it, and the site is served over https.
 *
 * A bundle carries each artifact in one of three encodings (packages/schema/bundle.ts), and the receipt lists the hash of its canonical
 * bytes: the UTF-8 of its canonical JSON for `json`, of its text for `text`, and what its standard base64 decodes to for `base64`. The
 * grader's port (labs/grader/src/enginespace_grader/hashing.py) computes the same bytes, and schemas/vectors/sha256.json holds a case of each.
 */
import { canonicalJson } from '@es/sim/core/json'
import type { BundleArtifact } from '@es/schema/bundle'

/** Lower-case hex of some bytes. */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/** The SHA-256 of some bytes, as 64 lower-case hex digits. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) throw new Error('this page cannot hash a file: the browser offers crypto.subtle only on a secure page (https, or localhost).')
  return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)))
}

/** The value of each base64 character, or -1: standard base64's alphabet (RFC 4648 §4). */
const BASE64 = new Int8Array(128).fill(-1)
for (const [at, char] of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].entries()) BASE64[char.charCodeAt(0)] = at

/**
 * The bytes of standard base64 with its padding. The text has been checked already (`isStrictBase64`, which the bundle schema applies), so
 * this decodes and does not validate: it reads a 4-character group into 3 bytes, and the last group's `=` into fewer. The loop is a loop and not
 * `atob`, because a bundle may hold tens of megabytes of base64 and `atob` would make a string of as many characters again.
 */
export function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  const out = new Uint8Array((text.length / 4) * 3 - pad)
  let at = 0
  for (let i = 0; i < text.length; i += 4) {
    const a = BASE64[text.charCodeAt(i)]
    const b = BASE64[text.charCodeAt(i + 1)]
    const c = BASE64[text.charCodeAt(i + 2)] // -1 for `=`, which the lines below never read
    const d = BASE64[text.charCodeAt(i + 3)]
    out[at++] = (a << 2) | (b >> 4)
    if (at < out.length) out[at++] = ((b & 15) << 4) | (c >> 2)
    if (at < out.length) out[at++] = ((c & 3) << 6) | d
  }
  return out
}

const encoder = new TextEncoder()

/**
 * The canonical bytes of an artifact (A§9.8). It throws, with a message that names the place, for a `json` artifact that has no canonical
 * form: a number beyond 2^53, a lone surrogate, or a structure nested deeper than the stack. Rule 3 reports that as the artifact's problem.
 */
export function canonicalBytes(artifact: BundleArtifact): Uint8Array<ArrayBuffer> {
  switch (artifact.encoding) {
    case 'json':
      return encoder.encode(canonicalJson(artifact.data))
    case 'text':
      return encoder.encode(artifact.data)
    case 'base64':
      return decodeBase64(artifact.data)
  }
}
