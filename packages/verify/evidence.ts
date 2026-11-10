/**
 * The performance evidence a receipt carries, read from its artifacts (ARCHITECTURE §8.5 rule 8, ASSESSMENT §6.1 and §6.2; W2-T08).
 *
 * Two kinds travel in a bundle as JSON and are recomputed from their raw records:
 *   - a trace, `trace@1` (artifact kind `trace`), which packages/sim/trace reads;
 *   - a benchmark log, `bench-log@1` (artifact kind `bench-log`), which this file reads.
 * A receipt may carry more than one of either (a pair of runs), each under its own artifact id, and every check runs over all of them.
 *
 * `bench-log@1` is ASSESSMENT §6.2's log, in columns as `trace@1` is: one row per request, in integer ns on the run's own clock, whose origin is the
 * start of the schedule (a request's due time is its offset in the schedule, in ns, so due times are the generator's µs times 1,000).
 *
 *   { schema: 'enginespace/bench-log@1',
 *     cacheResetNs,                  // when the server started or its prefix cache was last reset, in ns on that clock: at or before the first due time (B14)
 *     rows: { id, dueNs, sentNs, firstNs, doneNs, promptTokens, outputTokens, status } }   // eight columns of one length; status 0 completed, 1 failed, 2 aborted
 *
 * The reader is as strict as `traceFromJson`: a key it does not know, a missing one, a column of another length or a value that is not an integer
 * is an error that names the field. It judges the shape and not the physics: a request that was sent before it was due reads fine here, and B3 fails it.
 *
 * Rule 7's three artifacts (rechecks.ts) are read the same way, and are columns of integers too:
 *   enginespace/identity@1    { schema, sequences: { first, gapMilli } }                      per sequence: where two runs first differ (-1 if never) and the gap
 *   enginespace/acceptance@1  { schema, rounds: { proposed, accepted, bonus, emitted } }       per round of speculation
 *   enginespace/argmax@1      { schema, positions, ids }                                       the argmax token id at each position the learner's forward gave
 *
 * Nothing here is trusted to be what its name says. A log is read only if the receipt lists it with the kind and the format below, and every
 * number a check prints about it is recomputed from its rows (bench.ts, trace.ts).
 */
import type { ReceiptArtifact } from '@es/schema/receipt'
import { traceFromJson } from '@es/sim/trace'
import type { EsTrace } from '@es/sim/trace'
import { memoized } from './checks'
import type { Run } from './checks'
import { cut, grouped } from './format'

export const BENCH_LOG_FORMAT = 'enginespace/bench-log@1'
export const TRACE_FORMAT = 'enginespace/trace@1'

/** The most requests a log may hold [estimated]. The bootstrap of B7 draws a thousand samples of that many rows, three times over, and a worker has two minutes. */
export const MAX_BENCH_ROWS = 100_000

/** How a request ended (ASSESSMENT B2). */
export const STATUS = { completed: 0, failed: 1, aborted: 2 } as const

const COLUMNS = ['id', 'dueNs', 'sentNs', 'firstNs', 'doneNs', 'promptTokens', 'outputTokens', 'status'] as const

export interface BenchLog {
  readonly cacheResetNs: number
  readonly rows: Readonly<Record<(typeof COLUMNS)[number], readonly number[]>>
}

/** An artifact read, or why it could not be. `id` is the artifact's id in the receipt. */
export type Parsed<T> = { readonly id: string; readonly ok: true; readonly value: T } | { readonly id: string; readonly ok: false; readonly problem: string }

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && !Object.is(x, -0)

const fault = (message: string): never => {
  throw new RangeError(message)
}

/** The fields of an object, exactly these (a key it does not know, or one that is missing, is an error that names it). */
function exactly(value: unknown, where: string, names: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fault(`${where} is not an object`)
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) if (!names.includes(key)) fault(`${where} has a field "${cut(key, 40)}", which this format does not`)
  for (const name of names) if (!Object.hasOwn(record, name)) fault(`${where} has no field "${name}"`)
  return record
}

/** Integer columns of one length, none longer than `max`. */
function intColumns<K extends string>(value: unknown, where: string, names: readonly K[], max: number): Record<K, readonly number[]> {
  const record = exactly(value, where, names)
  let count = -1
  for (const name of names) {
    const column = record[name]
    if (!Array.isArray(column)) return fault(`${where}.${name} is not an array`)
    if (count === -1) count = column.length
    else if (column.length !== count) fault(`${where}.${name} has ${grouped(column.length)} rows, where ${where}.${names[0]} has ${grouped(count)}`)
    if (column.length > max) fault(`${where} holds ${grouped(column.length)} rows, and this site reads at most ${grouped(max)} [estimated]`)
    for (let i = 0; i < column.length; i += 1) if (!isInt(column[i])) fault(`${where}.${name}[${i}] is not an integer below 2^53`)
  }
  return record as Record<K, readonly number[]>
}

