/**
 * Blind strategies (ASSESSMENT §4.1, ARCHITECTURE §5.10): what a learner who never reads the scene could score on a family, and
 * the bound that the score must stay under.
 *
 * A strategy answers without understanding the question: always the same number, always the option shown third, always the longest
 * option, the number printed on the ticket. The best of them, measured per kind of question (the kind is on the ticket, so a blind
 * learner may use a different habit for each), must pass a single seed at most `BLIND_BOUND` of the time, so that three fresh seeds
 * in a row are out of reach by guessing. A choice among k options is right at random 1 time in k, which is above that bound for
 * any k under 7, so a choice is held to its own chance plus three standard errors of the sample instead; `blindBound` says both.
 *
 * Everything here is pure and works on items already made, so the gate and the tests measure a family the same way.
 */
import { fixedSeeds } from './draw'
import { plain } from './rich'
import type { BlindStrategy, Gen, Item, Level, Response } from './types'

/** The most that the best scene-blind strategy may pass of single seeds (ASSESSMENT §4.1) [estimated]. */
export const BLIND_BOUND = 0.15

/** Banded seeds a family is measured on, per level [estimated]. A larger sample narrows the margin that a choice is given. */
export const BLIND_SAMPLE = 1000

/** The share of candidates that a band must accept (ASSESSMENT §4.1; kernelspace's EPLB floor) [estimated]. */
export const BAND_FLOOR = 0.2

/** Candidates the band is measured on, per level [estimated]. */
export const BAND_SAMPLE = 2000

/**
 * What a blind strategy may pass of one kind of question over `samples` items. A numeric answer, and a choice among 7 or more
 * options, are held to `BLIND_BOUND`. A choice among fewer is right at random 1 time in k, so it is held to k's chance plus three
 * standard errors of a sample that size [estimated]: a family that tilts the key toward a position, a length or an id shows
 * well above it, and a fair one stays under it.
 */
