/*
 * Reading a content file (ARCHITECTURE §4.1, D-016): the layer under the compiler that knows files, YAML and lines, and
 * nothing about what a lesson means.
 *
 *   - A content file is YAML front matter, then Markdown with `:::name … :::` directives (A§4.2). `parseContentFile` splits it
 *     into the front matter and an ordered list of prose and directive segments, each with its line in the file.
 *   - YAML is loaded with js-yaml's core schema, so a bare 2026-11-03 stays a string (packages/schema/common.ts).
 *   - Every problem is a `Diagnostic` that names the file and the line, because the gates fail with `file:line` and the dev
 *     server shows the same line. A schema issue at a path such as `answer.rel_tol` is placed on the line of that key.
 *
 * The compiler runs under Bun (CI and the gates) and under Node (the Vite plugin), so nothing here uses a Bun API.
 */
import { CORE_SCHEMA, load, YAMLException } from 'js-yaml'
import type { z } from 'zod'

/** Which gate reports a diagnostic: `verify:content`, `verify:claims`, `verify:numbers` or `verify:kc` (W1-T03, which reads the KC graph with these helpers). */
export type Gate = 'content' | 'claims' | 'numbers' | 'kc'

export interface Diagnostic {
  gate: Gate
  /** An error fails the gate and the build. A warning is printed and fails nothing. */
  severity: 'error' | 'warning'
  /** A short name for the kind of problem, such as `unknown-key` or `untagged-number`. */
  code: string
  /** The file, relative to the repository root and written with slashes. */
  file: string
  /** The line, counted from 1. */
  line: number
  message: string
}

