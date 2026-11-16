/**
 * Rule 9, the physics floors (ARCHITECTURE §8.5 rule 9, ASSESSMENT §6.4; W2-T08): no step may beat the time its bytes take to read, and no run may
 * emit tokens faster than the hardware allows. The numbers are the hardware atlas's, keyed by the name NVML reports (atlas.ts). A number that is
 * too good fails with its bound printed (statespace's I10).
 *
 *   P1  A step's GPU-busy time is at least the weights it reads over the memory bandwidth (T9 is the same check, for a trace).
 *       Weight bytes are the stage's pinned model, `READ_PERMILLE` of them [estimated] (the share of a dense model that one forward streams),
 *       and the bandwidths of the GPUs the stage runs on add. The KV bytes a step reads would only raise the floor, so a floor made without them cannot fail an honest run.
 *   P3  Output tokens per second stay below the lower of two ceilings (B13):
 *         memory   `max_num_seqs` × tokens per sequence per step ÷ the least a step can take;
 *         compute  the peak (with a margin) ÷ the FLOPs of a token, 2 × the parameters, with the parameters bounded below by bytes ÷ 4 (fp32 is the widest).
 *       A mixture of experts reads less than a dense model, and a speculative proposer emits more than one token per step: a stage declares both.
 *   P2, P4  A FLOP rate against the peak, and an attention call against the bytes it must move, are TR4's: they need its sweep (W2-T26).
 *
 * What a floor is made from comes from the site and not from the receipt (the review of W2's grader track). A receipt is the run's own account of itself, and a floor
 * made from a figure in it is a floor that one smaller number defeats: the bestiary's smaller-model forgery types 1,000,000 bytes into the model input of a trace that is
 * too fast, and a floor of 59 ns [derived: 1,000,000 bytes × 80% ÷ 13,400 GB/s] lets every step through. So the stage declares (StageDeclaration, src/receipts/declared.ts):
 *   model        the files of the model it serves, by hash and size. The weight bytes are theirs, and the receipt's model inputs have to be exactly these files;
 *   gpus         how many GPUs its engine spans, out of the ones the fingerprint lists, which are all the machine has. It is 1 when left out;
 *   maxNumSeqs   the most sequences its engine runs at once, which the receipt's `max_num_seqs` may not pass (P3 only).
 * A stage that declares no model fails P1 and P3 with that reason, as a stage with no workload fails B1; and P3 fails likewise for a stage with no `maxNumSeqs`.
 *
 * A GPU the atlas lacks has no floors, and this rule does not guess: a receipt with performance evidence that names one fails here, because a floor
 * that a forger can dodge by naming an unlisted GPU is no floor. A receipt with no performance evidence has nothing to bound and passes.
 */
import { stepWindows, traceChecks } from '@es/sim/trace'
import { fail, memoized, na, pass, together } from './checks'
import type { ModelFile, Outcome, Run } from './checks'
import { benchLogs, traces } from './evidence'
import { throughputOf } from './bench'
import { gpusNamed, gpusOf, PEAK_MARGIN_PERMILLE, READ_PERMILLE, readFloorNs } from './atlas'
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

/** The start of a hash, as the sentences print it. */
const short = (sha256: string): string => `${sha256.slice(0, 8)}…`

/** A model file as the sentences name it: `"name" with 1,000 bytes (sha256 0123abcd…)`. */
const named = (file: ModelFile): string => `"${cut(file.name, 40)}" with ${grouped(file.bytes)} bytes (sha256 ${short(file.sha256)})`

/**
 * What is wrong with the model inputs of a receipt next to the files its stage pins, as a sentence without its full stop; null when they are the same files. A file is the same when its hash
 * and its size are. The first input that is not a pinned file is named with the pinned file of its name, if there is one, and the first pinned file the receipt lacks is
 * named when every input is a pinned one.
 */
function modelProblem(inputs: Run['receipt']['inputs'], pinned: readonly ModelFile[], stage: string): string | null {
  const given = inputs.filter((input) => input.kind === 'model')
  for (const input of given) {
    if (pinned.some((file) => file.sha256 === input.sha256 && file.bytes === input.bytes)) continue
    const same = pinned.find((file) => file.name === input.name)
    const mine = named(input)
    return same === undefined
      ? `The receipt lists the model input ${mine}, which ${stage} does not pin: the floor is made from the pinned model`
      : `The receipt lists the model input ${mine}, and ${stage} pins ${named(same)}; the floor is made from the pinned one`
  }
  const lacking = pinned.find((file) => !given.some((input) => input.sha256 === file.sha256 && input.bytes === file.bytes))
  return lacking === undefined ? null : `${stage} pins the model file ${named(lacking)}, and the receipt lists no model input like it`
}

