/*
 * The kernelspace snapshot (content/kc/kernelspace.json) and the tool that makes it (scripts/kc/kernelspace.ts), which give
 * `verify:kc` the ids that a `ks:` edge may name without a checkout of kernelspace.
 *
 *   - The ids are read from kernelspace's source as syntax: a KC is an object with an `id`, a `can` and `requires`, and its id is a
 *     string or a name from the KC table of ids.ts. The reader is tried on small sources written here.
 *   - The committed snapshot is well formed and read at the commit that VENDOR.md pins.
 *   - Where a checkout of kernelspace exists (KERNELSPACE_REPO, or the sibling directory), the snapshot equals what `git show` gives at
 *     the pin. CI has none, so that test is skipped there, as the vendor drift test is.
 *   - `print` and `check` run on a small kernelspace made here, so that every way a snapshot can differ is tried.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { gitReader, kernelspaceIds, KS_TRACKS, main, parseSnapshot, renderSnapshot, SNAPSHOT_FILE, snapshotSchema } from '../../scripts/kc/kernelspace.ts'
import type { Reader } from '../../scripts/kc/kernelspace.ts'
import { findKernelspace, readVendorMd, UsageError } from '../../scripts/vendor-drift.ts'
import { read, root } from '../ci/support'

const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-ks-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let counter = 0
const fresh = (label: string) => mkdtempSync(path.join(scratch, `${label}-${counter++}-`))
/** These tests start git a few times each, which a busy machine can stretch past bun's 5 s default. */
const SLOW = 30_000

