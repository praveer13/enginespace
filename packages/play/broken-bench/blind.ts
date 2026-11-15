/**
 * The Inspection's blind strategies (ASSESSMENT §4.1; `verify:games`, tests/play/broken-bench-levels.test.ts): what a learner who reads
 * nothing of the log passes of its four graded levels, `due`, `warm`, `sure` and `court`.
 *
 * The blind strategy is a constant: for each kind of case, one p99 written down whatever the log says. A ruling stands when the flaw, the
 * number (within ±15% of the recomputed p99) and the interval are all right (judge.ts). The three single-case levels are measured on the
 * number alone, handing the strategy the true flaw of every case, which a blind learner is not told, so the rate is an upper bound on any
 * blind learner's and a level that holds under it holds under them:
 *
 *   per-flaw   handed the flaw of each case, the one number for that flaw that passes the most of its cases;
 *   one-flaw   never handed it: always naming the same flaw, with that flaw's best number, which passes where the flaw is the true one.
 *
 * The cases are the level's own: on seeds 0, 1, 2 … the cases the session deals, each with the true p99 that the reference writes down
 * (the court's recomputation). A flaw's constant is chosen on the cases it is judged on, so the rate is an upper bound on what a constant
 * fixed in advance would pass, and it falls toward the truth as the cases grow in number, as the corpus's `bestConstantPerLabel` has it.
 * It starts high: the best window of 50 cases of a flaw passes 10% to 28% of them, and the best of a thousand 7% to 14% [measured
 * 2026-11-09 at 6a791ac, over 1,000 cases of each flaw]. So each level reads as many cases as its margin under the bound asks for, and as
 * its flaws cost to draw (a case of `coordinated-omission` takes several times as long as one of `warm-up-counted`). Holding the
 * constants out would not read high, and on so few cases it reads far low, which is the wrong way for a bound.
 *
 * The court passes when four of its five cases stand, and a case stands only if its flaw is named right. A blind learner names a flaw by
 * chance, so the court is bounded by its flaws alone, with every number taken as right: the chance that four of five cases have the one
 * flaw that is always named (`one-flaw`), or the flaw most often dealt at the place of each case (`per-place`, which the shuffle of the
 * court's five is there to defeat). That needs no case to be drawn, only the deal, so it reads thousands of courts at the cost of a few.
 * The numbers of the court's cases are the corpus's, which tests/sim/bench-broken.test.ts holds to the bound for every flaw.
 */
import { bandedSeeds, typed } from '../blind'
import type { BlindProbe, BlindProbes, BlindRow } from '../blind'
import { withinTolerance } from './judge'
import type { BenchAction, BenchLevel, BenchState, Flaw } from './types'

/**
 * Seeds of `due`, `warm` and `sure`, one case each [estimated]: a single-case level deals its two flaws by turns, so each flaw has half of
 * them. In-sample, the best window of 150 cases reads 11% for `coordinated-omission` and 14% for `client-queue-hidden`, which `due` deals;
 * of 500, 15% for `warm-up-counted` and 12% for `none`, which `warm` deals; and of 200, 9% for `too-few-samples` and 14% for `none`, which
 * `sure` deals. A level reads the mean of its two, which is 12.6%, 13.5% and 11.5% [measured 2026-11-09 at 6a791ac over 1,000 cases of
 * each flaw, in blocks of that size], and the seeds below read 12.0%, 11.6% and 10.5%.
 */
export const DUE_SEEDS = 300
export const WARM_SEEDS = 1000
export const SURE_SEEDS = 400

/** Courts of `court`, five cases each [estimated]: only the deal is read, so the sample is large. */
export const COURT_SEEDS = 2000

/** A case: its true flaw, and the p99 the court recomputes for it, in µs. */
interface Case {
  readonly flaw: Flaw
  readonly p99Us: number
}

/** Whether a constant passes a case's number: the court's own test. */
const passes = (constant: number, truth: number): boolean => withinTolerance({ p99Us: truth, ciLoUs: truth, ciHiUs: truth }, constant)

/**
 * The share of `truths` that the best constant passes: the top of the window of one of them, which is where a window of answers starts.
 * The constant is chosen on the truths it is judged on.
 */
function bestShare(truths: readonly number[]): number {
  let most = 0
  for (const truth of truths) {
    const candidate = Math.max(1, Math.floor((truth * 1150) / 1000))
    most = Math.max(most, truths.filter((other) => passes(candidate, other)).length)
  }
  return truths.length === 0 ? 0 : most / truths.length
}

