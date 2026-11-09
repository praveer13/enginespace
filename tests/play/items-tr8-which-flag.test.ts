/*
 * W1b-T06: `tr8.which-flag`. The tests hold every flag of the table to the claims it rests on (they exist, they are the tool's pin, and each says
 * what the table says), hold the cap's arithmetic to the benchmark generator's closed loop (a cap is the number in flight, and the rate it sends
 * is the cap over the time each is held), re-derive each key from what a ticket prints, and hold the family to the framework's rules:
 * deterministic, in band, graded, explained, and not passed by a habit.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  bandAcceptance,
  bandedSeeds,
  BAND_FLOOR,
  drawInBand,
  FAMILIES,
  familiesForKc,
  familyById,
  fixedSeeds,
  LEVELS,
  measureBlind,
  offeredAt,
  plain,
  startAttempt,
} from '@es/play/items'
import type { Item, Response } from '@es/play/items'
import { CAPS, FAULTS, SGLANG_FAULTS, VLLM_FAULTS, sendRatePerSMilli, sentRate } from '@es/play/items/families/tr8/flags'
import type { Fault, ToolId } from '@es/play/items/families/tr8/flags'
import { whichFlag } from '@es/play/items/families/tr8/which-flag'
import { lockFileSchema } from '@es/schema/lock'
import { littlesLaw as simLittlesLaw, runBench } from '../../packages/sim/bench'
import type { BenchSpec } from '../../packages/sim/bench'
import { CORPUS_SERVER, CORPUS_SLO, lengthsOf } from '../../packages/sim/bench/broken-model'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { TRAFFIC } from '../content/tr8-demos.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS, printed } from './items-tr6-support.ts'

// Measuring a family on a thousand banded seeds at each level takes a second or two, and several on a loaded host.
setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(400, 0x7f1a9)
const SEC = 1_000_000

/** What each claim of the table says that the table relies on: phrases of its text. A re-pin that moves one fails here and names it. */
const CLAIM_SAYS: Readonly<Record<string, readonly string[]>> = {
  'vllm.bench.request-rate-default': ['defaults --request-rate to infinity', 'all the requests are sent at time 0'],
  'sglang.bench.request-rate-default': ['defaults --request-rate to infinity', 'sends all the requests at time 0'],
  'vllm.bench.max-concurrency-closed-loop': ['asyncio semaphore around each request', 'a capped closed loop', 'may then be lower than the one requested'],
  'vllm.bench.max-concurrency-default': ['unset by default', 'nothing caps the requests in flight'],
  'sglang.bench.max-concurrency-semaphore': ['caps concurrency with an asyncio semaphore', 'a capped closed loop'],
  'sglang.bench.timer-inside-request': ['the wait for the semaphore that precedes the function is in no latency it reports'],
  'vllm.bench.percentile-metrics-default': ['defaults to ttft, tpot and itl for generative models'],
  'vllm.bench.client-queue-in-percentile-metrics': ['when --max-concurrency is set, client_queue_time should be included in --percentile-metrics', 'waiting for the benchmark client\'s concurrency limit'],
  'vllm.bench.client-queue-time': ['The time a request waits at the semaphore is recorded apart as client_queue_time'],
  'vllm.bench.num-warmups-default': ['--num-warmups defaults to 0', 'counts its first, cold requests'],
  'vllm.bench.warmup-is-request-zero': ['built from the first request of the dataset'],
  'sglang.bench.warmup-default': ['sends 1 warm-up request by default'],
  'sglang.bench.warmup-is-request-zero': ['copies of the first request of the dataset', 'capped at 32 tokens'],
  'vllm.bench.seed-default': ['--seed defaults to 0', 'draw the same prompts'],
  'sglang.bench.seed-default': ['seeds its random choices with 42 by default'],
  'vllm.bench.prefix-cache-reuse': ['can reuse prompts left in the prefix cache and inflate throughput', 'varying --seed, restarting or resetting the server', 'vllm bench sweep serve'],
  'vllm.bench.metric-percentiles-default': ['defaults to the 99th percentile alone'],
  'vllm.bench.guide-mean-median-p99': ['a mean (71.54 ms), a median (73.88 ms) and a 99th percentile (79.49 ms)'],
  'vllm.bench.max-tokens-is-output-len': ['carries `max_tokens` equal to the `output_len` of its dataset sample'],
  'vllm.bench.sharegpt-output-len': ['gives every request of the ShareGPT dataset one output length, in place of the lengths in the dataset'],
  'vllm.bench.self-timed-default': ['only with `--self-timed`', 'defaults to False except for `--dataset-name=timed_trace`', 'the timing in the trace is ignored'],
  'vllm.bench.burstgpt-lengths-only': ['reads from each row only its two token counts', 'does not read the Timestamp column'],
  'sglang.bench.flush-cache-after-warmup': ['only when it is given `--flush-cache` or runs in SGLang\'s CI', 'Otherwise it does not flush the cache'],
  'sglang.bench.ignore-eos-default': ['sends ignore_eos as true unless --disable-ignore-eos is given', 'every response runs to its output length'],
  'sglang.bench.trace-timestamps-mooncake-only': ['its own help says the option is only valid for the mooncake dataset'],
  'sglang.bench.mooncake-in-time': ['ignoring --request-rate'],
  'sglang.bench.mooncake-generator': ['based on the timestamps in the trace file'],
  'vllm.bench.goodput-units': ['KEY:VALUE pairs in milliseconds'],
  'sglang.bench.goodput': ['KEY:VALUE pairs in milliseconds', 'meets every given SLO'],
}

