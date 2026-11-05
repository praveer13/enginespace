/**
 * `tr2.padding-waste`: the size a step is padded to under a list of captured sizes, and what the padding wastes (TR2, lesson 5; KC
 * `tr2.capture-padding`: work out the size a batch is padded to and what the padding wastes, and choose sizes for a given mix of batches).
 *
 * The world is the course's own, and every number in it is synthetic. An engine captures graphs at a few sizes. A step of `n` tokens
 * replays the graph of the smallest captured size that holds it, so it computes `size − n` tokens for nothing: the padding
 * (`paddingModel.padded`, the rule of the step loop's `paddedSize`, claim vllm.cudagraph.padding). A step above the largest size
 * replays nothing and is launched one by one, which a list of sizes must avoid: every batch of the night has to be held.
 * tests/play/items-padding-waste.test.ts holds the rule to the step loop v1: the padded tokens it counts for the same numbers.
 *
 * What the variants ask:
 *   padded-size   the size one step of `n` tokens is padded to, under a list of sizes (levels 0 to 3);
 *   night-waste   the padded tokens a night of six steps wastes in all, under a list of sizes (levels 0 to 3);
 *   choose-sizes  of four lists of sizes that all fit the same budget of graphs, the one that holds every step of the night and wastes the
 *                 fewest padded tokens (levels 2 and 3). The key is the exact optimum over every list of that many sizes, found by looking
 *                 at all of them, and the other three are a list that leaves the biggest step uncaptured and two that waste more.
 * At level 0 a worked example with other numbers comes first, at level 1 the first step of the solution is shown, at level 2 the learner is
 * alone with the numbers, and level 3 changes the surface: a step is given as its decode rows and its prompt chunk, so the learner adds
 * them, and a night is given as a tally of fires for each size.
 *
 * `band` throws out the draws that make a poor question: a step that a size holds exactly (no padding to ask about), a padded size that is
 * the next power of two or the next multiple of eight (so a rule of thumb would pass), a night that wastes nothing, and a choice without a
 * unique best list or without a tempting list that leaves a step uncaptured.
 */
import { below, pick, shuffle } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeChoice, gradeNumeric, isAbout } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { BlindStrategy, ChoiceOption, Gen, Given, Item, Level, NumPart, Params, Response, Rich, Step, VariantSpec } from '../../types'

const FAMILY = 'tr2.padding-waste'
const VERSION = 1
const KC = 'tr2.capture-padding'

type VariantId = 'padded-size' | 'night-waste' | 'choose-sizes'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'padded-size', title: 'The size a step pads to', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'night-waste', title: 'The padding a night wastes', kcs: [KC], levels: [0, 1, 2, 3] },
  { id: 'choose-sizes', title: 'Sizes that waste the least', kcs: [KC], levels: [2, 3] },
]

const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/* ------------------------------------------------------------------------------------------------------------------ */
/* The model                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The rule of the family, as arithmetic on a list of sizes and the steps of a night. */
export const paddingModel = {
  /** The smallest captured size that holds `tokens`, or null when every size is smaller. `sizes` ascend. */
  padded(sizes: readonly number[], tokens: number): number | null {
    for (const size of sizes) if (size >= tokens) return size
    return null
  },
  /** The tokens a step computes for nothing, or null when no size holds it. */
  waste(sizes: readonly number[], tokens: number): number | null {
    const padded = paddingModel.padded(sizes, tokens)
    return padded === null ? null : padded - tokens
  },
  /** The padded tokens of a night, and the steps no size holds. */
  night(sizes: readonly number[], steps: readonly number[]): { readonly waste: number; readonly uncaptured: number } {
    let waste = 0
    let uncaptured = 0
    for (const tokens of steps) {
      const step = paddingModel.waste(sizes, tokens)
      if (step === null) uncaptured += 1
      else waste += step
    }
    return { waste, uncaptured }
  },
} as const

