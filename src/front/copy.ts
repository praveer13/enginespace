/*
 * The front page's words (TRACKER W0-T18): every fixed string the page prints, in one place, so the page, the static shell the build
 * renders from it, and verify:numbers all read the same copy. The copy holds no number: the counts, ticks and hours come from the model
 * and the course index, and each is printed through a Readout with its tag (D-048). verify:numbers reads `frontCopy()` and fails on a
 * digit that no tag covers, as it does for a lesson.
 *
 * The kitchen word names the object and the engine term names the concept (GAMES.md §2.6, rule 2). The four outcomes are PRODUCT.md's,
 * word for word, with the modules docs/PLAN.md §2 lists for each and the games that teach them (D-049).
 */

export const HERO = {
  headline: 'Fire the next step.',
  /** Two short paragraphs, so the heading stays the largest text of the first viewport (its largest contentful paint). */
  promise: [
    'Every bell is one step of an LLM engine’s loop.',
    'This course teaches vLLM and SGLang by having you run them yourself, then makes you prove it on a real GPU.',
  ],
  /** The primary action, on the order ticket's tear-off stub. */
  start: 'Start service',
} as const

/**
 * The printer's tape, the live readout (D-048: ticks, labelled synthetic, never µs): the last fire as it was cooked, and the next one
 * as the rail stands, before the bell. The kitchen word, then the engine term.
 */
export const TAPE = {
  /** The tape's name for a screen reader, and its stamp: every figure on it is the synthetic world's. */
  name: "The printer's tape, in synthetic ticks",
  stamp: 'synthetic ticks',
  next: 'next fire',
  fire: { kitchen: 'fire', engine: 'step' },
  ticksPerStep: { kitchen: 'ticks per step', engine: null },
  busy: { kitchen: 'stations busy', engine: 'batch' },
  dark: { kitchen: 'dark stations', engine: 'empty slots' },
  bubble: { kitchen: 'dark stretches', engine: 'bubble' },
  clock: { kitchen: 'clock', engine: null },
  /** Printed between the clock and par, on the run's last level. */
  againstPar: 'against',
  /** Between a count of stations and the rail's clips. */
  of: 'of',
  notYet: 'not yet',
  /** The next fire's line before a ticket is on the rail: there is nothing to fire. */
  nothingHung: 'hang a ticket',
  /** The next fire's line once the level is over: the bell rings no more on this rail, so there is no fire to preview. */
  levelOver: 'none · level over: see the debrief',
  /** The next fire's stations are also the control that fills them: it hangs the next ticket in line on the first free clip. */
  fill: 'Hang the next ticket on the rail',
  /** After the count of clips taken, in the control's name. */
  hung: 'hung',
} as const

export const DECK = {
  /** The run's name, printed on the tape label at the pass's edge before the level's own name. */
  run: 'First service',
  over: 'The fire is in.',
  debrief: 'See the debrief',
  keys: 'Keys',
  undo: 'Undo',
  noScript: 'Service runs in your browser, so playing it needs JavaScript. The drawing above is its first frame.',
  /** What dropping a ticket on the pass does, for the drag's own announcement. */
  dropHere: 'Drop it on the pass to hang it on the rail.',
  /** On the printer's housing, when it holds more tickets than its strip shows. */
  more: 'More tickets inside',
} as const

export const NIGHT = {
  title: 'The night so far',
  lede: 'The same service as a table, for reading, zooming and screen readers. Every tick here is synthetic: this world is a model of the loop, and the real engine is the judge.',
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
  title: 'The order',
  /** The ticket's foot line, printed under the four dishes: the table, and what it ordered. */
  foot: ['Table: you', 'Four things to do'],
  lede: 'By the end you will do these on vLLM and SGLang. Each is proved by checks you cannot fake: fresh seeds in your browser, then receipts from your own GPU.',
  dishes: [
    {
      outcome: 'Trace a request from the API server to the model runner, naming every queue, copy and sync.',
      modules: ['TR1'],
      games: ['Back of House'],
    },
    {
      outcome: 'Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it.',
      modules: ['TR2', 'TR3', 'TR6', 'capstone'],
      games: ['Service', 'The Tape'],
    },
    {
      outcome:
        'Implement a hybrid KV manager with adapter pages, the engine side of the KV connector and event contracts, and an exact rejection sampler.',
      modules: ['TR5a', 'TR5b', 'TR6'],
      games: ['The Reach-In', 'The Dumbwaiter', 'The Tasting'],
    },
    {
      outcome: 'Benchmark open-loop with confidence intervals, and land one upstream artifact under the project’s AI-disclosure rules.',
      modules: ['TR8', 'TR7'],
      games: ['The Inspection'],
    },
  ] satisfies readonly Dish[],
  /** The column heads, for a reader who reads the order line by line. */
  modulesLabel: 'modules',
  gamesLabel: 'played as',
} as const

export const MENU = {
  title: 'The menu',
  term: 'the course map',
  lede: 'Every module from TR0 to the capstone, in the order you meet them. Each one runs Predict, Play, Build, Prove and Keep.',
  columns: { module: 'module', course: 'course', lanes: 'where' },
  hours: 'hours',
  /** The tag of the hours column: every module's hours are [estimated] (docs/PLAN.md §4), so the head says it once. */
  estimated: 'estimated',
  total: 'in all',
  /** The three lanes of work (ARCHITECTURE §8.1), as the menu prints them. */
  lanes: { B: 'browser', L: 'laptop', F: 'GPU' },
  unavailable: 'The menu did not print. The course map has every module.',
} as const

export const NEXT = {
  /** The ticket's foot line, before its module's id. */
  foot: 'Next ticket',
  title: 'Read the engines',
  body: 'Trace one request through vLLM and SGLang, from the API server to the model runner. You map it in the browser first, then follow your own map through a nano-vllm fork on a GPU.',
  hours: 'hours',
  start: 'Start TR1',
  /** Printed under the stub while TR1's lessons are still being written, so the stub never promises more than the page holds. */
  planned: 'TR1’s lessons are being written. Its page shows what it covers.',
} as const

/** Every string above, in order, for verify:numbers and the tests. */
export function frontCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk([HERO, TAPE, DECK, NIGHT, ORDER, MENU, NEXT])
  return out
}
