/*
 * W1-T27 acceptance 2 (ASSESSMENT §4.6, ARCHITECTURE §8.3): the error rates of the rejection-sampler lab, measured on the builds that Rust makes,
 * through the host that the site uses. A "trial" is one run of the lab on seeds drawn from a fixed stream (a run is a function of the code
 * and the module, and a gate cannot flake), and a row is one build.
 *
 *   1. False fails. The reference's trials fail at a rate of at most 5e-4 [estimated bound]: no check but the chi-square can fail it, and the
 *      chi-square fails an exact sampler with probability about 1 − (1 − 1e-4)² ≈ 2e-4 [derived]. At the pull-request size this is "none
 *      of the trials", which says little about 2e-4 and a good deal about a lab that fails an exact sampler by a wide margin.
 *   2. Detection. Each member of the bestiary fails the checks that bestiary.json names for it in at least 99% of the trials
 *      [estimated target]: the four exact checks in all of them, and the chi-square, for the four members it is named for, in at least 99%.
 *      The boundary-inclusive comparison is the member that the chi-square does not see (it moves a dish by 1/65,536), and the accept step
 *      and the walk see it in every trial.
 *
 * The size is ES_LAB_TRIALS trials a row, 8 by default, so that the pull request's gate stays short [estimated]; ES_LAB_REPORT=1 prints the
 * table below. The rates of the model alone, for many more cases, come from tests/sim/rejection-sampler-rates.ts.
 *
 * Measured on 2026-11-04 on the dev host (20 cores, under a load average of 10 to 40 from other work), Bun 1.3.14, through the real worker, on
 * the builds in tests/fixtures/forge/rejection-sampler (the reference is SHA-256 4b2875b7c453…) [measured], the oracle as this task commits it:
 *   - ES_LAB_TRIALS=1500, 11.7 minutes. The reference failed none of its five checks in 1,500 runs: no false fail in 1,500, where 0.3 are
 *     expected at 2e-4 [derived]. Each member failed the checks that bestiary.json names for it in 1,500 of 1,500 runs, but for the chi-square
 *     of two members: the p > q rule's in 1,499 of 1,500 (and 1,496 of 1,500 in the next row, on other seeds), and the boundary-inclusive
 *     comparison's in 160 of 1,500 (10.7%; 183, 12.2%, in the next row). The accept step and the walk caught the boundary in all 1,500.
 *   - At the model's level (W1-T26's sampler through this oracle's case and seeds, tests/sim/rejection-sampler-rates.ts):
 *     the reference rejected 9 of 50,000 cases (0.018%; 10 are expected at 2e-4 [derived], and the bound is 5e-4 [estimated]), and its
 *     statistic never passed 1.22 times its limit on the first seed. resample-from-p, resample-from-q, residual-off-by-one and fly-lossy were
 *     rejected in 20,000 of 20,000 cases each, and the smallest first-seed statistic was 2.98, 10.71, 10.24 and 8.61 times the limit. The p > q
 *     rule was rejected in 9,990 of 10,000 cases (99.9%: it is exact on the pair whose every dish with p <= q has p = 0), and the
 *     boundary-inclusive comparison in 1,163 of 10,000 (11.6%).
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHost } from '../../src/forge/host'
import { runLab } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import { browserPool } from '../../src/forge/worker-pool'
import { readBestiary } from '../../scripts/labs/bestiary'
import { hash32, splitmix32u } from '../../vendor/kernelspace/src/lib/rng'

const root = path.resolve(import.meta.dirname, '../..')
const lab = FORGE_LABS['rejection-sampler']
const bestiary = readBestiary(path.join(root, 'labs/forge/rejection-sampler'))
const TRIALS = Number(process.env['ES_LAB_TRIALS'] ?? 8)
const REPORT = process.env['ES_LAB_REPORT'] === '1'
/** A row at the size of a nightly run takes minutes. */
const TIMEOUT_MS = 6 * 60 * 60_000
const ALL = lab.checks.map((check) => check.id)

