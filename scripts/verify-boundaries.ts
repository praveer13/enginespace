/**
 * verify-boundaries: ARCHITECTURE §2.3's import rules, and the lazy boundary around three (D-014, D-023).
 *
 * Two checks over the TypeScript source, with every import resolved to the file or package it names. ESLint fences the
 * same rules in the editor, but a lint rule sees only the specifier's text, so a relative path out of a package slips
 * past it. This gate does not.
 *
 *   1. The fences, for every file under packages/ and src/:
 *      - packages/sim imports nothing outside itself except kernelspace's vendored rng and S5 card, and no npm package;
 *      - packages/play imports packages/sim and the types (never the values) of packages/schema, and no npm package;
 *      - packages/verify imports packages/sim and packages/schema;
 *      - packages/ledger imports packages/schema;
 *      - packages/schema imports no other package (A§2.3 lists none for it);
 *      - no package imports src/**, and nothing imports content/, which only the compiler reads (§4.6);
 *      - only src/scene and each game's Scene3D.tsx import three or @react-three/*.
 *   2. The static path: a walk from src/main.tsx along static imports fails when it reaches three or @react-three/*.
 *      `import()` ends a path, which is how React.lazy and the lazy route loaders keep three out of the first paint.
 *      `import type` ends one too, because TypeScript erases it. An eager `import.meta.glob` makes every match a static
 *      import and cannot be followed, so the walk fails on one rather than guess.
 *
 * Data imports (JSON, CSS, images, anything with a `?query`) are bundled but never walked, and only content/ is fenced for
 * them: A§13 lets packages/sim read public/traces/*.json through a build-time import.
 *
 *   bun scripts/verify-boundaries.ts [--root <dir>] [--entry <file>]...
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export interface Violation {
  file: string
  line: number
  col: number
  message: string
}

/** The files of the pure packages that A§2.3 lets packages/sim import: kernelspace's rng and its S5 card (with its types). */
export const SIM_VENDORED: readonly string[] = [
  'vendor/kernelspace/src/lib/rng',
  'vendor/kernelspace/src/lib/world/physics/card',
  'vendor/kernelspace/src/lib/world/physics/types',
]

interface PackageRule {
  /** The packages whose code this package may import, values and types. */
  imports: readonly string[]
  /** The packages whose types, and only their types, this package may import. */
  typesFrom: readonly string[]
  /** Whether this package may import any npm package or node module. */
  npm: boolean
  /** Whether this package may import the vendored files of SIM_VENDORED. */
  vendored: boolean
  why: string
}

/** ARCHITECTURE §2.3, one rule per package. A package that is not here is not one of the five of §2.2. */
export const RULES: Readonly<Record<string, PackageRule>> = {
  'packages/sim': {
    imports: [],
    typesFrom: [],
    npm: false,
    vendored: true,
    why: "imports nothing outside itself except kernelspace's vendored rng and S5 card",
  },
  'packages/play': {
    imports: ['packages/sim'],
    typesFrom: ['packages/schema'],
    npm: false,
    vendored: false,
    why: 'imports packages/sim and the types in packages/schema',
  },
  'packages/verify': {
    imports: ['packages/sim', 'packages/schema'],
    typesFrom: [],
    npm: true,
    vendored: false,
    why: 'imports packages/sim and packages/schema',
  },
  'packages/ledger': { imports: ['packages/schema'], typesFrom: [], npm: true, vendored: false, why: 'imports packages/schema only' },
  // §2.3 lists no imports for schema, so the fence reads it as a leaf.
  'packages/schema': { imports: [], typesFrom: [], npm: true, vendored: false, why: 'is a leaf and imports no other package' },
}

/** The scene kit, and each game's lazily loaded 3D scene: the only files that may import three. */
const isSceneFile = (rel: string) => rel.startsWith('src/scene/') || /^src\/games\/[^/]+\/Scene3D\.tsx$/.test(rel)
const isThreePackage = (name: string) => name === 'three' || name.startsWith('three/') || name.startsWith('@react-three/')

const CODE = /\.(tsx?|jsx?|mjs|mts)$/
const DATA = /\.(css|scss|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|json|md|txt|wasm|glsl|ya?ml)$/i

interface ImportRef {
  spec: string
  line: number
  col: number
  /** `import type` and `export type`: TypeScript erases them, so they are no edge of the static graph. */
  typeOnly: boolean
  /** `import('x')` loads another chunk. */
  dynamic: boolean
}

interface Parsed {
  imports: ImportRef[]
  /** `import.meta.glob(…, { eager: true })`: every match becomes a static import. */
  eagerGlobs: { line: number; col: number }[]
}

