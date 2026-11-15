/*
 * W1b-T05: `tr5a.pages-for-adapter`, the pages an adapter takes from the pool and what that does to the pages left. The tests hold the family's
 * rules to the facts it rests on: the claims about S-LoRA's pool and about the slots of the pinned engines, and the sim's hybrid KV model
 * (`kvAdapterPages`, `kvLoraBytes`, and the reference manager's replies to a load, an unload and an admit), through which every key is found again.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { bandAcceptance, bandedSeeds, BAND_FLOOR, drawInBand, familiesForKc, familyById, FAMILIES, fixedSeeds, LEVELS, measureBlind, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { emptyShare, pagesForAdapter } from '@es/play/items/families/tr5a/pages-for-adapter'
import { adapterPages, emptyBytes, pageBytes, unitBytes } from '@es/play/items/families/tr5a/kit'
import { kvAdapterCatalog, kvAdapterPages, kvBlockBytes, kvLoraBytes, kvPreset, kvReference } from '../../packages/sim/kv'
import type { KvOp, KvSpec } from '../../packages/sim/kv'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(300, 0xada)

const seedsOf = (variant: string, level: 0 | 1 | 2 | 3, count: number): number[] =>
  bandedSeeds(pagesForAdapter, level, 4000)
    .filter((seed) => pagesForAdapter.make(seed, level).variant === variant)
    .slice(0, count)

const num = (item: Item, name: string): number => {
  const value = item.params[name]
  if (typeof value !== 'number') throw new Error(`${item.variant} has no number ${name}`)
  return value
}
const keyValue = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

describe('the family', () => {
  test('is registered, names the KC of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr5a.pages-for-adapter')).toBe(pagesForAdapter)
    expect(FAMILIES).toContain(pagesForAdapter)
    expect(familiesForKc('tr5a.adapter-pages')).toEqual([pagesForAdapter])
    for (const kc of pagesForAdapter.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(pagesForAdapter, 0).map((variant) => variant.id)).toEqual(['pages', 'to-run', 'free-after'])
    expect(offeredAt(pagesForAdapter, 2).map((variant) => variant.id)).toEqual(['pages', 'to-run', 'free-after', 'empty-share'])
    // Every item of the exit ticket is a number, so that its rule "at least one numeric" can always be met.
    for (const level of LEVELS) for (const seed of SEEDS.slice(0, 80)) expect(pagesForAdapter.make(seed, level).answer.kind).toBe('numeric')
  })

  test("rests on claims that say what it says: S-LoRA's page, its non-contiguous pool, the all-or-nothing load, and the engines' slots", () => {
    expect(claim('kv.slora.page-vector').text).toContain('each page is one vector of the hidden size')
    expect(claim('kv.slora.page-vector').text).toContain('a LoRA weight tensor of rank R takes up R pages')
    expect(claim('kv.slora.non-contiguous').text).toContain('non-contiguously')
    expect(claim('kv.kernelspace.lab02-all-or-nothing').text).toContain('all or nothing')
    expect(claim('vllm.lora.s-lora-scope').text).toContain('adapter weights are not pages of the KV pool')
    expect(claim('sglang.lora.pool').text).toContain('not a page pool shared with the KV cache')
  })
})

describe('the arithmetic, held to the sim', () => {
  test("the lesson's adapters take 4, 7 and 26 pages in pages of 163,840 bytes, and leave 20%, 8.6% and 1.5% of their pages empty", () => {
    const spec = kvPreset('two-kinds')
    expect(spec.pageBytes).toBe(163840)
    expect(kvAdapterCatalog(spec).map((adapter) => [adapter.rank, adapter.bytes, adapter.pages])).toEqual([
      [8, 524288, 4],
      [16, 1048576, 7],
      [64, 4194304, 26],
    ])
    expect([8, 16, 64].map((rank) => adapterPages(rank, 65536, 163840))).toEqual([4, 7, 26])
    expect([8, 16, 64].map((rank) => emptyBytes(rank, 65536, 163840))).toEqual([131072, 98304, 65536])
    expect([8, 16, 64].map((rank) => emptyShare(rank, 65536, 163840))).toEqual([20, 8.6, 1.5])
  })

  test('the adapter\'s bytes are the sim\'s kvLoraBytes, and a page is the sim\'s block, for every shape of the draws', () => {
    for (const seed of SEEDS) {
      const item = pagesForAdapter.make(seed, 3, 'pages')
      const [hidden, layers, projections, weightBytes] = [num(item, 'hidden'), num(item, 'adaptedLayers'), num(item, 'projections'), num(item, 'weightBytes')]
      const rank = num(item, 'rank')
      expect(unitBytes({ hidden, layers, projections, weightBytes }) * rank).toBe(kvLoraBytes({ hidden, layers, targets: projections, dtypeBytes: weightBytes }, rank))
      const layout = { layers: num(item, 'groupLayers'), block: num(item, 'block'), tokenBytes: num(item, 'tokenBytes') }
      const spec: KvSpec = {
        poolPages: 1,
        pageBytes: pageBytes(layout),
        tokenBytes: layout.tokenBytes,
        paddingLayers: 0,
        groups: [{ id: 'full0', kind: 'full', layers: layout.layers, blockTokens: layout.block }],
        prefixCaching: true,
      }
      expect(kvBlockBytes(spec, spec.groups[0])).toBe(num(item, 'page'))
      expect(keyValue(item)).toBe(kvAdapterPages(kvLoraBytes({ hidden, layers, targets: projections, dtypeBytes: weightBytes }, rank), num(item, 'page')))
    }
  })

  test('every key of `pages` is the sim\'s ⌈adapter bytes ÷ page bytes⌉, at every level', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 100)) {
        const item = pagesForAdapter.make(seed, level, 'pages')
        expect(keyValue(item)).toBe(kvAdapterPages(num(item, 'rank') * num(item, 'unit'), num(item, 'page')))
      }
    }
  })
})

/** The reference manager on a pool where `free` pages are free, found by loading a filler adapter that holds the rest. */
function poolWith(free: number, held: number): { manager: ReturnType<typeof kvReference>; spec: KvSpec } {
  const spec = kvPreset('one-group', free + held + 7)
  const manager = kvReference(spec)
  expect(manager.apply({ op: 'load-adapter', adapter: 99, pages: 7 })).toMatchObject({ ok: true })
  return { manager, spec }
}

