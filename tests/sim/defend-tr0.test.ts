/*
 * W2b-T50: TR0's questions for "Defend your receipt" (packages/sim/defend/tr0.ts; ASSESSMENT §7.2). Seeded questions that only the receipt's five recorded
 * points answer: the whole shape or the whole strides of the tensor at one point. Two bundles with different recorded points give different keys for one
 * seed; the draw is the seed's alone; the computation is worked from the record. The points, their modules and the calls are held to the grader's own
 * source, so the words of a question name what the grader recorded.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { TR0_POINT_NAMES } from '@es/schema/bundle'
import {
  DEFEND_QUESTIONS,
  markDefence,
  parseTuple,
  TR0_CALLS,
  TR0_MODULES,
  TR0_POINTS,
  tr0Questions,
  working,
  type FoundPoint,
  type RecordedPoint,
} from '@es/sim/defend/tr0'
import { recordedPoints } from '../receipts/defend-support'

const GRADER = path.join(import.meta.dirname, '../../labs/grader/src/enginespace_grader/labs')
const pointsOf = (stage: 'tr0.forward.s2' | 'tr0.forward.s3'): RecordedPoint[] => recordedPoints(stage).points as RecordedPoint[]

/** A run like stage 2's, but on a model with a hidden size of 1024 and a vocabulary of 151,936: every point's last size and the strides before it differ. */
function wider(points: readonly RecordedPoint[]): RecordedPoint[] {
  return points.map((point) => {
    if (!point.found) return point
    const last = point.name === 'logits' ? 151_936 : 1024
    const shape = [...point.shape.slice(0, -1), last]
    return { ...point, shape, strides: working({ ...point, shape, strides: shape.map(() => 0) }).contiguous.map((step) => step.stride) }
  })
}

const SEEDS = Array.from({ length: 400 }, (_, at) => (at * 2_654_435_761) >>> 0)

describe('the points and the calls are the grader\'s', () => {
  test('five points, in the artifact\'s order, each read from the module the grader hooks', () => {
    expect([...TR0_POINTS]).toEqual([...TR0_POINT_NAMES])
    const worker = readFileSync(path.join(GRADER, 'tr0_forward_worker.py'), 'utf8')
    const block = /POINTS = \(([\s\S]*?)\n\)/.exec(worker)?.[1] ?? ''
    const pairs = [...block.matchAll(/\("([a-z-]+)", "([a-z0-9_.]+)"\)/g)].map((m) => [m[1], m[2]])
    expect(pairs).toEqual(TR0_POINTS.map((name) => [name, TR0_MODULES[name]]))
  })

  test('stage 2 is one call on the 8 prompts of 24 ids, and stage 3 records the last of its decode steps', () => {
    const lab = readFileSync(path.join(GRADER, 'tr0_forward.py'), 'utf8')
    const constant = (name: string): number => Number(new RegExp(`^${name} = (\\d+)$`, 'm').exec(lab)?.[1])
    expect(TR0_CALLS['tr0.forward.s2']).toEqual({ call: 'prompt', ids: [constant('POOL_PROMPTS'), constant('POOL_LENGTH')], cached: 0 })
    // The last step feeds the last of DECODE_STEPS ids, after the prefix and the ids before it are in the cache.
    expect(TR0_CALLS['tr0.forward.s3']).toEqual({ call: 'decode-step', ids: [1, 1], cached: constant('PREFIX_LENGTH') + constant('DECODE_STEPS') - 1 })
    expect(recordedPoints('tr0.forward.s2').call).toBe('prompt')
    expect(recordedPoints('tr0.forward.s3').call).toBe('decode-step')
  })
})

