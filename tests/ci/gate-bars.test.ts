/*
 * W2b-T03: scripts/gate/bars.ts refuses a lowered bar. The fixtures are diffs of a few lines, written as the before and the after of a
 * file, and one real git repository for the command line (the allow file, the exit code, a PNG).
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { allowed, findings, inScope, parseDiff, render, textFindings, type Allow, type Finding } from '../../scripts/gate/bars'

/** A unified diff in which `before` is replaced by `after` in one hunk. */
function change(file: string, before: string[], after: string[], isNew = false): string {
  return [
    `diff --git a/${file} b/${file}`,
    ...(isNew ? ['new file mode 100644'] : []),
    `--- ${isNew ? '/dev/null' : `a/${file}`}`,
    `+++ b/${file}`,
    `@@ -${isNew ? 0 : 10},${before.length} +10,${after.length} @@`,
    ...before.map((line) => `-${line}`),
    ...after.map((line) => `+${line}`),
    '',
  ].join('\n')
}
const found = (diff: string, names = ''): Finding[] => findings(diff, names)
const kinds = (diff: string): string[] => found(diff).map((finding) => finding.kind)

describe('wave R\'s three cases are refusals', () => {
  test('a bound of "> 40" that became "> 20"', () => {
    const made = found(change('tests/content/pacing.test.ts', ['  expect(words).toBeGreaterThan(40)'], ['  expect(words).toBeGreaterThan(20)']))
    expect(made.map((finding) => finding.kind)).toEqual(['number'])
    expect(render(made[0])).toBe('number tests/content/pacing.test.ts:10 expect(words).toBeGreaterThan(20)  (was: expect(words).toBeGreaterThan(40))')
  })

  test('a toBeCloseTo of six digits that became one', () => {
    const made = found(change('tests/sim/tensor.test.ts', ['  expect(got).toBeCloseTo(want, 6)'], ['  expect(got).toBeCloseTo(want, 1)']))
    expect(made.map((finding) => finding.kind)).toEqual(['tolerance'])
  })

  test('a dropped assertion', () => {
    const made = found(change('tests/sim/a.test.ts', ['  expect(a).toBe(1)', '  expect(b).toBe(2)'], ['  expect(a).toBe(1)']))
    expect(made.map((finding) => [finding.kind, finding.text])).toEqual([['removed-expect', 'removed: expect(b).toBe(2)']])
  })

  test('an assertion that became a call is a dropped assertion too', () => {
    expect(kinds(change('tests/a.test.ts', ['  expect(a).toBe(1)'], ['  console.log(a)']))).toEqual(['removed-expect'])
  })

  test('an Python assert is held like an expect', () => {
    expect(kinds(change('labs/grader/tests/test_a.py', ['    assert rate > 0.9'], ['    assert rate > 0.5']))).toEqual(['number'])
    expect(kinds(change('labs/grader/tests/test_a.py', ['    assert rate > 0.9', '    assert n == 3'], ['    assert rate > 0.9']))).toEqual(['removed-expect'])
  })
})

describe('what a branch may change without a finding', () => {
  test('a new test, a renamed variable, a reworded comment and a moved assertion are not findings', () => {
    expect(found(change('tests/a.test.ts', [], ['test("a", () => {', '  expect(a).toBe(1)', '})'], true))).toEqual([])
    expect(found(change('tests/a.test.ts', ['  expect(got).toBe(40)'], ['  expect(made).toBe(40)']))).toEqual([])
    expect(found(change('tests/a.test.ts', ['// at most 40 words'], ['// at most 20 words']))).toEqual([])
    const moved = [
      'diff --git a/tests/a.test.ts b/tests/a.test.ts',
      '--- a/tests/a.test.ts',
      '+++ b/tests/a.test.ts',
      '@@ -5,1 +4,0 @@',
      '-  expect(a).toBe(1)',
      '@@ -20,0 +20,1 @@',
      '+  expect(a).toBe(1)',
      '',
    ].join('\n')
    expect(found(moved)).toEqual([])
  })

  test('a file outside the watched paths is not read', () => {
    expect(inScope('src/games/loop/a.ts')).toBe(false)
    expect(found(change('src/a.test.ts', ['expect(a).toBe(40)'], ['expect(a).toBe(20)']))).toEqual([])
    for (const file of ['tests/a.test.ts', 'e2e/a.spec.ts', 'labs/grader/tests/x.py', 'playwright.config.ts', 'scripts/verify-bundle.ts', 'scripts/content/build.ts', 'scripts/games/blind.ts', 'scripts/gate/run.ts', 'tests/seeds.ts', 'packages/sim/tensor/plan.ts'])
      expect([file, inScope(file)]).toEqual([file, true])
  })

  test('removing an entry of known-red.json is the way an entry leaves', () => {
    const entry = ['    {', '      "file": "e2e/a.spec.ts",', '      "title": "t"', '    },']
    expect(found(change('scripts/gate/known-red.json', entry, []))).toEqual([])
  })
})

