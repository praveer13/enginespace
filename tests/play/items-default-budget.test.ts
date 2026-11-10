/*
 * W1b-T04: `tr2.default-budget`. The tests hold every number of the family to the claim that names it and its rule to the sim's `vllmBatchDefaults`,
 * re-derive each key from what the ticket prints with a second statement of the rule, hold `budget-left` and `waiting` to the step loop (the budget a
 * prompt gets and the requests a first step takes), and hold the family to the framework's own rules (the checks of `commonSuite`).
 */
import { describe, expect, test } from 'bun:test'
import { fixedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { defaultBudget, LINE, PAIRS, TOP } from '@es/play/items/families/tr2/default-budget'
import { ENGINE_DEFAULTS, runStepLoop, SMALL_CARD, vllmBatchDefaults } from '@es/sim/steploop'
import { hostPreset } from '@es/sim/host'
import type { ReqSpec, Workload } from '@es/sim/workload'
import { claim, commonSuite, givenNumbers } from './items-tr2-support.ts'

commonSuite(defaultBudget, 0xdb01)

const SEEDS = fixedSeeds(400, 0xdb7)

/** The claims' numbers, by row: the second statement of the rule that the keys are held to. */
const ROWS = {
  small: { server: Number(claim('vllm.batch-defaults.small.server-tokens').value), offline: Number(claim('vllm.batch-defaults.small.offline-tokens').value), seqs: Number(claim('vllm.batch-defaults.small.seqs').value) },
  large: { server: Number(claim('vllm.batch-defaults.large.server-tokens').value), offline: Number(claim('vllm.batch-defaults.large.offline-tokens').value), seqs: Number(claim('vllm.batch-defaults.large.seqs').value) },
  xlarge: { server: Number(claim('vllm.batch-defaults.xlarge.tokens').value), offline: Number(claim('vllm.batch-defaults.xlarge.tokens').value), seqs: Number(claim('vllm.batch-defaults.xlarge.seqs').value) },
} as const

type Row = (typeof ROWS)[keyof typeof ROWS]

/** What a ticket says of its card and command. */
function ticket(item: Item): { gib: number; a100: boolean; offline: boolean } {
  const by = new Map(item.givens.map((given) => [given.label, given.value]))
  const card = by.get('card')
  const memory = by.get('card memory')
  const command = by.get('command')
  const named = card?.t === 'code' ? card.code : ''
  const GIB = 2 ** 30
  const gib = memory?.t === 'num' ? memory.value : named.startsWith('RTX 4090') ? 24e9 / GIB : named.startsWith('H100') ? 80e9 / GIB : named === 'B200' ? 180e9 / GIB : Number.NaN
  return { gib, a100: named === 'A100', offline: command?.t === 'code' && command.code.startsWith('LLM(') }
}

/** The claims' rule, written again from their texts: 70 GiB or more and not an A100, and 160 GiB or more. */
function rowOf(t: { gib: number; a100: boolean }): Row {
  if (t.gib >= 160) return ROWS.xlarge
  if (t.gib >= 70 && !t.a100) return ROWS.large
  return ROWS.small
}

const numericKey = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

describe('the rule rests on the claims', () => {
  test('each number is a claim at the pin, and says what the family says of its row', () => {
    expect(ROWS.small).toEqual({ server: 2048, offline: 8192, seqs: 256 })
    expect(ROWS.large).toEqual({ server: 8192, offline: 16384, seqs: 1024 })
    expect(ROWS.xlarge).toEqual({ server: 16384, offline: 16384, seqs: 1024 })
    for (const id of ['vllm.batch-defaults.small.server-tokens', 'vllm.batch-defaults.small.offline-tokens', 'vllm.batch-defaults.small.seqs', 'vllm.batch-defaults.large.server-tokens', 'vllm.batch-defaults.large.offline-tokens', 'vllm.batch-defaults.large.seqs', 'vllm.batch-defaults.xlarge.tokens', 'vllm.batch-defaults.xlarge.seqs']) {
      expect([id, claim(id).pin]).toEqual([id, 'vllm'])
    }
    expect(claim('vllm.batch-defaults.small.server-tokens').text).toContain('less than 70 GiB')
    expect(claim('vllm.batch-defaults.large.server-tokens').text).toContain('70 GiB or more that is not an A100')
    expect(claim('vllm.batch-defaults.xlarge.tokens').text).toContain('160 GiB or more, such as a B200')
    expect(claim('vllm.batch-defaults.threshold.large-gib').value).toBe(LINE)
    expect(claim('vllm.batch-defaults.threshold.large-gib').text).toContain('an A100 stays on the small tier whatever its memory')
    expect(claim('vllm.batch-defaults.a100-throughput').text).toContain('setting a large max_num_batched_tokens for an A100 reduces its throughput')
    expect(TOP).toBe(160)
  })

  test('the four pairs a command can start with are the rows of the claims, and no other', () => {
    const pairs = new Set<string>()
    for (const row of Object.values(ROWS)) {
      pairs.add(`${row.server}/${row.seqs}`)
      pairs.add(`${row.offline}/${row.seqs}`)
    }
    expect(PAIRS.map((pair) => `${pair.tokens}/${pair.seqs}`).sort()).toEqual([...pairs].sort())
  })

  test('the course\'s two lab cards are the sim\'s rows, and the sim\'s rule gives them the claims\' tiers', () => {
    expect(ENGINE_DEFAULTS['rtx-4090'].label).toBe('RTX 4090 (24 GB)')
    expect(ENGINE_DEFAULTS.h100.label).toBe('H100 (80 GB)')
    expect(ENGINE_DEFAULTS['rtx-4090'].vllm).toEqual({ serverTokens: ROWS.small.server, offlineTokens: ROWS.small.offline, seqs: ROWS.small.seqs })
    expect(ENGINE_DEFAULTS.h100.vllm).toEqual({ serverTokens: ROWS.large.server, offlineTokens: ROWS.large.offline, seqs: ROWS.large.seqs })
    // An A100 stays small whatever its memory; 70 GiB itself is large; 160 GiB is the largest tier.
    expect(vllmBatchDefaults({ memoryGiB: 80, a100: true }).serverTokens).toBe(2048)
    expect(vllmBatchDefaults({ memoryGiB: 70 }).serverTokens).toBe(8192)
    expect(vllmBatchDefaults({ memoryGiB: 69.9 }).serverTokens).toBe(2048)
    expect(vllmBatchDefaults({ memoryGiB: 160 })).toEqual({ serverTokens: 16384, offlineTokens: 16384, seqs: 1024 })
  })
})

describe('the keys, re-derived from what the ticket prints', () => {
  test('tier: the key is the pair of the claims\' row for the card, at the entry point the command starts', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = defaultBudget.make(seed, level, 'tier')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const t = ticket(item)
        const row = rowOf(t)
        const { correct } = item.answer
        const pair = PAIRS.find((candidate) => candidate.id === correct)
        expect(pair).toBeDefined()
        expect([pair?.tokens, pair?.seqs]).toEqual([t.offline ? row.offline : row.server, row.seqs])
        // The command is the server's below level 3.
        if (level < 3) expect(t.offline).toBe(false)
        seen.add(`${level}:${t.offline ? 'offline' : 'server'}`)
      }
    }
    expect([...seen].sort()).toEqual(['0:server', '1:server', '2:server', '3:offline', '3:server'])
  })

  test('budget-left: the budget of the row less the decoding requests, and the decodes fit the cap', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = defaultBudget.make(seed, level, 'budget-left')
        const t = ticket(item)
        const row = rowOf(t)
        const decoding = givenNumbers(item)['requests decoding']
        expect(decoding).toBeLessThan(row.seqs)
        expect(decoding % 8).toBe(0)
        expect(numericKey(item)).toBe((t.offline ? row.offline : row.server) - decoding)
      }
    }
  })

  test('waiting: the burst less the cap of the row, and the budget is not what limits the first step', () => {
    for (const seed of SEEDS) {
      for (const level of [1, 2, 3] as const) {
        const item = defaultBudget.make(seed, level, 'waiting')
        const t = ticket(item)
        const row = rowOf(t)
        const given = givenNumbers(item)
        const burst = level === 3 ? given.clients * given['requests each'] : given.burst
        expect(burst).toBeGreaterThan(row.seqs)
        expect(numericKey(item)).toBe(burst - row.seqs)
        // Four tokens a prompt: a full step of requests is under the budget.
        expect(row.seqs * 4).toBeLessThanOrEqual(row.server)
        expect(t.offline).toBe(false)
      }
    }
  })

  test('level 3 gives a burst as clients and the requests each sends, and a decode count at the offline class\'s budget', () => {
    const offlineSeen = new Set<number>()
    for (const seed of SEEDS) {
      const waiting = defaultBudget.make(seed, 3, 'waiting')
      expect(Object.keys(givenNumbers(waiting)).filter((label) => label !== 'card memory').sort()).toEqual(['clients', 'requests each'])
      const budget = defaultBudget.make(seed, 3, 'budget-left')
      const t = ticket(budget)
      if (t.offline) offlineSeen.add(rowOf(t).offline)
    }
    expect([...offlineSeen].sort((a, b) => a - b)).toEqual([8192, 16384])
  })
})

