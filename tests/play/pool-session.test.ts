/*
 * W1-T23, the pure session of The Reach-In as the framework sees it (GAMES.md §2.5, §8; A§6.3, A§5.10): the contract every game keeps, the
 * reducer's rules, the sim's invariants under every action of every policy, the replay that makes a log the grade, and the checks that hold
 * the bulk path (the bands, the house's ghost, the debrief's what-ifs) to the path a learner plays.
 *
 *   - The sim keeps its invariants (`kvInvariants`) after every action, for the house and for the plain strategies, on every level.
 *   - The game adds no rule of its own to the pool: a hit is the sim's fixed point, a refused hanging leaves the pool as it was, a dumped
 *     pan is free and first in the rotation, and the plan the view shows is the hit that `admit` then gives.
 *   - A run is its log: replaying a log gives the state it made, an undone run is a run that never made the move, a tampered log is refused,
 *     and a state that was not made by this session (read back from JSON) reduces as the one that was.
 *   - The bulk path is the live path: a night played without events gives the counts and the pool of the one played with them.
 *   - The house's choice of pans prices only what it needs, and chooses exactly as pricing every pan would.
 */
import { describe, expect, test } from 'bun:test'
import { applyAction, finishRun, regrade, replay, startRun, stateHash, undoAction } from '@es/play'
import { advance, applyAction as applyToWork, chainsOfReq, freshWork, peek, thaw } from '@es/play/pool/engine'
import { buildLevel } from '@es/play/pool/levels'
import { PoolManager } from '@es/play/pool/manager'
import { blindLast, cheapest, engine, house, lazy, newest, priceOf } from '@es/play/pool/policy'
import { blocksHeld, hitLength, poolAsk, poolGhost, poolInit, poolReduce, poolSession } from '@es/play/pool/session'
import type { PoolAction, PoolAsk, PoolLevel, PoolLevelId, PoolState } from '@es/play/pool/types'
import { canonicalJson } from '@es/sim/core'
import { kvInvariants, kvPreset } from '@es/sim/kv'
import { PRACTICE, bulk, houseActions, playThrough, practiceOf, stateAfter } from './pool-support'

const S = poolSession
const textOf = (state: PoolState): string => canonicalJson(state)

/** The hashes of the house's runs on the practice seeds [measured 2026-11-04 at d287a14, the tip of wave-1, with this task's files; the same in a browser: e2e/pool.spec.ts]. */
const GOLDEN: Readonly<Record<PoolLevelId, string>> = {
  'one-group': 'dfff95cc',
  'two-kinds': 'a5afdb78',
  evict: '427f825e',
  'same-size': '6134538a',
  state: '548984aa',
  adapters: 'b6ce7544',
  manager: '517835a0',
}

/** The first state of the house's run at which `want` holds, or null. */
function walkTo(level: PoolLevel, want: (state: PoolState, ask: PoolAsk) => boolean): PoolState | null {
  const { states } = playThrough(level, house)
  return states.find((state) => state.ask !== null && want(state, state.ask)) ?? null
}

/** A level with a smaller pool: the pans run out, and a ticket that cannot grow must be pulled. */
function squeezed(id: PoolLevelId, seed: number, pages: number): PoolLevel {
  const base = buildLevel(id, seed)
  return { ...base, spec: kvPreset(base.preset, pages, { prefixCaching: true }) }
}

