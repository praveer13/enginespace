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
 * (scripts/tables/exp-quantiles.ts and scripts/tables/chi-square-critical.ts).
 *
 * Adding a model: give it a `VectorModel` in MODELS, whose cases are JSON inputs and a function from them to the model's
 * output. `workload` (W0-T12), `steploop` (W0-T13), `trace` (W1-T08), `bench` (W1-T31), `spec` (W1-T26), `lifecycle` (W1-T16),
 * `steploop-v1` (W1-T12), `kv` (W1-T21) and `broken-bench` (W1-T32) were added this way.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brokenBenchCase, brokenFlawOf, correctedInterval, runBench, summarize } from '../packages/sim/bench'
import type { ArrivalSpec, BenchFlaw, BenchRun, BenchSpec, OpenArrivals, ServerModel } from '../packages/sim/bench'
import { canonicalJson } from '../packages/sim/core/json'
import { rngFor } from '../packages/sim/core/rng'
import { HOST_PRESETS } from '../packages/sim/host'
import type { RunnerPresetId } from '../packages/sim/host'
import { kvAdapterCatalog, kvOps, kvPreset, kvReference } from '../packages/sim/kv'
import type { KvOp, KvPresetId, KvResult } from '../packages/sim/kv'
import { CLEAN_LIFECYCLE_JITTER, DEFAULT_LIFECYCLE_JITTER, lifecycleTrace, pathFacts, referencePath } from '../packages/sim/lifecycle'
import type { LifecycleJitter, Scenario } from '../packages/sim/lifecycle'
import type { PhysicsRowKey } from '../packages/sim/physics'
import { BESTIARY, FINE_BAND, REFERENCE, SPARSE_BAND, SPEC_BAND, chiSquare, dist, drawCase, expectedTokensPerRound, labTest, verifyChain } from '../packages/sim/spec'
import type { PairBand } from '../packages/sim/spec'
import { ENGINE_DEFAULTS, TICK_CARD, defaultCaptureSizes, mrv1RoundedSizes, runStepLoop, s5Card, vllmCaptureSizes } from '../packages/sim/steploop'
import type { GpuCard, GraphSettings, S5HostTerm, StepLoopConfig, StepLoopRun } from '../packages/sim/steploop'
import { CLEAN_JITTER, DEFAULT_JITTER, attributeSteps, encodeTrace, traceChecks, traceFromRun, traceToJson } from '../packages/sim/trace'
import type { Attribution, JitterSpec } from '../packages/sim/trace'
import { genWorkload, parseSlice, replayWorkload } from '../packages/sim/workload'
import type { LengthPlan, ReplaySpec, SliceId, TraceSlice, Workload, WorkloadSpec } from '../packages/sim/workload'
import { checkCritical } from './tables/chi-square-critical'
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
// steploop-v1

/**
 * A step-loop v1 run as a fixture writes it: the same arguments as a v0 vector, with the v1 fields of the configuration (a runner, graph
 * modes, adapters, the mask, speculation), and the capture sizes either listed or named by vLLM's own rule for an engine's sequences and
 * budget (`vllmCaptureSizes`). A v0 vector's fixture is untouched: tests/fixtures/sim/steploop.json holds the runs without any v1 field.
 */
type SteploopV1Input = {
  readonly workload: WorkloadInput
  readonly config: Omit<StepLoopConfig, 'graphs'> & {
    readonly graphs: Omit<GraphSettings, 'captureSizes'> & {
      readonly captureSizes: readonly number[] | { readonly vllm: { readonly maxNumSeqs: number; readonly maxBatchedTokens: number; readonly decodeQueryLen?: number; readonly roundForV1?: boolean } }
    }
  }
  /** A runner's host card, or the tick card, which costs the mask nothing unless the vector gives it a price per row. */
  readonly host: 'tick' | RunnerPresetId | { readonly card: 'tick'; readonly maskPerSeqUs: number }
  readonly gpu: SteploopInput['gpu']
  readonly horizonUs: number
  /** `full`: the whole run. `digest`: its summary, violations, the steps counted by mode, and the SHA-256 of its lanes, steps and requests. */
  readonly output: 'full' | 'digest'
}

