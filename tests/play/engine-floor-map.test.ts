/*
 * W1-T19: Back of House's graded `map` (GAMES.md §5 "Levels", "Band", "Scoring and pass"; ASSESSMENT §4.1, §4.3), the pure half. A fresh scenario
 * for every seed (engine × streaming × TP × abort × prefix hit × n), one run, and the path read against the scenario's synthetic lifecycle
 * trace span by span (`spanCheck`). The page is walked by tests/play/engine-floor-map-ui.test.ts and e2e/engine-floor-map.spec.ts.
 *
 * Acceptance 1, "grading is deterministic and the seeds are banded; each engine family appears on at least 15% of graded seeds":
 *   - the same seed and the same actions give the same state hash and the same grade, in a run and in a replay of its log;
 *   - a seed drawn from entropy is in band, and the share of candidates the band accepts is far over the floor of 20%;
 *   - the five engines are the families, and each is a fifth of the graded seeds by construction (`scenarioFor` draws the engine first, with
 *     `below(5)`), which this file measures: over 5,000 banded seeds every engine is within 3 points of a fifth, so none is under 15%.
 *
 * Acceptance 2, "a scene-blind strategy (laying one engine family's most common path) passes no more often than ASSESSMENT.md §4.1's bound",
 * which is 15% of single seeds [estimated]. The strategies measured: each scenario's path as a constant, one constant for each engine (the
 * habit of a learner who reads only the engine off the card), the tray as it stands, the first card that starts where the ticket is, and
 * all of the engine's stages in their canonical order. The graded tray holds every stage the engine has for any request, so that it does not
 * say which optional stages this request has: a strategy that lays one engine's stages in their order and skips what the tray lacks would
 * otherwise pass every seed of that engine, which is a fifth of them.
 *
 * Numbers measured by this file [measured 2026-11-04 at d287a14, with this task's files; Bun 1.3.14, Linux 6.12.63]:
 *   scenarios the level can ask: 86 of the model's 88, the two it leaves out being nano-vllm at one rank (no process boundary on its path);
 *   share of the first 400 seeds in band: 100% (floor 20%); the pinned practice seed is 0;
 *   engine shares of 20,000 banded seeds: nano-vllm 19.73%, Mini-SGLang 19.92%, Inside vLLM 19.55%, vLLM 20.22%, SGLang 20.59% (floor 15%);
 *   best single constant path: nano-vllm at two ranks with a prefix hit, 10.03% of 20,000 banded seeds (the other two-rank nano-vllm path
 *   9.70%, and no other path over 1.84%); exactly 10% by construction [derived: 1/5 × 1/2];
 *   one constant for each engine, 14.71% of 20,000 banded seeds; exactly 14.17% by construction [derived: 1/5 × (1/2 + 1/12 + 3/24)];
 *   the tray as it stands and the first card that starts where the ticket is: 0 of 20,000; all of the engine's stages in order: 10.03%, the
 *   seeds of the one scenario whose path is every stage (nano-vllm at two ranks with a prefix hit), which is the best constant again;
 *   the prediction's answer, which moves no credit: 0 on 19.73% of 20,000 banded seeds, 2 on 19.91% and 3 on 60.37%.
 */
import { describe, expect, test } from 'bun:test'
import { BAND_CANDIDATES, BAND_FLOOR } from '../../scripts/verify-games'
import { applyAction, drawInBand, regrade, replay, startRun, stateHash, undoAction } from '@es/play'
import { below, rngFor } from '@es/sim/core'
import { needsOf, runPath } from '@es/play/engine-floor/engine'
import { checkViewOf, spanCheck, traceOf } from '@es/play/engine-floor/spans'
import { DISTRACTORS, LEVEL_IDS, MAP_LEVEL, buildLevel, gradedScenarios, hasEveryHandoff, inLevelBand, ownStages, scenarioFor, scenarioOf, trayFor } from '@es/play/engine-floor/levels'
import { frameSvg, layoutMap, mapOfView } from '@es/play/engine-floor/layout'
import { floorGhost, floorGrade, floorInit, floorReduce, floorSession, floorView } from '@es/play/engine-floor/session'
import { ownerOf, referenceOf, stageIn, stagesOf } from '@es/play/engine-floor/stages'
import type { FloorAction, FloorLevel, FloorState } from '@es/play/engine-floor/types'
import { ENGINE_IDS, describeScenario, entryOf, invalidReason, lifecycleTrace, scenarios, stageSpans } from '@es/sim/lifecycle'
import type { EngineId, Scenario, StageDef } from '@es/sim/lifecycle'
import { placeKey } from '@es/play/engine-floor/words'
import { traceBuilder } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { houseActions, played, truthOf, walk } from './engine-floor-support'

const map = (seed: number): FloorLevel => buildLevel(MAP_LEVEL, seed)

/** The first `n` seeds from 0 that the band accepts. */
function banded(n: number): number[] {
  const out: number[] = []
  for (let seed = 0; out.length < n; seed++) if (inLevelBand(MAP_LEVEL, seed)) out.push(seed)
  return out
}

/** A learner who lays `ids`, those the tray has, and runs. Passes when the grade is ok. */
function layAndRun(level: FloorLevel, ids: readonly string[]): FloorState {
  let state = walk(level, { t: 'commit', prediction: 0 })
  for (const stage of ids) if (level.tray.includes(stage) && !state.laid.includes(stage)) state = floorReduce(state, { t: 'lay', stage })
  return state.laid.length === 0 ? state : floorReduce(state, { t: 'run' })
}
const passes = (level: FloorLevel, ids: readonly string[]): boolean => {
  const state = layAndRun(level, ids)
  return floorGrade(state, floorGhost(level)).ok
}

