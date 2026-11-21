import type { LedgerEvent } from '@es/ledger'
import { DEFEND_STAGES } from '@/receipts/defend/registry'
import type { DefendLink } from './GradedLabView'

/**
 * The way in to "Defend your receipt" (ASSESSMENT §7.2): the newest receipt of each of this lab's stages that can be defended, once this browser has
 * verified it. A receipt event carries what it is worth only after the ledger's reading has worked it out (src/receipts/credit.ts); until then it is
 * not listed.
 */
export function defendLinks(events: readonly LedgerEvent[], lab: string): DefendLink[] {
  const newest = new Map<string, { at: string; sha256: string }>()
  for (const event of events) {
    if (event.kind !== 'receipt') continue
    const stage = event.ref.slice('receipt:'.length)
    if (DEFEND_STAGES[stage] !== lab || !Object.hasOwn(DEFEND_STAGES, stage)) continue
    const credited = event as LedgerEvent & { ok?: boolean; provenance?: string }
    if (!('ok' in event) || credited.ok !== true || (credited.provenance !== 'gpu-verified' && credited.provenance !== 'assisted')) continue
    const held = newest.get(stage)
    if (held === undefined || event.at > held.at) newest.set(stage, { at: event.at, sha256: event.data.receiptSha256 })
  }
  return [...newest].sort(([a], [b]) => (a < b ? -1 : 1)).map(([stage, { sha256 }]) => ({ stage, sha256 }))
}
