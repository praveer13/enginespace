/*
 * Reading the one artifact a question set needs from a receipt's file (ASSESSMENT §7.2), on the page's own thread and not in the receipt worker: the
 * step loads on demand, and the worker stays what it was.
 *
 * The file is read under the caps of rule 1 and the schema of rule 2, as the worker reads it (packages/verify caps.ts and schema.ts). Then two things
 * are asked of it, and a file that fails either gives no questions:
 *   - it is this receipt: the SHA-256 of its receipt's canonical JSON is the hash of the receipt the page is open on, so the questions come from the
 *     run this browser checked, and not from another file of the same lab;
 *   - the artifact is the one the receipt lists: its canonical bytes hash to the receipt's entry (rule 3, for this one artifact), so an artifact
 *     edited after the run is refused, as the worker refuses it.
 * The data is then the set's to read (sets.ts). Nothing is kept, and nothing leaves the tab.
 */
import { readBundle } from '@es/verify/caps'
import { canonicalBytes, sha256Hex } from '@es/verify/hashing'
import { parseBundle } from '@es/verify/schema'
import { DEFEND_COPY } from './copy'

export type ArtifactRead = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly problem: string }

const encoder = new TextEncoder()

/** The data of the artifact of `format` in the file, when the file holds the receipt `sha256` and the artifact is the one the receipt lists. */
export async function artifactOf(file: Blob, sha256: string, format: string): Promise<ArtifactRead> {
  const read = await readBundle(file)
  if (!read.ok) return { ok: false, problem: DEFEND_COPY.fileUnread(read.message) }
  const parsed = parseBundle(read.text)
  if (!parsed.ok) return { ok: false, problem: DEFEND_COPY.fileUnread(parsed.problems[0] ?? '') }
  const digest = await sha256Hex(encoder.encode(parsed.canonicalReceipt))
  if (digest !== sha256) return { ok: false, problem: DEFEND_COPY.fileOther }
  const { bundle } = parsed
  const entry = bundle.receipt.artifacts.find((candidate) => candidate.format === format && candidate.inBundle)
  const artifact = entry === undefined ? undefined : bundle.artifacts[entry.id]
  if (entry === undefined || artifact === undefined) return { ok: false, problem: DEFEND_COPY.fileNoArtifact }
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = canonicalBytes(artifact)
  } catch {
    return { ok: false, problem: DEFEND_COPY.fileEdited }
  }
  if ((await sha256Hex(bytes)) !== entry.sha256 || bytes.byteLength !== entry.bytes) return { ok: false, problem: DEFEND_COPY.fileEdited }
  if (artifact.encoding !== 'json') return { ok: false, problem: DEFEND_COPY.fileNoArtifact }
  return { ok: true, data: artifact.data }
}
