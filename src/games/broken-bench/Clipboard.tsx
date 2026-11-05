import type { ReactNode } from 'react'
import type { SceneView } from '@es/play/broken-bench/types'
import { Readout } from '@/design/components/Readout'
import { TapeLabel } from '@/design/components/TapeLabel'
import { Ticket } from '@/design/components/Ticket'
import { formatReadout } from '@/design/format'
import { noteLines, setupLines, type FormLine } from './Setup'

/*
 * The inspector's clipboard (GAMES.md §11 "Cases", §2.6 "The Inspection"): the kitchen's report and its setup on a form of ticket paper,
 * held in the clip of a steel board. A case is "an inspection report": the claim, the setup, and the notes the inspector counted off the
 * stopwatch's log. The claim is printed large in the printer's dots, because it is the thing on trial; the setup is the report's own
 * flags; the notes are counts that anyone can make, and none of them is the number the court will find.
 *
 * It is DOM, and it is independent of the sheets: the sheets, the tail and the form all draw the same case. The form carries one stamp
 * that says every figure on it is synthetic, as the printer's tape does for its ticks (DESIGN.md, "Printer Tape").
 */

function Lines({ lines, label }: { lines: readonly FormLine[]; label: string }) {
  return (
    <dl className="es-bench-lines" aria-label={label}>
      {lines.map((line) => (
        <div key={line.id} className="es-bench-lines__line" data-line={line.id}>
          <dt>{line.term}</dt>
          <dd>{line.says}</dd>
        </div>
      ))}
    </dl>
  )
}

export interface ClipboardProps {
  scene: SceneView
  caseNo: number
  cases: number
  /** Extra classes of the board, which the page uses to place it. */
  className?: string
  /** What sits under the form: the learner's own words are not on the report, so this is for the page's notes. */
  children?: ReactNode
}

export function Clipboard({ scene, caseNo, cases, className, children }: ClipboardProps) {
  const { claim } = scene
  return (
    <section className={['es-bench-clip', className].filter(Boolean).join(' ')} aria-label="The report on trial, its setup and the inspector's notes" data-bench-clip="">
      <span className="es-bench-clip__spring" aria-hidden="true" />
      <Ticket
        as="div"
        width="full"
        hole={false}
        head="Inspection report"
        meta={cases === 1 ? 'one case' : `case ${caseNo} of ${cases}`}
        foot={['Every figure on this form is synthetic']}
        className="es-bench-form"
      >
        <div className="es-bench-report">
          <div className="es-bench-claim">
            <p className="es-bench-claim__what">
              <TapeLabel size="sm" tilt="left">
                reported
              </TapeLabel>{' '}
              p99 time to first token
            </p>
            <Readout value={claim.valueUs / 1000} digits={1} unit="ms" tag="synthetic" size="xl" className="es-bench-claim__value" />
            <p className="es-bench-claim__basis">
              from <span className="font-numeric">{formatReadout(claim.n)}</span> orders, timed from {claim.timerStartsAt === 'send' ? 'the send' : 'the due time'}
            </p>
          </div>
          <Lines lines={setupLines(scene)} label="The setup of the report" />
        </div>
        <Lines lines={noteLines(scene)} label="The inspector's notes, counted off the log" />
        {children}
      </Ticket>
    </section>
  )
}
