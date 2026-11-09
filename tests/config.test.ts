/*
 * The scaffold's configuration files must agree with each other, and the purity boundary of D-014 must stay in place.
 *
 *   - Vite and TypeScript resolve the same aliases to the same folders, or a build and a typecheck disagree.
 *   - tsconfig.pure.json compiles packages/sim and packages/play with no DOM and no ambient types, which is what makes
 *     "a DOM reference in a pure package" a type error. W0-T03's determinism lint builds on it.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import config, { PACKAGES } from '../vite.config'

const root = path.resolve(import.meta.dirname, '..')

interface TsConfig {
  files?: string[]
  include?: string[]
  references?: { path: string }[]
  compilerOptions?: { lib?: string[]; types?: string[]; paths?: Record<string, string[]> }
}

/** A tsconfig file, comments and all, parsed by TypeScript's own reader. */
function tsconfig(file: string): TsConfig {
  const { config: parsed, error } = ts.parseConfigFileTextToJson(file, readFileSync(path.join(root, file), 'utf8'))
  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`)
  return parsed as TsConfig
}

describe('path aliases', () => {
  const packagePaths = Object.fromEntries(
    PACKAGES.flatMap((name) => [
      [`@es/${name}`, [`./packages/${name}`]],
      [`@es/${name}/*`, [`./packages/${name}/*`]],
    ]),
  )

  test('the internal packages are sim, play, ledger, schema and verify (D-014)', () => {
    expect([...PACKAGES].sort()).toEqual(['ledger', 'play', 'schema', 'sim', 'verify'])
  })

  test('Vite aliases @ to src and each @es/<package> to its folder', () => {
    const alias = config.resolve?.alias as Record<string, string>
    expect(alias).toEqual({
      '@': path.join(root, 'src'),
      ...Object.fromEntries(PACKAGES.map((name) => [`@es/${name}`, path.join(root, 'packages', name)])),
    })
  })

  test('tsconfig.json (for Bun and editors) and tsconfig.app.json map the same aliases to the same folders', () => {
    // The second target of `@/*` is the type shim of the vendored FSRS model (W1-T05; vendor/kernelspace/VENDOR.md, "Type shims"). Vite
    // does not need it: the import it stands in for is a type, which is erased before Vite resolves anything.
    const expected = { '@/*': ['./src/*', './vendor/kernelspace/shims/src/*'], ...packagePaths }
    expect(tsconfig('tsconfig.json').compilerOptions?.paths).toEqual(expected)
    expect(tsconfig('tsconfig.app.json').compilerOptions?.paths).toEqual(expected)
  })

  test('pure code can reach the other packages but not src', () => {
    expect(tsconfig('tsconfig.pure.json').compilerOptions?.paths).toEqual(packagePaths)
  })
})

describe('the TypeScript projects', () => {
  test('the root builds the app, node and pure projects and compiles nothing itself', () => {
    const rootConfig = tsconfig('tsconfig.json')
    expect(rootConfig.files).toEqual([])
    expect(rootConfig.references?.map((ref) => ref.path)).toEqual(['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.pure.json'])
  })

  test('pure code compiles with lib ES2022 only, no ambient types, and covers packages/sim and packages/play', () => {
    const pure = tsconfig('tsconfig.pure.json')
    expect(pure.compilerOptions?.lib).toEqual(['ES2022'])
    expect(pure.compilerOptions?.types).toEqual([])
    // The third entry is the one-line shim that declares `crypto` for the vendored rng.ts's freshSeed() (VENDOR.md, W0-T12).
    expect(pure.include).toEqual(['packages/sim', 'packages/play', 'vendor/kernelspace/shims/ambient.d.ts'])
  })

  test('the app project has the DOM, and covers src and the packages that run in the browser or a worker', () => {
    const app = tsconfig('tsconfig.app.json')
    expect(app.compilerOptions?.lib).toContain('DOM')
    expect(app.include).toEqual(['src', 'packages/ledger', 'packages/schema', 'packages/verify'])
  })

  test('the node project covers the Vite and Tailwind configs, and the js-yaml declaration that the content compiler in them needs', () => {
    expect(tsconfig('tsconfig.node.json').include).toEqual(['vite.config.ts', 'tailwind.config.ts', 'src/types/js-yaml.d.ts'])
  })
})
