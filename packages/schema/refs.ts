/**
 * Identifiers and ledger refs (ARCHITECTURE §4.2 to §4.5, §7.2 and §9.6).
 *
 * This is the grammar every other schema file builds on: what a module, lesson, KC, game, lab or lock key may be called, how a
 * kernelspace ref reads, and the shape of a ledger ref. It checks form only. Whether `play:loop/close` names a game that exists
 * is for the content compiler and the game registry, which know the roster; a ledger that rejected a ref to a game it has not
 * heard of would also drop evidence that a newer build wrote.
 *
 * Every pattern uses plain groups, no named groups and no lookbehind, so `z.toJSONSchema` can export it and Python's `re`
 * reads it (D-030). No pattern is ambiguous: segments are told apart by their separators, so a string that fails costs time
 * in proportion to its length and no more. A ledger import is a file the learner chose (A§7.5), and this keeps a hostile one
 * from stalling the tab.
 */
import { z } from 'zod'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Identifiers                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Lowercase words joined by single hyphens: `hybrid-kv`, `l0-sample`, `qwen3`. */
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*'
/** Slugs joined by dots: `tr8.replay`, `vllm.async-scheduling.default`. */
const DOTTED = `${SLUG}(?:\\.${SLUG})*`
/** A module id (A§9.6): `tr0` to `tr8`, with `tr5a` and `tr5b`, and `capstone`. The compiler checks it against `course.yaml`. */
const MODULE = '(?:tr[0-8][ab]?|capstone)'
/** The module part of a KC id. The capstone's KCs begin `cap.`, as curriculum/CAPSTONE.md writes them. */
const KC_NAMESPACE = '(?:tr[0-8][ab]?|cap)'
/** A lesson id (A§4.2): the module, then `l` and the lesson's number. */
const LESSON = `${MODULE}\\.l[0-9]+`
/** A prediction's id (A§4.2): its lesson, then `p` and its number. */
const PREDICT_ID = `${LESSON}\\.p[0-9]+`
/** A KC id (A§4.5): `tr2.async-overlap`. */
const KC = `${KC_NAMESPACE}\\.${SLUG}`
/** A kernelspace lesson, as A§4.2 writes it: `ks:T5.L7`. The R track is the Rust lessons. */
const KS_LESSON = 'ks:(?:T[0-7]|R)\\.L[0-9]+'
/** A kernelspace KC: `ks:t5.kv-capacity`. The id pattern is kernelspace's own (`src/lib/kc/types.ts` at d478f91). */
const KS_KC = `ks:(?:r|t[0-7])\\.${SLUG}`
/** An item generator family (A§4.2): `tr2.bubble-width`. */
const FAMILY = `${MODULE}\\.${SLUG}`
/** The lab of a GPU or local lab, the only kind that issues challenges and receipts (A§9.6): `tr8.replay`. */
const RECEIPT_LAB = `${MODULE}\\.${SLUG}`
/** A stage of such a lab (A§9.6): `tr8.replay.s2`. */
const STAGE = `${RECEIPT_LAB}\\.s[0-9]+`
/** Any lab: a forge lab is a bare slug (`hybrid-kv`), and a GPU or local lab is module-prefixed (`tr8.replay`). */
const LAB = `(?:${RECEIPT_LAB}|${SLUG})`
/** A `course.lock.json` key (A§4.4). A key may hold a dot, as `qwen3-0.6b` does. */
const LOCK_KEY = '[a-z0-9]+(?:[.-][a-z0-9]+)*'
/** A claim's id (A§4.4): at least two dotted segments, as in `vllm.async-scheduling.default` and kernelspace's `hw.h100-sxm.hbm-bw`. */
const CLAIM_ID = `${SLUG}(?:\\.${SLUG})+`

function pattern(source: string, message: string) {
  return z.string().regex(new RegExp(`^${source}$`), message)
}

