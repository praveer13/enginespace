/*
 * The vendored files compile, unchanged, in the two kinds of program that will hold them, and each type shim is needed.
 *
 *   - pure: lib ES2022 and no ambient types, like tsconfig.pure.json, which will hold rng.ts and the S5 card
 *     (packages/sim). rng.ts calls `crypto`, which only shims/ambient.d.ts declares there.
 *   - app: the DOM lib and Vite's types, like tsconfig.app.json, which will hold fsrs.ts and the Forge host
 *     (src/items/today, src/forge). They import from modules this repository does not have, and the shims stand in.
 *
 * Both programs use the options of tsconfig.app.json (strict, noUnusedLocals, verbatimModuleSyntax, erasableSyntaxOnly),
 * and map the shims the way VENDOR.md says a wrapper must. The last test takes the mapping away, one piece at a time,
 * and reads the compiler's complaint: that is how it is known that each shim is doing something.
 */
import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '../..')
const vendor = path.join(root, 'vendor/kernelspace')
const at = (...parts: string[]) => path.join(vendor, ...parts)

const shared = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  moduleDetection: 'force',
  allowImportingTsExtensions: true,
  verbatimModuleSyntax: true,
  noEmit: true,
  strict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  erasableSyntaxOnly: true,
  noFallthroughCasesInSwitch: true,
  noUncheckedSideEffectImports: true,
  skipLibCheck: true,
  useDefineForClassFields: true,
}

/** What VENDOR.md tells a wrapper to put in its tsconfig, with absolute paths so no baseUrl is needed. */
const mapping = {
  paths: { '@/*': [path.join(root, 'src/*'), at('shims/src/*')] },
  rootDirs: [at('src'), at('shims/src')],
}

const pure = { ...shared, lib: ['ES2022'], types: [], ...mapping }
const app = { ...shared, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['vite/client'], ...mapping }

/** Compiles the files with the options and returns the diagnostics as `file:line TScode message` lines. */
function compile(files: string[], json: Record<string, unknown>) {
  const { options, errors } = ts.convertCompilerOptionsFromJson(json, root)
  expect(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))).toEqual([])
  const program = ts.createProgram({ rootNames: files, options })
  const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => {
    const where = d.file ? `${path.relative(root, d.file.fileName)}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1}` : ''
    return `${where} TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
  })
  return { diagnostics, sources: program.getSourceFiles().map((file) => path.relative(vendor, file.fileName)) }
}

const pureFiles = ['src/lib/rng.ts', 'src/lib/world/physics/card.ts', 'src/lib/world/physics/types.ts', 'src/lib/learner/fsrs.ts', 'shims/ambient.d.ts'].map((f) => at(f))
const appFiles = [
  'src/lib/learner/fsrs.ts',
  'src/lib/forge/abi.ts',
  'src/lib/forge/types.ts',
  'src/lib/forge/run.ts',
  'src/lib/wasm-lab.ts',
  'src/lib/lab-worker.ts',
  'src/workers/lab.worker.ts',
  'src/workers/lab-protocol.ts',
].map((f) => at(f))

describe('the vendored files compile as they are', () => {
  test('in a pure program: rng.ts, the S5 card and its types, and fsrs.ts', () => {
    const { diagnostics } = compile(pureFiles, pure)
    expect(diagnostics).toEqual([])
  }, 60_000)

  test('in an app program: fsrs.ts and the Forge host, with both type shims in play', () => {
    const { diagnostics, sources } = compile(appFiles, app)
    expect(diagnostics).toEqual([])
    // Not vacuous: the compiler read the shims, so the two imports that leave the set were resolved to them.
    expect(sources).toContain('shims/src/lib/learner/types.ts')
    expect(sources).toContain('shims/src/lib/ledger/types.ts')
  }, 60_000)
})

describe('each shim is needed', () => {
  test('without the `@/*` fallback, fsrs.ts cannot find its learner types', () => {
    const { diagnostics } = compile([at('src/lib/learner/fsrs.ts')], { ...app, paths: { '@/*': [path.join(root, 'src/*')] } })
    expect(diagnostics).toEqual([expect.stringMatching(/fsrs\.ts:12 TS2307 Cannot find module '@\/lib\/learner\/types'/)])
  }, 60_000)

  test('without `rootDirs`, run.ts cannot find its ledger types', () => {
    const { diagnostics } = compile([at('src/lib/forge/run.ts')], { ...app, rootDirs: undefined })
    expect(diagnostics).toEqual([expect.stringMatching(/run\.ts:16 TS2307 Cannot find module '\.\.\/ledger\/types'/)])
  }, 60_000)

  test('without ambient.d.ts, rng.ts has no `crypto` in a pure program', () => {
    const { diagnostics } = compile([at('src/lib/rng.ts')], pure)
    expect(diagnostics).toEqual([expect.stringMatching(/rng\.ts:\d+ TS2304 Cannot find name 'crypto'/)])
  }, 60_000)
})