/** The 70B on H100 at TP 4 with the host term on the CPU lane (D-044, proposed): the cost card of the vectors below unless one says otherwise. */
const H100_TP4_CPU = { ...H100_TP4, hostTerm: 'on-cpu' } as const
/** The engine of S5's harness: 64 sequences and an 8,192-token budget. */
const HARNESS_ENGINE = { maxNumSeqs: 64, maxBatchedTokens: 8192 } as const
/** Sixty-four requests at once with prompts of 8 to 96 tokens: the first steps prefill, and the rest decode. */
const MIXED_BURST: WorkloadInput = {
  fn: 'genWorkload',
  seed: 21,
  spec: { requests: 64, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 8, hi: 96 }, output: { kind: 'uniform', lo: 8, hi: 48 } } },
}
/** A stream of 80 requests at 150 a second: most steps decode, and about every other one also runs a prompt of 16 to 96 tokens (a mixed batch). */
const MIXED_STREAM: WorkloadInput = {
  fn: 'genWorkload',
  seed: 27,
  spec: { requests: 80, arrivals: { kind: 'poisson', ratePerSMilli: 150_000 }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 16, hi: 96 }, output: { kind: 'uniform', lo: 16, hi: 48 } } },
}
/** A thin stream, 25 a second, in which a third of the requests ask for an adapter: many steps have no adapter in their batch. */
const ADAPTER_SPARSE: WorkloadInput = {
  fn: 'genWorkload',
  seed: 28,
  spec: {
    requests: 40,
    arrivals: { kind: 'poisson', ratePerSMilli: 25_000 },
    lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 16, hi: 64 }, output: { kind: 'uniform', lo: 8, hi: 24 } },
    adapters: { count: 4, sharePermille: 300 },
  },
}
/** Poisson arrivals, half of the requests with a grammar. */
const GRAMMAR_STREAM: WorkloadInput = {
  fn: 'genWorkload',
  seed: 23,
  spec: {
    requests: 40,
    arrivals: { kind: 'poisson', ratePerSMilli: 50_000 },
    lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 16, hi: 96 }, output: { kind: 'uniform', lo: 8, hi: 32 } },
    structuredPermille: 500,
  },
}
/** The front page's world: a burst of six short requests on four slots, and all of them with a grammar. */
const TICK_GRAMMAR: WorkloadInput = {
  fn: 'genWorkload',
  seed: 1,
  spec: {
    requests: 6,
    arrivals: { kind: 'burst' },
    lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'menu', values: [2, 3, 4, 6], weights: [3, 3, 2, 1] } },
    structuredPermille: 1000,
  },
}
/** A burst with long outputs, for speculation: many rounds to accept. */
const LONG_BURST: WorkloadInput = {
  fn: 'genWorkload',
  seed: 24,
  spec: { requests: 32, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 32, hi: 128 }, output: { kind: 'uniform', lo: 32, hi: 96 } } },
}
/** One hundred and twenty requests at once, for the two engines' defaults. */
const DEFAULTS_BURST: WorkloadInput = {
  fn: 'genWorkload',
  seed: 25,
  spec: { requests: 120, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 16, hi: 200 }, output: { kind: 'uniform', lo: 8, hi: 40 } } },
}
/** Everything at once: adapters, grammars, speculation. */
const EVERYTHING: WorkloadInput = {
  fn: 'genWorkload',
  seed: 26,
  spec: {
    requests: 48,
    arrivals: { kind: 'poisson', ratePerSMilli: 80_000 },
    lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 16, hi: 160 }, output: { kind: 'uniform', lo: 16, hi: 64 } },
    adapters: { count: 3, sharePermille: 600 },
    structuredPermille: 400,
  },
}

const V1_ENGINE = { maxNumSeqs: 64, maxBatchedTokens: 8192, chunkedPrefill: true, inputIds: 'device' } as const
/** vLLM's list up to 512, which the harness's 64 sequences would not make but a larger engine does: room for batches with a prefill. */
const LIST_512 = defaultCaptureSizes(512)
const v1Sizes = (decodeQueryLen = 1, roundForV1 = false) => ({ vllm: { ...HARNESS_ENGINE, decodeQueryLen, ...(roundForV1 ? { roundForV1 } : {}) } }) as const

