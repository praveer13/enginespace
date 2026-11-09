/*
 * W0-T02's acceptance checks 1, 2 and 4 (the gate registry runs the script for verify:vendor), and the guarantees around them.
 *
 *   - `bun scripts/vendor-drift.ts verify` passes on the tree, and fails on each way a vendored tree can go wrong,
 *     starting with a one-byte edit to a temporary copy.
 *   - Every VENDOR.md hash equals `git -C <kernelspace> show <pinned commit>:<path> | sha256sum`. That needs a kernelspace
 *     checkout (KERNELSPACE_REPO, or the sibling directory), so it is skipped where there is none; CI has none.
 *   - `diff <sha>` finds nothing at the pinned commit, and on a small repository made here it reports a changed file, a missing
 *     file, a changed reference and a stale shim, and writes nothing to the repository it reads.
 *   - NOTICE carries the vendored LICENSE and the ts-fsrs notice word for word, and git does not convert the vendored bytes.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { findKernelspace, readVendorMd } from '../../scripts/vendor-drift'
import { GATES } from '../../scripts/verify'

const root = path.resolve(import.meta.dirname, '../..')
/** These tests start bun or git a few times each, which a busy machine can stretch past bun's 5 s default. */
const SLOW = 30_000
const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-vendor-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
let counter = 0
const fresh = (label: string) => mkdtempSync(path.join(scratch, `${label}-${counter++}-`))

/** The command line, as `bun scripts/vendor-drift.ts ...` runs it. */
function drift(args: string[], cwd = root) {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/vendor-drift.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, KERNELSPACE_REPO: '' } })
  return { code: run.status, out: run.stdout, err: run.stderr }
}

/** git, for the small repository made here: a throwaway identity, no signing, no hooks. */
function git(cwd: string, ...args: string[]): string {
  const run = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`)
  return run.stdout.trim()
}

describe('verify', () => {
  const rng = readVendorMd(root).rows.find((row) => row.path === 'src/lib/rng.ts') as { sha256: string }

  test('passes on the vendored tree', () => {
    const { code, out } = drift(['verify'])
    expect(out).toMatch(/^vendor-drift: ok \(\d+ files match VENDOR\.md at [0-9a-f]{12}\)\n$/)
    expect(code).toBe(0)
  }, SLOW)

  /** A copy of the tree to break. The tool is told where it is with --root, as the acceptance check allows. */
  const copy = () => {
    const dir = fresh('verify')
    cpSync(path.join(root, 'vendor'), path.join(dir, 'vendor'), { recursive: true })
    return dir
  }
  const vendored = (dir: string, rel: string) => path.join(dir, 'vendor/kernelspace', rel)

  test('passes on the copy before it is broken', () => {
    expect(drift(['verify', '--root', copy()]).code).toBe(0)
  }, SLOW)

  const breakages: [string, (dir: string) => void, RegExp][] = [
    [
      'a one-byte edit to a vendored file',
      (dir) => {
        const file = vendored(dir, 'src/lib/rng.ts')
        const bytes = readFileSync(file)
        bytes[0] = (bytes[0] as number) ^ 1
        writeFileSync(file, bytes)
      },
      new RegExp(`src/lib/rng\\.ts: SHA-256 is [0-9a-f]{64} and VENDOR\\.md records ${rng.sha256}`),
    ],
    ['a vendored file that is deleted', (dir) => rmSync(vendored(dir, 'src/lib/rng.ts')), /src\/lib\/rng\.ts: listed but missing/],
    ['a file that is not listed', (dir) => writeFileSync(vendored(dir, 'src/lib/extra.ts'), 'export {}\n'), /src\/lib\/extra\.ts: present but not listed/],
    ['a file named AGENTS.md, even among the shims', (dir) => writeFileSync(vendored(dir, 'shims/AGENTS.md'), '# rules\n'), /shims\/AGENTS\.md: a file named AGENTS\.md would bind/],
    ['a file named CLAUDE.md', (dir) => writeFileSync(vendored(dir, 'labs/agent-kit/CLAUDE.md'), '@AGENTS.md\n'), /CLAUDE\.md: a file named CLAUDE\.md would bind/],
    ['an executable bit', (dir) => chmodSync(vendored(dir, 'labs/agent-kit/hooks/ks-guard.sh'), 0o755), /ks-guard\.sh: has an executable bit/],
    ['a symlink', (dir) => symlinkSync('rng.ts', vendored(dir, 'src/lib/link.ts')), /src\/lib\/link\.ts: a symlink/],
    [
      'a manifest row without a hash',
      (dir) => {
        const page = vendored(dir, 'VENDOR.md')
        writeFileSync(page, readFileSync(page, 'utf8').replace(`\`${rng.sha256}\``, '``'))
      },
      /src\/lib\/rng\.ts: VENDOR\.md records no SHA-256/,
    ],
    [
      'a manifest row without a licence',
      (dir) => {
        const page = vendored(dir, 'VENDOR.md')
        writeFileSync(page, readFileSync(page, 'utf8').replace('| MIT | kernelspace\'s MIT licence', '|  | kernelspace\'s MIT licence'))
      },
      /LICENSE: VENDOR\.md records no licence/,
    ],
  ]

  test.each(breakages)('fails on %s', (_name, breakIt, expected) => {
    const dir = copy()
    breakIt(dir)
    const { code, out } = drift(['verify', '--root', dir])
    expect(out).toMatch(/^vendor-drift: FAIL \(\d+\)\n/)
    expect(out).toMatch(expected)
    expect(code).toBe(1)
  }, SLOW)

  test('is a usage error, not a pass, without a VENDOR.md', () => {
    const { code, err } = drift(['verify', '--root', fresh('empty')])
    expect(err).toContain('vendor/kernelspace/VENDOR.md does not exist')
    expect(code).toBe(2)
  }, SLOW)
})

