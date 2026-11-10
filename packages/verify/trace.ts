/**
 * Rule 8 for a trace (ARCHITECTURE §8.5 rule 8, §5.7; ASSESSMENT §6.1 and §6.3): T1 to T8, T10 and X4, each recomputed from the trace's own spans
 * with packages/sim/trace. T9, the floors, is rule 9's (floors.ts), and X1, X2 and X5 are other tasks' (stages.ts says whose).
 *
 *   T1   the trace reads as `trace@1`, names its engine, version, GPU and capture time, and a learner's trace is not marked synthetic
 *   T2   time runs forward                     (traceChecks)
 *   T3   one stream runs one thing at a time   (traceChecks)
 *   T4   every kernel has a launch before it   (traceChecks)
 *   T5   step marks contain their kernels      (traceChecks)
 *   T6   the number of step windows is the one the challenge asks for                  (the stage's declared range, drawn from the seed)
 *   T7   in every window GPU-busy + CPU-gap + both-idle is the window, exactly in ns    (and so is any attribution the receipt claims, and it agrees)
 *   T8   the configuration shows: no graph launch when the graph mode is NONE, and one at least when it is not     [a weak form: see the check]
 *   T10  the two traces of a pair name one engine, version and GPU, and have as many windows
 *   X4   one GPU name across the receipt: the trace names the GPU that NVML reported
 *
 * A trace's claimed attribution is `performance.claimed[<artifact id>]`: `{ windows: [{ fromNs, toNs, windowNs, gpuBusyNs, kernelNs, copyOnlyNs,
 * cpuGapNs, bothIdleNs, overlapNs }] }`, one row for each step window in time order, which is `Attribution` of packages/sim/trace without its
 * segments. A row is compared for the fields it has. T7 holds a row to its own window first, so that a figure which does not partition its window
 * is named for that, and only then to the trace.
 */
import { attributeSteps, stepWindows, traceChecks } from '@es/sim/trace'
import type { Attribution, EsTrace, TraceCheckResult } from '@es/sim/trace'
import { between, rngFor } from '@es/sim/core/rng'
import { claimOf, fail, memoized, na, pass, together } from './checks'
import type { Outcome, Run } from './checks'
import { TRACE_FORMAT, traces } from './evidence'
import type { Parsed } from './evidence'
import { cut, grouped, plural } from './format'
import { PROBLEM_CHARS } from './limits'
import type { CheckResult } from './report'

type Good = Extract<Parsed<EsTrace>, { ok: true }>
type TraceCheck = (run: Run, parsed: Good) => Outcome

const ns = (n: number): string => `${grouped(n)} ns`
const line = (id: string, ok: boolean, text: string): CheckResult => (ok ? pass(id, cut(text, PROBLEM_CHARS)) : fail(id, cut(text, PROBLEM_CHARS)))

/** `traceChecks` on a trace, once (T2 to T5, and `structure`), without floors. */
const structural = (run: Run, parsed: Good): readonly TraceCheckResult[] => memoized(run, `trace:checks:${parsed.id}`, () => traceChecks(parsed.value))

/** The recomputed attribution of every step window of a trace, once. */
export const windowsOf = (run: Run, parsed: Good): readonly Attribution[] => memoized(run, `trace:windows:${parsed.id}`, () => attributeSteps(parsed.value))

function t1(run: Run, parsed: Good): Outcome {
  const { meta } = parsed.value
  const missing = (['engine', 'version', 'gpu', 'capturedAt'] as const).filter((key) => meta[key] === undefined)
  const problems: string[] = []
  if (missing.length > 0) problems.push(`it does not name its ${missing.join(', ')}`)
  if (meta.synthetic && !run.synthetic) problems.push('it says it is synthetic, and a made-up trace is not a capture of a run')
  if (meta.source === 'owner') problems.push("it says it is one of the owner's reference traces, which a learner's receipt cannot carry")
  if (problems.length > 0) return fail('T1', cut(`${problems.join('; ')}.`, PROBLEM_CHARS))
  return pass('T1', cut(`Reads as trace@1 (${plural(parsed.value.spans.track.length, 'span')}) from ${meta.engine ?? 'an engine'} ${meta.version ?? ''} on ${meta.gpu ?? 'a GPU'}, captured ${meta.capturedAt ?? 'at a time it names'}${meta.synthetic ? ', labelled synthetic' : ''}.`, PROBLEM_CHARS))
}

