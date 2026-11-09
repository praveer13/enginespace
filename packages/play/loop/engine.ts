/**
 * Service's engine: the step loop of `packages/sim/steploop`, played by hand (GAMES.md §3, D-043).
 *
 * The sim runs a whole night at once and its scheduler decides who joins each fire. The front page lets the visitor decide: they
 * hang tickets on the rail one at a time, and they ring the bell. So this file is the same loop as `runStepLoop`, cut into the
 * pieces a visitor can press, and each piece calls the sim's own functions:
 *   - what a fire costs on the line comes from the tick card through the sim's `gpuCost` (4 ticks, and 1 more when it admits a
 *     ticket), and the expo's work from the card's host fields (2 ticks to plan, 1 to read);
 *   - where each phase falls in time is the sim's `placeLaunch` and `placeReadback`;
 *   - the summary, the bubbles and the per-fire stats are the sim's `finishRun`, read off the same records.
 * What stays here is only the order the engine core does things in (`step`, below), which `runStepLoop` has as one `while` loop,
 * and the rules a hand adds. tests/play/loop-engine.test.ts plays the house's policy (hang every free clip first come first served)
 * and requires the same lanes, fires and summary that `runStepLoop` gives for the same night, with overlap on and off and with
 * static batching: the visitor's loop is the sim's loop, not a lookalike.
 *
 * The engine core's loop (vllm M7), as `step` plays it:
 *   - with overlap off it is strictly serial: plan, cook, read, then plan the next;
 *   - with overlap on up to two fires are in flight: the next call is planned before the oldest fire is read, so a ticket that ended
 *     in the fire being read is still hung in the fire already planned, and that course is thrown away (a binned plate, a ghost token).
 *
 * Every function takes a state and returns a new one. Nothing here reads a clock or draws a number.
 */
import { TICK_CARD, gpuCost, gpuLayers } from '@es/sim/steploop/cards'
import type { Span, SpanKind } from '@es/sim/steploop'
import { placeLaunch, placeReadback } from '@es/sim/steploop/events'
import { finishRun } from '@es/sim/steploop/metrics'
import type { ReqRecord, StepRecord } from '@es/sim/steploop/metrics'
import type { Us } from '@es/sim/core'
import type { Fire, LoopAsk, LoopCounters, LoopLevel, LoopState, PlaceOutcome } from './types'

/** No sane run rings the bell this many times in one `run until: 'decision'`: it means a loop that cannot end. */
const MAX_FIRES = 10_000

/* ------------------------------------------------------------------------------------------------------------------ */
/* Starting a night                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The night before anything is hung: an empty rail, every ticket waiting, the clocks at 0. A table's appetite is not known yet:
 * `outputTokens` is 0 until the ticket is hung (see `hang`).
 */
export function freshState(level: LoopLevel): LoopState {
  const reqs: ReqRecord[] = level.outputs.map((_, id) => ({ id, dueUs: 0, outputTokens: 0, emitted: 0, ghosts: 0, finished: false, firstUs: null, lastUs: null }))
  return {
    level,
    overlap: false,
    batching: 'continuous',
    tray: Array.from({ length: level.slots }, () => null),
    waiting: reqs.map((req) => req.id),
    reqs,
    prefilled: reqs.map(() => false),
    cpuT: 0,
    gpuT: 0,
    cpu: [],
    gpu: [],
    fires: [],
    reads: 0,
    firstStopAt: null,
  }
}

/**
 * The level's first state: the empty rail, or the rail as the house leaves it after the level's opening. The house rings the
 * opening's fires (it hangs every free clip first come first served, with overlap off), and then hangs the clips that are free for
 * the next one, so the visitor takes over with a full rail and the bell not yet rung.
 */
