/*
 * W1b-T03: `tr1.step-budget`, the exit item of TR1's second lesson and one item of its fifth. The tests hold the family's two schedulers to what
 * they model: nano-vllm's `Scheduler.schedule`, ported line by line from the pinned source, and vLLM's, which the sim's step loop runs. They
 * check each key against the numbers that the ticket prints, and that no key is a number printed on the ticket, which reading it off would pass.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { familiesForKc, familyById, fixedSeeds, FAMILIES, LEVELS, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { afterStep, drawScene, nanoStep, plan, shapeOf, stepBudget, vllmStep } from '@es/play/items/families/tr1/step-budget'
import type { Engine, Queue, Scene, Shape } from '@es/play/items/families/tr1/step-budget'
import { runStepLoop, TICK_CARD } from '@es/sim/steploop'
import type { StepLoopConfig } from '@es/sim/steploop'
import type { Workload } from '@es/sim/workload'
import { rngFor } from '@es/sim/core'
import { nanoStepTokens, vllmStepTokens } from '../content/tr1-demos.ts'
import { claim, correctId, expectWellMade, givenNumber, KC_IDS, shares, sourceFile } from './items-tr1-support.ts'

setDefaultTimeout(60_000)

const SEEDS = fixedSeeds(400, 0x71a4)

/** The scene that a ticket prints: the running requests, the waiting prompts in order, and the budget. */
function sceneOf(item: Item): Scene {
  const labels = ['first', 'second', 'third', 'fourth'] as const
  const waiting = labels.flatMap((label) => (item.givens.some((given) => given.label === `${label} waiting prompt`) ? [givenNumber(item, `${label} waiting prompt`)] : []))
  return { engine: item.params.engine as Engine, queue: { decoders: givenNumber(item, 'running requests, each decoding'), waiting }, budget: givenNumber(item, 'token budget of a step') }
}

describe('the family', () => {
  test('is registered, names a KC of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr1.step-budget')).toBe(stepBudget)
    expect(FAMILIES).toContain(stepBudget)
    expect(familiesForKc('tr1.phases-vs-one-budget')).toEqual([stepBudget])
    for (const kc of stepBudget.kcs) expect(KC_IDS.has(kc)).toBe(true)
    expect(offeredAt(stepBudget, 0).map((variant) => variant.id)).toEqual(['step', 'holds'])
    expect(offeredAt(stepBudget, 1).map((variant) => variant.id)).toEqual(['step', 'holds'])
    expect(offeredAt(stepBudget, 2).map((variant) => variant.id)).toEqual(['step', 'holds', 'left'])
    expect(offeredAt(stepBudget, 3).map((variant) => variant.id)).toEqual(['step', 'left'])
  })

  test('rests on claims that say what each scheduler does', () => {
    expect(claim('nano-vllm.step-shape').text).toContain('all prefill or all decode')
    expect(claim('nano-vllm.chunked-prefill-first-only').text).toContain('only for the first sequence')
    expect(claim('nano-vllm.prefill-complete-to-running').text).toContain('completes its prompt')
    expect(claim('nano-vllm.partial-chunk-no-token').text).toContain('not yet complete')
    expect(claim('vllm.scheduler.no-phases').text).toContain('no prefill phase and no decode phase')
    expect(claim('vllm.scheduler.order').text).toContain('running requests first')
    expect(claim('vllm.scheduler.chunked-prefill-default').text).toContain('on by default')
    expect(claim('vllm.scheduler.chunk-to-budget').text).toContain('the smaller of the tokens the request still needs and the token budget')
    expect(claim('vllm.scheduler.long-prefill-threshold-default').text).toContain('no cap')
  })
})

describe('every item', () => {
  test('is deterministic, well formed and graded as the key says, at every level, with no bare number in a sentence', () => {
    expectWellMade(stepBudget, SEEDS)
  })
})

