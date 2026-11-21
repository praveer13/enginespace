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

/**
 * The course's hours split by what can be done today: the hours of the modules that are published, with their lanes, and the hours of
 * every module the course plans. Both are sums of the modules' own [estimated] hours, so they are [derived], and both come from the
 * rows the pages list (the index), so a module that publishes moves the figures with no edit.
 */
export interface HoursSplit {
  readonly published: number
  readonly planned: number
  readonly lanes: Record<Lane, number>
}

export function hoursSplit(modules: readonly Pick<IndexModule, 'hours' | 'hours_by_lane' | 'published'>[]): HoursSplit {
  const open = modules.filter((module) => module.published)
  return { published: open.reduce((sum, module) => sum + module.hours, 0), planned: modules.reduce((sum, module) => sum + module.hours, 0), lanes: laneTotals(open) }
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

/** A module's hours, and what they need, in words: "10 h, browser only" or "10 h: 7.5 h in the browser, then 2.5 h on a GPU". */
export function needsWords(module: Pick<IndexModule, 'hours' | 'hours_by_lane'>, words: { only: Record<Lane, string>; in: Record<Lane, string>; then: string }): string {
  const lanes = lanesOf(module)
  const hours = (value: number) => `${formatHours(value)} h`
  if (lanes.length === 0) return hours(module.hours)
  if (lanes.length === 1) return `${hours(module.hours)}, ${words.only[lanes[0].lane]}`
  return `${hours(module.hours)}: ${lanes.map(({ lane, hours: value }, at) => `${at === 0 ? '' : `${words.then} `}${hours(value)} ${words.in[lane]}`).join(', ')}`
}

/** An hour count as the page prints it: a whole number plain, a half with one digit. */
export const formatHours = (hours: number): string => (Number.isInteger(hours) ? String(hours) : hours.toFixed(1))

/** The first outcome of a module as the end of "You will be able to ...": its first letter lowered, unless it begins an acronym. */
export function outcomeClause(outcome: string): string {
  const text = outcome.trim().replace(/[.]$/, '')
  return /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text
}

/** How many of a module's lessons are done, from the states by lesson id. */
export function lessonCounts(lessons: readonly { id: string }[], states: ReadonlyMap<string, string>): { total: number; done: number } {
  return { total: lessons.length, done: lessons.filter((lesson) => states.get(lesson.id) === 'done').length }
}
