import clsx from 'clsx'
import { useId, type ReactNode, type SelectHTMLAttributes, type Ref } from 'react'
import { Icon } from '@/design/components/Glyph'
import { TapeLabel } from '@/design/components/TapeLabel'

/*
 * A choice from a list, written on a field's slip: masking tape over a slip of ticket paper, with the browser's own select in it. The
 * design system has no select of its own, and a list of nine labs is what a select is for, so this takes the field's markup and its
 * classes (src/design/components/Field.tsx) and puts a select where the input goes. The platform draws the list, so a keyboard, a phone
 * and a screen reader meet the control they know. The chevron is drawn in the slip's ink by receipts.css.
 */

export interface SlipSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label: ReactNode
  /** A line under the slip: what to choose. */
  hint?: ReactNode
  error?: ReactNode
  /** The id of other text that describes the choice, which is read after the hint and the error. */
  describedBy?: string
  selectRef?: Ref<HTMLSelectElement>
}

export function SlipSelect({ label, hint, error, describedBy: extra, id, className, disabled, selectRef, children, ...select }: SlipSelectProps) {
  const generated = useId()
  const selectId = id ?? `slip-${generated}`
  const hintId = `${selectId}-hint`
  const errorId = `${selectId}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null, extra ?? null].filter(Boolean).join(' ') || undefined
  return (
    <div className={clsx('es-field es-slip', className)} data-state={disabled ? 'disabled' : error ? 'error' : 'default'}>
      <TapeLabel as="label" htmlFor={selectId} tilt="left" className="es-field__label">
        {label}
      </TapeLabel>
      <span className="es-field__slip">
        <select id={selectId} ref={selectRef} className="es-field__input" disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...select}>
          {children}
        </select>
        <span className="es-slip__chevron" aria-hidden="true" />
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
