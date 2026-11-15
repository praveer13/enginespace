/**
 * `tr2.dispatch-key`: which CUDA graph replays a step, and which fields of the key choose it (TR2, lesson 6; KC `tr2.dispatch-keys`: say which fields
 * of a batch's descriptor choose the CUDA graph that replays it, in the pinned runner and in the legacy one, and what runs when none matches). It is
 * the exit item of lesson 6 that gives "a batch and a configuration and asks which graph replays".
 *
 * At vLLM v0.33.0 (the course's pin) MRV2, the default runner, dispatches on a seven-field `BatchExecutionDescriptor` (`cg_mode`, `num_tokens`,
 * `num_reqs`, `uniform_token_count`, `max_query_len`, `num_active_loras`, `num_ubatches`), and MRV1, the legacy runner, on a five-field
 * `BatchDescriptor` (`num_tokens`, `num_reqs`, `uniform`, `has_lora`, `num_active_loras`) (claims vllm.cudagraph.mrv2-key, vllm.cudagraph.mrv1-key,
 * vllm.cudagraph.design-doc-key). The rules are the sim's, which it keeps as data from the claims (packages/sim/steploop/graphs.ts, D-041):
 *   MRV2   captures, at start-up, for each size, a FULL decode descriptor if the mode has a decode routine of its own, and a descriptor of the mixed routine;
 *          a decode descriptor is skipped for a size above the rail. A batch takes, for each mode, the descriptors with the smallest captured size at or above
 *          its tokens, the FULL ones before the PIECEWISE ones, and the first that fits it: its uniform token count is unset or the batch's, its request count
 *          is unset or at least the batch's, its token count at least the batch's. Otherwise the step runs eagerly (claims vllm.cudagraph.mrv2-candidates,
 *          vllm.cudagraph.mrv2-decode-descs, vllm.cudagraph.mrv2-mixed-descs, vllm.cudagraph.mrv2-compatible, vllm.cudagraph.mrv2-dispatch);
 *   MRV1   pads the batch to the smallest captured size and looks for a FULL key with the exact request count, then for a PIECEWISE key with the request
 *          count relaxed, and otherwise runs eagerly (claims vllm.cudagraph.mrv1-padding-map, vllm.cudagraph.mrv1-dispatch).
 * A batch is a uniform decode when every request has the same query length and none is still prefilling (claims vllm.cudagraph.mrv2-uniform-count,
 * vllm.cudagraph.mrv2-prefill-query-len, vllm.cudagraph.mrv1-uniform-decode). The modes' routines are the sim's `GRAPH_MODES` (claim vllm.cudagraph.mode-routines).
 *
 * The keys of `which-graph` and `captured` are this port's, and no more: tests/sim/graphs.test.ts and tests/play/items-dispatch-key.test.ts hold it to a
 * second, independent port of the same code (tests/sim/graphs-oracle.ts) on thousands of cases, but its agreement with vLLM's own answers waits for the owner's
 * tables (Q-10; `DISPATCH_TABLES.status` is `waiting`), which Service's `keys` level waits for too. So the variants that those tables would have to vouch for
 * are left out: no scene has an adapter, so none dispatches on `num_active_loras` or `has_lora`, and no scene speculates, so none dispatches on a decode query
 * length above 1. The two runners agree on every batch of these scenes, as the lesson's table shows; they differ in the keys they hold.
 *
 * What the variants ask:
 *   which-graph  which graph a step replays: a FULL graph, a PIECEWISE graph, or none, drawn answer first over the three, from a mode, a rail, the sizes vLLM
 *                captures for it and a batch of decode rows with or without a prompt chunk (levels 0 to 3; at level 3 the runner is the legacy one, and the
 *                batch is given as requests);
 *   captured     how many graphs MRV2 captures at start-up for a mode and a list of sizes the user wrote: a graph for each size of the mixed routine, and a
 *                decode graph for each size up to the rail (levels 0 to 3; at level 3 the runner is the legacy one, which captures as many);
 *   fields       which field of the key does a job, one of the seven, drawn answer first; at level 3 which field one runner's key has and the other's does not
 *                (levels 0 to 3).
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown, at level 2 the learner is alone, and level 3
 * changes the surface as above.
 */
import { below, between, pick, shuffle, weighted } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { batchShape, capturedGraphs, dispatcherFor, GRAPH_MODES, makeGraphConfig, vllmCaptureSizes } from '@es/sim/steploop/graphs'
import type { BatchRow } from '@es/sim/steploop/graphs'
import type { GraphModeId } from '@es/sim/steploop/types'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, rich, text } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, Params, Rich, Step, VariantSpec } from '../../types'
import { derived, drawOutcome, EXACT, given, shown, workedPart } from './kit'

const FAMILY = 'tr2.dispatch-key'
const VERSION = 1
const KC = 'tr2.dispatch-keys'

type VariantId = 'which-graph' | 'captured' | 'fields'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-graph', title: 'Which graph replays a step', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'captured', title: 'The graphs captured at start-up', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'fields', title: 'The fields of the key', kcs: [KC], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model: the sim's dispatchers on a rail, a mode and a batch                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Runner = 'mrv2' | 'v1'
export type Kind = 'full' | 'piecewise' | 'eager'

