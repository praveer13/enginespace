/*
 * The families' code, loaded when an item is drawn (ARCHITECTURE §8.2, D-059). A page plans with the families' faces
 * (packages/play/items/catalog.ts): Today composes its prep from them, and a lesson's item block shows its waiting ticket from one. The
 * code that makes, bands and grades an item is a chunk of its own for each family, loaded here when Today prints a ticket or an item
 * block starts an attempt, so a page carries no family it does not draw from, and the module page, which draws from none, carries none.
 *
 * Each loader names its family's file and export. tests/items/catalog.test.ts holds this table to the registry: one loader for each
 * family, and each one loads the family the registry has.
 */
import { use } from 'react'
import type { Gen } from '@es/play/items/types'

const LOADERS: Readonly<Record<string, () => Promise<Gen>>> = {
  'tr0.find-the-sync': () => import('@es/play/items/families/tr0/find-the-sync').then((family) => family.findTheSync),
  'tr0.grid-cover': () => import('@es/play/items/families/tr0/grid-cover').then((family) => family.gridCover),
  'tr0.strides-of': () => import('@es/play/items/families/tr0/strides-of').then((family) => family.stridesOf),
  'tr0.view-or-copy': () => import('@es/play/items/families/tr0/view-or-copy').then((family) => family.viewOrCopy),
  'tr1.request-state': () => import('@es/play/items/families/tr1/request-state').then((family) => family.requestState),
  'tr1.step-budget': () => import('@es/play/items/families/tr1/step-budget').then((family) => family.stepBudget),
  'tr1.what-moved': () => import('@es/play/items/families/tr1/what-moved').then((family) => family.whatMoved),
  'tr1.where-does-it-run': () => import('@es/play/items/families/tr1/where-does-it-run').then((family) => family.whereDoesItRun),
  'tr1.which-mechanism': () => import('@es/play/items/families/tr1/which-mechanism').then((family) => family.whichMechanism),
  'tr2.bubble-width': () => import('@es/play/items/families/tr2/bubble-width').then((family) => family.bubbleWidth),
  'tr2.default-budget': () => import('@es/play/items/families/tr2/default-budget').then((family) => family.defaultBudget),
  'tr2.dispatch-key': () => import('@es/play/items/families/tr2/dispatch-key').then((family) => family.dispatchKey),
  'tr2.graph-hit': () => import('@es/play/items/families/tr2/graph-hit').then((family) => family.graphHit),
  'tr2.kv-after-graphs': () => import('@es/play/items/families/tr2/kv-after-graphs').then((family) => family.kvAfterGraphs),
  'tr2.padding-waste': () => import('@es/play/items/families/tr2/padding-waste').then((family) => family.paddingWaste),
  'tr2.preempt-victim': () => import('@es/play/items/families/tr2/preempt-victim').then((family) => family.preemptVictim),
  'tr2.runner-fallback': () => import('@es/play/items/families/tr2/runner-fallback').then((family) => family.runnerFallback),
  'tr2.step-order': () => import('@es/play/items/families/tr2/step-order').then((family) => family.stepOrder),
  'tr3.capture-window': () => import('@es/play/items/families/tr3/capture-window').then((family) => family.captureWindow),
  'tr3.flat-curve': () => import('@es/play/items/families/tr3/flat-curve').then((family) => family.flatCurve),
  'tr3.floor': () => import('@es/play/items/families/tr3/floor').then((family) => family.floor),
  'tr3.gap-cause': () => import('@es/play/items/families/tr3/gap-cause').then((family) => family.gapCause),
  'tr3.inside-a-graph': () => import('@es/play/items/families/tr3/inside-a-graph').then((family) => family.insideAGraph),
  'tr3.launch-and-kernel': () => import('@es/play/items/families/tr3/launch-and-kernel').then((family) => family.launchAndKernel),
  'tr3.provider-preflight': () => import('@es/play/items/families/tr3/provider-preflight').then((family) => family.providerPreflight),
  'tr3.which-category': () => import('@es/play/items/families/tr3/which-category').then((family) => family.whichCategory),
  'tr5a.blocks-held': () => import('@es/play/items/families/tr5a/blocks-held').then((family) => family.blocksHeld),
  'tr5a.hit-length': () => import('@es/play/items/families/tr5a/hit-length').then((family) => family.hitLength),
  'tr5a.pages-for-adapter': () => import('@es/play/items/families/tr5a/pages-for-adapter').then((family) => family.pagesForAdapter),
  'tr5a.slots-vs-pages': () => import('@es/play/items/families/tr5a/slots-vs-pages').then((family) => family.slotsVsPages),
  'tr6.exactness-test': () => import('@es/play/items/families/tr6/exactness-test').then((family) => family.exactnessTest),
  'tr6.mask-fits': () => import('@es/play/items/families/tr6/mask-fits').then((family) => family.maskFits),
  'tr6.mask-phases': () => import('@es/play/items/families/tr6/mask-phases').then((family) => family.maskPhases),
  'tr6.verify-shape': () => import('@es/play/items/families/tr6/verify-shape').then((family) => family.verifyShape),
  'tr6.which-runner': () => import('@es/play/items/families/tr6/which-runner').then((family) => family.whichRunner),
  'tr8.goodput-denominator': () => import('@es/play/items/families/tr8/goodput-denominator').then((family) => family.goodputDenominator),
  'tr8.littles-law': () => import('@es/play/items/families/tr8/littles-law').then((family) => family.littlesLaw),
  'tr8.which-flag': () => import('@es/play/items/families/tr8/which-flag').then((family) => family.whichFlag),
}

/** The ids that have a loader, in the table's order. */
export const LOADED_FAMILIES: readonly string[] = Object.keys(LOADERS)

const loads = new Map<string, Promise<Gen>>()

/**
 * The code of the family called `id`: one load per family, shared by everyone who asks, and forgotten if it fails, so the next ask tries
 * again. An id with no loader is a rejection, never a throw.
 */
export function loadFamily(id: string): Promise<Gen> {
  const known = loads.get(id)
  if (known !== undefined) return known
  const loader = Object.hasOwn(LOADERS, id) ? LOADERS[id] : undefined
  const load = loader === undefined ? Promise.reject(new Error(`no item family "${id}" has a loader in src/items/families.ts`)) : loader()
  loads.set(id, load)
  load.catch(() => {
    if (loads.get(id) === load) loads.delete(id)
  })
  return load
}

/**
 * The family called `id`, for a component under a Suspense boundary: from `families` when a test gives them, at once, or loaded, and the
 * component suspends until it is. The boundary shows its loading state meanwhile, and an error boundary a load that failed.
 */
export function useFamily(id: string, families?: readonly Gen[]): Gen {
  if (families !== undefined) {
    const given = families.find((family) => family.id === id)
    if (given === undefined) throw new Error(`no item family "${id}" among the families given`)
    return given
  }
  return use(loadFamily(id))
}
