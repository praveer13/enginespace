/**
 * verify-determinism: the determinism lint of ARCHITECTURE §5.1 (D-017), as a gate.
 *
 * packages/sim and packages/play must give the same bytes for the same seed in Bun, Chromium, Firefox and WebKit. This
 * walks the TypeScript AST of every file in those two packages, so comments and strings never trip it, and fails on:
 *   - the 22 Math functions whose results ECMA-262 leaves implementation-approximated, so that their last bit can differ between
 *     engines (exp, log, pow, the trigonometric and hyperbolic functions and their inverses, cbrt, hypot, expm1, log1p, log2 and
 *     log10: BANNED_MATH has them all), and Math.random, which is unseeded;
 *   - the clock and entropy globals Date, performance and crypto, the DOM globals window and document, and globalThis,
 *     which reaches all of them;
 *   - `**` and `**=`, which are Math.pow;
 *   - Array.prototype.sort without a comparator;
 *   - aliasing that would hide any of these: a bare `Math` value, `const { random } = Math`, `Math[name]` and
 *     `(Math as any).random`.
 *
 * eslint.config.js bans the same things for the editor, and tests/lint holds the two to one table of cases. This gate
 * adds the alias checks that a lint rule on single nodes cannot make, and no `eslint-disable` comment can silence it.
 * A type position is never a use: `let d: Date` reads no clock. Iterating a Map or a Set where the order reaches output
 * (§5.1) cannot be seen from syntax alone, so a review and the golden vectors hold that one.
 *
 *   bun scripts/verify-determinism.ts [--root <dir>]
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export interface Finding {
  line: number
  col: number
  message: string
}

/**
 * The Math members that A§5.1 bans: the engine-dependent ones, and the unseeded one. The list is the note that opens "Function
 * Properties of the Math Object" in ECMA-262 (the es2026 tag, read 2026-11-04), in its order: the functions that the standard does
 * not precisely specify, whose results each engine takes from its own maths library. `random` is in it, and is unseeded besides.
 * Everything else the object has is exact (abs, ceil, clz32, floor, fround, imul, max, min, round, sign, sqrt, trunc, and ES2025's
 * f16round and ES2026's sumPrecise), and stays allowed. tests/lint/determinism.test.ts holds this list to the note.
 */
export const BANNED_MATH = [
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
] as const
const BANNED_MATH_SET: ReadonlySet<string> = new Set(BANNED_MATH)

const CLOCK = 'reads the clock: time is integer µs and arrives as a parameter'
/** The globals A§5.1 bans, with why. `globalThis` is here because `globalThis.Date` reaches every other entry. */
export const BANNED_GLOBALS: Readonly<Record<string, string>> = {
  Date: `Date ${CLOCK}`,
  performance: `performance ${CLOCK}`,
  crypto: 'crypto is entropy: draw from the seeded rng',
  window: 'pure code has no DOM',
  document: 'pure code has no DOM',
  globalThis: 'globalThis reaches every banned global: name what you need',
}
/**
 * A file that declares one of these names itself, such as the `window` of a sliding-window cache, is judged by its own
 * binding. The DOM globals are also a type error under tsconfig.pure.json, so a real use cannot hide behind a local.
 */
const SHADOWABLE: ReadonlySet<string> = new Set(['performance', 'crypto', 'window', 'document'])

const mathMessage = (member: string) =>
  member === 'random'
    ? 'Math.random is unseeded: draw from the seeded rng'
    : `Math.${member} can round differently between engines: use +, -, *, / and max, or a generated integer table`

const POW = '`**` is Math.pow in disguise: multiply, or use a generated integer table'
const SORT = 'Array.prototype.sort without a comparator orders by UTF-16 string: pass a comparator'
const ALIAS = 'a bare Math value can hide a banned member behind an alias: call Math members directly'
const COMPUTED = 'computed access on Math can reach a banned member: name the member'

/** Strips parentheses and casts: `(Math as any).random` is still Math. */
function unwrap(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    expression = expression.expression
  }
  return expression
}

