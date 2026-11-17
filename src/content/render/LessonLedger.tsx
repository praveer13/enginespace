import { useEffect } from 'react'
import type { MapLesson } from '@es/schema/compiled'
import { useEvidence } from '@/evidence/useEvidence'
import { runDone, testState, type Bookmark, type Step } from '@/progress/next'
import { useWayOn } from '@/progress/useWayOn'
import { readPlace } from '@/settings/bookmark'
import { guessLines, lessonEvents, lessonRecord, runLines, tally, tallyWords } from './record'

/*
 * What a lesson page reads from the ledger, as a lazy chunk of its own (REDESIGN §2.4 and §2.5): the ledger's code and the way on load after
 * the lesson's first paint, so the lesson's route carries neither. Once the ledger is open it keeps the pointer (`es:next`, through
 * `useWayOn`), so the header's Continue follows what the learner did here, and it hands the page what the rail, the Test and Keep tell back:
 * all of it a reading of events, and nothing stored.
 */

export interface LedgerReading {
  /** `nextStep`'s answer for the same events. */
  readonly step: Step
  /** The Test passed: the lesson is done. */
  readonly passed: boolean
  /** Whether the Run is done, or null for a lesson with no Run. */
  readonly runDone: boolean | null
  /** The learner's own answers under Run: "you said 300 pages", "One KV group: passed in practice". */
  readonly runAnswers: readonly string[]
  /** Under Read: the inline runs, in words. */
  readonly readAnswers: readonly string[]
  /** The Test's state in words: "3 of 3: passed", or null before any attempt. */
  readonly testWords: string | null
  /** The lesson record's lines. */
  readonly record: readonly string[]
}

export interface LessonLedgerProps {
  row: MapLesson
  lessons: readonly MapLesson[]
  place: Bookmark | null
  /** The game's level titles: "KV page pool, One KV group" is never shown as an id. */
  names: (game: string, level: string) => string | undefined
  onRead: (reading: LedgerReading) => void
}

export default function LessonLedger({ row, lessons, place, names, onRead }: LessonLedgerProps) {
  const { ready, events } = useEvidence()
  const step = useWayOn(lessons, place)
  useEffect(() => {
    if (!ready || step === null) return
    const here = place ?? readPlace()
    const own = lessonEvents(events, lessons, row.id, here)
    const count = tally(row, own)
    const test = testState(row, own)
    const graded = runLines(own, row.test.graded, names)
    onRead({
      step,
      passed: test === 'passed',
      runDone: runDone(row, own),
      runAnswers: [...guessLines(own).map((guess) => guess.said), ...runLines(own, row.run, names).map((run) => run.text)],
      readAnswers: runLines(own, row.inline, names).map((run) => run.text),
      testWords: row.test.questions.length > 0 ? (count.tried ? tallyWords(count) : null) : graded.length > 0 ? graded.map((run) => run.text).join(', ') : null,
      record: lessonRecord(row, lessons, events, names, here),
    })
  }, [ready, step, events, lessons, row, names, onRead, place])
  return null
}
