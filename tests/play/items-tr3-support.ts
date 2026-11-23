/**
 * What TR3's four item-family tests share (W2b-T105): the seeds, in chunks of a hundred so that a nightly run of 10,000 is a hundred short
 * tests and not one long one, and readers of the ticket that share no code with the families: each oracle reads the given lines, the
 * stem and the options as a learner would, and works the answer out again from them.
 */
import type { Item, Part } from '@es/play/items'
import { seeds } from '../seeds'

export const SEEDS = seeds(1)
export const CHUNK = 100
export const chunks: number[][] = Array.from({ length: Math.ceil(SEEDS.length / CHUNK) }, (_, at) => SEEDS.slice(at * CHUNK, (at + 1) * CHUNK))

/** The numbers of a sentence, in order, from its tagged parts. */
export const numsOf = (parts: readonly Part[]): number[] => parts.flatMap((part) => (part.t === 'num' ? [part.value] : []))

/** The code parts of a sentence, in order. */
export const codesOf = (parts: readonly Part[]): string[] => parts.flatMap((part) => (part.t === 'code' ? [part.code] : []))

/** The code of a given by its label. */
export function givenCode(item: Item, label: string): string {
  const found = item.givens.find((given) => given.label === label)
  if (found === undefined || found.value.t !== 'code') throw new Error(`no code given "${label}"`)
  return found.value.code
}

/** The number of a given by its label. */
export function givenNum(item: Item, label: string): number {
  const found = item.givens.find((given) => given.label === label)
  if (found === undefined || found.value.t !== 'num') throw new Error(`no number given "${label}"`)
  return found.value.value
}

/** `20 to 70` as [20, 70]. */
export function fromTo(text: string): [number, number] {
  const m = text.match(/(\d+) to (\d+)/)
  if (m === null) throw new Error(`no range in "${text}"`)
  return [Number(m[1]), Number(m[2])]
}
