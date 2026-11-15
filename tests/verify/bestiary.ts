/*
 * The forged bestiary (ARCHITECTURE §8.5 "Receipt fixtures run in CI", ASSESSMENT §13; W2-T08): the forgeries that a casual forger tries, each built from an
 * honest fixture, each of which must fail the check that is named for it with the bound it broke printed. Every forgery is a function of a fixture,
 * which is a bundle and the context in which it passes. Until W2-T12 the fixtures are synthetic (tests/verify/synthetic.ts); when the owner's bundles are
 * committed to tests/fixtures/receipts/ the same functions forge from them, since none of them reads a number that only the synthetic fixtures have: they
 * read the rows, the spans and the claims of whatever bundle they are given, and make the claims consistent again where the forger would.
 *
 *   edited-p99          A learner types a better p99 into the receipt. The artifacts are untouched, so rules 1 to 3 pass, and B6 recomputes the p99 from the rows.
 *   resigned-hash       A learner edits the log (shaves the first-token times), writes the new hash into the receipt, and leaves the claimed summary as it was. Integrity
 *                       passes, and B6 finds that the claim no longer follows from the rows. Integrity is not authenticity (rule 3's header): recomputation is.
 *   reused-token        A second receipt for a challenge that another receipt has spent: rule 4.
 *   replayed-receipt    The same receipt, brought back after the challenge has expired: rule 4.
 *   closed-loop         A log of clients that waited for their replies, claimed as an open-loop run with a summary computed from it: B4.
 *   too-fast            A trace whose kernels were shortened until the GPU does a step in less than the memory can read the weights, with the attribution claimed for it
 *                       made consistent: P1 (the floor of rule 9). T7 and the rest pass, which is the point of the forgery.
 *   unknown-grader      A receipt from a grader build that the site did not publish: rule 5.
 *   not-a-partition     An attribution whose GPU-busy, CPU-gap and both-idle do not add up to their window: T7.
 *   other-seed          A pair of runs of which the second was drawn from another seed than the challenge's: B1.
 *   smaller-model       The too-fast trace again, with a smaller model's size typed into the receipt's inputs, so that the floor made from the receipt's own figure is a few ns: P1.
 *                       The floor is made from the model that the site pins for the stage, and the receipt's input has to be that model.
 *   faster-gpu-typed    The too-fast trace again (0.8 of the honest floor, which the faster GPU's floor would clear), with four H200s typed into the receipt's list of GPUs and the trace
 *                       left naming the H100 that ran: the floor is made from the GPU the trace names, and P1 fails with the H100's bound.
 *   empty-evidence      The evidence left out and the entry for it left in: an acceptance artifact with its four columns empty, beside the grader's own check of the identity
 *                       as passed. A count over no round is no count: acceptance-counts (rule 7).
 *
 * What none of them is: a consistent forgery, in which the forger edits the rows and recomputes every summary that follows from them (A§8.6). That one passes,
 * and tests/verify/bestiary.test.ts says so in a test, so that the limit of the design is in the code and not only in the prose.
 */
import { gunzipSync } from 'node:zlib'
import { gpusOf, readFloorNs, READ_PERMILLE, warmupRows } from '@es/verify'
import type { Fixture } from './synthetic'
import { claimedSummary, edited } from './synthetic'
import { DAY, sha256 } from './support'
import { planBench, runBench, s5Server, summarizeRows } from '../../packages/sim/bench'
import type { BenchSpec } from '../../packages/sim/bench'
import { attributeSteps, traceFromJson } from '../../packages/sim/trace'
import type { TraceJson } from '../../packages/sim/trace'

export interface Forgery {
  readonly id: string
  readonly title: string
  /** The kind of honest fixture it is made from: one whose evidence is a benchmark log, a trace, or the counts of a proposer's rounds. */
  readonly from: 'bench' | 'trace' | 'counts'
  /** The check that must fail: the rule's number, and the check's id (the rule's own id for rules 1 to 6). */
  readonly fails: { readonly rule: number; readonly check: string }
  /** What the printed bound must say: the bound it broke, in the words of the check. */
  readonly bound: RegExp
  forge(honest: Fixture): Fixture
}

type Columns = Record<'id' | 'dueNs' | 'sentNs' | 'firstNs' | 'doneNs' | 'promptTokens' | 'outputTokens' | 'status', number[]>
interface BenchLog {
  schema: string
  cacheResetNs: number
  rows: Columns
}