describe('nano-vllm\'s scheduler, against the source\'s own', () => {
  /** A sequence of nano-vllm's, with the fields that `Scheduler.schedule` and `postprocess` read. */
  interface Seq {
    numTokens: number
    numCached: number
    numScheduled: number
  }

  /** `Scheduler.schedule` at bb823b3 (nanovllm/engine/scheduler.py, lines 25 to 73), with the block manager reduced to room for everything and nothing cached. */
  function schedule(waiting: Seq[], running: Seq[], maxNumSeqs: number, maxBatched: number): { seqs: Seq[]; isPrefill: boolean } {
    const scheduled: Seq[] = []
    let numBatched = 0
    // prefill
    while (waiting.length > 0 && scheduled.length < maxNumSeqs) {
      const seq = waiting[0]
      const remaining = maxBatched - numBatched
      if (remaining === 0) break
      const numTokens = seq.numTokens - seq.numCached
      if (remaining < numTokens && scheduled.length > 0) break // only allow chunked prefill for the first seq
      seq.numScheduled = Math.min(numTokens, remaining)
      numBatched += seq.numScheduled
      if (seq.numCached + seq.numScheduled === seq.numTokens) {
        waiting.shift()
        running.push(seq)
      }
      scheduled.push(seq)
    }
    if (scheduled.length > 0) return { seqs: scheduled, isPrefill: true }
    // decode
    while (running.length > 0 && scheduled.length < maxNumSeqs) {
      const seq = running.shift() as Seq
      seq.numScheduled = 1
      scheduled.push(seq)
    }
    running.unshift(...scheduled)
    return { seqs: scheduled, isPrefill: false }
  }

  /** `Scheduler.postprocess`: the scheduled tokens are cached now, and a sequence whose prompt is complete takes the token that was sampled. */
  function postprocess(seqs: Seq[], isPrefill: boolean): void {
    for (const seq of seqs) {
      seq.numCached += seq.numScheduled
      seq.numScheduled = 0
      if (isPrefill && seq.numCached < seq.numTokens) continue
      seq.numTokens += 1
    }
  }

  test('runs the tokens that the port of Scheduler.schedule runs, on random queues, step after step', () => {
    const rng = rngFor(0x7a, 'tr1/step-budget/nano')
    const next = (least: number, most: number): number => least + (rng() % (most - least + 1))
    let steps = 0
    for (let trial = 0; trial < 300; trial += 1) {
      const decoders = next(0, 12)
      const prompts = Array.from({ length: next(0, 5) }, () => next(1, 2500))
      const budget = next(64, 3000)
      const running: Seq[] = Array.from({ length: decoders }, () => ({ numTokens: 50, numCached: 49, numScheduled: 0 }))
      const waiting: Seq[] = prompts.map((need) => ({ numTokens: need, numCached: 0, numScheduled: 0 }))
      let queue: Queue = { decoders, waiting: prompts }
      for (let step = 0; step < 4; step += 1) {
        const run = nanoStep(queue, budget)
        const ported = schedule(waiting, running, 512, budget)
        const portedTokens = ported.seqs.reduce((sum, seq) => sum + seq.numScheduled, 0)
        expect(run.tokens).toBe(portedTokens)
        expect(run.decoders > 0).toBe(!ported.isPrefill && ported.seqs.length > 0)
        expect(run.prompts.length > 0).toBe(ported.isPrefill)
        postprocess(ported.seqs, ported.isPrefill)
        queue = afterStep(queue, run)
        // The queue the model keeps is the one the port keeps: the waiting prompts' tokens still to compute, and how many sequences decode.
        expect(queue.waiting).toEqual(waiting.map((seq) => seq.numTokens - seq.numCached))
        expect(queue.decoders).toBe(running.length)
        steps += 1
      }
    }
    expect(steps).toBe(1200)
  })

  test('is the lesson\'s arithmetic: two decoders and a prompt of 300 tokens run 300 tokens in nano-vllm and 302 in vLLM', () => {
    expect(nanoStep({ decoders: 2, waiting: [300] }, 4096).tokens).toBe(nanoStepTokens(2, 300))
    expect(vllmStep({ decoders: 2, waiting: [300] }, 4096).tokens).toBe(vllmStepTokens(2, 300))
    expect(nanoStep({ decoders: 2, waiting: [300] }, 4096).tokens).toBe(300)
    expect(vllmStep({ decoders: 2, waiting: [300] }, 4096).tokens).toBe(302)
    expect(nanoStep({ decoders: 3, waiting: [] }, 4096).tokens).toBe(nanoStepTokens(3, 0))
  })

  const nano = sourceFile('nano-vllm', 'bb823b3e06983d71485a8e1f23715ebd87d98ef8', 'nanovllm/engine/scheduler.py')
  test.skipIf(nano === null)('rests on the lines of the pinned source that the port transcribes', () => {
    const lines = (nano ?? '').split('\n')
    const at = (line: number): string => lines[line - 1].trim()
    expect(at(33)).toBe('if remaining == 0:')
    expect(at(39)).toBe('num_tokens = seq.num_tokens - num_cached_blocks * self.block_size')
    expect(at(42)).toBe('if remaining < num_tokens and scheduled_seqs:  # only allow chunked prefill for the first seq')
    expect(at(46)).toBe('seq.num_scheduled_tokens = min(num_tokens, remaining)')
    expect(at(48)).toBe('if seq.num_cached_tokens + seq.num_scheduled_tokens == seq.num_tokens:')
    expect(at(54)).toBe('if scheduled_seqs:')
    expect(at(55)).toBe('return scheduled_seqs, True')
    expect(at(67)).toBe('seq.num_scheduled_tokens = 1')
    expect(at(86)).toBe('if is_prefill and seq.num_cached_tokens < seq.num_tokens:')
  })
})