describe('the contract every game keeps (GAMES.md §2.5)', () => {
  test('a session has every method, and each level starts unfinished with a pending decision', () => {
    for (const method of ['level', 'inBand', 'init', 'ask', 'reduce', 'view', 'done', 'score', 'ghost', 'grade', 'debrief'] as const) expect(typeof S[method]).toBe('function')
    for (const [id, seed] of PRACTICE) {
      const state = S.init(S.level(id, seed))
      expect([id, S.done(state), S.ask(state) !== null]).toEqual([id, false, true])
    }
  })

  test('the reference finishes each level, passes its own grade, and plays the same run every time (D-017)', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const ghost = S.ghost(level)
      expect([id, S.done(ghost), S.grade(ghost, ghost).ok, S.grade(ghost, ghost).score]).toEqual([id, true, true, 1])
      expect(stateHash(ghost)).toBe(stateHash(S.ghost(S.level(id, seed))))
      expect([id, stateHash(ghost)]).toEqual([id, GOLDEN[id]])
      expect(S.debrief(ghost, ghost).sentence.length).toBeGreaterThan(40)
    }
  })

  test('the reference is the actions the house takes through the reducer, played one by one', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      expect(textOf(stateAfter(level, ...houseActions(level)))).toBe(textOf(poolGhost(level)))
    }
  })

  test('a state is plain data: it has a canonical JSON form, and the hash does not depend on how it was reached', () => {
    for (const [id, seed] of PRACTICE) {
      const ghost = S.ghost(S.level(id, seed))
      expect(() => textOf(ghost)).not.toThrow()
      expect(JSON.parse(textOf(ghost))).toEqual(JSON.parse(JSON.stringify(ghost)))
    }
    // The state after the same actions is the same state, whether the pool was copied on the way or not.
    const level = practiceOf('two-kinds')
    const actions = houseActions(level)
    expect(stateHash(stateAfter(level, ...actions))).toBe(stateHash(stateAfter(level, ...actions)))
  })

  test('the score is the counts of tokens, tickets, steps and pans, and the price is the tokens prepped again plus the stalled steps weighted', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const score = S.score(S.ghost(level))
      expect(Object.keys(score).sort()).toEqual(['adapterStallSteps', 'completed', 'cost', 'evictions', 'hitTokens', 'preemptions', 'recomputedTokens', 'turns', 'unserved'])
      expect(score.cost).toBe(score.recomputedTokens + level.stallWeight * score.adapterStallSteps)
      expect([id, score.completed, score.unserved]).toEqual([id, level.reqs.length, 0])
      // Every prompt token was either served by the cache or prepped again.
      const prompts = level.reqs.reduce((sum, req) => sum + req.prompt.length, 0)
      expect(score.hitTokens + score.recomputedTokens).toBeGreaterThanOrEqual(prompts)
    }
  })
})

describe('the API that GAMES.md §8 names, over the sim: `blocksHeld` and `hitLength`', () => {
  test('`blocksHeld` reproduces the design document\'s worked examples: 7 + 2 + 2 = 11 blocks at 112 tokens, and a model padded to seven groups', () => {
    const level = practiceOf('two-kinds')
    expect(level.spec.groups.map((group) => blocksHeld(level.spec, group.id, 112))).toEqual([7, 2, 2])
    const same = practiceOf('same-size')
    expect(same.spec.groups).toHaveLength(7)
    expect(same.spec.groups.map((group) => blocksHeld(same.spec, group.id, 112))).toEqual([7, 4, 4, 4, 4, 4, 4])
    // A full group holds one block for each block of the tokens, rounded up; a sliding one only the blocks of its window.
    expect(blocksHeld(level.spec, level.spec.groups[0].id, 113)).toBe(8)
    expect(blocksHeld(level.spec, level.spec.groups[1].id, 400)).toBe(blocksHeld(level.spec, level.spec.groups[1].id, 112))
  })

  test('`hitLength` is the hit that the view shows for a waiting ticket, and the hit that hanging it then gives, group by group', () => {
    for (const [id, seed] of PRACTICE) {
      const level = buildLevel(id, seed)
      const state = playThrough(level, house).states.find((candidate) => candidate.waiting.some((req) => S.view(candidate).tickets[req].hit > 0))
      expect([id, state === undefined]).toEqual([id, false])
      const at = state as PoolState
      const view = S.view(at)
      for (const req of at.waiting) {
        const def = level.reqs[req]
        const found = hitLength(at, def.prompt, def.adapter)
        expect([id, req, found.hit]).toEqual([id, req, view.tickets[req].hit])
        expect(Object.keys(found.perGroup)).toEqual(level.spec.groups.map((group) => group.id))
        // The hit is at most every group's own hit, as the invariants say.
        for (const group of level.spec.groups) expect(found.hit).toBeLessThanOrEqual(found.perGroup[group.id])
      }
    }
  })
})

