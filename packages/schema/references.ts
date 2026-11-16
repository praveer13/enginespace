/**
 * `enginespace/references@1` (ARCHITECTURE §9.7, D-026, D-030): `labs/references/manifest.json`, the list of the large files that the
 * grader downloads and checks, and that `enginespace fetch <lab>` reads.
 *
 *   {schema, entries: [{name, kind, labs, path, url, sha256, bytes, licence, date, revision?, notes?}]}
 *
 * An entry is one file: a model's weights or its tokenizer, a slice of a dataset, a prompt set, or a reference that the owner made (the TR0
 * argmax bank, the teacher-forcing continuations, the owner's traces). Files live in GitHub Release assets or on Hugging Face at a pinned
 * revision, or on the site, and never in git (§9.7). The manifest is what pins them: the grader downloads a file only if the bytes hash to
 * the entry's `sha256`, and a receipt records the same name, kind, revision, hash and size as one of its `inputs` (§9.6), so a run on a
 * different model, dataset or prompt set shows.
 *
 * This is the one source (D-030). scripts/export-schemas.ts writes it to schemas/references.schema.json, and to the grader's package, which
 * validates a manifest with it before it downloads anything; `verify:schema` fails when the two drift. Every object is strict.
 *
 * JSON Schema cannot say a few things, so the zod schema checks them below and the grader's own check (fetch.py) says them again:
 *   - the labs of an entry differ, and so do the names of the entries;
 *   - the paths differ, and paths that differ only in case count as the same, because on a disk that ignores case both would be one file;
 *   - no path is a folder that another path is inside: `a` and `a/b` cannot both be files;
 *   - a `date` is a day that exists.
 * tests/fixtures/references/cases.json holds good and bad manifests, and the TypeScript and the Python suites each have to give the verdict
 * that the file gives.
 *
 * The bounds on how many entries a manifest holds are design parameters [estimated] that keep a hostile file's report small.
 */
import { z } from './zod'
import { isCalendarDay, plainText, sha256Hex, uniqueList } from './common'
import { INPUT_KINDS } from './receipt'
import { receiptLabIdSchema } from './refs'

/** The `schema` of every manifest. */
export const REFERENCES_SCHEMA_TAG = 'enginespace/references@1'

/** How many entries, and how many labs for one entry, a manifest holds at most [estimated]. */
export const REFERENCES_LIMITS = { entries: 256, labs: 16 } as const

/** The longest `path` may be, in characters [estimated]. */
export const REFERENCE_PATH_MAX = 200

/** The longest `url` may be, in characters [estimated]. */
export const REFERENCE_URL_MAX = 2048

/**
 * The cache path of a file: folders and a file name joined by `/`. A part starts with a letter or a digit, so `.` and `..` are not parts,
 * and it does not end in a dot, so that no part is a name that some file system reads as another. No backslash, colon, space or leading
 * slash, so the path stays inside the cache.
 */
const SEGMENT = '[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?'
export const REFERENCE_PATH_SOURCE = `^${SEGMENT}(?:/${SEGMENT})*$`

const HOST = '[a-z0-9]+(?:[.-][a-z0-9]+)*'
const LOOPBACK = '(?:127\\.0\\.0\\.1|localhost|\\[::1\\])'
/** What may follow the host: a path and a query. Printable ASCII with no space, `#`, quote mark, bracket or backslash. */
const URL_TAIL = "/[A-Za-z0-9._~%!&'()*+,;=:@/?-]*"

/**
 * A URL the grader may download from: https, with a lower-case host and an optional port; or http to this machine itself (127.0.0.1,
 * localhost or [::1]), which the grader's tests use to serve a file from a folder, and which no committed manifest uses (a test holds that).
 * No user name, no password and no fragment.
 */
export const REFERENCE_URL_SOURCE = `^(?:https://${HOST}|http://${LOOPBACK})(?::[0-9]{1,5})?${URL_TAIL}$`

