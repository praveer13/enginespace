/**
 * Rule 1, the caps (ARCHITECTURE §8.5, D-029): a bundle is at most 32 MB as a file and 256 MB once decompressed [estimated], and the
 * second is counted while the file is decompressed, by `DecompressionStream('gzip')` and a counter that stops the stream the moment it passes
 * the cap. A small file that inflates to a huge one (a zip bomb) costs the tab no more than the cap, and ends in a message.
 *
 * The file is read as a stream and never as one buffer, so a file of any size is refused before its bytes are in memory: the size is known
 * from the file's metadata, and the first two bytes say whether it is gzip at all. The inside is decoded as UTF-8 as it comes out, which
 * keeps one copy of it in memory and not two.
 *
 * A bundle is one gzip stream. The grader's reader refuses a file with anything after the stream's end, and `DecompressionStream` is what
 * the site reads it with, so a stream that ends early, or has junk after it, is the browser's own error and is reported as damage. Nothing
 * is trusted that the decompressor did not accept whole.
 *
 * What comes out is text and not yet a bundle: rule 2 reads it (schema.ts). The two things that make it not text are rule 2's, as the
 * grader's reader counts them: a byte order mark, which JSON does not allow, and bytes that are not UTF-8.
 */
import { grouped } from './format'
import { CAPS } from './limits'
import type { Caps } from './limits'
import type { Sizes } from './report'

export type ReadResult =
  | { readonly ok: true; readonly text: string; readonly sizes: Sizes }
  /** `rule` is the rule of A§8.5 that the file breaks: 1 for the caps and the gzip, 2 for text that is not JSON's. */
  | { readonly ok: false; readonly rule: 1 | 2; readonly message: string; readonly sizes?: Partial<Sizes> }

const stop = (rule: 1 | 2, message: string, sizes?: Partial<Sizes>): ReadResult => ({ ok: false, rule, message, ...(sizes === undefined ? {} : { sizes }) })

const NOT_GZIP = 'It is not a gzip file: a bundle is a .es.json.gz file, as `enginespace grade` writes it.'

/** The first bytes of the file: whether they are gzip's two magic bytes. */
async function isGzip(file: Blob): Promise<boolean> {
  if (file.size < 2) return false
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
  return head[0] === 0x1f && head[1] === 0x8b
}

/** The U+FEFF that a UTF-8 byte order mark decodes to, when the decoder is told to keep it. */
const BYTE_ORDER_MARK = 0xfeff

/**
 * Reads a bundle file under the caps of rule 1 and returns the text inside. The caps are the site's unless a test asks for smaller ones.
 * It never throws: whatever is wrong with the file is a result with a message that says what to do.
 */
export async function readBundle(file: Blob, caps: Caps = CAPS): Promise<ReadResult> {
  const compressedBytes = file.size
  if (compressedBytes > caps.compressedBytes) {
    return stop(1, `The file is ${grouped(compressedBytes)} bytes, and the site reads at most ${grouped(caps.compressedBytes)} compressed (the cap of rule 1).`, { compressedBytes })
  }
  if (typeof DecompressionStream === 'undefined') return stop(1, 'This browser cannot open a gzip file, and a bundle is one: use a current Chrome, Firefox or Safari.')
  try {
    if (!(await isGzip(file))) return stop(1, NOT_GZIP, { compressedBytes })
  } catch {
    return stop(1, 'The browser could not read the file.', { compressedBytes })
  }

  // `ignoreBOM: true` keeps a byte order mark in the text, where the default drops it without a word, so that it can be refused by name.
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const pieces: string[] = []
  let decompressedBytes = 0
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  try {
    for (;;) {
      let read: ReadableStreamReadResult<Uint8Array>
      try {
        read = await reader.read()
      } catch {
        return stop(1, 'The gzip data is damaged or cut short, so it cannot be read.', { compressedBytes, decompressedBytes })
      }
      if (read.done) break
      decompressedBytes += read.value.byteLength
      if (decompressedBytes > caps.decompressedBytes) {
        // Stop the stream where it is: there is no use in inflating the rest of a file that the site will not read.
        await reader.cancel().catch(() => undefined)
        return stop(
          1,
          `It holds more than the ${grouped(caps.decompressedBytes)} bytes that the site reads once decompressed (the cap of rule 1), so it stopped there.`,
          { compressedBytes, decompressedBytes: caps.decompressedBytes },
        )
      }
      try {
        pieces.push(decoder.decode(read.value, { stream: true }))
      } catch {
        await reader.cancel().catch(() => undefined)
        return stop(2, 'The text inside is not UTF-8.', { compressedBytes, decompressedBytes })
      }
    }
    try {
      pieces.push(decoder.decode())
    } catch {
      return stop(2, 'The text inside is not UTF-8.', { compressedBytes, decompressedBytes })
    }
  } finally {
    reader.releaseLock()
  }
  const text = pieces.join('')
  if (text.charCodeAt(0) === BYTE_ORDER_MARK) {
    return stop(2, 'The text inside starts with a byte order mark, which JSON does not allow.', { compressedBytes, decompressedBytes })
  }
  return { ok: true, text, sizes: { compressedBytes, decompressedBytes } }
}
