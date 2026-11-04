/*
 * W0-T03's acceptance check 3: `tsc -p tsconfig.pure.json` fails on a fixture that references `document`.
 *
 * tsconfig.pure.json compiles packages/sim and packages/play with lib ES2022 and no ambient types (config.test.ts holds
 * its options), so the DOM, the clocks and the timers are not declared there, and a reference to one is a type error. The
 * fixture project in tests/fixtures/lint/pure-dom extends that very file and compiles one module that names them. A
 * control project does the same with a clean module, so the failure is the fixture's and not the mechanism's.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const tsc = path.join(root, 'node_modules/typescript/bin/tsc')
const scratch = mkdtempSync(path.join(tmpdir(), 'enginespace-pure-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** `tsc -p <project> --noEmit` under Node, as `npm run typecheck` runs it. */
function compile(project: string) {
  const run = spawnSync('node', [tsc, '-p', project, '--noEmit'], { cwd: root, encoding: 'utf8' })
  return { status: run.status, output: `${run.stdout}${run.stderr}` }
}

/** A project that extends the repo's tsconfig.pure.json and compiles one module with the given text. */
function pureProject(name: string, source: string): string {
  const dir = path.join(scratch, name)
  const config = JSON.stringify({ extends: path.join(root, 'tsconfig.pure.json'), include: ['./module.ts'] })
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'tsconfig.json'), config)
  writeFileSync(path.join(dir, 'module.ts'), source)
  return dir
}

describe('tsc -p tsconfig.pure.json', () => {
  test('passes on the packages as they are', () => {
    const { status, output } = compile('tsconfig.pure.json')
    expect(output).toBe('')
    expect(status).toBe(0)
  })

  test('fails on a fixture that references document, and says the DOM library is missing', () => {
    const { status, output } = compile('tests/fixtures/lint/pure-dom')
    expect(status).not.toBe(0)
    expect(output).toContain("dom.ts(3,36): error TS2584: Cannot find name 'document'. Do you need to change your target library? Try changing the 'lib' compiler option to include 'dom'.")
  })

  test('fails on every other global the fixture names: window, performance, crypto and setTimeout', () => {
    const { output } = compile('tests/fixtures/lint/pure-dom')
    for (const name of ['window', 'performance', 'crypto', 'setTimeout']) expect(output).toContain(`error TS2304: Cannot find name '${name}'.`)
    // Five errors for five names: nothing else is wrong with the project, such as a bad extends path.
    expect(output.match(/error TS/g)).toHaveLength(5)
  })

  test('passes on a clean module in a project built the same way, so the fixture fails for its own reasons', () => {
    const source = [
      'export const mix = (a: number, b: number): number => Math.imul(a, 31) + Math.max(a, b)',
      'export const last = (xs: number[]): number | undefined => xs.at(-1)',
      'export const counts = new Map<string, number>([["a", 1]])',
    ].join('\n')
    expect(compile(pureProject('clean', source))).toEqual({ status: 0, output: '' })
  })

  test('also rejects the ES2023 array methods, so the sort ban has no toSorted loophole', () => {
    const { status, output } = compile(pureProject('es2023', 'export const sorted = [3, 1, 2].toSorted()'))
    expect(status).not.toBe(0)
    expect(output).toContain("Property 'toSorted' does not exist on type 'number[]'")
  })
})
