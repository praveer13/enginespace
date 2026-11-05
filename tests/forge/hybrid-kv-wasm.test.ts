/*
 * W1-T22, acceptance 1 and 2, on the builds that Rust makes. tests/fixtures/forge/hybrid-kv holds the thirteen builds of
 * labs/forge/hybrid-kv that verify:labs makes with the pinned compiler (it fails when they are stale), so the cross-language check runs
 * here without a Rust toolchain: the oracle in packages/sim, which is TypeScript, judges managers that were compiled from Rust, through
 * the real worker.
 *
 *   1. The reference passes, and every bestiary module fails a named check (scripts/labs/judge.ts asks what verify:labs asks).
 *   2. `cargo test` agrees with the host on the default seeds. The crate's own checks are the module's `ks_run`, which is the code that
 *      `cargo test` runs, compiled to wasm; the host plays each check on the same default seed. For every build and every check, the
 *      two say pass together or fail together. The native run is made by tests/forge/hybrid-kv-pack.test.ts where there is Rust.
 *   3. A `--features reference` build is named `hybrid-kv@reference` and earns nothing.
 *   4. The `lab-check` event of a solved run carries the module's SHA-256 and the seed of every check.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createHost } from '../../src/forge/host'
import { runLab } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import { labCheckDraft } from '../../src/forge/record'
import { recordedSentence } from '../../src/forge/words'
import { browserPool } from '../../src/forge/worker-pool'
import { readBestiary } from '../../scripts/labs/bestiary'
import { DETECTION_FLOOR, judge } from '../../scripts/labs/judge'

setDefaultTimeout(180_000)

const root = path.resolve(import.meta.dirname, '../..')
const lab = FORGE_LABS['hybrid-kv']
const bestiary = readBestiary(path.join(root, 'labs/forge/hybrid-kv'))
const fixtures = path.join(root, 'tests/fixtures/forge/hybrid-kv')

const bytesOf = (name: string): Buffer => readFileSync(path.join(fixtures, `${name}.wasm`))
const read = (name: string): ArrayBuffer => {
  const bytes = bytesOf(name)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
const sha256 = (buffer: ArrayBuffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex')

const host = createHost({ pool: browserPool() })
afterAll(() => host.dispose())

/**
 * The module's own checks, which `cargo test` runs: `ks_run` for one check on its default seed, in a fresh instance for each check (as
 * the kit's own runner does), and whether it passed. A module that traps (the template's `todo!()`) has not passed.
 */
async function ownChecks(bytes: Buffer): Promise<Record<string, boolean>> {
  const module = await WebAssembly.compile(bytes)
  const passed: Record<string, boolean> = {}
  for (const check of lab.checks) {
    const { exports } = await WebAssembly.instantiate(module, {})
    const ex = exports as unknown as { memory: WebAssembly.Memory; ks_alloc(n: number): number; ks_run(p: number, n: number): bigint }
    const input = new TextEncoder().encode(`v 2\nonly ${check.id}\n`)
    const ptr = ex.ks_alloc(input.length) >>> 0
    new Uint8Array(ex.memory.buffer, ptr, input.length).set(input)
    try {
      const packed = BigInt.asUintN(64, ex.ks_run(ptr, input.length))
      const text = new TextDecoder().decode(new Uint8Array(ex.memory.buffer, Number(packed >> 32n), Number(packed & 0xffff_ffffn)))
      passed[check.id] = (JSON.parse(text) as { checks: { pass: boolean }[] }).checks[0].pass
    } catch {
      passed[check.id] = false
    }
  }
  return passed
}

