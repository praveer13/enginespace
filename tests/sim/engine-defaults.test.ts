/*
 * Per-GPU engine defaults and graph memory (packages/sim/steploop/engine-defaults.ts and memory.ts; W1-T12; ARCHITECTURE §5.3; WORLD §2.4,
 * §2.10): the numbers an engine starts with on a 24 GB card and on an 80 GB one, each held to the claim that names it, the rules behind
 * them (vLLM's tiers, SGLang's bucket lists) checked against a second statement of the same rule, and the arithmetic of the KV budget that
 * graphs take memory from.
 *
 * A claim that moves with a re-pin fails the first block until the data follows, which is the point of keeping both.
 */
import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { compileContent } from '../../scripts/content/build.ts'
import { divCeil } from '../../packages/sim/core'
import { PHYSICS_ROWS } from '../../packages/sim/physics'
import {
  ENGINE_DEFAULTS,
  ENGINE_DEFAULT_CLAIMS,
  GRAPH_MEMORY_MODEL,
  capturedGraphs,
  defaultCaptureSizes,
  engineDefaults,
  graphReservationBytes,
  kvBudget,
  kvTokens,
  makeGraphConfig,
  memoryPlanFor,
  s5Card,
  sglangDecodeBuckets,
  sglangPaddedSize,
  sglangPrefillBuckets,
  vllmBatchDefaults,
  vllmCaptureSizes,
} from '../../packages/sim/steploop'
import type { GpuClassId } from '../../packages/sim/steploop'

const root = path.resolve(import.meta.dirname, '../..')
const claims = new Map(compileContent({ root }).claims.map((record) => [record.claim.id, record.claim]))
const claim = (id: string) => {
  const found = claims.get(id)
  if (found === undefined) throw new Error(`no claim ${id}`)
  return found
}
const at = (row: object, dotted: string): unknown => dotted.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], row)
const GIB = 2 ** 30

