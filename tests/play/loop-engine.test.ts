/*
 * Service's engine (packages/play/loop/engine.ts): the step loop of packages/sim/steploop, played by hand (GAMES.md §3, D-043).
 *
 * The visitor's loop is the sim's loop and not a lookalike, so the first group runs the house's policy (hang every free clip first
 * come first served, ring the bell) and requires the sim's own lanes, per-fire stats, per-ticket stats and summary for the same
 * night, with overlap on and off and under both batchings, over 200 seeds [estimated, A§5.10]. The hand cases repeat the sim's
 * (tests/sim/steploop-model.test.ts) so that every span can be added up on paper. The rest are the rules a hand adds: which ticket is
 * hung where, what static batching refuses, what a switch does, and the one thing a visitor must not be able to change by luck, which
 * is the order in which they tap tickets.
 */
import { describe, expect, test } from 'bun:test'
import { canonicalJson } from '@es/sim/core'
import { applyAction, replay, startRun, stateHash } from '@es/play'
import { askOf, avoidableEmpties, countersOf, freshState, hang, hungCount, initState, levelDone, measured, onLine, runToDecision, setBatching, setOverlap, step } from '@es/play/loop/engine'
import { buildLevel, frontPageWorkload, simNight } from '@es/play/loop/levels'
import { loopReduce, loopSession, loopView } from '@es/play/loop/session'
import type { LoopAction, LoopState } from '@es/play/loop/types'
import { seeds } from '../seeds'
import { handLevel, houseNight, shuffledNight, simOf } from './loop-support'

/** The lanes of a state as `[step, kind, start, end]` rows, the way the sim's tests write them. */
const rows = (spans: readonly { step: number; kind: string; startUs: number; endUs: number }[]) => spans.map((s) => [s.step, s.kind, s.startUs, s.endUs])

/** 200 seeds on a PR, 10,000 nightly (A§5.10) [estimated]: tests/seeds.ts has the knob. */
const SEEDS = seeds(0)