describe('the builds are lab modules', () => {
  const names = ['template', 'reference', 'solved', ...bestiary.members.map((m) => m.id)]

  test('the fixtures are the thirteen builds: the template, the reference, the solved reference and the ten members', () => {
    expect(readdirSync(fixtures).sort()).toEqual(names.map((name) => `${name}.wasm`).sort())
    expect(names).toHaveLength(13)
  })

  test.each(names)('%s has the kit\'s exports, imports nothing and lists the six checks of the lab', async (name) => {
    const module = new WebAssembly.Module(read(name))
    expect(WebAssembly.Module.imports(module)).toEqual([])
    expect(WebAssembly.Module.exports(module).map((e) => e.name)).toEqual(
      expect.arrayContaining(['memory', 'ks_alloc', 'ks_free', 'ks_run', 'ks_abi_version', 'ks_panic_msg', 'ks_trace_drain', 'ks_invoke']),
    )
    const loaded = await host.load(read(name))
    expect(loaded.list.checks.map((c) => c.id)).toEqual(lab.checks.map((c) => c.id))
    expect(loaded.lab).toBe('hybrid-kv')
  })

  test('the modules are small enough for the host to read (at most 4 MiB) and for a learner to download', () => {
    for (const name of names) expect(bytesOf(name).length, name).toBeLessThan(400 * 1024)
  })
})