describe('the other bars', () => {
  test('a timeout, a retries and a tolerance that changed', () => {
    expect(kinds(change('playwright.config.ts', ['  timeout: 30_000,'], ['  timeout: 60_000,']))).toEqual(['timeout'])
    expect(kinds(change('playwright.config.ts', ['  retries: 1,'], ['  retries: 3,']))).toEqual(['retries'])
    expect(kinds(change('playwright.config.ts', ['  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },'], ['  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.05 } },']))).toEqual(['tolerance'])
    expect(kinds(change('e2e/a.spec.ts', ['await expect(page).toHaveTitle(/a/, { timeout: 5000 })'], ['await expect(page).toHaveTitle(/a/, { timeout: 50000 })']))).toEqual(['timeout'])
  })

  test('a retries added to a test', () => {
    expect(kinds(change('e2e/a.spec.ts', [], ['test.describe.configure({ retries: 2 })']))).toEqual(['retries'])
  })

  test('a raised PACING.between, and each other named bound', () => {
    expect(kinds(change('scripts/content/pacing.ts', ['  between: 600,'], ['  between: 900,']))).toEqual(['bound'])
    expect(kinds(change('scripts/content/build.ts', ['export const OPENER_WORDS = { run: 60, primer: 200 } as const'], ['export const OPENER_WORDS = { run: 80, primer: 200 } as const']))).toEqual(['bound'])
    expect(kinds(change('scripts/content/build.ts', ['export const BUDGETS = { index: 6 * 1024, page: 40 * 1024, map: 12 * 1024 } as const'], ['export const BUDGETS = { index: 6 * 1024, page: 60 * 1024, map: 12 * 1024 } as const']))).toEqual(['bound'])
    expect(kinds(change('scripts/games/blind.ts', ['export const MIN_BLIND_SAMPLE = 30'], ['export const MIN_BLIND_SAMPLE = 3']))).toEqual(['bound'])
    expect(kinds(change('tests/seeds.ts', ['export const PR_SEEDS = 200'], ['export const PR_SEEDS = 20']))).toEqual(['bound'])
    expect(kinds(change('tests/seeds.ts', ['export const NIGHTLY_SEEDS = 10_000'], ['export const NIGHTLY_SEEDS = 1_000']))).toEqual(['bound'])
    expect(kinds(change('tests/seeds.ts', ['export const MAX_SEEDS = 1_000_000'], ['export const MAX_SEEDS = 9_000_000']))).toEqual(['bound'])
    expect(kinds(change('packages/sim/tensor/plan.ts', ['export const MAX_PLAN_NUMEL = 256'], ['export const MAX_PLAN_NUMEL = 512']))).toEqual(['bound'])
    expect(kinds(change('scripts/verify-bundle.ts', ['const MAX_BYTES = 150 * 1024'], ['const MAX_BYTES = 170 * 1024']))).toEqual(['bound'])
  })

  test('an added known-red entry', () => {
    const entry = ['    {', '      "file": "e2e/a.spec.ts",', '      "title": "t"', '    },']
    const made = found(change('scripts/gate/known-red.json', [], entry))
    expect(made.map((finding) => finding.kind)).toEqual(['known-red'])
  })

  test('every kind of skip, in an existing file and in a new one', () => {
    // The words are joined from pieces, so that this file holds no skip itself: the gate reads its own branch.
    const [skip, fixme, todo, only] = ['skip', 'fixme', 'todo', 'only']
    const guards = [
      ['e2e/a.spec.ts', `  test.${skip}(isMobile, 'later')`],
      ['e2e/a.spec.ts', `test.${fixme}('b', async () => {})`],
      ['e2e/a.spec.ts', `test.${todo}('c')`],
      ['tests/a.test.ts', `test.${skip}If(!process.env.CI)('d', () => {})`],
      ['tests/a.test.ts', `test.${only}('e', () => {})`],
      ['labs/grader/tests/test_a.py', `@unittest.${skip}Unless(torch is not None, "needs torch")`],
      ['labs/grader/tests/test_a.py', `torch = pytest.importor${skip}("torch")`],
      ['labs/grader/tests/test_a.py', `@pytest.mark.${skip}(reason="x")`],
    ] as const
    for (const [file, line] of guards)
      for (const isNew of [false, true]) expect([file, line, isNew, kinds(change(file, [], [line], isNew))]).toEqual([file, line, isNew, ['skip']])
  })

  test('a skip named in a comment is not a skip', () => {
    expect(found(change('tests/a.test.ts', [], [`// test.${'skip'}(x) would hide it`]))).toEqual([])
  })

  test('a change under scripts/gate/ is one finding for the file', () => {
    const made = found(change('scripts/gate/run.ts', ['const A = 1', 'const B = 2'], ['const A = 1', 'const B = 3', 'const C = 4']))
    expect(made.filter((finding) => finding.kind === 'gate').map(render)).toEqual(['gate scripts/gate/run.ts:1 the gate file changed'])
  })

  test('a baseline added, changed or deleted', () => {
    const names = ['A\te2e/screenshots.spec.ts-snapshots/new-1280.png', 'M\te2e/screenshots.spec.ts-snapshots/front-1280.png', 'D\te2e/screenshots.spec.ts-snapshots/old-390.png', 'M\te2e/a.spec.ts'].join('\n')
    expect(found('', names).map((finding) => `${finding.kind} ${finding.text}`)).toEqual(['png a baseline changed', 'png a baseline added', 'png a baseline deleted'])
    expect(inScope('e2e/screenshots.spec.ts-snapshots/front-1280.png')).toBe(true)
  })
})