describe('the questions of an attempt', () => {
  test('two bundles with different recorded points give different keys for one seed', () => {
    const s2 = pointsOf('tr0.forward.s2')
    const s3 = pointsOf('tr0.forward.s3')
    const big = wider(s2)
    for (const seed of SEEDS) {
      const keys = (points: readonly RecordedPoint[]) => tr0Questions(points, seed).map((question) => question.key)
      expect(keys(s2), `seed ${seed}`).not.toEqual(keys(s3))
      expect(keys(s2), `seed ${seed}`).not.toEqual(keys(big))
      // The same points ask about the same places on a seed: only the keys moved.
      expect(tr0Questions(s2, seed).map((question) => question.id)).toEqual(tr0Questions(big, seed).map((question) => question.id))
    }
  })

  test('each key is what the run recorded at the point the question names', () => {
    const points = pointsOf('tr0.forward.s2')
    for (const seed of SEEDS.slice(0, 50)) {
      for (const question of tr0Questions(points, seed)) {
        const point = points.find((candidate) => candidate.name === question.point) as FoundPoint
        expect(question.key).toEqual(question.asks === 'shape' ? point.shape : point.strides)
        expect(question.id).toBe(`${question.point}/${question.asks}`)
      }
    }
  })

  test('the draw is the seed\'s alone: the same seed asks the same, and the seeds between them ask about every point and both kinds', () => {
    const points = pointsOf('tr0.forward.s3')
    expect(tr0Questions(points, 7)).toEqual(tr0Questions(points, 7))
    const asked = new Set<string>()
    const sets = new Set<string>()
    for (const seed of SEEDS) {
      const questions = tr0Questions(points, seed)
      sets.add(questions.map((question) => question.id).join(' '))
      for (const question of questions) asked.add(question.id)
    }
    expect(asked.size).toBe(TR0_POINTS.length * 2)
    expect(sets.size).toBeGreaterThan(20)
  })

  test(`asks ${DEFEND_QUESTIONS} questions about ${DEFEND_QUESTIONS} points, with a shape and a set of strides among them`, () => {
    const points = pointsOf('tr0.forward.s2')
    for (const seed of SEEDS) {
      const questions = tr0Questions(points, seed)
      expect(questions).toHaveLength(DEFEND_QUESTIONS)
      expect(new Set(questions.map((question) => question.point)).size).toBe(DEFEND_QUESTIONS)
      expect(new Set(questions.map((question) => question.asks))).toEqual(new Set(['shape', 'strides']))
    }
  })

  test('never asks about a point the model had no module for, and asks both of a lone point', () => {
    const points = pointsOf('tr0.forward.s2')
    const onlyMlp = points.map((point): RecordedPoint => (point.name === 'mlp' ? point : { name: point.name, found: false }))
    for (const seed of SEEDS.slice(0, 40)) {
      const questions = tr0Questions(onlyMlp, seed)
      expect(questions.map((question) => question.id).sort()).toEqual(['mlp/shape', 'mlp/strides'])
      const two = points.map((point): RecordedPoint => (point.name === 'mlp' || point.name === 'logits' ? point : { name: point.name, found: false }))
      const asked = tr0Questions(two, seed)
      expect(asked).toHaveLength(3)
      expect(new Set(asked.map((question) => question.id)).size).toBe(3)
    }
    expect(tr0Questions(points.map((point) => ({ name: point.name, found: false }) as RecordedPoint), 1)).toEqual([])
  })
})

describe('an answer', () => {
  test('reads a list of whole numbers however it is written', () => {
    for (const text of ['8, 24, 64', '(8, 24, 64)', '[8,24,64]', '8 24 64', '8 x 24 x 64', '8×24×64', 'torch.Size([8, 24, 64])', ' 8 ,24, 64 ']) {
      expect(parseTuple(text), text).toEqual([8, 24, 64])
    }
    expect(parseTuple('1536')).toEqual([1536])
    expect(parseTuple('(1536,)')).toEqual([1536])
  })

  test('is unreadable when it is empty, holds anything but whole numbers, or more than eight of them', () => {
    for (const text of ['', '  ', '()', '8, 24.5, 64', '8, -1', 'eight', '8,,24', '1,2,3,4,5,6,7,8,9', '99999999999999999']) {
      expect(parseTuple(text), text).toBeNull()
    }
  })

  test('is right when it is the key, number for number, and the attempt passes only when every answer is', () => {
    const questions = tr0Questions(pointsOf('tr0.forward.s2'), 11)
    const keys = questions.map((question) => [...question.key])
    expect(markDefence(questions, keys)).toEqual({ right: [true, true, true], score: 1, ok: true })
    const off = keys.map((key, at) => (at === 1 ? [key[0] + 1, ...key.slice(1)] : key))
    expect(markDefence(questions, off)).toEqual({ right: [true, false, true], score: 2 / 3, ok: false })
    expect(markDefence(questions, keys.map((key, at) => (at === 2 ? [...key, 1] : key))).ok).toBe(false)
    expect(markDefence(questions, [keys[0], null, keys[2]])).toEqual({ right: [true, false, true], score: 2 / 3, ok: false })
    expect(markDefence([], []).ok).toBe(false)
  })
})

describe('the computation shown once the answers are in', () => {
  test('works each contiguous stride from the sizes after it, and says whether the record is that', () => {
    const point: FoundPoint = { name: 'mlp', found: true, shape: [8, 24, 1024], strides: [24_576, 1024, 1], dtype: 'float32' }
    const work = working(point)
    expect(work.contiguous).toEqual([
      { after: [24, 1024], stride: 24_576 },
      { after: [1024], stride: 1024 },
      { after: [], stride: 1 },
    ])
    expect(work.isContiguous).toBe(true)
    expect(work.numel).toBe(196_608)
  })

  test('calls a transposed record not contiguous, and leaves a dimension of size 1 out of it', () => {
    expect(working({ name: 'attention', found: true, shape: [8, 1024, 24], strides: [24_576, 1, 1024], dtype: 'float32' }).isContiguous).toBe(false)
    // The decode step's tensors have two dimensions of size 1, whose strides move nothing (stage 3's own record has 64, 64, 1).
    expect(working({ name: 'logits', found: true, shape: [1, 1, 512], strides: [12_288, 512, 1], dtype: 'float32' }).isContiguous).toBe(true)
    for (const point of pointsOf('tr0.forward.s3')) if (point.found) expect(working(point).isContiguous).toBe(true)
  })
})
