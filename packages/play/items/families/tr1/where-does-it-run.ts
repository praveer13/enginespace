/**
 * `tr1.where-does-it-run`: in which process, and on which thread or stream, a stage of a real engine's request path runs (TR1; KCs
 * `tr1.sglang-lifecycle`, `tr1.vllm-lifecycle` and `tr1.abort-path`). It is the exit item of TR1's third lesson, the main item of its sixth
 * and one item of its seventh: a ticket names a stage of an engine's path, and the learner says where the request is when the stage is
 * done, among five places of that engine (W1-report §5).
 *
 * The stage and its place are the lifecycle model's (packages/sim/lifecycle, W1-T16), and every stage there cites its file, symbol, line
 * and quote at the commit its engine is pinned to, so the key is derived from the sim and rests on the pinned source. A stage starts where
 * the one before it ended (rule 1 of the first lesson), so a stage that does its work in place runs where the last one left the request, and
 * a stage that moves the request leaves it where the stage ends. The questions leave out two kinds of stage that would have no single
 * answer: a stage that ends at the client, which is not part of the engine, and a stage that only a two-rank path has, which every rank runs.
 *
 * What the variants ask:
 *   sglang   a stage of Mini-SGLang's or SGLang's path (KC tr1.sglang-lifecycle);
 *   vllm     a stage of vLLM's path at the pin, or at the post's commit (KC tr1.vllm-lifecycle);
 *   abort    a stage of the path of an abort, in any of the four engines that have one (KC tr1.abort-path).
 * The place is drawn first, among the places of the engine that a stage ends in, and the stage follows from it, so the answer is not the
 * place that most stages share. An option's id is a letter drawn by the seed, since the same few places answer most questions. At level 0 a
 * worked example with another stage comes first, at level 1 the first step of the solution is shown, at level 2 the learner is alone with
 * the stage, and at level 3 the stage is shown as the line of the engine's own source in place of its label.
 */
