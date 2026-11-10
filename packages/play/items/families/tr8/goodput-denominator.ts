/**
 * `tr8.goodput-denominator`: which clock a goodput divides by (TR8, lesson 4; KC `tr8.goodput-denominator`). Goodput counts the requests that
 * met every objective, per second, and the count is the part that everyone agrees on. The per-second is not: a tool divides by one of two
 * clocks, and under overload they part.
 *
 *   the whole run   from just before the first request is generated (or the first send) to just after the last reply, so a queue that is
 *                   still draining after the last arrival counts its time. `vllm bench serve` divides by it (claim vllm.bench.goodput-denominator),
 *                   and so does `sglang.bench_serving` (claim sglang.bench.goodput-duration);
 *   the window      the stretch over which requests fall due. kernelspace's knee exercise divides by it and counts the requests that met the
 *                   SLO wherever they finish (claim bench.kernelspace.knee-goodput). The course reports it as its number, with the other
 *                   beside it and labelled (ASSESSMENT B9), and a division by it is a division by the arrival window in `which-clock`.
 * The same count over two clocks makes the goodputs inverse to the clocks, so the window's is the whole run's times the run's length over
 * the window's, and the drain tail is the whole run less the window. tests/play/items-tr8-goodput-denominator.test.ts holds the model to the
 * benchmark generator's own: `summarizeRows` (packages/sim/bench/summary.ts) divides the requests that met both objectives by the arrival
 * window and by the time to the last measured reply, and the family's closed forms are those two divisions.
 *
 * The world is the course's own, and every number in it is synthetic. A run offers `n` requests over a window of `windowS` seconds, `m` of them
 * meet both objectives, and the last reply comes `wholeS` seconds after the first request. The scene is drawn from a load (below capacity, at
 * it, at twice and at three times), which sets the drain tail and the share that met, so that a heavy load has a long tail and a small share
 * as the lesson's table does. A goodput is written to three significant figures, as a tool prints it, and a key is worked from the figures
 * that the ticket prints.
 *
 * What the variants ask:
 *   tool-prints   what a named tool gives for a run: vllm bench serve and sglang.bench_serving divide by the whole run, kernelspace's knee by
 *                 the window. The clock is drawn first, so each is the key on half of the seeds. Level 3 runs it the other way: the tool gave a
 *                 goodput, and the learner finds how many requests met both objectives (levels 0 to 3);
 *   convert       one goodput, over one clock, to the other, from the two clocks. Level 3 asks for the drain tail from the two goodputs and
 *                 the window (levels 0 to 3);
 *   which-clock   a printed goodput, and four divisions that might have made it, drawn answer first: the good requests over the window or over
 *                 the whole run, and every request offered over either, which is a request rate and not goodput. Level 3 writes the clocks in
 *                 minutes and the goodput per minute (levels 0 to 3).
 * At level 0 a worked example comes first, at level 1 the first step of the solution is shown, and at level 2 the learner is alone.
 */
import { divCeil, divRound } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Rich, Step, VariantSpec } from '../../types'
import { ARITHMETIC, oneOf, shown, workedPart } from '../tr6/kit'

const FAMILY = 'tr8.goodput-denominator'
const VERSION = 1
const KC = 'tr8.goodput-denominator'

