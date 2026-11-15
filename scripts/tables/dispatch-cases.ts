/**
 * dispatch-cases: the cases of W1-T12's dispatcher golden tables, and the check that the model agrees with them (GAMES.md §3,
 * "Invariants the tests check"; TRACKER W1-T12 check 4; DECISIONS Q-10).
 *
 * The tables answer one question: for the pinned vLLM, which CUDA graph does a batch dispatch to? The answer is code, not data, so a table
 * can only come from running the code. scripts/tables/vllm-dispatch.py runs the pinned vLLM's MRV2 dispatcher
 * (vllm/v1/worker/gpu/cudagraph_utils.py) and MRV1's (vllm/v1/cudagraph_dispatcher.py) on the cases below, and writes the results. This
 * file is the other half: it draws the cases, deterministically, and it checks the model's `dispatchV2` and `dispatchV1` against a
 * table's results, case by case.
 *
 *   bun scripts/tables/dispatch-cases.ts --write <file>   write the cases (the input of vllm-dispatch.py)
 *   bun scripts/tables/dispatch-cases.ts --check [dir]    check the tables in dir (default tests/fixtures/dispatch) against the model
 *   bun scripts/tables/dispatch-cases.ts --status         say whether the tables exist, and exit 0 either way
 *
 * `--check` exits 0 when the tables agree, 1 when they do not, and 3 when there are no tables (they have not been generated yet).
 *
 * What a table file holds (`tests/fixtures/dispatch/v0.33.0.json`, with its SHA-256 in `v0.33.0.json.sha256`):
 *   - `meta`: the pin, who ran the script, on what host, when, with which Python and torch, and the SHA-256 of the cases (canonical JSON)
 *     that the results answer, so a table cannot be paired with other cases;
 *   - `results`: one row for each case, in the order of the cases, and one list of adjusted capture sizes for each MRV1 config.
 * A row of MRV2 is [mode, tokens, reqs, uniform tokens, max query length, adapters, microbatches] and a row of MRV1 is [mode, tokens,
 * reqs, uniform, has_lora, adapters], with the mode as vLLM's CUDAGraphMode value (0 NONE, 1 PIECEWISE, 2 FULL) and the booleans as 0 and 1.
 *
 * The cases are drawn from a seeded stream, and every row of the draw is a possible argument of the dispatcher, whether or not the
 * engine would make it: the table is a check of the code's function and not of the engine's habits. What the cases cover:
 *   - the engine's own configurations: the 4090's and the H100's defaults and the harness S5 was fitted on, with vLLM's capture sizes,
 *     in every mode, plain, with 1 + k speculative tokens, and with adapters under every setting of the two LoRA switches;
 *   - learner-style configurations: random lists of capture sizes, caps and modes;
 *   - for each configuration, the token counts around its capture sizes (one below, on, and one above), the ends of its list and beyond
 *     it, and random ones, each as a uniform decode, as a batch with a prefill, and as odd mixes, with adapter counts from 0 to one
 *     above the cap and beyond.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalJson } from '../../packages/sim/core/json'
import { below, between, pick, rngFor, shuffle, weighted } from '../../packages/sim/core'
import type { Rng } from '../../packages/sim/core'
import {
  GRAPH_MODES,
  dispatchV1,
  dispatchV2,
  makeGraphConfig,
  mrv1RoundedSizes,
  resolveGraphs,
  vllmCaptureSizes,
} from '../../packages/sim/steploop'
import type { BackendSupport, GraphConfig, GraphModeId } from '../../packages/sim/steploop'

const repoRoot = path.resolve(import.meta.dirname, '../..')

/** The directory of the committed tables, and the files in it. */
export const TABLE_DIR = 'tests/fixtures/dispatch'
export const TABLE_FILE = 'v0.33.0.json'

/** What the tables are made at. The tag is course.lock.json's `vllm` entry (D-035, proposed until the owner confirms it with O-4). */
export const PIN = { version: '0.33.0', tag: 'v0.33.0', commit: '4ba787ec9959e566d3b587a796dff07673324da5' } as const

/** The seed of the draw: the day the draw was fixed. */
export const CASES_SEED = 20261104

export const CASES_SCHEMA = 'enginespace/dispatch-cases@1'
export const TABLE_SCHEMA = 'enginespace/dispatch-table@1'

