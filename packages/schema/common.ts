/**
 * The field types that every schema file in this package shares: text, dates, URLs, hashes and lists with no repeats.
 *
 * Each is a plain zod schema, so `z.toJSONSchema` exports it (D-030) and the grader's `jsonschema` can read the export.
 * Nothing here is public: index.ts does not re-export this file.
 */
import { z } from './zod'

/** Text that holds something besides whitespace. */
export const nonBlank = z.string().regex(/\S/, 'must not be blank')

/**
 * `YYYY-MM-DD`, and a day that exists. YAML must hand a date over as a string: js-yaml's default schema turns a bare
 * `2026-11-03` into a `Date`, which this rejects, so the content compiler loads YAML with `CORE_SCHEMA` (or the author quotes it).
 */
export const isoDate = z.iso.date()

/** An absolute https URL. The site makes no request outside its origin (D-033), and a claim's source is a page to read, so nothing else is allowed. */
export const httpsUrl = z.url({ protocol: /^https$/, error: 'must be an https URL' })

/** A SHA-256 as 64 lowercase hex digits. */
export const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, 'must be 64 lowercase hex digits (a SHA-256)')

/** A full git commit SHA. A pin by abbreviation could turn ambiguous, so 40 digits are required. */
export const gitSha = z.string().regex(/^[0-9a-f]{40}$/, 'must be a full 40-digit lowercase commit SHA')

/** A list whose entries differ. The issue points at the second copy, so the author sees which line to delete. */
export function uniqueList<T extends z.ZodType<string>>(entry: T) {
  return z.array(entry).superRefine((list, ctx) => {
    const seen = new Set<string>()
    list.forEach((value, index) => {
      if (seen.has(value)) ctx.addIssue({ code: 'custom', message: `repeats "${value}"`, path: [index] })
      seen.add(value)
    })
  })
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Fields of the receipt family (W2-T01): receipt@1, bundle@1, trace@1 and the challenge                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/*
 * These schemas are read by two languages. The site's zod validates a receipt in the learner's browser, and the grader's `jsonschema`
 * validates the export of the same schema in Python (D-030), so a field is written to mean the same in both:
 *   - a pattern uses explicit classes, groups and anchors, and none of `\d`, `\w`, `\s`, `\b` or `.`, whose meanings differ between
 *     ECMAScript and Python's `re` (Python's `\d` takes every Unicode digit). The export replaces a closing `$` with an end-of-text
 *     test that Python reads the same way (scripts/export-schemas.ts), because Python's `$` also matches before a final newline;
 *   - a length is counted in code points, as JSON Schema counts it, where a string's `length` in JavaScript counts UTF-16 units;
 *   - a number is an integer where the field is a count, a size or an id, so that the receipt's canonical JSON (A§9.8) never has to
 *     print a float that a field did not need.
 */

/** An unsigned 32-bit integer: a seed (A§8.4). */
export const uint32 = z.int().min(0).max(0xffffffff)

/**
 * Whether `text` holds a lone surrogate: a high surrogate with no low one after it, or a low one with no high one before it. Such a string has
 * no UTF-8 form, so Python refuses to encode it, where a JavaScript hash of it would quietly use U+FFFD. It is a loop and not the regular
 * expression of packages/sim/trace/codec.ts, because a bundle's text may run to megabytes and the expression took 3.3 s over 100 MB of
 * `a` in Bun 1.3.14, where this loop took 70 ms [measured 2026-11-09 on the dev host, at a load of about 17].
 */
export function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) i += 1
      else return true
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true
  }
  return false
}

/** The characters of `text` as JSON Schema's `maxLength` counts them, which are code points. A lone surrogate counts as one. */
export function codePoints(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) i += 1
    }
    count += 1
  }
  return count
}

/** One line of text with no control character. */
// eslint-disable-next-line no-control-regex -- the pattern is the point: it refuses control characters, in the JSON Schema export as well
const LINE = /^[^\u0000-\u001f\u007f]*$/
/** Text that may run over several lines: a control character other than a tab, a line feed and a carriage return is refused. */
// eslint-disable-next-line no-control-regex -- the pattern is the point: it refuses control characters, in the JSON Schema export as well
const TEXT = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/

/**
 * Plain text for a person to read, shown as text and never as markup (A§12): at most `max` code points, no control character and no
 * lone surrogate. `line` forbids a line break, `text` allows tabs and line breaks. `required` refuses the empty string.
 */
export function plainText(max: number, kind: 'line' | 'text' = 'line', required = true) {
  const base = required ? z.string().min(1) : z.string()
  return base
    .regex(kind === 'line' ? LINE : TEXT, kind === 'line' ? 'must be one line of plain text' : 'must be plain text')
    .refine((text) => !hasLoneSurrogate(text), 'must not hold a lone surrogate')
    .refine((text) => codePoints(text) <= max, `must be at most ${max} characters`)
    .meta({ maxLength: max })
}

/** Whether `year`, `month` and `day` name a day of the Gregorian calendar, in years 1 to 9999. */
export function isCalendarDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]
}

const INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/

/** Whether `text` is a UTC date-time as `YYYY-MM-DDTHH:MM:SS`, then an optional fraction of 1 to 9 digits, then `Z`, naming a moment that exists. */
export function isUtcInstant(text: string): boolean {
  if (!INSTANT.test(text)) return false
  const number = (from: number, to: number): number => Number.parseInt(text.slice(from, to), 10)
  return isCalendarDay(number(0, 4), number(5, 7), number(8, 10)) && number(11, 13) <= 23 && number(14, 16) <= 59 && number(17, 19) <= 59
}

/** A UTC date-time such as `2026-11-09T12:30:00Z`: the grader writes `Z` and never an offset, so two receipts of one moment read alike. */
export const utcInstant = z
  .string()
  .regex(INSTANT, 'must be a UTC date-time such as 2026-11-09T12:30:00Z')
  .refine(isUtcInstant, 'must be a moment that exists')

/** A version as an installed package or a driver prints it: `0.33.0`, `2.14.0+cu130`, `0.7.2.post1`, `580.82.07`. */
export const versionText = z.string().regex(/^[0-9][0-9A-Za-z.+_-]{0,63}$/, 'must be a version such as 0.33.0')

/** A short name in lower case: an artifact, a check, a library. Words joined by single dots, hyphens or underscores. */
export const nameToken = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'must be lower-case words joined by dots, hyphens or underscores')

/** JSON of any shape, present. zod accepts a missing key for `unknown`, and JSON Schema's `required` does not, so this refuses `undefined`. */
export const anyJson = z.unknown().refine((value) => value !== undefined, 'must be present')
