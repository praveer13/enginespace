import type { ReactNode } from 'react'
import type { LocalDay } from '@es/ledger'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { Ticket } from '@/design/components/Ticket'
import { backLine, lastSeen, lineStatus, listTitle, modeNote, SET_LABEL, stateWord } from './copy'
import type { LineView } from './plan'
import { minutesOf } from './session'
import type { SessionMode } from './session'

/*
 * The review set (REDESIGN 3.10): one row for each idea, with the idea's own sentence, its module and when it was last seen. Once the
 * review has started a row is waiting, now, or done, and says so in a word (next, now, right, missed); a done row also says the day its
 * idea comes back. At 390 the list folds to a strip of boxes (`PrepStrip`) and the question takes the screen.
 *
 * Nothing here counts what is overdue: the list is the session, and the session is capped.
 */

/** A row of the set: the line, with the idea's sentence, its module's code and the day it was last seen, read from the course map and the deck. */
export interface IdeaRow extends LineView {
  readonly sentence: string
  readonly code: string
  readonly seen?: LocalDay
}

/** "about 9 min": the number in the readout, tagged estimated (it is a design estimate, ASSESSMENT §8), its tag a dotted underline. */
export function About({ seconds, left = false }: { seconds: number; left?: boolean }) {
  return (
    <span className="es-prep__about">
      about <Readout value={minutesOf(seconds)} tag="estimated" size="sm" className="es-item__num" /> <span className="es-prep__unit">min{left ? ' left' : ''}</span>
    </span>
  )
}

function Box({ state, ok }: { state: LineView['state']; ok?: boolean }) {
  return (
    <span className="es-prep__box" aria-hidden="true">
      {state === 'done' ? <Icon name={ok === true ? 'check' : 'strike'} /> : state === 'now' ? <Icon name="arrow" /> : null}
    </span>
  )
}

/** The rows. `label` names the list for assistive technology. Before the review starts a row has no state word: it has its last seen day. */
export function PrepLines({ rows, label, started = false }: { rows: readonly IdeaRow[]; label: string; started?: boolean }) {
  return (
    <ol className="es-prep__lines" aria-label={label}>
      {rows.map((row, at) => (
        <li key={`${row.kc}-${at}`} className="es-prep__line" data-line={row.state} data-ok={row.state === 'done' ? String(row.ok === true) : undefined} aria-current={row.state === 'now' ? 'step' : undefined}>
          <Box state={row.state} ok={row.ok} />
          <span className="es-prep__text">
            <span className="es-prep__idea">{row.sentence}</span>
            <span className="es-prep__meta">
              <span>{row.code}</span>
              {row.back !== undefined ? (
                <span className="es-prep__return" data-tone={row.ok === true ? 'ink' : 'ink-2'}>
                  {backLine(row.back)}
                </span>
              ) : row.seen !== undefined && !started ? (
                <span>{lastSeen(row.seen)}</span>
              ) : null}
            </span>
          </span>
          {started ? (
            <span className="es-prep__state" data-state={row.state} data-ok={row.state === 'done' ? String(row.ok === true) : undefined} aria-hidden="true">
              {stateWord(row.state, row.ok)}
            </span>
          ) : null}
          <span className="sr-only">{lineStatus(row.state, row.ok)}</span>
        </li>
      ))}
    </ol>
  )
}

export interface PrepListProps {
  mode: SessionMode
  rows: readonly IdeaRow[]
  seconds: number
  /** The primary button that starts the review, in the sheet's head. A list that has been started has none. */
  start?: ReactNode
  /** `work` is the set beside the question on a wide screen: nothing is asked of it. */
  phase: 'list' | 'work'
}

export function PrepList({ mode, rows, seconds, start, phase }: PrepListProps) {
  const note = modeNote(mode)
  const label = `${listTitle(mode)}, ${rows.length} ${rows.length === 1 ? 'idea' : 'ideas'}`
  if (phase === 'work') {
    return (
      <Ticket as="section" className="es-prep__list" data-phase="work" data-mode={mode} width="full" title={SET_LABEL} titleAs="h2">
        <PrepLines rows={rows} label={label} started />
      </Ticket>
    )
  }
  return (
    <Ticket as="section" className="es-prep__list" data-phase="list" data-mode={mode} width="full" lamp>
      <div className="es-prep__head">
        <h2 className="es-prep__title" aria-label={`${listTitle(mode)}: ${rows.length} ${rows.length === 1 ? 'question' : 'questions'}`}>
          <span aria-hidden="true">
            {mode === 'ahead' ? 'Review ahead: ' : null}
            <Readout value={rows.length} tag="derived" size="lg" className="es-item__num" /> {rows.length === 1 ? 'question' : 'questions'}
            {mode === 'ahead' ? '' : ' today'}, <About seconds={seconds} />
          </span>
        </h2>
        {start}
      </div>
      {note === null ? null : <p className="es-prep__note">{note}</p>}
      <PrepLines rows={rows} label={label} />
    </Ticket>
  )
}

export interface PrepStripProps {
  /** One mark for each line of the list. */
  marks: readonly { state: LineView['state']; ok?: boolean }[]
  secondsLeft: number
}

/** The set folded to a strip, for a phone: the minutes left, and a row of boxes that take their tick as the review goes. */
export function PrepStrip({ marks, secondsLeft }: PrepStripProps) {
  return (
    <div className="es-prep__strip">
      <p className="es-prep__strip-head">
        <span>Review set</span>
        <About seconds={secondsLeft} left />
      </p>
      <ol className="es-prep__boxes" aria-hidden="true">
        {marks.map((mark, at) => (
          <li key={at} data-line={mark.state} data-ok={mark.state === 'done' ? String(mark.ok === true) : undefined}>
            <Box state={mark.state} ok={mark.ok} />
          </li>
        ))}
      </ol>
    </div>
  )
}
