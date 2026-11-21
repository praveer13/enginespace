/**
 * What Tensor views says, by level (GAMES.md §4.3, §4.5, §4.6): the title in the level menu, the goal line, the line a level opens on, the
 * prediction's question with the unit its answer is in, a pass rule, the parts and each named moment's line.
 *
 * The words are display copy and no rule reads them, so they are in no level and no state: rewording one moves no state hash. Every figure
 * a sentence prints is read from the level or the state it is about, so a different draw changes no copy and the copy holds no digit of
 * its own (tests/copy/game-copy.test.ts reads the figures back from the level). The engine's term is the name of everything (REDESIGN §2.7,
 * D-063): tensor, buffer, stride, view, copy, program, BLOCK, grid, mask. `stride order` is the course's own word, and its part says so.
 */
import { numel } from '@es/sim/tensor'
import type { GoalLine } from '../types'
import { kindName, programLabel, shapeText, tupleText } from './labels'
import type { GridLevel, LayoutLevel, Moment, OpKind, ShiftLevel, ShiftLevelId } from './types'

export const SHIFT_TITLES: Readonly<Record<ShiftLevelId, string>> = {
  views: 'A transpose is a view',
  'stride-zero': 'Broadcasting is stride 0',
  'three-d': 'One block per head',
  fewest: 'Fewest copies',
  grid: 'A grid of programs',
}

/** What a level asks the learner to predict, in words, and the unit its answer is in. */
export interface ShiftPredictCopy {
  readonly ask: string
  readonly unit: 'elements' | 'addresses' | 'copies' | 'lanes'
}

export interface ShiftCopy {
  readonly title: string
  readonly goal: GoalLine
  /** The line the level opens on. */
  readonly prompt: string
  readonly predict: ShiftPredictCopy
  /** A graded level's pass rule, stated before the run (REDESIGN §2.6). Only a graded level has one. */
  readonly passRule?: string
  /** What passes a practice level, in practice. Only a practice level has one. */
  readonly practiceRule?: string
}

const code = (name: string): string => `\`${name}\``

