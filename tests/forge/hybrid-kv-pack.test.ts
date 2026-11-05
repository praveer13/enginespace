/*
 * W1-T22, acceptance 2 and 3, with cargo. tests/forge/pack-build.test.ts builds the hybrid-kv zip for every lab (the template, byte for
 * byte, and the reference in the learner's file, credited by the host); this file adds what only this lab asks of cargo:
 *
 *   - `cargo test` on the template is red, as a template's is: its checks say "not implemented yet", the tests that run no learner code are
 *     green, and one test is named for each check, so that `cargo test one_group` runs the first stage and nothing else.
 *   - The native `cargo test` of every build of the repository (the reference, the solved reference and the ten members of the bestiary)
 *     passes and fails the checks that the host passes and fails, on the default seeds. tests/forge/hybrid-kv-wasm.test.ts makes the same
 *     comparison on the committed builds, with the crate's own checks run as wasm, so it needs no Rust.
 *   - The zip that the packer wrote into public/labs is the zip of the sources, listed in the manifest (W1-T11).
 *
 * These need the pinned compiler with the wasm32 target (scripts/labs/toolchain.ts finds it, as verify:labs does), so the first two are
 * skipped where there is none: ci.yml's tests job has no Rust, and a machine with it runs them. Nothing here downloads anything.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHost } from '../../src/forge/host'
import { runLab } from '../../src/forge/invoke'
import { FORGE_LABS } from '../../src/forge/labs'
import { browserPool } from '../../src/forge/worker-pool'
import { readBestiary } from '../../scripts/labs/bestiary'
import { NoToolchain, resolveToolchain, type Toolchain } from '../../scripts/labs/toolchain'
import { buildArchive, checkLabs } from '../../scripts/pack-labs'
import { readZip } from '../../scripts/labs/zip'

setDefaultTimeout(300_000)

const root = path.resolve(import.meta.dirname, '../..')
const lab = FORGE_LABS['hybrid-kv']
let toolchain: Toolchain | null = null
try {
  toolchain = resolveToolchain(path.join(root, 'labs/forge'))
} catch (e) {
  if (!(e instanceof NoToolchain)) throw e
  console.log(`hybrid-kv-pack: skipped, ${e.message}`)
}
const rust = test.skipIf(toolchain === null)

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-hybrid-kv-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** The lab's zip, unpacked as a learner would unpack it. */
function unpack(name: string): string {
  const archive = buildArchive(lab)
  const into = path.join(scratch, name)
  for (const entry of readZip(archive.zip)) {
    const file = path.join(into, entry.name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, entry.data)
    chmodSync(file, entry.mode)
  }
  return path.join(into, archive.root)
}

