/*
 * W2-T10: the kit packer (scripts/pack-kit.ts). Its two accept checks, and what makes them mean something.
 *
 *   1. The zips are reproducible: two runs give byte-identical files, into two folders, from a copy of the sources whose files have other times and
 *      permissions, and from another directory in another time zone.
 *   2. The site's published-grader list (src/receipts/graders.ts) matches the wheel's computed source hash: the hash of the committed wheel's package,
 *      the manifest's entry and the list are one value, and the hash is the one that identity.py computes (labs/grader/tests/test_published.py runs that
 *      half, with Python; here the same two-file tree gives the same answer as test_identity.py's known one).
 *
 * The packer is also held to what it promises: the wheel is a wheel (a RECORD that matches its files, an entry point, the pinned dependency), the kit
 * carries what a learner needs and nothing private, and no personal data reaches either.
 */
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readZip } from '../../scripts/labs/zip'
import { checkLabs, readManifest, type ManifestFile } from '../../scripts/pack-labs'
import {
  buildAll,
  buildKit,
  checkKit,
  kitEntry,
  KIT_KIND,
  KIT_ROOT,
  main,
  packageFiles,
  packKit,
  parsePublished,
  readProject,
  renderPublished,
  sourceSha256,
  WHEEL_KIND,
  wheelEntry,
  withPublished,
} from '../../scripts/pack-kit'
import { PUBLISHED_GRADERS } from '../../src/receipts/graders'
import { read, root } from '../ci/support'

setDefaultTimeout(60_000)

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-kit-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let counter = 0
const fresh = (label: string) => mkdtempSync(path.join(scratch, `${label}-${counter++}-`))
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
const text = (data: Uint8Array) => new TextDecoder().decode(data)
const decoder = new TextDecoder()

/** The sources the packer reads, copied to a folder of their own (so that a test may change one). */
function copyOfSources(): string {
  const copy = fresh('sources')
  for (const entry of ['labs', 'course.lock.json']) {
    cpSync(path.join(root, entry), path.join(copy, entry), {
      recursive: true,
      filter: (source) => !/(^|\/)(\.venv|__pycache__|target|node_modules)(\/|$)/.test(source),
    })
  }
  mkdirSync(path.join(copy, 'src/receipts'), { recursive: true })
  cpSync(path.join(root, 'src/receipts/graders.ts'), path.join(copy, 'src/receipts/graders.ts'))
  return copy
}

const manifestOf = (dir: string) => readManifest(dir)?.files ?? []
const committed = manifestOf(path.join(root, 'public/labs'))
const wheelListed = committed.filter((file) => file.kind === WHEEL_KIND)
const kitListed = committed.filter((file) => file.kind === KIT_KIND)

