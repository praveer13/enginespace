/*
 * What a forge run writes to the ledger (ARCHITECTURE §7.2, ASSESSMENT §4.5): one `lab-check` event for a run on fresh seeds, with the
 * module's SHA-256, the seeds and each check's result. The ledger stamps the id, the time and the device, and stores the provenance and
 * never a weight (A§7.3).
 *
 *   a reference build      nothing: it is shown and earns nothing (`<lab>@reference`)
 *   a replay               nothing: the seeds were seen already, and a replay is for finding the bug and not for earning
 *   a run limited by `only`  nothing: it is not the whole lab
 *   a run on fresh seeds   `unseen`: ok when every check passed, and the score is the share that did. A red run is written too, as
 *                          "check failed, retry" and not as a miss (ASSESSMENT §4.6); it earns nothing, because `ok` is false
 */

import type { Draft } from '@es/ledger'
import type { LabRun } from './invoke'

/** Whether a run is written down at all. */
export function isRecordable(run: LabRun): boolean {
  return !run.reference && run.seeds === 'fresh' && run.complete && run.checks.length > 0
}

/** The event that records a run, or null when the run is not recorded. */
export function labCheckDraft(run: LabRun): Draft<'lab-check'> | null {
  if (!isRecordable(run)) return null
  const passed = run.checks.filter((check) => check.status === 'pass').length
  return {
    kind: 'lab-check',
    ref: `lab:${run.lab}`,
    score: passed / run.checks.length,
    ok: passed === run.checks.length,
    provenance: 'unseen',
    data: {
      wasmSha256: run.wasmSha256,
      seeds: run.checks.flatMap((check) => (check.seed === undefined ? [] : [check.seed])),
      checks: run.checks.map((check) => ({ id: check.id, status: check.status, ...(check.seed === undefined ? {} : { seed: check.seed }) })),
    },
  }
}
