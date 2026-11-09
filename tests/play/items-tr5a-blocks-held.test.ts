/*
 * W1b-T05: `tr5a.blocks-held`, the pages a request holds in each KV group and across the groups. The tests hold the family's rules to the facts it
 * rests on: the claims about vLLM v0.33.0 that it cites, and the sim's hybrid KV model (`kvTableRule`, `kvPagesHeld` and the planner's port
 * `buildKvSpec`), through which every key is found again from the numbers that the ticket prints.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { bandAcceptance, BAND_FLOOR, drawInBand, familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, measureBlind, bandedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { blocksHeld, grownBlock, isNear, layerGrouping, pagesOfScene } from '@es/play/items/families/tr5a/blocks-held'
import { gcd, groupSizeOf, heldBy } from '@es/play/items/families/tr5a/kit'
import { buildKvSpec, kvBlocksHeld, kvPagesHeld, kvPreset, kvSpecProblems } from '../../packages/sim/kv'
import type { KvModelDesc } from '../../packages/sim/kv'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(300, 0x5a0b)

/** Banded seeds whose own variant is `variant`, so that the scene is a fair one: the band judges the variant the seed picks. */
const seedsOf = (variant: string, level: 0 | 1 | 2 | 3, count: number): number[] =>
  bandedSeeds(blocksHeld, level, 3000)
    .filter((seed) => blocksHeld.make(seed, level).variant === variant)
    .slice(0, count)

/** The numbers of an item's scene, which are its params. */
const param = (item: Item, name: string): number => {
  const value = item.params[name]
  if (typeof value !== 'number') throw new Error(`${item.variant} has no number ${name}`)
  return value
}

const keyValue = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

/** The model of the sim that an item's scene describes, by the planner's port (D-045). */
function modelOf(item: Item): KvModelDesc {
  const tokenBytes = item.variant === 'from-state' ? param(item, 'tokenBytes') : 1024
  switch (item.variant) {
    case 'sliding':
      return { tokenBytes, baseBlockTokens: param(item, 'block'), kinds: [{ kind: 'sliding', layers: 4, window: param(item, 'window') }] }
    case 'hybrid':
      return {
        tokenBytes,
        baseBlockTokens: param(item, 'block'),
        kinds: [
          { kind: 'full', layers: 4 },
          { kind: 'sliding', layers: 4 * param(item, 'groups'), window: param(item, 'window') },
        ],
      }
    case 'recurrent':
      // A state that exactly fills a layer's slice of a block leaves the attention block as it is.
      return {
        tokenBytes,
        baseBlockTokens: param(item, 'block'),
        kinds: [
          { kind: 'full', layers: 4 },
          { kind: 'state', layers: 4 * param(item, 'groups'), stateBytes: param(item, 'block') * tokenBytes, statePages: param(item, 'kept') },
        ],
      }
    case 'from-layers':
      return {
        tokenBytes,
        baseBlockTokens: param(item, 'block'),
        kinds: [
          { kind: 'full', layers: param(item, 'full') },
          { kind: 'sliding', layers: param(item, 'sliding'), window: param(item, 'window') },
        ],
      }
    case 'from-state':
      return {
        tokenBytes,
        baseBlockTokens: param(item, 'base'),
        kinds: [
          { kind: 'full', layers: param(item, 'attention') },
          { kind: 'state', layers: param(item, 'recurrent'), stateBytes: param(item, 'stateBytes'), statePages: param(item, 'kept') },
        ],
      }
    default:
      throw new Error(`no model for ${item.variant}`)
  }
}

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr5a.blocks-held')).toBe(blocksHeld)
    expect(FAMILIES).toContain(blocksHeld)
    for (const kc of blocksHeld.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const variant of blocksHeld.variants) for (const kc of variant.kcs) expect(blocksHeld.kcs).toContain(kc)
    expect(familiesForKc('tr5a.page-size-unification')).toEqual([blocksHeld])
    expect(familiesForKc('tr5a.state-pages')).toEqual([blocksHeld])
    expect(offeredAt(blocksHeld, 0).map((variant) => variant.id)).toEqual(['sliding', 'hybrid', 'recurrent', 'from-layers', 'from-state'])
    expect(offeredAt(blocksHeld, 2).map((variant) => variant.id)).toEqual(['sliding', 'hybrid', 'recurrent'])
    expect(offeredAt(blocksHeld, 3).map((variant) => variant.id)).toEqual(['from-layers', 'from-state'])
  })

  test("keeps the two lessons' items apart: level 2 is about a request and a model whose groups are given, level 3 about a model given by its layers", () => {
    // Lesson 1 teaches the first three KCs and draws at level 2; lesson 2 teaches the fourth and draws at level 3.
    const first = new Set(['tr5a.kv-groups', 'tr5a.sliding-free', 'tr5a.state-pages'])
    for (const variant of offeredAt(blocksHeld, 2)) for (const kc of variant.kcs) expect(first.has(kc)).toBe(true)
    for (const variant of offeredAt(blocksHeld, 3)) expect(variant.kcs).toEqual(['tr5a.page-size-unification'])
    for (const seed of SEEDS.slice(0, 120)) {
      expect(['sliding', 'hybrid', 'recurrent']).toContain(blocksHeld.make(seed, 2).variant)
      expect(['from-layers', 'from-state']).toContain(blocksHeld.make(seed, 3).variant)
    }
  })

  test('rests on claims that say what it says: the window, the state, the group size, the padding, and the grown block', () => {
    const skipped = claim('vllm.hybrid-kv.sliding-skipped-tokens').text
    for (const fact of ['max(0, computed tokens - window + 1)', 'whole blocks', 'rounded down']) expect(skipped).toContain(fact)
    expect(claim('vllm.hybrid-kv.mamba-hit').text).toContain('that one block')
    expect(claim('vllm.hybrid-kv.group-size').text).toContain('smallest layer count among the attention types')
    expect(claim('vllm.hybrid-kv.group-size-near').value).toBe(1.5)
    expect(claim('vllm.hybrid-kv.group-size-near').text).toContain('less than 1.5 times the smallest')
    expect(claim('vllm.hybrid-kv.padding-layers').text).toContain('padded with the missing layers')
    expect(claim('vllm.hybrid-kv.attn-block-inflate').text).toContain('smallest multiple of the kernel block size')
    expect(claim('vllm.hybrid-kv.page-unify').text).toContain('pads the state page up to the attention page')
    expect(claim('vllm.hybrid-kv.group-rules').text).toContain('every group has the same page size')
  })
})

