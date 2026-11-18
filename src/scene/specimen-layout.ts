/*
 * The scene kit's specimen on /design: the lanes laid out from a real run of the step-loop model (packages/sim/steploop) on
 * the front page's synthetic tick card (GAMES.md §3.1, D-048), so every mark the kit draws is a number the model computed.
 * It is the kit's own layout.ts: a pure function from the run to positioned primitives, which the 3D scene and its 2D twin
 * both draw (ARCHITECTURE §6.3). Every tick here is synthetic, and the screens say so.
 *
 *   - The CPU's lane on the left, the GPU's on the right, running from the present into the past.
 *   - Each step is a slab on the GPU lane, as long as its forward and as wide as the batch; its places are one per batch slot:
 *     a token (solid), an empty slot (an open groove), a ghost token (hollow, the token an EOS stop leaves behind).
 *   - Idle stretches on the GPU lane, the GPU waiting on the CPU, are outlines on the lane.
 *
 * Two loads: 4 slots over a short service, and 64 slots over a long night, which draws more than 10,000 instances (the
 * kit's draw-call check, TRACKER W0-T15 check 4).
 */
import type { Workload, ReqSpec } from '@es/sim/workload'
import { below, rngFor } from '@es/sim/core'
import { TICK_CARD, type StepLoopRun } from '@es/sim/steploop'
// The v0 loop, by path: the package's `runStepLoop` is v1, which the pages that draw this scene have no room for (packages/sim/steploop/run.ts).
import { runStepLoop } from '@es/sim/steploop/run'
import type { CameraPreset, Vec3 } from './camera-rig'
import type { CellDatum, MarkForm, SpanDatum } from './marks'
import { axisTicks, trackZ, type TimeWindow } from './time-axis'

export type SpecimenClips = 4 | 64

export interface SpecimenSettings {
  readonly clips: SpecimenClips
  readonly overlap: boolean
  /** How the engine admits: continuous batching (the default), or static, which waits for the whole batch to finish. */
  readonly batching?: 'continuous' | 'static'
}

/** The short service: when each ticket is due (ticks) and how many courses it wants. Authored, synthetic. */
const SHORT_SERVICE: ReadonlyArray<readonly [number, number]> = [
  [0, 5],
  [0, 9],
  [0, 3],
  [6, 7],
  [14, 12],
  [20, 4],
  [27, 6],
  [31, 2],
  [44, 8],
  [49, 5],
  [55, 10],
  [58, 3],
  [70, 6],
  [77, 4],
  [83, 7],
  [96, 3],
]

const LONG_NIGHT_TICKETS = 2400
/** The long night's fires on screen: 160 × 64 clips = 10,240 places [derived]. */
export const LONG_NIGHT_FIRES = 160

function request(id: number, dueUs: number, outputTokens: number): ReqSpec {
  return { id, dueUs, promptTokens: 4, outputTokens, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false }
}

export function specimenWorkload(clips: SpecimenClips): Workload {
  if (clips === 4) return { seed: 0, origin: { kind: 'synthetic' }, reqs: SHORT_SERVICE.map(([due, out], id) => request(id, due, out)) }
  // A heavy-tailed menu of 1 to 16 courses, all due at once: the rush.
  const rng = rngFor(0x5ce7e, 'specimen/long-night')
  const reqs = Array.from({ length: LONG_NIGHT_TICKETS }, (_, id) => request(id, 0, 1 + below(rng, below(rng, 16) + 1)))
  return { seed: 0x5ce7e, origin: { kind: 'synthetic' }, reqs }
}

/** The model's run of a load, with overlap (async scheduling) on or off, and continuous batching unless it says static. */
export function specimenRun({ clips, overlap, batching = 'continuous' }: SpecimenSettings): StepLoopRun {
  return runStepLoop(
    specimenWorkload(clips),
    {
      maxNumSeqs: clips,
      maxBatchedTokens: clips * 5,
      chunkedPrefill: true,
      asyncScheduling: overlap,
      inputIds: 'device',
      graphs: { mode: 'NONE', captureSizes: [] },
      batching,
    },
    TICK_CARD,
    TICK_CARD,
    { horizonUs: 1_000_000 },
  )
}

/** One fire, as the list and the mirror read it. */
export interface SpecimenFire {
  readonly index: number
  readonly id: string
  readonly start: number
  readonly end: number
  readonly ticks: number
  readonly plates: number
  readonly binned: number
  readonly empty: number
  /** Ticks the GPU sat idle before this step, while the CPU wrote. */
  readonly dark: number
}

export interface SpecimenLabelAnchor {
  readonly id: string
  readonly at: Vec3
  readonly frame?: 'track'
  readonly kind: 'lane' | 'tick' | 'legend' | 'axis'
  readonly text: string
  readonly place?: 'center' | 'above' | 'below' | 'left' | 'right'
  /** Hidden in a canvas narrower than this (LabelSpec.minWidth). */
  readonly minWidth?: number
}

