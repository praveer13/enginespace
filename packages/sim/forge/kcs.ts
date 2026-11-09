// The knowledge components that each graded forge lab's checks assess (content/kc/graph.yaml), by lab id and check id. A lab is graded
// by its checks on seeds drawn at grade time (ASSESSMENT §4.5), so a check names the KCs it assesses, as an item family and a game do,
// and `verify:kc` reads this table as its source of lab checks (scripts/verify-kc.ts): a check id that the lab does not have, or a KC that
// the graph does not have, fails the gate. The toy lab is the forge's practice lab and names none. A lab that grades adds its row here
// (W2-T29's `kv-publisher`). Data only, like the rest of packages/sim.
import { HYBRID_KV_CHECKS, HYBRID_KV_KCS } from './hybrid-kv'
import { REJECTION_SAMPLER_CHECKS, REJECTION_SAMPLER_KCS } from './rejection-sampler'
import type { PlannedCheck } from './toy'

export interface LabCheckKcs {
  /** The lab's checks, in grading order, as the site runs them. */
  checks: readonly PlannedCheck[]
  /** The KCs each check assesses, by check id. A check that is not listed assesses none of the graph's KCs. */
  kcs: Readonly<Record<string, readonly string[]>>
}

export const LAB_CHECK_KCS: Readonly<Record<string, LabCheckKcs>> = {
  'hybrid-kv': { checks: HYBRID_KV_CHECKS, kcs: HYBRID_KV_KCS },
  'rejection-sampler': { checks: REJECTION_SAMPLER_CHECKS, kcs: REJECTION_SAMPLER_KCS },
}
