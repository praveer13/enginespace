/*
 * The rejection sampler's skylines as a plan (REDESIGN §2.8, §2.9): the sizes the layout (scene-layout.ts) draws them at, and the three
 * shots they are seen through. Pure arithmetic with no three in it, so the game's page holds the camera's buttons and the `C` key before
 * the scene's chunk loads, and Bun tests the framing.
 *
 * The world is the chain's diagram stood up: a sheet of paper laid flat, one row of bars for each draft position, the first row nearest the
 * viewer and the next ones behind it, so that the rows' skylines line up into depth on one height scale. In a row, a token's two bars stand
 * side by side, the draft's q then the target's p, each as tall as its count out of the shared axis. The 3D view is offered on the chain
 * only, and from a desk's width only (the frame withholds it on a phone), so there is one drawing and one shape of canvas to plan for.
 *
 * Lengths are in the diagram's px, 100 to a world unit (flat-track.ts), and every one is [estimated], set by eye at 1440 x 900 and held by
 * tests/play/verifier-scene.test.ts: the rows stand far enough apart, and the pairs wide enough, that no count over a bar reaches another
 * count, or a bar of the row behind, in the opening shot.
 */
import type { CameraPreset } from '@/scene/camera-rig'
import { PX } from '@/scene/flat-track'
import type { Shot, ShotId } from './scene-shots'

/**
 * The bars' sizes, in px: a token's column, one bar's width and the gap between the pair, a bar's depth, a row's pitch, the tallest bar's
 * height, the label column at the left, the plate's margin, the apron under the front row where the tokens' numbers hang, and the value
 * scale's room at the right.
 */
export const GEO = { col: 92, bar: 24, gap: 20, depth: 26, row: 170, height: 150, names: 190, pad: 16, tags: 26, scale: 44 } as const
export type Geo = typeof GEO

/** The camera's vertical field of view [estimated]. */
export const FOV = 30
/**
 * How far over the horizon each shot looks down, in degrees [estimated], in the game's box at 1440 (about 2.1 wide to 1 high). Over the
 * run and from the side look down further in a box less wide (a lesson's column, a small desk), where the rows have the height to stand
 * apart: over the run from 40 to 56 in TR6 lesson 1's column (about 1.3), from the side from 20 to 32.
 */
export const ELEVATION = { run: 40, course: 30, side: 20 } as const
const RAISE = { run: 20, course: 0, side: 15 } as const
export const elevationOf = (shot: ShotId, aspect: number): number => ELEVATION[shot] + RAISE[shot] * Math.min(0.9, Math.max(0, 2.1 - aspect))
/** How far each shot turns to the right of the rows, in degrees [estimated]. */
export const YAW = { run: 0, course: 0, side: 30 } as const

export type Vec3 = readonly [number, number, number]

export interface Bounds {
  readonly x0: number
  readonly x1: number
  readonly z0: number
  readonly z1: number
}

/** The canvas's size in CSS px. */
export interface Canvas {
  readonly width: number
  readonly height: number
}

/** A box in world units. */
export interface Box3 {
  readonly x0: number
  readonly x1: number
  readonly y0: number
  readonly y1: number
  readonly z0: number
  readonly z1: number
}

const rad = (deg: number): number => (deg * Math.PI) / 180

/** The direction from a target toward the camera, and the picture's right and up, for a camera turned `yaw` and raised `elevation`. */
function axesOf(yaw: number, elevation: number): { back: Vec3; right: Vec3; up: Vec3 } {
  const ey = rad(elevation)
  const ya = rad(yaw)
  return {
    back: [Math.sin(ya) * Math.cos(ey), Math.sin(ey), Math.cos(ya) * Math.cos(ey)],
    right: [Math.cos(ya), 0, -Math.sin(ya)],
    up: [-Math.sin(ya) * Math.sin(ey), Math.cos(ey), -Math.cos(ya) * Math.sin(ey)],
  }
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cornersOf = (box: Box3): Vec3[] => [box.x0, box.x1].flatMap((x) => [box.y0, box.y1].flatMap((y) => [box.z0, box.z1].map((z): Vec3 => [x, y, z])))

/**
 * A pinhole camera that holds a box whole in a canvas of this aspect, and fills it: it looks from the direction turned `yaw` about the
 * vertical (0 is from the front, +z) and raised `elevation` over the horizon, at the point that centres the box's picture, from the least
 * distance that keeps each of the box's eight corners inside the picture with a margin. Centring the picture, and not the box, is what
 * fills the canvas: a box seen from above stands higher in the picture at its back than at its front, so its middle is not the picture's.
 */
export function fitBox(box: Box3, yaw: number, elevation: number, aspect: number, margin = 1.04, foot = false): { position: Vec3; target: Vec3; distance: number } {
  const { back, right, up } = axesOf(yaw, elevation)
  const v = Math.tan(rad(FOV) / 2)
  const h = v * aspect
  const corners = cornersOf(box)
  let target: Vec3 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2]
  let distance = 0
  // A few rounds of: the distance that holds every corner, then the target that centres their picture at that distance.
  for (let round = 0; round < 8; round++) {
    distance = 0
    for (const c of corners) {
      const d: Vec3 = [c[0] - target[0], c[1] - target[1], c[2] - target[2]]
      const along = dot(d, back)
      distance = Math.max(distance, along + Math.abs(dot(d, right)) / h, along + Math.abs(dot(d, up)) / v)
    }
    distance *= margin
    // Where each corner falls in the picture, as a share of the half-width and the half-height, from this distance.
    let [l, r, b, t] = [Infinity, -Infinity, Infinity, -Infinity]
    for (const c of corners) {
      const d: Vec3 = [c[0] - target[0], c[1] - target[1], c[2] - target[2]]
      const depth = distance - dot(d, back)
      const sx = dot(d, right) / (depth * h)
      const sy = dot(d, up) / (depth * v)
      l = Math.min(l, sx)
      r = Math.max(r, sx)
      b = Math.min(b, sy)
      t = Math.max(t, sy)
    }
    // Move the target by the picture's off-centre share, at the target's own depth; with `foot`, so that the box's foot stands at the
    // picture's foot and the room it leaves goes to what stands behind it.
    const dx = ((l + r) / 2) * distance * h
    const dy = (foot ? b + 1 / margin : (b + t) / 2) * distance * v
    target = [target[0] + right[0] * dx + up[0] * dy, target[1] + right[1] * dx + up[1] * dy, target[2] + right[2] * dx + up[2] * dy]
  }
  return { distance, target, position: [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance] }
}

