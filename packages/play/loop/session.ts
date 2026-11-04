/**
 * Service's session (`loop`): the pure rules of the front-page run, in the shape every game follows (GAMES.md §2.5, §3
 * "Simulation API"; D-043).
 *
 * The visitor hangs tickets on the rail by hand, refills a clip when a ticket ends (continuous batching) and turns on overlap
 * (async scheduling). The world is the sim's step loop on its synthetic tick card, so a screen prints ticks and says synthetic
 * (D-048). The levels and their bands are levels.ts; the loop played by hand is engine.ts; this file is the contract around them:
 *   level, inBand, init, ask, reduce, view, done, score, ghost, grade, debrief.
 *
 * The reference ("the house") hangs every free clip first come first served and turns overlap on where the level has the switch.
 * It is the ghost: only the debrief and the grade read it, and on `first-4-par` its clock is par, the target the visitor sees.
 */
import type { Seed } from '@es/sim/core'
import type { Debrief, Grade, Session } from '../types'
import { askOf, avoidableEmpties, canHang, countersOf, hang, houseTurn, hungCount, initState, levelDone, measured, onLine, runToDecision, setBatching, setOverlap, step } from './engine'
import { LEVEL_IDS, PASS_SCORE, buildLevel, inLevelBand } from './levels'
import type { ClipView, FireView, LoopAction, LoopAsk, LoopCounters, LoopLevel, LoopLevelId, LoopState, LoopView, PlaceOutcome, PlaceView } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The contract                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The level `id` on `seed`. Throws for a level Service does not have. */
export const loopLevel = (id: string, seed: Seed): LoopLevel => buildLevel(id, seed)

/** The level's first state. */
export const loopInit = (level: LoopLevel): LoopState => initState(level)

const isLevelId = (id: string): id is LoopLevelId => (LEVEL_IDS as readonly string[]).includes(id)

/**
 * Whether a seed makes the level a fair question (GAMES.md §3.1, "Band for `first-4-par`"; §3.2). For beats 1 to 3 the house's
 * opening must also leave the level open, so that the visitor has something to do.
 */
export function loopInBand(id: string, seed: Seed): boolean {
  if (!isLevelId(id)) throw new RangeError(`Service has no level "${id}"`)
  if (!inLevelBand(id, seed)) return false
  return id === 'first-4-par' || !levelDone(initState(buildLevel(id, seed)))
}

/** Applies one action. Throws on an illegal one: a ticket that is not waiting, a taken clip, a switch the level does not have. */
export function loopReduce(s: LoopState, a: LoopAction): LoopState {
  switch (a.t) {
    case 'admit':
      return hang(s, a.req, a.slot)
    case 'run':
      if (a.until === 'step') return step(s)
      if (a.until === 'decision') return runToDecision(s)
      throw new RangeError(`run until "step" or "decision", not ${JSON.stringify(a.until)}`)
    case 'lever':
      if (a.name === 'async') {
        if (typeof a.value !== 'boolean') throw new RangeError('the async lever is on or off')
        return setOverlap(s, a.value)
      }
      if (a.name === 'batching') {
        if (a.value !== 'static' && a.value !== 'continuous') throw new RangeError('the batching lever is "static" or "continuous"')
        return setBatching(s, a.value)
      }
      throw new RangeError(`Service has no lever "${String(a.name)}"`)
    default:
      throw new RangeError(`Service has no action "${String((a as { t?: unknown }).t)}"`)
  }
}

/**
 * The reference run to the end: from the level's first state, overlap on where the level has the switch, then the house's turn until
 * the level is over (GAMES.md §3, `loopGhost`: "refill every free slot first come first served, overlap on").
 */
