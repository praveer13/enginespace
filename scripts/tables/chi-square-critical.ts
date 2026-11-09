/**
 * chi-square-critical: the generator of packages/sim/spec/critical.ts (ARCHITECTURE §5.1 and §5.5, D-017; W1-T26).
 *
 * packages/sim may not call Math.exp or Math.log (their last bit can differ between engines, and the determinism lint bans them), so
 * the critical values of the chi-square test that `spec` runs on a sampler's output are a committed table of integers. This script
 * is the only place that takes a logarithm for them, and CI runs it again to check that the committed table is what it writes.
 *
 *   bun scripts/tables/chi-square-critical.ts --write    rewrite the table
 *   bun scripts/tables/chi-square-critical.ts --check    regenerate it in memory and fail on any difference
 *
 * Both take `--root <dir>` for a tree laid out like this repository. `bun scripts/vectors.ts --check`, which verify:determinism
 * runs, calls `checkCritical` as well.
 *
 * The table. Entry [df] of level L is the least integer c with P(χ² with df degrees of freedom > c / SCALE) ≤ α, where α is 1e-3 or
 * 1e-4 and SCALE = 1000. Rounding up means a test that rejects above c / SCALE rejects an exact sampler no more often than α. Entry
 * [0] is 0: with no degrees of freedom the statistic is always 0, and any positive statistic is an observation that p rules out.
 * The survival function is the regularized upper incomplete gamma function Q(df / 2, x / 2). The table runs to MAX_DF = 255, a
 * vocabulary of 256 tokens.
 *
 * The computation, all in doubles. ln Γ(df / 2) is a sum of logarithms from the factorial or the half-integer product, not an
 * approximation. Q comes from two expansions in DLMF §8.7 and §8.9 (NIST Digital Library of Mathematical Functions,
 * https://dlmf.nist.gov/8, version 1.2.8 of 2026-09-15, read 2026-11-08): when y < a + 1, P from the power series of DLMF 8.7.1 and
 * then Q = 1 − P; otherwise Q itself from the continued fraction of DLMF 8.9.2, evaluated from the bottom up at a fixed depth that
 * doubles until two depths agree. The critical value comes from bisection on Q(a, y) = α, down to the last bit. At each of the 510
 * computed roots the survival probability is within 2.4e-13 of α, relative [measured 2026-11-08, bun 1.3.14, against 400-bit exact
 * arithmetic in tests/sim/spec-critical.test.ts], which puts 1000 · x within about 1e-8 of a table unit of its true value [estimated].
 *
 * Platform independence. A different libm could move a computed value by a few units in the last place, which is about 1e-12 of a
 * table unit [estimated]. The one rounding that could flip is the ceiling, when 1000 · x is within that distance of an integer, so
 * the generator refuses to write a table in which any entry is closer than MARGIN = 1e-5 of a unit to an integer: an error would
 * have to be a thousand times larger than this algorithm's to change a committed integer. The committed table's own margin is
 * printed by `--check` [measured 2026-11-08, bun 1.3.14].
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** The levels the table holds, by the key `CRITICAL` uses. */
export const LEVELS = [
  { key: '1e-3', alpha: 1e-3 },
  { key: '1e-4', alpha: 1e-4 },
] as const
export type LevelKey = (typeof LEVELS)[number]['key']
/** The most degrees of freedom the table has: a vocabulary of 256 tokens [estimated]. */
export const MAX_DF = 255
/** Table units per unit of the statistic: critical values to three decimals. */
export const SCALE = 1000
/** The file this script writes, relative to the repository root. */
export const TABLE_FILE = 'packages/sim/spec/critical.ts'
/** The least distance, in table units, between a computed value and an integer (see above). */
export const MARGIN = 1e-5

const repoRoot = path.resolve(import.meta.dirname, '../..')

/** ln Γ(df / 2) for a positive integer df: ln((df/2 − 1)!) for an even one, and ln(√π · ∏ (j − ½)) for an odd one. */
export function lnGammaHalf(df: number): number {
  if (!Number.isInteger(df) || df < 1) throw new RangeError(`df must be a positive integer, got ${df}`)
  let sum = 0
  if (df % 2 === 0) {
    for (let i = 2; i < df / 2; i++) sum += Math.log(i)
    return sum
  }
  sum = 0.5 * Math.log(Math.PI)
  for (let j = 1; j <= (df - 1) / 2; j++) sum += Math.log(j - 0.5)
  return sum
}

/*
 * The incomplete gamma function, from DLMF chapter 8 (https://dlmf.nist.gov/8). For a > 0 and y > 0:
 *
 *   P(a, y) = γ(a, y) / Γ(a), Q(a, y) = Γ(a, y) / Γ(a) and P + Q = 1                                      DLMF 8.2.4, 8.2.5
 *   P(a, y) = y^a γ*(a, y), where γ*(a, y) = e^(−y) Σ_{k ≥ 0} y^k / Γ(a + k + 1)                             DLMF 8.2.6, 8.7.1
 *   y^(−a) e^y Γ(a, y) = c_1 / (1 + c_2 / (1 + c_3 / (1 + ⋯))),
 *     where c_1 = 1/y and, for k ≥ 1, c_(2k) = (k − a)/y and c_(2k+1) = k/y                                 DLMF 8.9.2
 *
 * Both leave the factor y^a e^(−y) / Γ(a) outside. Since Γ(a + k + 1) = a Γ(a) · (a + 1)(a + 2) ⋯ (a + k), the series is
 * P = y^a e^(−y) / (a Γ(a)) · Σ_{k ≥ 0} y^k / ((a + 1) ⋯ (a + k)), and the fraction is Q = y^a e^(−y) / Γ(a) · (its value).
 */

