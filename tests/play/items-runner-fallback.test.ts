/*
 * W1b-T04: `tr2.runner-fallback`. The tests hold the family's rule to the claims it cites and to a second statement of the pinned code's order of
 * checks, hold the speculative methods to the sim's `resolveRunner`, hold `phase` to the sim's host presets, hold `saves` to the step loop run with
 * each runner's host card, and hold the family to the framework's own rules (the checks of `commonSuite`).
 */
import { describe, expect, test } from 'bun:test'
import { fixedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { CHANGES, outcomeOf, OUTCOMES, PHASE_IDS, runnerFallback, runnerOf, savesModel, SIM_METHODS, unsupported } from '@es/play/items/families/tr2/runner-fallback'
import type { Config, Env, Spec } from '@es/play/items/families/tr2/runner-fallback'
import { HOST_PRESETS } from '@es/sim/host'
import type { HostCard } from '@es/sim/host'
import { resolveRunner, runStepLoop, SMALL_CARD, TICK_CARD } from '@es/sim/steploop'
import type { SpecMethodId } from '@es/sim/steploop'
import { genWorkload } from '@es/sim/workload'
import { claim, commonSuite, givenNumbers } from './items-tr2-support.ts'

commonSuite(runnerFallback, 0x7f10)

const SEEDS = fixedSeeds(400, 0x7f1)

const numericKey = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

describe('the rule rests on the claims', () => {
  test('the variable decides when it is set, the checks run when it is not, and five things are on the list', () => {
    const env = claim('vllm.mrv2.env-decides').text
    expect(env).toContain('when VLLM_USE_V2_MODEL_RUNNER is set, in either direction, its value decides the runner and the checks for Triton and for unsupported features are skipped')
    expect(env).toContain('Unset, MRV2 is used unless Triton is missing or the configuration uses a feature MRV2 does not support, and then the engine warns and uses V1')
    const rule = claim('vllm.mrv2.default-rule').text
    expect(rule).toContain('falls back to MRV1 and logs one warning')
    expect(claim('vllm.mrv2.default-rule').source?.quote).toBe('Model Runner V2 does not yet support %s; using the V1 model')
    const five = claim('vllm.mrv2.fallback-reasons')
    expect(five.value).toBe(5)
    for (const reason of ['pipeline parallelism with the external_launcher backend', 'the speculative methods suffix and custom_class', 'parallel drafting for EAGLE', 'draft models with their own vocabulary', 'dual-batch overlap']) {
      expect(five.text).toContain(reason)
    }
  })

  test('the speculative methods that send a configuration back are the sim\'s: suffix and custom_class, and no other', () => {
    for (const method of SIM_METHODS) {
      const sim = resolveRunner('mrv2', method as SpecMethodId)
      const mine = outcomeOf({ env: 'unset', triton: true, spec: method === 'draft_model' ? 'draft-same' : (method as Spec), pp: 0 })
      expect([method, runnerOf(mine)]).toEqual([method, sim === 'v1' ? 'v1' : 'mrv2'])
    }
  })

  test('the pinned code\'s order: the variable first, then Triton, then the list; Triton is checked before the list, and a missing Triton alone is the warning', () => {
    const base: Config = { env: 'unset', triton: true, spec: 'none', pp: 0 }
    expect(outcomeOf(base)).toBe('default')
    expect(outcomeOf({ ...base, triton: false })).toBe('fallback')
    expect(outcomeOf({ ...base, spec: 'suffix' })).toBe('fallback')
    expect(outcomeOf({ ...base, env: '0' })).toBe('chosen')
    expect(outcomeOf({ ...base, env: '1' })).toBe('default')
    expect(outcomeOf({ ...base, env: '1', spec: 'suffix' })).toBe('forced')
    expect(outcomeOf({ ...base, env: '1', triton: false })).toBe('forced')
    expect(outcomeOf({ ...base, env: '0', spec: 'suffix', triton: false })).toBe('chosen')
    // The reasons, in the order the pinned code collects them.
    expect(unsupported({ env: 'unset', triton: true, spec: 'custom_class', pp: 2 })).toEqual(['pipeline parallelism with external_launcher', "speculative method 'custom_class'"])
    expect(unsupported({ env: 'unset', triton: true, spec: 'eagle3-parallel', pp: 0 })).toEqual(['parallel drafting for EAGLE speculative decoding'])
    expect(unsupported({ env: 'unset', triton: true, spec: 'draft-own', pp: 0 })).toEqual(['heterogeneous-vocabulary draft models'])
    expect(unsupported({ env: 'unset', triton: true, spec: 'mtp', pp: 0 })).toEqual([])
  })
})

/** What a ticket prints of one run, as a configuration. `prefix` is a run's: `first run: `. */
function configOf(item: Item, prefix = ''): Config | null {
  const by = new Map(item.givens.map((given) => [given.label, given.value]))
  const env = by.get(`${prefix}VLLM_USE_V2_MODEL_RUNNER`)
  if (env === undefined || env.t !== 'code') return null
  const triton = by.get(`${prefix}Triton`)
  const method = by.get(`${prefix}speculative method`)
  const name = method?.t === 'code' ? method.code : 'none'
  const vocabulary = by.get(`${prefix}vocabulary of the draft model`)
  const parallel = by.get(`${prefix}parallel drafting`)
  const size = by.get(`${prefix}pipeline parallel size`)
  let spec: Spec = 'none'
  if (name === 'draft_model') spec = vocabulary?.t === 'text' && vocabulary.text === 'its own' ? 'draft-own' : 'draft-same'
  else if (name === 'eagle3') spec = parallel?.t === 'text' && parallel.text === 'on' ? 'eagle3-parallel' : 'eagle3'
  else if (name !== 'none') spec = name as Spec
  return { env: env.code as Env, triton: triton?.t === 'text' && triton.text === 'installed', spec, pp: size?.t === 'num' ? size.value : 0 }
}

/** The pinned code's rule, written again from the claims' texts: what the test holds the family's key to. */
function runnerByRule(config: Config): { runner: 'mrv2' | 'v1'; warns: boolean } {
  if (config.env === '1') return { runner: 'mrv2', warns: false }
  if (config.env === '0') return { runner: 'v1', warns: false }
  if (!config.triton) return { runner: 'v1', warns: true }
  const blocked =
    config.pp > 1 || config.spec === 'suffix' || config.spec === 'custom_class' || config.spec === 'eagle3-parallel' || config.spec === 'draft-own'
  return blocked ? { runner: 'v1', warns: true } : { runner: 'mrv2', warns: false }
}

describe('which-runner: the key is the rule applied to what the ticket prints', () => {
  test('one run, at levels 0 to 2: the runner, and whether the log has a warning', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2] as const) {
        const item = runnerFallback.make(seed, level, 'which-runner')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const config = configOf(item)
        if (config === null) throw new Error('a configuration')
        const rule = runnerByRule(config)
        const outcome = item.answer.correct as (typeof OUTCOMES)[number]
        expect(runnerOf(outcome)).toBe(rule.runner)
        expect(outcome === 'fallback').toBe(rule.warns)
        expect(outcome).toBe(outcomeOf(config))
        seen.add(outcome)
        // The options are the four outcomes, each once.
        expect(item.answer.options.map((option) => option.id).sort()).toEqual([...OUTCOMES].sort())
      }
    }
    expect([...seen].sort()).toEqual([...OUTCOMES].sort())
  })

  test('two runs, at level 3: MRV2 serves the first, the second, both or neither', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = runnerFallback.make(seed, 3, 'which-runner')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const first = configOf(item, 'first run: ')
      const second = configOf(item, 'second run: ')
      if (first === null || second === null) throw new Error('two configurations')
      const served = [runnerByRule(first).runner === 'mrv2', runnerByRule(second).runner === 'mrv2']
      const expected = served[0] && served[1] ? 'both' : served[0] ? 'first' : served[1] ? 'second' : 'neither'
      expect(item.answer.correct).toBe(expected)
      seen.add(expected)
    }
    expect([...seen].sort()).toEqual(['both', 'first', 'neither', 'second'])
  })

  test('is drawn answer first: each outcome is the key on about a quarter of the seeds, at every level', () => {
    for (const level of [2, 3] as const) {
      const counts = new Map<string, number>()
      for (const seed of fixedSeeds(1200, 0xa11 + level)) {
        const item = runnerFallback.make(seed, level, 'which-runner')
        if (item.answer.kind === 'choice') counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
      }
      expect(counts.size).toBe(4)
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(300 * 0.8)
        expect(count).toBeLessThan(300 * 1.2)
      }
    }
  })

  test('the traps are there: every blocker, every decoy, a missing Triton, a set variable over a blocker, and the variable at 0 with nothing to block', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = runnerFallback.make(seed, 2, 'which-runner')
      const config = configOf(item)
      if (config === null) continue
      seen.add(`spec:${config.spec}`)
      if (!config.triton) seen.add('no-triton')
      if (config.pp > 1) seen.add('pp')
      if (config.env === '1' && (unsupported(config).length > 0 || !config.triton)) seen.add('forced-over-blocker')
      if (config.env === '0' && unsupported(config).length === 0 && config.triton) seen.add('chosen-alone')
      if (config.env === '0' && (unsupported(config).length > 0 || !config.triton)) seen.add('chosen-over-blocker')
    }
    for (const spec of ['none', 'ngram', 'eagle3', 'mtp', 'draft-same', 'suffix', 'custom_class', 'eagle3-parallel', 'draft-own']) expect(seen.has(`spec:${spec}`)).toBe(true)
    for (const trap of ['no-triton', 'pp', 'forced-over-blocker', 'chosen-alone', 'chosen-over-blocker']) expect(seen.has(trap)).toBe(true)
  })

  test('the reason of a fallback is named in the words of the log, and a lure is wrong for a reason the ticket shows', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const item = runnerFallback.make(seed, 2, 'which-runner')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const config = configOf(item)
      if (config === null) throw new Error('a configuration')
      const words = runnerFallback.solution(item).map((step) => plain(step.text)).join(' ')
      if (item.answer.correct === 'fallback') {
        if (!config.triton) expect(words).toContain('Model Runner V2 requires Triton; using the V1 model runner instead.')
        else expect(words).toContain(unsupported(config).join(', '))
      }
      if (item.answer.correct === 'forced') expect(words).toContain('which would have sent an engine with the variable unset back to MRV1')
      for (const option of item.answer.options) {
        if (option.id === item.answer.correct) continue
        expect(option.miss).toBe(`tr2.runner-fallback.${option.id}-taken-for`)
        expect(plain(option.why).length).toBeGreaterThan(40)
      }
    }
  })
})

