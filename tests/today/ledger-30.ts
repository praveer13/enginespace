/*
 * W1-T05, accept 2: a scripted ledger of thirty days, written by hand, and what a reader of it must conclude.
 *
 * Eight ideas are earned and kept up over a month by a learner who is not perfect: a miss, a guess, a result that is not retrieval, a
 * week away and a welcome-back. Each step names the events it writes and, apart from them, the reviews it should come to as the author
 * means it: `counts` is the author's own reading of whether a card takes the step, and the oracle in golden.test.ts replays only those,
 * with the vendored model called directly. So the oracle shares no rule with src/items/today/cards.ts except the model.
 *
 * Day 0 is 2026-10-05. The learner is away from day 12 to day 18 (seven quiet days: graded work on day 11, then none until day 19), so
 * days 18 and 19 are a welcome-back, and day 19 is the return.
 */
import { addDays } from '../../src/items/today/days'
import type { Rating } from '../../src/items/today/fsrs'
import type { TestLedger } from './support'

export const START = '2026-10-05'
export const DAYS = 30
export const day = (n: number): string => addDays(START, n)

export const A = 'tr1.five-mechanisms'
export const B = 'tr1.vllm-lifecycle'
export const C = 'tr2.bubble'
export const D = 'tr2.async-overlap'
export const E = 'tr2.graph-replay'
export const F = 'tr2.capture-padding'
export const G = 'tr5a.kv-groups'
export const H = 'tr6.verify-shape'
export const KCS = [A, B, C, D, E, F, G, H]

export interface Step {
  /** What the step is, for a failure message. */
  readonly what: string
  readonly day: number
  /** Writes its events. */
  write(ledger: TestLedger): void
  /** The reviews a card is meant to take from it, in order: a KC and the grade. Empty for a step that is not retrieval, or that earns nothing. */
  readonly reviews: readonly (readonly [kc: string, grade: Rating])[]
}

const review = (n: number, kc: string, grade: Rating, what = `review ${kc} ${grade}`): Step => ({
  what,
  day: n,
  write: (ledger) => void ledger.review(day(n), kc, grade, grade === 2 ? { conf: 'guess' } : grade === 4 ? { conf: 'sure' } : {}),
  reviews: [[kc, grade]],
})

export const STEPS: readonly Step[] = [
  // Day 0: four ideas earned. Two by a lesson's items (one of them sure), two by a pass of Today's own.
  { what: 'an item on the bubble, thought right', day: 0, write: (l) => void l.item(day(0), 'async-off', { conf: 'think' }), reviews: [[C, 3]] },
  { what: 'an item on async overlap, sure', day: 0, write: (l) => void l.item(day(0), 'async-on', { conf: 'sure' }), reviews: [[D, 4]] },
  review(0, A, 3),
  review(0, B, 2),
  // Day 1: B is back after a day. A wrong item on the bubble is a lapse.
  review(1, B, 3),
  { what: 'a wrong item on the bubble', day: 1, write: (l) => void l.item(day(1), 'async-off', { ok: false }), reviews: [[C, 1]] },
  // Day 2.
  review(2, A, 3),
  review(2, C, 3),
  // Day 3: E is tried and missed. It is not earned, so nothing is scheduled.
  { what: 'a first, failed try at E', day: 3, write: (l) => void l.review(day(3), E, 1), reviews: [] },
  review(3, A, 2),
  // Day 4: E earned. B is easy.
  review(4, E, 3),
  review(4, B, 4),
  // Day 5: a graded run of Service passes both of its ideas, sure.
  { what: 'a graded run of the loop, sure', day: 5, write: (l) => void l.play(day(5), 'loop', 'close', { conf: 'sure' }), reviews: [[C, 4], [D, 4]] },
  // Day 6: a practice result still reviews a card; E and A are reviewed in Today.
  { what: 'a practice item on async overlap', day: 6, write: (l) => void l.item(day(6), 'async-on', { provenance: 'practice' }), reviews: [[D, 3]] },
  review(6, E, 3),
  review(6, A, 3),
  // Day 7: what is not retrieval moves nothing.
  { what: 'help past the hints on the bubble', day: 7, write: (l) => void l.review(day(7), C, 1, { provenance: 'assisted' }), reviews: [] },
  { what: 'a figure typed without a check', day: 7, write: (l) => void l.item(day(7), 'async-off', { ok: false, provenance: 'self-reported' }), reviews: [] },
  { what: 'a prediction, which names no idea yet', day: 7, write: (l) => void l.predict(day(7), 'tr2.l3', 'tr2.l3.p1'), reviews: [] },
  // Days 8 to 11: more earned, and the last graded work before the week away.
  review(8, D, 3),
  review(9, F, 4),
  review(9, C, 3),
  review(10, G, 3),
  review(10, E, 2),
  review(11, H, 3),
  review(11, B, 3),
  review(11, A, 3),
  // Days 12 to 18: away. Day 19: back, to a welcome-back. A, G and D are reviewed; G is missed.
  review(19, A, 3),
  review(19, G, 1),
  review(19, D, 4),
  // The rest of the month: reviews on the day an idea is due, a few a little early, and ideas left to wait.
  review(20, B, 3),
  review(20, E, 3),
  review(21, C, 3),
  review(21, H, 2),
  review(22, F, 3),
  review(23, G, 3),
  review(24, A, 3),
  review(24, B, 4),
  review(25, E, 3),
  review(26, C, 3),
  review(26, G, 3),
  review(27, D, 3),
  review(27, H, 3),
  review(28, F, 4),
  review(29, A, 3),
  review(29, B, 3),
  review(30, E, 4),
  review(30, C, 3),
]

/** The ledger the steps write. */
export function writeAll(ledger: TestLedger): TestLedger {
  for (const step of STEPS) step.write(ledger)
  return ledger
}
