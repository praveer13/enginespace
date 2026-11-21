/*
 * The worked numbers of TR0's lessons, computed from the course's tensor model (`packages/sim/tensor`) and Tensor views' levels, so that a
 * number a lesson prints is one this file recomputes. `tests/content/tr0-module.test.ts` holds each lesson's text to these functions, and
 * when the model or a level's practice seed moves a number, the test names the lesson and the figure that went stale.
 *
 * Every tensor here is synthetic: the model follows PyTorch's view rules for the strides alone, and tests/sim/tensor-torch.test.ts holds it
 * to what torch answered. A lesson tags a number of a level's run [synthetic] and gives the day and the commit it was printed at.
 */
import { addresses, applyOp, cdiv, contiguousView, gridCoverage, isContiguous } from '../../packages/sim/tensor'
import type { ShiftOp, TView } from '../../packages/sim/tensor'
import { ruleById } from '../../packages/play/items/families/tr0/sync-rules'
import { SHAPE_SHIFTER } from '../../packages/play/shape-shifter/entry'
import { opText } from '../../packages/play/shape-shifter/labels'
import { gridTask, PROGRAM_CAP } from '../../packages/play/shape-shifter/draw'
import { buildLevel, GRID_PRACTICE_SEED } from '../../packages/play/shape-shifter/levels'
import type { GridLevel, LayoutLevel, ShiftLevelId } from '../../packages/play/shape-shifter/types'
import type { ModelTable } from './module-kit'

/** A level of Tensor views on its pinned practice seed, which is the run a lesson's practice block plays. */
export function practiceLevel(id: Exclude<ShiftLevelId, 'grid'>): LayoutLevel {
  const seed = SHAPE_SHIFTER.levels.find((level) => level.id === id)?.practiceSeed
  if (seed === undefined) throw new Error(`Tensor views has no practice seed for ${id}`)
  const level = buildLevel(id, seed)
  if (level.kind !== 'layout') throw new Error(`${id} is not a layout level`)
  return level
}

/** `grid` on its pinned practice seed: the one tensor, [12, 20], that lesson 4's practice block plays. */
export function practiceGrid(): GridLevel {
  const seed = SHAPE_SHIFTER.levels.find((level) => level.id === 'grid')?.practiceSeed
  if (seed !== GRID_PRACTICE_SEED) throw new Error('the practice seed of `grid` is not the one that plays its pinned tensor')
  const level = buildLevel('grid', seed)
  if (level.kind !== 'grid') throw new Error('grid is not a grid level')
  return level
}

/** A tuple as Python prints it: `(4, 6)`, and `(24,)` for one element. */
export const pyTuple = (xs: readonly number[]): string => (xs.length === 1 ? `(${xs[0]},)` : `(${xs.join(', ')})`)

const code = (text: string): string => `\`${text}\``

/** One step of a chain: the tensor after it, and the elements it moved. */
export interface Step {
  readonly op: ShiftOp | null
  readonly view: TView
  readonly moved: number
}

/** The tensors along a chain of operations from a start, the start first. Throws on an operation the model refuses. */
export function chain(start: TView, ops: readonly ShiftOp[]): Step[] {
  const steps: Step[] = [{ op: null, view: start, moved: 0 }]
  for (const op of ops) {
    const out = applyOp(steps[steps.length - 1].view, op)
    if ('error' in out) throw new Error(`the model refuses ${opText(op)}: ${out.error}`)
    steps.push({ op, view: out.view, moved: out.copied })
  }
  return steps
}

/** The reference's run on `views` at its practice seed: the start, `transpose(0, 1)` and `reshape([24])`. */
export const viewsRun = (): Step[] => {
  const task = practiceLevel('views').tasks[0]
  return chain(task.start, task.ghost)
}

/** The run on `stride-zero` at its practice seed: `expand`, then `contiguous()`. */
export const strideZeroRun = (): Step[] => {
  const task = practiceLevel('stride-zero').tasks[0]
  return chain(task.start, task.ghost)
}

/** The reference's run on `three-d` at its practice seed: `reshape` into heads, `permute` to bring the heads first, then `contiguous()`. */
export const threeDRun = (): Step[] => {
  const task = practiceLevel('three-d').tasks[0]
  return chain(task.start, task.ghost)
}

/** The query's path through Qwen3's attention at the pinned code: the projection's `(1, 6, 2048)` output, `view` into heads, `transpose(1, 2)`. */
export const QUERY_TOKENS = 6
export const queryRun = (): Step[] =>
  chain(contiguousView([1, QUERY_TOKENS, 2048]), [{ op: 'view', shape: [1, QUERY_TOKENS, 16, 128] }, { op: 'transpose', a: 1, b: 2 }])

