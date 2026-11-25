/*
 * W2b-T80: every sentence of Tensor views that states a fact about the run is built from the state, and each is compared here with a second
 * implementation of the same fact on 200 random walks (DC-E): the readout's "in the target's order", the copies and the elements a copy moved,
 * the stride-zero moment (rows or slices), the wrong-order moment, the extra-copy line, and on `grid` the programs, lanes, masked lanes and the
 * first program with a masked lane. The second implementation shares nothing with `packages/sim/tensor` or the game's engine: it holds its
 * own strides, its own view rule and its own buffer, and reads each figure off them.
 *
 * Also here: the plural and the unit of the stride-zero line at 2 and 3 dimensions, the operations the goal line defines before anything
 * uses them, the cap of operations a `fewest` target allows being said and being the level's own, a practice `grid` goal line that holds no
 * count, the debrief of `grid` setting a sum beside a sum, and the BLOCK stepper's values.
 */
import { describe, expect, test } from 'bun:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { copyOf, EXTRA_COPY_LINE, fewestPracticeGoal, momentLine } from '@es/play/shape-shifter/copy'
import { buildLevel, FEWEST_ATTEMPT_CAP } from '@es/play/shape-shifter/levels'
import { shiftInit, shiftReduce, shiftSession } from '@es/play/shape-shifter/session'
import type { LayoutLevel, ShiftAction, ShiftState } from '@es/play/shape-shifter/types'
import type { ShiftOp } from '@es/sim/tensor'
import { Controls } from '@/games/shape-shifter/Controls'
import { choicesOf, nextBlock } from '@/games/shape-shifter/focus'
import { pressesAgain, SAME_SPOT, SAME_TIME } from '@/games/shape-shifter/hand'
import { ReadoutStrip } from '@/games/shape-shifter/ReadoutStrip'
import type { ShiftRun } from '@/games/shape-shifter/types'
import { practiceOf } from './shape-shifter-support'

/* ------------------------------------------------------------------------------------------------------------------ */
/* The second implementation                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

interface T {
  readonly shape: readonly number[]
  readonly strides: readonly number[]
  readonly offset: number
  readonly buffer: readonly number[]
}

const prod = (xs: readonly number[]): number => xs.reduce((p, x) => p * x, 1)

/** The addresses a tensor reads, in row-major order of its indices, by counting up an odometer. */
function reads(t: T): number[] {
  const out: number[] = []
  const at = t.shape.map(() => 0)
  for (let k = 0; k < prod(t.shape); k++) {
    out.push(t.offset + at.reduce((sum, i, d) => sum + i * t.strides[d], 0))
    for (let d = at.length - 1; d >= 0; d--) {
      if (++at[d] < t.shape[d]) break
      at[d] = 0
    }
  }
  return out
}

const logical = (t: T): number[] => reads(t).map((a) => t.buffer[a])

const rowMajor = (shape: readonly number[]): number[] => shape.map((_, d) => prod(shape.slice(d + 1)))

/** Contiguous: every dimension of size above 1 has the stride of a row-major tensor. */
const contiguous = (t: T): boolean => t.shape.every((n, d) => n === 1 || t.strides[d] === rowMajor(t.shape)[d])

/** PyTorch's rule for the strides of a view, written from its description: dimensions chain where an outer stride is the inner size times the inner stride. */
function viewStrides(shape: readonly number[], strides: readonly number[], to: readonly number[]): number[] | null {
  const out = new Array<number>(to.length)
  let d2 = to.length - 1
  let base = strides[shape.length - 1]
  let tensor = 1
  let view = 1
  for (let d = shape.length - 1; d >= 0; d--) {
    tensor *= shape[d]
    if (d === 0 || (shape[d - 1] !== 1 && strides[d - 1] !== tensor * base)) {
      while (d2 >= 0 && (view < tensor || to[d2] === 1)) {
        out[d2] = view * base
        view *= to[d2]
        d2--
      }
      if (view !== tensor) return null
      if (d > 0) {
        base = strides[d - 1]
        tensor = 1
        view = 1
      }
    }
  }
  return d2 === -1 ? out : null
}

/** A copy: the elements in row-major order of the tensor, in a buffer of their own. */
const copied = (t: T): T => ({ shape: t.shape, strides: rowMajor(t.shape), offset: 0, buffer: logical(t) })

interface Done {
  readonly t: T
  /** Elements a copy moved. */
  readonly moved: number
  /** The `view` was refused. */
  readonly refused: boolean
}

