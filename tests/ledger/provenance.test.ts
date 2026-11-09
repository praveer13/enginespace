/*
 * The provenance names and their weights (ARCHITECTURE §7.3, ASSESSMENT.md §3.2, D-024). The documents are the source: the names
 * are read from §7.3 and the weights from ASSESSMENT's table, so a name or a number changed in one place and not the other fails
 * here.
 */
import { describe, expect, test } from 'bun:test'
import { isProvenance, PROVENANCE_WEIGHTS, PROVENANCES, weightOf } from '@es/ledger'
import { backticked, between, read, tableRows } from '../ci/support'

describe('the names', () => {
  test('are the seven that ARCHITECTURE §7.3 lists, in its order', () => {
    const line = /`Provenance = ([^`]+)`/.exec(read('docs/ARCHITECTURE.md'))?.[1]
    if (line === undefined) throw new Error('§7.3 no longer defines Provenance')
    expect([...line.matchAll(/'([a-z-]+)'/g)].map((match) => match[1])).toEqual([...PROVENANCES])
    expect(PROVENANCES).toHaveLength(7)
  })

  test('keep gpu-verified and gpu-unverified, which is the default of Q-9', () => {
    const q9 = read('docs/DECISIONS.md')
      .split('\n')
      .find((line) => line.startsWith('| Q-9 |'))
    expect(q9).toBeDefined()
    expect(q9).toContain('Keep the names')
    expect(PROVENANCES).toContain('gpu-verified')
    expect(PROVENANCES).toContain('gpu-unverified')
    expect(PROVENANCES).not.toContain('receipt-verified' as never)
  })

  test('isProvenance takes exactly the names', () => {
    for (const name of PROVENANCES) expect(isProvenance(name)).toBe(true)
    for (const other of ['Unseen', 'field', 'lab-green', '', 'weight', 1, null, undefined, ['unseen'], {}]) expect(isProvenance(other)).toBe(false)
  })
})

describe('the weights', () => {
  const table = tableRows(between(read('docs/ASSESSMENT.md'), '### 3.2 Provenance and weights', '### 3.3'))

  test('are ASSESSMENT.md §3.2\'s table, row for row', () => {
    expect(table.map((row) => backticked(row[0])[0])).toEqual([...PROVENANCES])
    for (const row of table) {
      const name = backticked(row[0])[0] as (typeof PROVENANCES)[number]
      expect(PROVENANCE_WEIGHTS[name]).toBe(Number(row[1]))
    }
  })

  test('are full credit, partial credit or none', () => {
    expect(new Set(Object.values(PROVENANCE_WEIGHTS))).toEqual(new Set([1, 0.3, 0]))
    expect(Object.keys(PROVENANCE_WEIGHTS).sort()).toEqual([...PROVENANCES].sort())
  })

  test('weightOf reads the table', () => {
    for (const name of PROVENANCES) expect(weightOf(name)).toBe(PROVENANCE_WEIGHTS[name])
    expect(weightOf('unseen')).toBe(1)
    expect(weightOf('practice')).toBe(0.3)
    expect(weightOf('gpu-unverified')).toBe(0)
  })

  test('a typed number earns nothing', () => {
    expect(weightOf('self-reported')).toBe(0)
  })
})
