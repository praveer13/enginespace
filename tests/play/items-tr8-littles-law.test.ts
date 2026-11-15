/*
 * W1b-T06: `tr8.littles-law`. The tests re-derive each key from the numbers that the ticket prints, hold the family's law to the benchmark
 * generator's own (`littlesLaw`, packages/sim/bench/stats.ts) on logs built by hand and on runs of the corpus server, check that the two ways a
 * log fails fail in the direction the family says they do, and hold the family to the framework's rules: deterministic, in band, graded,
 * explained, and not passed by a habit.
 */
import { describe, expect, setDefaultTimeout, test } from 'bun:test'
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
import type { Item, Level, Response } from '@es/play/items'
import { CHECK_FLOWS, FLOWS, littlesLaw, littlesModel, TOLERANCE_PERMILLE, VERDICTS } from '@es/play/items/families/tr8/littles-law'
import type { Flow } from '@es/play/items/families/tr8/littles-law'
import { littlesLaw as simLittlesLaw, runBench } from '../../packages/sim/bench'
import type { BenchRow, BenchSpec } from '../../packages/sim/bench'
import { CORPUS_SERVER, CORPUS_SLO, lengthsOf, SEC } from '../../packages/sim/bench/broken-model'
import { itemProblems } from '../../scripts/verify-items.ts'
import { capacity, goodputDemo, TRAFFIC } from '../content/tr8-demos.ts'
import { keyOf, wrongOf } from './items-support.ts'
import { claim, KC_IDS, printed } from './items-tr6-support.ts'

// Measuring a family on a thousand banded seeds at each level takes a second or two, and several on a loaded host.
setDefaultTimeout(120_000)

const SEEDS = fixedSeeds(300, 0x11a3)

/** The log of `ratePerS` requests a second, each answered in exactly `latencyMs` after its send: a steady stretch by construction. */
function steadyRows(flow: Flow, seconds: number): BenchRow[] {
  const rows: BenchRow[] = []
  for (let i = 0; i < flow.ratePerS * seconds; i += 1) {
    const sent = Math.round((i * 1_000_000) / flow.ratePerS)
    rows.push({ id: i, client: null, dueUs: sent, sentUs: sent, firstUs: sent + 1, doneUs: sent + flow.latencyMs * 1000, promptTokens: 1, outputTokens: 2 })
  }
  return rows
}

/** The figures of a stretch of the generator's `littlesLaw`, as the family writes them: hundredths of a request. */
const hundredths = (milli: number): number => Math.round(milli / 10)

describe('the family', () => {
  test('is registered, names the KC of the graph, and offers its variants at the levels it says', () => {
    expect(familyById('tr8.littles-law')).toBe(littlesLaw)
    expect(FAMILIES).toContain(littlesLaw)
    expect(familiesForKc('tr8.littles-law')).toEqual([littlesLaw])
    for (const kc of littlesLaw.kcs) expect(KC_IDS.has(kc)).toBe(true)
    for (const variant of littlesLaw.variants) for (const kc of variant.kcs) expect(littlesLaw.kcs).toContain(kc)
    for (const level of LEVELS) expect(offeredAt(littlesLaw, level).map((variant) => variant.id)).toEqual(['in-flight', 'solve-for', 'check'])
  })

  test('rests on the claim of the law: the long-term average number in the system is the arrival rate times the average time each spends in it', () => {
    const text = claim('bench.littles-law').text
    for (const fact of ['long-term average number of customers', 'average arrival rate times', 'mean concurrency equals throughput times mean latency']) expect(text).toContain(fact)
  })

  test('draws its flows from pairs whose number in flight is from 2 to 240 requests, and its checks from those of 10 or more', () => {
    expect(FLOWS.length).toBeGreaterThan(100)
    for (const flow of FLOWS) {
      const inFlight = littlesModel.inFlight(flow.ratePerS, flow.latencyMs)
      expect(inFlight).toBeGreaterThanOrEqual(2)
      expect(inFlight).toBeLessThanOrEqual(240)
      // Neither number is the answer to read off: a latency of one second would make the answer the rate.
      expect(flow.latencyMs).not.toBe(1000)
    }
    for (const flow of CHECK_FLOWS) expect(littlesModel.inFlight(flow.ratePerS, flow.latencyMs)).toBeGreaterThanOrEqual(10)
  })
})

