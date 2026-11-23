/*
 * Progress told as rows (REDESIGN 2.3 and 2.4): what the learner did, one dated row each, in words: the day, what they did and how it came
 * out. A row is a reading of one ledger event and stores nothing. The words for how an attempt came out are src/progress/words.ts's
 * (not yet, passed in practice, passed), the same on every page that says them.
 *
 * The functions here are pure and read no clock, so the same events always give the same rows. An event names what it is about by its ref
 * (ARCHITECTURE 4.5), and the page hands in how to say a level and a lesson in the learner's words: an id is never shown.
 */
import type { LedgerEvent } from '@es/ledger'
import { weightOf } from '@es/ledger/provenance'
import type { MapLesson } from '@es/schema/compiled'
import { ATTEMPT_WORDS } from '@/progress/words'
import { indexLessons, lessonName, placeEvents } from '@/progress/next'
import type { Bookmark, LevelNamer } from '@/progress/next'
import { LAB_TITLES } from '@/forge/titles'
import { labForStage, stageOf } from '@/receipts/labs'

export interface ActivityRow {
  readonly id: string
  /** The learner's calendar day, `YYYY-MM-DD`, frozen when the event was written. */
  readonly day: string
  /** What they did: "Played KV page pool, One KV group". */
  readonly what: string
  /** Where it sits in the course, when it sits in a lesson: "TR5a lesson 1". */
  readonly where?: string
  /** How it came out, in the course's words. */
  readonly result: string
  /** "practice" or "graded" for a level, which decides what the result counts for. */
  readonly kind?: 'practice' | 'graded'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** `2026-11-16` as "16 Nov 2026". It is read from the day's own digits, so the zone it is read in moves nothing. */
export function dayWords(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (match === null) return day
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`
}

/** The one word for how an attempt came out: a pass at part weight is a pass in practice, and says so. */
export function resultOf(event: LedgerEvent): string {
  if (!('ok' in event) || !event.ok) return ATTEMPT_WORDS.no
  const weight = weightOf(event.provenance)
  return weight === 1 ? ATTEMPT_WORDS.yes : weight > 0 ? ATTEMPT_WORDS.practice : ATTEMPT_WORDS.no
}

/** A lab by its title in the engine's words, as its page heads it: "Build a hybrid KV cache manager". A lab this build has no title for is "a lab". */
const labWords = (lab: string): string => (Object.hasOwn(LAB_TITLES, lab) ? `“${LAB_TITLES[lab]}”` : 'a lab')

/** A stage of a lab with the lab's name: "“Build the Qwen3-0.6B forward pass on a CPU”, stage 3, with a KV cache". A stage this build does not list is "a stage of a lab". */
function stageWords(stage: string): string {
  const known = stageOf(stage)
  const lab = labForStage(stage)
  if (known === undefined || lab === undefined) return 'a stage of a lab'
  return `${labWords(lab.id)}, stage ${known.n}, ${known.name}`
}

/** How a guess came out against the truth, in the learner's words: "exact" when it was the answer itself, "close" when it was right within the bar, "off" otherwise. */
export const GUESS_WORDS = { exact: 'exact', close: 'close', off: 'off' } as const

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A prediction's reading: the value against the truth the reveal showed. A choice that is right, and a number or an interval that is the truth itself, is exact. */
function guessResult(event: Extract<LedgerEvent, { kind: 'predict' }>): string {
  if (!event.ok) return GUESS_WORDS.off
  const { value, truth } = event.data
  if (typeof value === 'string') return GUESS_WORDS.exact
  if (typeof value === 'number') return value === truth ? GUESS_WORDS.exact : GUESS_WORDS.close
  const point = typeof truth === 'object' ? truth.lo : truth
  return value.lo === value.hi && same(value.lo, point) ? GUESS_WORDS.exact : GUESS_WORDS.close
}

/** The whole-number guesses a run's own log holds: its `commit` actions, before the first move of a target. Nothing else of the log is read here. */
export function runGuesses(actions: string): number[] {
  try {
    const parsed: unknown = JSON.parse(actions)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((action: unknown) => {
      const a = action as { t?: unknown; prediction?: unknown } | null
      return a !== null && typeof a === 'object' && a.t === 'commit' && typeof a.prediction === 'number' && Number.isFinite(a.prediction) ? [a.prediction] : []
    })
  } catch {
    return []
  }
}

/** "1", "1 and 3", "1, 3 and 2". */
const listed = (values: readonly number[]): string => (values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`)

/** How a game's run reads in the log: "practice" until the level is graded. A graded level is one the compiled map lists as graded. */
export interface RowContext {
  lessons: readonly MapLesson[]
  /** A level's name: "KV page pool, One KV group". */
  levelName: LevelNamer
  /** What a question asks about, from its family and variant: "The gap with async scheduling off". Left out, a row says only that a question was answered. */
  itemName?: ItemNamer
  /** The place last in view, which settles a question that two lessons ask (`placeEvents`). Left out, a question goes by the events around it. */
  bookmark?: Bookmark | null
}

/** A question's subject for the learner: the words of its family's variant. Undefined for a family or variant this build does not list. */
export type ItemNamer = (family: string, variant: string) => string | undefined

const refParts = (ref: string): string[] => ref.slice(ref.indexOf(':') + 1).split('/')

/** The rows for a ledger's events, newest first. A challenge is a row too: it is something the learner did. An acknowledgement writes no result and gets none. */
export function activityRows(events: readonly LedgerEvent[], context: RowContext): ActivityRow[] {
  const index = indexLessons(context.lessons)
  const graded = new Set(context.lessons.flatMap((lesson) => lesson.test.graded))
  const placed = placeEvents(events, index, context.bookmark ?? null)
  const rows: ActivityRow[] = []
  for (const event of events) {
    // A question is filed under the lesson it was answered in, which is not always the first lesson that asks its family.
    const owner = placed.get(event)?.[0]
    const where = owner === undefined ? undefined : lessonName(owner, context.lessons)
    const base = { id: event.id, day: event.day, ...(where === undefined ? {} : { where }) }
    switch (event.kind) {
      case 'predict':
        rows.push({ ...base, what: 'Committed a guess before a run', result: guessResult(event) })
        break
      case 'item': {
        const parts = refParts(event.ref)
        const named = context.itemName?.(parts[1] ?? '', parts[2] ?? '')
        rows.push({ ...base, what: named === undefined ? 'Answered a question' : `Answered a question: ${named}`, result: resultOf(event) })
        break
      }
      case 'play': {
        const parts = refParts(event.ref)
        const named = context.levelName(parts[0] ?? '', parts[1] ?? '')
        // A run proved with the agent closed (src/prove) says so: it reads differently from a graded run played with the agent open.
        const closed = event.provenance === 'proved' ? ', agent closed' : ''
        // A run at part weight was played as practice, even on a level that is graded: the row says what the run counted for.
        const guesses = runGuesses(event.data.actions)
        const guessed = guesses.length === 0 ? '' : `, guessing ${listed(guesses)} before the moves`
        rows.push({ ...base, what: `Played ${named ?? 'a level'}${guessed}${closed}`, result: resultOf(event), kind: graded.has(event.ref) && event.provenance !== 'practice' ? 'graded' : 'practice' })
        break
      }
      case 'lab-check':
        rows.push({ ...base, what: `Checked ${labWords(refParts(event.ref)[0] ?? '')} in this browser`, result: resultOf(event) })
        break
      case 'prove':
        rows.push({ ...base, what: `Predicted the reply of ${labWords(refParts(event.ref)[0] ?? '')} with the agent closed`, result: resultOf(event) })
        break
      case 'trace-mark':
        rows.push({ ...base, what: 'Marked spans on a trace', result: resultOf(event) })
        break
      case 'challenge':
        rows.push({ ...base, what: `Got a challenge for ${stageWords(refParts(event.ref)[0] ?? '')}`, result: 'issued' })
        break
      case 'receipt':
        rows.push({ ...base, what: `Brought back a lab result for ${stageWords(refParts(event.ref)[0] ?? '')}`, result: resultOf(event) === ATTEMPT_WORDS.no ? 'not counted' : resultOf(event) })
        break
      case 'review':
        rows.push({ ...base, what: 'Reviewed a skill', result: resultOf(event) })
        break
      case 'ack':
        break
    }
  }
  // Newest first: the event list is in write order, and a row's order is the order they were done in.
  const at = new Map(events.map((event) => [event.id, event.at]))
  return rows.sort((a, b) => ((at.get(a.id) ?? '') < (at.get(b.id) ?? '') ? 1 : -1))
}

/** How many attempts came out each way, over every graded event but a prediction and a review (a guess earns nothing, and a review is a skill's own). */
export interface AttemptCounts {
  readonly notYet: number
  readonly practice: number
  readonly passed: number
}

export function attemptCounts(events: readonly LedgerEvent[]): AttemptCounts {
  let notYet = 0
  let practice = 0
  let passed = 0
  for (const event of events) {
    if (event.kind === 'ack' || event.kind === 'challenge' || event.kind === 'predict') continue
    const word = resultOf(event)
    if (word === ATTEMPT_WORDS.yes) passed += 1
    else if (word === ATTEMPT_WORDS.practice) practice += 1
    else notYet += 1
  }
  return { notYet, practice, passed }
}

/** How many skills stand in each of the words for a skill, from `deriveProgress`'s counts. The states include the ones before them. */
export interface SkillCounts {
  readonly total: number
  readonly notStarted: number
  readonly tried: number
  readonly passed: number
  readonly kept: number
}

export function skillCounts(counts: { total: number; practised: number; earned: number; kept: number }): SkillCounts {
  return {
    total: counts.total,
    notStarted: counts.total - counts.practised,
    tried: counts.practised - counts.earned,
    passed: counts.earned - counts.kept,
    kept: counts.kept,
  }
}