// ---------------------------------------------------------------------------------------------------------------------------
describe('the rows hold the numbers of their claims (TRACKER W1-T12: per-GPU engine defaults from claims)', () => {
  const classes: GpuClassId[] = ['rtx-4090', 'h100']

  test('every number the rows carry has a claim beside it, and the claim says the same number', () => {
    for (const gpu of classes) {
      const row = ENGINE_DEFAULTS[gpu]
      for (const [path, id] of Object.entries(ENGINE_DEFAULT_CLAIMS[gpu])) {
        const c = claim(id)
        expect([gpu, path, id, Number(c.value)]).toEqual([gpu, path, id, at(row, path)])
        expect([id, c.tag]).toEqual([id, 'measured'])
        expect([id, c.pin]).toEqual([id, path.startsWith('vllm') ? 'vllm' : 'sglang'])
        expect([id, c.source?.url.includes(path.startsWith('vllm') ? '/v0.33.0/' : '/v0.5.23/')]).toEqual([id, true])
      }
    }
  })

  test('the claims name the card: the 4090 rows are the small tier of both engines, and the H100 rows the large', () => {
    for (const id of Object.values(ENGINE_DEFAULT_CLAIMS['rtx-4090'])) {
      if (id.startsWith('sglang')) expect([id, claim(id).text.includes('4090')]).toEqual([id, true])
      else expect([id, id.includes('.small.')]).toEqual([id, true])
    }
    for (const id of Object.values(ENGINE_DEFAULT_CLAIMS.h100)) {
      if (id.startsWith('sglang')) expect([id, claim(id).text.includes('H100')]).toEqual([id, true])
      else expect([id, id.includes('.large.')]).toEqual([id, true])
    }
  })

  test('the batch sizes at tensor-parallel degree 4 and up come from the same claims\' sentences', () => {
    for (const gpu of classes) {
      const id = ENGINE_DEFAULT_CLAIMS[gpu]['sglang.decodeGraphMaxBs.tpBelow4']
      const text = claim(id).text
      const below = /batch of (\d+) at tensor-parallel sizes under 4/.exec(text)
      const from = /at (\d+) from tensor-parallel size 4/.exec(text)
      expect(below, id).not.toBeNull()
      expect(from, id).not.toBeNull()
      expect(Number(below![1]), id).toBe(ENGINE_DEFAULTS[gpu].sglang.decodeGraphMaxBs.tpBelow4)
      expect(Number(from![1]), id).toBe(ENGINE_DEFAULTS[gpu].sglang.decodeGraphMaxBs.tp4Up)
    }
  })

  test('the memory class of a row is the range the claim names', () => {
    for (const gpu of classes) {
      const id = ENGINE_DEFAULT_CLAIMS[gpu]['sglang.decodeGraphMaxBs.tpBelow4']
      expect([gpu, claim(id).text.includes(ENGINE_DEFAULTS[gpu].memoryClass)]).toEqual([gpu, true])
    }
  })

  test('the rows are frozen, labelled, and found by engineDefaults', () => {
    for (const gpu of classes) {
      expect(engineDefaults(gpu)).toBe(ENGINE_DEFAULTS[gpu])
      expect(Object.isFrozen(ENGINE_DEFAULTS[gpu])).toBe(true)
      expect(Object.isFrozen(ENGINE_DEFAULTS[gpu].vllm)).toBe(true)
      expect(Object.isFrozen(ENGINE_DEFAULTS[gpu].sglang)).toBe(true)
      expect(ENGINE_DEFAULTS[gpu].gpu).toBe(gpu)
    }
    expect(ENGINE_DEFAULTS['rtx-4090'].label).toContain('4090')
    expect(ENGINE_DEFAULTS.h100.label).toContain('H100')
    expect(Object.keys(ENGINE_DEFAULTS)).toEqual(['rtx-4090', 'h100'])
  })

  test('the same command is a different configuration on the two cards (research vllm M9)', () => {
    const small = ENGINE_DEFAULTS['rtx-4090']
    const large = ENGINE_DEFAULTS.h100
    expect(large.vllm.serverTokens).toBeGreaterThan(small.vllm.serverTokens)
    expect(large.vllm.offlineTokens).toBeGreaterThan(small.vllm.offlineTokens)
    expect(large.vllm.seqs).toBeGreaterThan(small.vllm.seqs)
    expect(large.sglang.chunkedPrefillSize).toBeGreaterThan(small.sglang.chunkedPrefillSize)
    expect(large.sglang.decodeGraphMaxBs.tpBelow4).toBeGreaterThan(small.sglang.decodeGraphMaxBs.tpBelow4)
    // Within a card, the larger tensor-parallel degree raises SGLang's graph limit.
    expect(small.sglang.decodeGraphMaxBs.tp4Up).toBeGreaterThan(small.sglang.decodeGraphMaxBs.tpBelow4)
    expect(large.sglang.decodeGraphMaxBs.tp4Up).toBeGreaterThan(large.sglang.decodeGraphMaxBs.tpBelow4)
  })

  test('the default capture sizes a row yields follow from its numbers: vLLM captures up to 2 · max_num_seqs, cut to the budget and to the ceiling', () => {
    // The 4090: 256 sequences, a budget of 2,048: the ceiling of 512 is the cut. The H100: 1,024 sequences and 8,192 tokens: the ceiling again.
    for (const gpu of classes) {
      const { vllm } = ENGINE_DEFAULTS[gpu]
      const sizes = vllmCaptureSizes({ maxNumSeqs: vllm.seqs, maxBatchedTokens: vllm.serverTokens })
      expect(sizes[sizes.length - 1], gpu).toBe(512)
      expect(sizes, gpu).toEqual(defaultCaptureSizes(512))
    }
    // A small engine on the same card is cut by its own sequences: 64 sequences capture up to 128.
    expect(vllmCaptureSizes({ maxNumSeqs: 64, maxBatchedTokens: 2048 }).at(-1)).toBe(128)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('vLLM\'s tiers (claims vllm.batch-defaults.*)', () => {
  const small = { serverTokens: 2048, offlineTokens: 8192, seqs: 256 }
  const large = { serverTokens: 8192, offlineTokens: 16384, seqs: 1024 }
  const xlarge = { serverTokens: 16384, offlineTokens: 16384, seqs: 1024 }

  test('the lines are the claims\': 70 GiB for the large tier, and 160 GiB for the largest', () => {
    expect(claim('vllm.batch-defaults.threshold.large-gib').value).toBe(70)
    expect(vllmBatchDefaults({ memoryGiB: 70 - 1e-9 })).toEqual(small)
    expect(vllmBatchDefaults({ memoryGiB: 70 })).toEqual(large)
    expect(vllmBatchDefaults({ memoryGiB: 160 - 1e-9 })).toEqual(large)
    expect(vllmBatchDefaults({ memoryGiB: 160 })).toEqual(xlarge)
    expect(vllmBatchDefaults({ memoryGiB: 0 })).toEqual(small)
    expect(Number(claim('vllm.batch-defaults.xlarge.tokens').value)).toBe(xlarge.serverTokens)
    expect(Number(claim('vllm.batch-defaults.xlarge.seqs').value)).toBe(xlarge.seqs)
  })

  test('hold the claims\' numbers for each tier', () => {
    expect(small).toEqual({
      serverTokens: Number(claim('vllm.batch-defaults.small.server-tokens').value),
      offlineTokens: Number(claim('vllm.batch-defaults.small.offline-tokens').value),
      seqs: Number(claim('vllm.batch-defaults.small.seqs').value),
    })
    expect(large).toEqual({
      serverTokens: Number(claim('vllm.batch-defaults.large.server-tokens').value),
      offlineTokens: Number(claim('vllm.batch-defaults.large.offline-tokens').value),
      seqs: Number(claim('vllm.batch-defaults.large.seqs').value),
    })
  })

  test('an A100 and a GB10 have the memory and stay small, whatever it is; a card of 160 GiB is large whatever it is called', () => {
    expect(vllmBatchDefaults({ memoryGiB: 80, a100: true })).toEqual(small)
    expect(vllmBatchDefaults({ memoryGiB: 128, gb10: true })).toEqual(small)
    expect(vllmBatchDefaults({ memoryGiB: 80, a100: false, gb10: false })).toEqual(large)
    expect(vllmBatchDefaults({ memoryGiB: 192, a100: true })).toEqual(xlarge)
  })

  test('put the course\'s two cards where their rows are: the 4090\'s 24 GB is small, and the H100\'s 80 GB is large', () => {
    // Decimal gigabytes to GiB: the 4090 has 24 GB, the H100 80 GB.
    expect(vllmBatchDefaults({ memoryGiB: (24 * 1e9) / GIB })).toEqual(ENGINE_DEFAULTS['rtx-4090'].vllm)
    expect(vllmBatchDefaults({ memoryGiB: (80 * 1e9) / GIB })).toEqual(ENGINE_DEFAULTS.h100.vllm)
    // And the H200 (141 GB) and the B200 (180 GB) go up a tier each.
    expect(vllmBatchDefaults({ memoryGiB: (141 * 1e9) / GIB })).toEqual(large)
    expect(vllmBatchDefaults({ memoryGiB: (180 * 1e9) / GIB })).toEqual(xlarge)
  })

  test('refuses a memory that is not a size', () => {
    expect(() => vllmBatchDefaults({ memoryGiB: -1 })).toThrow(/memoryGiB is a size of at least 0/)
    expect(() => vllmBatchDefaults({ memoryGiB: Number.NaN })).toThrow(/memoryGiB/)
    expect(() => vllmBatchDefaults({ memoryGiB: Number.POSITIVE_INFINITY })).toThrow(/memoryGiB/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('SGLang\'s bucket lists (claims sglang.cudagraph.decode-buckets, sglang.cudagraph.prefill-buckets)', () => {
  /** The decode rule as a membership test, which shares no code with the list builder: 1, 2, 4, 8, 12; 16..256 by 8; 272..496 by 16; 512.. by 32; and the maximum. */
  const decodeMember = (n: number, maxBs: number): boolean => {
    if (n > maxBs) return false
    if (n === maxBs) return true
    if ([1, 2, 4, 8, 12].includes(n)) return true
    if (n >= 16 && n <= 256) return n % 8 === 0
    if (n >= 272 && n < 512) return (n - 272) % 16 === 0
    if (n >= 512) return (n - 512) % 32 === 0
    return false
  }
  const prefillMember = (n: number, maxTokens: number): boolean => {
    if (n > maxTokens) return false
    if (n >= 4 && n <= 32) return n % 4 === 0
    if (n >= 48 && n <= 256) return (n - 48) % 16 === 0
    if (n >= 288 && n <= 512) return (n - 288) % 32 === 0
    if (n >= 576 && n <= 1024) return (n - 576) % 64 === 0
    if (n >= 1280 && n <= 4096) return (n - 1280) % 256 === 0
    if (n >= 4608) return (n - 4608) % 512 === 0
    return false
  }

  test('decode: the 4090\'s limit of 48 and the H100\'s 256 give the lists the source would, worked out by hand', () => {
    expect(sglangDecodeBuckets(ENGINE_DEFAULTS['rtx-4090'].sglang.decodeGraphMaxBs.tpBelow4)).toEqual([1, 2, 4, 8, 12, 16, 24, 32, 40, 48])
    const h100 = sglangDecodeBuckets(ENGINE_DEFAULTS.h100.sglang.decodeGraphMaxBs.tpBelow4)
    // 1, 2, 4, 8, 12, then 16 to 256 in steps of 8 (31 sizes): 36 in all, ending on the maximum.
    expect(h100).toHaveLength(36)
    expect(h100.slice(0, 7)).toEqual([1, 2, 4, 8, 12, 16, 24])
    expect(h100.slice(-3)).toEqual([240, 248, 256])
    // The limit at tensor-parallel degree 4 and up (512) reaches the steps of 16 and then the first of 32.
    const big = sglangDecodeBuckets(ENGINE_DEFAULTS.h100.sglang.decodeGraphMaxBs.tp4Up)
    expect(big.slice(35, 39)).toEqual([256, 272, 288, 304])
    expect(big.slice(-3)).toEqual([480, 496, 512])
    expect(sglangDecodeBuckets(544).slice(-3)).toEqual([496, 512, 544])
  })

  test('decode: a maximum that is not on a step is added, a small one cuts the list, and every list is ascending without repeats', () => {
    expect(sglangDecodeBuckets(100).slice(-3)).toEqual([88, 96, 100])
    expect(sglangDecodeBuckets(1)).toEqual([1])
    expect(sglangDecodeBuckets(3)).toEqual([1, 2, 3])
    expect(sglangDecodeBuckets(9)).toEqual([1, 2, 4, 8, 9])
    expect(sglangDecodeBuckets(12)).toEqual([1, 2, 4, 8, 12])
    expect(sglangDecodeBuckets(13)).toEqual([1, 2, 4, 8, 12, 13])
    expect(() => sglangDecodeBuckets(0)).toThrow(/maxBs is an integer of at least 1/)
    expect(() => sglangDecodeBuckets(2.5)).toThrow(/maxBs/)
  })

  test('decode: for every maximum from 1 to 700 the list is the membership rule\'s, in order', () => {
    for (let maxBs = 1; maxBs <= 700; maxBs++) {
      const list = sglangDecodeBuckets(maxBs)
      const expected: number[] = []
      for (let n = 1; n <= maxBs; n++) if (decodeMember(n, maxBs)) expected.push(n)
      expect(list, `maxBs ${maxBs}`).toEqual(expected)
      expect(list[list.length - 1], `maxBs ${maxBs}`).toBe(maxBs)
    }
  })

  test('decode: a batch pads up to the next size, and above the maximum it runs without a graph', () => {
    const list = sglangDecodeBuckets(48)
    expect(list.map((n) => sglangPaddedSize(list, n))).toEqual(list)
    expect(sglangPaddedSize(list, 3)).toBe(4)
    expect(sglangPaddedSize(list, 5)).toBe(8)
    expect(sglangPaddedSize(list, 13)).toBe(16)
    expect(sglangPaddedSize(list, 25)).toBe(32)
    expect(sglangPaddedSize(list, 48)).toBe(48)
    expect(sglangPaddedSize(list, 49)).toBeNull()
    expect(sglangPaddedSize([], 1)).toBeNull()
    // The padded size is at least the size and the smallest such, for every n up to the maximum.
    for (let n = 1; n <= 48; n++) {
      const padded = sglangPaddedSize(list, n)!
      expect(padded >= n && !list.some((size) => size >= n && size < padded), `n ${n}`).toBe(true)
    }
  })

  test('prefill: the lists count tokens, are cut at the maximum and are not extended to it', () => {
    expect(sglangPrefillBuckets(32)).toEqual([4, 8, 12, 16, 20, 24, 28, 32])
    expect(sglangPrefillBuckets(50)).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 48])
    expect(sglangPrefillBuckets(2048).slice(-4)).toEqual([1280, 1536, 1792, 2048])
    expect(sglangPrefillBuckets(4096).slice(-3)).toEqual([3584, 3840, 4096])
    expect(sglangPrefillBuckets(5000).slice(-3)).toEqual([3840, 4096, 4608])
    expect(sglangPrefillBuckets(8192).slice(-3)).toEqual([7168, 7680, 8192])
    expect(Number(claim('sglang.cudagraph.prefill-max-default').value)).toBe(2048)
    expect(() => sglangPrefillBuckets(0)).toThrow(/maxTokens is an integer of at least 1/)
  })

  test('prefill: for every maximum up to 9,000 the list is the membership rule\'s', () => {
    for (let maxTokens = 1; maxTokens <= 9000; maxTokens += maxTokens < 600 ? 1 : 37) {
      const list = sglangPrefillBuckets(maxTokens)
      const expected: number[] = []
      for (let n = 1; n <= maxTokens; n++) if (prefillMember(n, maxTokens)) expected.push(n)
      expect(list, `maxTokens ${maxTokens}`).toEqual(expected)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('graph memory comes off the KV budget before the cache is sized (claims vllm.cudagraph.memory-before-kv, vllm.cudagraph.memory-subtracted)', () => {
  const sizes = defaultCaptureSizes(512)
  const g = makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: sizes, maxNumSeqs: 512 })
  const graphs = capturedGraphs(g, 'mrv2')
  const sumTokens = (list: readonly { numTokens: number }[]) => list.reduce((total, graph) => total + graph.numTokens, 0)

  test('a graph holds a fixed part and a part for each token of its size, and the sum is over the captured graphs', () => {
    expect(GRAPH_MEMORY_MODEL).toEqual({ baseBytes: 8 * 2 ** 20, perTokenBytes: 16 * 2 ** 10 })
    expect(graphReservationBytes([])).toBe(0)
    expect(graphReservationBytes([{ numTokens: 1 }])).toBe(8 * 2 ** 20 + 16 * 2 ** 10)
    expect(graphReservationBytes([{ numTokens: 1 }, { numTokens: 512 }])).toBe(2 * 8 * 2 ** 20 + 513 * 16 * 2 ** 10)
    expect(graphReservationBytes([{ numTokens: 10 }], { baseBytes: 5, perTokenBytes: 7 })).toBe(75)
  })

  test('vLLM\'s 51 default sizes in two modes are 102 graphs and about a gibibyte [derived]', () => {
    expect(sizes).toHaveLength(51)
    expect(sumTokens(graphs)).toBe(2 * 10_503)
    expect(graphs).toHaveLength(102)
    const bytes = graphReservationBytes(graphs)
    expect(bytes).toBe(102 * 8 * 2 ** 20 + 2 * 10_503 * 16 * 2 ** 10)
    expect(bytes / 2 ** 20).toBeCloseTo(1144.21875, 5)
    expect(bytes / GIB).toBeGreaterThan(1)
    expect(bytes / GIB).toBeLessThan(1.2)
  })

  test('the modes that capture one family of graphs hold half as many as the pair, and NONE holds none', () => {
    const bytes = (mode: Parameters<typeof makeGraphConfig>[0]['mode']) => graphReservationBytes(capturedGraphs(makeGraphConfig({ mode, captureSizes: sizes, maxNumSeqs: 512 }), 'mrv2'))
    expect(bytes('FULL') * 2).toBe(bytes('FULL_AND_PIECEWISE'))
    expect(bytes('PIECEWISE') * 2).toBe(bytes('FULL_AND_PIECEWISE'))
    expect(bytes('FULL_DECODE_ONLY')).toBe(bytes('FULL'))
    expect(bytes('NONE')).toBe(0)
  })

  test('the KV budget is the requested memory minus the weights and the activations minus the graphs, never below 0', () => {
    const budget = kvBudget({ hbmBytes: 80_000_000_000, utilizationPermille: 920, weightBytes: 17_637_500_000, workspaceBytes: 4 * GIB, graphBytes: 1_000_000_000 })
    expect(budget).toEqual({
      requestedBytes: 73_600_000_000,
      nonKvBytes: 17_637_500_000 + 4 * GIB,
      graphBytes: 1_000_000_000,
      kvBytes: 73_600_000_000 - 17_637_500_000 - 4 * GIB - 1_000_000_000,
      fits: true,
    })
    const tight = kvBudget({ hbmBytes: 10, utilizationPermille: 500, weightBytes: 4, workspaceBytes: 1, graphBytes: 1 })
    expect(tight).toEqual({ requestedBytes: 5, nonKvBytes: 5, graphBytes: 1, kvBytes: 0, fits: false })
    // Exactly enough is not enough: the cache needs more than nothing.
    expect(kvBudget({ hbmBytes: 10, utilizationPermille: 1000, weightBytes: 9, workspaceBytes: 0, graphBytes: 1 }).fits).toBe(false)
    expect(kvBudget({ hbmBytes: 10, utilizationPermille: 1000, weightBytes: 8, workspaceBytes: 0, graphBytes: 1 })).toMatchObject({ kvBytes: 1, fits: true })
    // The requested memory rounds down.
    expect(kvBudget({ hbmBytes: 1001, utilizationPermille: 920, weightBytes: 0, workspaceBytes: 0, graphBytes: 0 }).requestedBytes).toBe(920)
  })

  test('without the estimate the graphs are taken out of what the cache left: the budget ignores them, and a prediction that ignores them is high by their sum', () => {
    const plan = { hbmBytes: 80_000_000_000, utilizationPermille: 920, weightBytes: 17_637_500_000, workspaceBytes: 4 * GIB, graphBytes: graphReservationBytes(graphs) }
    const applied = kvBudget(plan)
    const ignored = kvBudget({ ...plan, applyGraphEstimate: false })
    expect(ignored.graphBytes).toBe(0)
    expect(ignored.kvBytes - applied.kvBytes).toBe(plan.graphBytes)
    expect(kvBudget({ ...plan, applyGraphEstimate: true })).toEqual(applied)
    // In tokens: the cache of an H100 at tensor-parallel degree 4 holds the graphs' bytes fewer, to a token.
    const perToken = divCeil(163_840, 4)
    const withGraphs = kvTokens(applied, perToken)
    const without = kvTokens(ignored, perToken)
    const lost = without - withGraphs
    expect(lost).toBeGreaterThanOrEqual(Math.floor(plan.graphBytes / perToken))
    expect(lost).toBeLessThanOrEqual(Math.ceil(plan.graphBytes / perToken))
    expect(lost).toBeGreaterThan(0)
  })

  test('more graphs, fewer tokens, and the loss grows with every size added', () => {
    const { plan, kvBytesPerToken } = memoryPlanFor(s5Card('h100-vllm-0-10-2-fp8', 4), { workspaceBytes: 4 * GIB, graphBytes: 0 })
    let previous = kvTokens(kvBudget(plan), kvBytesPerToken)
    for (let count = 1; count <= 51; count += 5) {
      const some = capturedGraphs(makeGraphConfig({ mode: 'FULL_AND_PIECEWISE', captureSizes: sizes.slice(0, count), maxNumSeqs: 512 }), 'mrv2')
      const tokens = kvTokens(kvBudget({ ...plan, graphBytes: graphReservationBytes(some) }), kvBytesPerToken)
      expect(tokens, `${count} sizes`).toBeLessThanOrEqual(previous)
      previous = tokens
    }
    expect(previous).toBeLessThan(kvTokens(kvBudget(plan), kvBytesPerToken))
  })

  test('the plan for the 70B card divides the weights and the KV bytes of a token over the GPUs, rounding up, and defaults to 0.92', () => {
    expect(claim('vllm.cache.gpu-memory-utilization-default').value).toBe(0.92)
    for (const row of PHYSICS_ROWS) {
      for (const tp of row.box.tp) {
        const { plan, kvBytesPerToken } = memoryPlanFor(s5Card(row.key, tp), { workspaceBytes: 123, graphBytes: 456 })
        expect(plan, `${row.key} tp ${tp}`).toEqual({
          hbmBytes: row.spec.chip.hbmBytes,
          utilizationPermille: 920,
          weightBytes: divCeil(row.spec.model.weightBytes, tp),
          workspaceBytes: 123,
          graphBytes: 456,
        })
        expect(kvBytesPerToken, `${row.key} tp ${tp}`).toBe(divCeil(row.spec.model.kvBytesPerToken, tp))
        // The split never gives a GPU less than its share.
        expect(plan.weightBytes * tp).toBeGreaterThanOrEqual(row.spec.model.weightBytes)
        expect(kvBytesPerToken * tp).toBeGreaterThanOrEqual(row.spec.model.kvBytesPerToken)
      }
    }
    const odd = memoryPlanFor(s5Card('h100-vllm-0-10-2-fp8', 3), { workspaceBytes: 0, graphBytes: 0, utilizationPermille: 900, applyGraphEstimate: false })
    expect(odd.plan).toMatchObject({ weightBytes: 23_516_666_667, utilizationPermille: 900, applyGraphEstimate: false })
    expect(odd.kvBytesPerToken).toBe(54_614)
  })

  test('the H100 at tensor-parallel degree 4 has room for the cache of the 70B model, one B200 holds it too, and one H100 does not (a worked row)', () => {
    const h100 = memoryPlanFor(s5Card('h100-vllm-0-10-2-fp8', 4), { workspaceBytes: 4 * GIB, graphBytes: graphReservationBytes(graphs) })
    const budget = kvBudget(h100.plan)
    expect(budget.fits).toBe(true)
    // 73.6 GB requested, 17.6375 GB of weights, 4 GiB of activations, 1.2 GB of graphs: about 50.5 GB for the cache, and about 1.23 million tokens at 40,960 bytes a token.
    expect(budget.requestedBytes).toBe(73_600_000_000)
    expect(budget.kvBytes).toBe(73_600_000_000 - 17_637_500_000 - 4 * GIB - graphReservationBytes(graphs))
    expect(kvTokens(budget, h100.kvBytesPerToken)).toBe(Math.floor(budget.kvBytes / 40_960))
    const b200 = memoryPlanFor(s5Card('b200-vllm-0-10-2-fp8', 1), { workspaceBytes: 4 * GIB, graphBytes: graphReservationBytes(graphs) })
    expect(kvBudget(b200.plan).fits).toBe(true)
    // One H100 holds the 70.55 GB of weights in the 73.6 GB it may use, but not the activations and the graphs beside them.
    expect(kvBudget(memoryPlanFor(s5Card('h100-vllm-0-10-2-fp8', 1), { workspaceBytes: 0, graphBytes: 0 }).plan).fits).toBe(true)
    expect(kvBudget(memoryPlanFor(s5Card('h100-vllm-0-10-2-fp8', 1), { workspaceBytes: 4 * GIB, graphBytes: graphReservationBytes(graphs) }).plan).fits).toBe(false)
  })

  test('refuse what is not a byte count, or a utilisation out of range, or a token of no bytes', () => {
    const ok = { hbmBytes: 100, utilizationPermille: 500, weightBytes: 1, workspaceBytes: 1, graphBytes: 1 }
    expect(() => kvBudget({ ...ok, hbmBytes: -1 })).toThrow(/hbmBytes must be an integer of at least 0/)
    expect(() => kvBudget({ ...ok, weightBytes: 1.5 })).toThrow(/weightBytes/)
    expect(() => kvBudget({ ...ok, graphBytes: Number.NaN })).toThrow(/graphBytes/)
    expect(() => kvBudget({ ...ok, utilizationPermille: 0 })).toThrow(/utilizationPermille is an integer from 1 to 1000/)
    expect(() => kvBudget({ ...ok, utilizationPermille: 1001 })).toThrow(/utilizationPermille/)
    expect(() => kvTokens({ kvBytes: 10 }, 0)).toThrow(/kvBytesPerToken is an integer of at least 1/)
    expect(kvTokens({ kvBytes: 0 }, 5)).toBe(0)
    expect(kvTokens({ kvBytes: 9 }, 5)).toBe(1)
  })
})
