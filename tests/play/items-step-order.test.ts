/*
 * W1b-T04: `tr2.step-order`. The tests hold what the family says of the calls to the claims that it cites, hold `idle-before` to the step loop
 * (the gap between two forwards, and the share of the clock that the GPU is busy), check that every wrong list breaks the rule it names and that every
 * description names one call, and hold the family to the framework's own rules (the checks of `commonSuite`).
 */
import { describe, expect, test } from 'bun:test'
import { fixedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item, Part } from '@es/play/items'
import { CALLS, PHASES, stepModel, stepOrder } from '@es/play/items/families/tr2/step-order'
import { hostPreset } from '@es/sim/host'
import type { HostCard } from '@es/sim/host'
import { runStepLoop, SMALL_CARD } from '@es/sim/steploop'
import { genWorkload } from '@es/sim/workload'
import { claim, commonSuite, givenNumbers } from './items-tr2-support.ts'

commonSuite(stepOrder, 0x57e9)

const SEEDS = fixedSeeds(400, 0x57e)

const numericKey = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

/** Whether a draw would serve this seed as `variant` at `level`: the seed picks the variant, and the band judges the seed's own. */
const served = (seed: number, level: 0 | 1 | 2 | 3, variant: string): boolean => stepOrder.make(seed, level).variant === variant && stepOrder.band(seed, level)

/** The names of a list option, from its code parts. */
const namesOf = (parts: readonly Part[]): string[] => parts.flatMap((part) => (part.t === 'code' ? [part.code] : []))

describe('what the family says of the calls rests on the claims', () => {
  test('the order is the claim\'s: schedule, launch, mask, wait, sample, update', () => {
    const value = String(claim('vllm.step.order').value).split(', ')
    const names: Record<string, string> = { schedule: 'schedule', launch: 'execute_model', mask: 'get_grammar_bitmask', wait: 'future.result', sample: 'sample_tokens', update: 'update_from_output' }
    expect(value.map((word) => names[word])).toEqual([...CALLS])
    expect(claim('vllm.step.order').text).toContain('schedules, launches execute_model without blocking, builds the grammar bitmask on the CPU while the forward runs, waits on the future, samples with the bitmask, and updates the scheduler')
  })

  test('each call\'s work and wait are claims\': the state and inputs, the future, the mask, the second call, the copy and the stop check', () => {
    expect(claim('vllm.step.execute-model-state').text).toContain('brings the request states up to date')
    expect(claim('vllm.step.execute-model-state').text).toContain('prepares all the inputs')
    expect(claim('vllm.executor.uni-inline').text).toContain('returns a future for the output once the work has been launched, and does not wait for the GPU to finish it')
    expect(claim('vllm.mask.overlap').text).toContain('builds the grammar bitmask after execute_model has launched the forward without blocking, so the mask is computed while the GPU runs')
    expect(claim('vllm.mask.overlap').text).toContain('sample_tokens then applies it')
    expect(claim('vllm.step.two-phase').text).toContain('keeps the state of execute_model for the sample_tokens call')
    expect(claim('vllm.step.sample-if-none').text).toContain('only when the result of the future is None')
    expect(claim('vllm.executor.uni-blocking-output').text).toContain('does not return until get_output() has')
    expect(claim('vllm.async-output.event-sync').text).toContain('the host blocks there until the copy has landed')
    expect(claim('vllm.async-output.copy-stream').text).toContain('after that stream has waited for the main stream')
    expect(claim('vllm.scheduler.stop-check').text).toContain('checks whether a request has stopped when a step\'s output tokens come back to it, in update_from_output')
  })

  test('the model\'s six phases are the sim\'s: schedule, prepare and launch before the forward, sync and sample after it', () => {
    expect([...PHASES]).toEqual(['schedule', 'prepare', 'launch', 'forward', 'sync', 'sample'])
    const host = hostPreset('mrv2').card
    // The sim\'s host card prices exactly the five CPU phases the family names.
    for (const field of ['scheduleBaseUs', 'prepPerTokenUs', 'graphReplayUs', 'syncUs', 'samplePerSeqUs'] as const) expect(typeof host[field]).toBe('number')
  })
})