const steploopV1Inputs: Record<string, SteploopV1Input> = {
  // --- Graph modes and dispatch keys, on the MRV2 runner (the default) -------------------------------------------------------------
  'MRV2 PIECEWISE: every step replays the graph of its size, with attention launched between the pieces': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'PIECEWISE', captureSizes: LIST_512 } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV2 FULL: one full graph for every batch, decode or mixed': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'FULL', captureSizes: LIST_512 } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV2 FULL_DECODE_ONLY: the decode steps replay a full graph and the steps with a prefill run eagerly': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'FULL_DECODE_ONLY', captureSizes: LIST_512 } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV2 FULL_AND_PIECEWISE, the default mode of vLLM: decode steps replay a full graph and the others piecewise graphs': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: LIST_512 } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV2 with graphs off, as a reference for the runs above': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'NONE', captureSizes: [] } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- The legacy runner ----------------------------------------------------------------------------------------------------------
  'MRV1 FULL_AND_PIECEWISE: the same workload through the legacy runner and its host card': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'v1', graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: LIST_512 } },
    host: 'v1',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV1 FULL_DECODE_ONLY': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'v1', graphs: { mode: 'FULL_DECODE_ONLY', captureSizes: LIST_512 } },
    host: 'v1',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- Capture-size padding -------------------------------------------------------------------------------------------------------
  'MRV2 FULL_AND_PIECEWISE with sizes 1 to 128 by powers of 2: the padding of a short list, and the batches above 128 that run eagerly': {
    workload: MIXED_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: [1, 2, 4, 8, 16, 32, 64, 128] } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- Per-GPU engine defaults ----------------------------------------------------------------------------------------------------
  'the 4090 defaults of vLLM (256 sequences, 2,048 tokens) with the capture sizes vLLM makes for them': {
    workload: DEFAULTS_BURST,
    config: {
      maxNumSeqs: ENGINE_DEFAULTS['rtx-4090'].vllm.seqs,
      maxBatchedTokens: ENGINE_DEFAULTS['rtx-4090'].vllm.serverTokens,
      chunkedPrefill: true,
      inputIds: 'device',
      asyncScheduling: true,
      runner: 'mrv2',
      graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: { vllm: { maxNumSeqs: ENGINE_DEFAULTS['rtx-4090'].vllm.seqs, maxBatchedTokens: ENGINE_DEFAULTS['rtx-4090'].vllm.serverTokens } } },
    },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'the H100 defaults of vLLM (1,024 sequences, 8,192 tokens) with the capture sizes vLLM makes for them': {
    workload: DEFAULTS_BURST,
    config: {
      maxNumSeqs: ENGINE_DEFAULTS.h100.vllm.seqs,
      maxBatchedTokens: ENGINE_DEFAULTS.h100.vllm.serverTokens,
      chunkedPrefill: true,
      inputIds: 'device',
      asyncScheduling: true,
      runner: 'mrv2',
      graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: { vllm: { maxNumSeqs: ENGINE_DEFAULTS.h100.vllm.seqs, maxBatchedTokens: ENGINE_DEFAULTS.h100.vllm.serverTokens } } },
    },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- Adapters -------------------------------------------------------------------------------------------------------------------
  'MRV2 with 4 adapters and a cap of 2: the graph for max_loras + 1 serves any batch with an adapter, and the graph of none the rest': {
    workload: ADAPTER_SPARSE,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', lora: { maxLoras: 2 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: LIST_512 } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV2 with cudagraph_specialize_lora off: it still captures the graphs without adapters, unlike MRV1': {
    workload: ADAPTER_SPARSE,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', lora: { maxLoras: 2 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: LIST_512, specializeLora: false } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV1 with the same adapters: has_lora is the key': {
    workload: ADAPTER_SPARSE,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'v1', lora: { maxLoras: 2 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: LIST_512 } },
    host: 'v1',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'MRV1 with cudagraph_specialize_lora off: only the max_loras + 1 graph exists, and a batch with no adapter runs eagerly': {
    workload: ADAPTER_SPARSE,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'v1', lora: { maxLoras: 2 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: LIST_512, specializeLora: false } },
    host: 'v1',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- The structured-output mask -------------------------------------------------------------------------------------------------
  'mask on the tick card, overlapped, without async scheduling: each fill hides under its own forward': {
    workload: TICK_GRAMMAR,
    config: { ...TRAY, asyncScheduling: false, runner: 'mrv2', structured: { overlap: true }, graphs: { mode: 'NONE', captureSizes: [] } },
    host: { card: 'tick', maskPerSeqUs: 1 },
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'mask on the tick card, built after the forward: each fill sits on the critical path': {
    workload: TICK_GRAMMAR,
    config: { ...TRAY, asyncScheduling: false, runner: 'mrv2', structured: { overlap: false }, graphs: { mode: 'NONE', captureSizes: [] } },
    host: { card: 'tick', maskPerSeqUs: 1 },
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'mask on the tick card, overlapped, with async scheduling: a fill waits for the token of the step before it': {
    workload: TICK_GRAMMAR,
    config: { ...TRAY, asyncScheduling: true, runner: 'mrv2', structured: { overlap: true }, graphs: { mode: 'NONE', captureSizes: [] } },
    host: { card: 'tick', maskPerSeqUs: 1 },
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'mask on the 70B card, overlapped, with async scheduling and half the requests structured': {
    workload: GRAMMAR_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', structured: { overlap: true }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: v1Sizes() } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'mask on the 70B card, built after the forward, without async scheduling': {
    workload: GRAMMAR_STREAM,
    config: { ...V1_ENGINE, asyncScheduling: false, runner: 'mrv2', structured: { overlap: false }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: v1Sizes() } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- Speculation ----------------------------------------------------------------------------------------------------------------
  'speculation on the tick card with every draft accepted: a round emits 3 tokens, and the step carries 3': {
    workload: { fn: 'genWorkload', seed: 3, spec: { requests: 2, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'const', value: 7 } } } },
    config: { ...TRAY, asyncScheduling: false, runner: 'mrv2', spec: { k: 2, alphaPermille: 1000, draftCostPermille: 0 }, graphs: { mode: 'NONE', captureSizes: [] } },
    host: 'tick',
    gpu: { card: 'tick' },
    horizonUs: FOREVER,
    output: 'full',
  },
  'speculation on the 70B card: 3 drafts, 70% accepted, a draft costs a tenth of a decode step, MRV2 and async': {
    workload: LONG_BURST,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', spec: { k: 3, alphaPermille: 700, draftCostPermille: 100 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: v1Sizes(4) } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  'the same speculation on MRV1, which rounds its sizes up to multiples of 4': {
    workload: LONG_BURST,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'v1', spec: { k: 3, alphaPermille: 700, draftCostPermille: 100 }, graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: v1Sizes(4, true) } },
    host: 'v1',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- D-044 ----------------------------------------------------------------------------------------------------------------------
  '70B card, the host term on the CPU lane (D-044, proposed): the default, so async scheduling has something to hide': {
    workload: MIXED_BURST,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: v1Sizes() } },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
  '70B card, the host term inside the GPU step as S5 fitted it': {
    workload: MIXED_BURST,
    config: { ...V1_ENGINE, asyncScheduling: true, runner: 'mrv2', graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: v1Sizes() } },
    host: 'mrv2',
    gpu: { ...H100_TP4, hostTerm: 'in-gpu' },
    horizonUs: FOREVER,
    output: 'digest',
  },
  // --- All together -----------------------------------------------------------------------------------------------------------------
  'everything on: MRV2, FULL_AND_PIECEWISE, adapters with a cap of 3, the mask overlapped, and speculation, with async scheduling': {
    workload: EVERYTHING,
    config: {
      ...V1_ENGINE,
      asyncScheduling: true,
      runner: 'mrv2',
      lora: { maxLoras: 3 },
      structured: { overlap: true },
      spec: { k: 2, alphaPermille: 800, draftCostPermille: 50 },
      graphs: { mode: 'FULL_AND_PIECEWISE', captureSizes: v1Sizes(3), specializeActiveLora: true },
    },
    host: 'mrv2',
    gpu: H100_TP4_CPU,
    horizonUs: FOREVER,
    output: 'digest',
  },
}

function runSteploopV1(root: string, input: SteploopV1Input): StepLoopRun {
  const { graphs } = input.config
  let captureSizes: readonly number[]
  if (Array.isArray(graphs.captureSizes)) captureSizes = graphs.captureSizes
  else {
    const { vllm } = graphs.captureSizes as { vllm: { maxNumSeqs: number; maxBatchedTokens: number; decodeQueryLen?: number; roundForV1?: boolean } }
    captureSizes = vllmCaptureSizes(vllm)
    if (vllm.roundForV1 === true) captureSizes = mrv1RoundedSizes(captureSizes, vllm.decodeQueryLen ?? 1)
  }
  const config: StepLoopConfig = { ...input.config, graphs: { ...graphs, captureSizes } }
  const host = input.host === 'tick' ? TICK_CARD : typeof input.host === 'object' ? { ...TICK_CARD, maskPerSeqUs: input.host.maskPerSeqUs } : HOST_PRESETS[input.host].card
  const gpu: GpuCard = input.gpu.card === 'tick' ? TICK_CARD : s5Card(input.gpu.row, input.gpu.tp, input.gpu.hostTerm)
  return runStepLoop(runWorkload(root, input.workload), config, host, gpu, { horizonUs: input.horizonUs })
}