const KINDS: readonly Kind[] = ['full', 'piecewise', 'eager']
const RAILS: readonly number[] = [8, 12, 16, 20, 24, 32, 40, 48, 64]

/** The sizes vLLM captures for a rail when the user lists none: `max_num_seqs` of `rail`, and the budget of a server. */
export const sizesFor = (rail: number): number[] => vllmCaptureSizes({ maxNumSeqs: rail, maxBatchedTokens: 2048 })

/** What a step is: decode rows of one token each, and a prompt chunk of `chunk` tokens when a request is still prefilling. */
export interface Batch {
  readonly decoding: number
  readonly chunk: number
}

export const tokensOf = (batch: Batch): number => batch.decoding + batch.chunk
export const rowsOf = (batch: Batch): number => batch.decoding + (batch.chunk > 0 ? 1 : 0)

/** What the dispatcher of `runner` makes of a batch under a mode, a rail and a list of captured sizes. */
export function dispatchBatch(runner: Runner, mode: GraphModeId, rail: number, sizes: readonly number[], batch: Batch): { mode: 'FULL' | 'PIECEWISE' | 'NONE'; padded: number } {
  const g = makeGraphConfig({ mode, captureSizes: sizes, maxNumSeqs: rail })
  const rows: BatchRow[] = Array.from({ length: batch.decoding }, () => ({ chunk: 1, prefill: false, done: 8 }))
  if (batch.chunk > 0) rows.push({ chunk: batch.chunk, prefill: true, done: 0 })
  return dispatcherFor(runner, g).dispatch(batchShape(rows, 1), 0)
}

export const kindOf = (mode: 'FULL' | 'PIECEWISE' | 'NONE'): Kind => (mode === 'FULL' ? 'full' : mode === 'PIECEWISE' ? 'piecewise' : 'eager')

/** The graphs a runner captures for a configuration, counted: the sim's `capturedGraphs`. */
export const capturedCount = (runner: Runner, mode: GraphModeId, rail: number, sizes: readonly number[]): number => capturedGraphs(makeGraphConfig({ mode, captureSizes: sizes, maxNumSeqs: rail }), runner).length

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface WhichScene {
  readonly variant: 'which-graph'
  readonly runner: Runner
  readonly mode: GraphModeId
  readonly rail: number
  readonly batch: Batch
}

interface CapturedScene {
  readonly variant: 'captured'
  readonly runner: Runner
  readonly mode: GraphModeId
  readonly rail: number
  /** The list the user wrote. */
  readonly sizes: readonly number[]
}

/** The questions of `fields`: a field named by its job, or at level 3 a field that one runner's key has and the other's has not. */
export const MRV2_FIELDS = ['cg_mode', 'num_tokens', 'num_reqs', 'uniform_token_count', 'max_query_len', 'num_active_loras', 'num_ubatches'] as const
export type Field = (typeof MRV2_FIELDS)[number]
export const MRV1_FIELDS = ['num_tokens', 'num_reqs', 'uniform', 'has_lora', 'num_active_loras'] as const
const MRV2_ONLY: readonly string[] = ['cg_mode', 'uniform_token_count', 'max_query_len', 'num_ubatches']
const MRV1_ONLY: readonly string[] = ['uniform', 'has_lora']
const BOTH: readonly string[] = ['num_tokens', 'num_reqs', 'num_active_loras']
const DOC_FIELDS: readonly string[] = ['num_tokens', 'num_reqs', 'uniform', 'has_lora']

type Compare = 'mrv2-only' | 'mrv1-only' | 'doc-leaves-out'

interface FieldsScene {
  readonly variant: 'fields'
  /** Below level 3: the field named by its job and which phrasing. At level 3: the question, the key, and the three other options. */
  readonly field: string
  readonly phrase: 0 | 1
  readonly compare: Compare | ''
  readonly others: readonly string[]
}

type Scene = WhichScene | CapturedScene | FieldsScene

const slug = (name: string): string => name.replace(/_/g, '-')

/** A batch of `n` decode rows, or `n` decode rows and a prompt chunk, at most `tokens` tokens all told. */
function mixedBatch(rng: Rng, rail: number, cap: number): Batch {
  const decoding = between(rng, 1, rail - 1)
  const room = Math.max(2, cap - decoding)
  return { decoding, chunk: between(rng, 2, room) }
}

