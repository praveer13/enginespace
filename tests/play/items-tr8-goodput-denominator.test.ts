/*
 * W1b-T06: `tr8.goodput-denominator`. The tests re-derive each key from the numbers that the ticket prints, hold the family's two clocks to the
 * benchmark generator's own summary (`summarizeRows` divides the requests that met both objectives by the arrival window and by the time to
 * the last reply) and to the lesson's table of four loads, hold each tool's clock to the claim that says it, and hold the family to the
 * framework's rules: deterministic, in band, graded, explained, and not passed by a habit.
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
import { DIVISIONS, goodputDenominator, goodputModel, roundSig, TOOLS } from '@es/play/items/families/tr8/goodput-denominator'
import type { Clock, Division, Run } from '@es/play/items/families/tr8/goodput-denominator'
import { lockFileSchema } from '@es/schema/lock'
import { perSMilli, summarizeRows } from '../../packages/sim/bench'
import type { BenchRow } from '../../packages/sim/bench'
import { CORPUS_SLO } from '../../packages/sim/bench/broken-model'
import { untaggedNumbers } from '../../scripts/content/prose.ts'
import { itemProblems } from '../../scripts/verify-items.ts'
import { goodputDemo } from '../content/tr8-demos.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS, printed } from './items-tr6-support.ts'

// Measuring a family on a thousand banded seeds at each level takes a second or two, and several on a loaded host.
setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')
const SEEDS = fixedSeeds(400, 0x9d11)
const SEC = 1_000_000

/** The numbers a ticket prints about a run: its four givens, by label. */
function runOf(item: Item, unit: 'req/s' | 'req/min' = 'req/s'): Run {
  const n = printed(item)
  const scale = unit === 'req/min' && item.variant === 'which-clock' ? 60 : 1
  return {
    n: n['requests offered'],
    m: n['requests that met both objectives'],
    windowS: n['arrival window'] * scale,
    wholeS: n['first request to last reply'] * scale,
  }
}

const clockSeconds = (run: Run, clock: Clock): number => (clock === 'window' ? run.windowS : run.wholeS)

describe('the family', () => {
  test('is registered, names the KC of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr8.goodput-denominator')).toBe(goodputDenominator)
    expect(FAMILIES).toContain(goodputDenominator)
    expect(familiesForKc('tr8.goodput-denominator')).toEqual([goodputDenominator])
    for (const kc of goodputDenominator.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const variant of goodputDenominator.variants) for (const kc of variant.kcs) expect(goodputDenominator.kcs).toContain(kc)
    for (const level of LEVELS) expect(offeredAt(goodputDenominator, level).map((variant) => variant.id)).toEqual(['tool-prints', 'convert', 'which-clock'])
  })

  test('gives each tool the clock that its claim says: the whole run for vLLM and SGLang, the arrival window for the knee', () => {
    const lock = lockFileSchema.parse(JSON.parse(readFileSync(path.join(root, 'course.lock.json'), 'utf8')))
    const version = (key: string): string => lock.entries.find((entry) => entry.key === key)?.version ?? ''
    expect(TOOLS.map((tool) => [tool.id, tool.clock])).toEqual([
      ['vllm', 'whole'],
      ['sglang', 'whole'],
      ['knee', 'window'],
    ])
    const vllm = claim('vllm.bench.goodput-denominator')
    expect(vllm.text).toContain('divides the requests that met every objective by dur_s')
    expect(vllm.text).toContain('just before the first request is generated to just after the last request has returned')
    expect(vllm.text).toContain('counts that time in the denominator')
    const sglang = claim('sglang.bench.goodput-duration')
    expect(sglang.text).toContain('divides the requests that met every SLO by the duration of the whole run')
    expect(sglang.text).toContain('from the first send to the last completion')
    expect(claim('sglang.bench.goodput').text).toContain('counts toward bench_serving\'s goodput only if it succeeds and meets every given SLO')
    const knee = claim('bench.kernelspace.knee-goodput')
    expect(knee.text).toContain('the requests that met the SLO, wherever they finish')
    expect(knee.text).toContain('arrival window')
    expect(claim('bench.kernelspace.knee-fixed-window').text).toContain('a shorter denominator')
    // The pins in the stems are the lock file's.
    const stems = TOOLS.map((tool) => plain(tool.name))
    expect(stems[0]).toContain(`v${version('vllm')}`)
    expect(stems[1]).toContain(`v${version('sglang')}`)
    // Every claim a tool rests on exists, and a claim with a pin is the tool's.
    for (const tool of TOOLS) {
      for (const id of tool.claims) {
        const record = claim(id)
        expect([id, record.text.length > 0]).toEqual([id, true])
      }
    }
  })
})