function steploopV1Output(run: StepLoopRun, output: SteploopV1Input['output']): unknown {
  if (output === 'full') return run
  const byMode: Record<string, number> = {}
  for (const step of run.steps) byMode[step.mode ?? 'none'] = (byMode[step.mode ?? 'none'] ?? 0) + 1
  return {
    summary: run.summary,
    violations: run.violations,
    steps: run.steps.length,
    stepsByMode: byMode,
    sha256: { lanes: sha256(canonicalJson(run.lanes)), steps: sha256(canonicalJson(run.steps)), reqs: sha256(canonicalJson(run.reqs)) },
  }
}

const steploopV1: VectorModel = {
  model: 'steploop-v1',
  file: `${FIXTURE_DIR}/steploop-v1.json`,
  header:
    'Golden vectors for packages/sim/steploop at v1 (ARCHITECTURE section 5.10; W1-T12): each maps its input, a workload with a configuration that turns on a v1 feature (a runner and graph mode, adapters, the structured-output mask, speculation, or the 70B card with its host term on the CPU lane, D-044, proposed), a host card, a GPU card and a horizon, to the run it gives, with the SHA-256 of that run\'s canonical JSON. A run on the front page\'s tick card is recorded whole. A longer run is recorded as its summary and violations, the count of its steps by graph mode, and the SHA-256 of its lanes, steps and requests. tests/fixtures/sim/steploop.json holds the runs without a v1 field and is not touched by this file. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: (root) => Object.entries(steploopV1Inputs).map(([name, input]) => ({ name, input, run: () => steploopV1Output(runSteploopV1(root, input), input.output) })),
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


// ---------------------------------------------------------------------------------------------------------------------------
// spec

/** A distribution as a fixture writes it: its weights, whose sum is the total. */
type WeightsInput = { readonly weights: readonly number[] }
type BandName = 'spec' | 'sparse' | 'fine'
const BANDS: Readonly<Record<BandName, PairBand>> = { spec: SPEC_BAND, sparse: SPARSE_BAND, fine: FINE_BAND }
type CaseInput = { readonly seed: number; readonly gamma: number; readonly band: BandName }

type SpecInput =
  | { readonly fn: 'verifyChain'; readonly seed: number; readonly p: readonly WeightsInput[]; readonly q: readonly WeightsInput[]; readonly draft: readonly number[] }
  | ({ readonly fn: 'drawCase' } & CaseInput)
  | { readonly fn: 'chiSquare'; readonly counts: readonly number[]; readonly p: WeightsInput }
  | { readonly fn: 'expectedTokensPerRound'; readonly cases: readonly (readonly [number, number])[] }
  | { readonly fn: 'labTest'; readonly member: string; readonly case: CaseInput; readonly seeds: readonly number[]; readonly draws: number }

const w = (...weights: number[]): WeightsInput => ({ weights })

const specInputs: Record<string, SpecInput> = {
  'one draft that p accepts whatever the coin, then the bonus token from the next target': {
    fn: 'verifyChain',
    seed: 1,
    p: [w(32768, 16384, 16384, 0), w(8192, 8192, 16384, 32768)],
    q: [w(16384, 16384, 16384, 16384)],
    draft: [0],
  },
  'one draft that p rules out, so it is rejected whatever the coin, and the residual (p − q)⁺ is all on token 0': {
    fn: 'verifyChain',
    seed: 2,
    p: [w(32768, 16384, 16384, 0), w(8192, 8192, 16384, 32768)],
    q: [w(16384, 16384, 16384, 16384)],
    draft: [3],
  },
  'three drafts: the first accepted, the second rejected by its coin, and the third never visited': {
    fn: 'verifyChain',
    seed: 11,
    p: [w(20480, 20480, 12288, 12288), w(8192, 24576, 8192, 24576), w(16384, 16384, 16384, 16384), w(4096, 4096, 4096, 53248)],
    q: [w(8192, 8192, 24576, 24576), w(24576, 8192, 24576, 8192), w(16384, 16384, 16384, 16384)],
    draft: [0, 2, 1],
  },
  'three drafts that p accepts whatever the coins, then the bonus token': {
    fn: 'verifyChain',
    seed: 4,
    p: [w(32768, 16384, 16384, 0), w(0, 32768, 16384, 16384), w(16384, 16384, 32768, 0), w(0, 0, 0, 65536)],
    q: [w(16384, 16384, 16384, 16384), w(16384, 16384, 16384, 16384), w(16384, 16384, 16384, 16384)],
    draft: [0, 1, 2],
  },
  'an n-gram draft, whose q is one-hot: it is accepted with probability p(x), and a rejection recovers from p without x': {
    fn: 'verifyChain',
    seed: 5,
    p: [w(8192, 16384, 40960, 0), w(16384, 16384, 16384, 16384)],
    q: [w(0, 0, 65536, 0)],
    draft: [2],
  },
  'no drafts: the bonus token alone, drawn from p': {
    fn: 'verifyChain',
    seed: 6,
    p: [w(1024, 2048, 4096, 58368)],
    q: [],
    draft: [],
  },
  'the Verifier\'s band, one draft, seed 1': { fn: 'drawCase', seed: 1, gamma: 1, band: 'spec' },
  'the Verifier\'s band, three drafts, seed 2': { fn: 'drawCase', seed: 2, gamma: 3, band: 'spec' },
  'the sparse band, two drafts, seed 3': { fn: 'drawCase', seed: 3, gamma: 2, band: 'sparse' },
  'the fine band, one draft, seed 4': { fn: 'drawCase', seed: 4, gamma: 1, band: 'fine' },
  'counts 30, 20 and 50 against 25, 25 and 50 expected: a statistic of 2 on 2 degrees of freedom': {
    fn: 'chiSquare',
    counts: [30, 20, 50],
    p: w(16384, 16384, 32768),
  },
  'a token whose expected count is under 5 is pooled, and the pool under 5 joins the smallest token': {
    fn: 'chiSquare',
    counts: [5050, 4940, 10],
    p: w(32768, 32760, 8),
  },
  'a token that p rules out was drawn: the statistic is infinite, which the fixture writes as null': {
    fn: 'chiSquare',
    counts: [4000, 5990, 10],
    p: w(26214, 39322, 0),
  },
  'tokens per round at α = 0, 0.5, 0.65, 0.9 and 1 for draft lengths 0 to 8': {
    fn: 'expectedTokensPerRound',
    cases: [0, 500, 650, 900, 1000].flatMap((alpha) => [0, 1, 2, 4, 8].map((gamma) => [alpha, gamma] as const)),
  },
  ...Object.fromEntries(
    ['reference', ...BESTIARY.map((member) => member.id)].map((member) => [
      `the lab's check on ${member === 'reference' ? 'the exact sampler' : `the "${member}" member`}: two seeds of 20,000 draws, a chain of two drafts, the Verifier's band`,
      { fn: 'labTest', member, case: { seed: 7, gamma: 2, band: 'spec' }, seeds: [101, 102], draws: 20_000 } satisfies SpecInput,
    ]),
  ),
}

/** A fixture holds JSON, which has no Infinity: a statistic that is infinite is written as null. */
const finite = (x: number): number | null => (Number.isFinite(x) ? x : null)

function runSpec(input: SpecInput): unknown {
  switch (input.fn) {
    case 'verifyChain':
      return verifyChain(input.p.map((d) => dist(d.weights)), input.q.map((d) => dist(d.weights)), input.draft, rngFor(input.seed, 'vectors/spec'))
    case 'drawCase':
      return drawCase(input.seed, input.gamma, BANDS[input.band])
    case 'chiSquare': {
      const { stat, df } = chiSquare(input.counts, dist(input.p.weights))
      return { stat: finite(stat), df }
    }
    case 'expectedTokensPerRound':
      return input.cases.map(([alphaPermille, gamma]) => expectedTokensPerRound(alphaPermille, gamma))
    case 'labTest': {
      const { p, q } = drawCase(input.case.seed, input.case.gamma, BANDS[input.case.band])
      const member = [REFERENCE, ...BESTIARY].find((m) => m.id === input.member)
      if (member === undefined) throw new Error(`there is no sampler named "${input.member}"`)
      const result = labTest(input.seeds, p, q, member.verify, '1e-4', input.draws)
      return { rejected: result.rejected, tests: result.tests.map((t) => ({ ...t, stat: finite(t.stat) })) }
    }
  }
}

const spec: VectorModel = {
  model: 'spec',
  file: `${FIXTURE_DIR}/spec.json`,
  header:
    'Golden vectors for packages/sim/spec (ARCHITECTURE section 5.10): each maps its input to what the model gives for it, with the SHA-256 of that output\'s canonical JSON. They pin the exact verifier on hand-made distributions (every draw of its stream: the coin, the residual draw, the bonus draw), the seeded cases of the three bands, the chi-square statistic with its pooling, the acceptance-length model, and the lab\'s check on the exact sampler and on each member of the bestiary. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: () => Object.entries(specInputs).map(([name, input]) => ({ name, input, run: () => runSpec(input) })),
}

// ---------------------------------------------------------------------------------------------------------------------------
// lifecycle

/**
 * A lifecycle vector's input: a scenario of the `map` level, the seed of its synthetic trace and the jitter. `full` records the path (every
 * stage with its places and its citation) and the trace in columns; `digest` records the stage ids, the SHA-256 of the path's canonical JSON
 * (so a moved citation, label or place shows), the counts of its mechanisms, the SHA-256 of the trace's canonical text and the verdicts.
 */
type LifecycleInput = {
  readonly scenario: Scenario
  readonly seed: number
  readonly jitter: LifecycleJitter
  readonly output: 'full' | 'digest'
}

const plain = (engine: Scenario['engine'], o: Partial<Omit<Scenario, 'engine'>> = {}): Scenario => ({ engine, streaming: true, tp: 1, abort: false, prefixHit: false, n: 1, ...o })

const lifecycleInputs: Record<string, LifecycleInput> = {
  'nano-vllm, one rank: the whole path and the whole trace, where the request crosses no process and no thread': {
    scenario: plain('nano-vllm', { streaming: false }),
    seed: 1,
    jitter: CLEAN_LIFECYCLE_JITTER,
    output: 'full',
  },
  'nano-vllm, two ranks, a prefix hit: a worker process for rank 1, a shared-memory broadcast and a gather to rank 0': {
    scenario: plain('nano-vllm', { streaming: false, tp: 2, prefixHit: true }),
    seed: 2,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'Mini-SGLang, one rank, streaming: API server, tokenizer, scheduler, detokenizer, and the overlap loop\'s sync in the next turn': {
    scenario: plain('mini-sglang'),
    seed: 3,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'Mini-SGLang, two ranks, streaming, an abort: rank 0 publishes to rank 1, and the abort goes back through the tokenizer': {
    scenario: plain('mini-sglang', { tp: 2, abort: true }),
    seed: 4,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'Mini-SGLang, one rank, not streaming, a prefix hit': {
    scenario: plain('mini-sglang', { streaming: false, prefixHit: true }),
    seed: 5,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'vLLM at 42172ad, one rank, streaming: a blocking step, a `.tolist()` that waits, no batch queue': {
    scenario: plain('inside-vllm'),
    seed: 6,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'vLLM at 42172ad, two ranks, n = 2, an abort that waits in the input queue behind the step': {
    scenario: plain('inside-vllm', { tp: 2, n: 2, abort: true }),
    seed: 7,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'vLLM v0.33.0, one rank, streaming: the batch queue, a copy on its own stream and an event to wait on': {
    scenario: plain('vllm'),
    seed: 8,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'vLLM v0.33.0, two ranks, a prefix hit, n = 2: workers, shared-memory queues both ways and the output thread of worker 0': {
    scenario: plain('vllm', { tp: 2, prefixHit: true, n: 2 }),
    seed: 9,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'vLLM v0.33.0, one rank, streaming, an abort: its own queue, drained before the step updates the scheduler': {
    scenario: plain('vllm', { abort: true }),
    seed: 10,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'vLLM v0.33.0, one rank, not streaming': {
    scenario: plain('vllm', { streaming: false }),
    seed: 11,
    jitter: CLEAN_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'SGLang v0.5.23, one rank, streaming: the tokenizer manager in the API server process, the overlap loop\'s result queue': {
    scenario: plain('sglang'),
    seed: 12,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'SGLang v0.5.23, two ranks, a prefix hit, n = 2: a broadcast to rank 1, and a warm-up of the shared prefix': {
    scenario: plain('sglang', { tp: 2, prefixHit: true, n: 2 }),
    seed: 13,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'SGLang v0.5.23, one rank, streaming, an abort: the response\'s background task, then the scheduler marks the running request': {
    scenario: plain('sglang', { abort: true }),
    seed: 14,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
  'SGLang v0.5.23, one rank, not streaming, under seed 0 and the widest jitter': {
    scenario: plain('sglang', { streaming: false }),
    seed: 0,
    jitter: { spreadPermille: 900, gapNs: 100_000 },
    output: 'digest',
  },
  'vLLM v0.33.0, two ranks, streaming, under the largest seed': {
    scenario: plain('vllm', { tp: 2 }),
    seed: 0xffffffff,
    jitter: DEFAULT_LIFECYCLE_JITTER,
    output: 'digest',
  },
}

// kv

/** Tokens as a fixture writes them: a list, or inclusive ranges, so that a prompt of 112 tokens is one short line. */
type TokenRanges = readonly number[] | readonly { readonly from: number; readonly to: number }[]

/** An operation as a fixture writes it: the prompt and the appended tokens are `TokenRanges`. */
type KvCaseOp =
  | { readonly op: 'admit'; readonly req: number; readonly prompt: TokenRanges; readonly adapter?: number }
  | { readonly op: 'append'; readonly req: number; readonly tokens: TokenRanges }
  | Exclude<KvOp, { readonly op: 'admit' } | { readonly op: 'append' }>

/**
 * A case of the KV manager as a fixture writes it: a preset with its pool and options, and either the operations or a seeded stream of
 * them (`kvOps`, with adapters of the given ranks). `full` records the replies, the events and the final state; `digest` records the
 * counts of what happened and the SHA-256 of each of those.
 */
type KvInput = {
  readonly preset: KvPresetId
  readonly pool: number
  readonly options?: { readonly prefixCaching?: boolean; readonly adapterSlots?: number }
} & (
  | { readonly ops: readonly KvCaseOp[]; readonly output: 'full' }
  | { readonly stream: { readonly seed: number; readonly ops: number; readonly ranks: readonly number[]; readonly sessions: number; readonly maxRunning: number }; readonly output: 'digest' }
)

const range = (from: number, to: number) => [{ from, to }] as const
const tokensOf = (t: TokenRanges): number[] => (t as readonly (number | { from: number; to: number })[]).flatMap((x) => (typeof x === 'number' ? [x] : Array.from({ length: x.to - x.from + 1 }, (_, i) => x.from + i)))

function kvOpOf(op: KvCaseOp): KvOp {
  if (op.op === 'admit') return op.adapter === undefined ? { op: 'admit', req: op.req, prompt: tokensOf(op.prompt) } : { op: 'admit', req: op.req, prompt: tokensOf(op.prompt), adapter: op.adapter }
  if (op.op === 'append') return { op: 'append', req: op.req, tokens: tokensOf(op.tokens) }
  return op
}

const kvInputs: Record<string, KvInput> = {
  "two-kinds: the design document's request of 112 tokens holds 7 + 2 + 2 = 11 pages, publishes the blocks it filled, and gives its pages back": {
    preset: 'two-kinds',
    pool: 24,
    ops: [
      { op: 'admit', req: 0, prompt: range(1, 112) },
      { op: 'finish', req: 0 },
    ],
    output: 'full',
  },
  'two-kinds: the same 112 tokens and one more hit 112 tokens in every group, and the hit takes the cached pages out of the queue': {
    preset: 'two-kinds',
    pool: 24,
    ops: [
      { op: 'admit', req: 0, prompt: range(1, 112) },
      { op: 'finish', req: 0 },
      { op: 'admit', req: 1, prompt: range(1, 113) },
    ],
    output: 'full',
  },
  'one-group: in a pool of 6 pages the next request evicts the oldest request\'s pages tail first, and each removal is published': {
    preset: 'one-group',
    pool: 6,
    ops: [
      { op: 'admit', req: 0, prompt: range(1, 48) },
      { op: 'finish', req: 0 },
      { op: 'admit', req: 1, prompt: range(101, 148) },
      { op: 'finish', req: 1 },
      { op: 'admit', req: 2, prompt: range(201, 248) },
    ],
    output: 'full',
  },
  'two-kinds: a decode of 40 tokens one at a time after a prompt of 20: the window moves, lets go of blocks and caches the blocks it fills': {
    preset: 'two-kinds',
    pool: 24,
    ops: [{ op: 'admit', req: 0, prompt: range(1, 20) }, ...Array.from({ length: 40 }, (_, i): KvCaseOp => ({ op: 'append', req: 0, tokens: [21 + i] })), { op: 'finish', req: 0 }],
    output: 'full',
  },
  'same-size: a request of 150 tokens holds 10 pages of the full group and 5 of each of the six sliding groups': {
    preset: 'same-size',
    pool: 48,
    ops: [
      { op: 'admit', req: 0, prompt: range(1, 150) },
      { op: 'append', req: 0, tokens: range(151, 170) },
      { op: 'finish', req: 0 },
    ],
    output: 'full',
  },
  'state: a request of 100 tokens keeps 2 blocks in each state group, and a longer one hits at the last edge, 96': {
    preset: 'state',
    pool: 24,
    ops: [
      { op: 'admit', req: 0, prompt: range(1, 100) },
      { op: 'finish', req: 0 },
      { op: 'admit', req: 1, prompt: range(1, 130) },
    ],
    output: 'full',
  },
  'two-kinds with adapters: load, serve, refuse an unload while one runs, unload, reset, and the reset leaves nothing to hit': {
    preset: 'two-kinds',
    pool: 40,
    ops: [
      { op: 'load-adapter', adapter: 0, pages: 4 },
      { op: 'load-adapter', adapter: 1, pages: 7 },
      { op: 'admit', req: 0, prompt: range(1, 40), adapter: 0 },
      { op: 'admit', req: 1, prompt: range(1, 40), adapter: 1 },
      { op: 'admit', req: 2, prompt: range(1, 40) },
      { op: 'unload-adapter', adapter: 0 },
      { op: 'finish', req: 0 },
      { op: 'unload-adapter', adapter: 0 },
      { op: 'finish', req: 1 },
      { op: 'finish', req: 2 },
      { op: 'reset' },
      { op: 'admit', req: 3, prompt: range(1, 40) },
    ],
    output: 'full',
  },
  'two-kinds with 2 adapter slots: a third adapter has no slot until one is unloaded, and no slot takes a page': {
    preset: 'two-kinds',
    pool: 40,
    options: { adapterSlots: 2 },
    ops: [
      { op: 'load-adapter', adapter: 0, pages: 4 },
      { op: 'load-adapter', adapter: 1, pages: 7 },
      { op: 'load-adapter', adapter: 2, pages: 26 },
      { op: 'admit', req: 0, prompt: range(1, 40), adapter: 1 },
      { op: 'unload-adapter', adapter: 0 },
      { op: 'load-adapter', adapter: 2, pages: 26 },
    ],
    output: 'full',
  },
  'one-group without prefix caching: nothing is hashed or published, and the same prompt twice has no hit': {
    preset: 'one-group',
    pool: 6,
    options: { prefixCaching: false },
    ops: [
      { op: 'admit', req: 0, prompt: range(1, 48) },
      { op: 'finish', req: 0 },
      { op: 'admit', req: 1, prompt: range(1, 48) },
    ],
    output: 'full',
  },
  'one-group: a seeded stream of 400 operations in a pool of 48 pages': { preset: 'one-group', pool: 48, stream: { seed: 41, ops: 400, ranks: [], sessions: 6, maxRunning: 4 }, output: 'digest' },
  'two-kinds: a seeded stream of 400 operations with three adapters in a pool of 72 pages': {
    preset: 'two-kinds',
    pool: 72,
    stream: { seed: 42, ops: 400, ranks: [8, 16, 64], sessions: 6, maxRunning: 4 },
    output: 'digest',
  },
  'same-size: a seeded stream of 400 operations with three adapters in a pool of 144 pages': {
    preset: 'same-size',
    pool: 144,
    stream: { seed: 43, ops: 400, ranks: [8, 16, 64], sessions: 8, maxRunning: 5 },
    output: 'digest',
  },
  'state: a seeded stream of 400 operations with three adapters in a pool of 72 pages': {
    preset: 'state',
    pool: 72,
    stream: { seed: 44, ops: 400, ranks: [8, 16, 64], sessions: 4, maxRunning: 3 },
    output: 'digest',
  },
  'two-kinds with 2 adapter slots: a seeded stream of 400 operations': {
    preset: 'two-kinds',
    pool: 96,
    options: { adapterSlots: 2 },
    stream: { seed: 45, ops: 400, ranks: [8, 16, 64], sessions: 6, maxRunning: 4 },
    output: 'digest',
  },
  'two-kinds without prefix caching: a seeded stream of 400 operations': {
    preset: 'two-kinds',
    pool: 96,
    options: { prefixCaching: false },
    stream: { seed: 46, ops: 400, ranks: [], sessions: 6, maxRunning: 4 },
    output: 'digest',
  },
}

function lifecycleOutput(input: LifecycleInput): unknown {
  const path = referencePath(input.scenario)
  const trace = lifecycleTrace(input.scenario, input.seed, input.jitter)
  const checks = traceChecks(trace)
  const facts = pathFacts(path)
  if (input.output === 'full') return { path, facts, trace: traceToJson(trace), checks }
  return {
    ids: path.map((stage) => stage.id),
    pathSha256: sha256(canonicalJson(path)),
    facts,
    counts: { spans: trace.spans.track.length, tracks: trace.tracks.length, flows: trace.flows.length, marks: trace.marks.length },
    traceSha256: sha256(encodeTrace(trace)),
    checks: checks.map(({ id, pass, checked }) => ({ id, pass, checked })),
  }
}

const lifecycle: VectorModel = {
  model: 'lifecycle',
  file: `${FIXTURE_DIR}/lifecycle.json`,
  header:
    'Golden vectors for packages/sim/lifecycle (ARCHITECTURE section 5.8, 5.10): each maps its input, a scenario of the Engine Floor\'s map level with the seed and the jitter of its synthetic trace, to the request\'s path and the trace it gives, with the SHA-256 of that output\'s canonical JSON. The path is every stage with its places, mechanism and citation (file, symbol, line and quote at the engine\'s pinned commit). A short path is recorded whole, with the trace in columns and the verdict of every check; a longer one as its stage ids, the SHA-256 of the whole path, its counts, the SHA-256 of the trace\'s canonical text and the verdicts. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: () => Object.entries(lifecycleInputs).map(([name, input]) => ({ name, input, run: () => lifecycleOutput(input) })),
}


function kvOutput(input: KvInput): unknown {
  const spec = kvPreset(input.preset, input.pool, input.options ?? {})
  const m = kvReference(spec)
  const ops: readonly KvOp[] =
    'ops' in input
      ? input.ops.map(kvOpOf)
      : kvOps(input.stream.seed, spec, input.stream.ops, {
          adapters: kvAdapterCatalog(spec, input.stream.ranks).map((a) => ({ id: a.id, pages: a.pages })),
          sessions: input.stream.sessions,
          maxRunning: input.stream.maxRunning,
        })
  const results: KvResult[] = ops.map((op) => m.apply(op))
  const events = m.events()
  const state = m.state()
  if (input.output === 'full') return { results, events, state }
  const refused: Record<string, number> = {}
  let hits = 0
  let hitTokens = 0
  let admitted = 0
  results.forEach((r, i) => {
    const op = ops[i]
    if (!r.ok) refused[`${op.op}:${r.reason}`] = (refused[`${op.op}:${r.reason}`] ?? 0) + 1
    else if (op.op === 'admit') {
      admitted++
      if ((r.hit ?? 0) > 0) hits++
      hitTokens += r.hit ?? 0
    }
  })
  let stored = 0
  let removed = 0
  let cleared = 0
  for (const [, batch] of events) {
    for (const e of batch) {
      if (e.type === 'BlockStored') stored += e.block_hashes.length
      else if (e.type === 'BlockRemoved') removed += e.block_hashes.length
      else cleared++
    }
  }
  return {
    counts: { ops: ops.length, admitted, hits, hitTokens, stored, removed, cleared, refused, free: state.queue.length, running: state.requests.length, cached: state.cache.length },
    ops: { sha256: sha256(canonicalJson(ops)) },
    results: { count: results.length, sha256: sha256(canonicalJson(results)) },
    events: { batches: events.length, sha256: sha256(canonicalJson(events)) },
    state: { sha256: sha256(canonicalJson(state)) },
  }
}

const kv: VectorModel = {
  model: 'kv',
  file: `${FIXTURE_DIR}/kv.json`,
  header:
    "Golden vectors for packages/sim/kv (ARCHITECTURE section 5.4 and 5.10): each maps its input, a preset with its pool and options and either the operations a manager is given or a seeded stream of them, to the manager's replies, the events it published and the state it ended in. A short case is recorded whole. A seeded stream is recorded as the counts of what happened and the SHA-256 of its operations, its replies, its events and its final state. Tokens in an input are inclusive ranges. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.",
  cases: () => Object.entries(kvInputs).map(([name, input]) => ({ name, input, run: () => kvOutput(input) })),
}

// ---------------------------------------------------------------------------------------------------------------------------
// broken-bench

/** A case of the broken-benchmark corpus as a fixture writes it: the seed, and the flaw when it is asked for by name rather than drawn. */
type BrokenInput = { readonly seed: number; readonly flaw?: BenchFlaw }

/** Seeds 0 to 21: every flaw twice, the second time on the next eleven seeds, whose answers and logs differ. */
const brokenInputs: Record<string, BrokenInput> = Object.fromEntries(Array.from({ length: 22 }, (_, seed) => [`seed ${seed} draws ${brokenFlawOf(seed)}`, { seed }]))

/** A case as its vector records it: everything the learner sees and the answer, with the log and the trace as a count and a SHA-256 of their canonical JSON. */
function brokenOutput(input: BrokenInput): unknown {
  const c = brokenBenchCase(input.seed, input.flaw === undefined ? {} : { flaw: input.flaw })
  const { setup, server } = c.scene
  const lengths = setup.lengths
  const digest = (value: unknown, count: number) => ({ count, sha256: sha256(canonicalJson(value)) })
  return {
    flaw: c.flaw,
    attempts: c.attempts,
    band: c.band,
    claimIds: c.claimIds,
    claim: c.scene.claim,
    answer: c.answer,
    // The 95% bootstrap interval on the corrected p99 (B = 1,000): what a learner's own interval is judged against.
    interval: correctedInterval(c.scene, c.flaw),
    runSeed: c.scene.runSeed,
    capacityPerSMilli: c.scene.capacityPerSMilli,
    setup: { ...setup, ...(lengths !== undefined && lengths.kind === 'rows' ? { lengths: { kind: 'rows', slice: { id: lengths.slice.id, requests: digest(lengths.slice.requests, lengths.slice.requests.length) } } } : {}) },
    server: {
      maxNumSeqs: server.maxNumSeqs,
      maxBatchedTokens: server.maxBatchedTokens,
      chunkedPrefill: server.chunkedPrefill,
      gpu: server.gpu.label,
      ...(server.stalls === undefined ? {} : { stalls: server.stalls }),
      ...(server.cold === undefined ? {} : { cold: server.cold }),
    },
    rows: digest(c.scene.rows, c.scene.rows.length),
  }
}

const brokenBench: VectorModel = {
  model: 'broken-bench',
  file: `${FIXTURE_DIR}/broken-bench.json`,
  header:
    'Golden vectors for the broken-benchmark corpus of packages/sim/bench (ARCHITECTURE section 5.6, GAMES section 11): each maps a seed to the case it draws: the flaw, the band, the claim, the corrected answer and the interval on it, the harness\'s setup and the server, and the client\'s log as a count and the SHA-256 of its canonical JSON. Every flaw and the control appear twice, on seeds 0 to 21. Regenerate only with `bun scripts/vectors.ts --write`, and review the diff like code.',
  cases: () => Object.entries(brokenInputs).map(([name, input]) => ({ name, input, run: () => brokenOutput(input) })),
}

export const MODELS: readonly VectorModel[] = [workload, steploop, steploopV1, trace, bench, spec, lifecycle, kv, brokenBench]

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
  for (const problem of [checkTable(root), checkCritical(root)]) if (problem) problems.push(problem)
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
  console.log(`vectors: ${MODELS.length} model(s), ${count} vector(s) and the generated tables match what the code writes`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
