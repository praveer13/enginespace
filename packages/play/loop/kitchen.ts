/**
 * Service's kitchen, as a plan (GAMES.md §2.6 "Service", §3 "3D scene"): where the pass, the rail, the line, the lamps and the room
 * stand, in metres with y up and +z toward the expo, and the shots the game is seen through. The 3D scene lays its props out from these
 * measures (src/games/loop/scene-layout.ts) and the 2D view draws the same kitchen through the same shots (layout.ts), so the two views
 * are one kitchen and the front page's own objects line up with either. Every length is [estimated], on the scene kit's proportions.
 *
 * A shot is a camera that looks from `position` at `target` with up kept up. Its lens is `k`, the tangent of half its vertical field
 * of view, and `shift` moves the picture's centre off the box's centre, in half box heights (right and down), which is a lens shifted
 * in its mount: what the camera sees is the same, only placed elsewhere in the box. Pure arithmetic with no `Math.tan`, so the poster
 * the build writes is the 2D view the browser paints, byte for byte (D-017).
 */

export type Vec3 = readonly [number, number, number]

/** The pass: its counter's top, its depth, and how high the gantry's bar stands over it. */
export const PASS = { top: 0.92, depth: 0.6, gantry: 0.62 } as const
/** The rail's top (it hangs under the gantry's bar) and how far back over the counter it runs. */
export const RAIL = { y: PASS.top + PASS.gantry - 0.008, z: -PASS.depth / 2 + 0.06 } as const
/** The gantry's bar, which the fired rail hangs from. */
export const BAR = { y: PASS.top + PASS.gantry + 0.012, z: -PASS.depth / 2 + 0.035 } as const
/** The fired rail, hung below the rail from the same bar. */
export const FIRED = { y: RAIL.y - 0.24, z: BAR.z } as const
/** A ticket off the printer: 80 mm wide, 120 mm long, and how far below the rail's top its clip grips it. */
export const TICKET = { width: 0.08, height: 0.12 } as const
export const GRIP = 0.035 + 0.0035 + 0.004
/** Where a plate rests on the counter. */
export const PLATE_Z = 0.02
/** A dinner plate's rim [estimated]. */
export const PLATE_R = 0.1356
/** The line: its stations' centre line, depth and worktop height; the wall behind it; the ceiling the heat lamps hang from. */
export const LINE = { z: -1.95, depth: 0.8, height: 0.9 } as const
export const WALL_Z = -2.36
export const CEILING = 2.95
/** The mouth of a heat lamp's shade, above the floor. */
export const MOUTH = 1.86
/** The hood over the line: its top on the wall, its height and its depth out from the wall. Low enough to be seen over the lamps. */
export const HOOD = { top: 2.38, height: 0.48, depth: 1.05 } as const
/** The heated shelf under the counter: its bars' top, below the counter's top. */
export const SHELF = { drop: 0.37 } as const
/** The most stations the line has: a longer rail shares them. */
export const MAX_STATIONS = 6
export const STATION_KINDS = ['griddle', 'burners', 'fryer', 'burners', 'griddle', 'fryer'] as const
export type StationKind = (typeof STATION_KINDS)[number]

/** The distance between two clips: a ticket's width and a plate's apart, for a front-page rail; closer on a longer rail. */
export const pitchOf = (slots: number): number => Math.max(0.12, Math.min(0.36, 1.44 / slots))
/** A plate's rim on a rail of `slots` clips: a dinner plate while it fits between two clips, a smaller plate on a longer rail [estimated]. */
export const plateRadius = (slots: number): number => Math.min(PLATE_R, pitchOf(slots) * 0.46)
/** The middle of clip `slot`, across the pass. Clip 0 is nearest the printer, at the left. */
export const clipX = (slot: number, slots: number): number => (slot + 0.5 - slots / 2) * pitchOf(slots)
/** The pass's width: room for the printer and its tickets at the left, the clips, and the bin, the bell and the spike at the right. */
export const passWidth = (slots: number): number => Math.max(2.6, slots * pitchOf(slots) + 1.2)
/** The rail's length: past its first and last clips. */
export const railLength = (slots: number): number => slots * pitchOf(slots) + 0.16

