// The bestiary of the rejection sampler (ARCHITECTURE §5.10; ASSESSMENT §4.5; curriculum TR6 §5): known-wrong verifiers, which every
// check on the learner's sampler must tell from the exact one. TRACKER W1-T27 builds the same six as wasm modules for the forge lab,
// and the Verifier's `mutants` level shows a version of them (GAMES.md §10), so each member says here what its code does.
//
// Five of the six change the output distribution by an amount that a chi-square test on 20,000 draws sees (check.ts). The sixth is
// SGLang PR #35798, opened 2026-08-21 (claims sglang.spec.pr-35798 and sglang.spec.pr-35798-fix): `TreeSpeculativeSamplingTargetOnly`
// drew coins from [0, 1) but chose the target CDF bucket with `coin <= cumulative_probability`, which at coin == 0 accepts a draft token
// whose target probability is zero. Translated to integer coins, `u <= p_x` accepts one coin value too many. That moves each affected
// token's probability by 1/65,536 [derived], which no sample of 20,000 draws sees. What a sample can see is the leak: a token that p
// rules out (weight 0) is accepted at coin 0, so the output holds a token that p forbids, which is a certain failure and not a
// statistical one. It happens about once in 65,536 rounds for each such token that the drafter proposes [derived], so only a target
// with many of them shows it: the sparse band's. The exhaustive look at the accept step, `acceptStepViolations` (check.ts), sees the
// member on every case. The measured rates of both are in tests/sim/spec-rates.test.ts.

import { below } from '../core/rng'
import type { Rng } from '../core/rng'
import { walkCdf } from './dist'
import type { Dist } from './dist'
import { EXACT_RULES, bonusEnd, exactChain, recoverFromResidual, runChain } from './verify'
import type { ChainStep, ChainVerifier, VerifyRules } from './verify'

export type BestiaryId =
  | 'accept-if-p-over-q'
  | 'resample-from-p'
  | 'resample-from-q'
  | 'residual-off-by-one'
  | 'boundary-inclusive'
  | 'fly-lossy'

export interface Member {
  readonly id: BestiaryId | 'reference'
  /** The tracker's words for it (W1-T27). */
  readonly label: string
  /** What the code gets wrong, in a sentence. */
  readonly bug: string
  readonly verify: ChainVerifier
  /** Its accept decision for a draft with weights px and qx and the coin u in [0, qx): what the exhaustive accept-step check enumerates. */
  readonly accept: VerifyRules['accept']
}

const withRules =
  (rules: VerifyRules): ChainVerifier =>
  (p, q, draft, rng) =>
    runChain(rules, p, q, draft, rng)

/** A rejection that resamples from the whole of `from` instead of from the residual. */
const resampleFrom =
  (pick: (p: Dist, q: Dist) => Dist): VerifyRules['recover'] =>
  (p, q, rng: Rng) => {
    const from = pick(p, q)
    const draw = below(rng, from.total)
    return { kind: 'recovered', draw, total: from.total, token: walkCdf(from.weights, draw) }
  }

/** A position the stand-in below calls high-entropy: no token has half the weight. FLy's own gate is an entropy over the target's top-k probabilities. */
export function flatPosition(d: Dist): boolean {
  let top = 0
  for (const w of d.weights) if (w > top) top = w
  return top * 2 < d.total
}

/** How many native decisions after a rejection must all accept for the FLy-style rule to defer it. */
export const FLY_WINDOW = 1

/**
 * A FLy-style lossy rule. vLLM's `fly` method "can defer a native rejection at a high-entropy position when the following draft
 * tokens remain aligned with native verification" (vLLM v0.33.0 docs/features/speculative_decoding/fly.md, line 3, accessed
 * 2026-11-04), and it is "intentionally lossy" (claim vllm.spec.fly-lossy). This stand-in does that and no more: at a native
 * rejection in a flat position, if the next FLY_WINDOW native decisions would all accept, it keeps the draft and walks on. It is the
 * course's example of a loose-acceptance rule and not FLy's algorithm (arXiv 2511.22972), whose gate and window logic were not read
 * for this model [unverified]. It needs more than FLY_WINDOW drafts to ever fire. The coins of later positions are drawn when the
 * lookahead first needs them, in position order.
 */