describe('VENDOR.md against kernelspace', () => {
  const repo = findKernelspace(root)
  const vm = readVendorMd(root)
  const upstream = (rel: string) => {
    const run = spawnSync('git', ['-C', repo as string, 'show', `${vm.pin}:${rel}`], { maxBuffer: 1 << 28 })
    if (run.status !== 0) throw new Error(`git show ${vm.pin}:${rel} failed: ${run.stderr}`)
    return run.stdout
  }

  test('pins the commit that ARCHITECTURE section 13 names', () => {
    const named = /## 13\. Vendored from kernelspace\s+Files are copied from kernelspace at ([0-9a-f]{7,40})/.exec(readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8'))?.[1]
    expect(named).toBeDefined()
    expect(vm.pin.startsWith(named as string)).toBe(true)
  })

  test.skipIf(repo === null)('every row equals `git show <pin>:<path> | sha256sum`, and so does every reference', () => {
    expect(vm.rows.length).toBeGreaterThan(20)
    for (const row of vm.rows) expect({ path: row.path, sha256: sha256(upstream(row.path)) }).toEqual({ path: row.path, sha256: row.sha256 })
    expect(vm.references.length).toBeGreaterThan(0)
    for (const ref of vm.references) expect({ path: ref.path, sha256: sha256(upstream(ref.path)) }).toEqual({ path: ref.path, sha256: ref.sha256 })
  }, SLOW)

  test.skipIf(repo === null)('`diff` at the pinned commit finds nothing, and the shims restate upstream\'s declarations', () => {
    const { code, out } = drift(['diff', vm.pin, '--repo', repo as string])
    expect(out).toContain('| copied (')
    expect(out).toMatch(/\| copied \(\d+\) \| 0 changed, 0 missing \|/)
    expect(out).toMatch(/\| referenced \(\d+\) \| 0 changed, 0 missing \|/)
    expect(out).not.toMatch(/\| (differs|declaration missing|file missing) \|/)
    expect(out.match(/\| same \|/g)).toHaveLength(vm.shims.flatMap((shim) => shim.declarations).length)
    expect(code).toBe(0)
  }, SLOW)
})

