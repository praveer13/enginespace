/**
 * How each lesson prediction is revealed (W1b-T02, then R-T09; ARCHITECTURE §4.3, §7.2; ASSESSMENT §4.7; D-067): the lessons' 46 `predict`
 * blocks, each with the way its answer is shown. Every one has one.
 *
 *   - After its run (`reveal: after-game`): 21 predictions. The row names the game block whose run the pure model reads the answer from,
 *     the first block of that game and level that follows the prediction in its lesson. The reading is `./truth` (a lazy part, because it
 *     brings the games' worlds), and tests/play/predictions.test.ts holds it to the lesson's own figure, which tests/content/tr*-demos.ts
 *     computes from the numbers of the prompt alone. The two agree only if the prompt's world is the run's.
 *   - At commit (`reveal: at-commit`): 25 predictions. The question carries numbers of its own, round and made up, that no level of its
 *     game has, or it asks for a fact about an engine's source, configuration or tool, or its lesson has no game. The answer is computed
 *     from the question's own numbers by the course's pure model, or read from the claim the question is about, and no run is read. It is
 *     shown at once with its working (D-067). The answer is `./commit-<module>`, a lazy part like the readings.
 *   - Held: a question with no answer to show. No lesson has one today. A prediction that this table has no row for, or whose game block the
 *     lesson lacks, is one, and the page prints it as a question to hold: the stem, no input, no lock.
 *
 * A grade is never stored: it is computed when the answer is shown (A§1, I3), and a prediction earns no credit either way (ASSESSMENT §4.7).
 *
 * Importing this file brings no game and no model with it: the lesson page reads it when it draws a prediction.
 */

/** A prediction answered by a run: the game block (its game and level) whose run the model reads. */
export interface Answered {
  readonly game: string
  readonly level: string
}

/** A prediction revealed at commit: its answer takes no run (D-067). */
export interface AtCommit {
  readonly commit: true
}

/** A question to hold: the page shows the stem and no input, because there is no answer to show. */
export interface Held {
  /** One sentence, in the engine's words, with no digit in it: why the page has no answer for this question. */
  readonly why: string
}

export type Plan = Answered | AtCommit | Held

const answered = (game: string, level: string): Answered => ({ game, level })
const atCommit: AtCommit = { commit: true }

/** The 46 predictions of the lessons, by id. */
export const PLAN: Readonly<Record<string, Plan>> = {
  // TR0, Tensor views: the elements the copy of the `views` run moves, and a slice's stride worked from the question's own shape; the
  // addresses between a head's neighbouring tokens on `three-d`, the lines of a short program that wait for the GPU, and the rows of a query
  // projection from the model's configuration; the lanes the reference's launch on `grid` masks, and a 1-D launch's masked lanes worked from the question's own numbers.
  'tr0.l1.p1': answered('shape-shifter', 'views'),
  'tr0.l1.p2': atCommit,
  'tr0.l2.p1': answered('shape-shifter', 'three-d'),
  'tr0.l2.p2': atCommit,
  'tr0.l3.p1': atCommit,
  'tr0.l4.p1': answered('shape-shifter', 'grid'),
  'tr0.l4.p2': atCommit,

  // TR1, Request path: the lifecycle model's path for the engine the level lays, and the same request with one lever moved.
  'tr1.l1.p1': answered('engine-floor', 'nano'),
  'tr1.l1.p2': answered('engine-floor', 'nano'),
  'tr1.l2.p1': atCommit,
  'tr1.l2.p2': atCommit,
  'tr1.l3.p1': answered('engine-floor', 'mini'),
  'tr1.l3.p2': answered('engine-floor', 'mini'),
  'tr1.l4.p1': answered('engine-floor', 'inside'),
  'tr1.l4.p2': atCommit,
  'tr1.l5.p1': answered('engine-floor', 'vllm'),
  'tr1.l5.p2': atCommit,
  'tr1.l5.p3': atCommit,
  'tr1.l6.p1': answered('engine-floor', 'sglang'),
  'tr1.l6.p2': answered('engine-floor', 'sglang'),
  'tr1.l7.p1': answered('engine-floor', 'abort'),
  'tr1.l7.p2': atCommit,

  // TR2, Step loop: the ticks of the front page's levels, the cost cards and the host presets of the full levels' stages.
  'tr2.l1.p1': answered('loop', 'first-3-gap'),
  'tr2.l2.p1': atCommit,
  'tr2.l3.p1': atCommit,
  'tr2.l4.p1': answered('loop', 'mrv2'),
  'tr2.l5.p1': answered('loop', 'graphs'),
  'tr2.l6.p1': answered('loop', 'graphs'),
  'tr2.l6.p2': atCommit,
  'tr2.l7.p1': atCommit,

  // TR5a, KV page pool: the presets of the level's model, its adapter catalog and its pool.
  'tr5a.l1.p1': answered('pool', 'two-kinds'),
  'tr5a.l2.p1': atCommit,
  'tr5a.l2.p2': answered('pool', 'state'),
  'tr5a.l3.p1': answered('pool', 'evict'),
  'tr5a.l3.p2': atCommit,
  'tr5a.l4.p1': answered('pool', 'adapters'),
  'tr5a.l4.p2': answered('pool', 'adapters'),

  // TR6, the rejection sampler and the grammar mask: the questions carry the lesson's own distributions, rates and costs.
  'tr6.l1.p1': atCommit,
  'tr6.l2.p1': atCommit,
  'tr6.l3.p1': atCommit,
  'tr6.l4.p1': atCommit,
  'tr6.l5.p1': atCommit,

  // TR8, Broken benchmark: the questions are toy runs and tools' arithmetic, and the level plays cases drawn from the seed.
  'tr8.l1.p1': atCommit,
  'tr8.l2.p1': atCommit,
  'tr8.l3.p1': atCommit,
  'tr8.l4.p1': atCommit,
}

/**
 * A prediction that the table does not list is a question to hold: a lesson written after this table, with a prediction in it, shows its stem
 * and takes no input, and a test fails until the table has a row for it.
 */
export const UNLISTED: Held = { why: 'This question has no answer to check yet, so hold your own and read on to test it.' }

/** A prediction whose row names a game block that its lesson does not have after the prediction: the table and the lesson disagree, and the question is held. */
export const NO_BLOCK: Held = { why: 'The run that would answer this question is not below it on this page, so hold your own and read on to test it.' }

/** The row for a prediction id. Only the table's own ids count: a name every object has (`constructor`) is not one. */
export const planOf = (id: string): Plan => (Object.hasOwn(PLAN, id) ? PLAN[id] : UNLISTED)

/** Whether a prediction is answered by a run, and revealed after it. */
export const isAnswered = (plan: Plan): plan is Answered => 'game' in plan

/** Whether a prediction is revealed at commit, with no run. */
export const isAtCommit = (plan: Plan): plan is AtCommit => 'commit' in plan

/** Whether a prediction is a question to hold. */
export const isHeld = (plan: Plan): plan is Held => 'why' in plan
