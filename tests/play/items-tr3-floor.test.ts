/*
 * W2b-T106: `tr3.floor`. The bandwidths of the eight cards are read again from the claims of the hardware atlas, Qwen3-0.6B's weights and
 * its KV bytes per token are worked out again from the claims of its configuration, and each key is worked out again from the lines the
 * ticket prints: the bytes the step reads over the bandwidth, in µs. The reader shares no code with the family.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { familyById, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { floor, GPUS, qwen3KvBytesPerToken, qwen3Params, qwen3WeightBytes } from '@es/play/items/families/tr3/floor'
import { keyOf, wrongOf } from './items-support.ts'
import { chunks, givenCode, givenNum } from './items-tr3-support.ts'

interface Claim {
  id: string
  value: unknown
  tag: string
}

const root = path.resolve(import.meta.dirname, '../..')
const hardware = readdirSync(path.join(root, 'content/claims/hardware'))
  .filter((name) => name.endsWith('.yaml'))
  .flatMap((name) => load(readFileSync(path.join(root, 'content/claims/hardware', name), 'utf8')) as Claim[])
const model = load(readFileSync(path.join(root, 'content/claims/tr0.yaml'), 'utf8')) as Claim[]
const claim = (list: readonly Claim[], id: string): Claim => {
  const found = list.find((candidate) => candidate.id === id)
  if (found === undefined) throw new Error(`no claim ${id}`)
  return found
}

describe('the key rests on claims', () => {
  test("each card's bandwidth is the value of its claim, a datasheet's peak rate", () => {
    expect(GPUS).toHaveLength(8)
    for (const gpu of GPUS) {
      const found = claim(hardware, gpu.claim)
      expect(found.value, gpu.claim).toBe(gpu.gbps)
      expect(found.tag, gpu.claim).toBe(gpu.tag)
      expect(gpu.claim).toMatch(/^hw\..+\.mem-bw$/)
    }
  })

  test("Qwen3-0.6B's weights and KV bytes per token are worked out from the claims of its configuration", () => {
    const value = (id: string): number => Number(claim(model, `qwen3.config.${id}`).value)
    const layers = value('layers')
    const hidden = value('hidden-size')
    const inter = value('intermediate-size')
    const heads = value('heads')
    const kvHeads = value('kv-heads')
    const headDim = value('head-dim')
    const vocab = value('vocab-size')
    expect(claim(model, 'qwen3.config.stored-dtype').value).toBe('bfloat16')
    expect(claim(model, 'qwen3.config.tied-embeddings').value).toBe('true')
    // The embedding table, once (the output projection shares it), and in each layer the four attention matrices and the three of the MLP.
    const params = vocab * hidden + layers * (hidden * heads * headDim + 2 * hidden * kvHeads * headDim + heads * headDim * hidden + 3 * hidden * inter)
    expect(params).toBe(595_984_384)
    expect(qwen3Params()).toBe(params)
    expect(qwen3WeightBytes()).toBe(2 * params)
    expect(qwen3WeightBytes()).toBe(1_191_968_768)
    expect(qwen3KvBytesPerToken()).toBe(layers * 2 * kvHeads * headDim * 2)
    expect(qwen3KvBytesPerToken()).toBe(114_688)
  })

  test("no key rests on the checkpoint file's size, which is unverified and is not what a step reads", () => {
    expect(claim(model, 'qwen3.weights.bytes').tag).toBe('unverified')
    expect(qwen3WeightBytes()).not.toBe(Number(claim(model, 'qwen3.weights.bytes').value))
  })
})

describe('the family', () => {
  test('is registered, names the step-floor KC, and has two numeric variants at every level', () => {
    expect(familyById('tr3.floor')).toBe(floor)
    expect(FAMILIES).toContain(floor)
    expect(floor.kcs).toEqual(['tr3.step-floor'])
    for (const level of LEVELS) {
      const kinds = offeredAt(floor, level).map((variant) => floor.make(1, level, variant.id).answer.kind)
      expect(kinds).toEqual(['numeric', 'numeric'])
    }
  })
})

/** The least time in µs, from the lines the ticket prints. */
function readKey(item: Item): number {
  const weights = givenNum(item, 'weights') * 1e9
  const bandwidth = givenNum(item, 'memory bandwidth')
  const hasKv = item.givens.some((given) => given.label === 'KV cache per token')
  const kv = hasKv ? givenNum(item, 'KV cache per token') * givenNum(item, 'context of each request') * (item.givens.some((given) => given.label === 'requests in the step') ? givenNum(item, 'requests in the step') : 1) : 0
  // One GB/s is one byte per ns: bytes over GB/s are ns, and a thousand ns are one µs.
  if (item.variant === 'kv-part') return kv / bandwidth / 1000
  return (weights + kv) / bandwidth / 1000
}

