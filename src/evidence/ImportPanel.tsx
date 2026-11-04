import { useRef, useState } from 'react'
import type { CheckpointMeta, ImportMode } from '@es/ledger'
import { Button } from '@/design/components/Button'
import { PrinterTape } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { Choice } from '@/settings/Choice'
import { commitImport, formatWhen, openImportFile, previewMode, undoImport } from './transfer'
import type { ImportFlow, PreviewFlow, TransferApi } from './transfer'

/*
 * Import (ARCHITECTURE §7.5): bring evidence in from a file that Export made, here or on another device. The file is untrusted,
 * so the learner sees what it would do before anything is written: how many events are new, how many are here already, and
 * where two events share an id and say different things. Merge adds what is new and removes nothing. Replace makes this
 * device's evidence exactly the file's, which is why it says what it would remove. Either way a checkpoint is kept, and the
 * newest one can be undone, for as long as it is kept.
 *
 * The panel draws the flow that transfer.ts returns. A file the codec refuses prints on a red-ink ticket with the reason.
 */

const MODES: readonly { value: ImportMode; label: string; hint: string }[] = [
  {
    value: 'merge',
    label: 'Merge',
    hint: 'Adds what is new and removes nothing. Where an id is here already with other content, the earlier time is kept and the other is flagged.',
  },
  {
    value: 'replace',
    label: 'Replace',
    hint: "Makes this device's evidence exactly the file's: whatever is here and not in the file goes. You can undo it.",
  },
]

/** A count with its tag, as every number on these pages is printed. */
const count = (value: number) => <Readout value={value} tag="measured" size="sm" />

/** What the file holds and what importing it would change. Exported for the tests, which cannot choose a file. */
export function PreviewTicket({
  flow,
  busy = false,
  onMode,
  onImport,
  onCancel,
}: {
  flow: PreviewFlow
  busy?: boolean
  onMode: (mode: ImportMode) => void
  onImport: () => void
  onCancel: () => void
}) {
  const { preview } = flow
  const { summary } = preview
  const replace = preview.mode === 'replace'
  return (
    <Ticket
      as="section"
      width="wide"
      hole={false}
      head="Import preview"
      meta={flow.fileName}
      title="What this file would do"
      titleAs="h4"
      aria-label="Import preview"
      stub={
        <Stub onClick={onImport} loading={busy}>
          {replace ? 'Import and replace' : 'Import and merge'}
        </Stub>
      }
    >
      <p className="es-xfer__made">
        Exported {formatWhen(preview.exportedAt)} by device <code>{preview.device.slice(0, 8)}</code>.
      </p>
      <Choice label="How to bring it in" options={MODES} value={preview.mode} onChange={onMode} disabled={busy} />
      <div className="es-xfer__lines">
        <TicketLine note={count(summary.fileEvents)}>events in the file</TicketLine>
        <TicketLine note={count(summary.newEvents)}>new here</TicketLine>
        <TicketLine note={count(summary.sameEvents)}>here already</TicketLine>
        <TicketLine note={count(summary.clashedEvents)} tone={summary.clashedEvents > 0 ? 'ink-2' : 'ink'}>
          clash: same id, other content
        </TicketLine>
        {replace ? (
          <TicketLine note={count(summary.removedEvents)} tone={summary.removedEvents > 0 ? 'ink-2' : 'ink'}>
            here, not in the file: removed
          </TicketLine>
        ) : null}
        <TicketLine note={count(summary.fileReceipts)}>receipts in the file</TicketLine>
        {replace && summary.removedReceipts > 0 ? (
          <TicketLine note={count(summary.removedReceipts)} tone="ink-2">
            receipts removed
          </TicketLine>
        ) : null}
        {preview.duplicates > 0 ? <TicketLine note={count(preview.duplicates)}>repeated in the file, counted once</TicketLine> : null}
      </div>
      <div className="es-xfer__row">
        <Button variant="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Ticket>
  )
}

