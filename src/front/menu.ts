/*
 * The menu teaser's data (TRACKER W0-T18): the course index, read before the front page renders, so the menu is printed in the first
 * render exactly as it is in the static HTML that the build writes from it (A§6.11: below the fold, in plain HTML).
 *
 * The route's loader reads it. On the server renderer of the tests, which has no `import.meta.glob`, the index does not load and the
 * page prints the menu's fallback instead, which points at the course map.
 */
import type { ContentIndex, IndexModule } from '@es/schema'
import { loadIndex } from '@/content/load'
import { MENU } from './copy'

export interface FrontData {
  readonly index: ContentIndex | null
}

/** The route's loader: the course index, or null when it cannot be read. */
export async function loader(): Promise<FrontData> {
  try {
    return { index: await loadIndex() }
  } catch {
    return { index: null }
  }
}

/** The lanes a module works in, as the menu names them: browser, laptop, GPU (ARCHITECTURE §8.1). */
export function lanesOf(module: Pick<IndexModule, 'hours_by_lane'>): string[] {
  return (['B', 'L', 'F'] as const).filter((lane) => (module.hours_by_lane[lane] ?? 0) > 0).map((lane) => MENU.lanes[lane])
}

/** How many decimals an hour count needs: none for a whole number, one for a half. */
export const decimalsOf = (hours: number): number => (Number.isInteger(hours) ? 0 : 1)

/** A module's id as the menu prints it: TR5a, capstone. */
export const menuId = (id: string): string => (/^tr\d/.test(id) ? `TR${id.slice(2)}` : id)

/**
 * The course's first lesson as the front page names it: "TR1 lesson 1", its title up to the first colon ("Five mechanisms"), its
 * minutes, what it needs in words ("browser only", "browser and GPU") and its route. Null when the index has no lesson.
 */
export function firstLesson(index: ContentIndex | null) {
  const module = index?.modules.find((candidate) => candidate.lessons.length > 0)
  const lesson = module?.lessons[0]
  if (module === undefined || lesson === undefined) return null
  const lanes = (lesson.needs ?? ['B']).map((lane) => MENU.lanes[lane])
  return { name: `${menuId(module.id)} lesson 1`, title: lesson.title.split(':')[0], minutes: lesson.minutes, needs: `${lanes.join(' and ')}${lanes.length === 1 ? ' only' : ''}`, route: lesson.route }
}
