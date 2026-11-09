/**
 * The full service's session (`loop`'s TR2 levels and TR6's mask lane; GAMES.md §2.5, §3.2): the contract around levels.ts and
 * night.ts, in the shape every game follows: level, inBand, init, ask, reduce, view, done, score, ghost, grade, debrief.
 *
 * A stage is played in order: commit the prediction, set the levers, ring the bell through a night the sim serves with them, and read
 * the tape. A night that meets the bar (the house's night, within its slack) closes the stage; so does a third night served [estimated],
 * so a learner who has not found the lever still reaches the debrief, which names it. The level is over when every stage is closed.
 *
 * The house is the ghost: it commits the model's own answer and serves each stage once with the intended levers. Only the debrief and
 * the grade read it.
 */
import type { Seed } from '@es/sim/core'
import type { GraphModeId } from '@es/sim/steploop'
import { GRAPH_MODES, gpuLayers } from '@es/sim/steploop'
import type { Debrief, Grade, Session } from '../../types'
import type { ClipView } from '../types'
import { closeCards, differing, leverWorth, meetsThroughput, throughputPermille, verdictOf } from './close'
import { buildFullLevel, FULL_LEVEL_IDS, inFullBand, MODES } from './levels'
import { CARDS, graphBytes, nightAt, nightOf, resolvedMode, servingMode } from './night'
import type { Night } from './night'
import type { FullAction, FullAsk, FullCounters, FullLevel, FullState, FullView, LeverName, Levers, Served, StageState, StageView, StageWorld } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the state                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

const isFull = (id: string): boolean => (FULL_LEVEL_IDS as readonly string[]).includes(id)

/** A night meets the bar when its metric is at most the house's times (1000 + slack) / 1000, in integers. */
export const meetsBar = (stage: StageWorld, metric: number): boolean => metric * 1000 <= stage.houseMetric * (1000 + stage.slackPermille)

/**
 * Whether a night meets its stage's bar: the clock within the house's slack for the practice stages, and for `close` ASSESSMENT §4.3's: no
 * dependency violation, and useful tokens per GPU-ms at least 97% of the house's.
 */
export const nightMeetsBar = (stage: StageWorld, night: Pick<Night, 'metric' | 'usefulTokens' | 'violations'>): boolean =>
  stage.bar === 'throughput' ? meetsThroughput(stage, night.usefulTokens, night.metric, night.violations) : meetsBar(stage, night.metric)

/** A stage is over once a night has met the bar, or once it has served its nights (three, or the one of a graded stage). */
export const stageClosed = (world: Pick<StageWorld, 'nights'>, s: StageState): boolean => s.served.some((night) => night.ok) || s.served.length >= world.nights

export const fullDone = (s: FullState): boolean => s.stages.every((stage, i) => stageClosed(s.level.stages[i], stage))

/** The night on the pass and how far it has been rung, or null before its first ring. */
function shownNight(world: StageWorld, stage: StageState): { night: Night; fires: number; levers: Levers } | null {
  if (stage.night === null) return null
  const night = nightOf(world, stage.night.levers)
  return night === null ? null : { night, fires: stage.night.fires, levers: stage.night.levers }
}

