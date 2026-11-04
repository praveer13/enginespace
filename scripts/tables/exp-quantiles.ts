/**
 * exp-quantiles: the generator of packages/sim/core/exp-quantiles.ts (ARCHITECTURE §5.1, D-017; W0-T12).
 *
 * packages/sim may not call Math.log (its last bit can differ between engines, and the determinism lint bans it), so the
 * exponential distribution that Poisson arrivals and think times need is a committed table of integers. This script is the
 * only place that takes a logarithm, and CI runs it again to check that the committed table is what it writes.
 *
 *   bun scripts/tables/exp-quantiles.ts --write    rewrite the table
 *   bun scripts/tables/exp-quantiles.ts --check    regenerate it in memory and fail on any difference
 *
 * Both take `--root <dir>` for a tree laid out like this repository. `bun scripts/vectors.ts --check`, which
 * verify:determinism runs, calls `checkTable` as well.
 *
 * The table. The unit exponential distribution is cut into BINS intervals of equal probability. Entry k is the mean of the
 * distribution over the interval [k/BINS, (k+1)/BINS) of its cumulative probability, in units of 1/SCALE:
 *
 *     m_k = BINS · (F((k+1)/BINS) − F(k/BINS)),   F(u) = u + (1 − u) · ln(1 − u),   F(1) = 1
 *
 * where F is the integral of −ln(1 − u), the quantile function. Averaging over a bin, instead of reading the quantile at its
 * middle, makes the mean of the table exactly 1, so a generator that draws a bin and scales by a mean delay has exactly that
 * mean. Rounding is by largest remainder: take the floors, then give one more unit to the entries with the largest
 * fractional parts until the total is BINS · SCALE. The price is that the table is a discrete stand-in with BINS values: the
 * variance inside each bin is lost, which is 1/BINS of the variance in the last bin (the tail), and no delay exceeds
 * (1 + ln BINS) times the mean.
 *
 * Platform independence. A different libm could move a computed m_k by a few units in the last place of a double, about 1e-7 of
 * one table unit [estimated]. The roundings that could flip are those within that distance of an integer (the floors) or of the cut that
 * decides which entries get the extra unit, so the generator refuses to write a table in which any of them is closer than
 * MARGIN = 1e-5 of a unit: a libm error would have to be a hundred times larger to change a committed integer. The committed
 * table's own margin is 3.4e-4 of a unit [measured 2026-11-04, bun 1.3.14], thirty times the limit.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Intervals of equal probability. A design parameter [estimated]: the table is 1,024 integers. */
export const BINS = 1024
/** Table units per unit of the distribution: 2^16 [estimated]. */
export const SCALE = 65536
/** The file this script writes, relative to the repository root. */
export const TABLE_FILE = 'packages/sim/core/exp-quantiles.ts'
/** The least distance, in table units, between a computed value and a rounding decision (see above). */
export const MARGIN = 1e-5

const repoRoot = path.resolve(import.meta.dirname, '../..')

/** The cumulative integral of the unit exponential's quantile function, −ln(1 − u), from 0 to u. */
const integral = (u: number): number => (u === 1 ? 1 : u + (1 - u) * Math.log(1 - u))

export interface Table {
  /** The committed integers. */
  values: number[]
  /** The least distance from a computed value to the integer boundary or to the cut, in table units, as measured. */
  margin: number
}

/**
 * Rounds `exact`, whose sum is `total` up to rounding error, to integers that add up to exactly `total`: the floors, and one more
 * unit for the entries with the largest fractional parts (equal fractions go to the lower index). It throws if any rounding is closer
 * than MARGIN to deciding the other way, as described above.
 */
export function roundToTotal(exact: readonly number[], total: number): Table {
  const floors = exact.map((x) => Math.floor(x))
  const deficit = total - floors.reduce((a, b) => a + b, 0)
  if (deficit < 0 || deficit >= exact.length) throw new Error(`the floors miss the total by ${deficit}, which is not a count of entries`)
  const fractions = exact.map((x, k) => ({ k, fraction: x - floors[k] }))
  fractions.sort((a, b) => b.fraction - a.fraction || a.k - b.k)
  const values = floors.slice()
  for (let i = 0; i < deficit; i++) values[fractions[i].k] += 1
  let margin = Math.min(...fractions.map(({ fraction }) => Math.min(fraction, 1 - fraction)))
  if (deficit > 0) margin = Math.min(margin, fractions[deficit - 1].fraction - fractions[deficit].fraction)
  if (!(margin >= MARGIN)) throw new Error(`a rounding is only ${margin} of a table unit from a tie: the table would depend on the platform's libm`)
  return { values, margin }
}