/* ------------------------------------------------------------------------------------------------------------------ */
/* The scenes                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

interface PaddedScene {
  readonly variant: 'padded-size'
  readonly sizes: readonly number[]
  readonly tokens: number
  /** A prompt chunk joins the decode rows; `rows + chunk = tokens`. 0 for a plain decode batch. */
  readonly chunk: number
}

interface NightScene {
  readonly variant: 'night-waste'
  readonly sizes: readonly number[]
  readonly steps: readonly number[]
}

interface ChooseScene {
  readonly variant: 'choose-sizes'
  /** How many graphs each list may capture. */
  readonly molds: number
  readonly steps: readonly number[]
  /** The four lists, in the order they are listed (a is first) and the index of the key among them. */
  readonly lists: readonly (readonly number[])[]
  readonly key: number
}

type Scene = PaddedScene | NightScene | ChooseScene

/** The sizes a scene may capture from: irregular on purpose, so that the next power of two or the next multiple of eight is not the answer. */
const SIZE_POOL: readonly number[] = [2, 3, 5, 6, 9, 10, 12, 14, 18, 20, 24, 28, 36, 40, 48, 56, 72, 80, 96]
/** The sizes `choose-sizes` picks its lists from. */
const CANDIDATES: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 24]

const nextPowerOfTwo = (n: number): number => {
  let size = 1
  while (size < n) size *= 2
  return size
}
const nextMultipleOfEight = (n: number): number => Math.ceil(n / 8) * 8

function drawSizes(rng: Rng, least: number, most: number): number[] {
  const count = least + below(rng, most - least + 1)
  const chosen = new Set<number>()
  while (chosen.size < count) chosen.add(SIZE_POOL[below(rng, SIZE_POOL.length)])
  return [...chosen].sort((a, b) => a - b)
}

/** A token count strictly between two captured sizes, so that it is not captured and a larger size holds it. */
function drawBetween(rng: Rng, sizes: readonly number[]): number {
  const gaps: [number, number][] = []
  for (let i = 1; i < sizes.length; i += 1) if (sizes[i] - sizes[i - 1] >= 3) gaps.push([sizes[i - 1], sizes[i]])
  const [low, high] = gaps[below(rng, gaps.length)]
  return low + 1 + below(rng, high - low - 1)
}

function drawPadded(level: Level, seed: Seed, purpose: string): PaddedScene {
  const rng = itemRng(FAMILY, 'padded-size', level, seed, purpose)
  const sizes = drawSizes(rng, 5, 7)
  const tokens = drawBetween(rng, sizes)
  const chunk = level === 3 ? 2 + below(rng, Math.max(1, tokens - 2)) : 0
  return { variant: 'padded-size', sizes, tokens, chunk: level === 3 ? Math.min(chunk, tokens - 1) : 0 }
}

function drawNight(level: Level, seed: Seed, purpose: string): NightScene {
  const rng = itemRng(FAMILY, 'night-waste', level, seed, purpose)
  const sizes = drawSizes(rng, 4, 6)
  // Six steps of the night, each within the largest size, in the order they ran.
  const largest = sizes[sizes.length - 1]
  const steps: number[] = []
  for (let i = 0; i < 6; i += 1) steps.push(2 + below(rng, largest - 1))
  return { variant: 'night-waste', sizes, steps }
}

const LISTS = new Map<number, number[][]>()

/** Every list of `molds` sizes from the candidates, ascending. A pure function of `molds`, kept once because a draw asks for it often. */
function listsOf(molds: number): number[][] {
  const known = LISTS.get(molds)
  if (known !== undefined) return known
  const out: number[][] = []
  const walk = (from: number, chosen: number[]): void => {
    if (chosen.length === molds) {
      out.push(chosen)
      return
    }
    for (let i = from; i < CANDIDATES.length; i += 1) walk(i + 1, [...chosen, CANDIDATES[i]])
  }
  walk(0, [])
  LISTS.set(molds, out)
  return out
}

