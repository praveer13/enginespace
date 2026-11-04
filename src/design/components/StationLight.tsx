import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { Lane } from '../code'
import { Icon } from './Glyph'

/*
 * A station's pilot light, in a stainless bezel. Lit, it glows in its lane's colour of the code (the line's stations
 * are the GPU lane: busy is lit). Dark, the lens is deep steel and hollow: stations dark while the expo writes. The
 * state is also a shape (a lit lens has a core, a dark one is a ring) and a word, never colour alone.
 *
 * States: lit; dark; fault (the ribbon's red, with its mark); under the lamp (`lamp`: the station the next decision
 * acts on); disabled (no power to the station: a dimmed bezel).
 */

export interface StationLightProps {
  lit: boolean
  /** The station's name, shown beside the light. */
  label: ReactNode
  /** Which lane's colour it burns in. Default `gpu`: the line. */
  lane?: Exclude<Lane, 'idle'>
  fault?: boolean
  lamp?: boolean
  disabled?: boolean
  /** The word for each state. */
  words?: { lit: string; dark: string; fault: string }
  size?: 'sm' | 'md'
  className?: string
}

export function StationLight({
  lit,
  label,
  lane = 'gpu',
  fault = false,
  lamp = false,
  disabled = false,
  words = { lit: 'busy', dark: 'dark', fault: 'fault' },
  size = 'md',
  className,
}: StationLightProps) {
  const state = fault ? 'fault' : lit ? 'lit' : 'dark'
  return (
    <span
      className={clsx('es-station', className)}
      data-state={state}
      data-lamp={lamp || undefined}
      data-disabled={disabled || undefined}
      data-size={size}
      style={{ ['--es-station-light' as string]: `var(--es-lane-${lane})` }}
    >
      <span className="es-station__bezel" aria-hidden="true">
        <span className="es-station__lens">{fault ? <Icon name="alert" className="es-station__fault" /> : null}</span>
      </span>
      <span className="es-station__text">
        <span className="es-station__label">{label}</span>
        <span className="es-station__word">{words[state]}</span>
      </span>
    </span>
  )
}
