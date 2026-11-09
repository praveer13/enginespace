/*
 * D-023's budgets are frozen. The W0 exit review (W0-T24) froze every gate and target of ARCHITECTURE §11.1 on 2026-11-04, and the owner's
 * rule is that no gate is ever weakened: a change that does not fit a gate is fixed, or it stops and goes to the owner as a new record.
 * During W1 five records raised them instead (D-053 to D-057: the front page's first paint to 151, 152 and 154 KB, the routes to 201 KB and
 * a 210 KB row for /today and /m/:module), and D-059 put them back. This holds `BUDGETS` (scripts/verify-bundle.ts) to D-023's values, so a
 * change to any budget fails a test before it reaches a merge.
 */
import { describe, expect, test } from 'bun:test'
import { BUDGETS } from '../../scripts/verify-bundle'

/** D-023 as W0-T24 froze it, in KB of gzip (1 KB = 1,000 B), and Pages' cap in bytes. */
const FROZEN = {
  entry: { gate: 110, target: 100 },
  front: { gate: 150, target: 130 },
  css: { gate: 30, target: 20 },
  route: { gate: 200 },
  threeVendor: { gate: 245 },
  scene: { gate: 40 },
  postfx: { gate: 25 },
  workers: { 'receipt.worker': 60, 'forge.worker': 40 },
  page: { gate: 40 },
  index: { target: 6 },
  siteBytes: 1_000_000_000,
}

const D023 =
  "verify:bundle's BUDGETS must be D-023's budgets as the W0 exit review froze them (docs/DECISIONS.md D-023, D-059): a gate is never raised or added to fit a change; fit the change to the gate, or stop and bring the owner a new record"

describe("D-023's frozen budgets", () => {
  test('are the budgets verify:bundle holds the build to, every gate and target and nothing else', () => {
    expect(BUDGETS, D023).toEqual(FROZEN)
  })

  test('have one gate for every route but the front page: no row of its own for any page', () => {
    expect(Object.keys(BUDGETS).sort(), D023).toEqual(Object.keys(FROZEN).sort())
    expect([BUDGETS.front.gate, BUDGETS.route.gate], D023).toEqual([150, 200])
  })
})