describe('the two clocks, held to the benchmark generator', () => {
  /** The log of a run: `n` requests due evenly over the window, `m` of them (spread, by Bresenham) meeting both objectives, the last reply at `wholeS`. */
  function rowsOf(run: Run): BenchRow[] {
    const rows: BenchRow[] = []
    for (let i = 0; i < run.n; i += 1) {
      const due = Math.floor((i * run.windowS * SEC) / run.n)
      const meets = Math.floor(((i + 1) * run.m) / run.n) > Math.floor((i * run.m) / run.n)
      // A request that meets both objectives has a time to first token of 100 ms from its due time and a TPOT of 20 ms; one that misses has 700 ms to the first token.
      const first = due + (meets ? 100_000 : 700_000)
      rows.push({ id: i, client: null, dueUs: due, sentUs: due, firstUs: first, doneUs: first + 200_000, promptTokens: 100, outputTokens: 11 })
    }
    // The drain tail: the last reply comes at the end of the whole run. It is a reply of one token, which has no TPOT to miss, so it keeps the verdict it had.
    const last = rows[rows.length - 1]
    rows[rows.length - 1] = { ...last, doneUs: run.wholeS * SEC, outputTokens: 1 }
    return rows
  }

  test('the window\'s goodput and the whole run\'s are the generator\'s two divisions, for runs drawn by the family', () => {
    const seen = new Set<Clock>()
    for (const seed of SEEDS.slice(0, 120)) {
      const item = goodputDenominator.make(seed, 2, 'tool-prints')
      const run = runOf(item)
      const summary = summarizeRows(rowsOf(run), { warmupUs: 0, durationUs: run.windowS * SEC, slo: CORPUS_SLO }, { bootstrap: 0, seed: 1 })
      expect(summary.goodput.met).toBe(run.m)
      expect(summary.goodput.arrivalWindowPerSMilli).toBe(perSMilli(run.m, run.windowS * SEC))
      expect(summary.goodput.totalDurationPerSMilli).toBe(perSMilli(run.m, run.wholeS * SEC))
      expect(Math.abs(summary.goodput.arrivalWindowPerSMilli - goodputModel.window(run) * 1000)).toBeLessThanOrEqual(1)
      expect(Math.abs(summary.goodput.totalDurationPerSMilli - goodputModel.whole(run) * 1000)).toBeLessThanOrEqual(1)
      // The two goodputs are in the ratio of the clocks, and the tail is the whole run less the window.
      // (The generator rounds each goodput to a thousandth of a request a second, which is up to a percent and a half of a goodput of a twentieth.)
      const ratio = summary.goodput.arrivalWindowPerSMilli / summary.goodput.totalDurationPerSMilli
      expect(Math.abs(ratio - goodputModel.ratio(run)) / goodputModel.ratio(run)).toBeLessThan(0.02)
      expect(goodputModel.tail(run)).toBe(run.wholeS - run.windowS)
      seen.add(item.params['tool'] === 'knee' ? 'window' : 'whole')
    }
    expect([...seen].sort()).toEqual(['whole', 'window'])
  })

  test('the lesson\'s four loads: the window\'s goodput over the whole run\'s is the run\'s length over the window\'s', () => {
    for (const cell of goodputDemo()) {
      const ratio = cell.windowPerS / cell.wholePerS
      // The table writes its goodputs to two figures, so the ratio of the two is checked to a part in a hundred.
      expect(Math.abs(ratio - cell.endS / 60) / (cell.endS / 60)).toBeLessThan(0.02)
    }
  })

  test('the model\'s closed forms', () => {
    const run: Run = { n: 971, m: 835, windowS: 60, wholeS: 62.2 }
    expect(goodputModel.window(run)).toBeCloseTo(13.92, 2)
    expect(goodputModel.whole(run)).toBeCloseTo(13.42, 2)
    expect(roundSig(7.7459)).toBe(7.75)
    expect(roundSig(0.13905)).toBe(0.139)
    expect(roundSig(1234.56)).toBe(1235)
    expect(roundSig(13.4234)).toBe(13.4)
    expect(roundSig(13.4234, 4)).toBe(13.42)
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(goodputDenominator, level)) {
        const item = goodputDenominator.make(seed, level, variant.id)
        expect(goodputDenominator.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(goodputDenominator, item, { seed, level, variant: variant.id })).toEqual([])
        expect(goodputDenominator.grade(item, keyOf(item)).ok).toBe(true)
        expect(goodputDenominator.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('without a variant named, the seed chooses one the level offers', () => {
    for (const level of LEVELS) {
      expect(new Set(SEEDS.map((seed) => goodputDenominator.make(seed, level).variant))).toEqual(new Set(offeredAt(goodputDenominator, level).map((variant) => variant.id)))
    }
  })

  test('prints every scenario number tagged synthetic, and no digit in a sentence', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of LEVELS) {
        const item = goodputDenominator.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...goodputDenominator.solution(item).map((step) => step.text)]
        // An identifier such as v0.33.0 is not a number; a number is a tagged part.
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(untaggedNumbers(part.text)).toEqual([])
      }
    }
  })

  test('draws runs in which the drain tail is at least an eighth of the window, in whole seconds, and the share that met is between a twentieth and nine tenths', () => {
    for (const seed of SEEDS) {
      for (const level of [0, 2] as const) {
        const run = runOf(goodputDenominator.make(seed, level, 'tool-prints'))
        expect(run.wholeS * 8).toBeGreaterThanOrEqual(run.windowS * 9)
        expect(Number.isInteger(run.wholeS)).toBe(true)
        // The share is drawn in twentieths and rounded to whole requests, so it is out by less than one.
        expect((run.m + 1) * 20).toBeGreaterThan(run.n)
        expect((run.m - 1) * 10).toBeLessThan(run.n * 9)
      }
    }
  })
})

