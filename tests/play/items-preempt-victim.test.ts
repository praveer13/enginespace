/*
 * W1b-T04: `tr2.preempt-victim`. The tests hold the family's facts to the claims, re-derive the victim from what the ticket prints with a second
 * statement of the pinned rule (the step loop has no KV pool, so it has no preemption to hold the choice to), check that every wrong option is
 * wrong for the reason it names, hold the arithmetic of `restart` and `chunk` to the step loop, and hold the family to the framework's own rules.
 */
import { describe, expect, test } from 'bun:test'
import { fixedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { preemptModel, preemptVictim } from '@es/play/items/families/tr2/preempt-victim'
import { hostPreset } from '@es/sim/host'
import { runStepLoop, SMALL_CARD } from '@es/sim/steploop'
import type { ReqSpec, Workload } from '@es/sim/workload'
import { claim, commonSuite, givenNumbers } from './items-tr2-support.ts'

commonSuite(preemptVictim, 0x9e71)

const SEEDS = fixedSeeds(400, 0x9e7)

const numericKey = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)
const textOf = (item: Item, label: string): string => {
  const value = item.givens.find((given) => given.label === label)?.value
  return value?.t === 'text' ? value.text : ''
}

describe('the rule rests on the claims', () => {
  test('first come, first served takes the last of the running list, priority takes the largest value and then the latest arrival, and preemption is recompute only', () => {
    expect(claim('vllm.scheduler.preemption-victim').text).toContain('Under the first-come, first-served policy the victim of a preemption is the request that joined the running list last')
    expect(claim('vllm.scheduler.preemption-victim').text).toContain('Under the priority policy it is the one with the largest priority value and then the latest arrival')
    expect(claim('vllm.scheduler.preemption-victim').source?.quote).toBe('preempted_req = self.running[-1]')
    expect(claim('vllm.scheduler.preemption-lowest-priority').text).toContain('lowest-priority request')
    expect(claim('vllm.scheduler.preemption-lowest-priority').text).toContain('a larger priority value is a lower priority')
    expect(claim('vllm.scheduler.preemption-recompute').text).toContain('recompute only')
    expect(claim('vllm.scheduler.preemption-recompute').text).toContain('computed-token count goes back to 0')
    expect(claim('vllm.scheduler.policy-default').value).toBe('fcfs')
  })

  test('a returning request is scheduled for its prompt and its output, the running requests are served first, and a waiting one gets the smaller of its need and what is left', () => {
    expect(claim('vllm.scheduler.resume-tokens').text).toContain('num_tokens and not num_prompt_tokens')
    expect(claim('vllm.scheduler.resume-tokens').text).toContain('everything it generated')
    expect(claim('vllm.scheduler.no-phases').text).toContain('every request catches up')
    expect(claim('vllm.scheduler.order').value).toBe('running first, then waiting')
    expect(claim('vllm.scheduler.chunk-to-budget').text).toContain('the smaller of the tokens the request still needs and the token budget that is left')
    expect(claim('vllm.scheduler.spec-drafts').text).toContain('1 plus its drafts for a request in decode')
    expect(claim('vllm.scheduler.chunked-prefill-default').value).toBe('true')
  })

  test('the model is the pinned code\'s: the maximum by priority and then arrival, or the last of the list', () => {
    const running = [
      { name: 'A', blocks: 1, arrived: 5, priority: 3 },
      { name: 'B', blocks: 2, arrived: 9, priority: 3 },
      { name: 'C', blocks: 3, arrived: 1, priority: 1 },
    ]
    expect(preemptModel.victim('fcfs', running).name).toBe('C')
    expect(preemptModel.victim('priority', running).name).toBe('B')
    expect(preemptModel.victim('priority', [running[1], running[0], running[2]]).name).toBe('B')
    expect(preemptModel.recompute(1200, 340)).toBe(1540)
    expect(preemptModel.lastStep(1540, 512)).toBe(4)
    expect(preemptModel.lastStep(1536, 512)).toBe(512)
    expect(preemptModel.take(3000, 2048, 100, 1)).toBe(1948)
  })
})

