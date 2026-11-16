import clsx from 'clsx'
import type { ReactNode } from 'react'
import { SLOT_MARKS, type GlyphShape, type Slot } from '../code'
import { Glyph } from './Glyph'

/*
 * A plain label (REDESIGN 2.8): the name of a part, a state word or a lane, in the reading face at 700, sentence case. It
 * never moves and never lights. `tilt` is accepted and draws nothing. The name stays TapeLabel until R-T46's rename; the
 * provenance stamp is Stamp.
 */

export interface TapeLabelProps {
  children: ReactNode
  /** `label` makes the strip a form control's label. */
  as?: 'span' | 'label' | 'p' | 'li'
  htmlFor?: string
  id?: string
  /** Which way the strip went on. Fixed per label, never random, so a re-render never re-sticks it. */
  tilt?: 'left' | 'right' | 'none'
  /** A category's code on the strip: its glyph, in its colour. */
  slot?: Slot
  /** A glyph without a colour (a station's code drawn in marker). */
  glyph?: GlyphShape
  size?: 'sm' | 'md'
  className?: string
}

export function TapeLabel({ children, as: Element = 'span', htmlFor, id, tilt = 'left', slot, glyph, size = 'md', className }: TapeLabelProps) {
  const shape = glyph ?? (slot ? SLOT_MARKS[slot].glyph : undefined)
  return (
    <Element className={clsx('es-tape', className)} data-tilt={tilt} data-size={size} htmlFor={Element === 'label' ? htmlFor : undefined} id={id}>
      {shape ? (
        <Glyph
          shape={shape}
          className="es-tape__glyph"
          style={slot ? { color: `var(--es-cat-${slot})` } : undefined}
          edge={slot ? `var(--es-cat-${slot}-edge)` : 'none'}
        />
      ) : null}
      <span className="es-tape__text">{children}</span>
    </Element>
  )
}