export interface SpecimenLayout {
  readonly settings: SpecimenSettings
  readonly unitsPerTime: number
  readonly window: TimeWindow
  readonly fires: readonly SpecimenFire[]
  readonly firesTotal: number
  readonly spans: readonly SpanDatum[]
  readonly cells: readonly CellDatum[]
  /** The legend tray's places, in the world's frame (not on the clock). */
  readonly legend: readonly CellDatum[]
  readonly anchors: readonly SpecimenLabelAnchor[]
  /** The lanes' x and the rail's width, for the 2D twin and the selection. */
  readonly lanes: { readonly cpuX: number; readonly cpuWidth: number; readonly gpuX: number; readonly gpuWidth: number; readonly slotPitch: number }
  readonly totals: { readonly plates: number; readonly binned: number; readonly empty: number; readonly busy: number; readonly dark: number; readonly clock: number }
}

/** How long the lanes run, in scene units, from the present into the past. */
export const LANE_LENGTH = 14
/** The short service shows the last 84 ticks: twelve unoverlapped fires of 7 [derived from the tick card]. */
const SHORT_WINDOW = 84
const SLAB_HEIGHT = 0.08
const PLACE_HEIGHT = 0.04
const GROOVE_HEIGHT = 0.012
/** A place is a square a little narrower than its slot, so the step's colour shows around it. */
const PLACE_SHARE = 0.62

/** The fires a load starts with on screen. */
export function initialFired(clips: SpecimenClips, run: StepLoopRun): number {
  return clips === 4 ? Math.min(9, run.steps.length) : Math.min(LONG_NIGHT_FIRES, run.steps.length)
}