/** The addresses that the transposed tensor of `views` reads first, in the order of its indices. */
export const transposedWalk = (count: number): number[] => addresses(viewsRun()[1].view).slice(0, count)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The predictions                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface NumericPrediction {
  readonly kind: 'numeric'
  readonly unit: string
  readonly reference: () => number
}

/** The figure each prediction's answer is, from the numbers of its prompt alone and the tensor model. */
export const PREDICTIONS: Readonly<Record<string, NumericPrediction>> = {
  // A (4, 6) tensor, transposed, then read as one row: the reshape cannot be a view, and its copy moves every element.
  'tr0.l1.p1': {
    kind: 'numeric',
    unit: 'elements',
    reference: () => {
      const steps = chain(contiguousView([4, 6]), [{ op: 'transpose', a: 0, b: 1 }, { op: 'reshape', shape: [24] }])
      return steps.reduce((sum, step) => sum + step.moved, 0)
    },
  },
  // x[:, ::2] on a contiguous (3, 5) tensor: the step multiplies the columns' stride.
  'tr0.l1.p2': {
    kind: 'numeric',
    unit: 'elements',
    reference: () => chain(contiguousView([3, 5]), [{ op: 'slice', dim: 1, start: 0, stop: 5, step: 2 }])[1].view.strides[1],
  },
  // A (4, 8) projection output, reshaped into heads of four and permuted so that the heads come first: the tokens' stride is the projection row's width.
  'tr0.l2.p1': {
    kind: 'numeric',
    unit: 'addresses',
    reference: () => {
      const steps = chain(contiguousView([4, 8]), [{ op: 'reshape', shape: [4, 2, 4] }, { op: 'permute', order: [1, 0, 2] }])
      return steps[steps.length - 1].view.strides[1]
    },
  },
  // Of four lines on a GPU tensor, the ones that wait: `.item()`, `.tolist()` and `.cpu()` do, and `.sum()` only enqueues (the rule table of tr0.find-the-sync).
  'tr0.l2.p2': {
    kind: 'numeric',
    unit: 'lines',
    // The second line's `.sum()` enqueues and its `.item()` waits, so each line is its last call's rule.
    reference: () => ['sum', 'item', 'tolist', 'cpu'].filter((id) => ruleById(id).waits).length,
  },
  // The query projection of layer 0: heads times head size, from the configuration's claims.
  'tr0.l3.p1': {
    kind: 'numeric',
    unit: 'rows',
    reference: () => 16 * 128,
  },
  // A (12, 20) tensor covered exactly once in at most six programs: the least masked count of any power-of-two BLOCK within the cap.
  'tr0.l4.p1': {
    kind: 'numeric',
    unit: 'lanes',
    reference: () => {
      const task = gridTask([12, 20], 6)
      if (task === null) throw new Error('(12, 20) in six programs is not a fair question')
      return task.least
    },
  },
  // BLOCK 128 over 1000 elements on the default grid: cdiv(1000, 128) programs of 128 lanes, less the 1000 that fall inside.
  'tr0.l4.p2': {
    kind: 'numeric',
    unit: 'lanes',
    reference: () => cdiv(1000, 128) * 128 - 1000,
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 4's launches                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The three launches of lesson 4's table on `grid`'s practice tensor: the reference's, one program for the whole tensor, and square tiles. */
export function gridLaunches(): { name: string; block: number[]; grid: number[]; programs: number; lanes: number; masked: number }[] {
  const task = practiceGrid().tasks[0]
  const pow2 = (n: number) => 2 ** Math.ceil(Math.log2(n))
  // The squarest tile within the cap: the smallest power of two on both dimensions whose grid has at most the cap's programs.
  const side = [1, 2, 4, 8, 16, 32].find((p) => {
    const g = gridCoverage(task.shape, [p, p])
    return !('error' in g) && g.programs <= PROGRAM_CAP
  })
  if (side === undefined) throw new Error('no square tile fits the cap')
  const launches: [string, number[]][] = [
    ['The reference', [...task.block]],
    ['One program', task.shape.map(pow2)],
    ['Square tiles', [side, side]],
  ]
  return launches.map(([name, block]) => {
    const g = gridCoverage(task.shape, block)
    if ('error' in g) throw new Error(`the model refuses BLOCK ${block.join(', ')}`)
    return { name, block, grid: [...g.grid], programs: g.programs, lanes: g.lanes, masked: g.masked }
  })
}

/** The course's own kernels, as scripts/triton-interp/course_kernel.py launches them: what its last two lines print, from the grid model. */
export function courseKernelLines(n: number, block: number, shape: readonly [number, number], tile: readonly [number, number]): [string, string] {
  const one = gridCoverage([n], [block])
  const two = gridCoverage([...shape], [...tile])
  if ('error' in one || 'error' in two) throw new Error('the model refuses the course kernel\'s launch')
  // The 2-D input is a transposed view: a contiguous (cols, rows) buffer read as (rows, cols), so its strides are (1, rows).
  return [
    `1-D: n=${n} BLOCK=${block} programs=${one.programs} lanes=${one.lanes} masked=${one.masked}`,
    `2-D: shape=(${shape.join(', ')}) strides=(1, ${shape[0]}) BLOCK=(${tile.join(', ')}) grid=(${two.grid.join(', ')}) masked=${two.masked}`,
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Lesson 1's table of slices, transposes and copies                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The calls of lesson 1's second table, each on a contiguous (4, 6) tensor, as the lesson spells them, with the model's operations. */
export const CALLS: readonly (readonly [string, readonly ShiftOp[]])[] = [
  ['x[1:, :]', [{ op: 'slice', dim: 0, start: 1, stop: 4, step: 1 }]],
  ['x[:, ::2]', [{ op: 'slice', dim: 1, start: 0, stop: 6, step: 2 }]],
  ['x.transpose(0, 1)', [{ op: 'transpose', a: 0, b: 1 }]],
  ['x.transpose(0, 1).contiguous()', [{ op: 'transpose', a: 0, b: 1 }, { op: 'contiguous' }]],
]

/** The rows of that table: the call, then the offset, the shape and the strides the model gives, and what it moved. */
export function callRows(): string[][] {
  return CALLS.map(([call, ops]) => {
    const steps = chain(contiguousView([4, 6]), ops)
    const end = steps[steps.length - 1].view
    const moved = steps.reduce((sum, step) => sum + step.moved, 0)
    return [code(call), code(String(end.offset)), code(pyTuple(end.shape)), code(pyTuple(end.strides)), moved === 0 ? 'nothing' : 'every element, into a new buffer']
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model tables                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Every table of TR0's lessons whose header or caption carries [synthetic]: the header row word for word, tags included, and the rows that
 * the model recomputes. The module kit (module-kit.ts) fails a lesson that prints a model table this list does not hold.
 */
export const MODEL_TABLES: readonly ModelTable[] = [
  {
    lesson: 'tr0.l1',
    header: '| After | Shape [synthetic] | Strides [synthetic] | Contiguous | Elements moved [synthetic] |',
    rows: () =>
      viewsRun().map((step) => [
        step.op === null ? 'the start' : code(opText(step.op)),
        code(pyTuple(step.view.shape)),
        code(pyTuple(step.view.strides)),
        isContiguous(step.view) ? 'yes' : 'no',
        String(step.moved),
      ]),
  },
  {
    lesson: 'tr0.l2',
    header: '| After | Shape [synthetic] | Strides [synthetic] | Moved [synthetic] |',
    // The permute is spelled as PyTorch's call, `permute(1, 0, 2)`, which the lesson's own words give.
    rows: () =>
      threeDRun().map((step) => [
        step.op === null ? 'the start' : step.op.op === 'permute' ? code(`permute(${step.op.order.join(', ')})`) : code(opText(step.op)),
        code(pyTuple(step.view.shape)),
        code(pyTuple(step.view.strides)),
        String(step.moved),
      ]),
  },
  {
    lesson: 'tr0.l3',
    header: '| After | Shape [synthetic] | Strides [synthetic] | Moved [synthetic] |',
    rows: () =>
      queryRun().map((step) => [
        step.op === null ? 'the start' : code(opText(step.op)),
        code(pyTuple(step.view.shape)),
        code(pyTuple(step.view.strides)),
        String(step.moved),
      ]),
  },
  {
    lesson: 'tr0.l4',
    header: '| Launch | The reference [synthetic] | One program [synthetic] | Square tiles [synthetic] |',
    // One column per launch, one row per quantity, so that the table fits a phone.
    rows: () => {
      const launches = gridLaunches()
      return [
        ['BLOCK', ...launches.map((launch) => code(pyTuple(launch.block)))],
        ['Grid', ...launches.map((launch) => code(pyTuple(launch.grid)))],
        ['Programs', ...launches.map((launch) => String(launch.programs))],
        ['Lanes', ...launches.map((launch) => String(launch.lanes))],
        ['Masked lanes', ...launches.map((launch) => String(launch.masked))],
      ]
    },
  },
]
