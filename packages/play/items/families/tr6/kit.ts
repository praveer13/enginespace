/**
 * What TR6's item families share (W1-T30): the tolerances, the worked part of an item by its level, and the choice of a draw that is
 * right one time in k. Each family keeps its own world, its own words and its own band in its own file; this holds the few things that
 * would otherwise be written five times.
 *
 * Like the rest of packages/play it is pure (D-017): no DOM, no clock, no entropy, and no `Math.pow`, `**` or other function whose
 * last bit differs between engines. A family that needs a square root uses `Math.sqrt`, which the standard rounds exactly.
 */
import { below, shuffle } from '@es/sim/core'
import type { Rng } from '@es/sim/core'
import { itemRng } from '../../draw'
import type { ChoiceOption, Level, Rich, Step } from '../../types'

/** An integer count or an identifier is right only if it is exact (ASSESSMENT §4.2). */
export const EXACT = {} as const
/** Arithmetic on the numbers a ticket gives is right within 2% (ASSESSMENT §4.2) [estimated]. */
export const ARITHMETIC = { rel: 0.02 } as const
/** A prediction of what the model does is right within 10% (ASSESSMENT §4.3, the mask-overlap bar: "the predicted bubble within ±10% of the model's") [estimated]. */
export const PREDICTION = { rel: 0.1 } as const

/**
 * The part of an item shown before its question (types.ts, `Item.worked`): at level 0 a whole solution of another fair scene, at level 1
 * the words of this item's own first step, and at the other levels nothing. `example` is called with 0, 1, 2 and so on until it gives a
 * scene that makes a different question (a worked answer that is the item's own answer would be copied), and returns that scene's steps.
 */
export function workedPart(level: Level, own: readonly Step[], example: (attempt: number) => readonly Step[] | null): Step[] {
  if (level === 1) return own.length === 0 ? [] : [{ text: own[0].text }]
  if (level !== 0) return []
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const steps = example(attempt)
    if (steps !== null) return [...steps]
  }
  return []
}

/**
 * Which of `n` outcomes an item is about, drawn answer first (ASSESSMENT §4.1): each is the key on 1 seed in `n`, so no habit of
 * choosing the same one passes more than its share.
 */
export function drawOutcome(family: string, variant: string, level: Level, seed: number, n: number): number {
  return below(itemRng(family, variant, level, seed, 'outcome'), n)
}

/** The options of a choice, in the order this seed shows them. */
export function shown(family: string, variant: string, level: Level, seed: number, options: readonly ChoiceOption[]): ChoiceOption[] {
  return shuffle(itemRng(family, variant, level, seed, 'options'), options)
}

/** A draw from `items`, by the stream of `rng`. */
export function oneOf<T>(rng: Rng, items: readonly T[]): T {
  return items[below(rng, items.length)]
}

/** The sentence a wrong option or a wrong number is explained by, with the misconception id it encodes (`<family>.<slug>`). */
export interface Lure {
  readonly why: Rich
  readonly miss: string
}
