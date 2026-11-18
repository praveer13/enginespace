/*
 * The front page's words (REDESIGN §3.1): every fixed string the page prints, in one place, so the page, the static shell the build renders
 * from it, and verify:numbers all read the same copy. The copy holds no number of its own: the counts, ticks, minutes and hours come from
 * the model, the course index and the pointer, and each is printed with its tag. verify:numbers reads `frontCopy()` and fails on a digit
 * that no tag covers, as it does for a lesson.
 *
 * The engine's term is the only name of anything here (REDESIGN §2.7). The four outcomes are PRODUCT.md's, word for word, with the modules
 * docs/PLAN.md §2 lists for each.
 */

export const HERO = {
  headline: 'Run one step of an LLM inference engine.',
  /** What this is, at a desk's width: one paragraph, so the heading stays the largest text of the first viewport (its largest paint). */
  lede: 'enginespace is a course on the internals of vLLM and SGLang, for engineers who finished kernelspace’s serving track. You run each mechanism, read the code that implements it, then prove it on a real GPU.',
  live: 'The panel on the right is live. It takes about a minute.',
  /** The same, at a phone's width, where the panel is under it. */
  short: 'A course on vLLM and SGLang internals, for kernelspace graduates. Try the first mechanism here.',
  /** The quiet line under it: the module range and the hours by lane, read from the course index. */
  range: 'TR0 to the capstone',
  hours: 'hours',
  estimated: 'estimated',
  /** What the course takes as read from kernelspace's serving track (T5, lessons 3 to 6), after the lede at a desk. */
  assumes: 'It takes as read what that track taught: prefill and decode, the KV cache, PagedAttention and prefix caching.',
  /** The way past the demo: a text link to Course, which says where it goes. */
  skip: 'Skip the demo and see the course',
  /** The same link for a returning learner, who has Continue. */
  course: 'See the whole course',
} as const

/** A returning learner: where they left off, read from the pointer, and Continue. */
export const RETURNING = {
  /** Before the place: "You left off in TR2 lesson 1." */
  leftOff: 'You left off in',
  /** Before what comes next there: "Next: read why." */
  next: 'Next:',
  /** Where the pointer names no lesson: Review, or Course. */
  elsewhere: 'Your way on is',
  demo: 'The step loop on the right is still live, if you want a minute with it.',
} as const

/** The instrument's frame around the step loop (REDESIGN §2.6, §3.1). */
export const FRAME = {
  /** The step loop's role line (the roster's, REDESIGN §2.6). */
  role: 'You are the scheduler.',
  /** Before the level's place: "Demo 1 of 4 · Fill the batch". */
  demo: 'Demo',
  of: 'of',
  parts: 'Parts',
  /** The goal line's button on a phone, where it shows two lines. */
  more: 'more',
  less: 'less',
  diagram: 'Diagram',
  view: 'View',
  /** Why the 3D view is not offered, when the device cannot draw it. */
  no3d: 'This device draws the diagram only.',
  /** The title block: what the drawing is a model of, its clock, and what it leaves out. */
  model: 'Model of the step loop',
  clock: 'synthetic ticks, not a measurement',
  leavesOut: 'What this model leaves out',
  table: 'State as a table',
  loadingTable: 'Loading the run as a table…',
  loadingCard: 'Loading the card…',
  noScript: 'The demo needs JavaScript. The drawing above is its first frame.',
} as const

/** The dock: the controls, and the coach strip beside them. */
export const DOCK = {
  step: 'Step',
  /** Step before any slot holds a request: an outline that says why it waits. */
  stepWaits: 'Step: fill a slot first',
  stepOver: 'Step: the level is over',
  undo: 'Undo',
  auto: 'Auto-step',
  /** In the 3D view, which draws its chips on the canvas: the waiting requests as buttons. */
  waiting: 'Waiting requests',
  /** The coach strip's heading on a first visit. */
  looking: 'What you are looking at',
  next: 'Next',
  skip: 'Skip intro',
  /** The first move, around the request's name: "Put R1 in a slot.", and on a phone "Tap R1 to put it in a slot." */
  put: 'Put',
  inSlot: 'in a slot.',
  tap: 'Tap',
  toSlot: 'to put it in a slot.',
  /** The guess on demo level 3 stays on the page. */
  guessNote: 'Your guess stays on this page: nothing records it.',
} as const

