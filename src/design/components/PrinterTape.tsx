import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * The printer and its tape: the live readout. The housing is deep stainless with the paper slot; the tape feeds out of
 * it one line at a time, newest at the slot, each line a label and a Readout. Between bells only the printer moves:
 * a new `feed` key feeds the tape one step (a stepped motion, cut under reduced motion).
 *
 * States: default; loading (the printer warming: dots, nothing printed yet); error (a red line); empty (a blank tape
 * that says so); and live (`live`: the lines are announced politely, for a tape that is the only place a change shows).
 */

export interface PrinterTapeLine {
  id: string
  /** The line's name: the engine term, or "kitchen · engine" the first time (GAMES.md §2.6, rule 2). */
  label: ReactNode
  /** Its value: a Readout, or a short printed word. */
  value: ReactNode
  tone?: 'ink' | 'ink-2'
}

export interface PrinterTapeProps {
  lines: readonly PrinterTapeLine[]
  /** The printer's accessible name. */
  label: string
  /** Changes when a new line is printed, to feed the tape one step. */
  feed?: string | number
  state?: 'default' | 'loading' | 'error' | 'empty'
  error?: ReactNode
  empty?: ReactNode
  /** Announce changes politely. Leave off when a game's own announcer speaks for it. */
  live?: boolean
  /** What sits on the printer's housing: the menu link, on the front page. */
  housing?: ReactNode
  className?: string
}

export function PrinterTape({ lines, label, feed, state = 'default', error, empty, live = false, housing, className }: PrinterTapeProps) {
  return (
    <figure className={clsx('es-printer', className)} data-state={state} aria-label={label} aria-busy={state === 'loading' || undefined}>
      <div className="es-printer__housing">
        <span className="es-printer__slot" aria-hidden="true" />
        {housing ? <div className="es-printer__housing-items">{housing}</div> : null}
      </div>
      <div className="es-printer__tape" aria-live={live ? 'polite' : undefined}>
        <div className="es-printer__feed" key={feed ?? 'still'} data-feeding={feed !== undefined || undefined}>
          {state === 'loading' ? (
            <p className="es-printer__line es-printer__line--status" role="status">
              <PrintingDots />
              <span>Warming up</span>
            </p>
          ) : null}
          {state === 'error' ? (
            <p className="es-printer__line es-printer__line--error" role="alert">
              <Icon name="alert" className="es-printer__mark" />
              <span>{error ?? 'The printer jammed.'}</span>
            </p>
          ) : null}
          {state === 'empty' || (state === 'default' && lines.length === 0) ? (
            <p className="es-printer__line es-printer__line--blank">{empty ?? 'Nothing printed yet'}</p>
          ) : null}
          {lines.length > 0 && state !== 'loading' ? (
            <dl className="es-printer__lines">
              {lines.map((line) => (
                <div key={line.id} className="es-printer__line" data-tone={line.tone ?? 'ink'}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <span className="es-printer__tear" aria-hidden="true" />
      </div>
    </figure>
  )
}
