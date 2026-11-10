/*
 * Helpers for the tests of /receipts (W2-T06): entropy from a seed, a ledger written one valid event at a time, and a stored receipt.
 *
 * The events are made with `stampEvent`, the function the app writes with, so an event that broke the codec throws here, where the bug
 * is. Time is whatever instant the test gives, in the zone 0, so the day of an event is the day of its instant.
 */
import { stampEvent } from '@es/ledger'
import type { ChallengeEvent, Draft, LedgerEvent, ReceiptEvent, ReceiptRecord, Sha256 } from '@es/ledger'
import { parseChallenge } from '@es/schema/challenge'
import { issueChallenge } from '@/receipts/challenge'
import type { Entropy } from '@/receipts/challenge'
import { rngFor } from '../../packages/sim/core/rng'
import { sampleReceipt, sha256 } from '../schema/receipt-support'

export { sampleReceipt, sha256 }

/** Entropy that a seed names: the same seed gives the same words every time. */
export function entropyOf(seed: number): Entropy {
  const rng = rngFor(seed, 'tests/receipts/entropy')
  return (count) => Uint32Array.from({ length: count }, () => rng())
}

/** Entropy that gives these words, in this order, and then zeros. */
export const wordsOf =
  (...words: number[]): Entropy =>
  (count) =>
    Uint32Array.from({ length: count }, (_, at) => words[at] ?? 0)

export const DEV = 'dev-receipts'

/** A ledger that grows one event at a time. */
export class Ledger {
  readonly events: LedgerEvent[] = []
  private count = 0

  /** Writes a draft at the instant given, in the zone given (minutes east of UTC, 0 unless asked). */
  write<K extends LedgerEvent['kind']>(at: string, draft: Draft<K> & { kind: K }, tz = 0): LedgerEvent {
    this.count += 1
    const event = stampEvent<K>({ clock: { nowIso: () => at, tzOffsetMinutes: () => tz }, newId: () => `ev-${String(this.count).padStart(4, '0')}`, dev: DEV }, draft)
    this.events.push(event)
    return event
  }

  /** A challenge for a stage, made the way the page makes it, written at `at`. */
  challenge(at: string, stage = 'tr8.replay.s2', seed = 1, tz = 0): ChallengeEvent {
    const issued = issueChallenge(stage, at, tz, entropyOf(seed))
    return this.write(at, issued.draft, tz) as ChallengeEvent
  }

  /** A challenge event for a token that was made elsewhere, such as the sample receipt's, written at `at`. */
  challengeFor(at: string, token: string, tz = 0): ChallengeEvent {
    const parts = parseChallenge(token)
    if (parts === null) throw new Error(`not a challenge token: ${token}`)
    return this.write(at, { kind: 'challenge', ref: `challenge:${parts.stage}`, data: { token, seed: parts.seed, nonce: parts.nonce, issuedOn: parts.issuedOn } }, tz) as ChallengeEvent
  }

  /** A receipt event for a token, written at `at`. */
  receipt(at: string, token: string, receiptSha256: Sha256 = sha256('a receipt')): ReceiptEvent {
    const stage = /^es1:([^:]+):/.exec(token)?.[1] ?? 'tr8.replay.s2'
    return this.write(at, {
      kind: 'receipt',
      ref: `receipt:${stage}`,
      score: 1,
      ok: true,
      provenance: 'gpu-verified',
      data: { receiptSha256, challenge: token, checks: [{ id: 'agreement', verdict: 'attested' }], graderVersion: '0.1.0', environment: 'one GPU, one engine at the pin' },
    }) as ReceiptEvent
  }
}

/** A value as the store keeps it: JSON, by a round trip through text. A parsed value is JSON by construction. */
export const asJson = (value: object): ReceiptRecord['receipt'] => JSON.parse(JSON.stringify(value)) as ReceiptRecord['receipt']

/** The record the receipts store keeps for the synthetic sample receipt (tests/schema/receipt-support.ts): no machine ran it. */
export function sampleRecord(change?: (receipt: ReturnType<typeof sampleReceipt>) => void): ReceiptRecord {
  const receipt = sampleReceipt()
  change?.(receipt)
  return { sha256: sha256(JSON.stringify(receipt)), receipt: asJson(receipt), reports: [] }
}
