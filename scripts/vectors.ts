/**
 * vectors: the golden vectors of the simulation models, and the generated tables (ARCHITECTURE §5.10; verify:determinism, §10.2).
 *
 * A golden vector maps one input to the output a model gives for it, and a model commits its vectors in
 * tests/fixtures/sim/<model>.json. They pin behaviour: a change that moves an output fails `--check` until `--write` rewrites the
 * fixture, so the diff of the fixture is reviewed like code (§5.10). Each vector also carries the SHA-256 of its output's canonical
 * JSON, which is what the nightly cross-runtime run compares in Chromium, Firefox and WebKit (§5.10, WORLD §6).
 *
 *   bun scripts/vectors.ts --write    rewrite every fixture from the models
 *   bun scripts/vectors.ts --check    regenerate every fixture and table in memory, and fail on any difference
 *
 * Both take `--root <dir>` for a tree laid out like this repository, where the fixtures, the generated table and the vendored
 * slices are read and written. The models are always this checkout's.
 *
 * `--check` fails on: a fixture that is missing, or whose bytes differ from what the models write now (naming the vectors that
 * moved); a fixture in tests/fixtures/sim/ that no model owns; and a committed table that is not what its generator writes
 * (scripts/tables/exp-quantiles.ts).
 *
 * Adding a model: give it a `VectorModel` in MODELS, whose cases are JSON inputs and a function from them to the model's
 * output. `workload` (W0-T12), `steploop` (W0-T13), `trace` (W1-T08) and `bench` (W1-T31) were added this way.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runBench, summarize } from '../packages/sim/bench'
import type { ArrivalSpec, BenchRun, BenchSpec, OpenArrivals, ServerModel } from '../packages/sim/bench'
import { canonicalJson } from '../packages/sim/core/json'
import { HOST_PRESETS } from '../packages/sim/host'
import type { RunnerPresetId } from '../packages/sim/host'
import type { PhysicsRowKey } from '../packages/sim/physics'
import { TICK_CARD, defaultCaptureSizes, runStepLoop, s5Card } from '../packages/sim/steploop'
import type { GpuCard, S5HostTerm, StepLoopConfig, StepLoopRun } from '../packages/sim/steploop'
import { CLEAN_JITTER, DEFAULT_JITTER, attributeSteps, encodeTrace, traceChecks, traceFromRun, traceToJson } from '../packages/sim/trace'
import type { Attribution, JitterSpec } from '../packages/sim/trace'
import { genWorkload, parseSlice, replayWorkload } from '../packages/sim/workload'
import type { LengthPlan, ReplaySpec, SliceId, TraceSlice, Workload, WorkloadSpec } from '../packages/sim/workload'
import { checkTable } from './tables/exp-quantiles'

const repoRoot = path.resolve(import.meta.dirname, '..')
const FIXTURE_DIR = 'tests/fixtures/sim'
const SLICE_DIR = 'vendor/kernelspace/public/traces'

export interface VectorCase {
  readonly name: string
  /** JSON, and everything the output is a function of. */
  readonly input: unknown
  /** The model's output for the input: any value that has a canonical JSON form. */
  readonly run: () => unknown
}

export interface VectorModel {
  readonly model: string
  /** Repository-relative path of the fixture. */
  readonly file: string
  readonly header: string
  /** The cases, built against the repository at `root`, which is where slices are read from. */
  cases(root: string): readonly VectorCase[]
}

// ---------------------------------------------------------------------------------------------------------------------------
// workload

/** A workload spec as a fixture writes it: a slice is named by its file, and read from the vendored traces when the case runs. */
type WorkloadInput = {
  readonly fn: 'genWorkload'
  readonly seed: number
  readonly spec: Omit<WorkloadSpec, 'lengths'> & { readonly lengths: Extract<LengthPlan, { kind: 'dists' }> | { readonly kind: 'rows'; readonly slice: SliceId } }
}
type ReplayInput = { readonly fn: 'replayWorkload'; readonly seed: number; readonly spec: Omit<ReplaySpec, 'slice'> & { readonly slice: SliceId } }

