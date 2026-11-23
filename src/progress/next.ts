/*
 * The way on (REDESIGN §2.4): what the learner does next, read from their events and the compiled lessons table, and nothing else.
 *
 * `nextStep(events, lessons, bookmark)` answers "what next" for every page, and it is the only thing that does: the header's Continue,
 * the button at the top of Course and of a module, and every empty state show its answer, with its words and its link. It is pure: no
 * clock, no store, no React. The page that calls it reads the events from the ledger and the bookmark from `es:here`, and keeps a copy of
 * the answer in `es:next` so that a page which opens no ledger can label Continue (D-066).
 *
 * Three things are kept apart. Evidence is the ledger's events, and progress and "done" are read from them alone. The bookmark is a place
 * (the lesson and part last in view), never progress. The pointer is a copy of this function's last answer.
 *
 * Reading writes no event, so only a lesson's Run and Test have a state:
 *   Run   done when a play event exists for each of its opener's refs;
 *   Test  passed when the last `count` attempts at each of its question families were right at full weight, and each graded level has a
 *         passing graded run (a practice pass never passes a graded level); tried when any attempt exists;
 *   a lesson is not started, started (any event of its own) or done (its Test passed).
 *
 * Which lesson an event belongs to: a prediction names its lesson; a run or a question belongs to every lesson whose table lists its ref
 * or family. Where several do (`loop/graphs` in TR2 lessons 5 and 6), it belongs to the one whose `rev` it carries, and when none matches
 * (an older rev, or a run on /play) it counts for each of them. For "last worked on", such an event goes to the bookmark's lesson if that
 * is one of them, and otherwise to the earliest of them that is not done.
 *
 * The five rules, in order:
 *   1. no events and no bookmark: the first lesson of the course (the start module's, `start` in course.yaml), "Start";
 *   2. `current` is the lesson last worked on: the later of the most recent event and the bookmark;
 *   3. `current` not done: its Run if that is not done, else the bookmark's part if the bookmark is in it, else Read if its Test has no
 *      attempt, else its Test;
 *   4. `current` done: the next lesson after it that is not done, with `skipped` the lessons before that one that are not done;
 *   5. none after it: the first lesson not done; if every lesson is done, Review when something is due, else Course.
 * Reviews due never change the answer for a lesson. A page shows them beside it as a second, quiet line.
 */
import { weightOf } from '@es/ledger/provenance'
import type { LedgerEvent } from '@es/ledger/types'
import type { FamilyCount, MapLesson } from '@es/schema/compiled'
import { ATTEMPT_WORDS, moduleCode } from './words'

/** A lesson's sections (REDESIGN §2.5). */
export const SECTIONS = ['run', 'read', 'test', 'keep'] as const
export type SectionId = (typeof SECTIONS)[number]

/** The place last in view on a lesson page, as `es:here` holds it. It is a place, and never progress. */
export interface Bookmark {
  /** The lesson's route: `/m/tr2/l1-one-step-five-calls`. */
  readonly route: string
  readonly section?: SectionId
  /** The part's heading id, as the page draws it. */
  readonly part?: string
  /** The part's title, for the words of the way on. */
  readonly title?: string
  /** When the place was last in view, as an ISO instant. */
  readonly at: string
}

export type LessonState = 'not-started' | 'started' | 'done'
export type TestState = 'none' | 'tried' | 'passed'

/** Where a lesson stands, from its own events. */
export interface Standing {
  readonly lesson: MapLesson
  readonly state: LessonState
  /** Null when the lesson has no Run. */
  readonly run: boolean | null
  readonly test: TestState
  /** The events that belong to it. */
  readonly events: readonly LedgerEvent[]
}

/** Where the answer points: the start of a lesson, a section of one, the bookmark's part, Review or Course. */
export type StepPlace = 'lesson' | 'run' | 'part' | 'read' | 'test' | 'review' | 'course'

/** `nextStep`'s answer. */
export interface Step {
  readonly href: string
  /** "Start: TR1 lesson 1" or "Continue: TR2 lesson 1, read why". */
  readonly label: string
  /** "Start" or "Continue": the label's first word, for a control that has no room for the rest. */
  readonly word: 'Start' | 'Continue'
  /** The lesson's minutes when the answer is the start of a lesson. */
  readonly minutes?: number
  /** The lanes the target lesson is worked in; empty for Review and Course. */
  readonly needs: readonly string[]
  /** What the learner does there, as the words after "Next:": "read why, then 3 questions". */
  readonly reason: string
  /** The lessons before the target, in course order, that are not done. */
  readonly skipped: number
  readonly place: StepPlace
  /** The target lesson's id, or null for Review and Course. */
  readonly lesson: string | null
  /** The target lesson's module, or null. */
  readonly module: string | null
}

