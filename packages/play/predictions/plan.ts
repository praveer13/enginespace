/**
 * Which run answers which prediction (W1b-T02; ARCHITECTURE §4.3, §7.2; ASSESSMENT §4.7): the lessons' 39 `predict` blocks, each with the
 * game block whose run the pure model reads its answer from, or the task its reveal waits for.
 *
 * A prediction is revealed after the game (`reveal: after-game`), and graded against what the pure model computes from that game's run,
 * never against a stored key (A§1, I3). A row here says which run: the first block of that game and level that follows the prediction in
 * its lesson. The reading itself is `./truth` (a lazy part, because it brings the games' worlds), which tests/play/predictions.test.ts
 * holds to the same ids and to the lessons' own figures.
 *
 * A prediction is answered by a run when the world its prompt describes is the world the run was played in: the prompt states the numbers
 * of that world (and a size or a lever of its own, such as a request of 4,096 tokens or a second rank), and the reading takes the world from
 * the run. tests/play/predictions.test.ts holds each reading to the figure that the lesson computes from the numbers of the prompt alone
 * (tests/content/tr*-demos.ts), and the two agree only if the prompt's world is the run's.
 *
 * Some predictions have no run to read. A lesson's question may carry numbers of its own, round and made up, that no level of its game
 * has: the game plays the same rule on other numbers, and a score against the game's number would mark a right answer wrong. Where that
 * is so, or the answer is a fact about an engine's source that no model of the course holds, or the lesson has no game at all, the block
 * does not invent an answer: its ticket says that its reveal waits on a task, and the task is named here.
 *
 * Importing this file brings no game and no model with it: the lesson page reads it when it draws a prediction.
 */

/** A prediction answered by a run: the game block (its game and level) whose run the model reads. */
export interface Answered {
  readonly game: string
  readonly level: string
}

/** A prediction that waits: the open task that gives it a run to read, and why the runs there are cannot answer it. */
export interface Waiting {
  readonly task: string
  /** One sentence, with no digit in it: what the question carries that no run of the lesson's game holds. */
  readonly why: string
}

export type Plan = Answered | Waiting

/** The task that gives the waiting predictions a run to read (docs/TRACKER.md). */
export const WAITS_FOR = 'W2-T43'

const waits = (why: string): Waiting => ({ task: WAITS_FOR, why })
const answered = (game: string, level: string): Answered => ({ game, level })