function cargo(cwd: string, args: string[], extra: string[] = ['--locked', '--offline']) {
  const run = spawnSync('cargo', [...args, ...extra], { cwd, env: (toolchain as Toolchain).env, encoding: 'utf8' })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

const ids = lab.checks.map((check) => check.id)

describe('the hybrid-kv zip, unpacked: what only this lab adds to tests/forge/pack-build.test.ts', () => {
  rust('has a red template: the checks that run the learner\'s file fail, one test names each, and the ones that do not run it are green', () => {
    const tested = cargo(unpack('red'), ['test', '--target-dir', path.join(scratch, 'red-target')])
    expect(tested.status).not.toBe(0)
    expect(tested.out).toContain('test the_checks_are_listed_in_grading_order ... ok')
    expect(tested.out).toContain('test the_bridge_refuses_what_it_cannot_read ... ok')
    expect(tested.out).toContain('test the_hash_is_the_sites ... ok')
    for (const id of ids) expect(tested.out, id).toContain(`test ${id} ... FAILED`)
    expect(tested.out).toContain('not yet implemented: build the manager')
    // `cargo test one_group` runs the first stage and nothing else.
    const first = cargo(unpack('first'), ['test', '--target-dir', path.join(scratch, 'first-target'), 'one_group'])
    expect(first.out).toContain('running 1 test')
    expect(first.out).toContain('test one_group ... FAILED')
  })
})

describe('acceptance 2: the native `cargo test` of every build agrees with the host on the default seeds', () => {
  const bestiary = readBestiary(path.join(root, 'labs/forge/hybrid-kv'))
  const builds = [
    { name: 'reference', feature: 'reference' },
    { name: 'solved', feature: 'solved' },
    ...bestiary.members.map((m) => ({ name: m.id, feature: m.feature })),
  ]

  rust('every build passes and fails the same checks natively as on the host', async () => {
    const host = createHost({ pool: browserPool() })
    const target = path.join(scratch, 'native-target')
    const forge = path.join(root, 'labs/forge')
    try {
      for (const { name, feature } of builds) {
        const tested = cargo(forge, ['test', '--package', 'hybrid-kv', '--features', feature, '--locked', '--offline', '--target-dir', target, '--test', 'checks', '--', ...ids], [])
        const native = Object.fromEntries(ids.map((id) => [id, new RegExp(`^test ${id} \\.\\.\\. ok$`, 'm').test(tested.out)]))
        for (const id of ids) expect(tested.out, `${name}: ${id} ran`).toMatch(new RegExp(`^test ${id} \\.\\.\\. (ok|FAILED)$`, 'm'))
        const bytes = readFileSync(path.join(root, 'tests/fixtures/forge/hybrid-kv', `${name}.wasm`))
        const module = await host.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
        const run = await runLab(host, lab, module, { seeds: 'replay', replay: {} })
        const there = Object.fromEntries(run.checks.map((c) => [c.id, c.status === 'pass']))
        expect(native, name).toEqual(there)
        const member = bestiary.members.find((m) => m.id === name)
        for (const id of ids) {
          if (member === undefined) expect(native[id], `${name} ${id}`).toBe(true)
          else if (id in member.fails) expect(native[id], `${name} ${id}`).toBe(false)
          else if (member.passes.includes(id)) expect(native[id], `${name} ${id}`).toBe(true)
        }
      }
    } finally {
      host.dispose()
    }
  })
})

describe('acceptance 3: W1-T11 packs the zip', () => {
  test('public/labs holds the zip that the sources pack to, listed in the manifest with its SHA-256', () => {
    expect(checkLabs()).toEqual([])
    const manifest = JSON.parse(readFileSync(path.join(root, 'public/labs/manifest.json'), 'utf8')) as { files: { name: string; lab?: string; sha256: string; members?: unknown[] }[] }
    const entry = manifest.files.find((file) => file.lab === 'hybrid-kv')
    expect(entry?.name).toBe('enginespace-hybrid-kv.zip')
    expect(entry?.members).toHaveLength(17)
  })

  test('the zip carries the harness, the file to edit and the crate\'s tests, and nothing of the solution or the bestiary', () => {
    const archive = buildArchive(lab)
    const files = archive.members.map((m) => m.path)
    expect(files).toEqual(expect.arrayContaining(['hybrid-kv/src/lib.rs', 'hybrid-kv/src/manager.rs', 'hybrid-kv/tests/checks.rs', 'hybrid-kv/Cargo.toml', 'kit/src/lib.rs', 'Cargo.lock']))
    expect(files.filter((f) => /reference|bestiary|\.wasm$/.test(f))).toEqual([])
    expect(archive.todoFile).toBe('hybrid-kv/src/manager.rs')
    expect(archive.harnessFile).toBe('hybrid-kv/src/lib.rs')
    const readme = new TextDecoder().decode(archive.members.find((m) => m.path === 'README.md')?.data)
    expect(readme).toContain('/labs/hybrid-kv')
    expect(readme).toContain('hybrid_kv.wasm')
    for (const id of ids) expect(readme).toContain(`\`${id}\``)
    expect(readme).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })
})
