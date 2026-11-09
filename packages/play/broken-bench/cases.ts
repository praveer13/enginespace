/**
 * A case, built (GAMES.md §11 "Cases"): the scene a learner sees and the truth the court recomputes, for one seed and one flaw.
 *
 * The corpus draws the case and says whether it keeps the band (`brokenBenchCase`, W1-T32). About one seed in 3,000 is flagged because
 * no draw of the benchmark's own randomness kept the band, and GAMES.md §2.1 says what a session does then: it redraws from another
 * seed. That is done here, from a stream of the case's own seed, so a flagged seed is still a fair question and always the same one.
 * `inBand` therefore has nothing left to decide (session.ts), and a level never deals a case that fails the corpus's band.
 *
 * Building a case costs about 30 ms, and a replay builds the same cases again (an undo, a regrade), so a case is kept for as long as it is
 * likely to be wanted. The memory is a cache of a pure function: it never changes what a case is.
 */
import { divRound, rngFor } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { brokenBenchCase, correctBench, correctedInterval } from '@es/sim/bench/broken'
import { inFlightPeak } from '@es/sim/bench/broken-kits'
import type { BrokenCase, BrokenCorrection } from '@es/sim/bench/broken-types'
import { arrivalAdherence, perSMilli } from '@es/sim/bench/stats'
import type { BootstrapInterval } from '@es/sim/bench/types'
import { intervalScoreMilli } from './logscore'
import type { CaseSlot, Facts, SceneView } from './types'

/** Redraws a flagged seed may take before the level gives up. Each redraw is from another seed, and the first that keeps the band is used. */
export const REDRAWS = 8

/** How many built cases are kept. A court is five; an undo and a regrade ask for the same ones again. */
const KEPT = 24

/** What the court knows about a case: the recomputed number, the court's own interval, and the interval's score against the number. */
export interface Truth {
  readonly correction: BrokenCorrection
  readonly interval: BootstrapInterval
  readonly courtScoreMilli: number
}

export interface Built {
  /** The corpus's case, whose flaw and answer the learner does not see until the court has risen. */
  readonly c: BrokenCase
  /** The seed the case finally rests on: the slot's own unless the corpus flagged it and the case was redrawn. */
  readonly seed: Seed
  readonly scene: SceneView
  readonly truth: Truth
}

const kept = new Map<string, Built>()

/** The case that keeps the band for a slot: the slot's own seed, else the first redraw that does. */
function banded(slot: CaseSlot): { c: BrokenCase; seed: Seed } {
  const redraw = rngFor(slot.seed, `broken-bench/redraw/${slot.flaw}`)
  let seed = slot.seed
  for (let tries = 0; tries <= REDRAWS; tries++) {
    const c = brokenBenchCase(seed, { flaw: slot.flaw })
    if (c.band.ok) return { c, seed }
    seed = redraw()
  }
  throw new RangeError(`no draw of ${slot.flaw} on seed ${slot.seed} keeps the corpus's band in ${REDRAWS + 1} tries`)
}

/** The facts anyone can count off a log: nothing here is the corrected number. */
function factsOf(c: BrokenCase): Facts {
  const { rows, setup } = c.scene
  const lateness = arrivalAdherence(rows)
  const last = rows.length - 1
  const firstSent = rows.reduce((least, r) => Math.min(least, r.sentUs), rows[0].sentUs)
  const lastDone = rows.reduce((most, r) => Math.max(most, r.doneUs), 0)
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0)
  return {
    orders: rows.length,
    lateSends: lateness.lateRows,
    maxLateUs: lateness.maxLateUs,
    inFlightPeak: inFlightPeak(rows, 0, lastDone + 1).count,
    clients: setup.arrivals.kind === 'closed' ? setup.arrivals.clients : null,
    finishedPerSMilli: perSMilli(rows.length, Math.max(1, lastDone - firstSent)),
    meanPromptTokens: divRound(sum((r) => r.promptTokens), rows.length),
    meanOutputTokens: divRound(sum((r) => r.outputTokens), rows.length),
    longestOutputTokens: rows.reduce((most, r) => Math.max(most, r.outputTokens), 0),
    lastDueUs: rows[last].dueUs,
  }
}

/** The rows the harness left out of what it measured: those due before the warm-up it declared ended. */
function harnessCutOf(c: BrokenCase): number {
  let cut = 0
  for (const r of c.scene.rows) {
    if (r.dueUs >= c.scene.setup.warmupUs) break
    cut += 1
  }
  return cut
}

function build(slot: CaseSlot): Built {
  const { c, seed } = banded(slot)
  const s = c.scene
  const correction = correctBench(s, c.flaw)
  const interval = correctedInterval(s, c.flaw)
  const gpu = s.server.gpu
  const scene: SceneView = {
    seed,
    claim: s.claim,
    setup: s.setup,
    server: { label: gpu.label, maxNumSeqs: s.server.maxNumSeqs, maxBatchedTokens: s.server.maxBatchedTokens },
    rows: s.rows,
    harnessCut: harnessCutOf(c),
    capacityPerSMilli: s.capacityPerSMilli,
    facts: factsOf(c),
  }
  const courtScoreMilli = intervalScoreMilli(Math.max(1, interval.loUs), Math.max(1, interval.hiUs), Math.max(1, correction.p99Us))
  return { c, seed, scene, truth: { correction, interval, courtScoreMilli } }
}

/** The case a slot deals, built once and kept. */
export function caseOf(slot: CaseSlot): Built {
  const key = `${slot.seed}/${slot.flaw}`
  const known = kept.get(key)
  if (known !== undefined) return known
  const built = build(slot)
  if (kept.size >= KEPT) {
    const oldest = kept.keys().next()
    if (oldest.done !== true) kept.delete(oldest.value)
  }
  kept.set(key, built)
  return built
}