describe('the law, held to the benchmark generator', () => {
  test('on a steady stretch the generator\'s mean number in flight is rate × latency, and its residual is under the 2% that W1-T31 holds a stable run to', () => {
    const picks = FLOWS.filter((_, at) => at % 17 === 0)
    expect(picks.length).toBeGreaterThanOrEqual(6)
    for (const flow of picks) {
      // A stretch that is long against the latency, and starts after the first requests have filled the pipe.
      const fromUs = 2 * flow.latencyMs * 1000
      const toUs = fromUs + Math.max(60 * SEC, 30 * flow.latencyMs * 1000)
      const rows = steadyRows(flow, Math.ceil(toUs / SEC) + 10)
      const law = simLittlesLaw(rows, { fromUs, toUs }, 'sent')
      const expected = littlesModel.inFlight(flow.ratePerS, flow.latencyMs)
      expect([flow, Math.abs(law.meanInFlightMilli / 1000 - expected) <= 0.01 * expected]).toEqual([flow, true])
      expect([flow, Math.abs(law.expectedInFlightMilli / 1000 - expected) <= 0.01 * expected]).toEqual([flow, true])
      expect([flow, law.residualPermille <= 20]).toEqual([flow, true])
      expect(law.throughputPerSMilli / 1000).toBeCloseTo(flow.ratePerS, 1)
      expect(law.meanLatencyUs).toBe(flow.latencyMs * 1000)
    }
  })

  test('the residual and the verdict are the generator\'s: the corpus server at four loads, from the lesson\'s own table', () => {
    const cells = goodputDemo()
    expect(cells.map((cell) => cell.loadTenths)).toEqual([5, 10, 20, 30])
    const verdicts = cells.map((cell) => {
      const inFlight100 = Math.round(cell.inFlight * 100)
      const expected100 = Math.round(cell.lambdaW * 100)
      // The family's residual, from figures rounded to hundredths, is the generator's to within a part in a thousand or two.
      expect(Math.abs(littlesModel.residualPermille(inFlight100, expected100) - cell.residualPermille)).toBeLessThanOrEqual(2)
      return littlesModel.verdict(inFlight100, expected100)
    })
    // Below capacity and at it the log agrees with itself; past it the queue is still growing when the stretch ends, and more requests are in flight than λW.
    expect(verdicts).toEqual(['agrees', 'agrees', 'more-in-flight', 'more-in-flight'])
    expect(cells.map((cell) => cell.residualPermille <= TOLERANCE_PERMILLE)).toEqual([true, true, false, false])
  })

  test('a stretch that begins on a backlog that is draining has fewer requests in flight than λW', () => {
    // A burst of requests at time zero: the server works through them, and a stretch that begins after it has started to drain holds requests that were sent before it.
    const spec: BenchSpec = { arrivals: { kind: 'burst' }, lengths: lengthsOf(TRAFFIC), requests: 600, warmupUs: 0, durationUs: 1, slo: CORPUS_SLO }
    const run = runBench(3, spec, CORPUS_SERVER)
    const fromUs = Math.round(run.endUs * 0.4)
    const law = simLittlesLaw(run.rows, { fromUs, toUs: run.endUs + 1 }, 'sent')
    expect(littlesModel.verdict(hundredths(law.meanInFlightMilli), hundredths(law.expectedInFlightMilli))).toBe('fewer-in-flight')
    expect(law.expectedInFlightMilli).toBeGreaterThan(law.meanInFlightMilli)
  })

  test('a latency counted from the due time against a count in flight from the send has fewer in flight than λW, when a cap holds requests back', () => {
    const rate = Math.round(capacity() * 0.5)
    const durationUs = 60 * SEC
    const spec: BenchSpec = {
      arrivals: { kind: 'closed', clients: 6, thinkUs: 0, schedule: { kind: 'poisson', ratePerSMilli: rate } },
      lengths: lengthsOf(TRAFFIC),
      requests: Math.round((rate * 60) / 1000),
      warmupUs: 0,
      durationUs,
      slo: CORPUS_SLO,
    }
    const run = runBench(5, spec, CORPUS_SERVER)
    expect(run.rows.some((row) => row.sentUs > row.dueUs)).toBe(true)
    const window = { fromUs: 0, toUs: run.endUs + 1 }
    const fromSend = simLittlesLaw(run.rows, window, 'sent')
    const fromDue = simLittlesLaw(run.rows, window, 'due')
    // Both start from the send: the identity holds over the whole run, where nothing straddles the edges.
    expect(fromSend.residualPermille).toBeLessThanOrEqual(TOLERANCE_PERMILLE)
    // The throughput and the in-flight count are the send's, and the latency is the due time's: λW_due against L_sent.
    const verdict = littlesModel.verdict(hundredths(fromSend.meanInFlightMilli), hundredths(fromDue.expectedInFlightMilli))
    expect(verdict).toBe('fewer-in-flight')
  })
})