describe('the scenario a seed draws (GAMES.md §5: engine × streaming × TP × abort × prefix hit × n)', () => {
  test('is a valid scenario of the lifecycle model, with a queue, a copy, a sync and a process boundary on its path, and the same one every time', () => {
    for (let seed = 0; seed < 300; seed++) {
      const sc = scenarioFor(seed, MAP_LEVEL)
      expect([seed, invalidReason(sc)]).toEqual([seed, null])
      expect([seed, hasEveryHandoff(sc)]).toEqual([seed, true])
      expect(scenarioFor(seed, MAP_LEVEL)).toEqual(sc)
      expect(map(seed).scenario).toEqual(sc)
    }
  })

  test('is one of 86: every scenario of the model but nano-vllm at one rank, which crosses no process, and every one of them is drawn', () => {
    const asked = ENGINE_IDS.flatMap((engine) => gradedScenarios(engine))
    expect(asked.length).toBe(86)
    expect(scenarios().length - asked.length).toBe(2)
    const left = scenarios().filter((sc) => !hasEveryHandoff(sc))
    expect(left.map(describeScenario)).toEqual(['nano-vllm, not streaming, tp 1, no abort, no prefix hit, n 1', 'nano-vllm, not streaming, tp 1, no abort, prefix hit, n 1'])
    const drawn = new Set<string>()
    for (let seed = 0; seed < 6000; seed++) drawn.add(describeScenario(scenarioFor(seed, MAP_LEVEL)))
    expect(drawn.size).toBe(86)
  })

  test('the practice levels keep the scenario each one lays, whatever the seed, and a level the game does not have is refused', () => {
    for (const id of LEVEL_IDS) for (const seed of [0, 1, 99]) expect(scenarioFor(seed, id)).toEqual(scenarioOf(id))
    expect(() => scenarioFor(0, 'constructor')).toThrow(RangeError)
    expect(() => scenarioFor(0, 'maps')).toThrow(RangeError)
    expect(() => scenarioFor(-1, MAP_LEVEL)).toThrow(RangeError)
    expect(() => scenarioFor(2 ** 32, MAP_LEVEL)).toThrow(RangeError)
  })

  test('the level allows one run, and its title names no engine and nothing of how a house is built', () => {
    const level = map(3)
    expect(level.attempts).toBe(1)
    expect(level.title).toBe('The lifecycle map')
    expect(level.title).not.toMatch(/process|thread|queue|window|boundar|hop/i)
    expect(level.prompt).not.toMatch(/\d/)
    expect(LEVEL_IDS.every((id) => buildLevel(id, 0).attempts === null)).toBe(true)
  })
})

