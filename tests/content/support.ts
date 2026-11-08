/**
 * Helpers for the content tests: a throw-away project made from the sample course, with edits applied, that the compiler can run on;
 * and readers for what it reports and writes. The sample course is one module (`SAMPLE_MODULE`), a lesson that uses every block, and
 * its claims, kept in `tests/fixtures/sample-course/` (`SAMPLE_ROOT`) since W1-T15 replaced them in `content/` with TR2's real content.
 * A project holds that module in place of every module of `content/modules/`, with the claims, the cards, the KCs and the course the
 * repo has, so that writing a real module does not change what a test of the compiler counts. The tests that run the gates on the repo
 * itself count it with `REPO_COUNTS`.
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
/** The root of the sample course: a `content/` and a `public/` that hold what the compiler tests copy, in the repo's own layout. */
export const SAMPLE_ROOT = path.join(repo, 'tests/fixtures/sample-course')
export const LESSON = 'content/modules/tr2/lessons/l0-sample.md'
export const MODULE = 'content/modules/tr2/module.md'
export const CLAIMS = 'content/claims/sample.yaml'
export const COURSE = 'content/course.yaml'
export const KCS = 'content/kc/graph.yaml'

/**
 * The module the compiler tests copy and break: `LESSON` and `MODULE` are its files, in the sample course. It has the id of TR2 because
 * `content/course.yaml` has a place for no other, so a project holds the sample's `tr2` in place of the real one.
 */
export const SAMPLE_MODULE = 'tr2'

/** The keys of the repo's `course.lock.json` (W1-T01): what a claim's `pin` and a module's `pins` may name. */
export const LOCK_KEYS: ReadonlySet<string> = new Set(
  (JSON.parse(readFileSync(path.join(repo, 'course.lock.json'), 'utf8')) as { entries: { key: string }[] }).entries.map((entry) => entry.key),
)

/** The claims under `dir`, in the `.yaml` files of it and of the folders below. A claim is a `- id:` at the start of a line. */
function claimsIn(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return sum + claimsIn(file)
    return sum + (/\.ya?ml$/.test(entry.name) ? (readFileSync(file, 'utf8').match(/^- id: /gm)?.length ?? 0) : 0)
  }, 0)
}
/** The claims in the repo's `content/claims/`: the engines', the games' and each module's. */
export const REPO_CLAIM_COUNT = claimsIn(path.join(repo, 'content/claims'))
/** What a project holds: the repo's claims, and the four of the sample course. */
export const CLAIM_COUNT = REPO_CLAIM_COUNT + claimsIn(path.join(SAMPLE_ROOT, 'content/claims'))

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
 * A copy of the repo's `content/` and `public/figures/`, with the sample course in place of the repo's modules, and each edit applied. A
 * path that does not exist yet is created. An edit that changes nothing throws, so a test that means to break a file cannot pass for want
 * of the break.
 */
export function project(edits: Record<string, Edit> = {}): string {
  const root = tempDir()
  cpSync(path.join(repo, 'content'), path.join(root, 'content'), { recursive: true })
  const modules = path.join(root, 'content/modules')
  for (const name of readdirSync(modules)) rmSync(path.join(modules, name), { recursive: true, force: true })
  cpSync(path.join(repo, 'public/figures'), path.join(root, 'public/figures'), { recursive: true })
  // The sample course: its module and lesson, its claims and its figure. It brings no card and no KC, and shares the repo's course.
  cpSync(path.join(SAMPLE_ROOT, 'content'), path.join(root, 'content'), { recursive: true })
  cpSync(path.join(SAMPLE_ROOT, 'public'), path.join(root, 'public'), { recursive: true })
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

/** A file of the sample course, by its path in a project: `readSample(LESSON)` is the text that `project()` copies. */
export const readSample = (relative: string): string => read(relative, SAMPLE_ROOT)

/** The 1-based line of the first line of `text` that contains `needle`. */
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
