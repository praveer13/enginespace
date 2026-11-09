/*
 * W1b-T03: `tr1.where-does-it-run`, the exit item of TR1's third lesson and the main item of its sixth and seventh. The tests hold the family
 * to the lifecycle model that it reads: the right option is the place where the stage ends in the model's path, a stage starts where the one
 * before it ended, every question has five places of the engine for options, and no question is one that has no single answer.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { whereDoesItRun } from '@es/play/items/families/tr1/where-does-it-run'
import { entryOf, isAbort, placeKey, poolOf, ranksOf } from '@es/play/items/families/tr1/lifecycle-kit'
import type { Entry } from '@es/play/items/families/tr1/lifecycle-kit'
import { ENGINE_IDS, ENGINES, referencePath, scenarios } from '@es/sim/lifecycle'
import type { EngineId, Place } from '@es/sim/lifecycle'
import { correctId, expectWellMade, KC_IDS, shares } from './items-tr1-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(400, 0x71a2)

function entryOfItem(item: Item): Entry {
  const { engine, stage, ranks } = item.params
  const found = entryOf(engine as EngineId, String(stage), ranks as 1 | 2)
  if (found === undefined) throw new Error(`no stage ${String(stage)} of ${String(engine)}`)
  return found
}

/** A place as an option of the ticket prints it. */
const printed = (place: Place): string => (place.device === 'gpu' ? `the GPU of ${place.process}` : `${place.process} process, ${place.thread}`)

/** The text of the option with this id. */
function textOf(item: Item, id: string): string {
  if (item.answer.kind !== 'choice') throw new Error('a choice')
  return plain(item.answer.options.find((option) => option.id === id)?.text ?? [])
}

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at every level', () => {
    expect(familyById('tr1.where-does-it-run')).toBe(whereDoesItRun)
    expect(FAMILIES).toContain(whereDoesItRun)
    expect(familiesForKc('tr1.sglang-lifecycle').map((gen) => gen.id)).toContain('tr1.where-does-it-run')
    expect(familiesForKc('tr1.abort-path').map((gen) => gen.id)).toEqual(['tr1.request-state', 'tr1.where-does-it-run'])
    for (const kc of whereDoesItRun.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const level of LEVELS) expect(offeredAt(whereDoesItRun, level).map((variant) => variant.id)).toEqual(['sglang', 'vllm', 'abort'])
  })
})

describe('every item', () => {
  test('is deterministic, well formed and graded as the key says, at every level, with no bare number in a sentence', () => {
    expectWellMade(whereDoesItRun, SEEDS)
  })
})

describe('the key is where the model puts the request when the stage is done', () => {
  test('is the place where the stage ends, in the words of the option, and the option has a letter for an id', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 120)) {
        const item = whereDoesItRun.make(seed, level)
        const { stage } = entryOfItem(item)
        expect(correctId(item)).toMatch(/^[a-e]$/)
        expect(textOf(item, correctId(item))).toBe(printed(stage.to))
      }
    }
  })

  test('is where the stage before it left the request, for a stage that does its work in place: a stage starts where the last one ended', () => {
    let inPlace = 0
    for (const seed of SEEDS) {
      const item = whereDoesItRun.make(seed, 2)
      const entry = entryOfItem(item)
      if (item.params.moves) continue
      inPlace += 1
      expect(entry.prev).not.toBeNull()
      expect(placeKey(entry.prev?.to ?? entry.stage.from)).toBe(placeKey(entry.stage.to))
      expect(plain(item.stem)).toContain('does the engine do the work of this stage')
    }
    expect(inPlace).toBeGreaterThan(80)
  })

  test('holds the model\'s own path: in every scenario, the stage before this one ends where it starts', () => {
    for (const engine of ENGINE_IDS) {
      for (const scenario of scenarios(engine)) {
        const path = referencePath(scenario)
        for (let at = 1; at < path.length; at += 1) expect([engine, path[at].id, placeKey(path[at - 1].to)]).toEqual([engine, path[at].id, placeKey(path[at].from)])
      }
    }
  })

  test('asks where the request arrives for a stage that moves it, and where the work is done for one that does not', () => {
    let moved = 0
    for (const seed of SEEDS) {
      const item = whereDoesItRun.make(seed, 2)
      const { stage } = entryOfItem(item)
      const moves = placeKey(stage.from) !== placeKey(stage.to)
      expect(item.params.moves).toBe(moves)
      expect(plain(item.stem)).toContain(moves ? 'is the request once this stage is done' : 'does the engine do the work of this stage')
      if (moves) moved += 1
    }
    expect(moved).toBeGreaterThan(80)
  })
})

