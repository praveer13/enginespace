// "Defend your receipt" for TR0's forward pass (ASSESSMENT §7.2, the third kind of Prove-it; curriculum TR0 §4, Prove).
//
// The grader records, through forward hooks, the shape and the strides of the tensor that leaves five modules of the learner's own
// forward pass (labs/grader/.../tr0_forward_worker.py, POINTS): the embedding, layer 0's attention, layer 0's MLP, the final norm and
// the language-model head. Stage 2 records the call over the whole prompt, and stage 3 the last decode step. Those five records travel in
// the receipt's bundle as the artifact `enginespace/tr0-points@1`, and only they answer the questions made here: each question asks for the
// whole shape, or the whole strides, of the tensor at one point, and its key is what the learner's run recorded there. Two bundles whose
// recorded points differ give different keys for the same seed.
//
// The learner answers before the page shows anything recorded, and then `working` lays out the computation from the record: the shape,
// the strides, the strides a contiguous tensor of that shape has, each worked from the sizes after it, and whether the two agree.
//
// Pure, as every model in this package: the seed comes in from outside, drawn when the learner starts (invariant I3).

import { below, rngFor } from '../core/rng'
import type { Seed } from '../core/types'

/** The five points, in the order of the artifact (packages/schema/bundle.ts, TR0_POINT_NAMES). */
export const TR0_POINTS = ['embedding', 'attention', 'mlp', 'final-norm', 'logits'] as const
export type Tr0PointName = (typeof TR0_POINTS)[number]

/** The module each point is read from, as the grader looks it up on the learner's model (tr0_forward_worker.py, POINTS). */
export const TR0_MODULES: Readonly<Record<Tr0PointName, string>> = {
  embedding: 'embed_tokens',
  attention: 'layers.0.self_attn',
  mlp: 'layers.0.mlp',
  'final-norm': 'norm',
  logits: 'lm_head',
}

/** One recorded point: what the hook saw leave the module, or that the model had no module there. */
export type RecordedPoint =
  | { readonly name: Tr0PointName; readonly found: true; readonly shape: readonly number[]; readonly strides: readonly number[]; readonly dtype: string }
  | { readonly name: Tr0PointName; readonly found: false }

export type FoundPoint = Extract<RecordedPoint, { found: true }>

/** What a question asks of its point: the whole shape, or the whole strides. */
export type Asks = 'shape' | 'strides'

export interface DefendQuestion {
  /** `<point>/<asks>`, unique within an attempt. */
  readonly id: string
  readonly point: Tr0PointName
  readonly asks: Asks
  /** What the learner's run recorded: the answer. */
  readonly key: readonly number[]
}

/** How many questions an attempt asks [estimated]: three, as a lesson's test holds three (the owner's answer to N5). */
export const DEFEND_QUESTIONS = 3

/** The salt of the attempt's draws (packages/sim/core/rng.ts `rngFor`). */
const SALT = 'defend/tr0'

/**
 * The questions of one attempt on `seed`. The points to ask about come in a seeded order, one question to a point while there are points
 * left, and the kinds alternate from a seeded first one, so an attempt of two questions or more asks for at least one shape and one set of
 * strides. A point the model had no module for, or whose tensor has no dimensions, is never asked about. Fewer than `count` questions come back only when the run recorded too
 * few points to make them: with one point found, two (its shape and its strides); with none, none.
 */
export function tr0Questions(points: readonly RecordedPoint[], seed: Seed, count: number = DEFEND_QUESTIONS): DefendQuestion[] {
  // A tensor of no dimensions has an empty shape and no strides, which no answer can be typed for.
  const found = points.filter((point): point is FoundPoint => point.found && point.shape.length > 0)
  if (found.length === 0 || count < 1) return []
  const rng = rngFor(seed, SALT)
  // A Fisher-Yates shuffle of the found points, each place drawn without bias.
  const order = [...found]
  for (let at = order.length - 1; at > 0; at--) {
    const pick = below(rng, at + 1)
    const held = order[at]
    order[at] = order[pick]
    order[pick] = held
  }
  const first: Asks = below(rng, 2) === 0 ? 'shape' : 'strides'
  const other: Asks = first === 'shape' ? 'strides' : 'shape'
  const total = Math.min(count, order.length * 2)
  const questions: DefendQuestion[] = []
  for (let at = 0; at < total; at++) {
    const point = order[at % order.length]
    // The first round takes each point once, the kinds alternating; a second round, for a run with fewer points than questions, takes the
    // kind each point was not asked the first time.
    const kind: Asks = at < order.length ? (at % 2 === 0 ? first : other) : opposite(questions[at - order.length].asks)
    questions.push({ id: `${point.name}/${kind}`, point: point.name, asks: kind, key: kind === 'shape' ? [...point.shape] : [...point.strides] })
  }
  return questions
}

