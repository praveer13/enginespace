/**
 * The families the site draws from (ARCHITECTURE §8.2). A lesson's `item` block names one by id, Today draws from the ones that
 * teach a KC that is due, and `verify:items` holds every one of them to its gates. A family is added here, in module order, by the
 * task that builds it; `verify:kc` reads this folder for the families that assess each KC.
 */
import { requestState } from './families/tr1/request-state'
import { stepBudget } from './families/tr1/step-budget'
import { whatMoved } from './families/tr1/what-moved'
import { whereDoesItRun } from './families/tr1/where-does-it-run'
import { whichMechanism } from './families/tr1/which-mechanism'
import { bubbleWidth } from './families/tr2/bubble-width'
import { defaultBudget } from './families/tr2/default-budget'
import { dispatchKey } from './families/tr2/dispatch-key'
import { graphHit } from './families/tr2/graph-hit'
import { kvAfterGraphs } from './families/tr2/kv-after-graphs'
import { paddingWaste } from './families/tr2/padding-waste'
import { preemptVictim } from './families/tr2/preempt-victim'
import { runnerFallback } from './families/tr2/runner-fallback'
import { stepOrder } from './families/tr2/step-order'
import { blocksHeld } from './families/tr5a/blocks-held'
import { hitLength } from './families/tr5a/hit-length'
import { pagesForAdapter } from './families/tr5a/pages-for-adapter'
import { slotsVsPages } from './families/tr5a/slots-vs-pages'
import { exactnessTest } from './families/tr6/exactness-test'
import { maskFits } from './families/tr6/mask-fits'
import { maskPhases } from './families/tr6/mask-phases'
import { verifyShape } from './families/tr6/verify-shape'
import { whichRunner } from './families/tr6/which-runner'
import { goodputDenominator } from './families/tr8/goodput-denominator'
import { littlesLaw } from './families/tr8/littles-law'
import { whichFlag } from './families/tr8/which-flag'
import type { Gen } from './types'

/** Every family, in module order and, within a module, in the order of its files (the order in which `verify:items` reads them). */
export const FAMILIES: readonly Gen[] = [
  requestState,
  stepBudget,
  whatMoved,
  whereDoesItRun,
  whichMechanism,
  bubbleWidth,
  defaultBudget,
  dispatchKey,
  graphHit,
  kvAfterGraphs,
  paddingWaste,
  preemptVictim,
  runnerFallback,
  stepOrder,
  blocksHeld,
  hitLength,
  pagesForAdapter,
  slotsVsPages,
  exactnessTest,
  maskFits,
  maskPhases,
  verifyShape,
  whichRunner,
  goodputDenominator,
  littlesLaw,
  whichFlag,
]

const BY_ID: ReadonlyMap<string, Gen> = new Map(FAMILIES.map((family) => [family.id, family]))

/** The family called `id`, or undefined for an id this build has no generator for (a lesson may name one that a later task builds). */
export function familyById(id: string, families: readonly Gen[] = FAMILIES): Gen | undefined {
  return families === FAMILIES ? BY_ID.get(id) : families.find((family) => family.id === id)
}

/** The families that assess `kc`, in registry order. */
export function familiesForKc(kc: string, families: readonly Gen[] = FAMILIES): readonly Gen[] {
  return families.filter((family) => family.kcs.includes(kc))
}
