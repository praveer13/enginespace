/*
 * W0-T03's acceptance check 1: a fixture with Math.random() in packages/sim fails verify:determinism, and the clean tree
 * passes. The gate (scripts/verify-determinism.ts) runs here as its own process, the way CI runs it, and in-process over
 * tests/lint/cases.ts, the table that eslint.config.js is held to as well (tests/lint/eslint-rules.test.ts).
 *
 * tests/fixtures/lint/determinism is a miniature repo: bad files under packages/sim and packages/play, and one clean file.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BANNED_GLOBALS, BANNED_MATH, inScope, lintSource, lintTree } from '../../scripts/verify-determinism'
import { ALLOWED, BANNED, GATE_ONLY } from './cases'

const root = path.resolve(import.meta.dirname, '../..')
const fixture = path.join(root, 'tests/fixtures/lint/determinism')

/** Runs the gate as CI does, in its own process. */
function gate(...args: string[]) {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/verify-determinism.ts'), ...args], { cwd: root, encoding: 'utf8' })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

describe('verify:determinism, run as a process', () => {
  test('passes on the clean tree, and says how many files it read', () => {
    const run = gate()
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    const files = Number(/(\d+) file\(s\) in scope, 0 findings/.exec(run.stdout)?.[1])
    expect(files).toBeGreaterThanOrEqual(2) // at least packages/sim/index.ts and packages/play/index.ts
  })

  test('fails on a fixture with Math.random() in packages/sim, and names the file, the line and the reason', () => {
    const run = gate('--root', fixture)
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/^packages\/sim\/math-random\.ts:2:\d+ Math\.random is unseeded/m)
  })

  test('reports every bad file of the fixture, and not the clean one', () => {
    const run = gate('--root', fixture)
    const reported = new Set([...run.stderr.matchAll(/^(packages\/\S+?):\d+:\d+ /gm)].map((match) => match[1]))
    expect([...reported].sort()).toEqual([
      'packages/play/crypto-entropy.ts',
      'packages/play/date-now.ts',
      'packages/play/dom.ts',
      'packages/play/performance-now.ts',
      'packages/sim/alias.ts',
      'packages/sim/exponent-operator.ts',
      'packages/sim/math-pow.ts',
      'packages/sim/math-random.ts',
      'packages/sim/sort-without-comparator.ts',
    ])
  })

  test('a root with no packages has nothing to lint and passes', () => {
    const run = gate('--root', path.join(root, 'tests/fixtures/lint/pure-dom'))
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('0 file(s) in scope, 0 findings')
  })
})

describe('the fixture tree, in process', () => {
  const { files, findings } = lintTree(fixture)

  test('reads the two packages and every file in them', () => {
    expect(files.length).toBe(10)
    expect(files.every(inScope)).toBe(true)
  })

  test('finds one thing wrong in each bad file, two in dom.ts, and nothing in clean.ts', () => {
    const counts: Record<string, number> = {}
    for (const { file } of findings) counts[file] = (counts[file] ?? 0) + 1
    expect(counts).toEqual({
      'packages/play/crypto-entropy.ts': 1,
      'packages/play/date-now.ts': 1,
      'packages/play/dom.ts': 2, // document, and window
      'packages/play/performance-now.ts': 1,
      'packages/sim/alias.ts': 1, // the alias itself: the gate does not wait for M.random()
      'packages/sim/exponent-operator.ts': 1,
      'packages/sim/math-pow.ts': 1,
      'packages/sim/math-random.ts': 1,
      'packages/sim/sort-without-comparator.ts': 1,
    })
  })
})

describe('what the gate bans', () => {
  for (const { name, code } of [...BANNED, ...GATE_ONLY]) {
    test(`flags ${name}`, () => {
      expect(lintSource('x.ts', code).length).toBeGreaterThan(0)
    })
  }

  for (const { name, code } of ALLOWED) {
    test(`allows ${name}`, () => {
      expect(lintSource('x.ts', code)).toEqual([])
    })
  }

  test('puts a finding on the line and column of the offending token', () => {
    expect(lintSource('x.ts', 'export const f = Math.random()')).toEqual([
      { line: 1, col: 18, message: expect.stringContaining('Math.random is unseeded') },
    ])
    expect(lintSource('x.ts', 'const a = 1\nexport const f = a\n  ** 2')).toEqual([{ line: 3, col: 3, message: expect.stringContaining('Math.pow') }])
  })

  test('is not silenced by an eslint-disable comment', () => {
    const code = '/* eslint-disable */\n// eslint-disable-next-line no-restricted-properties\nexport const f = Math.random()'
    expect(lintSource('x.ts', code)).toHaveLength(1)
  })

  test('reads JSX files as well as TypeScript', () => {
    expect(lintSource('x.tsx', 'export const f = () => <p>{Date.now()}</p>')).toHaveLength(1)
  })

  test('judges only the packages named in A§5.1', () => {
    expect(['packages/sim/index.ts', 'packages/play/loop/layout.tsx', 'packages/sim/core/rng.mjs'].every(inScope)).toBe(true)
    expect(['packages/ledger/index.ts', 'packages/schema/a.ts', 'packages/verify/a.ts', 'src/a.ts', 'scripts/a.ts', 'packages/sim/a.d.ts', 'packages/sim/NOTES.md'].some(inScope)).toBe(false)
  })
})

describe('the ban list against ARCHITECTURE §5.1', () => {
  const architecture = readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8')

  test('bans the Math members that §5.1 names, and no others', () => {
    const sentence = /It bans `Math\.exp`([^.]*)\./.exec(architecture)
    if (!sentence) throw new Error('docs/ARCHITECTURE.md §5.1 no longer says "It bans `Math.exp`, …"')
    const named = ['exp', ...[...sentence[1].matchAll(/`(\w+)`/g)].map((match) => match[1])]
    expect([...BANNED_MATH].sort()).toEqual(named.sort())
  })

  test('bans the clock, entropy and DOM globals that §5.1 and the tracker name, and globalThis, which reaches them', () => {
    expect(Object.keys(BANNED_GLOBALS).sort()).toEqual(['Date', 'crypto', 'document', 'globalThis', 'performance', 'window'])
    expect(architecture).toContain('It bans `**`, `Date`, `performance` and `crypto`.')
  })
})
