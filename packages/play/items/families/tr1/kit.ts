/**
 * What every TR1 item family does the same way (W1b-T03): the tolerance of a count, the worked part of an item by its level, the choice of an
 * answer first, and the order in which a seed shows the options of a choice. Each family keeps its own world, its own words and its own band in
 * its own file; this holds the few things that would otherwise be written five times.
 *
 * It reads nothing of the lifecycle model, which `lifecycle-kit.ts` holds for the two families that do: a family's chunk loads when an item is
 * drawn, and the three that do not read the model should not pull its paths in with them.
 *
 * Like the rest of packages/play it is pure (D-017): no DOM, no clock, no entropy.
 */
import { below, shuffle } from '@es/sim/core'
import type { Seed } from '@es/sim/core'
import { itemRng } from '../../draw'
import type { ChoiceOption, Level, Step } from '../../types'

/** An integer count, an identifier or a number of tokens is right only if it is exact (ASSESSMENT §4.2). */
export const EXACT = {} as const

/**
 * The part of an item shown before its question (types.ts, `Item.worked`): at level 0 a whole solution of another fair scene, at level 1
 * the words of this item's own first step, and at the other levels nothing. `example` is called with 0, 1, 2 and so on until it gives a
 * scene that makes a different question (a worked answer that is the item's own would be copied), and returns that scene's steps.
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

/** Which of `n` outcomes an item is about, drawn answer first (ASSESSMENT §4.1): each is the key on one seed in `n`. */
export function drawOutcome(family: string, variant: string, level: Level, seed: Seed, n: number): number {
  return below(itemRng(family, variant, level, seed, 'outcome'), n)
}

/** The options of a choice, in the order this seed shows them. `purpose` names the stream that the order is drawn from. */
export function shown(family: string, variant: string, level: Level, seed: Seed, options: readonly ChoiceOption[], purpose = 'options'): ChoiceOption[] {
  return shuffle(itemRng(family, variant, level, seed, purpose), options)
}
