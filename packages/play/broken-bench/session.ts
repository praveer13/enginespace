/**
 * The Inspection's session (`broken-bench`): the pure rules of the health inspector's visit, in the shape every game follows
 * (GAMES.md §2.5, §11 "Simulation API", §2.6 "The Inspection").
 *
 * A level deals one case or five. For each, the learner reads the report and its setup, inspects the stopwatch log, names the one flaw
 * and writes down the corrected p99 with the range they stand behind (`flaw`, `predict`), then files the ruling (`submit`). The court
 * judges a filed case at once against the corpus's recomputed answer (judge.ts), keeps the ruling in the state, and puts the next case
 * on the board. Nothing of a ruling shows while the court sits: the view carries the rulings only once the run is over, because they
 * hold the answers. `view` (the sheet the board shows) is an action too, as GAMES.md §11 has it, so the board, the mirror and a replay
 * all see the same sheet.
 *
 * The cases are the corpus's (cases.ts). A case is its seed and its flaw, so the state stays small, and the rows are rebuilt, the same,
 * wherever the log is replayed. The reference (the ghost) names every flaw and writes the recomputed p99 with the court's own bootstrap
 * interval, so it stands on every case; it is read only by the debrief and the grade.
 *
 *   level, inBand, init, ask, reduce, view, done, score, ghost, grade, debrief
 */
import { assertSeed } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { BENCH_FLAWS } from '@es/sim/bench/broken-types'
import type { Debrief, Grade, Session } from '../types'
import { caseOf } from './cases'
import { FLAW_FACTS } from './flaws'
import { MAX_PREDICTION_US, judge, stands } from './judge'
import { buildLevel, isLevelId } from './levels'
import { TABS } from './types'
import type { BenchAction, BenchAsk, BenchCounts, BenchLevel, BenchState, BenchView, Flaw, Prediction, Ruling, RulingView } from './types'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The contract                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The level `id` on `seed`. Throws for a level the Inspection does not have. */
export const benchLevel = (id: string, seed: Seed): BenchLevel => buildLevel(id, seed)

/**
 * Whether a seed makes the level a fair question. Every seed does: the corpus's band is kept inside the case, which redraws a flagged
 * seed from another one (cases.ts, GAMES.md §2.1), so a level never deals a case that fails it. The share of seeds the corpus flags
 * and the level repairs is measured by tests/play/broken-bench-levels.test.ts.
 */
export function benchInBand(id: string, seed: Seed): boolean {
  if (!isLevelId(id)) throw new RangeError(`the Inspection has no level "${id}"`)
  assertSeed(seed)
  return true
}

const blanks = <T>(count: number): (T | null)[] => Array.from({ length: count }, () => null)

export function benchInit(level: BenchLevel): BenchState {
  const cases = level.slots.length
  return { level, at: 0, picks: blanks<Flaw>(cases), predictions: blanks<Prediction>(cases), rulings: blanks<Ruling>(cases), tab: 'histogram' }
}

export const benchDone = (s: BenchState): boolean => s.at >= s.level.slots.length

export function benchAsk(s: BenchState): BenchAsk | null {
  if (benchDone(s)) return null
  const needs = s.picks[s.at] === null ? 'flaw' : s.predictions[s.at] === null ? 'prediction' : 'filing'
  return { caseNo: s.at + 1, cases: s.level.slots.length, needs }
}

const replaced = <T>(list: readonly T[], at: number, value: T): T[] => list.map((item, i) => (i === at ? value : item))

/** What is wrong with a prediction, in words, or null: positive whole µs that the rest of the court's arithmetic keeps exact, the range holding the p99. */
export function predictionProblem(a: { readonly p99Us: number; readonly loUs: number; readonly hiUs: number }): string | null {
  for (const [name, value] of [['p99', a.p99Us], ['low end', a.loUs], ['high end', a.hiUs]] as const) {
    if (!Number.isSafeInteger(value) || value < 1) return `the ${name} is a whole number of microseconds, at least one`
    if (value > MAX_PREDICTION_US) return `the ${name} is more than eleven days, which is not a latency`
  }
  if (a.loUs > a.p99Us || a.p99Us > a.hiUs) return 'the range must hold the p99 itself, low end to high end'
  return null
}