const numsOf = (item: Item): Record<string, number> => Object.fromEntries(Object.entries(item.params).filter(([, value]) => typeof value === 'number')) as Record<string, number>
const faultOf = (item: Item): Fault => {
  const tool = item.params['tool'] as ToolId
  const found = FAULTS[tool].find((fault) => fault.id === item.params['key'])
  if (found === undefined) throw new Error(`no flag ${String(item.params['key'])}`)
  return found
}

describe('the family', () => {
  test('is registered, names the KCs of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr8.which-flag')).toBe(whichFlag)
    expect(FAMILIES).toContain(whichFlag)
    expect(familiesForKc('tr8.tool-defaults')).toEqual([whichFlag])
    expect(familiesForKc('tr8.client-queue')).toEqual([whichFlag])
    for (const kc of whichFlag.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const variant of whichFlag.variants) for (const kc of variant.kcs) expect(whichFlag.kcs).toContain(kc)
    for (const level of [0, 1, 2] as const) expect(offeredAt(whichFlag, level).map((variant) => variant.id)).toEqual(['at-fault-vllm', 'at-fault-sglang', 'send-rate'])
    expect(offeredAt(whichFlag, 3).map((variant) => variant.id)).toEqual(['at-fault-vllm', 'at-fault-sglang', 'default-does', 'send-rate'])
  })

  test('has the flags of the two tools, nine of vLLM\'s and eight of SGLang\'s, and every flag has what a report of it shows', () => {
    expect(VLLM_FAULTS.map((fault) => fault.id)).toEqual(['request-rate', 'max-concurrency', 'percentile-metrics', 'num-warmups', 'seed', 'metric-percentiles', 'sharegpt-output-len', 'self-timed', 'goodput'])
    expect(SGLANG_FAULTS.map((fault) => fault.id)).toEqual(['request-rate', 'max-concurrency', 'warmup-requests', 'flush-cache', 'seed', 'disable-ignore-eos', 'use-trace-timestamps', 'goodput'])
    for (const tool of ['vllm', 'sglang'] as const) {
      const faults = FAULTS[tool]
      // No two flags of a tool leave the same mark on a report, or mend with the same words, so a report has one flag to blame.
      expect(new Set(faults.map((fault) => plain(fault.marks))).size).toBe(faults.length)
      expect(new Set(faults.map((fault) => plain(fault.fix))).size).toBe(faults.length)
      expect(new Set(faults.map((fault) => fault.flag)).size).toBe(faults.length)
      expect(faults.filter((fault) => fault.ifLeftOut !== undefined).length).toBeGreaterThanOrEqual(5)
      for (const fault of faults) {
        expect(fault.tool).toBe(tool)
        expect(fault.flag).toMatch(/^--[a-z]+(?:-[a-z]+)*$/)
        expect(fault.flag).toBe(`--${fault.id}`)
        expect(fault.report(fault.draw(() => 12345)).length).toBeGreaterThanOrEqual(2)
      }
    }
  })
})

