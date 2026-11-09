/*
 * Where the 3D pass puts its landmarks on the screen (TRACKER W0-T18), so the front page can hang its own objects on them.
 *
 * On a wide screen the page's printer and its order ticket stand in front of the 3D pass at its left: the ticket's clip sits on the
 * scene's rail, and the ticket stops short of the line's first station, so the whole line and the lit pass stand clear of it. The
 * objects are DOM, placed by CSS, so they are where they belong before any script runs and whichever view (2D or 3D) is behind them.
 *
 * The front page's wide shot (scene-presets.ts, `FRONT_PRESETS`; packages/play/loop/kitchen.ts, `SHOTS.front.wide`) is a perspective
 * camera with a fixed vertical field of view and a lens shifted to the right. Such a camera puts a point at a height that is a fixed
 * fraction of the box, whatever the box's width, and at a distance from the box's centre line that is a fixed multiple of the box's
 * height. So each landmark is two numbers, c and d, and CSS places it with container units on the pass's box:
 *
 *     x = 50cqw + c × 50cqh        y = (1 − d) × 50cqh
 *
 * where c already holds the shift. `passAnchors` computes them from the shot and the kitchen's plan (packages/play/loop/kitchen.ts).
 * The page reads `PASS_ANCHORS`, the same numbers written out, so the first paint carries no projection; tests/front/anchors.test.ts
 * holds the two equal, and every number to three's own projection. Below 80rem the page stacks its objects above the pass instead
 * (front.css), and below 480 px the scene takes its portrait framing.
 */
import { clipX, LINE, lineOf, RAIL, railLength, TICKET } from '@es/play/loop/kitchen'
import { DEFAULT_FOV, framingFor, WIDE_WIDTH, type CameraPreset, type Vec3 } from '@/scene/camera-rig'
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

/**
 * The projection of a perspective preset in a canvas `width` px wide (its wide framing by default), looking from its position at its
 * target with up kept up (camera-rig.ts), its lens shifted as the framing says.
 */
export function projector(preset: CameraPreset, width = WIDE_WIDTH): (point: Vec3) => Projected {
  const framing = framingFor(preset, width)
  const forward = unit(sub(framing.target, framing.position))
  const right = unit(cross(forward, [0, 1, 0]))
  const up = cross(right, forward)
  const k = Math.tan(((framing.fov ?? DEFAULT_FOV) * Math.PI) / 360)
  const [sx, sy] = framing.shift
  return (point) => {
    const v = sub(point, framing.position)
    const depth = dot(v, forward)
    return { c: dot(v, right) / (depth * k) + sx, d: dot(v, up) / (depth * k) - sy }
  }
}

/** A point's height in the box, as a fraction from its top. */
export const fromTop = (d: number): number => (1 - d) / 2

/** What the page lines its objects up with, in the front page's wide shot. Every x is a `c` and every height a fraction from the top. */
export interface PassAnchors {
  /** The middle of the rail's channel. */
  readonly railY: number
  /** The rail's thickness, as a fraction of the box's height. */
  readonly railH: number
  /** Where the rail begins at its left end: the page's rail runs to it. */
  readonly railLeft: number
  /** The left edge of the first clip's ticket. */
  readonly clipLeft: number
  /** The middle of each clip on the rail: where a ticket dropped on the 3D pass is hung. */
  readonly clips: readonly number[]
  /** The left edge of the line's first station: what the page's order ticket must stop short of, so the whole line shows. */
  readonly lineLeft: number
  /** The picture's centre, right of the box's centre (the lens's shift): where the 2D drawing's centre stands. */
  readonly shift: number
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000

/** The anchors of the front page's wide shot over a rail of `slots` clips (the front page's levels have four). */
export function passAnchors(slots = 4): PassAnchors {
  const [preset] = FRONT_PRESETS
  const project = projector(preset)
  const railAt = (x: number, y: number) => project([x, y, RAIL.z])
  const left = clipX(0, slots) - TICKET.width
  const mid = railAt(left, RAIL.y - 0.0175)
  const line = lineOf(slots)
  // The first station's top front corner, at its splashes' height: the leftmost a station reaches on screen.
  const corner = project([line.x(0) - line.width / 2, LINE.height + 0.06, LINE.z + LINE.depth / 2])
  return {
    railY: round(fromTop(mid.d)),
    railH: round(fromTop(railAt(left, RAIL.y - 0.035).d) - fromTop(railAt(left, RAIL.y).d)),
    railLeft: round(railAt(-railLength(slots) / 2, RAIL.y).c),
    clipLeft: round(railAt(clipX(0, slots) - TICKET.width / 2, RAIL.y).c),
    clips: Array.from({ length: slots }, (_, slot) => round(railAt(clipX(slot, slots), RAIL.y).c)),
    lineLeft: round(corner.c),
    shift: round(framingFor(preset, WIDE_WIDTH).shift[0]),
  }
}

/** `passAnchors()`, written out: what the first paint uses. tests/front/anchors.test.ts fails when the two differ. */
export const PASS_ANCHORS: PassAnchors = { railY: 0.3253, railH: 0.0163, railLeft: 0.3828, clipLeft: 0.5938, clips: [0.6321, 0.9774, 1.3226, 1.6679], lineLeft: 0.3511, shift: 1.15 }

/** The anchors as the custom properties front.css reads on the pass's box: plain numbers, which CSS multiplies by container units. */
export function anchorProperties(anchors: PassAnchors): Record<string, string> {
  return {
    '--pass-rail-y': String(anchors.railY),
    '--pass-rail-h': String(anchors.railH),
    '--pass-rail-left': String(anchors.railLeft),
    '--pass-clip-left': String(anchors.clipLeft),
    '--pass-line-left': String(anchors.lineLeft),
    '--pass-shift': String(anchors.shift),
  }
}
