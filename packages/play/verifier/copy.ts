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
import { fracText } from './ratio'
import type { VerifierAction, VerifierLevelId, VerifierView } from './types'

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
      aim: 'Count the tokens one round yields on average when the draft model proposes γ and the target model checks them.',
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
      aim: 'Verify an n-gram draft against the target at temperature zero and at full temperature.',
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
      controls: 'You draw rounds from each sampler, or check every draw of its accept step against p and q, then name its bug.',
      beat: 'The number to beat is five bugs named right.',
      ends: 'Ends when you submit your five answers.',
    },
    prompt:
      'Five rejection samplers, each wrong in a different way. Draw rounds from a sampler, or check every random draw of its accept step, and name the bug in each one.',
  },
  gamma: {
    title: 'Choose γ',
    goal: {
      aim: 'Choose how many tokens the draft model proposes in each round.',
      controls: 'You choose the draft length γ, and the target model checks that many.',
      beat: GAMMA_PASS,
      ends: 'Ends when you submit your γ.',
    },
    prompt:
      'The target verifies a whole run of draft tokens in one forward, and each draft token costs a fraction of a target forward. The further along the run, the less likely a token is reached. Choose the draft length γ that buys the most tokens for the time spent.',
    passRule: GAMMA_PASS,
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Parts, the first run and the named moment (REDESIGN §2.6, R-T30)                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A part of the diagram, as the parts list names it: an id, the engine's name, one sentence, the identifier the pinned vLLM gives it where
 * it has one, the levels that draw it, and the claim that sources it. The Parts list, the first-run intro, the source popover and the
 * lesson's dock all read these rows. A part with no claim is a model object: the course's model draws it, and the popover says so.
 */
export interface VerifierPart {
  readonly id: string
  readonly name: string
  readonly sentence: string
  /** The class or term the pinned vLLM names it by, set as code. */
  readonly engine?: string
  /** The levels that draw it, or every level. */
  readonly levels: readonly VerifierLevelId[] | 'all'
  /** The claim (content/claims) that holds its value, its tag and its file and symbol at the pinned commit. */
  readonly claim?: string
}

/** The levels whose drawing is a pair of bars at a draft position: every level but `gamma`. */
const BARS: readonly VerifierLevelId[] = ['overlap', 'exact', 'chain', 'greedy-ngram', 'mutants']
const RUN: readonly VerifierLevelId[] = ['chain', 'gamma']

/** The parts, in the order the list shows them: the two models and the six tokens first, then what the bars decompose into. */
export const VERIFIER_PARTS: readonly VerifierPart[] = [
  {
    id: 'draft',
    name: 'Draft model, q',
    sentence: 'The small, fast model that proposes tokens. Its distribution q gives each of the six tokens a share of 64, drawn as the first bar of each token.',
    engine: 'draft_model',
    levels: 'all',
    claim: 'vllm.spec.methods',
  },
  {
    id: 'target',
    name: 'Target model, p',
    sentence: 'The big model whose output the sampler must match. Its distribution p gives each token a share of 64, drawn as the second bar of each token.',
    levels: 'all',
  },
  {
    id: 'token',
    name: 'Token',
    sentence: 'One of the six tokens of the vocabulary, numbered 0 to 5, each a column of two bars. A real vocabulary holds tens of thousands.',
    levels: BARS,
  },
  {
    id: 'accepted',
    name: 'Accepted, min(p, q)',
    sentence: 'What the bars share: the target accepts a draft token with probability min(1, p ÷ q), so the accepted part of a token is the smaller of its two bars.',
    engine: 'RejectionSampler',
    levels: BARS,
    claim: 'vllm.spec.rejection-sampler.exact',
  },
  {
    id: 'residual',
    name: 'Residual, (p − q)⁺',
    sentence: 'What the target gives a token beyond the draft. After a rejection the sampler resamples from it, token by token; vLLM calls the token it draws a recovered token.',
    engine: 'recovered',
    levels: BARS,
    claim: 'vllm.spec.rejection-sampler.exact',
  },
  {
    id: 'alpha',
    name: 'Acceptance rate, α',
    sentence: 'The share of the draft the target accepts at a position: the accepted parts added over all six tokens, out of 64.',
    levels: 'all',
    claim: 'spec.paper.accept-or-resample',
  },
  {
    id: 'round',
    name: 'Round',
    sentence: 'The draft proposes, the target checks in order and stops at the first rejection. Drawing rounds samples this rule on the numbers above, and the dock counts them.',
    levels: BARS,
    claim: 'spec.paper.accept-or-resample',
  },
  {
    id: 'output',
    name: 'Output',
    sentence: 'What the sampler emitted over the rounds drawn, as a ring on each target bar. When the rule is exact it settles onto p.',
    levels: ['exact', 'chain', 'greedy-ngram'],
    claim: 'vllm.spec.rejection-sampler.exact',
  },
  {
    id: 'position',
    name: 'Draft position',
    sentence: 'The place of a draft token in the round, 1 to γ. Each position has its own p and q, and the walk reaches a position only if every earlier draft token was accepted.',
    levels: RUN,
    claim: 'spec.paper.expected-tokens',
  },
  {
    id: 'bonus',
    name: 'Bonus token',
    sentence: 'When every draft token is accepted, the target adds one more, sampled from p alone, so a round always yields at least one token.',
    engine: 'bonus',
    levels: ['chain'],
    claim: 'vllm.spec.bonus-token',
  },
  {
    id: 'gamma',
    name: 'Draft length, γ',
    sentence: 'How many tokens the draft proposes in a round. A longer draft pays only while the walk still reaches its end.',
    levels: ['chain', 'gamma'],
    claim: 'spec.paper.expected-tokens',
  },
]

/** A part's row by id. */
export const partOf = (id: string): VerifierPart | undefined => VERIFIER_PARTS.find((part) => part.id === id)

/** The parts a level draws, in the list's order. */
export const partsOf = (level: VerifierLevelId): readonly VerifierPart[] => VERIFIER_PARTS.filter((part) => part.levels === 'all' || part.levels.includes(level))

/** What the dock's Step does, in the engine's words: the first move of the level that has one. */
export const DOCK_STEP_WORDS = 'Step draws ten rounds, or adds one to the first token’s weight, or samples the first card, or tries a draft length of one.'

/** What the pointed first move is, in the intro's words: the reference run's own first actions are the answers, so it is never one of them. */
export const FIRST_MOVE_KIND = 'a first move that gives no answer away'

/** What the first move of a level is, in words: the action kind's row. */
export function moveWords(action: VerifierAction): string {
  switch (action.t) {
    case 'draw':
      return `Draw ${action.n} rounds`
    case 'sculpt':
      return `Add one to token ${action.token}’s weight`
    case 'taste':
      return `Sample card ${action.card + 1}`
    case 'gamma':
      return `Try a draft length of ${action.k}`
    case 'preset':
      return `Start the weights from ${action.from}`
    case 'commit':
    case 'judge':
    case 'coins':
    case 'label':
    case 'submit':
      return 'Make your first move'
  }
}

/** What one token's bars say before any answer: its two shares, which are given and never the answer. */
export function lookLine(view: VerifierView, token = 0): string | null {
  const row = view.rows[0]
  if (row === undefined) return null
  const name = view.dishes[token]
  return row.q === null
    ? `${name[0].toUpperCase()}${name.slice(1)}: the target gives it ${row.p[token]} of 64.`
    : `${name[0].toUpperCase()}${name.slice(1)}: the target gives it ${row.p[token]} of 64, and the draft ${row.q[token]} of 64. The part both give is accepted, and what the target gives beyond the draft is the residual.`
}

/** The first move of each level: never an answer. A level's own first ask comes before it. */
export function firstMoveOf(level: VerifierLevelId): VerifierAction {
  switch (level) {
    case 'overlap':
    case 'chain':
      return { t: 'draw', n: 10 }
    case 'exact':
    case 'greedy-ngram':
      return { t: 'sculpt', token: 0, delta: 1 }
    case 'mutants':
      return { t: 'taste', card: 0 }
    case 'gamma':
      return { t: 'gamma', k: 1 }
  }
}

/** A level's own first ask, in the words it is asked in. */
export const ASK_WORDS: Readonly<Record<VerifierLevelId, string>> = {
  overlap: 'Predict how many sixty-fourths the target accepts: the bars’ overlap, added over the six tokens.',
  exact: 'Set the weight each token is resampled with after a rejection, so that the output is p exactly.',
  chain: 'Predict the tokens one round yields on average, to within one part in a hundred.',
  'greedy-ngram': 'At temperature zero, is the n-gram’s token accepted? Say so, then set the weights.',
  mutants: 'Name the bug in each of the five cards: sample it, check every draw of its accept step, then choose.',
  gamma: 'Choose the draft length γ with the best speedup.',
}

/** A named moment: the first time a rule is felt in a level (REDESIGN §2.6). */
export interface VerifierMoment {
  readonly id: string
  readonly line: (before: VerifierView, after: VerifierView) => string | null
}

/** The rounds at which the accepted share has had room to settle on the overlap [estimated]. */
export const SETTLED_ROUNDS = 1000

const share = (view: VerifierView): { kept: number; of: number } | null => {
  const row = view.rows[0]
  if (row === undefined || row.q === null) return null
  return { kept: row.kept, of: row.kept + row.sentBack }
}

export const VERIFIER_MOMENTS: readonly VerifierMoment[] = [
  {
    // Draws of 10, 100 and 1,000 converge: once the rounds drawn reach a thousand, the accepted share has settled on the overlap.
    id: 'draws-settle',
    line: (before, after) => {
      if (after.level !== 'overlap' && after.level !== 'chain') return null
      if (before.counters.rounds >= SETTLED_ROUNDS || after.counters.rounds < SETTLED_ROUNDS) return null
      const seen = share(after)
      const alpha = after.rows[0]?.alpha ?? null
      if (seen === null || seen.of === 0 || alpha === null) return null
      const pct = (seen.kept / seen.of).toFixed(3)
      return `After ${after.counters.rounds.toLocaleString('en-US')} rounds the accepted share is ${pct}, and the overlap of p and q is ${fracText(alpha)}. The accepted share settles on the overlap: that is the acceptance rate α.`
    },
  },
]
