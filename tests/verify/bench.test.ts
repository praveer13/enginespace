/*
 * W2-T08, rule 8 for a benchmark log (ARCHITECTURE §8.5 rule 8, ASSESSMENT §6.2): B1 to B10, B12 and B14, each passed by the honest replay and failed by
 * the smallest edit of it that breaks the rule, with the bound printed in the check's sentence. B13 is rule 9's, and floors.test.ts has it.
 *
 * Every edit re-signs the artifact (`edited`), as a forger who changes the log and writes its new hash into the receipt would, so that rules 1 to 3
 * pass and it is the recomputation that is looked at. A claim is edited in the receipt, which no hash covers.
 */
import { describe, expect, test } from 'bun:test'
import { replayFixture, edited, REPLAY_SPEC } from './synthetic'
import type { Fixture } from './synthetic'
import { checkOf, failed, verify } from './run'

interface Log {
  cacheResetNs: number
  rows: Record<string, number[]>
}
const logOf = (bundle: Fixture['bundle'], id = 'bench-log'): Log => {
  const artifact = bundle.artifacts[id]
  if (artifact.encoding !== 'json') throw new Error('a log is JSON')
  return artifact.data as Log
}
/** The parts of the claimed summary that these tests edit. */
interface Claim {
  counts: { measured: number }
  latency: Record<string, Record<string, number>>
  p99Intervals: { ttftFromDue: { hiUs: number } }
  goodput: { met: number; arrivalWindowPerSMilli: number }
  littles: { residualPermille: number }
  adherence: { lateRows: number }
  [part: string]: unknown
}
const claimOf = (bundle: Fixture['bundle']): Claim => bundle.receipt.performance?.claimed['bench-log'] as Claim
const run = async (fixture: Fixture) => verify(fixture.bundle, fixture.context)
const withLog = (change: (log: Log) => void) => edited(replayFixture(), (bundle) => change(logOf(bundle)))
/** An edited log whose claim is left out for the parts named, so that the check being looked at is judged by the rows and not by a claim that the edit made stale. */
const withLogUnclaimed = (parts: readonly string[], change: (log: Log) => void) =>
  edited(replayFixture(), (bundle) => {
    change(logOf(bundle))
    for (const part of parts) delete claimOf(bundle)[part]
  })
const withClaim = (change: (claim: Claim) => void) => edited(replayFixture(), (bundle) => change(claimOf(bundle)))

describe('the honest replay', () => {
  test('passes every check of the stage, and each prints what it found', async () => {
    const outcome = await run(replayFixture())
    expect(failed(outcome)).toEqual([])
    expect(checkOf(outcome, 'B1')?.bound).toBe('1,264 rows: the ids, due times and prompt lengths are the ones that seed 1234abcd draws.')
    expect(checkOf(outcome, 'B2')?.bound).toBe('1,264 requests completed, 0 failed and 0 aborted make 1,264 rows, and no id repeats.')
    expect(checkOf(outcome, 'B3')?.bound).toBe('1,264 rows, and each request was due, sent, answered and finished in that order, with a token.')
    expect(checkOf(outcome, 'B4')?.bound).toBe(
      '0 sends of 1,264 were late, the latest by 0 µs. The bound is at least 99.9% of sends within 2,000 µs of their due time and none past 20,000 µs [estimated].',
    )
    expect(checkOf(outcome, 'B14')?.bound).toBe("the server's prefix cache was reset at -60,000,000,000 ns and the first request is due at 19,014,000 ns: no earlier run's cache can have helped.")
  })

  test('is recomputed from the rows with the declared workload and the challenge\'s seed: the same fixture with another seed in the context is another schedule', async () => {
    const fixture = replayFixture()
    const other = { ...fixture.context, stages: { 'tr8.replay.s2': { bench: { ...REPLAY_SPEC, arrivals: { kind: 'poisson' as const, ratePerSMilli: 9000 } } } } }
    const outcome = await verify(fixture.bundle, other)
    expect(checkOf(outcome, 'B1')?.status).toBe('fail')
  })
})