export const slugSchema = pattern(SLUG, 'must be lowercase words joined by hyphens, such as hybrid-kv')
export const dottedIdSchema = pattern(DOTTED, 'must be lowercase words joined by dots and hyphens, such as tr8.replay')
export const moduleIdSchema = pattern(MODULE, 'must be a module id such as tr2, tr5a or capstone')
export const lessonIdSchema = pattern(LESSON, 'must be a lesson id such as tr2.l3')
export const predictIdSchema = pattern(PREDICT_ID, 'must be a prediction id such as tr2.l3.p1')
export const kcIdSchema = pattern(KC, 'must be a KC id such as tr2.async-overlap')
/** A KC an edge may name: one of ours, or one of kernelspace's. */
export const kcRefSchema = pattern(`(?:${KC}|${KS_KC})`, 'must be a KC id such as tr2.async-overlap, or a kernelspace KC such as ks:t5.kv-capacity')
/** A kernelspace lesson or KC, as `builds_on` and `{{ks:…}}` write it. */
export const ksRefSchema = pattern(`(?:${KS_LESSON}|${KS_KC})`, 'must be a kernelspace ref such as ks:T5.L7 or ks:t5.kv-capacity')
/** What a module lists as a prerequisite: a kernelspace ref, or another module (A§4.2). */
export const prereqSchema = pattern(`(?:${MODULE}|${KS_LESSON}|${KS_KC})`, 'must be a module id or a kernelspace ref such as ks:T5.L7')
export const gameIdSchema = pattern(SLUG, 'must be a game id such as loop or broken-bench')
export const levelIdSchema = pattern(SLUG, 'must be a level id such as async or load-or-recompute')
export const familyIdSchema = pattern(FAMILY, 'must be a generator family id such as tr2.bubble-width')
export const labIdSchema = pattern(LAB, 'must be a lab id such as hybrid-kv or tr8.replay')
export const receiptLabIdSchema = pattern(RECEIPT_LAB, 'must be a module-prefixed lab id such as tr8.replay')
export const stageIdSchema = pattern(STAGE, 'must be a stage id such as tr8.replay.s2')
export const lockKeySchema = pattern(LOCK_KEY, 'must be a lock key such as vllm or qwen3-0.6b')
export const claimIdSchema = pattern(CLAIM_ID, 'must be a claim id of dotted words, such as vllm.async-scheduling.default')

/** The lab a stage belongs to: `tr8.replay.s2` is a stage of `tr8.replay`. */
export const labOfStage = (stage: string): string => stage.slice(0, stage.lastIndexOf('.'))

