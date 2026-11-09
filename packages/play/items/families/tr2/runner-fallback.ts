/**
 * `tr2.runner-fallback`: which model runner serves a configuration, which phase of the step the V2 runner shortens, and how much of the CPU's work
 * it takes off (TR2, lesson 4; KC `tr2.mrv2-delta`: say what the V2 model runner changes about the step, and when a configuration falls back to the
 * older runner). It is the exit item of lesson 4 that asks "which runner serves it", "which phase of the step MRV2 shortens", and "how many µs of the
 * step it takes out".
 *
 * At vLLM v0.33.0 (the course's pin) the engine picks its runner in this order (claims vllm.mrv2.env-decides, vllm.mrv2.default-rule,
 * vllm.mrv2.fallback-reasons): when `VLLM_USE_V2_MODEL_RUNNER` is set, in either direction, its value decides, and the checks that follow are skipped;
 * when it is unset, MRV2 is used unless Triton is missing or the configuration uses a feature MRV2 does not yet support, and then the engine warns once
 * and uses MRV1. Five things are on that list: pipeline parallelism with the `external_launcher` backend, the speculative methods `suffix` and
 * `custom_class`, parallel drafting for EAGLE, draft models with their own vocabulary, and the features dual-batch overlap lacks (the last never arises
 * in these scenes). The sim keeps the speculative methods as data (`resolveRunner`, packages/sim/steploop/runners.ts).
 *
 * What MRV2 changes about a step, in the lesson's table (claims vllm.mrv2.decoupled-state, vllm.mrv2.persistent-rows, vllm.mrv2.staged-write,
 * vllm.mrv2.gpu-input-prep, vllm.mrv2.no-cpu-sync, vllm.mrv2.triton-sampler), reaches the course's model through three phases of its host card and no
 * other: `prepare`, `sync` and `sample` cost less on MRV2's preset than on V1's, and `schedule` and `launch` cost the same
 * (packages/sim/host/presets.ts; every figure there is [estimated]).
 *
 * What the variants ask:
 *   which-runner  the runner that a configuration gets, one of four outcomes drawn first so that each is the key on one seed in four: MRV2 by default,
 *                 MRV2 because the variable is set to 1 whatever the checks say, MRV1 because the variable is set to 0 with no warning, and MRV1 after
 *                 one warning. At level 3 two runs are compared and the learner says in which MRV2 serves (levels 0 to 3);
 *   phase         which of three phases of the course's model a change of MRV2's shortens: its state and inputs, its waiting, or its sampling
 *                 (levels 0 to 3; at level 3 the change is named by its phase, and the learner picks the change);
 *   saves         the CPU's work per step that MRV2 takes off, from the costs of a decode step on each runner; at level 3 the saving as the GPU's idle
 *                 time sees it, with async scheduling on and a forward that hides some of the work (levels 0 to 3).
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown, at level 2 the learner is alone, and
 * level 3 changes the surface as above.
 *
 * tests/play/items-runner-fallback.test.ts holds `which-runner` to a second statement of the rule and to the sim's `resolveRunner`, `phase` to the
 * sim's host presets, and `saves` to the step loop run with each host card.
 */
import { below, between, divRound, pick, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, Params, Rich, Step, VariantSpec } from '../../types'
import { ARITHMETIC, derived, drawOutcome, estimated, given, shown, workedPart } from './kit'

const FAMILY = 'tr2.runner-fallback'
const VERSION = 1
const KC = 'tr2.mrv2-delta'

type VariantId = 'which-runner' | 'phase' | 'saves'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-runner', title: 'Which runner serves a configuration', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'phase', title: 'The phase a change of MRV2 shortens', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'saves', title: 'The CPU work MRV2 takes off a step', kcs: [KC], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The rule of the runner                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Env = 'unset' | '0' | '1'

/** What a configuration says of speculation: a method that MRV2 takes, or one of the four blockers that are speculative. */
export type Spec = 'none' | 'ngram' | 'eagle3' | 'mtp' | 'draft-same' | 'suffix' | 'custom_class' | 'eagle3-parallel' | 'draft-own'

export interface Config {
  readonly env: Env
  readonly triton: boolean
  readonly spec: Spec
  /** Pipeline parallelism with the `external_launcher` backend, of this size, or 0 for none. */
  readonly pp: number
}

/** The four outcomes of a configuration. `default` and `forced` are MRV2; `chosen` and `fallback` are MRV1. */
export type Outcome = 'default' | 'forced' | 'chosen' | 'fallback'
export const OUTCOMES: readonly Outcome[] = ['default', 'forced', 'chosen', 'fallback']

const BLOCKERS: readonly Spec[] = ['suffix', 'custom_class', 'eagle3-parallel', 'draft-own']
const DECOYS: readonly Spec[] = ['none', 'ngram', 'eagle3', 'mtp', 'draft-same']