describe('what is asked, and what is not', () => {
  test('never asks about a stage that ends at the client, or one that only a two-rank path has', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 150)) {
        const entry = entryOfItem(whereDoesItRun.make(seed, level))
        expect(entry.stage.to.process).not.toBe('client')
        expect(ranksOf(entry)).toBe(1)
      }
    }
  })

  test('draws the stages of an abort in the abort variant, and only there', () => {
    for (const seed of SEEDS) {
      for (const variant of ['sglang', 'vllm', 'abort'] as const) {
        const entry = entryOfItem(whereDoesItRun.make(seed, 2, variant))
        expect(isAbort(entry)).toBe(variant === 'abort')
      }
    }
  })

  test('draws each variant from the engines it names', () => {
    const wanted: Record<string, EngineId[]> = { sglang: ['mini-sglang', 'sglang'], vllm: ['inside-vllm', 'vllm'], abort: ['mini-sglang', 'inside-vllm', 'vllm', 'sglang'] }
    for (const variant of Object.keys(wanted)) {
      const engines = new Set(SEEDS.map((seed) => whereDoesItRun.make(seed, 2, variant).params.engine as string))
      expect([...engines].sort()).toEqual([...wanted[variant]].sort())
    }
    // nano-vllm has no variant: at one rank it runs everything in the caller's process, and it has no abort path to ask about.
    expect(ENGINES['nano-vllm'].supports.abort).toEqual([false])
  })
})

describe('the options', () => {
  test('are five places of the engine, the stage\'s own among them, with five different letters, and none is the client', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const item = whereDoesItRun.make(seed, 2)
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const entry = entryOfItem(item)
      expect(item.answer.options).toHaveLength(5)
      expect(new Set(item.answer.options.map((option) => option.id)).size).toBe(5)
      const places = poolOf(entry.engine)
        .filter((candidate) => ranksOf(candidate) === 1)
        .flatMap((candidate) => [candidate.stage.from, candidate.stage.to])
        .filter((place) => place.process !== 'client')
      const known = new Set(places.map(printed))
      const texts = item.answer.options.map((option) => plain(option.text))
      expect(new Set(texts).size).toBe(5)
      for (const text of texts) expect([text, known.has(text)]).toEqual([text, true])
    }
  })

  test('are headed by the places of an abort\'s own path in the abort variant, which are the ones a learner who has not read the path takes for it', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const item = whereDoesItRun.make(seed, 2, 'abort')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const entry = entryOfItem(item)
      const onPath = new Set(poolOf(entry.engine).filter((candidate) => isAbort(candidate)).flatMap((candidate) => [candidate.stage.from, candidate.stage.to]).map(printed))
      const texts = item.answer.options.map((option) => plain(option.text))
      // Every place of the abort's path that is not the key is an option, up to four.
      const wanted = [...onPath].filter((text) => text !== printed(entry.stage.to) && !text.startsWith('client')).length
      const present = texts.filter((text) => onPath.has(text) && text !== printed(entry.stage.to)).length
      expect(present).toBe(Math.min(wanted, 4))
    }
  })

  test('are the key on a fifth of the seeds each, by letter, in every variant', () => {
    for (const variant of ['sglang', 'vllm', 'abort']) {
      const share = shares(whereDoesItRun, 2, variant, correctId)
      expect([...share.keys()].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
      for (const [letter, rate] of share) expect([variant, letter, rate > 0.15 && rate < 0.25]).toEqual([variant, letter, true])
    }
  })

  test('explain a wrong place by what the engine does there, with a misconception of its own', () => {
    const misses = new Set<string>()
    for (const seed of SEEDS.slice(0, 200)) {
      const item = whereDoesItRun.make(seed, 2)
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) {
        if (option.id === item.answer.correct) continue
        misses.add(option.miss ?? '')
        const why = plain(option.why)
        expect(why).toMatch(/is where the (?:engine does the work of|request arrives in) another stage|so it is no longer there|is never in/)
      }
    }
    expect([...misses].sort()).toEqual(['tr1.where-does-it-run.gpu-for-host', 'tr1.where-does-it-run.host-for-gpu', 'tr1.where-does-it-run.right-process-wrong-thread', 'tr1.where-does-it-run.wrong-process'])
  })
})

describe('the solution and the levels', () => {
  test('names the stage, says where the previous stage left the request or how the stage carries it, and ends in the place', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = whereDoesItRun.make(seed, 2)
      const entry = entryOfItem(item)
      const steps = whereDoesItRun.solution(item)
      expect(steps).toHaveLength(3)
      expect(plain(steps[0].text)).toContain('Take the stage')
      expect(plain(steps[1].text)).toContain(item.params.moves ? 'The stage carries the request' : 'a stage starts where the last one ended')
      expect(plain(steps[1].text)).toMatch(/So the answer is /)
      expect(plain(steps[2].text)).toContain(entry.stage.source.quote)
    }
  })

  test('has a worked example at level 0 with another place for its answer, the first step at level 1, and nothing at levels 2 and 3', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const own = whereDoesItRun.make(seed, 0)
      expect(own.worked).toHaveLength(3)
      expect(whereDoesItRun.make(seed, 1).worked).toHaveLength(1)
      expect(whereDoesItRun.make(seed, 2).worked).toHaveLength(0)
      expect(whereDoesItRun.make(seed, 3).worked).toHaveLength(0)
      const answerOf = (steps: readonly { text: readonly { t: string }[] }[]) => plain(steps[1].text as never).split('So the answer is ').at(-1)
      expect(answerOf(own.worked)).not.toBe(answerOf(whereDoesItRun.solution(own)))
    }
  })

  test('shows the engine\'s own line at level 3, unless another stage cites the same line', () => {
    let code = 0
    for (const seed of SEEDS) {
      const item = whereDoesItRun.make(seed, 3)
      if (item.params.surface !== 'code') continue
      code += 1
      expect(plain(item.stem)).toContain(entryOfItem(item).stage.source.quote)
    }
    expect(code).toBeGreaterThan(200)
  })
})