describe('acceptance 1: grading is deterministic and the seeds are banded', () => {
  test('a level on a seed is the same level, and the house run on it has the same state hash every time', () => {
    for (const seed of [0, 1, 7, 12345, 0xffffffff]) {
      expect(map(seed)).toEqual(map(seed))
      expect(stateHash(floorGhost(map(seed)))).toBe(stateHash(floorGhost(map(seed))))
    }
    // The first state and the house run of the pinned practice seed, as hashes that every runtime must give (e2e/engine-floor-map.spec.ts checks the browser's).
    expect([stateHash(floorInit(map(0))), stateHash(floorGhost(map(0)))]).toEqual(['ecc42080', '4795133c'])
  })

  test('the same seed and the same actions give the same state and the same grade, played, replayed from the log, and graded again from a stored copy of it', () => {
    for (const seed of [0, 4, 25, 999]) {
      const level = map(seed)
      const run = played(MAP_LEVEL, houseActions(level), seed)
      const again = played(MAP_LEVEL, houseActions(level), seed)
      expect(stateHash(run.state)).toBe(stateHash(again.state))
      const replayed = replay(floorSession, run.record)
      expect(replayed.ok && replayed.finished).toBe(true)
      expect(replayed.ok && stateHash(replayed.state)).toBe(stateHash(run.state))
      const graded = regrade(floorSession, { ...run.record, score: 0.2, ok: false })
      expect(graded).toMatchObject({ valid: true, grade: { score: 1, ok: true }, hash: stateHash(run.state), storedMatches: false })
    }
  })

  test('a seed drawn from entropy is in band, the same entropy draws the same seed, and the draws are spread over every engine', () => {
    const engines = new Set<EngineId>()
    for (let entropy = 1; entropy <= 60; entropy++) {
      const seed = drawInBand(floorSession, MAP_LEVEL, entropy * 2654435761 % 2 ** 32)
      expect(floorSession.inBand(MAP_LEVEL, seed)).toBe(true)
      expect(drawInBand(floorSession, MAP_LEVEL, entropy * 2654435761 % 2 ** 32)).toBe(seed)
      engines.add(map(seed).scenario.engine)
    }
    expect(engines.size).toBe(5)
  })

  test('the band accepts every one of the first 400 candidates, which is over verify:games\'s floor of 20%, and the pinned practice seed is the first', () => {
    let accepted = 0
    for (let seed = 0; seed < BAND_CANDIDATES; seed++) if (inLevelBand(MAP_LEVEL, seed)) accepted += 1
    expect(accepted / BAND_CANDIDATES).toBeGreaterThanOrEqual(BAND_FLOOR)
    expect(accepted).toBe(BAND_CANDIDATES)
    expect(floorSession.inBand(MAP_LEVEL, 0)).toBe(true)
  })

  test('every engine is at least 15% of the graded seeds, and every one of the 86 scenarios is in band', () => {
    const seeds = banded(5000)
    const count = new Map<EngineId, number>()
    for (const seed of seeds) {
      const engine = map(seed).scenario.engine
      count.set(engine, (count.get(engine) ?? 0) + 1)
    }
    for (const engine of ENGINE_IDS) {
      const share = (count.get(engine) ?? 0) / seeds.length
      expect([engine, share >= 0.15]).toEqual([engine, true])
      // A fifth by construction, within the noise of 5,000 draws.
      expect([engine, Math.abs(share - 0.2) < 0.03]).toEqual([engine, true])
    }
    // No scenario is one the band always throws away: a seed that draws it is in band.
    const out = new Set<string>()
    for (let seed = 0; seed < 8000; seed++) if (!inLevelBand(MAP_LEVEL, seed)) out.add(describeScenario(scenarioFor(seed, MAP_LEVEL)))
    expect([...out]).toEqual([])
  })

  test('the tray holds every stage the engine has, each once, and four real stages of other engines that look like none of them', () => {
    for (const seed of banded(120)) {
      const level = map(seed)
      const engine = level.scenario.engine
      const own = stagesOf(engine).map((stage) => stage.id)
      const foreign = level.tray.filter((id) => ownerOf(id) !== engine)
      expect(new Set(level.tray).size).toBe(level.tray.length)
      expect(level.tray.filter((id) => ownerOf(id) === engine).sort()).toEqual([...own].sort())
      expect(foreign.length).toBe(DISTRACTORS)
      expect(foreign.length).toBeGreaterThanOrEqual(3)
      expect(level.reference.every((id) => level.tray.includes(id))).toBe(true)
      expect(level.tray.length).toBe(own.length + DISTRACTORS)
    }
  })

  test('the tray does not say what the request is: for one engine the stages are the same for every scenario, and only their order and the four others move with the seed', () => {
    for (const engine of ENGINE_IDS) {
      const ids = gradedScenarios(engine).map((sc) => trayFor(sc, 17, true).map((stage) => stage.id).filter((id) => ownerOf(id) === engine).sort())
      for (const set of ids) expect(set).toEqual(ids[0])
      // Where a scenario's path has a stage, the tray gives it the scenario's own variant (a stage's places move with the rank).
      for (const sc of gradedScenarios(engine)) for (const stage of ownStages(sc, true)) expect(stage).toBe(stageIn(sc, stage.id) as typeof stage)
    }
  })

  test('the naive strategies lose on every seed in band: the tray as it stands, and the first card that starts where the ticket is, which the band is made to refuse', () => {
    for (const seed of banded(300)) {
      const level = map(seed)
      expect([seed, runPath(level.scenario, [...level.tray]).complete]).toEqual([seed, false])
      // The place-chasing strategy, written out: it lays the first card of the tray that starts where the ticket stands.
      const laid: string[] = []
      let at = entryOf(level.scenario.engine)
      for (;;) {
        const next = level.tray.find((id) => !laid.includes(id) && placeKey((stageIn(level.scenario, id) as StageDef).from) === placeKey(at))
        if (next === undefined) break
        laid.push(next)
        at = (stageIn(level.scenario, next) as StageDef).to
      }
      expect([seed, runPath(level.scenario, laid).complete]).toEqual([seed, false])
    }
  })

  test('the house run passes on every seed in band, and a short path or a stage of the wrong engine does not', () => {
    for (const seed of banded(120)) {
      const level = map(seed)
      expect(floorGrade(floorGhost(level), floorGhost(level))).toEqual({ score: 1, ok: true })
      expect([seed, passes(level, level.reference.slice(0, -1))]).toEqual([seed, false])
      const foreign = level.tray.find((id) => ownerOf(id) !== level.scenario.engine) as string
      expect([seed, passes(level, [foreign, ...level.reference])]).toEqual([seed, false])
    }
  })
})

