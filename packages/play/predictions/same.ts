/**
 * The pairs where a lesson's guess and its level's opening guess ask for the same quantity (REDESIGN §2.5, R-T09).
 *
 * A level of a game opens by asking a prediction of its own, before the learner's first move. A lesson may ask the same quantity of the same
 * engine in its own numbers: how many process boundaries a sampled token crosses, how many KV groups a model needs, how many pages an adapter
 * takes. The learner should not answer it twice. For a pair, one prompt writes the `predict` event and dispatches the session's commit with the
 * same value, and the other is not asked.
 *
 * A row holds both prompts word for word, side by side, and tests/play/predictions.test.ts fails when either the lesson's prompt or the level's
 * has changed and the row has not: whoever rewords one reads the other, and decides again whether they still ask the same thing. A row is a
 * judgement and not a computation, so it names the quantity in a phrase.
 *
 * This file imports nothing: a lesson page reads it with the plan, and it brings no game with it.
 */

export interface SamePair {
  /** The lesson's prediction. */
  readonly lesson: string
  /** The game and the level whose opening guess it shares. */
  readonly game: string
  readonly level: string
  /** What both ask for, in a phrase. */
  readonly quantity: string
  /** The lesson's prompt as the lesson writes it, without its tags. */
  readonly lessonPrompt: string
  /** The level's opening question as the game asks it. */
  readonly levelPrompt: string
}

const BOUNDARIES = 'the process boundaries a sampled token crosses on its way to the client'
const BOUNDARIES_ASK = 'How many process boundaries does a sampled token cross on its way to the client?'

export const SAME: readonly SamePair[] = [
  {
    lesson: 'tr1.l1.p1',
    game: 'engine-floor',
    level: 'nano',
    quantity: BOUNDARIES,
    lessonPrompt: "In nano-vllm's offline LLM.generate on one GPU, how many process boundaries does a sampled token cross on its way back to the caller?",
    levelPrompt: BOUNDARIES_ASK,
  },
  {
    lesson: 'tr1.l3.p1',
    game: 'engine-floor',
    level: 'mini',
    quantity: BOUNDARIES,
    lessonPrompt: 'In Mini-SGLang at one rank, serving a streamed answer, how many process boundaries does a sampled token cross on its way to the client?',
    levelPrompt: BOUNDARIES_ASK,
  },
  {
    lesson: 'tr1.l4.p1',
    game: 'engine-floor',
    level: 'inside',
    quantity: BOUNDARIES,
    lessonPrompt: 'In the engine that the post describes, serving a streamed answer at one rank, how many process boundaries does a sampled token cross on its way to the client?',
    levelPrompt: BOUNDARIES_ASK,
  },
  {
    lesson: 'tr1.l6.p1',
    game: 'engine-floor',
    level: 'sglang',
    quantity: BOUNDARIES,
    lessonPrompt: 'In SGLang v0.5.23, serving a streamed answer at one rank, how many process boundaries does a sampled token cross on its way to the client?',
    levelPrompt: BOUNDARIES_ASK,
  },
  {
    lesson: 'tr5a.l1.p1',
    game: 'pool',
    level: 'two-kinds',
    quantity: 'the pages a request holds across every KV group of the model',
    lessonPrompt:
      'A request holds 4,096 tokens. The model is the design document\'s, one full-attention group and two sliding-window groups with 16 tokens in a block and a 32-token window. How many pages does the request hold across the three groups?',
    levelPrompt: 'How many pages will the first request hold, across every KV group, once it is admitted?',
  },
  {
    lesson: 'tr5a.l2.p1',
    game: 'pool',
    level: 'same-size',
    quantity: 'the KV groups that the planner makes of a model, so that every page is one size',
    lessonPrompt:
      'A model has 12 sliding-window layers and 13 full-attention layers, and every layer costs the same bytes for a token. The planner gives each group the same number of layers, and pads a group that comes up short. How many KV cache groups does it make of this model?',
    levelPrompt: 'How many KV groups does this model need, so that every page is one size?',
  },
  {
    lesson: 'tr5a.l4.p1',
    game: 'pool',
    level: 'adapters',
    quantity: 'the pages that a LoRA adapter takes from the pool',
    lessonPrompt:
      "The pool's pages are 163,840 bytes each, and an adapter weighs 65,536 bytes for each unit of its rank. How many pages does an adapter of rank 16 take from the pool?",
    levelPrompt: 'How many pages does the larger LoRA adapter take?',
  },
]

/** The row of a lesson's prediction, or undefined when its level's opening guess asks something else. Only own names count. */
export const sameFor = (lesson: string): SamePair | undefined => SAME.find((pair) => pair.lesson === lesson)
