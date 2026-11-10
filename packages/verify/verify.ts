/**
 * The check of a receipt bundle (ARCHITECTURE §8.4, §8.5): rules 1 to 6, in order, on a file the learner chose.
 *
 *   1  caps        the file and what is inside it are no larger than the caps, counted while it is decompressed
 *   2  schema      the text is a bundle@1 and a receipt@1, strictly, after a scan of its shape that refuses a text no parser should be given (shape.ts)
 *   3  integrity   every artifact's canonical bytes hash to the receipt's entry
 *   4  binding     the token is an unexpired, unused challenge of this ledger, and the seed is the token's
 *   5  grader      the grader's version and source hash are a build this site published
 *   6  pins        the engine is the one the course pins
 *
 * The first three say whether the file is a receipt that can be read, and a file that fails one of them is `refused`: it is damaged, or
 * edited by hand, or not a bundle at all, and there is no receipt to keep, so nothing is written and no token is spent. The learner fixes
 * the file or runs the stage again. The last three say what the receipt is worth, and a receipt that fails one of them is `checked` all the
 * same: it is kept with its reasons and is `gpu-unverified`, and "never credited" (ASSESSMENT §3.2). It spends its token if it was bound,
 * because the run's seeds were seen. A rule that cannot run because an earlier one stopped the check is `skipped`.
 *
 * Rules 7 to 9 (the re-checks, the recomputation and the physics floors) run on every receipt that was read whole, whether or not rules 4 to 6 passed, and
 * leave their checks in the report with the bounds printed (evaluate.ts). Rule 10, the verdict, is `verdictOf` (verdict.ts), and it is worked out here
 * for the page to show and again when a stored report is read, so that it is never stored.
 *
 * Everything the check needs comes in as `VerifyContext`: the ledger's challenges, the published graders, the pins and the moment. This
 * package reads no ledger and no clock, so the worker that runs it, a test and a script all give it the same inputs.
 */
import type { Receipt } from '@es/schema/receipt'
import { readBundle } from './caps'
import { checkBinding } from './binding'
import type { ChallengeBook } from './binding'
import type { Atlas } from './atlas'
import type { Banks, Run, StageDeclarations } from './checks'
import { evaluate } from './evaluate'
import { grouped, plural } from './format'
import { checkGrader } from './identity'
import type { PublishedGrader } from './identity'
import { checkIntegrity } from './integrity'
import { CAPS } from './limits'
import type { Caps } from './limits'
import { checkPins } from './pins'
import type { Compatible, PinTable } from './pins'
import { RULES } from './report'
import type { RuleResult, Sizes } from './report'
import { sha256Hex } from './hashing'
import { parseBundle } from './schema'
import { verdictOf } from './verdict'
import type { Verdict } from './verdict'

export interface VerifyContext {
  /** The challenges the ledger holds, for rule 4. */
  readonly book: ChallengeBook
  /** The moment of the check, in milliseconds: rule 4's expiry reads it. */
  readonly nowMs: number
  /** The grader builds this site published, for rule 5. */
  readonly graders: readonly PublishedGrader[]
  /** The engines `course.lock.json` pins, for rule 6. */
  readonly pins: PinTable
  /** Engine versions that a lab declares compatible, for rule 6. */
  readonly compatible?: Compatible
  /** The hardware atlas, for the floors of rule 9. Empty when the site has none, and then a receipt with performance evidence fails there. */
  readonly atlas?: Atlas
  /** What each stage declares of the workload its challenge draws, for rule 8 (B1, T6, P3). A stage that is not here has those checks fail. */
  readonly stages?: StageDeclarations
  /** The reference banks of rule 7, by stage. */
  readonly banks?: Banks
  /** Smaller caps than the site's, for a test. */
  readonly caps?: Caps
}

/** A file that is not a receipt this browser can read: rule 1, 2 or 3 stopped it. Nothing is kept. */
export interface RefusedOutcome {
  readonly kind: 'refused'
  readonly rules: readonly RuleResult[]
  readonly sizes?: Partial<Sizes>
}

/** A receipt that was read whole: its rules, its identity and its verdict. Whether it passed rules 4 to 6 is in `rules`. */
export interface CheckedOutcome {
  readonly kind: 'checked'
  readonly rules: readonly RuleResult[]
  readonly sizes: Sizes
  /** The parsed receipt, as the schema read it. */
  readonly receipt: Receipt
  /** The SHA-256 of the receipt's canonical JSON: its identity, and the fragment of its page. */
  readonly receiptSha256: string
  readonly verdict: Verdict
}

export type Outcome = RefusedOutcome | CheckedOutcome

