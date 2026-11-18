import clsx from 'clsx'
import { useId, useState, type ReactNode } from 'react'
import { LoadingDots } from './LoadingDots'
import { Readout, type NumberTag } from './Readout'

/*
 * The step control: the step mark, flat. A triangle that points on and a bar it stops at, in ink, on paper: "go to the next
 * step". Everything moves on the step (Moves On Step): each step nudges the mark on by a few pixels once, a single 240 ms
 * motion, never a flash, and between steps it is still. Under reduced motion it does not move at all.
 *
 * With `onRing` it is the control that fires the next step: every readout is also the control that changes it.
 * States: still; struck (the step just changed); hover and active (the paper darkens, the mark moves on); focus (the ink
 * ring); disabled (dashed edge: nothing to fire); loading (the step is still being worked out).
 */

export interface StepControlProps {
  /** The step count it marks. A change moves the mark on. */
  step: number
  /** Where the count comes from: the seeded world's steps are synthetic. */
  tag?: NumberTag
  /** Makes it a button that fires the next step. */
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

function StepControlDrawing({ struck, step }: { struck: boolean; step: number }) {
  return (
    <svg className="es-step-control__drawing" viewBox="0 0 64 56" aria-hidden="true" focusable="false">
      <g className="es-step-control__mark" key={`mark-${step}`} data-struck={struck || undefined}>
        <path className="es-step-control__arrow" d="M20 13L42 28L20 43Z" />
        <rect className="es-step-control__stop" x="46" y="13" width="6" height="30" rx="1" />
      </g>
    </svg>
  )
}

export function StepControl({
  step,
  tag = 'synthetic',
  onRing,
  ringLabel = 'Step: run the next step',
  caption = 'step',
  disabled = false,
  loading = false,
  size = 'md',
  className,
  'data-force': force,
}: StepControlProps) {
  // The mark moves on a change of step, not when it first appears.
  const [firstStep] = useState(step)
  const struck = step !== firstStep
  const state = disabled ? 'disabled' : loading ? 'loading' : 'default'
  const count = (
    <span className="es-step-control__count">
      <span className="es-step-control__caption">{caption}</span>
      <Readout value={step} pad={4} tag={tag} size="sm" />
    </span>
  )
  if (onRing) {
    return (
      <span className={clsx('es-step-control', className)} data-state={state} data-size={size}>
        <button
          type="button"
          className="es-step-control__button"
          onClick={loading ? undefined : onRing}
          disabled={disabled}
          aria-disabled={loading || undefined}
          aria-busy={loading || undefined}
          aria-label={ringLabel}
          data-force={force}
        >
          <StepControlDrawing struck={struck} step={step} />
          {loading ? <LoadingDots /> : null}
        </button>
        {count}
      </span>
    )
  }
  return (
    <span className={clsx('es-step-control', className)} data-state={state} data-size={size}>
      <span className="es-step-control__still">
        <StepControlDrawing struck={struck} step={step} />
      </span>
      {count}
    </span>
  )
}
