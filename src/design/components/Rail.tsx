import clsx from 'clsx'
import type { ReactNode } from 'react'

/*
 * The ticket rail: a stainless bar with a fixed number of clips, one per batch slot (GAMES.md §2.6: a clip without a
 * ticket is paid for and empty). Tickets hang from their clips; an empty clip says so in words, never by colour alone.
 *
 * States: default; under the lamp (`lamp`: the rail is the present); empty (every clip open, which is itself the
 * picture of an idle batch); disabled (the rail is not taking tickets); loading (the clips are being set).
 */

export interface RailProps {
  /** How many clips the rail has. */
  clips: number
  /** What hangs on each clip, by position; a missing or null entry is an empty clip. */
  tickets?: readonly (ReactNode | null | undefined)[]
  /** The rail's accessible name, such as "The rail: 4 clips". */
  label: string
  lamp?: boolean
  state?: 'default' | 'disabled' | 'loading'
  /** What an empty clip says. */
  emptyLabel?: ReactNode
  className?: string
}

export function Rail({ clips, tickets = [], label, lamp = false, state = 'default', emptyLabel = 'clip paid for, empty', className }: RailProps) {
  const positions = Array.from({ length: clips }, (_, index) => tickets[index] ?? null)
  const hung = positions.filter((ticket) => ticket !== null).length
  return (
    <div
      className={clsx('es-rail', className)}
      data-lamp={lamp || undefined}
      data-state={state}
      data-empty={hung === 0 || undefined}
      aria-busy={state === 'loading' || undefined}
      style={{ ['--es-rail-clips' as string]: clips }}
    >
      <div className="es-rail__bar" aria-hidden="true" />
      <ol className="es-rail__clips" aria-label={label}>
        {positions.map((ticket, index) => (
          <li key={index} className="es-rail__clip" data-empty={ticket === null || undefined}>
            <span className="es-rail__grip" aria-hidden="true" />
            {ticket ?? <span className="es-rail__open">{emptyLabel}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