const workloadInputs: Record<string, WorkloadInput | ReplayInput> = {
  'front page: a burst of 12, outputs from a heavy-tailed menu': {
    fn: 'genWorkload',
    seed: 1,
    spec: {
      requests: 12,
      arrivals: { kind: 'burst' },
      lengths: {
        kind: 'dists',
        prompt: { kind: 'const', value: 1 },
        output: { kind: 'menu', values: [1, 2, 3, 4, 6, 8, 12, 16], weights: [24, 20, 16, 12, 10, 8, 6, 4] },
      },
    },
  },
  'a decode batch of 64 requests due at once': {
    fn: 'genWorkload',
    seed: 2,
    spec: {
      requests: 64,
      arrivals: { kind: 'burst', atUs: 1000 },
      lengths: { kind: 'dists', prompt: { kind: 'const', value: 16 }, output: { kind: 'uniform', lo: 8, hi: 64 } },
    },
  },
  'Poisson arrivals at 8 requests a second, uniform lengths': {
    fn: 'genWorkload',
    seed: 3,
    spec: {
      requests: 24,
      arrivals: { kind: 'poisson', ratePerSMilli: 8000 },
      lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 32, hi: 512 }, output: { kind: 'uniform', lo: 4, hi: 96 } },
    },
  },
  'the same spec under seed 0': {
    fn: 'genWorkload',
    seed: 0,
    spec: {
      requests: 24,
      arrivals: { kind: 'poisson', ratePerSMilli: 8000 },
      lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 32, hi: 512 }, output: { kind: 'uniform', lo: 4, hi: 96 } },
    },
  },
  'the same spec under seed 0xffffffff': {
    fn: 'genWorkload',
    seed: 0xffffffff,
    spec: {
      requests: 24,
      arrivals: { kind: 'poisson', ratePerSMilli: 8000 },
      lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 32, hi: 512 }, output: { kind: 'uniform', lo: 4, hi: 96 } },
    },
  },
  'even arrivals every 500 µs from 250 µs': {
    fn: 'genWorkload',
    seed: 4,
    spec: {
      requests: 8,
      arrivals: { kind: 'even', gapUs: 500, startUs: 250 },
      lengths: { kind: 'dists', prompt: { kind: 'menu', values: [8, 64, 512], weights: [6, 3, 1] }, output: { kind: 'const', value: 32 } },
    },
  },
  'Poisson arrivals at 20 a second, with prefix groups, adapters and grammars': {
    fn: 'genWorkload',
    seed: 5,
    spec: {
      requests: 32,
      arrivals: { kind: 'poisson', ratePerSMilli: 20000 },
      lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 32, hi: 256 }, output: { kind: 'uniform', lo: 4, hi: 48 } },
      prefix: { groups: 4, prefixTokens: 64, sharePermille: 700 },
      adapters: { count: 3, sharePermille: 500, weights: [5, 3, 1] },
      structuredPermille: 250,
    },
  },
  'lengths resampled from the BurstGPT minute, under Poisson arrivals': {
    fn: 'genWorkload',
    seed: 6,
    spec: {
      requests: 16,
      arrivals: { kind: 'poisson', ratePerSMilli: 4000 },
      lengths: { kind: 'rows', slice: 'burstgpt-v2-busiest-minute' },
    },
  },
  'a replay of the BurstGPT minute at 8 times its pace, with adapters': {
    fn: 'replayWorkload',
    seed: 7,
    spec: { slice: 'burstgpt-v2-busiest-minute', requests: 24, speedPermille: 8000, adapters: { count: 2, sharePermille: 400 } },
  },
  'a replay of the Kimi conversation trace at 100 times its pace': {
    fn: 'replayWorkload',
    seed: 8,
    spec: { slice: 'kimi-conversation', requests: 16, speedPermille: 100000, structuredPermille: 100 },
  },
}

function loadSlice(root: string, id: SliceId): TraceSlice {
  return parseSlice(JSON.parse(readFileSync(path.join(root, SLICE_DIR, `${id}.json`), 'utf8')))
}

function runWorkload(root: string, input: WorkloadInput | ReplayInput): Workload {
  if (input.fn === 'replayWorkload') return replayWorkload(input.seed, { ...input.spec, slice: loadSlice(root, input.spec.slice) })
  const { lengths } = input.spec
  return genWorkload(input.seed, { ...input.spec, lengths: lengths.kind === 'rows' ? { kind: 'rows', slice: loadSlice(root, lengths.slice) } : lengths })
}

const workload: VectorModel = {
  model: 'workload',
  file: `${FIXTURE_DIR}/workload.json`,
  header:
    'Golden vectors for packages/sim/workload (ARCHITECTURE section 5.10): each maps its input to the workload it generates, with the SHA-256 of that workload\'s canonical JSON. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: (root) => Object.entries(workloadInputs).map(([name, input]) => ({ name, input, run: () => runWorkload(root, input) })),
}

// ---------------------------------------------------------------------------------------------------------------------------
// steploop

/**
 * A step-loop run as a fixture writes it: every argument of `runStepLoop`, with the workload spelled out as above, the host card
 * and the S5 row named, and the capture sizes given as vLLM's default list up to a maximum, so the fixture stays readable.
 */
type SteploopInput = {
  readonly workload: WorkloadInput
  readonly config: Omit<StepLoopConfig, 'graphs'> & {
    readonly graphs: { readonly mode: 'NONE' } | { readonly mode: 'FULL'; readonly captureSizes: { readonly defaultMax: number } }
  }
  readonly host: 'tick' | RunnerPresetId
  readonly gpu: { readonly card: 'tick' } | { readonly card: 's5'; readonly row: PhysicsRowKey; readonly tp: number; readonly hostTerm: S5HostTerm }
  readonly horizonUs: number
  /** `full`: the whole run. `digest`: its summary and violations, with the SHA-256 of its lanes, its steps and its requests. */
  readonly output: 'full' | 'digest'
}

