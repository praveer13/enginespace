/**
 * `tr8.which-flag`: which flag, or which default of a flag, makes a benchmark tool report what it reports (TR8, lesson 3; KC
 * `tr8.tool-defaults`, and `tr8.client-queue` for the cap). The tools are `vllm bench serve` at vLLM v0.33.0 and `sglang.bench_serving` at
 * SGLang v0.5.23, the course's pins, and every flag and every default is a claim at the pin (flags.ts names the claims of each).
 *
 * A symptom is the report of a run, as labelled lines (a rate asked for and a rate sent, the p99 of two runs, the slowest requests of a run);
 * the harness is not shown as a command line, because a flag named in the command is a cue that the learner would not have in front of a
 * report. The question is the lesson's: which flag or default is at fault? The options are the flags, and each says why it is not the cause
 * by what it does at the pin.
 *
 * What the variants ask:
 *   at-fault-vllm    a report of `vllm bench serve`, and the flag at fault among five of its nine flags. The flag is drawn first, so each is the
 *                    key on a ninth of the seeds (levels 0 to 3);
 *   at-fault-sglang  the same for `sglang.bench_serving` and its eight flags (levels 0 to 3);
 *   default-does     the other way round: a flag is left out, and the learner says what the run does. Five behaviours, each the default of one
 *                    flag of the tool (level 3);
 *   send-rate        a cap and a rate asked for, against a server that answers every request in the same time whatever the load: the rate the
 *                    run sends is the permits over that time, which is Little's law with the cap as the number in flight, and is the lesson's
 *                    prediction. Level 3 asks for the cap that gives a rate (levels 0 to 3).
 * At level 0 a worked example (another flag, another report) comes first, at level 1 the first step of the solution is shown, and at level 2
 * the learner is alone. Level 3 changes the surface: `at-fault-*` asks for the change that mends a report and not the flag at fault,
 * `default-does` runs the lookup from the flag to the behaviour, and `send-rate` asks for the cap that gives a rate. The lesson's ticket is
 * drawn at level 2, where each of `at-fault-vllm`, `at-fault-sglang` and `send-rate` is a third of the seeds: two items in three are the
 * question that the lesson describes, and the third is the cap's arithmetic, the numeric item that an exit ticket holds (ASSESSMENT §4.2).
 */
import { shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { ARITHMETIC, drawOutcome, oneOf, shown, workedPart } from '../tr6/kit'
import { CAPS, FAULTS, sentRate } from './flags'
import type { Cap, Fault, Nums, ToolId } from './flags'

const FAMILY = 'tr8.which-flag'
const VERSION = 1
const KC_DEFAULTS = 'tr8.tool-defaults'
const KC_QUEUE = 'tr8.client-queue'

type VariantId = 'at-fault-vllm' | 'at-fault-sglang' | 'default-does' | 'send-rate'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'at-fault-vllm', title: 'The flag of vllm bench serve at fault', kcs: [KC_DEFAULTS], levels: [0, 1, 2, 3] },
  { id: 'at-fault-sglang', title: 'The flag of sglang.bench_serving at fault', kcs: [KC_DEFAULTS], levels: [0, 1, 2, 3] },
  { id: 'default-does', title: 'What a tool does when a flag is left out', kcs: [KC_DEFAULTS], levels: [3] },
  { id: 'send-rate', title: 'The rate a capped run sends', kcs: [KC_QUEUE, KC_DEFAULTS], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)
const isTool = (value: unknown): value is ToolId => value === 'vllm' || value === 'sglang'

/** How a tool is named in a stem: the command as it is typed, and the pin. */
const TOOL_NAME: Readonly<Record<ToolId, Rich>> = {
  vllm: rich(code('vllm bench serve'), ' (vLLM v0.33.0)'),
  sglang: rich(code('sglang.bench_serving'), ' (SGLang v0.5.23)'),
}

/** The tool of an `at-fault` variant. */
const toolOfVariant = (id: 'at-fault-vllm' | 'at-fault-sglang'): ToolId => (id === 'at-fault-vllm' ? 'vllm' : 'sglang')