/**
 * How closely two depths of the continued fraction must agree, relative [estimated]: a few units in the last place of a double, and
 * a thousandth of the 1e-12 to which tests/sim/spec-critical.test.ts holds the roots.
 */
const AGREEMENT = 1e-15
/**
 * The depth (the number of partial numerators c_j kept) that the doubling starts from, and the depth at which it gives up. Building
 * the table, the fraction settles by depth 256 [measured 2026-11-08, bun 1.3.14], far short of the limit.
 */
const FIRST_DEPTH = 8
const DEPTH_LIMIT = 1 << 16

/**
 * Σ_{k ≥ 0} y^k / ((a + 1) ⋯ (a + k)), which is Γ(a + 1) times the sum of DLMF 8.7.1. For y < a + 1 every term is positive and
 * smaller than the one before it, so the adding stops at the first term too small to change the total.
 */
function seriesTotal(a: number, y: number): number {
  let total = 0
  let term = 1
  for (let k = 1; total + term !== total; k++) {
    total += term
    term *= y / (a + k)
  }
  return total
}

/**
 * The continued fraction of DLMF 8.9.2 cut off after its first `depth` partial numerators, worked from the bottom up: the value
 * below the last level is taken as 0, and each level j above it is c_j / (1 + the value below). For y ≥ a + 1 every denominator
 * is positive [derived]: a level with c_j ≥ 0 has a value that is not negative, and a level with c_j < 0 (j = 2k with k < a) sits
 * on one of those or on the bottom, so its value is at least c_j = −(a − k)/y > −1.
 */
function fractionAtDepth(a: number, y: number, depth: number): number {
  let below = 0
  for (let j = depth; j >= 1; j--) {
    const k = Math.floor(j / 2)
    const partial = (j === 1 ? 1 : j % 2 === 0 ? k - a : k) / y // c_j
    below = partial / (1 + below)
  }
  return below
}

/** y^(−a) e^y Γ(a, y) by DLMF 8.9.2: the depth doubles until two depths agree to AGREEMENT, and the deeper value is the result. */
function fractionValue(a: number, y: number): number {
  let shallower = fractionAtDepth(a, y, FIRST_DEPTH)
  for (let depth = 2 * FIRST_DEPTH; depth <= DEPTH_LIMIT; depth *= 2) {
    const deeper = fractionAtDepth(a, y, depth)
    if (Math.abs(deeper - shallower) <= AGREEMENT * deeper) return deeper
    shallower = deeper
  }
  throw new Error(`the continued fraction for Q(${a}, ${y}) did not settle by depth ${DEPTH_LIMIT}`)
}

/**
 * Q(a, y), the regularized upper incomplete gamma function, for a = df / 2 and y > 0, with `lnGamma` = ln Γ(a); 1 for y ≤ 0. Below
 * y = a + 1 it is 1 − P, with P from the series; from y = a + 1 on, the continued fraction gives Q itself, so even a small Q keeps
 * its relative accuracy.
 */
export function upperGamma(a: number, y: number, lnGamma: number): number {
  if (y <= 0) return 1
  const scale = Math.exp(a * Math.log(y) - y - lnGamma) // y^a e^(−y) / Γ(a)
  return y < a + 1 ? 1 - (scale / a) * seriesTotal(a, y) : scale * fractionValue(a, y)
}

/** The x with P(χ² with df degrees of freedom > x) = alpha, by bisection to the last bit. */
export function criticalValue(df: number, alpha: number): number {
  const a = df / 2
  const lnGamma = lnGammaHalf(df)
  let lo = 0
  let hi = a + 1
  while (upperGamma(a, hi, lnGamma) > alpha) hi *= 2
  for (let i = 0; i < 400; i++) {
    const mid = (lo + hi) / 2
    if (mid <= lo || mid >= hi) break
    if (upperGamma(a, mid, lnGamma) > alpha) lo = mid
    else hi = mid
  }
  return 2 * hi
}

export interface Table {
  /** The committed integers, by level and then by df (entry 0 is 0). */
  values: Record<LevelKey, number[]>
  /** The least distance from a computed 1000 · x to an integer, in table units, as measured. */
  margin: number
}

/**
 * ⌈scaled⌉, and its distance from the nearest integer. It throws if that distance is under MARGIN: a different libm could then
 * round the other way, and the table would depend on the platform.
 */
export function ceilWithMargin(scaled: number, what: string): { value: number; distance: number } {
  const distance = Math.min(scaled - Math.floor(scaled), Math.ceil(scaled) - scaled)
  if (!(distance >= MARGIN)) throw new Error(`${what}: ${scaled} is only ${distance} of a table unit from an integer, so the table would depend on the platform's libm`)
  return { value: Math.ceil(scaled), distance }
}