/** The first benchmark log of a fixture, and the id of the artifact that holds it. */
function benchOf(fixture: Fixture): { id: string; log: BenchLog } {
  const entry = fixture.bundle.receipt.artifacts.find((artifact) => artifact.kind === 'bench-log')
  if (entry === undefined) throw new Error(`${fixture.name} carries no benchmark log`)
  const data = fixture.bundle.artifacts[entry.id]
  if (data.encoding !== 'json') throw new Error('a benchmark log is JSON')
  return { id: entry.id, log: data.data as BenchLog }
}

function traceOf(fixture: Fixture): { id: string; trace: TraceJson } {
  const entry = fixture.bundle.receipt.artifacts.find((artifact) => artifact.kind === 'trace')
  if (entry === undefined) throw new Error(`${fixture.name} carries no trace`)
  const data = fixture.bundle.artifacts[entry.id]
  if (data.encoding !== 'json') throw new Error('a trace is JSON')
  return { id: entry.id, trace: data.data as TraceJson }
}

/** The summary a forger who knows the stage's workload computes for a log they edited: the browser's own arithmetic, so that only what the forgery breaks is broken. */
function claimFor(fixture: Fixture, log: BenchLog): unknown {
  const spec = fixture.context.stages?.[fixture.stage]?.bench
  if (spec === undefined) throw new Error(`the context declares no workload for ${fixture.stage}`)
  const seed = fixture.bundle.receipt.challenge.seed
  const seqs = fixture.bundle.receipt.environment.engineConfig?.maxNumSeqs ?? 0
  const plan = planBench(seed, spec)
  const warmupUs = plan.reqs[warmupRows(seqs)].dueUs ?? 0
  const us = (ns: number): number => Math.round(ns / 1000)
  const { rows } = log
  const benchRows = rows.id.map((id, i) => ({ id, client: null, dueUs: us(rows.dueNs[i]), sentUs: us(rows.sentNs[i]), firstUs: us(rows.firstNs[i]), doneUs: us(rows.doneNs[i]), promptTokens: rows.promptTokens[i], outputTokens: rows.outputTokens[i] }))
  return JSON.parse(JSON.stringify(summarizeRows(benchRows, { warmupUs, durationUs: spec.durationUs, slo: spec.slo }, { bootstrap: 1000, seed })))
}

function setClaim(bundle: Fixture['bundle'], id: string, claim: unknown): void {
  const performance = bundle.receipt.performance
  if (performance === undefined) throw new Error('the receipt claims no performance')
  performance.claimed[id] = claim
}

