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
import { ALLOWED, BANNED, GATE_ONLY, UNBANNED_MATH } from './cases'

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
      'packages/sim/math-log2.ts',
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
    expect(files.length).toBe(11)
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
      'packages/sim/math-log2.ts': 1,
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

describe('the Math list against ECMA-262', () => {
  /**
   * The functions that ECMA-262 does not precisely specify: the note that opens "Function Properties of the Math Object" in the
   * `es2026` tag of tc39/ecma262 (spec.html, SHA-256 032ecc740356b38f6846338d8c44536291a134a6ce60e651f935befb239cfc1a, read
   * 2026-11-04) names these 23, in this order, and the `es2025` tag's note names the same 23. Each but `pow` and `random` has
   * "an implementation-approximated Number value" in the steps of its clause, `pow` defers to Number::exponentiate, which says the
   * same, and `random` is "implementation-defined". They are typed out here so that the test needs no network.
   */
  const NOT_PRECISELY_SPECIFIED = [
    'acos',
    'acosh',
    'asin',
    'asinh',
    'atan',
    'atanh',
    'atan2',
    'cbrt',
    'cos',
    'cosh',
    'exp',
    'expm1',
    'hypot',
    'log',
    'log1p',
    'log2',
    'log10',
    'pow',
    'random',
    'sin',
    'sinh',
    'tan',
    'tanh',
  ]

  test('bans every function that the standard does not precisely specify, and no other', () => {
    expect([...BANNED_MATH]).toEqual(NOT_PRECISELY_SPECIFIED)
  })

  test('allows none of them', () => {
    expect(UNBANNED_MATH.filter((name) => NOT_PRECISELY_SPECIFIED.includes(name))).toEqual([])
  })

  test('judges every function of the Math object that this engine has, so a function that a later engine adds must be decided on', () => {
    const functions = Object.getOwnPropertyNames(Math).filter((name) => typeof (Math as unknown as Record<string, unknown>)[name] === 'function')
    const judged: readonly string[] = [...BANNED_MATH, ...UNBANNED_MATH]
    expect(functions.length).toBeGreaterThan(30)
    expect(functions.filter((name) => !judged.includes(name))).toEqual([])
  })

  /** tests/lint/math-engines.ts under one engine: a digest of each function's results over 20,000 fixed inputs. */
  function digests(command: string): { engine: string; inputs: number; digests: Record<string, string> } {
    const run = spawnSync(command, [path.join(root, 'tests/lint/math-engines.ts')], { encoding: 'utf8' })
    if (run.status !== 0) throw new Error(`${command} tests/lint/math-engines.ts exited with ${run.status}: ${run.stderr}${run.error ?? ''}`)
    return JSON.parse(run.stdout)
  }

  test('allows only functions that are exact: Bun (JavaScriptCore) and Node (V8) return the same bits from each of them', () => {
    const bun = digests(process.execPath)
    const node = digests('node')
    expect([bun.engine.split(' ')[0], node.engine.split(' ')[0]]).toEqual(['bun', 'node'])
    expect(bun.inputs).toBe(node.inputs)
    // Node 22 has not got f16round, and sumPrecise takes an iterable: the comparison covers the ES2022 functions.
    const compared = UNBANNED_MATH.filter((name) => name in node.digests)
    expect(compared.length).toBeGreaterThanOrEqual(12)
    for (const name of compared) expect([name, bun.digests[name]]).toEqual([name, node.digests[name]])
  })

  test('has a digest of every banned function but random, so that the counts in §5.1 can be measured again', () => {
    const { digests: found } = digests(process.execPath)
    for (const name of BANNED_MATH.filter((member) => member !== 'random')) expect(found[name], name).toMatch(/^[0-9a-f]{16}$/)
    expect(found.exponentiation).toMatch(/^[0-9a-f]{16}$/)
  })

  test('is named in §5.1 with the standard it comes from, the tag that was read and the date', () => {
    const architecture = readFileSync(path.join(root, 'docs/ARCHITECTURE.md'), 'utf8')
    const section = /### 5\.1 Rules[\s\S]*?### 5\.2/.exec(architecture)?.[0] ?? ''
    expect(section).toContain('ECMA-262')
    expect(section).toContain('es2026')
    expect(section).toContain('2026-11-04')
  })
})
