/*
 * W1b-T13: ci.yml's `tests` job runs the unit suite in shards, `bun test --shard=<i>/<n>`, one job for each i. The shards must together run
 * every test file once, so these tests list the files of each shard, compare their union with the suite, and hold the listing to Bun,
 * which does the cutting.
 *
 *   - The suite is every file under tests/ that `bun test` takes for a test (bunfig.toml roots it there): a name that ends in .test, _test,
 *     .spec or _spec, with a script extension.
 *   - Bun 1.3.14 sorts those paths and deals them out in turn: the file at place k of the sorted list, counting from 0, is in shard
 *     k mod n + 1 [measured 2026-11-09 at 54d880f, Bun 1.3.14: shard by shard on a tree of awkward names, and on the suite's 283 files,
 *     whose junit reports put each file in the shard that the rule gives it]. Bun prints how many files a shard runs and which file
 *     starts it, and nothing more about the files, so the listing here is a model of that rule, and two tests hold the model to Bun:
 *     the first on a tree of awkward names, where Bun runs each shard and the files that ran are the model's, and the second on this
 *     suite, where Bun is asked for each shard's count and first file and stops before it runs a test.
 *   - A file is therefore in the shard that its place in the sorted list gives it, and nobody assigns it: a test file that a later task
 *     adds is run by exactly one shard, and these tests need no change for it.
 *
 * A check that cannot fail proves nothing: the union check is also run on listings with a file left out, a file twice and a stray one.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ciTestShards, root } from './support'

// The probe below starts `bun test` on this suite and stops it at its preload, before a test runs. If a Bun that ignored the preload ran a
// shard instead, this file would be one of its files and would start the probe again: fail at once instead of recursing.
if (process.env.ES_SHARD_PROBE === '1') throw new Error('tests/ci/shards.test.ts was loaded by its own probe: the probe was to stop at its preload, before any test file loads')

/** What `bun test` takes for a test file: .test, _test, .spec or _spec, then a script extension. */
const TEST_FILE = /[._](?:test|spec)\.[cm]?[jt]sx?$/

