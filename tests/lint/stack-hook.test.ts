/*
 * A test file that lints puts Error.prepareStackTrace back when it is done (./stack-hook.ts), so a file that loads Vite after it, in
 * the same `bun test` process, still loads it. On PR #6's CI (2026-11-10) the second shard ran tests/content/parse.test.ts before
 * tests/lint/boundaries.test.ts, Babel's rewriter was still installed when Vite loaded, and Vite's bundled follow-redirects failed
 * with "First argument must be an Error object". Which files share a shard changes whenever a test file is added, so every file that
 * lints holds the hook, and each one is run here before a file that loads Vite.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { holdStackHook, setStackHook } from './stack-hook'

const root = path.resolve(import.meta.dirname, '../..')

/** The test files under tests/, as paths from the repo root. */
function testFiles(dir = 'tests'): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const next = `${dir}/${entry.name}`
    if (entry.isDirectory()) return testFiles(next)
    return /\.test\.tsx?$/.test(entry.name) ? [next] : []
  })
}

/** The test files that run ESLint in the test process. */
const LINTING = testFiles().filter((file) => /\bnew ESLint\(/.test(readFileSync(path.join(root, file), 'utf8')))

describe('the stack trace hook that a lint installs', () => {
  test('a hold puts back the hook it found, and keeps the one installed under it', () => {
    const before = Error.prepareStackTrace
    const rewriter = () => 'rewritten'
    const hold = holdStackHook()
    setStackHook(rewriter)
    expect(hold.rewriter()).toBe(rewriter)
    hold.release()
    expect(Error.prepareStackTrace).toBe(before)
    // A later hold, under which nothing installs a hook, still hands over the kept one.
    const later = holdStackHook()
    expect(later.rewriter()).toBe(rewriter)
    later.release()
    expect(Error.prepareStackTrace).toBe(before)
  })

  test('every test file that runs ESLint holds the hook', () => {
    expect(LINTING).toContain('tests/lint/eslint-rules.test.ts')
    expect(LINTING).toContain('tests/content/parse.test.ts')
    expect(LINTING.filter((file) => !readFileSync(path.join(root, file), 'utf8').includes('holdStackHook('))).toEqual([])
  })

  test.each(LINTING)('%s, then a file that loads Vite, in one bun test process: both pass', (file) => {
    // `./` makes bun test take the arguments as files, in this order, and not as filters.
    const run = spawnSync(process.execPath, ['test', '--timeout', '30000', `./${file}`, './tests/lint/boundaries.test.ts'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      killSignal: 'SIGKILL',
      env: { ...process.env, NO_COLOR: '1' },
    })
    const output = `${run.stdout}${run.stderr}`
    expect(output).not.toContain('Unhandled error')
    expect(output).toMatch(/^ 0 fail$/m)
    expect(run.status).toBe(0)
  }, 150_000)
})
