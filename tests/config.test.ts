/*
 * The scaffold's configuration files must agree with each other, and the purity boundary of D-014 must stay in place.
 *
 *   - Vite and TypeScript resolve the same aliases to the same folders, or a build and a typecheck disagree.
 *   - tsconfig.pure.json compiles packages/sim and packages/play with no DOM and no ambient types, which is what makes
 *     "a DOM reference in a pure package" a type error. W0-T03's determinism lint builds on it.
 *   - tsconfig.tools.json type-checks scripts/ and tests/ with the app's options, so `npm run typecheck` reads every TypeScript file of
 *     the repository that is not a fixture made to fail (W1b-T14).
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import config, { PACKAGES } from '../vite.config'

const root = path.resolve(import.meta.dirname, '..')

interface TsConfig {
  extends?: string
  files?: string[]
  include?: string[]
  exclude?: string[]
  references?: { path: string }[]
  compilerOptions?: { lib?: string[]; types?: string[]; paths?: Record<string, string[]> }
}

/** A tsconfig file, comments and all, parsed by TypeScript's own reader. */
function tsconfig(file: string): TsConfig {
  const { config: parsed, error } = ts.parseConfigFileTextToJson(file, readFileSync(path.join(root, file), 'utf8'))
  if (error) throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`)
  return parsed as TsConfig
}

/** A project as the compiler reads it, with `extends` followed: its options, and the files that its `include` and `exclude` pick. */
function project(file: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(path.join(root, file), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(`${file}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
    },
  })
  if (parsed === undefined || parsed.errors.length > 0) throw new Error(`${file}: ${parsed?.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('; ')}`)
  return parsed
}

/** Every file under `dirs`, as paths from the root with slashes. */
const filesUnder = (...dirs: string[]): string[] =>
  dirs.flatMap((dir) =>
    (readdirSync(path.join(root, dir), { recursive: true }) as string[]).filter((entry) => path.extname(entry) !== '').map((entry) => `${dir}/${entry.split(path.sep).join('/')}`),
  )

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
  test('the root builds the app, node, pure and tools projects and compiles nothing itself', () => {
    const rootConfig = tsconfig('tsconfig.json')
    expect(rootConfig.files).toEqual([])
    expect(rootConfig.references?.map((ref) => ref.path)).toEqual(['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.pure.json', './tsconfig.tools.json'])
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

describe('scripts/ and tests/ are type-checked (W1b-T14)', () => {
  const tools = project('tsconfig.tools.json')
  const app = project('tsconfig.app.json')
  const rooted = (file: string) => path.relative(root, file).split(path.sep).join('/')

  test('the tools project is the app project with Node, the DOM and Vite beside it, so the strictness is the same and the aliases are the same', () => {
    expect(tsconfig('tsconfig.tools.json').extends).toBe('./tsconfig.app.json')
    const STRICT = ['strict', 'noUnusedLocals', 'noUnusedParameters', 'erasableSyntaxOnly', 'noFallthroughCasesInSwitch', 'noUncheckedSideEffectImports', 'verbatimModuleSyntax', 'noEmit'] as const
    expect(Object.fromEntries(STRICT.map((option) => [option, tools.options[option]]))).toEqual(Object.fromEntries(STRICT.map((option) => [option, app.options[option]])))
    expect(STRICT.every((option) => tools.options[option] === true)).toBe(true)
    expect(tools.options.paths).toEqual(app.options.paths)
    expect(tools.options.rootDirs).toEqual(app.options.rootDirs)
    expect(tsconfig('tsconfig.tools.json').compilerOptions?.types).toEqual(['node', 'vite/client'])
    expect(tsconfig('tsconfig.tools.json').compilerOptions?.lib).toContain('DOM')
  })

  test('it covers scripts and tests, and the js-yaml declaration that the content compiler in scripts needs', () => {
    expect(tsconfig('tsconfig.tools.json').include).toEqual(['scripts', 'tests', 'src/types/js-yaml.d.ts'])
  })

  test('it checks every TypeScript file under scripts/ and tests/ but the two fixtures that the type checker must refuse', () => {
    const checked = new Set(tools.fileNames.map(rooted))
    const files = filesUnder('scripts', 'tests').filter((file) => /\.(?:ts|tsx|mts|cts)$/.test(file))
    // The walk found the folders' files, or the check below would pass on nothing.
    expect(files).toContain('scripts/verify.ts')
    expect(files).toContain('tests/config.test.ts')
    // tests/design/readout.test.ts compiles these two under the app's options and expects one error from each (a number with no tag, and
    // a tick count with a tag that is not synthetic), so the project that `npm run typecheck` builds cannot hold them.
    expect(files.filter((file) => !checked.has(file)).sort()).toEqual(['tests/fixtures/design/readout-ticks-not-synthetic.tsx', 'tests/fixtures/design/readout-untagged.tsx'])
    expect(tsconfig('tsconfig.tools.json').exclude).toEqual(['tests/fixtures/design/readout-untagged.tsx', 'tests/fixtures/design/readout-ticks-not-synthetic.tsx'])
  })

  test('no JavaScript file sits under scripts/ or tests/, where the compiler would not look at it', () => {
    expect(filesUnder('scripts', 'tests').filter((file) => /\.(?:c|m)?jsx?$/.test(file))).toEqual([])
  })

  test('the declaration files that it relies on are well formed, which skipLibCheck would not say', () => {
    // skipLibCheck skips every .d.ts, ours too, so a misspelt type in scripts/types/bun.d.ts would read as `any` and nothing would say so.
    const declarations = ['scripts/types/bun.d.ts', 'src/types/js-yaml.d.ts'].map((file) => path.join(root, file))
    const program = ts.createProgram({ rootNames: declarations, options: { ...tools.options, skipLibCheck: false } })
    for (const file of declarations) {
      const source = program.getSourceFile(file)
      if (source === undefined) throw new Error(`${file} is not in the program`)
      const found = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)]
      expect(found.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
    }
  })
})
