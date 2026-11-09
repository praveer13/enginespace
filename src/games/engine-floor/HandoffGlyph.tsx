import type { SVGProps } from 'react'
import { GLYPHS } from '@es/play/engine-floor/words'
import type { Mechanism } from '@es/sim/lifecycle'

/*
 * A hand-off's drawn mark (GAMES.md §2.6, "Back of House": spike, window, shelf, dumbwaiter, call, "Heard!", halves), on the design system's
 * 24-unit grid with one stroke weight, in whatever colour the text around it is. The paths are packages/play/engine-floor/words.ts's, which
 * the drawing uses too, so a tile and a stop are one mark. With a `title` the mark is read as the hand-off's name; without, it is
 * decoration beside words that say it.
 */

interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  mechanism: Mechanism
  /** CSS size; the mark is square. */
  size?: number | string
  title?: string
}

export function HandoffGlyph({ mechanism, size = '1em', title, ...rest }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable={false}
      data-handoff={mechanism}
      {...rest}
    >
      {GLYPHS[mechanism].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
