/*
 * verify:pins (ARCHITECTURE §4.4, §10.2; W1-T01). course.lock.json, the lockfile that pins the engines, the reading targets and the
 * profilers (D-011, D-035), must be well formed. Each problem is printed with its file and its line.
 *
 *   bun scripts/verify-pins.ts [--root <dir>] [--today YYYY-MM-DD]
 *
 * It fails when
 *   - the file is missing or is not JSON;
 *   - an entry breaks its schema (packages/schema/lock.ts): an unknown key, a commit that is not 40 lowercase hex digits, a URL that is not
 *     https, a check date that does not exist, a key that is pinned twice;
 *   - an entry lacks what its kind is pinned by: a pypi entry its version, a git entry its commit, a model its commit (a Hugging Face
 *     revision), a dataset its sha256 and a tool its version. The schema asks for a version or a commit and leaves the choice open, and
 *     this is where an entry that pins nothing a reader can check is caught;
 *   - a check date lies in the future (a day's slack covers time zones).
 * It never fails on age. An entry past its TTL is listed as a warning with the day it went stale, and the weekly watcher lists it too
 * (ARCHITECTURE §4.4). That a claim's `pin` and a module's `pins` name a key of this file is for verify:claims and verify:content.
 *
 * Exit status: 0 when no error, 1 when one is found, 2 for a usage error.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { lockFileSchema } from '../packages/schema/lock.ts'
import type { LockEntry } from '../packages/schema/lock.ts'

export const LOCK_FILE = 'course.lock.json'

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..')

export interface Finding {
  severity: 'error' | 'warning'
  /** A short name for the kind of problem, such as `bad-json` or `stale-pin`. */
  code: string
  /** The line of the file, counted from 1. */
  line: number
  message: string
}

const finding = (severity: Finding['severity'], code: string, line: number, message: string): Finding => ({ severity, code, line, message })

/** `course.lock.json:12: error schema: …`, the shape that every other gate prints. */
export const formatFinding = (found: Finding): string => `${LOCK_FILE}:${found.line}: ${found.severity} ${found.code}: ${found.message}`

/* ------------------------------------------------------------------------------------------------------------------ */
/* Reading the file with its lines                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

class JsonError extends Error {
  readonly line: number

  constructor(line: number, message: string) {
    super(message)
    this.line = line
  }
}

/**
 * Parses JSON and records the line where each value begins, by its path with dots (`entries.1.commit`; the file itself is the empty
 * path). A key is placed on its own line. It throws a JsonError that names the line of a syntax error, which JSON.parse does not give.
 */
export function locateJson(text: string): { value: unknown; lines: ReadonlyMap<string, number> } {
  const lines = new Map<string, number>()
  let at = 0
  let line = 1

  const fail = (message: string): never => {
    throw new JsonError(line, message)
  }
  const space = (): void => {
    while (at < text.length) {
      const c = text[at]
      if (c === '\n') line += 1
      else if (c !== ' ' && c !== '\t' && c !== '\r') return
      at += 1
    }
  }
  const string = (): string => {
    const start = at
    at += 1
    while (at < text.length && text[at] !== '"') {
      if (text[at] === '\n') return fail('a string runs past the end of its line')
      at += text[at] === '\\' ? 2 : 1
    }
    if (at >= text.length) return fail('a string is not closed')
    at += 1
    try {
      return JSON.parse(text.slice(start, at)) as string
    } catch {
      return fail('a string has a bad escape')
    }
  }
  const join = (parent: string, key: string): string => (parent === '' ? key : `${parent}.${key}`)

  const value = (here: string): unknown => {
    space()
    lines.set(here, line)
    const c = text[at]
    if (c === '"') return string()
    if (c === '{') {
      at += 1
      const out: Record<string, unknown> = {}
      space()
      if (text[at] === '}') {
        at += 1
        return out
      }
      for (;;) {
        space()
        if (text[at] !== '"') return fail('expected a key in double quotes')
        const keyLine = line
        const key = string()
        space()
        if (text[at] !== ':') return fail('expected ":" after a key')
        at += 1
        const child = join(here, key)
        Object.defineProperty(out, key, { value: value(child), enumerable: true, writable: true, configurable: true })
        lines.set(child, keyLine)
        space()
        if (text[at] === ',') {
          at += 1
          continue
        }
        if (text[at] === '}') {
          at += 1
          return out
        }
        return fail('expected "," or "}"')
      }
    }
    if (c === '[') {
      at += 1
      const out: unknown[] = []
      space()
      if (text[at] === ']') {
        at += 1
        return out
      }
      for (;;) {
        out.push(value(join(here, String(out.length))))
        space()
        if (text[at] === ',') {
          at += 1
          continue
        }
        if (text[at] === ']') {
          at += 1
          return out
        }
        return fail('expected "," or "]"')
      }
    }
    const literal = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at, at + 40))
    if (literal === null) return fail(c === undefined ? 'the file ends where a value was expected' : `cannot read a value at "${c}"`)
    at += literal[0].length
    return JSON.parse(literal[0]) as unknown
  }

  const result = value('')
  space()
  if (at < text.length) fail('there is text after the end of the value')
  return { value: result, lines }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The checks                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const DAY = 86_400_000
