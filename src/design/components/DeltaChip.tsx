import clsx from 'clsx'
import type { ReactNode } from 'react'
import { formatReadout } from '../format'
import '../parts.css'

/*
 * The delta: what an action just changed, beside the readout it changed (REDESIGN 2.6, "the change travels to the number"). The
 * readout steps to its new value at once; the delta ("+4 tokens", "idle +3 ticks") stays for one second and then fades out. One
 * second is the three short durations end to end (dur-settle, dur-step and dur-quick), so it moves with the motion roles. Re-key it
 * to show a new delta. Under reduced motion it does not fade: it stays until the next delta replaces it.
 *
 * The sign is always printed (a true minus for a fall), so the direction never rests on colour. It is not a live region: the
 * readout's own announcement says the new value.
 */

export interface DeltaChipProps {
  value: number
  unit?: string
  /** What changed, before the number: "idle". */
  what?: ReactNode
  digits?: number
  /** Stay, and do not fade: for a page that shows the delta as a fact, and for /design. */
  hold?: boolean
  className?: string
}

export function DeltaChip({ value, unit, what, digits = 0, hold = false, className }: DeltaChipProps) {
  const sign = value > 0 ? '+' : value === 0 ? '±' : ''
  return (
    <span className={clsx('es-delta', className)} data-hold={hold ? '' : undefined}>
      {what ? <span className="es-delta__what">{what} </span> : null}
      <span className="es-delta__value">
        {sign}
        {formatReadout(value, digits)}
      </span>
      {unit ? <span className="es-delta__unit"> {unit}</span> : null}
    </span>
  )
}
