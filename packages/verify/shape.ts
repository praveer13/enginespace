/**
 * Rule 2's first look at the text (ARCHITECTURE §8.5, D-029): its shape, before `JSON.parse` builds anything from it.
 *
 * Rule 1 bounds the bytes of a bundle, and bytes are not what a parser costs. The text of a file inside the caps can make a parser allocate a hundred
 * times its length: `[[[[` a hundred million deep, or `[],[],[],` for a quarter of a gigabyte, is a heap object for every few bytes, and a dedicated worker
 * that runs out of memory takes the learner's whole tab with it. In Chrome for Testing 153.0.8010.12, the headless shell that Playwright 1.63.0 pins
 * [measured 2026-11-10], importing 200 MB of nested brackets crashed the tab in 4.1 s. `JSON.parse` of 250 MB of `[],` took 25 s and a peak of 5.1 GB resident,
 * and of `{},` 26 s and 6.1 GB, on a host with 31 GB, where it survived; the review of W2's grader track saw both crash the tab on its own host. So the text is
 * scanned once first, and a file that nests deeper than a bundle can, or holds more arrays, objects and strings than a bundle can, is refused at rule 2 and
 * never parsed.
 *
 * What the scan counts, and why those:
 *   depth  the arrays and objects open at once. A bundle nests 6 or 7 deep (`/receipt/performance/claimed/<id>/latency/ttftFromDue/p99Us`), and the
 *          parser's own stack, the schema check and the canonical text of the receipt all grow with it.
 *   nodes  the arrays and objects, and the strings with the names of members among them. Each is a heap object: about 60 to 65 bytes for an empty array or
 *          object, and about 210 for a member name that nothing else shares [measured 2026-11-10, the same Chromium, from the peak resident memory of
 *          `JSON.parse` on 60 MB of each]. A number in a column costs 4 to 8 bytes (131 million of them, 250 MB of `0,`, parsed in 0.8 s [measured
 *          2026-11-10, the same Chromium]), so numbers, `true`, `false` and `null` are not nodes. A bundle's evidence is columns of them (bench-log@1,
 *          trace@1, identity@1, acceptance@1, argmax@1), and it holds few nodes beside its bytes: tests/verify/shape.test.ts holds the fixtures to that.
 *   commas the commas outside strings. Not a node, but the next stage costs one per value: the canonical form of the receipt, and of each JSON artifact for its
 *          hash (rule 3), makes a string for every value and joins them. A file of 250 MB of `-0,` (87 million numbers, 254,873 B compressed) parsed in seconds
 *          and then crashed the tab in the canonical form, after 22 s and a peak of 4.17 GB, while 25.5 million distinct 9-digit integers (255 MB) survived at 2.97 GB
 *          [measured in 2026-11 by the second review of W2's grader track, the same Chromium, build 727167e]. A value is the first of its container or follows a comma, so
 *          the commas, with the nodes, bound every value; the bound is 16 Mi. (Nor is the shape the whole of it: a list of millions of `{}` inside these bounds still makes zod build an issue for each, so rule 2 counts the schema's lists next, schema.ts.) (The receipt itself is also held to the ledger's size before its canonical form is made:
 *          schema.ts.)
 *
 * What the scan does not count is the length of a string: a string is one node whatever its length, and a file inside the caps can hold one of 250 MiB. Its cost is the canonical form's, which writes a string longer
 * than 1 Mi characters in pieces (packages/sim/core/json.ts), because `JSON.stringify` of a parsed string over 2^27 characters that holds one outside Latin-1 crashed the pinned Chromium's renderer in rule 3 [measured
 * 2026-11-15 by the second review of W2's rest track, build ff47e8f]. No bound on a string's length is needed, and none is held in the grader's writer.
 *
 * It is a scan and not a parse. It finds the strings by their quotes and their backslashes, skips what is inside them, and counts the brackets that are
 * left. It does not judge whether the text is JSON, which `JSON.parse` does next on a text that has passed. That is sound as a bound for any text, valid
 * or not: `JSON.parse` stops at the first byte that is not JSON, so what it can build is what lies before that byte, and there the scan sees the same
 * strings and the same brackets as the parser does. A closing bracket with nothing open is ignored here, and the parser stops at it.
 *
 * The grader's reader holds the same bounds and counts the same way (labs/grader/src/enginespace_grader/bundle.py, `ShapeScan`), and its writer refuses to
 * write a bundle that this rule would refuse. tests/fixtures/grader/shape-cases.json is judged by both ends.
 */
