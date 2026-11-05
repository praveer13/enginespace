/*
 * The benchmark client and its run (ARCHITECTURE §5.6): arrivals by Poisson table, by replay and by closed loop, the server as the
 * step loop's coarse mode, and every request's intended send time kept beside its actual one.
 *
 * W1-T31 acceptance check 1: on the same server, a closed loop shows coordinated omission and an open loop does not. It is the
 * second describe block below: the same schedule, the same frozen server and the same requests go through both clients, and the
 * open loop's log has no send behind its due time while the closed loop's has dozens, and its own timer cannot see them.
 * Acceptance check 3, the Little's-law residual on stable runs, is the last.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { below, between, chance, pick, rngFor } from '../../packages/sim/core'
import { PREFIX_BLOCK_TOKENS, cachedPrefixTokens, checkRows, littlesLaw, planBench, runBench, summarize, ttftUs } from '../../packages/sim/bench'
import type { BenchRow, BenchSpec, ServerModel } from '../../packages/sim/bench'
import { TICK_CARD } from '../../packages/sim/steploop'
import { SLICE_IDS, genWorkload, originLabel, parseSlice, replayWorkload } from '../../packages/sim/workload'
import type { ArrivalPlan, TraceSlice } from '../../packages/sim/workload'
import { seeds } from '../seeds'
import { LLM_SPEC, S5_SERVER, SEC, STALL, inFlightMax, poisson } from './bench-support'

const root = path.resolve(import.meta.dirname, '../..')
const slice = (id: (typeof SLICE_IDS)[number]): TraceSlice => parseSlice(JSON.parse(readFileSync(path.join(root, 'vendor/kernelspace/public/traces', `${id}.json`), 'utf8')))

/** The front page's tick card with 4 slots, for runs small enough to follow: a tick is a µs of the model's clock. */
const TICKS: ServerModel = { maxNumSeqs: 4, maxBatchedTokens: 2048, chunkedPrefill: true, gpu: TICK_CARD }

/** A small spec on the tick card, drawn from a seed: the arrival kind, the lengths, the cap, the cache and the window. */
function tickSpec(seed: number): BenchSpec {
  const rng = rngFor(seed, 'test/bench/run')
  const gap = pick(rng, [5, 10, 20, 50])
  const kind = below(rng, 3)
  const arrivals = kind === 0 ? ({ kind: 'poisson', ratePerSMilli: 1_000_000_000 / gap } as const) : kind === 1 ? ({ kind: 'burst', atUs: between(rng, 0, 30) } as const) : ({ kind: 'poisson', ratePerSMilli: 1_000_000_000 / gap * 2 } as const)
  return {
    arrivals,
    lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 1, hi: 40 }, output: { kind: 'uniform', lo: 1, hi: 16 } },
    requests: between(rng, 1, 60),
    warmupUs: 0,
    durationUs: pick(rng, [100, 400, 1500]),
    ...(chance(rng, 300) ? { outputCap: between(rng, 1, 8) } : {}),
    ...(chance(rng, 300) ? { prefixWarm: true } : {}),
    slo: { ttftUs: 30, tpotUs: 8 },
  }
}

/** The workload module's arrival plan for an open spec. */
function scheduleOf(spec: BenchSpec): ArrivalPlan {
  const a = spec.arrivals
  if (a.kind === 'burst') return { kind: 'burst', ...(a.atUs === undefined ? {} : { atUs: a.atUs }) }
  if (a.kind === 'poisson') return { kind: 'poisson', ratePerSMilli: a.ratePerSMilli }
  throw new Error(`not an open synthetic spec: ${a.kind}`)
}

const SEEDS = seeds(1)

// ---------------------------------------------------------------------------------------------------------------------------
// The open loop