const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

/** Whether `text` is `YYYY-MM-DD` and names a day of the Gregorian calendar. */
export function isReferenceDate(text: string): boolean {
  return DAY.test(text) && isCalendarDay(Number.parseInt(text.slice(0, 4), 10), Number.parseInt(text.slice(5, 7), 10), Number.parseInt(text.slice(8), 10))
}

export const referenceSchema = z.strictObject({
  /** What a receipt records as the input's `name`: shown to the learner, and unique in the manifest. */
  name: plainText(128),
  /** What a receipt records as the input's `kind` (A§9.6). */
  kind: z.enum(INPUT_KINDS),
  /** The labs that use the file, such as `tr0.forward`: `enginespace fetch tr0.forward` downloads the entries that list it. */
  labs: uniqueList(receiptLabIdSchema).min(1).max(REFERENCES_LIMITS.labs),
  /** Where the file goes in the cache, relative to it. */
  path: z.string().max(REFERENCE_PATH_MAX).regex(new RegExp(REFERENCE_PATH_SOURCE), 'must be a relative path of letters, digits, dots, hyphens and underscores, such as tr0/qwen3-0.6b/config.json'),
  url: z
    .string()
    .max(REFERENCE_URL_MAX)
    .regex(new RegExp(REFERENCE_URL_SOURCE), 'must be an https URL (or an http URL to 127.0.0.1, localhost or [::1], for a test), with no user name, password or fragment'),
  /** The hash of the file's bytes. The grader keeps a download only if it matches. */
  sha256: sha256Hex,
  bytes: z.int().min(0),
  /** The licence the file's content is under, as its source states it. Free text: `Apache-2.0`, or `all rights reserved (O-3)` for the owner's own. */
  licence: plainText(128),
  /** The day the hash and the licence were checked against the source. */
  date: z.string().regex(DAY, 'must be a day as YYYY-MM-DD').refine(isReferenceDate, 'must be a day that exists'),
  /** The pinned revision: a Hugging Face commit, a release tag. What a receipt records as the input's `revision`. */
  revision: plainText(64).optional(),
  /** For whoever maintains the manifest: where the hash came from, and anything the learner should know. */
  notes: plainText(1000, 'text', false).optional(),
})

export const referencesSchema = z
  .strictObject({
    schema: z.literal(REFERENCES_SCHEMA_TAG),
    entries: z.array(referenceSchema).max(REFERENCES_LIMITS.entries),
  })
  .superRefine((file, ctx) => {
    const add = (message: string, path: (string | number)[]): void => ctx.addIssue({ code: 'custom', message, path })
    const names = new Set<string>()
    const paths = new Map<string, string>()
    file.entries.forEach((entry, at) => {
      if (names.has(entry.name)) add(`name "${entry.name}" is listed twice`, ['entries', at, 'name'])
      names.add(entry.name)
      const key = entry.path.toLowerCase()
      if (paths.has(key)) add(`path "${entry.path}" is listed twice (paths that differ only in case count as the same)`, ['entries', at, 'path'])
      paths.set(key, entry.path)
    })
    file.entries.forEach((entry, at) => {
      const parts = entry.path.toLowerCase().split('/')
      for (let end = 1; end < parts.length; end += 1) {
        const folder = parts.slice(0, end).join('/')
        if (paths.has(folder)) add(`path "${entry.path}" is inside "${paths.get(folder)}", which is a file`, ['entries', at, 'path'])
      }
    })
  })
  .meta({
    title: REFERENCES_SCHEMA_TAG,
    description:
      'The large files that the local grader downloads, each pinned by SHA-256 and size (ARCHITECTURE §9.7). Checked by the grader and not expressible in JSON Schema: entry names differ; paths differ, ignoring case, and no path is a folder that another path is inside; a date is a day that exists.',
  })

export type Reference = z.infer<typeof referenceSchema>
export type ReferencesFile = z.infer<typeof referencesSchema>
