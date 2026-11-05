// `forge` (ARCHITECTURE §5.2, §8.3): the oracle side of the forge labs. A plan is a seeded conversation with a learner's module over
// `ks_invoke`, and the model beside it says what a right module answers. The runner that carries the conversation to a worker is
// src/forge/invoke.ts. `toy` is the host's own practice lab; each real lab adds its model and its checks here (W1-T22, W1-T27).
export * from './plan'
export * from './toy'
export * from './rejection-sampler'