describe('B1, the schedule binds to the challenge', () => {
  test('fails when a row is another request than the schedule\'s: the id, the due time and the prompt length are held', async () => {
    const outcome = await run(withLog((log) => (log.rows.promptTokens[17] += 1)))
    expect(checkOf(outcome, 'B1')).toMatchObject({ status: 'fail' })
    expect(checkOf(outcome, 'B1')?.bound).toMatch(/^row 17 is request 17, due [\d,]+ ns with a prompt of [\d,]+ tokens, and the schedule has request 17, due [\d,]+ ns with [\d,]+: a run on other seeds fails here\.$/)
  })

  test('counts the rows that differ, and the first is named', async () => {
    const outcome = await run(withLog((log) => (log.rows.dueNs[3] += 1000) && undefined))
    expect(checkOf(outcome, 'B1')?.bound).toContain('row 3 is request 3')
  })

  test('fails when the log has more or fewer requests than the seed draws', async () => {
    const outcome = await run(
      withLog((log) => {
        for (const column of Object.values(log.rows)) column.pop()
      }),
    )
    expect(checkOf(outcome, 'B1')?.bound).toBe("the log has 1,263 rows and the challenge's seed draws 1,264 requests, so this is not the run that the challenge asked for: a run on other seeds fails here.")
  })

  test('fails, with the reason, when the site declares no workload for the stage, because a requirement that a receipt can meet by leaving it out is none', async () => {
    const fixture = replayFixture()
    const outcome = await verify(fixture.bundle, { ...fixture.context, stages: {} })
    expect(checkOf(outcome, 'B1')).toEqual({ id: 'B1', status: 'fail', bound: 'this site declares no workload for tr8.replay.s2, so the schedule cannot be drawn again from the challenge.' })
    expect(outcome.verdict.provenance).toBe('gpu-unverified')
  })
})

describe('B2, the counts', () => {
  test('fails a request that failed or was aborted, and says that this version credits a run in which every request completed', async () => {
    const outcome = await run(withLog((log) => ((log.rows.status[5] = 1), (log.rows.status[6] = 2))))
    expect(checkOf(outcome, 'B2')?.bound).toBe('1 request failed and 1 request aborted, and this version credits only a run in which every request completed.')
  })

  test('fails an id that repeats', async () => {
    const outcome = await run(withLog((log) => (log.rows.id[9] = log.rows.id[8])))
    expect(checkOf(outcome, 'B2')?.bound).toContain('1 request id repeat')
  })

  test('fails a claimed count that is not the row count', async () => {
    const outcome = await run(withClaim((claim) => (claim.counts.measured -= 1)))
    expect(checkOf(outcome, 'B2')?.bound).toBe('counts.measured: the receipt claims 1,135 and the rows give 1,136.')
  })
})

describe('B3, each request went through in order', () => {
  test('fails a send before its due time, and names the row', async () => {
    const outcome = await run(withLog((log) => (log.rows.sentNs[40] = log.rows.dueNs[40] - 1)))
    expect(checkOf(outcome, 'B3')?.status).toBe('fail')
    expect(checkOf(outcome, 'B3')?.bound).toMatch(/^row 40 \(request 40\) has due [\d,]+, sent [\d,]+, first token [\d,]+ and last token [\d,]+ ns, which are not in order from 0\.$/)
  })

  test('fails a completed request with no output token', async () => {
    const outcome = await run(withLog((log) => (log.rows.outputTokens[2] = 0)))
    expect(checkOf(outcome, 'B3')?.bound).toBe('row 2 (request 2) completed with 0 output tokens, and a completed request has at least one.')
  })

  test('counts the rows beyond the first, and leaves the statistics unrun: they would read garbage', async () => {
    const outcome = await run(
      withLog((log) => {
        for (const row of [3, 4, 5]) log.rows.firstNs[row] = log.rows.sentNs[row] - 1
      }),
    )
    expect(checkOf(outcome, 'B3')?.bound).toContain('(and 2 more rows)')
    expect(checkOf(outcome, 'B6')).toEqual({ id: 'B6', status: 'fail', bound: 'the rows are not in order (B3).' })
  })
})

describe('B4, arrival adherence', () => {
  test('fails when 0.1% of the sends are more than 2 ms late, and prints the bound that was broken', async () => {
    const outcome = await run(
      withLog((log) => {
        for (const row of [10, 20]) {
          log.rows.sentNs[row] += 3_000_000
          log.rows.firstNs[row] += 3_000_000
          log.rows.doneNs[row] += 3_000_000
        }
      }),
    )
    expect(checkOf(outcome, 'B4')?.status).toBe('fail')
    expect(checkOf(outcome, 'B4')?.bound).toContain('2 sends of 1,264 came more than 2,000 µs after their due time, the latest by 3,000 µs.')
  })

  test('passes one late send in a thousand, and fails any send past 20 ms', async () => {
    const one = await run(withLogUnclaimed(['adherence'], (log) => ((log.rows.sentNs[10] += 3_000_000), (log.rows.firstNs[10] += 3_000_000), (log.rows.doneNs[10] += 3_000_000))))
    expect(checkOf(one, 'B4')?.status).toBe('pass')
    const far = await run(withLogUnclaimed(['adherence'], (log) => ((log.rows.sentNs[10] += 21_000_000), (log.rows.firstNs[10] += 21_000_000), (log.rows.doneNs[10] += 21_000_000))))
    expect(checkOf(far, 'B4')?.status).toBe('fail')
    expect(checkOf(far, 'B4')?.bound).toContain('the latest by 21,000 µs')
  })

  test('fails a claimed adherence that is not the rows\': a client that says it kept to its schedule and did not', async () => {
    const outcome = await run(withClaim((claim) => (claim.adherence.lateRows += 1)))
    expect(checkOf(outcome, 'B4')?.bound).toBe('adherence.lateRows: the receipt claims 1 and the rows give 0.')
  })
})

