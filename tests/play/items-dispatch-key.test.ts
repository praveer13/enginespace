/*
 * W1b-T04: `tr2.dispatch-key`. The family's keys are the sim's dispatchers (packages/sim/steploop/graphs.ts), a port of vLLM v0.33.0's two dispatchers whose
 * agreement with vLLM's own answers waits for the owner's tables (Q-10). So these tests hold every key of `which-graph` and `captured` to the independent
 * second port of the same code (tests/sim/graphs-oracle.ts), from the numbers that the ticket prints, hold the lesson's own counts to the family, hold every
 * sentence to the claims that it cites, and check that no scene needs an adapter, which is what the tables would have to vouch for most. They hold the family
 * to the framework's own rules too (the checks of `commonSuite`).
 */
import { describe, expect, test } from 'bun:test'
import { fixedSeeds, offeredAt, plain } from '@es/play/items'
import type { Item } from '@es/play/items'
import { capturedCount, dispatchKey, dispatchBatch, kindOf, MRV1_FIELDS, MRV2_FIELDS, sizesFor } from '@es/play/items/families/tr2/dispatch-key'
import type { Runner } from '@es/play/items/families/tr2/dispatch-key'
import { DISPATCH_TABLES, RUNNER_PRESETS, vllmCaptureSizes } from '@es/sim/steploop'
import type { GraphModeId } from '@es/sim/steploop'
import { MODE_NAME, OracleDispatcherV1, OracleManagerV2 } from '../sim/graphs-oracle.ts'
import type { OracleConfig } from '../sim/graphs-oracle.ts'
import { claim, commonSuite } from './items-tr2-support.ts'

commonSuite(dispatchKey, 0xd15c)

const SEEDS = fixedSeeds(500, 0xd15)

const numericKey = (item: Item): number => (item.answer.kind === 'numeric' ? item.answer.truth : Number.NaN)

/** What a `which-graph` ticket prints, as a configuration and a batch. */
function ticket(item: Item): { runner: Runner; mode: GraphModeId; rail: number; sizes: number[]; decoding: number; chunk: number } {
  const by = new Map(item.givens.map((given) => [given.label, given.value]))
  const num = (label: string): number => {
    const part = by.get(label)
    return part?.t === 'num' ? part.value : 0
  }
  const runner = by.get('runner')
  const mode = by.get('cudagraph_mode')
  const sizes = by.get('captured sizes')
  if (mode?.t !== 'code' || sizes?.t !== 'code') throw new Error('a ticket with a mode and sizes')
  const level3 = by.has('requests in the step')
  const decoding = level3 ? (by.has('of them decoding') ? num('of them decoding') : num('requests in the step')) : num('requests decoding')
  const chunk = level3 ? num('new prompt tokens of the other') : num('prompt chunk in the step')
  return { runner: runner?.t === 'code' ? 'mrv2' : 'v1', mode: mode.code as GraphModeId, rail: num('max_num_seqs'), sizes: sizes.code.split(', ').map(Number), decoding, chunk }
}

/** The second port's answer for a batch of decode rows and perhaps a prompt chunk. */
function oracleKind(t: ReturnType<typeof ticket>): 'full' | 'piecewise' | 'eager' {
  const config: OracleConfig = { mode: t.mode, captureSizes: t.sizes, maxNumSeqs: t.rail, decodeQueryLen: 1, lora: null }
  const mixed = t.chunk > 0
  const tokens = t.decoding + t.chunk
  const rows = t.decoding + (mixed ? 1 : 0)
  const name = t.runner === 'mrv2' ? MODE_NAME[new OracleManagerV2(config).dispatch(rows, tokens, mixed ? null : 1, 0, mixed ? null : 1).cgMode as 0 | 1 | 2] : MODE_NAME[new OracleDispatcherV1(config).dispatch(tokens, !mixed, false, 0).mode as 0 | 1 | 2]
  return name === 'FULL' ? 'full' : name === 'PIECEWISE' ? 'piecewise' : 'eager'
}