describe('vLLM\'s scheduler, against the step loop of the sim', () => {
  /** Requests that are decoding and prompts that arrive after the first step has been scheduled, run by the sim's step loop with async scheduling off. */
  function tokensOfSteps(scene: Scene): number[] {
    const request = (id: number, dueUs: number, promptTokens: number) => ({ id, dueUs, promptTokens, outputTokens: 1000, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false })
    const reqs = [
      ...Array.from({ length: scene.queue.decoders }, (_, at) => request(at, 0, 1)),
      ...scene.queue.waiting.map((need, at) => request(scene.queue.decoders + at, 1, need)),
    ]
    const workload: Workload = { seed: 1, origin: { kind: 'synthetic' }, reqs }
    const config: StepLoopConfig = { maxNumSeqs: 512, maxBatchedTokens: scene.budget, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] } }
    return runStepLoop(workload, config, TICK_CARD, TICK_CARD, { horizonUs: 1_000_000_000 }).steps.map((step) => step.tokens)
  }

  test('runs the tokens that the loop runs in the next step and the one after it, for scenes of both shapes that vLLM has', () => {
    let checked = 0
    for (const shape of ['vllm-all', 'vllm-cut'] as const) {
      for (const seed of SEEDS.slice(0, 60)) {
        const scene = drawScene(shape, rngFor(seed, `tr1/step-budget/${shape}`))
        const ran = tokensOfSteps(scene)
        // The first step of the loop is the decoders' own prompts, one token each. The next two steps are the ones the family prices.
        expect(ran[0]).toBe(scene.queue.decoders)
        const { runs } = plan('vllm', scene.queue, scene.budget, 2)
        expect([shape, seed, ran[1]]).toEqual([shape, seed, runs[0].tokens])
        expect([shape, seed, ran[2]]).toEqual([shape, seed, runs[1].tokens])
        checked += 1
      }
    }
    expect(checked).toBe(120)
  })

  test('serves the running requests first, one token each, then the waiting prompts, each the smaller of what it needs and what is left', () => {
    expect(vllmStep({ decoders: 4, waiting: [1000, 300] }, 512)).toEqual({ decoders: 4, prompts: [508], tokens: 512 })
    expect(vllmStep({ decoders: 4, waiting: [100, 300] }, 512)).toEqual({ decoders: 4, prompts: [100, 300], tokens: 404 })
    expect(vllmStep({ decoders: 4, waiting: [] }, 512)).toEqual({ decoders: 4, prompts: [], tokens: 4 })
    // A cut prompt stays at the front with what is left, and a prompt that is done now decodes.
    expect(afterStep({ decoders: 4, waiting: [1000, 300] }, { decoders: 4, prompts: [508], tokens: 512 })).toEqual({ decoders: 4, waiting: [492, 300] })
    expect(afterStep({ decoders: 4, waiting: [100, 300] }, { decoders: 4, prompts: [100, 300], tokens: 404 })).toEqual({ decoders: 6, waiting: [] })
  })

  const vllm = sourceFile('vllm', '4ba787ec9959e566d3b587a796dff07673324da5', 'vllm/v1/core/sched/scheduler.py')
  test.skipIf(vllm === null)('rests on the lines of the pinned source that say it', () => {
    const text = vllm ?? ''
    const order = ['# First, schedule the RUNNING requests.', '# Next, schedule the WAITING requests.', 'num_new_tokens = min(num_new_tokens, request_token_budget)']
    let from = 0
    for (const line of order) {
      const at = text.indexOf(line, from)
      expect([line, at >= 0]).toEqual([line, true])
      from = at + line.length
    }
    expect(text).toContain('token_budget = self.max_num_scheduled_tokens')
  })
})

