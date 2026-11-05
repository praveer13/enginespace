import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { stepWindows } from '@es/sim/trace'
import { TEST_HOOKS } from '@/scene/test-hook'
import { denseTrace } from './dense'
import { exportMarks, NO_ANNOTATIONS, traceMarkRef } from './marks'
import type { Annotations } from './marks'
import { specimenTrace } from './specimen'
import { TraceView } from './TraceView'

/*
 * A specimen tape on the Trace Room's route (`/trace-room/synthetic-<seed>`): the viewer on the step-loop model's night for a seed,
 * with the marks as a `trace-mark` event's data under it, so a reader can see what leaves the viewer. It is practice: the page
 * writes nothing to the ledger (ARCHITECTURE §1, I2), and the task is named `read`. W2-T20 builds the Trace Room proper around
 * this viewer; until then, this is the one place it is on show.
 *
 * The route mounts this page in the dev server and in test builds only, so that a production build holds none of the viewer
 * (src/pages/TraceRoom.tsx gives the reason). In a test build the address may carry `?spans=<n>` for a tape of that many spans, which is how the frame rate is
 * measured on 100,000 (W1-T09, accept 1); a production build has no such tape in it.
 */

export default function Specimen({ id, seed }: { id: string; seed: number }) {
  const [params] = useSearchParams()
  const spans = TEST_HOOKS ? Number(params.get('spans')) || 0 : 0
  const trace = useMemo(() => (spans > 0 ? denseTrace(seed, spans) : specimenTrace(seed)), [seed, spans])
  const [notes, setNotes] = useState<Annotations>(NO_ANNOTATIONS)
  // It opens on the sixth step, a decode step of the steady state: the first has no wait before it, and in a step like this one the line
  // goes dark for longer than it is lit while the expo writes the next call.
  const opening = useMemo(() => {
    const step = stepWindows(trace)[5]
    return step === undefined ? undefined : { fromNs: step.fromNs - Math.round((step.toNs - step.fromNs) * 0.04), toNs: step.toNs + Math.round((step.toNs - step.fromNs) * 0.04) }
  }, [trace])
  return (
    <div className="flex flex-col gap-6">
      <TraceView trace={trace} traceId={id} headingLevel={2} initialWindow={opening} onNotesChange={setNotes} />
      <details className="max-w-prose" data-trace-export="">
        <summary className="cursor-pointer font-bold">The marks as a trace-mark event</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p>
            This is what a host would write for these marks: the ref <code className="es-type-mono">{traceMarkRef(id, 'read')}</code>, and the marks below as the event’s data. This page is practice,
            so it writes nothing.
          </p>
          <pre className="es-type-mono overflow-x-auto border border-edge bg-paper p-3 text-paper-ink" tabIndex={0} aria-label="The marks as JSON">
            <code data-trace-json="">{JSON.stringify(exportMarks(notes), null, 2)}</code>
          </pre>
        </div>
      </details>
    </div>
  )
}