/** One of the generated workloads above, by its name. */
function generated(name: string): WorkloadInput {
  const input = workloadInputs[name]
  if (input === undefined || input.fn !== 'genWorkload') throw new Error(`there is no generated workload named "${name}"`)
  return input
}

const PRACTICE = generated('front page: a burst of 12, outputs from a heavy-tailed menu')
const DECODE_BATCH = generated('a decode batch of 64 requests due at once')
const POISSON = generated('Poisson arrivals at 8 requests a second, uniform lengths')
/** Ten requests a second apart on average, each short enough to finish long before the next. */
const SPARSE: WorkloadInput = {
  fn: 'genWorkload',
  seed: 11,
  spec: {
    requests: 10,
    arrivals: { kind: 'poisson', ratePerSMilli: 1000 },
    lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 32, hi: 128 }, output: { kind: 'uniform', lo: 4, hi: 16 } },
  },
}

/** The front page's tray: 4 slots, and a budget that never binds. */
const TRAY = { maxNumSeqs: 4, maxBatchedTokens: 2048, chunkedPrefill: true, inputIds: 'device' } as const
/** The harness S5's rows were fitted on: 64 sequences and an 8,192-token budget (WORLD §4.2). */
const HARNESS = { maxNumSeqs: 64, maxBatchedTokens: 8192, chunkedPrefill: true, inputIds: 'device' } as const
const H100_TP4 = { card: 's5', row: 'h100-vllm-0-10-2-fp8', tp: 4 } as const
const EAGER = { mode: 'NONE' } as const
const GRAPHS = { mode: 'FULL', captureSizes: { defaultMax: 512 } } as const
const FOREVER = 600_000_000

