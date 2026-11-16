import { PrinterTape } from '@/design/components/PrinterTape'
import { storageLines } from './storage-lines'

/** The readout strip for where the record is kept (storage-lines.tsx says what each line means). */
export function StorageTape({ ledger, label = 'Where your progress is kept' }: { ledger: Parameters<typeof storageLines>[0]; label?: string }) {
  return <PrinterTape label={label} lines={storageLines(ledger)} state={ledger.ready ? 'default' : 'loading'} />
}
