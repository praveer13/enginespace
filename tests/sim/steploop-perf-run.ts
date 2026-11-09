/*
 * Times `runStepLoop` in a fresh Bun process, so the first call is a cold one: nothing has warmed the code before it (W0-T13
 * acceptance check 4). It prints one line of JSON, `{ firstMs, medianMs, minMs, maxMs, steps, requests }`, for a run of 64
 * requests that takes exactly 100 steps without overlap (a 16-token prompt and 100 output tokens each), on the 70B card with the
 * host term on the CPU lane, the MRV2 host card and graphs on.
 *
 *   bun tests/sim/steploop-perf-run.ts [--async] [--eager] [--samples <n>]
 *
 * tests/sim/steploop.test.ts runs it as a child process and asserts on what it prints. It is a script, not a test: bun test only
 * collects *.test.ts.
 */
import { HOST_PRESETS } from '../../packages/sim/host'
import { defaultCaptureSizes, runStepLoop, s5Card } from '../../packages/sim/steploop'
import type { StepLoopConfig } from '../../packages/sim/steploop'
import { genWorkload } from '../../packages/sim/workload'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const samplesAt = args.indexOf('--samples')
const samples = samplesAt >= 0 ? Number(args[samplesAt + 1]) : 40

const workload = genWorkload(7, {
  requests: 64,
  arrivals: { kind: 'burst' },
  lengths: { kind: 'dists', prompt: { kind: 'const', value: 16 }, output: { kind: 'const', value: 100 } },
})
const cfg: StepLoopConfig = {
  maxNumSeqs: 64,
  maxBatchedTokens: 8192,
  chunkedPrefill: true,
  asyncScheduling: flag('--async'),
  inputIds: 'device',
  graphs: flag('--eager') ? { mode: 'NONE', captureSizes: [] } : { mode: 'FULL', captureSizes: defaultCaptureSizes(512) },
}
const host = HOST_PRESETS.mrv2.card
const gpu = s5Card('h100-vllm-0-10-2-fp8', 4, 'on-cpu')

const once = () => {
  const t0 = performance.now()
  const run = runStepLoop(workload, cfg, host, gpu, { horizonUs: 600_000_000 })
  return { ms: performance.now() - t0, steps: run.steps.length }
}

const first = once()
const times: number[] = []
for (let i = 0; i < samples; i++) times.push(once().ms)
times.sort((a, b) => a - b)
console.log(
  JSON.stringify({
    firstMs: first.ms,
    medianMs: times[times.length >> 1],
    minMs: times[0],
    maxMs: times[times.length - 1],
    steps: first.steps,
    requests: workload.reqs.length,
  }),
)
