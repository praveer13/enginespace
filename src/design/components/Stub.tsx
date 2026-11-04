import clsx from 'clsx'
import { useId, type MouseEventHandler, type ReactNode } from 'react'
import { Link, type To } from 'react-router'
import { Icon } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * The tear-off stub: a ticket's primary action, printed in the ribbon's red under a line of perforations. It is the one
 * thing on a ticket that asks to be pulled. Inside a Ticket it shares the ticket's paper; on its own (`standalone`) it
 * is a stub torn off with its own paper.
 *
 * States: hover (it starts to tear), focus (the heat lamp), active (pulled), disabled (faded ribbon, the perforation
 * dashed), loading (the printer still printing; the press is ignored), error (a red line under it).
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
