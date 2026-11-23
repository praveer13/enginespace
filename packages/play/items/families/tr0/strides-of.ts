/**
 * `tr0.strides-of`: the stride of one dimension of a tensor after a view operation (TR0; KCs `tr0.tensor-metadata` and, for the expand
 * variant, `tr0.broadcast-stride-zero`). It is TR0's Keep family for the metadata of a tensor, and every question in it is numeric.
 *
 *   after-op    a contiguous tensor of rank 2 or 3 goes through a slice with a step, a transpose or a permute (two of them at level 3), and
 *               the question is one dimension's stride. The key is `strides[d]` of the last view of the `tensor` model.
 *   expand      a tensor with a dimension of size one is expanded, and may then be sliced or transposed. The expanded dimension's stride is 0
 *               (claim torch.expand.stride-zero), and the question asks for it one time in ten and otherwise for a dimension that keeps a
 *               stride, so that "always 0" is not a habit that passes.
 *   attention   the reshapes of an attention layer: [tokens, heads times head size] by `view` to [tokens, heads, head size], then
 *               `transpose(0, 1)`, and at level 3 `contiguous()` as the kernel wants it.
 *
 * The keys are held to `@es/sim/tensor`, which tests/fixtures/tensor/torch-vectors.json holds to torch 2.14.0, in
 * tests/play/items-strides-of.test.ts, which reads them again from the lines each ticket prints.
 */
import { below, between } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { contiguousStrides } from '@es/sim/tensor'
import type { ShiftOp } from '@es/sim/tensor'
import { finishItem, itemRng, resolveVariant } from '../../draw'
import { gradeNumeric } from '../../grade'
import type { DiagnosisRule } from '../../grade'
import { code, num, rich } from '../../rich'
import type { Gen, Given, Item, Level, Step, VariantSpec } from '../../types'
import { derived, ELEMENTS, EXACT, oneOf, opsFromString, opsToString, sceneLines, shapeFromString, trace, tupleText, workedPart } from './kit'

const FAMILY = 'tr0.strides-of'
const VERSION = 1

const META = 'tr0.tensor-metadata'
const ZERO = 'tr0.broadcast-stride-zero'

const VARIANTS: readonly VariantSpec[] = [
  { id: 'after-op', title: 'The stride of a dimension after a view', kcs: [META], levels: [0, 1, 2, 3] },
  { id: 'expand', title: 'The stride of a dimension after an expand', kcs: [META, ZERO], levels: [0, 1, 2, 3] },
  { id: 'attention', title: "The strides of an attention layer's reshapes", kcs: [META], levels: [2, 3] },
]

type VariantId = 'after-op' | 'expand' | 'attention'
const isVariant = (id: string): id is VariantId => VARIANTS.some((variant) => variant.id === id)

/** A scene: a contiguous start, the operations applied in turn, and the dimension asked for. */
export interface Scene {
  readonly start: readonly number[]
  readonly ops: readonly ShiftOp[]
  readonly dim: number
}

