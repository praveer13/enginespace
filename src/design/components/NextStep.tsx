import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from './Glyph'
import '../parts.css'

/*
 * The way on (REDESIGN 2.4): what `nextStep` answers, shown as one control and, where a page tells progress back, as a sentence
 * above it ("Last time you ... Next: ..."). The control's label comes from the answer ("Continue: TR2 lesson 1, read why", or
 * "Start: TR1 lesson 1"), and its link is the answer's, so the words and the place never disagree.
 *
 * `primary` is the one amber fill of its viewport: amber with its 2 px edge and an ink label, 44 px or taller, used where the page
 * has no move in hand. `outline` is the same control in a 1 px edge: the header's Continue, and the course's way on beside a local
 * one. The minutes it takes follow the label, and reviews due sit beside it as a quiet second line that never replaces it.
 *
 * States: hover (the fill deepens to the well's tone under the edge), focus (the ink ring), active (pressed: the edge thickens
 * inward), unavailable (no link: "Not published yet", quiet ink, dashed edge).
 */

export interface NextStepProps {
  to: string
  label: ReactNode
  minutes?: number
  /** "Last time: you ran KV page pool, One KV group (passed in practice) and tried 3 questions in TR5a lesson 1." */
  lastTime?: ReactNode
  /** "3 reviews due, about 4 min". */
  reviews?: ReactNode
  /** "2 earlier lessons not finished". */
  skipped?: ReactNode
  emphasis?: 'primary' | 'outline'
  /** The target is not published yet: the control says so and links nowhere. */
  unavailable?: boolean
  className?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

export function NextStep({ to, label, minutes, lastTime, reviews, skipped, emphasis = 'primary', unavailable = false, className, 'data-force': force }: NextStepProps) {
  const body = (
    <>
      <span className="es-next__text">
        <span className="es-next__label">{label}</span>
        {minutes !== undefined ? <span className="es-next__minutes">about {minutes} min</span> : null}
      </span>
      <Icon name="arrow" className="es-next__arrow" />
    </>
  )
  return (
    <div className={clsx('es-next', className)}>
      {lastTime ? <p className="es-next__last">{lastTime}</p> : null}
      {unavailable ? (
        <span className="es-next__action" data-emphasis={emphasis} aria-disabled="true">
          <span className="es-next__text">
            <span className="es-next__label">{label}</span>
            <span className="es-next__minutes">Not published yet</span>
          </span>
        </span>
      ) : (
        <Link to={to} className="es-next__action" data-emphasis={emphasis} data-force={force}>
          {body}
        </Link>
      )}
      {reviews || skipped ? (
        <p className="es-next__aside">
          {reviews ? <span>{reviews}</span> : null}
          {skipped ? <span>{skipped}</span> : null}
        </p>
      ) : null}
    </div>
  )
}