describe('step and left', () => {
  const numeric = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

  test('are the model\'s tokens for the numbers that the ticket prints, for the step asked about', () => {
    for (const level of [0, 1, 2, 3] as const) {
      for (const seed of SEEDS.slice(0, 120)) {
        const item = stepBudget.make(seed, level, 'step')
        const scene = sceneOf(item)
        const asks = level === 3 ? 2 : 1
        expect(item.params.asks).toBe(asks)
        expect(numeric(item)).toBe(plan(scene.engine, scene.queue, scene.budget, asks).runs[asks - 1].tokens)
        expect(plain(item.stem)).toContain(asks === 1 ? 'the next step run' : 'the step after the next one run')
      }
    }
    for (const level of [2, 3] as const) {
      for (const seed of SEEDS.slice(0, 120)) {
        const item = stepBudget.make(seed, level, 'left')
        const scene = sceneOf(item)
        const asks = level === 3 ? 2 : 1
        const left = plan(scene.engine, scene.queue, scene.budget, asks).last.waiting.reduce((a, b) => a + b, 0)
        expect(numeric(item)).toBe(left)
        expect(left).toBeGreaterThan(0)
      }
    }
  })

  test('are never one of the numbers printed on the ticket, which reading it off would pass, and are never nothing', () => {
    for (const level of [0, 1, 2, 3] as const) {
      for (const seed of SEEDS) {
        for (const variant of ['step', 'left'] as const) {
          if (variant === 'left' && level < 2) continue
          const item = stepBudget.make(seed, level, variant)
          const scene = sceneOf(item)
          const printed = [scene.queue.decoders, ...scene.queue.waiting, scene.budget]
          expect(printed).not.toContain(numeric(item))
          expect(numeric(item)).toBeGreaterThan(0)
        }
      }
    }
  })

  test('are nano-vllm\'s prompts alone or vLLM\'s one budget, as the engine named says, and the two engines answer a queue differently', () => {
    let differ = 0
    let both = 0
    for (const seed of SEEDS) {
      const item = stepBudget.make(seed, 2, 'step')
      const scene = sceneOf(item)
      expect(plain(item.stem)).toContain(scene.engine === 'nano-vllm' ? 'In nano-vllm' : 'In vLLM v0.33.0')
      const here = plan(scene.engine, scene.queue, scene.budget, 1).runs[0].tokens
      const there = plan(scene.engine === 'nano-vllm' ? 'vllm' : 'nano-vllm', scene.queue, scene.budget, 1).runs[0].tokens
      both += 1
      if (here !== there) differ += 1
    }
    expect(differ).toBe(both)
  })

  test('draw the shapes that the weights give, and the next step is never cut to the budget in a question about the next step', () => {
    const shapesOf = (variant: string, level: 0 | 1 | 2 | 3): Map<Shape, number> => {
      const found = new Map<Shape, number>()
      for (const seed of SEEDS) {
        const scene = sceneOf(stepBudget.make(seed, level, variant))
        found.set(shapeOf(scene), (found.get(shapeOf(scene)) ?? 0) + 1)
      }
      return found
    }
    expect([...shapesOf('step', 2).keys()].sort()).toEqual(['nano-all', 'nano-skip', 'vllm-all'])
    expect([...shapesOf('left', 2).keys()].sort()).toEqual(['nano-cut', 'nano-skip', 'vllm-cut'])
    expect([...shapesOf('step', 3).keys()].sort()).toEqual(['nano-cut', 'nano-skip', 'vllm-cut'])
  })

  test('name the mistakes that a wrong number shows: the other engine\'s answer, the budget, and a queue that did not move', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      const item = stepBudget.make(seed, 2, 'step')
      const scene = sceneOf(item)
      const other = plan(scene.engine === 'nano-vllm' ? 'vllm' : 'nano-vllm', scene.queue, scene.budget, 1).runs[0].tokens
      const graded = stepBudget.grade(item, { kind: 'numeric', value: other })
      expect(graded.ok).toBe(false)
      expect(graded.diagnosis?.id).toBe('tr1.step-budget.other-engines-rule')
      seen.add(graded.diagnosis?.id ?? '')
      // The other engine's answer comes first where it is the budget too.
      if (other !== scene.budget) expect(stepBudget.grade(item, { kind: 'numeric', value: scene.budget }).diagnosis?.id).toBe('tr1.step-budget.budget-as-step')
    }
    for (const seed of SEEDS.slice(0, 80)) {
      const item = stepBudget.make(seed, 2, 'left')
      const scene = sceneOf(item)
      const total = scene.queue.waiting.reduce((a, b) => a + b, 0)
      expect(stepBudget.grade(item, { kind: 'numeric', value: total }).diagnosis?.id).toBe('tr1.step-budget.nothing-ran')
      expect(stepBudget.grade(item, { kind: 'numeric', value: 0 }).diagnosis?.id).toBe('tr1.step-budget.all-ran')
    }
    expect(seen.size).toBe(1)
  })
})