describe(`an open loop, over ${SEEDS.length} seeds [estimated]`, () => {
  test('sends every request on its due time, and the due times, lengths and cap are the workload module\'s', () => {
    let rowsTotal = 0
    for (const seed of SEEDS) {
      const spec = tickSpec(seed)
      const run = runBench(seed, spec, TICKS)
      const schedule = scheduleOf(spec)
      const w = genWorkload(seed, { requests: spec.requests, arrivals: schedule, lengths: spec.lengths! })
      const due = w.reqs.filter((r) => r.dueUs < spec.durationUs)
      expect(run.rows, `seed ${seed}`).toHaveLength(due.length)
      expect(run.origin).toEqual({ kind: 'synthetic' })
      for (const [i, row] of run.rows.entries()) {
        expect(row.id).toBe(i)
        expect(row.client).toBeNull()
        expect(row.dueUs, `seed ${seed}, request ${i}`).toBe(due[i].dueUs)
        expect(row.sentUs, `seed ${seed}, request ${i}`).toBe(row.dueUs)
        expect(row.promptTokens).toBe(due[i].promptTokens)
        expect(row.outputTokens).toBe(spec.outputCap === undefined ? due[i].outputTokens : Math.min(due[i].outputTokens, spec.outputCap))
      }
      checkRows(run.rows)
      rowsTotal += run.rows.length
      const s = summarize(run, { bootstrap: 0, seed })
      expect(s.adherence.lateRows).toBe(0)
      expect(s.latency.ttftFromDue).toEqual(s.latency.ttftFromSent)
      expect(s.rates.sentPerSMilli).toBe(s.rates.intendedPerSMilli)
    }
    expect(rowsTotal).toBeGreaterThan(2000)
  })

  test('is a function of the seed, the spec and the server, and a different seed gives different arrivals', () => {
    const spec: BenchSpec = { ...LLM_SPEC, arrivals: poisson(8), requests: 100, durationUs: 30 * SEC }
    const a = runBench(7, spec, S5_SERVER)
    expect(runBench(7, spec, S5_SERVER)).toEqual(a)
    const b = runBench(8, spec, S5_SERVER)
    expect(b.rows.map((r) => r.dueUs)).not.toEqual(a.rows.map((r) => r.dueUs))
  })

  test('offers the first `requests` that fall due inside the arrival window, and no more', () => {
    const base: BenchSpec = { ...LLM_SPEC, arrivals: poisson(10), warmupUs: 0, durationUs: 3 * SEC, requests: 1000 }
    const w = genWorkload(5, { requests: 1000, arrivals: { kind: 'poisson', ratePerSMilli: 10_000 }, lengths: base.lengths! })
    const inWindow = w.reqs.filter((r) => r.dueUs < 3 * SEC).length
    expect(inWindow).toBeGreaterThan(10)
    expect(inWindow).toBeLessThan(60)
    expect(planBench(5, base).reqs).toHaveLength(inWindow)
    expect(planBench(5, { ...base, requests: 5 }).reqs).toHaveLength(5)
    expect(planBench(5, { ...base, requests: 0 }).reqs).toHaveLength(0)
  })

  test('a run of no requests has no rows and a summary of nothing', () => {
    const run = runBench(1, { ...LLM_SPEC, arrivals: poisson(8), requests: 0 }, S5_SERVER)
    expect(run.rows).toEqual([])
    const s = summarize(run, { bootstrap: 100, seed: 1 })
    expect(s.counts).toEqual({ offered: 0, warmup: 0, measured: 0 })
    expect(s.latency.ttftFromDue).toBeNull()
    expect(s.p99Intervals.ttftFromDue).toBeNull()
    expect(s.goodput.met).toBe(0)
  })

  test('a burst is `--request-rate inf`: every request due at once, so the queue behind the slots is the latency', () => {
    const run = runBench(3, { ...LLM_SPEC, arrivals: { kind: 'burst' }, requests: 200, warmupUs: 0 }, S5_SERVER)
    expect(run.rows.every((r) => r.dueUs === 0 && r.sentUs === 0)).toBe(true)
    // 64 slots at most: the 200th request waits for several generations of replies before its prefill.
    const ttft = run.rows.map((r) => ttftUs(r))
    expect(Math.max(...ttft)).toBeGreaterThan(3 * SEC)
    expect(Math.min(...ttft)).toBeLessThan(0.5 * SEC)
    expect(inFlightMax(run.rows, (r) => r.firstUs, (r) => r.doneUs)).toBeLessThanOrEqual(64)
  })
})

