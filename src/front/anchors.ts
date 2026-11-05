/*
 * Where the 3D pass puts its landmarks on the screen (TRACKER W0-T18), so the front page can hang its own objects on them.
 *
 * On a wide screen the page's printer and its order ticket stand in front of the 3D pass: the ticket's clip sits on the scene's rail,
 * left of the clips the game hangs its tickets on, and the printer covers the pass's left end. The objects are DOM, placed by CSS, so
 * they are where they belong before any script runs and whichever view (2D or 3D) is behind them.
 *
 * The front page's shot (scene-presets.ts, `FRONT_PRESETS`) is a perspective camera with a fixed vertical field of view. Such a camera
 * puts a point at a height that is a fixed fraction of the box, whatever the box's width, and at a distance from the box's centre line
 * that is a fixed multiple of the box's height. So each landmark is two numbers, c and d, and CSS places it with container units on
 * the pass's box:
 *
 *     x = 50cqw + c × 50cqh        y = (1 − d) × 50cqh
 *
 * `passAnchors` computes them from the shot and the scene's layout (scene-layout.ts). The page reads `PASS_ANCHORS`, the same numbers
 * written out, so the first paint carries no scene layout; tests/front/anchors.test.ts holds the two equal, and every number to three's
 * own projection. Below 80rem the page stacks its objects above the pass instead (front.css), and below 480 px the scene takes its
 * portrait framing.
 */
import { DEFAULT_FOV, type CameraPreset, type Vec3 } from '@/scene/camera-rig'
import { clipX, RAIL, TICKET } from '@/games/loop/scene-layout'
import { FRONT_PRESETS } from '@/games/loop/scene-presets'

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => {
  const length = Math.sqrt(dot(a, a))
  return [a[0] / length, a[1] / length, a[2] / length]
}

/** A point of the scene in the shot: c across (× half the box's height, from the centre line) and d up (× half its height). */
export interface Projected {
  readonly c: number
  readonly d: number
}

/** The projection of a perspective preset, looking from its position at its target with up kept up (camera-rig.ts). */
export function projector(preset: CameraPreset): (point: Vec3) => Projected {
  const forward = unit(sub(preset.target, preset.position))
  const right = unit(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)
  const k = Math.tan(((preset.fov ?? DEFAULT_FOV) * Math.PI) / 360)
  return (point) => {
    const v = sub(point, preset.position)
    const depth = dot(v, forward)
    return { c: dot(v, right) / (depth * k), d: dot(v, up) / (depth * k) }
  }
}

/** A point's height in the box, as a fraction from its top. */
export const fromTop = (d: number): number => (1 - d) / 2

/** What the page lines its objects up with, in the front page's shot. Every x is a `c` and every height a fraction from the top. */
export interface PassAnchors {
  /** The middle of the rail's channel. */
  readonly railY: number
  /** The rail's thickness, as a fraction of the box's height. */
  readonly railH: number
  /** The left edge of the first clip's ticket: what the page's order ticket must stop short of. */
  readonly clipLeft: number
  /** The middle of each clip on the rail: where a ticket dropped on the 3D pass is hung. */
  readonly clips: readonly number[]
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000

/** The anchors of the front page's shot over a rail of `slots` clips (the front page's levels have four). */
export function passAnchors(slots = 4): PassAnchors {
  const project = projector(FRONT_PRESETS[0])
  const railAt = (x: number, y: number) => project([x, y, RAIL.z])
  const left = clipX(0, slots) - TICKET.width
  const mid = railAt(left, RAIL.y - 0.0175)
  return {
    railY: round(fromTop(mid.d)),
    railH: round(fromTop(railAt(left, RAIL.y - 0.035).d) - fromTop(railAt(left, RAIL.y).d)),
    clipLeft: round(railAt(clipX(0, slots) - TICKET.width / 2, RAIL.y).c),
    clips: Array.from({ length: slots }, (_, slot) => round(railAt(clipX(slot, slots), RAIL.y).c)),
  }
}

/** `passAnchors()`, written out: what the first paint uses. tests/front/anchors.test.ts fails when the two differ. */
export const PASS_ANCHORS: PassAnchors = { railY: 0.3332, railH: 0.0203, clipLeft: 0.2633, clips: [0.3111, 0.7419, 1.1727, 1.6035] }

/** The anchors as the custom properties front.css reads on the pass's box: plain numbers, which CSS multiplies by container units. */
export function anchorProperties(anchors: PassAnchors): Record<string, string> {
  return {
    '--pass-rail-y': String(anchors.railY),
    '--pass-rail-h': String(anchors.railH),
    '--pass-clip-left': String(anchors.clipLeft),
  }
}