describe("the model, held to the design document's examples and to the sim", () => {
  test('the design document\'s request holds 7 + 2 + 2 = 11 pages, and one token more makes it 14 (the lesson\'s card)', () => {
    expect(claim('vllm.hybrid-kv.doc-example-blocks').value).toBe(11)
    const model = { variant: 'hybrid', tokens: 112, block: 16, window: 32, groups: 2 } as const
    expect(pagesOfScene(model)).toBe(11)
    expect(pagesOfScene({ ...model, tokens: 113 })).toBe(14)
    const spec = kvPreset('two-kinds')
    expect(kvPagesHeld(spec, 112)).toBe(11)
    expect(kvPagesHeld(spec, 113)).toBe(14)
  })

  test("Gemma-3-27b's layers make seven groups of ten, and gpt-oss-20b with its drafter two groups of thirteen", () => {
    expect(claim('vllm.hybrid-kv.doc-gemma3-layers').text).toContain('52 sliding-window and 10 full-attention layers')
    expect(claim('vllm.hybrid-kv.doc-gemma3-layers').text).toContain('7 groups')
    expect(layerGrouping(10, 52)).toEqual({ size: 10, full: 1, other: 6 })
    expect(claim('vllm.hybrid-kv.group-size-example').text).toContain('12 sliding-window layers and 13 full-attention layers')
    expect(layerGrouping(13, 12)).toEqual({ size: 13, full: 1, other: 1 })
    // The document's counterexample: 20 full and 30 sliding, where the heuristic takes 20 and not 10.
    expect(claim('vllm.hybrid-kv.group-size-known-gap').text).toContain('20 full-attention layers with 30 sliding-window layers')
    expect(layerGrouping(20, 30)).toEqual({ size: 20, full: 1, other: 2 })
  })

  test("the lesson's tables: a request of 4,096 tokens holds 260 pages, 128 + 3 × 2 = 134 in a model with recurrent layers, and 280 in Gemma-3's", () => {
    expect(pagesOfScene({ variant: 'hybrid', tokens: 4096, block: 16, window: 32, groups: 2 })).toBe(260)
    expect(pagesOfScene({ variant: 'from-state', tokens: 4096, base: 16, tokenBytes: 1024, stateBytes: 32768, attention: 8, recurrent: 24, kept: 2 })).toBe(134)
    expect(grownBlock(16, 1024, 32768)).toBe(32)
    expect(pagesOfScene({ variant: 'from-layers', tokens: 4096, block: 16, window: 64, full: 10, sliding: 52 })).toBe(280)
  })

  test('every key is what the sim holds for the model the ticket describes, over the planner\'s port, at every level that offers the variant', () => {
    let checked = 0
    for (const level of LEVELS) {
      for (const variant of offeredAt(blocksHeld, level)) {
        for (const seed of SEEDS.slice(0, 80)) {
          const item = blocksHeld.make(seed, level, variant.id)
          const spec = buildKvSpec(modelOf(item), 64)
          expect(kvSpecProblems(spec)).toEqual([])
          const tokens = param(item, 'tokens')
          const expected = item.variant === 'sliding' ? kvBlocksHeld(spec, 'sw0', tokens) : kvPagesHeld(spec, tokens)
          expect([item.variant, level, seed, keyValue(item)]).toEqual([item.variant, level, seed, expected])
          checked += 1
        }
      }
    }
    // Five variants at levels 0 and 1, three at level 2 and two at level 3.
    expect(checked).toBe(80 * (5 + 5 + 3 + 2))
  })

  test('the planner\'s group counts are the port\'s: the group size is the fewest layers or the most when that is under 1.5 times the fewest', () => {
    for (let full = 4; full <= 40; full += 1) {
      for (let sliding = 4; sliding <= 64; sliding += 3) {
        const spec = buildKvSpec({ tokenBytes: 1024, baseBlockTokens: 16, kinds: [{ kind: 'full', layers: full }, { kind: 'sliding', layers: sliding, window: 64 }] }, 64)
        const grouping = layerGrouping(full, sliding)
        expect(spec.groups.length).toBe(grouping.full + grouping.other)
        expect(spec.groups.filter((group) => group.kind === 'full').length).toBe(grouping.full)
        expect(spec.groups[0].layers + (spec.groups[0].padLayers ?? 0)).toBe(grouping.size)
        expect(groupSizeOf([full, sliding])).toBe(grouping.size)
        expect(isNear(full, sliding)).toBe(grouping.size === Math.max(full, sliding))
      }
    }
  })

  test('the pages of one group by kind are the sim\'s table rule', () => {
    const spec = kvPreset('two-kinds')
    for (const tokens of [1, 15, 16, 17, 31, 32, 33, 47, 48, 49, 111, 112, 113, 1000, 4096]) {
      expect(heldBy.full(tokens, 16)).toBe(kvBlocksHeld(spec, 'full0', tokens))
      expect(heldBy.sliding(tokens, 16, 32)).toBe(kvBlocksHeld(spec, 'sw0', tokens))
    }
    const state = kvPreset('state')
    for (const tokens of [1, 31, 32, 33, 64, 65, 95, 4096]) expect(heldBy.state(tokens, 32, 2)).toBe(kvBlocksHeld(state, 'state0', tokens))
    expect(gcd(52, 10)).toBe(2)
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(blocksHeld, level)) {
        const item = blocksHeld.make(seed, level, variant.id)
        expect(blocksHeld.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(blocksHeld, item, { seed, level, variant: variant.id })).toEqual([])
        expect(blocksHeld.grade(item, keyOf(item)).ok).toBe(true)
        expect(blocksHeld.grade(item, wrongOf(item)).ok).toBe(false)
        expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'pages', tolerance: {} })
      }
    }
  })

  test('prints no number in a sentence that is not a tagged part, and tags the numbers it works out as derived', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of LEVELS) {
        const item = blocksHeld.make(seed, level)
        for (const parts of [item.stem, ...item.worked.map((step) => step.text), ...blocksHeld.solution(item).map((step) => step.text)]) {
          for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
        }
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const last = blocksHeld.solution(item).at(-1)?.result
        expect(last).toMatchObject({ unit: 'pages', tag: 'derived', value: keyValue(item) })
      }
    }
  })

  test('without a variant named, the seed chooses one the level offers', () => {
    for (const level of LEVELS) {
      const seen = new Set(SEEDS.map((seed) => blocksHeld.make(seed, level).variant))
      expect(seen).toEqual(new Set(offeredAt(blocksHeld, level).map((variant) => variant.id)))
    }
  })

  test('level 0 shows a whole solution of another scene, level 1 the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['sliding', 'hybrid', 'recurrent', 'from-layers', 'from-state']) {
        const zero = blocksHeld.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(3)
        // Other numbers: the example's last result is not this item's key.
        expect(zero.worked.at(-1)?.result?.value).not.toBe(keyValue(zero))
        expect(blocksHeld.make(seed, 1, variant).worked).toHaveLength(1)
      }
      expect(blocksHeld.make(seed, 2, 'sliding').worked).toEqual([])
      expect(blocksHeld.make(seed, 3, 'from-layers').worked).toEqual([])
    }
  })
})

