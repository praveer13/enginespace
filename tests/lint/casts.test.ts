/*
 * W1b-T14, accept 2: where the compiler is told to look away, the line says why (W1-report 9.1, A21 and A22: seven casts through
 * `unknown` gave no reason, and one of them passed `null` where a geometry is typed).
 *
 *   - In src/, packages/ and scripts/, the code that ships and the code that gates it, a cast through `unknown` (`x as unknown as T`)
 *     has a comment on a line of the cast. A cast that a real type can replace is replaced instead.
 *   - Anywhere in the repository's TypeScript, `@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` say why after the directive, and an
 *     `eslint-disable` comment says why after ` -- `. An explicit `any` cannot be written without the second, since no-explicit-any is
 *     an error (eslint.config.js), so this holds `any` to a reason too.
 *
 * tests/ and e2e/ are not held to the first rule: they cast through `unknown` to make a partial fake or to reach a page's global, and the
 * compiler has read them only since W1b-T14. The directives' rule holds there as it does everywhere.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '../..')

/**
 * The comments of a file, each with the line it starts on (from 1) and its text. They are read at every token, since a comment that
 * follows a punctuation mark (`as unknown as { // why`) belongs to no node.
 */
function commentsOf(source: ts.SourceFile): { line: number; text: string }[] {
  const found = new Map<number, { line: number; text: string }>()
  const take = (ranges: readonly ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      found.set(range.pos, { line: source.getLineAndCharacterOfPosition(range.pos).line + 1, text: source.text.slice(range.pos, range.end) })
    }
  }
  const visit = (node: ts.Node) => {
    take(ts.getLeadingCommentRanges(source.text, node.getFullStart()))
    take(ts.getTrailingCommentRanges(source.text, node.getEnd()))
    for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)
  return [...found.values()]
}

/** `x as unknown as T`: the lines it spans, from the second `as` to the end of the type. */
function castsThroughUnknown(source: ts.SourceFile): { first: number; last: number }[] {
  const found: { first: number; last: number }[] = []
  const visit = (node: ts.Node) => {
    if (ts.isAsExpression(node) && ts.isAsExpression(node.expression) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword) {
      found.push({
        first: source.getLineAndCharacterOfPosition(node.expression.end).line + 1,
        last: source.getLineAndCharacterOfPosition(node.end).line + 1,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

/** The directives that ask for a reason. ESLint and TypeScript read a directive only at the start of a comment, and so does this. */
const DIRECTIVE = /^(?:\/\/|\/\*+)\s*(@ts-(?:ignore|expect-error|nocheck)|eslint-disable(?:-next-line|-line)?)\b(.*)/s

/** What a file says without a reason, as `line what` for each. `casts` asks for the first rule too. */
function unexplained(file: string, text: string, casts: boolean): string[] {
  if (!/as unknown as|@ts-|eslint-disable/.test(text)) return []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const comments = commentsOf(source)
  const out: string[] = []
  if (casts) {
    for (const { first, last } of castsThroughUnknown(source)) {
      if (!comments.some((comment) => comment.line >= first && comment.line <= last && /\w{3}/.test(comment.text))) out.push(`${first} a cast through unknown`)
    }
  }
  for (const { line, text: comment } of comments) {
    const directive = DIRECTIVE.exec(comment)
    if (directive === null) continue
    // TypeScript's directives say why in the words after them, and ESLint's after ` -- `.
    const why = directive[1].startsWith('@ts') ? /\w+\s+\w+/ : /\s--\s+\S+\s+\S+/
    if (!why.test(directive[2])) out.push(`${line} ${directive[1].startsWith('@ts') ? 'a @ts directive' : 'an eslint-disable'}`)
  }
  return out.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
}

/** Every .ts and .tsx file under `dir`, as paths from the root with slashes. Fixtures and generated files are other programs' input. */
const filesUnder = (dir: string): string[] =>
  (readdirSync(path.join(root, dir), { recursive: true }) as string[])
    .map((entry) => `${dir}/${entry.split(path.sep).join('/')}`)
    .filter((file) => /\.tsx?$/.test(file) && !file.startsWith('tests/fixtures/') && !file.startsWith('src/content/generated/'))

const report = (dirs: string[], casts: boolean) =>
  dirs.flatMap((dir) => filesUnder(dir).flatMap((file) => unexplained(file, readFileSync(path.join(root, file), 'utf8'), casts).map((what) => `${file}:${what}`)))

describe('a line that tells the compiler to look away says why', () => {
  test('src, packages and scripts have no cast through unknown without a comment on its lines', () => {
    expect(report(['src', 'packages', 'scripts'], true)).toEqual([])
  })

  test('nothing in the repository has a @ts directive or an eslint-disable without a reason', () => {
    expect(report(['src', 'packages', 'scripts', 'tests', 'e2e'], false)).toEqual([])
  })
})

describe('the check can fail', () => {
  test('a cast through unknown with no comment on its lines is found, and a comment on any of them is a reason', () => {
    expect(unexplained('x.ts', 'export const a = b as unknown as C\n', true)).toEqual(['1 a cast through unknown'])
    expect(unexplained('x.ts', 'export const a = b as unknown as C // a partial fake of C\n', true)).toEqual([])
    expect(unexplained('x.ts', 'export const a = b as unknown as {\n  c: D // the one member that is read\n}\n', true)).toEqual([])
    expect(unexplained('x.ts', 'export const a = f(b as unknown as C) // a partial fake of C\n', true)).toEqual([])
    // Above the cast is not on its line.
    expect(unexplained('x.ts', '// a partial fake of C\nexport const a = b as unknown as C\n', true)).toEqual(['2 a cast through unknown'])
    // Only a cast through unknown is asked for a reason, and a cast that is not asked about is not: tests and e2e.
    expect(unexplained('x.ts', 'export const a = b as C\n', true)).toEqual([])
    expect(unexplained('x.ts', 'export const a = b as unknown as C\n', false)).toEqual([])
  })

  test('a @ts directive with nothing after it is found, and so is an eslint-disable with no reason', () => {
    expect(unexplained('x.ts', '// @ts-ignore\nexport const a: number = ""\n', false)).toEqual(['1 a @ts directive'])
    expect(unexplained('x.ts', '// @ts-expect-error: the test hands the wrong type on purpose\nexport const a: number = ""\n', false)).toEqual([])
    expect(unexplained('x.ts', '/* @ts-nocheck */\n', false)).toEqual(['1 a @ts directive'])
    expect(unexplained('x.ts', '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const a: any = 1\n', false)).toEqual(['1 an eslint-disable'])
    expect(unexplained('x.ts', '// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the parsed JSON has any shape\nexport const a: any = 1\n', false)).toEqual([])
    expect(unexplained('x.ts', '/* eslint-disable */\n', false)).toEqual(['1 an eslint-disable'])
  })

  test('the words are code, not comments, when they are in a string', () => {
    expect(unexplained('x.ts', "export const code = '// eslint-disable-next-line no-undef\\n// @ts-ignore'\n", false)).toEqual([])
    expect(unexplained('x.ts', 'export const code = `b as unknown as C`\n', true)).toEqual([])
  })
})
