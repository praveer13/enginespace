/**
 * `tr6.verify-shape`: what one speculative step computes, what comes out of it, and why its shape decides which graph can serve it (TR6; KC
 * `tr6.verify-shape`). It is the exit item of TR6's first lesson. At vLLM v0.33.0, the course's pin:
 *
 *   positions  every running request in decode carries its drafts into the step: the token it has not computed and one for each draft, so
 *              `1 + k` tokens a request (claims vllm.scheduler.spec-drafts, vllm.cudagraph.mrv1-query-len). The target computes all of them
 *              in one forward, and the step presents `R × (1 + k)` tokens in all.
 *   tokens-out the rejection sampler accepts a prefix of each request's drafts and adds one more token, the recovered token at the first
 *              rejection or the bonus after a full run, so a request emits `accepted + 1` tokens (claims vllm.spec.rejection-sampler.exact,
 *              vllm.spec.bonus-token). The positions that did not become tokens were computed for nothing.
 *   uniform    a batch in which every request has the same query length, and none is still prefilling, is a uniform decode, and a full graph
 *              can replay it at the next captured size up (claims vllm.cudagraph.mrv2-uniform-count, vllm.cudagraph.mode-routines). A batch
 *              that holds a prefill chunk is not uniform and takes a piecewise graph. A backend that replays full graphs only for
 *              single-token decodes cannot serve `1 + k` tokens a request with one, so the engine drops the mode to piecewise (claim
 *              vllm.cudagraph.downgrade-spec-decode). A step with more tokens than the largest captured size has no graph and is launched
 *              kernel by kernel (claim vllm.cudagraph.padding). The default mode, FULL_AND_PIECEWISE, is the one the question is about.
 *
 * The `uniform` rule is held to the sim's own dispatcher in tests/play/items-tr6-verify-shape.test.ts. The scene is synthetic and every
 * number in it is [estimated].
 */
import { below } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { num, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, ItemTag, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, EXACT, oneOf, shown, workedPart } from './kit'

const FAMILY = 'tr6.verify-shape'
const VERSION = 1
const KC = 'tr6.verify-shape'

type VariantId = 'positions' | 'tokens-out' | 'uniform'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'positions', title: 'The positions one verify step computes', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'tokens-out', title: 'The tokens one verify step emits', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'uniform', title: 'The graph that serves a speculative step', kcs: [KC], levels: [1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const counted = (value: number, one: string, many: string, tag: ItemTag = 'synthetic'): NumPart => num(value, { unit: value === 1 ? one : many, tag })
const requestsOf = (value: number, tag: ItemTag = 'synthetic') => counted(value, 'request', 'requests', tag)
const draftsOf = (value: number, tag: ItemTag = 'synthetic') => counted(value, 'draft', 'drafts', tag)
const tokensOf = (value: number, tag: ItemTag = 'derived') => counted(value, 'token', 'tokens', tag)

/* ------------------------------------------------------------------------------------------------------------------ */
/* positions                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Positions {
  readonly requests: number
  readonly drafts: number
}

const positionsOf = (s: Positions): number => s.requests * (1 + s.drafts)

function drawPositions(level: Level, seed: Seed, purpose: string): Positions {
  const rng = itemRng(FAMILY, 'positions', level, seed, purpose)
  for (;;) {
    const scene = { requests: 2 + below(rng, 47), drafts: 2 + below(rng, 8) }
    // The four mistakes of the grader give four different numbers: one request's positions is not the requests, and a product is not a sum.
    if (scene.requests !== 1 + scene.drafts && scene.requests * scene.drafts !== scene.requests + scene.drafts) return scene
  }
}

function positionsSteps(s: Positions, level: Level): Step[] {
  const total = positionsOf(s)
  if (level === 3) {
    return [
      { text: rich('Each request carries its next token and its ', draftsOf(s.drafts), ', so it presents one plus ', draftsOf(s.drafts), ' = ', tokensOf(1 + s.drafts), ' to the verify step.'), result: tokensOf(1 + s.drafts) },
      { text: rich('The step presents ', tokensOf(total, 'synthetic'), ' in all, so it holds ', tokensOf(total, 'synthetic'), ' ÷ ', tokensOf(1 + s.drafts), ' = ', requestsOf(s.requests, 'derived'), '.'), result: requestsOf(s.requests, 'derived') },
    ]
  }
  return [
    { text: rich('A request in decode carries the token it has not computed yet and one for each draft, so it presents one plus ', draftsOf(s.drafts), ' = ', tokensOf(1 + s.drafts), '. The target computes all of them in one forward.'), result: tokensOf(1 + s.drafts) },
    { text: rich('The step holds ', requestsOf(s.requests), ', so it presents ', requestsOf(s.requests), ' × ', tokensOf(1 + s.drafts), ' = ', tokensOf(total), '.'), result: tokensOf(total) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* tokens-out                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Round {
  readonly drafts: number
  /** The drafts each request had accepted. */
  readonly accepted: readonly number[]
}

