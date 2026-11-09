/*
 * W1-T27, acceptance 1 and the shape of the host's run, on the builds that Rust makes. tests/fixtures/forge/rejection-sampler holds the nine
 * builds of labs/forge/rejection-sampler that verify:labs makes with the pinned compiler (it fails when they are stale), so the
 * cross-language check runs here without a Rust toolchain: the oracle in packages/sim, which is TypeScript, judges modules that were
 * compiled from Rust, through the real worker.
 *
 *   1. The reference passes and every bestiary member fails, each by the checks that bestiary.json names for it (scripts/labs/judge.ts asks
 *      what verify:labs asks, on seeds drawn from a fixed stream, so that the chi-square cannot fail the gate by chance).
 *   2. A `--features reference` build is named `rejection-sampler@reference`, runs green and is not recorded.
 *   3. A solved run is recorded with the SHA-256 of the file and a seed for each of the five seeded checks.
 *   4. The template traps in every check, with the words of its todo!(), and the bridge answers what it can before any learner code runs.
 *
 * The error rates of the chi-square check, on these builds, are measured in rejection-sampler-rates.test.ts.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
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
import { gateSeeds, judge } from '../../scripts/labs/judge'

// A judgement runs the lab's checks several times through a worker, and the machine may be busy with other work [estimated].
setDefaultTimeout(60_000)

const root = path.resolve(import.meta.dirname, '../..')
const lab = FORGE_LABS['rejection-sampler']
const bestiary = readBestiary(path.join(root, 'labs/forge/rejection-sampler'))

const read = (name: string): ArrayBuffer => {
  const bytes = readFileSync(path.join(root, 'tests/fixtures/forge/rejection-sampler', `${name}.wasm`))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
const sha256 = (buffer: ArrayBuffer) => createHash('sha256').update(new Uint8Array(buffer)).digest('hex')
const NAMES = ['template', 'reference', 'solved', ...bestiary.members.map((member) => member.id)]
/** The runs of a judgement here; verify:labs makes 50 [estimated]. */
const RUNS = 6

const host = createHost({ pool: browserPool() })
afterAll(() => host.dispose())

describe('the builds are lab modules', () => {
  test.each(NAMES)('%s has the kit\'s exports, imports nothing and lists the five checks', (name) => {
    const module = new WebAssembly.Module(read(name))
    expect(WebAssembly.Module.imports(module)).toEqual([])
    expect(WebAssembly.Module.exports(module).map((e) => e.name)).toEqual(
      expect.arrayContaining(['memory', 'ks_alloc', 'ks_free', 'ks_run', 'ks_abi_version', 'ks_panic_msg', 'ks_trace_drain', 'ks_invoke']),
    )
  })

  test('no build carries a path of the machine that made it', () => {
    for (const name of NAMES) {
      const text = Buffer.from(read(name)).toString('latin1')
      expect(text, name).not.toMatch(/\/home\/|\.rustup|\.cargo|rustlib\/src/)
    }
  })
})

describe('acceptance 1: the reference passes and the bestiary fails', () => {
  test('the template traps in every check, with the words of its todo!()', async () => {
    const verdict = await judge(host, lab, 'template', read('template'), { runs: 1 })
    expect(verdict.problems).toEqual([])
    expect(verdict.summary).toContain('not implemented yet: keep a plate')
  })

  test(`the reference build passes every check on ${RUNS} runs`, async () => {
    const verdict = await judge(host, lab, 'reference', read('reference'), { runs: RUNS })
    expect(verdict.problems).toEqual([])
  })

  test('the solved build passes the same, and each run would be recorded', async () => {
    const verdict = await judge(host, lab, 'solved', read('solved'), { runs: RUNS })
    expect(verdict.problems).toEqual([])
  })

  test.each(bestiary.members.map((member) => [member.id, member] as const))('%s fails exactly the checks that bestiary.json names for it', async (_id, member) => {
    const verdict = await judge(host, lab, 'bestiary', read(member.id), { runs: RUNS, member })
    expect(verdict.problems).toEqual([])
    for (const id of Object.keys(member.fails)) expect(verdict.summary).toContain(`${id} fail ${RUNS}/${RUNS}`)
  })

  test('a build that is not what its name says is reported: the reference judged as a bestiary member passes the checks it should fail', async () => {
    const member = bestiary.members.find((m) => m.id === 'resample-from-p')
    expect(member).toBeDefined()
    const verdict = await judge(host, lab, 'bestiary', read('reference'), { runs: 3, member })
    expect(verdict.problems.join('\n')).toContain('round ends in fail on 0 of 3 runs')
    expect(verdict.problems.join('\n')).toContain('exact ends in fail on 0 of 3 runs')
  })

  test('a build with a mistake judged as the reference is reported, by the check that sees it', async () => {
    const verdict = await judge(host, lab, 'solved', read('boundary-inclusive'), { runs: 2 })
    expect(verdict.problems.join('\n')).toMatch(/run 1 on fresh seeds: accept fail/)
  })

  test('the judgement draws its seeds from a stream of its own, so that it is the same every time and the seeds differ from run to run', () => {
    const a = gateSeeds(lab, 'reference')
    const b = gateSeeds(lab, 'reference')
    const first = Array.from({ length: 20 }, a)
    expect(Array.from({ length: 20 }, b)).toEqual(first)
    expect(new Set(first).size).toBe(20)
    expect(Array.from({ length: 20 }, gateSeeds(lab, 'solved'))).not.toEqual(first)
    expect(Array.from({ length: 20 }, gateSeeds(lab, 'bestiary', bestiary.members[0]))).not.toEqual(first)
  })
})

