/**
 * The flags of the two benchmark tools that `tr8.which-flag` asks about (TR8, lesson 3; KC `tr8.tool-defaults`): for each, what it does at the
 * course's pin, what a report looks like when it is the cause of a symptom, and the change that mends it. Every fact is a claim about vLLM
 * v0.33.0 (`vllm bench serve`) or SGLang v0.5.23 (`sglang.bench_serving`), and a re-pin that moves one raises a change card for this table:
 *
 *   content/claims/vllm/bench.yaml, sglang/bench.yaml  the defaults and what each flag does (the rate, the cap, the warm-ups, the seed, the
 *                                                       percentiles, the goodput units, the EOS and the cache flush);
 *   content/claims/tr8.yaml, broken-bench.yaml          the client's timer, the guide's advice on the cap's queue time, the output cap, the
 *                                                       trace's timing.
 * tests/play/items-tr8-which-flag.test.ts holds every sentence below that states a fact to the text of the claims it names, and the numbers
 * of the cap to the benchmark generator's closed loop.
 *
 * A symptom is what a report shows, written as labelled lines of numbers and words, and never as a flag: the item asks for the flag. The
 * entries are written so that no two symptoms of one tool can be told to be the same one by a reader who knows the tools, whichever five of
 * the tool's entries sit among the options of an item.
 *
 * Every number on a ticket is a synthetic figure of the scene, tagged, and every number that is a default of the tool is a [measured] claim.
 */
import { below } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { code, num, rich, text } from '../../rich'
import type { Given, NumPart, Rich } from '../../types'

export type ToolId = 'vllm' | 'sglang'

/** The numbers of one scene of an entry: whole or decimal figures, by name. They travel in the item's params so that its solution can be written again. */
export type Nums = Readonly<Record<string, number>>

export interface Fault {
  /** The option's id: a slug, the flag without its dashes. */
  readonly id: string
  readonly tool: ToolId
  /** The flag as it is typed. */
  readonly flag: string
  /** What the flag does at the pin, as a clause that follows its name. It is why the flag is not the cause, in an item where another is. */
  readonly does: Rich
  /** What the tool does when the flag is left out, as a sentence for `default-does`. Absent where a claim does not say. */
  readonly ifLeftOut?: Rich
  /** What a fault in this flag shows on a report, as a noun phrase. */
  readonly marks: Rich
  /** Draws the numbers of a scene. */
  readonly draw: (rng: Rng) => Nums
  /** The labelled lines of the report: the symptom. */
  readonly report: (n: Nums) => Given[]
  /** Why the flag makes a run show it. */
  readonly cause: (n: Nums) => Rich
  /** The change to the command that mends it. */
  readonly fix: Rich
  /** The claims the entry's facts rest on. */
  readonly claims: readonly string[]
}

const synthetic = (value: number, unit: string, digits?: number): NumPart => num(value, { unit, tag: 'synthetic', ...(digits === undefined ? {} : { digits }) })
const derived = (value: number, unit: string, digits?: number): NumPart => num(value, { unit, tag: 'derived', ...(digits === undefined ? {} : { digits }) })
const measured = (value: number, unit?: string): NumPart => num(value, { ...(unit === undefined ? {} : { unit }), tag: 'measured' })

/** One of `values`, by the stream of `rng`. */
const oneOf = <T>(rng: Rng, values: readonly T[]): T => values[below(rng, values.length)]