const isTransparent = (node: ts.Node): node is ts.Expression =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isNonNullExpression(node) ||
  ts.isTypeAssertionExpression(node) ||
  ts.isSatisfiesExpression(node)

type Role = 'use' | 'declaration' | 'name'

/**
 * What an identifier is doing where it stands: a use of whatever it names, the declaration of a local binding, or only
 * a name (a property key, a type, a label) that never reads a value.
 */
function roleOf(id: ts.Identifier): Role {
  const p = id.parent
  if (ts.isPropertyAccessExpression(p)) return p.name === id ? 'name' : 'use'
  if (ts.isQualifiedName(p) || ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p)) return 'name'
  if (ts.isExpressionWithTypeArguments(p)) {
    // `class A extends Date` uses the value. `implements Date` and an interface's `extends Date` name a type.
    const clause = p.parent
    return ts.isHeritageClause(clause) && clause.token === ts.SyntaxKind.ExtendsKeyword && ts.isClassLike(clause.parent) ? 'use' : 'name'
  }
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isImportEqualsDeclaration(p)) return 'declaration'
  if (ts.isExportSpecifier(p) || ts.isNamespaceExport(p)) return 'name'
  if (ts.isBindingElement(p)) return p.propertyName === id ? 'name' : p.name === id ? 'declaration' : 'use'
  if (ts.isVariableDeclaration(p) || ts.isParameter(p)) return p.name === id ? 'declaration' : 'use'
  if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p)) {
    return p.name === id ? 'declaration' : 'use'
  }
  if (ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isEnumDeclaration(p) || ts.isModuleDeclaration(p)) return 'name'
  if (ts.isTypeParameterDeclaration(p)) return 'name'
  // `{ Date }` names a property and reads a variable at once, so it is a use.
  if (ts.isShorthandPropertyAssignment(p)) return 'use'
  if (
    ts.isPropertyAssignment(p) ||
    ts.isPropertyDeclaration(p) ||
    ts.isPropertySignature(p) ||
    ts.isMethodDeclaration(p) ||
    ts.isMethodSignature(p) ||
    ts.isGetAccessorDeclaration(p) ||
    ts.isSetAccessorDeclaration(p) ||
    ts.isEnumMember(p)
  ) {
    return p.name === id ? 'name' : 'use'
  }
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isJsxAttribute(p)) return 'name'
  return 'use'
}

/** The text of a property key written as an identifier or a string literal, and undefined for anything computed. */
function staticKey(name: ts.PropertyName | ts.BindingName | ts.Expression | undefined): string | undefined {
  if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name))) return name.text
  return undefined
}