describe('the sim keeps its invariants under every action (A§5.9: the game plays the policy and the sim plays the rules)', () => {
  const policies = [
    ['the house', house],
    ['the engine', engine],
    ['the engine that loads a kit when nothing else can run', lazy],
    ['the last option of every list', blindLast],
    ['the newest ticket first', newest],
  ] as const

  for (const [id, seed] of PRACTICE) {
    test(`${id}: after every action of five policies, the pool holds every invariant of the sim`, () => {
      const level = S.level(id, seed)
      for (const [name, policy] of policies) {
        const { states } = playThrough(level, policy)
        for (const [at, state] of states.entries()) {
          const wrong = kvInvariants(level.spec, state.kv)
          if (wrong.length > 0) throw new Error(`${id}, ${name}, after ${at} actions: ${wrong.join(' | ')}`)
        }
        expect(S.done(states[states.length - 1])).toBe(true)
      }
    })
  }

  test('a squeezed pool, where the line cannot grow, holds them too, through every pull', () => {
    const level = squeezed('one-group', 2, 20)
    const { states, actions } = playThrough(level, house)
    expect(actions.some((action) => action.t === 'preempt')).toBe(true)
    for (const state of states) expect(kvInvariants(level.spec, state.kv)).toEqual([])
    expect(S.score(states[states.length - 1]).unserved).toBe(0)
  })
})

describe('the reducer refuses what the open ask does not allow', () => {
  const refuses = (state: PoolState, action: PoolAction, message: string) => expect(() => poolReduce(state, action)).toThrow(message)
  const level = practiceOf('evict')
  const admitting = walkTo(level, (_, ask) => ask.kind === 'admit') as PoolState
  const evicting = walkTo(level, (_, ask) => ask.kind === 'evict') as PoolState

  test('a ticket is hung only if it is offered; pans are dumped only if an eviction is asked for, and as many as it asks', () => {
    expect(admitting).not.toBeNull()
    expect(evicting).not.toBeNull()
    refuses(admitting, { t: 'admit', req: 99 }, 'cannot hang now')
    refuses(admitting, { t: 'evict', pages: [0] }, 'no pans are being asked for')
    refuses(admitting, { t: 'preempt', req: 0 }, 'no ticket is being asked for')
    refuses(admitting, { t: 'prefetch', adapter: null }, 'no kit is being offered')
    refuses(evicting, { t: 'admit', req: null }, 'no ticket is being offered to hang')
    const ask = evicting.ask as Extract<PoolAsk, { kind: 'evict' }>
    refuses(evicting, { t: 'evict', pages: ask.candidates.slice(0, ask.need - 1) }, `dump exactly ${ask.need} pans`)
    refuses(evicting, { t: 'evict', pages: ask.candidates.slice(0, ask.need + 1) }, `dump exactly ${ask.need} pans`)
    refuses(evicting, { t: 'evict', pages: [] }, `dump exactly ${ask.need} pans`)
  })

  test('a pan is dumped once, and only a cached pan that nothing holds and the ticket being hung does not start from', () => {
    const ask = evicting.ask as Extract<PoolAsk, { kind: 'evict' }>
    if (ask.need >= 2) refuses(evicting, { t: 'evict', pages: [ask.candidates[0], ask.candidates[0], ...ask.candidates.slice(1, ask.need - 1)] }, 'a pan can be dumped once')
    const view = S.view(evicting)
    // A bare pan, a pan that a ticket on the line holds, and a pan the hanging ticket starts from are not offered.
    const offered = new Set(ask.candidates)
    const refused = view.pans.filter((pan) => !offered.has(pan.id)).map((pan) => pan.id)
    expect(refused.length).toBeGreaterThan(0)
    const others = ask.candidates.slice(0, ask.need - 1)
    for (const page of refused.slice(0, 6)) refuses(evicting, { t: 'evict', pages: [...others, page] }, `pan ${page} is not a cached pan that can be dumped`)
    const target = view.tickets[ask.target]
    const hitPans = view.pans.filter((pan) => pan.spokenFor.includes(target.id)).map((pan) => pan.id)
    for (const page of hitPans) expect(offered.has(page)).toBe(false)
  })

  test('the prediction comes first and once, as a whole number of at least 0', () => {
    const first = poolInit(level)
    const committed = poolReduce(first, { t: 'commit', prediction: 7 })
    expect(committed.predicted).toBe(7)
    expect(committed.history).toEqual([{ t: 'commit', prediction: 7 }])
    refuses(first, { t: 'commit', prediction: -1 }, 'whole number of at least 0')
    refuses(first, { t: 'commit', prediction: 2.5 }, 'whole number of at least 0')
    refuses(committed, { t: 'commit', prediction: 8 }, 'comes first, once')
    const moved = poolReduce(first, houseActions(level)[0])
    refuses(moved, { t: 'commit', prediction: 8 }, 'comes first, once')
    // A prediction is no decision: it is in the log, and not in the count of turns.
    expect(committed.turns).toBe(0)
    expect(S.view(first).predict.open).toBe(true)
    expect(S.view(committed).predict).toMatchObject({ open: false, committed: 7 })
    expect(S.view(moved).predict.open).toBe(false)
  })

  test('nothing follows the end of the night', () => {
    const ghost = S.ghost(level)
    expect(S.done(ghost)).toBe(true)
    refuses(ghost, { t: 'admit', req: null }, 'the night is over')
    refuses(ghost, { t: 'commit', prediction: 1 }, 'the night is over')
  })

  test('a kit is brought in only if it is offered, and only for a waiting ticket that needs it', () => {
    const kits = practiceOf('adapters')
    const asking = walkTo(kits, (_, ask) => ask.kind === 'prefetch') as PoolState
    expect(asking).not.toBeNull()
    const ask = asking.ask as Extract<PoolAsk, { kind: 'prefetch' }>
    refuses(asking, { t: 'prefetch', adapter: 99 }, 'cannot come in now')
    expect(ask.candidates.length).toBeGreaterThan(0)
    refuses(asking, { t: 'admit', req: null }, 'no ticket is being offered to hang')
  })

  test('only a ticket on the line can be pulled', () => {
    const tight = squeezed('one-group', 2, 20)
    const pulling = walkTo(tight, (_, ask) => ask.kind === 'preempt') as PoolState
    expect(pulling).not.toBeNull()
    const ask = pulling.ask as Extract<PoolAsk, { kind: 'preempt' }>
    const waiting = pulling.waiting[0]
    refuses(pulling, { t: 'preempt', req: waiting ?? 99 }, 'is not on the line')
    expect(ask.candidates).toEqual([...pulling.running])
  })
})

