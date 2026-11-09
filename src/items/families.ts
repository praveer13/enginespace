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
  'tr1.request-state': () => import('@es/play/items/families/tr1/request-state').then((family) => family.requestState),
  'tr1.step-budget': () => import('@es/play/items/families/tr1/step-budget').then((family) => family.stepBudget),
  'tr1.what-moved': () => import('@es/play/items/families/tr1/what-moved').then((family) => family.whatMoved),
  'tr1.where-does-it-run': () => import('@es/play/items/families/tr1/where-does-it-run').then((family) => family.whereDoesItRun),
  'tr1.which-mechanism': () => import('@es/play/items/families/tr1/which-mechanism').then((family) => family.whichMechanism),
  'tr2.bubble-width': () => import('@es/play/items/families/tr2/bubble-width').then((family) => family.bubbleWidth),
  'tr2.graph-hit': () => import('@es/play/items/families/tr2/graph-hit').then((family) => family.graphHit),
  'tr2.padding-waste': () => import('@es/play/items/families/tr2/padding-waste').then((family) => family.paddingWaste),
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