describe('every item', () => {
  test.each(LEVELS)('at level %p is deterministic, well formed and graded as the key says', (level) => {
    for (const seed of SEEDS) {
      for (const variant of offeredAt(littlesLaw, level)) {
        const item = littlesLaw.make(seed, level, variant.id)
        expect(littlesLaw.make(seed, level, variant.id)).toEqual(item)
        expect(itemProblems(littlesLaw, item, { seed, level, variant: variant.id })).toEqual([])
        expect(littlesLaw.grade(item, keyOf(item)).ok).toBe(true)
        expect(littlesLaw.grade(item, wrongOf(item)).ok).toBe(false)
      }
    }
  })

  test('without a variant named, the seed chooses one the level offers', () => {
    for (const level of LEVELS) {
      expect(new Set(SEEDS.map((seed) => littlesLaw.make(seed, level).variant))).toEqual(new Set(offeredAt(littlesLaw, level).map((variant) => variant.id)))
    }
  })

  test('prints every scenario number tagged synthetic, and no digit in a sentence', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const level of LEVELS) {
        const item = littlesLaw.make(seed, level)
        for (const given of item.givens) if (given.value.t === 'num') expect(given.value.tag).toBe('synthetic')
        const sentences = [item.stem, ...item.worked.map((step) => step.text), ...littlesLaw.solution(item).map((step) => step.text)]
        for (const parts of sentences) for (const part of parts) if (part.t === 'text') expect(part.text).not.toMatch(/\d/)
      }
    }
  })
})

describe('in-flight: the key is rate × latency, from the figures the ticket prints', () => {
  const rateOf = (item: Item): number => printed(item)['throughput']
  const latencyOf = (item: Item): number => printed(item)['mean latency']

  test.each([0, 1, 2] as const)('at level %p it is the printed rate times the printed latency in seconds', (level) => {
    for (const seed of SEEDS) {
      const item = littlesLaw.make(seed, level, 'in-flight')
      expect(item.answer).toMatchObject({ kind: 'numeric', unit: 'requests' })
      expect(item.answer.kind === 'numeric' && item.answer.truth).toBeCloseTo(rateOf(item) * latencyOf(item), 9)
      expect(printed(item)['mean latency']).not.toBe(1)
    }
  })

  test('at level 3 the log is in totals: the requests that finished over the stretch, times the latency in milliseconds over a thousand', () => {
    for (const seed of SEEDS) {
      const item = littlesLaw.make(seed, 3, 'in-flight')
      const n = printed(item)
      const rate = n['requests that finished in the stretch'] / n['the stretch']
      expect(Number.isInteger(rate)).toBe(true)
      expect(item.answer.kind === 'numeric' && item.answer.truth).toBeCloseTo((rate * n['mean latency']) / 1000, 9)
    }
  })

  test('names a wrong number that a rule recognises, in words that say what was done', () => {
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = littlesLaw.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    const item = littlesLaw.make(SEEDS[3], 2, 'in-flight')
    const [rate, latency] = [rateOf(item), latencyOf(item)]
    expect(diagnose(item, rate * latency)).toBe('right')
    expect(diagnose(item, rate + latency)).toBe('tr8.littles-law.added')
    expect(diagnose(item, rate / latency)).toBe('tr8.littles-law.divided')
    expect(diagnose(item, rate * latency * 1000)).toBe('tr8.littles-law.milliseconds-as-seconds')
    expect(diagnose(item, 123456.789)).toBeUndefined()
    const totals = littlesLaw.make(SEEDS[3], 3, 'in-flight')
    const n = printed(totals)
    const forgot = (n['requests that finished in the stretch'] * n['mean latency']) / 1000
    expect(diagnose(totals, forgot)).toBe('tr8.littles-law.forgot-the-stretch')
    expect(diagnose(totals, (n['requests that finished in the stretch'] * n['mean latency']) / n['the stretch'])).toBe('tr8.littles-law.milliseconds-as-seconds')
  })
})