describe('the scenes', () => {
  test('a sliding item has let go of a block, or is the short request that has not filled its window yet and holds every block it has', () => {
    let short = 0
    let long = 0
    for (const seed of seedsOf('sliding', 2, 400)) {
      const item = blocksHeld.make(seed, 2, 'sliding')
      const [tokens, block, window] = [param(item, 'tokens'), param(item, 'block'), param(item, 'window')]
      expect(window).toBeGreaterThanOrEqual(2 * block)
      if (tokens < window) {
        short += 1
        expect(keyValue(item)).toBe(Math.ceil(tokens / block))
      } else {
        long += 1
        expect(keyValue(item)).toBeLessThan(Math.ceil(tokens / block))
      }
    }
    expect(short).toBeGreaterThan(0)
    // About one request in seven is short of its window.
    expect(short / (short + long)).toBeLessThan(0.3)
  })

  test("a window is not a block count: the pages are the window's blocks or one more, depending on the length", () => {
    const counts = new Set<number>()
    for (const seed of seedsOf('sliding', 2, 600)) {
      const item = blocksHeld.make(seed, 2, 'sliding')
      const [tokens, block, window] = [param(item, 'tokens'), param(item, 'block'), param(item, 'window')]
      if (tokens < window) continue
      const key = keyValue(item)
      const base = Math.ceil(window / block)
      expect([key === base, key === base + 1].some(Boolean)).toBe(true)
      counts.add(key - base)
    }
    expect(counts).toEqual(new Set([0, 1]))
  })

  test('a state group keeps its pages however long the request runs, and a request shorter than that holds every block it has', () => {
    for (const seed of seedsOf('recurrent', 2, 400)) {
      const item = blocksHeld.make(seed, 2, 'recurrent')
      const [tokens, block, groups, kept] = [param(item, 'tokens'), param(item, 'block'), param(item, 'groups'), param(item, 'kept')]
      const full = Math.ceil(tokens / block)
      expect(keyValue(item)).toBe(full + groups * Math.min(full, kept))
    }
  })

  test('the layer counts cover both rules of the planner: the most under 1.5 times the fewest, and not', () => {
    const rules = { near: 0, far: 0 }
    for (const seed of seedsOf('from-layers', 3, 600)) {
      const item = blocksHeld.make(seed, 3, 'from-layers')
      const [full, sliding] = [param(item, 'full'), param(item, 'sliding')]
      rules[isNear(full, sliding) ? 'near' : 'far'] += 1
      expect(Math.max(full, sliding)).toBeLessThanOrEqual(64)
    }
    expect(rules.near).toBeGreaterThan(100)
    expect(rules.far).toBeGreaterThan(100)
  })

  test('the attention block grows by whole steps of the kernel\'s block, from one and a half steps to five', () => {
    const blocks = new Set<number>()
    for (const seed of seedsOf('from-state', 3, 400)) {
      const item = blocksHeld.make(seed, 3, 'from-state')
      const [base, tokenBytes, stateBytes] = [param(item, 'base'), param(item, 'tokenBytes'), param(item, 'stateBytes')]
      const block = grownBlock(base, tokenBytes, stateBytes)
      blocks.add(block)
      expect(block % base).toBe(0)
      expect(block * tokenBytes).toBeGreaterThanOrEqual(stateBytes)
      expect((block - base) * tokenBytes).toBeLessThan(stateBytes)
    }
    expect([...blocks].sort((a, b) => a - b)).toEqual([32, 48, 64, 80])
  })
})

