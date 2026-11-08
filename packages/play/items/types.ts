/**
 * The item framework's vocabulary (ARCHITECTURE §8.2, ASSESSMENT §4.1 and §4.2, W1-T04).
 *
 * An item is one question drawn from a generator family on a seed. A family is a pure `Gen`: given a seed and a level it builds
 * the same `Item` in Bun, in every browser and in a later replay, and it grades a response against a key that it computes from
 * that item alone. The seed is drawn when an attempt starts (`src/items`), `band` throws out the draws that make a poor question,
 * and nothing about the key is stored: the ledger keeps the seed and the answer, and grading runs again from them.
 *
 * This file is types and a few constants, so importing it costs a bundle nothing. Like the rest of packages/play it is pure
 * (D-017): no DOM, no clock and no entropy.
 */
import type { Seed } from '@es/sim/core'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Levels                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * kernelspace's K1 fading levels, which an `item` block names (packages/schema `level`, 0 to 3): 0 is a worked example whose last
 * step the learner completes, 1 blanks one middle step, 2 is the skill on its own, and 3 carries it to a changed surface.
 */
export const LEVELS = [0, 1, 2, 3] as const
export type Level = (typeof LEVELS)[number]

export function isLevel(value: unknown): value is Level {
  return typeof value === 'number' && (LEVELS as readonly number[]).includes(value)
}

