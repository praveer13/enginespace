/*
 * The benchmark's server (ARCHITECTURE §5.6: "the step-loop model run coarse: async on, its step times from the S5 card").
 *
 * The server is `runStepLoop` with a host card of zeros, and these tests hold it to that: over 200 seeds [estimated] of workloads on
 * the front page's tick card and on two of S5's rows, every request's first and last token, the step count, the GPU's busy time and
 * the ghost tokens equal the step loop's. Around that are the cases worked by hand (a front-page tick world small enough to follow
 * on paper), the three things the coarse server adds to the step loop (stalls, a cold start, prefix hits), and the feed that lets a
 * closed-loop client send when a reply comes back.
 */
import { describe, expect, test } from 'bun:test'
import { below, between, chance, pick, rngFor } from '../../packages/sim/core'
import type { Us } from '../../packages/sim/core'
import { checkServer, runServer, s5Server } from '../../packages/sim/bench'
import type { ServerArrival, ServerModel } from '../../packages/sim/bench'
import { stepLoad } from '../../packages/sim/physics'
import { TICK_CARD, gpuCost, runStepLoop, s5Card } from '../../packages/sim/steploop'
import type { GpuCard, StepLoopConfig } from '../../packages/sim/steploop'
import { genWorkload } from '../../packages/sim/workload'
import type { ArrivalPlan, Dist, Workload } from '../../packages/sim/workload'
import { seeds } from '../seeds'
import { H100_TP4_GPU, ZERO_HOST } from './bench-support'

const arrival = (key: number, atUs: Us, o: { prompt?: number; output: number; cached?: number }): ServerArrival => ({
  key,
  atUs,
  promptTokens: o.prompt ?? 1,
  outputTokens: o.output,
  cachedTokens: o.cached ?? 0,
})

/** The front page's tick card with 4 slots: forward 4 ticks, and 1 more when the step admits a request. */
const TICKS: ServerModel = { maxNumSeqs: 4, maxBatchedTokens: 2048, chunkedPrefill: true, gpu: TICK_CARD }

// ---------------------------------------------------------------------------------------------------------------------------
// By hand