const fromTraceChecks =
  (id: 'T2' | 'T3' | 'T4' | 'T5'): TraceCheck =>
  (run, parsed) => {
    const results = structural(run, parsed)
    const found = results.find((result) => result.id === id)
    // A trace whose columns are inconsistent gets the `structure` verdict alone, and every check after it is that failure.
    if (found === undefined) return fail(id, cut(`${results[0]?.detail ?? 'the trace is inconsistent'}.`, PROBLEM_CHARS))
    return line(id, found.pass, `${found.title}: ${found.detail}.`)
  }

function t6(run: Run, parsed: Good): Outcome {
  const declared = run.declared?.steps
  if (declared === undefined) return na(`this site declares no step count for ${run.receipt.stage}`)
  const want = between(rngFor(run.receipt.challenge.seed, declared.salt), declared.lo, declared.hi)
  const got = stepWindows(parsed.value).length
  return line('T6', got === want, `the trace has ${plural(got, 'step window')}, and the challenge's seed asks for ${grouped(want)} (a count from ${grouped(declared.lo)} to ${grouped(declared.hi)}).`)
}

/** Every field of a claimed window that this check compares with the recomputed one, in the order it reports them. */
const FIELDS = ['fromNs', 'toNs', 'windowNs', 'gpuBusyNs', 'kernelNs', 'copyOnlyNs', 'cpuGapNs', 'bothIdleNs', 'overlapNs'] as const

function t7(run: Run, parsed: Good): Outcome {
  const windows = windowsOf(run, parsed)
  const broken = windows.findIndex((w) => w.gpuBusyNs + w.cpuGapNs + w.bothIdleNs !== w.windowNs)
  if (broken >= 0) return fail('T7', cut(`window ${broken}: GPU-busy, CPU-gap and both-idle do not add up to the window, which is a fault of the recomputation.`, PROBLEM_CHARS))
  const claim = claimOf(run, parsed.id)
  const rows: unknown = claim?.windows
  if (!Array.isArray(rows)) return pass('T7', `${plural(windows.length, 'window')}, and in each one GPU-busy + CPU-gap + both-idle is the window to the ns.`)
  if (rows.length !== windows.length) return fail('T7', cut(`the receipt attributes ${plural(rows.length, 'window')}, and the trace has ${grouped(windows.length)}.`, PROBLEM_CHARS))
  for (let i = 0; i < rows.length; i += 1) {
    const row: unknown = rows[i]
    if (row === null || typeof row !== 'object' || Array.isArray(row)) return fail('T7', cut(`window ${i} is not an attribution.`, PROBLEM_CHARS))
    const claimed = row as Record<string, unknown>
    const parts = ['gpuBusyNs', 'cpuGapNs', 'bothIdleNs'].map((key) => claimed[key])
    const length = typeof claimed.windowNs === 'number' ? claimed.windowNs : typeof claimed.fromNs === 'number' && typeof claimed.toNs === 'number' ? claimed.toNs - claimed.fromNs : windows[i].windowNs
    if (!parts.every((part): part is number => typeof part === 'number' && Number.isSafeInteger(part))) return fail('T7', cut(`window ${i}: the attribution gives no whole ns for GPU-busy, CPU-gap and both-idle.`, PROBLEM_CHARS))
    const total = (parts as number[]).reduce((sum, part) => sum + part, 0)
    if (total !== length) {
      const [busy, gap, idle] = parts as number[]
      return fail('T7', cut(`window ${i}: GPU-busy ${ns(busy)} + CPU-gap ${ns(gap)} + both-idle ${ns(idle)} = ${ns(total)}, and the window is ${ns(length)} long: an attribution partitions its window exactly.`, PROBLEM_CHARS))
    }
    for (const key of FIELDS) {
      if (typeof claimed[key] === 'number' && claimed[key] !== windows[i][key]) {
        return fail('T7', cut(`window ${i}: the receipt claims ${key} ${ns(claimed[key])}, and the trace gives ${ns(windows[i][key])}.`, PROBLEM_CHARS))
      }
    }
  }
  return pass('T7', `${plural(windows.length, 'window')}: each claimed attribution adds up to its window to the ns, and agrees with the partition recomputed from the spans.`)
}

