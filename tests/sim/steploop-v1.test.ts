/*
 * The step-loop model at v1 (W1-T12; ARCHITECTURE §5.3, §5.10; WORLD §2.5 to §2.8; GAMES.md §3.2): the graph modes and dispatch keys of both
 * runners inside a run, capture-size padding, adapters and the cap on them, the structured-output mask with and without overlap, the
 * speculative step, the 70B card with its host term on the CPU lane (D-044, proposed), and the runner presets.
 *
 * The cases are small enough to work by hand on the front page's tick card (a step is 2 ticks of planning, 4 of forward with 1 more on an
 * admission, and 1 of reading), and each comment gives the arithmetic. 200 seeds then check what holds whatever is switched on. The v0 tests
 * (steploop.test.ts, steploop-model.test.ts) keep holding the loop without a v1 field, and tests/fixtures/sim/steploop.json is untouched.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { compileContent } from '../../scripts/content/build.ts'
import { below, between, divRound, rngFor, splitmix32u } from '../../packages/sim/core'
import type { Us } from '../../packages/sim/core'
import { canonicalJson } from '../../packages/sim/core/json'
import { HOST_PRESETS } from '../../packages/sim/host'
import type { HostCard } from '../../packages/sim/host'
import { stepCard, stepLoad } from '../../packages/sim/physics'
import {
  D044,
  DEFAULT_HOST_TERM,
  MASK_PARALLEL_THRESHOLD,
  MASK_POOL_THREADS,
  MASK_TASK_REQUESTS,
  PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER,
  RUNNER_PRESETS,
  TICK_CARD,
  acceptedDrafts,
  asyncSupported,
  defaultCaptureSizes,
  expectedTokensPerRoundMilli,
  gpuLayers,
  maskFillUs,
  mrv1RoundedSizes,
  resolveRunner,
  runStepLoop,
  s5Card,
  vllmCaptureSizes,
} from '../../packages/sim/steploop'
import type { GpuCard, GraphSettings, StepLoopConfig, StepLoopRun } from '../../packages/sim/steploop'
import { runStepLoop as runStepLoopV0 } from '../../packages/sim/steploop/run'
import { genWorkload } from '../../packages/sim/workload'
import type { Workload } from '../../packages/sim/workload'
import { MODELS, renderFixture } from '../../scripts/vectors'
import { FOREVER, HARNESS, TRAY, config, handWorkload, req, scenario } from './steploop-support'
import { checkInvariantsV1, scenarioV1 } from './steploop-v1-support'

const root = path.resolve(import.meta.dirname, '../..')
const spans = (run: StepLoopRun, lane: 'cpu-main' | 'gpu-stream', kind?: string) => run.lanes[lane].filter((s) => kind === undefined || s.kind === kind).map((s) => [s.step, s.kind, s.startUs, s.endUs])

/** The tick card with a price for each row of the bitmask. */
const maskHost = (maskPerSeqUs: number): HostCard => ({ ...TICK_CARD, maskPerSeqUs })

/** A hand-written workload in which a request can carry a grammar or an adapter. */
function workload(specs: readonly { due?: Us; prompt?: number; output: number; structured?: boolean; adapter?: number }[]): Workload {
  return { seed: 0, origin: { kind: 'synthetic' }, reqs: specs.map((spec, id) => ({ ...req(id, spec), structured: spec.structured === true, adapter: spec.adapter ?? null })) }
}

const none = { mode: 'NONE', captureSizes: [] } as const satisfies GraphSettings

/** A step as a loop without a runner records it: the runner adds `mode`, and nothing else differs. */
const withoutMode = (step: StepLoopRun['steps'][number]): StepLoopRun['steps'][number] => {
  const copy = { ...step }
  delete copy.mode
  return copy
}
const tick = (cfg: StepLoopConfig, w: Workload, host: HostCard = TICK_CARD) => runStepLoop(w, cfg, host, TICK_CARD, { horizonUs: FOREVER })