describe('reproducible (accept 1)', () => {
  test('two runs write byte-identical files into two folders', () => {
    const [a, b] = [fresh('a'), fresh('b')]
    packKit({ out: a })
    packKit({ out: b })
    const names = readdirSync(a).sort()
    expect(names.some((name) => name.endsWith('.whl'))).toBe(true)
    expect(names.some((name) => name.startsWith(KIT_ROOT) && name.endsWith('.zip'))).toBe(true)
    expect(readdirSync(b).sort()).toEqual(names)
    for (const name of names) expect([name, sha256(readFileSync(path.join(a, name)))]).toEqual([name, sha256(readFileSync(path.join(b, name)))])
  })

  test('a copy of the sources with other times and permissions packs to the same bytes, from another directory in another time zone', () => {
    const copy = copyOfSources()
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else {
          chmodSync(full, 0o600)
          utimesSync(full, new Date('2001-02-03T04:05:06Z'), new Date('2001-02-03T04:05:06Z'))
        }
      }
    }
    walk(copy)
    const out = fresh('elsewhere')
    const script = path.join(root, 'scripts/pack-kit.ts')
    const run = spawnSync(process.execPath, [script, '--out', out], { cwd: out, env: { ...process.env, TZ: 'Pacific/Auckland' }, encoding: 'utf8' })
    // The script packs its own repository's sources; the copy is packed through the library, below, which takes a root.
    expect(run.status).toBe(0)
    const here = fresh('here')
    packKit({ root: copy, out: here })
    for (const name of readdirSync(here)) expect([name, sha256(readFileSync(path.join(here, name)))]).toEqual([name, sha256(readFileSync(path.join(out, name)))])
  })

  test('the committed files are what the sources pack to, and the wheel, the kit and the manifest agree', () => {
    expect(checkKit()).toEqual([])
    expect(checkLabs()).toEqual([])
    const { wheel, kit } = buildAll()
    expect(wheelListed).toEqual([wheelEntry(wheel)])
    expect(kitListed).toEqual([kitEntry(kit)])
    expect(sha256(readFileSync(path.join(root, 'public/labs', wheel.name)))).toBe(wheelListed[0]?.sha256 as string)
  })

  test('a changed source makes --check say what to run, and a changed file in public/labs does too', () => {
    const copy = copyOfSources()
    const out = fresh('published')
    packKit({ root: copy, out })
    expect(checkKit({ root: copy, out })).toEqual([])
    writeFileSync(path.join(copy, 'labs/grader/src/enginespace_grader/rng.py'), `${read('labs/grader/src/enginespace_grader/rng.py')}\n# a change\n`)
    expect(checkKit({ root: copy, out }).join('\n')).toMatch(/enginespace_grader-0\.1\.0-py3-none-any\.whl is stale.*run `bun scripts\/pack-kit\.ts`/)
    const flipped = fresh('flipped')
    packKit({ out: flipped })
    const wheel = readdirSync(flipped).find((name) => name.endsWith('.whl')) as string
    const bytes = readFileSync(path.join(flipped, wheel))
    bytes[bytes.length - 30] = (bytes[bytes.length - 30] as number) ^ 1
    writeFileSync(path.join(flipped, wheel), bytes)
    expect(checkKit({ out: flipped }).join('\n')).toContain(`${wheel} is stale`)
  })
})

