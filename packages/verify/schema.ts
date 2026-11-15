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
 * Before any of that, the text is looked at once for its shape (shape.ts): a file that nests deeper than a bundle can, or holds more arrays, objects and
 * strings than a bundle can, is refused here and never parsed, because rule 1 bounds the bytes of the text and not what `JSON.parse` allocates for them.
 *
 * The receipt is also held to the ledger's length before its canonical form is made (`fitsChars`), and the canonical form builds the path of a value only when it throws.
 *
 * Nothing here trusts the file's own idea of itself. A `schema` tag that is not `enginespace/bundle@1` is a problem, and so is a bundle
 * from a newer format: the site reads the formats it knows and says which one it did not recognise.
 */
import { bundleSchema } from '@es/schema/bundle'
import type { Bundle } from '@es/schema/bundle'
import { canonicalJson } from '@es/sim/core/json'
import { cut, firstProblems, grouped } from './format'
import { RECEIPT_CHARS, SHAPE } from './limits'
import type { Shape } from './limits'
import { scanShape } from './shape'

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

/**
 * Whether a value is no longer than `limit` characters as JSON, counted as the walk goes, which stops at the first excess: a hostile value costs no more than the limit.
 * The count is a close one and not the canonical text's (a string counts its length and two quotes, an escape as one character), and it is only used to refuse a receipt
 * that the ledger would refuse. Its depth is the shape scan's.
 */
function fitsChars(value: unknown, limit: number): boolean {
  let chars = 0
  const walk = (item: unknown): boolean => {
    if (typeof item === 'string') chars += item.length + 2
    else if (typeof item === 'number') chars += String(item).length
    else if (typeof item === 'boolean') chars += 5
    else if (item === null) chars += 4
    else if (Array.isArray(item)) {
      chars += 2
      for (const member of item) {
        chars += 1
        if (chars > limit || !walk(member)) return false
      }
    } else if (typeof item === 'object') {
      chars += 2
      for (const [key, member] of Object.entries(item)) {
        chars += key.length + 4
        if (chars > limit || !walk(member)) return false
      }
    }
    return chars <= limit
  }
  return walk(value)
}

/**
 * Reads the text inside a file as a `bundle@1`: the document, checked by the schema, and the receipt's canonical text. The shape of the text is held to
 * `shape` first, the site's bounds unless a test asks for smaller ones, and a text that is outside them is not parsed.
 */
export function parseBundle(text: string, shape: Shape = SHAPE): ParseResult {
  const looked = scanShape(text, shape)
  if (!looked.ok) return { ok: false, problems: [looked.message] }
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    return { ok: false, problems: [`The text inside is not JSON: ${jsonMessage(error)}.`] }
  }
  const parsed = bundleSchema.safeParse(document)
  if (!parsed.success) return { ok: false, problems: schemaProblems(parsed.error.issues) }
  const bundle = parsed.data
  if (!fitsChars(bundle.receipt, RECEIPT_CHARS)) {
    return { ok: false, problems: [`/receipt: the receipt is longer than ${grouped(RECEIPT_CHARS)} characters as JSON, which is the most the site keeps of one, so it was not read further.`] }
  }
  try {
    return { ok: true, bundle, canonicalReceipt: canonicalJson(bundle.receipt) }
  } catch (error) {
    // A RangeError names the path ($.performance.claimed.x) and says what is wrong there. (A text nested too deeply for the stack never gets this far: the shape scan refuses it.)
    return { ok: false, problems: [`/receipt: the receipt has no canonical form, so it cannot be identified: ${jsonMessage(error)}.`] }
  }
}
