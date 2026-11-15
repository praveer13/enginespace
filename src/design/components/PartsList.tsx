import clsx from 'clsx'
import type { ReactNode } from 'react'
import '../parts.css'

/*
 * The parts list: what a drawing shows, by its engine names (REDESIGN 2.6). It is an ordered list headed by the same numerals as
 * the callouts on the diagram, each part's name (as code when it is an identifier) and one sentence. A part the learner has not
 * met yet says "new", in a word. Parts not yet met come first; the caller orders them.
 *
 * With `onSelect` each row is a button that selects its part (and the caller opens the part's source), at least 44 px tall. States:
 * hover (the row takes the well), focus (the ink ring), active and selected (the row is pressed into the well; selected is
 * `aria-pressed`), disabled (quiet ink). With no parts it says so.
 */

export interface PartRow {
  id: string
  /** The engine's name for the part. */
  name: string
  /** Set the name as code: it is an identifier, spelled as the pinned source spells it. */
  code?: boolean
  sentence: ReactNode
  /** The learner has not met this part before. */
  isNew?: boolean
  /** A pointer state shown without a pointer, for the /design page. */
  force?: 'hover' | 'focus' | 'active'
}

export interface PartsListProps {
  parts: readonly PartRow[]
  /** The list's name, for a screen reader: "Parts of the KV page pool". */
  label: string
  selected?: string
  onSelect?: (id: string) => void
  disabled?: boolean
  empty?: ReactNode
  className?: string
}

export function PartsList({ parts, label, selected, onSelect, disabled = false, empty = 'No parts are drawn on this level.', className }: PartsListProps) {
  if (parts.length === 0) return <p className={clsx('es-parts', className)} data-empty="">{empty}</p>
  return (
    <ol className={clsx('es-parts', className)} aria-label={label}>
      {parts.map((part, index) => {
        const inner = (
          <>
            <span className="es-callout__disc es-parts__n" aria-hidden="true">
              {index + 1}
            </span>
            <span className="es-parts__text">
              <span className="es-parts__name">
                {part.code ? <code>{part.name}</code> : part.name}
                {part.isNew ? <span className="es-parts__new">new</span> : null}
              </span>
              <span className="es-parts__sentence">{part.sentence}</span>
            </span>
          </>
        )
        return (
          <li key={part.id} className="es-parts__item">
            {onSelect ? (
              <button
                type="button"
                className="es-parts__row"
                data-interactive=""
                aria-pressed={selected === part.id}
                disabled={disabled}
                data-force={part.force}
                onClick={() => onSelect(part.id)}
              >
                {inner}
              </button>
            ) : (
              <span className="es-parts__row">{inner}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
