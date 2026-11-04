import clsx from 'clsx'
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * A stamped steel plate: the button of the kitchen's equipment. The label is stamped in the plate face (the display
 * face, in capitals); the plate has a lit top edge, a shaded foot and a 3:1 edge. `ink` is a deep-steel plate with a
 * paper-white label, for the control a game leans on; `quiet` is the stamp without the plate.
 *
 * States: hover (the plate catches the tubes), focus (the heat lamp), active (pressed into the panel), disabled (a dull
 * plate), loading (the printer's dots beside the label; the press is ignored), error (a red line beside it, and a red
 * edge). The primary action of a ticket is its Stub, not a Button.
 */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'plate' | 'ink' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: IconName
  /** Printed beside the button when its action failed: the problem, and the way back. */
  error?: ReactNode
  'data-force'?: 'hover' | 'focus' | 'active'
}

export function Button({
  variant = 'plate',
  size = 'md',
  loading = false,
  icon,
  error,
  className,
  children,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  const errorId = useId()
  const button = (
    <button
      type={type}
      className={clsx('es-button', className)}
      data-variant={variant}
      data-size={size}
      data-state={loading ? 'loading' : error ? 'error' : undefined}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      aria-describedby={error ? errorId : undefined}
      onClick={loading ? undefined : onClick}
      {...rest}
    >
      {loading ? <PrintingDots /> : icon ? <Icon name={icon} className="es-button__icon" /> : null}
      {children}
    </button>
  )
  if (!error) return button
  return (
    <span className="es-button-group" data-state="error">
      {button}
      <span className="es-button__error" id={errorId} role="alert">
        <Icon name="alert" className="es-button__error-mark" />
        <span>{error}</span>
      </span>
    </span>
  )
}
