/**
 * `tr0.grid-cover`: which program of a Triton launch covers an element, how many programs a launch has, and how many lanes are masked
 * (TR0; KCs `tr0.triton-program-model` and `tr0.triton-masks`). It is TR0's Keep family for the grid of a kernel, and its keys are the
 * `tensor` model's own: `gridCoverage` and `programCells` of `@es/sim/tensor`.
 *
 * A program covers a BLOCK-sized tile; the default grid has `cdiv(n, BLOCK)` programs along a dimension of size n; a lane whose offset
 * is not below n is masked (claims triton.program-id, triton.cdiv-device, triton.load-mask, triton.store-mask); BLOCK is a power of two
 * (claim triton.arange-range-check).
 *
 *   which-program   which program covers the element at (i, j), or none of them. At levels 0 and 1 the grid is the default and every element
 *                   is covered; from level 2 on the grid is smaller than the default along some dimension, and an element past its end is
 *                   covered by no program, one time in five. The options are four programs and "none", and the answer is drawn first.
 *   programs        how many programs the default grid has.
 *   masked          how many lanes are masked: with the default grid up to level 2, and with a grid below the default at level 3.
 *
 * The tests read the numbers the stem prints and ask the model.
 */
import { between } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { cdiv, gridCoverage, programCells } from '@es/sim/tensor'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { ChoiceOption, Gen, Item, Level, Rich, Step, VariantSpec } from '../../types'
import { drawOutcome, EXACT, oneOf, shown, workedPart } from './kit'

const FAMILY = 'tr0.grid-cover'
const VERSION = 1
const PROGRAM = 'tr0.triton-program-model'
const MASKS = 'tr0.triton-masks'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'which-program', title: 'The program that covers an element', kcs: [PROGRAM, MASKS], levels: [0, 1, 2, 3] },
  { id: 'programs', title: 'The programs of a launch', kcs: [PROGRAM], levels: [0, 1, 2, 3] },
  { id: 'masked', title: 'The lanes of a launch that are masked', kcs: [MASKS], levels: [0, 1, 2, 3] },
]

type VariantId = 'which-program' | 'programs' | 'masked'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** A launch over a tensor: its shape, the BLOCK on each dimension, and the programs along each dimension. */
export interface Launch {
  readonly shape: readonly number[]
  readonly block: readonly number[]
  readonly grid: readonly number[]
}

/** The grid that `triton.cdiv` gives on each dimension. */
export const defaultGrid = (shape: readonly number[], block: readonly number[]): number[] => shape.map((n, d) => cdiv(n, block[d]))

export function coverage(launch: Launch): { programs: number; masked: number; lanes: number } {
  const r = gridCoverage(launch.shape, launch.block, launch.grid)
  if ('error' in r) throw new RangeError(`${FAMILY}: the launch is not valid`)
  return { programs: r.programs, masked: r.masked, lanes: r.lanes }
}

