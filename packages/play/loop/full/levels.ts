/**
 * The full service's levels (TR2's levels and TR6's mask lane, GAMES.md §3.2; D-041, D-044, D-048): what each stage's world is on a
 * seed, the configuration it opens on, the house's (the reference), the bar, the prediction and its answer, and the band.
 *
 * Every stage is a night of 24 tickets [estimated] on a rail of 12 clips [estimated], short chats due at once, served by the sim's step
 * loop v1 on a cost card: "70B on H100", kernelspace's S5 fit at TP 4 with its host term on the CPU lane (D-044, proposed), or the
 * small-model napkin (synthetic). The token budget is each card's server default at the pin (claims vllm.batch-defaults.large.server-tokens
 * and vllm.batch-defaults.small.server-tokens), and every other lever starts at the pinned engine's default (`defaultLevers`).
 *
 *   async    `70b`, `small`   async scheduling off against on: the house writes the next call during the fire.
 *   graphs   `comb`           calling each dish (no graph) against one word (the default FULL_AND_PIECEWISE), on the small card.
 *            `sizes`          three molds on the rack [estimated] for a night of decode fires drawn from the seed's histogram: vLLM's own
 *                             list cut to three against the exact optimum (the band: GAMES.md §3.2's 1.15 and 1%).
 *            `modes`          the mode to ask for on an attention backend whose graph support the seed draws, answer first: FULL on a
 *                             backend that replays any batch, FULL_AND_PIECEWISE on one that replays uniform batches only, PIECEWISE on one
 *                             with no full graphs, a third of the seeds each, the best ≥ 3% ahead of the next.
 *   mrv2     `small`, `70b`   the legacy V1 runner against MRV2, the default: the V2 runner's host card prepares inputs on the GPU.
 *   mask     `mask`           TR6's allergy card: every ticket carries a grammar, and the engine's plain step (async scheduling off)
 *                             writes the bitmask after its launch, during the fire, or after the fire. Answer first: the card fits inside
 *                             the fire, or outlasts it, half each, by the grammar's weight the seed draws [estimated].
 *
 * A stage opens on its naive configuration, which fails the bar on every in-band seed (tests/play/loop-full-levels.test.ts), except
 * `modes`, which opens on the engine's default and whose naive configuration is to drill no routine at all.
 */
