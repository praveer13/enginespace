import clsx from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import { PrintingDots } from './PrintingDots'
import { Readout, type NumberTag } from './Readout'

/*
 * The pass bell: the step mark. Everything moves on the bell (GAMES.md §2.6, Service): each step strikes it once, the
 * plunger drops and the dome rings, and between strikes it is still. The strike is a single 240 ms motion per step,
 * never a flash, and under reduced motion it does not move at all.
 *
 * With `onRing` the bell is the control that fires the next step: every readout is also the control that changes it.
 * States: still; struck (the step just changed); hover and active (the plunger under the hand, pressed); focus (the
 * heat lamp); disabled (the bell will not ring: nothing to fire); loading (the line is still cooking this step).
 */

export interface BellProps {
  /** The step count it marks. A change strikes the bell. */
  step: number
  /** Where the count comes from: the seeded world's steps are synthetic. */
  tag?: NumberTag
  /** Makes the bell a button that fires the next step. */
  onRing?: () => void
  /** The button's name: what ringing does. */
  ringLabel?: string
  /** The word printed by the count. */
  caption?: ReactNode
  disabled?: boolean
  loading?: boolean
  size?: 'md' | 'lg'
  className?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

function BellDrawing({ struck, step }: { struck: boolean; step: number }) {
  // The dome is polished: lit from the tubes above, its own gradient per bell (ids must be unique on a page).
  const chrome = `es-bell-chrome-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  return (
    <svg className="es-bell__drawing" viewBox="0 0 64 56" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={chrome} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" className="es-bell__chrome-hi" />
          <stop offset="0.45" className="es-bell__chrome-mid" />
          <stop offset="1" className="es-bell__chrome-lo" />
        </radialGradient>
      </defs>
      <g className="es-bell__waves" key={`waves-${step}`} data-struck={struck || undefined}>
        <path d="M8 18c-3 4-3 10 0 14M56 18c3 4 3 10 0 14" />
        <path d="M3 13c-5 7-5 17 0 24M61 13c5 7 5 17 0 24" />
      </g>
      <g className="es-bell__body" key={`body-${step}`} data-struck={struck || undefined}>
        <rect className="es-bell__plunger" x="29.5" y="6" width="5" height="10" rx="1.5" />
        <circle className="es-bell__knob" cx="32" cy="6" r="4.5" />
        <path className="es-bell__dome" d="M11 44c0-15 9.5-26 21-26s21 11 21 26Z" fill={`url(#${chrome})`} />
        <path className="es-bell__shine" d="M19 37c1-7 5.5-12 11-14" />
      </g>
      <rect className="es-bell__base" x="5" y="44" width="54" height="8" rx="3" />
    </svg>
  )
}

export function Bell({
  step,
  tag = 'synthetic',
  onRing,
  ringLabel = 'Ring the bell: fire the next step',
  caption = 'step',
  disabled = false,
  loading = false,
  size = 'md',
  className,
  'data-force': force,
}: BellProps) {
  // The bell strikes on a change of step, not when it first appears.
  const [firstStep] = useState(step)
  const struck = step !== firstStep
  const state = disabled ? 'disabled' : loading ? 'loading' : 'default'
  const count = (
    <span className="es-bell__count">
      <span className="es-bell__caption">{caption}</span>
      <Readout value={step} pad={4} tag={tag} size="sm" />
    </span>
  )
  if (onRing) {
    return (
      <span className={clsx('es-bell', className)} data-state={state} data-size={size}>
        <button
          type="button"
          className="es-bell__button"
          onClick={loading ? undefined : onRing}
          disabled={disabled}
          aria-disabled={loading || undefined}
          aria-busy={loading || undefined}
          aria-label={ringLabel}
          data-force={force}
        >
          <BellDrawing struck={struck} step={step} />
          {loading ? <PrintingDots /> : null}
        </button>
        {count}
      </span>
    )
  }
  return (
    <span className={clsx('es-bell', className)} data-state={state} data-size={size}>
      <span className="es-bell__still">
        <BellDrawing struck={struck} step={step} />
      </span>
      {count}
    </span>
  )
}
