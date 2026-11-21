/**
 * What the 2D diagram and the DOM mirror both draw (GAMES.md §4.1): the state, read into the table, the cells, the buffer, the stride order,
 * the target and the readouts; on `grid`, the tensor, the programs and their lanes.
 *
 * Every figure comes from the sim's model, through the state that made it. The view does no rule of its own: it is a function of the state
 * alone, and it never changes it. The words are `copy.ts`'s and `labels.ts`'s, by level and by moment; none of them is in the state.
 */
import { addresses, gridCoverage, isContiguous, numel, programCells } from '@es/sim/tensor'
import type { GoalLine } from '../types'
import { copyOf, momentLine, partsOf } from './copy'
import type { ShiftPart, ShiftPredictCopy } from './copy'
import { inPlace, jumpOf, reaches } from './engine'
import type { GridLaunch, GridLevel, GridRun, LayoutLevel, LayoutRun, OpKind, ShiftLevelId, ShiftState } from './types'

/** Addresses in a row of the buffer (GAMES.md §4.1). */
export const COLS = 16

export interface CellView {
  /** The element's index along each dimension. */
  readonly index: readonly number[]
  /** The element's place in logical (row-major) order. */
  readonly flat: number
  /** The element's number: the address it had in the start's buffer. */
  readonly element: number
  /** The address this tensor reads it from. */
  readonly address: number
  /** The shape matches the target and the target puts another element here: hatched. */
  readonly marked: boolean
  /** Another element reads the same address: dotted. */
  readonly shared: boolean
}

export interface BufferCellView {
  readonly address: number
  /** The number held at the address, or null where the tensor does not read it (hollow). */
  readonly element: number | null
  /** How many elements of the tensor read this address: 2 or more where a stride is 0. */
  readonly reads: number
}

/** One step of the stride order, between two logical places: straight where they are neighbours, an arc over the cells otherwise. */
export interface StepView {
  readonly from: number
  readonly to: number
  readonly arc: boolean
}

export interface BufferView {
  /** The first address drawn: the lowest the tensor reads. */
  readonly first: number
  readonly cells: readonly BufferCellView[]
}

export interface LayoutView {
  readonly table: readonly { readonly dim: number; readonly size: number; readonly stride: number }[]
  readonly offset: number
  readonly contiguous: boolean
  readonly cells: readonly CellView[]
  /** Grids of cells: the first dimension's size at rank 3, otherwise 1. */
  readonly slices: number
  readonly buffer: BufferView
  /** The old buffer, which stays one turn after a copy. */
  readonly old: BufferView | null
  readonly order: readonly StepView[]
  readonly target: { readonly shape: readonly number[]; readonly contiguous: boolean; readonly elements: readonly number[]; readonly inPlace: number; readonly of: number; readonly met: boolean }
  /** The place in logical order where a refused `view` could not go on, for the turn after the refusal. */
  readonly jump: number | null
  readonly readouts: { readonly copies: number; readonly moved: number; readonly operations: number; readonly inPlace: number; readonly of: number }
  readonly status: LayoutRun['status']
  readonly why: LayoutRun['why']
}

export interface ProgramView {
  readonly index: readonly number[]
  readonly lanes: number
  readonly masked: number
  /** The cells inside the tensor that this program covers. */
  readonly cells: readonly (readonly number[])[]
}

export interface GridView {
  readonly shape: readonly number[]
  readonly cap: number
  readonly block: readonly number[]
  readonly grid: readonly number[]
  /** The programs of the grid as it is set, none when there are more than the cap. */
  readonly programs: readonly ProgramView[]
  readonly programCount: number
  readonly launch: GridLaunch | null
  /** The readouts are the grid as it is set. A graded level shows them after a launch only (GAMES.md §4.1). */
  readonly readouts: { readonly programs: number; readonly lanes: number; readonly masked: number; readonly covered: number; readonly of: number }
  readonly readoutsShown: boolean
  /** The last launch was refused, and why. */
  readonly refusal: GridRun['refusals'][number] | null
}

export interface MomentView {
  readonly id: string
  readonly task: number
  readonly turn: number
  readonly line: string
}

export interface ShiftView {
  readonly level: ShiftLevelId
  readonly graded: boolean
  readonly title: string
  readonly goal: GoalLine
  readonly prompt: string
  readonly predict: ShiftPredictCopy & { readonly answer: number; readonly guess: number | null }
  readonly parts: readonly ShiftPart[]
  readonly offered: readonly OpKind[]
  readonly task: { readonly at: number; readonly of: number }
  readonly done: boolean
  readonly moments: readonly MomentView[]
  readonly layout: LayoutView | null
  readonly grid: GridView | null
}

function bufferView(view: LayoutRun['view'], buffer: readonly number[]): BufferView {
  const read = new Map<number, number>()
  for (const a of addresses(view)) read.set(a, (read.get(a) ?? 0) + 1)
  const used = [...read.keys()]
  if (used.length === 0) return { first: 0, cells: [] }
  const first = Math.min(...used)
  const last = Math.max(...used)
  const cells: BufferCellView[] = []
  for (let address = first; address <= last; address++) {
    const reads = read.get(address) ?? 0
    cells.push({ address, element: reads > 0 ? (buffer[address] ?? -1) : null, reads })
  }
  return { first, cells }
}

