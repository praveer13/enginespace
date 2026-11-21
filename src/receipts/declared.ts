/*
 * What the site declares for the checks of rules 7 and 8 that need more than a receipt holds (ARCHITECTURE §8.5; W2-T08): for each stage, the workload
 * that its challenge draws, and the reference banks that the owner records. Both are compiled into the site, and the worker fetches nothing (A§12).
 *
 * The banks are empty, and on purpose, like the list of published graders (src/receipts/graders.ts); the stages hold TR0's three, which declare the model and nothing else (below). A stage's workload is a design of its lab: the
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

/**
 * Qwen3-0.6B at the revision the course pins (labs/references/manifest.json, the entries that list `tr0.forward`; course.lock.json, key `qwen3-0.6b`), as the three
 * files a TR0 receipt lists among its inputs: by hash and size, in the manifest's own words. The hashes are [unverified] until the weights job (labs.yml, dispatched by the
 * owner) has fetched the files and hashed them against these, as the manifest's notes say; tests/receipts/declared.test.ts holds this table to the manifest, so the two cannot part.
 */
const QWEN3_0_6B = [
  { name: 'Qwen3-0.6B config.json', sha256: '660db3b73d788119c04535e48cf9be5f55bc3100841a718637ae695b442f27dd', bytes: 726 },
  { name: 'Qwen3-0.6B tokenizer.json', sha256: 'aeb13307a71acd8fe81861d94ad54ab689df773318809eed3cbe794b4492dae4', bytes: 11_422_654 },
  { name: 'Qwen3-0.6B model.safetensors', sha256: 'f47f71177f32bcd101b7573ec9171e6a57f4f4d31148d38e382306f42996874b', bytes: 1_503_300_328 },
] as const

/**
 * The workload each stage's challenge draws, by stage id. TR0's three stages draw no workload of their own: the grader draws their prompts from the challenge's seed (stages 1 and 3) or
 * from a fixed pool (stage 2, so that the owner's bank covers the same positions for every challenge), and the browser does not draw them again. What each declares is the model, which
 * the receipt's model inputs are, and no GPU: the lab runs on the CPU, so there is no floor to make and none of `gpus`, `maxNumSeqs` or `steps` applies.
 */
export const STAGE_DECLARATIONS: StageDeclarations = {
  'tr0.forward.s1': { model: QWEN3_0_6B },
  'tr0.forward.s2': { model: QWEN3_0_6B },
  'tr0.forward.s3': { model: QWEN3_0_6B },
}

/** The reference banks, by stage id. */
export const BANKS: Banks = {}
