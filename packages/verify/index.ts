// The pure receipt verification rules (ARCHITECTURE §8.5): the caps, the schema, the hashes and the binding, and, to come, recomputation. It
// imports packages/sim, for canonical JSON now and for trace and benchmark recomputation later, and packages/schema (§2.3, enforced by ESLint
// and verify:boundaries). This package builds under tsconfig.app.json.
//
// W2-T07 adds rules 1 to 6, in the files that carry their names: caps.ts, schema.ts, integrity.ts, binding.ts, identity.ts and pins.ts, with
// verify.ts to run them in order on a file, and report.ts for what they leave behind. W2-T08 adds rules 7 to 10 and the verdict. The package
// reads no ledger and no clock: what a rule needs of the page (the challenges, the published graders, the pins, the moment) comes in as data.
//
// How the pieces fit:
//   check   verifyBundle(file, { book, nowMs, graders, pins }) runs rules 1 to 6 and answers `refused` (a file that is not a receipt) or `checked`.
//   keep    storedReport(outcome.rules, outcome.sizes) is what the ledger's receipts store keeps beside the receipt.
//   read    readStoredReport(json) gives a stored report back, or null; verdictOf(report.rules, report.ran) is its verdict, worked out when read.
export * from './limits'
export * from './report'
export { cut, grouped, plural, when } from './format'
export { readBundle } from './caps'
export type { ReadResult } from './caps'
export { parseBundle, pointer } from './schema'
export type { ParseResult } from './schema'
export { canonicalBytes, decodeBase64, sha256Hex, toHex } from './hashing'
export { checkIntegrity } from './integrity'
export type { IntegrityResult } from './integrity'
export { CHALLENGE_TTL_DAYS, checkBinding, stateAt } from './binding'
export type { BookedChallenge, ChallengeBook, ChallengeState } from './binding'
export { checkGrader } from './identity'
export type { PublishedGrader } from './identity'
export { checkPins, ENGINELESS_LABS } from './pins'
export type { Compatible, EnginePin, PinOptions, PinTable } from './pins'
export { verifyBundle } from './verify'
export type { CheckedOutcome, Outcome, RefusedOutcome, VerifyContext } from './verify'