function layoutView(level: LayoutLevel, at: number, run: LayoutRun, turn: number): LayoutView {
  const task = level.tasks[at]
  const v = run.view
  const addr = addresses(v)
  const sameShape = v.shape.length === task.goal.shape.length && v.shape.every((d, i) => d === task.goal.shape[i])
  const reads = new Map<number, number>()
  for (const a of addr) reads.set(a, (reads.get(a) ?? 0) + 1)
  const index = new Array<number>(v.shape.length).fill(0)
  const cells: CellView[] = addr.map((address, flat) => {
    const here = index.slice()
    for (let d = v.shape.length - 1; d >= 0; d--) {
      index[d] = (index[d] ?? 0) + 1
      if (index[d] === v.shape[d]) index[d] = 0
      else break
    }
    const element = run.buffer[address] ?? -1
    return { index: here, flat, element, address, marked: sameShape && element !== task.goal.elements[flat], shared: (reads.get(address) ?? 0) > 1 }
  })
  // The stride order: the elements by address, a shared address in logical order.
  const sorted = cells.slice().sort((a, b) => a.address - b.address || a.flat - b.flat)
  const order: StepView[] = []
  for (let i = 1; i < sorted.length; i++) order.push({ from: sorted[i - 1].flat, to: sorted[i].flat, arc: Math.abs(sorted[i].flat - sorted[i - 1].flat) !== 1 })
  const node = { view: v, buffer: run.buffer }
  const place = inPlace(node, task.goal)
  const refusal = run.refused.find((r) => r.turn === turn)
  return {
    table: v.shape.map((size, dim) => ({ dim, size, stride: v.strides[dim] ?? 0 })),
    offset: v.offset,
    contiguous: isContiguous(v),
    cells,
    slices: v.shape.length === 3 ? (v.shape[0] ?? 1) : 1,
    buffer: bufferView(v, run.buffer),
    old: run.old === null ? null : bufferView(run.old.view, run.old.buffer),
    order,
    target: { shape: task.goal.shape, contiguous: task.goal.contiguous, elements: task.goal.elements, inPlace: place.k, of: place.of, met: reaches(node, task.goal) },
    jump: refusal === undefined ? null : jumpOf(v),
    readouts: { copies: run.copies, moved: run.moved, operations: run.ops.length, inPlace: place.k, of: place.of },
    status: run.status,
    why: run.why,
  }
}

function gridView(level: GridLevel, at: number, run: GridRun, turn: number): GridView {
  const task = level.tasks[at]
  const g = gridCoverage(task.shape, run.block, run.grid)
  const cov = 'error' in g ? { programs: 0, lanes: 0, masked: 0, covered: 0 } : g
  const programs: ProgramView[] = []
  if (!('error' in g) && g.programs <= level.cap) {
    const lanes = run.block.reduce((p, b) => p * b, 1)
    for (let k = 0; k < g.programs; k++) {
      const index: number[] = []
      let rest = k
      for (let d = g.grid.length - 1; d >= 0; d--) {
        index[d] = rest % (g.grid[d] ?? 1)
        rest = Math.floor(rest / (g.grid[d] ?? 1))
      }
      const p = programCells(task.shape, run.block, index)
      if (!('error' in p)) programs.push({ index, lanes, masked: p.masked, cells: p.cells })
    }
  }
  return {
    shape: task.shape,
    cap: level.cap,
    block: run.block,
    grid: run.grid,
    programs,
    programCount: cov.programs,
    launch: run.launch,
    readouts: { programs: cov.programs, lanes: cov.lanes, masked: cov.masked, covered: cov.covered, of: numel(task.shape) },
    readoutsShown: !level.graded || run.launch !== null,
    refusal: run.refusals.find((r) => r.turn === turn) ?? null,
  }
}

/** The state as the diagram and the mirror draw it. */
export function shiftView(s: ShiftState): ShiftView {
  const { level } = s
  const words = copyOf(level)
  const run = s.runs[s.at]
  const turn = s.history.length - 1
  return {
    level: level.id,
    graded: level.graded,
    title: words.title,
    goal: words.goal,
    prompt: words.prompt,
    predict: { ...words.predict, answer: level.tasks[s.at].answer, guess: run.guess },
    parts: partsOf(level.id),
    offered: level.kind === 'layout' ? level.offered : [],
    task: { at: s.at, of: level.tasks.length },
    done: s.done,
    moments: s.moments.map((m) => ({ id: m.id, task: m.task, turn: m.turn, line: momentLine(m, level) })),
    layout: level.kind === 'layout' && run.kind === 'layout' ? layoutView(level, s.at, run, turn) : null,
    grid: level.kind === 'grid' && run.kind === 'grid' ? gridView(level, s.at, run, turn) : null,
  }
}
