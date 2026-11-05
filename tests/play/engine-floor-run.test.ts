/*
 * W1-T17 acceptance check 2, "a wrong answer is explained from the stage's source", and the rules that run a path (GAMES.md §5, "Core
 * loop" step 4; `runPath`): the ticket stops at the first stage that breaks a rule or is not the engine's own, and the stop says why, with
 * the file, symbol, line and quote of the stage the engine has in that place and of the stage that was laid.
 *
 * Every scenario of the lifecycle model is held to it: 88 reference paths that hold from end to end, and for every stage of each one a
 * stage laid in its place that another engine has, a stage skipped and two neighbours swapped, each of which must stop the ticket at
 * that stage and cite the engine's own. The bestiary of known-wrong paths names each rule and checks the words that explain it.
 */
import { describe, expect, test } from 'bun:test'
import { ENGINE_NAMES, runPath, stopOfMistake } from '@es/play/engine-floor/engine'
import { MAX_PREDICTION, boundariesOut, factsOf } from '@es/play/engine-floor/facts'
import { RIVAL } from '@es/play/engine-floor/levels'
import { noteOf, ownerOf, referenceOf, stageIn, stagesOf } from '@es/play/engine-floor/stages'
import { MECHANISM_WORDS, placeName } from '@es/play/engine-floor/words'
import { RULES, describeScenario, entryOf } from '@es/sim/lifecycle'
import type { Scenario, StageDef } from '@es/sim/lifecycle'
import { untaggedNumbers, withoutCode } from '../../scripts/content/prose'
import { ALL_SCENARIOS } from './engine-floor-support'

const VLLM: Scenario = { engine: 'vllm', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 }
const ids = (path: readonly StageDef[]): string[] => path.map((stage) => stage.id)
/** A sentence without the stage labels it quotes: a label is the model's own text (a rank, a hop), and the words around it are the game's, which carry no digit. */
const framing = (sentence: string): string => sentence.replace(/\u201c[^\u201d]*\u201d/g, '\u201c\u201d')
const path = (sc: Scenario) => referenceOf(sc)

/** A stage of the rival engine that the scenario's own path does not have: a real stage that belongs somewhere else. */
function foreign(sc: Scenario): StageDef {
  const own = new Set(ids(path(sc)))
  const found = stagesOf(RIVAL[sc.engine]).find((stage) => !own.has(stage.id))
  if (found === undefined) throw new Error('no foreign stage')
  return found
}

describe('the engine\'s own path holds, and every part of it', () => {
  test.each(ALL_SCENARIOS.map((sc) => [describeScenario(sc), sc] as const))('%s: the whole path completes, and each shorter one holds and is not complete', (_, sc) => {
    const all = ids(path(sc))
    expect(runPath(sc, all)).toEqual({ reached: all.length, stop: null, complete: true })
    expect(runPath(sc, [])).toEqual({ reached: 0, stop: null, complete: false })
    for (const n of [1, Math.floor(all.length / 2), all.length - 1]) expect(runPath(sc, all.slice(0, n))).toEqual({ reached: n, stop: null, complete: false })
  })
})

