// `bench` (ARCHITECTURE §5.2, §5.6): arrival processes, the client's intended and actual send times, the coarse server, and the
// statistics of a log: percentiles, the bootstrap interval, goodput, Little's law and arrival adherence. W1-T32 builds the
// broken-benchmark corpus on it, and W2-T08 recomputes a receipt's summary with it.
//
// The notional-machine card of this world is `content/cards/trace-room-bench.md` (W1-T07 writes it, §5.9).
export * from './types'
export { PREFIX_BLOCK_TOKENS, cachedPrefixTokens, planBench } from './plan'
export type { BenchPlan, PlannedRequest } from './plan'
export { checkServer, runServer, s5Server } from './server'
export type { ColdStart, Feed, ServedRequest, ServerArrival, ServerModel, ServerRun, Stall } from './server'
export { runBench } from './run'
export {
  ADHERENCE_HARD_LIMIT_US,
  ADHERENCE_TOLERANCE_US,
  BOOTSTRAP_LEVEL_PERMILLE,
  BOOTSTRAP_RESAMPLES,
  arrivalAdherence,
  bootstrapInterval,
  checkRows,
  e2eUs,
  latencyPercentiles,
  littlesLaw,
  meetsSlo,
  perSMilli,
  tpotUs,
  ttftUs,
} from './stats'
export type { BootstrapOptions, Slo } from './stats'
export { summarize, summarizeRows } from './summary'
export type { SummarizeOptions, SummaryParams } from './summary'

/** The id of this model's notional-machine card, `content/cards/trace-room-bench.md` (§5.9: each model exports its card id). */
export const BENCH_CARD_ID = 'trace-room-bench'
