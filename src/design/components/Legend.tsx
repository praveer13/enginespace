import clsx from 'clsx'
import type { ReactNode } from 'react'
import { SLOT_MARKS, type Slot } from '../code'
import { Glyph } from './Glyph'
import { Marker } from './Marker'
import '../parts.css'

/*
 * A diagram's legend: the colour and glyph code for the states it draws, directly under it (REDESIGN 2.6 and 2.8, the Colour Is
 * State Rule). Each entry is the slot's glyph, filled in its colour and outlined in its edge, then the word for the state. When the
 * diagram has a "now" cursor, the legend ends with the marker and its word. Nothing in it is interactive.
 */

export interface LegendEntry {
  slot: Slot
  /** The state this colour means on this diagram, in the engine's words: "a page in use". */
  word: ReactNode
}

export interface LegendProps {
  entries: readonly LegendEntry[]
  /** The legend's name, for a screen reader: "Legend: KV page pool". */
  label?: string
  /** End with the marker: true for its own word, or the words it means here. */
  now?: boolean | ReactNode
  className?: string
}

export function Legend({ entries, label = 'Legend', now, className }: LegendProps) {
  return (
    <ul className={clsx('es-legend', className)} aria-label={label}>
      {entries.map(({ slot, word }) => (
        <li key={slot} className="es-legend__entry">
          <Glyph shape={SLOT_MARKS[slot].glyph} className="es-legend__glyph" style={{ color: `var(--es-cat-${slot})` }} edge={`var(--es-cat-${slot}-edge)`} />
          <span>{word}</span>
        </li>
      ))}
      {now ? (
        <li className="es-legend__entry">
          <Marker />
          {now === true ? null : <span>{now}</span>}
        </li>
      ) : null}
    </ul>
  )
}
