/**
 * `tr1.which-mechanism`: which of the five mechanisms joins the two places of one stage of a real engine's request path (TR1; KC
 * `tr1.five-mechanisms`, and the lifecycle KC of the engine the stage belongs to). It is the exit item of TR1's first lesson and one item
 * of its sixth: a ticket shows a stage with the place where it starts and the place where it ends, and asks whether the request is carried
 * by compute, a queue, IPC, a copy or a sync (W1-report §5; the lessons' five rules).
 *
 * The stage and its key are the lifecycle model's (packages/sim/lifecycle, W1-T16), and every stage there cites its file, symbol, line and
 * quote at the commit its engine is pinned to, so the key is derived from the sim and rests on the pinned source:
 *   - the model's nine mechanisms come to the lesson's five words by `KLASS_OF` (a call, a launch and a collective are compute; a socket and
 *     shared memory are IPC; a copy goes down or up);
 *   - the places decide what the model's rules allow (legal.ts): a change of process is IPC, a change of thread is a queue, a hop between the
 *     host and a GPU is a copy, and a stage that stays in one place is compute, a queue between two steps of a thread, or a sync, which its
 *     label tells apart.
 *
 * What the variants ask:
 *   nano     a stage of nano-vllm's path (KC tr1.five-mechanisms);
 *   sglang   a stage of Mini-SGLang's or SGLang's path (that KC and tr1.sglang-lifecycle);
 *   vllm     a stage of vLLM's path at the pin, or at the post's commit (that KC and tr1.vllm-lifecycle).
 * The mechanism is drawn first and the engine and the stage follow from it, so each of the five is the key on one seed in five. At level 0
 * a worked example with another stage comes first, at level 1 the first step of the solution is shown, at level 2 the learner is alone with
 * the stage, and at level 3 the stage is shown as the line of the engine's own source in place of its label.
 */
import { pick } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { boundaryOf } from '@es/sim/lifecycle/legal'
import type { EngineId, StageDef } from '@es/sim/lifecycle/types'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice } from '../../grade'
import { code, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, shown, workedPart } from './kit'
import { boundaryRich, conditionOf, engineWords, entryOf, GROUP_ENGINES, KLASSES, KLASS_OF, labelRich, placeText, poolOf, ranksOf, sharesLine, sourceRich } from './lifecycle-kit'
import type { Entry, Group, Klass } from './lifecycle-kit'

const FAMILY = 'tr1.which-mechanism'
const VERSION = 1
const KC_MECHANISMS = 'tr1.five-mechanisms'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'nano', title: "A stage of nano-vllm's path", kcs: [KC_MECHANISMS], levels: [0, 1, 2, 3] },
  { id: 'sglang', title: "A stage of Mini-SGLang's or SGLang's path", kcs: [KC_MECHANISMS, 'tr1.sglang-lifecycle'], levels: [0, 1, 2, 3] },
  { id: 'vllm', title: "A stage of vLLM's path", kcs: [KC_MECHANISMS, 'tr1.vllm-lifecycle'], levels: [0, 1, 2, 3] },
]

const isGroup = (id: string): id is Group => VARIANTS.some((variant) => variant.id === id)
const isKlass = (value: unknown): value is Klass => typeof value === 'string' && (KLASSES as readonly string[]).includes(value)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The five options, in the first lesson's words. They are of about one length, and an option names what it joins. */
const OPTION_TEXT: Readonly<Record<Klass, Rich>> = {
  compute: rich('Compute: the work itself, a call on the host, a launch on a GPU or a collective between GPUs'),
  queue: rich('A queue: a buffer between two threads, or between two steps of one thread'),
  ipc: rich('IPC: a hop between two processes, over a socket or through shared memory'),
  copy: rich('A copy: a transfer between the host and a GPU, down or up'),
  sync: rich('A sync: the host waits for a value that the GPU is still producing'),
}

/** What a mechanism is, as a noun phrase. */
const WHAT: Readonly<Record<Klass, string>> = {
  compute: 'Compute is the work itself, a call on the host, a launch on a GPU or a collective between GPUs',
  queue: 'A queue is a buffer between two threads, or between two steps of one thread',
  ipc: 'IPC is a hop between two processes, over a socket or through shared memory',
  copy: 'A copy is a transfer between the host and a GPU',
  sync: 'A sync is the host waiting for a value that the GPU is still producing',
}

/** The mechanism in a sentence. */
const NAME: Readonly<Record<Klass, string>> = { compute: 'compute', queue: 'a queue', ipc: 'IPC', copy: 'a copy', sync: 'a sync' }

/** The rule of the first lesson that decides it. */
const RULE: Readonly<Record<Klass, string>> = {
  compute: 'Work done where the request stands is compute.',
  queue: 'A change of thread inside a process needs a queue, and so does a request that waits its turn in a buffer.',
  ipc: 'A change of process needs IPC or shared memory.',
  copy: 'Host to GPU and GPU to host need a copy.',
  sync: 'Reading a value that the GPU is still producing needs a sync first.',
}

