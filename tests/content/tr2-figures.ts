/*
 * The figures of TR2's lessons (W1-T15), drawn from the step-loop model and the full service's levels by the functions below, so that a figure
 * is the model's own numbers and a change to the model that moves one makes `tests/content/tr2-module.test.ts` say which figure is stale.
 *
 *   bun tests/content/tr2-figures.ts      writes public/figures/tr2/*.svg from the model
 *
 * A figure is drawn in the page's ink and nothing else (DESIGN.md; AGENTS.md rule 9): `currentColor` for every stroke and fill, shades by
 * `fill-opacity`, dashes for what is missing, and no typeface of its own. Nothing in one is a colour, so nothing in one means a state by colour
 * alone: a gap is a dashed outline and an empty place is an open one.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SIZES, budgetSteps, comb, enginePads, kvAfterGraphs, padRows, stepSpans, BUDGET } from './tr2-demos.ts'
import type { LaneSpan } from './tr2-demos.ts'

const GIB = 1_000_000_000

/** A number with its thousands separators. */
const n = (x: number): string => x.toLocaleString('en-US')

/** One decimal, trailing zero kept. */
const d1 = (x: number): string => x.toFixed(1)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1: one step on two lanes                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const PLAN = new Set(['schedule', 'prepare', 'launch'])

/** The shade of a span: the CPU's work before the forward is light, its work after the forward is darker, and the forward darkest. */
const shade = (kind: string): number => (kind === 'forward' ? 0.55 : PLAN.has(kind) ? 0.14 : 0.34)

/** Boxes for the spans of one lane at a scale, as SVG rectangles, one group for each shade. */
function laneBoxes(spans: readonly LaneSpan[], x0: number, scale: number, y: number, height: number): string {
  const groups = new Map<number, string[]>()
  for (const span of spans) {
    const opacity = shade(span.kind)
    const list = groups.get(opacity) ?? []
    list.push(`    <rect x="${(x0 + span.startUs * scale).toFixed(2)}" y="${y}" width="${Math.max(0.8, (span.endUs - span.startUs) * scale).toFixed(2)}" height="${height}"/>`)
    groups.set(opacity, list)
  }
  return [...groups.entries()].map(([opacity, rects]) => `  <g fill="currentColor" fill-opacity="${opacity}">\n${rects.join('\n')}\n  </g>`).join('\n')
}

/** The gaps of a lane, as dashed boxes: the stretches between two spans of the lane that are inside the window. */
function laneGaps(spans: readonly LaneSpan[], x0: number, scale: number, y: number, height: number): string {
  const sorted = [...spans].sort((a, b) => a.startUs - b.startUs)
  const boxes: string[] = []
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1].endUs
    const to = sorted[i].startUs
    if (to > from) boxes.push(`    <rect x="${(x0 + from * scale).toFixed(2)}" y="${y}" width="${((to - from) * scale).toFixed(2)}" height="${height}"/>`)
  }
  return boxes.join('\n')
}