describe('victim: the key is the rule applied to what the ticket prints', () => {
  interface Printed {
    policy: 'fcfs' | 'priority'
    names: string[]
    joined: string[]
    blocks: Map<string, number>
    priority: Map<string, number>
    arrived: Map<string, number>
    asking: string
  }

  /** What a ticket prints, read from its givens and its stem. */
  function read(item: Item): Printed {
    const policy = plain(item.stem).includes('first come, first served') ? 'fcfs' : 'priority'
    const blocks = new Map<string, number>()
    const priority = new Map<string, number>()
    const arrived = new Map<string, number>()
    for (const given of item.givens) {
      if (given.value.t !== 'num') continue
      const b = /^blocks held by (\w)$/.exec(given.label)
      const p = /^priority value of (\w)$/.exec(given.label)
      const a = /^arrived at, (\w)$/.exec(given.label)
      if (b !== null) blocks.set(b[1], given.value.value)
      if (p !== null) priority.set(p[1], given.value.value)
      if (a !== null) arrived.set(a[1], given.value.value)
    }
    const list = textOf(item, 'running list, in the order requests joined')
    const names = [...(policy === 'fcfs' ? blocks : priority).keys()].sort()
    // Below level 3 the list is printed; at level 3 first come, first served orders the requests by their arrivals.
    const joined = list !== '' ? list.split(', ') : [...names].sort((x, y) => (arrived.get(x) ?? 0) - (arrived.get(y) ?? 0))
    return { policy, names, joined, blocks, priority, arrived, asking: textOf(item, 'asking for a block') }
  }

  /** The victim, from the printed facts alone: the second statement of the rule. */
  function victimOf(t: Printed): string {
    if (t.policy === 'fcfs') return t.joined[t.joined.length - 1]
    let best = t.names[0]
    for (const name of t.names) {
      const p = t.priority.get(name) ?? 0
      const q = t.priority.get(best) ?? 0
      if (p > q || (p === q && (t.arrived.get(name) ?? 0) > (t.arrived.get(best) ?? 0))) best = name
    }
    return best
  }

  test('at every level, for both policies', () => {
    const policies = new Set<string>()
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = preemptVictim.make(seed, level, 'victim')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const t = read(item)
        policies.add(`${level}:${t.policy}`)
        expect(t.names).toHaveLength(5)
        expect(item.answer.correct).toBe(victimOf(t).toLowerCase())
        expect(item.answer.options.map((option) => option.id).sort()).toEqual(t.names.map((name) => name.toLowerCase()).sort())
      }
    }
    expect([...policies].sort()).toEqual(['0:fcfs', '0:priority', '1:fcfs', '1:priority', '2:fcfs', '2:priority', '3:fcfs', '3:priority'])
  })

  test('every wrong option is wrong for the reason it names, and only that request has the property', () => {
    const misses = new Set<string>()
    for (const seed of SEEDS) {
      for (const level of [2, 3] as const) {
        const item = preemptVictim.make(seed, level, 'victim')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const t = read(item)
        const key = victimOf(t)
        const by = (property: (name: string) => boolean): string[] => t.names.filter(property)
        const most = (map: Map<string, number>, sign: 1 | -1): string[] => {
          const top = Math.max(...t.names.map((name) => sign * (map.get(name) ?? 0)))
          return by((name) => sign * (map.get(name) ?? 0) === top)
        }
        const maxPriority = Math.max(...t.names.map((name) => t.priority.get(name) ?? 0))
        const expected: Record<string, string[]> = {
          'oldest-first': t.policy === 'fcfs' ? [t.joined[0]] : [],
          'the-one-asking': [t.asking],
          'largest-holder': t.policy === 'fcfs' ? most(t.blocks, 1) : [],
          'cheapest-to-redo': t.policy === 'fcfs' ? most(t.blocks, -1) : [],
          'last-to-join': t.policy === 'priority' ? most(t.arrived, 1) : [],
          'smallest-value': t.policy === 'priority' ? most(t.priority, -1) : [],
          'earliest-arrival': t.policy === 'priority' ? most(t.arrived, -1) : [],
          'tie-to-the-earlier': t.policy === 'priority' ? by((name) => t.priority.get(name) === maxPriority && name !== key) : [],
        }
        for (const option of item.answer.options) {
          const name = option.id.toUpperCase()
          if (option.id === item.answer.correct) {
            expect(option.miss).toBeUndefined()
            continue
          }
          const id = (option.miss ?? '').replace('tr2.preempt-victim.', '')
          misses.add(id)
          // The property holds of this request, and of no other.
          expect([level, id, expected[id]]).toEqual([level, id, [name]])
          expect(plain(option.why).length).toBeGreaterThan(60)
        }
      }
    }
    expect([...misses].sort()).toEqual(['cheapest-to-redo', 'earliest-arrival', 'largest-holder', 'last-to-join', 'oldest-first', 'smallest-value', 'the-one-asking', 'tie-to-the-earlier'])
  })

  test('is drawn answer first: every request is the key on about a fifth of the seeds of its name pool, and the asking request is never the key', () => {
    const counts = new Map<string, number>()
    let ties = 0
    let drawn = 0
    for (const seed of fixedSeeds(1600, 0x5a5a)) {
      const item = preemptVictim.make(seed, 2, 'victim')
      if (item.answer.kind !== 'choice') continue
      const t = read(item)
      expect(item.answer.correct).not.toBe(t.asking.toLowerCase())
      counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
      drawn += 1
      if (t.policy === 'priority') {
        const top = Math.max(...[...t.priority.values()])
        if ([...t.priority.values()].filter((value) => value === top).length === 2) ties += 1
      }
    }
    // Eight names, five drawn for each scene: each name is the key on about an eighth of the scenes.
    expect([...counts.keys()].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(drawn / 8 - 50)
      expect(count).toBeLessThan(drawn / 8 + 50)
    }
    // Half of the priority scenes are ties, and a quarter of all.
    expect(ties).toBeGreaterThan(drawn / 4 - 60)
    expect(ties).toBeLessThan(drawn / 4 + 60)
  })

  test('the solution says the rule of the policy, and names the victim', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = preemptVictim.make(seed, 2, 'victim')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const words = preemptVictim.solution(item).map((step) => plain(step.text)).join(' ')
      expect(words).toContain(`Request ${item.answer.correct.toUpperCase()}`)
      expect(words).toContain(read(item).policy === 'fcfs' ? 'the last request of the running list' : 'the largest priority value')
    }
  })
})

