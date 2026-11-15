// The pure receipt verification rules (ARCHITECTURE §8.5): the caps, the schema, the hashes and the binding, the re-checks, the recomputation of
// performance evidence from raw records, the physics floors, and the verdict. It imports packages/sim, for canonical JSON and for trace and benchmark
// recomputation, and packages/schema (§2.3, enforced by ESLint and verify:boundaries). This package builds under tsconfig.app.json.
//
// W2-T07 added rules 1 to 6, in the files that carry their names: caps.ts, schema.ts, integrity.ts, binding.ts, identity.ts and pins.ts, with
// verify.ts to run them in order on a file, and report.ts for what they leave behind. W2-T08 added rules 7 to 10: rechecks.ts (7), bench.ts and
// trace.ts (8), floors.ts (9) and verdict.ts (10), with evidence.ts to read the artifacts, stages.ts to say what each stage asks (ASSESSMENT §5.9), checks.ts for
// what the checks share and evaluate.ts to run them. The package reads no ledger and no clock: what a rule needs of the page (the challenges,
// the published graders, the pins, the moment, the hardware atlas, what each stage declares, the reference banks) comes in as data.
//
// How the pieces fit:
//   check   verifyBundle(file, { book, nowMs, graders, pins, atlas, stages, banks }) runs rules 1 to 9 and answers `refused` (a file that is not a
//           receipt) or `checked`, with the verdict of rule 10.
//   keep    storedReport(outcome.rules, outcome.sizes) is what the ledger's receipts store keeps beside the receipt.
//   read    readStoredReport(json) gives a stored report back, or null; verdictOf(receipt, report.rules, report.ran) is its verdict, worked out when read.
export * from './limits'
export * from './report'
export { cut, grouped, plural, when } from './format'
export { readBundle } from './caps'
export type { ReadResult } from './caps'
export { parseBundle, pointer } from './schema'
export type { ParseResult } from './schema'
export { scanShape } from './shape'
export type { ShapeReason, ShapeResult } from './shape'
export { canonicalBytes, decodeBase64, sha256Hex, toHex } from './hashing'
export { checkIntegrity } from './integrity'
export type { IntegrityResult } from './integrity'
export { CHALLENGE_TTL_DAYS, checkBinding, stateAt } from './binding'
export type { BookedChallenge, ChallengeBook, ChallengeState } from './binding'
export { checkGrader } from './identity'
export type { PublishedGrader } from './identity'
export { checkPins, ENGINELESS_LABS } from './pins'
export type { Compatible, EnginePin, PinOptions, PinTable } from './pins'
export { findGpu, gpusNamed, gpusOf, PEAK_MARGIN_PERMILLE, READ_PERMILLE, readFloorNs } from './atlas'
export type { Atlas, AtlasEntry } from './atlas'
export type { ArgmaxBank, Banks, ModelFile, StageDeclaration, StageDeclarations } from './checks'
export {
  ACCEPTANCE_FORMAT,
  ARGMAX_FORMAT,
  BENCH_LOG_FORMAT,
  IDENTITY_FORMAT,
  MAX_BENCH_ROWS,
  MAX_RECHECK_ROWS,
  STATUS,
  TRACE_FORMAT,
} from './evidence'
export { LITTLES_PERMILLE, P99_ROWS, warmupRows } from './bench'
export { NEAR_TIE_MILLI, TIE_SHARE_PERMILLE } from './rechecks'
export { ALIASES, canonical, isPractice, PENDING, stageRow, STAGES } from './stages'
export type { Stage } from './stages'
export { CHECK_IDS } from './ids'
export { attestedBound, verdictOf } from './verdict'
export type { Verdict, VerdictCheck, VerdictProvenance } from './verdict'
export { verifyBundle } from './verify'
export type { CheckedOutcome, Outcome, RefusedOutcome, VerifyContext } from './verify'
