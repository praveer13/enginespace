/**
 * What Rejection sampler's levels say, by level id (R-T02, R-T04): the title in the level menu, the goal line, the line a level opens on,
 * and for a graded level its pass rule. The words are display copy and no rule reads them, so they are not in a level or a state:
 * rewording one moves no state hash and no golden. The view reads them here by id (`verifierView`), and `levelTitle` serves the registry's
 * record.
 *
 * The words are the engine's and the paper's (REDESIGN §2.7, D-063): draft model and q, target model and p, accept, residual, bonus token,
 * γ. Only a pass rule carries a digit, the level's own bar, and tests/copy/game-copy.test.ts reads the bar from the session's grade and
 * finds it there; the figures are in the mirror, the readouts and the drawing, each tagged synthetic.
 */
import type { GoalLine } from '../types'
import type { VerifierLevelId } from './types'

export interface LevelCopy {
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  /** A graded level's pass rule, stated before the run (REDESIGN §2.6), with the level's bar in it. */
  readonly passRule?: string
}

/** ASSESSMENT §4.3's bars, as `verifierGrade` computes them. */
const EXACT_PASS = "Passes when the output's total variation distance from p is exactly 0."
const CHAIN_PASS = 'Passes when your prediction is within 1% of the exact tokens per round.'
const GAMMA_PASS = 'Passes when you choose the draft length with the best speedup.'

export const VERIFIER_COPY: Readonly<Record<VerifierLevelId, LevelCopy>> = {
  overlap: {
    title: 'Acceptance rate: the overlap of p and q',
    goal: {
      aim: 'Find the acceptance rate α of one draft position.',
      controls: 'You predict how many sixty-fourths the target accepts, then draw rounds to watch it.',
      beat: 'The number to beat is the exact overlap, to within one sixty-fourth.',
      ends: 'Ends when you submit your count.',
    },
    prompt:
      'The draft model proposes each token with probability q, and the target model would emit it with probability p, both counted in sixty-fourths over six tokens. The target accepts the share the two have in common: the overlap, min(p, q), which is the acceptance rate α. Predict how many sixty-fourths it accepts, then draw rounds.',
  },
  exact: {
    title: 'Resample from the residual',
    goal: {
      aim: 'Make the output of the rejection sampler exactly the target distribution p.',
      controls: 'You set the weight each token is resampled with after a rejection.',
      beat: EXACT_PASS,
      ends: 'Ends when you submit the weights.',
    },
    prompt:
      'The target accepts a draft token with probability min(1, p ÷ q), the accept rule. When it rejects one, it resamples from weights you set for each token. Set the weights until the output is p exactly (total variation distance zero), then submit.',
    passRule: EXACT_PASS,
  },
  chain: {
    title: 'Tokens per round with γ drafts',
    goal: {
      aim: 'Count the tokens one round of γ draft tokens yields on average.',
      controls: 'You predict the tokens per round, then draw rounds to watch them.',
      beat: CHAIN_PASS,
      ends: 'Ends when you submit your prediction.',
    },
    prompt:
      'The draft model proposes a run of γ tokens, and the target checks them in order. It stops at the first rejection, and samples one bonus token itself when it accepts them all. Predict how many tokens a round yields on average.',
    passRule: CHAIN_PASS,
  },
  'greedy-ngram': {
    title: 'Greedy target, n-gram draft',
    goal: {
      aim: 'Verify an n-gram draft at temperature zero and at full temperature.',
      controls: 'You say whether the drafted token is accepted, then set the residual weights.',
      beat: 'The number to beat is two right answers: the verdict, and a distance from p of zero.',
      ends: 'Ends when you submit both.',
    },
    prompt:
      "An n-gram draft copies the token that followed the same context earlier and knows nothing of how likely it is, so its q puts everything on one token. First, at temperature zero the target always emits its most likely token: is the drafted token accepted? Then, at full temperature, set the residual that still makes the output p exactly.",
  },
  mutants: {
    title: 'Five broken accept rules',
    goal: {
      aim: 'Find the bug in each of five broken rejection samplers.',
      controls: 'You draw rounds from each sampler, or check every draw of its accept step, then name its bug.',
      beat: 'The number to beat is five bugs named right.',
      ends: 'Ends when you submit your five answers.',
    },
    prompt:
      'Five rejection samplers, each wrong in a different way. Draw rounds from a sampler, or check every random draw of its accept step, and name the bug in each one.',
  },
  gamma: {
    title: 'Choose γ',
    goal: {
      aim: 'Choose how many tokens to draft in each round.',
      controls: 'You choose the draft length γ.',
      beat: GAMMA_PASS,
      ends: 'Ends when you submit your γ.',
    },
    prompt:
      'The target verifies a whole run of draft tokens in one forward, and each draft token costs a fraction of a target forward. The further along the run, the less likely a token is reached. Choose the draft length γ that buys the most tokens for the time spent.',
    passRule: GAMMA_PASS,
  },
}
