import type { LedgerEvent, PlayEvent } from '@es/ledger/types'

/**
 * Whether an event is a run the learner played to its end: a `play` event that was not left before its end (`data.left`, W2b-T78). A run
 * that was left is a miss in the export and credits nothing, and it is not a Run done, a level played or a best.
 */
export const ranToEnd = (event: LedgerEvent): event is PlayEvent => event.kind === 'play' && event.data?.left === undefined