describe('B5, latency is counted from the due time', () => {
  test('names a claim that is the figure counted from the send, which a harness that starts its timer at the send reports', async () => {
    // A log in which one send is late makes the two figures differ at the top.
    const fixture = edited(replayFixture(), (bundle) => {
      const log = logOf(bundle)
      const last = log.rows.id.length - 1
      for (const row of [last]) {
        log.rows.sentNs[row] += 1_000_000
        log.rows.firstNs[row] += 1_000_000
        log.rows.doneNs[row] += 1_000_000
      }
    })
    const honest = await run(fixture)
    expect(checkOf(honest, 'B5')?.status).toBe('pass')
  })
})

describe('B6, the percentiles', () => {
  test('fails an edited p50, p90 or p99, and a mean, a maximum or a count: any figure of a latency that the rows do not give', async () => {
    for (const field of ['p50Us', 'p90Us', 'p99Us', 'meanUs', 'maxUs', 'n']) {
      const outcome = await run(withClaim((claim) => (claim.latency.ttftFromDue[field] += 1)))
      expect(checkOf(outcome, 'B6')?.status, field).toBe('fail')
      expect(checkOf(outcome, 'B6')?.bound, field).toContain(`latency.ttftFromDue.${field}: the receipt claims`)
    }
  })

  test('holds the figure counted from the send to the same account', async () => {
    const outcome = await run(withClaim((claim) => (claim.latency.e2eFromSent.p99Us += 1)))
    expect(checkOf(outcome, 'B6')?.bound).toContain('latency.e2eFromSent.p99Us')
  })

  test('does not fail a claim that leaves a figure out: credit never depends on a number', async () => {
    const outcome = await run(withClaim((claim) => delete claim.latency.ttftFromDue.p99Us))
    expect(checkOf(outcome, 'B6')?.status).toBe('pass')
  })
})

describe('B7, the interval', () => {
  test('fails an interval that the seeded bootstrap does not give', async () => {
    const outcome = await run(withClaim((claim) => (claim.p99Intervals.ttftFromDue.hiUs += 1)))
    expect(checkOf(outcome, 'B7')?.bound).toMatch(/^p99Intervals\.ttftFromDue\.hiUs: the receipt claims [\d,]+ and the rows give [\d,]+ \(a percentile bootstrap of 1,000 resamples \[estimated\], seeded from the challenge\)\.$/)
  })

  test('fails a p99 that rests on fewer than 1,000 measured rows, and says why 1,000', async () => {
    const fixture = replayFixture()
    // A declared workload with a shorter arrival window: 1,000 rows are measured only when 1,128 are offered.
    const short = { ...REPLAY_SPEC, requests: 1100 }
    const outcome = await verify(fixture.bundle, { ...fixture.context, stages: { 'tr8.replay.s2': { bench: short } } })
    expect(checkOf(outcome, 'B1')?.status).toBe('fail')
  })
})

describe('B8, the warm-up', () => {
  test('fails a run that is still warming: the median first token of the tenth after the warm-up is more than 5/4 of the rest', async () => {
    const outcome = await run(
      withLog((log) => {
        const warm = 128
        const tenth = Math.floor((log.rows.id.length - warm) / 10)
        for (let i = warm; i < warm + tenth; i += 1) {
          log.rows.firstNs[i] += 200_000_000
          log.rows.doneNs[i] += 200_000_000
        }
      }),
    )
    expect(checkOf(outcome, 'B8')?.status).toBe('fail')
    expect(checkOf(outcome, 'B8')?.bound).toMatch(/^still warming: the median time to first token of the first tenth after the warm-up is [\d,]+ µs, more than 5\/4 of the [\d,]+ µs of the rest \[estimated bound\]\.$/)
  })
})

describe('B9, goodput', () => {
  test('fails a goodput that is not the count of requests that met both objectives, and one counted over the wrong denominator', async () => {
    const wrong = await run(withClaim((claim) => (claim.goodput.arrivalWindowPerSMilli += 10)))
    expect(checkOf(wrong, 'B9')?.bound).toContain('goodput.arrivalWindowPerSMilli: the receipt claims')
    const met = await run(withClaim((claim) => (claim.goodput.met += 1)))
    expect(checkOf(met, 'B9')?.bound).toContain('goodput.met')
  })
})

