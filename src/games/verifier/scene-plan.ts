/*
 * The rejection sampler's skylines as a plan (REDESIGN §2.8, §2.9): the sizes the layout (scene-layout.ts) draws them at, and the three
 * shots they are seen through. Pure arithmetic with no three in it, so the game's page holds the camera's buttons and the `C` key before
 * the scene's chunk loads, and Bun tests the framing.
 *
 * The world is the 2D diagram stood up: a sheet of paper laid flat, one row of bars for each draft position, the first row nearest the
 * viewer and the next ones behind it, so the rows' skylines line up into depth. In a row, a token's two bars stand side by side, the
 * draft's q then the target's p, each as tall as its count out of the shared axis. Lengths are in the diagram's px, 100 to a world unit
 * (flat-track.ts), and every one is [estimated], set by eye at 1440 and 390.
 */
import type { CameraPreset } from '@/scene/camera-rig'
import { PX } from '@/scene/flat-track'
import type { Shot, ShotId } from './scene-shots'

/** The bars' sizes, in px: a token's column, one bar's width and the gap between the pair, a bar's depth, a row's pitch, and the tallest bar's height. */
export interface Geo {
  readonly col: number
  readonly bar: number
  readonly gap: number
  readonly depth: number
  readonly row: number
  readonly height: number
  readonly names: number
  readonly pad: number
  readonly tags: number
}
/** A run of draft positions: six tokens across and a row for each position, behind the one before. */
export const GEO: Geo = { col: 64, bar: 20, gap: 4, depth: 26, row: 70, height: 100, names: 112, pad: 16, tags: 22 }
/** One draft position alone: the same six tokens, drawn larger, since there are no rows to share the box. */
export const GEO_ONE: Geo = { col: 98, bar: 33, gap: 6, depth: 40, row: 0, height: 120, names: 0, pad: 18, tags: 26 }
/** A phone's drawing of rows: its names are a character each, so the label column is narrow. */
export const GEO_NARROW: Geo = { ...GEO, names: 40 }
/** The sizes for a drawing of this many rows, on a canvas that is narrow or not. */
export const geoOf = (rows: number, narrow = false): Geo => (rows > 1 ? (narrow ? GEO_NARROW : GEO) : GEO_ONE)
/** `gamma`'s positions: a column each, one bar a position. */
export const GAMMA = { col: 70, bar: 42 } as const
/** The camera's vertical field of view [estimated]. */
export const FOV = 30

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

const rad = (deg: number): number => (deg * Math.PI) / 180

/**
 * A pinhole camera that holds a box (`x0..x1`, `y0..y1`, `z0..z1`, world units) whole in a canvas of this aspect: looking at `target` from the
 * direction turned `yaw` about the vertical (0 is from the front, +z) and raised `elevation` over the horizon. The distance is the
 * smallest that keeps each of the box's eight corners inside the picture, with a margin.
 */
export function fitBox(box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }, target: Vec3, yaw: number, elevation: number, aspect: number, margin = 1.06): { position: Vec3; distance: number } {
  const ey = rad(elevation)
  const ya = rad(yaw)
  // The unit vector from the target toward the camera, and the picture's right and up.
  const back: Vec3 = [Math.sin(ya) * Math.cos(ey), Math.sin(ey), Math.cos(ya) * Math.cos(ey)]
  const right: Vec3 = [Math.cos(ya), 0, -Math.sin(ya)]
  const up: Vec3 = [-Math.sin(ya) * Math.sin(ey), Math.cos(ey), -Math.cos(ya) * Math.sin(ey)]
  const v = Math.tan(rad(FOV) / 2)
  let distance = 0
  for (const x of [box.x0, box.x1])
    for (const y of [box.y0, box.y1])
      for (const z of [box.z0, box.z1]) {
        const d: Vec3 = [x - target[0], y - target[1], z - target[2]]
        const along = d[0] * back[0] + d[1] * back[1] + d[2] * back[2]
        const across = Math.abs(d[0] * right[0] + d[1] * right[1] + d[2] * right[2])
        const high = Math.abs(d[0] * up[0] + d[1] * up[1] + d[2] * up[2])
        distance = Math.max(distance, along + across / (v * aspect), along + high / v)
      }
  distance *= margin
  return { distance, position: [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance] }
}

/**
 * The three shots of a drawing (each in the order and with the words of `shots`, scene-shots.ts), framed for the plate's bounds and the
 * canvas it is drawn in:
 *   Over the run        every row, raised high enough that the rows stand clear of one another; higher on a tall canvas, which has the room.
 *   One draft position  the front row alone, low, so each token's two bars read against each other by their heights.
 *   From the side       turned to the right of the rows, low, so the rows' skylines line up behind one another and a bar's height reads
 *                       against the same token's in the next draft position.
 * `geo` is the sizes the drawing was laid out at.
 */
export function presetsOf(bounds: Bounds, rows: number, shots: readonly Shot[], canvas: Canvas, geo: Geo = geoOf(rows)): CameraPreset[] {
  const aspect = canvas.width / Math.max(1, canvas.height)
  const tall = aspect < 1
  const h = (geo.height + 18) / PX
  const w0 = bounds.x0 / PX
  const w1 = bounds.x1 / PX
  const z0 = bounds.z0 / PX
  // Under the front edge the tokens' numbers hang, a little past the plate's apron.
  const z1 = (bounds.z1 + 12) / PX
  const mid: Vec3 = [(w0 + w1) / 2, h / 2.6, (z0 + z1) / 2]
  const whole = { x0: w0, x1: w1, y0: 0, y1: h, z0, z1 }
  // The front row alone: from its front edge back to the row's far one.
  const frontZ0 = z1 - (geo.depth + geo.tags + 12) / PX
  const front = { x0: w0, x1: w1, y0: 0, y1: h, z0: frontZ0, z1 }
  const framings: Record<ShotId, Omit<CameraPreset, 'id' | 'label'>> = {
    run: (() => {
      const { position } = fitBox(whole, mid, 0, (tall ? 62 : 46) + (rows > 2 ? 4 : 0), aspect)
      return { shot: 'establish', projection: 'perspective', fov: FOV, position, target: mid }
    })(),
    course: (() => {
      const target: Vec3 = [(w0 + w1) / 2, h / 2.6, (frontZ0 + z1) / 2]
      const { position } = fitBox(front, target, 0, tall ? 30 : 20, aspect, 1.08)
      return { shot: 'focus', projection: 'perspective', fov: FOV, position, target }
    })(),
    side: (() => {
      const { position } = fitBox(whole, mid, 52, tall ? 26 : 18, aspect, 1.06)
      return { shot: 'follow', projection: 'perspective', fov: FOV, position, target: mid }
    })(),
  }
  return shots.map((shot) => ({ ...shot, ...framings[shot.id] }))
}
