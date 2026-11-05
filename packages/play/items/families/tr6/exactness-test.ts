/**
 * `tr6.exactness-test`: how a sampler is tested for exactness, and what the test can and cannot see (TR6; KC `tr6.exactness-testing`). It
 * is the exit item of TR6's lesson on testing, and it rests on three facts of the course's lab and of the pinned engine's own test:
 *
 *   df          Pearson's statistic over a sampler's counts follows a chi-square with one degree of freedom fewer than it has bins. vLLM's
 *               own test of its rejection sampler merges every token whose expected count is under 5 into a single "other" bin before it
 *               computes the statistic (claim vllm.spec.chi-square.min-expected), and the course's `chiSquare` does the same and leaves out a
 *               token that the target rules out (packages/sim/spec/chisquare.ts). The scenes keep the merged bin at 5 or more, so the rule has
 *               one reading.
 *   false-fail  The lab tests each of its seeds at a level, 1e-4 in the course's lab, and an exact sampler fails if any seed rejects it
 *               (packages/sim/spec/check.ts; ASSESSMENT §4.6). Two seeds give 1 − (1 − 1e-4)² ≈ 2e-4 [derived].
 *   visible     A sample can see a bias only if it is several standard errors of the frequency it moves. A token of probability p over N
 *               draws has a frequency with standard error √(p(1 − p) ÷ N), and the lab's two kinds of check differ in what they look at:
 *               the chi-square test sees the sample, and an enumeration of every coin of the accept step sees the accept step's rule exactly
 *               (`acceptStepViolations`), whatever size the bias has, and nothing of the recovery draw. A bias of 1 ÷ 65,536 per token is the
 *               boundary-inclusive comparison of SGLang PR #35798 (claim sglang.spec.pr-35798), and a sample of 20,000 draws does not see it.
 *   draws-needed How many draws until a bias equals one standard error: N = p(1 − p) ÷ δ².
 *
 * Every number in a scene is [estimated] and synthetic. `visible` is drawn answer first over its four outcomes, and the other variants
 * draw their scene from grids wide enough that no constant answer is right often.
 */
