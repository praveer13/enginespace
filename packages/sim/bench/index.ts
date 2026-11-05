// `bench` (ARCHITECTURE §5.2, §5.6): arrival processes, the client's intended and actual send times, the coarse server, and the
// statistics of a log: percentiles, the bootstrap interval, goodput, Little's law and arrival adherence. W1-T32 builds the
// broken-benchmark corpus on it, and W2-T08 recomputes a receipt's summary with it.
//
// W1-T32 adds the broken-benchmark corpus (`brokenBenchCase`): ten flaws and a control, each a published claim with the harness and the
// client log behind it, drawn answer first and banded (broken.ts).
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
export {
  BENCH_FLAWS,
  BENCH_MIN_ROWS_FOR_P99,
  BENCH_WARMUP_ROWS,
  BROKEN_CORRECTED_ROWS,
  BROKEN_MAX_ATTEMPTS,
  BROKEN_MIN_RATIO_MILLI,
  FLAW_CLAIMS,
  benchSettled,
  benchWarmupRows,
  bestConstantPerLabel,
  brokenBand,
  brokenBenchCase,
  brokenFlawOf,
  correctBench,
  correctedInterval,
} from './broken'
export type { BenchClaim, BenchFlaw, BrokenAnswer, BrokenBand, BrokenCase, BrokenCorrection, BrokenScene, CorrectionKind } from './broken'
export type { SummarizeOptions, SummaryParams } from './summary'

/** The id of this model's notional-machine card, `content/cards/trace-room-bench.md` (§5.9: each model exports its card id). */
export const BENCH_CARD_ID = 'trace-room-bench'