/** The pending decision: the current stage's prediction, then its levers before each night. Null while a night is on the pass. */
export function fullAsk(s: FullState): FullAsk | null {
  if (fullDone(s)) return null
  const stage = s.stages[s.at]
  const world = s.level.stages[s.at]
  if (stageClosed(world, stage)) return null
  if (stage.prediction === null) return { kind: 'predict', stage: world.id }
  const shown = shownNight(world, stage)
  return shown === null || shown.fires >= shown.night.fires.length ? { kind: 'serve', stage: world.id } : null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The contract                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export const fullLevel = (id: string, seed: Seed): FullLevel => buildFullLevel(id, seed)

export function fullInBand(id: string, seed: Seed): boolean {
  if (!isFull(id)) throw new RangeError(`the full service has no level "${id}"`)
  return inFullBand(id, seed)
}

export function fullInit(level: FullLevel): FullState {
  return { level, at: 0, stages: level.stages.map((world) => ({ levers: world.start, prediction: null, night: null, served: [] })) }
}

/** The current stage's state, replaced. */
function withStage(s: FullState, change: (stage: StageState, world: StageWorld) => StageState): FullState {
  const stages = s.stages.slice()
  stages[s.at] = change(s.stages[s.at], s.level.stages[s.at])
  return { ...s, stages }
}

const LEVER_OF: Readonly<Record<string, LeverName>> = { async: 'async', inputIds: 'inputIds', graphMode: 'graphMode', runner: 'runner', maskOverlap: 'maskOverlap' }

/** Sets a lever. A night that is still being served is put aside, so the next ring serves anew with the levers as they are. */
function setLever(stage: StageState, world: StageWorld, name: string, value: unknown): StageState {
  const lever = LEVER_OF[name]
  if (lever === undefined || !world.levers.includes(lever)) throw new RangeError(`the ${world.id} stage has no lever "${name}"`)
  let levers: Levers
  if (name === 'graphMode') {
    if (typeof value !== 'string' || !(value in GRAPH_MODES)) throw new RangeError(`the graph mode is one of ${MODES.join(', ')}`)
    levers = { ...stage.levers, graphMode: value as GraphModeId }
  } else if (name === 'runner') {
    if (value !== 'mrv2' && value !== 'v1') throw new RangeError('the runner is "mrv2" or "v1"')
    levers = { ...stage.levers, runner: value }
  } else if (name === 'inputIds') {
    if (value !== 'device' && value !== 'host') throw new RangeError('the input ids come from the "device" or the "host"')
    levers = { ...stage.levers, inputIds: value }
  } else {
    if (typeof value !== 'boolean') throw new RangeError(`the ${name} lever is on or off`)
    levers = name === 'async' ? { ...stage.levers, async: value } : { ...stage.levers, maskOverlap: value }
  }
  return { ...stage, levers, night: midNight(world, stage) ? null : stage.night }
}

/** A night is on the pass and not over. */
function midNight(world: StageWorld, stage: StageState): boolean {
  const shown = shownNight(world, stage)
  return shown !== null && shown.fires < shown.night.fires.length
}

function setCapture(stage: StageState, world: StageWorld, sizes: readonly number[]): StageState {
  // The mold rack of `graphs` · `sizes` holds a few molds; the ladder of `close` has no cap, because its budget is memory.
  const ladder = world.ladder ?? world.sizes?.ladder ?? null
  if (!world.levers.includes('capture') || ladder === null) throw new RangeError(`the ${world.id} stage has no mold rack`)
  const molds = world.sizes === null ? ladder.length : world.sizes.molds
  if (!Array.isArray(sizes) || sizes.length > molds) throw new RangeError(`the rack holds at most ${molds} molds`)
  sizes.forEach((size, i) => {
    if (!ladder.includes(size)) throw new RangeError(`there is no mold of ${size}`)
    if (i > 0 && size <= sizes[i - 1]) throw new RangeError('the molds stand in ascending order, each once')
  })
  return { ...stage, levers: { ...stage.levers, captureSizes: [...sizes] }, night: midNight(world, stage) ? null : stage.night }
}

function commit(stage: StageState, world: StageWorld, prediction: unknown): StageState {
  if (stage.prediction !== null) throw new RangeError('the prediction is committed already')
  if (typeof prediction !== 'number' || !Number.isSafeInteger(prediction) || prediction < 0) throw new RangeError('a prediction is a whole number of at least 0')
  if (world.prediction.kind === 'choice' && prediction >= world.prediction.options.length) throw new RangeError(`there are ${world.prediction.options.length} choices`)
  return { ...stage, prediction }
}

/** Rings the bell: the next fire of the night on the pass, or of a new night; `decision` rings to its end. */
function ring(stage: StageState, world: StageWorld, until: 'step' | 'decision'): StageState {
  if (until !== 'step' && until !== 'decision') throw new RangeError(`run until "step" or "decision", not ${JSON.stringify(until)}`)
  if (stageClosed(world, stage)) throw new RangeError('this stage is over')
  if (stage.prediction === null) throw new RangeError('commit the prediction before the first night')
  const shown = shownNight(world, stage)
  const fresh = shown === null || shown.fires >= shown.night.fires.length
  const levers = fresh ? stage.levers : shown.levers
  const night = fresh ? nightOf(world, levers) : shown.night
  if (night === null) {
    // A closed-book stage serves a configuration the engine would not start as a night that failed (ASSESSMENT §4.3): the learner is not told
    // beforehand, and the night is the one night. The practice stages refuse the ring, and the panel says why.
    if (!world.sealed) throw new RangeError('this mode does not serve tonight: the backend cannot run it, or its routines leave the night no room')
    const refused: Served = { levers, metric: 0, ok: false, tokens: 0, violations: 0, refused: true }
    return { ...stage, night: { levers, fires: 0 }, served: [...stage.served, refused] }
  }
  const before = fresh ? 0 : shown!.fires
  // A closed-book stage serves its whole night at one ring: there is no fire to read before the verdict.
  const fires = until === 'decision' || world.sealed ? night.fires.length : before + 1
  const next: StageState = { ...stage, night: { levers, fires } }
  if (fires < night.fires.length) return next
  const served: Served = {
    levers,
    metric: night.metric,
    ok: nightMeetsBar(world, night),
    ...(world.bar === 'throughput' ? { tokens: night.usefulTokens, violations: night.violations } : {}),
  }
  return { ...next, served: [...stage.served, served] }
}

export function fullReduce(s: FullState, a: FullAction): FullState {
  switch (a.t) {
    case 'commit':
      return withStage(s, (stage, world) => commit(stage, world, a.prediction))
    case 'lever':
      return withStage(s, (stage, world) => setLever(stage, world, a.name, a.value))
    case 'capture':
      return withStage(s, (stage, world) => setCapture(stage, world, a.sizes))
    case 'run':
      return withStage(s, (stage, world) => ring(stage, world, a.until))
    case 'stage': {
      const at = s.level.stages.findIndex((world) => world.id === a.to)
      if (at < 0) throw new RangeError(`the level has no stage "${String(a.to)}"`)
      return { ...s, at }
    }
    default:
      throw new RangeError(`the full service has no action "${String((a as { t?: unknown }).t)}"`)
  }
}

/** The house: every stage, its answer committed, served once with the intended levers. */
export function fullGhost(level: FullLevel): FullState {
  let state = fullInit(level)
  level.stages.forEach((world, at) => {
    state = { ...state, at }
    state = fullReduce(state, { t: 'commit', prediction: world.answer })
    state = withStage(state, (stage) => ({ ...stage, levers: world.house }))
    state = fullReduce(state, { t: 'run', until: 'decision' })
  })
  return { ...state, at: 0 }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grade and debrief                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A stage's best night against the house's: the house's metric over the best served, capped at 1; 0 before a night is served. */
export function stageScore(world: StageWorld, stage: StageState): number {
  if (stage.served.length === 0) return 0
  if (world.bar === 'throughput') {
    // Useful tokens per GPU-ms against the house's, capped at 1; a night that broke the dependency or never started scores 0 (ASSESSMENT §4.3).
    const best = Math.max(...stage.served.map((night) => throughputPermille(world, night.tokens ?? 0, night.metric, night.violations ?? 0)))
    return Math.min(1000, best) / 1000
  }
  const best = Math.min(...stage.served.map((night) => night.metric))
  return best <= 0 ? 1 : Math.min(1, world.houseMetric / best)
}

/**
 * The run against the house's (GAMES.md §2.1, `min(1, ghost ÷ mine)` for a cost): each stage scores its best night, the level scores
 * its weakest stage, and it passes when every stage served a night that met its bar. A prediction is shown against the model's answer
 * and does not move the grade on these practice levels; the graded levels are W1-T14's (`close`) and W1-T30's (`mask`).
 */
export function fullGrade(mine: FullState): Grade {
  const scores = mine.level.stages.map((world, i) => stageScore(world, mine.stages[i]))
  return { score: Math.min(...scores), ok: mine.stages.every((stage) => stage.served.some((night) => night.ok)) }
}

/** Whether a prediction is close to the model's answer: a choice exactly, a number within its tolerance (and 10 µs) [estimated]. */
export function predictionClose(world: StageWorld, predicted: number): boolean {
  const p = world.prediction
  if (p.kind === 'choice') return predicted === world.answer
  const slack = Math.floor((world.answer * p.tolerancePermille) / 1000) + (p.unit === 'µs' ? 10 : 0)
  return Math.abs(predicted - world.answer) <= slack
}

/** What each lever is, with the engine's term first, for the debrief's sentence (GAMES.md §2.6, rule 2). */
const LEVER_WORDS: Readonly<Record<LeverName, string>> = {
  async: 'async scheduling: writing the next call during the fire',
  inputIds: 'the next call\'s input ids: filled by the line from the tokens it sampled, or written by the expo',
  graphMode: 'the CUDA-graph mode: the routines drilled, and how much of each fire one word starts',
  capture: 'the capture sizes: the molds on the rack',
  runner: 'the model runner: MRV2 prepares the inputs on the GPU',
  maskOverlap: 'the mask overlap: writing the allergy card while the line cooks',
}

const SUMMARIES: Readonly<Record<string, string>> = {
  async: 'With the next call written during the fire, the expo\'s work hides under the line\'s, so the dark stretches close; the price is one binned course for each ticket that ends. That is vLLM\'s async scheduling, on by default at the pin.',
  graphs:
    'A drilled routine fires a whole fire with one word, where calling each dish takes a call per kernel; a fire drops into the smallest mold that holds it, its empty places are padding, and the mode you ask for runs only as far as the backend supports it.',
  mrv2: 'The V2 runner prepares each fire\'s inputs on the GPU, so the expo writes less: the gain is large where the fire is short, and nearly nothing where the forward already hides the host\'s work.',
  mask: 'The engine thread writes the allergy card after it launches the fire, so the card hides under the line\'s cooking when it is shorter than the fire; a heavy grammar outlasts the fire, and then the line waits for it.',
  close:
    'The bubbles close when the expo\'s work for the next fire hides under the line\'s: async scheduling writes it during the fire, which needs the ids to come from the line, MRV2 shortens it, and a drilled routine for the rail and for the biggest fire replaces a call for each kernel. Every routine takes memory out of the reach-in before its pans are counted, so drill only the molds the night uses.',
}

/**
 * The debrief: one sentence on what the run did and the lever worth the most (GAMES.md §2.1, the counterfactual form). The first stage
 * that no night passed names its lever: the one lever that, set to the house's value, serves that stage's night at the bar.
 */
export function fullDebrief(mine: FullState): Debrief {
  const level = mine.level
  const missed = level.stages.findIndex((_, i) => !mine.stages[i].served.some((night) => night.ok))
  if (missed < 0) return { sentence: SUMMARIES[level.id], names: null }
  const world = level.stages[missed]
  if (world.bar === 'throughput') return gradedDebrief(world, mine.stages[missed])
  const lever = world.levers[0]
  return {
    sentence: `${world.title}: no night met the bar, which is the house's night within its margin. ${SUMMARIES[level.id]}`,
    names: { lever },
  }
}

/**
 * The debrief of a graded stage (`close`): what the night came to against ASSESSMENT §4.3's bar in words, and the lever worth the most from
 * the learner's configuration (GAMES.md §2.1): the one that, set alone to the house's value, serves the most tokens for each ms. A stage the
 * learner never served names the lever the naive configuration gets most wrong. The sentence carries no digit: the verdict's figures are
 * Readouts with their tags, beside it.
 */
function gradedDebrief(world: StageWorld, stage: StageState): Debrief {
  const last = stage.served[stage.served.length - 1]
  const mine = last?.levers ?? world.naive
  const worth = leverWorth(world, mine)
  const best = worth.reduce((a, b) => (b.gain > a.gain ? b : a))
  const differs = differing(world, mine)
  // The lever worth the most; where no single swap helps (two things are wrong at once), the first lever that differs from the house's. Async
  // scheduling is weighed with the ids it needs, and named alone when only the ids differ: the switch that was right is not the one to blame.
  const named = best.gain > 0 ? best.lever : (differs[0] ?? best.lever)
  const lever: LeverName = named === 'async' && mine.async === world.house.async && mine.inputIds !== world.house.inputIds ? 'inputIds' : named
  const verdict = last === undefined ? null : verdictOf(world, last, last.refused === true ? (servingMode(world, mine).changes.at(-1) ?? null) : null)
  const why =
    verdict === null
      ? 'No night was served.'
      : verdict.kind === 'refused'
        ? `The engine would not start: ${verdict.reason ?? 'the routines took more memory than the reach-in could spare'}. A configuration that does not start serves nothing.`
        : verdict.kind === 'violation'
          ? 'A fire read a token before it was sampled: the expo wrote the next call while the last fire was still on the line, and with the ids written by hand the call needed a token that did not exist yet. A night that breaks the dependency scores nothing.'
          : 'Your night served fewer tokens for each ms than the bar allows against the house\'s.'
  return { sentence: `${world.title}: ${why} ${SUMMARIES.close}`, names: { lever } }
}

/** The lever's words for a screen. */
export const leverWords = (lever: LeverName): string => LEVER_WORDS[lever]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The view                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const emptyCounters: FullCounters = {
  usefulTokens: 0,
  ghostTokens: 0,
  paddedTokens: 0,
  gpuBusyUs: 0,
  bubbleUs: 0,
  bubbles: 0,
  launches: 0,
  eagerSteps: 0,
  clockUs: 0,
  emptyClipSteps: 0,
  captureUs: 0,
  maskUs: 0,
  tpotP50Us: null,
}

function stageView(world: StageWorld, stage: StageState): StageView {
  const closed = stageClosed(world, stage)
  // A closed-book stage keeps the mode a lever resolves to, and the memory the routines take, to itself until the night is served.
  const reveal = !world.sealed || closed
  const last = stage.served[stage.served.length - 1]
  const verdict = world.bar !== 'throughput' || last === undefined ? null : verdictOf(world, last, last.refused === true ? (servingMode(world, last.levers).changes.at(-1) ?? null) : null)
  return {
    id: world.id,
    title: world.title,
    prompt: world.prompt,
    card: world.card,
    levers: world.levers,
    prediction: world.prediction,
    predicted: stage.prediction,
    answer: stage.served.length > 0 ? world.answer : null,
    served: stage.served,
    closed,
    passed: stage.served.some((night) => night.ok),
    houseMetric: world.houseMetric,
    metric: world.metric,
    slackPermille: world.slackPermille,
    resolved: reveal ? servingMode(world, stage.levers) : { mode: stage.levers.graphMode, changes: [] },
    memory: world.graphBudget === null || !reveal ? null : { bytes: graphBytes(world, stage.levers, resolvedMode(world.support, stage.levers).mode ?? 'NONE'), budget: world.graphBudget },
    support: world.support,
    sizes: world.sizes,
    maskRowUs: world.maskRowUs,
    sealed: world.sealed,
    ladder: world.ladder ?? world.sizes?.ladder ?? null,
    nights: world.nights,
    verdict,
    cards: world.sealed ? closeCards(world) : null,
  }
}

/** What the 2D view, the 3D scene, the mirror and the tape all draw. */
export function fullView(s: FullState): FullView {
  const world = s.level.stages[s.at]
  const stage = s.stages[s.at]
  const card = CARDS[world.card]
  const shown = shownNight(world, stage)
  const done = fullDone(s)
  const at = shown === null ? null : nightAt(shown.night, shown.fires, shown.levers, world.slots)
  const emptyRail: ClipView[] = Array.from({ length: world.slots }, () => ({ req: null, fresh: false }))
  const requests = shown?.night.requests ?? world.requests
  const latest = at?.fires[at.fires.length - 1]
  const levers = shown?.levers ?? stage.levers
  const refused = servingMode(world, stage.levers).mode === null
  const over = at?.over ?? false
  const ask = fullAsk(s)
  return {
    level: s.level.id,
    title: s.level.title,
    prompt: s.level.prompt,
    slots: world.slots,
    unit: 'µs',
    synthetic: card.synthetic,
    tag: card.tag === 'derived' ? 'derived' : 'estimated',
    cardLabel: card.label,
    at: s.at,
    stage: stageView(world, stage),
    stages: s.level.stages.map((w, i) => ({
      id: w.id,
      title: w.title,
      closed: stageClosed(w, s.stages[i]),
      passed: s.stages[i].served.some((night) => night.ok),
      served: s.stages[i].served,
      predicted: s.stages[i].prediction,
      // Compose's policy: the levers of the stage's last night, or its panel's before any.
      levers: s.stages[i].served[s.stages[i].served.length - 1]?.levers ?? s.stages[i].levers,
    })),
    levers: stage.levers,
    nightLevers: shown?.levers ?? null,
    nightOver: over,
    nightFires: shown?.night.fires.length ?? null,
    overlapAvailable: levers.async,
    done,
    deciding: ask !== null,
    // A closed-book stage rings whatever is set: a configuration the engine would not start is a night that failed, and nobody is told beforehand.
    canFire: !done && !stageClosed(world, stage) && stage.prediction !== null && !(!world.sealed && refused && (shown === null || over)),
    clockUs: at?.kitchen.clockUs ?? 0,
    step: at?.kitchen.step ?? 0,
    waiting: at?.kitchen.waiting ?? Array.from({ length: requests }, (_, i) => i),
    rail: at?.kitchen.rail ?? emptyRail,
    firedRail: at?.kitchen.firedRail ?? null,
    cpu: at?.kitchen.cpu ?? [],
    gpu: at?.kitchen.gpu ?? [],
    fires: at?.fires ?? [],
    counters: at?.counters ?? emptyCounters,
    comb: latest === undefined ? null : { layers: layersOf(world), calls: latest.calls, perLayer: latest.mode === 'FULL' ? 0 : Math.round(latest.calls / layersOf(world)), mode: latest.mode },
    rack: levers.graphMode === 'NONE' ? null : { sizes: levers.captureSizes, picked: latest === undefined || latest.mold === null ? null : nearestIndex(levers.captureSizes, latest.mold) },
    allergy: world.structuredPermille > 0 ? { overlap: levers.maskOverlap, fillUs: latest?.maskUs ?? 0, late: latest !== undefined && latest.bubbleUs > 0 && (latest.maskUs ?? 0) > 0 } : null,
    lineLit: at?.lineLit ?? false,
    stepUs: at?.stepUs ?? null,
  }
}

/** The layers of the card's model: the comb has a tooth for each. */
const layersOf = (world: StageWorld): number => gpuLayers(CARDS[world.card])

/** The index of a mold among the sizes (the dispatcher's pick); the sizes hold it exactly when a graph replayed. */
function nearestIndex(sizes: readonly number[], mold: number): number | null {
  const at = sizes.indexOf(mold)
  return at < 0 ? null : at
}

/** The counts so far (GAMES.md §1, rule 3): never the learner's speed. */
export const fullScore = (s: FullState): FullCounters => fullView(s).counters

export const fullSession: Session<FullLevel, FullState, FullAction, FullView, FullCounters, FullAsk> = {
  level: fullLevel,
  inBand: fullInBand,
  init: fullInit,
  ask: fullAsk,
  reduce: fullReduce,
  view: fullView,
  done: fullDone,
  score: fullScore,
  ghost: fullGhost,
  grade: (mine) => fullGrade(mine),
  debrief: (mine) => fullDebrief(mine),
}