describe('the rules rest on the claims, and the tables are still the owner\'s', () => {
  test('the dispatchers\' rules are the claims\': the candidates, the six conditions, the uniform count, the relaxed piecewise key', () => {
    expect(claim('vllm.cudagraph.mrv2-candidates').text).toContain('the FULL ones before the PIECEWISE ones')
    expect(claim('vllm.cudagraph.mrv2-decode-descs').text).toContain('above max_num_seqs times the length')
    expect(claim('vllm.cudagraph.mrv2-mixed-descs').text).toContain('A PIECEWISE descriptor has no request count')
    expect(claim('vllm.cudagraph.mrv2-compatible').text).toContain('its uniform token count is unset or equal to the batch\'s')
    expect(claim('vllm.cudagraph.mrv2-uniform-count').text).toContain('only when no request in the batch is still prefilling')
    expect(claim('vllm.cudagraph.mrv2-prefill-query-len').text).toContain('passes max_query_len to the dispatcher as None')
    expect(claim('vllm.cudagraph.mrv1-dispatch').text).toContain('then for a PIECEWISE key with the request count relaxed to None, and otherwise runs eagerly')
    expect(claim('vllm.cudagraph.mrv1-keys-decode').text).toContain('FULL keys for uniform decode')
    expect(claim('vllm.cudagraph.mode-routines').text).toContain('FULL_DECODE_ONLY is the pair (FULL, NONE) and FULL_AND_PIECEWISE is (FULL, PIECEWISE)')
  })

  test('the key fields are the claims\' and the sim\'s: seven for MRV2, five for MRV1, and the document\'s four are neither runner\'s', () => {
    expect(claim('vllm.cudagraph.mrv2-key').value).toBe(7)
    expect(claim('vllm.cudagraph.mrv1-key').value).toBe(5)
    expect(claim('vllm.cudagraph.design-doc-key').value).toBe(4)
    expect([...MRV2_FIELDS]).toEqual([...RUNNER_PRESETS.mrv2.key.fields])
    expect([...MRV1_FIELDS]).toEqual([...RUNNER_PRESETS.v1.key.fields])
    for (const field of MRV2_FIELDS) expect(claim('vllm.cudagraph.mrv2-key').text).toContain(field)
    for (const field of MRV1_FIELDS) expect(claim('vllm.cudagraph.mrv1-key').text).toContain(field)
    expect(claim('vllm.cudagraph.mrv2-key').text).toContain('It has no has_lora field')
  })

  test('the owner\'s tables are not committed, so no scene has an adapter: no ticket mentions one, and every dispatch the family makes has none', () => {
    expect(DISPATCH_TABLES.status).toBe('waiting')
    for (const seed of SEEDS.slice(0, 100)) {
      for (const level of [0, 1, 2, 3] as const) {
        for (const variant of ['which-graph', 'captured', 'fields'] as const) {
          const item = dispatchKey.make(seed, level, variant)
          const words = [plain(item.stem), ...item.givens.map((given) => `${given.label} ${given.value.t === 'text' ? given.value.text : ''}`)].join(' ').toLowerCase()
          // `captured` says in its stem that there is no adapter, and that is the one place a ticket names one.
          // The fields are the one place a name with `lora` in it appears, as a name of the key; nothing that dispatches has an adapter.
          if (variant !== 'fields') {
            expect(words.replace('there is no adapter.', '')).not.toMatch(/lora|adapter/)
            expect(JSON.stringify(item.params)).not.toMatch(/lora|adapter/)
          }
        }
      }
    }
  })
})