describe('phase: the model\'s mapping, held to the sim\'s host presets', () => {
  test('MRV2\'s preset differs from V1\'s in prepare, sync and sample, and in no other field', () => {
    const v1 = HOST_PRESETS.v1.card
    const v2 = HOST_PRESETS.mrv2.card
    const differing = (Object.keys(v1) as (keyof HostCard)[]).filter((field) => v1[field] !== v2[field]).sort()
    expect(differing).toEqual(['prepPerTokenUs', 'samplePerSeqUs', 'syncUs'])
    expect(PHASE_IDS).toEqual(['prepare', 'sync', 'sample'])
    // The numbers the solution prints are the presets', and they are [estimated].
    expect([v1.prepPerTokenUs, v2.prepPerTokenUs, v1.syncUs, v2.syncUs, v1.samplePerSeqUs, v2.samplePerSeqUs]).toEqual([8, 2, 60, 20, 31, 15])
    expect(HOST_PRESETS.mrv2.tag).toBe('estimated')
  })

  test('each change rests on a claim, and belongs to the phase the lesson maps it to', () => {
    const CLAIM_OF: Record<string, [string, string]> = {
      rows: ['vllm.mrv2.decoupled-state', 'keeps its persistent state tensors apart from the per-step input tensors'],
      'block-tables': ['vllm.mrv2.staged-write', 'stages the differences on the CPU'],
      'gpu-inputs': ['vllm.mrv2.gpu-input-prep', 'with Triton kernels on the GPU'],
      'no-sync': ['vllm.mrv2.no-cpu-sync', 'no CPU synchronization points'],
      sampler: ['vllm.mrv2.triton-sampler', 'mostly in Triton'],
    }
    expect(CHANGES.map((change) => change.id).sort()).toEqual(Object.keys(CLAIM_OF).sort())
    expect(claim('vllm.mrv2.persistent-rows').text).toContain('one fixed table with max_num_reqs rows')
    for (const change of CHANGES) {
      const [id, fact] = CLAIM_OF[change.id]
      expect([change.id, claim(id).text.includes(fact)]).toEqual([change.id, true])
      expect(claim(id).pin).toBe('vllm')
    }
    expect(CHANGES.filter((change) => change.phase === 'prepare').map((change) => change.id)).toEqual(['rows', 'block-tables', 'gpu-inputs'])
    expect(CHANGES.filter((change) => change.phase === 'sync').map((change) => change.id)).toEqual(['no-sync'])
    expect(CHANGES.filter((change) => change.phase === 'sample').map((change) => change.id)).toEqual(['sampler'])
  })

  test('the key is the phase of the change, drawn answer first over the three phases', () => {
    const counts = new Map<string, number>()
    for (const seed of fixedSeeds(1200, 0xcafe)) {
      const item = runnerFallback.make(seed, 2, 'phase')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const change = CHANGES.find((candidate) => plain(item.stem).endsWith(plain(candidate.text)))
      expect(change).toBeDefined()
      expect(item.answer.correct).toBe(change?.phase)
      counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual(['prepare', 'sample', 'sync'])
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(400 * 0.8)
      expect(count).toBeLessThan(400 * 1.2)
    }
  })

  test('at level 3 the phase is named and the options are three changes, one from each phase, the right one among them', () => {
    for (const seed of SEEDS.slice(0, 150)) {
      const item = runnerFallback.make(seed, 3, 'phase')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const phases = item.answer.options.map((option) => CHANGES.find((change) => change.id === option.id)?.phase)
      expect([...phases].sort()).toEqual(['prepare', 'sample', 'sync'])
      const asked = plain(item.stem).replace(/^.*shortens /, '').replace('?', '')
      const { correct } = item.answer
      expect(CHANGES.find((change) => change.id === correct)?.phase).toBe(asked)
    }
  })
})

