/*
 * The rules that W0-T03 added to eslint.config.js, one case for each ban and each fence, so a rule dropped from the config
 * fails a test. The rules run through ESLint's own API on snippets linted as if they lived at a given path, which is how a
 * file under packages/sim meets the rules for packages/sim.
 *
 *   - The determinism bans (ARCHITECTURE §5.1, D-017) hold in packages/sim and packages/play and nowhere else. They agree with
 *     scripts/verify-determinism.ts on tests/lint/cases.ts, and no inline comment can switch them off.
 *   - dangerouslySetInnerHTML is banned everywhere (ARCHITECTURE §12, D-016).
 *   - The import fences of ARCHITECTURE §2.3 and the three fence (ARCHITECTURE §2.3, D-023). The fence matrix agrees with
 *     scripts/verify-boundaries.ts, which also resolves the relative paths that a rule on specifier text cannot.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ESLint } from 'eslint'
import { RULES } from '../../scripts/verify-boundaries'
import { BANNED_MATH } from '../../scripts/verify-determinism'
import { ALLOWED, BANNED } from './cases'

const root = path.resolve(import.meta.dirname, '../..')
const eslint = new ESLint({ cwd: root })

/** The rule ids of the errors ESLint reports for `code` linted as if it lived at `as`, a path relative to the repo root. */
async function errors(as: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, as) })
  return result.messages.filter((message) => message.severity === 2).map((message) => message.ruleId ?? `fatal: ${message.message}`)
}

const PURE = ['packages/sim/x.ts', 'packages/play/x.ts']

describe('the determinism bans in packages/sim and packages/play', () => {
  for (const as of PURE) {
    for (const { name, code } of BANNED) {
      test(`${as} flags ${name}`, async () => {
        const flagged = await errors(as, code)
        expect(flagged.length).toBeGreaterThan(0)
        expect(flagged.filter((id) => !id.startsWith('no-restricted-'))).toEqual([])
      })
    }
    for (const { name, code } of ALLOWED) {
      test(`${as} allows ${name}`, async () => {
        expect(await errors(as, code)).toEqual([])
      })
    }
  }

  test('ban exactly the Math members that scripts/verify-determinism.ts bans', async () => {
    const config = await eslint.calculateConfigForFile(path.join(root, 'packages/sim/x.ts'))
    const options = config?.rules?.['no-restricted-properties'] as [unknown, ...{ object: string; property: string }[]]
    const banned = options.slice(1).map((entry) => (entry as { property: string }).property)
    expect(banned.sort()).toEqual([...BANNED_MATH].sort())
  })

  test('apply nowhere else: the same code passes in the other packages, in src, in scripts and in tests', async () => {
    const code = 'export const f = Math.random() + Date.now() + 2 ** 3 + [3, 1].sort().length + performance.now()'
    for (const as of ['packages/ledger/x.ts', 'packages/schema/x.ts', 'packages/verify/x.ts', 'src/x.ts', 'scripts/x.ts', 'tests/x.ts']) {
      expect([as, await errors(as, code)]).toEqual([as, []])
    }
  })

  test('cannot be switched off by an inline comment, which ESLint reports as having no effect', async () => {
    const code = '// eslint-disable-next-line no-restricted-properties\nexport const f = Math.random()\n/* eslint-disable */\nexport const g = Date.now()'
    expect(await errors('packages/sim/x.ts', code)).toEqual(['no-restricted-properties', 'no-restricted-globals'])
    const [result] = await eslint.lintText(code, { filePath: path.join(root, 'packages/sim/x.ts') })
    const warnings = result.messages.filter((message) => message.severity === 1).map((message) => message.message)
    expect(warnings).toHaveLength(2)
    for (const warning of warnings) expect(warning).toContain("has no effect because you have 'noInlineConfig' setting in your config")
  })

  test('hold for the bad files of the fixture tree, which the gate flags too', async () => {
    const fixture = path.join(root, 'tests/fixtures/lint/determinism')
    const verdict: Record<string, boolean> = {}
    for (const pkg of ['sim', 'play']) {
      for (const file of readdirSync(path.join(fixture, 'packages', pkg))) {
        const as = `packages/${pkg}/${file}`
        verdict[as] = (await errors(as, readFileSync(path.join(fixture, as), 'utf8'))).length > 0
      }
    }
    // alias.ts is the one the gate alone flags: a rule on single nodes cannot follow `const M = Math`.
    expect(Object.entries(verdict).filter(([, flagged]) => !flagged).map(([as]) => as).sort()).toEqual(['packages/sim/alias.ts', 'packages/sim/clean.ts'])
  })
})

describe('dangerouslySetInnerHTML', () => {
  const where = ['src/x.tsx', 'packages/schema/x.tsx', 'packages/sim/x.tsx', 'scripts/x.tsx', 'tests/x.tsx']
  const spellings = {
    'as a JSX attribute': 'export const f = () => <p dangerouslySetInnerHTML={{ __html: "x" }} />',
    'as an object key': "export const props = { dangerouslySetInnerHTML: { __html: 'x' } }",
    'as a string key': "export const props = { 'dangerouslySetInnerHTML': { __html: 'x' } }",
    'as a property read': 'export const f = (props: Record<string, unknown>) => props.dangerouslySetInnerHTML',
    'as a property assignment': "export const f = (props: Record<string, unknown>) => { props['dangerouslySetInnerHTML'] = 1 }",
  }
  for (const as of where) {
    for (const [name, code] of Object.entries(spellings)) {
      test(`${as} flags it ${name}`, async () => {
        expect(await errors(as, code)).toEqual(['no-restricted-syntax'])
      })
    }
  }

  test('is not triggered by a comment or a string that names it', async () => {
    const code = "// dangerouslySetInnerHTML is banned\nexport const note = 'never use dangerouslySetInnerHTML'"
    expect(await errors('src/x.ts', code)).toEqual([])
  })
})

