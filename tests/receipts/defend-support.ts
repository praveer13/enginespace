/*
 * The bundles that the tests of "Defend your receipt" bring back (tests/receipts/defend.test.ts, e2e/receipts-import.spec.ts). Each is built here, at test time,
 * from the grader's own recording of the reference solution on a two-layer Qwen3 with random weights (labs/grader/tests/synthetic/tr0-forward/stage{2,3}.json):
 * its checks and its five points. No learner, no machine and no pinned model made any of it, and each receipt's notes say so. Nothing here is written under
 * tests/fixtures/receipts/.
 *
 * Two kinds, both labelled in their notes:
 *   - `site: true` (the default) names the grader build this site publishes and lists the pinned model's three files among its inputs, as the site's stage
 *     declarations ask, so the site's own rules verify it: stage 3 is `gpu-verified` with no reference bank, and stage 2 is `gpu-unverified` until the
 *     course's bank is in. It is what an honest learner's receipt looks like to the browser, and it stands in for one.
 *   - `synthetic: true` also says so in `ext.synthetic`, as tests/verify/synthetic.ts's receipts do; a defence of it is practice and records nothing.
 * `points` replaces the recorded points, for a test of two runs that recorded different ones.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import type { Bundle } from '@es/schema/bundle'
import { formatChallenge } from '@es/schema/challenge'
import type { Receipt } from '@es/schema/receipt'
import { canonicalJson } from '../../packages/sim/core/json'
import { PUBLISHED_GRADERS } from '../../src/receipts/graders'
import { STAGE_DECLARATIONS } from '../../src/receipts/declared'
import { sampleReceipt } from '../schema/receipt-support'

export type ForwardStage = 'tr0.forward.s2' | 'tr0.forward.s3'

interface Recorded {
  readonly inputs: Receipt['inputs']
  readonly checks: Receipt['checks']
  readonly artifacts: readonly { id: string; kind: Receipt['artifacts'][number]['kind']; format: string; data: unknown }[]
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')

function recorded(stage: ForwardStage): Recorded {
  const file = path.join(import.meta.dirname, `../../labs/grader/tests/synthetic/tr0-forward/stage${stage.slice(-1)}.json`)
  return JSON.parse(readFileSync(file, 'utf8')) as Recorded
}

/** The recorded points of a stage's synthetic run, as the artifact holds them. */
export function recordedPoints(stage: ForwardStage): { schema: string; stage: string; call: string; points: unknown[] } {
  const artifact = recorded(stage).artifacts.find((entry) => entry.format === 'enginespace/tr0-points@1')
  if (artifact === undefined) throw new Error(`stage ${stage} recorded no points`)
  return structuredClone(artifact.data) as { schema: string; stage: string; call: string; points: unknown[] }
}

export interface ForwardOptions {
  readonly site?: boolean
  readonly synthetic?: boolean
  /** The seed of the receipt's challenge: two bundles of one stage need two challenges. */
  readonly seed?: number
  readonly points?: unknown[]
}

/** A bundle of a forward-pass stage, with its hashes right. */
export function forwardBundle(stage: ForwardStage, options: ForwardOptions = {}): Bundle {
  const { site = true, synthetic = false, seed = stage === 'tr0.forward.s3' ? 0x3c0ffee3 : 0x2c0ffee2 } = options
  const run = recorded(stage)
  const receipt = structuredClone(sampleReceipt())
  const parts = { stage, seed, nonce: 'ABCDEFGHJKLMNPQR', issuedOn: '20261108' }
  receipt.lab = 'tr0.forward'
  receipt.stage = stage
  receipt.challenge = { token: formatChallenge(parts), seed, nonce: parts.nonce, issuedOn: parts.issuedOn }
  if (site) receipt.grader = { name: 'enginespace-grader', version: PUBLISHED_GRADERS[0].version, sourceSha256: PUBLISHED_GRADERS[0].sourceSha256 }
  receipt.environment = {
    host: { kind: 'local', os: 'Example Linux 1.0', kernel: '6.0.0-example', arch: 'x86_64', cpu: 'Example CPU', cores: 8, ramBytes: 17_179_869_184, container: false },
    gpus: [],
    python: '3.12.12',
    torch: { version: '2.14.0+cpu' },
    libs: [{ name: 'transformers', version: '5.19.0' }],
    envVars: {},
  }
  const model = (STAGE_DECLARATIONS[stage]?.model ?? []).map((file) => ({ name: file.name, kind: 'model' as const, sha256: file.sha256, bytes: file.bytes }))
  const prompts = run.inputs.filter((input) => input.kind !== 'model')
  receipt.inputs = site ? [...model, ...prompts] : structuredClone(run.inputs)
  receipt.checks = structuredClone(run.checks)
  delete receipt.performance
  const artifacts: Bundle['artifacts'] = {}
  receipt.artifacts = run.artifacts.map((artifact) => {
    const data = artifact.format === 'enginespace/tr0-points@1' && options.points !== undefined ? { ...(artifact.data as object), points: options.points } : structuredClone(artifact.data)
    artifacts[artifact.id] = { encoding: 'json', data: data as object }
    const text = canonicalJson(data)
    return { id: artifact.id, kind: artifact.kind, format: artifact.format, sha256: sha256(text), bytes: Buffer.byteLength(text), inBundle: true }
  })
  receipt.notes = "A synthetic receipt made by tests/receipts/defend-support.ts from the grader's recording on a random-weight model. No learner and no machine made it, and it is no run of the pinned model."
  receipt.ext = synthetic ? { synthetic: true } : { example: true }
  return { schema: 'enginespace/bundle@1', receipt, artifacts }
}

/** The file a learner would drop: the bundle as JSON, gzipped. */
export const gzipped = (bundle: unknown): Buffer => gzipSync(JSON.stringify(bundle))

/** The SHA-256 of a receipt as the site knows it: of its canonical JSON. */
export const receiptShaOf = (receipt: Receipt): string => sha256(canonicalJson(receipt))
