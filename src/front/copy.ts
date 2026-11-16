/*
 * The front page's words (TRACKER W0-T18): every fixed string the page prints, in one place, so the page, the static shell the build
 * renders from it, and verify:numbers all read the same copy. The copy holds no number: the counts, ticks and hours come from the model
 * and the course index, and each is printed through a Readout with its tag (D-048). verify:numbers reads `frontCopy()` and fails on a
 * digit that no tag covers, as it does for a lesson.
 *
 * The engine's term is the only name of anything here (REDESIGN §2.7). The four outcomes are PRODUCT.md's,
 * word for word, with the modules docs/PLAN.md §2 lists for each and the games that teach them (D-049).
 */

export const HERO = {
  headline: 'Run one step of an LLM inference engine.',
  /** Two short paragraphs, so the heading stays the largest text of the first viewport (its largest contentful paint). */
  promise: [
    'enginespace is a course on the internals of vLLM and SGLang, for engineers who finished kernelspace’s serving track.',
    'You run each mechanism, read the code that implements it, then prove it on a real GPU. The demo is live. It takes about a minute.',
  ],
  /** The primary action: it starts the demo and does nothing else. */
  start: 'Start the demo',
} as const

/** The way into the course: one link whose label names the first lesson, its minutes and what it needs. */
export const COURSE = {
  /** Before the lesson's name: "Begin the course: TR1 lesson 1". ("Start" is the way on's word, and only `nextStep` says it.) */
  start: 'Begin the course',
} as const

/**
 * The live readout, the step loop's counters (D-048: ticks, labelled synthetic, never µs): the last step as it ran, and the next one as
 * the batch stands, before Step. The engine's term is the only name.
 */
export const TAPE = {
  /** The readout's name for a screen reader, and its stamp: every figure on it is the synthetic world's. */
  name: 'Step readout, in synthetic ticks',
  stamp: 'synthetic ticks',
  next: 'next step',
  step: 'step',
  ticksPerStep: 'ticks per step',
  busy: 'slots live',
  dark: 'empty slots',
  bubble: 'bubble',
  clock: 'clock',
  /** Printed between the clock and the reference run's, on the run's last level. */
  againstPar: 'against the reference',
  /** Between a count of slots and the batch's size. */
  of: 'of',
  notYet: 'not yet',
  /** The next step's line before a request is admitted: there is nothing to run. */
  nothingHung: 'admit a request',
  /** The next step's line once the level is over: Step runs no more on this batch, so there is no step to preview. */
  levelOver: 'none · level over: see the debrief',
  /** The next step's slots are also the control that fills them: it admits the next waiting request into the first free slot. */
  fill: 'Admit the next request into a slot',
  /** After the count of slots filled, in the control's name. */
  hung: 'slots filled',
} as const

export const DECK = {
  /** The run's name, printed on the label at the drawing's edge before the level's own name. */
  run: 'Demo',
  over: 'The level is done.',
  debrief: 'See the debrief',
  keys: 'Keys',
  undo: 'Undo',
  noScript: 'The demo needs JavaScript. The drawing above is its first frame.',
  /** What dropping a request on the drawing does, for the drag's own announcement. */
  dropHere: 'Drop it on a slot to admit it.',
  /** On the strip's housing, when more requests wait than its strip shows. */
  more: 'More requests waiting',
} as const

export const NIGHT = {
  title: 'The run so far',
  lede: 'The same run as a table, for reading and screen readers. Every tick is synthetic: this world models the loop, and the real engine is the judge.',
  card: 'What this world models',
} as const

export interface Dish {
  /** PRODUCT.md's outcome, word for word. */
  readonly outcome: string
  /** The modules that evidence it (docs/PLAN.md §2). */
  readonly modules: readonly string[]
  /** The games that teach it, by their display names (D-049). */
  readonly games: readonly string[]
}

export const ORDER = {
  title: 'What you will be able to do',
  /** The sheet's foot line, printed under the four outcomes. */
  foot: ['You', 'Four outcomes'],
  lede: 'By the end you will do these on vLLM and SGLang. Each is proved by checks you cannot fake: fresh seeds in your browser, then receipts from your own GPU.',
  dishes: [
    {
      outcome: 'Trace a request from the API server to the model runner, naming every queue, copy and sync.',
      modules: ['TR1'],
      games: ['Request path'],
    },
    {
      outcome: 'Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it.',
      modules: ['TR2', 'TR3', 'TR6', 'capstone'],
      games: ['Step loop', 'Trace attribution'],
    },
    {
      outcome:
        'Implement a hybrid KV manager with adapter pages, the engine side of the KV connector and event contracts, and an exact rejection sampler.',
      modules: ['TR5a', 'TR5b', 'TR6'],
      games: ['KV page pool', 'KV offload', 'Rejection sampler'],
    },
    {
      outcome: 'Benchmark open-loop with confidence intervals, and land one upstream artifact under the project’s AI-disclosure rules.',
      modules: ['TR8', 'TR7'],
      games: ['Broken benchmark'],
    },
  ] satisfies readonly Dish[],
  /** The column heads, for a reader who reads the order line by line. */
  modulesLabel: 'modules',
  gamesLabel: 'played in',
} as const

export const MENU = {
  title: 'The path',
  term: 'the course',
  lede: 'Every module from TR0 to the capstone, in order. Each lesson has four sections: Run, Read, Test and Keep.',
  columns: { module: 'module', course: 'title', lanes: 'needs' },
  hours: 'hours',
  /** The tag of the hours column: every module's hours are [estimated] (docs/PLAN.md §4), so the head says it once. */
  estimated: 'estimated',
  total: 'in all',
  /** The three lanes of work (ARCHITECTURE §8.1), as the path prints them. */
  lanes: { B: 'browser', L: 'laptop', F: 'GPU' },
  unavailable: 'The path did not load. The Course page has every module.',
} as const

export const NEXT = {
  /** The ticket's foot line, before its module's id. */
  foot: 'Next module',
  title: 'Read the engines',
  body: 'Trace one request through vLLM and SGLang, from the API server to the model runner. You map it in the browser first, then follow your own map through a nano-vllm fork on a GPU.',
  hours: 'hours',
  start: 'Open TR1',
} as const

/** Every string above, in order, for verify:numbers and the tests. */
export function frontCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk([HERO, COURSE, TAPE, DECK, NIGHT, ORDER, MENU, NEXT])
  return out
}
