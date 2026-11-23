/*
 * What a defence is worth (ASSESSMENT §3.2, §7.2, §7.3), worked out from the ledger when the step opens and again when an attempt ends.
 *
 *   standing   whether the receipt can be defended for credit. It can when this browser verified it: its newest report's verdict, made again with the site's
 *              data as it stands (credit.ts, packages/verify reread.ts), is `gpu-verified`, or `assisted` (every check passed and the learner declared help with
 *              the code: a proved defence is how assisted work is shown to be understood, §3.2). A receipt that is not verified, or that is synthetic (it says
 *              so in `ext.synthetic`, or its grader build is one that writes only synthetic fixtures), shows the questions as practice and records nothing.
 *   stake      the 24-hour window of Prove mode (src/prove/window.ts), read from the lab's `prove` events: an attempt counts when no attempt that counted lies in
 *              the 24 hours before it. Inside the window an attempt on a verified receipt is recorded as practice.
 *   draft      the `prove` event of one attempt: `prove:<lab>`, its score and whether every answer was right, `proved` when it counted and `practice` when it
 *              did not, the seed it was drawn on, and in its data the answers, the keys, the attestation and the receipt's hash.
 */
import type { Draft, Json, VerificationReport } from '@es/ledger'
import type { Receipt } from '@es/schema/receipt'
import { markDefence, type DefendQuestion, type Marked } from '@es/sim/defend/tr0'
import { readStoredReport, verdictOfStored } from '@es/verify'
import type { PublishedGrader, SiteData } from '@es/verify'
import { stakeAt, type ProveStake } from '@/prove/window'
import { isSynthetic, SITE_DATA } from '../credit'
import { latestReport } from '../records'
import { defendRef } from './registry'

export type Standing = { readonly kind: 'verified' } | { readonly kind: 'practice'; readonly why: 'synthetic' | 'unverified' }

export { isSynthetic }

/** Whether a defence of this receipt can count, from its newest report. */
export function standingOf(receipt: Receipt, reports: readonly VerificationReport[], options: { graders?: readonly PublishedGrader[]; site?: SiteData } = {}): Standing {
  if (isSynthetic(receipt, options.graders)) return { kind: 'practice', why: 'synthetic' }
  const newest = latestReport(reports)
  const read = newest === undefined ? null : readStoredReport(newest.report)
  if (read === null) return { kind: 'practice', why: 'unverified' }
  const { provenance } = verdictOfStored(receipt, read, options.site ?? SITE_DATA)
  return provenance === 'gpu-verified' || provenance === 'assisted' ? { kind: 'verified' } : { kind: 'practice', why: 'unverified' }
}

export interface Attempt {
  readonly lab: string
  readonly receiptSha256: string
  readonly seed: number
  readonly questions: readonly DefendQuestion[]
  readonly answers: readonly (readonly number[] | null)[]
  readonly marked: Marked
  /** Whether the attempt counted: no attempt that counted lies in the 24 hours before it. */
  readonly counts: boolean
}

/** The `prove` event of an attempt on a verified receipt. An attempt on a receipt that is not verified writes nothing, and has no draft. */
export function proveDraft(attempt: Attempt): Draft<'prove'> {
  const { questions, answers } = attempt
  return {
    kind: 'prove',
    ref: defendRef(attempt.lab),
    score: attempt.marked.score,
    ok: attempt.marked.ok,
    provenance: attempt.counts ? 'proved' : 'practice',
    seed: attempt.seed,
    data: {
      predicted: questions.map((question, at): Json => ({ id: question.id, answer: answers[at] === null || answers[at] === undefined ? null : [...(answers[at] ?? [])] })),
      actual: questions.map((question): Json => ({ id: question.id, key: [...question.key] })),
      agentClosed: true,
      receiptSha256: attempt.receiptSha256,
    },
  }
}

/** What one attempt comes to, once its answers are in: its marks, whether it counted, and the event to write, or none. */
export interface Settled {
  readonly marked: Marked
  readonly counted: boolean
  readonly draft: Draft<'prove'> | null
}

/**
 * Settles an attempt made at `at`: marks the answers, and on a verified receipt makes its `prove` event, `proved` when no attempt that counted lies in the
 * 24 hours before it and `practice` otherwise. On a receipt that is not verified, or is synthetic, nothing is written: the attempt is practice and earns
 * nothing. `stake` is the window as the page knows it (null before the ledger is read, which is taken as no attempt that counted).
 */
export function settle(
  standing: Standing,
  stake: ProveStake | null,
  at: number,
  attempt: Omit<Attempt, 'marked' | 'counts'>,
): Settled {
  const marked = markDefence(attempt.questions, attempt.answers)
  if (standing.kind !== 'verified') return { marked, counted: false, draft: null }
  const counted = stakeAt(stake ?? { counts: true, last: null, opensAt: null }, at).counts
  return { marked, counted, draft: proveDraft({ ...attempt, marked, counts: counted }) }
}
