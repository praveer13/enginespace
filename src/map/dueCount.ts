import type { LedgerEvent } from '@es/ledger'
import { deriveCards } from '@/items/today/cards'
import { appKcsOfRef, kcsOfRefWith } from '@/items/today/kcs'
import { planFor, servable } from '@/items/today/plan'
import { localDayNow } from '@/items/today/useLocalDay'
import type { Due } from './due'

/** The session that Review would start now: how many reviews it holds and about how long it takes. Null when nothing is due. */
export function dueSummary(events: readonly LedgerEvent[], refs?: Readonly<Record<string, readonly string[]>>): Due | null {
  const today = localDayNow()
  const set = deriveCards(events, refs === undefined ? appKcsOfRef : kcsOfRefWith(refs), today, { servable: (card) => servable(card) })
  const plan = planFor(set, today)
  if (plan.kind !== 'list' || plan.session.lines.length === 0) return null
  return { count: plan.session.lines.length, minutes: Math.max(1, Math.round(plan.session.seconds / 60)) }
}
