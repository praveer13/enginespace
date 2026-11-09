/*
 * W1b-T07: the graded forge labs' KC tables as data (packages/sim/forge/check-kcs.ts). The map and the module pages read which KCs a
 * `lab:<lab>` event is evidence for from these tables, and they must read them without the lab's checks: `LAB_CHECK_KCS` (kcs.ts) pairs
 * each table with its checks, and their oracles took the module page over its 200 KB gate (src/progress/sources.ts has the figures). So the
 * tables are a file of their own that imports nothing, and kcs.ts, which `verify:kc` reads, is built from the same objects.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as forge from '../../packages/sim/forge'
import { GRADED_LAB_KCS, HYBRID_KV_KCS, REJECTION_SAMPLER_KCS, kcsOfLab } from '../../packages/sim/forge/check-kcs'
import { HYBRID_KV_KCS as HYBRID_KV_KCS_OF_THE_LAB } from '../../packages/sim/forge/hybrid-kv'
import { LAB_CHECK_KCS } from '../../packages/sim/forge/kcs'
import { REJECTION_SAMPLER_KCS as REJECTION_SAMPLER_KCS_OF_THE_LAB } from '../../packages/sim/forge/rejection-sampler'
import { root } from '../ci/support'

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('check-kcs.ts is data and nothing that runs a lab', () => {
  const source = strip(readFileSync(path.join(root, 'packages/sim/forge/check-kcs.ts'), 'utf8'))

  test('imports nothing: not a lab, not a check, not another model', () => {
    expect(source).not.toMatch(/^\s*import\b/m)
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(/)
    expect(source).not.toMatch(/^\s*export\s*(\*|\{[^}]*\})\s*from\b/m)
  })
})

describe('the tables are the ones the labs and kcs.ts have always had', () => {
  test("each lab's own file still exports its table, and it is the same object", () => {
    expect(HYBRID_KV_KCS_OF_THE_LAB).toBe(HYBRID_KV_KCS)
    expect(REJECTION_SAMPLER_KCS_OF_THE_LAB).toBe(REJECTION_SAMPLER_KCS)
  })

  test('and so does the forge barrel, with the lookup', () => {
    expect(forge.HYBRID_KV_KCS).toBe(HYBRID_KV_KCS)
    expect(forge.REJECTION_SAMPLER_KCS).toBe(REJECTION_SAMPLER_KCS)
    expect(forge.GRADED_LAB_KCS).toBe(GRADED_LAB_KCS)
    expect(forge.kcsOfLab).toBe(kcsOfLab)
  })

  test("LAB_CHECK_KCS lists the labs that check-kcs.ts lists, and gives each of them the table's own object", () => {
    expect(Object.keys(LAB_CHECK_KCS)).toEqual(Object.keys(GRADED_LAB_KCS))
    for (const [lab, table] of Object.entries(GRADED_LAB_KCS)) expect(LAB_CHECK_KCS[lab].kcs, lab).toBe(table)
  })

  test('every check that a table names is a check of its lab', () => {
    for (const [lab, table] of Object.entries(GRADED_LAB_KCS)) {
      const ids = LAB_CHECK_KCS[lab].checks.map((check) => check.id)
      expect(Object.keys(table).filter((id) => !ids.includes(id)), `${lab}: checks the lab does not have`).toEqual([])
    }
  })
})

describe('kcsOfLab: the KCs that a lab event is evidence for', () => {
  test("are a graded lab's checks together, each KC once, in the order of the table", () => {
    expect(kcsOfLab('hybrid-kv')).toEqual(['tr5a.sliding-free', 'tr5a.all-or-nothing', 'tr5a.state-pages', 'tr5a.hit-intersection', 'tr5a.adapter-pages'])
    expect(kcsOfLab('rejection-sampler')).toEqual(['tr6.exact-acceptance', 'tr6.residual-recovery', 'tr6.exactness-testing'])
  })

  test('are the union of the table for every graded lab, and a KC that two checks assess is named once', () => {
    for (const [lab, table] of Object.entries(GRADED_LAB_KCS)) {
      const all = Object.values(table).flat()
      expect(new Set(kcsOfLab(lab)), lab).toEqual(new Set(all))
      expect(kcsOfLab(lab).length, `${lab} names a KC twice`).toBe(new Set(all).size)
    }
  })

  test('are none for a lab with no table: the practice lab, a lab that is not built, and the names an object has', () => {
    for (const lab of ['toy', 'kv-publisher', 'tr8.replay', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '']) expect(kcsOfLab(lab), lab).toEqual([])
  })
})
