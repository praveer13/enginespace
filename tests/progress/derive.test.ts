/*
 * W1-T06: progress, derived. What a learner holds is read from their events and from content, and the states are ASSESSMENT §3.3's:
 * practised (any graded event, at any weight), earned (a pass at full weight) and kept (right again on a fresh seed, unassisted,
 * 30 days or more after it was earned). The module's loop counts the events of each step. Nothing is stored.
 */
import { describe, expect, test } from 'bun:test'
import { deriveProgress, KEPT_AFTER_DAYS, nextModule } from '@/progress/derive'
import type { Progress } from '@/progress/derive'
import { homeOf, made, MAP, SOURCES, ungraded } from './support'
import type { Made } from './support'

type Events = Parameters<typeof deriveProgress>[0]
const progress = (events: Events): Progress => deriveProgress(events, MAP, SOURCES, homeOf)
const stateOf = (events: Events, kc: string) => progress(events).kcs.get(kc)?.state
const play = (options?: Made, ref = 'play:loop/close') => made('play', ref, options)

describe('an empty ledger', () => {
  const none = progress([])

  test('has every KC of the graph, none of them touched', () => {
    expect([...none.kcs.values()].map((kc) => [kc.id, kc.state, kc.events])).toEqual(MAP.kcs.map((kc) => [kc.id, 'none', 0]))
    expect(none.counts).toEqual({ total: 7, practised: 0, earned: 0, kept: 0 })
    expect(none.events).toBe(0)
  })

  test('has every module, with its KCs in the order of the graph and a loop with nothing in it', () => {
    expect([...none.modules.keys()]).toEqual(['tr0', 'tr1', 'tr2', 'tr5a', 'capstone'])
    const tr2 = none.modules.get('tr2')
    expect(tr2?.kcs.map((kc) => kc.id)).toEqual(['tr2.bubble', 'tr2.async-overlap', 'tr2.graph-replay'])
    expect(tr2?.counts).toEqual({ total: 3, practised: 0, earned: 0, kept: 0 })
    expect(tr2?.loop).toEqual({
      predicted: 0,
      play: { tried: 0, credited: 0, partial: 0 },
      build: { tried: 0, credited: 0, partial: 0 },
      proved: false,
      keep: { tried: 0, credited: 0, partial: 0 },
    })
    expect(none.modules.get('tr0')?.counts).toEqual({ total: 0, practised: 0, earned: 0, kept: 0 })
  })
})