/** Computes the table, and throws if a rounding decision is closer than MARGIN. */
export function computeTable(): Table {
  const exact: number[] = []
  for (let k = 0; k < BINS; k++) exact.push(BINS * (integral((k + 1) / BINS) - integral(k / BINS)) * SCALE)
  const table = roundToTotal(exact, BINS * SCALE)
  for (let k = 1; k < BINS; k++) if (!(table.values[k] > table.values[k - 1])) throw new Error(`entry ${k} does not exceed entry ${k - 1}`)
  return table
}

/** The text of the committed file for a table. */
export function renderTable(values: readonly number[]): string {
  const rows: string[] = []
  for (let i = 0; i < values.length; i += 16) rows.push(`  ${values.slice(i, i + 16).join(', ')},`)
  return [
    '// GENERATED by `bun scripts/tables/exp-quantiles.ts --write`. Do not edit it by hand: `--check`, which verify:determinism runs',
    '// through scripts/vectors.ts, regenerates it and fails on any difference (ARCHITECTURE §5.1, D-017).',
    '//',
    '// The unit exponential distribution as 1,024 intervals of equal probability, for drawing delays without Math.log at run time.',
    '// Entry k is the mean of the distribution over the cumulative-probability interval [k/1024, (k+1)/1024), in units of 1/65536:',
    '//',
    '//   entry k = 1024 · 65536 · (F((k+1)/1024) − F(k/1024)),   F(u) = u + (1 − u) · ln(1 − u),   F(1) = 1',
    '//',
    '// F is the integral of the quantile function −ln(1 − u). Rounding is by largest remainder, so the entries add up to exactly',
    '// 1024 · 65536 and the mean of the table is exactly 1. The last entry is 1 + ln 1024 times 65536, rounded [derived].',
    '// scripts/tables/exp-quantiles.ts explains the construction and why the integers do not depend on the platform.',
    '',
    `export const EXP_BINS = ${BINS}`,
    `export const EXP_SCALE = ${SCALE}`,
    'export const EXP_QUANTILES: readonly number[] = [',
    ...rows,
    ']',
    '',
  ].join('\n')
}

/** What the committed file must hold. */
export function expectedSource(): string {
  return renderTable(computeTable().values)
}

/** A problem with the committed table under `root`, or null if it is what the generator writes. */
export function checkTable(root: string = repoRoot): string | null {
  const file = path.join(root, TABLE_FILE)
  let committed: string
  try {
    committed = readFileSync(file, 'utf8')
  } catch {
    return `${TABLE_FILE} is missing: run \`bun scripts/tables/exp-quantiles.ts --write\``
  }
  const expected = expectedSource()
  if (committed === expected) return null
  const have = committed.split('\n')
  const want = expected.split('\n')
  let line = 0
  while (line < want.length && have[line] === want[line]) line++
  return `${TABLE_FILE} is not what the generator writes (first difference on line ${line + 1}): run \`bun scripts/tables/exp-quantiles.ts --write\` and review the diff`
}

export function writeTable(root: string = repoRoot): void {
  writeFileSync(path.join(root, TABLE_FILE), expectedSource())
}

const USAGE = 'usage: bun scripts/tables/exp-quantiles.ts (--write | --check) [--root <dir>]'

/** Runs the command line `argv` (without the program and script) and returns the exit status. */
export function main(argv: readonly string[]): number {
  let mode: 'write' | 'check' | undefined
  let root = repoRoot
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i]
    if (argument === '--write' || argument === '--check') mode = argument === '--write' ? 'write' : 'check'
    else if (argument === '--root' && argv[i + 1] !== undefined) root = path.resolve(argv[++i])
    else {
      console.error(`exp-quantiles: unknown argument "${argument}"\n${USAGE}`)
      return 2
    }
  }
  if (mode === undefined) {
    console.error(USAGE)
    return 2
  }
  if (mode === 'write') {
    writeTable(root)
    console.log(`exp-quantiles: wrote ${TABLE_FILE}`)
    return 0
  }
  const problem = checkTable(root)
  if (problem) {
    console.error(`exp-quantiles: ${problem}`)
    return 1
  }
  console.log(`exp-quantiles: ${TABLE_FILE} is what the generator writes (${BINS} entries)`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