describe('which-graph: the key is the second port\'s answer for what the ticket prints', () => {
  test('at every level, for both runners', () => {
    const seen = new Set<string>()
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = dispatchKey.make(seed, level, 'which-graph')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const t = ticket(item)
        expect(t.runner).toBe(level === 3 ? 'v1' : 'mrv2')
        expect(t.sizes).toEqual(sizesFor(t.rail))
        expect(item.answer.correct).toBe(oracleKind(t))
        // The sim answers the same, through the family's own helper.
        expect(kindOf(dispatchBatch(t.runner, t.mode, t.rail, t.sizes, { decoding: t.decoding, chunk: t.chunk }).mode)).toBe(oracleKind(t))
        seen.add(`${level}:${t.mode}:${t.chunk > 0 ? 'mixed' : 'decode'}:${item.answer.correct}`)
        expect(item.answer.options.map((option) => option.id).sort()).toEqual(['eager', 'full', 'piecewise'])
      }
    }
    // Every mode, with both kinds of batch, reaches every answer it can, at level 2.
    for (const row of [
      '2:FULL_AND_PIECEWISE:decode:full',
      '2:FULL_AND_PIECEWISE:mixed:piecewise',
      '2:FULL_AND_PIECEWISE:mixed:eager',
      '2:FULL_DECODE_ONLY:decode:full',
      '2:FULL_DECODE_ONLY:mixed:eager',
      '2:FULL:decode:full',
      '2:FULL:mixed:full',
      '2:FULL:mixed:eager',
      '2:PIECEWISE:decode:piecewise',
      '2:PIECEWISE:mixed:piecewise',
      '2:PIECEWISE:mixed:eager',
      '3:FULL_AND_PIECEWISE:mixed:piecewise',
    ]) {
      expect(seen.has(row), row).toBe(true)
    }
  })

  test('is drawn answer first: a FULL graph, a PIECEWISE graph and none are each the key on about a third of the seeds', () => {
    for (const level of [2, 3] as const) {
      const counts = new Map<string, number>()
      for (const seed of fixedSeeds(1500, 0x6a5 + level)) {
        const item = dispatchKey.make(seed, level, 'which-graph')
        if (item.answer.kind === 'choice') counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
      }
      expect(counts.size).toBe(3)
      for (const count of counts.values()) {
        expect(count).toBeGreaterThan(500 * 0.85)
        expect(count).toBeLessThan(500 * 1.15)
      }
    }
  })

  test('a lure is wrong for the reason it gives: the claim of the sentence, or the number in it', () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const item = dispatchKey.make(seed, 2, 'which-graph')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const t = ticket(item)
      const largest = t.sizes[t.sizes.length - 1]
      for (const option of item.answer.options) {
        if (option.id === item.answer.correct) continue
        expect(option.miss).toBe(`tr2.dispatch-key.${option.id}-taken-for`)
        const why = plain(option.why)
        if (why.includes('No captured size is large enough')) expect(t.decoding + t.chunk).toBeGreaterThan(largest)
        if (why.includes('captures no FULL graph')) expect(t.mode).toBe('PIECEWISE')
        if (why.includes('captures no PIECEWISE graph')) expect(t.mode).toBe('FULL_DECODE_ONLY')
        if (why.includes('captures FULL graphs only')) expect(t.mode).toBe('FULL')
        if (why.includes('has a request still prefilling')) expect(t.chunk).toBeGreaterThan(0)
        if (why.includes('is within the captured sizes')) expect(t.decoding + t.chunk).toBeLessThanOrEqual(largest)
      }
    }
  })

  test('the solution names the sizes captured, the batch, and the graph, in the words of the runner', () => {
    for (const seed of SEEDS.slice(0, 120)) {
      for (const level of [2, 3] as const) {
        const item = dispatchKey.make(seed, level, 'which-graph')
        const steps = dispatchKey.solution(item).map((step) => plain(step.text))
        expect(steps).toHaveLength(3)
        expect(steps[0]).toContain(level === 3 ? 'MRV1 captured' : 'MRV2 captured')
        expect(steps[1]).toMatch(/uniform decode|not a uniform decode/)
        if (level === 3) expect(steps[1]).toMatch(/uniform is (?:true|false)/)
        else expect(steps[1]).toMatch(/uniform token count/)
      }
    }
  })
})

