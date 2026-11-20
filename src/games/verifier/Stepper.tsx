import { useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { Button } from '@/design/components/Button'

/*
 * A whole-number stepper (GAMES.md §10, "Controls"): a number field with a 44 px button on each side that adds one or takes one away.
 * No bar is dragged to height. The buttons are for a pointer and a thumb; a keyboard uses the field, which is the one tab stop:
 *
 *   ↑ and ↓                     one more, one less (an empty field starts from none)
 *   + and −                     the same, from the keys that say so
 *   Page Up and Page Down       a step of `big`
 *   ← and →                     the neighbour field, for a row of them (`onArrow`)
 *   Enter                       the row's answer, if it has one (`onEnter`)
 *   digits                      the number itself, which is taken as it becomes a whole number in range
 *
 * A step shows the new number selected, so that the next digit replaces it and does not join it. While the field is being typed in it
 * shows what was typed, and the number it stands for is the learner's last whole number in range. When it loses focus it shows the
 * number again.
 */

export interface StepperProps {
  id: string
  /** The token or thing the number belongs to, written above the field. */
  label: ReactNode
  /** What a reader hears for the field: "Resample weight for token 3". */
  name: string
  /** What the two buttons say to a reader: "Add one to token 3", "Take one from token 3". They do not repeat the field's name, so that one name never matches all three. */
  moreLabel: string
  lessLabel: string
  value: number | null
  min: number
  max: number
  /** The step of Page Up and Page Down. */
  big?: number
  onChange: (next: number) => void
  onEnter?: () => void
  onArrow?: (direction: -1 | 1) => void
  /** The field gained or lost focus (the dock holds a first-move ring on a field while it is being typed in). */
  onFieldFocus?: () => void
  onFieldBlur?: () => void
  layout?: 'column' | 'row'
  inputRef?: Ref<HTMLInputElement>
  /** Marks the field the controls move focus to when this step begins. */
  autoFocusTarget?: boolean
  /** The token this field is for: a tap on its column in the drawing focuses it (GAMES.md §10, "Controls"). */
  dish?: number
  className?: string
}

export function Stepper({ id, label, name, moreLabel, lessLabel, value, min, max, big = 8, onChange, onEnter, onArrow, onFieldFocus, onFieldBlur, layout = 'column', inputRef, autoFocusTarget = false, dish, className }: StepperProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  /** A step from the number, or from none for a field that is empty. What was typed gives way to the number the step makes. */
  const move = (by: number) => {
    const next = clamp((value ?? 0) + by)
    setDraft(null)
    if (next !== value) onChange(next)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const key = event.key
    const field = event.currentTarget
    const step = key === '+' || key === '=' || key === 'ArrowUp' ? 1 : key === '-' || key === '_' || key === 'ArrowDown' ? -1 : key === 'PageUp' ? big : key === 'PageDown' ? -big : 0
    if (step !== 0) {
      move(step)
      // The number is selected again once it is on the page, so that a digit typed next is a new number.
      queueMicrotask(() => document.activeElement === field && field.select())
    } else if (key === 'ArrowLeft' && onArrow) onArrow(-1)
    else if (key === 'ArrowRight' && onArrow) onArrow(1)
    else if (key === 'Enter' && onEnter) onEnter()
    else return
    event.preventDefault()
  }

  const shown = draft ?? (value === null ? '' : String(value))
  return (
    <div className={['es-vf-stepper', className].filter(Boolean).join(' ')} data-layout={layout}>
      <label htmlFor={id} className="es-vf-stepper__label">
        {label}
      </label>
      <Button className="es-vf-step" size="md" tabIndex={-1} aria-label={moreLabel} disabled={value !== null && value >= max} onClick={() => move(1)}>
        +
      </Button>
      <span className="es-vf-slip">
        <input
          id={id}
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          aria-label={name}
          placeholder="—"
          value={shown}
          data-vf-autofocus={autoFocusTarget || undefined}
          data-vf-dish={dish}
          onFocus={(event) => {
            event.currentTarget.select()
            onFieldFocus?.()
          }}
          onBlur={() => {
            setDraft(null)
            onFieldBlur?.()
          }}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            const text = event.target.value
            setDraft(text)
            const typed = Number(text)
            if (text.trim() !== '' && Number.isInteger(typed) && typed >= min && typed <= max && typed !== value) onChange(typed)
          }}
        />
      </span>
      <Button className="es-vf-step" size="md" tabIndex={-1} aria-label={lessLabel} disabled={value === null || value <= min} onClick={() => move(-1)}>
        −
      </Button>
    </div>
  )
}