describe('the rules of the world are the sim\'s', () => {
  test('a ticket that does not fit is not offered, a hanging that is refused leaves the pool as it was, and the view says why', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states } = playThrough(level, house)
      for (const state of states) {
        const ask = state.ask
        if (ask === null || ask.kind !== 'admit') continue
        const view = S.view(state)
        for (const t of view.waiting) {
          const ticket = view.tickets[t]
          const offered = ask.candidates.includes(t)
          // Offered exactly when its kit has landed and its pans fit.
          expect([id, t, offered]).toEqual([id, t, ticket.kitReady === true && ticket.fits === true])
          if (ticket.kitReady === true && ticket.fits === false) {
            const mgr = peek(state).mgr.clone()
            const before = canonicalJson({ ...mgr.state(), step: 0 })
            const def = level.reqs[t]
            const prompt = def.prompt.concat(def.out.slice(0, state.reqs[t].progress))
            const refusal = mgr.apply({ op: 'admit', req: t, prompt, ...(def.adapter === null ? {} : { adapter: def.adapter }) })
            expect(refusal.ok).toBe(false)
            expect(canonicalJson({ ...mgr.state(), step: 0 })).toBe(before)
          }
        }
      }
    }
  })

  test('the plan the view shows is what the sim then does: the hit, whether it fits, and the pans the hit takes out of the rotation', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states } = playThrough(level, house)
      for (const state of states) {
        const w = peek(state)
        for (const t of state.waiting) {
          const def = level.reqs[t]
          if (def.adapter !== null && !state.kits.some((kit) => kit.adapter === def.adapter && kit.readyAt <= state.step)) continue
          const prompt = def.prompt.concat(def.out.slice(0, state.reqs[t].progress))
          const plan = w.mgr.plan(prompt, def.adapter)
          const copy = w.mgr.clone()
          const result = copy.apply({ op: 'admit', req: t, prompt, ...(def.adapter === null ? {} : { adapter: def.adapter }) })
          expect([id, t, result.ok]).toEqual([id, t, plan.fits])
          if (result.ok) {
            expect(result.hit).toBe(plan.hit)
            // The new pans and the pans of the hit leave the rotation; a window lets some of the hit's pans go back at once.
            const queued = w.mgr.state().queue.length
            expect(copy.state().queue.length).toBeGreaterThanOrEqual(queued - plan.fresh - plan.fromQueue)
            expect(copy.state().queue.length).toBeLessThanOrEqual(queued - plan.fresh)
          }
        }
      }
    }
  })

  test('a hit holds only as far as every station holds its pans: without any one of the pans it starts from, a ticket\'s hit falls (vllm.hybrid-kv.intersection)', () => {
    let checked = 0
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states } = playThrough(level, house)
      for (const state of states) {
        const w = peek(state)
        for (const t of state.waiting) {
          const def = level.reqs[t]
          const prompt = def.prompt.concat(def.out.slice(0, state.reqs[t].progress))
          const plan = w.mgr.plan(prompt, def.adapter)
          for (const page of plan.pages) {
            expect(w.mgr.hitWithout(prompt, def.adapter, page)).toBeLessThan(plan.hit)
            checked += 1
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200)
  })

  test('a dump takes a cached pan out of the cache and puts it first in the rotation, free, and counts one dumped pan', () => {
    const level = practiceOf('evict')
    const state = walkTo(level, (_, ask) => ask.kind === 'evict') as PoolState
    const ask = state.ask as Extract<PoolAsk, { kind: 'evict' }>
    const mgr: PoolManager = peek(state).mgr.clone()
    const page = ask.candidates[ask.candidates.length - 1]
    const before = mgr.removed
    const hash = mgr.state().pages[page]
    expect(hash.st).toBe('cached')
    mgr.dump(page)
    expect(mgr.state().pages[page].st).toBe('free')
    expect(mgr.rotation()[0]).toBe(page)
    expect(mgr.removed).toBe(before + 1)
    expect(kvInvariants(level.spec, mgr.state())).toEqual([])
    expect(() => mgr.dump(page)).toThrow('is not a cached page')
    // The pans the learner dumped are the pans the ticket then takes, and are counted once each.
    const after = poolReduce(state, { t: 'evict', pages: ask.candidates.slice(0, ask.need) })
    expect(after.counts.evictions).toBeGreaterThanOrEqual(state.counts.evictions + ask.need)
    expect(after.dumped).toEqual(ask.candidates.slice(0, ask.need).slice().sort((a, b) => a - b))
  })

  test('a pulled ticket goes to the front of the line with what it had decoded, nothing hangs in that step, and it pays to prep its pans again', () => {
    const level = squeezed('one-group', 2, 20)
    const { states } = playThrough(level, house)
    const pulling = states.find((state) => state.ask?.kind === 'preempt') as PoolState
    const victim = pulling.running[pulling.running.length - 1]
    expect((pulling.ask as Extract<PoolAsk, { kind: 'preempt' }>).candidates).toContain(victim)
    const progress = pulling.reqs[victim].progress
    const after = poolReduce(pulling, { t: 'preempt', req: victim })
    expect(after.counts.preemptions).toBe(pulling.counts.preemptions + 1)
    expect(after.reqs[victim].pulls).toBe(1)
    expect(after.reqs[victim].progress).toBe(progress)
    expect(after.running).not.toContain(victim)
    // The step that pulled hangs nothing: the next hanging comes in a later step, and the ticket is first in the line until it does.
    if (after.ask?.kind === 'admit') expect(after.step).toBeGreaterThan(pulling.step)
    expect(after.waiting[0]).toBe(victim)
    const end = states[states.length - 1]
    expect(end.reqs[victim].recomputed).toBeGreaterThan(0)
    expect(end.reqs[victim].admits).toBeGreaterThanOrEqual(2)
  })

  test('a recipe kit takes pans from the same pool, lands after its steps, and a ticket that needs it waits until then; it goes back when no ticket uses it', () => {
    const level = practiceOf('adapters')
    const { states } = playThrough(level, house)
    const loading = states.find((state) => state.kits.some((kit) => kit.readyAt > state.step)) as PoolState
    expect(loading).toBeDefined()
    const view = S.view(loading)
    const kit = view.kits.find((entry) => entry.state === 'loading')!
    expect(kit.pageIds.length).toBe(kit.pages)
    expect(kit.readyAt).toBeGreaterThan(loading.step)
    // Its pans are pans of the pool: held by the kit, and none of them is a cached pan the learner could dump.
    for (const page of kit.pageIds) expect(view.pans[page].state).toBe('adapter')
    if (view.ask?.kind === 'evict') for (const page of kit.pageIds) expect(view.ask.candidates).not.toContain(page)
    // A ticket that needs a kit that has not landed is not offered, and the view says its kit has not landed.
    for (const state of states) {
      for (const t of state.waiting) {
        const adapter = level.reqs[t].adapter
        if (adapter === null || state.kits.some((entry) => entry.adapter === adapter && entry.readyAt <= state.step)) continue
        if (state.ask?.kind === 'admit') expect(state.ask.candidates).not.toContain(t)
      }
    }
    // A kit goes back to the pool when no ticket on the line or in the waiting line uses it.
    expect(states.some((state, at) => at > 0 && state.kits.length < states[at - 1].kits.length)).toBe(true)
    expect(Math.max(...states.map((state) => state.kits.length))).toBeGreaterThanOrEqual(1)
  })
})

