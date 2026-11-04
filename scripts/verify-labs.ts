/**
 * verify:labs (ARCHITECTURE §8.3, §10.2; D-025): every forge lab builds for wasm, and the host the site uses grades each build as it
 * should. A lab is a crate in labs/forge; its builds are the template, the reference (`--features reference`), the solved reference
 * under the lab's own name (`--features solved`) and the bestiary's wrong modules (labs/forge/<lab>/bestiary/bestiary.json). The gate
 * builds all of them with the pinned compiler, loads each into forge.worker and asks scripts/labs/judge.ts whether the lab's checks
 * (src/forge/labs.ts) treat that build as they should:
 *
 *   the reference passes   on fresh seeds, every check, and shows "<lab>@reference: no credit"
 *   the bestiary fails     each member, by the checks it is named for, in the status it is named for
 *   a spin is stopped      a check that never returns ends in `timeout` at its time limit, and the run goes on in a new worker
 *
 * It also holds the repository to itself: the kit in labs/forge/kit is kslab byte for byte as vendor/ has it, and the builds that
 * tests/fixtures/forge keeps for the tests that run without a Rust toolchain are what this source builds (byte for byte: the
 * compiler is pinned, and a build is the same bytes wherever it is made).
 *
 *   bun scripts/verify-labs.ts [--runs <n>] [--lab <id>]... [--no-build] [--write] [--require-toolchain]
 *
 *   --runs n              fresh-seed runs of each build that passes or is caught by a seeded check; default 50 [estimated]
 *   --lab id              only this lab
 *   --no-build            judge the builds that a last run left in labs/forge/target/variants
 *   --write               write the builds to tests/fixtures/forge, instead of comparing them
 *   --require-toolchain   fail, and do not skip, when there is no pinned Rust (labs.yml has it, and a runner always requires it)
 *
 * Without Rust on the machine the gate says so and skips, because only labs.yml is expected to have it (scripts/verify.ts, the
 * `toolchain` stage). On a runner, where GITHUB_ACTIONS is set, a missing toolchain is a failure.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHost } from '../src/forge/host'
import { FORGE_LABS } from '../src/forge/labs'
import { browserPool } from '../src/forge/worker-pool'
import { readBestiary } from './labs/bestiary'
import { judge, type Judgement, type Kind } from './labs/judge'
import { NoToolchain, resolveToolchain, type Toolchain } from './labs/toolchain'

const ROOT = path.resolve(import.meta.dirname, '..')
const FORGE = path.join(ROOT, 'labs/forge')
const FIXTURES = path.join(ROOT, 'tests/fixtures/forge')
const VENDORED_KIT = path.join(ROOT, 'vendor/kernelspace/labs/kit')
const TARGET = 'wasm32-unknown-unknown'
const DEFAULT_RUNS = 50

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const values = (name: string) => argv.flatMap((arg, i) => (argv[i - 1] === name ? [arg] : []))
const known = new Set(['--runs', '--lab', '--no-build', '--write', '--require-toolchain'])
const stray = argv.filter((arg, i) => arg.startsWith('--') && !known.has(arg) && argv[i - 1] !== '--runs' && argv[i - 1] !== '--lab')
if (stray.length > 0) {
  console.error(`verify-labs: unknown argument ${stray[0]}\nusage: bun scripts/verify-labs.ts [--runs <n>] [--lab <id>]... [--no-build] [--write] [--require-toolchain]`)
  process.exit(2)
}
const runs = values('--runs')[0] === undefined ? DEFAULT_RUNS : Number(values('--runs')[0])
if (!Number.isInteger(runs) || runs < 1) {
  console.error('verify-labs: --runs takes a whole number of runs, at least 1')
  process.exit(2)
}
const only = values('--lab')
for (const id of only) {
  if (!(id in FORGE_LABS)) {
    console.error(`verify-labs: no forge lab "${id}" (the labs are ${Object.keys(FORGE_LABS).join(', ')})`)
    process.exit(2)
  }
}
const labs = Object.values(FORGE_LABS).filter((lab) => only.length === 0 || only.includes(lab.id))
const write = flag('--write')
const build = !flag('--no-build')
const required = flag('--require-toolchain') || process.env.GITHUB_ACTIONS === 'true' || process.env.ES_REQUIRE_RUST === '1'

const failures: string[] = []
const fail = (scope: string, message: string) => failures.push(`${scope}: ${message}`)
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** The kit of labs/forge is the vendored kit, byte for byte (ARCHITECTURE §13: "unchanged"). */
function checkKit(): void {
  for (const file of ['Cargo.toml', 'src/lib.rs']) {
    const copy = path.join(FORGE, 'kit', file)
    const vendored = path.join(VENDORED_KIT, file)
    if (!existsSync(copy)) fail('kit', `labs/forge/kit/${file} is missing`)
    else if (sha256(readFileSync(copy)) !== sha256(readFileSync(vendored))) fail('kit', `labs/forge/kit/${file} differs from vendor/kernelspace/labs/kit/${file}: the kit is vendored and never edited`)
  }
}

interface Built {
  kind: Kind
  /** `template`, `reference`, `solved`, or the bestiary member's id: the fixture's name. */
  name: string
  features: string[]
  member?: ReturnType<typeof readBestiary>['members'][number]
}