export function l1OneStep(): string {
  const { cpu, gpu, endUs } = stepSpans('small', false, 2)
  const X0 = 46
  const W = 308
  const scale = W / endUs
  const CPU_Y = 30
  const GPU_Y = 74
  const H = 22
  const firstForwardEnd = gpu[0].endUs
  const secondForwardStart = gpu[1].startUs
  const gap = secondForwardStart - firstForwardEnd
  const gx = X0 + firstForwardEnd * scale
  const gw = gap * scale
  const schedule = cpu.filter((span) => span.kind === 'schedule')
  const labels = schedule.map((span) => `    <text x="${(X0 + ((span.startUs + span.endUs) / 2) * scale).toFixed(1)}" y="${CPU_Y + 15}">schedule</text>`)
  const samples = cpu.filter((span) => span.kind === 'sample')
  const sampleLabels = samples.map((span) => `    <text x="${(X0 + ((span.startUs + span.endUs) / 2) * scale).toFixed(1)}" y="${CPU_Y - 4}">sample</text>`)
  const forwards = gpu.map((span) => `    <text x="${(X0 + ((span.startUs + span.endUs) / 2) * scale).toFixed(1)}" y="${GPU_Y + 15}">forward</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 138" width="360" height="138" fill="none" stroke="currentColor" stroke-width="1">
  <title>Two engine steps on a CPU lane and a GPU lane, with an open gap on the GPU lane between the forwards</title>
  <desc>The CPU lane has two runs of boxes, one for each step: schedule, prepare, launch, sync and sample, in that order. The GPU lane has one box for each step, the forward, which starts when the launch ends. Between the first forward and the second the GPU lane is empty, drawn as a dashed box, for as long as the CPU lane is busy with the sync, the sample and the next step's schedule, prepare and launch: ${n(gap)} microseconds, to scale.</desc>
  <g stroke="none" fill="currentColor" font-size="10">
    <text x="4" y="${CPU_Y + 15}">CPU</text>
    <text x="4" y="${GPU_Y + 15}">GPU</text>
  </g>
${laneBoxes(cpu, X0, scale, CPU_Y, H)}
${laneBoxes(gpu, X0, scale, GPU_Y, H)}
  <g stroke-dasharray="3 3">
${laneGaps(gpu, X0, scale, GPU_Y, H)}
  </g>
  <g stroke-width="1">
    <path d="M${gx.toFixed(2)} ${GPU_Y + H + 6}V${GPU_Y + H + 11}H${(gx + gw).toFixed(2)}V${GPU_Y + H + 6}"/>
  </g>
  <g stroke="none" fill="currentColor" font-size="8" text-anchor="middle">
${labels.join('\n')}
${forwards.join('\n')}
${sampleLabels.join('\n')}
    <text x="${(gx + gw / 2).toFixed(1)}" y="${GPU_Y + H + 22}">bubble: ${n(gap)} µs, the CPU's work</text>
  </g>
  <g stroke="none" fill="currentColor" font-size="8">
    <text x="${X0}" y="133">light: schedule, prepare, launch · dark: sync, sample</text>
  </g>
</svg>
`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 2: the token budget of two steps                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l2Budget(): string {
  const steps = budgetSteps().slice(1)
  const X0 = 52
  const W = 300
  const scale = W / BUDGET.budget
  const H = 24
  const rows = steps.slice(0, 2)
  const boxes: string[] = []
  const solid: string[] = []
  const light: string[] = []
  const open: string[] = []
  const texts: string[] = []
  rows.forEach((step, i) => {
    const y = 26 + i * 52
    const decodeW = step.decodeRows * scale
    const chunkW = step.promptTokens * scale
    const restW = (BUDGET.budget - step.tokens) * scale
    solid.push(`    <rect x="${X0}" y="${y}" width="${decodeW.toFixed(2)}" height="${H}"/>`)
    light.push(`    <rect x="${(X0 + decodeW).toFixed(2)}" y="${y}" width="${chunkW.toFixed(2)}" height="${H}"/>`)
    if (restW > 0) open.push(`    <rect x="${(X0 + decodeW + chunkW).toFixed(2)}" y="${y}" width="${restW.toFixed(2)}" height="${H}"/>`)
    texts.push(`    <text x="4" y="${y + 16}">step ${i + 1}</text>`)
    texts.push(`    <text x="${(X0 + decodeW + chunkW / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle">the prompt's chunk: ${n(step.promptTokens)} tokens</text>`)
    if (restW > 0) texts.push(`    <text x="${(X0 + decodeW + chunkW + restW / 2).toFixed(1)}" y="${y + 16}" text-anchor="middle">${n(BUDGET.budget - step.tokens)} left</text>`)
    texts.push(`    <text x="${X0}" y="${y - 4}">${n(step.decodeRows)} decodes, one token each</text>`)
  })
  boxes.push(`  <g fill="currentColor" fill-opacity="0.55">\n${solid.join('\n')}\n  </g>`)
  boxes.push(`  <g fill="currentColor" fill-opacity="0.16">\n${light.join('\n')}\n  </g>`)
  boxes.push(`  <g stroke-dasharray="3 3">\n${open.join('\n')}\n  </g>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 130" width="360" height="130" fill="none" stroke="currentColor" stroke-width="1">
  <title>The token budget of two steps: the running requests first, then the prompt's chunk</title>
  <desc>Two bars, one for each of the two steps that carry the prompt of ${n(BUDGET.prompt)} tokens, each as long as the budget of ${n(BUDGET.budget)} tokens. In each the first segment, narrow and dark, is the ${n(BUDGET.decoding)} running requests' one token each. In the first step the rest of the budget is the prompt's first chunk, ${n(steps[0].promptTokens)} tokens. In the second step the prompt's remaining ${n(steps[1].promptTokens)} tokens follow the decodes and ${n(BUDGET.budget - steps[1].tokens)} tokens of the budget are left, drawn as a dashed box.</desc>
${boxes.join('\n')}
  <g stroke="none" fill="currentColor" font-size="9">
${texts.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="8">
    <text x="${X0}" y="124">the bar is the budget: ${n(BUDGET.budget)} tokens a step</text>
  </g>
</svg>
`
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
  const H = 18
  const panels: string[] = []
  const labels: string[] = []
  ;[
    { name: 'async scheduling off', run: off, y: 16 },
    { name: 'async scheduling on', run: on, y: 98 },
  ].forEach(({ name, run, y }) => {
    labels.push(`    <text x="4" y="${y - 4}">${name}</text>`)
    labels.push(`    <text x="4" y="${y + 13}">CPU</text>`)
    labels.push(`    <text x="4" y="${y + 13 + 28}">GPU</text>`)
    panels.push(laneBoxes(run.cpu, X0, scale, y, H))
    panels.push(laneBoxes(run.gpu, X0, scale, y + 28, H))
    panels.push(`  <g stroke-dasharray="3 3">\n${laneGaps(run.gpu, X0, scale, y + 28, H)}\n  </g>`)
  })
  const gapsOff = off.gpu.slice(1).map((span, i) => span.startUs - off.gpu[i].endUs)
  const gapsOn = on.gpu.slice(1).map((span, i) => span.startUs - on.gpu[i].endUs)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 170" width="360" height="170" fill="none" stroke="currentColor" stroke-width="1">
  <title>Three engine steps with async scheduling off and on, drawn to one scale</title>
  <desc>Two pairs of lanes, one pair for async scheduling off and one for on, with three steps in each. With it off, the GPU lane has an empty stretch, drawn dashed, between every two forwards, ${gapsOff.map(n).join(' and ')} microseconds, because the next step's schedule, prepare and launch wait for the last step to be read. With it on, the CPU lane writes each step's schedule, prepare and launch while the previous forward runs, the forwards follow one another with gaps of ${gapsOn.map(n).join(' and ')} microseconds, and the three steps end sooner.</desc>
  <g stroke="none" fill="currentColor" font-size="9">
${labels.join('\n')}
  </g>
${panels.join('\n')}
  <g stroke="none" fill="currentColor" font-size="8">
    <text x="${X0}" y="157">one scale: light is schedule, prepare, launch;</text>
    <text x="${X0}" y="167">darker is sync, sample; darkest is the forward</text>
  </g>
</svg>
`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 5: the comb and the replay, and the padding ladder                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l5Comb(): string {
  const c = comb()
  const X0 = 98
  const W = 256
  const scale = W / c.eagerLaunchUs
  const H = 14
  const rows: { y: number; label: string; boxes: string[] }[] = []
  // Eager: one tooth for each layer, each as long as the layer's launches.
  const tooth = c.kernelsPerLayer * c.launchPerKernelUs
  const eager = Array.from({ length: c.layers }, (_, i) => `    <rect x="${(X0 + i * tooth * scale).toFixed(2)}" y="22" width="${Math.max(0.8, tooth * scale - 1).toFixed(2)}" height="${H}"/>`)
  rows.push({ y: 22, label: `eager: ${n(c.eagerCalls)} calls`, boxes: eager })
  // In pieces: a replay, then a launch of the layer's attention, for each layer, and a last replay.
  const pieces: string[] = []
  let at = 0
  for (let i = 0; i <= c.layers; i++) {
    pieces.push(`    <rect x="${(X0 + at * scale).toFixed(2)}" y="52" width="${Math.max(0.8, c.replayUs * scale - 0.5).toFixed(2)}" height="${H}"/>`)
    at += c.replayUs
    if (i < c.layers) {
      pieces.push(`    <rect x="${(X0 + at * scale).toFixed(2)}" y="52" width="${Math.max(0.8, c.launchPerKernelUs * scale - 0.2).toFixed(2)}" height="${H}"/>`)
      at += c.launchPerKernelUs
    }
  }
  rows.push({ y: 52, label: `in pieces: ${n(c.piecewiseCalls)} calls`, boxes: pieces })
  rows.push({ y: 82, label: 'one graph: 1 call', boxes: [`    <rect x="${X0}" y="82" width="${Math.max(0.8, c.fullLaunchUs * scale).toFixed(2)}" height="${H}"/>`] })
  const texts = rows.map((row) => `    <text x="4" y="${row.y + 11}">${row.label}</text>`)
  const times = [
    `    <text x="${X0 + 0}" y="${22 + H + 11}">${n(c.eagerLaunchUs)} µs of launches</text>`,
    `    <text x="${(X0 + c.piecewiseLaunchUs * scale + 6).toFixed(1)}" y="${52 + 11}">${n(c.piecewiseLaunchUs)} µs</text>`,
    `    <text x="${(X0 + c.fullLaunchUs * scale + 6).toFixed(1)}" y="${82 + 11}">${n(c.fullLaunchUs)} µs</text>`,
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 112" width="360" height="112" fill="none" stroke="currentColor" stroke-width="1">
  <title>The CPU's launch work for one step of the small model, launched kernel by kernel, in pieces, and as one graph, to one scale</title>
  <desc>Three rows on one time scale. The first has ${c.layers} teeth, one for each layer, each the ${c.kernelsPerLayer} launches of that layer, ${n(c.eagerCalls)} calls and ${n(c.eagerLaunchUs)} microseconds in all. The second is ${c.layers + 1} short boxes for the replays of the pieces with a thin launch between them for each layer's attention, ${n(c.piecewiseCalls)} calls and ${n(c.piecewiseLaunchUs)} microseconds. The third is one box, a single replay, ${n(c.fullLaunchUs)} microseconds.</desc>
  <g fill="currentColor" fill-opacity="0.34">
${[...rows[0].boxes, ...rows[1].boxes, ...rows[2].boxes].join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="9">
${texts.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="8">
${times.join('\n')}
  </g>
</svg>
`
}

/** Rows wasted when a batch of 1 to `most` rows is padded to vLLM's default sizes: a bar for each, a tick for each captured size. */
export function l5Padding(most = 40): string {
  const rows = padRows(Array.from({ length: most }, (_, i) => i + 1))
  const X0 = 30
  const STEP = 8
  const BASE = 96
  const UNIT = 9
  const bars = rows.map((row, i) => `    <rect x="${X0 + i * STEP}" y="${BASE - (row.wasted ?? 0) * UNIT}" width="${STEP - 2}" height="${(row.wasted ?? 0) * UNIT}"/>`)
  const ticks = rows.filter((row) => row.wasted === 0).map((row) => `M${X0 + (row.rows - 1) * STEP + (STEP - 2) / 2} ${BASE}v5`)
  const marks = rows.filter((row) => row.wasted === 0 && DEFAULT_SIZES.includes(row.rows)).map((row) => `    <text x="${X0 + (row.rows - 1) * STEP + (STEP - 2) / 2}" y="${BASE + 15}">${row.rows}</text>`)
  const peak = Math.max(...rows.map((row) => row.wasted ?? 0))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 124" width="360" height="124" fill="none" stroke="currentColor" stroke-width="1">
  <title>Rows padded and wasted by a decode batch of 1 to ${most} rows under vLLM's default capture sizes</title>
  <desc>A bar for each batch size from 1 to ${most} rows, as tall as the rows that the batch is padded by, up to ${peak}. The bar is nothing at each captured size, 1, 2, 4, 8, 16, 24, 32 and 40, and grows by one row for each row the batch has over the last captured size, until the next size is reached. The bars run in a sawtooth that is tallest just above a size that sits far above the last, as at 9 rows and 17.</desc>
  <g fill="currentColor" fill-opacity="0.34">
${bars.join('\n')}
  </g>
  <path d="M${X0} ${BASE}H${X0 + most * STEP}"/>
  <path d="${ticks.join('')}"/>
  <g stroke="none" fill="currentColor" font-size="8" text-anchor="middle">
${marks.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="8">
    <text x="${X0}" y="11">rows wasted</text>
    <text x="${X0}" y="121">rows in the batch; the numbers are the captured sizes</text>
  </g>
</svg>
`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 6: what the graphs take from the cache                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l6Memory(): string {
  const k = kvAfterGraphs()
  const card = 24 * GIB
  const X0 = 28
  const W = 324
  const scale = W / card
  const H = 22
  const weights = 1.2 * GIB
  const activations = k.nonKvBytes - weights
  const rows = [
    { y: 28, label: 'the graphs ignored', graphs: 0 },
    { y: 76, label: 'the graphs taken off first', graphs: k.graphBytes },
  ]
  const solid: string[] = []
  const mid: string[] = []
  const light: string[] = []
  const open: string[] = []
  const texts: string[] = []
  for (const row of rows) {
    let x = X0
    const seg = (bytes: number, into: string[]) => {
      into.push(`    <rect x="${x.toFixed(2)}" y="${row.y}" width="${(bytes * scale).toFixed(2)}" height="${H}"/>`)
      x += bytes * scale
    }
    seg(weights, solid)
    seg(activations, solid)
    if (row.graphs > 0) seg(row.graphs, mid)
    const kv = k.requestedBytes - k.nonKvBytes - row.graphs
    seg(kv, light)
    open.push(`    <rect x="${x.toFixed(2)}" y="${row.y}" width="${((card - k.requestedBytes) * scale).toFixed(2)}" height="${H}"/>`)
    texts.push(`    <text x="${X0}" y="${row.y - 5}">${row.label}: KV cache ${d1(kv / GIB)} GB</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 118" width="360" height="118" fill="none" stroke="currentColor" stroke-width="1">
  <title>How the memory of a 24 GB card is divided, with the CUDA graphs ignored and with their estimate taken off before the KV cache is sized</title>
  <desc>Two bars, each the whole card. In both, the weights and the activations come first, ${d1(k.nonKvBytes / GIB)} GB together, and the last ${d1((card - k.requestedBytes) / GIB)} GB are not requested, drawn dashed. In the first bar the rest, ${d1((k.requestedBytes - k.nonKvBytes) / GIB)} GB, is the KV cache. In the second the graphs' estimate, ${d1(k.graphBytes / GIB)} GB, is a mid-dark box before the cache, and the KV cache is ${d1(k.kvBytes / GIB)} GB.</desc>
  <g fill="currentColor" fill-opacity="0.55">
${solid.join('\n')}
  </g>
  <g fill="currentColor" fill-opacity="0.34">
${mid.join('\n')}
  </g>
  <g fill="currentColor" fill-opacity="0.12">
${light.join('\n')}
  </g>
  <g stroke-dasharray="3 3">
${open.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="9">
${texts.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="8">
    <text x="${X0}" y="112">dark: weights and activations · mid: graphs · light: KV cache · dashed: not requested</text>
  </g>
</svg>
`
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 7: two engines' lists of sizes                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

export function l7Buckets(most = 24): string {
  const pads = enginePads(Array.from({ length: most }, (_, i) => i + 1))
  const X0 = 30
  const STEP = 13
  const UNIT = 6
  const ROW_A = 52
  const ROW_B = 118
  const bar = (row: number, i: number, rows: number, padded: number | null): string => {
    const waste = padded === null ? 0 : padded - rows
    return `    <rect x="${X0 + i * STEP}" y="${row - waste * UNIT}" width="${STEP - 3}" height="${waste * UNIT}"/>`
  }
  const vllm = pads.map((p, i) => bar(ROW_A, i, p.rows, p.vllm))
  const sglang = pads.map((p, i) => bar(ROW_B, i, p.rows, p.sglang4090))
  const labels = pads.filter((p) => p.rows % 4 === 0 || p.rows === 1).map((p) => `    <text x="${X0 + (p.rows - 1) * STEP + (STEP - 3) / 2}" y="${ROW_B + 12}">${p.rows}</text>`)
  const differ = pads.filter((p) => p.vllm !== p.sglang4090).map((p) => p.rows)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 146" width="360" height="146" fill="none" stroke="currentColor" stroke-width="1">
  <title>Rows wasted by a decode batch of 1 to ${most} rows under vLLM's list and under SGLang's, drawn to one scale</title>
  <desc>Two rows of bars, one bar for each batch size from 1 to ${most} rows, as tall as the rows the batch is padded by. The top row is vLLM's default list of sizes and the bottom row SGLang's decode buckets. They differ only for the batches of ${differ[0]} to ${differ[differ.length - 1]} rows, which vLLM pads to 16 and SGLang to 12, because SGLang has a bucket at 12 and vLLM has none.</desc>
  <g fill="currentColor" fill-opacity="0.34">
${vllm.join('\n')}
${sglang.join('\n')}
  </g>
  <path d="M${X0} ${ROW_A}H${X0 + most * STEP}M${X0} ${ROW_B}H${X0 + most * STEP}"/>
  <g stroke="none" fill="currentColor" font-size="9">
    <text x="4" y="${ROW_A - 38}">vLLM</text>
    <text x="4" y="${ROW_B - 38}">SGLang</text>
  </g>
  <g stroke="none" fill="currentColor" font-size="8" text-anchor="middle">
${labels.join('\n')}
  </g>
  <g stroke="none" fill="currentColor" font-size="8">
    <text x="${X0}" y="142">rows in the batch</text>
  </g>
</svg>
`
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