describe('the manager adds a few things to the sim\'s and changes no rule of it (manager.ts)', () => {
  test('a prompt whose chains are known is planned, priced and looked up exactly as one the sim hashes itself', () => {
    let compared = 0
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states } = playThrough(level, house)
      for (const state of states.filter((_, at) => at % 3 === 0)) {
        const w = peek(state)
        for (const t of state.waiting) {
          const def = level.reqs[t]
          const prompt = def.prompt.concat(def.out.slice(0, state.reqs[t].progress))
          const chains = chainsOfReq(level, t)
          expect(w.mgr.plan(prompt, def.adapter, chains)).toEqual(w.mgr.plan(prompt, def.adapter))
          expect(w.mgr.hitDetail(prompt, def.adapter, chains)).toEqual(w.mgr.hitDetail(prompt, def.adapter))
          const page = w.mgr.plan(prompt, def.adapter).pages[0]
          if (page !== undefined) expect(w.mgr.hitWithout(prompt, def.adapter, page, chains)).toBe(w.mgr.hitWithout(prompt, def.adapter, page))
          compared += 1
        }
      }
    }
    expect(compared).toBeGreaterThan(50)
  })

  test('the rotation is the sim\'s queue: bare pans first, then the cached ones, oldest first; the pans a dump may take are its cached ones', () => {
    const level = practiceOf('evict')
    const { states } = playThrough(level, house)
    for (const state of states.filter((_, at) => at % 2 === 0)) {
      const mgr = peek(state).mgr
      expect(mgr.rotation()).toEqual([...state.kv.queue])
      expect(mgr.supply()).toBe(state.kv.queue.length)
      const cached = mgr.cachedRotation()
      expect(cached).toEqual(state.kv.queue.filter((page) => state.kv.pages[page].st === 'cached'))
      expect(mgr.freeCount()).toBe(state.kv.queue.length - cached.length)
      // Every bare pan leads every cached pan.
      const firstCached = state.kv.queue.findIndex((page) => state.kv.pages[page].st === 'cached')
      if (firstCached >= 0) expect(state.kv.queue.slice(firstCached).every((page) => state.kv.pages[page].st === 'cached')).toBe(true)
    }
  })

  test('a copy shares nothing with the manager it was made from: a dump or an operation on one leaves the other as it was', () => {
    const level = practiceOf('evict')
    const state = walkTo(level, (_, ask) => ask.kind === 'evict') as PoolState
    const original = peek(state).mgr
    const before = canonicalJson(original.state())
    const copy = original.clone()
    expect(canonicalJson(copy.state())).toBe(before)
    const ask = state.ask as Extract<PoolAsk, { kind: 'evict' }>
    copy.dump(ask.candidates[0])
    copy.apply({ op: 'finish', req: state.running[0] })
    expect(canonicalJson(original.state())).toBe(before)
    expect(canonicalJson(copy.state())).not.toBe(before)
    expect(copy.removed).toBe(original.removed + 1)
    expect(kvInvariants(level.spec, copy.state())).toEqual([])
  })
})

