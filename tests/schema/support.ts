/**
 * Helpers for the schema tests: fixture and document readers, the YAML loader the content compiler will use, and a splitter
 * for content files. W0-T08 writes the real splitter; this one only has to read the fixtures.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CORE_SCHEMA, load } from 'js-yaml'
import type { ZodType } from 'zod'

export type Path = (string | number)[]

export const root = path.resolve(import.meta.dirname, '../..')

export const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')
export const fixture = (name: string) => read(`tests/fixtures/schema/${name}`)

/**
 * YAML as the content compiler loads it. The core schema keeps `2026-11-03` a string, which the date fields require: the
 * default schema would turn it into a `Date`.
 */
export const yaml = (text: string): unknown => load(text, { schema: CORE_SCHEMA })

export interface Directive {
  name: string
  body: unknown
}

export interface ContentFile {
  frontMatter: unknown
  directives: Directive[]
  /** The Markdown outside the directives. */
  prose: string
}

const DIRECTIVE = /^:::([a-z-]+)\n([\s\S]*?)\n:::$/gm

/** Splits a content file into its front matter, its `:::name … :::` directives and the prose around them. */
export function splitContent(text: string): ContentFile {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (match === null) throw new Error('the file has no front matter')
  const rest = text.slice(match[0].length)
  return {
    frontMatter: yaml(match[1]),
    directives: [...rest.matchAll(DIRECTIVE)].map((found) => ({ name: found[1], body: yaml(found[2]) })),
    prose: rest.replace(DIRECTIVE, '').trim(),
  }
}

/**
 * What went wrong with a value, as `path: code` lines, so a test can name the exact places and kinds of failure. An unknown key
 * is followed by its name in brackets, and the value itself is `(root)`.
 */
export function problems(schema: ZodType, value: unknown): string[] {
  const result = schema.safeParse(value)
  if (result.success) return []
  return result.error.issues.map((issue) => {
    const where = issue.path.length === 0 ? '(root)' : issue.path.join('.')
    return `${where}: ${issue.code}${issue.code === 'unrecognized_keys' ? `[${issue.keys.join(', ')}]` : ''}`
  })
}

/** The messages of the failures, in order. */
export function messages(schema: ZodType, value: unknown): string[] {
  const result = schema.safeParse(value)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

/** A copy of `value` with the key at `path` set, or removed when `to` is undefined. Never touches the original. */
export function withKey<T>(value: T, keyPath: (string | number)[], to: unknown): T {
  const copy = structuredClone(value) as Record<string | number, unknown>
  let at = copy
  for (const key of keyPath.slice(0, -1)) at = at[key] as Record<string | number, unknown>
  const last = keyPath[keyPath.length - 1]
  if (to === undefined) delete at[last]
  else at[last] = to
  return copy as T
}

/** The path of every object inside a value, the value itself first. */
export function objectPaths(value: unknown, path: Path = []): Path[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => objectPaths(item, [...path, index]))
  if (value !== null && typeof value === 'object') {
    return [path, ...Object.entries(value).flatMap(([key, inner]) => objectPaths(inner, [...path, key]))]
  }
  return []
}

/** A path as `problems` prints it. */
export const where = (path: Path) => (path.length === 0 ? '(root)' : path.join('.'))

/**
 * Which top-level keys of `value` the schema needs, and which it can do without: a key is needed when taking it out leaves
 * exactly one problem, at that key. Any other result throws, so a key that is needed in a way this cannot see is not missed.
 */
export function keyRoles(schema: ZodType, value: object): { required: string[]; optional: string[] } {
  const required: string[] = []
  const optional: string[] = []
  for (const key of Object.keys(value)) {
    const found = problems(schema, withKey(value, [key], undefined))
    if (found.length === 0) optional.push(key)
    else if (found.length === 1 && found[0].startsWith(`${key}: `)) required.push(key)
    else throw new Error(`taking out "${key}" gave ${JSON.stringify(found)}, which is neither fine nor a missing key`)
  }
  return { required: required.sort(), optional: optional.sort() }
}

/** The text between two markers of a document. A renamed heading throws instead of silently parsing nothing. */
export function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from)
  const end = text.indexOf(to, start + from.length)
  if (start < 0 || end < 0) throw new Error(`the document no longer has "${from}" followed by "${to}"`)
  return text.slice(start + from.length, end)
}

export interface DocField {
  name: string
  optional: boolean
  /** What follows the colon, such as `{url, title, quote, accessed}` or `pypi|git|blog`. */
  detail: string
}

/**
 * The fields of a shape the architecture writes as `{id, value, unit?, source: {url, title}, …}`: the text inside the outer
 * braces, split at the commas that are not inside inner braces.
 */
export function fieldsOf(shape: string): DocField[] {
  const inner = shape.trim().replace(/^\{/, '').replace(/\}$/, '')
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of inner) {
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts.map((part) => {
    const [head, ...rest] = part.split(':')
    const name = head.trim()
    return { name: name.replace(/\?$/, ''), optional: name.endsWith('?'), detail: rest.join(':').trim() }
  })
}
