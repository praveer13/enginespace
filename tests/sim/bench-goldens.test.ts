/*
 * The benchmark generator's goldens (ARCHITECTURE §5.10): tests/fixtures/sim/bench.json maps each input, a spec with a seed, a server
 * and the summary options, to the client's log and its summary, with the SHA-256 of that output's canonical JSON. It is written only
 * by `bun scripts/vectors.ts --write`, and a diff is reviewed like code.
 *
 * The test below re-runs every vector from the input the fixture itself records, without going through the script's registry, so the
 * fixture is shown to be self-contained, and then compares the registry with the file. `bun scripts/vectors.ts --check` is the gate.
 */
import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runBench, summarize } from '../../packages/sim/bench'
import type { ArrivalSpec, BenchSpec, OpenArrivals, ServerModel } from '../../packages/sim/bench'
import { canonicalJson } from '../../packages/sim/core'
import { TICK_CARD, s5Card } from '../../packages/sim/steploop'
import type { GpuCard } from '../../packages/sim/steploop'
import { parseSlice } from '../../packages/sim/workload'
import type { TraceSlice } from '../../packages/sim/workload'
import { MODELS, renderFixture } from '../../scripts/vectors'

const root = path.resolve(import.meta.dirname, '../..')
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

type OpenInput = Exclude<OpenArrivals, { kind: 'replay' }> | { kind: 'replay'; slice: string; speedPermille: number }
type ArrivalInput = OpenInput | { kind: 'closed'; clients: number; thinkUs: number; schedule?: OpenInput }

interface FixtureVector {
  name: string
  input: {
    seed: number
    spec: Omit<BenchSpec, 'arrivals'> & { arrivals: ArrivalInput }
    server: Omit<ServerModel, 'gpu'> & { gpu: { card: 'tick' } | { card: 's5'; row: Parameters<typeof s5Card>[0]; tp: number; hostTerm: 'in-gpu' | 'on-cpu' } }
    summary: { bootstrap: number; seed: number }
    output: 'full' | 'digest'
  }
  sha256: string
  output: { rows: unknown; summary: unknown; steps: number; endUs: number; gpuBusyUs: number }
}
const fixturePath = path.join(root, 'tests/fixtures/sim/bench.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { header: string; model: string; vectors: FixtureVector[] }

const slices = new Map<string, TraceSlice>()
function slice(id: string): TraceSlice {
  let s = slices.get(id)
  if (s === undefined) {
    s = parseSlice(JSON.parse(readFileSync(path.join(root, 'vendor/kernelspace/public/traces', `${id}.json`), 'utf8')))
    slices.set(id, s)
  }
  return s
}

const open = (a: OpenInput): OpenArrivals => (a.kind === 'replay' ? { kind: 'replay', slice: slice(a.slice), speedPermille: a.speedPermille } : a)

/** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
function fromInput(input: FixtureVector['input']): FixtureVector['output'] {
  const a = input.spec.arrivals
  const arrivals: ArrivalSpec = a.kind === 'closed' ? { kind: 'closed', clients: a.clients, thinkUs: a.thinkUs, ...(a.schedule === undefined ? {} : { schedule: open(a.schedule) }) } : open(a)
  const gpu: GpuCard = input.server.gpu.card === 'tick' ? TICK_CARD : s5Card(input.server.gpu.row, input.server.gpu.tp, input.server.gpu.hostTerm)
  const run = runBench(input.seed, { ...input.spec, arrivals }, { ...input.server, gpu })
  const summary = summarize(run, input.summary)
  const rows = input.output === 'full' ? run.rows : { count: run.rows.length, sha256: sha256(canonicalJson(run.rows)) }
  return { rows, summary, steps: run.steps, endUs: run.endUs, gpuBusyUs: run.gpuBusyUs }
}

describe('the bench goldens (tests/fixtures/sim/bench.json)', () => {
  test('hold twelve vectors, each named once, that between them cover every arrival kind, the stall, the cold start and the three flaws of the client', () => {
    expect(fixture.model).toBe('bench')
    expect(fixture.vectors).toHaveLength(12)
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(12)
    const kinds = new Set<string>()
    for (const v of fixture.vectors) {
      const a = v.input.spec.arrivals
      kinds.add(a.kind)
      if (a.kind === 'closed') kinds.add(a.schedule === undefined ? 'closed-pure' : `closed-${a.schedule.kind}`)
    }
    expect([...kinds].sort()).toEqual(['closed', 'closed-burst', 'closed-poisson', 'closed-pure', 'poisson', 'replay'])
    const servers = fixture.vectors.map((v) => v.input.server)
    expect(servers.some((s) => s.stalls !== undefined)).toBe(true)
    expect(servers.some((s) => s.cold !== undefined)).toBe(true)
    const specs = fixture.vectors.map((v) => v.input.spec)
    expect(specs.some((s) => s.outputCap !== undefined)).toBe(true)
    expect(specs.some((s) => s.prefixWarm === true)).toBe(true)
    expect(specs.some((s) => s.clientCostUs !== undefined)).toBe(true)
  })

  test('reproduce byte for byte: each vector\'s input gives an output whose canonical JSON is the recorded one\'s, and has the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const made = canonicalJson(fromInput(vector.input))
      expect(made, vector.name).toBe(canonicalJson(vector.output))
      expect(sha256(made), vector.name).toBe(vector.sha256)
      expect(Buffer.byteLength(made, 'utf8')).toBeGreaterThan(500)
    }
  })

  test('are what the script writes: the registry has the same cases in the same order, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'bench')!
    expect(model.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    expect(readFileSync(fixturePath, 'utf8')).toBe(renderFixture(model, root))
  })

  test('the registry\'s inputs are the fixture\'s inputs', () => {
    const model = MODELS.find((m) => m.model === 'bench')!
    for (const [i, c] of model.cases(root).entries()) expect(canonicalJson(c.input)).toBe(canonicalJson(fixture.vectors[i].input))
  })

  test('would catch a changed output: one row moved by 1 µs gives a different canonical JSON and hash', () => {
    const vector = fixture.vectors[0]
    const moved = structuredClone(vector.output) as unknown as { rows: { doneUs: number }[] }
    moved.rows[5].doneUs += 1
    expect(canonicalJson(moved)).not.toBe(canonicalJson(vector.output))
    expect(sha256(canonicalJson(moved))).not.toBe(vector.sha256)
  })

  test('the two tick-world vectors tell the story of check 1 on a page: the same schedule, sent on time and then held back by two clients', () => {
    const [openLoop, closedLoop] = fixture.vectors.slice(0, 2).map((v) => v.output.rows as { dueUs: number; sentUs: number; client: number | null; id: number }[])
    expect(openLoop.every((r) => r.sentUs === r.dueUs && r.client === null)).toBe(true)
    expect(closedLoop.map((r) => r.dueUs)).toEqual(openLoop.map((r) => r.dueUs))
    expect(closedLoop.some((r) => r.sentUs > r.dueUs)).toBe(true)
    expect(closedLoop.every((r) => r.client === 0 || r.client === 1)).toBe(true)
  })
})
