/**
 * Rule 9, the physics floors (ARCHITECTURE §8.5 rule 9, ASSESSMENT §6.4; W2-T08): no step may beat the time its bytes take to read, and no run may
 * emit tokens faster than the hardware allows. The numbers are the hardware atlas's, keyed by the name NVML reports (atlas.ts). A number that is
 * too good fails with its bound printed (statespace's I10).
 *
 *   P1  A step's GPU-busy time is at least the weights it reads over the memory bandwidth (T9 is the same check, for a trace).
 *       Weight bytes are the receipt's model inputs, `READ_PERMILLE` of them [estimated] (the share of a dense model that one forward streams),
 *       and the bandwidths of all the GPUs add. The KV bytes a step reads would only raise the floor, so a floor made without them cannot fail an honest run.
 *   P3  Output tokens per second stay below the lower of two ceilings (B13):
 *         memory   `max_num_seqs` × tokens per sequence per step ÷ the least a step can take;
 *         compute  the peak (with a margin) ÷ the FLOPs of a token, 2 × the parameters, with the parameters bounded below by bytes ÷ 4 (fp32 is the widest).
 *       A mixture of experts reads less than a dense model, and a speculative proposer emits more than one token per step: a stage declares both.
 *   P2, P4  A FLOP rate against the peak, and an attention call against the bytes it must move, are TR4's: they need its sweep (W2-T26).
 *
 * A GPU the atlas lacks has no floors, and this rule does not guess: a receipt with performance evidence that names one fails here, because a floor
 * that a forger can dodge by naming an unlisted GPU is no floor. A receipt with no performance evidence has nothing to bound and passes.
 */
import { stepWindows, traceChecks } from '@es/sim/trace'
import { fail, memoized, na, pass, together } from './checks'
import type { Outcome, Run } from './checks'
import { benchLogs, traces } from './evidence'
import { throughputOf } from './bench'
import { gpusOf, PEAK_MARGIN_PERMILLE, READ_PERMILLE, readFloorNs } from './atlas'
import type { Gpus } from './atlas'
import { cut, grouped, plural } from './format'
import { PROBLEM_CHARS } from './limits'
import type { CheckResult } from './report'

interface Basis {
  readonly gpus: Extract<Gpus, { ok: true }>
  readonly weightBytes: number
  readonly readPermille: number
  /** The least time a forward takes to read its weights, in ns. */
  readonly floorNs: number
}

/** What a floor is made of for this receipt, or the sentence that says why none can be. */
function basisOf(run: Run): Basis | string {
  return memoized(run, 'floors:basis', (): Basis | string => {
    const names = run.receipt.environment.gpus.map((gpu) => gpu.name)
    const gpus = gpusOf(run.atlas, names)
    if (!gpus.ok) {
      return gpus.count === 0
        ? 'the receipt names no GPU, and a floor is made from the GPU that ran'
        : `the hardware atlas has no entry for ${gpus.missing.map((name) => `"${cut(name, 60)}"`).join(', ')}, so no floor can be made, and a name that is not listed is not guessed`
    }
    const weightBytes = run.receipt.inputs.filter((input) => input.kind === 'model').reduce((total, input) => total + input.bytes, 0)
    if (weightBytes <= 0) return 'the receipt lists no model among its inputs, so there are no weight bytes to make a floor from'
    const readPermille = run.declared?.readPermille ?? READ_PERMILLE
    return { gpus, weightBytes, readPermille, floorNs: readFloorNs(weightBytes, readPermille, gpus.bandwidthGBps) }
  })
}

const explain = (basis: Basis): string =>
  `${grouped(basis.weightBytes)} weight bytes × ${basis.readPermille / 10}% [estimated] ÷ ${grouped(basis.gpus.bandwidthGBps)} GB/s over ${plural(basis.gpus.count, 'GPU')} = ${grouped(basis.floorNs)} ns`

