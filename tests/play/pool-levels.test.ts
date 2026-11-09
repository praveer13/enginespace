/*
 * W1-T23, the levels of The Reach-In, their nights and their bands (GAMES.md §2.1, §8 "Levels", "Band"; ASSESSMENT §4.1, §4.3), and the
 * task's acceptance checks 2 and 3:
 *
 *   - Each level is the sim's preset of the lab (D-045) and a seeded night: tables whose next ticket opens with the whole of the last, with
 *     standing orders that several tables share. The night is a function of the seed alone.
 *   - A band makes every seed a fair question: the house serves every ticket, the night has the structure the level teaches, and none of
 *     the plain plays comes within a tenth of the house's price. At least 20% of the first 400 seeds are in band (the gate's floor), and the
 *     practice seed pinned in the registry is the first one.
 *   - On 50 seeds of each level the naive play fails the bar and the intended play passes it (acceptance check 2).
 *   - ASSESSMENT §4.1's blind-strategy bound: on the graded levels the best scene-blind strategy, one that picks the first, the last or none
 *     on each list whatever the scene, passes a single seed at most 15% of the time. The family of 36 such strategies is measured here on
 *     seeds the band accepts.
 *
 * [measured 2026-11-04 at d287a14, the tip of wave-1, with this task's files]: the share of the first 400 seeds in band is 36.0% (`one-group`),
 * 29.3% (`two-kinds`), 24.8% (`evict`), 39.0% (`same-size`), 34.3% (`state`), 28.7% (`adapters`) and 29.3% (`manager`); the best of the 36
 * scene-blind strategies passes 3.3% of in-band seeds of `evict`, 3.3% of `adapters` and 1.3% of `manager` (150 seeds each), against the bound
 * of 15%. A night of the first 100 in-band seeds is 12 to 27 tickets, and the house takes 17 to 49 decisions to serve them.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { drawInBand } from '@es/play'
import { applyAction, advance, freshWork } from '@es/play/pool/engine'
import type { Policy } from '@es/play/pool/engine'
import { POOL } from '@es/play/pool/entry'
import { BOUND_AT_LEAST, DUMPS_AT_LEAST, NAIVE_AT_MOST, boundHangings, inLevelBand, kitsUsed, naiveOf, plainOf, play } from '@es/play/pool/bands'
import { GRADED, buildLevel, isLevelId, levelTitle } from '@es/play/pool/levels'
import { engine, house } from '@es/play/pool/policy'
import { poolSession } from '@es/play/pool/session'
import { costOf, ratio, unservedOf } from '@es/play/pool/score'
import { POOL_LEVEL_IDS } from '@es/play/pool/types'
import type { PoolLevel, PoolLevelId } from '@es/play/pool/types'
import { canonicalJson } from '@es/sim/core'
import { kvChain, kvExtraKey, kvPagesHeld } from '@es/sim/kv'
import { PRACTICE, bulk, playThrough } from './pool-support'

// The bands play several nights of every seed they are asked about, which takes a few seconds, and several on a loaded host.
setDefaultTimeout(120_000)

const S = poolSession

describe('the levels of GAMES.md §8, in the order they teach', () => {
  test('are seven, with the graded ones the design names, and each has a title and a prompt without a digit (every number on the page is a Readout)', () => {
    expect(POOL_LEVEL_IDS).toEqual(['one-group', 'two-kinds', 'evict', 'same-size', 'state', 'adapters', 'manager'])
    expect(POOL.levels.map((level) => level.id)).toEqual([...POOL_LEVEL_IDS])
    expect(POOL.levels.filter((level) => level.graded).map((level) => level.id)).toEqual(['evict', 'adapters', 'manager'])
    expect([...GRADED]).toEqual(['evict', 'adapters', 'manager'])
    for (const entry of POOL.levels) {
      const level = buildLevel(entry.id, entry.practiceSeed)
      expect([entry.id, level.graded]).toEqual([entry.id, entry.graded])
      expect(level.title).toBe(entry.title)
      expect(levelTitle(entry.id as PoolLevelId)).toBe(entry.title)
      expect(level.prompt.length).toBeGreaterThan(80)
      expect([entry.id, /\d/.test(level.prompt), /\d/.test(level.title)]).toEqual([entry.id, false, false])
    }
    expect(isLevelId('evict')).toBe(true)
    expect(isLevelId('constructor')).toBe(false)
    expect(() => buildLevel('nope', 0)).toThrow('has no level')
  })

  test('are the sim\'s presets: one full station; a full station beside two sliding windows; a model padded to one pan size; a recurrent state; kits in the same pool', () => {
    const shapes = Object.fromEntries(PRACTICE.map(([id, seed]) => [id, buildLevel(id, seed)])) as Record<PoolLevelId, PoolLevel>
    expect(shapes['one-group'].spec.groups.map((g) => g.kind)).toEqual(['full'])
    expect(shapes['two-kinds'].spec.groups.map((g) => g.kind)).toEqual(['full', 'sliding', 'sliding'])
    expect(shapes.evict.spec.groups.map((g) => g.kind)).toEqual(['full', 'sliding', 'sliding'])
    expect(shapes['same-size'].spec.groups.filter((g) => (g.padLayers ?? 0) > 0).length).toBeGreaterThan(0)
    expect(shapes['same-size'].spec.groups.every((g) => g.blockTokens === shapes['same-size'].spec.groups[0].blockTokens)).toBe(true)
    expect(shapes.state.spec.groups.some((g) => g.kind === 'state')).toBe(true)
    for (const id of ['one-group', 'two-kinds', 'evict', 'same-size', 'state'] as const) expect([id, shapes[id].kits.length]).toEqual([id, 0])
    for (const id of ['adapters', 'manager'] as const) expect([id, shapes[id].kits.length]).toEqual([id, 2])
    // A kit's pans come out of the pool the pans of the night come out of.
    for (const id of ['adapters', 'manager'] as const) expect(shapes[id].kits.every((kit) => kit.pages > 0 && kit.pages < shapes[id].spec.poolPages)).toBe(true)
  })

  test('the manager draws its model from the seed: a fresh seed is a fresh manager', () => {
    const presets = new Set<string>()
    for (let seed = 0; seed < 40; seed++) presets.add(buildLevel('manager', seed).preset)
    expect([...presets].sort()).toEqual(['same-size', 'state', 'two-kinds'])
  })

  test('ask for a prediction the sim\'s own arithmetic answers', () => {
    const one = buildLevel('one-group', 2)
    expect(one.predict).toMatchObject({ unit: 'pages', answer: kvPagesHeld(one.spec, one.reqs[0].prompt.length) })
    const same = buildLevel('same-size', 0)
    expect(same.predict).toMatchObject({ unit: 'stations', answer: same.spec.groups.length })
    const state = buildLevel('state', 0)
    expect(state.predict.answer).toBe(state.spec.groups.reduce((sum, g) => sum + (g.kind === 'state' ? (g.statePages ?? 0) : 0), 0))
    const kits = buildLevel('adapters', 0)
    expect(kits.predict.answer).toBe(Math.max(...kits.kits.map((kit) => kit.pages)))
  })
})

describe('the night is a function of the seed alone, and is the seeded agentic workload of GAMES.md §8', () => {
  test('the same seed gives the same night, byte for byte, and another seed gives another', () => {
    for (const id of POOL_LEVEL_IDS) {
      expect(canonicalJson(buildLevel(id, 7))).toBe(canonicalJson(buildLevel(id, 7)))
      expect(canonicalJson(buildLevel(id, 7))).not.toBe(canonicalJson(buildLevel(id, 8)))
    }
  })

  test('a table\'s next ticket opens with the whole of its last, the prompt and the reply, and ids run turn by turn', () => {
    for (const id of POOL_LEVEL_IDS) {
      const level = buildLevel(id, 5)
      let previousTurn = 0
      for (const req of level.reqs) {
        expect(req.turn).toBeGreaterThanOrEqual(0)
        if (req.turn > 0) {
          const last = level.reqs.find((other) => other.table === req.table && other.turn === req.turn - 1)!
          const before = last.prompt.concat(last.out)
          expect(req.prompt.slice(0, before.length)).toEqual(before)
          expect(req.prompt.length).toBeGreaterThan(before.length)
          expect(last.next).toBe(req.id)
        }
        // Every table's first ticket is numbered before any table's second.
        expect(req.turn).toBeGreaterThanOrEqual(previousTurn)
        previousTurn = req.turn
        expect(req.out.length % level.chunk).toBe(0)
        expect(req.prompt.every((token) => Number.isInteger(token) && token >= 0 && token < 50000)).toBe(true)
      }
    }
  })

  test('tables share their standing orders: two tables that open with the same one open with the same blocks, and so share the pans', () => {
    let shared = 0
    for (let seed = 0; seed < 12; seed++) {
      const level = buildLevel('two-kinds', seed)
      const firsts = level.reqs.filter((req) => req.turn === 0)
      for (const a of firsts) {
        for (const b of firsts) {
          if (a.id >= b.id) continue
          const ta = level.tables[a.table]
          const tb = level.tables[b.table]
          if (ta.standing === null || ta.standing !== tb.standing) continue
          const size = level.spec.groups[0].blockTokens
          const blocks = Math.floor(Math.min(ta.standingLen, tb.standingLen) / size)
          const chain = (req: typeof a) => kvChain(req.prompt, Math.floor(req.prompt.length / size), size, kvExtraKey(req.adapter))
          expect(chain(a).slice(0, blocks)).toEqual(chain(b).slice(0, blocks))
          shared += 1
        }
      }
    }
    expect(shared).toBeGreaterThan(5)
  })

  test('the recipe kit of a table is its own, and tables of one kit share a kit', () => {
    const level = buildLevel('adapters', 0)
    const kits = new Set(level.tables.map((table) => table.adapter))
    expect(kits.has(null)).toBe(true)
    expect(kits.has(0)).toBe(true)
    expect(kits.has(1)).toBe(true)
    for (const req of level.reqs) expect(req.adapter).toBe(level.tables[req.table].adapter)
  })

  test('the step cap lets the house finish, and a policy that hangs one ticket at a time runs out of steps', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      const home = bulk(level, house, true)
      expect([id, unservedOf(home), home.step < level.stepCap]).toEqual([id, 0, true])
      const idle: Policy = (w, ask) => (ask.kind === 'admit' ? { t: 'admit', req: null } : house(w, ask))
      expect([id, unservedOf(bulk(level, idle, true)) > 0]).toEqual([id, true])
    }
  })
})

describe('a band makes every seed a fair question (GAMES.md §2.1)', () => {
  const FIRST = 400
  const shares: Record<string, number> = {}

  for (const id of POOL_LEVEL_IDS) {
    test(`${id}: at least 20% of the first ${FIRST} seeds are in band, and the practice seed is the first of them`, () => {
      let inBand = 0
      let first = -1
      for (let seed = 0; seed < FIRST; seed++) {
        if (inLevelBand(id, seed)) {
          inBand += 1
          if (first < 0) first = seed
        }
      }
      shares[id] = inBand / FIRST
      expect(shares[id]).toBeGreaterThanOrEqual(0.2)
      expect(POOL.levels.find((level) => level.id === id)?.practiceSeed).toBe(first)
      expect(S.inBand(id, first)).toBe(true)
    })
  }

  test('a seed is in band when the house serves every ticket, the night has its structure, and every plain play loses by a tenth', () => {
    for (const id of POOL_LEVEL_IDS) {
      for (let seed = 0; seed < 60; seed++) {
        const level = buildLevel(id, seed)
        const home = play(level, house, id === 'evict')
        const price = costOf(home.counts, level)
        const structure = unservedOf(home) === 0 && home.mgr.removed >= DUMPS_AT_LEAST && (id !== 'evict' || boundHangings(home.trace ?? []) >= BOUND_AT_LEAST) && ((id !== 'adapters' && id !== 'manager') || kitsUsed(level) >= 2)
        const loses = plainOf(level).every((policy) => {
          const w = bulk(level, policy, true)
          return unservedOf(w) > 0 || ratio(price, costOf(w.counts, level)) <= NAIVE_AT_MOST
        })
        expect([id, seed, inLevelBand(id, seed)]).toEqual([id, seed, structure && loses])
      }
    }
  })

  test('the plain plays are the engine\'s pool (and, with kits, the engine that loads a kit when nothing else can run) and strategies that pick by position', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      expect(plainOf(level)).toHaveLength(4)
      expect(plainOf(level)).toContain(naiveOf(level))
    }
  })

  test('the structure is there on every in-band seed: five dumps at least, a window that bound a returning hit on `evict`, both kits on `adapters` and `manager`', () => {
    for (const id of POOL_LEVEL_IDS) {
      let seen = 0
      for (let seed = 0; seed < 80 && seen < 8; seed++) {
        if (!inLevelBand(id, seed)) continue
        seen += 1
        const level = buildLevel(id, seed)
        const home = play(level, house, true)
        expect(home.mgr.removed).toBeGreaterThanOrEqual(DUMPS_AT_LEAST)
        if (id === 'evict') expect(boundHangings(home.trace ?? [])).toBeGreaterThanOrEqual(BOUND_AT_LEAST)
        if (id === 'adapters' || id === 'manager') expect(kitsUsed(level)).toBeGreaterThanOrEqual(2)
      }
      expect([id, seen]).toEqual([id, 8])
    }
  })

  test('a fresh seed from the browser\'s entropy is in band, and one entropy value always lands on the same seed', () => {
    for (const id of POOL_LEVEL_IDS) {
      for (const entropy of [1, 2, 3, 4_000_000_000]) {
        const seed = drawInBand(S, id, entropy)
        expect([id, S.inBand(id, seed)]).toEqual([id, true])
        expect(drawInBand(S, id, entropy)).toBe(seed)
      }
    }
  })
})

describe('on 50 seeds of every level the naive play fails its bar and the intended play passes it (acceptance check 2)', () => {
  for (const id of POOL_LEVEL_IDS) {
    test(`${id}: the house passes each of 50 seeds, and the naive play loses by a tenth at least on each`, () => {
      for (let entropy = 1; entropy <= 50; entropy++) {
        const seed = drawInBand(S, id, entropy * 7919)
        const level = S.level(id, seed)
        const ghost = S.ghost(level)
        // The intended play is the house's, played through the reducer as a learner's would be.
        const intended = playThrough(level, house).states
        expect([id, seed, S.grade(intended[intended.length - 1], ghost)]).toEqual([id, seed, { score: 1, ok: true }])
        // The naive play is what an engine does: first come, first served, the rotation as it comes, and a kit loaded when nothing else can run.
        const naive = playThrough(level, naiveOf(level)).states
        const grade = S.grade(naive[naive.length - 1], ghost)
        expect([id, seed, grade.ok]).toEqual([id, seed, false])
        expect(grade.score).toBeLessThanOrEqual(NAIVE_AT_MOST)
      }
    })
  }

  test('the engine that loads a kit the moment a ticket waits for it is not the naive play of a level with kits, and passes about one in a hundred of its seeds', () => {
    for (const id of ['adapters', 'manager'] as const) {
      let passed = 0
      const seeds = 150
      for (let entropy = 1; entropy <= seeds; entropy++) {
        const level = S.level(id, drawInBand(S, id, entropy * 104729))
        const price = costOf(bulk(level, house, true).counts, level)
        const eager = bulk(level, engine, true)
        if (unservedOf(eager) === 0 && ratio(price, costOf(eager.counts, level)) >= level.bar) passed += 1
      }
      expect([id, passed / seeds <= 0.05]).toEqual([id, true])
    }
  })
})

describe('the blind-strategy bound of ASSESSMENT §4.1: on a graded level no scene-blind strategy passes more than 15% of the seeds', () => {
  type Pick = 'first' | 'last'
  const ascending = (pages: readonly number[]) => pages.slice().sort((a, b) => a - b)

  /** A strategy that looks at nothing but the lists: which end of each list it takes, or none where none is allowed. */
  const strategy =
    (admit: Pick | 'none', evict: Pick, preempt: Pick, prefetch: Pick | 'none'): Policy =>
    (_w, ask) => {
      switch (ask.kind) {
        case 'admit':
          return { t: 'admit', req: admit === 'none' ? null : admit === 'first' ? ask.candidates[0] : ask.candidates[ask.candidates.length - 1] }
        case 'evict':
          return { t: 'evict', pages: ascending(evict === 'first' ? ask.candidates.slice(0, ask.need) : ask.candidates.slice(ask.candidates.length - ask.need)) }
        case 'preempt':
          return { t: 'preempt', req: preempt === 'first' ? ask.candidates[0] : ask.candidates[ask.candidates.length - 1] }
        case 'prefetch':
          return { t: 'prefetch', adapter: prefetch === 'none' ? null : prefetch === 'first' ? ask.candidates[0] : ask.candidates[ask.candidates.length - 1] }
      }
    }

  const family: [string, Policy][] = []
  for (const a of ['first', 'last', 'none'] as const)
    for (const e of ['first', 'last'] as const)
      for (const p of ['first', 'last'] as const) for (const f of ['none', 'first', 'last'] as const) family.push([`admit ${a}, dump ${e}, pull ${p}, kit ${f}`, strategy(a, e, p, f)])

  test('there are thirty-six of them, and the worst passes a seed no more than 15% of the time, on 100 in-band seeds of each graded level', () => {
    expect(family).toHaveLength(36)
    for (const id of GRADED) {
      const seeds: number[] = []
      for (let seed = 1000; seeds.length < 100; seed++) if (inLevelBand(id, seed)) seeds.push(seed)
      const passes = new Map<string, number>()
      for (const seed of seeds) {
        const level = buildLevel(id, seed)
        const price = costOf(bulk(level, house, true).counts, level)
        for (const [name, policy] of family) {
          const w = bulk(level, policy, true)
          const score = unservedOf(w) > 0 ? 0 : ratio(price, costOf(w.counts, level))
          if (score >= level.bar) passes.set(name, (passes.get(name) ?? 0) + 1)
        }
      }
      const worst = Math.max(0, ...passes.values())
      expect([id, worst / seeds.length <= 0.15]).toEqual([id, true])
    }
  })

  test('the strategies are legal on every ask: each plays a night to its end', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      for (const [, policy] of family) {
        const w = freshWork(level, true)
        advance(w)
        for (let guard = 0; !w.done && guard < 400; guard++) {
          applyAction(w, policy(w, w.ask!))
          advance(w)
        }
        expect(w.done).toBe(true)
      }
    }
  })
})
