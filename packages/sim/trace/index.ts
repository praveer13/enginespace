// `trace` (ARCHITECTURE §5.2, §5.7): `trace@1`, its codec, synthetic generation from step-loop runs, attribution of a step window,
// and structural checks. W1-T08 builds it. Gap Hunt, the Trace Room, TR1's span checks and receipt verification read traces
// through it (W1-T09, W1-T16, W2-T08, W2-T19, W2-T20).
//
// `busy` (the unions and the sweep that attribution is made of) stays out of this barrel: it is `attribute`'s part, and a model
// that needs it imports it by path.
export * from './types'
export * from './builder'
export * from './codec'
export * from './attribute'
export * from './checks'
export { CLEAN_JITTER, DEFAULT_JITTER, traceFromRun } from './synth'