function p1(run: Run): Outcome {
  const all = traces(run)
  if (all.length === 0) return na('the receipt carries no trace')
  const basis = basisOf(run)
  if (typeof basis === 'string') return fail('P1', cut(`${basis}.`, PROBLEM_CHARS))
  const parts: { label: string; result: CheckResult }[] = []
  for (const parsed of all) {
    if (!parsed.ok) {
      parts.push({ label: parsed.id, result: fail('P1', cut(`the trace could not be read: ${parsed.problem}.`, PROBLEM_CHARS)) })
      continue
    }
    if (stepWindows(parsed.value).length === 0) {
      parts.push({ label: parsed.id, result: fail('P1', 'the trace has no step window, so no step can be held to its floor.') })
      continue
    }
    const found = traceChecks(parsed.value, { stepBusyNs: basis.floorNs }).find((result) => result.id === 'T9')
    if (found === undefined) {
      parts.push({ label: parsed.id, result: fail('P1', 'the trace is inconsistent, so its steps cannot be held to a floor.') })
      continue
    }
    // The model's sentence counts in plain digits; the receipt's page counts in thousands.
    const detail = found.detail.replace(/\d{4,}/g, (digits) => grouped(Number(digits)))
    const text = found.pass ? `${detail}; every step lasts at least the floor, ${explain(basis)}.` : `${detail}. The floor is ${explain(basis)}: no step reads the weights faster than the memory allows.`
    parts.push({ label: parsed.id, result: found.pass ? pass('P1', cut(text, PROBLEM_CHARS)) : fail('P1', cut(text, PROBLEM_CHARS)) })
  }
  return together('P1', parts)
}

function p3(run: Run): Outcome {
  if (benchLogs(run).length === 0) return na('the receipt carries no benchmark log')
  const basis = basisOf(run)
  if (typeof basis === 'string') return fail('P3', cut(`${basis}.`, PROBLEM_CHARS))
  const seqs = run.receipt.environment.engineConfig?.maxNumSeqs
  if (seqs === undefined) return fail('P3', 'the receipt records no max_num_seqs, so the most tokens a step can emit is not known.')
  const found = throughputOf(run)
  if (typeof found === 'string') return na(found)
  const perStep = run.declared?.tokensPerSeqStep ?? 1
  const memory = basis.floorNs === 0 ? Number.POSITIVE_INFINITY : Math.floor((seqs * perStep * 1_000_000_000) / basis.floorNs)
  const compute = Math.floor((2 * basis.gpus.peakTflops * 1e12 * PEAK_MARGIN_PERMILLE) / 1000 / basis.weightBytes)
  const ceiling = Math.min(memory, compute)
  const parts = found.map((log) => ({
    label: log.id,
    result: (log.tokensPerS <= ceiling ? pass : fail)(
      'P3',
      cut(
        `${grouped(log.tokensPerS)} output tokens/s over ${plural(log.rows, 'measured row')}, against a ceiling of ${Number.isFinite(ceiling) ? grouped(ceiling) : 'no limit'}: memory ${Number.isFinite(memory) ? grouped(memory) : 'no limit'} (${grouped(seqs)} sequences × ${perStep} per step ÷ ${grouped(basis.floorNs)} ns) and compute ${grouped(compute)} (${grouped(basis.gpus.peakTflops)} TFLOPS peak with a margin of ${(PEAK_MARGIN_PERMILLE - 1000) / 10}% [estimated], per 2 × the parameters, at least ${grouped(Math.ceil(basis.weightBytes / 4))}).`,
        PROBLEM_CHARS,
      ),
    ),
  }))
  return together('P3', parts)
}

const FLOORS: Readonly<Record<string, (run: Run) => Outcome>> = { P1: p1, P3: p3 }

/** The floors of this file, by id: ids.ts lists them, and a test holds the two together. */
export const FLOORS_BUILT: readonly string[] = Object.keys(FLOORS)

/** Runs floor `id` (P1 or P3). `na` when the receipt has no evidence of the kind it bounds. */
export function floorCheck(run: Run, id: string): Outcome {
  const check = FLOORS[id]
  return check === undefined ? na(`this site has no floor called ${id}`) : check(run)
}