/** The chance that at least `needed` of cases pass, when case `i` passes with chance `chances[i]` and the cases are independent. */
function atLeast(needed: number, chances: readonly number[]): number {
  let ways = [1]
  for (const chance of chances) {
    const next = new Array<number>(ways.length + 1).fill(0)
    ways.forEach((weight, passed) => {
      next[passed] += weight * (1 - chance)
      next[passed + 1] += weight * chance
    })
    ways = next
  }
  return ways.slice(needed).reduce((sum, weight) => sum + weight, 0)
}

/**
 * A graded level of The Inspection, measured on the cases that seeds 0, 1, 2 … deal to it. With `numbers` the cases are drawn, and the
 * strategies write a p99; without, only the flaws of the deal are read and a number is taken as right.
 */
function levelProbe(id: string, defaultSeeds: number, numbers: boolean): BlindProbe {
  return (session, seeds = defaultSeeds) => {
    const play = typed<BenchLevel, BenchState, BenchAction>(session)
    let needed = 1
    const deals: Case[][] = []
    for (const seed of bandedSeeds(session, id, seeds)) {
      const level = play.level(id, seed)
      // The reference writes the recomputed p99 of every case, which is the key of the number; the deal alone has the flaws.
      const ghost = numbers ? play.ghost(level) : null
      needed = level.needed
      deals.push(level.slots.map((slot, at) => ({ flaw: slot.flaw, p99Us: ghost?.predictions[at]?.p99Us ?? 1 })))
    }

    const truths = new Map<Flaw, number[]>()
    for (const deal of deals) for (const c of deal) truths.set(c.flaw, [...(truths.get(c.flaw) ?? []), c.p99Us])
    const share = new Map<Flaw, number>([...truths].map(([flaw, list]) => [flaw, numbers ? bestShare(list) : 1]))
    const rateOf = (chanceOf: (flaw: Flaw) => number): number =>
      deals.length === 0 ? 0 : deals.reduce((sum, deal) => sum + atLeast(needed, deal.map((c) => chanceOf(c.flaw))), 0) / deals.length

    const rows: BlindRow[] = numbers
      ? [
          {
            strategy: 'per-flaw',
            describe: 'handed the flaw of each case, the one p99 for that flaw that passes the most of its cases, chosen on those cases',
            rate: rateOf((flaw) => share.get(flaw) ?? 0),
            of: deals.length,
          },
        ]
      : []
    let named: BlindRow | null = null
    for (const flaw of truths.keys()) {
      const rate = rateOf((other) => (other === flaw ? (share.get(flaw) ?? 0) : 0))
      if (named === null || rate > named.rate) {
        named = {
          strategy: 'one-flaw',
          describe: numbers
            ? `never handed the flaw: always naming ${flaw}, with the p99 that passes the most of its cases`
            : `always naming ${flaw}, and the number of every case taken as right`,
          rate,
          of: deals.length,
        }
      }
    }
    if (!numbers) {
      // Told only the place of a case in the court, which the page shows, the flaw most often dealt there. A court whose order said anything
      // of its flaws would show it here, and the court shuffles its five so that it does not.
      const places = Math.max(0, ...deals.map((deal) => deal.length))
      const modal = Array.from({ length: places }, (_, place) => {
        const counts = new Map<Flaw, number>()
        for (const deal of deals) if (deal[place] !== undefined) counts.set(deal[place].flaw, (counts.get(deal[place].flaw) ?? 0) + 1)
        return [...counts].reduce<[Flaw | null, number]>((top, entry) => (entry[1] > top[1] ? entry : top), [null, 0])[0]
      })
      const passed = deals.filter((deal) => deal.filter((c, place) => c.flaw === modal[place]).length >= needed).length
      rows.push({
        strategy: 'per-place',
        describe: 'told only the place of a case in the court, always naming the flaw most often dealt there, and the number of every case taken as right',
        rate: deals.length === 0 ? 0 : passed / deals.length,
        of: deals.length,
      })
    }
    return named === null ? rows : [...rows, named]
  }
}

/** The probes of The Inspection's graded levels. */
export const BROKEN_BENCH_BLIND: BlindProbes = {
  due: levelProbe('due', DUE_SEEDS, true),
  warm: levelProbe('warm', WARM_SEEDS, true),
  sure: levelProbe('sure', SURE_SEEDS, true),
  court: levelProbe('court', COURT_SEEDS, false),
}