describe('the states of a KC (ASSESSMENT §3.3)', () => {
  test('practised: any graded event that names the KC, at any weight, passed or not', () => {
    for (const options of [{ provenance: 'practice' }, { ok: false }, { provenance: 'self-reported' }, { provenance: 'gpu-unverified' }, { provenance: 'assisted' }] as const) {
      expect(stateOf([play(options)], 'tr2.bubble')).toBe('practised')
    }
  })

  test('earned: an event that passed at full weight, whichever way it was earned at full weight', () => {
    for (const provenance of ['unseen', 'proved', 'gpu-verified'] as const) expect(stateOf([play({ provenance })], 'tr2.bubble')).toBe('earned')
  })

  test('a pass at part of a weight (practice, assisted) practises and does not earn', () => {
    expect(stateOf([play({ provenance: 'practice' }), play({ provenance: 'assisted' })], 'tr2.bubble')).toBe('practised')
  })

  test('a failed attempt on a fresh seed earns nothing, whatever its provenance says', () => {
    expect(stateOf([play({ ok: false, provenance: 'unseen' })], 'tr2.bubble')).toBe('practised')
  })

  test('one pass among failures earns', () => {
    expect(stateOf([play({ ok: false }), play({ ok: false, day: 1 }), play({ day: 2 })], 'tr2.bubble')).toBe('earned')
  })

  test('a KC that no event reaches is not practised, and neither is one in another module', () => {
    const state = progress([play()])
    expect(state.kcs.get('tr2.graph-replay')?.state).toBe('none')
    expect(state.kcs.get('tr1.five-mechanisms')?.state).toBe('none')
  })

  test('a prediction practises the KC its lesson names and never earns it (ASSESSMENT §4.7)', () => {
    const prediction = made('predict', 'predict:tr2.l3#tr2.l3.p1')
    expect(stateOf([prediction], 'tr2.async-overlap')).toBe('practised')
    expect(stateOf([prediction, prediction, made('predict', 'predict:tr2.l3#tr2.l3.p1', { day: 3 })], 'tr2.async-overlap')).toBe('practised')
  })

  test('an event that is not graded is not read: a challenge and an acknowledgement name no result', () => {
    const state = progress([ungraded('challenge', 'challenge:tr8.replay.s2'), ungraded('ack', 'screen:welcome')])
    expect(state.events).toBe(0)
    expect(state.counts.practised).toBe(0)
  })

  test('the counts include the states before: a kept KC is also earned and practised', () => {
    const events = [play(), made('review', 'review:tr2.async-overlap', { day: KEPT_AFTER_DAYS }), made('review', 'review:tr2.bubble', { day: KEPT_AFTER_DAYS }), made('review', 'review:tr2.graph-replay', { ok: false })]
    const tr2 = progress(events).modules.get('tr2')
    expect(tr2?.kcs.map((kc) => kc.state)).toEqual(['kept', 'kept', 'practised'])
    expect(tr2?.counts).toEqual({ total: 3, practised: 3, earned: 2, kept: 2 })
  })

  test('earnedAt is the time of the earliest pass, whatever order the events come in', () => {
    const late = play({ day: 9 })
    const early = play({ day: 2 })
    const failed = play({ day: 0, ok: false })
    expect(progress([late, failed, early]).kcs.get('tr2.bubble')?.earnedAt).toBe(early.at)
    expect(progress([early, late, failed]).kcs.get('tr2.bubble')?.earnedAt).toBe(early.at)
    expect(progress([failed]).kcs.get('tr2.bubble')?.earnedAt).toBeUndefined()
  })

  test('KC ids that the graph does not have are left out, so a newer build\'s evidence breaks nothing', () => {
    const state = progress([made('review', 'review:tr9.unknown'), made('review', 'review:tr2.not-a-kc')])
    expect(state.events).toBe(2)
    expect(state.kcs.size).toBe(MAP.kcs.length)
    expect(state.counts.practised).toBe(0)
  })
})

describe('kept: right again on a fresh seed, unassisted, 30 days or more after it was earned', () => {
  const earned = play({ day: 0 })
  const review = (options: Made) => made('review', 'review:tr2.bubble', options)

  test('the bound is 30 days [estimated]', () => {
    expect(KEPT_AFTER_DAYS).toBe(30)
  })

  test('29 days later is too soon, and 30 is not', () => {
    expect(stateOf([earned, review({ day: 29 })], 'tr2.bubble')).toBe('earned')
    expect(stateOf([earned, review({ day: 30 })], 'tr2.bubble')).toBe('kept')
    expect(stateOf([earned, review({ day: 400 })], 'tr2.bubble')).toBe('kept')
  })

  test('29 days and a second less is too soon, to the millisecond', () => {
    const justShort = { ...review({ day: 30 }), at: new Date(Date.parse(earned.at) + 30 * 86_400_000 - 1).toISOString() }
    expect(stateOf([earned, justShort], 'tr2.bubble')).toBe('earned')
  })

  test('an item on a fresh seed keeps it as a review does', () => {
    expect(stateOf([earned, made('item', 'item:gen/tr2.bubble-width/async-on', { day: 31 })], 'tr2.bubble')).toBe('kept')
  })

  test('a review that was wrong, assisted, or on a seed already seen keeps nothing', () => {
    for (const options of [{ ok: false }, { provenance: 'assisted' }, { provenance: 'practice' }, { provenance: 'self-reported' }] as const) {
      expect(stateOf([earned, review({ day: 40, ...options })], 'tr2.bubble')).toBe('earned')
    }
  })

  test('a Prove-it review counts, because the agent was closed', () => {
    expect(stateOf([earned, review({ day: 40, provenance: 'proved' })], 'tr2.bubble')).toBe('kept')
  })

  test('another game run does not keep it: only a review or an item does', () => {
    expect(stateOf([earned, play({ day: 60 })], 'tr2.bubble')).toBe('earned')
  })

  test('a review of another KC does not keep this one', () => {
    expect(stateOf([earned, made('review', 'review:tr2.async-overlap', { day: 40 })], 'tr2.bubble')).toBe('earned')
  })

  test('a review long before the KC was first earned does not keep it', () => {
    expect(stateOf([review({ day: 0 }), play({ day: 5 })], 'tr2.bubble')).toBe('earned')
  })

  test('the 30 days run from the first pass, so a later pass does not move them', () => {
    expect(stateOf([play({ day: 20 }), play({ day: 0 }), review({ day: 31 })], 'tr2.bubble')).toBe('kept')
  })
})