describe('the claims the table rests on', () => {
  const lock = lockFileSchema.parse(JSON.parse(readFileSync(path.join(root, 'course.lock.json'), 'utf8')))
  const version = (key: string): string => lock.entries.find((entry) => entry.key === key)?.version ?? ''

  test('every flag cites claims that exist, at its tool\'s pin, and each says what the table says', () => {
    const cited = new Set<string>()
    for (const tool of ['vllm', 'sglang'] as const) {
      for (const fault of FAULTS[tool]) {
        expect([tool, fault.id, fault.claims.length > 0]).toEqual([tool, fault.id, true])
        for (const id of fault.claims) {
          cited.add(id)
          const record = claim(id) as { pin?: string; text: string }
          expect([id, record.text.length > 0]).toEqual([id, true])
          if (record.pin !== undefined) expect([id, record.pin]).toEqual([id, tool])
          expect([id, id in CLAIM_SAYS]).toEqual([id, true])
        }
      }
    }
    for (const [id, phrases] of Object.entries(CLAIM_SAYS)) {
      expect([id, cited.has(id)]).toEqual([id, true])
      for (const phrase of phrases) expect([id, claim(id).text.includes(phrase)]).toEqual([id, true])
    }
  })

  test('names the tools at the pins of the lock file', () => {
    const vllm = whichFlag.make(SEEDS[0], 2, 'at-fault-vllm')
    const sglang = whichFlag.make(SEEDS[0], 2, 'at-fault-sglang')
    expect(plain(vllm.stem)).toContain(`vLLM v${version('vllm')}`)
    expect(plain(sglang.stem)).toContain(`SGLang v${version('sglang')}`)
    expect(plain(vllm.stem)).toContain('vllm bench serve')
    expect(plain(sglang.stem)).toContain('sglang.bench_serving')
  })

  test('states the defaults it prints as measured numbers: vLLM\'s zero warm-ups and seed, SGLang\'s one warm-up and seed of 42', () => {
    const numbers = (fault: Fault): number[] => [...(fault.ifLeftOut ?? []), ...fault.does].flatMap((part) => (part.t === 'num' && part.tag === 'measured' ? [part.value] : []))
    const by = (faults: readonly Fault[], id: string): number[] => numbers(faults.find((fault) => fault.id === id) ?? faults[0])
    expect(by(VLLM_FAULTS, 'num-warmups')).toEqual([0, 0])
    expect(by(VLLM_FAULTS, 'seed')).toEqual([0, 0])
    expect(by(SGLANG_FAULTS, 'warmup-requests')).toEqual([1, 1, 32])
    expect(by(SGLANG_FAULTS, 'seed')).toEqual([42, 42])
  })
})

describe('the cap, held to the benchmark generator', () => {
  test('a cap is the number in flight, and a capped run sends the permits over the time each is held: the generator\'s closed loop, with Little\'s law', () => {
    for (const clients of [8, 16, 32]) {
      const spec: BenchSpec = { arrivals: { kind: 'closed', clients, thinkUs: 0 }, lengths: lengthsOf(TRAFFIC), requests: 20_000, warmupUs: 0, durationUs: 60 * SEC, slo: CORPUS_SLO }
      const run = runBench(4, spec, CORPUS_SERVER)
      const window = { fromUs: 10 * SEC, toUs: 50 * SEC }
      const law = simLittlesLaw(run.rows, window, 'sent')
      // With every client always holding a request, the number in flight is the cap...
      expect(Math.abs(law.meanInFlightMilli / 1000 - clients)).toBeLessThanOrEqual(0.02 * clients)
      // ...and the rate that the run sends (and finishes) is the cap over the mean time a request takes.
      const rate = law.throughputPerSMilli / 1000
      const predicted = (clients * 1_000_000) / law.meanLatencyUs
      expect([clients, Math.abs(rate - predicted) / predicted <= 0.03]).toEqual([clients, true])
      // The family's closed form is that division: permits over the time, in requests a second times 1,000.
      expect(sendRatePerSMilli({ rate: 1000, cap: clients, latencyMs: law.meanLatencyUs / 1000 })).toBe(Math.round(predicted * 1000))
    }
  })

  test('a cap binds in every scene the family draws: the run sends from a quarter to four fifths of the rate asked for', () => {
    expect(CAPS.length).toBeGreaterThan(300)
    for (const scene of CAPS) {
      const sent = sendRatePerSMilli(scene)
      expect(sent * 5).toBeLessThanOrEqual(scene.rate * 4000)
      expect(sent * 4).toBeGreaterThanOrEqual(scene.rate * 1000)
    }
  })

  test('the lesson\'s prediction is the family\'s arithmetic: eight permits held for 1.2 s send 6.67 requests a second', () => {
    expect(sentRate({ rate: 10, cap: 8, latencyMs: 1200 })).toBe(6.67)
    expect(sentRate({ rate: 10, cap: 16, latencyMs: 1500 })).toBe(10.7)
    expect(sentRate({ rate: 100, cap: 128, latencyMs: 400 })).toBe(320)
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(whichFlag, level)) {
        const item = whichFlag.make(seed, level, variant.id)
        expect(whichFlag.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(whichFlag, item, { seed, level, variant: variant.id })).toEqual([])
        expect(whichFlag.grade(item, keyOf(item)).ok).toBe(true)
        expect(whichFlag.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('without a variant named, the seed chooses one the level offers', () => {
    for (const level of LEVELS) {
      expect(new Set(SEEDS.map((seed) => whichFlag.make(seed, level).variant))).toEqual(new Set(offeredAt(whichFlag, level).map((variant) => variant.id)))
    }
  })

  test('prints every scenario number tagged synthetic or measured, and no number in a sentence that is not a tagged part', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      for (const level of LEVELS) {
        const item = whichFlag.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...whichFlag.solution(item).map((step) => step.text)]
        // A flag, a version and an identifier are not numbers (v0.33.0, max_tokens); a number is a tagged part.
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
        if (item.answer.kind === 'choice') {
          for (const option of item.answer.options) {
            for (const part of [...option.text, ...option.why]) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
            for (const part of [...option.text, ...option.why]) if (part.t === 'num') expect(['synthetic', 'derived', 'measured']).toContain(part.tag)
          }
        }
      }
    }
  })
})

