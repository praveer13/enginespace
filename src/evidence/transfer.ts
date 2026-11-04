/*
 * Moving the ledger in and out of the browser, as the two pages that offer it use it (ARCHITECTURE §3.1 and §7.5): export, import
 * with its preview and its undo, and the reset. These are the steps, with no React in them. A panel holds the state a step
 * returns and draws it, and the engine (engine.ts) does the work, so the order of things is decided and tested in one place.
 *
 *   export  the ledger as one file, saved through the browser. Nothing is collected and nothing leaves the device unless the
 *           learner sends the file somewhere (D-009).
 *   import  choose a file, see what it would do, then merge or replace. The file is untrusted: it is read within a limit and
 *           checked record by record before anything is planned, and one bad record refuses the whole file (import.ts). The
 *           preview commits nothing. Either mode keeps a checkpoint, so the import can be undone.
 *   reset   erases the evidence, the receipts, the undo points and the working records, which include the settings. The panel
 *           asks first and offers an export, and this file only does it.
 */
import type { ImportMode } from '@es/ledger'
import type { ExportResult, ImportResult, PreviewResult, ResetResult, UndoResult } from './engine'
import type { SavedFile } from './export'
import { readImportFile } from './import'
import type { ImportPreview } from './import'

/** What the transfers need of the ledger: the hook's actions, so a panel passes `useEvidence()` and a test passes an engine. */
export interface TransferApi {
  exportLedger(options?: { gzip?: boolean }): Promise<ExportResult>
  previewImport(text: string, mode: ImportMode): Promise<PreviewResult>
  importLedger(text: string, mode: ImportMode): Promise<ImportResult>
  undoImport(checkpointId?: string): Promise<UndoResult>
  reset(): Promise<ResetResult>
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Export                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What an export saved, for the line the page prints. */
export interface Saved {
  filename: string
  events: number
  receipts: number
  bytes: number
  gzip: boolean
}

export type ExportOutcome = { ok: true; saved: Saved } | { ok: false; detail: string }

/** Makes the file and hands it to `save` (the browser's download, in the page). A refusal says why, in words. */
export async function exportAndSave(api: Pick<TransferApi, 'exportLedger'>, gzip: boolean, save: (file: SavedFile) => void): Promise<ExportOutcome> {
  let result: ExportResult
  try {
    result = await api.exportLedger({ gzip })
  } catch {
    return { ok: false, detail: 'The ledger could not be opened, so nothing was exported.' }
  }
  if (!result.ok) return { ok: false, detail: result.detail }
  try {
    save(result)
  } catch {
    return { ok: false, detail: 'The browser would not save the file.' }
  }
  return {
    ok: true,
    saved: { filename: result.filename, events: result.file.events.length, receipts: result.file.receipts.length, bytes: result.bytes.byteLength, gzip: result.gzip },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Import                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

type Imported = Extract<ImportResult, { ok: true }>

/** Where an import is, from the file chosen to the undo. The panel draws one of these, and says separately that it is working. */
export type ImportFlow =
  | { step: 'idle' }
  | { step: 'preview'; fileName: string; text: string; preview: ImportPreview }
  | { step: 'refused'; detail: string }
  | { step: 'done'; fileName: string; result: Imported }
  | { step: 'undone' }

export type PreviewFlow = Extract<ImportFlow, { step: 'preview' }>

const gone = (): ImportFlow => ({ step: 'refused', detail: 'The ledger could not be opened, so nothing was changed.' })

/** Reads the file the learner chose and previews what importing it would do in `mode`. Nothing is written. */
export async function openImportFile(api: Pick<TransferApi, 'previewImport'>, file: Blob & { name?: string }, mode: ImportMode = 'merge'): Promise<ImportFlow> {
  try {
    const read = await readImportFile(file)
    if (!read.ok) return { step: 'refused', detail: read.detail }
    const previewed = await api.previewImport(read.text, mode)
    if (!previewed.ok) return { step: 'refused', detail: previewed.detail }
    return { step: 'preview', fileName: file.name ?? 'the file', text: read.text, preview: previewed.preview }
  } catch {
    return gone()
  }
}

/** The same file, previewed in the other mode. */
export async function previewMode(api: Pick<TransferApi, 'previewImport'>, flow: PreviewFlow, mode: ImportMode): Promise<ImportFlow> {
  if (flow.preview.mode === mode) return flow
  try {
    const previewed = await api.previewImport(flow.text, mode)
    return previewed.ok ? { ...flow, preview: previewed.preview } : { step: 'refused', detail: previewed.detail }
  } catch {
    return gone()
  }
}

/** Imports the previewed file in the mode the preview shows. The result carries the checkpoint that undoes it. */
export async function commitImport(api: Pick<TransferApi, 'importLedger'>, flow: PreviewFlow): Promise<ImportFlow> {
  try {
    const result = await api.importLedger(flow.text, flow.preview.mode)
    return result.ok ? { step: 'done', fileName: flow.fileName, result } : { step: 'refused', detail: result.detail }
  } catch {
    return gone()
  }
}

/** Takes the import back: the one named, or the newest. What was earned after it stays. */
export async function undoImport(api: Pick<TransferApi, 'undoImport'>, checkpointId?: string): Promise<ImportFlow> {
  try {
    const result = await api.undoImport(checkpointId)
    return result.ok ? { step: 'undone' } : { step: 'refused', detail: result.detail }
  } catch {
    return gone()
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reset                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export type EraseOutcome = { ok: true } | { ok: false; detail: string }

/** Erases everything on this device that the ledger holds, then runs `after` (the settings go back to their defaults with it). */
export async function eraseDevice(api: Pick<TransferApi, 'reset'>, after: () => void): Promise<EraseOutcome> {
  let result: ResetResult
  try {
    result = await api.reset()
  } catch {
    return { ok: false, detail: 'The ledger could not be opened, so nothing was erased.' }
  }
  if (!result.ok) return { ok: false, detail: result.detail }
  after()
  return { ok: true }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Saying when                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** An instant in the learner's own time, as a date and a time: `4 Nov 2026, 09:30`. `timeZone` is for a test. */
export function formatWhen(iso: string, timeZone?: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone, hourCycle: 'h23' }).format(at)
}
