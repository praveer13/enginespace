import { useId } from 'react'
import type { SceneView } from '@es/play/broken-bench/types'
import { formatReadout } from '@/design/format'
import { noteLines, setupLines, type FormLine } from './Setup'

/*
 * The report on trial (GAMES.md §11 "Cases"), beside the chart, in two parts: the claim, which comes first on every width, and the setup the
 * harness was given with what anyone can count off the log. The claim is set large, since it is the thing on trial; the setup is the
 * report's own flags; the counts are facts of the log, and none of them is the number the reference will find. It is DOM, independent of the
 * sheets. The instrument's one stamp, which says every figure on it is synthetic, is the readout strip's (REDESIGN §2.8, the Quiet Provenance
 * Rule).
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

export interface ReportProps {
  scene: SceneView
  caseNo: number
  cases: number
}

/** The claim, set large: it is the thing on trial. */
export function Claim({ scene, caseNo, cases }: ReportProps) {
  const { claim } = scene
  const heading = useId()
  return (
    <section className="es-bench-claim" aria-labelledby={heading} data-bench-report="">
      <h3 id={heading} className="es-bench-claim__what">
        {cases === 1 ? 'Reported p99 time to first token' : `Report ${caseNo} of ${cases}: reported p99 time to first token`}
      </h3>
      <p className="es-bench-claim__value" data-bench-claim="">
        <span className="font-numeric">{formatReadout(claim.valueUs / 1000, 1)}</span> <span className="es-bench-claim__unit">ms</span>
      </p>
      <p className="es-bench-claim__basis">
        from <span className="font-numeric">{formatReadout(claim.n)}</span> requests, timed from {claim.timerStartsAt === 'send' ? 'the send time' : 'the due time'}
      </p>
    </section>
  )
}

/** The setup the harness was given, and what anyone can count off the log. Scrolls inside its own box where the room is short. */
export function Setup({ scene }: { scene: SceneView }) {
  const heading = useId()
  return (
    <section className="es-bench-setup" aria-labelledby={heading} tabIndex={0} data-bench-setup="">
      <h4 id={heading} className="es-bench-setup__sub">
        Setup
      </h4>
      <Lines lines={setupLines(scene)} label="The setup of the report" />
      <p className="es-bench-setup__rule">
        The course fixes the warm-up cut before a run: the first max(<span className="font-numeric">100</span>, 2 × the server&apos;s concurrency limit) requests due.
      </p>
      <h4 className="es-bench-setup__sub">Counted off the log</h4>
      <Lines lines={noteLines(scene)} label="Counts off the log" />
    </section>
  )
}
