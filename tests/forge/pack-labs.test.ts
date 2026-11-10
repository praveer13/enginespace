/*
 * W1-T11: the lab packer (scripts/pack-labs.ts). Its three accept checks, and what makes them mean something.
 *
 *   1. Two runs produce byte-identical zips. They do: into two folders, from a copy of the sources whose files have other times and
 *      permissions, and from another directory in another time zone. A zip's bytes depend on the sources and on nothing else.
 *   2. The manifest's hashes match: each zip's SHA-256 and size, and each member's, against the files that are there, and the members
 *      against the sources they were packed from. The committed public/labs is held to the same, and to being what the sources pack to.
 *   3. The guard hook blocks an edit to the harness file: tests/forge/guard.test.ts, which unpacks the zip this packer writes.
 *
 * The packer is also held to what it promises a lab author (labs/forge/README.md): a lab that W1-T22 adds is packed without a change to
 * the packer, nothing of the solution or the bestiary ships, and a crate with a file the packer has no rule for stops it.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  buildAll,
  buildArchive,
  checkLabs,
  fill,
  MANIFEST_NAME,
  main,
  manifestFile,
  packLabs,
  REPO_ROOT,
  trimLock,
  workspaceManifest,
  zipName,
  type LabArchive,
  type Manifest,
  type PackLab,
} from '../../scripts/pack-labs'
import { readZip } from '../../scripts/labs/zip'
import { FORGE_LABS } from '../../src/forge/labs'
import { CHECK_BUDGET_MS } from '../../src/forge/protocol'
import { read } from '../ci/support'

setDefaultTimeout(30_000)

const root = REPO_ROOT
const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-pack-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let counter = 0
const fresh = (label: string) => mkdtempSync(path.join(scratch, `${label}-${counter++}-`))
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const text = (data: Uint8Array) => new TextDecoder().decode(data)

/** A copy of everything the packer reads, to break or to add to. */
function copyRepo(): string {
  const dir = fresh('repo')
  for (const rel of ['labs/forge', 'labs/agent-kit', 'vendor/kernelspace/LICENSE', 'vendor/kernelspace/VENDOR.md']) {
    cpSync(path.join(root, rel), path.join(dir, rel), { recursive: true, filter: (source) => path.basename(source) !== 'target' })
  }
  return dir
}

const toy = FORGE_LABS.toy
const archive = buildArchive(toy)
/** What public/labs holds when every lab of the registry is packed: a zip for each, and the manifest. */
const everything = [...Object.keys(FORGE_LABS).map(zipName), MANIFEST_NAME].sort()
const member = (a: LabArchive, file: string) => (a.members.find((m) => m.path === file) ?? { data: new Uint8Array(0) }).data
const files = (dir: string) => readdirSync(dir).sort()
const bytesOf = (dir: string, name: string) => readFileSync(path.join(dir, name))

describe('accept 1: two runs produce byte-identical zips', () => {
  test('into two folders: the same zip and the same manifest', () => {
    const a = fresh('out')
    const b = fresh('out')
    packLabs({ out: a })
    packLabs({ out: b })
    expect(files(a)).toEqual(everything)
    expect(files(b)).toEqual(files(a))
    for (const name of files(a)) expect(Buffer.compare(bytesOf(a, name), bytesOf(b, name)), name).toBe(0)
  })

  test('from a copy of the sources whose files have other modification times and permissions', () => {
    const copy = copyRepo()
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
    for (const [i, file] of [...walk(path.join(copy, 'labs'))].entries()) {
      utimesSync(file, new Date(Date.UTC(1999, 0, 1 + (i % 28))), new Date(Date.UTC(2031, 5, 1 + (i % 28))))
      chmodSync(file, i % 2 === 0 ? 0o600 : 0o777)
    }
    expect(Buffer.compare(Buffer.from(buildArchive(toy, copy).zip), Buffer.from(archive.zip))).toBe(0)
  })

  test('from another directory, in another time zone, as a command (the zip format stores a local time)', () => {
    const runs = ['Pacific/Kiritimati', 'America/Los_Angeles'].map((TZ, i) => {
      const out = fresh('cli')
      const cwd = i === 0 ? tmpdir() : root
      const run = spawnSync(process.execPath, [path.join(root, 'scripts/pack-labs.ts'), '--out', out], { cwd, env: { ...process.env, TZ }, encoding: 'utf8' })
      expect(run.stderr).toBe('')
      expect(run.status).toBe(0)
      expect(run.stdout).toMatch(/^(packed enginespace-[a-z-]+\.zip: \d+ files, \d+ bytes, sha256 [0-9a-f]{64}\n)+$/)
      return out
    })
    for (const name of everything) expect(Buffer.compare(bytesOf(runs[0] as string, name), bytesOf(runs[1] as string, name)), name).toBe(0)
    expect(Buffer.compare(bytesOf(runs[0] as string, zipName('toy')), Buffer.from(archive.zip))).toBe(0)
  })
})

