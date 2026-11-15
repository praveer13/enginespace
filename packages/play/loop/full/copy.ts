/**
 * What the step loop's full levels and stages say, by level id and stage id (R-T02, R-T04): a level's title, goal line and opening line, and
 * for each stage its title, goal line, what it asks, and its prediction's question with the unit of a number's answer or the words of a
 * choice's options; and for the graded level, its pass rule. The words are display copy and no rule reads them, so they are not in a level or
 * a state: rewording one moves no state hash and no golden. A view reads them here (`wordsOf`); the stage's world holds only what the rules
 * need (the prediction's kind, its tolerance, which choice is right).
 *
 * The words are the engine's (REDESIGN §2.7, D-063): a step, a run, the CPU and the GPU, async scheduling, eager launches, CUDA graph replay,
 * capture sizes and padding, the grammar mask. The cost cards keep their names, "70B on H100" and "Small model", because they are claims.
 * Only the pass rule carries a digit, the level's own bar, and tests/copy/game-copy.test.ts reads the bar and finds it there; the cards and
 * the readouts print every other figure. A stage's words may name what its seed drew, so a prompt can be a function of that (the modes
 * stage says the backend's support level and the run's mix).
 */
import type { GoalLine } from '../../types'
import type { FullLevelId, StageId } from './types'

/** What a stage's seed drew that its words name: the backend's graph support level, and whether the run's steps mix a prefill with decodes. */
export interface StageDraw {
  readonly support: string
  readonly mixed: boolean
}

/** The unit a number's answer is written in. It is a word on the page and the slack of a µs answer, so the table holds it beside the question. */
export type PredictionUnit = 'µs' | 'launches' | 'steps' | '%'

export type PredictionCopy =
  | { readonly question: string; readonly unit: PredictionUnit }
  | { readonly question: string; readonly options: readonly string[] }

export interface StageCopy {
  readonly title: string
  readonly goal: GoalLine
  /** What the stage asks. */
  readonly prompt: string | ((draw: StageDraw) => string)
  readonly prediction: PredictionCopy
}

export interface FullCopy {
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  readonly stages: Readonly<Partial<Record<StageId, StageCopy>>>
  /** The graded level's pass rule, stated before the run (REDESIGN §2.6), with the bar of close.ts in it. */
  readonly passRule?: string
}

/** The choices of the modes stage's prediction: the five modes, and none: the engine refuses, or its graphs leave the KV cache no room. */
export const MODE_CHOICES: readonly string[] = ['FULL', 'FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE', 'None serves: refused, or no room']

/** The two answers of the mask: the grammar mask is built inside the forward, or the GPU waits for it. */
export const MASK_CHOICES: readonly string[] = ['It fits inside the forward: the GPU never waits for the mask', 'It outlasts the forward: the GPU waits for the mask']

/** How a practice stage ends (GAMES.md §3.2): on a run within the reference's metric and its slack, or on its third run. */
const STAGE_ENDS = "Ends on a run close enough to the reference run's, or after the third run."
const CLOCK = "The reference run's clock is the number to beat."

/** The bar of `close` (close.ts, `BAR_PERMILLE`, ASSESSMENT §4.3): no dependency violation, and 97% of the reference's throughput. */
const CLOSE_PASS = "Passes with zero dependency violations and useful tokens per GPU-ms at least 97% of the reference run's."

const CLOSE_PROMPT =
  'Every request of this run arrives at once. Choose the whole configuration from the cost cards before a single step: async scheduling and where the next step\'s input ids come from, the model runner, the graph mode and the capture sizes. One run is served, and the reference run sets the bar.'

const TPOT = { question: 'With async scheduling on, what is the median time per output token (TPOT), in µs?', unit: 'µs' } as const
const SAVED = { question: 'How many µs of each output token does the V2 model runner save on this card (the median TPOT on V1, less on MRV2)?', unit: 'µs' } as const