const steploopInputs: Record<string, SteploopInput> = {
  'practice seed: the front page\'s world with 4 slots and no overlap, where a step takes 7 ticks': {
    workload: PRACTICE,
    config: { ...TRAY, asyncScheduling: false, graphs: EAGER },
    host: 'tick',
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'practice seed: the same world with overlap (async scheduling), where the gaps close and one ghost token follows each stop': {
    workload: PRACTICE,
    config: { ...TRAY, asyncScheduling: true, graphs: EAGER },
    host: 'tick',
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'practice seed: overlap with the CPU writing the input ids from the host reads tokens before they are sampled': {
    workload: PRACTICE,
    config: { ...TRAY, inputIds: 'host', asyncScheduling: true, graphs: EAGER },
    host: 'tick',
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'practice seed: static batching, which admits nothing while any request of the batch is live, with no overlap': {
    workload: PRACTICE,
    config: { ...TRAY, batching: 'static', asyncScheduling: false, graphs: EAGER },
    host: 'tick',
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'practice seed: static batching with overlap, which the front page calls overlap alone': {
    workload: PRACTICE,
    config: { ...TRAY, batching: 'static', asyncScheduling: true, graphs: EAGER },
    host: 'tick',
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  '70B on H100 at TP 4, a decode batch of 64: S5 as fitted, eager launches, no overlap': {
    workload: DECODE_BATCH,
    config: { ...HARNESS, asyncScheduling: false, graphs: EAGER },
    host: 'mrv2',
    gpu: { ...H100_TP4, hostTerm: 'in-gpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  '70B on H100 at TP 4, a decode batch of 64: the host term on the CPU lane (D-044), eager launches, no overlap': {
    workload: DECODE_BATCH,
    config: { ...HARNESS, asyncScheduling: false, graphs: EAGER },
    host: 'mrv2',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  '70B on H100 at TP 4, a decode batch of 64: the host term on the CPU lane, eager launches, overlap': {
    workload: DECODE_BATCH,
    config: { ...HARNESS, asyncScheduling: true, graphs: EAGER },
    host: 'mrv2',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  '70B on H100 at TP 4, a decode batch of 64: the host term on the CPU lane, graphs on (vLLM\'s sizes up to 512), no overlap': {
    workload: DECODE_BATCH,
    config: { ...HARNESS, asyncScheduling: false, graphs: GRAPHS },
    host: 'mrv2',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  '70B on H100 at TP 4, a decode batch of 64: the host term on the CPU lane, graphs on, overlap': {
    workload: DECODE_BATCH,
    config: { ...HARNESS, asyncScheduling: true, graphs: GRAPHS },
    host: 'mrv2',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  '70B on H100 at TP 4, Poisson arrivals at 8 a second on the V1 runner, overlap and graphs on': {
    workload: POISSON,
    config: { ...HARNESS, asyncScheduling: true, graphs: GRAPHS },
    host: 'v1',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  '70B on H100 at TP 4, Poisson arrivals at 1 a second: the engine idles between requests, and an idle GPU beside an idle CPU is no bubble': {
    workload: SPARSE,
    config: { ...HARNESS, asyncScheduling: false, graphs: EAGER },
    host: 'v1',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  'the same run cut at 2 s: the clock stops, spans are cut, and steps in flight are never read back': {
    workload: POISSON,
    config: { ...HARNESS, asyncScheduling: true, graphs: GRAPHS },
    host: 'v1',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: 2_000_000,
    output: 'digest',
  },
  '70B on H100 at TP 4, chunked prefill: prompts of 600 to 1,500 tokens through a 512-token budget': {
    workload: {
      fn: 'genWorkload',
      seed: 9,
      spec: {
        requests: 12,
        arrivals: { kind: 'poisson', ratePerSMilli: 20000 },
        lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 600, hi: 1500 }, output: { kind: 'uniform', lo: 4, hi: 16 } },
      },
    },
    config: { maxNumSeqs: 8, maxBatchedTokens: 512, chunkedPrefill: true, inputIds: 'device', asyncScheduling: true, graphs: GRAPHS },
    host: 'mrv2',
    gpu: { ...H100_TP4, hostTerm: 'on-cpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
}

function runSteploop(root: string, input: SteploopInput): StepLoopRun {
  const { graphs } = input.config
  const config: StepLoopConfig = {
    ...input.config,
    graphs: graphs.mode === 'NONE' ? { mode: 'NONE', captureSizes: [] } : { mode: 'FULL', captureSizes: defaultCaptureSizes(graphs.captureSizes.defaultMax) },
  }
  const host = input.host === 'tick' ? TICK_CARD : HOST_PRESETS[input.host].card
  const gpu: GpuCard = input.gpu.card === 'tick' ? TICK_CARD : s5Card(input.gpu.row, input.gpu.tp, input.gpu.hostTerm)
  return runStepLoop(runWorkload(root, input.workload), config, host, gpu, { horizonUs: input.horizonUs })
}

/** What a vector records of a run: all of it, or its summary and violations with the SHA-256 of each part. */
function steploopOutput(run: StepLoopRun, output: SteploopInput['output']): unknown {
  if (output === 'full') return run
  return {
    summary: run.summary,
    violations: run.violations,
    steps: run.steps.length,
    sha256: { lanes: sha256(canonicalJson(run.lanes)), steps: sha256(canonicalJson(run.steps)), reqs: sha256(canonicalJson(run.reqs)) },
  }
}

const steploop: VectorModel = {
  model: 'steploop',
  file: `${FIXTURE_DIR}/steploop.json`,
  header:
    'Golden vectors for packages/sim/steploop (ARCHITECTURE section 5.10): each maps its input, a workload with a configuration, a host card, a GPU card and a horizon, to the run it gives, with the SHA-256 of that run\'s canonical JSON. A run of the front page\'s world is recorded whole: its lanes\' spans, its steps, its requests, its summary and its violations. A longer run is recorded as its summary and violations with the SHA-256 of its lanes, steps and requests. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: (root) =>
    Object.entries(steploopInputs).map(([name, input]) => ({ name, input, run: () => steploopOutput(runSteploop(root, input), input.output) })),
}

// ---------------------------------------------------------------------------------------------------------------------------
// trace

/**
 * A synthetic trace as a fixture writes it: the step-loop run it is made from (every argument of `runStepLoop`, as a step-loop vector
 * spells them), the seed and the jitter of `traceFromRun`, and what the vector records of the trace.
 */
type TraceInput = {
  readonly run: Omit<SteploopInput, 'output'>
  readonly seed: number
  readonly jitter: JitterSpec
  /**
   * `full`: the trace in columns, the verdict of every check and the partition of every step window. `digest`: its counts, the
   * SHA-256 of its canonical text, the verdicts, the partition summed over its windows, and its first two windows in full.
   */
  readonly output: 'full' | 'digest'
}

/** A step-loop vector's run, under another horizon. */
const cut = (input: SteploopInput, horizonUs: number): Omit<SteploopInput, 'output'> => ({
  workload: input.workload,
  config: input.config,
  host: input.host,
  gpu: input.gpu,
  horizonUs,
})
const whole = (input: SteploopInput): Omit<SteploopInput, 'output'> => cut(input, input.horizonUs)

const stepInput = (name: string): SteploopInput => {
  const input = steploopInputs[name]
  if (input === undefined) throw new Error(`there is no step-loop vector named "${name}"`)
  return input
}
const PRACTICE_SYNC = stepInput('practice seed: the front page\'s world with 4 slots and no overlap, where a step takes 7 ticks')
const PRACTICE_ASYNC = stepInput('practice seed: the same world with overlap (async scheduling), where the gaps close and one ghost token follows each stop')
const H100_EAGER = stepInput('70B on H100 at TP 4, a decode batch of 64: the host term on the CPU lane (D-044), eager launches, no overlap')
const H100_OVERLAP_GRAPHS = stepInput('70B on H100 at TP 4, a decode batch of 64: the host term on the CPU lane, graphs on, overlap')
const POISSON_V1 = stepInput('70B on H100 at TP 4, Poisson arrivals at 8 a second on the V1 runner, overlap and graphs on')
const SPARSE_V1 = stepInput('70B on H100 at TP 4, Poisson arrivals at 1 a second: the engine idles between requests, and an idle GPU beside an idle CPU is no bubble')
const CHUNKED = stepInput('70B on H100 at TP 4, chunked prefill: prompts of 600 to 1,500 tokens through a 512-token budget')

/** Three kernels a forward, so that a trace recorded whole stays short enough to read. */
const SHORT: JitterSpec = { ...DEFAULT_JITTER, kernelsPerForward: 3 }
const ROUGH: JitterSpec = { kernelsPerForward: 7, spreadPermille: 900, copyPermille: 100, launchGapPermille: 900, cpuNoiseNs: 250 }

const traceInputs: Record<string, TraceInput> = {
  'practice seed, no overlap, cut after 40 ticks, 3 kernels a forward: the whole trace, where each forward has the gap before it in its window': {
    run: cut(PRACTICE_SYNC, 40),
    seed: 1,
    jitter: SHORT,
    output: 'full',
  },
  'practice seed with overlap, cut after 40 ticks, clean jitter: the whole trace, where the forwards run back to back and no window has a gap': {
    run: cut(PRACTICE_ASYNC, 40),
    seed: 2,
    jitter: { ...CLEAN_JITTER, kernelsPerForward: 3 },
    output: 'full',
  },
  '70B on H100 at TP 4, a decode batch of 64, eager launches, no overlap: every step waits on its launch calls': {
    run: whole(H100_EAGER),
    seed: 3,
    jitter: DEFAULT_JITTER,
    output: 'digest',
  },
  '70B on H100 at TP 4, a decode batch of 64, graphs on, overlap: one replay call a step': {
    run: whole(H100_OVERLAP_GRAPHS),
    seed: 4,
    jitter: DEFAULT_JITTER,
    output: 'digest',
  },
  '70B on H100 at TP 4, Poisson arrivals on the V1 runner, overlap and graphs on, the roughest jitter': {
    run: whole(POISSON_V1),
    seed: 5,
    jitter: ROUGH,
    output: 'digest',
  },
  'the same run under seed 0 and the default jitter': {
    run: whole(POISSON_V1),
    seed: 0,
    jitter: DEFAULT_JITTER,
    output: 'digest',
  },
  '70B on H100 at TP 4, Poisson arrivals at 1 a second: the engine idles between requests, and the windows hold both-idle time': {
    run: whole(SPARSE_V1),
    seed: 6,
    jitter: DEFAULT_JITTER,
    output: 'digest',
  },
  'the Poisson run cut at 2 s: the horizon cuts the last spans, and a step whose forward it cut away has no window': {
    run: cut(POISSON_V1, 2_000_000),
    seed: 7,
    jitter: DEFAULT_JITTER,
    output: 'digest',
  },
  '70B on H100 at TP 4, chunked prefill: prompts of 600 to 1,500 tokens through a 512-token budget': {
    run: whole(CHUNKED),
    seed: 8,
    jitter: DEFAULT_JITTER,
    output: 'digest',
  },
}

/** The partition of every window of a trace added up. */
function totals(windows: readonly Attribution[]) {
  const sum = (pick: (a: Attribution) => number) => windows.reduce((total, a) => total + pick(a), 0)
  return {
    windows: windows.length,
    windowNs: sum((a) => a.windowNs),
    gpuBusyNs: sum((a) => a.gpuBusyNs),
    kernelNs: sum((a) => a.kernelNs),
    copyOnlyNs: sum((a) => a.copyOnlyNs),
    cpuGapNs: sum((a) => a.cpuGapNs),
    bothIdleNs: sum((a) => a.bothIdleNs),
    overlapNs: sum((a) => a.overlapNs),
  }
}

function traceOutput(root: string, input: TraceInput): unknown {
  const trace = traceFromRun(runSteploop(root, { ...input.run, output: 'digest' }), input.seed, input.jitter)
  const windows = attributeSteps(trace)
  const checks = traceChecks(trace)
  if (input.output === 'full') return { trace: traceToJson(trace), checks, windows }
  return {
    counts: { spans: trace.spans.track.length, strings: trace.strings.length, tracks: trace.tracks.length, flows: trace.flows.length, marks: trace.marks.length },
    sha256: sha256(encodeTrace(trace)),
    checks: checks.map(({ id, pass, checked }) => ({ id, pass, checked })),
    totals: totals(windows),
    first: windows.slice(0, 2),
  }
}

const trace: VectorModel = {
  model: 'trace',
  file: `${FIXTURE_DIR}/trace.json`,
  header:
    'Golden vectors for packages/sim/trace (ARCHITECTURE section 5.10): each maps its input, a step-loop run with the seed and the jitter of traceFromRun, to the synthetic trace it gives, with the SHA-256 of that output\'s canonical JSON. A short trace is recorded whole: its columns, the verdict of every check and the partition of every step window. A longer one is recorded as its counts, the SHA-256 of its canonical text, the verdicts, the partition summed over its windows and its first two windows. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: (root) => Object.entries(traceInputs).map(([name, input]) => ({ name, input, run: () => traceOutput(root, input) })),
}

// ---------------------------------------------------------------------------------------------------------------------------
// bench

/** An arrival schedule as a fixture writes it: a replayed slice is named by its file. */
type OpenArrivalsInput = Exclude<OpenArrivals, { kind: 'replay' }> | { readonly kind: 'replay'; readonly slice: SliceId; readonly speedPermille: number }
type ArrivalInput = OpenArrivalsInput | { readonly kind: 'closed'; readonly clients: number; readonly thinkUs: number; readonly schedule?: OpenArrivalsInput }

/**
 * A benchmark as a fixture writes it: every argument of `runBench`, with the server's GPU card named (the tick card, or an S5 row
 * at a tensor-parallel degree) and a replayed slice named by its file. `output` is `full` (the log's rows, with the summary) or
 * `digest` (the summary, with the SHA-256 of the rows).
 */
type BenchInput = {
  readonly seed: number
  readonly spec: Omit<BenchSpec, 'arrivals'> & { readonly arrivals: ArrivalInput }
  readonly server: Omit<ServerModel, 'gpu'> & { readonly gpu: { readonly card: 'tick' } | { readonly card: 's5'; readonly row: PhysicsRowKey; readonly tp: number; readonly hostTerm: S5HostTerm } }
  readonly summary: { readonly bootstrap: number; readonly seed: number }
  readonly output: 'full' | 'digest'
}

const S5_SERVER = {
  maxNumSeqs: 64,
  maxBatchedTokens: 8192,
  chunkedPrefill: true,
  gpu: { card: 's5', row: 'h100-vllm-0-10-2-fp8', tp: 4, hostTerm: 'in-gpu' },
} as const
const LLM_LENGTHS = { kind: 'dists', prompt: { kind: 'uniform', lo: 128, hi: 512 }, output: { kind: 'uniform', lo: 64, hi: 192 } } as const
/** 8 requests a second for 60 s with a 10 s warm-up: about 400 measured requests, a server a quarter full. */
const S5_BENCH = {
  lengths: LLM_LENGTHS,
  requests: 1000,
  warmupUs: 10_000_000,
  durationUs: 60_000_000,
  slo: { ttftUs: 500_000, tpotUs: 50_000 },
} as const
const S5_POISSON = { kind: 'poisson', ratePerSMilli: 8000 } as const
const STALL_AT_30S = [{ atUs: 30_000_000, forUs: 5_000_000 }] as const
const TICK_SERVER = { maxNumSeqs: 4, maxBatchedTokens: 2048, chunkedPrefill: true, gpu: { card: 'tick' } } as const
const TICK_BENCH = {
  lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 1, hi: 3 }, output: { kind: 'uniform', lo: 2, hi: 12 } },
  requests: 12,
  warmupUs: 0,
  durationUs: 400,
  slo: { ttftUs: 30, tpotUs: 8 },
} as const
/** A Poisson process with a mean gap of 20 ticks, in requests a second ×1,000 (a tick is a µs of the model's clock). */
const TICK_POISSON = { kind: 'poisson', ratePerSMilli: 50_000_000 } as const

const benchInputs: Record<string, BenchInput> = {
  'tick world: 12 requests with Poisson arrivals, an open loop, so every send is on its due time': {
    seed: 21,
    spec: { ...TICK_BENCH, arrivals: TICK_POISSON },
    server: TICK_SERVER,
    summary: { bootstrap: 200, seed: 1 },
    output: 'full',
  },
  'tick world: the same schedule through 2 closed-loop clients, whose sends slip behind their due times': {
    seed: 21,
    spec: { ...TICK_BENCH, arrivals: { kind: 'closed', clients: 2, thinkUs: 0, schedule: TICK_POISSON } },
    server: TICK_SERVER,
    summary: { bootstrap: 200, seed: 1 },
    output: 'full',
  },
  '70B on H100 at TP 4: Poisson arrivals at 8 a second, an open loop': {
    seed: 31,
    spec: { ...S5_BENCH, arrivals: S5_POISSON },
    server: S5_SERVER,
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: the same schedule with the server frozen for 5 s at 30 s, an open loop': {
    seed: 31,
    spec: { ...S5_BENCH, arrivals: S5_POISSON },
    server: { ...S5_SERVER, stalls: STALL_AT_30S },
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: the same frozen server seen through 24 closed-loop clients, which hide the stall from their own timers': {
    seed: 31,
    spec: { ...S5_BENCH, arrivals: { kind: 'closed', clients: 24, thinkUs: 0, schedule: S5_POISSON } },
    server: { ...S5_SERVER, stalls: STALL_AT_30S },
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: 64 closed-loop clients with no schedule, which keep the server just full': {
    seed: 32,
    spec: { ...S5_BENCH, arrivals: { kind: 'closed', clients: 64, thinkUs: 0 } },
    server: S5_SERVER,
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: every request due at 0 behind 16 clients, the shape of `--request-rate inf --max-concurrency 16`': {
    seed: 33,
    spec: { ...S5_BENCH, requests: 200, warmupUs: 0, durationUs: 60_000_000, arrivals: { kind: 'closed', clients: 16, thinkUs: 0, schedule: { kind: 'burst' } } },
    server: S5_SERVER,
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: a replay of the BurstGPT minute at 8 times its pace': {
    seed: 34,
    spec: {
      requests: 480,
      warmupUs: 0,
      durationUs: 60_000_000,
      slo: { ttftUs: 2_000_000, tpotUs: 100_000 },
      arrivals: { kind: 'replay', slice: 'burstgpt-v2-busiest-minute', speedPermille: 8000 },
    },
    server: S5_SERVER,
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: a cold start for the first 20 s at 3 times the step time, with the warm-up counted': {
    seed: 35,
    spec: { ...S5_BENCH, warmupUs: 0, arrivals: S5_POISSON },
    server: { ...S5_SERVER, cold: { untilUs: 20_000_000, slowdownPermille: 3000 } },
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: replies cut at 16 tokens': {
    seed: 36,
    spec: { ...S5_BENCH, outputCap: 16, arrivals: S5_POISSON },
    server: S5_SERVER,
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: prompts left in the prefix cache by a previous run': {
    seed: 37,
    spec: { ...S5_BENCH, prefixWarm: true, arrivals: S5_POISSON },
    server: S5_SERVER,
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
  '70B on H100 at TP 4: a client that spends 150 ms of CPU on every send, against a schedule of one every 125 ms': {
    seed: 38,
    spec: { ...S5_BENCH, clientCostUs: 150_000, arrivals: S5_POISSON },
    server: S5_SERVER,
    summary: { bootstrap: 1000, seed: 2 },
    output: 'digest',
  },
}

function openArrivals(root: string, a: OpenArrivalsInput): OpenArrivals {
  return a.kind === 'replay' ? { kind: 'replay', slice: loadSlice(root, a.slice), speedPermille: a.speedPermille } : a
}

function benchArrivals(root: string, a: ArrivalInput): ArrivalSpec {
  if (a.kind !== 'closed') return openArrivals(root, a)
  return { kind: 'closed', clients: a.clients, thinkUs: a.thinkUs, ...(a.schedule === undefined ? {} : { schedule: openArrivals(root, a.schedule) }) }
}

function runBenchInput(root: string, input: BenchInput): BenchRun {
  const spec: BenchSpec = { ...input.spec, arrivals: benchArrivals(root, input.spec.arrivals) }
  const gpu: GpuCard = input.server.gpu.card === 'tick' ? TICK_CARD : s5Card(input.server.gpu.row, input.server.gpu.tp, input.server.gpu.hostTerm)
  return runBench(input.seed, spec, { ...input.server, gpu })
}

function benchOutput(root: string, input: BenchInput): unknown {
  const run = runBenchInput(root, input)
  const summary = summarize(run, input.summary)
  const common = { summary, steps: run.steps, endUs: run.endUs, gpuBusyUs: run.gpuBusyUs }
  if (input.output === 'full') return { ...common, rows: run.rows }
  return { ...common, rows: { count: run.rows.length, sha256: sha256(canonicalJson(run.rows)) } }
}

const bench: VectorModel = {
  model: 'bench',
  file: `${FIXTURE_DIR}/bench.json`,
  header:
    'Golden vectors for packages/sim/bench (ARCHITECTURE section 5.10): each maps its input, a benchmark spec with a seed, a server and the summary options, to the client\'s log and its summary, with the SHA-256 of that output\'s canonical JSON. A run on the front page\'s tick world is recorded whole: its rows and its summary. A longer run is recorded as its summary with the count and the SHA-256 of its rows. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: (root) => Object.entries(benchInputs).map(([name, input]) => ({ name, input, run: () => benchOutput(root, input) })),
}

export const MODELS: readonly VectorModel[] = [workload, steploop, trace, bench]

// ---------------------------------------------------------------------------------------------------------------------------
// fixtures

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

const WIDTH = 160

/** A value as indented JSON, except that anything that fits in WIDTH columns stays on one line. Keys are sorted, as in canonicalJson. */
function format(value: unknown, indent: string): string {
  const flat = canonicalJson(value)
  if (indent.length + flat.length <= WIDTH || typeof value !== 'object' || value === null) return flat
  const inner = `${indent}  `
  if (Array.isArray(value)) return `[\n${value.map((item) => inner + format(item, inner)).join(',\n')}\n${indent}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return `{\n${keys.map((key) => `${inner}${JSON.stringify(key)}: ${format(record[key], inner)}`).join(',\n')}\n${indent}}`
}

interface Entry {
  name: string
  input: unknown
  sha256: string
  output: unknown
}

function entriesOf(model: VectorModel, root: string): Entry[] {
  return model.cases(root).map((c) => {
    const output = c.run()
    return { name: c.name, input: c.input, sha256: sha256(canonicalJson(output)), output }
  })
}

/** The bytes of a model's fixture. */
export function renderFixture(model: VectorModel, root: string = repoRoot): string {
  const entries = entriesOf(model, root)
  const lines = ['{', `  "header": ${JSON.stringify(model.header)},`, `  "model": ${JSON.stringify(model.model)},`, '  "vectors": [']
  entries.forEach((entry, i) => {
    lines.push('    {')
    lines.push(`      "name": ${JSON.stringify(entry.name)},`)
    lines.push(`      "input": ${format(entry.input, '      ')},`)
    lines.push(`      "sha256": ${JSON.stringify(entry.sha256)},`)
    lines.push(`      "output": ${format(entry.output, '      ')}`)
    lines.push(i === entries.length - 1 ? '    }' : '    },')
  })
  lines.push('  ]', '}', '')
  return lines.join('\n')
}

/** The vectors that moved between the committed fixture and the models, by name. Empty if the fixture cannot be read as one. */
function movedVectors(model: VectorModel, committed: string, root: string): string[] {
  let before: unknown
  try {
    before = JSON.parse(committed)
  } catch {
    return [`${model.file} is not valid JSON`]
  }
  const old = new Map<string, Entry>()
  const list = typeof before === 'object' && before !== null ? (before as { vectors?: unknown }).vectors : undefined
  if (Array.isArray(list)) for (const item of list as Entry[]) if (item && typeof item.name === 'string') old.set(item.name, item)
  const moved: string[] = []
  for (const now of entriesOf(model, root)) {
    const was = old.get(now.name)
    old.delete(now.name)
    if (was === undefined) moved.push(`${model.file}: vector "${now.name}" is not in the fixture`)
    else if (canonicalJson(was.input) !== canonicalJson(now.input)) moved.push(`${model.file}: vector "${now.name}": its input changed`)
    else if (was.sha256 !== now.sha256 || canonicalJson(was.output) !== canonicalJson(now.output)) {
      moved.push(`${model.file}: vector "${now.name}": its output changed (sha256 ${String(was.sha256).slice(0, 12)}… is now ${now.sha256.slice(0, 12)}…)`)
    }
  }
  for (const name of old.keys()) moved.push(`${model.file}: vector "${name}" is in the fixture and no model produces it`)
  return moved
}

/** The problems with the committed fixtures and tables under `root`: empty when `--write` would change nothing. */
export function check(root: string = repoRoot, models: readonly VectorModel[] = MODELS): string[] {
  const problems: string[] = []
  for (const model of models) {
    const file = path.join(root, model.file)
    if (!existsSync(file)) {
      problems.push(`${model.file} is missing`)
      continue
    }
    const committed = readFileSync(file, 'utf8')
    if (committed === renderFixture(model, root)) continue
    const moved = movedVectors(model, committed, root)
    problems.push(...(moved.length > 0 ? moved : [`${model.file}: the bytes differ from what --write produces, though no vector moved (formatting)`]))
  }
  const owned = new Set(models.map((model) => model.file))
  const dir = path.join(root, FIXTURE_DIR)
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      const rel = `${FIXTURE_DIR}/${name}`
      if (name.endsWith('.json') && !owned.has(rel)) problems.push(`${rel} is a fixture no model owns: register the model in scripts/vectors.ts, or delete the file`)
    }
  }
  const table = checkTable(root)
  if (table) problems.push(table)
  return problems
}

export function write(root: string = repoRoot, models: readonly VectorModel[] = MODELS): void {
  for (const model of models) {
    mkdirSync(path.dirname(path.join(root, model.file)), { recursive: true })
    writeFileSync(path.join(root, model.file), renderFixture(model, root))
  }
}

const USAGE = 'usage: bun scripts/vectors.ts (--check | --write) [--root <dir>]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[]): number {
  let mode: 'check' | 'write' | undefined
  let root = repoRoot
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]
    if (argument === '--check' || argument === '--write') mode = argument === '--check' ? 'check' : 'write'
    else if (argument === '--root' && argv[i + 1] !== undefined) root = path.resolve(argv[++i])
    else {
      console.error(`vectors: unknown argument "${argument}"\n${USAGE}`)
      return 2
    }
  }
  if (mode === undefined) {
    console.error(USAGE)
    return 2
  }
  if (mode === 'write') {
    write(root)
    console.log(`vectors: wrote ${MODELS.map((model) => model.file).join(', ')}`)
    return 0
  }
  const problems = check(root)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`vectors: ${problem}`)
    console.error(`vectors: ${problems.length} problem(s). If the change is intended, run \`bun scripts/vectors.ts --write\` and review the diff (ARCHITECTURE §5.10).`)
    return 1
  }
  const count = MODELS.reduce((total, model) => total + model.cases(root).length, 0)
  console.log(`vectors: ${MODELS.length} model(s), ${count} vector(s) and the exponential table match what the code writes`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
