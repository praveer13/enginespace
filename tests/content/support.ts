/**
 * Helpers for the content tests: a throw-away project made from the repo's own sample content, with edits applied, that the
 * compiler can run on; and readers for what it reports and writes.
 *
 * Every test that changes content changes a copy. Nothing here writes into the repository.
 */
import { afterAll } from 'bun:test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { compileContent } from '../../scripts/content/build.ts'
import type { CompileResult } from '../../scripts/content/build.ts'
import { formatDiagnostic } from '../../scripts/content/parse.ts'
import type { Diagnostic, Gate } from '../../scripts/content/parse.ts'

export const repo = path.resolve(import.meta.dirname, '../..')
export const LESSON = 'content/modules/tr2/lessons/l0-sample.md'
export const MODULE = 'content/modules/tr2/module.md'
export const CLAIMS = 'content/claims/sample.yaml'
export const COURSE = 'content/course.yaml'
export const KCS = 'content/kc/graph.yaml'

const scratch: string[] = []
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

/** A new directory outside the repo, removed when the test file ends. */
export function tempDir(label = 'project'): string {
  const dir = mkdtempSync(path.join(tmpdir(), `enginespace-${label}-`))
  scratch.push(dir)
  return dir
}

/** What to do to one file of the copy: new text, a function of the old text, or null to delete it. */
export type Edit = string | ((text: string) => string) | null

/**
 * A copy of the repo's `content/` and `public/figures/`, with each edit applied. A path that does not exist yet is created.
 * An edit that changes nothing throws, so a test that means to break a file cannot pass for want of the break.
 */
export function project(edits: Record<string, Edit> = {}): string {
  const root = tempDir()
  cpSync(path.join(repo, 'content'), path.join(root, 'content'), { recursive: true })
  cpSync(path.join(repo, 'public/figures'), path.join(root, 'public/figures'), { recursive: true })
  for (const [file, edit] of Object.entries(edits)) {
    const abs = path.join(root, file)
    if (edit === null) {
      rmSync(abs)
      continue
    }
    const before = existsSync(abs) ? readFileSync(abs, 'utf8') : ''
    const after = typeof edit === 'string' ? edit : edit(before)
    if (after === before) throw new Error(`the edit to ${file} changed nothing`)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, after)
  }
  return root
}

/** `text.replace(from, to)`, and an error when `from` is not in the text. */
export const swap =
  (from: string, to: string) =>
  (text: string): string => {
    if (!text.includes(from)) throw new Error(`the text has no "${from}"`)
    return text.replace(from, to)
  }

export const compile = (edits: Record<string, Edit> = {}): CompileResult => compileContent({ root: project(edits) })

export const read = (relative: string, root = repo): string => readFileSync(path.join(root, relative), 'utf8')

/** The 1-based line of the first line of `file` (in the repo's sample) that contains `needle`. */
export function lineOf(text: string, needle: string): number {
  const index = text.split('\n').findIndex((line) => line.includes(needle))
  if (index < 0) throw new Error(`no line has "${needle}"`)
  return index + 1
}

export const errors = (result: CompileResult, gate?: Gate): Diagnostic[] =>
  result.diagnostics.filter((d) => d.severity === 'error' && (gate === undefined || d.gate === gate))

/** The errors as `file:line code`, for a test to compare. */
export const where = (result: CompileResult, gate?: Gate): string[] => errors(result, gate).map((d) => `${d.file}:${d.line} ${d.code}`)

export const report = (result: CompileResult): string => result.diagnostics.map(formatDiagnostic).join('\n')

export function output(result: CompileResult, file: string): string {
  const found = result.outputs.find((o) => o.path === file)
  if (found === undefined) throw new Error(`the compiler wrote no ${file}: it wrote ${result.outputs.map((o) => o.path).join(', ') || 'nothing'}`)
  return found.text
}
