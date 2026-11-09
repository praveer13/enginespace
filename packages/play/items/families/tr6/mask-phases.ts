/**
 * `tr6.mask-phases`: the four phases of a grammar mask, and where each one runs (TR6; KC `tr6.mask-phases`). It is the exit item of TR6's
 * lesson on the mask. A structured request has its grammar compiled, its bitmask filled, the mask applied to its logits and, under async
 * scheduling, its sampling deferred, and the four are different work on different resources. At vLLM v0.33.0 (the course's pin):
 *
 *   compile   asynchronous, on a thread pool off the engine core's thread. The request gets a future in place of a grammar and waits in
 *             WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR until the scheduler sees the compiled grammar (claim vllm.mask.grammar-compile-async).
 *   fill      on the engine core's thread, on the CPU, after `execute_model` has launched the forward without blocking, so it runs while the
 *             GPU works (claims vllm.mask.overlap, vllm.step.order). Serial up to 128 structured requests, and above that, with no
 *             speculative tokens, in tasks of 16 rows on a pool of at most 8 threads (claim vllm.mask.fill-parallel-threshold).
 *   apply     on the GPU, in place on the logits once the model has computed them and before the sampler runs (claims vllm.mask.overlap,
 *             vllm.mask.apply-in-place).
 *   deferral  under async scheduling, a step whose structured requests still have a token in flight cannot sample at once: its sampling
 *             waits until the model output of the step before has been processed (claims vllm.mask.deferred-sampling, vllm.mask.pending-flag).
 *
 * The variants ask the same four-way lookup from the two ends, each drawn answer first so that every phase is the key on one seed in four:
 *   name     a symptom or a piece of the code is described, and the learner names the phase. Each of the four stems of a phase has its tell,
 *            the sentence that says which words of the stem give the phase away, and the solution gives it before it gives the fact;
 *   runs-on  a phase is named, and the learner says what runs it and what waits for it.
 * Every number in a stem is a distractor of the scene, synthetic and tagged, and none is the key.
 */
import { below, between } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, shown, workedPart } from './kit'

const FAMILY = 'tr6.mask-phases'
const VERSION = 1
const KC = 'tr6.mask-phases'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'name', title: 'Name the phase', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'runs-on', title: 'What runs the phase', kcs: [KC], levels: [0, 1, 2, 3] },
]

const PHASES = ['compile', 'fill', 'apply', 'deferral'] as const
type Phase = (typeof PHASES)[number]

const isVariant = (id: string): id is 'name' | 'runs-on' => VARIANTS.some((variant) => variant.id === id)
const isPhase = (value: unknown): value is Phase => typeof value === 'string' && (PHASES as readonly string[]).includes(value)

const synthetic = (value: number, unit: string) => num(value, { unit, tag: 'synthetic' })

/** What each phase is, in the course's words: its name as a learner meets it, and the sentence that says what the engine does. */
const FACT: Readonly<Record<Phase, Rich>> = {
  compile: rich('Compile is asynchronous: the structured-output manager submits the grammar to a thread pool, off the engine core\'s thread, and the request waits in ', code('WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR'), ' until the scheduler sees the compiled grammar.'),
  fill: rich('Fill is CPU work on the engine core\'s own thread. It starts after ', code('execute_model'), ' has launched the forward without blocking, so it runs while the GPU works.'),
  apply: rich('Apply is GPU work. The bitmask that the CPU wrote is applied to the logits in place, once the model has computed them and before a token is sampled.'),
  deferral: rich('Deferral is waiting. A step whose structured requests still have a token in flight cannot sample at once, so its sampling is held until the model output of the step before it has been processed.'),
}

/** A stem of `name`, and the sentence that says which of its words give the phase away. */
interface Symptom {
  readonly stem: (n: number) => Rich
  readonly tell: Rich
}

