/*
 * Calibration (ASSESSMENT §4.2 and §4.7): how often each confidence tap, guess, think so or sure, was right. A question and a prediction
 * both carry the tap, and a prediction has two reveals (D-067): after the run that answers it, which read a run and so wrote its seed, and at
 * commit, which read none. The groups keep them apart, because a tap before a run and a tap with the answer worked from the question's own
 * numbers are different things to be sure about.
 *
 * The rows are read from the events when the page draws and are stored nowhere. They move no credit, no completion and no skill: this file
 * reads `conf` and `ok` and nothing about provenance or weight, and imports nothing that grades. The words for a rate come before the
 * count that it rests on, and a rate that rests on too few taps says so and gives no verdict.
 */
import { CONFIDENCES } from '@es/ledger'
import type { Confidence, LedgerEvent } from '@es/ledger'

export type CalibrationSource = 'question' | 'after-run' | 'at-commit'

export const SOURCES: readonly CalibrationSource[] = ['question', 'after-run', 'at-commit']

/** What each source is called on the page. */
export const SOURCE_WORDS: Readonly<Record<CalibrationSource, string>> = {
  question: 'Questions you answered',
  'after-run': 'Guesses checked against your run',
  'at-commit': 'Guesses checked against the working',
}

/** What each tap is called on the page: the learner's own words for it. */
export const CONF_WORDS: Readonly<Record<Confidence, string>> = { guess: 'You said guess', think: 'You said think so', sure: 'You said sure' }

/** How many taps a row needs before it says how often you were right [estimated]. It is arbitrary: with fewer, a rate is mostly luck. */
export const MIN_TAPS = 3

export interface CalibrationRow {
  readonly source: CalibrationSource
  readonly conf: Confidence
  /** Taps of this kind that were right. */
  readonly right: number
  /** Taps of this kind. */
  readonly total: number
}

/** The source an event is a tap of, or null when it is not a question or a prediction. A prediction that read a run wrote its seed. */
export function sourceOf(event: LedgerEvent): CalibrationSource | null {
  if (event.kind === 'item') return 'question'
  if (event.kind === 'predict') return event.seed === undefined ? 'at-commit' : 'after-run'
  return null
}

type Tapped = Extract<LedgerEvent, { kind: 'item' | 'predict' }>

/**
 * One row for each source and tap that has at least one event, in the order of SOURCES and then the taps. A source with no tapped event has no
 * rows. An event with no tap says nothing about how sure the learner was and is left out.
 */
export function calibrationRows(events: readonly LedgerEvent[]): CalibrationRow[] {
  const tally = new Map<string, { right: number; total: number }>()
  const seen = new Set<string>()
  for (const event of events) {
    if (event.kind !== 'item' && event.kind !== 'predict') continue
    const tapped: Tapped = event
    const source = sourceOf(tapped)
    if (source === null || tapped.conf === undefined || seen.has(tapped.id)) continue
    seen.add(tapped.id)
    const key = `${source}/${tapped.conf}`
    const cell = tally.get(key) ?? { right: 0, total: 0 }
    cell.total += 1
    if (tapped.ok) cell.right += 1
    tally.set(key, cell)
  }
  return SOURCES.flatMap((source) =>
    CONFIDENCES.flatMap((conf) => {
      const cell = tally.get(`${source}/${conf}`)
      return cell === undefined ? [] : [{ source, conf, ...cell }]
    }),
  )
}

/** How often a row was right, in words: the sentence that comes before its count. */
export function rateWords(row: Pick<CalibrationRow, 'right' | 'total'>): string {
  if (row.total < MIN_TAPS) return 'Too few to say yet'
  const share = row.right / row.total
  if (share >= 0.9) return 'Right almost every time'
  if (share >= 0.6) return 'Right most of the time'
  if (share >= 0.4) return 'Right about half the time'
  if (share >= 0.15) return 'Right less than half the time'
  return 'Rarely right'
}

/** The count that a rate rests on: "7 of 9 right", said for a screen reader the same way. */
export const countWords = (row: Pick<CalibrationRow, 'right' | 'total'>): string => `${row.right} of ${row.total} right`
