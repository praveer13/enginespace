/**
 * The pure model's answers to the lessons' predictions, loaded when one is revealed (W1b-T02; ARCHITECTURE §4.3, §7.2).
 *
 * A prediction is graded against what the model computes from a run of the game block that follows it, and the reading brings the
 * game's world with it: Request path's lifecycle model, the Step loop's cost cards, KV page pool's hybrid KV model, Tensor views' tensor
 * model. So a module's readings are a part of their own (`tr0.ts`, `tr1.ts`, `tr2.ts`, `tr5a.ts`), loaded by the module a prediction belongs
 * to, and a lesson page loads none of them until a learner has committed an answer and played the level. Which predictions have a reading at all is `plan.ts`, which a page
 * reads without any of this.
 *
 * A prediction revealed at commit (D-067) has no run to read: its answer is the model on the question's own numbers, or a claim's, and it
 * lives in a part of its own (`commit-tr1.ts` and the rest), loaded when the learner commits it.
 */
import type { Commit, Reference } from './types'

export type { Commit, Reference, Source, Truth } from './types'

/** The module of each lazy part of readings, by the module id that begins a prediction's id. TR6 and TR8 have none: no run of their games answers a prediction (plan.ts). */
const PARTS: Readonly<Record<string, () => Promise<{ readonly REFERENCES: Readonly<Record<string, Reference>> }>>> = {
  tr0: () => import('./tr0'),
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

/** The module of each lazy part of at-commit answers. */
const COMMIT_PARTS: Readonly<Record<string, () => Promise<{ readonly COMMITS: Readonly<Record<string, Commit>> }>>> = {
  tr0: () => import('./commit-tr0'),
  tr1: () => import('./commit-tr1'),
  tr2: () => import('./commit-tr2'),
  tr5a: () => import('./commit-tr5a'),
  tr6: () => import('./commit-tr6'),
  tr8: () => import('./commit-tr8'),
}

/** The answer of a prediction that is revealed at commit, or undefined for one that is not. Only own names count. */
export async function commitFor(id: string): Promise<Commit | undefined> {
  const module = id.slice(0, Math.max(0, id.indexOf('.')))
  if (!Object.hasOwn(COMMIT_PARTS, module)) return undefined
  const { COMMITS } = await COMMIT_PARTS[module]()
  return Object.hasOwn(COMMITS, id) ? COMMITS[id] : undefined
}

/** The modules whose at-commit answers this build has. */
export const MODULES_WITH_COMMITS: readonly string[] = Object.keys(COMMIT_PARTS)
