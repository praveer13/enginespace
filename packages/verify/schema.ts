/**
 * Rule 2, the schema (ARCHITECTURE §8.5, D-030): the text inside the file must be a `bundle@1` with a `receipt@1` in it, by the zod schemas
 * of packages/schema, strictly. An unknown field is refused wherever it is, `ext` and the `claimed` summary of a performance run are the two
 * places that take any key and verification ignores both, and a receipt is checked by the rules that JSON Schema cannot say (the schema's
 * own refinements): the lab is the stage's lab, the token names the stage, the lists have no repeats, `onPin` agrees with `offPin`.
 *
 * One more thing is a rule of the schema and not of the hash: the receipt has a canonical form. Its identity is the SHA-256 of that text
 * (ASSESSMENT §5.5, the fragment of `/receipts#<sha256>`), so a receipt with a number beyond 2^53 or a lone surrogate in a place the schema
 * leaves open (`ext`, `claimed`) has no identity and is refused here. The grader's reader refuses the same receipt, for the same reason
 * (receipt.py, `receipt_rule_problems`).
 *
 * Nothing here trusts the file's own idea of itself. A `schema` tag that is not `enginespace/bundle@1` is a problem, and so is a bundle
 * from a newer format: the site reads the formats it knows and says which one it did not recognise.
 */
import { bundleSchema } from '@es/schema/bundle'
import type { Bundle } from '@es/schema/bundle'
import { canonicalJson } from '@es/sim/core/json'
import { cut, firstProblems } from './format'

export type ParseResult =
  | { readonly ok: true; readonly bundle: Bundle; readonly canonicalReceipt: string }
  | { readonly ok: false; readonly problems: readonly string[] }

/** A path in the bundle the way the grader names it: `/receipt/pins/onPin`, `/artifacts/log/data`. The names came out of a file, and are cut. */
export const pointer = (path: readonly PropertyKey[]): string => (path.length === 0 ? '(the file)' : `/${path.map((part) => cut(String(part), 40)).join('/')}`)

/** The first problems of a bundle that the schema refuses, as sentences that name the place. */
function schemaProblems(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string[] {
  return firstProblems(issues.map((issue) => `${pointer(issue.path)}: ${issue.message}`))
}

/** The message of an error that `JSON.parse` threw, cut: it can quote the text it stopped at. */
function jsonMessage(error: unknown): string {
  return cut(error instanceof Error ? error.message : String(error), 120)
}

/** Reads the text inside a file as a `bundle@1`: the document, checked by the schema, and the receipt's canonical text. */
export function parseBundle(text: string): ParseResult {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    return { ok: false, problems: [`The text inside is not JSON: ${jsonMessage(error)}.`] }
  }
  const parsed = bundleSchema.safeParse(document)
  if (!parsed.success) return { ok: false, problems: schemaProblems(parsed.error.issues) }
  const bundle = parsed.data
  try {
    return { ok: true, bundle, canonicalReceipt: canonicalJson(bundle.receipt) }
  } catch (error) {
    // A RangeError names the path ($.performance.claimed.x) and says what is wrong there; a stack that is too deep says so in its own words.
    return { ok: false, problems: [`/receipt: the receipt has no canonical form, so it cannot be identified: ${jsonMessage(error)}.`] }
  }
}