describe('acceptance 2: a reference build shows "@reference: no credit"', () => {
  test('it is named rejection-sampler@reference, runs green, and is not recorded', async () => {
    const module = await host.load(read('reference'))
    expect(module.list.lab).toBe('rejection-sampler@reference')
    expect(module).toMatchObject({ lab: 'rejection-sampler', reference: true })
    const run = await runLab(host, lab, module)
    expect(run.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(run.reference).toBe(true)
    expect(labCheckDraft(run)).toBeNull()
    expect(recordedSentence({ kind: 'none', why: 'reference' }, run.lab)).toContain('rejection-sampler@reference: no credit')
  })
})

describe('acceptance 3: the event carries wasmSha256 and the seeds', () => {
  test('a solved run is recorded with the SHA-256 of the file and the seed of each of the five seeded checks, and another run draws other seeds', async () => {
    const bytes = read('solved')
    const module = await host.load(bytes)
    expect(module.sha256).toBe(sha256(bytes))
    const first = await runLab(host, lab, module)
    const second = await runLab(host, lab, module)
    const [a, b] = [labCheckDraft(first), labCheckDraft(second)]
    expect(a).toMatchObject({ kind: 'lab-check', ref: 'lab:rejection-sampler', ok: true, score: 1, provenance: 'unseen' })
    expect(a?.data.wasmSha256).toBe(sha256(bytes))
    expect(a?.data.seeds).toHaveLength(5)
    expect(b?.data.seeds).toHaveLength(5)
    expect(a?.data.seeds.some((seed, i) => seed === b?.data.seeds[i])).toBe(false)
    expect(a?.data.checks.map((check) => check.id)).toEqual(['accept', 'residual', 'pick', 'round', 'exact'])
    expect(a?.data.checks.find((check) => check.id === 'exact')?.seed).toBe(a?.data.seeds[4])
  })

  test('every check of a run ends inside the 2 s of its budget, and what each took here is the measurement [measured, not a bound of the product]', async () => {
    const module = await host.load(read('solved'))
    const times: Record<string, number> = {}
    const commands: Record<string, number> = {}
    const run = await runLab(host, lab, module, {
      onProgress: (event) => {
        if (event.type === 'check-start') times[event.id] = performance.now()
        else {
          times[event.result.id] = performance.now() - times[event.result.id]
          commands[event.result.id] = event.result.commands
        }
      },
    })
    // A check that spent its budget would be `timeout`, and not `pass`. What it took is printed for whoever reads the run: the commands it sent,
    // and the milliseconds, which depend on the machine and on what else it is doing.
    expect(run.checks.map((check) => check.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass'])
    for (const [id, ms] of Object.entries(times)) expect(ms, `${id} sent ${commands[id]} commands in ${Math.round(ms)} ms`).toBeLessThan(CHECK_BUDGET_MS)
    expect(commands['exact']).toBe(40_004)
  })

  test('the template\'s run is written too, red, with the same module name', async () => {
    const module = await host.load(read('template'))
    const draft = labCheckDraft(await runLab(host, lab, module))
    expect(draft).toMatchObject({ ok: false, score: 0 })
    expect(draft?.data.checks.map((check) => check.status)).toEqual(['trap', 'trap', 'trap', 'trap', 'trap'])
    expect(draft?.data.wasmSha256).toBe(module.sha256)
  })
})

describe('the template, command by command', () => {
  test('the bridge answers what needs no learner code, and a call that reaches todo!() traps with the words of the file', async () => {
    await host.load(read('template'))
    const session = await host.open()
    const answers = await session.call(['pick 0', 'round 0', 'seed 7', 'weights 3,0,2', 'chain 65536,0|0,65536 65536,0', 'accept 3 5 5', ''], 2000)
    expect(answers).toEqual({
      kind: 'replies',
      replies: ['err no weights are kept', 'err no chain is kept', 'ok', 'ok', 'ok', 'err the coin 5 is not below q (5)', 'err empty command'],
    })
    const trapped = await session.call(['accept 3 5 2'], 2000)
    expect(trapped.kind).toBe('trap')
    if (trapped.kind === 'trap') expect(trapped.panic).toContain('not yet implemented: keep a plate')
    await session.close()
  })

  test('the reference answers the wire of the crate\'s header', async () => {
    await host.load(read('reference'))
    const session = await host.open()
    const outcome = await session.call(
      ['accept 3 5 2', 'accept 3 5 3', 'residual 5,3,0,8 2,6,0,8', 'weights 3,0,2', 'pick 2', 'pick 3', 'chain 65536,0|0,65536 32768,32768', 'seed 7', 'round 1'],
      2000,
    )
    expect(outcome).toEqual({ kind: 'replies', replies: ['yes', 'no', '3,0,0,0', 'ok', '0', '2', 'ok', 'ok', '0'] })
    await session.close()
  })
})
