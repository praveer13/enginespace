import { useParams } from 'react-router'

// Serves both /trace-room (the list) and /trace-room/:trace (one trace).
export function Component() {
  const { trace: traceId } = useParams()
  return (
    <>
      <h1>The Trace Room</h1>
      {traceId ? <p>Trace id: {traceId}</p> : null}
      <p>This page is not built yet.</p>
    </>
  )
}