export const FULL_COPY: Readonly<Record<FullLevelId, FullCopy>> = {
  async: {
    title: 'Async scheduling on two cost cards',
    goal: {
      aim: 'See what async scheduling saves on a large model and on a small one.',
      controls: 'You switch async scheduling off or on, after predicting the median TPOT.',
      beat: CLOCK,
      ends: "Ends when both stages close, each on a run close enough to the reference run's or after its third run.",
    },
    prompt:
      "Each step the CPU schedules and prepares the next batch and reads the last step's tokens back. With async scheduling on, it does that while the GPU runs, so the GPU need not wait. Run the workload on both cost cards.",
    stages: {
      '70b': {
        title: '70B on H100',
        goal: { aim: 'Measure async scheduling on a large model.', controls: 'You switch async scheduling off or on.', beat: CLOCK, ends: STAGE_ENDS },
        prompt:
          "A 70B model on four H100s: long forwards, and the CPU's work per request is the card's fitted host term. Run the workload with async scheduling off, then on.",
        prediction: TPOT,
      },
      small: {
        title: 'Small model',
        goal: { aim: 'Measure async scheduling on a small model.', controls: 'You switch async scheduling off or on.', beat: CLOCK, ends: STAGE_ENDS },
        prompt: "A small model: short forwards, so the CPU's work is a large share of each step. Run the workload with async scheduling off, then on.",
        prediction: TPOT,
      },
    },
  },
  graphs: {
    title: 'CUDA graphs: launches against replay',
    goal: {
      aim: "Cut the CPU's launch cost with CUDA graphs.",
      controls: 'You set the graph mode and the capture sizes, after a prediction in each stage.',
      beat: "The reference run's is the number to beat: its clock, or for the sizes its capture cost.",
      ends: "Ends when all three stages close, each on a run close enough to the reference run's or after its third run.",
    },
    prompt:
      'An eager step costs the CPU one launch for every kernel; a CUDA graph replay launches the whole step with one call. Three stages: eager launches against replay, capture sizes and padding, and the graph modes.',
    stages: {
      comb: {
        title: 'Eager launches against graph replay',
        goal: { aim: 'See how many launches a CUDA graph saves.', controls: 'You switch CUDA graphs off or on.', beat: CLOCK, ends: STAGE_ENDS },
        prompt: 'With no CUDA graph captured, the CPU launches every kernel of a step one by one. Run the workload with eager launches, then with graphs on.',
        prediction: { question: 'With eager launches and no CUDA graph, how many kernel launches does the CPU make for one step?', unit: 'launches' },
      },
      sizes: {
        title: 'Capture sizes and padding',
        goal: {
          aim: 'Choose the batch sizes to capture as CUDA graphs.',
          controls: 'You choose the capture sizes, within the time the engine has to capture them.',
          beat: "The reference run's capture cost, padded and eager time together, is the number to beat.",
          ends: STAGE_ENDS,
        },
        prompt:
          'The engine has time to capture only a few CUDA graphs. A step runs as the smallest captured size that holds its batch, the rest padding, and a larger batch launches eagerly. Choose the capture sizes for this run.',
        prediction: { question: "With vLLM's default capture sizes cut to fit the budget, how many of this run's steps launch eagerly?", unit: 'steps' },
      },
      modes: {
        title: 'Graph modes',
        goal: { aim: 'Choose the graph mode that serves this run fastest.', controls: 'You choose the graph mode to ask for.', beat: CLOCK, ends: STAGE_ENDS },
        prompt: ({ support, mixed }) =>
          `This run's attention backend replays graphs at support level ${support}, the KV cache spares the CUDA graphs a little memory, and ${mixed ? 'most steps mix a prefill with decodes' : 'most steps only decode'}. Ask for the mode that serves fastest.`,
        prediction: { question: 'Ask for FULL on this run: which mode actually serves it?', options: MODE_CHOICES },
      },
    },
  },
  mrv2: {
    title: 'The V2 model runner',
    goal: {
      aim: 'Measure what the V2 model runner saves on each cost card.',
      controls: 'You choose the V1 or the V2 runner, after predicting the saving.',
      beat: CLOCK,
      ends: "Ends when both stages close, each on a run close enough to the reference run's or after its third run.",
    },
    prompt:
      'The V2 model runner prepares each step\'s inputs on the GPU, so the CPU has less to do for every step. Run the workload with each runner, on both cost cards.',
    stages: {
      small: {
        title: 'Small model',
        goal: { aim: 'Measure the V2 runner on a small model.', controls: 'You choose the V1 or the V2 runner.', beat: CLOCK, ends: STAGE_ENDS },
        prompt: "A small model, whose short forwards leave the CPU's work exposed. Run the workload on the legacy V1 runner, then on MRV2.",
        prediction: SAVED,
      },
      '70b': {
        title: '70B on H100',
        goal: { aim: 'Measure the V2 runner on a large model.', controls: 'You choose the V1 or the V2 runner.', beat: CLOCK, ends: STAGE_ENDS },
        prompt: 'The 70B model, whose forwards run long. Run the workload on the legacy V1 runner, then on MRV2.',
        prediction: SAVED,
      },
    },
  },
  close: {
    title: 'Every lever, on new numbers',
    goal: {
      aim: 'Close the bubbles on a run you have not seen.',
      controls: 'You choose async scheduling and its input ids, the runner, the graph mode and the capture sizes, once, before the run.',
      beat: CLOSE_PASS,
      ends: 'Ends when the one run is served.',
    },
    prompt: CLOSE_PROMPT,
    stages: {
      close: {
        title: 'Every lever, on new numbers',
        goal: {
          aim: 'Close the bubbles on a run you have not seen.',
          controls: 'You choose async scheduling and its input ids, the runner, the graph mode and the capture sizes, once, before the run.',
          beat: CLOSE_PASS,
          ends: 'Ends when the one run is served.',
        },
        prompt: CLOSE_PROMPT,
        prediction: {
          question: 'With every lever off (the legacy runner, async scheduling off, no CUDA graph), what share of the run does the GPU sit idle?',
          unit: '%',
        },
      },
    },
    passRule: CLOSE_PASS,
  },
  mask: {
    title: 'The grammar mask inside a step',
    goal: {
      aim: 'Find whether the grammar mask is built inside the forward.',
      controls: 'You build the mask after the forward or during it, after predicting which fits.',
      beat: CLOCK,
      ends: STAGE_ENDS,
    },
    prompt:
      'Every request of this run has structured output: before a token is sampled, the CPU builds a bitmask of the tokens its grammar allows. Does building the mask fit inside the forward?',
    stages: {
      mask: {
        title: 'The grammar mask inside a step',
        goal: {
          aim: 'Find whether the grammar mask is built inside the forward.',
          controls: 'You build the mask after the forward or during it.',
          beat: CLOCK,
          ends: STAGE_ENDS,
        },
        prompt:
          "The engine's plain step (async scheduling off): the CPU launches the forward, then builds the grammar mask while the GPU runs it, or after. Run it with the mask built after the forward, then during it.",
        prediction: { question: 'With the mask built during the forward, does it finish inside the forward?', options: MASK_CHOICES },
      },
    },
  },
}
