/**
 * Seeds and draws (ARCHITECTURE §8.2, GAMES.md §2.1): the sub-stream an item draws its scene from, the variant a seed picks, the
 * fingerprint of an item, and `drawInBand`, which turns the entropy of an attempt's start into a seed that makes a fair question.
 *
 * Nothing here reads entropy. A seed arrives from outside (`src/items` reads `crypto.getRandomValues` when an attempt starts), and
 * everything after it is the shared splitmix32, so the same seed at the same level builds the same item in Bun and in every browser.
 */
import { assertSeed, canonicalJson, hash32, pick, rngFor, splitmix32u } from '@es/sim/core'
import type { Rng, Seed } from '@es/sim/core'
import type { Gen, Item, Level, VariantSpec } from './types'

/**
 * Candidates tried before a draw gives up: the band must accept a good share of seeds, and a family that needs more has a band
 * that is too tight. kernelspace's `MAX_DRAWS` [measured at d478f91], which GAMES.md §2.1 adopts.
 */
export const MAX_DRAWS = 256

/**
 * The stream for one purpose of one item. A salt is ASCII (`rngFor`), and the family, variant and level are in it, so adding a
 * draw to one purpose never moves another, and the same seed at two levels or in two variants draws unrelated numbers.
 */
export function itemRng(family: string, variant: string, level: Level, seed: Seed, purpose: string): Rng {
  return rngFor(seed, `items/${family}/${variant}/${level}/${purpose}`)
}

/** The variants of `gen` that are offered at `level`. */
export function offeredAt(gen: Pick<Gen, 'variants'>, level: Level): readonly VariantSpec[] {
  return gen.variants.filter((variant) => variant.levels.includes(level))
}

/**
 * The variant to make. A named one must exist and be offered at `level`. Otherwise the seed picks among the variants offered at
 * the level, so a seed alone decides which kind of question a learner meets.
 */
export function resolveVariant(gen: Pick<Gen, 'id' | 'variants'>, seed: Seed, level: Level, variant?: string): VariantSpec {
  if (variant !== undefined) {
    const named = gen.variants.find((candidate) => candidate.id === variant)
    if (named === undefined) throw new RangeError(`${gen.id} has no variant "${variant}"`)
    if (!named.levels.includes(level)) throw new RangeError(`${gen.id}/${variant} is not offered at level ${level}`)
    return named
  }
  const offered = offeredAt(gen, level)
  if (offered.length === 0) throw new RangeError(`${gen.id} offers no variant at level ${level}`)
  return pick(rngFor(seed, `items/${gen.id}/variant/${level}`), offered)
}

/** The fingerprint of an item: eight hex digits over what the item is a function of. A changed question reads as a new item. */
export function itemRev(item: Pick<Item, 'family' | 'version' | 'variant' | 'level' | 'params'>): string {
  const { family, version, variant, level, params } = item
  return hash32(canonicalJson({ family, version, variant, level, params })).toString(16).padStart(8, '0')
}

/** What a family's `make` supplies: everything but what `finishItem` adds. */
export type ItemDraft = Omit<Item, 'family' | 'version' | 'rev'>

/**
 * Completes an item with its family, version and fingerprint. Params must be finite: a NaN would write as null and quietly change
 * what the fingerprint and a replay see.
 */
export function finishItem(gen: Pick<Gen, 'id' | 'version'>, draft: ItemDraft): Item {
  for (const [name, value] of Object.entries(draft.params)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new RangeError(`${gen.id}/${draft.variant}: the param ${name} is not finite`)
  }
  const item = { ...draft, family: gen.id, version: gen.version }
  return { ...item, rev: itemRev(item) }
}

export interface Draw {
  /** The seed that was accepted. */
  readonly seed: Seed
  /** Candidates tried, the accepted one included. */
  readonly tries: number
}

/**
 * Turns the entropy of an attempt's start into a seed that makes a fair question (GAMES.md §2.1): the entropy itself is tried
 * first, then the outputs of its splitmix32 stream in order, and the first the band accepts is kept. `skip` refuses a seed the
 * learner has met, so that a fresh draw is unseen. It gives up after `MAX_DRAWS` candidates, which only a band that is too tight
 * can cause, and `verify:items` fails a family whose band accepts under a fifth of its candidates.
 */
export function drawInBand(gen: Pick<Gen, 'id' | 'band'>, level: Level, entropy: number, skip?: (seed: Seed) => boolean): Draw {
  assertSeed(entropy)
  const next = splitmix32u(entropy)
  let candidate = entropy
  for (let tries = 1; tries <= MAX_DRAWS; tries += 1) {
    if (gen.band(candidate, level) && !(skip?.(candidate) ?? false)) return { seed: candidate, tries }
    candidate = next()
  }
  throw new RangeError(`${gen.id}: no seed in band at level ${level} in ${MAX_DRAWS} candidates from ${entropy}`)
}

/**
 * `count` seeds that never change: the stream of `splitmix32u(salt)`. The gate and the tests measure a family on these, so that a
 * result is the same on every run and a failure can be reproduced.
 */
export function fixedSeeds(count: number, salt = 0x1d5eed): Seed[] {
  const next = splitmix32u(salt)
  return Array.from({ length: count }, () => next())
}
