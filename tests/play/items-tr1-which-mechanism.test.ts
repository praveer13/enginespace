/*
 * W1b-T03: `tr1.which-mechanism`, the exit item of TR1's first lesson. The tests hold the family to the lifecycle model that it reads (every
 * key is the mechanism of a stage of an engine's path, put into the lesson's five words, and every place on the ticket is the stage's own), to
 * the lesson's table of the five words, and to the framework's rules.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { whichMechanism } from '@es/play/items/families/tr1/which-mechanism'
import { entryOf, KLASS_OF, KLASSES, placeText, poolOf, ranksOf, sharesLine } from '@es/play/items/families/tr1/lifecycle-kit'
import type { Klass } from '@es/play/items/families/tr1/lifecycle-kit'
import { boundaryOf, FITS, stageFits } from '@es/sim/lifecycle'
import { ENGINE_IDS } from '@es/sim/lifecycle'
import type { EngineId } from '@es/sim/lifecycle'
import { MECHANISM_WORD } from '../content/tr1-demos.ts'
import { correctId, expectWellMade, shares } from './items-tr1-support.ts'
import { KC_IDS } from './items-tr1-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(400, 0x71a1)

/** The stage that an item was made from, read off its params. */
function stageOf(item: Item) {
  const { engine, stage, ranks } = item.params
  const entry = entryOf(engine as EngineId, String(stage), ranks as 1 | 2)
  if (entry === undefined) throw new Error(`no stage ${String(stage)} of ${String(engine)}`)
  return entry
}

describe('the family', () => {
  test('is registered, names KCs of the graph, and offers its variants at every level', () => {
    expect(familyById('tr1.which-mechanism')).toBe(whichMechanism)
    expect(FAMILIES).toContain(whichMechanism)
    expect(familiesForKc('tr1.five-mechanisms')).toEqual([whichMechanism])
    for (const kc of whichMechanism.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const level of LEVELS) expect(offeredAt(whichMechanism, level).map((variant) => variant.id)).toEqual(['nano', 'sglang', 'vllm'])
  })

  test('puts the model\'s nine mechanisms into the lesson\'s five words as the lesson\'s own table does', () => {
    expect(Object.keys(KLASS_OF).sort()).toEqual(Object.keys(MECHANISM_WORD).sort())
    for (const [mechanism, word] of Object.entries(MECHANISM_WORD)) expect([mechanism, KLASS_OF[mechanism as keyof typeof KLASS_OF]]).toEqual([mechanism, word.toLowerCase()])
    expect([...KLASSES].sort()).toEqual(['compute', 'copy', 'ipc', 'queue', 'sync'])
  })

  test('has a stage of every mechanism in every engine, so that a draw by mechanism never comes up empty, and a stage is named once for each rank', () => {
    for (const engine of ENGINE_IDS) {
      const pool = poolOf(engine)
      for (const klass of KLASSES) expect([engine, klass, pool.some((entry) => KLASS_OF[entry.stage.mechanism] === klass)]).toEqual([engine, klass, true])
      const names = pool.map((entry) => `${entry.stage.id}/${ranksOf(entry)}`)
      expect([engine, names.length - new Set(names).size]).toEqual([engine, 0])
    }
  })
})

describe('every item', () => {
  test('is deterministic, well formed and graded as the key says, at every level, with no bare number in a sentence', () => {
    expectWellMade(whichMechanism, SEEDS)
  })
})

describe('the key is the stage\'s mechanism, as the model has it', () => {
  test('is the lesson\'s word for the stage\'s mechanism, and the places on the ticket are the stage\'s own', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS.slice(0, 120)) {
        const item = whichMechanism.make(seed, level)
        const { stage } = stageOf(item)
        expect(correctId(item)).toBe(KLASS_OF[stage.mechanism])
        const given = (label: string) => plain([item.givens.find((candidate) => candidate.label === label)?.value ?? { t: 'text', text: '' }])
        expect(given('starts at')).toBe(placeText(stage.from))
        expect(given('ends at')).toBe(placeText(stage.to))
      }
    }
  })

  test('follows the rules of the model: a change of process is IPC, a change of thread a queue, and a hop between the host and a GPU a copy', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = whichMechanism.make(seed, 2)
      const { stage } = stageOf(item)
      expect(stageFits(stage).ok).toBe(true)
      const boundary = boundaryOf(stage.from, stage.to)
      seen.add(boundary)
      const key = correctId(item) as Klass
      if (boundary === 'process') expect(key).toBe('ipc')
      if (boundary === 'thread') expect(key).toBe('queue')
      if (boundary === 'to-gpu' || boundary === 'to-host') expect(key).toBe('copy')
      if (boundary === 'on-gpu' || boundary === 'across-gpus') expect(key).toBe('compute')
      // The model lets only these mechanisms cross that boundary, and the key is one of them in the lesson's words.
      expect(FITS[boundary].map((mechanism) => KLASS_OF[mechanism])).toContain(key)
    }
    // Every boundary of the model is asked about, and the ones that need the label to tell the mechanism are among them.
    expect([...seen].sort()).toEqual(['across-gpus', 'none', 'on-gpu', 'process', 'thread', 'to-gpu', 'to-host'])
  })

  test('is drawn answer first: each of the five mechanisms is the key on about a fifth of the seeds, in every variant', () => {
    for (const variant of ['nano', 'sglang', 'vllm']) {
      const share = shares(whichMechanism, 2, variant, correctId)
      expect([...share.keys()].sort()).toEqual(['compute', 'copy', 'ipc', 'queue', 'sync'])
      for (const [klass, rate] of share) expect([variant, klass, rate > 0.15 && rate < 0.25]).toEqual([variant, klass, true])
    }
  })

  test('draws each variant from the engines of its group, and the abort stages of an engine are among them', () => {
    const groups: Record<string, EngineId[]> = { nano: ['nano-vllm'], sglang: ['mini-sglang', 'sglang'], vllm: ['inside-vllm', 'vllm'] }
    const abort = new Set<string>()
    for (const seed of SEEDS) {
      for (const variant of Object.keys(groups)) {
        const item = whichMechanism.make(seed, 2, variant)
        expect(groups[variant]).toContain(item.params.engine as EngineId)
        if (stageOf(item).needs.some((need) => need.flag === 'abort')) abort.add(String(item.params.stage))
      }
    }
    expect(abort.size).toBeGreaterThan(10)
  })
})

