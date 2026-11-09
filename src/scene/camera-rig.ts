/*
 * The camera rig's arithmetic (ARCHITECTURE §6.4; GAMES.md §2.3, "Camera grammar"), with no three in it, so the DOM
 * buttons, the `C` key and the 3D rig agree on one list of presets.
 *
 *   - Each scene names its presets; `C` cycles them and a button reaches each one.
 *   - A move animates over at most 400 ms [estimated] on the design system's settle curve, and cuts under reduced motion.
 *     A change of projection (perspective to the orthographic Compare shot) always cuts: there is no honest in-between.
 *   - Up stays up and nothing rolls; a preset is a position and a target, never an orientation.
 *   - Below 480 px wide, a preset's portrait framing runs the long axis into the screen (GAMES.md §2.3). From 1280 px a preset may
 *     frame the scene its own way for a page whose objects stand at one side of the box (`wide`).
 *   - A framing's `shift` moves the picture's centre off the box's centre (a lens shifted in its mount): the camera sees the same, and
 *     the picture stands elsewhere in the box, so a page's own objects can stand beside it.
 */

export type Vec3 = readonly [number, number, number]

export type Shot = 'establish' | 'focus' | 'follow' | 'compare' | 'top'

export interface Framing {
  readonly position: Vec3
  readonly target: Vec3
  /** Perspective: the vertical field of view in degrees. About 30° for Establish, so sizes read nearly true. */
  readonly fov?: number
  /** Orthographic: the world height the view shows. */
  readonly viewHeight?: number
  /** The picture's centre, off the box's centre, in half box heights: right and down. A perspective framing's only. */
  readonly shift?: readonly [number, number]
}

export interface CameraPreset extends Framing {
  readonly id: string
  /** The button's words. */
  readonly label: string
  readonly shot: Shot
  readonly projection: 'perspective' | 'orthographic'
  /** The framing below `PORTRAIT_WIDTH`. */
  readonly portrait?: Partial<Framing>
  /** The framing from `WIDE_WIDTH`. */
  readonly wide?: Partial<Framing>
}

/** GAMES.md §2.3 [estimated]. */
export const CAMERA_TRANSITION_MS = 400
export const PORTRAIT_WIDTH = 480
/** 80rem: where the front page stands its own objects in front of the pass (front.css). */
export const WIDE_WIDTH = 1280
export const DEFAULT_FOV = 30

/** The preset after `current`, wrapping: what `C` does. An unknown id starts from the first. */
export function nextPreset(presets: readonly CameraPreset[], current: string): string {
  if (presets.length === 0) throw new Error('a camera rig needs at least one preset')
  const index = presets.findIndex((preset) => preset.id === current)
  return presets[(index + 1) % presets.length].id
}

export function presetById(presets: readonly CameraPreset[], id: string): CameraPreset {
  return presets.find((preset) => preset.id === id) ?? presets[0]
}

/** The framing a preset takes in a canvas this wide. */
export function framingFor(preset: CameraPreset, widthPx: number): Required<Framing> {
  const own = widthPx > 0 && widthPx < PORTRAIT_WIDTH ? (preset.portrait ?? {}) : widthPx >= WIDE_WIDTH ? (preset.wide ?? {}) : {}
  return {
    position: own.position ?? preset.position,
    target: own.target ?? preset.target,
    fov: own.fov ?? preset.fov ?? DEFAULT_FOV,
    viewHeight: own.viewHeight ?? preset.viewHeight ?? 10,
    shift: own.shift ?? preset.shift ?? [0, 0],
  }
}

/** How long a move from one preset to another takes: a cut under reduced motion and across projections. */
export function transitionMs(from: CameraPreset | null, to: CameraPreset, reducedMotion: boolean): number {
  if (reducedMotion || from === null || from.projection !== to.projection) return 0
  return CAMERA_TRANSITION_MS
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress in [0, 1], solved for x by bisection. The rig reads the
 * design system's `ease-settle` role, so the camera settles on the same curve the page's motion does.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s
  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < t) lo = mid
      else hi = mid
    }
    return at(y1, y2, (lo + hi) / 2)
  }
}

/** Parses an easing role's value; anything that is not a cubic Bézier (a `steps()` curve) eases linearly. */
export function easingFrom(value: string): (t: number) => number {
  const match = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(value)
  if (!match) return (t) => Math.min(1, Math.max(0, t))
  const [x1, y1, x2, y2] = match.slice(1).map(Number)
  return cubicBezier(x1, y1, x2, y2)
}
