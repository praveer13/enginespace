import clsx from 'clsx'
import type { ReactNode } from 'react'
import '../parts.css'

/*
 * The marker: amber means now (REDESIGN 2.8, the One Marker Rule). It is always the amber with its dark edge, a shape and a word,
 * so it never says "now" by colour alone (the marker on paper is 1.68:1 [derived], too faint to carry anything by itself).
 *
 *   - `mark`: a pennant and its word, for the current place in a section rail or on the course track;
 *   - `cursor`: the "now" line on a diagram, 2 px of amber in its edge, its word at the head. It stands at `at`, a fraction of its
 *     positioned parent's width, and fills its height;
 *   - `ring`: an amber ring around the one control an intro points at, with its word beside the control.
 *
 * Amber has these carriers and no others. The focus ring is ink, so focus is never mistaken for now.
 */

export interface MarkerProps {
  kind?: 'mark' | 'cursor' | 'ring'
  /** The word the marker carries. "now" unless the place has a better one. */
  word?: ReactNode
  /** `ring`: the control the marker points at. */
  children?: ReactNode
  /** `cursor`: where the line stands, from 0 (the start of the axis) to 1 (its end). */
  at?: number
  className?: string
}

function Pennant() {
  return (
    <svg className="es-marker__shape" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 2.5 13.5 8 3 13.5Z" />
    </svg>
  )
}

export function Marker({ kind = 'mark', word = 'now', children, at, className }: MarkerProps) {
  if (kind === 'ring')
    return (
      <span className={clsx('es-marker', className)} data-kind="ring">
        <span className="es-marker__ring">{children}</span>
        <span className="es-marker__tab">
          <Pennant />
          <span className="es-marker__word">{word}</span>
        </span>
      </span>
    )
  return (
    <span
      className={clsx('es-marker', className)}
      data-kind={kind}
      style={kind === 'cursor' && at !== undefined ? { insetInlineStart: `${Math.min(1, Math.max(0, at)) * 100}%` } : undefined}
    >
      <Pennant />
      <span className="es-marker__word">{word}</span>
    </span>
  )
}
