/*
 * Honest synthetic bundles for the tests of rules 7 to 10 (W2-T08), until the owner's GPU fixtures exist (W2-T12). No machine produced any of it: every
 * value is made by the simulator (packages/sim) on the S5 card of "70B on H100 at tensor parallel 4", the machine is called nothing in particular, the
 * grader is no published build (it is a fixtures build, and the context publishes it as one), the traces say they are synthetic, and the receipts' notes
 * say so.
 *
 * Three bundles, because three kinds of evidence are recomputed or re-checked:
 *   - `replayFixture()`: a stage `tr8.replay.s2`, with an open-loop benchmark log of 1,264 requests that the coarse server of §5.6 answered, the summary
 *     the grader would claim for it, and the grader's teacher-forced check. Every check the stage asks for is built, so it is `gpu-verified`.
 *   - `traceFixture()`: a stage `tr3.profile.s5`, which asks only that whatever the receipt captured is consistent, with a trace of a step-loop run, the
 *     attribution the grader would claim for each step window, and nothing else. It is `practice`, which is what that stage earns.
 *   - `proposerFixture()`: a stage `tr6.proposer.s1`, which asks of the browser one thing, that the counts of a speculative proposer's rounds follow
 *     their rules (accepted never above proposed, tokens out = accepted + bonus), and of the grader that its tie-aware identity held. It carries the
 *     counts of 200 rounds that a seeded generator drew, and the grader's check; it is `gpu-verified`, and it is the fixture that an artifact with no round
 *     in it is forged from.
 *
 * The bundle is the same object a test changes (`changed`) and puts its hashes right again after (`resigned`), and the context is the one in which it
 * passes. Both are built once and cloned, because a run of the simulator is cheap and a thousand of them are not.
 */
import { formatChallenge } from '@es/schema/challenge'
import type { Bundle } from '@es/schema/bundle'
import type { Receipt } from '@es/schema/receipt'
import { sha256 } from '../schema/receipt-support'
import { runBench, planBench, s5Server, summarizeRows } from '../../packages/sim/bench'
import type { BenchSpec } from '../../packages/sim/bench'
import { canonicalJson } from '../../packages/sim/core/json'
import { chance, rngFor } from '../../packages/sim/core/rng'
import { HOST_PRESETS } from '../../packages/sim/host'
import { defaultCaptureSizes, runStepLoop, s5Card } from '../../packages/sim/steploop'
import { attributeSteps, traceFromJson, traceFromRun, traceToJson } from '../../packages/sim/trace'
import { genWorkload } from '../../packages/sim/workload'
import { ATLAS } from '@/receipts/atlas'
import { ACCEPTANCE_FORMAT, BENCH_LOG_FORMAT, TRACE_FORMAT, warmupRows } from '@es/verify'
import type { PublishedGrader, VerifyContext } from '@es/verify'
import { bookedFor, NOW, resigned, VLLM_PIN } from './support'
import { sampleReceipt } from '../schema/receipt-support'

/** A grader build that only writes synthetic fixtures. It is published by the context of these tests and by no site. */
export const FIXTURES_GRADER: PublishedGrader = { version: '0.0.0', sourceSha256: sha256('enginespace-grader synthetic fixtures: not a published build'), synthetic: true }

export const GPU_NAME = 'NVIDIA H100 80GB HBM3'
const GPUS = 4
/** The weights of the 70B model in 8 bits, in bytes: S5's row for it is "70B on H100", and a floor is made from these. */
export const MODEL_BYTES = 70_000_000_000
const SEC = 1_000_000

/** The two bundles' tokens' seeds. */
export const REPLAY_SEED = 0x1234abcd
export const TRACE_SEED = 0x2468ace0

/**
 * The model that the stages of these fixtures serve, as the site pins it for the floors (StageDeclaration.model): the file of the receipt's model input, by its
 * hash and size. The receipt's own figure is never what a floor is made from.
 */
export const MODEL_PIN = [{ name: 'Example/model-70B-fp8', sha256: sha256('example model'), bytes: MODEL_BYTES }] as const