export function loopGhost(level: LoopLevel): LoopState {
  let state = initState(level)
  if (level.overlap === 'free') state = setOverlap(state, true)
  while (!levelDone(state)) state = houseTurn(state)
  return state
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The view                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** What the 2D view, the mirror and the scene draw. A course on the line is drawn as a plate until it is read back. */
export function loopView(s: LoopState): LoopView {
  const sim = measured(s)
  const stats = sim.steps
  const place = (req: number | null, outcome: PlaceOutcome): PlaceView =>
    outcome === 'empty' || req === null ? { state: 'empty', req: null } : { state: outcome === 'binned' ? 'binned' : 'plate', req }
  const fires: FireView[] = s.fires.map((fire, index) => {
    const forward = fire.record.forward
    if (forward === null) throw new Error('internal: a fire with no forward')
    return {
      index,
      startUs: forward.startUs,
      endUs: forward.endUs,
      places: fire.clips.map((req, clip) => place(req, fire.outcome[clip])),
      admits: fire.fresh.filter(Boolean).length,
      bubbleUs: stats[index].bubbleUs,
      ghosts: stats[index].ghostSeqs,
      onLine: index >= s.reads,
    }
  })
  const clip = (req: number | null, fresh: boolean): ClipView => ({ req, fresh })
  const oldest = onLine(s) > 0 ? s.fires[s.reads] : null
  const last = fires[fires.length - 1]
  const before = fires[fires.length - 2]
  const done = levelDone(s)
  const counters = countersOf(s, sim)
  return {
    level: s.level.id,
    title: s.level.title,
    prompt: s.level.prompt,
    synthetic: true,
    slots: s.level.slots,
    clockUs: counters.clockUs,
    step: s.fires.length,
    overlap: s.overlap,
    overlapAvailable: s.level.overlap === 'free',
    batching: s.batching,
    deciding: askOf(s) !== null,
    canHang: !done && s.waiting.length > 0 && s.tray.includes(null) && canHang(s),
    canFire: !done && (hungCount(s) > 0 || onLine(s) > 0),
    done,
    waiting: s.waiting,
    rail: s.tray.map((req) => clip(req, req !== null && !s.prefilled[req])),
    firedRail: oldest === null ? null : oldest.clips.map((req, i) => clip(req, oldest.fresh[i])),
    cpu: s.cpu,
    gpu: s.gpu,
    fires,
    counters,
    par: s.level.par,
    stepTicks: last !== undefined && before !== undefined ? last.startUs - before.startUs : null,
    lineLit: s.gpu.some((span) => span.startUs <= s.cpuT && s.cpuT < span.endUs),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grade and debrief                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** `mine ÷ house`, capped at 1 where more is better; 1 when the house has nothing to count. */
const share = (mine: number, house: number): number => (house <= 0 ? 1 : Math.min(1, mine / house))

/** Rows in the fire at `index`: the places the line cooked a course in. */
const rowsAt = (s: LoopState, index: number): number => s.fires[index]?.record.seqs ?? 0

/**
 * The visitor's run against the house's, as a count on the model's clock (GAMES.md §1 rule 3, §2.1: `min(1, mine ÷ ghost)` where
 * more is better, `min(1, ghost ÷ mine)` for a cost). Each level scores what its beat is about, so that the one thing the beat asks
 * of the visitor moves the score a long way:
 *   first-1-fill        the places filled in the first fire: a fire costs the line the same with one ticket as with four;
 *   first-2-slot        the places filled in the fire that follows the first ticket's end: refilling the clip, or not;
 *   first-3-gap         the dark ticks the line sat through, house over mine: overlap closes them;
 *   first-4-par         the clock, par over mine: every ticket served, and the faster the better.
 * The bar is a tenth below the house's [estimated]. Credit's real bars are ASSESSMENT.md's, and a front-page run earns none (D-038).
 */
export function loopGrade(mine: LoopState, ghost: LoopState): Grade {
  let score: number
  switch (mine.level.goal) {
    case 'first-fire':
      score = share(rowsAt(mine, 0), rowsAt(ghost, 0))
      break
    case 'first-stop-handled':
      score = mine.firstStopAt === null || ghost.firstStopAt === null ? 0 : share(rowsAt(mine, mine.firstStopAt), rowsAt(ghost, ghost.firstStopAt))
      break
    case 'first-ghost': {
      const dark = countersOf(mine).bubbleUs
      score = dark === 0 ? 1 : share(countersOf(ghost).bubbleUs, dark)
      break
    }
    case 'all-served':
      score = share(countersOf(ghost).clockUs, countersOf(mine).clockUs)
      break
  }
  return { score, ok: score >= PASS_SCORE }
}

const overlapUsed = (s: LoopState): boolean => s.fires.some((fire) => fire.overlap)

/**
 * The debrief: one sentence that says what the run did, and the lever worth the most (GAMES.md §2.1, the counterfactual form for a
 * configuration). The sentences carry no digit: the counters beside them are Readouts that tag every number.
 *
 * On `first-4-par` the lever is chosen by what the run cost, in ticks of the synthetic clock: each tick the line sat dark while the
 * expo wrote is the cost of leaving overlap off, and each empty place in a fire rung with a ticket waiting is a tick of cooking
 * (a fire is as many ticks as it has places) that a refill would have used.
 */
export function loopDebrief(mine: LoopState, ghost: LoopState): Debrief {
  const level = mine.level
  const grade = loopGrade(mine, ghost)
  const me = countersOf(mine)
  switch (level.id) {
    case 'first-1-fill': {
      const hungInFirst = mine.fires.length > 0 ? mine.fires[0].record.seqs : 0
      return hungInFirst >= level.slots
        ? { sentence: 'Every clip was hung before the bell, so the fire cooked a course for every ticket. A fire costs the line about the same for one ticket as for four, so a full rail is the point: that is batching.', names: null }
        : {
            sentence:
              'Some clips were empty when the bell rang. The line paid for those places and nobody ate them: a fire costs about the same for one ticket as for four, so hang a ticket in every clip you can. That is batching.',
            names: { lever: 'batching' },
          }
    }
    case 'first-2-slot':
      return grade.ok
        ? { sentence: 'You hung the next ticket as soon as the clip opened. Refilling a slot the moment a request ends, at every step, is continuous batching: no clip rides empty while a ticket waits.', names: null }
        : {
            sentence:
              'A clip rode empty while a ticket waited. The line paid for that place and nobody ate it. Hanging the next ticket the moment a clip opens is continuous batching.',
            names: { lever: 'batching' },
          }
    case 'first-3-gap':
      return overlapUsed(mine) && grade.ok
        ? {
            sentence:
              'The next call was written during the fire, so the stations stayed lit. The price is the binned plate: the expo had already fired one more course for a ticket that had asked for the check. That is overlap, vLLM\'s async scheduling.',
            names: null,
          }
        : {
            sentence:
              'The stations went dark between fires while the expo wrote the next call. Writing it during the fire closes the dark stretches, at the price of one binned plate for each ticket that ends. That is overlap, vLLM\'s async scheduling.',
            names: { lever: 'async' },
          }
    case 'first-4-par': {
      // The house hangs every clip the moment it opens and writes every call during the fire, and a ticket's number cannot change the
      // night, so no run beats par: the best a visitor does is match it.
      if (grade.ok) {
        return {
          sentence:
            'You served the night at par or close to it: refilling kept every clip live and overlap wrote each call during the fire, at the price of one binned plate for each ticket that ended.',
          names: null,
        }
      }
      const darkTicks = me.bubbleUs
      const emptyTicks = avoidableEmpties(mine)
      if (darkTicks >= emptyTicks && darkTicks > 0) {
        return {
          sentence:
            'The stations sat dark while the expo wrote each call after the last fire ended. Writing the next call during the fire (overlap, async scheduling) is what par does, at the price of one binned plate for each ticket that ends.',
          names: { lever: 'async' },
        }
      }
      if (emptyTicks > 0) {
        return {
          sentence:
            'Clips rode empty while tickets waited, and the line paid for every empty place. Refilling a slot the moment a request ends (continuous batching) is what par does.',
          names: { lever: 'batching' },
        }
      }
      return { sentence: 'The night ran longer than par. The counters beside this say where the line sat dark and where a clip rode empty.', names: null }
    }
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The session                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export const loopSession: Session<LoopLevel, LoopState, LoopAction, LoopView, LoopCounters, LoopAsk> = {
  level: loopLevel,
  inBand: loopInBand,
  init: loopInit,
  ask: askOf,
  reduce: loopReduce,
  view: loopView,
  done: levelDone,
  score: countersOf,
  ghost: loopGhost,
  grade: loopGrade,
  debrief: loopDebrief,
}