const emitted = (r: Round): number => r.accepted.reduce((sum, a) => sum + a + 1, 0)
const computedFor = (r: Round): number => r.accepted.length * (1 + r.drafts)
const wasted = (r: Round): number => computedFor(r) - emitted(r)

function drawRound(level: Level, seed: Seed, purpose: string): Round {
  const rng = itemRng(FAMILY, 'tokens-out', level, seed, purpose)
  const requests = 3 + below(rng, 4)
  const drafts = 2 + below(rng, 5)
  const accepted = Array.from({ length: requests }, () => below(rng, drafts + 1))
  return { drafts, accepted }
}

/** A fair round has one request that accepted every draft and one that did not, so that both kinds of last token are in it. */
const roundIsFair = (r: Round): boolean => r.accepted.some((a) => a === r.drafts) && r.accepted.some((a) => a < r.drafts)

function roundSteps(r: Round, level: Level): Step[] {
  const total = emitted(r)
  const steps: Step[] = [
    {
      text: rich('Each request emits the drafts it had accepted and one token more: the recovered token where it was rejected, or the bonus token where it accepted them all. That is the accepted count plus one for each request.'),
    },
    { text: rich('The accepted counts add up to ', num(r.accepted.reduce((a, b) => a + b, 0), { unit: 'drafts', tag: 'derived' }), ', and the ', requestsOf(r.accepted.length), ' add one each: ', tokensOf(total), ' emitted.'), result: tokensOf(total) },
  ]
  if (level !== 3) return steps
  return [
    ...steps,
    { text: rich('The target computed ', requestsOf(r.accepted.length), ' × (one plus ', draftsOf(r.drafts), ') = ', tokensOf(computedFor(r)), ', so ', tokensOf(computedFor(r)), ' − ', tokensOf(total), ' = ', tokensOf(wasted(r)), ' were computed and not kept.'), result: tokensOf(wasted(r)) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* uniform                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What serves the step: a full graph, a piecewise graph for a mixed batch, a piecewise graph for the backend's limit, or no graph. */
export type Serve = 'full' | 'mixed' | 'backend' | 'eager'
const SERVES: readonly Serve[] = ['full', 'mixed', 'backend', 'eager']

/** The backend's graph support for a batch of more than one token a row: it replays full graphs for equal-length rows, or for single-token decodes only. */
export type Support = 'batch' | 'single'

export interface Shape {
  readonly drafts: number
  readonly decodes: number
  /** The tokens of a prefill chunk in the batch, or 0 for none. */
  readonly prefill: number
  readonly support: Support
  /** The largest size a graph was captured at. */
  readonly largest: number
}

export const shapeTokens = (s: Shape): number => s.decodes * (1 + s.drafts) + s.prefill

/** The rule, as the pinned engine applies it under FULL_AND_PIECEWISE (see the file's header). */
export function serveOf(s: Shape): Serve {
  if (shapeTokens(s) > s.largest) return 'eager'
  if (s.support === 'single') return 'backend'
  return s.prefill > 0 ? 'mixed' : 'full'
}

const LARGEST = [64, 128, 256] as const

function drawShape(level: Level, seed: Seed, serve: Serve, purpose: string): Shape {
  const rng = itemRng(FAMILY, 'uniform', level, seed, purpose)
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const drafts = 1 + below(rng, 4)
    const largest = oneOf(rng, LARGEST)
    const decodes = 4 + below(rng, 37)
    const prefill = serve === 'mixed' || (serve === 'eager' && below(rng, 2) === 0) ? 16 + 8 * below(rng, 11) : 0
    const support: Support = serve === 'backend' || (serve === 'eager' && below(rng, 2) === 0) ? 'single' : 'batch'
    const shape: Shape = { drafts, decodes, prefill, support, largest }
    const tokens = shapeTokens(shape)
    // A clear margin from the largest size: a tenth of it either way, so the comparison is never a hair's breadth. A full decode graph is
    // captured at sizes rounded up to a multiple of the query length, so one that fits needs a dozen tokens of room [estimated] under the top.
    if (Math.abs(tokens - largest) * 10 < largest) continue
    if (serve === 'full' && tokens + 12 > largest) continue
    if (serveOf(shape) === serve) return shape
  }
  return { drafts: 2, decodes: 12, prefill: serve === 'mixed' ? 32 : 0, support: serve === 'backend' ? 'single' : 'batch', largest: serve === 'eager' ? 32 : 128 }
}

const SERVE_TEXT: Readonly<Record<Serve, Rich>> = {
  full: rich('A full graph, padded up to the next captured size'),
  mixed: rich('A piecewise graph, because the batch is not uniform'),
  backend: rich('A piecewise graph, because the backend replays full graphs only for single-token decodes'),
  eager: rich('No graph: the step is launched kernel by kernel'),
}

function uniformSteps(s: Shape): Step[] {
  const decode = s.decodes * (1 + s.drafts)
  const total = shapeTokens(s)
  const serve = serveOf(s)
  const out: Step[] = [
    { text: rich(requestsOf(s.decodes), ' in decode, each carrying ', draftsOf(s.drafts), ', present ', requestsOf(s.decodes), ' × (one plus ', draftsOf(s.drafts), ') = ', tokensOf(decode), '.'), result: tokensOf(decode) },
  ]
  if (s.prefill > 0) out.push({ text: rich('The prefill chunk adds ', tokensOf(s.prefill, 'synthetic'), ', so the step presents ', tokensOf(total), ' in all.'), result: tokensOf(total) })
  switch (serve) {
    case 'eager':
      out.push({ text: rich(tokensOf(total), ' is more than the largest captured size, ', tokensOf(s.largest, 'synthetic'), ', so no graph can hold the step and it is launched kernel by kernel.') })
      break
    case 'backend':
      out.push({ text: rich('Every request has the same query length, but the backend replays full graphs only for single-token decodes. With drafts the query length is above one, so the engine drops the mode to piecewise, and the step takes a piecewise graph.') })
      break
    case 'mixed':
      out.push({ text: rich('The prefill chunk has a query length of its own, so the rows are not all the same length and the batch is not a uniform decode. The full decode graph cannot replay it, and a piecewise graph serves it.') })
      break
    case 'full':
      out.push({ text: rich('Every row has the same query length and none is prefilling, so the batch is a uniform decode. The backend replays full graphs for it and ', tokensOf(total), ' fits the captured sizes up to ', tokensOf(s.largest, 'synthetic'), ', so a full graph serves it, padded up.') })
      break
  }
  return out
}

function uniformOptions(shape: Shape, level: Level, seed: Seed): ChoiceOption[] {
  const serve = serveOf(shape)
  const total = shapeTokens(shape)
  const why = (option: Serve): { why: Rich; miss?: string } => {
    if (option === serve) return { why: uniformSteps(shape)[uniformSteps(shape).length - 1].text }
    switch (option) {
      case 'full':
        return {
          why:
            serve === 'eager'
              ? rich(tokensOf(total), ' is more than the largest captured size, ', tokensOf(shape.largest, 'synthetic'), ', so there is no graph to replay.')
              : serve === 'mixed'
                ? rich('The prefill chunk has a query length of its own, so the batch is not a uniform decode, and a full decode graph does not replay it.')
                : rich('The backend replays full graphs only for single-token decodes, and a draft makes the query length more than one.'),
          miss: `${FAMILY}.full-always`,
        }
      case 'mixed':
        return {
          why: serve === 'full' ? rich('Every row is a decode of the same length, so the batch is uniform and a full graph serves it.') : serve === 'backend' ? rich('The batch is uniform. It is the backend, and not the mix of rows, that limits it to a piecewise graph.') : rich('The step is too large for any captured graph, uniform or not.'),
          miss: `${FAMILY}.mixed-taken-for`,
        }
      case 'backend':
        return {
          why: serve === 'full' ? rich('The backend replays full graphs for batches of equal-length rows, so it is not what limits this step.') : serve === 'mixed' ? rich('The backend is not the limit here. The prefill chunk makes the rows differ in length.') : rich('The step is too large for any captured graph, whatever the backend replays.'),
          miss: `${FAMILY}.backend-taken-for`,
        }
      case 'eager':
        return { why: rich(tokensOf(total), ' is not more than the largest captured size, ', tokensOf(shape.largest, 'synthetic'), ', so a graph can hold the step.'), miss: `${FAMILY}.eager-taken-for` }
    }
  }
  return shown(FAMILY, 'uniform', level, seed, SERVES.map((id): ChoiceOption => ({ id, text: SERVE_TEXT[id], ...why(id) })))
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit: string): NumPart => num(value, { unit, tag: 'synthetic' })

function build(spec: VariantSpec, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const variant = spec.id as VariantId
  const base = { variant: spec.id, level, seed, kcs: spec.kcs }

  if (variant === 'positions') {
    const s = drawPositions(level, seed, 'scene')
    const total = positionsOf(s)
    const params: Params = { requests: s.requests, drafts: s.drafts }
    if (level === 3) {
      return finishItem(gen, {
        ...base,
        params,
        stem: rich('In a synthetic engine, every running request carries its drafts into the verify step. The step presents the number of token positions below to the target, and each request carries the drafts below. How many requests are in the batch?'),
        givens: [
          { label: 'positions the step presents', value: given(total, 'tokens') },
          { label: 'draft tokens per request', value: draftsOf(s.drafts) },
        ],
        worked: [],
        answer: { kind: 'numeric', label: 'requests in the batch', unit: 'requests', truth: s.requests, tolerance: EXACT },
      })
    }
    return finishItem(gen, {
      ...base,
      params,
      stem: rich('In a synthetic engine, every running request carries its drafts into the verify step. How many token positions does the target compute in that one step?'),
      givens: [
        { label: 'running requests in the batch', value: requestsOf(s.requests) },
        { label: 'draft tokens per request', value: draftsOf(s.drafts) },
      ],
      worked: workedPart(level, positionsSteps(s, level), (attempt) => {
        const example = drawPositions(level, seed, `example-${attempt}`)
        return positionsOf(example) === total || example.requests === s.requests ? null : positionsSteps(example, level)
      }),
      answer: { kind: 'numeric', label: 'token positions in the step', unit: 'tokens', truth: total, tolerance: EXACT },
    })
  }

  if (variant === 'tokens-out') {
    let round = drawRound(level, seed, 'scene')
    for (let attempt = 0; attempt < 32 && !roundIsFair(round); attempt += 1) round = drawRound(level, seed, `scene-${attempt}`)
    const params: Params = { drafts: round.drafts, accepted: round.accepted.join(',') }
    const givens: Given[] = [
      { label: 'requests in the step', value: requestsOf(round.accepted.length) },
      { label: 'draft tokens per request', value: draftsOf(round.drafts) },
      ...round.accepted.map((a, i): Given => ({ label: `request ${i + 1}, drafts accepted`, value: draftsOf(a) })),
    ]
    return finishItem(gen, {
      ...base,
      params,
      stem:
        level === 3
          ? rich('In a synthetic engine, one verify step drafted the same number of tokens for each request, and the rejection sampler accepted the drafts shown. No request stops early. How many of the token positions that the target computed are thrown away?')
          : rich('In a synthetic engine, one verify step drafted the same number of tokens for each request, and the rejection sampler accepted the drafts shown. No request stops early. How many new tokens does the whole step emit?'),
      givens,
      worked: workedPart(level, roundSteps(round, level), (attempt) => {
        const example = drawRound(level, seed, `example-${attempt}`)
        return roundIsFair(example) && emitted(example) !== emitted(round) ? roundSteps(example, level) : null
      }),
      answer:
        level === 3
          ? { kind: 'numeric', label: 'positions computed and thrown away', unit: 'tokens', truth: wasted(round), tolerance: EXACT }
          : { kind: 'numeric', label: 'new tokens emitted', unit: 'tokens', truth: emitted(round), tolerance: EXACT },
    })
  }

  // uniform
  const serve = SERVES[drawOutcome(FAMILY, 'uniform', level, seed, SERVES.length)]
  const shape = drawShape(level, seed, serve, 'scene')
  const own = uniformSteps(shape)
  return finishItem(gen, {
    ...base,
    params: { drafts: shape.drafts, decodes: shape.decodes, prefill: shape.prefill, support: shape.support, largest: shape.largest },
    stem: rich('A synthetic engine runs speculative decoding in vLLM\'s default graph mode, FULL_AND_PIECEWISE, which replays full graphs for batches that only decode and piecewise graphs for the rest. Which graph serves this step?'),
    givens: [
      { label: 'draft tokens per request', value: draftsOf(shape.drafts) },
      { label: 'requests in decode', value: requestsOf(shape.decodes) },
      { label: 'prefill chunk in the batch', value: shape.prefill > 0 ? given(shape.prefill, 'tokens') : text('none') },
      { label: 'the backend replays full graphs for', value: text(shape.support === 'batch' ? 'batches of equal-length rows' : 'single-token decodes only') },
      { label: 'largest captured size', value: given(shape.largest, 'tokens') },
    ],
    worked: workedPart(level, own, () => null),
    answer: { kind: 'choice', label: 'what serves the step', options: uniformOptions(shape, level, seed), correct: serve },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading, solutions, and the family                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target, 0.005)

/** The numbers that a misreading gives for the two numeric variants. */
const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    if (item.variant === 'positions' && item.level !== 3) {
      const { requests, drafts } = item.params as { requests: number; drafts: number }
      if (near(value, requests * drafts)) return { id: `${FAMILY}.no-last-position`, message: rich('You gave one position for each draft and none for the token the request has not computed yet. The step computes one plus the drafts for each request.') }
      if (near(value, requests + drafts)) return { id: `${FAMILY}.added`, message: rich('You added the requests and the drafts. Every request carries its own drafts, so the two multiply.') }
      if (near(value, 1 + drafts)) return { id: `${FAMILY}.one-request`, message: rich('That is the positions of one request. The step holds all of them.') }
      if (near(value, requests)) return { id: `${FAMILY}.no-drafts`, message: rich('That is one position for each request, with no drafts. The drafts are verified in the same forward.') }
      return null
    }
    if (item.variant === 'tokens-out' && typeof item.params['accepted'] === 'string') {
      const accepted = item.params['accepted'].split(',').map(Number)
      const drafts = item.params['drafts'] as number
      const requests = accepted.length
      const sum = accepted.reduce((a, b) => a + b, 0)
      if (item.level === 3) {
        if (near(value, requests * (1 + drafts) - sum)) return { id: `${FAMILY}.kept-last`, message: rich('You counted only the accepted drafts as kept. Each request also keeps its recovered or bonus token, which is a position that was not thrown away.') }
        if (near(value, requests * drafts - sum)) return { id: `${FAMILY}.no-last-position`, message: rich('You left out the extra position of each request. The target computes one plus the drafts for each request.') }
        return null
      }
      if (near(value, sum)) return { id: `${FAMILY}.no-extra-token`, message: rich('You counted the accepted drafts only. Each request also emits one more token, the recovered one or the bonus.') }
      if (near(value, requests * (1 + drafts))) return { id: `${FAMILY}.all-positions`, message: rich('That is every position the target computed. The positions after a rejection are thrown away.') }
      return null
    }
    return null
  },
]

function solutionOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  if (item.variant === 'positions') {
    const { requests, drafts } = item.params as { requests: number; drafts: number }
    return positionsSteps({ requests, drafts }, item.level)
  }
  if (item.variant === 'tokens-out') {
    const accepted = String(item.params['accepted']).split(',').map(Number)
    return roundSteps({ drafts: item.params['drafts'] as number, accepted }, item.level)
  }
  const { drafts, decodes, prefill, support, largest } = item.params as { drafts: number; decodes: number; prefill: number; support: Support; largest: number }
  return uniformSteps({ drafts, decodes, prefill, support, largest })
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const verifyShape: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'One speculative step',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // The draws are fair by construction: `uniform` is drawn answer first, `tokens-out` redraws a round that has no full run or no rejection, and the grids of `positions` have no degenerate case.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution: (item) => solutionOf(item),
}
