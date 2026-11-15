/**
 * The pure model's answers to the lessons' predictions, loaded when one is revealed (W1b-T02; ARCHITECTURE §4.3, §7.2).
 *
 * A prediction is graded against what the model computes from a run of the game block that follows it, and the reading brings the
 * game's world with it: Back of House's lifecycle model, Service's cost cards, The Reach-In's hybrid KV model. So a module's readings
 * are a part of their own (`tr1.ts`, `tr2.ts`, `tr5a.ts`), loaded by the module a prediction belongs to, and a lesson page loads none of
 * them until a learner has committed an answer and played the level. Which predictions have a reading at all is `plan.ts`, which a page
 * reads without any of this.
 */
import type { Reference } from './types'

export type { Reference, Truth } from './types'

/** The module of each lazy part, by the module id that begins a prediction's id. TR6 and TR8 have no reading: every prediction of theirs waits (plan.ts). */
const PARTS: Readonly<Record<string, () => Promise<{ readonly REFERENCES: Readonly<Record<string, Reference>> }>>> = {
  tr1: () => import('./tr1'),
  tr2: () => import('./tr2'),
  tr5a: () => import('./tr5a'),
}

/** The reading for a prediction id (`tr2.l5.p1`), or undefined for one that has none. Only own names count: `constructor` is not a module. */
export async function referenceFor(id: string): Promise<Reference | undefined> {
  const module = id.slice(0, Math.max(0, id.indexOf('.')))
  if (!Object.hasOwn(PARTS, module)) return undefined
  const { REFERENCES } = await PARTS[module]()
  return Object.hasOwn(REFERENCES, id) ? REFERENCES[id] : undefined
}

/** The modules whose readings this build has, for the test that holds them to the plan. */
export const MODULES_WITH_READINGS: readonly string[] = Object.keys(PARTS)