describe('restart: the engine computes all the victim has', () => {
  test('the key is the prompt and the output so far, and the last step of the recompute carries the remainder', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 2] as const) {
        const item = preemptVictim.make(seed, level, 'restart')
        const printed = givenNumbers(item)
        expect(numericKey(item)).toBe(printed.prompt + printed['output generated so far'])
      }
      const item = preemptVictim.make(seed, 3, 'restart')
      const printed = givenNumbers(item)
      const total = printed.prompt + printed['output generated so far']
      const budget = printed['budget of a step']
      const steps = Math.ceil(total / budget)
      expect(numericKey(item)).toBe(total - budget * (steps - 1))
      expect([512, 1024, 2048]).toContain(budget)
    }
  })

  test('held to the step loop: a request that must compute all it has, under a budget, takes the steps and the last chunk the key says', () => {
    const host = hostPreset('mrv2').card
    for (const seed of SEEDS.slice(0, 40)) {
      const item = preemptVictim.make(seed, 3, 'restart')
      const printed = givenNumbers(item)
      const total = printed.prompt + printed['output generated so far']
      const budget = printed['budget of a step']
      // The returning victim is a request of `total` tokens with none computed: the loop schedules it as it does a prompt of that length.
      const reqs: ReqSpec[] = [{ id: 0, dueUs: 0, promptTokens: total, outputTokens: 4, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false }]
      const workload: Workload = { seed: 1, origin: { kind: 'synthetic' }, reqs }
      const run = runStepLoop(workload, { maxNumSeqs: 8, maxBatchedTokens: budget, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] } }, host, SMALL_CARD, { horizonUs: 1_000_000_000 })
      const prefill = run.steps.filter((step) => step.prefillSeqs > 0)
      expect(prefill.length).toBe(Math.ceil(total / budget))
      expect(prefill.reduce((sum, step) => sum + step.tokens, 0)).toBe(total)
      expect(prefill[prefill.length - 1].tokens).toBe(numericKey(item))
    }
  })

  test('the diagnoses name the prompt alone, the output alone, nothing kept, and one more', () => {
    const item = preemptVictim.make(SEEDS[2], 2, 'restart')
    const { prompt, 'output generated so far': generated } = givenNumbers(item)
    const diagnose = (value: number): string | undefined => {
      const graded = preemptVictim.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    expect(diagnose(prompt + generated)).toBe('right')
    expect(diagnose(prompt)).toBe('tr2.preempt-victim.prompt-only')
    expect(diagnose(generated)).toBe('tr2.preempt-victim.output-only')
    expect(diagnose(0)).toBe('tr2.preempt-victim.state-kept')
    expect(diagnose(prompt + generated + 1)).toBe('tr2.preempt-victim.one-more')
    expect(diagnose(7)).toBeUndefined()
    const last = preemptVictim.make(SEEDS[2], 3, 'restart')
    const printed = givenNumbers(last)
    const lastDiagnose = (value: number): string | undefined => {
      const graded = preemptVictim.grade(last, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    expect(lastDiagnose(printed['budget of a step'])).toBe(printed['budget of a step'] === numericKey(last) ? 'right' : 'tr2.preempt-victim.a-whole-step')
  })
})

describe('chunk: the smaller of the prompt and what the decodes leave', () => {
  test('the key is the smaller of the prompt and the budget less what the decodes take, at every level', () => {
    let cut = 0
    let whole = 0
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = preemptVictim.make(seed, level, 'chunk')
        const printed = givenNumbers(item)
        const per = 1 + (level === 3 ? printed['drafts for each decoding request'] : 0)
        const prompt = printed['system prompt of the waiting request'] + printed['user message of the waiting request']
        const room = printed['budget of a step'] - printed['requests decoding'] * per
        expect(numericKey(item)).toBe(Math.min(prompt, room))
        if (prompt > room) cut += 1
        else whole += 1
        // The prompt is two parts that the learner adds: neither part is the key, since the key is their sum or the room the decodes leave.
        expect([printed['system prompt of the waiting request'], printed['user message of the waiting request']]).not.toContain(prompt)
      }
    }
    expect(cut).toBeGreaterThan(whole)
    expect(whole).toBeGreaterThan(300)
  })

  test('held to the step loop: with the decodes running and a prompt waiting, a step takes what the key says', () => {
    const host = hostPreset('mrv2').card
    const req = (id: number, dueUs: number, promptTokens: number, outputTokens: number): ReqSpec => ({ id, dueUs, promptTokens, outputTokens, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false })
    let checked = 0
    for (const seed of SEEDS) {
      const item = preemptVictim.make(seed, 2, 'chunk')
      const printed = givenNumbers(item)
      const decoding = printed['requests decoding']
      const budget = printed['budget of a step']
      const prompt = printed['system prompt of the waiting request'] + printed['user message of the waiting request']
      if (decoding > 160 || checked >= 12) continue
      const reqs: ReqSpec[] = []
      for (let id = 0; id < decoding; id += 1) reqs.push(req(id, 0, 16, 600))
      reqs.push(req(decoding, 5_000_000, prompt, 4))
      const workload: Workload = { seed: 1, origin: { kind: 'synthetic' }, reqs }
      const run = runStepLoop(workload, { maxNumSeqs: 512, maxBatchedTokens: budget, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] } }, host, SMALL_CARD, { horizonUs: 20_000_000_000, rows: true })
      // The first step that carries the waiting request is the one that has it as a row beside all the decodes.
      const carrying = run.steps.find((step) => step.reqs?.includes(decoding) === true && step.index > 0)
      expect(carrying).toBeDefined()
      expect((carrying?.tokens ?? 0) - decoding).toBe(numericKey(item))
      checked += 1
    }
    expect(checked).toBe(12)
  })

  test('at level 3 each decoding request carries its drafts: the loop gives them every token they have, and the prompt gets what is left', () => {
    const host = hostPreset('mrv2').card
    const req = (id: number, dueUs: number, promptTokens: number, outputTokens: number): ReqSpec => ({ id, dueUs, promptTokens, outputTokens, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false })
    let checked = 0
    for (const seed of SEEDS) {
      const item = preemptVictim.make(seed, 3, 'chunk')
      const printed = givenNumbers(item)
      const decoding = printed['requests decoding']
      const drafts = printed['drafts for each decoding request']
      const budget = printed['budget of a step']
      const prompt = printed['system prompt of the waiting request'] + printed['user message of the waiting request']
      if (decoding > 100 || checked >= 6 || prompt <= budget - decoding * (1 + drafts)) continue
      const reqs: ReqSpec[] = []
      for (let id = 0; id < decoding; id += 1) reqs.push(req(id, 0, 16, 2000))
      reqs.push(req(decoding, 8_000_000, prompt, 4))
      const workload: Workload = { seed: 1, origin: { kind: 'synthetic' }, reqs }
      const spec = { k: drafts, alphaPermille: 800, draftCostPermille: 100, method: 'eagle3' as const }
      const run = runStepLoop(workload, { maxNumSeqs: 512, maxBatchedTokens: budget, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] }, spec }, host, SMALL_CARD, { horizonUs: 40_000_000_000, rows: true })
      const carrying = run.steps.find((step) => step.reqs?.includes(decoding) === true && step.index > 0 && step.prefillSeqs > 0)
      expect(carrying).toBeDefined()
      // The step is full: the decodes took 1 + drafts tokens each and the prompt took the rest.
      expect(carrying?.tokens).toBe(budget)
      expect((carrying?.tokens ?? 0) - decoding * (1 + drafts)).toBe(numericKey(item))
      checked += 1
    }
    expect(checked).toBe(6)
  })

  test('the diagnoses name the whole budget, a decode that takes one token, the whole prompt, the room taken for the prompt, and one part of the prompt', () => {
    const find = (level: 2 | 3, predicate: (printed: Record<string, number>) => boolean): Item => {
      for (const seed of SEEDS) {
        const item = preemptVictim.make(seed, level, 'chunk')
        if (predicate(givenNumbers(item))) return item
      }
      throw new Error('no such scene')
    }
    const roomOf = (p: Record<string, number>): number => p['budget of a step'] - p['requests decoding'] * (1 + (p['drafts for each decoding request'] ?? 0))
    const promptOf = (p: Record<string, number>): number => p['system prompt of the waiting request'] + p['user message of the waiting request']
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = preemptVictim.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    const cut = find(2, (p) => promptOf(p) > roomOf(p))
    const pc = givenNumbers(cut)
    expect(diagnose(cut, roomOf(pc))).toBe('right')
    expect(diagnose(cut, pc['budget of a step'])).toBe('tr2.preempt-victim.decodes-forgotten')
    expect(diagnose(cut, promptOf(pc))).toBe('tr2.preempt-victim.whole-prompt')
    const fits = find(2, (p) => promptOf(p) <= roomOf(p))
    const pf = givenNumbers(fits)
    expect(diagnose(fits, promptOf(pf))).toBe('right')
    expect(diagnose(fits, roomOf(pf))).toBe('tr2.preempt-victim.room-as-take')
    expect(diagnose(fits, pf['system prompt of the waiting request'])).toBe('tr2.preempt-victim.one-part')
    const spec = find(3, (p) => promptOf(p) > roomOf(p) && promptOf(p) > p['budget of a step'] - p['requests decoding'])
    const ps = givenNumbers(spec)
    expect(diagnose(spec, p0(ps))).toBe('tr2.preempt-victim.drafts-forgotten')
    function p0(p: Record<string, number>): number {
      return Math.min(promptOf(p), p['budget of a step'] - p['requests decoding'])
    }
  })
})

describe('the levels', () => {
  test('restart is offered from level 1 and the others from level 0', () => {
    expect(offeredAt(preemptVictim, 0).map((variant) => variant.id)).toEqual(['victim', 'chunk'])
    expect(offeredAt(preemptVictim, 1).map((variant) => variant.id)).toEqual(['victim', 'restart', 'chunk'])
    expect(offeredAt(preemptVictim, 3).map((variant) => variant.id)).toEqual(['victim', 'restart', 'chunk'])
  })

  test('level 3 gives the arrivals and not the order of joining for first come, first served, and gives the decodes drafts', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const victim = preemptVictim.make(seed, 3, 'victim')
      expect(victim.givens.some((given) => given.label === 'running list, in the order requests joined')).toBe(false)
      expect(victim.givens.some((given) => given.label.startsWith('arrived at,'))).toBe(true)
      const chunk = preemptVictim.make(seed, 3, 'chunk')
      expect(chunk.givens.some((given) => given.label === 'drafts for each decoding request')).toBe(true)
      const two = preemptVictim.make(seed, 2, 'chunk')
      expect(two.givens.some((given) => given.label === 'drafts for each decoding request')).toBe(false)
    }
  })
})
