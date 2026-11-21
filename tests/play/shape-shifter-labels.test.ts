/*
 * W2b-T28: what the diagram writes on a thing, and what the view reads out of a state (GAMES.md §4.1, §4.5, §4.6): the table's lines, the cells
 * and the buffer, the stride order, the old buffer that stays one turn after a copy, the jump a refused `view` marks, the parts and the
 * named moments' lines. The words are display copy, so none is in a state; every figure on screen is the state's own.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CORE_SCHEMA, load } from 'js-yaml'
import { SHIFT_PARTS, momentLine, partsOf } from '@es/play/shape-shifter/copy'
import { opText, programLabel, shapeText, sharedLabel, sliceLabel, tableLine, tupleText } from '@es/play/shape-shifter/labels'
import { SHIFT_LEVEL_IDS } from '@es/play/shape-shifter/types'
import { COLS } from '@es/play/shape-shifter/view'
import { contiguousView } from '@es/sim/tensor'
import { op, practiceOf, S, stateAfter } from './shape-shifter-support'

const root = path.resolve(import.meta.dirname, '../..')

describe("the diagram's labels", () => {
  test('the table in one line is the phone\'s: shape, strides, offset and whether it is contiguous', () => {
    expect(tableLine({ offset: 0, shape: [6, 4], strides: [1, 6] })).toBe('shape (6, 4) · strides (1, 6) · offset 0 · contiguous no')
    expect(tableLine(contiguousView([4, 6]))).toBe('shape (4, 6) · strides (6, 1) · offset 0 · contiguous yes')
  })

  test('shapes, orders, slices, programs and shared cells', () => {
    expect([shapeText([4, 6]), tupleText([4, 8, 1]), sliceLabel(1), programLabel([0, 4]), sharedLabel(4)]).toEqual(['[4, 6]', '(4, 8, 1)', '[1]', '(0, 4)', '× 4'])
  })

  test('an operation reads as the learner wrote it', () => {
    expect([
      opText({ op: 'transpose', a: 0, b: 1 }),
      opText({ op: 'view', shape: [24] }),
      opText({ op: 'permute', order: [1, 0, 2] }),
      opText({ op: 'contiguous' }),
      opText({ op: 'expand', shape: [4, 6] }),
    ]).toEqual(['transpose(0, 1)', 'view([24])', 'permute((1, 0, 2))', 'contiguous()', 'expand([4, 6])'])
  })
})

describe('the view of a state: the keep-list run of `views`', () => {
  const level = practiceOf('views')

  test('transpose(0, 1): the buffer\'s numbers are unchanged, the table reads (1, 6), 0 moved, and the moment names the view', () => {
    const before = S.view(S.init(level))
    const after = S.view(stateAfter(level, op({ op: 'transpose', a: 0, b: 1 })))
    if (before.layout === null || after.layout === null) throw new Error('a layout view was expected')
    expect(after.layout.buffer).toEqual(before.layout.buffer)
    expect(after.layout.table.map((row) => row.stride)).toEqual([1, 6])
    expect([after.layout.readouts.moved, after.layout.readouts.copies]).toEqual([0, 0])
    expect(after.moments.map((m) => m.line)).toEqual(['The buffer did not move. `transpose` is a view: the strides went from (6, 1) to (1, 6).'])
    // The numbers move among the cells: cell (0, 1) of the transposed tensor holds the element that was at (1, 0).
    expect(after.layout.cells[1].element).toBe(before.layout.cells[6].element)
  })

  test('the stride order of a contiguous tensor is straight, and a transposed one reads down its columns in arcs', () => {
    const start = S.view(S.init(level)).layout
    const flipped = S.view(stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }))).layout
    if (start === null || flipped === null) throw new Error('layout')
    expect(start.order.every((step) => !step.arc)).toBe(true)
    expect(start.order).toHaveLength(23)
    expect(flipped.order.filter((step) => step.arc).length).toBeGreaterThan(0)
    // It still visits every element once, from the lowest address up.
    expect(new Set(flipped.order.flatMap((step) => [step.from, step.to])).size).toBe(24)
  })

  test('a copy keeps the old buffer for one turn, and the new buffer lays the elements in logical order', () => {
    const flipped = stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }))
    const copied = S.view(shiftNext(flipped, { op: 'reshape', shape: [24] })).layout
    if (copied === null) throw new Error('layout')
    expect(copied.old?.cells).toHaveLength(24)
    expect(copied.buffer.cells.map((cell) => cell.element)).toEqual(S.view(flipped).layout?.cells.map((cell) => cell.element))
    expect(copied.readouts).toMatchObject({ copies: 1, moved: 24, operations: 2 })
    expect(copied.target.met).toBe(true)
    // A view after a copy leaves the old buffer behind: it stays one turn only (on `three-d`, whose copy is not the last move).
    const three = stateAfter(practiceOf('three-d'), op({ op: 'reshape', shape: [4, 2, 4] }), op({ op: 'permute', order: [1, 0, 2] }))
    expect(S.view(three).layout?.old).toBeNull()
  })

  test('a refused view marks the jump in the stride order: the 4th element, where one stride can walk no further', () => {
    const flipped = stateAfter(level, op({ op: 'transpose', a: 0, b: 1 }))
    const refused = S.view(shiftNext(flipped, { op: 'view', shape: [24] })).layout
    expect(refused?.jump).toBe(4)
    expect(S.view(flipped).layout?.jump).toBeNull()
    // The turn after, the mark is gone.
    expect(S.view(shiftNext(shiftNext(flipped, { op: 'view', shape: [24] }), { op: 'transpose', a: 0, b: 1 })).layout?.jump).toBeNull()
  })

  test('the buffer is drawn from the lowest address the tensor reads to the highest, in rows of 16', () => {
    expect(COLS).toBe(16)
    const view = S.view(S.init(level)).layout
    expect([view?.buffer.first, view?.buffer.cells.length, view?.buffer.cells.every((cell) => cell.element !== null)]).toEqual([0, 24, true])
  })
})

describe('the other levels\' diagrams', () => {
  test('stride 0: the 4 rows read the same 6 addresses, each buffer cell is read 4 times, and the cells are dotted', () => {
    const view = S.view(stateAfter(practiceOf('stride-zero'), op({ op: 'expand', shape: [4, 6] }))).layout
    if (view === null) throw new Error('layout')
    expect(view.buffer.cells).toHaveLength(6)
    expect(view.buffer.cells.every((cell) => cell.reads === 4)).toBe(true)
    expect(view.cells.every((cell) => cell.shared)).toBe(true)
    expect(sharedLabel(view.buffer.cells[0].reads)).toBe('× 4')
    expect([view.readouts.moved, view.table.map((row) => row.stride)]).toEqual([0, [0, 1]])
  })

  test('wrong order: 24 of 32 cells hatched and "8 of 32 in place" on a reshape straight to [2, 4, 4]', () => {
    const state = stateAfter(practiceOf('three-d'), op({ op: 'reshape', shape: [2, 4, 4] }))
    const view = S.view(state)
    expect(view.layout?.cells.filter((cell) => cell.marked)).toHaveLength(24)
    expect([view.layout?.target.inPlace, view.layout?.target.of, view.layout?.slices]).toEqual([8, 32, 2])
    expect(view.moments.find((m) => m.id === 'wrong-order')?.line).toBe(
      'The shape matches the target and the order does not: 8 of 32 elements are in place. `reshape` keeps the buffer\'s order; `permute` changes which dimension moves fastest.',
    )
  })

  test('after the permute the stride order arcs between the two grids, and the target\'s contiguity stays unmet', () => {
    const state = stateAfter(practiceOf('three-d'), op({ op: 'reshape', shape: [4, 2, 4] }), op({ op: 'permute', order: [1, 0, 2] }))
    const view = S.view(state).layout
    expect(view?.order.some((step) => step.arc)).toBe(true)
    expect([view?.contiguous, view?.target.contiguous, view?.target.met]).toEqual([false, true, false])
    expect(view?.table.map((row) => row.stride)).toEqual([4, 8, 1])
  })

  test('grid: the programs of the grid as it is set, with their masked lanes, and the readouts of a graded level after the launch only', () => {
    const level = practiceOf('grid')
    const set = S.view(stateAfter(level, { t: 'block', dim: 0, value: 16 }, { t: 'block', dim: 1, value: 4 })).grid
    expect([set?.programCount, set?.programs.length, set?.programs.every((p) => p.masked === 16 && p.lanes === 64)]).toEqual([5, 5, true])
    expect(set?.readouts).toEqual({ programs: 5, lanes: 320, masked: 80, covered: 240, of: 240 })
    // A graded level hides them until a launch.
    const graded = S.level('grid', 1000)
    const fresh = S.view(S.init(graded)).grid
    expect([fresh?.readoutsShown, S.view(S.init(level)).grid?.readoutsShown]).toEqual([false, true])
    const ghost = S.view(S.ghost(graded)).grid
    expect(ghost?.readoutsShown).toBe(true)
    // More programs than the cap draws none.
    expect(S.view(S.init(level)).grid?.programs).toEqual([])
  })

  test('a refused launch is in the view for that turn, and a launch with a program per cdiv shows its tiles', () => {
    const refused = S.view(stateAfter(practiceOf('grid'), { t: 'block', dim: 0, value: 12 }, { t: 'launch' })).grid
    expect(refused?.refusal).toMatchObject({ kind: 'not-pow2', x: 12 })
  })
})

describe('the parts (GAMES.md §4.5)', () => {
  test('a level lists at most five, and the four view levels share the first four', () => {
    for (const id of SHIFT_LEVEL_IDS) expect([id, partsOf(id).length <= 5]).toEqual([id, true])
    expect(partsOf('views').map((p) => p.id)).toEqual(['table', 'buffer', 'order', 'target'])
    expect(partsOf('stride-zero').map((p) => p.id)).toEqual(['table', 'buffer', 'order', 'target', 'shared'])
    expect(partsOf('three-d').map((p) => p.id)).toEqual(['table', 'buffer', 'order', 'target', 'slices'])
    expect(partsOf('fewest').map((p) => p.id)).toEqual(['table', 'buffer', 'order', 'target', 'slices'])
    expect(partsOf('grid').map((p) => p.id)).toEqual(['tensor', 'program', 'block', 'grid-size', 'mask'])
  })

  test('each claim a part names is in content/claims, and a part with none is a model object', () => {
    const claims = load(readFileSync(path.join(root, 'content/claims/tr0.yaml'), 'utf8'), { schema: CORE_SCHEMA }) as { id: string }[]
    const modelObjects: string[] = []
    for (const part of SHIFT_PARTS) {
      if (part.claim === undefined) modelObjects.push(part.id)
      else expect([part.id, claims.some((c) => c.id === part.claim)]).toEqual([part.id, true])
    }
    expect(modelObjects).toEqual(['order', 'target', 'slices', 'tensor'])
  })

  test('the stride order is the course\'s own name, and says so; strides count elements and lanes are positions of a BLOCK', () => {
    expect(SHIFT_PARTS.find((p) => p.id === 'order')?.sentence).toContain("the course's name for it")
    expect(SHIFT_PARTS.find((p) => p.id === 'table')?.sentence).toContain('count elements, not bytes')
    expect(SHIFT_PARTS.find((p) => p.id === 'mask')?.sentence).toContain('one element position of a program\'s BLOCK')
  })
})

describe('the named moments (GAMES.md §4.6)', () => {
  const grid = practiceOf('grid')
  const views = practiceOf('views')
  const fewest = S.level('fewest', 1000)

  test('each line is the table\'s, with every figure the state\'s', () => {
    expect(momentLine({ id: 'copy', task: 0, turn: 1, op: 'reshape', n: 24 }, views)).toBe('`reshape` moved 24 elements into a new buffer, every one of them. The stride order now reads row by row.')
    expect(momentLine({ id: 'stride-zero', task: 0, turn: 0, rows: 4, m: 6 }, practiceOf('stride-zero'))).toBe('Stride 0: the 4 rows read the same 6 elements. Writing to one row would change them all.')
    expect(momentLine({ id: 'masked', task: 0, turn: 3, index: [0, 0], lanes: 64, masked: 16 }, grid)).toBe(
      'Program (0, 0) runs 64 lanes and 16 are masked: their offsets are past the edge, so the mask is false there.',
    )
    expect(momentLine({ id: 'uncovered', task: 0, turn: 3, n: 48, dim: 1, size: 20, block: 4, g: 5 }, grid)).toBe('48 elements are not covered: along dimension 1 the grid needs cdiv(20, 4) = 5 programs.')
    expect(momentLine({ id: 'not-pow2', task: 0, turn: 2, x: 12 }, grid)).toBe('BLOCK must be a power of two, because `tl.arange` takes one. 12 is not.')
    expect(momentLine({ id: 'too-many', task: 0, turn: 2, cap: 6, n: 240 }, grid)).toBe('At most 6 programs: this grid launches 240.')
  })

  test('a refused view says reshape would copy, except on fewest, which offers none: there the target has failed', () => {
    const refused = { id: 'view-refused', task: 0, turn: 1, shape: [24] } as const
    expect(momentLine(refused, views)).toBe('`view` cannot give [24] here: the stride order jumps where the new shape needs one stride. `reshape` would copy.')
    expect(momentLine(refused, fewest)).toBe('`view` cannot give [24] here: the stride order jumps where the new shape needs one stride. This target has failed.')
  })
})

/** The state after one more operation. */
function shiftNext(state: ReturnType<typeof stateAfter>, o: Parameters<typeof op>[0]) {
  return S.reduce(state, op(o))
}
