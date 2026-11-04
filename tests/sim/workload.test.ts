/*
 * W0-T12 acceptance check 3: workload goldens reproduce byte for byte, and `bun scripts/vectors.ts --check` passes.
 * Around it, the properties of ARCHITECTURE §5.10 for the workload module (200 seeds on a PR [estimated]): the structure of every
 * workload, the distributions of every draw, the independence of the sub-streams, and replay from the vendored slices.
 *
 * tests/fixtures/sim/workload.json maps inputs to the canonical JSON of the workload each gives, with its SHA-256. It is written only
 * by `bun scripts/vectors.ts --write`. The test below re-runs every vector from the input the fixture itself records, without going
 * through the script's registry, so the fixture is shown to be self-contained, and then runs the script as CI does.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EXP_BINS, EXP_QUANTILES, EXP_SCALE, canonicalJson, divRound, rngFor, sum } from '../../packages/sim/core'
import {
  SLICE_IDS,
  formatCredit,
  genWorkload,
  originLabel,
  parseSlice,
  replayWorkload,
  sliceCredit,
  sliceTickUs,
} from '../../packages/sim/workload'
import type { Dist, ReqSpec, SliceId, TraceSlice, Workload, WorkloadSpec } from '../../packages/sim/workload'
import { MODELS, renderFixture } from '../../scripts/vectors'

const root = path.resolve(import.meta.dirname, '../..')
const TRACES = 'vendor/kernelspace/public/traces'

const slices = Object.fromEntries(SLICE_IDS.map((id) => [id, parseSlice(JSON.parse(readFileSync(path.join(root, TRACES, `${id}.json`), 'utf8')))])) as Record<SliceId, TraceSlice>
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

/** Four standard deviations of a binomial count: a deterministic test with seeds fixed in advance, so this is a check of shape, not a gamble. */
const within = (observed: number, n: number, p: number) => Math.abs(observed - n * p) < 4 * Math.sqrt(n * p * (1 - p))

// ---------------------------------------------------------------------------------------------------------------------------
// The goldens

interface FixtureVector {
  name: string
  input: { fn: 'genWorkload' | 'replayWorkload'; seed: number; spec: Record<string, unknown> & { slice?: SliceId; lengths?: { kind: string; slice?: SliceId } } }
  sha256: string
  output: Workload
}
const fixturePath = path.join(root, 'tests/fixtures/sim/workload.json')
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as { header: string; model: string; vectors: FixtureVector[] }

/** What a vector's input means, written here from the fixture's own words and not from scripts/vectors.ts. */
function fromInput(input: FixtureVector['input']): Workload {
  const { spec } = input
  if (input.fn === 'replayWorkload') return replayWorkload(input.seed, { ...spec, slice: slices[spec.slice as SliceId] } as never)
  const lengths = spec.lengths as { kind: string; slice?: SliceId }
  return genWorkload(input.seed, { ...spec, lengths: lengths.kind === 'rows' ? { kind: 'rows', slice: slices[lengths.slice as SliceId] } : lengths } as never)
}

