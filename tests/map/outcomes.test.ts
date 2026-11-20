/*
 * R-T22: which KCs each outcome of a module rests on. The list is data kept beside the page, so these tests hold it to the compiled map
 * and to each module's own outcomes, and the tick to the KC states it is derived from.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { KcState } from '@/progress/derive'
import { outcomesPassed } from '@/map/outcomes'
import type { CompiledModule, CourseMap } from '@es/schema'
import { moduleFrontMatterSchema } from '@es/schema'
import { compileContent } from '../../scripts/content/build.ts'
import { output } from '../content/support.ts'

const compiled = compileContent({ root: path.resolve(import.meta.dir, '../..') })

const MAP = JSON.parse(output(compiled, 'src/content/generated/map.json')) as CourseMap
const repo = path.resolve(import.meta.dir, '../..')

/** Each written module as the page reads it: its outcomes and the KCs under each. */
const WRITTEN = readdirSync(path.join(repo, 'content/modules'))
  .filter((name) => existsSync(path.join(repo, `content/modules/${name}/module.md`)))
  .map((name) => JSON.parse(output(compiled, `src/content/generated/modules/${name}.json`)) as CompiledModule)
const OUTCOME_KCS: Readonly<Record<string, readonly (readonly string[])[]>> = Object.fromEntries(WRITTEN.map((module) => [module.id, module.outcome_kcs]))

describe("a module's outcome table", () => {
  test('names only KCs of the module it is in, and every one of them exists in the compiled map', () => {
    expect(WRITTEN.length).toBeGreaterThan(0)
    for (const [module, rows] of Object.entries(OUTCOME_KCS)) {
      const own = new Set(MAP.kcs.filter((kc) => kc.module === module).map((kc) => kc.id))
      expect(own.size, module).toBeGreaterThan(0)
      for (const row of rows) for (const id of row) expect(own.has(id), `${module}: ${id}`).toBe(true)
    }
  })

  test('puts every KC of the module under one outcome or another, and no KC under two', () => {
    for (const [module, rows] of Object.entries(OUTCOME_KCS)) {
      const listed = rows.flat()
      if (module === 'tr1') {
        // TR1's first outcome and its second share the five-mechanisms KC: the one KC that two sentences of the module lean on.
        expect(new Set(listed).size).toBe(listed.length - 1)
      } else expect(new Set(listed).size, module).toBe(listed.length)
      const own = MAP.kcs.filter((kc) => kc.module === module).map((kc) => kc.id)
      expect(own.filter((id) => !listed.includes(id)), `${module}: KCs under no outcome`).toEqual([])
    }
  })

  test('has one list for each outcome of the module, and TR2 keeps its fourth outcome with no KC', () => {
    for (const module of WRITTEN) expect(module.outcome_kcs, module.id).toHaveLength(module.outcomes.length)
    expect(OUTCOME_KCS.tr2[3]).toEqual([])
  })

  test('the compiled map carries the sentence of every module, written or planned', () => {
    for (const row of MAP.modules) expect(row.outcome, row.id).toBeTruthy()
    for (const module of WRITTEN) expect(MAP.modules.find((row) => row.id === module.id)?.outcome).toBe(module.outcomes[0])
  })

  test('the schema refuses a module whose lists are not one for each outcome', () => {
    const schema = moduleFrontMatterSchema
    const base = { ...WRITTEN[0] } as Record<string, unknown>
    for (const key of ['rev', 'blocks']) delete base[key]
    expect(schema.safeParse(base).success).toBe(true)
    expect(schema.safeParse({ ...base, outcome_kcs: [] }).success).toBe(false)
  })
})

describe('an outcome gains a tick when its KCs are passed', () => {
  const states = (entries: Record<string, KcState>) => new Map(Object.entries(entries))

  test('earned and kept count as passed, tried and not started do not', () => {
    const all = OUTCOME_KCS.tr2[2]
    const held = (state: KcState) => outcomesPassed(OUTCOME_KCS.tr2, 4, states(Object.fromEntries(all.map((id) => [id, state]))), true)[2]
    expect(held('earned')).toBe(true)
    expect(held('kept')).toBe(true)
    expect(held('practised')).toBe(false)
    expect(held('none')).toBe(false)
  })

  test('needs every KC of the outcome, and an outcome with none never ticks', () => {
    const [one, ...rest] = OUTCOME_KCS.tr2[1]
    expect(rest.length).toBeGreaterThan(0)
    expect(outcomesPassed(OUTCOME_KCS.tr2, 4, states({ [one]: 'earned' }), true)[1]).toBe(false)
    expect(outcomesPassed(OUTCOME_KCS.tr2, 4, states(Object.fromEntries(OUTCOME_KCS.tr2.flat().map((id) => [id, 'kept' as KcState]))), true)).toEqual([true, true, true, false])
  })

  test('is false for every outcome until the ledger is read, and for a module with no lists', () => {
    const everything = states(Object.fromEntries(OUTCOME_KCS.tr2.flat().map((id) => [id, 'kept' as KcState])))
    expect(outcomesPassed(OUTCOME_KCS.tr2, 4, everything, false)).toEqual([false, false, false, false])
    expect(outcomesPassed([], 2, everything, true)).toEqual([false, false])
  })
})
