/*
 * The step-loop model's rules (ARCHITECTURE §5.3; WORLD §2.1 to §2.6; content/cards/trace-room-steploop.md), one at a time, on cases
 * small enough to work by hand. The task's acceptance checks are in steploop.test.ts, and what both files share is in steploop-support.ts.
 *
 * The hand cases use the front page's tick card (a step is 2 ticks of planning, 4 of forward with 1 more on an admission, and 1 of
 * reading), or the tick card with other host costs, so that every span can be added up on paper. Each comment gives the arithmetic.
 * Two oracles that do not share the loop's code then check 200 seeds of requests that are all due at once: one rebuilds every span
 * from the steps' costs, the other forms the batches from the scheduler's rules alone.
 */
import { describe, expect, test } from 'bun:test'
import type { Us } from '../../packages/sim/core'
import { HOST_PRESETS } from '../../packages/sim/host'
import type { HostCard } from '../../packages/sim/host'
import { PHYSICS_ROWS, stepCard } from '../../packages/sim/physics'
import {
  STEPLOOP_CARD_ID,
  TICK_CARD,
  defaultCaptureSizes,
  gpuCost,
  gpuLayers,
  paddedSize,
  runStepLoop,
  s5Card,
} from '../../packages/sim/steploop'
import type { GpuCard, GpuWork, Span, StepLoopConfig, TickGpuCard } from '../../packages/sim/steploop'
import { checkDependency, placeLaunch, placeReadback, timelineBuilder } from '../../packages/sim/steploop/events'
import { bubblesBefore } from '../../packages/sim/steploop/metrics'
import { genWorkload } from '../../packages/sim/workload'
import { FOREVER, HARNESS, TRAY, burstTimeline, checkInvariants, config, handWorkload, referenceBatches, req, scenario } from './steploop-support'

const tick = (cfg: StepLoopConfig, w = handWorkload([{ output: 1 }]), horizonUs: Us = FOREVER) => runStepLoop(w, cfg, TICK_CARD, TICK_CARD, { horizonUs })
const spans = (run: ReturnType<typeof tick>, lane: 'cpu-main' | 'gpu-stream') => run.lanes[lane].map((s) => [s.step, s.kind, s.startUs, s.endUs])

// ---------------------------------------------------------------------------------------------------------------------------
// Hand cases on the tick card

describe('one request of three tokens on the tick card', () => {
  const w = handWorkload([{ output: 3 }])

  test('without overlap, each step is 2 ticks of planning, 4 of forward (5 for the admission) and 1 of reading, one after another', () => {
    const run = tick(config(TRAY, false), w)
    // Step 0 admits the request: plan [0,2], forward [2,7], read [7,8] (token 1). Step 1: plan [8,10], forward [10,14], read [14,15].
    // Step 2: plan [15,17], forward [17,21], read [21,22] (token 3, the last).
    expect(spans(run, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [0, 'sync', 7, 8],
      [1, 'schedule', 8, 10],
      [1, 'sync', 14, 15],
      [2, 'schedule', 15, 17],
      [2, 'sync', 21, 22],
    ])
    expect(spans(run, 'gpu-stream')).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 10, 14],
      [2, 'forward', 17, 21],
    ])
    // The GPU is busy 5 + 4 + 4 = 13 of 22 ticks. Each of the two gaps between forwards is read 1 + plan 2 = 3 ticks of bubble.
    expect(run.summary).toEqual({
      clockUs: 22,
      steps: 3,
      finished: 1,
      usefulTokens: 3,
      ghostTokens: 0,
      paddedTokens: 0,
      gpuBusyUs: 13,
      gpuBusyPermille: 591, // 13 / 22 = 0.5909
      bubbleUs: 6,
      bubbles: 2,
      launches: 0,
      eagerSteps: 3,
      tokensPerSMilli: 136_363_636, // 3 tokens in 22 ticks, times 10^9, rounded
      ttftP50Us: 8,
      ttftP99Us: 8,
      tpotP50Us: 7, // (22 - 8) / 2
      tpotP99Us: 7,
    })
    expect(run.reqs).toEqual([{ id: 0, dueUs: 0, tokens: 3, ghostTokens: 0, finished: true, ttftUs: 8, tpotUs: 7, e2eUs: 22 }])
    expect(run.steps.map((s) => [s.seqs, s.prefillSeqs, s.ghostSeqs, s.tokens, s.paddedTokens, s.graph, s.gpuUs, s.bubbleUs])).toEqual([
      [1, 1, 0, 1, 1, 'off', 5, 0],
      [1, 0, 0, 1, 1, 'off', 4, 3],
      [1, 0, 0, 1, 1, 'off', 4, 3],
    ])
    expect(run.violations).toEqual([])
  })

  test('with overlap, the next step is planned during this forward, the gaps close, and the stop leaves one ghost token', () => {
    const run = tick(config(TRAY, true), w)
    // The CPU plans step 0 [0,2] and step 1 [2,4], then reads step 0 back [7,8] (it waits for the forward, which ends at 7) and plans
    // step 2 [8,10]; reads step 1 [11,12], plans step 3 [12,14]; reads step 2 [15,16], which carries the last token; and reads step 3
    // [19,20], whose token for the stopped request is thrown away. The forwards run back to back: [2,7] [7,11] [11,15] [15,19].
    expect(spans(run, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [1, 'schedule', 2, 4],
      [0, 'sync', 7, 8],
      [2, 'schedule', 8, 10],
      [1, 'sync', 11, 12],
      [3, 'schedule', 12, 14],
      [2, 'sync', 15, 16],
      [3, 'sync', 19, 20],
    ])
    expect(spans(run, 'gpu-stream')).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 7, 11],
      [2, 'forward', 11, 15],
      [3, 'forward', 15, 19],
    ])
    expect(run.summary.clockUs).toBe(20)
    expect([run.summary.gpuBusyUs, run.summary.gpuBusyPermille, run.summary.bubbleUs, run.summary.bubbles]).toEqual([17, 850, 0, 0])
    expect([run.summary.usefulTokens, run.summary.ghostTokens, run.summary.steps]).toEqual([3, 1, 4])
    expect(run.reqs).toEqual([{ id: 0, dueUs: 0, tokens: 3, ghostTokens: 1, finished: true, ttftUs: 8, tpotUs: 4, e2eUs: 16 }])
    expect(run.steps.map((s) => s.ghostSeqs)).toEqual([0, 0, 0, 1])
    expect(run.violations).toEqual([])
  })

  test('with overlap and the CPU writing input ids, every step after the first reads a token that is not sampled yet', () => {
    const run = tick({ ...config(TRAY, true), inputIds: 'host' }, w)
    // Step 1 is prepared while step 0 is in flight, step 2 while step 1 is (step 0 has been read back by then), and step 3 the same.
    expect(run.violations).toEqual([
      { kind: 'read-before-sample', step: 1, atUs: 4, rows: 1 },
      { kind: 'read-before-sample', step: 2, atUs: 10, rows: 1 },
      { kind: 'read-before-sample', step: 3, atUs: 14, rows: 1 },
    ])
    // The timing is the same as with device-side inputs: the model flags the read, and does not wait for it.
    expect(run.lanes).toStrictEqual(tick(config(TRAY, true), w).lanes)
    // Without overlap the previous step has been read back, so the same configuration is sound.
    expect(tick({ ...config(TRAY, false), inputIds: 'host' }, w).violations).toEqual([])
  })
})

