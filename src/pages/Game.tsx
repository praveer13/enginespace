import { Suspense } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { NotRecorded } from '@/games/kit/NotRecorded'
import { useRecorder } from '@/games/kit/useRecorder'
import { resolveGame } from '@/games/registry'

// `/play/:game` (ARCHITECTURE §3.1): one game, at any level. The registry turns the id into the game's lazy component, so the page
// carries none of a game's code until it opens. `?level=` opens a level other than the game's first. Every run that ends is written to the
// ledger as a `play` event, the same one a lesson's game block writes for the same run (src/games/kit/record.ts, W1b-T01).
export function Component() {
  const { game: gameId = '' } = useParams()
  const [search] = useSearchParams()
  const recorder = useRecorder()
  const game = resolveGame(gameId)
  if (game.kind === 'unknown') {
    return (
      <>
        <h1>Game not found</h1>
        <p>
          No game is called &quot;{gameId}&quot;. See <Link to="/play">the games</Link>.
        </p>
      </>
    )
  }
  const Loaded = game.Component
  return (
    <>
      <h1 className="sr-only">Play {game.entry.title}</h1>
      <Suspense fallback={<p role="status">Loading {game.entry.title}…</p>}>
        <Loaded level={search.get('level') ?? undefined} onFinish={recorder.record} />
      </Suspense>
      {recorder.problem === null ? null : <NotRecorded detail={recorder.problem} />}
    </>
  )
}
