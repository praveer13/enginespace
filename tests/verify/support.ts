/*
 * What the tests of packages/verify share (W2-T07): an honest synthetic bundle and the context that makes it pass rules 1 to 6, a way to
 * change the bundle and put its hashes right again, and a way to turn a bundle into the file a learner would drop.
 *
 * The bundle is the synthetic sample of tests/schema/receipt-support.ts: no machine ran it, every value is invented, and its notes say so. Its
 * grader is not a published build of anything, so the context publishes it for the tests that need a known grader and leaves it out of the
 * ones that need an unknown one.
 */
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import type { Bundle } from '@es/schema/bundle'
import type { Receipt } from '@es/schema/receipt'
import type { BookedChallenge, EnginePin, PublishedGrader, VerifyContext } from '@es/verify'
import { canonicalJson } from '../../packages/sim/core/json'
import { sampleBundle } from '../schema/receipt-support'

export { sampleBundle }

/** The moment of every check in these tests, and the day before it, when the sample's challenge was issued. */
export const NOW = Date.parse('2026-11-09T12:00:00.000Z')
export const ISSUED = '2026-11-08T12:00:00.000Z'
export const DAY = 86_400_000

export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex')

/** The file a learner would drop: the bundle as JSON, gzipped. */
export const fileOf = (bundle: unknown): Blob => new Blob([new Uint8Array(gzipSync(JSON.stringify(bundle)))])

/** The SHA-256 of a receipt as the site knows it: of its canonical JSON. */
export const receiptSha = (receipt: Receipt): string => sha256(canonicalJson(receipt))

/** The grader build that the sample receipt names, published by this site, for a test that needs a known one. */
export function publishedGraderOf(bundle: Bundle = sampleBundle()): PublishedGrader {
  return { version: bundle.receipt.grader.version, sourceSha256: bundle.receipt.grader.sourceSha256 }
}

/** The pin that the sample receipt's engine is on. */
export const VLLM_PIN: EnginePin = { name: 'vllm', version: '0.33.0', commit: '4ba787ec9959e566d3b587a796dff07673324da5' }

/** The challenge that this ledger issued for the receipt's token, a day before `NOW` and unspent. */
export function bookedFor(receipt: Receipt, over: Partial<BookedChallenge> = {}): BookedChallenge {
  const { token, seed, nonce, issuedOn } = receipt.challenge
  return { token, stage: receipt.stage, seed, nonce, issuedOn, at: ISSUED, ...over }
}

/** A context in which the sample bundle passes every rule: its challenge is in the book, its grader is published and its engine is on the pin. */
export function contextFor(bundle: Bundle = sampleBundle(), over: Partial<VerifyContext> = {}): VerifyContext {
  return { book: [bookedFor(bundle.receipt)], nowMs: NOW, graders: [publishedGraderOf(bundle)], pins: [VLLM_PIN], ...over }
}

/** The sample bundle after `change`, which edits it in place. Its hashes are not put right: a test of integrity wants the damage. */
export function changed(change: (bundle: Bundle) => void): Bundle {
  const bundle = structuredClone(sampleBundle())
  change(bundle)
  return bundle
}

/** The bytes an artifact is hashed over, for a test that edits one and keeps the receipt honest. */
function canonicalBytesOf(artifact: Bundle['artifacts'][string]): Uint8Array {
  if (artifact.encoding === 'json') return Buffer.from(canonicalJson(artifact.data), 'utf8')
  if (artifact.encoding === 'text') return Buffer.from(artifact.data, 'utf8')
  return Buffer.from(artifact.data, 'base64')
}

/** Puts the receipt's entry for every artifact that travels right again, after a test has changed an artifact's data: a re-signed bundle. */
export function resigned(bundle: Bundle): Bundle {
  for (const entry of bundle.receipt.artifacts) {
    if (!entry.inBundle) continue
    const bytes = canonicalBytesOf(bundle.artifacts[entry.id])
    entry.sha256 = sha256(bytes)
    entry.bytes = bytes.length
  }
  return bundle
}
