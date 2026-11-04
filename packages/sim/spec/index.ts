// `spec` (ARCHITECTURE §5.2, §5.5): the exact rejection sampler of speculative decoding, in integer weights; the chi-square test of a
// sampler's counts; the acceptance-length model; and the bestiary of wrong samplers that a check must tell from the exact one.
//
// The model's notional-machine card is `content/cards/spec.md` (§5.9, WORLD §5; W1-T07 wrote it, and W1-T26 rewrote it for the built model). What it models: exact
// accept-and-recover in integer weights, the bonus token, draft chains, acceptance length, and chi-square from counts with generated
// critical values. What it ignores: draft trees (a labelled stretch level), the top-k and top-p processing that vLLM applies to the
// target's logits before verification (vllm S3), and the numerics of real logits. What it is calibrated against: nothing, since its
// distributions are synthetic.
//
// Used by the Verifier (W1-T28, W1-T29), the `rejection-sampler` forge lab (W1-T27) and the step loop's speculative step (W1-T12).
// The files: dist.ts (weights and draws), verify.ts (the round), chisquare.ts and critical.ts (the test and its generated table),
// tokens.ts (acceptance length), bestiary.ts (the wrong samplers), draw.ts (seeded pairs) and check.ts (the lab's check).
//
// A host check, in outline: `drawCase(seed, γ)` gives p and q; `labTest([seed1, seed2], p, q, verify)` runs two seeds of 20,000 rounds
// of the sampler under test (any `ChainVerifier`) and says whether either rejects it; `acceptStepViolations(accept, p[0], q[0])` looks
// at every coin of the accept step, which is the only check that sees a bias of 1/65,536. The exact sampler passes both, and each member
// of `BESTIARY` fails at least one of them (the measured rates are in tests/sim/spec-rates.test.ts).

export * from './dist'
export * from './verify'
export * from './chisquare'
export * from './tokens'
export * from './bestiary'
export * from './draw'
export * from './check'

/** The id of this model's notional-machine card, `content/cards/spec.md` (§5.9: each model exports its card id). */
export const SPEC_CARD_ID = 'spec'
