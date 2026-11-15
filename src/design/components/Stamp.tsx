import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Popover } from './Popover'
import type { NumberTag } from './Readout'
import '../parts.css'

/*
 * The stamp: a small bordered word that says where a number comes from (REDESIGN 2.4 and 2.8, the Quiet Provenance Rule). One per
 * instrument, table or figure, never inside a sentence. Every stamp is a button that opens the tag legend: four lines, one per
 * provenance word. "Unverified" is drawn in the alert ink, and its sheet says first what it means, above the same four lines.
 *
 * States: hover (the stamp's ground takes the well), focus (the ink ring), active (pressed into the well), open (pressed, and
 * `aria-expanded`), disabled (quiet ink, dashed).
 */

/** The four provenance words of the legend, in its order, with what each means. */
export const TAG_LEGEND = [
  { word: 'measured', means: 'Read or measured from the named source, on the stated date.' },
  { word: 'derived', means: 'Arithmetic on numbers that carry tags of their own.' },
  { word: 'estimated', means: 'A judgment or a design target, not a measurement.' },
  { word: 'synthetic', means: 'Made by the seeded model in your browser: the same seed gives the same number.' },
] as const satisfies readonly { word: Exclude<NumberTag, 'unverified'>; means: string }[]

export const UNVERIFIED_MEANS = 'Not yet checked against a primary source, so nothing rests on it.'

/** The tag legend alone, as About prints it under "How numbers are tagged". */
export function TagLegend({ className }: { className?: string }) {
  return (
    <dl className={clsx('es-taglegend', className)}>
      {TAG_LEGEND.map(({ word, means }) => (
        <div key={word} className="es-taglegend__line">
          <dt>
            <span className="es-stamp__word">{word}</span>
          </dt>
          <dd>{means}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface StampProps {
  word: NumberTag
  /** For a measured number: the date and the build it was measured at, said first in the sheet. */
  source?: ReactNode
  disabled?: boolean
  defaultOpen?: boolean
  className?: string
  'data-force'?: 'hover' | 'focus' | 'active'
}

export function Stamp({ word, source, disabled, defaultOpen, className, 'data-force': force }: StampProps) {
  return (
    <Popover
      variant="stamp"
      className={clsx('es-stamp', className)}
      trigger={
        <>
          <span className="es-stamp__word">{word}</span>
          <span className="sr-only">: how numbers are tagged</span>
        </>
      }
      triggerData={{ 'data-word': word }}
      title="How numbers are tagged"
      disabled={disabled}
      defaultOpen={defaultOpen}
      data-force={force}
    >
      {word === 'unverified' ? (
        <p className="es-stamp__lead" data-word="unverified">
          <strong>Unverified:</strong> {UNVERIFIED_MEANS}
        </p>
      ) : source ? (
        <p className="es-stamp__lead">
          <strong>{word}:</strong> {source}
        </p>
      ) : null}
      <TagLegend />
    </Popover>
  )
}