const synthetic = (value: number, unit: string, digits?: number): NumPart => num(value, { unit, tag: 'synthetic', ...(digits === undefined ? {} : { digits }) })
const derived = (value: number, unit: string, digits?: number): NumPart => num(value, { unit, tag: 'derived', ...(digits === undefined ? {} : { digits }) })

/** Digits after the point of a figure written to hundredths at most. */
const digitsOf = (value: number): number => {
  const hundredths = Math.round(value * 100)
  return hundredths % 100 === 0 ? 0 : hundredths % 10 === 0 ? 1 : 2
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* at-fault, and default-does                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The numbers of an item's scene, read back from its params: every number in them, by name. */
function numsOf(params: Params): Nums {
  const out: Record<string, number> = {}
  for (const [name, value] of Object.entries(params)) if (typeof value === 'number') out[name] = value
  return out
}

function faultById(tool: ToolId, id: unknown): Fault {
  const found = FAULTS[tool].find((fault) => fault.id === id)
  if (found === undefined) throw new TypeError(`${FAMILY}: ${tool} has no flag "${String(id)}"`)
  return found
}

/** The five flags of an item: the one at fault, and four others of the tool, in the order the seed shows them. */
function optionFaults(pool: readonly Fault[], key: Fault, variant: VariantId, level: Level, seed: Seed): Fault[] {
  const others = shuffle(itemRng(FAMILY, variant, level, seed, 'distractors'), pool.filter((fault) => fault.id !== key.id)).slice(0, 4)
  return [key, ...others]
}

/** Why a flag that is not the cause is not: what it does at the pin, and what a fault in it would show. */
const notTheCause = (fault: Fault): Rich => rich(code(fault.flag), ' ', ...fault.does, '. A fault in it shows as ', ...fault.marks, ', which is not what this report shows.')

function faultSteps(fault: Fault, nums: Nums, level: Level): Step[] {
  return [
    { text: rich('Read what the report shows, and ask which flag, or which default of a flag, makes a run show it. Here the report shows ', ...fault.marks, '.') },
    { text: fault.cause(nums) },
    { text: level === 3 ? rich('The change that mends it: ', ...fault.fix, '.') : rich('The change: ', ...fault.fix, '.') },
  ]
}

function buildFault(spec: VariantSpec, tool: ToolId, level: Level, seed: Seed): Item {
  const variant = spec.id as 'at-fault-vllm' | 'at-fault-sglang'
  const pool = FAULTS[tool]
  const key = pool[drawOutcome(FAMILY, variant, level, seed, pool.length)]
  const nums = key.draw(itemRng(FAMILY, variant, level, seed, 'numbers'))
  const options: ChoiceOption[] = shown(
    FAMILY,
    variant,
    level,
    seed,
    optionFaults(pool, key, variant, level, seed).map(
      (fault): ChoiceOption =>
        fault.id === key.id
          ? { id: fault.id, text: level === 3 ? fault.fix : rich(code(fault.flag)), why: key.cause(nums) }
          : {
              id: fault.id,
              text: level === 3 ? fault.fix : rich(code(fault.flag)),
              why: level === 3 ? rich('That changes ', code(fault.flag), ', which ', ...fault.does, '. A fault in it shows as ', ...fault.marks, ', which is not what this report shows.') : notTheCause(fault),
              miss: `${FAMILY}.${fault.id}-taken-for`,
            },
    ),
  )
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant,
      level,
      seed,
      kcs: spec.kcs,
      params: { key: key.id, tool, ...nums },
      stem:
        level === 3
          ? rich('A team benchmarks ', ...TOOL_NAME[tool], ' and finds the report below. Which change to the command mends it?')
          : rich('A team benchmarks ', ...TOOL_NAME[tool], ' and finds the report below. Which flag, or which default of a flag, is at fault?'),
      givens: key.report(nums),
      worked: workedPart(level, faultSteps(key, nums, level), (attempt) => {
        // The example is another flag of the tool, on another report, so that its answer is not the item's.
        const other = pool[(pool.indexOf(key) + 1 + attempt) % pool.length]
        return other.id === key.id ? null : faultSteps(other, other.draw(itemRng(FAMILY, variant, level, seed, `example-${attempt}`)), level)
      }),
      answer: { kind: 'choice', label: level === 3 ? 'the change' : 'the flag at fault', options, correct: key.id },
    },
  )
}