describe('two requests and one slot on the tick card', () => {
  // A needs two tokens and B one, and the tray holds one request.
  const w = handWorkload([{ output: 2 }, { output: 1 }])
  const one = { ...TRAY, maxNumSeqs: 1 }

  test('without overlap, the slot is refilled at the step boundary after the stop is read', () => {
    const run = tick(config(one, false), w)
    // A: plan [0,2], forward [2,7], read [7,8] (token 1). Plan [8,10], forward [10,14], read [14,15] (token 2: A stops).
    // B takes the slot: plan [15,17], forward [17,22] (an admission), read [22,23] (its only token).
    expect(spans(run, 'gpu-stream')).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 10, 14],
      [2, 'forward', 17, 22],
    ])
    expect(run.reqs).toEqual([
      { id: 0, dueUs: 0, tokens: 2, ghostTokens: 0, finished: true, ttftUs: 8, tpotUs: 7, e2eUs: 15 },
      { id: 1, dueUs: 0, tokens: 1, ghostTokens: 0, finished: true, ttftUs: 23, tpotUs: null, e2eUs: 23 },
    ])
    expect(run.summary.clockUs).toBe(23)
    expect([run.summary.gpuBusyUs, run.summary.gpuBusyPermille, run.summary.bubbleUs, run.summary.bubbles]).toEqual([14, 609, 6, 2])
    // Percentiles are nearest rank: of two TTFTs, the median is the smaller and the p99 the larger.
    expect([run.summary.ttftP50Us, run.summary.ttftP99Us, run.summary.tpotP50Us, run.summary.tpotP99Us]).toEqual([8, 23, 7, 7])
  })

  test('with overlap, the slot is held one step longer by a ghost, because the stop is read a step too late', () => {
    const run = tick(config(one, true), w)
    // Steps 0 and 1 are A's (A's second token is in step 1). Step 2 is planned [8,10] before A's stop is read, so A rides it again
    // and B waits; its token is thrown away. A's stop is read at 12 [11,12]. Then B is admitted in step 3 [12,14], and step 4 is
    // planned [16,18] for B again, before B's single token is read, so B has a ghost too.
    expect(run.steps.map((s) => [s.seqs, s.prefillSeqs, s.ghostSeqs, s.gpuUs, s.bubbleUs])).toEqual([
      [1, 1, 0, 5, 0],
      [1, 0, 0, 4, 0],
      [1, 0, 1, 4, 0],
      [1, 1, 0, 5, 0],
      [1, 0, 1, 4, 0],
    ])
    expect(spans(run, 'gpu-stream')).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 7, 11],
      [2, 'forward', 11, 15],
      [3, 'forward', 15, 20],
      [4, 'forward', 20, 24],
    ])
    expect(run.reqs).toEqual([
      { id: 0, dueUs: 0, tokens: 2, ghostTokens: 1, finished: true, ttftUs: 8, tpotUs: 4, e2eUs: 12 },
      { id: 1, dueUs: 0, tokens: 1, ghostTokens: 1, finished: true, ttftUs: 21, tpotUs: null, e2eUs: 21 },
    ])
    expect(run.summary.clockUs).toBe(25)
    expect([run.summary.gpuBusyUs, run.summary.ghostTokens, run.summary.usefulTokens]).toEqual([22, 2, 3])
  })
})

describe('static batching on the tick card', () => {
  // Three requests of 1, 3 and 1 tokens on two slots. A and B are the first batch, and C waits.
  const w = handWorkload([{ output: 1 }, { output: 3 }, { output: 1 }])
  const two = { ...TRAY, maxNumSeqs: 2 }

  test('admits nothing while any request of the batch is live, so the slot a stopped request leaves stays empty', () => {
    const run = tick({ ...config(two, false), batching: 'static' }, w)
    // Step 0 admits A and B [0,8]. A stops, and B runs alone for steps 1 and 2 [8,22] with a slot empty beside it. Only when B has
    // stopped is C admitted in step 3 [22,30].
    expect(run.steps.map((s) => [s.seqs, s.prefillSeqs])).toEqual([[2, 2], [1, 0], [1, 0], [1, 1]])
    expect(spans(run, 'gpu-stream')).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 10, 14],
      [2, 'forward', 17, 21],
      [3, 'forward', 24, 29],
    ])
    expect(run.summary.clockUs).toBe(30)
    expect(run.reqs.map((r) => [r.ttftUs, r.e2eUs])).toEqual([
      [8, 8],
      [8, 22],
      [30, 30],
    ])
  })

  test('is the same run as continuous batching when no slot is ever left empty, and a slower one when slots are', () => {
    const continuous = tick(config(two, false), w)
    // Continuous batching admits C in step 1, beside B, and finishes at 23 instead of 30.
    expect(continuous.steps.map((s) => s.seqs)).toEqual([2, 2, 1])
    expect(continuous.summary.clockUs).toBe(23)
    expect(continuous.reqs.map((r) => r.ttftUs)).toEqual([8, 8, 16])
    const full = handWorkload([{ output: 3 }, { output: 3 }])
    expect(tick({ ...config(two, false), batching: 'static' }, full)).toStrictEqual(tick(config(two, false), full))
    expect(tick({ ...config(two, false), batching: 'continuous' }, w)).toStrictEqual(continuous)
  })

  test('with overlap, the batch is not over until the engine has read the stop of its last request, so its ghost step is part of it', () => {
    const run = tick({ ...config(two, true), batching: 'static' }, w)
    // Steps 0 and 1 carry A and B (A rides step 1 as a ghost), step 2 carries B (its third token), step 3 carries B once more as a
    // ghost. Step 4 admits C only after B's stop was read at 16, step 5 carries C as a ghost.
    expect(run.steps.map((s) => [s.seqs, s.prefillSeqs, s.ghostSeqs])).toEqual([
      [2, 2, 0],
      [2, 0, 1],
      [1, 0, 0],
      [1, 0, 1],
      [1, 1, 0],
      [1, 0, 1],
    ])
    expect(run.reqs.map((r) => [r.ttftUs, r.e2eUs, r.ghostTokens])).toEqual([
      [8, 8, 1],
      [8, 16, 1],
      [25, 25, 1],
    ])
    expect(run.summary.clockUs).toBe(29)
    expect(run.summary.gpuBusyUs).toBe(26)
  })

  test('a batching that is neither continuous nor static is refused', () => {
    expect(() => tick({ ...config(two, false), batching: 'dynamic' as never })).toThrow(/batching is 'continuous' or 'static', got dynamic/)
  })
})