describe('diff on a small upstream made here', () => {
  const shape = (extra: string) => `export interface Shape {\n  x: number${extra}\n}\n\nexport type Other = string\n`
  const upstream = fresh('upstream')
  const files = (name: string, text: string) => writeFileSync(path.join(upstream, name), text)
  git(upstream, 'init', '-q')
  files('a.txt', 'one\n')
  files('b.txt', 'two\n')
  files('ref.txt', 'ref\n')
  files('types.ts', shape(''))
  git(upstream, 'add', '-A')
  git(upstream, 'commit', '-q', '-m', 'first')
  const first = git(upstream, 'rev-parse', 'HEAD')
  files('a.txt', 'one!\n')
  rmSync(path.join(upstream, 'b.txt'))
  files('ref.txt', 'ref2\n')
  files('types.ts', shape('\n  y: string'))
  git(upstream, 'add', '-A')
  git(upstream, 'commit', '-q', '-m', 'second')
  const second = git(upstream, 'rev-parse', 'HEAD')

  // A repository that vendors the first commit's a.txt and b.txt, references ref.txt, and has a shim for types.ts.
  const mine = fresh('mine')
  const dir = path.join(mine, 'vendor/kernelspace')
  mkdirSync(path.join(dir, 'shims'), { recursive: true })
  writeFileSync(path.join(dir, 'a.txt'), 'one\n')
  writeFileSync(path.join(dir, 'b.txt'), 'two\n')
  writeFileSync(path.join(dir, 'shims/types.ts'), shape(''))
  writeFileSync(
    path.join(dir, 'VENDOR.md'),
    [
      `| Pinned commit | \`${first}\` |`,
      '<!-- vendor-manifest:begin -->',
      '| Path | Module | SHA-256 | Licence | Note |',
      '|---|---|---|---|---|',
      `| \`a.txt\` | m | \`${sha256('one\n')}\` | MIT | first |`,
      `| \`b.txt\` | m | \`${sha256('two\n')}\` | MIT | second |`,
      '<!-- vendor-manifest:end -->',
      '<!-- vendor-references:begin -->',
      '| Path | SHA-256 | Taken from it |',
      '|---|---|---|',
      `| \`ref.txt\` | \`${sha256('ref\n')}\` | the rows |`,
      '<!-- vendor-references:end -->',
      '<!-- vendor-shims:begin -->',
      '| Shim | Restates | Declarations |',
      '|---|---|---|',
      '| `shims/types.ts` | `types.ts` | `Shape`, `Other` |',
      '<!-- vendor-shims:end -->',
      '',
    ].join('\n'),
  )
  const diff = (sha: string, ...more: string[]) => drift(['diff', sha, '--repo', upstream, '--root', mine, ...more])

  test('the fixture itself verifies', () => {
    expect(drift(['verify', '--root', mine]).code).toBe(0)
  }, SLOW)

  test('finds nothing at the pinned commit', () => {
    const { code, out } = diff(first)
    expect(out).toMatch(/\| copied \(2\) \| 0 changed, 0 missing \|/)
    expect(out).toMatch(/\| referenced \(1\) \| 0 changed, 0 missing \|/)
    expect(out.match(/\| same \|/g)).toHaveLength(2)
    expect(code).toBe(0)
  }, SLOW)

  test('reports a changed file with its diff, a missing file, a changed reference and a stale shim', () => {
    const { code, out } = diff(second)
    expect(out).toMatch(/\| copied \(2\) \| 1 changed, 1 missing \|/)
    expect(out).toMatch(/\| referenced \(1\) \| 1 changed, 0 missing \|/)
    expect(out).toContain('## changed: `a.txt`')
    expect(out).toMatch(/-one\n\+one!/)
    expect(out).toContain('## missing: `b.txt`')
    expect(out).toContain('## changed (referenced, not copied): `ref.txt`')
    expect(out).toContain('Taken from it: the rows. Extract it again.')
    expect(out).toMatch(/-ref\n\+ref2/)
    expect(out).toContain('| `shims/types.ts` | `Shape` | differs |')
    expect(out).toContain('| `shims/types.ts` | `Other` | same |')
    expect(out).toContain(`git -C <kernelspace> show ${second}:a.txt > vendor/kernelspace/a.txt`)
    expect(out).toContain(`| \`a.txt\` | \`${sha256('one!\n')}\` |`)
    expect(code).toBe(1)
  }, SLOW)

  test('--no-diff leaves the patches out and keeps the statuses', () => {
    const { code, out } = diff(second, '--no-diff')
    expect(out).toContain('## changed: `a.txt`')
    expect(out).not.toContain('```diff')
    expect(code).toBe(1)
  }, SLOW)

  test('reads the upstream and writes nothing to it', () => {
    diff(second)
    expect(git(upstream, 'status', '--porcelain')).toBe('')
    expect(git(upstream, 'rev-parse', 'HEAD')).toBe(second)
  }, SLOW)

  test('refuses what is not a commit SHA, an unknown commit, an unknown option and a missing repository', () => {
    expect(diff('main')).toMatchObject({ code: 2, err: expect.stringContaining('"main" is not a commit SHA') })
    expect(diff('--output=x')).toMatchObject({ code: 2, err: expect.stringContaining('unknown argument --output=x') })
    expect(diff('deadbeef')).toMatchObject({ code: 2, err: expect.stringContaining('has no commit deadbeef') })
    expect(drift(['diff', first, '--repo', path.join(scratch, 'nowhere'), '--root', mine])).toMatchObject({ code: 2, err: expect.stringContaining('nowhere does not exist') })
  }, SLOW)
})