const opposite = (asks: Asks): Asks => (asks === 'shape' ? 'strides' : 'shape')

/** The most numbers an answer may hold [estimated]: the artifact's schema allows eight dimensions. */
export const MAX_DIMS = 8

/**
 * A learner's answer as numbers, or null when it is not a list of whole numbers. Commas, spaces and an `x` or `×` between sizes all
 * separate, and brackets, parentheses and `torch.Size(...)` around the list are read through, so `(8, 24, 1024)`, `[8,24,1024]`,
 * `8 x 24 x 1024` and `torch.Size([8, 24, 1024])` are the same answer. A gap between two separators is a missing number, and unreadable.
 */
export function parseTuple(text: string): number[] | null {
  const bare = text
    .trim()
    .replace(/^torch\.Size\s*/i, '')
    .replace(/[()[\]]/g, ' ')
    .trim()
    // Python writes a tuple of one as `(8,)`.
    .replace(/\s*,$/, '')
  if (bare === '') return null
  const parts = bare.split(/\s*[,x×]\s*|\s+/i)
  if (parts.length > MAX_DIMS) return null
  const out: number[] = []
  for (const part of parts) {
    if (!/^\d{1,16}$/.test(part)) return null
    const value = Number(part)
    if (!Number.isSafeInteger(value)) return null
    out.push(value)
  }
  return out
}

/** Whether an answer is the key, number for number. */
export const sameTuple = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((value, at) => value === b[at])

export interface Marked {
  readonly right: readonly boolean[]
  /** Right answers over questions, in [0, 1]. */
  readonly score: number
  /** Every answer right: what a pass is (the owner's answer to N5, for a lesson's test, carried over). */
  readonly ok: boolean
}

/** Marks one attempt: each answer against its question's key. An answer that is missing or unreadable is wrong. */
export function markDefence(questions: readonly DefendQuestion[], answers: readonly (readonly number[] | null)[]): Marked {
  const right = questions.map((question, at) => {
    const answer = answers[at]
    return answer !== null && answer !== undefined && sameTuple(answer, question.key)
  })
  const correct = right.filter(Boolean).length
  return { right, score: questions.length === 0 ? 0 : correct / questions.length, ok: questions.length > 0 && correct === questions.length }
}

/** One stride of a contiguous tensor, as the product of the sizes after its dimension: `24 × 1024 = 24576`. */
export interface StrideStep {
  /** The sizes after the dimension, each at least 1 (a size of 0 or 1 does not move the stride). */
  readonly after: readonly number[]
  readonly stride: number
}

/** The computation the page shows once the learner has answered, worked from the recorded point alone. */
export interface Working {
  readonly shape: readonly number[]
  readonly strides: readonly number[]
  /** The strides a contiguous tensor of this shape has, and how each is worked out. */
  readonly contiguous: readonly StrideStep[]
  /** Whether the recorded strides are those, leaving out dimensions of size 1, whose stride moves no element. */
  readonly isContiguous: boolean
  /** How many elements the tensor holds: the product of its sizes. */
  readonly numel: number
}

/** The working for a recorded point. */
export function working(point: FoundPoint): Working {
  const { shape, strides } = point
  const contiguous: StrideStep[] = shape.map((_, dim) => {
    const after = shape.slice(dim + 1).map((size) => Math.max(size, 1))
    return { after, stride: after.reduce((product, size) => product * size, 1) }
  })
  const isContiguous = shape.every((size, dim) => size <= 1 || strides[dim] === contiguous[dim].stride)
  const numel = shape.reduce((product, size) => product * size, 1)
  return { shape: [...shape], strides: [...strides], contiguous, isContiguous, numel }
}

/**
 * The call each stage records, as the grader makes it (tr0_forward.py: POOL_PROMPTS, POOL_LENGTH, PREFIX_LENGTH, DECODE_STEPS). Stage 2 calls
 * `model(ids)` once on the 8 prompts of 24 token ids; stage 3 feeds a prefix of 8 ids and then 16 decode steps of one id each, and the hooks
 * keep the last step, which `step` takes with the cache already holding the prefix and the 15 ids before it.
 * tests/sim/defend-tr0.test.ts holds these to the grader's constants.
 */
export const TR0_CALLS = {
  'tr0.forward.s2': { call: 'prompt', ids: [8, 24], cached: 0 },
  'tr0.forward.s3': { call: 'decode-step', ids: [1, 1], cached: 23 },
} as const satisfies Record<string, { call: 'prompt' | 'decode-step'; ids: readonly [number, number]; cached: number }>

export type Tr0Stage = keyof typeof TR0_CALLS
