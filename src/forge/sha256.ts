/*
 * The SHA-256 of a file, as lowercase hex: how the site names the module it graded (ARCHITECTURE §8.3: the `lab-check` event carries
 * `wasmSha256`, and Prove-it asks about the module that was just graded). The browser's own `crypto.subtle` does the hashing, so no
 * library is added (A§14). `crypto.subtle` exists only on a secure page: https, and localhost.
 */

/** Lowercase hex of a byte buffer. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) throw new Error('this page cannot hash a file: the browser offers crypto.subtle only on a secure page (https, or localhost).')
  return toHex(new Uint8Array(await subtle.digest('SHA-256', bytes)))
}