describe('acceptance 2: a scene-blind strategy passes no more often than ASSESSMENT §4.1\'s bound of 15% of single seeds', () => {
  const BOUND = 0.15
  const N = 20_000
  /** The first N seeds that the band accepts, with their levels: the graded seeds a learner is dealt. */
  const levels: FloorLevel[] = []
  for (let seed = 0; levels.length < N; seed++) if (inLevelBand(MAP_LEVEL, seed)) levels.push(map(seed))
  const rate = (hits: number): number => hits / levels.length
  /** A learner who lays `ids`, those the tray has, and runs once: the path holds and is the engine's whole path. The grade of this is what `passes` asks the session. */
  const wins = (level: FloorLevel, ids: readonly string[]): boolean => runPath(level.scenario, ids.filter((id) => level.tray.includes(id))).complete
  /** Each scenario's path as a constant, by the key of its scenario. */
  const paths = new Map<string, readonly string[]>(ENGINE_IDS.flatMap((engine) => gradedScenarios(engine).map((sc): [string, readonly string[]] => [describeScenario(sc), referenceOf(sc).map((stage) => stage.id)])))

  test('the fast reading of a pass is the session\'s: laying what the tray has and running once is a pass exactly when the grade is ok', () => {
    for (const level of levels.slice(0, 150)) {
      const engine = level.scenario.engine
      const tries = [level.reference, level.reference.slice(0, -1), paths.get(describeScenario(gradedScenarios(engine)[0])) as readonly string[], stagesOf(engine).map((stage) => stage.id), level.tray]
      for (const ids of tries) expect([level.seed, wins(level, ids)]).toEqual([level.seed, passes(level, ids)])
    }
  })

  test('no two scenarios share a path, so a constant path is right for one scenario and no other', () => {
    expect(new Set([...paths.values()].map((path) => path.join())).size).toBe(paths.size)
    expect(paths.size).toBe(86)
  })

  test('the best constant path, laid in full on every seed, passes 10% of them: nano-vllm at two ranks, which is a fifth of the seeds and half of that engine\'s two', () => {
    const hits = new Map<string, number>()
    for (const level of levels) {
      const key = describeScenario(level.scenario)
      if (wins(level, paths.get(key) as readonly string[])) hits.set(key, (hits.get(key) ?? 0) + 1)
    }
    const best = [...hits.entries()].sort((a, b) => b[1] - a[1])
    // A constant passes exactly the seeds that draw its scenario, and none other.
    expect(best.length).toBe(86)
    const top = best[0][1] / levels.length
    expect(top).toBeLessThanOrEqual(BOUND)
    expect(best[0][0].startsWith('nano-vllm, not streaming, tp 2')).toBe(true)
    expect(top).toBeGreaterThan(0.09)
    expect(top).toBeLessThan(0.11)
    expect(best[2][1] / levels.length).toBeLessThan(0.025)
    console.log(`best constant path: ${best[0][0]} ${(top * 100).toFixed(2)}%; next ${best[1][0]} ${((best[1][1] / levels.length) * 100).toFixed(2)}%; third ${best[2][0]} ${((best[2][1] / levels.length) * 100).toFixed(2)}% of ${levels.length} banded seeds`)
  })

  /**
   * The order that every path of an engine agrees with, with all of its stages in it: each stage after the ones that come before it in any
   * path, taking the earliest in the vocabulary's order when several could go next. Each engine's paths do merge into one order (no two
   * paths put two stages the other way round), which is what makes the leak below possible.
   */
  function mergedOrder(engine: EngineId): string[] {
    const vocabulary = stagesOf(engine).map((stage) => stage.id)
    const before = new Map<string, Set<string>>(vocabulary.map((id) => [id, new Set<string>()]))
    for (const sc of scenarios(engine)) {
      const path = referenceOf(sc).map((stage) => stage.id)
      for (let i = 1; i < path.length; i++) before.get(path[i])?.add(path[i - 1])
    }
    const placed: string[] = []
    const left = new Set(vocabulary)
    while (left.size > 0) {
      const next = vocabulary.find((id) => left.has(id) && [...(before.get(id) ?? [])].every((earlier) => !left.has(earlier)))
      if (next === undefined) throw new Error(`the paths of ${engine} do not merge into one order`)
      placed.push(next)
      left.delete(next)
    }
    return placed
  }

  test('a learner who knows an engine\'s stages in order and skips what the tray lacks passes none of its seeds, because the tray lacks nothing of the engine\'s; with a tray of only the path\'s stages it would pass all of them', () => {
    for (const engine of ENGINE_IDS) {
      const order = mergedOrder(engine)
      expect(order).toHaveLength(stagesOf(engine).length)
      const mine = levels.filter((level) => level.scenario.engine === engine)
      expect(mine.length).toBeGreaterThan(N / 10)
      // The tray as the level deals it: the stages of every request the engine has, so laying them all lays stages of other requests. The one
      // path that is every stage is nano-vllm's at two ranks with a prefix hit, and laying everything passes exactly that scenario's seeds.
      const whole = mine.filter((level) => level.reference.length === order.length)
      expect([engine, mine.filter((level) => wins(level, order)).length]).toEqual([engine, whole.length])
      expect([engine, whole.length > 0]).toEqual([engine, engine === 'nano-vllm'])
      // The tray the practice levels deal, a path's stages and four of other engines: skipping what is absent skips exactly the stages that are not the path's.
      expect([engine, mine.filter((level) => wins({ ...level, tray: [...level.reference, ...level.tray.filter((id) => ownerOf(id) !== engine)] }, order)).length]).toEqual([engine, mine.length])
    }
  })

  test('one constant for each engine, the best path of the engine the card names, passes 14.7% of the seeds, which is under the bound', () => {
    const best = new Map<EngineId, string>()
    const counts = new Map<string, number>()
    for (const level of levels) counts.set(describeScenario(level.scenario), (counts.get(describeScenario(level.scenario)) ?? 0) + 1)
    for (const engine of ENGINE_IDS) {
      const mine = gradedScenarios(engine).map(describeScenario)
      best.set(engine, mine.reduce((a, b) => ((counts.get(b) ?? 0) > (counts.get(a) ?? 0) ? b : a)))
    }
    let hits = 0
    for (const level of levels) if (wins(level, paths.get(best.get(level.scenario.engine) as string) as readonly string[])) hits += 1
    expect(rate(hits)).toBeLessThanOrEqual(BOUND)
    expect(rate(hits)).toBeGreaterThan(0.13)
    // The draw is uniform, so the exact figure is a fifth of the sum over the engines of one over the number of scenarios the engine can be asked.
    const exact = ENGINE_IDS.reduce((sum, engine) => sum + 1 / gradedScenarios(engine).length, 0) / ENGINE_IDS.length
    expect(exact).toBeCloseTo(0.14166667, 6)
    expect(exact).toBeLessThan(BOUND)
    expect(Math.abs(rate(hits) - exact)).toBeLessThan(0.01)
    console.log(`one constant for each engine: ${(rate(hits) * 100).toFixed(2)}% of ${levels.length} banded seeds (exact ${(exact * 100).toFixed(2)}%)`)
  })

  test('the strategies that read the tray and not the request lose: the tray as it stands on all of them, and everything on on all but the one scenario whose path is everything, which is 10% and is the best constant', () => {
    let tray = 0
    let everything = 0
    let whole = 0
    for (const level of levels) {
      if (runPath(level.scenario, [...level.tray]).complete) tray += 1
      if (wins(level, mergedOrder(level.scenario.engine))) everything += 1
      if (level.reference.length === stagesOf(level.scenario.engine).length) whole += 1
    }
    expect([tray, everything]).toEqual([0, whole])
    expect(rate(everything)).toBeLessThanOrEqual(BOUND)
    expect(rate(everything)).toBeGreaterThan(0.09)
    // The band is what keeps the place-chasing strategy out: it accepts a seed only when that strategy loses on it, and it accepted all of them.
    expect(levels.length).toBe(N)
  })

  test('the prediction moves no credit, and its answer is the engine\'s: 0 for nano-vllm, 3 for Mini-SGLang and SGLang, 2 or 3 for vLLM and Inside vLLM, and 3 is the commonest answer at about 60% of the seeds', () => {
    const answers = new Map<number, number>()
    const byEngine = new Map<EngineId, Set<number>>()
    for (const level of levels) {
      const answer = truthOf(level.scenario)
      answers.set(answer, (answers.get(answer) ?? 0) + 1)
      byEngine.set(level.scenario.engine, (byEngine.get(level.scenario.engine) ?? new Set<number>()).add(answer))
    }
    const answersOf = (engine: EngineId): string => [...(byEngine.get(engine) ?? [])].sort((a, b) => a - b).join()
    expect(ENGINE_IDS.map(answersOf)).toEqual(['0', '3', '2,3', '2,3', '3'])
    expect([...answers.keys()].sort((a, b) => a - b)).toEqual([0, 2, 3])
    const share = (answer: number): number => (answers.get(answer) ?? 0) / levels.length
    expect(share(0)).toBeGreaterThan(0.19)
    expect(share(0)).toBeLessThan(0.21)
    expect(share(2)).toBeGreaterThan(0.19)
    expect(share(2)).toBeLessThan(0.21)
    expect(share(3)).toBeGreaterThan(0.59)
    expect(share(3)).toBeLessThan(0.62)
    console.log(`prediction answers: 0 on ${(share(0) * 100).toFixed(2)}%, 2 on ${(share(2) * 100).toFixed(2)}%, 3 on ${(share(3) * 100).toFixed(2)}% of ${levels.length} banded seeds`)
  })
})

