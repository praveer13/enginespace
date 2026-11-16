import type { VerifierView } from '@es/play/verifier/types'

/** The axis every row of a view shares: the tallest bar, rounded up to a multiple of eight, so that two rows' bars compare by height. */
export const axisOf = (view: VerifierView): number => Math.max(8, Math.ceil(Math.max(...view.rows.flatMap((row) => [...row.p, ...(row.q ?? [])])) / 8) * 8)