/** What this stage is, in a clause that follows "here". */
function here(klass: Klass, stage: StageDef): Rich {
  const { from, to } = stage
  switch (klass) {
    case 'ipc':
      return rich('the request goes from ', code(from.process), ' to ', code(to.process))
    case 'queue':
      return boundaryOf(from, to) === 'thread'
        ? rich('the request passes from ', code(from.thread), ' to ', code(to.thread), ', two threads of ', code(from.process))
        : rich('the request waits in a buffer in ', code(placeText(from)), ', between two steps of one thread')
    case 'copy':
      return stage.mechanism === 'h2d' ? rich('data goes from the host down to the GPU of ', code(to.process)) : rich('data comes from the GPU of ', code(from.process), ' up to the host')
    case 'sync':
      return rich('the host waits in ', code(placeText(from)), ' for a value that the GPU is still producing')
    case 'compute':
      return stage.mechanism === 'launch'
        ? rich('work is launched on the GPU of ', code(from.process), ' and runs there')
        : stage.mechanism === 'collective'
          ? rich('the GPUs of ', code(from.process), ' and ', code(to.process), ' combine their results with a collective')
          : rich('the engine does work on the request where it stands, in ', code(placeText(from)))
  }
}

/** Why the right option is right in this stage: what the mechanism is, what the stage does, and the rule that joins them. */
const whyRight = (klass: Klass, stage: StageDef): Rich => rich(`${WHAT[klass]}. Here `, ...here(klass, stage), `. ${RULE[klass]}`)

/** Why a wrong option is wrong: what it is, and what the stage does instead. */
const whyNot = (picked: Klass, truth: Klass, stage: StageDef): Rich => rich(`${WHAT[picked]}. Here `, ...here(truth, stage), `, so ${NAME[picked]} is not what joins the two places.`)

/** The steps of a solution, ending in the key: where the request is, what carries it, and the line of the engine's source. */
function stepsOf(entry: Entry, klass: Klass): Step[] {
  const stage = entry.stage
  return [
    { text: rich('Take the stage ', ...labelRich(stage.label), '. ', ...boundaryRich(stage)) },
    { text: rich(...whyRight(klass, stage), ` So the mechanism is ${NAME[klass]}.`) },
    { text: sourceRich(entry) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The stage for a mechanism: an engine of the group, then a stage of that engine that the lesson's five words put in the class. */
function chooseEntry(group: Group, klass: Klass, rng: Rng): Entry {
  const engine: EngineId = pick(rng, GROUP_ENGINES[group])
  return pick(
    rng,
    poolOf(engine).filter((entry) => KLASS_OF[entry.stage.mechanism] === klass),
  )
}

type Surface = 'label' | 'code'

/** Level 3 shows the line of the engine's source, unless two stages cite that line: it would not say which one is meant. */
const surfaceFor = (level: Level, entry: Entry): Surface => (level === 3 && !sharesLine(entry) ? 'code' : 'label')

function build(spec: VariantSpec, level: Level, seed: Seed): Item {
  if (!isGroup(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
  const group = spec.id
  const klass = KLASSES[drawOutcome(FAMILY, group, level, seed, KLASSES.length)]
  const entry = chooseEntry(group, klass, itemRng(FAMILY, group, level, seed, 'stage'))
  const surface = surfaceFor(level, entry)
  const stage = entry.stage
  const condition = conditionOf(entry)
  const givens: Given[] = [
    { label: 'starts at', value: code(placeText(stage.from)) },
    { label: 'ends at', value: code(placeText(stage.to)) },
    ...(condition === null ? [] : [{ label: 'the request', value: text(condition) }]),
  ]
  const ask = 'Which mechanism carries the request through it, from the place where it starts to the place where it ends?'
  const stem: Rich =
    surface === 'label'
      ? rich('Here is one stage of a request\'s path through ', ...engineWords(entry.engine), ': ', ...labelRich(stage.label), `. ${ask}`)
      : rich('Here is one stage of a request\'s path through ', ...engineWords(entry.engine), ': the line ', code(stage.source.quote), ' of ', code(stage.source.path), `. ${ask}`)
  const options = shown(
    FAMILY,
    group,
    level,
    seed,
    KLASSES.map((id): ChoiceOption => ({ id, text: OPTION_TEXT[id], why: id === klass ? whyRight(klass, stage) : whyNot(id, klass, stage), ...(id === klass ? {} : { miss: `${FAMILY}.${id}-for-${klass}` }) })),
  )
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      stem,
      givens,
      worked: workedPart(level, stepsOf(entry, klass), (attempt) => {
        // The example is a stage of another mechanism in the same group, so that its answer cannot be copied.
        const other = KLASSES[(KLASSES.indexOf(klass) + 1 + (attempt % (KLASSES.length - 1))) % KLASSES.length]
        const example = chooseEntry(group, other, itemRng(FAMILY, group, level, seed, `example-${attempt}`))
        return example.stage.id === stage.id ? null : stepsOf(example, other)
      }),
      answer: { kind: 'choice', label: 'the mechanism', options, correct: klass },
      params: { engine: entry.engine, stage: stage.id, ranks: ranksOf(entry), surface },
    },
  )
}

/** The entry and the key that an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): { entry: Entry; klass: Klass } {
  const { engine, stage, ranks } = item.params
  const entry = typeof engine === 'string' && typeof stage === 'string' && (ranks === 1 || ranks === 2) ? entryOf(engine as EngineId, stage, ranks) : undefined
  if (!isGroup(item.variant) || entry === undefined) throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a stage of the model`)
  const klass = KLASS_OF[entry.stage.mechanism]
  if (!isKlass(klass)) throw new TypeError(`${FAMILY}: the stage ${entry.stage.id} has a mechanism of no class`)
  return { entry, klass }
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const whichMechanism: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Which mechanism joins a stage',
  kcs: [KC_MECHANISMS, 'tr1.sglang-lifecycle', 'tr1.vllm-lifecycle'],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the mechanism is drawn first, and the engine and the stage follow from it.
  band: () => true,
  grade: (item, response) => gradeChoice(item, response),
  solution: (item) => {
    const { entry, klass } = sceneOf(item)
    return stepsOf(entry, klass)
  },
}