describe('holds', () => {
  const OUTCOME: Record<Shape, string | null> = { 'nano-all': 'prompts-whole', 'nano-skip': null, 'nano-cut': 'prompt-cut', 'vllm-all': 'mixed-whole', 'vllm-cut': 'mixed-cut' }

  test('has exactly two waiting prompts, and its key is the statement the model\'s first step makes true', () => {
    for (const level of [0, 1, 2] as const) {
      for (const seed of SEEDS.slice(0, 150)) {
        const item = stepBudget.make(seed, level, 'holds')
        const scene = sceneOf(item)
        expect(scene.queue.waiting).toHaveLength(2)
        const run = plan(scene.engine, scene.queue, scene.budget, 1).runs[0]
        const key = correctId(item)
        expect(key).toBe(OUTCOME[shapeOf(scene)])
        // The statement itself: who gets a token, and what the prompts do.
        expect(key.startsWith('mixed')).toBe(run.decoders > 0)
        const cut = run.prompts.some((took, at) => took < scene.queue.waiting[at])
        expect(key.endsWith('cut')).toBe(cut)
      }
    }
  })

  test('is drawn answer first: each of the four statements is the key on a quarter of the seeds', () => {
    const share = shares(stepBudget, 2, 'holds', correctId)
    expect([...share.keys()].sort()).toEqual(['mixed-cut', 'mixed-whole', 'prompt-cut', 'prompts-whole'])
    for (const [id, rate] of share) expect([id, rate > 0.2 && rate < 0.3]).toEqual([id, true])
  })

  test('explains a wrong statement by the engine\'s own rule', () => {
    for (const seed of SEEDS.slice(0, 100)) {
      const item = stepBudget.make(seed, 2, 'holds')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const nano = item.params.engine === 'nano-vllm'
      for (const option of item.answer.options) {
        if (option.id === item.answer.correct) continue
        const why = plain(option.why)
        const mixes = option.id.startsWith('mixed')
        if (nano && mixes) expect(why).toContain('nano-vllm does not mix')
        if (!nano && !mixes) expect(why).toContain('vLLM serves the running requests first')
        expect(option.miss).toBe(`tr1.step-budget.${option.id}-for-${item.answer.correct}`)
      }
    }
  })
})

describe('levels', () => {
  test('give a worked example at level 0, the first step at level 1 (the rule, not the answer), and nothing at levels 2 and 3', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const variant of ['step', 'holds'] as const) {
        expect(stepBudget.make(seed, 0, variant).worked.length).toBeGreaterThanOrEqual(2)
        const first = stepBudget.make(seed, 1, variant)
        expect(first.worked).toHaveLength(1)
        expect(plain(first.worked[0].text)).toMatch(/scheduler/)
        expect(first.worked[0].result).toBeUndefined()
      }
      expect(stepBudget.make(seed, 2, 'step').worked).toHaveLength(0)
      expect(stepBudget.make(seed, 3, 'step').worked).toHaveLength(0)
    }
    expect(LEVELS).toEqual([0, 1, 2, 3])
  })

  test('end the solution of a number in the key, as a result, and in no earlier step', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const [level, variant] of [[2, 'step'], [3, 'step'], [2, 'left'], [3, 'left']] as const) {
        const item = stepBudget.make(seed, level, variant)
        const steps = stepBudget.solution(item)
        const withResult = steps.flatMap((step, at) => (step.result === undefined ? [] : [at]))
        expect(withResult).toEqual([steps.length - 1])
        expect(steps.at(-1)?.result?.value).toBe(item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)
      }
    }
  })
})