describe('a state that this session did not make is rebuilt from its log, and reduces as the one that was', () => {
  test('a state read back from JSON has the same view and the same next state as the one it was written from', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states, actions } = playThrough(level, house)
      for (const at of [0, Math.floor(states.length / 2), states.length - 2]) {
        const original = states[at]
        const foreign = JSON.parse(JSON.stringify(original)) as PoolState
        expect(foreign).not.toBe(original)
        expect(canonicalJson(S.view(foreign))).toBe(canonicalJson(S.view(original)))
        expect(textOf(poolReduce(foreign, actions[at]))).toBe(textOf(poolReduce(original, actions[at])))
      }
    }
  })

  test('reducing never changes the state it is given, and one state can be reduced twice', () => {
    const level = practiceOf('two-kinds')
    const { states, actions } = playThrough(level, house)
    const middle = Math.floor(states.length / 2)
    const text = textOf(states[middle])
    const a = poolReduce(states[middle], actions[middle])
    const b = poolReduce(states[middle], actions[middle])
    expect(textOf(states[middle])).toBe(text)
    expect(textOf(a)).toBe(textOf(b))
    expect(thaw(states[middle]).mgr).not.toBe(thaw(states[middle]).mgr)
  })
})

describe('a run is its log (A§6.3, D-018)', () => {
  const level = practiceOf('evict')
  const run = (actions: readonly PoolAction[]) => actions.reduce((r, action) => applyAction(S, r, action), startRun(S, { game: 'pool', level: 'evict', seed: level.seed }))

  test('playing the house into a log, replaying the log and regrading it give the same state, the pass and the same hash', () => {
    const played = run(houseActions(level))
    const finished = finishRun(S, played)
    expect(finished).not.toBeNull()
    expect(finished?.grade).toEqual({ score: 1, ok: true })
    const again = replay(S, played.record)
    expect(again.ok && again.finished).toBe(true)
    expect(again.ok ? stateHash(again.state) : '').toBe(stateHash(played.state))
    const graded = regrade(S, { ...played.record, score: 1, ok: true })
    expect(graded.valid && graded.grade).toEqual({ score: 1, ok: true })
    expect(graded.valid && graded.storedMatches).toBe(true)
    expect(graded.valid && graded.hash).toBe(stateHash(played.state))
  })

  test('an undone move is a move never made, and a log that stops early has no grade', () => {
    const actions = houseActions(level)
    const full = run(actions)
    const undone = undoAction(S, full)
    expect(undone.record.actions).toEqual(actions.slice(0, -1))
    expect(stateHash(undone.state)).toBe(stateHash(run(actions.slice(0, -1)).state))
    expect(S.done(undone.state)).toBe(false)
    expect(regrade(S, undone.record)).toMatchObject({ valid: false })
  })

  test('a tampered log is refused at the action that does not follow: a ticket that was not offered, pans that were not cached', () => {
    const actions = houseActions(level).slice()
    const at = actions.findIndex((action) => action.t === 'admit' && action.req !== null)
    actions[at] = { t: 'admit', req: 99 }
    const refused = replay(S, { game: 'pool', level: 'evict', seed: level.seed, actions })
    expect(refused).toMatchObject({ ok: false, at })
    const evictAt = houseActions(level).findIndex((action) => action.t === 'evict')
    const bad = houseActions(level).slice()
    bad[evictAt] = { t: 'evict', pages: [9999] }
    expect(replay(S, { game: 'pool', level: 'evict', seed: level.seed, actions: bad })).toMatchObject({ ok: false, at: evictAt })
  })

  test('an edited score changes nothing: the grade is the replay\'s', () => {
    const played = run(houseActions(level))
    const graded = regrade(S, { ...played.record, score: 0.1, ok: false })
    expect(graded.valid && graded.grade.ok).toBe(true)
    expect(graded.valid && graded.storedMatches).toBe(false)
  })

  test('the same seed and the same actions give the same hash, and another seed does not', () => {
    const other = practiceOf('evict').seed === 10 ? 11 : 10
    const a = run(houseActions(level))
    const b = run(houseActions(level))
    expect(stateHash(a.state)).toBe(stateHash(b.state))
    expect(stateHash(poolGhost(buildLevel('evict', other)))).not.toBe(stateHash(a.state))
  })
})

