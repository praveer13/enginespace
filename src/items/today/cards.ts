/*
 * Cards: one FSRS card for each knowledge component the learner has earned, read from the ledger (ARCHITECTURE §7, D-024;
 * ASSESSMENT §3.3 and §8). Pure and stateless: `deriveCards` replays the events in (at, id) order and answers for a local day, so an
 * import, a merge or a second device gives the same cards as the first. Nothing here is stored, and deleting the events gives back an
 * empty deck.
 *
 *   Earning     A KC is earned by an event that passed at full weight (provenance `unseen`, `proved` or `gpu-verified`) and is not a
 *               prediction (ASSESSMENT §3.3, §4.7). That event is the card's first review. Until then there is no card, and a KC that
 *               was only attempted is not Today's to keep.
 *   Reviews     Every later graded event that resolves to the KC reschedules it (kernelspace's rule: a review is any graded result, right
 *               or wrong), except what is not retrieval: a result that was assisted, and the ones that count for nothing (a receipt that
 *               failed its checks, a note typed without a check). A `review` event carries the grade Today gave. Any other event is
 *               graded from its `ok` and its confidence tap (`gradeOf`). A prediction may reschedule an earned idea and never earns one.
 *   Schedule    The memory after each review is the model's. The next review falls `intervalOf(memory)` days after the latest one.
 *   Welcome     After a gap of `GAP_DAYS` without graded work (ASSESSMENT §8; kernelspace K2) the next session is a welcome-back set. The ideas
 *   back        that are overdue that day and do not fit one session wait their turn over `SPREAD_DAYS` days, so a returning learner meets
 *               a short list and never a wall. The spread is part of the replay (it happens at the first graded event after the gap, or on
 *               `today` while the gap is still open), so it follows from the ledger and is the same whenever it is read.
 *
 * The event-to-KC resolver is passed in (kcs.ts), so this file reads no registry and no content.
 */
import { GRADED_KINDS, weightOf } from '@es/ledger'
import type { LedgerEvent, LocalDay } from '@es/ledger'
import { addDays, daysBetween } from './days'
import { afterReview, firstMemory, gradeOf, intervalOf, isRating, recallAfter } from './fsrs'
import type { MemoryState, Rating } from './fsrs'
import type { KcsOfRef } from './kcs'
import { GAP_DAYS, SESSION_CAP_ITEMS, SPREAD_DAYS } from './limits'

export interface Card {
  readonly kc: string
  /** The day of the event that earned it. */
  readonly earnedDay: LocalDay
  readonly memory: MemoryState
  /** The day of the latest review. */
  readonly lastDay: LocalDay
  /** The first day on which the idea is due. */
  readonly dueDay: LocalDay
  /** Reviews counted, the earning one included. */
  readonly reps: number
  /** Reviews that were graded Again. */
  readonly lapses: number
}

export interface CardSet {
  /** The cards by KC, in the order the KCs were earned. */
  readonly cards: ReadonlyMap<string, Card>
  /** The day of the latest graded event, or null for a ledger with none. */
  readonly lastGradedDay: LocalDay | null
  /** A gap of `GAP_DAYS` is open on the day asked about: the learner has not yet done graded work since it began. */
  readonly welcomeBack: boolean
}

export interface DeriveOptions {
  /** How many overdue ideas a welcome-back set keeps due. The default is one session's worth. */
  readonly capacity?: number
  /**
   * Whether a ticket can be printed for an idea yet. A welcome-back counts only the ideas that can, so that a card no family serves
   * does not take a place in the set that a served one needed, and is left as it is. Every idea can, by default.
   */
  readonly servable?: (card: Pick<Card, 'kc' | 'memory'>) => boolean
}

type GradedEvent = Exclude<LedgerEvent, { kind: 'challenge' | 'ack' }>
const GRADED = new Set<string>(GRADED_KINDS)
const isGraded = (event: LedgerEvent): event is GradedEvent => GRADED.has(event.kind)

/** An event that passed at full weight and is not a prediction: the KCs it is evidence for are earned (ASSESSMENT §3.3, §4.7). */
export const earns = (event: GradedEvent): boolean => event.kind !== 'predict' && event.ok && weightOf(event.provenance) === 1

/** Results that are not retrieval of the idea: help past the hints, a receipt that failed its checks, a figure typed without a check. */
const NOT_RETRIEVAL: ReadonlySet<string> = new Set(['assisted', 'gpu-unverified', 'self-reported'])

/** Whether a graded event reschedules a card that exists. */
export const reviews = (event: GradedEvent): boolean => !NOT_RETRIEVAL.has(event.provenance)

/** The grade an event gives the card: a `review` event carries the one Today gave, and any other is graded from its answer. */
export function ratingOfEvent(event: GradedEvent): Rating {
  if (event.kind === 'review' && isRating(event.data.grade)) return event.data.grade
  return gradeOf({ ok: event.ok, ...(event.conf === undefined ? {} : { conf: event.conf }) })
}