describe('tool-prints', () => {
  test.each([0, 1, 2] as const)('at level %p the key is the requests that met both objectives over the tool\'s clock, to three figures', (level) => {
    const tools = new Set<string>()
    for (const seed of SEEDS) {
      const item = goodputDenominator.make(seed, level, 'tool-prints')
      const run = runOf(item)
      const tool = TOOLS.find((candidate) => candidate.id === item.params['tool'])
      if (tool === undefined) throw new Error('a tool')
      tools.add(tool.id)
      expect(plain(item.stem)).toContain(plain(tool.name))
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'req/s', truth: roundSig(run.m / clockSeconds(run, tool.clock)) })
    }
    expect([...tools].sort()).toEqual(['knee', 'sglang', 'vllm'])
  })

  test('draws the clock first: half of the keys divide by the arrival window and half by the whole run, whichever tool names it', () => {
    let window = 0
    const total = 800
    for (const seed of fixedSeeds(total, 0xc10c)) {
      const item = goodputDenominator.make(seed, 2, 'tool-prints')
      if (item.params['tool'] === 'knee') window += 1
    }
    expect(window).toBeGreaterThan(total / 2 - 60)
    expect(window).toBeLessThan(total / 2 + 60)
  })

  test('at level 3 the tool\'s goodput is given, and the key is the requests that met both objectives', () => {
    for (const seed of SEEDS) {
      const item = goodputDenominator.make(seed, 3, 'tool-prints')
      const n = printed(item)
      const tool = TOOLS.find((candidate) => candidate.id === item.params['tool'])
      if (tool === undefined || item.answer.kind !== 'numeric') throw new Error('a tool')
      const clock = tool.clock === 'window' ? n['arrival window'] : n['first request to last reply']
      // The figure is written to three figures, so the requests it gives are the truth to within half a percent.
      expect(Math.abs(n['goodput given'] * clock - item.answer.truth)).toBeLessThanOrEqual(0.006 * item.answer.truth)
      expect(item.answer.unit).toBe('requests')
      expect(item.answer.truth).toBeLessThanOrEqual(n['requests offered'])
    }
  })

  test('names a wrong number that a rule recognises: the other clock, or every request', () => {
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = goodputDenominator.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    const item = SEEDS.map((seed) => goodputDenominator.make(seed, 2, 'tool-prints')).find((candidate) => candidate.params['tool'] === 'vllm')
    if (item === undefined) throw new Error('a vllm item')
    const run = runOf(item)
    expect(diagnose(item, roundSig(run.m / run.wholeS))).toBe('right')
    expect(diagnose(item, run.m / run.windowS)).toBe('tr8.goodput-denominator.wrong-clock')
    expect(diagnose(item, run.n / run.wholeS)).toBe('tr8.goodput-denominator.every-request')
    expect(diagnose(item, 98765.4)).toBeUndefined()
    const inverse = SEEDS.map((seed) => goodputDenominator.make(seed, 3, 'tool-prints')).find((candidate) => candidate.params['tool'] === 'vllm')
    if (inverse === undefined) throw new Error('a vllm inverse item')
    const m = inverse.answer.kind === 'numeric' ? inverse.answer.truth : 0
    const g = printed(inverse)['goodput given']
    expect(diagnose(inverse, g * printed(inverse)['arrival window'])).toBe('tr8.goodput-denominator.wrong-clock')
    expect(diagnose(inverse, printed(inverse)['requests offered'])).toBe('tr8.goodput-denominator.every-request')
    expect(diagnose(inverse, m)).toBe('right')
  })
})

