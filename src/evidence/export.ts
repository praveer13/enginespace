/**
 * Export (ARCHITECTURE §7.5): the ledger as one file the learner keeps.
 *
 * `enginespace/export@1` is one JSON file, gzipped when the learner asks. The text is the ledger's canonical JSON
 * (packages/ledger `serializeExport`), so the same ledger, written by the same device at the same instant, is the same bytes.
 * That is what makes a backup checkable: export, clear, import, export again, and the two files are equal. Nothing is
 * collected and nothing leaves the device unless the learner saves the file and sends it somewhere (D-009).
 *
 * This module makes the file and saves it. Reading one back, and the import itself, are in import.ts.
 */
import { buildExport, dayOf, serializeExport } from '@es/ledger'
import type { DeviceId, ExportFile, IsoInstant, Ledger } from '@es/ledger'

export type ExportMime = 'application/json' | 'application/gzip'

/** A file to hand to the learner. */
export interface SavedFile {
  filename: string
  mime: ExportMime
  bytes: Uint8Array<ArrayBuffer>
}

export interface ExportOutput extends SavedFile {
  /** The ledger as it was written. */
  file: ExportFile
  /** The canonical JSON, before any gzip. */
  text: string
  gzip: boolean
}

export interface ExportInput {
  ledger: Ledger
  /** The device that writes the file. */
  device: DeviceId
  exportedAt: IsoInstant
  /** Minutes east of UTC at `exportedAt`: the filename carries the learner's own day. */
  tz: number
  gzip?: boolean
}

/** `enginespace-export-2026-11-04.json`, or `.json.gz`. */
export function exportFilename(day: string, gzip: boolean): string {
  return `enginespace-export-${day}.json${gzip ? '.gz' : ''}`
}

export async function gzipBytes(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof CompressionStream === 'undefined') throw new Error('this browser cannot gzip a file: export it without compression')
  const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

/** Builds the file for a ledger. The ledger is normalised on the way, so the order it came in does not matter. */
export async function makeExport(input: ExportInput): Promise<ExportOutput> {
  const file = buildExport({ ledger: input.ledger, device: input.device, exportedAt: input.exportedAt })
  const text = serializeExport(file)
  const gzip = input.gzip === true
  const utf8 = new TextEncoder().encode(text)
  return {
    file,
    text,
    gzip,
    bytes: gzip ? await gzipBytes(utf8) : utf8,
    mime: gzip ? 'application/gzip' : 'application/json',
    filename: exportFilename(dayOf(input.exportedAt, input.tz), gzip),
  }
}

/** How long a saved file's URL stays alive [estimated]. A browser that starts the download late (Safari) still finds the bytes. */
const REVOKE_AFTER_MS = 30_000

/** Hands the browser a file to save: a link with a `download` name, clicked once. */
export function saveFile(file: SavedFile): void {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  link.rel = 'noopener'
  // Firefox ignores a click on a link that is not in the document.
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