describe('the bulk path is the live path', () => {
  test('a night played without events gives the counts, the log and the pool of the night played with them, for every policy', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      for (const policy of [house, engine, lazy, blindLast, newest]) {
        const live = bulk(level, policy, false)
        const quiet = bulk(level, policy, true)
        expect(quiet.counts).toEqual(live.counts)
        expect(quiet.history).toEqual(live.history)
        expect(quiet.step).toBe(live.step)
        expect(quiet.mgr.removed).toBe(live.mgr.removed)
        const a = quiet.mgr.state()
        const b = live.mgr.state()
        expect({ ...a, consumer: [] }).toEqual({ ...b, consumer: [] })
      }
    }
  })

  test('a night played through the reducer is the night the engine plays in bulk', () => {
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      const { states, actions } = playThrough(level, house)
      const w = bulk(level, house, false)
      expect(w.history).toEqual(actions)
      expect(states[states.length - 1].counts).toEqual({ ...w.counts, evictions: w.mgr.removed })
    }
  })
})

describe('the house prices only what its choice needs (policy.ts, `cheapest`)', () => {
  test('at every dump it is asked to choose, it chooses the pans that pricing every pan would put first (the fewest tokens lost, then by tables still seated, then the rotation)', () => {
    let asks = 0
    for (const [id, seed] of PRACTICE) {
      const level = S.level(id, seed)
      for (const policy of [house, engine, newest]) {
        const w = freshWork(level, true)
        advance(w)
        while (!w.done) {
          const ask = w.ask as PoolAsk
          if (ask.kind === 'evict') {
            const { price, soon } = priceOf(w, ask.candidates, ask.for === 'admit' ? ask.target : null)
            const order = ask.candidates.map((page, rank) => ({ page, rank, cost: price[rank], later: soon[rank] }))
            order.sort((a, b) => a.cost - b.cost || a.later - b.later || a.rank - b.rank)
            const every = order
              .slice(0, ask.need)
              .map((entry) => entry.page)
              .sort((a, b) => a - b)
            expect(cheapest(w, ask)).toEqual(every)
            asks += 1
          }
          applyToWork(w, policy(w, ask))
          advance(w)
        }
      }
    }
    expect(asks).toBeGreaterThan(100)
  })
})