describe('spanCheck (GAMES.md §5): the laid stages, read against the stage spans of a lifecycle trace in order', () => {
  test('passes the reference on its own synthetic trace, for every scenario and under any seed of the jitter, with no span left over', () => {
    for (const sc of scenarios()) {
      const ids = referenceOf(sc).map((stage) => stage.id)
      for (const seed of [0, 1, 17, 0xffffffff]) {
        const found = spanCheck(ids, lifecycleTrace(sc, seed))
        expect([describeScenario(sc), seed, found.matched, found.firstMismatch, found.of]).toEqual([describeScenario(sc), seed, ids.length, null, ids.length])
        expect(found.spans).toHaveLength(ids.length)
      }
    }
  })

  test('says how far a path went: a prefix matches as far as it goes with no mismatch, and the first stage that is not the trace\'s is named', () => {
    const sc = scenarioOf('vllm')
    const t = lifecycleTrace(sc, 5)
    const ids = referenceOf(sc).map((stage) => stage.id)
    expect(spanCheck([], t)).toMatchObject({ matched: 0, firstMismatch: null, of: ids.length })
    expect(spanCheck(ids.slice(0, 7), t)).toMatchObject({ matched: 7, firstMismatch: null })
    // A stage skipped, swapped with its neighbour, a stage of another engine, and a stage laid twice: each is named at its place.
    expect(spanCheck([...ids.slice(0, 4), ...ids.slice(5)], t)).toMatchObject({ matched: 4, firstMismatch: 4 })
    expect(spanCheck([ids[0], ids[2], ids[1], ...ids.slice(3)], t)).toMatchObject({ matched: 1, firstMismatch: 1 })
    expect(spanCheck([...ids.slice(0, 3), 'sglang.sse-chunk'], t)).toMatchObject({ matched: 3, firstMismatch: 3 })
    expect(spanCheck([...ids.slice(0, 3), ids[2]], t)).toMatchObject({ matched: 3, firstMismatch: 3 })
    // Longer than the tape: the stage past its end has no span to match.
    expect(spanCheck([...ids, ids[0]], t)).toMatchObject({ matched: ids.length, firstMismatch: ids.length })
  })

  test('reads the spans in time order and not in the order of the columns, ignores spans that are not stages, and reads a trace of its own making', () => {
    const b = traceBuilder()
    const cpu = b.track('cpu-thread', 'main')
    const api = b.track('cuda-api', 'api')
    // Three stage spans, with a CUDA API call between them that is not a stage.
    b.span(cpu, 3000, 100, 'vllm.schedule', 'call')
    b.span(api, 1500, 10, 'cudaLaunchKernel', 'launch', 0)
    b.span(cpu, 1000, 100, 'vllm.add-request', 'call')
    b.span(cpu, 2000, 100, 'vllm.waiting-queue', 'queue')
    const sorted = b.build({ source: 'synthetic', synthetic: true })
    const ids = ['vllm.add-request', 'vllm.waiting-queue', 'vllm.schedule']
    expect(spanCheck(ids, sorted)).toMatchObject({ matched: 3, firstMismatch: null, of: 3, spans: [0, 2, 3] })
    // The same trace with its columns written backwards, as an exporter that did not sort them would: the check reads time and not the columns.
    const back = <T extends Float64Array | Int32Array>(column: T): T => column.slice().reverse() as T
    const columns = sorted.spans
    const reversed: EsTrace = { ...sorted, spans: { track: back(columns.track), startNs: back(columns.startNs), durNs: back(columns.durNs), name: back(columns.name), cat: back(columns.cat), corr: back(columns.corr) } }
    expect(stageSpans(reversed).map((s) => s.stage)).toEqual(['vllm.schedule', 'vllm.waiting-queue', 'vllm.add-request'])
    expect(spanCheck(ids, reversed)).toMatchObject({ matched: 3, firstMismatch: null, of: 3, spans: [3, 1, 0] })
    expect(spanCheck(['vllm.schedule'], reversed)).toMatchObject({ matched: 0, firstMismatch: 0 })
    // Two stage spans that start together keep the order of the columns.
    const c = traceBuilder()
    const lane = c.track('cpu-thread', 'main')
    c.span(lane, 10, 5, 'vllm.waiting-queue', 'queue')
    c.span(lane, 10, 5, 'vllm.schedule', 'call')
    expect(spanCheck(['vllm.waiting-queue', 'vllm.schedule'], c.build({ source: 'synthetic', synthetic: true }))).toMatchObject({ matched: 2, firstMismatch: null })
  })

  test('is the same check on every trace of a scenario: the seed of the jitter moves the times and never the verdict', () => {
    const sc = scenarioOf('sglang')
    const ids = referenceOf(sc).map((stage) => stage.id)
    const verdicts = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(spanCheck(ids, lifecycleTrace(sc, seed))))
    expect(new Set(verdicts).size).toBe(1)
  })

  test('the check view has a row for each laid stage: the span it matched, its track, and where it starts and how long it lasts in ns', () => {
    const level = map(2)
    const sc = level.scenario
    const view = checkViewOf(sc, level.seed, level.reference)
    const t = traceOf(sc, level.seed)
    expect(view).toMatchObject({ seed: level.seed, matched: level.reference.length, firstMismatch: null, spans: level.reference.length, whole: true })
    view.rows.forEach((row, i) => {
      expect(row).toMatchObject({ index: i, stage: level.reference[i], matched: true, tape: level.reference[i] })
      const span = row.span as number
      expect(row.startNs).toBe(t.spans.startNs[span])
      expect(row.durNs).toBe(t.spans.durNs[span])
      expect(Number.isInteger(row.startNs)).toBe(true)
      expect(Number.isInteger(row.durNs)).toBe(true)
      expect(typeof row.track).toBe('string')
    })
    // A path that parts from the tape: the rows after the first mismatch are not read, and each says what the tape has there.
    const wrong = [...level.reference.slice(0, 3), level.reference[4], level.reference[3], ...level.reference.slice(5)]
    const parted = checkViewOf(sc, level.seed, wrong)
    expect(parted).toMatchObject({ matched: 3, firstMismatch: 3, whole: false })
    expect(parted.rows.map((row) => row.matched)).toEqual(wrong.map((_, i) => i < 3))
    expect(parted.rows[3]).toMatchObject({ stage: level.reference[4], tape: level.reference[3], span: null, track: null, startNs: null, durNs: null })
    // A prefix is not the whole path.
    expect(checkViewOf(sc, level.seed, level.reference.slice(0, 5))).toMatchObject({ matched: 5, firstMismatch: null, whole: false })
  })

  test('the trace of the check is the level\'s own synthetic trace: marked synthetic, a function of the scenario and the seed, and kept for the last one asked for', () => {
    const level = map(8)
    const t = traceOf(level.scenario, level.seed)
    expect(t.meta).toEqual({ source: 'synthetic', synthetic: true })
    expect(traceOf(level.scenario, level.seed)).toBe(t)
    expect(JSON.stringify(Array.from(lifecycleTrace(level.scenario, level.seed).spans.startNs))).toBe(JSON.stringify(Array.from(t.spans.startNs)))
    expect(traceOf(map(9).scenario, 9)).not.toBe(t)
  })
})