function t8(run: Run, parsed: Good): Outcome {
  const config = run.receipt.environment.engineConfig
  if (config === undefined) return na('the receipt records no engine configuration to compare the trace with')
  const { spans, strings, tracks } = parsed.value
  const api = new Set(tracks.filter((track) => track.kind === 'cuda-api').map((track) => track.id))
  let launches = 0
  for (let i = 0; i < spans.track.length; i += 1) if (api.has(spans.track[i]) && strings[spans.name[i]].startsWith('cudaGraphLaunch')) launches += 1
  // The weak form: whether the trace has graph launches at all. "Decode steps contain graph launches" needs to know which steps decode, which a trace does not say.
  const eager = config.graphMode === 'NONE'
  const text = `the receipt says the graph mode is ${config.graphMode}, and the trace has ${plural(launches, 'graph launch', 'graph launches')}`
  return line('T8', eager ? launches === 0 : launches > 0, `${text}${eager ? ': none expected.' : ': at least one expected.'}`)
}

function x4(run: Run, parsed: Good): Outcome {
  const names = run.receipt.environment.gpus.map((gpu) => gpu.name)
  const named = parsed.value.meta.gpu
  if (named === undefined) return na('the trace names no GPU')
  return line('X4', names.includes(named), `the trace names "${cut(named, 60)}" and the receipt's GPU${names.length === 1 ? ' is' : 's are'} ${names.length === 0 ? 'none' : names.map((name) => `"${cut(name, 60)}"`).join(', ')}.`)
}

const TRACE_CHECKS: Readonly<Record<string, TraceCheck>> = { T1: t1, T2: fromTraceChecks('T2'), T3: fromTraceChecks('T3'), T4: fromTraceChecks('T4'), T5: fromTraceChecks('T5'), T6: t6, T7: t7, T8: t8, X4: x4 }

/** The checks of this file, by id, with T10 (the pair): ids.ts lists them, and a test holds the two together. T9 is rule 9's. */
export const TRACE_CHECKS_BUILT: readonly string[] = [...Object.keys(TRACE_CHECKS), 'T10']

function pair(all: readonly Parsed<EsTrace>[]): Outcome {
  if (all.length < 2) return na('a pair needs two traces')
  if (all.length > 2) return fail('T10', cut(`the receipt carries ${all.length} traces, and a pair is two.`, PROBLEM_CHARS))
  const [a, b] = all
  if (!a.ok || !b.ok) return fail('T10', cut(`a trace of the pair could not be read: ${a.ok ? (b as { problem: string }).problem : a.problem}.`, PROBLEM_CHARS))
  const same = (['engine', 'version', 'gpu'] as const).filter((key) => a.value.meta[key] !== b.value.meta[key])
  const windows = [stepWindows(a.value).length, stepWindows(b.value).length]
  const problems: string[] = []
  if (same.length > 0) problems.push(`the two traces differ in their ${same.join(', ')}`)
  if (windows[0] !== windows[1]) problems.push(`one has ${plural(windows[0], 'step window')} and the other ${grouped(windows[1])}`)
  return problems.length > 0 ? fail('T10', cut(`${problems.join('; ')}.`, PROBLEM_CHARS)) : pass('T10', `Both traces are from ${a.value.meta.engine ?? 'one engine'} ${a.value.meta.version ?? ''} on ${a.value.meta.gpu ?? 'one GPU'}, with ${plural(windows[0], 'step window')} each.`)
}

/** Runs T-check or X-check `id` over every trace of the receipt. `na` when the receipt has none. */
export function traceCheck(run: Run, id: string): Outcome {
  const all = traces(run)
  if (all.length === 0) return na(`the receipt carries no trace (${TRACE_FORMAT})`)
  if (id === 'T10') return pair(all)
  const check = TRACE_CHECKS[id]
  if (check === undefined) return na(`this site has no check called ${id}`)
  const parts: { label: string; result: CheckResult }[] = []
  for (const parsed of all) {
    if (!parsed.ok) {
      parts.push({ label: parsed.id, result: fail(id, cut(`the trace could not be read: ${parsed.problem}.`, PROBLEM_CHARS)) })
      continue
    }
    const outcome = check(run, parsed)
    if ('na' in outcome) return outcome
    parts.push({ label: parsed.id, result: outcome })
  }
  return together(id, parts)
}