describe("a module's loop (Predict, Play, Build, Prove, Keep)", () => {
  const events = [
    made('predict', 'predict:tr2.l3#tr2.l3.p1'),
    made('predict', 'predict:tr2.l3#tr2.l3.p1', { ok: false }),
    play({ provenance: 'practice' }),
    play({ ok: false }),
    play({ day: 1 }),
    made('item', 'item:gen/tr2.bubble-width/v1', { day: 2 }),
    made('review', 'review:tr2.bubble', { day: 3 }),
  ]
  const tr2 = progress(events).modules.get('tr2')

  test('Predict counts predictions, and they carry no credit', () => {
    expect(tr2?.loop.predicted).toBe(2)
  })

  test('Play counts game runs and items: tried, credited at full weight, and partial', () => {
    expect(tr2?.loop.play).toEqual({ tried: 4, credited: 2, partial: 1 })
  })

  test('Keep counts reviews', () => {
    expect(tr2?.loop.keep).toEqual({ tried: 1, credited: 1, partial: 0 })
  })

  test('Build counts lab checks and receipts, and the lab\'s events find the module that lists the lab', () => {
    const state = progress([made('lab-check', 'lab:hybrid-kv'), made('lab-check', 'lab:hybrid-kv', { ok: false }), made('receipt', 'receipt:tr8.replay.s2')])
    expect(state.modules.get('tr5a')?.loop.build).toEqual({ tried: 2, credited: 1, partial: 0 })
    // The receipt's module is tr8, which this small course does not list: it is left out, and no other module takes it.
    expect([...state.modules.values()].filter((module) => module.loop.build.tried > 0).map((module) => module.module)).toEqual(['tr5a'])
  })

  test('Prove is whether any result passed with the agent closed', () => {
    expect(tr2?.loop.proved).toBe(false)
    expect(progress([play({ provenance: 'proved' })]).modules.get('tr2')?.loop.proved).toBe(true)
    expect(progress([play({ provenance: 'proved', ok: false })]).modules.get('tr2')?.loop.proved).toBe(false)
    expect(progress([made('prove', 'prove:hybrid-kv', { provenance: 'proved' })]).modules.get('tr5a')?.loop.proved).toBe(true)
  })

  test('the module has the graded events that belong to it, and an event moves no other module', () => {
    expect(tr2?.events).toBe(events.length)
    const state = progress(events)
    for (const [id, module] of state.modules) if (id !== 'tr2') expect(module.events).toBe(0)
  })

  test("an event is the module's by its ref, by its KCs, or by its lab, and is counted once", () => {
    // `review:tr1.vllm-lifecycle` is TR1's by its ref and by its KC; `play:loop/x` is TR2's by the game's home and by its KCs.
    const state = progress([made('review', 'review:tr1.vllm-lifecycle'), play({}, 'play:loop/x'), made('lab-check', 'lab:hybrid-kv')])
    expect(state.modules.get('tr1')?.events).toBe(1)
    expect(state.modules.get('tr2')?.events).toBe(1)
    expect(state.modules.get('tr5a')?.events).toBe(1)
    expect(state.events).toBe(3)
  })

  test('an event whose ref names nothing the course has still counts as read, and belongs to no module', () => {
    const state = progress([made('trace-mark', 'trace:base-step/gap')])
    expect(state.events).toBe(1)
    expect([...state.modules.values()].every((module) => module.events === 0)).toBe(true)
  })
})

