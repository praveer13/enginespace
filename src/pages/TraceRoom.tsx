import { useParams } from 'react-router'
import { TextLink } from '@/design/components/TextLink'
import { syntheticId, syntheticSeed } from '@/trace/ids'
import Specimen from '@/trace/SpecimenPage'

// Serves both /trace-room (the list) and /trace-room/:trace (one trace). The list is W2-T20's; until it lands, the one tape on show
// is the specimen at /trace-room/synthetic-<seed>. The viewer is part of this route's own chunk (A§3.1: `trace-room`): D-023 makes every
// route lazy, and tests/build.test.ts holds the lazy chunks to pages, a game's views and the scene kit, so the viewer is not one of its own.
export function Component() {
  const { trace: traceId } = useParams()
  const seed = syntheticSeed(traceId)
  if (traceId !== undefined && seed !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1>The Trace Room</h1>
        <Specimen id={traceId} seed={seed} />
      </div>
    )
  }
  return (
    <>
      <h1>The Trace Room</h1>
      {traceId ? <p>Trace id: {traceId}</p> : null}
      <p>This page is not built yet.</p>
      <p>
        A specimen tape is on show: <TextLink to={`/trace-room/${syntheticId(7)}`}>a synthetic night, seed 7</TextLink>.
      </p>
    </>
  )
}
