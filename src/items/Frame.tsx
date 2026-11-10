import type { ReactNode } from 'react'
import { Scope } from '@/content/render/Page'
import { Ticket, type TicketState } from '@/design/components/Ticket'
import '@/content/render/content.css'
import './items.css'

/*
 * The ticket an item block is printed on, whatever it is doing: waiting to start, asking, showing why, or telling the tally. It is
 * the same ticket as every other block of a lesson (src/content/render/BlockFrame.tsx): a stamped title that leads the paper, with no
 * line over it, and the lesson's id and the family's on the foot line. While a ticket is out, the seed it was made from prints on the
 * foot line too, at the right, for the eye and for a test: a seed is unseen, and not secret (A§8.2).
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
  /** The ticket's own facts for the foot line (its seed and whether it was seen), which print after the lesson's id and the family's. */
  foot?: readonly [ReactNode, ReactNode?]
  stub?: ReactNode
  /** Data attributes the block exposes: the seed, the level, the variant, the kind of answer. */
  data?: Readonly<Record<string, string | undefined>>
  children?: ReactNode
}

/** Two facts on one side of the foot line, with the printer's dot between them for the eye. */
const both = (a: ReactNode, b: ReactNode) => (
  <>
    {a}
    <span aria-hidden="true"> · </span>
    {b}
  </>
)

export function Frame({ scope, family, phase, lamp = false, state = 'default', loadingLabel, foot, stub, data = {}, children }: FrameProps) {
  const attributes = Object.fromEntries(Object.entries(data).map(([name, value]) => [`data-${name}`, value]))
  // The ids sit as every block's do (the lesson's at the left, the family's at the right) until the ticket has a seed to print as well.
  const ids = foot === undefined ? ([<Scope id={scope} />, family] as const) : ([both(<Scope id={scope} />, family), foot[1] === undefined ? foot[0] : both(foot[0], foot[1])] as const)
  return (
    <Ticket
      as="section"
      className="es-c-block"
      data-block="item"
      data-phase={phase}
      {...attributes}
      width="wide"
      title="Items"
      titleAs="h2"
      lamp={lamp}
      state={state}
      loadingLabel={loadingLabel}
      foot={ids}
      stub={stub}
    >
      {children}
    </Ticket>
  )
}