function drawChoose(level: Level, seed: Seed, purpose: string): ChooseScene {
  const rng = itemRng(FAMILY, 'choose-sizes', level, seed, purpose)
  const molds = 2 + below(rng, 2)
  // A night of eight steps in two or three clusters, so that sizes placed on the clusters waste little.
  const centres = Array.from({ length: 2 + below(rng, 2) }, () => 3 + below(rng, 15))
  const steps: number[] = []
  for (let i = 0; i < 8; i += 1) steps.push(Math.max(2, Math.min(20, pick(rng, centres) + below(rng, 3) - 1)))
  const largest = Math.max(...steps)
  const all = listsOf(molds).map((list) => ({ list, ...paddingModel.night(list, steps) }))
  const covering = all.filter((entry) => entry.uncaptured === 0).sort((a, b) => a.waste - b.waste)
  const failing = all.filter((entry) => entry.uncaptured > 0 && entry.list[entry.list.length - 1] < largest).sort((a, b) => a.waste - b.waste)
  const best = covering[0]
  // The key is the best list. A tempting list leaves the biggest step uncaptured and wastes no more than the key on those it holds; the other
  // two waste more: the next-best covering list that is not the key, and one from the middle of the ranking.
  const tempting = failing.find((entry) => entry.waste <= best.waste) ?? failing[0]
  const next = covering.find((entry) => entry.waste > best.waste) ?? covering[1]
  const middle = covering[Math.min(covering.length - 1, Math.max(2, covering.length >> 2))]
  const chosen = [best, tempting, next, middle]
  // Keep the four lists different (a degenerate seed falls back on other lists and the band refuses it).
  const lists: number[][] = []
  for (const entry of chosen) if (entry !== undefined && !lists.some((list) => list.join() === entry.list.join())) lists.push(entry.list)
  for (const entry of covering) if (lists.length < 4 && !lists.some((list) => list.join() === entry.list.join())) lists.push(entry.list)
  const order = shuffle(rng, [0, 1, 2, 3])
  const shown = order.map((at) => lists[at] ?? lists[0])
  return { variant: 'choose-sizes', molds, steps, lists: shown, key: order.indexOf(0) }
}

function drawScene(variant: VariantId, level: Level, seed: Seed, purpose: string): Scene {
  if (variant === 'padded-size') return drawPadded(level, seed, purpose)
  if (variant === 'night-waste') return drawNight(level, seed, purpose)
  return drawChoose(level, seed, purpose)
}

/** The listed lists of a choice, as the model scores them. */
function scored(scene: ChooseScene): { list: readonly number[]; waste: number; uncaptured: number }[] {
  return scene.lists.map((list) => ({ list, ...paddingModel.night(list, scene.steps) }))
}

/** Whether a scene makes a fair question (the band). All integer arithmetic. */
function isFair(scene: Scene): boolean {
  if (scene.variant === 'padded-size') {
    const padded = paddingModel.padded(scene.sizes, scene.tokens)
    // No size holds the step exactly, and no rule of thumb gives the answer.
    return padded !== null && padded !== scene.tokens && padded !== nextPowerOfTwo(scene.tokens) && padded !== nextMultipleOfEight(scene.tokens)
  }
  if (scene.variant === 'night-waste') {
    const { waste, uncaptured } = paddingModel.night(scene.sizes, scene.steps)
    // Nothing is left uncaptured, something is wasted, and the answer is not a single small number a constant would meet.
    return uncaptured === 0 && waste >= 8
  }
  const entries = scored(scene)
  const key = entries[scene.key]
  const others = entries.filter((_, at) => at !== scene.key)
  const distinct = new Set(entries.map((entry) => entry.list.join())).size === 4
  // The key holds every step, wastes strictly the least of the lists that do, and one other list is tempting: it leaves a step uncaptured.
  return (
    distinct &&
    key.uncaptured === 0 &&
    others.every((entry) => entry.uncaptured > 0 || entry.waste >= key.waste + 2) &&
    others.some((entry) => entry.uncaptured > 0 && entry.waste <= key.waste) &&
    others.filter((entry) => entry.uncaptured === 0).length === 2
  )
}

