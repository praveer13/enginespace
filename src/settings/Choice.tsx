import { useId, type ReactNode } from 'react'
import { Button } from '@/design/components/Button'
import { Icon } from '@/design/components/Glyph'

/*
 * A choice among a few: a row of stamped plates with one pressed in. Each plate is a toggle button in a named group, so a
 * screen reader hears "pressed" on the chosen one and a keyboard reaches each in turn. It is the pattern the scene kit's
 * specimen uses for its clips, and the design system has no component of its own for it, so it is built from the plate
 * (Button) and adds no look. The chosen option can carry a line of its own under the row, beside the group's general line.
 */

export interface ChoiceOption<T extends string | number> {
  value: T
  label: ReactNode
  /** What this option does: shown under the row while it is the chosen one. */
  hint?: ReactNode
}

export interface ChoiceProps<T extends string | number> {
  /** The group's name, shown above the row and read by assistive tech. */
  label: ReactNode
  options: readonly ChoiceOption<T>[]
  value: T
  onChange: (value: T) => void
  /** What the whole group is for, whichever plate is pressed. */
  hint?: ReactNode
  /** Printed under the row when the change could not be saved: the problem, and the way back. */
  error?: ReactNode
  disabled?: boolean
  className?: string
}

export function Choice<T extends string | number>({ label, options, value, onChange, hint, error, disabled = false, className }: ChoiceProps<T>) {
  const labelId = useId()
  const chosenHintId = useId()
  const hintId = useId()
  const errorId = useId()
  const chosen = options.find((option) => option.value === value)
  const describedBy = [chosen?.hint !== undefined ? chosenHintId : null, hint !== undefined ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className={className ? `es-choice ${className}` : 'es-choice'} data-state={disabled ? 'disabled' : undefined}>
      <span className="es-choice__label" id={labelId}>
        {label}
      </span>
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy || undefined} className="es-choice__plates">
        {options.map((option) => (
          <Button
            key={String(option.value)}
            variant={option.value === value ? 'ink' : 'plate'}
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => option.value !== value && onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {chosen?.hint !== undefined ? (
        <p className="es-choice__hint" id={chosenHintId} data-hint="chosen">
          {chosen.hint}
        </p>
      ) : null}
      {hint !== undefined ? (
        <p className="es-choice__hint" id={hintId} data-hint="group">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="es-choice__error" id={errorId} role="alert">
          <Icon name="alert" className="es-choice__error-mark" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  )
}
