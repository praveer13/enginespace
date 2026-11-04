/*
 * W1-T16's third acceptance check, "goldens reproduce" (ARCHITECTURE §5.10).
 *
 * tests/fixtures/sim/lifecycle.json maps scenarios of the Engine Floor's map level, with the seed and the jitter of a synthetic trace, to the
 * path each gives (every stage with its places, its mechanism and its citation) and the trace, with the SHA-256 of the canonical JSON of the
 * output. It is written only by `bun scripts/vectors.ts --write`. The goldens are re-run below from the input the fixture itself records,
 * with code of this file's own and not the script's registry, so that the fixture is shown to be self-contained, and a stage's citation,
 * label or place cannot move without a diff of the fixture to review.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalJson } from '../../packages/sim/core'
import { ENGINE_IDS, lifecycleTrace, pathFacts, referencePath } from '../../packages/sim/lifecycle'
import type { EngineId, LifecycleJitter, Scenario } from '../../packages/sim/lifecycle'
import { encodeTrace, traceChecks, traceToJson } from '../../packages/sim/trace'
import { MODELS, renderFixture } from '../../scripts/vectors'

const root = path.resolve(import.meta.dirname, '../..')
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

interface FixtureInput {
  scenario: Scenario
  seed: number
  jitter: LifecycleJitter
  output: 'full' | 'digest'
}
interface FixtureVector {
  name: string
  input: FixtureInput
  sha256: string
  output: Record<string, unknown>
}
const fixturePath = path.join(root, 'tests/fixtures/sim/lifecycle.json')
const fixtureText = readFileSync(fixturePath, 'utf8')
const fixture = JSON.parse(fixtureText) as { header: string; model: string; vectors: FixtureVector[] }

/** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
function recorded(input: FixtureInput): unknown {
  const stages = referencePath(input.scenario)
  const trace = lifecycleTrace(input.scenario, input.seed, input.jitter)
  const checks = traceChecks(trace)
  const facts = pathFacts(stages)
  if (input.output === 'full') return { path: stages, facts, trace: traceToJson(trace), checks }
  return {
    ids: stages.map((stage) => stage.id),
    pathSha256: sha256(canonicalJson(stages)),
    facts,
    counts: { spans: trace.spans.track.length, tracks: trace.tracks.length, flows: trace.flows.length, marks: trace.marks.length },
    traceSha256: sha256(encodeTrace(trace)),
    checks: checks.map(({ id, pass, checked }) => ({ id, pass, checked })),
  }
}

describe('the goldens (tests/fixtures/sim/lifecycle.json)', () => {
  test('hold sixteen vectors, each named once, whose inputs the fixture records in full, and cover every engine', () => {
    expect(fixture.model).toBe('lifecycle')
    expect(fixture.vectors).toHaveLength(16)
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(16)
    for (const v of fixture.vectors) expect(Object.keys(v.input).sort(), v.name).toEqual(['jitter', 'output', 'scenario', 'seed'])
    // One short path is recorded whole; the rest are recorded as their stage ids, hashes and counts.
    expect(fixture.vectors.filter((v) => v.input.output === 'full')).toHaveLength(1)
    for (const v of fixture.vectors) {
      expect(Object.keys(v.output).sort(), v.name).toEqual(v.input.output === 'full' ? ['checks', 'facts', 'path', 'trace'] : ['checks', 'counts', 'facts', 'ids', 'pathSha256', 'traceSha256'])
    }
    const engines = new Set<EngineId>(fixture.vectors.map((v) => v.input.scenario.engine))
    expect([...engines].sort()).toEqual([...ENGINE_IDS].sort())
    // Each engine has the abort, the tensor-parallel and the prefix-hit paths it supports, so a move in any of them shows.
    for (const id of ['mini-sglang', 'inside-vllm', 'vllm', 'sglang'] as const) {
      expect(fixture.vectors.some((v) => v.input.scenario.engine === id && v.input.scenario.tp === 2), id).toBe(true)
    }
    for (const id of ['mini-sglang', 'inside-vllm', 'vllm', 'sglang'] as const) {
      expect(fixture.vectors.some((v) => v.input.scenario.engine === id && v.input.scenario.abort), id).toBe(true)
    }
  })

  test('reproduce byte for byte: each vector\'s input gives a path and a trace whose recorded form is the fixture\'s output, with the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const made = canonicalJson(recorded(vector.input))
      expect(made, vector.name).toBe(canonicalJson(vector.output))
      expect(sha256(made), vector.name).toBe(vector.sha256)
    }
  })

  test('are what the script writes: the registry has the same cases in the same order, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'lifecycle')!
    expect(model.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    for (const [i, c] of model.cases(root).entries()) expect(canonicalJson(c.input), c.name).toBe(canonicalJson(fixture.vectors[i].input))
    expect(fixtureText).toBe(renderFixture(model, root))
  })

  test('would catch a changed output: a citation line moved by one, or one kernel moved by 1 ns, gives a different hash', () => {
    const vector = fixture.vectors.find((v) => v.input.output === 'full')!
    const moved = structuredClone(vector.output) as { path: { source: { line: number } }[]; trace: { spans: { startNs: number[] } } }
    moved.path[3].source.line += 1
    expect(sha256(canonicalJson(moved))).not.toBe(vector.sha256)
    const later = structuredClone(vector.output) as { path: unknown; trace: { spans: { startNs: number[] } } }
    later.trace.spans.startNs[7] += 1
    expect(canonicalJson(later)).not.toBe(canonicalJson(vector.output))
    // And the path's hash in a digest is of the path whole, so a changed label shows.
    const digest = fixture.vectors.find((v) => v.input.output === 'digest')!
    const labelled = referencePath(digest.input.scenario).map((s, i) => (i === 0 ? { ...s, label: `${s.label}!` } : s))
    expect(sha256(canonicalJson(labelled))).not.toBe(digest.output.pathSha256)
  })

  test('record the checks passing in every vector, the ids of the path, and counts that add up', () => {
    for (const v of fixture.vectors) {
      const checks = v.output.checks as { id: string; pass: boolean }[]
      expect(checks.every((c) => c.pass), v.name).toBe(true)
      expect(checks.map((c) => c.id), v.name).toEqual(['structure', 'T2', 'T3', 'T4', 'T5'])
      const ids = (v.input.output === 'full' ? (v.output.path as { id: string }[]).map((s) => s.id) : (v.output.ids as string[]))
      expect(ids, v.name).toEqual(referencePath(v.input.scenario).map((s) => s.id))
      expect(new Set(ids).size, v.name).toBe(ids.length)
      const facts = v.output.facts as { stages: number; byMechanism: Record<string, number> }
      expect(facts.stages, v.name).toBe(ids.length)
      expect(Object.values(facts.byMechanism).reduce((a, b) => a + b, 0), v.name).toBe(ids.length)
    }
  })
})