const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY
const dateOf = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10)
/** Whether `text` is a day that exists, as `YYYY-MM-DD`. A parser may roll 2026-02-31 over to March, so the day is written back. */
const isDay = (text: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const day = dayNumber(text)
  return Number.isFinite(day) && dateOf(day) === text
}

/** What each kind of entry is pinned by, beyond the schema's "a version or a commit". */
const PINNED_BY: Partial<Record<LockEntry['kind'], 'version' | 'commit' | 'sha256'>> = {
  pypi: 'version',
  git: 'commit',
  model: 'commit',
  dataset: 'sha256',
  tool: 'version',
}

interface SchemaIssue {
  code: string
  path: readonly PropertyKey[]
  message: string
  keys?: readonly string[]
}

export interface Report {
  /** The problems, sorted by line. */
  findings: Finding[]
  /** How many entries the file holds, or 0 when it could not be read as a lockfile. */
  entries: number
}

/**
 * The problems of the text of a lockfile. `today` is `YYYY-MM-DD`: a check date after it is an error and an entry past its TTL is a
 * warning.
 */
export function checkLock(text: string, today: string): Report {
  let located: ReturnType<typeof locateJson>
  try {
    located = locateJson(text)
  } catch (caught) {
    if (!(caught instanceof JsonError)) throw caught
    return { findings: [finding('error', 'bad-json', caught.line, `not valid JSON: ${caught.message}`)], entries: 0 }
  }
  const { value, lines } = located
  /** The line of a path, or of the nearest enclosing path that the file has: a key that is missing is reported on its object. */
  const at = (key: string): number => {
    let here = key
    for (;;) {
      const found = lines.get(here)
      if (found !== undefined) return found
      const cut = here.lastIndexOf('.')
      if (cut < 0) return lines.get('') ?? 1
      here = here.slice(0, cut)
    }
  }

  const parsed = lockFileSchema.safeParse(value)
  if (!parsed.success) {
    const issues = parsed.error.issues as readonly SchemaIssue[]
    const findings = issues
      .flatMap((issue) => {
        const here = issue.path.map(String).join('.')
        const label = here === '' ? 'the file' : here
        if (issue.code === 'unrecognized_keys') {
          return (issue.keys ?? []).map((key) => finding('error', 'unknown-key', at(here === '' ? key : `${here}.${key}`), `${label}: "${key}" is not a key of the lockfile`))
        }
        return [finding('error', 'schema', at(here), `${label}: ${issue.message}`)]
      })
      .sort((a, b) => a.line - b.line)
    return { findings, entries: 0 }
  }

  const out: Finding[] = []
  const latest = dayNumber(today) + 1
  parsed.data.entries.forEach((entry, index) => {
    const here = `entries.${index}`
    const needs = PINNED_BY[entry.kind]
    if (needs !== undefined && entry[needs] === undefined) {
      out.push(finding('error', 'kind-needs', at(here), `${entry.key}: a ${entry.kind} entry is pinned by its ${needs}, and this one has none`))
    }
    if (dayNumber(entry.checkedAt) > latest) {
      out.push(finding('error', 'future-date', at(`${here}.checkedAt`), `${entry.key}: checkedAt is ${entry.checkedAt}, which is after today (${today})`))
    }
    const stale = dayNumber(entry.checkedAt) + entry.ttlDays
    if (stale < dayNumber(today)) {
      out.push(finding('warning', 'stale-pin', at(`${here}.checkedAt`), `${entry.key}: stale since ${dateOf(stale)} (checked ${entry.checkedAt}, good for ${entry.ttlDays} days)`))
    }
  })
  return { findings: out.sort((a, b) => a.line - b.line), entries: parsed.data.entries.length }
}

/** The problems alone, for a caller that needs no count. */
export const lockProblems = (text: string, today: string): Finding[] => checkLock(text, today).findings

/* ------------------------------------------------------------------------------------------------------------------ */
/* The command line                                                                                                   */
/* ------------------------------------------------------------------------------------------------------------------ */

const USAGE = 'usage: bun scripts/verify-pins.ts [--root <dir>] [--today YYYY-MM-DD]'
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

export function main(argv: readonly string[], now: Date = new Date()): number {
  let root = DEFAULT_ROOT
  let today = now.toISOString().slice(0, 10)
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1]
    if (argv[i] === '--root' && next !== undefined) {
      root = path.resolve(next)
      i += 1
    } else if (argv[i] === '--today' && next !== undefined && isDay(next)) {
      today = next
      i += 1
    } else {
      console.error(USAGE)
      return 2
    }
  }

  const file = path.join(root, LOCK_FILE)
  const { findings: found, entries } = existsSync(file)
    ? checkLock(readFileSync(file, 'utf8'), today)
    : {
        findings: [finding('error', 'missing-file', 1, `${LOCK_FILE} pins the engines, the reading targets and the profilers (ARCHITECTURE §4.4, D-035), and this tree has none`)],
        entries: 0,
      }
  for (const one of found) console.log(formatFinding(one))

  const errors = found.filter((one) => one.severity === 'error').length
  const warnings = found.length - errors
  const warned = warnings > 0 ? `, ${plural(warnings, 'warning', 'warnings')}` : ''
  if (errors > 0) {
    console.log(`verify:pins failed: ${plural(errors, 'error', 'errors')} in ${LOCK_FILE}${warned}`)
    return 1
  }
  console.log(`verify:pins passed: ${plural(entries, 'entry', 'entries')}${warned}`)
  return 0
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2))