export interface NextOptions {
  /** Reviews due now: only rule 5 reads it, when every lesson is done. */
  readonly due?: number
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Words                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */


/** "TR2 lesson 3": the lesson's module and its place in it. */
export function lessonName(lesson: MapLesson, lessons: readonly MapLesson[]): string {
  const own = lessons.filter((candidate) => candidate.module === lesson.module)
  return `${moduleCode(lesson.module)} lesson ${own.indexOf(lesson) + 1}`
}

/** The lanes in words: "browser only", or "browser and GPU". */
export function needsWords(needs: readonly string[]): string {
  const names: Record<string, string> = { B: 'browser', L: 'laptop', F: 'GPU' }
  const words = needs.map((lane) => names[lane] ?? lane)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0] === 'browser' ? 'browser only' : `${words[0]} only`
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/** "a, b and c". */
const listed = (parts: readonly string[]): string => (parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`)

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

/** How many questions a Test asks. */
const questionCount = (lesson: MapLesson): number => lesson.test.questions.reduce((sum, row) => sum + row.count, 0)

/* ------------------------------------------------------------------------------------------------------------------ */
/* Which lesson an event belongs to                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The table's lookups: a lesson by id, the lessons that list a run's ref, and the lessons that list a family. */
export interface LessonIndex {
  readonly lessons: readonly MapLesson[]
  readonly byId: ReadonlyMap<string, MapLesson>
  readonly byRef: ReadonlyMap<string, readonly MapLesson[]>
  readonly byFamily: ReadonlyMap<string, readonly MapLesson[]>
  /** A lesson's place in course order. */
  readonly order: ReadonlyMap<MapLesson, number>
}

export function indexLessons(lessons: readonly MapLesson[]): LessonIndex {
  const byRef = new Map<string, MapLesson[]>()
  const byFamily = new Map<string, MapLesson[]>()
  const push = (map: Map<string, MapLesson[]>, key: string, lesson: MapLesson) => {
    const list = map.get(key) ?? []
    if (!list.includes(lesson)) list.push(lesson)
    map.set(key, list)
  }
  for (const lesson of lessons) {
    for (const ref of [...lesson.run, ...lesson.inline, ...lesson.test.graded]) push(byRef, ref, lesson)
    for (const row of [...lesson.checkpoints, ...lesson.test.questions]) push(byFamily, row.family, lesson)
  }
  return {
    lessons,
    byId: new Map(lessons.map((lesson) => [lesson.id, lesson])),
    byRef,
    byFamily,
    order: new Map(lessons.map((lesson, at) => [lesson, at])),
  }
}

/*
 * The three ref forms the way on reads (ARCHITECTURE §4.5): `predict:<lesson>#<id>`, `item:gen/<family>/<variant>` and
 * `play:<game>/<level>`. They are read here by their shape, and not through @es/schema/refs, whose validators would bring zod to every
 * page that shows the way on.
 */
const lessonOfPredict = (ref: string): string | undefined => /^predict:([a-z0-9.]+)#/.exec(ref)?.[1]
const familyOfItem = (ref: string): string | undefined => /^item:gen\/([^/]+)\//.exec(ref)?.[1]
const levelOfPlay = (ref: string): { game: string; level: string } | undefined => {
  const match = /^play:([^/]+)\/([^/]+)$/.exec(ref)
  return match === null ? undefined : { game: match[1], level: match[2] }
}

/** Every lesson whose table lists the event, before the `rev` decides between several. */
function listers(event: LedgerEvent, index: LessonIndex): readonly MapLesson[] {
  if (event.kind === 'predict') {
    const lesson = index.byId.get(lessonOfPredict(event.ref) ?? '')
    return lesson === undefined ? [] : [lesson]
  }
  if (event.kind === 'play') return index.byRef.get(event.ref) ?? []
  if (event.kind === 'item') return index.byFamily.get(familyOfItem(event.ref) ?? '') ?? []
  return []
}

/**
 * The lessons an event is evidence for: one when its ref names one lesson or its `rev` picks one out of several, and every lister when
 * its `rev` matches none of them, because the learner did run that level.
 */
export function ownersOf(event: LedgerEvent, index: LessonIndex): readonly MapLesson[] {
  const listed = listers(event, index)
  if (listed.length < 2) return listed
  const matching = listed.filter((lesson) => lesson.rev === event.rev)
  return matching.length > 0 ? matching : listed
}

const byTime = (a: LedgerEvent, b: LedgerEvent): number => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)

/**
 * Where each event goes, for a lesson's standing (REDESIGN §2.4). A prediction, and a run that one lesson lists or whose `rev` picks one
 * out, place themselves: they name the lesson the learner was in. A question carries no lesson (its ref names a family that several
 * lessons may ask, and its `rev` is the family's), so it goes to the lesson the learner was in when they answered it: the lesson of the
 * last event before it that placed itself, when that lesson asks the family; for the answers after the last such event, the bookmark's
 * lesson when it asks the family; and otherwise the first lesson, in course order, that asks it. So a question answered in TR1 lesson 1
 * counts for lesson 1's skill and never starts or passes lesson 6, which asks the same family. A run with no matching `rev` still counts
 * for every lesson that lists it (`ownersOf`).
 */
export function placeEvents(events: readonly LedgerEvent[], index: LessonIndex, bookmark: Bookmark | null = null): ReadonlyMap<LedgerEvent, readonly MapLesson[]> {
  const placed = new Map<LedgerEvent, readonly MapLesson[]>()
  const marked = bookmark === null ? undefined : index.lessons.find((lesson) => lesson.route === bookmark.route)
  const sorted = [...events].sort(byTime)
  let lastSelf = ''
  for (const event of sorted) {
    const owners = ownersOf(event, index)
    if (owners.length === 1 && event.kind !== 'item') lastSelf = event.at
  }
  let here: MapLesson | undefined
  for (const event of sorted) {
    const owners = ownersOf(event, index)
    if (event.kind !== 'item' || owners.length < 2) {
      placed.set(event, owners)
      if (owners.length === 1) here = owners[0]
      continue
    }
    const trailing = marked !== undefined && event.at >= lastSelf && (bookmark?.at ?? '') >= lastSelf
    const at = trailing && owners.includes(marked) ? marked : here !== undefined && owners.includes(here) ? here : owners[0]
    placed.set(event, [at])
  }
  return placed
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Where each lesson stands                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------ */

const fullWeight = (event: LedgerEvent): boolean => 'provenance' in event && weightOf(event.provenance) === 1
const passedAtFull = (event: LedgerEvent): boolean => 'ok' in event && event.ok && fullWeight(event)

/** The item events of one family, in time order. */
function attemptsAt(events: readonly LedgerEvent[], family: string): LedgerEvent[] {
  return events
    .filter((event) => {
      return event.kind === 'item' && familyOfItem(event.ref) === family
    })
    .sort(byTime)
}

/** A question set's family is passed when its last `count` attempts were each right at full weight. */
export function familyPassed(events: readonly LedgerEvent[], row: FamilyCount): boolean {
  const last = attemptsAt(events, row.family).slice(-row.count)
  return last.length === row.count && last.every(passedAtFull)
}

/** A graded level is passed by a passing graded run: a practice pass, at part weight, never passes it. */
export const gradedPassed = (events: readonly LedgerEvent[], ref: string): boolean => events.some((event) => event.kind === 'play' && event.ref === ref && passedAtFull(event))

/** Where a Test stands among a lesson's own events. A practice run of a graded level's ref is not an attempt at the Test. */
export function testState(lesson: MapLesson, events: readonly LedgerEvent[]): TestState {
  const { questions, graded } = lesson.test
  if (questions.length + graded.length === 0) return 'none'
  const passed = questions.every((row) => familyPassed(events, row)) && graded.every((ref) => gradedPassed(events, ref))
  if (passed) return 'passed'
  const tried =
    questions.some((row) => attemptsAt(events, row.family).length > 0) || graded.some((ref) => events.some((event) => event.kind === 'play' && event.ref === ref && fullWeight(event)))
  return tried ? 'tried' : 'none'
}

/** Whether a Run is done: a play event for each of its opener's refs, one that was left before its end (`data.left`) not among them. Null when the lesson opens on reading. */
export function runDone(lesson: MapLesson, events: readonly LedgerEvent[]): boolean | null {
  if (lesson.opener === 'read' || lesson.run.length === 0) return null
  return lesson.run.every((ref) => events.some((event) => event.kind === 'play' && event.data?.left === undefined && event.ref === ref))
}

/** Every lesson's standing, from the events, in course order. */
export function standings(events: readonly LedgerEvent[], index: LessonIndex, bookmark: Bookmark | null = null): ReadonlyMap<string, Standing> {
  const own = new Map<MapLesson, LedgerEvent[]>(index.lessons.map((lesson) => [lesson, []]))
  const places = placeEvents(events, index, bookmark)
  for (const event of events) for (const lesson of places.get(event) ?? []) own.get(lesson)?.push(event)
  const out = new Map<string, Standing>()
  for (const lesson of index.lessons) {
    const mine = own.get(lesson) ?? []
    const test = testState(lesson, mine)
    out.set(lesson.id, { lesson, state: test === 'passed' ? 'done' : mine.length > 0 ? 'started' : 'not-started', run: runDone(lesson, mine), test, events: mine })
  }
  return out
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The lesson last worked on                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The most recent event that some lesson owns, and the lesson it goes to for "last worked on". */
function lastWorked(events: readonly LedgerEvent[], index: LessonIndex, stand: ReadonlyMap<string, Standing>, bookmarked: MapLesson | undefined, places: ReadonlyMap<LedgerEvent, readonly MapLesson[]>): { lesson: MapLesson; at: string } | null {
  let latest: { event: LedgerEvent; owners: readonly MapLesson[] } | null = null
  for (const event of events) {
    const owners = places.get(event) ?? ownersOf(event, index)
    if (owners.length === 0) continue
    if (latest === null || event.at >= latest.event.at) latest = { event, owners }
  }
  if (latest === null) return null
  const { owners, event } = latest
  if (owners.length === 1) return { lesson: owners[0], at: event.at }
  if (bookmarked !== undefined && owners.includes(bookmarked)) return { lesson: bookmarked, at: event.at }
  const open = owners.find((lesson) => stand.get(lesson.id)?.state !== 'done')
  return { lesson: open ?? owners[0], at: event.at }
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* The answer                                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

const hrefOf = (lesson: MapLesson, anchor?: string): string => (anchor === undefined ? lesson.route : `${lesson.route}#${anchor}`)

/**
 * What is next, for every page (REDESIGN §2.4). `lessons` is the map's lessons table in course order, and `bookmark` is `es:here` or
 * null. The same events, table and bookmark always give the same answer.
 */
export function nextStep(events: readonly LedgerEvent[], lessons: readonly MapLesson[], bookmark: Bookmark | null, options: NextOptions = {}): Step {
  const index = indexLessons(lessons)
  const places = placeEvents(events, index, bookmark)
  const stand = standings(events, index, bookmark)
  const done = (lesson: MapLesson) => stand.get(lesson.id)?.state === 'done'
  // A lesson of a module that stands before the course's start (`before`) is never an earlier lesson not finished.
  const skippedBefore = (lesson: MapLesson) => lessons.slice(0, index.order.get(lesson) ?? 0).filter((earlier) => earlier.before !== true && !done(earlier)).length
  const name = (lesson: MapLesson) => lessonName(lesson, lessons)

  const at = (lesson: MapLesson, place: StepPlace, href: string, words: string, reason: string, word: 'Start' | 'Continue' = 'Continue'): Step => ({
    href,
    label: `${word}: ${name(lesson)}${words === '' ? '' : `, ${words}`}`,
    word,
    ...(place === 'lesson' ? { minutes: lesson.minutes } : {}),
    needs: lesson.needs,
    reason,
    skipped: skippedBefore(lesson),
    place,
    lesson: lesson.id,
    module: lesson.module,
  })
  const start = (lesson: MapLesson, word: 'Start' | 'Continue' = 'Continue') => at(lesson, 'lesson', lesson.route, word === 'Start' ? '' : lesson.title, `${name(lesson)}, ${lesson.title}`, word)

  const first = lessons.find((lesson) => lesson.before !== true) ?? lessons[0]
  const placed = bookmark === null ? undefined : lessons.find((lesson) => lesson.route === bookmark.route)
  const mark = placed === undefined ? null : bookmark

  // Rule 5, also the answer when nothing a lesson owns has happened yet: the first lesson not done, then Review or Course.
  const fallback = (after?: MapLesson): Step => {
    const from = after === undefined ? 0 : (index.order.get(after) ?? -1) + 1
    // Lessons before the start are offered only when no lesson from the start on is left.
    const target =
      lessons.slice(from).find((lesson) => !done(lesson)) ?? lessons.find((lesson) => lesson.before !== true && !done(lesson)) ?? lessons.find((lesson) => !done(lesson))
    if (target !== undefined) return start(target)
    const due = options.due ?? 0
    if (due > 0) return { href: '/today', label: 'Continue: Review', word: 'Continue', needs: [], reason: `${plural(due, 'review')} due`, skipped: 0, place: 'review', lesson: null, module: null }
    return { href: '/map', label: 'Continue: Course', word: 'Continue', needs: [], reason: 'every lesson is done: choose one to go over', skipped: 0, place: 'course', lesson: null, module: null }
  }

  // Rule 1.
  if (first === undefined) return fallback()
  if (events.length === 0 && mark === null) return start(first, 'Start')

  // Rule 2: the later of the most recent event and the bookmark.
  const worked = lastWorked(events, index, stand, placed, places)
  const current = mark !== null && placed !== undefined && (worked === null || mark.at >= worked.at) ? placed : worked?.lesson
  if (current === undefined) return fallback()

  // Rule 4 and 5: a done lesson hands on to the next one after it that is not done.
  const standing = stand.get(current.id)
  if (standing === undefined || standing.state === 'done') return fallback(current)

  // Rule 3: inside the current lesson.
  if (standing.run === false) return at(current, 'run', hrefOf(current), 'the run', 'run the opening level')
  if (mark !== null && placed === current && mark.section !== 'run' && (mark.part !== undefined || mark.section !== undefined)) {
    const anchor = mark.part ?? (mark.section === 'test' ? current.anchors.test : mark.section === 'read' ? current.anchors.read : undefined)
    const title = mark.title?.trim()
    return at(current, 'part', hrefOf(current, anchor), title ? title : 'where you left off', title ? `pick up at ${title}` : 'pick up where you left off')
  }
  const questions = questionCount(current)
  const then = questions > 0 ? plural(questions, 'question') : current.test.graded.length > 0 ? 'the graded level' : 'the Test'
  if (standing.test === 'none') return at(current, 'read', hrefOf(current, current.anchors.read), 'read why', `read why, then ${then}`)
  const retry = questions > 0 ? 'the questions' : 'the graded level'
  return at(current, 'test', hrefOf(current, current.anchors.test), retry, `retry ${retry}`)
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Progress told back                                                                                                 */
/* ------------------------------------------------------------------------------------------------------------------ */

/** The words for one attempt (REDESIGN §2.4): a pass at part weight is a pass in practice, and says so. */
export type AttemptWord = (typeof ATTEMPT_WORDS)[keyof typeof ATTEMPT_WORDS]

export function attemptWord(event: LedgerEvent): AttemptWord {
  if (!('ok' in event) || !event.ok) return ATTEMPT_WORDS.no
  const weight = weightOf(event.provenance)
  return weight === 1 ? ATTEMPT_WORDS.yes : weight > 0 ? ATTEMPT_WORDS.practice : ATTEMPT_WORDS.no
}

/** A level's name for the learner: "KV page pool, One KV group". The page passes the game registry's titles; an id is never shown. */
export type LevelNamer = (game: string, level: string) => string | undefined

/**
 * Progress told back as one sentence (REDESIGN §2.4): what the learner did on their last day of work in the lesson last worked on.
 * "Last time: you ran KV page pool, One KV group (passed in practice) and tried 3 questions in TR5a lesson 1." Null with no lesson event.
 * It reads the events and the place last in view, and stores nothing.
 */
export function lastTime(events: readonly LedgerEvent[], lessons: readonly MapLesson[], names: LevelNamer = () => undefined, bookmark: Bookmark | null = null): string | null {
  const index = indexLessons(lessons)
  const stand = standings(events, index, bookmark)
  // A question set several lessons list belongs to the lesson the learner was reading, as for the way on, and not to the earliest that is open.
  const placed = bookmark === null ? undefined : lessons.find((lesson) => lesson.route === bookmark.route)
  const worked = lastWorked(events, index, stand, placed, placeEvents(events, index, bookmark))
  if (worked === null) return null
  const lesson = worked.lesson
  const own = (stand.get(lesson.id)?.events ?? []).slice().sort(byTime)
  const day = own.at(-1)?.day
  const today = own.filter((event) => event.day === day)

  const parts: string[] = []
  const runs = new Map<string, LedgerEvent>()
  for (const event of today) if (event.kind === 'play') runs.set(event.ref, event)
  for (const [ref, event] of runs) {
    const parsed = levelOfPlay(ref)
    const named = parsed === undefined ? undefined : names(parsed.game, parsed.level)
    parts.push(`ran ${named ?? 'a level'} (${attemptWord(event)})`)
  }
  const guesses = today.filter((event) => event.kind === 'predict').length
  if (guesses > 0) parts.push(guesses === 1 ? 'made a guess' : `made ${guesses} guesses`)
  const items = today.filter((event) => event.kind === 'item')
  if (items.length > 0) parts.push(`${items.every(passedAtFull) ? 'passed' : 'tried'} ${plural(items.length, 'question')}`)
  if (parts.length === 0) return null
  return `Last time: you ${listed(parts)} in ${lessonName(lesson, lessons)}.`
}
