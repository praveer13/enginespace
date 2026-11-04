/*
 * What the course map works out before it draws, as pure functions: the hours of the course by lane, a module's lanes in the order
 * the architecture gives them, the words for a module's evidence, and how an id is printed. tests/map/ exercises them without a
 * browser, as tests/content/ does for the renderer's model.
 */
import type { IndexModule } from '@es/schema'
import type { KcCounts } from '@/progress/derive'

/** The three lanes of work in the order the architecture lists them (A§8.1): the browser, the laptop's CPU, a GPU. */
export const LANE_ORDER = ['B', 'L', 'F'] as const
export type Lane = (typeof LANE_ORDER)[number]

/** The hours of the whole course in each lane: the modules' [estimated] hours added up, which makes them [derived]. */
export function laneTotals(modules: readonly Pick<IndexModule, 'hours_by_lane'>[]): Record<Lane, number> {
  const totals: Record<Lane, number> = { B: 0, L: 0, F: 0 }
  for (const module of modules) for (const lane of LANE_ORDER) totals[lane] += module.hours_by_lane[lane] ?? 0
  return totals
}

/** How many digits after the point an hour count needs: none for a whole number, one for a half. */
export const decimalsOf = (hours: number): number => (Number.isInteger(hours) ? 0 : 1)

/** A module's id as the page prints it: TR5a, capstone. */
export const printedId = (id: string): string => (/^tr\d/.test(id) ? `TR${id.slice(2)}` : id)

/** The lanes a module works in, in order, with their hours. */
export function lanesOf(module: Pick<IndexModule, 'hours_by_lane'>): { lane: Lane; hours: number }[] {
  return LANE_ORDER.flatMap((lane) => {
    const hours = module.hours_by_lane[lane]
    return hours === undefined || hours <= 0 ? [] : [{ lane, hours }]
  })
}

/** What a module's evidence says, in the order a learner reads it. A module with no KCs yet has nothing to count. */
export interface Holding {
  readonly total: number
  readonly earned: number
  /** KCs practised and not yet earned. */
  readonly practising: number
  readonly kept: number
}

export function holdingOf(counts: KcCounts): Holding {
  return { total: counts.total, earned: counts.earned, practising: counts.practised - counts.earned, kept: counts.kept }
}