describe('convert', () => {
  test.each([0, 1, 2] as const)('at level %p the key is the printed goodput scaled by the clocks, in the direction the stem asks', (level) => {
    const directions = new Set<string>()
    for (const seed of SEEDS) {
      const item = goodputDenominator.make(seed, level, 'convert')
      const n = printed(item)
      const from = item.params['from']
      directions.add(String(from))
      const reported = from === 'window' ? n['goodput over the arrival window'] : n['goodput over the whole run']
      const [fromS, toS] = from === 'window' ? [n['arrival window'], n['first request to last reply']] : [n['first request to last reply'], n['arrival window']]
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      expect(item.answer.truth).toBe(roundSig((reported * fromS) / toS))
      expect(item.answer.label).toBe(from === 'window' ? 'goodput over the whole run' : 'goodput over the arrival window')
      expect(plain(item.stem)).toContain(from === 'window' ? 'drain tail included' : 'drain tail left out')
    }
    expect([...directions].sort()).toEqual(['whole', 'window'])
  })

  test('the figure printed is the exact goodput of a run, so the key is the other clock\'s goodput to half a percent', () => {
    // The family draws the run from the item\'s params, and the printed goodput is that run\'s exact figure to three figures.
    for (const seed of SEEDS) {
      const item = goodputDenominator.make(seed, 2, 'convert')
      const run: Run = { n: Number(item.params['n']), m: Number(item.params['m']), windowS: Number(item.params['window']), wholeS: Number(item.params['whole']) }
      const from: Clock = item.params['from'] === 'window' ? 'window' : 'whole'
      const to: Clock = from === 'window' ? 'whole' : 'window'
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      const exact = goodputModel.of(run, to)
      // The figure printed is rounded to three figures, and the key to three more: each is out by at most half a percent.
      expect(Math.abs(item.answer.truth - exact)).toBeLessThanOrEqual(0.0101 * exact)
    }
  })

  test('at level 3 the key is the drain tail, from the two goodputs and the window', () => {
    for (const seed of SEEDS) {
      const item = goodputDenominator.make(seed, 3, 'convert')
      const n = printed(item)
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      const tail = n['arrival window'] * (n['goodput over the arrival window'] / n['goodput over the whole run'] - 1)
      // Four figures keep the tail within a percent of the one the run has.
      expect(Math.abs(tail - item.answer.truth)).toBeLessThanOrEqual(0.012 * item.answer.truth)
      expect(item.answer.unit).toBe('s')
      // The tail the learner works out is at least half the window, so that two goodputs of four figures can tell it.
      expect(item.answer.truth * 2).toBeGreaterThanOrEqual(n['arrival window'])
    }
  })

  test('names a wrong number: the same goodput back, the ratio upside down, the whole run for the tail', () => {
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = goodputDenominator.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    const item = goodputDenominator.make(SEEDS[1], 2, 'convert')
    const n = printed(item)
    const from = item.params['from']
    const reported = from === 'window' ? n['goodput over the arrival window'] : n['goodput over the whole run']
    const [fromS, toS] = from === 'window' ? [n['arrival window'], n['first request to last reply']] : [n['first request to last reply'], n['arrival window']]
    expect(diagnose(item, roundSig((reported * fromS) / toS))).toBe('right')
    expect(diagnose(item, reported)).toBe('tr8.goodput-denominator.same-goodput')
    expect(diagnose(item, (reported * toS) / fromS)).toBe('tr8.goodput-denominator.upside-down')
    const tail = goodputDenominator.make(SEEDS[1], 3, 'convert')
    const t = printed(tail)
    expect(diagnose(tail, t['arrival window'])).toBe('tr8.goodput-denominator.window-not-tail')
    expect(diagnose(tail, t['arrival window'] * (t['goodput over the arrival window'] / t['goodput over the whole run']))).toBe('tr8.goodput-denominator.whole-not-tail')
  })
})