describe('worked by hand on the tick card (a step costs 4 ticks, and 5 when it admits a request)', () => {
  test('one request of 3 tokens: two steps are in flight, so a fourth step runs for a token that is thrown away', () => {
    // Step 0 (prefill) 0 to 5, step 1 (decode) 5 to 9, step 2 (decode) 9 to 13, and step 3 is scheduled before step 2 is read back,
    // when the engine does not yet know the request has stopped: it runs 13 to 17 as a ghost.
    const run = runServer(TICKS, [arrival(0, 0, { output: 3 })])
    expect(run.reqs).toEqual([{ key: 0, firstUs: 5, doneUs: 13, ghostTokens: 1 }])
    expect(run.steps).toBe(4)
    expect(run.gpuBusyUs).toBe(5 + 4 + 4 + 4)
    expect(run.ghostTokens).toBe(1)
    expect(run.endUs).toBe(13)
  })

  test('a second request that arrives at 3 is not scheduled until the first step is read back, so it waits for the fourth step', () => {
    // Step 0: A prefill, 0 to 5. Step 1: A decode, 5 to 9. B arrives at 3, but step 1 was scheduled at 0. Step 0 is read back at 5, and
    // step 2 is scheduled then: A decode and B prefill, which costs 5, 9 to 14. Step 1 is read back at 9. Step 3: A (a ghost) and B
    // decode, 14 to 18. Step 2 is read back at 14: A's third token, and B's first. Step 4: B (a ghost), 18 to 22; step 3 is read back at 18.
    const run = runServer(TICKS, [arrival(0, 0, { output: 3 }), arrival(1, 3, { output: 2 })])
    expect(run.reqs).toEqual([
      { key: 0, firstUs: 5, doneUs: 14, ghostTokens: 1 },
      { key: 1, firstUs: 14, doneUs: 18, ghostTokens: 1 },
    ])
    expect(run.steps).toBe(5)
    expect(run.gpuBusyUs).toBe(5 + 4 + 5 + 4 + 4)
  })

  test('an idle engine waits for the next request and starts when it arrives', () => {
    const run = runServer(TICKS, [arrival(0, 0, { output: 1 }), arrival(1, 100, { output: 1 })])
    // A request of one token finishes with its prefill. The engine still launches the ghost step it scheduled, then idles until 100.
    expect(run.reqs[0]).toMatchObject({ firstUs: 5, doneUs: 5 })
    expect(run.reqs[1]).toMatchObject({ firstUs: 105, doneUs: 105 })
  })

  test('the cap on running requests holds a request back until one is read back as finished', () => {
    const one: ServerModel = { ...TICKS, maxNumSeqs: 1 }
    const run = runServer(one, [arrival(0, 0, { output: 1 }), arrival(1, 0, { output: 1 })])
    // A prefills 0 to 5 and finishes when read back at 5. B can only be admitted after that, in step 2: 9 to 14 (step 1 is A's ghost, 5 to 9).
    expect(run.reqs[0]).toMatchObject({ firstUs: 5, doneUs: 5, ghostTokens: 1 })
    expect(run.reqs[1]).toMatchObject({ firstUs: 14, doneUs: 14 })
  })

  test('requests that arrive together are served in key order', () => {
    const one: ServerModel = { ...TICKS, maxNumSeqs: 1 }
    const run = runServer(one, [arrival(1, 0, { output: 1 }), arrival(0, 0, { output: 1 })])
    expect(run.reqs[0].firstUs).toBeLessThan(run.reqs[1].firstUs)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Against the step loop

type World = 'tick' | 's5-in-gpu' | 's5-on-cpu'

interface Scenario {
  readonly world: World
  readonly workload: Workload
  readonly model: ServerModel
  readonly cfg: StepLoopConfig
  readonly gpu: GpuCard
  readonly arrivals: readonly ServerArrival[]
}

/** A workload on a card, drawn from a seed: its arrivals, lengths, slots, budget and chunking, so that 200 seeds cover every lever. */
function scenario(seed: number): Scenario {
  const rng = rngFor(seed, 'test/bench/server')
  const world: World = pick(rng, ['tick', 's5-in-gpu', 's5-on-cpu'] as const)
  const ticks = world === 'tick'
  const gpu: GpuCard = ticks ? TICK_CARD : s5Card(pick(rng, ['h100-vllm-0-10-2-fp8', 'b200-vllm-0-10-2-fp8', 'b200-vllm-0-10-2-nvfp4'] as const), pick(rng, [1, 2, 4, 8]), world === 's5-in-gpu' ? 'in-gpu' : 'on-cpu')
  const requests = between(rng, 1, 40)
  let arrivals: ArrivalPlan
  const kind = below(rng, 3)
  if (kind === 0) arrivals = { kind: 'burst', atUs: ticks ? between(rng, 0, 5) : between(rng, 0, 3000) }
  else if (kind === 1) arrivals = { kind: 'even', gapUs: ticks ? between(rng, 0, 9) : between(rng, 0, 30_000) }
  else arrivals = { kind: 'poisson', ratePerSMilli: ticks ? 166_666_667 : between(rng, 2000, 120_000) }
  const prompt: Dist = ticks
    ? pick(rng, [{ kind: 'const', value: 1 }, { kind: 'uniform', lo: 1, hi: 3 }] as Dist[])
    : pick(rng, [{ kind: 'const', value: 1 }, { kind: 'uniform', lo: 1, hi: 64 }, { kind: 'uniform', lo: 16, hi: 900 }, { kind: 'menu', values: [8, 64, 700, 1500], weights: [6, 5, 3, 1] }] as Dist[])
  const output: Dist = pick(rng, [{ kind: 'uniform', lo: 1, hi: 24 }, { kind: 'menu', values: [1, 2, 4, 8, 16, 40], weights: [30, 25, 20, 12, 8, 5] }, { kind: 'const', value: 3 }] as Dist[])
  const workload = genWorkload(seed, { requests, arrivals, lengths: { kind: 'dists', prompt, output } })
  const longest = Math.max(...workload.reqs.map((r) => r.promptTokens))
  const chunkedPrefill = chance(rng, 700)
  const drawn = ticks ? pick(rng, [2, 4, 16, 2048]) : pick(rng, [32, 128, 512, 2048, 8192])
  // Without chunked prefill a prompt must fit the budget whole, or the run refuses it.
  const maxBatchedTokens = chunkedPrefill ? drawn : Math.max(drawn, longest)
  const maxNumSeqs = ticks ? between(rng, 1, 6) : between(rng, 1, 64)
  const cfg: StepLoopConfig = { maxNumSeqs, maxBatchedTokens, chunkedPrefill, asyncScheduling: true, inputIds: 'device', graphs: { mode: 'NONE', captureSizes: [] } }
  const model: ServerModel = { maxNumSeqs, maxBatchedTokens, chunkedPrefill, gpu }
  return { world, workload, model, cfg, gpu, arrivals: workload.reqs.map((r) => arrival(r.id, r.dueUs, { prompt: r.promptTokens, output: r.outputTokens })) }
}

const SEEDS = seeds(1)

describe(`against runStepLoop with a host card of zeros and async scheduling on, over ${SEEDS.length} seeds`, () => {
  test('every request has the first and last token the step loop gives it, and the run has its steps, busy time and ghost tokens', () => {
    const worlds = new Set<World>()
    for (const seed of SEEDS) {
      const s = scenario(seed)
      worlds.add(s.world)
      const fine = runStepLoop(s.workload, s.cfg, ZERO_HOST, s.gpu, { horizonUs: 600_000_000_000 })
      const coarse = runServer(s.model, s.arrivals)
      for (const r of fine.reqs) {
        const c = coarse.reqs[r.id]
        expect(c.firstUs - r.dueUs, `seed ${seed}, request ${r.id}: first token`).toBe(r.ttftUs as number)
        expect(c.doneUs - r.dueUs, `seed ${seed}, request ${r.id}: last token`).toBe(r.e2eUs as number)
        expect(c.ghostTokens, `seed ${seed}, request ${r.id}: ghost tokens`).toBe(r.ghostTokens)
      }
      expect(coarse.steps, `seed ${seed}: steps`).toBe(fine.summary.steps)
      expect(coarse.gpuBusyUs, `seed ${seed}: GPU busy`).toBe(fine.summary.gpuBusyUs)
      expect(coarse.ghostTokens, `seed ${seed}: ghost tokens`).toBe(fine.summary.ghostTokens)
    }
    // The seeds exercised the tick card and both placements of S5's host term.
    expect([...worlds].sort()).toEqual(['s5-in-gpu', 's5-on-cpu', 'tick'])
  })

  test('the cards differ, so the comparison would notice a coarse server that priced steps from the wrong one', () => {
    const arrivals = [arrival(0, 0, { prompt: 512, output: 8 })]
    const on = (gpu: GpuCard): Us => runServer({ ...TICKS, gpu }, arrivals).reqs[0].doneUs
    const times = [on(s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu')), on(s5Card('b200-vllm-0-10-2-fp8', 4, 'in-gpu')), on(s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu')), on(TICK_CARD)]
    expect(new Set(times).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// What the coarse server adds

describe('stalls: the engine\'s main thread is frozen, and the GPU finishes what is already queued', () => {
  test('a read-back inside a stall waits for its end, so tokens reach the client late and the steps behind it start late', () => {
    // Without the stall the request's tokens are read at 5, 9 and 13. The stall [2, 20) holds the first read-back to 20, and the
    // second and third find the thread free at 20 and read what the GPU finished meanwhile.
    const run = runServer({ ...TICKS, stalls: [{ atUs: 2, forUs: 18 }] }, [arrival(0, 0, { output: 3 })])
    // Step 2 launches at 20 and runs 20 to 24; the second token is read at 20, the third at 24.
    expect(run.reqs[0]).toMatchObject({ firstUs: 20, doneUs: 24 })
  })

  test('no step is launched inside a stall: a request that arrives during one is first scheduled when it ends', () => {
    const run = runServer({ ...TICKS, stalls: [{ atUs: 10, forUs: 90 }] }, [arrival(0, 50, { output: 1 })])
    expect(run.reqs[0]).toMatchObject({ firstUs: 105 })
  })

  test('the stalls of a server are in order and do not overlap', () => {
    expect(() => checkServer({ ...TICKS, stalls: [{ atUs: 10, forUs: 5 }, { atUs: 12, forUs: 5 }] })).toThrow(/do not overlap/)
    expect(() => checkServer({ ...TICKS, stalls: [{ atUs: 10, forUs: 0 }] })).toThrow(/forUs/)
    expect(() => checkServer({ ...TICKS, stalls: [{ atUs: 10, forUs: 5 }, { atUs: 15, forUs: 5 }] })).not.toThrow()
  })

  test('a lone request finishes no earlier for a stall, over 40 seeds (with several, batching can reorder who waits, so no such order holds)', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const s = scenario(seed)
      const alone = [{ ...s.arrivals[0], key: 0 }]
      const free = runServer(s.model, alone)
      const at = Math.floor((free.endUs * (seed % 5 + 1)) / 7)
      const stalled = runServer({ ...s.model, stalls: [{ atUs: at, forUs: Math.max(1, Math.floor(free.endUs / 10)) }] }, alone)
      expect(stalled.reqs[0].firstUs, `seed ${seed}`).toBeGreaterThanOrEqual(free.reqs[0].firstUs)
      expect(stalled.reqs[0].doneUs, `seed ${seed}`).toBeGreaterThanOrEqual(free.reqs[0].doneUs)
    }
  })

  test('no token reaches the client inside a stall, over 40 seeds', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const s = scenario(seed)
      const free = runServer(s.model, s.arrivals)
      const stalls = [
        { atUs: Math.floor(free.endUs / 5), forUs: Math.max(1, Math.floor(free.endUs / 9)) },
        { atUs: Math.floor(free.endUs / 2), forUs: Math.max(1, Math.floor(free.endUs / 11)) },
      ]
      const run = runServer({ ...s.model, stalls }, s.arrivals)
      expect(run.reqs).toHaveLength(s.arrivals.length)
      for (const [i, r] of run.reqs.entries()) {
        expect(r.firstUs, `seed ${seed}, request ${i}`).toBeGreaterThanOrEqual(s.arrivals[i].atUs)
        expect(r.doneUs, `seed ${seed}, request ${i}`).toBeGreaterThanOrEqual(r.firstUs)
        for (const stall of stalls) {
          for (const t of [r.firstUs, r.doneUs]) expect(t >= stall.atUs && t < stall.atUs + stall.forUs, `seed ${seed}, request ${i}: a token at ${t} inside ${JSON.stringify(stall)}`).toBe(false)
        }
      }
    }
  })
})

describe('the server on the harness S5 was fitted on', () => {
  test('is 64 sequences, an 8,192-token budget and chunked prefill, priced by the row asked for, and the host term stays inside the step unless asked', () => {
    expect(s5Server('h100-vllm-0-10-2-fp8', 4)).toEqual({ maxNumSeqs: 64, maxBatchedTokens: 8192, chunkedPrefill: true, gpu: s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu') })
    expect(s5Server('b200-vllm-0-10-2-fp8', 8, 'on-cpu').gpu).toEqual(s5Card('b200-vllm-0-10-2-fp8', 8, 'on-cpu'))
    expect(() => s5Server('h100-vllm-0-10-2-fp8', 0)).toThrow(/tp/)
  })
})

describe('a cold start: steps whose forward starts before the end of it take longer', () => {
  test('a step that starts cold takes slowdown/1000 times as long, and one that starts warm does not', () => {
    // Step 0 starts at 0, cold: 5 × 2 = 10 ticks. Step 1 launches at 0 but its forward starts when the stream is free, at 10: warm.
    const run = runServer({ ...TICKS, cold: { untilUs: 6, slowdownPermille: 2000 } }, [arrival(0, 0, { output: 2 })])
    expect(run.reqs[0]).toMatchObject({ firstUs: 10, doneUs: 14 })
    expect(run.gpuBusyUs).toBe(10 + 4 + 4)
  })

  test('a slowdown below 1,000 would be a warm-up that speeds the server up, and is refused', () => {
    expect(() => checkServer({ ...TICKS, cold: { untilUs: 6, slowdownPermille: 900 } })).toThrow(/slowdownPermille/)
  })
})

describe('prefix hits: the cached leading tokens of a prompt are not prefilled, though their KV is read', () => {
  test('the first step costs what the S5 card says for the uncached tokens after the cached ones, and less than the whole prompt', () => {
    const one: ServerModel = { maxNumSeqs: 1, maxBatchedTokens: 8192, chunkedPrefill: true, gpu: H100_TP4_GPU }
    const price = (chunk: number, done: number): Us => {
      const load = stepLoad([{ kind: 'prefill', chunk, done }])
      return gpuCost(H100_TP4_GPU, { seqs: 1, prefillSeqs: 1, tokens: load.tokens, kvTokens: load.kvTokens, attnPairs: load.attnPairs }).gpuUs
    }
    const cold = runServer(one, [arrival(0, 0, { prompt: 2000, output: 1 })])
    const warm = runServer(one, [arrival(0, 0, { prompt: 2000, output: 1, cached: 1984 })])
    expect(cold.reqs[0].firstUs).toBe(price(2000, 0))
    expect(warm.reqs[0].firstUs).toBe(price(16, 1984))
    expect(warm.reqs[0].firstUs).toBeLessThan(cold.reqs[0].firstUs / 4)
  })

  test('at least the last token is computed, so a request cannot cache its whole prompt', () => {
    expect(() => runServer(TICKS, [arrival(0, 0, { prompt: 16, output: 1, cached: 16 })])).toThrow(/at least the last/)
    expect(() => runServer(TICKS, [arrival(0, 0, { prompt: 17, output: 1, cached: 16 })])).not.toThrow()
  })

  test('without chunked prefill, the tokens to compute must fit the budget, and a cache hit can make a long prompt fit', () => {
    const whole: ServerModel = { ...TICKS, chunkedPrefill: false, maxBatchedTokens: 32 }
    expect(() => runServer(whole, [arrival(0, 0, { prompt: 64, output: 1 })])).toThrow(/could never be scheduled/)
    expect(() => runServer(whole, [arrival(0, 0, { prompt: 64, output: 1, cached: 48 })])).not.toThrow()
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The feed

describe('the feed: a request that finishes can bring the next one', () => {
  test('a client that sends again when its reply arrives, after a think time, is served as if the request had always been there', () => {
    // One client, three requests of 2 tokens, 7 ticks of thinking between a reply and the next send.
    const sends: number[] = []
    let key = 0
    const initial = [arrival(key++, 0, { output: 2 })]
    sends.push(0)
    const run = runServer(TICKS, initial, (_k, doneUs, feed) => {
      if (key >= 3) return
      sends.push(doneUs + 7)
      feed.arrive(arrival(key++, doneUs + 7, { output: 2 }))
    })
    expect(run.reqs).toHaveLength(3)
    // The same three requests handed over at the start, at the times the client sent them, give the same service.
    const replay = runServer(TICKS, sends.map((at, k) => arrival(k, at, { output: 2 })))
    expect(run.reqs).toEqual(replay.reqs)
    for (let k = 1; k < 3; k++) expect(sends[k]).toBe(run.reqs[k - 1].doneUs + 7)
  })

  test('an arrival in the engine\'s past is refused, since the engine has already moved on', () => {
    expect(() =>
      runServer(TICKS, [arrival(0, 0, { output: 1 })], (_k, doneUs, feed) => {
        feed.arrive(arrival(1, doneUs - 1, { output: 1 }))
      }),
    ).toThrow(/before the engine's clock/)
  })

  test('a duplicate key, a gap in the keys and a malformed request are all refused', () => {
    expect(() => runServer(TICKS, [arrival(0, 0, { output: 1 }), arrival(0, 1, { output: 1 })])).toThrow(/two arrivals have the key 0/)
    expect(() => runServer(TICKS, [arrival(1, 0, { output: 1 })])).toThrow(/dense from 0/)
    expect(() => runServer(TICKS, [arrival(0, 0, { output: 0 })])).toThrow(/outputTokens/)
    expect(() => runServer(TICKS, [arrival(0, -1, { output: 1 })])).toThrow(/arrival time/)
    expect(() => runServer({ ...TICKS, maxNumSeqs: 0 }, [])).toThrow(/maxNumSeqs/)
    expect(() => runServer({ ...TICKS, maxBatchedTokens: 0 }, [])).toThrow(/maxBatchedTokens/)
  })

  test('a run with no requests is empty', () => {
    expect(runServer(TICKS, [])).toEqual({ reqs: [], steps: 0, gpuBusyUs: 0, ghostTokens: 0, endUs: 0 })
  })
})