describe('acceptance 1: the reference passes and the bestiary fails', () => {
  test('the template traps in every check, with the words of its todo!()', async () => {
    const verdict = await judge(host, lab, 'template', read('template'), { runs: 1 })
    expect(verdict.problems).toEqual([])
    expect(verdict.summary).toContain('not implemented yet: build the manager')
  })

  test('the reference build passes every check on fresh seeds', async () => {
    const verdict = await judge(host, lab, 'reference', read('reference'), { runs: 10 })
    expect(verdict.problems).toEqual([])
  })

  test('the solved build passes the same, and each run would be recorded', async () => {
    const verdict = await judge(host, lab, 'solved', read('solved'), { runs: 10 })
    expect(verdict.problems).toEqual([])
  })

  test.each(bestiary.members.map((m) => [m.id] as const))('the member %s fails exactly the checks that bestiary.json names for it', async (id) => {
    const member = bestiary.members.find((m) => m.id === id)!
    const verdict = await judge(host, lab, 'bestiary', read(id), { runs: 8, member })
    expect(verdict.problems).toEqual([])
    expect(Object.keys(member.fails).length).toBeGreaterThan(0)
  })

  test('every one of the six checks catches some member, and the six mistakes of TR5a §5 are all in the bestiary', () => {
    const caught = new Set(bestiary.members.flatMap((m) => Object.keys(m.fails)))
    expect([...caught].sort()).toEqual(lab.checks.map((c) => c.id).sort())
    for (const mistake of ['leaky-free', 'non-atomic-admit', 'window-off-by-one', 'double-counted', 'union-hit', 'published-twice']) {
      expect(bestiary.members.map((m) => m.id)).toContain(mistake)
    }
    expect(DETECTION_FLOOR).toBe(0.99)
  })

  test('a build that is not what its name says is reported: the reference judged as a member passes the checks it should fail', async () => {
    const member = bestiary.members.find((m) => m.id === 'union-hit')!
    const verdict = await judge(host, lab, 'bestiary', read('solved'), { runs: 3, member })
    expect(verdict.problems.join('\n')).toContain('hit_all_groups ends in fail on 0 of 3 runs')
  })

  test('a build with a mistake judged as the reference is reported, with the operation that went wrong', async () => {
    const verdict = await judge(host, lab, 'solved', read('free-forward'), { runs: 2 })
    expect(verdict.problems.join('\n')).toMatch(/run 1 on fresh seeds: one_group fail \(the one-group script, operation 13 of 23: admit 6/)
  })
})

describe('acceptance 2: `cargo test` agrees with the host on the default seeds', () => {
  const names = ['template', 'reference', 'solved', ...bestiary.members.map((m) => m.id)]

  test.each(names)('%s: every check passes or fails in the crate\'s own checks exactly when it does on the host', async (name) => {
    const module = await host.load(read(name))
    const run = await runLab(host, lab, module, { seeds: 'replay', replay: {} })
    const theirs = await ownChecks(bytesOf(name))
    const verdicts = lab.checks.map((check) => ({ check: check.id, crate: theirs[check.id], host: run.checks.find((r) => r.id === check.id)?.status === 'pass' }))
    expect(verdicts.filter((v) => v.crate !== v.host)).toEqual([])
    // And they agree with what bestiary.json says of the member.
    const member = bestiary.members.find((m) => m.id === name)
    for (const v of verdicts) {
      if (name === 'template') expect(v.crate, v.check).toBe(false)
      else if (member === undefined) expect(v.crate, v.check).toBe(true)
      else if (v.check in member.fails) expect(v.crate, v.check).toBe(false)
      else if (member.passes.includes(v.check)) expect(v.crate, v.check).toBe(true)
    }
  })

  test('the crate and the host see the same first mistake in the script that is named for it', async () => {
    const module = await host.load(read('window-off-by-one'))
    const run = await runLab(host, lab, module, { seeds: 'replay', replay: {} })
    const sliding = run.checks.find((c) => c.id === 'sliding')
    expect(sliding?.msg).toStartWith('the sliding-window script, operation 3 of 16: append 2 (1 tokens)')
  })
})

describe('acceptance 3: a reference build shows "@reference: no credit"', () => {
  test('it is named hybrid-kv@reference, runs green, and is not recorded', async () => {
    const module = await host.load(read('reference'))
    expect(module.list.lab).toBe('hybrid-kv@reference')
    expect(module).toMatchObject({ lab: 'hybrid-kv', reference: true })
    const run = await runLab(host, lab, module)
    expect(run.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(run.reference).toBe(true)
    expect(labCheckDraft(run)).toBeNull()
    expect(recordedSentence({ kind: 'none', why: 'reference' }, run.lab)).toContain('hybrid-kv@reference: no credit')
  })
})

describe('acceptance 4: the event carries wasmSha256 and the seeds', () => {
  test('a solved run is recorded with the SHA-256 of the file and the six seeds, and another run draws other seeds', async () => {
    const bytes = read('solved')
    const module = await host.load(bytes)
    expect(module.sha256).toBe(sha256(bytes))
    const first = await runLab(host, lab, module)
    const second = await runLab(host, lab, module)
    const [a, b] = [labCheckDraft(first), labCheckDraft(second)]
    expect(a).toMatchObject({ kind: 'lab-check', ref: 'lab:hybrid-kv', ok: true, score: 1, provenance: 'unseen' })
    expect(a?.data.wasmSha256).toBe(sha256(bytes))
    expect(a?.data.seeds).toHaveLength(6)
    expect(b?.data.seeds).toHaveLength(6)
    expect(a?.data.seeds).not.toEqual(b?.data.seeds)
    expect(a?.data.checks.map((check) => [check.id, check.status])).toEqual(lab.checks.map((c) => [c.id, 'pass']))
    expect(a?.data.checks.find((check) => check.id === 'gauntlet')?.seed).toBe(a?.data.seeds[5])
  })

  test('the template\'s run is written too, red, with the same module name', async () => {
    const module = await host.load(read('template'))
    const draft = labCheckDraft(await runLab(host, lab, module))
    expect(draft).toMatchObject({ ok: false, score: 0 })
    expect(draft?.data.checks.map((check) => check.status)).toEqual(['trap', 'trap', 'trap', 'trap', 'trap', 'trap'])
    expect(draft?.data.wasmSha256).toBe(module.sha256)
  })
})

describe('the run on the host', () => {
  test('a full run of the reference passes inside the 2 s of each check: the gauntlet sends about 13,000 commands for about 2,000 operations', async () => {
    const module = await host.load(read('reference'))
    const run = await runLab(host, lab, module)
    // A check that spent its 2 s would be `timeout`, so a pass is a pass inside the budget.
    expect(run.checks.map((c) => c.status)).toEqual(Array(6).fill('pass'))
    const gauntlet = run.checks.find((c) => c.id === 'gauntlet')
    expect(gauntlet?.commands).toBeGreaterThan(12_000)
    expect(gauntlet?.commands).toBeLessThan(15_000)
  })
})