/**
 * The names of the things in `config` that MRV2 does not yet support, in the order the pinned code collects them
 * (`_get_v2_model_runner_unsupported_features`): the log prints them joined by commas.
 */
export function unsupported(config: Config): string[] {
  const out: string[] = []
  if (config.pp > 1) out.push('pipeline parallelism with external_launcher')
  if (config.spec === 'suffix' || config.spec === 'custom_class') out.push(`speculative method '${config.spec}'`)
  if (config.spec === 'eagle3-parallel') out.push('parallel drafting for EAGLE speculative decoding')
  if (config.spec === 'draft-own') out.push('heterogeneous-vocabulary draft models')
  return out
}

/** What the engine does with a configuration: the rule of `use_v2_model_runner`, without the two features (HiSparse and watermarking) that this family leaves out. */
export function outcomeOf(config: Config): Outcome {
  const blocked = !config.triton || unsupported(config).length > 0
  if (config.env === '1') return blocked ? 'forced' : 'default'
  if (config.env === '0') return 'chosen'
  return blocked ? 'fallback' : 'default'
}

export const runnerOf = (outcome: Outcome): 'mrv2' | 'v1' => (outcome === 'default' || outcome === 'forced' ? 'mrv2' : 'v1')

/** The method a spec is, as a configuration spells it. */
const METHOD: Readonly<Record<Spec, string>> = {
  none: 'none',
  ngram: 'ngram',
  eagle3: 'eagle3',
  mtp: 'mtp',
  'draft-same': 'draft_model',
  suffix: 'suffix',
  custom_class: 'custom_class',
  'eagle3-parallel': 'eagle3',
  'draft-own': 'draft_model',
}

/** The runner a speculative method gets from the sim's presets, for the methods the sim tells apart. */
export const SIM_METHODS: readonly string[] = ['ngram', 'eagle3', 'mtp', 'draft_model', 'suffix', 'custom_class']

