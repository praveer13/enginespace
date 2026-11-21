/*
 * The front page's way on (REDESIGN §2.4, §3.1), as pure functions the page and the tests share:
 *
 *   - `returningOf`: a returning learner's place, read from the pointer (`es:next`, D-066) and never from the ledger (D-038). A pointer that
 *     says Continue is a learner who has done something; one that says Start, or none, is a first visit.
 *   - `courseLine`: the quiet line under the paragraph, the module range and the hours by lane, from the course index.
 *   - `startLabel`: the course's first lesson as a Start control names it: "Start the course: TR1 lesson 1 (35 min, browser only)".
 *   - `introOpens`: whether the instrument's first-visit intro opens, from the pointer and the intro flag (`es:intro`).
 */
import { FIRST_SERVICE } from '@es/play/loop/entry'
import { loopPartsOf } from '@es/play/loop/parts'
import type { LoopLevelId } from '@es/play/loop/types'
import type { ContentIndex } from '@es/schema'
import { START_POINTER, type Pointer } from '@/settings/store'
import { hoursSplit, LANE_ORDER } from '@/map/summary'
import { PATH, RESULT } from './copy'
import { firstLesson } from './menu'

/** Where a returning learner left off: the place and what comes next there, or the pointer's own words where it names no lesson. */
export interface Returning {
  /** The pointer itself: the Continue control takes its words and its link from it. */
  readonly pointer: Pointer
  readonly href: string
  /** The pointer's label, which the Continue control prints: "Continue: TR2 lesson 1, read why". */
  readonly label: string
  /** "TR2 lesson 1", or null when the pointer names Review or Course. */
  readonly place: string | null
  /** "read why", or the pointer's target where it names no lesson ("Review"). */
  readonly next: string
}

/** The returning learner's place, or null on a first visit. */
export function returningOf(pointer: Pointer | null): Returning | null {
  if (pointer === null || pointer.word !== 'Continue') return null
  const body = pointer.label.replace(/^Continue:\s*/, '').trim()
  const lesson = /^(TR\w+ lesson \d+)(?:,\s*(.+))?$/.exec(body)
  if (lesson === null) return { pointer, href: pointer.href, label: pointer.label, place: null, next: body }
  return { pointer, href: pointer.href, label: pointer.label, place: lesson[1], next: lesson[2] ?? 'the lesson' }
}

/**
 * The course's hours from the index, as the front page's line says them: the hours of the published modules in all and by lane, and the hours
 * the whole course plans. Every figure is [estimated] (docs/PLAN.md §4) or a sum of them. `planned` equals `total` once every module is published.
 */
export interface CourseHours {
  readonly total: number
  readonly planned: number
  readonly lanes: readonly { readonly lane: 'B' | 'L' | 'F'; readonly words: string; readonly hours: number }[]
}

export function courseHours(index: ContentIndex | null): CourseHours | null {
  if (index === null || index.modules.length === 0) return null
  const split = hoursSplit(index.modules)
  const lanes = LANE_ORDER.map((lane) => ({ lane, words: PATH.lanes[lane], hours: split.lanes[lane] })).filter((row) => row.hours > 0)
  return { total: split.published, planned: split.planned, lanes }
}

/**
 * The Start control's words for the course's first lesson, short ("(35 min, browser only)") or with its title. Its word and its link are the
 * way on's for an empty ledger (`START_POINTER`, which tests/progress/next.test.ts holds to `nextStep`), and the index names the lesson.
 */
export function startLabel(index: ContentIndex | null, withTitle = false, way: Pointer = START_POINTER): { label: string; route: string } | null {
  const lesson = firstLesson(index)
  if (lesson === null) return null
  const title = withTitle ? `, ${lesson.title}` : ''
  return { label: `${way.word} ${RESULT.course}: ${lesson.name}${title} (${lesson.minutes} min, ${lesson.needs})`, route: way.href }
}

/** The parts the first demo level's intro names; the intro flag keeps them under the game's id once the intro ends. */
export const FIRST_PARTS: readonly string[] = loopPartsOf(FIRST_SERVICE[0].id as LoopLevelId).map((part) => part.id)

/** Where the intro stands: naming the parts, pointing at the first move, or over. */
export type IntroStage = 'parts' | 'move' | 'off'

/** Whether the intro opens: a first visit (no pointer that says Continue) whose flag has not kept the first level's parts. */
export function introOpens(returning: boolean, shown: readonly string[]): boolean {
  return !returning && !FIRST_PARTS.every((id) => shown.includes(id))
}