describe('at-fault', () => {
  test.each([
    ['at-fault-vllm', 'vllm'],
    ['at-fault-sglang', 'sglang'],
  ] as const)('%s: the flag at fault is drawn first, five flags of the tool are the options, and the report is the key flag\'s', (variant, tool) => {
    const counts = new Map<string, number>()
    for (const level of [2, 3] as const) {
      for (const seed of fixedSeeds(800, 0x5a1 + level)) {
        const item = whichFlag.make(seed, level, variant)
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        const fault = faultOf(item)
        expect(fault.tool).toBe(tool)
        expect(item.answer.correct).toBe(fault.id)
        expect(item.givens).toEqual(fault.report(numsOf(item)))
        expect(item.answer.options).toHaveLength(5)
        const ids = item.answer.options.map((option) => option.id)
        expect(new Set(ids).size).toBe(5)
        for (const id of ids) expect(FAULTS[tool].map((candidate) => candidate.id)).toContain(id)
        if (level === 2) counts.set(fault.id, (counts.get(fault.id) ?? 0) + 1)
      }
    }
    // Drawn flag first: each of the tool's flags is the key on about an eighth of the seeds (800 of them: at least half of that).
    expect([...counts.keys()].sort()).toEqual(FAULTS[tool].map((fault) => fault.id).sort())
    for (const fault of FAULTS[tool]) expect(counts.get(fault.id) ?? 0).toBeGreaterThan(800 / FAULTS[tool].length / 2)
  })

  test('every flag of the tool is an option in some item, and every option says why, in words that name what the flag does', () => {
    for (const tool of ['vllm', 'sglang'] as const) {
      const seen = new Set<string>()
      for (const seed of SEEDS) {
        const item = whichFlag.make(seed, 2, tool === 'vllm' ? 'at-fault-vllm' : 'at-fault-sglang')
        if (item.answer.kind !== 'choice') throw new Error('a choice')
        for (const option of item.answer.options) {
          seen.add(option.id)
          expect(plain(option.why).length).toBeGreaterThan(60)
          if (option.id === item.answer.correct) {
            expect(option.miss).toBeUndefined()
          } else {
            expect(option.miss).toBe(`tr8.which-flag.${option.id}-taken-for`)
            // A flag that is not the cause says what it does, and what a fault in it would show.
            expect(plain(option.why)).toContain('A fault in it shows as')
            expect(plain(option.why)).toContain('which is not what this report shows')
          }
        }
      }
      expect([...seen].sort()).toEqual(FAULTS[tool].map((fault) => fault.id).sort())
    }
  })

  test('the options of level 2 are the flags, and those of level 3 are the changes that mend them', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const two = whichFlag.make(seed, 2, 'at-fault-vllm')
      const three = whichFlag.make(seed, 3, 'at-fault-vllm')
      if (two.answer.kind !== 'choice' || three.answer.kind !== 'choice') throw new Error('choices')
      for (const option of two.answer.options) expect(option.text).toEqual([{ t: 'code', code: `--${option.id}` }])
      for (const option of three.answer.options) {
        const fault = VLLM_FAULTS.find((candidate) => candidate.id === option.id)
        expect(option.text).toEqual(fault?.fix)
      }
      expect(plain(three.stem)).toContain('Which change to the command mends it?')
    }
  })

  test('the solution reads the report, gives the cause, and gives the change', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const item = whichFlag.make(seed, 2, 'at-fault-sglang')
      const fault = faultOf(item)
      const steps = whichFlag.solution(item)
      expect(steps).toHaveLength(3)
      expect(plain(steps[0].text)).toContain(plain(fault.marks))
      expect(steps[1].text).toEqual(fault.cause(numsOf(item)))
      expect(plain(steps[2].text)).toContain(plain(fault.fix))
    }
  })

  test('a cap\'s report has the rate asked for above the rate sent, and the cause shows the permits over the time', () => {
    for (const tool of ['vllm', 'sglang'] as const) {
      const fault = FAULTS[tool].find((candidate) => candidate.id === 'max-concurrency')
      if (fault === undefined) throw new Error('the cap')
      const item = SEEDS.map((seed) => whichFlag.make(seed, 2, tool === 'vllm' ? 'at-fault-vllm' : 'at-fault-sglang')).find((candidate) => candidate.params['key'] === 'max-concurrency')
      if (item === undefined) throw new Error('a cap item')
      const n = printed(item)
      expect(n['request rate asked for']).toBeGreaterThan(n['request rate the run sent'])
      // The rate sent is the cap over the time the server takes, which the cause shows.
      const sent = sentRate({ rate: Number(item.params['rate']), cap: Number(item.params['cap']), latencyMs: Number(item.params['latencyMs']) })
      expect(n['request rate the run sent']).toBe(sent)
      expect(item.givens.some((given) => given.label === 'the wait before a request is sent')).toBe(tool === 'sglang')
    }
  })
})