function buildDefaultDoes(spec: VariantSpec, level: Level, seed: Seed): Item {
  const tool = oneOf(itemRng(FAMILY, spec.id, level, seed, 'tool'), ['vllm', 'sglang'] as const)
  const pool = FAULTS[tool].filter((fault) => fault.ifLeftOut !== undefined)
  const key = pool[drawOutcome(FAMILY, 'default-does', level, seed, pool.length)]
  const options: ChoiceOption[] = shown(
    FAMILY,
    'default-does',
    level,
    seed,
    optionFaults(pool, key, 'default-does', level, seed).map(
      (fault): ChoiceOption => ({
        id: fault.id,
        text: fault.ifLeftOut ?? fault.does,
        why:
          fault.id === key.id
            ? rich(...(fault.ifLeftOut ?? fault.does), '. ', code(fault.flag), ' ', ...fault.does, '.')
            : rich('That is what leaving out ', code(fault.flag), ' does. ', code(fault.flag), ' ', ...fault.does, '.'),
        ...(fault.id === key.id ? {} : { miss: `${FAMILY}.${fault.id}-taken-for` }),
      }),
    ),
  )
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: { key: key.id, tool },
      stem: rich('A run of ', ...TOOL_NAME[tool], ' leaves ', code(key.flag), ' out. What does the run do?'),
      givens: [],
      worked: [],
      answer: { kind: 'choice', label: 'what the run does', options, correct: key.id },
    },
  )
}

function defaultSteps(fault: Fault): Step[] {
  return [
    { text: rich('When ', code(fault.flag), ' is left out, the run takes its default. ', ...(fault.ifLeftOut ?? fault.does), '.') },
    { text: rich(code(fault.flag), ' ', ...fault.does, '.') },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* send-rate                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface CapScene {
  readonly tool: ToolId
  readonly cap: Cap
}

function drawCapScene(level: Level, seed: Seed, purpose: string): CapScene {
  const rng = itemRng(FAMILY, 'send-rate', level, seed, purpose)
  const scene = oneOf(rng, CAPS)
  return { tool: oneOf(rng, ['vllm', 'sglang'] as const), cap: scene }
}

const seconds = (scene: Cap): number => scene.latencyMs / 1000

function capSteps(scene: CapScene, level: Level): Step[] {
  const { cap } = scene
  const sent = sentRate(cap)
  const first: Step = {
    text: rich(
      'A cap holds each request until a permit is free, so the permits held at once are the requests in flight, and each is held for the time the server takes. By Little\'s law the run sends the permits over that time, whatever the rate asked for.',
    ),
  }
  if (level === 3) {
    return [
      first,
      {
        text: rich(derived(sent, 'req/s', digitsOf(sent)), ' × ', synthetic(seconds(cap), 's', digitsOf(seconds(cap))), ' = ', derived(cap.cap, 'requests'), ' in flight at most.'),
        result: derived(cap.cap, 'requests'),
      },
    ]
  }
  return [
    first,
    {
      text: rich(synthetic(cap.cap, 'requests'), ' ÷ ', synthetic(seconds(cap), 's', digitsOf(seconds(cap))), ' = ', derived(sent, 'req/s', digitsOf(sent)), ', which is under the ', synthetic(cap.rate, 'req/s'), ' asked for, so the cap sets the rate.'),
      result: derived(sent, 'req/s', digitsOf(sent)),
    },
  ]
}

function buildSendRate(spec: VariantSpec, scene: CapScene, level: Level, seed: Seed): Item {
  const { tool, cap } = scene
  const sent = sentRate(cap)
  const asked: Given = { label: 'request rate asked for (--request-rate)', value: synthetic(cap.rate, 'req/s') }
  const permits: Given = { label: 'requests in flight at most (--max-concurrency)', value: synthetic(cap.cap, 'requests') }
  const answers: Given = { label: 'time the server takes to answer a request', value: synthetic(seconds(cap), 's', digitsOf(seconds(cap))) }
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: { tool, rate: cap.rate, cap: cap.cap, latencyMs: cap.latencyMs },
      stem:
        level === 3
          ? rich('A team runs ', ...TOOL_NAME[tool], ' with a cap against a server that answers every request in the time given, whatever the load. In steady state the run sends at the rate below, though the rate asked for was higher. What is the cap?')
          : rich('A team runs ', ...TOOL_NAME[tool], ' against a server that answers every request in the time given, whatever the load. In steady state, at what rate does the run send requests?'),
      givens: level === 3 ? [asked, { label: 'request rate the run sent', value: synthetic(sent, 'req/s', digitsOf(sent)) }, answers] : [asked, permits, answers],
      worked: workedPart(level, capSteps(scene, level), (attempt) => {
        const example = drawCapScene(level, seed, `example-${attempt}`)
        return sentRate(example.cap) === sent || example.cap.cap === cap.cap ? null : capSteps(example, level)
      }),
      answer:
        level === 3
          ? { kind: 'numeric', label: 'requests in flight at most', unit: 'requests', truth: cap.cap, tolerance: ARITHMETIC }
          : { kind: 'numeric', label: 'request rate the run sends', unit: 'req/s', truth: sent, tolerance: ARITHMETIC, ...(digitsOf(sent) === 0 ? {} : { digits: digitsOf(sent) }) },
    },
  )
}