export function blindBound(kind: 'numeric' | 'choice', options: number, samples: number): number {
  if (kind === 'numeric') return BLIND_BOUND
  if (options < 2 || samples < 1) return 1
  const chance = 1 / options
  return Math.max(BLIND_BOUND, chance + 3 * Math.sqrt((chance * (1 - chance)) / samples))
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The share of `answers` that are right for `item`: a blind learner who picks among them at random scores that share. */
function hitRate(gen: Gen, item: Item, answers: readonly Response[] | null): number {
  if (answers === null || answers.length === 0) return 0
  let hits = 0
  for (const response of answers) if (gen.grade(item, response).ok) hits += 1
  return hits / answers.length
}

/** The strategies that need no knowledge of a family: for a choice, every position, every id, and the longest and shortest option. */
function choiceStrategies(items: readonly Item[]): BlindStrategy[] {
  const out: BlindStrategy[] = []
  let widest = 0
  const ids = new Set<string>()
  for (const item of items) {
    if (item.answer.kind !== 'choice') continue
    widest = Math.max(widest, item.answer.options.length)
    for (const option of item.answer.options) ids.add(option.id)
  }
  for (let at = 0; at < widest; at += 1) {
    out.push({
      id: `position-${at + 1}`,
      describe: `always the option shown in place ${at + 1}`,
      answers: (item) => {
        const option = item.answer.kind === 'choice' ? item.answer.options[at] : undefined
        return option === undefined ? null : [{ kind: 'choice', pick: option.id }]
      },
    })
  }
  for (const id of [...ids].sort(byText)) {
    out.push({
      id: `id-${id}`,
      describe: `always the option with the id ${id}`,
      answers: (item) => (item.answer.kind === 'choice' && item.answer.options.some((option) => option.id === id) ? [{ kind: 'choice', pick: id }] : null),
    })
  }
  const byLength = (longest: boolean): BlindStrategy['answers'] => (item) => {
    if (item.answer.kind !== 'choice') return null
    const lengths = item.answer.options.map((option) => plain(option.text).length)
    const target = longest ? Math.max(...lengths) : Math.min(...lengths)
    return item.answer.options.filter((_, at) => lengths[at] === target).map((option): Response => ({ kind: 'choice', pick: option.id }))
  }
  out.push({ id: 'longest', describe: 'always the longest option (a tie is picked among)', answers: byLength(true) })
  out.push({ id: 'shortest', describe: 'always the shortest option (a tie is picked among)', answers: byLength(false) })
  return out
}

/** For a numeric item, each number printed on the ticket as the answer: an item whose key is one of its own givens teaches reading. */
function echoStrategies(items: readonly Item[]): BlindStrategy[] {
  const labels = new Set<string>()
  for (const item of items) for (const given of item.givens) if (given.value.t === 'num') labels.add(given.label)
  return [...labels].sort(byText).map((label) => ({
    id: `echo-${label}`,
    describe: `the number printed as "${label}", as it stands`,
    answers: (item) => {
      const given = item.givens.find((candidate) => candidate.label === label)
      return given !== undefined && given.value.t === 'num' ? [{ kind: 'numeric', value: given.value.value }] : null
    },
  }))
}

/** One strategy's best rate on one kind of question at one level. */
export interface BlindRow {
  readonly level: Level
  readonly variant: string
  readonly kind: 'numeric' | 'choice'
  readonly strategy: string
  readonly describe: string
  /** The share of the variant's items it passes. */
  readonly rate: number
  /** Items of the variant in the sample. */
  readonly n: number
  readonly bound: number
}

export interface BlindReport {
  readonly level: Level
  /** Items measured. */
  readonly samples: number
  /** The best strategy of each variant. */
  readonly best: readonly BlindRow[]
  /** The rows over their bound, worst first. */
  readonly over: readonly BlindRow[]
  /** What a blind learner passes overall, using the best habit for each variant. */
  readonly overall: number
}

/**
 * Measures a family at `level` on `seeds` (which should be in band): for each variant, every generic strategy, the best constant
 * answer of a numeric variant, and the family's own strategies, each as the share of the variant's items it passes.
 */
export function measureBlind(gen: Gen, level: Level, seeds: readonly number[]): BlindReport {
  const items = seeds.map((seed) => gen.make(seed, level))
  const byVariant = new Map<string, Item[]>()
  for (const item of items) byVariant.set(item.variant, [...(byVariant.get(item.variant) ?? []), item])

  const best: BlindRow[] = []
  let weighted = 0
  for (const variant of [...byVariant.keys()].sort(byText)) {
    const group = byVariant.get(variant) ?? []
    const kind = group[0].answer.kind
    const options = group[0].answer.kind === 'choice' ? group[0].answer.options.length : 0
    const bound = blindBound(kind, options, group.length)
    const rows: BlindRow[] = []
    const row = (strategy: string, describe: string, rate: number): void => {
      rows.push({ level, variant, kind, strategy, describe, rate, n: group.length, bound })
    }

    const strategies: BlindStrategy[] = [...(kind === 'choice' ? choiceStrategies(group) : echoStrategies(group)), ...(gen.blind ?? [])]
    for (const strategy of strategies) {
      let hits = 0
      for (const item of group) hits += hitRate(gen, item, strategy.answers(item))
      row(strategy.id, strategy.describe, hits / group.length)
    }

    if (kind === 'numeric') {
      // The best constant: the one number that passes the most items, tried at every key the sample has.
      const constants = [...new Set(group.map((item) => (item.answer.kind === 'numeric' ? item.answer.truth : 0)))].sort((a, b) => a - b)
      let top = { value: 0, rate: -1 }
      for (const value of constants) {
        const answers: Response[] = [{ kind: 'numeric', value }]
        let hits = 0
        for (const item of group) hits += hitRate(gen, item, answers)
        if (hits / group.length > top.rate) top = { value, rate: hits / group.length }
      }
      row('constant', `always the same number, here ${top.value}`, Math.max(top.rate, 0))
    }

    if (rows.length === 0) continue
    const winner = rows.reduce((a, b) => (b.rate > a.rate ? b : a))
    best.push(winner)
    weighted += (group.length / items.length) * winner.rate
  }
  const over = best.filter((row) => row.rate > row.bound).sort((a, b) => b.rate - b.bound - (a.rate - a.bound))
  return { level, samples: items.length, best, over, overall: weighted }
}

/** What a band accepts of `count` fixed candidates, for the gate to print and hold to `BAND_FLOOR`. */
export function bandAcceptance(gen: Pick<Gen, 'band'>, level: Level, count = BAND_SAMPLE): { accepted: number; tried: number; rate: number } {
  let accepted = 0
  for (const seed of fixedSeeds(count, 0xba4d)) if (gen.band(seed, level)) accepted += 1
  return { accepted, tried: count, rate: accepted / count }
}

/** `count` fixed seeds that the band accepts at `level`, for a measurement; fewer when the band accepts too little to find them in `scan` candidates. */
export function bandedSeeds(gen: Pick<Gen, 'band'>, level: Level, count = BLIND_SAMPLE, scan = count * 50): number[] {
  const out: number[] = []
  for (const seed of fixedSeeds(scan, 0xb11d)) {
    if (gen.band(seed, level)) out.push(seed)
    if (out.length === count) break
  }
  return out
}
