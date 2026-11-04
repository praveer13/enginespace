import clsx from 'clsx'
import { formatReadout } from '../format'

/*
 * The numeral readout: every count, tick, µs and percentage on screen passes through it, set in the printer's dot
 * matrix with tabular figures. It will not print a number without its tag (the agent brief's rule 7), and ticks can
 * only ever be tagged synthetic (D-048): both are type errors, not conventions.
 */

/** Where a number comes from (ARCHITECTURE §4.4's tags, plus `synthetic` for the seeded worlds' own clocks and data). */
export type NumberTag = 'measured' | 'derived' | 'estimated' | 'unverified' | 'synthetic'

/** The units a readout prints. `ticks` is the front page's synthetic clock (D-048). */
export type ReadoutUnit =
  | 'ticks'
  | 'µs'
  | 'ms'
  | 'ns'
  | 's'
  | 'tokens'
  | 'tok/s'
  | 'requests'
  | 'steps'
  | 'pages'
  | 'slots'
  | 'stations'
  | '%'
  | '‰'
  | 'B'
  | 'KB'
  | 'MB'
  | 'GB'
  | 'x'
  | ':1'

interface ReadoutCommon {
  value: number
  /** Digits after the decimal point. Default 0. */
  digits?: number
  /** Zero-pad the integer part to this many digits, as the printer numbers its tickets. */
  pad?: number
  /** For a measured number: the date and build SHA it was measured at, printed after the tag. */
  source?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** `ink-2` prints in the ribbon's red; `quiet` in the secondary text colour. */
  tone?: 'ink' | 'ink-2' | 'quiet'
  className?: string
}

/** A tick count is always synthetic. */
interface TickReadout {
  unit: 'ticks'
  tag: 'synthetic'
}

interface OtherReadout {
  unit?: Exclude<ReadoutUnit, 'ticks'>
  tag: NumberTag
}

export type ReadoutProps = ReadoutCommon & (TickReadout | OtherReadout)

export function Readout({ value, unit, tag, digits = 0, pad, source, size = 'md', tone = 'ink', className }: ReadoutProps) {
  const unitIsTight = unit === '%' || unit === '‰' || unit === 'x' || unit === ':1'
  return (
    <span className={clsx('es-readout', className)} data-size={size} data-tone={tone}>
      <data className="es-readout__value" value={String(value)}>
        {formatReadout(value, digits, pad)}
        {unit && unitIsTight ? unit : null}
      </data>
      {unit && !unitIsTight ? <span className="es-readout__unit">{unit}</span> : null}
      <span className="es-readout__tag" data-tag={tag}>
        {tag}
        {source ? <span className="es-readout__source"> {source}</span> : null}
      </span>
    </span>
  )
}
