/*
 * D-059: a page plans with the families' faces (packages/play/items/catalog.ts) and loads a family's code when it draws one of its items
 * (src/items/families.ts). Both lists are written out by hand, so this holds them to the registry, which verify:items and verify:kc read:
 * a face for every family, field for field and in the registry's order, and a loader for every family that loads the registry's own.
 */
import { describe, expect, test } from 'bun:test'
import { CATALOG, faceById } from '@es/play/items/catalog'
import { FAMILIES, familyById } from '@es/play/items/registry'
import type { Gen, GenFace } from '@es/play/items/types'
import { bubbleWidth } from '@es/play/items/families/tr2/bubble-width'
import { LOADED_FAMILIES, loadFamily, useFamily } from '@/items/families'

const faceOf = (gen: Gen): GenFace => ({ id: gen.id, version: gen.version, title: gen.title, kcs: gen.kcs, variants: gen.variants })

/** The line to add to catalog.ts for a family it does not have. */
const faceSource = (gen: Gen): string => JSON.stringify(faceOf(gen))

describe('the catalog of faces', () => {
  test('has the face of every family of the registry, in its order, and nothing else', () => {
    const missing = FAMILIES.filter((gen) => faceById(gen.id) === undefined)
    expect(missing.map(faceSource), 'add these faces to packages/play/items/catalog.ts, in the order of registry.ts').toEqual([])
    expect(CATALOG.map((face) => face.id)).toEqual(FAMILIES.map((gen) => gen.id))
  })

  test("is each family's own id, version, title, KCs and variants, field for field", () => {
    for (const gen of FAMILIES) expect(faceById(gen.id), `${gen.id}: catalog.ts holds an old face; it is ${faceSource(gen)}`).toEqual(faceOf(gen))
  })

  test('is data alone: no face carries the code that makes or grades an item', () => {
    for (const face of CATALOG) {
      expect(Object.keys(face).sort()).toEqual(['id', 'kcs', 'title', 'variants', 'version'])
      for (const variant of face.variants) expect(Object.keys(variant).sort()).toEqual(['id', 'kcs', 'levels', 'title'])
    }
  })

  test('answers an id no family has with undefined, and looks in the faces it is given', () => {
    expect(faceById('tr2.dispatch-key')).toBeUndefined()
    expect(faceById('tr2.bubble-width', [bubbleWidth])).toBe(bubbleWidth)
    expect(faceById('tr2.graph-hit', [bubbleWidth])).toBeUndefined()
  })
})

describe("the families' code, loaded when an item is drawn", () => {
  test('has a loader for every family of the registry, and for nothing else', () => {
    expect([...LOADED_FAMILIES].sort()).toEqual(FAMILIES.map((gen) => gen.id).sort())
  })

  test("loads the registry's own family for each id, once", async () => {
    for (const gen of FAMILIES) {
      const loaded = loadFamily(gen.id)
      expect(loadFamily(gen.id)).toBe(loaded)
      expect(await loaded).toBe(familyById(gen.id) as Gen)
    }
  })

  test('answers an id with no loader with a rejection, never a throw, and does not remember it', async () => {
    let first: Promise<Gen> | undefined
    expect(() => {
      first = loadFamily('tr2.dispatch-key')
    }).not.toThrow()
    await expect(first).rejects.toThrow('no item family "tr2.dispatch-key" has a loader')
    const second = loadFamily('tr2.dispatch-key')
    expect(second).not.toBe(first)
    await second.catch(() => undefined)
  })

  test("gives a test's own families at once, without loading anything", () => {
    expect(useFamily('tr2.bubble-width', [bubbleWidth])).toBe(bubbleWidth)
    expect(() => useFamily('tr2.graph-hit', [bubbleWidth])).toThrow('no item family "tr2.graph-hit" among the families given')
  })
})
