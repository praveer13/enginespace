/*
 * The arithmetic of a spec (ARCHITECTURE §5.4, D-045; TRACKER W1-T21, check 3): that every group's block is exactly one page, how
 * the builder groups and pads a model's layers as vLLM does at the pin, how many blocks a group holds for a request, and how many
 * pages an adapter takes.
 */
import { describe, expect, test } from 'bun:test'
import { between, pick, rngFor } from '../../packages/sim/core/rng'
import {
  KV_LORA_SHAPE,
  KV_PRESET_IDS,
  KV_PRESET_POOL,
  assertKvSpec,
  buildKvSpec,
  kvAdapterCatalog,
  kvAdapterPages,
  kvAlignment,
  kvBlockBytes,
  kvBlocksHeld,
  kvHitBlocks,
  kvHitFrom,
  kvLoraBytes,
  kvPaddingWaste,
  kvPagesHeld,
  kvPreset,
  kvSpecProblems,
  kvTableRule,
} from '../../packages/sim/kv'
import type { KvGroupSpec, KvLayerKind, KvSpec } from '../../packages/sim/kv'
import { heldByWindow } from './kv-support'

const tiny = (kinds: KvLayerKind[], pool = 16): KvSpec => buildKvSpec({ tokenBytes: 1, baseBlockTokens: 4, kinds }, pool)