/**
 * The five parts of the first level, as the coach strip says them, one short line each: the brief's lines (§3.1), which the callout discs
 * number on the drawing. The whole sentence of each, with the engine's identifier, is in the Parts list.
 */
export const COACH_PARTS = [
  { id: 'waiting', line: 'Waiting queue: requests not yet in the batch.' },
  { id: 'slot', line: 'Batch slots: the running batch, one request in each.' },
  { id: 'cpu', line: 'CPU lane: the engine core thread.' },
  { id: 'gpu', line: 'GPU lane: one forward per step.' },
  { id: 'step', line: 'Step: every live slot gets one token.' },
] as const

/** A level's result in the dock, and the way on from it (REDESIGN §2.4: the next demo level is amber, the course an outline beside it). */
export const RESULT = {
  passed: 'Passed.',
  notYet: 'Not yet.',
  /** Before the next level's title: "Next demo level: Refill a slot". */
  nextDemo: 'Next demo level',
  /**
   * After the way on's own word and before the first lesson's name: "Start the course: TR1 lesson 1". The word is `nextStep`'s, from the
   * pointer (src/settings/store.ts), so only the way on says Start.
   */
  course: 'the course',
  again: 'Run this level again',
  /** After the fourth level: the bridge to the course. */
  bridge:
    'You just ran the step loop by hand. The course starts one layer out, by following one request through the engine (TR1), then comes back to this loop with a real clock (TR2).',
} as const

export interface Outcome {
  /** PRODUCT.md's outcome, word for word. */
  readonly outcome: string
  /** The modules that evidence it (docs/PLAN.md §2). */
  readonly modules: readonly string[]
}

/** Below the fold, in plain HTML: what you will be able to do, the path, how credit works, and the same way in. */
export const OUTCOMES = {
  title: 'What you will be able to do',
  list: [
    { outcome: 'Trace a request from the API server to the model runner, naming every queue, copy and sync.', modules: ['TR1'] },
    { outcome: 'Split a TPOT into kernels, CPU gaps and overlap, and test one fix for it.', modules: ['TR2', 'TR3', 'TR6', 'capstone'] },
    {
      outcome: 'Implement a hybrid KV manager with adapter pages, the engine side of the KV connector and event contracts, and an exact rejection sampler.',
      modules: ['TR5a', 'TR5b', 'TR6'],
    },
    { outcome: 'Benchmark open-loop with confidence intervals, and land one upstream artifact under the project’s AI-disclosure rules.', modules: ['TR8', 'TR7'] },
  ] satisfies readonly Outcome[],
  modulesLabel: 'modules',
} as const

export const PATH = {
  title: 'The path',
  lede: 'Every module, in order. Each lesson has up to four sections: Run, Read, Test and Keep.',
  columns: { module: 'Module', course: 'Title', lanes: 'Needs', hours: 'Hours' },
  /** The tag of the hours column: every module's hours are [estimated] (docs/PLAN.md §4), so the head says it once. */
  estimated: 'estimated',
  startHere: 'Start here',
  unpublished: 'Not published yet',
  total: 'In all',
  /** The three lanes of work (ARCHITECTURE §8.1). */
  lanes: { B: 'browser', L: 'laptop', F: 'GPU' },
  unavailable: 'The path did not load. The Course page has every module.',
} as const

export const CREDIT = {
  title: 'How credit works',
  lines: [
    'Reading earns nothing. A lesson is done when its Test is passed: questions on new numbers, or a graded level.',
    'Practice, like this demo, is yours to repeat and records nothing. A graded run draws new numbers each time, so a pass cannot be memorised.',
    'GPU labs are checked by a grader you run on your own GPU, against reference outputs. Your record stays on your device, and you can export it.',
  ],
} as const

/** Every string above, in order, for verify:numbers and the tests. */
export function frontCopy(): string[] {
  const out: string[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'string') out.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk)
  }
  walk([HERO, RETURNING, FRAME, DOCK, COACH_PARTS, RESULT, OUTCOMES, PATH, CREDIT])
  return out
}