describe('order: a list of the calls, and the lists that break a rule', () => {
  const lists = (item: Item): { id: string; names: string[]; miss: string | undefined }[] =>
    item.answer.kind === 'choice' ? item.answer.options.map((option) => ({ id: option.id, names: namesOf(option.text), miss: option.miss })) : []

  test('the key is the order of the calls at level 2 and of the model\'s phases at level 3, and every other list is a different order of the same names', () => {
    const misses = new Set<string>()
    for (const seed of SEEDS) {
      for (const level of [2, 3] as const) {
        const item = stepOrder.make(seed, level, 'order')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const truth: readonly string[] = level === 3 ? PHASES : CALLS
        const options = lists(item)
        expect(options).toHaveLength(4)
        expect(new Set(options.map((option) => option.names.join()))).toHaveProperty('size', 4)
        for (const option of options) {
          expect([...option.names].sort()).toEqual([...truth].sort())
          if (option.id === item.answer.correct) {
            expect(option.names).toEqual([...truth])
            expect(option.miss).toBeUndefined()
          } else {
            expect(option.names).not.toEqual([...truth])
            expect(option.miss).toMatch(/^tr2\.step-order\.[a-z-]+$/)
            misses.add(`${level}:${option.miss}`)
          }
        }
      }
    }
    expect([...misses].sort()).toEqual([
      '2:tr2.step-order.launch-before-schedule',
      '2:tr2.step-order.mask-before-launch',
      '2:tr2.step-order.sample-before-mask',
      '2:tr2.step-order.sample-before-wait',
      '2:tr2.step-order.update-before-sample',
      '3:tr2.step-order.forward-before-launch',
      '3:tr2.step-order.launch-before-prepare',
      '3:tr2.step-order.prepare-before-schedule',
      '3:tr2.step-order.sample-before-sync',
      '3:tr2.step-order.sync-before-forward',
    ])
  })

  test('a wrong list breaks the rule it names: the pair it names is in the other order, and nothing else moved but what that takes', () => {
    const swapped = (names: string[], truth: readonly string[]): [string, string][] => {
      const pairs: [string, string][] = []
      for (let a = 0; a < truth.length; a += 1) for (let b = a + 1; b < truth.length; b += 1) if (names.indexOf(truth[a]) > names.indexOf(truth[b])) pairs.push([truth[a], truth[b]])
      return pairs
    }
    const RULE: Record<string, [string, string][]> = {
      'mask-before-launch': [['execute_model', 'get_grammar_bitmask']],
      'launch-before-schedule': [['schedule', 'execute_model']],
      'sample-before-wait': [['future.result', 'sample_tokens']],
      'sample-before-mask': [
        ['get_grammar_bitmask', 'sample_tokens'],
        ['future.result', 'sample_tokens'],
      ],
      'update-before-sample': [['sample_tokens', 'update_from_output']],
      'forward-before-launch': [['launch', 'forward']],
      'launch-before-prepare': [['prepare', 'launch']],
      'sync-before-forward': [['forward', 'sync']],
      'sample-before-sync': [['sync', 'sample']],
      'prepare-before-schedule': [['schedule', 'prepare']],
    }
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      for (const level of [2, 3] as const) {
        const item = stepOrder.make(seed, level, 'order')
        const truth: readonly string[] = level === 3 ? PHASES : CALLS
        for (const option of lists(item)) {
          if (option.miss === undefined) continue
          const rule = option.miss.replace('tr2.step-order.', '')
          expect(swapped(option.names, truth)).toEqual(RULE[rule])
          seen.add(rule)
        }
      }
    }
    expect(seen.size).toBe(10)
  })

  test('the ids are letters drawn apart from the lists: the key is each of a to d on about a quarter of the seeds', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
    for (const seed of fixedSeeds(1200, 0x1d5)) {
      const item = stepOrder.make(seed, 2, 'order')
      if (item.answer.kind === 'choice') counts[item.answer.correct] += 1
    }
    for (const id of Object.keys(counts)) {
      expect(counts[id]).toBeGreaterThan(240)
      expect(counts[id]).toBeLessThan(360)
    }
  })

  test('is offered at levels 2 and 3 only, where there is a list to know', () => {
    expect(offeredAt(stepOrder, 0).map((variant) => variant.id)).toEqual(['role', 'idle-before'])
    expect(offeredAt(stepOrder, 1).map((variant) => variant.id)).toEqual(['role', 'idle-before'])
    expect(offeredAt(stepOrder, 2).map((variant) => variant.id)).toEqual(['order', 'role', 'idle-before'])
    expect(offeredAt(stepOrder, 3).map((variant) => variant.id)).toEqual(['order', 'role', 'idle-before'])
  })
})

