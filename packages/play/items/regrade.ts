/**
 * Grading a stored answer again (ARCHITECTURE §6.3's rule, applied to items; ASSESSMENT §4.1). The ledger keeps an item's ref, its
 * seed, its fingerprint and the learner's answer, and nothing about the key. To grade it, the family makes the item again from the
 * seed and grades the answer against the key it computes then, so a score that someone edited in storage changes nothing.
 *
 * An event whose fingerprint differs from the item the family makes now was graded against another question (the family changed
 * after it): it is `stale`, which the Mirror shows as "re-check", and it loses nothing (A§4.2).
 */
import type { Seed } from '@es/sim/core'
import { isLevel } from './types'
import type { Gen, Item, Level, Response, StoredAnswer } from './types'
import { familyById } from './registry'

/** An `item` event as the ledger returns it, reduced to what grading needs. */
export interface StoredItem {
  readonly ref: string
  readonly seed?: number
  readonly rev?: string
  /** The event's `data.answer`. */
  readonly answer: unknown
}

export type Regrade =
  | { readonly valid: true; readonly ok: boolean; readonly score: number; readonly stale: boolean; readonly item: Item }
  | { readonly valid: false; readonly reason: string }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads the free JSON of an event's `data.answer` back into a `StoredAnswer`, or null when it is not one. */
export function parseStoredAnswer(value: unknown): StoredAnswer | null {
  if (!record(value) || !isLevel(value.level) || !record(value.response)) return null
  const level: Level = value.level
  const { kind } = value.response
  let response: Response | null = null
  if (kind === 'numeric' && typeof value.response.value === 'number' && Number.isFinite(value.response.value)) response = { kind, value: value.response.value }
  else if (kind === 'choice' && typeof value.response.pick === 'string') response = { kind, pick: value.response.pick }
  return response === null ? null : { level, response }
}

/** The family and variant a ref names, or null. */
export function parseItemRef(ref: string): { family: string; variant: string } | null {
  const parts = /^item:gen\/([a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(ref)
  return parts === null ? null : { family: parts[1], variant: parts[2] }
}

export function regradeItem(stored: StoredItem, families?: readonly Gen[]): Regrade {
  const named = parseItemRef(stored.ref)
  if (named === null) return { valid: false, reason: `${stored.ref} is not the ref of an item` }
  const gen = familyById(named.family, families)
  if (gen === undefined) return { valid: false, reason: `this build has no item family "${named.family}"` }
  const answer = parseStoredAnswer(stored.answer)
  if (answer === null) return { valid: false, reason: 'the stored answer is not one this build can read' }
  const seed: Seed | undefined = stored.seed
  if (seed === undefined || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return { valid: false, reason: 'the event has no seed to make the item again from' }
  let item: Item
  try {
    item = gen.make(seed, answer.level, named.variant)
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : String(error) }
  }
  const grade = gen.grade(item, answer.response)
  return { valid: true, ok: grade.ok, score: grade.score, stale: stored.rev !== undefined && stored.rev !== item.rev, item }
}
