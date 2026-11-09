/**
 * `tr6.which-runner`: what each speculative method needs, and which model runner a configuration runs on at the pin (TR6; KC
 * `tr6.proposer-families`). It is TR6's Keep family for proposers (curriculum TR6 §4). Every fact in it is a claim about vLLM v0.33.0, and
 * a re-pin that moves one raises a change card for this family:
 *
 *   needs    each method drafts from something, and that something has to exist. n-gram matches the prompt and what has been generated so far
 *            (claim vllm.spec.ngram-prompt-lookup). Suffix decoding matches the prompt and earlier generations by frequency counts, and
 *            needs the Arctic Inference package (claims vllm.spec.suffix-differs, vllm.spec.suffix-needs-arctic). A draft model is a
 *            separate model (claim vllm.spec.draft-model-separate). EAGLE-3 is a small head trained on the target's features
 *            (claims spec.paper.eagle3-fusion, vllm.spec.model-key-optional). MTP needs a target that includes native multi-token
 *            prediction (claims vllm.spec.mtp-native, vllm.spec.mtp-families).
 *   runner   MRV2 is the default runner. Five things send a configuration back to MRV1, and three of them are about speculation: the
 *            methods `suffix` and `custom_class`, parallel drafting for anything but DFlash and DSpark, and draft models with their own
 *            vocabulary (claim vllm.mrv2.fallback-reasons). Async scheduling is on by default, and on MRV1 it works only with the EAGLE
 *            family, n-gram on the GPU, a draft model, DSpark and DFlash: asked for with another method it raises an error, and left to its
 *            default it turns itself off with one warning (claim vllm.async-scheduling.mrv1-limits).
 *
 * The runner rule is held to the sim's presets (`resolveRunner`, `asyncSupported`) in tests/play/items-tr6-which-runner.test.ts. Each variant
 * is drawn answer first over five outcomes, so a habit of choosing one passes one seed in five.
 */
import { below } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice } from '../../grade'
import { code, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, oneOf, shown, workedPart } from './kit'

const FAMILY = 'tr6.which-runner'
const VERSION = 1
const KC = 'tr6.proposer-families'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'needs', title: 'What a method drafts from', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'choose', title: 'The method for what the team has', kcs: [KC], levels: [1, 2, 3] },
  { id: 'runner', title: 'The runner a configuration runs on', kcs: [KC], levels: [0, 1, 2, 3] },
]

type VariantId = 'needs' | 'choose' | 'runner'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* needs, and choose                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The five methods the first two variants are about. */
export const METHODS = ['ngram', 'suffix', 'draft_model', 'eagle3', 'mtp'] as const
export type Method = (typeof METHODS)[number]
const isMethod = (value: unknown): value is Method => typeof value === 'string' && (METHODS as readonly string[]).includes(value)

/** What a method drafts from, and what must exist for it: the options of `needs`. They are of about one length. */
const NEEDS_TEXT: Readonly<Record<Method, Rich>> = {
  ngram: rich('The prompt and the tokens so far, matched as n-grams; nothing else'),
  suffix: rich('The prompt and earlier outputs, matched by frequency; the Arctic Inference package'),
  draft_model: rich('A separate, smaller model that runs its own forward passes'),
  eagle3: rich('A small head, trained for this target, that reads its hidden states'),
  mtp: rich('The target\'s own multi-token prediction module, from its training'),
}

/** The sentence that says why a method needs what it needs, with the facts it rests on. */
const NEEDS_WHY: Readonly<Record<Method, Rich>> = {
  ngram: rich('The n-gram method proposes draft tokens by matching n-grams in the prompt, and its configuration needs no model.'),
  suffix: rich('Suffix decoding matches the prompt and the earlier generations, proposes the likeliest continuation from frequency counts, and needs the Arctic Inference package installed. It needs no draft model.'),
  draft_model: rich('The draft-model method is the one that needs a separate draft model: a smaller model whose own forward passes propose the tokens.'),
  eagle3: rich('EAGLE-3 drafts with a small head that fuses the target\'s features from several layers, so it has to be trained for the target and is given as a checkpoint.'),
  mtp: rich('MTP works for a target model that includes native multi-token prediction, and only for the families that support it in vLLM. It needs no separate draft model.'),
}

