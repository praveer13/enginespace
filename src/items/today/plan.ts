/*
 * What the page shows before anything is started, and what it knows after: pure functions of the deck, with no React in them, so that
 * a test can hold the page's decisions to a table (tests/today/plan.test.ts).
 *
 *   empty   no idea has been earned, or none that is earned has a ticket built yet. Today keeps what is earned (ARCHITECTURE §3.1).
 *   list    something is due and can be served: the prep list, with the session it would start.
 *   rest    nothing is due that can be served. It says when the next prep is, and offers a review ahead if there is anything to look at.
 */
import type { LocalDay } from '@es/ledger'
import { FAMILIES } from '@es/play/items'
import type { Gen } from '@es/play/items'
import { addDays, daysBetween } from './days'
import { levelFor } from './draw'
import { afterReview, intervalOf } from './fsrs'
import type { Rating } from './fsrs'
import type { Card, CardSet } from './cards'
import { composeSession } from './session'
import type { Line, Session } from './session'

export type Plan =
  /** No idea is earned yet. */
  | { readonly kind: 'empty' }
  /** Ideas are earned, and no family can serve any of them yet: their games have no graded items built. */
  | { readonly kind: 'unserved' }
  | { readonly kind: 'list'; readonly session: Session }
  | { readonly kind: 'rest'; readonly next: LocalDay | null; readonly ahead: Session }

/** Whether any family can serve an idea yet. An idea earned in a game whose items are not built has a card and no ticket. */
export const servable = (card: Pick<Card, 'kc' | 'memory'>, families: readonly Gen[] = FAMILIES): boolean => levelFor(card, families) !== null

/** The first day after `today` on which an idea that can be served falls due, or null. */
export function nextServableDay(set: CardSet, today: LocalDay, families: readonly Gen[] = FAMILIES): LocalDay | null {
  let next: LocalDay | null = null
  for (const card of set.cards.values()) {
    if (card.dueDay > today && servable(card, families) && (next === null || card.dueDay < next)) next = card.dueDay
  }
  return next
}

export function planFor(set: CardSet, today: LocalDay, options: { families?: readonly Gen[]; groupOf?: ReadonlyMap<string, string> } = {}): Plan {
  const families = options.families ?? FAMILIES
  if (set.cards.size === 0) return { kind: 'empty' }
  if (![...set.cards.values()].some((card) => servable(card, families))) return { kind: 'unserved' }
  const shared = { families, ...(options.groupOf === undefined ? {} : { groupOf: options.groupOf }) }
  const session = composeSession(set, today, shared)
  if (session.lines.length > 0) return { kind: 'list', session }
  return { kind: 'rest', next: nextServableDay(set, today, families), ahead: composeSession(set, today, { ...shared, ahead: true }) }
}

/** One checked ticket of a session. */
export interface Result {
  readonly line: Line
  readonly ok: boolean
  readonly grade: Rating
  /** The day the idea falls due again, as the model schedules it from this answer. */
  readonly back: LocalDay
  /** The item's `seenKey`, so the next ticket of the session cannot be the same one. */
  readonly key: string
}

/**
 * The day an idea comes back after a review on `today` graded `grade`: the model's next interval from the card as it stood. An idea
 * with no card (it cannot happen on the page, but an import could take it away) comes back tomorrow.
 */
export function returnDay(card: Pick<Card, 'memory' | 'lastDay'> | undefined, today: LocalDay, grade: Rating): LocalDay {
  if (card === undefined) return addDays(today, 1)
  const memory = afterReview(card.memory, Math.max(0, daysBetween(card.lastDay, today)), grade)
  return addDays(today, intervalOf(memory))
}

export interface Tally {
  readonly total: number
  readonly right: number
}

export function tally(results: readonly Pick<Result, 'ok'>[]): Tally {
  return { total: results.length, right: results.filter((result) => result.ok).length }
}

export type LineState = 'waiting' | 'now' | 'done'

/** A line of the prep list as it is drawn: the idea, its title, where it stands, and once it is done what became of it. */
export interface LineView {
  readonly kc: string
  readonly title: string
  readonly state: LineState
  readonly ok?: boolean
  readonly back?: LocalDay
}

/** The lines of a session as the list draws them: the ones with a result are done, with what became of them, and the one at `index` is now. */
export function lineViews(lines: readonly Line[], results: readonly Result[], index: number | null): LineView[] {
  return lines.map((line, at) => {
    const result = results[at]
    if (result !== undefined) return { kc: line.kc, title: line.title, state: 'done', ok: result.ok, back: result.back }
    return { kc: line.kc, title: line.title, state: at === index ? 'now' : 'waiting' }
  })
}
