/*
 * The 3D time track's six cameras (REDESIGN §2.9): a button each, and `C` to cycle them. Pure, with no three in it, so the game's page holds
 * the buttons and the key before the 3D chunk loads, and a test can project through them.
 *
 *   Lifted      Side, tilted back about the time axis: time still runs left to right, and the slots recede in depth. The opening shot.
 *   Side        orthographic, face on to the plate: exactly the 2D diagram, a tick at the 2D diagram's x, pixel for pixel (P7).
 *   Along time  from past now, low, looking back along the time axis: the run recedes into the past, and a bubble is a valley.
 *   Top         straight down on the whole plate, in perspective, so the slabs' sides show round their tops.
 *   Compare     static batching, continuous batching and async scheduling stacked on one axis (track-layout.ts), lifted.
 *   Scale       64 slots for 160 steps, the whole run in one lifted view.
 *
 * Each framing is computed for the model on the plate and the canvas it is drawn in: the plate is laid out at the canvas's width, so the
 * framings follow it. Every angle and margin is [estimated], set by eye at 1440 and 390.
 */
import type { CameraPreset } from '@/scene/camera-rig'
import { PX, type FlatModel } from '@/scene/flat-track'

export type TrackCameraId = 'lifted' | 'side' | 'along' | 'top' | 'compare' | 'scale'

/** The cameras in the order `C` steps through them, with their buttons' words. */
export const TRACK_CAMERAS: readonly { readonly id: TrackCameraId; readonly label: string }[] = [
  { id: 'lifted', label: 'Lifted' },
  { id: 'side', label: 'Side' },
  { id: 'along', label: 'Along time' },
  { id: 'top', label: 'Top' },
  { id: 'compare', label: 'Compare' },
  { id: 'scale', label: 'Scale' },
]

export const DEFAULT_CAMERA: TrackCameraId = 'lifted'

/** The camera after `id`, wrapping: what `C` does. */
export function nextCamera(id: string): TrackCameraId {
  const at = TRACK_CAMERAS.findIndex((camera) => camera.id === id)
  return TRACK_CAMERAS[(at + 1) % TRACK_CAMERAS.length].id
}

export const cameraLabel = (id: string): string => TRACK_CAMERAS.find((camera) => camera.id === id)?.label ?? TRACK_CAMERAS[0].label

/** The model a camera shows: Compare and Scale show the model's own runs, every other camera the learner's. */
export const showsOwnRun = (id: string): boolean => id === 'compare' || id === 'scale'

/** How far Lifted tilts back from looking straight down [estimated]; less in a phone's narrow canvas, where rows are few pixels deep. */
export const LIFT_DEG = 36
export const LIFT_NARROW_DEG = 24
const FOV = 30
/** How high over the plate the orthographic and straight-down cameras stand, in world units: above every mark. */
const OVERHEAD = 20
/**
 * A camera straight overhead cannot keep "up" up (the rig looks at its target with y up), so it stands this far toward the viewer: a tilt
 * about the time axis of 5 × 10⁻⁵ rad, which moves no x at all and a row's z by less than a hundredth of a pixel [derived].
 */
const NUDGE = 0.001
/** Where now stands in a track wider than its canvas: the 2D view's NOW_IN_VIEW. */
const NOW_IN_VIEW = 0.62

export interface Canvas {
  readonly width: number
  readonly height: number
}

const tan = (deg: number) => Math.tan((deg * Math.PI) / 180)

/** The part of a model's width a camera centres on: all of it where it fits the canvas, else a canvas's width with now in view. */
function visibleX(model: FlatModel, canvas: Canvas, nowX: number, slack = 1): { x0: number; x1: number } {
  const total = model.bounds.x1 + (model.bounds.x0 > 0 ? model.bounds.x0 : 0)
  if (total <= canvas.width) return { x0: 0, x1: canvas.width }
  if (total <= canvas.width * slack) return { x0: 0, x1: total }
  const left = Math.max(0, Math.min(total - canvas.width, nowX - canvas.width * NOW_IN_VIEW))
  return { x0: left, x1: left + canvas.width }
}

/** The distance at which a perspective camera of `FOV` holds a box `w` wide and `h` high (world units) in a canvas of this aspect. */
function fitDistance(w: number, h: number, aspect: number, margin = 1.08): number {
  const v = tan(FOV / 2)
  return Math.max(w / 2 / (v * aspect), h / 2 / v) * margin
}

