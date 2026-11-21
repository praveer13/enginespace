/*
 * Which receipts can be defended (ASSESSMENT §7.2, "Defend your receipt"): the stages whose bundle holds an artifact that a lab's question set reads,
 * by stage, with the lab whose set it is. Every lab of lane L and F gets its set here when its questions are written; a stage that is not here has
 * no questions, and its receipt's page says nothing of them.
 *
 * This table is all that the receipt's page and the lab's page carry. The sets themselves (sets.ts), the reading of the bundle and the step's own
 * page are a chunk that loads when a receipt that can be defended is opened (Defend.tsx). tests/receipts/defend.test.ts holds the two lists together.
 */

/** The stages that can be defended, and the lab whose question set asks about each. */
export const DEFEND_STAGES: Readonly<Record<string, string>> = {
  'tr0.forward.s2': 'tr0.forward',
  'tr0.forward.s3': 'tr0.forward',
}

/** Whether a receipt of this stage can be defended. */
export const canDefend = (stage: string): boolean => Object.hasOwn(DEFEND_STAGES, stage)

/** The ledger ref a defence of this lab writes: `prove:<lab>` (packages/schema/refs.ts). */
export const defendRef = (lab: string): string => `prove:${lab}`