describe('the published-grader list matches the wheel (accept 2)', () => {
  const wheelFile = wheelListed[0] as ManifestFile
  const zip = readFileSync(path.join(root, 'public/labs', wheelFile.name))
  const entries = readZip(zip)
  const packageOfWheel = entries.filter((entry) => entry.name.startsWith('enginespace_grader/')).map((entry) => ({ path: entry.name.slice('enginespace_grader/'.length), data: entry.data }))

  test('the committed wheel is listed once, with a version and a hash of 64 lower-case hex digits', () => {
    expect(wheelListed).toHaveLength(1)
    expect(wheelFile.version).toBe(readProject().version)
    expect(wheelFile.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  test("the source hash of the wheel's own package is the manifest's, and the site's list holds it", () => {
    const computed = sourceSha256(packageOfWheel)
    expect(computed).toBe(wheelFile.sourceSha256 as string)
    expect(PUBLISHED_GRADERS.find((grader) => grader.version === wheelFile.version)?.sourceSha256).toBe(computed)
  })

  test('every wheel in the manifest is on the list, and every entry of the list has its wheel in the manifest', () => {
    expect(PUBLISHED_GRADERS.map((grader) => `${grader.version} ${grader.sourceSha256}`).sort()).toEqual(wheelListed.map((file) => `${file.version} ${file.sourceSha256}`).sort())
  })

  test('the wheel holds the package that the source tree holds, and the kit carries the same one', () => {
    expect(packageOfWheel.map((file) => [file.path, sha256(file.data)])).toEqual(packageFiles().map((file) => [file.path, sha256(file.data)]))
    const kit = readZip(readFileSync(path.join(root, 'public/labs', (kitListed[0] as ManifestFile).name)))
    const prefix = `${KIT_ROOT}/grader/src/enginespace_grader/`
    const inKit = kit.filter((entry) => entry.name.startsWith(prefix)).map((entry) => ({ path: entry.name.slice(prefix.length), data: entry.data }))
    expect(sourceSha256(inKit)).toBe(wheelFile.sourceSha256 as string)
    expect(kitListed[0]?.graderSourceSha256).toBe(wheelFile.sourceSha256 as string)
  })

  test('the hash is the one identity.py describes: the same two-file tree gives the same known answer as labs/grader/tests/test_identity.py', () => {
    const files = [
      { path: 'sub/b.json', data: new TextEncoder().encode('{}\n') },
      { path: 'a.py', data: new TextEncoder().encode('x = 1\n') },
    ]
    expect(sourceSha256(files)).toBe('50069fac86bd12150588ceda87cdd5a5b277a568fa976176ff001f839b3ff73d')
    expect(read('labs/grader/tests/test_identity.py')).toContain('50069fac86bd12150588ceda87cdd5a5b277a568fa976176ff001f839b3ff73d')
  })

  test('the hash leaves out bytecode, dot files and the tests, as identity.py does', () => {
    const copy = copyOfSources()
    const before = sourceSha256(packageFiles(copy))
    const package_ = path.join(copy, 'labs/grader/src/enginespace_grader')
    mkdirSync(path.join(package_, '__pycache__'), { recursive: true })
    writeFileSync(path.join(package_, '__pycache__/cli.cpython-313.pyc'), 'x')
    writeFileSync(path.join(package_, 'old.pyc'), 'x')
    writeFileSync(path.join(package_, '.DS_Store'), 'x')
    expect(sourceSha256(packageFiles(copy))).toBe(before)
    writeFileSync(path.join(package_, 'new.py'), 'x = 1\n')
    expect(sourceSha256(packageFiles(copy))).not.toBe(before)
  })

  test('a change to the source with no new pack fails the check, and a new version is a new entry beside the old one', () => {
    const list = [{ version: '0.1.0', sourceSha256: 'a'.repeat(64) }]
    expect(withPublished(list, { version: '0.1.0', sourceSha256: 'b'.repeat(64) })).toEqual([{ version: '0.1.0', sourceSha256: 'b'.repeat(64) }])
    expect(withPublished(list, { version: '0.2.0', sourceSha256: 'c'.repeat(64) })).toEqual([...list, { version: '0.2.0', sourceSha256: 'c'.repeat(64) }])
    const copy = copyOfSources()
    const out = fresh('listed')
    packKit({ root: copy, out, gradersFile: path.join(copy, 'src/receipts/graders.ts') })
    const file = path.join(copy, 'src/receipts/graders.ts')
    writeFileSync(file, readFileSync(file, 'utf8').replace(/sourceSha256: '[0-9a-f]{64}'/, `sourceSha256: '${'0'.repeat(64)}'`))
    expect(checkKit({ root: copy, out, gradersFile: file }).join('\n')).toMatch(/lists 0{64} for grader 0\.1\.0, and its sources hash to [0-9a-f]{64}/)
  })

  test('the list file is read and written by one line, and a list of another shape is refused and not rewritten', () => {
    const source = read('src/receipts/graders.ts')
    expect(parsePublished(source)).toEqual([...PUBLISHED_GRADERS])
    expect(renderPublished(source, PUBLISHED_GRADERS)).toBe(source)
    expect(parsePublished(renderPublished(source, []))).toEqual([])
    expect(() => parsePublished('export const OTHER = []')).toThrow(/no longer has/)
    expect(() => parsePublished(`${source.slice(0, source.indexOf('export const'))}export const PUBLISHED_GRADERS: readonly PublishedGrader[] = [{ version: '1', other: 2 }]`)).toThrow(/not `\{ version/)
  })
})

describe('the wheel', () => {
  const { wheel } = buildAll()
  const entries = readZip(wheel.zip)
  const dist = 'enginespace_grader-0.1.0.dist-info'

  test('is named as PEP 427 names a pure-Python wheel, and holds the package and its dist-info', () => {
    expect(wheel.name).toBe('enginespace_grader-0.1.0-py3-none-any.whl')
    const names = entries.map((entry) => entry.name)
    for (const file of ['enginespace_grader/__init__.py', 'enginespace_grader/cli.py', 'enginespace_grader/schemas/receipt.schema.json', `${dist}/METADATA`, `${dist}/WHEEL`, `${dist}/entry_points.txt`, `${dist}/RECORD`]) {
      expect(names).toContain(file)
    }
    expect(names.filter((name) => name.includes('tests/') || name.includes('__pycache__') || name.endsWith('.pyc'))).toEqual([])
  })

  test("has a RECORD that lists every other file with its SHA-256 and size", () => {
    const record = text((entries.find((entry) => entry.name === `${dist}/RECORD`) as { data: Uint8Array }).data).trimEnd().split('\n')
    expect(record).toHaveLength(entries.length)
    expect(record).toContain(`${dist}/RECORD,,`)
    for (const entry of entries.filter((candidate) => candidate.name !== `${dist}/RECORD`)) {
      expect(record).toContain(`${entry.name},sha256=${createHash('sha256').update(entry.data).digest('base64url')},${entry.data.length}`)
    }
  })

  test("carries the metadata of pyproject.toml: the exact dependency, the Python range, the entry point and no licence", () => {
    const metadata = text((entries.find((entry) => entry.name === `${dist}/METADATA`) as { data: Uint8Array }).data)
    const head = metadata.slice(0, metadata.indexOf('\n\n'))
    expect(head).toContain('Name: enginespace-grader')
    expect(head).toContain('Version: 0.1.0')
    expect(head).toContain('Requires-Python: >=3.11,<3.15')
    expect(head).toContain('Requires-Dist: jsonschema==4.26.0')
    expect(head).not.toMatch(/^(License|Classifier: License)/m)
    expect(text((entries.find((entry) => entry.name === `${dist}/entry_points.txt`) as { data: Uint8Array }).data)).toBe('[console_scripts]\nenginespace = enginespace_grader.cli:main\n')
    expect(text((entries.find((entry) => entry.name === `${dist}/WHEEL`) as { data: Uint8Array }).data)).toContain('Tag: py3-none-any')
  })
})

describe('the kit', () => {
  const kit = buildKit()
  const paths = kit.members.map((member) => member.path)

  test('carries the grader as a uv project, every environment whole, the pins and the references manifest', () => {
    for (const file of ['README.md', 'course.lock.json', 'grader/pyproject.toml', 'grader/uv.lock', 'grader/README.md', 'grader/src/enginespace_grader/cli.py', 'references/manifest.json', 'envs/README.md']) {
      expect(paths).toContain(file)
    }
    for (const env of ['cpu', 'vllm', 'sglang', 'nano-vllm']) {
      for (const file of ['pyproject.toml', 'uv.lock', 'requirements.txt', 'Dockerfile']) expect(paths).toContain(`envs/${env}/${file}`)
    }
  })

  test("lays the folders out as the environments and their Dockerfiles expect (`../../grader`, `COPY grader`, `COPY envs/<env>`)", () => {
    const grader = read('labs/envs/vllm/pyproject.toml')
    expect(grader).toContain('enginespace-grader = { path = "../../grader" }')
    expect(read('labs/envs/vllm/Dockerfile')).toContain('COPY grader /kit/grader')
    expect(paths.filter((file) => file.startsWith('grader/')).every((file) => /^grader\/(pyproject\.toml|uv\.lock|README\.md|src\/)/.test(file))).toBe(true)
  })

  test('has a README with the version and the source hash filled in, and no placeholder left', () => {
    const readme = text((kit.members.find((member) => member.path === 'README.md') as { data: Uint8Array }).data)
    expect(readme).toContain('# enginespace GPU kit 0.1.0')
    expect(readme).toContain(kit.graderSourceSha256)
    expect(readme).not.toMatch(/\{\{|\n\n\n/)
    expect(readme).toContain('sha256sum enginespace-gpu-kit-0.1.0.zip')
  })

  test('ships nothing private: no solution, no bestiary, no build output, no virtual environment', () => {
    expect(paths.filter((file) => /(^|\/)(reference|bestiary|target|_solutions|\.git|\.venv|__pycache__|node_modules)(\/|$)|\.(wasm|pyc)$/.test(file))).toEqual([])
    expect(paths.filter((file) => file.startsWith('tests/') || file.includes('/tests/'))).toEqual([])
  })

  test('refuses a private file in a folder that ships whole (gpu/, runners/)', () => {
    const copy = copyOfSources()
    mkdirSync(path.join(copy, 'labs/gpu/tr9/reference'), { recursive: true })
    writeFileSync(path.join(copy, 'labs/gpu/tr9/LAB.md'), '# a lab\n')
    writeFileSync(path.join(copy, 'labs/gpu/tr9/reference/solution.py'), 'x = 1\n')
    expect(() => buildKit(copy)).toThrow(/gpu\/tr9\/reference\/solution\.py must not ship/)
    rmSync(path.join(copy, 'labs/gpu/tr9/reference'), { recursive: true })
    const shipped = buildKit(copy)
    expect(shipped.members.map((member) => member.path)).toContain('gpu/tr9/LAB.md')
    expect(text((shipped.members.find((member) => member.path === 'README.md') as { data: Uint8Array }).data)).toContain('| `gpu/` |')
  })

  test('refuses a link, which could point out of the folder', () => {
    const copy = copyOfSources()
    spawnSync('ln', ['-s', '/etc/hostname', path.join(copy, 'labs/grader/src/enginespace_grader/link.py')])
    expect(() => buildAll(copy)).toThrow(/is not a regular file/)
  })

  test('holds no path of a machine, no email address and no session id, in the wheel or the kit', () => {
    const { wheel } = buildAll()
    const all = [...kit.members, ...wheel.members]
    const found = all.filter((member) => /\/home\/|\/tmp\/claude|\/Users\/|[A-Za-z0-9._-]+@[A-Za-z0-9-]+\.[a-z]{2,}/.test(decoder.decode(member.data)) && !/uv\.lock$|requirements\.txt$/.test(member.path))
    expect(found.map((member) => member.path)).toEqual([])
  })
})

describe('the manifest stays what the lab pages read', () => {
  test("the forge labs' entries are kept as they were, and the new entries are of kinds the forge pages pass over", () => {
    const forge = committed.filter((file) => file.kind === 'forge-lab')
    expect(forge.map((file) => file.lab).sort()).toEqual(['hybrid-kv', 'rejection-sampler', 'toy'])
    expect(committed.map((file) => file.kind).sort()).toEqual([KIT_KIND, 'forge-lab', 'forge-lab', 'forge-lab', WHEEL_KIND].sort())
    for (const file of [...wheelListed, ...kitListed]) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(Number.isSafeInteger(file.bytes)).toBe(true)
    }
  })

  test('packing the kit leaves the forge entries and zips alone, and packing the labs leaves the kit entries alone', () => {
    const out = fresh('both')
    cpSync(path.join(root, 'public/labs'), out, { recursive: true })
    const before = readFileSync(path.join(out, 'manifest.json'), 'utf8')
    packKit({ out })
    expect(readFileSync(path.join(out, 'manifest.json'), 'utf8')).toBe(before)
    const labs = spawnSync(process.execPath, [path.join(root, 'scripts/pack-labs.ts'), '--out', out], { encoding: 'utf8' })
    expect(labs.status).toBe(0)
    expect(readFileSync(path.join(out, 'manifest.json'), 'utf8')).toBe(before)
  })
})

describe('the command line', () => {
  const capture = () => {
    const out: string[] = []
    const err: string[] = []
    return { out, err, print: (line: string) => out.push(line), fail: (line: string) => err.push(line) }
  }

  test('--check says the committed files are fresh; an unknown argument is a usage error', () => {
    const ok = capture()
    expect(main(['--check'], ok.print, ok.fail)).toBe(0)
    expect(ok.out).toEqual(['pack-kit: public/labs is what the sources pack to'])
    const bad = capture()
    expect(main(['--nope'], bad.print, bad.fail)).toBe(2)
    expect(bad.err[0]).toContain('usage: bun scripts/pack-kit.ts [--out <dir>] [--check]')
  })

  test('--check on a folder with nothing in it names each file to pack', () => {
    const empty = fresh('empty')
    const run = capture()
    expect(main(['--check', '--out', empty], run.print, run.fail)).toBe(1)
    expect(run.err.join('\n')).toMatch(/manifest\.json is missing.*\n.*whl is missing.*\n.*zip is missing/)
  })
})