import { below, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, ItemTag, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { ARITHMETIC, drawOutcome, EXACT, oneOf, shown, workedPart } from './kit'

const FAMILY = 'tr6.exactness-test'
const VERSION = 1
const KC = 'tr6.exactness-testing'

type VariantId = 'df' | 'false-fail' | 'visible' | 'draws-needed'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'df', title: 'The degrees of freedom of the test', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'false-fail', title: 'How often an exact sampler fails by chance', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'visible', title: 'Which check sees a bug', kcs: [KC], levels: [1, 2, 3] },
  { id: 'draws-needed', title: 'Draws until a bias shows', kcs: [KC], levels: [2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

const given = (value: number, unit?: string): NumPart => num(value, { ...(unit === undefined ? {} : { unit }), tag: 'synthetic' })
const derived = (value: number, unit?: string, digits?: number): NumPart => num(value, { ...(unit === undefined ? {} : { unit }), tag: 'derived', ...(digits === undefined ? {} : { digits }) })
const counted = (value: number, one: string, many: string, tag: ItemTag = 'synthetic'): NumPart => num(value, { unit: value === 1 ? one : many, tag })

/* ------------------------------------------------------------------------------------------------------------------ */
/* df                                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Tokens whose expected count N · w ÷ 1000 is under this are pooled (claim vllm.spec.chi-square.min-expected). */
const POOL_BELOW = 5

interface DfScene {
  readonly draws: number
  /** The target's weights in permille, in the order the ticket lists them. */
  readonly weights: readonly number[]
}

const expectedCount = (draws: number, weight: number): number => (draws * weight) / 1000

/** The bins of the test: each token kept alone, the pooled ones as one, and the tokens the target rules out as none. */
export function binsOf(scene: DfScene): { kept: number; pooled: number; poolExpected: number; ruledOut: number } {
  let kept = 0
  let pooled = 0
  let poolExpected = 0
  let ruledOut = 0
  for (const w of scene.weights) {
    if (w === 0) ruledOut += 1
    else if (expectedCount(scene.draws, w) < POOL_BELOW) {
      pooled += 1
      poolExpected += expectedCount(scene.draws, w)
    } else kept += 1
  }
  return { kept, pooled, poolExpected, ruledOut }
}

export function degreesOfFreedom(scene: DfScene): number {
  const { kept, pooled } = binsOf(scene)
  return kept + (pooled > 0 ? 1 : 0) - 1
}

const DRAWS = [1000, 2000, 4000] as const

/**
 * A scene with `kept` tokens tested alone, `pooled` tokens (0, or 2 to 4) merged, and a few the target rules out, in a shuffled order. The
 * weights are whole permille. The pooled tokens' expected counts add up to 5 or more, so the merged bin is a bin of its own.
 */
function drawDf(level: Level, seed: Seed, purpose: string): DfScene {
  const rng = itemRng(FAMILY, 'df', level, seed, purpose)
  const draws = oneOf(rng, DRAWS)
  const kept = 2 + below(rng, 11)
  const limit = POOL_BELOW * 1000 // a weight under limit / draws is pooled
  const lowest = Math.ceil(limit / draws)
  const pooledWeights: number[] = []
  const pools = oneOf(rng, [0, 0, 2, 3, 4])
  for (let i = 0; i < pools; i += 1) pooledWeights.push(1 + below(rng, lowest - 1))
  const zeros = below(rng, 3)
  const rest = 1000 - pooledWeights.reduce((a, b) => a + b, 0)
  // The kept tokens: the least weight each, and the rest of the permille handed out in lumps of a few.
  const keptWeights = Array.from({ length: kept }, () => lowest)
  let left = rest - lowest * kept
  while (left > 0) {
    const lump = Math.min(left, 1 + below(rng, 5))
    keptWeights[below(rng, kept)] += lump
    left -= lump
  }
  const weights = shuffle(rng, [...keptWeights, ...pooledWeights, ...Array.from({ length: zeros }, () => 0)])
  return { draws, weights }
}

function dfIsFair(scene: DfScene): boolean {
  const { kept, pooled, poolExpected } = binsOf(scene)
  if (kept < 2 || scene.weights.reduce((a, b) => a + b, 0) !== 1000) return false
  // The merged bin is a bin of its own: 5 or more expected. A lone token under 5 would join a neighbour, and that is another rule.
  return pooled === 0 || poolExpected >= POOL_BELOW
}

function dfSteps(scene: DfScene, level: Level): Step[] {
  const { kept, pooled, poolExpected, ruledOut } = binsOf(scene)
  const out: Step[] = [
    {
      text: rich('A token\'s expected count is the draws times its weight: ', given(scene.draws, 'draws'), ' × its weight ÷ one thousand. Tokens under five are pooled into one bin, and a token with weight zero is no bin at all', ruledOut > 0 ? ', which leaves out ' : '', ...(ruledOut > 0 ? [counted(ruledOut, 'token', 'tokens', 'derived')] : []), '.'),
    },
  ]
  const bins = kept + (pooled > 0 ? 1 : 0)
  out.push({
    text:
      pooled > 0
        ? rich(counted(kept, 'token', 'tokens', 'derived'), ' stand alone and ', counted(pooled, 'token', 'tokens', 'derived'), ' are pooled into one bin: ', counted(bins, 'bin', 'bins', 'derived'), '.')
        : rich(counted(kept, 'token', 'tokens', 'derived'), ' stand alone and none is pooled: ', counted(bins, 'bin', 'bins', 'derived'), '.'),
  })
  if (level === 3) {
    if (pooled > 0) out.push({ text: rich('The pooled tokens\' expected counts add up to ', derived(poolExpected, 'draws'), ', which is not under five, so the merged bin counts as a bin of its own.') })
    out.push({ text: rich('The test has ', counted(kept, 'bin', 'bins', 'derived'), ' for the tokens kept alone and one for the pool: ', counted(bins, 'bin', 'bins', 'derived'), '.'), result: counted(bins, 'bin', 'bins', 'derived') })
    return out
  }
  out.push({ text: rich('The degrees of freedom are one fewer than the bins: ', counted(bins, 'bin', 'bins', 'derived'), ' − one = ', derived(bins - 1), '.'), result: derived(bins - 1) })
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* false-fail                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Each seed's test has a level of 1 in these [estimated], and the check runs this many seeds. */
const LEVELS_OF = [1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000] as const

/** The share of attempts at an exact sampler that fail by chance: `1 − (1 − 1/A)^seeds`, by repeated products (D-017). */
export function falseFailShare(oneIn: number, seeds: number): number {
  let pass = 1
  for (let s = 0; s < seeds; s += 1) pass *= (oneIn - 1) / oneIn
  return 1 - pass
}

interface FailScene {
  readonly oneIn: number
  readonly seeds: number
}

function drawFail(level: Level, seed: Seed, purpose: string): FailScene {
  const rng = itemRng(FAMILY, 'false-fail', level, seed, purpose)
  return { oneIn: oneOf(rng, LEVELS_OF), seeds: 1 + below(rng, 6) }
}

const failKey = (scene: FailScene, level: Level): number => (level === 3 ? Math.round(falseFailShare(scene.oneIn, scene.seeds) * 1_000_000) / 1000 : Math.round(falseFailShare(scene.oneIn, scene.seeds) * 1_000_000))

function failSteps(scene: FailScene, level: Level): Step[] {
  const share = falseFailShare(scene.oneIn, scene.seeds)
  const per = level === 3 ? 1000 : 1_000_000
  const key = failKey(scene, level)
  return [
    {
      text: rich('A seed rejects an exact sampler one time in ', given(scene.oneIn), '. The sampler fails the check if any of the ', counted(scene.seeds, 'seed', 'seeds'), ' rejects it, so it passes only if every one of them passes.'),
    },
    {
      text: rich('It passes all of them with probability ', code('(1 − 1/A)^S'), ' and fails with the rest, about ', counted(scene.seeds, 'seed', 'seeds'), ' ÷ ', given(scene.oneIn), ' = ', derived(Math.round(share * 1_000_000) / 1_000_000, undefined, 6), ' of attempts.'),
    },
    { text: rich('Of every ', given(per, 'attempts'), ' that is ', derived(key, 'attempts', level === 3 ? 3 : 0), '.'), result: derived(key, 'attempts', level === 3 ? 3 : 0) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* visible, and draws-needed                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Where = 'accept' | 'recovery'
export type Size = 'large' | 'tiny'
/** Which of the lab's checks see a bug: both, only the chi-square test, only the enumeration of the accept step, or neither. */
export type Seen = 'both' | 'chi' | 'enumeration' | 'neither'
const SEEN: readonly Seen[] = ['both', 'chi', 'enumeration', 'neither']

const SEEN_TEXT: Readonly<Record<Seen, Rich>> = {
  both: rich('Both: the chi-square test and an enumeration of the accept step'),
  chi: rich('Only the chi-square test'),
  enumeration: rich('Only an enumeration of every coin of the accept step'),
  neither: rich('Neither of the two'),
}

export interface Bug {
  readonly where: Where
  /** The bias on each affected token, in parts per million of the total. */
  readonly ppm: number
  /** The affected token's probability, in permille. */
  readonly permille: number
  readonly draws: number
}

/** z² × 1,000,000 · q(1000 − q) = δ² · N, with δ in ppm and q in permille: compared, so that no square root is taken. */
const zSquaredTimes = (b: Bug): number => b.ppm * b.ppm * b.draws
const noise = (b: Bug): number => 1_000_000 * b.permille * (1000 - b.permille)

/** The size of the bias against the noise of the sample: `large` is eight standard errors or more, `tiny` a tenth of one or less, and anything between is out of band. */
export function sizeOf(b: Bug): Size | null {
  if (zSquaredTimes(b) >= 64 * noise(b)) return 'large'
  if (zSquaredTimes(b) * 100 <= noise(b)) return 'tiny'
  return null
}

export function seenOf(b: Bug): Seen | null {
  const size = sizeOf(b)
  if (size === null) return null
  if (b.where === 'accept') return size === 'large' ? 'both' : 'enumeration'
  return size === 'large' ? 'chi' : 'neither'
}

/** The standard error of the token's frequency, in ppm: `√(p(1 − p) ÷ N)`. */
export const standardErrorPpm = (b: Bug): number => Math.sqrt(noise(b) / b.draws)

const PERMILLE_OF_TOKEN = [60, 100, 150, 200, 250, 300, 400, 500] as const
const DRAWS_OF_TEST = [5000, 10_000, 20_000, 50_000] as const

function drawBug(level: Level, seed: Seed, seen: Seen, purpose: string): Bug {
  const rng = itemRng(FAMILY, 'visible', level, seed, purpose)
  const where: Where = seen === 'both' || seen === 'enumeration' ? 'accept' : 'recovery'
  const wantLarge = seen === 'both' || seen === 'chi'
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const permille = oneOf(rng, PERMILLE_OF_TOKEN)
    const draws = oneOf(rng, DRAWS_OF_TEST)
    // A tiny bias is a coin in 65,536 of the accept step or the recovery's walk, 15 ppm; a large one is a few percent.
    const ppm = wantLarge ? oneOf(rng, [20_000, 30_000, 40_000, 60_000, 80_000]) : oneOf(rng, [15, 15, 31, 61])
    const bug: Bug = { where, ppm, permille, draws }
    if (seenOf(bug) === seen) return bug
  }
  return { where, ppm: wantLarge ? 40_000 : 15, permille: 250, draws: 20_000 }
}

function visibleSteps(b: Bug): Step[] {
  const sigma = standardErrorPpm(b)
  const seen = seenOf(b)
  const out: Step[] = [
    {
      text: rich('The sample\'s noise on a token of probability ', given(b.permille, '‰'), ' over ', given(b.draws, 'draws'), ' is its standard error, ', code('√(p(1 − p) ÷ N)'), ' = ', derived(Math.round(sigma), 'ppm'), '. The bug moves the token by ', given(b.ppm, 'ppm'), '.'),
      result: derived(Math.round(sigma), 'ppm'),
    },
  ]
  out.push({
    text:
      sizeOf(b) === 'large'
        ? rich('That is many standard errors, so a chi-square test on the sample sees it on nearly every seed.')
        : rich('That is a small fraction of one standard error, so no sample of this size can tell the bug from noise: the chi-square test misses it.'),
  })
  out.push({
    text:
      b.where === 'accept'
        ? rich('The bug is in the accept step, whose rule can be checked exactly by trying every coin of every token and counting how many it keeps, so that enumeration sees it whatever its size.')
        : rich('The bug is in the recovery draw. An enumeration of the accept step looks at the accept rule only and does not see it.'),
  })
  out.push({ text: seen === 'both' ? rich('Both checks see it.') : seen === 'chi' ? rich('Only the chi-square test sees it.') : seen === 'enumeration' ? rich('Only the enumeration sees it.') : rich('Neither sees it.') })
  return out
}

function visibleOptions(bug: Bug, level: Level, seed: Seed): ChoiceOption[] {
  const truth = seenOf(bug)
  const steps = visibleSteps(bug)
  const sigma = derived(Math.round(standardErrorPpm(bug)), 'ppm')
  const lure = (id: Seen): Rich => {
    switch (id) {
      case 'both':
        return bug.where === 'recovery' ? rich('The enumeration looks at the accept step, and this bug is in the recovery draw.') : rich('The chi-square test does not see a bias this small against ', sigma, ' of noise.')
      case 'chi':
        return bug.where === 'accept' ? rich('The enumeration of the accept step sees this bug too, because it is in the accept step.') : rich('The chi-square test does not see a bias this small against ', sigma, ' of noise.')
      case 'enumeration':
        return bug.where === 'recovery' ? rich('The enumeration looks at the accept step, and this bug is in the recovery draw.') : rich('The chi-square test sees this one too: the bias is many standard errors of ', sigma, '.')
      case 'neither':
        return bug.where === 'accept' ? rich('The enumeration of the accept step sees every bug in the accept step, whatever its size.') : rich('The bias is many standard errors of ', sigma, ', so the chi-square test sees it.')
    }
  }
  return shown(
    FAMILY,
    'visible',
    level,
    seed,
    SEEN.map((id): ChoiceOption => ({ id, text: SEEN_TEXT[id], why: id === truth ? steps[steps.length - 1].text : lure(id), ...(id === truth ? {} : { miss: `${FAMILY}.${id}-taken-for` }) })),
  )
}

/** The key of `draws-needed`: the draws in millions, and as a multiple of the lab's twenty thousand a seed, each to the nearest whole number. */
export function drawsNeeded(permille: number): { millions: number; ratio: number } {
  const exact = drawsNeededMillions(permille)
  return { millions: Math.round(exact), ratio: Math.round((exact * 1_000_000) / 20_000) }
}

/** The steps of `draws-needed`: the draws at which a bias of one coin in 65,536 equals one standard error, and at level 3 that as a multiple of the lab's draws. */
function drawsSteps(permille: number, level: Level): Step[] {
  const { millions, ratio } = drawsNeeded(permille)
  return [
    { text: rich('A bias equals one standard error when ', code('δ = √(p(1 − p) ÷ N)'), ', so the draws needed are ', code('N = p(1 − p) ÷ δ²'), '.') },
    {
      text: rich('With p = ', given(permille, '‰'), ' and δ = one coin in ', given(65_536), ' of the total, N = ', derived((permille * (1000 - permille)) / 1_000_000, undefined, 3), ' × ', given(65_536), ' squared = ', derived(millions, 'million draws', 0), '.'),
      result: derived(millions, 'million draws', 0),
    },
    ...(level === 3 ? [{ text: rich('The lab draws ', given(20_000, 'draws'), ' a seed, so the factor is ', derived(ratio, 'x', 0), '.'), result: derived(ratio, 'x', 0) }] : []),
  ]
}

/** Draws until a bias δ equals one standard error: N = p(1 − p) ÷ δ², with δ one coin in 65,536. In millions of draws. */
export const drawsNeededMillions = (permille: number): number => (permille * (1000 - permille) * 4_294_967_296) / 1_000_000 / 1_000_000

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function build(spec: VariantSpec, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const variant = spec.id as VariantId
  const base = { variant: spec.id, level, seed, kcs: spec.kcs }

  if (variant === 'df') {
    let scene = drawDf(level, seed, 'scene')
    for (let attempt = 0; attempt < 64 && !dfIsFair(scene); attempt += 1) scene = drawDf(level, seed, `scene-${attempt}`)
    const givens: Given[] = [{ label: 'draws in the test', value: given(scene.draws, 'draws') }, ...scene.weights.map((w, i): Given => ({ label: `token ${i + 1}, weight`, value: given(w, '‰') }))]
    return finishItem(gen, {
      ...base,
      params: { draws: scene.draws, weights: scene.weights.join(',') },
      stem:
        level === 3
          ? rich('A chi-square test compares the counts of a sampler\'s draws with the target below. Tokens whose expected count is under five are pooled into one bin, as vLLM\'s own test does, and a token that the target rules out is not a bin. How many bins does the test have?')
          : rich('A chi-square test compares the counts of a sampler\'s draws with the target below. Tokens whose expected count is under five are pooled into one bin, as vLLM\'s own test does, and a token that the target rules out is not a bin. How many degrees of freedom does the test have?'),
      givens,
      worked: workedPart(level, dfSteps(scene, level), (attempt) => {
        const example = drawDf(level, seed, `example-${attempt}`)
        return dfIsFair(example) && degreesOfFreedom(example) !== degreesOfFreedom(scene) ? dfSteps(example, level) : null
      }),
      answer: level === 3 ? { kind: 'numeric', label: 'bins in the test', unit: 'bins', truth: degreesOfFreedom(scene) + 1, tolerance: EXACT } : { kind: 'numeric', label: 'degrees of freedom', unit: 'df', truth: degreesOfFreedom(scene), tolerance: EXACT },
    })
  }

  if (variant === 'false-fail') {
    const scene = drawFail(level, seed, 'scene')
    return finishItem(gen, {
      ...base,
      params: { oneIn: scene.oneIn, seeds: scene.seeds },
      stem:
        level === 3
          ? rich('A lab tests a sampler on several seeds, each at the level given, and an exact sampler fails if any seed rejects it. How many of every thousand attempts at an exact sampler fail by chance?')
          : rich('A lab tests a sampler on several seeds, each at the level given, and an exact sampler fails if any seed rejects it. How many of every million attempts at an exact sampler fail by chance?'),
      givens: [
        { label: 'seeds in the check', value: counted(scene.seeds, 'seed', 'seeds') },
        { label: 'each seed rejects an exact sampler one time in', value: given(scene.oneIn) },
      ],
      worked: workedPart(level, failSteps(scene, level), (attempt) => {
        const example = drawFail(level, seed, `example-${attempt}`)
        return example.oneIn === scene.oneIn || example.seeds === scene.seeds ? null : failSteps(example, level)
      }),
      answer: { kind: 'numeric', label: 'failures by chance', unit: 'attempts', truth: failKey(scene, level), tolerance: ARITHMETIC, ...(level === 3 ? { digits: 3 } : {}) },
    })
  }

  if (variant === 'visible') {
    const seen = SEEN[drawOutcome(FAMILY, 'visible', level, seed, SEEN.length)]
    const bug = drawBug(level, seed, seen, 'scene')
    return finishItem(gen, {
      ...base,
      params: { where: bug.where, ppm: bug.ppm, permille: bug.permille, draws: bug.draws },
      stem: rich('A sampler has one bug, and the lab can look for it in two ways: a chi-square test of the counts of its draws, and an enumeration of every coin of the accept step, counting how many coins each token keeps. Which of the two can see this bug?'),
      givens: [
        { label: 'the bug is in', value: text(bug.where === 'accept' ? 'the accept step' : 'the recovery draw') },
        { label: 'it moves each affected token by', value: given(bug.ppm, 'ppm') },
        { label: 'an affected token has probability', value: given(bug.permille, '‰') },
        { label: 'draws in the chi-square test', value: given(bug.draws, 'draws') },
      ],
      worked: workedPart(level, visibleSteps(bug), (attempt) => {
        const example = drawBug(level, seed, SEEN[(SEEN.indexOf(seen) + 1 + attempt) % SEEN.length], `example-${attempt}`)
        return visibleSteps(example)
      }),
      answer: { kind: 'choice', label: 'the checks that see it', options: visibleOptions(bug, level, seed), correct: seen },
    })
  }

  // draws-needed
  const rng = itemRng(FAMILY, 'draws-needed', level, seed, 'scene')
  const permille = oneOf(rng, [20, 30, 40, 50, 60, 80, 100, 120, 150, 180, 220, 260, 300, 350, 400, 500] as const)
  const { millions, ratio } = drawsNeeded(permille)
  return finishItem(gen, {
    ...base,
    params: { permille },
    stem:
      level === 3
        ? rich('A bias of one coin in ', given(65_536), ' of the total moves a token\'s frequency by about ', derived(15, 'ppm'), '. How many times as many draws as the lab\'s twenty thousand a seed does it take before that bias equals one standard error of the token\'s frequency?')
        : rich('A bias of one coin in ', given(65_536), ' of the total moves a token\'s frequency by about ', derived(15, 'ppm'), '. How many draws, in millions, does it take before that bias equals one standard error of the token\'s frequency?'),
    givens: [{ label: 'the token has probability', value: given(permille, '‰') }],
    worked: [],
    answer: level === 3 ? { kind: 'numeric', label: 'times the lab\'s draws', unit: 'x', truth: ratio, tolerance: ARITHMETIC } : { kind: 'numeric', label: 'draws', unit: 'million draws', truth: millions, tolerance: ARITHMETIC },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading, solutions, and the family                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target, 0.005)

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    if (item.variant === 'df' && item.level !== 3 && typeof item.params['weights'] === 'string') {
      const weights = item.params['weights'].split(',').map(Number)
      const scene: DfScene = { draws: item.params['draws'] as number, weights }
      const { kept, pooled, ruledOut } = binsOf(scene)
      if (pooled > 0 && value === kept - 1) return { id: `${FAMILY}.pool-forgotten`, message: rich('You left out the pooled bin. The tokens under five are not dropped: together they are one bin of the test.') }
      if (pooled > 0 && value === kept + pooled - 1) return { id: `${FAMILY}.pool-not-merged`, message: rich('You gave each small token a bin. Tokens whose expected count is under five are merged into one.') }
      if (value === weights.length - 1) return { id: `${FAMILY}.tokens-minus-one`, message: rich('You counted every token. The tokens under five are merged, and a token the target rules out is no bin.') }
      if (ruledOut > 0 && value === weights.length - ruledOut - 1) return { id: `${FAMILY}.no-pooling`, message: rich('You left out only the tokens the target rules out. The tokens whose expected count is under five are merged into one bin as well.') }
      return null
    }
    if (item.variant === 'false-fail' && item.level !== 3) {
      const oneIn = item.params['oneIn'] as number
      const seeds = item.params['seeds'] as number
      if (seeds > 1 && near(value, 1_000_000 / oneIn)) return { id: `${FAMILY}.one-seed`, message: rich('That is one seed\'s share. The check fails an exact sampler if any of its seeds rejects it, so the chances of the seeds add up.') }
      return null
    }
    return null
  },
]

function solutionOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const p = item.params as Params
  switch (item.variant) {
    case 'df':
      return dfSteps({ draws: p['draws'] as number, weights: String(p['weights']).split(',').map(Number) }, item.level)
    case 'false-fail':
      return failSteps({ oneIn: p['oneIn'] as number, seeds: p['seeds'] as number }, item.level)
    case 'visible':
      return visibleSteps({ where: p['where'] as Where, ppm: p['ppm'] as number, permille: p['permille'] as number, draws: p['draws'] as number })
    case 'draws-needed':
      return drawsSteps(p['permille'] as number, item.level)
  }
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const exactnessTest: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Testing a sampler for exactness',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // `df` redraws a scene whose merged bin would be under five, `visible` is drawn answer first, and the other two have no degenerate scene.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution: (item) => solutionOf(item),
}