/** The line's stations for a rail of `slots` clips: how many, how wide each, and the middle of each. */
export function lineOf(slots: number): { readonly count: number; readonly width: number; readonly x: (s: number) => number } {
  const count = Math.min(slots, MAX_STATIONS)
  const width = Math.min(0.58, 2.4 / count)
  return { count, width, x: (s) => (s + 0.5 - count / 2) * width }
}

/** The three heat lamps' x over the pass. */
export function lampsOf(slots: number): readonly number[] {
  const spread = Math.min(0.55, (slots * pitchOf(slots)) / 3)
  return [-spread, 0, spread]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The shots                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface Shot {
  readonly position: Vec3
  readonly target: Vec3
  /** The tangent of half the vertical field of view. */
  readonly k: number
  /** The picture's centre, off the box's centre, in half box heights: right and down. */
  readonly shift?: readonly [number, number]
}

/**
 * Service's shots, each in the three widths a page has: the base (480 px and up), `wide` (the front page from 80rem, where the
 * page's own objects stand at the left of the box and the kitchen is framed to their right), and `portrait` (below 480 px).
 *
 *   front     the front page's pass, over the expediter's shoulder, about 20° down: the hood and the lamps at the top, the rail across
 *             the top third, the line beyond it and the pass across the middle, its heated shelf and plate stacks under it. From 80rem
 *             the picture moves right by 1.15 half heights, so the whole line and the lit pass stand clear of the order ticket. On a
 *             phone the camera stands back and the picture moves down by half a box height, so the kitchen fills the box under the
 *             order ticket that hangs over its top.
 *   loop      Service's own page: over the shoulder, closer, the printer at the pass's left end in the shot (scene-presets.ts's
 *             first preset).
 */
export const SHOTS = {
  front: {
    base: { position: [0, 2.45, 3.3], target: [0, 0.99, -0.6], k: 0.2867 },
    wide: { position: [0, 2.45, 3.3], target: [0, 0.99, -0.6], k: 0.2867, shift: [1.15, 0] },
    portrait: { position: [0, 2.4, 3.4], target: [0, 1, -0.5], k: 0.404, shift: [0, 0.5] },
  },
  loop: {
    base: { position: [0, 2.4, 2.4], target: [0, 1.1, -0.9], k: 0.3249 },
    portrait: { position: [0, 2.3, 1.9], target: [0, 1, -0.6], k: 0.4663 },
  },
} as const satisfies Record<string, { readonly base: Shot; readonly wide?: Shot; readonly portrait: Shot }>

/** A point of the kitchen in a shot: `c` across and `d` up, in half box heights from the picture's centre, and how far it is. */
export interface Seen {
  readonly c: number
  readonly d: number
  readonly depth: number
}

/**
 * The projection of a shot (no shift): looking from its position at its target with up kept up. On a box `h` half heights tall, a point
 * lands at x = centre + c × h and y = middle − d × h, which is three's own perspective camera.
 */
export function viewOf(shot: Shot): (point: Vec3) => Seen {
  const [px, py, pz] = shot.position
  let fx = shot.target[0] - px
  let fy = shot.target[1] - py
  let fz = shot.target[2] - pz
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz)
  fx /= fl
  fy /= fl
  fz /= fl
  // Right is forward × up, and up is right × forward.
  const rl = Math.sqrt(fz * fz + fx * fx)
  const rx = -fz / rl
  const rz = fx / rl
  const ux = -rz * fy
  const uy = rz * fx - rx * fz
  const uz = rx * fy
  return ([x, y, z]) => {
    const vx = x - px
    const vy = y - py
    const vz = z - pz
    const depth = vx * fx + vy * fy + vz * fz
    const scale = depth * shot.k
    return { c: (vx * rx + vz * rz) / scale, d: (vx * ux + vy * uy + vz * uz) / scale, depth }
  }
}