describe('what a ticket shows', () => {
  test('names the engine and the stage, and the request it needs where it is not the practice levels\' own', () => {
    let withRequest = 0
    for (const seed of SEEDS) {
      const item = whichMechanism.make(seed, 2)
      const text = plain(item.stem)
      expect(text).toContain('Here is one stage of a request\'s path through')
      const { needs } = stageOf(item)
      const line = item.givens.find((given) => given.label === 'the request')
      expect(line !== undefined).toBe(needs.length > 0)
      if (line !== undefined) withRequest += 1
    }
    expect(withRequest).toBeGreaterThan(40)
  })

  test('shows the engine\'s own line at level 3, unless another stage cites the same line, and the label otherwise', () => {
    let code = 0
    let label = 0
    for (const seed of SEEDS) {
      const item = whichMechanism.make(seed, 3)
      const entry = stageOf(item)
      const text = plain(item.stem)
      if (item.params.surface === 'code') {
        code += 1
        expect(sharesLine(entry)).toBe(false)
        expect(text).toContain(entry.stage.source.quote)
        expect(text).toContain(entry.stage.source.path)
      } else {
        label += 1
        expect(sharesLine(entry)).toBe(true)
      }
    }
    expect(code).toBeGreaterThan(label)
    for (const level of [0, 1, 2] as const) expect(whichMechanism.make(SEEDS[0], level).params.surface).toBe('label')
  })

  test('has a worked example at level 0, the first step at level 1, and nothing at levels 2 and 3', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      expect(whichMechanism.make(seed, 0).worked).toHaveLength(3)
      expect(whichMechanism.make(seed, 1).worked).toHaveLength(1)
      expect(whichMechanism.make(seed, 2).worked).toHaveLength(0)
      expect(whichMechanism.make(seed, 3).worked).toHaveLength(0)
      // The example is another stage, and another mechanism, so that its answer cannot be copied.
      const own = plain(whichMechanism.solution(whichMechanism.make(seed, 0))[1].text)
      expect(plain(whichMechanism.make(seed, 0).worked[1].text)).not.toBe(own)
    }
  })

  test('explains every option: the right one by the rule, a wrong one by what it is and what the stage does instead, with a misconception of its own', () => {
    const misses = new Set<string>()
    for (const seed of SEEDS.slice(0, 120)) {
      const item = whichMechanism.make(seed, 2)
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(item.answer.options).toHaveLength(5)
      const key = item.answer.correct
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(60)
        if (option.id === key) expect(option.miss).toBeUndefined()
        else {
          expect(option.miss).toBe(`tr1.which-mechanism.${option.id}-for-${key}`)
          misses.add(option.miss ?? '')
          expect(plain(option.why)).toContain('is not what joins the two places')
        }
      }
    }
    // Twenty ways to take one mechanism for another, and the draws meet most of them.
    expect(misses.size).toBeGreaterThan(14)
  })

  test('ends its solution in the key, names the stage\'s own line of the engine, and says nothing of a number', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = whichMechanism.make(seed, 2)
      const steps = whichMechanism.solution(item)
      const { stage } = stageOf(item)
      expect(steps).toHaveLength(3)
      expect(plain(steps[1].text)).toMatch(/So the mechanism is (?:compute|a queue|IPC|a copy|a sync)\.$/)
      expect(plain(steps[2].text)).toContain(stage.source.quote)
      expect(plain(steps[2].text)).toContain(stage.source.symbol)
    }
  })
})
