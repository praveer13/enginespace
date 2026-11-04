/**
 * Import and undo (ARCHITECTURE §7.5): a file the learner chose comes in, and the learner can take it back.
 *
 * An import file is untrusted. The learner may have edited it, or picked the wrong one, so it passes the strict codec of
 * packages/ledger before anything is planned, and one bad record refuses the whole file. Nothing is written by planning:
 * `planFromText` returns the preview that the learner confirms and the one transaction that makes it so.
 *
 *   merge    takes the union by id. An identical event is a no-op, and a clash on one id keeps the earlier `at` and flags the
 *            other. Receipts join their verification reports.
 *   replace  makes the ledger exactly the file's.
 *
 * Either mode writes a checkpoint in the same transaction, and the checkpoint holds only what the import changed, so
 * `undo` removes what the import added, puts back what it removed or replaced, and keeps whatever the learner earned after
 * it. Reading the file, gzip included, is in `readImportFile`; the store, the queue and the other tabs are the engine's.
 */
import { IMPORT_ERROR_MESSAGES, LIMITS, parseExport, planImport } from '@es/ledger'
import type { CheckpointMeta, Clash, DeviceId, ImportErrorCode, ImportMode, ImportPlan, ImportSummary, IsoInstant, Ledger } from '@es/ledger'

/** Why an import or an undo did not happen. The first five are the codec's; the rest are this module's. */
export type Refusal = ImportErrorCode | 'read-only' | 'no-checkpoint' | 'failed'

export const REFUSAL_MESSAGES: Readonly<Record<Refusal, string>> = {
  ...IMPORT_ERROR_MESSAGES,
  'read-only': 'This tab is read-only, so it cannot import or undo. Reload to update, then try again.',
  'no-checkpoint': 'There is no import to undo.',
  failed: 'The browser could not save the change, and nothing was changed.',
}

export interface Refused {
  ok: false
  error: Refusal
  detail: string
}

export const refuse = (error: Refusal, detail: string = REFUSAL_MESSAGES[error]): Refused => ({ ok: false, error, detail })

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the file                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The text of an import file: plain JSON, or gzip (sniffed by its magic bytes, not by its name). The size limit counts the
 * file's bytes, and for gzip it also counts the bytes that come out, with a counter that stops the stream the moment it
 * passes the limit, so a small file that inflates to a huge one costs no more than the limit.
 */
export async function readImportFile(file: Blob): Promise<{ ok: true; text: string } | Refused> {
  if (file.size > LIMITS.importBytes) return refuse('too-large')
  try {
    const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer())
    if (magic[0] !== 0x1f || magic[1] !== 0x8b) return { ok: true, text: await file.text() }
    if (typeof DecompressionStream === 'undefined') return refuse('parse', 'this browser cannot open a gzip file: unzip it, then import the JSON')
    const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > LIMITS.importBytes) {
        await reader.cancel()
        return refuse('too-large')
      }
      chunks.push(value)
    }
    const joined = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      joined.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { ok: true, text: new TextDecoder().decode(joined) }
  } catch {
    return refuse('parse', "this file can't be read: it is damaged, or not the file the export wrote")
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Planning                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What the learner sees before an import happens. */
export interface ImportPreview {
  mode: ImportMode
  summary: ImportSummary
  /** One for each id that met other content, in the order of the file. */
  clashes: readonly Clash[]
  /** Records the file repeated, settled by the merge rule before they were compared. */
  duplicates: number
  /** When, and on which device, the file was written. */
  exportedAt: IsoInstant
  device: DeviceId
}

export interface PlannedImport {
  preview: ImportPreview
  plan: ImportPlan
}

/**
 * Reads an export file, checks it, and plans its import against `current`. The result commits nothing: a preview commits
 * `plan.tx` never, and an import commits it once, with `RESOLVERS`. `checkpointId` names the checkpoint that undoes the
 * import, and `at` is when the import happens.
 */
export function planFromText(
  text: string,
  current: Ledger,
  mode: ImportMode,
  context: { checkpointId: string; at: IsoInstant },
): { ok: true; planned: PlannedImport } | Refused {
  const parsed = parseExport(text)
  if (!parsed.ok) return refuse(parsed.error, parsed.detail)
  const plan = planImport(current, { events: parsed.file.events, receipts: parsed.file.receipts }, mode, context)
  return {
    ok: true,
    planned: {
      plan,
      preview: {
        mode,
        summary: plan.summary,
        clashes: plan.clashes,
        duplicates: parsed.duplicates,
        exportedAt: parsed.file.exportedAt,
        device: parsed.file.device,
      },
    },
  }
}

/** The checkpoint an undo uses: the one asked for, or the newest. `list` is newest first, as the store gives it. */
export function pickCheckpoint(list: readonly CheckpointMeta[], id?: string): CheckpointMeta | null {
  if (id === undefined) return list[0] ?? null
  return list.find((checkpoint) => checkpoint.id === id) ?? null
}
