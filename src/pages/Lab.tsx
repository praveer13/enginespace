import { useParams } from 'react-router'

export function Component() {
  const { lab: labId } = useParams()
  return (
    <>
      <h1>Lab</h1>
      <p>Lab id: {labId}</p>
      <p>This page is not built yet.</p>
    </>
  )
}