/** The scenes of `choose`: what a team has, and which method that leaves. Two phrasings each. */
const SCENES: Readonly<Record<Method, readonly Rich[]>> = {
  ngram: [
    rich('The team has no second model and no multi-token prediction in its target, it installs no packages beyond vLLM, and its requests quote long passages from their own prompts.'),
    rich('The image has vLLM and nothing else, the target was not trained with multi-token prediction, and answers copy phrases out of the prompt.'),
  ],
  suffix: [
    rich('The team has no second model, the target has no multi-token prediction, the Arctic Inference package is installed, and its agent loops repeat what they generated in earlier turns.'),
    rich('There is no draft checkpoint to be had, and the traffic is code editing and self-reflection, where outputs repeat earlier outputs. The Arctic Inference package is installed.'),
  ],
  draft_model: [
    rich('The team has a smaller model of the same family as the target, no EAGLE head, and a target without multi-token prediction.'),
    rich('A smaller sibling of the target exists as a checkpoint. Nothing has been trained on the target\'s hidden states, and the target has no multi-token prediction.'),
  ],
  eagle3: [
    rich('The team has an EAGLE-3 head that was trained for exactly this target.'),
    rich('A speculator checkpoint trained on this target\'s hidden states is available, and the team wants the model-based method it was built for.'),
  ],
  mtp: [
    rich('The target model was trained with native multi-token prediction, and the team has no other checkpoint.'),
    rich('The target ships its own multi-token prediction module, and no draft model or head has been prepared.'),
  ],
}

const methodOption = (method: Method): Rich => rich(code(method))

/** A method's option id: its name as a slug, which has hyphens where the name has underscores. */
const slugOf = (method: Method): string => method.replace(/_/g, '-')

/* ------------------------------------------------------------------------------------------------------------------ */
/* runner                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What the configuration ends up as: which runner, and whether async scheduling runs. */
export type Outcome = 'mrv2' | 'mrv2-off' | 'v1-on' | 'v1-off' | 'refused'
const OUTCOMES: readonly Outcome[] = ['mrv2', 'mrv2-off', 'v1-on', 'v1-off', 'refused']

export type AsyncFlag = 'unset' | 'on' | 'off'

export interface Config {
  readonly method: string
  readonly parallelDrafting: boolean
  readonly heterogeneousVocab: boolean
  readonly async: AsyncFlag
}

/** Whether MRV2 hands the configuration back to MRV1 (claim vllm.mrv2.fallback-reasons). */
export function fallsBack(c: Config): boolean {
  return c.method === 'suffix' || c.method === 'custom_class' || (c.parallelDrafting && c.method !== 'dflash' && c.method !== 'dspark') || c.heterogeneousVocab
}

/** The methods that async scheduling works with on MRV1: the EAGLE family (MTP and DFlash among it), n-gram on the GPU, a draft model, DSpark (claim vllm.async-scheduling.mrv1-limits). */
export const MRV1_ASYNC = ['eagle', 'eagle3', 'extract_hidden_states', 'mtp', 'dflash', 'ngram_gpu', 'draft_model', 'dspark'] as const

export function outcomeOf(c: Config): Outcome {
  const onV1 = fallsBack(c)
  if (c.async === 'off') return onV1 ? 'v1-off' : 'mrv2-off'
  if (!onV1) return 'mrv2'
  const supported = (MRV1_ASYNC as readonly string[]).includes(c.method)
  if (supported) return 'v1-on'
  return c.async === 'on' ? 'refused' : 'v1-off'
}

const RUNNER_TEXT: Readonly<Record<Outcome, Rich>> = {
  mrv2: rich('MRV2, with async scheduling on'),
  'mrv2-off': rich('MRV2, with async scheduling off'),
  'v1-on': rich('MRV1, with async scheduling on'),
  'v1-off': rich('MRV1, with async scheduling off'),
  refused: rich('Neither: the engine refuses to start'),
}