describe('the visitor\'s loop is the sim\'s loop', () => {
  test(`the house's night equals runStepLoop's over ${SEEDS.length} seeds: lanes, fires, tickets and summary, under every switch`, () => {
    for (const seed of SEEDS) {
      const level = buildLevel('first-4-par', seed)
      for (const batching of ['continuous', 'static'] as const) {
        for (const overlap of [false, true]) {
          const mine = measured(houseNight(level, { overlap, batching }))
          const sim = simNight(frontPageWorkload(seed), batching, overlap)
          const label = `seed ${seed}, ${batching}, overlap ${overlap}`
          expect(canonicalJson(mine.lanes), label).toBe(canonicalJson(sim.lanes))
          expect(canonicalJson(mine.steps), label).toBe(canonicalJson(sim.steps))
          expect(canonicalJson(mine.reqs), label).toBe(canonicalJson(sim.reqs))
          expect(canonicalJson(mine.summary), label).toBe(canonicalJson(sim.summary))
        }
      }
    }
  })

  test('one ticket of three courses, rung without overlap: plan, cook and read one after another, as the sim\'s hand case adds them up', () => {
    const level = handLevel([3])
    let s = hang(freshState(level), 0)
    s = step(step(step(s)))
    expect(levelDone(s)).toBe(true)
    expect(rows(s.cpu)).toEqual([
      [0, 'schedule', 0, 2],
      [0, 'sync', 7, 8],
      [1, 'schedule', 8, 10],
      [1, 'sync', 14, 15],
      [2, 'schedule', 15, 17],
      [2, 'sync', 21, 22],
    ])
    expect(rows(s.gpu)).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 10, 14],
      [2, 'forward', 17, 21],
    ])
    const c = countersOf(s)
    expect([c.clockUs, c.usefulTokens, c.ghostTokens, c.gpuBusyUs, c.bubbleUs, c.bubbles]).toEqual([22, 3, 0, 13, 6, 2])
    expect(canonicalJson(measured(s).summary)).toBe(canonicalJson(simOf([3], { overlap: false }).summary))
  })

  test('the same ticket with overlap: the next call is written during the fire, the gaps close, and the end leaves one binned plate', () => {
    const level = handLevel([3])
    let s = setOverlap(hang(freshState(level), 0), true)
    // The first ring only fills the pipeline: the fire is on the line and nothing has been read back.
    s = step(s)
    expect([onLine(s), s.reads, levelDone(s)]).toEqual([1, 0, false])
    s = step(step(step(s)))
    expect(levelDone(s)).toBe(true)
    expect(rows(s.cpu)).toEqual([
      [0, 'schedule', 0, 2],
      [1, 'schedule', 2, 4],
      [0, 'sync', 7, 8],
      [2, 'schedule', 8, 10],
      [1, 'sync', 11, 12],
      [3, 'schedule', 12, 14],
      [2, 'sync', 15, 16],
      [3, 'sync', 19, 20],
    ])
    expect(rows(s.gpu)).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 7, 11],
      [2, 'forward', 11, 15],
      [3, 'forward', 15, 19],
    ])
    const c = countersOf(s)
    expect([c.clockUs, c.usefulTokens, c.ghostTokens, c.gpuBusyUs, c.bubbleUs]).toEqual([20, 3, 1, 17, 0])
    // The fourth fire carried the ticket after it had ended, so its place is a binned plate.
    expect(s.fires[3].outcome).toEqual(['binned', 'empty', 'empty', 'empty'])
  })

  test('a step takes 7 ticks without overlap, 8 with an admission, and 4 with overlap once the pipeline is full', () => {
    const level = handLevel(Array.from({ length: 4 }, () => 20))
    let serial = freshState(level)
    for (let id = 0; id < 4; id++) serial = hang(serial, id)
    for (let i = 0; i < 6; i++) serial = step(serial)
    const starts = serial.fires.map((fire) => fire.record.forward?.startUs ?? -1)
    expect(starts.slice(1).map((at, i) => at - starts[i])).toEqual([8, 7, 7, 7, 7])
    let overlap = setOverlap(freshState(level), true)
    for (let id = 0; id < 4; id++) overlap = hang(overlap, id)
    for (let i = 0; i < 6; i++) overlap = step(overlap)
    const lit = overlap.fires.map((fire) => fire.record.forward?.startUs ?? -1)
    expect(lit.slice(1).map((at, i) => at - lit[i])).toEqual([5, 4, 4, 4, 4])
  })

  test('a ticket\'s number cannot change the night: hanging in any order gives the same lanes, fires and summary', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const level = buildLevel('first-4-par', seed)
      for (const overlap of [false, true]) {
        const first = measured(houseNight(level, { overlap }))
        const other = measured(shuffledNight(level, seed + 1000, { overlap }))
        expect(canonicalJson(other.lanes), `seed ${seed}, overlap ${overlap}`).toBe(canonicalJson(first.lanes))
        expect(canonicalJson(other.summary), `seed ${seed}, overlap ${overlap}`).toBe(canonicalJson(first.summary))
      }
    }
  })
})