/** `a`, `a or b`, `a, b or c`, each operation in code. */
function orList(kinds: readonly OpKind[]): string {
  const names = kinds.map((k) => code(kindName(k)))
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

const stepControls = (kinds: readonly OpKind[]): string => `You choose one operation at a time: ${orList(kinds)}.`

function layoutCopy(level: LayoutLevel): ShiftCopy {
  const task = level.tasks[0]
  const beat = `The reference does it with ${plural(task.copies, 'copy', 'copies')}.`
  const practiceRule = `Passes in practice when your copies equal the reference's: ${task.copies}.`
  const ends = 'Ends when your tensor matches the target.'
  switch (level.id) {
    case 'views': {
      const n = numel(task.goal.shape)
      return {
        title: SHIFT_TITLES.views,
        goal: { aim: `Read this tensor column by column, as one row of ${n} elements, with as few copies as you can.`, controls: stepControls(level.offered), beat, ends },
        prompt: 'A tensor is a buffer read through a shape and strides. Turn it so that its elements read column by column, and watch which operations leave the buffer where it is.',
        predict: { ask: `The reference makes ${plural(task.copies, 'copy', 'copies')} here. How many elements will that copy move?`, unit: 'elements' },
        practiceRule,
      }
    }
    case 'stride-zero': {
      const [rows, row] = task.goal.shape
      return {
        title: SHIFT_TITLES['stride-zero'],
        goal: { aim: `Make a ${shapeText([rows, row])} tensor whose every row is this row of ${row}, and that you can write to.`, controls: stepControls(level.offered), beat, ends },
        prompt: 'Broadcasting repeats a row without storing it again: its stride is 0, so every row reads the same elements. Make a tensor that can be written to.',
        predict: { ask: 'How many elements will `expand` move?', unit: 'elements' },
        practiceRule,
      }
    }
    case 'three-d': {
      const [heads, tokens, size] = task.goal.shape
      return {
        title: SHIFT_TITLES['three-d'],
        goal: {
          aim: `Turn the projection's ${shapeText([tokens, heads * size])} output into one contiguous block per head, ${shapeText(task.goal.shape)}: heads, tokens, head size.`,
          controls: stepControls(level.offered),
          beat,
          ends,
        },
        prompt: 'Attention wants each head to read its own block of tokens. Split the projection into heads, bring the head dimension first, and see which of those steps is free.',
        predict: { ask: 'After the permute, how far apart in the buffer are two neighbouring tokens of one head?', unit: 'addresses' },
        practiceRule,
      }
    }
    default: {
      const n = level.needed
      const rule = `Passes when, on each of ${n} new targets, your copies equal the reference's and no ${code('view')} was refused.`
      return {
        title: SHIFT_TITLES.fewest,
        goal: {
          aim: 'Reach each target with as few copies as you can.',
          controls: `${stepControls(level.offered)} There is no undo, and a ${code('view')} the strides cannot express fails that target.`,
          beat: rule,
          ends: `Ends when each of the ${n} targets is reached or has failed.`,
        },
        prompt: `A ${code('view')} costs nothing where the strides can express the shape, and a ${code('contiguous()')} costs every element when the tensor is not contiguous. Place a copy only where no view can give the layout.`,
        predict: { ask: 'How many copies does the fewest path need?', unit: 'copies' },
        passRule: rule,
      }
    }
  }
}

function gridCopy(level: GridLevel): ShiftCopy {
  const task = level.tasks[0]
  const predict: ShiftPredictCopy = { ask: 'How many lanes will the reference leave masked?', unit: 'lanes' }
  const controls = 'You choose BLOCK along each dimension and the grid, then launch.'
  if (!level.graded) {
    return {
      title: SHIFT_TITLES.grid,
      goal: {
        aim: `Cover every element of this ${shapeText(task.shape)} tensor exactly once, with as few masked lanes as you can, in at most ${level.cap} programs.`,
        controls,
        beat: `The reference leaves ${task.least} lanes masked.`,
        ends: 'Ends when you launch.',
      },
      prompt: 'A kernel launches one program for each BLOCK-sized tile of the tensor, and a lane past the edge is masked. Choose BLOCK and the grid, and count what each edge masks.',
      predict,
      practiceRule: `Passes in practice when every element is covered exactly once and your masked lanes equal the reference's: ${task.least}.`,
    }
  }
  const rule = `Passes when every element is covered exactly once and your masked lanes equal the reference's, on each of ${level.needed} new tensors.`
  return {
    title: SHIFT_TITLES.grid,
    goal: {
      aim: `Cover every element of each of ${level.needed} new tensors exactly once, with as few masked lanes as you can, in at most ${level.cap} programs.`,
      controls,
      beat: rule,
      ends: `Ends when you have launched on all ${level.needed} tensors.`,
    },
    prompt: 'A kernel launches one program for each BLOCK-sized tile of the tensor, and a lane past the edge is masked. Fit BLOCK to the sizes that divide, and count what each edge masks.',
    predict,
    passRule: rule,
  }
}

/** The copy of a level, with every figure read from the level. */
export const copyOf = (level: ShiftLevel): ShiftCopy => (level.kind === 'layout' ? layoutCopy(level) : gridCopy(level))

/* ------------------------------------------------------------------------------------------------------------------ */
/* The parts (GAMES.md §4.5)                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A part of the diagram, as the parts list names it (REDESIGN §2.6): an id, the engine's name, one sentence and the claim that sources it. */
export interface ShiftPart {
  readonly id: string
  readonly name: string
  readonly sentence: string
  /** The class, method or function the pinned library names it by, set as code. */
  readonly engine?: string
  readonly levels: readonly ShiftLevelId[]
  /** The claim (content/claims) that holds its value and its tag at the pin. A part with none is a model object, and its popover says so. */
  readonly claim?: string
}

const VIEW_LEVELS: readonly ShiftLevelId[] = ['views', 'stride-zero', 'three-d', 'fewest']

export const SHIFT_PARTS: readonly ShiftPart[] = [
  {
    id: 'table',
    name: 'Shape and strides',
    sentence: 'One row per dimension: its size, and its stride, how far in the buffer one step along it moves. Strides and addresses count elements, not bytes; the dtype gives the bytes.',
    engine: 'Tensor.stride',
    levels: VIEW_LEVELS,
    claim: 'torch.stride.definition',
  },
  {
    id: 'buffer',
    name: 'Buffer',
    sentence: 'The flat memory that holds the elements, address by address. A view reads it; only a copy writes a new one.',
    engine: 'Tensor.view',
    levels: VIEW_LEVELS,
    claim: 'torch.view.shares-data',
  },
  {
    id: 'order',
    name: 'Stride order',
    sentence: "A line through the elements in the order they sit in the buffer; the course's name for it. On a contiguous tensor it reads row by row.",
    levels: VIEW_LEVELS,
  },
  { id: 'target', name: 'Target', sentence: 'The layout to reach: its shape, its elements in order, and whether it must be contiguous.', levels: VIEW_LEVELS },
  {
    id: 'shared',
    name: 'Stride 0',
    sentence: 'A dimension whose stride is 0: every index along it reads the same addresses.',
    engine: 'Tensor.expand',
    levels: ['stride-zero'],
    claim: 'torch.expand.stride-zero',
  },
  { id: 'slices', name: 'Slices', sentence: 'One grid of cells for each index of the first dimension.', levels: ['three-d', 'fewest'] },
  { id: 'tensor', name: 'Tensor', sentence: 'The elements to cover, one cell each.', levels: ['grid'] },
  {
    id: 'program',
    name: 'Program',
    sentence: 'One instance of the kernel. `tl.program_id` says which tile it covers.',
    engine: 'tl.program_id',
    levels: ['grid'],
    claim: 'triton.program-id',
  },
  {
    id: 'block',
    name: 'BLOCK',
    sentence: "The tile's size along each dimension: a compile-time constant and a power of two.",
    engine: 'tl.arange',
    levels: ['grid'],
    claim: 'triton.arange-power-of-two',
  },
  {
    id: 'grid-size',
    name: 'Grid',
    sentence: 'Programs along each dimension. `cdiv(n, BLOCK)` of them cover n.',
    engine: 'triton.cdiv',
    levels: ['grid'],
    claim: 'triton.cdiv-host',
  },
  {
    id: 'mask',
    name: 'Mask',
    sentence: "A lane is one element position of a program's BLOCK, the course's word. A lane whose offset is past the edge is masked: its load and its store do nothing.",
    engine: 'tl.load',
    levels: ['grid'],
    claim: 'triton.load-mask',
  },
]

/** The parts a level draws, in the list's order. */
export const partsOf = (level: ShiftLevelId): readonly ShiftPart[] => SHIFT_PARTS.filter((part) => part.levels.includes(level))

/* ------------------------------------------------------------------------------------------------------------------ */
/* The named moments (GAMES.md §4.6)                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The line of a moment, every figure its own. On `fewest`, which offers no `reshape`, a refused `view` says its target has failed. */
export function momentLine(m: Moment, level: ShiftLevel): string {
  switch (m.id) {
    case 'view-free':
      return `The buffer did not move. ${code(kindName(m.op))} is a view: the strides went from ${tupleText(m.before)} to ${tupleText(m.after)}.`
    case 'view-refused': {
      const last = level.kind === 'layout' && level.failOnRefusal ? 'This target has failed.' : `${code('reshape')} would copy.`
      return `${code('view')} cannot give ${shapeText(m.shape)} here: the stride order jumps where the new shape needs one stride. ${last}`
    }
    case 'copy':
      return `${code(kindName(m.op))} moved ${m.n} elements into a new buffer, every one of them. The stride order now reads row by row.`
    case 'stride-zero':
      return `Stride 0: the ${m.rows} rows read the same ${m.m} elements. Writing to one row would change them all.`
    case 'wrong-order': {
      // `view` and `reshape` read the elements in row-major order of the tensor as it stands, not in the buffer's order; `fewest` offers no `reshape`.
      const keep = level.kind === 'layout' && level.offered.includes('reshape') ? `${code('view')} and ${code('reshape')} keep` : `${code('view')} keeps`
      return `The shape matches the target and the order does not: ${m.k} of ${m.n} elements are in place. ${keep} the elements in the order you read them, row by row; ${code('permute')} changes which dimension moves fastest.`
    }
    case 'masked':
      return `Program ${programLabel(m.index)} runs ${m.lanes} lanes and ${m.masked} are masked: their offsets are past the edge, so the mask is false there.`
    case 'uncovered':
      return `${m.n} elements are not covered: along dimension ${m.dim} the grid needs cdiv(${m.size}, ${m.block}) = ${m.g} programs.`
    case 'not-pow2':
      return `BLOCK must be a power of two, because ${code('tl.arange')} takes one. ${m.x} is not.`
    case 'too-many':
      return `At most ${m.cap} programs: this grid launches ${m.n}.`
  }
}