export function specimenLayout(run: StepLoopRun, settings: SpecimenSettings, fired: number): SpecimenLayout {
  const { clips } = settings
  const shown = Math.max(1, Math.min(fired, run.steps.length, clips === 64 ? LONG_NIGHT_FIRES : run.steps.length))
  const cpuSpans = run.lanes['cpu-main'].filter((span) => span.step < shown)
  const gpuSpans = run.lanes['gpu-stream'].filter((span) => span.step < shown)
  const now = Math.max(...cpuSpans.map((span) => span.endUs), ...gpuSpans.map((span) => span.endUs), 0)
  const firstStart = gpuSpans.length > 0 ? gpuSpans[0].startUs : 0
  const window: TimeWindow = clips === 4 ? { start: Math.max(0, now - SHORT_WINDOW), now } : { start: Math.min(firstStart, cpuSpans[0]?.startUs ?? 0), now }
  const unitsPerTime = LANE_LENGTH / Math.max(1, window.now - window.start)

  // Lanes across the scene: the CPU on the left, the GPU on the right, as wide as the batch.
  const slotPitch = clips === 4 ? 0.42 : 0.054
  const gpuWidth = clips * slotPitch
  const gpuLeft = -0.32
  const gpuX = gpuLeft + gpuWidth / 2
  const cpuWidth = 0.5
  const cpuX = gpuLeft - 0.85 - cpuWidth / 2
  const visible = (end: number) => end > window.start

  const fires: SpecimenFire[] = []
  const spans: SpanDatum[] = []
  const cells: CellDatum[] = []
  let previousEnd: number | null = null
  for (const forward of gpuSpans) {
    const step = run.steps[forward.step]
    const plates = step.seqs - step.ghostSeqs
    const fire: SpecimenFire = {
      index: forward.step,
      id: `fire-${forward.step}`,
      start: forward.startUs,
      end: forward.endUs,
      ticks: forward.endUs - forward.startUs,
      plates,
      binned: step.ghostSeqs,
      empty: clips - step.seqs,
      dark: step.bubbleUs,
    }
    fires.push(fire)
    if (visible(forward.endUs)) {
      spans.push({ id: `${fire.id}`, lane: gpuX, start: forward.startUs, end: forward.endUs, width: gpuWidth, height: SLAB_HEIGHT, base: 0.002, role: 'lane-gpu' })
      if (step.bubbleUs > 0 && previousEnd !== null) {
        spans.push({ id: `dark-${forward.step}`, lane: gpuX, start: forward.startUs - step.bubbleUs, end: forward.startUs, width: gpuWidth, height: 0.02, base: 0.002, role: 'lane-idle', form: 'hollow' })
      }
      // One place per slot, centred on the step: tokens, then ghost tokens, then the empty slots.
      const inset = Math.min(0.04, ((forward.endUs - forward.startUs) * unitsPerTime) / 5)
      const z0 = trackZ(forward.startUs, { unitsPerTime }) + inset
      const z1 = trackZ(forward.endUs, { unitsPerTime }) - inset
      const side = slotPitch * PLACE_SHARE
      for (let slot = 0; slot < clips; slot++) {
        const form: MarkForm = slot < plates ? 'solid' : slot < step.seqs ? 'hollow' : 'groove'
        cells.push({
          id: `${fire.id}/place-${slot}`,
          x: gpuLeft + (slot + 0.5) * slotPitch,
          z: (z0 + z1) / 2,
          y: 0.002 + SLAB_HEIGHT,
          width: side,
          depth: Math.max(0.004, Math.min(z1 - z0, side)),
          height: form === 'groove' ? GROOVE_HEIGHT : PLACE_HEIGHT,
          role: form === 'solid' ? 'cat-white' : form === 'hollow' ? 'status-bad' : 'lane-idle',
          form,
        })
      }
    }
    previousEnd = forward.endUs
  }
  for (const span of cpuSpans) {
    if (!visible(span.endUs)) continue
    const plan = span.kind === 'schedule' || span.kind === 'prepare' || span.kind === 'launch'
    spans.push({
      id: `cpu-${span.step}-${span.kind}`,
      lane: cpuX,
      start: span.startUs,
      end: span.endUs,
      width: cpuWidth,
      height: plan ? 0.06 : 0.03,
      base: 0.002,
      role: 'lane-cpu',
    })
  }

  const railRight = gpuLeft + gpuWidth + 0.35
  const anchors: SpecimenLabelAnchor[] = [
    { id: 'lane-cpu', at: [cpuX, -0.1, 1.45], kind: 'lane', text: 'CPU' },
    { id: 'lane-gpu', at: [gpuX, -0.1, 1.45], kind: 'lane', text: 'GPU' },
  ]

  // The legend: the four forms a place can take, in a row, with one label under them.
  const legendForms: { form: MarkForm; role: CellDatum['role'] }[] = [
    { form: 'solid', role: 'cat-white' },
    { form: 'groove', role: 'lane-idle' },
    { form: 'hollow', role: 'status-bad' },
    { form: 'marked', role: 'cat-white' },
  ]
  const trayLeft = railRight + 0.42
  const trayPitch = 0.4
  const legend: CellDatum[] = legendForms.map((entry, i) => ({
    id: `legend-${entry.form}`,
    x: trayLeft + i * trayPitch,
    z: 0.98,
    y: 0,
    width: 0.24,
    depth: 0.24,
    height: entry.form === 'groove' ? GROOVE_HEIGHT : PLACE_HEIGHT,
    role: entry.role,
    form: entry.form,
  }))
  const trayX = trayLeft + (trayPitch * (legendForms.length - 1)) / 2
  anchors.push({ id: 'legend', at: [trayX, -0.1, 1.45], kind: 'lane', text: 'Forms' })

  // The clock along the GPU lane's right edge. A tick at the very present would sit on the legend, so its number is left off.
  const axisX = gpuLeft + gpuWidth + 0.14
  const ticks = axisTicks(window, clips === 4 ? 7 : 8)
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : window.now - window.start
  for (const t of ticks) {
    if (window.now - t < step * 0.6) continue
    anchors.push({ id: `tick-${t}`, at: [axisX + 0.1, 0, trackZ(t, { unitsPerTime })], frame: 'track', kind: 'tick', text: String(t), place: 'right' })
  }

  const visibleFires = fires.filter((fire) => visible(fire.end))
  const sum = (pick: (fire: SpecimenFire) => number) => fires.reduce((total, fire) => total + pick(fire), 0)
  return {
    settings,
    unitsPerTime,
    window,
    fires: visibleFires,
    firesTotal: run.steps.length,
    spans,
    cells,
    legend,
    anchors,
    lanes: { cpuX, cpuWidth, gpuX, gpuWidth, slotPitch },
    totals: { plates: sum((f) => f.plates), binned: sum((f) => f.binned), empty: sum((f) => f.empty), busy: sum((f) => f.ticks), dark: sum((f) => f.dark), clock: now },
  }
}

/** The specimen's camera presets: three shots of the lanes. */
export const SPECIMEN_PRESETS: readonly CameraPreset[] = [
  {
    id: 'lifted',
    label: 'Lifted',
    shot: 'establish',
    projection: 'perspective',
    position: [0.3, 4.6, 8.7],
    target: [0.55, 0, -1],
    fov: 30,
    portrait: { position: [0.4, 6.6, 11.6], target: [0.5, 0, -2.4], fov: 38 },
  },
  {
    // From the CPU's side, so time runs left to right as it does in the 2D twin, with the present at the right.
    id: 'side',
    label: 'Side',
    shot: 'compare',
    projection: 'orthographic',
    position: [-8.2, 9, -6],
    target: [0.2, 0, -6],
    viewHeight: 9.5,
    portrait: { viewHeight: 19 },
  },
  {
    id: 'top',
    label: 'Top',
    shot: 'top',
    projection: 'perspective',
    position: [0.4, 13.5, -3.2],
    target: [0.4, 0, -3.6],
    fov: 40,
    portrait: { position: [0.4, 19, -3.6], target: [0.4, 0, -4], fov: 44 },
  },
]