function apply(t: T, o: ShiftOp): Done {
  switch (o.op) {
    case 'transpose': {
      const swap = <X>(xs: readonly X[]): X[] => xs.map((_, i) => (i === o.a ? xs[o.b] : i === o.b ? xs[o.a] : xs[i]))
      return { t: { ...t, shape: swap(t.shape), strides: swap(t.strides) }, moved: 0, refused: false }
    }
    case 'permute':
      return { t: { ...t, shape: o.order.map((d) => t.shape[d]), strides: o.order.map((d) => t.strides[d]) }, moved: 0, refused: false }
    case 'expand':
      return { t: { ...t, shape: o.shape, strides: [...o.shape.slice(0, o.shape.length - t.shape.length).map(() => 0), ...t.strides] }, moved: 0, refused: false }
    case 'contiguous':
      return contiguous(t) ? { t, moved: 0, refused: false } : { t: copied(t), moved: prod(t.shape), refused: false }
    case 'view': {
      const strides = viewStrides(t.shape, t.strides, o.shape)
      return strides === null ? { t, moved: 0, refused: true } : { t: { ...t, shape: o.shape, strides }, moved: 0, refused: false }
    }
    case 'reshape': {
      const strides = viewStrides(t.shape, t.strides, o.shape)
      if (strides !== null) return { t: { ...t, shape: o.shape, strides }, moved: 0, refused: false }
      const c = copied(t)
      return { t: { ...c, shape: o.shape, strides: rowMajor(o.shape) }, moved: prod(t.shape), refused: false }
    }
    case 'slice':
      throw new Error('no level offers slice')
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Random walks                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A small seeded stream (mulberry32). */
function stream(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return (((t ^ (t >>> 14)) >>> 0) % 1_000_000) / 1_000_000
  }
}

/** The kinds of moment the walks reached, so that a walk that never felt a rule does not pass for one that checked it. */
const covered = new Set<string>()

const pick = <X>(next: () => number, xs: readonly X[]): X => xs[Math.floor(next() * xs.length)]

interface Seen {
  /** Each target's tensor after each operation made on it, and the moved count of each. */
  readonly nodes: T[][]
  readonly moved: number[][]
}

function walkLayout(level: LayoutLevel, next: () => number): void {
  let state: ShiftState = shiftInit(level)
  const mine: T[] = level.tasks.map((task) => ({ shape: task.start.shape, strides: task.start.strides, offset: task.start.offset, buffer: Array.from({ length: Math.max(...reads({ ...task.start, buffer: [] }), 0) + 1 }, (_, i) => i) }))
  const seen: Seen = { nodes: level.tasks.map(() => []), moved: level.tasks.map(() => []) }
  for (let step = 0; step < 14 && !state.done; step++) {
    const at = state.at
    const run = state.runs[at]
    if (run.kind !== 'layout') throw new Error('a layout level has layout runs')
    const shape = run.view.shape
    const kinds = level.offered.filter((k) => choicesOf(k, shape).length > 0)
    const chosen = pick(next, choicesOf(pick(next, kinds), shape))
    let after: ShiftState
    try {
      after = shiftReduce(state, { t: 'op', op: chosen })
    } catch {
      // The sim refuses a move that is not a legal one at all (a shape of other elements): nothing was played.
      continue
    }
    const done = apply(mine[at], chosen)
    // A refused `view` is not an operation of the tensor: the run counts the operations that were applied.
    if (!done.refused) {
      mine[at] = done.t
      seen.nodes[at].push(done.t)
      seen.moved[at].push(done.moved)
    }
    state = after
    check(level, state, mine, seen)
  }
}

function check(level: LayoutLevel, state: ShiftState, mine: readonly T[], seen: Seen): void {
  const view = shiftSession.view(state)
  const layout = view.layout
  if (layout === null) throw new Error('a layout level has a layout view')
  const t = mine[state.at]
  const task = level.tasks[state.at]
  const where = `${level.id}/${level.seed} target ${state.at} after ${state.history.length} actions`
  // The table, the cells and the buffer are the second implementation's.
  expect([where, layout.table.map((row) => row.size), layout.table.map((row) => row.stride), layout.offset]).toEqual([where, [...t.shape], [...t.strides], t.offset])
  expect([where, layout.cells.map((cell) => cell.element), layout.cells.map((cell) => cell.address)]).toEqual([where, logical(t), reads(t)])
  expect([where, layout.contiguous]).toEqual([where, contiguous(t)])
  // "In the target's order": the elements that read, in row-major order, where the target reads them, counted when the counts of elements agree.
  const mineInOrder = prod(t.shape) === task.goal.elements.length ? logical(t).filter((e, i) => e === task.goal.elements[i]).length : 0
  expect([where, layout.readouts.inPlace, layout.readouts.of]).toEqual([where, mineInOrder, task.goal.elements.length])
  // Copies and the elements they moved, over every operation made on this target.
  const moved = seen.moved[state.at]
  expect([where, layout.readouts.copies, layout.readouts.moved, layout.readouts.operations]).toEqual([where, moved.filter((m) => m > 0).length, moved.reduce((a, b) => a + b, 0), moved.length])

  // Each moment's line is the sentence its fact makes, for the figures the second implementation reads at the turn it names.
  for (const moment of view.moments) {
    covered.add(moment.id.replace(/-\d$/, '') + (moment.line.includes('slices') ? ':slices' : ''))
    const target = moment.task
    const run = state.runs[target]
    if (run.kind !== 'layout') throw new Error('layout')
    const index = run.placed.indexOf(moment.turn)
    const nodes = seen.nodes[target]
    const here = `${where}: ${moment.id}`
    if (moment.id.startsWith('extra-copy-')) {
      const copies = seen.moved[target].filter((m) => m > 0).length
      expect([here, copies > level.tasks[target].copies, moment.line]).toEqual([here, true, EXTRA_COPY_LINE])
      // It is made by the first copy beyond the reference's count, and no earlier one.
      let count = 0
      let turnOf = -1
      seen.moved[target].forEach((m, i) => {
        if (m > 0 && ++count === level.tasks[target].copies + 1) turnOf = i
      })
      expect([here, run.placed[turnOf]]).toEqual([here, moment.turn])
      continue
    }
    if (index < 0) continue
    const before = index === 0 ? level.tasks[target].start : nodes[index - 1]
    const after = nodes[index]
    if (moment.id === 'stride-zero') {
      const rows = after.shape.reduce((p, n, d) => (after.strides[d] === 0 ? p * n : p), 1)
      const unit = after.shape.length > 2 ? 'slices' : 'rows'
      expect([here, moment.line]).toEqual([here, `Stride 0: the ${rows} ${unit} read the same ${prod(before.shape)} elements. Writing to one ${unit === 'rows' ? 'row' : 'slice'} would change them all.`])
    } else if (moment.id === 'wrong-order') {
      const k = logical(after).filter((e, i) => e === level.tasks[target].goal.elements[i]).length
      expect([here, after.shape.join(), level.tasks[target].goal.shape.join()]).toEqual([here, level.tasks[target].goal.shape.join(), level.tasks[target].goal.shape.join()])
      expect([here, moment.line.startsWith(`The shape matches the target and the order does not: ${k} of ${level.tasks[target].goal.elements.length} elements are in the target's order. `)]).toEqual([here, true])
    } else if (moment.id === 'copy') {
      expect([here, moment.line.includes(` moved ${seen.moved[target][index]} elements into a new buffer`)]).toEqual([here, true])
    } else if (moment.id === 'view-free') {
      expect([here, moment.line.endsWith(`the strides went from (${before.strides.join(', ')}) to (${after.strides.join(', ')}).`), seen.moved[target][index]]).toEqual([here, true, 0])
    }
  }
  // And the other way: a copy beyond the reference's, on any target, has its line.
  level.tasks.forEach((task, target) => {
    const copies = seen.moved[target].filter((m) => m > 0).length
    expect([where, target, copies > task.copies, view.moments.some((m) => m.id === `extra-copy-${target}`)]).toEqual([where, target, copies > task.copies, copies > task.copies])
  })
}

describe('every sentence that states a fact about a run, against a second implementation, on 200 random walks (DC-E)', () => {
  const layouts: readonly (readonly [string, number])[] = [
    ...Array.from({ length: 40 }, (_, i): [string, number] => ['views', 30 + i]),
    ...Array.from({ length: 30 }, (_, i): [string, number] => ['stride-zero', 10 + i]),
    ...Array.from({ length: 40 }, (_, i): [string, number] => ['three-d', 26 + i]),
    ...Array.from({ length: 40 }, (_, i): [string, number] => ['fewest', 1000 + i]),
  ]

  test('the readout, the cells, the table and the moments of 150 walks of the four view levels', () => {
    let walks = 0
    layouts.forEach(([id, seed], at) => {
      let level
      try {
        level = buildLevel(id, seed)
      } catch {
        return
      }
      if (level.kind !== 'layout') return
      walkLayout(level, stream(at * 7919 + seed))
      walks++
    })
    expect(walks).toBeGreaterThanOrEqual(140)
    for (const kind of ['view-free', 'view-refused', 'copy', 'stride-zero', 'stride-zero:slices', 'wrong-order', 'extra-copy']) expect([kind, covered.has(kind)]).toEqual([kind, true])
  })

  test('the figures of `grid`: programs, lanes, masked lanes, what is covered, and the first program with a masked lane, from the sizes alone', () => {
    let walks = 0
    for (let at = 0; at < 50; at++) {
      const level = buildLevel('grid', at % 2 === 0 ? 0 : 1000 + at)
      if (level.kind !== 'grid') throw new Error('grid')
      const next = stream(at * 104_729 + 3)
      let state = shiftInit(level)
      for (let step = 0; step < 10 && !state.done; step++) {
        const task = level.tasks[state.at]
        const dim = Math.floor(next() * task.shape.length)
        const action: ShiftAction = next() < 0.25 ? { t: 'launch' } : next() < 0.5 ? { t: 'grid', dim, value: 1 + Math.floor(next() * 6) } : { t: 'block', dim, value: pick(next, [1, 2, 4, 8, 16, 32]) }
        try {
          state = shiftReduce(state, action)
        } catch {
          continue
        }
        const view = shiftSession.view(state)
        const run = state.runs[Math.min(state.at, state.runs.length - 1)]
        if (run.kind !== 'grid' || view.grid === null) throw new Error('grid')
        const shape = level.tasks[view.task.at].shape
        const where = `grid/${level.seed} after ${state.history.length} actions`
        const programs = prod(run.grid)
        const lanes = programs * prod(run.block)
        const covered = prod(shape.map((n, d) => Math.min(n, run.grid[d] * run.block[d])))
        expect([where, view.grid.readouts.programs, view.grid.readouts.lanes, view.grid.readouts.covered, view.grid.readouts.of]).toEqual([where, programs, lanes, covered, prod(shape)])
        expect([where, view.grid.readouts.masked]).toEqual([where, lanes - covered])
        // The first program, in index order, with a masked lane, and its masked lanes, counted tile by tile.
        const moment = state.moments.find((m) => m.id === 'masked' && m.task === view.task.at)
        if (moment !== undefined && moment.id === 'masked') {
          let first: { index: number[]; masked: number } | null = null
          const total = prod(run.grid)
          for (let k = 0; k < total && first === null; k++) {
            const index: number[] = []
            let rest = k
            for (let d = run.grid.length - 1; d >= 0; d--) {
              index[d] = rest % run.grid[d]
              rest = Math.floor(rest / run.grid[d])
            }
            const inside = prod(shape.map((n, d) => Math.max(0, Math.min(run.block[d], n - index[d] * run.block[d]))))
            if (inside < prod(run.block)) first = { index, masked: prod(run.block) - inside }
          }
          expect([where, first === null, first?.masked, moment.lanes]).toEqual([where, false, moment.masked, prod(run.block)])
        }
      }
      walks++
    }
    expect(walks).toBe(50)
  })
})

describe('the words a run is told', () => {
  test('a stride-zero line says rows at two dimensions and slices at three, and no sentence of it is a count without its unit', () => {
    const level = practiceOf('stride-zero')
    expect(momentLine({ id: 'stride-zero', task: 0, turn: 0, rows: 2, m: 6, rank: 2 }, level)).toContain('the 2 rows read')
    expect(momentLine({ id: 'stride-zero', task: 0, turn: 0, rows: 2, m: 6, rank: 3 }, level)).toContain('the 2 slices read')
    expect(momentLine({ id: 'stride-zero', task: 0, turn: 0, rows: 2, m: 6, rank: 3 }, level)).not.toContain('row')
  })

  test('each operation a goal line names is said to do something in the same sentence, and the cap of a `fewest` target is the level\'s own', () => {
    for (const id of ['views', 'stride-zero', 'three-d', 'fewest'] as const) {
      const level = id === 'fewest' ? buildLevel('fewest', 1000) : practiceOf(id)
      if (level.kind !== 'layout') throw new Error('layout')
      const { controls } = copyOf(level).goal
      for (const kind of level.offered) {
        const name = kind === 'contiguous' ? '`contiguous()`' : `\`${kind}\``
        // The name is followed at once by a verb: what it does, not a list of names.
        expect([id, kind, new RegExp(`${name.replace(/[()]/g, '\\$&')} (swaps|reads|does|reorders|repeats|copies|keeps)`).test(controls)]).toEqual([id, kind, true])
      }
    }
    const fewest = buildLevel('fewest', 1000)
    if (fewest.kind !== 'layout') throw new Error('layout')
    expect(fewest.attemptCap).toBe(FEWEST_ATTEMPT_CAP)
    expect(copyOf(fewest).goal.controls).toContain(`the ${fewest.attemptCap}th operation`)
    expect(fewestPracticeGoal(fewest.offered, fewest.needed).controls).toContain(`the ${fewest.attemptCap}th operation`)
    expect(fewestPracticeGoal(fewest.offered, fewest.needed, 9).controls).toContain('the 9th operation')
  })

  test('the cap is true: a target that has not reached the layout fails at its 12th operation, and not before', () => {
    // Swapping the first two dimensions back and forth reaches no target of `fewest` but the ones that are one swap away, and it never copies.
    const level = [1000, 1001, 1002, 1003, 1004, 1005].map((seed) => buildLevel('fewest', seed)).find((candidate) => {
      if (candidate.kind !== 'layout') return false
      let state = shiftInit(candidate)
      const cap = candidate.attemptCap ?? 0
      for (let i = 0; i < cap; i++) {
        const run = state.runs[0]
        if (run.kind !== 'layout' || state.at !== 0 || run.view.shape.length < 2) return false
        state = shiftReduce(state, { t: 'op', op: { op: 'transpose', a: 0, b: 1 } })
      }
      return true
    })
    if (level === undefined || level.kind !== 'layout' || level.attemptCap === null) throw new Error('a fewest seed whose first target is not one swap away was expected')
    const cap = level.attemptCap
    let state = shiftInit(level)
    for (let i = 1; i <= cap; i++) {
      state = shiftReduce(state, { t: 'op', op: { op: 'transpose', a: 0, b: 1 } })
      const run = state.runs[0]
      if (run.kind !== 'layout') throw new Error('layout')
      expect([i, run.turns, run.status]).toEqual([i, i, i < cap ? 'open' : 'failed'])
      if (i === cap) expect(run.why).toBe('attempts')
    }
  })

  test('a practice `grid` goal line holds no count of masked lanes, and names no tensor of another level', () => {
    const level = practiceOf('grid')
    if (level.kind !== 'grid') throw new Error('grid')
    const { beat } = copyOf(level).goal
    expect(beat).toBe("Match the reference's masked lanes, the fewest any launch can leave; its count shows when you launch.")
    expect(/\d/.test(beat)).toBe(false)
    expect(beat.includes(String(level.tasks[0].least))).toBe(false)
  })

  test('the lane and the offset each keep one meaning: a lane is placed by its position, and the offset is the table\'s address of the first element', () => {
    const words = [copyOf(practiceOf('grid')).prompt, momentLine({ id: 'masked', task: 0, turn: 0, index: [0, 0], lanes: 64, masked: 16 }, practiceOf('grid'))].join(' ')
    expect(/offset/i.test(words)).toBe(false)
  })
})

describe('the BLOCK stepper counts through the values a launch takes', () => {
  test('powers of two, up and down, stopping at the ends', () => {
    expect([1, 2, 4, 8, 16].map((v) => nextBlock(v, 'more', 1, 32))).toEqual([2, 4, 8, 16, 32])
    expect([32, 16, 8, 4, 2].map((v) => nextBlock(v, 'less', 1, 32))).toEqual([16, 8, 4, 2, 1])
    expect([nextBlock(32, 'more', 1, 32), nextBlock(1, 'less', 1, 32)]).toEqual([32, 1])
    // From a value that is not a power of two (a lesson's saved state, a typed one) it goes to the next one that is.
    expect([nextBlock(5, 'more', 1, 32), nextBlock(5, 'less', 1, 32), nextBlock(3, 'less', 1, 32)]).toEqual([8, 4, 2])
  })

  test('no press of it makes a launch that is refused for BLOCK', () => {
    const level = practiceOf('grid')
    let state = shiftInit(level)
    let value = 1
    for (let press = 0; press < 5; press++) {
      value = nextBlock(value, 'more', 1, 32)
      state = shiftReduce(state, { t: 'block', dim: 0, value })
    }
    state = shiftReduce(shiftReduce(state, { t: 'block', dim: 1, value: nextBlock(1, 'more', 1, 32) }), { t: 'launch' })
    const run = state.runs[0]
    expect(run.kind === 'grid' ? run.refusals.filter((r) => r.kind === 'not-pow2') : null).toEqual([])
  })
})

/** A run as the dock reads it, over a state. */
function runOf(state: ShiftState): ShiftRun {
  return {
    game: 'shape-shifter',
    level: state.level.id,
    mode: 'practice',
    seed: state.level.seed,
    view: shiftSession.view(state),
    score: shiftSession.score(state),
    ask: shiftSession.ask(state),
    done: state.done,
    turns: state.history.length,
    canUndo: false,
    dispatch: () => undefined,
    undo: () => undefined,
    announce: () => undefined,
    setAutoplay: () => undefined,
    mirrorId: 'mirror',
    restart: () => undefined,
    ledger: false,
    intro: { askShown: true, ring: null },
    guessSkipped: true,
    skipGuess: () => undefined,
  }
}

describe('the controls offer what does something', () => {
  const dock = (state: ShiftState): string => renderToStaticMarkup(h(Controls, { run: runOf(state), mode: 'practice' }))

  const contiguousButton = (markup: string): string => markup.match(/<button[^>]*data-op="contiguous"[^>]*>/)?.[0] ?? ''

  test('`contiguous()` cannot be pressed on a tensor that is contiguous, and says why; it is pressed on one that is not; the bar keeps its four buttons', () => {
    const level = practiceOf('views')
    const start = shiftReduce(shiftInit(level), { t: 'commit', prediction: 24 })
    expect(contiguousButton(dock(start))).toContain('disabled')
    expect(contiguousButton(dock(start))).toContain('nothing to copy')
    expect(contiguousButton(dock(start))).toContain('tabindex="-1"')
    const flipped = shiftReduce(start, { t: 'op', op: { op: 'transpose', a: 0, b: 1 } })
    expect(contiguousButton(dock(flipped))).not.toContain('disabled')
    for (const state of [start, flipped]) expect(dock(state).match(/data-op="/g)?.length).toBe(4)
  })

  test('the operation bar is still one tab stop after `contiguous()` has left it, and the readout says what it counts', () => {
    const level = practiceOf('views')
    const markup = dock(shiftReduce(shiftInit(level), { t: 'commit', prediction: 24 }))
    expect(markup.match(/tabindex="0"/g)?.length).toBe(1)
    const strip = renderToStaticMarkup(h(ReadoutStrip, { view: shiftSession.view(shiftInit(level)) }))
    expect(strip).toContain('in order<span class="sr-only"> with the target</span>')
    expect(strip).not.toContain('in place')
  })

  test('the BLOCK steppers say the grid follows them, where the old line said BLOCK must be a power of two beside a valid one', () => {
    const markup = dock(shiftReduce(shiftInit(practiceOf('grid')), { t: 'commit', prediction: 80 }))
    expect(markup).not.toContain('BLOCK must be a power of two')
    expect(markup).toContain('Setting BLOCK sets the grid to cover the tensor; change the grid after.')
  })
})

describe('a second press of a double click', () => {
  const first = { x: 300, y: 500, t: 1000, control: 'BUTTON|choice|[24]' }

  test('at the same spot, moments later, on what came up there or on nothing, does not take focus; on the control just pressed, or far or late, it does', () => {
    expect(pressesAgain(first, { x: 301, y: 502, t: 1200, control: '' })).toBe(true)
    expect(pressesAgain(first, { x: 301, y: 502, t: 1200, control: 'BUTTON||Next level: A grid of programs' })).toBe(true)
    expect(pressesAgain(first, { x: 301, y: 502, t: 1200, control: first.control })).toBe(false)
    expect(pressesAgain(first, { x: 300 + SAME_SPOT + 1, y: 500, t: 1200, control: '' })).toBe(false)
    expect(pressesAgain(first, { x: 300, y: 500, t: 1001 + SAME_TIME, control: '' })).toBe(false)
    expect(pressesAgain(null, { x: 300, y: 500, t: 1200, control: '' })).toBe(false)
  })
})