describe('check 3: every group\'s block is exactly one page', () => {
  test('in every preset, for every group', () => {
    for (const id of KV_PRESET_IDS) {
      const spec = kvPreset(id)
      expect([id, kvSpecProblems(spec)]).toEqual([id, []])
      for (const g of spec.groups) expect([id, g.id, kvBlockBytes(spec, g)]).toEqual([id, g.id, spec.pageBytes])
      expect(spec.poolPages).toBe(KV_PRESET_POOL[id])
    }
  })

  test('in every model the builder is given: 400 random models of 1 to 4 kinds, with their pages, padding and inflated blocks', () => {
    const rng = rngFor(21, 'tests/kv/spec')
    let padded = 0
    let inflated = 0
    for (let i = 0; i < 400; i++) {
      const kinds: KvLayerKind[] = []
      const count = between(rng, 1, 4)
      const windows = [16, 24, 32, 100]
      for (let k = 0; k < count; k++) {
        const kind = pick(rng, ['full', 'sliding', 'state'] as const)
        if (kind === 'full') {
          if (!kinds.some((x) => x.kind === 'full')) kinds.push({ kind, layers: between(rng, 1, 70) })
        } else if (kind === 'sliding') {
          const window = pick(rng, windows)
          if (!kinds.some((x) => x.kind === 'sliding' && x.window === window)) kinds.push({ kind, layers: between(rng, 1, 70), window })
        } else if (!kinds.some((x) => x.kind === 'state')) {
          kinds.push({ kind, layers: between(rng, 1, 70), stateBytes: between(rng, 100, 3000), statePages: between(rng, 1, 3) })
        }
      }
      if (kinds.length === 0) kinds.push({ kind: 'full', layers: 3 })
      const spec = buildKvSpec({ tokenBytes: pick(rng, [64, 256, 1024]), baseBlockTokens: 16, kinds }, between(rng, 1, 300))
      expect([i, kvSpecProblems(spec)]).toEqual([i, []])
      for (const g of spec.groups) expect(kvBlockBytes(spec, g)).toBe(spec.pageBytes)
      // Every layer of the model is in exactly one group, and the padding is what the groups lack of their size.
      for (const kind of kinds) {
        const mine = spec.groups.filter((g) => g.kind === kind.kind && (kind.kind !== 'sliding' || g.window === kind.window))
        expect(mine.reduce((s, g) => s + g.layers, 0)).toBe(kind.layers)
      }
      if (spec.paddingLayers > 0) padded++
      if (kinds.some((k) => k.kind === 'state') && spec.groups[0].blockTokens > 16) inflated++
    }
    expect(padded).toBeGreaterThan(100)
    expect(inflated).toBeGreaterThan(10)
  })

  test('is checked: a spec whose group is not one page, or whose padding does not add up, is refused with a sentence that names the group', () => {
    const spec = kvPreset('two-kinds')
    const widen = (g: KvGroupSpec) => ({ ...g, layers: g.layers + 1 })
    const broken: KvSpec = { ...spec, groups: [spec.groups[0], widen(spec.groups[1]), spec.groups[2]] }
    expect(kvSpecProblems(broken)).toEqual([`group "sw0": a block is ${11 * 16 * 1024} bytes, and the page is ${spec.pageBytes}: every group's block must be exactly one page (D-045)`])
    expect(() => assertKvSpec(broken)).toThrow(/every group's block must be exactly one page/)
    const lying: KvSpec = { ...spec, paddingLayers: 3 }
    expect(kvSpecProblems(lying)).toEqual(['paddingLayers is 3, and the groups pad 0 layers'])
    // Padding that fills a short group is fine, and without it the same group is not.
    const gemma = kvPreset('same-size')
    const unpadded: KvSpec = { ...gemma, paddingLayers: 0, groups: gemma.groups.map((g) => ({ ...g, padLayers: undefined })) }
    expect(kvSpecProblems(unpadded).length).toBe(6)
  })

  test('names each way a spec can be wrong', () => {
    const ok = kvPreset('two-kinds')
    const cases: [string, KvSpec, RegExp][] = [
      ['no pool', { ...ok, poolPages: 0 }, /poolPages must be an integer from 1/],
      ['fractional page', { ...ok, pageBytes: 1.5 }, /pageBytes must be a positive integer/],
      ['no groups', { ...ok, groups: [], paddingLayers: 0 }, /at least one group/],
      ['twice', { ...ok, groups: [ok.groups[0], ok.groups[0]], paddingLayers: 0 }, /appears twice/],
      ['window of 1', { ...ok, groups: [ok.groups[0], { ...ok.groups[1], window: 1 }] }, /window of at least 2 tokens/],
      ['sliding without a window', { ...ok, groups: [ok.groups[0], { ...ok.groups[1], window: undefined }] }, /window of at least 2 tokens/],
      ['full with a window', { ...ok, groups: [{ ...ok.groups[0], window: 8 }] }, /neither a window nor statePages/],
      ['state without pages', { ...ok, groups: [{ ...ok.groups[0], kind: 'state' }] }, /statePages of at least 1/],
      ['bad kind', { ...ok, groups: [{ ...ok.groups[0], kind: 'linear' as 'full' }] }, /kind must be full, sliding or state/],
      ['no block', { ...ok, groups: [{ ...ok.groups[0], blockTokens: 0 }] }, /blockTokens must be an integer/],
      ['zero slots', { ...ok, adapterSlots: 0 }, /adapterSlots must be a positive integer/],
      ['state bigger than its slice', { ...kvPreset('state'), groups: kvPreset('state').groups.map((g) => (g.kind === 'state' ? { ...g, stateBytes: 99999999 } : g)) }, /does not fit its/],
    ]
    for (const [name, spec, pattern] of cases) expect([name, kvSpecProblems(spec).join(' | ')]).toEqual([name, expect.stringMatching(pattern)])
  })
})

describe('the builder, at the pin (vllm.hybrid-kv.group-size, vllm.hybrid-kv.layer-spread, vllm.hybrid-kv.padding-layers)', () => {
  const sizes = (spec: KvSpec) => spec.groups.map((g) => `${g.id}:${g.layers}+${g.padLayers ?? 0}`)

  test('two-kinds is the design document\'s case 2: 10 full and 20 sliding layers make 3 groups of 10, with no padding', () => {
    const spec = kvPreset('two-kinds')
    expect(sizes(spec)).toEqual(['full0:10+0', 'sw0:10+0', 'sw1:10+0'])
    expect(spec.paddingLayers).toBe(0)
    expect(spec.pageBytes).toBe(10 * 16 * 1024)
    expect(spec.groups.map((g) => g.blockTokens)).toEqual([16, 16, 16])
    expect(spec.groups[1].window).toBe(32)
  })

  test('same-size is Gemma-3-27b\'s 52 sliding and 10 full layers: 7 groups, and the 8 padding layers spread as the code at the pin spreads them', () => {
    const spec = kvPreset('same-size')
    // The document draws 6 groups of 10 and a last one of 2 with 8 padding layers; the code gives each sliding group 8 or 9 layers.
    expect(sizes(spec)).toEqual(['full0:10+0', 'sw0:9+1', 'sw1:9+1', 'sw2:9+1', 'sw3:9+1', 'sw4:8+2', 'sw5:8+2'])
    expect(spec.groups).toHaveLength(7)
    expect(spec.paddingLayers).toBe(8)
    expect(spec.groups.reduce((s, g) => s + g.layers, 0)).toBe(62)
    // 8 padding layers of the 70 that the 7 groups hold.
    expect(kvPaddingWaste(spec)).toEqual({ bytes: 8 * 16 * 1024, permille: 114 })
  })

  test('uses the biggest kind as the group size when it is less than 1.5 times the smallest (a draft model\'s extra layer)', () => {
    // The code comment's own example: 12 sliding and 13 full layers become two groups of 13, the sliding one padded by 1.
    const spec = tiny([
      { kind: 'full', layers: 13 },
      { kind: 'sliding', layers: 12, window: 8 },
    ])
    expect(sizes(spec)).toEqual(['full0:13+0', 'sw0:12+1'])
    // And its other example, whose code spreads three layers over two groups: (full.0, full.1), (sw.0, sw.2), (sw.1, padding).
    expect(
      sizes(
        tiny([
          { kind: 'full', layers: 2 },
          { kind: 'sliding', layers: 3, window: 8 },
        ]),
      ),
    ).toEqual(['full0:2+0', 'sw0:2+0', 'sw1:1+1'])
  })

  test('uses the smallest kind otherwise, even where another size would waste less (20 full and 30 sliding)', () => {
    const spec = tiny([
      { kind: 'full', layers: 20 },
      { kind: 'sliding', layers: 30, window: 8 },
    ])
    // The code's comment says that 10 would be better; it does not do it, and the model follows the code.
    expect(sizes(spec)).toEqual(['full0:20+0', 'sw0:15+5', 'sw1:15+5'])
    expect(spec.paddingLayers).toBe(10)
  })

  test('inflates the attention block until it holds a layer\'s state, and pads the state (the design document\'s case 4)', () => {
    const spec = kvPreset('state')
    expect(spec.groups.map((g) => g.blockTokens)).toEqual([32, 32, 32, 32])
    expect(sizes(spec)).toEqual(['full0:8+0', 'state0:8+0', 'state1:8+0', 'state2:8+0'])
    expect(spec.groups[1]).toMatchObject({ kind: 'state', statePages: 2, stateBytes: 32768 })
    // A state of 30,000 bytes in a 32,768-byte slice leaves 2,768 bytes in each of the 24 state layers.
    const loose = buildKvSpec({ tokenBytes: 1024, baseBlockTokens: 16, kinds: [{ kind: 'full', layers: 8 }, { kind: 'state', layers: 24, stateBytes: 30000 }] }, 64)
    expect(loose.groups[0].blockTokens).toBe(32)
    expect(kvPaddingWaste(loose).bytes).toBe(24 * (32768 - 30000))
    // 16 tokens hold 16,384 bytes, which is less than 20,000, so the block doubles; at 40,000 it takes 3 times the base.
    const bigger = buildKvSpec({ tokenBytes: 1024, baseBlockTokens: 16, kinds: [{ kind: 'full', layers: 8 }, { kind: 'state', layers: 8, stateBytes: 40000 }] }, 64)
    expect(bigger.groups[0].blockTokens).toBe(48)
  })

  test('refuses a model it cannot group', () => {
    expect(() => buildKvSpec({ tokenBytes: 1, baseBlockTokens: 4, kinds: [] }, 4)).toThrow(/at least one kind/)
    expect(() => buildKvSpec({ tokenBytes: 1, baseBlockTokens: 4, kinds: [{ kind: 'full', layers: 0 }] }, 4)).toThrow(/at least one layer/)
    expect(() => buildKvSpec({ tokenBytes: 1, baseBlockTokens: 4, kinds: [{ kind: 'full', layers: 1 }, { kind: 'full', layers: 2 }] }, 4)).toThrow(/alike/)
    expect(() => buildKvSpec({ tokenBytes: 1, baseBlockTokens: 4, kinds: [{ kind: 'state', layers: 1 }] }, 4)).toThrow(/stateBytes/)
  })
})

describe('what a group holds for a request', () => {
  test('is the design document\'s 11 blocks for a request of 112 tokens (7 full, 2 and 2 sliding), and Gemma-3-27b\'s 7 groups', () => {
    const spec = kvPreset('two-kinds')
    expect(spec.groups.map((g) => kvBlocksHeld(spec, g.id, 112))).toEqual([7, 2, 2])
    expect(kvPagesHeld(spec, 112)).toBe(11)
    const gemma = kvPreset('same-size')
    expect(gemma.groups.map((g) => g.id)).toHaveLength(7)
    // A window of 64 tokens at 112 tokens: the next token reads tokens 49 to 111, which sit in blocks 3 to 6.
    expect(gemma.groups.map((g) => kvBlocksHeld(gemma, g.id, 112))).toEqual([7, 4, 4, 4, 4, 4, 4])
    expect(() => kvBlocksHeld(spec, 'nope', 1)).toThrow(/no group "nope"/)
  })

  test('is the blocks that the window\'s tokens sit in, for every length, window and block size (against listing the tokens)', () => {
    for (const size of [1, 2, 4, 16]) {
      for (const window of [2, 3, 4, 5, 8, 17, 32, 100]) {
        const group: KvGroupSpec = { id: 's', kind: 'sliding', layers: 1, blockTokens: size, window }
        for (let length = 1; length <= 300; length++) {
          const rule = kvTableRule(group, length)
          expect([size, window, length, rule.blocks - rule.skip]).toEqual([size, window, length, heldByWindow(length, window, size)])
          expect(rule.blocks).toBe(Math.ceil(length / size))
          expect(rule.skip).toBeLessThanOrEqual(rule.blocks - 1)
        }
      }
    }
  })

  test('is every block for a full group, the newest statePages for a state group, and nothing for no tokens', () => {
    const full: KvGroupSpec = { id: 'f', kind: 'full', layers: 1, blockTokens: 4 }
    const state: KvGroupSpec = { id: 'm', kind: 'state', layers: 1, blockTokens: 4, statePages: 2 }
    for (let length = 1; length <= 60; length++) {
      expect(kvTableRule(full, length)).toEqual({ blocks: Math.ceil(length / 4), skip: 0 })
      const rule = kvTableRule(state, length)
      expect([length, rule.blocks - rule.skip]).toEqual([length, Math.min(Math.ceil(length / 4), 2)])
    }
    expect(kvTableRule(full, 0)).toEqual({ blocks: 0, skip: 0 })
    expect(kvTableRule({ ...full, kind: 'sliding', window: 8 }, 0)).toEqual({ blocks: 0, skip: 0 })
  })

  test('needs, for a hit, every block of a full group, the blocks the window reads of a sliding group, and the block at the edge of a state group', () => {
    const full: KvGroupSpec = { id: 'f', kind: 'full', layers: 1, blockTokens: 16 }
    const sw: KvGroupSpec = { id: 's', kind: 'sliding', layers: 1, blockTokens: 16, window: 32 }
    const state: KvGroupSpec = { id: 'm', kind: 'state', layers: 1, blockTokens: 16, statePages: 2 }
    expect([kvHitBlocks(full), kvHitBlocks(sw), kvHitBlocks(state)]).toEqual([Infinity, 2, 1])
    expect([kvHitFrom(full, 9), kvHitFrom(sw, 9), kvHitFrom(state, 9)]).toEqual([0, 7, 8])
    expect([kvHitFrom(full, 1), kvHitFrom(sw, 1), kvHitFrom(state, 1)]).toEqual([0, 0, 0])
    // A window of 33 tokens needs ⌈32 ÷ 16⌉ = 2 blocks, and of 34, ⌈33 ÷ 16⌉ = 3.
    expect([kvHitBlocks({ ...sw, window: 33 }), kvHitBlocks({ ...sw, window: 34 }), kvHitBlocks({ ...sw, window: 2 })]).toEqual([2, 3, 1])
  })

  test('rounds a hit to the least common multiple of the groups\' block sizes', () => {
    expect(kvAlignment(kvPreset('two-kinds'))).toBe(16)
    expect(kvAlignment(kvPreset('state'))).toBe(32)
    const mixed = { ...kvPreset('two-kinds'), groups: [{ id: 'a', kind: 'full' as const, layers: 1, blockTokens: 8 }, { id: 'b', kind: 'full' as const, layers: 1, blockTokens: 12 }] }
    expect(kvAlignment(mixed)).toBe(24)
  })
})

describe('adapters', () => {
  /** ⌈bytes ÷ page⌉ by repeated subtraction, which shares nothing with the formula. */
  const pagesByCounting = (bytes: number, page: number): number => {
    let pages = 0
    for (let left = bytes; left > 0; left -= page) pages++
    return pages
  }

  test('take ⌈adapter bytes ÷ page bytes⌉ pages: at the edges of a page, and on 2,000 random sizes', () => {
    for (const page of [1, 7, 4096, 131072, 163840]) {
      for (const k of [1, 2, 5, 40]) {
        expect([page, k, kvAdapterPages(k * page, page)]).toEqual([page, k, k])
        expect([page, k, kvAdapterPages(k * page + 1, page)]).toEqual([page, k, k + 1])
        if (page > 1) expect([page, k, kvAdapterPages(k * page - 1, page)]).toEqual([page, k, k])
      }
      expect(kvAdapterPages(1, page)).toBe(1)
    }
    const rng = rngFor(22, 'tests/kv/adapter')
    for (let i = 0; i < 2000; i++) {
      const page = between(rng, 1, 5000)
      const bytes = between(rng, 1, 200000)
      expect(kvAdapterPages(bytes, page)).toBe(pagesByCounting(bytes, page))
    }
    expect(() => kvAdapterPages(0, 4096)).toThrow(/at least 1 byte/)
    expect(() => kvAdapterPages(10, 0)).toThrow(/a page has at least 1 byte/)
    expect(() => kvAdapterPages(1.5, 4096)).toThrow(RangeError)
  })

  test('are the bytes of two matrices a target and a layer, and a rank adds the same bytes again', () => {
    const shape = { hidden: 256, layers: 16, targets: 4, dtypeBytes: 2 }
    expect(kvLoraBytes(shape, 1)).toBe(2 * 256 * 4 * 16 * 2)
    expect(KV_LORA_SHAPE).toEqual(shape)
    for (const rank of [2, 8, 64]) expect(kvLoraBytes(shape, rank)).toBe(rank * kvLoraBytes(shape, 1))
    expect(kvLoraBytes(shape, 8)).toBe(524288)
    expect(() => kvLoraBytes(shape, 0)).toThrow(/rank/)
  })

  test('in the presets: a rank-8 adapter takes exactly 4 pages of one-group (an exact multiple), and 4, 7 and 26 pages of two-kinds', () => {
    const catalog = (id: (typeof KV_PRESET_IDS)[number]) => kvAdapterCatalog(kvPreset(id)).map((a) => [a.rank, a.pages])
    expect(kvAdapterCatalog(kvPreset('one-group'))[0]).toEqual({ id: 0, rank: 8, bytes: 524288, pages: 4 })
    expect(524288 % kvPreset('one-group').pageBytes).toBe(0)
    expect(catalog('one-group')).toEqual([
      [8, 4],
      [16, 8],
      [64, 32],
    ])
    expect(catalog('two-kinds')).toEqual([
      [8, 4],
      [16, 7],
      [64, 26],
    ])
    for (const id of KV_PRESET_IDS) {
      const spec = kvPreset(id)
      for (const a of kvAdapterCatalog(spec)) {
        expect(a.pages).toBe(Math.ceil(a.bytes / spec.pageBytes))
        expect(a.pages * spec.pageBytes).toBeGreaterThanOrEqual(a.bytes)
        expect((a.pages - 1) * spec.pageBytes).toBeLessThan(a.bytes)
      }
    }
    expect(kvAdapterCatalog(kvPreset('two-kinds'), [8, 8]).map((a) => a.id)).toEqual([0, 1])
  })

  test('leave room in a preset\'s own pool: the biggest, rank 64, takes at most half of it', () => {
    for (const id of KV_PRESET_IDS) {
      const spec = kvPreset(id)
      const biggest = kvAdapterCatalog(spec).at(-1)
      expect([id, (biggest?.pages ?? Infinity) <= spec.poolPages / 2]).toEqual([id, true])
    }
  })
})

describe('the presets', () => {
  test('are small, reproducible and ready to play: ids, pool sizes, flags', () => {
    expect([...KV_PRESET_IDS]).toEqual(['one-group', 'two-kinds', 'same-size', 'state'])
    for (const id of KV_PRESET_IDS) {
      const spec = kvPreset(id)
      expect(spec.prefixCaching).toBe(true)
      expect(spec.adapterSlots).toBeUndefined()
      expect(kvPreset(id, 12, { prefixCaching: false, adapterSlots: 2 })).toMatchObject({ poolPages: 12, prefixCaching: false, adapterSlots: 2 })
    }
  })
})
