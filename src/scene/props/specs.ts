/*
 * The kitchen's static props as data (scene kit v1): what a game's layout lists for its static set, in metres, y up, each prop's
 * base at `at` and its front toward +z before `yaw` turns it. Pure types and numbers with no three in them, so a layout that lists
 * props is tested under Bun like any other layout. The builders in build.ts turn each into parts; StaticSet.tsx draws them all.
 *
 * Every size is [estimated]: real line equipment's proportions, set on the /design specimens. Hotel pans take the Gastronorm sizes
 * (1/1 is 530 × 325 mm, 1/2 is 325 × 265 mm, 1/3 is 325 × 176 mm [unverified: EN 631-1, not checked against the standard]).
 */
export type Vec3 = readonly [number, number, number]

interface Placed {
  readonly id: string
  readonly at: Vec3
  /** A turn about y, in radians. */
  readonly yaw?: number
}

/** The pass: a counter shelf with a rolled front edge, a heated lower shelf under it, and the heat-lamp strip over it on two posts. */
export interface PassSpec extends Placed {
  readonly kind: 'pass'
  readonly width: number
  readonly depth: number
  /** The counter's top above the floor. */
  readonly height: number
  /** The strip's underside above the counter; 0 leaves the strip out. */
  readonly strip: number
  /**
   * The rail's bar above the counter, on two posts from its back corners, for a pass whose rail does not ride on a strip; 0 leaves it
   * out. The rail itself is its own spec, hung under the bar.
   */
  readonly gantry?: number
}

/** A heat lamp hanging from the ceiling: its canopy at `at` (the ceiling), its rod `drop` long, its shade below. */
export interface HeatLampSpec extends Placed {
  readonly kind: 'heat-lamp'
  readonly drop: number
  /** A cord with a little sag, or a rigid rod. */
  readonly hang: 'cord' | 'rod'
}

/** A ticket rail's channel, `length` along x, its top at `at`. Its clips and tickets are dynamic (Tickets.tsx). */
export interface RailSpec extends Placed {
  readonly kind: 'rail'
  readonly length: number
}

/** The ticket printer standing on `at`: housing, paper roll and tear bar. Its paper's feed is dynamic (PrinterFeed in Tickets.tsx). */
export interface PrinterSpec extends Placed {
  readonly kind: 'printer'
}

/** The service bell's base, standing on `at`. Its dome and plunger strike (ServiceBell.tsx). */
export interface BellSpec extends Placed {
  readonly kind: 'bell-base'
}

/** A ticket spike: a weighted base and its spindle. Spiked tickets are dynamic (Tickets.tsx). */
export interface SpikeSpec extends Placed {
  readonly kind: 'spike'
}

export type PanSize = '1/1' | '1/2' | '1/3'

/** A hotel pan standing on `at`, its long side along x for 1/1, deep-drawn with a rolled rim. Pans never move (DESIGN.md). */
export interface PanSpec extends Placed {
  readonly kind: 'pan'
  readonly size: PanSize
  /** 0.065 or 0.1 [estimated: the 2½ and 4 inch pans]. */
  readonly depth: number
}

/** A stack of plates, warming on the heated lower shelf: `count` high. */
export interface PlateStackSpec extends Placed {
  readonly kind: 'plate-stack'
  readonly count: number
}

/**
 * A station of the line against the wall, its worktop `height` above the floor, `width` along x, `depth` toward +z: a flat-top
 * griddle, a burner station with grates, a fryer. Its glowing parts follow its `channel`, lit or dark as the set's mask says.
 */
export interface StationSpec extends Placed {
  readonly kind: 'griddle' | 'burners' | 'fryer'
  readonly width: number
  readonly depth: number
  readonly height: number
  readonly channel: number
}

/** The back wall of subway tile, `width` along x and `height` up, its face at `at` facing +z. */
export interface WallSpec extends Placed {
  readonly kind: 'tile-wall'
  readonly width: number
  readonly height: number
}

/** The floor, `width` by `depth` about `at`. */
export interface FloorSpec extends Placed {
  readonly kind: 'floor'
  readonly width: number
  readonly depth: number
}

/** The hood over the line: its back on the wall at `at` (its top), `width` along x, `depth` out from the wall, `height` tall. */
export interface HoodSpec extends Placed {
  readonly kind: 'hood'
  readonly width: number
  readonly depth: number
  readonly height: number
}

/** A speed rack on casters with `shelves` runners, and a hotel pan on each runner listed in `pans` (by shelf, from the bottom). */
export interface SpeedRackSpec extends Placed {
  readonly kind: 'speed-rack'
  readonly height: number
  readonly shelves: number
  readonly pans: readonly number[]
}

/** A stainless worktop: the bench a prop stands on alone. */
export interface WorktopSpec extends Placed {
  readonly kind: 'worktop'
  readonly width: number
  readonly depth: number
  readonly height: number
}

export type PropSpec =
  | PassSpec
  | HeatLampSpec
  | RailSpec
  | PrinterSpec
  | BellSpec
  | SpikeSpec
  | PanSpec
  | PlateStackSpec
  | StationSpec
  | WallSpec
  | FloorSpec
  | HoodSpec
  | SpeedRackSpec
  | WorktopSpec

/* ------------------------------------------------------------------------------------------------------------------ */
/* The sizes                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A hotel pan's footprint (x, z) in metres. */
export const PAN_SIZES: Readonly<Record<PanSize, readonly [number, number]>> = {
  '1/1': [0.53, 0.325],
  '1/2': [0.325, 0.265],
  '1/3': [0.325, 0.176],
}

/** A ticket off the printer: 80 mm wide [estimated: the common kitchen roll], 120 mm long. */
export const TICKET = { width: 0.08, height: 0.12, thickness: 0.0006 } as const

/** A dinner plate [estimated]. */
export const PLATE = { radius: 0.135, height: 0.024 } as const

/** The printer [estimated: a kitchen impact printer's housing]. */
export const PRINTER = { width: 0.16, height: 0.15, depth: 0.22 } as const

/** The service bell [estimated]. */
export const BELL = { radius: 0.045, height: 0.075 } as const

/** The ticket rail's channel and a clip on it [estimated]. */
export const RAIL = { height: 0.035, depth: 0.026, clip: 0.03 } as const

/** Where a pan's masking-tape label goes: on its front rim, centred, and how big the strip is. */
export interface TapeSlot {
  readonly center: Vec3
  readonly size: readonly [number, number]
  /** The strip's turn, radians about x, y and z: tilted back with the rim, a degree or two off true, as tape is stuck by hand. */
  readonly rotation: Vec3
}

/** The label slot of a pan standing at the origin: a strip of tape across its front rim's outer face. */
export function panTapeSlot(size: PanSize, depth: number, lean = -0.02): TapeSlot {
  const [w, d] = PAN_SIZES[size]
  return { center: [0, depth - 0.006, d / 2 + 0.0035], size: [Math.min(0.12, w * 0.42), 0.022], rotation: [-0.12, 0, lean] }
}
