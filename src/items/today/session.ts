/*
 * The composer (ASSESSMENT §8; W1-T05): `composeSession` turns a deck into the list that one session works through. Pure and
 * deterministic: the day is a parameter and nothing is drawn here. The list names the ideas, each with the family and the level that
 * will serve it; the seeds are drawn one ticket at a time when each is printed (draw.ts), so the numbers are fresh whenever they are asked.
 *
 * Order. The ideas that are due, the lowest predicted recall first. In a welcome-back the sturdiest that have slipped furthest come
 * first (cards.ts). Interleaving happens only inside a confusable set (ASSESSMENT §8): the ideas of one set are put side by side, and
 * nothing is shuffled across sets. kernelspace's composer gives Brunmair and Richter 2019 as the ground, for the finding that mixing
 * dissimilar material does not help [unverified: not checked against the paper here].
 *
 * Size. At most `SESSION_CAP_ITEMS` ideas, which the nominal time of an item makes about 12 minutes [estimated]. An idea that no family
 * can serve yet is passed over and costs nothing, and the list never says how many were.
 *
 * Never an overdue count (kernelspace K2): nothing here, and nothing the page prints from it, says how many ideas are due. The list is
 * as long as the session, and the session is capped.
 */
import type { LocalDay } from '@es/ledger'
import { CATALOG } from '@es/play/items/catalog'
import type { GenFace, Level } from '@es/play/items/types'
import { aheadCards, dueCards } from './cards'
import type { Card, CardSet } from './cards'
import { familyFor, levelFor } from './draw'
import { AHEAD_ITEMS, NOMINAL_ITEM_SECONDS, SESSION_CAP_ITEMS } from './limits'

/** What kind of session it is: the ideas that are due, a welcome-back after a gap, or a review ahead of what is due. */
export const SESSION_MODES = ['due', 'welcome-back', 'ahead'] as const
export type SessionMode = (typeof SESSION_MODES)[number]

/** One line of the prep list: an idea, and the kind of ticket that will serve it. */
export interface Line {
  readonly kc: string
  /** The id of the family that serves it. */
  readonly family: string
  /** The family's title: what the line is called on screen. */
  readonly title: string
  readonly level: Level
}

export interface Session {
  readonly day: LocalDay
  readonly mode: SessionMode
  readonly lines: readonly Line[]
  /** The nominal time of the whole list, in seconds [estimated]: what "about 9 min" is read from. */
  readonly seconds: number
}

export interface ComposeOptions {
  /** Serve the ideas that are not due, the nearest to fading first, instead of the ones that are. */
  readonly ahead?: boolean
  /** The families to serve from, by their faces. The catalog's, unless a test says otherwise. */
  readonly families?: readonly GenFace[]
  /** The confusable set that each KC belongs to (the KCs of a set share a value). A KC in no set is absent. */
  readonly groupOf?: ReadonlyMap<string, string>
}

/** The nominal seconds of a list of `count` tickets. */
export const nominalSeconds = (count: number): number => count * NOMINAL_ITEM_SECONDS

/**
 * The confusable set of each KC: the connected group of KCs that the graph's `confusable` edges link, named by the least of its ids, so that a KC
 * that is confusable with two others brings all three together. A KC in no set is absent. kernelspace's `confusableGroups` (d478f91).
 * The page feeds `composeSession` these once the compiled map carries each KC's `confusable` edges. W1-T06's map has the KC's
 * description and not that list yet; the graph has it (content/kc/graph.yaml, packages/schema/kc.ts).
 */
export function confusableGroups(kcs: readonly { readonly id: string; readonly confusable?: readonly string[] }[]): Map<string, string> {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) as string
    return root
  }
  for (const kc of kcs) if ((kc.confusable?.length ?? 0) > 0) parent.set(kc.id, kc.id)
  for (const kc of kcs) {
    for (const other of kc.confusable ?? []) {
      if (!parent.has(other)) parent.set(other, other)
      const a = find(kc.id)
      const b = find(other)
      if (a !== b) parent.set(a < b ? b : a, a < b ? a : b)
    }
  }
  return new Map([...parent.keys()].map((id) => [id, find(id)]))
}

/**
 * Puts the ideas of one confusable set next to each other, at the place of the set's first member, so a later member only moves up.
 * When every idea of the set has at least two lines they alternate (A B A B); otherwise each idea's lines stay together. Lines of ideas
 * in no set keep their place. kernelspace's `interleaveConfusable` (d478f91).
 */
export function interleaveConfusable<T extends { readonly kc: string }>(lines: readonly T[], groupOf: ReadonlyMap<string, string>): T[] {
  const out: T[] = []
  const done = new Set<string>()
  for (const line of lines) {
    const group = groupOf.get(line.kc)
    if (group === undefined) {
      out.push(line)
      continue
    }
    if (done.has(group)) continue
    done.add(group)
    const byKc = new Map<string, T[]>()
    for (const other of lines) if (groupOf.get(other.kc) === group) byKc.set(other.kc, [...(byKc.get(other.kc) ?? []), other])
    const lanes = [...byKc.values()]
    if (lanes.length > 1 && lanes.every((lane) => lane.length >= 2)) {
      const rounds = Math.max(...lanes.map((lane) => lane.length))
      for (let round = 0; round < rounds; round += 1) for (const lane of lanes) if (round < lane.length) out.push(lane[round])
    } else {
      for (const lane of lanes) out.push(...lane)
    }
  }
  return out
}

function lineOf(card: Card, families: readonly GenFace[]): Line | null {
  const level = levelFor(card, families)
  if (level === null) return null
  const gen = familyFor(card, level, families)
  return gen === null ? null : { kc: card.kc, family: gen.id, title: gen.title, level }
}

/**
 * The list for local day `today`. A welcome-back is the deck's own (`set.welcomeBack`: a gap is open), and `ahead` asks for the ideas
 * that are not due. The list may be empty: nothing is due, or nothing that is due can be served yet.
 */
export function composeSession(set: CardSet, today: LocalDay, options: ComposeOptions = {}): Session {
  const families = options.families ?? CATALOG
  const ahead = options.ahead === true
  const mode: SessionMode = ahead ? 'ahead' : set.welcomeBack ? 'welcome-back' : 'due'
  const wanted = ahead ? aheadCards(set, today) : dueCards(set, today)
  const limit = ahead ? AHEAD_ITEMS : SESSION_CAP_ITEMS

  const lines: Line[] = []
  for (const card of wanted) {
    if (lines.length >= limit) break
    const line = lineOf(card, families)
    if (line !== null) lines.push(line)
  }
  const placed = options.groupOf === undefined ? lines : interleaveConfusable(lines, options.groupOf)
  return { day: today, mode, lines: placed, seconds: nominalSeconds(placed.length) }
}

/** Whole minutes for "about N min": the nominal seconds, rounded up, at least 1 for a list that is not empty. */
export const minutesOf = (seconds: number): number => (seconds <= 0 ? 0 : Math.max(1, Math.ceil(seconds / 60)))