const read = (name: string): ArrayBuffer => {
  const bytes = readFileSync(path.join(root, 'tests/fixtures/forge/rejection-sampler', `${name}.wasm`))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const host = createHost({ pool: browserPool() })
const report: string[] = []
afterAll(() => {
  host.dispose()
  if (REPORT) console.log(['', `rejection-sampler rates: ${TRIALS} trials a row`, ...report].join('\n'))
})

const pct = (k: number, n: number) => `${((100 * k) / n).toFixed(2)}%`

/** Runs `trials` runs of the build `name` on checks `only`, and counts for each check the runs in which it did not pass. */
async function measure(name: string, only: readonly string[], trials: number = TRIALS): Promise<Record<string, number>> {
  const module = await host.load(read(name))
  const draw = splitmix32u(hash32(`rates/${name}`))
  const failed: Record<string, number> = Object.fromEntries(only.map((id) => [id, 0]))
  for (let n = 0; n < trials; n++) {
    // The time limit of a check is not what is measured here, and a busy machine must not turn a slow check into a failed one.
    const run = await runLab(host, lab, module, { only, draw, budgetMs: 20_000 })
    for (const check of run.checks) if (check.status !== 'pass') failed[check.id] += 1
  }
  return failed
}

describe('check 1: the reference fails falsely at most 5e-4 of the time', () => {
  test(`over ${TRIALS} runs of all five checks`, async () => {
    const failed = await measure('reference', ALL)
    report.push(`check 1: the reference, all five checks: ${ALL.map((id) => `${id} ${failed[id]}`).join(', ')} failed of ${TRIALS} runs (the bound is 0.05%, the nominal rate of the chi-square 0.02%)`)
    for (const id of ALL.filter((id) => id !== 'exact')) expect(failed[id], `${id} is exact and fails the reference never`).toBe(0)
    expect(failed['exact'] / TRIALS).toBeLessThanOrEqual(5e-4)
  }, TIMEOUT_MS)
})

describe('check 2: each bestiary member fails its checks in at least 99% of the runs', () => {
  for (const member of bestiary.members) {
    test(`${member.id}: ${Object.keys(member.fails).join(', ')}`, async () => {
      const only = [...new Set([...Object.keys(member.fails), 'exact'])]
      const failed = await measure(member.id, only)
      const row = only.map((id) => `${id} ${pct(failed[id], TRIALS)} (${failed[id]}/${TRIALS})`).join(', ')
      report.push(`check 2: ${member.id.padEnd(20)} fails ${row}`)
      for (const id of Object.keys(member.fails)) expect(failed[id] / TRIALS, `${member.id}: ${id}`).toBeGreaterThanOrEqual(0.99)
    }, TIMEOUT_MS)
  }

  test('the chi-square alone sees the four members it is named for in at least 99% of the runs, and the p > q rule almost always; the boundary-inclusive comparison it sees in few', async () => {
    const seen: Record<string, number> = {}
    for (const id of ['accept-if-p-over-q', 'boundary-inclusive']) seen[id] = (await measure(id, ['exact']))['exact']
    report.push(`check 2: the chi-square alone: accept-if-p-over-q ${pct(seen['accept-if-p-over-q'], TRIALS)}, boundary-inclusive ${pct(seen['boundary-inclusive'], TRIALS)} (the accept step and the walk see both in every run)`)
    // The p > q rule is exact on the rare pair whose every dish with p <= q has p = 0, so a handful of runs may pass the chi-square.
    expect(seen['accept-if-p-over-q'] / TRIALS).toBeGreaterThanOrEqual(0.5)
    // The boundary-inclusive comparison moves a dish by 1/65,536, which 20,000 draws do not show (packages/sim/spec/check.ts).
    expect(seen['boundary-inclusive'] / TRIALS).toBeLessThan(0.9)
  }, TIMEOUT_MS)
})
