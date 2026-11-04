/**
 * `course.lock.json`, the course lockfile (ARCHITECTURE §4.4, D-011, D-035).
 *
 * It pins what the course reads and runs against: the vLLM and SGLang releases, the reading targets, the profilers, the models
 * and the datasets. The site build and the grader kit read the same file, and a receipt records its SHA-256 (A§9.6).
 *
 * A§4.4 gives the entry and not the file around it. The file here follows the `enginespace/<name>@1` convention of the export,
 * the receipt and the bundle (A§7.5, A§9.6): a `schema` tag, then the entries.
 */
import { z } from 'zod'
import { gitSha, httpsUrl, isoDate, nonBlank, sha256Hex } from './common'
import { lockKeySchema } from './refs'

/**
 * What an entry pins, from A§4.4. A profiler such as `nsys` is a vendor download with no repository to take a commit from, so it
 * has a kind of its own, `tool`, and is pinned by its version (W1-T01).
 */
export const LOCK_KINDS = ['pypi', 'git', 'blog', 'dataset', 'model', 'container', 'tool'] as const

export const lockEntrySchema = z
  .strictObject({
    /** What the rest of the repo calls the pin: a claim's `pin`, a module's `pins`, a receipt's `offPin`. */
    key: lockKeySchema,
    kind: z.enum(LOCK_KINDS),
    name: nonBlank,
    /** The release, such as `0.33.0`. */
    version: nonBlank.optional(),
    /** The commit, in full. D-035 pins the engines and the reading targets by commit. */
    commit: gitSha.optional(),
    url: httpsUrl,
    sha256: sha256Hex.optional(),
    /** When someone last checked the pin against its source. */
    checkedAt: isoDate,
    /** Days after `checkedAt` that the pin counts as fresh. Past it the site says "stale since"; nothing fails (A§4.4). */
    ttlDays: z.int().positive(),
    notes: z.string(),
  })
  .superRefine((entry, ctx) => {
    if (entry.version === undefined && entry.commit === undefined) {
      ctx.addIssue({ code: 'custom', message: 'an entry pins a version or a commit, and this has neither', path: ['version'] })
    }
  })

export const lockFileSchema = z.strictObject({
  schema: z.literal('enginespace/lock@1'),
  entries: z.array(lockEntrySchema).superRefine((entries, ctx) => {
    const seen = new Set<string>()
    entries.forEach((entry, index) => {
      if (seen.has(entry.key)) ctx.addIssue({ code: 'custom', message: `key "${entry.key}" is pinned twice`, path: [index, 'key'] })
      seen.add(entry.key)
    })
  }),
})

export type LockEntry = z.infer<typeof lockEntrySchema>
export type LockFile = z.infer<typeof lockFileSchema>
