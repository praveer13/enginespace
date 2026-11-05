import type { ReactNode } from 'react'
import type { LocalDay } from '@es/ledger'
import { Icon } from '@/design/components/Glyph'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import { backLine, lineStatus, listTitle, modeNote } from './copy'
import { formatDay } from './days'
import type { LineState, LineView } from './plan'
import { minutesOf } from './session'
import type { SessionMode } from './session'

/*
 * The prep list: ruled lines on a ticket, each with a drawn box and its idea's id on tape. Once the prep has started a line is waiting,
 * now, or done. A done line is ticked, or struck for a miss, and prints the day its idea comes back. On a phone the list folds to a strip
 * of boxes (`PrepStrip`) and the ticket under the lamp takes the screen.
 *
 * Nothing here counts what is overdue: the list is the session, and the session is capped.
 */

/** "about 9 min", with the number in the printer's dots and its tag beside it: the nominal time is a design estimate (ASSESSMENT §8). */
export function About({ seconds, left = false }: { seconds: number; left?: boolean }) {
  return (
    <span className="es-prep__about">
      about <Readout value={minutesOf(seconds)} tag="estimated" size="sm" /> <span className="es-prep__unit">min{left ? ' left' : ''}</span>
    </span>
  )
}

function Box({ state, ok }: { state: LineState; ok?: boolean }) {
  return (
    <span className="es-prep__box" aria-hidden="true">
      {state === 'done' ? <Icon name={ok === true ? 'check' : 'strike'} /> : state === 'now' ? <Icon name="arrow" /> : null}
    </span>
  )
}

/** The ruled lines. `label` names the list for assistive technology. */
export function PrepLines({ lines, label }: { lines: readonly LineView[]; label: string }) {
  return (
    <ol className="es-prep__lines" aria-label={label}>
      {lines.map((line, at) => (
        <li key={`${line.kc}-${at}`} className="es-prep__line" data-line={line.state} data-ok={line.state === 'done' ? String(line.ok === true) : undefined} aria-current={line.state === 'now' ? 'step' : undefined}>
          <Box state={line.state} ok={line.ok} />
          <span className="es-prep__text">
            <TicketLine qty={at + 1}>{line.title}</TicketLine>
            <span className="es-prep__meta">
              <TapeLabel size="sm" tilt="none" className="es-prep__kc">
                {line.kc}
              </TapeLabel>
              {line.back === undefined ? null : (
                <span className="es-prep__return" data-tone={line.ok === true ? 'ink' : 'ink-2'}>
                  {backLine(line.back)}
                </span>
              )}
            </span>
          </span>
          <span className="sr-only">{lineStatus(line.state, line.ok)}</span>
        </li>
      ))}
    </ol>
  )
}

export interface PrepListProps {
  day: LocalDay
  mode: SessionMode
  lines: readonly LineView[]
  seconds: number
  /** The stub that starts the prep. A list that has been started has none. */
  stub?: ReactNode
  /** Under the heat lamp: the place the next decision acts on, which is the list until the prep starts. */
  lamp?: boolean
  /** `work` is the list beside the ticket on a wide screen: nothing is asked of it. */
  phase: 'list' | 'work'
}

export function PrepList({ day, mode, lines, seconds, stub, lamp = false, phase }: PrepListProps) {
  const note = modeNote(mode)
  return (
    <Ticket
      as="section"
      className="es-prep__list"
      data-phase={phase}
      data-mode={mode}
      width="wide"
      head={<span aria-hidden="true">Today</span>}
      meta={<span aria-hidden="true">{formatDay(day)}</span>}
      title={listTitle(mode)}
      titleAs="h2"
      lamp={lamp}
      foot={[<About key="about" seconds={seconds} />, 'nothing is timed']}
      stub={stub}
    >
      {note === null ? null : <p className="es-prep__note">{note}</p>}
      <PrepLines lines={lines} label={`${listTitle(mode)}, ${lines.length} ${lines.length === 1 ? 'idea' : 'ideas'}`} />
    </Ticket>
  )
}

export interface PrepStripProps {
  /** One mark for each line of the list. */
  marks: readonly { state: LineState; ok?: boolean }[]
  secondsLeft: number
}

/** The list folded to a strip, for a phone: the minutes left, and a row of boxes that take their tick as the prep goes. */
export function PrepStrip({ marks, secondsLeft }: PrepStripProps) {
  return (
    <div className="es-prep__strip">
      <p className="es-prep__strip-head">
        <span>Prep list</span>
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