/** At least this many cases for each dispatcher (GAMES.md §3, TRACKER W1-T12 check 4). */
export const MIN_CASES = 5000

export interface LoraCase {
  readonly maxLoras: number
  readonly specializeLora: boolean
  readonly specializeActiveLora: boolean
}

/** The configuration a case is dispatched under: what both dispatchers read of the engine's config. */
export interface ConfigCase {
  readonly mode: GraphModeId
  /** The capture sizes the config lists, ascending and distinct. MRV1 first adjusts them for speculation (vLLM does, and the table says to what). */
  readonly sizes: readonly number[]
  readonly maxNumSeqs: number
  readonly decodeQueryLen: number
  readonly lora: LoraCase | null
}

/** [config, requests, tokens, uniform token count, active adapters, max query length]. */
export type CaseV2 = readonly [number, number, number, number | null, number, number | null]
/** [config, tokens, uniform decode (0 or 1), has_lora (0 or 1), active adapters]. */
export type CaseV1 = readonly [number, number, 0 | 1, 0 | 1, number]

export interface SizesCase {
  readonly maxNumSeqs: number
  readonly maxBatchedTokens: number
  readonly decodeQueryLen: number
  readonly blackwell: boolean
}

export interface ModesCase {
  readonly requested: GraphModeId
  readonly support: BackendSupport
  readonly decodeQueryLen: number
  readonly attentionPiecewise: boolean
  readonly runner: 'mrv2' | 'v1'
  readonly sizes: readonly number[]
}

export interface DispatchCases {
  readonly schema: typeof CASES_SCHEMA
  readonly pin: typeof PIN
  readonly seed: number
  readonly v2: { readonly configs: readonly ConfigCase[]; readonly cases: readonly CaseV2[] }
  readonly v1: { readonly configs: readonly ConfigCase[]; readonly cases: readonly CaseV1[] }
  readonly sizes: readonly SizesCase[]
  readonly modes: readonly ModesCase[]
}

// ---------------------------------------------------------------------------------------------------------------------------
// The configurations

const PLAIN_MODES: readonly GraphModeId[] = ['PIECEWISE', 'FULL', 'FULL_DECODE_ONLY', 'FULL_AND_PIECEWISE']
const ALL_MODES: readonly GraphModeId[] = ['NONE', ...PLAIN_MODES]

/** The engine's defaults on the 4090's tier and on the H100's, and the harness S5 was fitted on (claims vllm.batch-defaults.*, WORLD §4.2). */
const ENGINES = [
  { maxNumSeqs: 256, maxBatchedTokens: 2048 },
  { maxNumSeqs: 1024, maxBatchedTokens: 8192 },
  { maxNumSeqs: 64, maxBatchedTokens: 8192 },
] as const

function engineConfig(engine: (typeof ENGINES)[number], mode: GraphModeId, decodeQueryLen: number, lora: LoraCase | null): ConfigCase {
  return { mode, sizes: vllmCaptureSizes({ ...engine, decodeQueryLen }), maxNumSeqs: engine.maxNumSeqs, decodeQueryLen, lora }
}

/** A random ascending list of distinct sizes, as a learner would pick them. */
function randomSizes(rng: Rng): number[] {
  const count = between(rng, 2, 12)
  const top = pick(rng, [16, 40, 64, 160])
  const all = Array.from({ length: top }, (_, i) => i + 1)
  return shuffle(rng, all)
    .slice(0, count)
    .sort((a, b) => a - b)
}