/** The 39 predictions of the lessons, by id. */
export const PLAN: Readonly<Record<string, Plan>> = {
  // TR1, Back of House: the lifecycle model's path for the engine the level lays, and the same request with one lever moved.
  'tr1.l1.p1': answered('engine-floor', 'nano'),
  'tr1.l1.p2': answered('engine-floor', 'nano'),
  'tr1.l2.p1': waits("It asks how nano-vllm counts a cached prefix, in blocks of its own. Back of House lays a request's path through the engine, and its model has no cache blocks to count."),
  'tr1.l2.p2': waits("It asks what nano-vllm's scheduler puts in the next step. Back of House's model says where a request goes, and not what a step holds."),
  'tr1.l3.p1': answered('engine-floor', 'mini'),
  'tr1.l3.p2': answered('engine-floor', 'mini'),
  'tr1.l4.p1': answered('engine-floor', 'inside'),
  'tr1.l4.p2': waits('It asks how much a source file grew between two commits, which is a measured fact about the repository, and no run of Back of House holds it.'),
  'tr1.l5.p1': answered('engine-floor', 'vllm'),
  'tr1.l5.p2': waits("It asks what vLLM's scheduler puts in the next step. Back of House's model says where a request goes, and not what a step holds."),
  'tr1.l5.p3': waits("It asks how many of vLLM's request statuses count as finished. Back of House's model has stages and places, and not the engine's list of statuses."),
  'tr1.l6.p1': answered('engine-floor', 'sglang'),
  'tr1.l6.p2': answered('engine-floor', 'sglang'),
  'tr1.l7.p1': answered('engine-floor', 'abort'),
  'tr1.l7.p2': waits("It asks how many more forward passes SGLang runs after an abort. Back of House lays vLLM's abort here, and its SGLang path stops at the abort."),

  // TR2, Service: the cost cards and the host presets of the level's stages.
  'tr2.l1.p1': waits("Its numbers are the lesson's own, round and made up. First service runs on its own ticks, which are not these, so no run of it holds the answer."),
  'tr2.l2.p1': waits('It asks what is left of a token budget for a prompt. First service hangs tickets on clips, and its token budget never binds, so no run of it holds the answer.'),
  'tr2.l3.p1': waits("Its numbers are the lesson's own, round and made up. The levels that follow run on ticks and on the cost cards' own microseconds, so no run of either holds the answer."),
  'tr2.l4.p1': answered('loop', 'mrv2'),
  'tr2.l5.p1': answered('loop', 'graphs'),
  'tr2.l6.p1': answered('loop', 'graphs'),
  'tr2.l6.p2': waits('It asks what the graphs cost a server at its defaults. The level that follows draws a small rail and a room of its own for graphs, so no run of it holds these numbers.'),
  'tr2.l7.p1': waits('This lesson has no game to play, so there is no run to reveal after. It asks how two engines pad a batch.'),

  // TR5a, The Reach-In: the presets of the level's model, its adapter catalog and its pool.
  'tr5a.l1.p1': answered('pool', 'two-kinds'),
  'tr5a.l2.p1': waits('It asks about the layers of one particular model, and the level that follows, One pan size, plays another, so no run of it holds the answer.'),
  'tr5a.l2.p2': answered('pool', 'state'),
  'tr5a.l3.p1': answered('pool', 'evict'),
  'tr5a.l3.p2': waits("It asks about the state model's cache, and the level of this lesson plays the two-kinds model, so no run of it holds the answer."),
  'tr5a.l4.p1': answered('pool', 'adapters'),
  'tr5a.l4.p2': answered('pool', 'adapters'),

  // TR6, The Tasting and Service's allergy card: the questions carry the lesson's own distributions, rates and costs.
  'tr6.l1.p1': waits("Its acceptance rate is the lesson's own. The Tasting draws a new pair of tastings for every seed, so no run of the level holds it."),
  'tr6.l2.p1': waits("Its three dishes are the lesson's own. The Tasting draws six dishes from the seed, so no run of the level holds them."),
  'tr6.l3.p1': waits('It asks how many draws a test needs to see a very small bias. The level plays five wrong rules and asks which is which, and no run of it holds that count.'),
  'tr6.l4.p1': waits("It asks which runner serves a proposer that the engine loads by name, which is a rule of the engine's configuration. The level plays a copying proposer, and no run of it holds that rule."),
  'tr6.l5.p1': waits("Its costs are the lesson's own. The allergy card level draws its grammar's weight from the seed, so no run of it holds them."),

  // TR8, The Inspection: the questions are toy runs and tools' arithmetic, and the level plays cases drawn from the seed.
  'tr8.l1.p1': waits("Its toy log, with a freeze at one moment, is the lesson's own. The Inspection plays logs drawn from the seed, so no run of the level holds it."),
  'tr8.l2.p1': waits("It asks about the nearest rank of a run of a given length. The Inspection's levels ask for the corrected percentile of a log drawn from the seed, so no run of them holds that count."),
  'tr8.l3.p1': waits('It asks what a harness sends when a cap holds requests in flight. The Inspection draws its cases from the seed, and none of them is this harness.'),
  'tr8.l4.p1': waits('It asks what a tool divides by to get goodput. The Inspection draws its cases from the seed, and none of them is this run.'),
}

/**
 * A prediction that the table does not list waits for the same task: a lesson written after this table, with a prediction in it, gets a
 * ticket that says so, and not a reveal that has no run to read.
 */
export const UNLISTED: Waiting = waits('The table of which run answers which prediction has no row for it yet.')

/** A prediction whose row names a game block that its lesson does not have after it: the table and the lesson disagree, and the ticket says so. */
export const NO_BLOCK: Waiting = waits('The table names a game block for it that the lesson does not have after the prediction.')

/** The row for a prediction id. Only the table's own ids count: a name every object has (`constructor`) is not one. */
export const planOf = (id: string): Plan => (Object.hasOwn(PLAN, id) ? PLAN[id] : UNLISTED)

/** Whether a prediction is answered by a run. */
export const isAnswered = (plan: Plan): plan is Answered => 'game' in plan