describe('solve-for: the unknown is the latency or the rate, from the other two and the number in flight', () => {
  test('either unknown comes up, and each key makes rate × latency the number in flight that the ticket prints', () => {
    const unknowns = new Set<string>()
    for (const level of [0, 1, 2] as const) {
      for (const seed of SEEDS) {
        const item = littlesLaw.make(seed, level, 'solve-for')
        const n = printed(item)
        if (item.answer.kind !== 'numeric') throw new Error('numeric')
        unknowns.add(item.answer.label)
        if (item.answer.label === 'mean latency') expect(n['throughput'] * item.answer.truth).toBeCloseTo(n['requests in flight, on average'], 9)
        else expect(item.answer.truth * n['mean latency']).toBeCloseTo(n['requests in flight, on average'], 9)
      }
    }
    expect([...unknowns].sort()).toEqual(['mean latency', 'throughput'])
  })

  test('the model\'s inverse forms give the keys: the latency is the number in flight over the rate, and the rate is the number in flight over the latency', () => {
    for (const flow of FLOWS) {
      const inFlight = littlesModel.inFlight(flow.ratePerS, flow.latencyMs)
      expect(littlesModel.latencyMs(inFlight, flow.ratePerS)).toBeCloseTo(flow.latencyMs, 6)
      expect(littlesModel.ratePerS(inFlight, flow.latencyMs)).toBeCloseTo(flow.ratePerS, 6)
    }
    for (const seed of SEEDS) {
      const item = littlesLaw.make(seed, 2, 'solve-for')
      const n = printed(item)
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      const inFlight = n['requests in flight, on average']
      const model = item.answer.label === 'mean latency' ? littlesModel.latencyMs(inFlight, n['throughput']) / 1000 : littlesModel.ratePerS(inFlight, n['mean latency'] * 1000)
      expect(item.answer.truth).toBeCloseTo(model, 9)
    }
  })

  test('at level 3 the log is in totals, and the key is in milliseconds or in requests', () => {
    const labels = new Set<string>()
    for (const seed of SEEDS) {
      const item = littlesLaw.make(seed, 3, 'solve-for')
      if (item.answer.kind !== 'numeric') throw new Error('numeric')
      labels.add(`${item.answer.label} in ${item.answer.unit}`)
      const n = printed(item)
      const inFlight = n['requests in flight, on average']
      if (item.answer.label === 'mean latency') {
        // The rate is the completions over the stretch; the latency is the number in flight over it.
        expect(item.answer.unit).toBe('ms')
        expect((inFlight * 1000) / (n['requests that finished in the stretch'] / n['the stretch'])).toBeCloseTo(item.answer.truth, 6)
      } else {
        expect(item.answer.unit).toBe('requests')
        expect(((inFlight * 1000) / n['mean latency']) * n['the stretch']).toBeCloseTo(item.answer.truth, 6)
      }
    }
    expect([...labels].sort()).toEqual(['mean latency in ms', 'requests that finished in requests'])
  })

  test('names a wrong number: multiplied, or upside down', () => {
    const diagnose = (item: Item, value: number): string | undefined => {
      const graded = littlesLaw.grade(item, { kind: 'numeric', value })
      return graded.ok ? 'right' : graded.diagnosis?.id
    }
    const latencyItem = SEEDS.map((seed) => littlesLaw.make(seed, 2, 'solve-for')).find((item) => item.answer.kind === 'numeric' && item.answer.label === 'mean latency')
    const rateItem = SEEDS.map((seed) => littlesLaw.make(seed, 2, 'solve-for')).find((item) => item.answer.kind === 'numeric' && item.answer.label === 'throughput')
    if (latencyItem === undefined || rateItem === undefined) throw new Error('both unknowns')
    const l = printed(latencyItem)
    expect(diagnose(latencyItem, l['throughput'] * l['requests in flight, on average'])).toBe('tr8.littles-law.multiplied')
    expect(diagnose(latencyItem, l['throughput'] / l['requests in flight, on average'])).toBe('tr8.littles-law.upside-down')
    const r = printed(rateItem)
    expect(diagnose(rateItem, r['mean latency'] * r['requests in flight, on average'])).toBe('tr8.littles-law.multiplied')
    expect(diagnose(rateItem, r['mean latency'] / r['requests in flight, on average'])).toBe('tr8.littles-law.upside-down')
  })
})

