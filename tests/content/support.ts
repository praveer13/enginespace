/**
 * Helpers for the content tests: a throw-away project made from the repo's own sample content, with edits applied, that the
 * compiler can run on; and readers for what it reports and writes. The sample is one module (`SAMPLE_MODULE`) with the claims, the
 * cards, the KCs and the course the repo has; the modules that are real content are left out of the copy, so that writing one does
 * not change what a test of the compiler counts. The tests that run the gates on the repo itself count it with `REPO_COUNTS`.
 *
 * Every test that changes content changes a copy. Nothing here writes into the repository.
 */
import { afterAll } from 'bun:test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

/** The module the compiler tests copy and break: `LESSON` and `MODULE` are its files. Every other module of `content/modules/` is real content. */
export const SAMPLE_MODULE = 'tr2'

/** The keys of the repo's `course.lock.json` (W1-T01): what a claim's `pin` and a module's `pins` may name. */
export const LOCK_KEYS: ReadonlySet<string> = new Set(
  (JSON.parse(readFileSync(path.join(repo, 'course.lock.json'), 'utf8')) as { entries: { key: string }[] }).entries.map((entry) => entry.key),
)

/** The claims in the repo's `content/claims/`: the sample's, and the ones each game cites (Service's, W0-T16). A claim is a `- id:` at the start of a line. */
function claimsInRepo(dir = path.join(repo, 'content/claims')): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return sum + claimsInRepo(file)
    return sum + (/\.ya?ml$/.test(entry.name) ? (readFileSync(file, 'utf8').match(/^- id: /gm)?.length ?? 0) : 0)
  }, 0)
}
export const CLAIM_COUNT = claimsInRepo()

/** The ids of the cards in the repo's `content/cards/`, sorted: a card is a `.md` file there, and its name is its id. */
export const CARD_IDS: readonly string[] = readdirSync(path.join(repo, 'content/cards'))
  .filter((name) => name.endsWith('.md') && !/^readme\.md$/i.test(name))
  .map((name) => name.slice(0, -3))
  .sort()
export const CARD_COUNT = CARD_IDS.length

/** The modules of the repo's content, a folder of `content/modules/` with a `module.md`, and the lessons in them, the `.md` files of a `lessons/` folder. */
function contentCounts(): { modules: number; lessons: number } {
  const dir = path.join(repo, 'content/modules')
  let modules = 0
  let lessons = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(path.join(dir, entry.name, 'module.md'))) continue
    modules += 1
    const lessonDir = path.join(dir, entry.name, 'lessons')
    if (existsSync(lessonDir)) lessons += readdirSync(lessonDir).filter((name) => name.endsWith('.md') && !/^readme\.md$/i.test(name)).length
  }
  return { modules, lessons }
}
export const REPO_MODULES = contentCounts().modules
export const REPO_LESSONS = contentCounts().lessons

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`
/** What the gates and the compiler print for the repo itself, as `2 modules, 5 lessons`. */
export const REPO_COUNTS = `${plural(REPO_MODULES, 'module', 'modules')}, ${plural(REPO_LESSONS, 'lesson', 'lessons')}`
/** The files the compiler writes for the repo: the index, the map, the claims and llms.txt, two for each module and each lesson (the export and the JSON), and one JSON for each card. */
export const REPO_OUTPUT_COUNT = 4 + 2 * REPO_MODULES + 2 * REPO_LESSONS + CARD_COUNT

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
 * A copy of the repo's `content/` and `public/figures/`, with each edit applied, and with no module but the sample's. A path that
 * does not exist yet is created. An edit that changes nothing throws, so a test that means to break a file cannot pass for want of
 * the break.
 */
export function project(edits: Record<string, Edit> = {}): string {
  const root = tempDir()
  cpSync(path.join(repo, 'content'), path.join(root, 'content'), { recursive: true })
  const modules = path.join(root, 'content/modules')
  for (const name of readdirSync(modules)) if (name !== SAMPLE_MODULE) rmSync(path.join(modules, name), { recursive: true, force: true })
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

/** A card that compiles, for a test that needs one more than the repo has. Its one rule cites a claim of the sample. */
export function sampleCard(id = 'fixture-world'): string {
  return `---
id: ${id}
kind: notional-machine
title: A fixture world
world: fixture
status: draft
---

A world for a test.

## Models

- The CPU's work for one step takes {{claim:sample.world.host-step-us}} in the sample world.

## Ignores

- Everything else.

## Calibrated against

- Nothing yet.
`
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