import { pick, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import type { EngineId, Mechanism, Place } from '@es/sim/lifecycle/types'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice } from '../../grade'
import { code, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { shown, workedPart } from './kit'
import { conditionOf, engineWords, entryOf, GROUP_ENGINES, isAbort, labelRich, placeKey, placeText, poolOf, ranksOf, sharesLine, sourceRich } from './lifecycle-kit'
import type { Entry } from './lifecycle-kit'

const FAMILY = 'tr1.where-does-it-run'
const VERSION = 1

type VariantId = 'sglang' | 'vllm' | 'abort'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'sglang', title: "Where a stage of Mini-SGLang's or SGLang's path runs", kcs: ['tr1.sglang-lifecycle'], levels: [0, 1, 2, 3] },
  { id: 'vllm', title: "Where a stage of vLLM's path runs", kcs: ['tr1.vllm-lifecycle'], levels: [0, 1, 2, 3] },
  { id: 'abort', title: "Where a stage of an abort's path runs", kcs: ['tr1.abort-path'], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** The engines each variant draws from. The path of an abort exists in every engine but nano-vllm. */
const ENGINES_OF: Readonly<Record<VariantId, readonly EngineId[]>> = {
  sglang: GROUP_ENGINES.sglang,
  vllm: GROUP_ENGINES.vllm,
  abort: ['mini-sglang', 'inside-vllm', 'vllm', 'sglang'],
}

/** The options of a ticket: the answer and four other places of the engine. */
const OPTIONS = 5
const LETTERS = ['a', 'b', 'c', 'd', 'e'] as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The stages and the places                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The stages a question can be asked of: those of one rank that end in the engine, and belong to an abort's path if the variant says so. */
function candidates(engine: EngineId, variant: VariantId): Entry[] {
  return poolOf(engine).filter((entry) => ranksOf(entry) === 1 && entry.stage.to.process !== 'client' && isAbort(entry) === (variant === 'abort'))
}

/** The places of one engine's single-rank paths where the engine works: every place a stage starts or ends in but the client's. */
function placesOf(engine: EngineId): Place[] {
  const seen = new Map<string, Place>()
  for (const entry of poolOf(engine)) {
    if (ranksOf(entry) !== 1) continue
    for (const place of [entry.stage.from, entry.stage.to]) if (place.process !== 'client' && !seen.has(placeKey(place))) seen.set(placeKey(place), place)
  }
  return [...seen.values()]
}

/** A stage by drawing a place first: an engine of the variant, then a place where one of its candidate stages ends, then one of the stages that end there. */
function chooseEntry(variant: VariantId, rng: Rng, not?: string): Entry {
  const engine = pick(rng, ENGINES_OF[variant])
  const entries = candidates(engine, variant).filter((entry) => entry.stage.id !== not)
  const places = [...new Map(entries.map((entry) => [placeKey(entry.stage.to), entry.stage.to])).values()]
  const place = pick(rng, places)
  return pick(
    rng,
    entries.filter((entry) => placeKey(entry.stage.to) === placeKey(place)),
  )
}

const movesOf = (entry: Entry): boolean => placeKey(entry.stage.from) !== placeKey(entry.stage.to)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A place as an option reads: the process and its thread, or the GPU of the process that owns the stream. */
const placeRich = (place: Place): Rich => (place.device === 'gpu' ? rich('the GPU of ', code(place.process)) : rich(code(place.process), ' process, ', code(place.thread)))

/** How the relation between a wrong place and the right one is named, which is what a wrong pick says about the learner. */
function missOf(picked: Place, truth: Place): string {
  if (picked.device === 'gpu' && truth.device === 'host') return `${FAMILY}.gpu-for-host`
  if (picked.device === 'host' && truth.device === 'gpu') return `${FAMILY}.host-for-gpu`
  return picked.process === truth.process ? `${FAMILY}.right-process-wrong-thread` : `${FAMILY}.wrong-process`
}

/** How a stage that moves the request carries it, in the words of the first lesson. */
const CARRIES: Readonly<Record<Mechanism, string>> = {
  call: 'by a call',
  launch: 'by a launch',
  collective: 'by a collective',
  queue: 'through a queue',
  ipc: 'over a socket',
  shm: 'through shared memory',
  h2d: 'by a copy down to the GPU',
  d2h: 'by a copy up to the host',
  sync: 'by a wait',
}

/** Why the right place is right: where the stage before it left the request, and what this stage does from there. */
function whyRight(entry: Entry): Rich {
  const { stage, prev } = entry
  const place = placeText(stage.to)
  if (movesOf(entry)) {
    return rich('The stage carries the request ', CARRIES[stage.mechanism], ' from ', code(placeText(stage.from)), ' into ', code(place), ', so that is where it is once the stage is done.')
  }
  if (prev === null) return rich('The stage does its work in ', code(place), ', where the request already is.')
  return rich('The stage before it, ', ...labelRich(prev.label), ', ends in ', code(place), ', and a stage starts where the last one ended, so this one does its work there.')
}

/** Why a wrong place is wrong: what the path does in it instead, from the model's own stages. */
function whyNot(entry: Entry, picked: Place): Rich {
  const { stage } = entry
  const where = placeText(picked)
  if (placeKey(picked) === placeKey(stage.from) && movesOf(entry)) {
    return rich('The request starts the stage in ', code(where), ' and leaves it, so it is no longer there when the stage is done.')
  }
  const other = poolOf(entry.engine).find((candidate) => ranksOf(candidate) === 1 && candidate.stage.id !== stage.id && placeKey(candidate.stage.to) === placeKey(picked) && !movesOf(candidate))
  if (other !== undefined) return rich(code(where), ' is where the engine does the work of another stage, ', ...labelRich(other.stage.label), ', and not this one.')
  const arrival = poolOf(entry.engine).find((candidate) => ranksOf(candidate) === 1 && candidate.stage.id !== stage.id && placeKey(candidate.stage.to) === placeKey(picked))
  if (arrival !== undefined) return rich(code(where), ' is where the request arrives in another stage, ', ...labelRich(arrival.stage.label), ', and not in this one.')
  return rich('The request is never in ', code(where), ' at this point of the path.')
}

/** The steps of a solution, ending in the place. */
function stepsOf(entry: Entry): Step[] {
  const { stage } = entry
  const first = movesOf(entry)
    ? rich('Take the stage ', ...labelRich(stage.label), '. It moves the request on, so the answer is where the request arrives, and not where it starts.')
    : rich(
        'Take the stage ',
        ...labelRich(stage.label),
        '. It does its work where the request already is',
        ...(entry.prev === null ? rich('.') : rich(', which is where the stage before it, ', ...labelRich(entry.prev.label), ', left it.')),
      )
  return [{ text: first }, { text: rich(...whyRight(entry), ' So the answer is ', ...placeRich(stage.to), '.') }, { text: sourceRich(entry) }]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

type Surface = 'label' | 'code'

/** Level 3 shows the line of the engine's source, unless two stages cite that line: it would not say which one is meant. */
const surfaceFor = (level: Level, entry: Entry): Surface => (level === 3 && !sharesLine(entry) ? 'code' : 'label')

function build(spec: VariantSpec, level: Level, seed: Seed): Item {
  if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
  const variant = spec.id
  const entry = chooseEntry(variant, itemRng(FAMILY, variant, level, seed, 'stage'))
  const { stage } = entry
  const surface = surfaceFor(level, entry)
  const moves = movesOf(entry)
  const condition = conditionOf(entry)
  const givens: Given[] = condition === null || variant === 'abort' ? [] : [{ label: 'the request', value: text(condition) }]

  const intro = variant === 'abort' ? 'A client leaves in the middle of a streamed answer, and the engine takes its request back. Here is one stage of the path of that abort through ' : 'Here is one stage of a request\'s path through '
  const ask = moves
    ? 'In which process, and on which thread or stream, is the request once this stage is done?'
    : 'In which process, and on which thread or stream, does the engine do the work of this stage?'
  const stem: Rich =
    surface === 'label'
      ? rich(intro, ...engineWords(entry.engine), ': ', ...labelRich(stage.label), `. ${ask}`)
      : rich(intro, ...engineWords(entry.engine), ': the line ', code(stage.source.quote), ' of ', code(stage.source.path), `. ${ask}`)

  // The answer and four other places of the engine, each with a letter for an id that the seed draws, so no place is the key more than its share.
  // The places of an abort's own path come first among the others: they are the ones that a learner who has not read the path takes for it.
  const others = placesOf(entry.engine).filter((place) => placeKey(place) !== placeKey(stage.to))
  const onPath = new Set(candidates(entry.engine, variant).flatMap((candidate) => [placeKey(candidate.stage.from), placeKey(candidate.stage.to)]))
  const ordered = shuffle(
    itemRng(FAMILY, variant, level, seed, 'others'),
    variant === 'abort' ? others.filter((place) => onPath.has(placeKey(place))) : others,
  )
  const wrong = [...ordered, ...(variant === 'abort' ? shuffle(itemRng(FAMILY, variant, level, seed, 'fill'), others.filter((place) => !onPath.has(placeKey(place)))) : [])].slice(0, OPTIONS - 1)
  if (wrong.length < OPTIONS - 1) throw new RangeError(`${FAMILY}: ${entry.engine} has too few places for ${OPTIONS} options`)
  const letters = shuffle(itemRng(FAMILY, variant, level, seed, 'letters'), LETTERS)
  const places = [stage.to, ...wrong]
  const options = shown(
    FAMILY,
    variant,
    level,
    seed,
    places.map(
      (place, at): ChoiceOption => ({
        id: letters[at],
        text: placeRich(place),
        why: at === 0 ? whyRight(entry) : whyNot(entry, place),
        ...(at === 0 ? {} : { miss: missOf(place, stage.to) }),
      }),
    ),
    'order',
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
      worked: workedPart(level, stepsOf(entry), (attempt) => {
        const example = chooseEntry(variant, itemRng(FAMILY, variant, level, seed, `example-${attempt}`), stage.id)
        return placeKey(example.stage.to) === placeKey(stage.to) ? null : stepsOf(example)
      }),
      answer: { kind: 'choice', label: 'where it runs', options, correct: letters[0] },
      params: { engine: entry.engine, stage: stage.id, ranks: ranksOf(entry), surface, moves },
    },
  )
}

/** The entry that an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Entry {
  const { engine, stage, ranks } = item.params
  const entry = typeof engine === 'string' && typeof stage === 'string' && (ranks === 1 || ranks === 2) ? entryOf(engine as EngineId, stage, ranks) : undefined
  if (!isVariant(item.variant) || entry === undefined) throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a stage of the model`)
  return entry
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const whereDoesItRun: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Where a stage runs',
  kcs: ['tr1.sglang-lifecycle', 'tr1.vllm-lifecycle', 'tr1.abort-path'],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the place is drawn first, and the stage follows from it.
  band: () => true,
  grade: (item, response) => gradeChoice(item, response),
  solution: (item) => stepsOf(sceneOf(item)),
}