/** What an import did, printed on the tape. Exported for the tests. */
export function ImportedTape({ flow }: { flow: Extract<ImportFlow, { step: 'done' }> }) {
  const { summary, clashes } = flow.result
  const replaced = summary.mode === 'replace'
  return (
    <PrinterTape
      label="The import, printed"
      lines={[
        { id: 'file', label: 'file', value: flow.fileName },
        { id: 'mode', label: 'how', value: replaced ? 'replace' : 'merge' },
        { id: 'new', label: 'new events', value: count(summary.newEvents) },
        ...(replaced ? [{ id: 'removed', label: 'removed', value: count(summary.removedEvents) }] : []),
        ...(clashes > 0 ? [{ id: 'clashes', label: 'ids that clashed', value: count(clashes), tone: 'ink-2' as const }] : []),
        { id: 'receipts', label: 'new receipts', value: count(summary.newReceipts) },
      ]}
    />
  )
}

/**
 * What the last step says, in the status region that is on the page from the start: the tape of an import that changed the ledger,
 * a sentence for one that changed nothing (the ledger keeps no checkpoint for it), and the word that an undo is done. Exported for
 * the tests.
 */
export function ImportStatus({ flow }: { flow: ImportFlow }) {
  if (flow.step === 'undone') return <p>The import was undone.</p>
  if (flow.step !== 'done') return null
  return flow.result.checkpointId === null ? <p>Nothing changed: everything in {flow.fileName} was here already.</p> : <ImportedTape flow={flow} />
}

type Working = 'reading' | 'importing' | 'undoing' | null

export function ImportPanel({
  api,
  checkpoints,
}: {
  api: Pick<TransferApi, 'previewImport' | 'importLedger' | 'undoImport'>
  /** The imports that can still be undone, newest first (the ledger's own list). */
  checkpoints: readonly CheckpointMeta[]
}) {
  const [flow, setFlow] = useState<ImportFlow>({ step: 'idle' })
  const [working, setWorking] = useState<Working>(null)
  const input = useRef<HTMLInputElement>(null)
  const newest = checkpoints[0]

  /** Runs one step of the flow with the panel marked as working, and shows what it returns. */
  const run = async (doing: Exclude<Working, null>, step: () => Promise<ImportFlow>) => {
    setWorking(doing)
    setFlow(await step())
    setWorking(null)
  }

  const pick = (file: File | undefined) => {
    if (!file) return
    void run('reading', () => openImportFile(api, file)).then(() => {
      // The same file can be chosen again after a change of mind.
      if (input.current) input.current.value = ''
    })
  }

  return (
    <div className="es-xfer" data-part="import">
      <h3 className="es-xfer__title">Import</h3>
      <p className="es-xfer__about">Bring in evidence from a file that Export made, on this device or another. You will see what it would do first.</p>
      <div className="es-xfer__row">
        <input
          ref={input}
          type="file"
          accept=".json,.gz,application/json,application/gzip"
          hidden
          aria-label="Evidence file"
          onChange={(event) => pick(event.target.files?.[0])}
        />
        <Button variant="ink" loading={working === 'reading'} onClick={() => input.current?.click()}>
          Choose a file
        </Button>
      </div>

      {flow.step === 'preview' ? (
        <PreviewTicket
          flow={flow}
          busy={working !== null}
          onMode={(mode) => void run('reading', () => previewMode(api, flow, mode))}
          onImport={() => void run('importing', () => commitImport(api, flow))}
          onCancel={() => setFlow({ step: 'idle' })}
        />
      ) : null}
      {flow.step === 'refused' ? (
        <Ticket as="section" width="wide" hole={false} head="Import refused" title="Nothing was changed" titleAs="h4" state="error" error={flow.detail}>
          <p>Choose another file, or export again from the device that made this one.</p>
        </Ticket>
      ) : null}

      <div role="status" className="es-xfer__status">
        <ImportStatus flow={flow} />
      </div>

      {newest ? (
        <div className="es-xfer__undo">
          <p>
            Last import: {newest.reason === 'import-replace' ? 'a replace' : 'a merge'} on {formatWhen(newest.at)}. Undoing it takes out what it added and puts
            back what it replaced; what you have earned since stays.
          </p>
          <Button loading={working === 'undoing'} disabled={working !== null} onClick={() => void run('undoing', () => undoImport(api, newest.id))}>
            Undo the last import
          </Button>
        </div>
      ) : null}
    </div>
  )
}