function configs(): ConfigCase[] {
  const rng = rngFor(CASES_SEED, 'dispatch/configs')
  const out: ConfigCase[] = []
  // The engine's own configurations, in every mode.
  for (const engine of ENGINES) for (const mode of PLAIN_MODES) out.push(engineConfig(engine, mode, 1, null))
  // With speculation: 1 + k tokens a decode row.
  for (const queryLen of [2, 4]) for (const mode of PLAIN_MODES) out.push(engineConfig(ENGINES[0], mode, queryLen, null))
  // With adapters, under every setting of the two switches.
  const switches: readonly [boolean, boolean][] = [
    [true, false],
    [true, true],
    [false, false],
    [false, true],
  ]
  for (const maxLoras of [1, 3, 4, 8]) {
    for (const [specializeLora, specializeActiveLora] of switches) out.push(engineConfig(ENGINES[0], 'FULL_AND_PIECEWISE', 1, { maxLoras, specializeLora, specializeActiveLora }))
  }
  for (const mode of ['PIECEWISE', 'FULL'] as const) {
    for (const [specializeLora, specializeActiveLora] of switches) out.push(engineConfig(ENGINES[0], mode, 1, { maxLoras: 4, specializeLora, specializeActiveLora }))
  }
  // Learner-style configurations.
  while (out.length < 62) {
    const sizes = randomSizes(rng)
    const decodeQueryLen = pick(rng, [1, 1, 1, 2, 3])
    // A config whose speculative rounding leaves no size is refused by vLLM, and is not a case.
    if (decodeQueryLen > sizes[sizes.length - 1]) continue
    const maxLoras = between(rng, 1, 6)
    out.push({
      mode: pick(rng, PLAIN_MODES),
      sizes,
      maxNumSeqs: between(rng, 1, 160),
      decodeQueryLen,
      lora: below(rng, 2) === 0 ? null : { maxLoras, specializeLora: below(rng, 4) !== 0, specializeActiveLora: below(rng, 2) === 0 },
    })
  }
  // Graphs off: nothing is captured, whatever the sizes say.
  out.push(engineConfig(ENGINES[0], 'NONE', 1, null))
  out.push({ mode: 'NONE', sizes: [1, 2, 4], maxNumSeqs: 8, decodeQueryLen: 1, lora: { maxLoras: 2, specializeLora: true, specializeActiveLora: true } })
  return out
}

/** The configuration as MRV1 receives it: with full decode graphs and a decode query length above 1 it first rounds the sizes up (claim vllm.cudagraph.mrv1-sizes-multiple). */
export function sizesForV1(config: ConfigCase): number[] {
  return GRAPH_MODES[config.mode].decode === 'FULL' && config.decodeQueryLen > 1 ? mrv1RoundedSizes(config.sizes, config.decodeQueryLen) : [...config.sizes]
}

/** The `GraphConfig` that a runner's dispatcher reads for a case's configuration. `v1Sizes`, when given, are the sizes vLLM adjusted. */
export function graphConfigFor(config: ConfigCase, runner: 'mrv2' | 'v1', v1Sizes?: readonly number[]): GraphConfig {
  return makeGraphConfig({
    mode: config.mode,
    captureSizes: runner === 'v1' ? (v1Sizes ?? sizesForV1(config)) : config.sizes,
    maxNumSeqs: config.maxNumSeqs,
    decodeQueryLen: config.decodeQueryLen,
    lora: config.lora,
  })
}

// ---------------------------------------------------------------------------------------------------------------------------
// The probes

const PROBES_PER_CONFIG = 100
const TOKEN_VALUES_PER_CONFIG = 50

