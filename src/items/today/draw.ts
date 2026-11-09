/*
 * Choosing and drawing an item for an idea (ARCHITECTURE §8.2, ASSESSMENT §8: "every item regenerated on a fresh seed").
 *
 * Which family and which level are decided when a session is composed, from the card and the families' faces alone (the catalog), so
 * that the prep list can name them before anything is drawn, and before any family's code is loaded (D-059). The seed is drawn later, when the ticket is printed: `drawForKc` takes the entropy from outside (src/items
 * reads `crypto.getRandomValues` when the ticket comes up), and `drawInBand` turns it into a seed that makes a fair question and that
 * the learner has not met. So two sessions on the same card ask the same kind of question on different numbers, and nothing is looked up.
 */
import { splitmix32u } from '@es/sim/core'
// By path, not through the package's index, which brings the registry and every family's code with it (D-059).
import { seenKey, seenKeyOfRef } from '@es/play/items/attempt'
import { CATALOG } from '@es/play/items/catalog'
import { drawInBand, MAX_DRAWS, offeredAt, resolveVariant } from '@es/play/items/draw'
import type { Gen, GenFace, Item, Level } from '@es/play/items/types'
import type { LedgerEvent } from '@es/ledger'
import type { Card } from './cards'
import { DRAW_ROUNDS, TRANSFER_STABILITY_DAYS } from './limits'

/** The families that can serve `kc` at `level`: some variant that assesses it is offered there. */
export function familiesAt(kc: string, level: Level, families: readonly GenFace[] = CATALOG): readonly GenFace[] {
  return families.filter((gen) => offeredAt(gen, level).some((variant) => variant.kcs.includes(kc)))
}

/**
 * The level an idea is served at. On its own (level 2) until its memory is sturdy, then on a changed surface (level 3) where a family
 * offers one: transfer is the test of a skill that is settled. Where the family has nothing at that level, the other one; null when it
 * has neither, and then the idea cannot be served yet.
 */
export function levelFor(card: Pick<Card, 'kc' | 'memory'>, families: readonly GenFace[] = CATALOG): Level | null {
  const wanted: Level[] = card.memory.stability >= TRANSFER_STABILITY_DAYS ? [3, 2] : [2, 3]
  return wanted.find((level) => familiesAt(card.kc, level, families).length > 0) ?? null
}

/**
 * The family that serves a card at a level. Where several can, they take turns by the number of reviews the card has had, which is
 * read from the ledger, so the choice is the same whenever it is made and no entropy is spent on it.
 */
export function familyFor(card: Pick<Card, 'kc' | 'reps'>, level: Level, families: readonly GenFace[] = CATALOG): GenFace | null {
  const able = familiesAt(card.kc, level, families)
  return able.length === 0 ? null : able[card.reps % able.length]
}

/** The ticket that was printed: the family it came from, the item, and how many seeds the draw tried. */
export interface Drawn {
  readonly gen: Gen
  readonly item: Item
  readonly tries: number
}

/**
 * One item of `gen` for `kc` at `level`, from `entropy`. The candidate seeds are the entropy and then its splitmix32 stream (`drawInBand`);
 * the first that the band accepts, that picks a variant which assesses the KC, and that the learner has not met (`seen`) is kept. The
 * variant is a function of the seed (`resolveVariant`), and a band judges the seed's own variant, so refusing the others is the way to ask
 * for one KC (kernelspace's `drawOnKc` did the same). A family whose variants assess many KCs accepts few candidates, and one round of
 * `MAX_DRAWS` could then fail, so a failed round goes on from the next value of the entropy's stream, `DRAW_ROUNDS` rounds in all. Every
 * round is a function of the entropy, so the draw still is. Throws a RangeError when none serves: a KC that no variant of the family
 * assesses at the level, or a band that is far too tight.
 */
export function drawForKc(gen: Gen, kc: string, level: Level, entropy: number, seen: ReadonlySet<string> = new Set()): Drawn {
  const next = splitmix32u(entropy)
  let start = entropy
  let failure: unknown
  for (let round = 0; round < DRAW_ROUNDS; round += 1) {
    try {
      const draw = drawInBand(gen, level, start, (candidate) => {
        const variant = resolveVariant(gen, candidate, level)
        return !variant.kcs.includes(kc) || seen.has(seenKey(gen.id, variant.id, candidate))
      })
      return { gen, item: gen.make(draw.seed, level), tries: round * MAX_DRAWS + draw.tries }
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      failure = error
      start = next()
    }
  }
  throw failure
}

/**
 * What the learner has met, as the item framework's `seenKey`s. An `item` event names its family and variant. A `review` event names
 * only the KC, so a seed it carries counts as met for every variant of every family that assesses the KC: that refuses a seed a little
 * too often and never lets a repeat through. A seed has 2³² values, so neither is likely.
 */
export function seenKeys(events: readonly LedgerEvent[], families: readonly GenFace[] = CATALOG): Set<string> {
  const seen = new Set<string>()
  for (const event of events) {
    if (event.kind === 'item' && event.seed !== undefined) {
      const key = seenKeyOfRef(event.ref, event.seed)
      if (key !== null) seen.add(key)
    } else if (event.kind === 'review' && event.seed !== undefined) {
      const kc = event.ref.slice('review:'.length)
      for (const gen of families) for (const variant of gen.variants) if (variant.kcs.includes(kc)) seen.add(seenKey(gen.id, variant.id, event.seed))
    }
  }
  return seen
}
