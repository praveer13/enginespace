/*
 * The figures of TR2's lessons, drawn from the step-loop model and the full service's levels by the functions below, so that a figure
 * is the model's own numbers and a change to the model that moves one makes `tests/content/tr2-module.test.ts` say which figure is stale.
 *
 *   bun tests/content/tr2-figures.ts      writes public/figures/tr2/*.svg from the model
 *
 * A figure is drawn in the diagram language (REDESIGN §2.8, `tests/content/figure-kit.ts`): the six-colour code with its glyphs and
 * hatches, the graticule, dimension lines with their values, mono labels. CPU work is blue, GPU work green, a sync yellow, an idle stretch
 * a dashed hollow box.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SIZES, budgetSteps, comb, enginePads, kvAfterGraphs, padRows, stepSpans, BUDGET } from './tr2-demos.ts'
import type { LaneSpan } from './tr2-demos.ts'
import { Fig, n } from './figure-kit.ts'

const GIB = 1_000_000_000

/** One decimal, trailing zero kept. */
const d1 = (x: number): string => x.toFixed(1)

/** The code colour of a span of a step: the forward is the GPU's, a sync is yellow, the rest is the CPU's. */
const slotOf = (kind: string): 'green' | 'yellow' | 'blue' => (kind === 'forward' ? 'green' : kind === 'sync' ? 'yellow' : 'blue')

/** The boxes of one lane at a scale; a span is a mark of its colour, and a forward names itself when it has room. */
function lane(fig: Fig, spans: readonly LaneSpan[], x0: number, scale: number, y: number, h: number): void {
  for (const span of spans) {
    const w = Math.max(1, (span.endUs - span.startUs) * scale)
    fig.mark(slotOf(span.kind), x0 + span.startUs * scale, y, w, h, { kind: 'span', label: span.kind === 'forward' ? 'forward' : undefined })
  }
}