/** 50 distinct token counts for a config: around its sizes, at the ends of its list and beyond, and random. */
function tokenCounts(rng: Rng, sizes: readonly number[]): number[] {
  const last = sizes.length > 0 ? sizes[sizes.length - 1] : 8
  const chosen = sizes.length <= 8 ? [...sizes] : [sizes[0], last, ...shuffle(rng, sizes.slice(1, -1)).slice(0, 6)]
  const seen = new Set<number>()
  const out: number[] = []
  const add = (n: number): void => {
    if (n >= 1 && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  for (const size of chosen) for (const delta of [-1, 0, 1]) add(size + delta)
  for (const n of [1, 2, last, last + 1, 2 * last + 1]) add(n)
  // The random ones come from a range wide enough to hold 50 distinct counts, whatever the sizes are.
  const widest = Math.max(70, 2 * last + 4)
  while (out.length < TOKEN_VALUES_PER_CONFIG) add(between(rng, 1, widest))
  return out.slice(0, TOKEN_VALUES_PER_CONFIG)
}

/** An adapter count to probe: mostly none or the cap, and sometimes in between or beyond. */
function adapterCount(rng: Rng, lora: LoraCase | null): number {
  if (lora === null) return weighted(rng, [8, 2]) === 0 ? 0 : 1
  switch (weighted(rng, [4, 3, 3, 2, 1])) {
    case 0:
      return 0
    case 1:
      return lora.maxLoras
    case 2:
      return between(rng, 1, lora.maxLoras)
    case 3:
      return lora.maxLoras + 1
    default:
      return lora.maxLoras + 2
  }
}

function probesV2(rng: Rng, index: number, config: ConfigCase): CaseV2[] {
  const out: CaseV2[] = []
  const q = config.decodeQueryLen
  for (const tokens of tokenCounts(rng, config.sizes)) {
    for (let draw = 0; draw < PROBES_PER_CONFIG / TOKEN_VALUES_PER_CONFIG; draw++) {
      const reqsMax = Math.max(1, Math.min(tokens, config.maxNumSeqs))
      const loras = adapterCount(rng, config.lora)
      switch (weighted(rng, [45, 30, 10, 10, 5])) {
        case 0: {
          // A uniform decode: every request has the engine's query length.
          const reqs = Math.max(1, Math.floor(tokens / q))
          out.push([index, reqs, tokens, q, loras, q])
          break
        }
        case 1:
          // A batch with a prefill: no uniform length, and no bound on the query length.
          out.push([index, between(rng, 1, reqsMax), tokens, null, loras, null])
          break
        case 2:
          // Decodes of unequal lengths: a bound, and no uniform length.
          out.push([index, between(rng, 1, reqsMax), tokens, null, loras, between(rng, 1, q + 2)])
          break
        case 3: {
          // A uniform decode at a length the engine does not use.
          const length = pick(rng, [1, 2, 3, q + 1])
          out.push([index, Math.max(1, Math.floor(tokens / length)), tokens, length, loras, length])
          break
        }
        default:
          // More requests than the engine runs, or than there are tokens.
          out.push([index, config.maxNumSeqs + between(rng, 1, 3), tokens, null, loras, null])
          break
      }
    }
  }
  return out
}

function probesV1(rng: Rng, index: number, config: ConfigCase, sizes: readonly number[]): CaseV1[] {
  const out: CaseV1[] = []
  for (const tokens of tokenCounts(rng, sizes)) {
    for (let draw = 0; draw < PROBES_PER_CONFIG / TOKEN_VALUES_PER_CONFIG; draw++) {
      // MRV1 asserts that a LoRA config exists when has_lora is set, and an engine without adapters never sets it.
      const loras = config.lora === null ? 0 : adapterCount(rng, config.lora)
      out.push([index, tokens, below(rng, 2) === 0 ? 0 : 1, loras > 0 ? 1 : 0, loras])
    }
  }
  return out
}

function sizesCases(): SizesCase[] {
  const out: SizesCase[] = []
  for (const maxNumSeqs of [1, 8, 33, 64, 100, 256, 512, 1024]) {
    for (const maxBatchedTokens of [16, 300, 2048, 8192]) {
      for (const decodeQueryLen of [1, 3]) out.push({ maxNumSeqs, maxBatchedTokens, decodeQueryLen, blackwell: false })
    }
  }
  out.push({ maxNumSeqs: 256, maxBatchedTokens: 2048, decodeQueryLen: 1, blackwell: true })
  out.push({ maxNumSeqs: 1024, maxBatchedTokens: 8192, decodeQueryLen: 1, blackwell: true })
  out.push({ maxNumSeqs: 1024, maxBatchedTokens: 16384, decodeQueryLen: 1, blackwell: true })
  out.push({ maxNumSeqs: 512, maxBatchedTokens: 8192, decodeQueryLen: 3, blackwell: true })
  return out
}

/** The sizes every mode case lists: 1, 2, 4 and 8 to 64 in steps of 8. */
const MODE_SIZES: readonly number[] = [1, 2, 4, 8, 16, 24, 32, 40, 48, 56, 64]

function modesCases(): ModesCase[] {
  const out: ModesCase[] = []
  for (const requested of ALL_MODES) {
    for (const support of ['ALWAYS', 'UNIFORM_BATCH', 'UNIFORM_SINGLE_TOKEN_DECODE', 'NEVER'] as const) {
      for (const attentionPiecewise of [true, false]) {
        for (const decodeQueryLen of [1, 3]) {
          for (const runner of ['mrv2', 'v1'] as const) out.push({ requested, support, decodeQueryLen, attentionPiecewise, runner, sizes: MODE_SIZES })
        }
      }
    }
  }
  return out
}

/** The cases, drawn from `CASES_SEED`: the same bytes in every runtime. */
export function buildCases(): DispatchCases {
  const all = configs()
  const v2Cases: CaseV2[] = []
  const v1Cases: CaseV1[] = []
  all.forEach((config, index) => {
    v2Cases.push(...probesV2(rngFor(CASES_SEED, `dispatch/v2/${index}`), index, config))
    v1Cases.push(...probesV1(rngFor(CASES_SEED, `dispatch/v1/${index}`), index, config, sizesForV1(config)))
  })
  if (v2Cases.length < MIN_CASES || v1Cases.length < MIN_CASES) throw new Error(`the draw has ${v2Cases.length} MRV2 cases and ${v1Cases.length} MRV1 cases, and the task asks for ${MIN_CASES} of each`)
  return { schema: CASES_SCHEMA, pin: PIN, seed: CASES_SEED, v2: { configs: all, cases: v2Cases }, v1: { configs: all, cases: v1Cases }, sizes: sizesCases(), modes: modesCases() }
}

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

/** The cases as the bytes the script writes, and the hash a table must name. */
export function renderCases(cases: DispatchCases): string {
  return `${canonicalJson(cases)}\n`
}
export const casesSha256 = (cases: DispatchCases): string => sha256(canonicalJson(cases))

// ---------------------------------------------------------------------------------------------------------------------------
// What the model answers

/** A row of MRV2's table: [mode, tokens, reqs, uniform tokens, max query length, adapters, microbatches]. */
export type RowV2 = readonly [number, number, number | null, number | null, number | null, number, number]
/** A row of MRV1's table: [mode, tokens, reqs, uniform, has_lora, adapters]. */
export type RowV1 = readonly [number, number, number | null, 0 | 1, 0 | 1, number]
/** A mode case's row: the mode that runs and the sizes that stay, or the word `error` where vLLM raises. */
export type RowModes = { readonly mode: GraphModeId; readonly sizes: readonly number[] } | 'error'

export const MODE_VALUE = { NONE: 0, PIECEWISE: 1, FULL: 2 } as const

export interface Results {
  readonly v2: readonly RowV2[]
  readonly v1: readonly RowV1[]
  /** The sizes MRV1 leaves each config after its speculative adjustment. */
  readonly v1Sizes: readonly (readonly number[])[]
  readonly sizes: readonly (readonly number[])[]
  readonly modes: readonly RowModes[]
}

/** What the model's `dispatchV2`, `dispatchV1`, `vllmCaptureSizes` and `resolveGraphs` answer for every case. */
export function modelResults(cases: DispatchCases, v1Sizes?: readonly (readonly number[])[]): Results {
  const v2Configs = cases.v2.configs.map((config) => graphConfigFor(config, 'mrv2'))
  const v1Own = cases.v1.configs.map(sizesForV1)
  const v1Configs = cases.v1.configs.map((config, i) => graphConfigFor(config, 'v1', v1Sizes?.[i] ?? v1Own[i]))
  return {
    v2: cases.v2.cases.map(([config, reqs, tokens, uniform, loras, maxQuery]) => {
      const d = dispatchV2(v2Configs[config], reqs, tokens, uniform, loras, maxQuery)
      return [MODE_VALUE[d.cgMode], d.numTokens, d.numReqs, d.uniformTokenCount, d.maxQueryLen, d.numActiveLoras, d.numUbatches] as const
    }),
    v1: cases.v1.cases.map(([config, tokens, uniformDecode, hasLora, loras]) => {
      const d = dispatchV1(v1Configs[config], tokens, uniformDecode === 1, hasLora === 1, loras)
      return [MODE_VALUE[d.mode], d.desc.numTokens, d.desc.numReqs, d.desc.uniform ? 1 : 0, d.desc.hasLora ? 1 : 0, d.desc.numActiveLoras] as const
    }),
    v1Sizes: v1Own,
    sizes: cases.sizes.map((c) => vllmCaptureSizes(c)),
    modes: cases.modes.map((c) => {
      try {
        const r = resolveGraphs({ requested: c.requested, support: c.support, runner: c.runner, captureSizes: c.sizes, decodeQueryLen: c.decodeQueryLen, attentionPiecewise: c.attentionPiecewise })
        return { mode: r.mode, sizes: r.captureSizes }
      } catch {
        return 'error' as const
      }
    }),
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// The tables

export interface TableMeta {
  readonly schema: typeof TABLE_SCHEMA
  /** The pin a table was made at, as its file says. `checkTable` compares it with `PIN`, so the type does not hold it to `PIN`'s own strings. */
  readonly pin: Readonly<Record<keyof typeof PIN, string>>
  /** SHA-256 of `canonicalJson(cases)`: the cases that `results` answers. */
  readonly casesSha256: string
  /** The sentence the task asks for, with the date and who ran it. */
  readonly provenance: string
  readonly generatedAt: string
  readonly host: Readonly<Record<string, string>>
  readonly script: { readonly path: string; readonly sha256: string }
  /** SHA-256 of each vLLM file whose code the run executed, so that a reader can compare it with the tag. */
  readonly sources?: Readonly<Record<string, string>>
  /** The tarball the source came from, if the script was given it: the commit in its header, and its SHA-256. */
  readonly tarball?: { readonly commit: string; readonly sha256: string }
  /** Counts of cases that the script answered. */
  readonly counts: { readonly v2: number; readonly v1: number; readonly sizes: number; readonly modes: number }
  /** A section of the script that did not run to its end, one line each. A table with any is not a table. */
  readonly failed?: readonly string[]
}

export interface Table {
  readonly meta: TableMeta
  readonly results: Results
}

export interface Verdict {
  readonly ok: boolean
  /** One line for each thing that is wrong, at most `LIMIT` for each kind of table. */
  readonly problems: readonly string[]
  readonly checked: { readonly v2: number; readonly v1: number; readonly v1Sizes: number; readonly sizes: number; readonly modes: number }
}

const LIMIT = 8
const same = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b)

/**
 * Checks `table` against the model: the table must answer the cases that `cases` holds (by hash and by length), and every row must
 * be the row that the model gives. A table row is vLLM's answer, so a row that differs is a rule that the model has wrong.
 */
export function checkTable(cases: DispatchCases, table: Table): Verdict {
  const problems: string[] = []
  const { meta, results } = table
  if (meta.schema !== TABLE_SCHEMA) problems.push(`the table's schema is ${String(meta.schema)}, not ${TABLE_SCHEMA}`)
  if (!same(meta.pin, PIN)) problems.push(`the table is for ${canonicalJson(meta.pin)}, not for ${canonicalJson(PIN)}`)
  if (meta.casesSha256 !== casesSha256(cases)) problems.push('the table answers other cases than the ones the script draws now (its casesSha256 differs)')
  for (const line of meta.failed ?? []) problems.push(`the script did not finish a section: ${line}`)
  if (meta.tarball !== undefined && meta.tarball.commit !== PIN.commit) problems.push(`the tarball was made at commit ${meta.tarball.commit}, and the pin is ${PIN.commit}`)
  const lengths: [string, number, number][] = [
    ['v2', results.v2.length, cases.v2.cases.length],
    ['v1', results.v1.length, cases.v1.cases.length],
    ['v1Sizes', results.v1Sizes.length, cases.v1.configs.length],
    ['sizes', results.sizes.length, cases.sizes.length],
    ['modes', results.modes.length, cases.modes.length],
  ]
  for (const [name, have, want] of lengths) if (have !== want) problems.push(`${name} has ${have} rows for ${want} cases`)
  if (problems.length > 0) return { ok: false, problems, checked: { v2: 0, v1: 0, v1Sizes: 0, sizes: 0, modes: 0 } }

  // MRV1 first: the sizes vLLM left each config are what its dispatch cases ran under.
  const model = modelResults(cases, results.v1Sizes)
  const compare = (name: string, mine: readonly unknown[], theirs: readonly unknown[], describe: (i: number) => string): void => {
    let wrong = 0
    mine.forEach((row, i) => {
      if (same(row, theirs[i])) return
      if (wrong++ < LIMIT) problems.push(`${name} ${describe(i)}: vLLM gives ${canonicalJson(theirs[i])}, the model gives ${canonicalJson(row)}`)
    })
    if (wrong > LIMIT) problems.push(`${name}: ${wrong - LIMIT} more rows differ`)
  }
  compare('v1Sizes', model.v1Sizes, results.v1Sizes, (i) => `config ${i} (${canonicalJson(cases.v1.configs[i])})`)
  compare('v2', model.v2, results.v2, (i) => `case ${i} ${canonicalJson(cases.v2.cases[i])} under ${canonicalJson(cases.v2.configs[cases.v2.cases[i][0]])}`)
  compare('v1', model.v1, results.v1, (i) => `case ${i} ${canonicalJson(cases.v1.cases[i])} under ${canonicalJson(cases.v1.configs[cases.v1.cases[i][0]])}`)
  compare('sizes', model.sizes, results.sizes, (i) => `case ${i} ${canonicalJson(cases.sizes[i])}`)
  compare('modes', model.modes, results.modes, (i) => `case ${i} ${canonicalJson(cases.modes[i])}`)
  return { ok: problems.length === 0, problems, checked: { v2: results.v2.length, v1: results.v1.length, v1Sizes: results.v1Sizes.length, sizes: results.sizes.length, modes: results.modes.length } }
}

/** Reads the tables in `dir` (relative to `root`): null when there is no table file, else the table and whether its SHA-256 file matches. */
export function readTable(root: string, dir: string = TABLE_DIR): { table: Table; text: string; hashOk: boolean; hashFile: string } | null {
  const file = path.resolve(root, dir, TABLE_FILE)
  if (!existsSync(file)) return null
  const text = readFileSync(file, 'utf8')
  const hashPath = `${file}.sha256`
  const hashFile = existsSync(hashPath) ? readFileSync(hashPath, 'utf8').trim().split(/\s+/)[0] : ''
  return { table: JSON.parse(text) as Table, text, hashOk: hashFile === sha256(text), hashFile }
}

/** The state of the tables: `waiting` until the script has been run at the pin and the tables are committed, `present` after (W1-T13's `keys` level waits for it). */
export function tablesStatus(root: string = repoRoot, dir: string = TABLE_DIR): 'waiting' | 'present' {
  return readTable(root, dir) === null ? 'waiting' : 'present'
}

// ---------------------------------------------------------------------------------------------------------------------------
// The command line

function main(argv: readonly string[]): number {
  const [command, arg] = argv
  if (command === '--write') {
    if (arg === undefined) {
      console.error('usage: bun scripts/tables/dispatch-cases.ts --write <file>')
      return 2
    }
    const cases = buildCases()
    writeFileSync(arg, renderCases(cases))
    console.log(`wrote ${cases.v2.cases.length} MRV2 cases, ${cases.v1.cases.length} MRV1 cases, ${cases.sizes.length} size cases and ${cases.modes.length} mode cases to ${arg}`)
    console.log(`SHA-256 of the cases (canonical JSON): ${casesSha256(cases)}`)
    return 0
  }
  if (command === '--status') {
    console.log(tablesStatus() === 'waiting' ? 'the dispatcher tables have not been generated: W1-T13\'s keys level waits (Q-10)' : 'the dispatcher tables are committed')
    return 0
  }
  if (command === '--check') {
    const found = readTable(repoRoot, arg ?? TABLE_DIR)
    if (found === null) {
      console.log(`no table at ${arg ?? TABLE_DIR}/${TABLE_FILE}: the dispatcher tables have not been generated (Q-10)`)
      return 3
    }
    const problems: string[] = []
    if (!found.hashOk) problems.push(`${TABLE_FILE} does not have the SHA-256 that ${TABLE_FILE}.sha256 names`)
    const verdict = checkTable(buildCases(), found.table)
    problems.push(...verdict.problems)
    if (problems.length > 0) {
      for (const line of problems) console.error(line)
      return 1
    }
    console.log(`the model agrees with the tables on ${verdict.checked.v2} MRV2 cases, ${verdict.checked.v1} MRV1 cases, ${verdict.checked.sizes} size cases and ${verdict.checked.modes} mode cases`)
    return 0
  }
  console.error('usage: bun scripts/tables/dispatch-cases.ts --write <file> | --check [dir] | --status')
  return 2
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