describe('the answer is a function of the events and the content', () => {
  const events = [play({ day: 0 }), made('review', 'review:tr2.bubble', { day: 31 }), made('item', 'item:gen/tr2.bubble-width/v2', { ok: false, day: 3 }), made('lab-check', 'lab:hybrid-kv', { day: 4 })]

  test('it does not depend on the order the events come in', () => {
    const shuffled = [events[3], events[1], events[0], events[2]]
    expect(progress(shuffled)).toEqual(progress(events))
    expect(progress([...events].reverse())).toEqual(progress(events))
  })

  test('the same events give the same answer twice, and the answer does not hold on to the events', () => {
    const once = progress(events)
    expect(progress(events)).toEqual(once)
    expect(progress([])).toEqual(progress([]))
    // Taking the events away takes the progress away: nothing was kept.
    expect(progress([]).counts).toEqual({ total: 7, practised: 0, earned: 0, kept: 0 })
  })

  test('it does not change the events it reads', () => {
    const before = JSON.stringify(events)
    progress(events)
    expect(JSON.stringify(events)).toBe(before)
  })

  test('a source that knows nothing names no KC for a game run, an item or a lab, but a review still names its own', () => {
    const empty = { refs: {}, game: () => [], family: () => [], lab: () => [] }
    const state = deriveProgress(events, MAP, empty, homeOf)
    expect(state.counts).toEqual({ total: 7, practised: 1, earned: 1, kept: 0 })
    // The review passed at full weight, and the game run that would have earned the KC 31 days before is not evidence for it here.
    expect(state.kcs.get('tr2.bubble')?.state).toBe('earned')
    expect(state.events).toBe(4)
  })
})

describe('the module the course would go on with', () => {
  const modules = MAP.modules.map((module, index) => ({ id: module.id, status: index === 0 || module.id === 'capstone' ? 'planned' : 'draft' }))

  test('is the first module that can be opened, when nothing is earned', () => {
    expect(nextModule(modules, progress([]))).toBe('tr1')
  })

  test('stays on a module until all of its KCs are earned, and then goes on', () => {
    const tr1 = [made('review', 'review:tr1.five-mechanisms'), made('review', 'review:tr1.vllm-lifecycle')]
    expect(nextModule(modules, progress([tr1[0]]))).toBe('tr1')
    expect(nextModule(modules, progress(tr1))).toBe('tr2')
  })

  test('is not moved by a KC that is only practised', () => {
    const practised = [made('review', 'review:tr1.five-mechanisms', { ok: false }), made('review', 'review:tr1.vllm-lifecycle', { provenance: 'practice' })]
    expect(nextModule(modules, progress(practised))).toBe('tr1')
  })

  test('passes over a planned module, and over a module with no KCs yet to finish only when it is planned', () => {
    const open = [{ id: 'tr0', status: 'draft' }, ...modules.slice(1)]
    // An open module with no KCs has nothing to finish, so the course would still start there.
    expect(nextModule(open, progress([]))).toBe('tr0')
    expect(nextModule(modules, progress([]))).toBe('tr1')
  })

  test('is none when every module that can be opened is earned', () => {
    const all = MAP.kcs.map((kc) => made('review', `review:${kc.id}`))
    expect(nextModule(modules.filter((module) => module.status !== 'planned'), progress(all))).toBeNull()
    expect(nextModule([], progress([]))).toBeNull()
  })
})
