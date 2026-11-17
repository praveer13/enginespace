import clsx from 'clsx'
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from './Glyph'
import { PrintingDots } from './PrintingDots'

/*
 * A button (REDESIGN 2.8): flat, a 1 px edge at 3:1, a 3 px radius, and a label in sentence case that says what it does.
 * `plate` (the default) is the outline; `ink` is the dark surface with a paper-white label, for the control an instrument
 * leans on; `quiet` is the label alone. The variant names stay until R-T46's rename.
 *
 * States: hover (a faint well), focus (the ink ring), active or pressed (a well), disabled (a dashed edge, quiet words),
 * loading (dots beside the label; the press is ignored), error (a line in the second ink beside it, and that ink's edge).
 * The primary action is the amber primary button, not a Button.
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
