// `forge` (ARCHITECTURE §5.2, §8.3): the oracle side of the forge labs. A plan is a seeded conversation with a learner's module over
// `ks_invoke`, and the model beside it says what a right module answers. The runner that carries the conversation to a worker is
// src/forge/invoke.ts. `toy` is the host's own practice lab (W1-T10), and `hybrid-kv` is TR5a's (W1-T22): its wire, its plan, which
// judges a module with `kvJudge`, and its six checks. Each real lab adds its model and its checks here (W1-T27, W2-T29), and the KCs
// its checks assess to check-kcs.ts, with the row that joins them to the checks in kcs.ts (W1-T38).
export * from './plan'
export * from './toy'
export * from './kv-wire'
export * from './kv-plan'
export * from './hybrid-kv'
export * from './rejection-sampler'
export * from './check-kcs'
export * from './kcs'