/** Rounds up the scaled critical values of every level and df, and throws if one is closer than MARGIN to an integer. */
export function computeTable(): Table {
  const values = { '1e-3': [0], '1e-4': [0] } as Record<LevelKey, number[]>
  let margin = 0.5
  for (const { key, alpha } of LEVELS) {
    for (let df = 1; df <= MAX_DF; df++) {
      const { value, distance } = ceilWithMargin(SCALE * criticalValue(df, alpha), `level ${key}, df ${df}`)
      margin = Math.min(margin, distance)
      values[key].push(value)
    }
  }
  for (const { key } of LEVELS) {
    for (let df = 1; df <= MAX_DF; df++) {
      if (!(values[key][df] > values[key][df - 1])) throw new Error(`level ${key}: entry ${df} does not exceed entry ${df - 1}`)
    }
  }
  for (let df = 1; df <= MAX_DF; df++) {
    if (!(values['1e-4'][df] > values['1e-3'][df])) throw new Error(`df ${df}: the 1e-4 value does not exceed the 1e-3 value`)
  }
  return { values, margin }
}

/** The text of the committed file for a table. */
export function renderTable(values: Record<LevelKey, readonly number[]>): string {
  const lines: string[] = [
    '// GENERATED by `bun scripts/tables/chi-square-critical.ts --write`. Do not edit it by hand: `--check`, which verify:determinism runs',
    '// through scripts/vectors.ts, regenerates it and fails on any difference (ARCHITECTURE §5.1 and §5.5, D-017).',
    '//',
    '// Critical values of the chi-square test, so that packages/sim needs no Math.log or Math.exp. CRITICAL[level][df] is the least integer c',
    '// with P(χ² with df degrees of freedom > c / 1000) ≤ the level, for df from 0 to 255. Entry 0 is 0: with no degrees of freedom the',
    '// statistic is 0, and any positive statistic is an observation the target ruled out. Rounding up means a test that rejects above',
    '// c / 1000 rejects an exact sampler no more often than its level.',
    '// scripts/tables/chi-square-critical.ts explains the construction and why the integers do not depend on the platform.',
    '',
    `export const CRITICAL_SCALE = ${SCALE}`,
    `export const CRITICAL_MAX_DF = ${MAX_DF}`,
    'export const CRITICAL: Readonly<Record<\'1e-3\' | \'1e-4\', readonly number[]>> = {',
  ]
  for (const { key } of LEVELS) {
    lines.push(`  '${key}': [`)
    for (let i = 0; i < values[key].length; i += 12) lines.push(`    ${values[key].slice(i, i + 12).join(', ')},`)
    lines.push('  ],')
  }
  lines.push('}', '')
  return lines.join('\n')
}

/** What the committed file must hold. */
export function expectedSource(): string {
  return renderTable(computeTable().values)
}

/** A problem with the committed table under `root`, or null if it is what the generator writes. `source` is that text, if the caller has it. */
export function checkCritical(root: string = repoRoot, source: string = expectedSource()): string | null {
  const file = path.join(root, TABLE_FILE)
  let committed: string
  try {
    committed = readFileSync(file, 'utf8')
  } catch {
    return `${TABLE_FILE} is missing: run \`bun scripts/tables/chi-square-critical.ts --write\``
  }
  const expected = source
  if (committed === expected) return null
  const have = committed.split('\n')
  const want = expected.split('\n')
  let line = 0
  while (line < want.length && have[line] === want[line]) line++
  return `${TABLE_FILE} is not what the generator writes (first difference on line ${line + 1}): run \`bun scripts/tables/chi-square-critical.ts --write\` and review the diff`
}

export function writeCritical(root: string = repoRoot): void {
  writeFileSync(path.join(root, TABLE_FILE), expectedSource())
}

const USAGE = 'usage: bun scripts/tables/chi-square-critical.ts (--write | --check) [--root <dir>]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[]): number {
  let mode: 'write' | 'check' | undefined
  let root = repoRoot
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]
    if (argument === '--write' || argument === '--check') mode = argument === '--write' ? 'write' : 'check'
    else if (argument === '--root' && argv[i + 1] !== undefined) root = path.resolve(argv[++i])
    else {
      console.error(`chi-square-critical: unknown argument "${argument}"\n${USAGE}`)
      return 2
    }
  }
  if (mode === undefined) {
    console.error(USAGE)
    return 2
  }
  if (mode === 'write') {
    writeCritical(root)
    console.log(`chi-square-critical: wrote ${TABLE_FILE}`)
    return 0
  }
  const table = computeTable()
  const problem = checkCritical(root, renderTable(table.values))
  if (problem) {
    console.error(`chi-square-critical: ${problem}`)
    return 1
  }
  console.log(`chi-square-critical: ${TABLE_FILE} is what the generator writes (${LEVELS.length} levels, df 0 to ${MAX_DF}, smallest margin ${table.margin.toExponential(2)} of a unit)`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
