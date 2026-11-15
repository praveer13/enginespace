// Canonical JSON (ARCHITECTURE §5.2 `core`, §9.8): one string for one value, so a hash of it means something in every
// runtime and in the Python grader.
//
// The form is RFC 8785 (the JSON Canonicalization Scheme) for data that holds only what this project's artifacts hold:
//   - no whitespace;
//   - object keys sorted by UTF-16 code unit, which is what `<` on strings compares (Python sorts a key's UTF-16-BE bytes);
//   - strings as `JSON.stringify` writes them: the shortest escapes (`\"`, `\\`, `\n` and the rest of the short forms, `\u00xx` in
//     lower-case hex for other control characters) and everything else as it is, in UTF-8;
//   - numbers as ECMAScript prints them (`Number.prototype.toString`: shortest digits that round-trip, `1e-7`, `1.5`), so an
//     integer is written as an integer and -0 as 0.
// It is strict where JSON.stringify is forgiving, because a silent difference is a hash that differs on another machine:
// NaN, Infinity, `undefined`, functions, symbols, bigints, holes in arrays, cycles, and any object that is not a plain
// object or an array (a Map, a Date, a typed array, a class instance) throw, naming the path. So does a string or a key with a
// lone surrogate, which has no UTF-8 form, and an integer-valued number beyond 2^53, which Python would read as an int or as a
// float according to its digits (§5.1: every value stays below 2^53).

function isPlain(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** A high surrogate with no low surrogate after it, or a low surrogate with no high surrogate before it. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/

/**
 * Where a value is, for a message: the path of its container and the way in (an index, or `.name`). It is joined only when a message is made, so a value that has a form
 * costs no string: a column of a hundred million numbers made one for each, in the review's measurement of a tab that ran out of memory.
 */
const at = (path: string, way: string | number): string => (typeof way === 'number' ? `${path}[${way}]` : path + way)

function text(value: string, path: string, way: string | number = ''): string {
  if (LONE_SURROGATE.test(value)) throw new RangeError(`${at(path, way)}: a lone surrogate has no UTF-8 form`)
  return JSON.stringify(value)
}

function encode(value: unknown, path: string, ancestors: object[], way: string | number = ''): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'string':
      return text(value, path, way)
    case 'number':
      if (!Number.isFinite(value)) throw new RangeError(`${at(path, way)}: ${value} has no JSON form`)
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) throw new RangeError(`${at(path, way)}: the integer ${value} is beyond 2^53`)
      return JSON.stringify(value)
    case 'object':
      break
    default:
      throw new TypeError(`${at(path, way)}: a ${typeof value} has no JSON form`)
  }
  const node: object = value
  path = at(path, way)
  if (ancestors.includes(node)) throw new TypeError(`${path}: the structure is cyclic`)
  ancestors.push(node)
  try {
    if (Array.isArray(node)) {
      const items: string[] = []
      for (let i = 0; i < node.length; i++) {
        if (!(i in node)) throw new TypeError(`${path}[${i}]: a hole in an array has no JSON form`)
        items.push(encode(node[i], path, ancestors, i))
      }
      return `[${items.join(',')}]`
    }
    if (!isPlain(node)) throw new TypeError(`${path}: only plain objects and arrays have a canonical form`)
    const record = node as Record<string, unknown>
    const members: string[] = []
    for (const key of Object.keys(record).sort(compareKeys)) {
      const member = record[key]
      if (member === undefined) throw new TypeError(`${path}.${key}: undefined has no JSON form`)
      members.push(`${text(key, path, `.${key}`)}:${encode(member, path, ancestors, `.${key}`)}`)
    }
    return `{${members.join(',')}}`
  } finally {
    ancestors.pop()
  }
}

/** The canonical JSON text of `value`. Hash its UTF-8 bytes. */
export function canonicalJson(value: unknown): string {
  return encode(value, '$', [])
}
