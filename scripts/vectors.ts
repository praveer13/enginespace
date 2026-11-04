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
 * output. `workload` (W0-T12) and `steploop` (W0-T13) were added this way.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalJson } from '../packages/sim/core/json'
import { HOST_PRESETS } from '../packages/sim/host'
import type { RunnerPresetId } from '../packages/sim/host'
import type { PhysicsRowKey } from '../packages/sim/physics'
import { TICK_CARD, defaultCaptureSizes, runStepLoop, s5Card } from '../packages/sim/steploop'
import type { GpuCard, S5HostTerm, StepLoopConfig, StepLoopRun } from '../packages/sim/steploop'
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

export const MODELS: readonly VectorModel[] = [workload, steploop]

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
