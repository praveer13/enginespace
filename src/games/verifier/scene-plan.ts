/*
 * The Tasting's kitchen as a plan (GAMES.md §2.6 "The Tasting", §10 "3D scene"): where the pass, its rows of stacks, the line and the
 * room stand, in metres with y up and +z toward the expo, and the three shots the scene is seen through. Pure arithmetic with no three
 * in it, so the game's page holds the camera's buttons and the `C` key before the scene's chunk loads, and Bun tests the framing.
 *
 * Every length is [estimated], on the scene kit's proportions:
 *   - a tasting plate is 120 mm across, and a stack of them rises 11 mm a plate, so a whole tasting of sixty-four stands 70 cm tall;
 *   - each dish has the commis's stack on its left and the chef's dispenser on its right, four fingers apart; the dishes stand 40 cm
 *     apart across the pass, and a run's courses stand in rows 50 cm apart, from the pass's front edge back toward the line;
 *   - over a run, the pass runs on to the left of the soup by a stride, where each course's name lies on its tape clear of its stacks;
 *   - `gamma` stands its eight positions of a run across the pass, 30 cm apart, in one row.
 */
import type { CameraPreset } from '@/scene/camera-rig'
import type { Shot, ShotId } from './scene-shots'

export type Vec3 = readonly [number, number, number]

/** A tasting plate: its rim's radius, its own height, and how much each plate adds to a stack. */
export const PLATE = { r: 0.06, h: 0.0098, pitch: 0.011 } as const
/** A whole tasting: the most plates a stack holds, and what a dispenser stands tall enough for. */
export const FULL = 64
/** The pass's counter top, as Service's. */
export const TOP = 0.92
/** From a dish's middle to its two stacks' middles. */
export const PAIR = 0.08
/** Between two dishes' middles, two rows of a run, and two positions of `gamma`. */
export const DISH = 0.4
export const ROW = 0.5
export const STEP = 0.28
/** The pass's front edge, before the first row. */
export const FRONT = 0.26
/** How much further left the pass runs over a run, for the courses' names: a strip as wide as the longest name's tape. */
export const NAMES = 0.45

/** The height a stack of `plates` reaches over the counter. */
export const stackHeight = (plates: number): number => (plates > 0 ? (plates - 1) * PLATE.pitch + PLATE.h : 0)

export interface Plan {
  /** Rows of dish pairs into depth, or `gamma`'s positions across the pass. */
  readonly kind: 'rows' | 'gamma'
  readonly rows: number
  readonly columns: number
  /** The pass's middle across the room: left of the dishes' middle over a run, whose courses are named on its left end. */
  readonly x: number
  /** The pass's width and depth, and the z of its back edge. */
  readonly width: number
  readonly depth: number
  readonly back: number
  /** The heat lamps' mouths: higher over a run, so that the courses behind stand clear of them in the shot over the run. */
  readonly mouth: number
}

export function planOf(kind: Plan['kind'], rows: number): Plan {
  const n = kind === 'gamma' ? 1 : Math.max(1, rows)
  const columns = kind === 'gamma' ? 8 : 6
  // A run's names need the room of their tape, and a little more, beside the soup.
  const names = n > 1 ? NAMES : 0
  const width = (kind === 'gamma' ? columns * STEP + 0.6 : columns * DISH + 0.5) + names
  const depth = (n - 1) * ROW + FRONT + 0.3
  return { kind, rows: n, columns, x: -names / 2, width, depth, back: FRONT - depth, mouth: 1.86 + 0.08 * (n - 1) }
}

/** A column's middle across the pass: a dish, or a position of `gamma`. */
export const columnX = (plan: Plan, column: number): number => (column + 0.5 - plan.columns / 2) * (plan.kind === 'gamma' ? STEP : DISH)
/** A row's middle, from the front row back. */
export const rowZ = (row: number): number => 0 - row * ROW

/** The line beyond the pass, the wall behind it, and the room's left corner. */
export function roomOf(plan: Plan): { lineZ: number; wallZ: number; sideX: number } {
  const lineZ = plan.back - 1.15
  return { lineZ, wallZ: lineZ - 0.41, sideX: plan.x - plan.width / 2 - 1.3 }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The shots                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The three shots of a plan (GAMES.md §2.6, The Tasting's cameras), each in the order and with the words of `shots`
 * (scene-shots.ts, which the page holds, so its buttons stand before the scene loads):
 *   Over the run        Establish: from the expo's side of the pass and above it, the lamps at the top, the pass and its stacks across
 *                       the lower half, any later courses in rows behind, the line beyond. Over a run of courses, from higher and
 *                       closer, so the courses and their names fill the box and the hood stands above it. On a phone, from higher
 *                       still, so all six pairs fit, with the pass's front edge at the foot of the box and no floor under it.
 *   One course          Focus: the front course, front on and nearly level with the counter, so the stacks' heights and the rings
 *                       read against each other.
 *   Walk with the chef  Follow, which the learner chooses: low from the pass's right end, along the front course and down the run.
 */
export function presetsOf(plan: Plan, shots: readonly Shot[]): CameraPreset[] {
  const deep = (plan.rows - 1) * ROW
  const mid = -deep / 2
  // The pass's right end: the walk starts there.
  const end = plan.x + plan.width / 2
  const framings: Record<ShotId, Omit<CameraPreset, 'id' | 'label'>> = {
    run: {
      shot: 'establish',
      projection: 'perspective',
      ...(plan.rows > 1
        ? { position: [-0.2, 3, 2 + deep * 0.15], target: [-0.2, 0.85, mid - 0.3], fov: 36, portrait: { position: [0, 3.8 + deep * 0.3, 2.4], target: [0, 1.1, mid - 0.2], fov: 40 } }
        : { position: [-0.3, 2.02, 2.62], target: [0, 1.15, -0.24], fov: 34, portrait: { position: [-0.1, 3.4, 3.4], target: [0, 1.85, -0.2], fov: 40 } }),
    },
    course: {
      shot: 'focus',
      projection: 'perspective',
      position: [0, 1.32, 3.15],
      target: [0, 1.12, 0],
      fov: 29,
      portrait: { position: [0, 1.6, 4.9], target: [0, 1.12, -0.05], fov: 34 },
    },
    walk: {
      shot: 'follow',
      projection: 'perspective',
      position: [end + 0.42, 1.36, 0.82],
      target: [-0.35, 1.0, mid - 0.1],
      fov: 36,
      portrait: { position: [end + 0.7, 1.6, 1.25], target: [-0.3, 1.0, mid - 0.15], fov: 48 },
    },
  }
  return shots.map((shot) => ({ ...shot, ...framings[shot.id] }))
}