/** Lints one file's text. `fileName` only picks the script kind (.ts, .tsx, .js). */
export function lintSource(fileName: string, text: string): Finding[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)
  const found: Finding[] = []
  const report = (node: ts.Node, message: string) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
    found.push({ line: line + 1, col: character + 1, message })
  }
  const isMathUse = (expression: ts.Expression) => {
    const target = unwrap(expression)
    return ts.isIdentifier(target) && target.text === 'Math' && roleOf(target) === 'use'
  }
  const checkMember = (node: ts.Node, member: string) => {
    if (BANNED_MATH_SET.has(member)) report(node, mathMessage(member))
  }

  // Pass one: the names this file declares itself.
  const declared = new Set<string>()
  const collect = (node: ts.Node) => {
    if (ts.isIdentifier(node) && roleOf(node) === 'declaration') declared.add(node.text)
    ts.forEachChild(node, collect)
  }
  collect(sf)

  // Pass two: the bans.
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      if (isMathUse(node.expression)) checkMember(node, node.name.text)
    } else if (ts.isElementAccessExpression(node)) {
      if (isMathUse(node.expression)) {
        const key = node.argumentExpression
        if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) checkMember(node, key.text)
        else report(node, COMPUTED)
      }
    } else if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && isMathUse(node.initializer)) {
      // const { pow } = Math
      for (const element of node.name.elements) {
        const key = element.dotDotDotToken ? undefined : staticKey(element.propertyName ?? element.name)
        if (key === undefined) report(element, 'destructuring Math with a rest or computed key can reach a banned member')
        else checkMember(element, key)
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isObjectLiteralExpression(node.left) &&
      isMathUse(node.right)
    ) {
      // ({ pow } = Math)
      for (const property of node.left.properties) {
        const key = ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property) ? staticKey(property.name) : undefined
        if (key === undefined) report(property, 'destructuring Math with a rest or computed key can reach a banned member')
        else checkMember(property, key)
      }
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken) {
      report(node.operatorToken, POW)
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken) {
      report(node.operatorToken, POW)
    } else if (ts.isCallExpression(node)) {
      // x.sort(), x?.sort(), x['sort']() and x.sort(undefined) all fall back to the default string order.
      const callee = unwrap(node.expression)
      const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isElementAccessExpression(callee) ? staticKey(callee.argumentExpression) : undefined
      const [first] = node.arguments
      const noComparator = !first || (ts.isIdentifier(first) && first.text === 'undefined') || ts.isVoidExpression(first)
      if (method === 'sort' && noComparator && node.arguments.length <= 1) report(node, SORT)
    } else if (ts.isIdentifier(node)) {
      const role = roleOf(node)
      if (role === 'use' && Object.hasOwn(BANNED_GLOBALS, node.text) && !(SHADOWABLE.has(node.text) && declared.has(node.text))) {
        report(node, BANNED_GLOBALS[node.text])
      } else if (role === 'use' && node.text === 'Math') {
        let child: ts.Node = node
        let parent = node.parent
        while (isTransparent(parent)) {
          child = parent
          parent = parent.parent
        }
        // Member access and destructuring are judged on their own nodes above.
        const judgedAbove =
          ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === child) ||
          (ts.isVariableDeclaration(parent) && parent.initializer === child && ts.isObjectBindingPattern(parent.name)) ||
          (ts.isBinaryExpression(parent) &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            parent.right === child &&
            ts.isObjectLiteralExpression(parent.left))
        if (!judgedAbove) report(node, ALIAS)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  const seen = new Set<string>()
  return found
    .filter((f) => !seen.has(`${f.line}:${f.col}:${f.message}`) && seen.add(`${f.line}:${f.col}:${f.message}`))
    .sort((a, b) => a.line - b.line || a.col - b.col)
}

/** Whether a repo-relative posix path is in scope: the code of packages/sim and packages/play. */
export function inScope(rel: string): boolean {
  return /^packages\/(sim|play)\/.+\.(ts|tsx|js|mjs)$/.test(rel) && !rel.endsWith('.d.ts')
}

function walk(dir: string, base: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(path.join(base, dir), { withFileTypes: true })
  } catch {
    return // a package that does not exist yet has nothing to lint
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(rel, base, out)
    } else if (entry.isFile()) {
      out.push(rel)
    }
  }
}

/** Lints every file in scope under `root`, and returns the findings with their repo-relative file. */
export function lintTree(root: string): { files: string[]; findings: (Finding & { file: string })[] } {
  const all: string[] = []
  for (const name of ['sim', 'play']) walk(`packages/${name}`, root, all)
  const files = all.filter(inScope).sort()
  const findings = files.flatMap((file) => lintSource(file, readFileSync(path.join(root, file), 'utf8')).map((f) => ({ file, ...f })))
  return { files, findings }
}

/** Only a direct run lints the tree and exits: tests import the functions above without running it. */
if (import.meta.main ?? path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--root')
  const root = at >= 0 ? path.resolve(process.argv[at + 1] ?? '') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const { files, findings } = lintTree(root)
  for (const f of findings) console.error(`${f.file}:${f.line}:${f.col} ${f.message}`)
  if (findings.length > 0) {
    console.error(`verify-determinism: ${findings.length} finding(s) in ${files.length} file(s) (ARCHITECTURE §5.1, D-017)`)
    process.exit(1)
  }
  console.log(`verify-determinism: ${files.length} file(s) in scope, 0 findings`)
}