describe('role: a call is described by its work and by what it waits for', () => {
  test('each call is the key on about a sixth of the seeds, and the options are the six calls', () => {
    const counts = new Map<string, number>()
    for (const seed of fixedSeeds(1800, 0x4011)) {
      const item = stepOrder.make(seed, 2, 'role')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(item.answer.options.map((option) => option.id).sort()).toEqual(['execute-model', 'future-result', 'get-grammar-bitmask', 'sample-tokens', 'schedule', 'update-from-output'])
      counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
    }
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(300 * 0.8)
      expect(count).toBeLessThan(300 * 1.2)
    }
    expect(counts.size).toBe(6)
  })

  test('the description in the stem is the key call\'s, in both phrasings, and no two calls share one', () => {
    const phrases = new Map<string, string>()
    const seenPhrase = new Set<string>()
    for (const seed of SEEDS) {
      const item = stepOrder.make(seed, 2, 'role')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const stem = plain(item.stem)
      const described = stem.slice(stem.indexOf('EngineCore.step ') + 'EngineCore.step '.length, -1)
      const previous = phrases.get(described)
      // The same words always describe the same call.
      expect([described, previous ?? item.answer.correct]).toEqual([described, item.answer.correct])
      phrases.set(described, item.answer.correct)
      seenPhrase.add(`${item.answer.correct}:${item.params.phrase}`)
    }
    expect(phrases.size).toBe(12)
    expect(seenPhrase.size).toBe(12)
  })

  test('at level 3 the call is named and the options are what four calls do, the call\'s own among them', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const item = stepOrder.make(seed, 3, 'role')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(item.answer.options).toHaveLength(4)
      expect(item.answer.options.some((option) => option.id === item.answer.correct)).toBe(true)
      expect(namesOf(item.stem)).toEqual([String(item.params.call)])
      for (const option of item.answer.options) {
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toBe(`tr2.step-order.${option.id}-taken-for-${item.answer.correct}`)
      }
    }
  })

  test('the solution names the order of the calls, then the call, then where its work happens and what it waits for', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = stepOrder.make(seed, 2, 'role')
      const steps = stepOrder.solution(item)
      expect(plain(steps[0].text)).toContain('schedule → execute_model → get_grammar_bitmask → future.result → sample_tokens → update_from_output')
      expect(plain(steps[1].text)).toContain(String(item.params.call))
      expect(plain(steps[2].text)).toMatch(/CPU|GPU/)
    }
  })
})