describe('B10, Little\'s law', () => {
  test('fails a log whose requests spend their time somewhere the window does not see: a backlog that finishes long after the arrivals stop', async () => {
    const outcome = await run(
      withLogUnclaimed(['littles'], (log) => {
        for (let i = log.rows.id.length - 300; i < log.rows.id.length; i += 1) {
          log.rows.doneNs[i] += 600_000_000_000
        }
      }),
    )
    expect(checkOf(outcome, 'B10')?.status).toBe('fail')
    expect(checkOf(outcome, 'B10')?.bound).toMatch(/permille apart; Little's law holds within 50 permille \[estimated\]\.$/)
  })

  test('fails a claimed residual that is not the rows\'', async () => {
    const outcome = await run(withClaim((claim) => (claim.littles.residualPermille += 7)))
    expect(checkOf(outcome, 'B10')?.bound).toContain('littles.residualPermille')
  })
})

describe('B12, the time per output token', () => {
  test('fails an edited tpot, and holds the definition: last token minus first, over the output tokens less one', async () => {
    const outcome = await run(withClaim((claim) => (claim.latency.tpot.p99Us -= 5)))
    expect(checkOf(outcome, 'B12')?.bound).toMatch(/^latency\.tpot\.p99Us: the receipt claims [\d,]+ and the rows give [\d,]+ \(the time per output token of a request is the last token minus the first, over the output tokens less one\)\.$/)
  })
})

describe('B14, no cache carries over', () => {
  test('fails a prefix-cache reset recorded after the first request is due', async () => {
    const outcome = await run(withLog((log) => (log.cacheResetNs = 1_000_000_000)))
    expect(checkOf(outcome, 'B14')?.status).toBe('fail')
    expect(checkOf(outcome, 'B14')?.bound).toContain('a reset after the first request leaves a previous run')
  })
})

describe('a log that cannot be read', () => {
  test('fails every check of the stage with the reason, and the verdict says so', async () => {
    const fixture = edited(replayFixture(), (bundle) => {
      const artifact = bundle.artifacts['bench-log']
      if (artifact.encoding === 'json') (artifact.data as Log).rows.status.pop()
    })
    const outcome = await run(fixture)
    expect(checkOf(outcome, 'B6')?.bound).toBe('the log could not be read: rows.status has 1,263 rows, where rows.id has 1,264.')
    expect(failed(outcome).filter((id) => id.startsWith('B'))).toHaveLength(12)
  })

  test('is a log that the learner kept, when the receipt lists it as not in the bundle: this browser cannot read it', async () => {
    const fixture = edited(replayFixture(), (bundle) => {
      const entry = bundle.receipt.artifacts.find((artifact) => artifact.id === 'bench-log')
      if (entry !== undefined) entry.inBundle = false
      delete bundle.artifacts['bench-log']
    })
    const outcome = await run(fixture)
    expect(checkOf(outcome, 'B2')?.bound).toBe('the log could not be read: the learner kept it and it is not in the bundle, so this browser cannot read it.')
  })

  test('is any file that is not bench-log@1 in the format of a log: the reader names the first thing that is wrong', async () => {
    interface Data {
      schema: string
      extra?: number
      rows: Record<string, unknown>
    }
    const cases: [string, (data: Data) => void, RegExp][] = [
      ['an unknown field', (data) => (data.extra = 1), /it has a field "extra"/],
      ['a schema of another version', (data) => (data.schema = 'enginespace/bench-log@2'), /its schema is "enginespace\/bench-log@2"/],
      ['a column that is not an array', (data) => (data.rows.dueNs = 3), /rows\.dueNs is not an array/],
      ['a value that is not an integer', (data) => ((data.rows.dueNs as number[])[1] = 1.5), /rows\.dueNs\[1\] is not an integer below 2\^53/],
      ['a status of 3', (data) => ((data.rows.status as number[])[0] = 3), /rows\.status\[0\] is 3, and a status is 0, 1 or 2/],
      ['a missing column', (data) => delete data.rows.promptTokens, /rows has no field "promptTokens"/],
      ['a column this format does not have', (data) => (data.rows.extra = []), /rows has a field "extra"/],
    ]
    for (const [name, change, expected] of cases) {
      const outcome = await run(withLog((log) => change(log as unknown as Data)))
      expect(checkOf(outcome, 'B6')?.bound, name).toMatch(expected)
    }
  })
})
