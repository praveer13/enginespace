import type { ReactNode } from 'react'
import { Icon } from '@/design/components/Glyph'
import { ContinueLink } from '@/design/components/Board'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Sheet, SheetLine } from '@/design/components/Sheet'
import '@/pages/panels.css'
import { usePointer } from '@/settings/usePlace'
import type { UnbuiltCopy } from './copy'

/*
 * A page that is not published yet: its name over what it is for, then one sheet that lists what it will hold and says, in the second
 * ink, that it is not published yet. Under the sheet is Continue, the same control as the header's and the same answer (the pointer),
 * so a visitor who followed a link here is handed back to the course. The words are src/unbuilt/copy.ts's, and none of them names a
 * task or a wave.
 *
 * It sets no title of its own: the route names one, and a page whose title depends on its address (a lab's) sets it itself.
 */

export interface UnbuiltProps extends UnbuiltCopy {
  /** What the address says, printed above the list in the printer's dots: `Trace id: sample`. */
  facts?: readonly string[]
  /** Facts of the page on strips of masking tape, under its lead: the lane and the module of a lab. */
  tapes?: readonly string[]
  /** What the page holds today, drawn before the ticket of what it will hold. */
  children?: ReactNode
}

export function Unbuilt({ title, lead, heading, holds, facts = [], tapes = [], children }: UnbuiltProps) {
  const pointer = usePointer()
  return (
    <div className="es-page es-unbuilt" data-page="unbuilt">
      <header className="es-page__header">
        <h1 className="es-page__title">{title}</h1>
        <p className="es-page__lead">{lead}</p>
        {tapes.length > 0 ? (
          <ul className="es-unbuilt__tapes" aria-label="About this page">
            {tapes.map((tape) => (
              <TapeLabel key={tape} as="li" size="sm" tilt="none">
                {tape}
              </TapeLabel>
            ))}
          </ul>
        ) : null}
      </header>
      {children}
      <Sheet
        as="section"
        width="wide"
        title={heading}
        titleAs="h2"
      >
        {facts.map((fact) => (
          <p key={fact}>
            <SheetLine>{fact}</SheetLine>
          </p>
        ))}
        <ul className="es-unbuilt__holds">
          {holds.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="es-unbuilt__pending">
          <SheetLine tone="ink-2" qty={<Icon name="lock" className="es-unbuilt__mark" />}>
            Not published yet
          </SheetLine>
        </p>
      </Sheet>
      <nav aria-label="The way on" className="es-unbuilt__next">
        <ContinueLink target={pointer} emphasis="primary" minutes={pointer.minutes} />
      </nav>
    </div>
  )
}