/** Applies one action. Throws on an illegal one: a flaw the court does not know, a range that does not hold the p99, or a filing with nothing to file. */
export function benchReduce(s: BenchState, a: BenchAction): BenchState {
  if (benchDone(s)) throw new RangeError('the court has risen, so no action can follow')
  switch (a.t) {
    case 'flaw':
      if (!(BENCH_FLAWS as readonly string[]).includes(a.flaw)) throw new RangeError(`the court knows no flaw "${String(a.flaw)}"`)
      return { ...s, picks: replaced(s.picks, s.at, a.flaw) }
    case 'predict': {
      const problem = predictionProblem(a)
      if (problem !== null) throw new RangeError(problem)
      return { ...s, predictions: replaced(s.predictions, s.at, { p99Us: a.p99Us, loUs: a.loUs, hiUs: a.hiUs }) }
    }
    case 'view':
      if (!(TABS as readonly string[]).includes(a.v)) throw new RangeError(`the board has no sheet "${String(a.v)}"`)
      return { ...s, tab: a.v }
    case 'submit': {
      const named = s.picks[s.at]
      const prediction = s.predictions[s.at]
      if (named === null) throw new RangeError('name a flaw before filing the ruling')
      if (prediction === null) throw new RangeError('write down a p99 and its range before filing the ruling')
      const slot = s.level.slots[s.at]
      const { truth } = caseOf(slot)
      const verdict = judge({ p99Us: truth.correction.p99Us, ciLoUs: truth.interval.loUs, ciHiUs: truth.interval.hiUs }, slot.flaw, named, prediction)
      return { ...s, at: s.at + 1, rulings: replaced(s.rulings, s.at, { named, ...verdict }) }
    }
    default:
      throw new RangeError(`the Inspection has no action "${String((a as { t?: unknown }).t)}"`)
  }
}