describe('check: the verdict on a log', () => {
  /** The figures a check prints: the rate and the latency (or the totals), and the log\'s own count, in hundredths of a request. */
  function figures(item: Item): { expected100: number; counted100: number } {
    const n = printed(item)
    const rate = item.level === 3 ? n['requests that finished in the stretch'] / n['the stretch'] : n['throughput']
    const latencyS = item.level === 3 ? n['mean latency'] / 1000 : n['mean latency']
    return { expected100: Math.round(rate * latencyS * 100), counted100: Math.round(n['requests in flight, as the log counts them'] * 100) }
  }

  test.each(LEVELS)('at level %p the key is the verdict that the printed figures give, and each of the three is the key on about a third of the seeds', (level) => {
    const counts = new Map<string, number>()
    for (const seed of fixedSeeds(900, 0x3c0 + level)) {
      const item = littlesLaw.make(seed, level, 'check')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      const { expected100, counted100 } = figures(item)
      expect(item.answer.correct).toBe(littlesModel.verdict(counted100, expected100))
      expect(item.answer.options.map((option) => option.id).sort()).toEqual([...VERDICTS].sort())
      counts.set(item.answer.correct, (counts.get(item.answer.correct) ?? 0) + 1)
    }
    for (const verdict of VERDICTS) expect(counts.get(verdict) ?? 0).toBeGreaterThan(900 / 3 - 60)
  })

  test('is never close to the tolerance: a log that agrees is within 4% and one that fails is over 9%', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        const item = littlesLaw.make(seed, level, 'check')
        const { expected100, counted100 } = figures(item)
        const residual = littlesModel.residualPermille(counted100, expected100)
        if (item.answer.kind === 'choice' && item.answer.correct === 'agrees') expect(residual).toBeLessThanOrEqual(40)
        else expect(residual).toBeGreaterThanOrEqual(90)
      }
    }
  })

  test('a failing log says which way it fails, and a good one says why it is not a failure; every lure names the misconception it encodes', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const item = littlesLaw.make(seed, 2, 'check')
      if (item.answer.kind !== 'choice') throw new Error('a choice')
      for (const option of item.answer.options) {
        expect(plain(option.why).length).toBeGreaterThan(50)
        if (option.id === item.answer.correct) expect(option.miss).toBeUndefined()
        else expect(option.miss).toMatch(/^tr8\.littles-law\.(?:passes-a-failed-log|fails-a-good-log|reads-the-gap-backwards)$/)
        // The reasons carry the law's figure and the log\'s count, as tagged parts.
        expect(option.why.some((part) => part.t === 'num' && part.tag === 'derived')).toBe(true)
      }
      const solution = littlesLaw.solution(item).map((step) => plain(step.text)).join(' ')
      expect(solution).toContain('residual')
    }
  })

  test('the causes it gives for a failing log are the ones the generator\'s sums give, and it says that the check does not say which of the log and the run is at fault', () => {
    const more = SEEDS.map((seed) => littlesLaw.make(seed, 2, 'check')).find((item) => item.answer.kind === 'choice' && item.answer.correct === 'more-in-flight')
    const fewer = SEEDS.map((seed) => littlesLaw.make(seed, 2, 'check')).find((item) => item.answer.kind === 'choice' && item.answer.correct === 'fewer-in-flight')
    if (more === undefined || fewer === undefined) throw new Error('both failures')
    const words = (item: Item): string => littlesLaw.solution(item).map((step) => plain(step.text)).join(' ')
    expect(words(more)).toContain('still growing')
    expect(words(fewer)).toContain('backlog that is draining')
    expect(words(fewer)).toContain('due time')
    for (const item of [more, fewer]) {
      expect(words(item)).toContain('does not say which of the log and the run is at fault')
      expect(words(item)).toContain('should not be published yet')
    }
  })

  test('the figures never sit on the tolerance, whichever flow is drawn', () => {
    for (const flow of CHECK_FLOWS) {
      const expected100 = littlesModel.inFlight100(flow.ratePerS, flow.latencyMs)
      expect(expected100 % 1).toBe(0)
      expect(littlesModel.verdict(expected100, expected100)).toBe('agrees')
    }
  })
})

