import { fracText } from '@es/play/verifier/ratio'
import type { Frac } from '@es/play/verifier/ratio'
import { formatReadout } from '@/design/format'

/*
 * An exact fraction, printed as a Readout prints a number: in the printer's dots with its provenance tag beside it. The Readout takes
 * a decimal, and the distance from the chef's tasting is a fraction in lowest terms (GAMES.md §10: "an exact fraction"), so this wears
 * the Readout's own classes (src/design/components.css) and says what a decimal could not: the part and the whole.
 *
 * Every fraction of The Tasting is a count of plates over a count of plates, in a world that is made up, so the tag is always synthetic.
 * With `approx`, the decimal it rounds to is printed after it, to that many digits, in the readout's unit style: the fraction is the
 * fact, and the decimal is for the eye.
 */
export function Fraction({
  value,
  size = 'md',
  tone = 'ink',
  approx,
}: {
  value: Frac
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'ink' | 'ink-2' | 'quiet'
  approx?: number
}) {
  return (
    <span className="es-readout" data-size={size} data-tone={tone}>
      <data className="es-readout__value" value={`${value.num}/${value.den}`}>
        {fracText(value)}
      </data>
      {approx === undefined || value.num === 0 ? null : <span className="es-readout__unit">≈ {formatReadout(value.num / value.den, approx)}</span>}
      <span className="es-readout__tag" data-tag="synthetic">
        synthetic
      </span>
    </span>
  )
}