describe('captured: the count is the second port\'s, and the lesson\'s', () => {
  /** The distinct descriptors that the second port captures for a configuration. */
  const oracleCount = (mode: GraphModeId, rail: number, sizes: number[]): number => {
    const manager = new OracleManagerV2({ mode, captureSizes: sizes, maxNumSeqs: rail, decodeQueryLen: 1, lora: null })
    const seen = new Set<string>()
    for (const list of manager.candidates.values()) for (const desc of list) seen.add(JSON.stringify([desc.cgMode, desc.numTokens, desc.numReqs, desc.uniformTokenCount, desc.maxQueryLen, desc.numActiveLoras, desc.numUbatches]))
    return seen.size
  }

  test('the key is the number of descriptors the second port captures, at every level, and the legacy runner captures as many', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 1, 2, 3] as const) {
        const item = dispatchKey.make(seed, level, 'captured')
        const by = new Map(item.givens.map((given) => [given.label, given.value]))
        const mode = by.get('cudagraph_mode')
        const rail = by.get('max_num_seqs')
        const sizes = by.get('capture sizes')
        if (mode?.t !== 'code' || rail?.t !== 'num' || sizes?.t !== 'code') throw new Error('a ticket with a mode, a rail and sizes')
        const list = sizes.code.split(', ').map(Number)
        expect(numericKey(item)).toBe(oracleCount(mode.code as GraphModeId, rail.value, list))
        expect(capturedCount('v1', mode.code as GraphModeId, rail.value, list)).toBe(capturedCount('mrv2', mode.code as GraphModeId, rail.value, list))
      }
    }
  })

  test('the count is a graph for each size of the mixed routine and a decode graph for each size up to the rail, by mode', () => {
    for (const seed of SEEDS) {
      const item = dispatchKey.make(seed, 2, 'captured')
      const by = new Map(item.givens.map((given) => [given.label, given.value]))
      const mode = (by.get('cudagraph_mode') as { code: string }).code
      const rail = (by.get('max_num_seqs') as { value: number }).value
      const sizes = (by.get('capture sizes') as { code: string }).code.split(', ').map(Number)
      const atMost = sizes.filter((size) => size <= rail).length
      const expected = mode === 'FULL_AND_PIECEWISE' ? atMost + sizes.length : mode === 'FULL_DECODE_ONLY' ? atMost : sizes.length
      expect(numericKey(item)).toBe(expected)
    }
  })

  test('on the lesson\'s rail the count is the lesson\'s table: 7, 7, 5 and 12 graphs for the four modes, and 86 for the default sizes of a rail of 256 in FULL_AND_PIECEWISE', () => {
    const rail = 12
    const sizes = vllmCaptureSizes({ maxNumSeqs: rail, maxBatchedTokens: 2048 })
    expect(sizes).toEqual([1, 2, 4, 8, 12, 16, 24])
    expect(capturedCount('mrv2', 'PIECEWISE', rail, sizes)).toBe(7)
    expect(capturedCount('mrv2', 'FULL', rail, sizes)).toBe(7)
    expect(capturedCount('mrv2', 'FULL_DECODE_ONLY', rail, sizes)).toBe(5)
    expect(capturedCount('mrv2', 'FULL_AND_PIECEWISE', rail, sizes)).toBe(12)
    expect(capturedCount('mrv2', 'FULL_AND_PIECEWISE', 256, vllmCaptureSizes({ maxNumSeqs: 256, maxBatchedTokens: 2048 }))).toBe(86)
  })

  test('the diagnoses name one graph for each size, a decode graph at every size, the decode graphs alone, and every size taken for a decode graph', () => {
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = dispatchKey.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    const find = (mode: string): Item => {
      for (const seed of SEEDS) {
        const item = dispatchKey.make(seed, 2, 'captured')
        if ((item.givens.find((given) => given.label === 'cudagraph_mode')?.value as { code?: string }).code === mode) return item
      }
      throw new Error(`no scene in mode ${mode}`)
    }
    const sizesOf = (item: Item): number[] => (item.givens.find((given) => given.label === 'capture sizes')?.value as { code: string }).code.split(', ').map(Number)
    const railOf = (item: Item): number => (item.givens.find((given) => given.label === 'max_num_seqs')?.value as { value: number }).value
    const pair = find('FULL_AND_PIECEWISE')
    const sizes = sizesOf(pair)
    const atMost = sizes.filter((size) => size <= railOf(pair)).length
    expect(diagnose(pair, numericKey(pair))).toBe('right')
    expect(diagnose(pair, sizes.length)).toBe('tr2.dispatch-key.one-routine')
    expect(diagnose(pair, 2 * sizes.length)).toBe('tr2.dispatch-key.decode-above-the-rail')
    expect(diagnose(pair, atMost)).toBe('tr2.dispatch-key.decode-only')
    const only = find('FULL_DECODE_ONLY')
    expect(diagnose(only, sizesOf(only).length)).toBe('tr2.dispatch-key.sizes-above-the-rail')
  })
})