/** `content/modules/tr2/module.md:12: error unknown-key: …` */
export const formatDiagnostic = (d: Diagnostic): string => `${d.file}:${d.line}: ${d.severity} ${d.code}: ${d.message}`

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Makes a diagnostic for `out.push(...)`. */
export function problem(gate: Gate, severity: Diagnostic['severity'], code: string, file: string, line: number, message: string): Diagnostic {
  return { gate, severity, code, file, line, message }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* YAML                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export type YamlResult = { ok: true; value: unknown } | { ok: false }

/**
 * Loads one YAML document. `firstLine` is the line of the text's first line in `file`, so a syntax error lands on the line
 * the author sees. A repeated key is a syntax error, because js-yaml refuses it.
 */
export function loadYaml(text: string, file: string, firstLine: number, gate: Gate, out: Diagnostic[]): YamlResult {
  // js-yaml builds its exceptions on plain objects and calls Error.captureStackTrace on them, which Bun refuses once something has
  // replaced Error.prepareStackTrace. The React Compiler rules of eslint-plugin-react-hooks do, and `bun test` runs the lint tests
  // and these in one process. Setting the hook aside for the call keeps a syntax error a YAMLException with its position.
  const hook = Error as unknown as { prepareStackTrace: unknown }
  const prepare = hook.prepareStackTrace
  hook.prepareStackTrace = undefined
  try {
    return { ok: true, value: load(text, { schema: CORE_SCHEMA }) }
  } catch (error) {
    if (!(error instanceof YAMLException)) throw error
    out.push(problem(gate, 'error', 'bad-yaml', file, firstLine + (error.mark?.line ?? 0), `not valid YAML: ${error.reason}`))
    return { ok: false }
  } finally {
    hook.prepareStackTrace = prepare
  }
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The column where the key on a line begins: after its indentation and any `- ` item markers. */
const keyColumn = (text: string): number => (/^\s*(?:-\s+)*/.exec(text) ?? [''])[0].length

const isBlank = (text: string): boolean => text.trim() === '' || /^\s*#/.test(text)

/** How many brackets and braces a line leaves open. */
const open = (text: string): number => {
  const code = text.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '').replace(/(^|\s)#.*$/, '')
  return (code.match(/[{[]/g)?.length ?? 0) - (code.match(/[}\]]/g)?.length ?? 0)
}

/**
 * The line after the value of the key on line `at`, at most `limit`: the end of a flow value on the key's own line (or lines),
 * or the end of the block that is indented under it. A block sequence at the key's own indent belongs to the key.
 */
function valueEnd(lines: readonly string[], at: number, limit: number): number {
  const text = lines[at].replace(/(^|\s)#.*$/, '')
  if (/:\s*\S/.test(text)) {
    let balance = open(text)
    let end = at + 1
    while (balance > 0 && end < limit) balance += open(lines[end++])
    return Math.min(end, limit)
  }
  const column = keyColumn(lines[at])
  for (let j = at + 1; j < limit; j += 1) {
    if (isBlank(lines[j])) continue
    const depth = (/^\s*/.exec(lines[j]) ?? [''])[0].length
    if (depth > column || (depth === column && /^\s*-(?:\s|$)/.test(lines[j]))) continue
    return j
  }
  return limit
}

/**
 * The lines of the block sequence that follows line `from`, before `limit`: the line of each of its `- ` items. The sequence
 * ends at the first line that is less indented than its dashes, or that is as indented and is not a dash. Blank lines and
 * comments do not end it.
 */
function sequenceItems(lines: readonly string[], from: number, limit: number): number[] {
  const items: number[] = []
  let indent = -1
  for (let i = from; i < limit; i += 1) {
    const text = lines[i]
    if (isBlank(text)) continue
    const dash = /^(\s*)-(?:\s|$)/.exec(text)
    const depth = (/^\s*/.exec(text) ?? [''])[0].length
    if (dash === null) {
      if (indent >= 0 && depth <= indent) break
      continue
    }
    if (indent < 0) indent = dash[1].length
    if (depth === indent) items.push(i)
    else if (depth < indent) break
  }
  return items
}

/**
 * The index in `lines` of the place a path points at, for a YAML text whose lines these are. js-yaml does not report where a
 * key sits, so each key of the path is looked for, in order, from the line of the one before and within its value. A key
 * that is not there (a required key that was left out) leaves the line of its parent, which is where the author has to add it.
 *
 * A key is found at the start of a line, after `- `, or after `{`, `,` or `[`, so `answer: { kind: numeric, rel_tol: 2 }` places
 * `rel_tol` on the line of `answer`. A comment is not a key. An index into a block sequence picks that `- ` item, and what
 * is looked for next is looked for within the item. An index into a flow sequence stays on the line of its key.
 */
export function locate(lines: readonly string[], path: readonly (string | number)[]): number {
  let at = 0
  let limit = lines.length
  // Whether `at` is the line of a key. A key with its value on the same line holds a flow sequence or mapping, not a block one.
  let onKey = false
  for (const segment of path) {
    if (typeof segment === 'string') {
      const key = escapeRegExp(segment)
      const pattern = new RegExp(`(?:^|[\\s{,\\[-])(?:${key}|"${key}"|'${key}')\\s*:(?=\\s|$|[,}\\]])`)
      for (let i = at; i < limit; i += 1) {
        // A comment is not a key, whatever words it holds.
        if (pattern.test(lines[i].replace(/(^|\s)#.*$/, ''))) {
          at = i
          limit = valueEnd(lines, i, limit)
          onKey = true
          break
        }
      }
    } else if (!(onKey && /:\s*\S/.test(lines[at] ?? ''))) {
      const items = sequenceItems(lines, at, limit)
      const item = items[segment]
      if (item !== undefined) {
        at = item
        limit = Math.min(limit, items[segment + 1] ?? limit)
        onKey = false
      }
    }
  }
  return at
}

export interface Where {
  file: string
  /** The YAML text the issues are about. */
  text: string
  /** The line of the text's first line in the file. */
  firstLine: number
  gate: Gate
  /** What the text is, for the message: `:::game`, `the front matter`, `a claim`. */
  subject: string
  /** The keys the object may have, for an unknown-key message. */
  allowedKeys?: readonly string[]
  /** What to add to the message about an unknown key of this name, such as a key the compiler writes itself. */
  hints?: Readonly<Record<string, string>>
}

const pathText = (path: readonly PropertyKey[]): string => path.map(String).join('.')

/** Turns the issues of a failed schema parse into diagnostics, each on the line of its key. */
export function schemaDiagnostics(issues: readonly z.core.$ZodIssue[], where: Where): Diagnostic[] {
  const lines = where.text.split('\n')
  const lineOf = (path: readonly (string | number)[]) => where.firstLine + locate(lines, path)
  const out: Diagnostic[] = []
  for (const issue of issues) {
    const path = issue.path.filter((segment): segment is string | number => typeof segment !== 'symbol')
    if (issue.code === 'unrecognized_keys') {
      const known = where.allowedKeys === undefined ? '' : ` (${where.subject} takes ${where.allowedKeys.join(', ')})`
      for (const key of issue.keys) {
        const at = path.length > 0 ? ` in ${pathText(path)}` : ''
        const hint = where.hints?.[key] === undefined ? '' : `: ${where.hints[key]}`
        out.push(problem(where.gate, 'error', 'unknown-key', where.file, lineOf([...path, key]), `unknown key "${key}"${at} of ${where.subject}${hint || known}`))
      }
      continue
    }
    const at = path.length > 0 ? `${pathText(path)}: ` : ''
    out.push(problem(where.gate, 'error', 'schema', where.file, lineOf(path), `${at}${issue.message}`))
  }
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Content files                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------ */

export interface ProseSegment {
  kind: 'prose'
  /** The line of the segment's first line. The Markdown keeps its blank lines, so a token's line is this plus the lines before it. */
  line: number
  md: string
}

export interface DirectiveSegment {
  kind: 'directive'
  name: string
  /** The line of the `:::name` that opens it. */
  line: number
  /** The line of the first line of the YAML body. */
  bodyLine: number
  yaml: string
}

export type Segment = ProseSegment | DirectiveSegment

export interface ContentFile {
  file: string
  /** The front matter as YAML, or undefined when it did not parse (a diagnostic says why). */
  frontMatter: unknown
  frontMatterText: string
  frontMatterLine: number
  segments: Segment[]
}

const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})/
const CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/

/**
 * Splits a content file (A§4.2) into its front matter and the prose and directives after it. A line that is exactly `:::`
 * closes a directive, and `:::name` at the start of a line opens one outside a fenced code block. It returns null when the
 * file has no front matter to speak of; every other problem is a diagnostic and the file is still split.
 */
export function parseContentFile(file: string, source: string, out: Diagnostic[]): ContentFile | null {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  if (lines[0].trimEnd() !== '---') {
    out.push(problem('content', 'error', 'no-front-matter', file, 1, 'a content file starts with front matter: a line of three hyphens, the keys, and another line of three hyphens'))
    return null
  }
  const end = lines.findIndex((text, index) => index > 0 && text.trimEnd() === '---')
  if (end < 0) {
    out.push(problem('content', 'error', 'no-front-matter', file, 1, 'the front matter is never closed: add a line of three hyphens after the last key'))
    return null
  }

  const frontMatterText = lines.slice(1, end).join('\n')
  const loaded = loadYaml(frontMatterText, file, 2, 'content', out)
  let frontMatter: unknown
  if (loaded.ok) {
    frontMatter = loaded.value
    if (!isRecord(frontMatter)) {
      out.push(problem('content', 'error', 'front-matter', file, 2, 'the front matter must be a list of key: value lines'))
      frontMatter = undefined
    }
  }

  const segments: Segment[] = []
  let prose: { line: number; lines: string[] } | null = null
  let directive: { name: string; line: number; lines: string[] } | null = null
  let fence: { char: string; length: number } | null = null
  const flushProse = () => {
    if (prose !== null && prose.lines.some((text) => text.trim() !== '')) segments.push({ kind: 'prose', line: prose.line, md: prose.lines.join('\n') })
    prose = null
  }

  for (let index = end + 1; index < lines.length; index += 1) {
    const text = lines[index]
    const line = index + 1
    if (directive !== null) {
      if (/^:::\s*$/.test(text)) {
        segments.push({ kind: 'directive', name: directive.name, line: directive.line, bodyLine: directive.line + 1, yaml: directive.lines.join('\n') })
        directive = null
      } else if (text.startsWith(':::')) {
        out.push(problem('content', 'error', 'nested-directive', file, line, `directives do not nest: close :::${directive.name} (line ${directive.line}) with a line of three colons before opening another`))
      } else {
        directive.lines.push(text)
      }
      continue
    }

    if (fence !== null) {
      const close = CLOSE_FENCE.exec(text)
      if (close !== null && close[1][0] === fence.char && close[1].length >= fence.length) fence = null
    } else {
      const open = OPEN_FENCE.exec(text)
      if (open !== null && !(open[1][0] === '`' && text.slice(open[0].length).includes('`'))) {
        fence = { char: open[1][0], length: open[1].length }
      } else if (text.startsWith(':::')) {
        const opener = /^:::([A-Za-z][\w-]*)\s*$/.exec(text)
        if (opener === null) {
          const stray = /^:::\s*$/.test(text)
          out.push(
            problem(
              'content',
              'error',
              stray ? 'stray-fence' : 'bad-directive',
              file,
              line,
              stray ? 'a line of three colons closes a directive, and none is open' : 'a directive opens with three colons and its name alone, as in :::predict',
            ),
          )
        } else {
          flushProse()
          directive = { name: opener[1], line, lines: [] }
        }
        continue
      }
    }
    prose ??= { line, lines: [] }
    prose.lines.push(text)
  }
  if (directive !== null) {
    out.push(problem('content', 'error', 'unclosed-directive', file, directive.line, `:::${directive.name} is never closed: add a line of three colons after its last key`))
  }
  flushProse()

  return { file, frontMatter, frontMatterText, frontMatterLine: 2, segments }
}