describe('the workload goldens (tests/fixtures/sim/workload.json)', () => {
  test('hold ten vectors, each named once, whose inputs the fixture records in full', () => {
    expect(fixture.model).toBe('workload')
    expect(fixture.vectors).toHaveLength(10)
    expect(new Set(fixture.vectors.map((v) => v.name)).size).toBe(10)
    expect(new Set(fixture.vectors.map((v) => v.input.fn))).toEqual(new Set(['genWorkload', 'replayWorkload']))
    expect(fixture.vectors.map((v) => v.input.seed)).toContain(0)
    expect(fixture.vectors.map((v) => v.input.seed)).toContain(0xffffffff)
  })

  test('reproduce byte for byte: each vector\'s input gives a workload whose canonical JSON is the recorded output\'s, and has the recorded SHA-256', () => {
    for (const vector of fixture.vectors) {
      const made = canonicalJson(fromInput(vector.input))
      expect(made, vector.name).toBe(canonicalJson(vector.output))
      expect(sha256(made), vector.name).toBe(vector.sha256)
      expect(Buffer.byteLength(made, 'utf8')).toBeGreaterThan(100)
    }
  })

  test('are what the script writes: the registry has the same cases in the same order, and the fixture\'s bytes are renderFixture\'s', () => {
    const model = MODELS.find((m) => m.model === 'workload')!
    expect(model.cases(root).map((c) => c.name)).toEqual(fixture.vectors.map((v) => v.name))
    expect(readFileSync(fixturePath, 'utf8')).toBe(renderFixture(model, root))
  })

  test('the registry\'s inputs are the fixture\'s inputs', () => {
    const model = MODELS.find((m) => m.model === 'workload')!
    for (const [i, c] of model.cases(root).entries()) expect(canonicalJson(c.input)).toBe(canonicalJson(fixture.vectors[i].input))
  })

  test('would catch a changed output: one request moved by 1 µs gives a different canonical JSON and hash', () => {
    const vector = fixture.vectors[2]
    const moved = structuredClone(vector.output) as unknown as { reqs: { dueUs: number }[] }
    moved.reqs[5].dueUs += 1
    expect(canonicalJson(moved)).not.toBe(canonicalJson(vector.output))
    expect(sha256(canonicalJson(moved))).not.toBe(vector.sha256)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// scripts/vectors.ts as a process

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

/** A tree with what `vectors.ts --root` reads: the fixtures, the generated table and the vendored slices. */
function tree(options: { fixture?: boolean } = {}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-vectors-'))
  scratch.push(dir)
  const put = (rel: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    copyFileSync(path.join(root, rel), path.join(dir, rel))
  }
  put('packages/sim/core/exp-quantiles.ts')
  for (const id of SLICE_IDS) put(`${TRACES}/${id}.json`)
  if (options.fixture !== false) {
    put('tests/fixtures/sim/workload.json')
    put('tests/fixtures/sim/steploop.json')
  }
  return dir
}

function vectors(...args: string[]) {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/vectors.ts'), ...args], { cwd: root, encoding: 'utf8' })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

describe('bun scripts/vectors.ts', () => {
  test('--check passes on the repository, and says what it checked', () => {
    const run = vectors('--check')
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('2 model(s), 24 vector(s) and the exponential table match')
  })

  test('--check fails when one output moves by one digit, and names the vector', () => {
    const dir = tree()
    const file = path.join(dir, 'tests/fixtures/sim/workload.json')
    const text = readFileSync(file, 'utf8')
    const at = text.indexOf('"dueUs":') + '"dueUs":'.length
    writeFileSync(file, text.slice(0, at) + (text[at] === '9' ? '8' : '9') + text.slice(at + 1))
    const run = vectors('--check', '--root', dir)
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/tests\/fixtures\/sim\/workload\.json: vector "front page: a burst of 12.*": its output changed/)
    expect(run.stderr).toContain('bun scripts/vectors.ts --write')
  })

  test('--check fails on a changed input, a vector the models no longer produce and one the fixture lacks', () => {
    const dir = tree()
    const file = path.join(dir, 'tests/fixtures/sim/workload.json')
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { vectors: { name: string; input: { seed: number } }[] }
    parsed.vectors[0].input.seed += 1
    parsed.vectors[1].name = 'a vector that was renamed'
    writeFileSync(file, JSON.stringify(parsed, null, 2))
    const run = vectors('--check', '--root', dir)
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('its input changed')
    expect(run.stderr).toContain('vector "a decode batch of 64 requests due at once" is not in the fixture')
    expect(run.stderr).toContain('vector "a vector that was renamed" is in the fixture and no model produces it')
  })

  test('--check fails on formatting alone, since the bytes are the golden', () => {
    const dir = tree()
    const file = path.join(dir, 'tests/fixtures/sim/workload.json')
    writeFileSync(file, readFileSync(file, 'utf8').replace('"model": "workload"', '"model":   "workload"'))
    const run = vectors('--check', '--root', dir)
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('no vector moved (formatting)')
  })

  test('--check fails on a missing fixture, a fixture no model owns, and a table that is not what the generator writes', () => {
    const missing = vectors('--check', '--root', tree({ fixture: false }))
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('tests/fixtures/sim/workload.json is missing')

    const stray = tree()
    writeFileSync(path.join(stray, 'tests/fixtures/sim/not-a-model.json'), '{}')
    const strayRun = vectors('--check', '--root', stray)
    expect(strayRun.status).toBe(1)
    expect(strayRun.stderr).toContain('tests/fixtures/sim/not-a-model.json is a fixture no model owns')

    const stale = tree()
    const table = path.join(stale, 'packages/sim/core/exp-quantiles.ts')
    writeFileSync(table, readFileSync(table, 'utf8').replace('32, 96, 160', '32, 96, 161'))
    const tableRun = vectors('--check', '--root', stale)
    expect(tableRun.status).toBe(1)
    expect(tableRun.stderr).toContain('packages/sim/core/exp-quantiles.ts is not what the generator writes')
  })

  test('--write regenerates a missing fixture in the tree it is given, byte for byte as committed, and leaves this tree alone', () => {
    const dir = tree({ fixture: false })
    const before = readFileSync(fixturePath, 'utf8')
    const run = vectors('--write', '--root', dir)
    expect(run.status).toBe(0)
    expect(readFileSync(path.join(dir, 'tests/fixtures/sim/workload.json'), 'utf8')).toBe(before)
    expect(readFileSync(fixturePath, 'utf8')).toBe(before)
    expect(vectors('--check', '--root', dir).status).toBe(0)
  })

  test('--write then --check is a fixed point: writing twice changes nothing', () => {
    const dir = tree({ fixture: false })
    vectors('--write', '--root', dir)
    const once = readFileSync(path.join(dir, 'tests/fixtures/sim/workload.json'), 'utf8')
    vectors('--write', '--root', dir)
    expect(readFileSync(path.join(dir, 'tests/fixtures/sim/workload.json'), 'utf8')).toBe(once)
  })

  test('exits 2 with the usage on no mode, an unknown argument and a dangling --root', () => {
    for (const args of [[], ['--nope'], ['--check', '--root']]) {
      const run = vectors(...args)
      expect(run.status, args.join(' ')).toBe(2)
      expect(run.stderr).toContain('usage: bun scripts/vectors.ts')
    }
  })

  test('verify:determinism runs it, now that the script exists', () => {
    const registry = spawnSync(process.execPath, [path.join(root, 'scripts/verify.ts'), 'list'], { cwd: root, encoding: 'utf8' })
    expect(registry.stdout).toMatch(/\n +live +W0-T12 +scripts\/vectors\.ts --check\n/)
    expect(existsSync(path.join(root, 'scripts/vectors.ts'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Structure and distribution

const burst12: WorkloadSpec = {
  requests: 12,
  arrivals: { kind: 'burst' },
  lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'menu', values: [1, 2, 3, 4, 6, 8, 12, 16], weights: [24, 20, 16, 12, 10, 8, 6, 4] } },
}

const busy: WorkloadSpec = {
  requests: 60,
  arrivals: { kind: 'poisson', ratePerSMilli: 12_500 },
  lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 8, hi: 700 }, output: { kind: 'menu', values: [1, 4, 32, 256], weights: [5, 3, 2, 1] } },
  prefix: { groups: 5, prefixTokens: 128, sharePermille: 600 },
  adapters: { count: 4, sharePermille: 500, weights: [8, 4, 2, 1] },
  structuredPermille: 300,
}

function expectWellFormed(w: Workload, spec: WorkloadSpec): void {
  expect(w.reqs).toHaveLength(spec.requests)
  w.reqs.forEach((r: ReqSpec, i) => {
    expect(r.id).toBe(i)
    expect(Number.isSafeInteger(r.dueUs) && r.dueUs >= 0).toBe(true)
    if (i > 0) expect(r.dueUs).toBeGreaterThanOrEqual(w.reqs[i - 1].dueUs)
    expect(Number.isSafeInteger(r.promptTokens) && r.promptTokens >= 1).toBe(true)
    expect(Number.isSafeInteger(r.outputTokens) && r.outputTokens >= 1).toBe(true)
    if (r.prefixGroup === null) expect(r.prefixTokens).toBe(0)
    else {
      expect(r.prefixGroup).toBeGreaterThanOrEqual(0)
      expect(r.prefixGroup).toBeLessThan(spec.prefix!.groups)
      expect(r.prefixTokens).toBe(Math.min(spec.prefix!.prefixTokens, r.promptTokens))
    }
    if (r.adapter !== null) {
      expect(r.adapter).toBeGreaterThanOrEqual(0)
      expect(r.adapter).toBeLessThan(spec.adapters!.count)
    }
    expect(typeof r.structured).toBe('boolean')
  })
}

describe('every workload', () => {
  test('is well formed for 200 seeds and a spec that uses every feature: dense ids, ordered integer times, lengths of at least 1, shared prefixes inside their prompts', () => {
    for (let seed = 1; seed <= 200; seed++) expectWellFormed(genWorkload(seed, busy), busy)
    for (const seed of [0, 0xffffffff]) expectWellFormed(genWorkload(seed, busy), busy)
  })

  test('is a function of the seed and the spec alone: the same call twice, and a canonical JSON that is the same string', () => {
    for (const seed of [0, 1, 99, 0xffffffff]) {
      const a = genWorkload(seed, busy)
      const b = genWorkload(seed, busy)
      expect(canonicalJson(a)).toBe(canonicalJson(b))
      expect(a).toEqual(b)
    }
    expect(canonicalJson(genWorkload(1, busy))).not.toBe(canonicalJson(genWorkload(2, busy)))
  })

  test('does not depend on how many requests are asked for: the first 20 of 60 are the 20', () => {
    for (const seed of [1, 7, 123]) {
      const few = genWorkload(seed, { ...busy, requests: 20 })
      const many = genWorkload(seed, busy)
      expect(many.reqs.slice(0, 20)).toEqual(few.reqs)
    }
  })

  test('is empty for no requests, and says where it came from', () => {
    const empty = genWorkload(5, { ...busy, requests: 0 })
    expect(empty.reqs).toEqual([])
    expect(empty.origin).toEqual({ kind: 'synthetic' })
    expect(originLabel(empty.origin)).toBe('synthetic')
    expect(empty.seed).toBe(5)
  })

  test('rejects a seed that is not an unsigned 32-bit integer', () => {
    for (const bad of [-1, 2 ** 32, 1.5]) {
      expect(() => genWorkload(bad, burst12)).toThrow(RangeError)
      expect(() => replayWorkload(bad, { slice: slices['burstgpt-v2-busiest-minute'], speedPermille: 1000 })).toThrow(RangeError)
    }
  })
})

describe('arrivals', () => {
  test('a burst is due all at once, at 0 or where it is told to be', () => {
    expect(genWorkload(1, burst12).reqs.every((r) => r.dueUs === 0)).toBe(true)
    expect(genWorkload(1, { ...burst12, arrivals: { kind: 'burst', atUs: 1500 } }).reqs.every((r) => r.dueUs === 1500)).toBe(true)
  })

  test('even arrivals are start + i · gap, exactly', () => {
    const w = genWorkload(2, { ...burst12, arrivals: { kind: 'even', gapUs: 250, startUs: 40 } })
    expect(w.reqs.map((r) => r.dueUs)).toEqual(Array.from({ length: 12 }, (_, i) => 40 + 250 * i))
    expect(genWorkload(2, { ...burst12, arrivals: { kind: 'even', gapUs: 0 } }).reqs.every((r) => r.dueUs === 0)).toBe(true)
  })

  test('Poisson gaps are the table\'s bins: each is divRound(entry · 10^9, 65,536 · rate) in BigInt, over the stream named workload/arrivals', () => {
    const rate = 8000
    for (const seed of [0, 3, 0xffffffff]) {
      const w = genWorkload(seed, { ...burst12, requests: 200, arrivals: { kind: 'poisson', ratePerSMilli: rate } })
      const raw = rngFor(seed, 'workload/arrivals')
      let at = 0n
      for (const r of w.reqs) {
        // 1024 is a power of two, so below(1024) is the low 10 bits of one draw.
        const bin = raw() & (EXP_BINS - 1)
        const numerator = BigInt(EXP_QUANTILES[bin]) * 1_000_000_000n
        const denominator = BigInt(EXP_SCALE) * BigInt(rate)
        at += (2n * numerator + denominator) / (2n * denominator)
        expect(r.dueUs).toBe(Number(at))
      }
    }
  })

  test('Poisson arrivals have the requested rate: the mean gap over 20,000 requests is within four standard errors of 10^9 / rate µs', () => {
    for (const [rate, seed] of [[1000, 11], [8000, 12], [250_000, 13]] as const) {
      const n = 20_000
      const w = genWorkload(seed, { requests: n, arrivals: { kind: 'poisson', ratePerSMilli: rate }, lengths: burst12.lengths })
      const mean = 1_000_000_000 / rate
      const observed = w.reqs[n - 1].dueUs / n
      expect(Math.abs(observed - mean)).toBeLessThan((4 * mean) / Math.sqrt(n) + 1)
    }
  })

  test('Poisson gaps look exponential: about e^-1 of them exceed the mean, and their spread is about their mean', () => {
    const n = 20_000
    const w = genWorkload(21, { requests: n, arrivals: { kind: 'poisson', ratePerSMilli: 4000 }, lengths: burst12.lengths })
    const gaps = w.reqs.map((r, i) => r.dueUs - (i === 0 ? 0 : w.reqs[i - 1].dueUs))
    const mean = sum(gaps) / n
    expect(within(gaps.filter((g) => g > mean).length, n, Math.exp(-1))).toBe(true)
    const sd = Math.sqrt(gaps.reduce((t, g) => t + (g - mean) * (g - mean), 0) / n)
    expect(sd / mean).toBeGreaterThan(0.95)
    expect(sd / mean).toBeLessThan(1.05)
  })

  test('a doubled rate halves every arrival time, give or take the rounding of each gap (the same bins are drawn)', () => {
    const spec = (rate: number): WorkloadSpec => ({ requests: 300, arrivals: { kind: 'poisson', ratePerSMilli: rate }, lengths: burst12.lengths })
    const slow = genWorkload(4, spec(5000))
    const fast = genWorkload(4, spec(10_000))
    for (let i = 0; i < 300; i++) expect(Math.abs(2 * fast.reqs[i].dueUs - slow.reqs[i].dueUs)).toBeLessThanOrEqual(2 * (i + 1))
  })

  test('start offsets move every arrival and nothing else', () => {
    const base = genWorkload(5, busy)
    const late = genWorkload(5, { ...busy, arrivals: { kind: 'poisson', ratePerSMilli: 12_500, startUs: 3000 } })
    expect(late.reqs.map((r) => r.dueUs - 3000)).toEqual(base.reqs.map((r) => r.dueUs))
    const withoutTime = (w: Workload) => w.reqs.map((r) => Object.fromEntries(Object.entries(r).filter(([name]) => name !== 'dueUs')))
    expect(withoutTime(late)).toEqual(withoutTime(base))
  })
})

describe('lengths', () => {
  const lengthsOnly = (prompt: Dist, output: Dist, n: number, seed = 31) =>
    genWorkload(seed, { requests: n, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt, output } })

  test('a menu follows its integer weights: every value within four standard deviations over 20,000 requests', () => {
    const { values, weights } = burst12.lengths.kind === 'dists' && burst12.lengths.output.kind === 'menu' ? burst12.lengths.output : { values: [], weights: [] }
    const n = 20_000
    const w = lengthsOnly({ kind: 'const', value: 1 }, { kind: 'menu', values, weights }, n)
    const total = sum([...weights])
    values.forEach((value, i) => {
      expect(within(w.reqs.filter((r) => r.outputTokens === value).length, n, weights[i] / total), `value ${value}`).toBe(true)
    })
  })

  test('a menu entry with weight 0 never appears, and values are taken as written', () => {
    const w = lengthsOnly({ kind: 'menu', values: [10, 20, 30], weights: [1, 0, 1] }, { kind: 'const', value: 3 }, 2000)
    expect(new Set(w.reqs.map((r) => r.promptTokens))).toEqual(new Set([10, 30]))
  })

  test('uniform reaches both ends and stays inside them', () => {
    const w = lengthsOnly({ kind: 'uniform', lo: 5, hi: 9 }, { kind: 'uniform', lo: 1, hi: 1 }, 3000)
    expect(new Set(w.reqs.map((r) => r.promptTokens))).toEqual(new Set([5, 6, 7, 8, 9]))
    expect(w.reqs.every((r) => r.outputTokens === 1)).toBe(true)
  })

  test('prompt and output are independent streams: changing one distribution leaves the other\'s draws and the arrivals alone', () => {
    const base = genWorkload(8, busy)
    const other = genWorkload(8, { ...busy, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 8, hi: 700 }, output: { kind: 'uniform', lo: 1, hi: 9 } } })
    expect(other.reqs.map((r) => r.promptTokens)).toEqual(base.reqs.map((r) => r.promptTokens))
    expect(other.reqs.map((r) => r.dueUs)).toEqual(base.reqs.map((r) => r.dueUs))
    expect(other.reqs.map((r) => r.outputTokens)).not.toEqual(base.reqs.map((r) => r.outputTokens))
  })

  test('rows resamples (prompt, output) pairs of a slice with replacement, keeping each pair together', () => {
    const slice = slices['burstgpt-v2-busiest-hour']
    const pairs = new Set(slice.requests.map((row) => `${row.p}/${row.o}`))
    const w = genWorkload(9, { requests: 500, arrivals: { kind: 'burst' }, lengths: { kind: 'rows', slice } })
    expect(w.reqs.every((r) => pairs.has(`${r.promptTokens}/${r.outputTokens}`))).toBe(true)
    expect(new Set(w.reqs.map((r) => `${r.promptTokens}/${r.outputTokens}`)).size).toBeGreaterThan(150)
    expect(w.origin.kind).toBe('slice')
    if (w.origin.kind === 'slice') expect(w.origin.use).toBe('lengths')
  })
})

describe('what requests share and carry', () => {
  const decorated = (extra: Partial<WorkloadSpec>, n = 20_000): Workload =>
    genWorkload(41, { requests: n, arrivals: { kind: 'burst' }, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 64, hi: 512 }, output: { kind: 'const', value: 4 } }, ...extra })

  test('prefix groups: the member share and the groups\' shares are their probabilities, and a prefix never exceeds its prompt', () => {
    const n = 20_000
    const w = decorated({ prefix: { groups: 4, prefixTokens: 300, sharePermille: 350 } }, n)
    const members = w.reqs.filter((r) => r.prefixGroup !== null)
    expect(within(members.length, n, 0.35)).toBe(true)
    for (let g = 0; g < 4; g++) expect(within(members.filter((r) => r.prefixGroup === g).length, members.length, 0.25)).toBe(true)
    expect(members.every((r) => r.prefixTokens === Math.min(300, r.promptTokens))).toBe(true)
    expect(w.reqs.filter((r) => r.prefixGroup === null).every((r) => r.prefixTokens === 0)).toBe(true)
  })

  test('adapters: the share of requests that ask for one, and the weights among them (8:4:2:1 here)', () => {
    const n = 30_000
    const w = decorated({ adapters: { count: 4, sharePermille: 400, weights: [8, 4, 2, 1] } }, n)
    const users = w.reqs.filter((r) => r.adapter !== null)
    expect(within(users.length, n, 0.4)).toBe(true)
    ;[8 / 15, 4 / 15, 2 / 15, 1 / 15].forEach((p, a) => expect(within(users.filter((r) => r.adapter === a).length, users.length, p), `adapter ${a}`).toBe(true))
    const uniform = decorated({ adapters: { count: 3, sharePermille: 1000 } }, 9000)
    for (let a = 0; a < 3; a++) expect(within(uniform.reqs.filter((r) => r.adapter === a).length, 9000, 1 / 3)).toBe(true)
  })

  test('grammars: the structured share is its probability, and 0 and 1000 are none and all', () => {
    const n = 20_000
    expect(within(decorated({ structuredPermille: 250 }, n).reqs.filter((r) => r.structured).length, n, 0.25)).toBe(true)
    expect(decorated({ structuredPermille: 0 }, 500).reqs.some((r) => r.structured)).toBe(false)
    expect(decorated({ structuredPermille: 1000 }, 500).reqs.every((r) => r.structured)).toBe(true)
    expect(decorated({}, 500).reqs.some((r) => r.structured)).toBe(false)
  })

  test('each feature has a stream of its own: switching one on or off leaves every other field of every request as it was', () => {
    const base = decorated({}, 400)
    const strip = (w: Workload, keep: (keyof ReqSpec)[]) => w.reqs.map((r) => Object.fromEntries(keep.map((k) => [k, r[k]])))
    const timing: (keyof ReqSpec)[] = ['id', 'dueUs', 'promptTokens', 'outputTokens']
    const prefix = decorated({ prefix: { groups: 3, prefixTokens: 50, sharePermille: 500 } }, 400)
    const adapters = decorated({ adapters: { count: 5, sharePermille: 500 } }, 400)
    const grammar = decorated({ structuredPermille: 500 }, 400)
    const all = decorated({ prefix: { groups: 3, prefixTokens: 50, sharePermille: 500 }, adapters: { count: 5, sharePermille: 500 }, structuredPermille: 500 }, 400)
    for (const w of [prefix, adapters, grammar, all]) expect(strip(w, timing)).toEqual(strip(base, timing))
    // With all three on, each feature's draws are the ones it makes alone.
    expect(strip(all, ['prefixGroup', 'prefixTokens'])).toEqual(strip(prefix, ['prefixGroup', 'prefixTokens']))
    expect(strip(all, ['adapter'])).toEqual(strip(adapters, ['adapter']))
    expect(strip(all, ['structured'])).toEqual(strip(grammar, ['structured']))
  })

  test('a draw is made for every request whether or not it is used: the group a member joins does not depend on the share', () => {
    const at = (sharePermille: number) => decorated({ prefix: { groups: 6, prefixTokens: 40, sharePermille } }, 1000)
    const everyone = at(1000)
    const some = at(400)
    for (const [i, r] of some.reqs.entries()) if (r.prefixGroup !== null) expect(r.prefixGroup).toBe(everyone.reqs[i].prefixGroup)
    expect(some.reqs.filter((r) => r.prefixGroup !== null).length).toBeGreaterThan(300)
    // And the same for adapters, and for what is a grammar request.
    const adapterAt = (sharePermille: number) => decorated({ adapters: { count: 7, sharePermille } }, 1000)
    for (const [i, r] of adapterAt(300).reqs.entries()) if (r.adapter !== null) expect(r.adapter).toBe(adapterAt(1000).reqs[i].adapter)
    const grammarAt = (permille: number) => decorated({ structuredPermille: permille }, 1000).reqs.map((r) => r.structured)
    const fewer = grammarAt(200)
    const more = grammarAt(700)
    expect(fewer.every((s, i) => !s || more[i])).toBe(true)
  })
})

describe('a spec that cannot be drawn', () => {
  const bad: [string, WorkloadSpec, RegExp][] = [
    ['a negative count', { ...burst12, requests: -1 }, /requests/],
    ['a fractional count', { ...burst12, requests: 1.5 }, /requests/],
    ['a burst before time', { ...burst12, arrivals: { kind: 'burst', atUs: -1 } }, /atUs/],
    ['an even gap below 0', { ...burst12, arrivals: { kind: 'even', gapUs: -1 } }, /gapUs/],
    ['a Poisson rate of 0', { ...burst12, arrivals: { kind: 'poisson', ratePerSMilli: 0 } }, /ratePerSMilli/],
    ['a Poisson rate beyond a million a second', { ...burst12, arrivals: { kind: 'poisson', ratePerSMilli: 1_000_000_001 } }, /ratePerSMilli/],
    ['a Poisson start before time', { ...burst12, arrivals: { kind: 'poisson', ratePerSMilli: 5, startUs: -1 } }, /startUs/],
    ['a constant length of 0', { ...burst12, lengths: { kind: 'dists', prompt: { kind: 'const', value: 0 }, output: { kind: 'const', value: 1 } } }, /lengths\.prompt\.value/],
    ['a uniform range turned round', { ...burst12, lengths: { kind: 'dists', prompt: { kind: 'uniform', lo: 9, hi: 5 }, output: { kind: 'const', value: 1 } } }, /lengths\.prompt\.hi/],
    ['a menu with fewer weights than values', { ...burst12, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'menu', values: [1, 2], weights: [1] } } }, /menu/],
    ['a menu of nothing', { ...burst12, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'menu', values: [], weights: [] } } }, /menu/],
    ['a menu whose weights are all 0', { ...burst12, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'menu', values: [1, 2], weights: [0, 0] } } }, /weight above 0/],
    ['a menu value of 0', { ...burst12, lengths: { kind: 'dists', prompt: { kind: 'const', value: 1 }, output: { kind: 'menu', values: [0, 2], weights: [1, 1] } } }, /values\[0\]/],
    ['no prefix groups', { ...burst12, prefix: { groups: 0, prefixTokens: 4, sharePermille: 500 } }, /prefix\.groups/],
    ['a prefix share above 1000', { ...burst12, prefix: { groups: 2, prefixTokens: 4, sharePermille: 1001 } }, /prefix\.sharePermille/],
    ['an adapter share below 0', { ...burst12, adapters: { count: 2, sharePermille: -1 } }, /adapters\.sharePermille/],
    ['adapter weights of the wrong count', { ...burst12, adapters: { count: 3, sharePermille: 500, weights: [1, 2] } }, /adapters\.weights/],
    ['a grammar share above 1000', { ...burst12, structuredPermille: 1001 }, /structuredPermille/],
    ['an empty slice to resample lengths from', { ...burst12, lengths: { kind: 'rows', slice: { ...slices['burstgpt-v2-busiest-minute'], requests: [] } } }, /no rows/],
  ]
  for (const [name, spec, message] of bad) {
    test(`throws, naming the field, for ${name}`, () => {
      expect(() => genWorkload(1, spec)).toThrow(message)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------------
// Slices

describe('the vendored slices', () => {
  test('are the three files of public/traces, and parse: BurstGPT\'s hour and minute, and Mooncake\'s Kimi conversation', () => {
    expect([...SLICE_IDS]).toEqual(['burstgpt-v2-busiest-hour', 'burstgpt-v2-busiest-minute', 'kimi-conversation'])
    expect(SLICE_IDS.map((id) => slices[id].requests.length)).toEqual([480, 40, 1200])
    expect(SLICE_IDS.map((id) => slices[id].license)).toEqual(['CC-BY-4.0', 'CC-BY-4.0', 'Apache-2.0'])
  })

  test('hold the rows their own checksum says: the SHA-256 of the compact requests JSON is requestSha256', () => {
    for (const id of SLICE_IDS) {
      const slice = slices[id]
      expect(slice.requestSha256).not.toBeNull()
      expect(sha256(JSON.stringify(slice.requests))).toBe(slice.requestSha256!)
    }
  })

  test('say how long a tick is: 4 s for the BurstGPT hour, 1 s for the minute, 667 ms for Kimi', () => {
    expect(SLICE_IDS.map((id) => sliceTickUs(slices[id]))).toEqual([4_000_000, 1_000_000, 667_000])
  })

  test('carry their credit: the attribution, the licence, the source and the account of what was clamped', () => {
    const hour = sliceCredit(slices['burstgpt-v2-busiest-hour'])
    expect(hour).toEqual({
      id: 'burstgpt-v2-busiest-hour',
      license: 'CC-BY-4.0',
      attribution: 'BurstGPT authors (KDD 2025), HPMLL/BurstGPT',
      source: 'https://github.com/HPMLL/BurstGPT/releases/download/v2.0/BurstGPT_without_fails_1.csv',
      sourceRevision: 'v2.0',
      note: expect.stringContaining('clamped'),
    })
    const line = formatCredit(sliceCredit(slices['kimi-conversation']))
    for (const part of ['Mooncake authors', 'Apache-2.0', 'b82b9f86ceb67bb809339b9088085f34329683bb', 'clamped']) expect(line).toContain(part)
  })

  test('are credited in NOTICE, whose text names each slice\'s project and licence', () => {
    const notice = readFileSync(path.join(root, 'NOTICE'), 'utf8')
    for (const part of ['BurstGPT', 'CC BY 4.0', 'Mooncake', 'Apache License 2.0', 'burstgpt-v2-busiest-hour.json', 'kimi-conversation.json']) expect(notice).toContain(part)
  })
})

describe('parseSlice', () => {
  const good = () => JSON.parse(readFileSync(path.join(root, TRACES, 'burstgpt-v2-busiest-minute.json'), 'utf8')) as Record<string, unknown>

  test('accepts the artifacts as they are, and a slice with its optional fields left out', () => {
    for (const id of SLICE_IDS) expect(() => parseSlice(JSON.parse(readFileSync(path.join(root, TRACES, `${id}.json`), 'utf8')))).not.toThrow()
    const bare = good()
    delete bare.requestCount
    delete bare.requestSha256
    expect(parseSlice(bare).requestSha256).toBeNull()
  })

  test('rejects, naming what is wrong, a slice that is not an artifact of schema version 1', () => {
    const cases: [string, (s: Record<string, unknown>) => void, RegExp][] = [
      ['a wrong schema version', (s) => void (s.schemaVersion = 2), /schemaVersion/],
      ['no licence', (s) => void delete s.license, /license/],
      ['no attribution', (s) => void (s.attribution = ''), /attribution/],
      ['no sampling', (s) => void delete s.sampling, /sampling/],
      ['no requests', (s) => void (s.requests = []), /requests/],
      ['a tick that goes back', (s) => void ((s.requests as { t: number }[])[3].t = 0), /request 3.*tick/],
      ['a prompt of 0 tokens', (s) => void ((s.requests as { p: number }[])[2].p = 0), /request 2.*prompt/],
      ['an output of 1.5 tokens', (s) => void ((s.requests as { o: number }[])[1].o = 1.5), /request 1.*output/],
      ['a request that is not an object', (s) => void ((s.requests as unknown[])[0] = 7), /request 0/],
      ['a count that disagrees with the rows', (s) => void (s.requestCount = 41), /requestCount/],
      ['no tick length', (s) => void (s.sampling = { method: 'x' }), /exactly one/],
      ['two tick lengths', (s) => void (s.sampling = { secondsPerTick: 1, sourceMillisecondsPerTick: 667 }), /exactly one/],
      ['a tick of 0 seconds', (s) => void (s.sampling = { secondsPerTick: 0 }), /tick is a whole number/],
    ]
    for (const [name, damage, message] of cases) {
      const slice = good()
      damage(slice)
      expect(() => parseSlice(slice), name).toThrow(message)
    }
    expect(() => parseSlice(null)).toThrow(TypeError)
    expect(() => parseSlice([])).toThrow(TypeError)
  })
})

// ---------------------------------------------------------------------------------------------------------------------------
// Replay

describe('replayWorkload', () => {
  const hour = slices['burstgpt-v2-busiest-hour']
  const minute = slices['burstgpt-v2-busiest-minute']
  const kimi = slices['kimi-conversation']

  test('sends row i at round((tick_i - tick_0) · tickUs · 1000 / speed) µs, with the row\'s own lengths, for every slice and speed', () => {
    for (const slice of [hour, minute, kimi]) {
      for (const speedPermille of [1000, 8000, 100_000, 333, 1_000_000]) {
        const w = replayWorkload(3, { slice, speedPermille })
        expect(w.reqs).toHaveLength(slice.requests.length)
        const tick = sliceTickUs(slice)
        slice.requests.forEach((row, i) => {
          expect(w.reqs[i].dueUs).toBe(divRound((row.t - slice.requests[0].t) * tick * 1000, speedPermille))
          expect(w.reqs[i].promptTokens).toBe(row.p)
          expect(w.reqs[i].outputTokens).toBe(row.o)
        })
      }
    }
  })

  test('at the recorded pace the BurstGPT hour spans 898 ticks of 4 s, and the minute 58 of 1 s', () => {
    expect(replayWorkload(1, { slice: hour, speedPermille: 1000 }).reqs.at(-1)!.dueUs).toBe(898 * 4_000_000)
    expect(replayWorkload(1, { slice: minute, speedPermille: 1000 }).reqs.at(-1)!.dueUs).toBe(58 * 1_000_000)
    expect(replayWorkload(1, { slice: kimi, speedPermille: 1000 }).reqs.at(-1)!.dueUs).toBe(616 * 667_000)
  })

  test('starts at 0, never goes back, and a faster pace compresses the same stream (8x: an eighth, within a µs)', () => {
    const slow = replayWorkload(1, { slice: hour, speedPermille: 1000 })
    const fast = replayWorkload(1, { slice: hour, speedPermille: 8000 })
    expect(slow.reqs[0].dueUs).toBe(0)
    for (let i = 1; i < slow.reqs.length; i++) {
      expect(slow.reqs[i].dueUs).toBeGreaterThanOrEqual(slow.reqs[i - 1].dueUs)
      expect(Math.abs(fast.reqs[i].dueUs - slow.reqs[i].dueUs / 8)).toBeLessThanOrEqual(0.5)
    }
  })

  test('measures time from the first row\'s tick, not from tick 0: a slice that starts at tick 5 has its first request due at 0', () => {
    const late: TraceSlice = { ...minute, requests: [{ t: 5, p: 10, o: 2 }, { t: 6, p: 11, o: 3 }, { t: 9, p: 12, o: 4 }] }
    expect(replayWorkload(1, { slice: late, speedPermille: 1000 }).reqs.map((r) => r.dueUs)).toEqual([0, 1_000_000, 4_000_000])
    expect(replayWorkload(1, { slice: late, speedPermille: 2000 }).reqs.map((r) => r.dueUs)).toEqual([0, 500_000, 2_000_000])
    // Rounding is to nearest with halves up: 1 s at three times the pace is 333,333.33 µs, and 2 s is 666,666.67.
    const thirds: TraceSlice = { ...minute, requests: [{ t: 0, p: 10, o: 2 }, { t: 1, p: 10, o: 2 }, { t: 2, p: 10, o: 2 }] }
    expect(replayWorkload(1, { slice: thirds, speedPermille: 3000 }).reqs.map((r) => r.dueUs)).toEqual([0, 333_333, 666_667])
  })

  test('takes the first rows when asked for fewer, and all of them by default', () => {
    expect(replayWorkload(1, { slice: kimi, requests: 25, speedPermille: 1000 }).reqs).toEqual(replayWorkload(1, { slice: kimi, speedPermille: 1000 }).reqs.slice(0, 25))
    expect(replayWorkload(1, { slice: kimi, requests: 0, speedPermille: 1000 }).reqs).toEqual([])
    expect(replayWorkload(1, { slice: kimi, speedPermille: 1000 }).reqs).toHaveLength(1200)
  })

  test('draws only the decorations from the seed: the timing and lengths are the slice\'s under every seed', () => {
    const spec = { slice: minute, speedPermille: 4000, adapters: { count: 3, sharePermille: 500 }, structuredPermille: 300, prefix: { groups: 2, prefixTokens: 100, sharePermille: 500 } }
    const a = replayWorkload(1, spec)
    const b = replayWorkload(2, spec)
    expect(a.reqs.map((r) => [r.dueUs, r.promptTokens, r.outputTokens])).toEqual(b.reqs.map((r) => [r.dueUs, r.promptTokens, r.outputTokens]))
    expect(a.reqs.map((r) => r.adapter)).not.toEqual(b.reqs.map((r) => r.adapter))
    expect(a.reqs.every((r) => r.prefixGroup === null || r.prefixTokens === Math.min(100, r.promptTokens))).toBe(true)
  })

  test('labels what it is made of: the slice\'s credit rides in the workload, and originLabel prints it', () => {
    const w = replayWorkload(1, { slice: kimi, requests: 5, speedPermille: 1000 })
    expect(w.origin).toEqual({ kind: 'slice', use: 'replay', credit: sliceCredit(kimi) })
    expect(originLabel(w.origin)).toBe(`Replay of ${formatCredit(sliceCredit(kimi))}`)
    const sampled = genWorkload(1, { requests: 5, arrivals: { kind: 'burst' }, lengths: { kind: 'rows', slice: kimi } })
    expect(originLabel(sampled.origin)).toBe(`Lengths from ${formatCredit(sliceCredit(kimi))}`)
    expect(originLabel(sampled.origin)).toContain('Apache-2.0')
  })

  test('rejects a pace of 0, more rows than the slice has, and rows out of order', () => {
    expect(() => replayWorkload(1, { slice: minute, speedPermille: 0 })).toThrow(/speedPermille/)
    expect(() => replayWorkload(1, { slice: minute, requests: 41, speedPermille: 1000 })).toThrow(/rows of the slice/)
    expect(() => replayWorkload(1, { slice: minute, requests: -1, speedPermille: 1000 })).toThrow(RangeError)
    const backwards: TraceSlice = { ...minute, requests: [{ t: 5, p: 8, o: 1 }, { t: 2, p: 8, o: 1 }] }
    expect(() => replayWorkload(1, { slice: backwards, speedPermille: 1000 })).toThrow(/in order of tick/)
  })
})
