import { lazy, Suspense, useState } from 'react'
import { Button } from '@/design/components/Button'
import { LoadingDots } from '@/design/components/LoadingDots'
import type { Of } from './BlockFrame'

/*
 * A trace block in a lesson (W2-T42, REDESIGN §2.5): a Run-style block, in the lesson's frame beside the game blocks. It waits under one
 * button, "Open the trace", and loads the viewer (TraceTape.tsx) when the learner asks, so a lesson's first paint carries none of it. A trace
 * with no seed is a pinned one, which the owner has not captured yet (PRODUCT.md, "Evidence on Hand"), and it says so.
 */

const TraceTape = lazy(() => import('./TraceTape'))

export interface TraceRunProps {
  block: Of<'trace'>
  scope: string
  rev?: string
  /** On a ticket whose title already says what it is: no head of its own. */
  bare?: boolean
}

export function TraceRun({ block, scope, rev, bare = false }: TraceRunProps) {
  const [open, setOpen] = useState(false)
  const synthetic = block.seed !== undefined
  return (
    <div className="es-run es-trace-run" data-block="trace" data-phase={!synthetic ? 'unbuilt' : open ? 'open' : 'waiting'}>
      {bare ? null : (
        <p className="es-run__head">
          <span className="es-run__kind">Trace</span>
          <span className="es-run__title">Mark the tape</span>
          <span className="es-run__game">{synthetic ? 'Synthetic: made by the course’s model' : 'A captured trace'}</span>
        </p>
      )}
      {!synthetic ? (
        <p className="es-run__note">This trace has not been captured yet, so it is not on the site.</p>
      ) : open ? (
        <Suspense
          fallback={
            <p className="es-run__loading es-trace-run__loading" role="status" tabIndex={-1}>
              <LoadingDots />
              <span>Loading the trace…</span>
            </p>
          }
        >
          <TraceTape block={block} scope={scope} rev={rev} autoFocus />
        </Suspense>
      ) : (
        <p className="es-run__start">
          <Button variant="ink" onClick={() => setOpen(true)}>
            Open the trace
          </Button>
          <span className="es-run__mode">Made from a seed, with invented durations. It is no measurement of an engine, and your marks are practice.</span>
        </p>
      )}
    </div>
  )
}