/** git, for the small repository made here: a throwaway identity, no signing, no hooks. */
function git(cwd: string, ...args: string[]): string {
  const run = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`)
  return run.stdout.trim()
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A small kernelspace                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------ */

const IDS = `export const KC = {
  locality: 't0.locality',
  kvCapacity: 't5.kv-capacity',
} as const
export const THRESHOLD_KCS = [KC.locality] as const
`

const track = (name: string, body: string) => `import { KC } from './ids'\nexport const ${name.toUpperCase()}_KCS = [\n${body}\n]\n`
const kcObject = (id: string, extra = '') => `  { id: ${id}, title: 'T', can: 'You can.', track: 't', kind: 'concept', lessons: [], requires: [], ${extra}since: '2026-10-05' },`

/** The files of a kernelspace with a KC table and nine tracks, most of them empty. */
function sources(over: Record<string, string> = {}): Record<string, string> {
  const files: Record<string, string> = { 'src/data/kc/ids.ts': IDS }
  for (const name of KS_TRACKS) files[`src/data/kc/${name}.ts`] = track(name, '')
  files['src/data/kc/t0.ts'] = track('t0', [kcObject('KC.locality'), kcObject("'t0.flame-graphs'"), "  { id: 'not-a-kc', other: 1 },", kcObject("'t0.flame-graphs'")].join('\n'))
  // A KC with an object inside it that has an `id` and a `can` and no `requires`: the inner one is not a KC.
  const nested = kcObject("'t5.nested'", "extra: { id: 'ignored.nested', can: 'x' }, ")
  files['src/data/kc/t5.ts'] = track('t5', [kcObject('KC.kvCapacity'), nested].join('\n'))
  return { ...files, ...over }
}
const reader = (files: Record<string, string>): Reader => (file) => files[file] ?? null

describe('kernelspaceIds', () => {
  test('reads a string id and a name of the KC table, sorted, once each, and no object that is not a KC', async () => {
    expect(await kernelspaceIds(reader(sources()))).toEqual(['t0.flame-graphs', 't0.locality', 't5.kv-capacity', 't5.nested'])
  })

  test('fails, naming the file and the line, on an id it cannot read or one that is not kernelspace\'s kind', async () => {
    await expect(kernelspaceIds(reader(sources({ 'src/data/kc/r.ts': track('r', kcObject('KC.nowhere')) })))).rejects.toThrow('src/data/kc/r.ts:3: cannot read this KC\'s id')
    await expect(kernelspaceIds(reader(sources({ 'src/data/kc/r.ts': track('r', kcObject("'R.Shouting'")) })))).rejects.toThrow('src/data/kc/r.ts:3: "R.Shouting" is not a kernelspace KC id')
  })

  test('fails when a file is missing at the commit, when the KC table is gone and when there is no KC at all', async () => {
    const without = sources()
    delete without['src/data/kc/t3.ts']
    await expect(kernelspaceIds(reader(without))).rejects.toThrow('kernelspace has no src/data/kc/t3.ts at that commit')
    await expect(kernelspaceIds(reader(sources({ 'src/data/kc/ids.ts': 'export const OTHER = 1\n' })))).rejects.toThrow('has no KC table')
    const empty = sources()
    empty['src/data/kc/t0.ts'] = track('t0', '')
    empty['src/data/kc/t5.ts'] = track('t5', '')
    await expect(kernelspaceIds(reader(empty))).rejects.toThrow('kernelspace has no KC that this tool can read')
  })
})

describe('the snapshot file', () => {
  const PIN = 'd478f91a0af590f03fcfd76ee73149fa70b28e51'

  test('is rendered as sorted JSON, one id to a line, and parses back to the same ids', () => {
    const text = renderSnapshot(PIN, ['t5.kv-capacity', 't0.locality'])
    expect(text).toBe(`{\n  "commit": "${PIN}",\n  "source": "src/data/kc/{ids,r,t0,t1,t2,t3,t4,t5,t6,t7}.ts, read with git show",\n  "ids": [\n    "t0.locality",\n    "t5.kv-capacity"\n  ]\n}\n`)
    expect(parseSnapshot(text).snapshot).toEqual({ commit: PIN, source: expect.any(String), ids: ['t0.locality', 't5.kv-capacity'] })
  })

  test('is refused for bad JSON, a short commit, an id of the wrong kind, a repeat, a wrong order and a key it does not know', () => {
    const base = { commit: PIN, source: 'x', ids: ['t0.a', 't0.b'] }
    const problems = (value: unknown) => parseSnapshot(JSON.stringify(value)).problems
    expect(parseSnapshot('{').problems?.[0]).toContain('not valid JSON')
    expect(problems({ ...base, commit: 'd478f91' })?.[0]).toContain('commit: must be a full 40-digit')
    expect(problems({ ...base, ids: ['T0.a'] })?.[0]).toContain('ids.0: must be a kernelspace KC id')
    expect(problems({ ...base, ids: ['t0.a', 't0.a'] })).toEqual(['ids.1: "t0.a" is listed twice'])
    expect(problems({ ...base, ids: ['t0.b', 't0.a'] })).toEqual(['ids.1: "t0.a" is out of order: the ids are sorted'])
    expect(problems({ ...base, extra: 1 })?.[0]).toContain('extra')
    expect(snapshotSchema.safeParse(base).success).toBe(true)
  })
})

describe('the committed snapshot', () => {
  const committed = parseSnapshot(read(SNAPSHOT_FILE))

  test('is a well formed snapshot, read at the commit that VENDOR.md pins and ARCHITECTURE §13 names', () => {
    expect(committed.problems).toBeUndefined()
    expect(committed.snapshot?.commit).toBe(readVendorMd(root).pin)
    const named = /## 13\. Vendored from kernelspace\s+Files are copied from kernelspace at ([0-9a-f]{7,40})/.exec(read('docs/ARCHITECTURE.md'))?.[1]
    expect(committed.snapshot?.commit.startsWith(named as string)).toBe(true)
    expect(committed.snapshot?.ids.length).toBeGreaterThan(100)
  })

  test('is exactly the file the tool prints for its own ids', () => {
    expect(read(SNAPSHOT_FILE)).toBe(renderSnapshot(committed.snapshot?.commit as string, committed.snapshot?.ids as string[]))
  })

  const repo = findKernelspace(root)
  test.skipIf(repo === null)('equals what kernelspace holds at the pin, read with git show', async () => {
    const pin = readVendorMd(root).pin
    const ids = await kernelspaceIds(gitReader(repo as string, pin))
    expect(committed.snapshot?.ids).toEqual(ids)
    expect(read(SNAPSHOT_FILE)).toBe(renderSnapshot(pin, ids))
  }, SLOW)
})

/* ------------------------------------------------------------------------------------------------------------------ */
/* print and check, on a kernelspace made here                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

describe('the command line', () => {
  const vendorMd = (pin: string) =>
    [
      '| Field | Value |',
      '|---|---|',
      `| Pinned commit | \`${pin}\` |`,
      '<!-- vendor-manifest:begin -->',
      '| Path | Module | SHA-256 | Licence | Note |',
      '|---|---|---|---|---|',
      '<!-- vendor-manifest:end -->',
      '<!-- vendor-references:begin -->',
      '| Path | SHA-256 | Taken from it |',
      '|---|---|---|',
      '<!-- vendor-references:end -->',
      '<!-- vendor-shims:begin -->',
      '| Shim | Restates | Declarations |',
      '|---|---|---|',
      '<!-- vendor-shims:end -->',
      '',
    ].join('\n')

  /** A kernelspace repository with one commit of `sources()`, and a repository of ours that pins it. */
  function world() {
    const upstream = fresh('upstream')
    for (const [file, text] of Object.entries(sources())) {
      mkdirSync(path.dirname(path.join(upstream, file)), { recursive: true })
      writeFileSync(path.join(upstream, file), text)
    }
    git(upstream, 'init', '-q')
    git(upstream, 'add', '-A')
    git(upstream, 'commit', '-q', '-m', 'first')
    const pin = git(upstream, 'rev-parse', 'HEAD')
    const mine = fresh('mine')
    mkdirSync(path.join(mine, 'vendor/kernelspace'), { recursive: true })
    mkdirSync(path.join(mine, 'content/kc'), { recursive: true })
    writeFileSync(path.join(mine, 'vendor/kernelspace/VENDOR.md'), vendorMd(pin))
    return { upstream, pin, mine, snapshot: path.join(mine, SNAPSHOT_FILE) }
  }
  const output = async (...argv: string[]) => {
    let text = ''
    const code = await main(argv, (chunk) => (text += chunk))
    return { code, text }
  }

  test('print gives the snapshot at the pin, and at another commit when asked', async () => {
    const { upstream, pin, mine } = world()
    const printed = await output('print', '--repo', upstream, '--root', mine)
    expect(printed).toEqual({ code: 0, text: renderSnapshot(pin, ['t0.flame-graphs', 't0.locality', 't5.kv-capacity', 't5.nested']) })

    writeFileSync(path.join(upstream, 'src/data/kc/t7.ts'), track('t7', kcObject("'t7.goodput'")))
    git(upstream, 'add', '-A')
    git(upstream, 'commit', '-q', '-m', 'second')
    const second = git(upstream, 'rev-parse', 'HEAD')
    expect((await output('print', '--repo', upstream, '--root', mine)).text).toBe(printed.text)
    expect((await output('print', '--repo', upstream, '--root', mine, '--commit', second)).text).toContain('"t7.goodput"')
  }, SLOW)

  test('check passes when the committed file is the pin\'s, and says how it differs when it is not', async () => {
    const { upstream, pin, mine, snapshot } = world()
    const ids = ['t0.flame-graphs', 't0.locality', 't5.kv-capacity', 't5.nested']

    expect(await output('check', '--repo', upstream, '--root', mine)).toMatchObject({ code: 1, text: expect.stringContaining('the file does not exist') })

    writeFileSync(snapshot, renderSnapshot(pin, ids))
    expect(await output('check', '--repo', upstream, '--root', mine)).toEqual({ code: 0, text: `kernelspace snapshot: ok (4 ids at ${pin.slice(0, 12)})\n` })

    writeFileSync(snapshot, renderSnapshot(pin, ids.slice(1)))
    const missing = await output('check', '--repo', upstream, '--root', mine)
    expect(missing.code).toBe(1)
    expect(missing.text).toContain('  missing: t0.flame-graphs')
    expect(missing.text).toContain('bun scripts/kc/kernelspace.ts print > content/kc/kernelspace.json')

    writeFileSync(snapshot, renderSnapshot(pin, [...ids, 't7.stale'].sort()))
    expect((await output('check', '--repo', upstream, '--root', mine)).text).toContain('  stale: t7.stale')

    writeFileSync(snapshot, renderSnapshot('f'.repeat(40), ids))
    expect((await output('check', '--repo', upstream, '--root', mine)).text).toContain(`it was read at ${'f'.repeat(12)}`)

    writeFileSync(snapshot, 'not json')
    expect((await output('check', '--repo', upstream, '--root', mine)).text).toContain('not valid JSON')
  }, SLOW)

  test('refuses what it cannot run: an unknown command or flag, a flag with no value, no checkout, and a commit that is not one', async () => {
    const { upstream, mine } = world()
    for (const argv of [[], ['nope'], ['print', '--nope', 'x'], ['print', '--repo'], ['check', '--commit', 'abc1234', '--repo', upstream, '--root', mine]]) {
      await expect(main(argv, () => {})).rejects.toBeInstanceOf(UsageError)
    }
    await expect(main(['print', '--repo', path.join(scratch, 'nowhere'), '--root', mine], () => {})).rejects.toThrow('no kernelspace checkout found')
    expect(() => gitReader(upstream, '--output=x')).toThrow('is not a commit SHA')
  })

  test('writes nothing into the checkout it reads', async () => {
    const { upstream, mine } = world()
    const before = git(upstream, 'status', '--porcelain', '--ignored')
    await output('print', '--repo', upstream, '--root', mine)
    await output('check', '--repo', upstream, '--root', mine)
    expect(git(upstream, 'status', '--porcelain', '--ignored')).toBe(before)
  }, SLOW)
})