describe('the keys, read again from the ticket', () => {
  for (const level of LEVELS) {
    for (const [at, seeds] of chunks.entries()) {
      test(`level ${level}, seeds chunk ${at + 1} of ${chunks.length}: bytes over bandwidth, with the KV cache from level 2 and every request's at level 3`, () => {
        for (const seed of seeds) {
          for (const variant of ['floor', 'kv-part']) {
            const item = floor.make(seed, level, variant)
            if (item.answer.kind !== 'numeric') throw new Error('numeric')
            expect(item.answer.truth / readKey(item), `${variant} seed ${seed}`).toBeCloseTo(1, 9)
            expect(item.answer.tolerance).toEqual({ rel: 0.02 })
            expect(floor.grade(item, { kind: 'numeric', value: readKey(item) }).ok).toBe(true)
            // The card's name is the one whose bandwidth is printed.
            const gpu = GPUS.find((candidate) => candidate.name === givenCode(item, 'GPU'))
            expect(gpu?.gbps, `${variant} seed ${seed}`).toBe(givenNum(item, 'memory bandwidth'))
          }
        }
      })
    }
  }

  test('the KV cache is on the ticket from level 2 for `floor`, always for `kv-part`, and the batch only at level 3', () => {
    for (const seed of chunks[0].slice(0, 40)) {
      for (const level of LEVELS) {
        const labels = (variant: string): string[] => floor.make(seed, level, variant).givens.map((given) => given.label)
        expect(labels('floor').includes('KV cache per token')).toBe(level >= 2)
        expect(labels('kv-part').includes('KV cache per token')).toBe(true)
        expect(labels('floor').includes('requests in the step')).toBe(level === 3)
      }
    }
  })

  test('Qwen3-0.6B is the model about one seed in three, with its derived weights and KV bytes on the ticket', () => {
    let real = 0
    for (const seed of chunks[0]) {
      const item = floor.make(seed, 2, 'floor')
      if (givenCode(item, 'model').startsWith('Qwen3-0.6B')) {
        real += 1
        expect(givenNum(item, 'weights') * 1e9).toBe(qwen3WeightBytes())
        expect(givenNum(item, 'KV cache per token')).toBe(114_688)
        expect(item.givens.find((given) => given.label === 'weights')?.value).toMatchObject({ tag: 'derived' })
      } else expect(item.givens.find((given) => given.label === 'weights')?.value).toMatchObject({ tag: 'synthetic' })
    }
    expect(real).toBeGreaterThan(15)
    expect(real).toBeLessThan(55)
  })
})

describe('a wrong answer is named', () => {
  test('a time in ns or in ms, the weights alone at level 2, one request or a batch of weights at level 3, and the weights for the KV part', () => {
    const seen = new Set<string>()
    for (const seed of chunks[0]) {
      for (const level of LEVELS) {
        for (const variant of ['floor', 'kv-part']) {
          const item = floor.make(seed, level, variant)
          if (item.answer.kind !== 'numeric') continue
          const key = item.answer.truth
          for (const wrong of [key * 1000, key / 1000]) {
            const grade = floor.grade(item, { kind: 'numeric', value: wrong })
            expect(grade.ok).toBe(false)
            seen.add(grade.diagnosis?.id ?? 'none')
          }
          const bandwidth = givenNum(item, 'memory bandwidth')
          // The weights' own time is a wrong answer only when the KV cache's bytes are more than the tolerance of the key.
          const weightsUs = (givenNum(item, 'weights') * 1e9) / bandwidth / 1000
          const apart = Math.abs(weightsUs - key) > 0.02 * key
          if (variant === 'floor' && level >= 2 && apart) {
            expect(floor.grade(item, { kind: 'numeric', value: weightsUs }).diagnosis?.id).toBe('tr3.floor.weights-only')
          }
          if (variant === 'kv-part' && apart) {
            expect(floor.grade(item, { kind: 'numeric', value: weightsUs }).diagnosis?.id).toBe('tr3.floor.weights-for-kv')
          }
          expect(floor.grade(item, wrongOf(item)).ok).toBe(false)
        }
      }
    }
    expect([...seen].sort()).toEqual(['tr3.floor.in-ms', 'tr3.floor.in-ns'])
  })

  test('at level 3 the two slips are named: counting one request, and reading the weights again for each', () => {
    const ids = new Set<string>()
    for (const seed of chunks[0]) {
      const item = floor.make(seed, 3, 'floor')
      const weights = givenNum(item, 'weights') * 1e9
      const kv = givenNum(item, 'KV cache per token') * givenNum(item, 'context of each request')
      const batch = givenNum(item, 'requests in the step')
      const bandwidth = givenNum(item, 'memory bandwidth')
      ids.add(floor.grade(item, { kind: 'numeric', value: (weights + kv) / bandwidth / 1000 }).diagnosis?.id ?? 'none')
      ids.add(floor.grade(item, { kind: 'numeric', value: (batch * (weights + kv)) / bandwidth / 1000 }).diagnosis?.id ?? 'none')
    }
    expect(ids.has('tr3.floor.one-request')).toBe(true)
    expect(ids.has('tr3.floor.weights-per-request')).toBe(true)
  })

  test('the answer reads as plain words in a solution that ends in the key', () => {
    const item = floor.make(5, 3, 'floor')
    const steps = floor.solution(item)
    expect(plain(steps[0].text)).toContain('memory bandwidth')
    const key = keyOf(item)
    expect(key.kind === 'numeric' ? steps.at(-1)?.result?.value : undefined).toBe(key.kind === 'numeric' ? key.value : undefined)
  })
})