/** The stems of `name`: what a learner might see in a trace, a state or the code. A stem takes the scene's number, which is a distractor. */
const SYMPTOMS: Readonly<Record<Phase, readonly Symptom[]>> = {
  compile: [
    {
      stem: (n) => rich('A request arrives with a JSON schema the engine has not seen. For about ', synthetic(n * 10, 'ms'), ' it is not scheduled, while the requests already running keep their pace. Which phase of the mask is it waiting on?'),
      tell: rich('A request that is held out of the schedule for a grammar the engine has not seen, while the others run on, is waiting for the grammar to be built, and building it is compile.'),
    },
    {
      stem: () => rich('The engine reports a request in the state ', code('WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR'), '. Which phase of the mask is running for it?'),
      tell: rich('The state WAITING_FOR_STRUCTURED_OUTPUT_GRAMMAR is where a request waits for its compiled grammar, so the phase that is running for it is compile.'),
    },
    {
      stem: (n) => rich('A burst of ', synthetic(n, 'requests'), ' reaches the server, each with a grammar that is new to it. Their first tokens come late and the other requests are unaffected. Which phase accounts for the delay?'),
      tell: rich('Late first tokens for new grammars, with every other request unaffected, are a cost that is paid once for each grammar and off the step loop, and that is compile.'),
    },
    {
      stem: () => rich('A thread pool outside the engine core\'s thread builds an automaton from a grammar, one task for each new grammar. Which phase of the mask is this?'),
      tell: rich('Work on a thread pool, off the engine core\'s thread, that builds the automaton of a new grammar is compile, and the engine thread does none of it.'),
    },
  ],
  fill: [
    {
      stem: () => rich('After the forward is launched, the engine core\'s thread writes one row of a bitmask for each position that may be sampled, while the GPU works. Which phase is this?'),
      tell: rich('Writing the rows of the bitmask on the engine core\'s own thread while the GPU runs the forward is the fill.'),
    },
    {
      stem: () => rich('With async scheduling off, the GPU lane shows a gap that grows with the number of structured requests in the batch, and shrinks when each request\'s rows cost less. Which phase of the mask accounts for it?'),
      tell: rich('A gap that grows with the rows to write and with the cost of a row is the part of the fill that outlasts the forward, so the phase is fill.'),
    },
    {
      stem: (n) => rich('A step holds ', synthetic(n, 'requests'), ' that carry a grammar, and the CPU spends the same short time on each one\'s rows. Which phase of the mask is this CPU time?'),
      tell: rich('CPU time that adds up request by request and row by row, in every step, is the fill: it is the one phase that scales with the rows of a step.'),
    },
    {
      stem: () => rich('Above a threshold of structured requests in a step, and with no speculative tokens, this work is cut into tasks of sixteen rows for a pool of threads, and the engine thread waits for all of them. Which phase is it?'),
      tell: rich('Cutting the writing of the bitmask into tasks of rows for a pool of threads, for a large batch with no drafts, is the fill in its parallel form.'),
    },
  ],
  apply: [
    {
      stem: () => rich('Once the model has computed the logits and before a token is sampled, a kernel on the GPU changes them in place, using the rows the CPU wrote. Which phase of the mask is this?'),
      tell: rich('A kernel on the GPU that changes the logits in place from the rows that the CPU wrote is the apply.'),
    },
    {
      stem: () => rich('The sampler never sees a token that the grammar forbids, because the logits have been changed in place on the GPU first. Which phase did that?'),
      tell: rich('What keeps a forbidden token away from the sampler is the bitmask applied to the logits on the GPU, and applying it is the apply.'),
    },
    {
      stem: (n) => rich('A profiler shows one short GPU kernel in each step, after the logits and before the sampler, for the ', synthetic(n, 'requests'), ' with a grammar. Which phase is it?'),
      tell: rich('A kernel on the GPU that sits between the logits and the sampler, and runs in every step, is the apply.'),
    },
    {
      stem: () => rich('Of the four phases of a grammar mask, which one is done by the GPU?'),
      tell: rich('Only the apply runs on the GPU. Compile and fill are CPU work, and deferral is not work at all but a step waiting.'),
    },
  ],
  deferral: [
    {
      stem: () => rich('With async scheduling on, a structured request\'s token for one step is still in flight when the next step is scheduled. The engine holds the next step\'s sampling until the first step\'s output has been processed. Which phase is this?'),
      tell: rich('Holding a step\'s sampling until the output of the step before it has been processed is deferral.'),
    },
    {
      stem: () => rich('A step carries the flag ', code('pending_structured_output_tokens'), '. Which phase of the mask does it set up?'),
      tell: rich('The flag pending_structured_output_tokens marks a step whose structured requests still have a token in flight, and what it sets up is deferral.'),
    },
    {
      stem: (n) => rich('Under async scheduling, a step that holds ', synthetic(n, 'requests'), ' with a grammar waits for the step before it before it can sample, though its forward is already running. Which phase is this?'),
      tell: rich('A step that waits to sample although its forward is already running, and waits for the step before it, is deferred.'),
    },
    {
      stem: () => rich('The bitmask for a structured request\'s next token cannot be filled until the token before it is known, and that token is still in flight. What is the mask waiting on?'),
      tell: rich('A mask that cannot be filled until the token before it is known is waiting on deferral, which exists only under async scheduling.'),
    },
  ],
}

