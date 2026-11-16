/*
 * What the site declares for the checks of rules 7 and 8 that need more than a receipt holds (ARCHITECTURE §8.5; W2-T08): for each stage, the workload
 * that its challenge draws, and the reference banks that the owner records. Both are compiled into the site, and the worker fetches nothing (A§12).
 *
 * Both are empty, and on purpose, like the list of published graders (src/receipts/graders.ts). A stage's workload is a design of its lab: the
 * arrivals, the lengths and the objectives that the grader's client draws from the challenge's seed, which the browser draws again to bind the run to
 * its challenge (B1). The lab declares it here when it lands: TR8's BurstGPT window with W2-T36, the profile's step count with W2-T23, and so on.
 * A bank is the owner's recording (W2-T17 for TR0's argmax ids). Until a stage has its entry, the checks that need it fail for a receipt of that
 * stage and say what is missing, so that no receipt is credited on a schedule or a bank that nobody declared.
 *
 * A stage's declaration holds what a check needs of the site and a receipt cannot be trusted to say of itself (StageDeclaration, packages/verify/checks.ts):
 *   bench, steps, tokensPerSeqStep   the workload its challenge draws, the number of step windows, and the tokens a sequence may emit in a step (B1, T6, P3);
 *   model, gpus, maxNumSeqs          what the physics floors are made from (P1, P3): the files of the model the stage serves, by hash and size, which the receipt's model
 *                                    inputs have to be exactly; how many GPUs its engine spans, of the ones the fingerprint lists; and the most sequences its engine
 *                                    runs at once. A floor made from the receipt's own figures is one that a smaller number typed into it defeats (the review of
 *                                    W2's grader track), so a stage with no `model` fails P1 and P3, and one with no `maxNumSeqs` fails P3, and a stage that
 *                                    declares no `gpus` is held to one.
 * The lab that lands with a stage adds its entry here, with the pin of its model and the command that its kit runs the engine with; the owner's fixtures (W2-T12) check it.
 */
import type { Banks, StageDeclarations } from '@es/verify'

/** The workload each stage's challenge draws, by stage id. */
export const STAGE_DECLARATIONS: StageDeclarations = {}

/** The reference banks, by stage id. */
export const BANKS: Banks = {}
