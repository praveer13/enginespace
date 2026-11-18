/*
 * The figure of TR6's fifth lesson: four timelines of the same step of the loop, drawn from the step-loop sim, so that the figure is the
 * model's own picture and a model that moves a span moves the figure. `tests/content/tr6-module.test.ts` rebuilds this SVG and holds the file
 * `public/figures/tr6/l5-mask-timeline.svg` to it byte for byte. To write the file after the model has changed:
 *
 *   bun tests/content/tr6-figure.ts --write
 *
 * Each panel is one steady-state step of `MASK_SCENE` (a plan of 100 µs, a read of 60 µs, a forward of 500 µs and twelve structured requests;
 * every number is [estimated] and synthetic), with a CPU lane above a GPU lane on one scale. The fill of the grammar's bitmask is the CPU's
 * `mask` span. The figure is drawn in the diagram language (`tests/content/figure-kit.ts`): the CPU's plan and fill are blue, its read a
 * yellow sync, the forward green, and the GPU's idle stretch a dashed hollow box under a dimension line.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Span } from '../../packages/sim/steploop'
import { MASK_SCENE, timeline } from './tr6-demos.ts'
import type { TimelineMode } from './tr6-demos.ts'
import { Fig } from './figure-kit.ts'

export const FIGURE_PATH = 'public/figures/tr6/l5-mask-timeline.svg'

/** The drawing's constants: the room for the lane names, the scale in px a µs, the height of a panel and of a lane. */
const LEFT = 30
export const SCALE = 0.18
const PANEL = 84
const LANE = 14
const TOP = 2

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

/** The code colour of a span: the plan and the fill are the CPU's, the read is a sync, the forward is the GPU's. */
const slotOf = (kind: string): 'blue' | 'yellow' | 'green' => (kind === 'forward' ? 'green' : kind === 'sync' ? 'yellow' : 'blue')

/** The word a span carries when it has the room for one: the fill and the forward are named, and the plan and the read are in the legend. */
const wordOf = (span: Span): string | undefined => (span.kind === 'mask' ? 'fill' : span.kind === 'forward' ? 'forward' : undefined)

export function maskTimelineSvg(): string {
  const panels = PANELS.map((panel) => ({ panel, drawn: draw(panel) }))
  for (const { panel, drawn } of panels) {
    const end = Math.max(...[...drawn.cpu, ...drawn.gpu].map((span) => span.endUs)) - drawn.t0
    if (end > AXIS_US) throw new Error(`the panel "${panel.title}" runs to ${end} µs, past the axis at ${AXIS_US} µs: widen the axis or the scale`)
  }
  const [overlapLight, overlapHeavy, serialLight, asyncLight] = panels.map((p) => p.drawn.gapUs)
  const fig = new Fig(
    TOP + PANELS.length * PANEL + 80,
    'One step of the loop with a grammar mask: whether its fill hides under the forward',
    `Four timelines of one step of the loop, each a CPU lane above a GPU lane on the same scale in microseconds. The CPU plans a step, fills the grammar's bitmask, and reads the result back, and the GPU runs the forward. When the fill is overlapped and light, it sits under the forward, and the GPU idles ${overlapLight} microseconds between forwards, as it would with no grammar. When the fill is overlapped and heavy, it outlasts the forward, and the GPU idles ${overlapHeavy} microseconds. When the fill comes after the forward, none of it hides, and the GPU idles ${serialLight} microseconds. With async scheduling the CPU runs a step ahead and the light fill hides, so the GPU idles ${asyncLight} microseconds.`,
  )
  panels.forEach(({ panel, drawn }, at) => {
    const top = TOP + at * PANEL
    const cpuY = top + 16
    const gpuY = top + 36
    fig.grid(LEFT, top + 12, AXIS_US * SCALE, 2 * LANE + 28)
    fig.text(2, top + 9, panel.title, { size: 10 })
    fig.text(2, cpuY + 11, 'CPU', { bold: true })
    fig.text(2, gpuY + 11, 'GPU', { bold: true })
    for (const [spans, y] of [[drawn.cpu, cpuY], [drawn.gpu, gpuY]] as const) {
      for (const span of spans) {
        fig.mark(slotOf(span.kind), LEFT + (span.startUs - drawn.t0) * SCALE, y, Math.max(1, (span.endUs - span.startUs) * SCALE), LANE, { kind: 'span', label: wordOf(span) })
      }
    }
    const lineY = gpuY + LANE + 12
    if (drawn.gap !== null) {
      const [from, to] = drawn.gap
      fig.idle(LEFT + from * SCALE, gpuY, (to - from) * SCALE, LANE)
      fig.dim(LEFT + from * SCALE, LEFT + to * SCALE, lineY, `GPU idle ${drawn.gapUs} µs`, { below: true })
    } else {
      const second = drawn.gpu.filter((span) => span.kind === 'forward')[1]
      fig.text(LEFT + (second.startUs - drawn.t0) * SCALE, lineY + 15, `GPU idle ${drawn.gapUs} µs`, { mono: true, anchor: 'middle' })
    }
  })
  const axisY = TOP + PANELS.length * PANEL + 4
  fig.axis(LEFT, axisY, SCALE, AXIS_US, TICK_US, "µs from the start of the step's plan")
  const bottom = fig.legend(
    [
      { slot: 'blue', word: 'CPU: plan, fill' },
      { slot: 'yellow', word: 'read' },
      { slot: 'green', word: 'forward' },
      { slot: 'white', word: 'idle', hollow: true },
    ],
    4,
    axisY + 42,
  )
  fig.height = bottom + 2
  return fig.svg()
}

/** The scene's numbers, for a test that names them. */
export const SCENE = MASK_SCENE

if (import.meta.main && process.argv.includes('--write')) {
  const file = path.join(import.meta.dir, '..', '..', FIGURE_PATH)
  writeFileSync(file, maskTimelineSvg())
  console.log(`wrote ${FIGURE_PATH}`)
}