type VariantId = 'tool-prints' | 'convert' | 'which-clock'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'tool-prints', title: 'What a tool prints for a run', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'convert', title: 'A goodput over the other clock', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'which-clock', title: 'The clock a printed goodput divides by', kcs: [KC], levels: [0, 1, 2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** One run of the synthetic engine. All counts are whole and all clocks are whole seconds. */
export interface Run {
  /** Requests offered over the arrival window. */
  readonly n: number
  /** Requests that met both objectives, wherever they finished. */
  readonly m: number
  /** The arrival window, in seconds. */
  readonly windowS: number
  /** The whole run, from the first request to the last reply, in seconds: the window and the drain tail. */
  readonly wholeS: number
}

export type Clock = 'window' | 'whole'

const POWERS_OF_TEN = [1, 10, 100, 1000, 10_000, 100_000, 1_000_000] as const

/** Rounds to `sig` significant figures, as a tool prints a figure. Only `Math.round` and a table of powers of ten, which every engine gets the same (D-017). */
export function roundSig(value: number, sig = 3): number {
  const before = value >= 1000 ? 4 : value >= 100 ? 3 : value >= 10 ? 2 : value >= 1 ? 1 : value >= 0.1 ? 0 : value >= 0.01 ? -1 : -2
  const scale = POWERS_OF_TEN[Math.max(0, sig - before)]
  return Math.round(value * scale) / scale
}

/** Digits after the point of a figure that `roundSig` wrote: as many as it needs, no more. */
function digitsOf(value: number): number {
  for (let digits = 0; digits < POWERS_OF_TEN.length; digits += 1) {
    const scaled = value * POWERS_OF_TEN[digits]
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return digits
  }
  return POWERS_OF_TEN.length - 1
}

/**
 * The family's closed forms. `window` and `whole` are the two divisions of the benchmark generator's summary (`goodput.arrivalWindowPerSMilli`
 * and `totalDurationPerSMilli`), in requests a second; `tail` is the whole run less the window.
 */
export const goodputModel = {
  /** Good requests over the arrival window: kernelspace's knee, and the course's own number. */
  window: (run: Run): number => run.m / run.windowS,
  /** Good requests over the whole run, drain tail included: vllm bench serve and sglang.bench_serving. */
  whole: (run: Run): number => run.m / run.wholeS,
  /** The window's goodput over the whole run's, which is the whole run's length over the window's. */
  ratio: (run: Run): number => run.wholeS / run.windowS,
  /** The drain tail: the time a backed-up queue takes to empty after the last arrival. */
  tail: (run: Run): number => run.wholeS - run.windowS,
  of: (run: Run, clock: Clock): number => (clock === 'window' ? goodputModel.window(run) : goodputModel.whole(run)),
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The tools                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export type ToolId = 'vllm' | 'sglang' | 'knee'

export interface Tool {
  readonly id: ToolId
  /** The clock it divides by. */
  readonly clock: Clock
  /** How the stem names it. */
  readonly name: Rich
  /** What it does, in a sentence of words: the first step of a solution. */
  readonly fact: Rich
  /** The claims the sentence rests on. */
  readonly claims: readonly string[]
}

export const TOOLS: readonly Tool[] = [
  {
    id: 'vllm',
    clock: 'whole',
    name: rich(code('vllm bench serve'), ' (vLLM v0.33.0)'),
    fact: rich(
      code('vllm bench serve'),
      ' divides the requests that met every objective by the benchmark duration, which runs from just before the first request is generated to just after the last has returned. A queue that is still draining after the last arrival counts its time in the denominator.',
    ),
    claims: ['vllm.bench.goodput-denominator'],
  },
  {
    id: 'sglang',
    clock: 'whole',
    name: rich(code('sglang.bench_serving'), ' (SGLang v0.5.23)'),
    fact: rich(
      code('bench_serving'),
      ' divides the requests that met every objective by the duration of the whole run, from the first send to the last completion. The drain tail is in its denominator.',
    ),
    claims: ['sglang.bench.goodput-duration', 'sglang.bench.goodput'],
  },
  {
    id: 'knee',
    clock: 'window',
    name: rich('kernelspace\'s knee exercise'),
    fact: rich('kernelspace\'s knee counts the requests that met the objective wherever they finish, and divides by the arrival window. The drain tail is not in its denominator.'),
    claims: ['bench.kernelspace.knee-goodput', 'bench.kernelspace.knee-fixed-window'],
  },
]

const toolById = (id: unknown): Tool => {
  const found = TOOLS.find((tool) => tool.id === id)
  if (found === undefined) throw new TypeError(`${FAMILY}: no tool "${String(id)}"`)
  return found
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const WINDOWS_S = [30, 40, 45, 50, 60, 75, 90, 100, 120] as const
/** The windows of level 3's minutes: whole half-minutes, so that no clock is a fraction of one. */
const WINDOWS_MIN_S = [30, 60, 90, 120] as const
const RATES = [4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40] as const

/**
 * A load as the lesson's table has it, set against what the server can finish: the drain tail as a share of the window, in permille, and the
 * share that met both objectives, in twentieths. A server below its capacity has a short tail and most requests meet; past it the tail grows
 * and the share falls off. No tail is exactly the window (1,000 permille): where level 3 asks for the tail, that would make the printed
 * window the key one time in six, and `verify:items` holds a printed number that is the key to the bound of a blind strategy.
 */
const LOADS = [
  { tails: [125, 150, 200, 250], shares: [17, 18] },
  { tails: [250, 300, 400], shares: [12, 13, 14, 15, 16] },
  { tails: [800, 900, 1200], shares: [3, 4, 5, 6] },
  { tails: [1500, 2000], shares: [1, 2, 3] },
] as const

/** A run whose clocks are whole seconds, or whole half-minutes for level 3's minutes. The tail is at least an eighth of the window, so the two goodputs are a clear eighth apart. */
function drawRun(rng: Rng, minutes: boolean): Run {
  const windowS = oneOf(rng, minutes ? WINDOWS_MIN_S : WINDOWS_S)
  const n = oneOf(rng, RATES) * windowS
  const load = oneOf(rng, LOADS)
  const tailPermille = oneOf(rng, load.tails)
  const share = oneOf(rng, load.shares)
  const step = minutes ? 30 : 5
  const tailS = step * Math.max(divCeil(windowS, 8 * step), divRound(windowS * tailPermille, 1000 * step))
  return { n, m: divRound(n * share, 20), windowS, wholeS: windowS + tailS }
}

/** Whether four divisions give figures that are each at least a tenth from the others, so that the printed figure has one reading. Integer arithmetic on fractions. */
function separated(run: Run): boolean {
  const fractions: [number, number][] = [
    [run.m, run.windowS],
    [run.m, run.wholeS],
    [run.n, run.windowS],
    [run.n, run.wholeS],
  ]
  for (let i = 0; i < fractions.length; i += 1) {
    for (let j = i + 1; j < fractions.length; j += 1) {
      const [a, b] = fractions[i]
      const [c, d] = fractions[j]
      // a/b against c/d, the larger first: 10 × larger ≥ 11 × smaller.
      const [hi, lo] = a * d >= c * b ? [a * d, c * b] : [c * b, a * d]
      if (10 * hi < 11 * lo) return false
    }
  }
  return true
}

const paramsOf = (run: Run, more: Params = {}): Params => ({ n: run.n, m: run.m, window: run.windowS, whole: run.wholeS, ...more })

function runOf(item: Pick<Item, 'variant' | 'params'>): Run {
  const { n, m, window, whole } = item.params
  if (typeof n !== 'number' || typeof m !== 'number' || typeof window !== 'number' || typeof whole !== 'number') throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a run`)
  return { n, m, windowS: window, wholeS: whole }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit: string, digits = digitsOf(value)): NumPart => num(value, { unit, tag: 'synthetic', digits })
const derived = (value: number, unit: string, digits = digitsOf(value)): NumPart => num(value, { unit, tag: 'derived', digits })

const RPS = 'req/s'

/** The labelled lines of a run, as a ticket prints them. */
function runGivens(run: Run, which: readonly ('offered' | 'met' | 'window' | 'whole')[]): Given[] {
  const all: Record<'offered' | 'met' | 'window' | 'whole', Given> = {
    offered: { label: 'requests offered', value: given(run.n, 'requests') },
    met: { label: 'requests that met both objectives', value: given(run.m, 'requests') },
    window: { label: 'arrival window', value: given(run.windowS, 's') },
    whole: { label: 'first request to last reply', value: given(run.wholeS, 's') },
  }
  return which.map((name) => all[name])
}

const clockName = (clock: Clock): string => (clock === 'window' ? 'the arrival window' : 'the whole run')
const clockSeconds = (run: Run, clock: Clock): number => (clock === 'window' ? run.windowS : run.wholeS)

/* ------------------------------------------------------------------------------------------------------------------ */
/* tool-prints                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

interface PrintsScene {
  readonly variant: 'tool-prints'
  readonly run: Run
  readonly tool: Tool
}

function drawPrints(level: Level, seed: Seed, purpose: string, tool?: Tool): PrintsScene {
  const rng = itemRng(FAMILY, 'tool-prints', level, seed, purpose)
  const run = drawRun(rng, false)
  // The clock is drawn first, and then a tool that divides by it, so that half of the keys are the window's goodput and half the whole run's.
  const clock = oneOf(rng, ['window', 'whole'] as const)
  const drawn = oneOf(rng, TOOLS.filter((candidate) => candidate.clock === clock))
  return { variant: 'tool-prints', run, tool: tool ?? drawn }
}

const printed = (scene: PrintsScene): number => roundSig(goodputModel.of(scene.run, scene.tool.clock))

function printsSteps(scene: PrintsScene, level: Level): Step[] {
  const { run, tool } = scene
  const clock = clockSeconds(run, tool.clock)
  if (level === 3) {
    return [
      { text: tool.fact },
      {
        text: rich('The goodput is the requests that met every objective over ', clockName(tool.clock), ', so those requests are the goodput times that clock: ', given(printed(scene), RPS), ' × ', given(clock, 's'), ' = ', derived(run.m, 'requests'), '.'),
        result: derived(run.m, 'requests'),
      },
    ]
  }
  return [
    { text: tool.fact },
    { text: rich(given(run.m, 'requests'), ' ÷ ', given(clock, 's'), ' = ', derived(printed(scene), RPS), '.'), result: derived(printed(scene), RPS) },
  ]
}

function buildPrints(spec: VariantSpec, scene: PrintsScene, level: Level, seed: Seed): Item {
  const { run, tool } = scene
  const key = printed(scene)
  const inverse = level === 3
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(run, { tool: tool.id }),
      stem: inverse
        ? rich('A synthetic engine served the run below, and ', ...tool.name, ' gave it the goodput listed. How many requests met both objectives?')
        : rich('A synthetic engine served the run below. What goodput does ', ...tool.name, ' give for it, in requests a second?'),
      givens: inverse
        ? [{ label: 'goodput given', value: given(key, RPS) }, ...runGivens(run, ['offered', 'window', 'whole'])]
        : runGivens(run, ['offered', 'met', 'window', 'whole']),
      worked: workedPart(level, printsSteps(scene, level), (attempt) => {
        // The example is another tool on another run, so that its numbers are not the item's.
        const example = drawPrints(level, seed, `example-${attempt}`, TOOLS[(TOOLS.indexOf(tool) + 1 + attempt) % TOOLS.length])
        return example.run.m === run.m ? null : printsSteps(example, level)
      }),
      answer: inverse
        ? { kind: 'numeric', label: 'requests that met both objectives', unit: 'requests', truth: run.m, tolerance: ARITHMETIC }
        : { kind: 'numeric', label: 'goodput', unit: RPS, truth: key, tolerance: ARITHMETIC, digits: digitsOf(key) },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* convert                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

interface ConvertScene {
  readonly variant: 'convert'
  readonly run: Run
  /** The clock the report's goodput is over. Level 3 gives both and asks for the tail. */
  readonly from: Clock
}

function drawConvert(level: Level, seed: Seed, purpose: string, from?: Clock): ConvertScene {
  const rng = itemRng(FAMILY, 'convert', level, seed, purpose)
  // Level 3 works the tail out of two figures, so it needs a tail that two figures of four significant digits can tell: at least a half of the window.
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const run = drawRun(rng, false)
    if (level !== 3 || 2 * (run.wholeS - run.windowS) >= run.windowS) {
      const drawn = oneOf(rng, ['window', 'whole'] as const)
      return { variant: 'convert', run, from: from ?? drawn }
    }
  }
  return { variant: 'convert', run: { n: 1200, m: 300, windowS: 60, wholeS: 120 }, from: from ?? 'window' }
}

/** The sig of the figures that level 3 prints: four significant figures keep the tail within a percent. */
const sigOf = (level: Level): number => (level === 3 ? 4 : 3)

/** The figure the report gives, and the key worked from it. */
function convertFigures(scene: ConvertScene, level: Level): { given: number; key: number; other: Clock } {
  const { run, from } = scene
  const other: Clock = from === 'window' ? 'whole' : 'window'
  const reported = roundSig(goodputModel.of(run, from), sigOf(level))
  if (level === 3) return { given: reported, key: goodputModel.tail(run), other }
  // The same requests over the other clock: the reported figure times this clock over the other.
  const key = roundSig((reported * clockSeconds(run, from)) / clockSeconds(run, other))
  return { given: reported, key, other }
}

function convertSteps(scene: ConvertScene, level: Level): Step[] {
  const { run, from } = scene
  const { given: reported, key, other } = convertFigures(scene, level)
  if (level === 3) {
    const window = roundSig(goodputModel.window(run), 4)
    const whole = roundSig(goodputModel.whole(run), 4)
    return [
      { text: rich('The same requests are counted over both clocks, so the two goodputs are in inverse ratio to the clocks: the window\'s goodput over the whole run\'s is the whole run\'s length over the window\'s.') },
      {
        text: rich(given(window, RPS), ' ÷ ', given(whole, RPS), ' = ', derived(roundSig(window / whole, 4), 'x'), ', so the whole run is that many windows of ', given(run.windowS, 's'), ': ', derived(run.wholeS, 's'), '.'),
        result: derived(run.wholeS, 's'),
      },
      { text: rich('The drain tail is the whole run less the window: ', derived(run.wholeS, 's'), ' − ', given(run.windowS, 's'), ' = ', derived(key, 's'), '.'), result: derived(key, 's') },
    ]
  }
  return [
    { text: rich('The same requests are counted over both clocks, so a goodput over a longer clock is the smaller: the goodputs are in inverse ratio to the clocks, and the whole run is the window and its drain tail.') },
    {
      text: rich(given(reported, RPS), ' × ', given(clockSeconds(run, from), 's'), ' ÷ ', given(clockSeconds(run, other), 's'), ' = ', derived(key, RPS), '.'),
      result: derived(key, RPS),
    },
  ]
}

function buildConvert(spec: VariantSpec, scene: ConvertScene, level: Level, seed: Seed): Item {
  const { run, from } = scene
  const { key, other } = convertFigures(scene, level)
  const sig = sigOf(level)
  const windowFigure: Given = { label: 'goodput over the arrival window', value: given(roundSig(goodputModel.window(run), sig), RPS) }
  const wholeFigure: Given = { label: 'goodput over the whole run', value: given(roundSig(goodputModel.whole(run), sig), RPS) }
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(run, { from }),
      stem:
        level === 3
          ? rich('A report gives one run\'s goodput over its arrival window and over its whole run, drain tail included. How long is the drain tail?')
          : rich('A report gives one run\'s goodput over ', clockName(from), '. What is the same run\'s goodput over ', clockName(other), ', drain tail ', other === 'whole' ? 'included' : 'left out', '?'),
      givens:
        level === 3
          ? [windowFigure, wholeFigure, ...runGivens(run, ['window'])]
          : [from === 'window' ? windowFigure : wholeFigure, ...runGivens(run, ['window', 'whole'])],
      worked: workedPart(level, convertSteps(scene, level), (attempt) => {
        const example = drawConvert(level, seed, `example-${attempt}`, from)
        return example.run.wholeS === run.wholeS && example.run.windowS === run.windowS ? null : convertSteps(example, level)
      }),
      answer:
        level === 3
          ? { kind: 'numeric', label: 'drain tail', unit: 's', truth: key, tolerance: ARITHMETIC }
          : { kind: 'numeric', label: from === 'window' ? 'goodput over the whole run' : 'goodput over the arrival window', unit: RPS, truth: key, tolerance: ARITHMETIC, digits: digitsOf(key) },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* which-clock                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The four divisions: the numerator and the clock. */
export const DIVISIONS = ['met-window', 'met-whole', 'offered-window', 'offered-whole'] as const
export type Division = (typeof DIVISIONS)[number]
const isDivision = (value: unknown): value is Division => typeof value === 'string' && (DIVISIONS as readonly string[]).includes(value)

const DIVISION_TEXT: Readonly<Record<Division, Rich>> = {
  'met-window': rich('The requests that met both objectives, over the arrival window'),
  'met-whole': rich('The requests that met both objectives, over the whole run'),
  'offered-window': rich('Every request offered, over the arrival window'),
  'offered-whole': rich('Every request offered, over the whole run'),
}

/** What a division is, in a sentence: the same whether it is the key or a lure. */
const DIVISION_FACT: Readonly<Record<Division, Rich>> = {
  'met-window': rich('That is the goodput over the arrival window, the load offered with no drain tail in the denominator.'),
  'met-whole': rich('That is the goodput over the whole run, whose denominator carries the drain tail.'),
  'offered-window': rich('That counts every request, whatever it did to the objectives, so it is the rate at which requests were offered and not goodput.'),
  'offered-whole': rich('That counts every request, whatever it did to the objectives, so it is a request rate over the whole run and not goodput.'),
}

const numeratorOf = (run: Run, division: Division): number => (division.startsWith('met') ? run.m : run.n)
const clockOf = (division: Division): Clock => (division.endsWith('window') ? 'window' : 'whole')

interface Units {
  readonly time: 's' | 'min'
  readonly rate: string
  /** Seconds in a unit of time. */
  readonly per: number
}
const SECONDS: Units = { time: 's', rate: RPS, per: 1 }
const MINUTES: Units = { time: 'min', rate: 'req/min', per: 60 }
const unitsFor = (level: Level): Units => (level === 3 ? MINUTES : SECONDS)

interface ClockScene {
  readonly variant: 'which-clock'
  readonly run: Run
  readonly key: Division
}

/** The figure a division gives, in the scene's rate unit. */
const figureOf = (run: Run, division: Division, units: Units): number => roundSig((numeratorOf(run, division) * units.per) / clockSeconds(run, clockOf(division)))

function drawClock(level: Level, seed: Seed, purpose: string, key?: Division): ClockScene {
  const rng = itemRng(FAMILY, 'which-clock', level, seed, purpose)
  const drawn = oneOf(rng, DIVISIONS)
  // The division is drawn first and the run follows from it, redrawn until the four figures each have a reading of their own.
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const run = drawRun(rng, level === 3)
    if (separated(run)) return { variant: 'which-clock', run, key: key ?? drawn }
  }
  return { variant: 'which-clock', run: level === 3 ? { n: 3600, m: 1800, windowS: 60, wholeS: 120 } : { n: 1200, m: 900, windowS: 60, wholeS: 100 }, key: key ?? drawn }
}

function clockSteps(scene: ClockScene, level: Level): Step[] {
  const { run, key } = scene
  const units = unitsFor(level)
  const t = (seconds: number): NumPart => given(seconds / units.per, units.time)
  const fig = (division: Division): NumPart => derived(figureOf(run, division, units), units.rate)
  return [
    { text: rich('Goodput counts only the requests that met both objectives, per second, and its clock is the arrival window or the whole run with its drain tail. Try the four divisions, and keep the one that gives the figure printed.') },
    {
      text: rich(
        'The requests that met both objectives, over the window: ', given(run.m, 'requests'), ' ÷ ', t(run.windowS), ' = ', fig('met-window'), '. Over the whole run: ', given(run.m, 'requests'), ' ÷ ', t(run.wholeS), ' = ', fig('met-whole'),
        '. Every request offered, over the window: ', given(run.n, 'requests'), ' ÷ ', t(run.windowS), ' = ', fig('offered-window'), '. Over the whole run: ', given(run.n, 'requests'), ' ÷ ', t(run.wholeS), ' = ', fig('offered-whole'), '.',
      ),
    },
    { text: rich('The figure printed is ', derived(figureOf(run, key, units), units.rate), ', which only one of them gives. ', ...DIVISION_FACT[key]) },
  ]
}

function clockOptions(scene: ClockScene, level: Level, seed: Seed): ChoiceOption[] {
  const { run, key } = scene
  const units = unitsFor(level)
  const printedFigure = derived(figureOf(run, key, units), units.rate)
  return shown(
    FAMILY,
    'which-clock',
    level,
    seed,
    DIVISIONS.map((id): ChoiceOption => {
      const division = given(numeratorOf(run, id), 'requests')
      const over = given(clockSeconds(run, clockOf(id)) / units.per, units.time)
      const figure = derived(figureOf(run, id, units), units.rate)
      if (id === key) return { id, text: DIVISION_TEXT[id], why: rich(division, ' ÷ ', over, ' = ', figure, ', which is the figure printed. ', ...DIVISION_FACT[id]) }
      return { id, text: DIVISION_TEXT[id], why: rich(division, ' ÷ ', over, ' = ', figure, ', and not the ', printedFigure, ' printed. ', ...DIVISION_FACT[id]), miss: `${FAMILY}.${id}-taken-for` }
    }),
  )
}

function buildClock(spec: VariantSpec, scene: ClockScene, level: Level, seed: Seed): Item {
  const { run, key } = scene
  const units = unitsFor(level)
  const time = (seconds: number): NumPart => given(seconds / units.per, units.time)
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: paramsOf(run, { key }),
      stem: rich('A harness printed the goodput listed for the synthetic run below. Which division did it make?'),
      givens: [
        { label: 'requests offered', value: given(run.n, 'requests') },
        { label: 'requests that met both objectives', value: given(run.m, 'requests') },
        { label: 'arrival window', value: time(run.windowS) },
        { label: 'first request to last reply', value: time(run.wholeS) },
        { label: 'goodput printed', value: given(figureOf(run, key, units), units.rate) },
      ],
      worked: workedPart(level, clockSteps(scene, level), (attempt) => {
        const example = drawClock(level, seed, `example-${attempt}`, DIVISIONS[(DIVISIONS.indexOf(key) + 1 + attempt) % DIVISIONS.length])
        return example.run.m === run.m && example.run.wholeS === run.wholeS ? null : clockSteps(example, level)
      }),
      answer: { kind: 'choice', label: 'the division', options: clockOptions(scene, level, seed), correct: key },
    },
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Solutions and diagnoses                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

type Scene = PrintsScene | ConvertScene | ClockScene

function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const run = runOf(item)
  if (item.variant === 'tool-prints') return { variant: 'tool-prints', run, tool: toolById(item.params['tool']) }
  if (item.variant === 'convert') {
    const from = item.params['from']
    if (from !== 'window' && from !== 'whole') throw new TypeError(`${FAMILY}: the params of convert are not a scene`)
    return { variant: 'convert', run, from }
  }
  const key = item.params['key']
  if (!isDivision(key)) throw new TypeError(`${FAMILY}: the params of which-clock are not a scene`)
  return { variant: 'which-clock', run, key }
}

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target, 0.005)

/** What a wrong number says about the learner. The first rule that fits wins; each message names what was done. */
const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant === 'which-clock') return null
    const { run } = scene
    if (scene.variant === 'tool-prints') {
      const { tool } = scene
      if (item.level === 3) {
        const otherClock: Clock = tool.clock === 'window' ? 'whole' : 'window'
        if (near(value, printed(scene) * clockSeconds(run, otherClock))) {
          return { id: `${FAMILY}.wrong-clock`, message: rich('You multiplied by the other clock. ', ...tool.name, ' divides by ', clockName(tool.clock), ', so the requests are the goodput times that clock.') }
        }
        if (near(value, run.n)) return { id: `${FAMILY}.every-request`, message: rich('That is every request offered. Goodput counts only the requests that met every objective, so fewer than that were behind the figure.') }
        return null
      }
      const otherClock: Clock = tool.clock === 'window' ? 'whole' : 'window'
      if (near(value, goodputModel.of(run, otherClock))) {
        return { id: `${FAMILY}.wrong-clock`, message: rich('That divides by ', clockName(otherClock), '. ', ...tool.name, ' divides by ', clockName(tool.clock), '.') }
      }
      if (near(value, run.n / clockSeconds(run, tool.clock)) || near(value, run.n / clockSeconds(run, otherClock))) {
        return { id: `${FAMILY}.every-request`, message: rich('You counted every request offered. Goodput counts only the requests that met every objective.') }
      }
      return null
    }
    // convert
    const { from } = scene
    const other: Clock = from === 'window' ? 'whole' : 'window'
    if (item.level === 3) {
      if (near(value, run.wholeS)) return { id: `${FAMILY}.whole-not-tail`, message: rich('That is the whole run. The drain tail is what the whole run has beyond the arrival window.') }
      if (near(value, run.windowS)) return { id: `${FAMILY}.window-not-tail`, message: rich('That is the arrival window itself. The drain tail is the time after it, until the last reply.') }
      return null
    }
    const reported = roundSig(goodputModel.of(run, from))
    if (near(value, reported)) return { id: `${FAMILY}.same-goodput`, message: rich('You gave the same goodput back. The two clocks differ by the drain tail, so the two goodputs differ.') }
    if (near(value, (reported * clockSeconds(run, other)) / clockSeconds(run, from))) {
      return { id: `${FAMILY}.upside-down`, message: rich('You scaled it the wrong way. The whole run is the longer clock, so the goodput over it is the smaller of the two.') }
    }
    return null
  },
]

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const goodputDenominator: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The denominator of a goodput',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    switch (spec.id) {
      case 'tool-prints':
        return buildPrints(spec, drawPrints(level, seed, 'scene'), level, seed)
      case 'convert':
        return buildConvert(spec, drawConvert(level, seed, 'scene'), level, seed)
      case 'which-clock':
        return buildClock(spec, drawClock(level, seed, 'scene'), level, seed)
      default:
        throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    }
  },
  // The scene is drawn from grids in which the two clocks are a clear eighth apart, and the choice is drawn answer first and redrawn until its four figures differ, so no seed is thrown out.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)),
  solution(item) {
    const scene = sceneOf(item)
    switch (scene.variant) {
      case 'tool-prints':
        return printsSteps(scene, item.level)
      case 'convert':
        return convertSteps(scene, item.level)
      case 'which-clock':
        return clockSteps(scene, item.level)
    }
  },
}
