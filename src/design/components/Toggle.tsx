import * as Switch from '@radix-ui/react-switch'
import clsx from 'clsx'
import { useId, type ReactNode } from 'react'
import { Icon } from './Glyph'
import { LoadingDots } from './LoadingDots'

/*
 * A switch (REDESIGN 2.8): a flat track with a square thumb, and the state as a word in the open half, Off or On. On, the
 * track takes the dark surface. No light: the state is the thumb's side, the word and the track's fill, never a colour
 * alone. It is a real switch (Radix's, so the role, keys and state are the platform's).
 *
 * States: off, on, hover (the thumb's edge darkens), focus (the ink ring), active (the thumb under the finger), disabled
 * (a dashed track), loading (switching: dots by the label, the thumb held), error (a line in the second ink under it).
 */

export interface ToggleProps {
  label: ReactNode
  /** A line under the label: what the switch does, in the engine's terms. */
  hint?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  loading?: boolean
  error?: ReactNode
  id?: string
  className?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

export function Toggle({
  label,
  hint,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
  loading = false,
  error,
  id,
  className,
  'data-force': force,
}: ToggleProps) {
  const generated = useId()
  const switchId = id ?? `toggle-${generated}`
  const hintId = `${switchId}-hint`
  const errorId = `${switchId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={clsx('es-toggle', className)} data-state={disabled ? 'disabled' : loading ? 'loading' : error ? 'error' : 'default'}>
      <Switch.Root
        id={switchId}
        className="es-toggle__switch"
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={loading ? undefined : onCheckedChange}
        disabled={disabled}
        aria-busy={loading || undefined}
        aria-describedby={describedBy}
        data-force={force}
      >
        <span className="es-toggle__plate" aria-hidden="true">
          <span className="es-toggle__word" data-word="off">
            Off
          </span>
          <span className="es-toggle__word" data-word="on">
            On
          </span>
        </span>
        <Switch.Thumb className="es-toggle__lever" />
      </Switch.Root>
      <span className="es-toggle__text">
        <label htmlFor={switchId} className="es-toggle__label">
          {label}
          {loading ? <LoadingDots /> : null}
        </label>
        {hint ? (
          <span className="es-toggle__hint" id={hintId}>
            {hint}
          </span>
        ) : null}
        {error ? (
          <span className="es-toggle__error" id={errorId} role="alert">
            <Icon name="alert" className="es-toggle__error-mark" />
            <span>{error}</span>
          </span>
        ) : null}
      </span>
    </div>
  )
}