import { grouped } from './format'
import { SHAPE } from './limits'
import type { Shape } from './limits'

/** Which bound a text broke. */
export type ShapeReason = 'depth' | 'nodes' | 'commas'

export type ShapeResult =
  | { readonly ok: true; readonly deepest: number; readonly nodes: number; readonly commas: number }
  | { readonly ok: false; readonly reason: ShapeReason; readonly message: string }

const QUOTE = 0x22 // "
const BACKSLASH = 0x5c // \
const OPEN_ARRAY = 0x5b // [
const CLOSE_ARRAY = 0x5d // ]
const OPEN_OBJECT = 0x7b // {
const CLOSE_OBJECT = 0x7d // }
const COMMA = 0x2c // ,

/**
 * Where the string that opens at `open` ends: the index of its closing quote, or the text's length when it has none (an unterminated string takes the rest of
 * the text, as the parser reads it). A quote is escaped when an odd number of backslashes come right before it.
 */
function endOfString(text: string, open: number): number {
  let from = open + 1
  for (;;) {
    const close = text.indexOf('"', from)
    if (close === -1) return text.length
    let slashes = 0
    while (text.charCodeAt(close - 1 - slashes) === BACKSLASH) slashes += 1
    if (slashes % 2 === 0) return close
    from = close + 1
  }
}

const tooDeep = (shape: Shape): ShapeResult => ({
  ok: false,
  reason: 'depth',
  message: `The JSON inside nests more than ${grouped(shape.depth)} levels deep, and the site parses at most that [estimated]: a bundle nests about 7. It was not parsed, because the parser's memory grows with the depth.`,
})

const tooMany = (shape: Shape): ShapeResult => ({
  ok: false,
  reason: 'nodes',
  message: `The JSON inside holds more than ${grouped(shape.nodes)} arrays, objects and strings (member names included), and the site parses at most that many [estimated]. It was not parsed, because the parser's memory grows with their number.`,
})

const tooManyValues = (shape: Shape): ShapeResult => ({
  ok: false,
  reason: 'commas',
  message: `The JSON inside holds more than ${grouped(shape.commas)} commas outside its strings, so more than that many numbers, true, false, null and other values, and the site reads at most that many [estimated]. It was not read, because the canonical form of what it holds grows with their number.`,
})

/**
 * Looks at the shape of a JSON text and says whether it is within `shape`. Linear in the text, with nothing allocated beyond a few counters, and it stops at the
 * first bound that is passed.
 */
export function scanShape(text: string, shape: Shape = SHAPE): ShapeResult {
  let depth = 0
  let deepest = 0
  let nodes = 0
  let commas = 0
  const length = text.length
  for (let at = 0; at < length; at += 1) {
    const code = text.charCodeAt(at)
    if (code === QUOTE) {
      nodes += 1
      if (nodes > shape.nodes) return tooMany(shape)
      at = endOfString(text, at)
    } else if (code === OPEN_ARRAY || code === OPEN_OBJECT) {
      depth += 1
      nodes += 1
      if (depth > shape.depth) return tooDeep(shape)
      if (nodes > shape.nodes) return tooMany(shape)
      if (depth > deepest) deepest = depth
    } else if (code === CLOSE_ARRAY || code === CLOSE_OBJECT) {
      if (depth > 0) depth -= 1
    } else if (code === COMMA) {
      commas += 1
      if (commas > shape.commas) return tooManyValues(shape)
    }
  }
  return { ok: true, deepest, nodes, commas }
}