const tagged = (value: unknown, format: string, names: readonly string[]): Record<string, unknown> => {
  const root = exactly(value, 'it', ['schema', ...names])
  if (root.schema !== format) fault(`its schema is ${JSON.stringify(cut(root.schema, 40))}, and not "${format}"`)
  return root
}

function readLog(data: unknown): BenchLog {
  const root = tagged(data, BENCH_LOG_FORMAT, ['cacheResetNs', 'rows'])
  if (!isInt(root.cacheResetNs)) fault('cacheResetNs is not an integer')
  const rows = intColumns(root.rows, 'rows', COLUMNS, MAX_BENCH_ROWS)
  for (let i = 0; i < rows.status.length; i += 1) if (rows.status[i] < 0 || rows.status[i] > 2) fault(`rows.status[${i}] is ${rows.status[i]}, and a status is 0, 1 or 2`)
  return { cacheResetNs: root.cacheResetNs as number, rows }
}

/* Rule 7's artifacts (rechecks.ts). */

export const IDENTITY_FORMAT = 'enginespace/identity@1'
export const ACCEPTANCE_FORMAT = 'enginespace/acceptance@1'
export const ARGMAX_FORMAT = 'enginespace/argmax@1'

/** The most rows of rule 7's artifacts [estimated]: sequences, rounds or positions. */
export const MAX_RECHECK_ROWS = 1_000_000

export interface IdentityLog {
  /** The position of the first token where the two runs differ, per sequence, or -1 when they never do. */
  readonly first: readonly number[]
  /** The first run's top-2 log-probability gap at that position, in thousandths of a nat, or -1 when the sequences are the same. */
  readonly gapMilli: readonly number[]
}
export interface AcceptanceLog {
  readonly proposed: readonly number[]
  readonly accepted: readonly number[]
  readonly bonus: readonly number[]
  readonly emitted: readonly number[]
}
export interface ArgmaxLog {
  readonly positions: readonly number[]
  readonly ids: readonly number[]
}

export const readIdentity = (data: unknown): IdentityLog => {
  const root = tagged(data, IDENTITY_FORMAT, ['sequences'])
  const sequences = intColumns(root.sequences, 'sequences', ['first', 'gapMilli'] as const, MAX_RECHECK_ROWS)
  for (let i = 0; i < sequences.first.length; i += 1) {
    const { first, gapMilli } = { first: sequences.first[i], gapMilli: sequences.gapMilli[i] }
    if (first < -1) fault(`sequences.first[${i}] is ${first}, and a position is from 0, or -1 for none`)
    if ((first === -1) !== (gapMilli === -1)) fault(`sequences[${i}] has a gap exactly when it has a first mismatch`)
    if (gapMilli < -1) fault(`sequences.gapMilli[${i}] is ${gapMilli}`)
  }
  return sequences
}
export const readAcceptance = (data: unknown): AcceptanceLog => {
  const root = tagged(data, ACCEPTANCE_FORMAT, ['rounds'])
  return intColumns(root.rounds, 'rounds', ['proposed', 'accepted', 'bonus', 'emitted'] as const, MAX_RECHECK_ROWS)
}
export const readArgmax = (data: unknown): ArgmaxLog => {
  const root = tagged(data, ARGMAX_FORMAT, ['positions', 'ids'])
  return intColumns({ positions: root.positions, ids: root.ids }, 'it', ['positions', 'ids'] as const, MAX_RECHECK_ROWS)
}

const messageOf = (error: unknown): string => cut(error instanceof Error ? error.message : String(error), 200)

/** The receipt's entries of this kind and format, and what each came to: the artifact read, or the reason it could not be. */
export function readArtifacts<T>(run: Run, kind: ReceiptArtifact['kind'], format: string, parse: (data: unknown) => T): readonly Parsed<T>[] {
  return memoized(run, `evidence:${kind}:${format}`, () =>
    run.receipt.artifacts
      .filter((entry) => entry.kind === kind && entry.format === format)
      .map((entry): Parsed<T> => {
        if (!entry.inBundle) return { id: entry.id, ok: false, problem: 'the learner kept it and it is not in the bundle, so this browser cannot read it' }
        const artifact = run.artifacts[entry.id]
        if (artifact.encoding !== 'json') return { id: entry.id, ok: false, problem: `it is written as ${artifact.encoding}, and ${format} is JSON` }
        try {
          return { id: entry.id, ok: true, value: parse(artifact.data) }
        } catch (error) {
          return { id: entry.id, ok: false, problem: messageOf(error) }
        }
      }),
  )
}

/** The benchmark logs of a receipt, each read once. */
export const benchLogs = (run: Run): readonly Parsed<BenchLog>[] => readArtifacts(run, 'bench-log', BENCH_LOG_FORMAT, readLog)

/** The traces of a receipt, each read once, as the typed columns that `traceChecks` and `attribute` take. */
export const traces = (run: Run): readonly Parsed<EsTrace>[] => readArtifacts(run, 'trace', TRACE_FORMAT, traceFromJson)
