/*
 * How the files of schemas/vectors are written, and what they may contain (ARCHITECTURE §9.8, D-030).
 *
 * A vector file is read by the Python grader's tests, so it is written for a reader in another language:
 *   - It is ASCII. Every character above U+007E is a \uXXXX escape, a character outside the Basic Multilingual Plane as two (a surrogate
 *     pair), so the file carries no invisible, bidirectional or line-separating character, and a diff of it shows what it holds.
 *   - A number is one that both languages read as the same value. Every number token is exactly what `String(Number(token))` writes: a
 *     whole number is below 2^53 or exactly representable, a fraction is the shortest text that round-trips (at most 17 significant
 *     digits), and there is no -0, no `1.0`, no `1E5` and no `+`. Where a vector needs more than JSON numbers can say, it writes the
 *     text of a number as a string, or the IEEE-754 bits of a float as 16 hex digits, and the reader compares those.
 *   - Keys keep the order the builder wrote them in, so `id` and `note` come first, and a line holds one vector where it fits.
 */

/** One vector: an id, a note on what it checks, and the fields that its file's `reading` explains. */
export type Vector = { readonly id: string; readonly note?: string } & { readonly [field: string]: unknown }

/** A vector file. */
export interface VectorFile {
  /** `enginespace/vectors-<name>@1`. */
  readonly spec: string
  readonly description: string
  /** What a reader has to know to run a vector: one rule to a line. */
  readonly reading: readonly string[]
  /** The script that writes the file. */
  readonly source: string
  /** What produced the expected values, and what it is independent of. */
  readonly oracle: string
  readonly vectors: readonly Vector[]
}

const WIDTH = 200

/** A string as an ASCII JSON literal. */
export function asciiString(text: string): string {
  let out = '"'
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i)
    const char = text[i]
    if (char === '"') out += '\\"'
    else if (char === '\\') out += '\\\\'
    else if (unit === 0x0a) out += '\\n'
    else if (unit === 0x0d) out += '\\r'
    else if (unit === 0x09) out += '\\t'
    else if (unit < 0x20 || unit > 0x7e) out += `\\u${unit.toString(16).padStart(4, '0')}`
    else out += char
  }
  return `${out}"`
}

function scalar(value: unknown, path: string): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return asciiString(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value)) throw new RangeError(`${path}: ${value} has no JSON form`)
      if (Object.is(value, -0)) throw new RangeError(`${path}: -0 is a number that only JavaScript tells from 0`)
      return String(value)
    default:
      throw new TypeError(`${path}: a ${typeof value} has no JSON form`)
  }
}

const isScalar = (value: unknown): boolean => value === null || typeof value !== 'object'

/** `value` as JSON text indented by `indent`: on one line where it fits, otherwise one member to a line, with a list of scalars filled. */
function render(value: unknown, indent: string, path: string): string {
  if (isScalar(value)) return scalar(value, path)
  const flat = renderFlat(value, path)
  if (indent.length + flat.length <= WIDTH) return flat
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (value.every(isScalar)) {
      const lines: string[] = []
      let line = ''
      value.forEach((item, i) => {
        const text = `${scalar(item, `${path}[${i}]`)}${i === value.length - 1 ? '' : ','}`
        if (line !== '' && inner.length + line.length + 1 + text.length > WIDTH) {
          lines.push(line)
          line = text
        } else line = line === '' ? text : `${line} ${text}`
      })
      lines.push(line)
      return `[\n${lines.map((text) => inner + text).join('\n')}\n${indent}]`
    }
    return `[\n${value.map((item, i) => inner + render(item, inner, `${path}[${i}]`)).join(',\n')}\n${indent}]`
  }
  const record = value as Record<string, unknown>
  return `{\n${Object.keys(record)
    .map((key) => `${inner}${asciiString(key)}: ${render(record[key], inner, `${path}.${key}`)}`)
    .join(',\n')}\n${indent}}`
}

function renderFlat(value: unknown, path: string): string {
  if (isScalar(value)) return scalar(value, path)
  if (Array.isArray(value)) return `[${value.map((item, i) => renderFlat(item, `${path}[${i}]`)).join(', ')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .map((key) => `${asciiString(key)}: ${renderFlat(record[key], `${path}.${key}`)}`)
    .join(', ')}}`
}

/** The bytes of a vector file. A vector goes on one line where it fits within the width. */
export function renderVectorFile(file: VectorFile): string {
  const ids = new Set<string>()
  for (const vector of file.vectors) {
    if (ids.has(vector.id)) throw new RangeError(`${file.spec}: the id "${vector.id}" is used twice`)
    ids.add(vector.id)
  }
  const head = [
    `  "spec": ${asciiString(file.spec)},`,
    `  "description": ${asciiString(file.description)},`,
    `  "reading": ${render(file.reading, '  ', 'reading')},`,
    `  "source": ${asciiString(file.source)},`,
    `  "oracle": ${asciiString(file.oracle)},`,
  ]
  const vectors = file.vectors.map((vector, i) => `    ${render(vector, '    ', `vectors[${i}]`)}`)
  return `{\n${head.join('\n')}\n  "vectors": [\n${vectors.join(',\n')}\n  ]\n}\n`
}

/** A string literal, then a number: `"` begins a string that ends at the next unescaped `"`, and a number is what the text outside strings holds. */
const STRING = /"(?:[^"\\]|\\.)*"/g
const NUMBER = /-?[0-9][0-9.eE+-]*/g

/**
 * The number tokens of a JSON text that the two languages might not read alike: any token that is not exactly what `String(Number(token))`
 * writes. That catches -0, a whole number written as a fraction (`1.0`), an exponent in a form other than JavaScript's, a whole number too
 * large to be exact, and a fraction of more digits than the shortest text that round-trips. A list of `line:column token: why`.
 */
export function numberProblems(text: string): string[] {
  const problems: string[] = []
  // Blank out every string, keeping the length so that a position in the result is a position in the text.
  const outside = text.replace(STRING, (found) => ' '.repeat(found.length))
  const lineStarts = [0]
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') lineStarts.push(i + 1)
  const lineOf = (at: number): number => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= at) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  for (const match of outside.matchAll(NUMBER)) {
    const token = match[0]
    const line = lineOf(match.index)
    const where = `${line + 1}:${match.index - lineStarts[line] + 1} ${token}`
    const number = Number(token)
    if (!Number.isFinite(number)) problems.push(`${where}: not a finite number`)
    else if (Object.is(number, -0)) problems.push(`${where}: negative zero, which only JavaScript tells from 0`)
    else if (String(number) !== token) problems.push(`${where}: not the form both languages read alike; JavaScript writes this number as ${String(number)}`)
  }
  return problems
}