describe('NOTICE', () => {
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')
  const notice = read('NOTICE')

  test('carries kernelspace\'s MIT licence, word for word', () => {
    expect(notice).toContain(read('vendor/kernelspace/LICENSE'))
  })

  test('carries the ts-fsrs notice that kernelspace\'s own NOTICE carries, word for word', () => {
    const own = read('vendor/kernelspace/NOTICE')
    const title = 'Third-party notices for kernelspace\n\n'
    expect(own.startsWith(title)).toBe(true)
    expect(notice).toContain(own.slice(title.length))
  })

  test('names the pinned commit, and every vendored file that is under a licence other than plain MIT', () => {
    const vm = readVendorMd(root)
    expect(notice).toContain(vm.pin)
    const other = vm.rows.filter((row) => row.licence !== 'MIT')
    expect(other.length).toBeGreaterThan(0)
    for (const row of other) expect(notice).toContain(path.posix.basename(row.path))
  })
})

describe('wiring', () => {
  test('git leaves the vendored bytes alone: no line-ending conversion under vendor/kernelspace', () => {
    const attributes = readFileSync(path.join(root, 'vendor/kernelspace/.gitattributes'), 'utf8')
    expect(attributes).toMatch(/^\* -text$/m)
    const run = spawnSync('git', ['check-attr', 'text', 'eol', '--', 'vendor/kernelspace/src/lib/rng.ts', 'vendor/kernelspace/tests/fixtures/fsrs/reference-vectors.json'], { cwd: root, encoding: 'utf8' })
    expect(run.stdout.trim().split('\n')).toEqual([
      'vendor/kernelspace/src/lib/rng.ts: text: unset',
      'vendor/kernelspace/src/lib/rng.ts: eol: unspecified',
      'vendor/kernelspace/tests/fixtures/fsrs/reference-vectors.json: text: unset',
      'vendor/kernelspace/tests/fixtures/fsrs/reference-vectors.json: eol: unspecified',
    ])
  }, SLOW)

  test('the gate registry runs the drift script for verify:vendor, and the gate is live rather than pending', () => {
    expect(GATES.vendor.parts).toEqual([{ task: 'W0-T02', script: 'scripts/vendor-drift.ts', args: ['verify'] }])
    expect(existsSync(path.join(root, 'scripts/vendor-drift.ts'))).toBe(true)
    const run = spawnSync(process.execPath, [path.join(root, 'scripts/verify.ts'), 'vendor'], { cwd: root, encoding: 'utf8' })
    expect(run.stdout).toMatch(/vendor-drift: ok \(\d+ files match VENDOR\.md/)
    expect(run.stdout).not.toContain('pending')
    expect(run.status).toBe(0)
  }, SLOW)
})
