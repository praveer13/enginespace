/*
 * Back of House's levels and their bands (GAMES.md §5 "Levels" and "Band", §2.1; W1-T17): the scenario each practice level lays, the tray
 * that a seed draws for it, and the band that makes a seed a fair question.
 *
 * The tray holds the engine's path and at least three real stages of other engines, in a seeded order. Every distractor is legal
 * somewhere in its own engine (GAMES.md §5 "Invariants") and none could be mistaken for a stage of the path. The naive strategies, the tray laid
 * as it stands and the first card that starts where the ticket is, lose on every seed in band.
 *
 * Measured by the band test [measured 2026-11-04 at 5ffa2f9, with this task's files]: every one of the first 400 seeds is in band on every
 * level, so verify:games' floor of 20% holds with room (the band has no degenerate draw to reject: the tray is a shuffle).
 */
import { describe, expect, test } from 'bun:test'
import { BAND_CANDIDATES, BAND_FLOOR } from '../../scripts/verify-games'
import { runPath } from '@es/play/engine-floor/engine'
import { DISTRACTORS, LEVEL_IDS, RIVAL, buildLevel, distractorsFor, inLevelBand, levelTitle, rivalScenario, scenarioOf, trayFor } from '@es/play/engine-floor/levels'
import { ownerOf, referenceOf, stageIn, stagesOf } from '@es/play/engine-floor/stages'
import { placeKey } from '@es/play/engine-floor/words'
import { ENGINES, describeScenario, entryOf, invalidReason, scenarios, walk } from '@es/sim/lifecycle'
import type { EngineId, Scenario, StageDef } from '@es/sim/lifecycle'
import { ALL_SCENARIOS } from './engine-floor-support'

describe('the practice levels are GAMES.md §5\'s, in the order of its difficulty line', () => {
  test('there are seven, nano to abort, each one engine\'s one idea, and each is a valid scenario of the model', () => {
    expect(LEVEL_IDS).toEqual(['nano', 'nano-tp', 'mini', 'inside', 'vllm', 'sglang', 'abort'])
    const engines = LEVEL_IDS.map((id) => scenarioOf(id).engine)
    expect(engines).toEqual(['nano-vllm', 'nano-vllm', 'mini-sglang', 'inside-vllm', 'vllm', 'sglang', 'vllm'])
    for (const id of LEVEL_IDS) expect([id, invalidReason(scenarioOf(id))]).toEqual([id, null])
  })

  test('each lays what its row of the table says: two ranks for nano-tp, streaming for the servers, a prefix hit for sglang, and an abort for abort', () => {
    expect(scenarioOf('nano-tp').tp).toBe(2)
    for (const id of ['mini', 'inside', 'vllm', 'sglang', 'abort'] as const) expect(scenarioOf(id).streaming).toBe(true)
    expect(scenarioOf('sglang').prefixHit).toBe(true)
    expect(scenarioOf('abort')).toMatchObject({ engine: 'vllm', abort: true, streaming: true })
    expect(LEVEL_IDS.filter((id) => scenarioOf(id).abort)).toEqual(['abort'])
  })

  test('is read at the commits the lock pins: the paths cite the pinned vLLM for the pin and the post\'s commit for the post', () => {
    expect(ENGINES.vllm.ref).toBe('4ba787ec9959e566d3b587a796dff07673324da5')
    expect(ENGINES['inside-vllm'].ref.slice(0, 7)).toBe('42172ad')
    expect(referenceOf(scenarioOf('inside')).every((stage) => stage.source.ref === ENGINES['inside-vllm'].ref)).toBe(true)
    expect(referenceOf(scenarioOf('vllm')).every((stage) => stage.source.ref === ENGINES.vllm.ref)).toBe(true)
  })

  test('a title names the engine and nothing of its architecture, so that it does not answer the prediction; the prompt says what the level is about and carries no digit', () => {
    for (const id of LEVEL_IDS) {
      const title = levelTitle(id)
      expect(title).not.toMatch(/process|thread|queue|window|boundar|hop/i)
      expect(buildLevel(id, 0).prompt).not.toMatch(/\d/)
    }
  })
})

