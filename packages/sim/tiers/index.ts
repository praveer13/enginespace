// `tiers` (ARCHITECTURE §5.8, D-034): three tiers of KV blocks (GPU, CPU, disk), the operations that store, offload, load and evict
// between them, the `kv-events@1` stream the tiers publish, a reference consumer that rebuilds the cache view from it, the minimal
// connector contract, and the judge that holds a publisher to all of it (the `kv-publisher` lab, W2-T29; the Switchyard, W2-T30).
//
// Where to start:
//   tiersSpec(capacity?, blockTokens?)  a small spec; tiersReference(spec): apply(op) → reply, state() (the truth), events()
//   tiersOps(seed, spec, n)             a seeded stream of operations, with refusals in it
//   tiersConsumerView(batches, spec?)   what a consumer of the events believes, and the problems it met
//   tiersJudge(spec, ops, candidate)    the first operation at which a publisher departs from the reference, and the checks that fail
//   tiersConnector(model)         the connector contract over a model
export * from './types'
export { TiersReference, assertTiersSpec, tiersCleared, tiersReference, tiersRemoved, tiersStored } from './reference'
export { TiersConsumer, tiersConsumerView } from './consumer'
export type { TiersConsumerProblem } from './consumer'
export { TIERS_CHECKS, tiersJudge } from './judge'
export type { TiersCheckId, TiersFailure, TiersJudgement } from './judge'
export { tiersOps, tiersSpec } from './ops'
export { tiersConnector } from './connector'
export type { TierConnector } from './connector'