/** Orders by UTF-16 code unit, which is how Bun orders the paths it deals out (a locale would put `a` before `B`). */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The test files under `base/dir`, as paths from `base` with `/` between the parts, sorted. node_modules holds none that count. */
function suiteUnder(base: string, dir: string): string[] {
  const found: string[] = []
  const walk = (relative: string) => {
    for (const entry of readdirSync(path.join(base, relative), { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(next)
      } else if (entry.isFile() && TEST_FILE.test(entry.name)) found.push(next)
    }
  }
  walk(dir)
  return found.sort(byCodeUnit)
}

/** Shard `index` of `count` (from 1) of a sorted suite: the files at the places that are `index - 1` modulo `count`. */
const shardOf = (sorted: readonly string[], index: number, count: number): string[] => sorted.filter((_, place) => place % count === index - 1)

/** What a set of listings gets wrong about the suite: the files none of them has, the files in more than one, and the files that are not the suite's. */
function audit(suite: readonly string[], shards: readonly (readonly string[])[]) {
  const where = new Map<string, number[]>()
  shards.forEach((files, at) => files.forEach((file) => where.set(file, [...(where.get(file) ?? []), at + 1])))
  return {
    missing: suite.filter((file) => !where.has(file)),
    twice: [...where].filter(([, shardsOfFile]) => shardsOfFile.length > 1).map(([file, shardsOfFile]) => `${file} is in shards ${shardsOfFile.join(' and ')}`),
    stray: [...where.keys()].filter((file) => !suite.includes(file)),
  }
}

/** Runs `bun test` with extra arguments in `cwd`, and returns everything that it printed. A run that hangs is killed after a minute. */
function bunTest(cwd: string, args: string[], env: Record<string, string> = {}): string {
  const result = spawnSync(process.execPath, ['test', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    killSignal: 'SIGKILL',
    env: { ...process.env, NO_COLOR: '1', ...env },
  })
  return `${result.stdout}${result.stderr}`
}

const scratch: string[] = []
afterAll(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

const { matrix, count, command } = ciTestShards()
const suite = suiteUnder(root, 'tests')
const listings = Array.from({ length: count }, (_, at) => shardOf(suite, at + 1, count))

describe("ci.yml's tests job, cut into shards", () => {
  test('has one job for each of the shards that its command cuts the suite into, numbered from 1', () => {
    expect(command).toBe(`bun run test --shard="$SHARD/${count}"`)
    expect(matrix).toEqual(Array.from({ length: count }, (_, at) => at + 1))
  })

  test('finds the suite: the files under tests/ that bun test takes, this one among them', () => {
    expect(suite.length).toBeGreaterThan(200)
    expect(suite).toContain('tests/ci/shards.test.ts')
    expect(suite.every((file) => file.startsWith('tests/') && TEST_FILE.test(file))).toBe(true)
    expect(new Set(suite).size).toBe(suite.length)
  })

  test("together the shards run every test file once: the union of their lists is the suite, and no file is in two of them", () => {
    expect(listings.map((files) => files.length).reduce((sum, size) => sum + size, 0)).toBe(suite.length)
    expect(audit(suite, listings)).toEqual({ missing: [], twice: [], stray: [] })
    expect(listings.flat().sort(byCodeUnit)).toEqual(suite)
  })

  test('each runs files, and no two differ by more than one file', () => {
    const sizes = listings.map((files) => files.length)
    expect(Math.min(...sizes)).toBeGreaterThan(0)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  test('the check can fail: a listing with a file left out, one twice and one that is not the suite\'s is found', () => {
    const [first, second, ...rest] = listings
    const broken = [first.slice(1), [...second, first[1], 'tests/not-a-file.test.ts'], ...rest]
    expect(audit(suite, broken)).toEqual({
      missing: [first[0]],
      twice: [`${first[1]} is in shards 1 and 2`],
      stray: ['tests/not-a-file.test.ts'],
    })
  })
})

describe('Bun cuts a suite as the listing says', () => {
  /** Test files with names that sort differently by code unit, by locale and by folder, and files that are not tests. */
  const PROBE = [
    'tests/B.test.ts',
    'tests/a.test.ts',
    'tests/10.test.ts',
    'tests/9.test.ts',
    'tests/a-b.test.ts',
    'tests/a.b.test.ts',
    'tests/a_b.test.ts',
    'tests/ab.test.ts',
    'tests/Zub/a.test.ts',
    'tests/sub/a.test.ts',
    'tests/sub-x/a.test.ts',
    'tests/sub2/a.test.ts',
    'tests/x_test.ts',
    'tests/y.spec.ts',
    'tests/_z.test.ts',
  ]
  const NOT_TESTS = ['tests/helper.ts', 'tests/testing.ts', 'tests/node_modules/dep.test.ts']

  const probeTree = (() => {
    const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-shards-'))
    scratch.push(dir)
    writeFileSync(path.join(dir, 'bunfig.toml'), '[test]\nroot = "./tests"\n')
    for (const file of [...PROBE, ...NOT_TESTS]) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      // Each test prints its own path, so that the run says which files it ran.
      writeFileSync(path.join(dir, file), `import { test } from 'bun:test'\ntest('ran', () => {\n  console.log('RAN ${file}')\n})\n`)
    }
    return dir
  })()

  test('finds the probe tree\'s files as Bun does: the test names, and not node_modules or the other scripts', () => {
    expect(suiteUnder(probeTree, 'tests')).toEqual([...PROBE].sort(byCodeUnit))
  })

  test('deals them out in turn after sorting by code unit, for 3, 4 and 5 shards, in the order the shard runs them', () => {
    const sorted = suiteUnder(probeTree, 'tests')
    for (const total of [3, 4, 5]) {
      for (let index = 1; index <= total; index++) {
        const output = bunTest(probeTree, [`--shard=${index}/${total}`])
        const ran = [...output.matchAll(/^RAN (\S+)$/gm)].map((match) => match[1])
        expect({ shard: `${index}/${total}`, ran }).toEqual({ shard: `${index}/${total}`, ran: shardOf(sorted, index, total) })
      }
    }
  })

  test('the probe tells a code-unit order from a locale order: the listing of the other order would fail it', () => {
    const sorted = suiteUnder(probeTree, 'tests')
    const byLocale = [...sorted].sort((a, b) => a.localeCompare(b))
    expect(byLocale).not.toEqual(sorted)
    for (const total of [3, 4, 5]) {
      const differs = Array.from({ length: total }, (_, at) => at + 1).some((index) => shardOf(byLocale, index, total).join() !== shardOf(sorted, index, total).join())
      expect(differs, `${total} shards`).toBe(true)
    }
  })
})

describe("Bun's own count of each shard of this suite", () => {
  // `--preload` runs before the first test file loads, and exits: Bun has printed the shard's line and the first file's name, and has run
  // no test. (A run that did not stop would be one of the shards, and tests/ci/shards.test.ts at the top of this file would end it.)
  const stop = (() => {
    const dir = mkdtempSync(path.join(tmpdir(), 'enginespace-shards-stop-'))
    scratch.push(dir)
    const file = path.join(dir, 'stop.ts')
    // Bun names a file in its output when the file prints something, so the preload prints a line before it stops.
    writeFileSync(file, "console.log('stopped')\nprocess.exit(0)\n")
    return file
  })()

  test.each(listings.map((files, at) => [at + 1, files] as const))('shard %d starts at its first file and runs as many files as the listing gives it', (index, files) => {
    const output = bunTest(root, ['--timeout', '30000', `--shard=${index}/${count}`, `--preload=${stop}`], { ES_SHARD_PROBE: '1' })
    const line = /--shard=(\d+)\/(\d+): running (\d+)\/(\d+) test files/.exec(output)
    expect(line === null ? output : line.slice(1).map(Number), 'the line that bun test prints before it runs a shard').toEqual([index, count, files.length, suite.length])
    // Under GitHub Actions Bun opens each file's output as a group, `::group::tests/x.test.ts:`, and under an AI agent's environment
    // (CLAUDECODE) it prints the bare name, which is how the merge gates ran this and missed the group on PR #6's CI (2026-11-10).
    expect(/^(?:::group::)?(tests\/\S+):$/m.exec(output)?.[1], "the first file of the shard, which is the listing's first").toBe(files[0])
  })
})
