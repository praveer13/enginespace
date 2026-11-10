import type { CSSProperties } from 'react'
import type { Frame } from '@es/play/loop/layout'
import { TapeLabel } from '@/design/components/TapeLabel'

/*
 * The print over Service's 2D drawing (packages/play/loop/layout.ts, `FrameTag` and `FrameTape`), in the DOM as the 3D scene prints its
 * own (D-021, Scene3D.tsx): the drawing holds no word and no number. Each piece is stuck on what it belongs to. A ticket's number is Doto on
 * its paper, on the rail, on the fired rail and on the counter in front of the printer; an empty clip's stub hangs from the clip's jaw, its
 * word in the ribbon's red; the printer's count of what it still holds is on its housing; on the full service each mold's size is stamped on
 * the steel in front of it, the fire's mold's on a chip of the lamp's amber. The kitchen's names are the design system's masking tape: the
 * line's on its last station, the fired rail's on its channel, the expo's on the pass's front edge, and the full service's on its comb and
 * its rack. All of it prints at the drawing box's size and never under the size ramp's smallest step, however small the drawing is drawn
 * (components.css, "print stuck on a drawing"), and print that needs room is left to the mirror and the controls in a small box, as the
 * scene leaves it.
 *
 * The layer is laid over the frame as the SVG lays the frame out in its box (`fit`): covering it, fitted in it, or filling a box that is the
 * frame's own (the front page's). The drawing's accessible name, the controls and the mirror carry the state, so the print is for the eye,
 * as a scene's labels are.
 */

/** How the drawing's frame lies in its box: covering it and cut at its sides, fitted inside it, or filling a box of its own shape. */
export type FrameFit = 'cover' | 'contain' | 'fill'

export function FrameLabels({ frame, fit }: { frame: Frame; fit: FrameFit }) {
  if (frame.tapes.length + frame.tags.length === 0) return null
  const at = (x: number, y: number): CSSProperties => ({ left: `${Math.round((x / frame.width) * 10000) / 100}%`, top: `${Math.round((y / frame.height) * 10000) / 100}%` })
  return (
    <div className="es-frame-labels" data-fit={fit} style={{ '--es-frame-ratio': frame.width / frame.height } as CSSProperties} aria-hidden="true">
      {frame.tags.map((tag) => (
        <span key={tag.id} className="es-frame-labels__tag" data-tag={tag.id} data-kind={tag.kind} data-room={tag.room ? '' : undefined} style={at(tag.x, tag.y)}>
          {tag.text}
        </span>
      ))}
      {frame.tapes.map((tape) => (
        <span key={tape.id} className="es-frame-labels__tape" data-tape={tape.id} data-place={tape.place} style={at(tape.x, tape.y)}>
          <TapeLabel size="sm" tilt="none">
            {tape.text}
          </TapeLabel>
        </span>
      ))}
    </div>
  )
}
