/*
 * W1-T11: the zip is a workspace that builds, and what it builds is what the repository builds. A learner unpacks enginespace-<lab>.zip and
 * runs cargo in it; the packer has only copied files and written a manifest, so only a build can show that nothing the crate needs was
 * left out, and that the lockfile, the profile and the toolchain file of the zip are the ones the repository's builds use.
 *
 *   - Unpacked, it builds for wasm32 offline and from its own lockfile (`--locked --offline`), and the module is the repository's
 *     template build, byte for byte (tests/fixtures/forge/<lab>/template.wasm, which verify:labs holds to the source).
 *   - `cargo test` on the template is red, as a template's is, and its checks that run no learner code are green.
 *   - With the reference solution written into the learner's file, `cargo test` is green, and the module it builds is a credited run
 *     in the host the site uses: every check passes on fresh seeds, the module is named for the lab and not `<lab>@reference`.
 *
 * It runs for every lab of the registry that is listed in LABS below (W1-T27 added the rejection-sampler's).
 *
 * These need the pinned compiler with the wasm32 target (scripts/labs/toolchain.ts finds it, as verify:labs does), so they are skipped
 * where there is none: ci.yml's tests job has no Rust, and a machine with it runs them. Nothing here downloads anything.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHost } from '../../src/forge/host'
import { FORGE_LABS } from '../../src/forge/labs'
import { browserPool } from '../../src/forge/worker-pool'
import { judge } from '../../scripts/labs/judge'
import { NoToolchain, resolveToolchain, type Toolchain } from '../../scripts/labs/toolchain'
import { buildArchive } from '../../scripts/pack-labs'
import { readZip } from '../../scripts/labs/zip'

setDefaultTimeout(120_000)

const root = path.resolve(import.meta.dirname, '../..')
let toolchain: Toolchain | null = null
try {
  toolchain = resolveToolchain(path.join(root, 'labs/forge'))
} catch (e) {
  if (!(e instanceof NoToolchain)) throw e
  console.log(`pack-build: skipped, ${e.message}`)
}
const rust = test.skipIf(toolchain === null)

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-pack-build-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** What differs between the labs' zips: the learner's file, the reference that goes in its place, and the tests the crate runs. */
const LABS = [
  { id: 'toy', learner: 'toy/src/rotation.rs', reference: 'labs/forge/toy/reference/rotation.rs', tests: 6 },
  { id: 'rejection-sampler', learner: 'rejection-sampler/src/verify.rs', reference: 'labs/forge/rejection-sampler/reference/verify.rs', tests: 6 },
] as const

/** A lab's zip, unpacked as a learner would unpack it. */
function unpack(id: string, name: string): string {
  const archive = buildArchive(FORGE_LABS[id])
  const into = path.join(scratch, `${id}-${name}`)
  for (const entry of readZip(archive.zip)) {
    const file = path.join(into, entry.name)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, entry.data)
    chmodSync(file, entry.mode)
  }
  return path.join(into, archive.root)
}

function cargo(cwd: string, args: string[]) {
  const run = spawnSync('cargo', [...args, '--locked', '--offline'], { cwd, env: (toolchain as Toolchain).env, encoding: 'utf8' })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

const build = (project: string, target: string) => cargo(project, ['build', '--release', '--target', 'wasm32-unknown-unknown', '--target-dir', target])

for (const { id, learner, reference, tests } of LABS) {
  const wasm = `wasm32-unknown-unknown/release/${FORGE_LABS[id].wasm}`

  describe(`the ${id} zip, unpacked and built`, () => {
    rust('builds the template, and the module is the repository\'s template build byte for byte', () => {
      const project = unpack(id, 'template')
      const target = path.join(scratch, `${id}-template-target`)
      const built = build(project, target)
      expect(built.out).not.toContain('error')
      expect(built.status).toBe(0)
      const module = readFileSync(path.join(target, wasm))
      expect(Buffer.compare(module, readFileSync(path.join(root, `tests/fixtures/forge/${id}/template.wasm`)))).toBe(0)
    })

    rust('has a red template: the checks that run the learner\'s file fail, the ones that do not are green', () => {
      const tested = cargo(unpack(id, 'red'), ['test', '--target-dir', path.join(scratch, `${id}-red-target`)])
      expect(tested.status).not.toBe(0)
      expect(tested.out).toContain('test the_checks_are_listed_in_grading_order ... ok')
      expect(tested.out).toContain('test the_bridge_refuses_what_it_cannot_read ... ok')
      expect(tested.out).toContain('test every_check_passes_on_its_default_seed ... FAILED')
      expect(tested.out).toContain('not yet implemented')
    })

    rust('is green with the reference in the learner\'s file, and that module is a credited run in the host', async () => {
      const project = unpack(id, 'solved')
      cpSync(path.join(root, reference), path.join(project, learner))
      const target = path.join(scratch, `${id}-solved-target`)
      const tested = cargo(project, ['test', '--target-dir', target])
      expect(tested.status, tested.out).toBe(0)
      expect(tested.out).toContain(`test result: ok. ${tests} passed`)
      expect(build(project, target).status).toBe(0)

      const bytes = readFileSync(path.join(target, wasm))
      const host = createHost({ pool: browserPool() })
      try {
        const verdict = await judge(host, FORGE_LABS[id], 'solved', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { runs: 3 })
        expect(verdict.problems).toEqual([])
        expect(verdict.summary).toContain('every check passes')
      } finally {
        host.dispose()
      }
    })
  })
}