describe('a tray: the engine\'s path and real stages of other engines, in a seeded order (GAMES.md §5)', () => {
  test.each(LEVEL_IDS.map((id) => [id] as const))('%s: the path\'s stages and %d others, every one laid once, none of them twice', (id) => {
    const level = buildLevel(id, 0)
    expect(level.tray.length).toBe(level.reference.length + DISTRACTORS)
    expect(new Set(level.tray).size).toBe(level.tray.length)
    expect([...level.tray].sort()).toEqual([...level.reference, ...level.tray.filter((stage) => !level.reference.includes(stage))].sort())
    expect(level.reference.every((stage) => level.tray.includes(stage))).toBe(true)
    expect(DISTRACTORS).toBeGreaterThanOrEqual(3)
  })

  test('every distractor is a real stage of another engine, and is legal somewhere in its own: it starts where its engine\'s path has the request', () => {
    for (const id of LEVEL_IDS) {
      const sc = scenarioOf(id)
      const level = buildLevel(id, 3)
      const strangers = level.tray.filter((stage) => !level.reference.includes(stage))
      expect(strangers.length).toBe(DISTRACTORS)
      for (const stage of strangers) {
        const owner = ownerOf(stage)
        expect([id, stage, owner !== undefined && owner !== sc.engine]).toEqual([id, stage, true])
        // Some scenario of its own engine holds it in the engine's path, so the stage is legal where it stands there.
        const home = scenarios(owner as EngineId).find((candidate) => referenceOf(candidate).some((s) => s.id === stage))
        expect([stage, home !== undefined]).toEqual([stage, true])
        const path = referenceOf(home as Scenario)
        const at = path.findIndex((s) => s.id === stage)
        expect(walk(entryOf((home as Scenario).engine), path.slice(0, at + 1)).firstWrong).toBeNull()
      }
    }
  })

  test('no distractor could be taken for a stage of the path: it differs from every one in its mechanism, its label or its places', () => {
    for (const id of LEVEL_IDS) {
      for (let seed = 0; seed < 25; seed++) {
        const sc = scenarioOf(id)
        const look = (s: StageDef) => [s.mechanism, s.label, placeKey(s.from), placeKey(s.to)].join('~')
        const own = new Set(referenceOf(sc).map(look))
        for (const stage of distractorsFor(sc, seed)) expect([id, seed, stage.id, own.has(look(stage))]).toEqual([id, seed, stage.id, false])
      }
    }
  })

  test('the order is the seed\'s: a seed draws the same tray every time, and seeds draw different ones', () => {
    for (const id of LEVEL_IDS) {
      const sc = scenarioOf(id)
      expect(trayFor(sc, 11).map((stage) => stage.id)).toEqual(trayFor(sc, 11).map((stage) => stage.id))
      const trays = new Set(Array.from({ length: 40 }, (_, seed) => trayFor(sc, seed).map((stage) => stage.id).join()))
      expect(trays.size).toBeGreaterThan(35)
    }
  })

  test('a stage of the tray is looked up in the scenario\'s own variant: the stages whose places move with the rank are not mixed up', () => {
    const level = buildLevel('nano-tp', 0)
    for (const id of level.reference) expect(stageIn(scenarioOf('nano-tp'), id)).toBe(referenceOf(scenarioOf('nano-tp')).find((stage) => stage.id === id))
    // `rpc` stages differ by rank, so the same id has other places in the one-rank scenario than in the two-rank one.
    const one = stageIn({ ...scenarioOf('vllm'), tp: 1 }, 'vllm.h2d')
    const two = stageIn({ ...scenarioOf('vllm'), tp: 2 }, 'vllm.h2d')
    expect(one?.to.rank).toBe(0)
    expect(two?.to.rank).toBe(1)
    expect(stagesOf('vllm').length).toBeGreaterThan(30)
  })
})

