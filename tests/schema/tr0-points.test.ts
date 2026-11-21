/*
 * W2b-T48's artifact: `enginespace/tr0-points@1`, the shape, strides and dtype of five tensors of a learner's forward pass (the TR0 lab, stages 2 and 3).
 *
 *   - The points that the reference solution recorded on a small random-weight model (labs/grader/tests/synthetic/tr0-forward/) are valid, and the grader's own suite
 *     reads the same files (labs/grader/tests/test_tr0_forward.py), so the zod schema and the JSON Schema exported from it judge one recorded run alike.
 *   - The rules that JSON Schema cannot say (the order of the five, a stride for each dimension, the call that each stage records) are the zod schema's.
 *   - The names of the five points are the ones the grader hooks (the Python test holds the two lists together).
 */
import { describe, expect, test } from 'bun:test'
import { TR0_POINT_NAMES, TR0_POINTS_SCHEMA_TAG, tr0PointsSchema } from '@es/schema/bundle'
import { z } from '@es/schema/zod'
import { problems, read } from './support'

type Artifact = { schema: string; stage: string; call: string; points: Record<string, unknown>[] }

function recorded(stage: 2 | 3): Artifact {
  const result = JSON.parse(read(`labs/grader/tests/synthetic/tr0-forward/stage${stage}.json`)) as { artifacts: { id: string; data: Artifact }[] }
  const found = result.artifacts.find((artifact) => artifact.id === 'points')
  if (found === undefined) throw new Error(`stage ${stage} of the recorded run has no points artifact`)
  return structuredClone(found.data)
}

const accepts = (value: unknown) => tr0PointsSchema.safeParse(value).success

describe('the five points', () => {
  test('are named in the order the grader hooks them, and the tag is the format of the receipt entry', () => {
    expect(TR0_POINT_NAMES).toEqual(['embedding', 'attention', 'mlp', 'final-norm', 'logits'])
    expect(TR0_POINTS_SCHEMA_TAG).toBe('enginespace/tr0-points@1')
    expect(recorded(2).schema).toBe(TR0_POINTS_SCHEMA_TAG)
  })

  test('of both recorded stages are valid, and the logits come last with the vocabulary as the last dimension', () => {
    for (const stage of [2, 3] as const) {
      const artifact = recorded(stage)
      expect(problems(tr0PointsSchema, artifact)).toEqual([])
      expect(artifact.points.map((point) => point.name)).toEqual([...TR0_POINT_NAMES])
      expect((artifact.points[4]!.shape as number[]).at(-1)).toBe(512)
    }
  })

  test('are the whole prompt for stage 2 and the last decode step for stage 3', () => {
    const two = recorded(2)
    expect(two.call).toBe('prompt')
    expect(accepts({ ...two, call: 'decode-step' })).toBe(false)
    const three = recorded(3)
    expect(three.call).toBe('decode-step')
    expect(accepts({ ...three, call: 'prompt' })).toBe(false)
    expect(accepts({ ...three, stage: 'tr0.forward.s1' })).toBe(false)
  })

  test('refuse a point out of order, a missing one, a stride for each dimension that is not there and a key that is not named', () => {
    const swapped = recorded(2)
    ;[swapped.points[0], swapped.points[1]] = [swapped.points[1]!, swapped.points[0]!]
    expect(accepts(swapped)).toBe(false)
    const short = recorded(2)
    short.points.pop()
    expect(accepts(short)).toBe(false)
    const strides = recorded(2)
    strides.points[0]!.strides = [1, 1]
    expect(accepts(strides)).toBe(false)
    const extra = recorded(2)
    ;(extra as Record<string, unknown>).device = 'cpu'
    expect(accepts(extra)).toBe(false)
    const inner = recorded(2)
    inner.points[2]!.device = 'cpu'
    expect(accepts(inner)).toBe(false)
  })

  test('may be not found, with no shape, and refuse a not-found point that has one', () => {
    const artifact = recorded(2)
    artifact.points[3] = { name: 'final-norm', found: false }
    expect(accepts(artifact)).toBe(true)
    artifact.points[3] = { name: 'final-norm', found: false, shape: [1] }
    expect(accepts(artifact)).toBe(false)
  })

  test('hold the limits at the edge: eight dimensions, a dtype from the list, and no negative size or stride', () => {
    const eight = recorded(2)
    eight.points[0] = { name: 'embedding', found: true, shape: Array(8).fill(2), strides: Array(8).fill(1), dtype: 'float32' }
    expect(accepts(eight)).toBe(true)
    eight.points[0] = { name: 'embedding', found: true, shape: Array(9).fill(2), strides: Array(9).fill(1), dtype: 'float32' }
    expect(accepts(eight)).toBe(false)
    for (const bad of [{ dtype: 'float8' }, { shape: [-1, 2], strides: [2, 1] }, { shape: [2, 2], strides: [-2, 1] }, { shape: [2.5], strides: [1] }]) {
      const artifact = recorded(2)
      Object.assign(artifact.points[0]!, bad)
      expect(accepts(artifact)).toBe(false)
    }
  })

  test('export as one JSON Schema that closes every object', () => {
    const exported = JSON.stringify(z.toJSONSchema(tr0PointsSchema, { io: 'input', target: 'draft-2020-12' }))
    expect(exported).toContain('"additionalProperties":false')
    expect(exported).toContain('enginespace/tr0-points@1')
  })
})