function drawWhich(level: Level, seed: Seed, purpose: string, shift = 0): WhichScene {
  const rng = itemRng(FAMILY, 'which-graph', level, seed, purpose)
  const kind = KINDS[(drawOutcome(FAMILY, 'which-graph', level, seed, KINDS.length) + shift) % KINDS.length]
  const rail = pick(rng, RAILS)
  const largest = sizesFor(rail).reduce((most, size) => Math.max(most, size), 0)
  const runner: Runner = level === 3 ? 'v1' : 'mrv2'
  const make = (mode: GraphModeId, batch: Batch): WhichScene => ({ variant: 'which-graph', runner, mode, rail, batch })
  switch (kind) {
    case 'full':
      // A decode batch in a mode with a full decode routine, and in three scenes of ten a mixed batch in mode FULL, which replays full graphs for anything.
      return below(rng, 10) < 7
        ? make(pick(rng, ['FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'FULL'] as const), { decoding: between(rng, 3, rail), chunk: 0 })
        : make('FULL', mixedBatch(rng, rail, largest))
    case 'piecewise':
      return below(rng, 10) < 6
        ? make('FULL_AND_PIECEWISE', mixedBatch(rng, rail, largest))
        : make('PIECEWISE', below(rng, 2) === 0 ? { decoding: between(rng, 3, rail), chunk: 0 } : mixedBatch(rng, rail, largest))
    case 'eager':
      // A mixed batch in a mode with no routine for it, or a batch above the largest captured size.
      if (below(rng, 2) === 0) return make('FULL_DECODE_ONLY', mixedBatch(rng, rail, largest))
      return make(pick(rng, ['FULL_AND_PIECEWISE', 'PIECEWISE', 'FULL'] as const), { decoding: between(rng, 1, rail - 1), chunk: largest + between(rng, 2, 40) })
  }
}

/** Sizes the user may list: irregular, with some above the rail and some under it. */
const SIZE_POOL: readonly number[] = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 112, 128]

function drawCaptured(level: Level, seed: Seed, purpose: string): CapturedScene {
  const rng = itemRng(FAMILY, 'captured', level, seed, purpose)
  const rail = pick(rng, RAILS)
  const mode = pick(rng, ['PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE'] as const)
  const runner: Runner = level === 3 ? 'v1' : 'mrv2'
  // The user lists the sizes to capture: a longer list at levels 2 and 3, and always some above the rail and some under it.
  const count = level < 2 ? between(rng, 6, 12) : between(rng, 8, 16)
  const chosen = new Set<number>()
  while (chosen.size < count) chosen.add(pick(rng, SIZE_POOL))
  return { variant: 'captured', runner, mode, rail, sizes: [...chosen].sort((a, b) => a - b) }
}

/** The jobs of the seven fields of MRV2's key, in two phrasings each (claims vllm.cudagraph.mrv2-key, mrv2-compatible, mrv2-mixed-descs, mrv2-prefill-query-len, mrv2-active-loras). */
const JOBS: Readonly<Record<Field, readonly [Rich, Rich]>> = {
  cg_mode: [rich('says which routine runs the step: FULL, PIECEWISE or none'), rich('is FULL for a graph that replays whole and PIECEWISE for a graph that replays in pieces')],
  num_tokens: [rich('holds the token count of the batch, padded up to a captured size'), rich('is the size that a batch is padded to, and that its graph was captured at')],
  num_reqs: [rich('holds the number of requests, which a PIECEWISE descriptor leaves unset'), rich('is the request count that a FULL graph was captured for, which must be at least the batch\'s')],
  uniform_token_count: [rich('holds the query length that every request of a uniform decode shares, and is none for a batch in which a request is still prefilling'), rich('is what makes a FULL decode graph pass over a batch that has a prompt chunk in it')],
  max_query_len: [rich('bounds the longest query of the batch, and is none for a batch in which a request is still prefilling'), rich('is the bound on the longest query, which a descriptor that sets it cannot match a prefilling batch with')],
  num_active_loras: [rich('holds the number of distinct adapters that the batch uses, rounded up to a captured case'), rich('is where an adapter shows in MRV2\'s key, which has no field called has_lora')],
  num_ubatches: [rich('holds the microbatch count of the step'), rich('is the count of microbatches, which a descriptor and a batch have to share')],
}

function drawFields(level: Level, seed: Seed, purpose: string): FieldsScene {
  const rng = itemRng(FAMILY, 'fields', level, seed, purpose)
  if (level < 3) {
    const field = MRV2_FIELDS[drawOutcome(FAMILY, 'fields', level, seed, MRV2_FIELDS.length)]
    // The key and three of the six other fields, so that no field is the key much more often than any is an option.
    const others = shuffle(
      rng,
      MRV2_FIELDS.filter((name) => name !== field),
    ).slice(0, 3)
    return { variant: 'fields', field, phrase: below(rng, 2) === 0 ? 0 : 1, compare: '', others }
  }
  // Three questions, the first likelier than the second and the second than the third, so that no field is the key much more often than another.
  const compare: Compare = (['mrv2-only', 'mrv1-only', 'doc-leaves-out'] as const)[weighted(rng, [4, 3, 2])]
  if (compare === 'mrv2-only') {
    const field = pick(rng, MRV2_ONLY)
    return { variant: 'fields', field, phrase: 0, compare, others: shuffle(rng, [...BOTH, ...MRV1_ONLY]).slice(0, 3) }
  }
  if (compare === 'mrv1-only') {
    const field = pick(rng, MRV1_ONLY)
    // The field that is spelled almost like `uniform` is always among the options, since it is the one that a learner confuses it with.
    const pool = [...BOTH, ...MRV2_ONLY.filter((name) => name !== 'uniform_token_count')]
    const rest = shuffle(rng, pool).slice(0, field === 'uniform' ? 2 : 3)
    return { variant: 'fields', field, phrase: 0, compare, others: field === 'uniform' ? ['uniform_token_count', ...rest] : rest }
  }
  // The field that is spelled almost like `uniform` is among the options here too, and it is MRV2's, so it is not a field of MRV1's key.
  return { variant: 'fields', field: 'num_active_loras', phrase: 0, compare, others: ['uniform_token_count', ...shuffle(rng, DOC_FIELDS).slice(0, 2)] }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string, shift = 0): Scene {
  return variant === 'which-graph' ? drawWhich(level, seed, purpose, shift) : variant === 'captured' ? drawCaptured(level, seed, purpose) : drawFields(level, seed, purpose)
}

/** Whether the scene is the question it was drawn for: the dispatcher gives the kind of graph that the draw meant. */
function isFair(scene: Scene): boolean {
  if (scene.variant === 'which-graph') {
    const tokens = tokensOf(scene.batch)
    return tokens >= 3 && rowsOf(scene.batch) <= scene.rail
  }
  if (scene.variant === 'captured') {
    const atMost = scene.sizes.filter((size) => size <= scene.rail).length
    // The rail matters: some sizes are under it and some above.
    return scene.sizes.length >= 4 && atMost >= 2 && atMost < scene.sizes.length && scene.sizes.length - atMost >= 2
  }
  return true
}

function paramsOf(scene: Scene): Params {
  switch (scene.variant) {
    case 'which-graph':
      return { runner: scene.runner, mode: scene.mode, rail: scene.rail, decoding: scene.batch.decoding, chunk: scene.batch.chunk }
    case 'captured':
      return { runner: scene.runner, mode: scene.mode, rail: scene.rail, sizes: scene.sizes.join(',') }
    case 'fields':
      return { field: scene.field, phrase: scene.phrase, compare: scene.compare, others: scene.others.join(',') }
  }
}

const MODES: readonly GraphModeId[] = ['NONE', 'PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE']
const isMode = (value: unknown): value is GraphModeId => typeof value === 'string' && (MODES as readonly string[]).includes(value)
const isRunner = (value: unknown): value is Runner => value === 'mrv2' || value === 'v1'

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const p = item.params
  if (item.variant === 'which-graph') {
    if (!isRunner(p.runner) || !isMode(p.mode) || typeof p.rail !== 'number' || typeof p.decoding !== 'number' || typeof p.chunk !== 'number') throw new TypeError(`${FAMILY}: the params of which-graph are not a scene`)
    return { variant: 'which-graph', runner: p.runner, mode: p.mode, rail: p.rail, batch: { decoding: p.decoding, chunk: p.chunk } }
  }
  if (item.variant === 'captured') {
    if (!isRunner(p.runner) || !isMode(p.mode) || typeof p.rail !== 'number' || typeof p.sizes !== 'string') throw new TypeError(`${FAMILY}: the params of captured are not a scene`)
    return { variant: 'captured', runner: p.runner, mode: p.mode, rail: p.rail, sizes: p.sizes.split(',').map(Number) }
  }
  if (typeof p.field !== 'string' || (p.phrase !== 0 && p.phrase !== 1) || typeof p.compare !== 'string' || typeof p.others !== 'string') throw new TypeError(`${FAMILY}: the params of fields are not a scene`)
  return { variant: 'fields', field: p.field, phrase: p.phrase, compare: p.compare as Compare | '', others: p.others === '' ? [] : p.others.split(',') }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* which-graph: words                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

const sizesText = (sizes: readonly number[]): Rich => rich(code(sizes.join(', ')))
const tokens = (value: number) => derived(value, 'tokens')

/** What a mode captures, in a sentence, from the sizes the scene lists and the rail. */
function captureSentence(scene: WhichScene, sizes: readonly number[]): Rich {
  const decodeSizes = sizes.filter((size) => size <= scene.rail)
  const routines = GRAPH_MODES[scene.mode]
  const prefix = scene.runner === 'mrv2' ? 'At start-up MRV2 captured' : 'At start-up MRV1 captured'
  const key = scene.runner === 'mrv2' ? 'descriptor' : 'key'
  switch (scene.mode) {
    case 'FULL_AND_PIECEWISE':
      return rich(prefix, ' FULL decode graphs, one ', key, ' for each size up to the rail, at ', ...sizesText(decodeSizes), ', and PIECEWISE graphs for every other batch, at ', ...sizesText(sizes), '.')
    case 'FULL_DECODE_ONLY':
      return rich(prefix, ' FULL decode graphs, one ', key, ' for each size up to the rail, at ', ...sizesText(decodeSizes), ', and nothing for a batch that is not a decode, because the mode\'s routine for those is none.')
    case 'PIECEWISE':
      return rich(prefix, ' PIECEWISE graphs at every size, ', ...sizesText(sizes), ', for every batch. It captured no full graph.')
    case 'FULL':
      return routines.mixed === 'FULL' ? rich(prefix, ' FULL graphs at every size, ', ...sizesText(sizes), ', for any batch: the mode has one routine, and it is FULL.') : rich(prefix, ' nothing.')
    case 'NONE':
      return rich(prefix, ' nothing.')
  }
}

function batchSentence(scene: WhichScene): Rich {
  const t = tokensOf(scene.batch)
  const rows = rowsOf(scene.batch)
  if (scene.batch.chunk === 0) {
    return scene.runner === 'mrv2'
      ? rich('The step is a uniform decode: ', given(rows, 'requests'), ' of one token each, so ', tokens(t), ' and a uniform token count of ', given(1, ''), '.')
      : rich('The step is a uniform decode: ', given(rows, 'requests'), ' of one token each, so ', tokens(t), ' and ', code('uniform'), ' is true.')
  }
  return scene.runner === 'mrv2'
    ? rich(
        'The step has ',
        given(scene.batch.decoding, 'tokens'),
        ' + ',
        given(scene.batch.chunk, 'tokens'),
        ' = ',
        tokens(t),
        ' in ',
        derived(rows, 'requests'),
        ', and one request is still prefilling, so it is not a uniform decode: its uniform token count and its query-length bound are none.',
      )
    : rich('The step has ', given(scene.batch.decoding, 'tokens'), ' + ', given(scene.batch.chunk, 'tokens'), ' = ', tokens(t), ' in ', derived(rows, 'requests'), ', and one request is still prefilling, so it is not a uniform decode: ', code('uniform'), ' is false.')
}

/** The sentence that says how the dispatcher gets from the batch to its answer. */
function resultSentence(scene: WhichScene, sizes: readonly number[], result: { mode: 'FULL' | 'PIECEWISE' | 'NONE'; padded: number }): Rich {
  const t = tokensOf(scene.batch)
  const largest = sizes[sizes.length - 1]
  const mixed = scene.batch.chunk > 0
  const decodeSizes = sizes.filter((size) => size <= scene.rail)
  const largestDecode = decodeSizes[decodeSizes.length - 1]
  const mrv2 = scene.runner === 'mrv2'
  if (result.mode === 'NONE') {
    if (t > largest) {
      return rich(tokens(t), ' is above the largest captured size, ', derived(largest, 'tokens'), ', so no ', mrv2 ? 'descriptor' : 'key', ' holds the batch and the step runs eagerly, kernel by kernel.')
    }
    return rich(
      'The mode ',
      code(scene.mode),
      ' has a routine for decode batches and none for the rest, so a batch with a prompt chunk matches nothing, whatever size it is, and the step runs eagerly, kernel by kernel.',
    )
  }
  const size = result.padded
  if (mrv2) {
    if (result.mode === 'FULL' && !mixed) {
      return rich(
        'The smallest captured size at or above ',
        tokens(t),
        ' is ',
        derived(size, 'tokens'),
        '. A FULL decode descriptor there fits: its uniform token count is the batch\'s and its request count is at least the batch\'s. The step replays the FULL graph captured at ',
        derived(size, 'tokens'),
        '.',
      )
    }
    if (result.mode === 'FULL') {
      return rich(
        'In mode ',
        code('FULL'),
        ' the one routine is FULL, and its descriptor for each size sets no uniform token count and no query-length bound, so a mixed batch fits the one at the smallest size at or above ',
        tokens(t),
        ', which is ',
        derived(size, 'tokens'),
        '. The step replays the FULL graph captured at ',
        derived(size, 'tokens'),
        '.',
      )
    }
    if (scene.mode === 'FULL_AND_PIECEWISE') {
      const full =
        t > largestDecode
          ? rich('No FULL decode graph is captured at or above ', tokens(t), ', because they stop at the rail, ', derived(largestDecode, 'tokens'), '.')
          : rich('A FULL decode descriptor is tried first, and it does not fit: its uniform token count is ', given(1, ''), ' and the batch\'s is none.')
      return rich(...full, ' The PIECEWISE descriptor at ', derived(size, 'tokens'), ' sets no request count and no uniform token count, so it fits. The step replays the PIECEWISE graph captured at ', derived(size, 'tokens'), '.')
    }
    return rich('The mode captures PIECEWISE graphs only, and the smallest size at or above ', tokens(t), ' is ', derived(size, 'tokens'), ', so the step replays the PIECEWISE graph captured at ', derived(size, 'tokens'), '.')
  }
  if (result.mode === 'FULL' && !mixed) {
    return rich(
      'MRV1 pads the batch to ',
      derived(size, 'tokens'),
      ', the smallest captured size at or above ',
      tokens(t),
      ', and looks for a FULL key with the exact request count of a uniform decode there: it is captured. The step replays the FULL graph at ',
      derived(size, 'tokens'),
      '.',
    )
  }
  if (result.mode === 'FULL') {
    return rich('In mode ', code('FULL'), ' MRV1 has a FULL key for each size with the request count it pads a mixed batch to, so the batch padded to ', derived(size, 'tokens'), ' finds one. The step replays the FULL graph at ', derived(size, 'tokens'), '.')
  }
  if (scene.mode === 'FULL_AND_PIECEWISE') {
    return rich(
      'MRV1 pads the batch to ',
      derived(size, 'tokens'),
      ' and looks for a FULL key first. Its FULL keys are for uniform decodes, and this batch is not one, so there is none. It then looks for a PIECEWISE key with the request count relaxed, and finds one. The step replays the PIECEWISE graph at ',
      derived(size, 'tokens'),
      '.',
    )
  }
  return rich('The mode captures PIECEWISE graphs only. MRV1 pads the batch to ', derived(size, 'tokens'), ' and finds a PIECEWISE key with the request count relaxed. The step replays the PIECEWISE graph at ', derived(size, 'tokens'), '.')
}

function whichSteps(scene: WhichScene): Step[] {
  const sizes = sizesFor(scene.rail)
  const result = dispatchBatch(scene.runner, scene.mode, scene.rail, sizes, scene.batch)
  return [{ text: captureSentence(scene, sizes) }, { text: batchSentence(scene) }, { text: resultSentence(scene, sizes, result) }]
}

const KIND_TEXT: Readonly<Record<Kind, Rich>> = {
  full: rich('A ', code('FULL'), ' graph'),
  piecewise: rich('A ', code('PIECEWISE'), ' graph'),
  eager: rich('No graph: the step runs eagerly'),
}

/** Why a kind of answer is not the step's. */
function whyNot(option: Kind, scene: WhichScene, truth: Kind): Rich {
  const t = tokensOf(scene.batch)
  const sizes = sizesFor(scene.rail)
  const largest = sizes[sizes.length - 1]
  const mixed = scene.batch.chunk > 0
  const routines = GRAPH_MODES[scene.mode]
  switch (option) {
    case 'full':
      if (truth === 'eager' && t > largest) return rich('No captured size is large enough: ', tokens(t), ' is above the largest, ', derived(largest, 'tokens'), '.')
      if (routines.decode !== 'FULL' && routines.mixed !== 'FULL') return rich('The mode ', code(scene.mode), ' captures no FULL graph.')
      if (mixed) return rich('A FULL decode graph is captured for batches in which every request has the same query length, and this batch has a request still prefilling, so it is not one.')
      return rich('The mode has no FULL routine for this batch.')
    case 'piecewise':
      if (truth === 'eager' && t > largest) return rich('No captured size is large enough: ', tokens(t), ' is above the largest, ', derived(largest, 'tokens'), '.')
      if (scene.mode === 'FULL_DECODE_ONLY') return rich('The mode ', code('FULL_DECODE_ONLY'), ' captures no PIECEWISE graph: its routine for a batch that is not a decode is none.')
      if (scene.mode === 'FULL') return rich('The mode ', code('FULL'), ' captures FULL graphs only.')
      return rich('A FULL graph is tried before a PIECEWISE one, and a FULL graph fits this batch.')
    case 'eager':
      return rich('A graph was captured that holds the batch: ', tokens(t), ' is within the captured sizes, and the mode has a routine for a step like this one.')
  }
}

function whichOptions(scene: WhichScene, level: Level, seed: Seed): ChoiceOption[] {
  const truth = kindOf(dispatchBatch(scene.runner, scene.mode, scene.rail, sizesFor(scene.rail), scene.batch).mode)
  const steps = whichSteps(scene)
  return shown(
    FAMILY,
    'which-graph',
    level,
    seed,
    KINDS.map(
      (kind): ChoiceOption => ({
        id: kind,
        text: KIND_TEXT[kind],
        why: kind === truth ? rich(...steps[2].text) : whyNot(kind, scene, truth),
        ...(kind === truth ? {} : { miss: `${FAMILY}.${kind}-taken-for` }),
      }),
    ),
  )
}

function whichGivens(scene: WhichScene, level: Level): Given[] {
  const lines: Given[] = [
    { label: 'runner', value: scene.runner === 'mrv2' ? code('MRV2') : text('the legacy runner, MRV1') },
    { label: 'cudagraph_mode', value: code(scene.mode) },
    { label: 'max_num_seqs', value: given(scene.rail, '') },
    { label: 'captured sizes', value: code(sizesFor(scene.rail).join(', ')) },
    { label: 'attention backend', value: text('supports graphs for every batch') },
  ]
  const b = scene.batch
  if (level === 3) {
    lines.push({ label: 'requests in the step', value: given(rowsOf(b), 'requests') })
    if (b.chunk > 0) lines.push({ label: 'of them decoding', value: given(b.decoding, 'requests') }, { label: 'new prompt tokens of the other', value: given(b.chunk, 'tokens') })
    return lines
  }
  lines.push({ label: 'requests decoding', value: given(b.decoding, 'requests') })
  if (b.chunk > 0) lines.push({ label: 'prompt chunk in the step', value: given(b.chunk, 'tokens') })
  return lines
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* captured: words                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

function capturedSteps(scene: CapturedScene): Step[] {
  const { mode, rail, sizes } = scene
  const atMost = sizes.filter((size) => size <= rail)
  const total = capturedCount(scene.runner, mode, rail, sizes)
  const key = scene.runner === 'mrv2' ? 'descriptor' : 'key'
  const first: Step = {
    text:
      mode === 'FULL_AND_PIECEWISE'
        ? rich('The mode is a pair of routines: FULL for decode batches and PIECEWISE for the rest. Each routine has a ', key, ' at the sizes it takes.')
        : mode === 'FULL_DECODE_ONLY'
          ? rich('The mode is a pair of routines: FULL for decode batches and none for the rest, so only the decode ', key, 's are captured.')
          : rich('The mode is one routine, ', code(mode), ', for every batch, so there is a ', key, ' for each size and no decode ', key, 's of their own.'),
  }
  const decode: Step = {
    text: rich('A decode graph is captured for each size up to the rail and none above it, because it would need more requests than the rail holds: ', given(rail, ''), ' admits ', derived(atMost.length, ''), ' of the ', derived(sizes.length, ''), ' sizes, ', ...sizesText(atMost), '.'),
  }
  const sum = (decodeGraphs: number, mixedGraphs: number): Step => ({
    text:
      mixedGraphs > 0 && decodeGraphs > 0
        ? rich('So ', derived(decodeGraphs, 'graphs'), ' for decode batches and ', derived(mixedGraphs, 'graphs'), ' for the rest: ', derived(total, 'graphs'), '.')
        : rich('So ', derived(total, 'graphs'), ' in all.'),
    result: derived(total, 'graphs'),
  })
  if (mode === 'FULL_AND_PIECEWISE') return [first, decode, sum(atMost.length, sizes.length)]
  if (mode === 'FULL_DECODE_ONLY') return [first, decode, sum(atMost.length, 0)]
  return [first, { text: rich('The list has ', derived(sizes.length, 'sizes'), ': ', ...sizesText(sizes), '.') }, sum(0, sizes.length)]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* fields: words                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const QUESTION: Readonly<Record<Compare, Rich>> = {
  'mrv2-only': rich('Which of these fields is a field of MRV2\'s ', code('BatchExecutionDescriptor'), ' and not of MRV1\'s ', code('BatchDescriptor'), '?'),
  'mrv1-only': rich('Which of these fields is a field of MRV1\'s ', code('BatchDescriptor'), ' and not of MRV2\'s ', code('BatchExecutionDescriptor'), '?'),
  'doc-leaves-out': rich(
    'The published design document shows the key as a tuple of four fields, ',
    code('num_tokens'),
    ', ',
    code('num_reqs'),
    ', ',
    code('uniform'),
    ' and ',
    code('has_lora'),
    '. Which field of MRV1\'s actual key does it leave out?',
  ),
}

const isField = (value: string): value is Field => (MRV2_FIELDS as readonly string[]).includes(value)

function fieldSteps(scene: FieldsScene): Step[] {
  if (scene.compare === 'mrv2-only') {
    return [
      { text: rich('MRV2\'s key has seven fields: ', code(MRV2_FIELDS.join(', ')), '. MRV1\'s has five: ', code(MRV1_FIELDS.join(', ')), '.') },
      { text: rich(code(scene.field), ' is MRV2\'s and not MRV1\'s: MRV1 has no such field. The fields they share are ', code(BOTH.join(', ')), '.') },
    ]
  }
  if (scene.compare === 'mrv1-only') {
    return [
      { text: rich('MRV1\'s key has five fields: ', code(MRV1_FIELDS.join(', ')), '. MRV2\'s has seven: ', code(MRV2_FIELDS.join(', ')), '.') },
      { text: rich(code(scene.field), ' is MRV1\'s and not MRV2\'s: MRV2 has no such field', ...(scene.field === 'uniform' ? [', though it has ', code('uniform_token_count'), ' for the same job'] : [', and shows an adapter only as ', code('num_active_loras')]), '.') },
    ]
  }
  if (scene.compare === 'doc-leaves-out') {
    return [
      { text: rich('MRV1\'s actual key has five fields: ', code(MRV1_FIELDS.join(', ')), '. The document shows the first four, and matches neither runner\'s code at the pin.') },
      { text: rich('The one it leaves out is ', code('num_active_loras'), ', the number of distinct adapters in the batch.') },
    ]
  }
  const field = isField(scene.field) ? scene.field : 'num_tokens'
  return [
    { text: rich('MRV2\'s key has seven fields: ', code(MRV2_FIELDS.join(', ')), '.') },
    { text: rich(code(field), ' ', ...JOBS[field][scene.phrase], '.') },
  ]
}

function fieldOptions(scene: FieldsScene, level: Level, seed: Seed): ChoiceOption[] {
  if (scene.compare === '') {
    return shown(
      FAMILY,
      'fields',
      level,
      seed,
      [scene.field, ...scene.others].filter(isField).map(
        (field): ChoiceOption => ({
          id: slug(field),
          text: rich(code(field)),
          why: field === scene.field ? rich(code(field), ' ', ...JOBS[field][scene.phrase], '.') : rich(code(field), ' ', ...JOBS[field][0], ', and that is not what the question describes.'),
          ...(field === scene.field ? {} : { miss: `${FAMILY}.${slug(field)}-taken-for-${slug(scene.field)}` }),
        }),
      ),
    )
  }
  const names = [scene.field, ...scene.others]
  const whyKey = scene.compare === 'doc-leaves-out' ? rich(code(scene.field), ' is in MRV1\'s key and not in the document\'s four.') : fieldSteps(scene)[1].text
  const whyOther = (name: string): Rich => {
    if (scene.compare === 'doc-leaves-out') {
      return name === 'uniform_token_count' ? rich(code(name), ' is a field of MRV2\'s key, not of MRV1\'s, and the document does not show it either.') : rich(code(name), ' is one of the four fields that the document shows.')
    }
    if (scene.compare === 'mrv2-only') return rich(code(name), MRV1_ONLY.includes(name) ? ' is a field of MRV1\'s key, and not of MRV2\'s.' : ' is a field of both keys.')
    return rich(code(name), MRV2_ONLY.includes(name) ? ' is a field of MRV2\'s key, and not of MRV1\'s' : ' is a field of both keys', name === 'uniform_token_count' ? ', and it is not the same field as uniform: it holds the query length that the requests share.' : '.')
  }
  return shown(
    FAMILY,
    'fields',
    level,
    seed,
    names.map(
      (name): ChoiceOption => ({
        id: slug(name),
        text: rich(code(name)),
        why: name === scene.field ? rich(...whyKey) : whyOther(name),
        ...(name === scene.field ? {} : { miss: `${FAMILY}.${slug(name)}-taken-for-${slug(scene.field)}` }),
      }),
    ),
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

function solutionOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  return scene.variant === 'which-graph' ? whichSteps(scene) : scene.variant === 'captured' ? capturedSteps(scene) : fieldSteps(scene)
}

const whichKey = (scene: WhichScene): Kind => kindOf(dispatchBatch(scene.runner, scene.mode, scene.rail, sizesFor(scene.rail), scene.batch).mode)

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene) }
  if (scene.variant === 'which-graph') {
    const truth = whichKey(scene)
    return finishItem(gen, {
      ...base,
      stem: rich('In a synthetic engine at vLLM v0.33.0, the graphs were captured at start-up for the configuration below, and a step is about to run. Which graph does the step replay?'),
      givens: whichGivens(scene, level),
      worked: workedPart(level, whichSteps(scene), (attempt) => {
        const example = drawWhich(level, seed, `example-${attempt}`, 1 + attempt)
        return isFair(example) && whichKey(example) !== truth ? whichSteps(example) : null
      }),
      answer: { kind: 'choice', label: 'the graph', options: whichOptions(scene, level, seed), correct: truth },
    })
  }
  if (scene.variant === 'captured') {
    const truth = capturedCount(scene.runner, scene.mode, scene.rail, scene.sizes)
    return finishItem(gen, {
      ...base,
      stem: rich(
        scene.runner === 'mrv2' ? 'In a synthetic engine at vLLM v0.33.0 on its default runner, ' : 'In a synthetic engine at vLLM v0.33.0 on the legacy runner, ',
        'the user lists the sizes to capture. ',
        'There is no adapter. How many graphs does the engine capture at start-up?',
      ),
      givens: [
        { label: 'cudagraph_mode', value: code(scene.mode) },
        { label: 'max_num_seqs', value: given(scene.rail, '') },
        { label: 'capture sizes', value: code(scene.sizes.join(', ')) },
      ],
      worked: workedPart(level, capturedSteps(scene), (attempt) => {
        const example = drawCaptured(level, seed, `example-${attempt}`)
        return isFair(example) && capturedCount(example.runner, example.mode, example.rail, example.sizes) !== truth ? capturedSteps(example) : null
      }),
      answer: { kind: 'numeric', label: 'graphs captured', unit: 'graphs', truth, tolerance: EXACT },
    })
  }
  const stem =
    scene.compare === ''
      ? rich('At vLLM v0.33.0, which field of MRV2\'s ', code('BatchExecutionDescriptor'), ' ', ...(isField(scene.field) ? JOBS[scene.field][scene.phrase] : []), '?')
      : QUESTION[scene.compare]
  return finishItem(gen, {
    ...base,
    stem,
    givens: [],
    worked: workedPart(level, fieldSteps(scene), (attempt) => {
      const other = MRV2_FIELDS[(MRV2_FIELDS.indexOf(isField(scene.field) ? scene.field : 'num_tokens') + 1 + attempt) % MRV2_FIELDS.length]
      return scene.compare === '' ? fieldSteps({ ...scene, field: other }) : fieldSteps(drawFields(level, seed, `example-${attempt}`))
    }),
    answer: { kind: 'choice', label: 'the field', options: fieldOptions(scene, level, seed), correct: slug(scene.field) },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant !== 'captured') return null
    const { mode, rail, sizes } = scene
    const atMost = sizes.filter((size) => size <= rail).length
    if (mode === 'FULL_AND_PIECEWISE' && value === sizes.length) {
      return { id: `${FAMILY}.one-routine`, message: rich('That counts one graph for each size. This mode has two routines, FULL for decode batches and PIECEWISE for the rest, and each captures its own graphs.') }
    }
    if (mode === 'FULL_AND_PIECEWISE' && value === 2 * sizes.length) {
      return { id: `${FAMILY}.decode-above-the-rail`, message: rich('That gives both routines a graph at every size. A decode graph is captured only up to the rail, because above it the batch would need more requests than the rail holds.') }
    }
    if (mode === 'FULL_AND_PIECEWISE' && value === atMost) {
      return { id: `${FAMILY}.decode-only`, message: rich('That counts the decode graphs alone. The PIECEWISE routine captures a graph at every size too.') }
    }
    if (mode === 'FULL_DECODE_ONLY' && value === sizes.length) {
      return { id: `${FAMILY}.sizes-above-the-rail`, message: rich('That counts a graph for each size. This mode captures decode graphs only, and none above the rail.') }
    }
    return null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const dispatchKey: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Dispatch keys',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, 'scene'), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    if (!isVariant(spec.id)) return false
    const scene = drawScene(spec.id, level, seed, 'scene')
    if (!isFair(scene)) return false
    // The scene is the one that was drawn for: the dispatcher's answer is the kind the draw meant (it always is, and a re-pin that moves the rules is caught here).
    return scene.variant !== 'which-graph' || KINDS.includes(whichKey(scene))
  },
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution: (item) => solutionOf(item),
}