describe('when requests arrive', () => {
  test('an idle engine waits for the next request, and an idle GPU beside an idle CPU is no bubble', () => {
    // A is due at 0 and B at 50, each for one token. A: plan [0,2], forward [2,7], read [7,8]. The engine then has nothing to do until
    // 50. B: plan [50,52], forward [52,57], read [57,58]. Between the forwards the GPU is idle for 45 ticks, and the CPU is busy for
    // 3 of them: the read at [7,8] and the plan at [50,52]. Only those 3 are a bubble.
    const run = tick(config(TRAY, false), handWorkload([{ output: 1 }, { due: 50, output: 1 }]))
    expect(spans(run, 'gpu-stream')).toEqual([
      [0, 'forward', 2, 7],
      [1, 'forward', 52, 57],
    ])
    expect(run.summary.bubbleUs).toBe(3)
    expect(run.steps.map((s) => s.bubbleUs)).toEqual([0, 3])
    expect(run.reqs.map((r) => [r.ttftUs, r.e2eUs])).toEqual([
      [8, 8],
      [8, 8],
    ])
    expect(run.summary.clockUs).toBe(58)
  })

  test('the first step of a run waits for its first request, and has no bubble before it', () => {
    const run = tick(config(TRAY, false), handWorkload([{ due: 100, output: 1 }]))
    expect(spans(run, 'cpu-main')[0]).toEqual([0, 'schedule', 100, 102])
    expect(run.summary).toMatchObject({ clockUs: 108, gpuBusyUs: 5, bubbleUs: 0, bubbles: 0 })
    expect(run.reqs[0].ttftUs).toBe(8)
  })

  test('a request that arrives while a step is being planned is scheduled in the next step, not this one', () => {
    // A is due at 0. B is due at 1, while A's step is being planned [0,2]: B is not on the input queue yet when the scheduler runs.
    const run = tick(config(TRAY, false), handWorkload([{ output: 2 }, { due: 1, output: 1 }]))
    expect(run.steps.map((s) => s.seqs)).toEqual([1, 2])
    expect(run.steps.map((s) => s.prefillSeqs)).toEqual([1, 1])
  })

  test('latency counts from the due time, so a request that waits for a slot shows it in its TTFT', () => {
    const run = tick(config({ ...TRAY, maxNumSeqs: 1 }, false), handWorkload([{ output: 3 }, { due: 5, output: 1 }]))
    // B is due at 5 and takes the slot when A leaves at 22: plan [22,24], forward [24,29], read [29,30].
    expect(run.reqs[1].ttftUs).toBe(30 - 5)
  })
})

