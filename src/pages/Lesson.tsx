import { useParams } from 'react-router'

export function Component() {
  const { module: moduleId, lesson: lessonId } = useParams()
  return (
    <>
      <h1>Lesson</h1>
      <p>
        Module id: {moduleId}, lesson id: {lessonId}
      </p>
      <p>This page is not built yet.</p>
    </>
  )
}
