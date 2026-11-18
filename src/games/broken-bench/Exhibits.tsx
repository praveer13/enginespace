import { useMemo } from 'react'
import type { Orientation, Sheet } from '@es/play/broken-bench/layout'
import type { ComponentType } from 'react'
import type { RulingView } from '@es/play/broken-bench/types'
import { formatReadout } from '@/design/format'
import './exhibits.css'

/*
 * The exhibits of a report (REDESIGN §2.6, "You against the reference, drawn"), drawn in the diagram at a result, in place of the case: the
 * corrected benchmark run again with the report's p99, the reference's and the learner's flagged on one axis, and the learner's own log
 * around its longest wait, where each request's wait between its due tick and its sent tick is the red dash. A lazy chunk of its own: the
 * route carries none of it until a run ends. It is given the sheets' own drawing tools (`Tools`) and imports none of the game's modules: a lazy
 * chunk that imports from the game's chunk would take the game's own entry from the manifest (verify:bundle). Their figures are synthetic, and
 * the readout strip's stamp beside them says so for the instrument: one stamp (the Quiet Provenance Rule).
 */

const fig = (value: number, digits = 0) => <span className="font-numeric">{formatReadout(value, digits)}</span>
const ms = (us: number, digits = 1) => (
  <>
    {fig(us / 1000, digits)} ms
  </>
)

/**
 * The exhibits of a report, drawn in the diagram: the corrected benchmark run again with the three p99s flagged on one axis, and the learner's
 * own log where a timer started at the send loses time (a log with no request sent late has no such stretch).
 */
/** What the game hands the exhibits: its own drawing of a sheet, and the layouts that make one. */
export interface Tools {
  Plot: ComponentType<{ sheet: Sheet }>
  useOrientation: () => Orientation
  layoutHistogram: typeof import('@es/play/broken-bench/layout').layoutHistogram
  layoutTimeline: typeof import('@es/play/broken-bench/layout').layoutTimeline
  longestWait: typeof import('@es/play/broken-bench/layout').longestWait
  orderNo: typeof import('@es/play/broken-bench/layout').orderNo
}

export default function Exhibits({ ruling, tools }: { ruling: RulingView; tools: Tools }) {
  const { Plot, useOrientation, layoutHistogram, layoutTimeline, longestWait, orderNo } = tools
  const orientation = useOrientation()
  const { truth, prediction, scene } = ruling
  const run = useMemo(
    () =>
      layoutHistogram({
        orientation,
        latencies: ruling.correction.ttftUs,
        cut: 0,
        selected: null,
        claimUs: scene.claim.valueUs,
        correctedUs: truth.p99Us,
        yoursUs: prediction.p99Us,
        caption: 'The corrected run',
      }),
    [layoutHistogram, orientation, ruling.correction.ttftUs, scene.claim.valueUs, truth.p99Us, prediction.p99Us],
  )
  const wait = useMemo(() => longestWait(scene.rows), [longestWait, scene.rows])
  const stretch = useMemo(
    () => (wait === null ? null : layoutTimeline({ orientation, rows: scene.rows, selected: null, from: wait.from, caption: 'Your log, around its longest wait' })),
    [layoutTimeline, orientation, scene.rows, wait],
  )
  return (
    <div className="es-bench-exhibits" data-exhibits="" data-case={ruling.caseNo}>
      <figure className="es-bench-exhibit" data-exhibit="run">
        <Plot sheet={run} />
        <p className="es-bench-flags" data-flags="">
          <span>Reported {ms(scene.claim.valueUs)}</span>
          <span>Corrected {ms(truth.p99Us)}</span>
          <span>Yours {ms(prediction.p99Us)}</span>
        </p>
        <figcaption className="es-bench-sheetnote">
          The corrected benchmark, run again by the reference&apos;s rule: every request of its sample, higher for a longer time to first token on the logarithmic axis, with the report&apos;s p99, the
          reference&apos;s and yours flagged.
        </figcaption>
      </figure>
      {wait === null || stretch === null ? null : (
        <figure className="es-bench-exhibit" data-exhibit="waits">
          <Plot sheet={stretch} />
          <p className="es-bench-flags" data-flags="">
            <span>
              Request <span className="font-numeric">{orderNo(wait.id)}</span> waited {ms(wait.waitUs)}
            </span>
            <span>
              Sent late {fig(scene.facts.lateSends)} of {fig(scene.facts.orders)} requests
            </span>
          </p>
          <figcaption className="es-bench-sheetnote">
            Your own log, from a few requests before the one sent the longest after it was due. Each red dash is a request&apos;s wait between its due tick and its sent tick
            {scene.claim.timerStartsAt === 'send' ? <>, and the report&apos;s timer, started at the send, counted none of it.</> : <>, which the report&apos;s timer, started at the due time, counted.</>}
          </figcaption>
        </figure>
      )}
    </div>
  )
}
