/*
 * The question sets of "Defend your receipt", by lab (ASSESSMENT §7.2). A set names the artifact it reads, reads it, draws an attempt's questions on a
 * seed from it (packages/sim/defend/<lab>.ts, pure), and words each question and the computation that answers it. Every answer is a list of whole
 * numbers, typed with commas between them; a set whose questions need another kind of answer adds it here.
 *
 * TR0's set (tr0.forward, stages 2 and 3) asks for the shape or the strides of the tensor at one of the five points the grader recorded through
 * forward hooks. The words name each point by the module of the learner's own model that it was read from, and the call by what the grader passed
 * in, so a learner who knows their own code can work out the answer and nobody else can be sure of it.
 */
import { tr0PointsSchema, TR0_POINTS_SCHEMA_TAG } from '@es/schema/bundle'
import { TR0_CALLS, TR0_MODULES, tr0Questions, working, type DefendQuestion, type FoundPoint, type RecordedPoint, type Tr0PointName, type Tr0Stage } from '@es/sim/defend/tr0'
import { DEFEND_STAGES } from './registry'

/** What the page shows once the answers are in, for one question: lines in which a run in backticks is set as code. */
export interface Reveal {
  /** What the run recorded at the question's point, in one line: what the key was read from. */
  readonly recorded: string
  /** The computation from the record, a line each. */
  readonly lines: readonly string[]
}

export type SetRead<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string }

export interface DefendSet<T> {
  readonly lab: string
  /** The `format` of the artifact the set reads. */
  readonly format: string
  /** What the questions are about, before the learner starts. Runs in backticks are code. */
  readonly lead: string
  read(data: unknown, stage: string): SetRead<T>
  /** The questions of one attempt on `seed`. Empty when the artifact holds nothing to ask about, and `none` says why. */
  questions(value: T, seed: number): readonly DefendQuestion[]
  readonly none: string
  /** The run the questions are about, in one line over them: for TR0, the call the points were recorded in. */
  context(value: T): string
  /** The question, in words. */
  ask(question: DefendQuestion, value: T): string
  reveal(question: DefendQuestion, value: T): Reveal
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* TR0: the forward pass                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Tr0Value {
  readonly stage: Tr0Stage
  readonly points: readonly RecordedPoint[]
}

/** Each point, as the question names it: what the tensor is, and the module of the learner's model it left. */
const POINT_WORDS: Readonly<Record<Tr0PointName, string>> = {
  embedding: `the output of the embedding, \`${TR0_MODULES.embedding}\``,
  attention: `the output of layer 0's attention, \`${TR0_MODULES.attention}\``,
  mlp: `the output of layer 0's MLP, \`${TR0_MODULES.mlp}\``,
  'final-norm': `the output of the final RMSNorm, \`${TR0_MODULES['final-norm']}\``,
  logits: `the output of the language-model head, \`${TR0_MODULES.logits}\``,
}

const tuple = (values: readonly number[]): string => `(${values.join(', ')})`

/** The call the stage records, as the grader makes it. */
function callWords(stage: Tr0Stage): string {
  const call = TR0_CALLS[stage]
  return call.call === 'prompt'
    ? `Your run, stage 2: the call over the whole prompt, \`model(ids)\`, with \`ids\` of shape ${tuple(call.ids)}.`
    : `Your run, stage 3: the last decode step, \`model.step(ids, cache)\`, with \`ids\` of shape ${tuple(call.ids)} and ${call.cached} positions already in the cache.`
}

const isTr0Stage = (stage: string): stage is Tr0Stage => Object.hasOwn(TR0_CALLS, stage)

const pointOf = (value: Tr0Value, name: Tr0PointName): FoundPoint | undefined =>
  value.points.find((point): point is FoundPoint => point.name === name && point.found)

const grouped = (value: number): string => value.toLocaleString('en-US')

export const TR0_SET: DefendSet<Tr0Value> = {
  lab: 'tr0.forward',
  format: TR0_POINTS_SCHEMA_TAG,
  lead:
    "While your forward pass ran, the grader recorded the shape and the strides of the tensor leaving five of its modules. Each question asks for one of them. You wrote the code, so you can work it out: a shape from the call and the sizes in `config.json`, strides from what your code does to the tensor.",
  read(data, stage) {
    const parsed = tr0PointsSchema.safeParse(data)
    if (!parsed.success || !isTr0Stage(stage) || parsed.data.stage !== stage) {
      return { ok: false, problem: 'The record of the five points in this file is not one this page can read, so there is nothing to ask about.' }
    }
    return { ok: true, value: { stage, points: parsed.data.points } }
  },
  questions: (value, seed) => tr0Questions(value.points, seed),
  none: 'Your run recorded no tensor at any of the five points, so there is nothing to ask about. The grader reads each point from a module named as the checkpoint names it: `embed_tokens`, `layers.0.self_attn`, `layers.0.mlp`, `norm` and `lm_head`.',
  context: (value) => callWords(value.stage),
  ask: (question) => `${question.asks === 'shape' ? 'What was the shape' : 'What were the strides'} of ${POINT_WORDS[question.point]}?`,
  reveal(question, value) {
    const point = pointOf(value, question.point)
    if (point === undefined) return { recorded: 'Nothing was recorded at this point.', lines: [] }
    const work = working(point)
    const recorded = `At \`${TR0_MODULES[question.point]}\` your run recorded shape ${tuple(work.shape)} and strides ${tuple(work.strides)}: ${grouped(work.numel)} elements of ${point.dtype}.`
    const steps = work.contiguous.map((step) => (step.after.length === 0 ? '1' : step.after.length === 1 ? String(step.after[0]) : step.after.join(' × ')))
    const strides = tuple(work.contiguous.map((step) => step.stride))
    const worked = steps.some((step, at) => step !== String(work.contiguous[at].stride)) ? `(${steps.join(', ')}) = ${strides}` : strides
    const lines = [
      `A contiguous tensor of shape ${tuple(work.shape)} has strides ${worked}: each stride is the product of the sizes after its dimension, so one step along the last dimension moves one element.`,
      work.isContiguous
        ? 'Your run\'s strides are those, so the tensor was contiguous: its elements sat in the buffer row by row.'
        : 'Your run\'s strides are not those, so the tensor was not contiguous: it was a view that reads its buffer in another order.',
    ]
    // A size-1 dimension's stride moves no element, so a record may hold any stride there and still be contiguous: said only where it does.
    if (work.shape.some((size, dim) => size === 1 && work.strides[dim] !== work.contiguous[dim].stride)) {
      lines.push('A dimension of size 1 moves no element, so its stride takes no part in whether the tensor is contiguous.')
    }
    return { recorded, lines }
  },
}

/** Every lab's set, by lab. */
export const DEFEND_SETS: Readonly<Record<string, DefendSet<never>>> = {
  'tr0.forward': TR0_SET as unknown as DefendSet<never>, // a set is handed back only the value it read itself, so the table forgets that value's type
}

/** The set for a stage, if the stage can be defended. */
export function setOf(stage: string): DefendSet<unknown> | undefined {
  const lab = Object.hasOwn(DEFEND_STAGES, stage) ? DEFEND_STAGES[stage] : undefined
  return lab === undefined || !Object.hasOwn(DEFEND_SETS, lab) ? undefined : (DEFEND_SETS[lab] as unknown as DefendSet<unknown>) // the value a set reads goes back only to that set
}