function variantsOf(labId: string, crateDir: string): Built[] {
  const bestiary = readBestiary(crateDir)
  if (bestiary.lab !== labId) fail(labId, `bestiary.json is for "${bestiary.lab}"`)
  const manifest = readFileSync(path.join(crateDir, 'Cargo.toml'), 'utf8')
  for (const member of bestiary.members) {
    if (!new RegExp(`^${member.feature}\\s*=`, 'm').test(manifest)) fail(labId, `Cargo.toml has no feature ${member.feature}, and bestiary.json builds ${member.id} with it`)
  }
  return [
    { kind: 'template', name: 'template', features: [] },
    { kind: 'reference', name: 'reference', features: ['reference'] },
    { kind: 'solved', name: 'solved', features: ['solved'] },
    ...bestiary.members.map((member): Built => ({ kind: 'bestiary', name: member.id, features: [member.feature], member })),
  ]
}

/** Builds one variant of a crate and returns the path of its wasm. */
function cargoBuild(toolchain: Toolchain, crate: string, variant: Built, labId: string): string | null {
  const targetDir = path.join(FORGE, 'target/variants', `${labId}-${variant.name}`)
  if (build) {
    const features = variant.features.length === 0 ? [] : ['--features', variant.features.join(',')]
    const result = spawnSync('cargo', ['build', '--release', '--locked', '--target', TARGET, '--package', crate, ...features, '--target-dir', targetDir, '--quiet'], {
      cwd: FORGE,
      env: toolchain.env,
      encoding: 'utf8',
    })
    if (result.status !== 0) {
      fail(labId, `the ${variant.name} build failed:\n${`${result.stdout}${result.stderr}`.trim().replace(/^/gm, '    ')}`)
      return null
    }
  }
  const wasm = path.join(targetDir, TARGET, 'release', `${crate.replaceAll('-', '_')}.wasm`)
  if (!existsSync(wasm)) {
    fail(labId, `${path.relative(ROOT, wasm)} was not built`)
    return null
  }
  return wasm
}

/** The committed build of a variant is the build this source makes. */
function checkFixture(labId: string, variant: Built, bytes: Uint8Array): void {
  const file = path.join(FIXTURES, labId, `${variant.name}.wasm`)
  const rel = path.relative(ROOT, file)
  if (write) {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, bytes)
    return
  }
  if (!existsSync(file)) fail(labId, `${rel} is missing: run \`bun scripts/verify-labs.ts --write\` and commit it`)
  else if (sha256(readFileSync(file)) !== sha256(bytes)) fail(labId, `${rel} is stale (committed ${sha256(readFileSync(file)).slice(0, 12)}, built ${sha256(bytes).slice(0, 12)}): run \`bun scripts/verify-labs.ts --write\` and commit it`)
}

const rows: string[] = []
const started = performance.now()
checkKit()

let toolchain: Toolchain | null = null
try {
  toolchain = resolveToolchain(FORGE)
} catch (e) {
  if (!(e instanceof NoToolchain)) throw e
  if (e.missing && !required) {
    console.log(`verify-labs: skipped, ${e.message}. Only labs.yml is required to have the pinned toolchain; set ES_REQUIRE_RUST=1 or pass --require-toolchain to make this a failure.`)
    if (failures.length > 0) {
      for (const message of failures) console.error(`FAIL: ${message}`)
      process.exit(1)
    }
    process.exit(0)
  }
  fail('toolchain', e.message)
}

if (toolchain !== null) {
  console.log(
    `verify-labs: ${toolchain.rustc}, ${toolchain.name === null ? "as labs/forge/rust-toolchain.toml selects it" : `through the rustup toolchain "${toolchain.name}", because labs/forge/rust-toolchain.toml pins ${toolchain.pin.channel} and that is the same compiler with the ${toolchain.pin.targets.join(', ')} target`}`,
  )
  const host = createHost({ pool: browserPool() })
  for (const lab of labs) {
    const crateDir = path.join(FORGE, lab.crate)
    const wanted = variantsOf(lab.id, crateDir)
    for (const variant of wanted) {
      const wasm = cargoBuild(toolchain, lab.crate, variant, lab.id)
      if (wasm === null) {
        rows.push(`  ✗ ${lab.id.padEnd(8)} ${variant.name.padEnd(10)} not built`)
        continue
      }
      const bytes = readFileSync(wasm)
      checkFixture(lab.id, variant, bytes)
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      let judgement: Judgement
      try {
        judgement = await judge(host, lab, variant.kind, buffer, { runs, ...(variant.member === undefined ? {} : { member: variant.member }) })
      } catch (e) {
        judgement = { problems: [`the judgement threw: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`], summary: 'threw' }
      }
      for (const problem of judgement.problems) fail(`${lab.id} ${variant.name}`, problem)
      rows.push(`  ${judgement.problems.length === 0 ? '✓' : '✗'} ${lab.id.padEnd(8)} ${variant.name.padEnd(10)} ${judgement.summary}`)
    }
  }
  host.dispose()
}

for (const row of rows) console.log(row)
const seconds = Math.round((performance.now() - started) / 100) / 10
if (failures.length > 0) {
  for (const message of failures) console.error(`FAIL: ${message}`)
  console.error(`verify-labs: ${failures.length} problem(s) in ${seconds} s`)
  // A module that never returns keeps its worker thread spinning under Bun, which terminate() cannot interrupt: exit explicitly.
  process.exit(1)
}
console.log(`verify-labs: ${labs.length} lab(s), ${rows.length} build(s), ${runs} runs where a build is run on fresh seeds, ${seconds} s${write ? '; the fixtures in tests/fixtures/forge were written' : ''}`)
process.exit(0)
