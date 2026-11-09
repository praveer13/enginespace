// `kv` (ARCHITECTURE §5.2, §5.4): a hybrid KV manager. One pool of pages that every group and every adapter draws from, groups that keep
// every block, a window of blocks or a few blocks of state, prefix hashing with the N-group hit, adapters as pages, events, the invariants
// a manager keeps, and the operation streams that exercise them. The Pool plays it (W1-T23), the `hybrid-kv` lab is graded against it
// (W1-T22), and TR5b's connector sits on it (W2-T28).
//
// Where to start:
//   kvPreset(id, pool?, options?)      a spec for one of the presets, or buildKvSpec(model, pool) for a model of your own
//   kvReference(spec)                  the manager: apply(op) → reply, state(), events(); subclass KvReference to break one rule
//   kvOps(seed, spec, n, profile?)     a seeded stream of operations, valid for a manager that answers as the reference does
//   kvInvariants(spec, state)          what a snapshot breaks, each sentence led by the id of its check (KV_CHECKS)
//   kvJudge(spec, ops, candidate)      the first operation at which a candidate departs from the reference, and the checks that fail
//   kvHitLength(spec, state, prompt)   the prefix hit a snapshot would give a prompt, per group and in all
//   kvBlocksHeld, kvAdapterPages       the arithmetic of the rules, for predictions and for the card
//
// The notional-machine card of this world is `content/cards/kv.md` (§5.9).
export * from './types'
export { assertKvSpec, kvAdapterPages, kvAlignment, kvBlockBytes, kvBlocksHeld, kvHitBlocks, kvHitFrom, kvLoraBytes, kvPagesHeld, kvSpecProblems, kvTableRule } from './spec'
export type { KvLoraShape, KvTableRule } from './spec'
export {
  KV_LORA_SHAPE,
  KV_PRESET_IDS,
  KV_PRESET_POOL,
  buildKvSpec,
  kvAdapterCatalog,
  kvPaddingWaste,
  kvPreset,
  kvPresetModel,
} from './presets'
export type { KvAdapterSpec, KvBuildOptions, KvLayerKind, KvModelDesc, KvPresetId } from './presets'
export { kvBlockHash, kvChain, kvExtraKey } from './hash'
export { kvFindHit, kvHitLength } from './lookup'
export type { KvHit } from './lookup'
export { KV_MEDIUM, KV_SPEC_KIND, kvAdapterName, kvCleared, kvConsume, kvConsumerEntries, kvConsumerView, kvRemoved, kvStored } from './events'
export { KvReference, kvReference } from './reference'
export type { KvAdmitGroupPlan, KvAdmitPlan } from './reference'
export type { KvConsumerCounts } from './events'
export { KV_CHECKS, KV_JUDGE_CHECKS, kvInvariants } from './invariants'
export type { KvCheckId } from './invariants'
export { kvJudge } from './judge'
export type { KvFailure, KvJudgement } from './judge'
export { kvOps } from './ops'
export type { KvOpsAdapter, KvOpsProfile } from './ops'
