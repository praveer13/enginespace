/**
 * What the full service's levels and stages say, by level id and stage id (R-T02): a level's title and opening line, and for each stage its
 * title, what it asks, and its prediction's question with the unit of a number's answer or the words of a choice's options. The words are
 * display copy and no rule reads them, so they are not in a level or a state: rewording one moves no state hash and no golden. A view reads
 * them here (); the stage's world holds only what the rules need (the prediction's kind, its tolerance, which choice is right).
 *
 * The copy pairs the kitchen's word with the engine's term (GAMES.md §2.6, rule 2). It carries no digit, so no number goes untagged: the
 * cards and the tape print every figure as a Readout. A stage's words may name what its seed drew, so a prompt can be a function of that
 * (the modes stage says the backend's support level and the night's mix).
 */
import type { FullLevelId, StageId } from './types'

/** What a stage's seed drew that its words name: the backend's graph support level, and whether the night's fires mix a prompt with decodes. */
export interface StageDraw {
  readonly support: string
  readonly mixed: boolean
}

/** The unit a number's answer is written in. It is a word on the page and the slack of a µs answer, so the table holds it beside the question. */
export type PredictionUnit = 'µs' | 'calls' | 'fires' | '%'

export type PredictionCopy =
  | { readonly question: string; readonly unit: PredictionUnit }
  | { readonly question: string; readonly options: readonly string[] }

export interface StageCopy {
  readonly title: string
  /** What the stage asks, in the kitchen's words with the engine's term beside them. */
  readonly prompt: string | ((draw: StageDraw) => string)
  readonly prediction: PredictionCopy
}

export interface FullCopy {
  readonly title: string
  readonly prompt: string
  readonly stages: Readonly<Partial<Record<StageId, StageCopy>>>
}

/** The choices of the modes stage's prediction: the five modes, and none: the engine refuses, or its routines leave the night no room. */
export const MODE_CHOICES: readonly string[] = ['FULL', 'FULL_AND_PIECEWISE', 'FULL_DECODE_ONLY', 'PIECEWISE', 'NONE', 'None serves: refused, or no room']

/** The two answers of the mask: the allergy card fits inside the fire, or the line waits for it. */
export const MASK_CHOICES: readonly string[] = ['It fits inside the fire: the line never waits for the card', 'It outlasts the fire: the line waits for the card']

export const FULL_COPY: Readonly<Record<FullLevelId, FullCopy>> = {
  async: {
    title: 'Write during the fire',
    prompt:
      'Each fire the expo writes the next call and reads the last fire back. Write the next call during the fire (async scheduling) and the line need not wait. Serve the night on both cost cards.',
    stages: {
      '70b': {
        title: '70B on H100',
        prompt:
          "A 70B model on four H100s: long fires, and the expo's work per ticket is S5's host term. Serve the night with the next call written after the fire, then during it.",
        prediction: { question: 'With the next call written during the fire (async scheduling on), how long does each course take: the median TPOT, in µs?', unit: 'µs' },
      },
      small: {
        title: 'Small model',
        prompt:
          "A small model: short fires, so the expo's writing is a large share of each. Serve the night with the next call written after the fire, then during it.",
        prediction: { question: 'With the next call written during the fire (async scheduling on), how long does each course take: the median TPOT, in µs?', unit: 'µs' },
      },
    },
  },
  graphs: {
    title: 'Drilled routines',
    prompt:
      'Calling each dish costs the expo one call per kernel; a drilled routine fires the whole fire with one word (a CUDA graph replay). Three stages: the comb, the mold rack and the modes.',
    stages: {
      comb: {
        title: 'The comb',
        prompt:
          "With no routine drilled, the expo calls every dish to the line one by one: the comb's teeth. Serve the night calling each dish, then with the routines drilled (graphs on).",
        prediction: { question: 'Calling each dish, with no graph, how many calls does the expo make to launch one fire?', unit: 'calls' },
      },
      sizes: {
        title: 'The mold rack',
        prompt:
          "The rack holds a few molds, the routines the line has time to drill. A fire drops into the smallest mold that holds it, its empty places padding; a bigger fire is called dish by dish. Choose tonight's molds.",
        prediction: { question: "With vLLM's own sizes cut to the rack's molds, how many of tonight's fires are called dish by dish?", unit: 'fires' },
      },
      modes: {
        title: 'The modes',
        prompt: ({ support, mixed }) =>
          `Tonight's attention backend replays graphs at support level ${support}, the reach-in spares the routines a little room, and ${mixed ? 'most fires mix a prompt with decodes' : 'most fires only decode'}. Ask for the mode that serves fastest.`,
        prediction: { question: 'Ask for FULL tonight: which mode serves the night?', options: MODE_CHOICES },
      },
    },
  },
  mrv2: {
    title: 'The V2 runner',
    prompt:
      'The V2 runner sets up each fire from the rail itself (it prepares the inputs on the GPU), so the expo has less to write. Serve the night with each runner, on both cards.',
    stages: {
      small: {
        title: 'Small model',
        prompt:
          "A small model, whose short fires leave the expo's work exposed. Serve the night on the legacy V1 runner, then on MRV2.",
        prediction: { question: 'How many µs of each course does the V2 runner save on this card (the median TPOT on V1, less on MRV2)?', unit: 'µs' },
      },
      '70b': {
        title: '70B on H100',
        prompt:
          'The 70B model, whose fires cook for long. Serve the night on the legacy V1 runner, then on MRV2.',
        prediction: { question: 'How many µs of each course does the V2 runner save on this card (the median TPOT on V1, less on MRV2)?', unit: 'µs' },
      },
    },
  },
  close: {
    title: 'Close the bubbles',
    prompt:
      "Tonight's tickets are all due at once. Choose the configuration from the cards before a single fire: whether the next call is written during the fire and where its ids come from, the runner, the drilled routines and the molds on the rack. One night is served, and the house's own night is the bar it is judged by.",
    stages: {
      close: {
        title: 'Close the bubbles',
        prompt:
          "Tonight's tickets are all due at once. Choose the configuration from the cards before a single fire: whether the next call is written during the fire and where its ids come from, the runner, the drilled routines and the molds on the rack. One night is served, and the house's own night is the bar it is judged by.",
        prediction: { question: 'With nothing switched on (the legacy runner, the next call written after the fire, no routine drilled), what share of the night does the line sit dark?', unit: '%' },
      },
    },
  },
  mask: {
    title: 'The allergy card',
    prompt:
      'Every table tonight has an allergy: before a course is chosen, the expo strikes the dishes the table may not have (the structured-output mask). Does the card fit inside the fire?',
    stages: {
      mask: {
        title: 'The allergy card',
        prompt:
          "The engine's plain step (async scheduling off): the expo launches the fire, then writes the allergy card while the line cooks, or after. Serve it after the fire, then during it.",
        prediction: { question: 'With the card written during the fire, does it fit inside the fire?', options: MASK_CHOICES },
      },
    },
  },
}