describe('default-does', () => {
  test('is a level 3 variant: a flag is left out, and the options are what five flags of the tool do when they are', () => {
    const tools = new Set<string>()
    const keys = new Map<string, number>()
    for (const seed of fixedSeeds(800, 0xdef)) {
      const item = whichFlag.make(seed, 3, 'default-does')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const tool = item.params['tool'] as ToolId
      tools.add(tool)
      const fault = faultOf(item)
      expect(plain(item.stem)).toContain(fault.flag)
      expect(item.answer.correct).toBe(fault.id)
      expect(item.givens).toEqual([])
      expect(item.answer.options).toHaveLength(5)
      for (const option of item.answer.options) {
        const candidate = FAULTS[tool].find((entry) => entry.id === option.id)
        expect(option.text).toEqual(candidate?.ifLeftOut)
        expect(plain(option.why)).toContain(candidate?.flag ?? '?')
        if (option.id !== fault.id) expect(plain(option.why)).toContain(`That is what leaving out ${candidate?.flag} does.`)
      }
      keys.set(`${tool}/${fault.id}`, (keys.get(`${tool}/${fault.id}`) ?? 0) + 1)
    }
    expect([...tools].sort()).toEqual(['sglang', 'vllm'])
    // Every flag with a default to state is the key somewhere: eight of vLLM's nine and seven of SGLang's eight.
    expect(keys.size).toBe(8 + 7)
  })

  test('is offered at level 3 alone, and the lesson\'s ticket is not drawn from it', () => {
    for (const level of [0, 1, 2] as const) expect(offeredAt(whichFlag, level).map((variant) => variant.id)).not.toContain('default-does')
    expect(whichFlag.variants.find((variant) => variant.id === 'default-does')?.levels).toEqual([3])
  })
})

