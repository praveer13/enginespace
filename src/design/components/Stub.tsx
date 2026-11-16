import clsx from 'clsx'
import { useId, type MouseEventHandler, type ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { Icon } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * The primary button (REDESIGN 2.8): amber with its 2 px edge and an ink label, 44 px or taller, and an arrow. It is the
 * control to act on now, one of the marker's three carriers (the One Marker Rule). The name stays Stub until R-T46's rename;
 * `standalone` is accepted and changes nothing.
 *
 * States: hover (a deeper amber, the arrow steps on), focus (the ink ring), active (deeper still), disabled (no amber: a well
 * with a dashed edge, because there is nothing to act on now), loading (dots; the press is ignored), error (a line in the
 * second ink under it).
 */

interface StubCommon {
  children: ReactNode
  disabled?: boolean
  loading?: boolean
  /** Printed under the stub when the action failed: the problem, and the way back. */
  error?: ReactNode
  /** Draw the stub's own paper, for a stub that is not on a ticket. */
  standalone?: boolean
  className?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

export type StubProps = StubCommon & ({ to: To; onClick?: never } | { to?: never; onClick?: MouseEventHandler<HTMLButtonElement> })

export function Stub({
  children,
  disabled = false,
  loading = false,
  error,
  standalone = false,
  className,
  to,
  onClick,
  'data-force': force,
}: StubProps) {
  const errorId = useId()
  const state = disabled ? 'disabled' : loading ? 'loading' : error ? 'error' : 'default'
  const inner = (
    <>
      <span className="es-stub__label">{children}</span>
      {loading ? <PrintingDots /> : <Icon name="arrow" className="es-stub__arrow" />}
    </>
  )
  const shared = {
    className: 'es-stub__pull',
    'aria-describedby': error ? errorId : undefined,
    'data-force': force,
  }
  return (
    <span className={clsx('es-stub', className)} data-state={state} data-standalone={standalone || undefined}>
      {to !== undefined && !disabled && !loading ? (
        <Link to={to} {...shared}>
          {inner}
        </Link>
      ) : (
        <button
          type="button"
          {...shared}
          disabled={disabled}
          aria-disabled={loading || undefined}
          aria-busy={loading || undefined}
          onClick={loading ? undefined : onClick}
        >
          {inner}
        </button>
      )}
      {error ? (
        <span className="es-stub__error" id={errorId} role="alert">
          <Icon name="alert" className="es-stub__error-mark" />
          <span>{error}</span>
        </span>
      ) : null}
    </span>
  )
}
