/*
 * The keys and `levelOf` are a module of their own, which the registry re-exports (W1-T28, D-053). The front page reads those and no
 * game's record besides Service's, and its first-paint JavaScript is gated: with the keys apart and the call that makes `GAMES` marked
 * pure, a build in which nothing reads `GAMES` leaves the registry out of that closure, and a game registered later costs it nothing.
 * `verify:bundle` holds the size. These checks hold the two properties that keep it, so that a change that loses one says why.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as keys from '@es/play/keys'
import * as registry from '@es/play/registry'

const root = path.resolve(import.meta.dirname, '../..')
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('the keys apart from the registry', () => {
  test('the registry re-exports the same keys, the same checks and the same lookup, and not copies of them', () => {
    for (const name of ['COMMON_KEYS', 'keymapOf', 'keyProblems', 'levelOf'] as const) expect(registry[name]).toBe(keys[name])
  })

  test('keys.ts imports types and nothing else, so what reads only the keys reads no game', () => {
    const imports = source('packages/play/keys.ts')
      .split('\n')
      .filter((line) => /^import\b/.test(line))
    expect(imports.length).toBeGreaterThan(0)
    for (const line of imports) expect(line).toMatch(/^import type /)
  })

  test('the registry marks the call that makes GAMES as pure, so that a build which never reads GAMES leaves every record out', () => {
    expect(source('packages/play/registry.ts')).toContain('export const GAMES: GameRegistry = /* @__PURE__ */ createRegistry(')
  })

  test('nothing the front page imports for the first paint reads the registry by name', () => {
    // The front page needs the keys, a level and Service's record. An import of GAMES or of the registry there would bring every game in.
    const front = source('src/front/FrontPage.tsx')
    expect(front).not.toMatch(/import\s*{[^}]*\bGAMES\b[^}]*}\s*from/)
    expect(front).not.toMatch(/from '@es\/play\/registry'/)
  })
})