describe('the grade (ASSESSMENT §4.3: the whole path right on its first run, every stage matched to a span in order)', () => {
  const level = map(0)
  const ids = level.reference
  const run = (laid: readonly string[]): FloorState => walk(level, { t: 'commit', prediction: truthOf(level.scenario) }, ...laid.map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' })
  const grade = (laid: readonly string[]) => floorGrade(run(laid), floorGhost(level))

  test('the whole path on the one run passes, with a score of 1', () => {
    expect(grade(ids)).toEqual({ score: 1, ok: true })
  })

  test('there is one run: it ends the level whatever it found, and nothing can follow', () => {
    for (const laid of [ids, ids.slice(0, 5), [ids[0], ids[2]]]) {
      const state = run(laid)
      expect(floorView(state).done).toBe(true)
      expect(() => floorReduce(state, { t: 'unlay' })).toThrow(/run is over/)
      expect(() => floorReduce(state, { t: 'run' })).toThrow(/run is over/)
    }
  })

  test('a path that stopped short, a stage out of place, a stage of another engine and a stage of another request each fail, with the score of the stages that held', () => {
    const foreign = level.tray.find((id) => ownerOf(id) !== level.scenario.engine) as string
    const other = stagesOf(level.scenario.engine).find((stage) => !ids.includes(stage.id))?.id as string
    expect(grade(ids.slice(0, 6))).toEqual({ score: 6 / ids.length, ok: false })
    expect(grade([...ids.slice(0, 3), ids[4], ids[3], ...ids.slice(5)])).toEqual({ score: 3 / ids.length, ok: false })
    expect(grade([...ids.slice(0, 2), foreign, ...ids.slice(2)])).toEqual({ score: 2 / ids.length, ok: false })
    expect(grade([...ids.slice(0, 2), other, ...ids.slice(2)])).toEqual({ score: 2 / ids.length, ok: false })
    expect(grade([foreign])).toEqual({ score: 0, ok: false })
  })

  test('a path is held to the tape as well as to the engine: the grade is the spanCheck of the laid path against the scenario\'s trace', () => {
    for (const seed of banded(40)) {
      const l = map(seed)
      const state = layAndRun(l, l.reference)
      const t = traceOf(l.scenario, l.seed)
      const found = spanCheck(state.laid, t)
      expect([seed, found.matched, found.firstMismatch, found.of]).toEqual([seed, l.reference.length, null, l.reference.length])
      expect(floorGrade(state, floorGhost(l)).ok).toBe(true)
    }
  })

  test('a practice run of the level can be taken back, and a graded one has no undo in the shell: the log is replayed without the run, and the run is open again', () => {
    let r = startRun(floorSession, { game: 'engine-floor', level: MAP_LEVEL, seed: 0 })
    for (const action of houseActions(level)) r = applyAction(floorSession, r, action)
    expect(floorSession.done(r.state)).toBe(true)
    const undone = undoAction(floorSession, r)
    expect(floorSession.done(undone.state)).toBe(false)
    expect(undone.record.actions.at(-1)).toEqual({ t: 'lay', stage: ids.at(-1) })
    expect(floorView(undone.state).check).toBeNull()
  })

  test('the debrief says what the run did: the whole path held, or the first stage that did not, or that it stopped short', () => {
    expect(floorSession.debrief(run(ids), floorGhost(level)).sentence).toContain('Every hand-off held on the first run')
    expect(floorSession.debrief(run(ids.slice(0, 6)), floorGhost(level)).sentence).toContain('stopped short')
    const wrong = floorSession.debrief(run([ids[0], ids[2]]), floorGhost(level))
    expect(wrong.sentence).toContain('The first stage that did not hold.')
    expect(wrong.names).toEqual({ turn: 2 })
  })
})

describe('the view of the graded level', () => {
  const level = map(0)
  const ids = level.reference
  const state = (laid: readonly string[], run = true): FloorState =>
    walk(level, { t: 'commit', prediction: 0 }, ...laid.map((stage): FloorAction => ({ t: 'lay', stage })), ...(run ? [{ t: 'run' } as const] : []))

  test('keeps the engine\'s path a secret until the run is judged: sealed before the run, with no check, and open after it with the tape\'s check', () => {
    for (const s of [floorInit(level), state([], false), state(ids.slice(0, 4), false)]) {
      const view = floorView(s)
      expect([view.sealed, view.check, view.done, view.runsAllowed]).toEqual([true, null, false, 1])
    }
    const done = floorView(state(ids))
    expect([done.sealed, done.done, done.served, done.runsAllowed]).toEqual([false, true, true, 1])
    expect(done.check).toMatchObject({ seed: level.seed, matched: ids.length, firstMismatch: null, spans: ids.length, whole: true })
    expect(done.check?.rows).toHaveLength(ids.length)
    const failed = floorView(state(ids.slice(0, 5)))
    expect([failed.done, failed.served, failed.sealed]).toEqual([true, false, false])
    expect(failed.check).toMatchObject({ matched: 5, firstMismatch: null, whole: false })
  })

  test('no other level is sealed, none has a check, and they allow as many runs as the learner likes', () => {
    for (const id of LEVEL_IDS) {
      const l = buildLevel(id, 0)
      const finished = floorView(floorGhost(l))
      expect([id, floorView(floorInit(l)).sealed, finished.sealed, finished.check, finished.runsAllowed]).toEqual([id, false, false, null, null])
    }
  })

  test('the plan of the house is not drawn for a sealed view, and the whole house is once the run is judged', async () => {
    const { layoutMap, mapOfView } = await import('@es/play/engine-floor/layout')
    const floors = (v: ReturnType<typeof floorView>): number => (layoutMap(mapOfView(v)).layers.find((layer) => layer.part === 'floors')?.marks ?? []).filter((m) => m.kind === 'text').length
    const sealed = mapOfView(floorView(state(ids.slice(0, 2), false)))
    expect([sealed.revealed, sealed.plan, sealed.stagesInPath]).toEqual([false, [], 2])
    const done = floorView(state(ids))
    const open = mapOfView(done)
    expect([open.revealed, open.plan.length > 0, open.stagesInPath]).toEqual([true, true, ids.length])
    // Two stages in, the house shows the floors those stages stand on, and no more: fewer than the whole path's.
    expect(floors(floorView(state(ids.slice(0, 2), false)))).toBeLessThan(floors(done))
    // A practice level draws the plan of the whole house as soon as the prediction is written, as before.
    const practice = buildLevel('vllm', 0)
    const view = floorView(walk(practice, { t: 'commit', prediction: 2 }))
    expect([mapOfView(view).revealed, mapOfView(view).plan.length > 0, mapOfView(view).stagesInPath]).toEqual([true, true, practice.reference.length])
  })
})

describe('a stage that belongs to another request of the same engine (the tray holds them all)', () => {
  const vllm = (over: Partial<Scenario>): Scenario => ({ engine: 'vllm', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1, ...over })

  test('what a stage needs is the one value of each flag that every request with the stage has, when the engine can be asked both', () => {
    expect(needsOf('vllm', 'vllm.rpc-broadcast')).toEqual([{ flag: 'tp', value: 2 }])
    expect(needsOf('vllm', 'vllm.execute-model')).toEqual([{ flag: 'tp', value: 1 }])
    expect(needsOf('vllm', 'vllm.fan-out')).toEqual([{ flag: 'n', value: 2 }])
    expect(needsOf('vllm', 'vllm.prefix-hit')).toEqual([{ flag: 'prefixHit', value: true }])
    expect(needsOf('vllm', 'vllm.sse-chunk')).toEqual([{ flag: 'streaming', value: true }])
    expect(needsOf('vllm', 'vllm.full-response')).toEqual([{ flag: 'streaming', value: false }])
    // A client leaves mid-stream only from a streamed answer, so the one that follows from the other is left out.
    expect(needsOf('vllm', 'vllm.abort-zmq')).toEqual([{ flag: 'abort', value: true }])
    // A stage the engine has in every request needs nothing, and a stage it does not have needs nothing either.
    expect(needsOf('vllm', 'vllm.schedule')).toEqual([])
    expect(needsOf('vllm', 'sglang.sse-chunk')).toEqual([])
    // An engine that cannot be asked a thing does not make a stage need it: Mini-SGLang reads no `n`.
    expect(needsOf('mini-sglang', 'mini.prefix-hit')).toEqual([{ flag: 'prefixHit', value: true }])
  })

  test('laid in the right place, it is named: it is the engine\'s, for a request with this, and this request has that', () => {
    const sc = vllm({ n: 1 })
    const path = referenceOf(sc).map((stage) => stage.id)
    const at = path.indexOf('vllm.zmq-add')
    const state = layAndRunIds(sc, [...path.slice(0, at), 'vllm.fan-out'])
    const view = floorView(state)
    expect(view.stop).toMatchObject({ at, failure: 'path', laid: { id: 'vllm.fan-out' } })
    expect(view.stop?.sentence).toBe('“fan out `n` child requests (`ParentRequest`)” is a hand-off of vLLM at the pin, but only for a request with two samples. This request has one sample.')
    expect(view.stop?.sentence).not.toMatch(/\d/)
    const two = layAndRunIds(vllm({ tp: 2 }), [...referenceOf(vllm({ tp: 2 })).slice(0, 7).map((stage) => stage.id)].slice(0, 6).concat('vllm.execute-model'))
    expect(floorView(two).stop?.sentence).toContain('only for a request with one rank. This request has two ranks.')
  })

  test('says it in the words of the flags, one phrase for each, and falls back to a plain sentence for a stage the engine never makes', () => {
    const sc = vllm({})
    const path = referenceOf(sc).map((stage) => stage.id)
    const abort = layAndRunIds(sc, [...path.slice(0, path.indexOf('vllm.sse-chunk') + 1), 'vllm.disconnect'])
    // The abort's first stage is in the engine's path for a request that is aborted; here the request is not.
    expect(floorView(abort).stop).toMatchObject({ laid: { id: 'vllm.disconnect' }, failure: 'path' })
    expect(floorView(abort).stop?.sentence).toBe('“the client closes the connection” is a hand-off of vLLM at the pin, but only for a request with a client that leaves mid-stream. This request has a client that stays to the end.')
  })
})

describe('random play on the graded level never breaks a view', () => {
  test('lays a few stages from the tray in any order, including stages of other engines and of other requests, and every view, drawing and grade is well formed, run or not', () => {
    let ran = 0
    for (let seed = 0; seed < 80; seed++) {
      const level = map(seed)
      const rng = rngFor(seed, 'test/random-play')
      let state = floorReduce(floorInit(level), { t: 'commit', prediction: below(rng, 6) })
      const n = below(rng, 15)
      for (let i = 0; i < n; i++) {
        const left = level.tray.filter((id) => !state.laid.includes(id))
        state = floorReduce(state, { t: 'lay', stage: left[below(rng, left.length)] })
      }
      const before = floorView(state)
      expect([seed, before.sealed, before.check, before.done]).toEqual([seed, true, null, false])
      for (const orientation of ['landscape', 'portrait'] as const) expect(() => frameSvg(layoutMap(mapOfView(before), { orientation }))).not.toThrow()
      if (state.laid.length === 0) continue
      ran += 1
      const after = floorView(floorReduce(state, { t: 'run' }))
      expect([seed, after.done, after.sealed, after.runs]).toEqual([seed, true, false, 1])
      expect(after.check?.rows).toHaveLength(state.laid.length)
      expect(after.check?.matched).toBeLessThanOrEqual(after.check?.spans ?? 0)
      for (const orientation of ['landscape', 'portrait'] as const) expect(() => frameSvg(layoutMap(mapOfView(after), { orientation }))).not.toThrow()
      const grade = floorGrade(floorReduce(state, { t: 'run' }), floorGhost(level))
      expect(grade.score).toBeGreaterThanOrEqual(0)
      expect(grade.score).toBeLessThanOrEqual(1)
      // A path of random stages is almost never the engine's whole path, and when it is, it passes.
      expect(grade.ok).toBe(after.check?.whole === true && after.served)
    }
    expect(ran).toBeGreaterThan(60)
  })
})

/** The scenario's path laid as far as `ids` go, and run once, on the graded level's rules. */
function layAndRunIds(sc: Scenario, ids: readonly string[]): FloorState {
  const level: FloorLevel = { ...buildLevel(MAP_LEVEL, 0), scenario: sc, reference: referenceOf(sc).map((stage) => stage.id), tray: trayFor(sc, 0, true).map((stage) => stage.id) }
  return walk(level, { t: 'commit', prediction: 0 }, ...ids.map((stage): FloorAction => ({ t: 'lay', stage })), { t: 'run' })
}
