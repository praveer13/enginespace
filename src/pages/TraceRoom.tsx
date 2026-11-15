import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { TextLink } from '@/design/components/TextLink'
import { TEST_HOOKS } from '@/scene/test-hook'
import { syntheticId, syntheticSeed } from '@/trace/ids'
import { UNBUILT } from '@/unbuilt/copy'
import { Unbuilt } from '@/unbuilt/Unbuilt'

// Serves both /trace-room (the list) and /trace-room/:trace (one trace). The list is W2-T20's. Until it lands, the one tape on show is the
// specimen at /trace-room/synthetic-<seed>, in the dev server and in test builds (VITE_ES_TEST_HOOKS=1), and nowhere else: a production
// build keeps the stub it had. Mounting the viewer in production adds 175 B to the front page's first-paint closure, or 141 B with the
// viewer lazy, because the route then shares the step-loop code with the front page and lists more chunks to preload, and that closure
// had 145 B under its gate [measured 2026-11-04 by verify:bundle on wave-1 at 92b922f, with and without W1-T09]. Going over the gate is
// the owner's call (D-023), and W2-T20, which ships the Trace Room, is the task that needs the viewer there. The two constants are fixed
// when the app is built (MODE is the mode of `vite`, not NODE_ENV, which a test run sets for the build it makes), so a production build
// holds none of it on this route: no chunk, no preload name, nothing shared. (The viewer is in a production build all the same, as the lazy
// chunk that the debrief of Back of House's graded map loads once a run is judged, W1-T19; no route's closure reaches it.)
const SHOW_SPECIMEN = TEST_HOOKS || import.meta.env.MODE === 'development'
const Specimen = SHOW_SPECIMEN ? lazy(() => import('@/trace/SpecimenPage')) : null

export function Component() {
  const { trace: traceId } = useParams()
  const seed = SHOW_SPECIMEN ? syntheticSeed(traceId) : null
  if (Specimen !== null && traceId !== undefined && seed !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1>The Trace Room</h1>
        <Suspense fallback={<p>Loading the tape.</p>}>
          <Specimen id={traceId} seed={seed} />
        </Suspense>
      </div>
    )
  }
  return (
    <Unbuilt {...UNBUILT.traceRoom} facts={traceId ? [`Trace id: ${traceId}`] : []}>
      {SHOW_SPECIMEN ? (
        <p>
          A specimen tape is on show: <TextLink to={`/trace-room/${syntheticId(7)}`}>a synthetic night, seed 7</TextLink>.
        </p>
      ) : null}
    </Unbuilt>
  )
}