/** The idle stretches of a lane: the open boxes between two spans of the lane, each with the gap's length. */
function gaps(spans: readonly LaneSpan[]): { from: number; to: number }[] {
  const sorted = [...spans].sort((a, b) => a.startUs - b.startUs)
  const out: { from: number; to: number }[] = []
  for (let i = 1; i < sorted.length; i++) if (sorted[i].startUs > sorted[i - 1].endUs) out.push({ from: sorted[i - 1].endUs, to: sorted[i].startUs })
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: one step on two lanes                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l1OneStep(): string {
  const { cpu, gpu, endUs } = stepSpans('small', false, 2)
  const X0 = 46
  const W = 308
  const scale = W / endUs
  const CPU_Y = 40
  const GPU_Y = 92
  const H = 20
  const [first, second] = [gpu[0], gpu[1]]
  const gap = second.startUs - first.endUs
  const fig = new Fig(
    214,
    'Two engine steps on a CPU lane and a GPU lane, with an open gap on the GPU lane between the forwards',
    `The CPU lane has two runs of boxes, one for each step: schedule, prepare, launch, sync and sample, in that order. The GPU lane has one box for each step, the forward, which starts when the launch ends. Between the first forward and the second the GPU lane is empty, drawn as a dashed box, for as long as the CPU lane is busy with the sync, the sample and the next step's schedule, prepare and launch: ${n(gap)} microseconds, to scale.`,
  )
  fig.grid(X0, 22, W, 104)
  fig.text(4, CPU_Y + 14, 'CPU', { bold: true })
  fig.text(4, GPU_Y + 14, 'GPU', { bold: true })
  lane(fig, cpu, X0, scale, CPU_Y, H)
  lane(fig, gpu, X0, scale, GPU_Y, H)
  for (const g of gaps(gpu)) fig.idle(X0 + g.from * scale, GPU_Y, (g.to - g.from) * scale, H)
  // The names of the CPU's runs: the plan above its lane, the sync and the sample below.
  const plan = cpu.filter((span) => span.kind === 'schedule')
  for (const span of plan) fig.text(X0 + span.startUs * scale, CPU_Y - 5, 'schedule, prepare, launch')
  const sync = cpu.filter((span) => span.kind === 'sync')
  sync.forEach((span, i) => {
    const x = X0 + span.startUs * scale
    fig.text(i === sync.length - 1 ? X0 + W : x, CPU_Y + H + 13, 'sync, sample', { anchor: i === sync.length - 1 ? 'end' : 'start' })
  })
  fig.dim(X0 + first.endUs * scale, X0 + second.startUs * scale, GPU_Y + H + 14, `bubble ${n(gap)} µs`, { below: true })
  fig.axis(X0, 150, scale, endUs, 1000, 'µs, to scale')
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'CPU work' },
      { slot: 'yellow', word: 'sync' },
      { slot: 'green', word: 'GPU work' },
      { slot: 'white', word: 'idle', hollow: true },
    ],
    4,
    186,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: the token budget of two steps                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l2Budget(): string {
  const steps = budgetSteps().slice(1)
  const X0 = 48
  const W = 306
  const scale = W / BUDGET.budget
  const H = 24
  const rows = steps.slice(0, 2)
  const fig = new Fig(
    240,
    'The token budget of two steps: the running requests first, then the prompt\'s chunk',
    `Two bars, one for each of the two steps that carry the prompt of ${n(BUDGET.prompt)} tokens, each as long as the budget of ${n(BUDGET.budget)} tokens. In each the first segment, narrow, is the ${n(BUDGET.decoding)} running requests' one token each. In the first step the rest of the budget is the prompt's first chunk, ${n(steps[0].promptTokens)} tokens. In the second step the prompt's remaining ${n(steps[1].promptTokens)} tokens follow the decodes and ${n(BUDGET.budget - steps[1].tokens)} tokens of the budget are left, drawn as a dashed box.`,
  )
  rows.forEach((step, i) => {
    const top = 4 + i * 92
    const y = top + 26
    const decodeW = step.decodeRows * scale
    const chunkW = step.promptTokens * scale
    const restW = (BUDGET.budget - step.tokens) * scale
    fig.grid(X0, y - 4, W, H + 8)
    fig.text(4, y + 16, `step ${i + 1}`, { bold: true })
    fig.dim(X0, X0 + decodeW, top + 12, `${n(step.decodeRows)} decodes, one token each`, { anchor: 'start' })
    fig.mark('blue', X0, y, decodeW, H, { kind: 'span' })
    fig.mark('green', X0 + decodeW, y, chunkW, H, { kind: 'span', label: "the prompt's chunk" })
    if (restW > 0) fig.idle(X0 + decodeW + chunkW, y, restW, H)
    fig.dim(X0 + decodeW, X0 + decodeW + chunkW, y + H + 12, `${n(step.promptTokens)} tokens of the prompt`, { below: true })
    if (restW > 0) fig.dim(X0 + decodeW + chunkW, X0 + W, y + H + 12, `${n(BUDGET.budget - step.tokens)} left`, { below: true, anchor: 'end' })
  })
  fig.dim(X0, X0 + W, 196, `the bar is the budget: ${n(BUDGET.budget)} tokens a step`, { anchor: 'start' })
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'decode' },
      { slot: 'green', word: 'prompt chunk' },
      { slot: 'white', word: 'budget left', hollow: true },
    ],
    4,
    210,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 3: overlap off and on                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l3Overlap(): string {
  const off = stepSpans('small', false, 3)
  const on = stepSpans('small', true, 3)
  const X0 = 46
  const W = 308
  const scale = W / off.endUs
  const H = 16
  const PANEL = 134
  const gapsOff = off.gpu.slice(1).map((span, i) => span.startUs - off.gpu[i].endUs)
  const gapsOn = on.gpu.slice(1).map((span, i) => span.startUs - on.gpu[i].endUs)
  const fig = new Fig(
    PANEL * 2 + 56,
    'Three engine steps with async scheduling off and on, drawn to one scale',
    `Two pairs of lanes, one pair for async scheduling off and one for on, with three steps in each. With it off, the GPU lane has an empty stretch, drawn dashed, between every two forwards, ${gapsOff.map(n).join(' and ')} microseconds, because the next step's schedule, prepare and launch wait for the last step to be read. With it on, the CPU lane writes each step's schedule, prepare and launch while the previous forward runs, the forwards follow one another with gaps of ${gapsOn.map(n).join(' and ')} microseconds, and the three steps end sooner.`,
  )
  ;[
    { name: 'async scheduling off', run: off },
    { name: 'async scheduling on', run: on },
  ].forEach(({ name, run }, p) => {
    const top = 2 + p * PANEL
    const cpuY = top + 22
    const gpuY = top + 46
    fig.grid(X0, top + 14, W, 52)
    fig.text(4, top + 10, name, { bold: true })
    fig.text(4, cpuY + 12, 'CPU')
    fig.text(4, gpuY + 12, 'GPU')
    lane(fig, run.cpu, X0, scale, cpuY, H)
    lane(fig, run.gpu, X0, scale, gpuY, H)
    for (const g of gaps(run.gpu)) {
      fig.idle(X0 + g.from * scale, gpuY, (g.to - g.from) * scale, H)
      fig.dim(X0 + g.from * scale, X0 + g.to * scale, gpuY + H + 12, `${n(g.to - g.from)} µs`, { below: true })
    }
    fig.dim(X0, X0 + run.endUs * scale, top + (gaps(run.gpu).length > 0 ? 116 : 90), `three steps: ${n(run.endUs)} µs`, { below: false, anchor: 'start' })
  })
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'CPU work' },
      { slot: 'yellow', word: 'sync' },
      { slot: 'green', word: 'GPU forward' },
      { slot: 'white', word: 'idle', hollow: true },
    ],
    4,
    PANEL + 112,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 5: the launches of one step, and the padding ladder                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l5Comb(): string {
  const c = comb()
  const X0 = 8
  const W = 344
  const scale = W / c.eagerLaunchUs
  const H = 16
  const PITCH = 64
  const fig = new Fig(
    232,
    "The CPU's launch work for one step of the small model, launched kernel by kernel, in pieces, and as one graph, to one scale",
    `Three rows on one time scale. The first has ${c.layers} teeth, one for each layer, each the ${c.kernelsPerLayer} launches of that layer, ${n(c.eagerCalls)} calls and ${n(c.eagerLaunchUs)} microseconds in all. The second is ${c.layers + 1} short boxes for the replays of the pieces with a thin launch between them for each layer's attention, ${n(c.piecewiseCalls)} calls and ${n(c.piecewiseLaunchUs)} microseconds. The third is one box, a single replay, ${n(c.fullLaunchUs)} microseconds.`,
  )
  fig.grid(X0, 4, W, 3 * PITCH - 8)
  const tooth = c.kernelsPerLayer * c.launchPerKernelUs
  const row = (i: number, label: string, total: number, draw: (y: number) => void): void => {
    const y = 4 + i * PITCH + 18
    fig.text(X0 + 2, y - 5, label, { bold: true })
    draw(y)
    fig.dim(X0, X0 + total * scale, y + H + 11, `${n(total)} µs of launches`, { below: true, anchor: 'start' })
  }
  row(0, `eager: ${n(c.eagerCalls)} calls`, c.eagerLaunchUs, (y) => {
    for (let i = 0; i < c.layers; i++) fig.mark('blue', X0 + i * tooth * scale, y, Math.max(1, tooth * scale - 1), H, { kind: 'span', noGlyph: true })
  })
  row(1, `in pieces: ${n(c.piecewiseCalls)} calls`, c.piecewiseLaunchUs, (y) => {
    let at = 0
    for (let i = 0; i <= c.layers; i++) {
      fig.mark('blue', X0 + at * scale, y, Math.max(1, c.replayUs * scale - 0.5), H, { kind: 'span', noGlyph: true })
      at += c.replayUs
      if (i < c.layers) {
        fig.mark('blue', X0 + at * scale, y, Math.max(1, c.launchPerKernelUs * scale - 0.2), H, { kind: 'span', noGlyph: true })
        at += c.launchPerKernelUs
      }
    }
  })
  row(2, 'one graph: 1 call', c.fullLaunchUs, (y) => {
    fig.mark('blue', X0, y, Math.max(1, c.fullLaunchUs * scale), H, { kind: 'span', noGlyph: true })
  })
  const bottom = fig.legend([{ slot: 'blue', word: 'CPU launch work' }], 4, 3 * PITCH + 14)
  fig.height = bottom + 2
  return fig.svg()
}