describe('which-clock', () => {
  /** The figure each division gives for the printed run, in the unit of the goodput printed. */
  function figures(item: Item, perMinute: boolean): Record<Division, number> {
    const run = runOf(item, perMinute ? 'req/min' : 'req/s')
    const scale = perMinute ? 60 : 1
    return {
      'met-window': (run.m * scale) / run.windowS,
      'met-whole': (run.m * scale) / run.wholeS,
      'offered-window': (run.n * scale) / run.windowS,
      'offered-whole': (run.n * scale) / run.wholeS,
    }
  }

  test.each(LEVELS)('at level %p exactly one division gives the figure printed, the others are over a tenth away from it, and the key is that one', (level) => {
    const keys = new Map<string, number>()
    for (const seed of fixedSeeds(800, 0x44a + level)) {
      const item = goodputDenominator.make(seed, level, 'which-clock')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const given = printed(item)['goodput printed']
      const all = figures(item, level === 3)
      const near = DIVISIONS.filter((division) => Math.abs(all[division] - given) <= 0.006 * given)
      expect([seed, near]).toEqual([seed, [item.answer.correct]])
      for (const division of DIVISIONS) if (division !== item.answer.correct) expect(Math.abs(all[division] - given)).toBeGreaterThan(0.09 * given)
      expect(item.answer.options.map((option) => option.id).sort()).toEqual([...DIVISIONS].sort())
      keys.set(item.answer.correct, (keys.get(item.answer.correct) ?? 0) + 1)
    }
    // Drawn answer first: each of the four is the key on about a quarter of the seeds.
    for (const division of DIVISIONS) expect(keys.get(division) ?? 0).toBeGreaterThan(800 / 4 - 50)
  })

  test('level 3 writes the clocks in minutes, and the goodput per minute', () => {
    const item = goodputDenominator.make(SEEDS[0], 3, 'which-clock')
    expect(item.givens.map((given) => (given.value.t === 'num' ? given.value.unit : ''))).toEqual(['requests', 'requests', 'min', 'min', 'req/min'])
    const level2 = goodputDenominator.make(SEEDS[0], 2, 'which-clock')
    expect(level2.givens.map((given) => (given.value.t === 'num' ? given.value.unit : ''))).toEqual(['requests', 'requests', 's', 's', 'req/s'])
  })

  test('every option says why, with the figure it gives, and a lure names the misconception it encodes', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = goodputDenominator.make(seed, 2, 'which-clock')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(60)
        expect(option.why.some((part) => part.t === 'num' && part.tag === 'derived')).toBe(true)
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toBe(`tr8.goodput-denominator.${option.id}-taken-for`)
      }
      // A division of every request is a request rate, and the solution says so.
      const words = goodputDenominator.solution(item).map((step) => plain(step.text)).join(' ')
      if (item.answer.correct.startsWith('offered')) expect(words).toContain('not goodput')
    }
  })
})

