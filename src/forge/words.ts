/*
 * What the forge page says about a run, in words (ARCHITECTURE §8.3). Pure, so that a test reads the sentence a learner reads.
 */

import type { Recorded } from './useForge'

/**
 * What a finished run came to in the ledger, in a sentence. `passed` says whether every check passed: a red run is written too, as
 * "check failed, retry" and not as a miss, and the sentence says that it takes nothing away (ASSESSMENT §4.6).
 */
export function recordedSentence(recorded: Recorded, lab: string, passed = true): string {
  switch (recorded.kind) {
    case 'none':
      return recorded.why === 'reference'
        ? `${lab}@reference: no credit. A reference build is shown and never recorded.`
        : recorded.why === 'replay'
          ? 'Not recorded: these are seeds you have seen already. Run on new seeds to earn.'
          : 'Not recorded: not every check ran.'
    case 'pending':
      return 'Writing this run to your ledger.'
    case 'saved':
      if (!passed) return 'Written to your ledger as "check failed, retry": it takes nothing away, and a run on new seeds is the next try.'
      return recorded.durable ? 'Written to your ledger on this device: the module, the seeds and each check.' : 'Written to your ledger; the browser has not confirmed that it is saved yet.'
    case 'failed':
      return `Not recorded: ${recorded.detail}`
  }
}
