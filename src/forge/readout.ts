/*
 * The slot readout of the `hybrid-kv` lab's page (TR5a §5, D-042): after the adapter stage passes, the page plays one night of adapter churn
 * on the learner's module and counts what it admitted and how often it loaded an adapter, beside the same night on a model with fixed adapter
 * slots, which needs no module and comes from the sim. packages/sim/forge/slot-night.ts has the night, the engine that plays it and the plan
 * that sends it to a module; this file carries the plan to a fresh instance of the module, within one check's budget, as any check goes.
 *
 * It is a readout and not a check. It is not in the lab's list, it is never recorded, and it earns nothing. A module that traps, spins or
 * leaves the wire costs the readout its module's row and costs the checks above it nothing.
 */

import { slotNight, slotNightPlan } from '@es/sim'
import type { PlannedCheck, SlotNight, SlotNightPlan, SlotYours } from '@es/sim'
import type { ForgeHost } from './host'
import { runExtra } from './invoke'
import { CHECK_BUDGET_MS } from './protocol'

/** The readout on the page: being played, played, or not playable on this module. */
export type ReadoutState =
  | { status: 'running' }
  | { status: 'ready'; night: SlotNight; yours: SlotYours }
  /** `message` is the reason, in the words a check's result row uses. */
  | { status: 'failed'; night: SlotNight; message: string }

export interface ReadoutOptions {
  budgetMs?: number
  now?: () => number
}

/** Plays the night of the lab on a fresh instance of the loaded module. It never throws. */
export async function runSlotReadout(host: ForgeHost, options: ReadoutOptions = {}): Promise<ReadoutState> {
  const night = slotNight()
  // The runner makes the plan when the instance is open, so the page keeps a hold of it to read its count afterwards.
  const held: { plan: SlotNightPlan | null } = { plan: null }
  const check: PlannedCheck = {
    id: 'slot-night',
    label: 'one night of adapter churn',
    stage: 5,
    seeded: false,
    defaultSeed: night.seed,
    catches: '',
    plan: () => (held.plan = slotNightPlan(night)),
  }
  const result = await runExtra(host, check, options)
  const yours = held.plan?.yours() ?? null
  if (result.status === 'pass' && yours !== null) return { status: 'ready', night, yours }
  // A check's own words for a timeout say that the grader went on with the next check, and the night has none.
  const limit = (options.budgetMs ?? CHECK_BUDGET_MS) / 1000
  return { status: 'failed', night, message: result.status === 'timeout' ? `the module was still playing it after ${limit} s, so the page stopped it.` : result.msg }
}