/** The options of `name`: the four phases. */
const NAME_TEXT: Readonly<Record<Phase, Rich>> = {
  compile: rich('Compile'),
  fill: rich('Fill'),
  apply: rich('Apply'),
  deferral: rich('Deferral'),
}

/** The options of `runs-on`: what runs the phase, and whether a request waits for it. They are of about one length. */
const RUNS_TEXT: Readonly<Record<Phase, Rich>> = {
  compile: rich('A thread pool, off the engine thread, while the request waits'),
  fill: rich('The engine thread, on the CPU, while the GPU works'),
  apply: rich('The GPU, in place on the logits, inside sampling'),
  deferral: rich('Nothing: the step waits for the previous step\'s tokens'),
}

/** Why a phase is not the answer, by the phase it was taken for. */
const LURE: Readonly<Record<Phase, Rich>> = {
  compile: rich('Compile runs once for a new grammar and keeps the request out of the schedule. It is not what happens in every step.'),
  fill: rich('Fill is the CPU work of every step, and it overlaps the forward. It is not what holds a request out of the schedule, and it is not on the GPU.'),
  apply: rich('Apply is the GPU kernel that changes the logits in place. It does not build the mask, and it does not wait for anything.'),
  deferral: rich('Deferral is the step waiting for the token before it. It does no work of its own, and it exists only under async scheduling.'),
}

const missId = (phase: Phase): string => `${FAMILY}.${phase}-taken-for`

/** The scene's distractor number, a count of requests or a multiple of ten ms. */
const numberOf = (seed: Seed, level: Level, variant: string): number => between(itemRng(FAMILY, variant, level, seed, 'number'), 3, 48)

function options(variant: 'name' | 'runs-on', phase: Phase, level: Level, seed: Seed): ChoiceOption[] {
  const text = variant === 'name' ? NAME_TEXT : RUNS_TEXT
  return shown(
    FAMILY,
    variant,
    level,
    seed,
    PHASES.map((id): ChoiceOption => ({ id, text: text[id], why: id === phase ? FACT[id] : LURE[id], ...(id === phase ? {} : { miss: missId(id) }) })),
  )
}

function stepsOf(phase: Phase, variant: 'name' | 'runs-on', stem: number): Step[] {
  return variant === 'name'
    ? [
        { text: rich('Match what the stem describes to the four phases: compile builds the grammar, fill writes the bitmask, apply puts it on the logits, and deferral holds a step back.') },
        { text: SYMPTOMS[phase][stem].tell },
        { text: FACT[phase] },
      ]
    : [{ text: rich('Say what does the work of the phase the stem names, and whether a request waits for it.') }, { text: FACT[phase] }]
}

function build(spec: VariantSpec, level: Level, seed: Seed): Item {
  const variant = spec.id as 'name' | 'runs-on'
  const phase = PHASES[drawOutcome(FAMILY, variant, level, seed, PHASES.length)]
  const n = numberOf(seed, level, variant)
  // The stem of `name` is one of the phase's four, and its index goes into the params so that the solution can give its tell.
  const stemAt = below(itemRng(FAMILY, variant, level, seed, 'stem'), SYMPTOMS[phase].length)
  const stem =
    variant === 'name'
      ? SYMPTOMS[phase][stemAt].stem(n)
      : rich('At vLLM v0.33.0, one phase of a structured request\'s grammar mask is ', code(phase), '. What runs it, and what waits for it?')
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant,
      level,
      seed,
      kcs: spec.kcs,
      stem,
      givens: [],
      worked: workedPart(level, stepsOf(phase, variant, stemAt), (attempt) => stepsOf(PHASES[(PHASES.indexOf(phase) + 1 + attempt) % PHASES.length], variant, stemAt)),
      answer: { kind: 'choice', label: variant === 'name' ? 'the phase' : 'what runs it', options: options(variant, phase, level, seed), correct: phase },
      params: { phase, n, stem: stemAt },
    },
  )
}

function sceneOf(item: Pick<Item, 'variant' | 'params'>): { phase: Phase; stem: number } {
  const phase = item.params['phase']
  const stem = item.params['stem']
  if (!isVariant(item.variant) || !isPhase(phase) || typeof stem !== 'number' || !Number.isInteger(stem) || stem < 0 || stem >= SYMPTOMS[phase].length) {
    throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
  }
  return { phase, stem }
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const maskPhases: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The four phases of a grammar mask',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the phase is drawn first, and the stem and the options follow from it.
  band: () => true,
  grade: (item, response) => gradeChoice(item, response),
  solution: (item) => {
    const { phase, stem } = sceneOf(item)
    return stepsOf(phase, item.variant as 'name' | 'runs-on', stem)
  },
}
