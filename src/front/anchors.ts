/*
 * Where the 3D pass puts its landmarks on the screen (TRACKER W0-T18), so the front page can hang its own objects on them.
 *
 * On a wide screen the page's printer and its order ticket stand in front of the 3D pass: the ticket's clip sits on the scene's rail,
 * and the printer covers the scene's own printer and the strip of tickets curling out of it, so the pass has one printer. The
 * objects are DOM, placed by CSS, so they are where they belong before any script runs and whichever view (2D or 3D) is behind them.
 *
 * The camera's default shot ("Over the shoulder", scene-presets.ts) is a perspective camera with a fixed vertical field of view. Such a
 * camera puts a point at a height that is a fixed fraction of the box, whatever the box's width, and at a distance from the box's
 * centre line that is a fixed multiple of the box's height. So each landmark is two numbers, c and d, and CSS places it with container
 * units on the pass's box:
 *
 *     x = 50cqw + c × 50cqh        y = (1 − d) × 50cqh
 *
 * c and d come from the shot (its position, target and field of view) and from the scene's layout (scene-layout.ts), so a change to
 * either moves the page's objects with the scene. tests/front/anchors.test.ts checks every number against three's own projection.
 * Below 80rem the page stacks its objects above the pass instead (front.css), and below 480 px the scene takes its portrait framing.
 */
import { DEFAULT_FOV, presetById, type CameraPreset, type Vec3 } from '@/scene/camera-rig'
import type { Sheet } from '@/scene/SheetInstances'
import { DEFAULT_PRESET, LOOP_PRESETS } from '@/games/loop/scene-presets'
import { clipX, printerAt, RAIL, sceneLayout, TICKET } from '@/games/loop/scene-layout'
import type { LoopView } from '@es/play/loop/types'

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

/** The four corners of a sheet of paper, turned as three turns it (Euler angles in XYZ order). */
export function sheetCorners(sheet: Sheet): Vec3[] {
  const [rx, ry, rz] = sheet.rotation ?? [0, 0, 0]
  const turn = (p: Vec3): Vec3 => {
    // R = Rx · Ry · Rz, applied to the point: z first, then y, then x.
    const [x0, y0, z0] = p
    const x1 = x0 * Math.cos(rz) - y0 * Math.sin(rz)
    const y1 = x0 * Math.sin(rz) + y0 * Math.cos(rz)
    const x2 = x1 * Math.cos(ry) + z0 * Math.sin(ry)
    const z2 = -x1 * Math.sin(ry) + z0 * Math.cos(ry)
    const y3 = y1 * Math.cos(rx) - z2 * Math.sin(rx)
    const z3 = y1 * Math.sin(rx) + z2 * Math.cos(rx)
    return [x2, y3, z3]
  }
  const [w, h] = sheet.size
  return [
    [-w / 2, -h / 2, 0],
    [w / 2, -h / 2, 0],
    [w / 2, h / 2, 0],
    [-w / 2, h / 2, 0],
  ].map((corner) => {
    const turned = turn(corner as unknown as Vec3)
    return [turned[0] + sheet.center[0], turned[1] + sheet.center[1], turned[2] + sheet.center[2]] as Vec3
  })
}

/** The eight corners of a box. */
function boxCorners(center: Vec3, size: Vec3): Vec3[] {
  const corners: Vec3[] = []
  for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) corners.push([center[0] + sx * size[0], center[1] + sy * size[1], center[2] + sz * size[2]])
  return corners
}

/** What the page lines its objects up with, in the default shot. Every x is a `c` and every height a fraction from the top. */
export interface PassAnchors {
  /** The middle of the rail's bar. */
  readonly railY: number
  /** The rail's thickness, as a fraction of the box's height. */
  readonly railH: number
  /** The top of the scene's printer: the page's printer must start above it. */
  readonly printerTop: number
  /** The foot of the strip of waiting tickets that hangs from the scene's printer: the page's ticket must reach below it. */
  readonly stripBottom: number
  /** The left and right edges of the scene's printer with its strip: what the page's objects must cover. */
  readonly coverLeft: number
  readonly coverRight: number
  /** The left edge of the first clip's ticket: what the page's objects must leave clear. */
  readonly clipLeft: number
  /** The left edge of the masking tape on the expo's lane, where the scene names the CPU lane: the order must stop short of it too. */
  readonly expoLeft: number
  /** The middle of each clip on the rail: where a ticket dropped on the 3D pass is hung. */
  readonly clips: readonly number[]
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000

/**
 * The anchors of the default shot over the first view of the run. The strip is drawn as it stands at the start, with every ticket of
 * the night waiting and the strip at its longest; it only gets shorter as tickets are hung.
 */
export function passAnchors(view: LoopView): PassAnchors {
  const preset = presetById(LOOP_PRESETS, DEFAULT_PRESET)
  const project = projector(preset)
  const layout = sceneLayout(view)
  const [px, , pz] = printerAt(view.slots)
  // The printer is every box of the steel that stands on the printer's centre line: its housing, its lid and its mouth.
  const printer = layout.fixtures.filter((part) => part.kind === 'box' && Math.abs(part.center[0] - px) < 1e-9 && Math.abs(part.center[2] - pz) < 0.2)
  const strip = layout.tickets.filter((sheet) => sheet.kind === 'waiting')
  const printerPoints = printer.flatMap((part) => (part.kind === 'box' ? boxCorners(part.center, part.size) : [])).map(project)
  const stripPoints = strip.flatMap(sheetCorners).map(project)
  const cover = [...printerPoints, ...stripPoints]
  const railAt = (x: number, y: number) => project([x, y, RAIL.z])
  const railMid = railAt(clipX(0) - 0.5, RAIL.y)
  const railTop = railAt(clipX(0) - 0.5, RAIL.y + 0.025)
  const railFoot = railAt(clipX(0) - 0.5, RAIL.y - 0.025)
  return {
    railY: round(fromTop(railMid.d)),
    railH: round(fromTop(railFoot.d) - fromTop(railTop.d)),
    printerTop: round(Math.min(...printerPoints.map((point) => fromTop(point.d)))),
    stripBottom: round(Math.max(...stripPoints.map((point) => fromTop(point.d)))),
    coverLeft: round(Math.min(...cover.map((point) => point.c))),
    coverRight: round(Math.max(...cover.map((point) => point.c))),
    clipLeft: round(railAt(clipX(0) - TICKET.w / 2, RAIL.y).c),
    expoLeft: round(Math.min(...layout.tapes.filter((tape) => tape.id === 'tape-cpu').flatMap(sheetCorners).map((point) => project(point).c))),
    clips: view.rail.map((_, slot) => round(railAt(clipX(slot), RAIL.y).c)),
  }
}

/** The anchors as the custom properties front.css reads on the pass's box: plain numbers, which CSS multiplies by container units. */
export function anchorProperties(anchors: PassAnchors): Record<string, string> {
  return {
    '--pass-rail-y': String(anchors.railY),
    '--pass-rail-h': String(anchors.railH),
    '--pass-printer-top': String(anchors.printerTop),
    '--pass-strip-bottom': String(anchors.stripBottom),
    '--pass-cover-left': String(anchors.coverLeft),
    '--pass-cover-right': String(anchors.coverRight),
    '--pass-clip-left': String(anchors.clipLeft),
    '--pass-expo-left': String(anchors.expoLeft),
  }
}
