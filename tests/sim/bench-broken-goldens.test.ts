/*
 * The broken-benchmark corpus's goldens (ARCHITECTURE §5.10): tests/fixtures/sim/broken-bench.json maps each seed to the case it draws, with
 * the SHA-256 of that output's canonical JSON. It is written only by `bun scripts/vectors.ts --write`, and a diff is reviewed like code.
 *
 * The test below re-runs every vector from the input the fixture itself records, without going through the script's registry, so the fixture
 * is shown to be self-contained, and then compares the registry with the file. `bun scripts/vectors.ts --check` is the gate.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BENCH_FLAWS, brokenBenchCase, brokenFlawOf, correctedInterval } from '../../packages/sim/bench'
import type { BenchFlaw } from '../../packages/sim/bench'
import { canonicalJson } from '../../packages/sim/core'
import { MODELS, renderFixture } from '../../scripts/vectors'

const root = path.resolve(import.meta.dirname, '../..')
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

interface FixtureVector {
  name: string
  input: { seed: number; flaw?: BenchFlaw }
  sha256: string
  output: {
    flaw: BenchFlaw
    attempts: number
    band: { ok: boolean; reasons: string[]; ratioMilli: number }
    claim: { valueUs: number; n: number; ratePerSMilli: number }
    answer: { p99Us: number; targetUs: number; n: number; how: string }
    interval: { pointUs: number; loUs: number; hiUs: number }
    rows: { count: number; sha256: string }
    server: { stalls?: unknown[]; cold?: unknown }
  }
}
const fixturePath = path.join(root, 'tests/fixtures/sim/broken-bench.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { header: string; model: string; vectors: FixtureVector[] }

/** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
function fromInput(input: FixtureVector['input']): unknown {
  const c = brokenBenchCase(input.seed, input.flaw === undefined ? {} : { flaw: input.flaw })
  const { setup, server } = c.scene
  const lengths = setup.lengths
  const digest = (value: unknown, count: number) => ({ count, sha256: sha256(canonicalJson(value)) })
  return {
    flaw: c.flaw,
    attempts: c.attempts,
    band: c.band,
    claimIds: c.claimIds,
    claim: c.scene.claim,
    answer: c.answer,
    interval: correctedInterval(c.scene, c.flaw),
    runSeed: c.scene.runSeed,
    capacityPerSMilli: c.scene.capacityPerSMilli,
    setup: { ...setup, ...(lengths !== undefined && lengths.kind === 'rows' ? { lengths: { kind: 'rows', slice: { id: lengths.slice.id, requests: digest(lengths.slice.requests, lengths.slice.requests.length) } } } : {}) },
    server: {
      maxNumSeqs: server.maxNumSeqs,
      maxBatchedTokens: server.maxBatchedTokens,
      chunkedPrefill: server.chunkedPrefill,
      gpu: server.gpu.label,
      ...(server.stalls === undefined ? {} : { stalls: server.stalls }),
      ...(server.cold === undefined ? {} : { cold: server.cold }),
    },
    rows: digest(c.scene.rows, c.scene.rows.length),
  }
}

describe('the broken-bench goldens (tests/fixtures/sim/broken-bench.json)', () => {
  test('hold twenty-two vectors, each named once, that between them draw every flaw and the control twice, all in band', () => {
    expect(fixture.model).toBe('broken-bench')
    expect(fixture.vectors).toHaveLength(22)
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(22)
    for (const flaw of BENCH_FLAWS) expect(fixture.vectors.filter((v) => v.output.flaw === flaw), flaw).toHaveLength(2)
    expect(fixture.vectors.map((v) => v.input.seed)).toEqual(Array.from({ length: 22 }, (_, i) => i))
    for (const v of fixture.vectors) {
      expect(v.output.flaw).toBe(brokenFlawOf(v.input.seed))
      expect(v.output.band.ok, v.name).toBe(true)
      expect(v.output.answer.n).toBeGreaterThanOrEqual(1000)
      expect(v.output.interval.loUs).toBeLessThanOrEqual(v.output.interval.pointUs)
      expect(v.output.interval.hiUs).toBeGreaterThanOrEqual(v.output.interval.pointUs)
      expect(v.output.interval.pointUs).toBe(v.output.answer.p99Us)
    }
    // The coordinated-omission vectors carry the freeze, and the warm-up ones the cold start.
    expect(fixture.vectors.filter((v) => v.output.flaw === 'coordinated-omission').every((v) => (v.output.server.stalls ?? []).length === 1)).toBe(true)
    expect(fixture.vectors.filter((v) => v.output.flaw === 'warm-up-counted').every((v) => v.output.server.cold !== undefined)).toBe(true)
  })

  test('reproduce byte for byte: each vector\'s input gives an output whose canonical JSON is the recorded one\'s, and has the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const made = canonicalJson(fromInput(vector.input))
      expect(made, vector.name).toBe(canonicalJson(vector.output))
      expect(sha256(made), vector.name).toBe(vector.sha256)
      expect(Buffer.byteLength(made, 'utf8')).toBeGreaterThan(500)
    }
  }, 120_000)

  test('are what the script writes: the registry has the same cases in the same order, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'broken-bench')!
    expect(model.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    expect(readFileSync(fixturePath, 'utf8')).toBe(renderFixture(model, root))
  }, 120_000)

  test('the registry\'s inputs are the fixture\'s inputs', () => {
    const model = MODELS.find((m) => m.model === 'broken-bench')!
    for (const [i, c] of model.cases(root).entries()) expect(canonicalJson(c.input)).toBe(canonicalJson(fixture.vectors[i].input))
  })

  test('would catch a changed output: one row\'s digest, or the claim moved by 1 µs, gives a different canonical JSON and hash', () => {
    const vector = fixture.vectors[0]
    const moved = structuredClone(vector.output)
    moved.claim.valueUs += 1
    expect(canonicalJson(moved)).not.toBe(canonicalJson(vector.output))
    expect(sha256(canonicalJson(moved))).not.toBe(vector.sha256)
    const rows = structuredClone(vector.output)
    rows.rows.count += 1
    expect(sha256(canonicalJson(rows))).not.toBe(vector.sha256)
  })
})
