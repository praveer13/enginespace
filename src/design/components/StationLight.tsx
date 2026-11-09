import clsx from 'clsx'
import type { ReactNode } from 'react'
import { SLOT_MARKS, type Lane, type Slot } from '../code'
import { Glyph, Icon } from './Glyph'

/**
 * The slot each lane's role stands for in tokens.ts (`lane-cpu` is `cat-blue`, and so on). It is kept here and not in code.ts, because
 * the entry's chunk holds code.ts and this component is not in the front page's; tests/design/components.test.ts draws every lane and
 * holds each mark to the slot that tokens.ts gives the lane.
 */
const LANE_SLOTS: Record<Exclude<Lane, 'idle'>, Slot> = { cpu: 'blue', gpu: 'green', sync: 'yellow', copy: 'brown' }

/*
 * A station's pilot light, in a stainless bezel. Lit, it burns the heat lamp's amber, the one colour of an active state: a light that
 * is on is on in every lane, so a lane's colour never lights a lens. Dark, the lens is deep steel and hollow: stations dark while the
 * expo writes. The state is also a shape (a lit lens has a core, a dark one is a ring) and a word, never colour alone.
 *
 * Which lane a light belongs to is a different thing from whether it is on, and it is drawn apart from the lens: the lane's board
 * colour and its drawn glyph, as a category mark beside the station's name. The mark is the same lit or dark. It is a second carrier
 * and never the only one: the name beside it says the lane in words ("The line", "The expo"), and a reader hears that.
 *
 * States: lit; dark; fault (the ribbon's red, with its mark); under the lamp (`lamp`: the station the next decision acts on);
 * disabled (no power to the station: a dimmed bezel).
 */

export interface StationLightProps {
  lit: boolean
  /** The station's name, shown beside the light. */
  label: ReactNode
  /** The lane the station belongs to, drawn as its category mark beside the name (which says it in words). Never the lens's colour. Left out, no mark. */
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
  lane,
  fault = false,
  lamp = false,
  disabled = false,
  words = { lit: 'busy', dark: 'dark', fault: 'fault' },
  size = 'md',
  className,
}: StationLightProps) {
  const state = fault ? 'fault' : lit ? 'lit' : 'dark'
  const slot = lane ? LANE_SLOTS[lane] : undefined
  return (
    <span
      className={clsx('es-station', className)}
      data-state={state}
      data-lamp={lamp || undefined}
      data-disabled={disabled || undefined}
      data-size={size}
      data-lane={lane}
    >
      <span className="es-station__bezel" aria-hidden="true">
        <span className="es-station__lens">{fault ? <Icon name="alert" className="es-station__fault" /> : null}</span>
      </span>
      <span className="es-station__text">
        <span className="es-station__label">
          {slot ? (
            <Glyph
              shape={SLOT_MARKS[slot].glyph}
              className="es-station__lane"
              style={{ color: `var(--es-cat-${slot})` }}
              edge={`var(--es-cat-${slot}-edge)`}
            />
          ) : null}
          {label}
        </span>
        <span className="es-station__word">{words[state]}</span>
      </span>
    </span>
  )
}
