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
 * Then the lists are counted before the schema sees them (`overlong`): zod parses every entry of a list before it applies the list's own `.max`, and makes an issue for each
 * invalid entry and each missing key, so a list of millions of `{}` or `0` inside the shape bounds costs tens of millions of issues, a RangeError, or the tab. A list or an
 * object that is longer than the schema's own bound is refused at rule 2 naming it, and a throw from the schema is a refusal and not the check breaking.
 *
 * The receipt is also held to the ledger's length before its canonical form is made (`fitsChars`), and the canonical form builds the path of a value only when it throws.
 *
 * Nothing here trusts the file's own idea of itself. A `schema` tag that is not `enginespace/bundle@1` is a problem, and so is a bundle
 * from a newer format: the site reads the formats it knows and says which one it did not recognise.
 */
import { bundleSchema } from '@es/schema/bundle'
import type { Bundle } from '@es/schema/bundle'
import { RECEIPT_LIMITS } from '@es/schema/receipt'
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

/** The lists of a receipt that the schema bounds, by their place, and the keys of `envVars` and of the bundle's artifacts, which it bounds too. */
const LISTS: readonly (readonly [readonly string[], number, boolean])[] = [
  [['receipt', 'environment', 'gpus'], RECEIPT_LIMITS.gpus, false],
  [['receipt', 'environment', 'libs'], RECEIPT_LIMITS.libs, false],
  [['receipt', 'pins', 'offPin'], RECEIPT_LIMITS.offPin, false],
  [['receipt', 'environment', 'envVars'], RECEIPT_LIMITS.envVars, true],
  [['receipt', 'inputs'], RECEIPT_LIMITS.inputs, false],
  [['receipt', 'artifacts'], RECEIPT_LIMITS.artifacts, false],
  [['receipt', 'checks'], RECEIPT_LIMITS.checks, false],
  [['artifacts'], RECEIPT_LIMITS.artifacts, true],
]

/** The first list (or object of keys) in the document that is longer than the schema allows, as a sentence, or undefined. Looks at each place only by its length, so it costs nothing. */
function overlong(document: unknown): string | undefined {
  for (const [path, limit, keyed] of LISTS) {
    let at: unknown = document
    for (const part of path) {
      if (at === null || typeof at !== 'object' || Array.isArray(at)) {
        at = undefined
        break
      }
      at = Object.hasOwn(at, part) ? (at as Record<string, unknown>)[part] : undefined
    }
    if (at === null || typeof at !== 'object') continue
    // `Object.keys` of an object of millions of keys is itself a list of millions, so the keys are counted by a walk that stops at the first excess.
    let count = 0
    if (Array.isArray(at)) count = at.length
    else if (keyed) {
      for (const key in at) {
        if (Object.hasOwn(at, key) && ++count > limit) break
      }
    }
    if (count > limit) return `/${path.join('/')}: holds more than the ${limit} ${keyed ? 'keys' : 'entries'} that it may, so the file was not read further.`
  }
  return undefined
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
  const excess = overlong(document)
  if (excess !== undefined) return { ok: false, problems: [excess] }
  let parsed: ReturnType<typeof bundleSchema.safeParse>
  try {
    parsed = bundleSchema.safeParse(document)
  } catch (error) {
    // A file that makes the schema throw (a RangeError from a million issues) is a file the schema refuses, and the check has not broken.
    return { ok: false, problems: [`The text inside is not a bundle@1: the schema could not be applied to it (${jsonMessage(error)}).`] }
  }
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