/**
 * What a floor is made of for this receipt, or the sentence that says why none can be. `named` is the GPU that the evidence names (a trace's `meta.gpu`), or undefined when it
 * names none (a benchmark log). The GPUs come from what the stage declares (how many) and what the evidence shows (which): with a name, the floor is made from `used` GPUs
 * of that model, and the receipt's list has to hold that many of them; without one, from the slowest `used` of the listed GPUs. The list is typed beside the hashed evidence, and a
 * faster GPU's name typed into it must not lower the floor (the second review of W2's grader track).
 * The limit of that (the rest review): a log names no GPU, so P3's ceiling follows the receipt's own list, and replacing every name in it with a faster GPU's raises the ceiling (four H100 give 15,314 tokens/s, and the same list renamed H200 gives 21,942 [measured 2026-11, build 32b30c4, the replay fixture]), with no artifact touched. Closing it means `bench-log@1` naming the GPU (the grader writes it from NVML, as it does `meta.gpu` of a trace) and P3 making its basis with the name.
 */
function basisOf(run: Run, named?: string): Basis | string {
  return memoized(run, `floors:basis:${named ?? ''}`, (): Basis | string => {
    const stage = run.receipt.stage
    const names = run.receipt.environment.gpus.map((gpu) => gpu.name)
    const used = run.declared?.gpus ?? 1
    // The receipt's list has to be one that the atlas knows whole, as it always had to be: a name that is left out of the sum could be the slow one.
    const listed = gpusOf(run.atlas, names, used, 'slowest')
    if (!listed.ok) {
      return listed.count === 0
        ? 'the receipt names no GPU, and a floor is made from the GPU that ran'
        : `the hardware atlas has no entry for ${listed.missing.map((name) => `"${cut(name, 60)}"`).join(', ')}, so no floor can be made, and a name that is not listed is not guessed`
    }
    if (names.length < used) return `the receipt lists ${plural(names.length, 'GPU')}, and ${stage} runs on ${grouped(used)}, so it is not the run that the stage declares and no floor is made from it`
    let gpus = listed
    if (named !== undefined) {
      const same = gpusNamed(run.atlas, names, named, used)
      if (!same.ok) {
        return same.listed === undefined
          ? `the hardware atlas has no entry for "${cut(named, 60)}", the GPU that the trace names, so no floor can be made, and a name that is not listed is not guessed`
          : `the trace names "${cut(named, 60)}", ${stage} runs on ${grouped(used)} GPU${used === 1 ? '' : 's'}, and the receipt lists ${plural(same.listed, 'GPU')} of that name: the floor is made from the GPU that the trace names, as many times as the stage runs`
      }
      gpus = same
    }
    const pinned = run.declared?.model
    if (pinned === undefined || pinned.length === 0) {
      return `this site declares no model for ${stage}, so there are no weight bytes to make a floor from, and the receipt's own figure for its model is not taken: a receipt that named its own model could name a small one`
    }
    const problem = modelProblem(run.receipt.inputs, pinned, stage)
    if (problem !== null) return problem
    const weightBytes = pinned.reduce((total, file) => total + file.bytes, 0)
    if (weightBytes <= 0) return `the model that ${stage} pins has no bytes, so there are no weight bytes to make a floor from`
    const readPermille = run.declared?.readPermille ?? READ_PERMILLE
    return { gpus, weightBytes, readPermille, floorNs: readFloorNs(weightBytes, readPermille, gpus.bandwidthGBps) }
  })
}

const explain = (basis: Basis): string =>
  `${grouped(basis.weightBytes)} weight bytes × ${basis.readPermille / 10}% [estimated] ÷ ${grouped(basis.gpus.bandwidthGBps)} GB/s over ${plural(basis.gpus.count, 'GPU')} = ${grouped(basis.floorNs)} ns`

function p1(run: Run): Outcome {
  const all = traces(run)
  if (all.length === 0) return na('the receipt carries no trace')
  const parts: { label: string; result: CheckResult }[] = []
  for (const parsed of all) {
    if (!parsed.ok) {
      parts.push({ label: parsed.id, result: fail('P1', cut(`the trace could not be read: ${parsed.problem}.`, PROBLEM_CHARS)) })
      continue
    }
    // The floor of a trace is made from the GPU that the trace names, so that a name typed into the receipt's list beside it lowers nothing.
    const basis = basisOf(run, parsed.value.meta.gpu)
    if (typeof basis === 'string') {
      parts.push({ label: parsed.id, result: fail('P1', cut(`${basis}.`, PROBLEM_CHARS)) })
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
  const most = run.declared?.maxNumSeqs
  if (most === undefined) return fail('P3', cut(`this site declares no most for max_num_seqs for ${run.receipt.stage}, so the receipt's figure for it cannot be held to anything.`, PROBLEM_CHARS))
  if (seqs > most) {
    return fail('P3', cut(`the receipt records max_num_seqs ${grouped(seqs)}, and the engine of ${run.receipt.stage} never runs more than ${grouped(most)} sequences at once, so the ceiling is not made from the receipt's figure.`, PROBLEM_CHARS))
  }
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