/**
 * The three shots of the chain (each in the order and with the words of `shots`, scene-shots.ts), framed for the plate's bounds and the
 * canvas it is drawn in:
 *   Over the run        the opening shot: every row from the front, raised so that the rows stand clear of one another and each row's
 *                       skyline reads against the one in front of it, on the one height scale, with every count over its bar.
 *   One draft position  the front row's bars, low and close, standing on the picture's foot, so each token's two bars read against each
 *                       other by their heights and the rows behind fill the room over them.
 *   From the side       turned to the right of the rows, low, so the rows' skylines line up behind one another and a bar's height reads
 *                       against the same token's in the next draft position, and against the value scale.
 */
export function presetsOf(bounds: Bounds, shots: readonly Shot[], canvas: Canvas): CameraPreset[] {
  const aspect = canvas.width / Math.max(1, canvas.height)
  const y1 = (GEO.height + 40) / PX
  const w1 = bounds.x1 / PX
  const z1 = bounds.z1 / PX
  const whole: Box3 = { x0: bounds.x0 / PX, x1: w1, y0: 0, y1, z0: bounds.z0 / PX, z1 }
  // The front row alone: its bars and the value scale, from the row's back edge to the tokens' numbers under it; not the label column.
  const front: Box3 = { x0: (bounds.x0 + GEO.names - 8) / PX, x1: w1, y0: 0, y1, z0: z1 - (GEO.depth + GEO.tags + 8) / PX, z1 }
  const shoot = (box: Box3, yaw: number, elevation: number, shot: CameraPreset['shot'], margin?: number, foot?: boolean): Omit<CameraPreset, 'id' | 'label'> => {
    const { position, target } = fitBox(box, yaw, elevation, aspect, margin, foot)
    return { shot, projection: 'perspective', fov: FOV, position, target }
  }
  const framings: Record<ShotId, Omit<CameraPreset, 'id' | 'label'>> = {
    run: shoot(whole, YAW.run, elevationOf('run', aspect), 'establish'),
    course: shoot(front, YAW.course, elevationOf('course', aspect), 'focus', 1.06, true),
    side: shoot(whole, YAW.side, elevationOf('side', aspect), 'follow'),
  }
  return shots.map((shot) => ({ ...shot, ...framings[shot.id] }))
}

/** Where a point of the drawing (in px) stands in the canvas through a shot's camera, in CSS px, or null when it is behind the camera. */
export type Projector = (x: number, y: number, z: number) => { x: number; y: number } | null

/** The pinhole projection of a perspective shot, without three: the one the scene's camera draws (CameraRig looks from `position` at `target`). */
export function projectorOf(shot: Pick<CameraPreset, 'position' | 'target' | 'fov'>, canvas: Canvas): Projector {
  const [px, py, pz] = shot.position
  const f: Vec3 = [shot.target[0] - px, shot.target[1] - py, shot.target[2] - pz]
  const fl = Math.hypot(...f)
  const fwd: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl]
  // Right is forward crossed with the world's up, and up is right crossed with forward.
  const r: Vec3 = [-fwd[2], 0, fwd[0]]
  const rl = Math.hypot(...r) || 1
  const right: Vec3 = [r[0] / rl, 0, r[2] / rl]
  const up: Vec3 = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]]
  const v = Math.tan(rad(shot.fov ?? FOV) / 2)
  const h = v * (canvas.width / Math.max(1, canvas.height))
  return (x, y, z) => {
    const d: Vec3 = [x / PX - px, y / PX - py, z / PX - pz]
    const depth = dot(d, fwd)
    if (depth <= 0) return null
    return { x: ((dot(d, right) / (depth * h) + 1) / 2) * canvas.width, y: ((1 - dot(d, up) / (depth * v)) / 2) * canvas.height }
  }
}