describe('send-rate', () => {
  test.each([0, 1, 2] as const)('at level %p the key is the permits over the time the server takes, from the figures the ticket prints', (level) => {
    for (const seed of SEEDS) {
      const item = whichFlag.make(seed, level, 'send-rate')
      const n = printed(item)
      const asked = n['request rate asked for (--request-rate)']
      const cap = n['requests in flight at most (--max-concurrency)']
      const time = n['time the server takes to answer a request']
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      expect(item.answer.unit).toBe('req/s')
      expect(Math.abs(item.answer.truth - cap / time)).toBeLessThanOrEqual(0.006 * (cap / time))
      // The cap binds: the run sends from a quarter to four fifths of the rate asked for, so the rate asked for is not the answer.
      expect(item.answer.truth).toBeLessThan(0.81 * asked)
      expect(item.answer.truth).toBeGreaterThan(0.249 * asked)
    }
  })

  test('at level 3 the rate sent is given, and the key is the cap', () => {
    for (const seed of SEEDS) {
      const item = whichFlag.make(seed, 3, 'send-rate')
      const n = printed(item)
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      const { truth, unit } = item.answer
      expect(unit).toBe('requests')
      expect(Number.isInteger(truth)).toBe(true)
      expect(Math.abs(n['request rate the run sent'] * n['time the server takes to answer a request'] - truth)).toBeLessThanOrEqual(0.006 * truth)
      expect(CAPS.some((scene) => scene.cap === truth)).toBe(true)
    }
  })

  test('names a wrong number: the rate asked for, the permits times the time, the permits alone', () => {
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = whichFlag.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    const item = whichFlag.make(SEEDS[2], 2, 'send-rate')
    const n = printed(item)
    const [asked, cap, time] = [n['request rate asked for (--request-rate)'], n['requests in flight at most (--max-concurrency)'], n['time the server takes to answer a request']]
    expect(diagnose(item, cap / time)).toBe('right')
    expect(diagnose(item, asked)).toBe('tr8.which-flag.rate-asked')
    expect(diagnose(item, cap * time)).toBe('tr8.which-flag.multiplied')
    expect(diagnose(item, cap)).toBe('tr8.which-flag.permits-as-rate')
    expect(diagnose(item, 98765.4)).toBeUndefined()
    const inverse = whichFlag.make(SEEDS[2], 3, 'send-rate')
    const m = printed(inverse)
    expect(diagnose(inverse, m['request rate the run sent'])).toBe('tr8.which-flag.rate-for-cap')
    expect(diagnose(inverse, m['request rate asked for (--request-rate)'] * m['time the server takes to answer a request'])).toBe('tr8.which-flag.asked-rate')
  })

  test('names the lesson\'s prediction in its first step: a cap is Little\'s law written as a flag', () => {
    const item = whichFlag.make(SEEDS[4], 2, 'send-rate')
    expect(plain(whichFlag.solution(item)[0].text)).toContain('Little\'s law')
  })
})

describe('worked examples', () => {
  test('level 0 shows a whole solution with other numbers, level 1 only the first step in words, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['at-fault-vllm', 'at-fault-sglang', 'send-rate'] as const) {
        const zero = whichFlag.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(2)
        const own = whichFlag.solution(zero).map((step) => plain(step.text)).join('|')
        expect(zero.worked.map((step) => plain(step.text)).join('|')).not.toBe(own)
        const one = whichFlag.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(whichFlag.make(seed, 2, variant).worked).toEqual([])
        expect(whichFlag.make(seed, 3, variant).worked).toEqual([])
      }
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts every candidate at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(whichFlag, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(60, 4)) {
      const { seed } = drawInBand(whichFlag, level, entropy)
      expect(whichFlag.band(seed, level)).toBe(true)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(whichFlag, level, bandedSeeds(whichFlag, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) {
        if (row.kind === 'numeric') expect(row.rate).toBeLessThanOrEqual(0.15)
        else expect(row.rate).toBeLessThanOrEqual(row.bound)
      }
    }
  })

  test('an attempt at it is a fresh draw: another entropy, other seeds, other numbers', () => {
    const one = startAttempt(whichFlag, 2, fixedSeeds(3, 11))
    const two = startAttempt(whichFlag, 2, fixedSeeds(3, 12))
    expect(one.served.map((served) => served.seed)).not.toEqual(two.served.map((served) => served.seed))
    expect(one.served.map((served) => served.item.rev)).not.toEqual(two.served.map((served) => served.item.rev))
  })
})

describe('a response of the wrong kind or an answer nobody could mean', () => {
  test('is wrong, and never throws', () => {
    const numeric = whichFlag.make(SEEDS[2], 2, 'send-rate')
    const choice = whichFlag.make(SEEDS[2], 2, 'at-fault-vllm')
    const responses: Response[] = [
      { kind: 'choice', pick: 'no-such-flag' },
      { kind: 'numeric', value: Number.NaN },
      { kind: 'numeric', value: Number.POSITIVE_INFINITY },
      { kind: 'numeric', value: -5 },
      { kind: 'choice', pick: '' },
    ]
    for (const response of responses) {
      expect(whichFlag.grade(numeric, response).ok).toBe(false)
      expect(whichFlag.grade(choice, response).ok).toBe(false)
    }
  })
})
