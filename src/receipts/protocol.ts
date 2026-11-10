/*
 * The messages between the page and receipt.worker (ARCHITECTURE §8.5, §12), and the time a check may take. Types and constants only, so the
 * page, the worker and the tests all import this and nothing here runs.
 *
 * A receipt bundle is untrusted input (A§12): it is parsed in a worker, size-capped and schema-checked there, and rendered only as text. The
 * worker is a thin one. It runs `verifyBundle` of packages/verify on the file it is handed and answers with the outcome, which is plain data. It
 * reads no ledger and no clock and fetches nothing: the page gives it the learner's challenges, the grader builds the site published, the pins
 * and the moment, and keeps what comes back.
 *
 *   ready     the worker has loaded and takes a request
 *   verify    one file, and the context to check it in; the file is a Blob, which the worker streams and never reads whole
 *   verified  the outcome: `refused` for a file that is not a receipt, `checked` for a receipt that was read whole
 *   failed    the check itself broke (not the file): the message is shown to the learner as text
 */
import type { Outcome, VerifyContext } from '@es/verify'

export type ReceiptRequest = { type: 'verify'; id: number; file: Blob; context: VerifyContext }

export type ReceiptReply =
  | { type: 'ready' }
  | { type: 'verified'; id: number; outcome: Outcome }
  | { type: 'failed'; id: number; message: string }

/**
 * How long the page waits for a check [estimated]. A bundle at its caps is read, parsed and hashed in a few seconds on a laptop; a file that
 * keeps the worker busy for longer than this is stopped, and the learner is told. The worker is the page's own and the file is the learner's.
 */
export const CHECK_BUDGET_MS = 120_000

/** Runs the check on a file: the receipt worker in the browser, and a stand-in in a test. */
export type Verifier = (file: Blob, context: VerifyContext) => Promise<Outcome>