/** Digits after the point of a figure written to hundredths at most. */
const digitsOf = (value: number): number => {
  const hundredths = Math.round(value * 100)
  return hundredths % 100 === 0 ? 0 : hundredths % 10 === 0 ? 1 : 2
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The cap                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Cap {
  /** The rate asked for, in requests a second. */
  readonly rate: number
  /** The cap: requests in flight at most. */
  readonly cap: number
  /** The time the server takes to answer a request, whatever the load, in ms. */
  readonly latencyMs: number
}

const CAP_RATES = [8, 10, 12, 15, 20, 24, 30, 40, 50, 60, 80, 100] as const
const CAP_PERMITS = [4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 96, 128] as const
const CAP_LATENCIES_MS = [400, 500, 600, 800, 1200, 1500, 2000, 2500, 3000, 4000, 5000] as const

/** The rate a capped run sends in steady state, in requests a second times 1,000: the permits over the time each is held. Little's law with the cap as the number in flight. */
export const sendRatePerSMilli = (cap: Cap): number => Math.round((cap.cap * 1_000_000) / cap.latencyMs)

/**
 * Every rate, cap and latency whose cap binds with room to spare: the run sends from a quarter to four fifths of the rate asked for, so the
 * cap is what sets the rate, and a rate that is nearly the cap's does not make the question a coin flip.
 */
export const CAPS: readonly Cap[] = CAP_RATES.flatMap((rate) =>
  CAP_PERMITS.flatMap((cap) => CAP_LATENCIES_MS.map((latencyMs): Cap => ({ rate, cap, latencyMs }))),
).filter((scene) => {
  const sent = sendRatePerSMilli(scene)
  return sent * 5 <= scene.rate * 4000 && sent * 4 >= scene.rate * 1000
})

/** The rate a capped run sends, in requests a second, to three significant figures. */
export function sentRate(cap: Cap): number {
  const exact = sendRatePerSMilli(cap) / 1000
  return exact >= 100 ? Math.round(exact) : exact >= 10 ? Math.round(exact * 10) / 10 : Math.round(exact * 100) / 100
}

const drawCap = (rng: Rng): Nums => {
  const scene = oneOf(rng, CAPS)
  return { rate: scene.rate, cap: scene.cap, latencyMs: scene.latencyMs }
}

const capReport = (n: Nums, waitUnseen: boolean): Given[] => [
  { label: 'request rate asked for', value: synthetic(n['rate'], 'req/s') },
  { label: 'request rate the run sent', value: synthetic(sentRate({ rate: n['rate'], cap: n['cap'], latencyMs: n['latencyMs'] }), 'req/s', digitsOf(sentRate({ rate: n['rate'], cap: n['cap'], latencyMs: n['latencyMs'] }))) },
  { label: 'time the server takes to answer a request', value: synthetic(n['latencyMs'] / 1000, 's', digitsOf(n['latencyMs'] / 1000)) },
  ...(waitUnseen ? [{ label: 'the wait before a request is sent', value: text('in none of the latencies the report prints') }] : []),
]

const capCause = (n: Nums, extra: Rich): Rich => {
  const sent = sentRate({ rate: n['rate'], cap: n['cap'], latencyMs: n['latencyMs'] })
  return rich(
    'A cap holds each request until a permit is free. ',
    synthetic(n['cap'], 'permits'),
    ' held for ',
    synthetic(n['latencyMs'] / 1000, 's', digitsOf(n['latencyMs'] / 1000)),
    ' each let ',
    derived(sent, 'req/s', digitsOf(sent)),
    ' through, whatever rate the other flag asks for. ',
    ...extra,
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The other scenes' numbers                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

const PROMPTS = [200, 300, 400, 500, 600, 800] as const
/** What the server starts a second when it is handed a burst: the p99 time to first token of a burst is about the prompts over it. */
const BURST_STARTS_PER_S = [20, 25, 40, 50, 80] as const

/** A burst of `prompts` and of twice as many, with the p99 time to first token of each: the second is twice the first. */
const drawBurst = (rng: Rng): Nums => {
  const first = oneOf(rng, PROMPTS)
  const starts = oneOf(rng, BURST_STARTS_PER_S)
  const t1 = Math.round((99 * first) / starts) / 100
  return { prompts: first, p99: t1, prompts2: 2 * first, p99b: Math.round((99 * 2 * first) / starts) / 100 }
}

const burstReport = (n: Nums): Given[] => [
  { label: 'prompts in the first run', value: synthetic(n['prompts'], 'prompts') },
  { label: 'p99 time to first token, first run', value: synthetic(n['p99'], 's', digitsOf(n['p99'])) },
  { label: 'prompts in the second run', value: synthetic(n['prompts2'], 'prompts') },
  { label: 'p99 time to first token, second run', value: synthetic(n['p99b'], 's', digitsOf(n['p99b'])) },
]

/** The median and the p99 time to first token of a run whose slowest requests are its first few. */
const drawCold = (rng: Rng): Nums => {
  const median = oneOf(rng, [120, 150, 200, 250, 300] as const)
  return { median, p99: median * oneOf(rng, [10, 12, 15, 20, 25] as const) }
}

const coldReport = (n: Nums): Given[] => [
  { label: 'median time to first token', value: synthetic(n['median'], 'ms') },
  { label: 'p99 time to first token', value: synthetic(n['p99'], 'ms') },
  { label: 'the slowest requests of the run', value: text('the first few that it sent') },
]

/** A throughput that rises when a run is repeated: the first run's, and the second's, a fifth to a half higher. */
const drawRepeat = (rng: Rng): Nums => {
  const first = oneOf(rng, [8, 10, 12, 15, 16, 20, 24, 30] as const)
  const gain = oneOf(rng, [200, 250, 300, 400, 500] as const)
  return { first, second: Math.round((first * (1000 + gain)) / 100) / 10 }
}

const repeatReport = (n: Nums): Given[] => [
  { label: 'the command', value: text('the same, run twice against one server') },
  { label: 'request throughput, first run', value: synthetic(n['first'], 'req/s') },
  { label: 'request throughput, second run', value: synthetic(n['second'], 'req/s', digitsOf(n['second'])) },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* vLLM, v0.33.0                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const BURST_CAUSE = rich(
  'With the rate left at infinity every request is sent at time zero, so the p99 measures the queue that a burst builds, and it grows with the number of prompts. It is a burst and not a rate.',
)

const TRACE_REPORT: Given[] = [
  { label: 'what the team replayed', value: text('a recorded trace, to see its bursts of arrivals') },
  { label: 'the arrivals of the replay', value: text('as even as the request rate they gave') },
]

const GOODPUT_CAUSE = rich('The objectives are in milliseconds. A value written in seconds is a thousand times too tight, and no request meets it, so the goodput is zero.')

const goodputReport = (n: Nums): Given[] => [
  { label: 'objectives the team meant', value: text('half a second to the first token, fifty milliseconds a token') },
  { label: 'median time to first token', value: synthetic(n['median'], 'ms') },
  { label: 'goodput reported', value: synthetic(0, 'req/s') },
]

const drawGoodput = (rng: Rng): Nums => ({ median: oneOf(rng, [80, 100, 120, 150, 200] as const) })
const drawNothing = (): Nums => ({})

export const VLLM_FAULTS: readonly Fault[] = [
  {
    id: 'request-rate',
    tool: 'vllm',
    flag: '--request-rate',
    does: rich('sets the rate at which requests are sent, and at its default of infinity sends all of them at time zero'),
    ifLeftOut: rich('Sends every request at time zero, a burst and not a rate'),
    marks: rich('a p99 time to first token that grows with the number of prompts'),
    draw: drawBurst,
    report: burstReport,
    cause: () => BURST_CAUSE,
    fix: rich('Give ', code('--request-rate'), ' a finite value, so that the requests arrive over time'),
    claims: ['vllm.bench.request-rate-default'],
  },
  {
    id: 'max-concurrency',
    tool: 'vllm',
    flag: '--max-concurrency',
    does: rich('caps the requests in flight with a semaphore around each request, so with it set the run is a capped closed loop and the rate it sends can fall below the one asked for'),
    ifLeftOut: rich('Puts no cap on the requests in flight'),
    marks: rich('a rate sent that is lower than the rate asked for, on a server that is not overloaded'),
    draw: drawCap,
    report: (n) => capReport(n, false),
    cause: (n) => capCause(n, rich('The run is a closed loop with a schedule on top, and its rate is the cap\'s.')),
    fix: rich('Drop ', code('--max-concurrency'), ' to measure an open loop, or report the rate the run achieved beside the rate it was asked for'),
    claims: ['vllm.bench.max-concurrency-closed-loop', 'vllm.bench.max-concurrency-default'],
  },
  {
    id: 'percentile-metrics',
    tool: 'vllm',
    flag: '--percentile-metrics',
    does: rich('names the metrics whose percentiles are printed, and by default lists time to first token, time per output token and inter-token latency, and not the time a request waits for a permit'),
    ifLeftOut: rich('Prints percentiles of time to first token, time per output token and inter-token latency'),
    marks: rich('a report with no figure for the wait before a request is sent'),
    draw: (rng) => ({ cap: oneOf(rng, [8, 16, 32, 64] as const) }),
    report: (n) => [
      { label: 'requests in flight at most', value: synthetic(n['cap'], 'requests') },
      { label: 'what the team wants to read', value: text('how long requests wait for a permit') },
      { label: 'what the report prints percentiles of', value: text('time to first token, time per output token and inter-token latency') },
    ],
    cause: () =>
      rich('The default list leaves out ', code('client_queue_time'), '. With a cap set, the guide says to include it, and the tool then reports the time spent waiting for the client\'s concurrency limit.'),
    fix: rich('Add ', code('client_queue_time'), ' to ', code('--percentile-metrics')),
    claims: ['vllm.bench.percentile-metrics-default', 'vllm.bench.client-queue-in-percentile-metrics', 'vllm.bench.client-queue-time'],
  },
  {
    id: 'num-warmups',
    tool: 'vllm',
    flag: '--num-warmups',
    does: rich('asks for warm-up requests, and its default is ', measured(0, 'requests'), ', so a run counts its first requests, which meet a cold engine'),
    ifLeftOut: rich('Sends ', measured(0, 'warm-up requests'), ', so the first requests of the run are cold ones'),
    marks: rich('the first requests of a run being its slowest'),
    draw: drawCold,
    report: coldReport,
    cause: () => rich('The default is no warm-up request, so the first requests of the run meet a cold engine and are counted. They are the slowest, and with few requests they set the p99.'),
    fix: rich('Ask for warm-up requests with ', code('--num-warmups'), ', and declare the window to leave out before the run'),
    claims: ['vllm.bench.num-warmups-default', 'vllm.bench.warmup-is-request-zero'],
  },
  {
    id: 'seed',
    tool: 'vllm',
    flag: '--seed',
    does: rich('seeds the draw of the prompts, at a default of ', measured(0), ', so two runs of the same command send the same prompts'),
    ifLeftOut: rich('Draws its prompts with a seed of ', measured(0), ', so two runs send the same ones'),
    marks: rich('a second run of the same command that is faster than the first'),
    draw: drawRepeat,
    report: repeatReport,
    cause: () => rich('The default seed gives both runs the same prompts, and the second can find them in the server\'s prefix cache, which inflates its throughput.'),
    fix: rich('Vary ', code('--seed'), ', restart or reset the server, or use ', code('vllm bench sweep serve'), ', which resets the caches between runs'),
    claims: ['vllm.bench.seed-default', 'vllm.bench.prefix-cache-reuse'],
  },
  {
    id: 'metric-percentiles',
    tool: 'vllm',
    flag: '--metric-percentiles',
    does: rich('lists the percentiles to print for each selected metric, and defaults to the 99th alone, beside the mean and the median'),
    ifLeftOut: rich('Prints the 99th percentile alone, beside the mean and the median'),
    marks: rich('a report with a 99th percentile and no other tail percentile'),
    draw: drawNothing,
    report: () => [
      { label: 'the percentile lines of the report', value: text('one for each metric, the 99th') },
      { label: 'what the team looked for', value: text('a 90th percentile') },
    ],
    cause: () => rich('The percentile list defaults to the 99th alone, so any other percentile has to be asked for.'),
    fix: rich('List the percentiles wanted in ', code('--metric-percentiles'), ', as in ', code('50,90,99')),
    claims: ['vllm.bench.metric-percentiles-default', 'vllm.bench.guide-mean-median-p99'],
  },
  {
    id: 'sharegpt-output-len',
    tool: 'vllm',
    flag: '--sharegpt-output-len',
    does: rich('gives every request of a ShareGPT run one output length in place of the lengths in the dataset, and each request carries its output length as max_tokens'),
    ifLeftOut: rich('Leaves each request with the output length of its own dataset sample'),
    marks: rich('replies cut at one length that the harness chose'),
    draw: (rng) => ({ tokens: oneOf(rng, [64, 128, 256, 512] as const) }),
    report: (n) => [
      { label: 'tokens at which the replies stop', value: synthetic(n['tokens'], 'tokens') },
      { label: 'replies that stopped there', value: text('nearly all of them, whatever the prompt') },
    ],
    cause: () =>
      rich('Each request carries ', code('max_tokens'), ' equal to its output length, and this flag sets that length for the whole run, so every reply is cut where the harness says and not where the model would stop.'),
    fix: rich('Leave ', code('--sharegpt-output-len'), ' out, so that each request keeps the output length of its own sample'),
    claims: ['vllm.bench.max-tokens-is-output-len', 'vllm.bench.sharegpt-output-len'],
  },
  {
    id: 'self-timed',
    tool: 'vllm',
    flag: '--self-timed',
    does: rich('uses a trace\'s own timing only when it is on, and it is off unless the dataset is timed_trace, so the rate given sets the arrivals'),
    ifLeftOut: rich('Ignores the timing in a trace and sends at the rate given, unless the dataset is timed_trace'),
    marks: rich('a replay whose arrivals follow the rate given and not the trace'),
    draw: drawNothing,
    report: () => TRACE_REPORT,
    cause: () => rich('With the flag off, the rate the user gives sets the arrivals and the trace\'s timing is ignored. The burstgpt loader reads only the two token counts of a row, never its timestamp.'),
    fix: rich('Turn the trace\'s own timing on with ', code('--self-timed'), ' and a dataset whose loader reads the times (', code('timed_trace'), ' does)'),
    claims: ['vllm.bench.self-timed-default', 'vllm.bench.burstgpt-lengths-only'],
  },
  {
    id: 'goodput',
    tool: 'vllm',
    flag: '--goodput',
    does: rich('takes the objectives as KEY:VALUE pairs in milliseconds, with the keys ttft, tpot and e2el'),
    marks: rich('a goodput of zero on a server that answers well'),
    draw: drawGoodput,
    report: goodputReport,
    cause: () => GOODPUT_CAUSE,
    fix: rich('Write the objectives in milliseconds, as ', code('--goodput ttft:500 tpot:50')),
    claims: ['vllm.bench.goodput-units'],
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* SGLang, v0.5.23                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export const SGLANG_FAULTS: readonly Fault[] = [
  {
    id: 'request-rate',
    tool: 'sglang',
    flag: '--request-rate',
    does: rich('sets the rate at which requests are sent, and at its default of infinity sends all of them at time zero'),
    ifLeftOut: rich('Sends every request at time zero, a burst and not a rate'),
    marks: rich('a p99 time to first token that grows with the number of prompts'),
    draw: drawBurst,
    report: burstReport,
    cause: () => BURST_CAUSE,
    fix: rich('Give ', code('--request-rate'), ' a finite value, so that the requests arrive over time'),
    claims: ['sglang.bench.request-rate-default'],
  },
  {
    id: 'max-concurrency',
    tool: 'sglang',
    flag: '--max-concurrency',
    does: rich('caps the requests in flight with a semaphore, so with it set the run is a capped closed loop, and the timer of a request starts after the semaphore, so the wait is in no latency the report prints'),
    ifLeftOut: rich('Puts no cap on the requests in flight'),
    marks: rich('a rate sent that is lower than the rate asked for, and a wait that no latency includes'),
    draw: drawCap,
    report: (n) => capReport(n, true),
    cause: (n) => capCause(n, rich('The timer of a request starts inside the request function, after the semaphore, so no latency the report prints includes the wait.')),
    fix: rich('Drop ', code('--max-concurrency'), ', or log each request\'s due time yourself: the tool\'s own timer starts after the wait'),
    claims: ['sglang.bench.max-concurrency-semaphore', 'sglang.bench.timer-inside-request'],
  },
  {
    id: 'warmup-requests',
    tool: 'sglang',
    flag: '--warmup-requests',
    does: rich('sets the warm-up requests sent before the run, at a default of ', measured(1, 'request'), ', a copy of the first request of the dataset with its output capped at ', measured(32, 'tokens')),
    ifLeftOut: rich('Sends ', measured(1, 'warm-up request'), ', a copy of the first request of the dataset'),
    marks: rich('the first requests of a run still being its slowest after the warm-up'),
    draw: drawCold,
    report: coldReport,
    cause: () =>
      rich('The default is one warm-up request, a copy of the first request of the dataset, and nothing checks that the engine has settled afterwards, so the cold start can still be in the measured run.'),
    fix: rich('Ask for more warm-up requests with ', code('--warmup-requests'), ', declare the window before the run, and check afterwards that the run had settled'),
    claims: ['sglang.bench.warmup-default', 'sglang.bench.warmup-is-request-zero'],
  },
  {
    id: 'flush-cache',
    tool: 'sglang',
    flag: '--flush-cache',
    does: rich('flushes the server\'s prefix cache after the warm-up, but only when it is given (or when SGLang\'s own CI runs the tool)'),
    ifLeftOut: rich('Does not flush the server\'s prefix cache after the warm-up'),
    marks: rich('a first request of the run that is served far faster than the others'),
    draw: (rng) => ({ others: oneOf(rng, [150, 200, 250, 300, 400] as const), first: oneOf(rng, [20, 30, 40, 50] as const) }),
    report: (n) => [
      { label: 'time to first token of the first request of the run', value: synthetic(n['first'], 'ms') },
      { label: 'median time to first token of the others', value: synthetic(n['others'], 'ms') },
    ],
    cause: () =>
      rich('The warm-up request is a copy of the first request of the dataset, and unless the cache is flushed its prompt is still in the server\'s prefix cache, so the first measured request finds it there.'),
    fix: rich('Pass ', code('--flush-cache'), ', so that the cache is flushed after the warm-up'),
    claims: ['sglang.bench.flush-cache-after-warmup', 'sglang.bench.warmup-is-request-zero'],
  },
  {
    id: 'seed',
    tool: 'sglang',
    flag: '--seed',
    does: rich('seeds the random choices of the run, at a default of ', measured(42), ', the same for every run'),
    ifLeftOut: rich('Seeds its random choices with a seed of ', measured(42), ', the same for every run'),
    marks: rich('runs that send the same prompts'),
    draw: drawNothing,
    report: () => [
      { label: 'the command', value: text('the same, run twice, with the server restarted between the runs') },
      { label: 'the prompts of the second run', value: text('the same as the first run\'s') },
    ],
    cause: () => rich('The default seed is the same for every run, so every run draws the same prompts, whether or not the server was restarted.'),
    fix: rich('Pass a different ', code('--seed'), ' to each run'),
    claims: ['sglang.bench.seed-default'],
  },
  {
    id: 'disable-ignore-eos',
    tool: 'sglang',
    flag: '--disable-ignore-eos',
    does: rich('stops the tool from sending ignore_eos as true, which it does unless the flag is given, and which makes every reply run to its output length'),
    ifLeftOut: rich('Sends ignore_eos as true, so every reply runs to its output length'),
    marks: rich('replies that never stop where the model would'),
    draw: drawNothing,
    report: () => [
      { label: 'replies that ended before the length asked for', value: synthetic(0, 'requests') },
      { label: 'what looks wrong in the results', value: text('the acceptance of speculation, or the shape of structured output') },
    ],
    cause: () => rich('The tool tells the server to ignore the end-of-sequence token unless it is told not to, so every reply runs to its length, which distorts speculation and structured output.'),
    fix: rich('Pass ', code('--disable-ignore-eos'), ', so that a reply can stop where the model does'),
    claims: ['sglang.bench.ignore-eos-default'],
  },
  {
    id: 'use-trace-timestamps',
    tool: 'sglang',
    flag: '--use-trace-timestamps',
    does: rich('schedules requests by the timestamps of a trace file, and its own help says it is only valid for the mooncake dataset'),
    ifLeftOut: rich('Schedules the requests at the rate given, and not by a trace\'s timestamps'),
    marks: rich('a replay whose arrivals follow the rate given and not the trace'),
    draw: drawNothing,
    report: () => TRACE_REPORT,
    cause: () => rich('Scheduling by a trace\'s timestamps works only for the mooncake dataset. For another dataset the rate given sets the arrivals, and the trace\'s times are lost.'),
    fix: rich('Use the mooncake dataset with ', code('--use-trace-timestamps'), ', or a client that keeps a trace\'s times'),
    claims: ['sglang.bench.trace-timestamps-mooncake-only', 'sglang.bench.mooncake-in-time', 'sglang.bench.mooncake-generator'],
  },
  {
    id: 'goodput',
    tool: 'sglang',
    flag: '--goodput',
    does: rich('takes the objectives as KEY:VALUE pairs in milliseconds, and counts a request only if it meets every one'),
    marks: rich('a goodput of zero on a server that answers well'),
    draw: drawGoodput,
    report: goodputReport,
    cause: () => GOODPUT_CAUSE,
    fix: rich('Write the objectives in milliseconds, as ', code('--goodput ttft:500 tpot:50')),
    claims: ['sglang.bench.goodput'],
  },
]

export const FAULTS: Readonly<Record<ToolId, readonly Fault[]>> = { vllm: VLLM_FAULTS, sglang: SGLANG_FAULTS }
