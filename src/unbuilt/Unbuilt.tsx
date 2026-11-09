import type { ReactNode } from 'react'
import { Icon } from '@/design/components/Glyph'
import { Stub } from '@/design/components/Stub'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import '@/pages/panels.css'
import { waveOf, type UnbuiltCopy } from './copy'

/*
 * A page that is not built yet (W1b-T09): its name stamped on a plate over what it is for, then one ticket that lists what it will hold,
 * says in the ribbon's red that it is not built, and names the task and the wave that build it. The stub at the ticket's foot is the
 * way on to a page that is built, so a visitor who followed a link here has somewhere to go. The words are src/unbuilt/copy.ts's.
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

export function Unbuilt({ title, lead, heading, holds, tasks, next, facts = [], tapes = [], children }: UnbuiltProps) {
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
      <Ticket
        as="section"
        width="wide"
        title={heading}
        titleAs="h2"
        foot={[`Arriving with ${waveOf(tasks[0])}`, tasks.join(' · ')]}
        stub={<Stub to={next.to}>{next.label}</Stub>}
      >
        {facts.map((fact) => (
          <p key={fact}>
            <TicketLine>{fact}</TicketLine>
          </p>
        ))}
        <ul className="es-unbuilt__holds">
          {holds.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="es-unbuilt__pending">
          <TicketLine tone="ink-2" qty={<Icon name="lock" className="es-unbuilt__mark" />}>
            Not built yet
          </TicketLine>
        </p>
      </Ticket>
    </div>
  )
}
