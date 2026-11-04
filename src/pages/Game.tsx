import { useParams } from 'react-router'

export function Component() {
  const { game: gameId } = useParams()
  return (
    <>
      <h1>Game</h1>
      <p>Game id: {gameId}</p>
      <p>This page is not built yet.</p>
    </>
  )
}