/** What a stage of these fixtures declares for the floors besides its workload: the model, the four GPUs it runs on, and the most sequences its engine runs at once. */
export const SERVING = { model: MODEL_PIN, gpus: GPUS, maxNumSeqs: 64 } as const

/** The workload that the replay stage's challenge draws, which the context declares for `tr8.replay.s2` (a synthetic stand-in for TR8's BurstGPT window, W2-T36). */
export const REPLAY_SPEC: BenchSpec = {
  arrivals: { kind: 'poisson', ratePerSMilli: 8000 },
  lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 128, hi: 512 }, output: { kind: 'uniform', lo: 64, hi: 192 } },
  requests: 5000,
  warmupUs: 0,
  durationUs: Math.ceil((1300 / 8) * SEC),
  slo: { ttftUs: 2_000_000, tpotUs: 80_000 },
}

export interface Fixture {
  readonly name: string
  readonly stage: string
  /** What an honest receipt of the stage comes to. */
  readonly provenance: 'gpu-verified' | 'practice'
  readonly bundle: Bundle
  readonly context: VerifyContext
}

const sample = (): Receipt => structuredClone(sampleReceipt())

/** The machine every fixture ran on: four H100s, vLLM at the pin, 64 sequences. Invented, and the receipt says so. */
function machine(receipt: Receipt): void {
  const gpu = { ...receipt.environment.gpus[0], name: GPU_NAME, memoryBytes: 85_899_345_920, computeCapability: '9.0', smCount: 132, maxSmClockMhz: 1980, maxMemClockMhz: 2619, powerLimitMw: 700_000 }
  receipt.environment = {
    ...receipt.environment,
    gpus: Array.from({ length: GPUS }, () => ({ ...gpu })),
    engineConfig: { runner: 'MRV2', graphMode: 'FULL_AND_PIECEWISE', asyncScheduling: true, attentionBackend: 'FLASH_ATTN', maxNumBatchedTokens: 8192, maxNumSeqs: 64 },
  }
  receipt.inputs = [
    { name: 'Example/model-70B-fp8', kind: 'model', revision: '0123456789abcdef0123456789abcdef01234567', sha256: sha256('example model'), bytes: MODEL_BYTES },
    { name: 'prompts', kind: 'prompts', sha256: sha256('example prompts'), bytes: 4096 },
  ]
  receipt.notes = 'A synthetic receipt made by tests/verify/synthetic.ts from packages/sim. No machine ran it.'
  receipt.ext = { synthetic: true }
}