/** The reference: names every flaw and writes the recomputed p99 with the court's own interval, so it stands on every case. */
export function benchGhost(level: BenchLevel): BenchState {
  let state = benchInit(level)
  for (const slot of level.slots) {
    const { truth } = caseOf(slot)
    const p99Us = truth.correction.p99Us
    state = benchReduce(state, { t: 'flaw', flaw: slot.flaw })
    state = benchReduce(state, { t: 'predict', p99Us, loUs: Math.min(truth.interval.loUs, p99Us), hiUs: Math.max(truth.interval.hiUs, p99Us) })
    state = benchReduce(state, { t: 'submit' })
  }
  return state
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The view                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

function rulingViews(s: BenchState): RulingView[] {
  return s.level.slots.map((slot, i) => {
    const ruling = s.rulings[i]
    const prediction = s.predictions[i]
    if (ruling === null || prediction === null) throw new Error('internal: a case of a finished run has no ruling')
    const { c, scene, truth } = caseOf(slot)
    return {
      ...ruling,
      caseNo: i + 1,
      trueFlaw: slot.flaw,
      right: stands(ruling),
      prediction,
      truth: {
        p99Us: truth.correction.p99Us,
        n: truth.correction.n,
        how: truth.correction.how,
        ciLoUs: truth.interval.loUs,
        ciHiUs: truth.interval.hiUs,
        courtScoreMilli: truth.courtScoreMilli,
      },
      correction: truth.correction,
      scene,
      reveal: { stalls: c.scene.server.stalls ?? [], cold: c.scene.server.cold ?? null },
    }
  })
}

const filedOf = (s: BenchState): number => s.rulings.reduce((count, ruling) => count + (ruling === null ? 0 : 1), 0)

/** What the 2D board and the mirror draw: the case on the board, and (once the court has risen) the rulings. */
export function benchView(s: BenchState): BenchView {
  const done = benchDone(s)
  const cases = s.level.slots.length
  const pick = done ? null : s.picks[s.at]
  const prediction = done ? null : s.predictions[s.at]
  return {
    level: s.level.id,
    title: s.level.title,
    prompt: s.level.prompt,
    synthetic: true,
    caseNo: Math.min(s.at + 1, cases),
    cases,
    needed: s.level.needed,
    tab: s.tab,
    done,
    scene: done ? null : caseOf(s.level.slots[s.at]).scene,
    pick,
    prediction,
    ready: pick !== null && prediction !== null,
    filed: filedOf(s),
    rulings: done ? rulingViews(s) : null,
  }
}

/** The counts of the run so far. */
export function benchCounts(s: BenchState): BenchCounts {
  const filed = s.rulings.filter((ruling): ruling is Ruling => ruling !== null)
  return {
    cases: s.level.slots.length,
    filed: filed.length,
    flawsRight: filed.filter((ruling) => ruling.flawOk).length,
    numbersRight: filed.filter((ruling) => ruling.numberOk).length,
    intervalsRight: filed.filter((ruling) => ruling.intervalOk).length,
    casesRight: filed.filter(stands).length,
    scoreMilli: filed.reduce((total, ruling) => total + ruling.scoreMilli, 0),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grade and debrief                                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * `mine ÷ the reference` where more is better, capped at 1 (GAMES.md §2.1): the share of the cases ruled right, since the reference
 * stands on every one. The level passes at the number of cases ASSESSMENT §4.3 asks for. Real credit's bars are ASSESSMENT.md's.
 */
export function benchGrade(mine: BenchState, ghost: BenchState): Grade {
  const right = benchCounts(mine).casesRight
  const house = benchCounts(ghost).casesRight
  return { score: house <= 0 ? 1 : Math.min(1, right / house), ok: right >= mine.level.needed }
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'] as const

/**
 * The debrief: one sentence that says where the run went wrong, or that it did not, and the flaw worth the most (GAMES.md §2.1, the
 * counterfactual form for a configuration). It names the first case that did not stand. The sentences carry no digit: the figures
 * beside them are Readouts that tag every number.
 */
export function benchDebrief(mine: BenchState, ghost: BenchState): Debrief {
  const grade = benchGrade(mine, ghost)
  const cases = mine.level.slots.length
  const miss = mine.rulings.findIndex((ruling) => ruling !== null && !stands(ruling))
  if (miss < 0) {
    if (cases > 1) {
      return { sentence: "Every ruling stood. In each case you named the flaw the log showed (or found none), applied the rule that corrects it, and wrote down a number and a range that the court's own recomputation agreed with.", names: null }
    }
    return {
      sentence:
        mine.level.slots[0].flaw === 'none'
          ? "The ruling stood. You found no flaw, checked the log from the due times, and wrote down the number the report already had, with a range that the court's own recomputation agreed with."
          : `The ruling stood. You named ${FLAW_FACTS[mine.level.slots[0].flaw].phrase}, applied the rule that corrects it, and wrote down a number and a range that the court's own recomputation agreed with.`,
      names: null,
    }
  }
  const slot = mine.level.slots[miss]
  const ruling = mine.rulings[miss]
  if (ruling === null) throw new Error('internal: a missed case has no ruling')
  const facts = FLAW_FACTS[slot.flaw]
  const which = cases === 1 ? 'this case' : `the ${ORDINAL[miss] ?? 'last'} case`
  const lead = grade.ok && cases > 1 ? 'The court passed you, with a ruling that did not stand. ' : ''
  if (!ruling.flawOk) {
    return {
      sentence: `${lead}On ${which} you named ${FLAW_FACTS[ruling.named].phrase}, and the log showed ${facts.phrase}: ${facts.shows}. ${facts.rule}`,
      names: { lever: slot.flaw },
    }
  }
  if (!ruling.numberOk) {
    return {
      sentence: `${lead}On ${which} you named the flaw, but the number was not the one the rule gives. ${facts.rule}`,
      names: { lever: slot.flaw },
    }
  }
  return {
    sentence: `${lead}On ${which} the flaw and the number were right, but the range either missed the corrected p99 or was wider than the court's own bootstrap interval allows. A range is only worth writing down if it is about as tight as the sample it rests on.`,
    names: { lever: 'interval' },
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The session                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

export const benchSession: Session<BenchLevel, BenchState, BenchAction, BenchView, BenchCounts, BenchAsk> = {
  level: benchLevel,
  inBand: benchInBand,
  init: benchInit,
  ask: benchAsk,
  reduce: benchReduce,
  view: benchView,
  done: benchDone,
  score: benchCounts,
  ghost: benchGhost,
  grade: benchGrade,
  debrief: benchDebrief,
}