describe('worked examples', () => {
  test('level 0 shows a whole solution with other numbers, level 1 only the first step in words, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['tool-prints', 'convert', 'which-clock'] as const) {
        const zero = goodputDenominator.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(2)
        const own = goodputDenominator.solution(zero).map((step) => plain(step.text)).join('|')
        expect(zero.worked.map((step) => plain(step.text)).join('|')).not.toBe(own)
        const one = goodputDenominator.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(one.worked[0].text.every((part) => part.t === 'text' || part.t === 'code')).toBe(true)
        expect(goodputDenominator.make(seed, 2, variant).worked).toEqual([])
        expect(goodputDenominator.make(seed, 3, variant).worked).toEqual([])
      }
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts every candidate at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(goodputDenominator, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(60, 4)) {
      const { seed } = drawInBand(goodputDenominator, level, entropy)
      expect(goodputDenominator.band(seed, level)).toBe(true)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(goodputDenominator, level, bandedSeeds(goodputDenominator, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) {
        if (row.kind === 'numeric') expect(row.rate).toBeLessThanOrEqual(0.15)
        else expect(row.rate).toBeLessThanOrEqual(row.bound)
      }
    }
  })

  test('an attempt at it is a fresh draw: another entropy, other seeds, other numbers', () => {
    const one = startAttempt(goodputDenominator, 2, fixedSeeds(3, 11))
    const two = startAttempt(goodputDenominator, 2, fixedSeeds(3, 12))
    expect(one.served.map((served) => served.seed)).not.toEqual(two.served.map((served) => served.seed))
    expect(one.served.map((served) => served.item.rev)).not.toEqual(two.served.map((served) => served.item.rev))
  })
})

describe('a response of the wrong kind or an answer nobody could mean', () => {
  test('is wrong, and never throws', () => {
    const numeric = goodputDenominator.make(SEEDS[2], 2, 'tool-prints')
    const choice = goodputDenominator.make(SEEDS[2], 2, 'which-clock')
    const responses: Response[] = [
      { kind: 'choice', pick: 'no-such-option' },
      { kind: 'numeric', value: Number.NaN },
      { kind: 'numeric', value: Number.POSITIVE_INFINITY },
      { kind: 'numeric', value: -5 },
      { kind: 'choice', pick: '' },
    ]
    for (const response of responses) {
      expect(goodputDenominator.grade(numeric, response).ok).toBe(false)
      expect(goodputDenominator.grade(choice, response).ok).toBe(false)
    }
  })
})