const capOf = (item: Pick<Item, 'params'>): CapScene => {
  const { tool, rate, cap, latencyMs } = item.params
  if (!isTool(tool) || typeof rate !== 'number' || typeof cap !== 'number' || typeof latencyMs !== 'number') throw new TypeError(`${FAMILY}: the params of send-rate are not a scene`)
  return { tool, cap: { rate, cap, latencyMs } }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading, solutions, and the family                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target, 0.005)

/** What a wrong number says about the learner. The first rule that fits wins; each message names what was done. */
const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    if (item.variant !== 'send-rate') return null
    const { cap } = capOf(item)
    const sent = sentRate(cap)
    if (item.level === 3) {
      if (near(value, sent)) return { id: `${FAMILY}.rate-for-cap`, message: rich('That is the rate the run sent. The cap is the number of requests it let into flight at once.') }
      if (near(value, cap.rate * seconds(cap))) {
        return { id: `${FAMILY}.asked-rate`, message: rich('That cap would let the run send the rate it asked for. It sent less, so the cap is smaller.') }
      }
      return null
    }
    if (near(value, cap.rate)) return { id: `${FAMILY}.rate-asked`, message: rich('That is the rate asked for. The cap holds the run below it, so the rate sent is the cap\'s.') }
    if (near(value, cap.cap * seconds(cap))) return { id: `${FAMILY}.multiplied`, message: rich('You multiplied the permits by the time. A permit is freed when a request is answered, so the run sends the permits divided by that time.') }
    if (near(value, cap.cap)) return { id: `${FAMILY}.permits-as-rate`, message: rich('That is the cap itself, in requests. A rate is requests in a second, and each permit is held for the time the server takes.') }
    return null
  },
]

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const whichFlag: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Which flag of the benchmark tools',
  kcs: [KC_DEFAULTS, KC_QUEUE],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    switch (spec.id) {
      case 'at-fault-vllm':
      case 'at-fault-sglang':
        return buildFault(spec, toolOfVariant(spec.id), level, seed)
      case 'default-does':
        return buildDefaultDoes(spec, level, seed)
      case 'send-rate':
        return buildSendRate(spec, drawCapScene(level, seed, 'scene'), level, seed)
    }
  },
  // The flag is drawn first and the report follows from it, and a cap is drawn from the scenes in which it binds, so every seed makes a fair question.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    if (item.variant === 'send-rate') return capSteps(capOf(item), item.level)
    const tool = item.params['tool']
    if (!isTool(tool)) throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
    const fault = faultById(tool, item.params['key'])
    return item.variant === 'default-does' ? defaultSteps(fault) : faultSteps(fault, numsOf(item.params), item.level)
  },
}