describe('the rules of a hand', () => {
  const level = handLevel([2, 2, 5, 5, 5, 5])

  test('a ticket goes in the clip named, or the first free one, and only a waiting ticket can be hung', () => {
    let s = hang(freshState(level), 3, 2)
    expect(s.tray).toEqual([null, null, 3, null])
    s = hang(s, 0)
    expect(s.tray).toEqual([0, null, 3, null])
    expect(s.waiting).toEqual([1, 2, 4, 5])
    expect(() => hang(s, 0)).toThrow('ticket 0 is not waiting')
    expect(() => hang(s, 6)).toThrow('ticket 6 is not waiting')
    expect(() => hang(s, 1, 2)).toThrow('clip 2 is taken')
    expect(() => hang(s, 1, 4)).toThrow('there is no clip 4')
    expect(() => hang(s, 1, -1)).toThrow('there is no clip -1')
    expect(() => hang(s, 1, 0.5)).toThrow('there is no clip 0.5')
    s = hang(hang(s, 1), 2)
    expect(() => hang(s, 4)).toThrow('every clip is taken')
    expect(askOf(s)).toBeNull()
  })

  test('the pending decision is a free clip with a ticket waiting, and the next fire goes by itself otherwise', () => {
    const s = freshState(level)
    expect(askOf(s)).toEqual({ free: [0, 1, 2, 3], waiting: [0, 1, 2, 3, 4, 5] })
    let full = s
    for (let id = 0; id < 4; id++) full = hang(full, id)
    expect(askOf(full)).toBeNull()
    // After two rings tickets 0 and 1 (two courses each) end, two clips open, and tickets 4 and 5 wait.
    const open = step(step(full))
    expect(open.tray).toEqual([null, null, 2, 3])
    expect(askOf(open)).toEqual({ free: [0, 1], waiting: [4, 5] })
  })

  test('the bell cannot ring on an empty rail with nothing on the line', () => {
    expect(() => step(freshState(level))).toThrow('nothing is hung on the rail, and nothing is on the line')
  })

  test('ringing the bell with a clip free and a ticket waiting leaves the clip empty, and counts the place the line paid for', () => {
    let s = hang(hang(freshState(level), 0), 1)
    s = step(s)
    const c = countersOf(s)
    expect(c.emptyClipSteps).toBe(2)
    expect(avoidableEmpties(s)).toBe(2)
    expect(s.fires[0].outcome).toEqual(['plate', 'plate', 'empty', 'empty'])
    // With nothing waiting the same empty places are not avoidable.
    const small = handLevel([2, 2])
    const t = step(hang(hang(freshState(small), 0), 1))
    expect([countersOf(t).emptyClipSteps, avoidableEmpties(t)]).toEqual([2, 0])
  })

  test('static batching refuses to hang a ticket while a fired ticket is on the rail, and an empty rail takes the next batch', () => {
    let s = setBatching(freshState(level), 'static')
    s = hang(hang(s, 0), 1)
    // Tickets hung before the first bell are one batch: the rail takes more until it is fired.
    s = hang(s, 2)
    s = step(s)
    expect(() => hang(s, 3)).toThrow('static batching hangs nothing until every clip has cleared')
    expect(askOf(s)).toBeNull()
    expect(loopView(s).canHang).toBe(false)
    // Rung again, tickets 0 and 1 end and ticket 2 runs on alone: still nothing may be hung.
    s = step(s)
    expect(s.tray).toEqual([null, null, 2, null])
    expect(() => hang(s, 3)).toThrow('static batching')
    // Only when ticket 2 has ended does the rail take the next batch.
    while (hungCount(s) > 0) s = step(s)
    expect(askOf(s)).toEqual({ free: [0, 1, 2, 3], waiting: [3, 4, 5] })
  })

  test('the overlap switch is not on the panel in the first two levels, and flips between fires in the others', () => {
    for (const id of ['first-1-fill', 'first-2-slot'] as const) {
      const s = initState(buildLevel(id, 1))
      expect(() => loopReduce(s, { t: 'lever', name: 'async', value: true }), id).toThrow('not on the panel')
      expect(loopReduce(s, { t: 'lever', name: 'async', value: false }).overlap).toBe(false)
      expect(loopView(s).overlapAvailable).toBe(false)
    }
    const third = initState(buildLevel('first-3-gap', 1))
    expect(loopView(third).overlapAvailable).toBe(true)
    expect(loopReduce(third, { t: 'lever', name: 'async', value: true }).overlap).toBe(true)
  })

  test('a switch given nonsense, an unknown switch and an unknown action are refused', () => {
    const s = initState(buildLevel('first-4-par', 1))
    const refuse = (action: unknown, message: string) => expect(() => loopReduce(s, action as LoopAction)).toThrow(message)
    refuse({ t: 'lever', name: 'async', value: 'yes' }, 'the async lever is on or off')
    refuse({ t: 'lever', name: 'batching', value: 'dynamic' }, 'the batching lever is "static" or "continuous"')
    refuse({ t: 'lever', name: 'runner', value: true }, 'no lever "runner"')
    refuse({ t: 'run', until: 'forever' }, 'run until "step" or "decision"')
    refuse({ t: 'capture', sizes: [1] }, 'no action "capture"')
  })

  test('the overlap switch can go off with a fire on the line: the next ring reads it back before it plans', () => {
    let s = setOverlap(hang(hang(freshState(handLevel([9, 9])), 0), 1), true)
    s = step(step(s))
    expect(onLine(s)).toBe(1)
    s = setOverlap(s, false)
    s = step(s)
    // The pipeline held one fire too many for a serial loop, so it was read back first, and then the new fire was planned and read.
    expect([onLine(s), s.reads, s.fires.length]).toEqual([0, 3, 3])
    expect(canonicalJson(s.cpu.map((span) => span.startUs))).toBe(canonicalJson([...s.cpu.map((span) => span.startUs)].sort((a, b) => a - b)))
  })

  test('ringing until a decision stops at the next one, and rings once even when a decision is pending now', () => {
    const level2 = buildLevel('first-2-slot', 1)
    const start = initState(level2)
    expect(askOf(start)).toBeNull()
    const stopped = runToDecision(start)
    // Tickets 1 and 2 ask for 3 courses: the fire that carries their last is the third, which is read back by the second ring.
    expect(stopped.fires.length).toBe(3)
    expect(askOf(stopped)).not.toBeNull()
    // With a decision pending, the bell rings once more and the clips it left free are still free and still asked about.
    const again = runToDecision({ ...stopped, level: { ...stopped.level, goal: 'all-served' } })
    expect(again.fires.length).toBe(stopped.fires.length + 1)
  })

  test('the opening hangs the house\'s tickets and leaves the bell not yet rung, and a level\'s first state has a decision or none as the beat says', () => {
    const s1 = initState(buildLevel('first-1-fill', 1))
    expect([s1.fires.length, hungCount(s1), s1.waiting.length]).toEqual([0, 0, 6])
    const s2 = initState(buildLevel('first-2-slot', 1))
    expect([s2.fires.length, hungCount(s2), s2.waiting]).toEqual([1, 4, [4, 5]])
    expect(countersOf(s2).clockUs).toBe(8)
    const s3 = initState(buildLevel('first-3-gap', 1))
    expect([s3.fires.length, hungCount(s3), s3.overlap]).toEqual([2, 4, false])
    expect(countersOf(s3).clockUs).toBe(15)
    // The gap the beat shows: 3 ticks of dark beside the 4-tick fire (GAMES.md §3.1, beat 3).
    expect(measured(s3).steps.map((fire) => [fire.gpuUs, fire.bubbleUs])).toEqual([
      [5, 0],
      [4, 3],
    ])
  })
})