describe('the draws are answer first, and the traps are there', () => {
  test('each pair is the key on about its share of the seeds: a third at levels 0 to 2 and a quarter at level 3', () => {
    for (const level of [0, 2, 3] as const) {
      const keys = new Map<string, number>()
      for (const seed of fixedSeeds(1200, 0x5eed + level)) {
        const item = defaultBudget.make(seed, level, 'tier')
        if (item.answer.kind === 'choice') keys.set(item.answer.correct, (keys.get(item.answer.correct) ?? 0) + 1)
      }
      const ids = offeredAt(defaultBudget, level).length > 0 ? [...keys.keys()].sort() : []
      expect(ids.length).toBe(level === 3 ? 4 : 3)
      const share = 1200 / ids.length
      for (const id of ids) {
        expect(keys.get(id) ?? 0).toBeGreaterThan(share * 0.8)
        expect(keys.get(id) ?? 0).toBeLessThan(share * 1.2)
      }
    }
  })

  test('an A100 is given with a memory over the line, and still gets the smallest row; a card of exactly the line gets the large one', () => {
    let a100 = 0
    let line = 0
    for (const seed of SEEDS) {
      const item = defaultBudget.make(seed, 2, 'tier')
      if (item.answer.kind !== 'choice') continue
      const t = ticket(item)
      if (t.a100) {
        a100 += 1
        expect(t.gib).toBeGreaterThanOrEqual(LINE)
        expect(item.answer.correct).toBe('p-small-server')
      }
      if (t.gib === LINE) {
        line += 1
        expect(item.answer.correct).toBe('p-large-server')
      }
    }
    expect(a100).toBeGreaterThan(10)
    expect(line).toBeGreaterThan(5)
  })
})