import { assertSeed, below, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { hostPreset } from '@es/sim/host'
import { gpuLayers, sglangDecodeBuckets, vllmCaptureSizes } from '@es/sim/steploop'
import type { BackendSupport, GraphModeId } from '@es/sim/steploop'
import { CARDS, nightOf, servingMode, tableOf } from './night'
import type { Night } from './night'
import { captureCost, histogramNight, optimalSizes } from './sizes'
import type { CardId, FullLevel, FullLevelId, Levers, StageWorld } from './types'

export const FULL_LEVEL_IDS: readonly FullLevelId[] = ['async', 'graphs', 'mrv2', 'mask']

/** Clips on the rail and tickets in a night [estimated]: two waves, so the rail refills as tickets end. */
export const FULL_SLOTS = 12
export const FULL_REQUESTS = 24

/** Each card's `max_num_batched_tokens` for `vllm serve` at the pin: the H100 is in vLLM's large tier, the small card's 24 GB in the small. */
export const BUDGETS: Readonly<Record<CardId, number>> = Object.freeze({ '70b': 8192, small: 2048 })

/** A night passes within 3% of the house's clock [estimated: the graded `close` level's 97% (GAMES.md §3.2)]; the sizes stage within 5%. */
export const CLOCK_SLACK = 30
export const CAPTURE_SLACK = 50

/** Nights a stage serves before it closes unpassed [estimated]: three tries, then the debrief. */
export const NIGHTS_PER_STAGE = 3

/** The molds the sizes stage's rack holds, its night's fires, and the context its rows read [estimated]. */
export const SIZES = { molds: 3, fires: 40, context: 256 } as const

/** The modes stage's largest capture size, set so that a mixed batch of a prompt and the decodes fits a graph [estimated]. */
export const MODES_MAX_CAPTURE = 64

/** The pinned engine's defaults for a rail and a budget: async on, FULL_AND_PIECEWISE, vLLM's own capture sizes, MRV2, the mask during the fire. */
export function defaultLevers(slots: number, budget: number): Levers {
  return { async: true, graphMode: 'FULL_AND_PIECEWISE', captureSizes: vllmCaptureSizes({ maxNumSeqs: slots, maxBatchedTokens: budget }), runner: 'mrv2', maskOverlap: true }
}

/** The modes a learner can ask for, in the order the panel lists them. */
export const MODES: readonly GraphModeId[] = ['FULL_AND_PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE']

/** The choices of the modes stage's prediction: the five modes, and none: the engine refuses, or its routines leave the night no room. */
export const MODE_CHOICES: readonly string[] = ['FULL', 'FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE', 'None serves: refused, or no room']

/** The two answers of the mask: the allergy card fits inside the fire, or the line waits for it. */
export const MASK_CHOICES: readonly string[] = ['It fits inside the fire: the line never waits for the card', 'It outlasts the fire: the line waits for the card']

/** The grammar weights the mask level draws from, µs per bitmask row [estimated]: light ones fit a fire of 12 rows, heavy ones do not. */
export const MASK_ROW_US = { fits: [40, 60, 80], late: [160, 200, 240] } as const

/**
 * How many courses a night's tables ask for [estimated]: the long service of most stages, whose fires are mostly decodes, and the short
 * one of the modes stage's mixed nights, where a ticket ends and a new one is hung in most fires, so most fires mix a prompt with decodes.
 */
export const OUTPUTS = { long: [12, 28], short: [3, 8] } as const satisfies Record<string, readonly [number, number]>

/** A MiB, for the modes stage's budgets. */
const MIB = 1024 * 1024

/**
 * The modes stage's draws, by its answer (answer first, GAMES.md §3.2: each of the four modes that use graphs is best on about a quarter of
 * the seeds): the backend's graph support, what the reach-in can spare for the routines [estimated, MiB, against the graphs' memory of the
 * sim's ./memory model: 32 for FULL_DECODE_ONLY's four decode graphs at this rail, 93 for FULL's or PIECEWISE's eleven, 125 for
 * FULL_AND_PIECEWISE's fifteen], and the night's mix.
 *   FULL                a backend that replays any batch, with room for a graph per size;
 *   FULL_AND_PIECEWISE  a backend that replays only uniform batches, with room for both routines;
 *   FULL_DECODE_ONLY    room only for the decode graphs;
 *   PIECEWISE           a uniform-only backend with room for one routine per size but not two, and a mixed night, where most fires carry a
 *                       prompt: the pieces serve every fire, where decode-only graphs leave the mixed ones to be called dish by dish.
 */
const MODES_DRAW: Readonly<Record<'FULL' | 'FULL_AND_PIECEWISE' | 'FULL_DECODE_ONLY' | 'PIECEWISE', { readonly support: readonly BackendSupport[]; readonly mib: readonly [number, number]; readonly mixed: boolean | null }>> = {
  FULL: { support: ['ALWAYS'], mib: [96, 160], mixed: null },
  FULL_AND_PIECEWISE: { support: ['UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE'], mib: [128, 160], mixed: null },
  FULL_DECODE_ONLY: { support: ['ALWAYS', 'UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE'], mib: [36, 88], mixed: null },
  PIECEWISE: { support: ['UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE'], mib: [96, 120], mixed: true },
}

interface LevelDef {
  readonly title: string
  readonly prompt: string
}

/*
 * The copy pairs the kitchen's word with the engine's term (GAMES.md §2.6, rule 2). It carries no digit, so no number goes untagged:
 * the cards and the tape print every figure as a Readout.
 */
const DEFS: Readonly<Record<FullLevelId, LevelDef>> = {
  async: {
    title: 'Write during the fire',
    prompt:
      'Each fire the expo writes the next call and reads the last fire back. Write the next call during the fire (async scheduling) and the line need not wait. Serve the night on both cost cards.',
  },
  graphs: {
    title: 'Drilled routines',
    prompt:
      'Calling each dish costs the expo one call per kernel; a drilled routine fires the whole fire with one word (a CUDA graph replay). Three stages: the comb, the mold rack and the modes.',
  },
  mrv2: {
    title: 'The V2 runner',
    prompt: 'The V2 runner sets up each fire from the rail itself (it prepares the inputs on the GPU), so the expo has less to write. Serve the night with each runner, on both cards.',
  },
  mask: {
    title: 'The allergy card',
    prompt:
      'Every table tonight has an allergy: before a course is chosen, the expo strikes the dishes the table may not have (the structured-output mask). Does the card fit inside the fire?',
  },
}

const isLevelId = (id: string): id is FullLevelId => Object.hasOwn(DEFS, id)

/** Whether `id` is one of the full service's levels. */
export const isFullLevel = (id: string): id is FullLevelId => isLevelId(id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The stages                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const TITLES: Readonly<Record<CardId, string>> = { '70b': '70B on H100', small: 'Small model' }

/** A stage's world before its answers: everything but the prediction's answer and the house's metric. */
type Draft = Omit<StageWorld, 'answer' | 'houseMetric'>

function base(id: StageWorld['id'], card: CardId, seed: Seed | null): Pick<Draft, 'id' | 'card' | 'slots' | 'budget' | 'workloadSeed' | 'requests' | 'outputs' | 'structuredPermille' | 'graphBudget' | 'support' | 'maskRowUs' | 'sizes' | 'naiveFails'> {
  return {
    id,
    card,
    slots: FULL_SLOTS,
    budget: BUDGETS[card],
    workloadSeed: seed,
    requests: FULL_REQUESTS,
    outputs: OUTPUTS.long,
    structuredPermille: 0,
    graphBudget: null,
    support: 'ALWAYS',
    maskRowUs: hostPreset('mrv2').card.maskPerSeqUs,
    sizes: null,
    naiveFails: true,
  }
}

function asyncStage(card: CardId, seed: Seed): Draft {
  const d = defaultLevers(FULL_SLOTS, BUDGETS[card])
  const off = { ...d, async: false }
  return {
    ...base(card, card, seed),
    title: TITLES[card],
    prompt:
      card === '70b'
        ? 'A 70B model on four H100s: long fires, and the expo\'s work per ticket is S5\'s host term. Serve the night with the next call written after the fire, then during it.'
        : 'A small model: short fires, so the expo\'s writing is a large share of each. Serve the night with the next call written after the fire, then during it.',
    levers: ['async'],
    start: off,
    naive: off,
    house: d,
    metric: 'clock',
    slackPermille: CLOCK_SLACK,
    prediction: { kind: 'number', question: 'With the next call written during the fire (async scheduling on), how long does each course take: the median TPOT, in µs?', unit: 'µs', tolerancePermille: 100 },
  }
}

function combStage(seed: Seed): Draft {
  const d = defaultLevers(FULL_SLOTS, BUDGETS.small)
  const eager = { ...d, graphMode: 'NONE' as const }
  return {
    ...base('comb', 'small', seed),
    title: 'The comb',
    prompt: 'With no routine drilled, the expo calls every dish to the line one by one: the comb\'s teeth. Serve the night calling each dish, then with the routines drilled (graphs on).',
    levers: ['graphMode'],
    start: eager,
    naive: eager,
    house: d,
    metric: 'clock',
    slackPermille: CLOCK_SLACK,
    prediction: { kind: 'number', question: 'Calling each dish, with no graph, how many calls does the expo make to launch one fire?', unit: 'calls', tolerancePermille: 0 },
  }
}

function sizesStage(seed: Seed): Draft {
  const d = defaultLevers(FULL_SLOTS, BUDGETS.small)
  const vllmLadder = d.captureSizes.filter((size) => size <= FULL_SLOTS)
  const cut = vllmLadder.slice(0, SIZES.molds)
  const world = {
    batches: histogramNight(seed, FULL_SLOTS, SIZES.fires),
    ladder: Array.from({ length: FULL_SLOTS }, (_, i) => i + 1),
    vllmLadder,
    sglangLadder: sglangDecodeBuckets(FULL_SLOTS),
    molds: SIZES.molds,
    context: SIZES.context,
  }
  const draft: Draft = {
    ...base('sizes', 'small', null),
    title: 'The mold rack',
    prompt: `The rack holds a few molds, the routines the line has time to drill. A fire drops into the smallest mold that holds it, its empty places padding; a bigger fire is called dish by dish. Choose tonight's molds.`,
    levers: ['capture'],
    start: { ...d, captureSizes: cut },
    naive: { ...d, captureSizes: cut },
    house: d,
    metric: 'capture',
    slackPermille: CAPTURE_SLACK,
    prediction: { kind: 'number', question: "With vLLM's own sizes cut to the rack's molds, how many of tonight's fires are called dish by dish?", unit: 'fires', tolerancePermille: 0 },
    sizes: world,
  }
  const table = tableOf({ ...draft, answer: 0, houseMetric: 0 }, d)
  return { ...draft, house: { ...d, captureSizes: optimalSizes(table, world.ladder, world.batches, SIZES.molds) } }
}

/** The modes stage's answer, its backend, the reach-in's room and the night's mix, drawn answer first from the seed. */
function modesDraw(seed: Seed): { answer: keyof typeof MODES_DRAW; support: BackendSupport; graphBudget: number; mixed: boolean } {
  const rng = rngFor(seed, 'loop/full/modes')
  const answers = ['FULL', 'FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE'] as const
  const answer = answers[below(rng, answers.length)]
  const draw = MODES_DRAW[answer]
  const support = draw.support[below(rng, draw.support.length)]
  const steps = (draw.mib[1] - draw.mib[0]) / 4
  const graphBudget = (draw.mib[0] + 4 * below(rng, steps + 1)) * MIB
  const coin = below(rng, 2) === 1
  return { answer, support, graphBudget, mixed: draw.mixed ?? coin }
}

function modesStage(seed: Seed): Draft {
  const d = defaultLevers(FULL_SLOTS, BUDGETS.small)
  const ladder = vllmCaptureSizes({ maxNumSeqs: MODES_MAX_CAPTURE / 2, maxBatchedTokens: BUDGETS.small })
  const levers = { ...d, captureSizes: ladder }
  const { answer, support, graphBudget, mixed } = modesDraw(seed)
  return {
    ...base('modes', 'small', seed),
    title: 'The modes',
    prompt: `Tonight's attention backend replays graphs at support level ${support}, the reach-in spares the routines a little room, and ${mixed ? 'most fires mix a prompt with decodes' : 'most fires only decode'}. Ask for the mode that serves fastest.`,
    levers: ['graphMode'],
    start: levers,
    naive: { ...levers, graphMode: 'NONE' },
    house: { ...levers, graphMode: answer },
    metric: 'clock',
    slackPermille: CLOCK_SLACK,
    prediction: { kind: 'choice', question: `Ask for FULL tonight: which mode serves the night?`, options: MODE_CHOICES },
    support,
    graphBudget,
    outputs: mixed ? OUTPUTS.short : OUTPUTS.long,
  }
}

function mrv2Stage(card: CardId, seed: Seed): Draft {
  const d = defaultLevers(FULL_SLOTS, BUDGETS[card])
  const legacy = { ...d, runner: 'v1' as const }
  return {
    ...base(card, card, seed),
    title: TITLES[card],
    prompt:
      card === 'small'
        ? 'A small model, whose short fires leave the expo\'s work exposed. Serve the night on the legacy V1 runner, then on MRV2.'
        : 'The 70B model, whose fires cook for long. Serve the night on the legacy V1 runner, then on MRV2.',
    levers: ['runner'],
    start: legacy,
    naive: legacy,
    house: d,
    metric: 'clock',
    slackPermille: CLOCK_SLACK,
    prediction: { kind: 'number', question: 'How many µs of each course does the V2 runner save on this card (the median TPOT on V1, less on MRV2)?', unit: 'µs', tolerancePermille: 250 },
    // On the 70B card the forward hides both runners' host work, so the runners tie: the stage is the prediction's.
    naiveFails: card === 'small',
  }
}

/** The mask's answer and grammar weight, drawn answer first. */
function maskDraw(seed: Seed): { late: boolean; rowUs: number } {
  const rng = rngFor(seed, 'loop/full/mask')
  const late = below(rng, 2) === 1
  const weights = late ? MASK_ROW_US.late : MASK_ROW_US.fits
  return { late, rowUs: weights[below(rng, weights.length)] }
}

function maskStage(seed: Seed): Draft {
  const d = defaultLevers(FULL_SLOTS, BUDGETS.small)
  const plain = { ...d, async: false }
  const { rowUs } = maskDraw(seed)
  return {
    ...base('mask', 'small', seed),
    title: 'The allergy card',
    prompt: 'The engine\'s plain step (async scheduling off): the expo launches the fire, then writes the allergy card while the line cooks, or after. Serve it after the fire, then during it.',
    levers: ['maskOverlap'],
    start: { ...plain, maskOverlap: false },
    naive: { ...plain, maskOverlap: false },
    house: plain,
    metric: 'clock',
    slackPermille: CLOCK_SLACK,
    prediction: { kind: 'choice', question: 'With the card written during the fire, does it fit inside the fire?', options: MASK_CHOICES },
    structuredPermille: 1000,
    maskRowUs: rowUs,
  }
}

function draftsOf(id: FullLevelId, seed: Seed): Draft[] {
  switch (id) {
    case 'async':
      return [asyncStage('70b', seed), asyncStage('small', seed)]
    case 'graphs':
      return [combStage(seed), sizesStage(seed), modesStage(seed)]
    case 'mrv2':
      return [mrv2Stage('small', seed), mrv2Stage('70b', seed)]
    case 'mask':
      return [maskStage(seed)]
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Answers and bands                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The prediction's answer, from the model on the stage's own world. */
function answerOf(draft: Draft, house: Night, naive: Night): number {
  switch (draft.id) {
    case '70b':
    case 'small':
      // async: the house's TPOT; mrv2: what MRV2 saves on the median TPOT.
      return draft.levers[0] === 'async' ? (house.tpotP50Us ?? 0) : Math.max(0, (naive.tpotP50Us ?? 0) - (house.tpotP50Us ?? 0))
    case 'comb':
      return hostPreset('mrv2').card.kernelsPerLayer * gpuLayers(CARDS.small)
    case 'sizes': {
      const largest = Math.max(...draft.start.captureSizes)
      return draft.sizes!.batches.filter((batch) => batch > largest).length
    }
    case 'modes': {
      const mode = servingMode({ ...draft, answer: 0, houseMetric: 0 }, { ...draft.house, graphMode: 'FULL' }).mode
      return mode === null ? MODE_CHOICES.length - 1 : MODE_CHOICES.indexOf(mode)
    }
    case 'mask':
      return maskDraw(draft.workloadSeed ?? 0).late ? 1 : 0
  }
}

/** A stage on its seed, with its answers. */
function finish(draft: Draft): StageWorld {
  const probe = { ...draft, answer: 0, houseMetric: 0 }
  const house = nightOf(probe, draft.house)
  const naive = nightOf(probe, draft.naive)
  if (house === null || naive === null) throw new Error(`internal: the ${draft.id} stage's house or naive night is refused`)
  return { ...draft, answer: answerOf(draft, house, naive), houseMetric: house.metric }
}

/** The level `id` on `seed`. Throws for a level the full service does not have. */
export function buildFullLevel(id: string, seed: Seed): FullLevel {
  if (!isLevelId(id)) throw new RangeError(`the full service has no level "${id}"`)
  assertSeed(seed)
  return { id, seed, title: DEFS[id].title, prompt: DEFS[id].prompt, stages: draftsOf(id, seed).map(finish) }
}

/** `a` is at least `b` times (1000 + permille) / 1000, in integers, and more than `b`: a night that costs nothing is beaten by none. */
const atLeast = (a: number, b: number, permille: number): boolean => a > b && a * 1000 >= b * (1000 + permille)

/** The naive configuration loses by this much at least [estimated]: a visible margin past the bar's slack. */
const NAIVE_MARGIN = 50

/**
 * Whether a stage's world is a fair question (GAMES.md §2.1): the naive configuration fails the bar with room to spare, the house passes,
 * and, where the answer is drawn first, the drawn answer is the model's and ahead of the next.
 */
export function stageInBand(stage: StageWorld): boolean {
  const naive = nightOf(stage, stage.naive)
  const house = nightOf(stage, stage.house)
  if (naive === null || house === null) return false
  if (stage.naiveFails && !atLeast(naive.metric, house.metric, NAIVE_MARGIN)) return false
  if (stage.id === 'sizes') {
    // GAMES.md §3.2: the default list cut to the budget costs ≥ 1.15 × the optimum, and the next-best set is ≥ 1% worse.
    const world = stage.sizes!
    const table = tableOf(stage, stage.house)
    const optimum = captureCost(table, stage.house.captureSizes, world.batches)
    if (!atLeast(captureCost(table, stage.naive.captureSizes, world.batches), optimum, 150)) return false
    return runnerUp(table, world.ladder, world.batches, world.molds, stage.house.captureSizes) * 1000 >= optimum * 1010
  }
  if (stage.id === 'modes') {
    // The drawn mode serves the night ≥ 3% ahead of every other mode the backend lets run.
    const best = house.metric
    for (const mode of MODES) {
      const night = nightOf(stage, { ...stage.house, graphMode: mode })
      const runs = servingMode(stage, { ...stage.house, graphMode: mode }).mode
      if (night === null || runs === servingMode(stage, stage.house).mode) continue
      if (!atLeast(night.metric, best, 30)) return false
    }
    return true
  }
  if (stage.id === 'mask') {
    // The card fits when, written during the fire, it leaves the line no darker than the same night without a grammar; it is late when it
    // darkens it by 3% of the clock or more [estimated]. Answer first: the drawn weight must give the drawn answer.
    const free = nightOf({ ...stage, structuredPermille: 0 }, stage.house)
    if (free === null) return false
    const added = house.fires.reduce((sum, fire) => sum + fire.bubbleUs, 0) - free.fires.reduce((sum, fire) => sum + fire.bubbleUs, 0)
    const late = added * 1000 >= house.metric * 30
    const fits = added * 1000 <= house.metric * 5
    return stage.answer === 1 ? late : fits
  }
  return true
}

/** The capture cost of the best set of molds other than `best`: the runner-up of GAMES.md §3.2's band. */
function runnerUp(table: Parameters<typeof captureCost>[0], ladder: readonly number[], batches: readonly number[], molds: number, best: readonly number[]): number {
  const key = best.join(',')
  let least = Number.POSITIVE_INFINITY
  const walk = (from: number, chosen: number[]) => {
    if (chosen.length > 0 && chosen.join(',') !== key) least = Math.min(least, captureCost(table, chosen, batches))
    if (chosen.length === molds) return
    for (let i = from; i < ladder.length; i++) walk(i + 1, [...chosen, ladder[i]])
  }
  walk(0, [])
  return least
}

/** Whether `seed` makes level `id` a fair question: every stage is in band. */
export function inFullBand(id: string, seed: Seed): boolean {
  return buildFullLevel(id, seed).stages.every(stageInBand)
}

/** The titles of the levels, for the registry's record and its test. */
export const fullLevelTitle = (id: FullLevelId): string => DEFS[id].title