// ---------------------------------------------------------------------------------------------------------------------------
describe('the structured-output mask (WORLD §2.8; claims vllm.mask.overlap, vllm.mask.deferred-sampling, vllm.mask.fill-parallel-threshold)', () => {
  const w = workload([{ output: 2, structured: true }])
  const cfg = (asyncScheduling: boolean, overlap: boolean): StepLoopConfig => ({ ...config(TRAY, asyncScheduling), runner: 'mrv2', structured: { overlap } })

  test('overlapped, without async scheduling, the fill runs right after the launch and hides under the forward, so the GPU lane is the one without a mask', () => {
    // Step 0 admits the request: plan [0,2], forward [2,7], and the fill of 2 µs [2,4] while the forward runs. The read waits for the forward: [7,8].
    // Step 1: plan [8,10], forward [10,14], fill [10,12], read [14,15].
    const run = tick(cfg(false, true), w, maskHost(2))
    expect(spans(run, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [0, 'mask', 2, 4],
      [0, 'sync', 7, 8],
      [1, 'schedule', 8, 10],
      [1, 'mask', 10, 12],
      [1, 'sync', 14, 15],
    ])
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 7], [1, 'forward', 10, 14]])
    expect(run.summary.maskUs).toBe(4)
    expect(run.steps.map((s) => s.maskUs)).toEqual([2, 2])
    const without = tick({ ...config(TRAY, false), runner: 'mrv2' }, workload([{ output: 2 }]), maskHost(2))
    expect(run.lanes['gpu-stream']).toEqual(without.lanes['gpu-stream'])
    expect(run.summary.clockUs).toBe(without.summary.clockUs)
    expect(without.summary.maskUs).toBeUndefined()
    expect(without.steps[0].maskUs).toBeUndefined()
  })

  test('built after the forward, the fill sits between the sync and the sample, and every step is 2 µs longer', () => {
    // Step 0: plan [0,2], forward [2,7], sync [7,8], fill [8,10]. Step 1: plan [10,12], forward [12,16], sync [16,17], fill [17,19].
    const run = tick(cfg(false, false), w, maskHost(2))
    expect(spans(run, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [0, 'sync', 7, 8],
      [0, 'mask', 8, 10],
      [1, 'schedule', 10, 12],
      [1, 'sync', 16, 17],
      [1, 'mask', 17, 19],
    ])
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 7], [1, 'forward', 12, 16]])
    expect(run.summary.clockUs).toBe(19)
    // The GPU waits from 7 to 12 while the CPU is busy for all of it: the sync, the fill and the plan.
    expect(run.steps.map((s) => s.bubbleUs)).toEqual([0, 5])
  })

  test('a fill longer than the forward holds the CPU past it, and the GPU waits on the CPU', () => {
    // 10 µs a row: the fill [2,12] outlasts the forward [2,7]. The read starts at 12, the next plan at 13, and the next forward at 15.
    const run = tick(cfg(false, true), w, maskHost(10))
    expect(spans(run, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [0, 'mask', 2, 12],
      [0, 'sync', 12, 13],
      [1, 'schedule', 13, 15],
      [1, 'mask', 15, 25],
      [1, 'sync', 25, 26],
    ])
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 7], [1, 'forward', 15, 19]])
    // Between the forwards (7 to 15) the CPU is busy all the time: 5 µs of the fill, the sync, the plan.
    expect(run.steps.map((s) => s.bubbleUs)).toEqual([0, 8])
  })

  test('with async scheduling the fill of a decode row waits for the token of the step before it, whatever the overlap switch says, and runs under the next forward', () => {
    // Step 0's row is a prompt, so its token is home at the launch. With overlap the fill is built at once [2,4]; without it, after the sync [8,10].
    // Steps 1 to 3 are decodes of a request whose token is still in flight when they are launched, so each of their fills is built when the step
    // before has been read back, and step 3 has none: the request stopped with step 2, and step 3's row is a ghost.
    const three = workload([{ output: 3, structured: true }])
    const overlapped = tick(cfg(true, true), three, maskHost(2))
    expect(spans(overlapped, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [0, 'mask', 2, 4],
      [1, 'schedule', 4, 6],
      [0, 'sync', 7, 8],
      [1, 'mask', 8, 10],
      [2, 'schedule', 10, 12],
      [1, 'sync', 12, 13],
      [2, 'mask', 13, 15],
      [3, 'schedule', 15, 17],
      [2, 'sync', 17, 18],
      [3, 'sync', 21, 22],
    ])
    expect(spans(overlapped, 'gpu-stream')).toEqual([[0, 'forward', 2, 7], [1, 'forward', 7, 11], [2, 'forward', 12, 16], [3, 'forward', 17, 21]])
    const serial = tick(cfg(true, false), three, maskHost(2))
    expect(spans(serial, 'cpu-main')).toEqual([
      [0, 'schedule', 0, 2],
      [1, 'schedule', 2, 4],
      [0, 'sync', 7, 8],
      [0, 'mask', 8, 10],
      [1, 'mask', 10, 12],
      [2, 'schedule', 12, 14],
      [1, 'sync', 14, 15],
      [2, 'mask', 15, 17],
      [3, 'schedule', 17, 19],
      [2, 'sync', 19, 20],
      [3, 'sync', 23, 24],
    ])
    expect(spans(serial, 'gpu-stream')).toEqual([[0, 'forward', 2, 7], [1, 'forward', 7, 11], [2, 'forward', 14, 18], [3, 'forward', 19, 23]])
    for (const [name, run] of [['overlap', overlapped], ['serial', serial]] as const) {
      expect(run.steps.map((s) => s.maskUs), name).toEqual([2, 2, 2, 0])
      expect(run.summary.maskUs, name).toBe(6)
      expect(run.summary.ghostTokens, name).toBe(1)
      expect(run.violations, name).toEqual([])
      // The fill of each decode step starts the moment the step before it has been read back.
      for (const k of [1, 2]) {
        const mask = run.lanes['cpu-main'].find((span) => span.kind === 'mask' && span.step === k)!
        const before = run.lanes['cpu-main'].filter((span) => span.step === k - 1 && (span.kind === 'sync' || span.kind === 'sample' || span.kind === 'mask')).at(-1)!
        expect(mask.startUs, `${name} step ${k}`).toBe(before.endUs)
      }
    }
    // Overlap saves the prompt row's fill from the critical path: the same request ends 2 µs sooner.
    expect(overlapped.summary.clockUs).toBe(22)
    expect(serial.summary.clockUs).toBe(24)
  })

  test('only the rows that sample a structured request are masked, and a row that is not structured costs nothing', () => {
    // Two requests, one with a grammar: one row of the fill each step.
    const run = tick(cfg(false, true), workload([{ output: 2, structured: true }, { output: 2 }]), maskHost(2))
    expect(run.steps.map((s) => s.maskUs)).toEqual([2, 2])
    const both = tick(cfg(false, true), workload([{ output: 2, structured: true }, { output: 2, structured: true }]), maskHost(2))
    expect(both.steps.map((s) => s.maskUs)).toEqual([4, 4])
    // A prompt chunk that does not finish the prompt samples nothing and is not masked.
    const chunked = tick({ ...cfg(false, true), maxBatchedTokens: 2 }, workload([{ prompt: 5, output: 1, structured: true }]), maskHost(2))
    expect(chunked.steps.map((s) => s.tokens)).toEqual([2, 2, 1])
    expect(chunked.steps.map((s) => s.maskUs)).toEqual([0, 0, 2])
  })

  test('costs the host card\'s maskPerSeqUs a row, and a mask-free workload with the mask configured costs nothing', () => {
    const plain = tick(cfg(false, true), workload([{ output: 3 }]), maskHost(7))
    expect(plain.summary.maskUs).toBe(0)
    expect(plain.lanes['cpu-main'].some((s) => s.kind === 'mask')).toBe(false)
    expect(tick(cfg(false, true), workload([{ output: 3, structured: true }]), maskHost(0)).summary.maskUs).toBe(0)
  })

  test('maskFillUs: serial up to 128 requests, then tasks of 16 on 8 threads, and serial again with speculative tokens (claim vllm.mask.fill-rows-per-request)', () => {
    expect([MASK_PARALLEL_THRESHOLD, MASK_TASK_REQUESTS, MASK_POOL_THREADS]).toEqual([128, 16, 8])
    expect(maskFillUs(0, 40, 0)).toBe(0)
    expect(maskFillUs(1, 40, 0)).toBe(40)
    expect(maskFillUs(128, 1, 0)).toBe(128)
    // 129 requests: 9 tasks, 8 on the threads at once (16 rows) and the ninth, of 1 row, after: 17 rows.
    expect(maskFillUs(129, 1, 0)).toBe(17)
    // 200: 13 tasks. The pool runs 8, then 5 (4 of 16 rows and one of 8): the thread with two full tasks sets the time, 32 rows.
    expect(maskFillUs(200, 1, 0)).toBe(32)
    // 256 requests: 16 tasks of 16, two waves.
    expect(maskFillUs(256, 1, 0)).toBe(32)
    // 144: 9 tasks of 16, two waves, the second with one full task.
    expect(maskFillUs(144, 1, 0)).toBe(32)
    // Speculative tokens: a block of 1 + k rows for each request, filled serially whatever the count.
    expect(maskFillUs(4, 5, 3)).toBe(4 * 4 * 5)
    expect(maskFillUs(200, 1, 3)).toBe(800)
    expect(() => maskFillUs(-1, 1, 0)).toThrow(/requests must be an integer of at least 0/)
  })

  test('maskFillUs against a list scheduler, for every count of requests up to 600', () => {
    for (let requests = 1; requests <= 600; requests++) {
      // The pool as a list scheduler: tasks are submitted in order, and each goes to the thread that is free first.
      const tasks: number[] = []
      for (let left = requests; left > 0; left -= MASK_TASK_REQUESTS) tasks.push(Math.min(MASK_TASK_REQUESTS, left))
      const free = Array.from({ length: MASK_POOL_THREADS }, () => 0)
      for (const rows of tasks) {
        let at = 0
        for (let i = 1; i < free.length; i++) if (free[i] < free[at]) at = i
        free[at] += rows
      }
      const parallel = Math.max(...free)
      expect(maskFillUs(requests, 1, 0), `${requests} requests`).toBe(requests <= MASK_PARALLEL_THRESHOLD ? requests : parallel)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('the speculative step (WORLD §2.7; claims vllm.scheduler.spec-drafts, spec.paper.expected-tokens, spec.paper.bonus-token)', () => {
  const one = (output: number) => workload([{ output }])
  const cfg = (alphaPermille: number, o: { k?: number; draftCostPermille?: number; maxBatchedTokens?: number } = {}): StepLoopConfig => ({
    ...config({ ...TRAY, maxBatchedTokens: o.maxBatchedTokens ?? TRAY.maxBatchedTokens }, false),
    runner: 'mrv2',
    spec: { k: o.k ?? 2, alphaPermille, draftCostPermille: o.draftCostPermille ?? 0 },
  })

  test('every draft accepted: a round emits the drafts and one more, and the step carries 1 + k tokens a row', () => {
    // Step 0 is the prompt, and it emits the first token. Each later step is a round of 3 tokens, 2 drafts and the sampled one, and emits 3.
    // 7 tokens are 1 + 3 + 3: plan [0,2] forward [2,7] read [7,8]; plan [8,10] forward [10,14] read [14,15]; plan [15,17] forward [17,21] read [21,22].
    const run = tick(cfg(1000), one(7))
    expect(run.steps.map((s) => s.tokens)).toEqual([1, 3, 3])
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 7], [1, 'forward', 10, 14], [2, 'forward', 17, 21]])
    expect(run.summary.spec).toEqual({ rounds: 2, drafted: 4, accepted: 4, emitted: 6, expectedPerRoundMilli: 3000 })
    expect(run.reqs[0]).toMatchObject({ tokens: 7, finished: true, ghostTokens: 0 })
    expect(run.summary.clockUs).toBe(22)
  })

  test('no draft accepted: a round emits the one token, and the step still carries 1 + k', () => {
    const run = tick(cfg(0), one(7))
    expect(run.steps.map((s) => s.tokens)).toEqual([1, 3, 3, 3, 3, 3, 3])
    expect(run.summary.spec).toEqual({ rounds: 6, drafted: 12, accepted: 0, emitted: 6, expectedPerRoundMilli: 1000 })
  })

  test('a round that would pass the request\'s own length is cut: the extra tokens are thrown away without a ghost', () => {
    // 5 tokens: 1 from the prompt, then rounds of 3: 1 + 3 = 4, and the second round gives the 5th and the extra two are cut.
    const run = tick(cfg(1000), one(5))
    expect(run.reqs[0].tokens).toBe(5)
    expect(run.summary.spec).toMatchObject({ rounds: 2, emitted: 6 })
    expect(run.summary.ghostTokens).toBe(0)
  })

  test('the drafts cost the GPU a share of a plain decode step of the same rows, k times, inside the step\'s forward', () => {
    // k = 2 at 500 permille of a 4-tick step: 2 · 500 · 4 / 1000 = 4 ticks a round. The prompt step has no round and no draft.
    const run = tick(cfg(1000, { draftCostPermille: 500 }), one(7))
    expect(run.steps.map((s) => s.draftUs)).toEqual([0, 4, 4])
    expect(run.summary.draftUs).toBe(8)
    // Step 1: plan [8,10], forward 4 + 4 = [10,18], read [18,19]. Step 2: plan [19,21], forward [21,29], read [29,30].
    expect(spans(run, 'gpu-stream')).toEqual([[0, 'forward', 2, 7], [1, 'forward', 10, 18], [2, 'forward', 21, 29]])
    expect(run.summary.clockUs).toBe(30)
  })

  test('a row gets only the drafts that fit what is left of the token budget (claim vllm.scheduler.spec-drafts)', () => {
    // A budget of 2 tokens: the row carries 1 draft, and accepts it. 1 + 2 + 2 + 2 = 7.
    const run = tick(cfg(1000, { maxBatchedTokens: 2 }), one(7))
    expect(run.steps.map((s) => s.tokens)).toEqual([1, 2, 2, 2])
    expect(run.summary.spec).toMatchObject({ rounds: 3, drafted: 3, accepted: 3, emitted: 6 })
  })

  test('what a round emits is drawn from the request\'s own seeded stream, so the same workload gives the same run, and a seed that is not the workload\'s gives another', () => {
    const w = genWorkload(5, { requests: 12, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 4 }, output: { kind: 'const', value: 40 } } })
    const a = tick(cfg(600, { k: 3 }), w)
    expect(canonicalJson(tick(cfg(600, { k: 3 }), w))).toBe(canonicalJson(a))
    const other = tick(cfg(600, { k: 3 }), { ...w, seed: 6 })
    expect(canonicalJson(other)).not.toBe(canonicalJson(a))
  })

  test('the mean tokens of a round is the formula\'s, to within 1%, over 14,000 to 35,000 rounds a setting', () => {
    for (const [alpha, k] of [[700, 3], [500, 2], [900, 4], [300, 1]] as const) {
      const w = genWorkload(7, { requests: 200, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'const', value: 300 } } })
      const run = tick(cfg(alpha, { k }), w)
      const spec = run.summary.spec!
      expect(spec.rounds).toBeGreaterThan(14_000)
      const measured = (spec.emitted * 1000) / spec.rounds
      expect(Math.abs(measured - spec.expectedPerRoundMilli) / spec.expectedPerRoundMilli, `alpha ${alpha}, k ${k}: ${measured} against ${spec.expectedPerRoundMilli}`).toBeLessThan(0.01)
    }
  })

  test('expectedTokensPerRoundMilli is 1 + α + … + α^k: its worked values, and its end points', () => {
    expect(expectedTokensPerRoundMilli(0, 3)).toBe(1000)
    expect(expectedTokensPerRoundMilli(1000, 3)).toBe(4000)
    expect(expectedTokensPerRoundMilli(500, 2)).toBe(1750)
    expect(expectedTokensPerRoundMilli(700, 3)).toBe(2533)
    expect(expectedTokensPerRoundMilli(900, 4)).toBe(4095)
    expect(expectedTokensPerRoundMilli(800, 0)).toBe(1000)
    // The closed form (1 - α^(k+1)) / (1 - α) to a milli-token, by exact rationals.
    for (const alpha of [100, 250, 333, 500, 625, 700, 850, 999]) {
      for (const k of [1, 2, 3, 5, 8]) {
        const closed = (1000n ** BigInt(k + 1) - BigInt(alpha) ** BigInt(k + 1)) * 1000n * 1000n
        const real = Number(closed / (1000n ** BigInt(k) * BigInt(1000 - alpha))) / 1000
        expect(Math.abs(expectedTokensPerRoundMilli(alpha, k) - real), `α ${alpha}, k ${k}`).toBeLessThanOrEqual(1)
      }
    }
    expect(() => expectedTokensPerRoundMilli(1001, 2)).toThrow(/alphaPermille/)
    expect(() => expectedTokensPerRoundMilli(500, 65)).toThrow(/k is an integer/)
  })

  test('acceptedDrafts: the prefix length has the law α^j (1 − α) below k and α^k at k, and every round uses k draws whatever it gives', () => {
    const rng = rngFor(11, 'test/steploop-v1/accepted')
    const k = 3
    const counts = [0, 0, 0, 0]
    const rounds = 40_000
    for (let i = 0; i < rounds; i++) counts[acceptedDrafts(rng, k, 700)]++
    const law = [0.3, 0.7 * 0.3, 0.49 * 0.3, 0.343]
    for (let j = 0; j <= k; j++) expect(Math.abs(counts[j] / rounds - law[j]), `a = ${j}`).toBeLessThan(0.012)
    // Two streams from one seed stay together after a round that accepts all and a round that accepts none.
    const a = splitmix32u(5)
    const b = splitmix32u(5)
    expect(acceptedDrafts(a, 4, 1000)).toBe(4)
    expect(acceptedDrafts(b, 4, 0)).toBe(0)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  test('with MRV2 a speculative decode step is a uniform decode of 1 + k tokens a row, and the sizes decide whether a FULL graph holds it', () => {
    // 4 requests, k = 2: each decode step has 12 tokens in 4 rows of 3. With max_num_seqs 4 and query length 3 the FULL decode sizes are the
    // capture sizes rounded up to multiples of 3 and at most 12: with a 12 in the list the step replays a FULL graph, and without it it falls to PIECEWISE.
    // Output 4 is the prompt's token and one round of three.
    const w = workload(Array.from({ length: 4 }, () => ({ output: 4, prompt: 1 })))
    const base = { ...config({ ...TRAY, maxNumSeqs: 4 }, false), runner: 'mrv2' as const, spec: { k: 2, alphaPermille: 1000, draftCostPermille: 0 } }
    const withTwelve = tick({ ...base, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4, 8, 12, 16] } }, w)
    const withoutTwelve = tick({ ...base, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4, 8, 16] } }, w)
    // Step 0 is the four prompts (4 tokens), a mixed batch: PIECEWISE of size 4 in both.
    expect(withTwelve.steps.map((s) => [s.tokens, s.mode, s.paddedTokens])).toEqual([[4, 'PIECEWISE', 4], [12, 'FULL', 12]])
    expect(withoutTwelve.steps.map((s) => [s.tokens, s.mode, s.paddedTokens])).toEqual([[4, 'PIECEWISE', 4], [12, 'PIECEWISE', 16]])
  })

  test('refuses what vLLM would: a method MRV2 does not take, async scheduling with a method MRV1 cannot run it with, and sizes MRV1 would have rounded', () => {
    const w = one(3)
    const spec = { k: 2, alphaPermille: 500, draftCostPermille: 0 }
    expect(() => tick({ ...config(TRAY, false), runner: 'mrv2', spec: { ...spec, method: 'suffix' } }, w)).toThrow(/mrv2 runner does not take the speculative method suffix/)
    expect(() => tick({ ...config(TRAY, true), runner: 'v1', spec: { ...spec, method: 'ngram' } }, w)).toThrow(/async scheduling is not supported by the v1 runner with ngram/)
    expect(() => tick({ ...config(TRAY, false), runner: 'v1', spec: { ...spec, method: 'ngram' } }, w)).not.toThrow()
    expect(() => tick({ ...config(TRAY, true), runner: 'v1', spec, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4] } }, w)).toThrow(/multiples of the decode query length \(3\), and 1 is not one/)
    expect(() => tick({ ...config(TRAY, true), runner: 'v1', spec, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: mrv1RoundedSizes([1, 2, 4], 3) } }, w)).not.toThrow()
    expect(() => tick({ ...config(TRAY, false), runner: 'mrv2', spec: { ...spec, k: 0 } }, w)).toThrow(/spec\.k must be an integer of at least 1/)
    expect(() => tick({ ...config(TRAY, false), runner: 'mrv2', spec: { ...spec, alphaPermille: 1001 } }, w)).toThrow(/alphaPermille must be at most 1000/)
    expect(() => tick({ ...config(TRAY, false), runner: 'mrv2', spec: { ...spec, draftCostPermille: -1 } }, w)).toThrow(/draftCostPermille/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('graph modes inside a run (claims vllm.cudagraph.piecewise-partitions, vllm.cudagraph.mrv2-dispatch, vllm.cudagraph.mrv1-dispatch)', () => {
  const gpu = s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu')
  const host = HOST_PRESETS.mrv2.card
  const sizes = [1, 2, 4, 8, 16, 32]
  const run = (cfg: Partial<StepLoopConfig>, w: Workload, card: GpuCard = gpu) =>
    runStepLoop(w, { maxNumSeqs: 8, maxBatchedTokens: 8192, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', graphs: none, ...cfg }, host, card, { horizonUs: FOREVER })
  const launchOf = (r: StepLoopRun, step: number) => {
    const span = r.lanes['cpu-main'].find((s) => s.step === step && s.kind === 'launch')!
    return span.endUs - span.startUs
  }

  test('a launch costs one replay on FULL, (layers + 1) replays and one launch a layer on PIECEWISE, and a launch a kernel on NONE', () => {
    const layers = gpuLayers(gpu)
    expect(layers).toBe(80)
    const eager = host.launchPerKernelUs * host.kernelsPerLayer * layers
    const piecewise = (layers + 1) * host.graphReplayUs + layers * PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER * host.launchPerKernelUs
    // [mode, launch µs, launches] for 12 · 80 launches an eager step makes, 81 + 80 a piecewise one, and 1 a full one.
    expect([eager, piecewise, host.graphReplayUs]).toEqual([5760, 2910, 30])
    // One request, a prompt of 5 tokens and 3 outputs: step 0 is a prompt chunk (a mixed batch), steps 1 and 2 are decodes.
    const w = handWorkload([{ prompt: 5, output: 3 }])
    const expectMode = (mode: StepLoopConfig['graphs']['mode'], runner: 'mrv2' | 'v1', modes: string[], launchUs: number[], launches: number) => {
      const r = run({ runner, graphs: { mode, captureSizes: sizes } }, w)
      expect(r.steps.map((s) => s.mode), `${runner} ${mode}`).toEqual(modes)
      expect([0, 1, 2].map((i) => launchOf(r, i)), `${runner} ${mode}`).toEqual(launchUs)
      expect(r.summary.launches, `${runner} ${mode}`).toBe(launches)
    }
    const P = piecewise
    const F = host.graphReplayUs
    const E = eager
    const PL = layers + 1 + layers * PIECEWISE_ATTENTION_LAUNCHES_PER_LAYER
    // MRV2: the prompt chunk is a prefill (no uniform count), so it takes the mixed routine; the decodes take the decode routine.
    expectMode('PIECEWISE', 'mrv2', ['PIECEWISE', 'PIECEWISE', 'PIECEWISE'], [P, P, P], 3 * PL)
    expectMode('FULL', 'mrv2', ['FULL', 'FULL', 'FULL'], [F, F, F], 3)
    expectMode('FULL_DECODE_ONLY', 'mrv2', ['NONE', 'FULL', 'FULL'], [E, F, F], layers * 12 + 2)
    expectMode('FULL_AND_PIECEWISE', 'mrv2', ['PIECEWISE', 'FULL', 'FULL'], [P, F, F], PL + 2)
    // MRV1 reads the same steps the same way here: a 5-token chunk is not a uniform decode.
    expectMode('FULL_AND_PIECEWISE', 'v1', ['PIECEWISE', 'FULL', 'FULL'], [P, F, F], PL + 2)
    expectMode('FULL_DECODE_ONLY', 'v1', ['NONE', 'FULL', 'FULL'], [E, F, F], layers * 12 + 2)
  })

  test('a prompt of one token is a prefill that MRV2 keeps out of the decode graphs, and MRV1 does not tell from a uniform decode', () => {
    const w = handWorkload([{ prompt: 1, output: 3 }])
    const mode = (runner: 'mrv2' | 'v1') => run({ runner, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: sizes } }, w).steps.map((s) => s.mode)
    expect(mode('mrv2')).toEqual(['PIECEWISE', 'FULL', 'FULL'])
    expect(mode('v1')).toEqual(['FULL', 'FULL', 'FULL'])
  })

  test('the padded tokens are computed and counted: the GPU prices the padded batch, and the host prices the real one', () => {
    // A prompt chunk of 5 tokens is padded to 8 under the size list above: 3 padded tokens, each a one-token sequence of one KV entry and one pair.
    const w = handWorkload([{ prompt: 5, output: 1 }])
    const r = run({ runner: 'mrv2', graphs: { mode: 'PIECEWISE', captureSizes: sizes } }, w)
    expect(r.steps[0]).toMatchObject({ tokens: 5, paddedTokens: 8, graph: 'hit', mode: 'PIECEWISE' })
    expect(r.summary.paddedTokens).toBe(3)
    const load = stepLoad([{ kind: 'prefill', chunk: 5, done: 0 }])
    const expected = stepCard(gpu.spec, gpu.tp, { seqs: 1, tokens: 8, kvTokens: load.kvTokens + 3, attnPairs: load.attnPairs + 3 }).us
    expect(r.steps[0].gpuUs).toBe(expected)
    // Prepare is priced by the real tokens.
    const prepare = r.lanes['cpu-main'].find((s) => s.kind === 'prepare')!
    expect(prepare.endUs - prepare.startUs).toBe(host.prepPerTokenUs * 5)
  })

  test('above the largest captured size the step runs eagerly, whatever the mode', () => {
    const w = handWorkload([{ prompt: 40, output: 1 }])
    for (const mode of ['PIECEWISE', 'FULL', 'FULL_AND_PIECEWISE'] as const) {
      const r = run({ runner: 'mrv2', graphs: { mode, captureSizes: sizes } }, w)
      expect(r.steps[0]).toMatchObject({ tokens: 40, paddedTokens: 40, graph: 'miss', mode: 'NONE' })
    }
  })

  test('graphs off with a runner is the eager loop, and says NONE and "off"', () => {
    const r = run({ runner: 'mrv2', graphs: none }, handWorkload([{ prompt: 5, output: 2 }]))
    expect(r.steps.map((s) => [s.graph, s.mode])).toEqual([['off', 'NONE'], ['off', 'NONE']])
    expect(r.summary.eagerSteps).toBe(2)
  })

  test('the front page\'s v0 loop (packages/sim/steploop/run.ts) and the package\'s v1 loop agree on every configuration v0 can run, whole and cut: the same lanes, steps, requests, summary and violations, over 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = scenario(seed)
      const rng = rngFor(seed, 'test/steploop-v1/v0-cut')
      const whole = runStepLoopV0(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      const cut = Math.max(1, divRound(whole.summary.clockUs * between(rng, 10, 120), 100))
      for (const horizonUs of [FOREVER, cut]) {
        const a = runStepLoopV0(s.workload, s.cfg, s.host, s.gpu, { horizonUs })
        const b = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs })
        expect(canonicalJson(b), `seed ${seed} horizon ${horizonUs}`).toBe(canonicalJson(a))
      }
    }
  })

  test('FULL under a runner is v0\'s rule: the same spans as without a runner, over 200 seeds of v0 scenarios, on both runners', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = scenario(seed)
      const a = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      for (const runner of ['mrv2', 'v1'] as const) {
        const b = runStepLoop(s.workload, { ...s.cfg, runner }, s.host, s.gpu, { horizonUs: FOREVER })
        expect(b.lanes, `seed ${seed} ${runner}`).toStrictEqual(a.lanes)
        expect(b.reqs, `seed ${seed} ${runner}`).toStrictEqual(a.reqs)
        expect(b.summary, `seed ${seed} ${runner}`).toStrictEqual(a.summary)
        expect(b.steps.map(withoutMode), `seed ${seed} ${runner}`).toStrictEqual(a.steps)
        expect(b.steps.every((step) => step.mode === (step.graph === 'hit' ? 'FULL' : 'NONE')), `seed ${seed} ${runner}`).toBe(true)
      }
    }
  })

  test('a run without a runner still refuses the modes that dispatch through one, and says so', () => {
    expect(() => run({ graphs: { mode: 'PIECEWISE', captureSizes: sizes } }, handWorkload([{ output: 1 }]))).toThrow(/graphs\.mode is 'NONE' or 'FULL' in v0, got PIECEWISE: the other modes dispatch through a runner/)
    expect(() => run({ runner: 'mrv2', graphs: { mode: 'WHOLE' as never, captureSizes: sizes } }, handWorkload([{ output: 1 }]))).toThrow(/graphs\.mode is one of/)
    expect(() => run({ runner: 'mrv3' as never, graphs: none }, handWorkload([{ output: 1 }]))).toThrow(/runner is 'mrv2' or 'v1'/)
    expect(() => run({ runner: 'mrv2', graphs: { mode: 'FULL', captureSizes: [4, 2] } }, handWorkload([{ output: 1 }]))).toThrow(/ascending and distinct/)
    expect(() => run({ runner: 'mrv2', graphs: { mode: 'FULL', captureSizes: sizes, specializeLora: 'yes' as never } }, handWorkload([{ output: 1 }]))).toThrow(/specializeLora is true or false/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('adapters and the cap on them (claims vllm.lora.admission-cap, vllm.cudagraph.mrv2-active-loras)', () => {
  // Four requests, three adapters: 0, 1, 2, 0. Request 1 needs one token, so it leaves after the first step.
  const w = workload([
    { output: 3, adapter: 0 },
    { output: 1, adapter: 1 },
    { output: 2, adapter: 2 },
    { output: 2, adapter: 0 },
  ])
  const cfg = (lora?: { maxLoras: number }): StepLoopConfig => ({ ...config({ ...TRAY, maxNumSeqs: 4 }, false), runner: 'mrv2', ...(lora === undefined ? {} : { lora }) })

  test('a waiting request whose adapter would be a third is skipped, and the next request is tried; it is admitted when a slot of adapters frees', () => {
    const run = tick(cfg({ maxLoras: 2 }), w)
    // Step 0: request 0 (adapter 0) and 1 (adapter 1) fill the two adapter slots, request 2 (adapter 2) is skipped, and request 3 (adapter 0) is admitted.
    expect(run.steps[0]).toMatchObject({ seqs: 3, prefillSeqs: 3, activeLoras: 2 })
    // Request 1 stopped with its first token, so adapter 1 is free in step 1, where request 2 is admitted beside the decodes of 0 and 3.
    expect(run.steps[1]).toMatchObject({ seqs: 3, prefillSeqs: 1, activeLoras: 2 })
    expect(run.reqs.map((r) => r.finished)).toEqual([true, true, true, true])
    // Request 2 waited a step: its first token is read a step after request 0's.
    expect(run.reqs[2].ttftUs!).toBeGreaterThan(run.reqs[0].ttftUs!)
  })

  test('without a cap all four are admitted at once and the step has three adapters', () => {
    const run = tick(cfg({ maxLoras: 3 }), w)
    expect(run.steps[0]).toMatchObject({ seqs: 4, prefillSeqs: 4, activeLoras: 3 })
    // The cap is only on adapters: a config with no `lora` counts none and caps nothing.
    const free = tick(cfg(), w)
    expect(free.steps[0].seqs).toBe(4)
    expect(free.steps[0].activeLoras).toBeUndefined()
  })

  test('a request without an adapter is never held back, and a cap of 1 serialises two adapters', () => {
    const run = tick(cfg({ maxLoras: 1 }), workload([{ output: 2, adapter: 0 }, { output: 2, adapter: 1 }, { output: 2 }]))
    expect(run.steps[0]).toMatchObject({ seqs: 2, activeLoras: 1 })
    expect(run.steps[0].prefillSeqs).toBe(2)
  })

  test('both runners count the distinct adapters of the rows a step runs, and a running request the budget left out is in neither count (claims vllm.cudagraph.mrv2-active-loras, vllm.cudagraph.mrv1-batch-trim)', () => {
    // Budget 3 and k = 2: a decode row carries 3 tokens. Step 0 admits A (adapter 0) and B (adapter 1) with one-token prompts, 2 adapters.
    // From step 1 A's decode takes the whole budget, so B is running and has no row until A has stopped. A has 9 tokens: 1, then rounds of 3 (all accepted)
    // give 4, 7, and 9 after step 3. B then runs on its own for steps 4 to 6.
    const two = workload([{ prompt: 1, output: 9, adapter: 0 }, { prompt: 1, output: 9, adapter: 1 }])
    const base: StepLoopConfig = {
      ...config({ ...TRAY, maxBatchedTokens: 3 }, false),
      lora: { maxLoras: 2 },
      spec: { k: 2, alphaPermille: 1000, draftCostPermille: 0 },
    }
    for (const runner of ['mrv2', 'v1'] as const) {
      const run = tick({ ...base, runner }, two)
      expect(run.steps.map((s) => s.seqs), runner).toEqual([2, 1, 1, 1, 1, 1, 1])
      expect(run.steps.map((s) => s.activeLoras), runner).toEqual([2, 1, 1, 1, 1, 1, 1])
      expect(run.reqs.map((r) => r.finished), runner).toEqual([true, true])
    }
  })

  test('the dispatch reads the count: MRV1 with cudagraph_specialize_lora off has no graph for a batch with no adapter', () => {
    const w2 = workload([{ output: 3 }, { output: 3, adapter: 1 }])
    const sizes = [1, 2, 4]
    const gpu = s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu')
    const host = HOST_PRESETS.v1.card
    const make = (runner: 'mrv2' | 'v1', specializeLora: boolean) =>
      runStepLoop(w2, { maxNumSeqs: 4, maxBatchedTokens: 64, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', runner, lora: { maxLoras: 2 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: sizes, specializeLora } }, host, gpu, { horizonUs: FOREVER })
    // Both requests are running from step 0 (adapter 1 is active in every step), so make a batch with none: a second workload.
    const solo = workload([{ output: 3 }])
    const lone = (runner: 'mrv2' | 'v1', specializeLora: boolean) =>
      runStepLoop(solo, { maxNumSeqs: 4, maxBatchedTokens: 64, chunkedPrefill: true, asyncScheduling: false, inputIds: 'device', runner, lora: { maxLoras: 2 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: sizes, specializeLora } }, host, gpu, { horizonUs: FOREVER })
    expect(lone('mrv2', true).steps.map((s) => s.mode)).toEqual(['PIECEWISE', 'FULL', 'FULL'])
    expect(lone('mrv2', false).steps.map((s) => s.mode)).toEqual(['PIECEWISE', 'FULL', 'FULL'])
    expect(lone('v1', true).steps.map((s) => s.mode)).toEqual(['FULL', 'FULL', 'FULL'])
    expect(lone('v1', false).steps.map((s) => s.mode)).toEqual(['NONE', 'NONE', 'NONE'])
    // With an adapter in the batch both runners find the max_loras + 1 graph.
    expect(make('mrv2', false).steps.every((s) => s.mode !== 'NONE')).toBe(true)
    expect(make('v1', false).steps.every((s) => s.mode !== 'NONE')).toBe(true)
  })

  test('refuses a cap that is not a count', () => {
    expect(() => tick({ ...cfg(), lora: { maxLoras: 0 } }, w)).toThrow(/lora\.maxLoras must be an integer of at least 1/)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('check 5: on the 70B card no host work is counted on both lanes (D-044, proposed; claim vllm.step.order)', () => {
  const host: HostCard = { ...HOST_PRESETS.mrv2.card, schedulePerSeqUs: 777, samplePerSeqUs: 333 }
  const spec = s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu').spec
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1)

  /** The per-sequence terms on each lane of one step: what the CPU lane spends above its base and on sampling, and what the GPU lane's forward is. */
  function lanes(run: StepLoopRun, base: number) {
    return run.steps.map((step) => {
      const cpu = run.lanes['cpu-main']
      const schedule = cpu.find((s) => s.step === step.index && s.kind === 'schedule')
      const sample = cpu.find((s) => s.step === step.index && s.kind === 'sample')
      const cpuPerSeq = (schedule === undefined ? 0 : schedule.endUs - schedule.startUs - base) + (sample === undefined ? 0 : sample.endUs - sample.startUs)
      return { cpuPerSeq, gpu: step.gpuUs, seqs: step.seqs }
    })
  }

  test('the term is on the CPU lane by default, D-044 says it is proposed, and the card says where it is', () => {
    expect(D044).toEqual({ id: 'D-044', status: 'proposed', placement: 'on-cpu' })
    expect(DEFAULT_HOST_TERM).toBe('on-cpu')
    expect(s5Card('h100-vllm-0-10-2-fp8', 4).hostTerm).toBe('on-cpu')
    expect(s5Card('h100-vllm-0-10-2-fp8', 4).label).toContain('D-044, proposed')
    expect(s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu').label).not.toContain('D-044')
    expect(s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu').hostTerm).toBe('in-gpu')
  })

  test('each lane\'s per-sequence terms add up to S5\'s one term: the CPU lane gets seqs · t_seq and the GPU lane loses exactly that, step by step and in total', () => {
    let steps = 0
    for (const seed of seeds) {
      // A burst, so that both runs form the same batches: the batches of a burst depend on the rules and not on the clock.
      const rng = rngFor(seed, 'test/steploop-v1/d044')
      const w = genWorkload(seed, { requests: between(rng, 1, 40), arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 1, hi: 40 }, output: { kind: 'uniform', lo: 1, hi: 20 } } })
      const cfg = config({ ...HARNESS, maxNumSeqs: between(rng, 1, 64) }, below(rng, 2) === 0, { mode: 'FULL', captureSizes: defaultCaptureSizes(64) })
      const onCpu = runStepLoop(w, cfg, host, s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu'), { horizonUs: FOREVER })
      const inGpu = runStepLoop(w, cfg, host, s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu'), { horizonUs: FOREVER })
      expect(onCpu.steps.map((s) => [s.seqs, s.tokens, s.paddedTokens]), `seed ${seed}`).toEqual(inGpu.steps.map((s) => [s.seqs, s.tokens, s.paddedTokens]))
      const a = lanes(onCpu, host.scheduleBaseUs)
      const b = lanes(inGpu, host.scheduleBaseUs)
      let cpuTotal = 0
      let gpuMoved = 0
      for (const [k, step] of a.entries()) {
        const term = Math.min(b[k].gpu, Math.round(step.seqs * spec.params.seqUs))
        // On the CPU lane: exactly the S5 term, and neither of the host card's per-sequence phases (777 and 333 a row would show).
        expect(step.cpuPerSeq, `seed ${seed} step ${k}`).toBe(term)
        // Inside the GPU step: nothing on the CPU lane.
        expect(b[k].cpuPerSeq, `seed ${seed} step ${k}`).toBe(0)
        // What the CPU lane gained, the GPU lane lost.
        expect(b[k].gpu - step.gpu, `seed ${seed} step ${k}`).toBe(term)
        cpuTotal += step.cpuPerSeq
        gpuMoved += b[k].gpu - step.gpu
      }
      expect(cpuTotal, `seed ${seed}`).toBe(gpuMoved)
      steps += a.length
    }
    expect(steps).toBeGreaterThan(300)
  })

  test('the host card\'s own per-sequence phases are never charged on the 70B card, in either placement, and are charged on the tick card', () => {
    const w = genWorkload(3, { requests: 12, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 8 }, output: { kind: 'const', value: 5 } } })
    const cfg = config(HARNESS, false)
    const runs = {
      'on-cpu': runStepLoop(w, cfg, host, s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu'), { horizonUs: FOREVER }),
      'in-gpu': runStepLoop(w, cfg, host, s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu'), { horizonUs: FOREVER }),
    }
    for (const hostTerm of ['on-cpu', 'in-gpu'] as const) {
      const run = runs[hostTerm]
      // No sample span at all: the read-back is a sync and nothing else, because the card replaces the sampling phase.
      expect(run.lanes['cpu-main'].filter((s) => s.kind === 'sample'), hostTerm).toEqual([])
      for (const step of run.steps) {
        const schedule = run.lanes['cpu-main'].find((s) => s.step === step.index && s.kind === 'schedule')!
        // The whole step as S5 fitted it is what the GPU lane charges with the term inside it.
        const whole = runs['in-gpu'].steps[step.index].gpuUs
        const term = Math.min(whole, Math.round(step.seqs * spec.params.seqUs))
        // On the CPU lane the schedule phase is the base plus S5's term, and in the GPU step it is the base alone. The host card's 777 a row is never in it.
        expect(schedule.endUs - schedule.startUs, `${hostTerm} step ${step.index}`).toBe(host.scheduleBaseUs + (hostTerm === 'on-cpu' ? term : 0))
      }
    }
    // The tick card has no term of its own, so the host card's phases are the cost: 2 + 3 a row to schedule, 2 a row to sample.
    const ticks = runStepLoop(w, cfg, { ...TICK_CARD, schedulePerSeqUs: 3, samplePerSeqUs: 2 }, TICK_CARD, { horizonUs: FOREVER })
    for (const step of ticks.steps) {
      const schedule = ticks.lanes['cpu-main'].find((s) => s.step === step.index && s.kind === 'schedule')!
      const sample = ticks.lanes['cpu-main'].find((s) => s.step === step.index && s.kind === 'sample')!
      expect(schedule.endUs - schedule.startUs).toBe(2 + 3 * step.seqs)
      expect(sample.endUs - sample.startUs).toBe(2 * step.seqs)
    }
  })

  test('async scheduling has something to hide with the term on the CPU lane, and nothing with it in the GPU step', () => {
    const w = genWorkload(9, { requests: 64, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 16 }, output: { kind: 'const', value: 60 } } })
    const bubbles = (hostTerm: 'on-cpu' | 'in-gpu', asyncScheduling: boolean) =>
      runStepLoop(w, config(HARNESS, asyncScheduling, { mode: 'FULL', captureSizes: defaultCaptureSizes(512) }), HOST_PRESETS.mrv2.card, s5Card('h100-vllm-0-10-2-fp8', 4, hostTerm), { horizonUs: FOREVER }).summary
    const cpuSync = bubbles('on-cpu', false)
    const cpuAsync = bubbles('on-cpu', true)
    const gpuSync = bubbles('in-gpu', false)
    const gpuAsync = bubbles('in-gpu', true)
    // Without async both placements idle the GPU for the CPU's phases, and the CPU lane has more of them with the term on it.
    expect(cpuSync.bubbleUs).toBeGreaterThan(gpuSync.bubbleUs)
    // With async the term on the CPU lane hides under the forward, and every bubble closes.
    expect(cpuAsync.bubbleUs).toBe(0)
    expect(gpuAsync.bubbleUs).toBe(0)
    expect(cpuAsync.clockUs).toBeLessThan(gpuAsync.clockUs)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('the runner presets (D-041; claims vllm.mrv2.default-rule, vllm.mrv2.fallback-reasons, vllm.async-scheduling.mrv1-limits)', () => {
  test('mrv2 is the default preset and v1 the legacy one, each with the host card of ../host and the key its dispatcher uses', () => {
    expect(RUNNER_PRESETS.mrv2.host).toBe(HOST_PRESETS.mrv2)
    expect(RUNNER_PRESETS.v1.host).toBe(HOST_PRESETS.v1)
    expect(RUNNER_PRESETS.mrv2.key.type).toBe('BatchExecutionDescriptor')
    expect(RUNNER_PRESETS.mrv2.key.fields).toEqual(['cg_mode', 'num_tokens', 'num_reqs', 'uniform_token_count', 'max_query_len', 'num_active_loras', 'num_ubatches'])
    expect(RUNNER_PRESETS.v1.key.type).toBe('BatchDescriptor')
    expect(RUNNER_PRESETS.v1.key.fields).toEqual(['num_tokens', 'num_reqs', 'uniform', 'has_lora', 'num_active_loras'])
    expect(RUNNER_PRESETS.mrv2.key.fields).toHaveLength(7)
    expect(RUNNER_PRESETS.v1.key.fields).toHaveLength(5)
    expect(RUNNER_PRESETS.v1.key.fields).toContain('has_lora')
    expect(RUNNER_PRESETS.mrv2.key.fields).not.toContain('has_lora')
    expect(RUNNER_PRESETS.mrv2.maxInFlight).toBe(2)
    expect(RUNNER_PRESETS.v1.maxInFlight).toBe(2)
    expect(Object.isFrozen(RUNNER_PRESETS)).toBe(true)
  })

  test('MRV2 hands suffix and custom_class back to MRV1, takes the rest, and MRV1 runs async scheduling with only some methods', () => {
    expect(resolveRunner('mrv2', 'suffix')).toBe('v1')
    expect(resolveRunner('mrv2', 'custom_class')).toBe('v1')
    expect(resolveRunner('mrv2', 'eagle')).toBe('mrv2')
    expect(resolveRunner('mrv2')).toBe('mrv2')
    expect(resolveRunner('v1', 'suffix')).toBe('v1')
    expect(asyncSupported('mrv2', 'suffix')).toBe(true)
    expect(asyncSupported('v1')).toBe(true)
    for (const method of ['eagle', 'eagle3', 'mtp', 'ngram_gpu', 'draft_model', 'dspark', 'dflash'] as const) expect(asyncSupported('v1', method), method).toBe(true)
    for (const method of ['ngram', 'suffix', 'custom_class'] as const) expect(asyncSupported('v1', method), method).toBe(false)
  })

  test('the v1 host card prepares and syncs more slowly than the MRV2 one, as the card says, and the two agree on the scheduler', () => {
    const a = RUNNER_PRESETS.mrv2.host.card
    const b = RUNNER_PRESETS.v1.host.card
    expect(b.prepPerTokenUs).toBeGreaterThan(a.prepPerTokenUs)
    expect(b.syncUs).toBeGreaterThan(a.syncUs)
    expect([b.scheduleBaseUs, b.schedulePerSeqUs]).toEqual([a.scheduleBaseUs, a.schedulePerSeqUs])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('check 1: properties over 200 seeds (ARCHITECTURE §5.10)', () => {
  const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1)

  test('GPU spans never overlap, busy time stays within the horizon, no step reads a token before it is sampled, and every other invariant holds, with the run whole and with it cut', () => {
    const seen = new Set<string>()
    let steps = 0
    let masks = 0
    let rounds = 0
    for (const seed of SEEDS) {
      const s = scenarioV1(seed)
      const whole = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      checkInvariantsV1(s, whole, FOREVER)
      expect(whole.summary.finished, `seed ${seed}`).toBe(s.workload.reqs.length)
      steps += whole.steps.length
      masks += whole.summary.maskUs ?? 0
      rounds += whole.summary.spec?.rounds ?? 0
      for (const step of whole.steps) seen.add(`${s.cfg.runner}:${step.mode}`)

      const rng = rngFor(seed, 'test/steploop-v1/cut')
      const cut = Math.max(1, divRound(whole.summary.clockUs * between(rng, 10, 120), 100))
      const short = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: cut })
      checkInvariantsV1(s, short, cut)
      for (const lane of ['cpu-main', 'gpu-stream'] as const) {
        // A cut run is a prefix of the whole one: the same spans, and only the last of a lane may be shorter.
        const a = short.lanes[lane]
        const b = whole.lanes[lane]
        expect(a.length <= b.length, `seed ${seed} ${lane}`).toBe(true)
        for (const [i, span] of a.entries()) {
          expect({ step: span.step, kind: span.kind, startUs: span.startUs }, `seed ${seed} ${lane}[${i}]`).toEqual({ step: b[i].step, kind: b[i].kind, startUs: b[i].startUs })
          if (i < a.length - 1) expect(span.endUs, `seed ${seed} ${lane}[${i}]`).toBe(b[i].endUs)
          else expect(span.endUs === b[i].endUs || span.endUs === cut, `seed ${seed} ${lane} last`).toBe(true)
        }
      }
    }
    // The seeds reach both runners and every mode they can run as, so the pass is not vacuous.
    for (const key of ['mrv2:NONE', 'mrv2:FULL', 'mrv2:PIECEWISE', 'v1:NONE', 'v1:FULL', 'v1:PIECEWISE']) expect(seen.has(key), key).toBe(true)
    expect(steps).toBeGreaterThan(2500)
    expect(masks).toBeGreaterThan(0)
    expect(rounds).toBeGreaterThan(500)
  })

  test('a run is a pure function of its arguments: the same inputs give the same bytes', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const s = scenarioV1(seed)
      const a = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      const b = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      expect(canonicalJson(a), `seed ${seed}`).toBe(canonicalJson(b))
    }
  })

  test('input ids written on the host under async scheduling raise a violation at a step that has a decode row, with every v1 feature on, and never without async scheduling', () => {
    let flagged = 0
    let checked = 0
    for (const seed of SEEDS.slice(0, 80)) {
      const s = scenarioV1(seed)
      // MRV1 does not run the n-gram method under async scheduling, so a scenario that drew it asks for EAGLE here.
      const method = s.cfg.runner === 'v1' && s.cfg.spec?.method === 'ngram' ? 'eagle' : s.cfg.spec?.method
      const cfg: StepLoopConfig = { ...s.cfg, inputIds: 'host', ...(s.cfg.spec === undefined ? {} : { spec: { ...s.cfg.spec, method } }) }
      const run = runStepLoop(s.workload, { ...cfg, asyncScheduling: true }, s.host, s.gpu, { horizonUs: FOREVER })
      const steps = new Set<number>()
      for (const v of run.violations) {
        const step = run.steps[v.step]
        expect(v.kind, `seed ${seed}`).toBe('read-before-sample')
        expect(v.step >= 1 && step.seqs > step.prefillSeqs, `seed ${seed}: step ${v.step} has no decode row to read a token for`).toBe(true)
        expect(v.rows >= 1 && v.rows <= step.seqs - step.prefillSeqs, `seed ${seed}: step ${v.step}`).toBe(true)
        expect(run.lanes['cpu-main'].find((span) => span.step === v.step && span.kind === 'schedule')?.endUs, `seed ${seed}`).toBe(v.atUs)
        expect(steps.has(v.step), `seed ${seed}: two violations at step ${v.step}`).toBe(false)
        steps.add(v.step)
      }
      checked += run.steps.length
      flagged += run.violations.length > 0 ? 1 : 0
      // A request that needs a second token has a decode row right behind its first row, and under async scheduling the first is still in flight.
      if (s.workload.reqs.every((r) => r.outputTokens === 1)) expect(run.violations, `seed ${seed}`).toEqual([])
      const serial = runStepLoop(s.workload, { ...cfg, asyncScheduling: false }, s.host, s.gpu, { horizonUs: FOREVER })
      expect(serial.violations, `seed ${seed}`).toEqual([])
    }
    expect(flagged).toBeGreaterThan(40)
    expect(checked).toBeGreaterThan(800)
  })

  test('a run that turns no v1 feature on reports none of their fields', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const s = scenario(seed)
      const a = runStepLoop(s.workload, s.cfg, s.host, s.gpu, { horizonUs: FOREVER })
      const { lora, structured, spec } = s.cfg
      expect([lora, structured, spec]).toEqual([undefined, undefined, undefined])
      expect(a.summary.maskUs).toBeUndefined()
      expect(a.summary.spec).toBeUndefined()
      expect(a.steps.every((step) => step.mode === undefined && step.activeLoras === undefined && step.maskUs === undefined && step.draftUs === undefined)).toBe(true)
    }
  })

  test('takes about a millisecond a hundred steps with every feature on (a loose bound, 100 ms, so a loaded host does not fail it)', () => {
    const w = genWorkload(7, { requests: 64, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 16 }, output: { kind: 'const', value: 100 } }, adapters: { count: 4, sharePermille: 500 }, structuredPermille: 500 })
    const cfg: StepLoopConfig = {
      maxNumSeqs: 64,
      maxBatchedTokens: 8192,
      chunkedPrefill: true,
      asyncScheduling: true,
      inputIds: 'device',
      runner: 'mrv2',
      lora: { maxLoras: 3 },
      structured: { overlap: true },
      spec: { k: 2, alphaPermille: 700, draftCostPermille: 50 },
      graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: vllmCaptureSizes({ maxNumSeqs: 64, maxBatchedTokens: 8192, decodeQueryLen: 3 }) },
    }
    const host = HOST_PRESETS.mrv2.card
    const gpu = s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu')
    for (let i = 0; i < 5; i++) runStepLoop(w, cfg, host, gpu, { horizonUs: FOREVER })
    const times: number[] = []
    let steps = 0
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now()
      steps = runStepLoop(w, cfg, host, gpu, { horizonUs: FOREVER }).steps.length
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    expect(steps).toBeGreaterThan(30)
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(100)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('check 1: the goldens (tests/fixtures/sim/steploop-v1.json)', () => {
  const fixtureText = readFileSync(path.join(root, 'tests/fixtures/sim/steploop-v1.json'), 'utf8')
  /** The words of a vector's input in the fixture: the workload to draw, the configuration, the two cards, the horizon, and how much of the run is kept. */
  interface VectorInput {
    readonly workload: { readonly seed: number; readonly spec: Parameters<typeof genWorkload>[1] }
    readonly config: Omit<StepLoopConfig, 'graphs'> & {
      readonly graphs: Omit<StepLoopConfig['graphs'], 'captureSizes'> & {
        readonly captureSizes: readonly number[] | { readonly vllm: { readonly maxNumSeqs: number; readonly maxBatchedTokens: number; readonly decodeQueryLen?: number; readonly roundForV1?: boolean } }
      }
    }
    readonly host: 'tick' | 'v1' | 'mrv2' | { readonly card: 'tick'; readonly maskPerSeqUs: number }
    readonly gpu: { readonly card: 'tick' } | { readonly card: 's5'; readonly row: Parameters<typeof s5Card>[0]; readonly tp: number; readonly hostTerm: Parameters<typeof s5Card>[2] }
    readonly horizonUs: number
    readonly output: 'full' | 'digest'
  }
  const fixture = JSON.parse(fixtureText) as { model: string; vectors: { name: string; input: VectorInput; sha256: string; output: unknown }[] }

  /** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
  function fromInput(input: VectorInput): StepLoopRun {
    const w = genWorkload(input.workload.seed, input.workload.spec)
    const graphs = input.config.graphs
    const sizes: readonly number[] = Array.isArray(graphs.captureSizes)
      ? graphs.captureSizes
      : (() => {
          const v = (graphs.captureSizes as { vllm: { maxNumSeqs: number; maxBatchedTokens: number; decodeQueryLen?: number; roundForV1?: boolean } }).vllm
          const list = vllmCaptureSizes({ maxNumSeqs: v.maxNumSeqs, maxBatchedTokens: v.maxBatchedTokens, decodeQueryLen: v.decodeQueryLen ?? 1 })
          return v.roundForV1 === true ? mrv1RoundedSizes(list, v.decodeQueryLen ?? 1) : list
        })()
    const cfg: StepLoopConfig = { ...input.config, graphs: { ...graphs, captureSizes: sizes } }
    const host: HostCard = input.host === 'tick' ? TICK_CARD : typeof input.host === 'object' ? { ...TICK_CARD, maskPerSeqUs: input.host.maskPerSeqUs } : HOST_PRESETS[input.host].card
    const gpu: GpuCard = input.gpu.card === 'tick' ? TICK_CARD : s5Card(input.gpu.row, input.gpu.tp, input.gpu.hostTerm)
    return runStepLoop(w, cfg, host, gpu, { horizonUs: input.horizonUs })
  }

  function recorded(run: StepLoopRun, output: 'full' | 'digest'): unknown {
    if (output === 'full') return run
    const byMode: Record<string, number> = {}
    for (const step of run.steps) byMode[step.mode ?? 'none'] = (byMode[step.mode ?? 'none'] ?? 0) + 1
    const h = (value: unknown) => new Bun.CryptoHasher('sha256').update(canonicalJson(value)).digest('hex')
    return { summary: run.summary, violations: run.violations, steps: run.steps.length, stepsByMode: byMode, sha256: { lanes: h(run.lanes), steps: h(run.steps), reqs: h(run.reqs) } }
  }

  test('hold the vectors the task names: each feature has its own, and each name is used once', () => {
    expect(fixture.model).toBe('steploop-v1')
    const names = fixture.vectors.map((v) => v.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.length).toBeGreaterThanOrEqual(24)
    const has = (pattern: RegExp) => names.filter((n) => pattern.test(n)).length
    expect(has(/^MRV2 (PIECEWISE|FULL|FULL_DECODE_ONLY|FULL_AND_PIECEWISE)/)).toBeGreaterThanOrEqual(4)
    expect(has(/^MRV1/)).toBeGreaterThanOrEqual(4)
    expect(has(/padding|powers of 2/)).toBeGreaterThanOrEqual(1)
    expect(has(/defaults/)).toBe(2)
    expect(has(/adapter/)).toBeGreaterThanOrEqual(4)
    expect(has(/^mask /)).toBeGreaterThanOrEqual(5)
    expect(has(/^(speculation|the same speculation)/)).toBe(3)
    expect(has(/D-044/)).toBeGreaterThanOrEqual(1)
    expect(has(/^everything on/)).toBe(1)
  })

  test('reproduce byte for byte: each vector\'s input gives a run whose recorded form is the fixture\'s output, with the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const got = recorded(fromInput(vector.input), vector.input.output)
      expect(canonicalJson(got), vector.name).toBe(canonicalJson(vector.output))
      expect(new Bun.CryptoHasher('sha256').update(canonicalJson(vector.output)).digest('hex'), vector.name).toBe(vector.sha256)
    }
  })

  test('are what the script writes: the registry has the same cases in the same order, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'steploop-v1')!
    expect(model.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    expect(fixtureText).toBe(renderFixture(model, root))
  })

  test('say what the model is for: the modes differ where the batches do, and the D-044 default is faster than S5\'s placement under async scheduling', () => {
    // What a digest or a full run both hold: the summary, and for a digest the steps counted by mode.
    interface Recorded {
      readonly summary: StepLoopRun['summary']
      readonly stepsByMode: Record<string, number | undefined>
    }
    const by = (prefix: string): Recorded => fixture.vectors.find((v) => v.name.startsWith(prefix))!.output as Recorded
    const fullAndPiecewise = by('MRV2 FULL_AND_PIECEWISE, the default mode')
    expect(Object.keys(fullAndPiecewise.stepsByMode).sort()).toEqual(['FULL', 'PIECEWISE'])
    expect(Object.keys(by('MRV2 FULL_DECODE_ONLY').stepsByMode).sort()).toEqual(['FULL', 'NONE'])
    expect(Object.keys(by('MRV2 FULL:').stepsByMode)).toEqual(['FULL'])
    expect(Object.keys(by('MRV2 PIECEWISE').stepsByMode)).toEqual(['PIECEWISE'])
    // FULL_DECODE_ONLY launches the mixed steps kernel by kernel, and FULL_AND_PIECEWISE with graphs.
    expect(by('MRV2 FULL_DECODE_ONLY').summary.launches).toBeGreaterThan(fullAndPiecewise.summary.launches)
    expect(by('MRV2 with graphs off').summary.launches).toBeGreaterThan(by('MRV2 FULL_DECODE_ONLY').summary.launches)
    // The legacy runner with specialize_lora off runs the steps with no adapter eagerly; MRV2 does not.
    expect(by('MRV1 with cudagraph_specialize_lora off').stepsByMode.NONE ?? 0).toBeGreaterThan(by('MRV1 with the same adapters').stepsByMode.NONE ?? 0)
    expect(by('MRV2 with cudagraph_specialize_lora off').stepsByMode.NONE).toBeUndefined()
    // D-044: with async scheduling the term on the CPU lane finishes sooner.
    expect(by('70B card, the host term on the CPU lane').summary.clockUs).toBeLessThan(by('70B card, the host term inside the GPU step').summary.clockUs)
    // The mask: built after the forward is slower than hidden under it.
    const tickMasks = fixture.vectors.filter((v) => v.name.startsWith('mask on the tick card'))
    expect(tickMasks).toHaveLength(3)
    expect((tickMasks[1].output as Recorded).summary.clockUs).toBeGreaterThan((tickMasks[0].output as Recorded).summary.clockUs)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('every rule cites a claim id in a code comment (TRACKER W1-T12 check 2)', () => {
  const dir = path.join(root, 'packages/sim/steploop')
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts'))
  const text = (name: string) => readFileSync(path.join(dir, name), 'utf8')
  const compiled = compileContent({ root })
  const ids = new Set(compiled.claims.map((record) => record.claim.id))
  // A claim id is `<engine>.<topic>.<name>`, never preceded by a dot (that is a property access such as `card.spec.model.layers`).
  const CLAIM = /(?<![.\w])(?:vllm|sglang|spec|loop)\.[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+/g
  const cited = (source: string) => [...new Set(source.match(CLAIM) ?? [])]

  test('every claim id that a file of the model names exists', () => {
    for (const name of files) {
      const unknown = cited(text(name)).filter((id) => !ids.has(id))
      expect([name, unknown]).toEqual([name, []])
    }
  })

  test('the files that carry rules of the pinned engines cite their claims, and the ones that carry a lot cite a lot', () => {
    const minimum: Record<string, number> = { 'graphs.ts': 30, 'run-v1.ts': 14, 'mask.ts': 3, 'memory.ts': 5, 'engine-defaults.ts': 6, 'runners.ts': 6, 'spec.ts': 2 }
    for (const [name, least] of Object.entries(minimum)) expect([name, cited(text(name)).length >= least]).toEqual([name, true])
  })

  test('each function that encodes a rule names the claims of its rule in the comment above it', () => {
    const rules: Record<string, Record<string, string[]>> = {
      'graphs.ts': {
        resolveGraphMode: ['vllm.cudagraph.downgrade-mixed', 'vllm.cudagraph.downgrade-decode', 'vllm.cudagraph.downgrade-spec-decode'],
        vllmCaptureSizes: ['vllm.cudagraph.default-max-formula', 'vllm.cudagraph.sizes-budget-clamp', 'vllm.cudagraph.default-sizes-budget', 'vllm.cudagraph.default-sizes-seqs', 'vllm.cudagraph.capture-sizes'],
        mrv1RoundedSizes: ['vllm.cudagraph.mrv1-sizes-multiple'],
        capturedLoraCounts: ['vllm.cudagraph.lora-counts'],
        loraCaptureCases: ['vllm.cudagraph.mrv2-lora-cases', 'vllm.cudagraph.mrv1-lora-cases'],
        dispatchV2: ['vllm.cudagraph.mrv2-dispatch', 'vllm.cudagraph.mrv2-candidates', 'vllm.cudagraph.mrv2-uniform-count', 'vllm.cudagraph.mrv2-active-loras', 'vllm.cudagraph.mrv2-lora-clamp', 'vllm.cudagraph.mrv2-prefill-query-len'],
        dispatchV1: ['vllm.cudagraph.mrv1-dispatch', 'vllm.cudagraph.mrv1-uniform-decode', 'vllm.cudagraph.mrv1-lora-effective'],
        batchShape: ['vllm.cudagraph.mrv2-uniform-count', 'vllm.cudagraph.mrv2-prefill-query-len', 'vllm.cudagraph.mrv1-uniform-decode'],
        planV2: ['vllm.cudagraph.mrv2-candidates', 'vllm.cudagraph.mrv2-decode-descs', 'vllm.cudagraph.mrv2-mixed-descs'],
        planV1: ['vllm.cudagraph.mrv1-keys-mixed', 'vllm.cudagraph.mrv1-keys-decode', 'vllm.cudagraph.mrv1-lora-cases'],
        compatible: ['vllm.cudagraph.mrv2-compatible'],
      },
      'mask.ts': { maskFillUs: ['vllm.mask.fill-parallel-threshold', 'vllm.mask.fill-rows-per-request'] },
      'spec.ts': { expectedTokensPerRoundMilli: ['spec.paper.expected-tokens'], acceptedDrafts: [] },
      'memory.ts': { kvBudget: ['vllm.cudagraph.memory-subtracted'], graphReservationBytes: [] },
      'engine-defaults.ts': { vllmBatchDefaults: ['vllm.batch-defaults.threshold.large-gib'], sglangDecodeBuckets: ['sglang.cudagraph.decode-buckets', 'sglang.cudagraph.decode-max-bs.small'], sglangPrefillBuckets: ['sglang.cudagraph.prefill-buckets'] },
      'runners.ts': { resolveRunner: ['vllm.mrv2.default-rule'], asyncSupported: ['vllm.async-scheduling.mrv1-limits'] },
    }
    const missing: string[] = []
    for (const [name, functions] of Object.entries(rules)) {
      const source = text(name)
      for (const [fn, claims] of Object.entries(functions)) {
        const at = source.search(new RegExp(`^(?:export )?function ${fn}\\b`, 'm'))
        if (at < 0) {
          missing.push(`${name}: no function ${fn}`)
          continue
        }
        // The comment is the block that ends on the line before the function: from the last blank line, or the last line that is not a comment.
        const above = source.slice(0, at).split('\n')
        const block: string[] = []
        for (let i = above.length - 2; i >= 0; i--) {
          const line = above[i].trim()
          if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/**') || line.startsWith('*/')) block.unshift(line)
          else break
        }
        const comment = block.join('\n')
        for (const id of claims) if (!comment.includes(id)) missing.push(`${name}: ${fn} does not name ${id}`)
      }
    }
    expect(missing).toEqual([])
  })

  test('the claims that these comments name carry the pin they cite: the engine claims of vLLM cite v0.33.0, and the SGLang ones v0.5.23', () => {
    const wanted = new Set(files.flatMap((name) => cited(text(name))))
    for (const record of compiled.claims) {
      if (!wanted.has(record.claim.id) || record.claim.pin === undefined) continue
      const url = record.claim.source?.url ?? ''
      expect([record.claim.id, url.includes(record.claim.pin === 'vllm' ? '/v0.33.0/' : '/v0.5.23/') || /releases\/tag\/|pypi\.org/.test(url)]).toEqual([record.claim.id, true])
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('check 3: the notional-machine card (content/cards/trace-room-steploop.md)', () => {
  const card = readFileSync(path.join(root, 'content/cards/trace-room-steploop.md'), 'utf8')
  const section = (heading: string): string => {
    const start = card.indexOf(`\n## ${heading}\n`)
    if (start < 0) throw new Error(`the card has no "## ${heading}" section`)
    const body = card.slice(start + `\n## ${heading}\n`.length)
    const end = body.indexOf('\n## ')
    return end < 0 ? body : body.slice(0, end)
  }
  const ignores = section('Ignores')
  const models = section('Models')
  const calibrated = section('Calibrated against')

  test('models every v1 feature: the five modes and both dispatchers, the padding and the graph memory, the runner presets and the per-GPU defaults, the mask, speculation, adapters and D-044', () => {
    for (const phrase of ['PIECEWISE', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE', 'BatchExecutionDescriptor', 'has_lora', 'runner', 'RTX 4090', 'H100', 'bitmask', 'speculat', 'adapter', 'D-044']) {
      expect(models, phrase).toContain(phrase)
    }
    expect(models.toLowerCase()).toContain('graph memory')
    expect(models).toContain('proposed')
  })

  test('no longer says v0 leaves the graph modes, the dispatch keys, the mask, speculation, adapters, the runner presets or the per-GPU defaults out', () => {
    expect(card).not.toContain('Not in v0')
    expect(card).not.toContain('arrive with W1-T12')
    expect(card).not.toContain('at version v0')
    for (const stale of ['PIECEWISE, FULL_DECODE_ONLY and FULL_AND_PIECEWISE graph modes, the dispatch keys, and graph memory', 'the structured-output mask, speculation and adapters']) expect(ignores).not.toContain(stale)
  })

  test('lists what v1 still leaves out, where v0 listed what it had not built yet', () => {
    for (const phrase of ['KV manager', 'dual-batch overlap', 'varlen', 'dynamic speculative', 'max_tokens', 'pipeline parallelism', 'breakable', 'capture time', 'SGLang']) {
      expect(ignores.toLowerCase(), phrase).toContain(phrase.toLowerCase())
    }
  })

  test('says what the graph memory and the mask cost are calibrated against: nothing yet, and [estimated]', () => {
    expect(calibrated).toContain('nothing yet')
    expect(calibrated).toContain('[estimated]')
    expect(calibrated.toLowerCase()).toContain('graph memory')
    expect(calibrated.toLowerCase()).toContain('mask')
  })

  test('the card compiles under the repository\'s own gates: its numbers are tagged and its claims exist', () => {
    const compiled = compileContent({ root })
    const mine = compiled.diagnostics.filter((d) => d.file === 'content/cards/trace-room-steploop.md')
    expect(mine.map((d) => `${d.line}: ${d.message}`)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
describe('the generator script and the command lines run (check 4)', () => {
  test('bun scripts/vectors.ts --check passes with the v1 model registered', () => {
    expect(MODELS.map((m) => m.model)).toContain('steploop-v1')
    const r = spawnSync('bun', ['scripts/vectors.ts', '--check'], { cwd: root, encoding: 'utf8' })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(new RegExp(`${MODELS.length} model\\(s\\)`))
  })
})
