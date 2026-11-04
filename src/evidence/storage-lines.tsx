import type { PrinterTapeLine } from '@/design/components/PrinterTape'
import { Readout } from '@/design/components/Readout'
import type { EvidenceSnapshot } from './engine'
import { formatWhen } from './transfer'

/*
 * Where the evidence is kept, and how safe it is, as the lines of the printer's tape (ARCHITECTURE §7.1 and §7.4). The ledger
 * lives in this browser's IndexedDB and nowhere else. If the browser would not open it, the page runs on memory and the evidence is
 * gone when the tab closes, and the tape says so in red. The browser may also clear script-written storage under pressure unless
 * it has agreed to keep it (`navigator.storage.persist()`, asked after the first graded event), so the tape says whether it has.
 */

/** The tape's lines for a ledger's state. Exported for the tests. */
export function storageLines(
  ledger: Pick<EvidenceSnapshot, 'ready' | 'backend' | 'persisted' | 'events' | 'receipts' | 'lastExportAt' | 'unsaved'>,
): PrinterTapeLine[] {
  const memory = ledger.backend === 'memory'
  const lines: PrinterTapeLine[] = [
    {
      id: 'kept',
      label: 'kept in',
      value: !ledger.ready ? 'opening' : memory ? 'memory only' : 'IndexedDB',
      tone: memory ? 'ink-2' : 'ink',
    },
  ]
  if (memory) lines.push({ id: 'lost', label: 'saved', value: 'no: export to keep it', tone: 'ink-2' })
  if (ledger.ready && !memory) {
    lines.push({
      id: 'persisted',
      label: 'kept safe',
      value: ledger.persisted === true ? 'yes' : ledger.persisted === false ? 'not yet' : 'unknown',
    })
  }
  lines.push(
    { id: 'events', label: 'events', value: <Readout value={ledger.events.length} tag="measured" source="in this browser" size="sm" /> },
    { id: 'receipts', label: 'receipts', value: <Readout value={ledger.receipts.length} tag="measured" source="in this browser" size="sm" /> },
  )
  if (ledger.unsaved > 0) lines.push({ id: 'unsaved', label: 'waiting to save', value: <Readout value={ledger.unsaved} tag="measured" size="sm" />, tone: 'ink-2' })
  lines.push({
    id: 'export',
    label: 'last export',
    value: ledger.lastExportAt === undefined ? 'never' : formatWhen(ledger.lastExportAt),
    tone: ledger.lastExportAt === undefined && ledger.events.length > 0 ? 'ink-2' : 'ink',
  })
  return lines
}
