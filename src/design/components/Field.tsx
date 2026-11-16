import clsx from 'clsx'
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon } from './Glyph'
import { TapeLabel } from './TapeLabel'
import { PrintingDots } from './PrintingDots'

/*
 * A field (REDESIGN 2.8): a plain label over a paper slip with a 2 px foot line, the field's boundary at 3:1; the caret is
 * ink. A number field (`numeric`) types in the mono face with tabular figures.
 *
 * States: empty (the slip shows its hint in quiet text), hover (the foot line darkens), focus (the ink ring), disabled (a
 * dashed foot line), loading (checking: dots at the end of the line), error (the foot line and a line in the second ink
 * saying what is wrong and how to fix it).
 */

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: ReactNode
  /** A line under the slip: what to write, in the engine's terms. */
  hint?: ReactNode
  error?: ReactNode
  loading?: boolean
  numeric?: boolean
  'data-force'?: 'hover' | 'focus' | 'active'
}

export function Field({ label, hint, error, loading = false, numeric = false, id, className, disabled, 'data-force': force, ...input }: FieldProps) {
  const generated = useId()
  const inputId = id ?? `field-${generated}`
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  const state = disabled ? 'disabled' : loading ? 'loading' : error ? 'error' : 'default'
  return (
    <div className={clsx('es-field', className)} data-state={state} data-numeric={numeric || undefined}>
      <TapeLabel as="label" htmlFor={inputId} tilt="left" className="es-field__label">
        {label}
      </TapeLabel>
      <span className="es-field__slip" data-force={force}>
        <input
          id={inputId}
          className="es-field__input"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-busy={loading || undefined}
          aria-describedby={describedBy}
          inputMode={numeric ? 'decimal' : input.inputMode}
          {...input}
        />
        {loading ? <PrintingDots /> : null}
      </span>
      {hint ? (
        <span className="es-field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="es-field__error" id={errorId} role="alert">
          <Icon name="alert" className="es-field__error-mark" />
          <span>{error}</span>
        </span>
      ) : null}
    </div>
  )
}
