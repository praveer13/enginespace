/*
 * The figure of TR6's fifth lesson (W1-T30): four timelines of the same step of the loop, drawn from the step-loop sim, so that the figure is the
 * model's own picture and a model that moves a span moves the figure. `tests/content/tr6-module.test.ts` rebuilds this SVG and holds the file
 * `public/figures/tr6/l5-mask-timeline.svg` to it byte for byte. To write the file after the model has changed:
 *
 *   bun tests/content/tr6-figure.ts --write
 *
 * Each panel is one steady-state step of `MASK_SCENE` (a plan of 100 µs, a read of 60 µs, a forward of 500 µs and twelve structured requests;
 * every number is [estimated] and synthetic), with a CPU lane above a GPU lane on one scale. The fill of the grammar's bitmask is the CPU's
 * `mask` span. The figure draws in the page's ink: `currentColor` and opacities, no colour and no typeface of its own (DESIGN.md; AGENTS.md rule 9).
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Span } from '../../packages/sim/steploop'
import { MASK_SCENE, timeline } from './tr6-demos.ts'
import type { TimelineMode } from './tr6-demos.ts'

export const FIGURE_PATH = 'public/figures/tr6/l5-mask-timeline.svg'

/** The drawing's constants: the width of the viewBox, the room for the lane names, the scale in px a µs, the height of a panel and of a lane. */
const WIDTH = 360
const LEFT = 30
export const SCALE = 0.18
const PANEL = 56
const LANE = 11
const TOP = 18

export interface Panel {
  readonly title: string
  readonly mode: TimelineMode
  readonly rowUs: number
}

export const PANELS: readonly Panel[] = [
  { title: 'Overlapped, light grammar: the fill hides under the forward', mode: 'overlap', rowUs: 20 },
  { title: 'Overlapped, heavy grammar: the fill outlasts the forward', mode: 'overlap', rowUs: 60 },
  { title: 'Serial, light grammar: the fill comes after the forward', mode: 'serial', rowUs: 20 },
  { title: 'Async scheduling, light grammar: the CPU runs a step ahead', mode: 'async', rowUs: 20 },
]

/** The step numbers a panel draws: the steady-state step 6 and the one after it. */
const STEPS = [6, 7] as const

/** The axis runs to this many µs, and its ticks fall every this many. */
const AXIS_US = 1800
const TICK_US = 500

const fmt = (x: number): string => String(Number(x.toFixed(2)))
const group = (attrs: string, body: string[]): string => `  <g${attrs}>\n${body.map((line) => `    ${line}`).join('\n')}\n  </g>`

interface Drawn {
  readonly t0: number
  readonly cpu: readonly Span[]
  readonly gpu: readonly Span[]
  readonly gapUs: number
  readonly gap: readonly [number, number] | null
}

/** A panel's spans, shifted to start at 0, and the GPU's idle stretch between the two forwards it draws. */
function draw(panel: Panel): Drawn {
  const t = timeline(panel.mode, panel.rowUs)
  const keep = (spans: readonly Span[]): Span[] => spans.filter((span) => (STEPS as readonly number[]).includes(span.step))
  const cpu = keep(t.cpu)
  const gpu = keep(t.gpu)
  const t0 = Math.min(...[...cpu, ...gpu].map((span) => span.startUs))
  const forwards = gpu.filter((span) => span.kind === 'forward')
  const gap: [number, number] | null = forwards.length === 2 && forwards[1].startUs > forwards[0].endUs ? [forwards[0].endUs - t0, forwards[1].startUs - t0] : null
  return { t0, cpu, gpu, gapUs: t.gapUs, gap }
}

/** Where a span sits, and how it is drawn: the plan and the read are outlines (the read dashed), the fill and the forward are shades of the ink. */
function rect(span: Span, t0: number, y: number): string {
  const x = LEFT + (span.startUs - t0) * SCALE
  const width = (span.endUs - span.startUs) * SCALE
  const box = `x="${fmt(x)}" y="${fmt(y)}" width="${fmt(width)}" height="${LANE}"`
  switch (span.kind) {
    case 'mask':
      return `<rect ${box} fill="currentColor" fill-opacity="0.45"/>`
    case 'forward':
      return `<rect ${box} fill="currentColor" fill-opacity="0.18"/>`
    case 'sync':
      return `<rect ${box} stroke-dasharray="2 1.5"/>`
    default:
      return `<rect ${box}/>`
  }
}

/** The label of a span wide enough to hold one: the fill and the forward are named, and the plan and the read are in the legend. */
function label(span: Span, t0: number, y: number): string | null {
  const word = span.kind === 'mask' ? 'fill' : span.kind === 'forward' ? 'forward' : null
  if (word === null) return null
  const width = (span.endUs - span.startUs) * SCALE
  if (width < 24) return null
  return `<text x="${fmt(LEFT + (span.startUs - t0) * SCALE + width / 2)}" y="${fmt(y + 8)}">${word}</text>`
}