/** The stride of dimension `scene.dim` after the scene's operations, from the `tensor` model. */
export function strideOf(scene: Scene): number {
  const run = trace(scene.start, scene.ops)
  if (run === null) throw new RangeError(`${FAMILY}: the scene is not valid`)
  return run.views[run.views.length - 1].strides[scene.dim]
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Drawing a scene                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

const sliceOp = (dim: number, size: number, step: number): ShiftOp => ({ op: 'slice', dim, start: 0, stop: size, step })

/** A permutation of `rank` dims that moves at least one dim. */
function permutation(rng: Rng, rank: number): number[] {
  for (;;) {
    const order = Array.from({ length: rank }, (_, at) => at)
    for (let at = rank - 1; at > 0; at -= 1) {
      const other = below(rng, at + 1)
      ;[order[at], order[other]] = [order[other], order[at]]
    }
    if (order.some((d, at) => d !== at)) return order
  }
}

/** One view operation on a tensor of this shape: a slice with a step, a transpose or (at rank 3) a permute. */
function viewOp(rng: Rng, shape: readonly number[]): ShiftOp {
  const rank = shape.length
  const kind = below(rng, rank === 2 ? 3 : 4)
  if (kind === 0 || kind === 1) {
    const dim = below(rng, rank)
    return sliceOp(dim, shape[dim], between(rng, 2, 3))
  }
  if (kind === 2) {
    const a = below(rng, rank)
    return { op: 'transpose', a, b: (a + 1 + below(rng, rank - 1)) % rank }
  }
  return { op: 'permute', order: permutation(rng, rank) }
}

/** The dimension to ask for: one whose stride is neither 1 nor 0 and whose size is more than one (a stride along a dimension of size one reads no element), so that no one number is the habit. */
function askDim(rng: Rng, shape: readonly number[], strides: readonly number[], allowZero: boolean): number {
  const wanted = strides.flatMap((s, at) => (s > 1 && shape[at] > 1 ? [at] : []))
  const fallback = strides.flatMap((s, at) => (shape[at] > 1 && (allowZero || s !== 0) ? [at] : []))
  return oneOf(rng, wanted.length > 0 ? wanted : fallback.length > 0 ? fallback : strides.map((_, at) => at))
}

export function drawScene(variant: VariantId, level: Level, seed: number, purpose: string): Scene {
  const rng = itemRng(FAMILY, variant, level, seed, purpose)
  if (variant === 'attention') {
    const tokens = between(rng, 2, 9)
    const heads = oneOf(rng, [2, 3, 4, 5, 6, 8])
    const head = oneOf(rng, [4, 5, 6, 7, 8, 10, 12])
    const ops: ShiftOp[] = [
      { op: 'view', shape: [tokens, heads, head] },
      { op: 'transpose', a: 0, b: 1 },
      ...(level === 3 ? [{ op: 'contiguous' } as const] : []),
    ]
    const run = trace([tokens, heads * head], ops)
    if (run === null) throw new RangeError(`${FAMILY}: the attention scene is not valid`)
    const last = run.views[run.views.length - 1]
    return { start: [tokens, heads * head], ops, dim: askDim(rng, last.shape, last.strides, false) }
  }
  if (variant === 'expand') {
    const m = between(rng, 2, 9)
    const n = between(rng, 3, 16)
    const k = between(rng, 2, 6)
    const start = [m, 1, n]
    const ops: ShiftOp[] = [{ op: 'expand', shape: [m, k, n] }]
    if (level >= 2) ops.push(below(rng, 2) === 0 ? sliceOp(0, m, between(rng, 2, 3)) : { op: 'transpose', a: 0, b: 2 })
    const run = trace(start, ops)
    if (run === null) throw new RangeError(`${FAMILY}: the expand scene is not valid`)
    const { shape, strides } = run.views[run.views.length - 1]
    // The question is about the expanded dimension one time in ten (its stride is 0), and otherwise about a dimension that has a stride.
    const dim = below(rng, 10) === 0 ? strides.findIndex((s, at) => s === 0 && shape[at] > 1) : askDim(rng, shape, strides, false)
    return { start, ops, dim: dim < 0 ? askDim(rng, shape, strides, true) : dim }
  }
  const rank = level <= 1 ? 2 : 3
  const start = Array.from({ length: rank }, () => between(rng, 3, 12))
  const ops: ShiftOp[] = []
  let shape: readonly number[] = start
  for (let at = 0; at < (level === 3 ? 2 : 1); at += 1) {
    const o = viewOp(rng, shape)
    const run = trace(start, [...ops, o])
    if (run === null) throw new RangeError(`${FAMILY}: the scene is not valid`)
    ops.push(o)
    shape = run.views[run.views.length - 1].shape
  }
  const run = trace(start, ops)
  if (run === null) throw new RangeError(`${FAMILY}: the scene is not valid`)
  const last = run.views[run.views.length - 1]
  return { start, ops, dim: askDim(rng, last.shape, last.strides, false) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

const NAME_AT = (at: number): string => 'abcde'[at]

function givensOf(scene: Scene): Given[] {
  return sceneLines(scene.start, scene.ops).map((line, at) => ({ label: `line ${at + 1}`, value: code(line) }))
}

function stemOf(scene: Scene, variant: VariantId): Item['stem'] {
  const last = NAME_AT(scene.ops.length)
  const made = rich('A tensor of shape ', code(tupleText(scene.start)))
  const ask = code(`${last}.stride(${scene.dim})`)
  return variant === 'expand'
    ? rich(...made, ' is made and then expanded by the lines below. What does ', ask, ' return? A stride is counted in elements.')
    : rich(...made, ' is made and then changed by the lines below. What does ', ask, ' return? A stride is counted in elements.')
}

export function stepsOf(scene: Scene): Step[] {
  const run = trace(scene.start, scene.ops)
  if (run === null) throw new RangeError(`${FAMILY}: the scene is not valid`)
  const lines = sceneLines(scene.start, scene.ops)
  const out: Step[] = [{ text: rich('A new tensor is contiguous: the stride of each dimension is the number of elements in all the dimensions after it, so ', code(`a.stride()`), ' is ', code(tupleText(run.views[0].strides)), '.') }]
  scene.ops.forEach((o, at) => {
    const after = run.views[at + 1]
    const why =
      o.op === 'transpose' || o.op === 'permute'
        ? 'A transpose or a permute reorders the shape and the strides together and moves no element.'
        : o.op === 'expand'
          ? 'An expand gives the dimension that grows a stride of zero, so that every index along it reads the same elements, and moves no element.'
          : o.op === 'slice'
            ? 'A slice with a step multiplies the stride of its dimension by the step and moves no element.'
            : o.op === 'view'
              ? 'A view splits a dimension into new ones whose strides are the sizes after them, and moves no element.'
              : 'A contiguous call copies into a new buffer, so the strides are those of a contiguous tensor of this shape.'
    out.push({ text: rich(why, ' After ', code(lines[at + 1]), ' the shape is ', code(tupleText(after.shape)), ' and the strides are ', code(tupleText(after.strides)), '.') })
  })
  const key = strideOf(scene)
  out.push(keyStep(key))
  return out
}

function keyStep(key: number): Step {
  return { text: rich('The stride of the dimension asked for is the entry of that tuple at its place: '), result: derived(key, ELEMENTS) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Diagnoses                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

function sceneOfItem(item: Pick<Item, 'params'>): Scene {
  const { start, ops, dim } = item.params
  if (typeof start !== 'string' || typeof ops !== 'string' || typeof dim !== 'number') throw new TypeError(`${FAMILY}: the params are not a scene`)
  return { start: shapeFromString(start), ops: opsFromString(ops), dim }
}

const DIAGNOSES: readonly DiagnosisRule[] = [
  (item, value) => {
    const scene = sceneOfItem(item)
    const run = trace(scene.start, scene.ops)
    if (run === null) return null
    const last = run.views[run.views.length - 1]
    if (scene.ops.some((o) => o.op === 'expand') && value === contiguousStrides(last.shape)[scene.dim]) {
      return { id: `${FAMILY}.expand-copied`, message: rich('That is the stride a contiguous tensor of this shape would have. An expand copies nothing: the dimension that grew has a stride of zero, and the others keep theirs.') }
    }
    return null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const run = trace(scene.start, scene.ops)
    if (run === null) return null
    const strides = run.views[run.views.length - 1].strides
    const other = strides.findIndex((s, at) => at !== scene.dim && s === value)
    if (other < 0) return null
    // The reminder names the calls this question has: a transpose and a permute reorder the strides, an expand gives a stride of zero, a slice scales one.
    const reorders = scene.ops.some((o) => o.op === 'transpose' || o.op === 'permute')
    const expands = scene.ops.some((o) => o.op === 'expand')
    const reminder = reorders
      ? 'A transpose or a permute moves the strides together with the sizes.'
      : expands
        ? 'An expand gives only the dimension that grew a stride of zero, and the other dimensions keep the strides they had.'
        : 'Each dimension has a stride of its own: read the one the question names.'
    return { id: `${FAMILY}.other-dimension`, message: rich('That is the stride of dimension ', num(other, { tag: 'derived' }), ', not of the one asked for. ', reminder) }
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const run = trace(scene.start, scene.ops)
    if (run === null) return null
    const before = run.views[0].strides
    return scene.dim < before.length && value === before[scene.dim] ? { id: `${FAMILY}.unchanged`, message: rich('That is the stride this dimension had before the lines changed it. A view changes the strides and leaves the buffer where it is.') } : null
  },
  (item, value) => {
    const scene = sceneOfItem(item)
    const run = trace(scene.start, scene.ops)
    if (run === null) return null
    const size = run.views[run.views.length - 1].shape[scene.dim]
    return value === size ? { id: `${FAMILY}.size-for-stride`, message: rich('That is the size of the dimension, not its stride. The stride is how far in the buffer one step along it moves.') } : null
  },
]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The family                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

function build(spec: VariantSpec, level: Level, seed: number): Item {
  const variant = spec.id as VariantId
  const scene = drawScene(variant, level, seed, 'scene')
  const key = strideOf(scene)
  const own = stepsOf(scene)
  return finishItem(
    { id: FAMILY, version: VERSION },
    {
      variant: spec.id,
      level,
      seed,
      kcs: spec.kcs,
      params: { start: scene.start.join(','), ops: opsToString(scene.ops, scene.start), dim: scene.dim },
      stem: stemOf(scene, variant),
      givens: givensOf(scene),
      worked: workedPart(level, own, (attempt) => {
        const example = drawScene(variant, level, seed, `example-${attempt}`)
        return strideOf(example) === key ? null : stepsOf(example)
      }),
      answer: { kind: 'numeric', label: 'the stride', unit: ELEMENTS, truth: key, tolerance: EXACT },
    },
  )
}

const FAMILY_SHAPE = { id: FAMILY, variants: VARIANTS } as const

export const stridesOf: Gen = {
  id: FAMILY,
  version: VERSION,
  title: 'The strides of a view',
  kcs: [META, ZERO],
  variants: VARIANTS,
  make(seed, level, variant) {
    return build(resolveVariant(FAMILY_SHAPE, seed, level, variant), level, seed)
  },
  // Every seed makes a fair question: the dimension asked for is chosen so that its stride is rarely 1 or 0.
  band: () => true,
  grade: (item, response) => gradeNumeric(item, response, DIAGNOSES),
  solution(item) {
    if (!isVariant(item.variant)) throw new RangeError(`${FAMILY} has no variant "${item.variant}"`)
    return stepsOf(sceneOfItem(item))
  },
}
