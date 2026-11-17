import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Icon } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * The readout strip (REDESIGN 2.8): terms and their values on one paper strip, a ruled row each, the values in the mono face.
 * A value changes at once; nothing feeds or glides (`feed` is accepted and moves nothing).
 *
 * States: default; loading (a line of text); error (a line in the second ink); empty (a line that says so); and live
 * (`live`: the lines are announced politely, for a strip that is the only place a change shows).
 */

export interface ReadoutStripLine {
  id: string
  /** The line's name: the engine term. */
  label: ReactNode
  /** Its value: a Readout, or a short printed word. */
  value: ReactNode
  tone?: 'ink' | 'ink-2'
}

export interface ReadoutStripProps {
  lines: readonly ReadoutStripLine[]
  /** The printer's accessible name. */
  label: string
  /** Changes when a new line is printed, to feed the tape one step. */
  feed?: string | number
  state?: 'default' | 'loading' | 'error' | 'empty'
  error?: ReactNode
  empty?: ReactNode
  /** Announce changes politely. Leave off when a game's own announcer speaks for it. */
  live?: boolean
  /** What sits above the strip: the course link, on the front page. */
  housing?: ReactNode
  /**
   * The provenance stamp, once at the head of the strip: with it, the lines' figures keep their own tags for a screen reader, and
   * the stamp says it once for the eye (the Quiet Provenance Rule).
   */
  stamp?: ReactNode
  className?: string
}

export function ReadoutStrip({ lines, label, feed, state = 'default', error, empty, live = false, housing, stamp, className }: ReadoutStripProps) {
  return (
    <figure className={clsx('es-readout-strip', className)} data-state={state} data-stamped={stamp ? '' : undefined} aria-label={label} aria-busy={state === 'loading' || undefined}>
      <div className="es-readout-strip__housing">
        <span className="es-readout-strip__slot" aria-hidden="true" />
        {housing ? <div className="es-readout-strip__housing-items">{housing}</div> : null}
      </div>
      <div className="es-readout-strip__tape" aria-live={live ? 'polite' : undefined}>
        {stamp ? <p className="es-readout-strip__stamp">{stamp}</p> : null}
        <div className="es-readout-strip__feed" key={feed ?? 'still'} data-feeding={feed !== undefined || undefined}>
          {state === 'loading' ? (
            <p className="es-readout-strip__line es-readout-strip__line--status" role="status">
              <PrintingDots />
              <span>Warming up</span>
            </p>
          ) : null}
          {state === 'error' ? (
            <p className="es-readout-strip__line es-readout-strip__line--error" role="alert">
              <Icon name="alert" className="es-readout-strip__mark" />
              <span>{error ?? 'This readout could not load.'}</span>
            </p>
          ) : null}
          {state === 'empty' || (state === 'default' && lines.length === 0) ? (
            <p className="es-readout-strip__line es-readout-strip__line--blank">{empty ?? 'Nothing printed yet'}</p>
          ) : null}
          {lines.length > 0 && state !== 'loading' ? (
            <dl className="es-readout-strip__lines">
              {lines.map((line) => (
                <div key={line.id} className="es-readout-strip__line" data-tone={line.tone ?? 'ink'}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <span className="es-readout-strip__tear" aria-hidden="true" />
      </div>
    </figure>
  )
}
