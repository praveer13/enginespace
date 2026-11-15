import clsx from 'clsx'
import '../parts.css'

/*
 * A callout: an ink disc with a numeral, laid on a diagram's object in a game's first run (REDESIGN 2.6). The same numerals head
 * the parts list in the dock, so the number is the link between the drawing and the words, never a colour. Callouts are ink, not
 * amber: they name what is there, they do not say "now".
 *
 * With `onSelect` it is a button that selects its part (and the caller opens the part's popover): a 44 px target around a smaller
 * disc. States: hover (the disc lifts a ring), focus (the ink ring), active and selected (the disc turns to paper with an ink edge;
 * selected is `aria-pressed`), disabled (the disc fades to the quiet ink).
 */

export interface CalloutProps {
  n: number
  /** The part's engine name. A selectable callout needs it for its name; a still one gives it to a screen reader. */
  name?: string
  onSelect?: () => void
  selected?: boolean
  disabled?: boolean
  className?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

export function Callout({ n, name, onSelect, selected = false, disabled = false, className, 'data-force': force }: CalloutProps) {
  const disc = (
    <span className="es-callout__disc" aria-hidden={onSelect ? true : undefined}>
      {n}
    </span>
  )
  if (!onSelect)
    return (
      <span className={clsx('es-callout', className)}>
        {disc}
        {name ? <span className="sr-only">: {name}</span> : null}
      </span>
    )
  return (
    <button
      type="button"
      className={clsx('es-callout', className)}
      data-interactive=""
      aria-label={name ? `${n}: ${name}` : String(n)}
      aria-pressed={selected}
      disabled={disabled}
      data-force={force}
      onClick={onSelect}
    >
      {disc}
    </button>
  )
}
