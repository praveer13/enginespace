/*
 * W1b-T05: `tr5a.slots-vs-pages`, adapter slots as the pinned engines use them against adapters paged in one pool, and when slots are enough. The
 * tests hold the family to the facts it rests on: every engine fact is a claim about vLLM v0.33.0 or SGLang v0.5.23 that the tests read, the
 * arithmetic is held to the sim's page counts and to the lesson's own table, and the scheduler's cap is held to a second statement of the same rule.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { bandAcceptance, bandedSeeds, BAND_FLOOR, drawInBand, familiesForKc, familyById, FAMILIES, fixedSeeds, LEVELS, measureBlind, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { capPass, heldBack, idleShare, judge, slotPages, slotsVsPages } from '@es/play/items/families/tr5a/slots-vs-pages'
import { buildLevel } from '../../packages/play/pool/levels'
import { kvAdapterPages, kvPreset, kvReference } from '../../packages/sim/kv'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS } from './items-tr6-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(300, 0x5107)

const seedsOf = (variant: string, level: 0 | 1 | 2 | 3, count: number): number[] =>
  bandedSeeds(slotsVsPages, level, 4000)
    .filter((seed) => slotsVsPages.make(seed, level).variant === variant)
    .slice(0, count)

const num = (item: Item, name: string): number => {
  const value = item.params[name]
  if (typeof value !== 'number') throw new Error(`${item.variant} has no number ${name}`)
  return value
}
const text = (item: Item, name: string): string => {
  const value = item.params[name]
  if (typeof value !== 'string') throw new Error(`${item.variant} has no text ${name}`)
  return value
}
const keyValue = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

describe('the family', () => {
  test('is registered, names the KC of the graph that no other artifact carries, and offers its variants at the levels it says', () => {
    expect(familyById('tr5a.slots-vs-pages')).toBe(slotsVsPages)
    expect(FAMILIES).toContain(slotsVsPages)
    expect(familiesForKc('tr5a.slots-vs-pages')).toEqual([slotsVsPages])
    for (const kc of slotsVsPages.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(slotsVsPages, 0).map((variant) => variant.id)).toEqual(['slot-idle', 'slots-take', 'enough', 'pinned'])
    expect(offeredAt(slotsVsPages, 2).map((variant) => variant.id)).toEqual(['slot-idle', 'slots-take', 'cap', 'enough', 'pinned'])
    expect(offeredAt(slotsVsPages, 3).map((variant) => variant.id)).toEqual(['slot-idle', 'slots-take'])
  })

  test("rests on claims that say what it says: vLLM's slots, their width, the cap on adapters, and SGLang's pool, which are not pages of the KV pool (D-042)", () => {
    expect(claim('vllm.lora.max-loras-default').value).toBe(1)
    expect(claim('vllm.lora.max-rank-default').value).toBe(16)
    expect(claim('sglang.lora.max-loras-per-batch').value).toBe(8)
    expect(claim('vllm.lora.slot-count').text).toContain('lora_slots, as max_loras')
    expect(claim('vllm.lora.stacked-max-rank').text).toContain('max_loras deep and max_lora_rank wide, whatever the rank of the adapter')
    expect(claim('vllm.lora.smaller-adapter-in-slot').text).toContain('the rest of the slot stays zero')
    expect(claim('vllm.lora.layer-built-with-slots').text).toContain('creates the layer\'s weights at once for max_loras slots')
    expect(claim('vllm.lora.slots-built-at-init').text).toContain('in its constructor, and not when an adapter is first requested')
    expect(claim('vllm.lora.cpu-cache').text).toContain('keeps up to max_cpu_loras adapters in CPU memory')
    expect(claim('vllm.lora.lru-slots').text).toContain('evicts the oldest active adapter')
    expect(claim('vllm.lora.admission-cap').text).toContain('skips a waiting request whose adapter is not already scheduled once the distinct adapters in the batch reach max_loras')
    expect(claim('vllm.lora.admission-cap').text).toContain('The request waits')
    expect(claim('vllm.lora.s-lora-scope').text).toContain('adapter weights are not pages of the KV pool')
    expect(claim('sglang.lora.pool').text).toContain('not a page pool shared with the KV cache')
    expect(claim('sglang.lora.buffers-max-rank').text).toContain('every slot is as wide as the largest adapter the pool will accept')
    expect(claim('sglang.lora.rank-cap').text).toContain('refuses it')
    expect(claim('sglang.lora.cpu-cap').text).toContain('adapters stay loaded in CPU memory')
    expect(claim('kv.slora.static-pool').text).toContain('KV caches and adapter weights then share it')
  })
})

describe('the arithmetic', () => {
  test('a rank-8 adapter in a slot sized for rank 64 leaves 87.5% of the slot unused (the lesson\'s prediction)', () => {
    expect(idleShare(64, [8])).toBe(87.5)
    expect(idleShare(64, [64])).toBe(0)
    expect(idleShare(40, [36, 20])).toBe(30)
  })

  test("two slots sized for rank 64 take 52 of The Reach-In's 160 pages before the first request, which leaves the lesson's 108 pages", () => {
    const level = buildLevel('adapters', 0)
    expect(level.spec.poolPages).toBe(160)
    const widest = level.kits.reduce((most, kit) => Math.max(most, kit.pages), 0)
    expect(widest).toBe(26)
    const scene = { slots: 2, slotRank: 64, unit: 65536, page: level.spec.pageBytes }
    expect(slotPages(scene)).toBe(widest)
    expect(level.spec.poolPages - scene.slots * slotPages(scene)).toBe(108)
  })

  test('every key of `slots-take` is the pool less the pages of the slots, as the reference manager holds a pool whose slots are loaded first', () => {
    for (const level of LEVELS) {
      for (const seed of seedsOf('slots-take', level, 60)) {
        const item = slotsVsPages.make(seed, level, 'slots-take')
        const [slots, rank, unit, page, pool] = ['slots', 'slotRank', 'unit', 'page', 'pool'].map((name) => num(item, name))
        const pages = kvAdapterPages(rank * unit, page)
        expect(slotPages({ slotRank: rank, unit, page })).toBe(pages)
        const manager = kvReference(kvPreset('one-group', pool))
        // The slots are reserved first: an adapter's worth of pages each, which no request and no other adapter gets.
        let free = pool
        for (let slot = 0; slot < slots; slot += 1) {
          const reply = manager.apply({ op: 'load-adapter', adapter: slot, pages })
          expect(reply.ok).toBe(true)
          free = reply.free
        }
        expect(keyValue(item)).toBe(free)
      }
    }
  })

  test('the cap holds back a request exactly when its adapter is not among the first adapters that the queue names, as many as there are slots', () => {
    for (const slots of [1, 2, 3, 4]) {
      for (const seed of seedsOf('cap', 2, 120)) {
        const item = slotsVsPages.make(seed, 2, 'cap')
        const queue = text(item, 'queue')
        const batch = new Set<string>()
        for (const adapter of queue) if (batch.size < slots) batch.add(adapter)
        const outside = [...queue].filter((adapter) => !batch.has(adapter)).length
        expect(capPass(slots, queue).held.filter(Boolean).length).toBe(outside)
      }
    }
    // The lesson's rule on small queues, every queue of up to seven requests on three adapters.
    const letters = ['a', 'b', 'c']
    let queues = 0
    const walk = (queue: string): void => {
      if (queue.length > 0) {
        for (const slots of [1, 2, 3]) {
          const batch = new Set<string>()
          for (const adapter of queue) if (batch.size < slots) batch.add(adapter)
          expect(heldBack({ variant: 'cap', slots, queue })).toBe([...queue].filter((adapter) => !batch.has(adapter)).length)
        }
        queues += 1
      }
      if (queue.length < 7) for (const letter of letters) walk(queue + letter)
    }
    walk('')
    expect(queues).toBe(3 + 9 + 27 + 81 + 243 + 729 + 2187)
  })

  test('the cap lets a request go in when its adapter is in the batch already, and skips it otherwise, and a request that is skipped does not stop the ones behind it', () => {
    expect(capPass(2, 'abacbda')).toEqual({ held: [false, false, false, true, false, true, false], batch: ['a', 'b'] })
    // The request for `c` is skipped, and the next one for `a` still goes in.
    expect(capPass(1, 'acaca').held).toEqual([false, true, false, true, false])
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(slotsVsPages, level)) {
        const item = slotsVsPages.make(seed, level, variant.id)
        expect(slotsVsPages.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(slotsVsPages, item, { seed, level, variant: variant.id })).toEqual([])
        expect(slotsVsPages.grade(item, keyOf(item)).ok).toBe(true)
        expect(slotsVsPages.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('prints no number in a sentence that is not a tagged part, in the stem, the options, the whys and the solution', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      for (const level of LEVELS) {
        for (const variant of offeredAt(slotsVsPages, level)) {
          const item = slotsVsPages.make(seed, level, variant.id)
          const sentences = [item.stem, ...item.worked.map((step) => step.text), ...slotsVsPages.solution(item).map((step) => step.text)]
          if (item.answer.kind === 'choice') for (const option of item.answer.options) sentences.push(option.text, option.why)
          for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
          for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        }
      }
    }
  })

  test('level 0 shows a whole solution of another scene, level 1 the words of the first step, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['slot-idle', 'slots-take', 'enough', 'pinned']) {
        const zero = slotsVsPages.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(1)
        if (zero.answer.kind === 'numeric') expect(zero.worked.at(-1)?.result?.value).not.toBe(keyValue(zero))
        expect(slotsVsPages.make(seed, 1, variant).worked).toHaveLength(1)
        expect(slotsVsPages.make(seed, 2, variant).worked).toEqual([])
      }
      expect(slotsVsPages.make(seed, 1, 'cap').worked).toHaveLength(1)
      expect(slotsVsPages.make(seed, 3, 'slot-idle').worked).toEqual([])
    }
  })

  test('a mix of ranks at level 3 is a share of all the slots, and a single adapter at the levels below', () => {
    for (const seed of seedsOf('slot-idle', 3, 80)) {
      const ranks = text(slotsVsPages.make(seed, 3, 'slot-idle'), 'ranks').split('.').map(Number)
      expect(ranks.length).toBeGreaterThanOrEqual(2)
      expect(ranks.length).toBeLessThanOrEqual(4)
    }
    for (const seed of seedsOf('slot-idle', 2, 80)) expect(text(slotsVsPages.make(seed, 2, 'slot-idle'), 'ranks').split('.')).toHaveLength(1)
  })
})

describe('slot-idle and slots-take', () => {
  test('an adapter fills less of a slot than the slot is wide, and every rank is a step of four', () => {
    for (const level of LEVELS) {
      for (const seed of seedsOf('slot-idle', level, 120)) {
        const item = slotsVsPages.make(seed, level, 'slot-idle')
        const ranks = text(item, 'ranks').split('.').map(Number)
        for (const rank of ranks) {
          expect(rank % 4).toBe(0)
          expect(rank).toBeLessThan(num(item, 'slotRank'))
        }
        expect(keyValue(item)).toBeGreaterThanOrEqual(5)
        expect(keyValue(item)).toBeLessThanOrEqual(94)
        expect(keyValue(item)).toBe(idleShare(num(item, 'slotRank'), ranks))
      }
    }
  })

  test('the pool keeps room after the slots, and a slot fills several pages', () => {
    for (const level of LEVELS) {
      for (const seed of seedsOf('slots-take', level, 100)) {
        const item = slotsVsPages.make(seed, level, 'slots-take')
        expect(keyValue(item)).toBeGreaterThanOrEqual(20)
        expect(slotPages({ slotRank: num(item, 'slotRank'), unit: num(item, 'unit'), page: num(item, 'page') })).toBeGreaterThanOrEqual(3)
        expect((num(item, 'slotRank') * num(item, 'unit')) % num(item, 'page')).not.toBe(0)
      }
    }
  })
})

describe('cap', () => {
  test('the requests held back are anywhere from two to twelve, drawn first, and the batch is the first adapters the queue names', () => {
    const keys = new Set<number>()
    for (const seed of seedsOf('cap', 2, 400)) {
      const item = slotsVsPages.make(seed, 2, 'cap')
      const [slots, queue] = [num(item, 'slots'), text(item, 'queue')]
      keys.add(keyValue(item))
      expect(new Set(queue).size).toBeGreaterThan(slots)
      expect(capPass(slots, queue).batch).toEqual([...new Set(queue)].slice(0, slots))
    }
    expect([...keys].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })
})

describe('enough', () => {
  const deploymentsOf = (item: Item): { kind: string; slots: number; slotRank: number; ranks: number[]; arriving: number }[] =>
    text(item, 'deployments')
      .split(';')
      .map((entry) => {
        const [kind, slots, slotRank, ranks, arriving] = entry.split(':')
        return { kind, slots: Number(slots), slotRank: Number(slotRank), ranks: ranks.split('.').map(Number), arriving: Number(arriving) }
      })

  test('exactly one deployment suits slots, and each of the others breaks one of the lesson\'s three conditions, a different one each', () => {
    for (const seed of seedsOf('enough', 2, 300)) {
      const item = slotsVsPages.make(seed, 2, 'enough')
      const deployments = deploymentsOf(item)
      expect(deployments).toHaveLength(4)
      const judged = deployments.map((d) => ({ kind: d.kind, ...judge({ kind: d.kind as 'suits', slots: d.slots, slotRank: d.slotRank, ranks: d.ranks, arriving: d.arriving }) }))
      expect(judged.filter((j) => j.suits).map((j) => j.kind)).toEqual(['suits'])
      expect(judged.map((j) => j.kind).sort()).toEqual(['rank-spread', 'suits', 'too-many', 'unknown'])
      for (const j of judged) {
        if (j.kind === 'too-many') expect([j.fits, j.narrow, j.known]).toEqual([false, true, true])
        if (j.kind === 'rank-spread') expect([j.fits, j.narrow, j.known]).toEqual([true, false, true])
        if (j.kind === 'unknown') expect([j.fits, j.narrow, j.known]).toEqual([true, true, false])
        if (j.kind === 'suits') expect([j.fits, j.narrow, j.known]).toEqual([true, true, true])
      }
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(deployments[['a', 'b', 'c', 'd'].indexOf(item.answer.correct)].kind).toBe('suits')
    }
  })

  test('the deployments that suit are near the slots\' rank, within a quarter, and an adapter that arrives later is twice as wide as a slot', () => {
    for (const seed of seedsOf('enough', 2, 200)) {
      for (const d of deploymentsOf(slotsVsPages.make(seed, 2, 'enough'))) {
        if (d.kind === 'suits' || d.kind === 'unknown') for (const rank of d.ranks) expect(rank).toBeGreaterThanOrEqual(0.75 * d.slotRank)
        if (d.kind === 'rank-spread') for (const rank of d.ranks) expect(rank).toBeLessThanOrEqual(d.slotRank / 4)
        expect(d.arriving).toBe(d.kind === 'unknown' ? 2 * d.slotRank : 0)
      }
    }
  })

  test('is drawn answer first: each of the four is the key on about a quarter of the seeds, and every wrong option names the condition it breaks', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    const seeds = seedsOf('enough', 2, 800)
    for (const seed of seeds) {
      const item = slotsVsPages.make(seed, 2, 'enough')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      counts[item.answer.correct] += 1
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(80)
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toMatch(/^tr5a\.slots-vs-pages\.(too-many|rank-spread|unknown)$/)
      }
      expect(item.answer.options.map((option) => option.miss ?? 'key').sort()).toEqual(['key', 'tr5a.slots-vs-pages.rank-spread', 'tr5a.slots-vs-pages.too-many', 'tr5a.slots-vs-pages.unknown'])
    }
    for (const id of Object.keys(counts)) {
      expect(counts[id] / seeds.length).toBeGreaterThan(0.18)
      expect(counts[id] / seeds.length).toBeLessThan(0.34)
    }
  })
})

describe('pinned', () => {
  const pinned = (level: 0 | 1 | 2 | 3, count: number): Item[] => seedsOf('pinned', level, count).map((seed) => slotsVsPages.make(seed, level, 'pinned'))

  test('asks three facts, of both engines for two of them and of vLLM alone for the cap, each drawn about as often as it comes', () => {
    const seen = new Map<string, number>()
    for (const item of pinned(2, 600)) {
      const key = `${String(item.params['topic'])}/${String(item.params['engine'])}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    expect([...seen.keys()].sort()).toEqual(['over/vllm', 'where/sglang', 'where/vllm', 'width/sglang', 'width/vllm'])
    for (const count of seen.values()) expect(count).toBeGreaterThan(40)
  })

  test("the right option of each fact is a sentence that its claims state: where an adapter sits, how wide its slot is, and what the cap does", () => {
    const rights = new Map<string, string>()
    for (const item of pinned(2, 600)) {
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const correct = item.answer.correct
      const right = item.answer.options.find((option) => option.id === correct)
      rights.set(`${String(item.params['topic'])}/${String(item.params['engine'])}`, plain(right?.why ?? []))
    }
    expect(rights.get('where/vllm')).toContain('vLLM sizes its adapter slots as max_loras')
    expect(rights.get('where/vllm')).toContain('not pages of the KV block pool')
    expect(rights.get('where/sglang')).toContain('LoRAMemoryPool')
    expect(rights.get('where/sglang')).toContain('not a page pool shared with the KV cache')
    expect(rights.get('width/vllm')).toContain('max_lora_rank wide')
    expect(rights.get('width/vllm')).toContain('the first rows and columns of its slot')
    expect(rights.get('width/sglang')).toContain('every slot is as wide as the largest adapter that the pool will accept')
    expect(rights.get('over/vllm')).toContain('skips a waiting request whose adapter is not already scheduled')
    expect(rights.get('over/vllm')).toContain('The request waits')
  })

  test('the stem names the engine and its version at the pin, and the numbers it prints are the scene\'s', () => {
    for (const item of pinned(2, 200)) {
      const stem = plain(item.stem)
      const engine = item.params['engine']
      expect(stem).toContain(engine === 'vllm' ? 'vLLM v0.33.0' : 'SGLang v0.5.23')
      if (item.params['topic'] === 'width') {
        expect(stem).toContain(`rank ${num(item, 'rank')}`)
        expect(num(item, 'rank')).toBeLessThan(num(item, 'slotRank'))
      }
    }
  })

  test('is drawn answer first, and the length of an option says nothing of whether it is right', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    let longest = 0
    let shortest = 0
    const items = pinned(2, 900)
    for (const item of items) {
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      counts[item.answer.correct] += 1
      const lengths = item.answer.options.map((option) => plain(option.text).length)
      const right = item.answer.options.findIndex((option) => option.id === (item.answer.kind === 'choice' ? item.answer.correct : ''))
      if (lengths[right] === Math.max(...lengths)) longest += 1
      if (lengths[right] === Math.min(...lengths)) shortest += 1
      expect(item.answer.options).toHaveLength(4)
      expect(item.answer.options.map((option) => option.id).sort()).toEqual(['a', 'b', 'c', 'd'])
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(40)
        if (option.id !== item.answer.correct) expect(option.miss).toMatch(/^tr5a\.slots-vs-pages\.[a-z-]+$/)
      }
    }
    for (const id of Object.keys(counts)) {
      expect(counts[id] / items.length).toBeGreaterThan(0.18)
      expect(counts[id] / items.length).toBeLessThan(0.34)
    }
    expect(longest / items.length).toBeLessThan(0.34)
    expect(shortest / items.length).toBeLessThan(0.34)
  })
})

describe('diagnoses', () => {
  const idOf = (item: Item, value: number): string | undefined => {
    const graded = slotsVsPages.grade(item, { kind: 'numeric', value })
    return graded.ok ? 'right' : graded.diagnosis?.id
  }

  function expectNamed(item: Item, wrong: Readonly<Record<string, number>>, seen: Set<string>): void {
    const key = keyValue(item)
    for (const [id, value] of Object.entries(wrong)) {
      if (value === key) continue
      const rules = Object.entries(wrong).filter(([, other]) => other === value).map(([name]) => `tr5a.slots-vs-pages.${name}`)
      const named = idOf(item, value)
      expect([id, value, named === 'right' || rules.includes(named ?? '')]).toEqual([id, value, true])
      if (named !== 'right') {
        seen.add(id)
        const message = slotsVsPages.grade(item, { kind: 'numeric', value }).diagnosis?.message ?? []
        for (const part of message) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
        expect(plain(message).length).toBeGreaterThan(30)
      }
    }
  }

  test('slot-idle: the used share, a share of the adapter and a count of ranks are named', () => {
    const seen = new Set<string>()
    for (const level of [2, 3] as const) {
      for (const seed of seedsOf('slot-idle', level, 200)) {
        const item = slotsVsPages.make(seed, level, 'slot-idle')
        const slotRank = num(item, 'slotRank')
        const ranks = text(item, 'ranks').split('.').map(Number)
        const width = slotRank * ranks.length
        const filled = ranks.reduce((sum, rank) => sum + rank, 0)
        expectNamed(
          item,
          { 'used-not-idle': 100 - idleShare(slotRank, ranks), 'over-the-adapter': Math.round((1000 * (width - filled)) / filled) / 10, 'rank-gap': width - filled },
          seen,
        )
      }
    }
    expect([...seen].sort()).toEqual(['over-the-adapter', 'rank-gap', 'used-not-idle'])
  })

  test('slots-take: slots that cost nothing, one slot, a slot rounded down, a page for each unit of rank, and the pages taken are named', () => {
    const seen = new Set<string>()
    for (const level of [2, 3] as const) {
      for (const seed of seedsOf('slots-take', level, 200)) {
        const item = slotsVsPages.make(seed, level, 'slots-take')
        const [slots, rank, unit, page, pool] = ['slots', 'slotRank', 'unit', 'page', 'pool'].map((name) => num(item, name))
        const each = slotPages({ slotRank: rank, unit, page })
        expectNamed(
          item,
          {
            'slots-are-free': pool,
            'one-slot': pool - each,
            'rounded-down': pool - slots * Math.floor((rank * unit) / page),
            'rank-as-pages': pool - slots * rank,
            'taken-not-left': slots * each,
          },
          seen,
        )
      }
    }
    expect([...seen].sort()).toEqual(['one-slot', 'rank-as-pages', 'rounded-down', 'slots-are-free', 'taken-not-left'])
  })

  test('cap: a request for each slot, stopping at the first skip, and the adapters left out are named', () => {
    const seen = new Set<string>()
    for (const seed of seedsOf('cap', 2, 400)) {
      const item = slotsVsPages.make(seed, 2, 'cap')
      const [slots, queue] = [num(item, 'slots'), text(item, 'queue')]
      const first = capPass(slots, queue).held.indexOf(true)
      expectNamed(
        item,
        { 'one-request-per-slot': queue.length - slots, 'stops-at-first': queue.length - first, 'adapters-not-requests': new Set(queue).size - slots },
        seen,
      )
    }
    expect([...seen].sort()).toEqual(['adapters-not-requests', 'one-request-per-slot', 'stops-at-first'])
  })

  test('a number nobody could mean is wrong and has no diagnosis, and a response of the wrong kind is wrong and never throws', () => {
    const item = slotsVsPages.make(SEEDS[0], 2, 'slots-take')
    expect(idOf(item, 12_345_678)).toBeUndefined()
    const choice = slotsVsPages.make(SEEDS[0], 2, 'enough')
    for (const response of [{ kind: 'choice', pick: 'zzz' }, { kind: 'numeric', value: Number.NaN }, { kind: 'numeric', value: -5 }] as const) {
      expect(slotsVsPages.grade(item, response).ok).toBe(false)
      expect(slotsVsPages.grade(choice, response).ok).toBe(false)
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts well over the floor at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(slotsVsPages, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(100, 4)) {
      const { seed } = drawInBand(slotsVsPages, level, entropy)
      expect(slotsVsPages.band(seed, level)).toBe(true)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(slotsVsPages, level, bandedSeeds(slotsVsPages, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) expect(row.rate).toBeLessThanOrEqual(row.kind === 'numeric' ? 0.15 : row.bound)
    }
  })

  test("keeps to the shared core: it imports no model of the sim, so that its code is a chunk of its own and brings none of the sim's (D-059)", () => {
    const source = readFileSync(new URL('../../packages/play/items/families/tr5a/slots-vs-pages.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from '(@es\/[^']+)'/g)].map((match) => match[1])
    expect(imports.length).toBeGreaterThan(0)
    for (const specifier of imports) expect(specifier).toBe('@es/sim/core')
  })
})