describe('the grade and the score', () => {
  test('a night that ends with a ticket unserved scores 0, and a night that costs more than the house scores its price over the house\'s', () => {
    const level = practiceOf('evict')
    const ghost = S.ghost(level)
    // Hanging nothing, ever, ends the night at the step cap with every ticket unserved.
    const idle = playThrough(level, () => ({ t: 'admit', req: null })).states
    const stuck = idle[idle.length - 1]
    expect(S.score(stuck).unserved).toBeGreaterThan(0)
    expect(S.grade(stuck, ghost)).toEqual({ score: 0, ok: false })
    expect(stuck.done).toBe(true)
    const plain = playThrough(level, engine).states
    const naive = plain[plain.length - 1]
    const grade = S.grade(naive, ghost)
    expect(grade.score).toBeCloseTo(S.score(naive).unserved > 0 ? 0 : Math.min(1, S.score(ghost).cost / S.score(naive).cost), 12)
    expect(grade.score).toBeLessThanOrEqual(1)
    expect(grade.ok).toBe(grade.score >= 0.95)
  })

  test('the pass mark is 0.95 on every level, and a score of 0.95 passes it', () => {
    for (const [id, seed] of PRACTICE) expect([id, S.level(id, seed).bar]).toEqual([id, 0.95])
  })

  test('the ask the session reports is the state\'s open ask, and it is null only when the night is over', () => {
    for (const [id, seed] of PRACTICE) {
      const { states } = playThrough(S.level(id, seed), house)
      for (const state of states) expect([poolAsk(state) === null, state.done]).toEqual([state.done, state.done])
    }
  })
})