describe('the import fences of ARCHITECTURE §2.3', () => {
  const PACKAGES = ['sim', 'play', 'ledger', 'schema', 'verify']

  // ESLint and scripts/verify-boundaries.ts must draw the same fences between packages. This runs every pair through ESLint,
  // through the aliases that tsconfig.json defines, and compares the verdict with the gate's table.
  for (const importer of PACKAGES) {
    const rule = RULES[`packages/${importer}`]
    for (const target of PACKAGES.filter((name) => name !== importer)) {
      const mayImportValues = rule.imports.includes(`packages/${target}`)
      const mayImportTypes = mayImportValues || rule.typesFrom.includes(`packages/${target}`)
      test(`packages/${importer} ${mayImportValues ? 'may' : mayImportTypes ? 'may import only the types of' : 'may not import'} packages/${target}`, async () => {
        const as = `packages/${importer}/x.ts`
        expect(await errors(as, `import { value } from '@es/${target}'\nexport const f = value`)).toEqual(mayImportValues ? [] : ['no-restricted-imports'])
        expect(await errors(as, `import { value } from '@es/${target}/deep/module'\nexport const f = value`)).toEqual(mayImportValues ? [] : ['no-restricted-imports'])
        expect(await errors(as, `import type { Shape } from '@es/${target}'\nexport type F = Shape`)).toEqual(mayImportTypes ? [] : ['no-restricted-imports'])
      })
    }
    test(`packages/${importer} may import itself, by alias`, async () => {
      expect(await errors(`packages/${importer}/x.ts`, `import { value } from '@es/${importer}'\nexport const f = value`)).toEqual([])
    })
  }

  test('no package imports src, by alias or by a relative path', async () => {
    for (const importer of PACKAGES) {
      const as = `packages/${importer}/core/x.ts`
      expect(await errors(as, "import { App } from '@/App'\nexport const f = App")).toEqual(['no-restricted-imports'])
      expect(await errors(as, "import { App } from '../../../src/App'\nexport const f = App")).toEqual(['no-restricted-imports'])
    }
  })

  test('no package but sim imports vendored files, and each reports once', async () => {
    const vendored = "import { splitmix32 } from '../../../vendor/kernelspace/src/lib/rng'\nexport const f = splitmix32"
    expect(await errors('packages/sim/core/x.ts', vendored)).toEqual([])
    for (const importer of ['play', 'ledger', 'schema', 'verify']) {
      expect(await errors(`packages/${importer}/core/x.ts`, vendored)).toEqual(['no-restricted-imports'])
    }
  })

  test('packages/sim and packages/play import no UI library', async () => {
    for (const importer of ['sim', 'play']) {
      for (const library of ['react', 'react-dom/client', 'react-router', 'zustand', '@radix-ui/react-slot']) {
        expect([importer, library, await errors(`packages/${importer}/x.ts`, `import * as lib from '${library}'\nexport const f = lib`)]).toEqual([importer, library, ['no-restricted-imports']])
      }
    }
  })
})

describe('the three fence', () => {
  const imports = {
    'three': "import { Scene } from 'three'\nexport const f = Scene",
    'a three addon': "import { OrbitControls } from 'three/addons/controls/OrbitControls.js'\nexport const f = OrbitControls",
    '@react-three/fiber': "import { Canvas } from '@react-three/fiber'\nexport const f = Canvas",
    'three, for its types only': "import type { Scene } from 'three'\nexport type F = Scene",
  }
  const outside = ['src/pages/Game.tsx', 'src/games/loop/Game.tsx', 'src/games/loop/View2D.tsx', 'src/design/scene-tokens.ts', 'src/front/FrontPage.tsx', 'packages/sim/x.ts', 'packages/verify/x.ts']
  const inside = ['src/scene/Stage.tsx', 'src/scene/postfx/Bloom.tsx', 'src/games/loop/Scene3D.tsx', 'src/games/pool/Scene3D.tsx']

  for (const [name, code] of Object.entries(imports)) {
    test(`${name} is imported only from src/scene and a game's Scene3D.tsx`, async () => {
      for (const as of outside) expect([as, await errors(as, code)]).toEqual([as, ['no-restricted-imports']])
      for (const as of inside) expect([as, await errors(as, code)]).toEqual([as, []])
    })
  }

  test('a file next to Scene3D.tsx, or in a folder merely named scene, gets no exemption', async () => {
    for (const as of ['src/games/loop/Scene3D.ts', 'src/games/loop/scene/Extra.tsx', 'src/games/loop/deep/Scene3D.tsx', 'src/design/scene/Tokens.ts']) {
      expect([as, await errors(as, imports.three)]).toEqual([as, ['no-restricted-imports']])
    }
  })

  test('tests, scripts and e2e specs are not fenced: the chunking test builds a real scene', async () => {
    for (const as of ['tests/fixtures/chunks/scene.ts', 'scripts/x.ts', 'e2e/x.spec.ts']) expect(await errors(as, imports.three)).toEqual([])
  })
})
