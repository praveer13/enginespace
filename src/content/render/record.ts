/*
 * What a lesson page tells back from the ledger (REDESIGN §2.5): the rail's answers under each section ("you said 300 pages"), the Test's
 * tally ("3 of 3: passed"), and the lesson record that closes Keep, lines in the mono face that can be copied as text. Every line is a
 * reading of the ledger's events against the map's row for the lesson, and nothing here is stored.
 *
 * A run's line says what the ledger holds of it: the level, and the attempt in words (passed, passed in practice, not yet). The ledger keeps
 * a run's action log and its grade, not its readouts, so no readout is quoted that a replay would have to recompute.
 *
 * Pure: no DOM, no React, no clock, no store.
 */
import { weightOf } from '@es/ledger/provenance'
import type { LedgerEvent } from '@es/ledger/types'
import type { MapLesson } from '@es/schema/compiled'
import { CONFIDENCE_NAMES } from '@es/play/items/types'
import { attemptWord, indexLessons, lessonName, placeEvents, testState, type Bookmark, type LevelNamer } from '@/progress/next'
import { unitName } from './slip'

/** The events that belong to one lesson, by the way on's rule (`placeEvents`: a question goes to the lesson it was answered in). */
export function lessonEvents(events: readonly LedgerEvent[], lessons: readonly MapLesson[], id: string, bookmark: Bookmark | null = null): LedgerEvent[] {
  const places = placeEvents(events, indexLessons(lessons), bookmark)
  return events.filter((event) => (places.get(event) ?? []).some((lesson) => lesson.id === id))
}

const byTime = (a: LedgerEvent, b: LedgerEvent): number => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
const figure = (value: number): string => value.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** A unit's name for one of it: "1 stage", "1 boundary"; a unit that is not a plural noun ("µs", "ms") is left as it is. */
const one = (name: string): string => (/[a-z]{2,}ies$/.test(name) ? `${name.slice(0, -3)}y` : /[a-z]{2,}[^su]s$/.test(name) ? name.slice(0, -1) : name)

/** A guess's value in words: "300 pages", "120 to 200 µs", or the option's id. */
function valueWords(value: unknown, unit: string | undefined): string {
  const tail = unit === undefined ? '' : unit === '%' ? '%' : ` ${value === 1 ? one(unitName(unit)) : unitName(unit)}`
  if (typeof value === 'number') return `${figure(value)}${tail}`
  if (typeof value === 'object' && value !== null && 'lo' in value && 'hi' in value) return `${figure(Number(value.lo))} to ${figure(Number(value.hi))}${tail}`
  return String(value)
}

export interface GuessLine {
  readonly ref: string
  /** "you said 300 pages". */
  readonly said: string
  /** "guess 300 pages (think so), model 260 pages". */
  readonly record: string
}

/** The lesson's guesses as the ledger holds them: the last reveal of each. */
export function guessLines(own: readonly LedgerEvent[]): GuessLine[] {
  const last = new Map<string, LedgerEvent>()
  for (const event of [...own].sort(byTime)) if (event.kind === 'predict') last.set(event.ref, event)
  return [...last.values()].flatMap((event) => {
    if (event.kind !== 'predict') return []
    const { value, truth, unit } = event.data
    const sure = event.conf === undefined ? '' : ` (${CONFIDENCE_NAMES[event.conf]})`
    return [{ ref: event.ref, said: `you said ${valueWords(value, unit)}`, record: `guess ${valueWords(value, unit)}${sure}, model ${valueWords(truth, unit)}` }]
  })
}

export interface RunLine {
  readonly ref: string
  /** "One KV group: passed in practice". */
  readonly text: string
}

/** The lesson's runs as the ledger holds them: the best attempt at each level, in words. */
export function runLines(own: readonly LedgerEvent[], refs: readonly string[], names: LevelNamer): RunLine[] {
  const rank = { 'not yet': 0, 'passed in practice': 1, passed: 2 } as const
  return refs.flatMap((ref) => {
    const runs = own.filter((event) => event.kind === 'play' && event.ref === ref)
    if (runs.length === 0) return []
    const best = runs.map(attemptWord).reduce((a, b) => (rank[b] > rank[a] ? b : a))
    const match = /^play:([^/]+)\/(.+)$/.exec(ref)
    const name = match === null ? undefined : names(match[1], match[2])
    return [{ ref, text: `${name ?? 'a level'}: ${best}` }]
  })
}

export interface Tally {
  readonly right: number
  readonly of: number
  readonly passed: boolean
  readonly tried: boolean
}

/** The Test's question set: of the last `count` attempts at each family, how many were right at full weight. */
export function tally(row: MapLesson, own: readonly LedgerEvent[]): Tally {
  let right = 0
  let of = 0
  let tried = false
  for (const family of row.test.questions) {
    const attempts = own.filter((event) => event.kind === 'item' && new RegExp(`^item:gen/${family.family.replace(/\./g, '\\.')}/`).test(event.ref)).sort(byTime)
    if (attempts.length > 0) tried = true
    const last = attempts.slice(-family.count)
    of += family.count
    right += last.filter((event) => 'ok' in event && event.ok && 'provenance' in event && weightOf(event.provenance) === 1).length
  }
  return { right, of, passed: testState(row, own) === 'passed', tried }
}

/**
 * The rail's Test line: "3 of 3: passed", or, before the pass, the running count the rule reads, "1 of your last 3 answers right". The
 * practice questions in Read ask the same kinds as the Test and count toward it, so before the Test is started this line already reads
 * them: it is the skill's count, and says so, never a Test result the learner did not take.
 */
export function tallyWords(count: Tally): string {
  if (count.passed && count.of > 0) return `${count.right} of ${count.of}: passed`
  return `${count.right} of your last ${count.of} answers right`
}

/**
 * The lesson record: "TR5a lesson 1", then a line for each guess, each run and the Test. It is what the ledger holds for this lesson and
 * nothing more, so a lesson with no events has one line, its name, and the line that says so.
 */
export function lessonRecord(row: MapLesson, lessons: readonly MapLesson[], events: readonly LedgerEvent[], names: LevelNamer, bookmark: Bookmark | null = null): string[] {
  const own = lessonEvents(events, lessons, row.id, bookmark)
  const lines = [lessonName(row, lessons)]
  for (const guess of guessLines(own)) lines.push(guess.record)
  for (const run of runLines(own, [...row.run, ...row.inline, ...row.test.graded], names)) lines.push(run.text)
  const count = tally(row, own)
  if (row.test.questions.length > 0 && count.tried) lines.push(`questions ${tallyWords(count)}`)
  if (lines.length === 1) lines.push('nothing yet: a run, a guess and the questions each add a line')
  return lines
}
