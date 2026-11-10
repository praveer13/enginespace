/*
 * What the site declares for the checks of rules 7 and 8 that need more than a receipt holds (ARCHITECTURE §8.5; W2-T08): for each stage, the workload
 * that its challenge draws, and the reference banks that the owner records. Both are compiled into the site, and the worker fetches nothing (A§12).
 *
 * Both are empty, and on purpose, like the list of published graders (src/receipts/graders.ts). A stage's workload is a design of its lab: the
 * arrivals, the lengths and the objectives that the grader's client draws from the challenge's seed, which the browser draws again to bind the run to
 * its challenge (B1). The lab declares it here when it lands: TR8's BurstGPT window with W2-T36, the profile's step count with W2-T23, and so on.
 * A bank is the owner's recording (W2-T17 for TR0's argmax ids). Until a stage has its entry, the checks that need it fail for a receipt of that
 * stage and say what is missing, so that no receipt is credited on a schedule or a bank that nobody declared.
 */
import type { Banks, StageDeclarations } from '@es/verify'

/** The workload each stage's challenge draws, by stage id. */
export const STAGE_DECLARATIONS: StageDeclarations = {}

/** The reference banks, by stage id. */
export const BANKS: Banks = {}