/** What each level is called on screen. */
export const LEVEL_NAMES: Readonly<Record<Level, string>> = {
  0: 'worked example',
  1: 'faded',
  2: 'on your own',
  3: 'new surface',
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Text: parts, so that no number is bare                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

/** How a number is known (ARCHITECTURE §4.4's four tags, and `synthetic` for the course's invented worlds). */
export const ITEM_TAGS = ['measured', 'derived', 'estimated', 'unverified', 'synthetic'] as const
export type ItemTag = (typeof ITEM_TAGS)[number]

/**
 * One run of what a learner reads. A number is its own part and carries its tag, so the page can print it in the dot matrix with
 * its provenance beside it (DESIGN.md, "The Dots For Numbers Rule") and the gate can refuse a digit that hides in a sentence.
 */
export type Part =
  | { readonly t: 'text'; readonly text: string }
  | {
      readonly t: 'num'
      readonly value: number
      readonly tag: ItemTag
      /** The unit printed after it, written as the readout writes it: `µs`, `ms`, `tokens`, `x`. */
      readonly unit?: string
      /** Digits after the point. Default 0. */
      readonly digits?: number
    }
  | { readonly t: 'code'; readonly code: string }

export type NumPart = Extract<Part, { readonly t: 'num' }>

/** Text made of parts: a sentence, an option, a reason. */
export type Rich = readonly Part[]

/* ------------------------------------------------------------------------------------------------------------------ */
/* The item                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A scenario number shown beside the question, as a printed line: a label and its value. */
export interface Given {
  readonly label: string
  readonly value: Part
}

/** One step of a worked solution: what is done, and the number it comes to. */
export interface Step {
  readonly text: Rich
  readonly result?: NumPart
}

/** Relative tolerance (0.02 is 2 %), absolute tolerance, or both: a response within either is right. Neither means exact. */
export interface Tolerance {
  readonly rel?: number
  readonly abs?: number
}

/**
 * One option of a choice. Its `id` is stable inside the item and is what is graded, never the position it is shown in. `why` is
 * what a learner reads on the reveal, whether the option is right or not: a right option says why it is, and a wrong one names
 * the misconception it encodes (`miss`).
 */
export interface ChoiceOption {
  readonly id: string
  readonly text: Rich
  readonly why: Rich
  /** A misconception id, `<family>.<slug>`, on an option that is a lure. */
  readonly miss?: string
}

export type AnswerSpec =
  /** A number, graded within `tolerance` of `truth`, in `unit`. The key sits here because the item is made on a seed drawn at the attempt's start: unseen, and not secret. */
  | {
      readonly kind: 'numeric'
      /** What the answer slip says it is: `idle per step`. */
      readonly label: string
      readonly unit: string
      readonly truth: number
      readonly tolerance: Tolerance
      /** Digits after the point in the key as it is printed. Default 0. */
      readonly digits?: number
    }
  /** One option of a few, graded by id. `make` returns the options already shuffled by the seed, so the order is part of the item. */
  | {
      readonly kind: 'choice'
      readonly label: string
      readonly options: readonly ChoiceOption[]
      readonly correct: string
    }

/** An item's parameters: JSON-safe scalars, what the item is a function of. The fingerprint and the replay both depend on them. */
export type Params = Readonly<Record<string, number | string | boolean>>

export interface Item {
  /** The family's id, `tr2.bubble-width`. */
  readonly family: string
  /** The family's `version` when this was made; part of the fingerprint. */
  readonly version: number
  /** Which of the family's variants this is: a slug, and the last part of the ledger ref `item:gen/<family>/<variant>`. */
  readonly variant: string
  readonly level: Level
  readonly seed: Seed
  readonly kcs: readonly string[]
  /** The question. */
  readonly stem: Rich
  /** The scenario's numbers, printed as lines under the question. */
  readonly givens: readonly Given[]
  /** Steps shown before the question is asked, at levels 0 and 1. */
  readonly worked: readonly Step[]
  readonly answer: AnswerSpec
  readonly params: Params
  /** `itemRev`: eight hex digits over the family, version, variant, level and params. A changed question reads as a new item. */
  readonly rev: string
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Responses and grades                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

export type Response =
  | { readonly kind: 'numeric'; readonly value: number }
  | { readonly kind: 'choice'; readonly pick: string }

/** A wrong answer that a rule recognised: a misconception id, `<family>.<slug>`, and one sentence that says what the learner did. */
export interface Diagnosis {
  readonly id: string
  readonly message: Rich
}

export interface Grade {
  readonly ok: boolean
  /** In [0, 1]. Exact and right is 1, anything else 0: this edition scores no partial credit. */
  readonly score: number
  /** One or two sentences: the verdict, then the key. Never the whole solution (that is `Gen.solution`). */
  readonly feedback: Rich
  readonly diagnosis?: Diagnosis
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Confidence and provenance                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The tap before an answer is checked (A§7.2, ASSESSMENT §4.2). packages/ledger's `CONFIDENCES` is the same list, and a test keeps them equal. */
export const CONFIDENCES = ['guess', 'think', 'sure'] as const
export type Confidence = (typeof CONFIDENCES)[number]

/** What each tap says on screen. */
export const CONFIDENCE_NAMES: Readonly<Record<Confidence, string>> = {
  guess: 'guess',
  think: 'think so',
  sure: 'sure',
}

/**
 * How a result earned its place (ASSESSMENT §3.2), for the two ways an item can be answered here: `unseen` on a seed drawn when
 * the attempt started and not met before, and `practice` on a seed already seen. Both are names of packages/ledger's `Provenance`.
 */
export type ItemProvenance = 'unseen' | 'practice'

/* ------------------------------------------------------------------------------------------------------------------ */
/* Families                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A variant of a family: one kind of question, the KCs it assesses and the levels it is offered at. */
export interface VariantSpec {
  /** A slug (`async-off`), which the ledger ref carries. */
  readonly id: string
  readonly title: string
  readonly kcs: readonly string[]
  readonly levels: readonly Level[]
}

/**
 * A strategy that answers without reading the scene (ASSESSMENT §4.1): always the same number, always the longest option, "everything
 * on". It names a *set* of answers, from which a blind learner picks one at random, so a tie costs the strategy its share.
 */
export interface BlindStrategy {
  readonly id: string
  /** What it does, in a sentence, for the gate's report. */
  readonly describe: string
  /** The answers it would pick among for this item, or null when it has none. */
  answers(item: Item): readonly Response[] | null
}

/**
 * A generator family (ARCHITECTURE §8.2, kernelspace's K1). `make`, `band`, `grade` and `solution` are pure: no `Math.random`, no
 * `Date`, no DOM and no network. Scenario numbers are synthetic grids declared in the family, and a number about a real engine
 * is a claim (§4.4), so a family that needs one waits for the claim.
 */
export interface Gen {
  /** `tr2.bubble-width`: a module and a slug (packages/schema's `familyIdSchema`). */
  readonly id: string
  /** Bump it when a change moves what a seed means, and rewrite the golden vectors (`bun scripts/verify-items.ts --write`). */
  readonly version: number
  readonly title: string
  /** The union of the variants' KCs. */
  readonly kcs: readonly string[]
  readonly variants: readonly VariantSpec[]
  /**
   * The item for `seed` at `level`: deterministic, so the same two give a deep-equal item in every runtime. The seed picks the
   * variant unless one is named. It is total: a seed that `band` refuses still makes an item, only a poor one.
   */
  make(seed: Seed, level: Level, variant?: string): Item
  /** Whether `seed` makes a fair question at `level`: the draw tries again when it does not (ARCHITECTURE §8.2). */
  band(seed: Seed, level: Level): boolean
  /** The response against the item's key. */
  grade(item: Item, response: Response): Grade
  /** The worked solution, shown after the reveal: every step, ending in the key. */
  solution(item: Item): readonly Step[]
  /** The strategies of this family's own that the gate holds to the bound, beside the generic ones. */
  readonly blind?: readonly BlindStrategy[]
}

/**
 * A family's face: what a page shows of it and plans with before its code is loaded (D-059). Today composes a prep from the faces, and an
 * item block shows its waiting ticket from one; `make`, `band`, `grade` and `solution` load when an item is drawn. catalog.ts holds every
 * family's, in the registry's order.
 */
export type GenFace = Pick<Gen, 'id' | 'version' | 'title' | 'kcs' | 'variants'>

/** The ledger ref of an item's events (ARCHITECTURE §4.5). */
export const itemRef = (family: string, variant: string): string => `item:gen/${family}/${variant}`

/** What the ledger keeps of an answer (`item` events carry free JSON in `data.answer`): the level it was made at, and the response. */
export interface StoredAnswer {
  readonly level: Level
  readonly response: Response
}
