import type { CSSProperties, ReactNode } from 'react'
import './versus.css'

/*
 * You against the reference, drawn (REDESIGN §2.6): when a run ends, each count of the learner's run is a solid bar, and the reference
 * run's is a hollow outline under it, on the same axis, so "how far off" is a length to see. The figures are text beside the bars, and the
 * rows are a list in the DOM, so a screen reader reads each count's two values. The bars are drawn at their end: nothing grows or moves.
 *
 * It loads with the result, never before: a game's route carries none of it.
 */

export interface VersusRow {
  readonly id: string
  readonly label: ReactNode
  readonly mine: number
  readonly reference: number
}

export interface VersusProps {
  /** What the bars measure, said first. */
  caption: ReactNode
  rows: readonly VersusRow[]
  /** The figure's one stamp. */
  stamp?: ReactNode
  className?: string
}

export function Versus({ caption, rows, stamp, className }: VersusProps) {
  // One axis for every row: from 0 to the largest value of either run.
  const top = Math.max(1, ...rows.flatMap((row) => [row.mine, row.reference]))
  const at = (value: number) => ({ '--es-share': Math.max(0, value) / top }) as CSSProperties
  return (
    <figure className={className === undefined ? 'es-versus' : `es-versus ${className}`} data-versus="">
      <figcaption className="es-versus__caption">
        <span>{caption}</span>
        {stamp}
      </figcaption>
      <p className="es-versus__key">
        <span className="es-versus__swatch" data-run="mine" aria-hidden="true" /> yours <span className="es-versus__swatch" data-run="reference" aria-hidden="true" /> the
        reference, drawn hollow
      </p>
      <ul className="es-versus__rows">
        {rows.map((row) => (
          <li key={row.id} className="es-versus__row" data-row={row.id}>
            <span className="es-versus__label">{row.label}</span>
            <span className="es-versus__track">
              <span className="es-versus__bar" data-run="mine" style={at(row.mine)} />
              <span className="es-versus__value">
                <span className="sr-only">yours </span>
                <data value={String(row.mine)}>{row.mine}</data>
              </span>
            </span>
            <span className="es-versus__track">
              <span className="es-versus__bar" data-run="reference" style={at(row.reference)} />
              <span className="es-versus__value" data-run="reference">
                <span className="sr-only">the reference </span>
                <data value={String(row.reference)}>{row.reference}</data>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