/** Events in (at, id) order, with an id that appears twice kept once: a merge or an import may deliver one twice. */
function ordered(events: readonly LedgerEvent[]): LedgerEvent[] {
  const byId = new Map<string, LedgerEvent>()
  for (const event of events) if (!byId.has(event.id)) byId.set(event.id, event)
  return [...byId.values()].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** A card the replay is still changing. */
interface Working {
  kc: string
  earnedDay: LocalDay
  memory: MemoryState
  lastDay: LocalDay
  dueDay: LocalDay
  reps: number
  lapses: number
}

/** The predicted recall of a card on `day`, counted from its latest review. */
export function recallOn(card: Pick<Card, 'memory' | 'lastDay'>, day: LocalDay): number {
  return recallAfter(card.memory, Math.max(0, daysBetween(card.lastDay, day)))
}

/**
 * The welcome-back order: the sturdiest ideas that have slipped furthest come first (they are the ones most worth keeping), then the
 * lowest recall, then the id. kernelspace's `welcomeOrder`, without its priority and threshold tiers (the KC graph is not read at run
 * time yet).
 */
export function welcomeOrder(a: { kc: string; stability: number; recall: number }, b: { kc: string; stability: number; recall: number }): number {
  return b.stability - a.stability || a.recall - b.recall || (a.kc < b.kc ? -1 : a.kc > b.kc ? 1 : 0)
}

/** The order of the rest of the spread: the lowest recall first, then the id. */
const spreadOrder = (a: { kc: string; recall: number }, b: { kc: string; recall: number }): number => a.recall - b.recall || (a.kc < b.kc ? -1 : a.kc > b.kc ? 1 : 0)

/**
 * A return on `day`: the cards due that day beyond one session's worth wait their turn. Card `i` of the remaining `m` is due on
 * `day + 1 + floor(i × SPREAD_DAYS ÷ m)`, so no day holds more than ceil(m ÷ SPREAD_DAYS) of them. Deterministic, and the order the cards
 * were found in does not matter.
 */
function spreadOverdue(cards: Map<string, Working>, day: LocalDay, capacity: number, servable: (card: Pick<Card, 'kc' | 'memory'>) => boolean): void {
  const overdue = [...cards.values()]
    .filter((card) => card.dueDay <= day && servable(card))
    .map((card) => ({ card, kc: card.kc, stability: card.memory.stability, recall: recallOn(card, day) }))
    .sort(welcomeOrder)
  const rest = overdue.slice(Math.max(0, Math.floor(capacity))).sort(spreadOrder)
  rest.forEach(({ card }, index) => {
    card.dueDay = addDays(day, 1 + Math.floor((index * SPREAD_DAYS) / rest.length))
  })
}

/**
 * The deck for local day `today`. `kcsOf` is the ref-to-KC map (kcs.ts). A graded event whose ref names no KC changes no card, but it
 * still counts as graded work for the gap: the learner was here.
 */
export function deriveCards(events: readonly LedgerEvent[], kcsOf: KcsOfRef, today: LocalDay, options: DeriveOptions = {}): CardSet {
  const capacity = options.capacity ?? SESSION_CAP_ITEMS
  const servable = options.servable ?? (() => true)
  const cards = new Map<string, Working>()
  let lastGradedDay: LocalDay | null = null

  for (const event of ordered(events)) {
    if (!isGraded(event)) continue
    if (lastGradedDay !== null && daysBetween(lastGradedDay, event.day) >= GAP_DAYS) spreadOverdue(cards, event.day, capacity, servable)
    if (lastGradedDay === null || event.day > lastGradedDay) lastGradedDay = event.day

    for (const kc of kcsOf(event.ref)) {
      const card = cards.get(kc)
      if (card === undefined) {
        if (!earns(event)) continue
        const memory = firstMemory(ratingOfEvent(event))
        cards.set(kc, { kc, earnedDay: event.day, memory, lastDay: event.day, dueDay: addDays(event.day, intervalOf(memory)), reps: 1, lapses: 0 })
        continue
      }
      if (!reviews(event)) continue
      const grade = ratingOfEvent(event)
      card.memory = afterReview(card.memory, Math.max(0, daysBetween(card.lastDay, event.day)), grade)
      card.reps += 1
      if (grade === 1) card.lapses += 1
      // A day that steps back (the learner's zone changed) leaves the latest review where it was.
      if (event.day > card.lastDay) card.lastDay = event.day
      card.dueDay = addDays(card.lastDay, intervalOf(card.memory))
    }
  }

  const welcomeBack = lastGradedDay !== null && daysBetween(lastGradedDay, today) >= GAP_DAYS
  // A gap that is still open: the learner has not been back yet, so the spread is anchored on today.
  if (welcomeBack) spreadOverdue(cards, today, capacity, servable)

  return { cards: new Map([...cards].map(([kc, card]) => [kc, { ...card, memory: { ...card.memory } }])), lastGradedDay, welcomeBack }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Queries                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Whether an idea is due on `today`. */
export const isDue = (card: Pick<Card, 'dueDay'>, today: LocalDay): boolean => card.dueDay <= today

/**
 * The ideas due on `today`, in the order a session serves them: the lowest predicted recall first, then the id. A welcome-back set
 * serves the sturdiest first instead (`welcomeOrder`).
 */
export function dueCards(set: CardSet, today: LocalDay): Card[] {
  const wanted = [...set.cards.values()].filter((card) => isDue(card, today)).map((card) => ({ card, kc: card.kc, stability: card.memory.stability, recall: recallOn(card, today) }))
  wanted.sort(set.welcomeBack ? welcomeOrder : spreadOrder)
  return wanted.map(({ card }) => card)
}

/** The ideas that are not due on `today`, the nearest to fading first: what "review ahead" serves. */
export function aheadCards(set: CardSet, today: LocalDay): Card[] {
  const rest = [...set.cards.values()].filter((card) => !isDue(card, today)).map((card) => ({ card, kc: card.kc, recall: recallOn(card, today) }))
  rest.sort(spreadOrder)
  return rest.map(({ card }) => card)
}

/** The first day after `today` on which an idea falls due, or null when there is no card that is not due already. */
export function nextDueDay(set: CardSet, today: LocalDay): LocalDay | null {
  let next: LocalDay | null = null
  for (const card of set.cards.values()) if (card.dueDay > today && (next === null || card.dueDay < next)) next = card.dueDay
  return next
}
