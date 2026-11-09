import type { ReactNode } from 'react'
import type { CompiledBlock } from '@es/schema'
import { Icon } from '@/design/components/Glyph'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket, TicketLine, type TicketState } from '@/design/components/Ticket'
import type { Pending } from './model'
import { Scope } from './Page'

/*
 * The ticket every block of a page is printed on (Blocks.tsx, and the game block, GameBlock.tsx): the page's id on the head line, the
 * block's own on the right, a stamped title, and its facts on strips of masking tape.
 */

/** One block of a compiled page, by its type. */
export type Of<Type extends CompiledBlock['type']> = Extract<CompiledBlock, { type: Type }>

export interface FrameProps {
  /** The block type, for tests and for the task that replaces a placeholder. */
  block: CompiledBlock['type']
  kind?: string
  scope: string
  /** The block's own id, on the right of the head line. */
  meta?: string
  title?: ReactNode
  /** The anchor a link to this section jumps to. */
  anchor?: string
  /** The task that builds what this ticket stands in for, when it is a placeholder. */
  pending?: string
  /** The heat lamp falls on the ticket: the place the next decision acts on (a prediction that waits for its answer, or for its reveal). */
  lamp?: boolean
  stub?: ReactNode
  /** The ticket's state: a block that waits for a file prints as loading, and one that did not load as an error or as blank. */
  state?: TicketState
  loadingLabel?: string
  error?: ReactNode
  empty?: ReactNode
  /** Data attributes the block exposes, for a test and a stylesheet: `{ play: 'loop/async' }` is `data-play="loop/async"`. */
  data?: Readonly<Record<string, string | undefined>>
  children?: ReactNode
}

export function Frame({ block, kind, scope, meta, title, anchor, pending, lamp, stub, state, loadingLabel, error, empty, data = {}, children }: FrameProps) {
  const attributes = Object.fromEntries(Object.entries(data).map(([name, value]) => [`data-${name}`, value]))
  return (
    <Ticket
      as="section"
      id={anchor}
      className="es-c-block"
      data-block={block}
      data-kind={kind}
      data-placeholder={pending}
      {...attributes}
      width="wide"
      lamp={lamp}
      head={<Scope id={scope} />}
      meta={meta}
      title={title}
      titleAs="h2"
      stub={stub}
      state={state}
      loadingLabel={loadingLabel}
      error={error}
      empty={empty}
    >
      {children}
    </Ticket>
  )
}

/** The facts of a block on strips of masking tape. */
export function Tapes({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <ul className="es-c-tapes" aria-label={label}>
      {items.map((item) => (
        <TapeLabel key={item} as="li" size="sm" tilt="none">
          {item}
        </TapeLabel>
      ))}
    </ul>
  )
}

/** The red line that says what is missing and which task builds it. */
export function PendingLine({ task, what }: Pending) {
  return (
    <p className="es-c-pending">
      <TicketLine tone="ink-2" qty={<Icon name="lock" className="es-c-pending__mark" />} note={task}>
        Not built yet: {what}
      </TicketLine>
    </p>
  )
}