describe('the allow file', () => {
  const made = found(change('tests/content/pacing.test.ts', ['  expect(words).toBeGreaterThan(40)'], ['  expect(words).toBeGreaterThan(50)']))

  test('names the path and a piece of the text', () => {
    const allow: Allow[] = [{ path: 'tests/content/pacing.test.ts', contains: 'toBeGreaterThan(50)' }]
    expect(made.every((finding) => allowed(finding, allow))).toBe(true)
  })

  test('another path, or another text, allows nothing', () => {
    expect(allowed(made[0], [{ path: 'tests/other.test.ts', contains: 'toBeGreaterThan(50)' }])).toBe(false)
    expect(allowed(made[0], [{ path: 'tests/content/pacing.test.ts', contains: 'toBeGreaterThan(60)' }])).toBe(false)
    expect(allowed(made[0], [])).toBe(false)
  })
})

describe('parseDiff', () => {
  test('reads the line numbers of both sides', () => {
    const files = parseDiff(['diff --git a/x.ts b/x.ts', '--- a/x.ts', '+++ b/x.ts', '@@ -3,2 +7,1 @@', '-one', '-two', '+three', ''].join('\n'))
    expect(files).toHaveLength(1)
    expect(files[0].hunks[0].removed.map((line) => line.n)).toEqual([3, 4])
    expect(files[0].hunks[0].added.map((line) => line.n)).toEqual([7])
    expect(textFindings(files[0])).toEqual([])
  })
})

describe('the command', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'es-bars-'))
  const git = (...args: string[]) => {
    const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' })
    if (run.status !== 0) throw new Error(run.stderr)
    return run.stdout
  }
  const script = path.resolve(import.meta.dirname, '../../scripts/gate/bars.ts')
  const run = (...extra: string[]) => spawnSync('bun', [script, '--repo', dir, '--base', 'base', '--head', 'head', ...extra], { encoding: 'utf8' })
  const put = (file: string, body: string | Buffer) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    writeFileSync(path.join(dir, file), body)
  }

  test('exits 1 on a lowered bar and a re-blessed PNG, and 0 when the allow file names each', () => {
    git('init', '-q', '-b', 'base')
    put('tests/a.test.ts', 'expect(n).toBeGreaterThan(40)\n')
    put('e2e/s.spec.ts-snapshots/x.png', Buffer.from([1, 2, 3]))
    git('add', '-A')
    git('commit', '-q', '-m', 'base')
    git('checkout', '-q', '-b', 'head')
    put('tests/a.test.ts', 'expect(n).toBeGreaterThan(20)\n')
    put('e2e/s.spec.ts-snapshots/x.png', Buffer.from([1, 2, 4]))
    git('add', '-A')
    git('commit', '-q', '-m', 'head')

    const refused = run()
    expect(refused.status).toBe(1)
    expect(refused.stdout).toContain('number tests/a.test.ts:1 expect(n).toBeGreaterThan(20)')
    expect(refused.stdout).toContain('png e2e/s.spec.ts-snapshots/x.png:0 a baseline changed')

    const partial = path.join(dir, 'allow-one.json')
    writeFileSync(partial, JSON.stringify([{ path: 'tests/a.test.ts', contains: 'toBeGreaterThan(20)' }]))
    const still = run('--allow', partial)
    expect(still.status).toBe(1)
    expect(still.stdout).not.toContain('number tests/a.test.ts')
    expect(still.stdout).toContain('png e2e/s.spec.ts-snapshots/x.png')

    const full = path.join(dir, 'allow-all.json')
    writeFileSync(full, JSON.stringify([{ path: 'tests/a.test.ts', contains: 'toBeGreaterThan(20)' }, { path: 'e2e/s.spec.ts-snapshots/x.png', contains: 'baseline' }]))
    expect(run('--allow', full).status).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
})
