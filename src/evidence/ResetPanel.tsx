import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Button } from '@/design/components/Button'
import { Readout } from '@/design/components/Readout'
import { Stub } from '@/design/components/Stub'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { saveFile } from './export'
import { eraseDevice, exportAndSave } from './transfer'
import type { Saved, TransferApi } from './transfer'

/*
 * Reset (ARCHITECTURE §3.1, `/settings`): erase everything this device holds. It is the one thing on the page that cannot be
 * taken back, so it asks first, on a ticket of its own, says what would go and how much of it, and offers an export before
 * anything is erased. The way out, Keep everything, is what Escape and a click outside do as well. Erasing puts the settings
 * back to their defaults with the rest, because they are kept in the same place (`working`), and the ticket says so.
 */

export interface ResetPanelProps {
  api: Pick<TransferApi, 'exportLedger' | 'reset'>
  /** What would go, for the ticket's lines. */
  holds: { events: number; receipts: number; checkpoints: number }
  /** Runs once the ledger is erased: the page puts the settings back to their defaults. */
  onErased: () => void
}

/** What the ticket says would go. Exported for the tests, which cannot open a dialog. */
export function ErasedLines({ holds }: { holds: ResetPanelProps['holds'] }) {
  const count = (value: number) => <Readout value={value} tag="measured" size="sm" />
  return (
    <div className="es-xfer__lines">
      <TicketLine note={count(holds.events)}>graded results</TicketLine>
      <TicketLine note={count(holds.receipts)}>receipts</TicketLine>
      <TicketLine note={count(holds.checkpoints)}>undo points</TicketLine>
      <TicketLine>your settings, back to their defaults</TicketLine>
    </div>
  )
}

export function ResetPanel({ api, holds, onErased }: ResetPanelProps) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [erased, setErased] = useState(false)

  const exportFirst = async () => {
    setExporting(true)
    setProblem(null)
    const outcome = await exportAndSave(api, false, saveFile)
    setExporting(false)
    if (outcome.ok) setSaved(outcome.saved)
    else setProblem(`Not exported: ${outcome.detail}`)
  }

  const erase = async () => {
    setErasing(true)
    setProblem(null)
    const outcome = await eraseDevice(api, onErased)
    setErasing(false)
    if (outcome.ok) {
      setOpen(false)
      setSaved(null)
      setErased(true)
    } else {
      setProblem(`Not erased: ${outcome.detail}`)
    }
  }

  return (
    <div className="es-xfer" data-part="reset">
      <h3 className="es-xfer__title">Reset</h3>
      <p className="es-xfer__about">
        Erase everything this browser holds for enginespace: your evidence, your receipts, your undo points and these settings. It asks first, and offers an export.
      </p>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          // A dialog opened again starts clean, and one that is erasing cannot be dismissed half way.
          if (erasing) return
          setOpen(next)
          if (next) {
            setSaved(null)
            setProblem(null)
            setErased(false)
          }
        }}
      >
        <div className="es-xfer__row">
          <Dialog.Trigger asChild>
            <Button icon="alert">Reset this device</Button>
          </Dialog.Trigger>
        </div>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-surface-3 opacity-70" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto">
            <Ticket
              as="div"
              width="full"
              hole={false}
              head="Reset"
              meta="this device"
              title={
                <Dialog.Title asChild>
                  <span>Erase this device?</span>
                </Dialog.Title>
              }
              titleAs="h2"
              state={problem === null ? 'default' : 'error'}
              error={problem}
              stub={
                <Stub onClick={() => void erase()} loading={erasing}>
                  Erase everything
                </Stub>
              }
            >
              <Dialog.Description>
                This takes everything enginespace has kept in this browser. There is no copy anywhere else, and it cannot be undone.
              </Dialog.Description>
              <ErasedLines holds={holds} />
              <div className="es-xfer__first">
                <p>
                  {saved === null
                    ? 'Want a copy first? Export saves one file you can import again.'
                    : `Saved ${saved.filename}. Import it to get everything back.`}
                </p>
                <Button loading={exporting} onClick={() => void exportFirst()}>
                  {saved === null ? 'Export a copy first' : 'Export again'}
                </Button>
              </div>
              <div className="es-xfer__row">
                <Dialog.Close asChild>
                  <Button variant="quiet" disabled={erasing}>
                    Keep everything
                  </Button>
                </Dialog.Close>
              </div>
            </Ticket>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div role="status" className="es-xfer__status">
        {erased ? <p>This device is erased. The settings are back to their defaults.</p> : null}
      </div>
    </div>
  )
}
