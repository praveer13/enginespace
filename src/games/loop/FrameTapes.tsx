import type { CSSProperties } from 'react'
import type { Frame } from '@es/play/loop/layout'
import { TapeLabel } from '@/design/components/TapeLabel'

/*
 * The kitchen's names over Service's 2D drawing (packages/play/loop/layout.ts, `FrameTape`): masking tape stuck on what each names, the
 * line's on its last station, the fired rail's on its channel, the expo's on the pass's front edge, and the full service's on its comb
 * and its rack. They are the design system's tape in the DOM, as the 3D scene's are (D-021): torn off at the size of their words, and
 * printed at the drawing box's size and never under the size ramp's smallest step, however small the drawing is drawn (components.css,
 * "tape stuck on a drawing"). The layer is laid over the frame as the SVG lays the frame out in its box (`fit`): covering it, fitted in
 * it, or filling a box that is the frame's own (the front page's). The drawing's accessible name and the mirror carry the state, so the
 * names are for the eye, as a scene's labels are.
 */

/** How the drawing's frame lies in its box: covering it and cut at its sides, fitted inside it, or filling a box of its own shape. */
export type FrameFit = 'cover' | 'contain' | 'fill'

export function FrameTapes({ frame, fit }: { frame: Frame; fit: FrameFit }) {
  if (frame.tapes.length === 0) return null
  const share = (value: number, of: number) => `${Math.round((value / of) * 10000) / 100}%`
  return (
    <div className="es-frame-tapes" data-fit={fit} style={{ '--es-frame-ratio': frame.width / frame.height } as CSSProperties} aria-hidden="true">
      {frame.tapes.map((tape) => (
        <span key={tape.id} className="es-frame-tapes__tape" data-tape={tape.id} data-place={tape.place} style={{ left: share(tape.x, frame.width), top: share(tape.y, frame.height) }}>
          <TapeLabel size="sm" tilt="none">
            {tape.text}
          </TapeLabel>
        </span>
      ))}
    </div>
  )
}