describe('diagnoses', () => {
  const grade = (item: Item, value: number) => blocksHeld.grade(item, { kind: 'numeric', value })
  const idOf = (item: Item, value: number): string | undefined => {
    const graded = grade(item, value)
    return graded.ok ? 'right' : graded.diagnosis?.id
  }

  /** Each wrong number that a rule gives is named by a rule that gives it: a number two rules give is named by the likelier, so by one of them. */
  function expectNamed(item: Item, wrong: Readonly<Record<string, number>>, seen: Set<string>): void {
    const key = keyValue(item)
    for (const [id, value] of Object.entries(wrong)) {
      if (value === key) continue
      const rules = Object.entries(wrong).filter(([, other]) => other === value).map(([name]) => `tr5a.blocks-held.${name}`)
      expect([id, value, rules.includes(idOf(item, value) ?? '')]).toEqual([id, value, true])
      seen.add(id)
      const message = grade(item, value).diagnosis?.message ?? []
      for (const part of message) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
      expect(plain(message).length).toBeGreaterThan(30)
    }
  }

  test('a wrong number that a rule of a sliding group recognises is named, with a sentence in tagged parts', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('sliding', 2, 300)) {
      const item = blocksHeld.make(seed, 2, 'sliding')
      const [tokens, block, window] = [param(item, 'tokens'), param(item, 'block'), param(item, 'window')]
      expectNamed(
        item,
        {
          'all-blocks': Math.ceil(tokens / block),
          'window-in-blocks': Math.ceil(window / block),
          'window-rounded-down': Math.floor(window / block),
          'window-off-by-one': Math.ceil(tokens / block) - Math.floor(Math.max(0, tokens - window) / block),
          'released-not-held': Math.floor(Math.max(0, tokens - window + 1) / block),
          'tokens-not-pages': tokens,
        },
        seen,
      )
    }
    expect([...seen].sort()).toEqual(['all-blocks', 'released-not-held', 'tokens-not-pages', 'window-in-blocks', 'window-off-by-one', 'window-rounded-down'])
  })

  test('the groups of a hybrid model and of a recurrent one are named when one is left out or counted as another', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('hybrid', 2, 200)) {
      const item = blocksHeld.make(seed, 2, 'hybrid')
      const [tokens, block, window, groups] = [param(item, 'tokens'), param(item, 'block'), param(item, 'window'), param(item, 'groups')]
      const full = Math.ceil(tokens / block)
      const slide = heldBy.sliding(tokens, block, window)
      expectNamed(item, { 'all-full': (1 + groups) * full, 'one-sliding': full + slide, 'no-full': groups * slide, 'full-only': full }, seen)
    }
    for (const seed of seedsOf('recurrent', 2, 200)) {
      const item = blocksHeld.make(seed, 2, 'recurrent')
      const [tokens, block, groups, kept] = [param(item, 'tokens'), param(item, 'block'), param(item, 'groups'), param(item, 'kept')]
      const full = Math.ceil(tokens / block)
      const state = Math.min(full, kept)
      expectNamed(item, { 'state-grows': (1 + groups) * full, 'one-state': full + state, 'no-full': groups * state, 'full-only': full }, seen)
    }
    expect([...seen].sort()).toEqual(['all-full', 'full-only', 'no-full', 'one-sliding', 'one-state', 'state-grows'])
  })

  test("the planner's rules are named when a learner skips one: a table for every layer, one group a kind, groups by the ratio, the fewest alone", () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('from-layers', 3, 400)) {
      const item = blocksHeld.make(seed, 3, 'from-layers')
      const [tokens, block, window, full, sliding] = [param(item, 'tokens'), param(item, 'block'), param(item, 'window'), param(item, 'full'), param(item, 'sliding')]
      const f = heldBy.full(tokens, block)
      const s = heldBy.sliding(tokens, block, window)
      const fewest = Math.min(full, sliding)
      const grouping = layerGrouping(full, sliding)
      expectNamed(
        item,
        {
          'per-layer': full * f + sliding * s,
          'one-each': f + s,
          'by-ratio': (full / gcd(full, sliding)) * f + (sliding / gcd(full, sliding)) * s,
          'smallest-only': Math.ceil(full / fewest) * f + Math.ceil(sliding / fewest) * s,
          'all-full': (grouping.full + grouping.other) * f,
        },
        seen,
      )
    }
    expect([...seen].sort()).toEqual(['all-full', 'by-ratio', 'one-each', 'per-layer', 'smallest-only'])
  })

  test("the kernel's block is named when a learner leaves the attention block as it was, and a state group's pages when it is taken for a full group's", () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('from-state', 3, 300)) {
      const item = blocksHeld.make(seed, 3, 'from-state')
      const [tokens, base, tokenBytes, stateBytes, attention, recurrent, kept] = ['tokens', 'base', 'tokenBytes', 'stateBytes', 'attention', 'recurrent', 'kept'].map((name) => param(item, name))
      const grouping = layerGrouping(attention, recurrent)
      const block = grownBlock(base, tokenBytes, stateBytes)
      const fewest = Math.min(attention, recurrent)
      expect(block).toBeGreaterThan(base)
      expectNamed(
        item,
        {
          'block-not-grown': grouping.full * heldBy.full(tokens, base) + grouping.other * heldBy.state(tokens, base, kept),
          'state-grows': (grouping.full + grouping.other) * heldBy.full(tokens, block),
          'smallest-only': Math.ceil(attention / fewest) * heldBy.full(tokens, block) + Math.ceil(recurrent / fewest) * heldBy.state(tokens, block, kept),
          'per-layer': attention * heldBy.full(tokens, block) + recurrent * heldBy.state(tokens, block, kept),
          'one-each': heldBy.full(tokens, block) + heldBy.state(tokens, block, kept),
        },
        seen,
      )
    }
    expect([...seen].sort()).toEqual(['block-not-grown', 'one-each', 'per-layer', 'smallest-only', 'state-grows'])
  })

  test('a number nobody could mean is wrong and has no diagnosis, and a response of the wrong kind is wrong and never throws', () => {
    const item = blocksHeld.make(SEEDS[0], 2, 'sliding')
    expect(idOf(item, 12_345_678)).toBeUndefined()
    for (const response of [
      { kind: 'choice', pick: 'a' },
      { kind: 'numeric', value: Number.NaN },
      { kind: 'numeric', value: Number.POSITIVE_INFINITY },
      { kind: 'numeric', value: -5 },
    ] as const) {
      expect(blocksHeld.grade(item, response).ok).toBe(false)
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(blocksHeld, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(100, 4)) {
      const { seed } = drawInBand(blocksHeld, level, entropy)
      expect(blocksHeld.band(seed, level)).toBe(true)
    }
  })

  test('the keys of a variant are spread, so that no constant passes more than the bound at any level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(blocksHeld, level, bandedSeeds(blocksHeld, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) expect(row.rate).toBeLessThanOrEqual(0.15)
    }
  })

  test("keeps to the shared core: it imports no model of the sim, so that its code is a chunk of its own and brings none of the sim's (D-059)", () => {
    for (const file of ['blocks-held.ts', 'kit.ts']) {
      const source = readFileSync(new URL(`../../packages/play/items/families/tr5a/${file}`, import.meta.url), 'utf8')
      const imports = [...source.matchAll(/from '(@es\/[^']+)'/g)].map((match) => match[1])
      expect(imports.length).toBeGreaterThan(0)
      for (const specifier of imports) expect([file, specifier]).toEqual([file, '@es/sim/core'])
    }
  })
})