describe('every other key is the reference manager\'s reply', () => {
  test('free-after: a load takes the adapter\'s pages, an unload gives them back, and a load that does not fit leaves the pool as it was', () => {
    const seen = new Set<string>()
    for (const level of LEVELS) {
      for (const seed of seedsOf('free-after', level, 60)) {
        const item = pagesForAdapter.make(seed, level, 'free-after')
        const [rank, unit, page, free] = [num(item, 'rank'), num(item, 'unit'), num(item, 'page'), num(item, 'free')]
        const pages = kvAdapterPages(rank * unit, page)
        const op = item.params['op']
        seen.add(String(op))
        const loaded: KvOp = { op: 'load-adapter', adapter: 0, pages }
        if (op === 'unload') {
          const { manager } = poolWith(free, pages)
          expect(manager.apply(loaded)).toMatchObject({ ok: true, free })
          expect(manager.apply({ op: 'unload-adapter', adapter: 0 })).toMatchObject({ ok: true, free: free + pages })
          expect(keyValue(item)).toBe(free + pages)
        } else {
          const { manager } = poolWith(free, 0)
          const reply = manager.apply(loaded)
          if (op === 'refuse') {
            expect(reply).toEqual({ ok: false, reason: 'no-pages', free })
            expect(manager.apply({ op: 'load-adapter', adapter: 1, pages: 0 + free })).toMatchObject({ ok: true, free: 0 })
          } else expect(reply).toMatchObject({ ok: true, free: free - pages })
          expect(keyValue(item)).toBe(reply.free)
        }
      }
    }
    expect([...seen].sort()).toEqual(['load', 'refuse', 'unload'])
  })

  test('to-run: an admit on a resident adapter takes only the request\'s pages, and one on an adapter that is not resident needs it loaded first', () => {
    const seen = new Set<boolean>()
    for (const level of LEVELS) {
      for (const seed of seedsOf('to-run', level, 60)) {
        const item = pagesForAdapter.make(seed, level, 'to-run')
        const [rank, unit, page, free, need] = [num(item, 'rank'), num(item, 'unit'), num(item, 'page'), num(item, 'free'), num(item, 'need')]
        const resident = item.params['resident'] === true
        seen.add(resident)
        const pages = kvAdapterPages(rank * unit, page)
        const spec = kvPreset('one-group', free + (resident ? pages : 0) + 11)
        const manager = kvReference(spec)
        // A resident adapter has taken its pages already, and a filler leaves exactly `free` pages in the pool.
        if (resident) expect(manager.apply({ op: 'load-adapter', adapter: 0, pages })).toMatchObject({ ok: true })
        expect(manager.apply({ op: 'load-adapter', adapter: 99, pages: 11 })).toMatchObject({ ok: true, free })
        // A request runs only when its adapter is resident: the admit is refused before the adapter is, and goes through after.
        const prompt = Array.from({ length: 16 * need }, (_, at) => at + 1)
        if (!resident) {
          expect(manager.apply({ op: 'admit', req: 1, prompt, adapter: 0 })).toMatchObject({ ok: false, reason: 'no-adapter' })
          expect(manager.apply({ op: 'load-adapter', adapter: 0, pages })).toMatchObject({ ok: true, free: free - pages })
        }
        const reply = manager.apply({ op: 'admit', req: 1, prompt, adapter: 0 })
        expect(reply).toMatchObject({ ok: true })
        expect(keyValue(item)).toBe(reply.free)
      }
    }
    expect(seen).toEqual(new Set([true, false]))
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(pagesForAdapter, level)) {
        const item = pagesForAdapter.make(seed, level, variant.id)
        expect(pagesForAdapter.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(pagesForAdapter, item, { seed, level, variant: variant.id })).toEqual([])
        expect(pagesForAdapter.grade(item, keyOf(item)).ok).toBe(true)
        expect(pagesForAdapter.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints no number in a sentence that is not a tagged part, and tags what it works out as derived', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = pagesForAdapter.make(seed, level)
        for (const parts of [item.stem, ...item.worked.map((step) => step.text), ...pagesForAdapter.solution(item).map((step) => step.text)]) {
          for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
        }
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const last = pagesForAdapter.solution(item).at(-1)?.result
        expect(last).toMatchObject({ tag: 'derived', value: keyValue(item) })
        expect(last?.unit).toBe(item.answer.kind === 'numeric' ? item.answer.unit : '')
      }
    }
  })

  test('levels 0 to 2 give the two sizes outright, and level 3 gives the shapes that make them', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of [0, 1, 2] as const) {
        const labels = pagesForAdapter.make(seed, level, 'pages').givens.map((given) => given.label)
        expect(labels).toEqual(['rank of the adapter', 'bytes for each unit of rank', 'bytes in a page'])
      }
      const labels = pagesForAdapter.make(seed, 3, 'pages').givens.map((given) => given.label)
      expect(labels).toEqual([
        'rank of the adapter',
        'hidden size',
        'layers adapted',
        'projections adapted in each layer',
        'bytes of a weight',
        'layers in a group',
        'tokens in a block',
        'bytes of a token in a layer',
      ])
      const steps = pagesForAdapter.solution(pagesForAdapter.make(seed, 3, 'pages'))
      expect(steps).toHaveLength(4)
      expect(plain(steps[0].text)).toContain('twice')
    }
  })

  test('level 0 shows a whole solution of another scene, level 1 the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['pages', 'to-run', 'free-after']) {
        const zero = pagesForAdapter.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(2)
        expect(zero.worked.at(-1)?.result?.value).not.toBe(keyValue(zero))
        expect(pagesForAdapter.make(seed, 1, variant)).toMatchObject({ worked: [expect.anything()] })
        expect(pagesForAdapter.make(seed, 2, variant).worked).toEqual([])
      }
    }
  })
})

