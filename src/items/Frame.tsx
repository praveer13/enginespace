import type { ReactNode } from 'react'
import { Scope } from '@/content/render/Page'
import { Ticket, type TicketState } from '@/design/components/Ticket'
import '@/content/render/content.css'
import './items.css'

/*
 * The ticket an item block is printed on, whatever it is doing: waiting to start, asking, showing why, or telling the tally. It is
 * the same ticket as every other block of a lesson (src/content/render/Blocks.tsx): the lesson's id on the head line, the family's
 * on the right, and a stamped title. The seed the ticket was made from is on its foot line, for the eye and for a test: a seed is
 * unseen, and not secret (A§8.2).
 */

export interface FrameProps {
  /** The lesson or module the block belongs to. */
  scope: string
  family: string
  /** What the block is doing, for the stylesheet and for a test. */
  phase: 'idle' | 'unbuilt' | 'loading' | 'asking' | 'revealed' | 'done'
  /** The heat lamp falls on a ticket that waits for an answer: it is the place the next decision acts on. */
  lamp?: boolean
  state?: TicketState
  loadingLabel?: string
  foot?: readonly [ReactNode, ReactNode?]
  stub?: ReactNode
  /** Data attributes the block exposes: the seed, the level, the variant, the kind of answer. */
  data?: Readonly<Record<string, string | undefined>>
  children?: ReactNode
}

export function Frame({ scope, family, phase, lamp = false, state = 'default', loadingLabel, foot, stub, data = {}, children }: FrameProps) {
  const attributes = Object.fromEntries(Object.entries(data).map(([name, value]) => [`data-${name}`, value]))
  return (
    <Ticket
      as="section"
      className="es-c-block"
      data-block="item"
      data-phase={phase}
      {...attributes}
      width="wide"
      head={<Scope id={scope} />}
      meta={family}
      title="Items"
      titleAs="h2"
      lamp={lamp}
      state={state}
      loadingLabel={loadingLabel}
      foot={foot}
      stub={stub}
    >
      {children}
    </Ticket>
  )
}
