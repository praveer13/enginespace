import { numel } from '@es/sim/tensor'
import type { ShiftOp } from '@es/sim/tensor'
import { ordersOf, shapesOf } from '@es/play/shape-shifter/engine'
import type { OpKind, ShiftAction } from '@es/play/shape-shifter/types'
import { sliceLabel } from '@es/play/shape-shifter/labels'
import type { GridView, LayoutView, ShiftView } from '@es/play/shape-shifter/view'
import type { ShiftPick } from './types'

/*
 * What the learner has in hand (GAMES.md §4.1, "Dock" and "Input"): the choices an operation offers on the tensor as it stands, and the
 * element a cell or a row selects with its place in the buffer.
 *
 *   view, reshape   a shape picker built from the element count's factors: every shape of at most three dimensions, none of size 1, but
 *                   the one the tensor has;
 *   permute         every order of the dimensions but the one it has;
 *   transpose       every pair of dimensions;
 *   expand          a new first dimension of 2 to 8 rows in front of the tensor's shape (the bands draw 2 to 8, GAMES.md §4.4);
 *   contiguous()    one choice: it applies at once.
 *
 * A choice is the operation itself, so the button that takes it dispatches it whole. Pure, so the picker's lists are tested without a page.
 */

/** Rows a new first dimension of `expand` may have: GAMES.md §4.4's band for `stride-zero`. */
export const EXPAND_ROWS = [2, 3, 4, 5, 6, 7, 8] as const

const same = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/** The operations an operation's button offers on a tensor of this shape, in the order the picker lists them. */
export function choicesOf(kind: OpKind, shape: readonly number[]): ShiftOp[] {
  switch (kind) {
    case 'view':
    case 'reshape':
      return shapesOf(numel(shape)).filter((s) => !same(s, shape)).map((s): ShiftOp => ({ op: kind, shape: s }))
    case 'permute':
      return shape.length < 2 ? [] : ordersOf(shape.length).map((order): ShiftOp => ({ op: 'permute', order }))
    case 'transpose': {
      const out: ShiftOp[] = []
      for (let a = 0; a < shape.length; a++) for (let b = a + 1; b < shape.length; b++) out.push({ op: 'transpose', a, b })
      return out
    }
    case 'expand':
      return shape.length >= 3 ? [] : EXPAND_ROWS.map((rows): ShiftOp => ({ op: 'expand', shape: [rows, ...shape] }))
    case 'contiguous':
      return [{ op: 'contiguous' }]
    case 'slice':
      return []
  }
}

/** Whether an operation's button takes a choice first (a picker), or applies at once. */
export const picks = (kind: OpKind): boolean => kind !== 'contiguous'

/** The element a selection holds, and the address it reads: the cell and the buffer mark each other (GAMES.md §4.1, "Input"). */
export function selectionOf(layout: LayoutView, flat: number | null): { readonly flat: number; readonly address: number; readonly element: number } | null {
  if (flat === null) return null
  const cell = layout.cells[flat]
  return cell === undefined ? null : { flat, address: cell.address, element: cell.element }
}

/** The first element, in logical order, that reads `address`: what a press on a buffer cell selects. Null for an address no element reads. */
export function flatAt(layout: LayoutView, address: number): number | null {
  const cell = layout.cells.find((candidate) => candidate.address === address)
  return cell === undefined ? null : cell.flat
}

/* The drawing's geometry (View2D.tsx) */

/** A cell's side, in px: at most 32, and at least 20 where the room allows it (GAMES.md §4.1); 14 is the floor on a narrow box. */
export const CELL_MAX = 32
const CELL_MIN = 20
export const CELL_FLOOR = 14
/** The gap between two grids of a rank-3 tensor, and the room over each for its tag. */
const SLICE_GAP = 12
const SLICE_TAG = 18
/** The cells' region stands at most this tall at a desk before its cells shrink (GAMES.md §4.1: "at most 300 tall"). */
export const CELLS_TALL = 300
/** On a phone the cells keep to this height, so the table, the cells and the buffer stand together over the pinned dock [estimated, from 390 x 844 and 360 x 800]. */
export const CELLS_TALL_PHONE = 128

export interface CellsLayout {
  readonly size: number
  readonly width: number
  readonly height: number
  /** The top left of each element's cell, in logical order. */
  readonly at: readonly { readonly x: number; readonly y: number }[]
  /** The tag of each grid of a rank-3 tensor, where it stands. */
  readonly tags: readonly { readonly label: string; readonly x: number; readonly y: number }[]
}

/**
 * Where each cell stands in a box `room` px wide (pure, so it is tested without a page). Rank 2 is rows by columns; rank 3 is one grid per
 * index of the first dimension; rank 1 is one row, wrapped where it does not fit, its order still left to right.
 */
export function cellsLayout(shape: readonly number[], room: number, high = CELLS_TALL): CellsLayout {
  const width = Math.max(room, 1)
  if (shape.length <= 1) {
    // One dimension: one row where it fits, else rows of equal length, so the wrap reads as one line folded and not as a second dimension.
    const n = shape[0] ?? 1
    const most = Math.max(1, Math.min(n, Math.floor(width / CELL_MIN)))
    const across = Math.ceil(n / Math.ceil(n / most))
    const size = Math.max(CELL_FLOOR, Math.min(CELL_MAX, Math.floor(width / across)))
    const at = Array.from({ length: n }, (_, i) => ({ x: (i % across) * size, y: Math.floor(i / across) * size }))
    return { size, width: across * size, height: Math.ceil(n / across) * size, at, tags: [] }
  }
  const slices = shape.length === 3 ? (shape[0] ?? 1) : 1
  const rows = shape.length === 3 ? (shape[1] ?? 1) : (shape[0] ?? 1)
  const cols = shape.length === 3 ? (shape[2] ?? 1) : (shape[1] ?? 1)
  const tag = slices > 1 || shape.length === 3 ? SLICE_TAG : 0
  const fit = (per: number) => Math.floor((width - (per - 1) * SLICE_GAP) / (per * cols))
  let per = slices
  while (per > 1 && fit(per) < CELL_MIN) per--
  const lines = Math.ceil(slices / per)
  let size = Math.max(CELL_FLOOR, Math.min(CELL_MAX, fit(per)))
  const tall = (s: number) => lines * (rows * s + tag) + (lines - 1) * SLICE_GAP
  if (tall(size) > high) size = Math.max(CELL_FLOOR, Math.min(size, Math.floor((high - lines * tag - (lines - 1) * SLICE_GAP) / (lines * rows))))
  const at: { x: number; y: number }[] = []
  const tags: { label: string; x: number; y: number }[] = []
  for (let s = 0; s < slices; s++) {
    const x0 = (s % per) * (cols * size + SLICE_GAP)
    const y0 = Math.floor(s / per) * (rows * size + tag + SLICE_GAP) + tag
    if (tag > 0) tags.push({ label: sliceLabel(s), x: x0, y: y0 - tag })
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) at.push({ x: x0 + c * size, y: y0 + r * size })
  }
  return { size, width: per * cols * size + (per - 1) * SLICE_GAP, height: tall(size), at, tags }
}

/** The program in hand: the one picked, else the first. */
export const programAt = (grid: GridView, pick: ShiftPick | null): number => (pick?.kind === 'program' && pick.at < grid.programs.length ? pick.at : 0)

/** The action a key of the game takes on this view, or null: `L` launches on `grid`. */
export function keyAction(command: string, view: ShiftView, done: boolean): ShiftAction | null {
  if (done) return null
  if (command === 'launch' && view.grid !== null) return { t: 'launch' }
  return null
}
