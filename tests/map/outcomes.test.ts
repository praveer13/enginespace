/*
 * R-T22: which KCs each outcome of a module rests on. The list is data kept beside the page, so these tests hold it to the compiled map
 * and to each module's own outcomes, and the tick to the KC states it is derived from.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { KcState } from '@/progress/derive'
import { OUTCOME_KCS, outcomesPassed } from '@/map/outcomes'
import { MAP } from './support'

const repo = path.resolve(import.meta.dir, '../..')

describe('the outcome table', () => {
  test('names only KCs of the module it is under, and every one of them exists in the compiled map', () => {
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

  test("has one row for each outcome of each built module's own file", () => {
    for (const [module, rows] of Object.entries(OUTCOME_KCS)) {
      const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path.join(repo, `content/modules/${module}/module.md`), 'utf8'))?.[1] ?? ''
      const outcomes = /^outcomes:\n((?: {2}- .*\n?)+)/m.exec(front)?.[1].trim().split('\n') ?? []
      expect(rows, module).toHaveLength(outcomes.length)
    }
  })
})

describe('an outcome gains a tick when its KCs are passed', () => {
  const states = (entries: Record<string, KcState>) => new Map(Object.entries(entries))

  test('earned and kept count as passed, tried and not started do not', () => {
    const all = OUTCOME_KCS.tr2[2]
    const held = (state: KcState) => outcomesPassed('tr2', 4, states(Object.fromEntries(all.map((id) => [id, state]))), true)[2]
    expect(held('earned')).toBe(true)
    expect(held('kept')).toBe(true)
    expect(held('practised')).toBe(false)
    expect(held('none')).toBe(false)
  })

  test('needs every KC of the outcome, and an outcome with none never ticks', () => {
    const [one, ...rest] = OUTCOME_KCS.tr2[1]
    expect(rest.length).toBeGreaterThan(0)
    expect(outcomesPassed('tr2', 4, states({ [one]: 'earned' }), true)[1]).toBe(false)
    expect(outcomesPassed('tr2', 4, states(Object.fromEntries(OUTCOME_KCS.tr2.flat().map((id) => [id, 'kept' as KcState]))), true)).toEqual([true, true, true, false])
  })

  test('is false for every outcome until the ledger is read, and for a module the table does not know', () => {
    const everything = states(Object.fromEntries(OUTCOME_KCS.tr2.flat().map((id) => [id, 'kept' as KcState])))
    expect(outcomesPassed('tr2', 4, everything, false)).toEqual([false, false, false, false])
    expect(outcomesPassed('tr0', 2, everything, true)).toEqual([false, false])
  })
})
