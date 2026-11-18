/*
 * The flat time track's model (REDESIGN §2.8, "3D is a model of the same diagram"): what FlatTrack.tsx draws, as plain data with no three
 * in it, so a game's pure layout can fill it and a test can read it.
 *
 * Every length is in the 2D diagram's CSS pixels, and the world is that drawing laid flat on a base plate: x is the diagram's x (time, left
 * to right), z is the diagram's y (its rows, top to bottom, so the first row is the farthest), and y is up, out of the paper. `PX` pixels
 * make one world unit, so a camera that looks straight down on the plate with a view `height / PX` units high draws the diagram at its own
 * size, pixel for pixel.
 *
 *   plates    the base plate and the paper sheet on it, matte, square;
 *   boxes     slabs and chips, solid in a code colour, with the form that carries their state besides the colour; each stands on a soft
 *             contact shadow;
 *   wires     idle and empty: dashed wire outlines, never a solid;
 *   rules     the graticule engraved in the sheet, in `paper-rule`;
 *   inks      dimension lines, the axis and its ticks, in `edge`;
 *   cursors   the now cursor: a thin amber sheet, the one thing that glows;
 *   labels    every word and number, as DOM over the canvas (D-021).
 *
 * `morphModel` moves one model toward another by id, for a scene's one authored move: a mark in both slides (and rises or falls, where its height or its foot differs), a mark only in the first
 * shrinks to nothing at its left edge, and a mark only in the second grows from its own.
 */
import type { ColorRoleName } from '@/design/tokens'
import type { Vec3 } from './camera-rig'
import type { MarkForm } from './marks'

/** CSS pixels of the diagram per world unit. */
export const PX = 100

/** A box on the plate, in px: its footprint from x0 to x1 and z0 to z1, standing from y0 (default 0) to y0 + height. */
export interface FlatBox {
  readonly id: string
  readonly x0: number
  readonly x1: number
  readonly z0: number
  readonly z1: number
  readonly y0?: number
  readonly height: number
  readonly role: ColorRoleName
  readonly form: MarkForm
  /** What a pick on it means to the page: a request's id to admit, say. Without it the box takes no pick. */
  readonly pick?: string
  /** Stands on a contact shadow. Default true; a plate does not. */
  readonly shadow?: boolean
}

/** A straight line on or over the plate, in px. */
export interface FlatSegment {
  readonly x0: number
  readonly z0: number
  readonly x1: number
  readonly z1: number
  /** Its height over the plate, in px. Default just above the sheet. */
  readonly y?: number
  /** Its height at the end, in px, where it slopes (a thread from a request to its page). Default `y`. */
  readonly y1?: number
}

/** The now cursor: a sheet standing at x, across the rows from z0 to z1. */
export interface FlatCursor {
  readonly id: string
  readonly x: number
  readonly z0: number
  readonly z1: number
  readonly height: number
}

export type FlatLabelKind = 'row' | 'chip' | 'slab' | 'tick' | 'axis' | 'now' | 'dim' | 'band' | 'caption' | 'idle'

export interface FlatLabel {
  readonly id: string
  /** Its anchor, in px: x, height, z. */
  readonly at: Vec3
  readonly text: string
  readonly kind: FlatLabelKind
  readonly place?: 'center' | 'above' | 'below' | 'left' | 'right'
  /** Hidden in a canvas narrower than this, in px. */
  readonly minWidth?: number
}

export interface FlatModel {
  readonly plates: readonly FlatBox[]
  readonly boxes: readonly FlatBox[]
  readonly wires: readonly FlatBox[]
  readonly rules: readonly FlatSegment[]
  readonly inks: readonly FlatSegment[]
  readonly cursors: readonly FlatCursor[]
  readonly labels: readonly FlatLabel[]
  /** The drawing's extent on the plate, in px. */
  readonly bounds: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
}

export const EMPTY_MODEL: FlatModel = { plates: [], boxes: [], wires: [], rules: [], inks: [], cursors: [], labels: [], bounds: { x0: 0, x1: 1, z0: 0, z1: 1 } }

/** A point of the model in world units. */
export const toWorld = (x: number, y: number, z: number): Vec3 => [x / PX, y / PX, z / PX]

/** The authored move's length (REDESIGN §2.8, Motion: "640 ms for the one authored moment"). */
export const MORPH_MS = 640

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

function morphList<T extends { readonly id: string; readonly x0: number; readonly x1: number }>(a: readonly T[], b: readonly T[], t: number, blend: (p: T, q: T, t: number) => T): T[] {
  const after = new Map(b.map((item) => [item.id, item]))
  const before = new Set(a.map((item) => item.id))
  const out: T[] = []
  for (const p of a) {
    const q = after.get(p.id)
    // Gone at the end: it shrinks to nothing at its left edge.
    out.push(blend(p, q ?? { ...p, x1: p.x0 }, t))
  }
  for (const q of b) if (!before.has(q.id)) out.push(blend({ ...q, x1: q.x0 }, q, t))
  return out.filter((item) => item.x1 - item.x0 > 1e-3)
}

const blendBox = (p: FlatBox, q: FlatBox, t: number): FlatBox => ({
  ...q,
  x0: lerp(p.x0, q.x0, t),
  x1: lerp(p.x1, q.x1, t),
  z0: lerp(p.z0, q.z0, t),
  z1: lerp(p.z1, q.z1, t),
  y0: lerp(p.y0 ?? 0, q.y0 ?? 0, t),
  height: lerp(p.height, q.height, t),
})

/**
 * The model a share `t` of the way from `a` to `b` (0 is `a`, 1 is `b`), by id. Plates, rules and labels are the end's: the authored move
 * slides the marks over a still drawing, and its words are the ones it lands on.
 */
export function morphModel(a: FlatModel, b: FlatModel, t: number): FlatModel {
  if (t >= 1) return b
  const s = Math.max(0, t)
  const cursors = b.cursors.map((q, i) => {
    const p = a.cursors.find((candidate) => candidate.id === q.id) ?? a.cursors[i] ?? q
    return { ...q, x: lerp(p.x, q.x, s) }
  })
  return {
    ...b,
    boxes: morphList(a.boxes, b.boxes, s, blendBox),
    wires: morphList(a.wires, b.wires, s, blendBox),
    cursors,
    labels: b.labels.filter((label) => label.kind !== 'dim' && label.kind !== 'idle'),
  }
}