function paramsOf(scene: Scene): Params {
  if (scene.variant === 'padded-size') return { sizes: scene.sizes.join(','), tokens: scene.tokens, chunk: scene.chunk }
  if (scene.variant === 'night-waste') return { sizes: scene.sizes.join(','), steps: scene.steps.join(',') }
  return { molds: scene.molds, steps: scene.steps.join(','), lists: scene.lists.map((list) => list.join('.')).join(';'), key: scene.key }
}

const numbers = (text: string, separator: string): number[] => text.split(separator).map(Number)

/** The scene an item was made from, read back from its params. */
function sceneOf(item: Pick<Item, 'variant' | 'params'>): Scene {
  if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
  const { sizes, tokens, chunk, steps, molds, lists, key } = item.params
  if (item.variant === 'padded-size' && typeof sizes === 'string' && typeof tokens === 'number' && typeof chunk === 'number') {
    return { variant: 'padded-size', sizes: numbers(sizes, ','), tokens, chunk }
  }
  if (item.variant === 'night-waste' && typeof sizes === 'string' && typeof steps === 'string') return { variant: 'night-waste', sizes: numbers(sizes, ','), steps: numbers(steps, ',') }
  if (item.variant === 'choose-sizes' && typeof molds === 'number' && typeof steps === 'string' && typeof lists === 'string' && typeof key === 'number') {
    return { variant: 'choose-sizes', molds, steps: numbers(steps, ','), lists: lists.split(';').map((list) => numbers(list, '.')), key }
  }
  throw new TypeError(`${FAMILY}: the params of ${item.variant} are not a scene`)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const given = (value: number, unit: string): NumPart => num(value, { unit, tag: 'synthetic' })
const derived = (value: number, unit: string): NumPart => num(value, { unit, tag: 'derived' })

/** A list of sizes or of steps as one run of code, so that no entry is a number of its own to read off. */
const listText = (values: readonly number[]) => code(values.join(', '))

/** The same, two characters to a size, so that lists of the same length print as long as each other and the length says nothing of the answer. */
const alignedText = (values: readonly number[]) => code(values.map((value) => String(value).padStart(2, ' ')).join(', '))

/** A night as a tally at level 3: `3 × 5, 2 × 9`: the fires for each size, in the order the sizes first ran. */
function tally(steps: readonly number[]): string {
  const order: number[] = []
  const counts = new Map<number, number>()
  for (const step of steps) {
    if (!counts.has(step)) order.push(step)
    counts.set(step, (counts.get(step) ?? 0) + 1)
  }
  return order.map((step) => `${counts.get(step)} × ${step}`).join(', ')
}

const stepsText = (steps: readonly number[], level: Level) => code(level === 3 ? tally(steps) : steps.join(', '))

function paddedSteps(scene: PaddedScene, level: Level): Step[] {
  const padded = paddingModel.padded(scene.sizes, scene.tokens) ?? scene.tokens
  const rows = scene.tokens - scene.chunk
  const find = rich('The smallest captured size that holds ', given(scene.tokens, 'tokens'), ' is ', derived(padded, 'tokens'), ': the step is padded up to it.')
  if (level === 3) {
    return [
      { text: rich('The step carries its decode rows and its prompt chunk: ', given(rows, 'rows'), ' + ', given(scene.chunk, 'tokens'), ' = ', derived(scene.tokens, 'tokens'), '.'), result: derived(scene.tokens, 'tokens') },
      { text: find, result: derived(padded, 'tokens') },
    ]
  }
  return [
    { text: rich('A step replays the graph of the smallest captured size that holds it, so it is padded up to that size.') },
    { text: find, result: derived(padded, 'tokens') },
  ]
}

function nightSteps(scene: NightScene, level: Level): Step[] {
  const parts: Step[] = []
  if (level === 3) parts.push({ text: rich('The tally lists a size and how many fires ran at it: ', derived(scene.steps.length, 'fires'), ' in all.') })
  parts.push({ text: rich('Each step is padded up to the smallest captured size that holds it, and wastes the difference.') })
  const rows = scene.steps.map((tokens) => {
    const padded = paddingModel.padded(scene.sizes, tokens) ?? tokens
    return `${tokens} → ${padded}`
  })
  const waste = paddingModel.night(scene.sizes, scene.steps).waste
  parts.push({
    text: rich('The steps pad as ', code(rows.join(', ')), ', so the night wastes ', derived(waste, 'tokens'), ' in all.'),
    result: derived(waste, 'tokens'),
  })
  return parts
}

const LETTERS = ['a', 'b', 'c', 'd'] as const

function chooseSteps(scene: ChooseScene): Step[] {
  const entries = scored(scene)
  const largest = Math.max(...scene.steps)
  const lines = entries.map((entry, at) => {
    const name = LETTERS[at]
    return entry.uncaptured > 0 ? `${name}: ${entry.uncaptured} left uncaptured` : `${name}: ${entry.waste} wasted`
  })
  const key = entries[scene.key]
  return [
    { text: rich('Every step must be held by some size, and the biggest step carries ', given(largest, 'tokens'), ', so a list whose largest size is under it launches that step kernel by kernel.') },
    { text: rich('Counting each step\'s padding for each list gives ', code(lines.join('; ')), '.') },
    { text: rich('The list that holds every step and wastes the fewest tokens is ', code(LETTERS[scene.key]), ', at ', derived(key.waste, 'tokens'), '.') },
  ]
}

function stepsOf(item: Pick<Item, 'variant' | 'level' | 'params'>): Step[] {
  const scene = sceneOf(item)
  if (scene.variant === 'padded-size') return paddedSteps(scene, item.level)
  if (scene.variant === 'night-waste') return nightSteps(scene, item.level)
  return chooseSteps(scene)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Grading                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

const near = (value: number, target: number): boolean => target > 0 && isAbout(value, target)

const RULES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOf(item)
    if (scene.variant === 'padded-size') {
      const padded = paddingModel.padded(scene.sizes, scene.tokens) ?? scene.tokens
      const lower = [...scene.sizes].reverse().find((size) => size < scene.tokens)
      if (value === scene.tokens) return { id: `${FAMILY}.no-padding`, message: rich('That is the step itself. A graph is captured for a size, so the step is padded up to one.') }
      if (value === padded - scene.tokens) return { id: `${FAMILY}.waste-for-size`, message: rich('That is the waste, the tokens computed for nothing. The size is the step plus its waste.') }
      if (lower !== undefined && value === lower) return { id: `${FAMILY}.rounds-down`, message: rich('That is the captured size below the step, which cannot hold it. A step is padded up, never down.') }
      if (value === nextPowerOfTwo(scene.tokens) || value === nextMultipleOfEight(scene.tokens)) {
        return { id: `${FAMILY}.rule-of-thumb`, message: rich('That rounds the step by a rule of thumb. The sizes that were captured are the ones listed, and a step pads up to the next of them.') }
      }
      return null
    }
    if (scene.variant === 'night-waste') {
      const { steps, sizes } = scene
      const padded = steps.map((tokens) => paddingModel.padded(sizes, tokens) ?? tokens)
      const total = padded.reduce((sum, size) => sum + size, 0)
      const one = padded[0] - steps[0]
      if (near(value, total)) return { id: `${FAMILY}.padded-total`, message: rich('That is the tokens the night computes, padding included. The waste is only what is computed for nothing: the padded total less the steps.') }
      if (near(value, one)) return { id: `${FAMILY}.first-step-only`, message: rich('That is the waste of the first step. Every step of the night pads, and the night wastes them all.') }
      if (value === 0) return { id: `${FAMILY}.no-waste`, message: rich('A step that no size holds exactly wastes the difference. The night is not free.') }
      return null
    }
    return null
  },
]

