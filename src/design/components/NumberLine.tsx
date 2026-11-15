import clsx from 'clsx'
import type { CSSProperties, ReactNode } from 'react'
import { formatReadout } from '../format'
import '../parts.css'

/*
 * The number line: the reveal (REDESIGN 2.6). The learner's guess and the run's result land as pins on one axis, with the
 * reference beside them when there is one, so "how far off" is a distance you can see. Each kind of pin has its own shape and its
 * word, never a colour: the guess is a hollow diamond above the line, the result a solid ink disc below it, and the reference a
 * dashed hollow ring below the result. The values are text, in the numeric face, and the axis prints its two ends. The pins are a
 * list in the DOM, so a screen reader reads each one's word and value.
 */

export interface NumberPin {
  id: string
  kind: 'guess' | 'result' | 'reference'
  value: number
  /** The pin's word: "your guess", "the run", "the reference". */
  label: ReactNode
}

export interface NumberLineProps {
  min: number
  max: number
  pins: readonly NumberPin[]
  unit?: string
  digits?: number
  /** What the line measures, said first: "Pages held by request 1". */
  caption: ReactNode
  /** The figure's one stamp. */
  stamp?: ReactNode
  className?: string
}

export function NumberLine({ min, max, pins, unit, digits = 0, caption, stamp, className }: NumberLineProps) {
  const span = max - min || 1
  const at = (value: number) => Math.min(1, Math.max(0, (value - min) / span))
  const print = (value: number) => `${formatReadout(value, digits)}${unit ? ` ${unit}` : ''}`
  return (
    <figure className={clsx('es-numline', className)}>
      <figcaption className="es-numline__caption">
        <span>{caption}</span>
        {stamp}
      </figcaption>
      <div className="es-numline__plot">
        <span className="es-numline__axis" aria-hidden="true" />
        <ul className="es-numline__pins">
          {pins.map((pin) => {
            const where = at(pin.value)
            return (
              <li
                key={pin.id}
                className="es-numline__pin"
                data-kind={pin.kind}
                data-align={where > 0.7 ? 'end' : where < 0.3 ? 'start' : undefined}
                style={{ '--es-at': where } as CSSProperties}
              >
                <span className="es-numline__mark" aria-hidden="true" />
                <span className="es-numline__text">
                  <span className="es-numline__word">{pin.label}</span> <data value={String(pin.value)}>{print(pin.value)}</data>
                </span>
              </li>
            )
          })}
        </ul>
        <span className="es-numline__ends" aria-hidden="true">
          <span>{print(min)}</span>
          <span>{print(max)}</span>
        </span>
      </div>
    </figure>
  )
}
