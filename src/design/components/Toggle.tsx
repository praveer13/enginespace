import * as Switch from '@radix-ui/react-switch'
import clsx from 'clsx'
import { useId, type ReactNode } from 'react'
import { Icon } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * An equipment toggle: a lever in a stainless plate stamped OFF and ON, with a pilot light that burns the heat lamp's
 * amber when the lever is up (a switch that is on is an active state, and amber is the only one). It is a real switch
 * (Radix's, so the role, keys and state are the platform's). The state is the lever's side, the stamped word and the
 * light, never the light alone.
 *
 * States: off, on, hover (the lever catches the tubes), focus (the heat lamp), active (the lever under the thumb),
 * disabled (no power: the plate dulls), loading (switching: the printer's dots by the label, the lever held), error (a
 * red line under it).
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
            OFF
          </span>
          <span className="es-toggle__word" data-word="on">
            ON
          </span>
        </span>
        <Switch.Thumb className="es-toggle__lever" />
        <span className="es-toggle__pilot" aria-hidden="true" />
      </Switch.Root>
      <span className="es-toggle__text">
        <label htmlFor={switchId} className="es-toggle__label">
          {label}
          {loading ? <PrintingDots /> : null}
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
