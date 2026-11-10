/*
 * Bringing a receipt back (ARCHITECTURE §8.4, §8.5; W2-T07, W2-T08): one file in, checked by rules 1 to 9 in the receipt worker, and, if it is a receipt
 * that was read whole, kept in the learner's ledger.
 *
 *   refused   Rule 1, 2 or 3 stopped the file: it is over a cap, or damaged, or not a bundle, or an artifact is not the one the receipt lists. It is
 *             not a receipt this browser can read. Nothing is written and no token is spent, so the learner can fix the file, or run the stage again.
 *   kept      The receipt was read whole. Its record (the parsed receipt and the report of this check) and its event are written in one transaction,
 *             and the event spends the token it was bound to. It is kept with its reasons even when rule 4, 5 or 6 failed: ASSESSMENT §3.2 lists a
 *             broken binding, an unknown grader and an off-pin run among the receipts that are `gpu-unverified`, "shown with its reasons, never
 *             credited". A receipt that is checked again, a re-import of the same file, adds a report and no second event.
 *   failed    The check itself broke (the worker did not answer in time, or could not start), or the ledger would not take what was checked. Nothing
 *             was kept, and the message says why.
 *
 * Everything the check touches comes in through `ImportEnv`: the worker that runs the rules, the ledger's write, what the ledger holds, the clock,
 * the published graders and the pins. The page passes the real ones, and a test passes stand-ins. Nothing is sent anywhere (I1).
 */
import type { LedgerEvent, ReceiptRecord } from '@es/ledger'
import type { Atlas, Banks, Outcome, PinTable, PublishedGrader, RuleResult, StageDeclarations, Verdict } from '@es/verify'
import type { KeepInput, KeepResult } from '@/evidence/engine'
import { ATLAS } from './atlas'
import { challengeBook } from './book'
import { BANKS, STAGE_DECLARATIONS } from './declared'
import { PUBLISHED_GRADERS } from './graders'
import { hasEventFor, receiptDraft, receiptRecord } from './keep'
import { ENGINE_PINS } from './pins'
import type { Verifier } from './protocol'

/** The file's name and size as the page shows them: both are the learner's, and the name is printed as text. */
export interface FileFacts {
  name: string
  bytes: number
}

export type ImportResult =
  | { step: 'refused'; file: FileFacts; rules: readonly RuleResult[] }
  | {
      step: 'kept'
      file: FileFacts
      rules: readonly RuleResult[]
      /** The receipt's identity, and the fragment of its page. */
      sha256: string
      verdict: Verdict
      /** The grader's version, which the badge of an attested check names. */
      grader: string
      /** The ledger held this receipt already: this check added its report, and no event. */
      recheck: boolean
    }
  | { step: 'failed'; file: FileFacts; message: string; rules?: readonly RuleResult[] }

export interface ImportEnv {
  /** Runs rules 1 to 9 on the file, and works out rule 10: the receipt worker in the browser. */
  verify: Verifier
  /** Writes a checked receipt: `keepReceipt` of the ledger. */
  keep(input: KeepInput): Promise<KeepResult>
  /** What the ledger holds as the file is dropped: its challenges bind the receipt, and its receipts say whether this one is kept already. */
  ledger: { events: readonly LedgerEvent[]; receipts: readonly ReceiptRecord[] }
  /** The moment, in milliseconds. */
  now(): number
  /** True once the page that asked has gone: a check that finishes then keeps nothing, as a forge run that outlives its page writes nothing. */
  cancelled?(): boolean
  graders?: readonly PublishedGrader[]
  pins?: PinTable
  /** The hardware atlas of rule 9, the workload each stage declares for rule 8, and the reference banks of rule 7. The site's own unless a test gives others. */
  atlas?: Atlas
  stages?: StageDeclarations
  banks?: Banks
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export async function importReceipt(file: File, env: ImportEnv): Promise<ImportResult> {
  const facts: FileFacts = { name: file.name, bytes: file.size }
  const nowMs = env.now()
  let outcome: Outcome
  try {
    outcome = await env.verify(file, {
      book: challengeBook(env.ledger.events, nowMs),
      nowMs,
      graders: env.graders ?? PUBLISHED_GRADERS,
      pins: env.pins ?? ENGINE_PINS,
      atlas: env.atlas ?? ATLAS,
      stages: env.stages ?? STAGE_DECLARATIONS,
      banks: env.banks ?? BANKS,
    })
  } catch (error) {
    return { step: 'failed', file: facts, message: messageOf(error) }
  }
  if (outcome.kind === 'refused') return { step: 'refused', file: facts, rules: outcome.rules }
  if (env.cancelled?.() === true) return { step: 'failed', file: facts, message: 'The page was closed before the check finished, so nothing was kept.', rules: outcome.rules }

  const held = env.ledger.receipts.some((record) => record.sha256 === outcome.receiptSha256)
  const recheck = held || hasEventFor(env.ledger.events, outcome.receiptSha256)
  const record = receiptRecord(outcome, new Date(nowMs).toISOString())
  const event = hasEventFor(env.ledger.events, outcome.receiptSha256) ? undefined : receiptDraft(outcome)
  let kept: KeepResult
  try {
    kept = await env.keep({ record, ...(event === undefined ? {} : { event }) })
  } catch (error) {
    return { step: 'failed', file: facts, rules: outcome.rules, message: messageOf(error) }
  }
  if (!kept.ok) return { step: 'failed', file: facts, rules: outcome.rules, message: kept.detail }
  return { step: 'kept', file: facts, rules: outcome.rules, sha256: outcome.receiptSha256, verdict: outcome.verdict, grader: outcome.receipt.grader.version, recheck }
}
