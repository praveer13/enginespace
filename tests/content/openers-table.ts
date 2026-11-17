/*
 * The openers table of REDESIGN §2.5: for each of the 27 built lessons, how it opens, the level it opens on, and its graded levels. It is
 * data and nothing else, so that the unit test (tests/content/openers.test.ts), the vocabulary test and the e2e specs (e2e/support/lessons.ts)
 * all read one table, and a content task that moves a lesson to its row removes its own `waiting` mark here and edits nothing else.
 *
 *   opener   A: at most 60 words, then the run. B: 61 to 200 words, then the run. C: reading first, the first game after the first `##` or none.
 *   first    A and B: the refs of the opener's levels, in order (the Run section's leading games). C: the ref of its first practice game, which sits
 *            in the reading; an empty list is a lesson with no game outside its Test; null leaves the row to say nothing of the level.
 *   graded   every graded game block of the lesson, in the Test.
 *   waiting  the task of wave R that edits the lesson to its row. While the lesson differs, the row's test is expected to fail, and when the
 *            task makes it match, the test passes and the mark must go (the test fails until it is removed).
 */

export type OpenerKind = 'A' | 'B' | 'C'

export interface OpenerRow {
  readonly lesson: string
  readonly opener: OpenerKind
  readonly first: readonly string[] | null
  readonly graded: readonly string[]
  /** The wave R task that edits this lesson to the row, while it has not. */
  readonly waiting?: string
}

export const OPENERS: readonly OpenerRow[] = [
  // TR1, the request path
  { lesson: 'tr1.l1', opener: 'B', first: ['play:engine-floor/nano'], graded: [], waiting: 'R-T34' },
  { lesson: 'tr1.l2', opener: 'C', first: ['play:engine-floor/nano-tp'], graded: [] },
  { lesson: 'tr1.l3', opener: 'B', first: ['play:engine-floor/mini'], graded: [], waiting: 'R-T35' },
  { lesson: 'tr1.l4', opener: 'B', first: ['play:engine-floor/inside'], graded: [], waiting: 'R-T35' },
  { lesson: 'tr1.l5', opener: 'B', first: ['play:engine-floor/vllm'], graded: [], waiting: 'R-T35' },
  { lesson: 'tr1.l6', opener: 'B', first: ['play:engine-floor/sglang'], graded: [], waiting: 'R-T35' },
  { lesson: 'tr1.l7', opener: 'B', first: ['play:engine-floor/abort'], graded: ['play:engine-floor/map'], waiting: 'R-T35' },
  // TR2, the step loop
  { lesson: 'tr2.l1', opener: 'A', first: ['play:loop/first-3-gap'], graded: [] },
  { lesson: 'tr2.l2', opener: 'C', first: ['play:loop/first-2-slot'], graded: [] },
  { lesson: 'tr2.l3', opener: 'A', first: ['play:loop/first-4-par', 'play:loop/async'], graded: [] },
  { lesson: 'tr2.l4', opener: 'B', first: ['play:loop/mrv2'], graded: [] },
  { lesson: 'tr2.l5', opener: 'C', first: ['play:loop/graphs'], graded: [] },
  { lesson: 'tr2.l6', opener: 'C', first: null, graded: ['play:loop/close'] },
  { lesson: 'tr2.l7', opener: 'C', first: [], graded: [] },
  // TR5a, the KV page pool
  { lesson: 'tr5a.l1', opener: 'A', first: ['play:pool/one-group', 'play:pool/two-kinds'], graded: [] },
  { lesson: 'tr5a.l2', opener: 'B', first: ['play:pool/same-size'], graded: [] },
  { lesson: 'tr5a.l3', opener: 'B', first: ['play:pool/evict'], graded: ['play:pool/evict'] },
  { lesson: 'tr5a.l4', opener: 'B', first: ['play:pool/adapters'], graded: ['play:pool/adapters', 'play:pool/manager'] },
  // TR6, the rejection sampler
  { lesson: 'tr6.l1', opener: 'C', first: ['play:verifier/chain'], graded: [] },
  { lesson: 'tr6.l2', opener: 'A', first: ['play:verifier/overlap'], graded: ['play:verifier/exact'], waiting: 'R-T38' },
  { lesson: 'tr6.l3', opener: 'B', first: ['play:verifier/mutants'], graded: [], waiting: 'R-T38' },
  { lesson: 'tr6.l4', opener: 'C', first: ['play:verifier/greedy-ngram'], graded: [] },
  { lesson: 'tr6.l5', opener: 'C', first: ['play:loop/mask'], graded: [] },
  // TR8, the broken benchmark
  { lesson: 'tr8.l1', opener: 'B', first: ['play:broken-bench/due'], graded: ['play:broken-bench/due'], waiting: 'R-T39' },
  { lesson: 'tr8.l2', opener: 'C', first: ['play:broken-bench/warm'], graded: ['play:broken-bench/warm', 'play:broken-bench/sure'] },
  { lesson: 'tr8.l3', opener: 'B', first: ['play:broken-bench/court'], graded: [] },
  { lesson: 'tr8.l4', opener: 'C', first: [], graded: ['play:broken-bench/court'] },
]

/** The lesson's route: `tr2.l3` is the file `content/modules/tr2/lessons/l3-*.md`, so the route needs the slug, which a test reads from the map. */
export const openerOf = (lesson: string): OpenerRow | undefined => OPENERS.find((row) => row.lesson === lesson)
