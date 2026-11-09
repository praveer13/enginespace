// `lifecycle` (ARCHITECTURE §5.2, §5.8; GAMES.md §5; the `lifecycle` card): one request's path through vLLM, SGLang and the three reading targets
// as data. Each path is a list of stages with a location (process, thread, device) and a mechanism (queue, IPC, shared memory, copy, launch,
// collective, sync, or a call), and each stage cites its file, symbol and line at the commit that course.lock.json pins for the engine. The
// model also writes a scenario's path out as a synthetic `trace@1` that passes `traceChecks`, for TR1's span checks. W1-T16 builds it;
// Back of House (W1-T17) plays it and TR1's graded `map` (W1-T19) checks a laid path against its traces.
//
// The notional-machine card of this world is `content/cards/lifecycle.md` (W1-T07 wrote it, §5.9).
export * from './types'
export { FITS, RULES, boundaryOf, describePlace, legal, pathFacts, samePlace, stageFits, walk } from './legal'
export type { Boundary, PathFacts, WalkResult } from './legal'
export { ENGINES, describeScenario, engineStages, entryOf, invalidReason, referencePath, scenarios } from './paths'
export { CLEAN_LIFECYCLE_JITTER, DEFAULT_LIFECYCLE_JITTER, NOMINAL_NS, lifecycleTrace, stageIds, stageSpans } from './trace'
export type { LifecycleJitter } from './trace'