/** A lifted framing of a box on the plate, tilted back `deg` from straight down. */
function lifted(x0: number, x1: number, z0: number, z1: number, canvas: Canvas, deg: number, id: string, label: string, margin = 1.02): CameraPreset {
  const aspect = canvas.width / Math.max(1, canvas.height)
  const w = (x1 - x0) / PX
  const d = (z1 - z0) / PX
  const target: [number, number, number] = [(x0 + x1) / 2 / PX, 0, (z0 + z1) / 2 / PX]
  const rad = (deg * Math.PI) / 180
  // Seen tilted, the plate's depth shows foreshortened, and the marks' height adds a little.
  const dist = fitDistance(w, d * Math.cos(rad) + 0.4 * Math.sin(rad), aspect, margin)
  // Held to its width, a tilted plate leaves room over its far edge: the lens shifts the picture up into it.
  const roomy = w / aspect > d * Math.cos(rad)
  return { id, label, shot: 'establish', projection: 'perspective', fov: FOV, target, position: [target[0], dist * Math.cos(rad), target[2] + dist * Math.sin(rad)], ...(roomy ? { shift: [0, -0.12] as const } : {}) }
}

/**
 * The six framings for a model in a canvas of this size. `nowX` is now's x on the plate, which a track wider than its canvas keeps in view.
 * Compare and Scale frame the model passed for them; the other four the learner's.
 */
export function trackPresets(model: FlatModel, canvas: Canvas, nowX: number): CameraPreset[] {
  const label = (id: TrackCameraId) => cameraLabel(id)
  const aspect = canvas.width / Math.max(1, canvas.height)
  const { x0, x1 } = visibleX(model, canvas, nowX)
  // Lifted holds the whole plate where it is not much wider than the canvas, a phone's included: in depth, the label column stays in view.
  const wide = visibleX(model, canvas, nowX, 1.6)
  const { z0, z1 } = model.bounds
  const all = { x0: model.bounds.x0, x1: model.bounds.x1 }

  // Side: the canvas is the diagram's figure. One world unit is PX pixels, and the plate's origin is the canvas's top left.
  const sideTarget: [number, number, number] = [(x0 + x1) / 2 / PX, 0, canvas.height / 2 / PX]
  const side: CameraPreset = {
    id: 'side',
    label: label('side'),
    shot: 'compare',
    projection: 'orthographic',
    position: [sideTarget[0], OVERHEAD, sideTarget[2] + NUDGE],
    target: sideTarget,
    viewHeight: canvas.height / PX,
  }

  const narrow = canvas.width < 560
  // The margin keeps the near edge's last tick and its number in the canvas: the tilt draws the near edge wider than the far one.
  const lift = lifted(wide.x0, wide.x1, z0, z1, canvas, narrow ? LIFT_NARROW_DEG : LIFT_DEG, 'lifted', label('lifted'), 1.2)

  // Along time: from past now and a little toward the viewer, low, looking back toward the run's start.
  const depth = (z1 - z0) / PX
  const zc = (z0 + z1) / 2 / PX
  const nowW = Math.min(nowX, all.x1) / PX
  const along: CameraPreset = {
    id: 'along',
    label: label('along'),
    shot: 'follow',
    projection: 'perspective',
    fov: 34,
    position: [nowW + 1.6 + depth * 0.4, 1.1 + depth * 0.55, zc + depth * 0.9],
    target: [Math.max(all.x0 / PX, nowW - 3.2), 0, zc],
  }

  // Top: high over the plate, a little to the right and in front, so the slabs' sides show round their tops.
  const tw = (all.x1 - all.x0) / PX
  const topTarget: [number, number, number] = [(all.x0 + all.x1) / 2 / PX, 0, zc]
  const high = fitDistance(tw, depth, aspect, 1.12)
  const top: CameraPreset = {
    id: 'top',
    label: label('top'),
    shot: 'top',
    projection: 'perspective',
    fov: FOV,
    position: [topTarget[0] + high * 0.12, high * 0.97, topTarget[2] + high * 0.2],
    target: topTarget,
  }

  const compare = lifted(all.x0, all.x1, z0, z1, canvas, 26, 'compare', label('compare'), 1.16)
  const scale = lifted(all.x0, all.x1, z0, z1, canvas, 30, 'scale', label('scale'), 1.16)
  const byId: Record<TrackCameraId, CameraPreset> = { lifted: lift, side, along, top, compare, scale }
  return TRACK_CAMERAS.map((camera) => byId[camera.id])
}