const SKIPPED = 'Not checked: an earlier rule stopped the check.'

const result = (id: RuleResult['id'], status: RuleResult['status'], summary: string, problems: readonly string[] = []): RuleResult => {
  const rule = RULES.find((entry) => entry.id === id)
  if (rule === undefined) throw new Error(`no rule is called ${id}`)
  return { rule: rule.rule, id, status, summary, problems }
}

/** Rules that did not run, from the first one that has no result yet. */
const rest = (done: readonly RuleResult[]): RuleResult[] => RULES.slice(done.length).map((entry) => result(entry.id, 'skipped', SKIPPED))

const encoder = new TextEncoder()

export async function verifyBundle(file: Blob, context: VerifyContext): Promise<Outcome> {
  const caps = context.caps ?? CAPS

  /* 1. Caps. */
  const read = await readBundle(file, caps)
  if (!read.ok) {
    const sizes = read.sizes === undefined ? {} : { sizes: read.sizes }
    // A file over a cap, or one that is not gzip, is rule 1's. Text that is not UTF-8, or starts with a byte order mark, is rule 2's, as the
    // grader's reader counts it: the caps held, and the schema is where it fails.
    if (read.rule === 1) {
      const rules = [result('caps', 'fail', read.message)]
      return { kind: 'refused', rules: [...rules, ...rest(rules)], ...sizes }
    }
    const rules = [capsPassed(read.sizes, caps), result('schema', 'fail', read.message)]
    return { kind: 'refused', rules: [...rules, ...rest(rules)], ...sizes }
  }
  const { sizes } = read
  const capsRule = capsPassed(sizes, caps)

  /* 2. Schema. */
  const parsed = parseBundle(read.text)
  if (!parsed.ok) {
    const rules = [capsRule, result('schema', 'fail', 'The file is not a bundle@1 with a receipt@1 in it.', parsed.problems)]
    return { kind: 'refused', rules: [...rules, ...rest(rules)], sizes }
  }
  const { bundle } = parsed
  const { receipt } = bundle
  const schemaRule = result('schema', 'pass', 'bundle@1 and receipt@1: every field is the schema\'s, and no other.')
  const receiptSha256 = await sha256Hex(encoder.encode(parsed.canonicalReceipt))

  /* 3. Integrity. */
  const integrity = await checkIntegrity(bundle)
  if (integrity.problems.length > 0) {
    const rules = [capsRule, schemaRule, result('integrity', 'fail', 'An artifact in the bundle is not the one the receipt lists.', integrity.problems)]
    return { kind: 'refused', rules: [...rules, ...rest(rules)], sizes }
  }
  const kept = integrity.kept === 0 ? '' : `; ${plural(integrity.kept, 'artifact')} ${integrity.kept === 1 ? 'stays' : 'stay'} with the learner, listed by hash and size only`
  const integrityRule = result('integrity', 'pass', `${plural(integrity.hashed, 'artifact')} hashed over canonical bytes, and each equals the receipt's entry${kept}.`)

  /* 4 to 6. What the receipt is worth. */
  const first = [
    capsRule,
    schemaRule,
    integrityRule,
    checkBinding(receipt, receiptSha256, context.book, context.nowMs),
    checkGrader(receipt, context.graders),
    checkPins(receipt, context.pins, { compatible: context.compatible }),
  ]

  /* 7 to 9. What the artifacts say. */
  const build = context.graders.find((entry) => entry.version === receipt.grader.version && entry.sourceSha256 === receipt.grader.sourceSha256)
  const run: Run = {
    receipt,
    artifacts: bundle.artifacts,
    atlas: context.atlas ?? [],
    declared: context.stages?.[receipt.stage],
    bank: context.banks?.[receipt.stage],
    synthetic: build?.synthetic === true,
    memo: new Map(),
  }
  const rules = [...first, ...evaluate(run)]

  /* 10. The verdict, from the results. */
  return { kind: 'checked', rules, sizes, receipt, receiptSha256, verdict: verdictOf(receipt, rules) }
}

/** Rule 1 passed: what it counted, against what the cap allows. */
function capsPassed(sizes: Partial<Sizes> | undefined, caps: Caps): RuleResult {
  const compressed = sizes?.compressedBytes
  const decompressed = sizes?.decompressedBytes
  const counted =
    compressed === undefined || decompressed === undefined
      ? 'The file is within the caps.'
      : `${grouped(compressed)} bytes compressed (at most ${grouped(caps.compressedBytes)}), ${grouped(decompressed)} bytes inside (at most ${grouped(caps.decompressedBytes)}) [estimated caps].`
  return result('caps', 'pass', counted)
}