/** The program that covers the element at `at`, or null if none does: the `tensor` model's tiles, searched. */
export function coveringProgram(launch: Launch, at: readonly number[]): number[] | null {
  const index = at.map((x, d) => Math.floor(x / launch.block[d]))
  if (index.some((p, d) => p >= launch.grid[d])) return null
  const r = programCells(launch.shape, launch.block, index)
  if ('error' in r) throw new RangeError(`${FAMILY}: the launch is not valid`)
  return r.cells.some((cell) => cell.every((c, d) => c === at[d])) ? index : null
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Scenes                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const BLOCKS_1D = [4, 8, 16, 32, 64, 128] as const
const BLOCKS_2D = [2, 4, 8, 16] as const

function rankFor(variant: VariantId, level: Level, rng: Rng): 1 | 2 {
  if (level === 0) return 1
  if (level >= 3) return 2
  if (variant === 'which-program' && level === 1) return between(rng, 0, 1) === 0 ? 1 : 2
  return level === 1 ? 1 : 2
}

/** A launch whose every dimension is not a multiple of its BLOCK, so that the last program along it has masked lanes. */
function drawLaunch(variant: VariantId, level: Level, seed: number, purpose: string): Launch {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  const rank = rankFor(variant, level, rng)
  const block = Array.from({ length: rank }, () => oneOf(rng, rank === 1 ? BLOCKS_1D : BLOCKS_2D))
  const shape = block.map((b) => b * between(rng, 2, rank === 1 ? 12 : 9) + between(rng, 1, b - 1))
  return { shape, block, grid: defaultGrid(shape, block) }
}

/** A grid below the default along at least one dimension, for a launch whose default grid has more than one program there. */
function shrink(rng: Rng, launch: Launch): Launch {
  const grid = [...launch.grid]
  const dims = grid.flatMap((g, d) => (g > 1 ? [d] : []))
  const dim = oneOf(rng, dims.length === 0 ? [0] : dims)
  grid[dim] = Math.max(1, grid[dim] - between(rng, 1, Math.min(2, grid[dim] - 1 || 1)))
  return { ...launch, grid }
}

const tuple = (xs: readonly number[]): string => `(${xs.join(', ')})`

const shapePart = (shape: readonly number[]): Rich => (shape.length === 1 ? rich(num(shape[0], { unit: 'elements' })) : rich('a ', num(shape[0], { unit: 'rows' }), ' by ', num(shape[1], { unit: 'columns' }), ' tensor'))
const blockPart = (block: readonly number[]): Rich => (block.length === 1 ? rich('BLOCK ', num(block[0], { unit: 'lanes' })) : rich('BLOCK ', num(block[0], { unit: 'rows' }), ' by ', num(block[1], { unit: 'columns' })))

function launchSentence(launch: Launch, withGrid: boolean): Rich {
  const one = launch.shape.length === 1
  return rich(
    one ? 'A kernel covers a vector of ' : 'A kernel covers ',
    ...shapePart(launch.shape),
    ' with ',
    ...blockPart(launch.block),
    one ? ', one program for each block of lanes. ' : ', one program for each tile. ',
    ...(withGrid ? (one ? ['The launch has ', num(launch.grid[0], { unit: 'programs' }), '. '] : ['The grid of the launch is ', num(launch.grid[0], { unit: 'programs' }), ' by ', num(launch.grid[1], { unit: 'programs' }), '. ']) : []),
  )
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* which-program                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

interface Which {
  readonly launch: Launch
  readonly at: readonly number[]
  /** The program that covers `at`, or null. */
  readonly program: readonly number[] | null
}

function drawWhich(level: Level, seed: number, outcome: number, purpose: string): Which {
  const base = drawLaunch('which-program', level, seed, purpose)
  const rng = itemRng(FAMILY, 'which-program', level, seed, `${purpose}-place`)
  const shrunk = level >= 2
  // From level 2 on the grid is below the default somewhere; the answer "none" is the draw's fifth outcome.
  const launch = shrunk ? shrink(rng, base) : base
  const wantNone = shrunk && outcome === 4
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const at = launch.shape.map((n) => between(rng, 0, n - 1))
    const program = coveringProgram(launch, at)
    if ((program === null) === wantNone) return { launch, at, program }
  }
  // The grid always leaves an element past its end when it is below the default, and covers one when it is not empty.
  const at = launch.shape.map((n) => n - 1)
  return { launch, at, program: coveringProgram(launch, at) }
}

const programText = (p: readonly number[]): string => (p.length === 1 ? String(p[0]) : tuple(p))

function whichWhy(scene: Which): Rich {
  const { launch, at, program } = scene
  const index = at.map((x, d) => Math.floor(x / launch.block[d]))
  if (program === null) {
    return rich('Dividing the place by BLOCK gives program ', code(programText(index)), ', and the grid does not reach it: it holds only ', code(tuple(launch.grid)), ' programs. No program covers the element, so no lane ever loads or stores it.')
  }
  return rich('A program covers the elements from its index times BLOCK up to BLOCK further, so the element at ', code(tuple(at)), ' is in program ', code(programText(program)), ': each place divided by its BLOCK, rounded down.')
}

function whichOptions(scene: Which, level: Level, seed: number): ChoiceOption[] {
  const { launch, at, program } = scene
  const rank = at.length
  const rng = itemRng(FAMILY, 'which-program', level, seed, 'lures')
  const exact = at.map((x, d) => Math.floor(x / launch.block[d]))
  const exists = (p: readonly number[]): boolean => p.every((x, d) => x >= 0 && x < launch.grid[d])
  const lures: { p: readonly number[]; miss: string; why: Rich }[] = [
    { p: at.map((x, d) => x % launch.block[d]), miss: 'lane-for-program', why: rich('That is the lane inside the program, the place modulo BLOCK. The program is the place divided by BLOCK.') },
    { p: exact.map((x, d) => (d === rank - 1 ? x + 1 : x)), miss: 'off-by-one', why: rich('That is one program further than the one whose tile holds the element: a program starts at its index times BLOCK, and the element is inside that tile.') },
    { p: exact.map((x, d) => (d === 0 ? Math.max(0, x - 1) : x)), miss: 'off-by-one', why: rich('That is one program before the one whose tile holds the element: a program starts at its index times BLOCK, and the element is inside that tile.') },
    ...(rank === 2 ? [{ p: [exact[1], exact[0]], miss: 'dimensions-swapped', why: rich('That reads the place with its two dimensions the wrong way round: the first index runs along the rows and the second along the columns.') }] : []),
    { p: exact, miss: 'program-not-launched', why: rich('Dividing the place by BLOCK gives this program, but the grid of the launch is smaller than the default and does not reach it.') },
    { p: exact.map((x, d) => Math.min(x, launch.grid[d] - 1)), miss: 'clamped-to-the-grid', why: rich('A program past the end of the grid is not clamped to the last one: that program covers its own tile and nothing else.') },
  ]
  const seen = new Set<string>(program === null ? [] : [programText(program)])
  const chosen: { p: readonly number[]; miss: string; why: Rich }[] = []
  for (const lure of lures) {
    const key = programText(lure.p)
    if (seen.has(key) || lure.p.some((x) => x < 0) || (program === null && !exists(lure.p) && lure.miss !== 'program-not-launched')) continue
    // A lure that is a program the grid has is a plausible wrong answer; one that it lacks is only offered as the "not launched" lure.
    if (program !== null && !exists(lure.p)) continue
    seen.add(key)
    chosen.push(lure)
  }
  const want = 4
  // Fill with other programs, the grid's own or a little past its end, until there are four.
  const fill = (): void => {
    for (let attempt = 0; attempt < 400 && (program === null ? chosen.length : chosen.length + 1) < want; attempt += 1) {
      const p = launch.grid.map((g) => between(rng, 0, g + 1))
      const key = programText(p)
      if (seen.has(key)) continue
      seen.add(key)
      chosen.push({ p, miss: 'another-program', why: rich('That program covers a different tile, or is not launched at all: it is not the one whose block holds this element.') })
    }
  }
  fill()
  const programs = program === null ? chosen.slice(0, want) : [{ p: program, miss: '', why: whichWhy(scene) }, ...chosen.slice(0, want - 1)]
  const options = programs.map((entry): ChoiceOption => {
    const key = programText(entry.p)
    const id = `p-${entry.p.join('-')}`
    return program !== null && key === programText(program)
      ? { id, text: rich(code(`program ${key}`)), why: entry.why }
      : { id, text: rich(code(`program ${key}`)), why: entry.why, miss: `${FAMILY}.${entry.miss}` }
  })
  options.push({
    id: 'none',
    text: rich('No program covers it'),
    why: program === null ? whichWhy(scene) : rich('The grid has a program for the tile that holds this element, so a program does cover it.'),
    ...(program === null ? {} : { miss: `${FAMILY}.uncovered-assumed` }),
  })
  return shown(FAMILY, 'which-program', level, seed, options)
}

/*
 * The first step of each solution is the rule alone, with no figure of the scene: at level 1 it is the step a learner is shown before
 * answering, and the questions of a lesson's Test are asked at level 1, so it must not compute the key or any part of it.
 */
const WHICH_RULE: Rich = rich('A program covers one tile: on each dimension, the places from its index times BLOCK up to BLOCK further. So the program that holds a place is found from the place and BLOCK alone, one dimension at a time.')

function whichSteps(scene: Which): Step[] {
  return [
    { text: WHICH_RULE },
    { text: rich('Here BLOCK is ', code(tuple(scene.launch.block)), ', and each place divided by its BLOCK, rounded down, gives ', code(tuple(scene.at.map((x, d) => Math.floor(x / scene.launch.block[d])))), '.') },
    { text: whichWhy(scene) },
  ]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* programs and masked                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

function programsSteps(launch: Launch): Step[] {
  const key = coverage(launch).programs
  const per = launch.shape.map((n, d) => cdiv(n, launch.block[d]))
  const steps: Step[] = [
    { text: rich('The default grid has cdiv(n, BLOCK) programs along each dimension: the size divided by BLOCK, rounded up, because a program that covers a partial tile still runs.') },
    { text: rich('Along ', launch.shape.length === 1 ? 'the vector' : 'each dimension', ' that is ', ...per.flatMap((p, d) => [d === 0 ? '' : ' and ', num(p, { tag: 'derived', unit: 'programs' })]), '.') },
  ]
  steps.push(
    launch.shape.length === 1
      ? { text: rich('A vector has one dimension, so that is the whole launch.'), result: num(key, { tag: 'derived', unit: 'programs' }) }
      : { text: rich('The launch has one program for each pair of them, so the counts multiply.'), result: num(key, { tag: 'derived', unit: 'programs' }) },
  )
  return steps
}

function maskedSteps(launch: Launch): Step[] {
  const c = coverage(launch)
  const covered = c.lanes - c.masked
  return [
    { text: rich('Every program runs all of its lanes, and a lane is masked when its place is past the end of the tensor. So the masked lanes are the lanes of the whole launch less the lanes that fall inside the tensor.') },
    { text: rich('The launch runs ', num(c.programs, { tag: 'derived', unit: 'programs' }), ' of ', num(c.lanes / c.programs, { tag: 'derived', unit: 'lanes' }), ' each, which is ', num(c.lanes, { tag: 'derived', unit: 'lanes' }), '.') },
    { text: rich('The lanes that fall inside the tensor are ', num(covered, { tag: 'derived', unit: 'lanes' }), ', as many as the tensor has elements that a program reaches.') },
    { text: rich('The rest are masked: they neither load nor store.'), result: num(c.masked, { tag: 'derived', unit: 'lanes' }) },
  ]
}

const DIAGNOSES: Readonly<Record<'programs' | 'masked', DiagnosisRule>> = {
  programs: (item, value) => {
    const launch = launchOfItem(item)
    const rounded = launch.shape.reduce((p, n, d) => p * Math.floor(n / launch.block[d]), 1)
    if (value === rounded) return { id: `${FAMILY}.rounded-down`, message: rich('That divides and rounds down. A program that covers only part of a tile still runs, so each dimension rounds up.') }
    if (launch.shape.length === 2 && launch.grid.includes(value)) return { id: `${FAMILY}.one-dimension`, message: rich('That counts the programs along one dimension. The launch has a program for each pair of positions, so the counts multiply.') }
    if (launch.block.includes(value)) return { id: `${FAMILY}.block-for-programs`, message: rich('That is BLOCK, the lanes of one program. The programs are the tiles that the tensor holds, counted by dividing its size by BLOCK.') }
    return null
  },
  masked: (item, value) => {
    const launch = launchOfItem(item)
    const c = coverage(launch)
    if (value === c.lanes) return { id: `${FAMILY}.lanes-for-masked`, message: rich('That is every lane the launch runs. Most of them are inside the tensor and are not masked: only a lane past the end is.') }
    if (value === c.lanes - c.masked) return { id: `${FAMILY}.covered-for-masked`, message: rich('That is the lanes that are not masked. The masked ones are the rest of the launch.') }
    return null
  },
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Params                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const list = (xs: readonly number[]): string => xs.join(',')
const fromList = (text: string): number[] => text.split(',').map(Number)

const paramsOf = (launch: Launch): Record<string, string> => ({ shape: list(launch.shape), block: list(launch.block), grid: list(launch.grid) })

function launchOfItem(item: Pick<Item, 'params'>): Launch {
  const { shape, block, grid } = item.params
  if (typeof shape !== 'string' || typeof block !== 'string' || typeof grid !== 'string') throw new TypeError(`${FAMILY}: the params are not a launch`)
  return { shape: fromList(shape), block: fromList(block), grid: fromList(grid) }
}

function whichOfItem(item: Pick<Item, 'params'>): Which {
  const launch = launchOfItem(item)
  const { at } = item.params
  if (typeof at !== 'string') throw new TypeError(`${FAMILY}: the params are not a place`)
  const place = fromList(at)
  return { launch, at: place, program: coveringProgram(launch, place) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const gen = { id: FAMILY, version: VERSION }
  const variant = spec.id as VariantId
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, givens: [] }
  if (variant === 'which-program') {
    const outcome = level >= 2 ? drawOutcome(FAMILY, variant, level, seed, 5) : 0
    const scene = drawWhich(level, seed, outcome, 'scene')
    return finishItem(gen, {
      ...base,
      params: { ...paramsOf(scene.launch), at: list(scene.at) },
      stem: rich(...launchSentence(scene.launch, level >= 2), 'Which program covers the element at ', code(tuple(scene.at)), '? Indices count from zero.'),
      worked: workedPart(level, whichSteps(scene), (attempt) => {
        const other = drawWhich(level, seed, (outcome + 1 + attempt) % 5, `example-${attempt}`)
        return other.launch.shape.join() === scene.launch.shape.join() && other.at.join() === scene.at.join() ? null : whichSteps(other)
      }),
      answer: { kind: 'choice', label: 'the program that covers it', options: whichOptions(scene, level, seed), correct: scene.program === null ? 'none' : `p-${scene.program.join('-')}` },
    })
  }
  const launch = drawLaunch(variant, level, seed, 'scene')
  // The lanes of a launch whose grid is below the default are asked at level 3 only.
  const asked: Launch = variant === 'masked' && level === 3 ? shrink(itemRng(FAMILY, variant, level, seed, 'grid'), launch) : launch
  const c = coverage(asked)
  const key = variant === 'programs' ? c.programs : c.masked
  const withGrid = variant === 'masked' && level === 3
  return finishItem(gen, {
    ...base,
    params: paramsOf(asked),
    stem:
      variant === 'programs'
        ? rich(...launchSentence(asked, false), 'The grid is the default, cdiv of the size and BLOCK on each dimension. How many programs does the launch have?')
        : rich(
            ...launchSentence(asked, withGrid),
            ...(withGrid ? [] : ['The grid is the default, cdiv of the size and BLOCK on each dimension. ']),
            'A lane is masked when its place is past the end of the tensor. How many lanes of the launch are masked?',
          ),
    worked: workedPart(level, variant === 'programs' ? programsSteps(asked) : maskedSteps(asked), (attempt) => {
      const other = drawLaunch(variant, level, seed, `example-${attempt}`)
      const shown2 = variant === 'masked' && level === 3 ? shrink(itemRng(FAMILY, variant, level, seed, `example-grid-${attempt}`), other) : other
      const k = variant === 'programs' ? coverage(shown2).programs : coverage(shown2).masked
      return k === key ? null : variant === 'programs' ? programsSteps(shown2) : maskedSteps(shown2)
    }),
    answer: { kind: 'numeric', label: variant === 'programs' ? 'the programs' : 'the masked lanes', unit: variant === 'programs' ? 'programs' : 'lanes', truth: key, tolerance: EXACT },
  })
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const gridCover: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The grid of a Triton launch',
  kcs: [PROGRAM, MASKS],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: sizes are drawn so that no dimension divides evenly, and the answer is drawn first.
  band: () => true,
  grade: (item, response) => (item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, [DIAGNOSES[item.variant === 'masked' ? 'masked' : 'programs']])),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    if (item.variant === 'which-program') return whichSteps(whichOfItem(item))
    return item.variant === 'programs' ? programsSteps(launchOfItem(item)) : maskedSteps(launchOfItem(item))
  },
}
