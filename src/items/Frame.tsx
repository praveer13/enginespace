import type { ReactNode } from 'react'
import { Ticket, type TicketState } from '@/design/components/Ticket'
import '@/content/render/content.css'
import './items.css'

/*
 * The sheet a question set is printed on, whatever it is doing: waiting to start, asking, showing why, or telling the tally. It is the
 * same sheet as every other block of a lesson (src/content/render/BlockFrame.tsx), titled "Questions", and it carries no ids: the learner
 * reads the engine's words. While a question is out, the seed it was made from prints on the foot line, for the eye and for a test: a seed is
 * unseen, and not secret (A§8.2).
 */

export interface FrameProps {
  /** The lesson or module the block belongs to, and the family: both ride as data for a test, and neither is printed. */
  scope: string
  family: string
  /** What the block is doing, for the stylesheet and for a test. */
  phase: 'idle' | 'unbuilt' | 'loading' | 'asking' | 'revealed' | 'done'
  /** The sheet that waits for an answer is the place the next decision acts on: an ink rule across its top. */
  lamp?: boolean
  state?: TicketState
  loadingLabel?: string
  /** The question's own facts for the foot line: its seed, and whether the numbers are new. */
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
      data-scope={scope}
      data-family={family}
      {...attributes}
      width="wide"
      title="Questions"
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
