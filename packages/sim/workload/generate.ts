// Seeded workloads (ARCHITECTURE §5.2 `workload`; WORLD §2.2): arrivals, lengths, and what requests share, drawn from tables or
// replayed from a recorded slice.
//
// One seed gives one workload, and each part of it has a sub-stream of its own (`rngFor(seed, 'workload/<part>')`), so changing
// what the adapters do never moves an arrival or a length. Every part draws the same number of values for each request whether or
// not the request uses it (a share of 0 or of 1,000 consumes as much as any other), and the draws of request i are made in order of i.
//
// Closed-loop clients are not drawn here. A client sends when the server has answered, so the benchmark (§5.6) owns their
// timing: it takes the shapes of requests from a workload and ignores `dueUs`.

import { expDelayUs } from '../core/exp'
import type { Seed } from '../core/types'
import { drawWorkload } from './draw'
import type { WorkloadSpec } from './draw'
import type { Workload } from './types'

export * from './draw'

/**
 * A workload drawn from the tables and distributions of `spec`, under `seed`. It is synthetic, and says so. A Poisson process draws
 * its gaps from the committed exponential table (`expDelayUs`); everything else is draw.ts's (D-059).
 */
export function genWorkload(seed: Seed, spec: WorkloadSpec): Workload {
  return drawWorkload(seed, spec, expDelayUs)
}