describe('saves: what MRV2 takes off, held to the step loop run with each runner\'s card', () => {
  const printedCosts = (item: Item) => {
    const p = givenNumbers(item)
    return {
      rows: p['rows in the step'],
      v1: { prepare: p['V1: prepare, for each token'], sync: p['V1: sync'], sample: p['V1: sample, for each row'] },
      v2: { prepare: p['MRV2: prepare, for each token'], sync: p['MRV2: sync'], sample: p['MRV2: sample, for each row'] },
      shared: p['schedule and launch, on either runner'] ?? 0,
      forward: p['forward (GPU)'] ?? 0,
    }
  }

  test('the key is the saving per row and once, at levels 0 to 2', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2] as const) {
        const item = runnerFallback.make(seed, level, 'saves')
        const c = printedCosts(item)
        expect(numericKey(item)).toBe(c.rows * (c.v1.prepare - c.v2.prepare) + (c.v1.sync - c.v2.sync) + c.rows * (c.v1.sample - c.v2.sample))
        expect(numericKey(item)).toBe(savesModel.saved(c.v1, c.v2, c.rows))
      }
    }
  })

  const hostOf = (costs: { prepare: number; sync: number; sample: number }, shared: number): HostCard => ({
    scheduleBaseUs: shared,
    schedulePerSeqUs: 0,
    prepPerTokenUs: costs.prepare,
    launchPerKernelUs: 0,
    kernelsPerLayer: 0,
    graphReplayUs: 0,
    syncUs: costs.sync,
    samplePerSeqUs: costs.sample,
    detokPerTokenUs: 0,
    maskPerSeqUs: 0,
    ipcUs: 0,
  })

  /** `rows` requests of one prompt token and many tokens out, so that the steps in the middle of the run are a decode of `rows` rows. */
  const run = (host: HostCard, rows: number, asyncScheduling: boolean, forward: number | null) =>
    runStepLoop(
      genWorkload(1, { requests: rows, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'const', value: 30 } } }),
      { maxNumSeqs: rows, maxBatchedTokens: 4096, chunkedPrefill: true, asyncScheduling, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] } },
      host,
      forward === null ? SMALL_CARD : { ...TICK_CARD, forwardUs: forward, admitUs: 0 },
      { horizonUs: 1_000_000_000 },
    )

  test('held to the step loop: with async scheduling off the GPU idles for the CPU\'s work, and the two runners\' idle times differ by the key', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const item = runnerFallback.make(seed, 2, 'saves')
      const c = printedCosts(item)
      const idle = (costs: typeof c.v1): number => {
        const result = run(hostOf(costs, 200), c.rows, false, null)
        const steady = result.steps.slice(4, 10)
        expect(steady.every((step) => step.seqs === c.rows)).toBe(true)
        expect(new Set(steady.map((step) => step.bubbleUs)).size).toBe(1)
        return steady[0].bubbleUs
      }
      expect(idle(c.v1) - idle(c.v2)).toBe(numericKey(item))
    }
  })

  test('at level 3 the key is the difference of the idle times: the work less the forward on each runner, and nothing where the forward is the longer', () => {
    const regimes = new Set<string>()
    for (const seed of SEEDS) {
      const item = runnerFallback.make(seed, 3, 'saves')
      const c = printedCosts(item)
      const cpu = (costs: typeof c.v1): number => c.shared + c.rows * costs.prepare + costs.sync + c.rows * costs.sample
      const idle1 = Math.max(0, cpu(c.v1) - c.forward)
      const idle2 = Math.max(0, cpu(c.v2) - c.forward)
      expect(numericKey(item)).toBe(idle1 - idle2)
      const saved = savesModel.saved(c.v1, c.v2, c.rows)
      regimes.add(numericKey(item) === 0 ? 'hidden' : numericKey(item) === saved ? 'whole' : 'cut')
    }
    expect([...regimes].sort()).toEqual(['cut', 'hidden', 'whole'])
  })

  test('held to the step loop: with async scheduling on, the idle times are the work less the forward, and their difference is the key', () => {
    let checked = 0
    for (const seed of SEEDS) {
      const item = runnerFallback.make(seed, 3, 'saves')
      if (!runnerFallback.band(seed, 3) || runnerFallback.make(seed, 3).variant !== 'saves' || checked >= 25) continue
      const c = printedCosts(item)
      const idle = (costs: typeof c.v1): number => {
        const result = run(hostOf(costs, c.shared), c.rows, true, c.forward)
        const steady = result.steps.slice(5, 11)
        expect(steady.every((step) => step.seqs === c.rows)).toBe(true)
        return steady[0].bubbleUs
      }
      expect(idle(c.v1) - idle(c.v2)).toBe(numericKey(item))
      checked += 1
    }
    expect(checked).toBe(25)
  })

  test('the diagnoses name one row counted, the sync left out, the cost taken for the saving, and a saving that the forward cut', () => {
    // A scene where the cost on MRV2 is not within the 2% of the saving, so that the one number cannot be both.
    let item = runnerFallback.make(SEEDS[3], 2, 'saves')
    for (const seed of SEEDS) {
      const candidate = runnerFallback.make(seed, 2, 'saves')
      const p = printedCosts(candidate)
      if (Math.abs(p.rows * p.v2.prepare + p.v2.sync + p.rows * p.v2.sample - numericKey(candidate)) > 0.05 * numericKey(candidate)) {
        item = candidate
        break
      }
    }
    const c = printedCosts(item)
    const diagnose = (target: Item, value: number): string | undefined => {
      const graded = runnerFallback.grade(target, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    expect(diagnose(item, numericKey(item))).toBe('right')
    expect(diagnose(item, c.v1.prepare - c.v2.prepare + (c.v1.sync - c.v2.sync) + (c.v1.sample - c.v2.sample))).toBe('tr2.runner-fallback.one-row')
    expect(diagnose(item, c.rows * (c.v1.prepare - c.v2.prepare) + c.rows * (c.v1.sample - c.v2.sample))).toBe('tr2.runner-fallback.sync-forgotten')
    expect(diagnose(item, c.rows * c.v2.prepare + c.v2.sync + c.rows * c.v2.sample)).toBe('tr2.runner-fallback.mrv2-cost')
    let cut: Item | null = null
    for (const seed of SEEDS) {
      const candidate = runnerFallback.make(seed, 3, 'saves')
      const p = printedCosts(candidate)
      if (numericKey(candidate) > 0 && numericKey(candidate) < savesModel.saved(p.v1, p.v2, p.rows) * 0.9) {
        cut = candidate
        break
      }
    }
    if (cut === null) throw new Error('a scene where the forward cuts the saving')
    const p = printedCosts(cut)
    expect(diagnose(cut, savesModel.saved(p.v1, p.v2, p.rows))).toBe('tr2.runner-fallback.saving-as-idle')
  })
})

describe('the levels', () => {
  test('every variant is offered at every level', () => {
    for (const level of [0, 1, 2, 3] as const) expect(offeredAt(runnerFallback, level).map((variant) => variant.id)).toEqual(['which-runner', 'phase', 'saves'])
  })
})