/** Rows wasted when a batch of 1 to `most` rows is padded to vLLM's default sizes: a bar for each, a tick for each captured size. */
export function l5Padding(most = 40): string {
  const rows = padRows(Array.from({ length: most }, (_, i) => i + 1))
  const X0 = 34
  const STEP = 8
  const UNIT = 8
  const PLOT = 64
  const TOP = 20
  const BASE = TOP + PLOT
  const peak = Math.max(...rows.map((row) => row.wasted ?? 0))
  const fig = new Fig(
    164,
    `Rows padded and wasted by a decode batch of 1 to ${most} rows under vLLM's default capture sizes`,
    `A bar for each batch size from 1 to ${most} rows, as tall as the rows that the batch is padded by, up to ${peak}. The bar is nothing at each captured size, 1, 2, 4, 8, 16, 24, 32 and 40, and grows by one row for each row the batch has over the last captured size, until the next size is reached. The bars run in a sawtooth that is tallest just above a size that sits far above the last, as at 9 rows and 17.`,
  )
  fig.grid(X0, TOP, most * STEP, PLOT)
  fig.text(4, TOP + 4, `${peak}`, { mono: true })
  fig.text(4, BASE + 4, '0', { mono: true })
  fig.text(X0, 11, 'rows wasted by padding', { bold: true })
  rows.forEach((row, i) => {
    const waste = row.wasted ?? 0
    if (waste > 0) fig.mark('white', X0 + i * STEP + 1, BASE - waste * UNIT, STEP - 2, waste * UNIT, { kind: 'bar', noGlyph: true })
  })
  const ticks = rows.filter((row) => row.wasted === 0)
  fig.rule(`M${X0} ${BASE}H${X0 + most * STEP}${ticks.map((row) => `M${X0 + (row.rows - 1) * STEP + STEP / 2} ${BASE}v5`).join('')}`)
  for (const row of ticks.filter((r) => DEFAULT_SIZES.includes(r.rows))) fig.text(X0 + (row.rows - 1) * STEP + STEP / 2, BASE + 18, String(row.rows), { mono: true, anchor: 'middle' })
  // The interval after a captured size: rows 9 to 16 all run at 16.
  fig.dim(X0 + 8 * STEP, X0 + 16 * STEP, BASE + 34, '9 to 16 rows run at 16', { below: true, anchor: 'start' })
  fig.text(X0 + most * STEP, BASE + 49, 'rows in the batch', { mono: true, anchor: 'end' })
  const bottom = fig.legend([{ slot: 'white', word: 'padding rows, wasted' }], 4, BASE + 62)
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 6: what the graphs take from the cache                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l6Memory(): string {
  const k = kvAfterGraphs()
  const card = 24 * GIB
  const X0 = 6
  const W = 348
  const scale = W / card
  const H = 22
  const rows = [
    { label: 'the graphs ignored', graphs: 0 },
    { label: 'the graphs taken off first', graphs: k.graphBytes },
  ]
  const fig = new Fig(
    244,
    'How the memory of a 24 GB card is divided, with the CUDA graphs ignored and with their estimate taken off before the KV cache is sized',
    `Two bars, each the whole card. In both, the weights and the activations come first, ${d1(k.nonKvBytes / GIB)} GB together, and the last ${d1((card - k.requestedBytes) / GIB)} GB are not requested, drawn dashed. In the first bar the rest, ${d1((k.requestedBytes - k.nonKvBytes) / GIB)} GB, is the KV cache. In the second the graphs' estimate, ${d1(k.graphBytes / GIB)} GB, is a box before the cache, and the KV cache is ${d1(k.kvBytes / GIB)} GB.`,
  )
  rows.forEach((row, i) => {
    const top = 4 + i * 104
    const y = top + 38
    fig.grid(X0, y - 4, W, H + 8)
    fig.text(X0, top + 10, row.label, { bold: true })
    let x = X0
    const seg = (bytes: number): { x1: number; x2: number } => {
      const out = { x1: x, x2: x + bytes * scale }
      x = out.x2
      return out
    }
    const base = seg(k.nonKvBytes)
    fig.mark('blue', base.x1, y, base.x2 - base.x1, H, { kind: 'span', label: 'weights' })
    fig.dim(base.x1, base.x2, top + 28, `${d1(k.nonKvBytes / GIB)} GB weights and activations`, { anchor: 'start' })
    if (row.graphs > 0) {
      const g = seg(row.graphs)
      fig.mark('green', g.x1, y, g.x2 - g.x1, H, { kind: 'span', noGlyph: true })
      fig.dim(g.x1, g.x2, y + H + 12, `graphs ${d1(row.graphs / GIB)} GB`, { below: true, anchor: 'start' })
    }
    const kvBytes = k.requestedBytes - k.nonKvBytes - row.graphs
    const kv = seg(kvBytes)
    fig.mark('yellow', kv.x1, y, kv.x2 - kv.x1, H, { kind: 'span', label: 'KV cache' })
    fig.dim(kv.x1, kv.x2, y + H + 12, `KV cache ${d1(kvBytes / GIB)} GB`, { below: true })
    const rest = seg(card - k.requestedBytes)
    fig.idle(rest.x1, y, rest.x2 - rest.x1, H)
  })
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'weights, activations' },
      { slot: 'green', word: 'graphs' },
      { slot: 'yellow', word: 'KV cache' },
      { slot: 'white', word: 'not requested', hollow: true },
    ],
    4,
    214,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 7: two engines' lists of sizes                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l7Buckets(most = 24): string {
  const pads = enginePads(Array.from({ length: most }, (_, i) => i + 1))
  const X0 = 52
  const STEP = 12.4
  const UNIT = 8
  const ROW_A = 70
  const ROW_B = 150
  const differ = pads.filter((p) => p.vllm !== p.sglang4090).map((p) => p.rows)
  const peak = Math.max(...pads.map((p) => (p.vllm ?? p.rows) - p.rows), ...pads.map((p) => (p.sglang4090 ?? p.rows) - p.rows))
  const fig = new Fig(
    232,
    `Rows wasted by a decode batch of 1 to ${most} rows under vLLM's list and under SGLang's, drawn to one scale`,
    `Two rows of bars, one bar for each batch size from 1 to ${most} rows, as tall as the rows the batch is padded by. The top row is vLLM's default list of sizes and the bottom row SGLang's decode buckets. They differ only for the batches of ${differ[0]} to ${differ[differ.length - 1]} rows, which vLLM pads to 16 and SGLang to 12, because SGLang has a bucket at 12 and vLLM has none.`,
  )
  const draw = (base: number, name: string, padded: (p: (typeof pads)[number]) => number | null): void => {
    fig.grid(X0, base - peak * UNIT, most * STEP, peak * UNIT, 8, 40)
    fig.text(4, base - 24, name, { bold: true })
    fig.text(X0 - 5, base - peak * UNIT + 4, String(peak), { mono: true, anchor: 'end' })
    pads.forEach((p, i) => {
      const to = padded(p)
      const waste = to === null ? 0 : to - p.rows
      if (waste > 0) fig.mark('white', X0 + i * STEP + 1, base - waste * UNIT, STEP - 2, waste * UNIT, { kind: 'bar', noGlyph: true })
    })
    fig.rule(`M${X0} ${base}H${X0 + most * STEP}`)
  }
  draw(ROW_A, 'vLLM', (p) => p.vllm)
  draw(ROW_B, 'SGLang', (p) => p.sglang4090)
  for (const p of pads.filter((q) => q.rows % 4 === 0 || q.rows === 1)) fig.text(X0 + (p.rows - 1) * STEP + STEP / 2, ROW_B + 15, String(p.rows), { mono: true, anchor: 'middle' })
  fig.text(X0 + most * STEP, ROW_B + 29, 'rows in the batch', { mono: true, anchor: 'end' })
  const first = differ[0]
  const last = differ[differ.length - 1]
  fig.dim(X0 + (first - 1) * STEP, X0 + last * STEP, ROW_B + 46, `${first} to ${last} rows: 16 against 12`, { below: true, anchor: 'middle' })
  const bottom = fig.legend([{ slot: 'white', word: 'padding rows, wasted' }], 4, ROW_B + 70)
  fig.height = bottom + 2
  return fig.svg()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The files                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The figures of the lessons, by the file that holds each under public/figures/tr2/. */
export const FIGURES: Readonly<Record<string, () => string>> = {
  'l1-one-step.svg': l1OneStep,
  'l2-budget.svg': l2Budget,
  'l3-overlap.svg': l3Overlap,
  'l5-comb.svg': l5Comb,
  'l5-padding.svg': l5Padding,
  'l6-memory.svg': l6Memory,
  'l7-buckets.svg': l7Buckets,
}

if (import.meta.main) {
  const dir = path.resolve(import.meta.dirname, '../../public/figures/tr2')
  for (const [file, draw] of Object.entries(FIGURES)) {
    writeFileSync(path.join(dir, file), draw())
    console.log(`wrote public/figures/tr2/${file}`)
  }
}