describe('the band (GAMES.md §2.1, §5): the naive strategy loses, the house run passes, and the answer is not a coin flip', () => {
  test('every candidate seed makes a fair question on every level, which is at least the floor of 20% that verify:games asks for', () => {
    for (const id of LEVEL_IDS) {
      let accepted = 0
      for (let seed = 0; seed < BAND_CANDIDATES; seed++) if (inLevelBand(id, seed)) accepted += 1
      expect([id, accepted / BAND_CANDIDATES >= BAND_FLOOR]).toEqual([id, true])
      expect([id, accepted]).toEqual([id, BAND_CANDIDATES])
    }
  })

  test('the tray read as it stands does not get the ticket home, and nor does the first card that starts where the ticket is: on 100 seeds of every level', () => {
    for (const id of LEVEL_IDS) {
      for (let seed = 0; seed < 100; seed++) {
        const level = buildLevel(id, seed)
        expect([id, seed, runPath(level.scenario, [...level.tray]).complete]).toEqual([id, seed, false])
        // The place-chasing strategy, written out: it lays the first card of the tray that starts where the ticket stands.
        const laid: string[] = []
        let at = entryOf(level.scenario.engine)
        for (;;) {
          const next = level.tray.find((stage) => !laid.includes(stage) && placeKey((stageIn(level.scenario, stage) as StageDef).from) === placeKey(at))
          if (next === undefined) break
          laid.push(next)
          at = (stageIn(level.scenario, next) as StageDef).to
        }
        expect([id, seed, runPath(level.scenario, laid).complete]).toEqual([id, seed, false])
      }
    }
  })

  test('the house run passes on every seed: the path is in the tray, and laying it in order completes it', () => {
    for (const id of LEVEL_IDS) {
      for (let seed = 0; seed < 25; seed++) {
        const level = buildLevel(id, seed)
        expect(runPath(level.scenario, level.reference).complete).toBe(true)
      }
    }
  })
})

describe('the other house (GAMES.md §5, step 6: the learner\'s engine against the other)', () => {
  test('is the small engines against each other, vLLM then and now, and vLLM against SGLang', () => {
    expect(RIVAL).toEqual({ 'nano-vllm': 'mini-sglang', 'mini-sglang': 'nano-vllm', 'inside-vllm': 'vllm', vllm: 'sglang', sglang: 'vllm' })
  })

  test('lays the same request as far as the other engine can: a valid scenario of its engine, with the features it has and the nearest it supports for the rest', () => {
    for (const sc of ALL_SCENARIOS) {
      const rival = rivalScenario(sc)
      expect([describeScenario(sc), rival.engine, invalidReason(rival)]).toEqual([describeScenario(sc), RIVAL[sc.engine], null])
    }
    expect(rivalScenario(scenarioOf('vllm'))).toEqual({ engine: 'sglang', streaming: true, tp: 1, abort: false, prefixHit: false, n: 1 })
    expect(rivalScenario(scenarioOf('abort')).abort).toBe(true)
    expect(rivalScenario({ engine: 'vllm', streaming: true, tp: 1, abort: false, prefixHit: false, n: 2 }).n).toBe(2)
    // Mini-SGLang reads no `n`, so the rival of a request for two samples is the request for one.
    expect(rivalScenario({ engine: 'sglang', streaming: true, tp: 1, abort: false, prefixHit: false, n: 2 }).engine).toBe('vllm')
    expect(rivalScenario({ engine: 'nano-vllm', streaming: false, tp: 1, abort: false, prefixHit: false, n: 1 }).n).toBe(1)
    expect(rivalScenario({ engine: 'vllm', streaming: true, tp: 1, abort: false, prefixHit: false, n: 2 }).engine).toBe('sglang')
  })
})
