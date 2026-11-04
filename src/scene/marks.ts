/*
 * Instanced marks (ARCHITECTURE §6.4; GAMES.md §2.3, "Shared objects"): every slab, cell, comb tooth and gap a scene draws
 * is an axis-aligned box with a colour role and a form. The form is the shape that carries a state besides its colour
 * (WCAG 1.4.1): a live cell is solid, an empty slot an open groove, a ghost token hollow, a padded token marked.
 *
 * This file turns positioned data from a game's layout.ts into boxes and boxes into instance matrices, with no three in it.
 * SpanInstances and BlockGrid draw what it computes, one instanced mesh each.
 */
import type { ColorRoleName } from '@/design/tokens'
import type { Vec3 } from './camera-rig'
import { trackZ, type TrackScale } from './time-axis'

export type MarkForm = 'solid' | 'hollow' | 'groove' | 'marked'
/** The forms in the order the mark shader numbers them. */
export const MARK_FORMS: readonly MarkForm[] = ['solid', 'hollow', 'groove', 'marked']
export const formIndex = (form: MarkForm): number => MARK_FORMS.indexOf(form)

/** One mark: a box, its colour role and its form. */
export interface MarkBox {
  readonly id: string
  readonly center: Vec3
  readonly size: Vec3
  readonly role: ColorRoleName
  readonly form: MarkForm
}

/** A span of time on one lane: a step, a CPU phase, a kernel, a transfer (`SpanInstances`). */
export interface SpanDatum {
  readonly id: string
  /** The lane's centre across the scene (x), in scene units. */
  readonly lane: number
  /** When it starts and ends, on the model's clock. */
  readonly start: number
  readonly end: number
  /** Across the lane, in scene units. */
  readonly width: number
  /** Its height above its base, in scene units. */
  readonly height: number
  /** Its base above the lane, in scene units. Default 0. */
  readonly base?: number
  readonly role: ColorRoleName
  readonly form?: MarkForm
}

/** One cell: a token, a slot-step, a page, a tensor element (`BlockGrid`). Positioned by its footprint's centre and its base. */
export interface CellDatum {
  readonly id: string
  readonly x: number
  readonly z: number
  /** Its base, in scene units. Default 0. */
  readonly y?: number
  readonly width: number
  readonly depth: number
  readonly height: number
  readonly role: ColorRoleName
  readonly form: MarkForm
}

/** A span this short still shows as a sliver, so a 0-length span never vanishes into the lane. */
export const MIN_SPAN_DEPTH = 0.004

export function spanBox(span: SpanDatum, scale: TrackScale): MarkBox {
  const z0 = trackZ(span.start, scale)
  const z1 = trackZ(span.end, scale)
  const depth = Math.max(Math.abs(z1 - z0), MIN_SPAN_DEPTH)
  const base = span.base ?? 0
  return {
    id: span.id,
    center: [span.lane, base + span.height / 2, (z0 + z1) / 2],
    size: [span.width, span.height, depth],
    role: span.role,
    form: span.form ?? 'solid',
  }
}

export function cellBox(cell: CellDatum): MarkBox {
  const base = cell.y ?? 0
  return {
    id: cell.id,
    center: [cell.x, base + cell.height / 2, cell.z],
    size: [cell.width, cell.height, cell.depth],
    role: cell.role,
    form: cell.form,
  }
}

/**
 * Each box as a column-major 4×4 matrix, scale then translation: no rotation, so up stays up and the instance's own axes
 * are the world's. Written into `out` (16 floats per box) from offset 0.
 */
export function writeMatrices(boxes: readonly MarkBox[], out: Float32Array = new Float32Array(boxes.length * 16)): Float32Array {
  if (out.length < boxes.length * 16) throw new RangeError(`${boxes.length} boxes need ${boxes.length * 16} floats, got ${out.length}`)
  for (let i = 0; i < boxes.length; i++) writeMatrix(boxes[i], out, i * 16)
  return out
}

/**
 * One box's matrix at `offset`, cut off at `clipZ`: the part of a mark later than the track's present is not drawn yet.
 * While the clock advances, the present sweeps forward and a new slab extrudes out of the pass, its far face (its start)
 * fixed and its near face on the present. A box wholly past the cut collapses to nothing.
 */
export function writeMatrix(box: MarkBox, out: Float32Array, offset: number, clipZ = Number.POSITIVE_INFINITY): void {
  const [sx, sy, sz] = box.size
  const [cx, cy, cz] = box.center
  const far = cz - sz / 2
  const near = Math.min(cz + sz / 2, clipZ)
  const shown = near - far
  out.fill(0, offset, offset + 16)
  if (!(shown > 0)) return // a zero matrix draws nothing
  out[offset] = sx
  out[offset + 5] = sy
  out[offset + 10] = shown
  out[offset + 12] = cx
  out[offset + 13] = cy
  out[offset + 14] = far + shown / 2
  out[offset + 15] = 1
}

/** Room for this many instances, in powers of two from 16, so a growing list does not rebuild its mesh on every step. */
export function capacityFor(count: number): number {
  let capacity = 16
  while (capacity < count) capacity *= 2
  return capacity
}

/** Cells in rows of `columns` from `origin`, `pitch` apart: a rack, a tray, a grid of pages. Row by row along -z. */
export function gridPositions(count: number, columns: number, origin: Vec3, pitch: { x: number; z: number }): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < count; i++) {
    const column = i % columns
    const row = Math.floor(i / columns)
    out.push([origin[0] + column * pitch.x, origin[1], origin[2] - row * pitch.z])
  }
  return out
}