describe('worked examples', () => {
  test('level 0 shows a whole solution with other numbers, level 1 only the law in words, the rest nothing', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      for (const variant of ['in-flight', 'solve-for', 'check'] as const) {
        const zero = littlesLaw.make(seed, 0, variant)
        expect(zero.worked.length).toBeGreaterThanOrEqual(2)
        const own = littlesLaw.solution(zero).map((step) => plain(step.text)).join('|')
        expect(zero.worked.map((step) => plain(step.text)).join('|')).not.toBe(own)
        const one = littlesLaw.make(seed, 1, variant)
        expect(one.worked).toHaveLength(1)
        expect(one.worked[0].result).toBeUndefined()
        expect(one.worked[0].text.every((part) => part.t === 'text')).toBe(true)
        expect(littlesLaw.make(seed, 2, variant).worked).toEqual([])
        expect(littlesLaw.make(seed, 3, variant).worked).toEqual([])
      }
    }
  })
})

describe('the draws', () => {
  test.each(LEVELS)('the band accepts every candidate at level %p, and a draw is in band', (level) => {
    expect(bandAcceptance(littlesLaw, level).rate).toBeGreaterThan(BAND_FLOOR)
    for (const entropy of fixedSeeds(60, 4)) {
      const { seed } = drawInBand(littlesLaw, level, entropy)
      expect(littlesLaw.band(seed, level)).toBe(true)
    }
  })

  test('is not passed by a habit: the best blind strategy stays under its bound at every level', () => {
    for (const level of LEVELS) {
      const report = measureBlind(littlesLaw, level, bandedSeeds(littlesLaw, level, 1000))
      expect(report.over).toEqual([])
      for (const row of report.best) {
        if (row.kind === 'numeric') expect(row.rate).toBeLessThanOrEqual(0.15)
        else expect(row.rate).toBeLessThanOrEqual(row.bound)
      }
    }
  })

  test('an attempt at it is a fresh draw: another entropy, other seeds, other numbers', () => {
    const one = startAttempt(littlesLaw, 2, fixedSeeds(3, 11))
    const two = startAttempt(littlesLaw, 2, fixedSeeds(3, 12))
    expect(one.served.map((served) => served.seed)).not.toEqual(two.served.map((served) => served.seed))
    expect(one.served.map((served) => served.item.rev)).not.toEqual(two.served.map((served) => served.item.rev))
  })
})

describe('a response of the wrong kind or an answer nobody could mean', () => {
  test('is wrong, and never throws', () => {
    const numeric = littlesLaw.make(SEEDS[2], 2, 'in-flight')
    const choice = littlesLaw.make(SEEDS[2], 2, 'check')
    const responses: Response[] = [
      { kind: 'choice', pick: 'agrees' },
      { kind: 'numeric', value: Number.NaN },
      { kind: 'numeric', value: Number.POSITIVE_INFINITY },
      { kind: 'numeric', value: -5 },
      { kind: 'choice', pick: '' },
    ]
    for (const response of responses) {
      if (response.kind !== 'choice' || response.pick !== 'agrees') expect(littlesLaw.grade(choice, response).ok).toBe(false)
      expect(littlesLaw.grade(numeric, response).ok).toBe(false)
    }
    const levels: Level[] = [0, 1, 2, 3]
    expect(levels.every((level) => LEVELS.includes(level))).toBe(true)
  })
})