export function maskTimelineSvg(): string {
  const panels = PANELS.map((panel) => ({ panel, drawn: draw(panel) }))
  for (const { panel, drawn } of panels) {
    const end = Math.max(...[...drawn.cpu, ...drawn.gpu].map((span) => span.endUs)) - drawn.t0
    if (end > AXIS_US) throw new Error(`the panel "${panel.title}" runs to ${end} µs, past the axis at ${AXIS_US} µs: widen the axis or the scale`)
  }
  const height = TOP + PANELS.length * PANEL + 26
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" fill="none" stroke="currentColor" stroke-width="1">`)
  out.push('  <title>One step of the loop with a grammar mask: whether its fill hides under the forward</title>')
  const [overlapLight, overlapHeavy, serialLight, asyncLight] = panels.map((p) => p.drawn.gapUs)
  out.push(
    `  <desc>Four timelines of one step of the loop, each a CPU lane above a GPU lane on the same scale in microseconds. The CPU plans a step, fills the grammar's bitmask, and reads the result back, and the GPU runs the forward. When the fill is overlapped and light, it sits under the forward, and the GPU idles ${overlapLight} microseconds between forwards, as it would with no grammar. When the fill is overlapped and heavy, it outlasts the forward, and the GPU idles ${overlapHeavy} microseconds. When the fill comes after the forward, none of it hides, and the GPU idles ${serialLight} microseconds. With async scheduling the CPU runs a step ahead and the light fill hides, so the GPU idles ${asyncLight} microseconds.</desc>`,
  )

  // The legend: the four kinds of span.
  const legend: { word: string; swatch: string }[] = [
    { word: 'plan', swatch: '' },
    { word: 'read', swatch: ' stroke-dasharray="2 1.5"' },
    { word: 'fill', swatch: ' fill="currentColor" fill-opacity="0.45"' },
    { word: 'forward', swatch: ' fill="currentColor" fill-opacity="0.18"' },
  ]
  const legendBody: string[] = []
  const words: string[] = []
  legend.forEach((item, at) => {
    const x = LEFT + at * 62
    legendBody.push(`<rect x="${x}" y="3" width="10" height="8"${item.swatch}/>`)
    words.push(`<text x="${x + 14}" y="10">${item.word}</text>`)
  })
  out.push(group('', legendBody))
  out.push(group(' stroke="none" fill="currentColor" font-size="8"', words))

  panels.forEach(({ panel, drawn }, at) => {
    const top = TOP + at * PANEL
    const cpuY = top + 12
    const gpuY = top + 26
    const body: string[] = []
    const texts: string[] = []
    texts.push(`<text x="2" y="${top + 7}" font-size="9">${panel.title}</text>`)
    texts.push(`<text x="2" y="${cpuY + 8}">CPU</text>`)
    texts.push(`<text x="2" y="${gpuY + 8}">GPU</text>`)
    for (const span of drawn.cpu) {
      body.push(rect(span, drawn.t0, cpuY))
      const word = label(span, drawn.t0, cpuY)
      if (word !== null) texts.push(word)
    }
    for (const span of drawn.gpu) {
      body.push(rect(span, drawn.t0, gpuY))
      const word = label(span, drawn.t0, gpuY)
      if (word !== null) texts.push(word)
    }
    const bracketY = gpuY + LANE + 5
    if (drawn.gap !== null) {
      const [from, to] = drawn.gap
      const x1 = LEFT + from * SCALE
      const x2 = LEFT + to * SCALE
      body.push(`<path d="M${fmt(x1)} ${bracketY - 3}V${bracketY}H${fmt(x2)}V${bracketY - 3}" stroke-width="0.75"/>`)
      texts.push(`<text x="${fmt((x1 + x2) / 2)}" y="${bracketY + 9}" text-anchor="middle">GPU idle ${drawn.gapUs} µs</text>`)
    } else {
      const firstForward = drawn.gpu.filter((span) => span.kind === 'forward')[1]
      const x = LEFT + (firstForward.startUs - drawn.t0) * SCALE
      texts.push(`<text x="${fmt(x)}" y="${bracketY + 9}" text-anchor="middle">GPU idle ${drawn.gapUs} µs</text>`)
    }
    out.push(group('', body))
    out.push(group(' stroke="none" fill="currentColor" font-size="8"', texts))
  })

  // The axis: µs from the start of the step's plan.
  const axisY = TOP + PANELS.length * PANEL + 2
  const ticks: string[] = []
  const tickText: string[] = []
  for (let us = 0; us <= AXIS_US; us += TICK_US) {
    const x = LEFT + us * SCALE
    ticks.push(`M${fmt(x)} ${axisY}V${axisY + 4}`)
    tickText.push(`<text x="${fmt(x)}" y="${axisY + 13}" text-anchor="middle">${us.toLocaleString('en-US')}</text>`)
  }
  tickText.push(`<text x="${LEFT + AXIS_US * SCALE}" y="${axisY + 22}" text-anchor="end">µs from the start of the step's plan</text>`)
  out.push(group(' stroke-width="0.75"', [`<path d="M${LEFT} ${axisY}H${fmt(LEFT + AXIS_US * SCALE)}"/>`, `<path d="${ticks.join('')}"/>`]))
  out.push(group(' stroke="none" fill="currentColor" font-size="8"', tickText))
  out.push('</svg>')
  return `${out.join('\n')}\n`
}

/** The scene's numbers, for a test that names them. */
export const SCENE = MASK_SCENE

if (import.meta.main && process.argv.includes('--write')) {
  const file = path.join(import.meta.dir, '..', '..', FIGURE_PATH)
  writeFileSync(file, maskTimelineSvg())
  console.log(`wrote ${FIGURE_PATH}`)
}