describe('a stage that does not hold stops the ticket at that stage, and cites the engine\'s own', () => {
  const found: { scenario: string; at: number; kind: string }[] = []

  test('on all 88 scenarios and every place in each path: another engine\'s stage, a skipped stage and two swapped', () => {
    let checked = 0
    for (const sc of ALL_SCENARIOS) {
      const ref = path(sc)
      const other = foreign(sc)
      const make: [string, (i: number) => string[] | null][] = [
        ['foreign', (i) => [...ids(ref.slice(0, i)), other.id]],
        ['skipped', (i) => (i + 1 < ref.length ? [...ids(ref.slice(0, i)), ref[i + 1].id] : null)],
        ['swapped', (i) => (i + 1 < ref.length ? [...ids(ref.slice(0, i)), ref[i + 1].id, ref[i].id] : null)],
      ]
      for (const [kind, laid] of make) {
        for (let i = 0; i < ref.length; i++) {
          const stages = laid(i)
          if (stages === null) continue
          const run = runPath(sc, stages)
          const where = `${describeScenario(sc)}, ${kind} at ${i}`
          expect([where, run.reached, run.complete]).toEqual([where, i, false])
          const stop = run.stop
          if (stop === null) throw new Error(`${where}: the ticket did not stop`)
          expect([where, stop.at]).toEqual([where, i])
          expect([where, stop.laid.id]).toEqual([where, stages[i]])
          // The engine's own stage in that place is cited, with its file, symbol, line and quote at the commit the course pins.
          expect([where, stop.expected?.id]).toEqual([where, ref[i].id])
          expect(stop.expected?.source).toEqual(ref[i].source)
          expect(stop.expected?.engine).toBe(sc.engine)
          expect(stop.laid.source.path.length).toBeGreaterThan(0)
          expect(stop.laid.source.quote.length).toBeGreaterThan(0)
          expect(stop.sentence.length).toBeGreaterThan(20)
          expect([where, untaggedNumbers(withoutCode(framing(stop.sentence)))]).toEqual([where, []])
          found.push({ scenario: where, at: i, kind: stop.failure })
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(4000)
  })

  test('across those, every rule of GAMES.md §5 that a stage can break was the one named, and the path rule for the rest', () => {
    const kinds = new Set(found.map((f) => f.kind))
    for (const kind of ['process', 'thread', 'device', 'async', 'path']) expect(kinds.has(kind)).toBe(true)
  })

  test('is a pure function of the scenario and the stages: the same path runs the same', () => {
    const ref = ids(path(VLLM))
    expect(runPath(VLLM, [...ref.slice(0, 6), ref[8]])).toEqual(runPath(VLLM, [...ref.slice(0, 6), ref[8]]))
  })

  test('an id that no engine has is refused, because a log that names one is not a log of this game', () => {
    expect(() => runPath(VLLM, ['vllm.no-such-stage'])).toThrow(RangeError)
  })
})

describe('the bestiary: known-wrong paths, each stopped by the rule it breaks (GAMES.md §5, "Why the rule is the concept")', () => {
  const ref = ids(path(VLLM))
  const upTo = (id: string): string[] => ref.slice(0, ref.indexOf(id) + 1)
  const stopOf = (laid: string[]) => {
    const stop = runPath(VLLM, laid).stop
    if (stop === null) throw new Error('the ticket did not stop')
    return stop
  }

  test('a change of process needs IPC or shared memory: the engine core\'s copy laid with the ticket at the API server', () => {
    const stop = stopOf(['vllm.http-request', 'vllm.h2d'])
    expect(stop.failure).toBe('process')
    expect(stop.sentence).toContain(RULES.process)
    expect(stop.sentence).toContain('`api-server · handler-task`')
    expect(stop.sentence).toContain('`engine-core · main`')
    expect(stop.expected?.id).toBe('vllm.render')
  })

  test('a change of thread inside a process needs a queue: the busy loop\'s stage laid with the ticket on the input thread', () => {
    const stop = stopOf([...upTo('vllm.zmq-add'), 'vllm.add-request'])
    expect(stop.failure).toBe('thread')
    expect(stop.sentence).toContain(RULES.thread)
    expect(stop.expected?.id).toBe('vllm.input-queue')
    expect(stop.expected?.source.path).toBe('vllm/v1/engine/core.py')
  })

  test('host to GPU needs a copy or a launch: the forward pass laid with the ticket on the busy loop\'s thread', () => {
    const stop = stopOf([...upTo('vllm.schedule'), 'vllm.forward'])
    expect(stop.failure).toBe('device')
    expect(stop.sentence).toContain(RULES.device)
    expect(stop.expected?.id).toBe('vllm.execute-model')
  })

  test('nothing reads what a copy to the host brought before a sync: the scheduler update laid straight after the copy', () => {
    const stop = stopOf([...upTo('vllm.d2h'), 'vllm.update-from-output'])
    expect(stop.failure).toBe('async')
    expect(stop.sentence).toContain(RULES.async)
    expect(stop.expected?.id).toBe('vllm.batch-queue')
    expect(stop.laid.id).toBe('vllm.update-from-output')
  })

  test('a stage that is legal where the ticket stands and is not the engine\'s next says where it comes in the path', () => {
    const stop = stopOf([...upTo('vllm.http-request'), 'vllm.process-inputs'])
    expect(stop.failure).toBe('path')
    expect(stop.sentence).toContain('comes later in the path')
    expect(stop.sentence).toContain('It follows')
    expect(stop.expected?.id).toBe('vllm.render')
    // A stage laid too early and then again too late is the same mistake: one that comes earlier says so.
    const early = stopOf([...ref.slice(0, 3), ref[1]])
    expect(early.sentence).toContain('comes earlier in the path')
  })

  test('a stage of another engine says whose it is and that this engine does not make it', () => {
    const stop = stopOf([...upTo('vllm.http-request'), 'sglang.handle-request'])
    expect(stop.failure).toBe('path')
    expect(stop.laid.engine).toBe('sglang')
    expect(stop.sentence).toContain(ENGINE_NAMES.sglang)
    expect(stop.sentence).toContain('does not make it here')
  })

  test('a stage that breaks a rule is named by the rule even when it is also not the engine\'s', () => {
    const stop = stopOf(['vllm.http-request', 'mini.sync'])
    expect(['process', 'thread', 'device', 'start']).toContain(stop.failure)
    expect(stop.failure).not.toBe('path')
  })

  test('after the whole path is laid and held the request is back, and one more stage has nothing to follow', () => {
    const stop = stopOf([...ref, 'sglang.http-request'])
    expect(stop.at).toBe(ref.length)
    expect(stop.expected).toBeNull()
    expect(stop.sentence).toContain('already back')
  })

  test('cites the engine\'s stage and the laid one as notes: whose, what, where and the source with its quote', () => {
    const stop = stopOf([...upTo('vllm.zmq-add'), 'vllm.add-request'])
    const own = stop.expected
    expect(own).toEqual(noteOf(stageIn(VLLM, 'vllm.input-queue') as StageDef))
    expect(own?.engineTitle).toBe('vLLM v0.33.0')
    expect(own?.source.repo).toBe('vllm-project/vllm')
    expect(own?.source.ref).toMatch(/^[0-9a-f]{40}$/)
    expect(own?.source.quote).toBe('self.input_queue.put_nowait((request_type, request))')
    expect(MECHANISM_WORDS[own?.mechanism ?? 'call'].kitchen).toBe('spike')
    expect(placeName(own?.to ?? stop.laid.to)).toBe('engine-core · main')
  })

  test('the stop of a mistake is found again from the engine\'s own path: the debrief reads it without the learner\'s path', () => {
    const run = runPath(VLLM, [...upTo('vllm.zmq-add'), 'vllm.add-request'])
    const stop = run.stop
    if (stop === null) throw new Error('no stop')
    expect(stopOfMistake(VLLM, { index: stop.at, stage: 'vllm.add-request', turn: 9 })).toEqual(stop)
  })
})

describe('the prediction (GAMES.md §5, "Predict"): process boundaries a sampled token crosses on its way to the client', () => {
  test('is counted from the sampler to the first stage that reaches the client, and an offline library has none', () => {
    const count = (sc: Scenario) => boundariesOut(path(sc), entryOf(sc.engine))
    expect(count({ engine: 'nano-vllm', streaming: false, tp: 1, abort: false, prefixHit: false, n: 1 })).toBe(0)
    expect(count({ engine: 'nano-vllm', streaming: false, tp: 2, abort: false, prefixHit: false, n: 1 })).toBe(0)
    expect(count({ engine: 'mini-sglang', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 })).toBe(3)
    expect(count({ engine: 'inside-vllm', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 })).toBe(2)
    expect(count(VLLM)).toBe(2)
    expect(count({ ...VLLM, tp: 2 })).toBe(3)
    expect(count({ engine: 'sglang', streaming: true, tp: 1, abort: false, prefixHit: true, n: 1 })).toBe(3)
  })

  test('is never more than the ceiling the prediction offers, on any scenario of the model, and an abort after the first token adds none', () => {
    for (const sc of ALL_SCENARIOS) expect(boundariesOut(path(sc), entryOf(sc.engine))).toBeLessThanOrEqual(MAX_PREDICTION)
    expect(boundariesOut(path({ ...VLLM, abort: true }), entryOf('vllm'))).toBe(boundariesOut(path(VLLM), entryOf('vllm')))
  })

  test('has the facts the debrief sets beside each other: where detokenizing runs, the ZMQ hops, and how the ranks get the batch', () => {
    const facts = (sc: Scenario) => factsOf(path(sc), entryOf(sc.engine))
    expect(facts(VLLM).detokenizesAt).toBe('api-server · output-handler-task')
    expect(facts({ engine: 'sglang', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 }).detokenizesAt).toBe('detokenizer · main')
    expect(facts(VLLM).zmqHops).toBe(2)
    expect(facts({ ...VLLM, abort: true }).zmqHops).toBe(3)
    expect(facts({ engine: 'mini-sglang', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 }).zmqHops).toBe(4)
    expect(facts(VLLM).ranksVia).toBeNull()
    expect(facts({ ...VLLM, tp: 2 }).ranksVia?.mechanism).toBe('shm')
    expect(facts({ engine: 'sglang', streaming: true, tp: 2, abort: false, prefixHit: false, n: 1 }).ranksVia?.mechanism).toBe('ipc')
    expect(facts({ engine: 'nano-vllm', streaming: false, tp: 2, abort: false, prefixHit: false, n: 1 }).ranksVia?.mechanism).toBe('shm')
    // The house of an engine with an order desk has that floor and vLLM's does not: the architecture's difference.
    expect(facts({ engine: 'sglang', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 }).floors).toContain('desk')
    expect(facts(VLLM).floors).not.toContain('desk')
  })

  test('every stage of every path has an owner: the engine it is read from', () => {
    for (const sc of ALL_SCENARIOS) for (const stage of path(sc)) expect([stage.id, ownerOf(stage.id)]).toEqual([stage.id, sc.engine])
  })
})
