import { useState } from 'react'
import { Button } from '@/design/components/Button'
import { PrinterTape } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import { Toggle } from '@/design/components/Toggle'
import { saveFile } from './export'
import { exportAndSave } from './transfer'
import type { Saved, TransferApi } from './transfer'

/*
 * Export (ARCHITECTURE §7.5): the ledger as one file the learner keeps. It is the only backup there is, since nothing is kept
 * anywhere but this browser, so the panel says so, and prints what it saved on the printer's tape: the file's name, what is in
 * it, and its size. The tape sits in a status region that is on the page from the start, so a screen reader hears the print.
 */

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'saved'; saved: Saved } | { kind: 'failed'; detail: string }

/** The tape that says what an export saved. Exported for the tests, which cannot press the button. */
export function SavedTape({ saved }: { saved: Saved }) {
  return (
    <PrinterTape
      label="The export, printed"
      lines={[
        { id: 'file', label: 'file', value: saved.filename },
        { id: 'events', label: 'events', value: <Readout value={saved.events} tag="measured" size="sm" /> },
        { id: 'receipts', label: 'receipts', value: <Readout value={saved.receipts} tag="measured" size="sm" /> },
        { id: 'size', label: saved.gzip ? 'size, gzip' : 'size', value: <SizeReadout bytes={saved.bytes} /> },
      ]}
    />
  )
}

function SizeReadout({ bytes }: { bytes: number }) {
  return bytes < 1024 ? (
    <Readout value={bytes} unit="B" tag="measured" size="sm" />
  ) : (
    <Readout value={bytes / 1024} digits={1} unit="KB" tag="measured" size="sm" />
  )
}

export function ExportPanel({ api }: { api: Pick<TransferApi, 'exportLedger'> }) {
  const [gzip, setGzip] = useState(false)
  const [state, setState] = useState<State>({ kind: 'idle' })

  const run = async () => {
    setState({ kind: 'busy' })
    const outcome = await exportAndSave(api, gzip, saveFile)
    setState(outcome.ok ? { kind: 'saved', saved: outcome.saved } : { kind: 'failed', detail: outcome.detail })
  }

  return (
    <div className="es-xfer" data-part="export">
      <h3 className="es-xfer__title">Export</h3>
      <p className="es-xfer__about">
        One file with every graded result and receipt in this browser. Nothing is kept anywhere else, so this file is the only backup there is.
      </p>
      <div className="es-xfer__row">
        <Button
          variant="ink"
          loading={state.kind === 'busy'}
          error={state.kind === 'failed' ? `Not exported: ${state.detail}` : undefined}
          onClick={run}
        >
          Export evidence
        </Button>
        <Toggle label="Compress the file" hint="gzip: smaller, and import reads both kinds." checked={gzip} onCheckedChange={setGzip} />
      </div>
      <div role="status" className="es-xfer__status">
        {state.kind === 'saved' ? <SavedTape saved={state.saved} /> : null}
      </div>
    </div>
  )
}
