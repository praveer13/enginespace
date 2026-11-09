import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ticketNo } from '@es/play/loop/layout'
import { Bell } from '@/design/components/Bell'
import { Button } from '@/design/components/Button'
import { Ticket, TicketLine } from '@/design/components/Ticket'
import type { LoopControls } from './useLoopControls'

/*
 * The pieces of Service's controls that every level has: the prompt, the waiting tickets, the bell and Auto (Controls.tsx says how
 * they behave, useLoopControls.ts holds their state). The overlap switch, which only the later levels have, is LoopOverlap.tsx, so a
 * page that opens on the first level (the front page) can load it when it is wanted.
 */

/** The level's prompt: what to do now, in the kitchen's words with the engine's term beside them. */
export function LoopPrompt({ controls, className }: { controls: LoopControls; className?: string }) {
  return (
    <p className={clsx('es-type-body max-w-prose', className)} data-loop-prompt="">
      {controls.view.prompt}
    </p>
  )
}

/**
 * The waiting tickets, as buttons that hang them. `limit` draws only the first few, as a printer's strip shows the tickets it has fed
 * and keeps the rest inside; the keys `1` to `9` still reach every ticket in line, and the strip feeds the next as one is hung.
 */
export function LoopTickets({
  controls,
  limit,
  className,
  listClassName = 'grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6',
  children,
}: {
  controls: LoopControls
  limit?: number
  className?: string
  listClassName?: string
  /** Drawn after the hint, inside the group: what the printer still holds. */
  children?: ReactNode
}) {
  const { view, list, onListKey, tabStop, hang, hint } = controls
  const shown = limit === undefined ? view.waiting : view.waiting.slice(0, limit)
  return (
    <section aria-label="Tickets waiting" className={clsx('flex flex-col gap-2', className)} data-loop-controls="" data-waiting={view.waiting.length}>
      {shown.length > 0 ? (
        <ul ref={list} onKeyDown={onListKey} data-native-keys="arrows" className={listClassName}>
          {shown.map((id, index) => (
            <li key={id} className="min-w-0">
              <Ticket
                as="button"
                compact
                hole={false}
                width="full"
                head={`No. ${ticketNo(id)}`}
                state={view.canHang ? 'default' : 'disabled'}
                tabIndex={index === tabStop ? 0 : -1}
                aria-label={`Hang ticket No. ${ticketNo(id)} on the rail`}
                onClick={() => hang(id, index)}
              >
                <TicketLine>hang</TicketLine>
              </Ticket>
            </li>
          ))}
        </ul>
      ) : null}
      {hint ? <p className="text-text-2">{hint}</p> : null}
      {children}
    </section>
  )
}

/** The bell: it fires the next step. */
export function LoopBell({ controls, size = 'lg', caption = 'fire' }: { controls: LoopControls; size?: 'md' | 'lg'; caption?: ReactNode }) {
  const { view, bell, ring } = controls
  return (
    <div ref={bell}>
      <Bell step={view.step} onRing={ring} disabled={!view.canFire} size={size} caption={caption} />
    </div>
  )
}

/** Auto: rings the bell until the loop needs a decision. A switch that turns itself off; Space works it. */
export function LoopAuto({ controls, size = 'lg' }: { controls: LoopControls; size?: 'sm' | 'md' | 'lg' }) {
  const { view, auto, toggleAuto } = controls
  return (
    <Button size={size} variant="plate" aria-pressed={auto} aria-keyshortcuts="Space" disabled={!view.canFire && !auto} onClick={toggleAuto}>
      Auto
    </Button>
  )
}
