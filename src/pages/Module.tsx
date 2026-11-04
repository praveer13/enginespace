import { useParams } from 'react-router'

export function Component() {
  const { module: moduleId } = useParams()
  return (
    <>
      <h1>Module</h1>
      <p>Module id: {moduleId}</p>
      <p>This page is not built yet.</p>
    </>
  )
}