describe('a run is its log', () => {
  const actions: LoopAction[] = [
    { t: 'admit', req: 0 },
    { t: 'admit', req: 1, slot: 3 },
    { t: 'run', until: 'step' },
    { t: 'lever', name: 'async', value: true },
    { t: 'admit', req: 2 },
    { t: 'run', until: 'decision' },
  ]

  test('replaying the actions gives the live run\'s state, hash and view, and a log is the same text each time', () => {
    let run = startRun(loopSession, { game: 'loop', level: 'first-4-par', seed: 1 })
    for (const action of actions) run = applyAction(loopSession, run, action)
    const replayed = replay(loopSession, run.record)
    expect(replayed.ok).toBe(true)
    if (!replayed.ok) return
    expect(canonicalJson(replayed.state)).toBe(canonicalJson(run.state))
    expect(stateHash(replayed.state)).toBe(stateHash(run.state))
    expect(canonicalJson(loopSession.view(replayed.state as LoopState))).toBe(canonicalJson(loopSession.view(run.state)))
    // The same actions from the same seed always make the same hash: the cross-runtime check is this hash, compared in the nightly job.
    let again = startRun(loopSession, { game: 'loop', level: 'first-4-par', seed: 1 })
    for (const action of actions) again = applyAction(loopSession, again, action)
    expect(stateHash(again.state)).toBe(stateHash(run.state))
  })

  test('an action the rules refuse is not logged, and a log that does not replay says where it broke', () => {
    const run = startRun(loopSession, { game: 'loop', level: 'first-4-par', seed: 1 })
    expect(() => applyAction(loopSession, run, { t: 'admit', req: 99 })).toThrow('ticket 99 is not waiting')
    const broken = replay(loopSession, { ...run.record, actions: [{ t: 'admit', req: 0 }, { t: 'admit', req: 0 }] })
    expect(broken).toMatchObject({ ok: false, at: 1 })
  })

  test('a state is plain data with a canonical form, and the view never shows a table\'s appetite', () => {
    const level = buildLevel('first-4-par', 1)
    let s = initState(level)
    for (let id = 0; id < 4; id++) s = hang(s, id)
    s = step(step(s))
    expect(() => canonicalJson(s)).not.toThrow()
    const text = canonicalJson(loopView(s))
    // The hidden lengths are in the level and the ticket records, and in nothing the views draw.
    expect(text).not.toContain('outputTokens')
    expect(text).not.toContain('outputs')
  })
})