describe('chunked prefill, the token budget and the caps', () => {
  // Host costs that depend on the batch: 1 + 2 per row to schedule, 1 per token to prepare, 2 to sync and 3 per row to sample, and a
  // tick card with a forward of 10 and 3 more on a prefill. Prefills are cut to the budget.
  const host: HostCard = { ...TICK_CARD, scheduleBaseUs: 1, schedulePerSeqUs: 2, prepPerTokenUs: 1, syncUs: 2, samplePerSeqUs: 3 }
  const gpu: TickGpuCard = { ...TICK_CARD, forwardUs: 10, admitUs: 3 }
  const run = (w: ReturnType<typeof handWorkload>, cfg: StepLoopConfig) => runStepLoop(w, cfg, host, gpu, { horizonUs: FOREVER })

  test('a prompt longer than the budget is cut into chunks, and the chunk that completes it samples the first token', () => {
    const r = run(handWorkload([{ prompt: 5, output: 2 }]), config({ maxNumSeqs: 2, maxBatchedTokens: 2, chunkedPrefill: true, inputIds: 'device' }, false))
    // Four steps: chunks of 2, 2 and 1 tokens, then one decode.
    expect(r.steps.map((s) => [s.tokens, s.prefillSeqs])).toEqual([[2, 1], [2, 1], [1, 1], [1, 0]])
    // Step 0: plan 1 + 2 = 3 [0,3], prepare 2 [3,5], forward 13 [5,18], sync [18,20], sample 3 [20,23]. Step 1: [23,26] [26,28] [28,41] [41,43] [43,46].
    // Step 2 (1 token): [46,49] [49,50] [50,63] [63,65] [65,68], and token 1 is out at 68. Step 3 (a decode, so no admission): [68,71] [71,72] [72,82] [82,84] [84,87].
    expect(spans(r, 'gpu-stream')).toEqual([
      [0, 'forward', 5, 18],
      [1, 'forward', 28, 41],
      [2, 'forward', 50, 63],
      [3, 'forward', 72, 82],
    ])
    expect(r.reqs).toEqual([{ id: 0, dueUs: 0, tokens: 2, ghostTokens: 0, finished: true, ttftUs: 68, tpotUs: 19, e2eUs: 87 }])
    // The gaps between the forwards are all CPU: 10, 9 and 9 ticks.
    expect(r.steps.map((s) => s.bubbleUs)).toEqual([0, 10, 9, 9])
    expect(r.summary).toMatchObject({ clockUs: 87, gpuBusyUs: 49, gpuBusyPermille: 563, bubbleUs: 28, bubbles: 3 })
  })

  test('without chunked prefill a prompt is admitted whole, and one that does not fit what is left of the budget blocks those behind it', () => {
    const r = run(handWorkload([{ prompt: 3, output: 1 }, { prompt: 5, output: 1 }, { prompt: 1, output: 1 }]), config({ maxNumSeqs: 8, maxBatchedTokens: 6, chunkedPrefill: false, inputIds: 'device' }, false))
    // Step 0: request 0 (3 tokens) fits, leaving 3. Request 1 (5 tokens) does not, and request 2 (1 token) waits behind it, though it would fit.
    // Step 1: request 1 (5 tokens) fits, leaving 1; request 2 (1 token) fits too.
    expect(r.steps.map((s) => [s.seqs, s.tokens])).toEqual([[1, 3], [2, 6]])
  })

  test('a run refuses a prompt longer than the budget when it may not cut it, before it runs anything', () => {
    const w = handWorkload([{ output: 1 }, { prompt: 7, output: 1 }])
    const cfg = config({ maxNumSeqs: 4, maxBatchedTokens: 6, chunkedPrefill: false, inputIds: 'device' }, false)
    expect(() => run(w, cfg)).toThrow(/request 1 has 7 prompt tokens, more than maxBatchedTokens \(6\)/)
    expect(() => run(w, { ...cfg, chunkedPrefill: true })).not.toThrow()
  })

  test('running requests come first, then waiting ones in arrival order, and the cap on running requests holds', () => {
    // Five requests due at once, a cap of 3 and plenty of budget: three are admitted in step 0, and the others wait for slots.
    const r = run(handWorkload([{ output: 2 }, { output: 4 }, { output: 4 }, { output: 1 }, { output: 1 }]), config({ maxNumSeqs: 3, maxBatchedTokens: 100, chunkedPrefill: true, inputIds: 'device' }, false))
    expect(r.steps[0].seqs).toBe(3)
    for (const step of r.steps) expect(step.seqs).toBeLessThanOrEqual(3)
    // FCFS: requests 0, 1 and 2 are first in, so request 3 starts after one of them stops, and request 4 after request 3 or another.
    const first = r.reqs.map((q) => q.ttftUs!)
    expect(first[3]).toBeGreaterThan(first[0])
    expect(first[4]).toBeGreaterThan(first[0])
    expect(first[0]).toBeLessThanOrEqual(first[1])
    expect(first[1]).toBe(first[2])
  })

  test('a budget smaller than the running requests schedules the earliest-admitted first, and starves the rest until they get a turn', () => {
    // Two requests in a 1-token budget: only request 0 is stepped until it stops, and then request 1.
    const r = run(handWorkload([{ output: 3 }, { output: 2 }]), config({ maxNumSeqs: 2, maxBatchedTokens: 1, chunkedPrefill: true, inputIds: 'device' }, false))
    expect(r.steps.every((s) => s.seqs === 1)).toBe(true)
    expect(r.reqs[0].e2eUs!).toBeLessThan(r.reqs[1].ttftUs!)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The horizon

describe('the horizon', () => {
  const w = handWorkload([{ output: 3 }])
  const sync = config(TRAY, false)

  test('cuts a span that crosses it, drops the ones after it, and leaves the requests it did not finish unfinished', () => {
    // Horizon 4: the forward [2,7] is cut at 4, and the read-back would end at 8, so the tokens never come back.
    const run = tick(sync, w, 4)
    expect(spans(run, 'cpu-main')).toEqual([[0, 'schedule', 0, 2]])
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 4]])
    expect(run.steps.map((s) => s.gpuUs)).toEqual([2])
    expect(run.reqs).toEqual([{ id: 0, dueUs: 0, tokens: 0, ghostTokens: 0, finished: false, ttftUs: null, tpotUs: null, e2eUs: null }])
    expect(run.summary).toMatchObject({ clockUs: 4, gpuBusyUs: 2, usefulTokens: 0, finished: 0, ttftP50Us: null, tpotP50Us: null })
  })

  test('keeps the tokens read back before the horizon, with their latencies, and a step launched whose forward falls after it', () => {
    // Horizon 10: token 1 is read at 8; step 1 is planned [8,10]; its forward would start at 10, which is not before the horizon.
    const run = tick(sync, w, 10)
    expect(spans(run, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [0, 'sync', 7, 8],
      [1, 'schedule', 8, 10],
    ])
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 7]])
    expect(run.steps.map((s) => [s.index, s.gpuUs, s.bubbleUs])).toEqual([[0, 5, 0], [1, 0, 0]])
    expect(run.reqs[0]).toEqual({ id: 0, dueUs: 0, tokens: 1, ghostTokens: 0, finished: false, ttftUs: 8, tpotUs: null, e2eUs: null })
    expect(run.summary.clockUs).toBe(10)
  })

  test('a read-back that the horizon cuts is never applied', () => {
    // Horizon 7: the forward ends at 7 exactly and its sync would start there. Nothing at or after the horizon happens.
    const run = tick(sync, w, 7)
    expect(spans(run, 'cpu-main')).toEqual([[0, 'schedule', 0, 2]])
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 7]])
    expect(run.reqs[0].tokens).toBe(0)
  })

  test('a horizon of 0 runs nothing, and a horizon past the end changes nothing', () => {
    const none = tick(sync, w, 0)
    expect(none.steps).toEqual([])
    expect(none.lanes).toEqual({ 'cpu-main': [], 'gpu-stream': [] })
    expect(none.summary).toMatchObject({ clockUs: 0, steps: 0, gpuBusyUs: 0, gpuBusyPermille: 0, tokensPerSMilli: 0, ttftP50Us: null })
    expect(tick(sync, w, 22)).toStrictEqual({ ...tick(sync, w, FOREVER), horizonUs: 22 })
    expect(tick(sync, w, 21).summary.finished).toBe(0)
  })

  test('requests that are due at or after the horizon are never touched', () => {
    const run = tick(sync, handWorkload([{ output: 1 }, { due: 60, output: 1 }]), 60)
    expect(run.summary.finished).toBe(1)
    expect(run.steps).toHaveLength(1)
    expect(run.reqs[1]).toEqual({ id: 1, dueUs: 60, tokens: 0, ghostTokens: 0, finished: false, ttftUs: null, tpotUs: null, e2eUs: null })
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// What a run is given

describe('what a run refuses', () => {
  const w = handWorkload([{ output: 2 }])
  const cfg = config(TRAY, false)
  const refuses = (change: () => unknown, message: RegExp) => expect(change).toThrow(message)

  test('a configuration that is not integers, or has a mode or an input source it does not know', () => {
    refuses(() => runStepLoop(w, { ...cfg, maxNumSeqs: 0 }, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /maxNumSeqs must be an integer of at least 1, got 0/)
    refuses(() => runStepLoop(w, { ...cfg, maxBatchedTokens: 1.5 }, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /maxBatchedTokens must be an integer of at least 1/)
    refuses(() => runStepLoop(w, { ...cfg, inputIds: 'both' as never }, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /inputIds is 'device' or 'host'/)
    refuses(() => runStepLoop(w, { ...cfg, graphs: { mode: 'PIECEWISE' as never, captureSizes: [] } }, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /graphs\.mode is 'NONE' or 'FULL' in v0/)
  })

  test('capture sizes that are not ascending, distinct and positive, when graphs are on', () => {
    const graphs = (captureSizes: number[]) => ({ ...cfg, graphs: { mode: 'FULL' as const, captureSizes } })
    refuses(() => runStepLoop(w, graphs([1, 4, 2]), TICK_CARD, TICK_CARD, { horizonUs: 10 }), /ascending and distinct, but 2 follows 4/)
    refuses(() => runStepLoop(w, graphs([1, 1]), TICK_CARD, TICK_CARD, { horizonUs: 10 }), /ascending and distinct/)
    refuses(() => runStepLoop(w, graphs([0, 1]), TICK_CARD, TICK_CARD, { horizonUs: 10 }), /captureSizes\[0\] must be an integer of at least 1/)
    // With graphs off the list is ignored.
    expect(() => runStepLoop(w, { ...cfg, graphs: { mode: 'NONE', captureSizes: [3, 1] } }, TICK_CARD, TICK_CARD, { horizonUs: 10 })).not.toThrow()
  })

  test('a horizon that is not a non-negative integer, and a card with a field that is not one', () => {
    refuses(() => runStepLoop(w, cfg, TICK_CARD, TICK_CARD, { horizonUs: -1 }), /horizonUs must be an integer of at least 0/)
    refuses(() => runStepLoop(w, cfg, TICK_CARD, TICK_CARD, { horizonUs: 1.5 }), /horizonUs must be an integer/)
    refuses(() => runStepLoop(w, cfg, { ...TICK_CARD, syncUs: -1 }, TICK_CARD, { horizonUs: 10 }), /the host card's syncUs must be an integer of at least 0/)
    refuses(() => runStepLoop(w, cfg, { ...TICK_CARD, graphReplayUs: 0.5 }, TICK_CARD, { horizonUs: 10 }), /graphReplayUs/)
    refuses(() => runStepLoop(w, cfg, TICK_CARD, { ...TICK_CARD, forwardUs: 0 }, { horizonUs: 10 }), /forwardUs must be an integer of at least 1/)
    refuses(() => runStepLoop(w, cfg, HOST_PRESETS.mrv2.card, { ...s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu'), tp: 0 }, { horizonUs: 10 }), /tp must be an integer of at least 1/)
    refuses(() => s5Card('h100-vllm-0-10-2-fp8', 0, 'on-cpu'), /tp must be an integer of at least 1/)
  })

  test('a workload out of order, with wrong ids, or with a request that has no tokens', () => {
    refuses(() => runStepLoop({ ...w, reqs: [req(0, { due: 5, output: 1 }), req(1, { due: 4, output: 1 })] }, cfg, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /request 1 is due at 4, before request 0 at 5/)
    refuses(() => runStepLoop({ ...w, reqs: [req(0, { output: 1 }), req(2, { output: 1 })] }, cfg, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /request 1 has id 2/)
    refuses(() => runStepLoop({ ...w, reqs: [req(0, { output: 0 })] }, cfg, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /outputTokens must be an integer of at least 1/)
    refuses(() => runStepLoop({ ...w, reqs: [req(0, { prompt: 0, output: 1 })] }, cfg, TICK_CARD, TICK_CARD, { horizonUs: 10 }), /promptTokens must be an integer of at least 1/)
  })

  test('an empty workload is a run with nothing in it', () => {
    const run = runStepLoop({ seed: 0, origin: { kind: 'synthetic' }, reqs: [] }, cfg, TICK_CARD, TICK_CARD, { horizonUs: 100 })
    expect(run.steps).toEqual([])
    expect(run.reqs).toEqual([])
    expect(run.summary.clockUs).toBe(0)
  })
})

describe('purity', () => {
  const deepFreeze = <T>(x: T): T => {
    if (typeof x === 'object' && x !== null) {
      for (const v of Object.values(x)) deepFreeze(v)
      Object.freeze(x)
    }
    return x
  }

  test('a run reads its arguments and changes none of them, so frozen arguments run', () => {
    for (const seed of [3, 17, 42, 101]) {
      const s = scenario(seed)
      const gpu: GpuCard = s.gpu.kind === 's5' ? { ...s.gpu, spec: structuredClone(s.gpu.spec) } : s.gpu
      const args = deepFreeze({ w: structuredClone(s.workload), cfg: structuredClone(s.cfg), host: { ...s.host }, gpu: structuredClone(gpu) })
      const before = JSON.stringify(args)
      const a = runStepLoop(args.w, args.cfg, args.host, args.gpu, { horizonUs: FOREVER })
      expect(JSON.stringify(args)).toBe(before)
      expect(a).toStrictEqual(runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER }))
    }
  })

  test('two runs of one input are the same, whatever ran between them', () => {
    const s = scenario(9)
    const a = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
    runStepLoop(scenario(10).workload, scenario(10).cfg, scenario(10).host, scenario(10).gpu, { horizonUs: 1000 })
    expect(runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })).toStrictEqual(a)
  })

  test('a run returns fresh objects: changing one run\'s result does not change the next run', () => {
    const w = handWorkload([{ output: 3 }])
    const a = tick(config(TRAY, false), w)
    ;(a.lanes['cpu-main'] as Span[]).length = 0
    expect(tick(config(TRAY, false), w).lanes['cpu-main']).toHaveLength(6)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Cards

describe('the cost cards', () => {
  const work: GpuWork = { seqs: 3, prefillSeqs: 1, tokens: 20, kvTokens: 120, attnPairs: 900 }

  test('the tick card prices a forward at 4 ticks, and 5 when the step admits a request, whatever else it carries', () => {
    expect(gpuCost(TICK_CARD, work)).toEqual({ gpuUs: 5, hostSeqUs: null })
    expect(gpuCost(TICK_CARD, { ...work, prefillSeqs: 0 })).toEqual({ gpuUs: 4, hostSeqUs: null })
    expect(gpuCost(TICK_CARD, { seqs: 1, prefillSeqs: 0, tokens: 1, kvTokens: 1, attnPairs: 1 }).gpuUs).toBe(4)
    expect(gpuLayers(TICK_CARD)).toBe(0)
    expect(Object.isFrozen(TICK_CARD)).toBe(true)
  })

  test('the tick card is the front page\'s world: 2 ticks of planning, 4 of forward (+1 on admission), 1 of reading, nothing else', () => {
    const { scheduleBaseUs, schedulePerSeqUs, prepPerTokenUs, launchPerKernelUs, kernelsPerLayer, graphReplayUs, syncUs, samplePerSeqUs, forwardUs, admitUs } = TICK_CARD
    expect([scheduleBaseUs, forwardUs, admitUs, syncUs]).toEqual([2, 4, 1, 1])
    expect([schedulePerSeqUs, prepPerTokenUs, launchPerKernelUs, kernelsPerLayer, graphReplayUs, samplePerSeqUs]).toEqual([0, 0, 0, 0, 0, 0])
    expect([TICK_CARD.synthetic, TICK_CARD.tag, TICK_CARD.kind]).toEqual([true, 'estimated', 'ticks'])
  })

  test('S5 as fitted prices a step at its own step card, with no host term on the CPU lane', () => {
    const row = PHYSICS_ROWS[0]
    const card = s5Card(row.key, 4, 'in-gpu')
    const cost = gpuCost(card, work)
    expect(cost.gpuUs).toBe(stepCard(row.spec, 4, { seqs: 3, tokens: 20, kvTokens: 120, attnPairs: 900 }).us)
    // 0, not null: the card accounts for the per-sequence host work itself (it is in gpuUs), so the host card's phases are not charged.
    expect(cost.hostSeqUs).toBe(0)
    expect(gpuLayers(card)).toBe(80)
    expect(card.label).toContain('TP 4')
    expect([card.tag, card.synthetic, card.kind]).toEqual(['derived', false, 's5'])
    expect(Object.isFrozen(card)).toBe(true)
  })

  test('S5 with its host term on the CPU lane splits the step: the two parts add up to S5\'s price, and the CPU part is seqs × t_seq', () => {
    for (const row of PHYSICS_ROWS) {
      for (const tp of row.box.tp) {
        const load = { seqs: 3, tokens: 20, kvTokens: 120, attnPairs: 900 }
        const whole = stepCard(row.spec, tp, load).us
        const split = gpuCost(s5Card(row.key, tp, 'on-cpu'), work)
        expect(split.hostSeqUs).toBe(Math.round(3 * row.spec.params.seqUs))
        expect(split.gpuUs + split.hostSeqUs!, `${row.key} tp ${tp}`).toBe(whole)
        expect(gpuCost(s5Card(row.key, tp, 'in-gpu'), work).gpuUs).toBe(whole)
      }
    }
  })

  test('the 70B card gives GAMES.md §3.2\'s derived figures: 3.9 ms of a 17.7 ms step at TP 4 with 64 sequences, 0.24 ms of 18.0 ms at TP 2 with 4', () => {
    const decodes = (seqs: number, context: number): GpuWork => ({ seqs, prefillSeqs: 0, tokens: seqs, kvTokens: seqs * context, attnPairs: seqs * context })
    const wide = gpuCost(s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu'), decodes(64, 1024))
    expect([wide.gpuUs + wide.hostSeqUs!, wide.hostSeqUs]).toEqual([17_684, 3907])
    const narrow = gpuCost(s5Card('h100-vllm-0-10-2-fp8', 2, 'on-cpu'), decodes(4, 1024))
    expect([narrow.gpuUs + narrow.hostSeqUs!, narrow.hostSeqUs]).toEqual([18_017, 244])
  })

  test('the card id the model exports is the card file\'s name', () => {
    expect(STEPLOOP_CARD_ID).toBe('trace-room-steploop')
  })

  test('on an S5 card the host card\'s per-sequence schedule and sample phases are not charged, so no host work is counted twice', () => {
    const w = handWorkload(Array.from({ length: 12 }, (_, i) => ({ prompt: 4, output: 3 + (i % 5) })))
    const cfg = config({ ...HARNESS, maxNumSeqs: 12 }, false)
    for (const hostTerm of ['in-gpu', 'on-cpu'] as const) {
      const gpu = s5Card('h100-vllm-0-10-2-fp8', 4, hostTerm)
      const base = HOST_PRESETS.mrv2.card
      const heavy: HostCard = { ...base, schedulePerSeqUs: 10_000, samplePerSeqUs: 10_000 }
      expect(runStepLoop(w, cfg, heavy, gpu, { horizonUs: FOREVER }), hostTerm).toStrictEqual(runStepLoop(w, cfg, base, gpu, { horizonUs: FOREVER }))
    }
    // On the tick card, which says nothing about per-sequence host work, those phases are the host card's.
    const heavyTick: HostCard = { ...TICK_CARD, schedulePerSeqUs: 3, samplePerSeqUs: 2 }
    const a = runStepLoop(w, config({ ...TRAY, maxNumSeqs: 12 }, false), heavyTick, TICK_CARD, { horizonUs: FOREVER })
    const b = runStepLoop(w, config({ ...TRAY, maxNumSeqs: 12 }, false), TICK_CARD, TICK_CARD, { horizonUs: FOREVER })
    expect(a.summary.clockUs).toBeGreaterThan(b.summary.clockUs)
  })

  test('where S5\'s host term runs does not change a serial run\'s clock, and only overlap can hide it (D-044)', () => {
    let hidden = 0
    let tried = 0
    for (let seed = 1; seed <= 60; seed++) {
      const s = scenario(seed, 'decode-only')
      if (s.gpu.kind !== 's5') continue
      const card = s.gpu
      const run = (hostTerm: 'in-gpu' | 'on-cpu', asyncScheduling: boolean) =>
        runStepLoop(s.workload, { ...s.cfg, asyncScheduling }, s.host, { ...card, hostTerm }, { horizonUs: FOREVER })
      const inGpu = run('in-gpu', false)
      const onCpu = run('on-cpu', false)
      tried++
      // Moving the term from the GPU lane to the CPU lane moves time between the lanes and changes no step's length, so a serial run
      // takes as long and every request sees the same latencies.
      expect(onCpu.summary.clockUs, `seed ${seed}`).toBe(inGpu.summary.clockUs)
      expect(onCpu.reqs, `seed ${seed}`).toStrictEqual(inGpu.reqs)
      // The CPU part is a bubble without overlap, and the GPU is busy that much less.
      expect(onCpu.summary.gpuBusyUs, `seed ${seed}`).toBeLessThan(inGpu.summary.gpuBusyUs)
      expect(onCpu.summary.bubbleUs, `seed ${seed}`).toBeGreaterThan(inGpu.summary.bubbleUs)
      // With overlap, the term that sits on the CPU lane can hide under the forward.
      if (run('on-cpu', true).summary.bubbleUs < onCpu.summary.bubbleUs) hidden++
    }
    expect(tried).toBeGreaterThan(15)
    expect(hidden).toBe(tried)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Capture sizes

describe('capture sizes and padding', () => {
  test('vLLM\'s default list: 1, 2 and 4, then 8 to 248 in 8s, then 256 up to the maximum in 16s, with 51 sizes up to 512', () => {
    const sizes = defaultCaptureSizes(512)
    expect(sizes).toHaveLength(51)
    expect(sizes.slice(0, 6)).toEqual([1, 2, 4, 8, 16, 24])
    expect(sizes.slice(33, 37)).toEqual([248, 256, 272, 288])
    expect(sizes.slice(-3)).toEqual([480, 496, 512])
    const expected = [1, 2, 4]
    for (let n = 8; n < 256; n += 8) expected.push(n)
    for (let n = 256; n <= 512; n += 16) expected.push(n)
    expect(sizes).toEqual(expected)
    expect(defaultCaptureSizes(1024)).toHaveLength(51 + 32)
  })

  test('is cut at the maximum, and a maximum that is not on the list ends the list at the last size below it', () => {
    expect(defaultCaptureSizes(1)).toEqual([1])
    expect(defaultCaptureSizes(3)).toEqual([1, 2])
    expect(defaultCaptureSizes(64)).toEqual([1, 2, 4, 8, 16, 24, 32, 40, 48, 56, 64])
    expect(defaultCaptureSizes(100)).toEqual([1, 2, 4, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96])
    expect(defaultCaptureSizes(256).slice(-2)).toEqual([248, 256])
    expect(defaultCaptureSizes(260).slice(-2)).toEqual([248, 256])
    expect(defaultCaptureSizes(272).slice(-2)).toEqual([256, 272])
    expect(() => defaultCaptureSizes(0)).toThrow(RangeError)
    expect(() => defaultCaptureSizes(1.5)).toThrow(RangeError)
  })

  test('a step is padded to the smallest captured size at least its token count: equal exactly when captured, null above the largest', () => {
    for (const sizes of [defaultCaptureSizes(512), defaultCaptureSizes(64), [1, 2, 4, 8], [5], [3, 10, 11, 200], []]) {
      const largest = sizes.length > 0 ? sizes[sizes.length - 1] : 0
      for (let n = 1; n <= largest + 5; n++) {
        const brute = sizes.find((size) => size >= n) ?? null
        expect(paddedSize(sizes, n), `${sizes.length} sizes, ${n} tokens`).toBe(brute)
        const padded = paddedSize(sizes, n)
        if (padded !== null) {
          expect(padded >= n).toBe(true)
          expect(padded === n).toBe(sizes.includes(n))
        } else expect(n > largest).toBe(true)
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// The lanes' parts

describe('where the phases fall', () => {
  const phases = { scheduleUs: 2, prepareUs: 3, launchUs: 5, forwardUs: 20 }

  test('a step starts its CPU phases when the thread is free, and its forward when the launch has ended and the stream is free', () => {
    expect(placeLaunch(100, 0, phases)).toEqual({ scheduleEnd: 102, prepareEnd: 105, launchEnd: 110, forwardStart: 110, forwardEnd: 130 })
    // A busy stream makes the forward wait for it.
    expect(placeLaunch(100, 125, phases)).toEqual({ scheduleEnd: 102, prepareEnd: 105, launchEnd: 110, forwardStart: 125, forwardEnd: 145 })
    // A stream that frees exactly when the launch ends does not.
    expect(placeLaunch(100, 110, phases).forwardStart).toBe(110)
  })

  test('the read-back starts at the later of the thread being free and the forward ending, and the wait before it is not a span', () => {
    expect(placeReadback(50, 130, 2, 7)).toEqual({ syncStart: 130, syncEnd: 132, sampleEnd: 139 })
    expect(placeReadback(140, 130, 2, 7)).toEqual({ syncStart: 140, syncEnd: 142, sampleEnd: 149 })
  })

  test('a timeline drops empty spans, cuts the one that crosses the horizon, drops what starts at it, and refuses a span out of order', () => {
    const t = timelineBuilder(100)
    expect(t.add('cpu-main', 0, 'schedule', 0, 0)).toBeNull()
    expect(t.add('cpu-main', 0, 'schedule', 0, 40)).toEqual({ step: 0, kind: 'schedule', startUs: 0, endUs: 40 })
    expect(t.add('gpu-stream', 0, 'forward', 10, 90)).toEqual({ step: 0, kind: 'forward', startUs: 10, endUs: 90 })
    // A different lane is a different stream: its span may start before the other lane's last one ended.
    expect(t.add('cpu-main', 0, 'sync', 40, 120)).toEqual({ step: 0, kind: 'sync', startUs: 40, endUs: 100 })
    expect(t.add('cpu-main', 1, 'schedule', 100, 110)).toBeNull()
    expect(() => t.add('gpu-stream', 1, 'forward', 80, 95)).toThrow(/starts at 80, before the last span on gpu-stream ended at 90/)
    expect(() => t.add('gpu-stream', 1, 'forward', 95, 94)).toThrow(/ends before it starts/)
    expect(t.timeline()['gpu-stream']).toHaveLength(1)
    expect(t.timeline()['cpu-main']).toHaveLength(2)
  })

  test('the dependency check flags a host-side read of a token still in flight, and nothing else', () => {
    expect(checkDependency('host', 4, 77, 3)).toEqual({ kind: 'read-before-sample', step: 4, atUs: 77, rows: 3 })
    expect(checkDependency('host', 4, 77, 0)).toBeNull()
    expect(checkDependency('device', 4, 77, 3)).toBeNull()
  })

  test('a bubble is GPU idle time while cpu-main is busy: the gaps between forwards, less the time the main thread is idle too', () => {
    const f = (step: number, startUs: number, endUs: number): Span => ({ step, kind: 'forward', startUs, endUs })
    const c = (step: number, startUs: number, endUs: number): Span => ({ step, kind: 'sync', startUs, endUs })
    // Forwards at [10,20], [30,40], [100,110], with a null for a step the horizon cut away. The CPU is busy [18,34] and [95,100].
    const cpu = [c(0, 18, 34), c(1, 95, 100)]
    // Gap [20,30] has the CPU busy for [20,30], all of it. Gap [40,100] has it busy for [95,100] only, 5 of the 60.
    expect(bubblesBefore([f(0, 10, 20), f(1, 30, 40), f(2, 100, 110), null], cpu)).toEqual([0, 10, 5, 0])
    // Forwards that touch have no gap, and a first forward has none before it however busy the CPU was.
    expect(bubblesBefore([f(0, 10, 20), f(1, 20, 30)], [c(0, 0, 50)])).toEqual([0, 0])
    expect(bubblesBefore([], [])).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Two oracles that do not share the loop's code

describe('against the oracles, over 200 seeds of requests that are all due at once', () => {
  const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1)

  test('every span of a run is the one a recurrence over the steps\' costs gives: the lanes, to the µs', () => {
    let waited = 0
    for (const seed of SEEDS) {
      const s = scenario(seed, 'burst')
      const run = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      const at = s.workload.reqs[0].dueUs
      const expected = burstTimeline(run, at, s.host, s.gpu, s.cfg.asyncScheduling)
      expect(run.lanes['cpu-main'], `seed ${seed} cpu-main`).toStrictEqual(expected.cpu)
      expect(run.lanes['gpu-stream'], `seed ${seed} gpu-stream`).toStrictEqual(expected.gpu)
      checkInvariants(s, run, FOREVER)
      if (at > 0) waited++
    }
    expect(waited).toBeGreaterThan(20)
  })

  test('every batch is the one the scheduler\'s rules give with no clock: running first, then waiting, under the budget and the caps', () => {
    let chunked = 0
    let capped = 0
    let starved = 0
    let batchedStatically = 0
    let differs = 0
    for (const seed of SEEDS) {
      const s = scenario(seed, 'burst')
      const run = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      const batches = referenceBatches(
        s.workload.reqs.map((r) => r.promptTokens),
        s.workload.reqs.map((r) => r.outputTokens),
        s.cfg,
      )
      expect(
        run.steps.map((step) => ({ seqs: step.seqs, prefillSeqs: step.prefillSeqs, tokens: step.tokens })),
        `seed ${seed}`,
      ).toEqual(batches)
      if (s.cfg.chunkedPrefill && s.workload.reqs.some((r) => r.promptTokens > s.cfg.maxBatchedTokens)) chunked++
      if (s.workload.reqs.length > s.cfg.maxNumSeqs) capped++
      if (s.cfg.maxBatchedTokens < s.cfg.maxNumSeqs) starved++
      if (s.cfg.batching === 'static') {
        batchedStatically++
        // Static batching changes the batches whenever a slot would have been refilled; the oracle knows it, so the two differ there.
        const prompts = s.workload.reqs.map((r) => r.promptTokens)
        const outputs = s.workload.reqs.map((r) => r.outputTokens)
        if (JSON.stringify(referenceBatches(prompts, outputs, { ...s.cfg, batching: 'continuous' })) !== JSON.stringify(batches)) differs++
      }
    }
    // The seeds exercise chunking, the cap on running requests, a budget below the cap, and static batching.
    expect(chunked).toBeGreaterThan(5)
    expect(capped).toBeGreaterThan(20)
    expect(starved).toBeGreaterThan(5)
    expect(batchedStatically).toBeGreaterThan(20)
    expect(differs).toBeGreaterThan(5)
  })

  test('the two oracles disagree with a loop that gets a rule wrong: a ghost step dropped, or a read-back that does not wait for its forward', () => {
    const s = scenario(2, 'burst')
    const run = runStepLoop(s.workload, { ...s.cfg, asyncScheduling: true }, s.host, s.gpu, { horizonUs: FOREVER })
    const at = s.workload.reqs[0].dueUs
    // Read as a run without overlap, the same steps give other spans.
    expect(burstTimeline(run, at, s.host, s.gpu, false).cpu).not.toStrictEqual(run.lanes['cpu-main'])
    // And the batches of a run with overlap are not those of one without: the stop is read a step later.
    const prompts = s.workload.reqs.map((r) => r.promptTokens)
    const outputs = s.workload.reqs.map((r) => r.outputTokens)
    expect(referenceBatches(prompts, outputs, { ...s.cfg, asyncScheduling: false }).length).toBeLessThan(referenceBatches(prompts, outputs, { ...s.cfg, asyncScheduling: true }).length)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Properties of the levers

describe('the levers do what the lessons say', () => {
  test('the front page has seeds to draw: on at least 20% of 400 candidates, both levers are needed to reach par (GAMES.md §3.1, D-043)', () => {
    // The band of first-4-par: static batching takes at least 1.25 times the ticks of continuous batching without overlap, which takes
    // at least 1.4 times par (continuous with overlap); overlap alone (static with overlap) takes at least 1.15 times par; and the
    // par run has at least 3 ghost tokens. The 20% floor is an estimated design parameter (GAMES.md §2.1, ASSESSMENT §4.1).
    const spec = {
      requests: 12,
      arrivals: { kind: 'burst' },
      lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'menu', values: [1, 2, 3, 4, 6, 8, 12, 16], weights: [24, 20, 16, 12, 10, 8, 6, 4] } },
    } as const
    let inBand = 0
    const candidates = 400
    for (let seed = 0; seed < candidates; seed++) {
      const w = genWorkload(seed, spec)
      const run = (batching: 'static' | 'continuous', asyncScheduling: boolean) => tick({ ...config(TRAY, asyncScheduling), batching }, w)
      const par = run('continuous', true)
      const ticks = (batching: 'static' | 'continuous', asyncScheduling: boolean) => run(batching, asyncScheduling).summary.clockUs
      const parTicks = par.summary.clockUs
      if (
        ticks('static', false) * 4 >= ticks('continuous', false) * 5 && // 1.25
        ticks('continuous', false) * 5 >= parTicks * 7 && // 1.4
        ticks('static', true) * 20 >= parTicks * 23 && // 1.15
        par.summary.ghostTokens >= 3
      ) inBand++
    }
    expect(inBand / candidates).toBeGreaterThanOrEqual(0.2)
    // [measured 2026-11-04 at 12b50d0] 159 of the 400 candidates, 39.8%, are in band on this menu of output lengths. GAMES.md reports
    // 80% for a scratch prototype that was not kept [estimated]. Its menu and rules are not recorded, so the two are not compared.
    // Seed 1, the practice seed, is one of them (the goldens in steploop.test.ts).
  })

  test('overlap never takes longer per token once the pipeline is full: on a long decode batch the step interval is max(GPU, CPU), not their sum', () => {
    // 30 requests of 40 tokens each on the 70B card with the host term on the CPU lane.
    const w = handWorkload(Array.from({ length: 30 }, () => ({ prompt: 8, output: 40 })))
    const gpu = s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu')
    const host = HOST_PRESETS.mrv2.card
    const serial = runStepLoop(w, config(HARNESS, false), host, gpu, { horizonUs: FOREVER })
    const overlap = runStepLoop(w, config(HARNESS, true), host, gpu, { horizonUs: FOREVER })
    // A steady decode step: the serial step is the sum of the phases, the overlapped step is the forward alone.
    const k = 20
    const serialStep = serial.lanes['cpu-main'].find((s) => s.step === k + 1 && s.kind === 'schedule')!.startUs - serial.lanes['cpu-main'].find((s) => s.step === k && s.kind === 'schedule')!.startUs
    const gpuOverlap = overlap.lanes['gpu-stream']
    const overlapStep = gpuOverlap[k + 1].startUs - gpuOverlap[k].startUs
    expect(overlapStep).toBe(gpuOverlap[k].endUs - gpuOverlap[k].startUs)
    expect(serialStep).toBeGreaterThan(overlapStep)
    expect(overlap.summary.tpotP50Us!).toBeLessThan(serial.summary.tpotP50Us!)
  })

  test('graphs shorten a serial step by the launches they replace, and shorten an overlapped GPU-bound step by nothing', () => {
    const w = handWorkload(Array.from({ length: 16 }, () => ({ prompt: 1, output: 30 })))
    const gpu = s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu')
    const host = HOST_PRESETS.mrv2.card
    const graphs = { mode: 'FULL', captureSizes: defaultCaptureSizes(512) } as const
    const eager = runStepLoop(w, config(HARNESS, false), host, gpu, { horizonUs: FOREVER })
    const replay = runStepLoop(w, config(HARNESS, false, graphs), host, gpu, { horizonUs: FOREVER })
    const saved = host.launchPerKernelUs * host.kernelsPerLayer * 80 - host.graphReplayUs
    expect(eager.summary.clockUs - replay.summary.clockUs).toBe(saved * eager.steps.length)
    const eagerOverlap = runStepLoop(w, config(HARNESS, true), host, gpu, { horizonUs: FOREVER })
    const replayOverlap = runStepLoop(w, config(HARNESS, true, graphs), host, gpu, { horizonUs: FOREVER })
    expect(eagerOverlap.summary.bubbleUs).toBe(0)
    expect(replayOverlap.summary.bubbleUs).toBe(0)
    expect(replayOverlap.summary.clockUs).toBeLessThanOrEqual(eagerOverlap.summary.clockUs)
  })

  test('a CPU-bound step is not rescued by overlap: with a slow CPU the bubbles shrink to CPU minus GPU', () => {
    // A tick-shaped world where the CPU takes 9 ticks to plan and 1 to read, and the GPU 4: the GPU is idle for 6 of every 10.
    const slow: HostCard = { ...TICK_CARD, scheduleBaseUs: 9 }
    const w = handWorkload([{ output: 30 }])
    const serial = runStepLoop(w, config(TRAY, false), slow, TICK_CARD, { horizonUs: FOREVER })
    const overlap = runStepLoop(w, config(TRAY, true), slow, TICK_CARD, { horizonUs: FOREVER })
    expect(serial.summary.bubbleUs).toBe(10 * (serial.steps.length - 1))
    // With overlap, each GPU step waits for the plan that the 10 ticks of CPU cycle (plan 9, read 1) allow: 10 per step, 4 busy, 6 idle.
    for (const step of overlap.steps.slice(3, -1)) expect(step.bubbleUs).toBe(6)
    expect(overlap.summary.bubbleUs).toBeLessThan(serial.summary.bubbleUs)
  })

  test('a request that stops after one token holds its slot for a ghost step under overlap, so a queue of such requests takes twice the steps', () => {
    // 12 requests of one token on 4 slots. Without overlap, 4 stop in each step and the slots refill: 3 steps. With overlap, the next
    // step is planned before the stops are read, so the 4 stopped requests ride it as ghosts and nothing new can be admitted until the
    // reads come back: each group of 4 takes a real step and a ghost step, 6 steps, with 12 ghost tokens.
    const w = handWorkload(Array.from({ length: 12 }, () => ({ output: 1 })))
    const serial = tick(config(TRAY, false), w)
    const overlap = tick(config(TRAY, true), w)
    expect(serial.steps).toHaveLength(3)
    expect(serial.summary.ghostTokens).toBe(0)
    expect(overlap.steps).toHaveLength(6)
    expect(overlap.summary.ghostTokens).toBe(12)
    expect(overlap.steps.map((s) => s.ghostSeqs)).toEqual([0, 4, 0, 4, 0, 4])
    expect(overlap.summary.usefulTokens).toBe(serial.summary.usefulTokens)
  })
})