export const flyChain: ChainVerifier = (p, q, draft, rng) => {
  const coins: number[] = []
  const coin = (i: number): number => {
    while (coins.length <= i) coins.push(below(rng, q[coins.length].weights[draft[coins.length]]))
    return coins[i]
  }
  const native = (i: number): boolean => EXACT_RULES.accept(p[i].weights[draft[i]], q[i].weights[draft[i]], coin(i))
  const steps: ChainStep[] = []
  const tokens: number[] = []
  for (let i = 0; i < draft.length; i++) {
    let accepted = native(i)
    if (!accepted && i + FLY_WINDOW < draft.length && flatPosition(p[i])) {
      accepted = true
      for (let j = 1; j <= FLY_WINDOW && accepted; j++) accepted = native(i + j)
    }
    steps.push({ token: draft[i], u: coin(i), accepted })
    if (!accepted) {
      const end = EXACT_RULES.recover(p[i], q[i], rng)
      tokens.push(end.token)
      return { steps, accepted: i, end, tokens }
    }
    tokens.push(draft[i])
  }
  const end = bonusEnd(p[draft.length], rng)
  tokens.push(end.token)
  return { steps, accepted: draft.length, end, tokens }
}

/** The exact verifier, listed with the bestiary so that a check can run the whole list and expect the first to pass and the rest to fail. */
export const REFERENCE: Member = {
  id: 'reference',
  label: 'the exact rejection sampler',
  bug: 'none: accept when u < p, recover from the residual (p − q)⁺',
  verify: exactChain,
  accept: EXACT_RULES.accept,
}

export const BESTIARY: readonly Member[] = [
  {
    id: 'accept-if-p-over-q',
    label: 'accept when p > q',
    bug: 'accepts a draft exactly when p > q at its token and rejects it otherwise, with no coin, so a draft with q ≥ p is never accepted',
    verify: withRules({ accept: (px, qx) => px > qx, recover: EXACT_RULES.recover }),
    accept: (px, qx) => px > qx,
  },
  {
    id: 'resample-from-p',
    label: 'accept with p/q but resample from p',
    bug: 'accepts correctly, then resamples a rejected draft from p itself instead of from the residual (p − q)⁺',
    verify: withRules({ accept: EXACT_RULES.accept, recover: resampleFrom((p) => p) }),
    accept: EXACT_RULES.accept,
  },
  {
    id: 'resample-from-q',
    label: 'resample from q',
    bug: 'accepts correctly, then resamples a rejected draft from the draft distribution q',
    verify: withRules({ accept: EXACT_RULES.accept, recover: resampleFrom((_p, q) => q) }),
    accept: EXACT_RULES.accept,
  },
  {
    id: 'residual-off-by-one',
    label: 'an off-by-one in the residual',
    bug: 'draws the residual correctly and returns the next token index, wrapping at the end of the vocabulary: a 1-based position taken for a 0-based one',
    verify: withRules({
      accept: EXACT_RULES.accept,
      recover: (p, q, rng) => {
        const end = recoverFromResidual(p, q, rng)
        return { ...end, token: (end.token + 1) % p.weights.length }
      },
    }),
    accept: EXACT_RULES.accept,
  },
  {
    id: 'boundary-inclusive',
    label: 'the boundary-inclusive comparison of SGLang PR #35798',
    bug: 'compares with <= where < is right, in the accept step (u <= p_x) and in the walk over the residual (draw <= running total): the translation of `coin <= cumulative_probability` to integer coins. It accepts one coin value too many, and returns a zero-weight first token for draw 0',
    verify: withRules({ accept: (px, _qx, u) => u <= px, recover: (p, q, rng) => recoverFromResidual(p, q, rng, true) }),
    accept: (px, _qx, u) => u <= px,
  },
  {
    id: 'fly-lossy',
    label: 'a FLy-style lossy rule',
    bug: 'defers a native rejection at a flat position when the next native decision would accept, so the output drifts from p toward q',
    verify: flyChain,
    accept: EXACT_RULES.accept,
  },
]