function drawConfig(outcome: Outcome, level: Level, seed: number, purpose: string): Config {
  const rng = itemRng(FAMILY, 'runner', level, seed, purpose)
  const plain = ['ngram', 'ngram_gpu', 'draft_model', 'eagle3', 'mtp'] as const
  const back = [
    { method: 'draft_model', parallelDrafting: false, heterogeneousVocab: true },
    { method: 'eagle3', parallelDrafting: true, heterogeneousVocab: false },
    { method: 'draft_model', parallelDrafting: true, heterogeneousVocab: false },
  ] as const
  switch (outcome) {
    case 'mrv2':
      return { method: oneOf(rng, plain), parallelDrafting: false, heterogeneousVocab: false, async: oneOf(rng, ['unset', 'on'] as const) }
    case 'mrv2-off':
      return { method: oneOf(rng, plain), parallelDrafting: false, heterogeneousVocab: false, async: 'off' }
    case 'v1-on':
      return { ...oneOf(rng, back), async: oneOf(rng, ['unset', 'on'] as const) }
    case 'v1-off':
      // Either a method async cannot run with on MRV1, left to its default, or any configuration that goes to MRV1 with async scheduling asked off.
      return below(rng, 3) === 0
        ? { ...oneOf(rng, back), async: 'off' }
        : { method: oneOf(rng, ['suffix', 'custom_class'] as const), parallelDrafting: false, heterogeneousVocab: false, async: 'unset' }
    case 'refused':
      return { method: oneOf(rng, ['suffix', 'custom_class'] as const), parallelDrafting: false, heterogeneousVocab: false, async: 'on' }
  }
}

function configGivens(c: Config): Given[] {
  return [
    { label: 'speculative method', value: code(c.method) },
    { label: 'parallel drafting', value: text(c.parallelDrafting ? 'on' : 'off') },
    { label: 'draft model has its own vocabulary', value: text(c.heterogeneousVocab ? 'yes' : 'no') },
    { label: 'async scheduling', value: text(c.async === 'unset' ? 'left to its default' : c.async === 'on' ? 'asked for' : 'switched off') },
  ]
}