/** Every module specifier a file names, as a literal. Specifiers built at run time cannot be checked and are skipped. */
function parse(rel: string, text: string): Parsed {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true)
  const imports: ImportRef[] = []
  const eagerGlobs: Parsed['eagerGlobs'] = []
  const at = (node: ts.Node) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    return { line: line + 1, col: character + 1 }
  }
  const add = (literal: ts.Node, typeOnly: boolean, dynamic: boolean) => {
    if (ts.isStringLiteralLike(literal)) imports.push({ spec: literal.text, ...at(literal), typeOnly, dynamic })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, node.importClause?.isTypeOnly === true, false)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      add(node.moduleSpecifier, node.isTypeOnly, false)
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, node.isTypeOnly, false)
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, true, false)
    } else if (ts.isCallExpression(node)) {
      const [first, second] = node.arguments
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && first) {
        add(first, false, true)
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && first) {
        add(first, false, false)
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'glob' &&
        ts.isMetaProperty(node.expression.expression) &&
        second &&
        ts.isObjectLiteralExpression(second) &&
        second.properties.some(
          (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'eager' && p.initializer.kind !== ts.SyntaxKind.FalseKeyword,
        )
      ) {
        eagerGlobs.push(at(node))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { imports, eagerGlobs }
}

type Resolved =
  | { kind: 'file'; rel: string }
  | { kind: 'data'; rel: string }
  | { kind: 'package'; name: string }
  | { kind: 'missing' }

const isFile = (root: string, rel: string) => {
  const full = path.join(root, rel)
  return existsSync(full) && statSync(full).isFile()
}

/** Resolves a specifier the way Vite and tsconfig.json's `paths` do: `@/` is src/, `@es/<package>` is packages/<package>. */
function resolveSpec(spec: string, from: string, root: string): Resolved {
  const bare = spec.split('?')[0]
  let target: string
  if (bare.startsWith('.')) target = path.posix.join(path.posix.dirname(from), bare)
  else if (bare.startsWith('@/')) target = `src/${bare.slice(2)}`
  else if (bare.startsWith('@es/')) target = `packages/${bare.slice('@es/'.length)}`
  else return { kind: 'package', name: bare }
  target = path.posix.normalize(target)
  if (target === '..' || target.startsWith('../')) return { kind: 'missing' }
  if (spec.includes('?') || DATA.test(target)) return { kind: 'data', rel: target }
  const candidates = [
    ...(CODE.test(target) && !target.endsWith('.d.ts') ? [target] : []),
    // TypeScript's bundler resolution reads `./x.js` as ./x.ts or ./x.tsx.
    ...(/\.(m?js|jsx)$/.test(target) ? [target.replace(/\.(m?js|jsx)$/, '.ts'), target.replace(/\.(m?js|jsx)$/, '.tsx')] : []),
    `${target}.ts`,
    `${target}.tsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
  ]
  const rel = candidates.find((candidate) => isFile(root, candidate))
  return rel ? { kind: 'file', rel } : { kind: 'missing' }
}

/** `packages/sim/core/x.ts` belongs to `packages/sim`, and `src/App.tsx` to `src`. */
function ownerOf(rel: string): string {
  const [top, second] = rel.split('/')
  return top === 'packages' ? `packages/${second}` : top
}

function walk(dir: string, root: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(path.join(root, dir), { withFileTypes: true })
  } catch {
    return // a folder that does not exist yet has nothing to check
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      // src/content/generated is the compiler's build output, and git ignores it.
      if (entry.name !== 'node_modules' && rel !== 'src/content/generated') walk(rel, root, out)
    } else if (entry.isFile() && CODE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(rel)
    }
  }
}

export interface Report {
  /** The files under packages/ and src/ that were checked against the fences. */
  checked: number
  /** The files reachable from the entries along static imports, in the order the walk found them. */
  reachable: string[]
  violations: Violation[]
}

/** Checks a repo laid out like enginespace at `root`. `entries` are the repo-relative files the static walk starts from. */
export function checkBoundaries(root: string, entries: readonly string[] = ['src/main.tsx']): Report {
  const violations: Violation[] = []
  const cache = new Map<string, Parsed>()
  const parsed = (rel: string): Parsed => {
    let result = cache.get(rel)
    if (!result) cache.set(rel, (result = parse(rel, readFileSync(path.join(root, rel), 'utf8'))))
    return result
  }

  // 1. The fences.
  const files: string[] = []
  walk('packages', root, files)
  walk('src', root, files)
  files.sort()
  for (const file of files) {
    const owner = ownerOf(file)
    const rule = RULES[owner]
    const fail = (ref: { line: number; col: number }, message: string) => violations.push({ file, line: ref.line, col: ref.col, message })
    if (owner.startsWith('packages/') && !rule) {
      fail({ line: 1, col: 1 }, `${owner} is not one of the five packages of ARCHITECTURE §2.2: fence it in scripts/verify-boundaries.ts before adding it`)
      continue
    }
    for (const ref of parsed(file).imports) {
      const target = resolveSpec(ref.spec, file, root)
      if (target.kind === 'missing') {
        fail(ref, `cannot resolve '${ref.spec}', so its imports cannot be checked`)
      } else if (target.kind === 'package') {
        if (isThreePackage(target.name) && !isSceneFile(file)) {
          fail(ref, `'${ref.spec}': only src/scene and each game's Scene3D.tsx may import three or @react-three/fiber, and only behind a React.lazy boundary (§2.3)`)
        } else if (rule && !rule.npm) {
          fail(ref, `'${ref.spec}': ${owner} ${rule.why}, and so no npm package (§2.3)`)
        }
      } else if (target.rel.startsWith('content/')) {
        fail(ref, `'${ref.spec}': nothing imports content/, which only the content compiler reads (§2.3)`)
      } else if (target.kind === 'file' && rule) {
        const targetOwner = ownerOf(target.rel)
        if (targetOwner === owner || rule.imports.includes(targetOwner)) continue
        if (rule.typesFrom.includes(targetOwner)) {
          if (!ref.typeOnly) fail(ref, `'${ref.spec}': ${owner} imports only the types in ${targetOwner}, so use \`import type\` (§2.3)`)
        } else if (rule.vendored && SIM_VENDORED.includes(target.rel.replace(/\.tsx?$/, ''))) {
          continue
        } else if (targetOwner === 'src') {
          fail(ref, `'${ref.spec}': no package imports src/** (§2.3)`)
        } else {
          fail(ref, `'${ref.spec}' reaches ${targetOwner}, but ${owner} ${rule.why} (§2.3)`)
        }
      }
    }
  }

  // 2. The static path from the entries to three.
  const parent = new Map<string, string | null>()
  const queue: string[] = []
  for (const entry of entries) {
    if (isFile(root, entry)) {
      parent.set(entry, null)
      queue.push(entry)
    } else {
      violations.push({ file: entry, line: 1, col: 1, message: `the entry ${entry} does not exist, so no static path can be checked` })
    }
  }
  /** The files from an entry down to `file`, then `last`: the path that makes `last` reachable. */
  const chainTo = (file: string, last: string) => {
    const chain = [last]
    for (let at: string | null | undefined = file; at; at = parent.get(at)) chain.unshift(at)
    return chain
  }
  for (let head = 0; head < queue.length; head++) {
    const file = queue[head]
    const { imports, eagerGlobs } = parsed(file)
    for (const glob of eagerGlobs) {
      violations.push({ file, ...glob, message: 'an eager import.meta.glob makes every match a static import and cannot be followed: use a lazy glob' })
    }
    for (const ref of imports) {
      if (ref.dynamic || ref.typeOnly) continue
      const target = resolveSpec(ref.spec, file, root)
      if (target.kind === 'package' && isThreePackage(target.name)) {
        const chain = chainTo(file, ref.spec)
        const message = `'${ref.spec}' is reachable from ${chain[0]} without a dynamic import: ${chain.join(' -> ')}`
        violations.push({ file, line: ref.line, col: ref.col, message })
      } else if (target.kind === 'file' && !parent.has(target.rel)) {
        parent.set(target.rel, file)
        queue.push(target.rel)
      }
    }
  }

  const byPosition = (a: Violation, b: Violation) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col
  return { checked: files.length, reachable: queue, violations: violations.sort(byPosition) }
}

/** Only a direct run checks the tree and exits: tests import the functions above without running it. */
if (import.meta.main ?? path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const values = (flag: string) => args.flatMap((arg, i) => (arg === flag && args[i + 1] !== undefined ? [args[i + 1]] : []))
  const root = values('--root')[0] ? path.resolve(values('--root')[0]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const entries = values('--entry').length > 0 ? values('--entry') : ['src/main.tsx']
  const { checked, reachable, violations } = checkBoundaries(root, entries)
  for (const v of violations) console.error(`${v.file}:${v.line}:${v.col} ${v.message}`)
  if (violations.length > 0) {
    console.error(`verify-boundaries: ${violations.length} violation(s) in ${checked} file(s) checked (ARCHITECTURE §2.3)`)
    process.exit(1)
  }
  console.log(`verify-boundaries: ${checked} file(s) checked against §2.3, ${reachable.length} reachable from ${entries.join(', ')} without a dynamic import, 0 violations`)
}