describe('the scenes', () => {
  test('an adapter fills several pages and leaves the last part empty, so the rounding up is a part of the question', () => {
    for (const level of LEVELS) {
      for (const seed of seedsOf('pages', level, 200)) {
        const item = pagesForAdapter.make(seed, level, 'pages')
        const bytes = num(item, 'rank') * num(item, 'unit')
        expect(bytes % num(item, 'page')).not.toBe(0)
        expect(keyValue(item)).toBeGreaterThanOrEqual(4)
        expect(keyValue(item)).toBeLessThanOrEqual(120)
        expect(keyValue(item)).not.toBe(num(item, 'rank'))
      }
    }
  })

  test('a load that does not fit is rare, and the other operations are drawn about as often', () => {
    const counts: Record<string, number> = { load: 0, unload: 0, refuse: 0 }
    const seeds = seedsOf('free-after', 2, 600)
    for (const seed of seeds) counts[String(pagesForAdapter.make(seed, 2, 'free-after').params['op'])] += 1
    expect(counts.refuse / seeds.length).toBeGreaterThan(0.03)
    expect(counts.refuse / seeds.length).toBeLessThan(0.14)
    expect(Math.abs(counts.load - counts.unload) / seeds.length).toBeLessThan(0.12)
  })

  test('a request whose adapter is resident is as common as one whose adapter is not', () => {
    const seeds = seedsOf('to-run', 2, 600)
    const resident = seeds.filter((seed) => pagesForAdapter.make(seed, 2, 'to-run').params['resident'] === true).length
    expect(resident / seeds.length).toBeGreaterThan(0.4)
    expect(resident / seeds.length).toBeLessThan(0.6)
  })

  test('the empty share is a share of all the adapter\'s pages, in percent to the tenth, and the tolerance takes a rounded answer', () => {
    for (const seed of seedsOf('empty-share', 2, 100)) {
      const item = pagesForAdapter.make(seed, 2, 'empty-share')
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      expect(item.answer.unit).toBe('%')
      expect(item.answer.digits).toBe(1)
      expect(item.answer.truth).toBe(Math.round(item.answer.truth * 10) / 10)
      const exact = (100 * emptyBytes(num(item, 'rank'), num(item, 'unit'), num(item, 'page'))) / (keyValue(item) === 0 ? 1 : adapterPages(num(item, 'rank'), num(item, 'unit'), num(item, 'page')) * num(item, 'page'))
      expect(Math.abs(exact - item.answer.truth)).toBeLessThanOrEqual(0.05 + 1e-9)
      // The share to one decimal place and the share to the whole percent are both right when they are within a fiftieth of themselves or 0.05.
      expect(pagesForAdapter.grade(item, { kind: 'numeric', value: Math.round(exact * 10) / 10 }).ok).toBe(true)
      expect(pagesForAdapter.grade(item, { kind: 'numeric', value: exact * 1.5 + 1 }).ok).toBe(false)
    }
  })
})