/** Habits of the family's own: the rules of thumb for the padded size, and, for the choice, the list with the biggest top size. */
const BLIND: readonly BlindStrategy[] = [
  {
    id: 'next-power-of-two',
    describe: 'the step rounded up to a power of two',
    answers: (item): readonly Response[] | null => {
      if (item.variant !== 'padded-size') return null
      const tokens = Number(item.params.tokens)
      return [{ kind: 'numeric', value: nextPowerOfTwo(tokens) }]
    },
  },
  {
    id: 'next-multiple-of-eight',
    describe: 'the step rounded up to a multiple of eight',
    answers: (item): readonly Response[] | null => (item.variant === 'padded-size' ? [{ kind: 'numeric', value: nextMultipleOfEight(Number(item.params.tokens)) }] : null),
  },
  {
    id: 'biggest-top-size',
    describe: 'the list with the largest top size',
    answers: (item): readonly Response[] | null => {
      if (item.variant !== 'choose-sizes' || item.answer.kind !== 'choice') return null
      const scene = sceneOf(item)
      const tops = scene.variant === 'choose-sizes' ? scene.lists.map((list) => list[list.length - 1]) : []
      const best = Math.max(...tops)
      return item.answer.options.filter((_, at) => tops[at] === best).map((option): Response => ({ kind: 'choice', pick: option.id }))
    },
  },
  {
    id: 'fewest-wasting-sizes',
    describe: 'the list with the smallest sizes',
    answers: (item): readonly Response[] | null => {
      if (item.variant !== 'choose-sizes' || item.answer.kind !== 'choice') return null
      const scene = sceneOf(item)
      const sums = scene.variant === 'choose-sizes' ? scene.lists.map((list) => list.reduce((sum, size) => sum + size, 0)) : []
      const least = Math.min(...sums)
      return item.answer.options.filter((_, at) => sums[at] === least).map((option): Response => ({ kind: 'choice', pick: option.id }))
    },
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* Making an item                                                                                                     */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The key of a numeric answer is exact: these are counts of tokens (ASSESSMENT §4.2: exact for integers). */
const EXACT = {} as const

/** Level 0 shows a whole solution with other numbers, level 1 the words of the first step, and the rest nothing. */
function workedFor(scene: Scene, level: Level, seed: Seed): Step[] {
  const solve = (s: Scene): Step[] => (s.variant === 'padded-size' ? paddedSteps(s, level) : s.variant === 'night-waste' ? nightSteps(s, level) : chooseSteps(s))
  if (level === 1) return [{ text: solve(scene)[0].text }]
  if (level !== 0) return []
  const key = (s: Scene): string =>
    s.variant === 'padded-size' ? String(paddingModel.padded(s.sizes, s.tokens)) : s.variant === 'night-waste' ? String(paddingModel.night(s.sizes, s.steps).waste) : String(s.key)
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const example = drawScene(scene.variant, level, seed, `example-${attempt}`)
    if (isFair(example) && key(example) !== key(scene)) return solve(example)
  }
  return []
}

function build(spec: VariantSpec, scene: Scene, level: Level, seed: Seed): Item {
  const gen = { id: FAMILY, version: VERSION }
  const base = { variant: spec.id, level, seed, kcs: spec.kcs, params: paramsOf(scene) }
  if (scene.variant === 'padded-size') {
    const padded = paddingModel.padded(scene.sizes, scene.tokens) ?? scene.tokens
    const rows = scene.tokens - scene.chunk
    const stepGivens: Given[] = level === 3 ? [{ label: 'decode rows', value: given(rows, 'rows') }, { label: 'prompt chunk', value: given(scene.chunk, 'tokens') }] : [{ label: 'tokens in the step', value: given(scene.tokens, 'tokens') }]
    return finishItem(gen, {
      ...base,
      stem:
        level === 3
          ? rich('An engine captured graphs at the sizes listed. A step runs the decode rows given and adds a prompt chunk, each row one token. What size is it padded to?')
          : rich('An engine captured graphs at the sizes listed. A step carries the tokens given, and every size is held by the graph of that size. What size is the step padded to?'),
      givens: [{ label: 'captured sizes', value: listText(scene.sizes) }, ...stepGivens],
      worked: workedFor(scene, level, seed),
      answer: { kind: 'numeric', label: 'padded size', unit: 'tokens', truth: padded, tolerance: EXACT },
    })
  }
  if (scene.variant === 'night-waste') {
    const { waste } = paddingModel.night(scene.sizes, scene.steps)
    return finishItem(gen, {
      ...base,
      stem:
        level === 3
          ? rich('An engine captured graphs at the sizes listed, and each step replays the graph of the smallest size that holds it. The night is a tally of its fires and their tokens. How many tokens does the night compute for nothing?')
          : rich('An engine captured graphs at the sizes listed, and each step replays the graph of the smallest size that holds it. How many tokens does the night of six steps compute for nothing?'),
      givens: [{ label: 'captured sizes', value: listText(scene.sizes) }, { label: level === 3 ? 'the night, fires × tokens' : 'tokens in each step of the night', value: stepsText(scene.steps, level) }],
      worked: workedFor(scene, level, seed),
      answer: { kind: 'numeric', label: 'tokens wasted', unit: 'tokens', truth: waste, tolerance: EXACT },
    })
  }
  const entries = scored(scene)
  const options: ChoiceOption[] = entries.map((entry, at) => {
    const largest = Math.max(...scene.steps)
    const isKey = at === scene.key
    const why: Rich = isKey
      ? rich('Every step is held, and the night wastes ', derived(entry.waste, 'tokens'), ', fewer than any other list that holds them all.')
      : entry.uncaptured > 0
        ? rich('Its largest size is under the biggest step, ', given(largest, 'tokens'), ', so ', derived(entry.uncaptured, 'steps'), ' would be launched kernel by kernel. The padding it counts is only on the steps it holds.')
        : rich('Every step is held, but the night wastes ', derived(entry.waste, 'tokens'), ', more than the best list.')
    return {
      id: LETTERS[at],
      text: rich('Capture ', alignedText(entry.list)),
      why,
      ...(isKey ? {} : { miss: entry.uncaptured > 0 ? `${FAMILY}.leaves-a-step-uncaptured` : `${FAMILY}.wastes-more` }),
    }
  })
  return finishItem(gen, {
    ...base,
    stem:
      level === 3
        ? rich('An engine may capture ', given(scene.molds, 'graphs'), '. The night is a tally of its fires and their tokens. Which list holds every step and wastes the fewest padded tokens?')
        : rich('An engine may capture ', given(scene.molds, 'graphs'), '. Which list of sizes holds every step of the night and wastes the fewest padded tokens?'),
    givens: [{ label: level === 3 ? 'the night, fires × tokens' : 'tokens in each step of the night', value: stepsText(scene.steps, level) }],
    worked: [],
    answer: { kind: 'choice', label: 'the list to capture', options, correct: LETTERS[scene.key] },
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

/** The stream a scene is drawn from. A change of its name re-draws every scene, and the golden vectors follow. */
const SCENE = 'scene-e'

export const paddingWaste: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'Padding waste',
  kcs: [KC],
  variants: VARIANTS,
  make(seed, level, variant) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level, variant)
    if (!isVariant(spec.id)) throw new RangeError(`${FAMILY} has no variant "${spec.id}"`)
    return build(spec, drawScene(spec.id, level, seed, SCENE), level, seed)
  },
  band(seed, level) {
    const spec = resolveVariant(FAMILY_SHAPE, seed, level)
    return isVariant(spec.id) && isFair(drawScene(spec.id, level, seed, SCENE))
  },
  grade(item, response) {
    return item.answer.kind === 'choice' ? gradeChoice(item, response) : gradeNumeric(item, response, RULES)
  },
  solution: (item) => stepsOf(item),
  blind: BLIND,
}