describe('arrivals by replay', () => {
  for (const id of SLICE_IDS) {
    test(`${id}: the due times and lengths are replayWorkload's, at the speed asked for, and the slice's credit travels with the run`, () => {
      const s = slice(id)
      const n = Math.min(60, s.requests.length)
      const spec: BenchSpec = { arrivals: { kind: 'replay', slice: s, speedPermille: 4000 }, requests: n, warmupUs: 0, durationUs: 10_000 * SEC, slo: { ttftUs: 5 * SEC, tpotUs: 200_000 } }
      const run = runBench(11, spec, S5_SERVER)
      const w = replayWorkload(11, { slice: s, requests: n, speedPermille: 4000 })
      expect(run.rows.map((r) => r.dueUs)).toEqual(w.reqs.map((r) => r.dueUs))
      expect(run.rows.map((r) => r.promptTokens)).toEqual(w.reqs.map((r) => r.promptTokens))
      expect(run.rows.map((r) => r.outputTokens)).toEqual(w.reqs.map((r) => r.outputTokens))
      expect(run.origin).toEqual(w.origin)
      expect(originLabel(run.origin)).toContain(s.attribution)
      // Sends keep the trace's timestamps: bursts stay bursts.
      expect(run.rows.every((r) => r.sentUs === r.dueUs)).toBe(true)
    })
  }

  test('a replay brings its own lengths, so a spec that also gives some is refused', () => {
    const s = slice('burstgpt-v2-busiest-minute')
    const spec: BenchSpec = { ...LLM_SPEC, arrivals: { kind: 'replay', slice: s, speedPermille: 1000 } }
    expect(() => runBench(1, spec, S5_SERVER)).toThrow(/brings the lengths/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Acceptance check 1

describe('check 1: on the same server, a closed loop shows coordinated omission and an open loop does not', () => {
  const frozen: ServerModel = { ...S5_SERVER, stalls: [STALL] }
  const open = (seed: number, server: ServerModel) => runBench(seed, { ...LLM_SPEC, arrivals: poisson(8) }, server)
  const closed = (seed: number, server: ServerModel, clients = 24) =>
    runBench(seed, { ...LLM_SPEC, arrivals: { kind: 'closed', clients, thinkUs: 0, schedule: poisson(8) } }, server)
  /** Requests due after the warm-up whose first token took longer than the objective, counted from the due time or from the send. */
  const missed = (rows: readonly BenchRow[], from: 'due' | 'sent'): number => rows.filter((r) => r.dueUs >= LLM_SPEC.warmupUs && ttftUs(r, from) > LLM_SPEC.slo.ttftUs).length
  const SCAN = Array.from({ length: 12 }, (_, i) => i + 1)

  test('the open loop sends every request on its due time through a 5 s stall, so its timer and the course\'s agree to the µs', () => {
    for (const seed of SCAN) {
      const run = open(seed, frozen)
      expect(run.rows.every((r) => r.sentUs === r.dueUs), `seed ${seed}`).toBe(true)
      const s = summarize(run, { bootstrap: 0, seed })
      expect(s.adherence).toMatchObject({ lateRows: 0, veryLateRows: 0, maxLateUs: 0, ok: true })
      expect(s.latency.ttftFromSent).toEqual(s.latency.ttftFromDue)
      expect(s.latency.e2eFromSent).toEqual(s.latency.e2eFromDue)
      // The stall is in the data: the open loop's tail is the stall.
      expect(s.latency.ttftFromDue!.p99Us, `seed ${seed}`).toBeGreaterThan(2 * SEC)
    }
  })

  test('the closed loop on the same schedule and server sends dozens of requests late, by seconds, and fails the adherence rule', () => {
    for (const seed of SCAN) {
      const run = closed(seed, frozen)
      const s = summarize(run, { bootstrap: 0, seed })
      expect(s.adherence.ok, `seed ${seed}`).toBe(false)
      expect(s.adherence.lateRows, `seed ${seed}`).toBeGreaterThan(40)
      expect(s.adherence.maxLateUs, `seed ${seed}`).toBeGreaterThan(STALL.forUs / 2)
      // Never early.
      expect(run.rows.every((r) => r.sentUs >= r.dueUs)).toBe(true)
      // The rate it achieved is below the rate it was asked for.
      expect(s.rates.sentPerSMilli).toBeLessThanOrEqual(s.rates.intendedPerSMilli)
    }
  })

  test('both are the same requests: the closed loop has the open loop\'s due times and lengths, row for row', () => {
    for (const seed of SCAN) {
      const a = open(seed, frozen)
      const b = closed(seed, frozen)
      expect(b.rows.map((r) => [r.dueUs, r.promptTokens, r.outputTokens])).toEqual(a.rows.map((r) => [r.dueUs, r.promptTokens, r.outputTokens]))
    }
  })

  test('the closed loop\'s own timer, which starts at the send, reports a fraction of the slow first tokens that there were from the due time', () => {
    for (const seed of SCAN) {
      const truth = missed(open(seed, frozen).rows, 'due')
      const run = closed(seed, frozen)
      const fromDue = missed(run.rows, 'due')
      const fromSent = missed(run.rows, 'sent')
      // What the harness reports is under a third of what its own clients lived through...
      expect(fromSent * 3, `seed ${seed}: reported ${fromSent}, lived ${fromDue}`).toBeLessThan(fromDue)
      // ...and under what an open loop on the same schedule and server shows.
      expect(fromSent, `seed ${seed}: reported ${fromSent}, open loop ${truth}`).toBeLessThan(truth)
      // Counted from the due time, the closed loop is no better off than the open one: the omitted requests are found again.
      expect(fromDue, `seed ${seed}`).toBeGreaterThan(truth)
    }
  })

  test('a closed loop with a client for every request is an open loop: nothing waits for a reply, so nothing is omitted, stall or not', () => {
    for (const seed of SCAN.slice(0, 4)) {
      const a = open(seed, frozen)
      const b = closed(seed, frozen, a.rows.length)
      expect(b.rows.map((r) => ({ ...r, client: null }))).toEqual(a.rows)
    }
  })

  test('without the stall the same 24 clients still fall behind a Poisson schedule when its bursts outnumber them, and 64 do not', () => {
    for (const seed of SCAN.slice(0, 4)) {
      expect(summarize(closed(seed, S5_SERVER, 24), { bootstrap: 0, seed }).adherence.lateRows).toBeGreaterThan(0)
      const sixtyFour = closed(seed, S5_SERVER, 64)
      expect(sixtyFour.rows).toEqual(open(seed, S5_SERVER).rows.map((r) => ({ ...r, client: sixtyFour.rows[r.id].client })))
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The closed loop

describe(`a closed loop, over ${SEEDS.length} seeds [estimated]`, () => {
  function closedSpec(seed: number): BenchSpec {
    const rng = rngFor(seed, 'test/bench/closed')
    const base = tickSpec(seed)
    const scheduled = chance(rng, 700)
    const schedule = base.arrivals.kind === 'closed' ? undefined : base.arrivals
    return {
      ...base,
      requests: between(rng, 1, 40),
      durationUs: pick(rng, [60, 200, 800]),
      arrivals: { kind: 'closed', clients: between(rng, 1, 6), thinkUs: pick(rng, [0, 0, 3, 17]), ...(scheduled && schedule !== undefined ? { schedule } : {}) },
    }
  }

  test('keeps at most `clients` requests in flight, hands requests to clients in order, and lets each client send only after its last reply and its think time', () => {
    let late = 0
    let pure = 0
    for (const seed of SEEDS) {
      const spec = closedSpec(seed)
      if (spec.arrivals.kind !== 'closed') throw new Error('unreachable')
      const { clients, thinkUs } = spec.arrivals
      const run = runBench(seed, spec, TICKS)
      checkRows(run.rows)
      expect(run.rows.length, `seed ${seed}`).toBeLessThanOrEqual(spec.requests)
      // A client holds its request from the send to the reply, and there are `clients` of them.
      expect(inFlightMax(run.rows, (r) => r.sentUs, (r) => r.doneUs), `seed ${seed}`).toBeLessThanOrEqual(clients)
      // Requests go out in order.
      for (let i = 1; i < run.rows.length; i++) expect(run.rows[i].sentUs, `seed ${seed}, request ${i}`).toBeGreaterThanOrEqual(run.rows[i - 1].sentUs)
      // Each client's requests are sequential, and the think time separates a reply from the next send.
      const byClient = new Map<number, BenchRow[]>()
      for (const r of run.rows) {
        if (r.client === null || r.client >= clients) throw new Error(`seed ${seed}: request ${r.id} has client ${String(r.client)}`)
        byClient.set(r.client, [...(byClient.get(r.client) ?? []), r])
      }
      for (const mine of byClient.values()) {
        for (let k = 1; k < mine.length; k++) expect(mine[k].sentUs, `seed ${seed}, request ${mine[k].id}`).toBeGreaterThanOrEqual(mine[k - 1].doneUs + thinkUs)
      }
      if (spec.arrivals.schedule === undefined) {
        // No schedule, so no intended times of its own: each request is due when its client is ready, and the log shows no slip.
        pure++
        expect(run.rows.every((r) => r.sentUs === r.dueUs)).toBe(true)
        expect(run.rows.every((r) => r.sentUs < spec.durationUs)).toBe(true)
        // The first request of each client goes out at once, and every other one at its client's last reply plus the think time.
        for (const mine of byClient.values()) {
          expect(mine[0].sentUs).toBe(0)
          for (let k = 1; k < mine.length; k++) expect(mine[k].sentUs).toBe(mine[k - 1].doneUs + thinkUs)
        }
      } else {
        late += run.rows.filter((r) => r.sentUs > r.dueUs).length
        // A client waits for a reply, but never sends early.
        expect(run.rows.every((r) => r.sentUs >= r.dueUs)).toBe(true)
      }
    }
    // The seeds covered both kinds of loop, and the scheduled ones fell behind sometimes.
    expect(pure).toBeGreaterThan(20)
    expect(late).toBeGreaterThan(100)
  })

  test('a pure closed loop sends nothing at or after the end of the window, and the window ends it before `requests` when the replies are slow', () => {
    const spec: BenchSpec = { ...LLM_SPEC, requests: 4000, warmupUs: 0, durationUs: 20 * SEC, arrivals: { kind: 'closed', clients: 16, thinkUs: 0 } }
    const run = runBench(2, spec, S5_SERVER)
    expect(run.rows.length).toBeLessThan(4000)
    expect(run.rows.length).toBeGreaterThan(100)
    expect(Math.max(...run.rows.map((r) => r.sentUs))).toBeLessThan(20 * SEC)
    // The window decided it: the next request after the last would have been sent past 20 s.
    expect(run.endUs).toBeGreaterThan(20 * SEC)
  })

  test('a closed loop holds the server at its clients: 64 clients keep 64 requests in flight, and the load never exceeds what the server can finish', () => {
    const spec: BenchSpec = { ...LLM_SPEC, arrivals: { kind: 'closed', clients: 64, thinkUs: 0 } }
    const run = runBench(3, spec, S5_SERVER)
    expect(inFlightMax(run.rows, (r) => r.sentUs, (r) => r.doneUs)).toBe(64)
    // Past capacity an open loop's first tokens wait seconds in a queue that never ends. The closed loop's wait for a slot, because
    // every client has one.
    const overloaded = runBench(3, { ...LLM_SPEC, arrivals: poisson(40) }, S5_SERVER)
    const closedP99 = summarize(run, { bootstrap: 0, seed: 1 }).latency.ttftFromDue!.p99Us
    const openP99 = summarize(overloaded, { bootstrap: 0, seed: 1 }).latency.ttftFromDue!.p99Us
    expect(closedP99).toBeLessThan(2 * SEC)
    expect(openP99).toBeGreaterThan(20 * SEC)
  })

  test('`--request-rate inf --max-concurrency N`: every request due at 0 behind N clients, whose timers start only when a client sends', () => {
    const spec: BenchSpec = { ...LLM_SPEC, requests: 200, warmupUs: 0, arrivals: { kind: 'closed', clients: 16, thinkUs: 0, schedule: { kind: 'burst' } } }
    const run = runBench(4, spec, S5_SERVER)
    expect(run.rows.every((r) => r.dueUs === 0)).toBe(true)
    expect(inFlightMax(run.rows, (r) => r.sentUs, (r) => r.doneUs)).toBe(16)
    const s = summarize(run, { bootstrap: 0, seed: 1 })
    // `client_queue_time` is sent − due. The harness's own latencies leave it out, and the course's do not.
    expect(s.latency.ttftFromSent!.p99Us).toBeLessThan(0.5 * SEC)
    expect(s.latency.ttftFromDue!.p50Us).toBeGreaterThan(5 * SEC)
    expect(s.goodput.met).toBeLessThan(40)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The flaws' knobs

describe('the client and the cache', () => {
  const spec: BenchSpec = { ...LLM_SPEC, arrivals: poisson(8), requests: 600, durationUs: 80 * SEC }

  test('a client whose own cost exceeds its schedule\'s gap falls further behind with every request, whatever the server does', () => {
    // A cost of 150 ms against a mean gap of 125 ms.
    const run = runBench(5, { ...spec, clientCostUs: 150_000 }, S5_SERVER)
    for (let i = 1; i < run.rows.length; i++) expect(run.rows[i].sentUs - run.rows[i - 1].sentUs, `request ${i}`).toBeGreaterThanOrEqual(150_000)
    const late = run.rows.map((r) => r.sentUs - r.dueUs)
    expect(late[late.length - 1]).toBeGreaterThan(5 * SEC)
    // The lateness grows without a stall to blame, and the server's own latencies are those of an idle server.
    const s = summarize(run, { bootstrap: 0, seed: 1 })
    expect(s.adherence.ok).toBe(false)
    expect(s.adherence.lateRows).toBeGreaterThan(0.9 * run.rows.length)
    expect(s.latency.ttftFromSent!.p99Us).toBeLessThan(0.2 * SEC)
    expect(s.latency.ttftFromDue!.p50Us).toBeGreaterThan(5 * SEC)
    expect(s.rates.sentPerSMilli).toBeLessThan(0.9 * s.rates.intendedPerSMilli)
  })

  test('a client whose cost fits inside the gaps is on time, up to the cost of its own busy moments', () => {
    const run = runBench(5, { ...spec, clientCostUs: 1000 }, S5_SERVER)
    const s = summarize(run, { bootstrap: 0, seed: 1 })
    // 1 ms of work for 8 requests a second: a burst of two Poisson arrivals within 1 ms sends the second a little late.
    expect(s.adherence.maxLateUs).toBeLessThan(5000)
    expect(run.rows.filter((r) => r.sentUs !== r.dueUs).length).toBeLessThan(0.03 * run.rows.length)
  })

  test('capped replies are shorter, and the server finishes them sooner', () => {
    const free = runBench(6, spec, S5_SERVER)
    const capped = runBench(6, { ...spec, outputCap: 16 }, S5_SERVER)
    expect(capped.rows.every((r) => r.outputTokens <= 16)).toBe(true)
    expect(free.rows.some((r) => r.outputTokens > 16)).toBe(true)
    expect(capped.rows.map((r) => r.dueUs)).toEqual(free.rows.map((r) => r.dueUs))
    const p99 = (run: typeof free) => summarize(run, { bootstrap: 0, seed: 1 }).latency.e2eFromDue!.p99Us
    expect(p99(capped) * 3).toBeLessThan(p99(free))
  })

  test('prompts left in the cache by an earlier run prefill only their last block, and the first tokens come sooner', () => {
    const cold = runBench(7, spec, S5_SERVER)
    const warm = runBench(7, { ...spec, prefixWarm: true }, S5_SERVER)
    expect(warm.rows.map((r) => r.promptTokens)).toEqual(cold.rows.map((r) => r.promptTokens))
    const p50 = (run: typeof cold) => summarize(run, { bootstrap: 0, seed: 1 }).latency.ttftFromDue!.p50Us
    expect(p50(warm) * 1.2).toBeLessThan(p50(cold))
  })

  test('a cache hit is every full block but the last token: 0 below 2 tokens, one block at 17, and the block size is the pin\'s 16', () => {
    expect(PREFIX_BLOCK_TOKENS).toBe(16)
    expect([1, 2, 16, 17, 32, 33, 100].map(cachedPrefixTokens)).toEqual([0, 0, 0, 16, 16, 32, 96])
  })

  test('a server that starts cold makes the first window slow, and a harness that declares no warm-up counts it', () => {
    const cold: ServerModel = { ...S5_SERVER, cold: { untilUs: 20 * SEC, slowdownPermille: 3000 } }
    const counted = { ...spec, warmupUs: 0 }
    for (const seed of [1, 2, 3, 4, 5]) {
      const run = runBench(seed, counted, cold)
      const reported = summarize(run, { bootstrap: 0, seed })
      const corrected = summarize(run, { bootstrap: 0, seed, warmupUs: 20 * SEC })
      expect(reported.counts.warmup).toBe(0)
      expect(corrected.counts.warmup).toBeGreaterThan(100)
      expect(corrected.counts.measured + corrected.counts.warmup).toBe(run.rows.length)
      // The cold start is most of the reported tail.
      expect(corrected.latency.ttftFromDue!.p99Us * 2, `seed ${seed}`).toBeLessThan(reported.latency.ttftFromDue!.p99Us)
      expect(corrected.latency.tpot!.p90Us * 2, `seed ${seed}`).toBeLessThan(reported.latency.tpot!.p90Us)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The knee

describe('the server has a knee: TR8\'s load sweep comes out of the model that TR2 runs fine', () => {
  test('goodput at the SLO follows the offered load up to what the server finishes, and collapses past it', () => {
    const at = (rps: number) => {
      let goodput = 0
      let p99 = 0
      for (const seed of [1, 2, 3]) {
        const s = summarize(runBench(seed, { ...LLM_SPEC, arrivals: poisson(rps) }, S5_SERVER), { bootstrap: 0, seed })
        goodput += s.goodput.arrivalWindowPerSMilli / 3
        p99 += s.latency.ttftFromDue!.p99Us / 3
      }
      return { rps, goodput, p99 }
    }
    const sweep = [4, 8, 16, 24, 32].map(at)
    const [four, eight, sixteen, twentyFour, thirtyTwo] = sweep
    // Below the knee every request meets the objectives, so goodput is the offered rate, give or take the Poisson count in the window.
    for (const point of [four, eight, sixteen]) expect(Math.abs(point.goodput - point.rps * 1000), `${point.rps}/s`).toBeLessThan(0.1 * point.rps * 1000)
    // Past it a queue forms that never drains within the window, the first token waits seconds, and nothing meets the objective.
    expect(twentyFour.goodput).toBeLessThan(0.1 * sixteen.goodput)
    expect(thirtyTwo.goodput).toBeLessThan(0.1 * sixteen.goodput)
    expect(twentyFour.p99).toBeGreaterThan(20 * sixteen.p99)
    expect(eight.goodput).toBeGreaterThan(1.8 * four.goodput)
    // The peak is inside the sweep: neither its first point nor its last.
    const peak = sweep.reduce((best, point) => (point.goodput > best.goodput ? point : best))
    expect([8, 16]).toContain(peak.rps)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Refusals

describe('what a spec may not be', () => {
  const ok: BenchSpec = { ...LLM_SPEC, arrivals: poisson(8), requests: 10 }
  const bad = (change: Partial<BenchSpec>): (() => unknown) => () => runBench(1, { ...ok, ...change }, S5_SERVER)

  test('is refused with the field it names', () => {
    expect(bad({ requests: -1 })).toThrow(/requests/)
    expect(bad({ warmupUs: -1 })).toThrow(/warmupUs/)
    expect(bad({ durationUs: 0 })).toThrow(/durationUs/)
    expect(bad({ warmupUs: 200 * SEC })).toThrow(/warmupUs/)
    expect(bad({ outputCap: 0 })).toThrow(/outputCap/)
    expect(bad({ clientCostUs: -5 })).toThrow(/clientCostUs/)
    expect(bad({ slo: { ttftUs: 0, tpotUs: 1 } })).toThrow(/slo.ttftUs/)
    expect(bad({ arrivals: { kind: 'closed', clients: 0, thinkUs: 0 } })).toThrow(/clients/)
    expect(bad({ arrivals: { kind: 'closed', clients: 2, thinkUs: -1 } })).toThrow(/thinkUs/)
    expect(bad({ arrivals: poisson(0) })).toThrow(/ratePerSMilli/)
    expect(() => runBench(1, { ...ok, lengths: undefined }, S5_SERVER)).toThrow(/needs lengths/)
    expect(() => runBench(-1, ok, S5_SERVER)).toThrow(/seed/)
    expect(() => runBench(1, ok, { ...S5_SERVER, maxNumSeqs: 0 })).toThrow(/maxNumSeqs/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Acceptance check 3

describe('check 3: on stable runs, the Little\'s-law residual is under 2%', () => {
  // A stable run: an open loop below the server's capacity, with a warm-up that covers the time it takes to fill. Starting the
  // window at 0 would put the run's empty beginning in it, and the residual would be the fill, not the law.
  const stable = (rps: number): BenchSpec => ({ ...LLM_SPEC, arrivals: poisson(rps) })

  test('at 4, 8 and 16 requests a second (about 15%, 30% and 55% of what the server finishes), over 60 seeds', () => {
    let worst = 0
    for (const rps of [4, 8, 16]) {
      for (let seed = 1; seed <= 20; seed++) {
        const run = runBench(seed, stable(rps), S5_SERVER)
        const s = summarize(run, { bootstrap: 0, seed })
        expect(s.littles.completions, `${rps}/s seed ${seed}`).toBeGreaterThan(200)
        expect(s.littles.residualPermille, `${rps}/s seed ${seed}`).toBeLessThan(20)
        worst = Math.max(worst, s.littles.residualPermille)
      }
    }
    // Recorded for the PR: the worst residual of the 60 runs, in permille.
    expect(worst).toBeLessThan(20)
  })

  test('also when the clock starts at the due time, which counts the client\'s queue too', () => {
    const run = runBench(3, stable(8), S5_SERVER)
    const window = { fromUs: LLM_SPEC.warmupUs, toUs: LLM_SPEC.durationUs }
    expect(littlesLaw(run.rows, window, 'due').residualPermille).toBeLessThan(20)
    // Nothing waited in a client, so the two views are the same.
    expect(littlesLaw(run.rows, window, 'due')).toEqual(littlesLaw(run.rows, window, 'sent'))
  })

  test('a run that backs up is not stable, and the residual says so: 40 requests a second is past what the server finishes', () => {
    const run = runBench(3, stable(40), S5_SERVER)
    const s = summarize(run, { bootstrap: 0, seed: 1 })
    expect(s.littles.residualPermille).toBeGreaterThan(100)
  })

  test('the window matters: counting the empty beginning of a run puts the fill into the residual', () => {
    const run = runBench(3, { ...stable(8), warmupUs: 0 }, S5_SERVER)
    const unfilled = summarize(run, { bootstrap: 0, seed: 1 }).littles.residualPermille
    const filled = summarize(run, { bootstrap: 0, seed: 1, warmupUs: 10 * SEC }).littles.residualPermille
    expect(unfilled).toBeGreaterThan(filled)
  })
})