/** A configuration that gets `outcome`, drawn so that the blockers and the decoys both appear. */
function drawConfig(outcome: Outcome, rng: Rng): Config {
  const decoy = pick(rng, DECOYS)
  const blocker = pick(rng, BLOCKERS)
  // One reason to fall back: Triton is missing, pipeline parallelism with external_launcher, or one of the four speculative blockers.
  const reason = below(rng, 6)
  const blocked = { triton: reason !== 0, spec: reason >= 2 ? blocker : decoy, pp: reason === 1 ? 2 + 2 * below(rng, 2) : 0 }
  switch (outcome) {
    case 'default':
      return { env: 'unset', triton: true, spec: decoy, pp: 0 }
    case 'forced':
      return { env: '1', ...blocked }
    case 'fallback':
      return { env: 'unset', ...blocked }
    case 'chosen': {
      // Half the time nothing blocks MRV2, and the variable alone sends the engine to MRV1; half the time something does, and it is ignored.
      return below(rng, 2) === 0 ? { env: '0', triton: true, spec: decoy, pp: 0 } : { env: '0', ...blocked }
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scene                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface RunnerScene {
  readonly variant: 'which-runner'
  readonly first: Config
  /** Level 3 only: the second run. */
  readonly second: Config | null
}

/** The changes of MRV2 that the lesson lists, each with the phase of the course's model that it shortens and the claim it rests on. */
export type PhaseId = 'prepare' | 'sync' | 'sample'
export const PHASE_IDS: readonly PhaseId[] = ['prepare', 'sync', 'sample']

interface Change {
  readonly id: string
  readonly phase: PhaseId
  readonly text: Rich
}

export const CHANGES: readonly Change[] = [
  { id: 'rows', phase: 'prepare', text: rich('It keeps each request\'s state in a fixed row of a table, and gathers the inputs of a step from the table in that step\'s order.') },
  { id: 'block-tables', phase: 'prepare', text: rich('It keeps the block tables on the GPU, stages only the differences on the CPU, and applies them with one kernel instead of copying the whole table at every step.') },
  { id: 'gpu-inputs', phase: 'prepare', text: rich('It prepares the input ids, the positions and the sequence lengths with Triton kernels on the GPU.') },
  { id: 'no-sync', phase: 'sync', text: rich('It runs the core loop as a CUDA stream with no CPU synchronization points, and the CPU only queues work onto it.') },
  { id: 'sampler', phase: 'sample', text: rich('It samples mostly with Triton kernels, with a Gumbel kernel that never builds the softmax.') },
]

interface PhaseScene {
  readonly variant: 'phase'
  readonly change: string
  /** Level 3: the two other changes that are the lures. */
  readonly others: readonly string[]
}

/** The costs of a decode step on one runner, in µs: per token, once, and per row. */
interface Costs {
  readonly prepare: number
  readonly sync: number
  readonly sample: number
}

interface SavesScene {
  readonly variant: 'saves'
  readonly rows: number
  readonly v1: Costs
  readonly v2: Costs
  /** Level 3: the CPU's work that the two runners share (the schedule and the launch), and the forward that hides some of it. */
  readonly shared: number
  readonly forward: number
}

type Scene = RunnerScene | PhaseScene | SavesScene

/** The CPU's work of a decode step of `rows` rows on a runner: its shared part, the prepare of each token, the sync, and the sample of each row. */
const cpuOn = (costs: Costs, rows: number, shared: number): number => shared + rows * costs.prepare + costs.sync + rows * costs.sample

/** The rule of `saves`, as arithmetic on the two cards. */
export const savesModel = {
  /** What MRV2 takes off the CPU's work in a step: the three phases that differ. */
  saved: (v1: Costs, v2: Costs, rows: number): number => rows * (v1.prepare - v2.prepare) + (v1.sync - v2.sync) + rows * (v1.sample - v2.sample),
  /** The GPU's idle time between two forwards with async scheduling on: the CPU's work less the forward, and nothing when the forward is the longer. */
  idleOn: (cpu: number, forward: number): number => Math.max(0, cpu - forward),
} as const

/** `shift` moves the outcome on from the one the seed draws: a worked example is the scene of another outcome. */
function drawRunner(level: Level, seed: Seed, purpose: string, shift = 0): RunnerScene {
  const rng = itemRng(FAMILY, 'which-runner', level, seed, purpose)
  if (level < 3) {
    const outcome = OUTCOMES[(drawOutcome(FAMILY, 'which-runner', level, seed, OUTCOMES.length) + shift) % OUTCOMES.length]
    return { variant: 'which-runner', first: drawConfig(outcome, rng), second: null }
  }
  // The pair is one of four: MRV2 serves only the first run, only the second, both, or neither.
  const pair = (drawOutcome(FAMILY, 'which-runner', level, seed, 4) + shift) % 4
  const wants: ('mrv2' | 'v1')[] = [pair === 0 || pair === 2 ? 'mrv2' : 'v1', pair === 1 || pair === 2 ? 'mrv2' : 'v1']
  const make = (want: 'mrv2' | 'v1'): Config => drawConfig(want === 'mrv2' ? pick(rng, ['default', 'forced'] as const) : pick(rng, ['chosen', 'fallback'] as const), rng)
  return { variant: 'which-runner', first: make(wants[0]), second: make(wants[1]) }
}

function drawPhase(level: Level, seed: Seed, purpose: string): PhaseScene {
  const rng = itemRng(FAMILY, 'phase', level, seed, purpose)
  const phase = PHASE_IDS[drawOutcome(FAMILY, 'phase', level, seed, PHASE_IDS.length)]
  const change = pick(
    rng,
    CHANGES.filter((candidate) => candidate.phase === phase),
  )
  // At level 3 the phase is named and the changes are the options: the right one, and two from the other phases.
  const others = shuffle(
    rng,
    PHASE_IDS.filter((candidate) => candidate !== phase).map((other) => pick(rng, CHANGES.filter((candidate) => candidate.phase === other)).id),
  )
  return { variant: 'phase', change: change.id, others }
}

function drawSaves(level: Level, seed: Seed, purpose: string): SavesScene {
  const rng = itemRng(FAMILY, 'saves', level, seed, purpose)
  const rows = pick(rng, [4, 6, 8, 12, 16, 24, 32, 48, 64])
  const v1: Costs = { prepare: between(rng, 6, 14), sync: 10 * between(rng, 4, 10), sample: between(rng, 20, 40) }
  const v2: Costs = { prepare: between(rng, 1, 4), sync: 5 * between(rng, 2, 6), sample: between(rng, 8, 18) }
  const shared = 10 * between(rng, 20, 80)
  const cpu1 = cpuOn(v1, rows, shared)
  const cpu2 = cpuOn(v2, rows, shared)
  // The forward, to the nearest 100 µs. At level 3 it hides all of the legacy runner's work in one scene of ten (nothing is saved), some of it in four
  // (the saving is cut), and none of either runner's in the rest (the whole saving shows).
  const hundreds = (micros: number): number => 100 * Math.max(1, divRound(micros, 100))
  const regime = below(rng, 10)
  const forward =
    level < 3
      ? 100 * between(rng, 8, 120)
      : regime === 0
        ? hundreds(cpu1 + 400)
        : regime <= 4
          ? hundreds(cpu2 + divRound((cpu1 - cpu2) * between(rng, 20, 80), 100))
          : hundreds(divRound(cpu2 * between(rng, 30, 90), 100))
  return { variant: 'saves', rows, v1, v2, shared, forward }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  return variant === 'which-runner' ? drawRunner(level, seed, purpose) : variant === 'phase' ? drawPhase(level, seed, purpose) : drawSaves(level, seed, purpose)
}

function isFair(scene: Scene, level: Level): boolean {
  if (scene.variant === 'saves') {
    const saved = savesModel.saved(scene.v1, scene.v2, scene.rows)
    if (saved <= 0) return false
    if (level < 3) return true
    // The forward is not equal to the CPU's work of either runner (within a twentieth), so that no rule of thumb passes.
    const [c1, c2] = [cpuOn(scene.v1, scene.rows, scene.shared), cpuOn(scene.v2, scene.rows, scene.shared)]
    return Math.abs(c1 - scene.forward) * 20 > c1 && Math.abs(c2 - scene.forward) * 20 > c2
  }
  return true
}

const specParam = (spec: Spec): string => spec

function paramsOf(scene: Scene): Params {
  switch (scene.variant) {
    case 'which-runner':
      return {
        env: scene.first.env,
        triton: scene.first.triton,
        spec: specParam(scene.first.spec),
        pp: scene.first.pp,
        env2: scene.second?.env ?? '',
        triton2: scene.second?.triton ?? false,
        spec2: scene.second === null ? '' : specParam(scene.second.spec),
        pp2: scene.second?.pp ?? 0,
      }
    case 'phase':
      return { change: scene.change, others: scene.others.join(',') }
    case 'saves':
      return {
        rows: scene.rows,
        prepare1: scene.v1.prepare,
        sync1: scene.v1.sync,
        sample1: scene.v1.sample,
        prepare2: scene.v2.prepare,
        sync2: scene.v2.sync,
        sample2: scene.v2.sample,
        shared: scene.shared,
        forward: scene.forward,
      }
  }
}

const SPECS: readonly string[] = [...DECOYS, ...BLOCKERS]
const isSpec = (value: unknown): value is Spec => typeof value === 'string' && SPECS.includes(value)
const isEnv = (value: unknown): value is Env => value === 'unset' || value === '0' || value === '1'

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const p = item.params
  if (item.variant === 'which-runner') {
    if (!isEnv(p.env) || typeof p.triton !== 'boolean' || !isSpec(p.spec) || typeof p.pp !== 'number') throw new TypeError(`${FAMILY}: the params of which-runner are not a scene`)
    const first: Config = { env: p.env, triton: p.triton, spec: p.spec, pp: p.pp }
    if (p.env2 === '') return { variant: 'which-runner', first, second: null }
    if (!isEnv(p.env2) || typeof p.triton2 !== 'boolean' || !isSpec(p.spec2) || typeof p.pp2 !== 'number') throw new TypeError(`${FAMILY}: the second run of which-runner is not a configuration`)
    return { variant: 'which-runner', first, second: { env: p.env2, triton: p.triton2, spec: p.spec2, pp: p.pp2 } }
  }
  if (item.variant === 'phase') {
    if (typeof p.change !== 'string' || typeof p.others !== 'string') throw new TypeError(`${FAMILY}: the params of phase are not a scene`)
    return { variant: 'phase', change: p.change, others: p.others === '' ? [] : p.others.split(',') }
  }
  const nums = ['rows', 'prepare1', 'sync1', 'sample1', 'prepare2', 'sync2', 'sample2', 'shared', 'forward'] as const
  for (const name of nums) if (typeof p[name] !== 'number') throw new TypeError(`${FAMILY}: the params of saves are not a scene (${name})`)
  const n = (name: (typeof nums)[number]): number => p[name] as number
  return { variant: 'saves', rows: n('rows'), v1: { prepare: n('prepare1'), sync: n('sync1'), sample: n('sample1') }, v2: { prepare: n('prepare2'), sync: n('sync2'), sample: n('sample2') }, shared: n('shared'), forward: n('forward') }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* which-runner: words                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

const TRITON_LINE = 'Model Runner V2 requires Triton; using the V1 model runner instead.'

/** The lines of a configuration that a ticket prints. `prefix` tells two runs apart. */
function configGivens(config: Config, prefix = ''): Given[] {
  const lines: Given[] = [
    { label: `${prefix}VLLM_USE_V2_MODEL_RUNNER`, value: code(config.env) },
    { label: `${prefix}Triton`, value: text(config.triton ? 'installed' : 'not installed') },
    { label: `${prefix}speculative method`, value: config.spec === 'none' ? text('none') : code(METHOD[config.spec]) },
  ]
  if (config.spec === 'eagle3-parallel') lines.push({ label: `${prefix}parallel drafting`, value: text('on') })
  if (config.spec === 'draft-same' || config.spec === 'draft-own') lines.push({ label: `${prefix}vocabulary of the draft model`, value: text(config.spec === 'draft-own' ? 'its own' : 'the target\'s') })
  if (config.pp > 1) {
    lines.push({ label: `${prefix}pipeline parallel size`, value: given(config.pp, '') }, { label: `${prefix}distributed executor backend`, value: code('external_launcher') })
  }
  return lines
}

const DECOY_TEXT: Readonly<Record<string, string>> = {
  ngram: 'The n-gram method is not one of the two speculative methods that MRV2 hands back.',
  eagle3: 'EAGLE-3 without parallel drafting is not on MRV2\'s list.',
  mtp: 'MTP is not on MRV2\'s list.',
  'draft-same': 'A draft model that shares the target\'s vocabulary is not on MRV2\'s list.',
}

/** Why a configuration gets the runner it gets: two sentences, the rule and its application. */
function explain(config: Config): Step[] {
  const outcome = outcomeOf(config)
  const reasons = unsupported(config)
  if (config.env === 'unset') {
    const first: Step = { text: rich('The variable is unset, so the engine checks Triton, and then the features that MRV2 does not yet support.') }
    if (!config.triton) {
      return [first, { text: rich('Triton is not installed, so the engine warns once, ', code(TRITON_LINE), ', and uses MRV1.') }]
    }
    if (reasons.length > 0) {
      return [first, { text: rich('MRV2 does not yet support ', code(reasons.join(', ')), ', so the engine warns once, with a line that begins ', code('Model Runner V2 does not yet support'), ', and uses MRV1.') }]
    }
    return [first, { text: rich('Triton is installed and nothing here is on MRV2\'s list of unsupported features', ...(config.spec in DECOY_TEXT ? [': ', DECOY_TEXT[config.spec]] : ['.']), ' So the engine uses MRV2, and the log has no line about the runner.') }]
  }
  const decides: Step = { text: rich('The variable is set, and when it is set, in either direction, its value decides the runner and the checks for Triton and for unsupported features are skipped.') }
  if (config.env === '0') {
    return [decides, { text: rich('It is set to ', code('0'), ', so the engine uses MRV1 and says nothing about it: nothing fell back, so there is no warning', ...(outcome === 'chosen' && (reasons.length > 0 || !config.triton) ? [', whatever Triton and the features are'] : []), '.') }]
  }
  return [
    decides,
    {
      text:
        reasons.length > 0 || !config.triton
          ? rich('It is set to ', code('1'), ', so the engine uses MRV2 even though ', ...(config.triton ? [code(reasons.join(', ')), ' is on the list of unsupported features'] : ['Triton is not installed']), ', which would have sent an engine with the variable unset back to MRV1.')
          : rich('It is set to ', code('1'), ', so the engine uses MRV2.'),
    },
  ]
}

const OUTCOME_TEXT: Readonly<Record<Outcome, Rich>> = {
  default: rich('MRV2, and the log has no line about the runner'),
  forced: rich('MRV2, because the variable is set to ', code('1'), ' and its value decides, whatever the checks would say'),
  chosen: rich('MRV1, because the variable is set to ', code('0'), ', with no warning'),
  fallback: rich('MRV1, after one warning that says why MRV2 will not do'),
}

/** Why an outcome is not the one a configuration gets. */
function whyNot(option: Outcome, config: Config): Rich {
  const reasons = unsupported(config)
  switch (option) {
    case 'default':
      return config.env !== 'unset'
        ? rich('The variable is set, so its value decides the runner and the checks do not run: this is not the unset engine\'s default.')
        : rich('MRV2 does not take this configuration: ', !config.triton ? 'Triton is not installed' : reasons.join(', '), ', so the engine falls back to MRV1.')
    case 'forced':
      return config.env === 'unset'
        ? rich('The variable is unset, so nothing forces MRV2: the engine runs its checks.')
        : config.env === '0'
          ? rich('The variable is set to ', code('0'), ', which picks MRV1, not MRV2.')
          : rich('The variable is set to ', code('1'), ', but there is nothing to force: Triton is installed and nothing here is on the list, so MRV2 is the default.')
    case 'chosen':
      return config.env === '1'
        ? rich('The variable is set to ', code('1'), ', which picks MRV2, not MRV1.')
        : rich('The variable is not set to ', code('0'), ', so the choice is not the variable\'s: the engine runs its checks.')
    case 'fallback':
      return config.env === 'unset'
        ? rich('Nothing blocks MRV2: Triton is installed and the configuration is not on the list of unsupported features, so there is no fallback and no warning.')
        : rich('The variable is set, and its value decides the runner and skips the checks, so there is no check to fail and no warning.')
  }
}

function runnerOptions(scene: RunnerScene, level: Level, seed: Seed): ChoiceOption[] {
  const [config, second] = [scene.first, scene.second]
  if (second === null) {
    const truth = outcomeOf(config)
    return shown(
      FAMILY,
      'which-runner',
      level,
      seed,
      OUTCOMES.map(
        (outcome): ChoiceOption => ({
          id: outcome,
          text: OUTCOME_TEXT[outcome],
          why: outcome === truth ? rich(...explain(config).flatMap((step) => [...step.text, text(' ')])) : whyNot(outcome, config),
          ...(outcome === truth ? {} : { miss: `${FAMILY}.${outcome}-taken-for` }),
        }),
      ),
    )
  }
  // The pair: MRV2 serves the first run, the second, both or neither.
  const served = [runnerOf(outcomeOf(config)) === 'mrv2', runnerOf(outcomeOf(second)) === 'mrv2']
  const words = (is: boolean): string => (is ? 'MRV2' : 'MRV1')
  const truth = served[0] && served[1] ? 'both' : served[0] ? 'first' : served[1] ? 'second' : 'neither'
  const summary = rich('The first run gets ', words(served[0]), ' and the second gets ', words(served[1]), '.')
  const options: [string, Rich][] = [
    ['first', rich('MRV2 serves only the first run')],
    ['second', rich('MRV2 serves only the second run')],
    ['both', rich('MRV2 serves both runs')],
    ['neither', rich('MRV2 serves neither run')],
  ]
  return shown(
    FAMILY,
    'which-runner',
    level,
    seed,
    options.map(
      ([id, label]): ChoiceOption => ({
        id,
        text: label,
        why: id === truth ? rich(...summary) : rich('That is not so. ', ...summary),
        ...(id === truth ? {} : { miss: `${FAMILY}.${id}-assumed` }),
      }),
    ),
  )
}

function runnerSteps(scene: RunnerScene): Step[] {
  if (scene.second === null) {
    const steps = explain(scene.first)
    const outcome = outcomeOf(scene.first)
    return [...steps, { text: rich('So the answer is: ', ...OUTCOME_TEXT[outcome], '.') }]
  }
  const first = explain(scene.first)
  const second = explain(scene.second)
  return [
    { text: rich('First run. ', ...first[0].text, ' ', ...first[1].text) },
    { text: rich('Second run. ', ...second[0].text, ' ', ...second[1].text) },
    { text: rich('So the first run gets ', runnerOf(outcomeOf(scene.first)) === 'mrv2' ? 'MRV2' : 'MRV1', ' and the second gets ', runnerOf(outcomeOf(scene.second)) === 'mrv2' ? 'MRV2' : 'MRV1', '.') },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* phase: words                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const changeOf = (id: string): Change => {
  const found = CHANGES.find((candidate) => candidate.id === id)
  if (found === undefined) throw new RangeError(`${FAMILY}: no change "${id}"`)
  return found
}

/** What shortens each phase, for the reason an option gives when it is not the change's. */
const PHASE_BY: Readonly<Record<PhaseId, Rich>> = {
  prepare: rich('the way MRV2 keeps its state and builds its inputs: a fixed row for each request, staged block tables and inputs made on the GPU'),
  sync: rich('the loop with no CPU synchronization points'),
  sample: rich('the Triton sampler'),
}

/** What the sim's host presets do to a phase: MRV2's cost against V1's, per token, once or per row. [estimated] */
const PRESET_COST: Readonly<Record<PhaseId, { readonly v1: number; readonly v2: number; readonly per: string }>> = {
  prepare: { v1: 8, v2: 2, per: 'a token' },
  sync: { v1: 60, v2: 20, per: 'a step' },
  sample: { v1: 31, v2: 15, per: 'a row' },
}

function phaseSteps(scene: PhaseScene): Step[] {
  const change = changeOf(scene.change)
  const cost = PRESET_COST[change.phase]
  return [
    { text: rich('The model\'s step has five CPU phases: schedule, prepare, launch, sync and sample. The scheduler belongs to the engine core and sits behind both runners, so a change of the runner reaches only the phases that the runner does.') },
    { text: rich(...change.text, ' So it takes work out of ', code(change.phase), '.') },
    {
      text: rich('The model\'s presets say so: MRV2\'s ', code(change.phase), ' costs ', estimated(cost.v2, 'µs'), ' ', cost.per, ' where V1\'s costs ', estimated(cost.v1, 'µs'), ', and the other phases cost the same on both.'),
    },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* saves: words                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

const us = (value: number): ReturnType<typeof given> => given(value, 'µs')

function savesGivens(scene: SavesScene, level: Level): Given[] {
  const lines: Given[] = [
    { label: 'rows in the step', value: given(scene.rows, 'requests') },
    { label: 'V1: prepare, for each token', value: us(scene.v1.prepare) },
    { label: 'V1: sync', value: us(scene.v1.sync) },
    { label: 'V1: sample, for each row', value: us(scene.v1.sample) },
    { label: 'MRV2: prepare, for each token', value: us(scene.v2.prepare) },
    { label: 'MRV2: sync', value: us(scene.v2.sync) },
    { label: 'MRV2: sample, for each row', value: us(scene.v2.sample) },
  ]
  if (level === 3) lines.push({ label: 'schedule and launch, on either runner', value: us(scene.shared) }, { label: 'forward (GPU)', value: us(scene.forward) })
  return lines
}

function savesSteps(scene: SavesScene, level: Level): Step[] {
  const { rows, v1, v2 } = scene
  const saved = savesModel.saved(v1, v2, rows)
  const first: Step = {
    text: rich('A decode step has one token and one row for each request, so the prepare and the sample are paid ', given(rows, 'times'), ' each. The schedule and the launch cost the same on both runners and take nothing off.'),
  }
  const perPhase: Step = {
    text: rich(
      'MRV2 takes off ',
      given(rows, ''),
      ' × (',
      us(v1.prepare),
      ' − ',
      us(v2.prepare),
      ') in prepare, ',
      us(v1.sync),
      ' − ',
      us(v2.sync),
      ' in sync, and ',
      given(rows, ''),
      ' × (',
      us(v1.sample),
      ' − ',
      us(v2.sample),
      ') in sample: ',
      derived(rows * (v1.prepare - v2.prepare), 'µs'),
      ' + ',
      derived(v1.sync - v2.sync, 'µs'),
      ' + ',
      derived(rows * (v1.sample - v2.sample), 'µs'),
      ' = ',
      derived(saved, 'µs'),
      '.',
    ),
  }
  if (level < 3) return [first, { text: perPhase.text, result: derived(saved, 'µs') }]
  const c1 = cpuOn(v1, rows, scene.shared)
  const c2 = cpuOn(v2, rows, scene.shared)
  const idle1 = savesModel.idleOn(c1, scene.forward)
  const idle2 = savesModel.idleOn(c2, scene.forward)
  return [
    { text: rich('With async scheduling on, the CPU does a step\'s work while the forward runs, so the GPU idles only for the CPU\'s work less the forward, and not at all when the forward is the longer.') },
    { text: rich('The CPU\'s work on V1 is ', us(scene.shared), ' + ', derived(rows * v1.prepare, 'µs'), ' + ', us(v1.sync), ' + ', derived(rows * v1.sample, 'µs'), ' = ', derived(c1, 'µs'), ', and on MRV2 it is ', derived(c2, 'µs'), '.') },
    {
      text: rich('Against a forward of ', us(scene.forward), ' the GPU idles for ', derived(idle1, 'µs'), ' on V1 and ', derived(idle2, 'µs'), ' on MRV2: MRV2 takes off ', derived(idle1 - idle2, 'µs'), ', of the ', derived(saved, 'µs'), ' it takes off the CPU.'),
      result: derived(idle1 - idle2, 'µs'),
    },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function solutionOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  return scene.variant === 'which-runner' ? runnerSteps(scene) : scene.variant === 'phase' ? phaseSteps(scene) : savesSteps(scene, item.level)
}

/** The key of a `which-runner` scene: the outcome of its one run, or which of the two runs MRV2 serves. */
const runnerKey = (scene: RunnerScene): string => {
  if (scene.second === null) return outcomeOf(scene.first)
  const served = [runnerOf(outcomeOf(scene.first)) === 'mrv2', runnerOf(outcomeOf(scene.second)) === 'mrv2']
  return served[0] && served[1] ? 'both' : served[0] ? 'first' : served[1] ? 'second' : 'neither'
}

const keyOfSaves = (scene: SavesScene, level: Level): number => {
  if (level < 3) return savesModel.saved(scene.v1, scene.v2, scene.rows)
  return savesModel.idleOn(cpuOn(scene.v1, scene.rows, scene.shared), scene.forward) - savesModel.idleOn(cpuOn(scene.v2, scene.rows, scene.shared), scene.forward)
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene) }
  if (scene.variant === 'which-runner') {
    const pair = scene.second !== null
    const truth = runnerKey(scene)
    return finishItem(gen, {
      ...base,
      stem: pair
        ? rich('A team starts vLLM v0.33.0 twice, with the two configurations below. Triton is installed or not as each says, and no other feature matters. In which run does MRV2 serve?')
        : rich('A team starts vLLM v0.33.0 with the configuration below. Which runner does the engine use, and what does the log say about it?'),
      givens: pair ? [...configGivens(scene.first, 'first run: '), ...configGivens(scene.second as Config, 'second run: ')] : configGivens(scene.first),
      worked: workedPart(level, runnerSteps(scene), (attempt) => {
        const example = drawRunner(level, seed, `example-${attempt}`, 1 + attempt)
        return runnerKey(example) !== truth ? runnerSteps(example) : null
      }),
      answer: { kind: 'choice', label: pair ? 'where MRV2 serves' : 'the runner and the log', options: runnerOptions(scene, level, seed), correct: truth },
    })
  }
  if (scene.variant === 'phase') {
    const change = changeOf(scene.change)
    if (level === 3) {
      const options = [scene.change, ...scene.others].map((id): ChoiceOption => {
        const one = changeOf(id)
        return {
          id: one.id,
          text: one.text,
          why: id === scene.change ? rich(...one.text, ' It takes work out of ', code(one.phase), '.') : rich(...one.text, ' That is work taken out of ', code(one.phase), ', not ', code(change.phase), '.'),
          ...(id === scene.change ? {} : { miss: `${FAMILY}.${one.phase}-taken-for-${change.phase}` }),
        }
      })
      return finishItem(gen, {
        ...base,
        stem: rich('In the course\'s model of the step, which of these changes of MRV2 shortens ', code(change.phase), '?'),
        givens: [],
        worked: workedPart(level, phaseSteps(scene), (attempt) => {
          const other = CHANGES[(CHANGES.findIndex((candidate) => candidate.id === scene.change) + 1 + attempt) % CHANGES.length]
          return other.phase !== change.phase ? phaseSteps({ ...scene, change: other.id }) : null
        }),
        answer: { kind: 'choice', label: 'the change', options: shown(FAMILY, 'phase', level, seed, options), correct: scene.change },
      })
    }
    const options = PHASE_IDS.map(
      (phase): ChoiceOption => ({
        id: phase,
        text: rich(code(phase)),
        why: phase === change.phase ? rich(...change.text, ' It takes work out of ', code(phase), '.') : rich('This change does not take work out of ', code(phase), ': that phase is shortened by ', ...PHASE_BY[phase], ', and this is another change.'),
        ...(phase === change.phase ? {} : { miss: `${FAMILY}.${change.phase}-taken-for-${phase}` }),
      }),
    )
    return finishItem(gen, {
      ...base,
      stem: rich('In the course\'s model of the step, which phase does this change of MRV2 shorten? ', ...change.text),
      givens: [],
      worked: workedPart(level, phaseSteps(scene), (attempt) => {
        const other = CHANGES[(CHANGES.findIndex((candidate) => candidate.id === scene.change) + 1 + attempt) % CHANGES.length]
        return other.phase !== change.phase ? phaseSteps({ ...scene, change: other.id }) : null
      }),
      answer: { kind: 'choice', label: 'the phase', options: shown(FAMILY, 'phase', level, seed, options), correct: change.phase },
    })
  }
  const truth = keyOfSaves(scene, level)
  return finishItem(gen, {
    ...base,
    stem:
      level < 3
        ? rich('In a synthetic engine a decode step has one token for each request. The model\'s presets for the two runners differ in three phases. How many µs of the CPU\'s work does MRV2 take off a step?')
        : rich('In a synthetic engine a decode step has one token for each request, and async scheduling is on. By how many µs does MRV2 shorten the GPU\'s idle time between two forwards?'),
    givens: savesGivens(scene, level),
    worked: workedPart(level, savesSteps(scene, level), (attempt) => {
      const example = drawSaves(level, seed, `example-${attempt}`)
      return isFair(example, level) && keyOfSaves(example, level) !== truth ? savesSteps(example, level) : null
    }),
    answer: { kind: 'numeric', label: level < 3 ? 'µs taken off a step' : 'µs taken off the idle time', unit: 'µs', truth, tolerance: ARITHMETIC },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target)

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant !== 'saves') return null
    const { rows, v1, v2 } = scene
    const saved = savesModel.saved(v1, v2, rows)
    if (item.level < 3) {
      if (near(value, v1.prepare - v2.prepare + (v1.sync - v2.sync) + (v1.sample - v2.sample))) {
        return { id: `${FAMILY}.one-row`, message: rich('That counts the prepare and the sample once. A step has a row for each request, and each row pays for them.') }
      }
      if (near(value, rows * (v1.prepare - v2.prepare) + rows * (v1.sample - v2.sample))) {
        return { id: `${FAMILY}.sync-forgotten`, message: rich('That leaves the sync out. MRV2 shortens it too, and it is paid once for the step.') }
      }
      if (near(value, cpuOn(v2, rows, 0))) return { id: `${FAMILY}.mrv2-cost`, message: rich('That is what the three phases cost on MRV2. The question asks what MRV2 takes off, which is the difference with V1.') }
      return null
    }
    const idle1 = savesModel.idleOn(cpuOn(v1, rows, scene.shared), scene.forward)
    const idle2 = savesModel.idleOn(cpuOn(v2, rows, scene.shared), scene.forward)
    if (near(value, saved) && saved !== idle1 - idle2) {
      return { id: `${FAMILY}.saving-as-idle`, message: rich('That is what MRV2 takes off the CPU\'s work. With async scheduling on, the forward hides part of the work, so the GPU\'s idle time shrinks by less.') }
    }
    if (near(value, idle1)) return { id: `${FAMILY}.idle-of-v1`, message: rich('That is the GPU\'s idle time on V1. The question asks how much less it is on MRV2.') }
    if (value === 0 && idle1 - idle2 > 0) return { id: `${FAMILY}.all-hidden`, message: rich('Zero would be right if the forward hid all of the legacy runner\'s work. Here it does not, so MRV2\'s saving shows.') }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const runnerFallback: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The V2 runner, and when it falls back',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, 'scene'), level)
  },
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution: (item) => solutionOf(item),
}