describe('idle-before: the GPU idles for all the CPU\'s work, and none of the forward', () => {
  test('the key is the five CPU phases added at levels 0 to 2, and the busy share of the clock at level 3', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2] as const) {
        const item = stepOrder.make(seed, level, 'idle-before')
        const p = givenNumbers(item)
        expect(numericKey(item)).toBe(p['schedule (CPU)'] + p['prepare (CPU)'] + p['launch (CPU)'] + p['sync (CPU)'] + p['sample (CPU)'])
        // The forward is not within a twentieth of it, so reading the forward off the ticket does not pass: the band sees to it.
        if (served(seed, level, 'idle-before')) expect(Math.abs(numericKey(item) - p['forward (GPU)']) * 20).toBeGreaterThan(numericKey(item))
      }
      if (!served(seed, 3, 'idle-before')) continue
      const item = stepOrder.make(seed, 3, 'idle-before')
      const p = givenNumbers(item)
      const cpu = p['schedule (CPU)'] + p['prepare (CPU)'] + p['launch (CPU)'] + p['sync (CPU)'] + p['sample (CPU)']
      expect(numericKey(item)).toBe(Math.round((1000 * p['forward (GPU)']) / (p['forward (GPU)'] + cpu)) / 10)
      // The share is between 15% and 85%, the band's range: drawn between a fifth and four fifths, and moved by rounding the forward to 100 µs.
      expect(numericKey(item)).toBeGreaterThanOrEqual(15)
      expect(numericKey(item)).toBeLessThanOrEqual(85)
    }
  })

  /** A host card whose five CPU phases are the ticket's: the launch is one graph replay, and every other cost is zero. */
  const cardOf = (p: Record<string, number>): HostCard => ({
    scheduleBaseUs: p['schedule (CPU)'],
    schedulePerSeqUs: 0,
    prepPerTokenUs: p['prepare (CPU)'],
    launchPerKernelUs: 0,
    kernelsPerLayer: 0,
    graphReplayUs: p['launch (CPU)'],
    syncUs: p['sync (CPU)'],
    samplePerSeqUs: p['sample (CPU)'],
    detokPerTokenUs: 0,
    maskPerSeqUs: 0,
    ipcUs: 0,
  })

  /** One request of one token in and fourteen out, so that the steps in the middle of the run are the steady state of one row. */
  const run = (host: HostCard) =>
    runStepLoop(
      genWorkload(1, { requests: 1, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'const', value: 14 } } }),
      { maxNumSeqs: 1, maxBatchedTokens: 2048, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', graphs: { mode: 'FULL', captureSizes: [1] }, runner: 'mrv2' },
      host,
      SMALL_CARD,
      { horizonUs: 1_000_000_000 },
    )

  test('held to the step loop: with async scheduling off the GPU idles for the five CPU phases between two forwards, whatever the forward is', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = stepOrder.make(seed, 2, 'idle-before')
      const result = run(cardOf(givenNumbers(item)))
      const steady = result.steps.slice(3, 9)
      expect(steady.length).toBeGreaterThan(3)
      for (const step of steady) expect(step.bubbleUs).toBe(numericKey(item))
    }
  })

  test('held to the step loop: the share of the clock that the GPU is busy is the forward over the forward and the CPU\'s work, on the loop\'s own forward', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const item = stepOrder.make(seed, 3, 'idle-before')
      const p = givenNumbers(item)
      const result = run(cardOf(p))
      const cpu = p['schedule (CPU)'] + p['prepare (CPU)'] + p['launch (CPU)'] + p['sync (CPU)'] + p['sample (CPU)']
      for (const step of result.steps.slice(3, 9)) {
        // The loop\'s forward is the card\'s, not the ticket\'s: the rule is the same one, a share of forward + CPU work.
        expect(step.bubbleUs).toBe(cpu)
        expect(stepModel.busyPermille({ variant: 'idle-before', schedule: p['schedule (CPU)'], prepare: p['prepare (CPU)'], launch: p['launch (CPU)'], forward: step.gpuUs, sync: p['sync (CPU)'], sample: p['sample (CPU)'] })).toBe(
          Math.round((1000 * step.gpuUs) / (step.gpuUs + step.bubbleUs)),
        )
      }
    }
  })

  test('the diagnoses name the forward added, the forward alone, the phases before it, the phases after it and the schedule alone', () => {
    const item = stepOrder.make(SEEDS[1], 2, 'idle-before')
    const p = givenNumbers(item)
    const cpu = numericKey(item)
    const diagnose = (value: number): string | undefined => {
      const graded = stepOrder.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    expect(diagnose(cpu)).toBe('right')
    expect(diagnose(cpu + p['forward (GPU)'])).toBe('tr2.step-order.forward-added')
    expect(diagnose(p['forward (GPU)'])).toBe('tr2.step-order.forward-as-gap')
    expect(diagnose(p['schedule (CPU)'] + p['prepare (CPU)'] + p['launch (CPU)'])).toBe('tr2.step-order.before-only')
    expect(diagnose(p['sync (CPU)'] + p['sample (CPU)'])).toBe('tr2.step-order.after-only')
    expect(diagnose(p['schedule (CPU)'])).toBe('tr2.step-order.schedule-only')
    const share = stepOrder.make(SEEDS[1], 3, 'idle-before')
    const busy = numericKey(share)
    const gradeShare = (value: number): string | undefined => {
      const graded = stepOrder.grade(share, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    expect(gradeShare(busy)).toBe('right')
    expect(gradeShare(100 - busy)).toBe('tr2.step-order.idle-share')
  })

  test('is spread: no number, taken to the 2% that grades it, passes more than a tenth of the seeds, so a constant does not pass', () => {
    for (const level of [0, 2, 3] as const) {
      // A bin as wide as the tolerance: 2% of a key of about 2,000 µs is 40 µs, and of a key of about 50 is one point.
      const width = level === 3 ? 1 : 40
      const counts = new Map<number, number>()
      for (const seed of fixedSeeds(1000, 0xd1e + level)) {
        if (!served(seed, level, 'idle-before')) continue
        const key = numericKey(stepOrder.make(seed, level, 'idle-before'))
        counts.set(Math.round(key / width), (counts.get(Math.round(key / width)) ?? 0) + 1)
      }
      expect(Math.max(...counts.values())).toBeLessThan(100)
    }
  })
})