describe('the model, held to the step loop', () => {
  const req = (id: number, dueUs: number, promptTokens: number, outputTokens: number): ReqSpec => ({ id, dueUs, promptTokens, outputTokens, prefixGroup: null, prefixTokens: 0, adapter: null, structured: false })
  const host = hostPreset('mrv2').card
  const config = (budget: number, seqs: number) => ({ maxNumSeqs: seqs, maxBatchedTokens: budget, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device' as const, graphs: { mode: 'NONE' as const, captureSizes: [] } })

  test('a step that carries a waiting prompt takes the budget less the decoding requests of it, on a card of each tier', () => {
    let checked = 0
    const tiers = new Set<number>()
    for (const seed of SEEDS) {
      const item = defaultBudget.make(seed, 2, 'budget-left')
      const t = ticket(item)
      const row = rowOf(t)
      const decoding = givenNumbers(item)['requests decoding']
      // Few runs are as long as a card of 1,024 sequences would make them, so the loop is run on the cheaper rows only, and on one of the larger.
      if (decoding > 120 || tiers.size >= 3 && tiers.has(row.server)) continue
      tiers.add(row.server)
      const reqs: ReqSpec[] = []
      for (let id = 0; id < decoding; id += 1) reqs.push(req(id, 0, 16, 400))
      reqs.push(req(decoding, 2_000_000, 3 * row.server, 8))
      const workload: Workload = { seed: 1, origin: { kind: 'synthetic' }, reqs }
      const run = runStepLoop(workload, config(row.server, row.seqs), host, SMALL_CARD, { horizonUs: 10_000_000_000, rows: true })
      const carrying = run.steps.find((step) => step.prefillSeqs > 0 && step.tokens > 3 * decoding + 100 && step.index > 0)
      expect(carrying).toBeDefined()
      expect(carrying?.tokens).toBe(row.server)
      expect((carrying?.tokens ?? 0) - decoding).toBe(row.server - decoding)
      checked += 1
    }
    expect(checked).toBeGreaterThanOrEqual(3)
    expect(tiers.size).toBeGreaterThanOrEqual(2)
  })

  test('a first step takes as many requests as the cap, and the rest of a burst waits, on a card of each tier', () => {
    const tiers = new Set<number>()
    for (const seed of SEEDS) {
      const item = defaultBudget.make(seed, 2, 'waiting')
      const t = ticket(item)
      const row = rowOf(t)
      if (tiers.has(row.seqs) && tiers.size >= 2) continue
      tiers.add(row.seqs)
      const burst = givenNumbers(item).burst
      const reqs: ReqSpec[] = []
      for (let id = 0; id < burst; id += 1) reqs.push(req(id, 0, 4, 2))
      const workload: Workload = { seed: 1, origin: { kind: 'synthetic' }, reqs }
      const run = runStepLoop(workload, config(row.server, row.seqs), host, SMALL_CARD, { horizonUs: 10_000_000_000 })
      expect(run.steps[0].seqs).toBe(row.seqs)
      expect(burst - run.steps[0].seqs).toBe(numericKey(item))
    }
    expect(tiers.size).toBe(2)
  })
})

describe('the diagnoses', () => {
  const diagnose = (item: Item, value: number): string | undefined => {
    const graded = defaultBudget.grade(item, { kind: 'numeric', value })
    return graded.ok ? 'right' : graded.diagnosis?.id
  }
  const find = (variant: 'budget-left' | 'waiting', test: (item: Item) => boolean): Item => {
    for (const seed of SEEDS) {
      const item = defaultBudget.make(seed, 2, variant)
      if (test(item)) return item
    }
    throw new Error('no such scene among the seeds')
  }

  test('budget-left: the whole budget, the cap taken for the budget, and the budget of another tier are named', () => {
    const item = find('budget-left', (candidate) => rowOf(ticket(candidate)) === ROWS.large)
    const row = rowOf(ticket(item))
    const decoding = givenNumbers(item)['requests decoding']
    expect(diagnose(item, row.server - decoding)).toBe('right')
    expect(diagnose(item, row.server)).toBe('tr2.default-budget.decodes-forgotten')
    expect(diagnose(item, row.seqs - decoding)).toBe('tr2.default-budget.cap-as-budget')
    expect(diagnose(item, ROWS.small.server - decoding)).toBe('tr2.default-budget.other-tier')
    expect(diagnose(item, ROWS.xlarge.server - decoding)).toBe('tr2.default-budget.other-tier')
    expect(diagnose(item, 123_457)).toBeUndefined()
  })

  test('waiting: the budget taken for the cap, the cap of another tier and a burst that none of it left are named', () => {
    const item = find('waiting', (candidate) => rowOf(ticket(candidate)) === ROWS.small)
    const burst = givenNumbers(item).burst
    expect(diagnose(item, burst - ROWS.small.seqs)).toBe('right')
    expect(diagnose(item, burst - ROWS.small.server)).toBe('tr2.default-budget.budget-as-cap')
    expect(diagnose(item, burst - ROWS.large.seqs)).toBe('tr2.default-budget.other-tier')
    expect(diagnose(item, burst)).toBe('tr2.default-budget.none-admitted')
  })

  test('a choice names the misconception of the pair that was picked', () => {
    const item = defaultBudget.make(SEEDS[0], 2, 'tier')
    if (item.answer.kind !== 'choice') throw new Error('a choice')
    for (const option of item.answer.options) {
      const graded = defaultBudget.grade(item, { kind: 'choice', pick: option.id })
      if (option.id === item.answer.correct) expect(graded.ok).toBe(true)
      else expect(graded.diagnosis?.id).toBe(`tr2.default-budget.${option.id}-taken-for`)
      expect(plain(option.why).length).toBeGreaterThan(40)
    }
  })
})
