import type { CheckpointMeta } from '@es/ledger'
import { ExportPanel } from './ExportPanel'
import { ImportPanel } from './ImportPanel'
import type { TransferApi } from './transfer'

/*
 * Export and import on one stainless deck (ARCHITECTURE §7.5), as `/evidence` and `/settings` both offer them: the controls are
 * on the steel, and what they print is on paper. A page passes `useEvidence()` as the api, and the ledger's list of imports
 * that can still be undone.
 */
export function LedgerFiles({ api, checkpoints }: { api: Pick<TransferApi, 'exportLedger' | 'previewImport' | 'importLedger' | 'undoImport'>; checkpoints: readonly CheckpointMeta[] }) {
  return (
    <div className="es-deck es-xfers">
      <ExportPanel api={api} />
      <ImportPanel api={api} checkpoints={checkpoints} />
    </div>
  )
}
