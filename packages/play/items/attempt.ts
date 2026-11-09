/**
 * An attempt at a lesson's `item` block (ARCHITECTURE §8.2): the items it draws when it starts, the answers given to them, and the
 * result of each, as plain data that the block plays and a test can replay.
 *
 * The seeds come from outside. `startAttempt` takes one uint32 of entropy per item, which `src/items` reads from
 * `crypto.getRandomValues` when the learner starts, and `drawInBand` turns each into a seed that makes a fair question and that the
 * learner has not met. So an attempt is a function of its entropy: two attempts differ because the entropy does, nothing is looked
 * up, and the key of an item is computed from the item and stored nowhere.
 *
 * An answer is final once it is checked, as a graded level's decisions are (GAMES.md §2.3). The confidence tap rides with it, is
 * optional, and never changes the grade (ASSESSMENT §4.2).
 */
import type { Seed } from '@es/sim/core'
import { drawInBand, resolveVariant } from './draw'
import { itemRef } from './types'
import type { Confidence, Gen, Grade, Item, ItemProvenance, Level, Response, StoredAnswer } from './types'

/** What a learner has met: `<family>/<variant>#<seed>`. */
export const seenKey = (family: string, variant: string, seed: Seed): string => `${family}/${variant}#${seed}`

/** The `seenKey` of an item the ledger holds: its ref is `item:gen/<family>/<variant>`, and its seed rides on the event. */
export function seenKeyOfRef(ref: string, seed: Seed): string | null {
  const parts = /^item:gen\/([^/]+)\/([^/]+)$/.exec(ref)
  return parts === null ? null : seenKey(parts[1], parts[2], seed)
}

export interface Served {
  /** The entropy this item was drawn from. */
  readonly entropy: number
  /** The seed that was accepted: the entropy itself or a later output of its stream. */
  readonly seed: Seed
  /** Candidates tried, the accepted one included. */
  readonly tries: number
  readonly item: Item
}

export interface Answered {
  readonly response: Response
  readonly conf?: Confidence
  readonly grade: Grade
}

export interface Attempt {
  readonly family: string
  readonly level: Level
  /** How its results are stamped: `unseen` for a fresh draw, `practice` for a seed the learner chose or has seen. */
  readonly provenance: ItemProvenance
  readonly served: readonly Served[]
  /** By position in `served`: null until that item is checked. */
  readonly answered: readonly (Answered | null)[]
}

export interface StartOptions {
  /** What the learner has met (`seenKey`s). A draw skips these. */
  readonly seen?: ReadonlySet<string>
  /** Defaults to `unseen`. A `practice` attempt does not skip what was seen. */
  readonly provenance?: ItemProvenance
}

/** Starts an attempt of `entropy.length` items: one fair, unseen item for each value of entropy. */
export function startAttempt(gen: Gen, level: Level, entropy: readonly number[], options: StartOptions = {}): Attempt {
  const provenance = options.provenance ?? 'unseen'
  const met = new Set(provenance === 'unseen' ? options.seen : [])
  const served: Served[] = []
  for (const value of entropy) {
    const draw = drawInBand(gen, level, value, (candidate) => met.has(seenKey(gen.id, resolveVariant(gen, candidate, level).id, candidate)))
    const item = gen.make(draw.seed, level)
    met.add(seenKey(gen.id, item.variant, draw.seed))
    served.push({ entropy: value, seed: draw.seed, tries: draw.tries, item })
  }
  return { family: gen.id, level, provenance, served, answered: served.map(() => null) }
}

/** Grades `response` against item `index` and records it, with the confidence if one was tapped. An item is answered once. */
export function answerItem(gen: Gen, attempt: Attempt, index: number, response: Response, conf?: Confidence): Attempt {
  const served = attempt.served[index]
  if (served === undefined) throw new RangeError(`${attempt.family} has no item ${index} in this attempt`)
  if (attempt.answered[index] !== null) throw new RangeError(`item ${index} of ${attempt.family} is answered already`)
  const grade = gen.grade(served.item, response)
  const answered: Answered = { response, grade, ...(conf === undefined ? {} : { conf }) }
  return { ...attempt, answered: attempt.answered.map((existing, at) => (at === index ? answered : existing)) }
}

/** The index of the first item that is not answered yet, or null when they all are. */
export function nextUnanswered(attempt: Attempt): number | null {
  const at = attempt.answered.findIndex((answered) => answered === null)
  return at < 0 ? null : at
}

export const isDone = (attempt: Attempt): boolean => nextUnanswered(attempt) === null

export interface Tally {
  readonly total: number
  readonly answered: number
  readonly right: number
}

export function tally(attempt: Attempt): Tally {
  let answered = 0
  let right = 0
  for (const entry of attempt.answered) {
    if (entry === null) continue
    answered += 1
    if (entry.grade.ok) right += 1
  }
  return { total: attempt.served.length, answered, right }
}

/** What the ledger needs of one answered item. `src/items` turns it into an `item` event. */
export interface ItemResult {
  /** `item:gen/<family>/<variant>`. */
  readonly ref: string
  readonly rev: string
  readonly seed: Seed
  readonly level: Level
  readonly ok: boolean
  readonly score: number
  readonly provenance: ItemProvenance
  readonly conf?: Confidence
  /** The event's `data.answer`: the level, so that a replay can make the item again, and the response. */
  readonly answer: StoredAnswer
}

export function resultOf(attempt: Attempt, index: number): ItemResult {
  const served = attempt.served[index]
  const answered = attempt.answered[index]
  if (served === undefined || answered === null || answered === undefined) throw new RangeError(`item ${index} of ${attempt.family} is not answered`)
  const { item } = served
  return {
    ref: itemRef(item.family, item.variant),
    rev: item.rev,
    seed: item.seed,
    level: item.level,
    ok: answered.grade.ok,
    score: answered.grade.score,
    provenance: attempt.provenance,
    ...(answered.conf === undefined ? {} : { conf: answered.conf }),
    answer: { level: item.level, response: answered.response },
  }
}