function challenge(receipt: Receipt, stage: string, seed: number): void {
  const parts = { stage, seed, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261108' }
  receipt.stage = stage
  receipt.lab = stage.slice(0, stage.lastIndexOf('.'))
  receipt.challenge = { token: formatChallenge(parts), seed, nonce: parts.nonce, issuedOn: parts.issuedOn }
  receipt.grader = { name: 'enginespace-grader', version: FIXTURES_GRADER.version, sourceSha256: FIXTURES_GRADER.sourceSha256 }
}

const entryOf = (id: string, kind: Receipt['artifacts'][number]['kind'], format: string, data: unknown): Receipt['artifacts'][number] => {
  const text = canonicalJson(data)
  return { id, kind, format, sha256: sha256(text), bytes: Buffer.byteLength(text), inBundle: true }
}

/** The context in which a fixture passes every rule: its challenge in the book, its grader published, its engine on the pin, the real atlas, and its stage declared. */
export function contextOf(bundle: Bundle, stages: VerifyContext['stages'] = {}): VerifyContext {
  return { book: [bookedFor(bundle.receipt)], nowMs: NOW, graders: [FIXTURES_GRADER], pins: [VLLM_PIN], atlas: ATLAS, stages, banks: {} }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The replay                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The log of an open-loop run of `spec` under `seed`, as the artifact the grader would write: ns, in columns. */
export function benchLogOf(run: ReturnType<typeof runBench>, cacheResetNs = -60_000_000_000): object {
  const column = (pick: (row: (typeof run.rows)[number]) => number): number[] => run.rows.map(pick)
  const ns = (us: number): number => us * 1000
  return {
    schema: BENCH_LOG_FORMAT,
    cacheResetNs,
    rows: {
      id: column((r) => r.id),
      dueNs: column((r) => ns(r.dueUs)),
      sentNs: column((r) => ns(r.sentUs)),
      firstNs: column((r) => ns(r.firstUs)),
      doneNs: column((r) => ns(r.doneUs)),
      promptTokens: column((r) => r.promptTokens),
      outputTokens: column((r) => r.outputTokens),
      status: column(() => 0),
    },
  }
}

/** The summary the grader would claim for a log: the same arithmetic as the browser's, from the same rows, with the warm-up the stage declares. */
export function claimedSummary(run: ReturnType<typeof runBench>, spec: BenchSpec, seed: number): Record<string, unknown> {
  const plan = planBench(seed, spec)
  const warmupUs = plan.reqs[warmupRows(64)].dueUs ?? 0
  return JSON.parse(JSON.stringify(summarizeRows(run.rows, { warmupUs, durationUs: spec.durationUs, slo: spec.slo }, { bootstrap: 1000, seed })))
}

function buildReplay(): Fixture {
  const run = runBench(REPLAY_SEED, REPLAY_SPEC, s5Server('h100-vllm-0-10-2-fp8', 4))
  const log = benchLogOf(run)
  const receipt = sample()
  machine(receipt)
  challenge(receipt, 'tr8.replay.s2', REPLAY_SEED)
  receipt.artifacts = [entryOf('bench-log', 'bench-log', BENCH_LOG_FORMAT, log)]
  receipt.checks = [{ id: 'teacher-forced', kind: 'correctness', pass: true, value: 0.995, bound: 0.99, n: 200, detail: 'teacher-forced agreement on a sample of 200 outputs', refSha256: sha256('example bank') }]
  receipt.performance = { kind: 'bench', claimed: { 'bench-log': claimedSummary(run, REPLAY_SPEC, REPLAY_SEED) } }
  const bundle: Bundle = { schema: 'enginespace/bundle@1', receipt, artifacts: { 'bench-log': { encoding: 'json', data: log } } }
  return { name: 'replay', stage: 'tr8.replay.s2', provenance: 'gpu-verified', bundle, context: contextOf(bundle, { 'tr8.replay.s2': { bench: REPLAY_SPEC, ...SERVING } }) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The trace                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A trace of a step-loop run on the S5 card, with the names and the capture time that T1 asks for, and without async scheduling so that the CPU leaves gaps to attribute. */
export function syntheticTrace(seed: number): ReturnType<typeof traceToJson> {
  const cfg = { maxNumSeqs: 64, maxBatchedTokens: 8192, chunkedPrefill: true, inputIds: 'device' as const, asyncScheduling: false, graphs: { mode: 'FULL' as const, captureSizes: defaultCaptureSizes(64) } }
  const workload = genWorkload(seed, { requests: 6, arrivals: { kind: 'burst', atUs: 0 }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 128, hi: 256 }, output: { kind: 'uniform', lo: 6, hi: 14 } } })
  const run = runStepLoop(workload, cfg, HOST_PRESETS.mrv2.card, s5Card('h100-vllm-0-10-2-fp8', 4, 'in-gpu'), { horizonUs: 600_000_000_000 })
  const json = traceToJson(traceFromRun(run, seed))
  return { ...json, meta: { ...json.meta, engine: 'vllm', version: '0.33.0', gpu: GPU_NAME, capturedAt: '2026-11-08T10:00:00Z' } }
}

/** The attribution the grader would claim for a trace: its recomputed windows, as the claimed rows of T7. */
export function claimedWindows(trace: ReturnType<typeof traceToJson>): { windows: Record<string, number>[] } {
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

function buildTrace(): Fixture {
  const trace = syntheticTrace(TRACE_SEED)
  const windows = trace.marks.length - 1
  const receipt = sample()
  machine(receipt)
  challenge(receipt, 'tr3.profile.s5', TRACE_SEED)
  receipt.artifacts = [entryOf('trace', 'trace', TRACE_FORMAT, trace)]
  receipt.checks = []
  receipt.performance = { kind: 'trace', claimed: { trace: claimedWindows(trace) } }
  const bundle: Bundle = { schema: 'enginespace/bundle@1', receipt, artifacts: { trace: { encoding: 'json', data: trace } } }
  return { name: 'trace', stage: 'tr3.profile.s5', provenance: 'practice', bundle, context: contextOf(bundle, { 'tr3.profile.s5': { steps: { salt: 'trace/steps', lo: windows, hi: windows }, ...SERVING } }) }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The proposer                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

export const PROPOSER_SEED = 0x13572468
const PROPOSER_ROUNDS = 200
const PROPOSER_DRAFTS = 4

/**
 * The counts of `rounds` rounds of a proposer that drafts `drafts` tokens a round and has each accepted with a chance of 7 in 10 until the first that is not,
 * as the grader would write them (`enginespace/acceptance@1`): the round emits its accepted drafts and one more token, so a round's tokens out are its accepted plus 1.
 */
export function acceptanceOf(seed: number, rounds: number = PROPOSER_ROUNDS, drafts: number = PROPOSER_DRAFTS): { schema: string; rounds: Record<'proposed' | 'accepted' | 'bonus' | 'emitted', number[]> } {
  const rng = rngFor(seed, 'proposer/rounds')
  const counts: Record<'proposed' | 'accepted' | 'bonus' | 'emitted', number[]> = { proposed: [], accepted: [], bonus: [], emitted: [] }
  for (let i = 0; i < rounds; i += 1) {
    let accepted = 0
    while (accepted < drafts && chance(rng, 700)) accepted += 1
    counts.proposed.push(drafts)
    counts.accepted.push(accepted)
    counts.bonus.push(1)
    counts.emitted.push(accepted + 1)
  }
  return { schema: ACCEPTANCE_FORMAT, rounds: counts }
}

function buildProposer(): Fixture {
  const counts = acceptanceOf(PROPOSER_SEED)
  const receipt = sample()
  machine(receipt)
  challenge(receipt, 'tr6.proposer.s1', PROPOSER_SEED)
  receipt.artifacts = [entryOf('acceptance', 'counts', ACCEPTANCE_FORMAT, counts)]
  receipt.checks = [{ id: 'tie-aware-identity', kind: 'correctness', pass: true, value: 200, bound: 200, n: 200, detail: 'synthetic: 200 of 200 sequences identical to the plain run' }]
  receipt.performance = undefined
  const bundle: Bundle = { schema: 'enginespace/bundle@1', receipt, artifacts: { acceptance: { encoding: 'json', data: counts } } }
  return { name: 'proposer', stage: 'tr6.proposer.s1', provenance: 'gpu-verified', bundle, context: contextOf(bundle, {}) }
}

let replay: Fixture | undefined
let trace: Fixture | undefined
let proposer: Fixture | undefined

/** A fresh copy of the honest replay: change it freely. */
export function replayFixture(): Fixture {
  replay ??= buildReplay()
  return { ...replay, bundle: structuredClone(replay.bundle) }
}

/** A fresh copy of the honest trace bundle: change it freely. */
export function traceFixture(): Fixture {
  trace ??= buildTrace()
  return { ...trace, bundle: structuredClone(trace.bundle) }
}

/** A fresh copy of the honest proposer bundle: change it freely. */
export function proposerFixture(): Fixture {
  proposer ??= buildProposer()
  return { ...proposer, bundle: structuredClone(proposer.bundle) }
}

/** A fixture after `change` and its hashes put right: a forger who re-signs what they edited. The context follows the receipt, since its token may have changed. */
export function edited(fixture: Fixture, change: (bundle: Bundle) => void): Fixture {
  const bundle = structuredClone(fixture.bundle)
  change(bundle)
  resigned(bundle)
  return { ...fixture, bundle, context: { ...fixture.context, book: [bookedFor(bundle.receipt)] } }
}