/** The module a KC belongs to: `tr2.async-overlap` is `tr2`, and the capstone's KCs begin `cap.` (curriculum/CAPSTONE.md). */
export function moduleOfKc(kc: string): string {
  const dot = kc.indexOf('.')
  const head = dot < 0 ? kc : kc.slice(0, dot)
  return head === 'cap' ? 'capstone' : head
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Ledger refs                                                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The ref of each kind of ledger event: the nine forms of A§4.5, and the two that an `ack` takes (A§7.2). Each form is one
 * prefix, then ids in the grammar above.
 */
export const REF_KINDS = ['item', 'play', 'lab', 'trace', 'challenge', 'receipt', 'prove', 'predict', 'review', 'screen', 'change'] as const
export type RefKind = (typeof REF_KINDS)[number]

/** A ref taken apart. `formatRef` puts it back together, so `formatRef(parseRef(ref))` is `ref`. */
export type ParsedRef =
  | { kind: 'item'; family: string; variant: string }
  | { kind: 'play'; game: string; level: string }
  | { kind: 'lab'; lab: string }
  | { kind: 'trace'; trace: string; task: string }
  | { kind: 'challenge'; stage: string }
  | { kind: 'receipt'; stage: string }
  | { kind: 'prove'; lab: string }
  | { kind: 'predict'; lesson: string; id: string }
  | { kind: 'review'; kc: string }
  | { kind: 'screen'; id: string }
  | { kind: 'change'; id: string }

/** The regex source of each form. The capture groups, in order, are the fields of `ParsedRef`. */
const FORMS: Record<RefKind, string> = {
  item: `item:gen/(${FAMILY})/(${SLUG})`,
  play: `play:(${SLUG})/(${SLUG})`,
  lab: `lab:(${LAB})`,
  trace: `trace:(${SLUG})/(${SLUG})`,
  challenge: `challenge:(${STAGE})`,
  receipt: `receipt:(${STAGE})`,
  prove: `prove:(${LAB})`,
  predict: `predict:(${LESSON})#(${DOTTED})`,
  review: `review:(${KC})`,
  screen: `screen:(${SLUG})`,
  change: `change:(${SLUG})`,
}

const MATCHERS = Object.fromEntries(REF_KINDS.map((kind) => [kind, new RegExp(`^${FORMS[kind]}$`)])) as Record<RefKind, RegExp>

/** Takes a ref apart, or returns null when it is not one. */
export function parseRef(ref: string): ParsedRef | null {
  const kind = REF_KINDS.find((candidate) => ref.startsWith(`${candidate}:`))
  if (kind === undefined) return null
  const m = MATCHERS[kind].exec(ref)
  if (m === null) return null
  switch (kind) {
    case 'item':
      return { kind, family: m[1], variant: m[2] }
    case 'play':
      return { kind, game: m[1], level: m[2] }
    case 'lab':
    case 'prove':
      return { kind, lab: m[1] }
    case 'trace':
      return { kind, trace: m[1], task: m[2] }
    case 'challenge':
    case 'receipt':
      return { kind, stage: m[1] }
    case 'predict':
      return { kind, lesson: m[1], id: m[2] }
    case 'review':
      return { kind, kc: m[1] }
    case 'screen':
    case 'change':
      return { kind, id: m[1] }
  }
}

/** The module an id of the form `<module>.<rest>` begins with, or null. */
function moduleIn(id: string): string | null {
  const dot = id.indexOf('.')
  if (dot < 0) return null
  const head = id.slice(0, dot)
  return moduleIdSchema.safeParse(head).success ? head : null
}

/**
 * The module a ref belongs to, or null when it names none (ARCHITECTURE §4.5, §7.2). An event names its module through its ref, where
 * the ref says one:
 *
 *   predict:<lesson>#<id>        the lesson's module            `tr2.l3` is tr2
 *   item:gen/<family>/<variant>  the family's module            `tr2.bubble-width` is tr2
 *   lab:<lab>, prove:<lab>       the lab's module, when it has one; a forge lab is a bare slug and names none
 *   challenge:/receipt:<stage>   the stage's module             `tr8.replay.s2` is tr8
 *   review:<kc>                  the KC's module                `cap.` KCs are the capstone's
 *   play:<game>/<level>          the game's home module, the first its registry entry lists: `gameModule` gives it, because the
 *                                registry is not this package's. A game that serves several modules (`loop` serves tr2 and tr6)
 *                                counts under its home until a level can name its own.
 *   trace:, screen:, change:     none: a trace belongs to every module that reads it, and an acknowledgement to the site
 */
export function moduleOfRef(ref: string, gameModule: (game: string) => string | undefined): string | null {
  const parsed = parseRef(ref)
  if (parsed === null) return null
  switch (parsed.kind) {
    case 'predict':
      return moduleIn(parsed.lesson)
    case 'item':
      return moduleIn(parsed.family)
    case 'play':
      return gameModule(parsed.game) ?? null
    case 'lab':
    case 'prove':
      return moduleIn(parsed.lab)
    case 'challenge':
    case 'receipt':
      return moduleIn(parsed.stage)
    case 'review':
      return parsed.kc.startsWith('cap.') ? 'capstone' : moduleIn(parsed.kc)
    case 'trace':
    case 'screen':
    case 'change':
      return null
  }
}

/** Puts a parsed ref back into its written form. */
export function formatRef(ref: ParsedRef): string {
  switch (ref.kind) {
    case 'item':
      return `item:gen/${ref.family}/${ref.variant}`
    case 'play':
      return `play:${ref.game}/${ref.level}`
    case 'lab':
      return `lab:${ref.lab}`
    case 'trace':
      return `trace:${ref.trace}/${ref.task}`
    case 'challenge':
      return `challenge:${ref.stage}`
    case 'receipt':
      return `receipt:${ref.stage}`
    case 'prove':
      return `prove:${ref.lab}`
    case 'predict':
      return `predict:${ref.lesson}#${ref.id}`
    case 'review':
      return `review:${ref.kc}`
    case 'screen':
      return `screen:${ref.id}`
    case 'change':
      return `change:${ref.id}`
  }
}

/** A string in any one of the forms. `parseRef` says which, and takes it apart. */
export const refSchema = z
  .string()
  .regex(new RegExp(`^(?:${REF_KINDS.map((kind) => FORMS[kind]).join('|')})$`), 'must be a ledger ref such as play:loop/close (ARCHITECTURE §4.5)')
