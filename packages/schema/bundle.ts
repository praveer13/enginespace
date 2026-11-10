/**
 * `enginespace/bundle@1` (ARCHITECTURE §9.6, D-029): one receipt and the raw artifacts it hashes, written as one gzipped JSON file,
 * `.es.json.gz`. Python's `gzip` writes it, and the browser's `DecompressionStream('gzip')` reads it under the caps of §8.5 rule 1.
 *
 *   {schema, receipt, artifacts: {<id>: {encoding, data}}}
 *
 * An artifact travels in one of three encodings, and its hash is over its canonical bytes (§8.5 rule 3, A§9.8):
 *   - `json`: any JSON value, hashed as the UTF-8 bytes of its canonical JSON. A trace travels this way, as `trace@1` in columns.
 *   - `text`: a string, hashed as its UTF-8 bytes, with its line endings as they are. A log or a patch travels this way.
 *   - `base64`: a string of standard base64 with its padding, no line breaks and no other character, hashed as the bytes it decodes to.
 * schemas/vectors/sha256.json has a case of each, and the Python port has to match every one.
 *
 * The artifacts of the bundle are those of the receipt that it lists with `inBundle: true`, no more and no fewer. The data of a `json`
 * artifact is not walked here: it is JSON, because it came out of JSON.parse, and the rules that read it check it against its own format,
 * `traceSchema` for a trace. That keeps the parse of a trace of millions of numbers from running twice.
 *
 * One zod behavior is worth knowing. A `record` skips a key called `__proto__` and goes on, where JSON Schema's property names refuse it. No
 * receipt can list an artifact of that name (its id has to be lower-case words), and the key never reaches the parsed bundle.
 */
import { z } from './zod'
import { anyJson, hasLoneSurrogate, nameToken } from './common'
import { receiptSchema } from './receipt'

/** The `schema` of every bundle. */
export const BUNDLE_SCHEMA_TAG = 'enginespace/bundle@1'

/** How an artifact's data is written (A§9.6). */
export const BUNDLE_ENCODINGS = ['json', 'text', 'base64'] as const

/** Standard base64, padded, with no other character. The text of the export's pattern; the check below is the same rule in a loop. */
export const BASE64_SOURCE = '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$'

/**
 * Whether `text` is standard base64 with its padding. It is a loop and not the pattern because a bundle may hold tens of megabytes of it,
 * and the pattern does not survive that much text: over 10 million characters of `AAAA`, Node 22.22.2 threw "Maximum call stack size
 * exceeded" and Bun 1.3.14 answered false [measured 2026-11-09 on the dev host]. tests/schema/bundle.test.ts holds the loop to the pattern
 * on short strings and to the answer on 40 million.
 */
export function isStrictBase64(text: string): boolean {
  const length = text.length
  if (length % 4 !== 0) return false
  const pad = length === 0 ? 0 : text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  const body = length - pad
  for (let i = 0; i < body; i += 1) {
    const unit = text.charCodeAt(i)
    const ok =
      (unit >= 0x41 && unit <= 0x5a) || // A-Z
      (unit >= 0x61 && unit <= 0x7a) || // a-z
      (unit >= 0x30 && unit <= 0x39) || // 0-9
      unit === 0x2b || // +
      unit === 0x2f // /
    if (!ok) return false
  }
  return true
}

/** One artifact's data and how it is written. */
export const bundleArtifactSchema = z.discriminatedUnion('encoding', [
  z.strictObject({ encoding: z.literal('json'), data: anyJson }),
  z.strictObject({
    encoding: z.literal('text'),
    data: z.string().refine((text) => !hasLoneSurrogate(text), 'must not hold a lone surrogate, which has no UTF-8 form'),
  }),
  z.strictObject({
    encoding: z.literal('base64'),
    data: z.string().refine(isStrictBase64, 'must be standard base64 with its padding').meta({ pattern: BASE64_SOURCE }),
  }),
])

export const bundleSchema = z
  .strictObject({
    schema: z.literal(BUNDLE_SCHEMA_TAG),
    receipt: receiptSchema,
    /** The raw data of each artifact the receipt lists with `inBundle: true`, by its id. */
    artifacts: z.record(nameToken, bundleArtifactSchema),
  })
  .superRefine((bundle, ctx) => {
    const add = (message: string, path: (string | number)[]): void => ctx.addIssue({ code: 'custom', message, path })
    const listed = new Set<string>()
    bundle.receipt.artifacts.forEach((artifact, at) => {
      if (!artifact.inBundle) return
      listed.add(artifact.id)
      if (!Object.hasOwn(bundle.artifacts, artifact.id)) add(`artifact "${artifact.id}" is listed as in the bundle, and the bundle has no data for it`, ['receipt', 'artifacts', at, 'inBundle'])
    })
    for (const id of Object.keys(bundle.artifacts)) {
      if (!listed.has(id)) add(`the bundle holds data for "${id}", which the receipt does not list as in the bundle`, ['artifacts', id])
    }
  })
  .meta({
    title: BUNDLE_SCHEMA_TAG,
    description:
      'A receipt and its artifacts, as one gzipped JSON file (ARCHITECTURE §9.6, D-029). Checked by the site and not expressible in JSON Schema: the artifacts of the bundle are those that the receipt lists with inBundle true, no more and no fewer; an artifact\'s hash is over its canonical bytes (the UTF-8 of its canonical JSON for json, of its text for text, and the decoded bytes for base64); a text artifact holds no lone surrogate.',
  })

export type Bundle = z.infer<typeof bundleSchema>
export type BundleArtifact = z.infer<typeof bundleArtifactSchema>
