/*
 * W1-T10, acceptance 1 to 4, on the builds that Rust makes. tests/fixtures/forge/toy holds the five builds of labs/forge/toy that
 * verify:labs makes with the pinned compiler (it fails when they are stale), so the cross-language check runs here without a Rust
 * toolchain: the oracle in packages/sim, which is TypeScript, judges modules that were compiled from Rust, through the real worker.
 *
 *   1. The toy reference passes and the bestiary module fails (scripts/labs/judge.ts asks what verify:labs asks).
 *   2. An infinite loop is stopped at the 2 s limit of its check, and the run goes on in a new worker.
 *   3. A `--features reference` build is named `toy@reference` and shows "@reference: no credit".
 *   4. The `lab-check` event of a solved run carries the module's SHA-256 and its seeds.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createHost } from '../../src/forge/host'
import { runLab } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import { CHECK_BUDGET_MS } from '../../src/forge/protocol'
import { labCheckDraft } from '../../src/forge/record'
import { recordedSentence } from '../../src/forge/words'
import { browserPool } from '../../src/forge/worker-pool'
import { readBestiary } from '../../scripts/labs/bestiary'
import { judge } from '../../scripts/labs/judge'

const root = path.resolve(import.meta.dirname, '../..')
const lab = FORGE_LABS.toy
const bestiary = readBestiary(path.join(root, 'labs/forge/toy'))

const read = (name: string): ArrayBuffer => {
  const bytes = readFileSync(path.join(root, 'tests/fixtures/forge/toy', `${name}.wasm`))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
const sha256 = (buffer: ArrayBuffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex')

const host = createHost({ pool: browserPool() })
afterAll(() => host.dispose())

describe('the builds are lab modules', () => {
  test.each(['template', 'reference', 'solved', 'fifo', 'spin'])('%s has the kit\'s exports, imports nothing and lists the five checks', (name) => {
    const module = new WebAssembly.Module(read(name))
    expect(WebAssembly.Module.imports(module)).toEqual([])
    expect(WebAssembly.Module.exports(module).map((e) => e.name)).toEqual(
      expect.arrayContaining(['memory', 'ks_alloc', 'ks_free', 'ks_run', 'ks_abi_version', 'ks_panic_msg', 'ks_trace_drain', 'ks_invoke']),
    )
  })
})

describe('acceptance 1: the reference passes and the bestiary fails', () => {
  test('the template traps in every check, with the words of its todo!()', async () => {
    const verdict = await judge(host, lab, 'template', read('template'), { runs: 1 })
    expect(verdict.problems).toEqual([])
    expect(verdict.summary).toContain('not implemented yet: build the rotation')
  })

  test('the reference build passes every check on twenty runs on fresh seeds', async () => {
    const verdict = await judge(host, lab, 'reference', read('reference'), { runs: 20 })
    expect(verdict.problems).toEqual([])
  })

  test('the solved build passes the same, and each run would be recorded', async () => {
    const verdict = await judge(host, lab, 'solved', read('solved'), { runs: 20 })
    expect(verdict.problems).toEqual([])
  })

  test('the first-in-first-out member fails exactly the checks that bestiary.json names for it', async () => {
    const member = bestiary.members.find((m) => m.id === 'fifo')!
    const verdict = await judge(host, lab, 'bestiary', read('fifo'), { runs: 30, member })
    expect(verdict.problems).toEqual([])
    expect(Object.keys(member.fails)).toEqual(['hits', 'recency', 'churn'])
  })

  test('a build that is not what its name says is reported: the reference judged as a bestiary member passes the checks it should fail', async () => {
    const member = bestiary.members.find((m) => m.id === 'fifo')!
    const verdict = await judge(host, lab, 'bestiary', read('solved'), { runs: 5, member })
    expect(verdict.problems.length).toBeGreaterThan(0)
    expect(verdict.problems.join('\n')).toContain('hits ends in fail on 0 of 5 runs')
  })

  test('a build with a mistake judged as the reference is reported', async () => {
    const verdict = await judge(host, lab, 'solved', read('fifo'), { runs: 3 })
    expect(verdict.problems.join('\n')).toMatch(/run 1 on fresh seeds: hits fail/)
  })
})

describe('acceptance 2: an infinite loop is stopped at the 2 s limit of its check', () => {
  test('the check that reaches it ends in `timeout` after the whole limit, and the check after it passes in a new worker', async () => {
    // In a process of its own: bun cannot stop the thread of a worker that spins, so the process must end to end it (spin-case.ts).
    const proc = Bun.spawn([process.execPath, path.join(import.meta.dirname, 'spin-case.ts'), 'toy-spin'], { stdout: 'pipe', stderr: 'pipe' })
    const out = await new Response(proc.stdout).text()
    expect(await proc.exited, await new Response(proc.stderr).text()).toBe(0)
    const result = JSON.parse(out) as { statuses: string[]; msg: string; times: Record<string, number>; problems: string[] }
    expect(result.statuses).toEqual(['fill pass', 'hits timeout', 'dump pass'])
    expect(CHECK_BUDGET_MS).toBe(2000)
    expect(result.times.hits).toBeGreaterThanOrEqual(1990)
    expect(result.times.hits).toBeLessThan(2000 + 3000)
    expect(result.msg).toContain('was still running after 2 s')
    expect(result.times.fill).toBeLessThan(1000)
    expect(result.times.dump).toBeLessThan(1000)
    // The judge that verify:labs runs asks the same of the build, and finds nothing wrong.
    expect(result.problems).toEqual([])
  }, 30_000)
})

describe('acceptance 3: a reference build shows "@reference: no credit"', () => {
  test('it is named toy@reference, runs green, and is not recorded', async () => {
    const module = await host.load(read('reference'))
    expect(module.list.lab).toBe('toy@reference')
    expect(module).toMatchObject({ lab: 'toy', reference: true })
    const run = await runLab(host, lab, module)
    expect(run.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(run.reference).toBe(true)
    expect(labCheckDraft(run)).toBeNull()
    expect(recordedSentence({ kind: 'none', why: 'reference' }, run.lab)).toContain('toy@reference: no credit')
  })
})

describe('acceptance 4: the event carries wasmSha256 and the seeds', () => {
  test('a solved run is recorded with the SHA-256 of the file and the seed of the one seeded check, and another run draws another seed', async () => {
    const bytes = read('solved')
    const module = await host.load(bytes)
    expect(module.sha256).toBe(sha256(bytes))
    const first = await runLab(host, lab, module)
    const second = await runLab(host, lab, module)
    const [a, b] = [labCheckDraft(first), labCheckDraft(second)]
    expect(a).toMatchObject({ kind: 'lab-check', ref: 'lab:toy', ok: true, score: 1, provenance: 'unseen' })
    expect(a?.data.wasmSha256).toBe(sha256(bytes))
    expect(a?.data.seeds).toHaveLength(1)
    expect(b?.data.seeds).toHaveLength(1)
    expect(a?.data.seeds[0]).not.toBe(b?.data.seeds[0])
    expect(a?.data.checks.find((check) => check.id === 'churn')?.seed).toBe(a?.data.seeds[0])
  })

  test('the template\'s run is written too, red, with the same module name', async () => {
    const module = await host.load(read('template'))
    const draft = labCheckDraft(await runLab(host, lab, module))
    expect(draft).toMatchObject({ ok: false, score: 0 })
    expect(draft?.data.checks.map((check) => check.status)).toEqual(['trap', 'trap', 'trap', 'trap', 'trap'])
    expect(draft?.data.wasmSha256).toBe(module.sha256)
  })
})