describe('fields: the jobs of the seven fields, and what one runner\'s key has that the other\'s has not', () => {
  test('below level 3 the key is the field the stem describes, drawn answer first over the seven, with three other fields beside it', () => {
    const counts = new Map<string, number>()
    for (const seed of fixedSeeds(1400, 0xf1e1)) {
      const item = dispatchKey.make(seed, 2, 'fields')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      expect(item.answer.options).toHaveLength(4)
      counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
      for (const option of item.answer.options) expect(MRV2_FIELDS.map((field) => field.replace(/_/g, '-'))).toContain(option.id)
      // The stem names the job of the key's field, in its own words.
      const stem = plain(item.stem)
      const field = (item.params.field as string).replace(/_/g, '-')
      expect(field).toBe(item.answer.correct)
      expect(stem.endsWith('?')).toBe(true)
    }
    expect(counts.size).toBe(7)
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(200 * 0.8)
      expect(count).toBeLessThan(200 * 1.2)
    }
  })

  test('each job rests on a claim: the request count a PIECEWISE descriptor leaves unset, the uniform count, the bound that a prefilling batch lacks, the adapter case', () => {
    expect(claim('vllm.cudagraph.mrv2-mixed-descs').text).toContain('A PIECEWISE descriptor has no request count')
    expect(claim('vllm.cudagraph.mrv2-compatible').text).toContain('its request count is unset or at least the batch\'s')
    expect(claim('vllm.cudagraph.mrv2-compatible').text).toContain('its token count is at least the batch\'s')
    expect(claim('vllm.cudagraph.mrv2-compatible').text).toContain('its adapter case and microbatch count equal the batch\'s')
    expect(claim('vllm.cudagraph.mrv2-uniform-count').text).toContain('every request has the same query length')
    expect(claim('vllm.cudagraph.mrv2-prefill-query-len').text).toContain('a descriptor that bounds the query length cannot match the batch')
    expect(claim('vllm.cudagraph.mrv2-active-loras').text).toContain('the number of distinct active adapters')
    expect(claim('vllm.cudagraph.mrv2-lora-clamp').text).toContain('smallest captured adapter case at or above it')
  })

  test('at level 3 the key is the field the question asks for, and no other option has the property', () => {
    const questions = new Set<string>()
    for (const seed of SEEDS) {
      const item = dispatchKey.make(seed, 3, 'fields')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const compare = item.params.compare as string
      questions.add(compare)
      const names = item.answer.options.map((option) => option.id.replace(/-/g, '_'))
      const holds = (name: string): boolean =>
        compare === 'mrv2-only' ? (MRV2_FIELDS as readonly string[]).includes(name) && !(MRV1_FIELDS as readonly string[]).includes(name) : compare === 'mrv1-only' ? (MRV1_FIELDS as readonly string[]).includes(name) && !(MRV2_FIELDS as readonly string[]).includes(name) : (MRV1_FIELDS as readonly string[]).includes(name) && !['num_tokens', 'num_reqs', 'uniform', 'has_lora'].includes(name)
      expect(names).toHaveLength(4)
      expect(names.filter(holds)).toEqual([item.answer.correct.replace(/-/g, '_')])
      if (compare === 'mrv1-only' && item.answer.correct === 'uniform') expect(names).toContain('uniform_token_count')
    }
    expect([...questions].sort()).toEqual(['doc-leaves-out', 'mrv1-only', 'mrv2-only'])
  })

  test('the keys are spread: no field is the key on a quarter of the seeds or more at level 3', () => {
    const counts = new Map<string, number>()
    const seeds = fixedSeeds(1200, 0xf1e2)
    for (const seed of seeds) {
      const item = dispatchKey.make(seed, 3, 'fields')
      if (item.answer.kind === 'choice') counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
    }
    for (const count of counts.values()) expect(count / seeds.length).toBeLessThan(0.25)
  })
})

describe('the levels', () => {
  test('every variant is offered at every level', () => {
    for (const level of [0, 1, 2, 3] as const) expect(offeredAt(dispatchKey, level).map((variant) => variant.id)).toEqual(['which-graph', 'captured', 'fields'])
  })
})