export function initState(level: LoopLevel): LoopState {
  const fresh = freshState(level)
  const opening = level.opening
  if (opening === null) return fresh
  const played = playHouse(fresh, (s) => s.fires.length >= opening)
  return hangAll(played)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the state                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Fires on the line: rung, and not yet read back. */
export const onLine = (s: LoopState): number => s.fires.length - s.reads

/** Fires the engine core keeps in flight: two with overlap, one without (vllm M7). */
const maxInFlight = (s: LoopState): number => (s.overlap ? 2 : 1)

/** Tickets on the rail, as the expo believes. */
export const hungCount = (s: LoopState): number => s.tray.filter((req) => req !== null).length

/** Whether a ticket may be hung now. Static batching hangs nothing while a ticket that has been fired is still on the rail. */
export const canHang = (s: LoopState): boolean => s.batching !== 'static' || s.tray.every((req) => req === null || !s.prefilled[req])

/** Every ticket is served and every course read back. */
export const allServed = (s: LoopState): boolean => s.reqs.every((req) => req.finished) && onLine(s) === 0

/** Binned plates read back so far. */
export const ghostsRead = (s: LoopState): number => s.reqs.reduce((sum, req) => sum + req.ghosts, 0)

/** Whether the level's goal is met, or the night is over (GAMES.md §3.1). */
export function levelDone(s: LoopState): boolean {
  if (allServed(s)) return true
  switch (s.level.goal) {
    case 'first-fire':
      return s.reads >= 1
    case 'first-stop-handled':
      return s.firstStopAt !== null && s.reads > s.firstStopAt
    case 'first-ghost':
      return ghostsRead(s) >= 1
    case 'all-served':
      return false
  }
}

/** The pending decision: a clip is free, a ticket waits, and the rule lets one be hung. Null when the next fire goes by itself. */
export function askOf(s: LoopState): LoopAsk | null {
  if (levelDone(s) || s.waiting.length === 0 || !canHang(s)) return null
  const free = s.tray.flatMap((req, clip) => (req === null ? [clip] : []))
  return free.length === 0 ? null : { free, waiting: s.waiting }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The pieces a hand presses                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Hang a waiting ticket in `clip`, or in the first free clip. Throws when the rule does not let it.
 *
 * The table's appetite is settled when its ticket is hung: the k-th ticket hung is served by the k-th length of the level's
 * `outputs`, whatever its number. A ticket's number says nothing about how long its table will stay, and the expo cannot see it,
 * so which ticket the visitor taps first cannot change the night. What changes it is when they hang one, and whether they ring
 * the bell with a clip free: the concept, and not the luck of the draw. (The tickets are exchangeable, so drawing each length when
 * its ticket is hung is the same experiment as drawing them all beforehand.) The house hangs in ticket order, so for it the k-th
 * ticket is the k-th request of the sim's workload.
 */
export function hang(s: LoopState, req: number, clip?: number): LoopState {
  if (!s.waiting.includes(req)) throw new RangeError(`ticket ${req} is not waiting`)
  if (!canHang(s)) throw new RangeError('static batching hangs nothing until every clip has cleared')
  let at: number
  if (clip === undefined) {
    at = s.tray.indexOf(null)
    if (at < 0) throw new RangeError('every clip is taken')
  } else {
    if (!Number.isInteger(clip) || clip < 0 || clip >= s.tray.length) throw new RangeError(`there is no clip ${clip}`)
    if (s.tray[clip] !== null) throw new RangeError(`clip ${clip} is taken`)
    at = clip
  }
  const hungBefore = s.level.outputs.length - s.waiting.length
  const reqs = s.reqs.slice()
  reqs[req] = { ...reqs[req], outputTokens: s.level.outputs[hungBefore] }
  return { ...s, reqs, tray: s.tray.map((held, i) => (i === at ? req : held)), waiting: s.waiting.filter((w) => w !== req) }
}

/** Flip the overlap switch. Between fires only, which is when a hand can reach it. */
export function setOverlap(s: LoopState, on: boolean): LoopState {
  if (s.level.overlap === 'locked' && on) throw new RangeError('the overlap switch is not on the panel in this level')
  return { ...s, overlap: on }
}

export function setBatching(s: LoopState, mode: 'continuous' | 'static'): LoopState {
  return { ...s, batching: mode }
}

/** Appends a span to a lane. A span with no length leaves none, and one that starts before the lane's last ended is a bug. */
function pushSpan(lane: readonly Span[], span: Span): Span[] {
  if (span.endUs < span.startUs) throw new Error(`a ${span.kind} span of fire ${span.step} ends before it starts`)
  const last = lane[lane.length - 1]
  if (last !== undefined && span.startUs < last.endUs) throw new Error(`a ${span.kind} span of fire ${span.step} starts before the lane's last span ended`)
  return span.endUs === span.startUs ? [...lane] : [...lane, span]
}

const span = (step: number, kind: SpanKind, startUs: Us, endUs: Us): Span => ({ step, kind, startUs, endUs })

/**
 * Rings the bell on the rail as it hangs: the expo plans the fire, and the line cooks it behind the plan. This is the sim's
 * `launchStep` for a rail that a hand filled: every ticket on the rail gets a place, and a ticket fired for the first time is an
 * admission (its prompt is one more tick of cooking, whatever else the fire carries).
 */
function launch(s: LoopState): LoopState {
  const index = s.fires.length
  const clips = s.tray.slice()
  const rows = clips.flatMap((req, clip) => (req === null ? [] : [clip]))
  if (rows.length === 0) throw new RangeError('nothing is hung on the rail')
  const fresh = clips.map((req) => req !== null && !s.prefilled[req])
  const prefillSeqs = fresh.filter(Boolean).length

  const cost = gpuCost(TICK_CARD, { seqs: rows.length, prefillSeqs, tokens: rows.length, kvTokens: rows.length, attnPairs: rows.length })
  const eagerLaunches = TICK_CARD.kernelsPerLayer * gpuLayers(TICK_CARD)
  const placed = placeLaunch(s.cpuT, s.gpuT, {
    scheduleUs: TICK_CARD.scheduleBaseUs + (cost.hostSeqUs === null ? TICK_CARD.schedulePerSeqUs * rows.length : cost.hostSeqUs),
    prepareUs: TICK_CARD.prepPerTokenUs * rows.length,
    launchUs: TICK_CARD.launchPerKernelUs * eagerLaunches,
    forwardUs: cost.gpuUs,
  })

  let cpu = pushSpan(s.cpu, span(index, 'schedule', s.cpuT, placed.scheduleEnd))
  cpu = pushSpan(cpu, span(index, 'prepare', placed.scheduleEnd, placed.prepareEnd))
  cpu = pushSpan(cpu, span(index, 'launch', placed.prepareEnd, placed.launchEnd))
  const forward = span(index, 'forward', placed.forwardStart, placed.forwardEnd)
  const record: StepRecord = {
    index,
    seqs: rows.length,
    prefillSeqs,
    ghostSeqs: 0,
    tokens: rows.length,
    paddedTokens: rows.length,
    graph: 'off',
    launches: eagerLaunches,
    forward,
  }
  const fire: Fire = {
    record,
    clips,
    fresh,
    outcome: clips.map((req): PlaceOutcome => (req === null ? 'empty' : 'pending')),
    waiting: s.waiting.length,
    overlap: s.overlap,
  }
  return {
    ...s,
    prefilled: s.prefilled.map((was, req) => was || clips.includes(req)),
    cpuT: placed.launchEnd,
    gpuT: placed.forwardEnd,
    cpu,
    gpu: pushSpan(s.gpu, forward),
    fires: [...s.fires, fire],
  }
}

/**
 * Reads the oldest fire on the line back: the expo waits for the line, hears the sampled ids (the sync), and updates its tickets.
 * A ticket whose table asked for the check ends here, and its clip opens. A course fired for a ticket that had already ended
 * is thrown away: a binned plate (the sim's `readBack`).
 */
function readBack(s: LoopState): LoopState {
  const fire = s.fires[s.reads]
  const forward = fire.record.forward
  if (forward === null) throw new Error('internal: a fire with no forward')
  const placed = placeReadback(s.cpuT, forward.endUs, TICK_CARD.syncUs, TICK_CARD.samplePerSeqUs * fire.record.seqs)
  let cpu = pushSpan(s.cpu, span(fire.record.index, 'sync', placed.syncStart, placed.syncEnd))
  cpu = pushSpan(cpu, span(fire.record.index, 'sample', placed.syncEnd, placed.sampleEnd))

  const reqs = s.reqs.slice()
  const outcome = fire.outcome.slice()
  let ghostSeqs = 0
  let ended = false
  fire.clips.forEach((id, clip) => {
    if (id === null) return
    const req = reqs[id]
    if (req.finished) {
      reqs[id] = { ...req, ghosts: req.ghosts + 1 }
      outcome[clip] = 'binned'
      ghostSeqs += 1
      return
    }
    const emitted = req.emitted + 1
    const finished = emitted === req.outputTokens
    reqs[id] = { ...req, emitted, finished, firstUs: req.firstUs ?? placed.sampleEnd, lastUs: placed.sampleEnd }
    outcome[clip] = 'plate'
    if (finished) ended = true
  })

  const fires = s.fires.slice()
  fires[s.reads] = { ...fire, record: { ...fire.record, ghostSeqs }, outcome }
  return {
    ...s,
    reqs,
    tray: ended ? s.tray.map((held) => (held !== null && reqs[held].finished ? null : held)) : s.tray,
    cpu,
    cpuT: placed.sampleEnd,
    fires,
    reads: s.reads + 1,
    firstStopAt: ended && s.firstStopAt === null ? s.reads + 1 : s.firstStopAt,
  }
}

/**
 * With nothing hung and nothing waiting, no decision is left, so the expo reads back what is still on the line. This is the tail of
 * the sim's loop (its engine core reads until nothing is in flight), and it belongs to the action that ended the last ticket.
 */
function settle(s: LoopState): LoopState {
  let state = s
  while (hungCount(state) === 0 && state.waiting.length === 0 && onLine(state) > 0) state = readBack(state)
  return state
}

/**
 * One ring of the bell: the engine core's loop until it next needs a hand (vllm M7; the sim's `while` in `runStepLoop`).
 *   1. A pipeline that is full (it can be, right after the overlap switch went off) is read back first.
 *   2. With something hung, the fire is planned and launched; and when the pipeline is then full, the oldest fire is read back.
 *      With overlap on the first ring only fills the pipeline, and every ring after it also reads one fire.
 *   3. With nothing hung, the expo can only read back what is on the line.
 */
export function step(s: LoopState): LoopState {
  let state = s
  while (onLine(state) >= maxInFlight(state)) state = readBack(state)
  if (hungCount(state) > 0) {
    state = launch(state)
    if (onLine(state) >= maxInFlight(state)) state = readBack(state)
  } else if (onLine(state) > 0) {
    state = readBack(state)
  } else {
    throw new RangeError('nothing is hung on the rail, and nothing is on the line')
  }
  return settle(state)
}

/** Rings the bell until a decision is pending or the level is over, and at least once. */
export function runToDecision(s: LoopState): LoopState {
  let state = step(s)
  for (let rung = 1; !levelDone(state) && askOf(state) === null; rung++) {
    if (rung > MAX_FIRES) throw new RangeError('the bell rang without end')
    state = step(state)
  }
  return state
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The house                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The house's turn, the reference policy (GAMES.md §3, `loopGhost`): hang every free clip with the next ticket in line, first come
 * first served, and ring the bell. It never leaves a clip free while a ticket waits.
 */
export function houseTurn(s: LoopState): LoopState {
  return step(hangAll(s))
}

/** Hangs every free clip with the next ticket in line, first come first served, and does not ring the bell. */
export function hangAll(s: LoopState): LoopState {
  let state = s
  while (askOf(state) !== null) state = hang(state, state.waiting[0])
  return state
}

/** The house plays until `stop` holds or the level is over. */
export function playHouse(s: LoopState, stop: (state: LoopState) => boolean): LoopState {
  let state = s
  for (let turn = 0; !levelDone(state) && !stop(state); turn++) {
    if (turn > MAX_FIRES) throw new RangeError('the house played without end')
    state = houseTurn(state)
  }
  return state
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Counting                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The sim's own measurements of the night so far: the lanes, a stat for each fire, a stat for each ticket and the summary, read by
 * `finishRun` off the records. At the end of a night they equal what `runStepLoop` returns for the same night (the engine's test).
 */
export function measured(s: LoopState) {
  const lanes = { 'cpu-main': s.cpu, 'gpu-stream': s.gpu }
  return { lanes, ...finishRun(s.fires.map((fire) => fire.record), s.reqs, lanes) }
}

/** What `measured` returns. */
export type Measured = ReturnType<typeof measured>

/** The sim's summary of the night so far, with the front page's own count of places the line paid for and nobody ate. */
export function countersOf(s: LoopState, sim: Measured = measured(s)): LoopCounters {
  const { summary } = sim
  return {
    usefulTokens: summary.usefulTokens,
    ghostTokens: summary.ghostTokens,
    paddedTokens: summary.paddedTokens,
    gpuBusyUs: summary.gpuBusyUs,
    bubbleUs: summary.bubbleUs,
    bubbles: summary.bubbles,
    launches: summary.launches,
    // The tick card launches no kernels, and the sim counts every step of a run with no graph as eager: the front page has none to count.
    eagerSteps: 0,
    clockUs: summary.clockUs,
    emptyClipSteps: s.fires.reduce((sum, fire) => sum + (s.level.slots - fire.record.seqs), 0),
  }
}

/** Empty places in fires that were rung with a ticket still waiting: the places a refill would have used. */
export const avoidableEmpties = (s: LoopState): number => s.fires.reduce((sum, fire) => sum + Math.min(s.level.slots - fire.record.seqs, fire.waiting), 0)

