/*
 * W1b-T07: what the app's sources of the ref-to-KC map know (src/progress/sources.ts). The map and the module pages named KCs for a game
 * run alone. They now name them for an item, through the families' faces (packages/play/items/catalog.ts), and for a lab check, through
 * the graded labs' tables (packages/sim/forge/check-kcs.ts), and they carry only that data: a family's code loads when an item is drawn,
 * and a lab's oracle is no part of either page (D-059, D-023's 200 KB gate).
 */
import { describe, expect, test } from 'bun:test'
import { CATALOG } from '@es/play/items/catalog'
import { itemRef } from '@es/play/items/types'
import { LAB_CHECK_KCS } from '@es/sim/forge/kcs'
import { appKcsOfRef } from '@/items/today/kcs'
import { kcsOfRef } from '@/progress/kcmap'
import { appSources } from '@/progress/sources'
import { checkBoundaries } from '../../scripts/verify-boundaries.ts'
import { root } from '../ci/support'

const sources = appSources({ refs: {} })

describe('an item names the KCs of its variant, as Today reads them', () => {
  test('for every variant of every family that the catalog has', () => {
    expect(CATALOG.length).toBeGreaterThan(0)
    for (const face of CATALOG) {
      for (const variant of face.variants) expect(sources.variant(face.id, variant.id), `${face.id}/${variant.id}`).toEqual(variant.kcs)
    }
  })

  test('and the map and Today read the same KCs from the ref of an item, so that what Today schedules is what the map shows', () => {
    for (const face of CATALOG) {
      for (const variant of face.variants) expect(kcsOfRef(itemRef(face.id, variant.id), sources), `${face.id}/${variant.id}`).toEqual(appKcsOfRef(itemRef(face.id, variant.id)))
    }
  })

  test("and not the family's, which is the union of its variants': a variant that assesses one KC earns one", () => {
    const face = CATALOG.find((candidate) => candidate.id === 'tr2.bubble-width')
    expect(face?.kcs).toEqual(['tr2.bubble', 'tr2.async-overlap'])
    expect(sources.variant('tr2.bubble-width', 'async-off')).toEqual(['tr2.bubble'])
    expect(sources.variant('tr2.bubble-width', 'async-on')).toEqual(['tr2.async-overlap'])
    expect(sources.variant('tr2.bubble-width', 'close-it')).toEqual(['tr2.bubble', 'tr2.async-overlap'])
  })

  test('none for a family or a variant that this build does not have, nor for the names an object has', () => {
    expect(sources.variant('tr2.dispatch-key', 'any')).toEqual([])
    expect(sources.variant('tr2.bubble-width', 'no-such-variant')).toEqual([])
    for (const name of ['constructor', '__proto__', 'toString', '']) {
      expect(sources.variant(name, 'async-off'), name).toEqual([])
      expect(sources.variant('tr2.bubble-width', name), name).toEqual([])
    }
  })
})

describe("a lab names the KCs of its checks, from the graded labs' tables", () => {
  test('for every graded lab: the KCs of its checks together, each once', () => {
    for (const [lab, row] of Object.entries(LAB_CHECK_KCS)) {
      const all = Object.values(row.kcs).flat()
      expect(all.length, `${lab} assesses a KC`).toBeGreaterThan(0)
      expect(new Set(sources.lab(lab)), lab).toEqual(new Set(all))
      expect(sources.lab(lab).length, `${lab} names a KC twice`).toBe(new Set(all).size)
    }
  })

  test('none for a lab that is not graded in the browser, nor for the names an object has', () => {
    for (const lab of ['toy', 'tr8.replay', 'constructor', '__proto__', '']) expect(sources.lab(lab), lab).toEqual([])
  })
})

describe('the map and the module pages carry the data and not what it describes', () => {
  // `verify:bundle` holds both pages to their gate, and a family's code or the labs' oracles would take them over it, as the first wiring
  // of the labs through LAB_CHECK_KCS did (src/progress/sources.ts has the figures). This reads the same static imports the build bundles,
  // so that the break shows before a build.
  const { reachable } = checkBoundaries(root, ['src/progress/sources.ts'])

  test('what sources.ts imports statically includes the catalog and the labs\' tables', () => {
    expect(reachable).toContain('packages/play/items/catalog.ts')
    expect(reachable).toContain('packages/sim/forge/check-kcs.ts')
  })

  test('and no family, no registry of families, no lab and none of the models that a lab\'s oracle judges with', () => {
    const heavy = reachable.filter(
      (file) =>
        file.startsWith('packages/play/items/families/') ||
        file === 'packages/play/items/registry.ts' ||
        file === 'packages/play/items/index.ts' ||
        (file.startsWith('packages/sim/forge/') && file !== 'packages/sim/forge/check-kcs.ts') ||
        file.startsWith('packages/sim/kv/') ||
        file.startsWith('packages/sim/spec/'),
    )
    expect(heavy, 'these reach the map and the module pages through src/progress/sources.ts: import the catalog and check-kcs.ts alone').toEqual([])
  })
})