function runnerSteps(c: Config): Step[] {
  const onV1 = fallsBack(c)
  const first: Step = onV1
    ? {
        text:
          c.method === 'suffix' || c.method === 'custom_class'
            ? rich(code(c.method), ' is one of the two speculative methods that MRV2 does not take at the pin, so the engine falls back to MRV1.')
            : c.heterogeneousVocab
              ? rich('A draft model with its own vocabulary is not supported by MRV2 at the pin, so the engine falls back to MRV1.')
              : rich('Parallel drafting is not supported by MRV2 for EAGLE or a draft model at the pin, so the engine falls back to MRV1.'),
      }
    : { text: rich(code(c.method), ' with these settings is something MRV2 takes, so the engine uses its default runner.') }
  const second: Step =
    c.async === 'off'
      ? { text: rich('Async scheduling is switched off, so the runner runs without it.') }
      : !onV1
        ? { text: rich('MRV2 runs async scheduling with every method it takes, so it is on.') }
        : (MRV1_ASYNC as readonly string[]).includes(c.method)
          ? { text: rich('On MRV1, async scheduling works with the EAGLE family, n-gram on the GPU, a draft model, DSpark and DFlash, and ', code(c.method), ' is among them, so it stays on.') }
          : c.async === 'on'
            ? { text: rich('On MRV1, async scheduling does not work with ', code(c.method), '. It was asked for, so the engine raises an error and does not start.') }
            : { text: rich('On MRV1, async scheduling does not work with ', code(c.method), '. It was left to its default, so the engine turns it off with one warning.') }
  return [first, second]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function methodOptions(variant: 'needs' | 'choose', method: Method, level: Level, seed: number): ChoiceOption[] {
  const lure = (id: Method): { why: Rich; miss: string } => ({ why: variant === 'needs' ? NEEDS_WHY[id] : rich('The team\'s resources do not fit ', code(id), '. ', ...NEEDS_WHY[id]), miss: `${FAMILY}.${slugOf(id)}-taken-for` })
  return shown(
    FAMILY,
    variant,
    level,
    seed,
    METHODS.map((id): ChoiceOption => ({ id: slugOf(id), text: variant === 'needs' ? NEEDS_TEXT[id] : methodOption(id), ...(id === method ? { why: NEEDS_WHY[id] } : lure(id)) })),
  )
}

function runnerOptions(config: Config, level: Level, seed: number): ChoiceOption[] {
  const truth = outcomeOf(config)
  const steps = runnerSteps(config)
  const lureWhy = (id: Outcome): Rich => {
    switch (id) {
      case 'mrv2':
        return fallsBack(config) ? rich('MRV2 does not take this configuration at the pin, so the engine uses MRV1.') : rich('Async scheduling is switched off in this configuration, so it does not run.')
      case 'mrv2-off':
        return fallsBack(config) ? rich('MRV2 does not take this configuration at the pin, so the engine uses MRV1.') : rich('Async scheduling is not switched off here, and MRV2 runs it with every method it takes.')
      case 'v1-on':
        return fallsBack(config) ? rich('Async scheduling does not run on MRV1 with this method, or it was switched off.') : rich('MRV2 takes this configuration, so the engine does not fall back.')
      case 'v1-off':
        return fallsBack(config) ? rich('Async scheduling stays on, or the engine refuses, rather than turning off in this case.') : rich('MRV2 takes this configuration, so the engine does not fall back.')
      case 'refused':
        return config.async === 'on' && fallsBack(config) ? rich('MRV1 runs async scheduling with this method, so the request for it is honoured and the engine starts.') : rich('Nothing here is asked for that the engine cannot run, so it starts.')
    }
  }
  return shown(
    FAMILY,
    'runner',
    level,
    seed,
    OUTCOMES.map((id): ChoiceOption => ({ id, text: RUNNER_TEXT[id], why: id === truth ? steps[steps.length - 1].text : lureWhy(id), ...(id === truth ? {} : { miss: `${FAMILY}.${id}-taken-for` }) })),
  )
}

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const gen = { id: FAMILY, version: VERSION }
  const variant = spec.id as VariantId
  const base = { variant: spec.id, level, seed, kcs: spec.kcs }

  if (variant === 'runner') {
    const outcome = OUTCOMES[drawOutcome(FAMILY, 'runner', level, seed, OUTCOMES.length)]
    const config = drawConfig(outcome, level, seed, 'scene')
    return finishItem(gen, {
      ...base,
      params: { method: config.method, parallel: config.parallelDrafting, vocab: config.heterogeneousVocab, async: config.async },
      stem: rich('Triton is installed and no other unsupported feature is set. A team starts vLLM v0.33.0 with the speculative configuration below. Which model runner runs it, and what does async scheduling do?'),
      givens: configGivens(config),
      worked: workedPart(level, runnerSteps(config), (attempt) => {
        const example = drawConfig(OUTCOMES[(OUTCOMES.indexOf(outcome) + 1 + attempt) % OUTCOMES.length], level, seed, `example-${attempt}`)
        return runnerSteps(example)
      }),
      answer: { kind: 'choice', label: 'the runner and async scheduling', options: runnerOptions(config, level, seed), correct: outcome },
    })
  }

  const method = METHODS[drawOutcome(FAMILY, variant, level, seed, METHODS.length)]
  const stemRng = itemRng(FAMILY, variant, level, seed, 'stem')
  const scene = variant === 'choose' ? oneOf(stemRng, SCENES[method]) : null
  return finishItem(gen, {
    ...base,
    params: { method, phrasing: scene === null ? 0 : SCENES[method].indexOf(scene) },
    stem:
      variant === 'needs'
        ? rich('At vLLM v0.33.0, the speculative method ', code(method), ' proposes the draft tokens. What does it draft from, and what has to exist for it to run?')
        : rich(...(scene ?? []), ' Which method does the team turn on?'),
    givens: [],
    worked: workedPart(level, [{ text: NEEDS_WHY[method] }], (attempt) => [{ text: NEEDS_WHY[METHODS[(METHODS.indexOf(method) + 1 + attempt) % METHODS.length]] }]),
    answer: { kind: 'choice', label: variant === 'needs' ? 'what it needs' : 'the method', options: methodOptions(variant, method, level, seed), correct: slugOf(method) },
  })
}

function solutionOf(item: Pick<Item, 'variant' | 'params'>): Step[] {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  if (item.variant === 'runner') {
    const { method, parallel, vocab, async } = item.params
    if (typeof method !== 'string' || typeof parallel !== 'boolean' || typeof vocab !== 'boolean' || (async !== 'unset' && async !== 'on' && async !== 'off')) {
      throw new TypeError(`${FAMILY}: the params of runner are not a configuration`)
    }
    return runnerSteps({ method, parallelDrafting: parallel, heterogeneousVocab: vocab, async })
  }
  const method = item.params['method']
  if (!isMethod(method)) throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a method`)
  return [{ text: NEEDS_WHY[method] }]
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const whichRunner: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Proposers, and the runner they run on',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the answer is drawn first and the scene follows from it.
  band: () => true,
  grade: (item, response) => gradeChoice(item, response),
  solution: (item) => solutionOf(item),
}