/** A forgery of the windows of a trace: the attribution that the grader would claim for it, as T7's rows. */
function windowsOf(trace: TraceJson): { windows: Record<string, number>[] } {
  return {
    windows: attributeSteps(traceFromJson(trace)).map((w) => ({
      fromNs: w.fromNs,
      toNs: w.toNs,
      windowNs: w.windowNs,
      gpuBusyNs: w.gpuBusyNs,
      kernelNs: w.kernelNs,
      copyOnlyNs: w.copyOnlyNs,
      cpuGapNs: w.cpuGapNs,
      bothIdleNs: w.bothIdleNs,
      overlapNs: w.overlapNs,
    })),
  }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The forgeries                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

const editedP99: Forgery = {
  id: 'edited-p99',
  title: 'an edited p99',
  from: 'bench',
  fails: { rule: 8, check: 'B6' },
  bound: /latency\.ttftFromDue\.p99Us: the receipt claims [\d,]+ and the rows give [\d,]+ \(nearest rank on the integer rows, [\d,]+ measured rows\)/,
  forge: (honest) =>
    edited(honest, (bundle) => {
      const { id } = benchOf(honest)
      const claim = bundle.receipt.performance?.claimed[id] as { latency: { ttftFromDue: { p99Us: number } } }
      claim.latency.ttftFromDue.p99Us = Math.floor(claim.latency.ttftFromDue.p99Us / 2)
    }),
}

const resignedHash: Forgery = {
  id: 'resigned-hash',
  title: 'a re-signed hash',
  from: 'bench',
  fails: { rule: 8, check: 'B6' },
  bound: /latency\.\w+\.\w+: the receipt claims [\d,]+ and the rows give [\d,]+/,
  forge: (honest) =>
    edited(honest, (bundle) => {
      const { id } = benchOf(honest)
      const artifact = bundle.artifacts[id]
      if (artifact.encoding !== 'json') throw new Error('a benchmark log is JSON')
      const rows = (artifact.data as BenchLog).rows
      // Every first token arrives after only 70% of the wait it took: the log is edited, its hash is written into the receipt (`edited` re-signs), and the claim is left alone.
      for (let i = 0; i < rows.id.length; i += 1) rows.firstNs[i] = rows.sentNs[i] + Math.floor(((rows.firstNs[i] - rows.sentNs[i]) * 7) / 10)
    }),
}

const reusedToken: Forgery = {
  id: 'reused-token',
  title: 'a reused token',
  from: 'bench',
  fails: { rule: 4, check: 'binding' },
  bound: /spent by receipt [0-9a-f]{8} already\. A token is single-use/,
  forge: (honest) => {
    // Another receipt for the same challenge, such as a re-run on the token or a friend's: a different file, so a different hash, and the ledger has spent the token on the first.
    const other = edited(honest, (bundle) => {
      bundle.receipt.notes = 'A second receipt for the same challenge.'
    })
    const book = other.context.book.map((entry) => ({ ...entry, usedBy: sha256('the first receipt of this challenge') }))
    return { ...other, context: { ...other.context, book } }
  },
}

const replayedReceipt: Forgery = {
  id: 'replayed-receipt',
  title: 'a replayed old receipt',
  from: 'bench',
  fails: { rule: 4, check: 'binding' },
  bound: /The token expired at [\d-]+ [\d:]+ UTC: it lasts 14 days \[estimated\]/,
  forge: (honest) => ({ ...honest, context: { ...honest.context, nowMs: honest.context.nowMs + 15 * DAY } }),
}

/** The log of the same requests sent by `clients` clients that wait for each reply, with every service time kept: the loop that coordinated omission comes from. */
function closedLoopOf(log: BenchLog, clients: number): BenchLog {
  const free = new Array<number>(clients).fill(0)
  const rows: Columns = { id: [...log.rows.id], dueNs: [...log.rows.dueNs], sentNs: [], firstNs: [], doneNs: [], promptTokens: [...log.rows.promptTokens], outputTokens: [...log.rows.outputTokens], status: [...log.rows.status] }
  for (let i = 0; i < log.rows.id.length; i += 1) {
    let client = 0
    for (let c = 1; c < clients; c += 1) if (free[c] < free[client]) client = c
    const sent = Math.max(log.rows.dueNs[i], free[client])
    rows.sentNs.push(sent)
    rows.firstNs.push(sent + (log.rows.firstNs[i] - log.rows.sentNs[i]))
    rows.doneNs.push(sent + (log.rows.doneNs[i] - log.rows.sentNs[i]))
    free[client] = rows.doneNs[i]
  }
  return { ...log, rows }
}

const closedLoop: Forgery = {
  id: 'closed-loop',
  title: 'a closed-loop log presented as open loop',
  from: 'bench',
  fails: { rule: 8, check: 'B4' },
  bound: /\d+ sends of [\d,]+ came more than 2,000 µs after their due time, the latest by [\d,]+ µs\. The bound is at least 99\.9% of sends within 2,000 µs of their due time and none past 20,000 µs \[estimated\]/,
  forge: (honest) => {
    const { id, log } = benchOf(honest)
    const forged = closedLoopOf(log, 4)
    return edited(honest, (bundle) => {
      const artifact = bundle.artifacts[id]
      if (artifact.encoding !== 'json') throw new Error('a benchmark log is JSON')
      artifact.data = forged
      // The forger claims the summary of the log they have, so that only the arrival adherence gives them away.
      setClaim(bundle, id, claimFor(honest, forged))
    })
  },
}

/** The bound that P1 prints for a step under its floor. */
const P1_BOUND = /Step \d+ has [\d,]+ ns of GPU-busy time, below its floor of [\d,]+ ns( \(and \d+ more\))?\. The floor is [\d,]+ weight bytes × 80% \[estimated\] ÷ [\d,]+ GB\/s over \d+ GPUs? = [\d,]+ ns/

/**
 * The honest trace with every kernel and copy shortened until its longest step is `share` of the honest floor (the floor of the GPUs that the receipt lists, as they were), the
 * attribution claimed for it made consistent again.
 */
function shortened(honest: Fixture, share: number): Fixture {
    const { id, trace } = traceOf(honest)
    const receipt = honest.bundle.receipt
    const gpus = gpusOf(honest.context.atlas ?? [], receipt.environment.gpus.map((gpu) => gpu.name))
    if (!gpus.ok) throw new Error('the honest fixture names a GPU that the atlas lacks')
    const weights = receipt.inputs.filter((input) => input.kind === 'model').reduce((total, input) => total + input.bytes, 0)
    const floor = readFloorNs(weights, READ_PERMILLE, gpus.bandwidthGBps)
    const before = attributeSteps(traceFromJson(trace))
    const longest = Math.max(...before.map((w) => w.gpuBusyNs))
    // Shorten every kernel and copy until the longest step is `share` of the floor: every step is then below it, whatever the trace was.
    const scale = Math.min(1, (floor * share) / longest)
    const gpuTracks = new Set(trace.tracks.filter((track) => track.kind === 'gpu-stream').map((track) => track.id))
    const forged: TraceJson = JSON.parse(JSON.stringify(trace))
    const spans = forged.spans as unknown as { track: number[]; durNs: number[] }
    for (let i = 0; i < spans.track.length; i += 1) if (gpuTracks.has(spans.track[i])) spans.durNs[i] = Math.max(1, Math.floor(spans.durNs[i] * scale))
    return edited(honest, (bundle) => {
      const artifact = bundle.artifacts[id]
      if (artifact.encoding !== 'json') throw new Error('a trace is JSON')
      artifact.data = forged
      // The forger claims the attribution of the trace they have, so that T7 and the rest are satisfied and only the floor is broken.
      setClaim(bundle, id, windowsOf(forged))
    })
}

const tooFast: Forgery = {
  id: 'too-fast',
  title: 'a trace faster than its physics floor',
  from: 'trace',
  fails: { rule: 9, check: 'P1' },
  bound: P1_BOUND,
  forge: (honest) => shortened(honest, 0.5),
}

/**
 * The GPUs of the receipt's list, with faster ones typed in. The trace is shortened to 0.8 of the honest floor, which a floor made from the fastest GPUs of the list clears
 * (the listed H200s read 1.4 times as fast as the H100 the trace names), and the trace keeps naming the H100: the floor is made from the GPU that the trace names.
 */
const fasterGpuTyped: Forgery = {
  id: 'faster-gpu-typed',
  title: 'a trace faster than its physics floor, with a faster GPU typed into the receipt\'s list',
  from: 'trace',
  fails: { rule: 9, check: 'P1' },
  bound: P1_BOUND,
  forge: (honest) =>
    edited(shortened(honest, 0.8), (bundle) => {
      const [first] = bundle.receipt.environment.gpus
      for (let i = 0; i < 4; i += 1) bundle.receipt.environment.gpus.push({ ...first, name: 'NVIDIA H200' })
    }),
}

const unknownGrader: Forgery = {
  id: 'unknown-grader',
  title: 'an unknown grader build',
  from: 'bench',
  fails: { rule: 5, check: 'grader' },
  bound: /enginespace-grader 9\.9\.9 is not a build this site published/,
  forge: (honest) =>
    edited(honest, (bundle) => {
      bundle.receipt.grader = { ...bundle.receipt.grader, version: '9.9.9', sourceSha256: sha256('a patched grader') }
    }),
}

const notAPartition: Forgery = {
  id: 'not-a-partition',
  title: 'an attribution that does not partition its step window',
  from: 'trace',
  fails: { rule: 8, check: 'T7' },
  bound: /Window \d+: GPU-busy [\d,]+ ns \+ CPU-gap [\d,]+ ns \+ both-idle [\d,]+ ns = [\d,]+ ns, and the window is [\d,]+ ns long: an attribution partitions its window exactly/,
  forge: (honest) =>
    edited(honest, (bundle) => {
      const { id } = traceOf(honest)
      const claim = bundle.receipt.performance?.claimed[id] as { windows: Record<string, number>[] }
      // The learner finds a CPU gap in a window and writes 10% less of it, to look better, and leaves the other parts as they were.
      const target = claim.windows.findIndex((w) => w.cpuGapNs >= 10)
      claim.windows[target].cpuGapNs -= Math.max(1, Math.floor(claim.windows[target].cpuGapNs / 10))
    }),
}

const otherSeed: Forgery = {
  id: 'other-seed',
  title: 'a pair run on different seeds',
  from: 'bench',
  fails: { rule: 8, check: 'B1' },
  bound: /(The log has [\d,]+ rows? and the challenge's seed draws [\d,]+ requests?|Row \d+ is request \d+, due [\d,]+ ns with a prompt of [\d,]+ tokens, and the schedule has request \d+).*a run on other seeds fails here/,
  forge: (honest) => {
    const spec = honest.context.stages?.[honest.stage]?.bench as BenchSpec
    const seed = honest.bundle.receipt.challenge.seed
    // The second side of the pair was run, in earnest and open loop, on another seed's schedule.
    const side = runBench((seed ^ 0x5a5a5a5a) >>> 0, spec, s5Server('h100-vllm-0-10-2-fp8', 4))
    const other = claimedSummary(side, spec, seed)
    return edited(honest, (bundle) => {
      const first = benchOf(honest).log
      const log = JSON.parse(JSON.stringify(first)) as BenchLog
      const ns = (us: number): number => us * 1000
      log.rows = {
        id: side.rows.map((r) => r.id),
        dueNs: side.rows.map((r) => ns(r.dueUs)),
        sentNs: side.rows.map((r) => ns(r.sentUs)),
        firstNs: side.rows.map((r) => ns(r.firstUs)),
        doneNs: side.rows.map((r) => ns(r.doneUs)),
        promptTokens: side.rows.map((r) => r.promptTokens),
        outputTokens: side.rows.map((r) => r.outputTokens),
        status: side.rows.map(() => 0),
      }
      const text = JSON.stringify(log)
      bundle.receipt.artifacts.push({ id: 'bench-log-b', kind: 'bench-log', format: 'enginespace/bench-log@1', sha256: sha256(text), bytes: text.length, inBundle: true })
      bundle.artifacts['bench-log-b'] = { encoding: 'json', data: log }
      setClaim(bundle, 'bench-log-b', other)
    })
  },
}

const smallerModel: Forgery = {
  id: 'smaller-model',
  title: 'a trace faster than its physics floor, with a smaller model typed in',
  from: 'trace',
  fails: { rule: 9, check: 'P1' },
  bound: /The receipt lists the model input "[^"]+" with 1,000,000 bytes \(sha256 [0-9a-f]{8}…\), and \S+ pins "[^"]+" with [\d,]+ bytes/,
  forge: (honest) => {
    // The trace of the too-fast forgery, which breaks the honest floor; then the receipt's figure for the weights is made one million bytes, so that a floor made from the
    // receipt's own inputs is 59 ns [derived: 1,000,000 bytes × 80% ÷ 13,400 GB/s] and every step clears it.
    return edited(tooFast.forge(honest), (bundle) => {
      for (const input of bundle.receipt.inputs) if (input.kind === 'model') input.bytes = 1_000_000
    })
  },
}

const emptyEvidence: Forgery = {
  id: 'empty-evidence',
  title: 'evidence left out and its entry left in: an acceptance artifact with no round',
  from: 'counts',
  fails: { rule: 7, check: 'acceptance-counts' },
  bound: /The artifact "acceptance" holds no round of speculation, so there is nothing to count/,
  forge: (honest) =>
    edited(honest, (bundle) => {
      const entry = bundle.receipt.artifacts.find((artifact) => artifact.kind === 'counts')
      if (entry === undefined) throw new Error(`${honest.name} carries no counts`)
      const data = bundle.artifacts[entry.id]
      if (data.encoding !== 'json') throw new Error('counts are JSON')
      // The four columns of the rounds are emptied, and the entry, the schema tag and the grader's own pass are left as they were: a re-signed file.
      for (const column of Object.values((data.data as { rounds: Record<string, number[]> }).rounds)) column.length = 0
    }),
}

/** Every forgery: the nine of ASSESSMENT §13 in the order it lists them, then the two that the review of W2's grader track added, and the one that the second review added. */
export const BESTIARY: readonly Forgery[] = [editedP99, resignedHash, reusedToken, replayedReceipt, closedLoop, tooFast, unknownGrader, notAPartition, otherSeed, smallerModel, emptyEvidence, fasterGpuTyped]

/** The forgeries that an honest fixture can be forged into: those that read the kind of evidence it carries. */
export function forgeriesFor(fixture: Fixture): readonly Forgery[] {
  const kinds = new Set(fixture.bundle.receipt.artifacts.map((artifact) => artifact.kind))
  const carries = { bench: kinds.has('bench-log'), trace: kinds.has('trace'), counts: kinds.has('counts') } as const
  return BESTIARY.filter((forgery) => carries[forgery.from])
}

/** Reads a committed bundle back: the owner's fixtures of tests/fixtures/receipts/ are `.es.json.gz`, as `enginespace grade` writes them (W2-T12). */
export function readBundleFile(bytes: Uint8Array): Fixture['bundle'] {
  return JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as Fixture['bundle']
}
