/**
 * The ids of the checks that rules 7 to 9 make (ARCHITECTURE §8.5; W2-T08), in the order they run, as plain lists.
 *
 * They are here and not beside the checks because the verdict needs them (verdict.ts tells a check that is missing from a stored report from one that this
 * version has no name for), and the verdict is read by the receipts page on the main thread, which must not carry the rules that recompute a log or a trace:
 * those are the receipt worker's. Each module of checks builds its own registry and a test holds it to the list here, so the two cannot part.
 */

/** Rule 7's re-checks (rechecks.ts), and `claims-backed`, that every claim of a performance run names an artifact the receipt carries. */
export const RECHECK_IDS: readonly string[] = ['identity-tally', 'acceptance-counts', 'argmax-bank', 'claims-backed']

/** Rule 8, for a stage that asks for evidence at all (evidence-check.ts): that the receipt carries a log with a measured row or a trace with a step window. */
export const EVIDENCE_CHECK_IDS: readonly string[] = ['evidence']

/** Rule 8, for a benchmark log (bench.ts). B11 is pending (stages.ts), and B13 is P3. */
export const BENCH_CHECK_IDS: readonly string[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12', 'B14']

/** Rule 8, for a trace (trace.ts): T1 to T8, the cross-check X4, and T10, the pair. T9 is P1. */
export const TRACE_CHECK_IDS: readonly string[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'X4', 'T10']

/** Rule 9 (floors.ts). */
export const FLOOR_CHECK_IDS: readonly string[] = ['P1', 'P3']

/** Every id of a check that rules 7 to 9 have, in the order they run. */
export const CHECK_IDS: readonly string[] = [...RECHECK_IDS, ...EVIDENCE_CHECK_IDS, ...BENCH_CHECK_IDS, ...TRACE_CHECK_IDS, ...FLOOR_CHECK_IDS]
