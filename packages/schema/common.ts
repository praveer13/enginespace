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