describe('diagnoses', () => {
  const idOf = (item: Item, value: number): string | undefined => {
    const graded = pagesForAdapter.grade(item, { kind: 'numeric', value })
    return graded.ok ? 'right' : graded.diagnosis?.id
  }

  function expectNamed(item: Item, wrong: Readonly<Record<string, number>>, seen: Set<string>): void {
    const key = keyValue(item)
    for (const [id, value] of Object.entries(wrong)) {
      if (value === key) continue
      const rules = Object.entries(wrong).filter(([, other]) => other === value).map(([name]) => `tr5a.pages-for-adapter.${name}`)
      // An answer within the tolerance of the key is right, whatever rule it came from.
      const named = idOf(item, value)
      expect([id, value, named === 'right' || rules.includes(named ?? '')]).toEqual([id, value, true])
      if (named !== 'right') {
        seen.add(id)
        const message = pagesForAdapter.grade(item, { kind: 'numeric', value }).diagnosis?.message ?? []
        for (const part of message) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
        expect(plain(message).length).toBeGreaterThan(30)
      }
    }
  }

  test('pages: rounding down, rounding to the nearest, a page for each unit of rank, one unit alone, and the bytes are named', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('pages', 2, 300)) {
      const item = pagesForAdapter.make(seed, 2, 'pages')
      const [rank, unit, page] = [num(item, 'rank'), num(item, 'unit'), num(item, 'page')]
      const bytes = rank * unit
      expectNamed(
        item,
        {
          'rounded-down': Math.floor(bytes / page),
          'rounded-nearest': Math.floor((2 * bytes + page) / (2 * page)),
          'rank-as-pages': rank,
          'unit-only': Math.ceil(unit / page),
          'bytes-not-pages': bytes,
        },
        seen,
      )
    }
    expect([...seen].sort()).toEqual(['bytes-not-pages', 'rank-as-pages', 'rounded-down', 'rounded-nearest', 'unit-only'])
  })

  test('to-run: leaving the adapter out, counting a resident adapter twice, and leaving the request out are named', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('to-run', 2, 300)) {
      const item = pagesForAdapter.make(seed, 2, 'to-run')
      const [rank, unit, page, free, need] = [num(item, 'rank'), num(item, 'unit'), num(item, 'page'), num(item, 'free'), num(item, 'need')]
      const pages = adapterPages(rank, unit, page)
      expectNamed(item, { 'adapter-forgotten': free - need, 'counted-twice': free - need - pages, 'adapter-only': free - pages, 'request-only': need }, seen)
    }
    expect([...seen].sort()).toEqual(['adapter-forgotten', 'adapter-only', 'counted-twice', 'request-only'])
  })

  test('free-after: the wrong direction, no change, a page for each unit of rank, and a half-done load are named', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('free-after', 2, 600)) {
      const item = pagesForAdapter.make(seed, 2, 'free-after')
      const [rank, unit, page, free] = [num(item, 'rank'), num(item, 'unit'), num(item, 'page'), num(item, 'free')]
      const pages = adapterPages(rank, unit, page)
      const op = item.params['op']
      expectNamed(
        item,
        op === 'refuse'
          ? { 'took-the-free': 0, 'went-negative': free - pages, 'rank-as-pages': free - rank }
          : { 'wrong-direction': op === 'unload' ? free - pages : free + pages, 'no-change': free, 'rank-as-pages': op === 'unload' ? free + rank : free - rank },
        seen,
      )
    }
    expect([...seen].sort()).toEqual(['no-change', 'rank-as-pages', 'took-the-free', 'went-negative', 'wrong-direction'])
  })

  test('empty-share: the share of the last page, the filled share and the number of pages are named', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('empty-share', 2, 300)) {
      const item = pagesForAdapter.make(seed, 2, 'empty-share')
      const [rank, unit, page] = [num(item, 'rank'), num(item, 'unit'), num(item, 'page')]
      const pages = adapterPages(rank, unit, page)
      expectNamed(
        item,
        {
          'of-last-page': Math.round((1000 * emptyBytes(rank, unit, page)) / page) / 10,
          'filled-share': 100 - emptyShare(rank, unit, page),
          'pages-not-share': pages,
        },
        seen,
      )
    }
    expect([...seen].sort()).toEqual(['filled-share', 'of-last-page', 'pages-not-share'])
  })

  test('a number nobody could mean is wrong and has no diagnosis, and a response of the wrong kind is wrong and never throws', () => {
    const item = pagesForAdapter.make(SEEDS[0], 2, 'pages')
    expect(idOf(item, 12_345_678)).toBeUndefined()
    for (const response of [{ kind: 'choice', pick: 'a' }, { kind: 'numeric', value: Number.NaN }, { kind: 'numeric', value: -5 }] as const) {
      expect(pagesForAdapter.grade(item, response).ok).toBe(false)
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(pagesForAdapter, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(100, 4)) {
      const { seed } = drawInBand(pagesForAdapter, level, entropy)
      expect(pagesForAdapter.band(seed, level)).toBe(true)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(pagesForAdapter, level, bandedSeeds(pagesForAdapter, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) expect(row.rate).toBeLessThanOrEqual(0.15)
    }
  })

  test("keeps to the shared core: it imports no model of the sim, so that its code is a chunk of its own and brings none of the sim's (D-059)", () => {
    const source = readFileSync(new URL('../../packages/play/items/families/tr5a/pages-for-adapter.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from '(@es\/[^']+)'/g)].map((match) => match[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const specifier of imports) expect(specifier).toBe('@es/sim/core')
  })
})