describe('accept 2: the manifest\'s hashes match', () => {
  /** The problems with one directory: the files against the manifest, the members against the zips, and the members against `sources`. */
  function mismatches(dir: string, sources: (lab: string, file: string) => Uint8Array | undefined): string[] {
    const manifest = JSON.parse(text(bytesOf(dir, MANIFEST_NAME))) as Manifest
    const problems: string[] = []
    for (const entry of manifest.files) {
      const bytes = bytesOf(dir, entry.name)
      if (sha256(bytes) !== entry.sha256) problems.push(`${entry.name}: SHA-256`)
      if (bytes.length !== entry.bytes) problems.push(`${entry.name}: size`)
      const zipped = readZip(bytes)
      if (zipped.map((z) => z.name).join() !== (entry.members ?? []).map((m) => `${entry.root}/${m.path}`).join()) problems.push(`${entry.name}: members`)
      for (const [i, m] of (entry.members ?? []).entries()) {
        const data = (zipped[i] as { data: Uint8Array }).data
        if (sha256(data) !== m.sha256 || data.length !== m.bytes) problems.push(`${entry.name}: ${m.path}`)
        const source = sources(entry.lab as string, m.path)
        if (source !== undefined && sha256(source) !== m.sha256) problems.push(`${entry.name}: ${m.path} is not its source`)
      }
    }
    return problems
  }
  const sourceOf = (lab: string, file: string): Uint8Array | undefined => {
    const where = file.startsWith('kit/') ? `labs/forge/${file}` : file.startsWith(`${lab}/`) ? `labs/forge/${file}` : file === 'rust-toolchain.toml' ? 'labs/forge/rust-toolchain.toml' : undefined
    return where === undefined ? undefined : readFileSync(path.join(root, where))
  }

  test('a fresh run: each zip, each member, and the sources the members were packed from', () => {
    const dir = fresh('out')
    packLabs({ out: dir })
    expect(mismatches(dir, sourceOf)).toEqual([])
    const manifest = JSON.parse(text(bytesOf(dir, MANIFEST_NAME))) as Manifest
    expect(manifest.schema).toBe('enginespace/labs-manifest@1')
    expect(manifest.files.map((f) => [f.name, f.kind, f.lab, f.root])).toEqual(
      Object.keys(FORGE_LABS)
        .sort()
        .map((id) => [zipName(id), 'forge-lab', id, `enginespace-${id}`]),
    )
    expect(manifest.files.find((f) => f.lab === 'toy')?.members).toHaveLength(17)
  })

  test('the committed public/labs: the same, and nothing else in it', () => {
    const dir = path.join(root, 'public/labs')
    expect(mismatches(dir, sourceOf)).toEqual([])
    expect(files(dir)).toEqual(everything)
  })

  test('the committed public/labs is what the sources pack to: a source that changed without a repack fails here', () => {
    expect(checkLabs()).toEqual([])
  })

  test('the manifest of a file list is a diff a reviewer can read: one line per member', () => {
    const lines = read('public/labs/manifest.json').split('\n')
    const members = (JSON.parse(read('public/labs/manifest.json')) as Manifest).files.reduce((sum, f) => sum + (f.members?.length ?? 0), 0)
    expect(lines.filter((line) => /^\s+\{ "path": /.test(line))).toHaveLength(members)
    expect(read('public/labs/manifest.json').endsWith('}\n')).toBe(true)
  })

  test('checkLabs finds each way a directory can be wrong, and names the fix', () => {
    const good = fresh('good')
    packLabs({ out: good })
    const copy = () => {
      const dir = fresh('bad')
      cpSync(good, dir, { recursive: true })
      return dir
    }
    const name = zipName('toy')

    const flipped = copy()
    const zip = Uint8Array.from(bytesOf(flipped, name))
    zip[100] ^= 1
    writeFileSync(path.join(flipped, name), zip)
    expect(checkLabs({ out: flipped }).join('\n')).toMatch(/enginespace-toy\.zip is stale.*run `bun scripts\/pack-labs\.ts`/)
    expect(checkLabs({ out: flipped }).join('\n')).toMatch(/is not the file that manifest\.json describes/)

    const gone = copy()
    rmSync(path.join(gone, name))
    expect(checkLabs({ out: gone }).join('\n')).toContain('enginespace-toy.zip is missing')

    const noManifest = copy()
    rmSync(path.join(noManifest, MANIFEST_NAME))
    expect(checkLabs({ out: noManifest }).join('\n')).toContain('manifest.json is missing')

    const wrongHash = copy()
    const tampered = JSON.parse(text(bytesOf(wrongHash, MANIFEST_NAME))) as Manifest
    ;(tampered.files.find((f) => f.lab === 'toy') as { sha256: string }).sha256 = '0'.repeat(64)
    writeFileSync(path.join(wrongHash, MANIFEST_NAME), JSON.stringify(tampered, null, 2))
    expect(checkLabs({ out: wrongHash }).join('\n')).toMatch(/stale entry for enginespace-toy\.zip/)

    const stray = copy()
    writeFileSync(path.join(stray, 'enginespace-other.zip'), 'x')
    expect(checkLabs({ out: stray }).join('\n')).toContain('enginespace-other.zip is not listed in manifest.json')

    const garbled = copy()
    writeFileSync(path.join(garbled, MANIFEST_NAME), 'not json')
    expect(checkLabs({ out: garbled }).length).toBeGreaterThan(0)
    writeFileSync(path.join(garbled, MANIFEST_NAME), JSON.stringify({ schema: 'something/else@1', files: [] }))
    expect(checkLabs({ out: garbled }).join('\n')).toContain('is not an enginespace/labs-manifest@1 manifest')

    const empty = fresh('empty')
    expect(checkLabs({ out: empty }).join('\n')).toContain('manifest.json is missing')
  })
})

describe('what a zip holds', () => {
  const names = archive.members.map((m) => m.path)

  test('one folder, and these files: the crate, the kit, the workspace, the agent kit and what the learner reads', () => {
    expect(archive.root).toBe('enginespace-toy')
    expect(archive.name).toBe('enginespace-toy.zip')
    expect(readZip(archive.zip).every((entry) => entry.name.startsWith('enginespace-toy/'))).toBe(true)
    expect(names).toEqual([
      '.claude/hooks/es-guard.sh',
      '.claude/output-styles/enginespace-socratic.md',
      '.claude/settings.json',
      '.gitignore',
      'AGENTS.md',
      'CLAUDE.md',
      'Cargo.lock',
      'Cargo.toml',
      'NOTICE',
      'README.md',
      'kit/Cargo.toml',
      'kit/src/lib.rs',
      'rust-toolchain.toml',
      'toy/Cargo.toml',
      'toy/src/lib.rs',
      'toy/src/rotation.rs',
      'toy/tests/checks.rs',
    ])
  })

  test('nothing of the solution, the bestiary or a build ships', () => {
    expect(names.filter((n) => /(^|\/)(reference|bestiary|target)(\/|$)|\.(wasm|rlib|rmeta)$/.test(n))).toEqual([])
    // The repository does hold them, so their absence is the packer's doing, and no member is a copy of one of their files.
    const withheld = ['reference', 'bestiary'].flatMap((folder) => readdirSync(path.join(root, 'labs/forge/toy', folder)).map((file) => readFileSync(path.join(root, 'labs/forge/toy', folder, file))))
    expect(withheld.length).toBeGreaterThanOrEqual(4)
    for (const m of archive.members) expect(withheld.some((bytes) => Buffer.compare(bytes, Buffer.from(m.data)) === 0), m.path).toBe(false)
    // The file the learner edits is the template, which holds todo!() and not the reference's body.
    expect(text(member(archive, 'toy/src/rotation.rs'))).toContain('todo!(')
    expect(text(member(archive, 'toy/src/rotation.rs'))).not.toContain('Vec::with_capacity')
  })

  test('the crate, the kit and the toolchain are the repository\'s, byte for byte; the kit is the vendored kit', () => {
    for (const file of ['toy/Cargo.toml', 'toy/src/lib.rs', 'toy/src/rotation.rs', 'toy/tests/checks.rs', 'kit/Cargo.toml', 'kit/src/lib.rs', 'rust-toolchain.toml', '.gitignore']) {
      expect(Buffer.compare(Buffer.from(member(archive, file)), readFileSync(path.join(root, 'labs/forge', file))), file).toBe(0)
    }
    for (const file of ['Cargo.toml', 'src/lib.rs']) {
      expect(Buffer.compare(Buffer.from(member(archive, `kit/${file}`)), readFileSync(path.join(root, 'vendor/kernelspace/labs/kit', file))), file).toBe(0)
    }
  })

  test('the modes are 0644, and 0755 for the guard alone', () => {
    const modes = readZip(archive.zip).map((entry) => [entry.name.slice('enginespace-toy/'.length), entry.mode])
    expect(modes.filter(([, mode]) => mode !== 0o644)).toEqual([['.claude/hooks/es-guard.sh', 0o755]])
  })

  test('the workspace is the kit and the crate, with the repository\'s release profile and a lockfile of those two and nothing fetched', () => {
    expect(text(member(archive, 'Cargo.toml'))).toBe(
      [
        '# The Rotation: a Cargo workspace of the kit (kslab) and the crate you edit.',
        '[workspace]',
        'members = ["kit", "toy"]',
        'resolver = "2"',
        '',
        "# A release build is what you drop on the lab's page. These settings keep it small and make two builds of one source the same bytes.",
        '[profile.release]',
        'opt-level = 2',
        'debug = false',
        'codegen-units = 1',
        '',
      ].join('\n'),
    )
    const lock = text(member(archive, 'Cargo.lock'))
    expect([...lock.matchAll(/^name = "([^"]+)"$/gm)].map((m) => m[1])).toEqual(['kslab', 'toy'])
    // The repository's lock holds every lab's crate; the zip's is its preamble and the blocks of the kit and this crate, as cargo wrote them.
    const repository = read('labs/forge/Cargo.lock')
    const [preamble, ...blocks] = lock.trimEnd().split(/\n\n(?=\[\[package\]\])/)
    expect(repository.startsWith(preamble)).toBe(true)
    for (const block of blocks) expect(repository).toContain(block)
    expect(lock).not.toContain('source = ')
  })

  test('the harness and the learner\'s file are found, not named: the one DO NOT EDIT lib.rs and the one TODO(you) file', () => {
    expect([archive.harnessFile, archive.todoFile]).toEqual(['toy/src/lib.rs', 'toy/src/rotation.rs'])
  })
})

describe('what a learner reads', () => {
  const readme = text(member(archive, 'README.md'))
  const agents = text(member(archive, 'AGENTS.md'))
  const ids = toy.checks.map((check) => check.id)
  /** What is the repository's own business: a task id (W1-T14, and W1b's, W1b-T08), a document of the repository, a gate, a record and a question of the owner's. */
  const REPOSITORY_BUSINESS = /W\d+b?-T\d\d|ARCHITECTURE|DECISIONS|verify:|\bD-0\d\d\b|\bO-\d+\b/

  test('no placeholder is left in anything, and nothing is the repository\'s own business', () => {
    for (const m of archive.members) expect([m.path, text(m.data).match(/\{\{[A-Z_]+\}\}/)]).toEqual([m.path, null])
    for (const file of ['README.md', 'AGENTS.md']) expect(text(member(archive, file))).not.toMatch(REPOSITORY_BUSINESS)
  })

  test('the check would find a task id of W1b, which the pattern of before (W\\d-T\\d\\d) did not read', () => {
    expect('built by W1b-T08').toMatch(REPOSITORY_BUSINESS)
    expect('built by W1-T11').toMatch(REPOSITORY_BUSINESS)
    expect('built by W1b-T08').not.toMatch(/W\d-T\d\d/)
  })

  test('AGENTS.md lists exactly the site\'s checks, in grading order, with the count, the two files and the gate', () => {
    const section = agents.slice(agents.indexOf('## Required checks'), agents.indexOf('## The explanation gate'))
    expect(section).toContain(`## Required checks (${ids.length})`)
    expect([...section.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1])).toEqual(ids)
    for (const check of toy.checks) expect(section).toContain(`- \`${check.id}\`: ${check.label} (stage ${check.stage}${check.seeded ? ', seeded' : ''})`)
    expect(agents).toContain('The student\'s file is `toy/src/rotation.rs`')
    expect(agents).toContain('The harness is `toy/src/lib.rs`')
    expect(agents).toContain('target/wasm32-unknown-unknown/release/toy.wasm')
    expect(agents).toMatch(/Before any hint, have the student state the failing check id, the invariant it\s+tests and their hypothesis/)
    for (const rung of ['R0', 'R1', 'R2', 'R3', 'R4']) expect(agents).toContain(`**${rung}**`)
    expect(agents).toContain('`ES_SOLO=0`')
    expect(agents).toMatch(/^## AI-use card$/m)
  })

  test('the AI-use card says what it is and where its numbers are from', () => {
    expect(agents).toContain('Hypotheses from a small preprint')
    expect(agents).toMatch(/arXiv\s+2601\.20245v2/)
    expect(agents).toContain('a preprint, not peer reviewed')
    expect(agents).toContain('[measured]')
    expect(agents).toContain('2026-11-04')
  })

  test('README.md names the lab, its checks, the build, the file to drop, and the time a check may take, tagged', () => {
    expect(readme).toContain(`# ${toy.title}`)
    expect(readme).toContain(toy.lead)
    for (const check of toy.checks) expect(readme).toContain(`| \`${check.id}\` | ${check.stage} | ${check.seeded ? 'yes, new inputs on every run' : 'no'} | ${check.catches} |`)
    expect(readme).toContain('cargo build --release --target wasm32-unknown-unknown')
    expect(readme).toContain('target/wasm32-unknown-unknown/release/toy.wasm')
    expect(readme).toContain(`${CHECK_BUDGET_MS / 1000} s [estimated]`)
    expect(readme).toContain('/labs/toy')
    expect(readme).toContain('Rust 1.96.0')
  })

  test('CLAUDE.md hands over to AGENTS.md', () => {
    expect(text(member(archive, 'CLAUDE.md'))).toBe('@AGENTS.md\n')
  })

  test('NOTICE carries kernelspace\'s MIT licence word for word, and the commit that the kit and the agent kit were copied at', () => {
    const notice = text(member(archive, 'NOTICE'))
    expect(notice).toContain(read('vendor/kernelspace/LICENSE').trimEnd())
    expect(notice).toContain('d478f91a0af590f03fcfd76ee73149fa70b28e51')
    expect(notice).toContain('kit/ is kslab')
  })
})

describe('the agent kit of the repository is kernelspace\'s, renamed', () => {
  const kit = (file: string) => read(`labs/agent-kit/${file}`)
  const sources = ['AGENTS.template.md', 'hooks/es-guard.sh', 'output-styles/enginespace-socratic.md', 'settings.template.json']

  test('the kit holds these four files, none of them named AGENTS.md or CLAUDE.md (an agent working in labs/ would be bound by it)', () => {
    expect(readdirSync(path.join(root, 'labs/agent-kit'), { recursive: true }).map(String).filter((f) => /\.[a-z]+$/.test(f)).sort()).toEqual([...sources].sort())
  })

  test('nothing of kernelspace\'s names is left in it or in the learner\'s README', () => {
    for (const file of sources) expect([file, kit(file).match(/kernelspace|ks-guard|KS_SOLO|ks_done/gi)]).toEqual([file, null])
    expect(read('labs/forge/README.template.md')).not.toMatch(/kernelspace|ks-guard|KS_SOLO/i)
  })

  test('the Socratic style is the vendored one, renamed: same ladder, same gate, same 3-line rule', () => {
    const style = kit('output-styles/enginespace-socratic.md')
    expect(style).toMatch(/^---\nname: enginespace-socratic\n/)
    const vendored = read('vendor/kernelspace/labs/agent-kit/output-styles/kernelspace-socratic.md')
    for (const line of vendored.split('\n').filter((l) => /^- \*\*R\d\*\*|^\d\. the \*\*|^## The explanation gate|^## Hint ladder|3 lines/.test(l))) {
      expect(style).toContain(line.replaceAll('kernelspace', 'enginespace'))
    }
  })

  test('the AGENTS template keeps the vendored template\'s gate, ladder and commands, except the one rung that points at the harness', () => {
    const template = kit('AGENTS.template.md')
    const vendored = read('vendor/kernelspace/labs/agent-kit/AGENTS.template.md')
    const kept = vendored.split('\n').filter((l) => /^\d\. \*\*R[0134]\*\*|^## Hint ladder|^## The explanation gate|^\*\*Before any hint|^## Commands|^- `cargo (test|build)/.test(l))
    expect(kept.length).toBeGreaterThanOrEqual(9)
    for (const line of kept) expect(template, line).toContain(line)
    // R2 points at the harness, which the template names by its own placeholder.
    expect(vendored).toContain('**R2**: where to look, such as the check\'s message and the lines of `{{CRATE_DIR}}/src/lib.rs`.')
    expect(template).toContain('**R2**: where to look, such as the check\'s message and the lines of `{{HARNESS_FILE}}`.')
  })

  test('settings.template.json parses, and has the matcher and the style of the vendored one', () => {
    const settings = JSON.parse(kit('settings.template.json')) as { hooks: { PreToolUse: { matcher: string }[] }; outputStyle: string }
    const vendored = JSON.parse(read('vendor/kernelspace/labs/agent-kit/settings.template.json')) as { hooks: { PreToolUse: { matcher: string }[] } }
    expect(settings.hooks.PreToolUse[0]?.matcher).toBe(vendored.hooks.PreToolUse[0]?.matcher)
    expect(settings.outputStyle).toBe('enginespace-socratic')
  })
})

describe('the packer\'s own rules', () => {
  test('fill puts every value in as it is, and refuses a placeholder that is left', () => {
    expect(fill('a {{X}} b {{X}} {{Y}}', { X: '$& $1', Y: '' }, 't')).toBe('a $& $1 b $& $1 ')
    expect(() => fill('a {{X}} {{Z}}', { X: '1' }, 'the template')).toThrow(/the template: the placeholder \{\{Z\}\} is not filled/)
  })

  const lock = `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "alpha"
version = "0.1.0"
dependencies = [
 "kslab",
]

[[package]]
name = "kslab"
version = "0.1.0"

[[package]]
name = "toy"
version = "0.1.0"
dependencies = [
 "kslab",
]
`

  test('trimLock keeps the preamble and the packages asked for, in the lockfile\'s order', () => {
    expect(trimLock(lock, ['kslab', 'toy'])).toBe(lock.replace(/\[\[package\]\]\nname = "alpha"[\s\S]*?\n\n(?=\[\[package\]\]\nname = "kslab")/, ''))
  })

  test('trimLock refuses a missing package, one from a registry, and a dependency that is not in the zip', () => {
    expect(() => trimLock(lock, ['kslab', 'gone'])).toThrow(/no package gone/)
    expect(() => trimLock(lock.replace('name = "toy"\nversion = "0.1.0"', 'name = "toy"\nversion = "0.1.0"\nsource = "registry+https://x"'), ['kslab', 'toy'])).toThrow(/comes from a registry/)
    expect(() => trimLock(lock, ['alpha', 'kslab'])).not.toThrow()
    expect(() => trimLock(lock, ['alpha', 'toy'])).toThrow(/depends on kslab, which is not in the zip/)
  })

  test('workspaceManifest takes the resolver and the profile of labs/forge, and refuses a manifest that has no profile', () => {
    const forge = read('labs/forge/Cargo.toml')
    expect(workspaceManifest(forge, ['kit', 'x'], 'T')).toContain('members = ["kit", "x"]')
    expect(() => workspaceManifest(forge.replace('[profile.release]', '[profile.dev]'), ['kit', 'x'], 'T')).toThrow(/\[profile\.release\]/)
  })

  const refused: [string, (dir: string) => void, RegExp][] = [
    ['a crate folder with a file that has no rule', (dir) => writeFileSync(path.join(dir, 'labs/forge/toy/NOTES.md'), 'x'), /toy\/NOTES\.md is neither shipped nor withheld/],
    ['two files marked TODO(you)', (dir) => writeFileSync(path.join(dir, 'labs/forge/toy/src/extra.rs'), '//! TODO(you): another\n'), /the one src\/ file that opens with "\/\/! TODO\(you\)", and there are 2/],
    ['no file marked TODO(you)', (dir) => writeFileSync(path.join(dir, 'labs/forge/toy/src/rotation.rs'), '//! mine\n'), /and there are 0/],
    ['a harness that is not marked DO NOT EDIT', (dir) => writeFileSync(path.join(dir, 'labs/forge/toy/src/lib.rs'), '//! a lib\n'), /not marked DO NOT EDIT/],
    ['a crate without src/lib.rs', (dir) => rmSync(path.join(dir, 'labs/forge/toy/src/lib.rs')), /src\/lib\.rs is missing/],
    ['a link in src/', (dir) => symlinkSync('/etc/passwd', path.join(dir, 'labs/forge/toy/src/passwd.rs')), /not a regular file/],
    ['a lock that fetches', (dir) => writeFileSync(path.join(dir, 'labs/forge/Cargo.lock'), read('labs/forge/Cargo.lock').replace('name = "toy"', 'source = "registry+x"\nname = "toy"')), /toy comes from a registry/],
    ['a template with a placeholder that nothing fills', (dir) => writeFileSync(path.join(dir, 'labs/forge/README.template.md'), '# {{LAB_TITLE}} {{NOPE}}\n'), /\{\{NOPE\}\} is not filled/],
  ]
  test.each(refused)('refuses %s', (_what, breakIt, message) => {
    const dir = copyRepo()
    breakIt(dir)
    expect(() => buildArchive(toy, dir)).toThrow(message)
  })

  test('refuses a lab id, a crate or a module name that is not a plain name', () => {
    expect(() => buildArchive({ ...toy, id: '../toy' })).toThrow(/lowercase words/)
    expect(() => buildArchive({ ...toy, crate: '../toy' })).toThrow(/the crate "\.\.\/toy"/)
    expect(() => buildArchive({ ...toy, wasm: 'toy.exe' })).toThrow(/the module "toy\.exe"/)
  })

  test('refuses a learner\'s file that shares its name with the harness, because the guard tells files apart by name', () => {
    const dir = copyRepo()
    const forge = path.join(dir, 'labs/forge/toy/src')
    mkdirSync(path.join(forge, 'stage'))
    cpSync(path.join(forge, 'rotation.rs'), path.join(forge, 'stage/lib.rs'))
    rmSync(path.join(forge, 'rotation.rs'))
    expect(() => buildArchive(toy, dir)).toThrow(/share the name lib\.rs/)
  })

  test('withholds what is the repository\'s even when the crate holds more of it', () => {
    const dir = copyRepo()
    mkdirSync(path.join(dir, 'labs/forge/toy/target'), { recursive: true })
    writeFileSync(path.join(dir, 'labs/forge/toy/target/x.wasm'), 'x')
    writeFileSync(path.join(dir, 'labs/forge/toy/reference/second.rs'), 'x')
    expect(buildArchive(toy, dir).members.map((m) => m.path)).toEqual(archive.members.map((m) => m.path))
  })
})

describe('a lab that a later task adds', () => {
  /** A copy of the toy as `two-words`: a hyphen in the crate's name, and the learner's file in a folder of its own. */
  function addLab(dir: string): PackLab {
    const forge = path.join(dir, 'labs/forge')
    cpSync(path.join(forge, 'toy'), path.join(forge, 'two-words'), { recursive: true })
    rmSync(path.join(forge, 'two-words/bestiary'), { recursive: true })
    mkdirSync(path.join(forge, 'two-words/src/stage'))
    cpSync(path.join(forge, 'two-words/src/rotation.rs'), path.join(forge, 'two-words/src/stage/learner.rs'))
    rmSync(path.join(forge, 'two-words/src/rotation.rs'))
    writeFileSync(path.join(forge, 'two-words/Cargo.toml'), read('labs/forge/toy/Cargo.toml').replace('name = "toy"', 'name = "two-words"'))
    writeFileSync(path.join(forge, 'Cargo.toml'), read('labs/forge/Cargo.toml').replace('"toy"]', '"toy", "two-words"]'))
    writeFileSync(path.join(forge, 'Cargo.lock'), `${read('labs/forge/Cargo.lock').trimEnd()}\n\n[[package]]\nname = "two-words"\nversion = "0.1.0"\ndependencies = [\n "kslab",\n]\n`)
    return { ...toy, id: 'two-words', title: 'Two Words', crate: 'two-words', wasm: 'two_words.wasm' }
  }

  test('is packed with no change to the packer: its own zip, its own files, its own two guarded paths', () => {
    const dir = copyRepo()
    const lab = addLab(dir)
    const packed = buildArchive(lab, dir)
    expect(packed.name).toBe('enginespace-two-words.zip')
    expect(packed.members.map((m) => m.path)).toEqual([
      '.claude/hooks/es-guard.sh',
      '.claude/output-styles/enginespace-socratic.md',
      '.claude/settings.json',
      '.gitignore',
      'AGENTS.md',
      'CLAUDE.md',
      'Cargo.lock',
      'Cargo.toml',
      'NOTICE',
      'README.md',
      'kit/Cargo.toml',
      'kit/src/lib.rs',
      'rust-toolchain.toml',
      'two-words/Cargo.toml',
      'two-words/src/lib.rs',
      'two-words/src/stage/learner.rs',
      'two-words/tests/checks.rs',
    ])
    expect([packed.todoFile, packed.harnessFile]).toEqual(['two-words/src/stage/learner.rs', 'two-words/src/lib.rs'])
    expect(text(member(packed, 'Cargo.toml'))).toContain('members = ["kit", "two-words"]')
    expect([...text(member(packed, 'Cargo.lock')).matchAll(/^name = "([^"]+)"$/gm)].map((m) => m[1])).toEqual(['kslab', 'two-words'])
    const settings = JSON.parse(text(member(packed, '.claude/settings.json'))) as { permissions: { deny: string[] } }
    expect(settings.permissions.deny).toEqual(['Edit(/two-words/src/stage/learner.rs)', 'Edit(/two-words/src/lib.rs)'])
    expect(text(member(packed, 'AGENTS.md'))).toContain('target/wasm32-unknown-unknown/release/two_words.wasm')
  })

  test('joins the manifest, and an entry of another kind is kept as it is, while a zip of a lab that is gone is removed', () => {
    const dir = copyRepo()
    const lab = addLab(dir)
    const out = fresh('out')
    const wheel = Buffer.from('a grader wheel, say')
    const entry = { name: 'enginespace-grader.whl', kind: 'wheel', bytes: wheel.length, sha256: sha256(wheel) }
    writeFileSync(path.join(out, entry.name), wheel)
    const old = buildArchive(toy, dir)
    writeFileSync(path.join(out, old.name), old.zip)
    writeFileSync(path.join(out, MANIFEST_NAME), `${JSON.stringify({ schema: 'enginespace/labs-manifest@1', files: [manifestFile(old), entry] }, null, 2)}\n`)

    packLabs({ root: dir, out, labs: [lab] })
    const manifest = JSON.parse(text(bytesOf(out, MANIFEST_NAME))) as Manifest
    expect(manifest.files.map((f) => [f.name, f.kind])).toEqual([
      ['enginespace-grader.whl', 'wheel'],
      ['enginespace-two-words.zip', 'forge-lab'],
    ])
    expect(manifest.files[0]).toEqual(entry)
    expect(manifest.files[1]).toEqual(manifestFile(buildArchive(lab, dir)))
    expect(files(out)).toEqual(['enginespace-grader.whl', 'enginespace-two-words.zip', MANIFEST_NAME])
    expect(checkLabs({ root: dir, out, labs: [lab] })).toEqual([])
    writeFileSync(path.join(out, entry.name), 'tampered')
    expect(checkLabs({ root: dir, out, labs: [lab] }).join('\n')).toContain('enginespace-grader.whl is not the file that manifest.json describes')
  })

  test('two labs pack in the order of their ids, whichever order they are given', () => {
    const dir = copyRepo()
    const lab = addLab(dir)
    expect(buildAll({ root: dir, labs: [toy, lab] }).map((a) => a.lab)).toEqual(['toy', 'two-words'])
    expect(buildAll({ root: dir, labs: [lab, toy] }).map((a) => a.lab)).toEqual(['toy', 'two-words'])
  })
})

describe('the command', () => {
  const run = (args: string[]) => {
    const out: string[] = []
    const err: string[] = []
    const code = main(args, (line) => out.push(line), (line) => err.push(line))
    return { code, out, err }
  }

  test('packs into --out, and --check then finds it fresh, and writes nothing', () => {
    const dir = fresh('out')
    const packed = run(['--out', dir])
    expect(packed.code).toBe(0)
    expect(packed.out).toContain(`packed enginespace-toy.zip: 17 files, ${archive.zip.length} bytes, sha256 ${sha256(archive.zip)}`)
    const before = files(dir).map((name) => sha256(bytesOf(dir, name)))
    const checked = run(['--check', `--out=${dir}`])
    expect(checked).toEqual({ code: 0, out: [`pack-labs: ${dir} is what the sources pack to (${Object.keys(FORGE_LABS).length} lab(s))`], err: [] })
    expect(files(dir).map((name) => sha256(bytesOf(dir, name)))).toEqual(before)
  })

  test('--check fails on a stale directory with the fix, and an empty one', () => {
    const dir = fresh('out')
    run(['--out', dir])
    writeFileSync(path.join(dir, zipName('toy')), 'old')
    const checked = run(['--check', '--out', dir])
    expect(checked.code).toBe(1)
    expect(checked.err.join('\n')).toContain('enginespace-toy.zip is stale')
    expect(run(['--check', '--out', fresh('out')]).code).toBe(1)
  })

  test('is a usage error with an unknown argument or a --out with nothing after it', () => {
    for (const args of [['--nope'], ['--out'], ['x']]) {
      const out = run(args)
      expect([args, out.code]).toEqual([args, 2])
      expect(out.err[0]).toContain('usage: bun scripts/pack-labs.ts [--out <dir>] [--check]')
    }
  })

  test('a folder it cannot write is exit 1 with the reason', () => {
    const file = path.join(fresh('out'), 'a-file')
    writeFileSync(file, 'x')
    const out = run(['--out', path.join(file, 'inside')])
    expect(out.code).toBe(1)
    expect(out.err[0]).toMatch(/^pack-labs: /)
  })
})
